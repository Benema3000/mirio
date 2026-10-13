// Der Raketenritt's figures, built from Miro's third set of drawings the way
// the Vulkanreise's are (volcano-creatures.js): his marker colours cut out as
// textures, his ink faces lifted off the paper.
//
//   Krakel        img/blaues-monster.jpg: a round blue head with an angry ink
//                 face and three long lumpy arms ending in black claws. Here
//                 it is huge, and the arms are what Mirio climbs.
//   Zischer       img/raketen-wesen.jpg: a black one-eyed rocket creature with
//                 raised clawed arms and a red and yellow jet flame. The eye
//                 is Miro's own, cut out of the paper.
//   Riesenstern   img/stern.jpg: a yellow four-pointed star with two dot eyes
//                 in a scribbled glow. The glow is Miro's strokes.
//
// Pixel rectangles are [x, y, w, h] in the 400x533 drawings in img/.
// Krakel's paths are in arena units: Krakel's feet at the origin, +Y out of
// the star, Krakel facing +Z. Their lengths are the climbs' in star-rules.js.

import * as THREE from 'three';
import { canvasTexture } from './art.js';
import { outlineMaterial, toon, withOutline } from './materials.js';
import { decal, marker, pencilCanvas, projectUV, swatch } from './mirio-model.js';

const INK = 0x1d1b22;

const KRAKEL = { image: 'krakel', skin: [225, 215, 20, 30], face: [130, 130, 100, 115], head: [120, 110, 135, 140] };
const ZISCHER = { image: 'zischer', skin: [165, 180, 30, 40], eye: [185, 120, 42, 52] };
const STERN = { image: 'stern', skin: [176, 258, 14, 30], center: [190, 240], tip: 57, eyes: [[195, 230], [197, 249]], eye: [13, 8] };

/** Krakel's head, standing and bowed down for the last climb. */
export const KRAKEL_HEAD = Object.freeze({ y: 27, bowedY: 9.5, r: 8.5 });
/** The arms' radius; Mirio walks on top of it. */
export const ARM_RADIUS = 1.5;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// Claw to shoulder, the way the drawing's limbs bulge out and hang down. The
// last point of each is the shoulder, under the head, where the tickle spot is.
const ARMS = [
  [V(-25, ARM_RADIUS, 13.5), V(-20.5, 5.5, 11.5), V(-14.5, 12.5, 8.5), V(-7, 19.5, 4)],
  [V(0, ARM_RADIUS, 28), V(0, 6, 22.5), V(0, 13, 15.5), V(0, 19, 7.5)],
  [V(25, ARM_RADIUS, 13.5), V(20.5, 5.5, 11.5), V(14.5, 12.5, 8.5), V(7, 19.5, 4)],
];
// Where the drawn arm disappears into the head, past the climb.
const INTO_HEAD = [V(-3.5, 23, 1.5), V(0, 22.5, 3.5), V(3.5, 23, 1.5)];
// Over the bowed head, from low on its face to the top.
const HEAD_ARC = [-38, 90];

/**
 * The four climbs, in arena units: {curve, center, offset}. Mirio stands
 * `offset` above the curve, along the arm's top (or, with a `center`, along
 * the head's radius).
 */
export function krakelPaths() {
  const arms = ARMS.map(points => ({ curve: new THREE.CatmullRomCurve3(points, false, 'centripetal'), center: null, offset: ARM_RADIUS }));
  const c = V(0, KRAKEL_HEAD.bowedY, 0), r = KRAKEL_HEAD.r, points = [];
  for (let i = 0; i <= 8; i++) {
    const a = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(HEAD_ARC[0], HEAD_ARC[1], i / 8));
    points.push(V(0, c.y + Math.sin(a) * r, Math.cos(a) * r));
  }
  return [...arms, { curve: new THREE.CatmullRomCurve3(points), center: c, offset: 0 }];
}

const tmpUp = new THREE.Vector3();
/**
 * A point on a climb, `u` from 0 (claw) to 1 (top): position, tangent up the
 * path, `up` out of the surface and `right` as seen from behind Mirio.
 */
export function pathFrame(path, u, out = { pos: V(0, 0, 0), tangent: V(0, 0, 0), up: V(0, 0, 0), right: V(0, 0, 0) }) {
  u = THREE.MathUtils.clamp(u, 0, 1);
  path.curve.getPointAt(u, out.pos);
  path.curve.getTangentAt(u, out.tangent);
  if (path.center) out.up.copy(out.pos).sub(path.center).normalize();
  else {
    tmpUp.set(0, 1, 0);
    // Mostly up, leaning back off the climb so a steep stretch still has a top.
    out.up.copy(tmpUp).addScaledVector(out.tangent, -tmpUp.dot(out.tangent));
    if (out.up.lengthSq() < 1e-4) out.up.set(0, 0, 1);
    out.up.normalize();
  }
  out.right.crossVectors(out.tangent, out.up).normalize();
  out.pos.addScaledVector(out.up, path.offset);
  return out;
}

