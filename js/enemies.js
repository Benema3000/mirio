// Original toy-like creatures for the optional paths. No drawing texture or
// Mirio model is reused: shells, faces, leaves and moon stones are geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { trailLayouts } from './adventure.js';
import { collidersFor } from './level.js';
import { dirFromLatLon, surfacePoint, tangentDir } from './world.js';
import { EnemyBrain, ENEMY_RULES } from './enemy-rules.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3(), rel = new THREE.Vector3(), right = new THREE.Vector3();
const matrix = new THREE.Matrix4(), starMatrix = new THREE.Matrix4();
const PALETTE = { beetle: 0x42b7a0, pebble: 0xa6b1eb };
const CLEARANCE = ENEMY_RULES.leash + 1.1;

/** Deterministic safe patches, with the complete leash clear of route props. */
export function enemyLayouts(level) {
  const colliders = collidersFor(level);
  const trails = trailLayouts(level);
  const [world, moon] = level.planets;
  const protectedWorld = [...level.flags.filter(f => f.planet === world).map(f => f.dir), level.spawn.dir];
  // The main path and the springflowers belong to the player, not patrols.
  for (let lat = 88; lat >= -54; lat -= 2) protectedWorld.push(dirFromLatLon(lat, 0));
  for (const [lat, lon] of [[81, 35], [24, 43], [-14, -28]]) protectedWorld.push(dirFromLatLon(lat, lon));
  const protectedMoon = [level.moonSpawn.dir, level.rocket.flight.landing, level.arena.dir];
  for (const trail of trails) (trail.planet === world ? protectedWorld : protectedMoon).push(...trail.dirs);
  const layouts = [];
  const safe = (planet, dir) => {
    const points = planet === world ? protectedWorld : protectedMoon;
    if (points.some(p => dir.angleTo(p) * planet.radius < CLEARANCE + 1)) return false;
    if (layouts.some(e => e.planet === planet && e.dir.angleTo(dir) * planet.radius < ENEMY_RULES.leash * 2 + 2)) return false;
    const pos = surfacePoint(planet, dir);
    if (planet.water) {
      const latitude = Math.asin(dir.y) * 180 / Math.PI;
      const margin = CLEARANCE / planet.radius * 180 / Math.PI;
      if (latitude > planet.water.minLat - margin && latitude < planet.water.maxLat + margin) return false;
    }
    for (const c of colliders(planet)) {
      if (c.kind === 'bump') { if (pos.distanceTo(c.center) < c.radius + CLEARANCE) return false; continue; }
      rel.subVectors(pos, c.base);
      const along = rel.dot(c.axis);
      if (along > c.height + 2.5 || along < -3) continue;
      const width = c.kind === 'box' ? Math.hypot(c.halfW, c.halfD) : c.radius;
      if (rel.addScaledVector(c.axis, -along).length() < width + CLEARANCE) return false;
    }
    return true;
  };
  const add = (planet, dir, kind) => {
    if (!safe(planet, dir)) return false;
    layouts.push({ id: `${kind}-${layouts.length + 1}`, kind, planet, dir, name: kind === 'beetle' ? 'Mooskrabbler' : 'Mondkiesel', color: PALETTE[kind] });
    return true;
  };
  const meadow = [[72, 105], [64, 80], [24, 65], [-16, -52], [-63, 35], [-22, 110], [67, -95], [18, -80], [-60, -90], [8, 110], [-32, 65]];
  for (const [lat, lon] of meadow) { add(world, dirFromLatLon(lat, lon), 'beetle'); if (layouts.length >= 5) break; }
  const landing = level.rocket.flight.landing;
  const along = tangentDir(new THREE.Vector3(0, 0, 1), landing) ?? tangentDir(new THREE.Vector3(1, 0, 0), landing);
  const side = new THREE.Vector3().crossVectors(landing, along).normalize();
  for (const angle of [0.65, 1, 1.35, 1.7, 2.05]) {
    for (const bearing of [Math.PI, -Math.PI / 2, Math.PI / 2, 0]) {
      const heading = along.clone().multiplyScalar(Math.cos(bearing)).addScaledVector(side, Math.sin(bearing));
      const dir = landing.clone().multiplyScalar(Math.cos(angle)).addScaledVector(heading, Math.sin(angle)).normalize();
      add(moon, dir, 'pebble');
      if (layouts.length >= 7) return layouts;
    }
  }
  return layouts;
}

