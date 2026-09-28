import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { createFlight, FLIGHT, stepFlight } from '../js/biplane-physics.js';
import { dirFromLatLon, surfacePoint } from '../js/world.js';
import { makeLevel } from '../js/level.js';

const DT = 1 / 120;
const UP = new Vector3(0, 1, 0), EAST = new Vector3(1, 0, 0);
const planet = () => ({ id: 'welt', center: new Vector3(), radius: 26, gravityRadius: 46 });
const fresh = () => createFlight(planet(), UP, EAST);
function run(body, seconds, intent = {}, colliders = [], dt = DT) {
  const events = [];
  for (let t = 0; t < seconds - 1e-8; t += dt) events.push(...stepFlight(body, typeof intent === 'function' ? intent(body, t) : intent, colliders, Math.min(dt, seconds - t)));
  return events;
}
function finiteFrame(body) {
  for (const vector of [body.pos, body.up, body.forward, body.vel]) assert.ok(vector.toArray().every(Number.isFinite));
  for (const key of ['altitude', 'speed', 'bank', 'pitch', 'boost', 'cooldown', 'distance']) assert.ok(Number.isFinite(body[key]), key);
  assert.ok(Math.abs(body.up.length() - 1) < 1e-7);
  assert.ok(Math.abs(body.forward.length() - 1) < 1e-7);
  assert.ok(Math.abs(body.forward.dot(body.up)) < 1e-7);
}

test('a low idle hover is stable and empty controls do not move the plane', () => {
  const body = fresh(), start = body.pos.clone();
  run(body, 20);
  assert.ok(body.pos.distanceTo(start) < 1e-8);
  assert.ok(Math.abs(body.altitude - FLIGHT.hoverHeight) < 1e-8);
  assert.equal(body.speed, 0);
  assert.equal(body.state, 'flying');
  finiteFrame(body);
});

test('throttle accelerates smoothly, released controls brake, and a landing request overrides gas', () => {
  const body = fresh();
  run(body, .5, b => ({ direction: b.forward, throttle: 1 }));
  assert.ok(body.speed > 5 && body.speed < 8);
  run(body, 1, b => ({ direction: b.forward, throttle: 1 }));
  assert.ok(Math.abs(body.speed - FLIGHT.speed) < 1e-6);
  assert.ok(body.distance > 8);
  run(body, 2, { descend: true, throttle: 1 });
  assert.ok(body.speed < .01);
  assert.equal(body.altitude, 0);
  assert.equal(body.state, 'landed');
});

test('held climb respects the hard ceiling and bounded vertical speed at varied frame rates', () => {
  const climbing = fresh();
  run(climbing, .3, { climb: true });
  assert.ok(climbing.pitch > .1, 'positive pitch means nose-up while climbing');
  for (const dt of [1 / 120, 1 / 60, 1 / 30, .1, .25]) {
    const body = fresh();
    for (let t = 0; t < 5; t += dt) {
      stepFlight(body, { direction: body.forward, throttle: 1, climb: true }, [], dt);
      assert.ok(body.altitude <= FLIGHT.ceiling + 1e-8 && body.altitude >= 0);
      assert.ok(Math.abs(body.vel.dot(body.up)) <= FLIGHT.climbSpeed + 1e-7);
      finiteFrame(body);
    }
    assert.ok(body.altitude > FLIGHT.ceiling - .02);
    assert.ok(Math.abs(body.pitch) < .01, 'the model levels out at its ceiling');
  }
});

test('several full circuits through the poles preserve an orthonormal surface frame', () => {
  const body = fresh(), home = body.planet;
  for (let i = 0; i < 6000; i++) {
    stepFlight(body, { direction: body.forward, throttle: 1 }, [], DT);
    finiteFrame(body);
    assert.equal(body.planet, home);
    assert.ok(Math.abs(body.pos.distanceTo(home.center) - home.radius - FLIGHT.hoverHeight) < 1e-6);
  }
  assert.ok(body.distance > home.radius * Math.PI * 4);
  for (const dir of [UP, UP.clone().negate(), EAST, new Vector3()]) finiteFrame(createFlight(home, dir, dir));
});

test('water crossings retain safe clearance even with descend held', () => {
  const world = makeLevel().planets[0];
  const body = createFlight(world, dirFromLatLon(45, 90), EAST);
  const events = run(body, 6, { descend: true, throttle: 1 });
  assert.ok(body.altitude >= FLIGHT.hoverHeight - 1e-7);
  assert.equal(body.state, 'flying');
  assert.equal(events.some(event => event.type === 'land'), false);
  finiteFrame(body);
});

test('dry landing produces one event and releasing descent gently lifts off again', () => {
  const body = fresh();
  run(body, 3, { climb: true });
  const events = run(body, 4, { descend: true });
  assert.equal(body.altitude, 0);
  assert.equal(body.vel.length(), 0);
  assert.equal(events.filter(event => event.type === 'land').length, 1);
  assert.equal(run(body, 1, { descend: true }).length, 0);
  const takeoff = run(body, 3);
  assert.equal(takeoff.filter(event => event.type === 'takeoff').length, 1);
  assert.ok(Math.abs(body.altitude - FLIGHT.hoverHeight) < .01);
});

