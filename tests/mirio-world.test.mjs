// Physics and level checks for Mirio.
// Run: node --test tests/mirio-world.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PerspectiveCamera, Vector3 } from 'three';
import { collidersFor, flightPoint, makeLevel } from '../js/level.js';
import {
  CHAIN_WINDOW,
  collide,
  FALL_GRAVITY,
  GRAVITY,
  HOLD_GRAVITY,
  inWater,
  JUMP_CHAIN,
  JUMP_SPEED,
  jumpFor,
  partialTurn,
  pickGravitySource,
  RUN_JUMP_BONUS,
  RUN_SPEED,
  stepBody,
  surfacePoint,
  tangentDir,
  TERMINAL_FALL,
} from '../js/world.js';
import { RACE_BITS, Track } from '../js/kart.js';
import { DRIVE, driftLevel, driveKart, newKart, slideOf } from '../js/kart-physics.js';
import { Player } from '../js/player.js';
import { CameraRig } from '../js/camera.js';
import { analogStick, Input } from '../js/input.js';

const DT = 1 / 120;
const BODY = { radius: 0.45, height: 2.1 };
const COLLECT_REACH = 1.0 + 1.3; // player mid height + BIT_RADIUS in main.js
const noColliders = () => [];

const g = (planet) => GRAVITY * (planet.gravityScale ?? 1);
/** A running jump with the button held: what every Glitzerstein must be within. */
const maxJump = (planet) => (JUMP_SPEED + RUN_JUMP_BONUS) ** 2 / (2 * g(planet) * HOLD_GRAVITY);
/** A standing jump with the button held: what every step must be within. */
const tapJump = (planet) => JUMP_SPEED ** 2 / (2 * g(planet) * HOLD_GRAVITY);

function bodyOn(planet, dir, height = 0) {
  return {
    pos: surfacePoint(planet, dir.clone().normalize(), height),
    vel: new Vector3(),
    up: dir.clone().normalize(),
    ...BODY,
    onGround: height === 0,
    planet,
  };
}

function apex(planet) {
  const body = bodyOn(planet, new Vector3(0, 1, 0));
  body.vel.copy(body.up).multiplyScalar(JUMP_SPEED);
  body.onGround = false;
  let top = 0;
  for (let i = 0; i < 600; i++) {
    // Jump button held all the way, as player.js scales gravity.
    const rising = body.vel.dot(body.up) > 0;
    stepBody(body, null, 0, [planet], noColliders, DT, { gravityScale: rising ? HOLD_GRAVITY : FALL_GRAVITY });
    top = Math.max(top, body.pos.distanceTo(planet.center) - planet.radius);
  }
  return top;
}

test('the nearest surface wins, not the nearest centre', () => {
  const { planets } = makeLevel();
  const [welt, mond] = planets;
  const toMoon = new Vector3().subVectors(mond.center, welt.center).normalize();
  assert.equal(pickGravitySource(surfacePoint(welt, toMoon, 5), planets), welt);
  assert.equal(pickGravitySource(surfacePoint(mond, toMoon.clone().negate(), 5), planets), mond);
  assert.equal(pickGravitySource(new Vector3(500, 0, 0), planets), null);
});

test('walking all the way round the world keeps you on the ground', () => {
  const { planets } = makeLevel();
  const welt = planets[0];
  const body = bodyOn(welt, new Vector3(0, 1, 0));
  const heading = new Vector3(1, 0, 0);
  let grounded = 0;
  const steps = Math.round((2 * Math.PI * welt.radius) / RUN_SPEED / DT);
  for (let i = 0; i < steps; i++) {
    const wish = tangentDir(heading, body.up, new Vector3());
    stepBody(body, wish, RUN_SPEED, planets, noColliders, DT);
    heading.copy(wish);
    if (body.onGround) grounded++;
    assert.ok(Math.abs(body.pos.distanceTo(welt.center) - welt.radius) < 0.3, `left the surface at step ${i}`);
  }
  assert.ok(grounded / steps > 0.95, `grounded only ${grounded}/${steps} steps`);
  assert.ok(body.pos.distanceTo(surfacePoint(welt, new Vector3(0, 1, 0))) < 4, 'a full lap should end near the start');
});

test('on the moon Mirio jumps higher', () => {
  const [welt, mond] = makeLevel().planets;
  const onWorld = apex(welt);
  const onMoon = apex(mond);
  assert.ok(Math.abs(onWorld - tapJump(welt)) < 0.3, `world jump ${onWorld}`);
  assert.ok(onMoon > onWorld * 1.5, `moon jump ${onMoon} vs world ${onWorld}`);
});

