// Mirio: the rocket, the checkpoint flag, the Glitzersteine and the big crystal.
//
// Miro drew the rocket as a brown felt-pen blob. It is spun into a solid:
// every row of the drawing becomes a ring half as wide as the ink in that row,
// and the drawing is unwrapped around it, so the front of the rocket shows his
// strokes and the back shows them mirrored. Fins, a porthole and a flame are
// added in the same toon-and-pen style so the blob reads as a rocket.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture, cropToInk } from './art.js';
import { outlineMaterial, toon, withOutline } from './materials.js';

const ROCKET_HEIGHT = 4.4;
// Pixels with less alpha than this are paper, not ink.
const INK_ALPHA = 128;
// Rows averaged on each side when smoothing the outline of the drawing.
const SMOOTH_ROWS = 9;
const LEVELS = 48;
const SEGMENTS = 48;
// The top of the drawing (this fraction of its height) becomes a smooth nose;
// NOSE_ROUND 1 follows the drawing's blunt dome, 0 ends in a point.
const NOSE = 0.12;
const NOSE_ROUND = 0.4;
const NOSE_STEPS = 8;
const UNWRAP_WIDTH = 256;
// The pen's edge pixels are greyer than the ink inside; left in, they draw a
// light stripe down the mirror seams.
const EDGE_INSET = 5;
const PEN_BROWN = 0x2b1710;

const FIN_TOP = 1.9;
const FIN_SPAN = 0.85;
const FIN_THICKNESS = 0.16;
// How deep the fins and porthole sink into the body, so no gap shows.
const SINK = 0.12;

const PORTHOLE_AT = 0.6;
const PORTHOLE_RADIUS = 0.4;

const POLE_HEIGHT = 3.2;
const PENNANT_WIDTH = 1.15;
const PENNANT_HEIGHT = 0.72;

// Hero drawing: a patch of solid red marker on Mirio's shirt, starting below
// the pen line of his chin.
const SHIRT = { x: 150, y: 262, w: 100, h: 93 };

const Z = new THREE.Vector3(0, 0, 1);

/**
 * Left and right edge of the ink in every row, top to bottom, and the mean
 * ink colour. A row without ink copies the one above.
 */
function inkSpans(canvas) {
  const { width: w, height: h } = canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, w, h);
  const spans = [];
  const sum = [0, 0, 0];
  let count = 0;
  for (let y = 0; y < h; y++) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < INK_ALPHA) continue;
      if (left < 0) left = x;
      right = x;
      for (let k = 0; k < 3; k++) sum[k] += data[i + k];
      count++;
    }
    spans.push(left < 0 ? spans[y - 1] ?? { left: 0, right: w - 1 } : { left, right });
  }
  const [r, g, b] = sum.map((s) => Math.round(s / Math.max(count, 1)));
  return { spans, color: `rgb(${r},${g},${b})` };
}

function smooth(values, reach) {
  return values.map((_, i) => {
    let total = 0;
    let n = 0;
    for (let k = Math.max(0, i - reach); k <= Math.min(values.length - 1, i + reach); k++) {
      total += values[k];
      n++;
    }
    return total / n;
  });
}

/**
 * Lathe outline from the drawing, bottom to top, in world units: closed at the
 * base, one ring per level, then the nose.
 */
function latheProfile(spans) {
  const radii = smooth(spans.map((s) => (s.right - s.left + 1) / 2).reverse(), SMOOTH_ROWS);
  const top = radii.length - 1;
  const noseStart = Math.round(top * (1 - NOSE));
  const scale = ROCKET_HEIGHT / top;

  const points = [new THREE.Vector2(0, 0)];
  for (let j = 0; j <= LEVELS; j++) {
    const row = (j / LEVELS) * noseStart;
    const i = Math.floor(row);
    const r = THREE.MathUtils.lerp(radii[i], radii[i + 1], row - i);
    points.push(new THREE.Vector2(r * scale, row * scale));
  }

  // The smoothed top rows would leave a knob on the nose. Instead, leave the
  // body along its own slope and curve in to the axis. The drawing's own top
  // is a blunt dome; a little pointier reads as a rocket.
  const slope = (radii[noseStart] - radii[noseStart - 4]) / 4;
  const reach = Math.max(0, radii[noseStart] + slope * (top - noseStart)) * NOSE_ROUND;
  const nose = new THREE.QuadraticBezierCurve(
    new THREE.Vector2(radii[noseStart], noseStart),
    new THREE.Vector2(reach, top),
    new THREE.Vector2(0, top),
  );
  for (const p of nose.getPoints(NOSE_STEPS).slice(1)) points.push(p.multiplyScalar(scale));
  return points;
}