function painted(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const c = new THREE.Color(color), count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) c.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
function ellipsoid(x, y, z, sx, sy, sz, color, segments = 16) {
  return painted(new THREE.SphereGeometry(1, segments, 10).scale(sx, sy, sz).translate(x, y, z), color);
}
function combined(parts, material) {
  const geometry = mergeGeometries(parts);
  parts.forEach(g => g.dispose());
  return new THREE.Mesh(geometry, material);
}
const paintedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.56, metalness: 0.03 });
const eyeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.26 });
const goldMaterial = new THREE.MeshStandardMaterial({ color: 0xffd574, emissive: 0x805015, emissiveIntensity: 0.4, roughness: 0.4 });
const starGeometry = new THREE.OctahedronGeometry(0.095);

function creature(kind, art) {
  const group = new THREE.Group(), body = new THREE.Group();
  group.add(body);
  const pebble = kind === 'pebble';
  const shellMaterial = new THREE.MeshPhysicalMaterial({ color: PALETTE[kind], roughness: pebble ? 0.72 : 0.36, metalness: 0.04, clearcoat: pebble ? 0.08 : 0.45, clearcoatRoughness: 0.3 });
  const shell = new THREE.Mesh(pebble ? new THREE.IcosahedronGeometry(0.73, 1) : new THREE.SphereGeometry(0.73, 24, 16), shellMaterial);
  shell.scale.set(1, pebble ? 0.83 : 0.69, 1);
  shell.position.set(0, 0.7, -0.04);
  body.add(shell);
  const trim = [
    ellipsoid(0, 0.32, 0.02, 0.57, 0.25, 0.57, pebble ? 0x7478b0 : 0x246d68),
    ellipsoid(0, 0.54, 0.47, 0.42, 0.29, 0.27, pebble ? 0xc9d0ee : 0x83d4ba),
    ellipsoid(-0.32, 0.58, 0.67, 0.1, 0.065, 0.026, 0xf7bc88),
    ellipsoid(0.32, 0.58, 0.67, 0.1, 0.065, 0.026, 0xf7bc88),
  ];
  const smile = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.11, 0.46, 0.72), new THREE.Vector3(0, 0.43, 0.745), new THREE.Vector3(0.11, 0.46, 0.72)]);
  trim.push(painted(new THREE.TubeGeometry(smile, 10, 0.019, 5, false), 0x254a58));
  if (!pebble) {
    const seam = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.83, -0.74), new THREE.Vector3(0, 1.205, -0.06), new THREE.Vector3(0, 1.03, 0.5)]);
    trim.push(painted(new THREE.TubeGeometry(seam, 16, 0.024, 5, false), 0xd4e9a5));
    for (const x of [-0.4, 0.4]) trim.push(ellipsoid(x, 1.025, -0.2, 0.085, 0.024, 0.11, 0xc7e9bb));
  } else {
    for (const [x, y, z, scale] of [[-.38, .97, .32, .12], [.3, 1.06, -.12, .1], [.5, .76, -.18, .08]]) {
      trim.push(painted(new THREE.TorusGeometry(scale, 0.025, 5, 12).rotateX(-0.6).translate(x, y, z), 0x8189c0));
    }
  }
  body.add(combined(trim, paintedMaterial));
  const eyeParts = [];
  for (const x of [-0.19, 0.19]) {
    eyeParts.push(ellipsoid(x, 0, 0.69, 0.137, 0.18, 0.09, 0xfffcf2));
    eyeParts.push(ellipsoid(x + 0.015, -0.008, 0.775, 0.067, 0.097, 0.024, 0x193c4b));
    eyeParts.push(ellipsoid(x - 0.003, 0.029, 0.801, 0.025, 0.034, 0.012, 0xffffff, 10));
  }
  const eyes = combined(eyeParts, eyeMaterial);
  eyes.position.y = 0.81;
  body.add(eyes);
  const feet = [];
  for (const sign of [-1, 1]) {
    const parts = [];
    for (const z of pebble ? [-0.25, 0.32] : [-0.4, 0, 0.4]) parts.push(ellipsoid(sign * 0.6, 0.17, z, 0.22, 0.13, 0.16, pebble ? 0x7478b0 : 0xe1b978));
    const foot = combined(parts, paintedMaterial);
    body.add(foot);
    feet.push(foot);
  }
  const ornament = new THREE.Group();
  ornament.position.set(0, 1.12, -0.13);
  if (pebble) {
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color: 0x90e6e8, emissive: 0x326f91, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.2 }));
    shard.scale.set(0.65, 1.1, 0.65);
    shard.position.y = 0.14;
    ornament.add(shard);
  } else {
    const stem = painted(new THREE.CylinderGeometry(0.027, 0.036, 0.28, 6).translate(0, 0.12, 0), 0x569252);
    const leaves = [stem, painted(new THREE.SphereGeometry(1, 12, 8).scale(.28, .055, .115).rotateZ(.4).translate(-.19, .28, 0), 0x9bcf72), painted(new THREE.SphereGeometry(1, 12, 8).scale(.25, .06, .13).rotateZ(-.5).translate(.17, .31, 0), 0xc9e694)];
    ornament.add(combined(leaves, paintedMaterial));
  }
  body.add(ornament);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 2.25), new THREE.MeshBasicMaterial({ map: art.shadow, color: 0x253b41, transparent: true, opacity: 0.55, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.035;
  group.add(shadow);
  const warning = new THREE.Mesh(new THREE.RingGeometry(0.94, 1.025, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffce68, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide }));
  warning.position.y = 0.05;
  group.add(warning);
  const stars = new THREE.InstancedMesh(starGeometry, goldMaterial, 3);
  stars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stars.frustumCulled = false;
  group.add(stars);
  return { group, body, shell, eyes, feet, ornament, shadow, warning, stars };
}

