// Damai, a friendly pug who shows Mirio the way through the desert and the
// forest. Two halves: the model with its poses (three.js), and DamaiGuide,
// the route logic, which is plain numbers so it runs and tests without a
// screen.
//
// The route is a list of points {s, x, z, h, hop?} ordered by `s`, the
// distance along it in metres; x/z are local ground coordinates and h the
// ground height. `hop: true` marks a gap between that point and the next one,
// which Damai jumps across.

import * as THREE from 'three';
import { outlineMaterial, toon, withOutline } from './materials.js';

// --- The model -------------------------------------------------------------

const FAWN = 0xd9b58a, MASK = 0x2a2226, INK = 0x1b1410, TONGUE = 0xf08a9a;
const BODY_Y = 0.42;
const EAR_DROOP = 0.55;
const LOOK_BACK = 2.1;   // ~120°: the head turned round towards Mirio

const ellipsoid = (rx, ry, rz, w = 16, h = 12) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);

/**
 * The pug: origin at the feet, +Y up, facing +Z, ~0.9 tall and ~1.1 long.
 * `group` is placed by the caller; body, head, jaw, tail, legs and ears are
 * the parts animateDamai() moves. Legs and ears are [left, right] as the dog
 * sees it (left is +X).
 */
export function buildDamai() {
  const line = outlineMaterial(0.025);
  const fawn = toon(FAWN), mask = toon(MASK), ink = toon(INK);
  const part = (geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = withOutline(new THREE.Mesh(geometry, material), line);
    mesh.position.set(x, y, z);
    return mesh;
  };

  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = BODY_Y;
  group.add(body);
  body.add(part(ellipsoid(0.28, 0.25, 0.4), fawn));

  // Head: a round fawn ball with the black pug muzzle and two big dark eyes.
  const head = new THREE.Group();
  head.position.set(0, 0.2, 0.34);
  body.add(head);
  head.add(part(ellipsoid(0.25, 0.23, 0.22), fawn));
  head.add(part(ellipsoid(0.13, 0.09, 0.09), mask, 0, -0.06, 0.17));
  head.add(part(ellipsoid(0.05, 0.03, 0.03, 10, 8), ink, 0, -0.02, 0.25));
  const white = toon(0xffffff);
  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), ink);
    eye.position.set(side * 0.095, 0.04, 0.18);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), white);
    glint.position.set(0.015, 0.022, 0.045);
    eye.add(glint);
    head.add(eye);
  }

  // Button ears flop down and out from the top of the head.
  const ears = [1, -1].map(side => {
    const ear = new THREE.Group();
    ear.position.set(side * 0.15, 0.15, 0.02);
    ear.rotation.z = -side * EAR_DROOP;
    ear.add(part(ellipsoid(0.085, 0.03, 0.075, 12, 8), mask, side * 0.07, 0, 0.02));
    head.add(ear);
    return ear;
  });

  // The lower jaw opens to bark; the tongue sits on it and shows when panting.
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0.16);
  head.add(jaw);
  jaw.add(part(ellipsoid(0.08, 0.035, 0.07, 12, 8), mask, 0, -0.01, 0.03));
  const tongue = new THREE.Mesh(ellipsoid(0.04, 0.012, 0.055, 10, 6), toon(TONGUE));
  tongue.position.set(0, -0.03, 0.08);
  tongue.visible = false;
  jaw.add(tongue);

  // A short tail curled into a ring on the rump.
  const tail = new THREE.Group();
  tail.position.set(0, 0.2, -0.33);
  body.add(tail);
  tail.add(part(new THREE.TorusGeometry(0.07, 0.032, 8, 16, Math.PI * 1.6).rotateY(Math.PI / 2), fawn, 0, 0.07, -0.02));

  // Short legs hang from pivots at shoulder and hip, paws just on the ground.
  const legs = [[1, 0.22], [-1, 0.22], [1, -0.22], [-1, -0.22]].map(([side, z]) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.15, -0.1, z);
    leg.add(part(new THREE.CapsuleGeometry(0.07, 0.18, 4, 8).translate(0, -0.16, 0), fawn));
    leg.add(part(ellipsoid(0.075, 0.045, 0.09, 10, 8), fawn, 0, -0.28, 0.02));
    body.add(leg);
    return leg;
  });

  return { group, body, head, jaw, tail, tongue, legs, ears };
}

/**
 * Poses Damai for `state` ('idle' | 'run' | 'sit' | 'jump' | 'bark' |
 * 'wait') at time `t` in seconds; `speed` in m/s scales the gallop. Every
 * part is set from scratch each call, so states can switch on any frame.
 * With reducedMotion he holds still poses: no bob, no wag, no gallop.
 */
