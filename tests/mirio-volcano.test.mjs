import test from 'node:test';
import assert from 'node:assert/strict';
import { GLUT, GlutzahnRules } from '../js/glutzahn-rules.js';
import { RAVINES, ZONES, landPoint, makeVolcanoLevel, volcanoFlightPoint } from '../js/volcano-level.js';
import { collidersFor } from '../js/level.js';
import { surfacePoint } from '../js/world.js';

const DT = 1 / 60;
const run = (boss, seconds, player) => { const events = []; for (let t = 0; t < seconds; t += DT) events.push(...boss.step(DT, typeof player === 'function' ? player(boss) : player)); return events; };
const far = { x: 0, z: 5.5, height: 0, vy: 0 };
/** A started fight, stepped until Glutzahn reaches `mode`. */
function until(mode, player = far) {
  const boss = new GlutzahnRules(); boss.start();
  for (let t = 0; t < 30 && boss.mode !== mode; t += DT) boss.step(DT, player);
  assert.equal(boss.mode, mode);
  return boss;
}

test('Glutzahn waits for Mirio, roars, walks over, and takes turns between fire and a Kreisel', () => {
  const boss = new GlutzahnRules();
  assert.deepEqual(boss.step(1, far), [], 'nothing before the fight starts');
  assert.deepEqual(boss.start(), [{ type: 'bossRoar' }]);
  const events = run(boss, 20, far);
  const attacks = events.filter(e => e.type === 'bossAim' || e.type === 'bossWind').map(e => e.type);
  assert.deepEqual(attacks.slice(0, 3), ['bossAim', 'bossWind', 'bossAim']);
  assert.ok(events.some(e => e.type === 'bossThrow'));
  assert.ok(Math.hypot(boss.x, boss.z) <= GLUT.arena - GLUT.radius + 1e-9, 'he stays on the arena');
});

test('the fire is announced, reaches straight ahead, and a step to the side escapes it', () => {
  const boss = until('aim');
  const ahead = { x: boss.x + boss.facingX * 4, z: boss.z + boss.facingZ * 4, height: 0, vy: 0 };
  assert.equal(boss.inFire(ahead), false, 'no fire while he rears back');
  for (let t = 0; t < GLUT.aim + DT && boss.mode === 'aim'; t += DT) boss.step(DT, ahead);
  assert.equal(boss.mode, 'fire');
  assert.equal(boss.inFire(ahead), true);
  const side = { x: ahead.x + boss.facingZ * 4.5, z: ahead.z - boss.facingX * 4.5, height: 0, vy: 0 };
  assert.equal(boss.inFire(side), false);
  assert.equal(boss.inFire({ ...ahead, height: GLUT.fireHeight + 0.1 }), false, 'a high jump clears it');
});

test('a Kreisel rolls and bounces off the rim, hurts on the ground and can be jumped', () => {
  const boss = until('wind');
  for (let t = 0; t < 2 && boss.kreisels.length === 0; t += DT) boss.step(DT, far);
  assert.equal(boss.kreisels.length, 1);
  const k = boss.kreisels[0];
  let maxR = 0;
  for (let t = 0; t < 2; t += DT) { boss.step(DT, { x: 20, z: 20, height: 0, vy: 0 }); maxR = Math.max(maxR, Math.hypot(k.x, k.z)); }
  assert.ok(maxR <= GLUT.arena - 0.4 + 1e-9, 'it never leaves the arena');
  const on = { x: k.x, z: k.z, height: 0, vy: 0 };
  assert.ok(boss.step(DT, on).some(e => e.type === 'hurt'));
  assert.equal(boss.step(DT, { ...on, x: k.x, z: k.z, height: GLUT.kreiselJump + 0.1 }).filter(e => e.type === 'hurt' && e.x === k.x).length, 0);
});

