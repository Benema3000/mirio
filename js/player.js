// Mirio: Mirio, the player. His moves on top of world.js (jump
// chain up to the triple jump, ground pound, spin, skid), falling in the lake,
// hearts for the boss fight, riding the rocket, and the animation of the 3D
// model built from Miro's drawing (mirio-model.js).

import * as THREE from 'three';
import { buildMirio } from './mirio-model.js';
import { makeShadow } from './scene.js';
import {
  FALL_GRAVITY, HOLD_GRAVITY, inWater, jumpFor, partialTurn, RELEASE_GRAVITY, RUN_SPEED, stepBody, surfacePoint,
  tangentDir,
} from './world.js';

const SPIN_FALL_GRAVITY = 0.45;
const COYOTE_TIME = 0.12;
const JUMP_BUFFER = 0.16;
const SPIN_TIME = 0.42;
const SPIN_AIR_BOOST = 7;
// Ground pound: a short somersault in the air, then straight down, fast.
const POUND_HANG = 0.28;
const POUND_SPEED = 32;
const POUND_RECOVER = 0.25;
const BOUNCE_SPEED = 13;
const BOUNCE_HELD_SPEED = 17;
const SPLASH_TIME = 1.0;
const TURN_SPEED = 12;
const INVULNERABLE_TIME = 1.6;
const STUN_TIME = 0.4;
export const MAX_HEARTS = 3;
// Height of Mirio's middle above his feet, the somersault's pivot.
const MIDDLE = 1.1;
// Relaxed elbows and wrists, standing (radians of forward bend).
const ELBOW_REST = 0.14;
const WRIST_REST = 0.12;

const Y = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const basis = new THREE.Matrix4();
const q = new THREE.Quaternion();

const lerp = THREE.MathUtils.lerp;
const damp = (from, to, rate, dt) => lerp(from, to, 1 - Math.exp(-rate * dt));

export class Player {
  constructor(scene, art, planets, collidersOf) {
    this.planets = planets;
    this.collidersOf = collidersOf;
    this.body = {
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
      radius: 0.45, height: 2.1, onGround: false, planet: null,
    };
    this.model = buildMirio(art);
    scene.add(this.model.group);
    this.shadow = makeShadow(art, 1.6);
    scene.add(this.shadow);
    this.events = [];
    this.wish = new THREE.Vector3();
    this.flightDir = new THREE.Vector3();
    this.visualUp = new THREE.Vector3(0, 1, 0);
    this.facing = new THREE.Vector3(1, 0, 0);
  }

  /** Puts Mirio down at a checkpoint: { planet, dir }, with full hearts. */
  reset(checkpoint, facing = null) {
    this.checkpoint = checkpoint;
    surfacePoint(checkpoint.planet, checkpoint.dir, 0.05, this.body.pos);
    this.body.vel.set(0, 0, 0);
    this.body.up.copy(checkpoint.dir);
    this.body.onGround = true;
    this.body.skidding = false;
    this.body.bumpedHead = false;
    this.body.planet = checkpoint.planet;
    this.visualUp.copy(checkpoint.dir);
    if (facing) tangentDir(facing, checkpoint.dir, this.facing);
    this.lastPlanet = checkpoint.planet;
    this.state = 'play';
    this.hearts = MAX_HEARTS;
    this.invulnerable = 0;
    this.stun = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpHeld = false;
    this.launchGravity = null;
    this.spinRequest = false;
    this.poundRequest = false;
    this.spinT = 0;
    this.airSpinUsed = false;
    this.pound = null;
    this.chain = 0;
    this.groundTime = 0;
    this.flip = 0;
    this.lost = 0;
    this.splashT = 0;
    this.wishSpeed = 0;
    this.skidding = false;
    this.squash = 0;
    this.walkPhase = 0;
    this.winT = 0;
    this.limbs = { legs: 0, arms: 0, raise: 0, lean: 0, elbow: ELBOW_REST, wrist: WRIST_REST };
    this.model.group.visible = true;
  }

  get spinning() {
    return this.spinT > 0;
  }

  /** True while dropping in a ground pound (the boss checks this). */
  get pounding() {
    return this.pound?.phase === 'drop';
  }

