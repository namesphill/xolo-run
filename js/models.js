// Xolo Run — procedural models: floating obstacles, trajineras, decor (no external assets).
// Conventions: origin at ground/water centre of the footprint, y up, running surface (water) at y=0,
// length along Z (centred), width along X, the end facing the player is +Z.
// Static models are merged per material (few draw calls) and cached; every make*() returns a new Group
// that shares geometries/materials with previous ones.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { DECK_Y, CROSSER_TOP, mulberry32 } from './config.js';
import { PALETTES, woodTexture, papelTexture } from './textures.js';

// ---------------------------------------------------------------- palette
export const FOLK = {
  red: '#e3122d', rosa: '#e4007c', marigold: '#ff9a00', orange: '#ff6a00', yellow: '#ffd21a',
  turquoise: '#00b8b0', teal: '#008f8c', purple: '#7a1fb8', violet: '#a14de0', cobalt: '#1658d6',
  green: '#16a84a', lime: '#8fd12a', cream: '#fff4de', ink: '#1d1029', lilac: '#b58cf0',
};
const F = FOLK;
// Saturated folk palettes (a,b,c,d) used for boats/stalls; index with palette % length.
export const FOLK_PALETTES = [
  { a: F.rosa, b: F.yellow, c: F.turquoise, d: F.cobalt },
  { a: F.red, b: F.marigold, c: F.green, d: F.yellow },
  { a: F.cobalt, b: F.marigold, c: F.rosa, d: F.yellow },
  { a: F.purple, b: F.yellow, c: F.red, d: F.turquoise },
  { a: F.turquoise, b: F.rosa, c: F.yellow, d: F.red },
  { a: F.marigold, b: F.purple, c: F.rosa, d: F.turquoise },
];
const pal = (i) => FOLK_PALETTES[((i | 0) % FOLK_PALETTES.length + FOLK_PALETTES.length) % FOLK_PALETTES.length];
const MARIGOLDS = ['#ff8a00', '#ff9d00', '#ffb300', '#ff6f00', '#ffc31f'];
const MIXED = ['#ff8a00', '#ffb300', '#ff6f00', '#e4007c', '#ff9d00', '#ffc31f'];
const ROSAS = ['#e4007c', '#c8006a', '#ff2d8f'];
const PAPEL_COLORS = [F.rosa, F.marigold, F.turquoise, F.purple, F.red, F.yellow, F.green, F.cobalt, '#ff4fa3', F.orange];

export const OBSTACLE_BOXES = {
  crate: { w: 1.5, len: 0.9, h: 0.8 }, pots: { w: 1.6, len: 0.9, h: 0.7 }, fence: { w: 1.9, len: 0.35, h: 0.75 },
  ofrenda: { w: 1.9, len: 1.2, h: 2.9 }, tower: { w: 1.7, len: 1.1, h: 2.6 }, stall: { w: 1.9, len: 6, h: 2.7 },
};
export const STALL_SIGNS = ['TAMALES', 'ELOTES', 'FLORES', 'DULCES', 'AGUAS', 'CHURROS'];
export const BOAT_NAMES = ['Lupita', 'Xóchitl', 'Mi Amor', 'Rosita', 'Paloma', 'Citlali', 'Esperanza', 'La Flor', 'Corazón', 'Itzel'];

// Lilita One is declared by the page CSS; call before building models with text so canvases use it.
export function preloadModelFonts() {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return Promise.all([document.fonts.load('64px "Lilita One"'), document.fonts.load('800 32px "Nunito"')]).catch(() => {});
}

// ---------------------------------------------------------------- caches
const GEO = new Map(), MATS = new Map(), PARTS = new Map(), MISC = new Map();
const memo = (m, k, f) => { let v = m.get(k); if (v === undefined) { v = f(); m.set(k, v); } return v; };
const G = (k, f) => memo(GEO, k, f);
const M = (k, f) => memo(MATS, k, f);
const std = (k, o) => M(k, () => new THREE.MeshStandardMaterial(o));
const col = (hex, roughness = 0.55, metalness = 0) => std(`c${hex}/${roughness}/${metalness}`, { color: hex, roughness, metalness });

const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}
const pick = (rng, a) => a[(rng() * a.length) | 0];
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- canvas textures (own, hi-res)
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function canvasTex(key, w, h, draw, { repeat = true, srgb = true } = {}) {
  return memo(MISC, 'tex:' + key, () => {
    const [c, g] = makeCanvas(w, h);
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
}
const font = (px) => `${px}px "Lilita One", Impact, sans-serif`;
function flower2d(g, x, y, r, petals, col1, col2, center = F.yellow) {
  for (let k = 0; k < petals; k++) {
    const a = (k / petals) * Math.PI * 2;
    g.fillStyle = k % 2 && col2 ? col2 : col1;
    g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.5, r * 0.3, a, 0, 7); g.fill();
  }
  g.fillStyle = center; g.beginPath(); g.arc(x, y, r * 0.34, 0, 7); g.fill();
}
function leaf2d(g, x, y, len, ang, c = F.green) {
  g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = c;
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.35, len, 0); g.quadraticCurveTo(len * 0.5, len * 0.35, 0, 0); g.fill(); g.restore();
}
function noise2d(g, w, h, n, cols, a0 = 0.05, a1 = 0.18, r0 = 0.5, r1 = 2) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = lerp(a0, a1, Math.random()); g.fillStyle = cols[(Math.random() * cols.length) | 0];
    g.beginPath(); g.arc(Math.random() * w, Math.random() * h, lerp(r0, r1, Math.random()), 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}
function zigzag(g, x0, x1, y, h, step, c) {
  g.fillStyle = c; g.beginPath(); g.moveTo(x0, y + h);
  for (let x = x0; x <= x1; x += step) { g.lineTo(x + step / 2, y); g.lineTo(x + step, y + h); }
  g.lineTo(x1, y + h); g.closePath(); g.fill();
}
function outlinedText(g, text, x, y, px, fill, stroke = F.ink, lw = px * 0.16, maxW = Infinity) {
  g.font = font(px);
  const w = g.measureText(text).width;
  if (w > maxW) { px = px * maxW / w; g.font = font(px); lw = px * 0.16; }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = lw; g.strokeStyle = stroke; g.strokeText(text, x, y);
  g.fillStyle = fill; g.fillText(text, x, y);
  return px;
}

// painted plank texture, light, tintable via material.color
const grainTex = () => canvasTex('grain', 256, 256, (g) => {
  for (let i = 0; i < 6; i++) {
    const y = i * 256 / 6; g.fillStyle = ['#f4f0ea', '#e9e3da', '#f8f5f0'][i % 3]; g.fillRect(0, y, 256, 256 / 6);
    g.strokeStyle = 'rgba(80,60,40,0.12)';
    for (let k = 0; k < 4; k++) { const yy = y + 4 + Math.random() * 34; g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(80, yy + 3, 170, yy - 3, 256, yy); g.stroke(); }
    g.fillStyle = 'rgba(30,15,5,0.45)'; g.fillRect(0, y, 256, 2);
  }
  noise2d(g, 256, 256, 500, ['#000', '#fff'], 0.03, 0.08, 0.5, 1.5);
});
const plasterTex = () => canvasTex('plaster', 512, 512, (g) => {
  g.fillStyle = '#f2f0ec'; g.fillRect(0, 0, 512, 512);
  noise2d(g, 512, 512, 900, ['#d8d2c8', '#ffffff', '#cfc6b8'], 0.08, 0.25, 3, 18);
  noise2d(g, 512, 512, 2500, ['#bdb3a3', '#fff'], 0.05, 0.15, 0.5, 1.6);
  g.strokeStyle = 'rgba(90,70,50,0.18)'; g.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) { let x = Math.random() * 512, y = Math.random() * 512; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 40; y += Math.random() * 30; g.lineTo(x, y); } g.stroke(); }
});
const tileTex = () => canvasTex('tile', 256, 256, (g) => {
  for (let x = 0; x < 256; x += 32) {
    const gr = g.createLinearGradient(x, 0, x + 32, 0);
    gr.addColorStop(0, '#8e2a12'); gr.addColorStop(0.5, '#d4602c'); gr.addColorStop(1, '#8e2a12');
    g.fillStyle = gr; g.fillRect(x, 0, 32, 256);
  }
  g.fillStyle = 'rgba(60,15,5,0.55)'; for (let y = 0; y < 256; y += 42) g.fillRect(0, y, 256, 5);
  noise2d(g, 256, 256, 400, ['#5a1a08', '#f08a50'], 0.1, 0.3, 0.5, 2);
});
const thatchTex = () => canvasTex('thatch', 256, 256, (g) => {
  g.fillStyle = '#c9a050'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { const x = Math.random() * 256, y = Math.random() * 256; g.strokeStyle = ['#a57a30', '#e2c070', '#8a6224'][i % 3]; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 4, y + 18); g.stroke(); }
  g.fillStyle = 'rgba(70,45,10,0.35)'; for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 256, 4);
});
function fruitTex(base, hi, name) {
  return canvasTex('fruit' + name, 256, 256, (g) => {
    g.fillStyle = '#2b160a'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = 14 + Math.random() * 8;
      const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r);
      gr.addColorStop(0, hi); gr.addColorStop(0.45, base); gr.addColorStop(1, 'rgba(20,8,2,1)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
}
const flowerFillTex = () => canvasTex('flowerfill', 256, 256, (g) => {
  g.fillStyle = '#3d6b1f'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) { const x = Math.random() * 256, y = Math.random() * 256; flower2d(g, x, y, 12 + Math.random() * 8, 12, pick(Math.random, MARIGOLDS), pick(Math.random, MARIGOLDS), '#b34a00'); }
});

// Folk cloth (sarape stripes) in a few colourways.
function clothTex(v = 0) {
  return canvasTex('cloth' + v, 512, 512, (g) => {
    const sets = [[F.rosa, F.purple, F.yellow, F.turquoise], [F.purple, F.rosa, F.marigold, F.green], [F.red, F.yellow, F.cobalt, F.rosa], [F.turquoise, F.rosa, F.yellow, F.purple]];
    const s = sets[v % sets.length];
    g.fillStyle = s[0]; g.fillRect(0, 0, 512, 512);
    let y = 0, i = 0;
    while (y < 512) { const h = [56, 10, 18, 10, 30, 6][i % 6]; g.fillStyle = s[i % 4]; g.fillRect(0, y, 512, h); y += h + 4; g.fillStyle = F.cream; g.fillRect(0, y - 4, 512, 2); i++; }
    for (let x = 16; x < 512; x += 32) for (let yy = 26; yy < 512; yy += 96) flower2d(g, x, yy, 10, 8, F.cream, s[2], s[3]);
    noise2d(g, 512, 512, 1500, ['#000', '#fff'], 0.03, 0.07, 0.5, 1.2);
  });
}

// Tall hull: painted bands, flower frieze, greca zig-zag, dark waterline at the bottom ~20%.
function hullTex(pi) {
  const p = pal(pi);
  return canvasTex('hull' + pi, 1024, 512, (g) => {
    g.fillStyle = p.a; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = p.b; g.fillRect(0, 0, 1024, 46);
    g.fillStyle = F.ink; g.fillRect(0, 46, 1024, 6);
    g.fillStyle = p.d; g.fillRect(0, 52, 1024, 20);
    zigzag(g, 0, 1024, 72, 18, 36, p.b);
    // flower frieze
    for (let x = 64; x < 1024; x += 128) {
      for (const s of [-1, 1]) { leaf2d(g, x + s * 22, 168, 46, s > 0 ? -0.4 : Math.PI + 0.4, F.green); leaf2d(g, x + s * 16, 186, 36, s > 0 ? 0.5 : Math.PI - 0.5, '#0f7a35'); }
      flower2d(g, x, 160, 52, 12, F.cream, p.b, p.c);
      flower2d(g, x, 160, 24, 8, p.c, null, F.yellow);
      flower2d(g, x + 64, 140, 18, 6, p.d, F.cream, F.yellow);
      g.fillStyle = F.cream; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + 54 + k * 10, 194, 3.5, 0, 7); g.fill(); }
    }
    g.fillStyle = p.c; g.fillRect(0, 246, 1024, 22);
    g.fillStyle = F.cream; for (let x = 8; x < 1024; x += 24) { g.beginPath(); g.arc(x, 257, 5, 0, 7); g.fill(); }
    g.fillStyle = p.d; g.fillRect(0, 268, 1024, 64);
    zigzag(g, 0, 1024, 280, 40, 48, p.b);
    zigzag(g, 0, 1024, 300, 20, 48, p.a);
    g.fillStyle = F.ink; g.fillRect(0, 332, 1024, 8);
    const gr = g.createLinearGradient(0, 340, 0, 512); gr.addColorStop(0, '#1a6c6a'); gr.addColorStop(1, '#0b2a2c');
    g.fillStyle = gr; g.fillRect(0, 340, 1024, 172);
    noise2d(g, 1024, 512, 3000, ['#000', '#fff'], 0.02, 0.06, 0.5, 1.5);
  });
}

