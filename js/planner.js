// Pure-data track planner. Produces section specs that the builder turns into meshes
// and the collision module turns into physics. Every section keeps a reachable safe route:
//  - land rows always leave at least one non-tall lane, spaced by >= ~1 s of reaction time
//  - water gaps are at most ~45% of the current jump length
//  - fords: small trajineras are always jumpable and never placed inside each other's landing zone
//  - canals: every canal lane is adjacent to a land lane that only ever holds jumpable obstacles
import { LANES, speedAt, jumpParams, mulberry32 } from './config.js';

export const OB = {
  crate:   { h: 0.8,  len: 0.9,  w: 1.5,  tall: false },
  pots:    { h: 0.7,  len: 0.9,  w: 1.6,  tall: false },
  fence:   { h: 0.75, len: 0.35, w: 1.9,  tall: false },
  ofrenda: { h: 2.9,  len: 1.2,  w: 1.9,  tall: true },
  tower:   { h: 2.6,  len: 1.1,  w: 1.7,  tall: true },
  stall:   { h: 2.7,  len: 6,    w: 1.9,  tall: true },
};
const LOWS = ['crate', 'pots', 'fence'];
const TALLS = ['ofrenda', 'tower'];
const BOAT_NAMES = ['Lupita', 'Xóchitl', 'Rosita', 'Mi Cielo', 'Amorcito', 'Paloma', 'Esperanza', 'La Flor', 'Citlali', 'Marisol', 'Dulce', 'Itzel', 'Coyolxauhqui', 'Mañanita', 'Corazón'];

