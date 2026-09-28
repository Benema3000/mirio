// Sternenhof: a little home planet under a starry sky. Six pads, each with a
// beam of light up to its journey's planet; step onto one and Mirio is flung
// up the beam. Mirio moves exactly as in the Planetenreise (player.js, round
// gravity); the rules live in hub-rules.js.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {canvasTexture} from './art.js';
import {CameraRig} from './camera.js';
import {Player} from './player.js';
import {buildRocket} from './props.js';
import {mulberry32, tangentDir} from './world.js';
import {HUB, HUB_PADS, HUB_SPAWN, createHubVisit, hubDistance, hubReturn, stepHubVisit} from './hub-rules.js';

const FORWARD = new THREE.Vector3(0, 0, -1), Y = new THREE.Vector3(0, 1, 0);
const CREAM = 0xfff0ce, GOLD = 0xf5c864, INK = 0x3b4a66, LEAF = 0x6fb472, TRUNK = 0x9a6a45;
const SKY = 0x16204a;
const PHYSICS_STEP = 1 / 120, MAX_FRAME = .05;
// Flat enough to see the journeys' planets in the sky.
const CAMERA = {distance: 10, pitch: .3};
// Up the beam: fast enough to reach the planet as the journey starts, while
// the home planet's pull barely slows Mirio.
const LAUNCH = {speed: 16, gravityScale: .18};
const v3 = (dir, length = 1) => new THREE.Vector3(...dir).multiplyScalar(length);

function paint(geometry, color) {
  const c = new THREE.Color(color), values = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < values.length; i += 3) c.toArray(values, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}
const ball = (x, y, z, r, color, sy = r) => paint(new THREE.SphereGeometry(1, 14, 10).scale(r, sy, r).translate(x, y, z), color);
const box = (x, y, z, sx, sy, sz, color) => paint(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), color);
const rod = (x, y, z, radius, height, color) => paint(new THREE.CylinderGeometry(radius, radius, height, 10).translate(x, y, z), color);
function merge(parts, material) {
  const flat = parts.map(g => (g.index ? g.toNonIndexed() : g));
  const mesh = new THREE.Mesh(mergeGeometries(flat), material);
  for (const g of new Set([...parts, ...flat])) g.dispose();
  return mesh;
}
function starGeometry(outer = .54, inner = .24) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? inner : outer;
    if (i) shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    else shape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {depth: .13, bevelEnabled: false}).center();
}
/** A name sign: dark letters on a cream plate, readable from across the planet. */
function label(text) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff5dd'; ctx.strokeStyle = '#2f4650'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.roundRect(8, 14, 1008, 172, 60); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2f4650'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 112px sans-serif';
  ctx.fillText(text, 512, 104, 944);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: canvasTexture(canvas), depthWrite: false}));
  sprite.scale.set(6.4, 1.25, 1);
  return sprite;
}
/** Stands `object` on the home planet at `dir` (outward is its +Y). */
function standAt(object, dir, height = 0) {
  object.position.copy(v3(dir, HUB.radius + height));
  object.quaternion.setFromUnitVectors(Y, v3(dir));
  return object;
}

export class HubWorld {
  scene; #player; #rig = null; #planet; #colliders = []; #visit; #launch = null;
  #pads = []; #elapsed = 0; #snapCamera = true; #facing = FORWARD.clone(); #completed = [];