// Ornate trajinera name arch: scalloped rim, painted flowers, birds, name in flower-filled letters. Transparent outside.
export function nameArchTexture(name, pi) {
  const p = pal(pi);
  return canvasTex('arch' + name + pi, 1024, 512, (g) => {
    const W = 1024, H = 512;
    const shape = (i) => {
      g.beginPath();
      g.moveTo(24 + i, H - 4 - i);
      g.lineTo(24 + i, 250);
      g.bezierCurveTo(24 + i, 90 + i, 250, 20 + i, 512, 20 + i);
      g.bezierCurveTo(774, 20 + i, W - 24 - i, 90 + i, W - 24 - i, 250);
      g.lineTo(W - 24 - i, H - 4 - i);
      g.lineTo(W - 190 + i, H - 4 - i);
      g.lineTo(W - 190 + i, 410);
      g.bezierCurveTo(W - 190 + i, 345 - i, 700, 318 - i, 512, 318 - i);
      g.bezierCurveTo(324, 318 - i, 190 - i, 345 - i, 190 - i, 410);
      g.lineTo(190 - i, H - 4 - i);
      g.closePath();
    };
    // scalloped outer rim
    g.save(); shape(0); g.clip();
    g.fillStyle = p.b; g.fillRect(0, 0, W, H);
    g.restore();
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = Math.PI - t * Math.PI;
      const x = 512 + Math.cos(a) * 500, y = 268 - Math.sin(a) * 250;
      g.fillStyle = i % 2 ? p.c : p.a; g.beginPath(); g.arc(x, Math.max(y, 26), 17, 0, 7); g.fill();
    }
    shape(14); g.fillStyle = F.ink; g.fill();
    shape(20); g.fillStyle = p.a; g.fill();
    shape(46); g.fillStyle = p.d; g.fill();
    shape(56); g.fillStyle = p.a; g.fill();
    // inner panel pattern
    g.save(); shape(56); g.clip();
    g.globalAlpha = 0.25; for (let x = 0; x < W; x += 40) for (let y = 0; y < H; y += 40) { g.fillStyle = F.cream; g.beginPath(); g.arc(x + ((y / 40) % 2) * 20, y, 4, 0, 7); g.fill(); }
    g.globalAlpha = 1; g.restore();
    // flower garland around the arch
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, a = Math.PI - t * Math.PI;
      const x = 512 + Math.cos(a) * 455, y = 262 - Math.sin(a) * 205;
      leaf2d(g, x, y, 40, -a + Math.PI / 2, F.green);
      flower2d(g, x, y, i % 2 ? 26 : 34, 10, i % 2 ? F.cream : p.c, i % 2 ? p.b : F.cream, i % 2 ? p.c : F.yellow);
    }
    // legs decoration
    for (const lx of [107, W - 107]) {
      flower2d(g, lx, 380, 46, 12, p.c, F.cream, F.yellow);
      flower2d(g, lx, 470, 30, 8, F.cream, p.b, p.a);
      leaf2d(g, lx - 10, 430, 40, 2.4); leaf2d(g, lx + 10, 430, 40, 0.7);
    }
    // doves
    const dove = (x, y, s) => {
      g.save(); g.translate(x, y); g.scale(s, 1);
      g.fillStyle = F.cream; g.strokeStyle = F.ink; g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, 0, 26, 13, 0, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-6, -4); g.quadraticCurveTo(-4, -34, 18, -30); g.quadraticCurveTo(8, -12, 6, -2); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.arc(24, -6, 8, 0, 7); g.fill(); g.stroke();
      g.fillStyle = F.ink; g.beginPath(); g.arc(26, -8, 2, 0, 7); g.fill();
      g.fillStyle = F.marigold; g.beginPath(); g.moveTo(31, -6); g.lineTo(40, -4); g.lineTo(31, -2); g.fill();
      g.restore();
    };
    dove(250, 245, -1); dove(774, 245, 1);
    // hearts
    const heart = (x, y, s, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(x, y + s * 0.9); g.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.6, y - s * 1.1, x, y - s * 0.35); g.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9); g.fill(); };
    heart(512, 74, 16, F.red);
    // name with flower-filled letters
    const px = Math.min(150, 150 * 560 / Math.max(1, (g.font = font(150), g.measureText(name).width)));
    g.font = font(px); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const ty = 196;
    g.lineWidth = px * 0.24; g.strokeStyle = F.ink; g.strokeText(name, 512, ty);
    g.lineWidth = px * 0.12; g.strokeStyle = F.cream; g.strokeText(name, 512, ty);
    g.fillStyle = p.b; g.fillText(name, 512, ty);
    g.save(); g.globalCompositeOperation = 'source-atop';
    const tw = g.measureText(name).width;
    for (let x = 512 - tw / 2; x < 512 + tw / 2; x += 30) for (let y = ty - px / 2; y < ty + px / 2; y += 30) {
      flower2d(g, x + ((y | 0) % 60 ? 15 : 0), y, 11, 6, ((x / 30) | 0) % 2 ? p.c : F.red, null, F.cream);
    }
    g.restore();
    // underline flourish
    g.strokeStyle = F.cream; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(300, 280); g.quadraticCurveTo(512, 306, 724, 280); g.stroke();
    heart(512, 290, 10, p.c);
  }, { repeat: false });
}

// High-res sugar-skull icing texture. Mapping: u = 0.5 + az/(2π) (az=0 front, +x to the right), v = 1 - el/π (el=0 top).
export const sugarSkullTexture = () => canvasTex('sugarskull', 2048, 1024, (g) => {
  const W = 2048, H = 1024;
  const P = (az, el) => [W * (0.5 + az / (Math.PI * 2)), H * (el / Math.PI)];
  g.fillStyle = '#fffaf2'; g.fillRect(0, 0, W, H);
  noise2d(g, W, H, 9000, ['#e9dfcf', '#ffffff', '#f3e7d2'], 0.25, 0.6, 0.6, 2.2); // sugar grain
  const ring = (x, y, r, n, c1, c2, pr = 0.42) => {
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; g.fillStyle = k % 2 ? c2 : c1; g.beginPath(); g.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, r * pr, r * pr * 0.62, a, 0, 7); g.fill(); }
  };
  // eyes (sockets at az ±0.42, el 1.33)
  for (const s of [-1, 1]) {
    const [x, y] = P(s * 0.42, 1.33);
    ring(x, y, 118, 12, s < 0 ? F.rosa : F.turquoise, s < 0 ? '#ff5fb0' : '#38dcd2', 0.5);
    ring(x, y, 82, 10, F.yellow, F.marigold, 0.46);
    g.fillStyle = '#2a0f3a'; g.beginPath(); g.ellipse(x, y, 68, 62, 0, 0, 7); g.fill();
    g.fillStyle = '#4c1d6b'; g.beginPath(); g.ellipse(x + 8, y + 10, 48, 40, 0, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - 22, y - 22, 13, 0, 7); g.fill();
    g.beginPath(); g.arc(x + 18, y + 18, 5, 0, 7); g.fill();
    // eyebrow scallops
    g.strokeStyle = F.purple; g.lineWidth = 9; g.lineCap = 'round';
    for (let k = -3; k <= 3; k++) { const ax = x + k * 34, ay = y - 140 + Math.abs(k) * 8; g.beginPath(); g.arc(ax, ay, 16, Math.PI, 0); g.stroke(); }
    // cheek swirl + dots
    const [cx, cy] = P(s * 0.75, 1.66);
    g.strokeStyle = F.green; g.lineWidth = 12;
    g.beginPath(); for (let t = 0; t < 12; t += 0.2) { const r = 6 + t * 5; g.lineTo(cx + s * Math.cos(t) * r, cy + Math.sin(t) * r); } g.stroke();
    for (let k = 0; k < 5; k++) { g.fillStyle = [F.rosa, F.yellow, F.turquoise, F.marigold, F.purple][k]; g.beginPath(); g.arc(cx + s * (70 + k * 6), cy - 70 + k * 36, 11, 0, 7); g.fill(); }
    // temple leaves
    const [tx, ty] = P(s * 0.95, 1.05);
    for (let k = 0; k < 4; k++) leaf2d(g, tx, ty + k * 40, 70, s > 0 ? -0.6 + k * 0.35 : Math.PI + 0.6 - k * 0.35, k % 2 ? F.green : F.lime);
    flower2d(g, tx, ty, 34, 8, F.red, F.rosa, F.yellow);
  }
  // nose: inverted heart
  { const [x, y] = P(0, 1.63); g.fillStyle = F.red; g.beginPath(); g.moveTo(x, y - 34); g.bezierCurveTo(x - 60, y + 20, x - 34, y + 64, x, y + 40); g.bezierCurveTo(x + 34, y + 64, x + 60, y + 20, x, y - 34); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(x - 14, y + 10, 8, 14, -0.4, 0, 7); g.fill(); }
  // mouth: stitched smile + teeth
  { const [x, y] = P(0, 1.98);
    g.fillStyle = F.cream; g.strokeStyle = F.ink; g.lineWidth = 6;
    for (let i = -4; i <= 4; i++) { const tx = x + i * 40, ty = y + 18 * (1 - (i / 4.5) ** 2); g.beginPath(); g.roundRect(tx - 17, ty - 30, 34, 58, 10); g.fill(); g.stroke(); }
    g.strokeStyle = F.ink; g.lineWidth = 9; g.beginPath(); g.moveTo(x - 200, y - 10); g.quadraticCurveTo(x, y + 56, x + 200, y - 10); g.stroke();
    g.strokeStyle = F.rosa; g.lineWidth = 7;
    for (const s of [-1, 1]) { g.beginPath(); g.arc(x + s * 214, y - 18, 16, 0, 7); g.stroke(); }
  }
  // chin: scallops and dots
  { const [x, y] = P(0, 2.32);
    for (let i = -5; i <= 5; i++) { g.fillStyle = i % 2 ? F.turquoise : F.rosa; g.beginPath(); g.arc(x + i * 36, y + Math.abs(i) * -5, 12, 0, 7); g.fill(); }
    flower2d(g, x, y + 56, 30, 8, F.purple, F.violet, F.yellow); }
  // forehead area (foil patch sits on top; paint a backing lace)
  { const [x, y] = P(0, 0.82);
    g.strokeStyle = F.rosa; g.lineWidth = 8;
    for (let i = 0; i < 18; i++) { const a = Math.PI + (i / 17) * Math.PI; g.beginPath(); g.arc(x + Math.cos(a) * 240, y + 40 + Math.sin(a) * 170, 18, 0, 7); g.stroke(); }
    for (let i = 0; i < 26; i++) { const a = Math.PI + (i / 25) * Math.PI; g.fillStyle = [F.yellow, F.turquoise, F.marigold][i % 3]; g.beginPath(); g.arc(x + Math.cos(a) * 290, y + 50 + Math.sin(a) * 215, 9, 0, 7); g.fill(); }
  }
  // crown of icing scallops around the cranium + back pattern
  for (let x = 0; x < W; x += 44) { g.strokeStyle = [F.rosa, F.turquoise, F.marigold, F.purple][((x / 44) | 0) % 4]; g.lineWidth = 9; g.beginPath(); g.arc(x, 250, 20, 0, Math.PI); g.stroke(); }
  for (let y = 340; y < 900; y += 110) for (let x = 40; x < W; x += 130) {
    const [fx] = P(0, 0); if (Math.abs(x - fx) < 620) continue;
    flower2d(g, x + (y % 220 ? 65 : 0), y, 30, 8, pick(Math.random, [F.rosa, F.turquoise, F.purple, F.red]), F.cream, F.yellow);
  }
  g.fillStyle = F.rosa; g.fillRect(0, 0, W, 26);
});
// Metallic foil (papel metálico) forehead ornament: alpha cut flower-heart shape.
const foilTex = () => canvasTex('foil', 512, 512, (g) => {
  g.clearRect(0, 0, 512, 512);
  const cx = 256, cy = 256;
  g.fillStyle = '#ffffff';
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(a) * 135, cy + Math.sin(a) * 135, 95, 62, a, 0, 7); g.fill(); }
  g.beginPath(); g.arc(cx, cy, 150, 0, 7); g.fill();
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createRadialGradient(cx - 60, cy - 60, 10, cx, cy, 260);
  gr.addColorStop(0, '#ffe6f6'); gr.addColorStop(0.4, '#ff3fa4'); gr.addColorStop(0.75, '#c70068'); gr.addColorStop(1, '#ff8fd0');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3;
  for (let r = 30; r < 260; r += 22) { g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); }
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 250, cy + Math.sin(a) * 250); g.stroke(); }
  g.fillStyle = '#ffd21a'; g.beginPath(); g.arc(cx, cy, 52, 0, 7); g.fill();
  g.fillStyle = '#ff9a00'; g.beginPath(); g.arc(cx, cy, 26, 0, 7); g.fill();
  g.globalCompositeOperation = 'source-over';
}, { repeat: false });

