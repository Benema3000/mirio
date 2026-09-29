import assert from 'node:assert/strict';
import test from 'node:test';
import { RIVER, createRiverRun, makeRiverCourse, obstacleDepth, obstacleSpan, riverLane, riverSnapshot, stepRiverRun } from '../js/river-rules.js';

function ride(run, course, seconds, controls = {}, dt = 1 / 60) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9 && run.status !== 'done'; t += dt) {
    events.push(...stepRiverRun(run, course, Math.min(dt, seconds - t), typeof controls === 'function' ? controls(run, t) : controls));
  }
  return events;
}
const emptyCourse = (extra = {}) => ({length: RIVER.length, halfWidth: RIVER.halfWidth, center: () => 0, obstacles: [], gems: [], ...extra});

/** Steers into the next obstacle row's open lane, moving no further than needed. */
function goodDriver(course) {
  const margin = RIVER.logHalfWidth + .35;
  return run => {
    const next = course.obstacles.filter(o => o.s + obstacleDepth(o) + RIVER.logReach > run.s).sort((a, b) => a.s - b.s)[0];
    if (!next) return {x: -run.x};
    const lane = riverLane(course, next.s);
    const target = Math.max(lane.from + margin, Math.min(lane.to - margin, run.x));
    return {x: Math.max(-1, Math.min(1, (target - run.x) * 3))};
  };
}

test('the river starts calm and keeps the waterfall lip clear', () => {
  for (const seed of [1, 2, 3, 7, 42]) {
    const course = makeRiverCourse(seed);
    assert.ok(course.obstacles.length >= 16, `seed ${seed}: ${course.obstacles.length} obstacles`);
    for (const o of course.obstacles) {
      assert.ok(o.s - obstacleDepth(o) >= RIVER.calmStart, `${o.id} at ${o.s}`);
      assert.ok(o.s + obstacleDepth(o) <= course.length - RIVER.lipClear, `${o.id} at ${o.s}`);
      assert.ok(['rock', 'branch', 'whirl'].includes(o.kind));
    }
    assert.deepEqual(makeRiverCourse(seed).obstacles, course.obstacles, 'deterministic per seed');
    assert.equal(Math.abs(course.center(0)) < 1e-9, true, 'the log starts on the centre line');
  }
});

test('the river winds smoothly, with tighter bends near the end', () => {
  const course = makeRiverCourse(1);
  let flips = [], last = 0, maxSlope = 0;
  for (let s = 0; s <= course.length; s += .5) {
    const slope = (course.center(s + .5) - course.center(s)) / .5;
    assert.ok(Number.isFinite(slope));
    maxSlope = Math.max(maxSlope, Math.abs(slope));
    if (s > 0 && Math.sign(slope) !== Math.sign(last) && slope !== 0) flips.push(s);
    last = slope;
  }
  assert.ok(maxSlope < .45, `steepest bend ${maxSlope}`);
  assert.ok(flips.length >= 4, `bends ${flips}`);
  const gaps = flips.slice(1).map((s, i) => s - flips[i]);
  assert.ok(gaps.at(-1) < gaps[0], `bends tighten: ${gaps}`);
});

test('every obstacle row leaves a lane at least 2.5 m wide, and branches a 3 m gap', () => {
  for (const seed of [1, 2, 3, 7, 42, 99]) {
    const course = makeRiverCourse(seed);
    // Independent of the generator: sweep the river and cut out every obstacle's span.
    for (let s = 0; s <= course.length; s += .5) {
      const spans = course.obstacles.filter(o => Math.abs(o.s - s) <= obstacleDepth(o)).map(obstacleSpan).sort((a, b) => a[0] - b[0]);
      let from = -RIVER.halfWidth, widest = 0;
      for (const [a, b] of spans) { widest = Math.max(widest, Math.min(a, RIVER.halfWidth) - from); from = Math.max(from, b); }
      widest = Math.max(widest, RIVER.halfWidth - from);
      assert.ok(widest >= 2.5, `seed ${seed}, s ${s}: widest lane ${widest.toFixed(2)}`);
    }
    for (const o of course.obstacles.filter(o => o.kind === 'branch')) {
      const [a, b] = obstacleSpan(o);
      assert.ok(Math.max(a + RIVER.halfWidth, RIVER.halfWidth - b) >= 3, `${o.id} gap`);
    }
  }
});

