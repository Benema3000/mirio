// Mirio: Miro's drawing of Mirio, rebuilt as a little 3D toy.
//
// Everything is measured off img/mirio.png (433x577); pixel positions in the
// comments are drawing pixels, PX turns them into model units. The colours
// are Miro's own marker strokes, cut out of the drawing as textures. His
// pencil face is lifted off the paper and laid over the front of the head, the
// cap emblem likewise. Origin at the feet, +Y up, facing +Z; "L" is Mirio's
// own left, the +X side.

import * as THREE from 'three';
import { canvasTexture } from './art.js';
import { outlineMaterial, toon, withOutline } from './materials.js';

// 2.3 units from the nub of the cap (y 26) to the soles (y 530).
const PX = 2.3 / 504;
const SOLE_Y = 530;

const PAPER = '#fffdf5';
const PENCIL = [48, 44, 54];

const NECK_Y = 1.3;
// Head centre above the neck, and the radii: a wide oval face.
const HEAD = { y: 0.22, rx: 0.42, ry: 0.37, rz: 0.37 };
const SHOULDER = { x: 0.27, y: 1.14 };
const HIP = { x: 0.15, y: 0.58 };
const ARM_LENGTH = 0.44;
// The elbow, below the shoulder; the sleeve bends here.
const ELBOW_Y = -0.2;
// Out from hanging straight down: ~57 deg like the drawing, and up in a V.
const ARM_REST = 1.0;
const ARM_RAISED = 2.45;

// Solid marker patches: [x, y, w, h] in drawing pixels.
const SHIRT = [150, 250, 100, 105];
const BAND = [150, 363, 95, 13];
const TROUSERS = [135, 405, 37, 65];
const SHOES = [135, 478, 40, 47];
const HAIR = [195, 112, 35, 26];
const CAP = [250, 62, 48, 60];

// The face, centred on x 207 between the eyes, and the two sides of its
// pencil oval, which get rubbed out: on a round head the pen outline draws
// that edge.
const FACE = [112, 118, 190, 146];
const FACE_SCALE = 4;
const OVAL = [
  [[142, 160], [135, 180], [126, 200], [127, 220], [135, 238], [148, 248]],
  [[281, 140], [284, 170], [288, 190], [286, 210], [277, 225], [266, 235], [258, 240]],
];
// The white badge with the red curl inside, and the oval that frames it.
const EMBLEM = [192, 46, 48, 74];
const EMBLEM_OVAL = { x: 216, y: 84, rx: 20, ry: 33 };

/**
 * Which drawing dresses the toy, and where its parts are on the paper. The
 * body is the same toy for every look; only the marker colours, the face
 * and the skin change. `facePx` scales face pixels to model units and
 * `faceY` centres the face on the head.
 */
export const MIRIO_LOOK = Object.freeze({
  image: 'mirio', shirt: SHIRT, band: BAND, trousers: TROUSERS, shoes: SHOES, hair: HAIR, cap: CAP, skin: null,
  face: FACE, faceScale: FACE_SCALE, oval: OVAL, facePx: PX, faceY: (SOLE_Y - (FACE[1] + FACE[3] / 2)) * PX - NECK_Y - HEAD.y,
});
/**
 * Miro's second drawing (img/mirio-gross.jpg, 600x800): Mirio grown up and
 * tall, arms stretched out, in a red shirt and blue dungarees with two
 * straps and two buttons. A toy of its own (buildTallMirio); the rectangles
 * are pixels of that photo. The cap keeps Mirio's curl badge from the first
 * drawing.
 */
export const BIG_MIRIO_LOOK = Object.freeze({
  image: 'mirioGross', tall: true,
  shirt: [250, 345, 70, 55], trousers: [230, 460, 110, 90], shoes: [165, 728, 45, 25], cap: [215, 120, 35, 30],
  skin: [336, 284, 16, 16], hair: [197, 240, 16, 28], button: [239, 430, 11, 9],
  // The painted face (eyes, moustache, mouth, brown sideburns), cut out on
  // the oval of the face: centre and radii in drawing pixels.
  face: [184, 172, 216, 152], faceOval: { x: 294, y: 252, rx: 102, ry: 80 },
});

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}

