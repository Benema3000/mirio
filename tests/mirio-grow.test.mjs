import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import { GROW, GrowCutscene, growFrame } from '../js/grow-cutscene.js';

const DT = 1 / 60;
const times = (end) => Array.from({ length: Math.ceil(end / DT) + 1 }, (_, i) => i * DT);

/** A stand-in for mirio-model.js's toy: the joints the cutscene poses. */
function toy(scale = 1) {
  const m = { group: new Group(), body: new Group(), head: new Group(), armRestZ: { L: -1, R: 1 }, armRaisedZ: { L: -2.4, R: 2.4 } };
  for (const k of ['legL', 'legR', 'armL', 'armR', 'elbowL', 'elbowR', 'handL', 'handR']) m[k] = new Group();
  m.group.scale.setScalar(scale);
  return m;
}

/** Mirio standing at the origin facing +Z, the camera rig 11 m behind and above him. */
function stage() {
  const small = toy(), big = toy(1.25), bursts = [];
  const player = { body: { pos: new Vector3(), up: new Vector3(0, 1, 0) }, facing: new Vector3(0, 0, 1) };
  const cutscene = new GrowCutscene(new Scene(), { small, big, player, particles: { burst: (pos, o) => bursts.push(o) } });
  const rig = { pos: new Vector3(0, 5, -10), focus: new Vector3(0, 1.4, 0), up: new Vector3(0, 1, 0), keepOutside() {} };
  return { small, big, player, cutscene, rig, bursts, camera: new PerspectiveCamera() };
}

test('the grow cutscene lasts between two and three seconds and ends as big Mirio at full size', () => {
  assert.ok(GROW.duration >= 2 && GROW.duration <= 3);
  const start = growFrame(0), end = growFrame(GROW.duration);
  assert.equal(start.form, 'small');
  assert.equal(start.size, 1);
  assert.equal(start.done, false);
  assert.deepEqual([end.form, end.size, end.swing, end.flash, end.done], ['big', 1, 0, 0, true]);
});

test('Mirio flickers between small and big, each big step bigger, then settles after an overshoot', () => {
  const frames = times(GROW.duration).map(t => growFrame(t));
  const forms = frames.map(f => f.form).filter((f, i, all) => f !== all[i - 1]);
  assert.deepEqual(forms, ['small', 'big', 'small', 'big', 'small', 'big']);
  const bigSteps = GROW.pulses.filter(([, form]) => form === 'big').map(([, , size]) => size);
  assert.ok(bigSteps.every((s, i) => i === 0 || s > bigSteps[i - 1]), `big steps ${bigSteps}`);
  assert.ok(Math.max(...frames.map(f => (f.form === 'big' ? f.size : 0))) > 1, 'no overshoot');
  assert.ok(frames.filter(f => f.form === 'big').every(f => f.size >= 0.69), 'big Mirio never smaller than small Mirio');
  const last = GROW.pulses.at(-1)[0];
  assert.equal(growFrame(last + GROW.settle).size, 1);
});

test('the camera swings out to the front, holds there while he grows, and swings back', () => {
  const swing = t => growFrame(t).swing;
  assert.equal(swing(0), 0);
  assert.equal(swing(GROW.swingOut[1]), 1);
  for (const [at] of GROW.pulses) assert.equal(swing(at), 1, `the camera is not in front at ${at} s`);
  assert.equal(swing(GROW.swingBack[1]), 0);
  const all = times(GROW.duration).map(swing);
  assert.ok(all.every(s => s >= 0 && s <= 1));
  // Smooth: no frame jumps more than a tenth of the way.
  assert.ok(all.every((s, i) => i === 0 || Math.abs(s - all[i - 1]) < 0.1));
});

test('the flash and the cheer come with the last step', () => {
  const last = GROW.pulses.at(-1)[0];
  assert.equal(growFrame(last - 0.01).flash, 0);
  assert.equal(growFrame(last).flash, 1);
  assert.ok(growFrame(last + GROW.flash / 2).flash > 0);
  assert.ok(growFrame(last + GROW.flash).flash < 1e-9);
  assert.ok(growFrame((GROW.cheer[0] + GROW.cheer[1]) / 2).cheer > 0.99);
  assert.ok(growFrame(GROW.swingBack[0]).cheer < 1e-9);
});

