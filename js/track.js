// Turns planner sections into meshes, keeps moving boats/crossers in sync with physics,
// renders candy skulls (instanced) and handles their collection.
import * as THREE from 'three';
import { Planner } from './planner.js';
import { boatLayout, crosserX } from './physics.js';
import { LANE_W, laneX, WATER_Y } from './config.js';
import { pathTexture, grassTexture, bankTexture, woodTexture, PALETTES } from './textures.js';
import { makeObstacle, makeTrajinera, makeSkullAssets, makeTreeAssets, makeFlowerAssets, makeFlowerArch, makePapelString, makeHouse } from './models.js';

const EDGE = LANE_W * 1.5;      // outer edge of the lanes (3.3)
const SIDE_W = 9.2;             // chinampa width beside the lanes
const CANAL_X = EDGE + SIDE_W;  // side canal starts here
const CANAL_W = 6;
const FAR_X = CANAL_X + CANAL_W;
const BOTTOM = -1.5;
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

const FLOWER_COLORS = [0xff8c12, 0xffa31a, 0xff7a00, 0xffc21f, 0xff9a1f, 0xe8177d, 0xffb52e];

export class Track {
  constructor(scene, world, { quality = 'high' } = {}) {
    this.scene = scene; this.world = world; this.quality = quality;
    this.root = new THREE.Group(); scene.add(this.root);
    const tex = (t, rx = 1, ry = 1) => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; };
    this.mat = {
      path: new THREE.MeshStandardMaterial({ map: tex(pathTexture(), 1 / LANE_W, 1 / 4.4), roughness: 0.95 }),
      grass: new THREE.MeshStandardMaterial({ map: tex(grassTexture(), 1 / 4, 1 / 4), roughness: 1 }),
      bank: new THREE.MeshStandardMaterial({ map: bankTexture(), roughness: 1 }),
      wood: new THREE.MeshStandardMaterial({ map: tex(woodTexture(), 1 / 2.2, 1 / 2.2), roughness: 0.8 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xe6d3ad, roughness: 0.9 }),
      ford: world.makeFordWaterMaterial(),
    };
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
    const vis = { group: G, owned, boats: [], crossers: [], drifters: [], papel: [] };
    sec.vis = vis;
    const shadows = this.quality === 'high';
    const addGeo = (builder, mat, recv = true) => {
      const g = builder.build(); if (!g) return;
      owned.push(g); const m = new THREE.Mesh(g, mat); m.receiveShadow = recv && shadows; m.matrixAutoUpdate = false; G.add(m); return m;
    };
    const Z = (s) => -s;
    const s0 = sec.type === 'warmup' ? sec.start - 40 : sec.start, s1 = sec.end;
    const fords = sec.ford;

