// Earned souvenirs make a small musical garden; none block the adventure route.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {dirFromLatLon, surfacePoint, tangentDir} from './world.js';

const CHORUS = Object.freeze({reach: 2.2, height: 2.6, cooldown: 1.2, duration: 6, minimum: 2, springSpeed: 16, souvenirRadius: 4.5});
const SOUVENIRS = Object.freeze([
  {id: 'adventure', color: 0xf5bb78}, {id: 'sky', color: 0x88cbd7},
  {id: 'marble', color: 0xf2ce6d}, {id: 'tilt', color: 0x94d6c4},
  {id: 'ribbon', color: 0xe9a7c3}, {id: 'kart', color: 0xbbafe4},
]);
const GOLD = 0xffd479, CREAM = 0xffefda, LEAF = 0x89be91;
const UP = new THREE.Vector3(0, 1, 0);
const FLOWER_DIR = dirFromLatLon(10, -110);
const FORWARD = tangentDir(new THREE.Vector3(0, 0, 1), FLOWER_DIR);
const RIGHT = new THREE.Vector3().crossVectors(FLOWER_DIR, FORWARD).normalize();

function paint(geometry, color) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  const values = new Float32Array(flat.attributes.position.count * 3), tint = new THREE.Color(color);
  for (let i = 0; i < values.length; i += 3) tint.toArray(values, i);
  flat.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return flat;
}
function ball(x, y, z, sx, sy, sz, color) { return paint(new THREE.SphereGeometry(1, 10, 6).scale(sx, sy, sz).translate(x, y, z), color); }
function rod(x, y, z, radius, height, color) { return paint(new THREE.CylinderGeometry(radius, radius, height, 8).translate(x, y, z), color); }
function box(x, y, z, width, height, depth, color) { return paint(new THREE.BoxGeometry(width, height, depth).translate(x, y, z), color); }
function merged(parts, material) {
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  return new THREE.Mesh(geometry, material);
}
function pointDir(x, z, radius) {
  return FLOWER_DIR.clone().multiplyScalar(radius).addScaledVector(RIGHT, x).addScaledVector(FORWARD, z).normalize();
}

export class BonusChorus {
  #planet; #group = new THREE.Group(); #completed = new Set(); #echoes = new Set();
  #souvenirs = []; #flower; #birds = []; #chorus = 0; #cooldown = 0; #bloom = 0; #lastPound; #plays = 0;

  constructor(scene, planet) {
    this.#planet = planet;
    this.#group.name = 'bonus-chorus';
    scene.add(this.#group);
    const material = new THREE.MeshLambertMaterial({vertexColors: true});
    this.#flower = new THREE.Group();
    const parts = [ball(0, .17, 0, .8, .24, .8, GOLD), ball(-.23, .37, .2, .07, .04, .1, 0x594f62), ball(.23, .37, .2, .07, .04, .1, 0x594f62)];
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      parts.push(ball(Math.cos(angle), .1, Math.sin(angle), .65, .13, .65, i % 2 ? CREAM : 0xf0afc6));
    }
    this.#flower.add(merged(parts, material));
    this.#place(this.#flower, FLOWER_DIR);
    for (const [index, spec] of SOUVENIRS.entries()) {
      const angle = index * Math.PI / 3, dir = pointDir(Math.cos(angle) * CHORUS.souvenirRadius, Math.sin(angle) * CHORUS.souvenirRadius, planet.radius);
      const group = new THREE.Group(), parts = [rod(0, .08, 0, .65, .16, CREAM)];
      if (spec.id === 'adventure') {
        parts.push(paint(new THREE.OctahedronGeometry(.65).scale(.8, 1.25, .15).translate(0, 1.55, 0), spec.color), rod(0, .7, 0, .025, 1.1, GOLD));
      } else if (spec.id === 'sky') {
        parts.push(box(0, 1.8, 0, 1.35, .15, .2, CREAM));
        for (let i = 0; i < 3; i++) parts.push(rod((i - 1) * .45, 1.05 + i * .12, 0, .085, 1.2 - i * .24, i % 2 ? GOLD : spec.color));
      } else if (spec.id === 'marble') {
        for (let i = 0; i < 3; i++) parts.push(ball((i - 1) * .5, .6 + i * .2, 0, .24, .17, .14, spec.color), rod((i - 1) * .5 + .18, 1.05 + i * .2, 0, .045, .9, spec.color));
      } else if (spec.id === 'tilt') {
        parts.push(paint(new THREE.TorusGeometry(.52, .07, 6, 24).translate(.1, 1.3, 0), spec.color), box(0, .62, 0, 1.5, .12, .25, 0xe9a7c3));
      } else if (spec.id === 'ribbon') {
        for (let i = 0; i < 3; i++) parts.push(rod((i - 1) * .45, .55, 0, .045, 1, LEAF), ball((i - 1) * .45, 1.1, 0, .3, .36, .3, spec.color));
      } else {
        parts.push(rod(0, .8, 0, .055, 1.5, CREAM));
        for (let i = 0; i < 4; i++) parts.push(paint(new THREE.SphereGeometry(1, 10, 6).scale(.2, .45, .08).translate(0, .35, 0).rotateZ(i * Math.PI / 2).translate(0, 1.55, 0), i % 2 ? CREAM : spec.color));
      }
      const toy = merged(parts, material); group.add(toy);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(.85, .04, 5, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({color: GOLD}));
      halo.position.y = .1; group.add(halo); this.#place(group, dir);
      this.#souvenirs.push({id: spec.id, group, toy, halo, dir});
      const bird = merged([ball(0, 0, 0, .25, .2, .3, spec.color), ball(-.34, .02, 0, .3, .07, .14, CREAM), ball(.34, .02, 0, .3, .07, .14, CREAM), ball(0, .02, .28, .08, .07, .14, GOLD)], material);
      this.#group.add(bird); this.#birds.push(bird);
    }
  }