function stallSideTex(pi) {
  const p = pal(pi);
  return canvasTex('stallside' + pi, 512, 512, (g) => {
    // lower: painted boards; upper: striped lona
    for (let x = 0; x < 512; x += 32) { g.fillStyle = (x / 32) % 2 ? p.c : p.a; g.fillRect(x, 0, 32, 512); }
    g.fillStyle = 'rgba(255,255,255,0.18)'; for (let x = 0; x < 512; x += 32) g.fillRect(x, 0, 6, 512);
    g.fillStyle = p.b; g.fillRect(0, 0, 512, 40);
    zigzag(g, 0, 512, 40, 22, 32, p.b);
    g.fillStyle = p.d; g.fillRect(0, 300, 512, 212);
    for (let x = 0; x < 512; x += 64) g.fillRect(x, 300, 4, 212);
    g.fillStyle = F.ink; g.fillRect(0, 296, 512, 8);
    for (let x = 64; x < 512; x += 128) { flower2d(g, x, 400, 44, 10, F.cream, p.b, p.a); leaf2d(g, x + 30, 410, 50, 0.3); leaf2d(g, x - 30, 410, 50, Math.PI - 0.3); }
    g.fillStyle = p.b; g.fillRect(0, 486, 512, 26);
    noise2d(g, 512, 512, 1500, ['#000', '#fff'], 0.03, 0.07, 0.5, 1.5);
  });
}
const GOODS = {
  TAMALES: (g, x, y) => { g.fillStyle = '#d9c27a'; g.beginPath(); g.moveTo(x - 30, y + 30); g.lineTo(x, y - 40); g.lineTo(x + 30, y + 30); g.fill(); g.strokeStyle = '#7a6a2a'; g.lineWidth = 3; g.stroke(); g.fillStyle = '#ffd96b'; g.fillRect(x - 12, y, 24, 22); },
  ELOTES: (g, x, y) => { g.fillStyle = F.yellow; g.beginPath(); g.ellipse(x, y, 16, 40, 0.2, 0, 7); g.fill(); g.fillStyle = '#d99a00'; for (let k = -3; k <= 3; k++) { g.beginPath(); g.arc(x + k * 3, y + k * 10, 3, 0, 7); g.fill(); } leaf2d(g, x, y + 30, 40, -2.2, F.lime); leaf2d(g, x, y + 30, 40, -0.9, F.green); },
  FLORES: (g, x, y) => { flower2d(g, x, y, 34, 12, F.marigold, F.orange, '#a33f00'); },
  DULCES: (g, x, y) => { g.fillStyle = F.cream; g.beginPath(); g.ellipse(x, y, 26, 30, 0, 0, 7); g.fill(); g.fillStyle = F.ink; g.beginPath(); g.arc(x - 10, y - 4, 7, 0, 7); g.arc(x + 10, y - 4, 7, 0, 7); g.fill(); g.fillStyle = F.rosa; g.beginPath(); g.arc(x, y + 10, 4, 0, 7); g.fill(); },
  AGUAS: (g, x, y, i) => { const c = [F.rosa, F.lime, F.marigold, F.red][i % 4]; g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.roundRect(x - 26, y - 40, 52, 80, 14); g.fill(); g.fillStyle = c; g.beginPath(); g.roundRect(x - 22, y - 20, 44, 56, 10); g.fill(); },
  CHURROS: (g, x, y) => { g.strokeStyle = '#b8742a'; g.lineWidth = 12; g.lineCap = 'round'; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x + k * 14, y + 36); g.lineTo(x + k * 18, y - 36); g.stroke(); } },
};
function stallFrontTex(text, pi) {
  const p = pal(pi);
  return canvasTex('stallfront' + text + pi, 512, 576, (g) => {
    for (let x = 0; x < 512; x += 42) { g.fillStyle = (x / 42) % 2 ? p.a : p.c; g.fillRect(x, 0, 42, 576); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 0; x < 512; x += 42) g.fillRect(x, 0, 3, 576);
    // sign board
    g.fillStyle = F.ink; g.beginPath(); g.roundRect(18, 26, 476, 172, 26); g.fill();
    g.fillStyle = p.d; g.beginPath(); g.roundRect(28, 36, 456, 152, 20); g.fill();
    g.strokeStyle = F.cream; g.lineWidth = 6; g.setLineDash([14, 10]); g.beginPath(); g.roundRect(42, 50, 428, 124, 14); g.stroke(); g.setLineDash([]);
    flower2d(g, 54, 60, 26, 8, p.b, F.cream, p.a); flower2d(g, 458, 60, 26, 8, p.b, F.cream, p.a);
    outlinedText(g, text, 256, 116, 104, F.cream, F.ink, 16, 400);
    // goods display painted on counter
    g.fillStyle = p.b; g.fillRect(0, 226, 512, 24);
    zigzag(g, 0, 512, 250, 18, 32, p.b);
    const draw = GOODS[text] || GOODS.FLORES;
    for (let i = 0; i < 5; i++) draw(g, 64 + i * 96, 330, i);
    g.fillStyle = F.ink; g.fillRect(0, 392, 512, 10);
    g.fillStyle = p.d; g.fillRect(0, 402, 512, 174);
    for (let x = 48; x < 512; x += 104) { flower2d(g, x, 480, 40, 10, F.cream, p.b, p.a); leaf2d(g, x + 26, 500, 46, 0.4); leaf2d(g, x - 26, 500, 46, Math.PI - 0.4); }
    noise2d(g, 512, 576, 1500, ['#000', '#fff'], 0.03, 0.07, 0.5, 1.5);
  }, { repeat: false });
}
function smallBoatNameTex(name, pi) {
  const p = pal(pi);
  return canvasTex('smallname' + name + pi, 1024, 256, (g) => {
    g.drawImage(hullTex(pi).image, 0, 0, 1024, 512, 0, 0, 1024, 256);
    g.fillStyle = F.ink; g.beginPath(); g.roundRect(262, 36, 500, 124, 60); g.fill();
    g.fillStyle = p.b; g.beginPath(); g.roundRect(272, 46, 480, 104, 52); g.fill();
    flower2d(g, 300, 98, 30, 8, p.c, F.cream, F.yellow); flower2d(g, 724, 98, 30, 8, p.c, F.cream, F.yellow);
    outlinedText(g, name, 512, 100, 84, F.cream, F.ink, 14, 360);
  }, { repeat: false });
}
const photoTex = () => canvasTex('photos', 512, 320, (g) => {
  for (let i = 0; i < 2; i++) {
    const x0 = i * 256;
    const gr = g.createRadialGradient(x0 + 128, 140, 10, x0 + 128, 160, 200); gr.addColorStop(0, '#e9d2a8'); gr.addColorStop(1, '#8a6a42');
    g.fillStyle = gr; g.fillRect(x0, 0, 256, 320);
    g.fillStyle = '#4a3220';
    g.beginPath(); g.ellipse(x0 + 128, 330, 100, 110, 0, 0, 7); g.fill();
    g.fillStyle = '#c99a6e'; g.beginPath(); g.ellipse(x0 + 128, 150, 48, 60, 0, 0, 7); g.fill();
    g.fillStyle = '#2a1a10';
    if (i === 0) { g.beginPath(); g.ellipse(x0 + 128, 118, 54, 40, 0, Math.PI, 0); g.fill(); g.fillRect(x0 + 74, 118, 14, 110); g.fillRect(x0 + 168, 118, 14, 110); g.fillStyle = F.rosa; g.fillRect(x0 + 70, 222, 22, 10); g.fillRect(x0 + 164, 222, 22, 10); }
    else { g.beginPath(); g.ellipse(x0 + 128, 100, 110, 22, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(x0 + 128, 82, 46, 40, 0, Math.PI, 0); g.fill(); g.fillRect(x0 + 100, 176, 56, 10); }
    g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(x0 + 110, 148, 5, 0, 7); g.arc(x0 + 146, 148, 5, 0, 7); g.fill();
    g.strokeStyle = 'rgba(40,25,10,0.5)'; g.lineWidth = 10; g.strokeRect(x0 + 5, 5, 246, 310);
  }
}, { repeat: false });
const awningStripeTex = (pi) => canvasTex('awning' + pi, 512, 128, (g) => {
  const p = pal(pi); const cols = [p.a, F.cream, p.c, F.cream, p.b, F.cream];
  for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(i * 32, 0, 33, 128); }
  g.fillStyle = 'rgba(0,0,0,0.1)'; for (let i = 0; i < 16; i++) g.fillRect(i * 32 + 28, 0, 4, 128);
});
const valanceTex = (pi) => canvasTex('valance' + pi, 512, 64, (g) => {
  const p = pal(pi); const cols = [p.a, p.b, p.c, p.d];
  for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % 4]; g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 32, 30); g.arc(i * 32 + 16, 30, 16, 0, Math.PI); g.closePath(); g.fill(); }
  g.fillStyle = F.cream; for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(i * 32 + 16, 22, 5, 0, 7); g.fill(); }
}, { repeat: true });

// ---------------------------------------------------------------- builder: merges parts per material
const WHITE = new THREE.Color(1, 1, 1);
class Builder {
  constructor() { this.groups = new Map(); this.stack = [new THREE.Matrix4()]; this.fd = 2; }
  get base() { return this.stack[this.stack.length - 1]; }
  push(m) { this.stack.push(this.base.clone().multiply(m)); return this; }
  pop() { this.stack.pop(); return this; }
  add(geo, mat, m, color) {
    let l = this.groups.get(mat); if (!l) this.groups.set(mat, (l = []));
    l.push({ geo, m: m ? this.base.clone().multiply(m) : this.base.clone(), color });
    return this;
  }
  box(mat, x, y, z, w, h, d, ry = 0, rx = 0, rz = 0) { return this.add(UBOX(), mat, T(x, y, z, rx, ry, rz, w, h, d)); }
  tbox(mat, x, y, z, w, h, d, us = 1, ry = 0, rx = 0, rz = 0) { return this.add(tboxGeo(w, h, d, us), mat, T(x, y, z, rx, ry, rz)); }
  cyl(mat, x, y, z, r, h, seg = 12, rx = 0, ry = 0, rz = 0, color) { return this.add(UCYL(seg), mat, T(x, y, z, rx, ry, rz, r, h, r), color); }
  ball(mat, x, y, z, sx, sy = sx, sz = sx, color, rx = 0, ry = 0, rz = 0) { return this.add(USPH(), mat, T(x, y, z, rx, ry, rz, sx, sy, sz), color); }
  flower(x, y, z, s, color, rx = 0, ry = 0, rz = 0) { return this.add(flowerHeadGeo(this.fd), flowerMat(), T(x, y, z, rx, ry, rz, s, s, s), color); }
  build() {
    const out = [];
    for (const [mat, parts] of this.groups) {
      const needColor = !!mat.vertexColors;
      let geos = parts.map(({ geo, m, color }) => {
        const g = new THREE.BufferGeometry();
        const pos = geo.attributes.position, n = pos.count;
        g.setAttribute('position', pos.clone());
        g.setAttribute('normal', geo.attributes.normal ? geo.attributes.normal.clone() : new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
        g.setAttribute('uv', geo.attributes.uv ? geo.attributes.uv.clone() : new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
        if (needColor) {
          const c = color !== undefined ? _c.set(color) : WHITE, src = geo.attributes.color, arr = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) {
            const k = src ? [src.getX(i), src.getY(i), src.getZ(i)] : [1, 1, 1];
            arr[i * 3] = k[0] * c.r; arr[i * 3 + 1] = k[1] * c.g; arr[i * 3 + 2] = k[2] * c.b;
          }
          g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
        }
        if (geo.index) g.setIndex(geo.index.clone());
        g.applyMatrix4(m);
        return g;
      });
      if (geos.some((g) => !g.index)) geos = geos.map((g) => (g.index ? g.toNonIndexed() : g));
      const merged = mergeGeometries(geos, false);
      merged.computeBoundingBox(); merged.computeBoundingSphere();
      out.push({ geometry: merged, material: mat });
    }
    return out;
  }
}
function instantiate(parts, name) {
  const g = new THREE.Group(); g.name = name || '';
  for (const p of parts) { const m = new THREE.Mesh(p.geometry, p.material); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}
function cached(key, fn) {
  const parts = memo(PARTS, key, () => { const b = new Builder(); fn(b); return b.build(); });
  return instantiate(parts, key);
}

// ---------------------------------------------------------------- shared geometries
const UBOX = () => G('ubox', () => new THREE.BoxGeometry(1, 1, 1));
const UCYL = (seg = 12) => G('ucyl' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg));
const USPH = () => G('usph', () => new THREE.SphereGeometry(1, 16, 12));
const USPH_LO = () => G('usphlo', () => new THREE.SphereGeometry(1, 7, 5));
function tboxGeo(w, h, d, us = 1) {
  return G(`tbox${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)},${us}`, () => {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] * us, uv.getY(k) * dims[f][1] * us); }
    return g;
  });
}
function planeGeo(w, h, u0 = 0, u1 = 1, v0 = 0, v1 = 1) {
  return G(`plane${w},${h},${u0},${u1},${v0},${v1}`, () => {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
    return g;
  });
}
// Quad a,b,c,d (perimeter order). Winding is fixed so the face normal points along `hint`.
function quadGeo(pts, uvs, hint) {
  let [a, b, c, d] = pts, [ua, ub, uc, ud] = uvs;
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  if (hint && n.dot(hint) < 0) { [b, d] = [d, b]; [ub, ud] = [ud, ub]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, d].flatMap((p) => [p.x, p.y, p.z]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([ua, ub, uc, ud].flat(), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  return g;
}
function triGeo(a, b, c, hint) {
  const g = new THREE.BufferGeometry();
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  if (hint && n.dot(hint) < 0) [b, c] = [c, b];
  g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c].flatMap((p) => [p.x, p.y, p.z]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  g.setIndex([0, 1, 2]); g.computeVertexNormals();
  return g;
}
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Ruffled marigold head, ~0.25 wide, ~0.17 tall, grey-scale shading baked in vertex colours (tinted by instance/vertex colour).
function flowerHeadGeo(detail = 2) {
  return G('flowerhead' + detail, () => {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.attributes.position, n = p.count, colors = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const h = hash3(Math.round(v.x * 50), Math.round(v.y * 50), Math.round(v.z * 50));
      const az = Math.atan2(v.z, v.x);
      const ruffle = 0.08 * Math.sin(az * 9 + v.y * 6) + 0.1 * (h - 0.5);
      const r = 0.125 * (0.9 + ruffle);
      const y = v.y > 0 ? v.y * 0.72 : v.y * 0.42;
      p.setXYZ(i, v.x * r, y * r, v.z * r);
      let sh = 0.42 + 0.58 * smooth(-0.6, 0.7, v.y);
      sh *= 0.82 + 0.3 * h;
      if (v.y > 0.88) sh *= 0.72;
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = Math.min(1, sh);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  });
}
// Lumpy leafy bush, ~0.6 wide, ~0.45 tall, origin at the bottom.
function bushGeo() {
  return G('bush', () => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position, n = p.count, colors = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const h = hash3(Math.round(v.x * 40), Math.round(v.y * 40), Math.round(v.z * 40));
      const r = 0.3 * (0.85 + 0.25 * h + 0.06 * Math.sin(v.x * 9) * Math.cos(v.z * 7));
      p.setXYZ(i, v.x * r, (Math.max(v.y, -0.55) * 0.75 + 0.42) * r * 1.0, v.z * r);
      const sh = (0.45 + 0.55 * smooth(-0.6, 0.9, v.y)) * (0.8 + 0.35 * h);
      colors[i * 3] = sh * 0.95; colors[i * 3 + 1] = sh; colors[i * 3 + 2] = sh * 0.85;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  });
}

// ---------------------------------------------------------------- shared materials
const flowerMat = () => std('flower', { color: '#ffffff', vertexColors: true, flatShading: true, roughness: 0.62, emissive: '#3a1200', emissiveIntensity: 0.35 });
const leafMat = () => std('leaf', { color: '#4f9a2c', vertexColors: true, flatShading: true, roughness: 0.78 });
const flameMat = () => std('flame', { color: '#fff1b8', emissive: '#ffa21f', emissiveIntensity: 4, roughness: 1 });
const woodMat = () => std('wood', { map: woodTexture(), roughness: 0.75 });
const darkWoodMat = () => std('darkwood', { map: woodTexture(), color: '#7a5a42', roughness: 0.85 });
const painted = (hex) => std('paint' + hex, { map: grainTex(), color: hex, roughness: 0.42 });
const interiorMat = () => col('#2a170c', 0.95);
const vcMat = (k, o = {}) => std('vc' + k, { color: '#ffffff', vertexColors: true, roughness: 0.6, ...o });

// ---------------------------------------------------------------- sub-assemblies
function flowerMound(b, rng, { x = 0, z = 0, y0, rx, rz, top, n, colors = MARIGOLDS, s = 1, leaves = true }) {
  if (leaves) b.add(bushGeo(), leafMat(), T(x, y0 - 0.03, z, 0, rng() * 6, 0, rx / 0.3 * 0.95, Math.max(0.2, (top - y0) / 0.45 * 0.95), rz / 0.3 * 0.95));
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng());
    const dx = Math.cos(a) * r, dz = Math.sin(a) * r;
    const dome = Math.sqrt(Math.max(0, 1 - r * r));
    const y = y0 + (top - y0) * (0.2 + 0.8 * dome) - rng() * 0.02;
    const sc = s * (0.85 + rng() * 0.3);
    b.flower(x + dx * rx, y, z + dz * rz, sc, pick(rng, colors), dz * 0.7 * r, rng() * 6, -dx * 0.7 * r);
  }
}
// Slatted crate (huacal), bottom centre at (x,y,z).
function crate(b, x, y, z, w, h, d, ry = 0, mat = woodMat(), fill = interiorMat(), slats = 3) {
  b.push(T(x, y, z, 0, ry, 0));
  const t = 0.03, ps = 0.06;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.tbox(mat, sx * (w / 2 - ps / 2), h / 2, sz * (d / 2 - ps / 2), ps, h, ps, 1.5);
  const sh = h * 0.2;
  for (let i = 0; i < slats; i++) {
    const yy = sh / 2 + i * (h - sh) / (slats - 1);
    for (const sz of [-1, 1]) b.tbox(mat, 0, yy, sz * (d / 2 - t / 2), w - 0.004, sh, t, 1.5);
    for (const sx of [-1, 1]) b.tbox(mat, sx * (w / 2 - t / 2), yy, 0, t, sh, d - 0.004, 1.5);
  }
  b.tbox(mat, 0, 0.02, 0, w - 0.02, 0.04, d - 0.02, 1.5);
  if (fill) b.tbox(fill, 0, h * 0.46, 0, w - 2 * t - 0.01, h * 0.9, d - 2 * t - 0.01, 2);
  b.pop();
}
// Log raft lying across X, top at y=top, dipping ~0.25 below the water.
function logRaft(b, w, len, top = 0.04, n = 5) {
  const r = len / (2 * n);
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + r + i * 2 * r;
    b.cyl(darkWoodMat(), 0, top - r * 0.9 - 0.02, z, r * 0.98, w - 0.02 * (i % 2), 10, 0, 0, Math.PI / 2);
  }
  for (const s of [-1, 1]) b.tbox(woodMat(), s * (w / 2 - 0.12), top - 0.015, 0, 0.09, 0.05, len - 0.02, 1.5);
  // underwater float
  b.box(col('#15363a', 0.9), 0, top - 0.3, 0, w * 0.8, 0.1, len * 0.7);
}
// Flat plank raft with painted rim, x/z extents w,len, top at y=top, bottom at -0.28.
function plankRaft(b, w, len, top, rim = F.turquoise) {
  b.tbox(woodMat(), 0, (top - 0.28) / 2, 0, w - 0.06, top + 0.28, len - 0.06, 1.2);
  for (const s of [-1, 1]) {
    b.tbox(painted(rim), s * (w / 2 - 0.03), top / 2 - 0.12, 0, 0.06, top + 0.24, len, 1);
    b.tbox(painted(rim), 0, top / 2 - 0.12, s * (len / 2 - 0.03), w - 0.12, top + 0.24, 0.06, 1);
  }
}
function potMat(v) {
  if (v === 0) return std('potclay', { map: clayPotTex(), roughness: 0.65 });
  if (v === 1) return std('pottalavera', { map: talaveraTex(), roughness: 0.18 });
  return std('potrosa', { map: rosaPotTex(), roughness: 0.3 });
}
const clayPotTex = () => canvasTex('clay', 512, 256, (g) => {
  g.fillStyle = '#c0592b'; g.fillRect(0, 0, 512, 256);
  noise2d(g, 512, 256, 1200, ['#a0461f', '#d97a45'], 0.1, 0.3, 1, 3);
  g.fillStyle = F.cream; g.fillRect(0, 60, 512, 8); g.fillRect(0, 170, 512, 6);
  for (let x = 32; x < 512; x += 64) { flower2d(g, x, 118, 26, 8, F.cream, F.yellow, F.red); leaf2d(g, x + 18, 128, 26, 0.3, F.green); leaf2d(g, x - 18, 128, 26, Math.PI - 0.3, F.green); }
  g.fillStyle = F.ink; for (let x = 8; x < 512; x += 16) { g.beginPath(); g.arc(x, 200, 4, 0, 7); g.fill(); }
});
const talaveraTex = () => canvasTex('talavera', 512, 256, (g) => {
  g.fillStyle = '#f7f3ea'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#1b3fae'; g.fillRect(0, 30, 512, 18); g.fillRect(0, 210, 512, 18);
  g.fillStyle = F.yellow; g.fillRect(0, 48, 512, 6); g.fillRect(0, 204, 512, 6);
  for (let x = 42; x < 512; x += 84) { flower2d(g, x, 128, 44, 10, '#1b3fae', '#2d5bd6', F.yellow); flower2d(g, x + 42, 92, 16, 6, F.marigold, null, '#1b3fae'); flower2d(g, x + 42, 168, 16, 6, F.green, null, '#1b3fae'); }
});
const rosaPotTex = () => canvasTex('rosapot', 512, 256, (g) => {
  g.fillStyle = F.rosa; g.fillRect(0, 0, 512, 256);
  g.fillStyle = F.turquoise; g.fillRect(0, 40, 512, 22);
  zigzag(g, 0, 512, 62, 18, 32, F.turquoise);
  for (let x = 40; x < 512; x += 80) flower2d(g, x, 150, 30, 8, F.yellow, F.cream, F.red);
  g.fillStyle = F.purple; g.fillRect(0, 200, 512, 24);
});
const basketTex = () => canvasTex('basket', 256, 256, (g) => {
  g.fillStyle = '#b8863e'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 16) { g.fillStyle = ((x + y) / 16) % 2 ? '#d9a858' : '#9a6a28'; g.beginPath(); g.ellipse(x + 8, y + 8, 8, 5, ((x + y) / 16) % 2 ? 0.4 : -0.4, 0, 7); g.fill(); }
  g.fillStyle = F.rosa; g.fillRect(0, 40, 256, 12); g.fillStyle = F.turquoise; g.fillRect(0, 200, 256, 12);
});
function potGeo() {
  return G('potlathe', () => new THREE.LatheGeometry([[0, 0], [0.5, 0], [0.72, 0.1], [0.94, 0.34], [1, 0.5], [0.92, 0.68], [0.62, 0.84], [0.46, 0.9], [0.52, 0.96], [0.56, 1], [0.46, 1], [0.4, 0.9]].map(([r, y]) => new THREE.Vector2(r, y)), 24));
}
function basketGeo() {
  return G('basketlathe', () => new THREE.LatheGeometry([[0, 0], [0.7, 0], [0.82, 0.1], [1, 0.9], [1.04, 1], [0.95, 1], [0.92, 0.9]].map(([r, y]) => new THREE.Vector2(r, y)), 20));
}
function pot(b, x, y, z, r, h, v, ry = 0) { b.add(potGeo(), potMat(v), T(x, y, z, 0, ry, 0, r, h, r)); }
function basket(b, x, y, z, r, h) { b.add(basketGeo(), std('basket', { map: basketTex(), roughness: 0.85 }), T(x, y, z, 0, 0, 0, r, h, r)); }

