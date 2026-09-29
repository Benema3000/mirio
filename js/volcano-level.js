// Mirio: the Vulkanreise, as plain data.
//
// It starts on the Startstern, a tiny planet in the sky: a few steps to
// Miro's rocket, which flies down to the Festland. The Festland is a planet
// so big (radius 20 km) that Mirio's round-planet physics (world.js) carries
// it unchanged, with hills on top (`land.heightAt`, see festlandHeight). On
// it the route runs along -z through a valley walled in on both sides:
//
//   the desert, between sandstone mesas with dunes to either side, where
//   Damai the pug joins → the forest, rolling ground under tall trees, three
//   ravines to cross on floating platforms, Grummel, Schnappblumen, spring
//   flowers and the Glutbeere → down to the river bank and the log → the
//   river ride (river-rules.js) through a gorge → over the waterfall → dark →
//   the Glutkessel, a crater where Glutzahn waits.
//
// Local (x, h, z) maps to world (x, h, z) near the landing point, bending
// away by x² + z² over 2R (20 m down at the Glutkessel, 900 m out). Mirio's
// "up" follows the sphere; the hills are a height function on top of it.

import { Vector3 } from 'three';
import { RIVER, makeRiverCourse } from './river-rules.js';
import { RIVER_SCENE } from './river-scene.js';
import { bezier, dirFromLatLon, mulberry32, surfacePoint, tangentDir } from './world.js';

export const FESTLAND_RADIUS = 20000;
const FESTLAND_CENTER = new Vector3(0, -FESTLAND_RADIUS, 0);
const START_RADIUS = 7;

// Where each part of the Festland lies along -z (metres from the landing point).
export const ZONES = Object.freeze({
  desertEnd: -120,
  forestEnd: -335,
  bank: -345,
  river: -352,
  arena: -900,
});
// The forest's ravines: real chasms, crossed on floating platforms.
export const RAVINES = Object.freeze([
  { z0: -158, z1: -168 },
  { z0: -212, z1: -224 },
  { z0: -276, z1: -290 },
]);
const ARENA = { radius: 16, top: 0.3 };

// Things standing on the Festland, as local [x, z, ...].
const CACTI = [[-9, -18, 1], [11, -34, 1.3], [-14, -55, 0.9], [8, -70, 1.1], [-7, -92, 1.4], [13, -104, 0.9], [-20, -40, 1.2], [22, -80, 1],
  [-24, -12, 1.1], [26, -52, 1.2], [-27, -96, 1], [19, -6, 0.9], [-17, -112, 1.2]];
const ROCKS = [[7, -40, 1.6], [-6.5, -62, 1], [7.5, -85, 1.3], [-21, -26, 1.8], [24, -100, 1.5], [16, -20, 1.1]];
const FLAGS = [[3, -8], [3, -128], [3, -230], [3, -336]];
const SPRINGS = [[-4, -185], [4, -245], [-3, -300]];
const STUMPS = [[-2, -132, 2.2], [2, -300, 2.6]];
const PLANTS = [[-5, -148], [5, -236], [-5, -266], [5, -318]];
const WALKERS = [[3, -140, 'grummel'], [-4, -176, 'grummelchen'], [2, -202, 'grummel'], [-3, -256, 'grummel'], [4, -310, 'grummelchen']];
const BERRY = [4, -196];
// Fallen trunks across the forest floor: [x, z, yaw, length].
const FALLEN = [[-9.5, -153, 0.5, 5], [8, -204, -0.35, 6], [-9.5, -259, 0.25, 5], [8.5, -305, 0.6, 4.5], [-11, -236, 1.2, 6], [12, -176, -1, 5.5]];

// ---- The Festland's shape ------------------------------------------------
//
// One height function over local (x, z) feeds both the physics (land.heightAt)
// and the ground mesh (volcano-land.js), so what you see is what you stand on.

const RIVER_COURSE = makeRiverCourse();
/** The waterfall's lip, where the river drops into the valley. */
export const LIP = ZONES.river - RIVER.length;
const DROP = RIVER_SCENE.drop;
// Flat ground either side of the river's centre: water, berm and bank.
const SHORE = RIVER.halfWidth + RIVER_SCENE.edge + RIVER_SCENE.bank + 0.4;
export const RAVINE = Object.freeze({ depth: 9, wall: 1.2 });
// The walls close in behind the start and beyond the crater.
const BACK = 30, END = ZONES.arena - 55;
// The crater: flat round the arena, then a steep rim.
export const CRATER = Object.freeze({ flat: ARENA.radius + 5, rim: ARENA.radius + 14, height: 11 });

