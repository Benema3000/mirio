import test from 'node:test';
import { Scene, Vector3 } from 'three';
import assert from 'node:assert/strict';
import { Adventure, TrailRun, trailLayouts, TRAIL_TIME } from '../js/adventure.js';
import { makeLevel } from '../js/level.js';
import { inWater, surfacePoint } from '../js/world.js';

test('trail requires every ring in order, with one completion only', () => {
  const run = new TrailRun(3);
  assert.equal(run.enter(1), null);
  assert.equal(run.enter(0), 'start');
  assert.equal(run.time, TRAIL_TIME);
  assert.equal(run.enter(0), null);
  assert.equal(run.enter(2), null);
  assert.equal(run.enter(1), 'ring');
  assert.equal(run.enter(2), 'complete');
  assert.equal(run.enter(2), null);
  assert.equal(run.active, false);
});
test('a missed timer resets a trail for free retries', () => {
  const run = new TrailRun(6);
  run.enter(0);
  assert.equal(run.step(TRAIL_TIME - .1), false);
  assert.equal(run.step(.2), true);
  assert.equal(run.next, 0);
  assert.equal(run.enter(0), 'start');
});
test('optional trails stay out of water and have close, ground-level gates', () => {
  for (const trail of trailLayouts(makeLevel())) {
    let previous;
    for (const dir of trail.dirs) {
      const pos = surfacePoint(trail.planet, dir, 0);
      assert.equal(inWater(pos, trail.planet), false);
      if (previous) assert.ok(previous.distanceTo(pos) < 2.5);
      previous = pos;
    }
  }
});

test('story transitions cancel trials quietly while the magnet still expires', () => {
  const adventure = new Adventure(new Scene(), makeLevel());
  adventure.trails[0].run.enter(0);
  adventure.magnet = 2;
  const player = { state: 'play', body: { pos: new Vector3(0, 26, 0), up: new Vector3(0, 1, 0) } };
  assert.deepEqual(adventure.update(1, player, false, 0), []);
  assert.equal(adventure.magnet, 1);
  assert.equal(adventure.trails[0].run.active, false);
  assert.deepEqual(adventure.update(2, player, false, 1), []);
  assert.equal(adventure.magnet, 0);
});
