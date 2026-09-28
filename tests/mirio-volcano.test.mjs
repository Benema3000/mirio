import test from 'node:test';
import assert from 'node:assert/strict';
import { GLUT, GlutzahnRules } from '../js/glutzahn-rules.js';
import { makeVolcanoLevel, volcanoFlightPoint } from '../js/volcano-level.js';
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

test('only a tired Glutzahn can be stomped; three stomps beat him', () => {
  const fresh = until('walk');
  const head = (b) => ({ x: b.x, z: b.z, height: (GLUT.headLow + GLUT.headHigh) / 2, vy: -3 });
  assert.ok(fresh.step(DT, head(fresh)).some(e => e.type === 'bossBounce'), 'bounces off while he is fresh');
  assert.equal(fresh.hp, GLUT.hp);
  const boss = until('tired');
  for (let hit = 1; hit <= GLUT.hp; hit++) {
    const events = boss.step(DT, head(boss));
    assert.ok(events.some(e => e.type === 'bossHit' && e.hp === GLUT.hp - hit));
    if (hit < GLUT.hp) {
      for (let t = 0; t < 30 && boss.mode !== 'tired'; t += DT) boss.step(DT, far);
      assert.equal(boss.mode, 'tired');
    } else assert.ok(events.some(e => e.type === 'bossDefeat'));
  }
  run(boss, GLUT.hurt + 0.1, far);
  assert.equal(boss.defeated, true);
  assert.deepEqual(boss.step(DT, head(boss)), [], 'nothing more once he is beaten');
});

test('the Vulkanreise: two planets apart, a clear rocket flight, the arena on the Aschemond', () => {
  const level = makeVolcanoLevel();
  const [welt, mond] = level.planets;
  const gap = welt.center.distanceTo(mond.center) - welt.radius - mond.radius;
  assert.ok(gap > 15, `planets ${gap.toFixed(1)} apart`);
  for (let t = 0.08; t < 0.95; t += 0.01) {
    const p = volcanoFlightPoint(level, t);
    for (const planet of level.planets) assert.ok(p.distanceTo(planet.center) > planet.radius + 1, `the flight touches ${planet.id} at ${t.toFixed(2)}`);
  }
  assert.equal(level.arena.planet, mond);
  assert.equal(level.goal.planet, mond);
  assert.ok(level.goal.height > level.arena.top + 4, 'the crystal floats above Glutzahn');
  assert.ok(collidersFor(level)(mond).length > 5);
});

test('the route: steps up to the arena are jumpable, and creatures and the Glutbeere sit on the path', () => {
  const level = makeVolcanoLevel();
  const [, mond] = level.planets;
  const steps = level.blocks.filter(b => b.planet === mond).map(b => b.top).sort((a, b) => a - b);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] - steps[i - 1] <= 1.6, 'each step is one jump');
  assert.ok(level.arena.top - steps.at(-1) <= 1.6, 'the last step reaches the arena');
  assert.ok(level.walkers.length >= 4 && level.plants.length >= 4 && level.powerups.length === 1);
  for (const w of level.walkers) assert.ok(level.planets.includes(w.planet));
  const berry = level.powerups[0];
  const block = level.blocks.find(b => b.dir.angleTo(berry.dir) < 1e-6);
  assert.ok(block && berry.height > block.top, 'the Glutbeere sits on top of its block');
  assert.ok(surfacePoint(berry.planet, berry.dir, berry.height).length() > 0);
});
