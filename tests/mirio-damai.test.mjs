import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { animateDamai, buildDamai, DAMAI, DamaiGuide } from '../js/damai.js';

const DT = 1 / 60;
/** Straight along x for 100 m, then a left turn along z to s = 140. */
const flat = () => [
  { s: 0, x: 0, z: 0, h: 0 },
  { s: 100, x: 100, z: 0, h: 0 },
  { s: 140, x: 100, z: 40, h: 0 },
];
/** A 4 m gap at s = 30 onto a 0.5 m higher bank. */
const gapped = () => [
  { s: 0, x: 0, z: 0, h: 0 },
  { s: 30, x: 30, z: 0, h: 0, hop: true },
  { s: 34, x: 34, z: 0, h: 0.5 },
  { s: 80, x: 80, z: 0, h: 0.5 },
];
/** Steps `guide` for `seconds`, moving the player with `walk(player, t)`. */
function run(guide, player, seconds, walk = () => {}, each = () => {}) {
  const events = [];
  for (let t = 0; t < seconds; t += DT) {
    walk(player, t);
    events.push(...guide.step(DT, player));
    each(guide, player);
  }
  return events;
}
const barks = events => events.filter(e => e.type === 'bark').length;

test('Damai sits at the start until Mirio comes close, then barks once', () => {
  const guide = new DamaiGuide(flat());
  assert.deepEqual(run(guide, { s: -20 }, 3), [], 'nothing while Mirio is far away');
  assert.deepEqual(run(guide, null, 1), [], 'nothing while Mirio is off the route');
  assert.equal(guide.snapshot().state, 'sit');
  assert.equal(guide.snapshot().met, false);
  assert.equal(guide.s, 0);

  const player = { s: -DAMAI.meetRadius - 0.5 };
  assert.deepEqual(guide.step(DT, player), []);
  player.s = -DAMAI.meetRadius + 0.1;
  assert.deepEqual(guide.step(DT, player), [{ type: 'bark' }]);
  assert.equal(guide.snapshot().state, 'bark');
  assert.equal(guide.snapshot().met, true);
  assert.equal(barks(run(guide, player, 3)), 0, 'the greeting is a single bark');
});

test('a Mirio who already ran past the start is met too', () => {
  const guide = new DamaiGuide(flat());
  assert.deepEqual(guide.step(DT, { s: 30 }), [{ type: 'bark' }]);
});

test('he leads Mirio inside the 5–8 m band at any walking pace', () => {
  for (const pace of [1.5, 3, 5, DAMAI.runSpeed]) {
    const guide = new DamaiGuide(flat());
    const player = { s: -6 };
    run(guide, player, 1);
    let low = Infinity, high = -Infinity, top = 0;
    run(guide, player, 12, (p, t) => { p.s += pace * DT; }, (g, p) => {
      top = Math.max(top, g.speed);
      if (g.s > 20) { low = Math.min(low, g.s - p.s); high = Math.max(high, g.s - p.s); }
    });
    assert.ok(low >= DAMAI.leadMin && high <= DAMAI.leadMax, `pace ${pace}: lead ${low.toFixed(2)}..${high.toFixed(2)}`);
    assert.ok(top <= DAMAI.runSpeed + 1e-9);
    assert.equal(guide.snapshot().state, 'run');
  }
});

test('he stands and waits when Mirio stops, without running off', () => {
  const guide = new DamaiGuide(flat());
  const player = { s: -5 };
  run(guide, player, 1);
  run(guide, player, 4, p => { p.s += 4 * DT; });
  const events = run(guide, player, 5);
  assert.deepEqual(events, []);
  assert.ok(guide.s - player.s <= DAMAI.leadMax && guide.s - player.s >= DAMAI.leadMin);
  assert.equal(guide.snapshot().state, 'idle');
});