/** Drawing pixels `rect`, scaled by `k`, on a canvas of their own. */
function cut(img, [x, y, w, h], k = 1) {
  const c = makeCanvas(w * k, h * k);
  c.getContext('2d', { willReadFrequently: true }).drawImage(img, x, y, w, h, 0, 0, w * k, h * k);
  return c;
}

/**
 * A patch of solid marker as a tiling texture. The few specks of bare paper
 * get the patch's average colour (transparent texels would render black), and
 * mirrored wrapping makes every edge meet its own reflection, so no seams.
 * A light wash of that average tones the strokes down a little: at full
 * contrast the mirror folds show as a kaleidoscope.
 */
function swatch(img, rect) {
  const c = cut(img, rect);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    for (let k = 0; k < 3; k++) sum[k] += data[i + k];
    n++;
  }
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = `rgb(${sum.map((s) => Math.round(s / Math.max(n, 1))).join(',')})`;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.3;
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = canvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  return tex;
}

/**
 * Toon material with `tex` repeated u x v times. Keep u even on anything that
 * wraps round: mirrored, an even count ends on the texel it started with, so
 * the seam disappears.
 */
function marker(tex, u, v) {
  const map = tex.clone();
  map.repeat.set(u, v);
  return toon(0xffffff, { map });
}

/**
 * Keeps only the pencil of `rect`: grey, never warm. Marker red, hair brown
 * and trouser blue turn transparent. Light pencil is darkened and every line
 * thickened a little, or the face would fade out at game distance.
 */
function pencilCanvas(img, rect, k, { light = 225, range = 100 } = {}) {
  const c = cut(img, rect, k);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const px = ctx.getImageData(0, 0, c.width, c.height);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
    const grey = Math.max(r, g, b) - Math.min(r, g, b) < 45 && r - b < 12;
    const lum = 0.3 * r + 0.59 * g + 0.11 * b;
    const ink = grey ? THREE.MathUtils.clamp((light - lum) / range, 0, 1) : 0;
    [d[i], d[i + 1], d[i + 2]] = PENCIL;
    d[i + 3] *= ink;
  }
  ctx.putImageData(px, 0, 0);

  const out = makeCanvas(c.width, c.height);
  const o = out.getContext('2d');
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) o.drawImage(c, dx * k * 0.5, dy * k * 0.5);
  return out;
}

function faceCanvas(img, look) {
  const { face, faceScale: k } = look;
  const c = pencilCanvas(img, face, k, look.ink);
  const ctx = c.getContext('2d');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = 18 * k;
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const line of look.oval) {
    ctx.beginPath();
    for (const [x, y] of line) ctx.lineTo((x - face[0]) * k, (y - face[1]) * k);
    ctx.stroke();
  }
  // A clear frame: UVs are clamped, so the edge texels spread over the rest of the decal.
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, c.width, c.height);
  return c;
}

function emblemCanvas(img) {
  const k = 4;
  const c = cut(img, EMBLEM, k);
  const ctx = c.getContext('2d');
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-in';
  const { x, y, rx, ry } = EMBLEM_OVAL;
  ctx.beginPath();
  ctx.ellipse((x - EMBLEM[0]) * k, (y - EMBLEM[1]) * k, rx * k, ry * k, 0, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

/**
 * Projects a drawing rectangle straight along Z onto `geom`: from the front
 * it looks exactly like the paper, wherever the surface curves away. The
 * rectangle's centre lands on (cx, cy) of the geometry.
 */
function projectUV(geom, rect, cx, cy, px = PX) {
  const [, , w, h] = rect;
  const pos = geom.attributes.position;
  const uv = geom.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - cx) / (w * px) + 0.5;
    const v = (pos.getY(i) - cy) / (h * px) + 0.5;
    uv.setXY(i, THREE.MathUtils.clamp(u, 0, 1), THREE.MathUtils.clamp(v, 0, 1));
  }
  uv.needsUpdate = true;
  return geom;
}