    // ---- lanes ----
    const top = new GeoBuilder(), bank = new GeoBuilder(), stone = new GeoBuilder(), wood = new GeoBuilder(), fordW = new GeoBuilder();
    const laneLand = [];
    for (let l = 0; l < 3; l++) {
      const cx = laneX(l), x0 = cx - LANE_W / 2, x1 = cx + LANE_W / 2;
      const land = sec.land[l].map(([a, b]) => [Math.max(a, s0), Math.min(b, s1)]).filter(([a, b]) => b > a);
      laneLand.push(land);
      for (const [a, b] of subtract(land, fords)) {
        top.top(x0, x1, Z(b), Z(a), 0, (x, z) => [x - x0, z]);
        bank.sides(x0, x1, Z(b), Z(a), BOTTOM, 0, 4, 'fb');
      }
    }
    // canal lane walls facing water need both side faces: emit explicit walls where neighbour lane is water
    for (let l = 0; l < 3; l++) {
      const cx = laneX(l);
      for (const nb of [l - 1, l + 1]) {
        if (nb < 0 || nb > 2) continue;
        const water = subtract(laneLand[l], laneLand[nb]);
        const xw = nb < l ? cx - LANE_W / 2 : cx + LANE_W / 2;
        for (const [a, b] of water) bank.sides(xw - 0.001, xw + 0.001, Z(b), Z(a), BOTTOM, 0, 4, nb < l ? 'l' : 'r');
      }
    }
    // lane dividers: low stone kerbs where both lanes are solid path
    const dashes = (x, iv) => { for (const [a, b] of iv) for (let s = a + 0.4; s < b - 0.4; s += 1.6) stone.box(x - 0.07, x + 0.07, 0, 0.05, Z(Math.min(b, s + 1.0)), Z(s)); };
    dashes(-LANE_W / 2, subtract(intersect(laneLand[0], laneLand[1]), fords));
    dashes(LANE_W / 2, subtract(intersect(laneLand[1], laneLand[2]), fords));
    // fords: flooded wooden causeway with a water film that crossers float on
    for (const [a, b] of fords) {
      wood.top(-EDGE, EDGE, Z(b), Z(a), -0.04, (x, z) => [x, z]);
      wood.sides(-EDGE, EDGE, Z(b), Z(a), BOTTOM, -0.04, 2.2, 'fb');
      fordW.top(-CANAL_X - 2, CANAL_X + 2, Z(b), Z(a), 0.03, (x, z) => [x / 4, z / 4]);
      for (const x of [-EDGE, EDGE]) for (let s = a + 0.6; s < b; s += 2.2) wood.box(x - 0.09, x + 0.09, -0.3, 0.55, Z(s + 0.18), Z(s));
    }
    // ---- side chinampas ----
    const sideCuts = [...sec.cuts];
    const sideLand = subtract([[s0, s1]], sideCuts);
    const grass = new GeoBuilder();
    for (const sgn of [-1, 1]) {
      const xa = sgn < 0 ? -CANAL_X : EDGE, xb = sgn < 0 ? -EDGE : CANAL_X;
      for (const [a, b] of sideLand) {
        grass.top(xa, xb, Z(b), Z(a), 0.02, (x, z) => [x, z]);
        bank.sides(xa, xb, Z(b), Z(a), BOTTOM, 0.02, 4, (sgn < 0 ? 'l' : 'r') + 'fb');
        // inner wall toward canal lanes
        const inner = sgn < 0 ? 0 : 2;
        for (const [wa, wb] of subtract([[a, b]], laneLand[inner])) bank.sides(xa, xb, Z(wb), Z(wa), BOTTOM, 0.02, 4, sgn < 0 ? 'r' : 'l');
      }
      // far chinampa across the side canal
      const fa = sgn < 0 ? -FAR_X - 40 : FAR_X, fb = sgn < 0 ? -FAR_X : FAR_X + 40;
      grass.top(fa, fb, Z(s1), Z(s0), 0.02, (x, z) => [x, z]);
      bank.sides(fa, fb, Z(s1), Z(s0), BOTTOM, 0.02, 4, sgn < 0 ? 'r' : 'l');
    }
    addGeo(top, this.mat.path); addGeo(bank, this.mat.bank); addGeo(stone, this.mat.stone); addGeo(wood, this.mat.wood); addGeo(grass, this.mat.grass);
    const fw = addGeo(fordW, this.mat.ford, false); if (fw) fw.renderOrder = 2;

