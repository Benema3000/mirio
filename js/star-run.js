// Der Raketenritt: Mirio on Miro's rocket through the asteroids to the
// Riesenstern, then up Krakel's three arms and over its head. The rules are
// star-rules.js; this is the scene and the camera.
//
// Runs as a chapter (see main.js CHAPTER_TYPES): reset, step, render,
// snapshot, layout, seek, rescue, and `scene`.
//
// The route runs along -Z. The Riesenstern lies across its end, face towards
// the rocket; Krakel stands on that face. Everything on the star is built in
// the arena group, whose +Y is the star's face normal (world +Z).

import * as THREE from 'three';
import { toon } from './materials.js';
import { buildMirio } from './mirio-model.js';
import { bigCrystalGeometry, buildRocket } from './props.js';
import { Particles } from './scene.js';
import { KRAKEL_HEAD, buildKrakel, buildRiesenstern, buildWave, buildZischer, krakelPaths, pathFrame } from './star-creatures.js';
import {
  CLIMB, FLIGHT, LANDING, asteroidPosition, createStarRun, makeStarCourse, rescueStarRun, seekStarRun, starSnapshot, stepStarRun, zischerPosition,
} from './star-rules.js';

const Y = new THREE.Vector3(0, 1, 0);
// The star's face lies this far past the end of the route.
const STAR_FACE_Z = -(FLIGHT.length + 110);
// Krakel stands left of the star's eyes.
const ARENA_AT = new THREE.Vector3(-45, 0, STAR_FACE_Z);
// Where the rocket comes down, beside the left arm's claw, in arena units.
const LANDING_SPOT = new THREE.Vector3(-20, 0, 20);
const ROCKET_LENGTH = 4;
const SPACE = 0x0b0d2a;
const smooth = (t) => t * t * (3 - 2 * t);
const matrix = new THREE.Matrix4(), dummy = new THREE.Object3D();
const standUp = new THREE.Vector3(), facing = new THREE.Vector3();
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), look = new THREE.Vector3(), camPos = new THREE.Vector3(), camUp = new THREE.Vector3();
const frameOut = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), up: new THREE.Vector3(), right: new THREE.Vector3() };

/** Forward is the direction of travel; right is screen-right from behind. */
export function starFrame(s) {
  const center = new THREE.Vector3(7 * Math.sin(s / 170) + 3 * Math.sin(s / 61), 5 * Math.sin(s / 230) + 2 * Math.cos(s / 90) - 2, -s);
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

/** A lumpy grey rock, the same every time. */
function asteroidGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const pos = geometry.attributes.position, p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const bump = 1 + 0.16 * Math.sin(p.x * 4.1 + p.y * 2.3) * Math.cos(p.z * 3.7 - p.x) + 0.08 * Math.sin(p.y * 9 + p.z * 5);
    p.multiplyScalar(bump);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function shotGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.2 : 0.5;
    if (!i) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.06);
}

function starfield() {
  const count = 1800, positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), color = new THREE.Color();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    positions.set([Math.cos(a) * r * 900, u * 900, Math.sin(a) * r * 900], i * 3);
    color.setHSL([0.6, 0.12, 0.85, 0][i % 4], 0.6, 0.75 + rnd() * 0.25);
    color.toArray(colors, i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, depthTest: false, depthWrite: false }));
  points.renderOrder = -10;
  points.frustumCulled = false;
  return points;
}

function pool(geometry, material, count, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.name = name;
  mesh.count = 0;
  return mesh;
}