function decal(canvas) {
  return toon(0xffffff, { map: canvasTexture(canvas), transparent: true, alphaTest: 0.02 });
}

function ellipsoid(rx, ry, rz, w = 16, h = 12) {
  return new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
}

/** Lathe from [radius, y] pairs, squeezed front-to-back by `depth`. */
function lathe(profile, depth, segments = 20, phiStart, phiLength) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, segments, phiStart, phiLength).scale(1, 1, depth);
}

/** One geometry from several (same attributes), so a hand is one draw call. */
function merge(geoms) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const size = geoms[0].attributes[name].itemSize;
    const all = new Float32Array(geoms.reduce((n, g) => n + g.attributes[name].array.length, 0));
    let offset = 0;
    for (const g of geoms) {
      all.set(g.attributes[name].array, offset);
      offset += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(all, size));
  }
  const index = [];
  let base = 0;
  for (const g of geoms) {
    for (const i of g.index.array) index.push(base + i);
    base += g.attributes.position.count;
  }
  out.setIndex(index);
  return out;
}

function mesh(geom, material, outline) {
  const m = new THREE.Mesh(geom, material);
  return outline ? withOutline(m, outline) : m;
}

/**
 * A limb hanging from a joint at (x, y). The caller's rotation.x must swing
 * it forward (+Z), but a plain group swings a hanging limb backward for a
 * positive angle. So the joint sits between two half-turns about Y: they
 * cancel for the limb itself and mirror the swing, and the caller's
 * rotation.z with it.
 */
function joint(parent, x, y) {
  const socket = new THREE.Group();
  socket.position.set(x, y, 0);
  socket.rotation.y = Math.PI;
  const pivot = new THREE.Group();
  const limb = new THREE.Group();
  limb.rotation.y = Math.PI;
  parent.add(socket);
  socket.add(pivot);
  pivot.add(limb);
  return { pivot, limb };
}

/** Five long spiky pencil fingers fanning out below the palm. */
function fingerFan(side, palmY) {
  const fingers = [
    [-56, 0.26, 0.3],
    [-28, 0.33, 0.1],
    [0, 0.36, 0],
    [27, 0.33, -0.1],
    [54, 0.27, -0.25],
  ];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  return merge(fingers.map(([deg, len, curl]) => {
    const a = THREE.MathUtils.degToRad(deg) * side;
    const dir = new THREE.Vector3(Math.sin(a), -Math.cos(a), curl).normalize();
    const stroke = new THREE.CylinderGeometry(0.012, 0.026, len, 5, 1, true).translate(0, len / 2, 0);
    stroke.applyQuaternion(q.setFromUnitVectors(up, dir));
    return stroke.translate(dir.x * 0.03, palmY + dir.y * 0.03, dir.z * 0.03);
  }));
}

/**
 * The sleeve in two: upper arm and forearm, whose round ends overlap at the
 * elbow, so a straight arm looks like the one sleeve it always was. The palm
 * and the fingers turn together at the wrist. Returns the joints to animate.
 */
function buildArm(limb, side, mats) {
  limb.add(mesh(new THREE.CapsuleGeometry(0.078, 0.16, 4, 10).translate(0, -0.12, 0), mats.sleeve, mats.thin));
  const elbow = new THREE.Group();
  elbow.position.y = ELBOW_Y;
  limb.add(elbow);
  elbow.add(mesh(new THREE.CapsuleGeometry(0.078, 0.14, 4, 10).translate(0, -0.07, 0), mats.sleeve, mats.thin));
  const hand = new THREE.Group();
  hand.position.y = -ARM_LENGTH - ELBOW_Y;
  elbow.add(hand);
  hand.add(mesh(ellipsoid(0.07, 0.06, 0.055, 10, 8), mats.shoe, mats.thin));
  hand.add(new THREE.Mesh(fingerFan(side, 0), mats.finger));
  return { elbow, hand };
}

