import * as THREE from 'three';
import { speedAt, laneX, WATER_Y } from './config.js';
import { newPlayer, stepPlayer } from './physics.js';
import { setMaxAnisotropy } from './textures.js';
import { createWorld } from './world.js';
import { createXolo } from './xolo.js';
import { AudioFX } from './audio.js';
import { Track } from './track.js';

const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), dist: $('hud-distance'), skulls: $('hud-skulls'), pillSkulls: document.querySelector('.pill.skulls'),
  start: $('screen-start'), pause: $('screen-pause'), over: $('screen-over'), loading: $('loading'),
  startBest: $('start-best'), toast: $('hud-best-toast'), hint: $('controls-hint'),
  oDist: $('over-distance'), oSkulls: $('over-skulls'), oScore: $('over-score'), oBest: $('over-best'),
  oTitle: $('over-title'), oSub: $('over-sub'), oNew: $('over-newbest'), mute: $('btn-mute'),
};

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const params = new URLSearchParams(location.search);
let quality = params.get('q') || (isTouch || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: quality === 'high' || devicePixelRatio < 2, powerPreference: 'high-performance' });
} catch (e) {
  ui.loading.classList.add('hidden'); $('fallback').classList.remove('hidden');
  throw e;
}
const maxDpr = quality === 'high' ? 2 : 1.5;
let dpr = Math.min(devicePixelRatio || 1, maxDpr);
renderer.setPixelRatio(dpr);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = quality === 'high';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
const world = createWorld(renderer, scene, { quality });
const xolo = createXolo();
xolo.setShadow(quality === 'high');
const XOLO_SCALE = 1.2;
xolo.root.scale.setScalar(XOLO_SCALE);
scene.add(xolo.root);
const audio = new AudioFX();
const track = new Track(scene, world, { quality });

// ---------------- state ----------------
const BEST_KEY = 'xolo.best';
let best = Number(localStorage.getItem(BEST_KEY) || 0);
let state = 'menu';      // menu | play | paused | dying | over
let player = newPlayer();
let prevP = { ...player };
let skulls = 0, combo = 0, comboT = 0, runTime = 0, deathT = 0, deathCause = null, newBestShown = false, firstRun = true;
let acc = 0, time = 0, shake = 0;
const input = { left: 0, right: 0, jump: 0 };
const DT = 1 / 60;
const renderP = { s: 0, x: 0, y: 0 };

const score = () => Math.floor(player.s) + skulls * 10;
function setBestUI() { ui.startBest.textContent = best.toLocaleString(); }
setBestUI();
ui.mute.classList.toggle('is-muted', audio.muted);

function resetRun() {
  player = newPlayer(); prevP = { ...player };
  skulls = 0; combo = 0; comboT = 0; runTime = 0; deathT = 0; newBestShown = false; acc = 0;
  input.left = input.right = input.jump = 0;
  track.reset((Math.random() * 1e9) | 0);
  xolo.reset();
  ui.dist.textContent = '0'; ui.skulls.textContent = '0';
}

function show(el, on) { el.classList.toggle('hidden', !on); }
function startRun() {
  audio.unlock(); audio.sfx('start');
  resetRun();
  state = 'play';
  show(ui.start, false); show(ui.over, false); show(ui.pause, false); show(ui.hud, true);
  audio.startMusic();
  if (firstRun) {
    ui.hint.textContent = isTouch ? 'Swipe ← → to switch lanes · swipe ↑ to jump' : '← → / A D to switch lanes · Space / ↑ to jump';
    show(ui.hint, true); ui.hint.classList.remove('fade');
    setTimeout(() => ui.hint.classList.add('fade'), 3800);
    setTimeout(() => show(ui.hint, false), 4600);
    firstRun = false;
  }
}
function pauseGame() {
  if (state !== 'play') return;
  state = 'paused'; show(ui.pause, true); audio.pauseAll();
}
function resumeGame() {
  if (state !== 'paused') return;
  state = 'play'; show(ui.pause, false); audio.resumeAll(); last = performance.now();
}
function toMenu() {
  state = 'menu'; resetRun();
  show(ui.over, false); show(ui.pause, false); show(ui.hud, false); show(ui.start, true);
  audio.stopMusic(); setBestUI();
}
const KIND_NAMES = { crate: 'crate of cempasúchil', pots: 'clay pots', fence: 'flower fence', ofrenda: 'ofrenda', tower: 'tower of crates', stall: 'market stall', boat: 'trajinera', crosser: 'trajinera' };
function die(ev) {
  state = 'dying'; deathT = 0; deathCause = ev.cause;
  xolo.onDeath(ev.cause);
  audio.sfx(ev.cause === 'splash' ? 'splash' : 'crash');
  audio.stopMusic();
  if (ev.cause === 'splash') {
    world.burst(new THREE.Vector3(player.x, WATER_Y + 0.05, -player.s), { kind: 'splash', count: 50 });
    ui.oTitle.textContent = '¡Al agua!'; ui.oSub.textContent = 'Splash! Xolos are better runners than swimmers.';
  } else {
    shake = 0.6;
    world.burst(new THREE.Vector3(player.x, player.y + 0.6, -player.s - 0.4), { kind: 'dust', count: 26 });
    ui.oTitle.textContent = '¡Ay, chihuahua!'; ui.oSub.textContent = `Bonk! Straight into a ${KIND_NAMES[ev.kind] || 'obstacle'}.`;
  }
}
function gameOver() {
  state = 'over';
  const sc = score();
  const isNew = sc > best;
  if (isNew) { best = sc; localStorage.setItem(BEST_KEY, String(best)); audio.sfx('newbest'); } else audio.sfx('gameover');
  ui.oDist.textContent = `${Math.floor(player.s).toLocaleString()} m`;
  ui.oSkulls.textContent = skulls.toLocaleString();
  ui.oScore.textContent = sc.toLocaleString();
  ui.oBest.textContent = best.toLocaleString();
  show(ui.oNew, isNew);
  show(ui.hud, false); show(ui.over, true);
  setBestUI();
}