export function animateDamai(model, state, t, { reducedMotion = false, speed = 0 } = {}) {
  const { body, head, jaw, tail, tongue, legs, ears } = model;
  const live = reducedMotion ? 0 : 1;
  body.position.set(0, BODY_Y, 0);
  body.rotation.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  jaw.rotation.x = 0;
  tail.rotation.set(0, 0, 0);
  tongue.visible = false;
  for (const leg of legs) { leg.rotation.set(0, 0, 0); leg.scale.y = 1; }
  let flop = 0;

  if (state === 'run') {
    const k = Math.min(1, Math.max(0, speed / DAMAI.runSpeed));
    const phase = t * (7 + speed * 1.6);
    const swing = live ? (0.35 + 0.55 * k) : 0.3;
    // A gallop: front pair together, back pair half a stride later.
    const front = live ? Math.sin(phase) : 1, back = live ? Math.sin(phase + Math.PI) : -1;
    legs[0].rotation.x = front * swing;
    legs[1].rotation.x = (live ? Math.sin(phase + 0.5) : 1) * swing;
    legs[2].rotation.x = back * swing;
    legs[3].rotation.x = (live ? Math.sin(phase + Math.PI + 0.5) : -1) * swing;
    body.position.y += live * Math.abs(Math.sin(phase)) * 0.05 * k;
    body.rotation.x = live * Math.sin(phase) * 0.08 * k;
    flop = live * Math.sin(phase) * 0.3;
    tail.rotation.z = live * Math.sin(t * 16) * 0.35;
    tongue.visible = speed > 2;
  } else if (state === 'sit' || state === 'wait') {
    // Rump down, chest up: front legs straightened, back legs folded forward.
    body.position.y = BODY_Y - 0.06;
    body.rotation.x = -0.45;
    legs[0].rotation.x = legs[1].rotation.x = 0.45;
    legs[0].scale.y = legs[1].scale.y = 1.2;
    legs[2].rotation.x = legs[3].rotation.x = -1.05;
    head.rotation.x = 0.35;
    if (state === 'wait') head.rotation.y = LOOK_BACK;
    tail.rotation.z = live * Math.sin(t * 9) * 0.25;
    tongue.visible = true;
  } else if (state === 'jump') {
    legs[0].rotation.x = legs[1].rotation.x = -0.9;
    legs[2].rotation.x = legs[3].rotation.x = 0.9;
    body.rotation.x = -0.12;
    flop = -0.35;
  } else if (state === 'bark') {
    // Each bark tips the head up and opens the mouth.
    const woof = live ? Math.abs(Math.sin(t * 9)) : 1;
    head.rotation.x = -0.25 * woof;
    jaw.rotation.x = 0.45 * woof;
    body.position.y += live * woof * 0.02;
    tongue.visible = true;
    tail.rotation.z = live * Math.sin(t * 16) * 0.35;
  } else {
    // idle: stands, panting gently, a slow wag.
    body.position.y += live * Math.sin(t * 5) * 0.008;
    tail.rotation.z = live * Math.sin(t * 6) * 0.3;
    tongue.visible = true;
  }
  ears[0].rotation.z = -(EAR_DROOP + flop);
  ears[1].rotation.z = EAR_DROOP + flop;
}

// --- The guide -------------------------------------------------------------

/**
 * Tunables, in metres and seconds. He aims `lead` ahead of Mirio and runs
 * `gain` m/s per metre he is short of it, up to `runSpeed`, so with Mirio
 * walking he settles between lead - runSpeed / gain (~5.2) and lead: the
 * 5–8 m band. More than `waitGap` behind, he waits until Mirio is back within
 * `leadMax`.
 */
export const DAMAI = Object.freeze({
  meetRadius: 8,
  lead: 7.5,
  leadMin: 5,
  leadMax: 8,
  gain: 3,
  runSpeed: 7,
  accel: 18,
  runningSpeed: 0.3,
  waitGap: 12,
  barkTime: 0.6,
  hopTime: 0.6,
  hopPeak: 1.8,
});

export class DamaiGuide {
  constructor(route) {
    if (!Array.isArray(route) || route.length < 2) throw new Error('DamaiGuide: the route needs at least two points');
    route.forEach((p, i) => {
      if (![p.s, p.x, p.z, p.h].every(Number.isFinite)) throw new Error(`DamaiGuide: route point ${i} needs finite s, x, z, h`);
      if (i && p.s <= route[i - 1].s) throw new Error(`DamaiGuide: route point ${i} must lie further along than the one before`);
    });
    this.route = route;
    this.last = route.length - 1;
    this.reset();
  }

  reset() {
    Object.assign(this, {
      s: this.route[0].s, seg: 0, speed: 0, state: 'sit', met: false, riding: false, barkTimer: 0,
      hop: -1, hopT: 0, hopB: 0, hopC: 0, facingX: 0, facingZ: 1,
    });
    this.#locate();
  }

