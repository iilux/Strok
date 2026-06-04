import { useCallback, useEffect, useRef } from 'react';

/**
 * useCanvas — logique de dessin bas niveau, sur une TOILE INFINIE.
 *
 * Deux canvases empilés :
 *   - main    : les traits validés
 *   - overlay : le trait en cours, dessiné à pleine opacité puis aplati sur
 *               `main` au relâchement avec l'opacité choisie. Cela garantit une
 *               opacité UNIFORME sur tout le trait (pas d'accumulation sombre
 *               aux recouvrements de segments).
 *
 * Toile infinie : les canvases ne sont PAS collés au viewport. Ils forment un
 * « document » positionné en coordonnées-monde dans `.canvas-viewport`
 * (lui-même translaté/zoomé par CSS). Le document s'agrandit à la volée
 * (`ensureCovers`) quand on commence un trait dans une zone non encore
 * couverte : la mémoire est proportionnelle à la zone réellement parcourue,
 * pas au pan. Le pan/zoom restent gérés par le transform CSS (fluide, gratuit).
 *
 * Crayon  -> dessine sur overlay (source-over), commit sur main.
 * Gomme   -> dessine directement sur main (destination-out) -> révèle le papier.
 *
 * Lissage par courbes quadratiques entre points-milieux + events coalescés
 * (getCoalescedEvents) pour capter tous les points intermédiaires.
 */

// Marge (px monde) ajoutée autour de la zone visible lors d'un agrandissement,
// pour éviter de réallouer le document à chaque trait quand on reste au même endroit.
const GROW_MARGIN = 600;

// Profondeur de l'historique undo/redo. Chaque étape conserve une copie bitmap
// du calque `main` + sa géométrie `docRect` (la toile infinie change de taille,
// on ne peut donc PAS se contenter d'un ImageData posé en (0,0)).
const HISTORY_LIMIT = 40;