// The trail's height along the route, eased between these [z, h] points:
// over dunes, up into the forest, down and up round the ravines (each one
// sits on a point, so its two rims are level), then down to the river.
// Shelves (points) also sit under the flags, stumps, springs and the Glutbeere by the path.
const TRAIL = [[60, 0], [-8, 0], [-36, 3.5], [-60, 1], [-92, 6.5], [-130, 4.2], [-163, 6],
  [-196, 8.2], [-218, 5], [-250, 3], [-283, 6], [-300, 5], [-336, 0]];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Smoothstep from a to b (either order). */
const ease = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function trail(z) {
  if (z >= TRAIL[0][0]) return TRAIL[0][1];
  for (let i = 1; i < TRAIL.length; i++) {
    const [z1, h1] = TRAIL[i];
    if (z < z1) continue;
    const [z0, h0] = TRAIL[i - 1], t = (z0 - z) / (z0 - z1);
    return h0 + (h1 - h0) * (1 - Math.cos(t * Math.PI)) / 2;
  }
  return 0;
}

/** Where Damai's path runs across the forest floor. */
export const pathX = (z) => Math.sin(z * 0.05) * 1.5;

/** The playable valley at `z`: its centre line `c` and half-width `w`. */
export function corridor(z) {
  const desert = ease(-135, -110, z);
  let c = 3 * Math.sin(z / 47), w = 22 + 12 * desert + 2.5 * Math.sin(z / 29);
  const river = ease(-326, -350, z);
  if (river > 0) {
    c += (RIVER_COURSE.center(Math.min(ZONES.river - z, RIVER.length)) - c) * river;
    w += (SHORE + 1.8 - w) * river;
    // Below the waterfall the gorge opens into the Glutkessel's valley.
    const open = ease(LIP - 14, LIP - 70, z);
    c *= 1 - open;
    w += 34 * open;
  }
  return { c, w };
}

/** 0..1 soft noise, for rock ridges and colour. */
export const lumpy = (x, z) => 0.5 + 0.3 * Math.sin(x * 0.071 + z * 0.043) + 0.2 * Math.sin(x * 0.17 - z * 0.11 + 1.7);

/** How far past the valley's edge (x, z) lies, in metres; <= 0 inside. */
export function beyondEdge(x, z) {
  const { c, w } = corridor(z);
  return Math.max(Math.abs(x - c) - w, z - BACK, END - z);
}

/** The walls: a steep face, sandstone mesas in the desert, then mountains. */
function walls(e, x, z) {
  if (e <= 0) return 0;
  const n = lumpy(x, z), desert = ease(-135, -110, z), river = ease(-326, -350, z);
  const face = (9 + 4 * river + 2 * desert) * (0.8 + 0.4 * n) * ease(0, 3.5 + 2 * (1 - desert) * (1 - river), e);
  const mesa = desert * 7 * ease(15 + 6 * n, 18 + 6 * n, e);
  // Far out the ranges grow into peaks, so the valley has a skyline all round.
  const range = (1 - Math.exp(-Math.max(0, e - 4) / 24)) * (16 + 26 * n) * (1 + Math.max(0, e - 60) / 90 * lumpy(x * 0.37 + 90, z * 0.37));
  return face + mesa + range;
}

/** The valley floor: the trail, dunes or a rolling forest floor, river banks, the drop, the crater. */
function valleyFloor(x, z) {
  const { c, w } = corridor(z);
  const across = Math.abs(x - c), land = ease(-345, -318, z), desert = ease(-135, -110, z);
  let h = trail(z);
  if (land > 0) {
    // Calm on the path itself, so its ups and downs come from the trail.
    const calm = 0.25 + 0.75 * ease(2.5, 10, Math.abs(x - pathX(z)));
    const dunes = 2.2 * Math.sin(x * 0.16 + z * 0.07 + 0.6) * Math.sin(z * 0.045 - x * 0.03) + 0.5 * Math.sin(x * 0.37 - z * 0.21);
    const rolls = 1.1 * Math.sin(x * 0.23 + 1.2) * Math.sin(z * 0.17 + x * 0.05) + 0.45 * Math.sin(x * 0.51 + z * 0.43);
    // The valley rises a little toward its walls.
    const bowl = (3.5 * desert + 2 * (1 - desert)) * ease(0.3 * w, w, across) ** 2;
    h += land * (calm * (dunes * desert + rolls * (1 - desert)) + bowl);
  }
  h += (1 - land) * 0.8 * ease(SHORE, w, across);
  h -= DROP * ease(LIP, LIP - 0.6, z);
  const r = Math.hypot(x, z - ZONES.arena);
  if (r < 80) h += CRATER.height * ease(CRATER.flat, CRATER.rim, r) - 5 * ease(CRATER.rim + 4, 70, r);
  return h;
}

