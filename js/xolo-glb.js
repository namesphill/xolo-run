// Artist-made xolo loaded from a .glb, exposing the same API as createXolo() in xolo.js.
// Animation and naming contract: docs/ARTIST_BRIEF.md.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';

const BASE = ['idle', 'run', 'jump', 'fall'];
const OVERLAY = ['land', 'lane_left', 'lane_right', 'stumble'];
const DEATHS = ['death_crash', 'death_splash'];
// run-cycle fraction at which each paw plants, and where to find the paw
const FOOTFALLS = { HL: 0.0, HR: 0.1, FL: 0.45, FR: 0.55 };
const PAWS = { FL: ['paw_FL', 'F-1p'], FR: ['paw_FR', 'F1p'], HL: ['paw_HL', 'H-1p'], HR: ['paw_HR', 'H1p'] };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const spring = (k = 140, c = 16) => ({ x: 0, v: 0, k, c });
const stepSpring = (s, dt, target = 0) => { s.v += (-s.k * (s.x - target) - s.c * s.v) * dt; s.x += s.v * dt; return s.x; };

export async function loadXoloGLB(url, params = {}) {
  const gltf = await new GLTFLoader().loadAsync(url);
  return createGLBXolo(gltf, params);
}

export function createGLBXolo(gltf, params = {}) {
  const P = Object.assign({ envMapIntensity: 1, refSpeed: 12 }, params);
  const root = new THREE.Group(); root.name = 'xolo';
  const pivot = new THREE.Group(); root.add(pivot);
  const model = gltf.scene; pivot.add(model);

  const extras = {};
  model.traverse((o) => { for (const k in o.userData) if (k.startsWith('xolo_') && !(k in extras)) extras[k] = o.userData[k]; });
  if (+extras.xolo_run_speed > 0) P.refSpeed = +extras.xolo_run_speed;
  if (+extras.xolo_scale > 0) model.scale.multiplyScalar(+extras.xolo_scale);
  const footfalls = Object.assign({}, FOOTFALLS, extras.xolo_footfalls);

  const meshes = [], mats = new Set(), blinkMorphs = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    meshes.push(o);
    if (o.isSkinnedMesh) o.frustumCulled = false;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    const bi = o.morphTargetDictionary?.blink;
    if (bi !== undefined) blinkMorphs.push([o, bi]);
  });
  mats.forEach((m) => { if ('envMapIntensity' in m) m.envMapIntensity = P.envMapIntensity; });
  const paws = {};
  for (const f in PAWS) for (const n of PAWS[f]) { const o = model.getObjectByName(n); if (o) { paws[f] = o; break; } }

  const clips = {};
  for (const c of gltf.animations) clips[c.name.toLowerCase()] = c;
  if (!clips.run && !clips.idle) throw new Error('xolo.glb needs a "run" or "idle" animation');
  const mixer = new THREE.AnimationMixer(model);
  const act = {}, w = {};
  for (const n of BASE) if (clips[n]) {
    const a = act[n] = mixer.clipAction(clips[n]);
    if (n === 'jump') { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
    a.play(); a.setEffectiveWeight(0); w[n] = 0;
  }
  for (const n of OVERLAY) if (clips[n]) {
    const c = THREE.AnimationUtils.makeClipAdditive(clips[n].clone());
    const a = act[n] = mixer.clipAction(c, undefined, THREE.AdditiveAnimationBlendMode);
    a.setLoop(THREE.LoopOnce);
  }
  for (const n of DEATHS) if (clips[n]) {
    const a = act[n] = mixer.clipAction(clips[n]);
    a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true;
  }

  const sp = { lean: spring(), squash: spring(160, 12), tip: spring(60, 10), sink: spring(40, 9) };
  const st = { dead: null, deathT: 0, prevRunT: 0, blinkT: 2, blinkA: 0 };
  let mode = 'idle', grounded = true;
  const tmp = new THREE.Vector3();

  function fire(name) {
    const a = act[name];
    if (!a) return false;
    a.reset().setEffectiveWeight(1).play();
    return true;
  }
  function emitFoot(f, info) {
    if (!xolo.onFootfall) return;
    root.updateMatrixWorld(true);
    (paws[f] || root).getWorldPosition(tmp);
    xolo.onFootfall(tmp.clone(), f, info);
  }

  function update(dt, s = {}) {
    if (!(dt > 0)) return;
    mode = s.mode || 'idle'; grounded = s.grounded !== false;
    const speed = s.speed || 0, vy = s.vy || 0, lateral = s.lateral || 0;
    const tgt = { idle: 0, run: 0, jump: 0, fall: 0 };
    if (!st.dead) {
      if (mode === 'run' && !grounded) {
        if (act.jump && (vy > 0 || !act.fall)) tgt.jump = 1;
        else if (act.fall) tgt.fall = 1;
        else tgt.run = 1;
      } else if (mode === 'run') tgt.run = 1;
      else tgt.idle = 1;
      if (tgt.run && !act.run) { tgt.idle = 1; tgt.run = 0; }
      if (tgt.idle && !act.idle) { tgt.run = 1; tgt.idle = 0; }
    }
    const k = 1 - Math.exp(-12 * dt);
    for (const n in w) { w[n] += (tgt[n] - w[n]) * k; act[n].setEffectiveWeight(w[n]); }
    if (act.run) act.run.timeScale = mode === 'run' ? clamp(speed / P.refSpeed, 0.6, 2.2) : 0.6;

    mixer.update(dt);

    if (act.run && mode === 'run' && grounded && !st.dead && w.run > 0.5) {
      const d = act.run.getClip().duration || 1, t = (act.run.time % d) / d, t0 = st.prevRunT;
      for (const f in footfalls) {
        const ff = footfalls[f];
        if (t0 <= t ? (ff > t0 && ff <= t) : (ff > t0 || ff <= t)) emitFoot(f);
      }
      st.prevRunT = t;
    } else if (act.run) st.prevRunT = (act.run.time % (act.run.getClip().duration || 1)) / (act.run.getClip().duration || 1);

    // light procedural secondary motion on top of the clips
    const lean = stepSpring(sp.lean, dt, act.lane_left ? 0 : clamp(-lateral * 0.03, -0.25, 0.25));
    const sq = stepSpring(sp.squash, dt);
    if (st.dead) st.deathT += dt;
    const tip = stepSpring(sp.tip, dt, st.dead === 'crash' && !act.death_crash ? 1.4 : 0);
    const sink = stepSpring(sp.sink, dt, st.dead === 'splash' && !act.death_splash ? 1 : 0);
    pivot.rotation.set(0, sink * st.deathT * 6, lean + tip * st.side);
    pivot.position.y = -sink * 0.9;
    pivot.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);

    if (blinkMorphs.length) {
      st.blinkT -= dt;
      if (st.blinkT <= 0) { st.blinkA = 0.16; st.blinkT = 2 + Math.random() * 3; }
      st.blinkA = Math.max(0, st.blinkA - dt);
      const b = st.blinkA > 0 ? Math.sin((st.blinkA / 0.16) * Math.PI) : 0;
      for (const [m, i] of blinkMorphs) m.morphTargetInfluences[i] = st.dead ? 1 : b;
    }
  }

  function reset() {
    st.dead = null; st.deathT = 0; st.side = 1;
    for (const n of DEATHS) act[n]?.stop();
    for (const n of OVERLAY) act[n]?.stop();
    for (const n in w) { w[n] = n === (act.idle ? 'idle' : 'run') ? 1 : 0; act[n].reset().play().setEffectiveWeight(w[n]); }
    for (const s of Object.values(sp)) { s.x = 0; s.v = 0; }
  }
  function onJump() { if (!fire('jump')) sp.squash.v -= 3; }
  function onLand(strength = 0.6) {
    const s = clamp(strength, 0, 1);
    if (!fire('land')) sp.squash.v += 1 + 4 * s;
    for (const f in PAWS) emitFoot(f, { landing: true, strength: s });
  }
  function onLane(dir) {
    const d = Math.sign(dir) || 1;
    if (!fire(d < 0 ? 'lane_left' : 'lane_right')) sp.lean.v += d * 4;
  }
  function onStumble(dir = 1) { if (!fire('stumble')) sp.lean.v -= (Math.sign(dir) || 1) * 6; }
  function onDeath(cause = 'crash') {
    st.dead = cause === 'splash' ? 'splash' : 'crash';
    st.deathT = 0; st.side = sp.lean.x > 0.02 ? 1 : sp.lean.x < -0.02 ? -1 : (Math.random() < 0.5 ? -1 : 1);
    fire('death_' + st.dead) || fire(DEATHS.find((n) => act[n]));
  }
  function setShadow(on) { meshes.forEach((m) => { m.castShadow = !!on; }); }

  const xolo = {
    root, params: P, mesh: meshes.find((m) => m.isSkinnedMesh) || meshes[0] || null, rig: null,
    materials: [...mats], isGLB: true, clips: Object.keys(clips),
    onFootfall: null,
    rebuild() {}, applyMaterials() {},
    reset, update, onJump, onLand, onLane, onStumble, onDeath, setShadow,
    dispose() {
      mixer.stopAllAction();
      model.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      mats.forEach((m) => { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); });
    },
  };
  reset();
  update(1 / 60, { mode: 'idle', grounded: true });
  return xolo;
}
