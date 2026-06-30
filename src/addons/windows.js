/**
 * AddonWindowManager — fenêtres flottantes pour les addons (sans React).
 *
 * Un addon peut ouvrir une petite fenêtre interne à l'app — à la manière du
 * popup d'aide (ShortcutsModal) — mais ENTIÈREMENT pilotée par l'addon :
 *
 *     const win = strok.createWindow({ title: 'Outil', width: 300 });
 *     win.body.innerHTML = '<button class="aw-btn" data-k="hi">Salut</button>';
 *     win.body.addEventListener('click', (e) => { ... });
 *
 * Comme les addons produisent du DOM brut (pas de React), ces fenêtres sont des
 * nœuds DOM purs ajoutés à <body>. Le « chrome » (barre de titre, bouton de
 * fermeture, déplacement, fond flouté optionnel) est fourni par l'hôte ; le
 * contenu (`win.body`) appartient à l'addon.
 *
 * Thème : la fenêtre n'utilise QUE les variables CSS de l'app (cf. global.css),
 * elle se repeint donc automatiquement avec le thème actif — exactement comme le
 * reste de l'interface.
 *
 * Sécurité / CSP : aucun code n'est évalué ici, et la CSP de prod interdit les
 * gestionnaires `onclick=` inline (script-src sans 'unsafe-inline') — un addon
 * doit donc brancher ses écouteurs via addEventListener. Les fenêtres ouvertes
 * sont pistées par addon et fermées automatiquement à sa désactivation/suppression.
 */

// z-index : au-dessus de l'app, mais SOUS les modales (200) et les toasts (300),
// pour qu'ouvrir « Extensions » recouvre proprement une fenêtre d'addon.
const Z_BASE = 150;
const DEFAULT_WIDTH = 320;
const MARGIN = 8; // marge mini conservée avec les bords de la fenêtre OS

