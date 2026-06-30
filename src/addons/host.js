/**
 * AddonHost — moteur de chargement/exécution des addons Strok (sans React).
 *
 * Un addon est un simple script (fichier « .strokaddon », c'est du JavaScript)
 * que l'utilisateur télécharge puis importe. Le script renseigne deux choses sur
 * l'objet `module` qu'on lui fournit :
 *
 *     module.manifest = { id, name, version, author, description };
 *     module.activate = function (strok) { ...; return { deactivate() {} }; };
 *
 * (Les conventions `module.exports = { manifest, activate }` et
 * `exports.activate = ...` sont aussi acceptées.)
 *
 * Exécution : le code tourne dans le renderer, qui est sandboxé (pas de Node, pas
 * d'accès fichier direct) et soumis à la CSP `default-src 'self'` (aucune
 * connexion réseau sortante possible). On l'exécute via `new Function` — d'où le
 * `'unsafe-eval'` ajouté à la CSP de prod (cf. vite.config.js). On N'UTILISE PAS
 * d'import dynamique de blob: (peu fiable sous file:// en prod).
 *
 * `activate(strok)` reçoit l'API ci-dessous (cf. _makeApi). Tout ce qu'un addon
 * enregistre (commandes, écouteurs d'événements) est pisté par addon pour pouvoir
 * être proprement retiré au déchargement / à la désactivation.
 */

import { AddonWindowManager } from './windows.js';

const HOST_VERSION = '1.1.0';
const ADDON_EXT_RE = /\.(strokaddon|mjs|js)$/i;
const EVENTS = ['strokeEnd', 'colorChange', 'toolChange'];

export class AddonHost {
  /**
   * @param {object} bridge - pont vers l'état de l'app (fourni par App.jsx) :
   *   getColor/setColor, getTool/setTool, getSize/setSize, getOpacity/setOpacity,
   *   getActiveCanvas (-> handle impératif du Canvas actif), pushToast.
   */
  constructor(bridge) {
    this.bridge = bridge;
    /** Gestionnaire des fenêtres flottantes ouvertes par les addons. */
    this.windows = new AddonWindowManager();
    /** @type {Map<string, AddonRecord>} clé = nom de fichier */
    this.records = new Map();
    /** Commandes contribuées, aplaties pour l'UI. */
    this.commands = [];
    /** Écouteurs d'événements, par type. */
    this.listeners = Object.fromEntries(EVENTS.map((e) => [e, new Set()]));
    /** Callback notifié à chaque changement de registre (branché par React). */
    this.onChange = null;
  }

  _notify() {
    if (this.onChange) this.onChange();
  }