// Small level pads under everything that stands on the ground, so nothing
// floats on one side or sinks on the other: [x, z, radius, height].
// The Glutbeere's ledge gets one too, so it floats as high above every side you jump from.
// Cacti and rocks out in the dunes are planted instead (see plantedDepth).
const PADS = [[0, 0, 9], ...FLAGS.map(([x, z]) => [x, z, 1.3]), ...SPRINGS.map(([x, z]) => [x, z, 1.4]), ...STUMPS.map(([x, z]) => [x, z, 1.6]),
  ...PLANTS.map(([x, z]) => [x, z, 1.1]), [...BERRY, 2.5], ...FALLEN.map(([x, z, , len]) => [x, z, len / 2 + 0.6])]
  .map(([x, z, r]) => [x, z, r, valleyFloor(x, z)]);

// The rim round a pad eases back into the slope over a few metres, so the path stays gentle.
const padRim = (r) => 3.5 + 0.5 * r;

// Where pads' rims overlap, the fuller pad dominates (weights k⁴), so each stays level
// and the ground stays continuous.
function padded(x, z, h) {
  let best = 0, sum = 0, level = 0;
  for (const [px, pz, r, ph] of PADS) {
    const dz = z - pz, out = r + padRim(r);
    if (dz > out || dz < -out) continue;
    const k = ease(out, r, Math.hypot(x - px, dz)), w = k ** 4;
    best = Math.max(best, k);
    sum += w;
    level += w * ph;
  }
  return best > 0 ? h + (level / sum - h) * best : h;
}

function pitDepth(x, z) {
  for (const r of RAVINES) {
    if (z > r.z0 || z < r.z1) continue;
    const { c, w } = corridor(z);
    const inside = Math.min(ease(r.z0, r.z0 - RAVINE.wall, z), ease(r.z1, r.z1 + RAVINE.wall, z));
    return RAVINE.depth * inside * (1 - ease(w - 1, w + 8, Math.abs(x - c)));
  }
  return 0;
}

/** Ground height at local (x, z) with the ravines filled in: their rims, and what Damai hops between. */
export function rimHeight(x, z) {
  return padded(x, z, valleyFloor(x, z)) + walls(beyondEdge(x, z), x, z);
}

/** Ground height of the Festland at local (x, z), above its sphere. */
export function festlandHeight(x, z) {
  return rimHeight(x, z) - pitDepth(x, z);
}

/**
 * How far below the ground at (x, z) something `r` wide must stand so that
 * no side of it floats on a slope: the drop to the lowest ground under it.
 */
export function plantedDepth(x, z, r) {
  const h = festlandHeight(x, z);
  let low = h;
  for (let a = 0; a < 8; a++) low = Math.min(low, festlandHeight(x + Math.cos(a * Math.PI / 4) * r, z + Math.sin(a * Math.PI / 4) * r));
  return h - low;
}

/** Direction from the Festland's centre to local ground point (x, z). */
export function landDir(x, z) {
  return new Vector3(x, FESTLAND_RADIUS, z).normalize();
}

/** Local (x, z) of a direction from the Festland's centre. */
export function landXZ(dir) {
  return { x: dir.x / dir.y * FESTLAND_RADIUS, z: dir.z / dir.y * FESTLAND_RADIUS };
}

/** World position `h` above the Festland's ground at local (x, z). */
export function landPoint(x, z, h = 0, out = new Vector3()) {
  return out.copy(FESTLAND_CENTER).addScaledVector(landDir(x, z), FESTLAND_RADIUS + festlandHeight(x, z) + h);
}

/** World position `h` above the Festland's sphere, hills ignored: the river's own frame. */
export function landLevel(x, z, h = 0, out = new Vector3()) {
  return out.copy(FESTLAND_CENTER).addScaledVector(landDir(x, z), FESTLAND_RADIUS + h);
}