test('momentum: Mirio builds up speed, skids when reversing, keeps momentum in the air', () => {
  const [welt] = makeLevel().planets;
  const body = bodyOn(welt, new Vector3(0, 1, 0));
  const east = new Vector3(1, 0, 0);
  const speedOf = () => body.vel.clone().addScaledVector(body.up, -body.vel.dot(body.up)).length();

  // Not instant: after 0.1 s he is still well below full speed, after 0.5 s at it.
  for (let i = 0; i < 12; i++) stepBody(body, tangentDir(east, body.up, new Vector3()), RUN_SPEED, [welt], noColliders, DT);
  assert.ok(speedOf() < RUN_SPEED * 0.6, `too snappy: ${speedOf().toFixed(2)} after 0.1 s`);
  for (let i = 0; i < 50; i++) stepBody(body, tangentDir(east, body.up, new Vector3()), RUN_SPEED, [welt], noColliders, DT);
  assert.ok(speedOf() > RUN_SPEED * 0.95, `too slow: ${speedOf().toFixed(2)} after 0.5 s`);

  // Push the other way: a skid that brakes hard.
  stepBody(body, tangentDir(east.clone().negate(), body.up, new Vector3()), RUN_SPEED, [welt], noColliders, DT);
  assert.ok(body.skidding, 'no skid when reversing at full speed');

  // Airborne with no input: momentum carries on.
  const air = bodyOn(welt, new Vector3(0, 1, 0), 3);
  air.vel.set(RUN_SPEED, 0, 0);
  for (let i = 0; i < 36; i++) stepBody(air, null, 0, [welt], noColliders, DT);
  const kept = air.vel.clone().addScaledVector(air.up, -air.vel.dot(air.up)).length();
  assert.ok(kept > RUN_SPEED * 0.85, `lost momentum in the air: ${kept.toFixed(2)}`);
});

test('falling speed is capped', () => {
  const [welt] = makeLevel().planets;
  const body = bodyOn(welt, new Vector3(0, 1, 0), 15);
  for (let i = 0; i < 120; i++) stepBody(body, null, 0, [welt], noColliders, DT, { gravityScale: FALL_GRAVITY });
  assert.ok(-body.vel.dot(body.up) <= TERMINAL_FALL + 1e-6);
});

test('the jump chain: single, double, triple, then back to single', () => {
  const fast = RUN_SPEED;
  const single = jumpFor(0, 0, fast);
  const double = jumpFor(1, 0.1, fast);
  const triple = jumpFor(2, 0.1, fast);
  assert.deepEqual([single.level, double.level, triple.level], [1, 2, 3]);
  assert.ok(single.speed < double.speed && double.speed < triple.speed);
  assert.equal(jumpFor(3, 0.1, fast).level, 1, 'no fourth jump');
  assert.equal(jumpFor(1, CHAIN_WINDOW + 0.05, fast).level, 1, 'waited too long');
  assert.equal(jumpFor(1, 0.1, 2).level, 1, 'too slow for a chain');
  assert.ok(jumpFor(0, 0, fast).speed > jumpFor(0, 0, 0).speed, 'running jumps go higher');
  assert.equal(JUMP_CHAIN.length, 3);
});

test('a box pushes you aside, holds you up, and bumps your head from below', () => {
  const box = {
    kind: 'box', base: new Vector3(0, 0, 0), axis: new Vector3(0, 1, 0),
    right: new Vector3(1, 0, 0), forward: new Vector3(0, 0, 1), halfW: 1, halfD: 1, height: 2,
  };
  const up = new Vector3(0, 1, 0);

  const side = new Vector3(1.3, 1, 0.2);
  const into = new Vector3(-3, 0, 0);
  assert.equal(collide(side, into, BODY, box, up), 'side');
  assert.ok(side.x >= 1.45 - 1e-9);
  assert.equal(into.x, 0);

  const top = new Vector3(0.2, 1.8, 0.2);
  const falling = new Vector3(0, -5, 0);
  assert.equal(collide(top, falling, BODY, box, up), 'top');
  assert.equal(top.y, 2);
  assert.equal(falling.y, 0);

  const floating = { ...box, base: new Vector3(0, 3, 0), height: 0.8 };
  const under = new Vector3(0, 3 - BODY.height + 0.2, 0);
  const rising = new Vector3(0, 8, 0);
  assert.equal(collide(under, rising, BODY, floating, up), 'head');
  assert.ok(Math.abs(under.y - (3 - BODY.height)) < 1e-9);
  assert.equal(rising.y, 0);
  // Walking underneath without jumping touches nothing.
  assert.equal(collide(new Vector3(0, 0, 0), new Vector3(), BODY, floating, up), null);
});

