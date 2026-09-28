// A side trip behind the meadow's far orchard; the rocket route stays intact.
import {Vector3} from 'three';
import {dirFromLatLon, surfacePoint, tangentDir} from './world.js';

export const DISCOVERY = Object.freeze({
  id: 'wunderwiese', name: 'Wunderwiese', radius: 26, gravityScale: .7,
  entry: [64, 180], spawn: [82, -100], exit: [76, -55], race: [-62, -115],
  reach: 2.8, cooldown: 1,
});

export function addDiscovery(level) {
  const planet = {id: DISCOVERY.id, name: DISCOVERY.name, center: new Vector3(-130, 0, -110),
    radius: DISCOVERY.radius, gravityRadius: 48, gravityScale: DISCOVERY.gravityScale,
    look: 'grass', water: {minLat: 36, maxLat: 56}};
  const spawn = {planet, dir: dirFromLatLon(...DISCOVERY.spawn)};
  const gates = [
    {id: 'enter', planet: level.planets[0], dir: dirFromLatLon(...DISCOVERY.entry), label: '✦ ?', color: 0x9decdf},
    {id: 'exit', planet, dir: dirFromLatLon(...DISCOVERY.exit), label: '↩ Wiese', color: 0x9decdf},
    {id: 'race', planet, dir: dirFromLatLon(...DISCOVERY.race), label: '⚑ Sternenwege', color: 0xffd07a},
  ];
  level.planets.push(planet);
  level.bonus = {planet, spawn, gates};

  for (const [lat, lon, scale] of [[72, -145, 1.1], [66, -70, 1.3], [32, -130, 1.2], [24, -86, 1.1],
    [14, -126, 1.5], [-5, -89, 1], [-26, -140, 1.3], [-56, -135, 1.4]]) {
    level.trees.push({planet, dir: dirFromLatLon(lat, lon), scale});
  }
  // Ring rewards and a breadcrumb route connect the lakeside to the cloud garden.
  const trails = [
    ...[84, 80.5, 77, 73.5, 70, 66.5].map(lat => [lat, -90]),
    ...[-4, -8.5, -13, -17.5, -22, -26.5].map(lat => [lat, -108]),
    ...[29, 22, 15, 8, 1, -34, -42, -50, -58].map(lat => [lat, -115]),
  ];
  for (const [lat, lon] of trails) level.bits.push({planet, pos: surfacePoint(planet, dirFromLatLon(lat, lon), 1.2)});
  // A walkable alternative crosses the ring lake beside the wind toy.
  for (const lat of [54, 49, 44, 39]) level.stones.push({planet, dir: dirFromLatLon(lat, -96), radius: 1.4, top: .65});
  for (const [lat, lon] of [[61, -99], [34, -119], [-32, -115], [-63, -105]]) level.flags.push({planet, dir: dirFromLatLon(lat, lon)});
  for (const [lat, lon, top] of [[-38, -97, 1.3], [-43, -97, 2.7], [-48, -97, 4.1]]) {
    const dir = dirFromLatLon(lat, lon);
    level.blocks.push({planet, dir, top, bottom: -.5, size: 3,
      forward: tangentDir(dirFromLatLon(lat - 5, lon), dir)});
  }
  return level;
}

/** Activation needs a grounded walker: flying past a gate never interrupts a toy. */
export function nearbyDiscoveryGate(gates, player, reach = DISCOVERY.reach) {
  if (player.state !== 'play' || !player.body.onGround) return null;
  return gates.find(gate => gate.planet === player.body.planet
    && surfacePoint(gate.planet, gate.dir).distanceTo(player.body.pos) < reach) ?? null;
}
