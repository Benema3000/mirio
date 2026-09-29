// The Vulkanreise: Miro's second journey (level data in volcano-level.js).
//
//   Startstern → Miro's rocket → the Festland: the desert, where Damai the
//   pug joins and leads → the forest: ravines to cross on platforms,
//   Grummel, Schnappblumen, spring flowers, the Glutbeere (Mirio grows into
//   Miro's big Mirio; a hit only shrinks him back) → the log and the river
//   ride (river-rules.js) → over the waterfall → dark → the Glutkessel:
//   Glutzahn in three stages (glutzahn-rules.js) → the crystal.
//
// Runs as a chapter (see main.js CHAPTER_TYPES): reset, step, render,
// snapshot, layout, seek, rescue, and `scene`.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CameraRig } from './camera.js';
import { DamaiGuide, animateDamai, buildDamai } from './damai.js';
import { EnemySystem } from './enemies.js';
import { GLUT, GlutzahnRules } from './glutzahn-rules.js';
import { collidersFor } from './level.js';
import { outlineMaterial, toon, withOutline } from './materials.js';
import { BIG_MIRIO_LOOK, buildMirio } from './mirio-model.js';
import { MAX_HEARTS, Player } from './player.js';
import { createRiverRun, makeRiverCourse, riverSnapshot, stepRiverRun } from './river-rules.js';
import { RIVER_SCENE, RiverScene } from './river-scene.js';
import { Particles, buildScene, placeOn } from './scene.js';
import { buildGlutzahn, buildGrummel, buildSchnappblume, buildStachelkreisel } from './volcano-creatures.js';
import { RAVINES, ZONES, landDir, landPoint, makeVolcanoLevel, volcanoFlightPoint } from './volcano-level.js';
import { partialTurn, surfacePoint, tangentDir } from './world.js';

const PHYSICS_STEP = 1 / 120;
const BIT_RADIUS = 1.3;
const FLAG_RADIUS = 3.4;
const BERRY_RADIUS = 1.4;
// A spring flower throws Mirio about 8 m up, jump button or not, to the gems above it.
const SPRING = Object.freeze({ reach: 1.5, speed: 19, gravity: 0.6 });
const LOG_REACH = 2.6;
const RAVINE_PENALTY = 2;
const PLANT = Object.freeze({ notice: 4, reach: 1.9, windup: 0.55, bite: 0.3, rest: 1.2, stompHeight: 2.2 });
const ROCKET = Object.freeze({ countdown: 2.4, flight: 3.4 });
const DARK = Object.freeze({ fade: 0.8, hold: 1.4 });
const BIG_SCALE = 1.25;
const CAMERA_DISTANCE = 11;
const DAY = { top: 0x5fa8e8, horizon: 0xf6dcae };
const Y = new THREE.Vector3(0, 1, 0), DOWNSTREAM = new THREE.Vector3(0, 0, -1);
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

const noise = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.31 + z * 0.17) * Math.sin(z * 0.23 - x * 0.11);
/** The Festland's ground colour at local (x, z): sand, forest floor, ravines, bank, ash. */
function groundColour(x, z, c) {
  const k = noise(x, z);
  if (z < ZONES.arena + 60) return c.setHex(0x3d3440).lerp(new THREE.Color(0x5a4650), k);
  if (RAVINES.some(r => z < r.z0 && z > r.z1)) return c.setHex(0x1e1512);
  if (z < ZONES.forestEnd) return c.setHex(0x9c9272).lerp(new THREE.Color(0x7a8a5c), k);
  if (z < ZONES.desertEnd) return c.setHex(0x4f7a3a).lerp(new THREE.Color(0x6a8a44), k);
  const edge = THREE.MathUtils.clamp((ZONES.desertEnd + 12 - z) / 12, 0, 1);
  return c.setHex(0xe9c98c).lerp(new THREE.Color(0xd8b070), k).lerp(new THREE.Color(0x6a8a44), edge);
}

