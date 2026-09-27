import assert from 'node:assert/strict';
import test from 'node:test';
import {HUB, HUB_PORTALS, HUB_STONES, HUB_STONE_RADIUS, createHubVisit, hubBoundary, hubSpawn, stepHubVisit} from '../js/hub-rules.js';

test('all destinations are visible on a compact safe cap and central spawn cannot enter', () => {
  assert.deepEqual(new Set(HUB_PORTALS.map(p => p.level)), new Set(['adventure', 'sky', 'ribbon', 'kart']));
  const visit = createHubVisit();
  for (const portal of HUB_PORTALS) assert.ok(Math.hypot(portal.x, portal.z) + HUB.portalReach < HUB.boundary);
  assert.deepEqual(stepHubVisit(visit, 5, {...HUB.spawn, grounded: true}), []);
});

test('a grounded deliberate approach enters once; jumping over a portal does not', () => {
  for (const portal of HUB_PORTALS) {
    const visit = createHubVisit();
    assert.deepEqual(stepHubVisit(visit, 1, {...portal, grounded: false}), []);
    assert.deepEqual(stepHubVisit(visit, .1, {...portal, grounded: true}), []);
    assert.deepEqual(stepHubVisit(visit, .2, {...portal, grounded: true}), [{type: 'enter', level: portal.level}]);
    assert.deepEqual(stepHubVisit(visit, 1, {...portal, grounded: true}), []);
  }
});

test('a safe return spawn arms an intentional same-portal visit', () => {
  for (const portal of HUB_PORTALS) {
    const visit = createHubVisit({lastLevel: portal.level, completed: [portal.level]});
    const spawn = hubSpawn(portal.level);
    assert.ok(Math.hypot(spawn.x - portal.x, spawn.z - portal.z) > HUB.portalReach);
    assert.deepEqual(stepHubVisit(visit, 1, {...portal, grounded: true}), []);
    stepHubVisit(visit, .1, {...spawn, grounded: true});
    assert.deepEqual(stepHubVisit(visit, 1, {...portal, grounded: true}), [{type: 'enter', level: portal.level}]);
    assert.ok(visit.completed.has(portal.level));
  }
});

test('the flower rewards familiar moves but leaves walking and distant moves alone', () => {
  const visit = createHubVisit();
  const here = {...HUB.toy, height: 0, grounded: true};
  assert.deepEqual(stepHubVisit(visit, .1, here), []);
  assert.equal(stepHubVisit(visit, .1, {...here, spin: true})[0].type, 'ring');
  assert.deepEqual(stepHubVisit(visit, .1, {...here, pound: true}), []);
  assert.equal(stepHubVisit(visit, 2, {...here, pound: true})[0].type, 'spring');
  assert.equal(visit.discoveries, 2);
  assert.deepEqual(stepHubVisit(visit, 2, {...here, height: 8, pound: true}), []);
});

test('garden rim preserves direction and stays inside the physical island', () => {
  assert.equal(hubBoundary(0, 0), null);
  const edge = hubBoundary(30, 40);
  assert.ok(Math.abs(Math.hypot(edge.x, edge.z) - HUB.boundary) < 1e-9);
  assert.equal(edge.nx, .6);
  assert.equal(edge.nz, .8);
});

test('optional stepping stones leave direct portal and return routes walkable', () => {
  const starts = [HUB.spawn, HUB.toy, ...HUB_PORTALS.map(p => hubSpawn(p.level))];
  const destinations = [HUB.toy, ...HUB_PORTALS];
  // Include Mirio's body and a small margin, not just each path's centre line.
  const clearance = HUB_STONE_RADIUS + .6;
  for (const from of starts) for (const to of destinations) for (const stone of HUB_STONES) {
    const dx = to.x - from.x, dz = to.z - from.z;
    const t = Math.max(0, Math.min(1, ((stone.x - from.x) * dx + (stone.z - from.z) * dz) / (dx * dx + dz * dz || 1)));
    const distance = Math.hypot(stone.x - from.x - t * dx, stone.z - from.z - t * dz);
    assert.ok(distance > clearance, `${JSON.stringify(from)} → ${to.level ?? 'flower'} crosses stone ${stone.x},${stone.z}`);
  }
});
