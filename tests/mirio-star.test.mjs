import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { CHAPTERS } from '../js/chapters.js';
import { KRAKEL, KrakelRules, armLumps, armSpot, neckLumps } from '../js/krakel-rules.js';
import { METEOR_ZONES, ROUTE, STAR_RADIUS, latLonOf, makeStarLevel, meteorZone, starHeight } from '../js/star-level.js';
import {
  FLIGHT, LANDING, asteroidPosition, createStarRun, makeStarCourse, rescueStarFlight, seekStarFlight, stepStarFlight,
} from '../js/star-rules.js';
import { JUMP_SPEED, GRAVITY } from '../js/world.js';

const DT = 1 / 60;

function fly(run, course, seconds, controls = {}) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9 && ['flight', 'landing'].includes(run.phase); t += DT) {
    events.push(...stepStarFlight(run, course, DT, typeof controls === 'function' ? controls(run, t) : controls));
  }
  return events;
}

/** Steers for the next ring and keeps shooting. */
function ringPilot(course) {
  let last = -1;
  return (run, t) => {
    const next = course.rings.find(r => r.s > run.s) ?? { x: 0, y: 0 };
    const press = t - last > 0.15;
    if (press) last = t;
    return { x: Math.max(-1, Math.min(1, (next.x - run.x) * 0.6)), y: Math.max(-1, Math.min(1, (next.y - run.y) * 0.6)), action: press };
  };
}

// ---- The flight -------------------------------------------------------------

test('every belt walls the lane off but for a gap with a ring in it', () => {
  const course = makeStarCourse();
  for (const b of course.belts) {
    const ring = course.rings.find(r => r.s === b);
    assert.ok(ring, `no ring in the belt at ${b}`);
    const rocks = course.asteroids.filter(a => a.belt && Math.abs(a.s - b) < 3);
    assert.ok(rocks.length > 20, `belt at ${b} has ${rocks.length} rocks`);
    for (const a of rocks) assert.ok(Math.hypot(a.x - ring.x, a.y - ring.y) - a.radius - a.drift > FLIGHT.ringRadius - 0.6, `${a.id} blocks the gap`);
  }
});

test('the ring line is clear: no still rock sits on a ring', () => {
  const course = makeStarCourse();
  for (const ring of course.rings) {
    for (const a of course.asteroids.filter(a => !a.sweep && Math.abs(a.s - ring.s) < a.radius + 2)) {
      assert.ok(Math.hypot(a.x - ring.x, a.y - ring.y) > a.radius + a.drift + 0.7, `${a.id} sits on ${ring.id}`);
    }
  }
});

test('with no input the rocket still gets to the star, lands and hands over to Mirio on foot', () => {
  const course = makeStarCourse(), run = createStarRun();
  const events = fly(run, course, 200);
  assert.equal(run.phase, 'star');
  assert.equal(events.filter(e => e.type === 'checkpoint').length, 3);
  assert.equal(events.filter(e => e.type === 'arrive').length, 1);
  assert.equal(events.filter(e => e.type === 'land').length, 1);
  assert.ok(run.time > FLIGHT.length / FLIGHT.burstSpeed + LANDING.duration);
  assert.deepEqual(stepStarFlight(run, course, 0.5, { action: true }), [], 'on foot the flight rules are done');
});

test('flying the ring line is fast: bursts, a long chain, well under a minute', () => {
  const course = makeStarCourse(), run = createStarRun();
  fly(run, course, 200, ringPilot(course));
  const idle = createStarRun();
  fly(idle, course, 200);
  assert.ok(run.time < 45, `ring line took ${run.time.toFixed(1)} s`);
  assert.ok(run.time < idle.time - 15, 'the rings are worth flying');
  assert.ok(run.ringsTaken.size > course.rings.length * 0.8, `${run.ringsTaken.size} of ${course.rings.length} rings`);
  assert.ok(run.bestCombo >= 20, `best chain ${run.bestCombo}`);
  assert.ok(run.asteroids > 10 && run.zapped > 3, 'shooting on the way breaks rocks and chases Zischer');
});