  /** Called once per frame: turns stick and buttons into intent. */
  readInput(input, rig) {
    this.jumpHeld = input.jumpHeld;
    if (input.consumeJump()) this.jumpBuffer = JUMP_BUFFER;
    if (input.consumeSpin()) this.spinRequest = true;
    if (input.consumePound()) this.poundRequest = true;

    const up = this.body.up;
    // Mid gravity flip the camera can look straight down; then "forward" is
    // simply the way Mirio faces.
    const fwd = tangentDir(rig.forward, up, tmp) ?? tangentDir(this.facing, up, tmp);
    const mag = Math.min(1, Math.hypot(input.move.x, input.move.y));
    this.wishSpeed = 0;
    if (!fwd || mag < 0.08) return;

    const right = tmp2.crossVectors(fwd, up);
    this.wish.copy(fwd).multiplyScalar(input.move.y).addScaledVector(right, input.move.x).normalize();
    this.wishSpeed = RUN_SPEED * mag;
  }

  step(h) {
    this.jumpBuffer = Math.max(0, this.jumpBuffer - h);
    this.spinT = Math.max(0, this.spinT - h);
    this.invulnerable = Math.max(0, this.invulnerable - h);
    this.stun = Math.max(0, this.stun - h);

    if (this.state === 'flight' || this.state === 'boarding') return;
    if (this.state === 'splash') {
      this.splashT += h;
      if (this.splashT >= SPLASH_TIME) this.respawn();
      return;
    }
    if (this.state === 'win') {
      this.winT += h;
      stepBody(this.body, null, 0, this.planets, this.collidersOf, h);
      return;
    }

    const body = this.body;
    const wasOnGround = body.onGround;
    const fallSpeed = -body.vel.dot(body.up);
    this.coyote = body.onGround ? COYOTE_TIME : Math.max(0, this.coyote - h);
    this.groundTime = body.onGround ? this.groundTime + h : 0;
    this.tryJump();

    if (this.spinRequest) {
      this.spinRequest = false;
      if (this.spinT === 0 && !this.pound && this.stun === 0) {
        this.spinT = SPIN_TIME;
        if (!body.onGround && !this.airSpinUsed) {
          this.airSpinUsed = true;
          const vUp = body.vel.dot(body.up);
          if (vUp < SPIN_AIR_BOOST) body.vel.addScaledVector(body.up, SPIN_AIR_BOOST - vUp);
        }
        this.events.push({ type: 'spin' });
      }
    }

    if (this.poundRequest) {
      this.poundRequest = false;
      if (!body.onGround && !this.pound && this.stun === 0) {
        this.pound = { phase: 'hang', t: 0 };
        this.launchGravity = null;
        this.spinT = 0;
        this.flip = 0;
        body.vel.set(0, 0, 0);
        this.events.push({ type: 'poundStart' });
      }
    }

    const opts = this.poundOptions(h) ?? this.jumpOptions();
    const canMove = !this.pound && this.stun === 0;
    stepBody(body, canMove ? this.wish : null, canMove ? this.wishSpeed : 0, this.planets, this.collidersOf, h, opts);
    if (this.launchGravity !== null && body.vel.dot(body.up) <= 0) this.launchGravity = null;
    if (body.skidding && !this.skidding) this.events.push({ type: 'skid' });
    this.skidding = body.skidding;

    if (body.onGround && !wasOnGround) {
      this.land(fallSpeed);
      // A press just before touchdown takes off immediately, even on a
      // frame with only one physics tick. This makes the jump chain fluid.
      this.tryJump();
    }
    // The chain only survives a quick re-jump; standing around resets it.
    if (body.onGround && this.groundTime > 0.3) this.chain = 0;

    if (inWater(body.pos, body.planet)) {
      this.state = 'splash';
      this.splashT = 0;
      this.pound = null;
      this.launchGravity = null;
      body.vel.set(0, 0, 0);
      this.events.push({ type: 'splash' });
      return;
    }

    // Lost in space: no planet pulls on you for a while.
    this.lost = body.planet ? 0 : this.lost + h;
    if (this.lost > 2.5) this.respawn();
  }

