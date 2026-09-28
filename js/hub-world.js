// Sternenhof reuses adventure movement. Only its destinations and safe boundary are new.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {canvasTexture} from './art.js';
import {CameraRig} from './camera.js';
import {Player} from './player.js';
import {buildRocket} from './props.js';
import {surfacePoint} from './world.js';
import {HUB, HUB_PORTALS, HUB_STONES, HUB_STONE_RADIUS, createHubVisit, hubBoundary, hubChorusReady, hubSouvenir, hubSpawn, stepHubVisit} from './hub-rules.js';

const UP = new THREE.Vector3(0, 1, 0), FORWARD = new THREE.Vector3(0, 0, -1);
const CREAM = 0xfff0ce, LEAF = 0x8bc8a2, GOLD = 0xf5c864, INK = 0x435a65;
const PHYSICS_STEP = 1 / 120, MAX_FRAME = .05;
// Inside the ring of gates (hub-rules.js), whatever the screen's shape.
const CAMERA_DISTANCE = 8;
const NOTE_COLORS = [0xef9ead, 0x9ccfa5, 0x91cbdc];
const groundY = (x, z) => Math.sqrt(Math.max(0, HUB.radius ** 2 - x * x - z * z)) - HUB.radius;
const point = (x, z, height = 0) => new THREE.Vector3(x, groundY(x, z) + height, z);
const upAt = (x, z) => new THREE.Vector3(x, groundY(x, z) + HUB.radius, z).normalize();

function paint(geometry, color) {
  const c = new THREE.Color(color), values = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < values.length; i += 3) c.toArray(values, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}
function ball(x, y, z, sx, sy, sz, color) {
  return paint(new THREE.SphereGeometry(1, 12, 8).scale(sx, sy, sz).translate(x, y, z), color);
}
function box(x, y, z, sx, sy, sz, color) {
  return paint(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), color);
}
function rod(x, y, z, radius, height, color) {
  return paint(new THREE.CylinderGeometry(radius, radius, height, 10).translate(x, y, z), color);
}
function merge(parts, material) {
  const flat = parts.map(g => g.index ? g.toNonIndexed() : g);
  const mesh = new THREE.Mesh(mergeGeometries(flat), material);
  for (const g of new Set([...parts, ...flat])) g.dispose();
  return mesh;
}
function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? .24 : .54;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    if (i) shape.lineTo(x, y); else shape.moveTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {depth: .13, bevelEnabled: false});
}
function label(text, color = '#2f4650', width = 1024) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff5dd'; ctx.strokeStyle = '#2f4650'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.roundRect(8, 14, width - 16, 172, 60); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 112px sans-serif';
  ctx.fillText(text, width / 2, 104, width - 80);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: canvasTexture(canvas), depthWrite: false}));
  sprite.scale.set(7, 1.37, 1);
  return sprite;
}

export class HubWorld {
  scene; #player; #rig = null;
  #planet; #colliders = []; #visit; #portals = []; #flower; #petals = []; #birds = [];
  #souvenirs = [];
  #rotor; #elapsed = 0; #snapCamera = true; #facing = FORWARD.clone(); #completed = [];

  constructor(art) {
    this.scene = new THREE.Scene();
    this.scene.name = 'sternenhof';
    this.scene.background = new THREE.Color(0xc9e6e8);
    this.scene.fog = new THREE.Fog(0xc9e6e8, 65, 130);
    this.scene.add(new THREE.HemisphereLight(0xfff5dc, 0x719eae, 2.3));
    const sun = new THREE.DirectionalLight(0xfff0d2, 2.5); sun.position.set(-15, 25, 18); this.scene.add(sun);
    this.#planet = {id: 'sternenhof', center: new THREE.Vector3(0, -HUB.radius, 0), radius: HUB.radius, gravityRadius: 220, gravity: 38};
    const material = new THREE.MeshLambertMaterial({vertexColors: true});
    this.#buildIsland(material);
    for (const portal of HUB_PORTALS) {
      this.#buildPortal(portal, material, art);
      this.#buildSouvenir(portal, material);
    }
    this.#buildFlower(material);
    this.#player = new Player(this.scene, art, [this.#planet], () => this.#colliders);
    this.reset();
  }