    // ---- vegetation (instanced) ----
    const rng = mulberry(sec.id * 7919 + 13);
    const flowers = [], bushes = [], trees = [];
    const onSide = (s) => sideLand.some(([a, b]) => s > a + 0.6 && s < b - 0.6);
    for (const sgn of [-1, 1]) {
      // dense marigold borders along the lanes
      for (let s = s0; s < s1; s += 0.55) {
        if (!onSide(s)) continue;
        for (let r = 0; r < 3; r++) if (rng() < 0.85) flowers.push([sgn * (EDGE + 0.35 + r * 0.38 + rng() * 0.2), s + rng() * 0.4, 0.8 + rng() * 0.5]);
      }
      // cultivated rows (chinampa crops) and bushes
      for (let s = s0 + rng() * 3; s < s1; s += 3.2) {
        if (!onSide(s)) continue;
        const x = sgn * (EDGE + 1.9 + rng() * 0.6);
        bushes.push([x, s, 0.6 + rng() * 0.5]);
        for (let c = 0; c < 4; c++) if (rng() < 0.7) flowers.push([sgn * (EDGE + 3.2 + c * 1.1), s + rng(), 1.2 + rng() * 0.6]);
        if (rng() < 0.5) bushes.push([sgn * (EDGE + 4 + rng() * 4.5), s + 1.5, 0.7 + rng() * 0.6]);
      }
      // ahuejote rows on the canal edge and far bank
      for (let s = s0 + rng() * 4; s < s1; s += 5 + rng() * 3) {
        if (onSide(s)) trees.push([sgn * (CANAL_X - 0.9 - rng() * 0.5), s, 0.85 + rng() * 0.35]);
        trees.push([sgn * (FAR_X + 1 + rng() * 2), s + rng() * 2, 0.9 + rng() * 0.4]);
        if (rng() < 0.6) trees.push([sgn * (FAR_X + 8 + rng() * 20), s + rng() * 4, 0.9 + rng() * 0.5]);
      }
      for (let s = s0; s < s1; s += 1.4) flowers.push([sgn * (FAR_X + 0.4 + rng() * 1.2), s, 1 + rng() * 0.6]);
    }
    const inst = (geo, mat, list, colors, cast) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
      const c = new THREE.Color();
      list.forEach(([x, s, k], i) => {
        e.set(0, rng() * 6.28, 0); q.setFromEuler(e);
        M.compose(p.set(x, 0.02, -s), q, sc.set(k, k, k)); m.setMatrixAt(i, M);
        if (colors) m.setColorAt(i, c.setHex(colors[(rng() * colors.length) | 0]));
      });
      m.castShadow = cast && shadows; m.receiveShadow = false;
      m.computeBoundingSphere();
      G.add(m);
    };
    inst(this.flowers.flowerGeo, this.flowers.flowerMat, flowers, FLOWER_COLORS, false);
    inst(this.flowers.bushGeo, this.flowers.bushMat, bushes, null, false);
    inst(this.trees.trunkGeo, this.trees.trunkMat, trees, null, false);
    inst(this.trees.foliageGeo, this.trees.foliageMat, trees, null, true);

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
      if (c.dir < 0) m.rotation.y = 0; // name always faces the player
      shadowize(m, shadows);
      G.add(m); vis.crossers.push({ mesh: m, c });
    }
    // ---- decor ----
    for (const s of sec.arches) { const a = makeFlowerArch(9.6); a.position.z = -s; shadowize(a, shadows); G.add(a); }
    for (const s of sec.papel) { const p = makePapelString(EDGE * 2 + 2.6); p.position.z = -s; G.add(p); vis.papel.push(p); }
    // side-canal trajineras (scenery) and houses
    for (let s = s0 + 10 + rng() * 20; s < s1; s += 28 + rng() * 30) {
      const sgn = rng() < 0.5 ? -1 : 1;
      const m = makeTrajinera({ len: 8 + rng() * 3, palette: (rng() * PALETTES.length) | 0, name: pickName(rng), style: 'decor' });
      m.position.set(sgn * (CANAL_X + CANAL_W / 2), 0, -s);
      if (rng() < 0.5) m.rotation.y = Math.PI;
      G.add(m); vis.drifters.push({ mesh: m, z0: -s, ph: rng() * 6.28 });
    }
    for (let s = s0 + rng() * 40; s < s1; s += 35 + rng() * 40) {
      if (!onSide(s)) continue;
      const sgn = rng() < 0.5 ? -1 : 1;
      const h = makeHouse((rng() * 4) | 0);
      h.position.set(sgn * (EDGE + 6.5), 0.02, -s); h.rotation.y = sgn * Math.PI / 2;
      shadowize(h, false);
      G.add(h);
    }
    for (let s = s0 + rng() * 30; s < s1; s += 30 + rng() * 30) {
      const sgn = rng() < 0.5 ? -1 : 1;
      const h = makeHouse((rng() * 4) | 0);
      h.position.set(sgn * (FAR_X + 6 + rng() * 6), 0.02, -s); h.rotation.y = -sgn * Math.PI / 2;
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
