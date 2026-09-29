import test from 'node:test';
import assert from 'node:assert/strict';
import { GLUT, GlutzahnRules } from '../js/glutzahn-rules.js';
import { Vector3 } from 'three';
import {
  RAVINE, RAVINES, ZONES, beyondEdge, corridor, festlandColliders, festlandHeight, landDir, landPoint, landXZ, makeVolcanoLevel,
  pathX, plantedDepth, rimHeight, volcanoFlightPoint,
} from '../js/volcano-level.js';
import { collidersFor } from '../js/level.js';
import { RUN_SPEED, heightAbove, stepBody, surfacePoint, tangentDir } from '../js/world.js';

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

/** The level with every solid thing on the Festland, as volcano-run.js has it. */
function solidLevel() {
  const level = makeVolcanoLevel(), base = collidersFor(level);
  const land = [...base(level.land), ...festlandColliders(level)];
  return { level, colliders: (p) => (p === level.land ? land : base(p)) };
}
const body = (level, x, z) => ({ pos: landPoint(x, z, 0.05), vel: new Vector3(), up: landDir(x, z), radius: 0.45, height: 2.1, onGround: false, planet: level.land });
/** Runs `b` toward local (x, z) for `seconds`, jumping (with `jump` speed) whenever it lands. */
function runToward(level, colliders, b, x, z, seconds, { jump = 0, each = () => {} } = {}) {
  const DT = 1 / 120;
  for (let t = 0; t < seconds; t += DT) {
    const wish = tangentDir(landPoint(x, z, 0).sub(b.pos), b.up, new Vector3());
    if (jump && b.onGround) b.vel.addScaledVector(b.up, jump);
    stepBody(b, wish, RUN_SPEED, level.planets, colliders, DT);
    each(b, t);
  }
  return b;
}

test('the Vulkanreise: a tiny Startstern above a hilly Festland, a clear rocket flight down', () => {
  const level = makeVolcanoLevel();
  const { start, land } = level;
  assert.ok(land.radius >= 10000 && typeof land.heightAt === 'function', 'a big round planet with hills on it');
  assert.ok(start.radius < 10 && start.center.y > 30, 'the Startstern floats in the sky');
  for (let t = 0.06; t < 0.95; t += 0.01) {
    const p = volcanoFlightPoint(level, t);
    assert.ok(p.distanceTo(start.center) > start.radius + 0.5, `the flight touches the Startstern at ${t.toFixed(2)}`);
    assert.ok(landPoint(p.x, p.z).y < p.y - 0.5, `the flight touches the Festland at ${t.toFixed(2)}`);
  }
  assert.ok(Math.abs(festlandHeight(0, 0)) < 1e-9, 'the rocket lands on a level pad');
  assert.equal(level.arena.planet, land);
  assert.ok(level.goal.height > level.arena.top + 4, 'the crystal floats above Glutzahn');
  assert.ok(collidersFor(level)(land).length > 5);
});

