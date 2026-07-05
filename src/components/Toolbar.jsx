import { memo, useRef } from 'react';

/* Slider entièrement custom (pas d'input range natif). */
function Slider({ value, min, max, step = 1, onChange }) {
  const ref = useRef(null);
  const dragging = useRef(false);

  const pct = ((value - min) / (max - min)) * 100;

  const update = (clientX) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let f = (clientX - rect.left) / rect.width;
    f = Math.max(0, Math.min(1, f));
    let v = min + f * (max - min);
    v = Math.round(v / step) * step;
    v = Math.max(min, Math.min(max, v));
    onChange(v);
  };

  const onDown = (e) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    update(e.clientX);
  };
  const onMove = (e) => {
    if (dragging.current) update(e.clientX);
  };
  const onUp = (e) => {
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  return (
    <div
      className="slider"
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      <div className="slider__track">
        <div className="slider__fill" style={{ width: `${pct}%` }} />
        <div className="slider__thumb" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}

function Toolbar({
  tool,
  size,
  opacity,
  color,
  onSizeChange,
  onOpacityChange,
}) {
  const previewColor = tool === 'eraser' ? '#d0d0d0' : color;
  const dot = Math.max(2, Math.min(size, 52));

  return (
    <div className="section">
      <div className="section__head">
        <span className="section__title">Pinceau</span>
        <span className="section__value">
          {tool === 'eraser' ? 'Gomme' : 'Crayon'}
        </span>
      </div>

      <div className="brush-preview">
        <div
          className="brush-preview__dot"
          style={{
            width: `${dot}px`,
            height: `${dot}px`,
            background: previewColor,
            opacity,
          }}
        />
      </div>

      <div className="field">
        <div className="field__label">
          <span className="field__name">Taille</span>
          <span className="field__val">{size} px</span>
        </div>
        <Slider value={size} min={1} max={100} step={1} onChange={onSizeChange} />
      </div>

      <div className="field">
        <div className="field__label">
          <span className="field__name">Opacité</span>
          <span className="field__val">{Math.round(opacity * 100)} %</span>
        </div>
        <Slider
          value={Math.round(opacity * 100)}
          min={1}
          max={100}
          step={1}
          onChange={(v) => onOpacityChange(v / 100)}
        />
      </div>
    </div>
  );
}

export default memo(Toolbar);
