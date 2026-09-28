import assert from 'node:assert/strict';
import test from 'node:test';
import {HUB, HUB_PORTALS, HUB_STONES, HUB_STONE_RADIUS, createHubVisit, hubBoundary, hubSpawn, hubSouvenir, hubChorusReady, stepHubVisit} from '../js/hub-rules.js';

test('all destinations are visible on a compact safe cap and central spawn cannot enter', () => {
  assert.deepEqual(new Set(HUB_PORTALS.map(p => p.level)), new Set(['adventure', 'sky', 'marble', 'tilt', 'ribbon', 'kart']));
  const visit = createHubVisit();
  for (const portal of HUB_PORTALS) assert.ok(Math.hypot(portal.x, portal.z) + HUB.portalReach < HUB.boundary);
  assert.deepEqual(stepHubVisit(visit, 5, {...HUB.spawn, grounded: true}), []);
});

test('souvenirs require completion and a nearby spin, once per visit', () => {
  const visit = createHubVisit({completed: ['sky']}), sky = {...hubSouvenir('sky'), height: 0, grounded: true};
  assert.deepEqual(stepHubVisit(visit, .1, sky), []);
  assert.deepEqual(stepHubVisit(visit, .1, {...hubSouvenir('ribbon'), height: 0, spin: true}), []);
  assert.deepEqual(stepHubVisit(visit, .1, {...sky, height: 5, spin: true}), []);
  assert.deepEqual(stepHubVisit(visit, .1, {...sky, spin: true}), [{type: 'hubEcho', level: 'sky'}]);
  assert.deepEqual(stepHubVisit(visit, .1, {...sky, spin: true}), []);
  assert.equal(createHubVisit({completed: ['sky']}).echoes.size, 0);
});

test('all completed echoes and at least two worlds unlock the optional central chorus', () => {
  for (const completed of [[], ['sky'], ['sky', 'ribbon'], HUB_PORTALS.map(p => p.level)]) {
    const visit = createHubVisit({completed});
    const flower = {...HUB.toy, height: 0, grounded: true, spin: true};
    assert.equal(stepHubVisit(visit, .1, flower).some(e => e.type === 'hubChorus'), false);
    for (const level of completed) stepHubVisit(visit, .1, {...hubSouvenir(level), height: 0, spin: true});
    assert.equal(hubChorusReady(visit), completed.length >= HUB.chorusMinimum);
    const events = stepHubVisit(visit, 2, flower);
    assert.equal(events.some(e => e.type === 'hubChorus'), completed.length >= HUB.chorusMinimum);
    assert.ok(events.some(e => e.kind === 'hubFlower'), 'the ordinary flower still works');
    assert.equal(stepHubVisit(visit, 2, flower).some(e => e.type === 'hubChorus'), false, 'a playing chorus cannot stack');
  }
});

test('souvenir interaction areas never overlap a portal entrance or the central flower', () => {
  for (const portal of HUB_PORTALS) {
    const souvenir = hubSouvenir(portal.level);
    for (const entrance of HUB_PORTALS) assert.ok(Math.hypot(souvenir.x - entrance.x, souvenir.z - entrance.z) > HUB.echoReach + HUB.portalReach);
    assert.ok(Math.hypot(souvenir.x - HUB.toy.x, souvenir.z - HUB.toy.z) > HUB.echoReach + HUB.toyReach);
    for (const other of HUB_PORTALS) {
      if (other.level === portal.level) continue;
      const neighbor = hubSouvenir(other.level);
      assert.ok(Math.hypot(souvenir.x - neighbor.x, souvenir.z - neighbor.z) > HUB.echoReach * 2, `${portal.level} and ${other.level} echoes overlap`);
    }
  }
});

test('nearby signs name the gate Mirio stands in front of', () => {
  for (const portal of HUB_PORTALS) {
    const visit = createHubVisit();
    const toSpawn = Math.hypot(HUB.spawn.x - portal.x, HUB.spawn.z - portal.z);
    const x = portal.x + (HUB.spawn.x - portal.x) * 3 / toSpawn, z = portal.z + (HUB.spawn.z - portal.z) * 3 / toSpawn;
    stepHubVisit(visit, .1, {x, z, height: 0, grounded: true});
    assert.equal(visit.near?.level, portal.level);
  }
});

test('unknown saved worlds cannot block the chorus; a missing available echo can', () => {
  const visit = createHubVisit({completed: ['sky', 'ribbon', 'old-world']});
  stepHubVisit(visit, .1, {...hubSouvenir('sky'), height: 0, spin: true});
  assert.equal(hubChorusReady(visit), false);
  stepHubVisit(visit, .1, {...hubSouvenir('ribbon'), height: 0, spin: true});
  assert.equal(hubChorusReady(visit), true);
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

test('direct return routes cannot enter a different portal on the way', () => {
  const starts = [HUB.spawn, ...HUB_PORTALS.map(p => hubSpawn(p.level))];
  for (const from of starts) for (const to of HUB_PORTALS) for (const other of HUB_PORTALS) {
    if (other === to) continue;
    const dx = to.x - from.x, dz = to.z - from.z;
    const t = Math.max(0, Math.min(1, ((other.x - from.x) * dx + (other.z - from.z) * dz) / (dx * dx + dz * dz)));
    const distance = Math.hypot(other.x - from.x - t * dx, other.z - from.z - t * dz);
    assert.ok(distance > HUB.portalReach, `route to ${to.level} enters ${other.level}`);
  }
});
