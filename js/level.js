// Mirio: the level, as plain data.
//
// One big world and a moon. The route runs down the world's 0° meridian
// from the north pole:
//
//   start meadow → tree-stump steps → flag → the ring lake (stepping stones; the
//   lake circles the whole world, so there is no way round) → flag → hills
//   and a block tower → flag → stairs up to the launch plateau → Miro's
//   rocket → the moon (low gravity, Miro's floor) → a staircase of floor
//   blocks up to a floating arena, where Finster-Mirio guards the star
//   (boss.js).
//
// The far side of the world holds an easier lake crossing and extra star
// bits for explorers.

import { Vector3 } from 'three';
import { bezier, dirFromLatLon, surfacePoint, tangentDir } from './world.js';
import { addDiscovery } from './discovery-level.js';

const WORLD_RADIUS = 26;
const MOON_RADIUS = 11;
// The floating boss arena on the moon's far side: a disc of Miro's floor.
const ARENA = { radius: 6.5, top: 9.6, thickness: 1.0 };
// Where the Zielplanet sits relative to the arena: ahead and below, so the
// kart race runs downhill.
const RACE = { ahead: 60, drop: 28, radius: 14 };

function planet(id, name, center, radius, gravityRadius, look, extra = {}) {
  return { id, name, center, radius, gravityRadius, look, ...extra };
}

/** `center` moved `angle` radians along the surface, at compass bearing `deg`. */
function offset(center, deg, angle) {
  const east = tangentDir(new Vector3(0, 0, 1), center) ?? new Vector3(1, 0, 0);
  const north = new Vector3().crossVectors(center, east).normalize();
  const b = (deg * Math.PI) / 180;
  const dir = east.multiplyScalar(Math.cos(b)).addScaledVector(north, Math.sin(b));
  return center.clone().multiplyScalar(Math.cos(angle)).addScaledVector(dir, Math.sin(angle)).normalize();
}

