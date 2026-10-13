import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAPTERS, medalFor } from '../js/chapters.js';
import { krakelPaths } from '../js/star-creatures.js';
import {
  CLIMB, FLIGHT, LANDING, STAGES, asteroidPosition, createStarRun, makeStarCourse, rescueStarRun, seekStarRun, starSnapshot, stepStarRun,
} from '../js/star-rules.js';

const DT = 1 / 60;

function play(run, course, seconds, controls = {}) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9 && run.status === 'playing'; t += DT) {
    events.push(...stepStarRun(run, course, DT, typeof controls === 'function' ? controls(run, t) : controls));
  }
  return events;
}

/** A careful player: shoots in the flight, jumps waves, whirls Zischer, tickles at the top. */
function bot() {
  let last = -1;
  return (run, t) => {
    const press = t - last > .2;
    if (press) last = t;
    if (run.phase === 'flight') return {action: press};
    if (run.phase !== 'climb') return {};
    const c = run.climb, st = STAGES[c.stage];
    const wave = c.waves.some(w => w.pos > c.s && w.pos - c.s < 1.4);
    const zischer = st.zischer.some((at, i) => c.zischer[i]?.awake && !c.zischer[i].gone && Math.abs(at - c.s) < CLIMB.whirlReach - .2);
    return {y: 1, jump: wave && c.grounded, action: press && (zischer || c.s >= st.length - CLIMB.spot)};
  };
}

function toClimb(run, course) {
  const events = play(run, course, 120, {});
  assert.equal(run.phase, 'climb', 'the flight and landing end at the claw');
  return events;
}

test('the asteroid field keeps the checkpoints clear and the Zischer come in four waves', () => {
  const course = makeStarCourse();
  for (const a of course.asteroids) {
    for (const checkpoint of FLIGHT.checkpoints) assert.ok(Math.abs(a.s - checkpoint) >= 18, `${a.id} on a checkpoint`);
    assert.ok(Math.abs(a.x) <= FLIGHT.width && Math.abs(a.y) <= FLIGHT.height);
  }
  assert.equal(new Set(course.zischer.map(z => z.wave)).size, 4);
  assert.ok(course.asteroids.some(a => a.big) && course.asteroids.some(a => !a.big));
});

test('each climb is as long as the arm or head it runs along', () => {
  const paths = krakelPaths();
  assert.equal(paths.length, STAGES.length);
  for (const [i, st] of STAGES.entries()) {
    const length = paths[i].curve.getLength();
    assert.ok(Math.abs(length - st.length) / st.length < .05, `${st.id}: rules ${st.length} m, path ${length.toFixed(1)} m`);
  }
});

test('the rocket flies to the star by itself, lands, and waits at the claw', () => {
  const run = createStarRun(), course = makeStarCourse();
  const events = toClimb(run, course);
  assert.equal(events.filter(e => e.type === 'checkpoint').length, 3);
  assert.equal(events.filter(e => e.type === 'arrive').length, 1);
  assert.ok(run.time > FLIGHT.length / FLIGHT.cruise + LANDING.duration - .1);
  assert.equal(run.climb.stage, 0);
  assert.equal(run.climb.s, 0);
  // Without climbing nothing more happens; Krakel never finishes the chapter for you.
  play(run, course, 30, {});
  assert.equal(run.status, 'playing');
  assert.equal(run.climb.stage, 0);
});

test('a star shot breaks a small asteroid; a big one takes three', () => {
  const course = makeStarCourse();
  for (const big of [false, true]) {
    const a = course.asteroids.find(item => item.big === big && item.s > 200);
    const run = createStarRun();
    seekStarRun(run, course, (a.s - 60) / course.length * .55);
    const events = [];
    for (let t = 0; t < 2.2 && !run.broken.has(a.id); t += DT) {
      const p = asteroidPosition(a, run.elapsed);
      run.x = p.x; run.y = p.y;
      events.push(...stepStarRun(run, course, DT, {action: true}));
    }
    assert.ok(run.broken.has(a.id), `${a.id} broke`);
    assert.equal(events.filter(e => e.type === 'bump' && e.id === a.id).length, a.hp - 1);
    assert.equal(run.asteroids, 1);
  }
});

test('flying into an asteroid costs time; a roll goes straight through', () => {
  const course = makeStarCourse(), a = course.asteroids.find(item => item.s > 200);
  for (const roll of [false, true]) {
    const run = createStarRun();
    seekStarRun(run, course, (a.s - 10) / course.length * .55);
    const events = [];
    for (let t = 0; t < 1 && run.s < a.s + 1; t += DT) {
      const p = asteroidPosition(a, run.elapsed);
      run.x = p.x; run.y = p.y;
      events.push(...stepStarRun(run, course, DT, {jump: roll && run.s > a.s - 5}));
    }
    assert.equal(events.some(e => e.type === 'planeBump'), !roll);
    assert.equal(run.penalty, roll ? 0 : FLIGHT.bumpPenalty);
  }
});

