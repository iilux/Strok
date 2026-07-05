import { memo, useEffect, useRef, useState } from 'react';

/* ---- Conversions couleur ---- */
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  const h = (x) => Math.round(x).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToHsv({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g] = [c, x];
  else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x];
  else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c];
  else [r, b] = [c, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

const hsvToHex = (h, s, v) => rgbToHex(hsvToRgb(h, s, v));

const PRESETS = [
  '#000000', '#3a3a3a', '#7a7a7a', '#bdbdbd',
  '#ffffff', '#ff3b30', '#ff9500', '#ffcc00',
  '#34c759', '#00c7be', '#30b0c7', '#007aff',
  '#5856d6', '#af52de', '#ff2d55', '#a2845e',
];

function ColorPicker({
  color,
  recentColors,
  onColorChange,
  onColorCommit,
}) {
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(color)));
  const [hexInput, setHexInput] = useState(color);
  const svRef = useRef(null);
  const hueRef = useRef(null);
  const svDrag = useRef(false);
  const hueDrag = useRef(false);

  // Synchronise l'état HSV interne quand la couleur change depuis l'extérieur
  // (preset, récent, hex saisi). On évite d'écraser pendant un drag : si la
  // couleur entrante correspond déjà à notre HSV, on ne touche à rien.
  useEffect(() => {
    if (hsvToHex(hsv.h, hsv.s, hsv.v).toLowerCase() !== color.toLowerCase()) {
      setHsv(rgbToHsv(hexToRgb(color)));
    }
    setHexInput(color);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  const emit = (h, s, v) => onColorChange(hsvToHex(h, s, v));

  /* --- Zone Saturation / Valeur --- */
  const moveSV = (clientX, clientY) => {
    const r = svRef.current.getBoundingClientRect();
    const s = clamp01((clientX - r.left) / r.width);
    const v = 1 - clamp01((clientY - r.top) / r.height);
    const next = { ...hsv, s, v };
    setHsv(next);
    emit(next.h, s, v);
  };
  const svDown = (e) => {
    svDrag.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveSV(e.clientX, e.clientY);
  };
  const svMove = (e) => svDrag.current && moveSV(e.clientX, e.clientY);
  const svUp = (e) => {
    if (!svDrag.current) return;
    svDrag.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* noop */ }
    onColorCommit(hsvToHex(hsv.h, hsv.s, hsv.v));
  };

  /* --- Bandeau de teinte --- */
  const moveHue = (clientX) => {
    const r = hueRef.current.getBoundingClientRect();
    const h = clamp01((clientX - r.left) / r.width) * 360;
    const next = { ...hsv, h };
    setHsv(next);
    emit(h, hsv.s, hsv.v);
  };
  const hueDown = (e) => {
    hueDrag.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveHue(e.clientX);
  };
  const hueMove = (e) => hueDrag.current && moveHue(e.clientX);
  const hueUp = (e) => {
    if (!hueDrag.current) return;
    hueDrag.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* noop */ }
    onColorCommit(hsvToHex(hsv.h, hsv.s, hsv.v));
  };

  /* --- Hex --- */
  const onHexInput = (e) => {
    const val = e.target.value;
    setHexInput(val);
    const m = /^#?([0-9a-f]{6})$/i.exec(val.trim());
    if (m) onColorChange(`#${m[1].toLowerCase()}`);
  };
  const onHexBlur = () => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hexInput.trim());
    if (m) {
      const hex = `#${m[1].toLowerCase()}`;
      onColorChange(hex);
      onColorCommit(hex);
    } else {
      setHexInput(color);
    }
  };

  const pickSwatch = (hex) => {
    onColorChange(hex);
    onColorCommit(hex);
  };

  const svBg = `hsl(${hsv.h}, 100%, 50%)`;
  const recentSlots = Array.from({ length: 5 });

  return (
    <div className="section">
      <div className="section__head">
        <span className="section__title">Couleur</span>
      </div>

      <div className="cp__current">
        <div className="cp__swatch-lg" style={{ background: color }} />
        <div className="cp__hex">
          <div className="cp__hex-label">Hex</div>
          <input
            className="cp__hex-input"
            value={hexInput}
            onChange={onHexInput}
            onBlur={onHexBlur}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            spellCheck={false}
            maxLength={7}
          />
        </div>
      </div>

      <div
        className="cp__sv"
        ref={svRef}
        style={{ background: svBg }}
        onPointerDown={svDown}
        onPointerMove={svMove}
        onPointerUp={svUp}
      >
        <div className="cp__sv-white" />
        <div className="cp__sv-black" />
        <div
          className="cp__sv-thumb"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            background: color,
          }}
        />
      </div>

      <div
        className="cp__hue"
        ref={hueRef}
        onPointerDown={hueDown}
        onPointerMove={hueMove}
        onPointerUp={hueUp}
      >
        <div
          className="cp__hue-thumb"
          style={{ left: `${(hsv.h / 360) * 100}%` }}
        />
      </div>

      <div className="cp__sub">Palette</div>
      <div className="cp__grid">
        {PRESETS.map((hex) => (
          <button
            key={hex}
            className={`cp__chip${
              hex.toLowerCase() === color.toLowerCase() ? ' is-active' : ''
            }`}
            style={{ background: hex }}
            onClick={() => pickSwatch(hex)}
            aria-label={hex}
          />
        ))}
      </div>

      <div className="cp__sub">Récentes</div>
      <div className="cp__recent">
        {recentSlots.map((_, i) =>
          recentColors[i] ? (
            <button
              key={i}
              className="cp__recent-chip"
              style={{ background: recentColors[i] }}
              onClick={() => pickSwatch(recentColors[i])}
              aria-label={recentColors[i]}
            />
          ) : (
            <div key={i} className="cp__recent-empty" />
          )
        )}
      </div>
    </div>
  );
}

export default memo(ColorPicker);
