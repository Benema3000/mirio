// New meadow props only. Miro's drawings and drawing-derived models stay untouched.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {surfacePoint, tangentDir} from './world.js';
import {BOAT, MEADOW, createMeadowRun, meadowLayout, meadowSnapshot, stepMeadowRun} from './meadow-playground-rules.js';

const UP = new THREE.Vector3(0, 1, 0), EAST = new THREE.Vector3(1, 0, 0);
const WOOD = 0xb88a60, LEAF = 0x79b88a, CREAM = 0xffefc5, PINK = 0xee9bb8;
function paint(g, color) {
  const c = new THREE.Color(color), data = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < data.length; i += 3) c.toArray(data, i);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return g;
}
function ball(x, y, z, sx, sy, sz, c) {return paint(new THREE.SphereGeometry(1, 12, 8).scale(sx, sy, sz).translate(x, y, z), c);}
function box(x, y, z, sx, sy, sz, c) {return paint(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), c);}
function tube(x, y, z, r, h, c) {return paint(new THREE.CylinderGeometry(r, r, h, 12).translate(x, y, z), c);}
function ring(r, width, color) {return paint(new THREE.TorusGeometry(r, width, 6, 32), color);}
function combine(parts, material) {
  const flat = parts.map(g => g.index ? g.toNonIndexed() : g);
  const geometry = mergeGeometries(flat);
  for (const g of new Set([...parts, ...flat])) g.dispose();
  return new THREE.Mesh(geometry, material);
}
function flowerParts(radius, color) {
  const parts = [ball(0, .12, 0, radius * .42, .2, radius * .42, 0xffd574)];
  for (let i = 0; i < 8; i++) {const a = i * Math.PI / 4; parts.push(ball(Math.cos(a) * radius * .56, 0, Math.sin(a) * radius * .56, radius * .47, .16, radius * .47, color));}
  return parts;
}
function squirrel(material) {
  return combine([ball(0, .55, 0, .37, .48, .34, 0xc68b54), ball(0, .98, .16, .31, .28, .28, 0xe0aa6a),
    ball(-.19, 1.23, .14, .1, .22, .1, 0xc68b54), ball(.19, 1.23, .14, .1, .22, .1, 0xc68b54),
    ball(-.13, 1.01, .42, .055, .075, .04, 0x374454), ball(.13, 1.01, .42, .055, .075, .04, 0x374454),
    ball(0, .3, -.45, .26, .22, .36, 0xc68b54), ball(0, .83, -.61, .34, .55, .27, 0xe0aa6a),
    ball(0, .56, .29, .24, .35, .1, CREAM)], material);
}

