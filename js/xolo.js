// Xolo Run — procedural xoloitzcuintle character.
// One SkinnedMesh (4 material groups => 4 draw calls) driven by a bone rig with
// analytic 2-bone leg IK, damped springs for ears / tail / squash / lean, and a
// procedural gallop. Faces -Z, feet at y=0 of root.
// Optional hook: xolo.onFootfall = (worldPos, foot, info) => {} fires when a paw plants
// during the run gait (foot: 'FL'|'FR'|'HL'|'HR', worldPos.y = root world y) and for all
// four paws on onLand (info = { landing: true, strength }).
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export const XOLO_DEFAULTS = {
  skinColor: '#211d20',
  roughness: 0.26,
  clearcoat: 0.9,
  clearcoatRoughness: 0.2,
  envMapIntensity: 1.3,
  innerEarColor: '#f29aa6',
  rimColor: '#ff9a4d',   // warm fresnel rim so the black silhouette separates from the path
  rimStrength: 0.42,
  rimPower: 3.0,
  eyeColor: '#ffa514',
  earScale: 1,
  headScale: 1,
  legLength: 1,
  tailLength: 1,
  collar: true,
  tuft: true,
  animSpeed: 1,      // gait frequency multiplier
  springiness: 1,    // ear/tail spring response multiplier
};

class Spring {
  constructor(k, zeta) { this.set(k, zeta); this.x = 0; this.v = 0; }
  set(k, zeta) { this.k = k; this.d = 2 * zeta * Math.sqrt(k); }
  step(h, target = 0, force = 0) {
    this.v += (this.k * (target - this.x) - this.d * this.v + force) * h;
    this.x += this.v * h;
    return this.x;
  }
  reset(x = 0) { this.x = x; this.v = 0; }
}

// ---------------------------------------------------------------- geometry helpers
// Loft of elliptical sections along +Z. sec: {z, w, h, x?, y?, k? (keel: narrow bottom)}
function loft(secs, seg = 14, sub = 1) {
  secs = secs.slice().sort((a, b) => a.z - b.z);
  if (sub > 1) {
    const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
    const keys = ['z', 'w', 'h', 'x', 'y', 'k'], out = [];
    for (let i = 0; i < secs.length - 1; i++) {
      const a = secs[Math.max(0, i - 1)], b = secs[i], c = secs[i + 1], d = secs[Math.min(secs.length - 1, i + 2)];
      out.push(b);
      // keep end caps tight: don't subdivide the first/last (cap) spans
      if (i === 0 || i === secs.length - 2) continue;
      for (let k = 1; k < sub; k++) {
        const t = k / sub, o = {};
        for (const key of keys) o[key] = cr(a[key] || 0, b[key] || 0, c[key] || 0, d[key] || 0, t);
        o.w = Math.max(o.w, 0.002); o.h = Math.max(o.h, 0.002); o.k = clamp(o.k, 0, 1);
        out.push(o);
      }
    }
    out.push(secs[secs.length - 1]);
    secs = out;
  }
  const pos = [], idx = [], n = secs.length;
  for (const s of secs) {
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const kx = 1 - (s.k || 0) * Math.max(0, -sa);
      pos.push((s.x || 0) + s.w * ca * kx, (s.y || 0) + s.h * sa, s.z);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = a + seg, d = b + seg;
    idx.push(a, b, c, b, d, c);
  }
  const s0 = pos.length / 3, f = secs[0], l = secs[n - 1];
  pos.push(f.x || 0, f.y || 0, f.z, l.x || 0, l.y || 0, l.z);
  for (let j = 0; j < seg; j++) {
    const j1 = (j + 1) % seg;
    idx.push(s0, j1, j);
    idx.push(s0 + 1, (n - 1) * seg + j, (n - 1) * seg + j1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Tapered capsule hanging from origin along -Y. sx scales width (x), depth = radius.
function limb(len, r0, r1, sx = 1, seg = 10) {
  const secs = [], cap = 3;
  for (let i = 0; i <= cap; i++) {
    const t = 0.2 + (i / cap) * (Math.PI / 2 - 0.2);
    const r = r0 * Math.sin(t);
    secs.push({ z: -r0 * Math.cos(t), w: r * sx, h: r });
  }
  for (let i = 1; i < 3; i++) { const r = lerp(r0, r1, i / 3); secs.push({ z: (len * i) / 3, w: r * sx, h: r }); }
  for (let i = 0; i <= cap; i++) {
    const t = Math.PI / 2 + (i / cap) * (Math.PI / 2 - 0.2);
    const r = r1 * Math.sin(t);
    secs.push({ z: len - r1 * Math.cos(t), w: r * sx, h: r });
  }
  const g = loft(secs, seg);
  g.rotateX(Math.PI / 2);
  return g;
}

function ellipsoid(rx, ry, rz, ws = 12, hs = 8) {
  const g = new THREE.SphereGeometry(1, Math.round(ws * 1.35), Math.round(hs * 1.35));
  g.deleteAttribute('uv');
  g.scale(rx, ry, rz);
  return g;
}

// Tall pointed bat ear: cupped shell opening toward -Z, base at origin, extends +Y.
function earGeos(H, W, cup, thick) {
  const NU = 26, NV = 18;
  // pointed leaf: widest just above the root, straight-ish flanks tapering to a sharp tip
  const wAt = (u) => W * Math.pow(1 - u, 1.05) * (1 + 0.75 * u) * (0.55 + 0.45 * smooth(u / 0.2));
  const front = (u, v) => [
    wAt(u) * v,
    u * H,
    cup * (1 - v * v) * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, u * 1.1))) + 0.3 * cup * u * u,
  ];
  const grid = (fn, faceFront) => {
    const pos = [], idx = [];
    for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) pos.push(...fn(i / NU, (j / NV) * 2 - 1));
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j, b = a + 1, c = a + NV + 1, d = c + 1;
      if (faceFront) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const fr = grid((u, v) => front(u, v), true);
  const bk = grid((u, v) => {
    const p = front(u, v);
    p[2] += thick * Math.sqrt(Math.max(0, 1 - v * v)) * (1 - 0.7 * u) * (1 + 1.0 * (1 - smooth(u / 0.3)));
    return p;
  }, false);
  const outer = mergeGeometries([fr, bk]);
  const inner = grid((u, v) => {
    const uu = 0.05 + u * 0.86, vv = v * 0.84;
    const p = front(uu, vv); p[2] -= 0.003; return p;
  }, true);
  {
    const col = [], c = new THREE.Color(), deep = new THREE.Color(0.62, 0.38, 0.42), mid = new THREE.Color(1, 1, 1), edge = new THREE.Color(0.86, 0.72, 0.76);
    for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
      const u = i / NU, v = (j / NV) * 2 - 1;
      c.copy(deep).lerp(mid, smooth(u * 2.2 + Math.abs(v) * 0.4)).lerp(edge, smooth((Math.abs(v) - 0.6) / 0.4) * 0.6);
      const vein = Math.pow(Math.max(0, Math.cos((v * 3.2 + Math.sin(u * 7) * 0.25) * Math.PI)), 18) * smooth((u - 0.12) / 0.2) * (1 - u) * 0.35;
      c.multiplyScalar(1 - vein);
      col.push(c.r, c.g, c.b);
    }
    inner.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  // thin pink lip wrapping onto the back edge so the ear reads from behind
  const backAt = (u, v) => { const p = front(u, v); p[2] += thick * Math.sqrt(Math.max(0, 1 - v * v)) * (1 - 0.7 * u) * (1 + 1.0 * (1 - smooth(u / 0.3))) + 0.0025; return p; };
  const lips = [-1, 1].map((sd) => grid((u, v) => backAt(0.04 + u * 0.9, sd * (0.84 + 0.15 * (v + 1) / 2)), sd < 0));
  for (const l of lips) l.setAttribute('color', new THREE.Float32BufferAttribute(new Array(l.attributes.position.count * 3).fill(0.88), 3));
  return { outer, inner: mergeGeometries([inner, ...lips]) };
}

