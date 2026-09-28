import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLevel, collidersFor} from '../js/level.js';
import {DISCOVERY, nearbyDiscoveryGate} from '../js/discovery-level.js';
import {surfacePoint, pickGravitySource} from '../js/world.js';

test('the hidden planet is optional and its gates have safe landings', () => {
  const level = makeLevel(), planet = level.bonus.planet;
  assert.equal(level.rocket.to.id, 'mond');
  assert.equal(level.arena.planet.id, 'mond');
  assert.equal(level.course.finish.planet.id, 'ziel');
  assert.ok(level.bonus.gates[0].dir.angleTo(level.spawn.dir) * level.planets[0].radius > 10);
  for (const gate of level.bonus.gates) {
    const pos = surfacePoint(gate.planet, gate.dir, .05);
    assert.equal(pickGravitySource(pos, level.planets), gate.planet);
    const latitude = Math.asin(gate.dir.y) * 180 / Math.PI;
    const water = gate.planet.water;
    assert.ok(!water || latitude < water.minLat || latitude > water.maxLat);
  }
  assert.ok(collidersFor(level)(planet).length > 0);
  assert.equal(planet.gravityScale, .7);
});

test('gate proximity ignores distant, airborne and plane passengers', () => {
  const level = makeLevel(), gate = level.bonus.gates[0];
  const player = {state: 'play', body: {planet: gate.planet, onGround: true, pos: surfacePoint(gate.planet, gate.dir, .05)}};
  assert.equal(nearbyDiscoveryGate(level.bonus.gates, player), gate);
  player.state = 'biplane';
  assert.equal(nearbyDiscoveryGate(level.bonus.gates, player), null);
  player.state = 'play'; player.body.onGround = false;
  assert.equal(nearbyDiscoveryGate(level.bonus.gates, player), null);
  player.body.onGround = true; player.body.pos.addScaledVector(gate.dir, DISCOVERY.reach + 1);
  assert.equal(nearbyDiscoveryGate(level.bonus.gates, player), null);
});

test('arrival leaves room to board the plane without selecting the return gate', () => {
  const {bonus} = makeLevel(), spawn = surfacePoint(bonus.planet, bonus.spawn.dir);
  const exit = bonus.gates.find(gate => gate.id === 'exit');
  assert.ok(spawn.distanceTo(surfacePoint(exit.planet, exit.dir)) > DISCOVERY.reach + 1);
});

test('the treehouse approach reaches a checkpoint before climbing onto its roof', async () => {
  const {meadowLayout} = await import('../js/meadow-playground-rules.js');
  const level = makeLevel(), planet = level.bonus.planet;
  const firstStep = meadowLayout({planets: [planet]}).steps[0];
  const approach = surfacePoint(planet, firstStep.dir, firstStep.height);
  const CHECKPOINT_REACH = 2.4;
  assert.ok(level.flags.some(flag => flag.planet === planet && surfacePoint(planet, flag.dir).distanceTo(approach) < CHECKPOINT_REACH));
});
