// Procedural canvas textures: everything is generated at load time, no external images.
import * as THREE from 'three';

export const PALETTES = [
  { a: '#e8177d', b: '#ffcf33', c: '#12b5b0', d: '#2d7be0' },
  { a: '#ff7a1a', b: '#2fb54a', c: '#e8177d', d: '#ffe14d' },
  { a: '#2d7be0', b: '#ff9a1f', c: '#ffe14d', d: '#e8177d' },
  { a: '#8d2bb3', b: '#ffcf33', c: '#ff5a36', d: '#12b5b0' },
  { a: '#12b5b0', b: '#e8177d', c: '#ffe14d', d: '#ff7a1a' },
  { a: '#d7263d', b: '#1fa774', c: '#ffcf33', d: '#2d7be0' },
];

let maxAniso = 4;
export function setMaxAnisotropy(a) { maxAniso = a; }

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}
function rnd(a, b) { return a + Math.random() * (b - a); }
function speckle(g, w, h, n, colors, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.globalAlpha = rnd(0.25, 0.8);
    g.beginPath(); g.arc(Math.random() * w, Math.random() * h, rnd(rMin, rMax), 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}
function petal(g, x, y, s, rot, color) {
  g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = color;
  g.beginPath(); g.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); g.fill(); g.restore();
}

const cache = {};
const once = (k, f) => (cache[k] ||= f());

// One lane of packed chinampa earth (u = across lane, v = along). Petal path = camino de flores.
export const pathTexture = () => once('path', () => {
  const [c, g] = canvas(256, 512);
  const grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, '#7a5232'); grd.addColorStop(0.12, '#a87449'); grd.addColorStop(0.5, '#b88252'); grd.addColorStop(0.88, '#a87449'); grd.addColorStop(1, '#7a5232');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 512);
  speckle(g, 256, 512, 1400, ['#8d5d37', '#c99561', '#6e4528', '#d6a873'], 0.6, 2.4);
  // wheel/foot ruts
  g.strokeStyle = 'rgba(90,55,30,0.25)'; g.lineWidth = 10;
  for (const x of [80, 176]) { g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= 512; y += 32) g.lineTo(x + Math.sin(y * 0.05) * 3, y); g.stroke(); }
  // grass tufts on lane edges
  for (let i = 0; i < 160; i++) {
    const side = Math.random() < 0.5 ? rnd(0, 14) : rnd(242, 256);
    const y = Math.random() * 512;
    g.strokeStyle = ['#5f8a2e', '#7aa33a', '#4d7426'][(Math.random() * 3) | 0];
    g.lineWidth = 2; g.beginPath(); g.moveTo(side, y); g.lineTo(side + rnd(-4, 4), y - rnd(4, 10)); g.stroke();
  }
  // marigold petals scattered along the path
  for (let i = 0; i < 70; i++) petal(g, rnd(20, 236), Math.random() * 512, rnd(3, 6), Math.random() * 6, ['#ff8c12', '#ffb020', '#ff6a00', '#e8177d'][(Math.random() * 4) | 0]);
  return tex(c);
});

export const grassTexture = () => once('grass', () => {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#5d8f2f'; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 1600, ['#4b7a25', '#76a83c', '#3f6a20', '#8cbc48'], 0.8, 2.6);
  for (let i = 0; i < 40; i++) petal(g, Math.random() * 256, Math.random() * 256, rnd(2, 4), Math.random() * 6, ['#ff9a1f', '#ffcf33', '#e8177d'][(Math.random() * 3) | 0]);
  return tex(c);
});

export const bankTexture = () => once('bank', () => {
  const [c, g] = canvas(256, 128);
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#5a7a2a'); grd.addColorStop(0.12, '#4a3220'); grd.addColorStop(1, '#2a1c12');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  speckle(g, 256, 128, 500, ['#3a2616', '#6a4a2e', '#24170e'], 1, 3);
  g.strokeStyle = 'rgba(30,20,10,0.6)'; g.lineWidth = 2;
  for (let i = 0; i < 18; i++) { const x = Math.random() * 256; g.beginPath(); g.moveTo(x, 18); g.bezierCurveTo(x + rnd(-15, 15), 50, x + rnd(-20, 20), 80, x + rnd(-10, 10), 128); g.stroke(); }
  // wooden stakes typical of chinampa edges
  for (let x = 8; x < 256; x += 32) { g.fillStyle = '#6b4a2b'; g.fillRect(x, 10, 7, 118); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 5, 10, 2, 118); }
  return tex(c);
});

