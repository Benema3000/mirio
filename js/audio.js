// Mirio's soundstage: original adaptive music, a tiny CC0 foley library,
// and responsive synthesis. The child's artwork is completely untouched.
// Samples and their original license notices are documented in audio/CREDITS.md.

const STORAGE_KEY = 'mirio-muted';
const MIX_KEY = 'mirio-audio-mix';
const SAMPLE_NAMES = ['grass-1', 'grass-2', 'grass-3', 'stone-1', 'stone-2', 'land', 'thump', 'tap', 'cloth', 'swish', 'coins'];
const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const SCENES = {
  explore: { bpm: 116, root: 0, melody: 0.9, drums: 0.45 },
  moon: { bpm: 94, root: 0, melody: 0.68, drums: 0.15 },
  boss: { bpm: 132, root: -3, melody: 0.72, drums: 0.85 },
  race: { bpm: 144, root: 2, melody: 0.8, drums: 0.8 },
  victory: { bpm: 112, root: 0, melody: 0.9, drums: 0.35 },
};
// An original sixteen-bar call-and-response tune. Zero leaves breathing room.
const MELODY = [
  [76, 0, 79, 81, 79, 0, 76, 74], [72, 0, 0, 76, 74, 0, 0, 0],
  [77, 0, 81, 84, 81, 0, 79, 77], [76, 0, 74, 0, 72, 0, 0, 0],
  [76, 0, 79, 83, 81, 0, 79, 76], [77, 0, 79, 81, 79, 0, 77, 74],
  [74, 76, 79, 0, 77, 76, 74, 0], [72, 0, 0, 0, 0, 0, 0, 0],
  [79, 0, 84, 0, 83, 81, 79, 0], [76, 0, 79, 76, 74, 0, 72, 0],
  [81, 0, 84, 86, 84, 0, 81, 79], [77, 0, 76, 0, 74, 0, 0, 0],
  [76, 79, 81, 0, 83, 81, 79, 76], [77, 0, 81, 79, 77, 76, 74, 0],
  [74, 0, 76, 79, 77, 0, 74, 0], [72, 0, 0, 0, 0, 0, 0, 0],
];
const CHORDS = [
  [48, 60, 64, 67], [45, 60, 64, 69], [41, 60, 65, 69], [43, 59, 62, 67],
  [45, 60, 64, 69], [41, 60, 65, 69], [43, 59, 62, 67], [48, 60, 64, 67],
];
const PENTATONIC = [84, 86, 88, 91, 93, 96];