export default function useCanvas({
  tool,
  color,
  size,
  opacity,
  zoom = 1,
  panX = 0,
  panY = 0,
  onStroke,
}) {
  const wrapRef = useRef(null);
  const mainRef = useRef(null);
  const overlayRef = useRef(null);

  // Réglages live, lus au début de chaque trait sans rebinder les handlers.
  const settings = useRef({ tool, color, size, opacity, zoom, panX, panY });
  settings.current = { tool, color, size, opacity, zoom, panX, panY };

  // Rectangle du document en coordonnées-monde (px CSS, pré-transform).
  // origine (x, y) + taille (w, h) ; dpr = densité au moment de l'allocation.
  const docRect = useRef({ x: 0, y: 0, w: 0, h: 0, dpr: 1 });

  // Historique undo/redo (par instance de canvas, donc par onglet).
  // stack : [{ rect:{x,y,w,h,dpr}, snap:<canvas offscreen> }, ...]
  const history = useRef({ stack: [], index: -1 });

  const drawing = useRef(false);
  const rect = useRef(null); // bounding rect ÉCRAN de l'overlay (capturé au pointerdown)
  const last = useRef(null);
  const lastMid = useRef(null);
  const strokeCtx = useRef(null);
  const strokeTool = useRef('pencil');
  const strokeBox = useRef(null); // bbox du trait (px doc-local) pour le commit partiel

  /* ---- Mise en page CSS des canvases dans l'espace-monde ---- */
  const applyDocLayout = () => {
    const { x, y, w, h } = docRect.current;
    for (const c of [mainRef.current, overlayRef.current]) {
      if (!c) continue;
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
  };

  // (Ré)alloue le document à `target` (rect monde), en préservant les pixels de main.
  const allocDoc = (target) => {
    const main = mainRef.current;
    const overlay = overlayRef.current;
    if (!main || !overlay) return;

    const dpr = window.devicePixelRatio || 1;
    const cur = docRect.current;

    // Snapshot du contenu existant pour le replacer au bon décalage.
    let snap = null;
    if (main.width && main.height && cur.w && cur.h) {
      snap = document.createElement('canvas');
      snap.width = main.width;
      snap.height = main.height;
      snap.getContext('2d').drawImage(main, 0, 0);
    }
    const ox = Math.round((cur.x - target.x) * dpr);
    const oy = Math.round((cur.y - target.y) * dpr);

    for (const c of [main, overlay]) {
      c.width = Math.max(1, Math.round(target.w * dpr));
      c.height = Math.max(1, Math.round(target.h * dpr));
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    if (snap) {
      const mctx = main.getContext('2d');
      mctx.save();
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.drawImage(snap, ox, oy);
      mctx.restore();
    }

    docRect.current = { x: target.x, y: target.y, w: target.w, h: target.h, dpr };
    applyDocLayout();
  };

  // Alloue un document de la taille du viewport si rien n'existe encore.
  const ensureInit = useCallback(() => {
    const stage = wrapRef.current;
    if (!stage) return;
    const cur = docRect.current;
    if (cur.w && cur.h) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    allocDoc({ x: 0, y: 0, w, h });
    // Baseline d'historique : permet d'annuler le tout premier trait (retour
    // au calque vierge). Posée une seule fois, tant que l'histo est vide.
    if (history.current.stack.length === 0) pushHistory();
  }, []);

  // Garantit que le document couvre `r` (rect monde) ; agrandit au besoin (+marge).
  const ensureCovers = (r) => {
    const cur = docRect.current;
    if (!cur.w || !cur.h) {
      allocDoc({
        x: Math.floor(r.x - GROW_MARGIN),
        y: Math.floor(r.y - GROW_MARGIN),
        w: Math.ceil(r.w + GROW_MARGIN * 2),
        h: Math.ceil(r.h + GROW_MARGIN * 2),
      });
      return;
    }
    const nx = Math.min(cur.x, Math.floor(r.x - GROW_MARGIN));
    const ny = Math.min(cur.y, Math.floor(r.y - GROW_MARGIN));
    const nr = Math.max(cur.x + cur.w, Math.ceil(r.x + r.w + GROW_MARGIN));
    const nb = Math.max(cur.y + cur.h, Math.ceil(r.y + r.h + GROW_MARGIN));
    if (nx === cur.x && ny === cur.y && nr === cur.x + cur.w && nb === cur.y + cur.h) {
      return; // déjà couvert
    }
    allocDoc({ x: nx, y: ny, w: nr - nx, h: nb - ny });
  };

  // Rect monde actuellement visible dans le stage (selon pan/zoom courants).
  const visibleWorldRect = () => {
    const stage = wrapRef.current;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const { panX: px, panY: py, zoom: z } = settings.current;
    const zz = z || 1;
    return {
      x: (0 - px) / zz,
      y: (0 - py) / zz,
      w: sw / zz,
      h: sh / zz,
    };
  };

  /* ---- Init + observation de la taille du stage ---- */
  useEffect(() => {
    ensureInit();
    const wrap = wrapRef.current;
    if (!wrap) return;
    // Le document est en espace-monde : un resize de fenêtre ne le réalloue PAS,
    // il sert seulement à l'allocation initiale tant que rien n'existe.
    const ro = new ResizeObserver(() => ensureInit());
    ro.observe(wrap);
    window.addEventListener('resize', ensureInit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', ensureInit);
    };
  }, [ensureInit]);

  /* ---- Helpers ---- */
  // rect (capturé au pointerdown) est le bounding rect ÉCRAN de l'overlay, qui
  // reflète déjà pan+zoom et la position-monde du document ; diviser par le zoom
  // donne directement les coordonnées doc-local (px CSS).
  const point = (ev) => {
    const z = settings.current.zoom || 1;
    return {
      x: (ev.clientX - rect.current.left) / z,
      y: (ev.clientY - rect.current.top) / z,
    };
  };

  const growBox = (p) => {
    const b = strokeBox.current;
    if (!b) return;
    if (p.x < b.minX) b.minX = p.x;
    if (p.y < b.minY) b.minY = p.y;
    if (p.x > b.maxX) b.maxX = p.x;
    if (p.y > b.maxY) b.maxY = p.y;
  };

  const configure = (ctx, s) => {
    if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = s.opacity;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1; // opacité appliquée au moment du commit
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
    }
    ctx.lineWidth = s.size;
  };

  const drawSegment = (ctx, p) => {
    const l = last.current;
    const m = lastMid.current;
    const mid = { x: (l.x + p.x) / 2, y: (l.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.quadraticCurveTo(l.x, l.y, mid.x, mid.y);
    ctx.stroke();
    last.current = p;
    lastMid.current = mid;
    growBox(p);
  };

  const clearOverlay = () => {
    const overlay = overlayRef.current;
    const ctx = overlay.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.restore();
  };

  /* ---- Historique undo/redo ---- */
  // Copie l'état courant de `main` (pixels + géométrie) dans une étape d'histo.
  const snapshotMain = () => {
    const main = mainRef.current;
    if (!main || !main.width || !main.height) return null;
    const snap = document.createElement('canvas');
    snap.width = main.width;
    snap.height = main.height;
    snap.getContext('2d').drawImage(main, 0, 0);
    return { rect: { ...docRect.current }, snap };
  };

  // Empile l'état courant ; tronque la branche redo, plafonne la profondeur.
  const pushHistory = () => {
    const entry = snapshotMain();
    if (!entry) return;
    const h = history.current;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(entry);
    if (h.stack.length > HISTORY_LIMIT) h.stack.shift();
    h.index = h.stack.length - 1;
  };

  // Réinitialise l'historique sur l'état courant (après load / clear).
  const resetHistory = () => {
    history.current = { stack: [], index: -1 };
    pushHistory();
  };

  // Restaure une étape : remet la géométrie ET les pixels (la toile infinie
  // peut avoir changé de dimensions entre deux étapes).
  const restoreHistory = (entry) => {
    const main = mainRef.current;
    const overlay = overlayRef.current;
    if (!main || !overlay || !entry) return;
    const r = entry.rect;
    docRect.current = { ...r };
    for (const c of [main, overlay]) {
      c.width = entry.snap.width;
      c.height = entry.snap.height;
      const ctx = c.getContext('2d');
      ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    const mctx = main.getContext('2d');
    mctx.save();
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, main.width, main.height);
    mctx.drawImage(entry.snap, 0, 0);
    mctx.restore();
    clearOverlay();
    applyDocLayout();
  };

  /* ---- Handlers pointeur ---- */
  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const overlay = overlayRef.current;
    const main = mainRef.current;
    if (!overlay || !main) return;

    // Agrandit le document pour couvrir la zone visible AVANT de tracer
    // (jamais de réallocation en cours de trait).
    ensureInit();
    ensureCovers(visibleWorldRect());

    const s = settings.current;
    drawing.current = true;
    strokeTool.current = s.tool;
    rect.current = overlay.getBoundingClientRect(); // après l'éventuel agrandissement
    overlay.setPointerCapture(e.pointerId);

    const ctx =
      s.tool === 'eraser' ? main.getContext('2d') : overlay.getContext('2d');
    strokeCtx.current = ctx;
    configure(ctx, s);

    // Aperçu fidèle de l'opacité du crayon pendant le tracé.
    overlay.style.opacity = s.tool === 'eraser' ? '1' : String(s.opacity);

    const p = point(e.nativeEvent);
    last.current = p;
    lastMid.current = p;
    strokeBox.current = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };

    // Point initial : un simple clic laisse une marque.
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(ctx.lineWidth / 2, 0.4), 0, Math.PI * 2);
    ctx.fill();
  };

  const onPointerMove = (e) => {
    if (!drawing.current) return;
    const ctx = strokeCtx.current;
    const ne = e.nativeEvent;
    const evs =
      typeof ne.getCoalescedEvents === 'function'
        ? ne.getCoalescedEvents()
        : null;
    if (evs && evs.length) {
      for (const ev of evs) drawSegment(ctx, point(ev));
    } else {
      drawSegment(ctx, point(ne));
    }
  };

  const endStroke = (e) => {
    if (!drawing.current) return;
    drawing.current = false;

    const overlay = overlayRef.current;
    const main = mainRef.current;
    try {
      overlay.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }

    if (strokeTool.current === 'eraser') {
      const mctx = main.getContext('2d');
      mctx.globalCompositeOperation = 'source-over';
      mctx.globalAlpha = 1;
    } else {
      // Aplatit l'overlay sur main avec l'opacité voulue (uniforme), en ne
      // copiant que la zone réellement touchée par le trait (commit partiel).
      const dpr = docRect.current.dpr || 1;
      const pad = settings.current.size / 2 + 2;
      const b = strokeBox.current;
      let dx = Math.floor((b.minX - pad) * dpr);
      let dy = Math.floor((b.minY - pad) * dpr);
      let dw = Math.ceil((b.maxX + pad) * dpr) - dx;
      let dh = Math.ceil((b.maxY + pad) * dpr) - dy;
      // Clamp aux bornes du buffer.
      if (dx < 0) {
        dw += dx;
        dx = 0;
      }
      if (dy < 0) {
        dh += dy;
        dy = 0;
      }
      dw = Math.min(main.width - dx, dw);
      dh = Math.min(main.height - dy, dh);

      if (dw > 0 && dh > 0) {
        const mctx = main.getContext('2d');
        mctx.save();
        mctx.setTransform(1, 0, 0, 1, 0, 0);
        mctx.globalCompositeOperation = 'source-over';
        mctx.globalAlpha = settings.current.opacity;
        mctx.drawImage(overlay, dx, dy, dw, dh, dx, dy, dw, dh);
        mctx.restore();

        const octx = overlay.getContext('2d');
        octx.save();
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.clearRect(dx, dy, dw, dh);
        octx.restore();
      }
      overlay.style.opacity = '1';
    }

    strokeCtx.current = null;
    pushHistory(); // le trait validé devient une étape annulable
    if (onStroke) onStroke();
  };

  /* ---- Effacer tout (réinitialise aussi le document à la taille du viewport) ---- */
  const clear = useCallback(() => {
    docRect.current = { x: 0, y: 0, w: 0, h: 0, dpr: 1 };
    history.current = { stack: [], index: -1 }; // ensureInit reposera la baseline
    ensureInit();
  }, [ensureInit]);

  /* ---- Sérialisation projet (.strok) ---- */
  const getProject = useCallback(() => {
    ensureInit();
    const main = mainRef.current;
    const r = docRect.current;
    return {
      doc: {
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        dpr: r.dpr || window.devicePixelRatio || 1,
      },
      image: main.toDataURL('image/png'),
    };
  }, [ensureInit]);

  const loadProject = useCallback(
    ({ doc, image }) =>
      new Promise((resolve) => {
        const main = mainRef.current;
        const overlay = overlayRef.current;
        if (!main || !overlay || !doc) {
          resolve();
          return;
        }
        const dpr = doc.dpr || window.devicePixelRatio || 1;
        const finish = (img) => {
          docRect.current = { x: doc.x, y: doc.y, w: doc.w, h: doc.h, dpr };
          for (const c of [main, overlay]) {
            c.width = Math.max(1, Math.round(doc.w * dpr));
            c.height = Math.max(1, Math.round(doc.h * dpr));
            const ctx = c.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
          }
          const mctx = main.getContext('2d');
          mctx.save();
          mctx.setTransform(1, 0, 0, 1, 0, 0);
          mctx.clearRect(0, 0, main.width, main.height);
          if (img) mctx.drawImage(img, 0, 0);
          mctx.restore();
          clearOverlay();
          applyDocLayout();
          resetHistory(); // l'état chargé devient la nouvelle baseline
          resolve();
        };
        if (!image) {
          finish(null);
          return;
        }
        const img = new Image();
        img.onload = () => finish(img);
        img.onerror = () => finish(null);
        img.src = image;
      }),
    []
  );

  // Image PNG aplatie, posée sur le papier (clair ou sombre) — pas de transparence.
  const exportImage = useCallback(
    (darkCanvas) => {
      ensureInit();
      const main = mainRef.current;
      const out = document.createElement('canvas');
      out.width = main.width;
      out.height = main.height;
      const ctx = out.getContext('2d');
      ctx.fillStyle = darkCanvas ? '#1e1e1e' : '#ffffff';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(main, 0, 0);
      return out.toDataURL('image/png');
    },
    [ensureInit]
  );

  /* ---- Undo / Redo ---- */
  const undo = useCallback(() => {
    const h = history.current;
    if (h.index <= 0) return;
    h.index -= 1;
    restoreHistory(h.stack[h.index]);
  }, []);

  const redo = useCallback(() => {
    const h = history.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    restoreHistory(h.stack[h.index]);
  }, []);

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endStroke,
    onPointerCancel: endStroke,
  };

  return {
    wrapRef,
    mainRef,
    overlayRef,
    handlers,
    clear,
    undo,
    redo,
    getProject,
    loadProject,
    exportImage,
  };
}
