// The Vulkanreise: a journey in the style of the Planetenreise, built from
// Miro's second set of drawings. Same round-planet platforming (player.js,
// world.js), same scene builder (scene.js), its own creatures:
//
//   Glutwelt → Grummel valley → the Glutbeere (Mirio grows into Miro's big
//   Mirio, and a hit only shrinks him back) → the pass of Schnappblumen →
//   rocket → Aschemond → Glutzahn on the arena → the crystal.
//
// Runs as a chapter (see main.js CHAPTER_TYPES): reset, step, render,
// snapshot, layout, seek, rescue, and `scene`.

import * as THREE from 'three';
import { CameraRig } from './camera.js';
import { EnemySystem } from './enemies.js';
import { GLUT, GlutzahnRules } from './glutzahn-rules.js';
import { collidersFor } from './level.js';
import { BIG_MIRIO_LOOK, buildMirio } from './mirio-model.js';
import { MAX_HEARTS, Player } from './player.js';
import { Particles, buildScene, placeOn } from './scene.js';
import { buildGlutzahn, buildGrummel, buildSchnappblume, buildStachelkreisel } from './volcano-creatures.js';
import { makeVolcanoLevel, volcanoFlightPoint } from './volcano-level.js';
import { partialTurn, surfacePoint, tangentDir } from './world.js';

const PHYSICS_STEP = 1 / 120;
const BIT_RADIUS = 1.3;
const FLAG_RADIUS = 2.4;
const BERRY_RADIUS = 1.4;
const PLANT = Object.freeze({ notice: 4, reach: 1.9, windup: 0.55, bite: 0.3, rest: 1.2, stompHeight: 2.2 });
const ROCKET = Object.freeze({ countdown: 2.4, flight: 3.6 });
const BIG_SCALE = 1.25;
const CAMERA_DISTANCE = 11;
const Y = new THREE.Vector3(0, 1, 0);
const smooth = (t) => t * t * (3 - 2 * t);
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), basis = new THREE.Matrix4();

/** The stick and buttons as player.js reads them, from main.js's chapter controls. */
function intent(controls) {
  let jump = Boolean(controls.jump), spin = Boolean(controls.action), pound = Boolean(controls.pound);
  return {
    move: { x: controls.x ?? 0, y: controls.y ?? 0 },
    jumpHeld: Boolean(controls.jumpHeld),
    consumeJump: () => { const v = jump; jump = false; return v; },
    consumeSpin: () => { const v = spin; spin = false; return v; },
    consumePound: () => { const v = pound; pound = false; return v; },
    consumeCamera: () => ({ x: 0, y: 0 }),
  };
}