test('a gentle hill can be walked onto', () => {
  const level = makeLevel();
  const { planets, bumps } = level;
  const welt = planets[0];
  const hill = bumps.find((b) => b.planet === welt);
  const hills = collidersFor(level)(welt).filter((c) => c.kind === 'bump');
  const colliderOf = (p) => (p === welt ? hills : []);
  // Start 8 units from the hill's centre and walk straight at it.
  const east = tangentDir(new Vector3(0, 0, 1), hill.dir);
  const start = hill.dir.clone().multiplyScalar(Math.cos(8 / welt.radius)).addScaledVector(east, -Math.sin(8 / welt.radius)).normalize();
  const body = bodyOn(welt, start);
  let highest = 0;
  for (let i = 0; i < 180; i++) {
    const wish = tangentDir(new Vector3().subVectors(surfacePoint(welt, hill.dir), body.pos), body.up, new Vector3());
    stepBody(body, wish, RUN_SPEED, planets, colliderOf, DT);
    highest = Math.max(highest, body.pos.distanceTo(welt.center) - welt.radius);
  }
  assert.ok(highest > hill.height * 0.8, `only climbed to ${highest.toFixed(2)} of ${hill.height}`);
});

test('the lake splashes, a stepping stone does not', () => {
  const level = makeLevel();
  const welt = level.planets[0];
  const lakeLat = (welt.water.minLat + welt.water.maxLat) / 2;
  const la = (lakeLat * Math.PI) / 180;
  const onLake = surfacePoint(welt, new Vector3(Math.cos(la) * Math.cos(1), Math.sin(la), Math.cos(la) * Math.sin(1)), 0);
  assert.ok(inWater(onLake, welt));
  const stone = level.stones[0];
  assert.ok(!inWater(surfacePoint(welt, stone.dir, stone.top), welt));
  assert.ok(!inWater(surfacePoint(welt, level.spawn.dir, 0), welt));
  for (const f of level.flags) assert.ok(!inWater(surfacePoint(f.planet, f.dir, 0), f.planet), 'a flag stands in the lake');
});

test('a gravity flip turns the camera about its right axis', () => {
  const up = new Vector3(0, 1, 0);
  const right = new Vector3(1, 0, 0);
  const q = partialTurn(up, new Vector3(0, -1, 0), 0.5, right);
  const halfway = up.clone().applyQuaternion(q);
  assert.ok(Math.abs(halfway.x) < 1e-9, 'rolled sideways instead of pitching');
  assert.ok(Math.abs(Math.abs(halfway.z) - 1) < 1e-9);
});

// --- Level design ------------------------------------------------------------

/** Distance along the surface of `planet` between two directions. */
function arc(planet, a, b) {
  return a.angleTo(b) * planet.radius;
}

test('the level: every Glitzerstein floats in a gravity field, reachable and not buried', () => {
  const level = makeLevel();
  const colliders = collidersFor(level);
  for (const [i, bit] of level.bits.entries()) {
    const planet = bit.planet;
    assert.equal(pickGravitySource(bit.pos, level.planets), planet, `bit ${i} is pulled by the wrong planet`);
    const height = bit.pos.distanceTo(planet.center) - planet.radius;
    assert.ok(height > 0.3, `bit ${i} is buried`);

    let ground = 0;
    for (const c of colliders(planet)) {
      if (c.kind === 'bump') {
        const d = bit.pos.distanceTo(c.center);
        assert.ok(d > c.radius + 0.2, `bit ${i} is inside a hill`);
        // Standing on the hill right under the bit.
        const under = c.center.clone().add(bit.pos.clone().sub(c.center).setLength(c.radius));
        if (under.angleTo(bit.pos) < 0.01) ground = Math.max(ground, under.distanceTo(planet.center) - planet.radius);
        continue;
      }
      const rel = bit.pos.clone().sub(c.base);
      const along = rel.dot(c.axis);
      const inside = c.kind === 'box'
        ? Math.abs(rel.dot(c.right)) < c.halfW && Math.abs(rel.dot(c.forward)) < c.halfD
        : rel.clone().addScaledVector(c.axis, -along).length() < c.radius;
      if (!inside) continue;
      assert.ok(along > c.height || along < -0.3, `bit ${i} is hidden inside a ${c.kind}`);
      if (along > c.height) ground = Math.max(ground, c.base.distanceTo(planet.center) + c.height - planet.radius);
    }
    assert.ok(height - ground <= maxJump(planet) + COLLECT_REACH, `bit ${i} is out of reach (${(height - ground).toFixed(1)})`);
  }
});

