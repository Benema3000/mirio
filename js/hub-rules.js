// Sternenhof: a little home planet with six launch pads. From each pad a beam
// of light rises to its journey's planet, floating in the sky; stepping onto
// a pad flings Mirio up the beam and starts that journey. Coming back, Mirio
// lands beside the pad he left from. No timer and no score here.
//
// Pure rules, no screen: positions are unit directions from the planet's
// centre, [x, y, z], with the spawn at the north pole (y = 1) looking along
// -z. The scene is hub-world.js.

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
});

const toRad = Math.PI / 180;

/** Unit direction for a latitude (90 = the spawn's pole) and a longitude (0 = ahead, +90 = right). */
export function hubDir(lat, lon) {
  const a = lat * toRad, b = lon * toRad;
  return [Math.cos(a) * Math.sin(b), Math.sin(a), -Math.cos(a) * Math.cos(b)];
}

// Scattered, not in a ring: two close by, two a short run away, two round
// the side, one on the far side, so the planet has somewhere to go.
const pad = (level, label, lat, lon, color) => Object.freeze({level, label, lat, lon, dir: hubDir(lat, lon), color});
export const HUB_PADS = Object.freeze([
  pad('adventure', 'Planetenreise', 58, 6, 0xf5bb78),
  pad('sky', 'Wolkenpost', 41, -63, 0x88cbd7),
  pad('kart', 'Sternenrennen', 30, 71, 0xbbafe4),
  pad('marble', 'Klangkugel', 9, -125, 0xf2ce6d),
  pad('ribbon', 'Blütenpfad', -2, 136, 0xe9a7c3),
  pad('tilt', 'Seifenstern', -34, 172, 0x94d6c4),
]);

export const HUB_SPAWN = Object.freeze([0, 1, 0]);

/** Straight-line distance on the home planet between two unit directions. */
export function hubDistance(a, b) {
  return HUB.radius * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Where Mirio lands on coming back from `level` (the spawn for anything else). */
export function hubReturn(level) {
  const found = HUB_PADS.find(p => p.level === level);
  return found ? hubDir(Math.min(90, found.lat + HUB.returnArc), found.lon) : [...HUB_SPAWN];
}

export function createHubVisit({completed = [], lastLevel = null} = {}) {
  return {
    completed: new Set(completed.filter(id => HUB_PADS.some(p => p.level === id))),
    blocked: HUB_PADS.some(p => p.level === lastLevel) ? lastLevel : null,
    near: null, entering: null, approach: 0, launched: null,
  };
}

/**
 * One step of a visit. `player` = {dir: unit direction of Mirio's feet, grounded}.
 * Returns [{type: 'launch', level}] once, when Mirio has stood on a pad.
 */
export function stepHubVisit(visit, dt, player) {
  if (!Number.isFinite(dt) || dt <= 0 || visit.launched) return [];
  const blocked = HUB_PADS.find(p => p.level === visit.blocked);
  if (blocked && hubDistance(player.dir, blocked.dir) >= HUB.padRelease) visit.blocked = null;
  let nearest = null;
  for (const p of HUB_PADS) {
    const d = hubDistance(player.dir, p.dir);
    if (d < HUB.padNotice && (!nearest || d < nearest.d)) nearest = {p, d};
  }
  visit.near = nearest?.p ?? null;
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