  tryJump() {
    const body = this.body;
    if (this.jumpBuffer <= 0 || (!body.onGround && this.coyote <= 0) || this.pound || this.stun > 0) return false;
    const speed = tmp.copy(body.vel).addScaledVector(body.up, -body.vel.dot(body.up)).length();
    const jump = jumpFor(this.chain, this.groundTime, speed);
    body.vel.addScaledVector(body.up, jump.speed - body.vel.dot(body.up));
    body.onGround = false;
    this.launchGravity = null;
    this.coyote = this.jumpBuffer = this.groundTime = 0;
    this.chain = jump.level;
    this.squash = 0.2 + 0.05 * jump.level;
    if (jump.level === 3) this.flip = 1;
    this.events.push({ type: 'jump', level: jump.level });
    return true;
  }

  jumpOptions() {
    const vUp = this.body.vel.dot(this.body.up);
    if (vUp > 0) return { gravityScale: this.launchGravity ?? (this.jumpHeld ? HOLD_GRAVITY : RELEASE_GRAVITY) };
    this.launchGravity = null;
    return { gravityScale: this.spinning ? SPIN_FALL_GRAVITY : FALL_GRAVITY };
  }

  /** Physics options while ground pounding, or null when not. */
  poundOptions(h) {
    const p = this.pound;
    if (!p) return null;
    p.t += h;
    if (p.phase === 'hang') {
      this.body.vel.set(0, 0, 0);
      if (p.t >= POUND_HANG) {
        p.phase = 'drop';
        this.body.vel.copy(this.body.up).multiplyScalar(-POUND_SPEED);
      }
      return { gravityScale: 0 };
    }
    if (p.phase === 'drop') return { gravityScale: 1, terminal: POUND_SPEED };
    return { gravityScale: 1 };
  }

  land(fallSpeed) {
    this.launchGravity = null;
    this.airSpinUsed = false;
    this.flip = 0;
    if (this.pound?.phase === 'drop') {
      this.events.push({ type: 'pound', pos: this.body.pos.clone() });
      this.squash = -0.35;
      this.pound = null;
      this.stun = POUND_RECOVER;
      this.chain = 0;
    } else if (fallSpeed > 4) {
      this.squash = -Math.min(0.25, fallSpeed * 0.015);
      this.events.push({ type: 'land', speed: fallSpeed });
    }
    if (this.body.planet !== this.lastPlanet) {
      this.lastPlanet = this.body.planet;
      this.events.push({ type: 'arrive', planet: this.body.planet });
    }
  }

  respawn() {
    const { checkpoint } = this;
    this.reset(checkpoint);
    this.events.push({ type: 'respawn' });
  }

  /** Knocked back by the boss: costs a heart; out of hearts, back to the checkpoint. */
  hurt(from) {
    if (this.invulnerable > 0 || this.state !== 'play') return;
    this.hearts -= 1;
    this.pound = null;
    this.launchGravity = null;
    this.events.push({ type: 'hurt', hearts: this.hearts });
    if (this.hearts <= 0) {
      this.respawn();
      this.events.push({ type: 'faint' });
      return;
    }
    const away = tangentDir(tmp.subVectors(this.body.pos, from), this.body.up)
      ?? tangentDir(this.facing, this.body.up, tmp)?.negate() ?? tangentDir(Y, this.body.up, tmp) ?? tmp.set(1, 0, 0);
    this.body.vel.copy(away).multiplyScalar(8).addScaledVector(this.body.up, 9);
    this.body.onGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.invulnerable = INVULNERABLE_TIME;
    this.stun = STUN_TIME;
  }

  /** Springs off a creature, or a blossom with its own rising arc. */
  bounce({ speed = this.jumpHeld ? BOUNCE_HELD_SPEED : BOUNCE_SPEED, gravityScale = null, direction = null, horizontalSpeed = 0 } = {}) {
    const vUp = this.body.vel.dot(this.body.up);
    // Directional flowers provide a safe first arc; air steering remains available.
    const launch = direction ? tangentDir(direction, this.body.up) : null;
    if (launch) this.body.vel.copy(launch).multiplyScalar(horizontalSpeed).addScaledVector(this.body.up, vUp);
    this.body.vel.addScaledVector(this.body.up, speed - vUp);
    this.launchGravity = gravityScale;
    this.body.onGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.pound = null;
    this.airSpinUsed = false;
    this.squash = 0.3;
    this.invulnerable = Math.max(this.invulnerable, 0.5);
  }

  /** Climbs into the rocket; main.js flies it and calls leaveRocket(). */
  board() {
    this.state = 'boarding';
    this.body.vel.set(0, 0, 0);
    this.pound = null;
    this.launchGravity = null;
    this.model.group.visible = false;
    this.shadow.visible = false;
  }

