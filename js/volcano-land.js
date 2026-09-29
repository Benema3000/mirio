// The Festland, drawn: the ground mesh, built from the same height function
// the physics stands on (volcano-level.js festlandHeight), boulders along the
// foot of the valley's walls, and the forest: tall trees leaning over the
// path, undergrowth, fallen trunks and light falling through the crowns.
// Everything repeated is instanced or merged: a few draw calls in all.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { withFeatures } from './scene.js';
import { mulberry32 } from './world.js';
import {
  LIP, RAVINE, RAVINES, ZONES, beyondEdge, corridor, festlandHeight, landDir, landPoint, landXZ, lumpy, pathX, plantedDepth, rimHeight,
} from './volcano-level.js';

const Y = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const ease = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hex = (h) => new THREE.Color(h);
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
const up3 = new THREE.Vector3(), side3 = new THREE.Vector3();

// ---- The ground --------------------------------------------------------------

// Columns run at fixed offsets from the valley's centre line: dense where
// Mirio walks and the walls rise, sparse out in the mountains.
function groundColumns(fine) {
  const columns = [];
  for (const u of [-440, -360, -290, -230, -190]) columns.push(u);
  for (let u = -160; u < -48; u += 8) columns.push(u);
  for (let u = -48; u <= 48; u += fine) columns.push(u);
  for (let u = 56; u <= 160; u += 8) columns.push(u);
  for (const u of [190, 230, 290, 360, 440]) columns.push(u);
  return columns;
}

/** Row positions along z, with extra rows exactly on the ravines' rims and the waterfall's lip. */
function groundRows(fine) {
  const exact = [LIP, LIP - 0.6];
  for (const r of RAVINES) exact.push(r.z0, r.z0 - RAVINE.wall, r.z1, r.z1 + RAVINE.wall);
  const rows = [...exact];
  // Coarse far behind the start and beyond the crater, where only mountains stand.
  for (let z = 330; z > ZONES.arena - 420; z -= z > 64 || z < ZONES.arena - 75 ? 10 : z > -372 ? fine : 3) if (exact.every(e => Math.abs(e - z) > 0.35)) rows.push(z);
  return rows.sort((a, b) => b - a);
}
// Rows per piece of ground: each piece is culled on its own when out of view.
const CHUNK_ROWS = 40;

const SAND = [hex(0xefd49e), hex(0xd8b274)], SANDSTONE = [hex(0xc26f40), hex(0xe6a56c), hex(0x9a5234)], MESA = hex(0xcf9460);
const FLOOR = [hex(0x3f5f2b), hex(0x587a35)], LITTER = hex(0x6e5534), PATH = hex(0x9c7c50), MOSS = hex(0x355f2e);
const ROCK = [hex(0x74685e), hex(0x9c8f80)], PIT = hex(0x140d0a), SHORE = hex(0x6aa24e), ASH = [hex(0x3f3544), hex(0x5c4852)];

