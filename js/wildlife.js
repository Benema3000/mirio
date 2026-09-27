// A gentle, reactive meadow population. Animals are decorative neighbours:
// they never block, attack, reward farming, or alter the child's characters.
import * as THREE from 'three';
import { dirFromLatLon, mulberry32, surfacePoint, tangentDir } from './world.js';
import { deviceTier } from './quality.js';
import { WildlifeModels } from './wildlife-models.js';

const TAU = Math.PI * 2;
const EAST = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const LIMITS = [{ bird: 7, squirrel: 3 }, { bird: 12, squirrel: 5 }, { bird: 18, squirrel: 7 }];
const scratch = new THREE.Vector3();
const forward = new THREE.Vector3();
const side = new THREE.Vector3();
const cameraDir = new THREE.Vector3();
const candidate = new THREE.Vector3();
const basis = new THREE.Matrix4();
const object = new THREE.Object3D();

/** Move a direction around the globe along its tangent, in world metres. */
function offset(dir, heading, distance, radius, out = new THREE.Vector3()) {
  const tangent = tangentDir(heading, dir, forward) ?? tangentDir(EAST, dir, forward) ?? tangentDir(Z, dir, forward);
  const angle = distance / radius;
  return out.copy(dir).multiplyScalar(Math.cos(angle)).addScaledVector(tangent, Math.sin(angle)).normalize();
}
function nearestTree(trees, dir) {
  let best = trees[0];
  let score = -Infinity;
  for (const tree of trees) {
    const dot = tree.dir.dot(dir);
    if (dot > score) { score = dot; best = tree; }
  }
  return best;
}

export class Wildlife {
  constructor(scene, level, art = null) {
    this.level = level;
    this.planet = level.planets.find(planet => planet.id === 'welt') ?? level.planets[0];
    this.trees = level.trees.filter(tree => tree.planet === this.planet);
    this.perches = this.measurePerches(scene);
    this.random = mulberry32(270926);
    this.quality = Math.min(2, deviceTier());
    this.discovered = new Set();
    this.animals = [];
    this.blockers = [];
    this.events = [];
    this.soundWait = 2.5;
    this.counts = { bird: 0, squirrel: 0 };
    this.makeBlockers();
    this.populate();
    this.models = new WildlifeModels(scene, this.counts.bird, this.counts.squirrel);
    this.reset();
  }

  /** Cache the rendered crown under each tree axis before horizon culling
   * compacts its instances. This respects sculpted lobes, fir heights, the
   * tree's random scale and its slightly sunken base without duplicating any
   * scene geometry or doing raycasts in the animation loop. */
  measurePerches(scene) {
    const canopies = [];
    scene.traverse(object => {
      if (object.isInstancedMesh && object.name.startsWith('trees:') && object.name.endsWith(':foliage')) canopies.push(object);
    });
    const heights = new Map();
    if (!canopies.length) return heights;
    scene.updateMatrixWorld(true);
    for (const canopy of canopies) canopy.computeBoundingSphere();
    const ray = new THREE.Raycaster();
    const origin = new THREE.Vector3();
    const inward = new THREE.Vector3();
    const relative = new THREE.Vector3();
    for (const tree of this.trees) {
      const reach = 8 * tree.scale;
      surfacePoint(this.planet, tree.dir, reach, origin);
      inward.copy(tree.dir).negate();
      ray.set(origin, inward);
      ray.near = 0;
      ray.far = reach;
      const hit = ray.intersectObjects(canopies, false)[0];
      if (hit) {
        const height = relative.subVectors(hit.point, this.planet.center).dot(tree.dir) - this.planet.radius;
        if (height > 1) heights.set(tree, height);
      }
    }
    return heights;
  }