test('the level: the lake crossing on the route needs jumps, and every jump is short', () => {
  const level = makeLevel();
  const welt = level.planets[0];
  const deg = Math.PI / 180;
  const route = level.stones.filter((s) => Math.abs(s.dir.z) < 0.05 && s.dir.x > 0).sort((a, b) => b.dir.y - a.dir.y);
  assert.ok(route.length >= 2, 'no stepping stones on the route');
  // Gaps between where you can stand: shore, stone tops (plus your radius), shore.
  const standR = (s) => (s.radius + BODY.radius) / welt.radius;
  const lats = [welt.water.maxLat * deg];
  for (const s of route) {
    const lat = Math.asin(s.dir.y);
    lats.push(lat + standR(s), lat - standR(s));
  }
  lats.push(welt.water.minLat * deg);
  for (let i = 0; i < lats.length; i += 2) {
    const gap = (lats[i] - lats[i + 1]) * welt.radius;
    assert.ok(gap > 0.3, `gap ${i / 2} can be walked across (${gap.toFixed(2)})`);
    assert.ok(gap < 3, `gap ${i / 2} is too wide (${gap.toFixed(2)})`);
  }
});

test('the level: the moon staircase climbs in reachable steps to the boss arena', () => {
  const level = makeLevel();
  const mond = level.planets[1];
  const { arena } = level;
  const steps = level.blocks.filter((b) => b.planet === mond).sort((a, b) => a.top - b.top);
  let prev = { top: 0, dir: null };
  for (const [i, b] of steps.entries()) {
    assert.ok(b.top - prev.top <= tapJump(mond) - 1, `step ${i} rises ${(b.top - prev.top).toFixed(1)}`);
    if (prev.dir) {
      const gap = arc(mond, prev.dir, b.dir) - (prev.size + b.size) / 2;
      assert.ok(gap < 3, `step ${i} is ${gap.toFixed(1)} away`);
    }
    prev = b;
  }
  // The last step sits beside the arena, not under it, and within a jump.
  const last = steps.at(-1);
  const r = mond.radius + last.top;
  const lateral = r * Math.sin(last.dir.angleTo(arena.dir));
  const gap = lateral - last.size / 2 - arena.radius;
  assert.ok(gap > 0.3, `the last step pokes under the arena (${gap.toFixed(2)})`);
  assert.ok(gap < 3, `the arena is ${gap.toFixed(2)} from the last step`);
  assert.ok(arena.top - last.top <= tapJump(mond) - 1, 'the arena is too high above the last step');

  assert.ok(level.goal.dir.angleTo(arena.dir) < 1e-6, 'the star is not over the arena');
  // Reachable from the arena with a running, held jump (mid 1.0 + reach 1.3).
  assert.ok(level.goal.height - arena.top - COLLECT_REACH <= maxJump(mond), 'the star is out of reach');
  assert.ok(level.goal.height - arena.top > 6.5, 'the star would sit inside the boss');
  // Mirio must still feel the moon on top of the giant boss's cap (~6 tall).
  assert.ok(arena.top + 6 + maxJump(mond) < mond.gravityRadius - mond.radius, 'the arena sky is outside the moon gravity');
});

test('the level: stairs lead up to the rocket plateau', () => {
  const level = makeLevel();
  const welt = level.planets[0];
  const stairs = level.blocks.filter((b) => b.planet === welt && b.dir.y < -0.3).sort((a, b) => a.top - b.top);
  let height = 0;
  for (const s of stairs) {
    assert.ok(s.top - height <= tapJump(welt) - 0.5, `stair rises ${s.top - height}`);
    height = s.top;
  }
  assert.ok(level.plateau.top - height <= tapJump(welt) - 0.5, 'the plateau is out of reach of the stairs');
});

test('the level: the rocket flight stays clear of both worlds', () => {
  const level = makeLevel();
  const [welt, mond] = level.planets;
  for (let i = 3; i <= 97; i++) {
    const p = flightPoint(level, i / 100);
    assert.ok(p.distanceTo(welt.center) - welt.radius > 4, `flight grazes the world at t=${i / 100}`);
    assert.ok(p.distanceTo(mond.center) - mond.radius > 1, `flight grazes the moon at t=${i / 100}`);
  }
  assert.ok(flightPoint(level, 1).distanceTo(surfacePoint(mond, level.rocket.flight.landing)) < 1e-9);
});

test('the level: planets and their gravity fields keep apart', () => {
  const { planets } = makeLevel();
  assert.deepEqual(planets.map((p) => p.id), ['welt', 'mond', 'ziel']);
  for (const a of planets) {
    for (const b of planets) {
      if (a === b) continue;
      const d = a.center.distanceTo(b.center);
      assert.ok(d > a.gravityRadius + b.radius, `${b.id} sits inside the gravity of ${a.id}`);
    }
  }
});