export class MeadowPlayground {
  #layout; #run; #scene; #colliders; #material; #groups = []; #static = []; #dynamic = [];
  #wind; #rotor; #bridge = []; #boat; #kite; #kiteString; #beacons = []; #rope; #guide; #spring; #picnic; #flowers;
  #planePosition = null; #planeDirection = null; #walkerDir = null; #active = false; #basis = new THREE.Matrix4();
  constructor(scene, level, collidersOf) {
    this.#scene = scene; this.#layout = meadowLayout(level); this.#colliders = collidersOf(this.#layout.planet);
    this.#material = new THREE.MeshLambertMaterial({vertexColors: true});
    this.#buildWind(); this.#buildWater(); this.#buildKite(); this.#buildLookout();
    this.reset();
  }
  #place(object, point, heading = null) {
    object.position.copy(surfacePoint(this.#layout.planet, point.dir, point.height ?? 0));
    if (!heading) {object.quaternion.setFromUnitVectors(UP, point.dir); return;}
    const forward = tangentDir(heading, point.dir) ?? tangentDir(EAST, point.dir);
    const right = new THREE.Vector3().crossVectors(point.dir, forward).normalize();
    this.#basis.makeBasis(right, point.dir, forward); object.quaternion.setFromRotationMatrix(this.#basis);
  }
  #add(group, point, name) {
    this.#place(group, point); group.name = `meadow:${name}`;
    this.#scene.add(group); this.#groups.push({group, dir: point.dir, point: group.position.clone()}); return group;
  }
  #cylinder(point, radius, bottom, top, collection = this.#static) {
    const c = {kind: 'cyl', base: surfacePoint(this.#layout.planet, point.dir, bottom), axis: point.dir.clone(), radius, height: top - bottom};
    this.#colliders.push(c); collection.push(c); return c;
  }
  #buildWind() {
    const m = this.#material, layout = this.#layout;
    this.#wind = new THREE.Group();
    this.#wind.add(combine([tube(0, 1, 0, .5, 2, WOOD), ball(0, .2, 0, 1.35, .25, 1.35, LEAF), tube(0, 2.4, 0, .22, 1, WOOD)], m));
    this.#rotor = new THREE.Group();
    this.#rotor.add(combine([ball(0, 0, 0, .3, .3, .3, 0xffd474)], m));
    for (let i = 0; i < 5; i++) {
      const blade = combine([ball(0, 1.0, .05, .35, 1.05, .09, i % 2 ? CREAM : PINK)], m);
      blade.rotation.z = i * Math.PI * 2 / 5; this.#rotor.add(blade);
    }
    this.#rotor.position.set(0, 3, .2); this.#wind.add(this.#rotor);
    // A plane silhouette links the propeller toy to the parked biplane.
    this.#wind.add(combine([box(0, 5.45, 0, 2.2, .16, .16, 0xffe494), box(0, 5.45, 0, .24, .15, 1.6, 0xffe494), box(0, 5.45, -.55, 1, .13, .14, 0xffe494)], m));
    this.#add(this.#wind, {...layout.wind, height: 0}, 'wind-garden');
    this.#place(this.#wind, {...layout.wind, height: 0}, layout.kite.dir); this.#cylinder(layout.wind, .55, -.2, 2.1);
    this.#flowers = new THREE.Group();
    for (let i = 0; i < 9; i++) {const a = i * 2.4, f = combine(flowerParts(.5, i % 2 ? PINK : CREAM), m); f.position.set(Math.sin(a) * 2.2, .25, Math.cos(a) * 2.2); this.#flowers.add(f);}
    this.#wind.add(this.#flowers);
    const clearing = combine([paint(new THREE.TorusGeometry(2.6, .055, 5, 40).rotateX(Math.PI / 2), 0xffe39a), box(0, .02, 0, 1.4, .035, .14, 0xffe39a), box(-.65, .02, 0, .14, .035, 1.4, 0xffe39a), box(.65, .02, 0, .14, .035, 1.4, 0xffe39a)], m);
    this.#add(clearing, {...layout.clearing, height: .03}, 'landing-clearing');
  }
  #buildWater() {
    const m = this.#material, l = this.#layout;
    for (const point of l.bridge) {
      const group = this.#add(combine(flowerParts(point.radius, PINK), m), point, 'petal-bridge');
      group.quaternion.setFromUnitVectors(UP, l.bridgeFrame.dir);
      this.#bridge.push({group, point});
    }
    const dock = combine([box(0, .12, 0, 3.1, .24, 2.4, WOOD), tube(-1.4, .65, -1, .12, 1.2, CREAM), tube(1.4, .65, -1, .12, 1.2, CREAM)], m);
    this.#add(dock, {...l.dock, height: 0}, 'boat-dock'); this.#cylinder(l.dock, 1.4, -.2, .24);
    this.#boat = combine([ball(0, .24, 0, 1.1, .3, .64, 0xf1c571), box(0, .48, 0, 1.6, .16, .8, CREAM), tube(0, 1, 0, .065, 1.1, WOOD),
      paint(new THREE.ConeGeometry(.63, 1.1, 3).scale(1, 1, .08).translate(.25, 1.3, 0), 0xe898b8),
      ball(-.5, .83, 0, .25, .23, .24, 0x88c489), ball(-.61, 1, .14, .075, .08, .075, CREAM), ball(-.4, 1, .14, .075, .08, .075, CREAM)], m);
    this.#scene.add(this.#boat);
    const ropeGeometry = new THREE.BufferGeometry(); ropeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.#rope = new THREE.Line(ropeGeometry, new THREE.LineBasicMaterial({color: 0xffdf9c})); this.#rope.frustumCulled = false; this.#scene.add(this.#rope);
  }
  #buildKite() {
    const m = this.#material, l = this.#layout;
    const parts = [paint(new THREE.OctahedronGeometry(1.6).scale(.85, 1.3, .12), 0x83cbd0), box(0, -2.1, 0, .05, 1.2, .05, CREAM)];
    for (let i = 0; i < 4; i++) parts.push(paint(new THREE.OctahedronGeometry(.23).scale(1.6, .6, .2).translate(Math.sin(i) * .15, -2.7 - i * .55, 0), i % 2 ? PINK : 0xffd578));
    this.#kite = combine(parts, m); this.#scene.add(this.#kite);
    const string = new THREE.BufferGeometry(); string.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.#kiteString = new THREE.Line(string, new THREE.LineBasicMaterial({color: CREAM})); this.#kiteString.frustumCulled = false; this.#scene.add(this.#kiteString);
    for (const [i, beacon] of l.beacons.entries()) {
      const group = new THREE.Group(); group.add(combine([ring(2.35, .09, [0xffd478, 0x91ced1, PINK][i])], m));
      const marker = combine([paint(new THREE.OctahedronGeometry(.55).scale(.7, 1, .15).translate(0, 3, 0), 0x83cbd0)], m); group.add(marker);
      this.#add(group, beacon, `kite-beacon-${i}`); this.#place(group, beacon, l.kite.dir); this.#beacons.push(group);
    }
  }
  #buildLookout() {
    const m = this.#material, l = this.#layout;
    for (const point of l.steps) {
      const group = combine([tube(0, -point.height / 2, 0, point.radius * .75, point.height, WOOD), ...flowerParts(point.radius, LEAF)], m);
      this.#add(group, point, 'orchard-step'); this.#cylinder(point, point.radius, -.2, point.height + .12);
    }
    const house = new THREE.Group();
    house.add(combine([tube(0, -1.8, 0, .6, 3.6, WOOD), tube(0, -.15, 0, l.lookout.radius, .3, 0xe6c48b),
      box(0, 1.1, -1.4, 2.3, 2.2, .15, 0x82b597), box(-1.1, 1.1, -.5, .15, 2.2, 1.8, 0x82b597), box(1.1, 1.1, -.5, .15, 2.2, 1.8, 0x82b597),
      paint(new THREE.ConeGeometry(2, 1.4, 4).rotateY(Math.PI / 4).translate(0, 2.65, -.4), 0xedb789)], m));
    this.#add(house, l.lookout, 'orchard-lookout'); this.#cylinder(l.lookout, l.lookout.radius, l.lookout.height - .3, l.lookout.height);
    const crowns = [];
    for (const x of [-3.5, 3.5]) {
      crowns.push(tube(x, -1, -2, .23, 5, WOOD), ball(x, 2, -2, 2.1, 1.8, 1.8, LEAF));
      for (let i = 0; i < 6; i++) crowns.push(ball(x + Math.sin(i * 2) * 1.5, 1.7 + Math.cos(i * 2) * .8, -1, .23, .25, .23, 0xf1ae73));
    }
    house.add(combine(crowns, m));
    this.#guide = squirrel(m); this.#scene.add(this.#guide);
    this.#spring = this.#add(combine(flowerParts(1.1, 0xffd876), m), l.spring, 'squirrel-spring');
    const arrow = combine([box(0, .28, -.12, .15, .04, .7, WOOD),
      paint(new THREE.ConeGeometry(.32, .38, 3).rotateX(Math.PI / 2).translate(0, .28, .4), WOOD)], m);
    this.#spring.add(arrow); this.#place(this.#spring, l.spring, l.springLanding.dir);
    this.#add(combine(flowerParts(1.6, 0xffd876), m), l.springLanding, 'spring-landing');
    this.#picnic = new THREE.Group(); this.#picnic.add(combine([box(0, .02, 1.25, 2.8, .04, 1.5, 0xeaaaad), ball(0, .23, 1.25, .6, .18, .5, CREAM), ball(0, .5, 1.25, .18, .27, .18, 0x96c8cc)], m));
    for (const x of [-1, 1]) {const guest = squirrel(m); guest.position.set(x, 0, 1.1); guest.scale.setScalar(.65); this.#picnic.add(guest);}
    this.#picnic.position.x = -.5; house.add(this.#picnic);
  }
  reset() {
    for (const collider of this.#dynamic) {const i = this.#colliders.indexOf(collider); if (i >= 0) this.#colliders.splice(i, 1);}
    this.#dynamic = []; this.#run = createMeadowRun(this.#layout);
    this.#planePosition = this.#planeDirection = null;
    for (const {group} of this.#bridge) group.scale.set(.18, .15, .18);
    this.#spring.visible = this.#picnic.visible = this.#rope.visible = false;
  }
  step(dt, player, biplane, {active = true} = {}) {
    this.#active = active;
    if (!active) return [];
    const l = this.#layout, body = player.body, plane = biplane.flight;
    const flying = biplane.mounted && plane.planet === l.planet;
    this.#planePosition = flying ? plane.pos.clone() : null;
    this.#planeDirection = flying ? plane.up.clone() : null;
    this.#walkerDir = body.planet === l.planet ? body.up.clone() : null;
    const input = {flying, planeDir: plane.up, planeAltitude: plane.altitude, planeSpeed: plane.speed, boost: plane.boost, planeDistance: biplane.distance,
      walking: player.state === 'play' && body.planet === l.planet && !biplane.mounted,
      playerDir: body.up, playerHeight: body.pos.distanceTo(l.planet.center) - l.planet.radius, grounded: body.onGround};
    const events = stepMeadowRun(this.#run, l, dt, input);
    for (const event of events) {
      if (event.type === 'meadowWind') {
        // One shared tangent deck avoids seams between differently tilted petals.
        const forward = tangentDir(l.bridge[0].dir, l.bridgeFrame.dir);
        const collider = {kind: 'box', base: surfacePoint(l.planet, l.bridgeFrame.dir, MEADOW.bridgeHeight - .3), axis: l.bridgeFrame.dir.clone(),
          forward, right: new THREE.Vector3().crossVectors(forward, l.bridgeFrame.dir).normalize(), halfW: 1.6, halfD: 6.8, height: .3};
        this.#colliders.push(collider); this.#dynamic.push(collider);
      }
      if (event.type === 'meadowBoat') this.#cylinder(l.dock, 1.05, .24, .78, this.#dynamic);
      if (event.type === 'meadowSpring') player.bounce({speed: MEADOW.springSpeed, gravityScale: MEADOW.springGravity,
        direction: l.springLanding.dir, horizontalSpeed: MEADOW.springTravelSpeed});
      event.pos = surfacePoint(l.planet, event.type === 'meadowBoat' ? l.dock.dir : event.type.startsWith('meadowKite') ? l.kite.dir : l.wind.dir, 1);
      event.color = event.type === 'meadowWind' ? LEAF : PINK;
    }
    return events;
  }
  update(time, camera, {reducedMotion = false} = {}) {
    const r = this.#run, l = this.#layout;
    const cameraDir = camera.position.clone().sub(l.planet.center).normalize();
    for (const item of this.#groups) item.group.visible = camera.position.distanceToSquared(item.point) < 85 ** 2 && cameraDir.dot(item.dir) > -.25;
    this.#rotor.rotation.z = reducedMotion ? r.windCharge : time * (r.windPowered ? 3 : .12) + r.windCharge * 2;
    this.#flowers.scale.setScalar(r.windPowered ? 1 : .32);
    for (const {group} of this.#bridge) group.scale.set(r.windPowered ? 1 : .18, r.windPowered ? 1 : .15, r.windPowered ? 1 : .18);
    const boatPoint = {dir: r.boatDir, height: r.boat === BOAT.DOCKED ? .38 : .12 + (reducedMotion ? 0 : Math.sin(time * 2) * .055)};
    this.#place(this.#boat, boatPoint); this.#boat.visible = cameraDir.dot(r.boatDir) > -.25;
    this.#rope.visible = r.boat === BOAT.TOWED && this.#planePosition !== null && this.#active;
    if (this.#rope.visible) {
      const positions = this.#rope.geometry.attributes.position;
      const end = surfacePoint(l.planet, r.boatDir, .8), middle = this.#planePosition.clone().lerp(end, .5);
      for (const [i, p] of [this.#planePosition, middle, end].entries()) positions.setXYZ(i, p.x, p.y, p.z);
      positions.needsUpdate = true;
    }
    const kitePoint = r.kiteFlying ? {dir: l.lookout.dir, height: 10.5} : r.kiteStage >= 0 && this.#planeDirection ? {dir: this.#planeDirection, height: 7} : l.kite;
    this.#place(this.#kite, kitePoint); this.#kite.visible = cameraDir.dot(kitePoint.dir) > -.25;
    this.#kite.rotation.z += reducedMotion ? 0 : Math.sin(time * 1.8) * .09;
    this.#kiteString.visible = this.#kite.visible;
    const anchor = r.kiteFlying ? surfacePoint(l.planet, l.lookout.dir, l.lookout.height + .3) : this.#planePosition && r.kiteStage >= 0 ? this.#planePosition : surfacePoint(l.planet, l.kite.dir, .2);
    const stringPositions = this.#kiteString.geometry.attributes.position;
    stringPositions.setXYZ(0, anchor.x, anchor.y, anchor.z); stringPositions.setXYZ(1, this.#kite.position.x, this.#kite.position.y, this.#kite.position.z); stringPositions.needsUpdate = true;
    for (const [i, beacon] of this.#beacons.entries()) {beacon.scale.setScalar(i < r.kiteStage ? .5 : 1); beacon.visible &&= !r.kiteFlying;}
    this.#place(this.#guide, {dir: r.guideDir, height: r.guideHeight + (reducedMotion || r.springOpen ? 0 : Math.abs(Math.sin(time * 4)) * .16)}, l.guide[Math.min(r.guideStage + 1, l.guide.length - 1)].dir);
    this.#guide.visible = cameraDir.dot(r.guideDir) > -.25;
    this.#spring.visible &&= r.springOpen;
    this.#picnic.visible = r.celebration;
  }
  snapshot() {
    const r = this.#run, l = this.#layout;
    let task;
    if (!r.windPowered) task = {id: 'wind', label: '✣ Windrad: nah vorbeifliegen + Turbo', point: l.wind};
    else if (!this.#planePosition && (!r.springOpen || !r.lookout)) {
      task = this.#walkerDir?.y > Math.sin(57 * Math.PI / 180)
        ? {id: 'bridge', label: '❀ Auf die Blütenbrücke springen', point: l.bridge[0]}
        : {id: 'walk', label: '❀ Folge dem Eichhörnchen', point: l.guide[Math.min(r.guideStage, l.guide.length - 1)]};
    }
    else if (r.boat === BOAT.TOWED) task = {id: 'dock', label: '⚓ Bring das Boot zum Steg', point: l.dock};
    else if (r.boat !== BOAT.DOCKED) task = {id: 'boat', label: '⚓ Tief über das Boot fliegen', point: {...l.boat, dir: r.boatDir}};
    else if (r.kiteStage < 0) task = {id: 'kite', label: '◇ Drachen abholen', point: l.kite};
    else if (!r.kiteFlying) task = {id: 'kite-route', label: '◇ Steigen · durch die Drachenringe', point: l.beacons[Math.min(r.kiteStage, l.beacons.length - 1)]};
    else if (!r.springOpen || !r.lookout) {
      if (this.#planePosition) task = {id: 'land', label: '❀ Landen · über die Blütenbrücke', point: l.clearing};
      else if (this.#walkerDir?.y > Math.sin(57 * Math.PI / 180)) task = {id: 'bridge', label: '❀ Auf die Blütenbrücke springen', point: l.bridge[0]};
      else task = {id: 'walk', label: '❀ Folge dem Eichhörnchen', point: l.guide[Math.min(r.guideStage, l.guide.length - 1)]};
    }
    else task = {id: 'picnic', label: '❀ Ein Picknick im Baumhaus!', point: l.lookout};
    return {...meadowSnapshot(r), task: {id: task.id, label: task.label, dir: task.point.dir.toArray(), height: task.point.height ?? 0}};
  }
  layout() {
    const serialize = p => ({dir: p.dir.toArray(), height: p.height ?? 0, ...(p.radius ? {radius: p.radius} : {})});
    return {planet: this.#layout.planet.id,
      wind: serialize(this.#layout.wind), dock: serialize(this.#layout.dock), boat: serialize(this.#layout.boat), kite: serialize(this.#layout.kite),
      beacons: this.#layout.beacons.map(serialize), bridge: this.#layout.bridge.map(serialize), lookout: serialize(this.#layout.lookout),
      guide: this.#layout.guide.map(serialize), spring: serialize(this.#layout.spring), springLanding: serialize(this.#layout.springLanding), clearing: serialize(this.#layout.clearing)};
  }
}