  /** Called by main.js every frame of the flight, so the camera can follow. */
  ride(pos, up, dir) {
    this.state = 'flight';
    this.body.pos.copy(pos);
    this.body.up.copy(up);
    this.flightDir.copy(dir);
  }

  leaveRocket(checkpoint, facing) {
    this.reset(checkpoint, facing);
    this.body.vel.copy(checkpoint.dir).multiplyScalar(8);
    this.body.onGround = false;
    this.events.push({ type: 'arrive', planet: checkpoint.planet });
  }

  win() {
    this.state = 'win';
    this.winT = 0;
    this.pound = null;
    this.launchGravity = null;
    this.body.vel.set(0, 0, 0);
  }

  /** Once per frame: pose the model and its shadow. */
  render(dt) {
    const body = this.body;
    const m = this.model;
    if (this.state === 'boarding' || this.state === 'flight') return;

    const side = tangentDir(this.facing, this.visualUp, tmp) ?? Y;
    partialTurn(this.visualUp, body.up, 1 - Math.exp(-12 * dt), side, q);
    this.visualUp.applyQuaternion(q).normalize();
    const up = this.visualUp;

    // Face the way you run, turning smoothly; keep the facing tangent as the
    // ground curves away underneath. A skid keeps facing the old way.
    if (!tangentDir(this.facing, up, this.facing)) tangentDir(Y, up, this.facing);
    if (this.wishSpeed > 0 && this.state === 'play' && !body.skidding && !this.pound) {
      const want = tangentDir(this.wish, up, tmp);
      if (want) {
        const angle = Math.atan2(tmp2.crossVectors(this.facing, want).dot(up), this.facing.dot(want));
        this.facing.applyAxisAngle(up, THREE.MathUtils.clamp(angle, -TURN_SPEED * dt, TURN_SPEED * dt));
      }
    }
    const x = tmp2.crossVectors(up, this.facing);
    basis.makeBasis(x, up, this.facing);
    m.group.quaternion.setFromRotationMatrix(basis);
    m.group.position.copy(body.pos);

    const speed = tmp.copy(body.vel).addScaledVector(body.up, -body.vel.dot(body.up)).length();
    const walking = body.onGround && speed > 0.5 && this.state === 'play' && !body.skidding;
    const run = walking ? Math.min(1, speed / RUN_SPEED) : 0;
    this.walkPhase += walking ? speed * dt * 1.5 : 0;
    const swing = Math.sin(this.walkPhase);

    // Limb targets: walking swings, jumping lifts the arms, skidding leans
    // back, the ground pound tucks in, winning cheers. The arms swing against
    // the legs, wider the faster Mirio goes; the elbows bend a little walking
    // and a lot running; running leans him forward.
    const idle = body.onGround && !walking ? Math.sin(performance.now() * 0.0021) : 0;
    // A walk already swings clearly; the gait fades in over the first steps.
    const gait = Math.min(1, run * 3);
    let legs = swing * (0.35 + 0.45 * run) * gait;
    let arms = -swing * (0.3 + 0.6 * run) * gait + idle * 0.05;
    let elbow = ELBOW_REST + 0.7 * run;
    let wrist = WRIST_REST + 0.15 * run;
    let raise = 0;
    let lean = 0.13 * run;
    if (!body.onGround && this.state === 'play') {
      legs = 0.5;
      arms = -0.3;
      raise = body.vel.dot(body.up) > 0 ? 0.75 : 0.35;
      // Arms stretched up, fingers spread, in the air.
      elbow = 0.1;
      wrist = -0.2;
      lean = 0;
    }
    if (body.skidding) {
      legs = 0.6;
      arms = 0.4;
      raise = 0.3;
      lean = -0.35;
      elbow = 0.2;
      wrist = -0.4;
    }
    if (this.pound) {
      legs = 1.1;
      arms = 0.2;
      raise = 0.9;
      elbow = 1.1;
      wrist = 0.4;
    }
    if (this.state === 'win') {
      raise = 1;
      elbow = 0.15;
      wrist = -0.5;
    }
    const L = this.limbs;
    L.legs = damp(L.legs, legs, 18, dt);
    L.arms = damp(L.arms, arms, 18, dt);
    L.raise = damp(L.raise, raise, 12, dt);
    L.lean = damp(L.lean, lean, 14, dt);
    L.elbow = damp(L.elbow, elbow, 14, dt);
    L.wrist = damp(L.wrist, wrist, 14, dt);
    m.legL.rotation.x = L.legs;
    m.legR.rotation.x = body.onGround || this.pound ? (this.pound ? L.legs : -L.legs) : -0.3;
    const out = Math.abs(swing) * 0.08 * run;
    for (const [side, arm, elbowJoint, hand] of [[1, m.armL, m.elbowL, m.handL], [-1, m.armR, m.elbowR, m.handR]]) {
      const angle = side * L.arms;
      arm.rotation.x = angle;
      arm.rotation.z = lerp(side > 0 ? m.armRestZ.L : m.armRestZ.R, side > 0 ? m.armRaisedZ.L : m.armRaisedZ.R, L.raise) - side * out;
      // The elbow bends more on the forward swing; the hand trails the swing.
      elbowJoint.rotation.x = -L.elbow * (1 + 0.4 * Math.max(0, angle));
      hand.rotation.x = -L.wrist + angle * 0.35 * run;
    }

    this.squash *= Math.exp(-9 * dt);
    const breathe = walking || !body.onGround ? 0 : Math.sin(performance.now() * 0.003) * 0.012;
    m.body.scale.set(1 - this.squash * 0.5, 1 + this.squash + breathe, 1 - this.squash * 0.5);
    m.body.position.y = Math.abs(swing) * 0.1 * run;
    m.body.rotation.y = this.spinning ? (1 - this.spinT / SPIN_TIME) * Math.PI * 2 : 0;
    // Somersaults: forward on the triple jump, and before a ground pound drop.
    let somersault = L.lean;
    if (this.flip > 0 && !body.onGround) {
      this.flip = Math.max(0, this.flip - dt * 1.6);
      somersault = (1 - this.flip) * Math.PI * 2;
    }
    if (this.pound?.phase === 'hang') somersault = Math.min(1, this.pound.t / POUND_HANG) * Math.PI * 2;
    // The body pivots at the feet; shift it so it turns round its middle.
    m.body.rotation.x = somersault;
    m.body.position.y += MIDDLE * (1 - Math.cos(somersault));
    m.body.position.z = -MIDDLE * Math.sin(somersault);
    // A little sway from side to side at speed; the head stays level.
    m.body.rotation.z = swing * 0.05 * run;
    m.head.rotation.z = -m.body.rotation.z * 0.8 + Math.sin(this.walkPhase * 0.5) * 0.03 * run;
    if (this.state === 'win') m.body.position.y = Math.abs(Math.sin(this.winT * 5)) * 0.8;
    if (this.state === 'splash') m.body.position.y = -2.2 * Math.min(1, this.splashT / 0.6);

    // Blink while invulnerable after a hit.
    m.group.visible = this.invulnerable <= 0 || Math.floor(this.invulnerable * 14) % 2 === 0;

    this.placeShadow();
  }