function planet(id, name, center, radius, gravityRadius, look, extra = {}) {
  return { id, name, center, radius, gravityRadius, look, ...extra };
}

/**
 * The invisible walls along the valley's edges, so the mountains cannot be
 * climbed however high Mirio bounces: tall boxes whose inner faces follow
 * the foot of the walls from behind the start down to the log, and a ring
 * round the crater. Plus one across the river past the log: the rest is a ride.
 */
function edgeWalls(land) {
  const walls = [];
  const box = (ax, az, bx, bz, thick = 2) => {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, dir = landDir(mx, mz);
    const forward = tangentDir(new Vector3(bx - ax, 0, bz - az), dir);
    walls.push({ planet: land, dir, forward, halfW: thick / 2, halfD: Math.hypot(bx - ax, bz - az) / 2 + 0.4, bottom: -12, top: 60 });
  };
  // Inner faces 0.25 m past the edge; the boxes stand outside it.
  const edgeX = (z, side) => { const { c, w } = corridor(z); return c + side * (w + 1.25); };
  const step = 6;
  for (let z = BACK + 2; z > ZONES.river - 12; z -= step) {
    for (const side of [-1, 1]) box(edgeX(z, side), z, edgeX(z - step, side), z - step);
  }
  box(-60, BACK + 1.25, 60, BACK + 1.25, 2.5);
  box(-24, ZONES.river - 10, 24, ZONES.river - 10);
  const n = 28, rr = CRATER.flat + 1.5;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    box(Math.cos(a0) * rr, ZONES.arena + Math.sin(a0) * rr, Math.cos(a1) * rr, ZONES.arena + Math.sin(a1) * rr);
  }
  return walls;
}

/**
 * The trees: a clear lane along the path, a first row leaning over it, the
 * wood thickening toward the walls (all solid), and more, just scenery, on
 * the hills above the forest and the river's gorge.
 */
function forestTrees() {
  const busy = [...SPRINGS.map(([x, z]) => [x, z, 2.2]), ...PLANTS.map(([x, z]) => [x, z, 2]), ...STUMPS.map(([x, z]) => [x, z, 2.4]),
    ...FLAGS.map(([x, z]) => [x, z, 3.5]), ...FALLEN.map(([x, z, , len]) => [x, z, len / 2 + 1]), ...WALKERS.map(([x, z]) => [x, z, 3]),
    [...BERRY, 3], [0, ZONES.bank, 6]];
  const forest = [], rnd = mulberry32(318);
  const free = (x, z, r) => busy.every(([bx, bz, br]) => Math.hypot(x - bx, z - bz) > br + r)
    && forest.every(t => Math.hypot(x - t.x, z - t.z) > t.trunk + 1.6);
  const nearRavine = (z, m) => RAVINES.some(r => z < r.z0 + m && z > r.z1 - m);
  // `solid` trees stand in the valley (their trunks are colliders), `near` ones by the path.
  const add = (x, z, lean, solid, big = 1, near = false) => {
    const fir = rnd() < (solid ? 0.3 : 0.55);
    const height = (fir ? 11 : 9.5) * big * (0.85 + rnd() * 0.35);
    forest.push({ x, z, kind: fir ? 'fir' : 'broad', height, trunk: (fir ? 0.38 : 0.5) * big * (0.9 + rnd() * 0.3), lean, yaw: rnd() * Math.PI * 2, solid, near });
  };
  for (let z = ZONES.desertEnd + 4; z > ZONES.forestEnd + 2; z -= 3.2 + rnd() * 1.4) {
    const { c, w } = corridor(z), thick = ease(ZONES.desertEnd + 4, ZONES.desertEnd - 14, z), path = pathX(z);
    for (const side of [-1, 1]) {
      if (rnd() > 0.35 + 0.65 * thick) continue;
      const x1 = path + side * (5.2 + rnd() * 2.3);
      if (!nearRavine(z, 1.5) && free(x1, z, 1.2)) add(x1, z, -side * (1.2 + rnd() * 1.2), true, 1.15, true);
      const x2 = path + side * (9 + rnd() * 4.5);
      if (!nearRavine(z, 1) && free(x2, z, 1.2)) add(x2, z, -side * rnd(), true, 1, true);
      for (let x = 14.5 + rnd() * 2; x < w - 1.5; x += 3.5 + rnd() * 2.5) {
        const xx = c + side * x, zz = z + (rnd() - 0.5) * 2;
        if (!nearRavine(zz, 0.5) && free(xx, zz, 1)) add(xx, zz, 0, true, 1.1);
      }
    }
  }
  for (let z = ZONES.desertEnd + 2; z > LIP + 10; z -= 6 + rnd() * 4) {
    const { c, w } = corridor(z);
    for (const side of [-1, 1]) for (let e = 8 + rnd() * 4; e < 48; e += 7 + rnd() * 6) {
      const x = c + side * (w + e);
      if (Math.abs(x) < 150) add(x, z + (rnd() - 0.5) * 3, 0, false, 1 + rnd() * 0.3);
    }
  }
  return forest;
}

