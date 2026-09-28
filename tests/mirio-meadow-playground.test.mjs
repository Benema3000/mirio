import assert from 'node:assert/strict';
import test from 'node:test';
import {PerspectiveCamera, Scene, Vector3} from 'three';
import {makeLevel, collidersFor} from '../js/level.js';
import {collide, inWater, stepBody, surfacePoint, tangentDir} from '../js/world.js';
import {BOAT, MEADOW, createMeadowRun, meadowLayout, stepMeadowRun} from '../js/meadow-playground-rules.js';
import {MeadowPlayground} from '../js/meadow-playground.js';
import {chooseBiplaneHome, clearLanding} from '../js/biplane.js';
import {Player} from '../js/player.js';

function setup() {
  const level = makeLevel(), layout = meadowLayout(level), run = createMeadowRun(layout);
  const input = {flying: true, planeDir: layout.wind.dir, planeAltitude: 1.5, planeSpeed: 10, boost: 1, planeDistance: 0,
    walking: false, playerDir: layout.wind.dir, playerHeight: 0, grounded: true};
  return {level, layout, run, input};
}
function advance(run, layout, input, seconds) {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 120) events.push(...stepMeadowRun(run, layout, 1 / 120, input));
  return events;
}

test('walking, high jumps and a parked plane cannot power the propeller toy', () => {
  for (const change of [{flying: false, walking: true, playerHeight: 4}, {planeSpeed: 0}, {planeAltitude: 0}]) {
    const {run, layout, input} = setup(); Object.assign(input, change);
    advance(run, layout, input, 3); assert.equal(run.windPowered, false);
  }
  const {run, layout, input} = setup();
  const events = advance(run, layout, input, 2);
  assert.equal(run.windPowered, true);assert.equal(events.filter(e => e.type === 'meadowWind').length, 1);
});

test('the lake boat needs low flight and is towed to a generous dry destination once', () => {
  const {run, layout, input} = setup(); input.planeDir = layout.boat.dir; input.planeAltitude = 4;
  advance(run, layout, input, .3); assert.equal(run.boat, BOAT.ADRIFT);
  input.planeAltitude = 1;
  assert.equal(advance(run, layout, input, .3).filter(e => e.type === 'meadowTow').length, 1);
  input.planeDir = layout.dock.dir;
  const events = advance(run, layout, input, .3);
  assert.equal(run.boat, BOAT.DOCKED); assert.ok(run.boatDir.angleTo(layout.dock.dir) < 1e-8);
  assert.equal(events.filter(e => e.type === 'meadowBoat').length, 1);
  assert.equal(advance(run, layout, input, 1).filter(e => e.type === 'meadowBoat').length, 0);
});

test('a kite needs ordered aerial gates and actual flying distance, never an ordinary jump', () => {
  const {run, layout, input} = setup(); input.planeDir = layout.kite.dir;
  stepMeadowRun(run, layout, .1, input); assert.equal(run.kiteStage, 0);
  input.planeDir = layout.beacons[2].dir; stepMeadowRun(run, layout, .1, input); assert.equal(run.kiteStage, 0);
  for (const target of layout.beacons) {input.planeDir = target.dir; stepMeadowRun(run, layout, .1, input);}
  assert.equal(run.kiteStage, 3); assert.equal(run.kiteFlying, false);
  input.planeDistance = MEADOW.kiteDistance;
  stepMeadowRun(run, layout, .1, input); assert.equal(run.kiteFlying, true);
  const grounded = createMeadowRun(layout); input.flying = false; input.walking = true;
  for (const target of [layout.kite, ...layout.beacons]) {input.planeDir = input.playerDir = target.dir; stepMeadowRun(grounded, layout, .1, input);}
  assert.equal(grounded.kiteStage, -1);
});

