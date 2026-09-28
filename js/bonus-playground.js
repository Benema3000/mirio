// Optional toys share one planet and one recovery state; the main journey stays independent.
import * as THREE from 'three';
import { Adventure } from './adventure.js';
import { BonusChorus } from './bonus-chorus.js';
import { Biplane } from './biplane.js';
import { EnemySystem } from './enemies.js';
import { MeadowPlayground } from './meadow-playground.js';
import { MoonPlayground } from './moon-playground.js';
import { Wildlife, WILDLIFE_POPULATION } from './wildlife.js';
import { dirFromLatLon, tangentDir } from './world.js';

const PLANE_HOME = Object.freeze({latitude: 82, longitude: -120});
const CLOUD_HEIGHTS = Object.freeze([1.2, 2.3, 3.6, 4.8, 6.1, 7.2]);
const CLOUD_LATITUDES = Object.freeze([-25, -32, -39, -46, -53, -60]);
const CLOUD_LONGITUDE = -115;
const VIEW_DISTANCE = 110;
const GUARDIAN_FORWARD_SPEED = 9;
const CREATURE_PATCHES = Object.freeze([
  ['beetle', 70, -160], ['beetle', 12, -90], ['beetle', -14, -135],
  ['pebble', -32, -145], ['pebble', -48, -76],
]);

export function bonusPlaygroundLayout(planet, spawn) {
  const platforms = CLOUD_LATITUDES.map((latitude, index) => ({
    dir: dirFromLatLon(latitude, CLOUD_LONGITUDE), height: CLOUD_HEIGHTS[index],
  }));
  const landing = platforms[0].dir;
  const guardianDir = dirFromLatLon(-52, -97);
  return {
    planets: [planet], spawn,
    biplaneHome: {planet, dir: dirFromLatLon(PLANE_HOME.latitude, PLANE_HOME.longitude)},
    trails: [
      {id: 'meadow', name: 'Wiesenspuren', planet, color: 0xffce6b,
        dirs: [84, 80.5, 77, 73.5, 70, 66.5].map(latitude => dirFromLatLon(latitude, -90))},
      {id: 'moon', name: 'Mondspuren', planet, color: 0x81f2ee,
        dirs: [-4, -8.5, -13, -17.5, -22, -26.5].map(latitude => dirFromLatLon(latitude, -108))},
    ],
    moonPlayground: {planet, landing, forward: tangentDir(platforms[1].dir, landing), platforms,
      guardian: {dir: guardianDir, height: 5.6, launchUp: guardianDir, forwardSpeed: GUARDIAN_FORWARD_SPEED}, target: platforms.at(-1)},
    creatures: CREATURE_PATCHES.map(([kind, latitude, longitude], index) => ({
      id: `bonus-${kind}-${index}`, kind, planet, dir: dirFromLatLon(latitude, longitude),
      name: kind === 'beetle' ? 'Mooskrabbler' : 'Mondkiesel', color: kind === 'beetle' ? 0x42b7a0 : 0xa6b1eb,
    })),
  };
}

export class BonusPlayground {
  #group = new THREE.Group();
  #planet; #plane; #meadow; #moon; #trails; #enemies; #wildlife; #chorus; #camera = null; #time = 0; #reducedMotion = false;