export const woodTexture = () => once('wood', () => {
  const [c, g] = canvas(256, 256);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const y = (i * 256) / n;
    g.fillStyle = ['#9b6a3e', '#a8774a', '#8e5f36', '#b2814f'][i % 4];
    g.fillRect(0, y, 256, 256 / n);
    g.strokeStyle = 'rgba(60,35,15,0.35)'; g.lineWidth = 1;
    for (let k = 0; k < 5; k++) { g.beginPath(); const yy = y + rnd(3, 256 / n - 3); g.moveTo(0, yy); g.bezierCurveTo(80, yy + rnd(-3, 3), 170, yy + rnd(-3, 3), 256, yy); g.stroke(); }
    g.fillStyle = 'rgba(40,20,8,0.7)'; g.fillRect(0, y, 256, 2);
    g.fillStyle = '#3a2412'; for (const x of [20, 236]) { g.beginPath(); g.arc(x, y + 16, 2.2, 0, 7); g.fill(); }
  }
  return tex(c);
});

// Painted trajinera hull: bold horizontal bands with a flower frieze.
export function hullTexture(p) {
  return once('hull' + PALETTES.indexOf(p), () => {
    const [c, g] = canvas(512, 128);
    g.fillStyle = p.a; g.fillRect(0, 0, 512, 128);
    g.fillStyle = p.b; g.fillRect(0, 0, 512, 22);
    g.fillStyle = p.d; g.fillRect(0, 22, 512, 8);
    g.fillStyle = p.c; g.fillRect(0, 92, 512, 14);
    g.fillStyle = '#1d1029'; g.fillRect(0, 106, 512, 22);
    for (let x = 24; x < 512; x += 64) {
      const y = 60;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.fillStyle = k % 2 ? p.b : '#fff4de'; g.beginPath(); g.ellipse(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 7, 5, a, 0, 7); g.fill(); }
      g.fillStyle = p.d; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
      g.strokeStyle = '#2fb54a'; g.lineWidth = 4; g.beginPath(); g.moveTo(x + 18, y); g.quadraticCurveTo(x + 32, y - 14, x + 46, y); g.stroke();
    }
    return tex(c);
  });
}

// Ornate name arch (letrero) with transparent background outside the arch.
export function archTexture(name, p) {
  const key = 'arch' + name + PALETTES.indexOf(p);
  return once(key, () => {
    const [c, g] = canvas(512, 256);
    const shape = (inset) => {
      g.beginPath();
      g.moveTo(10 + inset, 250 - inset);
      g.lineTo(10 + inset, 120);
      g.bezierCurveTo(10 + inset, 40 + inset, 140, 8 + inset, 256, 8 + inset);
      g.bezierCurveTo(372, 8 + inset, 502 - inset, 40 + inset, 502 - inset, 120);
      g.lineTo(502 - inset, 250 - inset);
      g.lineTo(400, 250 - inset); g.lineTo(400, 200); g.bezierCurveTo(400, 160, 330, 150, 256, 150); g.bezierCurveTo(182, 150, 112, 160, 112, 200); g.lineTo(112, 250 - inset);
      g.closePath();
    };
    shape(0); g.fillStyle = p.b; g.fill();
    shape(10); g.fillStyle = p.a; g.fill();
    shape(22); g.fillStyle = p.d; g.fill();
    // flowers around the rim
    const flower = (x, y, r, col) => { for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.fillStyle = col; g.beginPath(); g.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.7, r * 0.45, a, 0, 7); g.fill(); } g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(x, y, r * 0.6, 0, 7); g.fill(); };
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = 256 + Math.cos(Math.PI - t * Math.PI) * 225;
      const y = 120 - Math.sin(t * Math.PI) * 95;
      flower(x, y, 9, i % 2 ? '#fff4de' : p.c);
    }
    flower(60, 225, 14, p.c); flower(452, 225, 14, p.c);
    // name
    g.font = '64px "Lilita One", Impact, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const size = Math.min(64, 64 * 300 / Math.max(1, g.measureText(name).width));
    g.font = `${size}px "Lilita One", Impact, sans-serif`;
    g.lineWidth = 9; g.strokeStyle = '#1d1029'; g.strokeText(name, 256, 92);
    g.fillStyle = '#fff4de'; g.fillText(name, 256, 92);
    g.lineWidth = 3; g.strokeStyle = p.b; g.beginPath(); g.moveTo(150, 128); g.quadraticCurveTo(256, 142, 362, 128); g.stroke();
    return tex(c, { repeat: false });
  });
}

