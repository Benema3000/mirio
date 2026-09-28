import * as THREE from 'three';
import {DISCOVERY, nearbyDiscoveryGate} from './discovery-level.js';
import {dirFromLatLon, surfacePoint, tangentDir} from './world.js';

const UP = new THREE.Vector3(0, 1, 0);
const GATE_HEIGHT = 2.1;

export class DiscoveryGates {
  #gates; #meshes = []; #cooldown = 0; #discovered = false; #checkpoint = null;

  constructor(scene, level) {
    this.#gates = level.bonus.gates;
    for (const gate of this.#gates) {
      const group = new THREE.Group(), material = new THREE.MeshLambertMaterial({color: gate.color, emissive: gate.color, emissiveIntensity: .3});
      group.position.copy(surfacePoint(gate.planet, gate.dir));
      const forward = tangentDir(dirFromLatLon(85, gate.id === 'enter' ? 180 : -100), gate.dir);
      group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(gate.dir, forward), gate.dir, forward));
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.8, .16, 8, 36), material);
      halo.position.y = GATE_HEIGHT;
      group.add(halo);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(.36), material);
      star.position.y = 4.4;
      group.add(star);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, .2, 24), new THREE.MeshLambertMaterial({color: 0xf9e8c2}));
      base.position.y = .05;
      group.add(base);
      // The chequered threshold distinguishes the race from the return gate.
      if (gate.id === 'race') for (let i = 0; i < 8; i++) {
        const flag = new THREE.Mesh(new THREE.BoxGeometry(.45, .4, .08), new THREE.MeshLambertMaterial({color: i % 2 ? 0x3c3651 : 0xfff9df}));
        flag.position.set((i - 3.5) * .45, 3.8, .04); group.add(flag);
      }
      scene.add(group);
      this.#meshes.push({gate, group, halo, star});
    }
    // A few blue feathers peel away from the familiar far-side gem trail.
    const world = level.planets[0], featherMaterial = new THREE.MeshLambertMaterial({color: 0x82dfd8, emissive: 0x285c62});
    for (const [lat, lon] of [[78, 100], [74, 127], [69, 151], [65, 171]]) {
      const feather = new THREE.Mesh(new THREE.OctahedronGeometry(.24), featherMaterial);
      const dir = dirFromLatLon(lat, lon);
      feather.scale.set(.45, 1.7, 1); feather.position.copy(surfacePoint(world, dir, 1.4));
      feather.quaternion.setFromUnitVectors(UP, dir); scene.add(feather);
    }
  }

  reset() { this.#discovered = false; this.#checkpoint = null; this.#cooldown = 0; }
  near(player) { return this.#cooldown > 0 ? null : nearbyDiscoveryGate(this.#gates, player); }

  activate(gate, player) {
    if (!gate || this.#cooldown > 0) return null;
    this.#cooldown = DISCOVERY.cooldown;
    if (gate.id === 'race') return {type: 'race'};
    if (gate.id === 'enter') {
      this.#checkpoint = {planet: player.checkpoint.planet, dir: player.checkpoint.dir.clone()};
      this.#discovered = true;
      return {type: 'travel', destination: 'bonus'};
    }
    return {type: 'travel', destination: 'meadow', checkpoint: this.#checkpoint};
  }

  update(dt, time, camera, {reducedMotion = false} = {}) {
    this.#cooldown = Math.max(0, this.#cooldown - dt);
    for (const item of this.#meshes) {
      item.group.visible = camera.position.distanceTo(item.group.position) < 90;
      item.star.rotation.y = reducedMotion ? 0 : time;
      item.halo.material.emissiveIntensity = this.#discovered ? .45 : .25;
    }
  }

  snapshot() { return {discovered: this.#discovered}; }
  layout() { return this.#gates.map(gate => ({id: gate.id, planet: gate.planet.id, dir: gate.dir.toArray(), pos: surfacePoint(gate.planet, gate.dir).toArray()})); }
}