export class VolcanoRun {
  constructor(art) {
    this.level = makeVolcanoLevel();
    const [welt, mond] = this.level.planets;
    this.welt = welt;
    this.mond = mond;
    this.scene = new THREE.Scene();
    this.scene.name = 'vulkanreise';
    this.world = buildScene(this.scene, this.level, art);
    this.colliders = collidersFor(this.level);
    this.particles = new Particles(this.scene, art.sparkle);
    this.player = new Player(this.scene, art, this.level.planets, this.colliders);
    this.small = this.player.model;
    // Every hit, from any creature, goes through the power-up first.
    const hurt = this.player.hurt.bind(this.player);
    this.player.hurt = (from) => {
      if (this.player.invulnerable > 0 || this.player.state !== 'play') return;
      if (this.powered) {
        this.player.hearts += 1;
        this.#setBig(false);
      }
      hurt(from);
    };
    this.big = buildMirio(art, BIG_MIRIO_LOOK);
    this.big.group.scale.setScalar(BIG_SCALE);
    this.big.group.visible = false;
    this.scene.add(this.big.group);

    this.enemies = new EnemySystem(this.scene, this.level, art, { layouts: this.level.walkers, build: buildGrummel });
    this.plants = this.level.plants.map((spec, i) => {
      const model = buildSchnappblume(art);
      placeOn(model.group, spec.planet, spec.dir, 0);
      this.scene.add(model.group);
      this.colliders(spec.planet).push({ kind: 'cyl', base: surfacePoint(spec.planet, spec.dir, -0.3), axis: spec.dir.clone(), radius: 0.62, height: 1.2 });
      return { ...spec, model, pos: surfacePoint(spec.planet, spec.dir, 0), phase: i * 1.3 };
    });
    this.berries = this.level.powerups.map(spec => {
      const group = new THREE.Group();
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), new THREE.MeshLambertMaterial({ color: 0xff5a2a, emissive: 0x7a1a00 }));
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6).scale(1.4, 0.4, 0.8).translate(0.15, 0.48, 0), new THREE.MeshLambertMaterial({ color: 0x5fae4a }));
      group.add(berry, leaf);
      placeOn(group, spec.planet, spec.dir, spec.height);
      this.scene.add(group);
      return { ...spec, group, pos: surfacePoint(spec.planet, spec.dir, spec.height) };
    });

    // The rocket stands on the plateau; the flight follows the level's curve.
    this.rocket = { ...this.world.rocket, phase: 'pad', t: 0 };
    const r = this.level.rocket;
    this.padBase = surfacePoint(welt, r.dir, r.height);
    this.flightSide = new THREE.Vector3().crossVectors(r.dir, r.flight.landing).normalize();

    // Glutzahn's arena: a flat top with its own right/forward axes.
    const ar = this.level.arena;
    this.arena = { center: surfacePoint(ar.planet, ar.dir, ar.top), up: ar.dir.clone() };
    this.arena.forward = tangentDir(ar.facing, ar.dir) ?? tangentDir(new THREE.Vector3(1, 0, 0), ar.dir);
    this.arena.right = new THREE.Vector3().crossVectors(this.arena.up, this.arena.forward).normalize();
    this.boss = new GlutzahnRules();
    this.bossModel = buildGlutzahn(art);
    this.scene.add(this.bossModel.group);
    this.kreisels = Array.from({ length: 3 }, () => { const m = buildStachelkreisel(); this.scene.add(m.group); return m; });
    const fire = new THREE.ConeGeometry(0.9, GLUT.fireLength, 20, 1, true).translate(0, -GLUT.fireLength / 2, 0).rotateX(-Math.PI / 2);
    this.fire = new THREE.Mesh(fire, new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.scene.add(this.fire);

    this.rig = null;
    this.reset();
  }

  reset() {
    const { spawn } = this.level;
    this.status = 'playing';
    this.time = 0;
    this.penalty = 0;
    this.elapsed = 0;
    this.phase = 'play';
    this.fight = false;
    this.powered = false;
    this.collected = 0;
    this.player.reset({ planet: spawn.planet, dir: spawn.dir.clone() }, new THREE.Vector3(0, 0, -1));
    this.#setBig(false);
    this.player.events.length = 0;
    this.enemies.reset();
    for (const bit of this.world.bits) { bit.taken = false; bit.mesh.visible = true; }
    for (const f of this.world.flags) { f.reached = false; f.raise = 0; }
    for (const p of this.plants) Object.assign(p, { mode: 'idle', timer: 0, wilted: false });
    for (const b of this.berries) { b.taken = false; b.group.visible = true; }
    this.#rocketToPad();
    this.boss.reset();
    this.world.goal.group.visible = true;
    this.world.goal.group.position.copy(this.world.goal.center);
    this.world.goal.bubble.visible = true;
    this.snap = true;
    return this.snapshot();
  }

  #setBig(on) {
    this.powered = on;
    const model = on ? this.big : this.small;
    if (this.player.model === model) return;
    this.player.model.group.visible = false;
    this.player.model = model;
    model.group.visible = true;
  }

  #rocketToPad() {
    const r = this.rocket, lr = this.level.rocket;
    placeOn(r.group, this.welt, lr.dir, lr.height, Y);
    r.flame.visible = false;
    r.phase = 'pad';
    r.t = 0;
  }

  /** Mirio against a hazard at `from`: grown, it only costs the power-up (see the constructor). */
  #hurt(from) {
    this.player.hurt(from);
  }

  #arenaLocal(pos) {
    const rel = tmp.subVectors(pos, this.arena.center);
    return { x: rel.dot(this.arena.right), z: rel.dot(this.arena.forward), height: rel.dot(this.arena.up) };
  }

  #arenaPoint(x, z, height, out = new THREE.Vector3()) {
    return out.copy(this.arena.center).addScaledVector(this.arena.right, x).addScaledVector(this.arena.forward, z).addScaledVector(this.arena.up, height);
  }

  step(dt, controls = {}, input = null) {
    if (this.status !== 'playing' || !Number.isFinite(dt) || dt <= 0 || !this.rig) return [];
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.elapsed += dt;
    const events = [];
    const player = this.player;
    if (this.phase === 'play') player.readInput(intent(controls), this.rig);
    const steps = Math.max(1, Math.ceil(dt / PHYSICS_STEP)), h = dt / steps;
    if (this.phase === 'play') for (let i = 0; i < steps; i++) player.step(h);

    events.push(...this.enemies.step(dt, player, { active: this.phase === 'play' && !this.fight }));
    if (this.phase === 'play') {
      this.#plants(dt, events);
      this.#pickups(events);
      this.#rocketBoard(events);
      this.#bossFight(dt, events);
      this.#goal(events);
    }
    this.#rocketFly(dt, events);

    for (const ev of player.events.splice(0)) {
      if (ev.type === 'faint') {
        // Out of hearts: back at the last flag, and the fight starts over.
        this.fight = false;
        this.boss.reset();
        this.penalty += 3;
        this.time += 3;
        events.push({ type: 'checkpoint', kind: 'rescue', penalty: 3 });
      } else if (ev.type === 'jump') events.push({ type: ['jump', 'jump2', 'triple'][(ev.level ?? 1) - 1] });
      else if (['hurt', 'pound', 'land', 'spin', 'poundStart'].includes(ev.type)) events.push({ type: ev.type });
    }
    this.rig.distance = CAMERA_DISTANCE + (this.fight ? 4 : 0) + (this.phase === 'rocket' ? 6 : 0);
    this.rig.update(dt, player, input ?? { consumeCamera: () => ({ x: 0, y: 0 }) });
    return events;
  }

  #plants(dt, events) {
    const player = this.player;
    for (const p of this.plants) {
      if (p.wilted) continue;
      p.timer += dt;
      const rel = tmp.subVectors(player.body.pos, p.pos), up = p.dir;
      const height = rel.dot(up), distance = rel.addScaledVector(up, -height).length();
      const same = player.body.planet === p.planet;
      // Stomped from above, or pounded, it wilts.
      if (same && distance < 0.9 && height > PLANT.stompHeight && height < 3.6 && player.body.vel.dot(up) < 0) {
        p.wilted = true;
        player.bounce();
        events.push({ type: 'enemyDefeat', kind: 'schnappblume' });
        this.particles.burst(surfacePoint(p.planet, p.dir, 2.7), { count: 14, color: [0x6fbf4a, 0xff7a3d], speed: 4, size: 0.5, life: 0.6 });
        continue;
      }
      if (p.mode === 'idle' && same && distance < PLANT.notice && p.timer > PLANT.rest) { p.mode = 'windup'; p.timer = 0; }
      else if (p.mode === 'windup' && p.timer > PLANT.windup) { p.mode = 'bite'; p.timer = 0; }
      else if (p.mode === 'bite') {
        if (same && distance < PLANT.reach && height < PLANT.stompHeight) this.#hurt(p.pos);
        if (p.timer > PLANT.bite) { p.mode = 'idle'; p.timer = 0; }
      }
    }
  }

  #pickups(events) {
    const player = this.player, mid = tmp2.copy(player.body.pos).addScaledVector(player.body.up, 1);
    for (const bit of this.world.bits) {
      if (bit.taken || bit.mesh.position.distanceTo(mid) > BIT_RADIUS) continue;
      bit.taken = true;
      bit.mesh.visible = false;
      this.collected++;
      events.push({ type: 'bit' });
      this.particles.burst(bit.mesh.position, { count: 8, color: bit.color, speed: 3, size: 0.4, life: 0.5 });
    }
    for (const berry of this.berries) {
      if (berry.taken || berry.pos.distanceTo(mid) > BERRY_RADIUS) continue;
      berry.taken = true;
      berry.group.visible = false;
      this.#setBig(true);
      events.push({ type: 'star', kind: 'grow' });
      this.particles.burst(berry.pos, { count: 26, color: [0xff5a2a, 0xffd23f, 0xffffff], speed: 5, size: 0.6, life: 0.8 });
    }
    for (const [i, f] of this.world.flags.entries()) {
      if (f.reached || f.center.distanceTo(player.body.pos) > FLAG_RADIUS + 1.2) continue;
      f.reached = true;
      player.checkpoint = { planet: f.planet, dir: f.dir.clone() };
      player.hearts = MAX_HEARTS;
      events.push({ type: 'checkpoint', index: i });
      this.particles.burst(tmp.copy(f.center).addScaledVector(f.dir, 3), { count: 14, color: [0xffd23f, 0xff7a3d, 0xffffff], speed: 4, size: 0.5 });
    }
  }

  #rocketBoard(events) {
    const r = this.rocket, player = this.player;
    if (r.phase !== 'pad' || player.body.planet !== this.welt) return;
    const rel = tmp.subVectors(player.body.pos, this.padBase), along = rel.dot(this.level.rocket.dir);
    const radial = rel.addScaledVector(this.level.rocket.dir, -along).length();
    if (radial < r.radius + 0.9 && along > -0.5 && along < 3) {
      r.phase = 'countdown';
      r.t = 0;
      this.phase = 'rocket';
      player.board();
      events.push({ type: 'board' });
    }
  }

  #rocketFly(dt, events) {
    const r = this.rocket, lr = this.level.rocket;
    if (r.phase === 'countdown') {
      r.t += dt;
      placeOn(r.group, this.welt, lr.dir, lr.height, Y);
      r.group.position.addScaledVector(tmp.randomDirection(), 0.04 * Math.min(1, r.t));
      r.flame.visible = r.t > ROCKET.countdown * 0.6;
      r.flame.scale.y = 0.6 + Math.random() * 0.4;
      if (r.t >= ROCKET.countdown) { r.phase = 'flight'; r.t = 0; events.push({ type: 'liftoff' }); }
      this.player.ride(this.padBase.clone().addScaledVector(lr.dir, 1.5), lr.dir, lr.dir);
      return;
    }
    if (r.phase !== 'flight') return;
    r.t = Math.min(1, r.t + dt / ROCKET.flight);
    const s = smooth(r.t);
    const pos = volcanoFlightPoint(this.level, s, r.group.position);
    const ahead = volcanoFlightPoint(this.level, Math.min(1, s + 0.01), tmp2).sub(pos);
    if (ahead.lengthSq() > 1e-8) ahead.normalize(); else ahead.copy(lr.flight.landing).negate();
    const qFly = new THREE.Quaternion().setFromUnitVectors(Y, ahead);
    const qLand = new THREE.Quaternion().setFromUnitVectors(Y, lr.flight.landing);
    r.group.quaternion.copy(qFly).slerp(qLand, smooth(THREE.MathUtils.clamp((s - 0.7) / 0.25, 0, 1)));
    r.flame.visible = true;
    r.flame.scale.y = 0.8 + Math.random() * 0.5;
    this.particles.burst(pos, { count: 2, color: [0xffb640, 0xfff0a8, 0xff6f3a], speed: 1.5, size: 0.9, life: 0.7 });
    const turn = partialTurn(lr.dir, lr.flight.landing, s, this.flightSide, new THREE.Quaternion());
    const up = lr.dir.clone().applyQuaternion(turn);
    this.player.ride(tmp.copy(pos).addScaledVector(up, 1.5), up, ahead);
    if (r.t < 1) return;
    r.phase = 'landed';
    r.flame.visible = false;
    placeOn(r.group, this.mond, lr.flight.landing, 0, this.level.moonSpawn.dir);
    const away = tmp.subVectors(this.level.moonSpawn.dir, lr.flight.landing);
    this.player.leaveRocket({ planet: this.mond, dir: this.level.moonSpawn.dir.clone() }, away);
    // leaveRocket resets the hearts; a grown Mirio stays grown.
    this.player.model.group.visible = true;
    this.phase = 'play';
    events.push({ type: 'arrive' });
  }

  #bossFight(dt, events) {
    const player = this.player, boss = this.boss;
    const local = this.#arenaLocal(player.body.pos);
    const onArena = player.body.planet === this.mond && Math.hypot(local.x, local.z) < GLUT.arena && local.height > -0.5 && local.height < 6;
    if (!this.fight && !boss.defeated && onArena) {
      this.fight = true;
      events.push(...boss.start().map(e => ({ type: 'roar', kind: e.type })));
    }
    if (!this.fight) return;
    const upSpeed = player.body.vel.dot(this.arena.up);
    for (const ev of boss.step(dt, { ...local, vy: upSpeed, pounding: player.pounding })) {
      if (ev.type === 'hurt') this.#hurt(this.#arenaPoint(ev.x, ev.z, 1));
      else if (ev.type === 'bossBounce') { player.bounce(); events.push({ type: 'bump' }); }
      else if (ev.type === 'bossHit') {
        player.bounce();
        events.push({ type: 'bossHit', hp: ev.hp });
        this.particles.burst(this.#arenaPoint(boss.x, boss.z, 4), { count: 20, color: [0xffd23f, 0xff7a3d, 0xffffff], speed: 6, size: 0.6, life: 0.7 });
      } else if (ev.type === 'bossDefeat') {
        this.fight = false;
        this.world.goal.bubble.visible = false;
        events.push({ type: 'bossDown' });
      } else if (ev.type === 'bossFire' || ev.type === 'bossThrow') events.push({ type: ev.type === 'bossFire' ? 'roar' : 'spin' });
    }
    // Leaving the arena (a fall) pauses him where he is.
    if (!onArena && player.body.onGround && this.fight && !boss.defeated) { this.fight = false; boss.reset(); }
  }

  #goal(events) {
    if (!this.boss.defeated) return;
    const goal = this.world.goal;
    if (goal.group.position.distanceTo(this.player.body.pos) > 2.6) return;
    this.status = 'finished';
    this.player.win();
    events.push({ type: 'finish', time: this.time, collectibles: this.collected });
  }

  rescue() {
    if (this.status !== 'playing' || this.phase !== 'play') return [];
    this.player.respawn();
    this.fight = false;
    this.boss.reset();
    this.penalty += 2;
    this.time += 2;
    this.snap = true;
    return [{ type: 'checkpoint', kind: 'rescue', penalty: 2 }];
  }

  /**
   * Test staging, never granting anything: 0 the start, .35 on the Glutbeere's
   * block, .6 beside the rocket, .8 the Aschemond, 1 the arena's edge.
   */
  seek(progress) {
    const L = this.level, lr = L.rocket;
    const onMoon = progress >= 0.75;
    // The rocket is where it would be by then: on its pad, or landed.
    if (onMoon) {
      this.rocket.phase = 'landed';
      this.rocket.flame.visible = false;
      placeOn(this.rocket.group, this.mond, lr.flight.landing, 0, L.moonSpawn.dir);
    } else this.#rocketToPad();
    const beside = (dir, metres) => {
      const side = tangentDir(new THREE.Vector3(1, 0, 0), dir) ?? tangentDir(new THREE.Vector3(0, 0, 1), dir);
      const angle = metres / this.welt.radius;
      return dir.clone().multiplyScalar(Math.cos(angle)).addScaledVector(side, Math.sin(angle)).normalize();
    };
    const spot = progress >= 0.95 ? { planet: this.mond, dir: L.arena.dir.clone() }
      : onMoon ? { planet: this.mond, dir: L.moonSpawn.dir.clone() }
        : progress >= 0.55 ? { planet: this.welt, dir: beside(L.plateau.dir, 3.8) }
          : progress >= 0.3 ? { planet: this.welt, dir: L.powerups[0].dir.clone() }
            : { planet: this.welt, dir: L.spawn.dir.clone() };
    this.player.reset({ planet: spot.planet, dir: spot.dir });
    if (progress >= 0.95) this.#arenaPoint(0, GLUT.arena - 1.5, 0.3, this.player.body.pos);
    else if (progress >= 0.55 && !onMoon) surfacePoint(spot.planet, spot.dir, L.plateau.top + 0.2, this.player.body.pos);
    else if (progress >= 0.3 && !onMoon) surfacePoint(spot.planet, spot.dir, 2.3, this.player.body.pos);
    this.player.model.group.visible = true;
    this.phase = 'play';
    this.fight = false;
    this.boss.reset();
    this.snap = true;
    return this.snapshot();
  }

  render(camera, dt = 0, { reducedMotion = false } = {}) {
    dt = Math.max(0, Math.min(dt ?? 0, 0.1));
    if (!this.rig) this.rig = new CameraRig(camera, this.level.planets);
    if (this.snap) {
      this.rig.distance = CAMERA_DISTANCE;
      this.rig.pitch = 0.38;
      this.rig.snap(this.player, this.player.facing);
      this.snap = false;
    }
    const t = this.elapsed;
    this.player.render(dt);
    this.enemies.update(t, camera);
    for (const p of this.plants) {
      const { model } = p;
      model.group.visible = !p.wilted || p.timer < 0.6;
      if (p.wilted) { model.body.scale.y = Math.max(0.05, 1 - p.timer * 2); continue; }
      const open = p.mode === 'windup' ? Math.min(1, p.timer / PLANT.windup) : p.mode === 'bite' ? 1 - Math.min(1, p.timer / PLANT.bite) : 0.15 + (reducedMotion ? 0 : Math.sin(t * 2 + p.phase) * 0.1);
      model.jaw.rotation.x = open * 0.6;
      model.head.position.y = 2.75 + (p.mode === 'bite' ? 0.35 : 0);
      if (!reducedMotion) model.head.rotation.z = Math.sin(t * 1.3 + p.phase) * 0.12;
      if (p.mode !== 'idle' && this.player.body.planet === p.planet) {
        const local = tmp.subVectors(this.player.body.pos, p.pos).applyQuaternion(model.group.quaternion.clone().invert());
        model.body.rotation.y = Math.atan2(local.x, local.z);
      }
    }
    for (const b of this.berries) if (!b.taken && !reducedMotion) b.group.rotateOnAxis(Y, dt * 1.5);

    // Glutzahn and his Kreisels, on the arena.
    const boss = this.boss, m = this.bossModel;
    m.group.visible = boss.mode !== 'defeated' || boss.timer < 1.2;
    this.#arenaPoint(boss.x, boss.z, 0, m.group.position);
    tmp.copy(this.arena.right).multiplyScalar(boss.facingX).addScaledVector(this.arena.forward, boss.facingZ);
    const side = tmp2.crossVectors(this.arena.up, tmp).normalize();
    basis.makeBasis(side, this.arena.up, tmp.normalize());
    m.group.quaternion.setFromRotationMatrix(basis);
    const walking = boss.mode === 'walk';
    const beat = t * 6;
    m.legL.rotation.x = walking ? Math.sin(beat) * 0.5 : 0;
    m.legR.rotation.x = walking ? -Math.sin(beat) * 0.5 : 0;
    m.head.rotation.x = boss.mode === 'aim' ? -0.45 : boss.mode === 'fire' ? 0.2 : boss.mode === 'tired' ? 0.5 : 0;
    m.body.rotation.x = boss.mode === 'tired' ? 0.25 : boss.mode === 'hurt' ? -0.2 : 0;
    m.body.position.y = boss.mode === 'tired' && !reducedMotion ? Math.abs(Math.sin(t * 3)) * -0.1 : 0;
    const down = boss.mode === 'defeated' ? Math.min(1, boss.timer / 1.2) : 0;
    m.body.scale.setScalar(m.scale * (1 - down));
    this.fire.visible = boss.mode === 'fire' || boss.mode === 'aim';
    if (this.fire.visible) {
      m.mouth.getWorldPosition(this.fire.position);
      this.fire.quaternion.copy(m.group.quaternion);
      const warm = boss.mode === 'aim';
      this.fire.scale.set(warm ? 0.25 : 1, warm ? 0.25 : 1, warm ? 0.15 : 1 + (reducedMotion ? 0 : Math.sin(t * 30) * 0.05));
      this.fire.material.opacity = warm ? 0.35 : 0.55;
      if (!warm && !reducedMotion) this.particles.burst(this.fire.position, { count: 2, color: [0xff8a2a, 0xffd23f, 0xff4a2d], speed: 5, size: 0.8, life: 0.5 });
    }
    this.kreisels.forEach((k, i) => {
      const spec = boss.kreisels[i];
      k.group.visible = Boolean(spec) && this.fight;
      if (!spec) return;
      this.#arenaPoint(spec.x, spec.z, 0, k.group.position);
      k.group.quaternion.copy(m.group.quaternion);
      if (!reducedMotion) k.body.rotation.y = t * 14;
    });

    for (const bit of this.world.bits) {
      if (bit.taken) continue;
      bit.mesh.rotation.y = t * 2 + bit.phase;
      bit.mesh.rotation.x = Math.sin(t + bit.phase) * 0.4;
    }
    for (const f of this.world.flags) {
      f.raise = Math.min(1, f.raise + (f.reached ? dt * 1.5 : 0));
      f.flag.position.y = THREE.MathUtils.lerp(f.lowY, f.highY, smooth(f.raise));
    }
    const goal = this.world.goal;
    goal.crystal.rotation.y = t * 0.8;
    goal.halo.scale.setScalar(6 + Math.sin(t * 3) * 0.6);
    this.particles.update(dt);
    this.world.update(dt, t, camera, this.player.body.pos);
  }

  snapshot() {
    const b = this.player.body;
    return {
      status: this.status, time: this.time, penalty: this.penalty, phase: this.phase,
      progress: this.status === 'finished' ? 1 : this.boss.defeated ? 0.95 : this.fight ? 0.85 : b.planet === this.mond ? 0.7 : this.powered ? 0.3 : 0.1,
      collectibles: this.collected, totalCollectibles: this.world.bits.length,
      hearts: this.player.hearts, maxHearts: MAX_HEARTS, powered: this.powered, fight: this.fight,
      boss: this.boss.snapshot(), planet: b.planet?.id ?? null, pos: b.pos.toArray(), grounded: b.onGround,
      forward: (this.rig?.forward ?? this.player.facing).toArray(),
      right: new THREE.Vector3().crossVectors(this.rig?.forward ?? this.player.facing, b.up).normalize().toArray(),
      rocket: this.rocket.phase, defeated: this.enemies.defeated + this.plants.filter(p => p.wilted).length,
      checkpoint: this.world.flags.filter(f => f.reached).length, actionHint: '',
    };
  }

  layout() {
    const L = this.level;
    const at = (planet, dir, height = 0) => surfacePoint(planet, dir, height).toArray();
    return {
      planets: L.planets.map(p => ({ id: p.id, center: p.center.toArray(), radius: p.radius })),
      berries: L.powerups.map(p => ({ id: p.id, pos: at(p.planet, p.dir, p.height) })),
      plants: L.plants.map(p => ({ id: p.id, planet: p.planet.id, pos: at(p.planet, p.dir) })),
      walkers: L.walkers.map(w => ({ id: w.id, kind: w.kind, planet: w.planet.id, pos: at(w.planet, w.dir) })),
      rocket: at(this.welt, L.rocket.dir, L.rocket.height),
      arena: { center: this.arena.center.toArray(), radius: GLUT.arena },
      bits: this.world.bits.length,
    };
  }
}
