import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveCamera } from 'three';
import { SKY, balloonPosition, createSkyRun, makeSkyCourse, rescueSkyRun, seekSkyRun, skySnapshot, stepSkyRun } from '../js/sky-flight-rules.js';
import { SkyFlight, skyFrame } from '../js/sky-flight.js';

function fly(run, course, seconds, controls = {}, dt = 1 / 120) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9 && run.status === 'playing'; t += dt) {
    events.push(...stepSkyRun(run, course, Math.min(dt, seconds - t), typeof controls === 'function' ? controls(run, t) : controls));
  }
  return events;
}
function emptyCourse() { return {length: SKY.length, rings: [], obstacles: [], checkpoints: [450, 900, 1350]}; }

test('the sky route can be finished without input, with a single finish event and a frozen final time', () => {
  const run = createSkyRun(), course = makeSkyCourse();
  const events = fly(run, course, 110);
  assert.equal(run.status, 'finished');
  assert.ok(run.time >= 60 && run.time <= 90, `course duration ${run.time}`);
  assert.equal(events.filter(e => e.type === 'finish').length, 1);
  assert.equal(events.filter(e => e.type === 'checkpoint').length, 3);
  assert.equal(run.s, course.length);
  const time = run.time;
  assert.deepEqual(stepSkyRun(run, course, .25, {action: true}), []);
  assert.equal(run.time, time);
});

test('steering is responsive, bounded, and releases to a stable position without recentring', () => {
  const run = createSkyRun(), course = emptyCourse();
  fly(run, course, .3, {x: 1, y: 1});
  assert.ok(run.x > 1.4 && run.y > 1);
  fly(run, course, 4, {x: 1, y: 1});
  assert.equal(run.x, SKY.width); assert.equal(run.y, SKY.height);
  assert.equal(run.vx, 0); assert.equal(run.vy, 0);
  fly(run, course, .8, {x: -1, y: -1});
  fly(run, course, 1);
  const [x, y] = [run.x, run.y];
  fly(run, course, 2);
  assert.ok(Math.abs(run.x - x) < 1e-4 && Math.abs(run.y - y) < 1e-4);
  assert.ok(run.x > 0 && run.y > 0);
});

test('swept ring crossing counts once, gives draft without subtracting time, and missed rings break the combo', () => {
  const run = createSkyRun(), course = emptyCourse();
  course.rings = [{id: 'one', s: 1, x: 0, y: 0, radius: SKY.ringRadius}, {id: 'miss', s: 2, x: 8, y: 4, radius: SKY.ringRadius}];
  const events = stepSkyRun(run, course, .25);
  assert.equal(events.filter(e => e.type === 'ring').length, 1);
  assert.equal(run.collected.size, 1); assert.equal(run.bestCombo, 1); assert.equal(run.combo, 0);
  assert.ok(run.speed > SKY.cruise && run.draft > 0);
  assert.ok(Math.abs(run.time - .25) < 1e-8);
  assert.equal(fly(run, course, 1).filter(e => e.type === 'ring').length, 0);
});

test('boost has a bounded duration and cooldown and cannot repeat when held', () => {
  const run = createSkyRun(), course = emptyCourse();
  assert.equal(stepSkyRun(run, course, 1 / 120, {action: true})[0].kind, 'speed');
  fly(run, course, 1, {action: true});
  assert.ok(run.speed > 34 && run.speed <= SKY.boostSpeed);
  const events = fly(run, course, 6, {action: true});
  assert.equal(events.filter(e => e.type === 'boost').length, 0);
  assert.equal(run.boost, 0); assert.equal(run.cooldown, 0);
  stepSkyRun(run, course, 1 / 120, {action: false});
  assert.equal(stepSkyRun(run, course, 1 / 120, {action: true})[0].type, 'boost');
});

test('balloons gently slow and penalize once; a timed barrel roll protects the same crossing', () => {
  const course = emptyCourse();
  course.obstacles = [{id: 'balloon', s: 1, x: 0, y: 0, radius: 1.65, phase: 0, drift: 0},
    {id: 'neighbor', s: 2, x: 0, y: 0, radius: 1.65, phase: 0, drift: 0}];
  const hit = createSkyRun(), dodge = createSkyRun();
  const bumped = stepSkyRun(hit, course, .25);
  assert.equal(bumped.filter(e => e.type === 'bump').length, 1);
  assert.equal(hit.penalty, SKY.bumpPenalty);
  assert.ok(hit.speed < SKY.cruise && hit.invulnerable > 0);
  assert.equal(hit.status, 'playing');
  const rolled = stepSkyRun(dodge, course, .25, {jump: true});
  assert.equal(rolled.filter(e => e.type === 'bump').length, 0);
  assert.equal(rolled[0].kind, 'roll'); assert.equal(dodge.penalty, 0);
  fly(dodge, course, 3, {jump: true});
  assert.equal(dodge.roll, 0); assert.equal(dodge.rollCooldown, 0);
  assert.deepEqual(stepSkyRun(dodge, course, .1, {jump: true}), []);
});

