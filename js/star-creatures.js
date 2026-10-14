// Der Raketenritt's figures, built from Miro's third set of drawings the way
// the Vulkanreise's are (volcano-creatures.js): his marker colours cut out as
// textures, his ink faces lifted off the paper.
//
//   Krakel        img/blaues-monster.jpg: a round blue head with an angry ink
//                 face on three long lumpy arms ending in black claws. Built
//                 from the very lumps the fight stands Mirio on
//                 (krakel-rules.js armLumps), so what you see is what you climb.
//   Zischer       img/raketen-wesen.jpg: a black one-eyed rocket creature with
//                 raised clawed arms and a red and yellow jet flame. The eye
//                 is Miro's own, cut out of the paper.
//   Riesenstern   img/stern.jpg: a yellow four-pointed star with two dot eyes
//                 in a scribbled glow. The planet is in star-level.js; here are
//                 its points, its eyes and the glow, which is Miro's strokes.
//
// Pixel rectangles are [x, y, w, h] in the 400x533 drawings in img/.

import * as THREE from 'three';
import { canvasTexture } from './art.js';
import { telegraphs } from './enemies.js';
import { KRAKEL, armLumps, armSpot, neckLumps } from './krakel-rules.js';
import { outlineMaterial, toon, withOutline } from './materials.js';
import { decal, marker, pencilCanvas, projectUV, swatch } from './mirio-model.js';

const INK = 0x1d1b22;

const KRAKEL_ART = { image: 'krakel', skin: [225, 215, 20, 30], face: [130, 130, 100, 115], head: [120, 110, 135, 140] };
const ZISCHER = { image: 'zischer', skin: [165, 180, 30, 40], eye: [185, 120, 42, 52] };
export const STERN = Object.freeze({ image: 'stern', skin: [176, 258, 14, 30], center: [190, 240], tip: 57 });

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

/** Miro's ink face from `rect`, laid over the front (+Z) of an ellipsoid head. */
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

/** One mesh of many spheres: an arm's lumps. */
function lumpsGeometry(lumps) {
  const parts = lumps.map(l => new THREE.SphereGeometry(l.radius, 20, 14).translate(l.x, l.height, l.z));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    out.setAttribute(name, new THREE.BufferAttribute(new Float32Array(parts.flatMap(g => [...g.attributes[name].array])), name === 'uv' ? 2 : 3));
  }
  const index = [];
  let base = 0;
  for (const g of parts) { for (const i of g.index.array) index.push(base + i); base += g.attributes.position.count; }
  out.setIndex(index);
  parts.forEach(g => g.dispose());
  return out;
}

/** Three black hooked claws round a claw lump, gripping the ground outwards. */
function claws(lump, size) {
  const group = new THREE.Group(), material = toon(INK);
  const out = new THREE.Vector3(lump.x, 0, lump.z).normalize(), side = new THREE.Vector3(out.z, 0, -out.x);
  for (let c = -1; c <= 1; c++) {
    const claw = new THREE.Mesh(new THREE.ConeGeometry(size * 0.2, size, 6).translate(0, size / 2, 0), material);
    const dir = out.clone().addScaledVector(side, c * 0.6).normalize();
    claw.position.set(lump.x, 0.25, lump.z).addScaledVector(dir, lump.radius * 0.8);
    claw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().setY(-0.3).normalize());
    group.add(withOutline(claw, outline(0.05)));
  }
  return group;
}

/**
 * Krakel, in the arena's frame (+Y up, +Z towards the way in, origin on the
 * arena's centre). `head` moves (rules' head.height is its centre) and turns
 * to Mirio; `arms[i].group` is pivoted where the neck meets the head, so
 * scaling it curls the arm up; `arms[i].spot` is the glow on the knob.
 */
