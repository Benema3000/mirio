// Biplane/passenger/input contracts using the real level and controller.
// Pure flight mechanics have their own suite; these checks cover the seams
// where boarding, exiting, rescue and device input can strand the passenger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Texture, Vector3 } from 'three';
import { Biplane, chooseBiplaneHome, clearLanding } from '../js/biplane.js';
import { FLIGHT } from '../js/biplane-physics.js';
import { Input } from '../js/input.js';
import { collidersFor, makeLevel } from '../js/level.js';
import { collide, dirFromLatLon, inWater, surfacePoint, tangentDir } from '../js/world.js';

const DT = 1 / 120;
const EAST = new Vector3(1, 0, 0);
const ZERO = new Vector3();

function fixture(t) {
  const level = makeLevel();
  const colliders = collidersFor(level);
  const scene = new Scene();
  const art = { shadow: new Texture() };
  const baseline = colliders(level.planets[0]).length;
  const plane = new Biplane(scene, level, art, colliders);
  const up = level.spawn.dir.clone();
  const checkpoint = { planet: level.spawn.planet, dir: up.clone() };
  const player = {
    state: 'play', hearts: 3, invulnerable: 0, checkpoint,
    body: { pos: surfacePoint(checkpoint.planet, up), up, vel: new Vector3(), planet: checkpoint.planet,
      onGround: true, radius: .45, height: 2.1, skidding: false },
    facing: tangentDir(EAST, up), visualUp: up.clone(), flightDir: new Vector3(), wish: new Vector3(),
    pound: null, launchGravity: null, jumpBuffer: 0, coyote: 0, spinT: 0, stun: 0, wishSpeed: 0,
    spinRequest: false, poundRequest: false,
  };
  t.after(() => {
    const geometries = new Set(), materials = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    art.shadow.dispose();
  });
  return { level, scene, colliders, baseline, plane, player,
    step(seconds, intent = {}) {
      Object.assign(plane.intent, intent);
      if (intent.direction) plane.intent.direction = intent.direction.clone();
      const events = [];
      for (let i = 0; i < Math.ceil(seconds / DT); i++) events.push(...plane.step(DT, player));
      return events;
    } };
}

function setFlightOver(plane, dir, altitude = 2.5) {
  plane.flight.up.copy(dir);
  plane.flight.pos.copy(surfacePoint(plane.home.planet, dir, altitude));
  plane.flight.forward.copy(tangentDir(EAST, dir) ?? tangentDir(new Vector3(0, 0, 1), dir));
  plane.flight.vel.set(0, 0, 0);
  plane.flight.speed = 0;
  plane.flight.altitude = altitude;
}

function eventTarget() {
  const listeners = new Map();
  const classes = new Set();
  return {
    style: {}, classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
    addEventListener(name, callback) { listeners.set(name, [...(listeners.get(name) ?? []), callback]); },
    emit(name, event = {}) {
      for (const callback of listeners.get(name) ?? []) callback({ preventDefault() {}, stopPropagation() {}, ...event });
    },
  };
}

