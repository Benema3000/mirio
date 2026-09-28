import assert from 'node:assert/strict';
import test from 'node:test';
import {HUB, HUB_PADS, HUB_SPAWN, createHubVisit, hubDir, hubDistance, hubReturn, stepHubVisit} from '../js/hub-rules.js';

const planetPos = (dir) => dir.map(v => v * (HUB.radius + HUB.planetHeight));
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** A point `distance` units from `from` towards `to`, on the planet. */
function toward(from, to, distance) {
  const angle = distance / HUB.radius, total = Math.acos(Math.min(1, from.reduce((s, v, i) => s + v * to[i], 0)));
  const t = angle / total, a = Math.sin((1 - t) * total), b = Math.sin(t * total), s = Math.sin(total);
  return from.map((v, i) => (v * a + to[i] * b) / s);
}

test('the Sternenhof has a pad for each of the six journeys, and the spawn is on none', () => {
  assert.deepEqual(new Set(HUB_PADS.map(p => p.level)), new Set(['adventure', 'sky', 'kart', 'marble', 'ribbon', 'tilt']));
  const visit = createHubVisit();
  assert.deepEqual(stepHubVisit(visit, 5, {dir: HUB_SPAWN, grounded: true}), []);
  assert.equal(visit.near, null, 'no pad name at the spawn');
});

test('pads keep apart, so two names never show at once, and so do their planets', () => {
  for (const [i, a] of HUB_PADS.entries()) {
    for (const b of HUB_PADS.slice(i + 1)) {
      assert.ok(hubDistance(a.dir, b.dir) > 2 * HUB.padNotice, `${a.level} and ${b.level} are too close`);
      assert.ok(dist3(planetPos(a.dir), planetPos(b.dir)) > 2 * HUB.planetRadius + 3, `${a.level} and ${b.level} planets overlap`);
    }
  }
});

test('every pad is a short run from the spawn, and the nearest is almost in front of it', () => {
  const runs = HUB_PADS.map(p => ({level: p.level, arc: 2 * HUB.radius * Math.asin(hubDistance(HUB_SPAWN, p.dir) / (2 * HUB.radius))}));
  for (const {level, arc} of runs) assert.ok(arc < 24, `${level} is ${arc.toFixed(1)} units away`);
  const first = runs.reduce((a, b) => (a.arc < b.arc ? a : b));
  assert.equal(first.level, 'adventure');
  assert.ok(Math.abs(HUB_PADS[0].lon) < 20, 'Planetenreise is roughly straight ahead');
});

test('the name shown is that of the pad Mirio stands next to', () => {
  for (const p of HUB_PADS) {
    const visit = createHubVisit();
    stepHubVisit(visit, .1, {dir: toward(p.dir, HUB_SPAWN, 2.5), grounded: true});
    assert.equal(visit.near?.level, p.level);
  }
});

test('standing on a pad launches once; jumping over it does not', () => {
  const [p] = HUB_PADS;
  const flying = createHubVisit();
  assert.deepEqual(stepHubVisit(flying, 1, {dir: p.dir, grounded: false}), []);
  const visit = createHubVisit();
  assert.deepEqual(stepHubVisit(visit, HUB.approachTime / 2, {dir: p.dir, grounded: true}), []);
  assert.deepEqual(stepHubVisit(visit, HUB.approachTime, {dir: p.dir, grounded: true}), [{type: 'launch', level: p.level}]);
  assert.deepEqual(stepHubVisit(visit, 1, {dir: p.dir, grounded: true}), [], 'only once');
});

test('running across a pad on the way to another does not launch it', () => {
  const RUN_SPEED = 9, dt = 1 / 60;
  for (const p of HUB_PADS) {
    const visit = createHubVisit();
    // A straight run through the pad's centre, from 3 units before to 3 after.
    const before = toward(p.dir, HUB_SPAWN, 3);
    const after = p.dir.map((v, i) => 2 * v - before[i]);
    const len = Math.hypot(...after), end = after.map(v => v / len);
    for (let t = 0; t <= 6 / RUN_SPEED; t += dt) {
      const k = t * RUN_SPEED / 6, point = before.map((v, i) => v + (end[i] - v) * k), n = Math.hypot(...point);
      assert.deepEqual(stepHubVisit(visit, dt, {dir: point.map(v => v / n), grounded: true}), [], `${p.level} launched`);
    }
  }
});

test('coming back, Mirio lands beside his pad, which waits until he steps away', () => {
  for (const p of HUB_PADS) {
    const back = hubReturn(p.level);
    assert.ok(hubDistance(back, p.dir) >= HUB.padRelease, `${p.level}: the return spot is on the pad`);
    for (const other of HUB_PADS) assert.ok(hubDistance(back, other.dir) > HUB.padReach, `${p.level}: returns onto ${other.level}`);
    const visit = createHubVisit({lastLevel: p.level});
    assert.deepEqual(stepHubVisit(visit, 1, {dir: toward(p.dir, back, 1), grounded: true}), [], 'the pad waits');
    stepHubVisit(visit, .1, {dir: back, grounded: true});
    assert.equal(visit.blocked, null, 'stepping away frees it');
    stepHubVisit(visit, .1, {dir: p.dir, grounded: true});
    assert.deepEqual(stepHubVisit(visit, 1, {dir: p.dir, grounded: true}), [{type: 'launch', level: p.level}]);
  }
  assert.deepEqual(hubReturn('unknown'), [...HUB_SPAWN]);
});

test('completed journeys are remembered; unknown ones are ignored', () => {
  const visit = createHubVisit({completed: ['kart', 'nowhere'], lastLevel: 'nowhere'});
  assert.deepEqual([...visit.completed], ['kart']);
  assert.equal(visit.blocked, null);
  assert.deepEqual(hubDir(90, 0).map(v => Math.round(v * 1e9) / 1e9 + 0), [0, 1, 0]);
});