test('a star shot breaks a small rock; a big one takes three', () => {
  const course = makeStarCourse();
  for (const big of [false, true]) {
    const a = course.asteroids.find(item => item.big === big && !item.sweep && !item.belt && item.s > 300);
    const run = createStarRun();
    seekStarFlight(run, course, (a.s - 60) / course.length);
    const events = [];
    for (let t = 0; t < 2 && !run.broken.has(a.id); t += DT) {
      const p = asteroidPosition(a, run.elapsed);
      run.x = p.x; run.y = p.y;
      events.push(...stepStarFlight(run, course, DT, { action: true }));
    }
    assert.ok(run.broken.has(a.id), `${a.id} broke`);
    assert.equal(events.filter(e => e.type === 'bump' && e.id === a.id).length, a.hp - 1);
  }
});

test('a bump costs two seconds and the chain; a roll goes straight through', () => {
  const course = makeStarCourse(), a = course.asteroids.find(item => !item.sweep && !item.belt && item.s > 300);
  for (const roll of [false, true]) {
    const run = createStarRun();
    seekStarFlight(run, course, (a.s - 12) / course.length);
    run.combo = 4;
    const events = [];
    for (let t = 0; t < 1 && run.s < a.s + 1; t += DT) {
      const p = asteroidPosition(a, run.elapsed);
      run.x = p.x; run.y = p.y;
      events.push(...stepStarFlight(run, course, DT, { jump: roll && run.s > a.s - 6 }));
    }
    assert.equal(events.some(e => e.type === 'planeBump'), !roll);
    assert.equal(run.penalty, roll ? 0 : FLIGHT.bumpPenalty);
    if (!roll) assert.equal(run.combo, 0);
  }
});

test('the rescue puts the rocket back at its checkpoint for two seconds', () => {
  const course = makeStarCourse(), run = createStarRun();
  fly(run, course, 14, ringPilot(course));
  assert.equal(run.checkpoint, 1);
  const time = run.time;
  const [event] = rescueStarFlight(run, course);
  assert.equal(event.penalty, FLIGHT.rescuePenalty);
  assert.equal(run.s, FLIGHT.checkpoints[0]);
  assert.equal(run.time, time + FLIGHT.rescuePenalty);
});

// ---- Krakel -------------------------------------------------------------------

const MAX_JUMP = JUMP_SPEED ** 2 / (2 * GRAVITY * 0.6);

test('each arm is a staircase of lumps Mirio can jump up, to a glowing spot in the open', () => {
  for (let i = 0; i < 3; i++) {
    const lumps = armLumps(i), tops = lumps.map(l => ({ ...l, top: l.height + l.radius }));
    assert.ok(tops[0].top < MAX_JUMP - 0.5, 'the claw lump can be jumped onto from the arena');
    for (let k = 1; k < tops.length; k++) {
      assert.ok(tops[k].top - tops[k - 1].top < 1.6, `arm ${i} lump ${k} is a big step`);
      assert.ok(Math.hypot(tops[k].x - tops[k - 1].x, tops[k].z - tops[k - 1].z) < 1.8, `arm ${i} lump ${k} is far`);
    }
    const spot = armSpot(i);
    // Room over the spot to jump and stomp: clear of the head and the neck.
    assert.ok(Math.hypot(spot.x, spot.z, spot.height - KRAKEL.head.height) > KRAKEL.head.radius + 3, 'the head hangs over the spot');
    for (const n of neckLumps(i)) assert.ok(Math.hypot(spot.x - n.x, spot.z - n.z, spot.height - n.height) > n.radius + 0.2, 'the neck covers the spot');
    assert.ok(Math.hypot(lumps[0].x, lumps[0].z) < KRAKEL.arena - 0.5, 'the claw grips the arena');
  }
});