/** Body radius at height `y`, read off the lathe outline. */
function radiusAt(points, y) {
  for (let i = 2; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (y <= b.y) return THREE.MathUtils.lerp(a.x, b.x, (y - a.y) / (b.y - a.y || 1));
  }
  return 0;
}

/**
 * The drawing unwrapped: each row's ink stretched to the full width, over the
 * mean ink colour, so the rectangle has no transparent gaps.
 */
function unwrapTexture(ink, spans, color) {
  const c = document.createElement('canvas');
  c.width = UNWRAP_WIDTH;
  c.height = ink.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  for (const [y, { left, right }] of spans.entries()) {
    const inset = Math.min(EDGE_INSET, (right - left) / 4);
    ctx.drawImage(ink, left + inset, y, right - left + 1 - inset * 2, 1, 0, y, c.width, 1);
  }

  const tex = canvasTexture(c);
  tex.wrapS = THREE.MirroredRepeatWrapping;
  tex.repeat.x = 2;
  return tex;
}

function bodyGeometry(points) {
  // Starting at -X puts u = 0.25 (the middle of the unmirrored drawing) on +Z.
  const geom = new THREE.LatheGeometry(points, SEGMENTS, -Math.PI / 2);
  const pos = geom.attributes.position;
  const uv = geom.attributes.uv;
  const normal = geom.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    // v follows the height, not the point index, so the nose does not squeeze
    // the drawing.
    uv.setY(i, pos.getY(i) / ROCKET_HEIGHT);
    // Lathe leaves the tip normal unnormalised and sideways; the outline hull
    // would open up there.
    if (Math.hypot(pos.getX(i), pos.getZ(i)) < 1e-6) normal.setXYZ(i, 0, pos.getY(i) > 0 ? 1 : -1, 0);
  }
  return geom;
}

/**
 * Copy of `geometry` with the normals averaged at every corner. Extruded
 * shapes have split normals at their edges, which would tear the pushed-out
 * outline hull apart.
 */
function averagedNormals(geometry) {
  const geom = geometry.clone();
  const pos = geom.attributes.position;
  const normal = geom.attributes.normal;
  const key = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => Math.round(v * 1e4)).join();
  const corners = new Map();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(normal, i);
    const corner = corners.get(key(i)) ?? { sum: new THREE.Vector3(), seen: [] };
    if (!corner.seen.some((s) => s.dot(n) > 0.9999)) {
      corner.seen.push(n.clone());
      corner.sum.add(n);
    }
    corners.set(key(i), corner);
  }
  for (let i = 0; i < pos.count; i++) {
    n.copy(corners.get(key(i)).sum).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  return geom;
}

/** withOutline for extruded (flat-shaded) meshes. */
function withExtrudeOutline(mesh, material) {
  mesh.add(new THREE.Mesh(averagedNormals(mesh.geometry), material));
  return mesh;
}

/** A patch of the red marker on Mirio's shirt, repeating without seams. */
function markerRed(art) {
  const c = document.createElement('canvas');
  c.width = SHIRT.w;
  c.height = SHIRT.h;
  c.getContext('2d').drawImage(art.images.mirio, SHIRT.x, SHIRT.y, SHIRT.w, SHIRT.h, 0, 0, SHIRT.w, SHIRT.h);
  const tex = canvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  // Extruded UVs are in world units; one patch then spans a whole fin, and no
  // mirror line runs through it.
  tex.repeat.setScalar(0.4);
  return tex;
}

/** Swept fin in the XY plane, +X pointing away from the body, foot on y = 0. */
function finGeometry(points, reach) {
  const root = (y) => radiusAt(points, y) - SINK;
  const tip = reach + FIN_SPAN;
  const shape = new THREE.Shape()
    .moveTo(root(FIN_TOP), FIN_TOP)
    .quadraticCurveTo(tip - 0.3, FIN_TOP - 0.2, tip, 0.3)
    .quadraticCurveTo(tip + 0.05, 0, tip - 0.25, 0)
    .quadraticCurveTo(reach - 0.15, 0, root(0.4), 0.4)
    .closePath();
  const geom = new THREE.ExtrudeGeometry(shape, { depth: FIN_THICKNESS, bevelEnabled: false, curveSegments: 8 });
  geom.translate(0, 0, -FIN_THICKNESS / 2);
  return geom;
}