export function makeLevel() {
  const welt = planet('welt', 'Wiesenwelt', new Vector3(0, 0, 0), WORLD_RADIUS, WORLD_RADIUS + 20, 'grass', {
    water: { minLat: 36, maxLat: 56 },
  });
  // The moon's gravity reaches far enough to pull Mirio back down from the
  // boss's cap, high above the arena.
  const mond = planet('mond', 'Miros Mond', dirFromLatLon(45, 20).multiplyScalar(67), MOON_RADIUS, MOON_RADIUS + 26, 'floor', {
    gravityScale: 0.6,
  });

  const bits = [];
  const trees = [];
  const stumps = [];
  const stones = [];
  const blocks = [];
  const bumps = [];
  const flags = [];
  const W = (lat, lon) => dirFromLatLon(lat, lon);
  const bit = (p, dir, height = 1) => bits.push({ planet: p, pos: surfacePoint(p, dir, height) });
  const stump = (p, dir, height) => stumps.push({ planet: p, dir, height });
  const tree = (p, dir, scale = 1) => trees.push({ planet: p, dir, scale });
  // A block of Miro's floor. Without `bottom` it stands on the ground.
  const block = (p, dir, top, { size = 2.4, bottom = -0.6, facing = new Vector3(0, 1, 0) } = {}) => blocks.push({
    planet: p, dir, top, bottom, size,
    forward: tangentDir(facing, dir) ?? tangentDir(new Vector3(1, 0, 0), dir),
  });
  const bump = (p, dir, radius, height) => bumps.push({ planet: p, dir, radius, height });

  // --- 1. Start meadow and tree-stump steps ------------------------------------
  for (const lat of [86.5, 83, 79.5]) bit(welt, W(lat, 0));
  // None close behind the start: the camera waits there.
  for (const [lat, lon] of [[80, 100], [66, 200], [68, 300], [70, 150], [68, 230], [74, 45], [72, -40]]) tree(welt, W(lat, lon));
  for (const [lat, h] of [[76, 1.2], [70.5, 2.0], [65, 2.8]]) {
    stump(welt, W(lat, 0), h);
    bit(welt, W(lat, 0), h + 1.1);
  }
  block(welt, W(59.5, 0), 4.0, { bottom: 3.4, size: 3 });
  for (const lon of [-2.5, 0, 2.5]) bit(welt, W(59.5, lon), 5.0);
  flags.push({ planet: welt, dir: W(57.5, 5) });

  // --- 2. The ring lake: two stepping stones on the route ---------------
  for (const [lat, lon] of [[51, 0], [42, 1]]) stones.push({ planet: welt, dir: W(lat, lon), radius: 1.0, top: 0.7 });
  for (const lat of [53.5, 46.5, 39]) bit(welt, W(lat, 0.5), 2.4);
  // The easy crossing on the far side: stones close enough to walk.
  for (const lat of [53, 47.5, 42, 37.5]) stones.push({ planet: welt, dir: W(lat, 180), radius: 1.3, top: 0.5 });
  flags.push({ planet: welt, dir: W(33, 5) });

  // --- 3. Hills and the block tower --------------------------------------
  bump(welt, W(27, -5), 7, 2.2);
  bump(welt, W(15, 6), 8, 3.0);
  bump(welt, W(3, -6), 6, 2.0);
  bit(welt, W(27, -5), 3.2);
  bit(welt, W(15, 6), 4.0);
  bit(welt, W(3, -6), 3.0);
  for (const [lat, lon] of [[21, 0], [9, 0], [-3, -2]]) bit(welt, W(lat, lon), 3.4);
  for (const [lat, lon] of [[25, 22], [18, -24], [8, 24], [-2, 16], [-6, -18], [31, -26], [12, -30]]) tree(welt, W(lat, lon));
  for (const [i, lat] of [20, 16.5, 13, 9.5].entries()) block(welt, W(lat, 30), 1.3 * (i + 1), { size: 2.2 });
  for (const [lat, lon] of [[9.5, 30], [9.5, 31.8], [9.5, 28.2], [11, 30], [8, 30]]) bit(welt, W(lat, lon), 6.3);
  flags.push({ planet: welt, dir: W(-10, 5) });

  // --- 4. Stump garden, stairs and the launch plateau ----------------------
  for (const [lat, lon, h] of [[-15, -12, 1.6], [-18, 14, 2.4], [-13, 20, 1.0]]) {
    stump(welt, W(lat, lon), h);
    bit(welt, W(lat, lon), h + 1.1);
  }
  for (const lat of [-14, -17, -20]) bit(welt, W(lat, 0));
  block(welt, W(-23, 0), 1.0, { size: 2.8 });
  block(welt, W(-29.2, 0), 2.0, { size: 2.8 });
  bit(welt, W(-23, 0), 2.0);
  bit(welt, W(-29.2, 0), 3.0);
  const plateau = { planet: welt, dir: W(-45, 0), radius: 6, top: 3.0 };
  for (let deg = 0; deg < 360; deg += 45) bit(welt, offset(plateau.dir, deg, 3.8 / WORLD_RADIUS), plateau.top + 1);

  // --- The far side, for explorers -----------------------------------------
  tree(welt, W(70, 180), 1.6);
  for (let lon = 150; lon <= 210; lon += 10) bit(welt, W(64, lon));
  for (const [lat, lon] of [[20, 170], [10, 190], [0, 175], [-20, 200], [-35, 160], [25, 120], [-25, 240]]) tree(welt, W(lat, lon));
  stump(welt, W(-70, 180), 4.0);
  for (const h of [5.1, 6.3, 7.5]) bit(welt, W(-70, 180), h);
  for (const lat of [55, 50, 45, 40]) bit(welt, W(lat, 180), 1.8);

  // --- The rocket flight -----------------------------------------------------
  // Out from the plateau, round the world and onto the moon, landing on the
  // side the rocket arrives from, so the curve stays clear of both.
  const launchUp = plateau.dir.clone();
  const p0 = surfacePoint(welt, launchUp, plateau.top);
  const p1 = p0.clone().addScaledVector(launchUp, 28);
  const landing = new Vector3().subVectors(p1, mond.center).normalize();
  const p3 = surfacePoint(mond, landing, 0);
  const p2 = p3.clone().addScaledVector(landing, 14);
  const rocket = { planet: welt, dir: launchUp, height: plateau.top, to: mond, flight: { p0, p1, p2, p3, landing } };

  // --- 5. Miros Mond: walk round to the far side and climb to the star ----
  // The moon's route is a half great circle from the landing spot (t = 0) to
  // the opposite side (t = 1); `side` steps off it.
  const L = landing;
  const Q = tangentDir(new Vector3(0, 0, 1), L) ?? tangentDir(new Vector3(1, 0, 0), L);
  const S = new Vector3().crossVectors(L, Q).normalize();
  const route = (t, side = 0) => L.clone().multiplyScalar(Math.cos(Math.PI * t))
    .addScaledVector(Q, Math.sin(Math.PI * t)).addScaledVector(S, side).normalize();

  for (const t of [0.12, 0.17, 0.22, 0.27, 0.32]) bit(mond, route(t), 1.2);
  for (const t of [0.2, 0.3]) bit(mond, route(t), 3.2);
  bump(mond, route(0.22, 0.32), 3, 1.0);
  bump(mond, route(0.38, -0.2), 4, 1.5);
  bump(mond, route(0.46, 0.25), 3, 1.2);
  bit(mond, route(0.38, -0.2), 2.5);
  bit(mond, route(0.46, 0.25), 2.2);

  // The last step stays outside the arena's footprint (see ARENA below).
  const steps = [[0.56, 0, 1.6], [0.63, 0.08, 3.2], [0.7, -0.08, 4.8], [0.77, 0.08, 6.4], [0.84, -0.06, 8.0]];
  for (const [i, [t, side, top]] of steps.entries()) {
    const d = route(t, side);
    // The first step stands on the ground; the rest float, so you can walk under.
    block(mond, d, top, { bottom: i === 0 ? -0.6 : top - 0.8, facing: route(t + 0.05) });
    bit(mond, d, top + 1.0);
  }
  const goalDir = route(1);
  const arena = { planet: mond, dir: goalDir, radius: ARENA.radius, top: ARENA.top, facing: Q };

  // --- 6. The kart race: from the arena rim down to the Zielplanet ---------
  // After the boss, Mirio jumps into a kart and races downhill to a third
  // planet; kart.js lays the track between these two points. The track leaves
  // the arena on the side facing away from the world.
  const arenaTop = surfacePoint(mond, goalDir, ARENA.top);
  const out = tangentDir(mond.center.clone().sub(welt.center), goalDir) ?? Q.clone();
  const ziel = planet('ziel', 'Zielplanet',
    arenaTop.clone().addScaledVector(out, RACE.ahead).addScaledVector(goalDir, -RACE.drop), RACE.radius, RACE.radius + 12, 'gold');
  const course = {
    start: { pos: arenaTop.clone().addScaledVector(out, ARENA.radius), forward: out.clone(), up: goalDir.clone() },
    finish: { planet: ziel, dir: new Vector3().subVectors(arenaTop, ziel.center).normalize() },
  };
  for (let deg = 0; deg < 360; deg += 60) bit(mond, offset(goalDir, deg, (ARENA.radius - 1) / (MOON_RADIUS + ARENA.top)), ARENA.top + 1);
  for (const t of [0.6, 0.7, 0.8]) bit(mond, route(t, 0.3), 1.2);

  return addDiscovery({
    planets: [welt, mond, ziel],
    spawn: { planet: welt, dir: new Vector3(0, 1, 0) },
    moonSpawn: { planet: mond, dir: route(0.1) },
    bits,
    trees,
    stumps,
    stones,
    blocks,
    bumps,
    flags,
    plateau,
    rocket,
    arena,
    course,
    // Above the boss's head (he is ~6 tall); a held moon jump reaches it.
    goal: { planet: mond, dir: goalDir, height: ARENA.top + 8.3 },
  });
}