function buildLeg(limb, mats) {
  const leg = new THREE.CapsuleGeometry(0.105, 0.3, 4, 10).translate(0, -0.22, 0);
  limb.add(mesh(leg, mats.trousers, mats.thin));
  // Chunky shoe, sole on the ground, toe forward.
  const shoe = mesh(ellipsoid(0.135, 0.125, 0.2), mats.shoe, mats.thin);
  shoe.position.set(0, 0.125 - HIP.y, 0.06);
  limb.add(shoe);
}

/**
 * Hair: a shell just outside the head, from deep under the cap down to a
 * fringe of rounded tufts. In front only the tuft tips show, just above the
 * eyes like the three brown tufts in the drawing (y 110-170); round the back
 * it hangs lower.
 */
function hairGeometry() {
  const tufts = 11;
  const top = 0.3;
  const s = 1.05;
  const { rx, ry, rz } = HEAD;
  // Any open theta range: only its triangle layout matters (a closed sphere
  // drops half the triangles of the first and last rows).
  const geom = new THREE.SphereGeometry(1, tufts * 6, 4, 0, Math.PI * 2, 0.5, 1);
  const pos = geom.attributes.position;
  const nor = geom.attributes.normal;
  const uv = geom.attributes.uv;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    // SphereGeometry puts the front at u = 0.25; a = 0 there.
    const a = (uv.getX(i) - 0.25) * Math.PI * 2;
    const back = (1 - Math.cos(a)) / 2;
    const tip = Math.abs(Math.cos((tufts * a) / 2));
    const bottom = 0.95 + back * 1.35 + tip * 0.25;
    const theta = top + (1 - uv.getY(i)) * (bottom - top);
    const x = rx * s * Math.sin(a) * Math.sin(theta);
    const y = ry * s * Math.cos(theta);
    const z = rz * s * Math.cos(a) * Math.sin(theta);
    pos.setXYZ(i, x, y, z);
    // Exact ellipsoid normals: no crack in the outline at the seam.
    n.set(x / rx ** 2, y / ry ** 2, z / rz ** 2).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  return geom;
}

function buildHead(head, img, tex, mats, look, badgeImg) {
  const skull = new THREE.Group();
  skull.position.y = HEAD.y;
  head.add(skull);
  const { rx, ry, rz } = HEAD;
  skull.add(mesh(ellipsoid(rx, ry, rz, 28, 18), tex.skin ? marker(tex.skin, 4, 2) : toon(PAPER), mats.thick));

  // The front half of a slightly larger shell carries the pencil face.
  const lift = 1.012;
  const front = new THREE.SphereGeometry(1, 20, 16, 0, Math.PI, 0.2, 2.5).scale(rx * lift, ry * lift, rz * lift);
  skull.add(new THREE.Mesh(projectUV(front, look.face, 0, look.faceY, look.facePx), decal(faceCanvas(img, look))));

  skull.add(mesh(hairGeometry(), marker(tex.hair, 4, 1), mats.thin));

  // Tall beanie with a nub on top (x 140-305, y 26-180), worn tipped back:
  // the front rim sits above the eyes, the back covers the back of the head.
  const capProfile = [
    [0.43, -0.03], [0.455, 0.02], [0.465, 0.11], [0.455, 0.23], [0.425, 0.33], [0.365, 0.43],
    [0.275, 0.5], [0.165, 0.54], [0.08, 0.556], [0.052, 0.57], [0.06, 0.6], [0.035, 0.627], [0, 0.636],
  ];
  const cap = new THREE.Group();
  cap.position.y = 0.15;
  cap.rotation.x = -0.2;
  skull.add(cap);
  cap.add(mesh(lathe(capProfile, 0.9, 24), marker(tex.cap, 2, 1.2), mats.thick));

  // The badge in the middle of the cap front.
  const badge = lathe(capProfile.map(([r, y]) => [r * 1.015 + 0.002, y]), 0.9, 14, -1.1, 2.2);
  cap.add(new THREE.Mesh(projectUV(badge, EMBLEM, 0, 0.28), decal(emblemCanvas(badgeImg))));
}

