// Each fork shares progress with the main road, but measures its own distance.
// Renderers, physics and cameras all sample the same route frame.
import { Vector3 } from 'three';

export const RACE_STYLE = Object.freeze({ CLASSIC: 'classic', PLAYGROUND: 'playground' });
export const CLASSIC_ROAD_HALF_WIDTH = 5;
export const MAIN_ROAD_HALF_WIDTH = 5.5;
export const ROUTE = Object.freeze({ MAIN: 'main', WIND: 'wind', ORCHARD: 'orchard', CLOUD: 'cloud' });
export const FORKS = Object.freeze([
  { id: ROUTE.WIND, from: 100, to: 205, side: 1, offset: 17, width: 4.7, rise: 5, color: 0xffca55, icon: '↗', name: 'Windrad', turbo: true },
  { id: ROUTE.ORCHARD, from: 390, to: 510, side: -1, offset: 19, width: 3.7, rise: -3, color: 0x7de0a3, icon: '↖', name: 'Obstgarten' },
  { id: ROUTE.CLOUD, from: 740, to: 875, side: 1, offset: 17, width: 4.7, rise: 7, color: 0x9cceff, icon: '↗', name: 'Wolkenweg' },
]);
const SAMPLE = 0.5;
const ENTRY_LANE = 0.7;
const WIDTH_TRANSITION = 12;
const v = new Vector3();
const frame = () => ({ pos: new Vector3(), tan: new Vector3(), up: new Vector3(), right: new Vector3() });
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

class BranchTrack {
  #base;
  #fork;
  #frames;
  #start;
  #count;
  #metrics;
  #step;
  #curvature;
  #slope;

  constructor(base, fork) {
    this.#base = base;
    this.#fork = fork;
    this.#start = fork.s0;
    this.#count = Math.ceil((fork.s1 - fork.s0) / SAMPLE) + 1;
    this.#frames = [];
    this.#metrics = [];
    this.#curvature = [];
    this.#slope = [];
    const span = fork.s1 - fork.s0;
    this.#step = span / (this.#count - 1);
    for (let i = 0; i < this.#count; i++) {
      const s = Math.min(fork.s1, fork.s0 + i * this.#step);
      const f = base.frame(s, frame());
      // Flat ends keep the fork and reconnection continuous even at speed.
      const wave = Math.sin(Math.PI * (s - fork.s0) / span) ** 2;
      f.pos.addScaledVector(f.right, fork.side * fork.offset * wave).addScaledVector(f.up, fork.rise * wave);
      this.#frames.push(f);
    }
    for (let i = 0; i < this.#count; i++) {
      const a = Math.max(0, i - 1), b = Math.min(this.#count - 1, i + 1);
      const f = this.#frames[i];
      v.subVectors(this.#frames[b].pos, this.#frames[a].pos);
      this.#metrics[i] = v.length() / ((b - a) * this.#step);
      f.tan.copy(v).normalize();
      f.right.crossVectors(f.tan, f.up).normalize();
      f.up.crossVectors(f.right, f.tan).normalize();
      this.#slope[i] = -f.tan.dot(base.levelUp(fork.s0 + i * this.#step, v));
    }
    for (let i = 0; i < this.#count; i++) {
      const a = Math.max(0, i - 1), b = Math.min(this.#count - 1, i + 1);
      this.#curvature[i] = v.subVectors(this.#frames[b].tan, this.#frames[a].tan).dot(this.#frames[i].right)
        / ((b - a) * this.#step * this.#metrics[i]);
    }
  }

  #at(s) {
    return clamp((s - this.#start) / this.#step, 0, this.#count - 1.001);
  }

  #sample(values, s) {
    const at = this.#at(s), i = Math.floor(at), k = at - i;
    return values[i] * (1 - k) + values[i + 1] * k;
  }

  frame(s, out) {
    const at = this.#at(s), i = Math.floor(at), k = at - i;
    for (const key of ['pos', 'tan', 'up', 'right']) out[key].copy(this.#frames[i][key]).lerp(this.#frames[i + 1][key], k);
    out.tan.normalize(); out.up.normalize(); out.right.normalize();
    return out;
  }

  point(s, x, h, out, f = this.frame(s, frame())) {
    return out.copy(f.pos).addScaledVector(f.right, x).addScaledVector(f.up, h);
  }

  halfWidth(s) {
    const f = this.#fork;
    const t = clamp(Math.min(s - f.s0, f.s1 - s) / WIDTH_TRANSITION, 0, 1);
    const eased = t * t * (3 - 2 * t);
    const width = this.#base.halfWidth(s);
    return width + (f.width - width) * eased;
  }

  levelUp(s, out) { return this.#base.levelUp(s, out); }
  metric(s) { return this.#sample(this.#metrics, s); }
  road(s) { return { curvature: this.#sample(this.#curvature, s), slope: this.#sample(this.#slope, s) }; }
}

export class RouteNetwork {
  #base;
  #forks;

  constructor(base, { routeStyle = RACE_STYLE.PLAYGROUND } = {}) {
    this.#base = base;
    // Both races use one geometry/progress API; the classic course has no forks.
    const specs = routeStyle === RACE_STYLE.PLAYGROUND ? FORKS : [];
    this.#forks = specs.map(spec => {
      const fork = { ...spec, s0: base.sAtPsi(spec.from), s1: base.sAtPsi(spec.to) };
      fork.path = new BranchTrack(base, fork);
      return fork;
    });
  }

  get forks() { return this.#forks; }
  fork(id) { return this.#forks.find(f => f.id === id); }
  path(id) { return this.fork(id)?.path ?? this.#base; }
  metric(id, s) { return this.fork(id)?.path.metric(s) ?? 1; }
  road(id, s) {
    const fork = this.fork(id);
    if (fork) return fork.path.road(s);
    return { curvature: this.#base.value(this.#base.curv, s), slope: this.#base.value(this.#base.slope, s) };
  }

  // A failed wind launch stays on the useful lower road. No reset or time loss.
  enter(racer, previousS) {
    const forward = racer.s >= previousS;
    const fork = this.#forks.find(f => forward
      ? previousS < f.s0 && racer.s >= f.s0
      : previousS > f.s1 && racer.s <= f.s1);
    if (!fork || racer.route !== ROUTE.MAIN || racer.x * fork.side < ENTRY_LANE) return null;
    if (forward && fork.turbo && racer.turboMemory <= 0) return { type: 'route-catch', fork };
    racer.route = fork.id;
    return { type: 'route', fork };
  }

  reconcile(racer) {
    const fork = this.fork(racer.route);
    if (!fork || (racer.s >= fork.s0 && racer.s <= fork.s1)) return null;
    racer.route = ROUTE.MAIN;
    return fork;
  }

  sameRoad(a, b) {
    if (a.route === b.route) return true;
    const fork = this.fork(a.route) ?? this.fork(b.route);
    if (!fork || a.route !== ROUTE.MAIN && b.route !== ROUTE.MAIN) return false;
    // Joining ribbons overlap before their centre lines separate fully.
    const s = (a.s + b.s) / 2;
    const wave = Math.sin(Math.PI * clamp((s - fork.s0) / (fork.s1 - fork.s0), 0, 1)) ** 2;
    return Math.hypot(fork.offset, fork.rise) * wave <= this.#base.halfWidth(s) + fork.width;
  }
}