test('obstacles alternate left and right towards the end', () => {
  const course = makeRiverCourse(1);
  const late = course.obstacles.filter(o => o.s > course.length * .7);
  const rows = [];
  for (const o of late) if (!rows.length || o.s - rows.at(-1).s > 3) rows.push(o);
  assert.ok(rows.length >= 5);
  for (let i = 1; i < rows.length; i++) assert.notEqual(Math.sign(rows[i].x), Math.sign(rows[i - 1].x), `rows at ${rows[i - 1].s} and ${rows[i].s}`);
  const spacing = s0 => { const r = course.obstacles.filter(o => o.s > s0 && o.s < s0 + 90); return 90 / r.length; };
  assert.ok(spacing(course.length - 110) < spacing(30), 'rows get denser');
});

test('gems stay in the water, off the obstacles, and reward the open lane', () => {
  const course = makeRiverCourse(1);
  assert.ok(course.gems.length >= 30);
  assert.equal(new Set(course.gems.map(g => g.id)).size, course.gems.length);
  for (const g of course.gems) {
    assert.ok(Math.abs(g.x) <= RIVER.halfWidth - .5);
    for (const o of course.obstacles) {
      if (Math.abs(o.s - g.s) > obstacleDepth(o)) continue;
      const [a, b] = obstacleSpan(o);
      assert.ok(g.x < a - .5 || g.x > b + .5, `${g.id} sits on ${o.id}`);
    }
  }
});

test('steering reaches both banks and stops there with a throttled scrape', () => {
  const course = emptyCourse(), run = createRiverRun();
  let events = ride(run, course, 1.2, {x: 1});
  assert.equal(run.x, RIVER.halfWidth);
  events.push(...ride(run, course, 1, {x: 1}));
  const scrapes = events.filter(e => e.type === 'scrape');
  assert.ok(scrapes.length >= 1 && scrapes.length <= 3, `${scrapes.length} scrapes`);
  assert.equal(run.x, RIVER.halfWidth);
  events = ride(run, course, 2.5, {x: -1});
  assert.equal(run.x, -RIVER.halfWidth);
  assert.ok(events.some(e => e.type === 'scrape' && e.side === -1));
  // Easing: half a tick of steering does not snap to full lateral speed.
  const fresh = createRiverRun();
  stepRiverRun(fresh, course, 1 / 30, {x: 1});
  assert.ok(fresh.vx > 0 && fresh.vx < RIVER.steerSpeed * .5);
});

test('speed ramps from the start speed towards the top speed', () => {
  const run = createRiverRun(), course = emptyCourse();
  assert.equal(run.speed, RIVER.startSpeed);
  ride(run, course, 5);
  assert.ok(run.speed > RIVER.startSpeed - 1e-9 && run.speed < 10);
  while (run.s < course.length - 5) ride(run, course, .5);
  assert.ok(run.speed > RIVER.topSpeed - 1, `speed near the end ${run.speed}`);
});

test('a bump costs speed and time once per obstacle, with a moment of grace', () => {
  const rocks = [{id: 'a', kind: 'rock', s: 40, x: 0, radius: 1}, {id: 'b', kind: 'rock', s: 44, x: .5, radius: 1},
    {id: 'c', kind: 'rock', s: 80, x: 0, radius: 1}];
  const course = emptyCourse({obstacles: rocks}), run = createRiverRun();
  const events = ride(run, course, 30);
  const bumps = events.filter(e => e.type === 'bump');
  assert.deepEqual(bumps.map(e => e.id), ['a', 'c'], 'rock b falls inside the grace period');
  assert.equal(run.bumps, 2);
  assert.equal(run.penalty, 2 * RIVER.bumpPenalty);
  assert.equal(run.hit.size, 3);
  // Speed drops to the bump speed and the log is pushed sideways.
  const again = createRiverRun();
  ride(again, course, 1 / 120, {});
  while (!again.hit.has('a')) stepRiverRun(again, course, 1 / 120);
  assert.equal(again.speed, RIVER.bumpSpeed);
  assert.equal(Math.abs(again.vx), RIVER.bumpPush);
  assert.equal(again.invulnerable, RIVER.invulnerable);
});