function inputFixture(t, getGamepads = () => []) {
  const original = new Map(['window', 'document', 'navigator'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const win = { ...eventTarget(), innerWidth: 1000 };
  const doc = { ...eventTarget(), hidden: false };
  for (const [name, value] of Object.entries({ window: win, document: doc, navigator: { getGamepads } })) {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  }
  t.after(() => {
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const elements = Object.fromEntries(['surface', 'stick', 'knob', 'jumpButton', 'spinButton', 'poundButton', 'gasButton', 'brakeButton']
    .map(name => [name, eventTarget()]));
  const input = new Input(elements);
  input.enabled = true;
  return { input, win, doc, elements };
}

function gamepad() {
  return { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
}

test('the biplane starts on a clear dry patch within boarding reach of the opening meadow', t => {
  const { level, plane, player, colliders, baseline } = fixture(t);
  const chosen = chooseBiplaneHome(level);
  assert.equal(chosen.planet, level.spawn.planet);
  const original = colliders(plane.home.planet).filter(collider => collider !== plane.parkingCollider);
  assert.ok(clearLanding(chosen.planet, chosen.dir, original, 2.05));
  assert.equal(inWater(plane.flight.pos, plane.home.planet), false);
  assert.ok(plane.canBoard(player), `opening distance ${player.body.pos.distanceTo(plane.flight.pos)}`);
  assert.equal(plane.flight.altitude, 0);
  assert.equal(plane.snapshot().ceiling, FLIGHT.ceiling);
  assert.equal(colliders(plane.home.planet).length, baseline + 1, 'one parked-body collider protects the fuselage');
  for (const [lat, lon] of [[81, 35], [24, 43], [-14, -28]]) {
    assert.ok(chosen.dir.angleTo(dirFromLatLon(lat, lon)) * chosen.planet.radius > 3.5, 'the parked wings overlap a springflower landing');
  }
});

test('boarding requires a nearby grounded player and clears old platforming actions', t => {
  const { plane, player, colliders, baseline, level } = fixture(t);
  const start = player.body.pos.clone();
  player.body.pos.set(0, -26, 0);
  assert.equal(plane.board(player), false);
  player.body.pos.copy(start); player.body.onGround = false;
  assert.equal(plane.board(player), false);
  player.body.onGround = true; player.body.planet = level.planets[1];
  assert.equal(plane.board(player), false);
  player.body.planet = plane.home.planet;
  player.pound = { phase: 'drop' }; player.launchGravity = 2;
  player.jumpBuffer = player.coyote = player.spinT = player.stun = .2;
  player.spinRequest = player.poundRequest = player.body.skidding = true;
  player.body.vel.set(4, 2, 1);
  const checkpoint = player.checkpoint;
  assert.deepEqual(plane.toggle(player).map(event => event.type), ['planeBoard']);
  assert.equal(player.state, 'biplane');
  assert.equal(player.hearts, 3);
  assert.equal(player.checkpoint, checkpoint);
  assert.equal(player.pound, null); assert.equal(player.launchGravity, null);
  for (const name of ['jumpBuffer', 'coyote', 'spinT', 'stun', 'wishSpeed']) assert.equal(player[name], 0, name);
  assert.equal(player.spinRequest || player.poundRequest || player.body.skidding, false);
  assert.equal(player.body.onGround, false);
  assert.equal(colliders(plane.home.planet).length, baseline, 'the plane must not collide with its own parking proxy');
  assert.equal(plane.rides, 1);
  assert.equal(plane.board(player), false, 'a held action must not count another ride');
  const seat = plane.flight.pos.clone().addScaledVector(plane.flight.up, plane.model.seat.position.y)
    .addScaledVector(plane.flight.forward, plane.model.seat.position.z);
  assert.ok(player.body.pos.distanceTo(seat) < 1e-9);
});

test('a passenger can ascend and land safely beside the plane without losing health or checkpoint', t => {
  const f = fixture(t);
  const { plane, player, colliders, baseline } = f;
  assert.ok(plane.board(player));
  const checkpoint = player.checkpoint;
  f.step(2.3, { climb: true, throttle: 0, direction: plane.flight.forward });
  assert.ok(plane.flight.altitude > 3.8 && plane.flight.altitude <= FLIGHT.ceiling);
  assert.equal(player.state, 'biplane');
  assert.equal(player.body.planet, plane.home.planet);
  assert.ok(player.body.up.distanceTo(plane.flight.up) < 1e-9);
  assert.ok(player.body.vel.distanceTo(plane.flight.vel) < 1e-9);
  assert.deepEqual(plane.toggle(player).map(event => event.type), ['planeLanding']);
  const events = f.step(3.8);
  assert.ok(events.some(event => event.type === 'planeExit'));
  assert.equal(plane.mounted, false);
  assert.equal(plane.landing, false);
  assert.equal(player.state, 'play');
  assert.equal(player.hearts, 3);
  assert.equal(player.checkpoint, checkpoint);
  assert.ok(player.invulnerable >= 1, 'landing must give a short safe dismount window');
  assert.ok(player.body.pos.distanceTo(plane.flight.pos) > 1.8, 'passenger should step outside the wings');
  assert.equal(inWater(player.body.pos, plane.home.planet), false);
  assert.ok(colliders(plane.home.planet).every(c => !collide(player.body.pos.clone(), ZERO.clone(), player.body, c, player.body.up)), 'dismount placed the passenger inside a prop');
  assert.equal(colliders(plane.home.planet).length, baseline + 1);
  assert.equal(plane.step(DT, player).length, 0, 'parked planes must not keep controlling the passenger');
});

test('water, shore margins and tree trunks refuse an unsafe exit without detaching the passenger', t => {
  const { plane, player, level, colliders } = fixture(t);
  assert.ok(plane.board(player));
  for (const dir of [dirFromLatLon(46, 90), dirFromLatLon(58, 90), level.trees[0].dir]) {
    assert.equal(clearLanding(plane.home.planet, dir, colliders(plane.home.planet)), false);
    setFlightOver(plane, dir);
    plane.syncPassenger(player);
    assert.equal(plane.landingPoint(), null);
    assert.deepEqual(plane.toggle(player).map(event => event.type), ['planeNoLanding']);
    assert.equal(plane.mounted, true);
    assert.equal(plane.landing, false);
    assert.equal(player.state, 'biplane');
    assert.equal(player.hearts, 3);
  }
});

test('an in-flight landing request can be cancelled without ejecting the passenger', t => {
  const f = fixture(t);
  assert.ok(f.plane.board(f.player));
  f.step(.8, { climb: true, throttle: 0 });
  assert.deepEqual(f.plane.toggle(f.player).map(event => event.type), ['planeLanding']);
  assert.deepEqual(f.plane.toggle(f.player).map(event => event.type), ['planeCancelLanding']);
  assert.equal(f.plane.mounted, true);
  assert.equal(f.plane.landing, false);
  assert.equal(f.player.state, 'biplane');
});

test('obstacle contact produces plane feedback without damaging the protected passenger', t => {
  const f = fixture(t);
  const { plane, player, colliders } = f;
  assert.ok(plane.board(player));
  const heading = plane.flight.forward.clone();
  const ahead = plane.home.dir.clone().multiplyScalar(Math.cos(4 / plane.home.planet.radius))
    .addScaledVector(heading, Math.sin(4 / plane.home.planet.radius)).normalize();
  colliders(plane.home.planet).push({ kind: 'cyl', base: surfacePoint(plane.home.planet, ahead, -.3), axis: ahead,
    radius: .9, height: 6.5 });
  const events = f.step(2.4, { direction: heading, throttle: 1 });
  assert.ok(events.some(event => event.type === 'planeBump'), 'collisions must retain their gentle feedback event');
  assert.equal(player.hearts, 3);
  assert.equal(player.state, 'biplane');
  assert.ok(player.body.pos.toArray().every(Number.isFinite));
  assert.ok(plane.flight.altitude <= FLIGHT.ceiling);
});

test('recall returns the aircraft home while preserving ride progress; a new run clears it', t => {
  const f = fixture(t);
  const { plane, player, colliders, baseline } = f;
  assert.ok(plane.board(player));
  f.step(1.2, { direction: plane.flight.forward, throttle: .7, climb: true });
  const distance = plane.distance;
  assert.ok(distance > 1);
  const checkpoint = player.checkpoint;
  plane.recall(player);
  assert.equal(plane.mounted, false);
  assert.equal(player.state, 'play');
  assert.equal(plane.rides, 1);
  assert.equal(plane.distance, distance);
  assert.equal(player.checkpoint, checkpoint);
  assert.ok(plane.flight.pos.distanceTo(surfacePoint(plane.home.planet, plane.home.dir)) < 1e-9);
  assert.equal(colliders(plane.home.planet).length, baseline + 1);
  plane.recall(player);
  assert.equal(colliders(plane.home.planet).length, baseline + 1, 'repeated rescues must not leak parking colliders');
  player.body.pos.copy(surfacePoint(plane.home.planet, plane.home.dir));
  player.body.onGround = true;
  assert.ok(plane.board(player));
  assert.equal(plane.rides, 2);
  plane.reset(player);
  assert.equal(plane.distance, 0);
  assert.equal(plane.rides, 0);
  assert.equal(plane.mounted || plane.landing, false);
  assert.equal(player.state, 'play');
  assert.equal(colliders(plane.home.planet).length, baseline + 1);
});

test('F queues one ride edge, ignores repeats/text fields and clears on blur or pause', t => {
  const { input, win, doc } = inputFixture(t);
  win.emit('keydown', { code: 'KeyF' });
  assert.equal(input.consumeRide(), true);
  assert.equal(input.consumeRide(), false);
  win.emit('keydown', { code: 'KeyF', repeat: true });
  assert.equal(input.consumeRide(), false);
  win.emit('keyup', { code: 'KeyF' });
  win.emit('keydown', { code: 'KeyF', target: { tagName: 'INPUT' } });
  assert.equal(input.consumeRide(), false);
  win.emit('keydown', { code: 'KeyF' }); win.emit('keydown', { code: 'KeyC' });
  input.update(DT);
  assert.equal(input.poundHeld, true);
  win.emit('blur');
  assert.equal(input.consumeRide(), false);
  assert.equal(input.consumePound(), false);
  assert.equal(input.poundHeld, false);
  win.emit('keydown', { code: 'KeyF' }); input.enabled = false;
  assert.equal(input.consumeRide(), false);
  input.enabled = true;
  win.emit('keydown', { code: 'KeyF' }); doc.hidden = true; doc.emit('visibilitychange');
  assert.equal(input.consumeRide(), false);
});

test('held gamepad B descends continuously while Y boards only on press edges', t => {
  const pad = gamepad();
  let connected = true;
  const { input } = inputFixture(t, () => connected ? [pad] : []);
  pad.buttons[1] = pad.buttons[3] = { pressed: true, value: 1 };
  input.update(DT);
  assert.equal(input.poundHeld, true);
  assert.equal(input.consumePound(), true);
  assert.equal(input.consumeRide(), true);
  input.update(DT);
  assert.equal(input.poundHeld, true);
  assert.equal(input.consumePound(), false);
  assert.equal(input.consumeRide(), false);
  input.enabled = false; input.update(DT);
  assert.equal(input.poundHeld, false);
  assert.equal(input.consumeRide(), false);
  input.enabled = true; input.update(DT);
  assert.equal(input.consumeRide(), false, 'a Y held through pause must not immediately exit');
  assert.equal(input.poundHeld, true);
  pad.buttons[3] = { pressed: false, value: 0 }; input.update(DT);
  pad.buttons[3] = { pressed: true, value: 1 }; input.update(DT);
  assert.equal(input.consumeRide(), true);
  connected = false; input.update(DT);
  assert.equal(input.poundHeld, false);
  assert.equal(input.consumeRide(), false);
});

test('touch descent releases on lost capture, and plane controls consume old jump/pound/boost queues', t => {
  const f = fixture(t);
  const { input, win, elements } = inputFixture(t);
  elements.poundButton.emit('pointerdown', { pointerId: 9 }); input.update(DT);
  assert.equal(input.poundHeld, true);
  assert.equal(input.consumePound(), true);
  input.update(DT);
  assert.equal(input.poundHeld, true);
  assert.equal(input.consumePound(), false);
  elements.poundButton.emit('lostpointercapture', { pointerId: 9 }); input.update(DT);
  assert.equal(input.poundHeld, false);
  assert.equal(elements.poundButton.classList.contains('pressed'), false);
  assert.ok(f.plane.board(f.player));
  win.emit('keydown', { code: 'Space' }); win.emit('keydown', { code: 'KeyC' }); win.emit('keydown', { code: 'ShiftLeft' });
  input.update(DT);
  f.plane.readInput(input, { forward: f.plane.flight.forward });
  assert.equal(f.plane.intent.climb, true);
  assert.equal(f.plane.intent.descend, true);
  assert.equal(f.plane.intent.boost, true);
  assert.equal(input.consumeJump() || input.consumePound() || input.consumeSpin(), false);
  f.plane.step(DT, f.player);
  f.plane.readInput(input, { forward: f.plane.flight.forward });
  assert.equal(f.plane.intent.boost, false, 'holding spin cannot keep requesting fresh boosts');
  input.reset(); f.plane.readInput(input, { forward: f.plane.flight.forward });
  assert.equal(f.plane.intent.climb || f.plane.intent.descend || f.plane.intent.boost, false);
});

test('a boost survives multiple render input reads until one physics step, and pause discards pending boosts', t => {
  const { plane, player } = fixture(t);
  const { input, win } = inputFixture(t);
  assert.ok(plane.board(player));
  const rig = { forward: plane.flight.forward };
  const readFrame = () => {
    input.update(DT / 2); // A 240 Hz display can sample twice before a 120 Hz physics step.
    plane.readInput(input, rig);
  };
  win.emit('keydown', { code: 'ShiftLeft' });
  readFrame();
  assert.equal(plane.intent.boost, true);
  assert.equal(input.consumeSpin(), false, 'the button edge has moved from Input to the plane');
  readFrame();
  assert.equal(plane.intent.boost, true, 'another render frame must preserve the unprocessed press');
  assert.equal(plane.flight.boost, 0, 'sampling input alone must not start the engine boost');
  assert.deepEqual(plane.step(DT, player).filter(event => event.type === 'planeBoost').map(event => event.type), ['planeBoost']);
  assert.equal(plane.intent.boost, false, 'the physics step consumes the pending press');
  assert.ok(plane.flight.boost > 0);

  const repeated = [];
  for (let i = 0; i < Math.ceil((FLIGHT.boostCooldown + .1) / DT); i++) {
    readFrame(); readFrame();
    repeated.push(...plane.step(DT, player).filter(event => event.type === 'planeBoost'));
  }
  assert.equal(repeated.length, 0, 'holding the key must not retrigger, even after the cooldown expires');
  assert.equal(plane.flight.cooldown, 0);

  win.emit('keyup', { code: 'ShiftLeft' });
  win.emit('keydown', { code: 'ShiftLeft' });
  readFrame(); readFrame();
  assert.equal(plane.intent.boost, true);
  input.enabled = false;
  plane.clearIntent(); // The pause handler clears both device and aircraft queues.
  assert.equal(plane.intent.boost, false);
  input.enabled = true;
  readFrame();
  assert.equal(plane.intent.boost, false);
  assert.equal(plane.step(DT, player).some(event => event.type === 'planeBoost'), false, 'resuming must not replay the pre-pause press');
  assert.equal(plane.flight.boost, 0);
});