test('the Festland has ups and downs, and the way through stays a walk for a child', () => {
  const level = makeVolcanoLevel();
  // heightAt is the height function, seen from the planet's centre.
  for (const [x, z] of [[0, -50], [7, -190], [-20, -300], [0, -900]]) assert.ok(Math.abs(level.land.heightAt(landDir(x, z)) - festlandHeight(x, z)) < 1e-6);
  // Along the path: several hills and dips, metres high, never steeper than 0.35.
  const path = [], ravine = (z) => RAVINES.some(r => z < r.z0 + 0.5 && z > r.z1 - 0.5);
  for (let z = -2; z > ZONES.bank; z -= 0.5) if (!ravine(z)) path.push({ z, h: festlandHeight(pathX(z), z) });
  const hs = path.map(p => p.h);
  assert.ok(Math.max(...hs) - Math.min(...hs) > 6, 'the path climbs and falls by metres');
  let turns = 0;
  for (let i = 2; i < path.length; i++) if (Math.sign(hs[i] - hs[i - 1]) * Math.sign(hs[i - 1] - hs[i - 2]) < 0) turns++;
  assert.ok(turns >= 6, `only ${turns} crests and dips along the path`);
  for (let i = 1; i < path.length; i++) {
    if (path[i - 1].z - path[i].z > 0.6) continue;
    assert.ok(Math.abs(hs[i] - hs[i - 1]) / 0.5 < 0.35, `the path is too steep at z=${path[i].z}`);
  }
  // Across the whole valley floor: continuous, and nowhere a wall (only the ravines drop away).
  for (let z = 25; z > ZONES.bank; z -= 1.7) {
    const { c, w } = corridor(z);
    for (let x = c - w + 1.5; x < c + w - 1.5; x += 1.3) {
      if (RAVINES.some(r => z < r.z0 + 1 && z > r.z1 - 1)) continue;
      const h = festlandHeight(x, z), dx = festlandHeight(x + 0.1, z) - h, dz = festlandHeight(x, z - 0.1) - h;
      assert.ok(Math.hypot(dx, dz) / 0.1 < 1.1, `a wall inside the valley at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
  // Past the edge the ground rises into walls and mountains.
  for (let z = 20; z > ZONES.bank; z -= 10) {
    const { c, w } = corridor(z);
    for (const side of [-1, 1]) {
      const foot = festlandHeight(c + side * w, z);
      assert.ok(festlandHeight(c + side * (w + 5), z) - foot > 6, `no wall beside the valley at z=${z}`);
      assert.ok(festlandHeight(c + side * (w + 40), z) - foot > 20, `no mountains beyond it at z=${z}`);
    }
  }
  assert.ok(festlandHeight(0, 45) - festlandHeight(0, 20) > 10, 'a wall behind the landing place');
});

test('the valley\'s edges cannot be passed, not by running, jumping or bouncing', () => {
  const { level, colliders } = solidLevel();
  const tries = [];
  for (const z of [-10, -60, -110, -160, -240, -320]) {
    const { c, w } = corridor(z);
    for (const side of [-1, 1]) tries.push([c + side * (w - 3), z, c + side * (w + 30), z]);
  }
  tries.push([0, 20, 0, 80], [0, ZONES.bank, 0, ZONES.river - 40]);
  for (const [x0, z0, x1, z1] of tries) {
    for (const jump of [0, 19]) {
      let furthest = -Infinity, lowest = Infinity;
      runToward(level, colliders, body(level, x0, z0), x1, z1, 5, { jump, each: (b) => {
        const { x, z } = landXZ(b.pos.clone().sub(level.land.center).normalize());
        furthest = Math.max(furthest, beyondEdge(x, z), z < ZONES.river - 9 && z > ZONES.arena + 60 ? 99 : -99);
        lowest = Math.min(lowest, heightAbove(b.pos, level.land));
      } });
      assert.ok(furthest < 0.3, `got ${furthest.toFixed(2)} m past the edge from (${x0.toFixed(0)}, ${z0}) jumping ${jump}`);
      assert.ok(lowest > -0.05, 'never inside the ground');
    }
  }
  // The crater: Glutzahn's bowl is closed too.
  let reach = 0;
  runToward(level, colliders, body(level, 0, ZONES.arena + 10), 0, ZONES.arena + 60, 5, { jump: 19, each: (b) => {
    reach = Math.max(reach, Math.hypot(b.pos.x, b.pos.z - ZONES.arena));
  } });
  assert.ok(reach < 23, `left the crater: ${reach.toFixed(1)} m out`);
});

test('running the path is smooth: no falling through, no jitter, no climbing out of a ravine', () => {
  const { level, colliders } = solidLevel();
  const b = body(level, 0, -2);
  let air = 0, steps = 0, worst = 0;
  for (const target of level.route.filter(p => p.z > RAVINES[0].z0 + 2)) {
    runToward(level, colliders, b, target.x, target.z, 1.6, { each: (bb) => {
      steps++;
      if (!bb.onGround) air++;
      worst = Math.min(worst, heightAbove(bb.pos, level.land));
    } });
  }
  const { z } = landXZ(b.pos.clone().sub(level.land.center).normalize());
  assert.ok(z < level.route.filter(p => p.z > RAVINES[0].z0 + 2).at(-1).z + 1, `stuck at z=${z.toFixed(1)}`);
  assert.ok(worst > -0.02, `sank ${worst} m into the ground`);
  assert.ok(air / steps < 0.02, `off the ground ${(100 * air / steps).toFixed(1)}% of the run`);
  // Down in a ravine, running at the far wall does not lift Mirio out.
  const r = RAVINES[0], pit = body(level, 0, (r.z0 + r.z1) / 2);
  runToward(level, colliders, pit, 0, r.z1 - 20, 3);
  assert.ok(heightAbove(pit.pos, level.land) < 0.1 && pit.pos.distanceTo(level.land.center) - level.land.radius < rimHeight(0, r.z1) - RAVINE.depth + 1.5, 'climbed a ravine wall');
});

test('everything stands on the ground: level pads, nothing floating or sunk', () => {
  const level = makeVolcanoLevel();
  const flat = (x, z, r, what) => {
    const h0 = festlandHeight(x, z);
    for (let a = 0; a < 6.28; a += 0.5) assert.ok(Math.abs(festlandHeight(x + Math.cos(a) * r, z + Math.sin(a) * r) - h0) < 0.12, `${what} at (${x}, ${z}) stands on a slope`);
  };
  const at = (item) => landXZ(item.dir);
  // Out in the dunes cacti and rocks stand as deep as the lowest ground under them.
  for (const k of [...level.cacti, ...level.rocks]) assert.ok(plantedDepth(k.x, k.z, 1.1 * k.scale) < 0.8 * k.scale, 'a cactus or rock on a cliff');
  for (const f of level.fallen) flat(f.x, f.z, f.length / 2, 'a fallen trunk');
  for (const [what, list, r] of [['a flag', level.flags, 1], ['a spring', level.springs, 1], ['a stump', level.stumps, 1.2], ['a Schnappblume', level.plants, 0.8]]) {
    for (const item of list.filter(i => i.planet === level.land)) { const { x, z } = at(item); flat(x, z, r, what); }
  }
  flat(0, 0, 4, 'the rocket');
  for (const b of level.bits.filter(b => b.planet === level.land)) assert.ok(heightAbove(b.pos, level.land) > 0.9, 'a gem sunk into a hill');
  for (const b of level.blocks.filter(b => b.planet === level.land)) {
    const { x, z } = at(b), rim = rimHeight(x, z) - festlandHeight(x, z);
    assert.ok(b.bottom > rim + 0.4, 'a platform sits in the ground or below the rim');
  }
  for (const t of level.forest) assert.ok(Number.isFinite(festlandHeight(t.x, t.z)));
  for (const p of level.route) assert.ok(Math.abs(p.h - rimHeight(p.x, p.z)) < 1e-9, 'Damai runs on the ground');
  assert.ok(level.forest.filter(t => t.solid).every(t => Math.abs(t.x - pathX(t.z)) > 4.2), 'the path stays clear of trunks');
});

test('the forest: every ravine has platforms one jump apart, Damai hops each, the Glutbeere is reachable', () => {
  const level = makeVolcanoLevel();
  const R = level.land.radius;
  for (const r of RAVINES) {
    // Heights above the sphere, so rims and platforms compare directly.
    const tops = level.blocks.filter(b => b.planet === level.land && b.dir.z / b.dir.y * R < r.z0 && b.dir.z / b.dir.y * R > r.z1)
      .map(b => { const { x, z } = landXZ(b.dir); return { z, top: festlandHeight(x, z) + b.top }; }).sort((a, b) => b.z - a.z);
    assert.ok(tops.length >= 2, 'platforms across each ravine');
    const edges = [{ z: r.z0, top: rimHeight(0, r.z0) }, ...tops, { z: r.z1, top: rimHeight(0, r.z1) }];
    for (let i = 1; i < edges.length; i++) {
      assert.ok(edges[i - 1].z - edges[i].z <= 5.5, 'each gap is one jump wide');
      assert.ok(edges[i].top - edges[i - 1].top <= 2.6, 'each step up is one jump high');
    }
    assert.ok(rimHeight(0, (r.z0 + r.z1) / 2) - festlandHeight(0, (r.z0 + r.z1) / 2) > RAVINE.depth - 0.5, 'a real chasm');
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
  assert.ok(level.forest.filter(t => t.solid).length > 150, 'a real forest');
});