export function makeVolcanoLevel() {
  const land = planet('festland', 'Festland', FESTLAND_CENTER.clone(), FESTLAND_RADIUS, FESTLAND_RADIUS + 400, 'ember');
  land.heightAt = (dir) => { const { x, z } = landXZ(dir); return festlandHeight(x, z); };
  const start = planet('startstern', 'Startstern', new Vector3(0, 48, 26), START_RADIUS, START_RADIUS + 9, 'gold', { gravityScale: 0.8 });

  const bits = [], trees = [], stumps = [], stones = [], blocks = [], bumps = [], flags = [];
  const walkers = [], plants = [], powerups = [], springs = [], cacti = [], rocks = [];
  const arenaWalkers = [], arenaPlants = [];
  const S = (lat, lon) => dirFromLatLon(lat, lon);
  const L = landDir;
  const bit = (p, dir, height = 1) => bits.push({ planet: p, pos: surfacePoint(p, dir, height) });
  // Over a ravine, heights count from its rim, not from the bottom of the chasm.
  const overRim = (x, z, h) => h + rimHeight(x, z) - festlandHeight(x, z);
  const block = (x, z, top, { size = 2.6, bottom = -0.6 } = {}) => {
    const dir = L(x, z);
    blocks.push({
      planet: land, dir, top: overRim(x, z, top), bottom: overRim(x, z, bottom), size,
      forward: tangentDir(new Vector3(0, 0, -1), dir) ?? tangentDir(new Vector3(1, 0, 0), dir),
    });
  };
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

  // --- The desert: dunes, cacti, a few gems; Damai waits by the rock --------
  for (const z of [-12, -20, -28]) bits.push({ planet: land, pos: landPoint(0, z, 1) });
  for (const [x, z, s] of CACTI) cacti.push({ x, z, scale: s });
  for (const [x, z, s] of ROCKS) rocks.push({ x, z, scale: s });
  for (const z of [-48, -54, -60, -76, -82]) bits.push({ planet: land, pos: landPoint(z % 2 ? 1.5 : -1.5, z, 1) });
  for (const [x, z] of FLAGS) flags.push({ planet: land, dir: L(x, z) });

  // --- The forest: ravines, platforms, creatures -----------------------------
  // Across each ravine: floating platforms, a little higher each time.
  for (const [i, r] of RAVINES.entries()) {
    const span = r.z0 - r.z1, n = Math.max(2, Math.round(span / 4));
    for (let k = 0; k < n; k++) {
      const z = r.z0 - (k + 0.5) * span / n, top = 1.4 + i * 0.4 + (k % 2) * 0.5, x = (k % 2 ? 1 : -1) * 1.2;
      block(x, z, top, { bottom: top - 0.7, size: 2.8 });
      bit(land, L(x, z), overRim(x, z, top + 1));
    }
  }
  // Spring flowers: bounce up to gems and the Glutbeere's platform.
  for (const [x, z] of SPRINGS) springs.push({ planet: land, dir: L(x, z) });
  for (const [x, z] of SPRINGS) for (const h of [4, 5.5, 7]) bits.push({ planet: land, pos: landPoint(x, z, h) });
  block(...BERRY, 3.4, { bottom: 2.7, size: 3 });
  powerups.push({ id: 'glutbeere-1', planet: land, dir: L(...BERRY), height: blocks.at(-1).top + 1 });
  for (const [x, z, k] of WALKERS) walker(walkers, L(x, z), k);
  for (const [x, z] of PLANTS) plant(plants, L(x, z));
  for (const [x, z, h] of STUMPS) { stumps.push({ planet: land, dir: L(x, z), height: h }); bit(land, L(x, z), h + 1.1); }
  const fallen = FALLEN.map(([x, z, yaw, length]) => ({ x, z, yaw, length, radius: 0.45 }));

  // --- The Glutkessel: Glutzahn's crater, and who joins him ---------------
  const arenaDir = L(0, ZONES.arena);
  const arena = { planet: land, dir: arenaDir, radius: ARENA.radius, top: ARENA.top, facing: new Vector3(0, 0, -1) };
  for (const [x, z, k] of [[-9, -7, 'grummel'], [9, -7, 'grummelchen'], [-9, 7, 'grummelchen'], [9, 7, 'grummel']]) walker(arenaWalkers, L(x, ZONES.arena + z), k);
  for (const [x, z] of [[0, -11], [0, 11], [-11, 0], [11, 0]]) plant(arenaPlants, L(x, ZONES.arena + z));
  for (let a = 0; a < 6; a++) bit(land, L(Math.cos(a) * 12, ZONES.arena + Math.sin(a) * 12), ARENA.top + 1);

  // Damai's route: from where he waits in the desert to the log. Its heights
  // are the ground's (the rims across a ravine), so his hops land level.
  const route = [];
  const point = (x, z, hop = false) => {
    const last = route.at(-1);
    const s = last ? last.s + Math.hypot(x - last.x, z - last.z) : 0;
    route.push({ s, x, z, h: rimHeight(x, z), ...(hop ? { hop: true } : {}) });
  };
  point(2, -16);
  for (let z = -30; z > ZONES.forestEnd; z -= 10) {
    const r = RAVINES.find(r => z <= r.z0 + 1 && z >= r.z1 - 1);
    if (r) continue;
    const next = RAVINES.find(r => z > r.z0 && z - 10 <= r.z0 + 1);
    point(pathX(z), z);
    if (next) { point(0, next.z0 + 1, true); point(0, next.z1 - 1); }
  }
  point(0, ZONES.bank);

  return {
    id: 'volcano',
    planets: [start, land],
    start, land,
    spawn: { planet: start, dir: S(80, 180) },
    landing: { planet: land, dir: L(0, -2) },
    bits, trees, stumps, stones, blocks, bumps, flags,
    walkers, plants, powerups, springs, cacti, rocks, fallen, forest: forestTrees(), arenaWalkers, arenaPlants,
    walls: edgeWalls(land),
    plateau, rocket, arena, route,
    log: { x: 0, z: ZONES.river },
    wake: { planet: land, dir: L(0, ZONES.arena + ARENA.radius - 3) },
    goal: { planet: land, dir: arenaDir, height: 6 },
  };
}

