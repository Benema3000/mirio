// Sternenhof: a little home planet under a starry sky, with a small moon.
// Sandy paths run like a star from the spawn to the pads; each pad has a beam
// of light up to its journey's planet, and stepping onto one flings Mirio up
// the beam. A spring flower under the moon hops Mirio up to it, where the race
// waits; one on the moon hops him home. Mirio moves exactly as in the
// Planetenreise (player.js, round gravity); the rules live in hub-rules.js.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {canvasTexture, glowCanvas} from './art.js';
import {CameraRig} from './camera.js';
import {Player} from './player.js';
import {buildRocket} from './props.js';
import {mulberry32, tangentDir} from './world.js';
import {HUB, HUB_PADS, HUB_SPAWN, HUB_SPRINGS, MOON_CENTER, MOON_DIR, createHubVisit, hubDir, hubDistance, hubPoint, hubReturn, hubSouvenir, stepHubVisit} from './hub-rules.js';

const FORWARD = new THREE.Vector3(0, 0, -1), Y = new THREE.Vector3(0, 1, 0);
const CREAM = 0xfff0ce, GOLD = 0xf5c864, INK = 0x3b4a66, LEAF = 0x6fb472, PINE = 0x3f8a66, TRUNK = 0x9a6a45;
const SKY = 0x1a1d4d;
const PHYSICS_STEP = 1 / 120, MAX_FRAME = .05;
// Flat enough to see the journeys' planets in the sky.
const CAMERA = {distance: 10, pitch: .3};
// Up the beam: fast enough to reach the planet as the journey starts, while
// the home planet's pull barely slows Mirio.
const LAUNCH = {speed: 16, gravityScale: .18};
// A spring hop between planet and moon: about a second through the air.
const HOP = {speed: 8.5, gravityScale: .15};
// The paths: this wide (radians of the home planet), and the star at the spawn.
const PATH_WIDTH = .075, PLAZA = {inner: .1, outer: .19};
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
const cone = (x, y, z, radius, height, color, sides = 10) => paint(new THREE.ConeGeometry(radius, height, sides).translate(x, y, z), color);
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
/** Stands `object` on `planet` ('home' or 'moon') at unit direction `dir` (outward is its +Y). */
function standOn(object, planet, dir, height = 0) {
  object.position.fromArray(hubPoint(planet, dir, height));
  object.quaternion.setFromUnitVectors(Y, v3(dir));
  return object;
}
/** Turns a geometry built upright at the origin so it stands on the home planet at `dir`. */
const onGround = (geometry, dir, height = 0) => geometry
  .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, v3(dir))).translate(...v3(dir, HUB.radius + height).toArray());

// Every path starts at the spawn's star and ends at a pad or the moon's spring.
const SPAWN = v3(HUB_SPAWN);
const PATH_ENDS = [...HUB_PADS.filter(p => p.planet === 'home').map(p => v3(p.dir)), ...HUB_SPRINGS.filter(s => s.planet === 'home').map(s => v3(s.dir))];
/** Angle (radians) from unit vector `p` to the nearest path. */
function pathDistance(p) {
  let best = Infinity;
  const n = new THREE.Vector3(), q = new THREE.Vector3();
  for (const end of PATH_ENDS) {
    const total = SPAWN.angleTo(end);
    n.crossVectors(SPAWN, end).normalize();
    q.copy(p).addScaledVector(n, -p.dot(n));
    const onArc = q.lengthSq() > 1e-8 && SPAWN.angleTo(q) + q.angleTo(end) <= total + 1e-4;
    best = Math.min(best, onArc ? Math.abs(Math.asin(THREE.MathUtils.clamp(p.dot(n), -1, 1))) : p.angleTo(end));
  }
  return best;
}
/** How far inside the five-pointed star at the spawn `p` is (> 0 inside). */
function plaza(p) {
  const angle = Math.atan2(p.x, -p.z), r = SPAWN.angleTo(p);
  return PLAZA.inner + (PLAZA.outer - PLAZA.inner) * Math.pow(.5 + .5 * Math.cos(5 * angle), 2) - r;
}