  makeBlockers() {
    const add = (dir, radius) => this.blockers.push({ dir: dir.clone(), radius, cosine: Math.cos((radius + .42) / this.planet.radius) });
    for (const tree of this.trees) add(tree.dir, .8 * tree.scale);
    for (const stump of this.level.stumps) if (stump.planet === this.planet) add(stump.dir, 1.35);
    for (const block of this.level.blocks) {
      if (block.planet === this.planet && block.bottom < 1.5) add(block.dir, block.size * .75);
    }
    for (const bump of this.level.bumps) {
      if (bump.planet === this.planet) add(bump.dir, Math.sqrt(Math.max(0, 2 * bump.radius * bump.height - bump.height ** 2)) + .4);
    }
    if (this.level.plateau?.planet === this.planet) add(this.level.plateau.dir, this.level.plateau.radius + .3);
    // Springflower landings are reserved for the player, even when another
    // scenery implementation has not added them to the level data yet.
    for (const [lat, lon] of [[81, 35], [24, 43], [-14, -28]]) add(dirFromLatLon(lat, lon), 1.0);
    if (this.level.biplaneHome?.planet === this.planet) add(this.level.biplaneHome.dir, 1.65);
  }

  /** Conservatively avoids shores, trunks and the footprints of solid props. */
  safe(dir) {
    const latitude = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) * 180 / Math.PI;
    const water = this.planet.water;
    if (water && latitude > water.minLat - 2.2 && latitude < water.maxLat + 2.2) return false;
    return !this.blockers.some(blocker => dir.dot(blocker.dir) > blocker.cosine);
  }

  safeNear(dir, distance = 2.2) {
    if (this.safe(dir)) return dir.clone();
    const start = this.random() * TAU;
    for (let ring = 1; ring <= 7; ring++) {
      for (let i = 0; i < 12; i++) {
        const bearing = start + i / 12 * TAU;
        const heading = tangentDir(EAST, dir, scratch) ?? tangentDir(Z, dir, scratch);
        heading.applyAxisAngle(dir, bearing);
        const target = offset(dir, heading, distance * ring, this.planet.radius);
        if (this.safe(target)) return target;
      }
    }
    return this.level.spawn.dir.clone();
  }

  populate() {
    const add = (kind, dir, state = kind === 'bird' ? 'peck' : 'forage', tree = null) => {
      const home = state === 'perch' || state === 'circle' ? dir.clone() : this.safeNear(dir);
      const index = this.counts[kind]++;
      this.animals.push({
        id: `${kind}-${index + 1}`, kind, index,
        spawn: home.clone(), home: home.clone(), dir: home.clone(),
        tree: tree ?? nearestTree(this.trees, home), initialState: state,
        phase: this.random() * TAU, scale: kind === 'bird' ? .60 + this.random() * .13 : .88 + this.random() * .18,
        facing: tangentDir(EAST, home) ?? tangentDir(Z, home),
        target: home.clone(), escape: new THREE.Vector3(), pos: new THREE.Vector3(),
        visible: false, state, height: 0, age: 0, wait: 0, alert: 0,
      });
    };
    // The first animals are ahead and beside the starting camera, making the
    // world feel inhabited before the player reaches the first tree.
    for (const [lat, lon] of [[83, -24], [79, 23], [66, 120], [69, 130], [64, -75], [30, -36], [21, 40], [-7, -28]]) add('bird', dirFromLatLon(lat, lon));
    for (const [lat, lon] of [[83, 66], [74, -57], [67, 163], [30, -45], [22, 46], [-5, 27], [-24, 174]]) add('squirrel', dirFromLatLon(lat, lon));
    const perches = [0, 8, 12, 17];
    for (const i of perches) {
      const tree = this.trees[i % this.trees.length];
      if (tree) add('bird', tree.dir, 'perch', tree);
    }
    for (let i = 0; i < 6; i++) {
      const tree = this.trees[[4, 10, 18][Math.floor(i / 2)] % this.trees.length];
      if (tree) add('bird', tree.dir, 'circle', tree);
    }
  }

  reset() {
    this.random = mulberry32(270926);
    this.discovered.clear();
    this.soundWait = 2.5;
    this.events.length = 0;
    for (const animal of this.animals) {
      animal.dir.copy(animal.spawn);
      animal.home.copy(animal.spawn);
      animal.target.copy(animal.spawn);
      animal.state = animal.initialState;
      animal.height = animal.state === 'perch' ? this.perchHeight(animal) : animal.state === 'circle' ? this.perchHeight(animal) + 1.2 : 0;
      animal.age = 0;
      animal.wait = 1.2 + this.random() * 3;
      animal.alert = 0;
      animal.visible = false;
      surfacePoint(this.planet, animal.dir, animal.height, animal.pos);
    }
    if (this.models) {
      for (const animal of this.animals) this.models.hide(animal.kind, animal.index);
      this.models.flush();
    }
  }

  setQuality(level) { this.quality = THREE.MathUtils.clamp(Math.round(level), 0, 2); }
  perchHeight(animal) { return this.perches.get(animal.tree) ?? 4.55 * (animal.tree?.scale ?? 1); }
  change(animal, state, wait = 0) { animal.state = state; animal.age = 0; animal.wait = wait; }

  chooseGroundTarget(animal, distance) {
    const heading = tangentDir(EAST, animal.dir, scratch) ?? tangentDir(Z, animal.dir, scratch);
    heading.applyAxisAngle(animal.dir, this.random() * TAU);
    const target = offset(animal.home, heading, distance, this.planet.radius);
    animal.target.copy(this.safeNear(target, .7));
  }

  stepGround(animal, heading, speed, dt) {
    const travel = Math.min(dt * speed, .45);
    const desired = tangentDir(heading, animal.dir, side) ?? animal.facing;
    for (const angle of [0, .65, -.65, 1.3, -1.3]) {
      scratch.copy(desired).applyAxisAngle(animal.dir, angle);
      offset(animal.dir, scratch, travel, this.planet.radius, candidate);
      if (!this.safe(candidate)) continue;
      animal.facing.lerp(scratch, Math.min(1, dt * 12)).normalize();
      animal.dir.copy(candidate);
      return true;
    }
    return false;
  }

  emitSound(type, animal, player, camera, variant = 0) {
    if (this.soundWait > 0) return;
    const distance = animal.pos.distanceTo(player.body.pos);
    if (distance > 22) return;
    let pan = 0;
    if (camera?.matrixWorld) {
      side.setFromMatrixColumn(camera.matrixWorld, 0);
      pan = THREE.MathUtils.clamp(scratch.subVectors(animal.pos, player.body.pos).normalize().dot(side) * .7, -.7, .7);
    }
    this.events.push({ type, distance, pan, variant });
    this.soundWait = type === 'birdChirp' ? 2.4 + this.random() * 3.5 : .65;
  }

  react(animal, player, camera) {
    const distance = animal.pos.distanceTo(player.body.pos);
    if (distance < 4.5 && !this.discovered.has(animal.kind)) {
      this.discovered.add(animal.kind);
      this.events.push({ type: 'wildlifeMeet', kind: animal.kind, pos: animal.pos.clone() });
    }
    const loud = player.spinning || player.pounding;
    const threatRadius = loud ? 5.5 : animal.kind === 'bird' ? 3.1 : 3.0;
    if (distance >= threatRadius || animal.alert > 0 || ['flee', 'scurry', 'return', 'circle'].includes(animal.state)) return;
    animal.escape.subVectors(animal.pos, player.body.pos);
    tangentDir(animal.escape, animal.dir, animal.escape);
    if (animal.escape.lengthSq() < .001) animal.escape.copy(animal.facing);
    animal.alert = 3.8;
    if (animal.kind === 'bird') {
      this.change(animal, 'flee', 1.1 + this.random() * .45);
      this.emitSound('birdChirp', animal, player, camera, 2);
    } else {
      this.change(animal, 'scurry', .9 + this.random() * .6);
      this.emitSound('leafRustle', animal, player, camera);
    }
  }

  birdStep(animal, dt, time, player, camera) {
    const state = animal.state;
    if (state === 'flee') {
      offset(animal.dir, animal.escape, dt * 5.5, this.planet.radius, animal.dir);
      animal.facing.copy(animal.escape);
      animal.height += dt * (animal.height < 4.6 ? 4.5 : .8);
      if (animal.age >= animal.wait) this.change(animal, 'return');
    } else if (state === 'return') {
      const target = animal.tree?.dir ?? animal.home;
      const separation = animal.dir.angleTo(target) * this.planet.radius;
      scratch.copy(target).sub(animal.dir);
      if (separation > .18) {
        offset(animal.dir, scratch, Math.min(separation, dt * 4.4), this.planet.radius, animal.dir);
        animal.facing.lerp(scratch.normalize(), Math.min(1, dt * 8)).normalize();
      }
      const goalHeight = this.perchHeight(animal) + Math.min(1.2, separation * .12);
      animal.height = THREE.MathUtils.damp(animal.height, goalHeight, 3, dt);
      if (separation < .25 && Math.abs(animal.height - this.perchHeight(animal)) < .3) {
        animal.dir.copy(target);
        animal.height = this.perchHeight(animal);
        this.change(animal, 'perch', 5 + this.random() * 5);
      }
    } else if (state === 'circle') {
      const center = animal.tree?.dir ?? animal.home;
      const tangent = tangentDir(EAST, center, scratch) ?? tangentDir(Z, center, scratch);
      tangent.applyAxisAngle(center, time * .7 + animal.phase);
      const previous = animal.dir.clone();
      offset(center, tangent, 2.5 + .25 * Math.sin(time + animal.phase), this.planet.radius, animal.dir);
      animal.facing.subVectors(animal.dir, previous).normalize();
      animal.height = this.perchHeight(animal) + 1.25 + Math.sin(time * 1.6 + animal.phase) * .32;
      // A flock eventually settles, then rejoins the air from its perch.
      if (animal.age > 13 + animal.phase) this.change(animal, 'return');
    } else if (state === 'perch') {
      if (animal.age > animal.wait) {
        this.emitSound('birdChirp', animal, player, camera, animal.index % 3);
        if (animal.initialState === 'circle') this.change(animal, 'circle');
        else if (animal.age > animal.wait + 7) {
          // Ground birds return to their little patch after looking around.
          if (animal.initialState === 'peck') this.change(animal, 'descend');
          else { animal.age = 0; animal.wait = 5 + this.random() * 6; }
        }
      }
    } else if (state === 'descend') {
      const separation = animal.dir.angleTo(animal.home) * this.planet.radius;
      scratch.copy(animal.home).sub(animal.dir);
      if (separation > .1) offset(animal.dir, scratch, Math.min(separation, dt * 3.5), this.planet.radius, animal.dir);
      const desired = separation > 1.2 ? 4.6 : 0;
      animal.height = THREE.MathUtils.damp(animal.height, desired, 3, dt);
      animal.facing.lerp(scratch.normalize(), Math.min(1, dt * 5)).normalize();
      if (separation < .15 && animal.height < .07) {
        animal.dir.copy(animal.home); animal.height = 0;
        this.change(animal, 'peck', 2 + this.random() * 3);
      }
    } else if (state === 'hop') {
      scratch.copy(animal.target).sub(animal.dir);
      this.stepGround(animal, scratch, 1.2, dt);
      animal.height = Math.sin(Math.min(1, animal.age / .4) * Math.PI) * .18;
      if (animal.age > .4) { animal.height = 0; this.change(animal, 'peck', 1 + this.random() * 3); }
    } else if (animal.age > animal.wait) {
      if (this.random() > .5) this.emitSound('birdChirp', animal, player, camera, animal.index % 3);
      this.chooseGroundTarget(animal, .8 + this.random() * 1.4);
      this.change(animal, 'hop');
    }
  }

  squirrelStep(animal, dt, player, camera) {
    if (animal.state === 'scurry') {
      this.stepGround(animal, animal.escape, 4.8, dt);
      if (animal.age > animal.wait) {
        // Return to a dry patch at the base of its own tree, never the trunk.
        const treeDir = animal.tree?.dir ?? animal.home;
        animal.target.copy(this.safeNear(offset(treeDir, animal.home.clone().sub(treeDir), 1.8 * (animal.tree?.scale ?? 1), this.planet.radius), .6));
        this.change(animal, 'return');
      }
    } else if (animal.state === 'return') {
      const distance = animal.dir.angleTo(animal.target) * this.planet.radius;
      scratch.copy(animal.target).sub(animal.dir);
      const moved = distance > .18 && this.stepGround(animal, scratch, 2.6, dt);
      if (distance < .22 || !moved || animal.age > 6) {
        animal.home.copy(animal.dir);
        this.change(animal, 'sit', 3 + this.random() * 3);
      }
    } else if (animal.state === 'sit') {
      if (animal.age > animal.wait) {
        this.emitSound('squirrel', animal, player, camera, animal.index % 2);
        this.chooseGroundTarget(animal, .7 + this.random() * 1.4);
        this.change(animal, 'forage', 3 + this.random() * 4);
      }
    } else {
      const distance = animal.dir.angleTo(animal.target) * this.planet.radius;
      if (distance > .25 && Math.sin(animal.age * 3) > 0) {
        scratch.copy(animal.target).sub(animal.dir);
        this.stepGround(animal, scratch, .9, dt);
      }
      if (animal.age > animal.wait) this.change(animal, 'sit', 2.5 + this.random() * 3.5);
    }
  }

  visible(animal, camera, player) {
    if (animal.index >= LIMITS[this.quality][animal.kind]) return false;
    const eye = camera?.position ?? player.body.pos;
    if (animal.pos.distanceToSquared(eye) > [38, 55, 72][this.quality] ** 2) return false;
    cameraDir.subVectors(eye, this.planet.center);
    const distance = cameraDir.length();
    cameraDir.normalize();
    const horizon = Math.acos(Math.min(1, this.planet.radius / Math.max(this.planet.radius, distance)));
    const animalHorizon = Math.acos(this.planet.radius / (this.planet.radius + animal.height + 1.7));
    return animal.dir.dot(cameraDir) > Math.cos(Math.min(Math.PI, horizon + animalHorizon + .06));
  }

  update(dt, time, player, { active = true, camera = null } = {}) {
    this.events.length = 0;
    this.models.group.visible = active;
    if (!active) {
      for (const animal of this.animals) animal.visible = false;
      return this.events;
    }
    if (!player?.body?.pos || !(dt > 0)) return this.events;
    dt = Math.min(.08, dt);
    this.soundWait = Math.max(0, this.soundWait - dt);
    for (const animal of this.animals) {
      const enabled = animal.index < LIMITS[this.quality][animal.kind];
      if (enabled && animal.pos.distanceToSquared(player.body.pos) < 60 ** 2) {
        animal.age += dt;
        animal.alert = Math.max(0, animal.alert - dt);
        this.react(animal, player, camera);
        if (animal.kind === 'bird') this.birdStep(animal, dt, time, player, camera);
        else this.squirrelStep(animal, dt, player, camera);
        surfacePoint(this.planet, animal.dir, animal.height, animal.pos);
      }
      animal.visible = enabled && this.visible(animal, camera, player);
      if (!animal.visible) { this.models.hide(animal.kind, animal.index); continue; }
      const facing = tangentDir(animal.facing, animal.dir, forward) ?? tangentDir(EAST, animal.dir, forward) ?? tangentDir(Z, animal.dir, forward);
      side.crossVectors(animal.dir, facing).normalize();
      basis.makeBasis(side, animal.dir, facing);
      object.quaternion.setFromRotationMatrix(basis);
      object.position.copy(animal.pos);
      object.scale.setScalar(animal.scale);
      object.updateMatrix();
      this.models.draw(animal, object.matrix, time);
    }
    this.models.flush();
    return this.events;
  }

  layout() {
    return this.animals.map(animal => ({ id: animal.id, kind: animal.kind, planet: this.planet.id, dir: animal.spawn.toArray(),
      height: ['perch', 'circle'].includes(animal.initialState) ? this.perchHeight(animal) : 0, state: animal.initialState }));
  }
  snapshot() {
    return { discovered: [...this.discovered], counts: { ...this.counts }, visible: this.animals.filter(animal => animal.visible).length,
      animals: this.animals.map(animal => ({ id: animal.id, kind: animal.kind, state: animal.state, pos: animal.pos.toArray(),
        dir: animal.dir.toArray(), planet: this.planet.id, visible: animal.visible })) };
  }
  dispose() { this.models.dispose(); }
}
