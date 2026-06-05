/**
 * ThemeHost — moteur de chargement/application des thèmes Strok (sans React).
 *
 * Un thème est un fichier « .stroktheme » : du JSON purement DÉCLARATIF (aucun
 * code). Il renseigne un manifeste et une table de variables CSS :
 *
 *     {
 *       "manifest": { "id", "name", "version", "author", "description" },
 *       "variables": { "--bg-app": "#0d0d0d", "--accent": "#6d8bff", ... }
 *     }
 *
 * Appliquer un thème = poser ces variables sur :root (document.documentElement)
 * via setProperty. Comme TOUT le style de l'app est piloté par ces variables
 * (cf. styles/global.css), un seul thème suffit à repeindre l'interface entière.
 *
 * Différence majeure avec les addons : un thème n'exécute AUCUN code (pas de
 * `new Function`, pas de `'unsafe-eval'`). On ne lit que des chaînes de couleur,
 * chaque clé/valeur est validée, et seules les variables de la liste blanche
 * THEME_TOKENS (purement cosmétiques) sont appliquées — un thème ne peut donc
 * ni toucher la mise en page ni casser l'app.
 */

import { BUILTIN_THEMES, DEFAULT_THEME_ID } from './builtins.js';

export { DEFAULT_THEME_ID };

/** Variables surchargeables par un thème (liste blanche : couleurs uniquement). */
export const THEME_TOKENS = [
  '--bg-app',
  '--bg-canvas-area',
  '--bg-panel',
  '--bg-panel-2',
  '--bg-titlebar',
  '--bg-rail',
  '--surface-hover',
  '--surface-active',
  '--surface-input',
  '--border',
  '--border-soft',
  '--border-strong',
  '--text',
  '--text-dim',
  '--text-bright',
  '--icon',
  '--icon-hover',
  '--icon-active',
  '--accent',
  '--danger',
];

const TOKEN_SET = new Set(THEME_TOKENS);
const THEME_EXT_RE = /\.stroktheme$/i;
// Valeurs autorisées : couleur hex / rgb()/hsl() / mot-clé. On exclut ; { } < >
// pour rester strictement cosmétique (setProperty est déjà sûr, ceci est en plus).
const VALUE_RE = /^[#a-z0-9 .,()%/-]+$/i;

/** Ne garde que les variables de la liste blanche aux valeurs valides. */
function sanitizeVariables(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, val] of Object.entries(raw)) {
    if (!TOKEN_SET.has(key)) continue; // hors liste blanche -> ignoré
    if (typeof val !== 'string') continue;
    const v = val.trim();
    if (!v || v.length > 64 || !VALUE_RE.test(v)) continue;
    out[key] = v;
  }
  return out;
}

export class ThemeHost {
  constructor() {
    this.root =
      typeof document !== 'undefined' ? document.documentElement : null;
    /** @type {Map<string, ThemeRecord>} thèmes importés, clé = nom de fichier */
    this.records = new Map();
    /** Noms de propriétés CSS actuellement posées en inline (pour les retirer). */
    this.applied = new Set();
    /** Identifiant du thème actif (fichier ou id intégré). */
    this.activeId = DEFAULT_THEME_ID;
    /** Callback notifié à chaque changement (branché par React). */
    this.onChange = null;
  }

  _notify() {
    if (this.onChange) this.onChange();
  }

  _find(id) {
    return (
      BUILTIN_THEMES.find((t) => t.file === id) || this.records.get(id) || null
    );
  }

  /**
   * Charge (ou recharge) un thème importé depuis son texte JSON.
   * @param {string} file - nom de fichier (identifiant)
   * @param {string} jsonText - contenu du fichier .stroktheme
   */
  load(file, jsonText) {
    const rec = {
      file,
      builtin: false,
      manifest: {
        id: file,
        name: file.replace(THEME_EXT_RE, ''),
        version: '—',
        author: '',
        description: '',
      },
      variables: {},
      error: null,
    };

    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (err) {
      rec.error = `JSON invalide : ${err.message}`;
      this.records.set(file, rec);
      this._notify();
      return rec;
    }

    const m = (data && data.manifest) || {};
    rec.manifest = {
      id: m.id || file,
      name: m.name || file.replace(THEME_EXT_RE, ''),
      version: m.version || '—',
      author: m.author || '',
      description: m.description || '',
    };
    rec.variables = sanitizeVariables(data && data.variables);
    if (Object.keys(rec.variables).length === 0) {
      rec.error = 'Aucune variable de thème reconnue (cf. « variables »).';
    }

    this.records.set(file, rec);
    // Si on recharge le thème actif, on ré-applique pour refléter les changements.
    if (this.activeId === file) this.apply(file);
    else this._notify();
    return rec;
  }

  /** Retire un thème importé. S'il était actif, on revient au thème par défaut. */
  unload(file) {
    if (!this.records.has(file)) return;
    this.records.delete(file);
    if (this.activeId === file) this.apply(DEFAULT_THEME_ID);
    else this._notify();
  }

  _clearApplied() {
    if (!this.root) return;
    for (const key of this.applied) this.root.style.removeProperty(key);
    this.applied.clear();
  }

  _applyVariables(vars) {
    if (!this.root) return;
    for (const [key, value] of Object.entries(vars)) {
      this.root.style.setProperty(key, value);
      this.applied.add(key);
    }
  }

  /**
   * Applique un thème par son id. Le thème par défaut se contente de retirer
   * toute surcharge (on retombe sur les valeurs de la feuille de style).
   * @returns {string} l'id réellement appliqué (défaut si introuvable/en erreur).
   */
  apply(id) {
    let theme = this._find(id);
    if (!theme || theme.error) theme = BUILTIN_THEMES[0]; // défaut
    this._clearApplied();
    if (theme.file !== DEFAULT_THEME_ID) this._applyVariables(theme.variables);
    this.activeId = theme.file;
    this._notify();
    return theme.file;
  }

  /** Vue sérialisable du registre (intégrés + importés), pour l'UI React. */
  list() {
    const imported = [...this.records.values()];
    return [...BUILTIN_THEMES, ...imported].map((t) => ({
      file: t.file,
      builtin: !!t.builtin,
      manifest: t.manifest,
      variables: t.variables,
      error: t.error || null,
      active: t.file === this.activeId,
    }));
  }
}