export class HubWorld {
  scene; #player; #rig = null; #bodies; #colliders = {home: [], moon: []}; #visit; #launch = null;
  #pads = []; #springs = []; #fireflies; #elapsed = 0; #snapCamera = true; #facing = FORWARD.clone(); #completed = [];
  #distant = []; #houseStar; #hop = null; #souvenirs = [];

  constructor(art) {
    this.scene = new THREE.Scene();
    this.scene.name = 'sternenhof';
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 70, 150);
    this.scene.add(new THREE.HemisphereLight(0xfff5dc, 0x4b4f8a, 2.2));
    const sun = new THREE.DirectionalLight(0xfff0d2, 2.4); sun.position.set(-15, 30, 18); this.scene.add(sun);
    this.#bodies = {
      home: {id: 'sternenhof', center: new THREE.Vector3(), radius: HUB.radius, gravityRadius: 60},
      moon: {id: 'sternenmond', center: v3(MOON_CENTER), radius: HUB.moon.radius, gravityRadius: HUB.moon.gravityRadius, gravityScale: HUB.moon.gravityScale},
    };
    const material = new THREE.MeshLambertMaterial({vertexColors: true});
    this.#buildSky(material);
    this.#buildHome(material);
    this.#buildMoon(material, art);
    for (const spec of HUB_PADS) this.#buildPad(spec, material, art);
    for (const spring of HUB_SPRINGS) this.#buildSpring(spring, material);
    for (const spec of HUB_PADS) this.#buildSouvenir(spec, material);
    this.#player = new Player(this.scene, art, Object.values(this.#bodies), planet => (planet === this.#bodies.moon ? this.#colliders.moon : this.#colliders.home));
    this.reset();
  }

  #buildSky(material) {
    // Stars in two sizes, a few warm; soft coloured nebulae; two far planets.
    const rnd = mulberry32(7);
    for (const [count, size, color] of [[650, .6, 0xfff6d8], [120, 1.3, 0xffe2a8]]) {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
        dir.multiplyScalar(95 + rnd() * 30).toArray(positions, i * 3);
      }
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({color, size, fog: false})));
    }
    const glow = canvasTexture(glowCanvas());
    for (const [x, y, z, scale, color] of [[-70, 45, -60, 90, 0x8a5cff], [80, -10, -55, 70, 0x2fb3c6], [10, -70, 70, 80, 0xff7fb0], [-60, 10, 80, 60, 0x5a7dff]]) {
      const nebula = new THREE.Sprite(new THREE.SpriteMaterial({map: glow, color, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false}));
      nebula.position.set(x, y, z); nebula.scale.setScalar(scale); this.scene.add(nebula);
    }
    const far = new THREE.MeshLambertMaterial({vertexColors: true, fog: false});
    const ringed = merge([ball(0, 0, 0, 7, 0xf3b7a0), ball(1.5, 2, 1, 6.2, 0xf8cdb5, 5.2),
      paint(new THREE.TorusGeometry(11, .9, 6, 48).rotateX(Math.PI / 2).scale(1, .12, 1), 0xf7e0b5)], far);
    ringed.position.set(-62, 38, -78); ringed.rotation.set(.35, 0, .25);
    const blue = merge([ball(0, 0, 0, 4, 0x7fb6e8), ball(.8, 1.2, .6, 3.4, 0xa8cff2, 2.8)], far);
    blue.position.set(74, -24, 52);
    this.scene.add(ringed, blue);
    this.#distant.push(ringed, blue);
  }

  #buildHome(material) {
    const ground = new THREE.SphereGeometry(HUB.radius, 128, 96);
    // Meadow in soft patches, sandy paths, and a golden star at the spawn.
    const colors = new Float32Array(ground.attributes.position.count * 3), p = new THREE.Vector3(), c = new THREE.Color();
    const light = new THREE.Color(0xb3de96), mid = new THREE.Color(0x92cb7c), dark = new THREE.Color(0x74b36d);
    const sand = new THREE.Color(0xf0dca6), edge = new THREE.Color(0xd8c088), gold = new THREE.Color(0xfbe39a), rim = new THREE.Color(0xe8b95a);
    for (let i = 0; i < ground.attributes.position.count; i++) {
      p.fromBufferAttribute(ground.attributes.position, i).normalize();
      const k = .5 + .5 * Math.sin(p.x * 9) * Math.sin(p.y * 7 + 1) * Math.sin(p.z * 8 + 2);
      const fine = .5 + .5 * Math.sin(p.x * 23 + p.z * 17) * Math.sin(p.y * 19);
      c.copy(dark).lerp(mid, k).lerp(light, fine * .35);
      const path = pathDistance(p);
      if (path < PATH_WIDTH) c.copy(sand);
      else if (path < PATH_WIDTH * 1.35) c.lerp(edge, .8);
      const star = plaza(p);
      if (star > .012) c.copy(gold);
      else if (star > -.006) c.copy(rim);
      c.toArray(colors, i * 3);
    }
    ground.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.scene.add(new THREE.Mesh(ground, material));

    // Nothing stands on a pad, a landing spot, the spawn, a spring or a path.
    const keepClear = [HUB_SPAWN, ...HUB_PADS.filter(s => s.planet === 'home').map(s => s.dir),
      ...HUB_PADS.map(s => hubReturn(s.level)).filter(r => r.planet === 'home').map(r => r.dir), ...HUB_SPRINGS.filter(s => s.planet === 'home').map(s => s.dir)];
    const free = (dir, gap, pathGap = PATH_WIDTH * 1.6) => keepClear.every(d => hubDistance(dir, d) > gap) && pathDistance(v3(dir)) > pathGap;
    const rnd = mulberry32(11), parts = [];
    const place = (count, gap, build, pathGap) => {
      for (let tries = 0, placed = 0; placed < count && tries < 900; tries++) {
        const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize().toArray();
        if (!free(dir, gap, pathGap)) continue;
        build(dir, rnd);
        keepClear.push(dir);
        placed++;
      }
    };
    const collide = (dir, radius, height) => this.#colliders.home.push({kind: 'cyl', base: v3(dir, HUB.radius), axis: v3(dir), height, radius});

    // The farmhouse the Sternenhof is named for, ahead and to the left of the spawn.
    const houseDir = hubDir(52, -32);
    this.#buildHouse(houseDir, material);
    collide(houseDir, 1.5, 3.2);
    keepClear.push(houseDir);

    // A pond with a stone rim and reeds, off to the left.
    const pondDir = hubDir(20, -95);
    if (free(pondDir, 3)) {
      const pond = standOn(new THREE.Group(), 'home', pondDir, .03);
      pond.add(new THREE.Mesh(new THREE.CircleGeometry(1.6, 40).rotateX(-Math.PI / 2),
        new THREE.MeshPhongMaterial({color: 0x79c3e2, shininess: 90, specular: 0xdff6ff})));
      const rim = [];
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2;
        rim.push(paint(new THREE.IcosahedronGeometry(.24 + (i % 3) * .05, 0).scale(1, .6, 1).translate(Math.cos(a) * 1.72, 0, Math.sin(a) * 1.72), i % 2 ? 0xb9b6c9 : 0xa19eb5));
      }
      for (const [x, z] of [[-1.1, -.9], [-1.3, -.4], [-.8, -1.25]]) rim.push(rod(x, .45, z, .03, .9, 0x6f9c5c), rod(x, .95, z, .07, .25, 0x8a5a3c));
      pond.add(merge(rim, material));
      this.scene.add(pond);
      keepClear.push(pondDir);
    }

    // Round trees and pines to steer by.
    place(8, 3, (dir, r) => {
      const height = 1.5 + r() * .8, green = [LEAF, 0x7cc47a, 0x5fa86c][Math.floor(r() * 3)];
      parts.push(onGround(rod(0, height / 2, 0, .22, height, TRUNK), dir), onGround(ball(0, height + .55, 0, 1 + r() * .3, green), dir),
        onGround(ball(.45, height + .15, .2, .6, green), dir), onGround(ball(-.4, height + .25, -.25, .55, green), dir));
      collide(dir, .5, height + 1);
    });
    place(7, 3, (dir, r) => {
      const s = .9 + r() * .4;
      parts.push(onGround(rod(0, .3 * s, 0, .16, .6 * s, TRUNK), dir), onGround(cone(0, 1.1 * s, 0, .95 * s, 1.4 * s, PINE, 8), dir),
        onGround(cone(0, 1.8 * s, 0, .72 * s, 1.2 * s, 0x4d9a70, 8), dir), onGround(cone(0, 2.4 * s, 0, .48 * s, 1 * s, 0x5aa87a, 8), dir));
      collide(dir, .45, 3 * s);
    });
    // Rocks, grass tufts and flowers; tufts and flowers may edge the paths.
    place(12, 1.6, (dir, r) => {
      parts.push(onGround(paint(new THREE.IcosahedronGeometry(.28 + r() * .25, 0).scale(1, .55, 1), [0xb6b3c6, 0x9f9cb3][Math.floor(r() * 2)]), dir, .05));
    });
    place(220, .7, (dir, r) => {
      const green = [0x5f9d57, 0x6cab5f, 0x7ab86a][Math.floor(r() * 3)];
      for (let k = 0; k < 3; k++) parts.push(onGround(cone((k - 1) * .09, .16, (r() - .5) * .1, .05, .32 + r() * .15, green, 4).rotateZ((k - 1) * .3), dir));
    }, PATH_WIDTH * 1.1);
    const petals = [0xffffff, 0xf7b5c8, 0xfff1a1, 0xc9b6ef, 0xffb38a];
    place(70, 1.2, (dir, r) => {
      parts.push(onGround(ball(0, .2, 0, .17, petals[Math.floor(r() * petals.length)], .12), dir), onGround(rod(0, .09, 0, .03, .18, LEAF), dir));
    }, PATH_WIDTH * 1.2);
    this.scene.add(merge(parts, material));

    // Fireflies drifting over the meadow.
    const count = 44, positions = new Float32Array(count * 3), base = [];
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
      base.push({dir, height: .6 + rnd() * 1.4, phase: rnd() * 6.3});
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({map: canvasTexture(glowCanvas()), color: 0xfff09a, size: .5,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false}));
    this.scene.add(points);
    this.#fireflies = {points, base};
  }

  #buildHouse(dir, material) {
    const house = standOn(new THREE.Group(), 'home', dir);
    // Facing the spawn, so its door and windows greet Mirio.
    const toSpawn = tangentDir(SPAWN.clone(), v3(dir));
    if (toSpawn) {
      const local = toSpawn.applyQuaternion(house.quaternion.clone().invert());
      house.rotateY(Math.atan2(local.x, local.z));
    }
    house.add(merge([
      box(0, .8, 0, 2.2, 1.6, 1.8, 0xfff0d6),
      paint(new THREE.ConeGeometry(1.75, 1.2, 4).rotateY(Math.PI / 4).scale(1.08, 1, 1).translate(0, 2.2, 0), 0xd9735f),
      box(0, .55, .91, .55, 1.1, .06, 0x8a5a3c), ball(.16, .55, .96, .05, GOLD),
      box(-.65, 1.05, .91, .45, .45, .05, 0x9fd3e6), box(.65, 1.05, .91, .45, .45, .05, 0x9fd3e6),
      box(-.65, 1.05, .93, .5, .06, .03, CREAM), box(.65, 1.05, .93, .5, .06, .03, CREAM),
      box(.6, 2.45, -.2, .3, .7, .3, 0xb8826a),
      box(0, .08, 1.25, .9, .1, .7, 0xe7d3a6),
    ], material));
    const star = new THREE.Mesh(starGeometry(.42, .19), new THREE.MeshLambertMaterial({color: GOLD, emissive: 0x6a4a00}));
    star.position.set(0, 3.1, 0); house.add(star);
    this.#houseStar = star;
    this.scene.add(house);
  }

  #buildMoon(material, art) {
    // Miro's floor drawing, the same as on the moon of the Planetenreise.
    const map = art?.floor?.clone();
    if (map) { map.repeat.set(5, 2.5); map.needsUpdate = true; }
    const moon = new THREE.Mesh(new THREE.SphereGeometry(HUB.moon.radius, 56, 40),
      new THREE.MeshLambertMaterial({color: 0xf4f0ff, map: map ?? null, emissive: 0x8a82c4, emissiveMap: map ?? null}));
    moon.position.fromArray(MOON_CENTER);
    this.scene.add(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({map: canvasTexture(glowCanvas()), color: 0xb9c6ff, transparent: true, opacity: .35,
      blending: THREE.AdditiveBlending, depthWrite: false}));
    halo.position.fromArray(MOON_CENTER); halo.scale.setScalar(HUB.moon.radius * 4.2);
    this.scene.add(halo);
    // A few craters, away from the springs and the pad.
    const rnd = mulberry32(21), craters = [], moonDir = v3(MOON_DIR);
    for (let placed = 0, tries = 0; placed < 6 && tries < 200; tries++) {
      const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
      if (Math.abs(dir.dot(moonDir)) > .6) continue;
      const r = .45 + rnd() * .35;
      craters.push(paint(new THREE.TorusGeometry(r, .1, 6, 20).rotateX(Math.PI / 2), 0xb4abd8)
        .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir)).translate(...v3(MOON_CENTER).addScaledVector(dir, HUB.moon.radius).toArray()));
      placed++;
    }
    this.scene.add(merge(craters, material));
  }

  /** A little keepsake from each journey: kite, parcels, flowers, pinwheel, notes, soap slide. */
  #buildSouvenir(spec, material) {
    const spot = hubSouvenir(spec.level), group = standOn(new THREE.Group(), spot.planet, spot.dir), parts = [rod(0, .08, 0, .72, .16, CREAM)];
    if (spec.level === 'adventure') {
      parts.push(paint(new THREE.OctahedronGeometry(.7).scale(.8, 1.25, .15).translate(0, 1.8, 0), spec.color), rod(0, .9, 0, .025, 1.2, INK));
      for (let i = 0; i < 3; i++) parts.push(ball(i % 2 ? -.18 : .18, .4 + i * .25, 0, .2, i % 2 ? GOLD : LEAF, .09));
    }
    if (spec.level === 'sky') {
      for (let i = 0; i < 3; i++) parts.push(box(0, .35 + i * .42, 0, .9 - i * .15, .38, .7 - i * .1, [0xef92b1, 0xf4c878, 0x81cbd1][i]));
      parts.push(box(0, 1.35, 0, .12, .05, .72, CREAM));
    }
    if (spec.level === 'ribbon') {
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * .45, y = 1.05 + (i % 2) * .4;
        parts.push(rod(x, y / 2, 0, .045, y, LEAF), ball(x, y, 0, .3, spec.color, .36), ball(x, y, .23, .15, GOLD, .2));
      }
    }
    if (spec.level === 'kart') {
      parts.push(rod(0, .85, 0, .055, 1.5, CREAM), ball(0, 1.7, .13, .16, GOLD, .16));
      for (let i = 0; i < 4; i++) parts.push(paint(new THREE.SphereGeometry(1, 10, 6).scale(.2, .53, .08).translate(0, .4, 0).rotateZ(i * Math.PI / 2).translate(0, 1.7, 0), i % 2 ? CREAM : spec.color));
    }
    if (spec.level === 'marble') {
      for (const [i, color] of [0xef9ead, 0x9ccfa5, 0x91cbdc].entries()) {
        const x = (i - 1) * .53, y = .55 + i * .22;
        parts.push(ball(x, y, 0, .24, color, .17), rod(x + .18, y + .45, 0, .045, .9, color));
      }
    }
    if (spec.level === 'volcano') {
      // The Glutbeere on a little heap of ash.
      parts.push(ball(0, .35, 0, .5, 0x6a5e68, .3), ball(0, .95, 0, .36, 0xff5a2a), ball(.14, 1.32, 0, .16, 0x5fae4a, .06));
    }
    if (spec.level === 'tilt') {
      parts.push(paint(new THREE.TorusGeometry(.58, .075, 6, 24).translate(.18, 1.55, 0), spec.color),
        paint(new THREE.BoxGeometry(1.6, .12, .25).rotateZ(.16).translate(0, .8, 0), 0xe9a7c3), cone(0, .55, 0, .22, .4, GOLD, 3));
    }
    const toy = merge(parts, material);
    group.add(toy);
    this.scene.add(group);
    this.#souvenirs.push({level: spec.level, group, toy, wiggle: 0});
  }

  #buildSpring(spring, material) {
    // A big spring flower; the one on the planet has a trail of light up to the moon.
    const group = standOn(new THREE.Group(), spring.planet, spring.dir);
    const parts = [ball(0, .05, 0, 1.25, 0x6fb472, .1), ball(0, .2, 0, .5, GOLD, .18)];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      parts.push(ball(Math.cos(a) * .82, .16, Math.sin(a) * .82, .42, i % 2 ? 0xf49ac1 : 0xffc2dc, .1));
    }
    const flower = merge(parts, material);
    group.add(flower);
    this.scene.add(group);
    let trail = null;
    if (spring.planet === 'home') {
      trail = new THREE.Group();
      const dot = new THREE.SphereGeometry(.16, 10, 8), glow = new THREE.MeshBasicMaterial({color: 0xffe9a8, transparent: true, opacity: .7});
      const from = HUB.radius + 1, to = HUB.moon.distance - HUB.moon.radius - 1;
      for (let d = from; d <= to + 1e-6; d += (to - from) / 5) {
        const bead = new THREE.Mesh(dot, glow.clone()); bead.position.copy(v3(MOON_DIR, d)); trail.add(bead);
      }
      this.scene.add(trail);
    }
    this.#springs.push({spring, flower, trail, squash: 0});
  }

  #buildPad(spec, material, art) {
    const pad = standOn(new THREE.Group(), spec.planet, spec.dir);
    pad.add(merge([
      paint(new THREE.CylinderGeometry(1.35, 1.45, .14, 36).translate(0, .05, 0), spec.color),
      paint(new THREE.TorusGeometry(1.5, .13, 8, 36).rotateX(Math.PI / 2).translate(0, .12, 0), CREAM),
    ], material));
    // The name floats just above the pad, in view from across the planet.
    const sign = label(spec.label); sign.position.set(0, 3.4, 0); pad.add(sign);
    const medal = new THREE.Mesh(starGeometry(), new THREE.MeshLambertMaterial({color: GOLD, emissive: 0x6a4a00}));
    medal.position.set(3.75, 3.4, 0); pad.add(medal);
    this.scene.add(pad);

    // The beam: pale light from the pad to the underside of its planet.
    const height = spec.planet === 'moon' ? HUB.moon.planetHeight : HUB.planetHeight, length = height - HUB.planetRadius;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(.75, 1.3, length, 28, 1, true).translate(0, length / 2, 0),
      new THREE.MeshBasicMaterial({color: spec.color, transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide}),
    );
    standOn(beam, spec.planet, spec.dir);
    this.scene.add(beam);

    const planet = standOn(new THREE.Group(), spec.planet, spec.dir, height);
    planet.add(this.#journeyPlanet(spec, material, art));
    this.scene.add(planet);
    this.#pads.push({spec, beam, planet, medal, sign});
  }

  /** Each journey's planet, with its landmark on top (+Y). */
  #journeyPlanet(spec, material, art) {
    const R = HUB.planetRadius, group = new THREE.Group(), parts = [];
    const add = (...geometries) => parts.push(...geometries);
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
    if (spec.level === 'volcano') {
      // A little volcano with a glowing top and a puff of smoke.
      add(cone(0, R + .45, 0, 1.1, 1.2, 0x7a4a3e, 12), ball(0, R + 1.05, 0, .38, 0xff6a2a, .12));
      for (const [x, y, r] of [[.1, R + 1.5, .3], [-.15, R + 1.9, .38], [.2, R + 2.35, .45]]) add(ball(x, y, 0, r, 0xd9d2d8));
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
    this.#hop = null;
    const back = hubReturn(lastLevel), dir = v3(back.dir), pad = HUB_PADS.find(p => p.level === this.#visit.blocked);
    // Back from a journey, Mirio faces away from the pad he left.
    this.#facing.copy(pad ? tangentDir(dir.clone().sub(v3(pad.dir)), dir) ?? FORWARD : FORWARD);
    this.#player.reset({planet: this.#bodies[back.planet], dir}, this.#facing);
    this.#player.events.length = 0;
    this.#snapCamera = true;
    for (const p of this.#pads) p.medal.visible = this.#visit.completed.has(p.spec.level);
    for (const s of this.#souvenirs) s.group.visible = this.#visit.completed.has(s.level);
    return this.snapshot();
  }

  #prepareCamera(camera) {
    if (!this.#rig) this.#rig = new CameraRig(camera, Object.values(this.#bodies));
    this.#rig.distance = CAMERA.distance;
    if (!this.#snapCamera) return;
    this.#rig.pitch = CAMERA.pitch;
    this.#rig.snap(this.#player, this.#facing);
    this.#snapCamera = false;
  }

  /** 'home' or 'moon': whichever pulls Mirio now. */
  #where() {
    return this.#player.body.planet === this.#bodies.moon ? 'moon' : 'home';
  }

  update(dt, input, camera, {reducedMotion = false} = {}) {
    dt = Math.min(MAX_FRAME, Math.max(0, dt));
    this.#prepareCamera(camera);
    // Up a beam or across to the moon, Mirio flies where he was flung.
    if (this.#launch || (this.#hop && this.#hop.landed === undefined)) this.clearIntent();
    else this.#player.readInput(input, this.#rig);
    input.consumeRide?.();
    const steps = Math.max(1, Math.ceil(dt / PHYSICS_STEP)), h = dt / steps;
    for (let i = 0; i < steps; i++) this.#player.step(h);
    this.#elapsed += dt;
    const events = this.#player.events.splice(0), body = this.#player.body;
    const tune = events.some(e => e.type === 'spin') && this.#visit.souvenirNear;
    if (tune) {
      events.push({type: 'souvenir', level: tune});
      const s = this.#souvenirs.find(s => s.level === tune);
      if (s) s.wiggle = 1.2;
    }
    if (this.#launch) {
      this.#launch.time += dt;
      if (this.#launch.time >= HUB.launchTime && !this.#launch.done) {
        this.#launch.done = true;
        events.push({type: 'enter', level: this.#launch.level});
      }
    } else {
      const planet = this.#where(), dir = body.pos.clone().sub(this.#bodies[planet].center).normalize().toArray();
      const hop = this.#hop;
      if (hop) {
        hop.time += dt;
        if (hop.landed === undefined && body.onGround && planet === hop.to && hop.time > .2) hop.landed = 0;
        if (hop.landed === undefined) {
          if (hop.time > 4) this.#hop = null;
        } else {
          // Just landed: the camera turns to show the way on (the race, on the moon).
          hop.landed += dt;
          const pad = HUB_PADS.find(p => p.planet === planet);
          if (pad) this.#rig.follow(v3(hubPoint(planet, pad.dir)).sub(body.pos), 2.5, dt);
          if (hop.landed > 1.2) this.#hop = null;
        }
      }
      for (const action of stepHubVisit(this.#visit, dt, {planet, dir, grounded: body.onGround})) {
        if (action.type === 'hop') {
          // Straight up, whatever the run-up, so the hop lands by the other spring.
          body.vel.set(0, 0, 0);
          this.#player.bounce(HOP);
          this.#hop = {to: action.to, time: 0};
          const spring = this.#springs.find(s => s.spring.planet === planet);
          if (spring) spring.squash = 1;
          events.push({type: 'hop', to: action.to});
          continue;
        }
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
    const time = this.#elapsed, signAt = new THREE.Vector3();
    for (const pad of this.#pads) {
      // A sign right in front of the camera fades rather than filling the view.
      pad.sign.getWorldPosition(signAt);
      pad.sign.material.opacity = THREE.MathUtils.clamp((signAt.distanceTo(camera.position) - 5) / 4, 0, 1);
      const level = pad.spec.level;
      const near = this.#visit.near?.level === level || this.#launch?.level === level;
      const pulse = reducedMotion ? 0 : Math.sin(time * 2.4 + (pad.spec.lon ?? 0)) * .05;
      pad.beam.material.opacity = level === this.#visit.blocked ? .06 : near ? .45 : .18 + pulse;
      if (!reducedMotion) pad.planet.rotateOnAxis(Y, dt * .25);
      pad.medal.rotation.y = reducedMotion ? 0 : time * 1.5;
    }
    for (const s of this.#springs) {
      s.squash = Math.max(0, s.squash - dt * 3);
      s.flower.scale.set(1 + s.squash * .25, 1 - s.squash * .5, 1 + s.squash * .25);
      if (!reducedMotion) s.flower.rotation.y = time * .4;
      if (s.trail) s.trail.children.forEach((bead, i) => { bead.material.opacity = reducedMotion ? .6 : .35 + .35 * Math.sin(time * 3 - i * .9); });
    }
    if (this.#houseStar && !reducedMotion) this.#houseStar.rotation.y = time * 1.2;
    for (const s of this.#souvenirs) {
      s.wiggle = Math.max(0, s.wiggle - dt);
      s.toy.rotation.y = reducedMotion ? 0 : s.wiggle * Math.sin(time * 14) * .35;
      s.toy.position.y = reducedMotion ? 0 : Math.abs(Math.sin(s.wiggle * 8)) * s.wiggle * .25;
    }
    for (const planet of this.#distant) if (!reducedMotion) planet.rotateY(dt * .03);
    const {points, base} = this.#fireflies, positions = points.geometry.attributes.position;
    base.forEach((f, i) => {
      const bob = reducedMotion ? 0 : Math.sin(time * 1.3 + f.phase) * .25;
      positions.setXYZ(i, ...v3(f.dir.toArray(), HUB.radius + f.height + bob).toArray());
    });
    positions.needsUpdate = true;
  }

  clearIntent() {
    this.#player.jumpBuffer = 0; this.#player.jumpHeld = false;
    this.#player.spinRequest = this.#player.poundRequest = false;
    this.#player.wishSpeed = 0;
  }

  snapshot() {
    const b = this.#player.body, forward = this.#rig?.forward ?? this.#facing;
    return {
      name: 'Sternenhof', time: this.#elapsed, planet: this.#where(),
      near: this.#visit.near ? {level: this.#visit.near.level, label: this.#visit.near.label} : null,
      pos: b.pos.toArray(), velocity: b.vel.toArray(), grounded: b.onGround, forward: forward.toArray(),
      right: new THREE.Vector3().crossVectors(forward, b.up).normalize().toArray(), up: b.up.toArray(),
      completed: [...this.#completed], blocked: this.#visit.blocked, launching: this.#launch?.level ?? null, souvenirNear: this.#visit.souvenirNear,
    };
  }

  layout() {
    const pads = HUB_PADS.map(p => {
      const back = hubReturn(p.level), height = p.planet === 'moon' ? HUB.moon.planetHeight : HUB.planetHeight;
      return {level: p.level, label: p.label, planet: p.planet, pos: hubPoint(p.planet, p.dir),
        returnPos: hubPoint(back.planet, back.dir), planetPos: hubPoint(p.planet, p.dir, height)};
    });
    const springs = HUB_SPRINGS.map(s => ({id: s.id, planet: s.planet, to: s.to, pos: hubPoint(s.planet, s.dir)}));
    return {spawn: hubPoint('home', HUB_SPAWN), radius: HUB.radius, moon: {center: [...MOON_CENTER], radius: HUB.moon.radius}, pads, portals: pads, springs};
  }
}
