// Mirio: renderer settings, and a governor that trades resolution for a
// smooth frame rate on phones.

import * as THREE from 'three';

/**
 * A first guess at what the device can draw, before any frame is measured:
 * 0 = a weak phone, 1 = a phone or tablet, 2 = a computer. buildScene uses it
 * for the decoration density, the governor for its starting resolution.
 */
export function deviceTier() {
  if (typeof window === 'undefined') return 2;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = navigator.hardwareConcurrency || 4;
  // Chrome only; Safari and Firefox leave it undefined.
  const memory = navigator.deviceMemory || 4;
  const small = Math.min(screen.width, screen.height) < 600;
  if (coarse && (cores <= 4 || memory <= 2)) return 0;
  if (coarse || small) return 1;
  return 2;
}

/** Colour output for the toon-and-felt-pen look. Call once after creating the renderer. */
export function tuneRenderer(renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral keeps Miro's marker colours saturated (ACES and AgX wash them
  // out) and only rounds off what the lights push past white.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x0a0820, 1);
  return renderer;
}

// Pixel ratios the governor steps through.
const STEPS = [0.6, 0.7, 0.85, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
// Starting resolution cap per device tier.
const START = [1, 1.5, 2];
// Frame times are averaged over this many seconds before a decision.
const WINDOW = 1;
// Slower than ~48 fps is struggling; faster than ~57 fps has room to spare.
const SLOW = 1 / 48;
const FAST = 1 / 57;
// Fast windows in a row before a higher resolution is tried.
const RAISE_AFTER = 4;
// A lower resolution that did not help (a 30 Hz power-saving cap, or a
// busy CPU) is not tried again for this long.
const FLOOR_TIMEOUT = 60;
// One shader/fullscreen hitch is noise. Several very slow frames in a row
// are a struggling renderer and must not be discarded forever.
const HITCH = 0.25;
const VERY_SLOW = 0.1;
const SLOW_CONFIRM = 3;

/**
 * Adapts resolution and optional scenery to hold the frame rate. Call
 * update() with raw frame time while active. `level`: 2 = full quality,
 * 1 = reduced resolution, 0 = lightweight scenery. `onChange(level)`
 * fires when it changes; pass it on to world.setQuality().
 */
export class QualityGovernor {
  constructor(renderer, {
    tier = deviceTier(),
    maxPixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2),
    minPixelRatio = 0.6,
    onChange = null,
  } = {}) {
    this.renderer = renderer;
    this.onChange = onChange;
    this.steps = STEPS.filter((s) => s >= minPixelRatio && s < maxPixelRatio - 0.01);
    this.steps.push(maxPixelRatio);
    const start = Math.min(maxPixelRatio, START[tier] ?? 2);
    this.start = Math.max(0, this.steps.findLastIndex((s) => s <= start + 1e-6));
    this.index = this.start;
    this.ceiling = this.steps.length - 1;
    this.floor = 0;
    this.floorTimer = 0;
    this.sum = 0;
    this.frames = 0;
    this.fastRuns = 0;
    this.probe = null;
    this.starved = false;
    this.slowFrames = 0;
    this.current = this.computeLevel();
    this.apply();
  }

  get level() {
    return this.current;
  }

  get pixelRatio() {
    return this.steps[this.index];
  }

  update(rawDt) {
    // The game does not call update while paused or hidden. A one-off gap
    // on returning, or a shader/fullscreen hitch, is not sustained load.
    if (!(rawDt > 0) || !Number.isFinite(rawDt)) {
      this.sum = 0;
      this.frames = 0;
      this.slowFrames = 0;
      return;
    }
    this.slowFrames = rawDt > VERY_SLOW ? this.slowFrames + 1 : 0;
    if (rawDt > HITCH && this.slowFrames < SLOW_CONFIRM) {
      this.sum = 0;
      this.frames = 0;
      return;
    }
    const sample = Math.min(rawDt, 1);
    if (this.floorTimer > 0) {
      this.floorTimer -= sample;
      if (this.floorTimer <= 0) this.floor = 0;
    }
    this.sum += sample;
    this.frames += 1;
    if (this.sum < WINDOW) return;
    const avg = this.sum / this.frames;
    this.sum = 0;
    this.frames = 0;
    this.judge(avg);
  }

  judge(avg) {
    const probe = this.probe;
    this.probe = null;
    if (probe?.dir < 0 && avg > probe.before * 0.93) {
      // Fewer pixels did not help: preserve sharpness and reduce the work
      // that resolution cannot remove (extra foliage, creatures, props).
      this.floor = probe.from;
      this.floorTimer = FLOOR_TIMEOUT;
      this.index = probe.from;
      this.starved = true;
      this.fastRuns = 0;
      this.apply();
      return;
    }
    if (probe?.dir > 0 && avg > SLOW) {
      this.ceiling = probe.from;
      this.index = probe.from;
      this.apply();
      return;
    }

    if (avg > SLOW) {
      this.fastRuns = 0;
      if (this.index > this.floor) {
        this.probe = { dir: -1, from: this.index, before: avg };
        this.index -= 1;
      } else {
        // A remembered resolution floor must not block the decoration
        // fallback after a brief recovery brought the extras back.
        this.starved = true;
      }
    } else if (avg < FAST) {
      this.fastRuns += 1;
      if (this.fastRuns >= RAISE_AFTER) {
        this.fastRuns = 0;
        if (this.starved) {
          this.starved = false;
        } else if (this.index < this.ceiling) {
          this.probe = { dir: 1, from: this.index, before: avg };
          this.index += 1;
        }
      }
    } else {
      this.fastRuns = 0;
    }
    this.apply();
  }

  computeLevel() {
    if (this.starved) return 0;
    return this.index >= this.start ? 2 : 1;
  }

  apply() {
    if (Math.abs(this.renderer.getPixelRatio() - this.pixelRatio) > 1e-6) this.renderer.setPixelRatio(this.pixelRatio);
    const level = this.computeLevel();
    if (level === this.current) return;
    this.current = level;
    this.onChange?.(level);
  }
}