test('branches bump only where they lie; the gap is safe', () => {
  const branch = {id: 'br', kind: 'branch', s: 40, x: 1.5, halfLength: 3.8};
  const course = emptyCourse({obstacles: [branch]});
  const through = createRiverRun();
  assert.equal(ride(through, course, 8).filter(e => e.type === 'bump').length, 1);
  assert.ok(through.vx < 0 || through.x < 0, 'pushed towards the gap');
  const gap = createRiverRun();
  const events = ride(gap, course, 8, run => ({x: run.s < 38 ? Math.max(-1, (-3.5 - run.x) * 2) : 0}));
  assert.equal(events.filter(e => e.type === 'bump').length, 0);
});

test('a whirlpool pulls sideways and announces itself once', () => {
  const whirl = {id: 'w', kind: 'whirl', s: 40, x: 2, radius: 1.3};
  const run = createRiverRun();
  const events = ride(run, emptyCourse({obstacles: [whirl]}), 8);
  assert.equal(events.filter(e => e.type === 'whirl').length, 1);
  assert.equal(events.filter(e => e.type === 'bump').length, 0);
  assert.ok(run.x > .1, `pulled towards the whirl: ${run.x}`);
  // Gentle: steering away beats the pull.
  const away = createRiverRun();
  ride(away, emptyCourse({obstacles: [whirl]}), 8, {x: -1});
  assert.equal(away.x, -RIVER.halfWidth);
});

test('gems are collected once, only when the log passes over them', () => {
  const gems = [{id: 'g0', s: 30, x: 0}, {id: 'g1', s: 40, x: 3}, {id: 'g2', s: 50, x: 0}];
  const run = createRiverRun();
  const events = ride(run, emptyCourse({gems}), 10);
  assert.deepEqual(events.filter(e => e.type === 'gem').map(e => e.id), ['g0', 'g2']);
  assert.equal(run.collected.size, 2);
});

test('a good driver reaches the waterfall in 25-45 s with few bumps and most gems', () => {
  for (const seed of [1, 2, 3, 7]) {
    const course = makeRiverCourse(seed), run = createRiverRun();
    const events = ride(run, course, 60, goodDriver(course));
    const fall = events.find(e => e.type === 'waterfall');
    assert.ok(fall, `seed ${seed} reaches the waterfall`);
    assert.ok(fall.time >= 25 && fall.time <= 45, `seed ${seed}: ${fall.time.toFixed(1)} s`);
    assert.ok(run.bumps <= 1, `seed ${seed}: ${run.bumps} bumps`);
    assert.ok(run.collected.size >= course.gems.length * .7, `seed ${seed}: ${run.collected.size}/${course.gems.length} gems`);
  }
  // Riding straight down the middle hits things; the lane matters.
  const course = makeRiverCourse(1), careless = createRiverRun();
  ride(careless, course, 60);
  assert.ok(careless.bumps >= 4, `careless ${careless.bumps}`);
});

test('the waterfall ends the ride: falling, then done, with one event each', () => {
  const course = emptyCourse(), run = createRiverRun();
  run.s = course.length - 1;
  let events = ride(run, course, .2, {x: 1});
  assert.equal(run.status, 'falling');
  assert.equal(run.s, course.length);
  assert.equal(events.filter(e => e.type === 'waterfall').length, 1);
  const time = run.time, x = run.x;
  assert.ok(riverSnapshot(run, course).fall < .2);
  events = ride(run, course, 1, {x: 1});
  assert.equal(run.status, 'falling');
  assert.equal(run.time, time, 'the clock stops at the lip');
  assert.equal(run.x, x);
  events.push(...ride(run, course, 1));
  assert.equal(run.status, 'done');
  assert.equal(events.filter(e => e.type === 'landed').length, 1);
  assert.equal(riverSnapshot(run, course).fall, 1);
  assert.deepEqual(stepRiverRun(run, course, .1), []);
});