export class StarRun {
  constructor(art) {
    this.course = makeStarCourse();
    this.paths = krakelPaths();
    this.scene = new THREE.Scene();
    this.scene.name = 'raketenritt';
    this.scene.background = new THREE.Color(SPACE);
    this.scene.add(new THREE.HemisphereLight(0xe4e8ff, 0x3a2f5a, 1.7));
    // From behind the rocket, which on the star is from above.
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(30, 60, 120);
    this.scene.add(key);
    this.key = key;
    this.scene.add(key.target);
    const warm = new THREE.DirectionalLight(0xffd36a, 0.9);
    warm.position.set(0, 20, -100);
    this.scene.add(warm, warm.target);
    this.warm = warm;
    this.stars = starfield();
    this.scene.add(this.stars);
    this.particles = new Particles(this.scene, art.sparkle);

    this.star = buildRiesenstern(art);
    this.star.group.position.set(0, 0, STAR_FACE_Z);
    this.scene.add(this.star.group);
    this.arena = new THREE.Group();
    this.arena.position.copy(ARENA_AT);
    this.arena.rotation.x = Math.PI / 2;
    this.scene.add(this.arena);
    this.arena.updateMatrixWorld(true);
    this.arenaUp = new THREE.Vector3(0, 1, 0).transformDirection(this.arena.matrixWorld);

    this.krakel = buildKrakel(art, this.paths);
    this.arena.add(this.krakel.group);
    this.waves = Array.from({ length: 3 }, () => { const w = buildWave(art); w.visible = false; this.arena.add(w); return w; });
    this.spot = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ color: 0xff8fd0, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    this.spot.renderOrder = 1;
    this.arena.add(this.spot);
    this.armZischer = Array.from({ length: 2 }, () => { const z = buildZischer(art); z.group.visible = false; this.arena.add(z.group); return z; });
    this.crystal = new THREE.Mesh(bigCrystalGeometry(), toon(0x8ff3ff, { emissive: 0x2a8aa8 }));
    this.crystal.scale.setScalar(3);
    this.arena.add(this.crystal);

    // The rocket with Mirio astride it: nose forward, flame behind.
    this.ship = new THREE.Group();
    this.rocket = buildRocket(art);
    const scale = ROCKET_LENGTH / this.rocket.height;
    this.rocket.group.scale.setScalar(scale);
    this.rocket.group.rotation.x = Math.PI / 2;
    this.ship.add(this.rocket.group);
    this.scene.add(this.ship);
    this.seat = new THREE.Group();
    this.seat.position.set(0, this.rocket.radius * scale * 0.8, ROCKET_LENGTH * 0.42);
    this.ship.add(this.seat);
    this.mirio = buildMirio(art);
    this.walkPhase = 0;

    this.asteroids = pool(asteroidGeometry(), toon(0xffffff, { map: art.felt }), this.course.asteroids.length, 'raketenritt:asteroids');
    const rock = new THREE.Color();
    this.course.asteroids.forEach((a, i) => this.asteroids.setColorAt(i, rock.setHSL(0.07 + (i % 5) * 0.015, 0.18, a.big ? 0.26 : 0.34)));
    this.scene.add(this.asteroids);
    this.shots = pool(shotGeometry(), new THREE.MeshBasicMaterial({ color: 0xffe36a }), 32, 'raketenritt:stars');
    this.sparks = pool(new THREE.SphereGeometry(0.55, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff5a2a }), 24, 'raketenritt:sparks');
    this.scene.add(this.shots, this.sparks);
    this.flyers = Array.from({ length: 3 }, () => { const z = buildZischer(art); z.group.visible = false; z.group.scale.setScalar(1.3); this.scene.add(z.group); return z; });
    this.reset();
  }

  reset() {
    this.run = createStarRun();
    this.visualTime = 0;
    this.cameraReady = false;
    this.flash = 0;
    this.whirl = 0;
    this.tickle = 0;
    this.bank = this.pitch = 0;
    this.lastClimb = 0;
    this.switchFrom = null;
    this.landFrom = null;
    this.krakel.head.scale.set(1, 1, 1);
    this.#seat();
    this.#syncKrakel(true);
    return this.snapshot();
  }

  step(dt, controls = {}) {
    const before = this.run.climb.stage;
    const events = stepStarRun(this.run, this.course, dt, controls);
    const r = this.run;
    for (const event of events) {
      if (event.type === 'slam') {
        const a = this.course.asteroids.find(item => item.id === event.id), p = asteroidPosition(a, r.elapsed);
        this.particles.burst(point(starFrame(a.s), p.x, p.y), { count: a.big ? 26 : 14, color: [0xb7a89a, 0xffe36a, 0x8a7f86], speed: 9, size: 0.9, life: 0.8 });
      }
      if (event.type === 'enemyDefeat') {
        // In the flight, where the Zischer that was hit is; on an arm, the one Mirio whirled.
        const z = event.id && this.course.zischer.find(item => item.id === event.id), state = z && r.zischerState.get(z.id);
        const p = state && zischerPosition(z, { ...state, gone: false }, r.s);
        const at = p ? point(starFrame(p.s), p.x, p.y) : this.#lastZischer ?? this.ship.position;
        this.particles.burst(at, { count: 18, color: [0x222222, 0xe0262f, 0xf6e64e], speed: 8, size: 0.7 });
      }
      if (event.type === 'enemyDefeat' && event.kind === 'whirl') this.whirl = 0.4;
      if (event.type === 'planeBump' || event.type === 'hurt') this.flash = 0.5;
      if (event.type === 'arrive') this.landFrom = { pos: this.ship.position.clone(), forward: starFrame(this.course.length).forward };
      if (event.type === 'tickle') { this.tickle = 0.35; this.particles.burst(this.spot.getWorldPosition(tmp), { count: 12, color: [0xff8fd0, 0xffffff, 0x5fb0ff], speed: 5, size: 0.6 }); }
      if (event.type === 'armDown') this.switchFrom = this.#climberAt(before, this.course.stages[before].length);
      if (event.type === 'bossDown') this.particles.burst(this.krakel.head.getWorldPosition(tmp), { count: 60, color: [0xffe36a, 0x5fb0ff, 0xff8fd0, 0xffffff], speed: 14, size: 1.2, life: 1.4 });
    }
    if (this.run.phase === 'climb' && this.mirio.group.parent !== this.arena) this.#seat();
    return events;
  }

  rescue() {
    const events = rescueStarRun(this.run, this.course);
    this.cameraReady = false;
    return events;
  }

  seek(progress) {
    seekStarRun(this.run, this.course, progress);
    this.switchFrom = null;
    this.cameraReady = false;
    this.#seat();
    this.#syncKrakel(true);
  }

  snapshot() { return starSnapshot(this.run, this.course); }

  layout() {
    return {
      length: this.course.length, checkpoints: [...this.course.checkpoints],
      asteroids: this.course.asteroids.map(a => ({ id: a.id, s: a.s, x: a.x, y: a.y, radius: a.radius, hp: a.hp })),
      zischer: this.course.zischer.map(z => ({ ...z })),
      stages: this.course.stages.map(st => ({ id: st.id, name: st.name, length: st.length, tickles: st.tickles, zischer: [...st.zischer] })),
    };
  }

  /** Mirio rides the rocket until the climb, then stands on Krakel. */
  #seat() {
    const m = this.mirio, climbing = this.run.phase === 'climb' || this.run.phase === 'cheer';
    (climbing ? this.arena : this.seat).add(m.group);
    m.group.visible = true;
    m.group.position.set(0, climbing ? 0 : -0.55, 0);
    m.group.quaternion.identity();
    m.body.rotation.set(0, 0, 0);
    m.legL.rotation.set(climbing ? 0 : -0.55, 0, climbing ? 0 : -0.45);
    m.legR.rotation.set(climbing ? 0 : -0.55, 0, climbing ? 0 : 0.45);
    m.armL.rotation.set(climbing ? 0 : -0.9, 0, m.armRestZ.L * (climbing ? 1 : 0.5));
    m.armR.rotation.set(climbing ? 0 : -0.9, 0, m.armRestZ.R * (climbing ? 1 : 0.5));
  }

  /** Arms curled for each one tickled; the head bowed for the last climb. */
  #syncKrakel(snap = false, dt = 0) {
    const down = this.run.phase === 'cheer' ? 3 : this.run.armsDown;
    this.krakel.arms.forEach((arm, i) => {
      const target = i < down ? 0.14 : 1;
      arm.curl = snap ? target : THREE.MathUtils.damp(arm.curl ?? 1, target, 3, dt);
      arm.group.scale.setScalar(arm.curl);
    });
    const headY = down >= 3 ? KRAKEL_HEAD.bowedY : KRAKEL_HEAD.y;
    this.krakel.head.position.y = snap ? headY : THREE.MathUtils.damp(this.krakel.head.position.y, headY, 2.5, dt);
    // The curled stubs stay under the head as it bows.
    for (const arm of this.krakel.arms) arm.group.position.copy(arm.shoulder).setY(arm.shoulder.y + this.krakel.head.position.y - KRAKEL_HEAD.y);
  }

  /** Mirio's spot on a climb, in arena units (the surface point and its frame). */
  #climberAt(stage, s, x = 0, z = 0) {
    const path = this.paths[stage], length = this.course.stages[stage].length;
    pathFrame(path, s / length, frameOut);
    return {
      pos: frameOut.pos.clone().addScaledVector(frameOut.right, x).addScaledVector(frameOut.up, z),
      tangent: frameOut.tangent.clone(), up: frameOut.up.clone(), right: frameOut.right.clone(),
    };
  }

  #lastZischer = null;

  render(camera, dt = 0, { reducedMotion = false } = {}) {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    this.visualTime += dt;
    const r = this.run, t = this.visualTime;
    this.flash = Math.max(0, this.flash - dt);
    this.whirl = Math.max(0, this.whirl - dt);
    this.tickle = Math.max(0, this.tickle - dt);
    const blend = 1 - Math.exp(-7 * dt);
    this.#syncKrakel(false, dt);
    // Krakel breathes; while a wave is coming, the arm being climbed shudders.
    const head = this.krakel.head;
    head.rotation.z = reducedMotion ? 0 : Math.sin(t * 0.9) * 0.04;
    const warning = r.phase === 'climb' ? r.climb.warning : 0;
    this.krakel.arms.forEach((arm, i) => {
      arm.tube.position.set(0, 0, 0);
      if (!reducedMotion && i === r.climb.stage && warning > 0) arm.tube.position.set(Math.sin(t * 60) * 0.12, 0, Math.cos(t * 53) * 0.12);
    });
    if (!reducedMotion && r.climb.stage === 3 && warning > 0 && r.phase === 'climb') head.position.x = Math.sin(t * 60) * 0.15;
    else head.position.x = 0;
    this.star.eyes.forEach((eye, i) => { eye.scale.y = reducedMotion ? 1 : (Math.sin(t * 0.7 + i * 0.2) > 0.985 ? 0.15 : 1); });

    if (r.phase === 'flight') this.#renderFlight(camera, dt, blend, reducedMotion);
    else this.#hideFlight();
    if (r.phase === 'landing') this.#renderLanding(camera, blend);
    if (r.phase === 'climb') this.#renderClimb(camera, dt, blend, reducedMotion);
    else { this.spot.visible = false; this.waves.forEach(w => (w.visible = false)); this.armZischer.forEach(z => (z.group.visible = false)); }
    if (r.phase === 'cheer') this.#renderCheer(camera, blend, reducedMotion);
    else this.crystal.visible = false;

    const flame = this.rocket.flame;
    flame.visible = r.phase === 'flight' || (r.phase === 'landing' && r.phaseTime < LANDING.duration * 0.85);
    flame.scale.set(1, reducedMotion ? 1 : 1 + Math.sin(t * 37) * 0.18, 1);
    this.stars.position.copy(camera.position);
    this.particles.update(dt);
  }

  #hideFlight() {
    this.asteroids.count = this.shots.count = this.sparks.count = 0;
    this.flyers.forEach(z => (z.group.visible = false));
  }

  #renderFlight(camera, dt, blend, reducedMotion) {
    const r = this.run, frame = starFrame(r.s);
    this.bank += ((reducedMotion ? 0 : r.vx / FLIGHT.lateralSpeed * 0.5) - this.bank) * blend;
    this.pitch += ((reducedMotion ? 0 : -r.vy / FLIGHT.verticalSpeed * 0.2) - this.pitch) * blend;
    const roll = !reducedMotion && r.roll > 0 ? (1 - r.roll / FLIGHT.rollDuration) * Math.PI * 2 : 0;
    point(frame, r.x, r.y, this.ship.position);
    orient(this.ship, frame.forward, frame.up);
    this.ship.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, 0, this.bank + roll)));
    this.ship.visible = !r.invulnerable || Math.floor(r.invulnerable * 14) % 2 === 0 || r.roll > 0;

    // Above and behind, so Mirio on his rocket sits low in the picture and the field ahead stays clear.
    const followDistance = 11 * Math.max(1, Math.min(1.9, 0.85 / Math.max(0.2, camera.aspect)));
    point(starFrame(r.s - followDistance), r.x * 0.5 + 3, 4.6 + r.y * 0.45, camPos);
    point(starFrame(r.s + 40), r.x * 0.35, r.y * 0.3 + 2.5, look);
    this.#camera(camera, camPos, look, Y, blend, (camera.aspect < 0.85 ? 72 : 60));

    // Asteroids from just behind to well ahead; they grow in out of the dark.
    let n = 0;
    for (const [i, a] of this.course.asteroids.entries()) {
      if (r.broken.has(a.id) || a.s < r.s - 20 || a.s > r.s + 420) continue;
      const p = asteroidPosition(a, r.elapsed);
      point(starFrame(a.s), p.x, p.y, dummy.position);
      dummy.rotation.set(r.elapsed * a.spin + a.phase, r.elapsed * a.spin * 0.7, 0);
      const hp = r.asteroidHp.get(a.id) ?? a.hp, wobble = hp < a.hp ? 1 + Math.sin(this.visualTime * 30) * 0.03 : 1;
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
      point(starFrame(spark.s), spark.cx ?? spark.x, spark.cy ?? spark.y, dummy.position);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(this.visualTime * 20 + spark.id) * 0.2);
      dummy.updateMatrix();
      this.sparks.setMatrixAt(n++, dummy.matrix);
    }
    this.sparks.count = n;
    this.sparks.instanceMatrix.needsUpdate = true;

    // The Zischer of the wave in progress, facing the rocket.
    let k = 0;
    for (const z of this.course.zischer) {
      const p = zischerPosition(z, r.zischerState.get(z.id), r.s);
      if (!p || k >= this.flyers.length) continue;
      const flyer = this.flyers[k++], f = starFrame(p.s);
      flyer.group.visible = true;
      point(f, p.x, p.y, flyer.group.position);
      this.#lastZischer = flyer.group.position;
      orient(flyer.group, f.forward.clone().negate(), f.up);
      this.#animateZischer(flyer, reducedMotion);
    }
    for (; k < this.flyers.length; k++) this.flyers[k].group.visible = false;
  }

  #rockColor(i) {
    this.rockColor ??= new THREE.Color();
    return this.rockColor.setHSL(0.07 + (i % 5) * 0.015, 0.18, this.course.asteroids[i].big ? 0.26 : 0.34);
  }

  #animateZischer(z, reducedMotion) {
    const t = this.visualTime;
    z.flame.scale.set(1, reducedMotion ? 1 : 1 + Math.sin(t * 31) * 0.2, 1);
    z.arms.forEach((arm, i) => (arm.rotation.z = (i ? -0.9 : 0.9) * (reducedMotion ? 1 : 1 + Math.sin(t * 4 + i) * 0.25)));
    z.body.position.y = reducedMotion ? 0 : Math.sin(t * 3) * 0.15;
  }

  #renderLanding(camera, blend) {
    const r = this.run, k = THREE.MathUtils.clamp(r.phaseTime / LANDING.duration, 0, 1), e = smooth(k);
    const from = this.landFrom ?? { pos: point(starFrame(this.course.length), 0, 0), forward: starFrame(this.course.length).forward };
    const land = this.arena.localToWorld(LANDING_SPOT.clone()).addScaledVector(this.arenaUp, 1.2);
    const p1 = from.pos.clone().addScaledVector(from.forward, 50), p2 = land.clone().addScaledVector(this.arenaUp, 28);
    const bezier = new THREE.CubicBezierCurve3(from.pos, p1, p2, land);
    bezier.getPoint(e, this.ship.position);
    // The nose turns from the route to Krakel, the belly from the route's floor to the star.
    const krakel = this.arena.localToWorld(new THREE.Vector3(0, 0, 0)).sub(land).normalize();
    const forward = from.forward.clone().lerp(krakel, smooth(Math.min(1, k * 1.4))).normalize();
    const up = Y.clone().lerp(this.arenaUp, smooth(k)).normalize();
    orient(this.ship, forward, up);
    this.ship.visible = true;
    // From the chase, out to a wide view of Krakel waiting on the star.
    const chase = this.ship.position.clone().addScaledVector(forward, -10).addScaledVector(up, 3);
    const wide = this.arena.localToWorld(new THREE.Vector3(-4, 15, 48));
    camPos.copy(chase).lerp(wide, smooth(THREE.MathUtils.clamp((k - 0.15) / 0.7, 0, 1)));
    look.copy(this.ship.position).lerp(this.arena.localToWorld(new THREE.Vector3(0, 16, 0)), smooth(THREE.MathUtils.clamp((k - 0.3) / 0.6, 0, 1)));
    camUp.copy(up);
    this.#camera(camera, camPos, look, camUp, blend, camera.aspect < 0.85 ? 72 : 60);
  }

  #renderClimb(camera, dt, blend, reducedMotion) {
    const r = this.run, c = r.climb, st = this.course.stages[c.stage], m = this.mirio;
    const at = this.#climberAt(c.stage, c.s, c.x, c.z);
    // Flung from the curled arm to the next claw.
    if (c.switching > 0 && this.switchFrom) {
      const k = 1 - c.switching / CLIMB.switchTime;
      at.pos.lerpVectors(this.switchFrom.pos, at.pos, smooth(k)).addScaledVector(Y, Math.sin(Math.PI * k) * 9);
    } else if (r.phaseTime < 0.6 && c.stage === 0) {
      at.pos.lerpVectors(LANDING_SPOT, at.pos, smooth(r.phaseTime / 0.6)).addScaledVector(Y, Math.sin(Math.PI * r.phaseTime / 0.6) * 2);
    }
    m.group.position.copy(at.pos);
    // Leaning into the slope, not lying on it; on the head he stands out from it.
    standUp.copy(at.up);
    if (c.stage < 3) standUp.add(Y).normalize();
    orient(m.group, facing.copy(at.tangent).addScaledVector(standUp, -at.tangent.dot(standUp)).normalize(), standUp);
    const moved = Math.abs(c.s - this.lastClimb);
    this.lastClimb = c.s;
    this.walkPhase += moved * 2.2;
    const swing = reducedMotion ? 0 : Math.sin(this.walkPhase) * Math.min(1, moved / Math.max(dt, 1e-3) / CLIMB.speed) * 0.8;
    m.legL.rotation.x = swing;
    m.legR.rotation.x = -swing;
    const armsUp = !c.grounded || this.tickle > 0 || c.switching > 0;
    const wiggle = this.tickle > 0 && !reducedMotion ? Math.sin(this.visualTime * 40) * 0.4 : 0;
    m.armL.rotation.set(-swing * 0.6, 0, (armsUp ? m.armRaisedZ.L : m.armRestZ.L) + wiggle);
    m.armR.rotation.set(swing * 0.6, 0, (armsUp ? m.armRaisedZ.R : m.armRestZ.R) - wiggle);
    m.body.rotation.y = this.whirl > 0 ? (1 - this.whirl / 0.4) * Math.PI * 2 : 0;
    m.body.rotation.z = c.stun > 0 && !reducedMotion ? Math.sin(this.visualTime * 30) * 0.3 : 0;
    m.group.visible = !c.invulnerable || c.stun > 0 || Math.floor(c.invulnerable * 14) % 2 === 0;
    // The rocket stays parked where it landed.
    this.ship.visible = true;

    // The tickle spot at the top of this climb, pulsing.
    const top = this.#climberAt(c.stage, st.length);
    this.spot.visible = !c.switching;
    this.spot.position.copy(top.pos).addScaledVector(top.up, 0.05);
    this.spot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), top.up);
    this.spot.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(this.visualTime * 5) * 0.15 + this.tickle);

    // Waves: rings running down the arm.
    this.waves.forEach((wave, i) => {
      const pos = c.waves[i]?.pos;
      wave.visible = pos !== undefined && pos >= 0 && pos <= st.length && !c.switching;
      if (!wave.visible) return;
      const f = this.#climberAt(c.stage, pos);
      // Round an arm; on the head, a ridge rising out of it.
      wave.position.copy(f.pos).addScaledVector(f.up, c.stage === 3 ? -2.4 : -this.paths[c.stage].offset);
      wave.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.tangent);
      wave.scale.setScalar(c.stage === 3 ? 1.6 : 1);
    });

    // Zischer hovering on the arm, facing down it.
    this.armZischer.forEach((model, i) => {
      const state = c.zischer[i], s = st.zischer[i];
      model.group.visible = Boolean(state?.awake && !state.gone) && !c.switching;
      if (!model.group.visible) return;
      const f = this.#climberAt(c.stage, s, state.x, 1 + Math.max(0, 1 - state.age * 2) * 6);
      model.group.position.copy(f.pos);
      orient(model.group, f.tangent.clone().negate(), f.up);
      this.#lastZischer = this.arena.localToWorld(f.pos.clone());
      this.#animateZischer(model, reducedMotion);
    });

    // Level with Mirio and back from the climb, never under the star: the
    // arm rises away into the picture and the horizon stays put.
    tmp.copy(at.tangent).negate().setY(0);
    if (tmp.lengthSq() < 0.09) tmp.set(at.pos.x, 0, at.pos.z);
    tmp.normalize();
    camPos.copy(at.pos).addScaledVector(tmp, 8.5).addScaledVector(Y, 4.2);
    camPos.y = Math.max(2, camPos.y);
    look.copy(at.pos).addScaledVector(at.tangent, 2.5).addScaledVector(Y, 1.4);
    this.arena.localToWorld(camPos);
    this.arena.localToWorld(look);
    this.#camera(camera, camPos, look, this.arenaUp, blend, camera.aspect < 0.85 ? 74 : 62);
  }

  #renderCheer(camera, blend, reducedMotion) {
    const r = this.run, t = r.phaseTime, head = this.krakel.head;
    // Krakel laughs; the crystal comes up out of the top of its head.
    head.scale.set(1, reducedMotion ? 1 : 1 + Math.sin(t * 14) * 0.05, 1);
    this.crystal.visible = true;
    this.crystal.position.set(0, head.position.y + KRAKEL_HEAD.r + 2 + Math.min(1, t) * 4, 0);
    this.crystal.rotation.y = t * 2;
    this.mirio.armL.rotation.z = this.mirio.armRaisedZ.L;
    this.mirio.armR.rotation.z = this.mirio.armRaisedZ.R;
    const a = reducedMotion ? 0.4 : 0.4 + t * 0.35;
    camPos.set(Math.sin(a) * 30, head.position.y + 8, Math.cos(a) * 30);
    look.set(0, head.position.y + 4, 0);
    this.arena.localToWorld(camPos);
    this.arena.localToWorld(look);
    this.#camera(camera, camPos, look, this.arenaUp, blend, camera.aspect < 0.85 ? 72 : 60);
  }

  #camera(camera, position, target, up, blend, fov) {
    if (!this.cameraReady) {
      camera.position.copy(position);
      this.cameraLook = target.clone();
      this.cameraUp = up.clone();
      this.cameraReady = true;
    } else {
      camera.position.lerp(position, blend);
      this.cameraLook.lerp(target, blend);
      this.cameraUp.lerp(up, blend).normalize();
    }
    camera.up.copy(this.cameraUp);
    camera.lookAt(this.cameraLook);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
}