/** The ground's colour at local (x, z), height h, `steep` 0..1. */
function groundColour(x, z, h, steep, out) {
  const n = lumpy(x * 2.3, z * 2.3), e = beyondEdge(x, z);
  const desert = ease(-135, -110, z), river = ease(-326, -350, z), valley = ease(LIP, LIP - 20, z);
  const forest = (1 - desert) * (1 - river);
  // The floor: sand, forest floor with leaf litter and a trodden path, river banks, ash.
  const floor = out.copy(FLOOR[0]).lerp(FLOOR[1], n).lerp(LITTER, ease(0.62, 0.85, lumpy(x * 0.9 + 40, z * 0.9)) * 0.7);
  floor.lerp(PATH, ease(2.4, 1.1, Math.abs(x - pathX(z))) * ease(ZONES.desertEnd + 2, ZONES.desertEnd - 8, z) * ease(ZONES.bank + 4, ZONES.forestEnd + 6, z));
  // Sunlight through the crowns: soft bright spots on the forest floor.
  const spot = 0.5 + 0.5 * Math.sin(x * 0.8 + 1.3 * Math.sin(z * 0.35)) * Math.sin(z * 0.7 + 1.1 * Math.sin(x * 0.4));
  floor.multiplyScalar(1 + forest * (ease(0.62, 0.95, spot) * 0.45 - 0.08));
  floor.lerp(new THREE.Color().copy(SAND[0]).lerp(SAND[1], n), desert);
  floor.lerp(SHORE, river * (1 - valley));
  floor.lerp(new THREE.Color().copy(ASH[0]).lerp(ASH[1], n), valley);
  // On top of the walls: mesa tops, wooded hills, ash.
  const top = new THREE.Color().copy(MOSS).lerp(MESA, desert).lerp(ASH[1], valley);
  floor.lerp(top, ease(4, 8, e));
  // Faces: banded sandstone in the desert, grey rock elsewhere, black down in a ravine.
  const band = 0.5 + 0.5 * Math.sin(h * 1.7 + n * 2.5);
  const rock = new THREE.Color().copy(ROCK[0]).lerp(ROCK[1], band);
  rock.lerp(new THREE.Color().copy(SANDSTONE[2]).lerp(SANDSTONE[band > 0.5 ? 1 : 0], band), desert);
  rock.lerp(ASH[0], valley * 0.6);
  floor.lerp(rock, steep);
  const deep = (rimHeight(x, z) - h) / RAVINE.depth;
  if (deep > 0.02) floor.lerp(PIT, ease(0.05, 0.85, deep));
  return floor;
}

/**
 * The Festland's ground, vertex-coloured, heights from festlandHeight: a
 * group of pieces along z that share their edge rows (and so their normals).
 */
export function buildGround({ tier = 2 } = {}) {
  const fine = tier === 0 ? 2.25 : 1.75, rows = groundRows(fine), columns = groundColumns(fine), cols = columns.length;
  const position = new Float32Array(rows.length * cols * 3), local = new Float32Array(rows.length * cols * 3);
  rows.forEach((z, i) => {
    const { c } = corridor(z);
    columns.forEach((u, j) => {
      const x = c + u, h = festlandHeight(x, z), k = (i * cols + j) * 3;
      landPoint(x, z, 0, p3).toArray(position, k);
      local.set([x, h, z], k);
    });
  });
  const index = [];
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    index.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal, colours = new Float32Array(position.length), c = new THREE.Color();
  for (let v = 0; v < rows.length * cols; v++) {
    const x = local[v * 3], h = local[v * 3 + 1], z = local[v * 3 + 2];
    up3.set(normals.getX(v), normals.getY(v), normals.getZ(v));
    const steep = ease(0.12, 0.32, 1 - up3.dot(landDir(x, z)));
    groundColour(x, z, h, steep, c).toArray(colours, v * 3);
  }
  // Plain Lambert: the ground fills the screen, and on phones every fragment counts.
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const group = new THREE.Group();
  group.name = 'festland:ground';
  for (let r0 = 0; r0 < rows.length - 1; r0 += CHUNK_ROWS) {
    const r1 = Math.min(rows.length - 1, r0 + CHUNK_ROWS), from = r0 * cols * 3, to = (r1 + 1) * cols * 3;
    const piece = new THREE.BufferGeometry(), index = [];
    for (let i = 0; i < r1 - r0; i++) for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      index.push(a, b, c, b, d, c);
    }
    piece.setAttribute('position', new THREE.BufferAttribute(position.slice(from, to), 3));
    piece.setAttribute('normal', new THREE.BufferAttribute(normals.array.slice(from, to), 3));
    piece.setAttribute('color', new THREE.BufferAttribute(colours.slice(from, to), 3));
    piece.setIndex(index);
    piece.computeBoundingSphere();
    group.add(new THREE.Mesh(piece, material));
  }
  geometry.dispose();
  return group;
}

// ---- Shared bits -------------------------------------------------------------

