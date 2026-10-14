// Der Raketenritt: Mirio on Miro's rocket through the asteroids to the
// Riesenstern, down onto it, round it on foot and up Krakel's arms.
//
//   flight, landing  star-rules.js: the lane runs along -Z high over the
//                    star, which sits at the origin; the rocket comes down on
//                    the pad by its north pole.
//   star             Mirio on foot with the platformer's physics (player.js,
//                    world.js) and its camera (camera.js), round the star
//                    south along longitude 0 (star-level.js).
//   arena            Krakel's fight on the disc over the south pole
//                    (krakel-rules.js); his arms and head are colliders here.
//
// Runs as a chapter (see main.js CHAPTER_TYPES): reset, step, render,
// snapshot, layout, seek, rescue, and `scene`.

import * as THREE from 'three';
import { CameraRig } from './camera.js';
import { EnemySystem } from './enemies.js';
import { KRAKEL, KrakelRules, armLumps, neckLumps } from './krakel-rules.js';
import { collidersFor } from './level.js';
import { toon } from './materials.js';
import { buildMirio } from './mirio-model.js';
import { MAX_HEARTS, Player } from './player.js';
import { buildRocket } from './props.js';
import { Particles, buildScene, placeOn } from './scene.js';
import { buildInk, buildKrakel, buildRingWave, buildStarDressing, buildZischer, buildZischerWalker } from './star-creatures.js';
import { METEOR, ROUTE, STAR_POINT, STAR_RADIUS, latLonOf, makeStarLevel, meteorZone, routeProgress } from './star-level.js';
import {
  FLIGHT, LANDING, asteroidPosition, createStarRun, flightSnapshot, makeStarCourse, rescueStarFlight, seekStarFlight, stepStarFlight, zischerPosition,
} from './star-rules.js';
import { dirFromLatLon, heightAbove, mulberry32, surfacePoint, tangentDir } from './world.js';

const PHYSICS_STEP = 1 / 120;
const BIT_RADIUS = 1.3;
const FLAG_RADIUS = 3.4;
const SHARD_RADIUS = 1.6;
// A spring flower throws Mirio about 8 m up, jump button or not.
const SPRING = Object.freeze({ reach: 1.5, speed: 19, gravity: 0.6 });
const CAMERA_DISTANCE = 11;
const ROCKET_LENGTH = 4;
// Share of the progress bar for each part.
const SHARE = Object.freeze({ flight: 0.45, landing: 0.03, star: 0.27 });
// The lane ends high over the star's north pole, a little out along +Z.
const LANE_END = new THREE.Vector3(0, STAR_RADIUS + 34, 95);
const Y = new THREE.Vector3(0, 1, 0);
const smooth = (t) => t * t * (3 - 2 * t);
const matrix = new THREE.Matrix4(), dummy = new THREE.Object3D();
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), look = new THREE.Vector3(), camPos = new THREE.Vector3();

/** Forward is the direction of travel; right is screen-right from behind. */
export function starFrame(s) {
  const z = LANE_END.z + (FLIGHT.length - s);
  const center = new THREE.Vector3(7 * Math.sin(s / 170) + 3 * Math.sin(s / 61), LANE_END.y + 5 * Math.sin(s / 230) + 2 * Math.cos(s / 90) - 2, z);
  const forward = new THREE.Vector3(7 / 170 * Math.cos(s / 170) + 3 / 61 * Math.cos(s / 61),
    5 / 230 * Math.cos(s / 230) - 2 / 90 * Math.sin(s / 90), -1).normalize();
  const right = new THREE.Vector3().crossVectors(forward, Y).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return { center, forward, right, up };
}
function point(frame, x, y, out = new THREE.Vector3()) {
  return out.copy(frame.center).addScaledVector(frame.right, x).addScaledVector(frame.up, y);
}
/** Model +Z along `forward`, +Y along `up`. */
function orient(object, forward, up) {
  tmp.crossVectors(up, forward).normalize();
  tmp2.crossVectors(forward, tmp).normalize();
  matrix.makeBasis(tmp, tmp2, forward);
  object.quaternion.setFromRotationMatrix(matrix);
}

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

/** A lumpy grey rock, the same every time. */
function asteroidGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const pos = geometry.attributes.position, p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    p.multiplyScalar(1 + 0.16 * Math.sin(p.x * 4.1 + p.y * 2.3) * Math.cos(p.z * 3.7 - p.x) + 0.08 * Math.sin(p.y * 9 + p.z * 5));
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function shotGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.22 : 0.55;
    if (!i) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.06);
}

function pool(geometry, material, count, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.name = name;
  mesh.count = 0;
  return mesh;
}

/** A spring flower like the Vulkanreise's. */
function springFlower() {
  const group = new THREE.Group(), petals = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6).scale(0.5, 0.1, 0.28), toon(i % 2 ? 0xf49ac1 : 0xffc2dc));
    petal.position.set(Math.cos(a) * 0.62, 0.14, Math.sin(a) * 0.62);
    petal.rotation.y = -a;
    petals.add(petal);
  }
  petals.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 8).scale(1, 0.35, 1).translate(0, 0.2, 0), toon(0xf5c864)));
  group.add(petals);
  return { group, petals, squash: 0 };
}