// Petite croix (style lucide) pour le bouton de fermeture. innerHTML SVG est
// autorisé par la CSP (seuls les scripts inline sont bloqués, pas le balisage).
const CLOSE_SVG =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
  '<path d="M18 6 6 18M6 6l12 12"/></svg>';

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export class AddonWindowManager {
  constructor() {
    /** @type {Set<object>} fenêtres actuellement ouvertes (handles) */
    this.windows = new Set();
    /** z-index de la fenêtre la plus haute (incrémenté à chaque mise au premier plan) */
    this._topZ = Z_BASE;
  }

  /** Passe une fenêtre au premier plan (parmi les fenêtres d'addon). */
  _raise(el) {
    this._topZ += 1;
    el.style.zIndex = String(this._topZ);
  }

  /**
   * Ouvre une fenêtre flottante.
   * @param {object} opts
   *   title      {string}                 titre de la barre (défaut : 'Addon')
   *   width      {number}                 largeur en px (défaut : 320)
   *   height     {number}                 hauteur en px (défaut : auto / contenu)
   *   x, y       {number}                 position initiale en px (défaut : centrée)
   *   draggable  {boolean}                déplaçable par la barre de titre (défaut : true)
   *   resizable  {boolean}                poignée de redimensionnement (défaut : false)
   *   backdrop   {false|'dim'|'blur'|true} fond derrière la fenêtre (défaut : false).
   *                                        'dim' = assombri, 'blur'/true = flou ;
   *                                        un clic dessus ferme la fenêtre.
   *   closable   {boolean}                bouton de fermeture + Échap (défaut : true)
   *   className  {string}                 classe CSS additionnelle (style addon)
   *   onClose    {function}               appelé après fermeture
   * @returns handle { el, body, setTitle, setSize, move, focus, isOpen, close }
   */
  create(opts = {}) {
    const {
      title = 'Addon',
      width = DEFAULT_WIDTH,
      height = null,
      x = null,
      y = null,
      draggable = true,
      resizable = false,
      backdrop = false,
      closable = true,
      className = '',
      onClose = null,
    } = opts || {};

    // --- Fond optionnel (derrière la fenêtre) ---
    let backdropEl = null;
    if (backdrop) {
      backdropEl = document.createElement('div');
      backdropEl.className =
        'addon-window__backdrop' +
        (backdrop === 'dim' ? '' : ' addon-window__backdrop--blur');
      backdropEl.style.zIndex = String(Z_BASE - 1);
      document.body.appendChild(backdropEl);
    }

    // --- Fenêtre ---
    const el = document.createElement('div');
    el.className = 'addon-window' + (className ? ` ${className}` : '');
    el.style.width = `${Math.max(160, width)}px`;
    if (height) el.style.height = `${Math.max(120, height)}px`;

    const head = document.createElement('div');
    head.className =
      'addon-window__head' + (draggable ? '' : ' addon-window__head--static');

    const titleEl = document.createElement('div');
    titleEl.className = 'addon-window__title';
    titleEl.textContent = title;
    head.appendChild(titleEl);

    let closeBtn = null;
    if (closable) {
      closeBtn = document.createElement('button');
      closeBtn.className = 'addon-window__close';
      closeBtn.setAttribute('aria-label', 'Fermer');
      closeBtn.innerHTML = CLOSE_SVG;
      head.appendChild(closeBtn);
    }

    const body = document.createElement('div');
    body.className = 'addon-window__body';

    el.appendChild(head);
    el.appendChild(body);

    let resizeHandle = null;
    if (resizable) {
      resizeHandle = document.createElement('div');
      resizeHandle.className = 'addon-window__resize';
      el.appendChild(resizeHandle);
    }

    document.body.appendChild(el);

    // --- Position initiale (centrée par défaut, avec léger décalage en cascade) ---
    const rect = el.getBoundingClientRect();
    const cascade = this.windows.size * 26;
    let px = x == null ? (window.innerWidth - rect.width) / 2 + cascade : x;
    let py = y == null ? (window.innerHeight - rect.height) / 3 + cascade : y;
    px = clamp(px, MARGIN, window.innerWidth - rect.width - MARGIN);
    py = clamp(py, MARGIN, window.innerHeight - rect.height - MARGIN);
    el.style.left = `${Math.round(px)}px`;
    el.style.top = `${Math.round(py)}px`;
    this._raise(el);

    // ───────────────── handle (API rendue à l'addon) ─────────────────
    let open = true;
    const listeners = []; // [target, type, fn] à retirer à la fermeture

    const addListener = (target, type, fn, options) => {
      target.addEventListener(type, fn, options);
      listeners.push([target, type, fn, options]);
    };

    const close = () => {
      if (!open) return; // idempotent
      open = false;
      for (const [t, ty, fn, o] of listeners) t.removeEventListener(ty, fn, o);
      el.remove();
      backdropEl?.remove();
      this.windows.delete(handle);
      try {
        onClose?.();
      } catch {
        /* l'addon a planté dans onClose : on ignore, la fenêtre est fermée */
      }
    };

    const handle = {
      el,
      body,
      isOpen: () => open,
      close,
      focus: () => this._raise(el),
      setTitle: (t) => {
        titleEl.textContent = String(t);
      },
      setSize: (w, h) => {
        if (w) el.style.width = `${Math.max(160, w)}px`;
        if (h) el.style.height = `${Math.max(120, h)}px`;
      },
      move: (nx, ny) => {
        const r = el.getBoundingClientRect();
        el.style.left = `${clamp(nx, MARGIN, window.innerWidth - r.width - MARGIN)}px`;
        el.style.top = `${clamp(ny, MARGIN, window.innerHeight - r.height - MARGIN)}px`;
      },
    };

    // --- Fermeture (bouton, fond cliqué, Échap si fenêtre modale) ---
    // On passe par `handle.close()` (lié tardivement) : si l'hôte a enveloppé la
    // fermeture (pour son nettoyage), c'est bien sa version qui est appelée.
    if (closeBtn) addListener(closeBtn, 'click', () => handle.close());
    if (backdropEl) addListener(backdropEl, 'pointerdown', () => handle.close());
    if (closable && backdrop) {
      // Échap ne ferme QUE les fenêtres « modales » (avec fond) : une fenêtre-outil
      // flottante (calculatrice…) ne doit pas se fermer pendant qu'on dessine.
      addListener(
        window,
        'keydown',
        (e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            handle.close();
          }
        },
        true
      );
    }

    // Toute interaction passe la fenêtre au premier plan.
    addListener(el, 'pointerdown', () => this._raise(el));

    // --- Déplacement par la barre de titre ---
    if (draggable) {
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let originX = 0;
      let originY = 0;

      const onMove = (e) => {
        if (!dragging) return;
        const r = el.getBoundingClientRect();
        const nx = clamp(
          originX + (e.clientX - startX),
          MARGIN,
          window.innerWidth - r.width - MARGIN
        );
        const ny = clamp(
          originY + (e.clientY - startY),
          MARGIN,
          window.innerHeight - r.height - MARGIN
        );
        el.style.left = `${Math.round(nx)}px`;
        el.style.top = `${Math.round(ny)}px`;
      };
      const onUp = () => {
        dragging = false;
        el.classList.remove('is-dragging');
      };
      addListener(head, 'pointerdown', (e) => {
        if (closeBtn && closeBtn.contains(e.target)) return; // pas sur la croix
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const r = el.getBoundingClientRect();
        originX = r.left;
        originY = r.top;
        el.classList.add('is-dragging');
        try {
          head.setPointerCapture(e.pointerId);
        } catch {
          /* certains environnements ne supportent pas la capture : sans gravité */
        }
      });
      addListener(head, 'pointermove', onMove);
      addListener(head, 'pointerup', onUp);
      addListener(head, 'lostpointercapture', onUp);
    }

    // --- Redimensionnement (poignée coin bas-droit) ---
    if (resizable && resizeHandle) {
      let sizing = false;
      let sx = 0;
      let sy = 0;
      let sw = 0;
      let sh = 0;
      addListener(resizeHandle, 'pointerdown', (e) => {
        sizing = true;
        sx = e.clientX;
        sy = e.clientY;
        const r = el.getBoundingClientRect();
        sw = r.width;
        sh = r.height;
        e.stopPropagation();
        try {
          resizeHandle.setPointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      });
      addListener(resizeHandle, 'pointermove', (e) => {
        if (!sizing) return;
        el.style.width = `${Math.max(160, sw + (e.clientX - sx))}px`;
        el.style.height = `${Math.max(120, sh + (e.clientY - sy))}px`;
      });
      addListener(resizeHandle, 'pointerup', () => {
        sizing = false;
      });
    }

    // Re-cadre la fenêtre si la fenêtre OS rétrécit (anti hors-écran).
    addListener(window, 'resize', () => {
      const r = el.getBoundingClientRect();
      handle.move(r.left, r.top);
    });

    this.windows.add(handle);
    return handle;
  }

  /** Ferme toutes les fenêtres ouvertes (au besoin). */
  closeAll() {
    for (const w of [...this.windows]) w.close();
  }
}