// The tall toy of mirio-gross.jpg: 0.004 units a pixel, soles at y 765, the
// middle of the figure at x 292. 2.68 units from the top of the cap (y 95)
// to the soles; volcano-run.js shows it 1.25 times that.
const TALL = Object.freeze({
  px: 0.004, sole: 765, mid: 292,
  // Head centre (y 225) and radii: the face is 208 px wide, chin at y 322.
  head: { y: 2.16, rx: 0.42, ry: 0.4, rz: 0.39 }, neck: 1.78,
  shoulder: { x: 0.335, y: 1.64 }, hip: { x: 0.19, y: 0.86 },
  arm: 0.68, elbow: -0.34,
  // Stretched out sideways, 20 deg below the horizontal like the drawing.
  armRest: 1.22, armRaised: 2.45,
});
const tallX = (x) => (x - TALL.mid) * TALL.px;
const tallY = (y) => (TALL.sole - y) * TALL.px;

/** The mean colour of drawing pixels `rect`, as a CSS colour. */
function meanColour(img, rect) {
  const { data } = cut(img, rect).getContext('2d', { willReadFrequently: true }).getImageData(0, 0, rect[2], rect[3]);
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += data[i + k];
  return `rgb(${sum.map((v) => Math.round(v / (data.length / 4))).join(',')})`;
}

/**
 * The painted face of `look` on a plain ground of `skin`: the oval of the
 * face fades out at its rim, so paint and skull meet without a seam.
 */
function paintedFaceCanvas(img, look, skin, k = 3) {
  const { face, faceOval: o } = look;
  const paint = cut(img, face, k);
  const ctx = paint.getContext('2d', { willReadFrequently: true });
  // The cap's red reaches into the oval at the sides; the 3D cap sits higher.
  const px = ctx.getImageData(0, 0, paint.width, paint.height);
  for (let i = 0; i < px.data.length; i += 4) if (px.data[i + 1] < px.data[i] * 0.35) px.data[i + 3] = 0;
  ctx.putImageData(px, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.translate((o.x - face[0]) * k, (o.y - face[1]) * k);
  ctx.scale(o.rx * k, o.ry * k);
  const fade = ctx.createRadialGradient(0, 0, 0.88, 0, 0, 1);
  fade.addColorStop(0, '#000');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(-1, -1, 2, 2);

  const c = makeCanvas(paint.width, paint.height);
  const out = c.getContext('2d');
  out.fillStyle = skin;
  out.fillRect(0, 0, c.width, c.height);
  // A photo of marker on paper is flatter than the marker was: lift it back up.
  out.filter = 'contrast(1.4) saturate(1.2)';
  out.drawImage(paint, 0, 0);
  return c;
}

/**
 * An ellipsoid shell open at the bottom, whose rim sits at polar angle
 * `rim(a)` round the head (a = 0 in front): the cap.
 */
function rimmedShell({ rx, ry, rz }, top, rim, w = 32, h = 10) {
  const geom = new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0.5, 1);
  const pos = geom.attributes.position;
  const nor = geom.attributes.normal;
  const uv = geom.attributes.uv;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const a = (uv.getX(i) - 0.25) * Math.PI * 2;
    const theta = top + (1 - uv.getY(i)) * (rim(a) - top);
    const x = rx * Math.sin(a) * Math.sin(theta);
    const y = ry * Math.cos(theta);
    const z = rz * Math.cos(a) * Math.sin(theta);
    pos.setXYZ(i, x, y, z);
    n.set(x / rx ** 2, y / ry ** 2, z / rz ** 2).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  return geom;
}