// Cempasúchil pom-pom: ruffled, slightly flattened along +Z (its face).
function marigold(r, hex) {
  let g = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const deep = new THREE.Color('#c23a00'), main = new THREE.Color(hex), tip = new THREE.Color('#ffc928');
  const c = new THREE.Color(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const ang = Math.atan2(v.y, v.x);
    const ridge = Math.abs(Math.sin(ang * 5 + v.z * 7));
    const f = Math.sin(v.x * 9 + 1.3) * Math.sin(v.y * 10 + 0.7) * Math.sin(v.z * 8 + 2.1);
    const rr = 1 + 0.13 * f + 0.12 * ridge;
    const zf = v.z < 0 ? 0.62 : 0.9;
    p.setXYZ(i, v.x * rr * r, v.y * rr * r, v.z * rr * r * zf);
    const t = clamp(0.35 + 0.5 * ridge + 0.4 * f, 0, 1);
    c.copy(deep).lerp(main, t).lerp(tip, Math.max(0, f) * 0.35);
    if (v.z > 0.85) c.lerp(deep, 0.45);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function starGeo() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2, r = i % 2 ? 0.035 : 0.08;
    i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
    g.deleteAttribute('uv');
    g.translate(0, 0, -0.01);
    const a = (k / 3) * TAU;
    g.rotateY(-a);
    g.translate(Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------- layout
function layout(P) {
  const LL = P.legLength, HS = P.headScale * 1.1;
  return {
    LL, HS,
    bodyY: 0.5 + (LL - 1) * 0.43,
    chest: [0, 0, -0.17],
    hips: [0, 0.015, 0.19],
    shoulder: [0.082, -0.055, -0.07], // rel chest
    hip: [0.08, -0.005, 0.07],        // rel hips
    front: [0.2 * LL, 0.195 * LL, 0.07 * LL],
    hind: [0.2 * LL, 0.215 * LL, 0.135 * LL],
    neck: [0, 0.07, -0.19],
    neckLen: 0.22, neckTilt: 0.62,
    tail: [0, 0.07, 0.2],
    tailSeg: 0.078 * P.tailLength, tailN: 6,
  };
}

const CHEST = [
  { z: -0.455, w: 0.02, h: 0.02, y: 0.03 },
  { z: -0.435, w: 0.068, h: 0.082, y: 0.025 },
  { z: -0.395, w: 0.102, h: 0.127, y: 0.005, k: 0.2 },
  { z: -0.31, w: 0.12, h: 0.15, y: -0.01, k: 0.35 },
  { z: -0.2, w: 0.123, h: 0.148, y: -0.005, k: 0.35 },
  { z: -0.1, w: 0.116, h: 0.133, y: 0.01, k: 0.3 },
  { z: 0.0, w: 0.098, h: 0.104, y: 0.035, k: 0.15 },
  { z: 0.06, w: 0.086, h: 0.083, y: 0.05 },
  { z: 0.09, w: 0.07, h: 0.06, y: 0.055 },
  { z: 0.1, w: 0.02, h: 0.02, y: 0.055 },
];
const HIP = [
  { z: -0.06, w: 0.02, h: 0.02, y: 0.05 },
  { z: -0.04, w: 0.078, h: 0.073, y: 0.05 },
  { z: 0.04, w: 0.085, h: 0.079, y: 0.055 },
  { z: 0.14, w: 0.099, h: 0.092, y: 0.055 },
  { z: 0.24, w: 0.104, h: 0.095, y: 0.055 },
  { z: 0.32, w: 0.094, h: 0.088, y: 0.06 },
  { z: 0.38, w: 0.07, h: 0.068, y: 0.065 },
  { z: 0.41, w: 0.035, h: 0.035, y: 0.07 },
  { z: 0.42, w: 0.01, h: 0.01, y: 0.07 },
];
// body-space torso: brisket, deep chest, tucked waist, rounded haunch
const TORSO = [
  { z: -0.468, w: 0.025, h: 0.03, y: 0.035 },
  { z: -0.452, w: 0.074, h: 0.09, y: 0.028 },
  { z: -0.415, w: 0.108, h: 0.138, y: 0.006, k: 0.2 },
  { z: -0.345, w: 0.13, h: 0.163, y: -0.014, k: 0.36 },
  { z: -0.255, w: 0.135, h: 0.163, y: -0.014, k: 0.4 },
  { z: -0.16, w: 0.128, h: 0.148, y: -0.002, k: 0.38 },
  { z: -0.075, w: 0.11, h: 0.118, y: 0.026, k: 0.25 },
  { z: 0.0, w: 0.096, h: 0.094, y: 0.05, k: 0.08 },
  { z: 0.07, w: 0.097, h: 0.09, y: 0.06 },
  { z: 0.15, w: 0.11, h: 0.098, y: 0.066 },
  { z: 0.24, w: 0.118, h: 0.103, y: 0.07 },
  { z: 0.32, w: 0.11, h: 0.097, y: 0.074 },
  { z: 0.385, w: 0.085, h: 0.079, y: 0.079 },
  { z: 0.42, w: 0.048, h: 0.048, y: 0.082 },
  { z: 0.432, w: 0.012, h: 0.012, y: 0.082 },
];
const HEAD = [
  { z: 0.085, w: 0.012, h: 0.012, y: 0.062 },
  { z: 0.07, w: 0.05, h: 0.052, y: 0.062 },
  { z: 0.04, w: 0.078, h: 0.075, y: 0.058 },
  { z: -0.005, w: 0.09, h: 0.08, y: 0.052 },
  { z: -0.055, w: 0.086, h: 0.074, y: 0.044, k: 0.1 },
  { z: -0.095, w: 0.072, h: 0.062, y: 0.032, k: 0.15 },
  { z: -0.13, w: 0.058, h: 0.051, y: 0.02, k: 0.12 },
  { z: -0.17, w: 0.05, h: 0.046, y: 0.01, k: 0.08 },
  { z: -0.21, w: 0.043, h: 0.041, y: 0.003 },
  { z: -0.245, w: 0.036, h: 0.035, y: -0.002 },
  { z: -0.268, w: 0.028, h: 0.028, y: -0.003 },
  { z: -0.281, w: 0.016, h: 0.017, y: -0.003 },
  { z: -0.287, w: 0.005, h: 0.005, y: -0.003 },
];
const JAW = [
  { z: 0.03, w: 0.01, h: 0.01, y: -0.012 },
  { z: 0.01, w: 0.055, h: 0.032, y: -0.014 },
  { z: -0.06, w: 0.05, h: 0.028, y: -0.018 },
  { z: -0.13, w: 0.04, h: 0.022, y: -0.02 },
  { z: -0.19, w: 0.031, h: 0.017, y: -0.018 },
  { z: -0.225, w: 0.02, h: 0.012, y: -0.016 },
  { z: -0.236, w: 0.006, h: 0.006, y: -0.015 },
];

// ---------------------------------------------------------------- main
export function createXolo(params = {}) {
  const P = Object.assign({}, XOLO_DEFAULTS, params);
  const root = new THREE.Group();
  root.name = 'xolo';

  const mats = [
    new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0 }),                       // 0 skin
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }),      // 1 pink (inner ear, tongue)
    new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, metalness: 0 }), // 2 eyes
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, emissive: new THREE.Color('#3a1200') }), // 3 garland
  ];
  const rimU = { rimColor: { value: new THREE.Color() }, rimPower: { value: 2.6 } };
  mats[0].onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, rimU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 rest;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = rest;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 rimColor;
