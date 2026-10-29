// Turns planner sections into meshes, keeps moving boats/crossers in sync with physics,
// renders candy skulls (instanced) and handles their collection.
import * as THREE from 'three';
import { Planner } from './planner.js';
import { boatLayout, crosserX } from './physics.js';
import { LANE_W, laneX, WATER_Y } from './config.js';
import { grassTexture, bankTexture, woodTexture, PALETTES } from './textures.js';
import * as Models from './models.js';
import { makeObstacle, makeTrajinera, makeSkullAssets, makeTreeAssets, makeFlowerAssets, makeFlowerArch, makePapelString, makeHouse } from './models.js';

const EDGE = LANE_W * 1.5;      // outer edge of the lanes (3.3)
const BANK_IN = EDGE + 0.45;    // chinampa edge (reeds/lilies grow in the margin)
const BANK_H = 0.7;             // chinampa top above the water
const ARCH_W = BANK_IN * 2 + 0.6;
const SIDE_W = 6.5;             // chinampa width beside the canal
const CANAL_X = EDGE + SIDE_W;  // side canal starts here
const CANAL_W = 6;
const FAR_X = CANAL_X + CANAL_W;
const BOTTOM = -1.2;
const AHEAD = 230, BEHIND = 40;

// Small geometry builder with world-space UVs (one draw call per material per section).
class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.i = []; }
  quad(v, nrm, uvs) {
    const b = this.p.length / 3;
    for (let k = 0; k < 4; k++) { this.p.push(...v[k]); this.n.push(...nrm); this.uv.push(...uvs[k]); }
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  top(x0, x1, z0, z1, y, uf) { // z0 < z1
    this.quad([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [0, 1, 0], [[x0, z1], [x1, z1], [x1, z0], [x0, z0]].map(([x, z]) => uf(x, z)));
  }
  sides(x0, x1, z0, z1, y0, y1, us = 4, faces = 'lrfb') {
    const v = (y) => (y - y0) / (y1 - y0);
    if (faces.includes('r')) this.quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[-z1 / us, 0], [-z0 / us, 0], [-z0 / us, 1], [-z1 / us, 1]]);
    if (faces.includes('l')) this.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0 / us, 0], [z1 / us, 0], [z1 / us, 1], [z0 / us, 1]]);
    if (faces.includes('f')) this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0 / us, 0], [x1 / us, 0], [x1 / us, 1], [x0 / us, 1]]);
    if (faces.includes('b')) this.quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [[x1 / us, 0], [x0 / us, 0], [x0 / us, 1], [x1 / us, 1]]);
    void v;
  }
  box(x0, x1, y0, y1, z0, z1) { // plain box, uv 0..1-ish
    this.sides(x0, x1, z0, z1, y0, y1, 1);
    this.top(x0, x1, z0, z1, y1, (x, z) => [x, z]);
  }
  build() {
    if (!this.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

function subtract(intervals, cuts) {
  let out = intervals.map((x) => [...x]);
  for (const [c0, c1] of cuts) {
    const nx = [];
    for (const [a, b] of out) {
      if (c1 <= a || c0 >= b) { nx.push([a, b]); continue; }
      if (c0 > a) nx.push([a, c0]);
      if (c1 < b) nx.push([c1, b]);
    }
    out = nx;
  }
  return out.filter(([a, b]) => b - a > 0.05);
}
function intersect(A, B) {
  const out = [];
  for (const [a0, a1] of A) for (const [b0, b1] of B) { const s = Math.max(a0, b0), e = Math.min(a1, b1); if (e - s > 0.05) out.push([s, e]); }
  return out;
}

const FLOWER_COLORS = [0xff8c12, 0xffa31a, 0xff6a00, 0xffc21f, 0xe8177d, 0xd81b2c, 0xff3d7f, 0x9b30d9, 0xffb52e];
const GARLAND_COLORS = [0xff8c12, 0xffa31a, 0xff6a00, 0xffc21f, 0xd81b2c];

// Deadly water: mode 0 = whirlpool spanning the canal, mode 1 = dark rushing current in one lane.
function makeHazardMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSize: { value: new THREE.Vector2(6, 6) }, uMode: { value: 0 } }]),
    vertexShader: `#include <common>
#include <fog_pars_vertex>
varying vec2 vP;
uniform vec2 uSize;
void main(){ vP = (uv - 0.5) * uSize; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `#include <common>
#include <fog_pars_fragment>
uniform float uTime; uniform vec2 uSize; uniform float uMode;
varying vec2 vP;
void main(){
  vec3 deep = vec3(0.01, 0.06, 0.10), mid = vec3(0.03, 0.26, 0.33), foam = vec3(0.86, 0.98, 1.0);
  vec3 c;
  vec2 h = uSize * 0.5;
  if (uMode < 0.5) {
    vec2 q = vP / h; float r = length(q); float a = atan(q.y, q.x);
    float sw = sin(a * 3.0 + log(r + 0.05) * 7.0 + uTime * 5.0);
    float sw2 = sin(a * 5.0 + r * 14.0 + uTime * 3.0);
    c = mix(deep, mid, smoothstep(0.05, 1.1, r));
    c = mix(c, foam, smoothstep(0.6, 1.0, sw) * 0.5 * smoothstep(0.08, 0.6, r));
    c = mix(c, foam * 0.8, smoothstep(0.8, 1.0, sw2) * 0.25);
  } else {
    float flow = vP.y + uTime * 7.0;
    float st = sin(flow * 1.7 + sin(vP.x * 4.0 + vP.y * 0.3) * 1.4) * sin(flow * 0.6 + vP.x * 2.0);
    c = mix(deep, mid, 0.45 + 0.25 * sin(vP.x * 3.0 + flow * 0.4));
    c = mix(c, foam, smoothstep(0.7, 1.0, st) * 0.45);
  }
  vec2 e = 1.0 - abs(vP) / h;
  float edge = 1.0 - smoothstep(0.0, 0.45 / max(h.x, 0.5) + 0.06, min(e.x * h.x, e.y * h.y) / max(h.x, 0.5));
  c = mix(c, foam, edge * 0.7);
  gl_FragColor = vec4(c, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`,
  });
}

export class Track {
  constructor(scene, world, { quality = 'high' } = {}) {
    this.scene = scene; this.world = world; this.quality = quality;
    this.root = new THREE.Group(); scene.add(this.root);
    const tex = (t, rx = 1, ry = 1) => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; };
    this.mat = {
      grass: new THREE.MeshStandardMaterial({ map: tex(grassTexture(), 1 / 4, 1 / 4), roughness: 1 }),
      bank: new THREE.MeshStandardMaterial({ map: bankTexture(), roughness: 1 }),
      wood: new THREE.MeshStandardMaterial({ map: tex(woodTexture(), 1 / 2.2, 1 / 2.2), roughness: 0.8 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xe6d3ad, roughness: 0.9 }),
    };
    this.hazardMat = makeHazardMaterial();
    this.hazardTime = { value: 0 };
    this.reeds = Models.makeReedAssets ? Models.makeReedAssets() : null;
    this.lilies = Models.makeLilyAssets ? Models.makeLilyAssets() : null;
    this.skullAssets = makeSkullAssets();
    this.trees = makeTreeAssets();
    this.flowers = makeFlowerAssets();
    const CAP = 700;
    this.skullMeshes = this.skullAssets.geometries.map((g, i) => {
      const m = new THREE.InstancedMesh(g, this.skullAssets.materials[i], CAP);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0;
      m.castShadow = quality === 'high';
      this.scene.add(m); return m;
    });
    this.pops = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }

  reset(seed) {
    for (const sec of this.sections || []) this.disposeSection(sec);
    this.sections = [];
    this.planner = new Planner(seed);
    this.pops = [];
    this.update(0, 0);
  }

  update(playerS, time) {
    this.hazardTime.value = time;
    while (this.planner.cursor < playerS + AHEAD) { const sec = this.planner.next(); this.sections.push(sec); this.buildSection(sec); }
    while (this.sections.length && this.sections[0].end < playerS - BEHIND) this.disposeSection(this.sections.shift());
    for (const sec of this.sections) {
      const v = sec.vis;
      if (sec.boats.length) {
        const lay = boatLayout(sec, playerS);
        v.boats.forEach((m, i) => { const b = lay[i]; m.position.set(laneX(b.lane), 0, -(b.near + b.far) / 2); });
        sec._lay = lay;
      }
      for (const cr of v.crossers) {
        const x = crosserX(cr.c, playerS);
        cr.mesh.visible = Math.abs(x) < 40;
        cr.mesh.position.set(x, 0, -cr.c.s);
        cr.mesh.rotation.z = Math.sin(time * 2.1 + cr.c.s) * 0.025;
      }
      for (const d of v.drifters) { d.mesh.position.z = d.z0 + Math.sin(time * 0.08 + d.ph) * 6; d.mesh.rotation.z = Math.sin(time * 1.3 + d.ph) * 0.02; }
      for (const p of v.papel) p.userData.update?.(time);
    }
    this.renderSkulls(playerS, time);
  }

  skullPos(sec, k, out) {
    if (k.boat !== undefined) {
      const b = sec._lay ? sec._lay[k.boat] : null;
      const s = b ? b.near + k.off : sec.boats[k.boat].near + k.off;
      return out.set(laneX(k.lane), k.y, -s);
    }
    return out.set(laneX(k.lane), k.y, -k.s);
  }

  renderSkulls(playerS, time) {
    let n = 0;
    const cap = this.skullMeshes[0].instanceMatrix.count;
    const spin = time * 2.4;
    for (const sec of this.sections) {
      if (sec.start > playerS + 170 || sec.end < playerS - 10) continue;
      for (const k of sec.skulls) {
        if (k.got || n >= cap) continue;
        const p = this.skullPos(sec, k, this._v);
        if (-p.z < playerS - 5 || -p.z > playerS + 170) continue;
        p.y += Math.sin(time * 3 + p.z * 0.6) * 0.06;
        this._e.set(0, Math.sin(spin + p.z * 0.3) * 0.6, 0);
        this._q.setFromEuler(this._e);
        this._m.compose(p, this._q, this._s.set(1, 1, 1));
        for (const m of this.skullMeshes) m.setMatrixAt(n, this._m);
        n++;
      }
    }
    this.pops = this.pops.filter((q) => q.t < 0.35);
    for (const q of this.pops) {
      if (n >= cap) break;
      const u = q.t / 0.35;
      const sc = (1 + u * 0.8) * (1 - u * u);
      this._v.set(q.x + (q.tx - q.x) * u * 0.3, q.y + u * 1.6, q.z - u * 1.5);
      this._e.set(0, spin * 3 + u * 6, 0); this._q.setFromEuler(this._e);
      this._m.compose(this._v, this._q, this._s.set(sc, sc, sc));
      for (const m of this.skullMeshes) m.setMatrixAt(n, this._m);
      n++;
    }
    for (const m of this.skullMeshes) { m.count = n; m.instanceMatrix.needsUpdate = true; }
  }

  // Returns collected skull world positions.
  collect(p, dt) {
    for (const q of this.pops) { q.t += dt; q.tx = p.x; }
    const got = [];
    const py = p.y + 0.5;
    for (const sec of this.sections) {
      if (sec.end < p.s - 3 || sec.start > p.s + 3) continue;
      for (const k of sec.skulls) {
        if (k.got) continue;
        const v = this.skullPos(sec, k, this._v);
        if (Math.abs(-v.z - p.s) < 0.95 && Math.abs(v.x - p.x) < 0.9 && Math.abs(v.y - py) < 0.95) {
          k.got = true;
          got.push(v.clone());
          this.pops.push({ x: v.x, y: v.y, z: v.z, tx: p.x, t: 0 });
        }
      }
    }
    return got;
  }

  disposeSection(sec) {
    const v = sec.vis; if (!v) return;
    this.root.remove(v.group);
    for (const g of v.owned) g.dispose();
    v.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    sec.vis = null;
  }

  buildSection(sec) {
    const G = new THREE.Group();
    const owned = [];
    const vis = { group: G, owned, boats: [], crossers: [], drifters: [], papel: [], hazards: [] };
    sec.vis = vis;
    const shadows = this.quality === 'high';
    const addGeo = (builder, mat, recv = true) => {
      const g = builder.build(); if (!g) return;
      owned.push(g); const m = new THREE.Mesh(g, mat); m.receiveShadow = recv && shadows; m.matrixAutoUpdate = false; G.add(m); return m;
    };
    const Z = (s) => -s;
    const s0 = sec.type === 'warmup' ? sec.start - 40 : sec.start, s1 = sec.end;
    const rng = mulberry(sec.id * 7919 + 13);

    // ---- lanes: the canal itself. Walkable water is the world water plane; deadly water gets overlays ----
    const laneLand = [];
    for (let l = 0; l < 3; l++) laneLand.push(sec.land[l].map(([a, b]) => [Math.max(a, s0), Math.min(b, s1)]).filter(([a, b]) => b > a));
    const deadly = laneLand.map((land) => subtract([[s0, s1]], land));
    const allDead = intersect(intersect(deadly[0], deadly[1]), deadly[2]);
    const hazard = (x0, x1, a, b, mode) => {
      const geo = new THREE.PlaneGeometry(x1 - x0, b - a, 1, 1).rotateX(-Math.PI / 2);
      geo.translate(0, 0, 0);
      owned.push(geo);
      let mat;
      if (mode === 0 && this.world.makeWhirlpoolMaterial) mat = this.world.makeWhirlpoolMaterial({ width: x1 - x0, length: b - a, spin: 1 + (sec.id % 2) * -2 });
      else {
        mat = this.hazardMat.clone();
        mat.uniforms.uTime = this.hazardTime; mat.uniforms.uSize = { value: new THREE.Vector2(x1 - x0, b - a) }; mat.uniforms.uMode = { value: mode };
      }
      owned.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set((x0 + x1) / 2, 0.012, -(a + b) / 2);
      m.renderOrder = 1;
      G.add(m); vis.hazards.push(m);
    };
    for (const [a, b] of allDead) hazard(-EDGE + 0.05, EDGE - 0.05, a, b, 0);
    for (let l = 0; l < 3; l++) {
      const cx = laneX(l);
      for (const [a, b] of subtract(deadly[l], allDead)) hazard(cx - LANE_W / 2 + 0.04, cx + LANE_W / 2 - 0.04, a, b, 1);
    }

    // ---- side chinampas (raised banks that wall in the canal) ----
    const sideLand = subtract([[s0, s1]], sec.cuts);
    const grass = new GeoBuilder(), bank = new GeoBuilder(), wood = new GeoBuilder();
    for (const sgn of [-1, 1]) {
      const xa = sgn < 0 ? -CANAL_X : BANK_IN, xb = sgn < 0 ? -BANK_IN : CANAL_X;
      for (const [a, b] of sideLand) {
        grass.top(xa, xb, Z(b), Z(a), BANK_H, (x, z) => [x, z]);
        bank.sides(xa, xb, Z(b), Z(a), BOTTOM, BANK_H, 4, 'lrfb');
        // wooden stakes holding the chinampa edge
        const xe = sgn < 0 ? -BANK_IN : BANK_IN;
        for (let s = a + 0.5; s < b - 0.3; s += 1.7) wood.box(xe - 0.08, xe + 0.08, -0.2, BANK_H + 0.18, Z(s + 0.16), Z(s));
      }
      const fa = sgn < 0 ? -FAR_X - 40 : FAR_X, fb = sgn < 0 ? -FAR_X : FAR_X + 40;
      grass.top(fa, fb, Z(s1), Z(s0), BANK_H, (x, z) => [x, z]);
      bank.sides(fa, fb, Z(s1), Z(s0), BOTTOM, BANK_H, 4, sgn < 0 ? 'r' : 'l');
    }
    // fords: side channels open to the canal; mooring posts mark them
    for (const [a, b] of sec.ford) for (const sgn of [-1, 1]) for (const s of [a - 0.4, b + 0.4]) {
      const x = sgn * (BANK_IN + 0.3);
      wood.box(x - 0.13, x + 0.13, -0.3, 1.8, Z(s + 0.13), Z(s - 0.13));
    }
    addGeo(bank, this.mat.bank); addGeo(wood, this.mat.wood); addGeo(grass, this.mat.grass);

    // ---- vegetation (instanced) ----
    const flowers = [], bushes = [], trees = [], reeds = [], lilies = [], petals = [];
    const onSide = (s, m = 0.6) => sideLand.some(([a, b]) => s > a + m && s < b - m);
    // floating marigold garlands mark the lane dividers where both lanes are safe
    for (const [x, iv] of [[-LANE_W / 2, intersect(laneLand[0], laneLand[1])], [LANE_W / 2, intersect(laneLand[1], laneLand[2])]]) {
      for (const [a, b] of iv) for (let s = a + 0.3; s < b - 0.3; s += 0.75) petals.push([x + (rng() - 0.5) * 0.08, s, 0.55 + rng() * 0.2, 0.0]);
    }
    for (const sgn of [-1, 1]) {
      for (let s = s0; s < s1; s += 0.5) {
        if (!onSide(s)) continue;
        for (let r = 0; r < 4; r++) if (rng() < 0.85) flowers.push([sgn * (BANK_IN + 0.35 + r * 0.36 + rng() * 0.2), s + rng() * 0.4, 0.9 + rng() * 0.5, BANK_H]);
      }
      for (let s = s0 + rng() * 2; s < s1; s += 1.1 + rng() * 1.2) {
        if (onSide(s, 0.3)) reeds.push([sgn * (EDGE + 0.05 + rng() * 0.35), s, 0.8 + rng() * 0.5, 0]);
      }
      for (let s = s0 + rng() * 6; s < s1; s += 5 + rng() * 6) lilies.push([sgn * (EDGE - 0.15 + rng() * 0.4), s, 0.7 + rng() * 0.5, 0.0]);
      for (let s = s0 + rng() * 3; s < s1; s += 2.4) {
        if (!onSide(s)) continue;
        bushes.push([sgn * (BANK_IN + 2.4 + rng() * 0.8), s, 0.8 + rng() * 0.6, BANK_H]);
        for (let c = 0; c < 3; c++) if (rng() < 0.7) flowers.push([sgn * (BANK_IN + 3.4 + c * 0.9), s + rng(), 1.3 + rng() * 0.6, BANK_H]);
      }
      // ahuejote walls: a dense row right at the chinampa edge, another behind, more across the side canal
      for (let s = s0 + rng() * 2; s < s1; s += 2.6 + rng() * 1.6) {
        if (onSide(s, 0.8)) trees.push([sgn * (BANK_IN + 1.2 + rng() * 0.5), s, 1.0 + rng() * 0.35, BANK_H]);
        if (onSide(s + 1.3, 0.8) && rng() < 0.8) trees.push([sgn * (CANAL_X - 1.0 - rng() * 0.8), s + 1.3, 1.05 + rng() * 0.4, BANK_H]);
        trees.push([sgn * (FAR_X + 1 + rng() * 1.5), s + rng() * 2, 1.0 + rng() * 0.4, BANK_H]);
        if (rng() < 0.5) trees.push([sgn * (FAR_X + 6 + rng() * 20), s + rng() * 4, 1.0 + rng() * 0.5, BANK_H]);
      }
      for (let s = s0 + rng() * 4; s < s1; s += 3 + rng() * 4) lilies.push([sgn * (CANAL_X + 0.6 + rng() * (CANAL_W - 1.2)), s, 0.8 + rng() * 0.6, 0.0]);
      for (let s = s0; s < s1; s += 1.6) reeds.push([sgn * (FAR_X - 0.2 - rng() * 0.4), s, 0.9 + rng() * 0.4, 0]);
    }
    const inst = (geo, mat, list, colors, cast) => {
      if (!geo || !list.length) return;
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
      const c = new THREE.Color();
      list.forEach(([x, s, k, y], i) => {
        e.set(0, rng() * 6.28, 0); q.setFromEuler(e);
        M.compose(p.set(x, y, -s), q, sc.set(k, k, k)); m.setMatrixAt(i, M);
        if (colors) m.setColorAt(i, c.setHex(colors[(rng() * colors.length) | 0]));
      });
      m.castShadow = cast && shadows; m.receiveShadow = false;
      m.computeBoundingSphere();
      G.add(m);
    };
    inst(this.flowers.flowerGeo, this.flowers.flowerMat, flowers, FLOWER_COLORS, false);
    inst(this.flowers.flowerGeo, this.flowers.flowerMat, petals, GARLAND_COLORS, false);
    inst(this.flowers.bushGeo, this.flowers.bushMat, bushes, null, false);
    inst(this.trees.trunkGeo, this.trees.trunkMat, trees, null, false);
    inst(this.trees.foliageGeo, this.trees.foliageMat, trees, null, true);
    if (this.reeds) inst(this.reeds.geometry, this.reeds.material, reeds, null, false);
    if (this.lilies) inst(this.lilies.geometry, this.lilies.material, lilies, null, false);

    // ---- obstacles ----
    for (const o of sec.obstacles) {
      const m = makeObstacle(o.kind, o.variant, o.s1 - o.s0);
      m.position.set(laneX(o.lane), 0, -(o.s0 + o.s1) / 2);
      shadowize(m, shadows);
      G.add(m);
    }
    // ---- canal trajineras (walkable decks) ----
    for (const b of sec.boats) {
      const m = makeTrajinera({ len: b.len, palette: b.palette, name: b.name, style: 'deck' });
      shadowize(m, shadows);
      G.add(m); vis.boats.push(m);
    }
    for (const c of sec.crossers) {
      const m = makeTrajinera({ len: c.len, palette: c.palette, name: c.name, style: 'small' });
      shadowize(m, shadows);
      G.add(m); vis.crossers.push({ mesh: m, c });
    }
    // ---- decor ----
    for (const s of sec.arches) { const a = makeFlowerArch(ARCH_W); a.position.z = -s; shadowize(a, shadows); G.add(a); }
    for (const s of sec.papel) { const p = makePapelString(BANK_IN * 2 + 1.6); p.position.z = -s; p.position.y += BANK_H * 0.5; G.add(p); vis.papel.push(p); }
    for (let s = s0 + 10 + rng() * 20; s < s1; s += 24 + rng() * 26) {
      const sgn = rng() < 0.5 ? -1 : 1;
      const m = makeTrajinera({ len: 8 + rng() * 3, palette: (rng() * PALETTES.length) | 0, name: pickName(rng), style: 'decor' });
      m.position.set(sgn * (CANAL_X + CANAL_W / 2), 0, -s);
      if (rng() < 0.5) m.rotation.y = Math.PI;
      G.add(m); vis.drifters.push({ mesh: m, z0: -s, ph: rng() * 6.28 });
    }
    for (let s = s0 + rng() * 25; s < s1; s += 22 + rng() * 26) {
      if (!onSide(s, 3)) continue;
      const sgn = rng() < 0.5 ? -1 : 1;
      const h = makeHouse((rng() * 4) | 0);
      h.position.set(sgn * (BANK_IN + 5.2), BANK_H, -s); h.rotation.y = -sgn * Math.PI / 2;
      shadowize(h, false);
      G.add(h);
    }
    for (let s = s0 + rng() * 20; s < s1; s += 18 + rng() * 22) {
      const sgn = rng() < 0.5 ? -1 : 1;
      const h = makeHouse((rng() * 4) | 0);
      h.position.set(sgn * (FAR_X + 5 + rng() * 6), BANK_H, -s); h.rotation.y = -sgn * Math.PI / 2;
      G.add(h);
    }
    this.root.add(G);
  }
}

const NAMES = ['Lupita', 'Xóchitl', 'Rosita', 'Mi Cielo', 'Amorcito', 'Paloma', 'Esperanza', 'La Flor', 'Citlali', 'Marisol', 'Dulce', 'Itzel', 'Mañanita', 'Corazón'];
const pickName = (r) => NAMES[(r() * NAMES.length) | 0];
function shadowize(o, cast) { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = cast; } }); }
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export { WATER_Y };