/** Vertex colours from `colourAt(x, y, z, colour)`, then shared vertices welded (instanced a thousand times, it counts). */
function paint(geometry, colourAt) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
  const pos = g.attributes.position, colours = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) colourAt(pos.getX(i), pos.getY(i), pos.getZ(i), c).toArray(colours, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return mergeVertices(g);
}

/** Lambert with vertex colours and scene.js shader features. */
const matte = (extra = {}, features = {}) => withFeatures(new THREE.MeshLambertMaterial({ vertexColors: true, ...extra }), features);

/** Matrix standing a unit prop at local (x, z): `h` up the ground, turned by `yaw`, scaled. */
function standAt(x, z, h, yaw, sx, sy = sx, sz = sx, tilt = null) {
  const dir = landDir(x, z);
  q.setFromUnitVectors(Y, dir).multiply(q2.setFromAxisAngle(Y, yaw));
  if (tilt) q.multiply(tilt);
  return m4.compose(landPoint(x, z, h, p3), q, s3.set(sx, sy, sz)).clone();
}

function instanced(geometry, material, matrices, name, colours = null) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
  mesh.count = matrices.length;
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  if (colours) colours.forEach((c, i) => mesh.setColorAt(i, c));
  mesh.computeBoundingSphere();
  mesh.name = name;
  return mesh;
}

// ---- Boulders along the foot of the walls ------------------------------------

export function buildBoulders() {
  const rnd = mulberry32(77), matrices = [], colours = [];
  const geometry = paint(new THREE.DodecahedronGeometry(1, 0).scale(1, 0.7, 1), (x, y, z, c) => c.setScalar(0.85 + y * 0.2));
  for (let z = 28; z > ZONES.river - 12; z -= 2.5 + rnd() * 3) {
    const { c, w } = corridor(z), desert = ease(-135, -110, z);
    for (const side of [-1, 1]) {
      if (rnd() < 0.3) continue;
      const r = 0.6 + rnd() * 1.4, x = c + side * (w + 0.3 + r * 0.7), zz = z + (rnd() - 0.5) * 2;
      matrices.push(standAt(x, zz, -0.2 * r - plantedDepth(x, zz, r * 0.8), rnd() * 6.28, r, r * (0.7 + rnd() * 0.6), r));
      colours.push(new THREE.Color().copy(ROCK[0]).lerp(ROCK[1], rnd()).lerp(SANDSTONE[1], desert * 0.8));
    }
  }
  return instanced(geometry, matte(), matrices, 'festland:boulders', colours);
}

// ---- The forest -------------------------------------------------------------

const BARK = hex(0x6b4a32), BARK_DARK = hex(0x3e2a1d);

/** A unit trunk (radius 1 at the foot, height 1), darker toward the ground. */
function trunkGeometry(segments) {
  return paint(new THREE.CylinderGeometry(0.62, 1, 1, segments, 2, true).translate(0, 0.5, 0), (x, y, z, c) => c.copy(BARK_DARK).lerp(BARK, 0.3 + y * 0.7));
}

/** Four roots flaring out from a unit trunk's foot. */
function rootGeometry() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + 0.4;
    parts.push(new THREE.ConeGeometry(0.55, 2.2, 5).rotateZ(Math.PI / 2 + 0.35).translate(1.1, 0.25, 0).rotateY(a));
  }
  return paint(mergeGeometries(parts.map(p => p.toNonIndexed())), (x, y, z, c) => c.copy(BARK_DARK).lerp(BARK, 0.4 + y * 0.4));
}

/** A broadleaf crown: a cluster of leafy blobs, radius about 1, lighter on top. */
function crownGeometry(detail) {
  const blobs = [[0, 0, 0, 1], [0.72, -0.18, 0.22, 0.74], [-0.62, -0.12, -0.38, 0.8], [0.12, 0.42, -0.5, 0.68], [-0.25, -0.3, 0.7, 0.7]];
  const geometry = mergeGeometries(blobs.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, detail).translate(x, y, z)));
  return paint(geometry, (x, y, z, c) => c.setHex(0x2c5424).lerp(hex(0x78b04a), ease(-0.9, 1.1, y + 0.25 * Math.sin(x * 3 + z * 2))));
}

