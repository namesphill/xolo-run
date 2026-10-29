// Xolo Run — fully synthesized WebAudio sound (no audio files).
// Music: original 6/8 son-jarocho / huapango style loop in G (I–IV–V7–I) with marimba,
// guitarrón (Karplus–Strong plucks), jarana strums, shaker and cajón. Lookahead scheduler.

const LS_KEY = 'xolo.muted';
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
const EPS = 0.0001;

// ---------- Song data (G major) ----------
const G_MAJ = [55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 72, 74, 76, 78, 79, 81, 83, 84, 86, 88, 90, 91];
const PENTA = [74, 76, 79, 81, 83, 86, 88, 91, 93, 95]; // D5 E5 G5 A5 B5 D6 E6 G6 A6 B6

const CHORDS = [
  { root: 43, fifth: 50, strum: [55, 59, 62, 67], arp: [67, 71, 74, 79, 74, 71] },       // G
  { root: 48, fifth: 43, strum: [55, 60, 64, 67], arp: [67, 72, 76, 79, 76, 72] },       // C
  { root: 50, fifth: 45, strum: [57, 60, 62, 66], arp: [66, 69, 72, 74, 72, 69] },       // D7
  { root: 43, fifth: 50, strum: [55, 59, 62, 67], arp: [71, 74, 79, 83, 79, 74] },       // G
];
const BARS = 16, STEPS_PER_BAR = 6;
// [bar, step, midi, durSteps]
const MELODY_SRC = [
  // A phrase
  [0, 0, 71, 1], [0, 1, 74, 1], [0, 2, 79, 2], [0, 4, 78, 1], [0, 5, 79, 1],
  [1, 0, 76, 2], [1, 2, 72, 1], [1, 3, 76, 1], [1, 4, 79, 2],
  [2, 0, 78, 1], [2, 1, 76, 1], [2, 2, 74, 1], [2, 3, 72, 1], [2, 4, 69, 1], [2, 5, 66, 1],
  [3, 0, 67, 1], [3, 1, 71, 1], [3, 2, 74, 1], [3, 3, 79, 3],
  [4, 0, 74, 1], [4, 1, 71, 1], [4, 2, 74, 1], [4, 3, 79, 1], [4, 4, 78, 1], [4, 5, 76, 1],
  [5, 0, 76, 1], [5, 1, 79, 1], [5, 2, 76, 1], [5, 3, 72, 3],
  [6, 0, 74, 1], [6, 1, 78, 1], [6, 2, 81, 2], [6, 4, 78, 1], [6, 5, 81, 1],
  [7, 0, 79, 3], [7, 3, 74, 1], [7, 4, 71, 1], [7, 5, 74, 1],
  // B phrase (hemiola, higher)
  [8, 0, 83, 2], [8, 2, 81, 2], [8, 4, 79, 2],
  [9, 0, 79, 2], [9, 2, 76, 2], [9, 4, 72, 2],
  [10, 0, 78, 2], [10, 2, 81, 2], [10, 4, 84, 2],
  [11, 0, 83, 3], [11, 3, 79, 1], [11, 4, 81, 1], [11, 5, 83, 1],
  [12, 0, 86, 1], [12, 1, 83, 1], [12, 2, 79, 1], [12, 3, 83, 1], [12, 4, 81, 1], [12, 5, 79, 1],
  [13, 0, 76, 1], [13, 1, 79, 1], [13, 2, 84, 1], [13, 3, 83, 1], [13, 4, 81, 1], [13, 5, 79, 1],
  [14, 0, 78, 1], [14, 1, 81, 1], [14, 2, 86, 1], [14, 3, 84, 1], [14, 4, 81, 1], [14, 5, 78, 1],
  [15, 0, 79, 3], [15, 4, 74, 1], [15, 5, 71, 1],
];
const MELODY = new Array(BARS * STEPS_PER_BAR).fill(null);
for (const [b, s, m, d] of MELODY_SRC) MELODY[b * STEPS_PER_BAR + s] = [m, d];
const thirdBelow = (m) => { const i = G_MAJ.indexOf(m); return i >= 2 ? G_MAJ[i - 2] : m - 4; };