export class StarRun {
  constructor(art) {
    this.course = makeStarCourse();
    this.level = makeStarLevel();
    this.star = this.level.star;
    this.scene = new THREE.Scene();
    this.scene.name = 'raketenritt';
    // The star planet with its gems, flags, steps, the arena disc and the crystal.
    this.world = buildScene(this.scene, this.level, art);
    this.world.rocket.group.visible = false;
    // The two little rockets that circle a planet: round the star's points.
    this.world.flyers.forEach((f, i) => { f.radius = 135 + i * 18; });
    this.dressing = buildStarDressing(art, {
      radius: STAR_RADIUS, points: this.level.points, length: STAR_POINT.length, base: STAR_POINT.base,
      // Miro's two dot eyes, one above the other, beside the landing pad.
      eyes: [{ dir: dirFromLatLon(75, 11), size: [2.4, 3.6] }, { dir: dirFromLatLon(70, 12), size: [2.4, 3.6] }],
    });
    this.scene.add(this.dressing.group);
    this.particles = new Particles(this.scene, art.sparkle);

    // Solid things: the level's, the four points, and Krakel (added and taken away as he changes).
    this.colliders = collidersFor(this.level);
    this.solid = this.colliders(this.star);
    // The arena's top is the star's own ground here (starHeight); level.js's
    // arena cylinder at the same height would push feet a hair below its top
    // out sideways to its rim.
    this.solid.splice(this.solid.findIndex(c => c.kind === 'cyl' && c.radius === this.level.arena.radius), 1);
    for (const dir of this.level.points) {
      this.solid.push({ kind: 'cyl', base: surfacePoint(this.star, dir, -2), axis: dir.clone(), radius: STAR_POINT.base * 0.75, height: STAR_POINT.length });
    }
    const ar = this.level.arena;
    this.arena = { center: surfacePoint(this.star, ar.dir, 0), up: ar.dir.clone() };
    this.arena.forward = tangentDir(ar.facing, ar.dir);
    this.arena.right = new THREE.Vector3().crossVectors(this.arena.up, this.arena.forward).normalize();
    this.armColliders = KRAKEL.arms.map((_, i) => [...armLumps(i), ...neckLumps(i)].map(l => ({ kind: 'bump', center: this.#arenaPoint(l.x, l.z, l.height), radius: l.radius })));
    this.headCollider = { kind: 'bump', center: new THREE.Vector3(), radius: KRAKEL.head.radius };
    // While the fight is on, a fence round the arena's rim keeps Mirio on it.
    this.fence = Array.from({ length: 40 }, (_, i) => {
      const a = (i + 0.5) / 40 * Math.PI * 2, r = KRAKEL.arena + 0.5;
      // From well under the ground at the rim (the star curves away 3.5 m below it) to high over the arena.
      const base = this.#arenaPoint(Math.sin(a) * r, Math.cos(a) * r, -7);
      const forward = this.#arenaPoint(Math.cos(a), -Math.sin(a), 0).sub(this.arena.center).normalize();
      return { kind: 'box', base, axis: this.arena.up.clone(), forward, right: new THREE.Vector3().crossVectors(forward, this.arena.up).normalize(),
        halfW: 0.5, halfD: Math.PI * r / 40 + 0.25, height: 17 };
    });

    this.player = new Player(this.scene, art, this.level.planets, this.colliders);
    this.enemies = new EnemySystem(this.scene, this.level, art, { layouts: this.level.walkers, build: buildZischerWalker });
    // Stage two brings two Zischer onto the arena, stage three two more.
    this.arenaEnemies = [this.level.arenaWalkers.slice(0, 2), this.level.arenaWalkers.slice(2)]
      .map(layouts => new EnemySystem(this.scene, this.level, art, { layouts, build: buildZischerWalker }));
    this.springs = this.level.springs.map(spec => {
      const flower = springFlower();
      placeOn(flower.group, spec.planet, spec.dir, 0);
      this.scene.add(flower.group);
      return { ...flower, pos: surfacePoint(spec.planet, spec.dir, 0) };
    });
    // For the head: spring flowers grow on the arena to get up onto it.
    this.arenaSprings = [0.6, 2.7, 4.8].map(a => {
      const flower = springFlower(), pos = this.#arenaPoint(Math.sin(a) * 11, Math.cos(a) * 11, 0);
      placeOn(flower.group, this.star, pos.clone().normalize(), 0);
      this.scene.add(flower.group);
      return { ...flower, pos };
    });
    // The three Sternsplitter: little golden stars that open the arena's fence.
    const shardGeometry = shotGeometry().scale(2.2, 2.2, 3);
    this.shards = this.level.shards.map(spec => {
      const mesh = new THREE.Mesh(shardGeometry, toon(0xffe36a, { emissive: 0xb07a00 }));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: art.glow, color: 0xffd34a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(4);
      mesh.add(glow);
      placeOn(mesh, spec.planet, spec.dir, spec.height);
      this.scene.add(mesh);
      return { ...spec, mesh, taken: false };
    });
    this.meteors = Array.from({ length: 5 }, () => {
      const rock = new THREE.Mesh(asteroidGeometry(), toon(0x8a5a3a, { emissive: 0x7a2a00 }));
      rock.scale.setScalar(0.9);
      const trail = new THREE.Mesh(new THREE.ConeGeometry(0.8, 5, 10, 1, true).translate(0, 2.5, 0),
        new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      rock.add(trail);
      const mark = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
      this.scene.add(rock, mark);
      return { rock, mark, active: false };
    });

    // Krakel, in the arena's frame.
    this.krakel = buildKrakel(art);
    this.krakel.group.position.copy(this.arena.center);
    matrix.makeBasis(this.arena.right, this.arena.up, this.arena.forward);
    this.krakel.group.quaternion.setFromRotationMatrix(matrix);
    this.scene.add(this.krakel.group);
    this.boss = new KrakelRules();
    this.inks = Array.from({ length: 4 }, () => { const ink = buildInk(); this.krakel.group.add(ink.blob, ink.mark); return ink; });
    this.rings = Array.from({ length: 4 }, () => { const ring = buildRingWave(); this.krakel.group.add(ring); return ring; });

    // The rocket with Mirio astride it: nose forward, flame behind.
    this.ship = new THREE.Group();
    this.rocket = buildRocket(art);
    const scale = ROCKET_LENGTH / this.rocket.height;
    this.rocket.group.scale.setScalar(scale);
    this.rocket.group.rotation.x = Math.PI / 2;
    this.ship.add(this.rocket.group);
    this.scene.add(this.ship);
    this.rider = buildMirio(art);
    this.rider.group.position.set(0, this.rocket.radius * scale * 0.8 - 0.55, ROCKET_LENGTH * 0.42);
    this.rider.legL.rotation.set(-0.55, 0, -0.45);
    this.rider.legR.rotation.set(-0.55, 0, 0.45);
    this.rider.armL.rotation.set(-0.9, 0, this.rider.armRestZ.L * 0.5);
    this.rider.armR.rotation.set(-0.9, 0, this.rider.armRestZ.R * 0.5);
    this.ship.add(this.rider.group);

    // The flight's things.
    this.asteroids = pool(asteroidGeometry(), toon(0xffffff, { map: art.felt }), this.course.asteroids.length, 'raketenritt:asteroids');
    this.course.asteroids.forEach((a, i) => this.asteroids.setColorAt(i, this.#rockColor(i)));
    this.hoops = pool(new THREE.TorusGeometry(FLIGHT.ringRadius, 0.16, 8, 40), toon(0xffd34a, { emissive: 0x8a5a00 }), this.course.rings.length, 'raketenritt:rings');
    this.shots = pool(shotGeometry(), new THREE.MeshBasicMaterial({ color: 0xffe36a }), 32, 'raketenritt:stars');
    this.sparks = pool(new THREE.SphereGeometry(0.55, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff5a2a }), 24, 'raketenritt:sparks');
    this.streaks = pool(new THREE.CylinderGeometry(0.02, 0.04, 1, 4).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff7df, transparent: true, opacity: 0.4, depthWrite: false }), 26, 'raketenritt:streaks');
    this.scene.add(this.asteroids, this.hoops, this.shots, this.sparks, this.streaks);
    this.flyers = Array.from({ length: 3 }, () => { const z = buildZischer(art); z.group.visible = false; z.group.scale.setScalar(1.3); this.scene.add(z.group); return z; });

    this.rig = null;
    this.reset();
  }

  reset() {
    this.run = createStarRun();
    for (const shard of this.shards) { shard.taken = false; shard.mesh.visible = true; }
    Object.assign(this, { found: 0, lockedHint: false, collected: 0, fight: false, snap: true, flightCamera: false, landFrom: null, bestRoute: 0, meteorClock: 1, byeT: 0, visualTime: 0, bank: 0, pitch: 0, flash: 0 });
    this.random = mulberry32(4711);
    this.player.reset({ planet: this.star, dir: this.level.spawn.dir.clone() }, new THREE.Vector3(1, 0, 0));
    this.player.board();
    this.player.events.length = 0;
    this.enemies.reset();
    this.arenaEnemies.forEach(e => e.reset());
    for (const bit of this.world.bits) { bit.taken = false; bit.mesh.visible = true; }
    for (const f of this.world.flags) { f.reached = false; f.raise = 0; }
    for (const m of this.meteors) m.active = false;
    this.boss.reset();
    this.#syncColliders();
    this.world.goal.group.visible = true;
    this.world.goal.bubble.visible = true;
    this.krakel.group.visible = true;
    this.krakel.head.scale.setScalar(1);
    this.ship.visible = true;
    this.rider.group.visible = true;
    return this.snapshot();
  }

  // ---- Arena frame ---------------------------------------------------------

  #arenaLocal(pos) {
    const rel = tmp3.subVectors(pos, this.arena.center);
    return { x: rel.dot(this.arena.right), z: rel.dot(this.arena.forward), height: rel.dot(this.arena.up) };
  }

  #arenaPoint(x, z, height, out = new THREE.Vector3()) {
    return out.copy(this.arena.center).addScaledVector(this.arena.right, x).addScaledVector(this.arena.forward, z).addScaledVector(this.arena.up, height);
  }

  /** Krakel's arms are solid until curled up; his head is solid where it is. */
  #syncColliders() {
    // Shut until the three Sternsplitter are found, and again for the fight.
    const fenced = (this.fight && !this.boss.defeated) || this.found < this.shards.length;
    const keep = new Set([...this.armColliders.filter((_, i) => !this.boss.curled[i]).flat(), ...(this.boss.defeated ? [] : [this.headCollider]), ...(fenced ? this.fence : [])]);
    const all = new Set([...this.armColliders.flat(), this.headCollider, ...this.fence]);
    for (let i = this.solid.length - 1; i >= 0; i--) if (all.has(this.solid[i]) && !keep.has(this.solid[i])) this.solid.splice(i, 1);
    for (const c of keep) if (!this.solid.includes(c)) this.solid.push(c);
    const h = this.boss.head;
    this.#arenaPoint(h.x, h.z, h.height, this.headCollider.center);
  }

  // ---- Step ----------------------------------------------------------------

  step(dt, controls = {}, input = null) {
    const run = this.run;
    if (run.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return [];
    if (run.phase === 'flight' || run.phase === 'landing') return this.#flightStep(dt, controls);
    if (!this.rig) return [];
    dt = Math.min(dt, 0.1);
    run.time += dt;
    run.elapsed += dt;
    run.phaseTime += dt;
    const events = [], player = this.player;
    player.readInput(intent(controls), this.rig);
    const steps = Math.max(1, Math.ceil(dt / PHYSICS_STEP)), h = dt / steps;
    for (let i = 0; i < steps; i++) player.step(h);

    // How Mirio came down this frame, for stomps.
    const landing = player.events.findLast(e => e.type === 'pound' || e.type === 'land');
    const impact = landing ? { ...this.#arenaLocal(landing.pos ?? player.body.pos), pound: landing.type === 'pound', speed: landing.speed ?? 0 } : null;

    events.push(...this.enemies.step(dt, player, { active: run.phase === 'star' }));
    const boss = this.boss, fighting = run.phase === 'arena' && !boss.defeated;
    this.arenaEnemies.forEach((system, i) => events.push(...system.step(dt, player, { active: fighting && boss.stage >= i + 2 })));
    this.#springsStep(events);
    this.#pickups(events);
    if (run.phase === 'star') this.#meteorsStep(dt, events);
    this.#arenaStep(dt, impact, events);
    this.#goal(events);

    for (const ev of player.events.splice(0)) {
      if (ev.type === 'faint') {
        run.penalty += 3;
        run.time += 3;
        events.push({ type: 'checkpoint', kind: 'rescue', penalty: 3 });
      } else if (ev.type === 'jump') events.push({ type: ['jump', 'jump2', 'triple'][(ev.level ?? 1) - 1] });
      else if (['hurt', 'pound', 'land', 'spin', 'poundStart'].includes(ev.type)) events.push({ type: ev.type });
    }
    this.rig.distance = CAMERA_DISTANCE + (this.fight ? 8 : 0);
    this.rig.update(dt, player, input ?? { consumeCamera: () => ({ x: 0, y: 0 }) });
    return events;
  }

  #flightStep(dt, controls) {
    const run = this.run, events = stepStarFlight(run, this.course, dt, controls);
    for (const event of events) {
      if (event.type === 'slam') {
        const a = this.course.asteroids.find(item => item.id === event.id), p = asteroidPosition(a, run.elapsed);
        this.particles.burst(point(starFrame(a.s), p.x, p.y), { count: a.big ? 26 : 12, color: [0xb7a89a, 0xffe36a, 0x8a7f86], speed: 10, size: 0.9, life: 0.7 });
      }
      if (event.type === 'enemyDefeat') this.particles.burst(point(starFrame(event.at.s), event.at.x, event.at.y), { count: 18, color: [0x222222, 0xe0262f, 0xf6e64e], speed: 9, size: 0.8 });
      if (event.type === 'ring') this.particles.burst(this.ship.position, { count: 10, color: [0xffd34a, 0xffffff], speed: 6, size: 0.5, life: 0.4 });
      if (event.type === 'planeBump') this.flash = 0.5;
      if (event.type === 'arrive') this.landFrom = { pos: this.ship.position.clone(), forward: starFrame(this.course.length).forward };
      if (event.type === 'land') this.#disembark();
    }
    return events;
  }

  /** Off the rocket on the pad and onto Mirio's own feet. */
  #disembark() {
    this.rider.group.visible = false;
    this.player.leaveRocket({ planet: this.star, dir: this.level.spawn.dir.clone() }, new THREE.Vector3(1, 0, 0));
    this.#parkShip();
    this.snap = true;
  }

  #parkShip() {
    const pad = this.level.landing;
    surfacePoint(this.star, pad.dir, pad.height, this.ship.position);
    orient(this.ship, pad.dir, tangentDir(new THREE.Vector3(1, 0, 0), pad.dir));
    this.ship.visible = true;
  }