test('the level: the kart course runs downhill from the arena rim to the Zielplanet', () => {
  const level = makeLevel();
  const { start, finish } = level.course;
  const [, mond, ziel] = level.planets;
  assert.equal(finish.planet, ziel);
  const arenaTop = surfacePoint(mond, level.arena.dir, level.arena.top);
  assert.ok(Math.abs(start.pos.distanceTo(arenaTop) - level.arena.radius) < 1e-9, 'the start is not on the arena rim');
  assert.ok(Math.abs(start.forward.dot(start.up)) < 1e-9, 'start.forward is not level with the arena');
  const finishPoint = surfacePoint(ziel, finish.dir);
  assert.ok(start.pos.clone().sub(finishPoint).dot(start.up) > 10, 'the finish is not below the start');
  assert.ok(finishPoint.clone().sub(start.pos).dot(start.forward) > 10, 'the finish is not ahead of the start');
});

// ---- The kart --------------------------------------------------------------------
const KERB = 3.8;
const straightRoad = { curvature: 0, slope: 0, limit: KERB };
const wideRoad = { curvature: 0, slope: 0, limit: 100 };
const CRUISING = 15;
const kartAt = (fields = {}) => ({ ...newKart(), v: CRUISING, ...fields });
const GAS = { steer: 0, throttle: 1 };

/** Drives for `seconds`; `ctl` and `road` may be functions of the kart. Returns the events. */
function driveFor(k, seconds, ctl, road, opts) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    const r = typeof road === 'function' ? road(k) : road;
    events.push(...driveKart(k, typeof ctl === 'function' ? ctl(k, r) : ctl, r, DT, opts));
  }
  return events;
}

/** A driver on full gas who steers with the road and back to the middle of it. */
function followRoad(k, road) {
  const need = ((1 - DRIVE.assist) * road.curvature * k.v) / DRIVE.turn;
  return { steer: Math.max(-1, Math.min(1, need - k.yaw * 1.5 - k.x * 0.3)), throttle: 1 };
}

test('the kart goes with gas and stops with the brake, then backs up', () => {
  const k = newKart();
  driveFor(k, 1, { steer: 0 }, straightRoad);
  assert.equal(k.s, 0, 'without gas it should stand');
  driveFor(k, 1, GAS, straightRoad);
  assert.ok(k.v > 10, `one second of gas: ${k.v}`);
  driveFor(k, 6, GAS, straightRoad);
  assert.ok(k.v > 14 && k.v < DRIVE.top, `on the flat it tops out below its top speed: ${k.v}`);
  const coasting = { ...k };
  driveFor(coasting, 1, { steer: 0 }, straightRoad);
  const braking = { ...k };
  driveFor(braking, 1, { steer: 0, brake: 1 }, straightRoad);
  assert.ok(coasting.v < k.v && braking.v < coasting.v - 10, `off the gas it rolls on (${coasting.v}), the brake stops it (${braking.v})`);
  driveFor(braking, 3, { steer: 0, brake: 1 }, straightRoad);
  assert.ok(braking.v < 0 && braking.v > -DRIVE.reverseTop - 0.2, `held, the brake backs it up: ${braking.v}`);

  const downhill = newKart();
  const uphill = newKart();
  driveFor(downhill, 4, GAS, { ...straightRoad, slope: 0.15 });
  driveFor(uphill, 4, GAS, { ...straightRoad, slope: -0.15 });
  assert.ok(downhill.v > uphill.v + 2, `downhill ${downhill.v} vs uphill ${uphill.v}`);
});

test('the kart turns: a bend runs it wide unless it steers, and the inside is shorter', () => {
  const k = kartAt();
  driveFor(k, 0.4, { ...GAS, steer: 1 }, straightRoad);
  assert.ok(k.yaw > 0.3 && k.x > 0.3, `steering right did not turn it right: yaw ${k.yaw}, x ${k.x}`);

  const bend = { curvature: 0.1, slope: 0, limit: KERB };
  const lazy = kartAt();
  driveFor(lazy, 2.5, GAS, bend);
  assert.equal(lazy.x, -KERB, 'a kart that does not steer should end up on the outside kerb of a right bend');
  const driver = kartAt();
  driveFor(driver, 2, followRoad, bend);
  assert.ok(Math.abs(driver.x) < 1 && !driver.scraping, `steering with the bend should keep it mid-road, x ${driver.x}`);

  const hold = { curvature: 0.05, slope: 0, limit: 10 };
  const round = (k) => ({ steer: ((1 - DRIVE.assist) * hold.curvature * k.v) / DRIVE.turn - k.yaw, throttle: 1 });
  const inside = kartAt({ x: 2 });
  const outside = kartAt({ x: -2 });
  driveFor(inside, 1, round, hold);
  driveFor(outside, 1, round, hold);
  assert.ok(inside.s > outside.s + 1, `inside ${inside.s} vs outside ${outside.s}`);
});