function readSaved(key, fallback) {
  try { return JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null') ?? fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* Private mode still gets audio. */ }
}
function random(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = readSaved(STORAGE_KEY, 0) === 1;
    const saved = readSaved(MIX_KEY, {});
    this.volume = Number.isFinite(saved?.volume) ? clamp(saved.volume) : 0.8;
    this.musicVolume = Number.isFinite(saved?.music) ? clamp(saved.music) : 0.6;
    this.effectsVolume = Number.isFinite(saved?.effects) ? clamp(saved.effects) : 0.85;
    this.musicOn = false;
    this.paused = false;
    this.scene = 'explore';
    this.nextScene = 'explore';
    this.bitIndex = 0;
    this.lastBit = -10;
    this.step = 0;
    this.footDistance = 0;
    this.footIndex = 0;
    this.samples = new Map();
    this.instruments = new Map();
    this.voices = new Set();
    this.cooldowns = new Map();
    this.ambient = null;
    this.planeMotor = null;
    this.planeTails = new Set();
    this.ambienceTime = 0;
    this.leafWait = 7;
  }

  /** Call from a user gesture; missing audio hardware must never stop play. */
  unlock() {
    if (!this.ctx) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return;
      try {
        this.ctx = new Context({ latencyHint: 'interactive' });
        this.buildMixer();
        this.noiseBuffer = this.makeNoise();
        this.ready = this.loadSamples();
      } catch {
        this.ctx?.close().catch(() => {});
        this.ctx = null;
        return;
      }
    }
    if (!this.paused) this.ctx.resume().catch(() => {});
    if (this.musicOn) this.beginScheduler();
  }

  buildMixer() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 12;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;
    this.master.connect(limiter).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.effectsBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.effectsBus.gain.value = this.effectsVolume;
    this.musicDuck = ctx.createGain();
    this.musicBus.connect(this.musicDuck).connect(this.master);
    this.effectsBus.connect(this.master);
    // A short, dark stereo room gives the tiny instruments a shared space.
    const room = ctx.createConvolver();
    const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 1.35), ctx.sampleRate);
    const rnd = random(719);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let smooth = 0;
      for (let i = 0; i < data.length; i++) {
        smooth = smooth * 0.5 + (rnd() * 2 - 1) * 0.5;
        data[i] = smooth * (1 - i / data.length) ** 3 * 0.4;
      }
    }
    room.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.17;
    this.musicBus.connect(room).connect(wet).connect(this.musicDuck);
  }

  async loadSamples() {
    // Failure (including offline play) leaves the synthesized layer intact.
    await Promise.allSettled(SAMPLE_NAMES.map(async (name) => {
      const response = await fetch(new URL(`../audio/${name}.mp3`, import.meta.url));
      if (!response.ok) return;
      const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
      this.samples.set(name, buffer);
    }));
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    save(STORAGE_KEY, this.muted ? 1 : 0);
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.035);
  }

  setVolume(value) { this.setMix('volume', value); }
  setMusicVolume(value) { this.setMix('musicVolume', value); }
  setEffectsVolume(value) { this.setMix('effectsVolume', value); }

  setMix(key, value) {
    if (!Number.isFinite(value)) return;
    this[key] = clamp(value);
    save(MIX_KEY, { volume: this.volume, music: this.musicVolume, effects: this.effectsVolume });
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.04);
    this.musicBus.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.04);
    this.effectsBus.gain.setTargetAtTime(this.effectsVolume, this.ctx.currentTime, 0.04);
  }

  /** Musical transitions land on a bar line instead of cutting a phrase. */
  setScene(scene) {
    if (!SCENES[scene]) return;
    this.nextScene = scene;
    if (!this.musicOn) this.scene = scene;
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    if (!this.ctx) return;
    if (this.paused) {
      clearInterval(this.timer);
      this.timer = null;
      this.engine(null);
      this.biplane(null);
      this.ambience({ active: false });
      this.stopVoices();
      this.ctx.suspend().catch(() => {});
    } else {
      this.ctx.resume().catch(() => {});
      this.nextNote = this.ctx.currentTime + 0.08;
      if (this.musicOn) this.beginScheduler();
    }
  }

  makeNoise() {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 3, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    const rnd = random(248);
    for (let i = 0; i < data.length; i++) data[i] = rnd() * 2 - 1;
    return buf;
  }

  get audible() { return Boolean(this.ctx && !this.paused && this.ctx.state !== 'closed'); }

  connectVoice(source, output, nodes, at, duration, bus = 'effects', pan = 0) {
    const destination = bus === 'music' ? this.musicBus : this.effectsBus;
    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      output.connect(panner).connect(destination);
      nodes.push(panner);
    } else output.connect(destination);
    const voice = { source, bus, nodes };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect();
      for (const node of nodes) node.disconnect();
      this.voices.delete(voice);
    };
    source.start(at);
    source.stop(at + duration + 0.03);
  }

  stopVoices(bus = null) {
    for (const voice of this.voices) {
      if (bus && voice.bus !== bus) continue;
      try { voice.source.stop(); } catch { /* An already-ended source is harmless. */ }
      // onended waits while a context is suspended. Release the graph now so
      // repeated pause/resume and teardown never retain scheduled voices.
      voice.source.onended = null;
      voice.source.disconnect();
      for (const node of voice.nodes) node.disconnect();
      this.voices.delete(voice);
    }
  }

  tone(f, dur, { type = 'sine', vol = 0.12, to = null, at = 0, attack = 0.008, bus = 'effects', pan = 0 } = {}) {
    if (!this.audible || this.voices.size > 88) return;
    const t = this.ctx.currentTime + Math.max(0, at);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = type === 'sine' ? 12000 : 2800;
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f), t);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + Math.min(attack, dur / 2));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(gain);
    this.connectVoice(osc, gain, [filter, gain], t, dur, bus, pan);
  }

  noise(dur, { vol = 0.12, from = 800, to = 3000, at = 0, q = 0.8, bus = 'effects', pan = 0 } = {}) {
    if (!this.audible || this.voices.size > 88) return;
    const t = this.ctx.currentTime + Math.max(0, at);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.007);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain);
    this.connectVoice(src, gain, [filter, gain], t, dur, bus, pan);
  }

  sample(name, { vol = 0.3, rate = 1, at = 0, pan = 0 } = {}) {
    const buffer = this.samples.get(name);
    if (!this.audible || !buffer || this.voices.size > 88) return false;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    gain.gain.value = vol;
    src.connect(gain);
    this.connectVoice(src, gain, [gain], this.ctx.currentTime + Math.max(0, at), buffer.duration / rate, 'effects', pan);
    return true;
  }

  /** Cached acoustic-style instruments; render once, transpose at playback. */
  instrumentBuffer(kind, midi = 57) {
    const anchor = 57 + Math.round((midi - 57) / 12) * 12;
    const key = `${kind}:${anchor}`;
    if (this.instruments.has(key)) return this.instruments.get(key);
    const rate = this.ctx.sampleRate;
    const duration = kind === 'pad' ? 4.8 : 2.5;
    const base = hz(anchor);
    const buffer = this.ctx.createBuffer(1, Math.ceil(rate * duration), rate);
    const data = buffer.getChannelData(0);
    const rnd = random(817 + kind.length);
    const tau = Math.PI * 2;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      const phase = tau * base * t;
      if (kind === 'mallet') {
        data[i] = (Math.sin(phase) * Math.exp(-t * 3.6) + 0.35 * Math.sin(phase * 3.99) * Math.exp(-t * 14)
          + 0.1 * Math.sin(phase * 9.93) * Math.exp(-t * 25)) * Math.min(1, t * 650) * 0.8;
      } else if (kind === 'bell') {
        data[i] = (Math.sin(phase) * Math.exp(-t * 2.8) + 0.28 * Math.sin(phase * 2.01) * Math.exp(-t * 4)
          + 0.14 * Math.sin(phase * 4.04) * Math.exp(-t * 5.7)) * Math.min(1, t * 450) * 0.7;
      } else if (kind === 'pluck') {
        data[i] = (Math.sin(phase) + 0.4 * Math.sin(phase * 2) * Math.exp(-t * 3)
          + 0.19 * Math.sin(phase * 3) * Math.exp(-t * 8) + (rnd() * 2 - 1) * 0.025 * Math.exp(-t * 80))
          * Math.exp(-t * 4.3) * Math.min(1, t * 900) * 0.7;
      } else if (kind === 'pad') {
        data[i] = (Math.sin(phase) + Math.sin(phase * 1.003) * 0.3 + Math.sin(phase * 2) * 0.14)
          * Math.min(1, t / 0.22) * Math.min(1, (duration - t) / 0.45) * 0.5;
      } else if (kind === 'bass') {
        data[i] = (Math.sin(phase) + 0.25 * Math.sin(phase * 2) + 0.07 * Math.sin(phase * 3))
          * Math.exp(-t * 3) * Math.min(1, t * 180) * 0.8;
      }
    }
    const instrument = { buffer, base };
    this.instruments.set(key, instrument);
    return instrument;
  }

  note(midi, duration, { kind = 'mallet', vol = 0.1, at = 0, bus = 'music', pan = 0 } = {}) {
    if (!this.audible || this.voices.size > 88) return;
    const { buffer, base } = this.instrumentBuffer(kind, midi);
    const t = this.ctx.currentTime + Math.max(0, at);
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = buffer;
    src.playbackRate.value = hz(midi) / base;
    const length = Math.min(duration, buffer.duration / src.playbackRate.value);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.setValueAtTime(vol, t + Math.max(0, length - 0.08));
    gain.gain.linearRampToValueAtTime(0, t + length);
    src.connect(gain);
    this.connectVoice(src, gain, [gain], t, length, bus, pan);
  }

  chime(notes, { gap = 0.08, vol = 0.13, at = 0 } = {}) {
    notes.forEach((midi, i) => this.note(midi, 0.8, { kind: 'bell', bus: 'effects', vol, at: at + i * gap, pan: (i % 3 - 1) * 0.2 }));
  }

  duck(amount = 0.4, duration = 0.6) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gain = this.musicDuck.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(amount, t + 0.04);
    gain.setValueAtTime(amount, t + duration);
    gain.linearRampToValueAtTime(1, t + duration + 0.45);
  }

  play(name) {
    if (!this.audible || this.muted) return;
    const now = this.ctx.currentTime;
    const cooldown = { skid: 0.2, bump: 0.12, land: 0.08, bit: 0.035, ring: 0.08, planeBump: 0.2, planeBoost: 0.25 }[name] ?? 0;
    if (now - (this.cooldowns.get(name) ?? -10) < cooldown) return;
    this.cooldowns.set(name, now);
    const variation = 0.96 + Math.random() * 0.08;
    switch (name) {
      case 'jump':
      case 'jump2': {
        const high = name === 'jump2';
        this.sample('cloth', { vol: 0.17, rate: high ? 1.5 : 1.3 });
        this.tone(high ? 370 : 290, 0.2, { type: 'triangle', to: high ? 850 : 650, vol: 0.11 });
        this.tone(high ? 740 : 580, 0.12, { to: high ? 1200 : 1050, vol: 0.035, at: 0.015 });
        break;
      }
      case 'triple':
        this.sample('swish', { vol: 0.2, rate: 1.2 });
        this.chime([72, 76, 79, 84], { gap: 0.055, vol: 0.14 });
        this.tone(350, 0.25, { to: 1100, type: 'triangle', vol: 0.08 });
        break;
      case 'skid':
        this.sample('grass-2', { vol: 0.24, rate: 0.75 });
        this.noise(0.23, { vol: 0.12, from: 2400, to: 700, q: 2 });
        break;
      case 'poundStart':
        this.sample('swish', { vol: 0.18, rate: 1.05 });
        this.tone(620, 0.2, { to: 170, vol: 0.075 });
        break;
      case 'pound':
      case 'slam': {
        const heavy = name === 'slam';
        this.sample('thump', { vol: heavy ? 0.62 : 0.44, rate: heavy ? 0.7 : variation });
        this.tone(heavy ? 80 : 120, heavy ? 0.6 : 0.35, { to: 36, vol: 0.2 });
        this.noise(0.25, { vol: 0.16, from: 650, to: 100 });
        this.duck(0.65, 0.15);
        break;
      }
      case 'hurt':
        this.sample('thump', { vol: 0.22, rate: 1.3 });
        this.tone(470, 0.28, { to: 140, type: 'triangle', vol: 0.12 });
        this.tone(590, 0.2, { to: 170, vol: 0.055, at: 0.03 });
        break;
      case 'roar':
        this.tone(108, 0.85, { type: 'sawtooth', to: 61, vol: 0.11, attack: 0.08 });
        this.tone(112, 0.9, { type: 'triangle', to: 66, vol: 0.1, attack: 0.1 });
        this.noise(0.8, { vol: 0.12, from: 320, to: 150, q: 0.7 });
        this.duck(0.4, 0.75);
        break;
      case 'bossJump':
        this.sample('swish', { vol: 0.2, rate: 0.75 });
        this.tone(85, 0.4, { type: 'triangle', to: 250, vol: 0.14 });
        break;
      case 'bossHit':
        this.sample('thump', { vol: 0.52, rate: 1.3 });
        this.chime([79, 84], { gap: 0.05, vol: 0.17 });
        break;
      case 'go':
        this.chime([72, 79, 84], { gap: 0.04, vol: 0.19 });
        this.tone(660, 0.32, { type: 'triangle', vol: 0.1 });
        break;
      case 'boost':
        this.sample('swish', { vol: 0.3, rate: 0.75 });
        this.tone(220, 0.48, { type: 'triangle', to: 850, vol: 0.11 });
        this.noise(0.52, { vol: 0.14, from: 700, to: 4100 });
        this.chime([79, 84, 88], { gap: 0.045, vol: 0.08, at: 0.08 });
        break;
      case 'bump':
        this.sample('tap', { vol: 0.44, rate: variation });
        this.tone(140, 0.16, { to: 65, vol: 0.11 });
        break;
      case 'bossDown':
        this.duck(0.25, 1.4);
        this.sample('thump', { vol: 0.5, rate: 0.55 });
        this.noise(1, { vol: 0.14, from: 1400, to: 180 });
        this.chime([67, 72, 76, 79, 84], { gap: 0.12, at: 0.3, vol: 0.19 });
        break;
      case 'spin':
        this.sample('swish', { vol: 0.28, rate: 1.15 });
        this.noise(0.24, { vol: 0.06, from: 800, to: 3200, pan: -0.2 });
        this.tone(580, 0.24, { to: 950, vol: 0.045, at: 0.04, pan: 0.2 });
        break;
      case 'bit': {
        if (now - this.lastBit > 1.4) this.bitIndex = 0;
        this.lastBit = now;
        const note = PENTATONIC[this.bitIndex++ % PENTATONIC.length];
        this.note(note, 0.55, { kind: 'bell', bus: 'effects', vol: 0.22 });
        this.sample('coins', { vol: 0.055, rate: 1.7 });
        break;
      }
      case 'land':
        if (!this.sample('land', { vol: 0.34, rate: variation })) this.noise(0.1, { vol: 0.11, from: 300, to: 90 });
        this.tone(100, 0.1, { to: 55, vol: 0.055 });
        break;
      case 'board':
        this.sample('tap', { vol: 0.25, rate: 0.8 });
        this.chime([72, 76, 79], { vol: 0.1 });
        break;
      case 'beep':
        this.note(81, 0.2, { kind: 'mallet', bus: 'effects', vol: 0.2 });
        this.tone(880, 0.1, { vol: 0.06 });
        break;
      case 'driftBlue':
      case 'driftOrange':
        // Distinct rising pairs announce charge without looking at the HUD.
        this.chime(name === 'driftBlue' ? [76, 83] : [83, 91], {gap: .07, vol: .12});
        break;
      case 'liftoff':
        this.duck(0.38, 1.8);
        this.chime([79, 84, 88, 91], { gap: 0.08, vol: 0.16 });
        this.tone(95, 2.1, { type: 'triangle', to: 550, vol: 0.16, attack: 0.18 });
        this.noise(2.3, { vol: 0.26, from: 180, to: 2300, at: 0.1, q: 0.5 });
        break;
      case 'flag':
        this.sample('cloth', { vol: 0.15, rate: 0.9 });
        this.chime([79, 84, 88, 91], { gap: 0.085, vol: 0.15 });
        break;
      case 'splash':
        this.noise(0.6, { vol: 0.34, from: 2100, to: 230, q: 0.5 });
        [0, 0.09, 0.19, 0.28].forEach((at, i) => this.tone(300 + i * 115, 0.17, { to: 110 + i * 40, vol: 0.1, at, pan: i % 2 ? 0.2 : -0.2 }));
        break;
      case 'arrive':
      case 'respawn':
        this.chime(name === 'arrive' ? [79, 84, 88] : [72, 79, 84], { gap: 0.11, vol: 0.14 });
        this.noise(0.3, { vol: 0.045, from: 1200, to: 3000 });
        break;
      case 'star':
      case 'trailWin':
        this.duck(0.3, 1.1);
        this.chime([72, 76, 79, 84, 88, 91, 96], { gap: 0.085, vol: 0.2 });
        [60, 64, 67, 72].forEach((n) => this.note(n, 1.6, { kind: 'pad', bus: 'effects', vol: 0.075, at: 0.5 }));
        break;
      case 'trailStart':
        this.chime([72, 76, 79, 84], { gap: 0.09, vol: 0.14 });
        this.bitIndex = 0;
        break;
      case 'ring':
        this.chime([PENTATONIC[this.bitIndex++ % PENTATONIC.length]], { vol: 0.2 });
        this.sample('swish', { vol: 0.06, rate: 1.8 });
        break;
      case 'trailFail':
        this.chime([76, 74, 72], { gap: 0.16, vol: 0.1 });
        break;
      case 'spring':
        this.sample('cloth', { vol: 0.16, rate: 1.6 });
        this.tone(190, 0.42, { type: 'triangle', to: 1150, vol: 0.13 });
        this.tone(340, 0.3, { to: 1650, vol: 0.045, at: 0.04 });
        this.chime([79, 84, 88], { gap: 0.06, at: 0.1, vol: 0.1 });
        break;
      case 'enemyNotice':
        this.note(72, 0.13, { kind: 'mallet', bus: 'effects', vol: 0.15 });
        this.note(79, 0.19, { kind: 'mallet', bus: 'effects', vol: 0.17, at: 0.12 });
        break;
      case 'enemyStun':
        this.sample('tap', { vol: 0.3, rate: 1.35 });
        this.chime([86, 81, 88, 83], { gap: 0.065, vol: 0.12 });
        this.tone(330, 0.26, { type: 'triangle', to: 125, vol: 0.085 });
        break;
      case 'enemyDefeat':
        this.sample('land', { vol: 0.28, rate: 0.8 });
        this.noise(0.22, { vol: 0.09, from: 800, to: 1800 });
        this.chime([76, 79, 84], { gap: 0.065, vol: 0.17 });
        break;
      case 'planeBoard':
        this.sample('tap', { vol: .24, rate: .85 });
        this.sample('cloth', { vol: .1, rate: 1.3, at: .05 });
        this.chime([67, 72, 76], { gap: .07, vol: .12 });
        break;
      case 'planeExit':
        this.sample('land', { vol: .18, rate: 1.15 });
        this.chime([76, 72], { gap: .1, vol: .1 });
        break;
      case 'planeBoost':
        this.sample('swish', { vol: .15, rate: 1.1 });
        this.noise(.42, { vol: .08, from: 600, to: 2100, q: .55 });
        this.tone(260, .36, { type: 'triangle', to: 620, vol: .085 });
        this.chime([79, 84, 88], { gap: .06, at: .05, vol: .075 });
        break;
      case 'planeBump':
        this.sample('land', { vol: .24, rate: .9 });
        this.sample('tap', { vol: .14, rate: 1.1 });
        this.tone(140, .15, { to: 70, vol: .08 });
        break;
      case 'click':
        this.sample('tap', { vol: 0.15, rate: 1.7 });
        break;
      default:
    }
  }

  /** Local animal voices, softened by distance and their camera-relative pan. */
  wildlife({ type, distance = 0, pan = 0, variant = 0 } = {}) {
    if (!this.audible || this.muted) return;
    const attenuation = 1 / (1 + (Math.max(0, distance) / 8) ** 2);
    if (attenuation < 0.06) return;
    pan = clamp(pan, -0.8, 0.8);
    const now = this.ctx.currentTime;
    const key = `wildlife:${type}`;
    if (now - (this.cooldowns.get(key) ?? -10) < (type === 'birdChirp' ? 0.6 : 0.3)) return;
    this.cooldowns.set(key, now);
    if (type === 'birdChirp') {
      const base = [2100, 2500, 1800][Math.abs(Math.round(variant)) % 3];
      const vol = 0.075 * attenuation;
      this.tone(base, 0.1, { to: base * 1.45, vol, pan, attack: 0.016 });
      this.tone(base * 1.2, 0.13, { to: base * 0.88, vol: vol * .8, at: .15, pan, attack: .018 });
      this.tone(base * 1.1, 0.075, { to: base * 1.38, vol: vol * .65, at: .34, pan, attack: .013 });
      if (variant === 1) this.tone(base, .1, { to: base * 1.25, vol: vol * .6, at: .48, pan });
    } else if (type === 'squirrel') {
      this.sample('cloth', { vol: 0.12 * attenuation, rate: 1.5, pan });
      this.tone(1350, .055, { to: 1850, vol: .035 * attenuation, pan });
      this.tone(1700, .05, { to: 1300, vol: .026 * attenuation, at: .085, pan });
    } else if (type === 'leafRustle') {
      this.sample('grass-3', { vol: .25 * attenuation, rate: .82, pan });
      this.noise(.35, { vol: .06 * attenuation, from: 1800, to: 650, q: .5, pan });
    }
  }

  /** A restrained moving canopy breeze. Call once per frame in the meadow. */
  ambience({ active = false, dt = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!active || this.paused) {
      if (!this.ambient) return;
      const old = this.ambient;
      old.gain.gain.setTargetAtTime(0, t, .08);
      old.source.stop(this.paused ? t : t + .4);
      if (this.paused) for (const node of old.nodes) node.disconnect();
      else old.source.onended = () => { for (const node of old.nodes) node.disconnect(); };
      this.ambient = null;
      return;
    }
    if (!this.ambient) {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      const low = this.ctx.createBiquadFilter();
      low.type = 'lowpass'; low.frequency.value = 620; low.Q.value = .45;
      const high = this.ctx.createBiquadFilter();
      high.type = 'highpass'; high.frequency.value = 160; high.Q.value = .45;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      source.connect(low).connect(high).connect(gain).connect(this.effectsBus);
      source.start();
      this.ambient = { source, low, gain, nodes: [source, low, high, gain] };
    }
    this.ambienceTime += Math.min(.1, Math.max(0, Number(dt) || 0));
    const gust = (Math.sin(this.ambienceTime * .43) + Math.sin(this.ambienceTime * .17 + 1)) * .25 + .5;
    this.ambient.gain.gain.setTargetAtTime(.018 + gust * .034, t, .5);
    this.ambient.low.frequency.setTargetAtTime(460 + gust * 560, t, .8);
    this.leafWait -= Math.min(.1, Math.max(0, Number(dt) || 0));
    if (this.leafWait <= 0) {
      this.leafWait = 9 + Math.random() * 9;
      if (!this.muted) this.noise(.7, { vol: .035, from: 1600, to: 450, q: .5, pan: Math.sin(this.ambienceTime) * .65 });
    }
  }

  /** Distance-based cadence stays consistent at any rendering frame rate. */
  footstep({ speed = 0, surface = 'grass', grounded = false, dt = 0 } = {}) {
    if (!grounded || speed < 1 || !this.audible || this.muted) { this.footDistance = 0; return; }
    this.footDistance += Math.min(0.1, Math.max(0, dt)) * speed;
    if (this.footDistance < 2.3) return;
    this.footDistance %= 2.3;
    const stone = surface === 'stone' || surface === 'moon';
    const index = this.footIndex++ % (stone ? 2 : 3) + 1;
    this.sample(`${stone ? 'stone' : 'grass'}-${index}`, {
      vol: clamp(speed / 40, 0.08, 0.26), rate: 0.95 + Math.random() * 0.12,
      pan: this.footIndex % 2 ? -0.08 : 0.08,
    });
  }

  /** A layered little motor, with tire/wind noise tied to road speed. */
  engine(state) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!state || this.paused) {
      if (!this.motor) return;
      const old = this.motor;
      old.gain.gain.setTargetAtTime(0, t, 0.04);
      for (const source of old.sources) source.stop(this.paused ? t : t + 0.2);
      if (this.paused) {
        for (const node of old.nodes) node.disconnect();
      } else {
        old.sources[0].onended = () => { for (const node of old.nodes) node.disconnect(); };
      }
      this.motor = null;
      return;
    }
    if (!this.motor) {
      const low = this.ctx.createOscillator();
      const high = this.ctx.createOscillator();
      low.type = 'triangle';
      high.type = 'sawtooth';
      const mix = this.ctx.createGain();
      mix.gain.value = 0.2;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.6;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const wind = this.ctx.createBufferSource();
      wind.buffer = this.noiseBuffer;
      wind.loop = true;
      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      const windGain = this.ctx.createGain();
      windGain.gain.value = 0;
      high.connect(mix).connect(filter);
      low.connect(filter);
      filter.connect(gain).connect(this.effectsBus);
      wind.connect(windFilter).connect(windGain).connect(gain);
      const sources = [low, high, wind];
      for (const source of sources) source.start();
      this.motor = { low, high, filter, gain, windGain, windFilter, sources,
        nodes: [low, high, mix, filter, gain, wind, windFilter, windGain] };
    }
    const speed = clamp(Math.abs(Number(state.speed) || 0), 0, 90);
    const gas = clamp(Number(state.gas) || 0);
    // Slightly stagger the pitch response for a soft mechanical growl.
    const pitch = 42 + speed * 2.8 + gas * 22;
    const motor = this.motor;
    motor.low.frequency.setTargetAtTime(pitch, t, 0.1);
    motor.high.frequency.setTargetAtTime(pitch * 2.008, t, 0.13);
    motor.filter.frequency.setTargetAtTime(210 + speed * 16 + gas * 380, t, 0.1);
    motor.windFilter.frequency.setTargetAtTime(550 + speed * 24, t, 0.15);
    motor.windGain.gain.setTargetAtTime(speed / 85, t, 0.15);
    motor.gain.gain.setTargetAtTime(0.026 + gas * 0.045, t, 0.08);
  }

  /** A gentle wooden propeller: a rounded hum, soft blade pulses and air.
   * Pass world speed plus throttle/boost in 0..1 while riding; null or
   * active:false fades out. This has its own graph, independent of the kart. */
  biplane(state) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!state || state.active === false || this.paused) {
      if (this.planeMotor) {
        const old = this.planeMotor;
        this.planeMotor = null;
        old.gain.gain.setTargetAtTime(0, t, .045);
        this.planeTails.add(old);
        old.sources[0].onended = old.release;
        for (const source of old.sources) source.stop(this.paused ? t : t + .22);
      }
      if (this.paused) {
        // A normal exit keeps a short release tail. A pause/teardown also
        // releases tails from a recent exit before the audio clock stops.
        for (const motor of [...this.planeTails]) {
          for (const source of motor.sources) { try { source.stop(t); } catch { /* Already finished. */ } }
          motor.release();
        }
      }
      return;
    }
    if (!this.planeMotor) {
      const low = this.ctx.createOscillator();
      low.type = 'triangle'; low.frequency.value = 40;
      const harmonic = this.ctx.createOscillator();
      harmonic.type = 'sine'; harmonic.frequency.value = 80.12;
      const harmonicGain = this.ctx.createGain();
      harmonicGain.gain.value = .18;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.Q.value = .4; filter.frequency.value = 220;
      const pulse = this.ctx.createOscillator();
      pulse.type = 'sine'; pulse.frequency.value = 11;
      const pulseDepth = this.ctx.createGain();
      pulseDepth.gain.value = .16;
      const bladeGain = this.ctx.createGain();
      bladeGain.gain.value = .78;
      const wind = this.ctx.createBufferSource();
      wind.buffer = this.noiseBuffer; wind.loop = true;
      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'bandpass'; windFilter.Q.value = .45; windFilter.frequency.value = 520;
      const windGain = this.ctx.createGain();
      windGain.gain.value = 0;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      low.connect(filter);
      harmonic.connect(harmonicGain).connect(filter);
      filter.connect(bladeGain).connect(gain);
      pulse.connect(pulseDepth).connect(bladeGain.gain);
      wind.connect(windFilter).connect(windGain).connect(gain);
      gain.connect(this.effectsBus);
      const sources = [low, harmonic, pulse, wind];
      const nodes = [...sources, harmonicGain, filter, pulseDepth, bladeGain, windFilter, windGain, gain];
      const motor = { low, harmonic, pulse, filter, pulseDepth, windFilter, windGain, gain, sources, nodes };
      motor.release = () => {
        for (const source of sources) source.onended = null;
        for (const node of nodes) node.disconnect();
        this.planeTails.delete(motor);
      };
      this.planeMotor = motor;
      for (const source of sources) source.start(t);
    }
    const speed = clamp(Math.abs(Number(state.speed) || 0), 0, 50);
    const throttle = clamp(Number(state.throttle) || 0);
    const boost = clamp(Number(state.boost) || 0);
    const pitch = 40 + speed * 1.05 + throttle * 10 + boost * 12;
    const motor = this.planeMotor;
    motor.low.frequency.setTargetAtTime(pitch, t, .16);
    motor.harmonic.frequency.setTargetAtTime(pitch * 2.003, t, .2);
    motor.pulse.frequency.setTargetAtTime(11 + speed * .38 + throttle * 4 + boost * 5, t, .16);
    motor.pulseDepth.gain.setTargetAtTime(.16 + throttle * .04 + boost * .025, t, .18);
    motor.filter.frequency.setTargetAtTime(220 + speed * 9 + throttle * 90 + boost * 110, t, .2);
    motor.windFilter.frequency.setTargetAtTime(520 + speed * 16 + boost * 260, t, .25);
    motor.windGain.gain.setTargetAtTime(.008 + speed * .0014 + boost * .035, t, .22);
    motor.gain.gain.setTargetAtTime(.012 + throttle * .026 + speed * .00024 + boost * .012, t, .12);
  }

  startMusic() {
    if (this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.scene = this.nextScene;
    this.beginScheduler();
  }

  beginScheduler() {
    if (!this.ctx || this.paused || this.timer) return;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
    this.schedule();
  }

  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
    this.timer = null;
    this.stopVoices('music');
  }

  /** Keep only 180 ms queued: a background tab never bursts old notes. */
  schedule() {
    if (!this.audible || !this.musicOn || this.ctx.state === 'suspended') return;
    if (this.nextNote < this.ctx.currentTime) this.nextNote = this.ctx.currentTime + 0.04;
    while (this.nextNote < this.ctx.currentTime + 0.18) {
      const beat = this.step % 8;
      if (beat === 0) this.scene = this.nextScene;
      const scene = SCENES[this.scene];
      const eighth = 30 / scene.bpm;
      const bar = Math.floor(this.step / 8) % MELODY.length;
      const cycle = Math.floor(this.step / (MELODY.length * 8));
      const transpose = (n) => n + scene.root - (this.scene === 'boss' && [4, 9].includes(n % 12) ? 1 : 0);
      const chord = CHORDS[bar % CHORDS.length].map(transpose);
      const at = this.nextNote - this.ctx.currentTime;
      const soft = this.scene === 'moon';
      // Alternate lead octaves and leave the opening of alternate phrases open.
      const raw = MELODY[bar][beat];
      const melody = raw ? transpose(raw) - (this.scene === 'boss' ? 12 : 0) : 0;
      if (melody && !(soft && beat % 2 === 1) && !(cycle % 3 === 2 && bar < 4)) {
        this.note(melody, eighth * 2.5, { kind: soft ? 'bell' : 'mallet', vol: 0.115 * scene.melody, at, pan: -0.14 });
      }
      if (beat % 2 === 0) {
        const bass = chord[0] + (beat === 4 ? 7 : 0);
        this.note(bass, eighth * 1.65, { kind: 'bass', vol: soft ? 0.08 : 0.14, at, pan: 0 });
      }
      if (beat === 0) {
        chord.slice(1).forEach((midi, i) => this.note(midi, eighth * 7.4, {
          kind: 'pad', vol: soft ? 0.024 : 0.019, at: at + i * 0.014, pan: (i - 1) * 0.4,
        }));
      }
      if (beat % 2 === 1 || this.scene === 'race') {
        const pitch = chord[1 + ((beat + bar) % 3)] + (soft ? 12 : 0);
        this.note(pitch, eighth * 1.8, { kind: 'pluck', vol: soft ? 0.05 : 0.055, at: at + 0.012, pan: 0.3 });
      }
      if (beat === 0 || (beat === 4 && !soft)) {
        this.tone(112, 0.15, { to: 46, vol: scene.drums * 0.12, at, bus: 'music' });
      }
      if (beat === 2 || beat === 6) {
        this.noise(0.085, { vol: scene.drums * 0.1, from: 1900, to: 1300, at, q: 0.65, bus: 'music', pan: -0.2 });
        this.tone(180, 0.06, { to: 110, vol: scene.drums * 0.04, at, bus: 'music' });
      }
      if (!soft && beat % 2 === 1) {
        this.noise(0.038, { vol: scene.drums * 0.06, from: 6200, to: 4800, at, q: 0.7, bus: 'music', pan: 0.32 });
      }
      // Quiet chirping details make the home planet feel alive.
      if (this.scene === 'explore' && bar % 4 === 1 && beat === 5) {
        this.tone(2100, 0.12, { to: 3100, vol: 0.018, at, bus: 'music', pan: 0.65 });
        this.tone(2600, 0.1, { to: 1900, vol: 0.012, at: at + 0.17, bus: 'music', pan: 0.65 });
      }
      this.step++;
      this.nextNote += eighth;
    }
  }

  /** Optional teardown for embeds and tests. */
  dispose() {
    this.paused = true;
    this.stopMusic();
    this.engine(null);
    this.biplane(null);
    this.ambience({ active: false });
    this.stopVoices();
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
