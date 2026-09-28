import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { POST } from './sky-post-rules.js';

const UP = new THREE.Vector3(0, 1, 0);
const material = new THREE.MeshLambertMaterial({vertexColors: true});
const parcelColors = {garden: 0xef92b1, bakery: 0xf4c878, kite: 0x81cbd1};
function tint(g, color) {
  const c = new THREE.Color(color), data = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < data.length; i += 3) c.toArray(data, i);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return g;
}
function ball(x, y, z, sx, sy, sz, c) { return tint(new THREE.SphereGeometry(1, 12, 8).scale(sx, sy, sz).translate(x, y, z), c); }
function box(x, y, z, sx, sy, sz, c) { return tint(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), c); }
function tube(x, y, z, radius, height, c) { return tint(new THREE.CylinderGeometry(radius, radius, height, 12).translate(x, y, z), c); }
function ring(x, y, z, radius, thickness, c) { return tint(new THREE.TorusGeometry(radius, thickness, 6, 36).translate(x, y, z), c); }
function mesh(parts) {
  const flattened = parts.map(g => g.index ? g.toNonIndexed() : g);
  const geometry = mergeGeometries(flattened);
  for (const g of new Set([...parts, ...flattened])) g.dispose();
  return new THREE.Mesh(geometry, material);
}
function icon(id, scale = 1) {
  let parts;
  if (id === 'garden') {
    parts = [ball(0, 0, .07, .22, .22, .12, 0xffdf78)];
    for (let i = 0; i < 6; i++) parts.push(ball(Math.cos(i * Math.PI / 3) * .35, Math.sin(i * Math.PI / 3) * .35, 0, .24, .24, .09, 0xfff4dd));
  } else if (id === 'bakery') {
    parts = [ball(0, 0, 0, .58, .31, .13, 0xfff1cc)];
    for (let i = -1; i <= 1; i++) parts.push(box(i * .25, .07, .13, .06, .26, .03, 0xa76a43));
  } else parts = [tint(new THREE.OctahedronGeometry(.52).scale(.75, 1.1, .13), 0xfff5d7), box(0, -.7, 0, .045, .55, .04, 0xfff5d7)];
  return mesh(parts.map(p => p.scale(scale, scale, scale)));
}
function parcel(id) {
  const group = new THREE.Group();
  group.add(mesh([box(0, 0, 0, .8, .65, .65, parcelColors[id]), box(0, 0, .335, .11, .67, .025, 0xfff8df), box(0, 0, .35, .81, .1, .03, 0xfff8df)]));
  const mark = icon(id, .42); mark.position.set(.16, .05, .38); group.add(mark);
  const back = icon(id, .58); back.position.set(0, 0, -.34); back.rotation.y = Math.PI; group.add(back);
  return group;
}
function bird() {
  return mesh([ball(0, 0, 0, .23, .18, .45, 0xfff7df),
    tint(new THREE.ConeGeometry(.14, .35, 4).rotateX(Math.PI / 2).translate(0, 0, .48), 0xe4b557),
    tint(new THREE.ConeGeometry(.55, .9, 3).rotateZ(-Math.PI / 2).scale(1, .12, .6).translate(-.5, .1, 0), 0xe7eafa),
    tint(new THREE.ConeGeometry(.55, .9, 3).rotateZ(Math.PI / 2).scale(1, .12, .6).translate(.5, .1, 0), 0xe7eafa)]);
}
function resident(id) {
  const group = new THREE.Group();
  group.add(mesh([ball(0, .4, 0, .7, .8, .55, parcelColors[id]), ball(-.22, .63, .49, .09, .13, .06, 0x374451), ball(.22, .63, .49, .09, .13, .06, 0x374451),
    ball(-.6, .2, .08, .27, .16, .17, 0xffe5ae), ball(.6, .2, .08, .27, .16, .17, 0xffe5ae)]));
  if (id === 'bakery') group.add(mesh([tube(0, 1.1, 0, .43, .5, 0xfff9ec), ball(0, 1.45, 0, .68, .4, .52, 0xfff9ec)]));
  if (id === 'garden') group.add(mesh([ball(0, 1.05, 0, .8, .12, .65, 0x85bd8b), ball(0, 1.2, 0, .5, .25, .45, 0x85bd8b)]));
  if (id === 'kite') group.add(mesh([ball(0, .95, -.15, .64, .3, .6, 0x7599c4)]));
  return group;
}