test('with reduced motion there is no swing, no flicker and no flash, and it is short', () => {
  const frames = times(GROW.quietDuration).map(t => growFrame(t, { quiet: true }));
  assert.ok(frames.every(f => f.swing === 0 && f.flash === 0 && f.cheer === 0));
  const forms = frames.map(f => f.form).filter((f, i, all) => f !== all[i - 1]);
  assert.deepEqual(forms, ['small', 'big']);
  const big = frames.filter(f => f.form === 'big').map(f => f.size);
  assert.ok(big.every((s, i) => i === 0 || s >= big[i - 1]), 'big Mirio only grows');
  assert.equal(big.at(-1), 1);
  assert.ok(growFrame(GROW.quietDuration, { quiet: true }).done);
  assert.ok(GROW.quietDuration < 1.5);
});

test('playing it: a sound and sparkles for every step, then big Mirio, and the camera back where the rig is', () => {
  const s = stage();
  s.cutscene.render(s.camera, s.rig);
  s.cutscene.start();
  const events = [];
  let front = 0;
  while (s.cutscene.active) {
    events.push(...s.cutscene.step(DT));
    if (!s.cutscene.render(s.camera, s.rig)) break;
    // In front of him means on his +Z side, looking back at him.
    front = Math.max(front, s.camera.position.z);
  }
  assert.deepEqual(events.map(e => e.type), ['spring', 'spring', 'spring', 'spring', 'triple']);
  assert.equal(s.bursts.length, GROW.pulses.length);
  assert.ok(front > 4, `the camera only got to z = ${front}`);
  assert.equal(s.big.group.visible, true);
  assert.equal(s.small.group.visible, false);
  assert.equal(s.big.group.scale.x, 1.25);
  assert.equal(s.small.group.scale.x, 1);
  assert.equal(s.cutscene.render(s.camera, s.rig), false, 'the rig has the camera again');
});

test('the camera starts and ends exactly at the rig, so nothing jumps', () => {
  const s = stage();
  s.cutscene.start();
  s.cutscene.render(s.camera, s.rig);
  assert.ok(s.camera.position.distanceTo(s.rig.pos) < 1e-9);
  while (s.cutscene.t < GROW.swingBack[1]) s.cutscene.step(DT);
  assert.ok(s.cutscene.render(s.camera, s.rig), 'still playing');
  assert.ok(s.camera.position.distanceTo(s.rig.pos) < 1e-6);
});

test('stopping early (reset, seek) leaves big Mirio at his own size and the flash off', () => {
  const s = stage();
  s.cutscene.start();
  for (let t = 0; t < GROW.pulses.at(-1)[0] + 0.05; t += DT) { s.cutscene.step(DT); s.cutscene.render(s.camera, s.rig); }
  assert.ok(s.cutscene.flash.visible);
  s.cutscene.stop();
  assert.equal(s.cutscene.active, false);
  assert.equal(s.cutscene.flash.visible, false);
  assert.equal(s.big.group.scale.x, 1.25);
  assert.deepEqual(s.cutscene.step(DT), []);
});

test('reduced motion, as the last render saw it, picks the quiet version and keeps the camera still', () => {
  const s = stage();
  s.cutscene.render(s.camera, s.rig, { reducedMotion: true });
  s.cutscene.start();
  let seconds = 0;
  while (s.cutscene.active) {
    assert.deepEqual(s.cutscene.step(DT), []);
    seconds += DT;
    if (s.cutscene.render(s.camera, s.rig, { reducedMotion: true })) assert.ok(s.camera.position.distanceTo(s.rig.pos) < 1e-9);
  }
  assert.ok(Math.abs(seconds - GROW.quietDuration) < 2 * DT);
  assert.equal(s.bursts.length, 1);
});