// Sugar-skull face decal (transparent background).
export const skullFaceTexture = () => once('skullface', () => {
  const [c, g] = canvas(256, 256);
  const cx = 128;
  const eye = (x, col) => {
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; g.fillStyle = col; g.beginPath(); g.ellipse(x + Math.cos(a) * 26, 112 + Math.sin(a) * 26, 12, 8, a, 0, 7); g.fill(); }
    g.fillStyle = '#2a1238'; g.beginPath(); g.arc(x, 112, 22, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - 7, 104, 6, 0, 7); g.fill();
  };
  eye(cx - 48, '#e8177d'); eye(cx + 48, '#12b5b0');
  // nose: upside-down heart
  g.fillStyle = '#ff7a1a';
  g.beginPath(); g.moveTo(cx, 150); g.bezierCurveTo(cx - 20, 168, cx - 14, 180, cx, 172); g.bezierCurveTo(cx + 14, 180, cx + 20, 168, cx, 150); g.fill();
  // smile with stitches
  g.strokeStyle = '#2a1238'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - 52, 196); g.quadraticCurveTo(cx, 222, cx + 52, 196); g.stroke();
  g.lineWidth = 4;
  for (let i = -4; i <= 4; i++) { const x = cx + i * 12; const y = 196 + 13 * (1 - (i / 4.3) ** 2); g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x, y + 9); g.stroke(); }
  // forehead flower + swirls
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.fillStyle = k % 2 ? '#ffcf33' : '#ff7a1a'; g.beginPath(); g.ellipse(cx + Math.cos(a) * 14, 48 + Math.sin(a) * 14, 11, 7, a, 0, 7); g.fill(); }
  g.fillStyle = '#8d2bb3'; g.beginPath(); g.arc(cx, 48, 8, 0, 7); g.fill();
  g.strokeStyle = '#2fb54a'; g.lineWidth = 5;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 30, 52); g.quadraticCurveTo(cx + s * 60, 30, cx + s * 78, 58); g.stroke(); }
  // cheek dots
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { g.fillStyle = ['#e8177d', '#ffcf33', '#12b5b0', '#ff7a1a'][i]; g.beginPath(); g.arc(cx + s * (78 + i * 2), 150 + i * 12, 5, 0, 7); g.fill(); }
  return tex(c, { repeat: false });
});

// Papel picado flag (white, tinted via instance color), cut-out pattern in alpha.
export const papelTexture = () => once('papel', () => {
  const [c, g] = canvas(128, 160);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 160);
  // zig-zag bottom edge
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(0, 160);
  for (let x = 0; x <= 128; x += 16) g.lineTo(x, x % 32 ? 146 : 160);
  g.lineTo(128, 170); g.lineTo(0, 170); g.closePath(); g.fill();
  g.beginPath(); for (let x = 0; x <= 128; x += 16) { g.lineTo(x, 160); g.lineTo(x + 8, 146); } g.lineTo(128, 170); g.lineTo(0, 170); g.fill();
  // cutouts: central skull-ish flower + border holes
  const cut = (f) => { g.beginPath(); f(); g.fill(); };
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; cut(() => g.ellipse(64 + Math.cos(a) * 22, 72 + Math.sin(a) * 22, 10, 5, a, 0, 7)); }
  cut(() => g.arc(64, 72, 8, 0, 7));
  for (let x = 14; x < 120; x += 20) { cut(() => { g.moveTo(x, 18); g.lineTo(x + 6, 24); g.lineTo(x, 30); g.lineTo(x - 6, 24); g.closePath(); }); }
  for (let y = 40; y < 130; y += 18) for (const x of [12, 116]) cut(() => g.arc(x, y, 4, 0, 7));
  cut(() => g.ellipse(64, 122, 30, 6, 0, 0, 7));
  g.globalCompositeOperation = 'source-over';
  return tex(c, { repeat: false });
});

export const awningTexture = () => once('awning', () => {
  const [c, g] = canvas(256, 64);
  const cols = ['#e8177d', '#fff4de', '#12b5b0', '#fff4de', '#ff9a1f', '#fff4de'];
  for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(i * 256 / 12, 0, 256 / 12 + 1, 64); }
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 54, 256, 10);
  return tex(c);
});

export function signTexture(text, bg, fg) {
  return once('sign' + text + bg, () => {
    const [c, g] = canvas(256, 96);
    g.fillStyle = bg; g.fillRect(0, 0, 256, 96);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, 240, 80);
    g.font = '52px "Lilita One", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = '#1d1029'; g.strokeText(text, 128, 52);
    g.fillStyle = fg; g.fillText(text, 128, 52);
    return tex(c, { repeat: false });
  });
}

export const clothTexture = () => once('cloth', () => {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#8d2bb3'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#e8177d'; for (let y = 0; y < 128; y += 32) g.fillRect(0, y, 128, 12);
  g.fillStyle = '#ffcf33'; for (let x = 4; x < 128; x += 16) for (let y = 18; y < 128; y += 32) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  return tex(c);
});

export const potTexture = () => once('pot', () => {
  const [c, g] = canvas(128, 64);
  g.fillStyle = '#b5532a'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#fff4de'; g.fillRect(0, 20, 128, 4);
  g.fillStyle = '#1d1029'; for (let x = 4; x < 128; x += 12) { g.beginPath(); g.arc(x, 34, 3, 0, 7); g.fill(); }
  g.fillStyle = '#fff4de'; g.fillRect(0, 44, 128, 3);
  return tex(c);
});

export const cloudTexture = () => once('cloud', () => {
  const [c, g] = canvas(256, 128);
  for (let i = 0; i < 24; i++) {
    const x = rnd(40, 216), y = rnd(50, 90), r = rnd(18, 42);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.85)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  return tex(c, { repeat: false });
});

export const softDotTexture = () => once('dot', () => {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return tex(c, { repeat: false });
});
