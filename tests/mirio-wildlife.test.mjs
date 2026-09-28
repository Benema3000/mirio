import test from 'node:test';
import assert from 'node:assert/strict';
import { InstancedMesh, Matrix4, MeshBasicMaterial, PerspectiveCamera, Quaternion, Scene, SphereGeometry, Vector3 } from 'three';
import { makeLevel } from '../js/level.js';
import { Wildlife } from '../js/wildlife.js';
import { inWater, surfacePoint } from '../js/world.js';

function setup() {
  const level = makeLevel();
  const scene = new Scene();
  const wildlife = new Wildlife(scene, level);
  const player = { state: 'play', body: { pos: surfacePoint(level.spawn.planet, level.spawn.dir) } };
  const camera = new PerspectiveCamera();
  camera.position.set(-9, 34, 0); camera.lookAt(player.body.pos); camera.updateMatrixWorld();
  let time = 0;
  return { level, scene, wildlife, player, camera,
    tick(frames = 1, options = {}) {
      const events = [];
      for (let i = 0; i < frames; i++) { time += 1 / 60; events.push(...wildlife.update(1 / 60, time, player, { camera, ...options })); }
      return events;
    } };
}

test('a few birds and two squirrels: the rigs share a bounded draw budget and use positive transforms', () => {
  const f = setup();
  assert.deepEqual(f.wildlife.counts, { bird: 5, squirrel: 2 });
  f.tick();
  const matrix = new Matrix4();
  for (const mesh of f.wildlife.models.group.children) {
    assert.ok(mesh.isInstancedMesh);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      assert.ok(matrix.elements.every(Number.isFinite));
      assert.ok(matrix.determinant() >= 0, 'negative instance transforms invert front-face culling');
    }
  }
  assert.ok(f.wildlife.snapshot().visible <= 5, 'a few birds, not a crowd');
  f.wildlife.dispose();
  assert.equal(f.scene.children.length, 0);
});

test('ground animals spawn and roam on dry, unobstructed spherical terrain', () => {
  const f = setup();
  for (const animal of f.wildlife.animals) {
    if (animal.height === 0) assert.ok(f.wildlife.safe(animal.dir), animal.id);
  }
  // Move the player between habitats to exercise escape, detours and return,
  // then let normal foraging continue. Long frames are deliberately capped.
  for (let i = 0; i < 3000; i++) {
    if (i % 300 === 0) f.player.body.pos.copy(f.wildlife.animals[Math.floor(i / 300) % f.wildlife.animals.length].pos);
    if (i % 300 === 90) f.player.body.pos.set(0, -26, 0);
    f.tick();
    for (const animal of f.wildlife.animals) {
      assert.ok(Math.abs(animal.dir.length() - 1) < 1e-8, `${animal.id} left the sphere`);
      assert.ok(animal.pos.toArray().every(Number.isFinite));
      if (animal.height < .2 && !['flee', 'return', 'descend', 'circle', 'perch'].includes(animal.state)) {
        assert.equal(inWater(animal.pos, f.wildlife.planet), false, `${animal.id} entered the lake`);
        assert.ok(f.wildlife.safe(animal.dir), `${animal.id} entered a solid prop`);
      }
    }
  }
  f.wildlife.dispose();
});

test('approached bluebirds take wing and settle on a tree again', () => {
  const f = setup();
  const bird = f.wildlife.animals.find(animal => animal.kind === 'bird');
  f.player.body.pos.copy(bird.pos);
  const before = bird.pos.clone();
  const events = f.tick();
  assert.equal(bird.state, 'flee');
  assert.ok(events.some(event => event.type === 'wildlifeMeet' && event.kind === 'bird'));
  f.tick(45);
  assert.ok(bird.height > 2.5);
  assert.ok(bird.pos.distanceTo(before) > 3);
  f.player.body.pos.set(0, -26, 0);
  const seen = new Set();
  for (let i = 0; i < 900; i++) { f.tick(); seen.add(bird.state); }
  assert.ok(seen.has('return'));
  assert.ok(seen.has('perch'));
  f.wildlife.dispose();
});

