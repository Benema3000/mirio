import assert from 'node:assert/strict';
import test from 'node:test';
import { Scene, Texture, Vector3 } from 'three';
import { EnemyBrain, ENEMY_RULES } from '../js/enemy-rules.js';
import { enemyLayouts, EnemySystem } from '../js/enemies.js';
import { trailLayouts } from '../js/adventure.js';
import { makeLevel, collidersFor } from '../js/level.js';
import { collide, dirFromLatLon, inWater, surfacePoint, tangentDir } from '../js/world.js';

const STEP = 1 / 120;
const near = { distance: 0.4, feet: 0, verticalSpeed: 0 };
function advance(brain, seconds, target = null, active = true) {
  const notices = [];
  for (let time = 0; time < seconds - 1e-8; time += STEP) {
    const event = brain.step(STEP, target, active);
    if (event) notices.push(event);
  }
  return notices;
}

test('creatures announce an attack, aim once and then rest instead of relentlessly chasing', () => {
  const brain = new EnemyBrain();
  brain.rest = 0;
  assert.equal(brain.step(STEP, { x: 2, z: 0, height: 0 }), 'notice');
  assert.equal(brain.mode, 'windup');
  const heading = [brain.facingX, brain.facingZ];
  advance(brain, ENEMY_RULES.windup - 0.1, { x: -2, z: 0, height: 0 });
  assert.equal(brain.mode, 'windup');
  assert.deepEqual([brain.facingX, brain.facingZ], heading, 'Mirio can dodge the announced line');
  advance(brain, 0.12, { x: -2, z: 0, height: 0 });
  assert.equal(brain.mode, 'charge');
  advance(brain, ENEMY_RULES.charge + 0.1, { x: -2, z: 0, height: 0 });
  assert.equal(brain.mode, 'recover');
  assert.equal(brain.contact(near), null, 'recovery offers a safe opening');
  assert.deepEqual(advance(brain, ENEMY_RULES.recover, { x: 1, z: 0, height: 0 }), []);
});

test('patrols and charges stay inside their home leash and abandon a departing player', () => {
  for (const kind of ['beetle', 'pebble']) {
    const brain = new EnemyBrain(kind);
    for (let i = 0; i < 120 * 30; i++) {
      brain.step(STEP, { x: 2.8, z: 0.3, height: 0 });
      assert.ok(Math.hypot(brain.x, brain.z) <= ENEMY_RULES.leash + 1e-8);
    }
    advance(brain, 10, { x: 100, z: 0, height: 0 });
    assert.equal(brain.mode, 'patrol');
    assert.ok(Math.hypot(brain.x, brain.z) < 1.1);
  }
});

test('a descending stomp wins over contact damage; jumping up through a creature is not a stomp', () => {
  const brain = new EnemyBrain();
  assert.deepEqual(brain.contact({ ...near, feet: 0.9, verticalSpeed: -5 }), { type: 'defeat', method: 'stomp', bounce: true });
  assert.equal(brain.mode, 'defeated');
  assert.equal(brain.contact(near), null, 'a defeated creature pays out once');
  const rising = new EnemyBrain();
  assert.deepEqual(rising.contact({ ...near, feet: 0.9, verticalSpeed: 5 }), { type: 'hurt' });
  assert.equal(rising.mode, 'recover');
});

test('one spin stuns; holding it cannot defeat; a fresh spin or stomp finishes the creature', () => {
  const brain = new EnemyBrain();
  assert.deepEqual(brain.contact({ ...near, spinning: true }), { type: 'stun', method: 'spin', bounce: false });
  for (let i = 0; i < 60; i++) {
    brain.step(STEP);
    assert.equal(brain.contact({ ...near, spinning: true }), null);
  }
  assert.equal(brain.mode, 'stunned');
  assert.equal(brain.contact({ ...near, distance: 5, spinning: false }), null);
  assert.deepEqual(brain.contact({ ...near, spinning: true }), { type: 'defeat', method: 'spin', bounce: false });
  const other = new EnemyBrain();
  other.contact({ ...near, spinning: true });
  assert.deepEqual(other.contact({ ...near, feet: 1, verticalSpeed: -6 }), { type: 'defeat', method: 'stomp', bounce: true });
});

test('stun and contact cooldown provide harmless recovery and respect player invulnerability', () => {
  const brain = new EnemyBrain();
  assert.equal(brain.contact({ ...near, invulnerable: true }), null);
  assert.deepEqual(brain.contact(near), { type: 'hurt' });
  advance(brain, ENEMY_RULES.recover * 0.8);
  assert.equal(brain.contact(near), null);
  const stunned = new EnemyBrain();
  stunned.contact({ ...near, spinning: true });
  advance(stunned, ENEMY_RULES.stun - 0.1);
  assert.equal(stunned.mode, 'stunned');
  assert.equal(stunned.contact(near), null);
  advance(stunned, 0.2);
  assert.equal(stunned.mode, 'recover');
  assert.equal(stunned.contact(near), null);
});

