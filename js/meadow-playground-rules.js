// The plane powers toys; walking explores what those toys open. No DOM or renderer.
import {Quaternion, Vector3} from 'three';
import {dirFromLatLon} from './world.js';

export const MEADOW = Object.freeze({
  washRadius: 6.5, washSpeed: 4, windCharge: 1.3, bridgeHeight: .84,
  towRadius: 5.2, towAltitude: 2.6, dockRadius: 3.8,
  kiteRadius: 5.5, kiteAltitude: 1.1, kiteSpeed: 2.5, kiteDistance: 16,
  guideRadius: 2.6, lookoutHeight: 3.6, springRadius: 1.25,
  springSpeed: 20, springGravity: .72, springTravelSpeed: 6, springCooldown: .8,
});
export const BOAT = Object.freeze({ADRIFT: 'adrift', TOWED: 'towed', DOCKED: 'docked'});
const NORTH = new Vector3(0, 1, 0);
const W = (lat, lon) => dirFromLatLon(lat, lon);
const distance = (a, b, radius) => a.angleTo(b) * radius;

export function meadowLayout(level) {
  const planet = level.planets[0], lookoutDir = W(29, -110);
  const springDir = lookoutDir.clone().multiplyScalar(planet.radius + MEADOW.lookoutHeight)
    .add(new Vector3(1.65, 0, 1.45).applyQuaternion(new Quaternion().setFromUnitVectors(NORTH, lookoutDir))).normalize();
  return {planet,
    wind: {dir: W(67, -134), height: 2.6},
    dock: {dir: W(61, -132), height: .35},
    boat: {dir: W(46, -132), height: .12},
    kite: {dir: W(75, -117), height: 2.4},
    beacons: [{dir: W(63, -125), height: 2.4}, {dir: W(48, -130), height: 2.4}, {dir: W(31, -110), height: 2.4}],
    bridgeFrame: {dir: W(46, -110), height: MEADOW.bridgeHeight},
    bridge: Array.from({length: 9}, (_, i) => {
      const dir = W(58 - i * 3, -110);
      return {dir, height: (planet.radius + MEADOW.bridgeHeight - .12) / dir.dot(W(46, -110)) - planet.radius, radius: 1.72};
    }),
    lookout: {dir: W(29, -110), height: MEADOW.lookoutHeight, radius: 2.8},
    steps: [{dir: W(33, -115), height: .65, radius: 1.35}, {dir: W(31, -116), height: 1.8, radius: 1.4}],
    guide: [{dir: W(33, -115), height: .65}, {dir: W(31, -116), height: 1.8}, {dir: W(29, -110), height: MEADOW.lookoutHeight}],
    spring: {dir: springDir, height: MEADOW.lookoutHeight},
    springLanding: {dir: W(15, -110), height: .03},
    clearing: {dir: W(63, -96), height: 0},
  };
}
export function createMeadowRun(layout) {
  return {windCharge: 0, windPowered: false, boat: BOAT.ADRIFT, boatDir: layout.boat.dir.clone(),
    kiteStage: -1, kiteDistance: 0, kiteLastDistance: null, kiteFlying: false,
    guideStage: 0, guideDir: layout.guide[0].dir.clone(), guideHeight: layout.guide[0].height,
    lookout: false, springOpen: false, springCooldown: 0, springUses: 0, celebration: false, elapsed: 0};
}