  #springsStep(events) {
    const player = this.player, headPhase = this.boss.stage > 3 && !this.boss.defeated;
    for (const s of [...this.springs, ...(headPhase ? this.arenaSprings : [])]) {
      s.squash = Math.max(0, s.squash - 0.05);
      if (!player.body.onGround || player.body.pos.distanceTo(s.pos) > SPRING.reach) continue;
      player.bounce({ speed: SPRING.speed, gravityScale: SPRING.gravity });
      s.squash = 1;
      events.push({ type: 'spring' });
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
    for (const shard of this.shards) {
      if (shard.taken || shard.pos.distanceTo(mid) > SHARD_RADIUS) continue;
      shard.taken = true;
      shard.mesh.visible = false;
      this.found++;
      events.push({ type: 'shard', found: this.found, total: this.shards.length });
      this.particles.burst(shard.pos, { count: 26, color: [0xffe36a, 0xffffff, 0xffb04a], speed: 6, size: 0.7, life: 0.8 });
      if (this.found === this.shards.length) this.#syncColliders();
    }
    // At the shut fence: say what opens it, once.
    if (this.found < this.shards.length && !this.lockedHint && this.#arenaLocal(player.body.pos).height > -6
      && Math.hypot(this.#arenaLocal(player.body.pos).x, this.#arenaLocal(player.body.pos).z) < KRAKEL.arena + 4) {
      this.lockedHint = true;
      events.push({ type: 'locked', found: this.found, total: this.shards.length });
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

  /** Meteors fall where Mirio is heading, each announced by a growing ring on the ground. */
  #meteorsStep(dt, events) {
    const player = this.player, { lat } = latLonOf(tmp.copy(player.body.pos).normalize()), zone = meteorZone(lat);
    this.meteorClock -= dt;
    if (zone && this.meteorClock <= 0 && player.state === 'play') {
      const free = this.meteors.find(m => !m.active);
      if (free) {
        this.meteorClock = zone.every;
        const a = this.random() * Math.PI * 2, r = this.random() * METEOR.scatter;
        const side = tangentDir(tmp2.set(0, 0, 1), player.body.up) ?? tmp2.set(1, 0, 0), ahead = tmp3.crossVectors(player.body.up, side);
        const at = tmp.copy(player.body.pos).addScaledVector(player.body.vel, METEOR.lead).addScaledVector(side, Math.cos(a) * r).addScaledVector(ahead, Math.sin(a) * r);
        Object.assign(free, { active: true, t: 0, dir: at.normalize().clone() });
        events.push({ type: 'enemyNotice', kind: 'meteor' });
      }
    }
    for (const m of this.meteors) {
      if (!m.active) continue;
      m.t += dt;
      if (m.t < METEOR.warn) continue;
      m.active = false;
      const ground = surfacePoint(this.star, m.dir, 0);
      this.particles.burst(ground, { count: 22, color: [0xff7a2a, 0xffd23f, 0x8a5a3a], speed: 8, size: 0.8, life: 0.6 });
      events.push({ type: 'slam', kind: 'meteor' });
      const across = tmp.subVectors(player.body.pos, ground);
      const up = across.dot(m.dir);
      if (across.addScaledVector(m.dir, -up).length() < METEOR.reach && heightAbove(player.body.pos, this.star) < METEOR.hurtHeight) player.hurt(ground);
    }
  }

  #arenaStep(dt, impact, events) {
    const run = this.run, player = this.player, boss = this.boss, local = this.#arenaLocal(player.body.pos);
    const onArena = Math.hypot(local.x, local.z) < KRAKEL.arena - 0.5 && local.height > -1 && local.height < 20;
    if (run.phase === 'star' && onArena && player.state === 'play') {
      run.phase = 'arena';
      run.phaseTime = 0;
      this.fight = true;
      for (const m of this.meteors) m.active = false;
      // Out of hearts in the fight, Mirio is back on the arena, not down by the flag.
      player.checkpoint = { planet: this.star, dir: this.#arenaPoint(0, KRAKEL.arena - 3, 0).normalize() };
      events.push(...boss.start());
    }
    if (run.phase !== 'arena') return;
    const state = { ...local, onGround: player.body.onGround, impact };
    for (const ev of boss.step(dt, state)) {
      if (ev.type === 'hurt') player.hurt(this.#arenaPoint(ev.x, ev.z, 0));
      else if (ev.type === 'toss') {
        // Shaken off: flung outwards, away from the arm.
        const out = tmp.set(local.x, 0, local.z).normalize();
        const dir = this.#arenaPoint(out.x, out.z, 0, tmp2).sub(this.arena.center);
        player.bounce({ speed: 11, direction: dir, horizontalSpeed: 9 });
        events.push({ type: 'hurt', kind: 'toss' });
      } else if (ev.type === 'bossHit') {
        player.bounce();
        const at = ev.arm === undefined ? this.#arenaPoint(boss.head.x, boss.head.z, boss.head.top) : player.body.pos.clone();
        this.particles.burst(at, { count: 30, color: [0xff8fd0, 0x5fb0ff, 0xffffff], speed: 8, size: 0.8, life: 0.8 });
        events.push({ type: 'bossHit', hp: ev.hp, arm: ev.arm });
        if (ev.arm !== undefined) events.push({ type: 'armDown', arms: boss.curled.filter(Boolean).length });
      } else if (ev.type === 'bounce') player.bounce();
      else if (ev.type === 'bossStage') {
        events.push({ type: 'roar', kind: 'bossStage', stage: ev.stage });
        for (const e of this.arenaEnemies[ev.stage - 2]?.enemies ?? []) this.particles.burst(e.pos, { count: 14, color: [0x222222, 0xe0262f, 0xf6e64e], speed: 5, size: 0.7 });
      } else if (ev.type === 'bossDefeat') {
        this.fight = false;
        this.world.goal.bubble.visible = false;
        events.push({ type: 'bossDown' });
      } else if (ev.type === 'splash') {
        this.particles.burst(this.#arenaPoint(ev.x, ev.z, 0.3), { count: 14, color: [0x16336e, 0x2a5fd0, 0x5fa0ff], speed: 6, size: 0.7, life: 0.6 });
        events.push({ type: 'splash' });
      } else if (ev.type === 'slam') {
        this.particles.burst(this.#arenaPoint(ev.x, ev.z, 0.3), { count: 26, color: [0x2a5fd0, 0xffffff], speed: 9, size: 0.9, life: 0.7 });
        events.push({ type: 'slam' });
      } else if (['roar', 'shudder', 'shake', 'spit', 'bossJump'].includes(ev.type)) events.push({ type: ev.type, kind: ev.kind });
    }
    this.#syncColliders();
  }

  #goal(events) {
    if (!this.boss.defeated || this.world.goal.group.position.distanceTo(this.player.body.pos) > 3.2) return;
    this.run.status = 'finished';
    this.player.win();
    events.push({ type: 'finish', time: this.run.time, collectibles: this.collected });
  }

  rescue() {
    const run = this.run;
    if (run.phase === 'flight') { const events = rescueStarFlight(run, this.course); this.flightCamera = false; return events; }
    if (run.status !== 'playing' || !['star', 'arena'].includes(run.phase)) return [];
    this.player.respawn();
    run.penalty += 2;
    run.time += 2;
    this.snap = true;
    return [{ type: 'checkpoint', kind: 'rescue', penalty: 2 }];
  }

  /**
   * Test staging, never granting anything. Below .45 the flight (that share
   * of it); .45 the landing; .48 to .75 on foot round the star (the share of
   * the way); .75 at the arena's edge; .8 stage two, .85 stage three, .9 the
   * head down and dazed.
   */
  seek(progress) {
    const run = this.run;
    progress = THREE.MathUtils.clamp(Number(progress) || 0, 0, 0.999);
    this.flightCamera = false;
    if (progress < SHARE.flight) {
      seekStarFlight(run, this.course, progress / SHARE.flight);
      this.rider.group.visible = true;
      this.player.board();
      return this.snapshot();
    }
    if (progress < SHARE.flight + SHARE.landing) {
      run.phase = 'landing';
      run.s = this.course.length;
      run.phaseTime = 0;
      this.landFrom = null;
      return this.snapshot();
    }
    run.phase = 'star';
    run.phaseTime = 0;
    this.rider.group.visible = false;
    this.#parkShip();
    this.fight = false;
    this.boss.reset();
    let lat = ROUTE.spawn - 3 - (progress - SHARE.flight - SHARE.landing) / SHARE.star * (ROUTE.spawn - 3 - ROUTE.entrance);
    // At the arena: just inside its rim, at the claw of the first arm, facing Krakel.
    // Its fence opens only for all three Sternsplitter, so staging there finds them.
    const atArena = this.#arenaPoint(0, 16.3, 0);
    if (progress >= 0.75) for (const shard of this.shards) { shard.taken = true; shard.mesh.visible = false; this.found = this.shards.length; }
    if (progress >= 0.75) this.player.reset({ planet: this.star, dir: atArena.clone().normalize() }, this.arena.center.clone().sub(atArena));
    else this.player.reset({ planet: this.star, dir: dirFromLatLon(lat, 0) }, new THREE.Vector3(0, -1, 0));
    if (progress >= 0.8) {
      // Straight into a later stage: the fight is on, earlier arms curled, Mirio by the arm that glows.
      run.phase = 'arena';
      this.fight = true;
      const stage = progress >= 0.9 ? 4 : progress >= 0.85 ? 3 : 2, yaw = KRAKEL.arms[Math.min(2, stage - 1)];
      const at = stage === 4 ? this.#arenaPoint(0, 13, 0) : this.#arenaPoint(Math.sin(yaw) * 16.3, Math.cos(yaw) * 16.3, 0);
      this.player.reset({ planet: this.star, dir: at.clone().normalize() }, this.arena.center.clone().sub(at));
      this.player.checkpoint = { planet: this.star, dir: this.#arenaPoint(0, KRAKEL.arena - 3, 0).normalize() };
      Object.assign(this.boss, { mode: stage === 4 ? 'dazed' : 'arms', timer: 0, stage, curled: [0, 1, 2].map(i => i < stage - 1), attackIn: 3 });
      if (stage === 4) Object.assign(this.boss.head, { height: KRAKEL.head.sunkHeight, top: KRAKEL.head.sunkTop });
    }
    this.#syncColliders();
    this.snap = true;
    return this.snapshot();
  }

  #progress() {
    const run = this.run;
    if (run.status === 'finished') return 1;
    if (run.phase === 'flight') return run.s / this.course.length * SHARE.flight;
    if (run.phase === 'landing') return SHARE.flight + Math.min(1, run.phaseTime / LANDING.duration) * SHARE.landing;
    this.bestRoute = Math.max(this.bestRoute, routeProgress(tmp.copy(this.player.body.pos).normalize()));
    const walked = SHARE.flight + SHARE.landing + this.bestRoute * SHARE.star;
    return run.phase === 'arena' ? SHARE.flight + SHARE.landing + SHARE.star + this.boss.progress * (1 - SHARE.flight - SHARE.landing - SHARE.star) : walked;
  }

  snapshot() {
    const run = this.run, player = this.player, boss = this.boss, onFoot = run.phase === 'star' || run.phase === 'arena';
    const fwd = this.rig ? tangentDir(this.rig.forward, player.body.up, new THREE.Vector3()) : null;
    return {
      status: run.status, phase: run.phase, time: run.time, elapsed: run.elapsed, penalty: run.penalty, progress: this.#progress(),
      ...flightSnapshot(run, this.course),
      hearts: player.hearts, maxHearts: MAX_HEARTS, fight: this.fight,
      collectibles: this.collected, totalCollectibles: this.world.bits.length, shards: this.found, totalShards: this.shards.length,
      defeated: run.zapped + this.enemies.defeated + this.arenaEnemies.reduce((n, e) => n + e.defeated, 0),
      lat: onFoot ? latLonOf(tmp.copy(player.body.pos).normalize()).lat : null,
      pos: player.body.pos.toArray(), up: player.body.up.toArray(),
      forward: fwd?.toArray() ?? null, right: fwd ? new THREE.Vector3().crossVectors(fwd, player.body.up).toArray() : null,
      onGround: player.body.onGround, playerState: player.state,
      boss: boss.snapshot(), arena: onFoot ? this.#arenaLocal(player.body.pos) : null,
    };
  }

  layout() {
    const at = (planet, dir) => surfacePoint(planet, dir, 0).toArray();
    return {
      length: this.course.length, checkpoints: [...this.course.checkpoints], belts: [...this.course.belts],
      rings: this.course.rings.map(r => ({ ...r })),
      asteroids: this.course.asteroids.map(a => ({ id: a.id, s: a.s, x: a.x, y: a.y, radius: a.radius, hp: a.hp, belt: Boolean(a.belt) })),
      zischer: this.course.zischer.map(z => ({ ...z })),
      star: { radius: STAR_RADIUS, flags: this.level.flags.map(f => at(f.planet, f.dir)), springs: this.level.springs.map(s => at(s.planet, s.dir)), bits: this.level.bits.length,
        shards: this.level.shards.map(sh => sh.pos.toArray()) },
      arena: { center: this.arena.center.toArray(), up: this.arena.up.toArray(), forward: this.arena.forward.toArray(), right: this.arena.right.toArray(), radius: KRAKEL.arena,
        arms: KRAKEL.arms.map((_, i) => armLumps(i).map(l => this.#arenaPoint(l.x, l.z, l.height + l.radius).toArray())),
        springs: this.arenaSprings.map(s => s.pos.toArray()) },
    };
  }

  // ---- Render --------------------------------------------------------------

  render(camera, dt = 0, { reducedMotion = false } = {}) {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    if (!this.rig) this.rig = new CameraRig(camera, this.level.planets);
    this.visualTime += dt;
    const run = this.run, t = this.visualTime, onFoot = run.phase === 'star' || run.phase === 'arena';
    this.flash = Math.max(0, this.flash - dt);
    const flame = this.rocket.flame;
    flame.visible = run.phase === 'flight' || (run.phase === 'landing' && run.phaseTime < LANDING.duration * 0.9);
    flame.scale.set(1, reducedMotion ? 1 : 1 + Math.sin(t * 37) * 0.18 + (run.burst > 0 ? 0.5 : 0), 1);
    if (run.phase === 'flight') this.#renderFlight(camera, dt, reducedMotion);
    else this.#hideFlight();
    if (run.phase === 'landing') this.#renderLanding(camera, dt);
    if (onFoot) {
      if (this.snap) {
        this.rig.distance = CAMERA_DISTANCE;
        this.rig.pitch = 0.4;
        this.rig.snap(this.player, this.player.facing);
        this.snap = false;
      }
      this.player.render(dt);
      if (camera.fov !== (camera.aspect < 0.85 ? 72 : 60)) { camera.fov = camera.aspect < 0.85 ? 72 : 60; camera.updateProjectionMatrix(); }
    }
    this.enemies.update(t, camera);
    this.arenaEnemies.forEach((system, i) => { system.update(t, camera); system.group.visible = this.fight && this.boss.stage >= i + 2; });
    for (const s of [...this.springs, ...this.arenaSprings]) s.petals.scale.set(1 + s.squash * 0.2, 1 - s.squash * 0.5, 1 + s.squash * 0.2);
    const headPhase = this.boss.stage > 3 && !this.boss.defeated;
    for (const s of this.arenaSprings) s.group.visible = headPhase;
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
    for (const shard of this.shards) if (!shard.taken) shard.mesh.rotateY(reducedMotion ? 0 : dt * 1.8);
    this.#renderMeteors(t);
    this.#renderKrakel(dt, t, reducedMotion);
    // On the star its glow is behind the horizon; keep a little of it in the sky.
    this.dressing.glow.material.opacity = onFoot ? 0.35 : 1;
    this.particles.update(dt);
    this.world.update(dt, t, camera, onFoot ? this.player.body.pos : this.ship.position);
  }

  #hideFlight() {
    this.asteroids.count = this.hoops.count = this.shots.count = this.sparks.count = this.streaks.count = 0;
    this.flyers.forEach(z => (z.group.visible = false));
  }

  #rockColor(i) {
    this.rockColorTmp ??= new THREE.Color();
    return this.rockColorTmp.setHSL(0.07 + (i % 5) * 0.015, 0.18, this.course.asteroids[i].big ? 0.26 : this.course.asteroids[i].belt ? 0.3 : 0.34);
  }

  #renderFlight(camera, dt, reducedMotion) {
    const r = this.run, frame = starFrame(r.s), blend = 1 - Math.exp(-7 * dt);
    this.bank += ((reducedMotion ? 0 : r.vx / FLIGHT.lateralSpeed * 0.5) - this.bank) * blend;
    this.pitch += ((reducedMotion ? 0 : -r.vy / FLIGHT.verticalSpeed * 0.2) - this.pitch) * blend;
    const roll = !reducedMotion && r.roll > 0 ? (1 - r.roll / FLIGHT.rollDuration) * Math.PI * 2 : 0;
    point(frame, r.x, r.y, this.ship.position);
    orient(this.ship, frame.forward, frame.up);
    this.ship.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, 0, this.bank + roll)));
    this.ship.visible = !r.invulnerable || Math.floor(r.invulnerable * 14) % 2 === 0 || r.roll > 0;

    // Above, behind and a little to the side: Mirio on his rocket low in the picture, the lane open ahead.
    const followDistance = 11 * Math.max(1, Math.min(1.9, 0.85 / Math.max(0.2, camera.aspect)));
    point(starFrame(r.s - followDistance), r.x * 0.5 + 3, 4.6 + r.y * 0.45, camPos);
    point(starFrame(r.s + 40), r.x * 0.35, r.y * 0.3 + 2.5, look);
    const fov = (camera.aspect < 0.85 ? 72 : 60) + (!reducedMotion && r.burst > 0 ? 8 : 0);
    if (!this.flightCamera) { camera.position.copy(camPos); this.cameraLook = look.clone(); this.flightCamera = true; }
    else { camera.position.lerp(camPos, blend); this.cameraLook.lerp(look, blend); }
    camera.up.copy(Y);
    camera.lookAt(this.cameraLook);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * blend; camera.updateProjectionMatrix(); }