test('only a tired Glutzahn can be stomped; three stages of two stomps beat him', () => {
  const fresh = until('walk');
  const head = (b) => ({ x: b.x, z: b.z, height: (GLUT.headLow + GLUT.headHigh) / 2, vy: -3 });
  assert.ok(fresh.step(DT, head(fresh)).some(e => e.type === 'bossBounce'), 'bounces off while he is fresh');
  assert.equal(fresh.hp, GLUT.hp);
  const boss = until('tired');
  const stages = [];
  for (let hit = 1; hit <= GLUT.hp; hit++) {
    const events = boss.step(DT, head(boss));
    assert.ok(events.some(e => e.type === 'bossHit' && e.hp === GLUT.hp - hit));
    stages.push(...events.filter(e => e.type === 'bossStage').map(e => e.stage));
    if (hit < GLUT.hp) {
      for (let t = 0; t < 30 && boss.mode !== 'tired'; t += DT) boss.step(DT, far);
      assert.equal(boss.mode, 'tired');
    } else assert.ok(events.some(e => e.type === 'bossDefeat'));
  }
  assert.deepEqual(stages, [2, 3], 'two hits per stage');
  run(boss, GLUT.hurt + 0.1, far);
  assert.equal(boss.defeated, true);
  assert.deepEqual(boss.step(DT, head(boss)), [], 'nothing more once he is beaten');
});

test('each stage he walks faster and rests less', () => {
  const boss = new GlutzahnRules(); boss.start();
  const timeToAttack = () => { let t = 0; boss.change('walk'); while (boss.mode === 'walk' && t < 10) { boss.step(DT, { x: boss.x + 2.5, z: boss.z, height: 0, vy: 0 }); t += DT; } return t; };
  const first = timeToAttack();
  boss.hp = GLUT.hp - 2 * GLUT.hitsPerStage;
  assert.equal(boss.stage, 3);
  assert.ok(timeToAttack() < first * 0.8);
});

test('the Vulkanreise: a tiny Startstern above a flat Festland, a clear rocket flight down', () => {
  const level = makeVolcanoLevel();
  const { start, land } = level;
  assert.ok(land.radius >= 10000, 'the Festland is flat to the eye');
  // Flat to the eye: over any 100 m stretch the ground bends less than 30 cm from a straight line.
  for (let z = 0; z > ZONES.arena; z -= 50) {
    const a = landPoint(0, z), b = landPoint(0, z - 100), mid = landPoint(0, z - 50);
    assert.ok(mid.distanceTo(a.clone().add(b).multiplyScalar(0.5)) < 0.3);
  }
  assert.ok(start.radius < 10 && start.center.y > 30, 'the Startstern floats in the sky');
  for (let t = 0.06; t < 0.95; t += 0.01) {
    const p = volcanoFlightPoint(level, t);
    assert.ok(p.distanceTo(start.center) > start.radius + 0.5, `the flight touches the Startstern at ${t.toFixed(2)}`);
    assert.ok(landPoint(p.x, p.z).y < p.y - 0.5, `the flight touches the Festland at ${t.toFixed(2)}`);
  }
  assert.equal(level.arena.planet, land);
  assert.ok(level.goal.height > level.arena.top + 4, 'the crystal floats above Glutzahn');
  assert.ok(collidersFor(level)(land).length > 5);
});

test('the forest: every ravine has platforms one jump apart, Damai hops each, the Glutbeere is reachable', () => {
  const level = makeVolcanoLevel();
  for (const r of RAVINES) {
    const tops = level.blocks.filter(b => b.planet === level.land && b.dir.z / b.dir.y * level.land.radius < r.z0 && b.dir.z / b.dir.y * level.land.radius > r.z1)
      .map(b => ({ z: b.dir.z / b.dir.y * level.land.radius, top: b.top })).sort((a, b) => b.z - a.z);
    assert.ok(tops.length >= 2, 'platforms across each ravine');
    const edges = [{ z: r.z0, top: 0 }, ...tops, { z: r.z1, top: 0 }];
    for (let i = 1; i < edges.length; i++) {
      assert.ok(edges[i - 1].z - edges[i].z <= 5.5, 'each gap is one jump wide');
      assert.ok(edges[i].top - edges[i - 1].top <= 2.6, 'each step up is one jump high');
    }
  }
  assert.equal(level.route.filter(p => p.hop).length, RAVINES.length);
  const zs = level.route.map(p => p.z);
  assert.ok(zs.every((z, i) => !i || z < zs[i - 1]), 'the route only goes forward');
  const berry = level.powerups[0];
  const block = level.blocks.find(b => b.dir.angleTo(berry.dir) < 1e-6);
  assert.ok(block && berry.height > block.top && block.top < 4, 'the Glutbeere sits on a block a spring or a jump reaches');
  assert.ok(level.springs.length >= 3 && level.walkers.length >= 4 && level.plants.length >= 4);
  assert.ok(level.arenaWalkers.length >= 3 && level.arenaPlants.length >= 3, 'stages two and three bring company');
  assert.ok(surfacePoint(berry.planet, berry.dir, berry.height).length() > 0);
});
