// An original low-flying meadow toy. Mirio's existing drawing/model is only
// posed as its passenger; no artwork is replaced or resampled.
import * as THREE from 'three';
import { buildBiplane } from './biplane-model.js';
import { createFlight, FLIGHT, stepFlight } from './biplane-physics.js';
import { collidersFor } from './level.js';
import { collide, dirFromLatLon, inWater, surfacePoint, tangentDir } from './world.js';

const UP = new THREE.Vector3(0, 1, 0);
const EAST = new THREE.Vector3(1, 0, 0);
const ZERO = new THREE.Vector3();
const tmp = new THREE.Vector3(), side = new THREE.Vector3(), candidate = new THREE.Vector3();
const basis = new THREE.Matrix4(), lean = new THREE.Quaternion();
const euler = new THREE.Euler();

export function clearLanding(planet, dir, colliders, radius = 1.35, height = 2.6) {
  const point = surfacePoint(planet, dir, .04);
  // A little shore margin keeps both the landing gear and passenger dry.
  const latitude = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) * 180 / Math.PI;
  if (planet.water && latitude > planet.water.minLat - 3 && latitude < planet.water.maxLat + 3) return false;
  if (inWater(point, planet)) return false;
  return colliders.every(c => !collide(point.clone(), ZERO.clone(), {radius, height}, c, dir));
}

export function chooseBiplaneHome(level) {
  const planet = level.planets[0];
  const colliders = collidersFor(level)(planet);
  const blossoms = [[81, 35], [24, 43], [-14, -28]].map(([lat, lon]) => dirFromLatLon(lat, lon));
  // Parked on the far side of the planet from the start: an easter egg to find.
  for (const [lat, lon] of [[-78, 180], [-80, 150], [-75, -150], [-82, 90], [-70, 180]]) {
    const dir = dirFromLatLon(lat, lon);
    if (clearLanding(planet, dir, colliders, 2.05) && blossoms.every(b => b.angleTo(dir) * planet.radius > 3.5)) return {planet, dir};
  }
  return {planet, dir: dirFromLatLon(-84, 180)};
}