test('Zischer throw sparks and a shot chases one off', () => {
  const run = createStarRun(), course = makeStarCourse(), first = course.zischer[0];
  seekStarRun(run, course, (first.s - 45) / course.length * .55);
  const events = play(run, course, 5, (r) => ({x: 0, y: 0, action: false}));
  assert.ok(events.some(e => e.type === 'spark'), 'they throw sparks');
  const zapped = [];
  for (let t = 0; t < 3 && !zapped.length; t += DT) {
    const state = run.zischerState.get(first.id);
    if (state && !state.gone) { run.x = first.x + Math.sin(state.age * 1.3 + first.phase) * 2.2; run.y = first.y + Math.sin(state.age * 1.9 + first.phase) * 1.2; }
    zapped.push(...stepStarRun(run, course, DT, {action: true}).filter(e => e.type === 'enemyDefeat'));
  }
  assert.equal(zapped.length, 1, 'a Zischer was chased off');
  assert.ok(run.chased.has(first.id) && run.zapped === 1);
});

test('a wave shakes Mirio back down the arm unless he jumps it', () => {
  const course = makeStarCourse();
  for (const jump of [false, true]) {
    const run = createStarRun();
    toClimb(run, course);
    run.climb.s = 10;
    run.climb.waves.push({pos: 12});
    const events = [];
    for (let t = 0; t < .4; t += DT) events.push(...stepStarRun(run, course, DT, {jump: jump && t === 0}));
    assert.equal(events.some(e => e.type === 'hurt'), !jump);
    assert.ok(jump ? run.climb.s === 10 : run.climb.s <= 10 - CLIMB.knockback + .01);
  }
});

test('a Zischer on the arm knocks Mirio back, and a whirl sends it off', () => {
  const course = makeStarCourse(), run = createStarRun();
  toClimb(run, course);
  seekStarRun(run, course, .6 + .4 * 1.5 / 4);
  assert.equal(run.climb.stage, 1);
  const at = STAGES[1].zischer[0];
  run.climb.s = at - 3;
  let events = play(run, course, 2, {y: 1});
  assert.ok(events.some(e => e.type === 'enemyNotice'));
  run.climb.s = at - 1.5;
  run.climb.invulnerable = 0;
  run.climb.waveClock = -99;
  events = play(run, course, .1, {action: true});
  assert.ok(events.some(e => e.type === 'enemyDefeat' && e.kind === 'whirl'));
  assert.equal(run.whirled, 1);
});

test('tickling the top of an arm curls it and flings Mirio to the next claw', () => {
  const course = makeStarCourse(), run = createStarRun();
  toClimb(run, course);
  run.climb.s = STAGES[0].length;
  run.climb.waveClock = -99;
  let events = [];
  for (let i = 0; i < STAGES[0].tickles; i++) events.push(...play(run, course, CLIMB.tickleCooldown + .05, (r, t) => ({action: t === 0})));
  assert.deepEqual(events.filter(e => e.type === 'tickle').map(e => e.left), [2, 1, 0]);
  assert.ok(events.some(e => e.type === 'armDown' && e.arms === 1));
  assert.equal(run.climb.stage, 1);
  assert.equal(run.climb.s, 0);
  events = play(run, course, CLIMB.switchTime + .1, {y: 1});
  assert.ok(events.some(e => e.type === 'land'));
  assert.ok(run.climb.s > 0, 'climbing again after the fling');
});

test('the rescue puts Mirio back at the claw of the arm he is on, for two seconds', () => {
  const course = makeStarCourse(), run = createStarRun();
  toClimb(run, course);
  run.climb.s = 15;
  const time = run.time;
  const [event] = rescueStarRun(run, course);
  assert.equal(event.penalty, FLIGHT.rescuePenalty);
  assert.equal(run.climb.s, 0);
  assert.equal(run.time, time + FLIGHT.rescuePenalty);
});

test('a careful player finishes: three arms and the head, with the clock stopped for the cheer', () => {
  const course = makeStarCourse(), run = createStarRun(), controls = bot();
  const events = play(run, course, 400, controls);
  assert.equal(run.status, 'finished', `stuck in ${run.phase} on ${STAGES[run.climb.stage].id}`);
  assert.equal(events.filter(e => e.type === 'finish').length, 1);
  assert.equal(events.filter(e => e.type === 'armDown').length, 3);
  assert.equal(events.filter(e => e.type === 'bossDown').length, 1);
  assert.ok(run.asteroids > 5, `broke ${run.asteroids} asteroids`);
  assert.ok(run.whirled >= 1);
  const snap = starSnapshot(run, course);
  assert.equal(snap.progress, 1);
  assert.ok(Math.abs(run.elapsed - run.time - CLIMB.cheer + run.penalty) < .1, 'the cheer is off the clock');
  const medal = medalFor('star', Math.round(run.time * 1000));
  assert.ok(['gold', 'silver'].includes(medal), `a careful run (${run.time.toFixed(1)} s) earns ${medal}`);
  const time = run.time;
  assert.deepEqual(stepStarRun(run, course, .25, {action: true}), []);
  assert.equal(run.time, time);
});

test('progress only goes forward through a whole run', () => {
  const course = makeStarCourse(), run = createStarRun(), controls = bot();
  let last = 0;
  for (let t = 0; t < 400 && run.status === 'playing'; t += DT) {
    stepStarRun(run, course, DT, controls(run, t));
    const p = starSnapshot(run, course).progress;
    // A wave can shake Mirio a little way down; never back into an earlier part.
    assert.ok(p >= last - .03, `progress fell from ${last} to ${p} in ${run.phase}`);
    last = Math.max(last, p);
  }
  assert.equal(CHAPTERS.star.short, 'Raketenritt');
});