test('bad frame times and inputs are ignored', () => {
  const course = makeRiverCourse(1), run = createRiverRun();
  for (const dt of [NaN, -1, 0, Infinity, -Infinity, undefined]) assert.deepEqual(stepRiverRun(run, course, dt, {x: 1}), []);
  assert.equal(run.s, 0); assert.equal(run.time, 0);
  stepRiverRun(run, course, .1, {x: NaN});
  assert.equal(run.x, 0);
  const before = run.time;
  stepRiverRun(run, course, 10);
  assert.ok(Math.abs(run.time - before - RIVER.maxFrame) < 1e-9, 'a long hitch advances one capped frame');
});

test('the snapshot reports the HUD values', () => {
  const course = makeRiverCourse(1), run = createRiverRun();
  ride(run, course, 3, {x: .5});
  const snap = riverSnapshot(run, course);
  assert.equal(snap.status, 'riding');
  assert.equal(snap.totalGems, course.gems.length);
  assert.equal(snap.worldX, course.center(run.s) + run.x);
  assert.ok(snap.progress > 0 && snap.progress < .2);
  assert.equal(snap.fall, 0);
  for (const key of ['s', 'x', 'speed', 'time', 'penalty', 'bumps', 'collected']) assert.ok(Number.isFinite(snap[key]), key);
});

test('the river scene builds in node, stays cheap, and carries the log down and over the lip', async () => {
  const {Group, Matrix4, Vector3} = await import('three');
  const {RiverScene} = await import('../js/river-scene.js');
  // Downstream is -Z and river +x is world +X; the mirrored map checks either handedness.
  for (const mirror of [1, -1]) {
    const root = new Group(), course = makeRiverCourse(1);
    const river = new RiverScene(root, course, (s, x, h, out) => out.set(mirror * x, h, -s));
    const layout = river.layout();
    assert.equal(layout.gems, course.gems.length);
    assert.equal(layout.rocks + layout.branches + layout.whirls, course.obstacles.length);
    assert.ok(layout.meshes <= 22, `${layout.meshes} meshes`);
    root.traverse(o => { if (o.geometry) assert.ok(o.geometry.attributes.position.array.every(Number.isFinite), o.name); });
    const run = createRiverRun(), events = [];
    let t = 0, lowest = Infinity;
    const leaned = {with: 0, against: 0};
    while (run.status !== 'done' && t < 60) {
      events.push(...stepRiverRun(run, course, 1 / 30, goodDriver(course)(run)));
      t += 1 / 30;
      river.update(run, t);
      assert.ok(river.log.position.toArray().every(Number.isFinite));
      if (run.status === 'riding') {
        const expected = new Vector3(mirror * (course.center(run.s) + run.x), 0, -run.s);
        assert.ok(Math.hypot(river.log.position.x - expected.x, river.log.position.z - expected.z) < 1e-6);
        // The top leans and the nose turns towards the drift, on whichever side +x lies.
        const up = new Vector3(0, 1, 0).applyQuaternion(river.log.quaternion);
        const nose = new Vector3(0, 0, 1).applyQuaternion(river.log.quaternion);
        if (Math.abs(run.vx) > 3) {
          const way = Math.sign(run.vx * mirror);
          if (Math.sign(up.x) === way && Math.sign(nose.x - mirror * (course.center(run.s + .5) - course.center(run.s - .5))) === way) leaned.with++;
          else leaned.against++;
        }
      }
      lowest = Math.min(lowest, river.log.position.y);
    }
    assert.equal(run.status, 'done');
    assert.ok(leaned.with > 10 && leaned.against <= leaned.with / 5, `the log leans into the steering: ${JSON.stringify(leaned)}`);
    assert.ok(lowest < -layout.drop + .5, `the log reaches the pool: ${lowest}`);
    const matrix = new Matrix4();
    course.gems.forEach((g, i) => {
      river.gemMesh.getMatrixAt(i, matrix);
      const scale = new Vector3().setFromMatrixScale(matrix).x;
      assert.equal(scale < 1e-6, run.collected.has(g.id), g.id);
    });
    river.update(run, t + 1, {reducedMotion: true});
    assert.ok(river.seats.mirio.getWorldPosition(new Vector3()).toArray().every(Number.isFinite));
  }
});
