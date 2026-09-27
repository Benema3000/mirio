// Mirio: every sound is synthesised with WebAudio, so there are no audio
// files to load. The tune is an original eight-bar loop in C major, written
// for this game.
//
// Browsers only allow audio after a user gesture: unlock() runs from the
// start button.

const STORAGE_KEY = 'mirio-muted';
const TEMPO = 132;
const EIGHTH = 60 / TEMPO / 2;

// [note, length in eighths]; 'r' is a rest.
const MELODY = [
  ['E5', 1], ['G5', 1], ['C6', 2], ['B5', 1], ['G5', 1], ['E5', 2],
  ['F5', 1], ['A5', 1], ['C6', 2], ['A5', 2], ['F5', 2],
  ['G5', 1], ['B5', 1], ['D6', 2], ['C6', 1], ['B5', 1], ['G5', 2],
  ['E5', 2], ['G5', 2], ['C6', 4],
  ['A5', 1], ['C6', 1], ['E6', 2], ['D6', 1], ['C6', 1], ['A5', 2],
  ['F5', 1], ['A5', 1], ['D6', 2], ['C6', 2], ['A5', 2],
  ['G5', 1], ['A5', 1], ['B5', 1], ['D6', 1], ['C6', 1], ['B5', 1], ['A5', 1], ['G5', 1],
  ['C6', 4], ['r', 4],
];
const BASS_ROOTS = ['C3', 'F2', 'G2', 'C3', 'A2', 'D3', 'G2', 'C3'];
const BIT_NOTES = ['C6', 'D6', 'E6', 'G6', 'A6'];

