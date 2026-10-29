// Pure gameplay physics shared by the game and the Node fairness checker.
import { LANE_W, laneX, PLAYER, DECK_Y, CROSSER_TOP, speedAt, jumpParams, travelTime } from './config.js';

const BOAT_HALF_W = 0.95;

// Positions of canal trajineras are a pure function of the player's distance, so a layout
// designed for the moment the player reaches the canal is exactly what they will meet.
export function boatLayout(sec, playerS, extraT = 0) {
  if (!sec.boats.length) return [];
  if (sec._layoutS === playerS && sec._layoutT === extraT) return sec._layout;
  const out = new Array(sec.boats.length);
  const fleets = {};
  sec.boats.forEach((b, i) => { (fleets[b.fleet] ||= []).push(i); });
  for (const key in fleets) {
    const idx = fleets[key];
    const b0 = sec.boats[idx[0]];
    let shift = 0;
    if (b0.speed > 0) {
      const sAct = b0.sArrive - speedAt(b0.sArrive) * b0.tAct;
      const tA = travelTime(sAct, b0.sArrive);
      const tau = playerS <= sAct ? 0 : travelTime(sAct, playerS) + extraT;
      shift = b0.speed * (tA - tau);
    }
    let prevFar = -Infinity;
    for (const i of idx) {
      const b = sec.boats[i];
      let near = b.near + shift;
      near = Math.max(near, b.dock + 0.2, prevFar + 0.6);
      out[i] = { near, far: near + b.len, lane: b.lane };
      prevFar = near + b.len;
    }
  }
  sec._layoutS = playerS; sec._layoutT = extraT; sec._layout = out;
  return out;
}

export function crosserX(c, playerS, extraT = 0) {
  const tArr = travelTime(playerS, c.s) - extraT;
  return c.targetX - c.dir * c.speed * tArr;
}

export function sectionsNear(sections, s, r0 = 16, r1 = 16) {
  const res = [];
  for (const sec of sections) if (sec.end > s - r0 && sec.start < s + r1) res.push(sec);
  return res;
}

export function laneAtX(x) { return Math.max(0, Math.min(2, Math.round(x / LANE_W) + 1)); }

export function isLand(secs, lane, s) {
  for (const sec of secs) {
    if (s < sec.start - 40 || s > sec.end) continue;
    for (const [a, b] of sec.land[lane]) if (s >= a && s <= b) return true;
  }
  return false;
}

export function colliders(secs, playerS, extraT = 0) {
  const out = [];
  for (const sec of secs) {
    for (const o of sec.obstacles) {
      if (o.s1 < playerS - 4 || o.s0 > playerS + 6) continue;
      const cx = laneX(o.lane);
      out.push({ minX: cx - o.w / 2, maxX: cx + o.w / 2, minS: o.s0, maxS: o.s1, minY: 0, maxY: o.h, kind: o.kind });
    }
    if (sec.boats.length) {
      const lay = boatLayout(sec, playerS, extraT);
      lay.forEach((b) => {
        if (b.far < playerS - 4 || b.near > playerS + 6) return;
        const cx = laneX(b.lane);
        out.push({ minX: cx - BOAT_HALF_W, maxX: cx + BOAT_HALF_W, minS: b.near, maxS: b.far, minY: -2, maxY: DECK_Y, kind: 'boat' });
      });
    }
    for (const c of sec.crossers) {
      if (Math.abs(c.s - playerS) > 6) continue;
      const x = crosserX(c, playerS, extraT);
      out.push({ minX: x - c.len / 2, maxX: x + c.len / 2, minS: c.s - 0.65, maxS: c.s + 0.65, minY: -1, maxY: CROSSER_TOP, kind: 'crosser', moving: true, c });
    }
  }
  return out;
}

export function newPlayer() {
  return { s: 0, x: 0, y: 0, vy: 0, lane: 1, prevLane: 1, grounded: true, coyote: 0, jumpBuf: 0, alive: true, stumble: 0, airTime: 0, support: 'land', laneDir: 0 };
}

const overlap1 = (a0, a1, b0, b1) => a0 < b1 && a1 > b0;

