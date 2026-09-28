import assert from 'node:assert/strict';
import test from 'node:test';
import {HUB, HUB_PADS, HUB_SPAWN, HUB_SPRINGS, MOON_CENTER, MOON_DIR, createHubVisit, hubDir, hubDistance, hubPoint, hubReturn, hubSouvenir, stepHubVisit} from '../js/hub-rules.js';

const RADIUS = {home: HUB.radius, moon: HUB.moon.radius};
const height = (p) => (p.planet === 'moon' ? HUB.moon.planetHeight : HUB.planetHeight);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** A point `distance` units from `from` towards `to`, on a planet of `radius`. */
function toward(from, to, distance, radius = HUB.radius) {
  const angle = distance / radius, total = Math.acos(Math.min(1, from.reduce((s, v, i) => s + v * to[i], 0)));
  const t = angle / total, a = Math.sin((1 - t) * total), b = Math.sin(t * total), s = Math.sin(total);
  return from.map((v, i) => (v * a + to[i] * b) / s);
}
/** Somewhere on the same body as `p`, away from it: the spawn at home, the landing spot beside the race on the moon. */
const away = (p) => (p.planet === 'moon' ? hubReturn('kart').dir : HUB_SPAWN);

test('the Sternenhof has a pad for each of the six journeys, the race on the moon, and the spawn is on none', () => {
  assert.deepEqual(new Set(HUB_PADS.map(p => p.level)), new Set(['adventure', 'sky', 'kart', 'marble', 'ribbon', 'tilt']));
  assert.equal(HUB_PADS.find(p => p.level === 'kart').planet, 'moon');
  const visit = createHubVisit();
  assert.deepEqual(stepHubVisit(visit, 5, {planet: 'home', dir: HUB_SPAWN, grounded: true}), []);
  assert.equal(visit.near, null, 'no pad name at the spawn');
});

test('pads and springs keep apart, so two names never show at once, and the planets and the moon too', () => {
  for (const [i, a] of HUB_PADS.entries()) {
    for (const b of HUB_PADS.slice(i + 1)) {
      if (a.planet === b.planet) assert.ok(hubDistance(a.dir, b.dir, a.planet) > 2 * HUB.padNotice, `${a.level} and ${b.level} are too close`);
    }
    // A spring shows no name: standing on one, no pad name shows either.
    for (const s of HUB_SPRINGS.filter(s => s.planet === a.planet)) {
      assert.ok(hubDistance(a.dir, s.dir, a.planet) > HUB.padNotice + HUB.springReach, `${a.level} and ${s.id} are too close`);
    }
  }
  const planets = HUB_PADS.map(p => ({level: p.level, pos: hubPoint(p.planet, p.dir, height(p))}));
  for (const [i, a] of planets.entries()) {
    for (const b of planets.slice(i + 1)) assert.ok(dist3(a.pos, b.pos) > 2 * HUB.planetRadius + 3, `${a.level} and ${b.level} planets overlap`);
    const home = HUB_PADS.find(p => p.level === a.level).planet === 'home';
    if (home) assert.ok(dist3(a.pos, MOON_CENTER) > HUB.moon.radius + HUB.planetRadius + 2, `${a.level}'s planet touches the moon`);
  }
});

test('every pad on the planet and the moon spring are a short run from the spawn; Planetenreise is almost ahead', () => {
  const arc = (dir) => 2 * HUB.radius * Math.asin(hubDistance(HUB_SPAWN, dir) / (2 * HUB.radius));
  for (const p of HUB_PADS.filter(p => p.planet === 'home')) assert.ok(arc(p.dir) < 24, `${p.level} is ${arc(p.dir).toFixed(1)} units away`);
  assert.ok(arc(HUB_SPRINGS[0].dir) < 12, 'the spring to the moon is near the spawn');
  const first = HUB_PADS.filter(p => p.planet === 'home').reduce((a, b) => (arc(a.dir) < arc(b.dir) ? a : b));
  assert.equal(first.level, 'adventure');
  assert.ok(Math.abs(HUB_PADS[0].lon) < 20, 'Planetenreise is roughly straight ahead');
  const moonAngle = Math.atan2(MOON_DIR[0], -MOON_DIR[2]) * 180 / Math.PI;
  assert.ok(moonAngle > 0 && moonAngle < 45, 'the moon hangs ahead and to the right, in view from the spawn');
});

test('the name shown is that of the pad Mirio stands next to, on either body', () => {
  for (const p of HUB_PADS) {
    const visit = createHubVisit();
    stepHubVisit(visit, .1, {planet: p.planet, dir: toward(p.dir, away(p), 2.5, RADIUS[p.planet]), grounded: true});
    assert.equal(visit.near?.level, p.level);
    stepHubVisit(visit, .1, {planet: p.planet === 'moon' ? 'home' : 'moon', dir: p.dir, grounded: true});
    assert.notEqual(visit.near?.level, p.level, 'the same direction on the other body is not near');
  }
});

test('standing on a pad launches once; jumping over it does not', () => {
  for (const p of [HUB_PADS[0], HUB_PADS.find(p => p.planet === 'moon')]) {
    const flying = createHubVisit();
    assert.deepEqual(stepHubVisit(flying, 1, {planet: p.planet, dir: p.dir, grounded: false}), []);
    const visit = createHubVisit();
    assert.deepEqual(stepHubVisit(visit, HUB.approachTime / 2, {planet: p.planet, dir: p.dir, grounded: true}), []);
    assert.deepEqual(stepHubVisit(visit, HUB.approachTime, {planet: p.planet, dir: p.dir, grounded: true}), [{type: 'launch', level: p.level}]);
    assert.deepEqual(stepHubVisit(visit, 1, {planet: p.planet, dir: p.dir, grounded: true}), [], 'only once');
  }
});