/** Four fingers and a thumb, drawn in ink round bare paper, fanning out below the palm. */
function inkHand(side) {
  const fingers = [
    [-70, 0.13, 0.35],
    [-30, 0.22, 0.08],
    [-6, 0.25, 0],
    [18, 0.23, -0.06],
    [42, 0.19, -0.12],
  ];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const palm = ellipsoid(0.07, 0.07, 0.035, 10, 8).translate(0, -0.05, 0);
  return merge([palm, ...fingers.map(([deg, len, curl]) => {
    const a = THREE.MathUtils.degToRad(deg) * side;
    const dir = new THREE.Vector3(Math.sin(a), -Math.cos(a), curl).normalize();
    const finger = new THREE.CapsuleGeometry(0.017, len, 3, 6).translate(0, len / 2, 0);
    finger.applyQuaternion(q.setFromUnitVectors(up, dir));
    return finger.translate(dir.x * 0.05, -0.08 + dir.y * 0.04, dir.z * 0.03);
  })]);
}

/** Where the torso's surface is at height y and angle phi (0 in front), pushed out by `lift`. */
function onTorso(profile, depth, y, phi, lift) {
  let r = profile[0][0];
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1];
    const [r1, y1] = profile[i];
    if (y >= y0 && y <= y1) r = r0 + ((y - y0) / (y1 - y0 || 1)) * (r1 - r0);
  }
  return new THREE.Vector3((r + lift) * Math.sin(phi), y, (r * depth + lift) * Math.cos(phi));
}

/**
 * Big Mirio, from mirio-gross.jpg. Same joints and animation handles as the
 * small toy, so player.js walks, jumps and cheers it unchanged.
 */