function candle(b, x, y, z, s = 1, kind = 'taper', glass = F.red) {
  b.push(T(x, y, z, 0, 0, 0, s));
  if (kind === 'taper') {
    b.cyl(col('#fff3d6', 0.5), 0, 0.12, 0, 0.032, 0.24, 10);
    b.cyl(col('#2a1a10', 0.9), 0, 0.255, 0, 0.004, 0.03, 4);
    b.ball(flameMat(), 0, 0.29, 0, 0.022, 0.05, 0.022);
  } else {
    b.cyl(std('glass' + glass, { color: glass, roughness: 0.15, metalness: 0.1, emissive: glass, emissiveIntensity: 0.25 }), 0, 0.1, 0, 0.06, 0.2, 14);
    b.cyl(col(F.cream, 0.6), 0, 0.1, 0, 0.0615, 0.08, 14);
    b.cyl(col('#fff3d6', 0.5), 0, 0.2, 0, 0.055, 0.004, 14);
    b.ball(flameMat(), 0, 0.235, 0, 0.022, 0.05, 0.022);
  }
  b.pop();
}
function panDeMuerto(b, x, y, z, s = 1) {
  b.push(T(x, y, z, 0, 0, 0, s));
  b.ball(col('#c47a32', 0.6), 0, 0.03, 0, 0.11, 0.07, 0.11);
  for (const a of [0, Math.PI / 2]) b.box(col('#b06a28', 0.6), 0, 0.085, 0, 0.2, 0.025, 0.035, a);
  b.ball(col('#b06a28', 0.6), 0, 0.105, 0, 0.03);
  b.pop();
}
function photo(b, x, y, z, w, h, half, frameCol, ry = 0) {
  b.push(T(x, y, z, -0.12, ry, 0));
  b.box(painted(frameCol), 0, h / 2, 0, w, h, 0.03);
  b.add(planeGeo(w * 0.78, h * 0.8, half * 0.5, half * 0.5 + 0.5, 0, 1), std('photo', { map: photoTex(), roughness: 0.4 }), T(0, h / 2, 0.016));
  b.pop();
}
function skullDecor(b, x, y, z, s, ry = 0) {
  const a = makeSkullAssets({ segments: s > 1 ? 56 : 36 });
  for (let i = 0; i < a.geometries.length; i++) b.add(a.geometries[i], a.materials[i], T(x, y + 0.245 * s, z, 0, ry, 0, s));
}
// Papel picado strip of n flags between x0..x1, top edge at y (vertex-coloured).
function papelRow(b, x0, x1, y, z, n, fh, rng, ry = 0) {
  const fw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) b.add(planeGeo(fw * 0.92, fh), papelMat(), T(x0 + fw * (i + 0.5), y - fh / 2, z, 0, ry, 0), pick(rng, PAPEL_COLORS));
}
const papelMat = () => std('papelvc', { map: papelTexture(), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.6, emissive: '#200010', emissiveIntensity: 0.2 });

// Boxy boat hull along Z: sides at x=±hw from y0 (bottom, ends inset) to y1 (top, ends at ±L/2).
function hull(b, { L, hw, y0, y1, inset, matPX, matNX = matPX, matEnd = matPX, uvRep = 4.3, uvSide }) {
  const zt = L / 2, zb = L / 2 - inset, H = y1 - y0;
  for (const s of [1, -1]) {
    const x = s * hw;
    const pts = [V(x, y0, -zb), V(x, y0, zb), V(x, y1, zt), V(x, y1, -zt)];
    const uvs = uvSide ? pts.map((p) => uvSide(p, s)) : pts.map((p) => [(-s * p.z) / uvRep, (p.y - y0) / H]);
    b.add(quadGeo(pts, uvs, V(s, 0, 0)), s > 0 ? matPX : matNX);
  }
  for (const s of [1, -1]) {
    const pts = [V(-hw, y0, s * zb), V(hw, y0, s * zb), V(hw, y1, s * zt), V(-hw, y1, s * zt)];
    b.add(quadGeo(pts, pts.map((p) => [(s * p.x + hw) / uvRep, (p.y - y0) / H]), V(0, 0.3 * (s > 0 ? 0 : 0), s)), matEnd);
  }
  b.add(quadGeo([V(-hw, y0, -zb), V(hw, y0, -zb), V(hw, y0, zb), V(-hw, y0, zb)], [[0, 0], [1, 0], [1, 1], [0, 1]], V(0, -1, 0)), col('#0b2a2c', 0.9));
}
const hullMat = (pi) => std('hull' + pi, { map: hullTex(pi), roughness: 0.32, metalness: 0.0 });