  #anchor(group, x, z) {
    group.position.copy(point(x, z));
    const up = upAt(x, z), outward = new THREE.Vector3(x, 0, z - HUB.spawn.z).normalize();
    const forward = outward.addScaledVector(up, -outward.dot(up)).normalize().negate();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
    this.scene.add(group);
    return group;
  }

  #buildIsland(material) {
    const ground = new THREE.Mesh(new THREE.SphereGeometry(HUB.radius, 80, 12, 0, Math.PI * 2, 0, Math.asin(22 / HUB.radius)),
      new THREE.MeshLambertMaterial({color: 0xadd3a8}));
    ground.position.copy(this.#planet.center); this.scene.add(ground);
    const parts = [];
    // Dotted paths keep every destination visible from spawn.
    for (const portal of HUB_PORTALS) {
      for (let i = 0; i < 11; i++) {
        const t = i / 11, x = portal.x * t, z = HUB.spawn.z + (portal.z - HUB.spawn.z) * t;
        parts.push(ball(x, groundY(x, z) + .02, z, .64, .065, .48, i % 3 ? CREAM : portal.color));
      }
    }
    for (let i = 0; i < 72; i++) {
      const a = i * Math.PI / 36, x = Math.cos(a) * 20.1, z = Math.sin(a) * 20.1;
      const y = groundY(x, z);
      parts.push(ball(x, y + .25, z, .65, .42, .65, i % 2 ? LEAF : 0x93bd94));
      if (i % 3 === 0) parts.push(ball(x, y + .7, z, .21, .18, .21, i % 2 ? CREAM : 0xe8acc6));
    }
    for (let i = 0; i < 15; i++) {
      const a = i * 2.4, r = 23 + i % 3 * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
      parts.push(ball(x, -7 - i % 3, z, 3.4, 1.5, 3.6, i % 2 ? 0xeaf3eb : 0xe0eeeb));
    }
    // The optional jump chain sits behind spawn, clear of every portal path.
    for (const {x, z, height} of HUB_STONES) {
      const up = upAt(x, z), base = point(x, z), top = base.clone().addScaledVector(up, height);
      const stone = paint(new THREE.CylinderGeometry(HUB_STONE_RADIUS, 1.2, height, 12).translate(0, height / 2, 0), CREAM);
      stone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, up)).translate(...base);
      parts.push(stone);
      this.#colliders.push({kind: 'cyl', base, axis: up, height, radius: HUB_STONE_RADIUS});
      parts.push(ball(top.x, top.y + .05, top.z, .72, .08, .72, 0xa4ced0));
    }
    this.scene.add(merge(parts, material));
  }

  #buildPortal(spec, material, art) {
    const group = this.#anchor(new THREE.Group(), spec.x, spec.z), parts = [];
    parts.push(rod(-1.9, 1.65, 0, .27, 3.3, CREAM), rod(1.9, 1.65, 0, .27, 3.3, CREAM));
    parts.push(paint(new THREE.TorusGeometry(1.9, .27, 8, 32, Math.PI).translate(0, 3.3, 0), spec.color));
    parts.push(ball(-1.9, .12, 0, .65, .2, .65, spec.color), ball(1.9, .12, 0, .65, .2, .65, spec.color));
    if (spec.level === 'kart') {
      for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) parts.push(box(-1.75 + i * .5, 4.2 + j * .5, .1, .5, .5, .2, (i + j) % 2 ? INK : CREAM));
      for (const side of [-1, 1]) {
        parts.push(box(side * 2.6, .7, .15, .85, .3, 1.35, spec.color));
        for (const z of [-.36, .56]) parts.push(ball(side * 2.6, .4, z, .5, .4, .18, INK));
      }
    }
    if (spec.level === 'sky') {
      parts.push(box(0, 4.5, .18, 2.5, 1.5, .35, CREAM));
      const flap = paint(new THREE.ConeGeometry(1.2, .9, 3).rotateZ(Math.PI).scale(1, 1, .1).translate(0, 4.35, .42), spec.color);
      parts.push(flap, box(-2.75, .6, .2, 1.05, .9, .8, 0xd4ad83), box(2.7, .7, 0, 1.2, 1.3, 1, CREAM));
    }
    if (spec.level === 'ribbon') {
      for (let i = 0; i < 7; i++) {const a = i * Math.PI * 2 / 7; parts.push(ball(Math.cos(a), 4.4 + Math.sin(a), .15, .54, .5, .18, spec.color));}
      parts.push(ball(0, 4.4, .35, .58, .58, .16, GOLD));
      for (const side of [-1, 1]) parts.push(rod(side * 2.65, .7, .1, .1, 1.4, LEAF), ball(side * 2.65, 1.5, .1, .7, .5, .6, spec.color));
    }
    if (spec.level === 'marble') {
      parts.push(ball(0, 4.5, .18, 1.05, 1.05, .75, GOLD));
      for (const [i, color] of NOTE_COLORS.entries()) {
        const x = (i - 1) * .57;
        parts.push(ball(x, 4.15 + i * .23, 1, .19, .15, .09, color), rod(x + .14, 4.52 + i * .23, 1, .05, .7, color));
      }
      parts.push(box(-2.65, .45, .2, 1.1, .35, .9, NOTE_COLORS[0]), box(2.65, .45, .2, 1.1, .35, .9, NOTE_COLORS[2]));
    }
    if (spec.level === 'tilt') {
      // An open bubble rim keeps the seesaw readable through the landmark.
      parts.push(paint(new THREE.TorusGeometry(.92, .12, 7, 28).translate(.15, 4.7, .25), spec.color));
      parts.push(paint(new THREE.TorusGeometry(.78, .065, 6, 18, Math.PI * .65).rotateZ(.4).translate(.15, 4.7, .33), CREAM));
      parts.push(paint(new THREE.BoxGeometry(2.5, .17, .35).rotateZ(.16).translate(0, 3.8, .25), 0xe9a7c3));
      parts.push(paint(new THREE.ConeGeometry(.3, .5, 3).translate(0, 3.5, .25), GOLD));
      parts.push(ball(-.3, 5.1, .38, .13, .2, .07, CREAM), ball(2.5, 1.25, .1, .42, .42, .42, spec.color));
    }
    if (spec.level === 'adventure') {
      const rocket = buildRocket(art); rocket.group.scale.setScalar(.28); rocket.group.position.set(-2.8, .05, .3); rocket.flame.visible = false;
      group.add(rocket.group);
      parts.push(rod(2.65, 1.1, 0, .12, 2.2, INK));
      this.#rotor = new THREE.Group(); this.#rotor.position.set(2.65, 2.55, .2);
      const blades = [];
      for (let i = 0; i < 5; i++) blades.push(paint(new THREE.SphereGeometry(1, 10, 6).scale(.22, .7, .09).translate(0, .6, 0).rotateZ(i * Math.PI * 2 / 5), i % 2 ? CREAM : spec.color));
      this.#rotor.add(merge(blades, material)); group.add(this.#rotor);
      parts.push(ball(0, 4.5, .2, 1.05, 1.05, .23, 0x98c69e));
      parts.push(paint(new THREE.TorusGeometry(1.3, .12, 6, 28).scale(1, .32, 1).rotateZ(-.3).translate(0, 4.5, .35), CREAM));
    }
    group.add(merge(parts, material));
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.65, 32), new THREE.MeshBasicMaterial({color: spec.color, transparent: true, opacity: .24, side: THREE.DoubleSide, depthWrite: false}));
    glow.scale.y = 1.34; glow.position.set(0, 2.15, -.15); group.add(glow);
    const sign = label(spec.label); sign.position.set(0, 6.1, 0); group.add(sign);
    const medal = new THREE.Mesh(starGeometry(), new THREE.MeshLambertMaterial({color: GOLD}));
    medal.position.set(2.2, 5.25, .2); group.add(medal);
    this.#portals.push({spec, group, glow, medal});
  }

  #buildSouvenir(spec, material) {
    const {x, z} = hubSouvenir(spec.level), group = this.#anchor(new THREE.Group(), x, z), parts = [];
    parts.push(rod(0, .1, 0, .72, .16, CREAM));
    if (spec.level === 'adventure') {
      parts.push(paint(new THREE.OctahedronGeometry(.7).scale(.8, 1.25, .15).translate(0, 1.8, 0), spec.color));
      parts.push(rod(0, .9, 0, .025, 1.2, INK));
      for (let i = 0; i < 3; i++) parts.push(ball(i % 2 ? -.18 : .18, .4 + i * .25, 0, .2, .09, .05, i % 2 ? GOLD : LEAF));
    }
    if (spec.level === 'sky') {
      parts.push(box(0, 1.9, 0, 1.35, .15, .2, CREAM));
      for (let i = 0; i < 3; i++) parts.push(rod((i - 1) * .45, 1.15 + i * .12, 0, .085, 1.2 - i * .24, i % 2 ? GOLD : spec.color));
    }
    if (spec.level === 'ribbon') {
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * .45, y = 1.05 + (i % 2) * .4;
        parts.push(rod(x, y / 2, 0, .045, y, LEAF), ball(x, y, 0, .3, .36, .3, spec.color), ball(x, y, .23, .15, .2, .13, GOLD));
      }
    }
    if (spec.level === 'kart') {
      parts.push(rod(0, .85, 0, .055, 1.5, CREAM));
      for (let i = 0; i < 4; i++) parts.push(paint(new THREE.SphereGeometry(1, 10, 6).scale(.2, .53, .08).translate(0, .4, 0).rotateZ(i * Math.PI / 2).translate(0, 1.7, 0), i % 2 ? CREAM : spec.color));
      parts.push(ball(0, 1.7, .13, .16, .16, .1, GOLD));
    }
    if (spec.level === 'marble') {
      for (const [i, color] of NOTE_COLORS.entries()) {
        const x = (i - 1) * .53, y = .55 + i * .22;
        parts.push(ball(x, y, 0, .24, .17, .14, color), rod(x + .18, y + .45, 0, .045, .9, color));
      }
    }
    if (spec.level === 'tilt') {
      parts.push(paint(new THREE.TorusGeometry(.58, .075, 6, 24).translate(.18, 1.55, 0), spec.color));
      parts.push(paint(new THREE.TorusGeometry(.46, .045, 5, 12, Math.PI * .7).rotateZ(.4).translate(.18, 1.55, .05), CREAM));
      parts.push(paint(new THREE.BoxGeometry(1.6, .12, .25).rotateZ(.16).translate(0, .8, 0), 0xe9a7c3));
      parts.push(paint(new THREE.ConeGeometry(.22, .4, 3).translate(0, .55, 0), GOLD));
    }
    const toy = merge(parts, material); group.add(toy);
    const sign = label('↻ ♪', '#967c45', 256); sign.position.set(0, 2.65, 0); sign.scale.set(1.6, .65, 1); group.add(sign);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.85, .055, 5, 28), new THREE.MeshBasicMaterial({color: GOLD}));
    halo.rotation.x = Math.PI / 2; halo.position.y = .18; group.add(halo);

    // Heard souvenirs light a route back to the flower, without adding barriers.
    const lights = [];
    for (let i = 0; i < 8; i++) {
      const t = (i + 1) / 9, lx = x + (HUB.toy.x - x) * t, lz = z + (HUB.toy.z - z) * t;
      lights.push(ball(lx, groundY(lx, lz) + .13, lz, .16, .1, .16, spec.color));
    }
    const path = merge(lights, new THREE.MeshBasicMaterial({vertexColors: true})); this.scene.add(path);
    this.#souvenirs.push({level: spec.level, group, toy, halo, path});
  }

  #buildFlower(material) {
    this.#flower = this.#anchor(new THREE.Group(), HUB.toy.x, HUB.toy.z);
    this.#flower.add(merge([ball(0, .18, 0, .85, .26, .85, GOLD), ball(-.24, .38, .35, .075, .05, .1, INK), ball(.24, .38, .35, .075, .05, .1, INK)], material));
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, petal = merge([ball(0, 0, 0, .85, .12, .42, i % 2 ? CREAM : 0xf0afc6)], material);
      petal.position.set(Math.cos(a) * 1.1, .1, Math.sin(a) * 1.1); petal.rotation.y = -a;
      this.#flower.add(petal); this.#petals.push(petal);
    }
    const sign = label('↻ ↓ ♪', '#967c45', 384); sign.position.set(0, .85, 0); sign.scale.set(2, .65, 1); this.#flower.add(sign);
    for (let i = 0; i < HUB_PORTALS.length; i++) {
      const bird = merge([ball(0, 0, 0, .28, .22, .34, HUB_PORTALS[i].color), ball(-.37, .06, 0, .36, .07, .16, CREAM), ball(.37, .06, 0, .36, .07, .16, CREAM), ball(0, .02, .3, .09, .07, .16, GOLD)], material);
      this.scene.add(bird); this.#birds.push(bird);
    }
  }

  reset({completed = [], lastLevel = null} = {}) {
    this.#visit = createHubVisit({completed, lastLevel}); this.#completed = [...this.#visit.completed]; this.#elapsed = 0;
    const spawn = hubSpawn(lastLevel), dir = upAt(spawn.x, spawn.z);
    this.#facing.copy(lastLevel ? point(HUB.spawn.x, HUB.spawn.z).sub(point(spawn.x, spawn.z)) : FORWARD);
    this.#player.reset({planet: this.#planet, dir}, this.#facing);
    this.#player.events.length = 0;
    this.#snapCamera = true;
    for (const portal of this.#portals) portal.medal.visible = this.#visit.completed.has(portal.spec.level);
    for (const souvenir of this.#souvenirs) {
      souvenir.group.visible = this.#visit.completed.has(souvenir.level);
      souvenir.halo.visible = souvenir.path.visible = false;
    }
    return this.snapshot();
  }

  clearIntent() {
    this.#player.jumpBuffer = 0; this.#player.jumpHeld = false;
    this.#player.spinRequest = this.#player.poundRequest = false;
    this.#player.wishSpeed = 0;
  }

  #prepareCamera(camera) {
    if (!this.#rig) this.#rig = new CameraRig(camera, [this.#planet]);
    this.#rig.distance = CAMERA_DISTANCE;
    if (!this.#snapCamera) return;
    this.#rig.pitch = .42; this.#rig.snap(this.#player, this.#facing); this.#snapCamera = false;
  }

  #containPlayer() {
    const b = this.#player.body, height = b.pos.distanceTo(this.#planet.center) - HUB.radius;
    const edge = hubBoundary(b.pos.x, b.pos.z);
    if (!edge) return;
    const dir = upAt(edge.x, edge.z);
    surfacePoint(this.#planet, dir, Math.max(0, height), b.pos); b.up.copy(dir);
    const outward = new THREE.Vector3(edge.nx, 0, edge.nz);
    outward.addScaledVector(dir, -outward.dot(dir)).normalize();
    const speed = b.vel.dot(outward);
    if (speed > 0) b.vel.addScaledVector(outward, -speed);
  }

  update(dt, input, camera, {reducedMotion = false} = {}) {
    dt = Math.min(MAX_FRAME, Math.max(0, dt));
    this.#prepareCamera(camera);
    this.#player.readInput(input, this.#rig); input.consumeRide();
    const steps = Math.max(1, Math.ceil(dt / PHYSICS_STEP)), h = dt / steps;
    for (let i = 0; i < steps; i++) {this.#player.step(h); this.#containPlayer();}
    this.#elapsed += dt;
    const events = this.#player.events.splice(0), body = this.#player.body;
    const height = body.pos.distanceTo(this.#planet.center) - HUB.radius;
    const actions = stepHubVisit(this.#visit, dt, {x: body.pos.x, z: body.pos.z, height, grounded: body.onGround,
      pound: events.some(e => e.type === 'pound'), spin: events.some(e => e.type === 'spin')});
    for (const action of actions) {
      if (action.type !== 'spring') continue;
      this.#player.bounce({speed: HUB.springSpeed, gravityScale: .8});
      // Friendly hub toys have no damage blink.
      this.#player.invulnerable = 0;
    }
    // Quiet mode keeps camera turns under the player’s control.
    if (reducedMotion) this.#rig.idle = 0;
    this.#rig.update(dt, this.#player, input);
    return [...events, ...actions];
  }

  render(camera, dt, {reducedMotion = false} = {}) {
    this.#prepareCamera(camera); this.#player.render(dt);
    const time = this.#elapsed, bloom = this.#visit.bloom;
    for (const portal of this.#portals) {
      portal.glow.material.opacity = portal.spec.level === this.#visit.blocked ? .08 : this.#visit.near?.level === portal.spec.level ? .43 : .24;
      portal.medal.rotation.y = reducedMotion ? 0 : Math.sin(time * 1.5) * .18;
    }
    this.#rotor.rotation.z = reducedMotion ? .2 : time * .8;
    for (const souvenir of this.#souvenirs) {
      const heard = this.#visit.echoes.has(souvenir.level);
      souvenir.path.visible = souvenir.halo.visible = heard;
      souvenir.toy.rotation.z = heard && !reducedMotion ? Math.sin(time * 3) * .12 : 0;
      souvenir.toy.position.y = heard && !reducedMotion ? .08 + Math.sin(time * 4) * .08 : 0;
    }
    for (const [i, petal] of this.#petals.entries()) petal.position.y = .1 + (bloom > 0 && !reducedMotion ? Math.sin(time * 8 + i * .4) * .22 : 0);
    for (const [i, bird] of this.#birds.entries()) {
      bird.visible = this.#visit.discoveries > 0;
      const chorus = this.#visit.chorus > 0, radius = chorus ? 4.2 : 3;
      const a = i * Math.PI * 2 / this.#birds.length + (reducedMotion ? 0 : time * (chorus ? 1.2 : .5));
      bird.position.set(Math.cos(a) * radius, (chorus ? 4.3 : 3.5) + (reducedMotion ? 0 : Math.sin(time * 3 + i) * .15), HUB.toy.z + Math.sin(a) * radius);
      bird.rotation.y = -a;
    }
  }

  snapshot() {
    const b = this.#player.body, forward = this.#rig?.forward ?? this.#facing;
    const chorusReady = hubChorusReady(this.#visit), echoNear = this.#visit.echoNear;
    const actionHint = echoNear && !this.#visit.echoes.has(echoNear) ? '↻ ♪ Echo wecken'
      : chorusReady ? this.#visit.flowerNear ? '↻ ♪ Alle singen!' : '♪ Zur Blume' : null;
    return {name: 'Sternenhof', time: this.#elapsed, near: this.#visit.near ? {level: this.#visit.near.level, label: this.#visit.near.label} : null,
      pos: b.pos.toArray(), velocity: b.vel.toArray(), grounded: b.onGround, forward: forward.toArray(),
      right: new THREE.Vector3().crossVectors(forward, b.up).normalize().toArray(), up: b.up.toArray(),
      completed: [...this.#completed], discovery: this.#visit.discoveries, blocked: this.#visit.blocked,
      echoes: [...this.#visit.echoes], echoTotal: this.#visit.completed.size, chorus: this.#visit.chorus > 0, chorusReady, actionHint};
  }

  layout() {
    return {spawn: point(HUB.spawn.x, HUB.spawn.z).toArray(), toy: point(HUB.toy.x, HUB.toy.z).toArray(), boundary: HUB.boundary,
      souvenirs: HUB_PORTALS.map(p => {const s = hubSouvenir(p.level); return {level: p.level, pos: point(s.x, s.z).toArray()};}),
      portals: HUB_PORTALS.map(p => {const r = hubSpawn(p.level); return {level: p.level, label: p.label, pos: point(p.x, p.z).toArray(), returnPos: point(r.x, r.z).toArray()};})};
  }
}