export class Planner {
  constructor(seed = 1) {
    this.rng = mulberry32(seed);
    this.cursor = 0;
    this.count = 0;
    this.lastType = 'land';
    this.trailLane = 1;
    this.nextArch = 60;
    this.nextPapel = 25;
  }
  r(a = 0, b = 1) { return a + (b - a) * this.rng(); }
  ri(a, b) { return Math.floor(this.r(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  weighted(entries) {
    let t = 0; for (const [, w] of entries) t += w;
    let x = this.rng() * t;
    for (const [k, w] of entries) { if ((x -= w) <= 0) return k; }
    return entries[entries.length - 1][0];
  }
  diff(s) { return Math.min(1, Math.max(0, (s - 150) / 3200)); }

  next() {
    const s = this.cursor;
    let type;
    if (this.count === 0) type = 'warmup';
    else if (this.count === 1) type = 'land';
    else if (this.lastType !== 'land') type = 'land';
    else {
      const d = this.diff(s);
      type = this.weighted([['land', 0.9 - 0.3 * d], ['gap', 0.9], ['ford', 0.8 + 0.3 * d], ['canal', s < 300 ? 0.4 : 1.1]]);
    }
    const sec = this.blank(type, s);
    if (type === 'warmup') this.planWarmup(sec);
    else if (type === 'land') this.planLand(sec);
    else if (type === 'gap') this.planGap(sec);
    else if (type === 'ford') this.planFord(sec);
    else this.planCanal(sec);
    this.planDecor(sec);
    sec.id = this.count++;
    this.lastType = type === 'warmup' ? 'land' : type;
    this.cursor = sec.end;
    return sec;
  }

  blank(type, start) {
    return { type, start, end: start, land: [[], [], []], ford: [], cuts: [], obstacles: [], boats: [], crossers: [], skulls: [], canalLanes: [], canal: null, arches: [], papel: [] };
  }

  // ---------- skull helpers ----------
  skullLine(sec, lane, a, b, step = 1.7) {
    for (let s = a; s <= b; s += step) sec.skulls.push({ lane, s, y: 0.55 });
  }
  skullArc(sec, lane, center, v, baseY = 0.55) {
    const { T, H } = jumpParams(v);
    const half = (v * T) / 2 * 0.92;
    const n = Math.max(5, Math.round((half * 2) / 1.6));
    for (let i = 0; i <= n; i++) {
      const u = -1 + (2 * i) / n;
      sec.skulls.push({ lane, s: center + u * half, y: baseY + H * 0.88 * (1 - u * u) });
    }
    return half;
  }

  planWarmup(sec) {
    sec.end = sec.start + 50;
    for (let l = 0; l < LANES; l++) sec.land[l].push([sec.start - 40, sec.end]);
    this.skullLine(sec, 1, sec.start + 14, sec.end - 4);
  }

  planLand(sec) {
    const s0 = sec.start;
    const d = this.diff(s0);
    const v0 = speedAt(s0);
    const len = this.r(70, 110) + v0 * 1.5;
    sec.end = s0 + len;
    for (let l = 0; l < LANES; l++) sec.land[l].push([s0, sec.end]);
    let s = s0 + v0 * 0.9;
    const rows = [];
    while (true) {
      const v = speedAt(s);
      const pat = this.weighted([
        ['oneLow', 3 - d], ['oneTall', 2.6], ['twoTall', 0.8 + 3 * d], ['allLow', 0.4 + 1.6 * d],
        ['tallLow', 0.8 + 2.2 * d], ['twoLow', 1.4], ['stall', 0.9 + 1.4 * d],
      ]);
      const lanes = [null, null, null];
      let rowLen = 1.2;
      const lanesShuffled = [0, 1, 2].sort(() => this.rng() - 0.5);
      const [a, b, c] = lanesShuffled;
      if (pat === 'oneLow') lanes[a] = this.pick(LOWS);
      else if (pat === 'oneTall') lanes[a] = this.pick(TALLS);
      else if (pat === 'twoTall') { lanes[a] = this.pick(TALLS); lanes[b] = this.pick(TALLS); if (this.rng() < d * 0.6) lanes[c] = this.pick(LOWS); }
      else if (pat === 'allLow') { const k = this.pick(LOWS); lanes[0] = lanes[1] = lanes[2] = k; }
      else if (pat === 'tallLow') { lanes[a] = this.pick(TALLS); lanes[b] = this.pick(LOWS); }
      else if (pat === 'twoLow') { lanes[a] = this.pick(LOWS); lanes[b] = this.pick(LOWS); }
      else if (pat === 'stall') {
        rowLen = this.r(5, 8 + 4 * d);
        lanes[a] = 'stall';
        if (d > 0.3 && this.rng() < 0.45) lanes[b] = 'stall';
      }
      const rowEnd = s + rowLen;
      if (rowEnd > sec.end - v * 0.45) break;
      for (let l = 0; l < LANES; l++) {
        const k = lanes[l];
        if (!k) continue;
        const spec = OB[k];
        const L = k === 'stall' ? rowLen : spec.len;
        sec.obstacles.push({ kind: k, lane: l, s0: s, s1: s + L, h: spec.h, w: spec.w, tall: spec.tall, variant: this.ri(0, 5) });
      }
      rows.push({ s, e: rowEnd, lanes, v });
      const gapSec = this.r(1.55 - 0.55 * d, 2.15 - 0.75 * d);
      s = rowEnd + v * Math.max(0.95, gapSec);
    }
    this.landSkulls(sec, rows);
  }

  landSkulls(sec, rows) {
    let lane = this.trailLane;
    let cur = sec.start + 6;
    for (let i = 0; i <= rows.length; i++) {
      const row = rows[i];
      const segEnd = row ? row.s : sec.end - 3;
      const place = this.rng() < 0.75;
      if (row) {
        const k = row.lanes[lane];
        const tallHere = k && OB[k].tall;
        if (tallHere) {
          const opts = [0, 1, 2].filter((l) => !(row.lanes[l] && OB[row.lanes[l]].tall));
          opts.sort((p, q) => Math.abs(p - lane) - Math.abs(q - lane) || this.rng() - 0.5);
          const nl = opts[0];
          const mid = (cur + segEnd) / 2;
          if (place) { this.skullLine(sec, lane, cur, mid - 1); this.skullLine(sec, nl, mid + 1.5, segEnd - 2.5); }
          lane = nl;
        } else if (place) {
          this.skullLine(sec, lane, cur, segEnd - (row.lanes[lane] ? 6 : 2.5));
        }
        const k2 = row.lanes[lane];
        if (k2) {
          const c = (row.s + Math.min(row.e, row.s + OB[k2].len)) / 2;
          const half = this.skullArc(sec, lane, c, row.v);
          cur = c + half + 1.7;
        } else {
          if (place) this.skullLine(sec, lane, row.s, row.e);
          cur = row.e + 1.7;
        }
      } else if (place) {
        this.skullLine(sec, lane, cur, segEnd);
      }
      if (this.rng() < 0.25 && row) {
        // gentle wander to another free lane between rows
        const nx = rows[i + 1];
        const cand = [lane - 1, lane + 1].filter((l) => l >= 0 && l < 3 && (!nx || !(nx.lanes[l] && OB[nx.lanes[l]].tall)));
        if (cand.length) lane = this.pick(cand);
        cur += 3;
      }
    }
    // remove skulls that would sit inside obstacles (safety net)
    sec.skulls = sec.skulls.filter((k) => !sec.obstacles.some((o) => o.lane === k.lane && k.s > o.s0 - 0.6 && k.s < o.s1 + 0.6 && k.y < o.h + 0.35));
    this.trailLane = lane;
  }

  planGap(sec) {
    const s0 = sec.start;
    const d = this.diff(s0);
    const v = speedAt(s0);
    const { T } = jumpParams(v);
    const jl = v * T;
    let s = s0 + v * 0.95;
    const gaps = [];
    const n = d > 0.35 && this.rng() < 0.45 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const w = Math.min(this.r(2.4, 3.1 + 1.7 * d), jl * 0.45);
      gaps.push([s, s + w]);
      s += w + jl * 1.15;
    }
    sec.end = gaps[gaps.length - 1][1] + v * 0.8;
    for (let l = 0; l < LANES; l++) {
      let a = s0;
      for (const [g0, g1] of gaps) { sec.land[l].push([a, g0]); a = g1; }
      sec.land[l].push([a, sec.end]);
    }
    sec.cuts = gaps.map((g) => [...g]);
    const allLanes = this.rng() < 0.35;
    const lanes = allLanes ? [0, 1, 2] : [this.trailLane];
    for (const l of lanes) {
      let cur = s0 + 4;
      for (const [g0, g1] of gaps) {
        const c = (g0 + g1) / 2;
        const half = jl / 2 * 0.92;
        if (!allLanes) this.skullLine(sec, l, cur, c - half - 1.7);
        this.skullArc(sec, l, c, v);
        cur = c + half + 1.7;
      }
      if (!allLanes) this.skullLine(sec, l, cur, sec.end - 2);
    }
  }

  planFord(sec) {
    const s0 = sec.start;
    const d = this.diff(s0);
    const v = speedAt(s0);
    const { T } = jumpParams(v);
    const fordA = s0 + v * 0.95;
    const n = 1 + (d > 0.2 && this.rng() < 0.6 ? 1 : 0) + (d > 0.65 && this.rng() < 0.5 ? 1 : 0);
    let s = fordA + 3.5;
    for (let i = 0; i < n; i++) {
      const dir = this.rng() < 0.5 ? -1 : 1;
      const targetLane = this.ri(0, 2);
      sec.crossers.push({ s, dir, speed: this.r(3, 4.5 + 3 * d), len: 3.4, targetX: (targetLane - 1) * 2.2 + this.r(-0.4, 0.4), name: this.pick(BOAT_NAMES), palette: this.ri(0, 5) });
      s += v * T * 1.45 + 2;
    }
    const fordB = s - v * T * 1.45 - 2 + 4;
    sec.end = fordB + v * 0.75;
    sec.ford.push([fordA, fordB]);
    sec.cuts.push([fordA, fordB]);
    for (let l = 0; l < LANES; l++) sec.land[l].push([s0, sec.end]);
    const lane = this.trailLane;
    let cur = s0 + 4;
    for (const c of sec.crossers) {
      const half = (v * T) / 2 * 0.92;
      this.skullLine(sec, lane, cur, c.s - half - 1.7);
      this.skullArc(sec, lane, c.s, v);
      cur = c.s + half + 1.7;
    }
    this.skullLine(sec, lane, cur, sec.end - 2);
  }

  planCanal(sec) {
    const s0 = sec.start;
    const d = this.diff(s0);
    const v = speedAt(s0);
    const { T } = jumpParams(v);
    const jl = v * T;
    const canalLanes = this.weighted([['1', 2], ['0', 1], ['2', 1], ['0,2', d > 0.2 ? 1.6 : 0]]).split(',').map(Number);
    sec.canalLanes = canalLanes;
    const cA = s0 + v * 1.0;
    const cB = cA + this.r(55, 80 + 50 * d);
    sec.canal = [cA, cB];
    sec.end = cB + v * 0.75;
    for (let l = 0; l < LANES; l++) {
      if (canalLanes.includes(l)) { sec.land[l].push([s0, cA]); sec.land[l].push([cB, sec.end]); }
      else sec.land[l].push([s0, sec.end]);
    }
    const tAct = 3.0;
    for (const l of canalLanes) {
      const moving = this.rng() < 0.3 + 0.45 * d;
      const speed = moving ? this.r(2, 3 + 3 * d) : 0;
      let s = cA + this.r(0.2, 1.2);
      const fleet = [];
      while (true) {
        let len = this.r(7, 10);
        if (s + len > cB - 0.5) { len = cB - 0.5 - s; if (len < 5.5) break; }
        fleet.push({ lane: l, near: s, len, name: this.pick(BOAT_NAMES), palette: this.ri(0, 5) });
        s += len + this.r(1.4, Math.max(1.6, Math.min(4.2, jl * 0.38)));
      }
      const fleetId = sec.boats.length;
      fleet.forEach((b, i) => {
        b.speed = speed; b.dock = cA; b.tAct = tAct; b.sArrive = cA; b.fleet = fleetId + '-' + l; b.order = i;
        sec.boats.push(b);
        // skulls on deck, carried by the boat
        if (this.rng() < 0.8) {
          for (let o = 1.2; o < b.len - 0.8; o += 1.7) sec.skulls.push({ lane: l, s: 0, y: 1.15 + 0.55, boat: sec.boats.length - 1, off: o });
        }
      });
    }
    // land lanes: only jumpable obstacles, spaced generously
    const landLanes = [0, 1, 2].filter((l) => !canalLanes.includes(l));
    let s = cA + v * 0.8;
    while (s < cB - v * 0.5) {
      const vv = speedAt(s);
      if (this.rng() < 0.55 + 0.3 * d) {
        const l = this.pick(landLanes);
        const k = this.pick(LOWS);
        sec.obstacles.push({ kind: k, lane: l, s0: s, s1: s + OB[k].len, h: OB[k].h, w: OB[k].w, tall: false, variant: this.ri(0, 5) });
        this.skullArc(sec, l, s + OB[k].len / 2, vv);
      }
      s += vv * this.r(1.3, 2.0);
    }
    const tl = landLanes.includes(this.trailLane) ? this.trailLane : landLanes[0];
    this.skullLine(sec, tl, s0 + 4, cA - 3);
    this.trailLane = tl;
    sec.skulls = sec.skulls.filter((k) => k.boat !== undefined || !sec.obstacles.some((o) => o.lane === k.lane && k.s > o.s0 - 0.6 && k.s < o.s1 + 0.6 && k.y < o.h + 0.35));
    // drop land-lane line skulls that collide with arcs (dupes close together)
    const seen = [];
    sec.skulls = sec.skulls.filter((k) => {
      if (k.boat !== undefined) return true;
      if (seen.some((q) => q.lane === k.lane && Math.abs(q.s - k.s) < 0.9)) return false;
      seen.push(k); return true;
    });
  }

  planDecor(sec) {
    const solidAt = (s) => sec.land.every((iv) => iv.some(([a, b]) => s > a + 3 && s < b - 3)) && !sec.cuts.some(([a, b]) => s > a - 3 && s < b + 3);
    while (this.nextArch < sec.end) {
      if (this.nextArch >= sec.start && solidAt(this.nextArch)) sec.arches.push(this.nextArch);
      this.nextArch += this.r(70, 130);
    }
    while (this.nextPapel < sec.end) {
      if (this.nextPapel >= sec.start && !sec.cuts.some(([a, b]) => this.nextPapel > a - 2 && this.nextPapel < b + 2)) sec.papel.push(this.nextPapel);
      this.nextPapel += this.r(28, 55);
    }
  }
}