/** A local (x, z) patch of the Festland, bent onto its sphere and coloured by groundColour. */
function groundStrip(x0, x1, z0, z1, step, height = 0) {
  const geometry = new THREE.PlaneGeometry(1, 1, Math.ceil((x1 - x0) / step), Math.ceil((z0 - z1) / step));
  const pos = geometry.attributes.position, colours = new Float32Array(pos.count * 3), c = new THREE.Color(), p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = x0 + (pos.getX(i) + 0.5) * (x1 - x0), z = z0 - (pos.getY(i) + 0.5) * (z0 - z1);
    landPoint(x, z, height, p);
    pos.setXYZ(i, p.x, p.y, p.z);
    groundColour(x, z, c).toArray(colours, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

export class VolcanoRun {
  constructor(art) {
    this.level = makeVolcanoLevel();
    const { start, land } = this.level;
    this.start = start;
    this.land = land;
    this.scene = new THREE.Scene();
    this.scene.name = 'vulkanreise';
    // The scene builder draws the Startstern and everything placed on either
    // planet (gems, trees, flags, the crater, the crystal); the Festland's own
    // ground is drawn here, being 20 km round.
    this.world = buildScene(this.scene, { ...this.level, planets: [start], blocks: this.level.blocks.filter(b => b.planet === start) }, art);
    this.colliders = collidersFor(this.level);
    this.particles = new Particles(this.scene, art.sparkle);
    this.fog = { day: new THREE.Fog(DAY.horizon, 120, 520), crater: new THREE.Fog(0x2a1f2a, 40, 170) };
    this.riverCourse = makeRiverCourse();
    this.#buildFestland();

    this.player = new Player(this.scene, art, this.level.planets, this.colliders);
    this.small = this.player.model;
    this.big = buildMirio(art, BIG_MIRIO_LOOK);
    this.big.group.scale.setScalar(BIG_SCALE);
    this.big.group.visible = false;
    this.scene.add(this.big.group);
    // Every hit, from any creature, goes through the power-up first.
    const hurt = this.player.hurt.bind(this.player);
    this.player.hurt = (from) => {
      if (this.player.invulnerable > 0 || this.player.state !== 'play') return;
      if (this.powered) { this.player.hearts += 1; this.#setBig(false); }
      hurt(from);
    };

    this.enemies = new EnemySystem(this.scene, this.level, art, { layouts: this.level.walkers, build: buildGrummel });
    this.arenaEnemies = new EnemySystem(this.scene, this.level, art, { layouts: this.level.arenaWalkers, build: buildGrummel });
    this.plants = this.#plants(this.level.plants, art);
    // The crater's Schnappblumen come in stage three; until then they are not there to bump into.
    this.arenaPlants = this.#plants(this.level.arenaPlants, art, false);
    this.berries = this.level.powerups.map(spec => {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), new THREE.MeshLambertMaterial({ color: 0xff5a2a, emissive: 0x7a1a00 })));
      group.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6).scale(1.4, 0.4, 0.8).translate(0.15, 0.48, 0), new THREE.MeshLambertMaterial({ color: 0x5fae4a })));
      placeOn(group, spec.planet, spec.dir, spec.height);
      this.scene.add(group);
      return { ...spec, group, pos: surfacePoint(spec.planet, spec.dir, spec.height) };
    });
    this.springs = this.level.springs.map(spec => {
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
      placeOn(group, spec.planet, spec.dir, 0);
      this.scene.add(group);
      return { ...spec, group, petals, pos: surfacePoint(spec.planet, spec.dir, 0), squash: 0 };
    });

    // The rocket stands on the Startstern's plateau.
    this.rocket = { ...this.world.rocket, phase: 'pad', t: 0 };
    const r = this.level.rocket;
    this.padBase = surfacePoint(start, r.dir, r.height);
    this.flightSide = new THREE.Vector3().crossVectors(r.dir, r.flight.landing).normalize();

    // Damai, the pug, and the way he leads.
    this.damai = buildDamai();
    this.scene.add(this.damai.group);
    this.guide = new DamaiGuide(this.level.route);
    this.dogOptions = { reducedMotion: false, speed: 0 };

    // The river, its log, and the waterfall at its end.
    this.riverScene = new RiverScene(this.scene, this.riverCourse, (s, x, h, out) => landPoint(x, this.level.log.z - s, h, out));

    // Glutzahn's crater: a flat top with its own right/forward axes.
    const ar = this.level.arena;
    this.arena = { center: surfacePoint(ar.planet, ar.dir, ar.top), up: ar.dir.clone() };
    this.arena.forward = tangentDir(ar.facing, ar.dir) ?? tangentDir(new THREE.Vector3(1, 0, 0), ar.dir);
    this.arena.right = new THREE.Vector3().crossVectors(this.arena.up, this.arena.forward).normalize();
    this.boss = new GlutzahnRules({ arena: ar.radius - 2 });
    this.bossModel = buildGlutzahn(art);
    this.scene.add(this.bossModel.group);
    this.kreisels = Array.from({ length: 3 }, () => { const m = buildStachelkreisel(); this.scene.add(m.group); return m; });
    const fire = new THREE.ConeGeometry(0.9, GLUT.fireLength, 20, 1, true).translate(0, -GLUT.fireLength / 2, 0).rotateX(-Math.PI / 2);
    this.fire = new THREE.Mesh(fire, new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.scene.add(this.fire);

    // Going dark over the waterfall: a black shell round the camera.
    this.darkness = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 10), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false }));
    this.darkness.renderOrder = 999;
    this.scene.add(this.darkness);

    this.rig = null;
    this.reset();
  }

  #plants(specs, art, solid = true) {
    return specs.map((spec, i) => {
      const model = buildSchnappblume(art);
      placeOn(model.group, spec.planet, spec.dir, 0);
      this.scene.add(model.group);
      const collider = { kind: 'cyl', base: surfacePoint(spec.planet, spec.dir, -0.3), axis: spec.dir.clone(), radius: 0.62, height: 1.2 };
      if (solid) this.colliders(spec.planet).push(collider);
      return { ...spec, model, collider, pos: surfacePoint(spec.planet, spec.dir, 0), phase: i * 1.3, mode: 'idle', timer: 0, wilted: false };
    });
  }

  /** Stage three: the crater's Schnappblumen pop up, and are solid from then on. */
  #arenaPlantsSolid(on) {
    const list = this.colliders(this.land);
    for (const p of this.arenaPlants) {
      const at = list.indexOf(p.collider);
      if (on && at < 0) list.push(p.collider);
      if (!on && at >= 0) list.splice(at, 1);
    }
  }

  /** The Festland: ground, day sky, far hills, platforms, ravine edges, desert and crater props. */
  #buildFestland() {
    const L = this.level, outline = outlineMaterial(0.03);
    // The ground, with a valley six metres down where the waterfall drops into its pool.
    const lip = L.log.z - this.riverCourse.length, valley = lip - 80;
    this.scene.add(groundStrip(-140, 140, 60, lip, 4), groundStrip(-140, 140, lip, valley, 4, -RIVER_SCENE.drop), groundStrip(-140, 140, valley, ZONES.arena - 120, 4));
    const cliff = toon(0x6a5a4e);
    for (const z of [lip, valley]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(280, RIVER_SCENE.drop, 0.8).translate(0, -RIVER_SCENE.drop / 2, 0), cliff);
      placeOn(wall, this.land, landDir(0, z), 0, new THREE.Vector3(0, 0, -1));
      this.scene.add(wall);
    }
    const dome = new THREE.SphereGeometry(900, 32, 16), colours = [], top = new THREE.Color(DAY.top), low = new THREE.Color(DAY.horizon), c = new THREE.Color();
    for (let i = 0; i < dome.attributes.position.count; i++) {
      const y = dome.attributes.position.getY(i) / 900;
      c.copy(low).lerp(top, Math.pow(Math.max(0, y), 0.55)).toArray(colours, i * 3);
    }
    dome.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    this.daySky = new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.daySky.renderOrder = -20;
    this.scene.add(this.daySky);

    // Far hills along the course, and the smoking volcano behind the Glutkessel.
    const hills = [];
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1, z = 40 - i * 45, x = side * (170 + (i * 37) % 60);
      hills.push(new THREE.ConeGeometry(40 + (i * 13) % 30, 50 + (i * 17) % 40, 7).translate(...landPoint(x, z, 20).toArray()));
    }
    this.scene.add(new THREE.Mesh(mergeGeometries(hills), new THREE.MeshLambertMaterial({ color: 0x9a8a9a })));
    const volcano = new THREE.Mesh(new THREE.ConeGeometry(120, 150, 16, 1, true).translate(0, 60, 0), new THREE.MeshLambertMaterial({ color: 0x4a3a44 }));
    volcano.position.copy(landPoint(0, ZONES.arena - 260, 0));
    this.scene.add(volcano);

    // The forest's floating platforms: bark-brown blocks with a mossy top.
    const bark = toon(0x8a5a3c), moss = toon(0x6fb45a);
    for (const b of L.blocks.filter(b => b.planet === this.land)) {
      const h = b.top - b.bottom;
      const block = withOutline(new THREE.Mesh(new THREE.BoxGeometry(b.size, h, b.size).translate(0, h / 2, 0), bark), outline);
      block.add(new THREE.Mesh(new THREE.BoxGeometry(b.size * 1.02, 0.18, b.size * 1.02).translate(0, h - 0.05, 0), moss));
      placeOn(block, b.planet, b.dir, b.bottom, new THREE.Vector3(0, 0, -1));
      this.scene.add(block);
    }
    // Each ravine's edges: a dark lip, so the gap reads as a drop.
    const ravineEdge = toon(0x2a1c16);
    for (const r of RAVINES) for (const z of [r.z0, r.z1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(280, 0.5, 0.6), ravineEdge);
      placeOn(edge, this.land, landDir(0, z), -0.2, new THREE.Vector3(0, 0, -1));
      this.scene.add(edge);
    }
    // Desert: cacti and rocks, both solid.
    const cactus = toon(0x4f9a5a), stone = toon(0xb89a78);
    for (const k of L.cacti) {
      const group = new THREE.Group();
      group.add(withOutline(new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 2.2, 4, 10).translate(0, 1.4, 0), cactus), outline));
      for (const side of [-1, 1]) {
        const arm = withOutline(new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.8, 4, 8), cactus), outline);
        arm.position.set(side * 0.6, 1.4 + side * 0.3, 0);
        group.add(arm);
      }
      group.scale.setScalar(k.scale);
      placeOn(group, this.land, landDir(k.x, k.z), 0);
      this.scene.add(group);
      this.colliders(this.land).push({ kind: 'cyl', base: landPoint(k.x, k.z, -0.2), axis: landDir(k.x, k.z), radius: 0.5 * k.scale, height: 3 * k.scale });
    }
    for (const k of L.rocks) {
      const rock = withOutline(new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 * k.scale, 0).scale(1, 0.6, 1), stone), outline);
      placeOn(rock, this.land, landDir(k.x, k.z), 0.3 * k.scale);
      this.scene.add(rock);
      this.colliders(this.land).push({ kind: 'cyl', base: landPoint(k.x, k.z, -0.2), axis: landDir(k.x, k.z), radius: 1.1 * k.scale, height: 1 * k.scale });
    }
    // The Glutkessel: a glowing rim and rocks round the crater.
    const rim = new THREE.Mesh(new THREE.TorusGeometry(L.arena.radius + 0.6, 0.18, 6, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a3a }));
    placeOn(rim, this.land, L.arena.dir, L.arena.top + 0.05);
    this.scene.add(rim);
    const ash = toon(0x4a3f48);
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2, rr = L.arena.radius + 3 + (i % 3);
      const rock = withOutline(new THREE.Mesh(new THREE.DodecahedronGeometry(1.4 + (i % 2), 0).scale(1, 1.6, 1), ash), outline);
      placeOn(rock, this.land, landDir(Math.cos(a) * rr, ZONES.arena + Math.sin(a) * rr), 0.8);
      this.scene.add(rock);
    }
  }

  reset() {
    const { spawn } = this.level;
    Object.assign(this, { status: 'playing', time: 0, penalty: 0, elapsed: 0, phase: 'start', fight: false, powered: false, collected: 0, dark: 0, stage: 1, steer: 0 });
    this.player.reset({ planet: spawn.planet, dir: spawn.dir.clone() }, new THREE.Vector3(0, 0, -1));
    this.#setBig(false);
    this.player.events.length = 0;
    this.enemies.reset();
    this.arenaEnemies.reset();
    for (const bit of this.world.bits) { bit.taken = false; bit.mesh.visible = true; }
    for (const f of this.world.flags) { f.reached = false; f.raise = 0; }
    for (const p of [...this.plants, ...this.arenaPlants]) Object.assign(p, { mode: 'idle', timer: 0, wilted: false });
    for (const b of this.berries) { b.taken = false; b.group.visible = true; }
    this.#rocketToPad();
    this.guide.reset();
    this.river = createRiverRun();
    this.boss.reset();
    this.#arenaPlantsSolid(false);
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
    placeOn(r.group, this.start, lr.dir, lr.height, Y);
    r.flame.visible = false;
    r.phase = 'pad';
    r.t = 0;
  }

  #arenaLocal(pos) {
    const rel = tmp.subVectors(pos, this.arena.center);
    return { x: rel.dot(this.arena.right), z: rel.dot(this.arena.forward), height: rel.dot(this.arena.up) };
  }

  #arenaPoint(x, z, height, out = new THREE.Vector3()) {
    return out.copy(this.arena.center).addScaledVector(this.arena.right, x).addScaledVector(this.arena.forward, z).addScaledVector(this.arena.up, height);
  }

  /** Mirio on the Festland as local (x, z) and height above its ground. */
  #local() {
    const p = this.player.body.pos;
    return { x: p.x, z: p.z, h: p.distanceTo(this.land.center) - this.land.radius };
  }

  /** How far along Damai's route Mirio is, or null when he is nowhere near it. */
  #routeS() {
    const { x, z } = this.#local(), route = this.level.route;
    let best = null;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i], dx = b.x - a.x, dz = b.z - a.z;
      const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
      if (!best || d < best.d) best = { d, s: a.s + (b.s - a.s) * t };
    }
    return best && best.d < 25 ? best.s : null;
  }

  #river() { return riverSnapshot(this.river, this.riverCourse); }

  step(dt, controls = {}, input = null) {
    if (this.status !== 'playing' || !Number.isFinite(dt) || dt <= 0 || !this.rig) return [];
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.elapsed += dt;
    const events = [], player = this.player;
    const walking = this.phase === 'start' || this.phase === 'land' || this.phase === 'arena';
    if (walking) {
      player.readInput(intent(controls), this.rig);
      const steps = Math.max(1, Math.ceil(dt / PHYSICS_STEP)), h = dt / steps;
      for (let i = 0; i < steps; i++) player.step(h);
    }
    events.push(...this.enemies.step(dt, player, { active: this.phase === 'land' }));
    events.push(...this.arenaEnemies.step(dt, player, { active: this.phase === 'arena' && this.fight && this.stage >= 2 }));
    if (walking) {
      this.#plantsStep(this.plants, dt, events, this.phase === 'land');
      this.#plantsStep(this.arenaPlants, dt, events, this.phase === 'arena' && this.fight && this.stage >= 3);
      this.#pickups(events);
    }
    if (this.phase === 'start') this.#rocketBoard(events);
    this.#rocketFly(dt, events);
    if (this.phase === 'land') {
      this.#springsStep(events);
      this.#ravines(events);
      for (const ev of this.guide.step(dt, { s: this.#routeS() })) events.push({ type: ev.type === 'hop' ? 'jump' : 'bump', kind: `damai-${ev.type}` });
      this.#logBoard(events);
    }
    if (this.phase === 'river') this.#riverStep(dt, controls, events);
    if (this.phase === 'dark') this.#darkStep(dt, events);
    if (this.phase === 'arena') { this.#bossFight(dt, events); this.#goal(events); }

    for (const ev of player.events.splice(0)) {
      if (ev.type === 'faint') {
        this.penalty += 3;
        this.time += 3;
        events.push({ type: 'checkpoint', kind: 'rescue', penalty: 3 });
      } else if (ev.type === 'jump') events.push({ type: ['jump', 'jump2', 'triple'][(ev.level ?? 1) - 1] });
      else if (['hurt', 'pound', 'land', 'spin', 'poundStart'].includes(ev.type)) events.push({ type: ev.type });
    }
    this.rig.distance = CAMERA_DISTANCE + (this.fight ? 5 : 0) + (this.phase === 'rocket' ? 8 : 0) + (this.phase === 'river' ? 2 : 0);
    this.rig.update(dt, player, input ?? { consumeCamera: () => ({ x: 0, y: 0 }) });
    return events;
  }

  #plantsStep(plants, dt, events, active) {
    const player = this.player;
    for (const p of plants) {
      p.timer += dt;
      if (p.wilted || !active) continue;
      const rel = tmp.subVectors(player.body.pos, p.pos), up = p.dir;
      const height = rel.dot(up), distance = rel.addScaledVector(up, -height).length();
      const same = player.body.planet === p.planet;
      if (same && distance < 0.9 && height > PLANT.stompHeight && height < 3.6 && player.body.vel.dot(up) < 0) {
        p.wilted = true;
        p.timer = 0;
        player.bounce();
        events.push({ type: 'enemyDefeat', kind: 'schnappblume' });
        this.particles.burst(surfacePoint(p.planet, p.dir, 2.7), { count: 14, color: [0x6fbf4a, 0xff7a3d], speed: 4, size: 0.5, life: 0.6 });
        continue;
      }
      if (p.mode === 'idle' && same && distance < PLANT.notice && p.timer > PLANT.rest) { p.mode = 'windup'; p.timer = 0; }
      else if (p.mode === 'windup' && p.timer > PLANT.windup) { p.mode = 'bite'; p.timer = 0; }
      else if (p.mode === 'bite') {
        if (same && distance < PLANT.reach && height < PLANT.stompHeight) player.hurt(p.pos);
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

  #springsStep(events) {
    const player = this.player;
    for (const s of this.springs) {
      s.squash = Math.max(0, s.squash - 0.05);
      if (!player.body.onGround || player.body.pos.distanceTo(s.pos) > SPRING.reach) continue;
      player.bounce({ speed: SPRING.speed, gravityScale: SPRING.gravity });
      s.squash = 1;
      events.push({ type: 'spring' });
    }
  }

  /** Stepping into a ravine is a fall: back to the last flag, two seconds on the clock. */
  #ravines(events) {
    const player = this.player;
    if (!player.body.onGround || player.state !== 'play') return;
    const { z, h } = this.#local();
    if (h > 0.4 || !RAVINES.some(r => z < r.z0 && z > r.z1)) return;
    this.particles.burst(player.body.pos, { count: 16, color: [0x8a5a3c, 0xd9c7a0], speed: 4, size: 0.6, life: 0.6 });
    player.respawn();
    this.penalty += RAVINE_PENALTY;
    this.time += RAVINE_PENALTY;
    this.snap = true;
    events.push({ type: 'splash', penalty: RAVINE_PENALTY });
  }

  #logBoard(events) {
    const log = this.level.log, { x, z, h } = this.#local();
    if (h > 3 || Math.hypot(x - log.x, z - log.z) > LOG_REACH) return;
    this.phase = 'river';
    this.river = createRiverRun();
    this.guide.ride(true);
    this.player.board();
    this.player.model.group.visible = true;
    events.push({ type: 'board', kind: 'log' });
  }

  #riverStep(dt, controls, events) {
    this.steer = controls.x ?? 0;
    for (const ev of stepRiverRun(this.river, this.riverCourse, dt, { x: this.steer })) {
      if (ev.type === 'gem') { this.collected++; events.push({ type: 'bit' }); }
      else if (ev.type === 'bump') {
        const penalty = ev.penalty ?? 1;
        this.penalty += penalty;
        this.time += penalty;
        events.push({ type: 'bump', penalty });
      } else if (ev.type === 'waterfall') events.push({ type: 'liftoff', kind: 'waterfall' });
      else if (ev.type === 'landed') { this.phase = 'dark'; this.dark = 0; }
      else if (ev.type === 'whirl') events.push({ type: 'spin' });
    }
    // The camera rides along: Mirio's body follows his seat on the log downstream.
    const r = this.#river();
    this.riverScene.update(this.river, this.elapsed, { reducedMotion: false });
    this.riverScene.seats.mirio.getWorldPosition(tmp);
    this.player.ride(tmp.clone(), landDir(r.worldX, this.level.log.z - r.s), DOWNSTREAM);
  }

  #darkStep(dt, events) {
    this.dark += dt;
    if (this.dark < DARK.fade + DARK.hold) return;
    // Waking up in the Glutkessel.
    const wake = this.level.wake;
    this.player.reset({ planet: wake.planet, dir: wake.dir.clone() }, new THREE.Vector3(0, 0, -1));
    this.player.model.group.visible = true;
    this.guide.ride(false);
    this.phase = 'arena';
    this.snap = true;
    events.push({ type: 'arrive', kind: 'wake' });
  }

  #rocketBoard(events) {
    const r = this.rocket, player = this.player;
    if (r.phase !== 'pad' || player.body.planet !== this.start) return;
    const rel = tmp.subVectors(player.body.pos, this.padBase), along = rel.dot(this.level.rocket.dir);
    const radial = rel.addScaledVector(this.level.rocket.dir, -along).length();
    // Walking up to the launch pad is enough. The Startstern is so small that
    // the ground at the pad's rim lies 1.5 m below its top.
    if (radial < this.level.plateau.radius + 0.8 && along > -2.5 && along < 3) {
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
      placeOn(r.group, this.start, lr.dir, lr.height, Y);
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
    r.group.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(Y, ahead))
      .slerp(new THREE.Quaternion().setFromUnitVectors(Y, lr.flight.landing), smooth(THREE.MathUtils.clamp((s - 0.7) / 0.25, 0, 1)));
    r.flame.visible = true;
    r.flame.scale.y = 0.8 + Math.random() * 0.5;
    this.particles.burst(pos, { count: 2, color: [0xffb640, 0xfff0a8, 0xff6f3a], speed: 1.5, size: 0.9, life: 0.7 });
    const up = lr.dir.clone().applyQuaternion(partialTurn(lr.dir, lr.flight.landing, s, this.flightSide, new THREE.Quaternion()));
    this.player.ride(tmp.copy(pos).addScaledVector(up, 1.5), up, ahead);
    if (r.t < 1) return;
    r.phase = 'landed';
    r.flame.visible = false;
    placeOn(r.group, this.land, lr.flight.landing, 0, new THREE.Vector3(0, 0, -1));
    this.colliders(this.land).push({ kind: 'cyl', base: landPoint(0, 0, -0.3), axis: lr.flight.landing.clone(), radius: r.radius + 0.5, height: r.height });
    const landing = this.level.landing;
    this.player.leaveRocket({ planet: landing.planet, dir: landing.dir.clone() }, new THREE.Vector3(0, 0, -1));
    this.player.model.group.visible = true;
    this.phase = 'land';
    events.push({ type: 'arrive' });
  }

  #bossFight(dt, events) {
    const player = this.player, boss = this.boss;
    const local = this.#arenaLocal(player.body.pos);
    const onArena = Math.hypot(local.x, local.z) < this.level.arena.radius && local.height > -0.5 && local.height < 6;
    if (!this.fight && !boss.defeated && onArena) {
      this.fight = true;
      events.push(...boss.start().map(e => ({ type: 'roar', kind: e.type })));
    }
    if (!this.fight) return;
    for (const ev of boss.step(dt, { ...local, vy: player.body.vel.dot(this.arena.up), pounding: player.pounding })) {
      if (ev.type === 'hurt') player.hurt(this.#arenaPoint(ev.x, ev.z, 1));
      else if (ev.type === 'bossBounce') { player.bounce(); events.push({ type: 'bump' }); }
      else if (ev.type === 'bossHit') {
        player.bounce();
        events.push({ type: 'bossHit', hp: ev.hp });
        this.particles.burst(this.#arenaPoint(boss.x, boss.z, 4), { count: 20, color: [0xffd23f, 0xff7a3d, 0xffffff], speed: 6, size: 0.6, life: 0.7 });
      } else if (ev.type === 'bossStage') {
        // Stage 2 brings Grummel; stage 3 Grummel and Schnappblumen.
        this.stage = ev.stage;
        if (ev.stage >= 3) this.#arenaPlantsSolid(true);
        events.push({ type: 'roar', kind: 'bossStage', stage: ev.stage });
        const arrivals = ev.stage === 2 ? this.arenaEnemies.enemies.map(e => e.pos) : this.arenaPlants.map(p => p.pos);
        for (const pos of arrivals) this.particles.burst(pos, { count: 16, color: [0xff7a3d, 0xffd23f], speed: 5, size: 0.7, life: 0.7 });
      } else if (ev.type === 'bossDefeat') {
        this.fight = false;
        this.world.goal.bubble.visible = false;
        events.push({ type: 'bossDown' });
      } else if (ev.type === 'bossFire' || ev.type === 'bossThrow') events.push({ type: ev.type === 'bossFire' ? 'roar' : 'spin' });
    }
  }

  #goal(events) {
    if (!this.boss.defeated || this.world.goal.group.position.distanceTo(this.player.body.pos) > 3) return;
    this.status = 'finished';
    this.player.win();
    events.push({ type: 'finish', time: this.time, collectibles: this.collected });
  }

  rescue() {
    if (this.status !== 'playing' || !['start', 'land', 'arena'].includes(this.phase)) return [];
    this.player.respawn();
    this.penalty += 2;
    this.time += 2;
    this.snap = true;
    return [{ type: 'checkpoint', kind: 'rescue', penalty: 2 }];
  }

  /**
   * Test staging, never granting anything: 0 the Startstern, .2 the desert,
   * .45 the forest before the first ravine, .5 just past it, .6 by the log,
   * .8 on the river, .9 just before the waterfall, 1 the Glutkessel.
   */
  seek(progress) {
    const L = this.level;
    if (progress < 0.1) return this.reset();
    this.fight = false;
    this.boss.reset();
    this.#arenaPlantsSolid(false);
    this.stage = 1;
    this.dark = 0;
    this.rocket.phase = 'landed';
    this.rocket.flame.visible = false;
    placeOn(this.rocket.group, this.land, L.rocket.flight.landing, 0, new THREE.Vector3(0, 0, -1));
    this.guide.ride(false);
    this.snap = true;
    if (progress >= 0.75 && progress < 0.95) {
      this.phase = 'river';
      this.river = createRiverRun();
      // .9 and up: the last stretch before the waterfall.
      if (progress >= 0.9) this.river.s = this.riverCourse.length - 40;
      this.guide.ride(true);
      this.player.board();
      this.player.model.group.visible = true;
      return this.snapshot();
    }
    const [x, z] = progress >= 0.95 ? [0, ZONES.arena + L.arena.radius - 3] : progress >= 0.55 ? [0, L.log.z + 6] : progress >= 0.5 ? [0, RAVINES[0].z1 - 4] : progress >= 0.3 ? [0, RAVINES[0].z0 + 8] : [0, -6];
    this.player.reset({ planet: this.land, dir: landDir(x, z) }, new THREE.Vector3(0, 0, -1));
    this.player.model.group.visible = true;
    this.phase = progress >= 0.95 ? 'arena' : 'land';
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
    this.riverScene.update(this.river, t, { reducedMotion });
    if (this.phase === 'river') this.#placeOnLog(t, reducedMotion);
    else this.player.render(dt);
    this.enemies.update(t, camera);
    this.arenaEnemies.update(t, camera);
    this.arenaEnemies.group.visible = this.phase === 'arena' && this.stage >= 2;
    this.#renderPlants(this.plants, t, reducedMotion, this.phase === 'land');
    this.#renderPlants(this.arenaPlants, t, reducedMotion, this.phase === 'arena' && this.stage >= 3);
    for (const b of this.berries) if (!b.taken && !reducedMotion) b.group.rotateOnAxis(Y, dt * 1.5);
    for (const s of this.springs) s.petals.scale.set(1 + s.squash * 0.2, 1 - s.squash * 0.5, 1 + s.squash * 0.2);
    this.#renderDamai(t, reducedMotion);
    this.#renderBoss(t, reducedMotion);

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

    // Space round the Startstern, day over the Festland, dusk in the crater;
    // black over the waterfall until Mirio wakes.
    const high = this.phase === 'start' || (this.phase === 'rocket' && (this.rocket.phase === 'countdown' || this.rocket.t < 0.6));
    const crater = this.phase === 'arena';
    this.world.sky.visible = high;
    this.daySky.visible = !high;
    this.daySky.position.copy(camera.position);
    this.daySky.material.color.setHex(crater ? 0x6a4a5a : 0xffffff);
    this.scene.fog = high ? null : crater ? this.fog.crater : this.fog.day;
    const fall = this.phase === 'river' ? (this.#river().fall ?? 0) : 0;
    const darkness = this.phase === 'dark' ? 1 : fall;
    this.darkness.position.copy(camera.position);
    this.darkness.material.opacity = darkness;
    this.darkness.visible = darkness > 0.01;
  }

  #renderDamai(t, reducedMotion) {
    const dog = this.guide.snapshot(), group = this.damai.group;
    this.dogOptions.reducedMotion = reducedMotion;
    this.dogOptions.speed = dog.speed ?? 0;
    if (this.phase === 'river') {
      const seat = this.riverScene.seats.damai;
      group.visible = true;
      seat.getWorldPosition(group.position);
      seat.getWorldQuaternion(group.quaternion);
      animateDamai(this.damai, 'sit', t, this.dogOptions);
    } else if (this.phase === 'arena') {
      // He waits at the crater's edge and cheers at the end.
      group.visible = true;
      placeOn(group, this.land, landDir(-3, ZONES.arena + this.level.arena.radius + 2), 0, DOWNSTREAM);
      animateDamai(this.damai, this.boss.defeated ? 'bark' : 'sit', t, this.dogOptions);
    } else {
      group.visible = this.phase === 'land';
      placeOn(group, this.land, landDir(dog.x, dog.z), dog.h, tmp.set(dog.facing[0], 0, dog.facing[1]));
      animateDamai(this.damai, dog.state, t, this.dogOptions);
    }
  }

  /** Mirio sits on his seat on the log, facing downstream (the seat's +Z). */
  #placeOnLog(t, reducedMotion) {
    const m = this.player.model, seat = this.riverScene.seats.mirio;
    seat.getWorldPosition(m.group.position);
    seat.getWorldQuaternion(m.group.quaternion);
    m.group.visible = true;
    m.armL.rotation.z = m.armRaisedZ.L * 0.6;
    m.armR.rotation.z = m.armRaisedZ.R * 0.6;
    m.body.rotation.z = (reducedMotion ? 0 : Math.sin(t * 3) * 0.06) - this.steer * 0.15;
  }

  #renderPlants(plants, t, reducedMotion, show) {
    for (const p of plants) {
      const { model } = p;
      model.group.visible = show && (!p.wilted || p.timer < 0.6);
      if (!model.group.visible) continue;
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
  }

  #renderBoss(t, reducedMotion) {
    const boss = this.boss, m = this.bossModel;
    m.group.visible = this.phase === 'arena' && (boss.mode !== 'defeated' || boss.timer < 1.2);
    this.#arenaPoint(boss.x, boss.z, 0, m.group.position);
    tmp.copy(this.arena.right).multiplyScalar(boss.facingX).addScaledVector(this.arena.forward, boss.facingZ);
    basis.makeBasis(tmp2.crossVectors(this.arena.up, tmp).normalize(), this.arena.up, tmp.normalize());
    m.group.quaternion.setFromRotationMatrix(basis);
    const walking = boss.mode === 'walk', beat = t * 6;
    m.legL.rotation.x = walking ? Math.sin(beat) * 0.5 : 0;
    m.legR.rotation.x = walking ? -Math.sin(beat) * 0.5 : 0;
    m.head.rotation.x = boss.mode === 'aim' ? -0.45 : boss.mode === 'fire' ? 0.2 : boss.mode === 'tired' ? 0.5 : 0;
    m.body.rotation.x = boss.mode === 'tired' ? 0.25 : boss.mode === 'hurt' ? -0.2 : 0;
    m.body.position.y = boss.mode === 'tired' && !reducedMotion ? Math.abs(Math.sin(t * 3)) * -0.1 : 0;
    const down = boss.mode === 'defeated' ? Math.min(1, boss.timer / 1.2) : 0;
    m.body.scale.setScalar(m.scale * (1 - down));
    this.fire.visible = m.group.visible && (boss.mode === 'fire' || boss.mode === 'aim');
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
  }

  snapshot() {
    const b = this.player.body, river = this.#river();
    const along = this.phase === 'land' ? THREE.MathUtils.clamp(-this.#local().z / -ZONES.forestEnd, 0, 1) : 0;
    const progress = this.status === 'finished' ? 1 : this.boss.defeated ? 0.97
      : this.phase === 'arena' ? 0.85 + (GLUT.hp - this.boss.hp) / GLUT.hp * 0.1
        : this.phase === 'river' || this.phase === 'dark' ? 0.6 + river.progress * 0.25
          : this.phase === 'land' ? 0.1 + along * 0.5 : 0.05;
    const forward = this.rig?.forward ?? this.player.facing;
    return {
      status: this.status, time: this.time, penalty: this.penalty, phase: this.phase, progress,
      collectibles: this.collected, totalCollectibles: this.world.bits.length + river.totalGems,
      hearts: this.player.hearts, maxHearts: MAX_HEARTS, powered: this.powered, fight: this.fight, stage: this.stage,
      boss: this.boss.snapshot(), river, damai: this.guide.snapshot(),
      planet: b.planet?.id ?? null, pos: b.pos.toArray(), grounded: b.onGround,
      forward: forward.toArray(), right: new THREE.Vector3().crossVectors(forward, b.up).normalize().toArray(),
      rocket: this.rocket.phase,
      defeated: this.enemies.defeated + this.arenaEnemies.defeated + [...this.plants, ...this.arenaPlants].filter(p => p.wilted).length,
      checkpoint: this.world.flags.filter(f => f.reached).length, actionHint: '',
    };
  }

  layout() {
    const L = this.level;
    const at = (planet, dir, height = 0) => surfacePoint(planet, dir, height).toArray();
    return {
      rocket: at(this.start, L.rocket.dir, L.rocket.height),
      log: landPoint(L.log.x, L.log.z, 0).toArray(),
      berries: L.powerups.map(p => ({ id: p.id, pos: at(p.planet, p.dir, p.height) })),
      springs: L.springs.map(s => at(s.planet, s.dir)),
      ravines: RAVINES.map(r => ({ ...r })),
      platforms: L.blocks.filter(b => b.planet === this.land).map(b => ({ pos: at(b.planet, b.dir, b.top), top: b.top })),
      route: L.route.map(p => ({ ...p })),
      arena: { center: this.arena.center.toArray(), radius: L.arena.radius },
      bits: this.world.bits.length,
    };
  }
}