const near = (spot, extra = {}) => ({ x: spot.x, z: spot.z, height: spot.height, onGround: true, ...extra });
function fight(boss, seconds, player = { x: 0, z: 14, height: 0, onGround: true }) {
  const events = [];
  for (let t = 0; t < seconds; t += DT) events.push(...boss.step(DT, typeof player === 'function' ? player(t) : player));
  return events;
}
function startFight() {
  const boss = new KrakelRules();
  boss.start();
  fight(boss, KRAKEL.intro + 0.1);
  assert.equal(boss.mode, 'arms');
  return boss;
}

test('only a stomp on the glowing spot curls the arm', () => {
  const boss = startFight(), spot = armSpot(0);
  fight(boss, DT, near(spot, { impact: { ...spot, pound: false, speed: 3 } }));
  assert.equal(boss.stage, 1, 'a soft landing is no stomp');
  fight(boss, DT, near(spot, { impact: { ...spot, x: spot.x + 3, pound: true, speed: 30 } }));
  assert.equal(boss.stage, 1, 'beside the spot is no hit');
  const events = fight(boss, DT, near(spot, { impact: { ...spot, pound: true, speed: 30 } }));
  assert.ok(events.some(e => e.type === 'bossHit' && e.arm === 0));
  assert.deepEqual(boss.curled, [true, false, false]);
  assert.equal(boss.activeArm, 1);
  assert.ok(fight(boss, KRAKEL.hurt + 0.1).some(e => e.type === 'bossStage' && e.stage === 2));
});

test('on the glowing arm Krakel shudders, then shakes Mirio off; a jump at the shake saves him', () => {
  for (const jump of [false, true]) {
    const boss = startFight(), lump = armLumps(0)[6], on = near({ ...lump, height: lump.height + lump.radius });
    const events = fight(boss, KRAKEL.every[0] + 0.1, on);
    assert.ok(events.some(e => e.type === 'shudder'), 'the shudder warns first');
    assert.ok(!events.some(e => e.type === 'spit'), 'no ink while Mirio is on the arm');
    const after = fight(boss, KRAKEL.shudder + KRAKEL.shake, () => (boss.shaking > 0 && jump ? { ...on, onGround: false } : on));
    assert.equal(after.some(e => e.type === 'toss'), !jump);
  }
});

test('ink lands where its mark was; the splash and its ring hurt on the ground, not in the air', () => {
  const boss = startFight();
  const at = { x: 4, z: 10, height: 0, onGround: true };
  let events = fight(boss, KRAKEL.every[0] + 0.05, at);
  const spit = events.find(e => e.type === 'spit');
  assert.ok(spit && Math.hypot(spit.x - 4, spit.z - 10) < 0.01, 'aimed at Mirio');
  events = fight(boss, KRAKEL.spitFlight, at);
  assert.ok(events.some(e => e.type === 'splash'));
  assert.ok(events.some(e => e.type === 'hurt'), 'standing on the mark hurts');
  // A second blob, Mirio away from it: its ring reaches him on the ground, unless he jumps.
  for (const airborne of [false, true]) {
    const b = startFight(), away = { x: 4 + 5, z: 10, height: airborne ? 1.5 : 0, onGround: !airborne };
    fight(b, KRAKEL.every[0] + 0.05, { x: 4, z: 10, height: 0, onGround: true });
    const hurt = fight(b, KRAKEL.spitFlight + 1.2, away).filter(e => e.type === 'hurt');
    assert.equal(hurt.length > 0, !airborne);
  }
});