  constructor(art) {
    this.scene = new THREE.Scene();
    this.scene.name = 'sternenhof';
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 70, 150);
    this.scene.add(new THREE.HemisphereLight(0xfff5dc, 0x47507a, 2.2));
    const sun = new THREE.DirectionalLight(0xfff0d2, 2.4); sun.position.set(-15, 30, 18); this.scene.add(sun);
    this.#planet = {id: 'sternenhof', center: new THREE.Vector3(), radius: HUB.radius, gravityRadius: 60};
    const material = new THREE.MeshLambertMaterial({vertexColors: true});
    this.#buildSky();
    this.#buildHome(material);
    for (const spec of HUB_PADS) this.#buildPad(spec, material, art);
    this.#player = new Player(this.scene, art, [this.#planet], () => this.#colliders);
    this.reset();
  }

  #buildSky() {
    const rnd = mulberry32(7), count = 600, positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
      dir.multiplyScalar(95 + rnd() * 30).toArray(positions, i * 3);
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({color: 0xfff6d8, size: .7, fog: false})));
  }

  #buildHome(material) {
    const ground = new THREE.SphereGeometry(HUB.radius, 72, 48);
    // Two greens in soft patches, so the round planet reads as a meadow.
    const colors = new Float32Array(ground.attributes.position.count * 3), p = new THREE.Vector3();
    const light = new THREE.Color(0xb7dc9c), dark = new THREE.Color(0x93c683), c = new THREE.Color();
    for (let i = 0; i < ground.attributes.position.count; i++) {
      p.fromBufferAttribute(ground.attributes.position, i);
      const k = .5 + .5 * Math.sin(p.x * .9) * Math.sin(p.y * .7 + 1) * Math.sin(p.z * .8 + 2);
      c.copy(dark).lerp(light, k).toArray(colors, i * 3);
    }
    ground.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.scene.add(new THREE.Mesh(ground, material));

    // A few trees and flowers to steer by, never on a pad, a landing spot or the spawn.
    const keepClear = [HUB_SPAWN, ...HUB_PADS.map(s => s.dir), ...HUB_PADS.map(s => hubReturn(s.level))];
    const free = (dir, gap) => keepClear.every(d => hubDistance(dir, d) > gap);
    const rnd = mulberry32(11), parts = [];
    const place = (count, gap, build) => {
      for (let tries = 0, placed = 0; placed < count && tries < 400; tries++) {
        const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize().toArray();
        if (!free(dir, gap)) continue;
        build(dir, rnd);
        keepClear.push(dir);
        placed++;
      }
    };
    const onGround = (geometry, dir) => geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, v3(dir))).translate(...v3(dir, HUB.radius).toArray());
    place(7, 3.4, (dir, r) => {
      const height = 1.6 + r() * .8;
      parts.push(onGround(rod(0, height / 2, 0, .22, height, TRUNK), dir), onGround(ball(0, height + .6, 0, 1.05 + r() * .3, LEAF), dir));
      this.#colliders.push({kind: 'cyl', base: v3(dir, HUB.radius), axis: v3(dir), height: height + 1, radius: .5});
    });
    const petals = [0xffffff, 0xf7b5c8, 0xfff1a1, 0xc9b6ef];
    place(46, 1.9, (dir, r) => {
      parts.push(onGround(ball(0, .18, 0, .17, petals[Math.floor(r() * petals.length)], .12), dir), onGround(rod(0, .08, 0, .03, .16, LEAF), dir));
    });
    this.scene.add(merge(parts, material));
  }

  #buildPad(spec, material, art) {
    const pad = standAt(new THREE.Group(), spec.dir);
    pad.add(merge([
      paint(new THREE.CylinderGeometry(1.35, 1.45, .14, 36).translate(0, .05, 0), spec.color),
      paint(new THREE.TorusGeometry(1.5, .13, 8, 36).rotateX(Math.PI / 2).translate(0, .12, 0), CREAM),
    ], material));
    // The name floats just above the pad, in view from across the planet.
    const sign = label(spec.label); sign.position.set(0, 3.4, 0); pad.add(sign);
    const medal = new THREE.Mesh(starGeometry(), new THREE.MeshLambertMaterial({color: GOLD, emissive: 0x6a4a00}));
    medal.position.set(3.75, 3.4, 0); pad.add(medal);
    this.scene.add(pad);

    // The beam: pale light from the pad to the underside of the planet.
    const length = HUB.planetHeight - HUB.planetRadius;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(.75, 1.3, length, 28, 1, true).translate(0, length / 2, 0),
      new THREE.MeshBasicMaterial({color: spec.color, transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide}),
    );
    standAt(beam, spec.dir);
    this.scene.add(beam);

    const planet = standAt(new THREE.Group(), spec.dir, HUB.planetHeight);
    planet.add(this.#journeyPlanet(spec, material, art));
    this.scene.add(planet);
    this.#pads.push({spec, beam, planet, medal});
  }

  /** Each journey's planet, with its landmark on top (+Y). */
  #journeyPlanet(spec, material, art) {
    const R = HUB.planetRadius, group = new THREE.Group(), parts = [];
    const add = (geometry) => parts.push(geometry);
    if (spec.level === 'tilt') {
      // A soap bubble with a star floating inside.
      group.add(new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20),
        new THREE.MeshLambertMaterial({color: 0xcff6f2, transparent: true, opacity: .38, depthWrite: false})));
      const star = new THREE.Mesh(starGeometry(1.3, .6), new THREE.MeshLambertMaterial({color: GOLD, emissive: 0x5a3c00}));
      group.add(star);
      add(ball(0, -R - .2, 0, .9, spec.color, .25));
    } else {
      // The Planetenreise planet is green like its meadow; the others wear their pad's colour.
      const body = spec.level === 'adventure' ? 0x8fcf7a : spec.color;
      add(paint(new THREE.SphereGeometry(R, 40, 28), body));
      add(paint(new THREE.SphereGeometry(1, 28, 18).scale(R * .9, R * .5, R * .9).translate(.6, .9, .4), new THREE.Color(body).lerp(new THREE.Color(0xffffff), .25)));
    }
    if (spec.level === 'adventure') {
      const rocket = buildRocket(art); rocket.group.scale.setScalar(.34); rocket.group.position.set(-.7, R - .15, .2); rocket.flame.visible = false;
      group.add(rocket.group);
      for (const [x, z] of [[1.1, .3], [.3, -1.2]]) add(rod(x, R + .3, z, .1, .8, TRUNK), ball(x, R + .9, z, .45, LEAF));
    }
    if (spec.level === 'sky') {
      add(box(0, R + .75, 0, 1.9, 1.2, .25, CREAM));
      add(paint(new THREE.ConeGeometry(.95, .7, 3).rotateZ(Math.PI).scale(1, 1, .12).translate(0, R + .95, .15), spec.color));
      for (const [x, y, z] of [[-2.9, .6, .4], [2.8, -.3, -.6], [.4, -1.4, 2.6]]) {
        add(ball(x, y, z, .75, 0xffffff), ball(x + .7, y + .1, z, .55, 0xffffff), ball(x - .6, y - .1, z + .1, .5, 0xffffff));
      }
    }
    if (spec.level === 'kart') {
      // A checkered race ring round the planet.
      for (let i = 0; i < 24; i++) {
        const a = i * Math.PI / 12;
        add(paint(new THREE.BoxGeometry(.8, .16, .6), i % 2 ? INK : CREAM)
          .rotateY(-a).translate(Math.cos(a) * (R + .9), 0, Math.sin(a) * (R + .9)).rotateZ(.25));
      }
      add(box(0, R + .5, 0, .12, 1.1, .12, INK), box(.45, R + .85, 0, .8, .45, .06, CREAM));
    }
    if (spec.level === 'marble') {
      add(paint(new THREE.TorusGeometry(R + .8, .18, 8, 48).rotateX(Math.PI / 2 - .35), CREAM));
      for (const [i, color] of [0xef9ead, 0x9ccfa5, 0x91cbdc].entries()) {
        const x = (i - 1) * 1.1;
        add(ball(x, R + .45 + i * .3, 0, .28, color, .22), rod(x + .22, R + 1 + i * .3, 0, .06, 1, color));
      }
    }
    if (spec.level === 'ribbon') {
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI * 2 / 7;
        add(ball(Math.cos(a) * .75, R + .6, Math.sin(a) * .75, .5, 0xfff2f6, .2));
      }
      add(ball(0, R + .7, 0, .45, GOLD, .3), rod(0, R + .25, 0, .07, .6, LEAF));
      const rnd = mulberry32(5);
      for (let i = 0; i < 14; i++) {
        const d = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize().multiplyScalar(R);
        add(ball(d.x, d.y, d.z, .18, [0xffffff, 0xfff1a1, 0xc9b6ef][i % 3]));
      }
    }
    group.add(merge(parts, material));
    return group;
  }

  reset({completed = [], lastLevel = null} = {}) {
    this.#visit = createHubVisit({completed, lastLevel});
    this.#completed = [...this.#visit.completed];
    this.#elapsed = 0;
    this.#launch = null;
    const dir = v3(hubReturn(lastLevel));
    // Back from a journey, Mirio faces the pole, away from the pad he left.
    this.#facing.copy(this.#visit.blocked ? tangentDir(v3(HUB_SPAWN).sub(dir), dir) ?? FORWARD : FORWARD);
    this.#player.reset({planet: this.#planet, dir}, this.#facing);
    this.#player.events.length = 0;
    this.#snapCamera = true;
    for (const pad of this.#pads) pad.medal.visible = this.#visit.completed.has(pad.spec.level);
    return this.snapshot();
  }

  #prepareCamera(camera) {
    if (!this.#rig) this.#rig = new CameraRig(camera, [this.#planet]);
    this.#rig.distance = CAMERA.distance;
    if (!this.#snapCamera) return;
    this.#rig.pitch = CAMERA.pitch;
    this.#rig.snap(this.#player, this.#facing);
    this.#snapCamera = false;
  }

  update(dt, input, camera, {reducedMotion = false} = {}) {
    dt = Math.min(MAX_FRAME, Math.max(0, dt));
    this.#prepareCamera(camera);
    if (this.#launch) this.clearIntent();
    else this.#player.readInput(input, this.#rig);
    const steps = Math.max(1, Math.ceil(dt / PHYSICS_STEP)), h = dt / steps;
    for (let i = 0; i < steps; i++) this.#player.step(h);
    this.#elapsed += dt;
    const events = this.#player.events.splice(0), body = this.#player.body;
    if (this.#launch) {
      this.#launch.time += dt;
      if (this.#launch.time >= HUB.launchTime && !this.#launch.done) {
        this.#launch.done = true;
        events.push({type: 'enter', level: this.#launch.level});
      }
    } else {
      const dir = body.pos.clone().sub(this.#planet.center).normalize().toArray();
      for (const action of stepHubVisit(this.#visit, dt, {dir, grounded: body.onGround})) {
        this.#launch = {level: action.level, time: 0, done: false};
        this.#player.bounce(LAUNCH);
        this.#player.invulnerable = 0;
        events.push({type: 'liftoff'});
      }
    }
    // Quiet mode keeps camera turns under the player's control.
    if (reducedMotion) this.#rig.idle = 0;
    this.#rig.update(dt, this.#player, input);
    return events;
  }

  render(camera, dt, {reducedMotion = false} = {}) {
    this.#prepareCamera(camera);
    this.#player.render(dt);
    const time = this.#elapsed;
    for (const pad of this.#pads) {
      const level = pad.spec.level;
      const near = this.#visit.near?.level === level || this.#launch?.level === level;
      const pulse = reducedMotion ? 0 : Math.sin(time * 2.4 + pad.spec.lon) * .05;
      pad.beam.material.opacity = level === this.#visit.blocked ? .06 : near ? .45 : .18 + pulse;
      if (!reducedMotion) pad.planet.rotateOnAxis(Y, dt * .25);
      pad.medal.rotation.y = reducedMotion ? 0 : time * 1.5;
    }
  }

  clearIntent() {
    this.#player.jumpBuffer = 0; this.#player.jumpHeld = false;
    this.#player.spinRequest = this.#player.poundRequest = false;
    this.#player.wishSpeed = 0;
  }

  snapshot() {
    const b = this.#player.body, forward = this.#rig?.forward ?? this.#facing;
    return {
      name: 'Sternenhof', time: this.#elapsed,
      near: this.#visit.near ? {level: this.#visit.near.level, label: this.#visit.near.label} : null,
      pos: b.pos.toArray(), velocity: b.vel.toArray(), grounded: b.onGround, forward: forward.toArray(),
      right: new THREE.Vector3().crossVectors(forward, b.up).normalize().toArray(), up: b.up.toArray(),
      completed: [...this.#completed], blocked: this.#visit.blocked, launching: this.#launch?.level ?? null,
    };
  }

  layout() {
    const pads = HUB_PADS.map(p => ({
      level: p.level, label: p.label, pos: v3(p.dir, HUB.radius).toArray(),
      returnPos: v3(hubReturn(p.level), HUB.radius).toArray(), planetPos: v3(p.dir, HUB.radius + HUB.planetHeight).toArray(),
    }));
    return {spawn: v3(HUB_SPAWN, HUB.radius).toArray(), radius: HUB.radius, pads, portals: pads};
  }
}
