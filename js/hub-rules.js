// Sternenhof: a little home planet with launch pads, and a small moon above
// it. From each pad a beam of light rises to its journey's planet, floating in
// the sky; stepping onto a pad flings Mirio up the beam and starts that
// journey. A spring flower under the moon flings Mirio up to it, and one on
// the moon's near side sends him home. Coming back from a journey, Mirio lands
// beside the pad he left from. No timer and no score here.
//
// Pure rules, no screen: positions are unit directions from a planet's
// centre, [x, y, z]. On the home planet the spawn is the north pole (y = 1)
// looking along -z. The scene is hub-world.js.

export const HUB = Object.freeze({
  // The home planet: small enough to run round in a few seconds.
  radius: 10,
  // Standing this close to a pad's centre, on the ground, for approachTime
  // seconds launches: long enough that running across a pad on the way to
  // another (about a third of a second) does not. Its name shows from padNotice.
  padReach: 1.5,
  padNotice: 3.6,
  approachTime: .6,
  // Coming back, the pad just left waits until Mirio is this far from it.
  padRelease: 2.6,
  // Seconds up the beam before the journey starts.
  launchTime: .85,
  // The journeys' planets float this far above their pads.
  planetHeight: 9,
  planetRadius: 2.6,
  // Degrees from a pad towards the pole where Mirio lands on coming back.
  returnArc: 17,
  // The moon hangs ahead and to the right of the spawn, in view from it, with
  // gentle gravity. Its field reaches past the midpoint between the two
  // surfaces, so a hop from either spring falls onto the other body.
  moon: Object.freeze({lat: 36, lon: 38, distance: 21.5, radius: 5, gravityScale: .8, gravityRadius: 9.5, planetHeight: 6}),
  // A spring fires when Mirio stands this close to it; the one he arrives on
  // waits until he is springRelease from it.
  springReach: 1.1,
  springRelease: 2.2,
  // A finished journey leaves a souvenir just past its pad; a spin beside it plays its tune.
  souvenirArc: 13,
  souvenirReach: 1.8,
});

const toRad = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => { const n = Math.hypot(...v); return v.map(x => x / n); };

/** Unit direction on the home planet for a latitude (90 = the spawn's pole) and a longitude (0 = ahead, +90 = right). */
export function hubDir(lat, lon) {
  const a = lat * toRad, b = lon * toRad;
  return [Math.cos(a) * Math.sin(b), Math.sin(a), -Math.cos(a) * Math.cos(b)];
}

export const MOON_DIR = Object.freeze(hubDir(HUB.moon.lat, HUB.moon.lon));
export const MOON_CENTER = Object.freeze(MOON_DIR.map(v => v * HUB.moon.distance));
const RADIUS = Object.freeze({home: HUB.radius, moon: HUB.moon.radius});
const CENTER = Object.freeze({home: [0, 0, 0], moon: MOON_CENTER});

/** Turns unit direction `from` by `degrees` towards unit direction `to`. */
function turn(from, to, degrees) {
  const side = unit(to.map((v, i) => v - dot(to, from) * from[i])), a = degrees * toRad;
  return from.map((v, i) => v * Math.cos(a) + side[i] * Math.sin(a));
}

// Scattered, not in a ring: one almost ahead, two a short run away, two round
// the side, one on the far side, and the race up on the moon, where the story
// starts it: round its underside from the spring, where its planet has room.
const pad = (level, label, lat, lon, color) => Object.freeze({level, label, planet: 'home', lat, lon, dir: hubDir(lat, lon), color});
const MOON_UP = unit([0, 1, 0].map((v, i) => v - MOON_DIR[1] * MOON_DIR[i]));
const MOON_NEAR = MOON_DIR.map(v => -v);
export const HUB_PADS = Object.freeze([
  pad('adventure', 'Planetenreise', 58, 6, 0xf5bb78),
  pad('sky', 'Wolkenpost', 41, -63, 0x88cbd7),
  Object.freeze({level: 'kart', label: 'Sternenrennen', planet: 'moon', dir: turn(MOON_NEAR, MOON_UP.map(v => -v), 70), color: 0xbbafe4}),
  pad('marble', 'Klangkugel', 9, -125, 0xf2ce6d),
  pad('ribbon', 'Blütenpfad', -2, 136, 0xe9a7c3),
  pad('tilt', 'Seifenstern', -34, 172, 0x94d6c4),
]);

export const HUB_SPRINGS = Object.freeze([
  Object.freeze({id: 'to-moon', planet: 'home', dir: MOON_DIR, to: 'moon'}),
  Object.freeze({id: 'to-home', planet: 'moon', dir: MOON_NEAR, to: 'home'}),
]);

