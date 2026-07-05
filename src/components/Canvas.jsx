import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import useCanvas from '../hooks/useCanvas.js';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const clampZoom = (z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

// Bornes de taille du pinceau/gomme (alignées sur le slider de la Toolbar).
const MIN_SIZE = 1;
const MAX_SIZE = 100;
const clampSize = (s) => Math.max(MIN_SIZE, Math.min(MAX_SIZE, s));

function Canvas(
  {
    id,
    active,
    tool,
    color,
    size,
    opacity,
    darkCanvas,
    zoom,
    panX,
    panY,
    onViewChange, // (id, partial) — callback stable fourni par App
    onSizeChange,
    onStroke, // (id) — callback stable fourni par App
    clearSignal,
  },
  ref
) {
  const {
    wrapRef,
    mainRef,
    overlayRef,
    handlers,
    clear,
    undo,
    redo,
    getProject,
    getProjectAsync,
    loadProject,
    exportImage,
    getMainContext,
    getCanvasInfo,
    commit,
    getContentVersion,
    isDrawing,
  } = useCanvas({
    tool,
    color,
    size,
    opacity,
    zoom,
    panX,
    panY,
    onStroke: () => onStroke(id),
  });

  const cursorRef = useRef(null);

  // Méthodes impératives exposées à App (fichiers, historique, accès addons).
  useImperativeHandle(
    ref,
    () => ({
      getProject,
      getProjectAsync,
      loadProject,
      exportImage,
      clear,
      undo,
      redo,
      getMainContext,
      getCanvasInfo,
      commit,
      getContentVersion,
      isDrawing,
    }),
    [
      getProject,
      getProjectAsync,
      loadProject,
      exportImage,
      clear,
      undo,
      redo,
      getMainContext,
      getCanvasInfo,
      commit,
      getContentVersion,
      isDrawing,
    ]
  );

  // Refs « live » pour les handlers liés une seule fois (molette, rAF).
  const zoomRef = useRef(zoom);
  const panRef = useRef({ x: panX, y: panY });
  const viewChangeRef = useRef(onViewChange);
  const sizeRef = useRef(size);
  const sizeChangeRef = useRef(onSizeChange);
  zoomRef.current = zoom;
  panRef.current = { x: panX, y: panY };
  viewChangeRef.current = onViewChange;
  sizeRef.current = size;
  sizeChangeRef.current = onSizeChange;

  // --- Coalescence des changements de vue sur un frame ---
  // Molette et pan peuvent émettre bien plus de 60 événements/s (souris gaming,
  // tablette) : chaque setState re-rend l'app entière. On accumule donc les
  // changements et on n'en émet qu'un par frame d'affichage — visuellement
  // identique (l'écran ne rafraîchit pas plus vite), mais sans re-rendus perdus.
  const pendingView = useRef(null);
  const viewRaf = useRef(0);
  const queueViewChange = (partial) => {
    pendingView.current = { ...pendingView.current, ...partial };
    if (viewRaf.current) return;
    viewRaf.current = requestAnimationFrame(() => {
      viewRaf.current = 0;
      const v = pendingView.current;
      pendingView.current = null;
      if (v) viewChangeRef.current(id, v);
    });
  };
  // Vue « effective » : l'état courant + les changements en attente d'émission.
  const currentView = () => {
    const p = pendingView.current;
    return {
      zoom: p?.zoom ?? zoomRef.current,
      panX: p?.panX ?? panRef.current.x,
      panY: p?.panY ?? panRef.current.y,
    };
  };
  useEffect(
    () => () => {
      if (viewRaf.current) cancelAnimationFrame(viewRaf.current);
    },
    []
  );

  // --- Cache du bounding rect du stage ---
  // getBoundingClientRect force un reflow ; le rect du stage ne change qu'au
  // resize de la fenêtre, inutile de le recalculer à chaque pointermove.
  const stageRectRef = useRef(null);
  const getStageRect = () => {
    if (!stageRectRef.current) {
      stageRectRef.current = wrapRef.current?.getBoundingClientRect() ?? null;
    }
    return stageRectRef.current;
  };
  useEffect(() => {
    const invalidate = () => {
      stageRectRef.current = null;
    };
    window.addEventListener('resize', invalidate);
    return () => window.removeEventListener('resize', invalidate);
  }, []);

  // Effacement réservé à l'onglet actif.
  useEffect(() => {
    if (active && clearSignal > 0) clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSignal]);

  // Molette simple => zoom (vers le curseur) ; Ctrl+molette => taille du
  // pinceau/gomme. Les deux sont volontairement séparés pour ne pas se gêner.
  useEffect(() => {
    const stage = wrapRef.current;
    if (!stage) return;

    const onWheel = (e) => {
      e.preventDefault();

      // Ctrl+molette : ajuste la taille du pinceau/gomme (pas de zoom).
      if (e.ctrlKey || e.metaKey) {
        const cur = sizeRef.current;
        const dir = e.deltaY < 0 ? 1 : -1; // molette vers le haut => plus gros
        const step = Math.max(1, Math.round(cur * 0.15)); // pas adaptatif
        const next = clampSize(cur + dir * step);
        if (next !== cur) sizeChangeRef.current?.(next);
        return;
      }

      // Molette simple : zoom centré sur le curseur. On part de la vue
      // effective (changements en attente inclus) pour ne perdre aucun cran.
      const { zoom: z1, panX: px, panY: py } = currentView();
      const rect = getStageRect();
      if (!rect) return;
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const z2 = clampZoom(z1 * Math.exp(-e.deltaY * 0.0015));
      if (z2 === z1) return;
      const k = z2 / z1;
      queueViewChange({
        zoom: z2,
        panX: cx - (cx - px) * k,
        panY: cy - (cy - py) * k,
      });
    };

    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrapRef]);

  // --- Pan par glisser au clic-molette (bouton du milieu) ---
  const panning = useRef(null);
  const onStagePointerDownCapture = (e) => {
    if (e.button !== 1) return; // bouton du milieu uniquement
    e.preventDefault();
    const v = currentView();
    panning.current = { cx: e.clientX, cy: e.clientY, panX: v.panX, panY: v.panY };
    stageCursor(true);
    try {
      wrapRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };
  const endPan = (e) => {
    if (!panning.current) return;
    panning.current = null;
    stageCursor(false);
    try {
      wrapRef.current.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };
  const stageCursor = (grabbing) => {
    const s = wrapRef.current;
    if (s) s.classList.toggle('is-panning', grabbing);
  };

  // Anneau de curseur (hors viewport => bordure nette), taille = pinceau * zoom.
  const moveCursor = (e) => {
    const stage = wrapRef.current;
    if (!stage) return;
    if (panning.current) {
      const p = panning.current;
      queueViewChange({
        panX: p.panX + (e.clientX - p.cx),
        panY: p.panY + (e.clientY - p.cy),
      });
      return;
    }
    const el = cursorRef.current;
    if (!el) return;
    const r = getStageRect();
    if (!r) return;
    el.style.transform = `translate(${e.clientX - r.left}px, ${
      e.clientY - r.top
    }px)`;
  };
  const showCursor = () => {
    stageRectRef.current = null; // la fenêtre a pu bouger : rafraîchit le cache
    if (cursorRef.current) cursorRef.current.style.opacity = '1';
  };
  const hideCursor = () => cursorRef.current && (cursorRef.current.style.opacity = '0');

  // Zoom via boutons : autour du centre de la vue.
  const zoomBy = (factor) => {
    const rect = getStageRect();
    if (!rect) return;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const z2 = clampZoom(zoom * factor);
    if (z2 === zoom) return;
    const k = z2 / zoom;
    onViewChange(id, { zoom: z2, panX: cx - (cx - panX) * k, panY: cy - (cy - panY) * k });
  };
  const resetView = () => onViewChange(id, { zoom: 1, panX: 0, panY: 0 });

  const ringSize = size * zoom;

  return (
    <div className={`canvas-area${active ? '' : ' is-hidden'}`}>
      <div
        className={`canvas-stage${darkCanvas ? ' is-dark' : ''}`}
        ref={wrapRef}
        onPointerDownCapture={onStagePointerDownCapture}
        onPointerMove={moveCursor}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onPointerEnter={showCursor}
        onPointerLeave={hideCursor}
      >
        <div
          className="canvas-viewport"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          }}
        >
          <canvas ref={mainRef} className="canvas-layer canvas-main" />
          <canvas
            ref={overlayRef}
            className="canvas-layer canvas-overlay"
            {...handlers}
          />
        </div>

        <div
          ref={cursorRef}
          className="brush-cursor"
          style={{
            width: `${ringSize}px`,
            height: `${ringSize}px`,
            marginLeft: `${-ringSize / 2}px`,
            marginTop: `${-ringSize / 2}px`,
            borderColor: darkCanvas ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)',
            boxShadow: darkCanvas
              ? '0 0 0 1px rgba(0,0,0,0.5)'
              : '0 0 0 1px rgba(255,255,255,0.65)',
          }}
        />
      </div>

      <div className="zoombar">
        <button className="zoombar__btn" onClick={() => zoomBy(0.8)} aria-label="Dézoomer">
          <Minus size={15} strokeWidth={2} />
        </button>
        <button className="zoombar__label" onClick={resetView} title="Recentrer la vue">
          {Math.round(zoom * 100)}%
        </button>
        <button className="zoombar__btn" onClick={() => zoomBy(1.25)} aria-label="Zoomer">
          <Plus size={15} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export default memo(forwardRef(Canvas));