/** Two nested cones, bright at the nozzle and fading to nothing at the tip. */
function buildFlame() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#000');
  g.addColorStop(0.55, '#777');
  g.addColorStop(1, '#fff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  const map = canvasTexture(c);

  const flame = new THREE.Group();
  for (const [radius, length, color] of [[0.5, 1.8, 0xff6a1a], [0.28, 1.1, 0xffe07a]]) {
    // Cone apex points down, base at the pivot: the caller scales y from the nozzle.
    const geom = new THREE.ConeGeometry(radius, length, 20, 1, true).rotateX(Math.PI).translate(0, -length / 2, 0);
    const mat = new THREE.MeshBasicMaterial({
      color,
      map,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    flame.add(new THREE.Mesh(geom, mat));
  }
  flame.visible = false;
  return flame;
}

function buildPorthole(points, pen) {
  const y = PORTHOLE_AT * ROCKET_HEIGHT;
  const slope = (radiusAt(points, y + 0.05) - radiusAt(points, y - 0.05)) / 0.1;
  const normal = new THREE.Vector3(0, -slope, 1).normalize();

  const porthole = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(PORTHOLE_RADIUS, 0.09, 10, 32), toon(0xa9afba));
  porthole.add(withOutline(rim, pen));
  const glass = new THREE.Mesh(new THREE.SphereGeometry(PORTHOLE_RADIUS, 24, 12).scale(1, 1, 0.45), toon(0x9fdcff));
  porthole.add(glass);
  porthole.position.set(0, y, radiusAt(points, y)).addScaledVector(normal, -SINK * 0.5);
  porthole.quaternion.setFromUnitVectors(Z, normal);
  return porthole;
}

export function buildRocket(art) {
  const ink = cropToInk(art.images.rocket, INK_ALPHA - 1);
  const { spans, color } = inkSpans(ink);
  const points = latheProfile(spans);
  const radius = Math.max(...points.map((p) => p.x));
  const pen = outlineMaterial(0.03, PEN_BROWN);
  const group = new THREE.Group();

  const body = new THREE.Mesh(bodyGeometry(points), toon(0xffffff, { map: unwrapTexture(ink, spans, color) }));
  group.add(withOutline(body, pen));

  const finGeom = finGeometry(points, radius);
  const finMat = toon(0xffffff, { map: markerRed(art) });
  // One fin straight back, two framing the porthole at the front.
  for (const phi of [Math.PI / 3, Math.PI, -Math.PI / 3]) {
    const fin = new THREE.Mesh(finGeom, finMat);
    fin.rotation.y = phi - Math.PI / 2;
    group.add(withExtrudeOutline(fin, pen));
  }

  group.add(buildPorthole(points, pen));

  const flame = buildFlame();
  group.add(flame);

  return { group, flame, height: ROCKET_HEIGHT, radius };
}

export function buildFlag(art) {
  const pen = outlineMaterial(0.025, PEN_BROWN);
  const group = new THREE.Group();

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.07, POLE_HEIGHT, 12).translate(0, POLE_HEIGHT / 2, 0),
    toon(0xeeecf4),
  );
  group.add(withOutline(pole, pen));

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), toon(0xffc53d));
  ball.position.y = POLE_HEIGHT + 0.1;
  group.add(withOutline(ball, pen));

  const shape = new THREE.Shape()
    .moveTo(0, 0)
    .lineTo(PENNANT_WIDTH, PENNANT_HEIGHT / 2)
    .lineTo(0, PENNANT_HEIGHT)
    .closePath();
  const depth = 0.05;
  const geom = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0.05, 0, -depth / 2);
  const pennant = new THREE.Mesh(geom, toon(0xffffff, { map: markerRed(art) }));

  const flag = new THREE.Group();
  flag.add(withExtrudeOutline(pennant, pen));
  const lowY = 0.4;
  const highY = POLE_HEIGHT - PENNANT_HEIGHT - 0.08;
  flag.position.y = lowY;
  group.add(flag);

  return { group, flag, lowY, highY };
}

// ---- Gems and the big crystal --------------------------------------------------
// The prize and the collectables are cut stones. Non-indexed with one normal
// per face, so every facet catches the light on its own.

function lathe(profile, sides) {
  const geom = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), sides).toNonIndexed();
  geom.computeVertexNormals();
  return geom;
}

/** A Glitzerstein: a cut gem, table up, `radius` across its girdle, centred. */
export function gemGeometry(radius = 0.34) {
  const r = radius;
  return lathe([[0, -r], [r, 0.12 * r], [0.6 * r, 0.5 * r], [0, 0.5 * r]], 8).translate(0, 0.25 * r, 0);
}

/** One long six-sided crystal, pointed at both ends, standing on y = 0. */
function prism(radius, length, base, tip) {
  return lathe([[0, 0], [radius, base], [radius, base + length], [0, base + length + tip]], 6);
}

/** The big crystal: a cluster of three, about 2.6 high and centred. */
export function bigCrystalGeometry() {
  const geom = mergeGeometries([
    prism(0.55, 1.3, 0.45, 0.8),
    prism(0.32, 0.6, 0.25, 0.45).rotateZ(0.65).translate(-0.18, 0.3, 0.12),
    prism(0.28, 0.5, 0.2, 0.4).rotateX(0.35).rotateZ(-0.75).translate(0.2, 0.25, -0.1),
  ]);
  return geom.center();
}
