// Phone extras: haptics (native through Capacitor, Vibration API elsewhere) and tilt steering.
const cap = globalThis.Capacitor;
let Haptics = null;
try {
  if (cap?.isNativePlatform?.() && cap.isPluginAvailable?.('Haptics')) Haptics = cap.Plugins?.Haptics ?? cap.registerPlugin('Haptics');
} catch (e) {
  console.warn('Haptics unavailable:', e);
}
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export const haptics = { supported: !!Haptics || 'vibrate' in navigator, on: localStorage.getItem('xolo-haptics') !== '0' };
export function setHaptics(on) { haptics.on = on; localStorage.setItem('xolo-haptics', on ? '1' : '0'); }

const IMPACT = { lane: ['LIGHT', 8], collect: ['LIGHT', 6], jump: ['LIGHT', 12], land: ['MEDIUM', 18], stumble: ['HEAVY', 40] };
let lastBuzz = 0;
export function haptic(kind) {
  if (!haptics.on || !haptics.supported) return;
  const now = performance.now();
  if (kind === 'collect' && now - lastBuzz < 70) return;
  lastBuzz = now;
  if (kind === 'crash' || kind === 'newbest') {
    if (Haptics) Haptics.notification({ type: kind === 'crash' ? 'ERROR' : 'SUCCESS' }).catch(() => {});
    else navigator.vibrate?.(kind === 'crash' ? [60, 40, 90] : [20, 60, 20, 60, 40]);
    return;
  }
  const [style, ms] = IMPACT[kind] || IMPACT.lane;
  if (Haptics) Haptics.impact({ style }).catch(() => {});
  else navigator.vibrate?.(ms);
}

// Tilt: tip the phone past TILT_ON degrees to switch lanes (return under TILT_OFF to re-arm); flick it to jump.
const TILT_ON = 16, TILT_OFF = 7, FLICK = 260, FLICK_GAP = 380;
export const tilt = { supported: isTouch && 'DeviceOrientationEvent' in window, on: localStorage.getItem('xolo-tilt') === '1' };
let zero = null, side = 0, lastFlick = 0, handlers = null;

async function requestPermission(Ev) {
  if (typeof Ev?.requestPermission !== 'function') return true;
  try { return (await Ev.requestPermission()) === 'granted'; } catch { return false; }
}
// Call from a tap: iOS only shows the motion permission prompt during a user gesture.
export async function setTilt(on) {
  if (on) on = (await requestPermission(globalThis.DeviceOrientationEvent)) && (await requestPermission(globalThis.DeviceMotionEvent));
  tilt.on = on; localStorage.setItem('xolo-tilt', on ? '1' : '0');
  return on;
}
export const ensureTiltPermission = () => (tilt.on ? setTilt(true) : Promise.resolve(false));
export function calibrateTilt() { zero = null; side = 0; }

export function initTilt(onLane, onJump) {
  handlers = { onLane, onJump };
  addEventListener('deviceorientation', (e) => {
    if (!tilt.on || e.gamma == null) return;
    if (zero === null) zero = e.gamma;
    const g = e.gamma - zero;
    if (side === 0 && Math.abs(g) > TILT_ON) { side = Math.sign(g); handlers.onLane(side < 0 ? 'left' : 'right'); }
    else if (side !== 0 && Math.abs(g) < TILT_OFF) side = 0;
    if (Math.abs(g) < 4) zero += g * 0.02;
  });
  addEventListener('devicemotion', (e) => {
    const r = e.rotationRate?.beta;
    if (!tilt.on || r == null) return;
    const now = performance.now();
    if (Math.abs(r) > FLICK && now - lastFlick > FLICK_GAP) { lastFlick = now; handlers.onJump(); }
  });
}