// ---------------------------------------------------------------- candy skull
const gauss = (da, de, s) => Math.exp(-(da * da + de * de) / (2 * s * s));
function skullPoint(a, e, off, out) {
  const se = Math.sin(e);
  let r = 0.215;
  for (const s of [-1, 1]) {
    r -= 0.042 * gauss((a - s * 0.42) * se, e - 1.33, 0.15);            // eye sockets
    r += 0.016 * gauss((a - s * 0.68) * se, e - 1.62, 0.12);            // cheekbones
    r -= 0.012 * gauss((a - s * 1.2) * se, e - 1.2, 0.2);               // temples
  }
  r -= 0.026 * gauss(a * se * 1.5, e - 1.66, 0.06);                      // nasal cavity
  r += 0.012 * gauss(a * 0.55, e - 1.08, 0.12);                          // brow ridge
  r -= 0.008 * gauss(a * 0.45 * se, e - 1.98, 0.04);                     // mouth line
  r += off;
  let x = Math.sin(e) * Math.sin(a) * r, y = Math.cos(e) * r, z = Math.sin(e) * Math.cos(a) * r;
  const jaw = smooth(1.72, 2.75, e);
  x *= (1 - 0.3 * jaw) * (e < 1.4 ? 1.04 : 1);
  z *= z > 0 ? (1 - 0.12 * jaw) * 0.9 : (1 - 0.25 * jaw) * 1.02;
  y *= 1.12;
  if (y < -0.2) y = -0.2 + (y + 0.2) * 0.75;                             // flattened chin
  return out.set(x, y + 0.012, z);
}
function skullSurface(a0, a1, e0, e1, nx, ny, off, localUV) {
  const pos = [], uv = [], idx = [], p = new THREE.Vector3();
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const a = lerp(a0, a1, i / nx), e = lerp(e0, e1, j / ny);
    skullPoint(a, e, off, p); pos.push(p.x, p.y, p.z);
    if (localUV) uv.push(i / nx, 1 - j / ny); else uv.push(0.5 + a / (Math.PI * 2), 1 - e / Math.PI);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * (nx + 1) + i;
    idx.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Sculpted calavera de azúcar ~0.5 tall, face toward +Z. Pairs: [sugar body, metallic foil forehead].
// Optional { segments } trades detail for triangles (default 72 → ~6k tris).
export function makeSkullAssets({ segments = 72 } = {}) {
  return memo(MISC, 'skull' + segments, () => {
    const ny = Math.round(segments * 0.66);
    const body = skullSurface(-Math.PI, Math.PI, 0.0001, Math.PI - 0.0001, segments, ny, 0, false);
    const foil = skullSurface(-0.5, 0.5, 0.42, 1.08, 20, 14, 0.004, true);
    const bodyMat = new THREE.MeshPhysicalMaterial({ map: sugarSkullTexture(), roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.35, emissive: '#ffffff', emissiveMap: sugarSkullTexture(), emissiveIntensity: 0.22 });
    const foilMat = new THREE.MeshStandardMaterial({ map: foilTex(), alphaTest: 0.5, metalness: 0.85, roughness: 0.22, emissive: '#ff2f95', emissiveIntensity: 0.35, emissiveMap: foilTex(), polygonOffset: true, polygonOffsetFactor: -2 });
    return { geometries: [body, foil], materials: [bodyMat, foilMat] };
  });
}
function skullGroup() {
  const a = makeSkullAssets(), g = new THREE.Group();
  a.geometries.forEach((geo, i) => g.add(new THREE.Mesh(geo, a.materials[i])));
  return g;
}

// ---------------------------------------------------------------- obstacles (floating)
function buildCrate(b, v) {
  const rng = mulberry32(101 + v);
  logRaft(b, 1.5, 0.9, 0.05);
  if (v % 2 === 0) {
    crate(b, -0.37, 0.07, 0, 0.72, 0.42, 0.84, 0, painted(F.rosa));
    crate(b, 0.37, 0.07, 0.01, 0.72, 0.38, 0.82, 0, painted(F.turquoise));
    flowerMound(b, rng, { x: -0.37, y0: 0.45, rx: 0.27, rz: 0.33, top: 0.68, n: 34, colors: MARIGOLDS });
    flowerMound(b, rng, { x: 0.37, y0: 0.41, rx: 0.27, rz: 0.33, top: 0.62, n: 32, colors: [...ROSAS, F.yellow] });
  } else {
    crate(b, 0, 0.07, 0, 1.44, 0.38, 0.84, 0, painted(F.red), std('fillflower', { map: flowerFillTex(), roughness: 0.8 }));
    crate(b, -0.33, 0.45, 0, 0.62, 0.24, 0.6, 0.05, painted(F.yellow), std('fillorange', { map: fruitTex('#ff8a1c', '#ffd08a', 'or'), roughness: 0.5 }));
    flowerMound(b, rng, { x: 0.38, y0: 0.42, rx: 0.3, rz: 0.3, top: 0.66, n: 30, colors: MIXED });
    flowerMound(b, rng, { x: -0.33, y0: 0.66, rx: 0.22, rz: 0.2, top: 0.69, n: 10, colors: MARIGOLDS, leaves: false });
  }
}
function buildPots(b, v) {
  const rng = mulberry32(202 + v);
  b.add(UCYL(28), woodMat(), T(0, -0.1, 0, 0, 0, 0, 0.79, 0.26, 0.445));
  b.add(new THREE.TorusGeometry(1, 0.08, 8, 32), painted(v % 2 ? F.rosa : F.turquoise), T(0, 0.02, 0, Math.PI / 2, 0, 0, 0.74, 0.4, 0.4));
  const y = 0.04;
  pot(b, 0, y, -0.08, 0.36, 0.46, (v + 0) % 3);
  pot(b, -0.55, y, -0.1, 0.23, 0.34, (v + 1) % 3, 1);
  pot(b, 0.55, y, -0.1, 0.23, 0.36, (v + 2) % 3, 2);
  pot(b, -0.32, y, 0.3, 0.12, 0.2, (v + 2) % 3);
  pot(b, 0.32, y, 0.3, 0.12, 0.22, (v + 1) % 3);
  flowerMound(b, rng, { x: 0, z: -0.08, y0: y + 0.44, rx: 0.24, rz: 0.24, top: 0.6, n: 22, colors: MARIGOLDS });
  flowerMound(b, rng, { x: -0.55, z: -0.1, y0: y + 0.33, rx: 0.16, rz: 0.16, top: 0.5, n: 10, colors: ROSAS });
  flowerMound(b, rng, { x: 0.55, z: -0.1, y0: y + 0.35, rx: 0.16, rz: 0.16, top: 0.52, n: 10, colors: [F.yellow, '#ffb300', F.red] });
  for (const s of [-1, 1]) b.flower(s * 0.32, y + 0.25, 0.3, 0.75, s > 0 ? F.red : F.marigold);
}
function buildFence(b, v) {
  const rng = mulberry32(303 + v);
  b.cyl(darkWoodMat(), 0, -0.02, 0, 0.09, 1.9, 10, 0, 0, Math.PI / 2);
  const xs = [-0.86, -0.57, -0.29, 0, 0.29, 0.57, 0.86], tops = [];
  xs.forEach((x, i) => {
    const h = 0.6 + rng() * 0.08 + (i % 2 ? 0 : 0.04);
    const z = i % 2 ? 0.05 : -0.05;
    b.cyl(darkWoodMat(), x, (h - 0.45) / 2, z, 0.05, h + 0.45, 8, (rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.06);
    b.add(G('stakecap', () => new THREE.ConeGeometry(1, 1, 8)), darkWoodMat(), T(x, h + 0.03, z, 0, 0, 0, 0.05, 0.06, 0.05));
    b.cyl(painted(PAPEL_COLORS[i % PAPEL_COLORS.length]), x, h - 0.08, z, 0.054, 0.07, 8);
    tops.push(V(x, h - 0.1, z + (i % 2 ? 0.05 : 0.09)));
  });
  // rope swags between stakes with papel picado and marigolds
  const ropeMat = col('#e8d8b0', 0.9);
  for (let i = 0; i < tops.length - 1; i++) {
    const a = tops[i], c = tops[i + 1], mid = a.clone().lerp(c, 0.5); mid.y -= 0.1; mid.z = 0.1;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, c);
    b.add(new THREE.TubeGeometry(curve, 10, 0.012, 5, false), ropeMat);
    const pm = curve.getPoint(0.5);
    b.add(planeGeo(0.2, 0.22), papelMat(), T(pm.x, pm.y - 0.12, 0.11, 0, 0, 0), PAPEL_COLORS[(i * 3 + v) % PAPEL_COLORS.length]);
    for (const t of [0.15, 0.85]) { const q = curve.getPoint(t); b.flower(q.x, q.y - 0.02, 0.05, 0.62, pick(rng, MIXED), 1.2, rng() * 6, 0); }
  }
}
function buildOfrenda(b, v) {
  b.fd = 1;
  const rng = mulberry32(404 + v);
  plankRaft(b, 1.9, 1.2, 0.05, F.turquoise);
  const c1 = std('cloth' + (v % 4), { map: clothTex(v % 4), roughness: 0.8 }), c2 = std('cloth' + ((v + 1) % 4), { map: clothTex((v + 1) % 4), roughness: 0.8 });
  const y0 = 0.05, t1 = 0.85, t2 = 1.6, t3 = 2.22;
  b.tbox(c1, 0, (y0 + t1) / 2, 0, 1.86, t1 - y0, 1.16, 0.8);
  b.tbox(c2, 0, (t1 + t2) / 2, -0.225, 1.5, t2 - t1, 0.7, 0.8);
  b.tbox(c1, 0, (t2 + t3) / 2, -0.4, 1.16, t3 - t2, 0.36, 0.8);
  // backdrop inside the marigold arch
  const sh = new THREE.Shape(); sh.moveTo(-0.84, t1); sh.lineTo(-0.84, 1.95); sh.absarc(0, 1.95, 0.84, Math.PI, 0, true); sh.lineTo(0.84, t1); sh.closePath();
  b.add(new THREE.ShapeGeometry(sh, 24), std('backdrop' + v, { map: clothTex((v + 2) % 4), roughness: 0.8, side: THREE.DoubleSide }), T(0, 0, -0.585));
  // papel picado fringes on tier edges
  papelRow(b, -0.93, 0.93, t1 - 0.01, 0.586, 6, 0.26, rng);
  papelRow(b, -0.75, 0.75, t2 - 0.01, 0.131, 5, 0.22, rng);
  papelRow(b, -0.58, 0.58, t3 - 0.01, -0.214, 4, 0.18, rng);
  // marigold arch
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push(V(-0.84, t1 + (1.95 - t1) * i / 8, -0.5));
  for (let i = 1; i < 24; i++) { const a = Math.PI - (i / 24) * Math.PI; pts.push(V(Math.cos(a) * 0.84, 1.95 + Math.sin(a) * 0.84, -0.5)); }
  for (let i = 8; i >= 0; i--) pts.push(V(0.84, t1 + (1.95 - t1) * i / 8, -0.5));
  const curve = new THREE.CatmullRomCurve3(pts);
  b.add(new THREE.TubeGeometry(curve, 60, 0.05, 6, false), col('#2f6b1f', 0.8));
  const N = 70;
  for (let i = 0; i < N; i++) {
    const p = curve.getPointAt(i / (N - 1));
    for (const dz of [0.04, -0.04]) b.flower(p.x * (Math.abs(p.x) > 0.8 ? 0.99 : 1), Math.min(p.y, 2.79), p.z + dz, 0.7, i % 9 === 4 ? F.rosa : pick(rng, MARIGOLDS), rng() * 6, rng() * 6, rng() * 6);
  }
  // tier 1 items
  [-0.8, -0.5, 0.5, 0.8].forEach((x, i) => candle(b, x, t1, 0.44, 1, 'veladora', [F.red, F.rosa, F.turquoise, F.purple][i]));
  skullDecor(b, -0.17, t1, 0.4, 0.55, 0.2); skullDecor(b, 0.17, t1, 0.4, 0.55, -0.2);
  panDeMuerto(b, -0.62, t1, 0.18); panDeMuerto(b, 0.62, t1, 0.18);
  for (let i = 0; i < 12; i++) b.flower(-0.88 + i * 0.16, t1 + 0.03, 0.53, 0.62, i % 2 ? F.marigold : F.yellow, 0.4, 0, 0);
  for (const x of [-0.3, 0, 0.3]) b.ball(col(F.orange, 0.45), x, t1 + 0.05, 0.2, 0.05);
  // tier 2
  photo(b, -0.42, t2, -0.32, 0.3, 0.38, 0, F.yellow); photo(b, 0.42, t2, -0.32, 0.3, 0.38, 1, F.rosa);
  for (const x of [-0.65, -0.15, 0.15, 0.65]) candle(b, x, t2, 0.02, 1, 'taper');
  skullDecor(b, 0, t2, -0.05, 0.6);
  // tier 3
  photo(b, 0, t3, -0.45, 0.36, 0.44, 0, F.marigold);
  for (const s of [-1, 1]) { candle(b, s * 0.45, t3, -0.35, 1, 'taper'); skullDecor(b, s * 0.26, t3, -0.32, 0.4, -s * 0.3); }
}
function buildTower(b, v) {
  b.fd = 1;
  const rng = mulberry32(505 + v);
  plankRaft(b, 1.7, 1.1, 0.05, v % 2 ? F.rosa : F.cobalt);
  const fills = [std('fillorange', { map: fruitTex('#ff8a1c', '#ffd08a', 'or'), roughness: 0.5 }), std('filllime', { map: fruitTex('#5fb52a', '#c8f27a', 'li'), roughness: 0.5 }),
    std('filltomato', { map: fruitTex('#e0201a', '#ff9a8a', 'to'), roughness: 0.4 }), std('fillflower', { map: flowerFillTex(), roughness: 0.8 })];
  crate(b, -0.42, 0.05, 0, 0.82, 0.6, 1.06, 0, painted(F.red), fills[0]);
  crate(b, 0.42, 0.05, 0, 0.82, 0.6, 1.06, 0, painted(F.turquoise), fills[1]);
  crate(b, -0.41, 0.65, 0.01, 0.8, 0.55, 1.0, 0.03, painted(F.yellow), fills[2]);
  crate(b, 0.42, 0.65, -0.01, 0.8, 0.55, 1.0, -0.02, painted(F.purple), fills[3]);
  crate(b, 0.03, 1.2, 0, 1.0, 0.5, 0.9, 0.06, painted(F.rosa), fills[(v + 3) % 4]);
  basket(b, 0, 1.7, 0, 0.42, 0.4);
  flowerMound(b, rng, { y0: 2.0, rx: 0.36, rz: 0.36, top: 2.48, n: 42, colors: MIXED });
  // garlands hanging down the front
  for (let i = 0; i < 16; i++) { const t = i / 15; b.flower(lerp(-0.75, 0.75, t), 1.18 - Math.sin(t * Math.PI) * 0.18, 0.45, 0.6, i % 4 ? F.marigold : F.rosa, 1.3, 0, 0); }
}
function buildStall(b, v, L) {
  const p = pal(v), text = STALL_SIGNS[v % STALL_SIGNS.length], rng = mulberry32(606 + v);
  const deck = 0.5, hw = 0.95;
  hull(b, { L, hw, y0: -0.32, y1: deck, inset: 0.25, matPX: hullMat(v), uvRep: 2.2 });
  for (const s of [-1, 1]) b.box(painted(p.b), s * 0.92, deck + 0.02, 0, 0.06, 0.08, L, 0);
  b.add(quadGeo([V(-0.9, deck, -L / 2), V(0.9, deck, -L / 2), V(0.9, deck, L / 2), V(-0.9, deck, L / 2)], [[0, 0], [1, 0], [1, L * 0.5], [0, L * 0.5]], V(0, 1, 0)), woodMat());
  // counters along both sides with goods
  const sideM = std('stallside' + v, { map: stallSideTex(v), roughness: 0.5 });
  for (const s of [-1, 1]) b.add(quadGeo([V(s * hw, deck, -L / 2 + 0.06), V(s * hw, deck, L / 2 - 0.06), V(s * hw, 1.15, L / 2 - 0.06), V(s * hw, 1.15, -L / 2 + 0.06)],
    [[0, 0], [L / 2, 0], [L / 2, 0.42], [0, 0.42]], V(s, 0, 0)), sideM);
  for (const s of [-1, 1]) b.tbox(painted(p.d), s * 0.86, 1.15, 0, 0.18, 0.05, L - 0.1, 1);
  const fillsAll = [std('fillorange', { map: fruitTex('#ff8a1c', '#ffd08a', 'or'), roughness: 0.5 }), std('filllime', { map: fruitTex('#5fb52a', '#c8f27a', 'li'), roughness: 0.5 }), std('filltomato', { map: fruitTex('#e0201a', '#ff9a8a', 'to'), roughness: 0.4 })];
  for (let z = -L / 2 + 0.7; z < L / 2 - 0.9; z += 0.75) for (const s of [-1, 1]) {
    const k = (rng() * 4) | 0;
    if (text === 'FLORES' || k === 3) flowerMound(b, rng, { x: s * 0.6, z, y0: 1.17, rx: 0.22, rz: 0.26, top: 1.36, n: 12, colors: MIXED });
    else if (text === 'AGUAS') { b.cyl(std('agua' + k, { color: [F.rosa, F.lime, F.marigold][k % 3], roughness: 0.08, transparent: true, opacity: 0.85 }), s * 0.6, 1.36, z, 0.17, 0.4, 18); b.cyl(col(F.cream, 0.3), s * 0.6, 1.57, z, 0.12, 0.03, 14); }
    else crate(b, s * 0.6, 1.17, z, 0.42, 0.24, 0.56, (rng() - 0.5) * 0.2, painted(pick(rng, [F.cream, p.c, p.b])), pick(rng, fillsAll), 2);
  }
  // posts and awning
  const postM = painted(p.c);
  for (let z = -L / 2 + 0.1; z <= L / 2 - 0.05; z += (L - 0.2) / Math.max(1, Math.round((L - 0.2) / 2.2))) for (const s of [-1, 1]) b.box(postM, s * 0.9, (deck + 2.12) / 2, Math.min(z, L / 2 - 0.1), 0.07, 2.12 - deck, 0.07);
  const aw = std('awning' + v, { map: awningStripeTex(v), roughness: 0.6, side: THREE.DoubleSide });
  for (const s of [-1, 1]) b.add(quadGeo([V(s * hw, 2.1, L / 2), V(s * hw, 2.1, -L / 2), V(0, 2.7, -L / 2), V(0, 2.7, L / 2)], [[L / 2, 0], [0, 0], [0, 1], [L / 2, 1]], V(s, 1, 0)), aw);
  const val = std('valance' + v, { map: valanceTex(v), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
  for (const s of [-1, 1]) b.add(quadGeo([V(s * hw, 1.9, -L / 2), V(s * hw, 1.9, L / 2), V(s * hw, 2.1, L / 2), V(s * hw, 2.1, -L / 2)], [[0, 0], [L / 1.6, 0], [L / 1.6, 1], [0, 1]], V(s, 0, 0)), val);
  for (const s of [-1, 1]) b.add(triGeo(V(-hw, 2.1, s * L / 2), V(hw, 2.1, s * L / 2), V(0, 2.7, s * L / 2), V(0, 0, s)), painted(p.b));
  // closed painted front panel with sign; plain back
  b.add(planeGeo(1.9, 2.1 - deck + 0.04), std('stallfront' + v, { map: stallFrontTex(text, v), roughness: 0.45 }), T(0, (deck + 2.1) / 2, L / 2 - 0.02));
  b.add(planeGeo(1.9, 2.1 - deck), sideM, T(0, (deck + 2.1) / 2, -L / 2 + 0.02, 0, Math.PI, 0));
  for (let i = 0; i < 13; i++) { const t = i / 12, x = lerp(-0.9, 0.9, t), y = 2.08 + (1 - Math.abs(x) / 0.95) * 0.56; b.flower(x, y - 0.05, L / 2 - 0.08, 0.6, i % 3 ? F.marigold : F.rosa, 1.4, 0, 0); }
}

export function makeObstacle(kind, variant = 0, len) {
  const v = Math.abs(variant | 0);
  let g;
  switch (kind) {
    case 'crate': g = cached('crate' + (v % 2), (b) => buildCrate(b, v % 2)); break;
    case 'pots': g = cached('pots' + (v % 3), (b) => buildPots(b, v % 3)); break;
    case 'fence': g = cached('fence' + (v % 2), (b) => buildFence(b, v % 2)); break;
    case 'ofrenda': g = cached('ofrenda' + (v % 4), (b) => buildOfrenda(b, v % 4)); break;
    case 'tower': g = cached('tower' + (v % 2), (b) => buildTower(b, v % 2)); break;
    case 'stall': {
      const L = Math.max(2, len ?? 6), Lr = Math.max(2, Math.round(L * 2) / 2);
      const inner = cached(`stall${v % 6}/${Lr}`, (b) => buildStall(b, v % 6, Lr));
      inner.scale.z = L / Lr;
      g = new THREE.Group(); g.add(inner);
      g.userData.box = { ...OBSTACLE_BOXES.stall, len: L };
      return g;
    }
    default: throw new Error('makeObstacle: unknown kind ' + kind);
  }
  g.userData.box = { ...OBSTACLE_BOXES[kind] };
  return g;
}

// ---------------------------------------------------------------- trajineras
function buildDeckHull(b, pi, L) {
  const p = pal(pi), y0 = -0.45, H = DECK_Y - y0;
  hull(b, { L, hw: 0.93, y0, y1: DECK_Y, inset: 0.3, matPX: hullMat(pi), uvRep: H * 2 });
  b.add(quadGeo([V(-0.93, DECK_Y, -L / 2), V(0.93, DECK_Y, -L / 2), V(0.93, DECK_Y, L / 2), V(-0.93, DECK_Y, L / 2)],
    [[-L * 0.18, -0.47], [-L * 0.18, 0.47], [L * 0.18, 0.47], [L * 0.18, -0.47]], V(0, 1, 0)), woodMat());
  for (const s of [-1, 1]) {
    b.box(painted(p.b), s * 0.91, DECK_Y, 0, 0.08, 0.18, L);
    b.box(painted(p.d), 0, DECK_Y, s * (L / 2 - 0.04), 1.86, 0.18, 0.08);
    b.box(col(p.c, 0.35), s * 0.94, 0.45, 0, 0.02, 0.1, L - 0.5);
  }
  const rng = mulberry32(700 + pi);
  for (let z = -L / 2 + 1.1; z <= L / 2 - 1.1; z += 1.6) for (const s of [-1, 1]) {
    b.box(painted(p.c), s * 0.78, DECK_Y + 0.06, z, 0.16, 0.12, 0.5);
    for (const dz of [-0.16, 0, 0.16]) b.flower(s * 0.78, DECK_Y + 0.16, z + dz, 0.6, pick(rng, MIXED), 0, rng() * 6, 0);
  }
}
function buildDeckArch(b, name, pi, s) {
  const p = pal(pi), yb = DECK_Y + 2.62, w = 1.9 * s, h = w / 2, rng = mulberry32(800 + pi);
  const top = yb + (s > 0.9 ? 0.25 : 0.06);
  for (const sx of [-1, 1]) {
    b.box(painted(p.b), sx * 0.88, (DECK_Y + top) / 2, 0, 0.09, top - DECK_Y, 0.09);
    for (let y = DECK_Y + 0.35; y < yb - 0.1; y += 0.3) b.flower(sx * 0.86, y, 0.07, 0.5, pick(rng, MIXED), 1.2, rng() * 6, 0);
    b.flower(sx * 0.88, top + 0.04, 0, 0.7, F.rosa);
  }
  b.box(painted(p.d), 0, yb + 0.03, 0, 1.85, 0.06, 0.08);
  const am = std('arch' + name + pi, { map: nameArchTexture(name, pi), alphaTest: 0.5, roughness: 0.45 });
  b.add(planeGeo(w, h), am, T(0, yb + h / 2, 0.05));
  b.add(planeGeo(w, h), am, T(0, yb + h / 2, -0.05, 0, Math.PI, 0));
}
function chair(b, x, y, z, s, c) {
  const m = painted(c);
  b.box(m, x, y + 0.45, z, 0.4, 0.05, 0.4);
  b.box(m, x + s * 0.19, y + 0.74, z, 0.04, 0.55, 0.4);
  b.box(painted(F.cream), x + s * 0.2, y + 0.85, z, 0.045, 0.1, 0.32);
  for (const dx of [-0.17, 0.17]) for (const dz of [-0.17, 0.17]) b.box(m, x + dx, y + 0.22, z + dz, 0.04, 0.45, 0.04);
}
function buildDecorBoat(b, pi, name, L) {
  const p = pal(pi), hw = 1.2, deck = 0.5, rng = mulberry32(900 + pi);
  hull(b, { L, hw, y0: -0.35, y1: 0.55, inset: 0.45, matPX: std('hulldecor' + pi, { map: hullTex(pi), roughness: 0.32 }), uvRep: 1.8 });
  b.add(quadGeo([V(-1.15, deck, -L / 2), V(1.15, deck, -L / 2), V(1.15, deck, L / 2), V(-1.15, deck, L / 2)], [[-L * 0.18, -0.6], [-L * 0.18, 0.6], [L * 0.18, 0.6], [L * 0.18, -0.6]], V(0, 1, 0)), woodMat());
  for (const s of [-1, 1]) { b.box(painted(p.b), s * 1.17, 0.58, 0, 0.07, 0.12, L); b.box(painted(p.d), 0, 0.58, s * (L / 2 - 0.04), 2.34, 0.12, 0.08); }
  const tl = L - 2.6;
  b.tbox(std('mantel' + (pi % 4), { map: clothTex(pi % 4), roughness: 0.8 }), 0, deck + 0.42, 0, 0.8, 0.06, tl, 0.8);
  for (const dx of [-0.32, 0.32]) for (const dz of [-tl / 2 + 0.1, tl / 2 - 0.1]) b.box(woodMat(), dx, deck + 0.2, dz, 0.05, 0.4, 0.05);
  for (let z = -tl / 2 + 0.3, i = 0; z <= tl / 2 - 0.3; z += 0.72, i++) for (const s of [-1, 1]) chair(b, s * 0.68, deck, z, s, [p.a, p.c, p.d, F.red][(i + (s > 0 ? 1 : 0)) % 4]);
  for (let i = 0; i < 4; i++) b.ball(col(pick(rng, [F.red, F.rosa, F.turquoise]), 0.3), (rng() - 0.5) * 0.4, deck + 0.5, (rng() - 0.5) * tl * 0.8, 0.06, 0.09, 0.06);
  const zr = L / 2 - 0.4, nPost = Math.max(2, Math.round((2 * zr) / 2) + 1);
  for (let i = 0; i < nPost; i++) for (const s of [-1, 1]) b.box(painted(p.b), s * 1.12, (deck + 2.35) / 2, lerp(-zr, zr, i / (nPost - 1)), 0.08, 2.35 - deck, 0.08);
  const fas = std('fascia' + pi, { map: hullTex(pi), roughness: 0.4, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    b.add(quadGeo([V(s * hw, 2.3, -zr), V(s * hw, 2.3, zr), V(s * hw, 2.68, zr), V(s * hw, 2.68, -zr)], [[0, 0.35], [L / 0.76, 0.35], [L / 0.76, 1], [0, 1]], V(s, 0, 0)), fas);
    b.add(quadGeo([V(-hw, 2.3, s * zr), V(hw, 2.3, s * zr), V(hw, 2.68, s * zr), V(-hw, 2.68, s * zr)], [[0, 0.35], [3.2, 0.35], [3.2, 1], [0, 1]], V(0, 0, s)), fas);
    b.add(quadGeo([V(s * hw, 2.68, zr), V(s * hw, 2.68, -zr), V(0, 2.95, -zr), V(0, 2.95, zr)], [[L / 2, 0], [0, 0], [0, 1], [L / 2, 1]], V(s, 1, 0)), std('awning' + pi, { map: awningStripeTex(pi), roughness: 0.6, side: THREE.DoubleSide }));
    b.add(triGeo(V(-hw, 2.68, s * zr), V(hw, 2.68, s * zr), V(0, 2.95, s * zr), V(0, 0, s)), painted(p.c));
  }
  b.add(quadGeo([V(-hw, 2.3, -zr), V(hw, 2.3, -zr), V(hw, 2.3, zr), V(-hw, 2.3, zr)], [[0, 0], [1, 0], [1, L / 2], [0, L / 2]], V(0, -1, 0)), painted(F.cream));
  const am = std('arch' + name + pi, { map: nameArchTexture(name, pi), alphaTest: 0.5, roughness: 0.45 });
  b.add(planeGeo(2.4, 1.2), am, T(0, 2.4 + 0.6, zr + 0.03));
  b.add(planeGeo(2.4, 1.2), am, T(0, 2.4 + 0.6, zr - 0.03, 0, Math.PI, 0));
  for (let i = 0; i < 9; i++) b.flower(lerp(-1.05, 1.05, i / 8), 0.68, L / 2 - 0.1, 0.7, i % 3 ? F.marigold : F.rosa, 0.5, 0, 0);
  b.cyl(woodMat(), 0.85, 1.9, -L / 2 + 0.5, 0.03, 4.6, 6, -0.35, 0, -0.1);
}
function buildSmallBoat(b, pi, name) {
  b.fd = 1;
  const p = pal(pi), rng = mulberry32(1000 + pi);
  b.push(T(0, 0, 0, 0, Math.PI / 2, 0)); // build along local Z, which maps to world +X
  const nameMat = std('smallname' + name + pi, { map: smallBoatNameTex(name, pi), roughness: 0.32 });
  hull(b, { L: 3.4, hw: 0.62, y0: -0.25, y1: 0.45, inset: 0.28, matPX: hullMat(pi), matNX: nameMat,
    uvSide: (pt, s) => (s < 0 ? [(pt.z + 1.7) / 3.4, (pt.y + 0.25) / 0.7] : [(-pt.z) / 1.4, (pt.y + 0.25) / 0.7]) });
  for (const s of [-1, 1]) { b.box(painted(p.b), s * 0.62, 0.48, 0, 0.06, 0.08, 3.4); b.box(painted(p.d), 0, 0.48, s * 1.66, 1.18, 0.08, 0.08); }
  b.add(quadGeo([V(-0.6, 0.3, -1.68), V(0.6, 0.3, -1.68), V(0.6, 0.3, 1.68), V(-0.6, 0.3, 1.68)], [[0, 0], [1, 0], [1, 3], [0, 3]], V(0, 1, 0)), darkWoodMat());
  for (const z of [-0.9, 0, 0.9]) b.add(bushGeo(), leafMat(), T(0, 0.3, z, 0, z, 0, 1.4, 0.75, 1.6));
  flowerMound(b, rng, { y0: 0.36, rx: 0.46, rz: 1.38, top: 0.76, n: 120, colors: MIXED, leaves: false });
  b.pop();
}
export function makeTrajinera({ len = 8, palette = 0, name = 'Lupita', style = 'deck' } = {}) {
  const pi = ((palette | 0) % FOLK_PALETTES.length + FOLK_PALETTES.length) % FOLK_PALETTES.length;
  if (style === 'small') {
    const g = cached(`tsmall${pi}/${name}`, (b) => buildSmallBoat(b, pi, name));
    g.userData.box = { minX: -1.7, maxX: 1.7, minY: -0.25, maxY: CROSSER_TOP, minZ: -0.65, maxZ: 0.65 };
    return g;
  }
  if (style === 'decor') {
    const Lr = Math.max(6, Math.round(len)), inner = cached(`tdecor${pi}/${name}/${Lr}`, (b) => buildDecorBoat(b, pi, name, Lr));
    inner.scale.z = len / Lr;
    const g = new THREE.Group(); g.add(inner); return g;
  }
  const Lr = Math.max(3, Math.round(len * 2) / 2), g = new THREE.Group();
  const h = cached(`tdeck${pi}/${Lr}`, (b) => buildDeckHull(b, pi, Lr)); h.scale.z = len / Lr; g.add(h);
  const fa = cached(`tarch${name}/${pi}/1`, (b) => buildDeckArch(b, name, pi, 1)); fa.position.z = len / 2 - 0.22; g.add(fa);
  const ba = cached(`tarch${name}/${pi}/0.72`, (b) => buildDeckArch(b, name, pi, 0.72)); ba.position.z = -len / 2 + 0.22; g.add(ba);
  g.userData.box = { minX: -0.95, maxX: 0.95, minY: -0.45, maxY: DECK_Y, minZ: -len / 2, maxZ: len / 2 };
  return g;
}

// ---------------------------------------------------------------- instancable vegetation
// Ahuejote (Salix bonplandiana): tall slender columnar willow, ~11.5 m at scale 1, origin at ground.
export function makeTreeAssets() {
  return memo(MISC, 'tree', () => {
    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.2, 8.5, 8, 1); trunkGeo.translate(0, 4.25, 0);
    const c0 = new THREE.Color('#2c5420'), c1 = new THREE.Color('#6f9c4a'), tmp = new THREE.Color(), v = new THREE.Vector3();
    const build = (levels, per, detail) => {
    const rng = mulberry32(42), lumps = [];
    for (let i = 0; i < levels; i++) {
      const t = i / (levels - 1), y = 1.9 + t * 9.0;
      const w = 0.95 * (t < 0.22 ? 0.55 + (t / 0.22) * 0.45 : 1 - Math.pow((t - 0.22) / 0.78, 1.6) * 0.85);
      for (let k = 0; k < per; k++) {
        const g = new THREE.IcosahedronGeometry(1, detail);
        const p = g.attributes.position, colors = new Float32Array(p.count * 3);
        const sx = w * (0.8 + rng() * 0.3) * (per === 1 ? 1.15 : 1), sy = 0.75 + rng() * 0.25, sz = w * (0.8 + rng() * 0.3);
        const ox = (rng() - 0.5) * w * 0.5, oz = (rng() - 0.5) * w * 0.5, seed = rng() * 100;
        for (let j = 0; j < p.count; j++) {
          v.fromBufferAttribute(p, j).normalize();
          const h = hash3(Math.round(v.x * 30) + seed, Math.round(v.y * 30), Math.round(v.z * 30));
          const r = 0.85 + 0.3 * h;
          p.setXYZ(j, ox + v.x * sx * r, y + v.y * sy * r, oz + v.z * sz * r);
          tmp.copy(c0).lerp(c1, Math.min(1, 0.15 + 0.55 * t + 0.35 * smooth(-0.5, 1, v.y) + 0.15 * (h - 0.5)));
          const sh = 0.6 + 0.4 * smooth(-0.8, 0.8, v.y);
          colors[j * 3] = tmp.r * sh; colors[j * 3 + 1] = tmp.g * sh; colors[j * 3 + 2] = tmp.b * sh;
        }
        g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        g.computeVertexNormals();
        lumps.push(g);
      }
    }
    const g = mergeGeometries(lumps, false); g.computeBoundingSphere(); return g;
    };
    const foliageGeo = build(11, 2, 1);
    const foliageGeoLo = build(9, 1, 0);
    return {
      trunkGeo, foliageGeo, foliageGeoLo,
      trunkMat: new THREE.MeshStandardMaterial({ color: '#5e4630', roughness: 0.95 }),
      foliageMat: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, flatShading: true, roughness: 0.8 }),
    };
  });
}
function singleAsset(key, fn) {
  return memo(MISC, key, () => { const b = new Builder(); const mat = fn(b); const parts = b.build(); return { geometry: parts.find((p) => p.material === mat).geometry, material: mat }; });
}
// Tule / cattail clump, ~2.2 m tall, origin at its base on the water (y=0).
export function makeReedAssets() {
  return singleAsset('reeds', (b) => {
    const m = vcMat('reed', { roughness: 0.7 }), rng = mulberry32(77);
    const blade = G('reedblade', () => { const g = new THREE.ConeGeometry(1, 1, 4, 1); g.translate(0, 0.5, 0); return g; });
    for (let i = 0; i < 18; i++) {
      const a = rng() * 6.28, r = Math.sqrt(rng()) * 0.38, h = 1.2 + rng() * 1.0;
      b.add(blade, m, T(Math.cos(a) * r, -0.1, Math.sin(a) * r, Math.sin(a) * r * 0.5 + (rng() - 0.5) * 0.15, rng() * 6, -Math.cos(a) * r * 0.5 + (rng() - 0.5) * 0.15, 0.028, h, 0.018), pick(rng, ['#5f8f2a', '#7aa83a', '#4a7a22', '#9ab84a', '#6c9a30']));
    }
    for (let i = 0; i < 6; i++) {
      const a = rng() * 6.28, r = rng() * 0.25, h = 1.5 + rng() * 0.6, x = Math.cos(a) * r, z = Math.sin(a) * r;
      b.add(UCYL(5), m, T(x, h / 2 - 0.1, z, 0, 0, 0, 0.012, h, 0.012), '#6f8f35');
      b.add(UCYL(8), m, T(x, h - 0.12, z, 0, 0, 0, 0.042, 0.24, 0.042), '#6b3a1a');
      b.add(UCYL(4), m, T(x, h + 0.06, z, 0, 0, 0, 0.006, 0.14, 0.006), '#8a7a4a');
    }
    return m;
  });
}
// Floating water-hyacinth / lily-pad clump, ~1.2 m wide, lilac flowers, origin at water level.
export function makeLilyAssets() {
  return singleAsset('lily', (b) => {
    const m = vcMat('lily', { roughness: 0.38 }), rng = mulberry32(88);
    const pad = G('lilypad', () => { const g = new THREE.CircleGeometry(1, 12, 0.35, Math.PI * 2 - 0.5); g.rotateX(-Math.PI / 2); return g; });
    for (let i = 0; i < 8; i++) {
      const a = rng() * 6.28, r = 0.15 + rng() * 0.42, s = 0.14 + rng() * 0.14;
      b.add(pad, m, T(Math.cos(a) * r, 0.012 + i * 0.002, Math.sin(a) * r, 0, rng() * 6, 0, s, 1, s), pick(rng, ['#3f8f2a', '#2f7a2a', '#5aa53a', '#4c9a30']));
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28;
      b.add(USPH_LO(), m, T(Math.cos(a) * 0.12, 0.08, Math.sin(a) * 0.12, Math.sin(a) * 0.6, -a, -Math.cos(a) * 0.6, 0.07, 0.11, 0.05), pick(rng, ['#3c9a2c', '#2e8526', '#55b035']));
    }
    for (let k = 0; k < 2; k++) {
      const cx = (rng() - 0.5) * 0.2, cz = (rng() - 0.5) * 0.2, h = 0.22 + rng() * 0.14;
      b.add(UCYL(5), m, T(cx, h / 2, cz, 0, 0, 0, 0.012, h, 0.012), '#5a9a30');
      for (let j = 0; j < 6; j++) {
        const a = j * 2.4, yy = h - 0.02 + j * 0.022, rr = 0.04;
        b.add(USPH_LO(), m, T(cx + Math.cos(a) * rr, yy, cz + Math.sin(a) * rr, 0, a, 0, 0.032, 0.022, 0.04), j % 4 === 0 ? '#9d6ae6' : '#c9a6ff');
        if (j % 3 === 0) b.add(USPH_LO(), m, T(cx + Math.cos(a) * rr * 1.5, yy + 0.01, cz + Math.sin(a) * rr * 1.5, 0, 0, 0, 0.01), F.yellow);
      }
    }
    for (let i = 0; i < 2; i++) { const a = rng() * 6.28, r = 0.45; b.add(USPH_LO(), m, T(Math.cos(a) * r, 0.04, Math.sin(a) * r, 0, 0, 0, 0.06, 0.035, 0.06), '#ffd6ea'); }
    return m;
  });
}
export function makeFlowerAssets() {
  return { flowerGeo: flowerHeadGeo(1), flowerMat: flowerMat(), bushGeo: bushGeo(), bushMat: leafMat() };
}

// ---------------------------------------------------------------- arches, papel picado
export function makeFlowerArch(width = 9) {
  const hw = width / 2;
  const proto = memo(MISC, 'farch' + width, () => {
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push(V(-hw, -0.3 + (4.3 * i) / 8, 0));
    for (let i = 1; i < 30; i++) { const a = Math.PI - (i / 30) * Math.PI; pts.push(V(Math.cos(a) * hw, 4.0 + Math.sin(a) * 1.9, 0)); }
    for (let i = 8; i >= 0; i--) pts.push(V(hw, -0.3 + (4.3 * i) / 8, 0));
    const curve = new THREE.CatmullRomCurve3(pts);
    const b = new Builder(), rng = mulberry32(1200);
    b.add(new THREE.TubeGeometry(curve, 160, 0.22, 10, false), col('#2f6b1f', 0.8));
    for (const s of [-1, 1]) {
      pot(b, s * hw, -0.35, 0, 0.6, 0.75, s > 0 ? 1 : 2);
      flowerMound(b, rng, { x: s * hw, y0: 0.35, rx: 0.42, rz: 0.42, top: 0.75, n: 26, colors: MIXED });
    }
    skullDecor(b, 0, 5.95 - 0.245 * 2.4, 0.32, 2.4);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; b.flower(Math.cos(a) * 0.82, 5.95 + Math.sin(a) * 0.82, 0.18, 1.1, i % 2 ? F.rosa : F.purple, Math.PI / 2, 0, 0); }
    const parts = b.build();
    const L = curve.getLength(), nr = Math.floor(L / 0.26), per = 6, fr = curve.computeFrenetFrames(nr, false);
    const mats = [], cols = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 1, 0), dir = new THREE.Vector3(), pos = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < nr; i++) {
      const pt = curve.getPointAt(i / (nr - 1)), N = fr.normals[i], B = fr.binormals[i];
      const band = i % 11 < 2;
      for (let k = 0; k < per; k++) {
        const a = (k / per) * Math.PI * 2 + i * 0.5;
        dir.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a)).normalize();
        pos.copy(pt).addScaledVector(dir, 0.26);
        if (pos.y < 0.1) continue;
        q.setFromUnitVectors(up, dir);
        const s = 1.0 + rng() * 0.3;
        m.compose(pos, q, _s.set(s, s, s)); mats.push(...m.elements);
        c.set(band ? pick(rng, ROSAS) : pick(rng, MARIGOLDS)); cols.push(c.r, c.g, c.b);
      }
    }
    return { parts, matAttr: new THREE.InstancedBufferAttribute(new Float32Array(mats), 16), colAttr: new THREE.InstancedBufferAttribute(new Float32Array(cols), 3), count: cols.length / 3 };
  });
  const g = instantiate(proto.parts, 'flowerArch');
  const im = new THREE.InstancedMesh(flowerHeadGeo(1), flowerMat(), proto.count);
  im.instanceMatrix = proto.matAttr; im.instanceColor = proto.colAttr;
  if (im.computeBoundingSphere) im.computeBoundingSphere();
  im.castShadow = true;
  g.add(im);
  return g;
}
const papelInstMat = () => std('papelinst', { map: papelTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, emissive: '#1a0010', emissiveIntensity: 0.2 });
export function makePapelString(width = 12) {
  const hw = width / 2, n = Math.max(10, Math.min(14, Math.round(width / 0.95))), topY = 5.1, sag = 0.65;
  const ropeY = (x) => topY - 0.12 - sag * (1 - (x / hw) ** 2);
  const g = cached('papelstatic' + width, (b) => {
    const rng = mulberry32(1300);
    for (const s of [-1, 1]) {
      b.cyl(painted(s > 0 ? F.rosa : F.turquoise), s * hw, (topY - 0.5) / 2, 0, 0.07, topY + 0.5, 10);
      b.flower(s * hw, topY + 0.06, 0, 0.9, F.marigold);
      for (let y = 0.6; y < topY - 0.2; y += 0.45) b.flower(s * hw + 0.07, y, 0.04, 0.55, pick(rng, MIXED), 0, 0, -1.3);
    }
    const pts = []; for (let i = 0; i <= 24; i++) { const x = lerp(-hw, hw, i / 24); pts.push(V(x, ropeY(x), 0)); }
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.016, 5, false), col('#3a2a1e', 0.9));
  });
  const flagGeo = G('papelflag', () => { const p = new THREE.PlaneGeometry(0.55, 0.68); p.translate(0, -0.34, 0); return p; });
  const im = new THREE.InstancedMesh(flagGeo, papelInstMat(), n);
  const info = [], c = new THREE.Color(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = V(1, 1, 1), pos = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const x = -hw + (width / (n + 1)) * (i + 1);
    info.push({ x, y: ropeY(x) - 0.01, rz: Math.atan((2 * sag * x) / (hw * hw)) });
    im.setColorAt(i, c.set(PAPEL_COLORS[i % PAPEL_COLORS.length]));
  }
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const update = (t) => {
    for (let i = 0; i < n; i++) {
      const f = info[i];
      e.set(Math.sin(t * 1.8 + i * 0.7) * 0.26 + Math.sin(t * 3.1 + i) * 0.06, Math.sin(t * 1.3 + i) * 0.12, f.rz);
      im.setMatrixAt(i, m.compose(pos.set(f.x, f.y, 0), q.setFromEuler(e), one));
    }
    im.instanceMatrix.needsUpdate = true;
  };
  update(0);
  im.frustumCulled = false;
  g.add(im);
  g.userData.update = update;
  return g;
}

