// Portal visits have no timer or score. Returning players must leave before re-entering.
export const HUB = Object.freeze({
  radius: 64, boundary: 19.5, portalReach: 1.65, portalNotice: 5.5,
  portalRelease: 2.6, returnDistance: 3.8, approachTime: .28,
  toyReach: 2.5, toyCooldown: 1.2, springSpeed: 16,
  souvenirDistance: 4.4, echoReach: 1.8, echoHeight: 2.4, chorusMinimum: 2, chorusDuration: 6,
  spawn: Object.freeze({x: 0, z: 3}), toy: Object.freeze({x: 0, z: 0}),
});

// The gates stand in a ring round the central flower, each a short walk from
// spawn: the first journey straight ahead, its neighbours ahead left and
// right, the others a turn away. The camera stays inside the ring, so the
// gates behind it never block the view. (A fan across the whole view made
// every sign too small to read.)
const GATE_RING = 11;
const gate = (level, label, degrees, color) => {
  const a = degrees * Math.PI / 180;
  return {level, label, x: Math.round(GATE_RING * Math.sin(a) * 100) / 100, z: Math.round(-GATE_RING * Math.cos(a) * 100) / 100, color};
};
export const HUB_PORTALS = Object.freeze([
  gate('adventure', 'Planetenreise', 0, 0xf5bb78),
  gate('kart', 'Sternenrennen', 60, 0xbbafe4),
  gate('ribbon', 'Blütenpfad', 120, 0xe9a7c3),
  gate('tilt', 'Seifenstern', 180, 0x94d6c4),
  gate('marble', 'Klangkugel', 240, 0xf2ce6d),
  gate('sky', 'Wolkenpost', 300, 0x88cbd7),
]);

export const HUB_STONE_RADIUS = 1.05;
// Out by the rim, in the gap between the Blütenpfad and Seifenstern gates.
export const HUB_STONES = Object.freeze([
  {x: 6.75, z: 11.7, height: .55}, {x: 7.5, z: 13, height: 1}, {x: 8.25, z: 14.3, height: 1.5},
]);

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function hubSpawn(lastLevel) {
  const portal = HUB_PORTALS.find(p => p.level === lastLevel);
  if (!portal) return {...HUB.spawn};
  const span = distance(portal, HUB.spawn);
  return {x: portal.x + (HUB.spawn.x - portal.x) * HUB.returnDistance / span,
    z: portal.z + (HUB.spawn.z - portal.z) * HUB.returnDistance / span};
}

export function hubSouvenir(level) {
  const portal = HUB_PORTALS.find(p => p.level === level);
  if (!portal) return null;
  const span = distance(portal, HUB.spawn);
  return {x: portal.x + (HUB.spawn.x - portal.x) * HUB.souvenirDistance / span,
    z: portal.z + (HUB.spawn.z - portal.z) * HUB.souvenirDistance / span};
}

export function hubChorusReady(visit) {
  return visit.completed.size >= HUB.chorusMinimum && visit.echoes.size === visit.completed.size;
}

export function createHubVisit({completed = [], lastLevel = null} = {}) {
  return {completed: new Set(completed.filter(id => HUB_PORTALS.some(p => p.level === id))), blocked: lastLevel, entering: null, approach: 0,
    near: null, echoNear: null, flowerNear: false, launched: false, toyCooldown: 0, discoveries: 0, bloom: 0,
    echoes: new Set(), chorus: 0};
}

export function stepHubVisit(visit, dt, player) {
  const events = [];
  if (!Number.isFinite(dt) || dt <= 0 || visit.launched) return events;
  visit.toyCooldown = Math.max(0, visit.toyCooldown - dt);
  visit.bloom = Math.max(0, visit.bloom - dt);
  visit.chorus = Math.max(0, visit.chorus - dt);
  const blocked = HUB_PORTALS.find(p => p.level === visit.blocked);
  if (blocked && distance(player, blocked) >= HUB.portalRelease) visit.blocked = null;

  visit.near = HUB_PORTALS.reduce((nearest, p) => distance(player, p) < HUB.portalNotice && (!nearest || distance(player, p) < distance(player, nearest)) ? p : nearest, null);
  visit.echoNear = HUB_PORTALS.find(p => visit.completed.has(p.level) && distance(player, hubSouvenir(p.level)) < HUB.echoReach && player.height <= HUB.echoHeight)?.level ?? null;
  visit.flowerNear = distance(player, HUB.toy) < HUB.toyReach && player.height <= HUB.echoHeight;
  if (player.spin && visit.echoNear && !visit.echoes.has(visit.echoNear)) {
    visit.echoes.add(visit.echoNear);
    events.push({type: 'hubEcho', level: visit.echoNear});
  }
  const portal = HUB_PORTALS.find(p => distance(player, p) < HUB.portalReach);
  if (!portal || !player.grounded || portal.level === visit.blocked) {
    visit.entering = null;
    visit.approach = 0;
  } else {
    if (visit.entering !== portal.level) visit.approach = 0;
    visit.entering = portal.level;
    visit.approach += dt;
    if (visit.approach >= HUB.approachTime) {
      visit.launched = true;
      events.push({type: 'enter', level: portal.level});
    }
  }

  // The flower is a toy, never an obstacle: ordinary walking does not launch it.
  if (visit.toyCooldown > 0 || distance(player, HUB.toy) > HUB.toyReach || player.height > HUB.echoHeight) return events;
  if (!player.pound && !player.spin) return events;
  visit.toyCooldown = HUB.toyCooldown;
  visit.bloom = 3;
  visit.discoveries++;
  events.push({type: player.pound ? 'spring' : 'ring', kind: 'hubFlower'});
  if (player.spin && !player.pound && hubChorusReady(visit) && visit.chorus <= 0) {
    visit.chorus = visit.bloom = HUB.chorusDuration;
    events.push({type: 'hubChorus'});
  }
  return events;
}

/** A soft garden rim removes outward speed while preserving jumps and tangential motion. */
export function hubBoundary(x, z) {
  const radius = Math.hypot(x, z);
  if (radius <= HUB.boundary) return null;
  return {x: x * HUB.boundary / radius, z: z * HUB.boundary / radius, nx: x / radius, nz: z / radius};
}