function buildTallMirio(art, look) {
  const img = art.images[look.image];
  const tex = {
    shirt: swatch(img, look.shirt),
    trousers: swatch(img, look.trousers),
    shoes: swatch(img, look.shoes),
    cap: swatch(img, look.cap),
    hair: swatch(img, look.hair),
    button: swatch(img, look.button),
  };
  const skin = meanColour(img, look.skin);
  const mats = {
    thick: outlineMaterial(0.03),
    thin: outlineMaterial(0.02),
    sleeve: marker(tex.shirt, 2, 1),
    trousers: marker(tex.trousers, 2, 2),
    shoe: marker(tex.shoes, 2, 2),
    hand: toon(PAPER),
  };

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // A straight tube of a body, like the drawing: red shirt (y 325-430) and
  // blue dungarees (y 430-570) of the same width.
  const depth = 0.74;
  const shirt = [[0.335, 1.28], [0.345, 1.45], [0.345, 1.6], [0.325, 1.69], [0.26, 1.75], [0.14, 1.785], [0, 1.795]];
  const trousers = [[0, 0.74], [0.17, 0.75], [0.3, 0.8], [0.345, 0.9], [0.35, 1.2], [0.356, 1.35]];
  body.add(mesh(lathe(shirt, depth, 24), marker(tex.shirt, 4, 1.4), mats.thick));
  body.add(mesh(lathe(trousers, depth, 24), marker(tex.trousers, 4, 1.4), mats.thick));

  // The two straps, up from the buttons, over the shoulders and down the back.
  const strapPath = [[1.33, 0.58], [1.5, 0.62], [1.62, 0.72], [1.71, 0.95], [1.755, Math.PI / 2]];
  const straps = [1, -1].map((side) => {
    const points = [...strapPath, ...strapPath.slice(0, -1).reverse().map(([y, phi]) => [y, Math.PI - phi])]
      .map(([y, phi]) => onTorso(shirt, depth, y, phi * side, 0.012));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.032, 6);
  });
  body.add(mesh(merge(straps), mats.trousers, mats.thin));
  for (const side of [1, -1]) {
    const button = mesh(ellipsoid(0.05, 0.045, 0.03, 10, 8), marker(tex.button, 1, 1), mats.thin);
    button.position.copy(onTorso(trousers, depth, 1.33, 0.58 * side, 0.04));
    body.add(button);
  }

  const head = new THREE.Group();
  head.position.y = TALL.neck;
  body.add(head);
  const skull = new THREE.Group();
  skull.position.y = TALL.head.y - TALL.neck;
  head.add(skull);
  const { rx, ry, rz } = TALL.head;
  skull.add(mesh(ellipsoid(rx, ry, rz, 28, 18), toon(skin), mats.thick));

  // The painted face, laid over the front half of a slightly larger shell;
  // round its oval the shell is plain skin, like the skull underneath.
  const lift = 1.012;
  const [fx, fy, fw, fh] = look.face;
  const front = new THREE.SphereGeometry(1, 24, 18, 0, Math.PI, 0.2, 2.6).scale(rx * lift, ry * lift, rz * lift);
  // A little higher than on paper: the mouth by the chin would turn under.
  const faceCentre = [tallX(fx + fw / 2), tallY(fy + fh / 2) - TALL.head.y + 0.05];
  skull.add(new THREE.Mesh(projectUV(front, look.face, ...faceCentre, TALL.px), toon(0xffffff, { map: canvasTexture(paintedFaceCanvas(img, look, skin)) })));

  // Brown hair round the back, below the cap.
  const hairBack = new THREE.SphereGeometry(1, 20, 6, Math.PI, Math.PI, 1.2, 1.05).scale(rx * 1.03, ry * 1.03, rz * 1.03);
  skull.add(mesh(hairBack, marker(tex.hair, 4, 1), mats.thin));

  // The cap: a round dome down to the eyebrows in front (y 177), over the
  // ears at the sides (y 222), and low at the back.
  const capShape = { rx: 0.448, ry: 0.5, rz: 0.43 };
  const capRim = (a) => 1.57 - 0.36 * Math.cos(a);
  const cap = new THREE.Group();
  cap.position.y = 0.02;
  skull.add(cap);
  cap.add(mesh(rimmedShell(capShape, 0.001, capRim, 32, 12), marker(tex.cap, 4, 2), mats.thick));

  // The curl badge, up on the front of the cap where the drawing has a letter.
  // Only a patch round it: stretched over the whole dome, the clamped
  // see-through edge of the texture turns into a pale haze.
  const badge = new THREE.SphereGeometry(1, 10, 8, Math.PI / 2 - 0.5, 1, 0.3, 0.8).scale(capShape.rx * 1.012, capShape.ry * 1.012, capShape.rz * 1.012);
  cap.add(new THREE.Mesh(projectUV(badge, EMBLEM, -0.02, 0.36, 0.0028), decal(emblemCanvas(art.images.mirio))));

  const arms = {};
  const elbows = {};
  const hands = {};
  const legs = {};
  const handGeoms = { L: inkHand(1), R: inkHand(-1) };
  for (const [key, side] of [['L', 1], ['R', -1]]) {
    const arm = joint(body, TALL.shoulder.x * side, TALL.shoulder.y);
    // Out sideways first, then the walk's swing: with arms stretched out, a
    // swing about the shoulder's own axis would only roll them.
    arm.pivot.rotation.order = 'ZYX';
    arm.limb.add(mesh(new THREE.CapsuleGeometry(0.085, 0.26, 4, 10).translate(0, -0.15, 0), mats.sleeve, mats.thin));
    const elbow = new THREE.Group();
    elbow.position.y = TALL.elbow;
    arm.limb.add(elbow);
    elbow.add(mesh(new THREE.CapsuleGeometry(0.08, 0.26, 4, 10).translate(0, -0.16, 0), mats.sleeve, mats.thin));
    const hand = new THREE.Group();
    hand.position.y = -TALL.arm - TALL.elbow;
    elbow.add(hand);
    hand.add(mesh(handGeoms[key], mats.hand, mats.thin));
    arm.pivot.rotation.z = -TALL.armRest * side;
    arms[key] = arm.pivot;
    elbows[key] = elbow;
    hands[key] = hand;

    const leg = joint(body, TALL.hip.x * side, TALL.hip.y);
    leg.limb.add(mesh(new THREE.CapsuleGeometry(0.1, 0.56, 4, 10).translate(0, -0.36, 0), mats.trousers, mats.thin));
    // Brown shoes, toes forward (x 147-225, y 720-765).
    const shoe = mesh(ellipsoid(0.13, 0.1, 0.2), mats.shoe, mats.thin);
    shoe.position.set(0, 0.1 - TALL.hip.y, 0.06);
    leg.limb.add(shoe);
    legs[key] = leg.pivot;
  }

  group.updateMatrixWorld(true);
  const height = new THREE.Box3().setFromObject(group, true).max.y;
  return {
    group, body, head,
    legL: legs.L, legR: legs.R, armL: arms.L, armR: arms.R,
    elbowL: elbows.L, elbowR: elbows.R, handL: hands.L, handR: hands.R,
    armRestZ: { L: -TALL.armRest, R: TALL.armRest },
    armRaisedZ: { L: -TALL.armRaised, R: TALL.armRaised },
    height,
  };
}