    let n = 0;
    for (const [i, a] of this.course.asteroids.entries()) {
      if (r.broken.has(a.id) || a.s < r.s - 20 || a.s > r.s + 420) continue;
      const p = asteroidPosition(a, r.elapsed);
      point(starFrame(a.s), p.x, p.y, dummy.position);
      dummy.rotation.set(r.elapsed * a.spin + a.phase, r.elapsed * a.spin * 0.7, 0);
      const hp = r.asteroidHp.get(a.id) ?? a.hp, wobble = hp < a.hp ? 1 + Math.sin(this.visualTime * 30) * 0.04 : 1;
      dummy.scale.setScalar(a.radius * wobble * THREE.MathUtils.clamp((r.s + 420 - a.s) / 60, 0, 1));
      dummy.updateMatrix();
      this.asteroids.setMatrixAt(n, dummy.matrix);
      this.asteroids.setColorAt(n, this.#rockColor(i));
      n++;
    }
    this.asteroids.count = n;
    this.asteroids.instanceMatrix.needsUpdate = true;
    if (this.asteroids.instanceColor) this.asteroids.instanceColor.needsUpdate = true;

    n = 0;
    for (const ring of this.course.rings) {
      if (ring.s < r.s - 5 || ring.s > r.s + 420 || (r.ringsTaken.has(ring.id) && ring.s < r.s - 1)) continue;
      const f = starFrame(ring.s);
      point(f, ring.x, ring.y, dummy.position);
      orient(dummy, f.forward, f.up);
      dummy.rotateZ(this.visualTime * 0.8);
      dummy.scale.setScalar(r.ringsTaken.has(ring.id) ? 1.4 : 1);
      dummy.updateMatrix();
      this.hoops.setMatrixAt(n++, dummy.matrix);
    }
    this.hoops.count = n;
    this.hoops.instanceMatrix.needsUpdate = true;

    n = 0;
    for (const shot of r.shots) {
      if (n >= 32) break;
      point(starFrame(shot.s), shot.x, shot.y, dummy.position);
      orient(dummy, frame.forward, frame.up);
      dummy.rotateZ(this.visualTime * 12 + shot.id);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.shots.setMatrixAt(n++, dummy.matrix);
    }
    this.shots.count = n;
    this.shots.instanceMatrix.needsUpdate = true;
    n = 0;
    for (const spark of r.sparks) {
      if (n >= 24) break;
      point(starFrame(spark.s), spark.cx, spark.cy, dummy.position);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(this.visualTime * 20 + spark.id) * 0.2);
      dummy.updateMatrix();
      this.sparks.setMatrixAt(n++, dummy.matrix);
    }
    this.sparks.count = n;
    this.sparks.instanceMatrix.needsUpdate = true;

