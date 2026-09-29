// Mirio: the Vulkanreise, as plain data.
//
// It starts on the Startstern, a tiny planet in the sky: a few steps to
// Miro's rocket, which flies down to the Festland. The Festland is a planet
// so big (radius 20 km) that it is flat to the eye, so Mirio's round-planet
// physics (world.js) carries it unchanged. On it the route runs along -z:
//
//   the desert, where Damai the pug joins → the forest, with three ravines to
//   cross on floating platforms, Grummel, Schnappblumen, spring flowers and
//   the Glutbeere → the river bank and the log → the river ride
//   (river-rules.js) → over the waterfall → dark → the Glutkessel, a wide
//   crater where Glutzahn waits.
//
// Near the landing point the Festland's surface is the plane y = 0: local
// (x, h, z) maps to world (x, h, z), bending away by x² + z² over 2R: under
// 3 cm across any 100 m, 20 m down at the Glutkessel, 900 m out. Mirio's
// "up" follows the sphere, so it always looks flat.

import { Vector3 } from 'three';
import { bezier, dirFromLatLon, surfacePoint, tangentDir } from './world.js';

export const FESTLAND_RADIUS = 20000;
const FESTLAND_CENTER = new Vector3(0, -FESTLAND_RADIUS, 0);
const START_RADIUS = 7;

/** Direction from the Festland's centre to local ground point (x, z). */
export function landDir(x, z) {
  return new Vector3(x, FESTLAND_RADIUS, z).normalize();
}

/** World position `h` above the Festland at local (x, z). */
export function landPoint(x, z, h = 0, out = new Vector3()) {
  return out.copy(FESTLAND_CENTER).addScaledVector(landDir(x, z), FESTLAND_RADIUS + h);
}

// Where each part of the Festland lies along -z (metres from the landing point).
export const ZONES = Object.freeze({
  desertEnd: -120,
  forestEnd: -335,
  bank: -345,
  river: -352,
  arena: -900,
});
// The forest's ravines: stepping in means a fall; floating platforms cross them.
export const RAVINES = Object.freeze([
  { z0: -158, z1: -168 },
  { z0: -212, z1: -224 },
  { z0: -276, z1: -290 },
]);
const ARENA = { radius: 16, top: 0.3 };

function planet(id, name, center, radius, gravityRadius, look, extra = {}) {
  return { id, name, center, radius, gravityRadius, look, ...extra };
}

