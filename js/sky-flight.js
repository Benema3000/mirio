// A postal journey through connected air lanes. Miro’s drawing-derived pilot
// stays unchanged; the islands, recipients and sky toys are original scenery.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildBiplane } from './biplane-model.js';
import { buildMirio } from './mirio-model.js';
import { mulberry32 } from './world.js';
import { SkyPostScene } from './sky-post-scene.js';
import { SKY, balloonPosition, createSkyRun, makeSkyCourse, rescueSkyRun, seekSkyRun, skySnapshot, stepSkyRun } from './sky-flight-rules.js';

const Y = new THREE.Vector3(0, 1, 0);
const dummy = new THREE.Object3D(), matrix = new THREE.Matrix4(), tilt = new THREE.Quaternion();
const focus = new THREE.Vector3(), cameraPosition = new THREE.Vector3();
const PALETTE = [0xf29f83, 0xeac872, 0x91c9ce];

/** Forward is the direction of travel; right is screen-right from behind. */
export function skyFrame(s) {
  const center = new THREE.Vector3(18 * Math.sin(s / 160) + 6 * Math.sin(s / 61),
    24 + 8 * Math.sin(s / 210) + 3 * Math.cos(s / 82), -s);
  const forward = new THREE.Vector3(18 / 160 * Math.cos(s / 160) + 6 / 61 * Math.cos(s / 61),
    8 / 210 * Math.cos(s / 210) - 3 / 82 * Math.sin(s / 82), -1).normalize();
  const right = new THREE.Vector3().crossVectors(forward, Y).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return {center, forward, right, up};
}
function point(frame, x, y) { return frame.center.clone().addScaledVector(frame.right, x).addScaledVector(frame.up, y); }
function orient(object, frame) {
  matrix.makeBasis(frame.right.clone().negate(), frame.up, frame.forward);
  object.quaternion.setFromRotationMatrix(matrix);
}
function paint(geometry, color) {
  const tint = new THREE.Color(color), colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
function merged(parts) {
  const geometries = parts.map(part => {
    const geometry = part.index ? part.toNonIndexed() : part;
    for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'color'].includes(name)) geometry.deleteAttribute(name);
    return geometry;
  });
  const geometry = mergeGeometries(geometries);
  for (const g of new Set([...parts, ...geometries])) g.dispose();
  return geometry;
}
function ellipsoid(x, y, z, sx, sy, sz, color, detail = 12) {
  return paint(new THREE.SphereGeometry(1, detail, Math.max(6, detail / 2)).scale(sx, sy, sz).translate(x, y, z), color);
}
function rod(a, b, radius, color) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), d = to.clone().sub(from);
  return paint(new THREE.CylinderGeometry(radius, radius, d.length(), 6)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.normalize())).translate(...from.add(to).multiplyScalar(.5)), color);
}
function star(radius, depth, color) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = radius * (i % 2 ? .46 : 1);
    if (!i) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return paint(new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: true, bevelSize: .06,
    bevelThickness: .04, bevelSegments: 2, curveSegments: 1}).translate(0, 0, -depth / 2), color);
}
function makeRing() {
  const parts = [paint(new THREE.TorusGeometry(2.7, .10, 8, 48), 0xf1bd52),
    paint(new THREE.TorusGeometry(2.7, .033, 6, 48).translate(0, 0, .095), 0xfff6c5)];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    parts.push(paint(new THREE.OctahedronGeometry(.16).translate(Math.cos(a) * 2.7, Math.sin(a) * 2.7, 0), 0xffe69b));
  }
  return merged(parts);
}
function makeBalloon() {
  const sphere = new THREE.SphereGeometry(1, 24, 16).scale(1.7, 2.1, 1.7);
  const pos = sphere.attributes.position, colors = new Float32Array(pos.count * 3), color = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const angle = Math.atan2(pos.getZ(i), pos.getX(i));
    color.set(Math.cos(angle * 6) > .35 ? 0xfff0c7 : 0xffffff);
    color.toArray(colors, i * 3);
  }
  sphere.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const parts = [sphere, paint(new THREE.TorusGeometry(.40, .08, 6, 16).rotateX(Math.PI / 2).translate(0, -1.95, 0), 0xdaa564),
    paint(new THREE.CylinderGeometry(.52, .38, .52, 8).translate(0, -2.82, 0), 0xc69a6b)];
  for (const x of [-.36, .36]) for (const z of [-.36, .36]) parts.push(rod([x, -1.82, z], [x, -2.63, z], .028, 0xe4c895));
  return merged(parts);
}
function gateGeometry(finish = false) {
  const parts = [paint(new THREE.TorusGeometry(1, .023, 8, 80).scale(10.8, 7.2, 5), finish ? 0xf0bd57 : 0x80c7c0),
    paint(new THREE.TorusGeometry(1, .013, 6, 80).scale(11.15, 7.5, 5), 0xfff0c8)];
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * .19 + i / 10 * Math.PI * .62;
    const x = Math.cos(a) * 10.8, y = Math.sin(a) * 7.2;
    parts.push(paint(new THREE.ConeGeometry(.30, .75, 3).rotateX(Math.PI).translate(x, y - .42, 0), i % 2 ? 0xffdf89 : 0xeea492));
  }
  if (finish) {
    parts.push(star(1.25, .2, 0xffd06a).translate(0, 8.1, 0));
    for (let x = -9; x <= 9; x++) parts.push(paint(new THREE.BoxGeometry(.92, .65, .16).translate(x, 6.35, 0), x % 2 ? 0xfff5d7 : 0x438e91));
  }
  return merged(parts);
}