uniform float rimPower;
varying vec3 vRest;
float xHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float xNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(xHash(i), xHash(i + vec3(1,0,0)), f.x), mix(xHash(i + vec3(0,1,0)), xHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(xHash(i + vec3(0,0,1)), xHash(i + vec3(1,0,1)), f.x), mix(xHash(i + vec3(0,1,1)), xHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float xSkin(vec3 p) { return xNoise(p * 95.0) * 0.2 + xNoise(p * 34.0) * 0.45 + xNoise(p * 12.0) * 0.35; }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      float skinN = xSkin(vRest);
      float skinFade = 1.0 - smoothstep(2.5, 9.0, length(vViewPosition));
      roughnessFactor = clamp(roughnessFactor * (0.85 + 0.35 * skinN * skinFade), 0.05, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        float hS = skinN * 0.0007 * skinFade;
        vec2 dH = vec2(dFdx(hS), dFdy(hS));
        vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
        vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
        float det = dot(sx, r1) * faceDirection;
        normal = normalize(abs(det) * normal - sign(det) * (dH.x * r1 + dH.y * r2));
      }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), rimPower);
        vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        rimF *= 0.45 + 0.55 * saturate(dot(normal, upV) + 0.35);
        totalEmissiveRadiance += rimColor * rimF;
      }`);
  };
  mats[0].customProgramCacheKey = () => 'xolo-skin-rim';
  mats[1].emissive = new THREE.Color();
  function applyMaterials() {
    const m = mats[0];
    rimU.rimColor.value.set(P.rimColor).multiplyScalar(P.rimStrength);
    rimU.rimPower.value = P.rimPower;
    m.color.set(P.skinColor); m.roughness = P.roughness; m.clearcoat = P.clearcoat;
    m.clearcoatRoughness = P.clearcoatRoughness;
    for (const mm of mats) mm.envMapIntensity = P.envMapIntensity;
    mats[1].color.set(P.innerEarColor);
    mats[1].emissive.set(P.innerEarColor).multiplyScalar(0.1);
    mats[2].color.set(P.eyeColor);
  }

  const stars = new THREE.Mesh(starGeo(), new THREE.MeshBasicMaterial({ color: '#ffd23a', toneMapped: false }));
  stars.visible = false; stars.name = 'xolo-dizzy';
  root.add(stars);

  let mesh = null, rig = null, castShadow = false;

  // ---------------------------------------------------- build
  function build() {
    const L = layout(P), HS = L.HS, ES = P.earScale;
    const bones = [];
    const mk = (name, parent, x = 0, y = 0, z = 0, order = 'XYZ') => {
      const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); b.rotation.order = order;
      if (parent) parent.add(b); bones.push(b); return b;
    };
    const base = mk('base', null, 0, 0, 0, 'YXZ');
    const body = mk('body', base, 0, L.bodyY, 0, 'YXZ');
    const chest = mk('chest', body, ...L.chest);
    const chestShape = mk('chestShape', chest);
    const hips = mk('hips', body, ...L.hips);
    const hipShape = mk('hipShape', hips);
    const neck = mk('neck', chest, ...L.neck);
    const nd = new THREE.Vector3(0, Math.cos(L.neckTilt), -Math.sin(L.neckTilt));
    const head = mk('head', neck, 0, nd.y * L.neckLen, nd.z * L.neckLen, 'YXZ');
    const jaw = mk('jaw', head, 0, -0.02 * HS, -0.04 * HS);
    const ears = [-1, 1].map((side) => ({ side, bone: mk('ear' + side, head, side * 0.044 * HS, 0.088 * HS, 0.018 * HS, 'YXZ') }));

    const legs = [];
    for (const front of [true, false]) for (const side of [-1, 1]) {
      const parent = front ? chest : hips, j = front ? L.shoulder : L.hip, Ls = front ? L.front : L.hind;
      const upper = mk((front ? 'F' : 'H') + side + 'u', parent, side * j[0], j[1], j[2], 'ZXY');
      const mid = mk('m', upper, 0, -Ls[0], 0);
      const foot = mk('f', mid, 0, -Ls[1], 0);
      const paw = mk('p', foot, 0, -Ls[2], 0);
      const po = front ? L.chest : L.hips;
      legs.push({
        front, side, parent, upper, mid, foot, paw, L: Ls, kneeFwd: !front,
        joint: new THREE.Vector3(side * j[0], L.bodyY + po[1] + j[1], po[2] + j[2]),
        name: (front ? 'F' : 'H') + (side < 0 ? 'L' : 'R'),
        restDz: front ? 0.02 : 0.045, psiRest: front ? 0.12 : 0.3,
        phaseOff: front ? (side < 0 ? 0.45 : 0.55) : (side < 0 ? 0.0 : 0.1),
      });
    }
    const tail = [];
    let tp = hips;
    for (let i = 0; i < L.tailN; i++) {
      tp = mk('tail' + i, tp, ...(i === 0 ? L.tail : [0, 0, L.tailSeg]), 'YXZ');
      tail.push(tp);
    }

    base.updateMatrixWorld(true);
    const inverses = bones.map((b) => b.matrixWorld.clone().invert());

    // ---- pieces
    const pieces = [];
    const add = (geo, bone, group, color = 1, skinFn = null) => pieces.push({ geo, bone, group, color, skinFn });
    const shift = (secs, o) => secs.map((s) => ({ ...s, z: s.z - o[2], y: (s.y || 0) - o[1] }));
    const vol = (secs, fw, fh) => secs.map((q) => (q.w > 0.03 ? { ...q, w: q.w * fw, h: q.h * fh } : q));
    // one continuous torso in body space, skin-blended from chest to hips (no seam at the waist)
    {
      const ci = bones.indexOf(chestShape), hi = bones.indexOf(hipShape);
      const torso = loft(TORSO.map((q) => ({ ...q, y: (q.y || 0) })), 36, 4);
      add(torso, body, 0, 1, (p) => {
        const t = smooth((p.z + 0.07) / 0.2);
        return [ci, hi, 1 - t, t];
      });
    }

    // neck
    const neckG = loft([
      { z: -0.06, w: 0.06, h: 0.066 }, { z: -0.01, w: 0.072, h: 0.084, y: -0.006 }, { z: 0.06, w: 0.064, h: 0.074, y: -0.004 },
      { z: 0.14, w: 0.056, h: 0.064 }, { z: L.neckLen, w: 0.053, h: 0.06, y: 0.004 }, { z: L.neckLen + 0.035, w: 0.032, h: 0.032 },
    ], 30, 3);
    neckG.rotateX(-(Math.PI / 2 + L.neckTilt));
    add(neckG, neck, 0);

    // head
    const hs = (g) => { g.scale(HS, HS, HS); return g; };
    add(hs(loft(HEAD, 40, 3)), head, 0);
    add(hs(loft(JAW, 28, 3)), jaw, 0);
    const tongue = ellipsoid(0.023, 0.006, 0.05, 10, 6); tongue.rotateX(0.18); tongue.translate(0, 0.0, -0.17);
    add(hs(tongue), jaw, 1, [1, 0.72, 0.78]);
    const nose = ellipsoid(0.024, 0.017, 0.018, 16, 12); nose.translate(0, 0.016, -0.274);
    add(hs(nose), head, 0, 0.35);
    for (const s of [-1, 1]) {
      const nos = ellipsoid(0.0062, 0.0042, 0.004, 10, 6); nos.rotateZ(s * 0.5); nos.translate(s * 0.0095, 0.014, -0.2905);
      add(hs(nos), head, 0, 0.02);
    }
    // brow ridges for expression
    for (const s of [-1, 1]) {
      const brow = ellipsoid(0.024, 0.008, 0.018, 14, 8); brow.rotateZ(-s * 0.3); brow.translate(s * 0.046, 0.083, -0.088);
      add(hs(brow), head, 0);
      const pd = new THREE.Vector3(s * 0.6, 0.1, -1).normalize(), n = new THREE.Vector3();
      const eye = new THREE.SphereGeometry(0.0185, 32, 24); eye.deleteAttribute('uv');
      const ep = eye.attributes.position, ec = new Float32Array(ep.count * 3);
      for (let i = 0; i < ep.count; i++) {
        const d = n.fromBufferAttribute(ep, i).normalize().dot(pd);
        const iris = d > 0.83 ? 0.012 : d > 0.79 ? 0.35 : d > 0.5 ? 1 - (d - 0.5) * 0.9 : d > 0.44 ? 0.25 : 0.9;
        ec[i * 3] = ec[i * 3 + 1] = ec[i * 3 + 2] = iris;
      }
      eye.setAttribute('color', new THREE.BufferAttribute(ec, 3));
      const eq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), pd);
      eye.scale(1, 0.82, 1); eye.applyQuaternion(eq);
      eye.translate(s * 0.05, 0.058, -0.098);
      add(hs(eye), head, 2);
      // almond eyelid rim so the eye sits in the skull instead of on it
      const lid = new THREE.TorusGeometry(0.0182, 0.0052, 12, 48); lid.deleteAttribute('uv');
      lid.scale(1.12, 0.8, 1); lid.rotateZ(-s * 0.18); lid.applyQuaternion(eq);
      lid.translate(s * 0.05, 0.058, -0.098).translate(pd.x * 0.0085, pd.y * 0.0085, pd.z * 0.0085);
      add(hs(lid), head, 0, 0.85);
    }
    if (P.tuft) {
      for (let i = 0; i < 11; i++) {
        const u = i / 10 - 0.5;
        const c = new THREE.ConeGeometry(0.008, 0.045 + (i % 3) * 0.012, 8, 1); c.deleteAttribute('uv');
        c.translate(0, 0.022, 0); c.rotateX(0.75 + (i % 3) * 0.1); c.rotateZ(u * 0.9);
        c.translate(u * 0.06, 0.117 - Math.abs(u) * 0.02, -0.02 + (i % 2) * 0.018);
        add(hs(c), head, 0, 2.2);
      }
    }
    // ears
    const eg = earGeos(0.28 * ES, 0.074 * ES, 0.03 * ES, 0.017 * ES);
    for (const k of ['outer', 'inner']) eg[k].translate(0, -0.028 * ES, 0); // root sunk into the skull
    const hi = bones.indexOf(head);
    for (const e of ears) {
      const ei = bones.indexOf(e.bone);
      // root follows the skull so the ear grows out of the head when it swivels
      const rootSkin = (p) => { const w = 1 - smooth((p.y + 0.01 * HS) / (0.08 * HS)); return [ei, hi, 1 - w, w]; };
      add(hs(eg.outer.clone()), e.bone, 0, 1, rootSkin);
      add(hs(eg.inner.clone()), e.bone, 1, 1, rootSkin);
    }

    // collar garland (neck-local ring around neck base)
    if (P.collar) {
      const e1 = new THREE.Vector3(1, 0, 0), e2 = new THREE.Vector3(0, Math.sin(L.neckTilt), Math.cos(L.neckTilt));
      const c0 = nd.clone().multiplyScalar(0.04), R = 0.102, N = 12, Z = new THREE.Vector3(0, 0, 1);
      const cols = ['#ff8a00', '#ffa21a', '#ff7000'];
      const q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
      const flowers = [];
      for (let k = 0; k < N; k++) {
        const a = -Math.PI / 2 + (k / N) * TAU;
        const nrm = e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
        const big = k === 0 ? 1.3 : 1;
        const g = marigold(0.054 * big, cols[k % 3]);
        q.setFromUnitVectors(Z, nrm);
        m4.compose(c0.clone().addScaledVector(nrm, R * (k === 0 ? 1.12 : 1)), q, one);
        g.applyMatrix4(m4); flowers.push(g);
        // leaf between flowers
        const a2 = a + Math.PI / N;
        const n2 = e1.clone().multiplyScalar(Math.cos(a2)).addScaledVector(e2, Math.sin(a2));
        const leaf = ellipsoid(0.019, 0.006, 0.04, 8, 5);
        leaf.translate(0, 0, 0.02);
        const lc = new THREE.Color(k % 2 ? '#3d8a26' : '#2f7020');
        leaf.setAttribute('color', new THREE.Float32BufferAttribute(new Array(leaf.attributes.position.count).fill(0).flatMap(() => [lc.r, lc.g, lc.b]), 3));
        q.setFromUnitVectors(Z, n2);
        m4.compose(c0.clone().addScaledVector(n2, R * 0.95), q, one);
        leaf.applyMatrix4(m4); flowers.push(leaf);
      }
      const rib = new THREE.TorusGeometry(R * 0.86, 0.017, 8, 36); rib.deleteAttribute('uv');
      const rc = new THREE.Color('#e8177d');
      rib.setAttribute('color', new THREE.Float32BufferAttribute(new Array(rib.attributes.position.count).fill(0).flatMap(() => [rc.r, rc.g, rc.b]), 3));
      q.setFromUnitVectors(Z, nd); rib.applyQuaternion(q); rib.translate(c0.x, c0.y, c0.z);
      flowers.push(rib);
      for (const f of flowers) f.deleteAttribute('uv');
      add(mergeGeometries(flowers.map((f) => (f.index ? f.toNonIndexed() : f))), neck, 3, 1);
    }

    // legs: one continuous tapered tube per leg, skin-blended across the joints
    for (const leg of legs) {
      const [L1, L2, L3] = leg.L, J1 = L1, J2 = L1 + L2, J3 = J2 + L3;
      // [distance down the leg, radius, width scale, forward offset]
      const prof = leg.front
        ? [[0, 0.06, 0.8, 0], [0.07, 0.054, 0.8, 0.004], [J1 * 0.75, 0.036, 0.88, 0], [J1, 0.029, 0.95, 0],
           [J1 + L2 * 0.5, 0.024, 1, 0], [J2, 0.02, 1, 0], [J3, 0.0185, 1, 0]]
        : [[0, 0.084, 0.74, -0.008], [0.06, 0.08, 0.74, -0.012], [J1 * 0.6, 0.055, 0.8, -0.008], [J1, 0.031, 0.92, 0],
           [J1 + L2 * 0.35, 0.026, 1, 0], [J2, 0.019, 1, 0], [J3, 0.017, 1, 0]];
      const at = (d) => {
        let i = 0; while (i < prof.length - 2 && d > prof[i + 1][0]) i++;
        const a = prof[i], b = prof[i + 1], t = smooth((d - a[0]) / (b[0] - a[0]));
        return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
      };
      const secs = [], r0 = prof[0][1];
      for (let i = 0; i <= 3; i++) {
        const t = 0.2 + (i / 3) * (Math.PI / 2 - 0.2), r = r0 * Math.sin(t);
        secs.push({ z: -r0 * Math.cos(t), w: r * prof[0][2], h: r, y: prof[0][3] });
      }
      const NS = 30;
      for (let i = 1; i <= NS; i++) {
        const d = (i / NS) * J3, [r, sx, off] = at(d);
        secs.push({ z: d, w: r * sx, h: r, y: off });
      }
      secs.push({ z: J3 + 0.012, w: 0.008, h: 0.008 });
      const tube = loft(secs, 24); tube.rotateX(Math.PI / 2);
      const bi = [leg.upper, leg.mid, leg.foot, leg.paw].map((b) => bones.indexOf(b));
      const joints = [[J1, 0.04], [J2, 0.03], [J3, 0.018]];
      add(tube, leg.upper, 0, 1, (p) => {
        const d = -p.y;
        for (let j = 0; j < 3; j++) {
          const [J, b] = joints[j];
          if (d < J - b) return [bi[j], bi[j + 1], 1, 0];
          if (d < J + b) { const t = smooth((d - J + b) / (2 * b)); return [bi[j], bi[j + 1], 1 - t, t]; }
        }
        return [bi[3], bi[2], 1, 0];
      });
      const pw = leg.front ? 1 : 0.94;
      const paw = ellipsoid(0.026 * pw, 0.021, 0.032, 20, 14); paw.translate(0, 0.023, -0.01);
      add(paw, leg.paw, 0);
      for (let k = 0; k < 4; k++) {
        const ox = (k - 1.5) * 0.0142 * pw, side = Math.abs(k - 1.5) > 1;
        const toe = ellipsoid(0.0098 * pw, 0.0105, 0.0155, 14, 10);
        toe.translate(ox, 0.011, -0.033 + (side ? 0.006 : 0));
        add(toe, leg.paw, 0);
        const nail = new THREE.ConeGeometry(0.0034, 0.013, 8, 1); nail.deleteAttribute('uv');
        nail.rotateX(-Math.PI / 2 - 0.55); nail.translate(ox, 0.007, -0.05 + (side ? 0.006 : 0));
        add(nail, leg.paw, 0, 2.4);
      }
    }

    // tail: one smooth tube blended between consecutive bones
    const tLen = L.tailSeg * (L.tailN - 1), tSecs = [];
    for (let i = 0; i <= 32; i++) {
      const s = (i / 32) * (tLen + 0.02);
      const r = lerp(0.03, 0.007, Math.pow(s / tLen, 0.8));
      tSecs.push({ z: s, w: r, h: r });
    }
    tSecs[0] = { z: -0.03, w: 0.012, h: 0.012 };
    tSecs.push({ z: tLen + 0.03, w: 0.003, h: 0.003 });
    const t0 = bones.indexOf(tail[0]);
    add(loft(tSecs, 20), tail[0], 0, 1, (p) => {
      const f = clamp(p.z / L.tailSeg, 0, L.tailN - 1 - 1e-4), i = Math.floor(f), w = f - i;
      return [t0 + i, t0 + i + 1, 1 - w, w];
    });

    // ---- merge into one skinned geometry with groups
    pieces.sort((a, b) => a.group - b.group);
    const P_ = [], N_ = [], C_ = [], SI = [], SW = [], I_ = [];
    const groups = [];
    const v = new THREE.Vector3();
    for (const pc of pieces) {
      let g = pc.geo;
      if (!g.index) { const n = g.attributes.position.count; g.setIndex([...Array(n).keys()]); }
      if (!g.attributes.normal) g.computeVertexNormals();
      const bi = bones.indexOf(pc.bone);
      const pos = g.attributes.position, cnt = pos.count, vOff = P_.length / 3;
      const skins = [];
      for (let i = 0; i < cnt; i++) skins.push(pc.skinFn ? pc.skinFn(v.fromBufferAttribute(pos, i)) : [bi, 0, 1, 0]);
      g.applyMatrix4(pc.bone.matrixWorld);
      const nor = g.attributes.normal, col = g.attributes.color;
      const cm = Array.isArray(pc.color) ? pc.color : [pc.color, pc.color, pc.color];
      for (let i = 0; i < cnt; i++) {
        P_.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        N_.push(nor.getX(i), nor.getY(i), nor.getZ(i));
        if (col) C_.push(col.getX(i) * cm[0], col.getY(i) * cm[1], col.getZ(i) * cm[2]); else C_.push(...cm);
        const s = skins[i]; SI.push(s[0], s[1], 0, 0); SW.push(s[2], s[3], 0, 0);
      }
      const idx = g.index.array, start = I_.length;
      for (let i = 0; i < idx.length; i++) I_.push(idx[i] + vOff);
      const last = groups[groups.length - 1];
      if (last && last.m === pc.group) last.count += idx.length; else groups.push({ start, count: idx.length, m: pc.group });
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P_, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N_, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C_, 3));
    geo.setAttribute('rest', new THREE.Float32BufferAttribute(P_, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    geo.setIndex(P_.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I_, 1) : new THREE.Uint16BufferAttribute(I_, 1));
    for (const gr of groups) geo.addGroup(gr.start, gr.count, gr.m);

    const sm = new THREE.SkinnedMesh(geo, mats);
    sm.name = 'xolo-body';
    sm.frustumCulled = false;
    sm.add(base);
    sm.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
    sm.castShadow = castShadow;
    return { mesh: sm, L, bones, base, body, chest, chestShape, hips, hipShape, neck, head, jaw, ears, legs, tail };
  }

  // ---------------------------------------------------- animation state
  const sp = {};
  const st = {};
  function makeSprings() {
    const k = P.springiness;
    sp.lean = new Spring(90, 0.55); sp.yaw = new Spring(70, 0.6); sp.side = new Spring(120, 0.6);
    sp.squash = new Spring(260, 0.32);
    sp.ears = [0, 1].map(() => ({ p: new Spring(220 * k, 0.2), r: new Spring(200 * k, 0.2) }));
    sp.tail = [];
    for (let i = 0; i < 8; i++) sp.tail.push({ x: new Spring((190 - i * 12) * k, 0.28), y: new Spring((170 - i * 12) * k, 0.25) });
  }
  function reset() {
    makeSprings();
    Object.assign(st, {
      t: 0, phase: 0, runB: 0, airB: 0, speedS: 0, prevV: 0, prevLat: 0, aY: 0, aX: 0,
      deathCause: null, deathT: 0, spin: 0, swirl: 0, deathSide: 1, stumbleT: 0, stumbleDir: 0, earPin: 0,
      lookT: 1.5, lookYaw: 0, lookPitch: 0, lookYawS: 0, lookPitchS: 0, twitchT: 1, prevBob: 0,
    });
    stars.visible = false;
    if (rig) {
      rig.base.position.set(0, 0, 0); rig.base.rotation.set(0, 0, 0);
      update(1 / 60, { mode: 'idle', speed: 0, grounded: true, vy: 0, lateral: 0 });
    }
  }

  // ---------------------------------------------------- IK
  const _A = new THREE.Vector3(), _M = new THREE.Matrix4(), _Mh = new THREE.Matrix4();
  function solveLeg(leg, F, psiBase, pawBase, M, parentPitch) {
    const [L1, L2, L3] = leg.L;
    _A.set(F.x, F.y + L3 * Math.cos(psiBase), F.z + L3 * Math.sin(psiBase)).applyMatrix4(M).sub(leg.upper.position);
    const a = clamp(Math.atan2(_A.x, Math.max(0.05, -_A.y)), -0.5, 0.5);
    const down = _A.x * Math.sin(a) - _A.y * Math.cos(a);
    const phi = Math.atan2(-_A.z, down);
    const r = clamp(Math.hypot(down, _A.z), Math.abs(L1 - L2) + 0.01, L1 + L2 - 1e-4);
    const alpha = Math.acos(clamp((L1 * L1 + r * r - L2 * L2) / (2 * L1 * r), -1, 1));
    const bend = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - r * r) / (2 * L1 * L2), -1, 1));
    const u = leg.upper, m = leg.mid;
    if (leg.kneeFwd) { u.rotation.x = phi + alpha; m.rotation.x = -bend; } else { u.rotation.x = phi - alpha; m.rotation.x = bend; }
    u.rotation.z = a;
    const psi = psiBase - parentPitch;
    leg.foot.rotation.x = psi - u.rotation.x - m.rotation.x;
    leg.paw.rotation.x = pawBase - parentPitch - psi;
  }

  const _F = new THREE.Vector3(), _hw = new THREE.Vector3(), _gw = new THREE.Vector3();
  const footfalls = [];
  // world position of a paw projected onto the ground plane under the root (y = root world y)
  function emitFoot(leg, info) {
    const p = new THREE.Vector3();
    leg.paw.getWorldPosition(p);
    root.getWorldPosition(_gw);
    p.y = _gw.y;
    xolo.onFootfall(p, leg.name, info);
  }
  // ---------------------------------------------------- update
  function update(dt, s = {}) {
    if (!rig) return;
    dt = Math.min(dt, 0.05);
    if (!(dt > 0)) return;
    const R = rig, L = R.L;
    const mode = s.mode || 'idle', speed = s.speed || 0, grounded = s.grounded !== false;
    const vy = s.vy || 0, lat = s.lateral || 0;
    const dead = mode === 'dead';
    if (dead && !st.deathCause) onDeath('crash');
    if (!dead && st.deathCause) { st.deathCause = null; stars.visible = false; R.base.position.set(0, 0, 0); R.base.rotation.set(0, 0, 0); }
    st.t += dt;
    const t = st.t;
    const running = mode === 'run' && !dead;
    const air = !grounded && !dead;
    st.speedS = damp(st.speedS, running ? speed : 0, 6, dt);
    st.runB = damp(st.runB, running && speed > 0.2 ? clamp(speed / 6, 0, 1) : 0, 5, dt);
    st.airB = damp(st.airB, air ? 1 : 0, air ? 12 : 16, dt);
    const runB = st.runB, airB = st.airB, gnd = 1 - airB, idleB = (1 - runB) * (dead ? 0 : 1);
    const freq = (2.2 + st.speedS * 0.1) * P.animSpeed;
    st.phase = (st.phase + dt * freq * runB) % 1;
    const ph = st.phase * TAU;

    // gait body motion
    const gk = runB * gnd;
    const flex = Math.cos(ph - 0.97 * TAU) * 0.11 * gk;
    const bob = Math.cos(ph - 0.95 * TAU) * 0.035 * gk;
    const gPitch = Math.sin(ph - 0.05 * TAU) * 0.06 * gk;
    const breath = Math.sin(t * TAU * 0.45);
    const pant = Math.sin(t * TAU * 2.8);
    const rise = clamp(vy / 6, 0, 1), fall = clamp(-vy / 6, 0, 1);
    const airPitch = clamp(vy * 0.03, -0.32, 0.28) * airB;

    // accelerations feeding springs
    const vNow = vy * airB + (bob - st.prevBob) / dt;
    st.prevBob = bob;
    st.aY = damp(st.aY, clamp((vNow - st.prevV) / dt, -60, 60), 30, dt);
    st.prevV = vNow;
    st.aX = damp(st.aX, clamp((lat - st.prevLat) / dt, -80, 80), 30, dt);
    st.prevLat = lat;

    // idle behaviours
    if (idleB > 0.5 && !dead) {
      st.lookT -= dt;
      if (st.lookT < 0) {
        st.lookT = 1.6 + Math.random() * 2.6;
        const r = Math.random();
        st.lookYaw = r < 0.3 ? 0 : (Math.random() * 2 - 1) * 0.65;
        st.lookPitch = (Math.random() * 2 - 1) * 0.15 + 0.03;
      }
      st.twitchT -= dt;
      if (st.twitchT < 0) {
        st.twitchT = 0.9 + Math.random() * 2.8;
        const e = sp.ears[(Math.random() * 2) | 0];
        e.r.v += (Math.random() < 0.5 ? -1 : 1) * 7; e.p.v += 5 + Math.random() * 5;
      }
    } else { st.lookYaw = 0; st.lookPitch = 0; }
    st.lookYawS = damp(st.lookYawS, st.lookYaw, 5, dt);
    st.lookPitchS = damp(st.lookPitchS, st.lookPitch, 5, dt);
    st.stumbleT = Math.max(0, st.stumbleT - dt * 2.2);
    st.earPin = Math.max(0, st.earPin - dt * 1.6);

    // springs (substepped)
    const leanT = dead ? 0 : clamp(-lat * 0.035, -0.35, 0.35);
    const yawT = dead ? 0 : clamp(-lat * 0.02, -0.25, 0.25);
    const earPitchT = 0.08 + runB * 0.32 + st.speedS * 0.008 + st.earPin * 0.9 + (dead ? 0.6 : 0) - 0.05 * idleB;
    const tailUp = dead ? 0.0 : lerp(0.8, 0.32, runB) - st.stumbleT * 0.6 + airB * rise * 0.2;
    const wag = idleB * (0.55 + 0.1 * Math.sin(t * 0.7));
    const flail = st.deathCause === 'splash';
    const n = Math.ceil(dt / (1 / 120)), h = dt / n;
    for (let k = 0; k < n; k++) {
      sp.lean.step(h, leanT); sp.yaw.step(h, yawT); sp.side.step(h, 0); sp.squash.step(h, 0);
      sp.ears.forEach((e, i) => {
        const side = i ? 1 : -1;
        const fl = flail ? Math.sin(t * 22 + i * 2) * 120 + st.swirl * 9 : 0;
        e.p.step(h, earPitchT, st.aY * 0.35 + fl * 0.5);
        e.r.step(h, dead && !flail ? 0.5 : 0, st.aY * 0.9 - side * st.aX * 0.5 + fl);
      });
      sp.tail.forEach((ts, i) => {
        if (i >= R.tail.length) return;
        const gain = 0.3 + i * 0.25;
        const wave = Math.sin(ph - i * 0.9) * 0.12 * runB;
        const wagY = wag * Math.sin(t * TAU * 2.3 - i * 0.55) * (0.25 + 0.1 * i);
        const runY = Math.sin(ph * 0.5 - i * 0.7) * 0.07 * runB;
        const thr = flail ? Math.sin(t * 14 - i * 0.8) * 0.5 + st.deathSide * clamp(st.swirl * 0.06, 0, 0.9) : 0;
        ts.x.step(h, (i === 0 ? -tailUp : -0.11 + (dead && !flail ? 0.12 : 0)) + wave, st.aY * gain * 0.9);
        ts.y.step(h, wagY + runY + thr, st.aX * gain * 0.5);
      });
    }

    // ---- base (death / whole-body) pose
    const base = R.base;
    base.position.set(0, 0, 0); base.rotation.set(0, 0, 0);
    let deadLimp = 0, dizzy = 0, headUp = 0, jawOpen;
    if (st.deathCause === 'crash') {
      const dT = (st.deathT += dt);
      const k1 = smooth(dT / 0.2), k2 = smooth((dT - 0.2) / 0.45);
      const Py = L.bodyY;
      const bounce = dT > 0.65 ? Math.sin((dT - 0.65) * 18) * Math.exp(-(dT - 0.65) * 6) * 0.12 : 0;
      const th = st.deathSide * (1.48 * k2 + bounce);
      base.rotation.x = 0.55 * k1 * (1 - k2);
      base.rotation.z = th;
      base.position.z = 0.35 * k1 + 0.15 * k2;
      base.position.x = Math.sin(th) * Py;
      base.position.y = Py - Math.cos(th) * Py - (Py - 0.13) * k2 + 0.22 * Math.sin(Math.PI * clamp(dT / 0.55, 0, 1));
      deadLimp = k2; dizzy = smooth((dT - 0.6) / 0.4);
      jawOpen = 0.32;
    } else if (st.deathCause === 'splash') {
      // sucked into a whirlpool: accelerating spin, spiralling in, tilted outward, flailing
      const dT = (st.deathT += dt), k = smooth(dT / 0.35);
      const w = Math.min(4 + dT * 7, 16);
      st.spin += w * dt * st.deathSide;
      const rad = 0.28 * k * Math.exp(-dT * 0.9);
      base.rotation.y = st.spin;
      base.rotation.x = (0.42 + Math.sin(t * 9) * 0.08) * k;
      base.rotation.z = st.deathSide * (0.3 + Math.sin(t * 6.3) * 0.1) * k;
      base.position.set(Math.cos(st.spin) * rad, Math.sin(t * 11) * 0.03 * k, Math.sin(st.spin) * rad);
      st.swirl = w * k;
      headUp = 0.55 * k;
      jawOpen = 0.45 + Math.sin(t * 13) * 0.12;
    }
    stars.visible = dizzy > 0.01;

    // ---- body
    const sq = clamp(sp.squash.x, -0.4, 0.6);
    const bodyY = L.bodyY + bob - sq * 0.13 + breath * 0.004 * idleB - deadLimp * 0.0;
    const body = R.body;
    const stumbleShake = st.stumbleT > 0 ? Math.sin(st.stumbleT * 30) * 0.05 * st.stumbleT : 0;
    body.position.set(sp.side.x + Math.sin(t * 0.9) * 0.008 * idleB, bodyY, 0);
    body.rotation.x = gPitch + airPitch + (deadLimp ? 0 : 0) + headUp * 0.2;
    body.rotation.y = sp.yaw.x;
    body.rotation.z = sp.lean.x + stumbleShake;
    R.chest.rotation.x = -flex - airB * 0.05 * fall;
    R.hips.rotation.x = flex + airB * (0.12 * rise - 0.06);
    const br = 1 + breath * 0.022 * (idleB + 0.5 * deadLimp) + pant * 0.006 * runB;
    R.chestShape.scale.set((1 + sq * 0.15) * br, (1 - sq * 0.3) * br, 1 + sq * 0.1);
    R.hipShape.scale.set(1 + sq * 0.15, 1 - sq * 0.28, 1 + sq * 0.08);

    // ---- neck / head
    R.neck.rotation.x = -0.12 * runB + airB * (0.1 * rise - 0.1 * fall) - sq * 0.25 + headUp * 0.4 - deadLimp * 0.3 + breath * 0.02 * idleB;
    const stab = -(gPitch - flex) * 0.9 - R.neck.rotation.x * 0.7;
    R.head.rotation.x = stab - 0.04 * runB + st.lookPitchS + airPitch * -0.4 + headUp * 0.3 - deadLimp * 0.1;
    R.head.rotation.y = st.lookYawS + sp.yaw.x * 1.3 + Math.sin(t * 3) * 0.25 * dizzy;
    R.head.rotation.z = -sp.lean.x * 0.6 + Math.sin(t * 2.4) * 0.25 * dizzy + st.lookYawS * -0.15;
    if (jawOpen === undefined) jawOpen = idleB * (0.025 + 0.025 * pant) + runB * (0.1 + 0.035 * Math.sin(ph * 2)) * gnd + airB * 0.02;
    R.jaw.rotation.x = -jawOpen;

    // ---- ears
    R.ears.forEach((e, i) => {
      const s = e.side, ss = sp.ears[i];
      e.bone.rotation.x = clamp(ss.p.x, -0.5, 1.4);
      e.bone.rotation.y = -s * 0.6;
      e.bone.rotation.z = -s * (0.34 + clamp(ss.r.x, -0.6, 1.2));
    });

    // ---- tail
    R.tail.forEach((b, i) => {
      b.rotation.x = clamp(sp.tail[i].x.x, -1.4, 1.4);
      b.rotation.y = clamp(sp.tail[i].y.x, -1.2, 1.2);
    });

    // ---- legs (IK, targets in base space)
    rig.mesh.updateMatrixWorld(true);
    _M.copy(R.chest.matrixWorld).invert().multiply(base.matrixWorld);
    _Mh.copy(R.hips.matrixWorld).invert().multiply(base.matrixWorld);
    const dY = bodyY - L.bodyY;
    const Sf = 0.55 * L.LL * runB, Sh = 0.5 * L.LL * runB;
    footfalls.length = 0;
    for (const leg of R.legs) {
      const j = leg.joint, jy = j.y + dY;
      // ground gait
      const duty = 0.38;
      const q = (st.phase - leg.phaseOff + 1) % 1;
      if (leg.prevQ !== undefined && q < leg.prevQ - 0.5 && runB > 0.5 && gnd > 0.8 && !dead) footfalls.push(leg);
      leg.prevQ = q;
      const S = leg.front ? Sf : Sh;
      let gz, gy = 0, psi = leg.psiRest, pawA = 0;
      if (q < duty) {
        const u = q / duty;
        gz = lerp(-S / 2, S / 2, u);
        if (u > 0.7) { const e = (u - 0.7) / 0.3; psi += (leg.front ? -0.5 : -0.4) * e * runB; pawA = 0.6 * e * runB; }
      } else {
        const u = (q - duty) / (1 - duty);
        gz = lerp(S / 2, -S / 2, smooth(u));
        gy = (leg.front ? 0.17 : 0.15) * L.LL * Math.sin(Math.PI * u) * runB;
        if (leg.front) psi += (-1.9 * Math.sin(Math.PI * Math.min(1, u * 1.25)) + 0.3 * smooth((u - 0.6) / 0.4)) * runB;
        else psi += 0.8 * Math.sin(Math.PI * u) * runB;
        pawA = (leg.front ? 0.9 : 0.5) * Math.sin(Math.PI * u) * runB;
      }
      const idleShift = idleB * Math.sin(t * 0.9 + (leg.front ? 0 : 1)) * 0.006;
      _F.set(j.x * (1 - 0.1 * runB), gy, j.z + leg.restDz + gz + idleShift);
      // air pose
      if (airB > 0.001) {
        let ax, ay, az, apsi;
        if (leg.front) {
          ay = jy - lerp(0.26, 0.37, fall) * L.LL; az = j.z - lerp(0.0, 0.2, fall); apsi = lerp(-1.7, 0.25, fall);
        } else {
          ay = jy - lerp(0.25, 0.36, rise) * L.LL; az = j.z + lerp(-0.07, 0.24, rise); apsi = lerp(1.25, -0.5, rise);
        }
        ax = j.x * 0.95;
        _F.set(lerp(_F.x, ax, airB), lerp(_F.y, ay, airB), lerp(_F.z, az, airB));
        psi = lerp(psi, apsi, airB); pawA = lerp(pawA, 0.8, airB);
      }
      if (st.deathCause === 'splash') {
        const w = t * 15 + (leg.front ? 0 : Math.PI) + (leg.side > 0 ? Math.PI / 2 : 0);
        _F.set(j.x * 1.2, jy - 0.3 + Math.sin(w) * 0.09, j.z - (leg.front ? 0.12 : -0.05) + Math.cos(w) * 0.12);
        psi = leg.front ? -0.6 + Math.sin(w) * 0.6 : 0.6; pawA = 0.6;
      } else if (deadLimp > 0) {
        const tw = Math.sin(t * 6 + leg.phaseOff * 9) * 0.03 * dizzy;
        const lx = j.x * 1.6, ly = jy - 0.36 * L.LL, lz = j.z + (leg.front ? -0.08 : 0.12) + tw;
        _F.set(lerp(_F.x, lx, deadLimp), lerp(_F.y, ly, deadLimp), lerp(_F.z, lz, deadLimp));
        psi = lerp(psi, leg.front ? -0.3 : 0.9, deadLimp); pawA = lerp(pawA, 0.9, deadLimp);
      }
      const pp = body.rotation.x + (leg.front ? R.chest.rotation.x : R.hips.rotation.x);
      solveLeg(leg, _F, psi, pawA, leg.front ? _M : _Mh, pp);
    }

    if (footfalls.length && xolo.onFootfall) {
      rig.mesh.updateMatrixWorld(true);
      for (const leg of footfalls) emitFoot(leg);
    }

    if (stars.visible) {
      R.head.getWorldPosition(_hw);
      root.worldToLocal(_hw);
      stars.position.set(_hw.x, _hw.y + 0.24, _hw.z + 0.02);
      stars.rotation.y = t * 5;
      stars.scale.setScalar(dizzy);
    }
  }

  // ---------------------------------------------------- events
  function onJump() {
    sp.squash.v -= 5.5;
    sp.ears.forEach((e) => { e.p.v += 4; e.r.v -= 4; });
    sp.tail.forEach((t, i) => { t.x.v += 3 + i; });
  }
  function onLand(strength = 0.6) {
    const s = clamp(strength, 0, 1);
    sp.squash.v += 2 + 8 * s;
    if (xolo.onFootfall && rig) {
      root.updateMatrixWorld(true);
      for (const leg of rig.legs) emitFoot(leg, { landing: true, strength: s });
    }
    sp.ears.forEach((e) => { e.r.v += 4 + 10 * s; e.p.v += 2 + 6 * s; });
    sp.tail.forEach((t, i) => { t.x.v += (2 + 8 * s) * (0.6 + 0.2 * i); });
  }
  function onLane(dir) {
    const d = Math.sign(dir) || 1;
    sp.lean.v -= d * 5; sp.yaw.v -= d * 4;
    sp.ears.forEach((e, i) => { e.r.v += (i ? -1 : 1) * d * 6; e.p.v += 2; });
    sp.tail.forEach((t, i) => { t.y.v += d * (2 + i * 1.2); });
  }
  function onStumble(dir = 1) {
    const d = Math.sign(dir) || 1;
    st.stumbleT = 1; st.stumbleDir = d; st.earPin = 1;
    sp.lean.v += d * 7; sp.yaw.v += d * 6; sp.side.v -= d * 2.2; sp.squash.v += 4;
    sp.ears.forEach((e, i) => { e.r.v += (i ? 1 : -1) * d * 8; });
    sp.tail.forEach((t, i) => { t.y.v -= d * (3 + i); });
  }
  function onDeath(cause = 'crash') {
    st.deathCause = cause === 'splash' ? 'splash' : 'crash';
    st.deathT = 0; st.spin = 0; st.swirl = 0;
    st.deathSide = sp.lean.x > 0.02 ? 1 : sp.lean.x < -0.02 ? -1 : (Math.random() < 0.5 ? -1 : 1);
    st.earPin = 1;
    sp.ears.forEach((e) => { e.r.v += 12; e.p.v += 10; });
    sp.squash.v += 4;
  }
  function setShadow(on) {
    castShadow = !!on;
    if (mesh) mesh.castShadow = castShadow;
  }
  function rebuild() {
    applyMaterials();
    if (mesh) { root.remove(mesh); mesh.geometry.dispose(); mesh.skeleton.dispose(); }
    rig = build();
    mesh = rig.mesh;
    root.add(mesh);
    xolo.mesh = mesh; xolo.rig = rig;
    update(1 / 60, { mode: 'idle', grounded: true });
  }

  const xolo = {
    root, params: P, mesh: null, rig: null, materials: mats,
    onFootfall: null, // optional (worldPos: Vector3, foot: 'FL'|'FR'|'HL'|'HR', info?: {landing, strength}) => {}
    rebuild, reset, update, onJump, onLand, onLane, onStumble, onDeath, setShadow,
    applyMaterials,
    dispose() {
      if (mesh) { mesh.geometry.dispose(); mesh.skeleton.dispose(); }
      mats.forEach((m) => m.dispose()); stars.geometry.dispose(); stars.material.dispose();
    },
  };
  reset();
  rebuild();
  return xolo;
}
