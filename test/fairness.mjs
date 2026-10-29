// Beam-search bot over the real planner + physics: proves a surviving route exists for many seeds.
import { Planner } from '../js/planner.js';
import { newPlayer, stepPlayer } from '../js/physics.js';

const DT = 1 / 60, FRAMES = 6, BEAM = Number(process.env.BEAM || 40);
const GOAL = Number(process.env.GOAL || 5000);
const seeds = (process.env.SEEDS || '1,2,3,4,5,6,7,8').split(',').map(Number);
const ACTIONS = [{}, { left: 1 }, { right: 1 }, { jump: 1 }, { left: 1, jump: 1 }, { right: 1, jump: 1 }];

let failures = 0;
for (const seed of seeds) {
  const planner = new Planner(seed);
  const sections = [];
  const ensure = (s) => { while (planner.cursor < s + 300) sections.push(planner.next()); while (sections.length && sections[0].end < s - 60) sections.shift(); };
  let beam = [newPlayer()];
  let best = 0;
  const t0 = Date.now();
  while (beam.length) {
    const s = Math.min(...beam.map((p) => p.s));
    ensure(s);
    if (s >= GOAL) break;
    const next = new Map();
    for (const p of beam) {
      for (const a of ACTIONS) {
        if (!p.grounded && a.jump && !a.left && !a.right) continue;
        const q = { ...p };
        let ok = true;
        for (let f = 0; f < FRAMES; f++) {
          const ev = stepPlayer(q, f === 0 ? a : {}, DT, sections);
          if (!q.alive) { ok = false; break; }
          if (ev.some((e) => e.type === 'stumble')) { ok = false; break; } // stricter: route must not rely on bumps
        }
        if (!ok) continue;
        const key = `${q.lane}|${q.grounded}|${Math.round(q.y * 3)}|${Math.round(q.x * 2)}|${Math.round(q.vy)}`;
        if (!next.has(key)) next.set(key, q);
      }
    }
    beam = [...next.values()];
    // prefer grounded states and diversity of lanes
    beam.sort((a, b) => (b.grounded - a.grounded) || (Math.random() - 0.5));
    beam = beam.slice(0, BEAM);
    if (beam.length) best = Math.max(best, beam[0].s);
  }
  const secAt = sections.find((x) => best >= x.start && best <= x.end);
  if (best < GOAL) {
    failures++;
    console.log(`seed ${seed}: FAILED at s=${best.toFixed(1)} in ${secAt ? secAt.type + ' #' + secAt.id : '?'} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (secAt) console.log(JSON.stringify({ ...secAt, skulls: undefined, _layout: undefined }, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)));
  } else console.log(`seed ${seed}: ok to ${GOAL} m (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
process.exit(failures ? 1 : 0);
