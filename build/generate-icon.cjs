/* Génère build/icon.ico (+ icon.png) sans dépendance externe.
   Dessine le logo Strok (vague + papier sombre arrondi) en SDF anti-aliasé,
   encode un PNG RGBA, puis :
     - icon.ico : PNG 256×256 dans un conteneur ICO (Windows) ;
     - icon.png : PNG 1024×1024 (electron-builder le convertit en .icns macOS,
       qui exige au moins 512×512). */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---- Géométrie ---- */
function roundedRectSDF(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - r;
}
function segDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}
function polyDist(x, y, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    d = Math.min(d, segDist(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  }
  return d;
}

// src-over sur un pixel [r,g,b,a] (0..1)
function over(dst, sr, sg, sb, sa) {
  const outA = sa + dst[3] * (1 - sa);
  if (outA <= 0) return [0, 0, 0, 0];
  const r = (sr * sa + dst[0] * dst[3] * (1 - sa)) / outA;
  const g = (sg * sa + dst[1] * dst[3] * (1 - sa)) / outA;
  const b = (sb * sa + dst[2] * dst[3] * (1 - sa)) / outA;
  return [r, g, b, outA];
}

// Rendu à la taille S. La géométrie est définie en coordonnées 256 et mise à
// l'échelle par k ; l'anti-aliasing reste sur ~1 px de la taille cible.
function render(S) {
  const k = S / 256;
  const buf = Buffer.alloc(S * S * 4);
  const wave = [
    [60 * k, 178 * k],
    [104 * k, 92 * k],
    [150 * k, 150 * k],
    [196 * k, 80 * k],
  ];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let p = [0, 0, 0, 0];

      // Fond : papier sombre arrondi (#181818)
      const bgd = roundedRectSDF(px, py, S / 2, S / 2, 120 * k, 120 * k, 52 * k);
      const bgA = clamp(0.5 - bgd, 0, 1);
      p = over(p, 24 / 255, 24 / 255, 24 / 255, bgA);

      // Légère bordure plus claire pour le relief (largeur ~2 px à l'échelle)
      const ringA = clamp(1 - Math.abs(bgd + 1.5 * k) / k, 0, 1) * 0.5;
      p = over(p, 60 / 255, 60 / 255, 60 / 255, ringA * p[3]);

      // La vague (trait clair)
      const wd = polyDist(px, py, wave);
      const strokeA = clamp(0.5 - (wd - 15 * k), 0, 1);
      p = over(p, 235 / 255, 235 / 255, 235 / 255, strokeA);

      // Point de départ (tête de crayon)
      const dotA = clamp(0.5 - (Math.hypot(px - 60 * k, py - 178 * k) - 7 * k), 0, 1);
      p = over(p, 235 / 255, 235 / 255, 235 / 255, dotA);

      const o = (y * S + x) * 4;
      buf[o] = Math.round(p[0] * 255);
      buf[o + 1] = Math.round(p[1] * 255);
      buf[o + 2] = Math.round(p[2] * 255);
      buf[o + 3] = Math.round(p[3] * 255);
    }
  }
  return buf;
}

/* ---- Encodage PNG ---- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}
function encodePNG(rgba, S) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // rangées filtrées (filtre 0)
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;
    rgba.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---- Conteneur ICO (PNG embarqué) ---- */
function encodeICO(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 256
  entry[1] = 0; // height 256
  entry[2] = 0; // palette
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12); // offset
  return Buffer.concat([header, entry, png]);
}

// Windows : ICO 256×256 (0 dans l'entrée ICO = 256).
const png256 = encodePNG(render(256), 256);
const ico = encodeICO(png256);
fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico);

// macOS/Linux : PNG 1024×1024 (converti en .icns par electron-builder).
const png1024 = encodePNG(render(1024), 1024);
fs.writeFileSync(path.join(__dirname, 'icon.png'), png1024);

console.log(
  'icon.ico (', ico.length, 'octets, 256px) + icon.png (', png1024.length, 'octets, 1024px) générés.'
);