test('rescue retains time and discoveries, restores the last gate and never duplicates a ring award', () => {
  const run = createSkyRun(), course = emptyCourse();
  course.checkpoints = [20]; course.rings = [{id: 'repeat', s: 30, x: 0, y: 0, radius: 3}];
  fly(run, course, 2);
  assert.equal(run.checkpoint, 1); assert.equal(run.collected.size, 1);
  const time = run.time;
  assert.equal(rescueSkyRun(run, course)[0].rescued, true);
  assert.equal(run.s, 20); assert.equal(run.time, time + SKY.rescuePenalty);
  assert.equal(run.collected.size, 1);
  const events = fly(run, course, 1);
  assert.equal(events.filter(e => e.type === 'ring').length, 0);
  assert.equal(run.collected.size, 1);
});

test('the course offers a reachable hoop line and balloons stay inside the generous play area', () => {
  const course = makeSkyCourse();
  assert.equal(course.rings.length, 48);
  for (let i = 1; i < course.rings.length; i++) {
    const a = course.rings[i - 1], b = course.rings[i];
    const time = (b.s - a.s) / SKY.boostSpeed;
    assert.ok(Math.abs(b.x - a.x) < SKY.lateralSpeed * time * .65);
    assert.ok(Math.abs(b.y - a.y) < SKY.verticalSpeed * time * .65);
    assert.ok(Math.abs(b.x) + b.radius < SKY.width && Math.abs(b.y) + b.radius < SKY.height);
  }
  for (const o of course.obstacles) {
    for (const t of [0, 1, 10, 60]) {
      const p = balloonPosition(o, t);
      assert.ok(Math.abs(p.x) + o.radius < SKY.width && Math.abs(p.y) + o.radius < SKY.height);
    }
    assert.ok(course.checkpoints.every(s => Math.abs(s - o.s) > 18), 'checkpoints have clear approaches');
  }
});

test('seek only changes navigation, never awards skipped checkpoints, rings or an immediate finish', () => {
  const run = createSkyRun(), course = makeSkyCourse();
  seekSkyRun(run, course, 1);
  assert.equal(run.status, 'playing'); assert.ok(run.s < course.length);
  assert.equal(run.time, 0); assert.equal(run.collected.size, 0); assert.equal(run.checkpoint, 0);
  const events = fly(run, course, 1);
  assert.equal(events.filter(e => e.type === 'finish').length, 1);
  assert.equal(events.filter(e => e.type === 'checkpoint' || e.type === 'ring').length, 0);
});

test('common render rates yield the same deterministic flight and invalid inputs stay finite', () => {
  const course = emptyCourse(), results = [];
  for (const dt of [1 / 120, 1 / 60, 1 / 30, .1, .25]) {
    const run = createSkyRun();
    fly(run, course, 4, {x: .3, y: -.2, action: true}, dt);
    results.push(skySnapshot(run, course));
    for (const value of Object.values(results.at(-1))) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
  for (const result of results) for (const key of ['x', 'y', 'distance', 'time', 'speed', 'cooldown']) assert.ok(Math.abs(result[key] - results[0][key]) < .005, key);
  const run = createSkyRun();
  for (const dt of [NaN, Infinity, -1, 0]) assert.deepEqual(stepSkyRun(run, course, dt, {action: true}), []);
  assert.equal(run.actionHeld, false);
  stepSkyRun(run, course, .1, {x: NaN, y: Infinity});
  assert.equal(run.x, 0); assert.equal(run.y, 0);
});

test('sky scene owns a finite camera, efficient batched scenery, working reset and reduced-motion roll', () => {
  const flight = new SkyFlight({}), camera = new PerspectiveCamera(60, 16 / 9, .1, 2000);
  const original = new Set();
  for (let s = 0; s <= SKY.length; s += 90) {
    const f = skyFrame(s);
    for (const v of [f.center, f.right, f.up, f.forward]) assert.ok(v.toArray().every(Number.isFinite));
    assert.ok(Math.abs(f.forward.dot(f.up)) < 1e-8);
    assert.ok(Math.abs(f.right.dot(f.up)) < 1e-8);
  }
  flight.step(.1, {jump: true, action: true});
  flight.render(camera, 1 / 60, {reducedMotion: true});
  assert.ok(camera.position.toArray().every(Number.isFinite));
  assert.ok(camera.quaternion.toArray().every(Number.isFinite));
  assert.equal(flight.streaks.visible, false);
  flight.seek(.999); const events = flight.step(.1);
  assert.equal(events.filter(e => e.type === 'finish').length, 1);
  flight.reset(); assert.equal(flight.snapshot().progress, 0); assert.equal(flight.snapshot().collectibles, 0);
  flight.render(camera, 0);
  assert.ok(flight.scenery.filter(c => c.group.visible).length <= 5);
  flight.scene.traverse(object => {
    if (object.geometry) { assert.ok(object.geometry.attributes.position.array.every(Number.isFinite)); original.add(object.geometry); }
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) original.add(material);
  });
  for (const resource of original) resource.dispose();
});