// ---------------------------------------------------------------- houses (chinampa banks)
const wallMat = (hex) => std('wall' + hex, { map: plasterTex(), color: hex, roughness: 0.85 });
function windowAt(b, x, y, z, w, h, frame, flowers = true, rng = Math.random) {
  b.push(T(x, y, z));
  b.box(painted(frame), 0, 0, 0.02, w + 0.16, h + 0.16, 0.05);
  b.box(col('#1b2742', 0.12, 0.3), 0, 0, 0.035, w, h, 0.05);
  b.box(painted(F.cream), 0, 0, 0.065, 0.04, h, 0.02); b.box(painted(F.cream), 0, 0, 0.065, w, 0.04, 0.02);
  b.box(painted(frame), 0, -h / 2 - 0.1, 0.09, w + 0.3, 0.06, 0.2);
  if (flowers) {
    b.box(painted(F.cream), 0, -h / 2 - 0.0, 0.14, w, 0.14, 0.14);
    for (let i = 0; i < 4; i++) b.flower(lerp(-w / 2 + 0.1, w / 2 - 0.1, i / 3), -h / 2 + 0.1, 0.15, 0.75, pick(rng, MIXED));
  }
  b.pop();
}
function doorAt(b, x, y, z, w, h, color, frame) {
  b.push(T(x, y, z));
  b.box(painted(frame), 0, h / 2 + 0.04, 0.02, w + 0.2, h + 0.1, 0.05);
  b.tbox(painted(color), 0, h / 2, 0.04, w, h, 0.05, 1.5);
  b.ball(col('#ffcf33', 0.25, 0.9), w * 0.35, h * 0.48, 0.08, 0.03);
  b.pop();
}
function flatRoof(b, w, d, y, cap) {
  b.box(wallMat('#d8d0c4'), 0, y + 0.06, 0, w - 0.02, 0.12, d - 0.02);
  for (const s of [-1, 1]) { b.box(painted(cap), 0, y + 0.25, s * (d / 2 - 0.07), w, 0.36, 0.14); b.box(painted(cap), s * (w / 2 - 0.07), y + 0.25, 0, 0.14, 0.36, d); }
}
function buildHouse(b, v) {
  const rng = mulberry32(1400 + v);
  if (v === 0) { // red, 2 storeys, tiled gable roof, balcony
    const w = 3.6, d = 3.2, H = 5.0;
    b.tbox(wallMat(F.red), 0, H / 2, 0, w, H, d, 0.35);
    b.tbox(wallMat('#7a0a1a'), 0, 0.25, 0, w + 0.03, 0.5, d + 0.03, 0.35);
    b.box(painted(F.yellow), 0, 2.5, 0, w + 0.04, 0.12, d + 0.04);
    for (const s of [-1, 1]) b.add(quadGeo([V(-2.0, H, s * 1.85), V(2.0, H, s * 1.85), V(2.0, 6.1, 0), V(-2.0, 6.1, 0)], [[0, 0], [2, 0], [2, 1.1], [0, 1.1]], V(0, 1, s)), std('tile', { map: tileTex(), roughness: 0.7 }));
    for (const s of [-1, 1]) b.add(triGeo(V(s * 1.8, H, -1.6), V(s * 1.8, H, 1.6), V(s * 1.8, 6.05, 0), V(s, 0, 0)), wallMat(F.red));
    doorAt(b, 0, 0, d / 2, 0.95, 2.0, F.turquoise, F.yellow);
    for (const s of [-1, 1]) windowAt(b, s * 1.15, 1.45, d / 2, 0.7, 0.8, F.turquoise, true, rng);
    b.box(painted(F.turquoise), 0, 2.62, d / 2 + 0.3, 2.0, 0.1, 0.6);
    for (let i = 0; i <= 8; i++) b.box(painted(F.turquoise), lerp(-0.95, 0.95, i / 8), 2.9, d / 2 + 0.57, 0.04, 0.5, 0.04);
    b.box(painted(F.turquoise), 0, 3.16, d / 2 + 0.57, 2.0, 0.05, 0.06);
    doorAt(b, 0, 2.62, d / 2, 0.85, 1.8, F.yellow, F.turquoise);
    for (const s of [-1, 1]) { windowAt(b, s * 1.25, 3.7, d / 2, 0.6, 0.8, F.yellow, false); pot(b, s * 0.75, 2.67, d / 2 + 0.3, 0.13, 0.22, 2); b.flower(s * 0.75, 2.95, d / 2 + 0.3, 0.9, F.marigold); }
  } else if (v === 1) { // rosa, 3 storeys, flat roof, tinaco, varillas
    const w = 3.2, d = 3.0, H = 7.2;
    b.tbox(wallMat(F.rosa), 0, H / 2, 0, w, H, d, 0.35);
    b.tbox(wallMat('#8a004a'), 0, 0.25, 0, w + 0.03, 0.5, d + 0.03, 0.35);
    for (const y of [2.4, 4.8]) b.box(painted(F.yellow), 0, y, 0, w + 0.04, 0.12, d + 0.04);
    flatRoof(b, w, d, H, F.turquoise);
    b.cyl(col('#1a1a1a', 0.5), 0.6, H + 0.62, -0.5, 0.5, 1.0, 16); b.cyl(col('#222', 0.5), 0.6, H + 1.15, -0.5, 0.25, 0.08, 12);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let k = 0; k < 3; k++) b.cyl(col('#5a3a2a', 0.6, 0.5), sx * (w / 2 - 0.15) + k * 0.06, H + 0.7, sz * (d / 2 - 0.15), 0.012, 0.9, 4);
    doorAt(b, -0.7, 0, d / 2, 0.9, 2.0, F.cobalt, F.yellow);
    windowAt(b, 0.85, 1.4, d / 2, 0.9, 0.8, F.cobalt, true, rng);
    for (const y of [3.6, 6.0]) for (const s of [-1, 1]) windowAt(b, s * 0.8, y, d / 2, 0.7, 0.9, s > 0 ? F.turquoise : F.yellow, true, rng);
  } else if (v === 2) { // yellow, 2 storeys, shop front, bougainvillea
    const w = 3.8, d = 3.4, H = 5.2;
    b.tbox(wallMat(F.yellow), 0, H / 2, 0, w, H, d, 0.35);
    b.tbox(wallMat(F.cobalt), 0, 0.3, 0, w + 0.03, 0.6, d + 0.03, 0.35);
    flatRoof(b, w, d, H, F.cobalt);
    const sign = canvasTex('abarrotes', 512, 128, (g) => { g.fillStyle = F.cobalt; g.fillRect(0, 0, 512, 128); g.strokeStyle = F.cream; g.lineWidth = 6; g.strokeRect(10, 10, 492, 108); outlinedText(g, 'ABARROTES', 256, 66, 76, F.yellow, F.ink, 12, 440); flower2d(g, 40, 64, 24, 8, F.rosa, F.cream); flower2d(g, 472, 64, 24, 8, F.rosa, F.cream); }, { repeat: false });
    b.add(planeGeo(2.6, 0.65), std('abarrotes', { map: sign, roughness: 0.5 }), T(0, 2.75, d / 2 + 0.02));
    b.box(painted(F.red), 0, 1.2, d / 2 + 0.03, 2.0, 1.9, 0.04);
    b.box(painted(F.cream), 0, 1.2, d / 2 + 0.05, 1.8, 0.05, 0.03);
    for (const s of [-1, 1]) windowAt(b, s * 1.2, 4.0, d / 2, 0.75, 0.9, F.rosa, true, rng);
    for (let i = 0; i < 70; i++) { const t = rng(); b.flower(w / 2 - 0.1 - rng() * 1.2, H - t * t * 3.5 + 0.3, d / 2 + 0.1 + rng() * 0.1, 0.7 + rng() * 0.4, pick(rng, ['#e4007c', '#c8006a', '#ff2d8f', '#b0105e']), rng(), rng(), rng()); }
    flowerMound(b, rng, { x: w / 2 - 0.5, z: d / 2 - 0.1, y0: H + 0.1, rx: 0.5, rz: 0.2, top: H + 0.45, n: 14, colors: ROSAS });
    for (const x of [-1.2, -0.4]) { pot(b, x, H + 0.12, d / 2 - 0.3, 0.18, 0.3, 0); b.flower(x, H + 0.5, d / 2 - 0.3, 1.0, F.marigold); }
  } else { // cobalt, 2 storeys + thatched rooftop room
    const w = 3.4, d = 3.4, H = 4.8;
    b.tbox(wallMat(F.cobalt), 0, H / 2, 0, w, H, d, 0.35);
    b.tbox(wallMat('#0a2a7a'), 0, 0.25, 0, w + 0.03, 0.5, d + 0.03, 0.35);
    b.box(painted(F.marigold), 0, 2.4, 0, w + 0.04, 0.12, d + 0.04);
    flatRoof(b, w, d, H, F.marigold);
    b.tbox(woodMat(), -0.3, H + 1.1, -0.3, 2.2, 2.0, 2.2, 0.8);
    b.add(G('thatchcone', () => new THREE.ConeGeometry(1, 1, 4, 1)), std('thatch', { map: thatchTex(), roughness: 0.9 }), T(-0.3, H + 2.7, -0.3, 0, Math.PI / 4, 0, 1.9, 1.3, 1.9));
    doorAt(b, -0.3, H + 0.12, 0.8, 0.7, 1.6, F.rosa, F.marigold);
    doorAt(b, 0.6, 0, d / 2, 0.95, 2.1, F.rosa, F.marigold);
    windowAt(b, -0.9, 1.4, d / 2, 0.75, 0.8, F.marigold, true, rng);
    for (const s of [-1, 1]) windowAt(b, s * 0.85, 3.6, d / 2, 0.7, 0.85, s > 0 ? F.rosa : F.marigold, true, rng);
    papelRow(b, -1.6, 1.6, H + 0.42, d / 2 + 0.02, 7, 0.32, rng);
  }
}
export function makeHouse(variant = 0) {
  const v = ((variant | 0) % 4 + 4) % 4;
  return cached('house' + v, (b) => buildHouse(b, v));
}
export function makeCandle() { return cached('candle', (b) => candle(b, 0, 0, 0, 1.3, 'veladora', F.red)); }

