// The Vulkanreise's creatures, built from Miro's second set of drawings the
// way Mirio is (mirio-model.js): his marker colours cut out as textures, his
// ink faces lifted off the paper onto round 3D heads. A few details are our
// own on purpose: the Schnappblume's head has no spots, Glutzahn wears a
// purple shell and an orange crest, and the Stachelkreisel is an orange
// spiky top.
//
// Every builder returns {group, body}: `group` is placed on the planet,
// `body` is what bobs, squashes and turns (see enemies.js, volcano-run.js).
// Pixel rectangles are [x, y, w, h] in the 400x533 drawings in img/.

import * as THREE from 'three';
import { telegraphs } from './enemies.js';
import { outlineMaterial, toon, withOutline } from './materials.js';
import { decal, marker, pencilCanvas, projectUV, swatch } from './mirio-model.js';

const INK = 0x2a2226;

const GRUMMEL = { image: 'grummel', body: [110, 230, 40, 50], face: [110, 165, 160, 145] };
const GRUMMELCHEN = { image: 'grummelKlein', body: [145, 225, 14, 22], feet: [120, 300, 60, 30], face: [135, 195, 130, 90] };
const PLANT = { image: 'schnappblume', head: [155, 90, 20, 20], stem: [180, 200, 15, 60], pot: [150, 370, 70, 60], face: [150, 50, 95, 75] };
const BOSS = { image: 'glutzahn', body: [250, 250, 35, 30], face: [245, 138, 70, 55] };

const outline = () => outlineMaterial(0.03);
const ellipsoid = (rx, ry, rz, w = 20, h = 14) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);

/** Miro's ink face from `rect`, laid over the front of an ellipsoid head. */
function face(img, rect, rx, ry, rz, cy = 0) {
  const front = new THREE.SphereGeometry(1, 20, 16, 0, Math.PI, 0.25, 2.6).scale(rx * 1.015, ry * 1.015, rz * 1.015);
  // The drawing's face spans the head's width.
  projectUV(front, rect, 0, cy, (rx * 2) / rect[2]);
  // Photos on grey paper: keep only Miro's dark marker lines.
  const canvas = pencilCanvas(img, rect, 3, { light: 140, range: 60 });
  return new THREE.Mesh(front, decal(canvas));
}

/** Grummel (big, brown) or Grummelchen (small, yellow): a grumpy round walker on two feet. */
export function buildGrummel(kind, art) {
  const small = kind === 'grummelchen';
  const spec = small ? GRUMMELCHEN : GRUMMEL;
  const img = art.images[spec.image];
  const skin = marker(swatch(img, spec.body), 2, 2);
  const feetSkin = spec.feet ? marker(swatch(img, spec.feet), 1, 1) : skin, feet = [];
  const s = small ? 0.72 : 1;
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const head = new THREE.Group();
  head.position.y = 0.78 * s;
  body.add(head);
  head.add(withOutline(new THREE.Mesh(ellipsoid(0.72 * s, 0.66 * s, 0.62 * s), skin), outline()));
  head.add(face(img, spec.face, 0.72 * s, 0.66 * s, 0.62 * s, 0));
  for (const side of [-1, 1]) {
    const foot = withOutline(new THREE.Mesh(ellipsoid(0.3 * s, 0.2 * s, 0.36 * s), feetSkin), outline());
    foot.position.set(side * 0.34 * s, 0.18 * s, 0.1 * s);
    body.add(foot);
    feet.push(foot);
  }
  return { group, body, feet, ...telegraphs(group) };
}

/** The Schnappblume: a biting flower on a green stem in a brown pot. */
export function buildSchnappblume(art) {
  const img = art.images[PLANT.image];
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const pot = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.9, 20).translate(0, 0.45, 0),
    marker(swatch(img, PLANT.pot), 2, 1)), outline());
  body.add(pot);
  const green = marker(swatch(img, PLANT.stem), 1, 4);
  const stem = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(0.15, 1.5, 0), new THREE.Vector3(-0.1, 2.1, 0), new THREE.Vector3(0, 2.55, 0)]);
  body.add(withOutline(new THREE.Mesh(new THREE.TubeGeometry(stem, 16, 0.09, 6), green), outline()));
  for (const [side, y] of [[1, 1.45], [-1, 1.95]]) {
    const leaf = withOutline(new THREE.Mesh(ellipsoid(0.34, 0.1, 0.16), green), outline());
    leaf.position.set(side * 0.3, y, 0);
    leaf.rotation.z = side * 0.35;
    body.add(leaf);
  }
  // The head snaps: volcano-run.js opens and shuts `jaw` and turns `head`.
  const head = new THREE.Group();
  head.position.y = 2.75;
  body.add(head);
  const red = marker(swatch(img, PLANT.head), 2, 2);
  head.add(withOutline(new THREE.Mesh(ellipsoid(0.55, 0.45, 0.5), red), outline()));
  head.add(face(img, PLANT.face, 0.55, 0.45, 0.5, 0));
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.12, 0.1);
  head.add(jaw);
  jaw.add(withOutline(new THREE.Mesh(ellipsoid(0.46, 0.2, 0.42).translate(0, -0.12, 0.05), red), outline()));
  const teeth = [];
  for (let i = -2; i <= 2; i++) teeth.push(new THREE.ConeGeometry(0.05, 0.13, 4).translate(i * 0.13, 0.02, 0.42));
  for (const t of teeth) jaw.add(new THREE.Mesh(t, toon(0xfff8ec)));
  return { group, body, head, jaw };
}