// input: { left, right, jump } (edge-triggered)
export function stepPlayer(p, input, dt, sections, extraT = 0) {
  const ev = [];
  if (!p.alive) return ev;
  const prev = { s: p.s, x: p.x, y: p.y };

  if (input.left && p.lane > 0) { p.prevLane = p.lane; p.lane--; p.laneDir = -1; ev.push({ type: 'lane', dir: -1 }); }
  if (input.right && p.lane < 2) { p.prevLane = p.lane; p.lane++; p.laneDir = 1; ev.push({ type: 'lane', dir: 1 }); }
  if (input.jump) p.jumpBuf = 0.15;

  const tx = laneX(p.lane);
  const k = 1 - Math.exp(-dt * 17);
  p.x += (tx - p.x) * k;
  if (Math.abs(tx - p.x) < 0.01) p.x = tx;

  const v = speedAt(p.s);
  p.s += v * dt;
  const jp = jumpParams(v);

  p.jumpBuf = Math.max(0, p.jumpBuf - dt);
  p.coyote = Math.max(0, p.coyote - dt);
  p.stumble = Math.max(0, p.stumble - dt);
  if (p.jumpBuf > 0 && (p.grounded || p.coyote > 0)) {
    p.vy = jp.vy; p.grounded = false; p.coyote = 0; p.jumpBuf = 0; p.airTime = 0;
    ev.push({ type: 'jump' });
  }
  if (!p.grounded) { p.vy -= jp.g * dt; p.y += p.vy * dt; p.airTime += dt; }

  const secs = sectionsNear(sections, p.s);
  const lane = laneAtX(p.x);
  let support = -Infinity, supportKind = 'water';
  if (prev.y > -0.15 && isLand(secs, lane, p.s)) { support = 0; supportKind = 'land'; }

  const cols = colliders(secs, p.s, extraT);
  const prevCols = cols.some((c) => c.moving) ? colliders(secs, prev.s, extraT - dt) : null;
  const pb = { minX: p.x - PLAYER.halfW, maxX: p.x + PLAYER.halfW, minS: p.s - PLAYER.back, maxS: p.s + PLAYER.front };
  const ob = { minX: prev.x - PLAYER.halfW, maxX: prev.x + PLAYER.halfW, minS: prev.s - PLAYER.back, maxS: prev.s + PLAYER.front };
  let hit = null;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (!overlap1(pb.minX, pb.maxX, c.minX, c.maxX) || !overlap1(pb.minS, pb.maxS, c.minS, c.maxS)) continue;
    if (prev.y >= c.maxY - 0.06 || p.y >= c.maxY - 0.22) {
      if (c.maxY > support) { support = c.maxY; supportKind = c.kind; }
      continue;
    }
    if (p.y + PLAYER.height <= c.minY) continue;
    let pc = c;
    if (c.moving && prevCols) pc = prevCols.find((q) => q.c === c.c) || c;
    const wasS = overlap1(ob.minS, ob.maxS, pc.minS, pc.maxS);
    const wasX = overlap1(ob.minX, ob.maxX, pc.minX, pc.maxX);
    if (wasS && !wasX) hit = hit || { type: 'side', c };
    else hit = { type: 'front', c };
  }

  if (hit && hit.type === 'side') {
    const away = p.x < (hit.c.minX + hit.c.maxX) / 2 ? -1 : 1;
    const back = p.prevLane !== p.lane && Math.sign(p.prevLane - p.lane) === away ? p.prevLane : p.lane + away;
    if (!hit.c.moving && back >= 0 && back <= 2 && p.stumble <= 0) {
      p.lane = back; p.prevLane = back; p.x = prev.x; p.stumble = 0.35;
      ev.push({ type: 'stumble', dir: away });
      hit = null;
    } else if (!hit.c.moving && p.stumble > 0) {
      p.x = prev.x; hit = null;
    } else {
      hit = { type: 'front', c: hit.c };
    }
  }
  if (hit) {
    p.alive = false; p.s = prev.s; p.x = prev.x;
    ev.push({ type: 'dead', cause: 'crash', kind: hit.c.kind });
    return ev;
  }

  if (p.y <= support + 1e-4 && p.vy <= 0) {
    if (!p.grounded) ev.push({ type: 'land', vy: p.vy, air: p.airTime, on: supportKind });
    p.y = support; p.vy = 0; p.grounded = true; p.support = supportKind;
  } else if (p.grounded && p.y > support + 1e-4) {
    p.grounded = false; p.coyote = 0.1; p.vy = 0; p.airTime = 0;
  }
  if (!p.grounded && support === -Infinity && p.y < -0.65) {
    p.alive = false;
    ev.push({ type: 'dead', cause: 'splash' });
  }
  return ev;
}