// Axolotl (ajolote) decor: ~0.75 long, faces +Z, floats half-submerged at y=0.
export function makeAxolotl(color = '#ff9ec7') {
  return cached('axolotl' + color, (b) => {
    const body = std('axo' + color, { color, roughness: 0.35 });
    b.ball(body, 0, 0.0, -0.02, 0.11, 0.08, 0.25);
    b.ball(body, 0, 0.03, 0.24, 0.15, 0.085, 0.12);
    b.ball(std('axofin', { color: '#ffc2dc', roughness: 0.4, transparent: true, opacity: 0.9 }), 0, 0.03, -0.36, 0.018, 0.085, 0.24);
    b.ball(std('axofin', { color: '#ffc2dc', roughness: 0.4, transparent: true, opacity: 0.9 }), 0, 0.07, -0.05, 0.012, 0.04, 0.22);
    for (const s of [-1, 1]) {
      b.ball(col('#140814', 0.1), s * 0.095, 0.075, 0.31, 0.026);
      b.ball(col('#ffffff', 0.1), s * 0.1, 0.085, 0.325, 0.008);
      for (let k = 0; k < 3; k++) {
        const ang = -0.6 + k * 0.6, bx = s * 0.13, by = 0.06 + k * 0.03, bz = 0.2;
        const dx = s * Math.cos(ang) * 0.13, dy = Math.sin(ang) * 0.1 + 0.06;
        for (let j = 1; j <= 4; j++) b.ball(col(j % 2 ? F.rosa : '#ff4fa3', 0.4), bx + dx * j / 4, by + dy * j / 4, bz - 0.03 * j, 0.025, 0.012, 0.03);
      }
      for (const z of [0.12, -0.16]) b.ball(body, s * 0.13, -0.03, z, 0.07, 0.02, 0.03, undefined, 0, 0, s * -0.4);
    }
    b.box(col('#7a1a4a', 0.5), 0, 0.01, 0.36, 0.12, 0.008, 0.01);
  });
}