/** Every collider, grouped by planet (see collide() in world.js). */
export function collidersFor(level) {
  const byPlanet = new Map(level.planets.map((p) => [p, []]));
  const add = (p, c) => byPlanet.get(p).push(c);
  const cyl = (item, radius, bottom, top) => add(item.planet, {
    kind: 'cyl',
    base: surfacePoint(item.planet, item.dir, bottom),
    axis: item.dir.clone(),
    radius,
    height: top - bottom,
  });

  for (const t of level.trees) cyl(t, 0.8 * t.scale, -0.3, 3.6 * t.scale);
  for (const p of level.stumps) cyl(p, 1.25, -0.3, p.height);
  for (const s of level.stones) cyl(s, s.radius, -0.6, s.top);
  // Deep base: the plateau is flat but the world curves away under its rim.
  cyl(level.plateau, level.plateau.radius, -1.4, level.plateau.top);
  cyl(level.arena, level.arena.radius, level.arena.top - ARENA.thickness, level.arena.top);
  for (const b of level.blocks) {
    add(b.planet, {
      kind: 'box',
      base: surfacePoint(b.planet, b.dir, b.bottom),
      axis: b.dir.clone(),
      forward: b.forward.clone(),
      right: new Vector3().crossVectors(b.forward, b.dir).normalize(),
      halfW: b.size / 2,
      halfD: b.size / 2,
      height: b.top - b.bottom,
    });
  }
  for (const b of level.bumps) {
    add(b.planet, { kind: 'bump', center: surfacePoint(b.planet, b.dir, b.height - b.radius), radius: b.radius });
  }
  return (planet) => (planet ? byPlanet.get(planet) : []);
}

/** The rocket's flight curve at `t` in 0..1. */
export function flightPoint(level, t, out = new Vector3()) {
  const { p0, p1, p2, p3 } = level.rocket.flight;
  return bezier(p0, p1, p2, p3, t, out);
}