test('with all three arms curled the head comes down, hops after Mirio and takes two stomps', () => {
  const boss = startFight();
  for (let i = 0; i < 3; i++) {
    const spot = armSpot(i);
    fight(boss, DT, near(spot, { impact: { ...spot, pound: true, speed: 30 } }));
    fight(boss, KRAKEL.hurt + 0.1);
  }
  assert.equal(boss.mode, 'bow');
  const events = fight(boss, KRAKEL.bow + 0.1);
  assert.ok(events.some(e => e.type === 'slam'));
  assert.equal(boss.mode, 'dazed');
  assert.equal(boss.head.top, KRAKEL.head.sunkTop);
  const top = () => ({ x: boss.head.x, z: boss.head.z, height: boss.head.top, onGround: true });
  let hit = fight(boss, DT, { ...top(), impact: { ...top(), pound: true, speed: 30 } });
  assert.ok(hit.some(e => e.type === 'bossHit' && e.hp === 1));
  // Shaken awake, it hops off after Mirio at once, comes down with a ring, and is dazed again.
  assert.ok(hit.some(e => e.type === 'bossJump'));
  hit = fight(boss, 2.5, { x: 8, z: 8, height: 0, onGround: true });
  assert.equal(boss.mode, 'dazed');
  assert.ok(hit.some(e => e.type === 'slam'));
  assert.ok(Math.hypot(boss.head.x, boss.head.z) > 1, 'the head moved');
  fight(boss, DT, { ...top(), impact: { ...top(), pound: true, speed: 30 } });
  assert.ok(boss.defeated);
  assert.equal(boss.progress, 1);
});

test('the fight never strands: progress only goes up, and every attack is announced', () => {
  const boss = startFight();
  let last = boss.progress;
  for (let i = 0; i < 3; i++) {
    fight(boss, 4);
    const spot = armSpot(i);
    fight(boss, DT, near(spot, { impact: { ...spot, pound: true, speed: 30 } }));
    assert.ok(boss.progress > last);
    last = boss.progress;
    fight(boss, KRAKEL.hurt + 0.1);
  }
  // Spits land no sooner than spitFlight after they are announced.
  const b = startFight(), seen = new Map();
  for (let t = 0; t < 12; t += DT) {
    for (const e of b.step(DT, { x: 3, z: 9, height: 0, onGround: true })) {
      if (e.type === 'spit') seen.set(`${e.x},${e.z}`, t);
      if (e.type === 'splash') assert.ok(t - seen.get(`${e.x},${e.z}`) >= KRAKEL.spitFlight - DT * 2);
    }
  }
});

// ---- The Riesenstern ------------------------------------------------------------

test('the star is round but flat over the arena, with steps up onto it', () => {
  const level = makeStarLevel();
  assert.equal(starHeight(new Vector3(0, 1, 0)), 0);
  const pole = starHeight(level.arena.dir);
  // On the arena the ground is one plane: the same height straight below as across.
  for (const r of [5, 10, 16]) {
    const dir = new Vector3(r, -(STAR_RADIUS + pole), 0).normalize();
    const ground = STAR_RADIUS + starHeight(dir), planeDistance = ground * -dir.y;
    assert.ok(Math.abs(planeDistance - (STAR_RADIUS + pole)) < 1e-6, `not flat at ${r} m`);
  }
  const rim = STAR_RADIUS / Math.cos(Math.asin(KRAKEL.arena / STAR_RADIUS)) * 0 + starHeight(new Vector3(KRAKEL.arena - 0.2, -STAR_RADIUS, 0).normalize());
  const steps = level.blocks.filter(b => latLonOf(b.dir).lat < -60).map(b => b.top).sort((a, b) => a - b);
  assert.equal(steps.length, 2);
  assert.ok(steps[0] < 2 && steps[1] - steps[0] < 2 && rim - steps[1] < 2, `steps ${steps} up to a rim of ${rim.toFixed(1)} m`);
});

test('the way round the star: three flags clear of the meteors, Zischer, springs and plenty of gems', () => {
  const level = makeStarLevel();
  assert.equal(level.flags.length, 3);
  for (const f of level.flags) assert.equal(meteorZone(latLonOf(f.dir).lat), null, 'a flag under the meteors');
  assert.ok(METEOR_ZONES.every(z => z.from > z.to));
  assert.equal(level.walkers.length, 5);
  assert.equal(level.arenaWalkers.length, 4);
  assert.ok(level.springs.length >= 2);
  assert.ok(level.bits.length >= 40);
  assert.ok(latLonOf(level.spawn.dir).lat > latLonOf(level.flags[0].dir).lat);
  assert.ok(ROUTE.entrance > ROUTE.arena);
  assert.equal(CHAPTERS.star.short, 'Raketenritt');
});