const outline = (t = 0.04) => outlineMaterial(t);

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}

/** Drawing pixels `rect`, in colour, scaled by `k`. */
function crop(img, [x, y, w, h], k = 1) {
  const c = makeCanvas(w * k, h * k);
  c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w * k, h * k);
  return c;
}

/** Miro's ink face from `rect`, laid over the front of an ellipsoid head. */
function inkFace(img, rect, rx, ry, rz, width, cx = 0, cy = 0) {
  const front = new THREE.SphereGeometry(1, 32, 24, 0, Math.PI, 0.2, 2.7).scale(rx * 1.01, ry * 1.01, rz * 1.01);
  projectUV(front, rect, cx, cy, width / rect[2]);
  const canvas = pencilCanvas(img, rect, 3, { light: 120, range: 60 });
  // A clear frame: UVs are clamped, so edge texels would spread over the head.
  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);
  return new THREE.Mesh(front, decal(canvas));
}

/**
 * A tube along `curve` with the drawing's lumpy outline: the radius swells
 * and narrows every metre or so.
 */
function lumpyTube(curve, radius, segments = 72) {
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 12, false);
  const pos = geometry.attributes.position, centre = V(0, 0, 0), p = V(0, 0, 0);
  const length = curve.getLength();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(u, centre);
    const swell = 1 + 0.13 * Math.sin(u * length * 1.15) + 0.05 * Math.sin(u * length * 2.9 + 1);
    for (let j = 0; j <= 12; j++) {
      const k = i * 13 + j;
      p.fromBufferAttribute(pos, k).sub(centre).multiplyScalar(swell).add(centre);
      pos.setXYZ(k, p.x, p.y, p.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Three black hooked claws fanning out on the ground round `at`, pointing along `dir`. */
function claws(at, dir, size) {
  const group = new THREE.Group(), material = toon(INK);
  const side = V(0, 1, 0).cross(dir).normalize();
  for (let c = -1; c <= 1; c++) {
    const claw = new THREE.Mesh(new THREE.ConeGeometry(size * 0.22, size, 6).translate(0, size / 2, 0), material);
    const out = dir.clone().addScaledVector(side, c * 0.55).normalize();
    claw.position.copy(at).addScaledVector(out, size * 0.35).setY(size * 0.1);
    claw.quaternion.setFromUnitVectors(V(0, 1, 0), out.clone().setY(-0.25).normalize());
    group.add(withOutline(claw, outline(0.05)));
  }
  return group;
}

/**
 * Krakel. `head` bobs and bows; `arms[i].group` is pivoted at that arm's
 * shoulder, so scaling it curls the arm up under the head.
 */
export function buildKrakel(art, paths = krakelPaths()) {
  const img = art.images[KRAKEL.image];
  const skin = marker(swatch(img, KRAKEL.skin), 6, 6);
  const group = new THREE.Group();
  const head = new THREE.Group();
  head.position.y = KRAKEL_HEAD.y;
  group.add(head);
  const r = KRAKEL_HEAD.r;
  head.add(withOutline(new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28).scale(r, r * 0.97, r * 0.95), skin), outline(0.09)));
  // The face sits on the head where it sits on the paper.
  const unit = (2 * r) / KRAKEL.head[2], centre = (rect) => [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2];
  const [fx, fy] = centre(KRAKEL.face), [hx, hy] = centre(KRAKEL.head);
  head.add(inkFace(img, KRAKEL.face, r, r * 0.97, r * 0.95, KRAKEL.face[2] * unit, (fx - hx) * unit, -(fy - hy) * unit));

  const arms = paths.slice(0, 3).map((path, i) => {
    const points = [...path.curve.points, INTO_HEAD[i]];
    const shoulder = path.curve.points.at(-1);
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const pivot = new THREE.Group();
    pivot.position.copy(shoulder);
    const tube = withOutline(new THREE.Mesh(lumpyTube(curve, ARM_RADIUS).translate(-shoulder.x, -shoulder.y, -shoulder.z), skin), outline(0.07));
    pivot.add(tube);
    const foot = points[0], out = foot.clone().setY(0).sub(V(0, 0, 0)).normalize();
    const hand = claws(foot.clone().setY(0), out, ARM_RADIUS * 2.2);
    hand.position.sub(shoulder);
    pivot.add(hand);
    group.add(pivot);
    return { group: pivot, tube, shoulder: shoulder.clone() };
  });
  return { group, head, arms };
}

/** The bulge Krakel shakes down an arm: a ring round it. */
export function buildWave(art) {
  const img = art.images[KRAKEL.image];
  const material = marker(swatch(img, KRAKEL.skin), 4, 1);
  material.emissive = new THREE.Color(0x10306a);
  return withOutline(new THREE.Mesh(new THREE.TorusGeometry(ARM_RADIUS * 1.08, 0.55, 10, 28), material), outline(0.05));
}

