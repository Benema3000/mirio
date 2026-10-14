// The Riesenstern, as plain data: the planet the Raketenritt lands on.
//
// Miro's star (img/stern.jpg) made a planet: a round golden core with four
// great points standing out round its equator, its two dot eyes on the ground
// by the north pole, where the rocket lands. From there the way runs south
// along longitude 0, round the star:
//
//   the face: gems and low hills, the first Zischer → a flag → the first
//   meteor shower → the Zackenwall, a wall to climb over on steps (or to be
//   flung over by a spring flower) → a flag → hills and three Zischer, a
//   floating island up a spring → the second, thicker meteor shower between
//   crystal pillars → the last flag → steps up onto Krakel's arena, a disc
//   over the south pole, where Krakel waits (krakel-rules.js).
//
// The arena's fence stays shut until Mirio has found the three Sternsplitter:
// on top of the Zackenwall, on the floating island, and on a block tower in
// the second meteor shower. That is what sends him round the star.
//
// Directions are latitude/longitude on the star (dirFromLatLon); one degree
// of latitude is STAR_RADIUS * pi / 180 = 0.84 m of walking.

import { Vector3 } from 'three';
import { KRAKEL } from './krakel-rules.js';
import { dirFromLatLon, surfacePoint, tangentDir } from './world.js';

export const STAR_RADIUS = 48;
// The four points: how far each stands out, and how wide it is at the core.
export const STAR_POINT = Object.freeze({ length: 62, base: 21, lons: Object.freeze([45, 135, 225, 315]) });
// The way's latitudes, north to south.
export const ROUTE = Object.freeze({ spawn: 84, wall: 28, arena: -90, entrance: -67 });
// While Mirio is between these latitudes, meteors fall round him; `every` seconds.
export const METEOR_ZONES = Object.freeze([
  Object.freeze({ from: 50, to: 34, every: 1.5 }),
  Object.freeze({ from: -12, to: -44, every: 1.05 }),
]);
export const METEOR = Object.freeze({ warn: 1.15, height: 26, reach: 1.7, hurtHeight: 1.5, lead: 0.9, scatter: 2.2 });

const S = (lat, lon = 0) => dirFromLatLon(lat, lon);

function planet(id, name, center, radius, gravityRadius, look, extra = {}) {
  return { id, name, center, radius, gravityRadius, look, ...extra };
}

/** Which meteor zone `lat` is in, or null. */
export function meteorZone(lat) {
  return METEOR_ZONES.find(z => lat <= z.from && lat >= z.to) ?? null;
}

// Krakel's arena: a flat disc this far over the south pole.
export const ARENA_TOP = 0.6;
// Where the flat top ends: exactly at the arena's drawn rim.
const ARENA_ANGLE = Math.atan(KRAKEL.arena / (STAR_RADIUS + ARENA_TOP));

/**
 * The star's ground: round everywhere but over the south pole, where it is
 * the arena's flat top (a plane, so the fight's flat rules hold), standing
 * a few metres over the curve at its rim.
 */
export function starHeight(dir) {
  const fromPole = Math.acos(Math.max(-1, Math.min(1, -dir.y)));
  if (fromPole > ARENA_ANGLE) return 0;
  return (STAR_RADIUS + ARENA_TOP) / Math.cos(fromPole) - STAR_RADIUS;
}

