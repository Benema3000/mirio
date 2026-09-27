import assert from 'node:assert/strict';
import test from 'node:test';
import {createSkyRun, makeSkyCourse, rescueSkyRun, skySnapshot, stepSkyRun} from '../js/sky-flight-rules.js';
import {AIR_ROUTE, POST, postalWind} from '../js/sky-post-rules.js';

function fly(run, course, duration, controls = {}) {
  const events = [];
  for (let t = 0; t < duration; t += 1 / 120) events.push(...stepSkyRun(run, course, 1 / 120, typeof controls === 'function' ? controls(run) : controls));
  return events;
}
function approach(id = 'garden') {
  const course = makeSkyCourse(), run = createSkyRun(), target = course.deliveries.find(d => d.id === id);
  Object.assign(run, {s: target.s - 60, x: target.x, y: target.y});
  return {course, run, target};
}

test('a generous contextual throw delivers the matching parcel even while turbo cools down', () => {
  const {course, run} = approach();
  run.cooldown = 4;
  assert.equal(stepSkyRun(run, course, .1, {action: true})[0].type, 'toss');
  assert.equal(run.boost, 0);
  assert.equal(run.post.delivered.size, 0, 'the visible parcel arrives before its recipient reacts');
  const events = fly(run, course, 1);
  assert.equal(events.filter(e => e.type === 'delivery').length, 1);
  assert.deepEqual([...run.post.delivered], ['garden']);
  assert.equal(skySnapshot(run, course).parcels, 2);
  assert.equal(run.penalty, 0);
});

test('a missed throw returns with a bird and can be retried inside the same spacious bay', () => {
  const {course, run, target} = approach();
  run.x = 11;
  assert.equal(stepSkyRun(run, course, .1, {action: true})[0].caught, false);
  assert.equal(fly(run, course, POST.returnDuration).filter(e => e.type === 'parcel-return').length, 1);
  assert.equal(run.post.delivered.size, 0);
  assert.equal(run.post.parcel, null);
  assert.equal(run.post.returns, 1);
  assert.equal(run.penalty, 0);
  run.x = target.x;
  stepSkyRun(run, course, .1, {action: true});
  fly(run, course, 1);
  assert.equal(run.post.delivered.has(target.id), true);
});

test('holding the parcel button cannot throw a second parcel or accidentally use turbo', () => {
  const {course, run} = approach();
  const events = fly(run, course, 2, {action: true});
  assert.equal(events.filter(e => e.type === 'toss').length, 1);
  assert.equal(events.filter(e => e.type === 'boost').length, 0);
});

test('the three air lanes trade climb, crosswind and shelter; deliveries improve later flight', () => {
  const course = makeSkyCourse(), run = createSkyRun();
  run.s = 900; run.elapsed = 1;
  const winds = new Map();
  for (const route of course.routes) {
    run.x = route.x; run.y = route.y;
    winds.set(route.id, postalWind(run, course));
  }
  assert.ok(winds.get(AIR_ROUTE.UPPER).y > 0);
  assert.ok(winds.get(AIR_ROUTE.UPPER).speed > winds.get(AIR_ROUTE.LOWER).speed);
  assert.ok(winds.get(AIR_ROUTE.MIDDLE).x > 0);
  assert.equal(winds.get(AIR_ROUTE.LOWER).x, 0);
  assert.equal(run.post.routesSeen.size, 3);
  run.x = 6; run.y = 5.2; run.post.delivered.add('bakery');
  assert.ok(postalWind(run, course).speed > winds.get(AIR_ROUTE.UPPER).speed);
  run.x = -6; run.y = -4.4; run.post.delivered.add('garden');
  assert.ok(postalWind(run, course).speed > winds.get(AIR_ROUTE.LOWER).speed);
});