export function buildMirio(art, look = MIRIO_LOOK) {
  if (look.tall) return buildTallMirio(art, look);
  const img = art.images[look.image];
  const tex = {
    shirt: swatch(img, look.shirt),
    band: swatch(img, look.band),
    trousers: swatch(img, look.trousers),
    shoes: swatch(img, look.shoes),
    hair: swatch(img, look.hair),
    cap: swatch(img, look.cap),
    skin: look.skin ? swatch(img, look.skin) : null,
  };
  const mats = {
    thick: outlineMaterial(0.028),
    thin: outlineMaterial(0.02),
    sleeve: marker(tex.shirt, 2, 1),
    trousers: marker(tex.trousers, 2, 1.4),
    shoe: marker(tex.shoes, 2, 2),
    finger: toon(0x2c2a31),
  };

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // Shirt (x 138-262, y 232-380), its dark hem, and the top of the trousers.
  const depth = 0.82;
  const shirt = [
    [0.27, 0.64], [0.285, 0.75], [0.29, 0.95], [0.285, 1.15], [0.265, 1.27], [0.22, 1.35], [0.14, 1.39], [0, 1.41],
  ];
  const hem = [[0.285, 0.62], [0.3, 0.655], [0.3, 0.725], [0.286, 0.765]];
  const hips = [[0, 0.44], [0.13, 0.45], [0.23, 0.5], [0.275, 0.58], [0.28, 0.66]];
  body.add(mesh(lathe(shirt, depth), marker(tex.shirt, 4, 1.6), mats.thick));
  body.add(mesh(lathe(hem, depth), marker(tex.band, 4, 1), mats.thin));
  body.add(mesh(lathe(hips, depth), marker(tex.trousers, 4, 1), mats.thin));

  const head = new THREE.Group();
  head.position.y = NECK_Y;
  body.add(head);
  buildHead(head, img, tex, mats, look, art.images.mirio);

  const arms = {};
  const elbows = {};
  const hands = {};
  const legs = {};
  for (const [key, side] of [['L', 1], ['R', -1]]) {
    const arm = joint(body, SHOULDER.x * side, SHOULDER.y);
    const { elbow, hand } = buildArm(arm.limb, side, mats);
    arm.pivot.rotation.z = -ARM_REST * side;
    arms[key] = arm.pivot;
    elbows[key] = elbow;
    hands[key] = hand;

    const leg = joint(body, HIP.x * side, HIP.y);
    buildLeg(leg.limb, mats);
    legs[key] = leg.pivot;
  }

  group.updateMatrixWorld(true);
  const height = new THREE.Box3().setFromObject(group, true).max.y;

  return {
    group,
    body,
    head,
    legL: legs.L,
    legR: legs.R,
    armL: arms.L,
    armR: arms.R,
    // Bent forward with a negative rotation.x, like a real elbow and wrist.
    elbowL: elbows.L,
    elbowR: elbows.R,
    handL: hands.L,
    handR: hands.R,
    // The joints are mirrored (see joint()), so Mirio's left arm goes out and
    // up with a negative rotation.z.
    armRestZ: { L: -ARM_REST, R: ARM_REST },
    armRaisedZ: { L: -ARM_RAISED, R: ARM_RAISED },
    height,
  };
}

// Shared with volcano-creatures.js, whose creatures are dressed the same way.
export { swatch, marker, pencilCanvas, projectUV, decal };