test('the birds are met once, and replay puts them back where they were', () => {
  const f = setup();
  const original = f.wildlife.layout();
  const meet = [];
  for (const animal of f.wildlife.animals.filter(item => item.kind === 'bird').slice(0, 2)) {
    f.player.body.pos.copy(animal.pos);
    meet.push(...f.tick(3).filter(event => event.type === 'wildlifeMeet'));
  }
  assert.equal(meet.filter(event => event.kind === 'bird').length, 1);
  assert.deepEqual(f.wildlife.snapshot().discovered, ['bird']);
  f.wildlife.reset();
  assert.deepEqual(f.wildlife.snapshot().discovered, []);
  assert.deepEqual(f.wildlife.layout(), original);
  for (const animal of f.wildlife.animals) assert.ok(animal.dir.distanceTo(animal.spawn) < 1e-8);
  f.wildlife.dispose();
});

test('story scenes freeze wildlife and quality tiers retain nearby animals', () => {
  const f = setup();
  f.tick();
  const before = f.wildlife.animals.map(animal => ({ state: animal.state, age: animal.age, pos: animal.pos.toArray() }));
  assert.deepEqual(f.tick(30, { active: false }), []);
  assert.equal(f.wildlife.models.group.visible, false);
  assert.equal(f.wildlife.snapshot().visible, 0);
  assert.deepEqual(f.wildlife.animals.map(animal => ({ state: animal.state, age: animal.age, pos: animal.pos.toArray() })), before);
  f.wildlife.setQuality(0); f.tick();
  const visible = f.wildlife.animals.filter(animal => animal.visible);
  assert.ok(visible.filter(animal => animal.kind === 'bird').length <= 3);
  assert.ok(visible.filter(animal => animal.kind === 'squirrel').length <= 1);
  // Looking from the far side cannot render the starting animals through it.
  f.camera.position.set(0, -40, 0); f.camera.updateMatrixWorld(); f.tick();
  assert.equal(f.wildlife.animals[0].visible, false);
  f.wildlife.dispose();
});


test('perched feet meet the actual scaled instanced canopy instead of an estimated tree height', () => {
  const level = makeLevel();
  const tree = level.trees[0];
  const scene = new Scene();
  const geometry = new SphereGeometry(.8, 16, 12).translate(0, 3.5, 0);
  const material = new MeshBasicMaterial();
  const foliage = new InstancedMesh(geometry, material, 1);
  foliage.name = 'trees:round:foliage';
  const scale = 1.037;
  const matrix = new Matrix4().compose(surfacePoint(tree.planet, tree.dir, -.05),
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), tree.dir), new Vector3(scale, scale, scale));
  foliage.setMatrixAt(0, matrix);
  scene.add(foliage);
  const wildlife = new Wildlife(scene, level);
  const bird = wildlife.animals.find(animal => animal.initialState === 'perch' && animal.tree === tree);
  assert.ok(bird);
  const expected = (3.5 + .8) * scale - .05;
  assert.ok(Math.abs(bird.height - expected) < 1e-5, `perch ${bird.height} does not meet crown ${expected}`);
  assert.ok(Math.abs(wildlife.perchHeight(bird) - expected) < 1e-5);
  // The animation uses the cache even after the scene culls this instance.
  foliage.count = 0;
  wildlife.reset();
  assert.ok(Math.abs(bird.height - expected) < 1e-5);
  wildlife.dispose(); geometry.dispose(); material.dispose();
});

test('squirrels scurry away, return to a safe tree patch and hold an acorn', () => {
  const f = setup();
  const squirrel = f.wildlife.animals.find(animal => animal.kind === 'squirrel');
  f.player.body.pos.copy(squirrel.pos);
  const before = squirrel.pos.clone();
  f.tick();
  assert.equal(squirrel.state, 'scurry');
  f.tick(40);
  assert.ok(squirrel.pos.distanceTo(before) > 1.5);
  f.player.body.pos.set(0, -26, 0);
  const seen = new Set();
  for (let i = 0; i < 700; i++) { f.tick(); seen.add(squirrel.state); }
  assert.ok(seen.has('return'));
  assert.ok(seen.has('sit'));
  assert.ok(f.wildlife.safe(squirrel.dir));
  f.wildlife.dispose();
});