test('the kart grips in a turn, and slides when it brakes into one at speed', () => {
  const maxSlide = (k, ctl) => {
    let most = 0;
    driveFor(k, 0.6, (kart) => {
      most = Math.max(most, slideOf(kart));
      return ctl;
    }, wideRoad);
    return most;
  };
  const slow = maxSlide(kartAt({ v: 5 }), { steer: 1, throttle: 1 });
  const fast = maxSlide(kartAt({ v: 18 }), { steer: 1, throttle: 1 });
  const braking = maxSlide(kartAt({ v: 18 }), { steer: 1, brake: 1 });
  assert.ok(slow < 0.1 && fast < 0.15, `on the gas the tyres grip: ${slow} slow, ${fast} fast`);
  assert.ok(braking > 0.3, `braking into the turn slides: ${braking}`);

  const sliding = kartAt({ v: 18 });
  const straight = kartAt({ v: 18 });
  driveFor(sliding, 0.5, { steer: 1, brake: 1 }, wideRoad);
  driveFor(straight, 0.5, { steer: 0, brake: 1 }, wideRoad);
  assert.ok(sliding.v < straight.v - 0.5, `sliding costs speed: ${sliding.v} vs ${straight.v}`);
});

test('the kart drifts with jump held and pays out a mini-turbo on release', () => {
  const bend = { curvature: 0.12, slope: 0, limit: 100 };
  assert.deepEqual(driveKart(kartAt(), { steer: 1, throttle: 1, hold: true }, bend, DT, { airborne: true }), [], 'no drift starts in the air');

  const k = kartAt();
  // Steer to start it, then let the arc and the bend match.
  assert.deepEqual(driveFor(k, DRIVE.charge[1] + 0.1, (kart) => ({ steer: kart.drift ? 0 : 1, throttle: 1, hold: true }), bend), ['drift']);
  assert.equal(driftLevel(k), 2);
  assert.ok(slideOf(k) > 0.3, `a drift slides: ${slideOf(k)}`);
  assert.deepEqual(driveKart(k, { steer: 1, throttle: 1, hold: false }, bend, DT), ['turbo']);
  assert.equal(k.turbo, DRIVE.turbo[1]);
  const plain = kartAt({ v: k.v, yaw: k.yaw, course: k.course });
  driveFor(k, 0.5, GAS, wideRoad);
  driveFor(plain, 0.5, GAS, wideRoad);
  assert.ok(k.v > plain.v + 3, `the turbo should speed it up: ${k.v} vs ${plain.v}`);

  const short = kartAt();
  driveFor(short, DRIVE.charge[0] / 2, { steer: -1, throttle: 1, hold: true }, wideRoad);
  assert.deepEqual(driveKart(short, { steer: 0, throttle: 1, hold: false }, wideRoad, DT), [], 'a short drift pays nothing');
  assert.equal(short.turbo, 0);
});

test('the kart bounces off a kerb it hits head-on, and scrapes along one it touches', () => {
  const hit = kartAt({ x: KERB - 0.01, yaw: 0.6, course: 0.6 });
  assert.deepEqual(driveKart(hit, GAS, straightRoad, DT), ['bump']);
  assert.ok(hit.course < 0 && hit.v < CRUISING * 0.8, `course ${hit.course}, v ${hit.v}`);

  const touch = kartAt({ x: KERB - 0.01, yaw: 0.15, course: 0.15 });
  assert.deepEqual(driveKart(touch, GAS, straightRoad, DT), []);
  assert.ok(touch.scraping && touch.x === KERB && touch.course < 0.15);
});

test('the kart race lasts 35 to 60 seconds on full gas along the road', () => {
  const track = new Track(makeLevel().course);
  const finish = track.sAtPsi(360 * 3);
  const k = newKart();
  const road = (kart) => ({ curvature: track.value(track.curv, kart.s), slope: track.value(track.slope, kart.s), limit: KERB });
  let t = 0;
  while (k.s < finish && t < 120) {
    driveFor(k, DT, followRoad, road);
    t += DT;
  }
  assert.ok(t > 35 && t < 60, `the race took ${t.toFixed(1)} s`);
});

test('the high score server knows how many Glitzersteine there are', () => {
  const php = readFileSync(new URL('../api/scores.inc', import.meta.url), 'utf8');
  const max = Number(php.match(/MIRIO_SCORES_MAX_BITS = (\d+);/)[1]);
  assert.equal(max, makeLevel().bits.length + RACE_BITS);
});

// ---- Movement and control regressions -----------------------------------------
const testPlanet = () => ({ center: new Vector3(), radius: 100, gravityRadius: 200 });

/** Exercise actual player state transitions without constructing the artwork. */
function testPlayer(planet = testPlanet()) {
  const player = Object.create(Player.prototype);
  Object.assign(player, {
    planets: [planet], collidersOf: noColliders, events: [],
    body: bodyOn(planet, new Vector3(0, 1, 0)), visualUp: new Vector3(),
    facing: new Vector3(1, 0, 0), wish: new Vector3(1, 0, 0),
    model: { group: { visible: true } },
  });
  player.reset({ planet, dir: new Vector3(0, 1, 0) });
  return player;
}