export const HUB_SPAWN = Object.freeze([0, 1, 0]);

/** Straight-line distance on a planet ('home' or 'moon') between two unit directions. */
export function hubDistance(a, b, planet = 'home') {
  return RADIUS[planet] * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** World position `height` above the surface of `planet` at unit direction `dir`. */
export function hubPoint(planet, dir, height = 0) {
  return dir.map((v, i) => CENTER[planet][i] + v * (RADIUS[planet] + height));
}

/** Where Mirio lands on coming back from `level`: {planet, dir} (the spawn for anything else). */
export function hubReturn(level) {
  const found = HUB_PADS.find(p => p.level === level);
  if (!found) return {planet: 'home', dir: [...HUB_SPAWN]};
  if (found.planet === 'moon') return {planet: 'moon', dir: turn(found.dir, MOON_UP, 32)};
  return {planet: 'home', dir: hubDir(Math.min(90, found.lat + HUB.returnArc), found.lon)};
}

/** Where a finished journey's souvenir stands: just past its pad, away from the paths. */
export function hubSouvenir(level) {
  const found = HUB_PADS.find(p => p.level === level);
  if (!found) return null;
  if (found.planet === 'moon') return {planet: 'moon', dir: turn(found.dir, MOON_UP.map(v => -v), HUB.souvenirArc * 2)};
  return {planet: 'home', dir: hubDir(found.lat - HUB.souvenirArc, found.lon)};
}

export function createHubVisit({completed = [], lastLevel = null} = {}) {
  return {
    completed: new Set(completed.filter(id => HUB_PADS.some(p => p.level === id))),
    blocked: HUB_PADS.some(p => p.level === lastLevel) ? lastLevel : null,
    planet: hubReturn(lastLevel).planet, springBlocked: null,
    near: null, souvenirNear: null, entering: null, approach: 0, launched: null,
  };
}

/**
 * One step of a visit. `player` = {planet: 'home' | 'moon', dir: unit direction
 * of Mirio's feet from that planet's centre, grounded}. Returns
 * [{type: 'launch', level}] once, when Mirio has stood on a pad, and
 * [{type: 'hop', to}] when he steps onto a spring.
 */
export function stepHubVisit(visit, dt, player) {
  if (!Number.isFinite(dt) || dt <= 0 || visit.launched) return [];
  const planet = player.planet ?? 'home';
  // Arriving on the other body, its spring waits until Mirio steps off it.
  if (planet !== visit.planet) {
    visit.planet = planet;
    visit.springBlocked = HUB_SPRINGS.find(s => s.planet === planet)?.id ?? null;
  }
  const waiting = HUB_SPRINGS.find(s => s.id === visit.springBlocked);
  if (waiting && hubDistance(player.dir, waiting.dir, planet) >= HUB.springRelease) visit.springBlocked = null;
  const blocked = HUB_PADS.find(p => p.level === visit.blocked);
  if (blocked && (blocked.planet !== planet || hubDistance(player.dir, blocked.dir, planet) >= HUB.padRelease)) visit.blocked = null;

  let nearest = null;
  for (const p of HUB_PADS) {
    if (p.planet !== planet) continue;
    const d = hubDistance(player.dir, p.dir, planet);
    if (d < HUB.padNotice && (!nearest || d < nearest.d)) nearest = {p, d};
  }
  visit.near = nearest?.p ?? null;
  visit.souvenirNear = [...visit.completed].find(level => {
    const s = hubSouvenir(level);
    return s.planet === planet && hubDistance(player.dir, s.dir, planet) < HUB.souvenirReach;
  }) ?? null;

  const spring = player.grounded && HUB_SPRINGS.find(s => s.planet === planet && s.id !== visit.springBlocked
    && hubDistance(player.dir, s.dir, planet) < HUB.springReach);
  if (spring) {
    visit.springBlocked = spring.id;
    visit.entering = null;
    visit.approach = 0;
    return [{type: 'hop', to: spring.to}];
  }

  const on = nearest && nearest.d < HUB.padReach && player.grounded && nearest.p.level !== visit.blocked ? nearest.p : null;
  if (!on) {
    visit.entering = null;
    visit.approach = 0;
    return [];
  }
  if (visit.entering !== on.level) visit.approach = 0;
  visit.entering = on.level;
  visit.approach += dt;
  if (visit.approach < HUB.approachTime) return [];
  visit.launched = on.level;
  return [{type: 'launch', level: on.level}];
}