export function makeVolcanoLevel() {
  const land = planet('festland', 'Festland', FESTLAND_CENTER.clone(), FESTLAND_RADIUS, FESTLAND_RADIUS + 400, 'ember');
  const start = planet('startstern', 'Startstern', new Vector3(0, 48, 26), START_RADIUS, START_RADIUS + 9, 'gold', { gravityScale: 0.8 });

  const bits = [], trees = [], stumps = [], stones = [], blocks = [], bumps = [], flags = [];
  const walkers = [], plants = [], powerups = [], springs = [], cacti = [], rocks = [];
  const arenaWalkers = [], arenaPlants = [];
  const S = (lat, lon) => dirFromLatLon(lat, lon);
  const L = landDir;
  const bit = (p, dir, height = 1) => bits.push({ planet: p, pos: surfacePoint(p, dir, height) });
  const block = (p, dir, top, { size = 2.6, bottom = -0.6 } = {}) => blocks.push({
    planet: p, dir, top, bottom, size,
    forward: tangentDir(new Vector3(0, 0, -1), dir) ?? tangentDir(new Vector3(1, 0, 0), dir),
  });
  const walker = (list, dir, kind = 'grummel') => list.push({ id: `${kind}-${walkers.length + arenaWalkers.length + 1}`, kind, planet: land, dir,
    name: kind === 'grummel' ? 'Grummel' : 'Grummelchen', color: kind === 'grummel' ? 0xc0782e : 0xe8b33a });
  const plant = (list, dir) => list.push({ id: `schnappblume-${plants.length + arenaPlants.length + 1}`, planet: land, dir });

  // --- The Startstern: a few steps to the rocket -------------------------
  for (const lon of [0, 90, 180, 270]) trees.push({ planet: start, dir: S(40, lon + 45), scale: 0.7 });
  for (const lat of [70, 55]) bit(start, S(lat, 0));
  const plateau = { planet: start, dir: S(20, 0), radius: 2.6, top: 0.8 };

  // --- The rocket flight down to the Festland --------------------------------
  const launchUp = plateau.dir.clone();
  const p0 = surfacePoint(start, launchUp, plateau.top);
  const p1 = p0.clone().addScaledVector(launchUp, 18);
  const landing = L(0, 0);
  const p3 = landPoint(0, 0);
  const p2 = landPoint(0, 0, 22);
  const rocket = { planet: start, dir: launchUp, height: plateau.top, to: land, flight: { p0, p1, p2, p3, landing } };

  // --- The desert: sand, cacti, a few gems; Damai waits by the rock --------
  for (const z of [-12, -20, -28]) bits.push({ planet: land, pos: landPoint(0, z, 1) });
  for (const [x, z, s] of [[-9, -18, 1], [11, -34, 1.3], [-14, -55, 0.9], [8, -70, 1.1], [-7, -92, 1.4], [13, -104, 0.9], [-20, -40, 1.2], [22, -80, 1]]) cacti.push({ x, z, scale: s });
  for (const [x, z, s] of [[5, -40, 1.6], [-4, -62, 1], [3, -85, 1.3]]) rocks.push({ x, z, scale: s });
  for (const z of [-48, -54, -60, -76, -82]) bits.push({ planet: land, pos: landPoint(z % 2 ? 1.5 : -1.5, z, 1) });
  flags.push({ planet: land, dir: L(3, -8) });

  // --- The forest: trees on both sides, ravines, platforms, creatures ------
  flags.push({ planet: land, dir: L(3, -128) });
  for (let z = ZONES.desertEnd - 6; z > ZONES.forestEnd; z -= 9) {
    for (const side of [-1, 1]) {
      const x = side * (9 + ((z * 7) % 5 + 5) % 5 * 2.2);
      if (!RAVINES.some(r => z < r.z0 + 3 && z > r.z1 - 3)) trees.push({ planet: land, dir: L(x, z), scale: 1.1 + ((z * 13) % 3 + 3) % 3 * 0.2 });
    }
  }
  // Across each ravine: floating platforms, a little higher each time.
  for (const [i, r] of RAVINES.entries()) {
    const span = r.z0 - r.z1, n = Math.max(2, Math.round(span / 4));
    for (let k = 0; k < n; k++) {
      const z = r.z0 - (k + 0.5) * span / n, top = 1.4 + i * 0.4 + (k % 2) * 0.5;
      block(land, L((k % 2 ? 1 : -1) * 1.2, z), top, { bottom: top - 0.7, size: 2.8 });
      bit(land, L((k % 2 ? 1 : -1) * 1.2, z), top + 1);
    }
  }
  flags.push({ planet: land, dir: L(3, -230) });
  // Spring flowers: bounce up to gems and the Glutbeere's platform.
  for (const [x, z] of [[-4, -185], [4, -245], [-3, -300]]) springs.push({ planet: land, dir: L(x, z) });
  for (const [x, z] of [[-4, -185], [4, -245], [-3, -300]]) for (const h of [4, 5.5, 7]) bits.push({ planet: land, pos: landPoint(x, z, h) });
  block(land, L(4, -196), 3.4, { bottom: 2.7, size: 3 });
  powerups.push({ id: 'glutbeere-1', planet: land, dir: L(4, -196), height: 4.4 });
  for (const [x, z, k] of [[3, -140, 'grummel'], [-4, -176, 'grummelchen'], [2, -202, 'grummel'], [-3, -256, 'grummel'], [4, -310, 'grummelchen']]) walker(walkers, L(x, z), k);
  for (const [x, z] of [[-5, -148], [5, -236], [-5, -266], [5, -318]]) plant(plants, L(x, z));
  for (const [x, z, h] of [[-2, -132, 2.2], [2, -300, 2.6]]) { stumps.push({ planet: land, dir: L(x, z), height: h }); bit(land, L(x, z), h + 1.1); }
  flags.push({ planet: land, dir: L(3, -336) });

  // --- The Glutkessel: Glutzahn's crater, and who joins him ---------------
  const arenaDir = L(0, ZONES.arena);
  const arena = { planet: land, dir: arenaDir, radius: ARENA.radius, top: ARENA.top, facing: new Vector3(0, 0, -1) };
  for (const [x, z, k] of [[-9, -7, 'grummel'], [9, -7, 'grummelchen'], [-9, 7, 'grummelchen'], [9, 7, 'grummel']]) walker(arenaWalkers, L(x, ZONES.arena + z), k);
  for (const [x, z] of [[0, -11], [0, 11], [-11, 0], [11, 0]]) plant(arenaPlants, L(x, ZONES.arena + z));
  for (let a = 0; a < 6; a++) bit(land, L(Math.cos(a) * 12, ZONES.arena + Math.sin(a) * 12), ARENA.top + 1);

  // Damai's route: from where he waits in the desert to the log.
  const route = [];
  const point = (x, z, h = 0, hop = false) => {
    const last = route.at(-1);
    const s = last ? last.s + Math.hypot(x - last.x, z - last.z) : 0;
    route.push({ s, x, z, h, ...(hop ? { hop: true } : {}) });
  };
  point(2, -16);
  for (let z = -30; z > ZONES.forestEnd; z -= 10) {
    const r = RAVINES.find(r => z <= r.z0 + 1 && z >= r.z1 - 1);
    if (r) continue;
    const next = RAVINES.find(r => z > r.z0 && z - 10 <= r.z0 + 1);
    point(Math.sin(z * 0.05) * 1.5, z);
    if (next) { point(0, next.z0 + 1, 0, true); point(0, next.z1 - 1); }
  }
  point(0, ZONES.bank);

  return {
    id: 'volcano',
    planets: [start, land],
    start, land,
    spawn: { planet: start, dir: S(80, 180) },
    landing: { planet: land, dir: L(0, -2) },
    bits, trees, stumps, stones, blocks, bumps, flags,
    walkers, plants, powerups, springs, cacti, rocks, arenaWalkers, arenaPlants,
    plateau, rocket, arena, route,
    log: { x: 0, z: ZONES.river },
    wake: { planet: land, dir: L(0, ZONES.arena + ARENA.radius - 3) },
    goal: { planet: land, dir: arenaDir, height: 6 },
  };
}

/** The rocket's flight curve at `t` in 0..1. */
export function volcanoFlightPoint(level, t, out = new Vector3()) {
  const { p0, p1, p2, p3 } = level.rocket.flight;
  return bezier(p0, p1, p2, p3, t, out);
}

export const VOLCANO_ARENA = ARENA;
