import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Texture, Vector3 } from 'three';
import { SpringGarden, springContact, springLayouts, SPRING_SPEED, POUND_SPRING_SPEED, SPRING_GRAVITY } from '../js/garden.js';
import { makeLevel, collidersFor } from '../js/level.js';
import { inWater, surfacePoint, collide, HOLD_GRAVITY, RELEASE_GRAVITY, FALL_GRAVITY } from '../js/world.js';
import { Player } from '../js/player.js';

const STEP = 1 / 120;
function realPlayer(level, flower) {
  const player = Object.create(Player.prototype);
  Object.assign(player, {
    planets: level.planets, collidersOf: collidersFor(level), events: [],
    body: {pos: new Vector3(), vel: new Vector3(), up: new Vector3(), radius: .45, height: 2.1},
    visualUp: new Vector3(), facing: new Vector3(1, 0, 0), wish: new Vector3(),
    model: {group: {visible: true}}, shadow: {visible: true},
  });
  player.reset({planet: flower.planet, dir: flower.dir.clone()});
  player.body.pos.copy(flower.pos).addScaledVector(flower.dir, .3);
  player.body.vel.copy(flower.dir).multiplyScalar(-8);
  player.body.onGround = false;
  return player;
}

test('spring blossoms trigger from above, never from below, rising, paused or on cooldown', () => {
  const contact = {samePlanet: true, radial: .2, height: .3, verticalSpeed: -5, grounded: false, cooldown: 0, playing: true};
  assert.ok(springContact(contact));
  for (const override of [{height: -1}, {height: 2}, {radial: 2}, {verticalSpeed: 2}, {cooldown: .2}, {samePlanet: false}, {playing: false}]) assert.equal(springContact({...contact, ...override}), false);
  assert.ok(springContact({...contact, verticalSpeed: 0, grounded: true}));
});
test('spring gardens occupy dry, open ground without blocking the existing level', () => {
  const level = makeLevel();
  const colliders = collidersFor(level);
  for (const flower of springLayouts(level)) {
    const pos = surfacePoint(flower.planet, flower.dir, .1);
    assert.equal(inWater(pos, flower.planet), false);
    for (const collider of colliders(flower.planet)) {
      assert.equal(collide(pos.clone(), new Vector3(), {radius: .9, height: .8}, collider, flower.dir), null, `${flower.id} overlaps a prop`);
    }
  }
});
test('spring launch and ground-pound boost are repeatable and reset on a new run', () => {
  const level = makeLevel();
  const garden = new SpringGarden(new Scene(), level, {shadow: new Texture()});
  const flower = garden.flowers[0];
  const player = realPlayer(level, flower);
  const {body} = player;
  assert.equal(garden.step(.01, player, false).length, 0);
  assert.equal(garden.step(.01, player, true)[0].type, 'spring');
  assert.ok(Math.abs(body.vel.dot(flower.dir) - SPRING_SPEED) < 1e-6);
  assert.equal(garden.used.size, 1);
  body.pos.copy(flower.pos).addScaledVector(flower.dir, .3);
  body.vel.copy(flower.dir).multiplyScalar(-20);
  player.pound = {phase: 'drop', t: .3};
  assert.equal(garden.step(.01, player, true).length, 0);
  assert.ok(garden.step(.7, player, true)[0].strong);
  assert.ok(Math.abs(body.vel.dot(flower.dir) - POUND_SPRING_SPEED) < 1e-6);
  garden.reset();
  assert.equal(garden.used.size, 0);
});

test('real spring trajectories reach a generous apex without holding jump', () => {
  const level = makeLevel();
  const garden = new SpringGarden(new Scene(), level, {shadow: new Texture()});
  const flower = garden.flowers[0];
  const tops = [];
  for (const strong of [false, true]) {
    for (const held of [false, true]) {
      garden.reset();
      const player = realPlayer(level, flower);
      player.jumpHeld = held;
      if (strong) player.pound = {phase: 'drop', t: .3};
      const [event] = garden.step(STEP, player, true);
      assert.equal(event.strong, strong);
      assert.equal(player.launchGravity, SPRING_GRAVITY);
      let top = 0;
      let passedApex = false;
      for (let i = 0; i < 1200; i++) {
        player.step(STEP);
        top = Math.max(top, player.body.pos.distanceTo(flower.planet.center) - flower.planet.radius);
        if (player.body.vel.dot(player.body.up) <= 0) {
          passedApex = true;
          assert.equal(player.launchGravity, null, 'the launch override ends at the apex');
        }
        if (player.body.onGround) break;
      }
      assert.ok(passedApex && player.body.onGround, 'the launch must finish with a normal landing');
      assert.equal(player.launchGravity, null);
      assert.ok(top > (strong ? 8.5 : 5.2) && top < (strong ? 9.3 : 5.8), `${strong ? 'pound' : 'normal'} / held=${held}: ${top.toFixed(2)}m`);
      tops.push(top);
    }
  }
  assert.ok(Math.abs(tops[0] - tops[1]) < .01, 'holding jump does not change the normal spring');
  assert.ok(Math.abs(tops[2] - tops[3]) < .01, 'holding jump does not change the pound spring');
});

test('spring rising gravity is cleared by every action that replaces the flight', () => {
  const level = makeLevel();
  const garden = new SpringGarden(new Scene(), level, {shadow: new Texture()});
  const flower = garden.flowers[0];
  const actions = {
    respawn: p => p.respawn(),
    landing: p => p.land(8),
    hurt: p => { p.invulnerable = 0; p.hurt(p.body.pos.clone().add(new Vector3(1, 0, 0))); },
    boarding: p => p.board(),
    groundPound: p => { p.poundRequest = true; p.step(STEP); },
    creatureBounce: p => p.bounce(),
    victory: p => p.win(),
  };
  for (const [name, action] of Object.entries(actions)) {
    const player = realPlayer(level, flower);
    player.bounce({speed: SPRING_SPEED, gravityScale: SPRING_GRAVITY});
    action(player);
    assert.equal(player.launchGravity, null, name);
  }
});

test('boss and enemy bounces keep their original held and released behavior', () => {
  const level = makeLevel();
  const flower = { ...springLayouts(level)[0] };
  flower.pos = surfacePoint(flower.planet, flower.dir, .025);
  for (const held of [false, true]) {
    const player = realPlayer(level, flower);
    player.jumpHeld = held;
    player.bounce();
    assert.ok(Math.abs(player.body.vel.dot(player.body.up) - (held ? 17 : 13)) < 1e-8);
    assert.equal(player.jumpOptions().gravityScale, held ? HOLD_GRAVITY : RELEASE_GRAVITY);
    player.body.vel.copy(player.body.up).multiplyScalar(-1);
    assert.equal(player.jumpOptions().gravityScale, FALL_GRAVITY);
  }
});