    // Speed lines while a ring's burst lasts.
    n = 0;
    if (!reducedMotion && r.burst > 0) {
      for (let i = 0; i < 26; i++) {
        const a = i * 2.39996, d = (this.visualTime * 90 + i * 9) % 60;
        point(starFrame(r.s + 50 - d), r.x + Math.cos(a) * (4 + i % 4), r.y + Math.sin(a) * (3 + i % 3), dummy.position);
        orient(dummy, frame.forward, frame.up);
        dummy.scale.set(1, 1, 6);
        dummy.updateMatrix();
        this.streaks.setMatrixAt(n++, dummy.matrix);
      }
    }
    this.streaks.count = n;
    this.streaks.instanceMatrix.needsUpdate = true;

    let k = 0;
    for (const z of this.course.zischer) {
      const p = zischerPosition(z, r.zischerState.get(z.id), r.s);
      if (!p || k >= this.flyers.length) continue;
      const flyer = this.flyers[k++], f = starFrame(p.s);
      flyer.group.visible = true;
      point(f, p.x, p.y, flyer.group.position);
      orient(flyer.group, f.forward.clone().negate(), f.up);
      this.#animateZischer(flyer, reducedMotion);
    }
    for (; k < this.flyers.length; k++) this.flyers[k].group.visible = false;
  }

  #animateZischer(z, reducedMotion) {
    const t = this.visualTime;
    z.flame.scale.set(1, reducedMotion ? 1 : 1 + Math.sin(t * 31) * 0.2, 1);
    z.arms.forEach((arm, i) => (arm.rotation.z = (i ? -0.9 : 0.9) * (reducedMotion ? 1 : 1 + Math.sin(t * 4 + i) * 0.25)));
  }

  #renderLanding(camera, dt) {
    const r = this.run, k = THREE.MathUtils.clamp(r.phaseTime / LANDING.duration, 0, 1), e = smooth(k), blend = 1 - Math.exp(-5 * dt);
    const end = starFrame(this.course.length);
    const from = this.landFrom ?? { pos: point(end, 0, 0), forward: end.forward };
    const pad = this.level.landing, up = pad.dir, land = surfacePoint(this.star, pad.dir, pad.height + 0.2);
    const bezier = new THREE.CubicBezierCurve3(from.pos, from.pos.clone().addScaledVector(from.forward, 35), land.clone().addScaledVector(up, 26), land);
    bezier.getPoint(e, this.ship.position);
    // The nose turns from the lane to straight up as the rocket sets down on its pad.
    const nose = from.forward.clone().lerp(up, smooth(Math.min(1, k * 1.3))).normalize();
    orient(this.ship, nose, tangentDir(Y.clone().lerp(new THREE.Vector3(1, 0, 0), k), nose) ?? new THREE.Vector3(1, 0, 0));
    this.ship.visible = true;
    // From the chase, up to a view of the star from above: Miro's star, eyes and points.
    camPos.copy(this.ship.position).addScaledVector(from.forward, -12).addScaledVector(Y, 5)
      .lerp(tmp.set(0, STAR_RADIUS + 70, 70), smooth(THREE.MathUtils.clamp((k - 0.1) / 0.6, 0, 1)));
    look.copy(this.ship.position);
    camera.position.lerp(camPos, blend);
    this.cameraLook ??= look.clone();
    this.cameraLook.lerp(look, blend);
    camera.up.copy(Y);
    camera.lookAt(this.cameraLook);
  }

  #renderMeteors(t) {
    for (const m of this.meteors) {
      m.rock.visible = m.mark.visible = m.active;
      if (!m.active) continue;
      const k = THREE.MathUtils.clamp(m.t / METEOR.warn, 0, 1);
      surfacePoint(this.star, m.dir, METEOR.height * (1 - k * k), m.rock.position);
      m.rock.quaternion.setFromUnitVectors(Y, m.dir);
      m.rock.rotateX(t * 6);
      surfacePoint(this.star, m.dir, 0.06, m.mark.position);
      m.mark.quaternion.setFromUnitVectors(Y, m.dir);
      m.mark.scale.setScalar(0.4 + k * 0.8);
      m.mark.material.opacity = 0.5 + 0.4 * Math.sin(t * 16);
    }
  }

  #renderKrakel(dt, t, reducedMotion) {
    const boss = this.boss, model = this.krakel, h = boss.head, local = this.#arenaLocal(this.player.body.pos);
    // Down on the arena the head sinks into it, a dome to its top: just as solid as it looks.
    const centre = h.height;
    model.head.position.set(h.x, centre, h.z);
    if (boss.mode === 'defeated') {
      // Krakel laughs and floats off, small and happy, leaving the crystal.
      this.byeT += dt;
      model.head.position.y = centre + this.byeT * 6;
      model.head.scale.setScalar(Math.max(0.01, 1 - this.byeT / 3));
    }
    // He keeps his eyes on Mirio.
    const yaw = Math.atan2(local.x - h.x, local.z - h.z);
    model.ball.rotation.y += Math.atan2(Math.sin(yaw - model.ball.rotation.y), Math.cos(yaw - model.ball.rotation.y)) * (1 - Math.exp(-3 * dt));
    model.ball.rotation.z = reducedMotion ? 0 : Math.sin(t * 0.9) * 0.04 + (boss.mode === 'dazed' ? Math.sin(t * 5) * 0.08 : 0);

    model.arms.forEach((arm, i) => {
      arm.curl = THREE.MathUtils.damp(arm.curl ?? 1, boss.curled[i] ? 0.12 : 1, 3, dt);
      arm.group.scale.setScalar(arm.curl);
      arm.group.visible = boss.mode !== 'defeated' || this.byeT < 0.5;
      // The curled stubs stay under the head as it comes down.
      arm.group.position.copy(arm.top).setY(arm.top.y + Math.min(0, centre - KRAKEL.head.height));
      const active = boss.activeArm === i && ['arms', 'intro', 'waiting'].includes(boss.mode);
      arm.spot.visible = active;
      arm.spot.material.opacity = 0.65 + (reducedMotion ? 0 : 0.3 * Math.sin(t * 6));
      arm.spot.scale.setScalar(1 + (reducedMotion ? 0 : 0.12 * Math.sin(t * 6)));
      const shake = active && !reducedMotion ? (boss.shudder > 0 ? 0.08 : boss.shaking > 0 ? 0.3 : 0) : 0;
      arm.body.position.set(Math.sin(t * 57) * shake, Math.cos(t * 43) * shake, Math.sin(t * 61) * shake);
    });

    const mouth = model.group.worldToLocal(model.mouth.getWorldPosition(tmp));
    this.inks.forEach((ink, i) => {
      const s = boss.spits[i];
      ink.blob.visible = ink.mark.visible = Boolean(s);
      if (!s) return;
      const k = THREE.MathUtils.clamp(s.t / KRAKEL.spitFlight, 0, 1);
      ink.blob.position.set(mouth.x + (s.x - mouth.x) * k, mouth.y * (1 - k) + Math.sin(Math.PI * k) * 6, mouth.z + (s.z - mouth.z) * k);
      ink.mark.position.set(s.x, 0.06, s.z);
      ink.mark.scale.setScalar(KRAKEL.splash * (0.5 + k * 0.5));
    });
    this.rings.forEach((ring, i) => {
      const w = boss.waves[i];
      ring.visible = Boolean(w);
      if (!w) return;
      ring.position.set(w.x, 0.15, w.z);
      ring.scale.set(Math.max(0.1, w.r), 1, Math.max(0.1, w.r));
      ring.material.opacity = 0.85 * (1 - w.r / KRAKEL.wave.reach);
    });
    if (boss.mode === 'dazed' && !reducedMotion && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
      this.particles.burst(this.#arenaPoint(h.x, h.z, h.top + 0.8), { count: 3, color: [0xffe36a, 0xffffff], speed: 2, size: 0.6, life: 0.6 });
    }
  }
}
