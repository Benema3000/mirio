import assert from 'node:assert/strict';
import test from 'node:test';
import {Vector3} from 'three';
import {makeLevel} from '../js/level.js';
import {Track} from '../js/kart.js';
import {RouteNetwork, ROUTE, RACE_STYLE, MAIN_ROAD_HALF_WIDTH, CLASSIC_ROAD_HALF_WIDTH} from '../js/kart-routes.js';
const base = new Track(makeLevel().course, {halfWidth:MAIN_ROAD_HALF_WIDTH});
const routes = new RouteNetwork(base);
const frame = () => ({pos:new Vector3(),tan:new Vector3(),up:new Vector3(),right:new Vector3()});

test('each fork has separate physical roads and continuous reconnections', () => {
  for (const fork of routes.forks) {
    const middle=(fork.s0+fork.s1)/2;
    assert.ok(fork.path.frame(middle,frame()).pos.distanceTo(base.frame(middle,frame()).pos)>15);
    for (const s of [fork.s0,fork.s1]) {
      assert.ok(fork.path.frame(s,frame()).pos.distanceTo(base.frame(s,frame()).pos)<.02);
      assert.ok(fork.path.frame(s,frame()).tan.dot(base.frame(s,frame()).tan)>.99);
    }
    for(let s=fork.s0;s<fork.s1;s+=1) {
      assert.ok(routes.metric(fork.id,s)>.15);
      assert.ok(Number.isFinite(routes.road(fork.id,s).curvature));
    }
  }
});

test('every fork joins for a kart on its side of the road and misses one mid-road', () => {
  for (const fork of routes.forks) {
    const racer={s:fork.s0+.1,x:fork.side*2,route:ROUTE.MAIN};
    assert.equal(routes.enter(racer,fork.s0-.1).type,'route');
    assert.equal(racer.route,fork.id);
    racer.s=fork.s1+.1;
    assert.equal(routes.reconcile(racer).id,fork.id);
    assert.equal(racer.route,ROUTE.MAIN);
  }
  const mid={s:routes.forks[0].s0+.1,x:0,route:ROUTE.MAIN};
  assert.equal(routes.enter(mid,routes.forks[0].s0-.1),null);
});

test('rivals on separated branches cannot hit each other; reverse travel rejoins safely', () => {
  const fork=routes.forks[1],s=(fork.s0+fork.s1)/2;
  assert.equal(routes.sameRoad({route:ROUTE.MAIN,s},{route:fork.id,s}),false);
  const racer={route:fork.id,s:fork.s0-.1};
  routes.reconcile(racer);
  assert.equal(racer.route,ROUTE.MAIN);
});

import {DRIVE, driveKart, newKart} from '../js/kart-physics.js';
test('ordinary steering can complete every branch without jumps in progress', () => {
  const kart={...newKart(),route:ROUTE.MAIN};
  const visited=new Set(), finish=base.sAtPsi(1080), dt=1/120;
  let elapsed=0, maxStep=0;
  while(kart.s<finish && elapsed<120) {
    const fork=routes.forks.find(f=>kart.s<f.s0 && kart.s>f.s0-45);
    const target=fork?fork.side*2:0;
    const road={...routes.road(kart.route,kart.s),limit:3.8};
    const feed=(1-DRIVE.assist)*road.curvature*kart.v/DRIVE.turn;
    let steer=Math.max(-1,Math.min(1,feed-kart.yaw*1.5+(target-kart.x)*.3));
    const before=kart.s, metric=routes.metric(kart.route,kart.s);
    driveKart(kart,{steer,throttle:1},road,dt);
    kart.s=before+(kart.s-before)/metric;
    const entry=routes.enter(kart,before);
    if(entry?.type==='route')visited.add(kart.route);
    routes.reconcile(kart);
    maxStep=Math.max(maxStep,kart.s-before);elapsed+=dt;
  }
  assert.ok(kart.s>=finish,`stopped at ${kart.s}`);
  assert.deepEqual([...visited],[ROUTE.WIND,ROUTE.ORCHARD,ROUTE.CLOUD]);
  assert.ok(maxStep<1,'branch choice must not teleport progress');
  assert.ok(elapsed<100);
});

test('backing into a fork from its far join follows that physical road', () => {
  for (const fork of routes.forks) {
    const kart={route:ROUTE.MAIN,s:fork.s1-.01,x:fork.side*2};
    assert.equal(routes.enter(kart,fork.s1+.01)?.type,'route');
    assert.equal(kart.route,fork.id);
    routes.reconcile(kart);
    assert.equal(kart.route,fork.id);
  }
});

test('overlapping join roads remain collision candidates from either argument order', () => {
  const fork=routes.forks[0],s=fork.s0+15;
  const a={route:ROUTE.MAIN,s},b={route:fork.id,s};
  assert.ok(routes.sameRoad(a,b));
  assert.ok(routes.sameRoad(b,a));
});

test('finish interpolation uses actual road progress when crossing at an angle', async () => {
  const physics=await import('../js/kart-physics.js');
  assert.equal(typeof physics.crossingTime,'function');
  assert.ok(Math.abs(physics.crossingTime(10,.1,99.8,100.2,100)-9.95)<1e-12);
  assert.ok(Math.abs(physics.crossingTime(10,.1,99.9,100.3,100)-9.925)<1e-12);
});

test('narrow forks taper from the main width instead of snapping drivers sideways', () => {
  for(const fork of routes.forks) {
    assert.equal(typeof fork.path.halfWidth,'function');
    assert.equal(fork.path.halfWidth(fork.s0),MAIN_ROAD_HALF_WIDTH);
    assert.equal(fork.path.halfWidth(fork.s1),MAIN_ROAD_HALF_WIDTH);
    assert.equal(fork.path.halfWidth((fork.s0+fork.s1)/2),fork.width);
    assert.ok(fork.path.halfWidth(fork.s0+.1)>MAIN_ROAD_HALF_WIDTH-.01);
  }
});

test('classic network preserves a single road and never selects playground routes', () => {
  const track = new Track(makeLevel().course);
  const classic = new RouteNetwork(track, {routeStyle:RACE_STYLE.CLASSIC});
  assert.equal(track.halfWidth(),CLASSIC_ROAD_HALF_WIDTH);
  assert.deepEqual(classic.forks,[]);
  const racer = {s:base.sAtPsi(100)+1,x:3,route:ROUTE.MAIN};
  assert.equal(classic.enter(racer,racer.s-2),null);
  assert.equal(classic.path(ROUTE.WIND),track);
  assert.equal(classic.metric(ROUTE.MAIN,racer.s),1);
});