  placeShadow() {
    const body = this.body;
    const planet = body.planet;
    this.shadow.visible = Boolean(planet) && this.state !== 'splash';
    if (!this.shadow.visible) return;

    const up = tmp.subVectors(body.pos, planet.center).normalize();
    let ground = planet.radius;
    const dist = body.pos.distanceTo(planet.center);
    // Over a block, stump or stone the shadow belongs on top of it.
    for (const c of this.collidersOf(planet)) {
      if (c.kind === 'bump') continue;
      const rel = tmp2.subVectors(body.pos, c.base);
      const along = rel.dot(c.axis);
      if (along < c.height - 0.5) continue;
      const inside = c.kind === 'box'
        ? Math.abs(rel.dot(c.right)) < c.halfW && Math.abs(rel.dot(c.forward)) < c.halfD
        : rel.addScaledVector(c.axis, -along).length() < c.radius;
      if (inside) ground = Math.max(ground, c.base.distanceTo(planet.center) + c.height);
    }
    const height = Math.max(0, dist - ground);
    this.shadow.position.copy(planet.center).addScaledVector(up, ground + 0.04);
    this.shadow.quaternion.setFromUnitVectors(Y, up);
    this.shadow.scale.setScalar(THREE.MathUtils.clamp(1 - height / 9, 0.35, 1));
  }
}