/** A fir: stacked cones, unit height and radius. */
function firGeometry(segments) {
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push(new THREE.ConeGeometry(1 - i * 0.2, 0.42, segments).translate(0, 0.21 + i * 0.2, 0).toNonIndexed());
  return paint(mergeGeometries(parts), (x, y, z, c) => c.setHex(0x1f4a2c).lerp(hex(0x4f8a48), ease(0, 1, y * 0.6 + (1 - Math.hypot(x, z)) * 0.5)));
}

/** A fern: arched fronds in a rosette, about 0.8 m across. */
function fernGeometry() {
  const position = [];
  for (let f = 0; f < 6; f++) {
    const a = f / 6 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), len = 0.8 + (f % 3) * 0.12;
    const at = (t, off) => { const r = t * len, y = Math.sin(t * Math.PI * 0.8) * 0.45; return [ca * r - sa * off, y, sa * r + ca * off]; };
    for (let k = 0; k < 3; k++) {
      const t0 = k / 3, t1 = (k + 1) / 3, w0 = 0.12 * Math.sin((t0 * 0.9 + 0.1) * Math.PI), w1 = 0.12 * Math.sin((t1 * 0.9 + 0.1) * Math.PI);
      position.push(...at(t0, -w0), ...at(t1, -w1), ...at(t1, w1), ...at(t0, -w0), ...at(t1, w1), ...at(t0, w0));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.computeVertexNormals();
  return paint(g, (x, y, z, c) => c.setHex(0x2f6a2c).lerp(hex(0x8cc45a), clamp(Math.hypot(x, z) * 0.9, 0, 1)));
}

function bushGeometry() {
  const blobs = [[0, 0.45, 0, 0.6], [0.45, 0.35, 0.15, 0.45], [-0.4, 0.32, -0.2, 0.48], [0.05, 0.3, -0.45, 0.42]];
  const geometry = mergeGeometries(blobs.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 0).translate(x, y, z)));
  return paint(geometry, (x, y, z, c) => c.setHex(0x2e5a26).lerp(hex(0x6a9e3e), clamp(y, 0, 1)));
}

/** Red-capped mushrooms with white dots: three of different sizes. */
function mushroomGeometry() {
  const parts = [];
  for (const [x, z, s] of [[0, 0, 1], [0.32, 0.18, 0.65], [-0.22, 0.28, 0.5]]) {
    parts.push(new THREE.CylinderGeometry(0.06 * s, 0.08 * s, 0.3 * s, 6).translate(x, 0.15 * s, z).toNonIndexed());
    parts.push(new THREE.SphereGeometry(0.2 * s, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1).translate(x, 0.28 * s, z).toNonIndexed());
  }
  return paint(mergeGeometries(parts), (x, y, z, c) => {
    if (y < 0.26 && Math.hypot(x, z) < 0.1 || y < 0.18) return c.setHex(0xf2ead8);
    const dot = Math.sin(x * 55) * Math.sin(z * 55 + y * 30) > 0.55;
    return c.setHex(dot ? 0xfff6e8 : 0xd8322a);
  });
}

/** A fallen trunk along z, radius 1 and length 1, cut ends pale. */
function logGeometry() {
  const g = new THREE.CylinderGeometry(1, 1, 1, 9, 1).rotateX(Math.PI / 2);
  return paint(g, (x, y, z, c) => (Math.abs(z) > 0.49 ? c.setHex(0xc8a472) : c.copy(BARK_DARK).lerp(BARK, 0.5 + y * 0.5)).lerp(MOSS, y > 0.6 ? 0.5 : 0));
}