export class Biplane {
  constructor(scene, level, art, collidersOf) {
    this.home = level.biplaneHome ?? chooseBiplaneHome(level);
    this.collidersOf = collidersOf;
    this.model = buildBiplane(art);
    scene.add(this.model.group);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({map: art.shadow, color: 0x294645, transparent: true, opacity: .3, depthWrite: false}));
    this.halo = new THREE.Mesh(new THREE.RingGeometry(2.05, 2.085, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color: 0xffdc89, transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide}));
    scene.add(this.shadow, this.halo);
    this.intent = {direction: new THREE.Vector3(), throttle: 0, climb: false, descend: false, boost: false};
    this.parkingCollider = null;
    this.reset();
  }

  parkCollider(enabled) {
    const list = this.collidersOf(this.home.planet);
    if (this.parkingCollider) {
      const index = list.indexOf(this.parkingCollider);
      if (index >= 0) list.splice(index, 1);
      this.parkingCollider = null;
    }
    if (enabled) {
      this.parkingCollider = {kind: 'cyl', base: this.flight.pos.clone(), axis: this.flight.up.clone(), radius: .65, height: 1.25};
      list.push(this.parkingCollider);
    }
  }

  reset(player = null) {
    if (player && this.mounted) player.state = 'play';
    this.parkCollider(false);
    this.flight = createFlight(this.home.planet, this.home.dir, tangentDir(EAST, this.home.dir));
    this.flight.altitude = 0;
    this.flight.pos.copy(surfacePoint(this.home.planet, this.home.dir));
    this.flight.state = 'landed';
    this.mounted = this.landing = false;
    this.distance = 0;
    this.rides = 0;
    this.landingTime = 0;
    this.clearIntent();
    this.parkCollider(true);
  }

  clearIntent() {
    this.intent.throttle = 0;
    this.intent.climb = this.intent.descend = this.intent.boost = false;
  }

  recall(player) {
    const {distance, rides} = this;
    this.reset(player);
    this.distance = distance;
    this.rides = rides;
  }

  canBoard(player) {
    return !this.mounted && player.state === 'play' && player.body.planet === this.home.planet && player.body.onGround && player.body.pos.distanceTo(this.flight.pos) < 4.2;
  }

  board(player) {
    if (!this.canBoard(player)) return false;
    this.parkCollider(false);
    this.mounted = true;
    this.landing = false;
    this.rides++;
    player.state = 'biplane';
    player.pound = player.launchGravity = null;
    player.jumpBuffer = player.coyote = player.spinT = player.stun = 0;
    player.spinRequest = player.poundRequest = false;
    player.wishSpeed = 0;
    player.body.skidding = false;
    player.body.vel.set(0, 0, 0);
    this.clearIntent();
    this.syncPassenger(player);
    return true;
  }

  landingPoint() {
    if (!clearLanding(this.home.planet, this.flight.up, this.collidersOf(this.home.planet).filter(c => c !== this.parkingCollider))) return null;
    side.crossVectors(this.flight.up, this.flight.forward).normalize();
    for (const angle of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
      tmp.copy(this.flight.forward).multiplyScalar(Math.cos(angle)).addScaledVector(side, Math.sin(angle));
      const arc = 2.15 / this.home.planet.radius;
      candidate.copy(this.flight.up).multiplyScalar(Math.cos(arc)).addScaledVector(tmp, Math.sin(arc)).normalize();
      if (clearLanding(this.home.planet, candidate, this.collidersOf(this.home.planet).filter(c => c !== this.parkingCollider), .5, 2.1)) return candidate.clone();
    }
    return null;
  }

  toggle(player) {
    if (!this.mounted) return this.board(player) ? [{type: 'planeBoard'}] : [];
    if (this.landing) { this.landing = false; return [{type: 'planeCancelLanding'}]; }
    const spot = this.landingPoint();
    if (!spot) return [{type: 'planeNoLanding'}];
    this.landing = true;
    this.landingTime = 0;
    this.clearIntent();
    return [{type: 'planeLanding'}];
  }

  readInput(input, rig) {
    // These controls belong to the plane for this frame, not a buffered jump
    // or ground pound waiting to fire when the passenger steps out.
    input.consumeJump();
    input.consumePound();
    // A fast display can render again before the next fixed physics tick.
    const boost = input.consumeSpin() || this.intent.boost;
    this.clearIntent();
    if (this.landing) { this.intent.descend = true; return; }
    const forward = tangentDir(rig.forward, this.flight.up, tmp) ?? this.flight.forward;
    side.crossVectors(forward, this.flight.up);
    const magnitude = Math.min(1, Math.hypot(input.move.x, input.move.y));
    this.intent.direction.copy(forward).multiplyScalar(input.move.y).addScaledVector(side, input.move.x);
    if (magnitude > .08) this.intent.direction.normalize();
    else this.intent.direction.copy(this.flight.forward);
    this.intent.throttle = magnitude > .08 ? magnitude : 0;
    this.intent.climb = input.jumpHeld;
    this.intent.descend = input.poundHeld;
    this.intent.boost = boost;
  }

  syncPassenger(player) {
    player.body.pos.copy(this.flight.pos).addScaledVector(this.flight.up, this.model.seat.position.y).addScaledVector(this.flight.forward, this.model.seat.position.z);
    player.body.up.copy(this.flight.up);
    player.visualUp.copy(this.flight.up);
    player.body.vel.copy(this.flight.vel);
    player.body.planet = this.home.planet;
    player.body.onGround = false;
    player.facing.copy(this.flight.forward);
    player.flightDir.copy(this.flight.forward);
  }

  step(dt, player) {
    if (!this.mounted) return [];
    const beforeDistance = this.flight.distance;
    const events = stepFlight(this.flight, this.landing ? {direction: this.flight.forward, throttle: 0, descend: true} : this.intent, this.collidersOf(this.home.planet), dt)
      .filter(e => e.type === 'boost' || e.type === 'bump').map(e => ({...e, type: e.type === 'boost' ? 'planeBoost' : 'planeBump', pos: this.flight.pos.clone()}));
    this.intent.boost = false;
    this.distance += Math.max(0, this.flight.distance - beforeDistance);
    this.syncPassenger(player);
    if (this.landing) {
      this.landingTime += dt;
      // Recheck after braking, rather than trusting the place where F was
      // pressed while moving: there may now be water or a tree underneath.
      const spot = this.flight.speed < .7 ? this.landingPoint() : null;
      if (this.flight.altitude < .13 && spot) {
        player.state = 'play';
        player.body.pos.copy(surfacePoint(this.home.planet, spot, .08));
        player.body.up.copy(spot);
        player.visualUp.copy(spot);
        player.body.vel.set(0, 0, 0);
        player.body.onGround = false;
        player.invulnerable = Math.max(player.invulnerable, 1);
        player.jumpBuffer = player.coyote = 0;
        this.flight.pos.copy(surfacePoint(this.home.planet, this.flight.up));
        this.flight.altitude = this.flight.speed = 0;
        this.flight.vel.set(0, 0, 0);
        this.flight.state = 'landed';
        this.mounted = this.landing = false;
        this.parkCollider(true);
        events.push({type: 'planeExit'});
      } else if (this.landingTime > 4) {
        this.landing = false;
        events.push({type: 'planeNoLanding'});
      }
    }
    return events;
  }

  update(dt, time, camera, player, reducedMotion = false) {
    const f = this.flight;
    side.crossVectors(f.up, f.forward).normalize();
    basis.makeBasis(side, f.up, f.forward);
    this.model.group.position.copy(f.pos);
    this.model.group.quaternion.setFromRotationMatrix(basis);
    lean.setFromEuler(euler.set(reducedMotion ? 0 : -f.pitch, 0, reducedMotion ? 0 : f.bank));
    this.model.group.quaternion.multiply(lean);
    this.model.group.visible = camera.position.distanceToSquared(f.pos) < 80 ** 2 && tmp.subVectors(camera.position, this.home.planet.center).normalize().dot(f.up) > -.2;
    this.model.propeller.rotation.z += dt * (this.mounted ? 24 + f.speed * 4 + (f.boost > 0 ? 22 : 0) : .35);
    for (const wheel of this.model.wheels ?? []) wheel.rotation.x += dt * f.speed * 3;
    this.model.group.updateMatrixWorld(true);
    surfacePoint(this.home.planet, f.up, .025, this.shadow.position);
    this.shadow.quaternion.setFromUnitVectors(UP, f.up);
    this.shadow.material.opacity = Math.max(.08, .35 - f.altitude * .045);
    this.shadow.scale.setScalar(1 + f.altitude * .08);
    this.shadow.visible = this.model.group.visible;
    this.halo.position.copy(this.shadow.position);
    this.halo.quaternion.copy(this.shadow.quaternion);
    this.halo.visible = !this.mounted && this.model.group.visible;
    this.halo.material.opacity = .3 + Math.sin(time * 1.5) * .08;
    if (!this.mounted) return;
    const m = player.model;
    m.group.visible = true;
    m.group.position.copy(this.model.seat.position).applyMatrix4(this.model.group.matrixWorld);
    m.group.quaternion.copy(this.model.group.quaternion);
    m.body.position.set(0, 0, 0);
    m.body.rotation.set(0, 0, 0);
    m.body.scale.set(1, 1, 1);
    m.legL.rotation.x = m.legR.rotation.x = -1.15;
    m.armL.rotation.x = m.armR.rotation.x = -.6;
    m.armL.rotation.z = m.armRestZ.L * .65;
    m.armR.rotation.z = m.armRestZ.R * .65;
    m.head.rotation.z = reducedMotion ? 0 : -f.bank * .12;
    player.shadow.visible = false;
  }

  snapshot() {
    const f = this.flight;
    return {mounted: this.mounted, landing: this.landing, planet: this.home.planet.id, pos: f.pos.toArray(), up: f.up.toArray(), forward: f.forward.toArray(), altitude: f.altitude, ceiling: FLIGHT.ceiling, speed: f.speed, boost: f.boost, cooldown: f.cooldown, distance: this.distance, rides: this.rides};
  }
  layout() { return {planet: this.home.planet.id, dir: this.home.dir.toArray(), ceiling: FLIGHT.ceiling}; }
}
