import { useCallback, useRef, useState } from 'react';

/**
 * useHistory — pile undo/redo basée sur des snapshots ImageData du canvas.
 *
 * Prêt pour la Phase 4 (Ctrl+Z / Ctrl+Y, historique 50 étapes). Non câblé à
 * l'UI dans cette session, mais l'API est stable :
 *   - push(canvas)   : enregistre l'état courant
 *   - undo(canvas)   : revient à l'état précédent (restitue sur le canvas)
 *   - redo(canvas)   : rétablit
 *   - reset(canvas)  : repart d'un état propre
 */
const MAX_STEPS = 50;

export default function useHistory() {
  const stack = useRef([]);
  const index = useRef(-1);
  const [meta, setMeta] = useState({ canUndo: false, canRedo: false });

  const sync = () => {
    setMeta({
      canUndo: index.current > 0,
      canRedo: index.current < stack.current.length - 1,
    });
  };

  const snapshot = (canvas) => {
    const ctx = canvas.getContext('2d');
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  };

  const restore = (canvas, image) => {
    if (!image) return;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(image, 0, 0);
    ctx.restore();
  };

  const push = useCallback((canvas) => {
    if (!canvas) return;
    // Tronque la branche "redo" puis empile.
    stack.current = stack.current.slice(0, index.current + 1);
    stack.current.push(snapshot(canvas));
    if (stack.current.length > MAX_STEPS) stack.current.shift();
    index.current = stack.current.length - 1;
    sync();
  }, []);

  const undo = useCallback((canvas) => {
    if (index.current <= 0) return;
    index.current -= 1;
    restore(canvas, stack.current[index.current]);
    sync();
  }, []);

  const redo = useCallback((canvas) => {
    if (index.current >= stack.current.length - 1) return;
    index.current += 1;
    restore(canvas, stack.current[index.current]);
    sync();
  }, []);

  const reset = useCallback((canvas) => {
    stack.current = [];
    index.current = -1;
    if (canvas) push(canvas);
  }, [push]);

  return { push, undo, redo, reset, ...meta };
}