// ---------------------------------------------------------------- model list (for the viewer)
const ob = (k, len) => { const o = OBSTACLE_BOXES[k]; const L = len ?? o.len; return { minX: -o.w / 2, maxX: o.w / 2, minY: 0, maxY: o.h, minZ: -L / 2, maxZ: L / 2 }; };
function instGroup(geo, mat, n, place) {
  const im = new THREE.InstancedMesh(geo, mat, n), m = new THREE.Matrix4(), c = new THREE.Color();
  for (let i = 0; i < n; i++) { const { matrix, color } = place(i); im.setMatrixAt(i, matrix); if (color) im.setColorAt(i, c.set(color)); }
  if (im.computeBoundingSphere) im.computeBoundingSphere();
  const g = new THREE.Group(); g.add(im); return g;
}
export const MODEL_LIST = [
  { id: 'crate', label: 'Crate raft', make: () => makeObstacle('crate', 0), box: ob('crate') },
  { id: 'crate-b', label: 'Crate raft (b)', make: () => makeObstacle('crate', 1), box: ob('crate') },
  { id: 'pots', label: 'Pot raft', make: () => makeObstacle('pots', 0), box: ob('pots') },
  { id: 'fence', label: 'Stake fence', make: () => makeObstacle('fence', 0), box: ob('fence') },
  { id: 'ofrenda', label: 'Ofrenda raft', make: () => makeObstacle('ofrenda', 0), box: ob('ofrenda') },
  { id: 'tower', label: 'Market tower', make: () => makeObstacle('tower', 0), box: ob('tower') },
  { id: 'stall', label: 'Market canoe TAMALES (6)', make: () => makeObstacle('stall', 0, 6), box: ob('stall', 6) },
  { id: 'stall-aguas', label: 'Market canoe AGUAS (9)', make: () => makeObstacle('stall', 4, 9), box: ob('stall', 9) },
  { id: 'trajinera-deck', label: 'Trajinera (deck)', make: () => makeTrajinera({ len: 8, palette: 0, name: 'Lupita' }), box: { minX: -0.95, maxX: 0.95, minY: -0.45, maxY: DECK_Y, minZ: -4, maxZ: 4 } },
  { id: 'trajinera-deck2', label: 'Trajinera (deck) Mi Amor', make: () => makeTrajinera({ len: 7, palette: 3, name: 'Mi Amor' }), box: { minX: -0.95, maxX: 0.95, minY: -0.45, maxY: DECK_Y, minZ: -3.5, maxZ: 3.5 } },
  { id: 'trajinera-decor', label: 'Trajinera (decor)', make: () => makeTrajinera({ len: 8, palette: 1, name: 'Xóchitl', style: 'decor' }) },
  { id: 'trajinera-small', label: 'Trajinera (small crosser)', make: () => makeTrajinera({ palette: 4, name: 'Rosita', style: 'small' }), box: { minX: -1.7, maxX: 1.7, minY: -0.25, maxY: CROSSER_TOP, minZ: -0.65, maxZ: 0.65 } },
  { id: 'skull', label: 'Calaverita de azúcar', make: () => { const g = skullGroup(); g.position.y = 0.6; return g; } },
  { id: 'tree', label: 'Ahuejote', base: 'bank', make: () => { const a = makeTreeAssets(), g = new THREE.Group(); g.add(new THREE.Mesh(a.trunkGeo, a.trunkMat), new THREE.Mesh(a.foliageGeo, a.foliageMat)); return g; } },
  { id: 'reeds', label: 'Tule reeds', make: () => { const a = makeReedAssets(); return new THREE.Group().add(new THREE.Mesh(a.geometry, a.material)); } },
  { id: 'lily', label: 'Water hyacinth', make: () => { const a = makeLilyAssets(); return new THREE.Group().add(new THREE.Mesh(a.geometry, a.material)); } },
  { id: 'flowers', label: 'Marigolds + bush', make: () => { const a = makeFlowerAssets(), rng = mulberry32(5); const g = instGroup(a.flowerGeo, a.flowerMat, 24, (i) => ({ matrix: T(((i % 6) - 2.5) * 0.3, 0.45, (Math.floor(i / 6) - 1.5) * 0.3, 0, rng() * 6, 0, 1.2), color: i % 5 === 0 ? F.rosa : pick(rng, MARIGOLDS) })); g.add(new THREE.Mesh(a.bushGeo, a.bushMat).translateX(1.3)); return g; } },
  { id: 'arch', label: 'Arco floral', make: () => makeFlowerArch(9) },
  { id: 'papel', label: 'Papel picado', make: () => makePapelString(12) },
  { id: 'house0', label: 'House red', base: 'bank', make: () => makeHouse(0) },
  { id: 'house1', label: 'House rosa', base: 'bank', make: () => makeHouse(1) },
  { id: 'house2', label: 'House yellow', base: 'bank', make: () => makeHouse(2) },
  { id: 'house3', label: 'House blue', base: 'bank', make: () => makeHouse(3) },
  { id: 'candle', label: 'Veladora', make: () => makeCandle() },
  { id: 'axolotl', label: 'Ajolote', make: () => makeAxolotl() },
];