test('three roll chimes wake the whale once, and the choir grants a useful escort', () => {
  const course = makeSkyCourse(), run = createSkyRun(), events = [];
  for (const chime of course.chimes) {
    Object.assign(run, {s: chime.s - 10, x: chime.x, y: chime.y, rollCooldown: 0, jumpHeld: false});
    events.push(...stepSkyRun(run, course, .1, {jump: true}));
  }
  assert.equal(events.filter(e => e.type === 'chime').length, 3);
  assert.equal(events.filter(e => e.type === 'choir').length, 1);
  assert.equal(run.post.choir, true);
  assert.ok(postalWind(run, course).speed >= POST.choirDraft);
  assert.equal(fly(run, course, .2, {jump: true}).filter(e => e.type === 'choir').length, 0);
});

test('checkpoint recovery preserves deliveries and chimes, returns loose cargo and never duplicates a gift', () => {
  const {course, run} = approach();
  stepSkyRun(run, course, .1, {action: true}); fly(run, course, 1);
  run.post.chimes.add('chime-sun');
  run.post.parcel = {id: 'bakery', caught: false, age: .3, from: {s: 600, x: 0, y: 0}};
  run.checkpoint = 1;
  rescueSkyRun(run, course);
  assert.deepEqual([...run.post.delivered], ['garden']);
  assert.deepEqual([...run.post.chimes], ['chime-sun']);
  assert.equal(run.post.parcel, null);
  assert.equal(run.s, course.checkpoints[0]);
  assert.equal(skySnapshot(createSkyRun(), course).deliveries, 0, 'replay gets new parcels');
});

test('a complete controlled postal run reaches every recipient and all three chimes without seeks', () => {
  const course = makeSkyCourse(), run = createSkyRun(), events = [];
  for (let t = 0; t < 110 && run.status === 'playing'; t += 1 / 60) {
    const next = [...course.deliveries.filter(d => !run.post.delivered.has(d.id)), ...course.chimes.filter(c => !run.post.chimes.has(c.id))]
      .filter(d => d.s > run.s - 10).sort((a, b) => a.s - b.s)[0];
    const target = next ?? {x: 0, y: 0, s: course.length};
    const near = Math.hypot(run.x - target.x, run.y - target.y) < 1.5;
    events.push(...stepSkyRun(run, course, 1 / 60, {
      x: Math.max(-1, Math.min(1, (target.x - run.x) * .8)), y: Math.max(-1, Math.min(1, (target.y - run.y) * .8)),
      action: near && target.s - run.s < 60 && !target.id?.startsWith('chime') && !run.actionHeld,
      jump: near && target.s - run.s < 18 && target.id?.startsWith('chime'),
    }));
  }
  assert.equal(run.status, 'finished');
  assert.equal(run.post.delivered.size, 3);
  assert.equal(run.post.chimes.size, 3);
  assert.equal(events.filter(e => e.type === 'arrival').length, 1);
  assert.equal(events.filter(e => e.type === 'finish').length, 1);
  assert.ok(run.time > 50 && run.time < 100);
});

test('balloons leave each recipient approach and its matching pictogram unobstructed', () => {
  const course = makeSkyCourse();
  for (const target of course.deliveries) for (const obstacle of course.obstacles) {
    if (Math.abs(obstacle.s - target.s) > POST.approach) continue;
    assert.ok(Math.hypot(obstacle.x - target.x, obstacle.y - target.y) > POST.aimRadius + obstacle.radius,
      `${obstacle.id} obscures ${target.id}`);
  }
});

test('recovering from the arrival approach restores undelivered cargo for the final checkpoint', () => {
  const course = makeSkyCourse(), run = createSkyRun();
  run.s = course.length - 100; run.checkpoint = 3;
  stepSkyRun(run, course, .1);
  assert.equal(run.post.arrival, true);
  rescueSkyRun(run, course);
  assert.equal(run.post.arrival, false);
  assert.equal(run.post.arrivalAt, 0);
  assert.equal(run.post.delivered.size, 0);
});