export function makeStarLevel() {
  // Krakel's head sits 15 m over the arena; the star's pull reaches well past it.
  const star = planet('riesenstern', 'Riesenstern', new Vector3(0, 0, 0), STAR_RADIUS, STAR_RADIUS + 70, 'gold', { gravityScale: 0.95 });
  star.heightAt = starHeight;
  const bits = [], trees = [], stumps = [], stones = [], blocks = [], bumps = [], flags = [], springs = [], walkers = [], arenaWalkers = [], shards = [];
  const shard = (lat, lon, height) => shards.push({ planet: star, dir: S(lat, lon), height, pos: surfacePoint(star, S(lat, lon), height) });
  const bit = (dir, height = 1) => bits.push({ planet: star, pos: surfacePoint(star, dir, height) });
  const along = (dir) => tangentDir(new Vector3(0, -1, 0), dir) ?? tangentDir(new Vector3(1, 0, 0), dir);
  const block = (lat, lon, top, { size = 2.8, bottom = -0.8 } = {}) => {
    const dir = S(lat, lon);
    blocks.push({ planet: star, dir, top, bottom, size, forward: along(dir) });
  };
  const zischer = (list, lat, lon) => list.push({ id: `zischer-${walkers.length + arenaWalkers.length + 1}`, kind: 'zischer', planet: star, dir: S(lat, lon), name: 'Zischer', color: 0x2a2630 });

  // --- The face: the landing pad, gems, low hills, the first Zischer ------
  // The pad stands to the side of where Mirio starts, out of the camera's way.
  const plateau = { planet: star, dir: S(ROUTE.spawn, 75), radius: 3.2, top: 0.6 };
  for (let lat = 80; lat >= 64; lat -= 2.5) bit(S(lat, lat % 5 ? 2 : -2));
  bumps.push({ planet: star, dir: S(68, 7), radius: 4.5, height: 1.8 }, { planet: star, dir: S(62, -6), radius: 5.5, height: 2.4 });
  bit(S(68, 7), 2.9);
  bit(S(62, -6), 3.5);
  zischer(walkers, 59, 1);
  flags.push({ planet: star, dir: S(56, 5) });

  // --- The first meteor shower: gems to dash for -----------------------------
  for (let lat = 49; lat >= 35; lat -= 3.5) bit(S(lat, (lat * 7) % 9 - 4));
  zischer(walkers, 42, -5);

  // --- The Zackenwall: too tall to jump, so up the steps or a spring flower --
  for (let lon = -16; lon <= 16; lon += 3.2) block(ROUTE.wall, lon, 6.5, { size: 3.3 });
  block(ROUTE.wall + 3.8, -5, 1.7);
  block(ROUTE.wall + 3.4, -8.5, 3.4);
  block(ROUTE.wall + 2.6, -11.5, 5);
  for (let lon = -12; lon <= 12; lon += 4) bit(S(ROUTE.wall, lon), 7.6);
  shard(ROUTE.wall, 9, 8);
  springs.push({ planet: star, dir: S(ROUTE.wall + 4, 7) });
  for (const h of [4, 6, 8]) bit(S(ROUTE.wall + 4, 7), h);
  flags.push({ planet: star, dir: S(21, 5) });

  // --- Hills and Zischer; a spring up to a floating island -------------------
  bumps.push({ planet: star, dir: S(14, -7), radius: 6, height: 2.6 }, { planet: star, dir: S(3, 6), radius: 5, height: 2.1 });
  zischer(walkers, 15, 3);
  zischer(walkers, 7, -4);
  zischer(walkers, -2, 4);
  springs.push({ planet: star, dir: S(9, 10) });
  for (const [lat, lon] of [[7, 14], [5, 17], [3, 14]]) block(lat, lon, 6.2, { bottom: 5.4, size: 3.2 });
  for (const [lat, lon] of [[7, 14], [3, 14]]) bit(S(lat, lon), 7.3);
  shard(5, 17, 7.6);
  for (let lat = 12; lat >= -8; lat -= 4) bit(S(lat, -1));

  // --- The second meteor shower, between crystal pillars --------------------
  for (const [i, lat] of [-16, -21, -26, -31, -36, -41].entries()) {
    const lon = i % 2 ? 6 : -6;
    stones.push({ planet: star, dir: S(lat, lon), radius: 1.3, top: 3 });
    bit(S(lat, lon), 4.2);
    bit(S(lat - 2.5, -lon / 3));
  }
  // A block tower in the shower, a Sternsplitter on top.
  block(-33, -13, 1.5);
  block(-35.5, -14, 3);
  block(-38, -13, 4.5, { size: 3.4 });
  shard(-38, -13, 5.9);
  flags.push({ planet: star, dir: S(-56, 5) });
  for (let lat = -50; lat >= -60; lat -= 3) bit(S(lat, 0));

  // --- Steps up onto Krakel's arena, a disc over the south pole -------------
  block(-64.4, 0, 1.4);
  block(-66.8, 0, 2.8);
  // The arena's top is the ground there (starHeight), so `top` is 0.
  const arena = { planet: star, dir: S(ROUTE.arena), radius: KRAKEL.arena, top: 0, facing: new Vector3(1, 0, 0) };
  // Krakel guards the crystal under his head.
  const goal = { planet: star, dir: S(ROUTE.arena), height: 3 };
  // Stage two brings two Zischer onto the arena, stage three two more.
  // Arena x (right) is world +z there, arena z (towards the way in) world +x.
  for (const [x, z] of [[-8, 4], [8, 4], [-6, -8], [6, -8]]) {
    const dir = new Vector3(z, -STAR_RADIUS - ARENA_TOP, x).normalize();
    arenaWalkers.push({ id: `zischer-${walkers.length + arenaWalkers.length + 1}`, kind: 'zischer', planet: star, dir, name: 'Zischer', color: 0x2a2630, onArena: true });
  }

  return {
    id: 'star',
    planets: [star],
    star,
    spawn: { planet: star, dir: S(ROUTE.spawn - 1, 25) },
    bits, trees, stumps, stones, blocks, bumps, flags, springs, walkers, arenaWalkers, shards,
    plateau, arena, goal,
    // The rocket's landing spot: on the pad.
    landing: { planet: star, dir: plateau.dir.clone(), height: plateau.top },
    // The four points, standing out of the equator.
    points: STAR_POINT.lons.map(lon => S(0, lon)),
  };
}

/** Latitude and longitude, in degrees, of a direction on the star. */
export function latLonOf(dir) {
  return { lat: Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180 / Math.PI, lon: Math.atan2(dir.z, dir.x) * 180 / Math.PI };
}

/** 0..1 along the way from the landing pad to the arena's steps. */
export function routeProgress(dir) {
  const { lat } = latLonOf(dir);
  return Math.max(0, Math.min(1, (ROUTE.spawn - lat) / (ROUTE.spawn - ROUTE.entrance)));
}