test('the squirrel waits for walking landings and unfolds a reusable spring at the lookout', () => {
  const {run, layout, input} = setup(); run.windPowered = true;
  input.flying = false; input.walking = true;
  for (const target of layout.guide) {
    input.playerDir = target.dir; input.playerHeight = target.height; input.grounded = false;
    const before = run.guideStage; stepMeadowRun(run, layout, .1, input); assert.equal(run.guideStage, before);
    input.grounded = true; stepMeadowRun(run, layout, .1, input);
  }
  assert.equal(run.lookout, true); assert.equal(run.springOpen, true);
  input.playerDir = layout.spring.dir; input.playerHeight = layout.spring.height;
  const first = advance(run, layout, input, 1);
  assert.ok(first.some(e => e.type === 'meadowSpring'));
  const count = run.springUses; advance(run, layout, input, 1); assert.ok(run.springUses > count);
});

test('all five helps produce one picnic; dismounting preserves discoveries and kite route', () => {
  const {run, layout, input} = setup();
  Object.assign(run, {windPowered: true, boat: BOAT.DOCKED, kiteFlying: true, kiteStage: 3, lookout: true, springOpen: true});
  input.flying = false;
  const events = advance(run, layout, input, 1);
  assert.equal(events.filter(e => e.type === 'meadowPicnic').length, 1);
  assert.equal(run.kiteStage, 3);assert.equal(run.boat, BOAT.DOCKED);assert.equal(run.windPowered, true);
});

function system() {
  const level = makeLevel(), layout = meadowLayout(level), colliders = collidersFor(level), scene = new Scene();
  const playground = new MeadowPlayground(scene, level, colliders);
  const player = {state: 'biplane', body: {planet: layout.planet, pos: surfacePoint(layout.planet, layout.wind.dir, 1.5), up: layout.wind.dir.clone(), onGround: false}, bounce(options) {this.bounced = options;}};
  const plane = {mounted: true, distance: 0, flight: {planet: layout.planet, pos: surfacePoint(layout.planet, layout.wind.dir, 1.5), up: layout.wind.dir.clone(), altitude: 1.5, speed: 10, boost: 1}};
  return {level, layout, colliders, scene, playground, player, plane};
}

test('the wind toy unfolds real walkable collision over the whole lake', () => {
  const {layout, colliders, playground, player, plane} = system();
  const before = colliders(layout.planet).length;
  for (let i = 0; i < 8; i++) playground.step(.1, player, plane);
  assert.ok(colliders(layout.planet).length > before);
  for (const tile of layout.bridge) {
    const pos = surfacePoint(layout.planet, tile.dir, tile.height + .1), previous = surfacePoint(layout.planet, tile.dir, tile.height + 1);
    const velocity = tile.dir.clone().multiplyScalar(-4);
    const hits = colliders(layout.planet).map(c => collide(pos, velocity, {radius: .45, height: 1.8}, c, tile.dir, previous));
    assert.ok(hits.includes('top'));assert.equal(inWater(pos, layout.planet), false);
  }
  const start = layout.bridge[0], end = layout.bridge.at(-1);
  const body = {pos: surfacePoint(layout.planet, start.dir, start.height + .13), vel: new Vector3(), up: start.dir.clone(), radius: .45, height: 1.8, onGround: true, planet: layout.planet};
  for (let i = 0; i < 250; i++) {
    const direction = tangentDir(end.dir, body.up);
    stepBody(body, direction, 5, [layout.planet], colliders, 1 / 120);
    assert.equal(inWater(body.pos, layout.planet), false, 'the joined petals must not drop feet into water');
  }
  assert.ok(body.up.angleTo(end.dir) * layout.planet.radius < 2.2);
});

test('reset removes only owned unlocks and restores the plane landing clearing', () => {
  const {layout, level, colliders, playground, player, plane} = system();
  const before = colliders(layout.planet).length;
  for (let i = 0; i < 8; i++) playground.step(.1, player, plane);
  playground.reset();assert.equal(colliders(layout.planet).length, before);assert.equal(playground.snapshot().completed, 0);
  assert.equal(clearLanding(layout.planet, layout.clearing.dir, colliders(layout.planet)), true);
  const home = chooseBiplaneHome(level);assert.equal(clearLanding(layout.planet, home.dir, colliders(layout.planet), 2.05), true);
});

test('inactive play freezes tasks and scenery remains finite with reduced motion', () => {
  const {playground, player, plane, scene} = system();
  const before = playground.snapshot();playground.step(.25, player, plane, {active: false});assert.deepEqual(playground.snapshot(), before);
  const camera = new PerspectiveCamera();camera.position.set(0, 40, 20);
  playground.update(10, camera, {reducedMotion: true});
  scene.traverse(object => {assert.ok(object.position.toArray().every(Number.isFinite));assert.ok(object.quaternion.toArray().every(Number.isFinite));});
});