// ---------------- input ----------------
const press = (k) => { input[k] = 1; };
addEventListener('keydown', (e) => {
  const k = e.code;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(k)) e.preventDefault();
  if (e.repeat) return;
  if (state === 'play') {
    if (k === 'ArrowLeft' || k === 'KeyA') press('left');
    else if (k === 'ArrowRight' || k === 'KeyD') press('right');
    else if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') press('jump');
    else if (k === 'Escape' || k === 'KeyP') pauseGame();
  } else if (state === 'paused') {
    if (k === 'Escape' || k === 'KeyP' || k === 'Space' || k === 'Enter') resumeGame();
  } else if (state === 'menu' || state === 'over') {
    if (k === 'Space' || k === 'Enter') startRun();
  }
  if (k === 'KeyM') toggleMute();
});
let touch = null;
const canvas = $('game');
addEventListener('touchstart', (e) => {
  if (e.target.closest('button')) return;
  const t = e.changedTouches[0];
  touch = { x: t.clientX, y: t.clientY, t: performance.now(), fired: false };
}, { passive: true });
addEventListener('touchmove', (e) => {
  if (!touch || touch.fired || state !== 'play') return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  const th = Math.max(24, Math.min(innerWidth, innerHeight) * 0.05);
  if (Math.abs(dx) > th || Math.abs(dy) > th) {
    if (Math.abs(dx) > Math.abs(dy)) press(dx < 0 ? 'left' : 'right');
    else if (dy < 0) press('jump');
    touch.fired = true;
  }
}, { passive: true });
addEventListener('touchend', () => { touch = null; }, { passive: true });
canvas.addEventListener('pointerdown', () => { if (state === 'menu') return; });

$('btn-play').addEventListener('click', startRun);
$('btn-restart').addEventListener('click', startRun);
$('btn-restart-p').addEventListener('click', startRun);
$('btn-menu').addEventListener('click', toMenu);
$('btn-menu-p').addEventListener('click', toMenu);
$('btn-pause').addEventListener('click', pauseGame);
$('btn-resume').addEventListener('click', resumeGame);
function toggleMute() { audio.unlock(); const m = audio.toggleMute(); ui.mute.classList.toggle('is-muted', m); }
ui.mute.addEventListener('click', (e) => { e.currentTarget.blur(); toggleMute(); });
document.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { audio.sfx('click'); b.blur(); }));
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
addEventListener('blur', pauseGame);

// ---------------- camera ----------------
const camPos = new THREE.Vector3(0, 3.4, 6.2), camLook = new THREE.Vector3(0, 1.1, -6);
const tmpV = new THREE.Vector3(), tmpL = new THREE.Vector3();
let menuLookY = 0;
let baseFov = 60, camBack = 6.2, camUp = 3.4;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep all three lanes (~8.5 units wide at the dog) in view on portrait phones
  const needH = 8.6 / camera.aspect;
  const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(needH / 2 / 7.2));
  baseFov = THREE.MathUtils.clamp(Math.max(58, vfov), 58, 82);
  camBack = camera.aspect < 0.8 ? 6.2 : 5.4; camUp = camera.aspect < 0.8 ? 3.5 : 2.9;
  camera.fov = baseFov; camera.updateProjectionMatrix();
  menuLookY = camera.aspect < 0.8 ? -0.9 : -0.35;
}
addEventListener('resize', resize); resize();

function updateCamera(dt) {
  const px = renderP.x, py = renderP.y, pz = -renderP.s;
  if (state === 'menu') {
    const a = Math.sin(time * 0.25) * 0.35;
    tmpV.set(px + Math.sin(a + 2.6) * 3.6, 1.9, pz + Math.cos(a + 2.6) * 3.6 - 0.3);
    tmpL.set(px, menuLookY, pz - 0.2);
  } else {
    const v = speedAt(renderP.s);
    tmpV.set(px * 0.75, camUp + Math.max(0, py) * 0.55, pz + camBack + (v - 12) * 0.04);
    tmpL.set(px * 0.85, 1.0 + Math.max(0, py) * 0.4, pz - 6);
    if (state === 'dying' && deathCause === 'splash') { tmpL.y = 0; }
  }
  const k = 1 - Math.exp(-dt * (state === 'menu' ? 2 : 9));
  camPos.lerp(tmpV, k); camLook.lerp(tmpL, 1 - Math.exp(-dt * 12));
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.3; camera.position.y += (Math.random() - 0.5) * shake * 0.3; shake = Math.max(0, shake - dt * 2.2); }
  camera.lookAt(camLook);
  if (state === 'play') { const v = speedAt(renderP.s); camera.fov += (baseFov + (v - 12) * 0.35 - camera.fov) * k; camera.updateProjectionMatrix(); }
}