  /** On the log: he sits and step() leaves him alone until ride(false). */
  ride(on) {
    this.riding = !!on;
    this.speed = 0;
    if (this.riding) this.met = true;
    this.state = this.riding || this.s >= this.route[this.last].s ? 'sit' : 'idle';
  }

  /** `player` is {s} along the same route, or null when Mirio is off it. */
  step(dt, player) {
    const events = [];
    if (this.riding || !(dt > 0)) return events;
    if (this.hop >= 0) { this.#fly(dt); return events; }
    const end = this.route[this.last].s;
    if (this.s >= end) { this.state = 'sit'; return events; }
    const ps = player && Number.isFinite(player.s) ? player.s : null;

    // He sits at the start until Mirio comes close (or has run past).
    if (!this.met) {
      if (ps === null || ps < this.s - DAMAI.meetRadius) return events;
      this.met = true;
      this.state = 'bark';
      this.barkTimer = DAMAI.barkTime;
      events.push({ type: 'bark' });
      return events;
    }
    if (this.barkTimer > 0) { this.barkTimer -= dt; return events; }
    if (ps === null) { this.speed = 0; if (this.state !== 'wait') this.state = 'idle'; return events; }

    const behind = this.s - ps;
    if (this.state === 'wait') {
      if (behind > DAMAI.leadMax) return events;
    } else if (behind > DAMAI.waitGap) {
      this.speed = 0;
      this.state = 'wait';
      events.push({ type: 'bark' });
      return events;
    }

    const want = Math.min(DAMAI.runSpeed, Math.max(0, DAMAI.gain * (ps + DAMAI.lead - this.s)));
    this.speed = Math.min(want, this.speed + DAMAI.accel * dt);
    const stop = this.#nextStop();
    const stopS = this.route[stop].s;
    const reached = this.s + this.speed * dt >= stopS;
    this.s = reached ? stopS : this.s + this.speed * dt;
    this.#locate();

    if (reached && stop === this.last) {
      this.speed = 0;
      this.state = 'sit';
    } else if (reached && this.speed > 0) {
      this.#takeOff(stop);
      events.push({ type: 'hop' });
    } else {
      this.state = this.speed > DAMAI.runningSpeed ? 'run' : 'idle';
    }
    return events;
  }

  /** Where he is now; h includes the jump arc, facing is along the route. */
  snapshot() {
    this.#locate();
    const a = this.route[this.seg], b = this.route[this.seg + 1];
    const u = Math.min(1, Math.max(0, (this.s - a.s) / (b.s - a.s)));
    let h = a.h + (b.h - a.h) * u;
    if (this.hop >= 0) {
      const v = this.hopT / DAMAI.hopTime;
      h = this.route[this.hop].h + this.hopB * v + this.hopC * v * v;
    }
    return {
      s: this.s, x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, h,
      facing: [this.facingX, this.facingZ], state: this.state, met: this.met, speed: this.speed,
    };
  }

  /** The next point he has to stop at: a gap's edge ahead, or the end. */
  #nextStop() {
    for (let k = this.seg; k < this.last; k++) if (this.route[k].hop && this.route[k].s >= this.s) return k;
    return this.last;
  }

  /**
   * Jump from point k to k + 1: a parabola h0 + b·u + c·u² over u = 0..1
   * whose top lies hopPeak above the higher of the two ends.
   */
  #takeOff(k) {
    const h0 = this.route[k].h, h1 = this.route[k + 1].h;
    const top = Math.max(h0, h1) + DAMAI.hopPeak;
    const up = top - h0, down = top - h1;
    this.hop = k;
    this.hopT = 0;
    this.hopB = 2 * (up + Math.sqrt(up * down));
    this.hopC = (h1 - h0) - this.hopB;
    this.state = 'jump';
  }

  #fly(dt) {
    const a = this.route[this.hop], b = this.route[this.hop + 1];
    this.hopT = Math.min(DAMAI.hopTime, this.hopT + dt);
    const u = this.hopT / DAMAI.hopTime;
    this.s = a.s + (b.s - a.s) * u;
    if (u < 1) return;
    this.s = b.s;
    this.hop = -1;
    this.#locate();
    if (this.s < this.route[this.last].s) { this.state = 'run'; return; }
    this.speed = 0;
    this.state = 'sit';
  }

  /** Keeps `seg` on the segment holding `s` and `facing` along it. */
  #locate() {
    const r = this.route;
    while (this.seg < this.last - 1 && this.s >= r[this.seg + 1].s) this.seg++;
    while (this.seg > 0 && this.s < r[this.seg].s) this.seg--;
    const dx = r[this.seg + 1].x - r[this.seg].x, dz = r[this.seg + 1].z - r[this.seg].z, d = Math.hypot(dx, dz);
    if (d > 1e-6) { this.facingX = dx / d; this.facingZ = dz / d; }
  }
}