export function buildKrakel(art) {
  const img = art.images[KRAKEL_ART.image];
  const skin = marker(swatch(img, KRAKEL_ART.skin), 6, 6);
  const group = new THREE.Group();
  const head = new THREE.Group();
  head.position.y = KRAKEL.head.height;
  group.add(head);
  const r = KRAKEL.head.radius, ball = new THREE.Group();
  head.add(ball);
  ball.add(withOutline(new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28), skin), outline(0.1)));
  // The face sits on the head where it sits on the paper.
  const unit = (2 * r) / KRAKEL_ART.head[2], centre = (rect) => [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2];
  const [fx, fy] = centre(KRAKEL_ART.face), [hx, hy] = centre(KRAKEL_ART.head);
  ball.add(inkFace(img, KRAKEL_ART.face, r, r, r, KRAKEL_ART.face[2] * unit, (fx - hx) * unit, -(fy - hy) * unit));
  // The mouth, where the ink comes from: low on the face.
  const mouth = new THREE.Object3D();
  mouth.position.set((187 - hx) * unit, -(218 - hy) * unit, r * 0.86);
  ball.add(mouth);

  const spotMaterial = new THREE.MeshBasicMaterial({ color: 0xffd6f2, transparent: true, opacity: 0.9 });
  const arms = KRAKEL.arms.map((_, i) => {
    const lumps = [...armLumps(i), ...neckLumps(i)], top = neckLumps(i).at(-1);
    const pivot = new THREE.Group();
    pivot.position.set(top.x, top.height, top.z);
    const body = withOutline(new THREE.Mesh(lumpsGeometry(lumps).translate(-top.x, -top.height, -top.z), skin), outline(0.07));
    pivot.add(body);
    const hand = claws(lumps[0], KRAKEL.arm.radius * 2);
    hand.position.set(-top.x, -top.height, -top.z);
    pivot.add(hand);
    // The glowing spot: a soft blister on top of the knob.
    const s = armSpot(i), spot = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), spotMaterial.clone());
    spot.position.set(s.x - top.x, s.height - top.height - 0.1, s.z - top.z);
    pivot.add(spot);
    group.add(pivot);
    return { group: pivot, body, spot, top: pivot.position.clone() };
  });
  return { group, head, ball, mouth, arms };
}

/** An ink blob Krakel spits, and the mark where it will land. */
export function buildInk() {
  const blob = withOutline(new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 10), toon(0x16336e, { emissive: 0x06142e })), outline(0.04));
  const mark = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x2a5fd0, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
  return { blob, mark };
}

/** A ring wave across the arena: a flat blue band, scaled to its radius. */
export function buildRingWave() {
  return new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 64).rotateX(Math.PI / 2).scale(1, 4, 1),
    new THREE.MeshBasicMaterial({ color: 0x5fa0ff, transparent: true, opacity: 0.85, depthWrite: false }));
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
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.605, 0.605, 0.75, 16, 1, true, -0.75, 1.5).translate(0, 1.65, 0),
    toon(0xffffff, { map: canvasTexture(crop(img, ZISCHER.eye, 3)) }));
  projectUV(eye.geometry, ZISCHER.eye, 0, 1.65, 0.75 / ZISCHER.eye[3]);
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

/**
 * A Zischer patrolling the star for enemies.js: small, hovering a little
 * over the ground on its flame; stomp it or spin it like a Grummel.
 */
export function buildZischerWalker(kind, art) {
  const z = buildZischer(art), group = new THREE.Group(), lift = new THREE.Group();
  lift.position.y = 0.45;
  lift.scale.setScalar(0.62);
  lift.add(z.group);
  group.add(lift);
  return { group, body: z.body, flame: z.flame, arms: z.arms, ...telegraphs(group) };
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

/**
 * The Riesenstern's points, eyes and glow round a planet of `radius` at the
 * origin. `points` are unit directions; `eyes` [{dir, size}] lie on the ground.
 */
export function buildStarDressing(art, { radius, points, length, base, eyes }) {
  const img = art.images[STERN.image];
  const group = new THREE.Group();
  const skin = marker(swatch(img, STERN.skin), 2, 6);
  skin.emissive = new THREE.Color(0x5a4200);
  const Y = new THREE.Vector3(0, 1, 0);
  for (const dir of points) {
    const cone = withOutline(new THREE.Mesh(new THREE.ConeGeometry(base, length, 32, 6).translate(0, length / 2, 0), skin), outline(0.25));
    cone.position.copy(dir).multiplyScalar(radius - 4);
    cone.quaternion.setFromUnitVectors(Y, dir);
    group.add(cone);
  }
  for (const { dir, size } of eyes) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12).scale(size[0], 0.35, size[1]), toon(INK));
    eye.position.copy(dir).multiplyScalar(radius + 0.02);
    eye.quaternion.setFromUnitVectors(Y, dir);
    group.add(eye);
  }
  // The glow: the drawing's scribbles, sized so its star matches this one and centred on it.
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, k = (radius + length) / STERN.tip;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture(glowCanvas(img)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.center.set(STERN.center[0] / w, 1 - STERN.center[1] / h);
  glow.scale.set(w * k, h * k, 1);
  group.add(glow);
  return { group, glow };
}
