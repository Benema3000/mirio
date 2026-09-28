// Optional, repeatable constellation trails. These original props never use
// or modify Miro's drawing textures. Rewards are local badges and a short
// gem magnet; public high-score totals retain their existing meaning.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dirFromLatLon, surfacePoint, tangentDir } from './world.js';
const UP = new THREE.Vector3(0, 1, 0);

export const TRAIL_TIME = 18;
export const MAGNET_TIME = 12;

export function trailLayouts(level) {
  const [, moon] = level.planets;
  const landing = level.rocket.flight.landing;
  const along = tangentDir(new THREE.Vector3(0, 0, 1), landing) ?? tangentDir(new THREE.Vector3(1, 0, 0), landing);
  const side = new THREE.Vector3().crossVectors(landing, along).normalize();
  // One trail, on the moon: a find for the second world, nothing at the start.
  return [
    { id: 'moon', name: 'Mondspuren', planet: moon, color: 0x81f2ee,
      dirs: [.1, .145, .19, .235, .28, .325].map(t => landing.clone().multiplyScalar(Math.cos(Math.PI * t))
        .addScaledVector(along, Math.sin(Math.PI * t)).addScaledVector(side, -.19).normalize()) },
  ];
}

// Pure rule state, separated from rendering for deterministic checks.
export class TrailRun {
  constructor(count, duration = TRAIL_TIME) { this.count = count; this.duration = duration; this.reset(); }
  reset() { this.next = 0; this.time = 0; this.active = false; this.complete = false; }
  enter(index) {
    if (index !== this.next || this.complete) return null;
    if (!this.active) { this.active = true; this.time = this.duration; }
    this.next++;
    if (this.next === this.count) { this.active = false; this.complete = true; return 'complete'; }
    return index === 0 ? 'start' : 'ring';
  }
  step(dt) {
    if (!this.active) return false;
    this.time = Math.max(0, this.time - dt);
    if (this.time > 0) return false;
    this.reset();
    return true;
  }
}

export class Adventure {
  constructor(scene, level) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const torus = new THREE.TorusGeometry(1.05, .065, 6, 40);
    const pieces = [torus.toNonIndexed()];
    torus.dispose();
    for (let j = 0; j < 3; j++) {
      const angle = j / 3 * Math.PI * 2;
      pieces.push(new THREE.OctahedronGeometry(.14).translate(Math.cos(angle) * 1.3, Math.sin(angle) * 1.3, 0));
    }
    // Torus and orbiting gems share one draw call per gate.
    const ringGeometry = mergeGeometries(pieces);
    pieces.forEach(geometry => geometry.dispose());
    this.trails = trailLayouts(level).map(layout => {
      const run = new TrailRun(layout.dirs.length);
      const rings = layout.dirs.map((dir, i) => {
        const group = new THREE.Group();
        const material = new THREE.MeshStandardMaterial({color: layout.color, emissive: layout.color, emissiveIntensity: .8, metalness: .45, roughness: .22});
        const ring = new THREE.Mesh(ringGeometry, material);
        group.add(ring);
        const next = layout.dirs[Math.min(i + 1, layout.dirs.length - 1)];
        const forward = tangentDir(next, dir) ?? tangentDir(layout.dirs[i - 1], dir)?.negate() ?? new THREE.Vector3(1, 0, 0);
        group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(dir, forward).normalize(), dir, forward));
        surfacePoint(layout.planet, dir, 1.4, group.position);
        this.group.add(group);
        return { group, ring, material, dir, pos: group.position.clone() };
      });
      return {...layout, run, rings, cooldown: 0};
    });
    this.aura = new THREE.Mesh(new THREE.TorusGeometry(1.25, .035, 6, 48), new THREE.MeshBasicMaterial({color: 0x87f9ed, transparent: true, opacity: .7, depthWrite: false}));
    this.aura.geometry.rotateX(Math.PI / 2);
    scene.add(this.aura);
    this.mid = new THREE.Vector3();
    this.reset();
  }
  reset() {
    this.magnet = 0;
    this.badges = new Set();
    this.trails.forEach(t => {t.run.reset(); t.cooldown = 0;});
  }
  update(dt, player, active, time) {
    this.group.visible = active;
    const events = [];
    this.magnet = Math.max(0, this.magnet - dt);
    this.mid.copy(player.body.pos).addScaledVector(player.body.up, 1.05);
    this.aura.visible = this.magnet > 0 && player.state === 'play';
    if (this.aura.visible) {
      this.aura.position.copy(player.body.pos).addScaledVector(player.body.up, .15);
      this.aura.quaternion.setFromUnitVectors(UP, player.body.up);
      this.aura.scale.setScalar(1.05 + Math.sin(time * 5) * .12);
      this.aura.material.opacity = Math.min(1, this.magnet) * .65;
    }
    if (!active) {
      for (const trail of this.trails) if (trail.run.active) trail.run.reset();
      return events;
    }
    for (const trail of this.trails) {
      trail.cooldown = Math.max(0, trail.cooldown - dt);
      if (trail.run.step(dt)) { trail.cooldown = 1.4; events.push({type: 'trailFail'}); }
      if (active && player.state === 'play' && !trail.cooldown && player.body.planet === trail.planet) {
        const next = trail.rings[trail.run.next];
        if (next && next.pos.distanceTo(this.mid) < 1.65) {
          const result = trail.run.enter(trail.run.next);
          events.push({type: result === 'complete' ? 'trailWin' : result === 'start' ? 'trailStart' : 'ring', pos: next.pos, color: trail.color, name: trail.name});
          if (result === 'complete') {
            this.magnet = MAGNET_TIME;
            this.badges.add(trail.id);
            trail.cooldown = 25;
          }
        }
      }
      if (trail.run.complete && trail.cooldown === 0) trail.run.reset();
      trail.rings.forEach((r, i) => {
        r.group.visible = !trail.run.complete && i >= trail.run.next;
        const target = i === trail.run.next;
        r.material.emissiveIntensity = target ? 1.15 + Math.sin(time * 3) * .25 : .12;
        r.group.scale.setScalar(target ? 1 + Math.sin(time * 2) * .045 : .76);
        r.ring.rotation.z = time * (target ? .45 : -.2);
      });
    }
    return events;
  }
  get activeTrail() { return this.trails.find(t => t.run.active); }
}