export function stepMeadowRun(run, layout, dt, input) {
  const events = [];
  if (!Number.isFinite(dt) || dt <= 0) return events;
  dt = Math.min(dt, .25);
  run.elapsed += dt;
  run.springCooldown = Math.max(0, run.springCooldown - dt);
  const radius = layout.planet.radius;
  if (run.boat === BOAT.ADRIFT) run.boatDir.copy(layout.boat.dir).applyAxisAngle(NORTH, Math.sin(run.elapsed * .35) * .025);
  if (input.flying) {
    const near = target => distance(input.planeDir, target.dir, radius);
    // Passing under propeller power fills the wind toy; jumping can never power it.
    if (!run.windPowered && near(layout.wind) < MEADOW.washRadius && input.planeAltitude > .3 && input.planeSpeed >= MEADOW.washSpeed) {
      run.windCharge = Math.min(MEADOW.windCharge, run.windCharge + dt * (input.boost > 0 ? 3 : 1));
      if (run.windCharge >= MEADOW.windCharge) {run.windPowered = true; events.push({type: 'meadowWind'});}
    }
    if (run.boat === BOAT.ADRIFT && distance(input.planeDir, run.boatDir, radius) < MEADOW.towRadius && input.planeAltitude <= MEADOW.towAltitude && input.planeSpeed > 1) {
      run.boat = BOAT.TOWED;
      events.push({type: 'meadowTow'});
    }
    if (run.boat === BOAT.TOWED) {
      // A soft towline trails behind the aircraft; there is no fragile rope timing.
      run.boatDir.lerp(input.planeDir, 1 - Math.exp(-2.4 * dt)).normalize();
      if (near(layout.dock) < MEADOW.dockRadius) {
        run.boat = BOAT.DOCKED;
        run.boatDir.copy(layout.dock.dir);
        events.push({type: 'meadowBoat'});
      }
    }
    if (run.kiteStage < 0 && near(layout.kite) < MEADOW.kiteRadius && input.planeSpeed > MEADOW.kiteSpeed) {
      run.kiteStage = 0;
      run.kiteLastDistance = input.planeDistance;
      events.push({type: 'meadowKiteHook'});
    }
    if (run.kiteStage >= 0 && !run.kiteFlying) {
      const travelled = run.kiteLastDistance === null ? 0 : Math.max(0, input.planeDistance - run.kiteLastDistance);
      run.kiteLastDistance = input.planeDistance;
      if (input.planeAltitude >= MEADOW.kiteAltitude && input.planeSpeed >= MEADOW.kiteSpeed) {
        run.kiteDistance += travelled;
        const next = layout.beacons[run.kiteStage];
        if (next && near(next) < MEADOW.kiteRadius) {
          run.kiteStage++;
          events.push({type: 'meadowKiteGate', gate: run.kiteStage});
        }
      }
      if (run.kiteStage === layout.beacons.length && run.kiteDistance >= MEADOW.kiteDistance) {
        run.kiteFlying = true;
        events.push({type: 'meadowKite'});
      }
    }
  } else run.kiteLastDistance = null;

  // The squirrel waits at each landing, so a missed jump never loses the guide.
  const target = layout.guide[Math.min(run.guideStage, layout.guide.length - 1)];
  run.guideDir.lerp(target.dir, 1 - Math.exp(-3 * dt)).normalize();
  run.guideHeight += (target.height - run.guideHeight) * (1 - Math.exp(-3 * dt));
  if (input.walking && run.windPowered) {
    const close = (point, reach) => Math.hypot(distance(input.playerDir, point.dir, radius), input.playerHeight - point.height) < reach;
    if (!run.lookout && close(layout.lookout, 2.5) && input.playerHeight >= MEADOW.lookoutHeight - .5 && input.grounded) {
      run.lookout = true; events.push({type: 'meadowLookout'});
    }
    if (!run.springOpen && close(target, MEADOW.guideRadius) && input.playerHeight >= target.height - .4 && input.grounded) {
      run.guideStage++;
      events.push({type: 'meadowGuide', stage: run.guideStage});
      if (run.guideStage === layout.guide.length) {run.springOpen = true; events.push({type: 'meadowSpringOpen'});}
    }
    if (run.springOpen && run.springCooldown <= 0 && close(layout.spring, MEADOW.springRadius) && input.grounded) {
      run.springCooldown = MEADOW.springCooldown; run.springUses++;
      events.push({type: 'meadowSpring'});
    }
  }
  if (!run.celebration && run.windPowered && run.boat === BOAT.DOCKED && run.kiteFlying && run.lookout && run.springOpen) {
    run.celebration = true; events.push({type: 'meadowPicnic'});
  }
  return events;
}

export function meadowSnapshot(run) {
  return {windCharge: run.windCharge / MEADOW.windCharge, windPowered: run.windPowered,
    boat: run.boat, boatDir: run.boatDir.toArray(), kiteStage: run.kiteStage, kiteDistance: run.kiteDistance, kiteFlying: run.kiteFlying,
    guideStage: run.guideStage, guideDir: run.guideDir.toArray(), guideHeight: run.guideHeight,
    lookout: run.lookout, springOpen: run.springOpen, springUses: run.springUses, celebration: run.celebration,
    completed: Number(run.windPowered) + Number(run.boat === BOAT.DOCKED) + Number(run.kiteFlying) + Number(run.lookout) + Number(run.springOpen), total: 5};
}