function buildScenery(scene) {
  const chunks = [], rng = mulberry32(884129);
  const cloudMaterial = new THREE.MeshLambertMaterial({vertexColors: true});
  const islandMaterial = new THREE.MeshPhongMaterial({vertexColors: true, shininess: 12, specular: 0x243e46});
  for (let s = -60; s < SKY.length + 260; s += 140) {
    const frame = skyFrame(s), group = new THREE.Group();
    group.position.copy(frame.center);
    // World-Y trees remain upright even as the flight lane rises and falls.
    const clouds = [], islands = [];
    for (let n = 0; n < 8; n++) {
      const side = n % 2 ? 1 : -1, x = side * (20 + rng() * 68), y = -13 - rng() * 23, z = (rng() - .5) * 155;
      const size = 3.8 + rng() * 7;
      for (let puff = 0; puff < 5; puff++) {
        clouds.push(ellipsoid(x + (rng() - .5) * size * 1.5, y + rng() * size * .35, z + (rng() - .5) * size,
          size * (.6 + rng() * .5), size * (.35 + rng() * .4), size * (.6 + rng() * .6), puff % 2 ? 0xe7f0ef : 0xf7f8ef));
      }
    }
    for (let n = 0; n < 2; n++) {
      const sign = n % 2 ? 1 : -1, x = sign * (20 + rng() * 17), y = -7 - rng() * 11, z = (rng() - .5) * 95;
      const radius = 5.5 + rng() * 4, biome = s / SKY.length;
      const grass = biome < .35 ? 0x77b998 : biome < .7 ? 0x95ba9b : 0xa9b59e;
      const rock = paint(new THREE.IcosahedronGeometry(1, 1).scale(radius, radius * .90, radius * .78)
        .rotateY(rng() * Math.PI).translate(x, y - radius * .48, z), 0x8b9eab);
      islands.push(rock, ellipsoid(x, y, z, radius, 1.4, radius * .82, grass, 16));
      islands.push(paint(new THREE.TorusGeometry(radius * .86, .28, 5, 28).rotateX(Math.PI / 2).scale(1, 1, .85).translate(x, y, z), 0xd7cd9a));
      // A tiny orchard, handbuilt flowers and stone paths give the islands scale.
      for (let tree = 0; tree < 4; tree++) {
        const tx = x + (rng() - .5) * radius, tz = z + (rng() - .5) * radius;
        islands.push(rod([tx, y + .8, tz], [tx, y + 3.4, tz], .16, 0x89745e));
        islands.push(ellipsoid(tx, y + 3.6, tz, 1.15, 1.65, 1.05, tree % 2 ? 0x5d9e89 : 0x87b386));
      }
      for (let flower = 0; flower < 10; flower++) {
        const angle = rng() * Math.PI * 2, radiusHere = rng() * radius * .8;
        islands.push(ellipsoid(x + Math.cos(angle) * radiusHere, y + 1.25, z + Math.sin(angle) * radiusHere * .8,
          .17, .18, .17, flower % 3 ? 0xffe7ad : 0xeab2bc, 6));
      }
      // Threadlike falls spill into the cloud sea; they are scenery, not hazards.
      if (n === 0) {
        islands.push(paint(new THREE.CylinderGeometry(.40, .20, 15, 8).translate(x + radius * .72, y - 7.5, z), 0x9edbdd));
        clouds.push(ellipsoid(x + radius * .72, y - 15, z, 2.1, 1.0, 1.7, 0xe6f6ed));
      }
    }
    const cloudMesh = new THREE.Mesh(merged(clouds), cloudMaterial), islandMesh = new THREE.Mesh(merged(islands), islandMaterial);
    cloudMesh.name = 'sky:cloud-bank'; islandMesh.name = 'sky:orchard-islands';
    group.add(cloudMesh, islandMesh);
    scene.add(group); chunks.push({s, group});
  }
  return chunks;
}