test('running across a pad on the way to another does not launch it', () => {
  const RUN_SPEED = 9, dt = 1 / 60;
  for (const p of HUB_PADS) {
    const visit = createHubVisit(), radius = RADIUS[p.planet];
    // A straight run through the pad's centre, from 3 units before to 3 after.
    const before = toward(p.dir, away(p), 3, radius);
    const after = p.dir.map((v, i) => 2 * v - before[i]);
    const len = Math.hypot(...after), end = after.map(v => v / len);
    for (let t = 0; t <= 6 / RUN_SPEED; t += dt) {
      const k = t * RUN_SPEED / 6, point = before.map((v, i) => v + (end[i] - v) * k), n = Math.hypot(...point);
      assert.deepEqual(stepHubVisit(visit, dt, {planet: p.planet, dir: point.map(v => v / n), grounded: true}), [], `${p.level} launched`);
    }
  }
});

test('coming back, Mirio lands beside his pad, on its body, and the pad waits until he steps away', () => {
  for (const p of HUB_PADS) {
    const back = hubReturn(p.level);
    assert.equal(back.planet, p.planet);
    assert.ok(hubDistance(back.dir, p.dir, p.planet) >= HUB.padRelease, `${p.level}: the return spot is on the pad`);
    for (const other of HUB_PADS.filter(o => o.planet === p.planet)) assert.ok(hubDistance(back.dir, other.dir, p.planet) > HUB.padReach, `${p.level}: returns onto ${other.level}`);
    for (const spring of HUB_SPRINGS.filter(s => s.planet === p.planet)) assert.ok(hubDistance(back.dir, spring.dir, p.planet) > HUB.springRelease, `${p.level}: returns onto a spring`);
    const visit = createHubVisit({lastLevel: p.level});
    assert.deepEqual(stepHubVisit(visit, 1, {planet: p.planet, dir: toward(p.dir, back.dir, 1, RADIUS[p.planet]), grounded: true}), [], 'the pad waits');
    stepHubVisit(visit, .1, {planet: p.planet, dir: back.dir, grounded: true});
    assert.equal(visit.blocked, null, 'stepping away frees it');
    stepHubVisit(visit, .1, {planet: p.planet, dir: p.dir, grounded: true});
    assert.deepEqual(stepHubVisit(visit, 1, {planet: p.planet, dir: p.dir, grounded: true}), [{type: 'launch', level: p.level}]);
  }
  assert.deepEqual(hubReturn('unknown'), {planet: 'home', dir: [...HUB_SPAWN]});
});

test('the spring hops Mirio to the moon and back; the one he lands on waits until he steps off it', () => {
  const [up, down] = HUB_SPRINGS, visit = createHubVisit();
  assert.deepEqual(stepHubVisit(visit, .1, {planet: 'home', dir: up.dir, grounded: false}), [], 'no hop in the air');
  assert.deepEqual(stepHubVisit(visit, .1, {planet: 'home', dir: up.dir, grounded: true}), [{type: 'hop', to: 'moon'}]);
  assert.deepEqual(stepHubVisit(visit, .1, {planet: 'home', dir: up.dir, grounded: true}), [], 'one hop per visit to the flower');
  // Landing on the moon's spring: it waits.
  assert.deepEqual(stepHubVisit(visit, .1, {planet: 'moon', dir: down.dir, grounded: true}), []);
  stepHubVisit(visit, .1, {planet: 'moon', dir: toward(down.dir, hubReturn('kart').dir, HUB.springRelease + .3, HUB.moon.radius), grounded: true});
  assert.equal(visit.springBlocked, null, 'stepping off frees it');
  assert.deepEqual(stepHubVisit(visit, .1, {planet: 'moon', dir: down.dir, grounded: true}), [{type: 'hop', to: 'home'}]);
  assert.deepEqual(stepHubVisit(visit, .1, {planet: 'home', dir: up.dir, grounded: true}), [], 'the home spring waits too');
});

test('completed journeys are remembered; unknown ones are ignored', () => {
  const visit = createHubVisit({completed: ['kart', 'nowhere'], lastLevel: 'nowhere'});
  assert.deepEqual([...visit.completed], ['kart']);
  assert.equal(visit.blocked, null);
  assert.deepEqual(hubDir(90, 0).map(v => Math.round(v * 1e9) / 1e9 + 0), [0, 1, 0]);
});

test('a finished journey leaves a souvenir by its pad, clear of pads, springs and landing spots', () => {
  for (const p of HUB_PADS) {
    const souvenir = hubSouvenir(p.level);
    assert.equal(souvenir.planet, p.planet);
    for (const other of HUB_PADS.filter(o => o.planet === p.planet)) assert.ok(hubDistance(souvenir.dir, other.dir, p.planet) > HUB.padReach + .5, `${p.level}'s souvenir stands on ${other.level}`);
    for (const spring of HUB_SPRINGS.filter(s => s.planet === p.planet)) assert.ok(hubDistance(souvenir.dir, spring.dir, p.planet) > HUB.springReach + HUB.souvenirReach, `${p.level}'s souvenir by a spring`);
    assert.ok(hubDistance(souvenir.dir, hubReturn(p.level).dir, p.planet) > HUB.souvenirReach, `${p.level}'s souvenir on its landing spot`);
    const unfinished = createHubVisit();
    stepHubVisit(unfinished, .1, {planet: p.planet, dir: souvenir.dir, grounded: true});
    assert.equal(unfinished.souvenirNear, null, 'no souvenir before the journey is finished');
    const finished = createHubVisit({completed: [p.level]});
    assert.deepEqual(stepHubVisit(finished, .1, {planet: p.planet, dir: souvenir.dir, grounded: true}), []);
    assert.equal(finished.souvenirNear, p.level);
  }
});