test('a buffered jump takes off in the same physics tick as touchdown', () => {
  const player = testPlayer();
  player.body.onGround = false;
  player.body.pos.y = player.body.planet.radius + 0.015;
  player.body.vel.y = -8;
  player.jumpBuffer = 0.1;
  player.step(DT);
  assert.equal(player.body.onGround, false);
  assert.ok(player.body.vel.y >= JUMP_SPEED);
  assert.equal(player.events.filter((e) => e.type === 'jump').length, 1);
  assert.equal(player.jumpBuffer, 0);
});

test('coyote time forgives a late jump but cannot become an extra air jump', () => {
  const player = testPlayer();
  player.body.onGround = false;
  player.coyote = 0.11;
  player.jumpBuffer = 0.1;
  player.step(DT);
  assert.equal(player.events.filter((e) => e.type === 'jump').length, 1);
  player.jumpBuffer = 0.1;
  player.step(DT);
  assert.equal(player.events.filter((e) => e.type === 'jump').length, 1);

  const late = testPlayer();
  late.body.pos.y += 3;
  late.body.onGround = false;
  late.coyote = 0;
  late.jumpBuffer = 0.1;
  late.step(DT);
  assert.equal(late.events.filter((e) => e.type === 'jump').length, 0);
});

test('boss bounce clears the landing buffer and coyote time', () => {
  const player = testPlayer();
  player.coyote = 0.1;
  player.jumpBuffer = 0.1;
  player.bounce();
  player.step(DT);
  assert.equal(player.coyote, 0);
  assert.equal(player.jumpBuffer, 0);
  assert.equal(player.events.filter((e) => e.type === 'jump').length, 0);
  assert.ok(player.body.vel.y > 0);
});

test('fast falls land on thin platforms instead of clipping through their top lip', () => {
  const planet = testPlanet();
  for (const kind of ['box', 'cyl']) {
    const collider = {
      kind, base: new Vector3(0, 102.7, 0), axis: new Vector3(0, 1, 0), height: 0.3,
      right: new Vector3(1, 0, 0), forward: new Vector3(0, 0, 1), halfW: 2, halfD: 2, radius: 2,
    };
    const body = bodyOn(planet, new Vector3(0, 1, 0), 3.1);
    body.vel.y = -32;
    stepBody(body, null, 0, [planet], () => [collider], 1 / 30, { terminal: 32 });
    assert.equal(body.onGround, true, kind);
    assert.ok(Math.abs(body.pos.y - 103) < 1e-8, `${kind}: ${body.pos.y}`);
    assert.equal(body.vel.y, 0);
  }
});

test('a fast upward crossing bumps the underside of a thin platform', () => {
  const up = new Vector3(0, 1, 0);
  for (const kind of ['box', 'cyl']) {
    const collider = {
      kind, base: new Vector3(0, 3, 0), axis: up, height: 0.3,
      right: new Vector3(1, 0, 0), forward: new Vector3(0, 0, 1), halfW: 2, halfD: 2, radius: 2,
    };
    const feet = new Vector3(0, 2.8, 0);
    const velocity = new Vector3(0, 30, 0);
    assert.equal(collide(feet, velocity, BODY, collider, up, new Vector3(0, 0.3, 0)), 'head');
    assert.ok(Math.abs(feet.y - (3 - BODY.height)) < 1e-8);
    assert.equal(velocity.y, 0);
  }
});

test('stale movement intent stays tangent as a planet curves underneath', () => {
  const planet = testPlanet();
  const body = bodyOn(planet, new Vector3(0, 1, 0));
  // Camera intent may still use the previous frame's surface normal.
  const staleWish = new Vector3(1, 0.2, 0).normalize();
  for (let i = 0; i < 120; i++) stepBody(body, staleWish, RUN_SPEED, [planet], noColliders, DT);
  assert.equal(body.onGround, true);
  assert.ok(Math.abs(body.pos.length() - planet.radius) < 1e-7);
  assert.ok(Math.abs(body.vel.dot(body.up)) < 1e-7);
});

test('camera smoothing stays outside planets, including a transition through their centre', () => {
  const planet = { ...testPlanet(), radius: 10 };
  const player = testPlayer(planet);
  const camera = new PerspectiveCamera();
  const rig = new CameraRig(camera, [planet]);
  rig.snap(player, player.facing);
  // Position and target are individually safe; their interpolated chord is not.
  rig.pos.copy(camera.position).negate();
  rig.place(player, 0.5);
  assert.ok(camera.position.length() >= planet.radius + 1.19);
  assert.ok(camera.position.toArray().every(Number.isFinite));
  assert.ok(camera.quaternion.toArray().every(Number.isFinite));
});

