// Shared gameplay constants and pure helpers (no three.js dependency so they can be tested in Node).
export const LANE_W = 2.2;
export const LANES = 3;
export const laneX = (i) => (i - 1) * LANE_W;

export const WATER_Y = -0.55;
export const DECK_Y = 1.15;          // large trajinera deck height above path
export const CROSSER_TOP = 0.9;      // small trajinera height above ford
export const JUMP_H = 1.9;

export const PLAYER = { halfW: 0.3, back: 0.45, front: 0.5, height: 0.95 };

export const BASE_SPEED = 12;
export const MAX_SPEED_GAIN = 16;
export function speedAt(s) {
  return BASE_SPEED + MAX_SPEED_GAIN * (1 - Math.exp(-Math.max(0, s) / 2200));
}
// Jump gets slightly snappier as speed rises so it stays readable.
export function jumpParams(v) {
  const T = 0.68 * Math.pow(BASE_SPEED / v, 0.3);
  return { T, H: JUMP_H, vy: (4 * JUMP_H) / T, g: (8 * JUMP_H) / (T * T) };
}
// Time to travel from s0 to s1 (s1 >= s0) at the distance-driven speed curve (midpoint rule, accurate enough).
export function travelTime(s0, s1) {
  if (s1 <= s0) return -(travelTime(s1, s0));
  const n = Math.max(1, Math.ceil((s1 - s0) / 40));
  const h = (s1 - s0) / n;
  let t = 0;
  for (let i = 0; i < n; i++) t += h / speedAt(s0 + h * (i + 0.5));
  return t;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