test('when Mirio falls far behind he waits, looks back, barks once, then leads on', () => {
  const guide = new DamaiGuide(flat());
  const player = { s: -5 };
  run(guide, player, 1);
  run(guide, player, 5, p => { p.s += 4 * DT; });
  const where = guide.s;
  // Mirio falls off and restarts 10 m back.
  player.s -= 10;
  const events = run(guide, player, 4);
  assert.equal(barks(events), 1);
  assert.equal(guide.snapshot().state, 'wait');
  assert.equal(guide.s, where, 'he does not come back, he waits');
  assert.equal(barks(run(guide, player, 3, p => { p.s += 1 * DT; })), 0, 'still waiting, no more barks');

  run(guide, player, 6, p => { p.s += 4 * DT; });
  assert.equal(guide.snapshot().state, 'run');
  assert.ok(guide.s > where);
  assert.ok(guide.s - player.s >= DAMAI.leadMin && guide.s - player.s <= DAMAI.leadMax);
});

test('he hops a gap on an arc above both banks and lands on the far side', () => {
  const route = gapped();
  const guide = new DamaiGuide(route);
  const player = { s: -5 };
  run(guide, player, 1);
  let peak = -Infinity, airborne = 0, hopsAt = [];
  const events = run(guide, player, 14, p => { p.s = Math.min(p.s + 4 * DT, 70); }, g => {
    const snap = g.snapshot();
    if (snap.state === 'jump') {
      airborne += DT;
      peak = Math.max(peak, snap.h);
      assert.ok(snap.x >= 30 - 1e-9 && snap.x <= 34 + 1e-9, 'flies straight across the gap');
      assert.ok(snap.h >= -1e-9);
    }
    if (snap.s > 30 && snap.s < 34) hopsAt.push(snap.state);
  });
  assert.equal(events.filter(e => e.type === 'hop').length, 1);
  assert.ok(hopsAt.every(state => state === 'jump'), 'never walks inside the gap');
  assert.ok(Math.abs(airborne - DAMAI.hopTime) < 2 * DT, `airborne ${airborne}`);
  assert.ok(Math.abs(peak - (0.5 + DAMAI.hopPeak)) < 0.05, `peak ${peak}`);
  assert.ok(guide.s > 34);
  assert.equal(guide.snapshot().h, 0.5);
});

test('he sits at the end of the route and never runs past it', () => {
  const route = flat();
  const guide = new DamaiGuide(route);
  const player = { s: -5 };
  run(guide, player, 1);
  run(guide, player, 60, p => { p.s += 6 * DT; }, g => assert.ok(g.s <= 140));
  const snap = guide.snapshot();
  assert.equal(snap.s, 140);
  assert.equal(snap.state, 'sit');
  assert.deepEqual([snap.x, snap.z], [100, 40]);
  assert.deepEqual(run(guide, { s: 0 }, 5), [], 'no waiting or barking once he is home');
  assert.equal(guide.snapshot().state, 'sit');
});

test('he never goes backwards, whatever Mirio does', () => {
  const guide = new DamaiGuide(gapped());
  const player = { s: -5 };
  let seed = 7, last = guide.s;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  run(guide, player, 60, (p, t) => {
    if (random() < 0.01) p.s -= 15 * random();
    else p.s += (random() * 9 - 2) * DT;
  }, g => {
    assert.ok(g.s >= last - 1e-12, `from ${last} back to ${g.s}`);
    assert.ok(g.s <= 80);
    last = g.s;
  });
  run(guide, null, 2, () => {}, g => assert.ok(g.s >= last));
});

