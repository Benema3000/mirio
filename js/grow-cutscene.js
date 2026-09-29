// The Glutbeere's cutscene: Mirio grows into Miro's big Mirio.
//
// The world holds still meanwhile (volcano-run.js skips its step, so the
// clock does not run either). The camera swings round to Mirio's front, he
// flickers between small and big in three pulses, each bigger than the last,
// a flash and a burst of sparkles, he cheers, and the camera swings back to
// where it was behind him. With reduced motion there is no swing, no flicker
// and no flash: small Mirio shrinks away and the big one scales in.
//
// growFrame() is the timeline, a pure function of time; GrowCutscene plays
// it on the models, the camera and the particles.

import * as THREE from 'three';

export const GROW = Object.freeze({
  duration: 2.7,
  quietDuration: 0.9,
  // The camera: out to the front, hold, and back.
  swingOut: [0.05, 0.75],
  swingBack: [1.95, 2.65],
  // [start time, form, size]: size 1 is the big Mirio at full size.
  // 0.69 is as tall as small Mirio.
  pulses: [[0.8, 'big', 0.78], [0.95, 'small', 1], [1.1, 'big', 0.88], [1.25, 'small', 1], [1.4, 'big', 1.1]],
  settle: 0.18,
  flash: 0.45,
  // Arms up after the last pulse, down again before the swing back.
  cheer: [1.45, 1.95],
  // From behind at the rig's distance to the front at this one, a bit lower.
  near: 5.5,
  nearPitch: 0.16,
});

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const ramp = (t, [a, b]) => clamp01((t - a) / (b - a));

/**
 * Where the cutscene is `t` seconds in: which Mirio shows (`form`) at what
 * `size`, how far the camera has swung round to the front (`swing`, 0 behind
 * .. 1 in front), the white `flash` (0..1), the arms' `cheer` (0..1), and
 * `pulse`, the index of the last size step reached (-1 before the first).
 */
export function growFrame(t, { quiet = false } = {}) {
  if (quiet) {
    const k = smooth(clamp01(t / GROW.quietDuration));
    // Small Mirio shrinks away in the first third, big Mirio scales in after it.
    const form = k < 1 / 3 ? 'small' : 'big';
    const size = form === 'small' ? 1 - k * 1.5 : 0.69 + (1 - 0.69) * smooth((k - 1 / 3) * 1.5);
    return { form, size, swing: 0, flash: 0, cheer: 0, pulse: -1, done: t >= GROW.quietDuration };
  }
  const swing = smooth(ramp(t, GROW.swingOut)) * (1 - smooth(ramp(t, GROW.swingBack)));
  let pulse = -1;
  GROW.pulses.forEach(([at], i) => { if (t >= at) pulse = i; });
  let form = 'small', size = 1;
  if (pulse >= 0) [, form, size] = GROW.pulses[pulse];
  const last = GROW.pulses.at(-1)[0];
  // The last step overshoots and settles to full size.
  if (pulse === GROW.pulses.length - 1) size = 1 + (size - 1) * (1 - smooth(clamp01((t - last) / GROW.settle)));
  const flash = t >= last ? Math.max(0, 1 - (t - last) / GROW.flash) ** 2 : 0;
  const cheer = Math.sin(Math.PI * ramp(t, GROW.cheer));
  return { form, size, swing, flash, cheer, pulse, done: t >= GROW.duration };
}

const lift = new THREE.Vector3(), focus = new THREE.Vector3(), look = new THREE.Vector3();
const off = new THREE.Vector3(), side = new THREE.Vector3(), tmp = new THREE.Vector3();