/** The Stachelkreisel: an orange spiky top that Glutzahn spins across the arena. */
export function buildStachelkreisel() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  body.add(withOutline(new THREE.Mesh(ellipsoid(0.62, 0.42, 0.62).translate(0, 0.42, 0), toon(0xff7a3d)), outline()));
  const spikes = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 6), toon(0xfff1d0));
    spike.position.set(Math.cos(a) * 0.62, 0.42, Math.sin(a) * 0.62);
    spike.rotation.set(0, 0, 0);
    spike.lookAt(Math.cos(a) * 2, 0.42, Math.sin(a) * 2);
    spike.rotateX(Math.PI / 2);
    spikes.add(spike);
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 8).translate(0, 0.92, 0), toon(0xfff1d0));
  body.add(spikes, cap);
  return { group, body };
}

/**
 * Glutzahn: Miro's fire-breathing boss. A yellow body leaning forward, a
 * purple shell with cream spikes on its back, an orange crest, black claws.
 * `head` turns to breathe; `mouth` marks where the fire comes out.
 */
export function buildGlutzahn(art) {
  const img = art.images[BOSS.image];
  const skin = marker(swatch(img, BOSS.body), 2, 2);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const S = 1.9;
  body.scale.setScalar(S);

  const torso = withOutline(new THREE.Mesh(ellipsoid(0.62, 0.72, 0.55).translate(0, 1.15, 0), skin), outline());
  body.add(torso);
  // The shell on the back, with a ring of spikes.
  const shell = withOutline(new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55)
    .rotateX(-Math.PI / 2).scale(1, 1.05, 0.8).translate(0, 1.2, -0.3), toon(0x6b4bb0)), outline());
  body.add(shell);
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.45 + (i / 8) * Math.PI * 0.9;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 6), toon(0xfff1d0));
    spike.position.set(Math.sin(a) * 0.62, 1.2 + Math.cos(a) * 0.62, -0.75);
    spike.rotation.x = -Math.PI / 2;
    spike.rotation.z = -a;
    body.add(spike);
  }
  const head = new THREE.Group();
  head.position.set(0, 2.05, 0.25);
  body.add(head);
  head.add(withOutline(new THREE.Mesh(ellipsoid(0.42, 0.38, 0.4), skin), outline()));
  head.add(face(img, BOSS.face, 0.42, 0.38, 0.4, 0));
  for (let i = -2; i <= 2; i++) {
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 6), toon(0xff9a2e));
    tuft.position.set(i * 0.1, 0.42, -0.08 - Math.abs(i) * 0.03);
    tuft.rotation.set(-0.35, 0, i * 0.18);
    head.add(tuft);
  }
  const mouth = new THREE.Object3D();
  mouth.position.set(0, -0.12, 0.42);
  head.add(mouth);
  const limbs = {};
  for (const [key, side] of [['L', 1], ['R', -1]]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.55, 1.45, 0.2);
    body.add(arm);
    arm.add(withOutline(new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.35, 4, 8).rotateX(Math.PI / 2.4).translate(0, -0.05, 0.22), skin), outline()));
    for (let c = -1; c <= 1; c++) arm.add(new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 4).rotateX(Math.PI / 2).translate(c * 0.06, -0.12, 0.5), toon(INK)));
    const leg = new THREE.Group();
    leg.position.set(side * 0.32, 0.55, 0);
    body.add(leg);
    leg.add(withOutline(new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 4, 8).translate(0, -0.28, 0.05), skin), outline()));
    for (let c = -1; c <= 1; c++) leg.add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4).rotateX(Math.PI / 2).translate(c * 0.08, -0.52, 0.3), toon(INK)));
    limbs[`arm${key}`] = arm;
    limbs[`leg${key}`] = leg;
  }
  return { group, body, head, mouth, scale: S, ...limbs };
}