/**
 * The Festland's solid things beyond what level.js collidersFor knows: the
 * valley's walls, tree trunks, cacti, rocks and fallen trunks.
 */
export function festlandColliders(level) {
  const { land } = level, list = [];
  const upright = (dir, forward, halfW, halfD, bottom, top) => list.push({
    kind: 'box', base: surfacePoint(land, dir, bottom), axis: dir.clone(), forward: forward.clone(),
    right: new Vector3().crossVectors(forward, dir).normalize(), halfW, halfD, height: top - bottom,
  });
  const cyl = (x, z, radius, bottom, top) => list.push({ kind: 'cyl', base: landPoint(x, z, bottom), axis: landDir(x, z), radius, height: top - bottom });
  for (const w of level.walls) upright(w.dir, w.forward, w.halfW, w.halfD, w.bottom, w.top);
  for (const t of level.forest) if (t.solid) cyl(t.x, t.z, t.trunk + 0.15, -0.5, 16);
  for (const k of level.cacti) cyl(k.x, k.z, 0.5 * k.scale, -0.2, 3 * k.scale);
  for (const k of level.rocks) cyl(k.x, k.z, 1.1 * k.scale, -0.2, 1 * k.scale);
  for (const f of level.fallen) {
    const dir = landDir(f.x, f.z);
    upright(dir, tangentDir(new Vector3(Math.sin(f.yaw), 0, -Math.cos(f.yaw)), dir), f.radius, f.length / 2, -0.3, f.radius * 1.7);
  }
  return list;
}

/** The rocket's flight curve at `t` in 0..1. */
export function volcanoFlightPoint(level, t, out = new Vector3()) {
  const { p0, p1, p2, p3 } = level.rocket.flight;
  return bezier(p0, p1, p2, p3, t, out);
}

export const VOLCANO_ARENA = ARENA;