function eventTarget() {
  const listeners = new Map();
  const classes = new Set();
  return {
    style: {}, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    addEventListener: (name, callback) => listeners.set(name, [...(listeners.get(name) ?? []), callback]),
    emit(name, event = {}) {
      for (const callback of listeners.get(name) ?? []) callback({ preventDefault() {}, stopPropagation() {}, ...event });
    },
  };
}

function testInput(t, pads = () => []) {
  const originals = new Map(['window', 'document', 'navigator'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const win = { ...eventTarget(), innerWidth: 1000 };
  const doc = { ...eventTarget(), hidden: false };
  for (const [key, value] of Object.entries({ window: win, document: doc, navigator: { getGamepads: pads } })) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const elements = Object.fromEntries(['surface', 'stick', 'knob', 'jumpButton', 'spinButton', 'poundButton', 'gasButton', 'brakeButton'].map((name) => [name, eventTarget()]));
  const input = new Input(elements);
  input.enabled = true;
  return { input, win, doc, elements };
}

test('pause and focus loss clear queued actions, dragging and held controls', (t) => {
  const { input, win, elements } = testInput(t);
  win.emit('keydown', { code: 'KeyW' });
  win.emit('keydown', { code: 'Space' });
  elements.gasButton.emit('pointerdown', { pointerId: 3 });
  input.turn.x = 2;
  input.dragPointer = { id: 1 };
  input.update(DT);
  assert.equal(input.move.y, 1);
  win.emit('blur');
  assert.equal(input.move.y, 0);
  assert.equal(input.drive.gas, 0);
  assert.equal(input.consumeJump(), false);
  assert.equal(input.dragPointer, null);
  assert.deepEqual(input.consumeCamera(), { x: 0, y: 0 });
  assert.equal(elements.gasButton.classList.contains('pressed'), false);

  win.emit('keydown', { code: 'KeyX' });
  input.enabled = false;
  win.emit('keydown', { code: 'KeyQ' });
  input.update(DT);
  assert.equal(input.consumeSpin(), false);
  assert.deepEqual(input.consumeCamera(), { x: 0, y: 0 });
  input.enabled = true;
  input.update(DT);
  assert.equal(input.move.y, 0);
});

test('key release inside a text field does not leave movement stuck', (t) => {
  const { input, win } = testInput(t);
  win.emit('keydown', { code: 'KeyW' });
  win.emit('keyup', { code: 'KeyW', target: { tagName: 'INPUT' } });
  input.update(DT);
  assert.equal(input.move.y, 0);
  win.emit('keydown', { code: 'Space', target: { isContentEditable: true } });
  assert.equal(input.consumeJump(), false);
});

test('gamepad analog controls have a dead zone, single press edges and separate triggers', (t) => {
  const pad = { connected: true, mapping: 'standard', axes: [0.7, -0.7, 0.6, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  let connected = true;
  const { input } = testInput(t, () => connected ? [pad] : []);
  assert.deepEqual(analogStick(0.1, -0.1), { x: 0, y: 0 });
  pad.buttons[0] = { pressed: true, value: 1 };
  pad.buttons[7] = { pressed: true, value: 0.65 };
  input.update(DT);
  assert.ok(input.move.x > 0 && input.move.y > 0 && Math.hypot(input.move.x, input.move.y) <= 1);
  assert.equal(input.drive.gas, 0.65);
  assert.ok(input.drive.steer > 0);
  assert.equal(input.jumpHeld, true);
  assert.equal(input.consumeJump(), true);
  assert.ok(input.consumeCamera().x > 0);
  input.update(DT);
  assert.equal(input.consumeJump(), false, 'holding A must not queue more jumps');
  let pauses = 0;
  input.onPause = () => pauses++;
  pad.buttons[9] = { pressed: true, value: 1 };
  input.update(DT);
  input.update(DT);
  assert.equal(pauses, 1);
  connected = false;
  input.update(DT);
  assert.deepEqual(input.move, { x: 0, y: 0 });
  assert.equal(input.jumpHeld, false);
  assert.equal(input.drive.gas, 0);
});

test('the kart can safely coast with empty controls and only charges drift on the road', () => {
  const coast = kartAt();
  driveFor(coast, 1, {}, straightRoad);
  assert.ok(Object.values(coast).every((value) => typeof value !== 'number' || Number.isFinite(value)));
  assert.ok(coast.v < CRUISING && coast.v > 0);
  const k = kartAt({ drift: 1, charge: 0.4 });
  driveFor(k, 0.5, { steer: 0.2, hold: true }, wideRoad, { airborne: true });
  assert.equal(k.charge, 0.4);
  driveFor(k, 0.1, { steer: 0.2, hold: true, throttle: 1 }, wideRoad);
  assert.ok(k.charge > 0.49);
});
