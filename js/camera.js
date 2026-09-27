// Mirio: the camera. It keeps its own "up" and "forward" and carries them
// along as Mirio walks round a planet (rotating both by the same turn that
// moves the old up onto the new one). Without that, forward would spin
// wildly near every pole.

import * as THREE from 'three';
import { partialTurn, tangentDir } from './world.js';

const MIN_PITCH = 0.08;
const MAX_PITCH = 1.25;
const FOCUS_HEIGHT = 1.4;
// After the player last touched the camera, wait this long before it starts
// turning to follow on its own.
const AUTO_FOLLOW_DELAY = 1.2;

const q = new THREE.Quaternion();
const right = new THREE.Vector3();
const focus = new THREE.Vector3();
const desired = new THREE.Vector3();
const tmp = new THREE.Vector3();

export class CameraRig {
  constructor(camera, planets) {
    this.camera = camera;
    this.planets = planets;
    this.up = new THREE.Vector3(0, 1, 0);
    this.forward = new THREE.Vector3(1, 0, 0);
    this.pitch = 0.42;
    this.distance = 11;
    this.idle = 0;
    this.pos = new THREE.Vector3();
  }

  /** Jumps straight to the resting position behind the player. */
  snap(player, forward) {
    this.up.copy(player.body.up);
    this.forward.copy(tangentDir(forward, this.up, tmp) ?? tmp.set(1, 0, 0));
    this.place(player, 1);
  }

  update(dt, player, input) {
    const k = 1 - Math.exp(-(player.state === 'flight' ? 3.5 : 5) * dt);
    right.crossVectors(this.forward, this.up).normalize();
    partialTurn(this.up, player.body.up, k, right, q);
    this.up.applyQuaternion(q).normalize();
    this.forward.applyQuaternion(q);
    if (!tangentDir(this.forward, this.up, this.forward)) {
      this.forward.crossVectors(this.up, right).normalize();
    }

    const turn = input.consumeCamera();
    if (turn.x !== 0 || turn.y !== 0) this.idle = 0;
    else this.idle += dt;
    this.forward.applyAxisAngle(this.up, -turn.x);
    this.pitch = THREE.MathUtils.clamp(this.pitch - turn.y, MIN_PITCH, MAX_PITCH);

    if (player.state === 'flight') {
      this.follow(player.flightDir, 3, dt);
    } else if (this.idle > AUTO_FOLLOW_DELAY && player.state === 'play') {
      // Lazy follow, like the camera in the platformers kids know: running
      // sideways slowly swings the view round behind you.
      const move = tangentDir(player.body.vel, this.up, tmp);
      const speed = player.body.vel.length();
      if (move && speed > 2 && move.dot(this.forward) > -0.3) this.follow(move, 0.9 * Math.min(1, speed / 8), dt);
    }

    this.place(player, 1 - Math.exp(-10 * dt));
  }

  /** Turns forward toward `dir` (projected) at `rate` per second. */
  follow(dir, rate, dt) {
    const want = tangentDir(dir, this.up, tmp);
    if (!want) return;
    right.crossVectors(this.forward, this.up);
    const side = want.dot(right);
    const ahead = want.dot(this.forward);
    const angle = Math.atan2(side, ahead);
    this.forward.applyAxisAngle(this.up, -angle * Math.min(1, rate * dt));
  }

  place(player, blend) {
    focus.copy(player.body.pos).addScaledVector(this.up, FOCUS_HEIGHT);
    const back = this.distance * Math.cos(this.pitch);
    const rise = this.distance * Math.sin(this.pitch);
    desired.copy(focus).addScaledVector(this.forward, -back).addScaledVector(this.up, rise);

    for (const p of this.planets) {
      const d = desired.distanceTo(p.center);
      const clear = p.radius + 1.2;
      if (d < clear) desired.sub(p.center).multiplyScalar(clear / d).add(p.center);
    }

    this.pos.lerp(desired, blend);
    this.camera.position.copy(this.pos);
    this.camera.up.copy(this.up);
    this.camera.lookAt(focus);
  }
}