function freq(note) {
  const names = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const semis = names[note[0]] + (Number(note.slice(1)) - 4) * 12;
  return 440 * 2 ** (semis / 12);
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    this.musicOn = false;
    this.bitIndex = 0;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise();
    }
    this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }

  makeNoise() {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  tone(f, dur, { type = 'square', vol = 0.15, to = null, at = 0, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, { vol = 0.2, from = 800, to = 3000, at = 0, q = 1.5 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  play(name) {
    switch (name) {
      case 'jump':
        this.tone(330, 0.18, { to: 760, vol: 0.09 });
        break;
      case 'jump2':
        this.tone(392, 0.18, { to: 900, vol: 0.09 });
        break;
      case 'triple':
        // A rising "wa-hoo" for the triple jump.
        ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => this.tone(freq(n), 0.14, { type: 'square', vol: 0.08, at: i * 0.06 }));
        this.tone(freq('E6'), 0.4, { type: 'triangle', vol: 0.12, at: 0.24 });
        break;
      case 'skid':
        this.noise(0.25, { vol: 0.18, from: 2200, to: 900, q: 3 });
        break;
      case 'poundStart':
        this.noise(0.25, { vol: 0.15, from: 600, to: 2400 });
        break;
      case 'pound':
        this.tone(140, 0.25, { to: 45, vol: 0.3 });
        this.noise(0.2, { vol: 0.3, from: 400, to: 80 });
        break;
      case 'hurt':
        this.tone(520, 0.35, { to: 140, type: 'sawtooth', vol: 0.12 });
        break;
      case 'roar':
        this.tone(110, 1.0, { type: 'sawtooth', to: 70, vol: 0.18 });
        this.noise(0.9, { vol: 0.2, from: 300, to: 120, q: 0.7 });
        break;
      case 'bossJump':
        this.tone(90, 0.5, { type: 'square', to: 240, vol: 0.12 });
        break;
      case 'slam':
        this.tone(70, 0.6, { to: 35, vol: 0.35 });
        this.noise(0.5, { vol: 0.35, from: 500, to: 60, q: 0.6 });
        break;
      case 'bossHit':
        this.tone(700, 0.2, { type: 'square', to: 300, vol: 0.14 });
        this.tone(200, 0.3, { type: 'sawtooth', to: 90, vol: 0.14, at: 0.05 });
        break;
      case 'go':
        this.tone(1320, 0.5, { type: 'square', vol: 0.1 });
        this.tone(660, 0.5, { type: 'triangle', vol: 0.12 });
        break;
      case 'boost':
        this.tone(300, 0.6, { type: 'sawtooth', to: 1200, vol: 0.08 });
        this.noise(0.6, { vol: 0.2, from: 600, to: 4000 });
        break;
      case 'bump':
        this.tone(160, 0.18, { type: 'square', to: 80, vol: 0.15 });
        break;
      case 'bossDown':
        ['G4', 'E4', 'C4', 'G3'].forEach((n, i) => this.tone(freq(n), 0.3, { type: 'sawtooth', vol: 0.1, at: i * 0.18 }));
        this.noise(1.2, { vol: 0.2, from: 3000, to: 200, at: 0.4 });
        break;
      case 'spin':
        this.noise(0.32, { vol: 0.25, from: 500, to: 2600 });
        break;
      case 'bit': {
        // Climbs the pentatonic scale while you collect in a row.
        const note = BIT_NOTES[this.bitIndex++ % BIT_NOTES.length];
        this.tone(freq(note), 0.12, { type: 'sine', vol: 0.22 });
        this.tone(freq(note) * 2, 0.18, { type: 'sine', vol: 0.1, at: 0.05 });
        break;
      }
      case 'land':
        this.noise(0.08, { vol: 0.12, from: 250, to: 90 });
        break;
      case 'board':
        this.tone(520, 0.22, { type: 'triangle', to: 780, vol: 0.14 });
        break;
      case 'beep':
        this.tone(880, 0.14, { type: 'square', vol: 0.08 });
        break;
      case 'liftoff':
        this.tone(1320, 0.3, { type: 'square', vol: 0.08 });
        this.tone(160, 2.2, { type: 'triangle', to: 1100, vol: 0.2, at: 0.1 });
        this.noise(2.0, { vol: 0.2, from: 300, to: 3500, at: 0.1 });
        break;
      case 'flag':
        ['G5', 'C6', 'E6', 'G6'].forEach((n, i) => this.tone(freq(n), 0.16, { type: 'square', vol: 0.07, at: i * 0.07 }));
        break;
      case 'splash':
        this.noise(0.45, { vol: 0.35, from: 1400, to: 180, q: 0.8 });
        this.tone(320, 0.35, { type: 'sine', to: 110, vol: 0.18 });
        break;
      case 'arrive':
        ['G5', 'C6', 'E6'].forEach((n, i) => this.tone(freq(n), 0.2, { type: 'triangle', vol: 0.12, at: i * 0.08 }));
        break;
      case 'respawn':
        this.tone(440, 0.4, { type: 'sine', to: 880, vol: 0.15 });
        break;
      case 'star':
        ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'].forEach((n, i) => this.tone(freq(n), 0.25, { type: 'square', vol: 0.08, at: i * 0.1 }));
        ['C5', 'E5', 'G5', 'C6'].forEach((n) => this.tone(freq(n), 1.6, { type: 'triangle', vol: 0.12, at: 0.65, attack: 0.05 }));
        break;
      default:
    }
  }

  /**
   * The kart's engine: a low buzz whose pitch follows `speed` and whose
   * loudness follows `gas` (0..1). Call every frame while it runs; `null`
   * fades it out.
   */
  engine(state) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!state) {
      if (!this.motor) return;
      this.motor.gain.gain.setTargetAtTime(0, t, 0.08);
      this.motor.osc.stop(t + 0.5);
      this.motor = null;
      return;
    }
    if (!this.motor) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start();
      this.motor = { osc, filter, gain };
    }
    const { speed, gas } = state;
    this.motor.osc.frequency.setTargetAtTime(50 + speed * 5 + gas * 15, t, 0.08);
    this.motor.filter.frequency.setTargetAtTime(350 + speed * 35 + gas * 450, t, 0.08);
    this.motor.gain.gain.setTargetAtTime(0.025 + gas * 0.05, t, 0.1);
  }

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 100);
  }

  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
  }

  /** Schedules the next half second of the loop, one eighth at a time. */
  schedule() {
    const total = MELODY.reduce((n, [, len]) => n + len, 0);
    // Back from a background tab the clock has run on: skip, don't burst.
    if (this.nextNote < this.ctx.currentTime) this.nextNote = this.ctx.currentTime + 0.05;
    while (this.nextNote < this.ctx.currentTime + 0.5) {
      const at = this.nextNote - this.ctx.currentTime;
      const pos = this.step % total;
      let acc = 0;
      for (const [note, len] of MELODY) {
        if (acc === pos && note !== 'r') this.tone(freq(note), len * EIGHTH * 0.9, { type: 'square', vol: 0.035, at });
        acc += len;
      }
      const bar = Math.floor(pos / 8);
      const beat = pos % 8;
      if (beat % 2 === 0) {
        const root = freq(BASS_ROOTS[bar]);
        this.tone(beat % 4 === 0 ? root : root * 1.5, EIGHTH * 1.6, { type: 'triangle', vol: 0.09, at });
      }
      this.nextNote += EIGHTH;
      this.step += 1;
    }
  }
}
