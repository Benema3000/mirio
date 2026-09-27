// Original spring blossoms: optional toys along the exploration route.
// All geometry is made here; none of Miro's image or model assets is altered.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dirFromLatLon, surfacePoint } from './world.js';

const UP = new THREE.Vector3(0, 1, 0);
const relative = new THREE.Vector3();
export const SPRING_SPEED = 17;
export const POUND_SPRING_SPEED = 22;
export const SPRING_GRAVITY = .75;
export const SPRING_RADIUS = .84;

export function springLayouts(level) {
  return [[81, 35], [24, 43], [-14, -28]].map(([lat, lon], i) => ({
    id: `blossom-${i}`, planet: level.planets[0], dir: dirFromLatLon(lat, lon), color: [0xff87ba, 0xffcf72, 0xc3a1ff][i],
  }));
}

export function springContact({ samePlanet, radial, height, verticalSpeed, grounded, cooldown, playing }) {
  return playing && samePlanet && cooldown <= 0 && radial < SPRING_RADIUS && height >= -.15 && height < .62 && (grounded || verticalSpeed < -.5);
}

function painted(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const shade = .94 + (p.getY(i) + 1) * .06;
    colors.set([c.r * shade, c.g * shade, c.b * shade], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (g !== geometry) geometry.dispose();
  return g;
}
function ellipsoid(scale, position, color, yaw = 0, lean = 0) {
  const g = new THREE.SphereGeometry(1, 16, 10).scale(...scale).rotateX(lean).rotateY(yaw).translate(...position);
  return painted(g, color);
}
function merged(parts) { const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g; }
function blossomGeometry(color) {
  const petals = [];
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    petals.push(ellipsoid([.28, .12, .65], [Math.sin(angle) * .58, .34, Math.cos(angle) * .58], color, angle, -.15));
    petals.push(ellipsoid([.18, .035, .38], [Math.sin(angle) * .53, .46, Math.cos(angle) * .53], 0xffe5ed, angle));
  }
  petals.push(ellipsoid([.42, .2, .42], [0, .45, 0], 0xffc44e));
  for (let i = 0; i < 13; i++) {
    const angle = i * 2.39996;
    const radius = .08 * Math.sqrt(i);
    petals.push(ellipsoid([.034, .032, .034], [Math.cos(angle) * radius, .638 - radius * .12, Math.sin(angle) * radius], 0xffefa5));
  }
  return merged(petals);
}
function leavesGeometry() {
  const parts = [painted(new THREE.CylinderGeometry(.12, .19, .34, 10).translate(0, .12, 0), 0x4b9b63)];
  for (let i = 0; i < 4; i++) {
    const angle = i / 4 * Math.PI * 2 + .35;
    parts.push(ellipsoid([.25, .085, .59], [Math.sin(angle) * .56, .1, Math.cos(angle) * .56], i % 2 ? 0x73bd72 : 0x439268, angle));
  }
  return merged(parts);
}

export class SpringGarden {
  constructor(scene, level, art) {
    this.material = new THREE.MeshPhongMaterial({vertexColors: true, shininess: 45, specular: 0x8d765f});
    const leaves = leavesGeometry();
    const shadowGeometry = new THREE.PlaneGeometry(3.1, 3.1).rotateX(-Math.PI / 2);
    const shadowMaterial = new THREE.MeshBasicMaterial({map: art.shadow, transparent: true, opacity: .34, depthWrite: false});
    this.flowers = springLayouts(level).map(layout => {
      const group = new THREE.Group();
      const head = new THREE.Mesh(blossomGeometry(layout.color), this.material);
      group.add(new THREE.Mesh(leaves, this.material), head);
      const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
      shadow.position.y = .022;
      group.add(shadow);
      group.position.copy(surfacePoint(layout.planet, layout.dir, .025));
      group.quaternion.setFromUnitVectors(UP, layout.dir);
      scene.add(group);
      return {...layout, group, head, shadow, cooldown: 0, pulse: 0, pos: group.position.clone()};
    });
    this.reset();
  }
  reset() { this.used = new Set(); for (const f of this.flowers) { f.cooldown = 0; f.pulse = 0; } }
  step(dt, player, active) {
    const events = [];
    for (const flower of this.flowers) {
      flower.cooldown = Math.max(0, flower.cooldown - dt);
      flower.pulse = Math.max(0, flower.pulse - dt * 2.7);
      if (!active) continue;
      relative.subVectors(player.body.pos, flower.pos);
      const height = relative.dot(flower.dir);
      const radial = relative.addScaledVector(flower.dir, -height).length();
      if (!springContact({samePlanet: player.body.planet === flower.planet, radial, height, verticalSpeed: player.body.vel.dot(flower.dir), grounded: player.body.onGround, cooldown: flower.cooldown, playing: player.state === 'play'})) continue;
      const strong = player.pounding;
      player.bounce({speed: strong ? POUND_SPRING_SPEED : SPRING_SPEED, gravityScale: SPRING_GRAVITY});
      player.body.pos.addScaledVector(flower.dir, Math.max(0, .42 - height));
      player.stun = 0;
      flower.cooldown = .6;
      flower.pulse = 1;
      this.used.add(flower.id);
      events.push({type: 'spring', pos: flower.pos.clone(), color: flower.color, strong});
    }
    return events;
  }
  update(time, camera) {
    for (const f of this.flowers) {
      f.head.scale.set(1 + f.pulse * .15, 1 - f.pulse * .5, 1 + f.pulse * .15);
      f.head.rotation.y = Math.sin(time * .8 + f.dir.x * 5) * .025;
      const distance = camera.position.distanceTo(f.pos);
      const facing = relative.subVectors(camera.position, f.planet.center).normalize().dot(f.dir);
      f.group.visible = distance < 65 && facing > -.2;
    }
  }
  snapshot() { return {used: [...this.used], flowers: this.flowers.map(f => ({id: f.id, cooldown: f.cooldown}))}; }
  layout() { return this.flowers.map(f => ({id: f.id, planet: f.planet.id, dir: f.dir.toArray(), height: .45})); }
}