  constructor(scene, level, art, colliders) {
    this.#planet = level.bonus.planet;
    const data = bonusPlaygroundLayout(this.#planet, level.bonus.spawn);
    this.#group.name = 'wunderwiese-playground';
    this.#group.visible = false;
    scene.add(this.#group);
    this.#chorus = new BonusChorus(this.#group, this.#planet);
    this.#plane = new Biplane(this.#group, data, art, colliders);
    this.#meadow = new MeadowPlayground(this.#group, data, colliders);
    this.#moon = new MoonPlayground(this.#group, data, colliders);
    this.#trails = new Adventure(this.#group, data);
    this.#enemies = new EnemySystem(this.#group, data, art);
    this.#wildlife = new Wildlife(this.#group, {...level, spawn: level.bonus.spawn}, art,
      {planet: this.#planet, population: WILDLIFE_POPULATION.PLAYGROUND});
  }

  get mounted() { return this.#plane.mounted; }
  get magnet() { return this.#trails.magnet; }
  get planeState() { return this.#plane.snapshot(); }
  get soundState() {
    if (!this.#plane.mounted) return null;
    return {active: true, speed: this.#plane.flight.speed, throttle: this.#plane.intent.throttle, boost: this.#plane.flight.boost > 0};
  }

  setCompletedLevels(ids) { this.#chorus.setCompletedLevels(ids); }

  collectionPoint(out) { return out.copy(this.#plane.flight.pos); }

  canBoard(player) { return this.#plane.canBoard(player); }
  toggle(player) { return this.#plane.toggle(player); }
  clearIntent() { this.#plane.clearIntent(); }
  setQuality(tier) { this.#enemies.setQuality(tier); this.#wildlife.setQuality(tier); }
  readInput(input, rig) { this.#plane.readInput(input, rig); }

  reset(player) {
    this.#time = 0;
    this.#plane.reset(player);
    this.#meadow.reset();
    this.#moon.reset();
    this.#trails.reset();
    this.#enemies.reset();
    this.#wildlife.reset();
    this.#chorus.reset();
  }

  // Rescue parks the plane without undoing bridges, rescued friends or lanterns.
  recall(player) { this.#plane.recall(player); }

  step(dt, player, {active = true} = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return [];
    if (!active || player.body.planet !== this.#planet) {
      this.#plane.clearIntent();
      return this.#trails.update(dt, player, false, this.#time, {reducedMotion: this.#reducedMotion});
    }
    this.#time += dt;
    const events = this.#plane.step(dt, player);
    events.push(...this.#meadow.step(dt, player, this.#plane));
    events.push(...this.#moon.step(dt, player));
    events.push(...this.#enemies.step(dt, player));
    events.push(...this.#chorus.step(dt, player));
    events.push(...this.#wildlife.update(dt, this.#time, player, {camera: this.#camera}));
    events.push(...this.#trails.update(dt, player, !this.mounted, this.#time, {reducedMotion: this.#reducedMotion}));
    return events;
  }

  update(dt, time, camera, player, {active = true, reducedMotion = false} = {}) {
    this.#reducedMotion = reducedMotion;
    this.#camera = camera;
    this.#group.visible = active && camera.position.distanceTo(this.#planet.center) < this.#planet.radius + VIEW_DISTANCE;
    if (!this.#group.visible) return;
    this.#plane.update(dt, time, camera, player, reducedMotion);
    this.#meadow.update(time, camera, {reducedMotion});
    this.#moon.update(time, camera, {reducedMotion});
    this.#chorus.update(time, {reducedMotion});
    this.#enemies.update(reducedMotion ? 0 : time, camera);
  }

  snapshot() {
    return {planet: this.#planet.id, biplane: this.#plane.snapshot(), meadow: this.#meadow.snapshot(),
      moon: this.#moon.snapshot(), enemies: this.#enemies.snapshot(), wildlife: this.#wildlife.snapshot(), chorus: this.#chorus.snapshot(),
      adventure: {badges: [...this.#trails.badges], magnet: this.#trails.magnet,
        trails: this.#trails.trails.map(trail => ({id: trail.id, next: trail.run.next, active: trail.run.active, time: trail.run.time}))}};
  }

  layout() {
    return {planet: this.#planet.id, biplane: this.#plane.layout(), meadow: this.#meadow.layout(), moon: this.#moon.layout(),
      enemies: this.#enemies.layout(), wildlife: this.#wildlife.layout(), chorus: this.#chorus.layout(),
      trails: this.#trails.trails.map(trail => ({id: trail.id, planet: trail.planet.id, dirs: trail.dirs.map(dir => dir.toArray())}))};
  }
}