/** Original sky toys, separate from Miro's unchanged pilot and plane assets. */
export class SkyPostScene {
  #scene; #course; #frame; #stations = []; #cargo = [];
  #projectiles = []; #courier; #office; #guests = []; #matrix = new THREE.Matrix4();
  constructor(scene, plane, course, frame) {
    this.#scene = scene; this.#course = course; this.#frame = frame;
    for (const [index, delivery] of course.deliveries.entries()) {
      const cargo = parcel(delivery.id); cargo.position.set((index - 1) * 1.05, -.12, -.8);
      cargo.scale.setScalar(.7); plane.add(cargo); this.#cargo.push({id: delivery.id, group: cargo});
      this.#stations.push(this.#station(delivery));
    }
    for (const d of course.deliveries) {const group = parcel(d.id); scene.add(group); this.#projectiles.push({id: d.id, group});}
    this.#courier = bird(); scene.add(this.#courier);
    this.#buildArrival();
  }
  #place(object, s, x = 0, y = 0) {
    const f = this.#frame(s);
    object.position.copy(f.center).addScaledVector(f.right, x).addScaledVector(f.up, y);
    this.#matrix.makeBasis(f.right, f.up, f.forward.clone().negate());
    object.quaternion.setFromRotationMatrix(this.#matrix);
  }
  #station(delivery) {
    const group = new THREE.Group(), parts = [];
    parts.push(ball(0, -5.8, -3, 11, 2.2, 8, 0xeaf3e9), ball(0, -4.3, -3, 9.3, .6, 6.7, 0x91be9a));
    // An open catcher faces the pilot; the broad halo shows the generous throw area.
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      parts.push(box(Math.cos(a) * 2.3, Math.sin(a) * 2.3, 0, .45, .55, 1.25, i % 2 ? delivery.color : 0xfff6dc));
    }
    parts.push(ring(0, 0, .7, 2.45, .16, 0xffedb9), box(0, -3.3, -1, 5.2, 1.8, 2, delivery.color));
    parts.push(box(5.5, -1.8, -4, 4, 5, 3.8, 0xffe8c2), tint(new THREE.ConeGeometry(3.5, 2.5, 4).rotateY(Math.PI / 4).translate(5.5, 1.8, -4), delivery.color));
    parts.push(box(5.5, -2.9, -1.98, 1.3, 2.7, .1, 0x6c8f9c), box(5.5, .05, -1.96, 1.2, 1.1, .1, 0xaddcdb));
    group.add(mesh(parts));
    const symbol = icon(delivery.id, 2.6); symbol.position.set(0, 4.4, 0); group.add(symbol);
    const halo = mesh([ring(0, 0, .82, POST.aimRadius * .7, .08, delivery.color)]); group.add(halo);
    const friend = resident(delivery.id); friend.position.set(-3.8, -3.4, .3); group.add(friend);
    const reaction = new THREE.Group(); group.add(reaction);
    if (delivery.id === 'garden') {
      const flowers = [];
      for (let i = 0; i < 15; i++) {
        const x = (i % 5 - 2) * 1.45, z = -3 - Math.floor(i / 5) * 1.4;
        flowers.push(tube(x, -3, z, .09, 2, 0x578e65), ball(x, -1.9, z, .6, .3, .6, i % 2 ? 0xffdf79 : 0xed9bbe));
      }
      reaction.add(mesh(flowers));
    }
    if (delivery.id === 'bakery') {
      reaction.add(mesh([box(5.4, -1.1, -.5, 5.3, .2, 3.1, delivery.color), box(5.4, -3.2, .1, 5, .9, 1.1, 0xc68e66)]));
      for (let i = 0; i < 4; i++) {const puff = mesh([ball(0, 0, 0, .8, 1.1, .8, 0xfff4df)]); puff.position.set(5.5, 3.4 + i * 1.8, -4); reaction.add(puff);}
    }
    if (delivery.id === 'kite') for (let i = 0; i < 4; i++) {
      const kite = icon('kite', 2); kite.position.set(i * 2.3 - 1, 4.3 + i, -7 - i * 2); reaction.add(kite);
    }
    this.#place(group, delivery.s, delivery.x, delivery.y);
    group.name = `sky:post-${delivery.id}`; this.#scene.add(group);
    return {delivery, group, friend, reaction, halo, symbol};
  }
  #buildArrival() {
    this.#office = new THREE.Group();
    this.#office.add(mesh([ball(0, -8, -8, 24, 3, 15, 0xf0f4e4), ball(0, -5.6, -8, 19, .7, 13, 0xa5c9a0),
      box(0, 0, -16, 15, 11, 7, 0xffe3ae), tint(new THREE.ConeGeometry(12, 6, 4).rotateY(Math.PI / 4).translate(0, 8, -16), 0x87bec4),
      box(0, -2, -12.4, 4, 6, .3, 0x688eaa), box(-5, 1, -12.4, 2.3, 2.8, .3, 0xb8e0dd), box(5, 1, -12.4, 2.3, 2.8, .3, 0xb8e0dd),
      box(0, 4.1, -12.3, 4.2, 2.5, .2, 0xfff8db),
      tint(new THREE.ConeGeometry(1.65, 1.4, 3).rotateZ(Math.PI).scale(1, 1, .1).translate(0, 4.2, -12.1), 0xd69665)]));
    for (let i = -5; i <= 5; i++) this.#office.add(mesh([tint(new THREE.ConeGeometry(.7, 1.4, 3).rotateZ(Math.PI).translate(i * 2.2, 6 - Math.abs(i) * .55, 6), i % 2 ? 0xeea3b4 : 0xf9d77b)]));
    for (const [i, d] of this.#course.deliveries.entries()) {
      const guest = resident(d.id); guest.position.set((i - 1) * 4, -4.6, 2); guest.scale.setScalar(1.4); this.#office.add(guest); this.#guests.push({guest, id: d.id});
    }
    this.#place(this.#office, this.#course.length); this.#office.name = 'sky:post-office'; this.#scene.add(this.#office);
  }
  update(run, dt, {reducedMotion = false} = {}) {
    const post = run.post, t = run.elapsed;
    for (const cargo of this.#cargo) cargo.group.visible = !post.delivered.has(cargo.id) && post.parcel?.id !== cargo.id && !post.arrival;
    for (const station of this.#stations) {
      const {delivery, group, friend, reaction, halo, symbol} = station;
      group.visible = delivery.s > run.s - 100 && delivery.s < run.s + 300;
      const delivered = post.delivered.has(delivery.id);
      reaction.visible = delivered;
      const age = post.lastDelivery?.id === delivery.id ? Math.min(1, (t - post.lastDelivery.time) * 2) : 1;
      reaction.scale.setScalar(Math.max(.01, reducedMotion ? 1 : age));
      friend.rotation.z = delivered && !reducedMotion ? Math.sin(t * 5) * .2 : 0;
      friend.position.y = -3.4 + (delivered && !reducedMotion ? Math.abs(Math.sin(t * 4)) * .6 : 0);
      halo.visible = !delivered;
      halo.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(t * 3) * .035);
      symbol.rotation.z = reducedMotion ? 0 : Math.sin(t * 1.4) * .08;
    }
    for (const [i, parcel] of this.#projectiles.entries()) {
      parcel.group.visible = post.parcel?.id === parcel.id;
      if (!post.arrival || post.delivered.has(parcel.id) || post.parcel?.id === parcel.id) continue;
      // The office accepts any remaining mail, so optional visits never block arrival.
      const k = Math.max(0, Math.min(1, (t - post.arrivalAt - i * .22) / 1.8));
      parcel.group.visible = k < 1;
      this.#place(parcel.group, THREE.MathUtils.lerp(run.s, this.#course.length + 10, k), run.x * (1 - k), run.y * (1 - k) + Math.sin(k * Math.PI) * 5 - k * 2);
      parcel.group.scale.setScalar(1.4);
    }
    this.#courier.visible = Boolean(post.parcel && !post.parcel.caught);
    if (post.parcel) {
      const p = post.parcel, target = this.#course.deliveries.find(d => d.id === p.id);
      const duration = p.caught ? POST.tossDuration : POST.returnDuration;
      const k = Math.min(1, p.age / duration), outbound = p.caught ? k : Math.sin(k * Math.PI);
      const returning = !p.caught && k > .5;
      const source = returning ? {s: run.s, x: run.x, y: run.y} : p.from;
      const s = THREE.MathUtils.lerp(source.s, target.s, outbound);
      const x = THREE.MathUtils.lerp(source.x, target.x + (p.caught ? 0 : 6), outbound);
      const y = THREE.MathUtils.lerp(source.y, target.y, outbound) + Math.sin(k * Math.PI) * 5;
      const projectile = this.#projectiles.find(parcel => parcel.id === p.id).group;
      this.#place(projectile, s, x, y); projectile.scale.setScalar(1.4);
      projectile.rotation.z += reducedMotion ? 0 : k * Math.PI;
      this.#courier.position.copy(projectile.position).addScaledVector(UP, .8);
      this.#courier.quaternion.copy(projectile.quaternion);
      this.#courier.scale.setScalar(1.7);
    }
    this.#office.visible = run.s > this.#course.length - 380;
    for (const {guest, id} of this.#guests) {
      guest.visible = post.delivered.has(id);
      guest.rotation.z = reducedMotion ? 0 : Math.sin(t * 5) * .18;
    }
  }
}