  /** Diffuse un événement de l'app vers tous les addons abonnés. */
  emit(event, payload) {
    const set = this.listeners[event];
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        this.bridge.pushToast?.(`Addon (${event}) : ${err.message}`, 'error');
      }
    }
  }

  _rebuildCommands() {
    this.commands = [];
    for (const rec of this.records.values()) {
      if (rec.enabled && !rec.error) this.commands.push(...rec.commands);
    }
  }

  /** Construit l'objet `strok` passé à activate() d'un addon donné. */
  _makeApi(rec) {
    const bridge = this.bridge;
    const host = this;
    const ns = `strok.addon.${rec.manifest.id || rec.file}.`;

    return {
      version: HOST_VERSION,
      manifest: rec.manifest,

      // ---- État du pinceau / outil (lecture + écriture) ----
      getColor: () => bridge.getColor(),
      setColor: (hex) => bridge.setColor(String(hex)),
      getTool: () => bridge.getTool(),
      setTool: (id) => bridge.setTool(id),
      getSize: () => bridge.getSize(),
      setSize: (n) => bridge.setSize(Number(n)),
      getOpacity: () => bridge.getOpacity(),
      setOpacity: (n) => bridge.setOpacity(Number(n)),

      // ---- Calque actif ----
      // Contexte 2D du calque « main » de l'onglet actif. La transform est déjà
      // posée (setTransform(dpr,...)) : on dessine donc en px CSS doc-local.
      getContext: () => bridge.getActiveCanvas()?.getMainContext?.() ?? null,
      // { width, height (px physiques), dpr, doc:{x,y,w,h} (px CSS) }.
      getCanvasInfo: () => bridge.getActiveCanvas()?.getCanvasInfo?.() ?? null,
      // À appeler APRÈS avoir dessiné sur le contexte : valide l'édition dans
      // l'historique undo/redo.
      commit: () => bridge.getActiveCanvas()?.commit?.(),

      // ---- Contributions UI : commandes (boutons) ----
      addCommand: (cmd) => {
        if (!cmd || typeof cmd.run !== 'function') {
          throw new Error('addCommand attend { id, label, run }');
        }
        const entry = {
          key: `${rec.file}::${cmd.id || cmd.label}`,
          id: cmd.id || cmd.label,
          label: cmd.label || cmd.id || 'Commande',
          icon: cmd.icon || null,
          addon: rec.manifest.name || rec.file,
          _run: cmd.run,
        };
        rec.commands.push(entry);
        const dispose = () => {
          const i = rec.commands.indexOf(entry);
          if (i >= 0) rec.commands.splice(i, 1);
          host._rebuildCommands();
          host._notify();
        };
        rec.disposables.push(dispose);
        host._rebuildCommands();
        host._notify();
        return dispose;
      },

      // ---- Contributions UI : fenêtre flottante ----
      // Ouvre une petite fenêtre interne (déplaçable, thémée, fond optionnel) dont
      // le contenu (`handle.body`) appartient à l'addon. Les fenêtres ouvertes sont
      // pistées et fermées automatiquement au déchargement/désactivation de l'addon.
      createWindow: (winOpts) => {
        const handle = host.windows.create(winOpts || {});
        const dispose = () => handle.close();
        rec.disposables.push(dispose);
        // Quand l'utilisateur ferme lui-même la fenêtre, on retire le disposable
        // associé pour ne pas accumuler de fermetures fantômes au fil des ouvertures.
        const userClose = handle.close;
        handle.close = () => {
          const i = rec.disposables.indexOf(dispose);
          if (i >= 0) rec.disposables.splice(i, 1);
          userClose();
        };
        return handle;
      },

      // ---- Événements de l'app ----
      on: (event, handler) => {
        const set = host.listeners[event];
        if (!set) throw new Error(`Événement inconnu : ${event}`);
        if (typeof handler !== 'function') throw new Error('handler invalide');
        set.add(handler);
        const off = () => set.delete(handler);
        rec.disposables.push(off);
        return off;
      },

      // ---- Divers ----
      notify: (msg, type = 'info') => bridge.pushToast?.(String(msg), type),

      // Stockage persistant propre à l'addon (localStorage, espace de noms isolé).
      storage: {
        get: (key, fallback = null) => {
          try {
            const v = localStorage.getItem(ns + key);
            return v == null ? fallback : JSON.parse(v);
          } catch {
            return fallback;
          }
        },
        set: (key, value) => {
          try {
            localStorage.setItem(ns + key, JSON.stringify(value));
          } catch {
            /* quota plein : on ignore */
          }
        },
        remove: (key) => {
          try {
            localStorage.removeItem(ns + key);
          } catch {
            /* noop */
          }
        },
      },
    };
  }

  /**
   * Charge (ou recharge) un addon depuis son code source.
   * @param {string} file - nom de fichier (identifiant)
   * @param {string} code - code source du script
   * @param {boolean} enabled - false => enregistré mais inactif
   */
  async load(file, code, enabled) {
    // Décharge proprement une éventuelle instance précédente du même fichier.
    this.unload(file, true);

    const rec = this.records.get(file) || {
      file,
      manifest: { id: file, name: file, version: '—', author: '', description: '' },
      enabled,
      error: null,
      disposables: [],
      commands: [],
    };
    rec.enabled = enabled;
    rec.error = null;
    rec.disposables = [];
    rec.commands = [];
    this.records.set(file, rec);

    if (!enabled) {
      this._rebuildCommands();
      this._notify();
      return rec;
    }

    // 1) Exécute le script pour récupérer manifest + activate.
    let resolved;
    try {
      resolved = evalAddon(code);
    } catch (err) {
      rec.error = `Échec du chargement : ${err.message}`;
      this._rebuildCommands();
      this._notify();
      return rec;
    }

    // 2) Normalise le manifeste.
    const m = resolved.manifest || {};
    rec.manifest = {
      id: m.id || file,
      name: m.name || file.replace(ADDON_EXT_RE, ''),
      version: m.version || '—',
      author: m.author || '',
      description: m.description || '',
    };

    // 3) Appelle activate() avec l'API.
    if (typeof resolved.activate !== 'function') {
      rec.error = "L'addon n'expose pas de fonction activate(strok).";
      this._rebuildCommands();
      this._notify();
      return rec;
    }
    try {
      const api = this._makeApi(rec);
      const result = resolved.activate(api);
      if (result && typeof result.deactivate === 'function') {
        rec.disposables.push(() => {
          try {
            result.deactivate();
          } catch {
            /* noop */
          }
        });
      }
    } catch (err) {
      rec.error = `Erreur dans activate() : ${err.message}`;
    }

    this._rebuildCommands();
    this._notify();
    return rec;
  }

  /** Décharge un addon : exécute tous ses « disposables » et retire ses contributions. */
  unload(file, keepRecord = false) {
    const rec = this.records.get(file);
    if (!rec) return;
    for (const dispose of rec.disposables.splice(0)) {
      try {
        dispose();
      } catch {
        /* noop */
      }
    }
    rec.commands = [];
    if (!keepRecord) this.records.delete(file);
    this._rebuildCommands();
    this._notify();
  }

  /** Lance une commande contribuée par sa clé unique. */
  runCommand(key) {
    const cmd = this.commands.find((c) => c.key === key);
    if (!cmd) return;
    try {
      cmd._run();
    } catch (err) {
      this.bridge.pushToast?.(`« ${cmd.label} » a échoué : ${err.message}`, 'error');
    }
  }

  /** Vue sérialisable du registre, pour l'UI React. */
  list() {
    return [...this.records.values()].map((r) => ({
      file: r.file,
      manifest: r.manifest,
      enabled: r.enabled,
      error: r.error,
      commandCount: r.commands.length,
    }));
  }
}

/**
 * Exécute le code d'un addon et renvoie { manifest, activate }.
 * Convention CommonJS : le script renseigne `module`/`exports`.
 *   module.manifest = {...}; module.activate = (strok) => {...};
 * (ou bien `module.exports = { manifest, activate }`).
 */
function evalAddon(code) {
  const moduleObj = { exports: {} };
  // eslint-disable-next-line no-new-func
  const factory = new Function('module', 'exports', `"use strict";\n${code}\n`);
  factory(moduleObj, moduleObj.exports);

  const exp = moduleObj.exports;
  // Préfère module.exports s'il a été renseigné, sinon les props posées sur module.
  const src =
    exp && (typeof exp.activate === 'function' || exp.manifest) ? exp : moduleObj;

  return {
    manifest: src.manifest || moduleObj.manifest || {},
    activate:
      src.activate ||
      moduleObj.activate ||
      (typeof exp === 'function' ? exp : null),
  };
}