// Jarana rasgueo per step: [velocity, dir(1 down/-1 up), choked]
const STRUM_68 = [[1, 1, 0], [0.45, -1, 1], [0.6, 1, 0], [0.9, 1, 0], [0.45, -1, 1], [0.6, 1, 1]];
const STRUM_34 = [[1, 1, 0], [0.45, -1, 1], [0.85, 1, 0], [0.45, -1, 1], [0.85, 1, 0], [0.5, -1, 1]];
const SHAKE = [1, 0.45, 0.7, 0.9, 0.45, 0.7];

export class AudioFX {
  constructor() {
    this.ctx = null;
    this._muted = false;
    try { this._muted = localStorage.getItem(LS_KEY) === '1'; } catch (e) { /* storage unavailable */ }
    this._intensity = 0;
    this._musicWanted = false;
    this._musicRun = null;
    this._paused = false;
    this._timer = null;
    this._step = 0;
    this._nextT = 0;
    this._lastCollectT = 0;
    this._ks = new Map();
    this.musicVolume = 0.3;
    this.sfxVolume = 0.9;
    this._onVis = () => this._visibility();
  }

  // ---------- lifecycle ----------
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return Promise.resolve(false);
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { this.ctx = new AC(); }
      this._build();
      document.addEventListener('visibilitychange', this._onVis);
      // iOS: play a silent buffer inside the gesture to fully unlock output.
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
    }
    const p = this.ctx.state !== 'running' && !document.hidden ? this.ctx.resume() : Promise.resolve();
    if (this._musicWanted && !this._musicRun && !this._paused) this._beginMusic();
    return p.then(() => true, () => false);
  }

  get context() { return this.ctx; }
  get unlocked() { return !!this.ctx && this.ctx.state === 'running'; }
  get analyser() { return this._analyser || null; }

  get muted() { return this._muted; }
  setMuted(m) {
    this._muted = !!m;
    try { localStorage.setItem(LS_KEY, this._muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.ctx) {
      const t = this.ctx.currentTime;
      const g = this._out.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(this._muted ? 0 : 1, t + 0.08);
    }
    return this._muted;
  }
  toggleMute() { return this.setMuted(!this._muted); }

  setVolumes(music = this.musicVolume, sfx = this.sfxVolume) {
    this.musicVolume = music; this.sfxVolume = sfx;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this._musicBus.gain.setTargetAtTime(music, t, 0.05);
      this._sfxBus.gain.setTargetAtTime(sfx, t, 0.05);
    }
  }

  pauseAll() {
    if (this._paused) return;
    this._paused = true;
    this._fadeMusicRun(0, 0.06);
    this._stopTimer();
  }
  resumeAll() {
    if (!this._paused) return;
    this._paused = false;
    if (!this.ctx) return;
    if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume();
    if (this._musicWanted) {
      if (!this._musicRun) this._beginMusic();
      else { this._nextT = this.ctx.currentTime + 0.06; this._fadeMusicRun(1, 0.25); this._startTimer(); }
    }
  }

  _visibility() {
    if (!this.ctx) return;
    if (document.hidden) this.ctx.suspend();
    else this.ctx.resume().then(() => { if (this._musicRun && !this._paused) this._nextT = Math.max(this._nextT, this.ctx.currentTime + 0.05); });
  }

  // ---------- music ----------
  startMusic() {
    this._musicWanted = true;
    if (this.ctx && !this._musicRun && !this._paused) this._beginMusic();
  }
  stopMusic() {
    this._musicWanted = false;
    this._stopTimer();
    const run = this._musicRun;
    this._musicRun = null;
    if (run && this.ctx) {
      const t = this.ctx.currentTime;
      run.gain.cancelScheduledValues(t); run.gain.setValueAtTime(run.gain.value, t);
      run.gain.linearRampToValueAtTime(0, t + 0.35);
      setTimeout(() => run.disconnect(), 700);
    }
  }
  setMusicIntensity(v) { this._intensity = clamp(+v || 0, 0, 1); }
  get musicIntensity() { return this._intensity; }
  get musicPlaying() { return !!this._musicRun && !this._paused; }

  _beginMusic() {
    const ctx = this.ctx;
    const run = ctx.createGain();
    run.gain.value = 0;
    run.connect(this._musicBus);
    this._musicRun = run;
    // per-run instrument buses
    const mk = (pan, filt) => {
      const g = ctx.createGain();
      let node = g;
      if (filt) { const f = ctx.createBiquadFilter(); f.type = filt[0]; f.frequency.value = filt[1]; if (filt[2]) f.Q.value = filt[2]; g.connect(f); node = f; }
      if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; node.connect(p); node = p; }
      node.connect(run);
      return g;
    };
    run._mar = mk(0.05, null);
    run._bass = mk(0, ['lowpass', 1400]);
    run._jar = mk(-0.3, ['highpass', 220]);
    run._shk = mk(0.35, ['highpass', 6500]);
    run._cajL = mk(-0.05, ['lowpass', 500]);
    run._cajS = mk(0.1, ['bandpass', 2000, 0.9]);
    // reverb send
    run._mar.connect(this._revSend); run._jar.connect(this._revSend);
    const t = ctx.currentTime;
    run.gain.setValueAtTime(0, t); run.gain.linearRampToValueAtTime(1, t + 0.4);
    this._step = 0;
    this._nextT = t + 0.08;
    this._startTimer();
  }
  _fadeMusicRun(to, dur) {
    const run = this._musicRun;
    if (!run || !this.ctx) return;
    const t = this.ctx.currentTime;
    run.gain.cancelScheduledValues(t); run.gain.setValueAtTime(run.gain.value, t);
    run.gain.linearRampToValueAtTime(to, t + dur);
  }
  _startTimer() {
    if (this._timer) return;
    this._timer = setInterval(() => this._schedule(), 25);
    this._schedule();
  }
  _stopTimer() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }

  _stepDur() { const bpm = 110 + 10 * this._intensity; return 60 / bpm / 3; } // bpm in dotted quarters (6/8)

  _schedule() {
    const ctx = this.ctx, run = this._musicRun;
    if (!ctx || !run || this._paused || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (this._nextT < now - 0.05) this._nextT = now + 0.02; // stalled main thread: resync
    while (this._nextT < now + 0.12) {
      if (!this._muted) this._playStep(run, this._step, this._nextT);
      this._nextT += this._stepDur();
      this._step++;
    }
  }

  _playStep(run, step, t) {
    const I = this._intensity, sd = this._stepDur();
    const loopStep = step % (BARS * STEPS_PER_BAR);
    const bar = Math.floor(loopStep / STEPS_PER_BAR), st = loopStep % STEPS_PER_BAR;
    const ch = CHORDS[bar % 4];
    const hemiola = bar % 2 === 1;
    const cajL = smooth(0.15, 0.45, I), arpL = smooth(0.4, 0.7, I), harmL = smooth(0.65, 0.9, I);

    // melody (marimba)
    const mel = MELODY[loopStep];
    if (mel) {
      const [m, d] = mel;
      const vel = 0.5 * rnd(0.92, 1.05) * (st === 0 ? 1.08 : 1);
      if (d >= 3) this._tremolo(run._mar, t, m, vel, d * sd);
      else this._marimba(run._mar, t, m, vel);
      if (harmL > 0.01) {
        const h = thirdBelow(m);
        if (d >= 3) this._tremolo(run._mar, t + 0.004, h, vel * 0.55 * harmL, d * sd);
        else this._marimba(run._mar, t + 0.004, h, vel * 0.5 * harmL);
      }
    }
    // arp layer (high marimba, chord tones)
    if (arpL > 0.01) {
      const am = ch.arp[st] + 12;
      this._marimba(run._mar, t, am, 0.16 * arpL * (st % 3 === 0 ? 1 : 0.8), 0.6);
      if (I > 0.85 && st % 2 === 1) this._marimba(run._mar, t + sd * 0.5, ch.arp[(st + 2) % 6] + 12, 0.1 * arpL, 0.6);
    }
    // guitarrón
    const bassHit = hemiola ? (st === 0 ? ch.root : st === 2 ? ch.fifth : st === 4 ? ch.root + 12 : 0)
      : (st === 0 ? ch.root : st === 3 ? ch.fifth : 0);
    if (bassHit) this._pluck(run._bass, t, bassHit, 'bass', 0.75 * (st === 0 ? 1 : 0.85), 1.2);
    else if (I > 0.55 && !hemiola && st === 5) this._pluck(run._bass, t, ch.root + 12, 'bass', 0.35, 0.3);
    // jarana
    const sp = (hemiola ? STRUM_34 : STRUM_68)[st];
    this._strum(run._jar, t, ch.strum, sp[0] * 0.3 * (0.8 + 0.2 * I), sp[1], sp[2], sd);
    // shaker
    const shkL = 0.35 + 0.65 * smooth(0, 0.3, I);
    if (I > 0.12 || st === 0 || st === 3) this._noiseHit(run._shk, t, 0.13 * SHAKE[st] * shkL, 0.012, 0.05 + 0.02 * SHAKE[st]);
    if (I > 0.7) this._noiseHit(run._shk, t + sd * 0.5, 0.05 * shkL, 0.008, 0.035);
    // cajón
    if (cajL > 0.01) {
      const low = st === 0 || (hemiola ? false : st === 3 && I > 0.6);
      const slap = hemiola ? (st === 2 || st === 4) : st === 3;
      const ghost = I > 0.55 && (hemiola ? st === 5 : (st === 2 || st === 5));
      if (low) this._cajonLow(run, t, 0.6 * cajL);
      if (slap) this._cajonSlap(run, t, 0.5 * cajL);
      if (ghost) this._cajonSlap(run, t, 0.16 * cajL);
    }
  }

  // ---------- graph ----------
  _build() {
    const ctx = this.ctx;
    this._comp = ctx.createDynamicsCompressor();
    Object.entries({ threshold: -16, knee: 10, ratio: 4, attack: 0.003, release: 0.22 })
      .forEach(([k, v]) => { this._comp[k].value = v; });
    this._out = ctx.createGain();
    this._out.gain.value = this._muted ? 0 : 1;
    this._analyser = ctx.createAnalyser();
    this._analyser.fftSize = 1024;
    this._comp.connect(this._out);
    this._out.connect(ctx.destination);
    this._out.connect(this._analyser);

    this._musicBus = ctx.createGain(); this._musicBus.gain.value = this.musicVolume; this._musicBus.connect(this._comp);
    this._sfxBus = ctx.createGain(); this._sfxBus.gain.value = this.sfxVolume; this._sfxBus.connect(this._comp);

    // small warm reverb (generated impulse), shared by music + sparkly sfx
    const conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.1);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) { lp += 0.35 * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - i / len, 2.6); }
    }
    conv.buffer = ir;
    this._revSend = ctx.createGain(); this._revSend.gain.value = 0.22;
    this._revSend.connect(conv); conv.connect(this._comp);
    this._sfxRev = ctx.createGain(); this._sfxRev.gain.value = 0.3; this._sfxRev.connect(this._revSend);

    // shared white noise
    const nlen = ctx.sampleRate * 2;
    this._noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this._noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
  }

  // ---------- voices ----------
  _env(param, t, peak, a, d) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(EPS, t + a + d);
  }
  _osc(type, f, t, end, dest) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(Math.min(f, this.ctx.sampleRate * 0.45), t);
    o.connect(dest); o.start(t); o.stop(end);
    return o;
  }
  _gain(dest) { const g = this.ctx.createGain(); g.gain.value = 0; g.connect(dest); return g; }

  // Marimba: sine fundamental + 4th-harmonic partial with fast decay + tiny mallet click.
  _marimba(dest, t, midi, vel, decayMul = 1, bright = 0) {
    const f = mtof(midi);
    const dec = clamp(0.95 - (midi - 60) * 0.022, 0.22, 0.95) * decayMul;
    const g1 = this._gain(dest); this._env(g1.gain, t, vel, 0.003, dec);
    this._osc('sine', f, t, t + dec + 0.05, g1);
    const g2 = this._gain(dest); this._env(g2.gain, t, vel * (0.32 + bright * 0.25), 0.002, 0.07 + bright * 0.05);
    this._osc('sine', f * 4, t, t + 0.2, g2);
    if (f * 9.9 < 15000) {
      const g3 = this._gain(dest); this._env(g3.gain, t, vel * (0.08 + bright * 0.12), 0.001, 0.018);
      this._osc('sine', f * 9.9, t, t + 0.05, g3);
    }
  }
  _tremolo(dest, t, midi, vel, dur) {
    const r = 0.062;
    const n = Math.max(2, Math.floor(dur / r));
    for (let i = 0; i < n; i++) this._marimba(dest, t + i * r + rnd(-0.004, 0.004), midi, vel * (i === 0 ? 1 : 0.55 - 0.1 * (i % 2)) * (1 - 0.3 * i / n), i === n - 1 ? 1 : 0.5);
  }

  // Karplus–Strong pluck buffers, cached by kind+midi.
  _ksBuffer(midi, kind) {
    const key = kind + midi;
    let b = this._ks.get(key);
    if (b) return b;
    const sr = this.ctx.sampleRate, f = mtof(midi);
    const T = kind === 'bass' ? 1.3 : 0.55;
    const len = Math.floor(sr * T);
    b = this.ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const N = Math.max(2, Math.round(sr / f - 0.5));
    const t60 = kind === 'bass' ? 0.9 : 0.4;
    const decay = Math.pow(0.001, 1 / (f * t60));
    let lp = 0;
    const smoothK = kind === 'bass' ? 0.35 : 0.8;
    for (let i = 0; i < N && i < len; i++) { lp += smoothK * ((Math.random() * 2 - 1) - lp); d[i] = lp; }
    // pluck position comb (removes some harmonics like a real string plucked near the bridge)
    const pp = Math.max(1, Math.floor(N * (kind === 'bass' ? 0.22 : 0.13)));
    for (let i = N - 1; i >= pp; i--) d[i] -= d[i - pp] * 0.8;
    for (let i = N; i < len; i++) d[i] = decay * 0.5 * (d[i - N] + (i - N - 1 >= 0 ? d[i - N - 1] : 0));
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    const k = peak > 0 ? 0.9 / peak : 1;
    const fade = Math.floor(sr * 0.05);
    for (let i = 0; i < len; i++) d[i] *= k * (i > len - fade ? (len - i) / fade : 1);
    this._ks.set(key, b);
    return b;
  }
  _pluck(dest, t, midi, kind, vel, hold = 2) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._ksBuffer(midi, kind);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.setTargetAtTime(0, t + hold, 0.06);
    s.connect(g); g.connect(dest);
    s.start(t); s.stop(t + Math.min(s.buffer.duration, hold + 0.3));
  }
  _strum(dest, t, notes, vel, dir, choke, sd) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.setTargetAtTime(0, t + (choke ? 0.05 : sd * 0.95), choke ? 0.025 : 0.05);
    g.connect(dest);
    const n = notes.length, gap = choke ? 0.007 : 0.011;
    const end = t + (choke ? 0.25 : sd + 0.3);
    for (let i = 0; i < n; i++) {
      const m = notes[dir > 0 ? i : n - 1 - i];
      const s = this.ctx.createBufferSource();
      s.buffer = this._ksBuffer(m, 'jarana');
      s.connect(g); s.start(t + i * gap + rnd(0, 0.003)); s.stop(end);
    }
  }
  _noiseHit(dest, t, vel, a, d, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise; s.playbackRate.value = rate;
    const g = this._gain(dest); this._env(g.gain, t, vel, a, d);
    s.connect(g); s.start(t, Math.random() * 1.5, a + d + 0.05);
    return s;
  }
  _cajonLow(run, t, vel) {
    const g = this._gain(run._cajL); this._env(g.gain, t, vel, 0.002, 0.2);
    const o = this._osc('sine', 120, t, t + 0.3, g);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.07);
    this._noiseHit(run._cajL, t, vel * 0.5, 0.001, 0.05);
  }
  _cajonSlap(run, t, vel) {
    this._noiseHit(run._cajS, t, vel * 0.9, 0.001, 0.07);
    const g = this._gain(run._cajS); this._env(g.gain, t, vel * 0.4, 0.001, 0.04);
    this._osc('triangle', 330, t, t + 0.08, g);
  }
  _filter(type, f, q, dest) {
    const b = this.ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q;
    if (dest) b.connect(dest);
    return b;
  }

  // ---------- SFX ----------
  sfx(name, opts = {}) {
    if (!this.ctx || this._muted || this.ctx.state !== 'running') return;
    const fn = this['_sfx_' + name];
    if (!fn) { console.warn('[AudioFX] unknown sfx', name); return; }
    fn.call(this, this.ctx.currentTime + 0.005, opts, this._sfxBus);
  }

  _sfx_collect(t0, o, out) {
    // keep rapid pickups from stacking into one blob
    const t = Math.max(t0, this._lastCollectT + 0.035);
    this._lastCollectT = t;
    const combo = Math.max(0, (o.combo | 0));
    const m = PENTA[combo % PENTA.length];
    const bus = this._gain(out); bus.gain.value = 1; bus.connect(this._sfxRev);
    this._marimba(bus, t, m, 0.55, 0.8, 1);
    this._marimba(bus, t + 0.045, m + 12, 0.22, 0.6, 1);
    // sparkle: two detuned high pings + airy tick
    const sp = this._gain(bus); this._env(sp.gain, t + 0.02, 0.06, 0.002, 0.18);
    this._osc('sine', mtof(m + 24) * 1.003, t + 0.02, t + 0.25, sp);
    if (mtof(m + 31) < 15000) this._osc('sine', mtof(m + 31), t + 0.02, t + 0.25, sp);
    const hp = this._filter('highpass', 7000, 0.7, bus);
    this._noiseHit(hp, t, 0.12, 0.001, 0.04);
  }
  _sfx_jump(t, o, out) {
    const g = this._gain(out); this._env(g.gain, t, 0.28, 0.005, 0.2);
    const os = this._osc('triangle', 260, t, t + 0.25, g);
    os.frequency.exponentialRampToValueAtTime(820, t + 0.14);
    const g2 = this._gain(out); this._env(g2.gain, t, 0.08, 0.004, 0.12);
    const o2 = this._osc('square', 520, t, t + 0.15, this._filter('lowpass', 2200, 0.7, g2));
    o2.frequency.exponentialRampToValueAtTime(1640, t + 0.12);
    const bp = this._filter('bandpass', 900, 0.8, out);
    bp.frequency.exponentialRampToValueAtTime(3500, t + 0.18);
    this._noiseHit(bp, t, 0.16, 0.02, 0.14);
  }
  _sfx_land(t, o, out) {
    const s = clamp(o.strength == null ? 0.6 : o.strength, 0, 1);
    const g = this._gain(out); this._env(g.gain, t, 0.25 + 0.45 * s, 0.003, 0.12 + 0.1 * s);
    const os = this._osc('sine', 130 + 40 * s, t, t + 0.3, g);
    os.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    const lp = this._filter('lowpass', 700 + 900 * s, 0.6, out);
    this._noiseHit(lp, t, 0.2 + 0.3 * s, 0.002, 0.06 + 0.05 * s);
  }
  _sfx_lane(t, o, out) {
    const bp = this._filter('bandpass', 700, 1.4);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.11);
    let dest = out;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.setValueAtTime(-0.4 * (o.dir || 0), t); p.pan.linearRampToValueAtTime(0.5 * (o.dir || 0), t + 0.13); p.connect(out); dest = p; }
    bp.connect(dest);
    this._noiseHit(bp, t, 0.5, 0.025, 0.1);
    const g = this._gain(dest); this._env(g.gain, t, 0.06, 0.01, 0.08);
    const os = this._osc('sine', 500, t, t + 0.12, g);
    os.frequency.exponentialRampToValueAtTime(900, t + 0.1);
  }
  _sfx_stumble(t, o, out) {
    // woody "tok-tok" + descending bonk
    const notes = [[0, 76], [0.09, 70]];
    for (const [dt, m] of notes) this._marimba(out, t + dt, m, 0.45, 0.35);
    const g = this._gain(out); this._env(g.gain, t, 0.3, 0.004, 0.25);
    const os = this._osc('triangle', 420, t, t + 0.32, this._filter('lowpass', 1500, 2, g));
    os.frequency.exponentialRampToValueAtTime(160, t + 0.25);
    this._sfx_land(t, { strength: 0.5 }, out);
  }
  _sfx_splash(t, o, out) {
    const lp = this._filter('lowpass', 5000, 0.8, out);
    lp.frequency.setValueAtTime(5500, t);
    lp.frequency.exponentialRampToValueAtTime(350, t + 0.7);
    this._noiseHit(lp, t, 0.75, 0.008, 0.65);
    const hp = this._filter('highpass', 2500, 0.7, out);
    this._noiseHit(hp, t, 0.25, 0.004, 0.18);
    // plop
    const g = this._gain(out); this._env(g.gain, t, 0.45, 0.003, 0.18);
    const os = this._osc('sine', 220, t, t + 0.25, g);
    os.frequency.exponentialRampToValueAtTime(70, t + 0.15);
    // bubbles: tiny upward-chirping sines
    for (let i = 0; i < 9; i++) {
      const bt = t + 0.08 + Math.pow(Math.random(), 0.8) * 0.8;
      const f = rnd(450, 1100);
      const bg = this._gain(out); this._env(bg.gain, bt, rnd(0.05, 0.13) * (1 - (bt - t) * 0.6), 0.002, rnd(0.03, 0.06));
      const bo = this._osc('sine', f, bt, bt + 0.09, bg);
      bo.frequency.exponentialRampToValueAtTime(f * rnd(1.8, 2.6), bt + 0.05);
    }
  }
  _sfx_crash(t, o, out) {
    // cartoony thud
    const g = this._gain(out); this._env(g.gain, t, 0.95, 0.002, 0.35);
    const os = this._osc('sine', 110, t, t + 0.45, g);
    os.frequency.exponentialRampToValueAtTime(38, t + 0.2);
    const lp = this._filter('lowpass', 1300, 0.8, out);
    this._noiseHit(lp, t, 0.7, 0.002, 0.16);
    this._marimba(out, t, 52, 0.4, 0.5); // woody body
    // wobble: vibrato tone sliding down ("boiinng")
    const wg = this._gain(out);
    wg.gain.setValueAtTime(0, t + 0.06);
    wg.gain.linearRampToValueAtTime(0.22, t + 0.1);
    wg.gain.exponentialRampToValueAtTime(EPS, t + 0.95);
    const wo = this._osc('triangle', 380, t + 0.06, t + 1, this._filter('lowpass', 1800, 3, wg));
    wo.frequency.exponentialRampToValueAtTime(190, t + 0.95);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(45, t);
    lfoGain.gain.linearRampToValueAtTime(15, t + 0.95);
    lfoGain.connect(wo.frequency);
    this._osc('sine', 11, t + 0.06, t + 1, lfoGain);
    // little stars twinkle
    for (let i = 0; i < 3; i++) this._marimba(out, t + 0.25 + i * 0.09, [91, 95, 98][i], 0.12, 0.5);
  }
  _sfx_start(t, o, out) {
    const bus = this._gain(out); bus.gain.value = 1; bus.connect(this._sfxRev);
    [67, 71, 74, 79].forEach((m, i) => this._marimba(bus, t + i * 0.075, m, 0.45, 0.8, 0.5));
    this._tremolo(bus, t + 0.3, 83, 0.4, 0.45);
    this._tremolo(bus, t + 0.3, 79, 0.25, 0.45);
    this._strum(bus, t + 0.3, [55, 59, 62, 67, 71], 0.45, 1, 0, 0.5);
    this._pluck(bus, t + 0.3, 43, 'bass', 0.8, 0.8);
  }
  _sfx_gameover(t, o, out) {
    const bus = this._gain(out); bus.gain.value = 1; bus.connect(this._sfxRev);
    const seq = [[0, 74], [0.2, 72], [0.4, 69], [0.6, 66]];
    for (const [dt, m] of seq) this._marimba(bus, t + dt, m, 0.42, 1, 0.3);
    this._strum(bus, t + 0.85, [57, 60, 62, 66], 0.3, 1, 0, 0.3);
    this._pluck(bus, t + 0.85, 50, 'bass', 0.6, 0.5);
    this._tremolo(bus, t + 1.2, 67, 0.32, 0.7);
    this._tremolo(bus, t + 1.2, 59, 0.22, 0.7);
    this._pluck(bus, t + 1.2, 43, 'bass', 0.8, 1.2);
    // sad trombone-ish slide under it
    const g = this._gain(bus);
    g.gain.setValueAtTime(0, t + 0.85); g.gain.linearRampToValueAtTime(0.07, t + 0.95); g.gain.exponentialRampToValueAtTime(EPS, t + 1.9);
    const os = this._osc('sawtooth', mtof(62), t + 0.85, t + 2, this._filter('lowpass', 900, 1, g));
    os.frequency.exponentialRampToValueAtTime(mtof(55), t + 1.8);
  }
  _sfx_newbest(t, o, out) {
    const bus = this._gain(out); bus.gain.value = 1; bus.connect(this._sfxRev);
    PENTA.slice(0, 8).forEach((m, i) => this._marimba(bus, t + i * 0.05, m, 0.32 + i * 0.02, 0.6, 1));
    const tt = t + 0.45;
    this._tremolo(bus, tt, 91, 0.35, 0.6);
    this._tremolo(bus, tt, 86, 0.28, 0.6);
    this._tremolo(bus, tt, 83, 0.24, 0.6);
    this._strum(bus, tt, [55, 59, 62, 67, 71], 0.5, 1, 0, 0.6);
    this._pluck(bus, tt, 43, 'bass', 0.8, 0.9);
    for (let i = 0; i < 6; i++) {
      const st = tt + 0.05 + i * 0.07;
      const g = this._gain(bus); this._env(g.gain, st, 0.05, 0.002, 0.12);
      this._osc('sine', mtof(PENTA[(i * 3) % PENTA.length] + 24), st, st + 0.15, g);
    }
  }
  _sfx_click(t, o, out) {
    this._marimba(out, t, 84, 0.3, 0.15, 0.6);
    const bp = this._filter('bandpass', 3500, 1.5, out);
    this._noiseHit(bp, t, 0.12, 0.001, 0.015);
  }
  _sfx_whoosh(t, o, out) {
    const d = o.duration || 0.45;
    const bp = this._filter('bandpass', 300, 1.1);
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + d * 0.45);
    bp.frequency.exponentialRampToValueAtTime(600, t + d);
    let dest = out;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.setValueAtTime(-0.6, t); p.pan.linearRampToValueAtTime(0.6, t + d); p.connect(out); dest = p; }
    bp.connect(dest);
    const g = this._gain(bp);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.55, t + d * 0.45); g.gain.exponentialRampToValueAtTime(EPS, t + d);
    const s = this.ctx.createBufferSource(); s.buffer = this._noise; s.connect(g); s.start(t, Math.random(), d + 0.05);
  }
}

export default AudioFX;
