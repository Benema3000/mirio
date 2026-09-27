import assert from 'node:assert/strict';
import test from 'node:test';
import { QualityGovernor } from '../js/quality.js';

function governor() {
  let ratio = 2;
  const changes = [];
  const renderer = { getPixelRatio: () => ratio, setPixelRatio: value => { ratio = value; } };
  const quality = new QualityGovernor(renderer, { tier: 2, maxPixelRatio: 2, minPixelRatio: 0.6, onChange: level => changes.push(level) });
  return { quality, changes };
}

function run(quality, frames, frameTime) {
  for (let i = 0; i < frames; i++) quality.update(typeof frameTime === 'function' ? frameTime(i) : frameTime);
}

test('one shader or fullscreen hitch does not lower quality or poison the average', () => {
  const { quality, changes } = governor();
  run(quality, 30, 1 / 60);
  quality.update(0.7);
  run(quality, 120, 1 / 60);
  assert.equal(quality.level, 2);
  assert.equal(quality.pixelRatio, 2);
  assert.deepEqual(changes, []);
  // Main omits hidden/paused frames. The first long resumed gap is ignored.
  quality.update(45);
  run(quality, 120, 1 / 60);
  assert.equal(quality.level, 2);
});

test('sustained 2–3 fps lowers quality instead of discarding every slow frame', () => {
  const { quality, changes } = governor();
  run(quality, 20, 0.4);
  assert.equal(quality.level, 0);
  assert.ok(changes.includes(1), 'try fewer pixels first');
  assert.ok(changes.includes(0), 'then drop extras if the renderer is still slow');
  assert.ok(Number.isFinite(quality.pixelRatio) && quality.pixelRatio >= 0.6);
});

test('mixed very slow frames also trigger the fallback', () => {
  const { quality } = governor();
  run(quality, 30, i => [0.4, 0.18, 0.35][i % 3]);
  assert.equal(quality.level, 0);
});

test('a CPU-bound resolution probe restores sharpness and removes optional scenery', () => {
  const { quality, changes } = governor();
  run(quality, 70, 1 / 30);
  assert.equal(quality.pixelRatio, 2, 'blur does not help a CPU-bound scene');
  assert.equal(quality.level, 0, 'reduce optional draw calls instead');
  assert.deepEqual(changes.slice(0, 2), [1, 0]);
  // After a sustained improvement extras may return. If they overload the
  // scene again, the remembered resolution floor must not disable fallback.
  run(quality, 300, 1 / 60);
  assert.equal(quality.level, 2);
  run(quality, 40, 1 / 30);
  assert.equal(quality.level, 0);
});

test('when fewer pixels really help, resolution settles without dropping all extras', () => {
  const { quality } = governor();
  run(quality, 400, () => 0.008 * quality.pixelRatio ** 2);
  assert.equal(quality.level, 1);
  assert.equal(quality.pixelRatio, 1.5);
});

test('invalid frame samples leave finite, stable quality state', () => {
  const { quality } = governor();
  for (const value of [0, -1, NaN, Infinity]) quality.update(value);
  run(quality, 120, 1 / 60);
  assert.equal(quality.level, 2);
  assert.equal(quality.pixelRatio, 2);
});