/** Shafts of light slanting down through the crowns: crossed quads, bright in the middle. */
function shaftGeometry(spots) {
  const position = [], colour = [], slant = new THREE.Vector3(0.35, 0, 0.25);
  for (const [x, z, width, top] of spots) {
    const foot = landPoint(x, z, 0), dir = landDir(x, z);
    const head = foot.clone().addScaledVector(dir, top).addScaledVector(slant, top);
    const mid = foot.clone().lerp(head, 0.45);
    for (const across of [new THREE.Vector3(1, 0, -0.4).normalize(), new THREE.Vector3(0.4, 0, 1).normalize()]) {
      const rows = [[head, 0], [mid, 0.3], [foot, 0]];
      for (let r = 0; r < 2; r++) {
        const [a, aa] = rows[r], [b, ba] = rows[r + 1];
        const pts = [[a, -1, aa], [a, 1, aa], [b, 1, ba], [a, -1, aa], [b, 1, ba], [b, -1, ba]];
        for (const [p, s, alpha] of pts) {
          position.push(...p.clone().addScaledVector(across, s * width * (p === head ? 1.25 : 1)).toArray());
          colour.push(1, 0.95, 0.72, alpha);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colour, 4));
  return g;
}

/**
 * The forest and the trees on the hills. `focus` is the see-through uniform
 * (scene.js seeThrough): trunks and crowns between the camera and Mirio open up.
 */
export function buildForest(level, { focus, sway, tier = 2 }) {
  const detail = tier === 0 ? 0 : 1;
  const group = new THREE.Group();
  group.name = 'festland:forest';
  const see = { seeThrough: { focus, radius: 2.2 } };
  const wood = matte({}, see);
  const leaves = matte({}, { ...see, sway: { time: sway, amount: 0.02 } });
  const rnd = mulberry32(911);

  // Two sets of meshes, the wood and the gorge below it, each culled on its own.
  // Round crowns near the path, low-poly ones deeper in and on the hills.
  const sets = [0, 1].map(() => ({ trunks: [], roots: [], broad: [], firs: [], farBroad: [], farFirs: [], tints: { broad: [], firs: [], farBroad: [], farFirs: [] } }));
  for (const t of level.forest) {
    const { trunks, roots, broad, firs, farBroad, farFirs, tints } = sets[t.z > ZONES.bank ? 0 : 1];
    if (!t.solid && tier === 0 && rnd() < 0.5) continue;
    const dir = landDir(t.x, t.z), side = side3.set(1, 0, 0).addScaledVector(dir, -dir.x).normalize();
    const crownAt = t.kind === 'fir' ? 0.26 : 0.8;
    const tilt = q2.clone().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.atan2(t.lean, t.height * crownAt));
    trunks.push(standAt(t.x, t.z, -0.4, 0, t.trunk, t.height * (t.kind === 'fir' ? 0.9 : crownAt + 0.05), t.trunk, tilt));
    if (t.near) roots.push(standAt(t.x, t.z, -0.15, t.yaw, t.trunk));
    const base = landPoint(t.x, t.z, -0.4).addScaledVector(dir, t.height * crownAt).addScaledVector(side, t.lean);
    q.setFromUnitVectors(Y, dir).multiply(new THREE.Quaternion().setFromAxisAngle(Y, t.yaw));
    const tint = new THREE.Color().setHSL(0, 0, 1).offsetHSL((rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.14);
    if (t.kind === 'fir') {
      const r = t.height * 0.24;
      const m = m4.compose(base, q, s3.set(r, t.height * 0.78, r)).clone();
      (t.near ? firs : farFirs).push(m);
      tints[t.near ? 'firs' : 'farFirs'].push(tint);
    } else {
      const r = t.height * (0.33 + rnd() * 0.08);
      const m = m4.compose(base, q, s3.set(r, r * 0.72, r)).clone();
      (t.near ? broad : farBroad).push(m);
      tints[t.near ? 'broad' : 'farBroad'].push(tint);
    }
  }
  const shapes = { trunk: trunkGeometry(6), root: rootGeometry(), crown: crownGeometry(detail), fir: firGeometry(8), farCrown: crownGeometry(0), farFir: firGeometry(6) };
  sets.forEach(({ trunks, roots, broad, firs, farBroad, farFirs, tints }, i) => {
    const name = ['wood', 'gorge'][i];
    for (const [shape, material, list, colours] of [['trunk', wood, trunks], ['root', wood, roots], ['crown', leaves, broad, tints.broad],
      ['fir', leaves, firs, tints.firs], ['farCrown', leaves, farBroad, tints.farBroad], ['farFir', leaves, farFirs, tints.farFirs]]) {
      if (list.length) group.add(instanced(shapes[shape], material, list, `forest:${name}:${shape}`, colours));
    }
  });

  // The undergrowth: ferns, bushes and mushrooms, clear of the path, the
  // things Mirio plays with, the trunks and the ravines.
  const taken = [
    ...[...level.springs, ...level.plants, ...level.stumps, ...level.flags].map(i => ({ ...landXZ(i.dir), r: 2.2 })),
    ...level.fallen.map(f => ({ x: f.x, z: f.z, r: f.length / 2 + 0.4 })), ...level.walkers.map(i => ({ ...landXZ(i.dir), r: 1.5 })),
    ...level.forest.filter(t => t.solid).map(t => ({ x: t.x, z: t.z, r: t.trunk + 0.5 })),
  ];
  const open = (x, z, lane) => Math.abs(x - pathX(z)) > lane && beyondEdge(x, z) < -0.8 && rimHeight(x, z) - festlandHeight(x, z) < 0.05
    && taken.every(t => Math.abs(t.z - z) > t.r || Math.hypot(t.x - x, t.z - z) > t.r);
  const ferns = [], bushes = [], shrooms = [];
  for (let z = ZONES.desertEnd - 2; z > ZONES.forestEnd; z -= tier === 0 ? 1.8 : 0.9) {
    const { c, w } = corridor(z);
    for (let k = 0; k < 3; k++) {
      const x = c + (rnd() * 2 - 1) * w, kind = rnd();
      if (kind < 0.55 && open(x, z, 2.2)) ferns.push(standAt(x, z, -0.05, rnd() * 6.28, 0.8 + rnd() * 0.7));
      else if (kind < 0.8 && open(x, z, 4.5)) bushes.push(standAt(x, z, -0.2, rnd() * 6.28, 0.8 + rnd() * 0.9));
      else if (kind < 0.88 && open(x, z, 2)) shrooms.push(standAt(x, z, -0.02, rnd() * 6.28, 0.8 + rnd() * 0.8));
    }
  }
  // Ferns crowding round the trunks.
  for (const t of level.forest) if (t.solid && rnd() < 0.7) {
    const a = rnd() * 6.28, r = t.trunk + 0.9, x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
    if (Math.abs(x - pathX(z)) > 2.2) ferns.push(standAt(x, z, -0.05, rnd() * 6.28, 0.9 + rnd() * 0.6));
  }
  const plants = matte({ side: THREE.DoubleSide }, { sway: { time: sway, amount: 0.12 } });
  group.add(instanced(fernGeometry(), plants, ferns, 'forest:ferns'));
  group.add(instanced(bushGeometry(), matte(), bushes, 'forest:bushes'));
  group.add(instanced(mushroomGeometry(), matte(), shrooms, 'forest:mushrooms'));
  group.add(instanced(logGeometry(), wood, level.fallen.map(f => standAt(f.x, f.z, f.radius * 0.75, -f.yaw, f.radius, f.radius, f.length)), 'forest:fallen'));

  // Light through the crowns.
  const spots = [];
  for (let z = ZONES.desertEnd - 10; z > ZONES.forestEnd + 5; z -= 9 + rnd() * 8) spots.push([pathX(z) + (rnd() * 2 - 1) * 9, z, 0.8 + rnd() * 1.1, 13 + rnd() * 3]);
  const shafts = new THREE.Mesh(shaftGeometry(spots), new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  shafts.name = 'forest:light';
  shafts.renderOrder = 3;
  group.add(shafts);
  return { group, shafts };
}