// ---------------- simulation ----------------
function simStep() {
  prevP = { s: player.s, x: player.x, y: player.y };
  const evs = stepPlayer(player, input, DT, track.sections);
  input.left = input.right = input.jump = 0;
  for (const ev of evs) {
    if (ev.type === 'lane') { xolo.onLane(ev.dir); audio.sfx('lane', { dir: ev.dir }); }
    else if (ev.type === 'jump') { xolo.onJump(); audio.sfx('jump'); }
    else if (ev.type === 'land') {
      const st = Math.min(1, Math.abs(ev.vy) / 14);
      xolo.onLand(st); audio.sfx('land', { strength: st });
      world.burst(new THREE.Vector3(player.x, player.y + 0.05, -player.s), { kind: 'dust', count: 6 + Math.round(st * 10), colors: ev.on === 'land' ? [0xc99561, 0xa87449, 0xffb020] : [0xffd27a, 0xffffff] });
      shake = Math.max(shake, st * 0.12);
    } else if (ev.type === 'stumble') { xolo.onStumble(ev.dir); audio.sfx('stumble'); shake = 0.3; }
    else if (ev.type === 'dead') { die(ev); return; }
  }
  const got = track.collect(player, DT);
  comboT -= DT;
  for (const pos of got) {
    combo = comboT > 0 ? combo + 1 : 0; comboT = 0.55;
    skulls++;
    audio.sfx('collect', { combo });
    world.burst(pos, { kind: 'sparkle', count: 10, colors: [0xffffff, 0xff9a1f, 0xe8177d, 0x12b5b0, 0xffe14d] });
  }
  if (got.length) {
    ui.skulls.textContent = skulls;
    ui.pillSkulls.classList.remove('bump'); void ui.pillSkulls.offsetWidth; ui.pillSkulls.classList.add('bump');
  }
  runTime += DT;
}

let last = performance.now();
let fpsAcc = 0, fpsN = 0, fpsChecked = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  time += dt;
  if (state === 'play') {
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 6 && state === 'play') { simStep(); acc -= DT; n++; }
    if (n === 6) acc = 0;
    const a = state === 'play' ? acc / DT : 1;
    renderP.s = prevP.s + (player.s - prevP.s) * a;
    renderP.x = prevP.x + (player.x - prevP.x) * a;
    renderP.y = prevP.y + (player.y - prevP.y) * a;
    ui.dist.textContent = Math.floor(player.s);
    audio.setMusicIntensity(Math.min(1, (speedAt(player.s) - 12) / 14));
    if (!newBestShown && best > 0 && score() > best) {
      newBestShown = true; show(ui.toast, true); ui.toast.style.animation = 'none'; void ui.toast.offsetWidth; ui.toast.style.animation = '';
      audio.sfx('newbest'); setTimeout(() => show(ui.toast, false), 2300);
    }
  } else if (state === 'dying') {
    deathT += dt;
    renderP.s = player.s; renderP.x = player.x; renderP.y = player.y;
    if (deathCause === 'splash') renderP.y = Math.max(-1.6, player.y - deathT * 1.6);
    if (deathT > 1.25) gameOver();
  } else if (state === 'menu') {
    renderP.s = 0; renderP.x = 0; renderP.y = 0;
  }

  if (state !== 'paused') {
    track.update(renderP.s, time);
    xolo.root.position.set(renderP.x, renderP.y, -renderP.s);
    const lateral = (player.x - prevP.x) / DT;
    xolo.update(dt, {
      mode: state === 'menu' ? 'idle' : (state === 'play' ? 'run' : 'dead'),
      speed: state === 'play' ? speedAt(player.s) : 0,
      grounded: player.grounded, vy: player.vy, lateral: state === 'play' ? lateral : 0,
    });
    world.update(dt, time, xolo.root.position, camera);
    updateCamera(dt);
  }
  renderer.render(scene, camera);

  // adaptive resolution: drop pixel ratio if we can't hold ~50 fps
  if (state === 'play' && fpsChecked < 3) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 2.5) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; fpsChecked++;
      if (fps < 48 && dpr > 1) { dpr = Math.max(1, dpr - 0.35); renderer.setPixelRatio(dpr); resize(); }
    }
  }
}

resetRun();
updateCamera(1);
requestAnimationFrame((t) => { last = t; frame(t); });
setTimeout(() => { ui.loading.classList.add('fade'); setTimeout(() => show(ui.loading, false), 600); }, 150);

// debug/testing hooks
window.__xolo = { get state() { return state; }, get player() { return player; }, get skulls() { return skulls; }, track, startRun, input };