export class GrowCutscene {
  /**
   * `small` and `big` are the two Mirio models (big at its full scale),
   * `player` the Player whose body stands still meanwhile, `particles` the
   * scene's sparkles.
   */
  constructor(scene, { small, big, player, particles }) {
    Object.assign(this, { small, big, player, particles });
    this.bigScale = big.group.scale.x;
    this.active = false;
    this.quiet = false;
    this.t = 0;
    this.facing = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    // A white shell round the camera, like the Vulkanreise's darkness.
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 10), new THREE.MeshBasicMaterial({
      color: 0xfff4d8, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false,
    }));
    this.flash.renderOrder = 999;
    this.flash.visible = false;
    scene.add(this.flash);
  }

  /** Starts growing Mirio where he stands; the small model is still his pose. */
  start() {
    this.active = true;
    this.t = 0;
    this.quiet = this.reducedMotion ?? false;
    this.quaternion.copy(this.small.group.quaternion);
    this.facing.copy(this.player.facing);
    this.turn = null;
  }

  /**
   * Ends it, early too (reset, seek): big Mirio shows at his full size, the
   * small one is hidden and back to his own.
   */
  stop() {
    if (!this.active) return;
    this.active = false;
    this.big.group.scale.setScalar(this.bigScale);
    this.big.group.visible = true;
    this.small.group.scale.setScalar(1);
    this.small.group.visible = false;
    this.flash.visible = false;
  }

  /** Advances the timeline; returns the chapter events of this step (sounds). */
  step(dt) {
    if (!this.active) return [];
    const before = growFrame(this.t, { quiet: this.quiet });
    this.t += dt;
    const now = growFrame(this.t, { quiet: this.quiet });
    const events = [];
    const middle = lift.copy(this.player.body.pos).addScaledVector(this.player.body.up, 1.4);
    for (let i = before.pulse + 1; i <= now.pulse; i++) {
      const last = i === GROW.pulses.length - 1;
      events.push({ type: last ? 'triple' : 'spring', kind: 'grow' });
      this.particles.burst(middle, last
        ? { count: 44, color: [0xffd23f, 0xff7a3d, 0xffffff, 0xff5a2a], speed: 7, size: 0.7, life: 0.9 }
        : { count: 12, color: [0xffd23f, 0xffffff], speed: 4, size: 0.5, life: 0.5 });
    }
    if (this.quiet && before.form === 'small' && now.form === 'big') {
      this.particles.burst(middle, { count: 16, color: [0xffd23f, 0xffffff], speed: 3, size: 0.5, life: 0.6 });
    }
    if (now.done) this.stop();
    return events;
  }

  /**
   * Poses Mirio and holds the camera for this frame. Returns false when there
   * is no cutscene, and the chapter carries on as usual. The camera works
   * from the rig's own resting place, which does not move meanwhile, so it
   * leaves and comes back without a jump.
   */
  render(camera, rig, { reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    if (!this.active) return false;
    const f = growFrame(this.t, { quiet: this.quiet });
    const body = this.player.body;

    for (const [model, on, scale] of [[this.small, f.form === 'small', f.size], [this.big, f.form === 'big', this.bigScale * f.size]]) {
      model.group.visible = on;
      model.group.position.copy(body.pos);
      model.group.quaternion.copy(this.quaternion);
      model.group.scale.setScalar(Math.max(0.001, scale));
      this.#pose(model, model === this.big ? f.cheer : 0);
    }

    const grown = f.form === 'big' ? f.size : 0;
    focus.copy(body.pos).addScaledVector(body.up, THREE.MathUtils.lerp(1.3, 2.1, clamp01(grown)));
    off.subVectors(rig.pos, focus);
    const rise = off.dot(body.up);
    side.copy(off).addScaledVector(body.up, -rise);
    // Round to his front the short way.
    if (this.turn === null) {
      const from = side.clone().normalize();
      this.turn = Math.atan2(tmp.crossVectors(from, this.facing).dot(body.up), from.dot(this.facing));
    }
    const s = f.swing;
    const distance = THREE.MathUtils.lerp(Math.hypot(side.length(), rise), GROW.near, s);
    const pitch = THREE.MathUtils.lerp(Math.atan2(rise, side.length()), GROW.nearPitch, s);
    side.normalize().applyAxisAngle(body.up, this.turn * s);
    camera.position.copy(focus).addScaledVector(side, distance * Math.cos(pitch)).addScaledVector(body.up, distance * Math.sin(pitch));
    rig.keepOutside(camera.position);
    camera.up.copy(rig.up);
    camera.lookAt(look.copy(rig.focus).lerp(focus, s));

    this.flash.visible = f.flash > 0.01;
    this.flash.position.copy(camera.position);
    this.flash.material.opacity = f.flash * 0.75;
    return true;
  }

  /** Standing, arms out like the drawing; `cheer` lifts them up. */
  #pose(m, cheer) {
    m.body.position.set(0, 0, 0);
    m.body.rotation.set(0, 0, 0);
    m.body.scale.setScalar(1);
    m.head.rotation.set(0, 0, 0);
    m.legL.rotation.set(0, 0, 0);
    m.legR.rotation.set(0, 0, 0);
    for (const [key, arm, elbow, hand] of [['L', m.armL, m.elbowL, m.handL], ['R', m.armR, m.elbowR, m.handR]]) {
      arm.rotation.x = 0;
      arm.rotation.z = THREE.MathUtils.lerp(m.armRestZ[key], m.armRaisedZ[key], cheer);
      elbow.rotation.x = -0.14;
      hand.rotation.x = -0.12 - 0.3 * cheer;
    }
  }
}