/** A Zischer, about Mirio's height: `group` is placed, `flame` flickers, `arms` wave. */
export function buildZischer(art) {
  const img = art.images[ZISCHER.image];
  const skin = marker(swatch(img, ZISCHER.skin), 2, 2);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  // The bullet: round on top, straight down to a flat bottom.
  const profile = [[0, 2.3], [0.22, 2.25], [0.4, 2.1], [0.52, 1.85], [0.58, 1.5], [0.6, 0.9], [0.6, 0.35], [0.55, 0.3], [0, 0.3]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  body.add(withOutline(new THREE.Mesh(new THREE.LatheGeometry(profile, 20), skin), outline(0.035)));
  // Miro's eye: white triangle, black pupil, cut out of the paper with some black round it.
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.605, 0.605, 0.75, 16, 1, true, -0.75, 1.5).translate(0, 1.65, 0), toon(0xffffff, { map: canvasTexture(crop(img, ZISCHER.eye, 3)) }));
  projectUV(eye.geometry, ZISCHER.eye, 0, 1.65, 0.75 / ZISCHER.eye[3]);
  // The cylinder's front is +Z; project from there.
  body.add(eye);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.5, 1.25, 0);
    arm.rotation.z = side * -0.9;
    arm.add(withOutline(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.65, 4, 8).translate(0, 0.42, 0), skin), outline(0.03)));
    for (let c = -1; c <= 1; c++) {
      const finger = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 5).translate(0, 0.12, 0), toon(INK));
      finger.position.set(c * 0.09, 0.85, 0);
      finger.rotation.z = c * 0.45;
      arm.add(finger);
    }
    body.add(arm);
    arms.push(arm);
  }
  // The jet: red outside, yellow inside, pointing down.
  const flame = new THREE.Group();
  flame.add(new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 10).rotateX(Math.PI).translate(0, -0.45, 0), new THREE.MeshBasicMaterial({ color: 0xe0262f })));
  flame.add(new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.0, 10).rotateX(Math.PI).translate(0, -0.25, 0.05), new THREE.MeshBasicMaterial({ color: 0xf6e64e })));
  flame.position.y = 0.3;
  body.add(flame);
  return { group, body, flame, arms };
}

/** Miro's yellow scribbles alone, on transparent: the star's glow. */
function glowCanvas(img) {
  const c = makeCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height), d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    // Yellow marker is short of blue; the bluish paper is not.
    const yellow = THREE.MathUtils.clamp(((d[i] + d[i + 1]) / 2 - d[i + 2] - 10) / 60, 0, 1);
    d[i] = 255; d[i + 1] = 226; d[i + 2] = 92;
    d[i + 3] = yellow * 255;
  }
  ctx.putImageData(px, 0, 0);
  return c;
}

/** A four-pointed star outline: tips at radius `tip`, waist at `waist`, gently curved in. */
function starShape(tip, waist) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, b = a + Math.PI / 4;
    const t = V(Math.cos(a) * tip, Math.sin(a) * tip, 0), w = V(Math.cos(b) * waist, Math.sin(b) * waist, 0);
    const next = V(Math.cos(a + Math.PI / 2) * tip, Math.sin(a + Math.PI / 2) * tip, 0);
    if (i === 0) shape.moveTo(t.x, t.y);
    // Curved in a little, like a felt-pen star.
    const c1 = t.clone().lerp(w, 0.5).multiplyScalar(0.86), c2 = w.clone().lerp(next, 0.5).multiplyScalar(0.86);
    shape.quadraticCurveTo(c1.x, c1.y, w.x, w.y);
    shape.quadraticCurveTo(c2.x, c2.y, next.x, next.y);
  }
  return shape;
}

/**
 * The Riesenstern, lying in the XY plane with its face towards +Z at z = 0.
 * Returns {group, tip, waist, eyes}: `waist` is the radius of its inner corners.
 */
export function buildRiesenstern(art, tip = 240) {
  const img = art.images[STERN.image];
  const k = tip / STERN.tip, waist = tip * 0.36, depth = 26, bevel = 16;
  const skin = marker(swatch(img, STERN.skin), 1, 1);
  skin.map.repeat.set(1 / 18, 1 / 18);
  skin.emissive = new THREE.Color(0x8a6a00);
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(tip, waist), {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 10,
  }).translate(0, 0, -depth - bevel), skin);
  group.add(withOutline(body, outline(0.6)));
  // Miro's two dot eyes, one above the other, right of the middle.
  const eyes = STERN.eyes.map(([x, y]) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12).scale(STERN.eye[0] * k / 2, STERN.eye[1] * k / 2, 3), toon(INK));
    eye.position.set((x - STERN.center[0]) * k, -(y - STERN.center[1]) * k, 0);
    group.add(eye);
    return eye;
  });
  // The glow: the drawing's scribbles, behind the star, sized so its star matches this one.
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * k, h * k), new THREE.MeshBasicMaterial({
    map: canvasTexture(glowCanvas(img)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.position.set((w / 2 - STERN.center[0]) * k, -(h / 2 - STERN.center[1]) * k, -depth - bevel * 2 - 4);
  group.add(glow);
  return { group, tip, waist, eyes, glow };
}