test('boost is limited, cools down, and never repeats merely because its button is held', () => {
  const body = fresh();
  run(body, 1.5, b => ({ direction: b.forward, throttle: 1 }));
  const events = stepFlight(body, { direction: body.forward, throttle: 1, boost: true }, [], DT);
  assert.equal(events.filter(event => event.type === 'boost').length, 1);
  run(body, .5, b => ({ direction: b.forward, throttle: 1, boost: true }));
  assert.ok(body.speed > 17.5 && body.speed <= FLIGHT.boostSpeed + 1e-7);
  assert.deepEqual(run(body, 4, b => ({ direction: b.forward, throttle: 1, boost: true })), []);
  assert.equal(body.boost, 0);
  assert.equal(body.cooldown, 0);
  stepFlight(body, { boost: false }, [], DT);
  assert.equal(stepFlight(body, { boost: true }, [], DT)[0].type, 'boost');
  stepFlight(body, { descend: true, boost: false }, [], DT);
  assert.equal(body.boost, 0, 'landing cancels the burst');
  assert.equal(stepFlight(body, { boost: true }, [], DT).some(event => event.type === 'boost'), false);
});

function approaching(altitude = FLIGHT.hoverHeight) {
  const body = createFlight(planet(), new Vector3(-6, 26, 0).normalize(), EAST);
  surfacePoint(body.planet, body.up, altitude, body.pos);
  body.altitude = altitude;
  return body;
}
test('boosted flight softly bumps a tree without tunnelling or repeated event spam', () => {
  const body = approaching();
  const tree = { kind: 'cyl', base: new Vector3(0, 25.7, 0), axis: UP, radius: .8, height: 8 };
  const events = [];
  for (let t = 0; t < 5; t += 1 / 30) {
    events.push(...stepFlight(body, { direction: EAST, throttle: 1, boost: t === 0 }, [tree], 1 / 30));
    assert.ok(body.pos.x <= -(tree.radius + body.radius) + .02, `tree penetration at ${body.pos.x}`);
    finiteFrame(body);
  }
  const bumps = events.filter(event => event.type === 'bump');
  assert.ok(bumps.length > 0 && bumps.length < 15);
});

test('a tall block cannot step the aircraft above its ceiling or trap it inside the top', () => {
  const body = approaching(4.49);
  const block = { kind: 'box', base: new Vector3(0, 26, 0), axis: UP, right: EAST,
    forward: new Vector3(0, 0, 1), halfW: 1, halfD: 2, height: 4.6 };
  for (let t = 0; t < 5; t += 1 / 20) {
    stepFlight(body, { direction: EAST, throttle: 1, climb: true }, [block], 1 / 20);
    assert.ok(body.altitude <= FLIGHT.ceiling + 1e-7);
    assert.ok(body.pos.x <= -(block.halfW + body.radius) + .02);
    finiteFrame(body);
  }
});

test('the rider height hits floating platforms and tall hills cannot bypass the ceiling', () => {
  const under = fresh();
  const ceiling = { kind: 'box', base: new Vector3(0, 29, 0), axis: UP, right: EAST,
    forward: new Vector3(0, 0, 1), halfW: 3, halfD: 3, height: .25 };
  run(under, 4, { climb: true }, [ceiling]);
  assert.ok(under.pos.y + FLIGHT.height <= ceiling.base.y + .01);
  assert.ok(under.altitude >= 0);
  const hillBody = createFlight(planet(), new Vector3(-11, 26, 0).normalize(), EAST);
  const hill = { kind: 'bump', center: new Vector3(0, 26, 0), radius: 6 };
  for (let t = 0; t < 5; t += 1 / 30) {
    stepFlight(hillBody, { direction: EAST, throttle: 1, climb: true }, [hill], 1 / 30);
    assert.ok(hillBody.altitude <= FLIGHT.ceiling + 1e-7);
    assert.ok(hillBody.pos.distanceTo(hill.center) >= hill.radius - .02);
  }
});

test('fixed substeps give the same flight at common render rates', () => {
  const flights = [1 / 120, 1 / 60, 1 / 30, .1].map(dt => {
    const body = fresh();
    run(body, 2, { direction: EAST, throttle: .75, climb: true }, [], dt);
    run(body, 2, { direction: EAST, throttle: .75 }, [], dt);
    return body;
  });
  for (const body of flights.slice(1)) {
    assert.ok(body.pos.distanceTo(flights[0].pos) < 1e-5);
    assert.ok(body.vel.distanceTo(flights[0].vel) < 1e-5);
  }
});

test('invalid deltas do not corrupt flight or consume a boost press', () => {
  const body = fresh(), start = body.pos.clone();
  for (const dt of [0, -1, NaN, Infinity]) assert.deepEqual(stepFlight(body, { boost: true }, [], dt), []);
  assert.deepEqual(body.pos, start);
  assert.equal(body.boostHeld, false);
  finiteFrame(body);
});