export class SkyFlight {
  constructor(art) {
    this.course = makeSkyCourse();
    this.scene = new THREE.Scene();
    this.scene.name = 'sky-flight';
    this.scene.background = new THREE.Color(0xbce1e6);
    this.scene.fog = new THREE.Fog(0xbce1e6, 160, 410);
    this.scene.add(new THREE.HemisphereLight(0xfff8e7, 0x748bba, 2.25));
    const sun = new THREE.DirectionalLight(0xffe5bb, 2.4);
    sun.position.set(-80, 120, 90); this.scene.add(sun);
    this.sun = sun;
    this.scene.add(sun.target);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: {
        high: {value: new THREE.Color(0x83b8de)}, low: {value: new THREE.Color(0xeaf1de)},
      }, vertexShader: 'varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 high; uniform vec3 low; varying vec3 vDirection; void main(){float h=clamp(normalize(vDirection).y*.8+.24,0.,1.); gl_FragColor=vec4(mix(low,high,smoothstep(0.,1.,h)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    }));
    this.sky.frustumCulled = false; this.sky.renderOrder = -10; this.scene.add(this.sky);
    this.scenery = buildScenery(this.scene);
    this.plane = buildBiplane(art);
    this.scene.add(this.plane.group);
    // Tests can construct the course without a DOM; production supplies the drawing.
    if (art?.images?.mirio) {
      this.pilot = buildMirio(art);
      const m = this.pilot;
      m.group.position.copy(this.plane.seat.position);
      m.legL.rotation.x = m.legR.rotation.x = -1.15;
      m.armL.rotation.x = m.armR.rotation.x = -.6;
      m.armL.rotation.z = m.armRestZ.L * .65;
      m.armR.rotation.z = m.armRestZ.R * .65;
      this.plane.group.add(m.group);
    }
    this.rings = new THREE.InstancedMesh(makeRing(), new THREE.MeshPhongMaterial({vertexColors: true, shininess: 85, specular: 0xffeb9a}), this.course.rings.length);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.rings.frustumCulled = false;
    this.rings.name = 'sky:golden-hoops'; this.scene.add(this.rings);
    this.balloons = new THREE.InstancedMesh(makeBalloon(), new THREE.MeshPhongMaterial({vertexColors: true, shininess: 28}), this.course.obstacles.length);
    this.balloons.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.balloons.frustumCulled = false;
    for (let i = 0; i < this.course.obstacles.length; i++) this.balloons.setColorAt(i, new THREE.Color(PALETTE[i % PALETTE.length]));
    this.balloons.name = 'sky:balloon-slalom'; this.scene.add(this.balloons);
    const gateMaterial = new THREE.MeshPhongMaterial({vertexColors: true, shininess: 35});
    this.gates = [...this.course.checkpoints, this.course.length].map((s, i) => {
      const gate = new THREE.Mesh(gateGeometry(i === this.course.checkpoints.length), gateMaterial);
      const frame = skyFrame(s); gate.position.copy(frame.center); orient(gate, frame);
      gate.name = i === this.course.checkpoints.length ? 'sky:finish' : `sky:checkpoint-${i + 1}`;
      this.scene.add(gate); return gate;
    });
    // Simple near-camera slipstream highlights avoid heavy transparent effects.
    this.streaks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.014, .028, 1, 4).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({color: 0xfff7df, transparent: true, opacity: .3, depthWrite: false}), 22);
    this.streaks.frustumCulled = false; this.streaks.name = 'sky:slipstream'; this.scene.add(this.streaks);
    this.postScene = new SkyPostScene(this.scene, this.plane.group, this.course, skyFrame);
    this.reset();
  }

  reset() {
    this.run = createSkyRun();
    this.visualTime = 0;
    this.bank = this.pitch = this.bumpFlash = 0;
    this.cameraReady = false;
    this.ringBursts = new Map();
    return this.snapshot();
  }
  step(dt, controls = {}) {
    const events = stepSkyRun(this.run, this.course, dt, controls);
    for (const event of events) {
      if (event.type === 'ring') this.ringBursts.set(event.id, this.run.elapsed);
      if (event.type === 'bump') this.bumpFlash = .3;
    }
    return events;
  }
  rescue() {
    const events = rescueSkyRun(this.run, this.course);
    this.cameraReady = false;
    return events;
  }
  seek(progress) { seekSkyRun(this.run, this.course, progress); this.cameraReady = false; }
  snapshot() { return skySnapshot(this.run, this.course); }
  layout() {
    return {length: this.course.length, width: SKY.width, height: SKY.height,
      deliveries: this.course.deliveries.map(d => ({...d})), routes: this.course.routes.map(r => ({...r})), chimes: this.course.chimes.map(c => ({...c})), airSections: this.course.airSections.map(a => ({...a})),
      rings: this.course.rings.map(r => ({...r})), obstacles: this.course.obstacles.map(o => ({...o})), checkpoints: [...this.course.checkpoints]};
  }

  render(camera, dt = 0, {reducedMotion = false} = {}) {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
    this.visualTime += dt;
    const r = this.run, frame = skyFrame(r.s), blend = 1 - Math.exp(-8 * dt);
    this.bank += ((reducedMotion ? 0 : r.vx / SKY.lateralSpeed * .45) - this.bank) * blend;
    this.pitch += ((reducedMotion ? 0 : -r.vy / SKY.verticalSpeed * .2) - this.pitch) * blend;
    const roll = !reducedMotion && r.roll > 0 ? (1 - r.roll / SKY.rollDuration) * Math.PI * 2 : 0;
    this.plane.group.position.copy(point(frame, r.x, r.y));
    orient(this.plane.group, frame);
    tilt.setFromEuler(new THREE.Euler(this.pitch, 0, this.bank + roll));
    this.plane.group.quaternion.multiply(tilt);
    this.plane.propeller.rotation.z += dt * (65 + r.speed * 2);
    this.bumpFlash = Math.max(0, this.bumpFlash - dt);
    this.plane.group.visible = !this.bumpFlash || Math.floor(this.bumpFlash * 28) % 2 === 0;
    const followDistance = 13.5 * Math.max(1, Math.min(1.9, .85 / Math.max(.2, camera.aspect)));
    const ahead = skyFrame(r.s + 45), behind = skyFrame(r.s - followDistance);
    cameraPosition.copy(point(behind, r.x * .28, 3.2 + r.y * .24));
    focus.copy(point(ahead, r.x * .24, r.y * .23));
    // The world stays upright; barrel rolls never rotate the camera.
    if (!this.cameraReady) { camera.position.copy(cameraPosition); this.cameraFocus = focus.clone(); this.cameraReady = true; }
    else { camera.position.lerp(cameraPosition, blend); this.cameraFocus.lerp(focus, blend); }
    camera.up.copy(Y); camera.lookAt(this.cameraFocus);
    const fov = (camera.aspect < .85 ? 73 : 62) + (!reducedMotion && r.boost > 0 ? 4 : 0);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    this.sky.position.copy(camera.position);
    this.sun.position.copy(frame.center).add(new THREE.Vector3(-80, 120, 90));
    this.sun.target.position.copy(frame.center);
    for (const chunk of this.scenery) chunk.group.visible = chunk.s > r.s - 180 && chunk.s < r.s + 430;
    for (let i = 0; i < this.course.rings.length; i++) {
      const ring = this.course.rings[i], f = skyFrame(ring.s);
      const burst = this.ringBursts.get(ring.id), age = burst === undefined ? 1 : r.elapsed - burst;
      const visible = ring.s > r.s - 8 && ring.s < r.s + 370 && (!r.collected.has(ring.id) || age < .3);
      dummy.position.copy(point(f, ring.x, ring.y)); orient(dummy, f);
      dummy.scale.setScalar(visible ? r.collected.has(ring.id) ? 1 + age * 3 : 1 : 0);
      dummy.updateMatrix(); this.rings.setMatrixAt(i, dummy.matrix);
    }
    this.rings.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.course.obstacles.length; i++) {
      const obstacle = this.course.obstacles[i], p = balloonPosition(obstacle, r.elapsed);
      dummy.position.copy(point(skyFrame(obstacle.s), p.x, p.y));
      dummy.rotation.set(0, this.visualTime * .06 + obstacle.phase, Math.sin(this.visualTime + obstacle.phase) * .04);
      dummy.scale.setScalar(obstacle.s > r.s - 25 && obstacle.s < r.s + 360 ? 1 : 0);
      dummy.updateMatrix(); this.balloons.setMatrixAt(i, dummy.matrix);
    }
    this.balloons.instanceMatrix.needsUpdate = true;
    this.streaks.visible = !reducedMotion && (r.boost > 0 || r.draft > 0);
    if (this.streaks.visible) for (let i = 0; i < this.streaks.count; i++) {
      const angle = i * 2.39996, distance = (this.visualTime * 65 + i * 7.7) % 55;
      dummy.position.copy(point(skyFrame(r.s + distance - 10), Math.cos(angle) * (5.5 + i % 4), Math.sin(angle) * (4 + i % 3)));
      orient(dummy, frame); dummy.scale.set(1, 1, 2 + r.speed * .06); dummy.updateMatrix(); this.streaks.setMatrixAt(i, dummy.matrix);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
    this.postScene.update(r, dt, {reducedMotion});
  }
}
