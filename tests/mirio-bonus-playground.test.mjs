import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene, Texture, Vector3} from 'three';
import {BonusPlayground} from '../js/bonus-playground.js';
import {collidersFor, makeLevel} from '../js/level.js';
import {dirFromLatLon, inWater, stepBody, surfacePoint} from '../js/world.js';

const DT = 1 / 120;

function fixture() {
  const level = makeLevel();
  const planet = {id: 'test-wunderwiese', center: new Vector3(-330, 0, -310), radius: 26,
    gravityRadius: 46, gravityScale: .7, water: {minLat: 36, maxLat: 56}};
  level.planets.push(planet);
  level.bonus = {planet, spawn: {planet, dir: dirFromLatLon(82, -100)}};
  const colliders = collidersFor(level);
  const before = level.planets.slice(0, -1).map(item => colliders(item).slice());
  const scene = new Scene();
  const bonus = new BonusPlayground(scene, level, {shadow: new Texture()}, colliders);
  return {level, planet, colliders, before, scene, bonus};
}

function walker(planet, dir, height = 0) {
  return {state: 'play', invulnerable: 0, events: [],
    body: {pos: surfacePoint(planet, dir, height), up: dir.clone(), planet, vel: new Vector3(),
      onGround: true, radius: .45, height: 2.1},
    visualUp: dir.clone(), facing: new Vector3(), flightDir: new Vector3(),
    bounce(options = {}) {this.launch = options; this.body.onGround = false;},
    hurt() {throw new Error('unexpected creature contact');}};
}

test('bonus toys touch only their own planet and every ring path stays dry', () => {
  const {level, planet, colliders, before, bonus} = fixture();
  level.planets.slice(0, -1).forEach((item, index) => assert.deepEqual(colliders(item), before[index]));
  const layout = bonus.layout();
  assert.equal(layout.biplane.planet, planet.id);
  assert.equal(layout.meadow.planet, planet.id);
  assert.equal(layout.moon.platforms.length, 6);
  assert.ok(layout.enemies.every(creature => creature.planet === planet.id));
  for (const trail of layout.trails) {
    assert.equal(trail.planet, planet.id);
    for (const dir of trail.dirs) assert.equal(inWater(surfacePoint(planet, new Vector3(...dir)), planet), false);
  }
});

test('rescue retains earned trails and lanterns; restart resets the playground', () => {
  const {planet, bonus} = fixture();
  const layout = bonus.layout();
  const player = walker(planet, new Vector3(...layout.trails[0].dirs[0]));
  for (const coords of layout.trails[0].dirs) {
    player.body.up.set(...coords);
    player.body.pos.copy(surfacePoint(planet, player.body.up));
    bonus.step(DT, player);
  }
  const island = layout.moon.platforms[0];
  player.body.pos.set(...island.pos); player.body.up.set(...island.up);
  bonus.step(DT, player);
  assert.deepEqual(bonus.snapshot().adventure.badges, ['meadow']);
  assert.equal(bonus.snapshot().moon.visited.length, 1);
  assert.ok(bonus.magnet > 0);
  bonus.recall(player);
  assert.deepEqual(bonus.snapshot().adventure.badges, ['meadow']);
  assert.equal(bonus.snapshot().moon.visited.length, 1);
  bonus.reset(player);
  assert.deepEqual(bonus.snapshot().adventure.badges, []);
  assert.equal(bonus.snapshot().moon.visited.length, 0);
  assert.equal(bonus.magnet, 0);
});

test('the guardian lands an idle rider on the last cloud above the race warp', () => {
  const {planet, level, colliders, bonus} = fixture();
  const guardian = bonus.layout().moon.guardian;
  const player = walker(planet, new Vector3(...guardian.up), 5.6);
  assert.equal(bonus.step(DT, player)[0].kind, 'moonGuardian');
  const target = new Vector3(...guardian.target);
  let landed = false;
  for (let tick = 0; tick < 600; tick++) {
    const rising = player.body.vel.dot(player.body.up) > 0;
    stepBody(player.body, null, 0, level.planets, colliders, DT, {gravityScale: rising ? player.launch.gravityScale : 1.5});
    if (player.body.onGround && player.body.pos.distanceTo(target) < 2.9) { landed = true; break; }
  }
  assert.ok(landed, 'the forgiving toss should settle on its broad target');
});

test('arriving players can board nearby and inactive toys freeze without altering progress', () => {
  const {level, planet, bonus} = fixture();
  const player = walker(planet, level.bonus.spawn.dir);
  assert.equal(bonus.canBoard(player), true);
  assert.equal(bonus.toggle(player)[0].type, 'planeBoard');
  assert.equal(bonus.mounted, true);
  const before = bonus.snapshot();
  bonus.step(2, player, {active: false});
  assert.deepEqual(bonus.snapshot(), before);
  bonus.recall(player);
  assert.equal(bonus.mounted, false);
  assert.equal(player.state, 'play');
});

test('completed level souvenirs echo into a bird chorus and a ground-pound spring', () => {
  const {planet, bonus} = fixture();
  bonus.setCompletedLevels(['adventure', 'sky']);
  const layout = bonus.layout().chorus;
  const player = walker(planet, new Vector3(...layout.flower.dir));
  const move = dir => {player.body.up.set(...dir); player.body.pos.copy(surfacePoint(planet, player.body.up));};
  player.spinning = true;
  assert.equal(bonus.step(DT, player).some(event => event.type === 'hubChorus'), false);
  for (const souvenir of layout.souvenirs.filter(item => ['adventure', 'sky'].includes(item.level))) {
    move(souvenir.dir);
    assert.equal(bonus.step(DT, player).filter(event => event.type === 'hubEcho').length, 1);
    assert.equal(bonus.step(DT, player).filter(event => event.type === 'hubEcho').length, 0);
  }
  player.spinning = false;
  for (let i = 0; i < 160; i++) bonus.step(DT, player);
  move(layout.flower.dir); player.spinning = true;
  assert.ok(bonus.step(DT, player).some(event => event.type === 'hubChorus'));
  assert.equal(bonus.snapshot().chorus.chorus, true);
  bonus.recall(player);
  assert.equal(bonus.snapshot().chorus.echoes.length, 2);
  bonus.reset(player);
  assert.deepEqual(bonus.snapshot().chorus.completed, ['adventure', 'sky']);
  assert.deepEqual(bonus.snapshot().chorus.echoes, []);
  player.spinning = false; player.pounding = true;
  assert.ok(bonus.step(DT, player).some(event => event.kind === 'hubFlower' && event.type === 'spring'));
  assert.equal(player.launch.speed, 16);
});

test('only the optional planet restores squirrels and their ordinary shy reactions', () => {
  const {planet, bonus} = fixture();
  const snapshot = bonus.snapshot().wildlife;
  assert.equal(snapshot.counts.squirrel, 5);
  assert.ok(snapshot.counts.bird >= 6);
  const squirrel = snapshot.animals.find(animal => animal.kind === 'squirrel');
  const player = walker(planet, new Vector3(...squirrel.dir));
  bonus.step(DT, player);
  const met = bonus.snapshot().wildlife.animals.find(animal => animal.id === squirrel.id);
  assert.notEqual(met.state, 'forage');
  assert.equal(met.planet, planet.id);
});