test('the wind-to-boat route stays flyable after the bridge grows', async () => {
  const {createFlight, stepFlight} = await import('../js/biplane-physics.js');
  const {level, colliders, playground, player} = system();
  const home = chooseBiplaneHome(level), flight = createFlight(home.planet, home.dir);
  const plane = {mounted: true, distance: 0, flight};
  player.body.pos = flight.pos; player.body.up = flight.up;
  for (let t = 0; t < 30 && playground.snapshot().boat !== BOAT.DOCKED; t += 1 / 120) {
    const task = playground.snapshot().task, target = new Vector3(...task.dir);
    const altitude = task.id === 'boat' ? 1.2 : 2.7;
    stepFlight(flight, {direction: tangentDir(target, flight.up), throttle: 1, climb: flight.altitude < altitude, boost: task.id === 'wind' && flight.cooldown <= 0}, colliders(home.planet), 1 / 120);
    plane.distance = flight.distance; playground.step(1 / 120, player, plane);
  }
  assert.equal(playground.snapshot().boat, BOAT.DOCKED);
});

test('landing after powering the wind immediately invites the walking bridge loop', () => {
  const {playground, player, plane} = system();
  for (let i = 0; i < 8; i++) playground.step(.1, player, plane);
  plane.mounted = false;player.state = 'play';player.body.onGround = true;
  playground.step(.1, player, plane);
  assert.ok(['bridge', 'walk'].includes(playground.snapshot().task.id));
});

test('the revealed spring sits outside the house walls on visible balcony space', async () => {
  const {Quaternion} = await import('three');
  const {layout} = setup();
  const relative = surfacePoint(layout.planet, layout.spring.dir, layout.spring.height).sub(surfacePoint(layout.planet, layout.lookout.dir, layout.lookout.height));
  relative.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), layout.lookout.dir).invert());
  assert.ok(Math.abs(relative.x) > 1.3 || relative.z > .6, 'the little hut must not hide the spring');
});

test('the squirrel spring sends a released approach onto dry meadow', () => {
  const {layout, colliders, playground, player, plane} = system();
  for (let i = 0; i < 8; i++) playground.step(.1, player, plane);
  plane.mounted = false; player.state = 'play';
  Object.assign(player.body, {radius: .45, height: 2.1, vel: new Vector3()});
  player.bounce = Player.prototype.bounce; player.invulnerable = 0;
  for (const point of [...layout.guide, layout.spring]) {
    player.body.pos.copy(surfacePoint(layout.planet, point.dir, point.height));
    player.body.up.copy(point.dir); player.body.onGround = true;
    player.body.vel.copy(tangentDir(layout.bridge[0].dir, point.dir)).multiplyScalar(9);
    playground.step(.1, player, plane);
  }
  assert.equal(playground.snapshot().springUses, 1);
  for (let i = 0; i < 600 && !player.body.onGround; i++) {
    const rising = player.body.vel.dot(player.body.up) > 0;
    stepBody(player.body, null, 0, [layout.planet], colliders, 1 / 120, {gravityScale: rising ? player.launchGravity : 1.5});
  }
  assert.equal(player.body.onGround, true);
  assert.equal(inWater(player.body.pos, layout.planet), false, 'releasing the controls must reach dry grass');
  assert.ok(player.body.up.y < layout.spring.dir.y, 'the launch moves away from the lake');
});

test('ordinary creature bounces keep their incoming horizontal momentum', () => {
  const player = {body: {up: new Vector3(0, 1, 0), vel: new Vector3(4, -3, 2)}, invulnerable: 0};
  Player.prototype.bounce.call(player, {speed: 13});
  assert.deepEqual(player.body.vel.toArray(), [4, 13, 2]);
  Player.prototype.bounce.call(player, {speed: 17, direction: new Vector3(0, 5, 2), horizontalSpeed: 6});
  assert.deepEqual(player.body.vel.toArray(), [0, 17, 6]);
});