export class EnemySystem {
  constructor(scene, level, art) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.tier = 2;
    this.active = true;
    this.enemies = enemyLayouts(level).map((layout, i) => {
      const model = creature(layout.kind, art);
      this.group.add(model.group);
      const forward = tangentDir(new THREE.Vector3(0, 0, 1), layout.dir) ?? tangentDir(new THREE.Vector3(1, 0, 0), layout.dir);
      return { ...layout, model, brain: new EnemyBrain(layout.kind, i * 1.73),
        anchor: surfacePoint(layout.planet, layout.dir), forward,
        right: new THREE.Vector3().crossVectors(layout.dir, forward).normalize(),
        pos: new THREE.Vector3(), up: layout.dir.clone(), facing: forward.clone() };
    });
    this.reset();
  }
  reset() {
    this.defeated = 0;
    this.lastPound = null;
    for (const enemy of this.enemies) { enemy.brain.reset(); this.place(enemy); }
  }
  setQuality(tier) { this.tier = tier; }
  place(enemy) {
    const { brain, planet } = enemy;
    enemy.up.copy(enemy.anchor).addScaledVector(enemy.right, brain.x).addScaledVector(enemy.forward, brain.z).sub(planet.center).normalize();
    surfacePoint(planet, enemy.up, 0.025, enemy.pos);
    tmp.copy(enemy.right).multiplyScalar(brain.facingX).addScaledVector(enemy.forward, brain.facingZ);
    tangentDir(tmp, enemy.up, enemy.facing);
    right.crossVectors(enemy.up, enemy.facing).normalize();
    matrix.makeBasis(right, enemy.up, enemy.facing);
    enemy.model.group.position.copy(enemy.pos);
    enemy.model.group.quaternion.setFromRotationMatrix(matrix);
  }
  step(dt, player, { active = true } = {}) {
    this.active = active;
    const events = [];
    const pound = player.events?.findLast(event => event.type === 'pound');
    const freshPound = pound && pound !== this.lastPound;
    if (pound) this.lastPound = pound;
    for (const enemy of this.enemies) {
      const samePlanet = player.body.planet === enemy.planet;
      const canInteract = active && samePlanet && player.state === 'play';
      rel.subVectors(player.body.pos, enemy.anchor);
      const target = canInteract ? { x: rel.dot(enemy.right), z: rel.dot(enemy.forward), height: rel.dot(enemy.dir) } : null;
      const notice = enemy.brain.step(dt, target, active);
      this.place(enemy);
      if (notice) events.push({ type: 'enemyNotice', id: enemy.id, kind: enemy.kind, pos: enemy.pos.clone(), color: enemy.color });
      // Release is observed even outside the creature's contact radius.
      if (!player.spinning) enemy.brain.spinReady = true;
      if (!canInteract) continue;
      rel.subVectors(player.body.pos, enemy.pos);
      const feet = rel.dot(enemy.up) - enemy.brain.hop;
      const distance = rel.addScaledVector(enemy.up, -rel.dot(enemy.up)).length();
      const hit = enemy.brain.contact({ distance, feet, verticalSpeed: player.body.vel.dot(enemy.up), spinning: player.spinning,
        pounding: player.pounding, poundImpact: freshPound && pound.pos.distanceTo(enemy.pos) < 2.4,
        invulnerable: player.invulnerable > 0, playerHeight: player.body.height });
      if (!hit) continue;
      if (hit.type === 'hurt') { player.hurt(enemy.pos); continue; }
      if (hit.bounce) player.bounce();
      if (hit.type === 'defeat') this.defeated++;
      events.push({ type: hit.type === 'defeat' ? 'enemyDefeat' : 'enemyStun', id: enemy.id, kind: enemy.kind,
        pos: enemy.pos.clone().addScaledVector(enemy.up, 0.7), color: enemy.color, method: hit.method });
    }
    return events;
  }
  update(time, camera) {
    for (const enemy of this.enemies) {
      const { brain, model } = enemy;
      const vanished = brain.mode === 'defeated' && brain.timer >= ENEMY_RULES.vanish;
      const distance = camera ? camera.position.distanceTo(enemy.pos) : 0;
      const onVisibleSide = !camera || tmp.subVectors(camera.position, enemy.pos).dot(enemy.up) > -2;
      model.group.visible = !vanished && distance < (this.tier === 0 ? 38 : 75) && onVisibleSide;
      if (!model.group.visible) continue;
      const charging = brain.mode === 'charge', warning = brain.mode === 'windup', stunned = brain.mode === 'stunned';
      const beat = time * (charging ? 22 : 7) + brain.phase;
      const gait = brain.mode === 'patrol' || charging || brain.mode === 'recover';
      let squash = warning ? -0.15 * Math.min(1, brain.timer / ENEMY_RULES.windup) : stunned ? -0.08 : Math.sin(beat) * (gait ? 0.035 : 0.012);
      model.body.position.y = brain.hop + (gait ? Math.abs(Math.sin(beat)) * 0.035 : 0);
      model.body.rotation.z = stunned ? Math.sin(time * 5) * 0.09 : Math.sin(beat) * (gait ? 0.035 : 0.01);
      model.body.rotation.x = warning ? 0.12 : charging ? -0.1 : 0;
      model.body.rotation.y = 0;
      model.body.scale.set(1 - squash * 0.4, 1 + squash, 1 - squash * 0.4);
      if (brain.mode === 'defeated') {
        const progress = Math.min(1, brain.timer / ENEMY_RULES.vanish);
        model.body.position.y = Math.sin(progress * Math.PI) * 1.4;
        model.body.scale.setScalar(Math.max(0.001, 1 - progress ** 2));
        model.body.rotation.y = progress * Math.PI * 2;
      }
      model.eyes.scale.y = stunned ? 0.45 : (time + brain.phase) % 4.2 < 0.13 ? 0.12 : 1;
      model.ornament.rotation.z = Math.sin(time * 3 + brain.phase) * 0.15;
      model.feet.forEach((foot, i) => { foot.position.y = gait ? Math.max(0, Math.sin(beat + i * Math.PI)) * 0.11 : 0; });
      model.shell.material.emissive.set(warning ? 0xa45011 : stunned ? 0x455477 : 0x000000);
      model.shell.material.emissiveIntensity = warning ? 0.24 + Math.sin(time * 18) * 0.08 : 0.14;
      model.shadow.scale.setScalar(1 - brain.hop * 0.22);
      model.shadow.material.opacity = brain.mode === 'defeated' ? 0.55 * Math.max(0, 1 - brain.timer / ENEMY_RULES.vanish) : 0.55 - brain.hop * 0.15;
      model.warning.visible = warning;
      model.warning.scale.setScalar(1.2 - Math.min(1, brain.timer / ENEMY_RULES.windup) * 0.28);
      model.stars.visible = stunned;
      if (stunned) {
        for (let i = 0; i < 3; i++) {
          const a = time * 2.3 + i * Math.PI * 2 / 3;
          starMatrix.makeRotationY(a);
          starMatrix.setPosition(Math.cos(a) * 0.68, 1.55 + Math.sin(a * 2) * 0.08, Math.sin(a) * 0.68);
          model.stars.setMatrixAt(i, starMatrix);
        }
        model.stars.instanceMatrix.needsUpdate = true;
      }
    }
  }
  snapshot() {
    return { defeated: this.defeated, total: this.enemies.length, creatures: this.enemies.map(enemy => ({ id: enemy.id, kind: enemy.kind, planet: enemy.planet.id,
      mode: enemy.brain.mode, pos: enemy.pos.toArray(), up: enemy.up.toArray(), dir: enemy.up.toArray(),
      height: ENEMY_RULES.height + enemy.brain.hop, headHeight: ENEMY_RULES.height + enemy.brain.hop,
      hop: enemy.brain.hop, timer: enemy.brain.timer })) };
  }
  layout() {
    return this.enemies.map(enemy => ({ id: enemy.id, kind: enemy.kind, name: enemy.name, planet: enemy.planet.id, dir: enemy.dir.toArray(), radius: ENEMY_RULES.radius, height: ENEMY_RULES.height }));
  }
}
