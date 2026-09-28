// Mirio: the Vulkanreise, as plain data, shaped like level.js so the same
// scene builder (scene.js) and physics (world.js) carry it.
//
// The Glutwelt, red earth, is walked down its 0° meridian from the north pole:
//
//   start → stump steps → flag → the Grummel valley → the Glutbeere on its
//   block → the pass of Schnappblumen → flag → block stairs → the launch
//   plateau → Miro's rocket → the Aschemond (low gravity, dark ash) → round
//   to its far side and up a staircase to the arena, where Glutzahn keeps
//   the crystal.
//
// Creatures and the power-up are placed here too; volcano-run.js brings them
// to life.

import { Vector3 } from 'three';
import { bezier, dirFromLatLon, surfacePoint, tangentDir } from './world.js';

const WORLD_RADIUS = 22;
const MOON_RADIUS = 10;
const ARENA = { radius: 7, top: 8.2, thickness: 1.0 };

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

export const VOLCANO_ARENA = ARENA;

export function makeVolcanoLevel() {
  const welt = planet('glutwelt', 'Glutwelt', new Vector3(0, 0, 0), WORLD_RADIUS, WORLD_RADIUS + 18, 'ember');
  const mond = planet('aschemond', 'Aschemond', dirFromLatLon(40, 25).multiplyScalar(56), MOON_RADIUS, MOON_RADIUS + 22, 'ash', {
    gravityScale: 0.65,
  });

  const bits = [], trees = [], stumps = [], stones = [], blocks = [], bumps = [], flags = [];
  const walkers = [], plants = [], powerups = [];
  const W = (lat, lon) => dirFromLatLon(lat, lon);
  const bit = (p, dir, height = 1) => bits.push({ planet: p, pos: surfacePoint(p, dir, height) });
  const stump = (p, dir, height) => stumps.push({ planet: p, dir, height });
  const tree = (p, dir, scale = 1) => trees.push({ planet: p, dir, scale });
  const block = (p, dir, top, { size = 2.4, bottom = -0.6, facing = new Vector3(0, 1, 0) } = {}) => blocks.push({
    planet: p, dir, top, bottom, size,
    forward: tangentDir(facing, dir) ?? tangentDir(new Vector3(1, 0, 0), dir),
  });
  const bump = (p, dir, radius, height) => bumps.push({ planet: p, dir, radius, height });
  const walker = (p, dir, kind = 'grummel') => walkers.push({ id: `${kind}-${walkers.length + 1}`, kind, planet: p, dir,
    name: kind === 'grummel' ? 'Grummel' : 'Grummelchen', color: kind === 'grummel' ? 0xc0782e : 0xe8b33a });
  const plant = (p, dir) => plants.push({ id: `schnappblume-${plants.length + 1}`, planet: p, dir });

  // --- 1. Start and stump steps -------------------------------------------
  for (const lat of [86, 82]) bit(welt, W(lat, 0));
  for (const [lat, lon] of [[80, 110], [70, 160], [72, 250], [74, 50], [70, -45]]) tree(welt, W(lat, lon));
  for (const [lat, h] of [[76, 1.2], [71, 2.0], [66, 2.8]]) {
    stump(welt, W(lat, 0), h);
    bit(welt, W(lat, 0), h + 1.1);
  }
  flags.push({ planet: welt, dir: W(61, 5) });

  // --- 2. The Grummel valley: two big, one small, with gems to dodge for --
  bump(welt, W(52, -12), 6, 1.8);
  bump(welt, W(47, 14), 6, 2.2);
  for (const [lat, lon] of [[54, 3], [48, -3], [42, 2]]) bit(welt, W(lat, lon), 1.2);
  bit(welt, W(52, -12), 2.8);
  bit(welt, W(47, 14), 3.2);
  walker(welt, W(53, 6));
  walker(welt, W(45, -6));
  walker(welt, W(40, 8), 'grummelchen');

  // --- 3. The Glutbeere on its block: Mirio grows into Miro's big Mirio ----
  block(welt, W(35, 0), 2.2, { size: 2.6 });
  block(welt, W(35, 5.5), 1.1, { size: 2.2 });
  powerups.push({ id: 'glutbeere-1', planet: welt, dir: W(35, 0), height: 3.2 });

  // --- 4. The pass of Schnappblumen, in pots along both sides --------------
  for (const [lat, lon] of [[29, -5], [25, 5], [21, -5], [17, 5]]) plant(welt, W(lat, lon));
  for (const lat of [28, 24, 20, 16]) bit(welt, W(lat, 0), 1.2);
  for (const [lat, lon] of [[27, -16], [19, 16], [23, 22], [15, -20]]) tree(welt, W(lat, lon));
  flags.push({ planet: welt, dir: W(10, 5) });

  // --- 5. Block stairs and the launch plateau ------------------------------
  for (const [i, lat] of [0, -4, -8, -12].entries()) {
    block(welt, W(lat, 0), 1.2 * (i + 1), { size: 2.6 });
    bit(welt, W(lat, 0), 1.2 * (i + 1) + 1);
  }
  walker(welt, W(-2, 14));
  const plateau = { planet: welt, dir: W(-30, 0), radius: 5.5, top: 2.6 };
  for (let deg = 0; deg < 360; deg += 60) bit(welt, offset(plateau.dir, deg, 3.4 / WORLD_RADIUS), plateau.top + 1);

  // --- The far side, for explorers -----------------------------------------
  for (const [lat, lon] of [[20, 170], [0, 190], [-25, 160], [30, 120], [-15, 230]]) tree(welt, W(lat, lon));
  stump(welt, W(-65, 180), 3.6);
  for (const h of [4.7, 5.9]) bit(welt, W(-65, 180), h);
  walker(welt, W(-45, 150), 'grummelchen');

  // --- The rocket flight -----------------------------------------------------
  const launchUp = plateau.dir.clone();
  const p0 = surfacePoint(welt, launchUp, plateau.top);
  const p1 = p0.clone().addScaledVector(launchUp, 24);
  const landing = new Vector3().subVectors(p1, mond.center).normalize();
  const p3 = surfacePoint(mond, landing, 0);
  const p2 = p3.clone().addScaledVector(landing, 12);
  const rocket = { planet: welt, dir: launchUp, height: plateau.top, to: mond, flight: { p0, p1, p2, p3, landing } };

  // --- 6. The Aschemond: round to the far side and up to Glutzahn ----------
  const L = landing;
  const Q = tangentDir(new Vector3(0, 0, 1), L) ?? tangentDir(new Vector3(1, 0, 0), L);
  const S = new Vector3().crossVectors(L, Q).normalize();
  const route = (t, side = 0) => L.clone().multiplyScalar(Math.cos(Math.PI * t))
    .addScaledVector(Q, Math.sin(Math.PI * t)).addScaledVector(S, side).normalize();

  for (const t of [0.12, 0.18, 0.24, 0.3]) bit(mond, route(t), 1.2);
  bump(mond, route(0.25, 0.3), 3, 1.1);
  bump(mond, route(0.4, -0.25), 3.5, 1.4);
  bit(mond, route(0.4, -0.25), 2.6);
  walker(mond, route(0.3, -0.12), 'grummelchen');
  walker(mond, route(0.42, 0.14));
  plant(mond, route(0.36, 0.2));
  plant(mond, route(0.48, -0.16));
  flags.push({ planet: mond, dir: route(0.5, 0.2) });

  // Floating steps of ash up to the arena; the first stands on the ground.
  const steps = [[0.58, 0, 1.5], [0.65, 0.08, 3.0], [0.72, -0.08, 4.5], [0.79, 0.08, 6.0], [0.85, -0.05, 7.4]];
  for (const [i, [t, side, top]] of steps.entries()) {
    const d = route(t, side);
    block(mond, d, top, { bottom: i === 0 ? -0.6 : top - 0.8, facing: route(t + 0.05) });
    bit(mond, d, top + 1.0);
  }
  const goalDir = route(1);
  const arena = { planet: mond, dir: goalDir, radius: ARENA.radius, top: ARENA.top, facing: Q };
  for (let deg = 0; deg < 360; deg += 60) bit(mond, offset(goalDir, deg, (ARENA.radius - 1) / (MOON_RADIUS + ARENA.top)), ARENA.top + 1);

  return {
    id: 'volcano',
    planets: [welt, mond],
    spawn: { planet: welt, dir: new Vector3(0, 1, 0) },
    moonSpawn: { planet: mond, dir: route(0.1) },
    bits, trees, stumps, stones, blocks, bumps, flags,
    walkers, plants, powerups,
    plateau,
    rocket,
    arena,
    // Above Glutzahn's head; a held moon jump reaches it once he is beaten.
    goal: { planet: mond, dir: goalDir, height: ARENA.top + 6.5 },
  };
}

/** The rocket's flight curve at `t` in 0..1. */
export function volcanoFlightPoint(level, t, out = new Vector3()) {
  const { p0, p1, p2, p3 } = level.rocket.flight;
  return bezier(p0, p1, p2, p3, t, out);
}