  #place(group, dir) {
    group.position.copy(surfacePoint(this.#planet, dir, .03));
    group.quaternion.setFromUnitVectors(UP, dir);
    this.#group.add(group);
  }

  setCompletedLevels(ids) { this.#completed = new Set(ids.filter(id => SOUVENIRS.some(spec => spec.id === id))); }

  reset() { this.#echoes.clear(); this.#chorus = this.#cooldown = this.#bloom = this.#plays = 0; this.#lastPound = null; }

  step(dt, player) {
    this.#cooldown = Math.max(0, this.#cooldown - dt);
    this.#chorus = Math.max(0, this.#chorus - dt);
    this.#bloom = Math.max(0, this.#bloom - dt);
    if (player.state !== 'play' || player.body.planet !== this.#planet) return [];
    const height = player.body.pos.distanceTo(this.#planet.center) - this.#planet.radius;
    if (height > CHORUS.height) return [];
    const close = dir => player.body.up.angleTo(dir) * this.#planet.radius < CHORUS.reach;
    const events = [];
    if (player.spinning) {
      const souvenir = this.#souvenirs.find(item => this.#completed.has(item.id) && !this.#echoes.has(item.id) && close(item.dir));
      if (souvenir) {
        this.#echoes.add(souvenir.id);
        events.push({type: 'hubEcho', level: souvenir.id, pos: souvenir.group.position.clone(), color: GOLD});
      }
    }
    const pound = player.events?.findLast(event => event.type === 'pound');
    const freshPound = pound && pound !== this.#lastPound;
    if (pound) this.#lastPound = pound;
    if (this.#cooldown > 0 || !close(FLOWER_DIR) || !(player.spinning || player.pounding || freshPound)) return events;
    this.#cooldown = CHORUS.cooldown; this.#bloom = 3; this.#plays++;
    const pounding = player.pounding || freshPound;
    if (pounding) player.bounce({speed: CHORUS.springSpeed});
    events.push({type: pounding ? 'spring' : 'ring', kind: 'hubFlower', pos: this.#flower.position.clone(), color: GOLD});
    if (!pounding && this.#completed.size >= CHORUS.minimum && this.#echoes.size === this.#completed.size && this.#chorus <= 0) {
      this.#chorus = this.#bloom = CHORUS.duration;
      events.push({type: 'hubChorus', pos: this.#flower.position.clone(), color: GOLD});
    }
    return events;
  }

  update(time, {reducedMotion = false} = {}) {
    this.#flower.scale.y = this.#bloom > 0 ? 1.45 : 1;
    for (const souvenir of this.#souvenirs) {
      const heard = this.#echoes.has(souvenir.id);
      souvenir.group.visible = this.#completed.has(souvenir.id);
      souvenir.halo.visible = heard;
      souvenir.toy.rotation.z = heard && !reducedMotion ? Math.sin(time * 3) * .1 : 0;
    }
    for (const [index, bird] of this.#birds.entries()) {
      const singing = this.#chorus > 0, angle = index * Math.PI / 3 + (reducedMotion ? 0 : time * (singing ? 1.2 : .25));
      const dir = pointDir(Math.cos(angle) * (singing ? 4.5 : 3), Math.sin(angle) * (singing ? 4.5 : 3), this.#planet.radius);
      bird.position.copy(surfacePoint(this.#planet, dir, singing ? 4.1 : 2.8));
      bird.quaternion.setFromUnitVectors(UP, dir);
      bird.visible = this.#bloom > 0 || index < this.#completed.size;
    }
  }

  snapshot() { return {completed: [...this.#completed], echoes: [...this.#echoes], chorus: this.#chorus > 0, plays: this.#plays}; }
  layout() { return {flower: {dir: FLOWER_DIR.toArray(), height: 0}, souvenirs: this.#souvenirs.map(item => ({level: item.id, dir: item.dir.toArray(), height: 0}))}; }
}