test('snapshot interpolates position and height along the route, and faces along it', () => {
  const route = [
    { s: 0, x: 0, z: 0, h: 0 },
    { s: 10, x: 6, z: 8, h: 2 },
    { s: 20, x: 6, z: 18, h: 1 },
  ];
  const guide = new DamaiGuide(route);
  guide.s = 5;
  let snap = guide.snapshot();
  assert.deepEqual([snap.x, snap.z, snap.h], [3, 4, 1]);
  assert.ok(Math.abs(snap.facing[0] - 0.6) < 1e-12 && Math.abs(snap.facing[1] - 0.8) < 1e-12);
  guide.s = 17.5;
  snap = guide.snapshot();
  assert.deepEqual([snap.x, snap.z, snap.h], [6, 15.5, 1.25]);
  assert.deepEqual(snap.facing, [0, 1]);
  guide.s = 0;
  assert.deepEqual(guide.snapshot().facing.map(v => Math.round(v * 10) / 10), [0.6, 0.8]);
});

test('riding the log he just sits, and follows again after', () => {
  const guide = new DamaiGuide(flat());
  guide.ride(true);
  assert.equal(guide.snapshot().state, 'sit');
  assert.equal(guide.snapshot().met, true);
  assert.deepEqual(run(guide, { s: 60 }, 2), []);
  assert.equal(guide.s, 0);
  guide.ride(false);
  run(guide, { s: 60 }, 2);
  assert.ok(guide.s > 0);
});

test('reset puts him back at the start, and a broken route is refused', () => {
  const guide = new DamaiGuide(flat());
  run(guide, { s: 20 }, 3);
  guide.reset();
  assert.deepEqual(guide.snapshot(), { s: 0, x: 0, z: 0, h: 0, facing: [1, 0], state: 'sit', met: false, speed: 0 });
  assert.throws(() => new DamaiGuide([{ s: 0, x: 0, z: 0, h: 0 }]));
  assert.throws(() => new DamaiGuide([{ s: 0, x: 0, z: 0, h: 0 }, { s: 0, x: 1, z: 0, h: 0 }]));
  assert.throws(() => new DamaiGuide([{ s: 0, x: 0, z: 0, h: 0 }, { s: 1, x: 1, z: 0 }]));
  assert.ok(Object.isFrozen(DAMAI));
});

test('the pug builds and poses under node: about 0.9 tall, 1.1 long, facing +Z', () => {
  const model = buildDamai();
  for (const key of ['group', 'body', 'head', 'tail', 'tongue']) assert.ok(model[key]?.isObject3D, key);
  assert.equal(model.legs.length, 4);
  assert.equal(model.ears.length, 2);
  model.group.updateMatrixWorld(true);
  const size = new Box3().setFromObject(model.group).getSize(new Vector3());
  assert.ok(size.y > 0.8 && size.y < 1, `height ${size.y}`);
  assert.ok(size.z > 1 && size.z < 1.2, `length ${size.z}`);
  const nose = new Vector3();
  model.head.getWorldPosition(nose);
  assert.ok(nose.z > 0.2, 'the head is at +Z');

  const pose = () => [model.body, model.head, model.tail, ...model.legs, ...model.ears]
    .flatMap(o => [o.position.y, o.rotation.x, o.rotation.y, o.rotation.z]).map(v => v + 0);
  for (const state of ['idle', 'run', 'sit', 'jump', 'bark', 'wait']) {
    animateDamai(model, state, 1.3, { speed: 5 });
    assert.ok(pose().every(Number.isFinite), state);
    animateDamai(model, state, 1.3, { speed: 5, reducedMotion: true });
    const still = pose();
    animateDamai(model, state, 2.7, { speed: 5, reducedMotion: true });
    assert.deepEqual(pose(), still, `${state} holds still with reduced motion`);
  }
  animateDamai(model, 'wait', 0);
  assert.ok(Math.abs(model.head.rotation.y) > 1.9, 'waiting, he looks back at Mirio');
  animateDamai(model, 'run', 0.4, { speed: 6 });
  const stride = model.legs[0].rotation.x;
  animateDamai(model, 'run', 0.5, { speed: 6 });
  assert.notEqual(model.legs[0].rotation.x, stride, 'the legs gallop');
  animateDamai(model, 'jump', 0);
  assert.ok(model.legs[0].rotation.x < 0 && model.legs[2].rotation.x > 0, 'legs tucked in the air');
});