test('ground pounds defeat on impact, and inactive gameplay cancels pending charges', () => {
  const brain = new EnemyBrain();
  assert.deepEqual(brain.contact({ ...near, distance: 2.1, poundImpact: true }), { type: 'defeat', method: 'pound', bounce: false });
  const warning = new EnemyBrain();
  warning.rest = 0;
  warning.step(STEP, { x: 2, z: 0, height: 0 });
  assert.equal(warning.mode, 'windup');
  warning.step(STEP, null, false);
  assert.equal(warning.mode, 'recover');
  assert.ok(warning.rest > 1);
});

test('all seven homes and their full patrol leashes avoid water, props, trials, checkpoints and springs', () => {
  const level = makeLevel();
  const layouts = enemyLayouts(level), colliders = collidersFor(level);
  assert.equal(layouts.length, 7);
  assert.equal(layouts.filter(e => e.kind === 'beetle').length, 5);
  assert.equal(layouts.filter(e => e.kind === 'pebble').length, 2);
  for (const enemy of layouts) {
    const protectedDirs = [...level.flags.filter(f => f.planet === enemy.planet).map(f => f.dir),
      ...trailLayouts(level).filter(t => t.planet === enemy.planet).flatMap(t => t.dirs)];
    if (enemy.planet === level.planets[0]) protectedDirs.push(...[[81, 35], [24, 43], [-14, -28]].map(([lat, lon]) => dirFromLatLon(lat, lon)));
    for (const dir of protectedDirs) assert.ok(enemy.dir.angleTo(dir) * enemy.planet.radius > ENEMY_RULES.leash + 2, enemy.id);
    const forward = tangentDir(new Vector3(0, 1, 0), enemy.dir) ?? tangentDir(new Vector3(1, 0, 0), enemy.dir);
    const right = new Vector3().crossVectors(enemy.dir, forward);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const pos = surfacePoint(enemy.planet, enemy.dir).addScaledVector(forward, Math.cos(a) * ENEMY_RULES.leash).addScaledVector(right, Math.sin(a) * ENEMY_RULES.leash);
      const up = pos.clone().sub(enemy.planet.center).normalize();
      surfacePoint(enemy.planet, up, 0.03, pos);
      assert.equal(inWater(pos, enemy.planet), false, enemy.id);
      for (const c of colliders(enemy.planet)) assert.equal(collide(pos.clone(), new Vector3(), { radius: 0.8, height: 1.5 }, c, up), null, `${enemy.id} overlaps ${c.kind}`);
    }
  }
});

function mockPlayer(enemy, height = 0) {
  return {
    state: 'play', spinning: false, pounding: false, invulnerable: 0, events: [], hits: 0, bounces: 0,
    body: { pos: enemy.pos.clone().addScaledVector(enemy.up, height), up: enemy.up.clone(), vel: new Vector3(), planet: enemy.planet, height: 2.1 },
    hurt() { this.hits++; this.invulnerable = 1.6; },
    bounce() { this.bounces++; this.body.vel.copy(this.body.up).multiplyScalar(13); },
  };
}

test('rendered enemy system integrates bounce, single defeat events, snapshots and reset', () => {
  const system = new EnemySystem(new Scene(), makeLevel(), { shadow: new Texture() });
  const enemy = system.enemies[0], player = mockPlayer(enemy, 1.1);
  player.body.vel.copy(enemy.up).multiplyScalar(-6);
  const events = system.step(STEP, player, { active: true });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'enemyDefeat');
  assert.equal(events[0].method, 'stomp');
  assert.equal(player.bounces, 1);
  assert.equal(player.hits, 0);
  assert.equal(system.snapshot().defeated, 1);
  assert.equal(system.snapshot().creatures[0].headHeight, ENEMY_RULES.height);
  assert.deepEqual(system.step(STEP, player, { active: true }), []);
  assert.doesNotThrow(() => JSON.stringify(system.snapshot()));
  system.reset();
  assert.equal(system.snapshot().defeated, 0);
  assert.ok(system.snapshot().creatures.every(e => e.mode === 'patrol'));
});

test('inactive enemies cannot hurt and fresh landing-pound events are consumed exactly once', () => {
  const system = new EnemySystem(new Scene(), makeLevel(), { shadow: new Texture() });
  const enemy = system.enemies[0], player = mockPlayer(enemy);
  system.step(STEP, player, { active: false });
  assert.equal(player.hits, 0);
  player.events.push({ type: 'pound', pos: player.body.pos.clone() });
  const events = system.step(STEP, player, { active: true });
  assert.equal(events[0].type, 'enemyDefeat');
  assert.equal(events[0].method, 'pound');
  assert.equal(player.bounces, 0);
  assert.deepEqual(system.step(STEP, player, { active: true }), []);
});
