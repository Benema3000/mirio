// Mirio: the kart race from the boss arena down to the Zielplanet.
//
// A kart race in Miro's felt-pen style. A road of Miro's grey floor scribble
// leaves the rim of the
// arena, drops towards the Zielplanet and winds three times round it, lower
// every lap and weaving from side to side, until it runs along the ground to
// the finish arch. The road's "up" starts as the arena's and turns into the
// Zielplanet's gravity during the first drop, so downhill means losing height
// above the Zielplanet, and the karts speed up on the way down.
//
// A kart never flies freely: it is a distance s along the track, an offset x
// across it and a height h above it. Rails keep it on the road; the ramp's
// gap is crossed on a fixed arc. Mirio's kart is driven with gas and brake
// and steered like a car, slides and drifts included (kart-physics.js); Finster-Mirio's
// just slides across the road to the line he wants. Mirio rides Miro's rocket lying on its side,
// sitting in its porthole; Finster-Mirio (the boss, dyed as in boss.js)
// races a dark copy.
//
// Draw calls are what phones run out of: the track is a handful of merged
// meshes, and every felt-pen outline is baked into its mesh (outlined())
// instead of being drawn as a second one.

import * as THREE from 'three';
import { canvasTexture } from './art.js';
import { toon } from './materials.js';
import { buildMirio } from './mirio-model.js';
import { bigCrystalGeometry, buildRocket, gemGeometry } from './props.js';
import { approachSpeed, DRIVE, driftLevel, driveKart, slideOf } from './kart-physics.js';
import { mulberry32 } from './world.js';

// ---- Track layout --------------------------------------------------------------
// Round the Zielplanet: psi (degrees) turns from the finish over its "north"
// (the arena's up, flattened onto it), lat (degrees) steps to the right of
// that, alt is the height above its ground. Tables are [psi, value] pairs,
// eased between.
const LAPS = 3;
const KEY_STEP = 15;
const LAYOUT_FROM = 45;
const RUNOUT = 90;
const ALTITUDE = [
  [28, 31.5], [150, 29.5], [175, 24], [390, 20.5], [420, 16], [700, 12], [735, 9], [860, 5.5], [980, 1], [1040, 0.15],
];
// S-curves: this many per lap, swinging this far (amp) round a centre line (offset).
const WEAVE_WAVES = 3;
const WEAVE_PHASE = 45;
const WEAVE_AMP = [[45, 0], [100, 22], [360, 22], [400, 20], [700, 14], [760, 8], [900, 7], [990, 2], [1060, 0]];
const WEAVE_OFFSET = [[45, 0], [360, 4], [420, -6], [720, -6], [780, 6], [950, 4], [1060, 0]];
// Level on the arena ([right, up, forward] from course.start), then the
// first drop onto the first lap ([psi, lat, alt]).
const START_KEYS = [[0, 0, -4], [0, 0, 0], [0, 0, 8]];
const DROP_KEYS = [[16, 0, 34], [28, 0, 31.5]];
// Units of track over which "up" turns from the arena's to the Zielplanet's.
const GRAVITY_TURN = [6, 26];
const SAMPLE_STEP = 0.5;
// Curves are banked for this speed and gravity, smoothed over this many units.
const BANK_SPEED = 16;
const BANK_GRAVITY = 30;
const BANK_MAX = 0.6;
const BANK_SMOOTH = 6;

// ---- Road ------------------------------------------------------------------
const HALF_WIDTH = 5;
const ROAD_THICKNESS = 0.7;
const ROAD_TAPER = 0.5;
// The road's top sits this far above the track line: no z-fighting with the arena.
const ROAD_LIFT = 0.04;
const ROAD_STEP = 1;
const ROAD_TEX_LENGTH = 7;
// Texture columns: the underside colour, and where the road's top starts.
const UNDER_U = 0.03;
const TOP_U0 = 0.14;
const RAIL_RADIUS = 0.34;
const RAIL_HEIGHT = 0.3;
const RAIL_OUT = 0.05;
const RAIL_STEP = 2.5;
const RAIL_SIDES = 6;
const RAIL_TEX_LENGTH = 3;
// Rails close to a point over this many units where the road ends.
const RAIL_TIP = 0.6;
// Felt-pen outline thickness of the track pieces.
const PEN = 0.07;

// ---- What is on the road ----------------------------------------------------------
// Places are [psi, x]; the start is in units along the track (the rim is at 4).
const GRID = { s: 8.5, x: 2.2 };
const START_LINE = 10.8;
const PADS = [[60, 0], [300, -2.5], [385, 0], [470, -2.5], [610, -2.5], [690, 0], [780, 2.5], [850, -2.5], [1005, 0], [1052, 0]];
const PAD = { length: 5, width: 3.4, lift: 0.07 };
const BLOCKS = [[90, -2.2], [265, 0], [330, 2.5], [505, -2.5], [575, 2], [760, -2.5], [900, 2.5], [965, -2]];
const BLOCK = { size: 1.9, height: 0.75 };
// Glitzerstein trails: [psi from, psi to, x from, x to, count].
const BIT_TRAILS = [
  [48, 62, 0, 0, 4], [100, 125, -2, 2, 5], [200, 220, 2, -2, 5], [280, 300, 0, -2.5, 5], [350, 375, 2, 0, 5],
  [430, 450, 0, 2.5, 5], [520, 540, 0, 2.5, 5], [590, 610, 0, -2.5, 5], [660, 685, 2, 0, 5], [740, 780, -2, 2.5, 6],
  [830, 850, 0, -2.5, 5], [910, 930, 0, 2.5, 5], [980, 1000, -1.5, 0, 5], [1030, 1070, 0, 0, 6],
];
const BIT_HEIGHT = 0.9;
const BIT_RADIUS = 1.5;
// The ramp: its lip at psi, a kicker `length` long rising `height`, then a
// gap in the road and a flight of `flight` units peaking `apex` above it.
const RAMP = { psi: 148, length: 7, height: 1.4, gap: 16, flight: 30, apex: 4.2, speed: 18, bits: 6 };
// Glitzersteine along the race: the trails plus those over the ramp's gap.
export const RACE_BITS = BIT_TRAILS.reduce((n, trail) => n + trail[4], 0) + RAMP.bits;
const CRYSTAL = { ahead: 10, height: 4.6, scale: 1.5 };
const ARCH_RADIUS = HALF_WIDTH + 0.8;

// ---- Driving -------------------------------------------------------------------
// Speeds, and how Mirio steers, are in kart-physics.js (DRIVE). These are for
// Finster-Mirio's sliding, the rails, hops, pads and blocks.
// A slide this far sideways (slideOf) squeals once and raises dust.
const SLIDE_SOUND = 0.2;
const DUST = { slide: 0.15, every: 0.05, life: 0.45, count: 16, color: 0xe9e1d2 };
const STEER_SPEED = 8;
const STEER_RESPONSE = 10;
const LATERAL_ACCEL = 40;
const KART_HALF_WIDTH = 1.05;
const KART_HALF_LENGTH = 1.35;
const X_LIMIT = HALF_WIDTH - KART_HALF_WIDTH - RAIL_RADIUS * 0.5;
// Hitting a rail faster than this sideways bumps; slower just scrapes.
const WALL_HIT = 3.5;
const WALL_KEEP = 0.8;
const WALL_BOUNCE = 0.45;
const SCRAPE = 3;
const BUMP_COOLDOWN = 0.45;
const HOP_SPEED = 9;
const HOP_GRAVITY = 30;
const BOOST_TIME = 0.9;
const BLOCK_KEEP = 0.45;
const BLOCK_NUDGE = 3;
const KART_BUMP_KEEP = 0.95;
const LAND_SQUASH = 0.8;
const TRICK_TIME = 0.55;
// Drift sparks: while drifting, then charged for a blue and an orange mini-turbo.
const SPARKS = [0xffe27a, 0x3fb4ff, 0xff7a1a];
// After the line: stop this far past it (the rival a little behind), braking at least this hard.
const STOP_AFTER = 15;
const FINISH_DECEL = 7;
const FINISH_LANE = 1.8;

// Finster-Mirio: his pace is scaled to keep him near Mirio. He aims to be
// `sway` units ahead or behind, swinging along the race; near the end he
// settles just behind, so a child who keeps driving wins, but closely.
const AI = {
  rubber: 0.02, slowest: 0.85, fastest: 1.12, sway: 6, swayLength: 230, late: 0.86, lateGap: -4,
  inside: 45, maxInside: 2.2, lookAhead: 0.35,
  // Within this many units of Mirio he drives this far to his side, not into him.
  near: 7, apart: 3.2,
};

// ---- Timing (seconds) ----------------------------------------------------------------
const STEP = 1 / 120;
const MAX_DT = 0.1;
const POP_TIME = 0.45;
const RIVAL_POP_DELAY = 0.3;
const LEAP_START = 0.75;
const LEAP_TIME = 1.05;
const LEAP_HEIGHT = 3;
const CROUCH_TIME = 0.3;
const INTRO_TIME = 2.35;
const COUNT_STEP = 0.8;

// ---- Kart and drivers ------------------------------------------------------------
const KART = {
  // Miro's rocket (4.4 long, 1.57 round) as the kart body: this long and
  // wide, squashed to this height, its axis this far above the road.
  length: 0.56, width: 0.6, height: 0.44, axis: 0.78,
  // Facets of the rebuilt rocket body: plenty at kart size.
  segments: 24, rows: 28,
  wheelRadius: 0.4, wheelWidth: 0.34, hubColor: 0xffd23f, tyreColor: 0x2c2a31,
  front: { z: 0.72, x: 0.8 }, rear: { z: -0.6, x: 1.12 },
  pen: 1.4,
};
const DRIVER_SCALE = 0.88;
// Mirio's waist (model units) sits in the porthole.
const DRIVER_WAIST = 0.66;
const ARM_DRIVE = { x: 1.25, z: 0.45 };
const WHEEL_AT = { y: 0.27, z: 0.5, radius: 0.16, tilt: -0.85 };
const SHADOW_TINT = 0x5b3d8f;
// The dark kart is dyed lighter than its driver, or it reads as a black hole.
const DARK_KART_TINT = 0x8b6fd6;
const SHADOW_DRAIN = 0.8;
const EYE_COLOR = 0xff3a3a;
const CORONA_COLOR = 0xd4102a;
const EYES = { x: 0.17, y: 0.24, z: 0.335, slant: 0.45 };
const DARK_FLAME = 0xb070ff;
const SHADOW_SIZE = 3.4;
// Rocket flame scale (width, length): idling, and boosting.
const FLAME_IDLE = [0.55, 0.45];
const FLAME_GAS = [0.8, 1.1];
const FLAME_BOOST = [1.5, 2.6];

// ---- Camera -------------------------------------------------------------------------
// heading: share of Mirio's direction of travel the camera swings round
// with (all of it: steering turns the world, not the kart on screen); fov:
// degrees wider when boosting, and per unit of speed over cruising.
const CHASE = {
  distance: 5.8, height: 2.8, lookAhead: 4.5, lookUp: 1.2, boostPull: 1.4, follow: 8,
  heading: 1, boostFov: 9, speedFov: 0.4,
};
// The leap is filmed from the side: this far out plus a share of its length.
const INTRO_VIEW = { side: 5, perSpan: 0.4, height: 2.2, back: 1.5, lookUp: 1.8 };
const FINISH_VIEW = { angle: 0.75, distance: 6.8, height: 2.4, time: 2.5 };
const CAMERA_BLEND = 0.9;
// How much of the road's banking the camera leans with.
const CAMERA_BANK = 0.5;
const PLANET_CLEARANCE = 1.2;

const COLORS = {
  bits: [0xffe14d, 0xff6fb5, 0x5fe3ff, 0x8dff6a, 0xc58bff],
  road: '#62666f',
  roadStrokes: ['#7d818c', '#4b4f58', '#8b8f99'],
  roadEdge: '#fff6d8',
  roadMiddle: '#ffd23a',
  under: '#4b3a8c',
  rail: '#e0312e',
  crystal: 0x8ff3ff,
};

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const DEG = Math.PI / 180;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (from, to, rate, dt) => lerp(from, to, 1 - Math.exp(-rate * dt));

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const frameTmp = new THREE.Vector3();
const basis = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const bitMatrix = new THREE.Matrix4();
const bitQ = new THREE.Quaternion();
const bitTurn = new THREE.Quaternion();
const bitScale = new THREE.Vector3();
const flip = new THREE.Quaternion();

/** Value of an eased [key, value] table at `k`. */
function eased(table, k) {
  if (k <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (k > table[i][0]) continue;
    const [k0, v0] = table[i - 1];
    return lerp(v0, table[i][1], smoothstep(k0, table[i][0], k));
  }
  return table[table.length - 1][1];
}

function frameVectors() {
  return { pos: new THREE.Vector3(), tan: new THREE.Vector3(), up: new THREE.Vector3(), right: new THREE.Vector3() };
}

// ---- Geometry helpers --------------------------------------------------------------

function paint(geom, color) {
  const c = new THREE.Color(color);
  const colors = new Float32Array(geom.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geom;
}

/**
 * Normals averaged over all vertices at the same spot (each face counted
 * once), so a hull pushed out along them stays closed at hard edges.
 */
function cornerNormals(geom) {
  const pos = geom.attributes.position;
  const nor = geom.attributes.normal;
  const key = (i) => `${Math.round(pos.getX(i) * 1e3)},${Math.round(pos.getY(i) * 1e3)},${Math.round(pos.getZ(i) * 1e3)}`;
  const corners = new Map();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nor, i);
    const corner = corners.get(key(i)) ?? { sum: new THREE.Vector3(), seen: [] };
    if (!corner.seen.some((s) => s.dot(n) > 0.9999)) {
      corner.seen.push(n.clone());
      corner.sum.add(n);
    }
    corners.set(key(i), corner);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) n.copy(corners.get(key(i)).sum).normalize().toArray(out, i * 3);
  return new THREE.BufferAttribute(out, 3);
}

/**
 * `geom` and its felt-pen outline in one buffer: a copy pushed out along
 * `normals` by `thickness`, turned inside out and painted black, so only its
 * rim shows round the silhouette. One draw call instead of two; the material
 * needs vertexColors (the copy stays black under any light).
 */
function outlined(geom, thickness, normals = geom.attributes.normal) {
  const { position: pos, normal: nor, uv, color: col } = geom.attributes;
  const n = pos.count;
  const position = new Float32Array(n * 6);
  const normal = new Float32Array(n * 6);
  const color = new Float32Array(n * 6);
  const uvs = uv ? new Float32Array(n * 4) : null;
  const v = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).toArray(position, i * 3);
    v.addScaledVector(d.fromBufferAttribute(normals, i), thickness).toArray(position, (n + i) * 3);
    d.fromBufferAttribute(nor, i);
    d.toArray(normal, i * 3);
    d.toArray(normal, (n + i) * 3);
    if (col) v.fromBufferAttribute(col, i).toArray(color, i * 3);
    else color.fill(1, i * 3, i * 3 + 3);
    if (uvs) {
      uvs[i * 2] = uvs[(n + i) * 2] = uv.getX(i);
      uvs[i * 2 + 1] = uvs[(n + i) * 2 + 1] = uv.getY(i);
    }
  }
  const src = geom.index ? geom.index.array : Array.from({ length: n }, (_, i) => i);
  const index = new Uint32Array(src.length * 2);
  index.set(src);
  for (let i = 0; i < src.length; i += 3) {
    index[src.length + i] = src[i] + n;
    index[src.length + i + 1] = src[i + 2] + n;
    index[src.length + i + 2] = src[i + 1] + n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  if (uvs) out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

/** One indexed geometry from several with the same attributes. */
function merge(geoms) {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geoms[0].attributes)) {
    const size = geoms[0].attributes[name].itemSize;
    const all = new Float32Array(geoms.reduce((sum, g) => sum + g.attributes[name].count * size, 0));
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
    const count = g.attributes.position.count;
    const src = g.index ? g.index.array : Array.from({ length: count }, (_, i) => i);
    for (const i of src) index.push(base + i);
    base += count;
  }
  out.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
  return out;
}

/**
 * Replaces every pen-outline hull under `root` (withOutline() in
 * materials.js) by one baked into its mesh, `scale` times as thick.
 */
function bakeOutlines(root, scale = 1) {
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && o.children.some((c) => c.isMesh && c.material.uniforms?.thickness)) meshes.push(o);
  });
  for (const mesh of meshes) {
    const hull = mesh.children.find((c) => c.isMesh && c.material.uniforms?.thickness);
    mesh.geometry = outlined(mesh.geometry, hull.material.uniforms.thickness.value * scale, hull.geometry.attributes.normal);
    mesh.remove(hull);
    mesh.material.vertexColors = true;
  }
  // Meshes without a hull that share one of those materials still need colours.
  root.traverse((o) => {
    if (o.isMesh && o.material.vertexColors && !o.geometry.attributes.color) paint(o.geometry, 0xffffff);
  });
}

/** Merges the direct mesh children of `parent` that share a material. */
function mergeSiblings(parent) {
  const byMaterial = new Map();
  for (const c of parent.children) {
    if (!c.isMesh || c.children.length) continue;
    byMaterial.set(c.material, [...(byMaterial.get(c.material) ?? []), c]);
  }
  for (const [material, list] of byMaterial) {
    if (list.length < 2) continue;
    const geoms = list.map((m) => {
      m.updateMatrix();
      return m.geometry.clone().applyMatrix4(m.matrix);
    });
    for (const m of list) parent.remove(m);
    parent.add(new THREE.Mesh(merge(geoms), material));
  }
}

/** Toon material whose emissive glow follows the vertex (or instance) colour. */
function glowingToon(emissive) {
  const m = toon(0xffffff, { vertexColors: true, emissive });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;',
    );
  };
  m.customProgramCacheKey = () => 'kart-glow';
  return m;
}

const DRAINED_MAP = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float ink = dot( sampledDiffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
  sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, vec3( ink ), ${SHADOW_DRAIN.toFixed(3)} );
  diffuseColor *= sampledDiffuseColor;
#endif`;

function drainMap(shader) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', DRAINED_MAP);
}

/** The boss's dye (boss.js): every toon material violet, marker colour drained to grey first. */
function shadowTint(root, color = SHADOW_TINT) {
  const tint = new THREE.Color(color);
  const clones = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !o.material.isMeshToonMaterial) return;
    if (!clones.has(o.material)) {
      const mat = o.material.clone();
      mat.color.multiply(tint);
      if (mat.map) mat.onBeforeCompile = drainMap;
      clones.set(o.material, mat);
    }
    o.material = clones.get(o.material);
  });
}

function glowSprite(map, color, scale) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  s.scale.setScalar(scale);
  return s;
}

// ---- Canvases ---------------------------------------------------------------------

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Marker strokes along the canvas's y axis inside [x0, x1], tiling vertically. */
function markerStrokes(ctx, rnd, x0, x1, h, colors, count, alpha = 0.35) {
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = x0 + rnd() * (x1 - x0);
    const y = rnd() * h;
    const len = 30 + rnd() * 70;
    const lean = (rnd() - 0.5) * (i % 5 === 0 ? 60 : 10);
    ctx.strokeStyle = colors[i % colors.length];
    ctx.globalAlpha = alpha * (0.6 + rnd() * 0.4);
    ctx.lineWidth = 4 + rnd() * 6;
    for (const dy of [-h, 0, h]) {
      ctx.beginPath();
      ctx.moveTo(x, y + dy);
      ctx.quadraticCurveTo(x + lean * 0.5 + (rnd() - 0.5) * 6, y + dy + len / 2, x + lean, y + dy + len);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * The road: Miro's grey floor scribble across the top with white edge lines and
 * a dashed yellow middle, a dark violet column for its sides and underside.
 * u runs across the road, v along it.
 */
function roadTexture() {
  const w = 256;
  const h = 256;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(11);
  ctx.fillStyle = COLORS.under;
  ctx.fillRect(0, 0, w, h);
  markerStrokes(ctx, rnd, 0, TOP_U0 * w * 0.7, h, ['#6552b0', '#34266a'], 20);
  const x0 = TOP_U0 * w;
  ctx.fillStyle = COLORS.road;
  ctx.fillRect(x0, 0, w - x0, h);
  markerStrokes(ctx, rnd, x0, w, h, COLORS.roadStrokes, 70);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = COLORS.roadEdge;
  ctx.fillRect(x0 + 6, 0, 5, h);
  ctx.fillRect(w - 11, 0, 5, h);
  ctx.fillStyle = COLORS.roadMiddle;
  const mid = (x0 + w) / 2;
  for (let y = 0; y < h; y += 64) ctx.fillRect(mid - 4, y + 10, 8, 36);
  ctx.globalAlpha = 1;
  return canvasTexture(c, { repeat: true });
}

/** Red and white kerb stripes, diagonal so they wind round the rail tube. */
function railTexture() {
  const s = 64;
  const c = makeCanvas(s, s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = COLORS.rail;
  for (let k = -2; k <= 2; k++) {
    const o = k * s;
    ctx.beginPath();
    ctx.moveTo(o, s);
    ctx.lineTo(o + s * 0.5, s);
    ctx.lineTo(o + s * 1.5, 0);
    ctx.lineTo(o + s, 0);
    ctx.closePath();
    ctx.fill();
  }
  return canvasTexture(c, { repeat: true });
}

/**
 * Dash panels: glowing chevrons pointing along +v on an orange plate, and a
 * solid orange column (u > 0.82) for the ramp's sides.
 */
function arrowTexture() {
  const w = 128;
  const h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff7a1a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#c2410c';
  ctx.fillRect(0, 0, w * 0.8, h);
  ctx.lineJoin = 'round';
  for (const y0 of [0, h / 2, h]) {
    ctx.beginPath();
    ctx.moveTo(w * 0.08, y0 + 26);
    ctx.lineTo(w * 0.4, y0 + 2);
    ctx.lineTo(w * 0.72, y0 + 26);
    ctx.lineTo(w * 0.72, y0 + 44);
    ctx.lineTo(w * 0.4, y0 + 20);
    ctx.lineTo(w * 0.08, y0 + 44);
    ctx.closePath();
    ctx.fillStyle = '#ffe066';
    ctx.fill();
    ctx.strokeStyle = '#fff6c4';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  const tex = canvasTexture(c, { repeat: true });
  tex.repeat.y = 2;
  return tex;
}

/** Checkers (top half) and the "ZIEL" banner (bottom half), one texture. */
/** A soft round puff for the tyre dust. */
function puffTexture() {
  const c = makeCanvas(64, 64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return canvasTexture(c);
}

function finishTexture() {
  const w = 512;
  const h = 256;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const sq = 32;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#1b1410' : '#fffdf5';
      ctx.fillRect(x * sq, y * sq, sq, sq);
    }
  }
  ctx.fillStyle = '#e8243c';
  ctx.fillRect(0, 128, w, 128);
  ctx.fillStyle = '#fffdf5';
  ctx.fillRect(12, 140, w - 24, 104);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 92px "Comic Sans MS", "Chalkboard SE", "Comic Neue", sans-serif';
  ctx.lineJoin = 'round';
  const letters = ['Z', 'I', 'E', 'L'];
  const colors = ['#e8243c', '#ff9f1c', '#2bb24c', '#2d7ff9'];
  letters.forEach((ch, i) => {
    const x = w / 2 + (i - 1.5) * 86;
    const y = 194 + (i % 2 ? -4 : 4);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#1b1410';
    ctx.strokeText(ch, x, y);
    ctx.fillStyle = colors[i];
    ctx.fillText(ch, x, y);
  });
  return canvasTexture(c);
}

// ---- The track -------------------------------------------------------------------------

/**
 * The track line and its frames, sampled every SAMPLE_STEP units: position,
 * forward, banked up and right, the slope and the sideways curvature.
 */
export class Track {
  constructor(course) {
    const { start, finish } = course;
    const planet = finish.planet;
    const F = start.forward.clone().normalize();
    const U = start.up.clone().addScaledVector(F, -start.up.dot(F)).normalize();
    const R = new THREE.Vector3().crossVectors(F, U);
    const home = finish.dir.clone().normalize();
    const north = U.clone().addScaledVector(home, -U.dot(home)).normalize();
    const east = new THREE.Vector3().crossVectors(north, home);
    this.planet = planet;

    const around = ([psi, lat, alt]) => {
      const d = home.clone().multiplyScalar(Math.cos(psi * DEG)).addScaledVector(north, Math.sin(psi * DEG))
        .multiplyScalar(Math.cos(lat * DEG)).addScaledVector(east, Math.sin(lat * DEG));
      return planet.center.clone().addScaledVector(d, planet.radius + alt);
    };
    const keys = [
      ...START_KEYS.map(([r, u, f]) => start.pos.clone().addScaledVector(R, r).addScaledVector(U, u).addScaledVector(F, f)),
      ...DROP_KEYS.map(around),
    ];
    this.firstLapKey = keys.length;
    for (let psi = LAYOUT_FROM; psi <= 360 * LAPS + RUNOUT; psi += KEY_STEP) {
      const lat = eased(WEAVE_AMP, psi) * Math.sin((psi - WEAVE_PHASE) * WEAVE_WAVES * DEG) + eased(WEAVE_OFFSET, psi);
      keys.push(around([psi, lat, eased(ALTITUDE, psi)]));
    }

    const curve = new THREE.CatmullRomCurve3(keys, false, 'centripetal');
    this.perKey = 24;
    curve.arcLengthDivisions = (keys.length - 1) * this.perKey;
    this.keyLengths = curve.getLengths();
    this.length = this.keyLengths[this.keyLengths.length - 1];

    const count = Math.floor(this.length / SAMPLE_STEP) + 1;
    this.count = count;
    const arrays = ['pos', 'tan', 'up', 'right'].map(() => new Float32Array(count * 3));
    [this.P, this.T, this.N, this.B] = arrays;
    this.slope = new Float32Array(count);
    this.curv = new Float32Array(count);
    const up0 = new Float32Array(count * 3);
    this.N0 = up0;

    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    const ref = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const s = i * SAMPLE_STEP;
      const u = Math.min(1, s / this.length);
      curve.getPointAt(u, p).toArray(this.P, i * 3);
      curve.getTangentAt(u, t).toArray(this.T, i * 3);
      // Up turns from the arena's to the Zielplanet's; the slope is measured against it.
      const w = smoothstep(GRAVITY_TURN[0], GRAVITY_TURN[1], s);
      ref.subVectors(p, planet.center).normalize().multiplyScalar(w).addScaledVector(U, 1 - w).normalize();
      this.slope[i] = -t.dot(ref);
      n.copy(ref).addScaledVector(t, -ref.dot(t)).normalize().toArray(up0, i * 3);
    }

    // Bank every curve for BANK_SPEED, then smooth the angles along the track.
    const bank = new Float32Array(count);
    const t0 = new THREE.Vector3();
    const t1 = new THREE.Vector3();
    const r0 = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      t0.fromArray(this.T, Math.max(0, i - 1) * 3);
      t1.fromArray(this.T, Math.min(count - 1, i + 1) * 3);
      t.fromArray(this.T, i * 3);
      r0.crossVectors(t, n.fromArray(up0, i * 3));
      const span = (Math.min(count - 1, i + 1) - Math.max(0, i - 1)) * SAMPLE_STEP;
      this.curv[i] = t1.sub(t0).dot(r0) / span;
      bank[i] = clamp(Math.atan((BANK_SPEED ** 2 * this.curv[i]) / BANK_GRAVITY), -BANK_MAX, BANK_MAX);
    }
    const reach = Math.round(BANK_SMOOTH / SAMPLE_STEP);
    const smoothBank = boxFilter(boxFilter(bank, reach), reach);
    for (let i = 0; i < count; i++) {
      t.fromArray(this.T, i * 3);
      n.fromArray(up0, i * 3);
      r0.crossVectors(t, n);
      n.multiplyScalar(Math.cos(smoothBank[i])).addScaledVector(r0, Math.sin(smoothBank[i])).normalize();
      n.toArray(this.N, i * 3);
      r0.crossVectors(t, n).toArray(this.B, i * 3);
    }
  }

  /** Units along the track where the layout reaches angle `psi` (from LAYOUT_FROM on). */
  sAtPsi(psi) {
    const k = this.firstLapKey + (psi - LAYOUT_FROM) / KEY_STEP;
    const i = clamp(Math.floor(k), 0, this.keyLengths.length / this.perKey - 1);
    const a = this.keyLengths[Math.min(i * this.perKey, this.keyLengths.length - 1)];
    const b = this.keyLengths[Math.min((i + 1) * this.perKey, this.keyLengths.length - 1)];
    return lerp(a, b, k - i);
  }

  /** Position and frame at `s` into `out` (see frameVectors()). */
  frame(s, out) {
    const f = clamp(s / SAMPLE_STEP, 0, this.count - 1.001);
    const i = Math.floor(f);
    const k = f - i;
    const mix = (arr, v) => v.fromArray(arr, i * 3).lerp(frameTmp.fromArray(arr, i * 3 + 3), k);
    mix(this.P, out.pos);
    mix(this.T, out.tan).normalize();
    mix(this.N, out.up).normalize();
    mix(this.B, out.right).normalize();
    return out;
  }

  /** The track's up at `s` without the banking. */
  levelUp(s, out) {
    const f = clamp(s / SAMPLE_STEP, 0, this.count - 1.001);
    const i = Math.floor(f);
    return out.fromArray(this.N0, i * 3).lerp(frameTmp.fromArray(this.N0, i * 3 + 3), f - i).normalize();
  }

  /** World point `x` to the right of and `h` above the track at `s`. */
  point(s, x, h, out, f = this.frame(s, frameVectors())) {
    return out.copy(f.pos).addScaledVector(f.right, x).addScaledVector(f.up, h);
  }

  value(arr, s) {
    const f = clamp(s / SAMPLE_STEP, 0, this.count - 1.001);
    const i = Math.floor(f);
    return lerp(arr[i], arr[i + 1], f - i);
  }
}

function boxFilter(src, reach) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - reach); k <= Math.min(src.length - 1, i + reach); k++) {
      sum += src[k];
      n++;
    }
    out[i] = sum / n;
  }
  return out;
}

/** Collects vertices and triangles for the swept track meshes. */
class Mesher {
  constructor() {
    this.position = [];
    this.normal = [];
    this.uv = [];
    this.color = [];
    this.index = [];
  }

  get count() {
    return this.position.length / 3;
  }

  vertex(p, n, u, v, c) {
    this.position.push(p.x, p.y, p.z);
    this.normal.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.color.push(c.r, c.g, c.b);
  }

  add(geom, matrix) {
    const g = geom.clone().applyMatrix4(matrix);
    const base = this.count;
    const { position, normal, uv, color } = g.attributes;
    for (let i = 0; i < position.count; i++) {
      this.position.push(position.getX(i), position.getY(i), position.getZ(i));
      this.normal.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      this.color.push(color ? color.getX(i) : 1, color ? color.getY(i) : 1, color ? color.getZ(i) : 1);
    }
    const src = g.index ? g.index.array : Array.from({ length: position.count }, (_, i) => i);
    for (const i of src) this.index.push(base + i);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    g.setIndex(this.index);
    return g;
  }
}

const WHITE = new THREE.Color(1, 1, 1);
const BLACK = new THREE.Color(0, 0, 0);

/** Evenly spaced track positions from s0 to s1, about `step` apart. */
function stations(s0, s1, step) {
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  return Array.from({ length: n + 1 }, (_, i) => lerp(s0, s1, i / n));
}

/**
 * Sweeps a cross-section along the track through the positions `at`.
 * `section(s)` lists points [x, h, u, nx, nh] (offset, height, texture u,
 * section normal); `faces` are [a, b] point pairs, each a strip whose front
 * faces the side where (b - a) x forward points. `hull` turns the strips
 * inside out, black.
 */
function sweep(mesher, track, at, section, faces, { vLength = 1, hull = false } = {}) {
  const f = frameVectors();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const base = mesher.count;
  const rings = at.length - 1;
  let per = 0;
  for (const s of at) {
    track.frame(s, f);
    const points = section(s);
    per = points.length;
    for (const [x, h, u, nx, nh] of points) {
      p.copy(f.pos).addScaledVector(f.right, x).addScaledVector(f.up, h);
      n.copy(f.right).multiplyScalar(nx).addScaledVector(f.up, nh).normalize();
      mesher.vertex(p, n, u, s / vLength, hull ? BLACK : WHITE);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (const [a, b] of faces) {
      const a0 = base + r * per + a;
      const b0 = base + r * per + b;
      const a1 = a0 + per;
      const b1 = b0 + per;
      if (hull) mesher.index.push(a0, b1, b0, a0, a1, b1);
      else mesher.index.push(a0, b0, b1, a0, b1, a1);
    }
  }
}

/** Flat end cap (quad a, b, c, d of a section) facing forward (+1) or back (-1). */
function cap(mesher, track, s, points, facing) {
  const f = track.frame(s, frameVectors());
  const n = f.tan.clone().multiplyScalar(facing);
  const base = mesher.count;
  for (const [x, h] of points) {
    mesher.vertex(tmp.copy(f.pos).addScaledVector(f.right, x).addScaledVector(f.up, h), n, UNDER_U, 0.5, WHITE);
  }
  if (facing > 0) mesher.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else mesher.index.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

function roadSlab(mesher, track, s0, s1) {
  const W = HALF_WIDTH;
  const w = HALF_WIDTH - ROAD_TAPER;
  const top = ROAD_LIFT;
  const bottom = ROAD_LIFT - ROAD_THICKNESS;
  const section = () => [
    [-W, top, TOP_U0, 0, 1], [W, top, 1, 0, 1],
    [W, top, UNDER_U, 1, 0], [w, bottom, UNDER_U, 1, 0],
    [w, bottom, UNDER_U, 0, -1], [-w, bottom, UNDER_U, 0, -1],
    [-w, bottom, UNDER_U, -1, 0], [-W, top, UNDER_U, -1, 0],
  ];
  const at = stations(s0, s1, ROAD_STEP);
  sweep(mesher, track, at, section, [[0, 1], [2, 3], [4, 5], [6, 7]], { vLength: ROAD_TEX_LENGTH });
  const P = PEN;
  const hull = () => [[-W - P, top + P, 0, -1, 1], [W + P, top + P, 0, 1, 1], [w + P, bottom - P, 0, 1, -1], [-w - P, bottom - P, 0, -1, -1]];
  sweep(mesher, track, at, hull, [[0, 1], [1, 2], [2, 3], [3, 0]], { hull: true });
  const end = [[-W, top], [W, top], [w, bottom], [-w, bottom]];
  cap(mesher, track, s0, end, -1);
  cap(mesher, track, s1, end, 1);
}

/** A round rail tube along one edge, closed to a point at both ends. */
function rail(mesher, track, s0, s1, side) {
  const cx = side * (HALF_WIDTH + RAIL_OUT);
  const at = [s0, s0 + RAIL_TIP / 2, ...stations(s0 + RAIL_TIP, s1 - RAIL_TIP, RAIL_STEP), s1 - RAIL_TIP / 2, s1];
  const ring = (grow) => (s) => {
    const r = RAIL_RADIUS * Math.sqrt(clamp(Math.min(s - s0, s1 - s) / RAIL_TIP, 0, 1));
    const out = r > 0 ? grow : 0;
    return Array.from({ length: RAIL_SIDES + 1 }, (_, i) => {
      const a = -(i / RAIL_SIDES) * Math.PI * 2;
      return [cx + Math.cos(a) * (r + out), RAIL_HEIGHT + Math.sin(a) * (r + out), i / RAIL_SIDES, Math.cos(a), Math.sin(a)];
    });
  };
  const faces = Array.from({ length: RAIL_SIDES }, (_, i) => [i, i + 1]);
  sweep(mesher, track, at, ring(0), faces, { vLength: RAIL_TEX_LENGTH });
  sweep(mesher, track, at, ring(PEN), faces, { hull: true });
}

/** Places a geometry (+Z forward, +Y up) on the track at (s, x, h). */
function trackMatrix(track, s, x, h, out = new THREE.Matrix4()) {
  const f = track.frame(s, frameVectors());
  basis.makeBasis(f.right.clone().negate(), f.up, f.tan);
  out.copy(basis).setPosition(track.point(s, x, h, tmp, f));
  return out;
}

// ---- Karts and drivers -------------------------------------------------------------------

function wheelPair(halfTrack) {
  const { wheelRadius: r, wheelWidth: w } = KART;
  const parts = [];
  for (const side of [-1, 1]) {
    const tyre = paint(new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2).translate(side * halfTrack, 0, 0), KART.tyreColor);
    // Five-sided hubs, so you can see the wheels turn.
    const hub = paint(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.08, 5).rotateZ(Math.PI / 2).translate(side * halfTrack, 0, 0), KART.hubColor);
    for (const g of [tyre, hub]) parts.push(outlined(g, 0.035, cornerNormals(g)));
  }
  return merge(parts);
}

/**
 * Rebuilds the rocket body (props.js) with fewer facets: the same outline and
 * texture, laid out the same way.
 */
function simplifyBody(mesh, height) {
  const { points, phiStart } = mesh.geometry.parameters;
  const step = Math.max(1, Math.round((points.length - 1) / KART.rows));
  const fewer = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const geom = new THREE.LatheGeometry(fewer, KART.segments, phiStart);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    geom.attributes.uv.setY(i, pos.getY(i) / height);
    if (Math.hypot(pos.getX(i), pos.getZ(i)) < 1e-6) geom.attributes.normal.setXYZ(i, 0, pos.getY(i) > 0 ? 1 : -1, 0);
  }
  mesh.geometry = geom;
  for (const hull of mesh.children) hull.geometry = geom;
}

/**
 * Miro's rocket as a kart: lying nose forward, its lone fin up as a
 * spoiler, the other two down the sides; the porthole turned to the top is
 * the seat. `dark` dyes it for Finster-Mirio.
 */
function buildKart(art, dark) {
  const rocket = buildRocket(art);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Lying down: the rocket's +Y (nose) becomes +Z, its -Z (the lone fin) +Y.
  const shell = rocket.group;
  shell.rotation.x = Math.PI / 2;
  shell.scale.set(KART.width, KART.length, KART.height);
  shell.position.set(0, KART.axis, -(rocket.height * KART.length) / 2);
  body.add(shell);
  simplifyBody(shell.children[0], rocket.height);

  const porthole = shell.children.find((c) => c.isGroup && c !== rocket.flame);
  const glass = porthole.children.find((c) => c.isMesh && c.geometry.type === 'SphereGeometry');
  porthole.remove(glass);
  porthole.position.set(-porthole.position.x, porthole.position.y, -porthole.position.z);
  porthole.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.PI));

  bakeOutlines(shell, KART.pen);
  mergeSiblings(shell);

  // One mesh for both flame cones: vertex colours instead of two materials.
  const cones = rocket.flame.children;
  const flameGeom = merge(cones.map((m) => {
    const color = m.material.color.clone();
    if (dark) color.multiply(new THREE.Color(DARK_FLAME)).multiplyScalar(1.6);
    return paint(m.geometry.clone(), color);
  }));
  const flameMat = cones[0].material.clone();
  flameMat.color.set(0xffffff);
  flameMat.vertexColors = true;
  rocket.flame.clear();
  rocket.flame.add(new THREE.Mesh(flameGeom, flameMat));

  const wheelMat = toon(0xffffff, { vertexColors: true });
  const frontSteer = new THREE.Group();
  frontSteer.position.set(0, KART.wheelRadius, KART.front.z);
  const front = new THREE.Mesh(wheelPair(KART.front.x), wheelMat);
  frontSteer.add(front);
  const rear = new THREE.Mesh(wheelPair(KART.rear.x), wheelMat);
  rear.position.set(0, KART.wheelRadius, KART.rear.z);
  body.add(frontSteer, rear);

  root.updateMatrixWorld(true);
  const seat = new THREE.Group();
  seat.position.copy(root.worldToLocal(porthole.getWorldPosition(new THREE.Vector3())));
  body.add(seat);

  const wheelGeom = new THREE.TorusGeometry(WHEEL_AT.radius, 0.04, 8, 20);
  const steering = new THREE.Mesh(outlined(paint(wheelGeom, 0x3a3440), 0.03), toon(0xffffff, { vertexColors: true }));
  steering.position.set(0, seat.position.y + WHEEL_AT.y, seat.position.z + WHEEL_AT.z);
  steering.rotation.x = WHEEL_AT.tilt;
  body.add(steering);

  if (dark) shadowTint(root, DARK_KART_TINT);
  return { root, body, front, frontSteer, rear, seat, steering, flame: rocket.flame, spin: 0 };
}

/** Two slanted red eyes and a red glow behind the head, like the boss. */
function addEyes(head, art) {
  const eyes = merge([-1, 1].map((s) => new THREE.SphereGeometry(1, 12, 8)
    .scale(0.085, 0.052, 0.03).rotateZ(EYES.slant * s).rotateY(0.4 * s).translate(EYES.x * s, EYES.y, EYES.z)));
  head.add(new THREE.Mesh(eyes, new THREE.MeshBasicMaterial({ color: EYE_COLOR })));
  const corona = glowSprite(art.glow, CORONA_COLOR, 2.3);
  corona.position.y = 0.3;
  head.add(corona);
}

function buildDriver(art, dark) {
  const model = buildMirio(art);
  bakeOutlines(model.group);
  if (dark) {
    shadowTint(model.group);
    addEyes(model.head, art);
  }
  model.group.scale.setScalar(DRIVER_SCALE);
  // In the kart only his top half shows: hips and legs are inside the rocket.
  model.hidden = [model.legL, model.legR, model.body.children.filter((c) => c.isMesh)[2]];
  return model;
}


// ---- The race ------------------------------------------------------------------------------

export class KartRace {
  constructor(scene, art, course) {
    this.planets = course.planets;
    this.track = new Track(course);
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.placeFeatures();
    this.buildTrack(art);
    // The rest of each racer's state is set by resetRacer().
    this.player = { kart: buildKart(art, false), driver: buildDriver(art, false) };
    this.rival = { kart: buildKart(art, true), driver: buildDriver(art, true) };
    // A soft blob under each kart: the one depth cue a jump needs.
    const shadowGeom = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: art.shadow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    for (const r of [this.player, this.rival]) {
      r.shadow = new THREE.Mesh(shadowGeom, shadowMat);
      this.group.add(r.kart.root, r.shadow);
    }
    this.aiLine = this.planAiLine();
    this.sparks = [-1, 1].map((side) => {
      const s = glowSprite(art.sparkle, 0xffffff, 1);
      s.position.set(side * KART.rear.x * 0.9, 0.2, KART.rear.z - 0.35);
      s.visible = false;
      this.player.kart.body.add(s);
      return s;
    });
    // Tyre dust while sliding: a few puffs, reused in turn.
    const puffMap = puffTexture();
    this.puffs = Array.from({ length: DUST.count }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffMap, color: DUST.color, transparent: true, depthWrite: false }));
      sprite.visible = false;
      this.group.add(sprite);
      return { sprite, life: 0 };
    });
    this.puffNext = 0;
    this.puffWait = 0;

    this.poofs = [0, 1].map(() => {
      const s = glowSprite(art.sparkle, 0xffffff, 1);
      s.visible = false;
      this.group.add(s);
      return s;
    });

    this.frameA = frameVectors();
    this.frameB = frameVectors();
    this.cam = {
      fresh: true, blend: 1, from: new THREE.Vector3(), fromUp: new THREE.Vector3(), fromLook: new THREE.Vector3(),
      offset: new THREE.Vector3(), up: new THREE.Vector3(), look: new THREE.Vector3(), pos: new THREE.Vector3(),
    };
    this.from = { pos: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
    this.reset();
  }

  get state() {
    return this.phase;
  }

  get progress() {
    return clamp((this.player.s - GRID.s) / (this.sFinish - GRID.s), 0, 1);
  }

  get place() {
    if (this.player.finished) return this.result.place;
    return this.rival.s > this.player.s ? 2 : 1;
  }

  get racers() {
    return 2;
  }

  get bitCount() {
    return this.bits.length;
  }

  /** Degrees to widen the camera by for the sense of speed. */
  get fovKick() {
    return this.phase === 'idle' ? 0 : this.cam.kick;
  }

  // ---- Setup ------------------------------------------------------------------

  placeFeatures() {
    const tr = this.track;
    this.sFinish = tr.sAtPsi(360 * LAPS);
    this.sStop = this.sFinish + STOP_AFTER;

    const lip = tr.sAtPsi(RAMP.psi);
    this.ramp = { s0: lip - RAMP.length, lip, gapEnd: lip + RAMP.gap };
    this.pads = PADS.map(([psi, x]) => {
      const s = tr.sAtPsi(psi);
      return { s0: s - PAD.length / 2, s1: s + PAD.length / 2, x, half: PAD.width / 2 };
    });
    this.pads.push({ s0: this.ramp.s0, s1: lip, x: 0, half: HALF_WIDTH - 0.3, isRamp: true });
    this.blocks = BLOCKS.map(([psi, x]) => ({ s: tr.sAtPsi(psi), x }));

    this.bits = [];
    for (const [p0, p1, x0, x1, n] of BIT_TRAILS) {
      for (let i = 0; i < n; i++) {
        const k = n > 1 ? i / (n - 1) : 0;
        this.bits.push({ s: tr.sAtPsi(lerp(p0, p1, k)), x: lerp(x0, x1, k), h: BIT_HEIGHT });
      }
    }
    for (let i = 0; i < RAMP.bits; i++) {
      const k = (i + 1) / (RAMP.bits + 1);
      this.bits.push({ s: lip + k * RAMP.flight, x: 0, h: this.flightHeight(k, RAMP.height) + BIT_HEIGHT });
    }
    this.bits.sort((a, b) => a.s - b.s);
    for (const [i, b] of this.bits.entries()) {
      const f = tr.frame(b.s, frameVectors());
      b.pos = tr.point(b.s, b.x, b.h, new THREE.Vector3(), f);
      b.up = f.up.clone();
      b.color = COLORS.bits[i % COLORS.bits.length];
      b.phase = i * 0.7;
    }
  }

  /** Height of the ramp flight above the road, `k` = 0..1 along it. */
  flightHeight(k, from) {
    return from * (1 - k) + 4 * RAMP.apex * k * (1 - k);
  }

  /** The road surface's height: the ramp kicker, else 0. */
  groundAt(s) {
    const r = this.ramp;
    if (s < r.s0 || s > r.lip) return 0;
    const k = (s - r.s0) / RAMP.length;
    return RAMP.height * k * k;
  }

  buildTrack(art) {
    const tr = this.track;
    const r = this.ramp;
    const end = tr.length - 0.5;

    const road = new Mesher();
    const rails = new Mesher();
    for (const [a, b] of [[0, r.lip], [r.gapEnd, end]]) {
      roadSlab(road, tr, a, b);
      for (const side of [-1, 1]) rail(rails, tr, a, b, side);
    }
    this.group.add(new THREE.Mesh(road.geometry(), toon(0xffffff, { map: roadTexture(), vertexColors: true })));
    this.group.add(new THREE.Mesh(rails.geometry(), toon(0xffffff, { map: railTexture(), vertexColors: true })));

    // Dash panels and the ramp: one glowing, scrolling texture.
    const dash = new Mesher();
    for (const p of this.pads) {
      if (p.isRamp) continue;
      const section = () => [[p.x - p.half, PAD.lift, 0.02, 0, 1], [p.x + p.half, PAD.lift, 0.78, 0, 1]];
      sweep(dash, tr, stations(p.s0, p.s1, 1.25), section, [[0, 1]], { vLength: PAD.length });
    }
    this.buildRamp(dash);
    this.arrows = arrowTexture();
    this.group.add(new THREE.Mesh(dash.geometry(), new THREE.MeshBasicMaterial({ map: this.arrows, vertexColors: true })));

    // Miro's floor blocks.
    const blocks = new Mesher();
    const box = new THREE.BoxGeometry(BLOCK.size, BLOCK.height, BLOCK.size).translate(0, BLOCK.height / 2 + ROAD_LIFT, 0);
    const boxOutlined = outlined(box, PEN, cornerNormals(box));
    for (const b of this.blocks) blocks.add(boxOutlined, trackMatrix(tr, b.s, b.x, 0));
    this.group.add(new THREE.Mesh(blocks.geometry(), toon(0xffffff, { map: art.floor, vertexColors: true })));

    this.buildBits();
    this.buildFinish(art);
  }

  buildRamp(dash) {
    const tr = this.track;
    const r = this.ramp;
    const W = HALF_WIDTH - 0.3;
    const top = (s) => ROAD_LIFT + this.groundAt(s);
    const section = (s) => [
      [-W, top(s), 0.02, 0, 1], [W, top(s), 0.78, 0, 1],
      [W, top(s), 0.9, 1, 0], [W, ROAD_LIFT, 0.9, 1, 0],
      [-W, ROAD_LIFT, 0.9, -1, 0], [-W, top(s), 0.9, -1, 0],
    ];
    sweep(dash, tr, stations(r.s0, r.lip, 0.5), section, [[0, 1], [2, 3], [4, 5]], { vLength: RAMP.length });
    const bottom = ROAD_LIFT - ROAD_THICKNESS;
    const base = dash.count;
    cap(dash, tr, r.lip, [[-W, top(r.lip)], [W, top(r.lip)], [W, bottom], [-W, bottom]], 1);
    for (let i = base; i < dash.count; i++) dash.uv[i * 2] = 0.9;
    const P = PEN;
    const hull = (s) => [[-W - P, top(s) + P, 0.9, -1, 1], [W + P, top(s) + P, 0.9, 1, 1], [W + P, ROAD_LIFT - P, 0.9, 1, -1], [-W - P, ROAD_LIFT - P, 0.9, -1, -1]];
    sweep(dash, tr, stations(r.s0 + 0.2, r.lip, 0.5), hull, [[0, 1], [1, 2], [3, 0]], { hull: true });
  }

  buildBits() {
    const gem = gemGeometry(0.34);
    const radial = gem.attributes.position.clone();
    for (let i = 0; i < radial.count; i++) tmp.fromBufferAttribute(radial, i).normalize().toArray(radial.array, i * 3);
    const mesh = new THREE.InstancedMesh(outlined(gem, 0.06, radial), glowingToon(new THREE.Color(0.5, 0.5, 0.5)), this.bits.length);
    const c = new THREE.Color();
    this.bits.forEach((b, i) => mesh.setColorAt(i, c.set(b.color)));
    mesh.frustumCulled = false;
    this.bitMesh = mesh;
    this.group.add(mesh);
  }

  buildFinish(art) {
    const tr = this.track;
    const mesher = new Mesher();
    const lift = ROAD_LIFT + 0.03;
    // The lines are the checker rows (top half of the texture).
    for (const s of [START_LINE, this.sFinish]) {
      const section = () => [[-HALF_WIDTH, lift, 0, 0, 1], [HALF_WIDTH, lift, 1, 0, 1]];
      const at = mesher.count;
      sweep(mesher, tr, stations(s - 1.2, s + 1.2, 0.6), section, [[0, 1]], { vLength: 1 });
      for (let i = at; i < mesher.count; i++) mesher.uv[i * 2 + 1] = 0.5 + ((i - at) >> 1) / 4 * 0.5;
    }

    const arch = new THREE.TorusGeometry(ARCH_RADIUS, 0.42, 10, 32, Math.PI);
    const uv = arch.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), 0.5 + uv.getY(i) * 0.5);
    mesher.add(outlined(arch, PEN), trackMatrix(tr, this.sFinish, 0, ROAD_LIFT));

    const board = new THREE.BoxGeometry(7, 1.5, 0.3);
    const buv = board.attributes.uv;
    for (let i = 0; i < buv.count; i++) {
      const face = Math.floor(i / 4);
      // Front and back show the banner; the edges its red frame.
      if (face >= 4) buv.setXY(i, buv.getX(i), buv.getY(i) * 0.5);
      else buv.setXY(i, 0.005, 0.01);
    }
    mesher.add(outlined(board, PEN, cornerNormals(board)), trackMatrix(tr, this.sFinish, 0, ARCH_RADIUS + 0.2));
    this.group.add(new THREE.Mesh(mesher.geometry(), toon(0xffffff, { map: finishTexture(), vertexColors: true })));

    // The big crystal, waiting past the line.
    const crystalGeom = paint(bigCrystalGeometry(), COLORS.crystal);
    const crystal = new THREE.Mesh(
      merge([outlined(crystalGeom, 0.05, cornerNormals(crystalGeom))]),
      glowingToon(new THREE.Color(0.2, 0.45, 0.55)),
    );
    crystal.scale.setScalar(CRYSTAL.scale);
    const halo = glowSprite(art.glow, 0x9eeeff, 7);
    this.crystal = new THREE.Group();
    this.crystal.add(crystal, halo);
    this.crystalMesh = crystal;
    this.crystalAt = trackMatrix(tr, this.sFinish + CRYSTAL.ahead, 0, CRYSTAL.height);
    this.group.add(this.crystal);
  }

  /** The rival's line: the inside of curves, onto dash panels, round blocks. */
  planAiLine() {
    const tr = this.track;
    const n = Math.ceil(tr.length) + 1;
    const line = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let x = clamp(tr.value(tr.curv, i) * AI.inside, -AI.maxInside, AI.maxInside);
      for (const p of this.pads) if (!p.isRamp && i > p.s0 - 12 && i < p.s1) x = p.x;
      for (const b of this.blocks) {
        if (Math.abs(i - b.s) < 10 && Math.abs(x - b.x) < 2.8) x = b.x + (b.x > 0.3 || (b.x > -0.3 && x < 0) ? -3 : 3);
      }
      line[i] = x;
    }
    return boxFilter(line, 5);
  }

  // ---- Contract ---------------------------------------------------------------------

  reset() {
    this.phase = 'idle';
    this.group.visible = false;
    this.t = 0;
    this.raceTime = 0;
    this.countShown = 0;
    this.result = null;
    this.lane = -1;
    for (const b of this.bits) b.taken = false;
    this.resetRacer(this.player, -GRID.x);
    this.resetRacer(this.rival, GRID.x);
    this.cam.fresh = true;
    this.cam.kick = 0;
    this.crystal.visible = true;
    for (const p of this.poofs) p.visible = false;
    for (const p of this.puffs ?? []) {
      p.life = 0;
      p.sprite.visible = false;
    }
    this.animate(0);
  }

  resetRacer(r, x) {
    Object.assign(r, {
      s: GRID.s, x, vx: 0, h: 0, vh: 0, v: 0, steer: 0, pace: 1,
      yaw: 0, course: 0, drift: 0, charge: 0, turbo: 0, scraping: false, sliding: false, throttle: 0,
      air: false, flight: null, trick: 0, tricked: false, boost: 0, lastPad: null, bumpCool: 0,
      squash: 1, finished: false, finishTime: 0, cheer: 0,
    });
    r.kart.root.scale.setScalar(1);
    this.seat(r);
  }

  /** Puts the driver in the kart's porthole. */
  seat(r) {
    const m = r.driver;
    r.kart.seat.add(m.group);
    m.group.position.set(0, -DRIVER_WAIST * DRIVER_SCALE, 0);
    m.group.quaternion.identity();
    m.body.scale.set(1, 1, 1);
    for (const o of m.hidden) o.visible = false;
    r.seated = true;
  }

  begin(from) {
    this.reset();
    this.phase = 'intro';
    this.group.visible = true;
    this.from.pos.copy(from.pos);
    this.from.up.copy(from.up).normalize();

    // Mirio takes the grid slot on his side of the track.
    const f = this.track.frame(GRID.s, this.frameA);
    this.lane = tmp.subVectors(from.pos, f.pos).dot(f.right) > 0 ? 1 : -1;
    this.player.x = this.lane * GRID.x;
    this.rival.x = -this.lane * GRID.x;
    for (const r of [this.player, this.rival]) r.kart.root.scale.setScalar(0.001);

    // His own model stands where he was; main hides the player's.
    const m = this.player.driver;
    this.group.add(m.group);
    for (const o of m.hidden) o.visible = true;
    this.player.seated = false;
    this.updateIntro();
    this.animate(0);
  }

  update(dt, input) {
    const events = [];
    if (this.phase === 'idle') return events;
    dt = Math.min(dt, MAX_DT);
    this.t += dt;

    if (this.phase === 'intro' || this.phase === 'countdown') {
      input.consumeJump();
      input.consumeSpin();
    }
    if (this.phase === 'intro') {
      this.updateIntro();
      if (this.t >= INTRO_TIME) {
        this.phase = 'countdown';
        this.t = 0;
        this.countShown = 1;
        events.push({ type: 'countdown', n: 3 });
      }
    } else if (this.phase === 'countdown') {
      const step = Math.floor(this.t / COUNT_STEP);
      while (this.countShown <= Math.min(step, 2)) {
        events.push({ type: 'countdown', n: 3 - this.countShown });
        this.countShown++;
      }
      if (step >= 3) {
        this.phase = 'race';
        this.t = 0;
        events.push({ type: 'go' });
      }
    } else {
      const ctl = {
        steer: input.drive.steer,
        throttle: input.drive.gas,
        // Both pedals at once is a drift (the touch buttons have no third
        // thumb for jump); the brake then does not brake.
        brake: input.drive.gas ? 0 : input.drive.brake,
        jump: input.consumeJump(),
        hold: input.jumpHeld || (input.drive.gas > 0 && input.drive.brake > 0),
        spin: input.consumeSpin(),
      };
      this.simulate(dt, ctl, events);
    }

    this.animate(dt);
    return events;
  }

  skipTo(fraction) {
    const p = this.player;
    if (this.phase !== 'race') {
      this.group.visible = true;
      for (const r of [this.player, this.rival]) {
        r.kart.root.scale.setScalar(1);
        if (!r.seated) this.seat(r);
      }
      this.phase = 'race';
      this.cam.fresh = true;
    }
    Object.assign(p, {
      s: GRID.s + clamp(fraction, 0, 1) * (this.sFinish - GRID.s),
      h: 0, vh: 0, air: false, flight: null, trick: 0, tricked: false, lastPad: null, finished: false,
      yaw: 0, course: 0, drift: 0, charge: 0,
    });
    this.result = null;
    p.v = Math.max(p.v, DRIVE.cruise);
    const q = this.rival;
    if (!q.finished && Math.abs(q.s - p.s) > 12) {
      Object.assign(q, { s: p.s - 6, h: 0, vh: 0, air: false, flight: null, lastPad: null, v: p.v });
    }
    this.animate(0);
  }

  // ---- Intro -------------------------------------------------------------------------

  updateIntro() {
    const t = this.t;
    const m = this.player.driver;
    const kart = this.player.kart;
    const pop = (k) => {
      if (k <= 0) return 0.001;
      if (k >= 1) return 1;
      return 1 + Math.sin(k * Math.PI * 1.5) * (1 - k) * 0.6 - (1 - k) ** 3;
    };
    kart.root.scale.setScalar(pop(t / POP_TIME));
    this.rival.kart.root.scale.setScalar(pop((t - RIVAL_POP_DELAY) / POP_TIME));
    this.poofs.forEach((sprite, i) => {
      const k = (t - i * RIVAL_POP_DELAY) / (POP_TIME * 1.4);
      sprite.visible = k > 0 && k < 1;
      if (!sprite.visible) return;
      const r = i ? this.rival : this.player;
      r.kart.root.getWorldPosition(sprite.position).addScaledVector(this.track.frame(r.s, this.frameB).up, 1);
      sprite.scale.setScalar(1 + k * 5);
      sprite.material.opacity = 1 - k;
      sprite.material.color.set(i ? 0xc58bff : 0xfff3b0);
    });
    if (this.player.seated) return;

    // Where the seat will be once the kart has popped up to full size.
    const f = this.track.frame(this.player.s, this.frameB);
    const seat = tmp2.copy(kart.seat.position).applyQuaternion(kart.root.quaternion).add(kart.root.position);
    const dir = tmp.subVectors(seat, this.from.pos);
    const up = this.from.up;
    const k = clamp((t - LEAP_START) / LEAP_TIME, 0, 1);
    const pos = new THREE.Vector3().copy(this.from.pos).lerp(seat, k).addScaledVector(up, 4 * (LEAP_HEIGHT + dir.length() * 0.12) * k * (1 - k));
    pos.addScaledVector(f.up, -DRIVER_WAIST * DRIVER_SCALE * smoothstep(0.6, 1, k));
    const facing = (dir.addScaledVector(up, -dir.dot(up)).lengthSq() > 1e-4 ? dir.normalize() : f.tan.clone())
      .lerp(f.tan, smoothstep(0.4, 1, k)).normalize();
    const blendUp = up.clone().lerp(f.up, k).normalize();
    const side = new THREE.Vector3().crossVectors(blendUp, facing).normalize();
    const fwd = new THREE.Vector3().crossVectors(side, blendUp);
    basis.makeBasis(side, blendUp, fwd);
    m.group.quaternion.setFromRotationMatrix(basis);
    // A front flip on the way in.
    m.group.quaternion.multiply(flip.setFromAxisAngle(X, Math.PI * 2 * smoothstep(0.15, 0.85, k)));
    m.group.position.copy(pos);

    const crouch = smoothstep(LEAP_START - CROUCH_TIME, LEAP_START, t) * (1 - smoothstep(LEAP_START, LEAP_START + 0.1, t));
    m.body.scale.set(1 + crouch * 0.15, 1 - crouch * 0.25, 1 + crouch * 0.15);
    const tuck = Math.sin(k * Math.PI);
    m.legL.rotation.x = m.legR.rotation.x = tuck * 1.1;
    this.poseArms(m, k > 0 && k < 1 ? 1 : crouch * 0.3, 0, 0);
    if (k >= 1) {
      this.seat(this.player);
      this.player.squash = LAND_SQUASH;
    }
  }

  // ---- Physics ------------------------------------------------------------------------

  simulate(dt, ctl, events) {
    const steps = Math.max(1, Math.round(dt / STEP));
    const h = dt / steps;
    const p = this.player;
    const q = this.rival;
    for (let i = 0; i < steps; i++) {
      // Keeps running after Mirio's finish, for the rival's time.
      this.raceTime += h;
      this.updatePace();
      const mine = p.finished ? this.autoControl(p, this.lane * FINISH_LANE) : { ...ctl, jump: ctl.jump && i === 0, spin: ctl.spin && i === 0 };
      const theirs = q.finished ? this.autoControl(q, -this.lane * FINISH_LANE) : this.aiControl(q);
      this.stepRacer(p, h, mine, events, true);
      this.stepRacer(q, h, theirs, events, false);
      this.collideKarts(events);

      if (!q.finished && q.s >= this.sFinish) {
        q.finished = true;
        q.finishTime = this.raceTime - (q.s - this.sFinish) / Math.max(q.v, 1);
      }
      if (!p.finished && p.s >= this.sFinish) {
        p.finished = true;
        p.finishTime = this.raceTime - (p.s - this.sFinish) / Math.max(p.v, 1);
        const place = q.finished && q.finishTime < p.finishTime ? 2 : 1;
        this.result = { place, time: p.finishTime };
        this.phase = 'finished';
        this.t = 0;
        events.push({ type: 'finish', place, time: p.finishTime });
      }
    }
  }

  /** Rubber band: the rival's pace keeps him within reach of Mirio. */
  updatePace() {
    const p = this.player;
    const q = this.rival;
    if (q.finished || p.finished) {
      q.pace = 1;
      return;
    }
    const want = this.progress > AI.late ? AI.lateGap : AI.sway * Math.sin((p.s / AI.swayLength) * Math.PI * 2);
    q.pace = clamp(1 + (want - (q.s - p.s)) * AI.rubber, AI.slowest, AI.fastest);
  }

  aiControl(r) {
    const i = clamp(Math.round(r.s + r.v * AI.lookAhead), 0, this.aiLine.length - 1);
    let target = this.aiLine[i];
    const p = this.player;
    const blocked = this.blocks.some((b) => b.s > r.s && b.s < r.s + 12);
    if (Math.abs(r.s - p.s) < AI.near && !blocked) {
      const away = p.x > r.x ? -1 : 1;
      target = clamp(p.x + away * AI.apart, -X_LIMIT, X_LIMIT);
      if (Math.abs(target - p.x) < AI.apart - 0.5) target = clamp(p.x - away * AI.apart, -X_LIMIT, X_LIMIT);
    }
    const steer = clamp((target - r.x) * 0.5 - r.vx * 0.06, -1, 1);
    return { steer, brake: false, jump: false, spin: Boolean(r.flight) && !r.tricked };
  }

  /** After the line: roll into a lane and stop. */
  autoControl(r, lane) {
    return { steer: clamp((lane - r.x) * 0.4 - r.vx * 0.08, -1, 1), brake: false, jump: false, spin: false, stop: true };
  }

  stepRacer(r, dt, ctl, events, mine) {
    const s0 = r.s;
    r.bumpCool = Math.max(0, r.bumpCool - dt);
    r.boost = Math.max(0, r.boost - dt);
    r.squash = damp(r.squash, 1, 10, dt);
    if (r.trick > 0) r.trick = Math.max(0, r.trick - dt);

    if (mine && !ctl.stop) this.drive(r, dt, ctl, events);
    else this.slide(r, dt, ctl, events, mine);
    this.stepHeight(r, s0, ctl, events, mine, dt);
    this.touchPads(r, events, mine);
    this.touchBlocks(r, s0, events, mine);
    if (mine) this.collectBits(r, events);
  }

  /** Mirio's kart, steered by its heading. */
  drive(r, dt, ctl, events) {
    const track = this.track;
    const road = { curvature: track.value(track.curv, r.s), slope: track.value(track.slope, r.s), limit: X_LIMIT };
    const airborne = r.air || Boolean(r.flight);
    r.throttle = ctl.throttle;
    const slide = slideOf(r);
    if (!r.sliding && !r.drift && slide > SLIDE_SOUND && r.v > 8) {
      r.sliding = true;
      events.push({ type: 'slide' });
    } else if (r.sliding && slide < SLIDE_SOUND / 2) {
      r.sliding = false;
    }
    for (const type of driveKart(r, ctl, road, dt, { boosting: r.boost > 0, airborne })) {
      if (type !== 'bump') {
        events.push({ type });
        continue;
      }
      if (r.bumpCool <= 0) events.push({ type });
      r.bumpCool = BUMP_COOLDOWN;
      r.squash = 0.9;
    }
  }

  /** Finster-Mirio's kart, and Mirio's after the line: slides across the road. */
  slide(r, dt, ctl, events, mine) {
    const track = this.track;
    // Speed: cruise, faster downhill, brake with the stick pulled back.
    if (ctl.stop) {
      const room = Math.max(0.5, this.sStop - (mine ? 0 : 4) - r.s);
      r.v = Math.max(0, r.v - Math.max(FINISH_DECEL, (r.v * r.v) / (2 * room)) * dt);
      r.boost = 0;
      r.turbo = 0;
      r.drift = 0;
      r.throttle = 0;
      r.yaw = damp(r.yaw, 0, 4, dt);
      r.course = damp(r.course, 0, 4, dt);
    } else if (!r.flight) {
      r.v = approachSpeed(r.v, track.value(track.slope, r.s), dt, { pace: r.pace, boosting: r.boost > 0 });
    }

    // Steering slides the kart across the road; rails at both edges.
    r.steer = damp(r.steer, ctl.steer, STEER_RESPONSE, dt);
    const grip = 0.55 + 0.45 * Math.min(1, r.v / DRIVE.cruise);
    r.vx += clamp(r.steer * STEER_SPEED * grip - r.vx, -LATERAL_ACCEL * dt, LATERAL_ACCEL * dt);
    r.x += r.vx * dt;
    if (Math.abs(r.x) > X_LIMIT) {
      const side = Math.sign(r.x);
      r.x = side * X_LIMIT;
      const into = r.vx * side;
      if (into > WALL_HIT && r.bumpCool <= 0) {
        r.v *= WALL_KEEP;
        r.vx = -r.vx * WALL_BOUNCE;
        r.bumpCool = BUMP_COOLDOWN;
        r.squash = 0.9;
        if (mine) events.push({ type: 'bump' });
      } else if (into > 0) {
        r.vx = 0;
        r.v = Math.max(0, r.v - SCRAPE * dt);
      }
    }
    r.s += r.v * dt;
  }

  stepHeight(r, s0, ctl, events, mine, dt) {
    const ramp = this.ramp;
    if (!r.flight && s0 < ramp.lip && r.s >= ramp.lip) {
      r.flight = { from: Math.max(r.h, RAMP.height) };
      r.air = false;
      r.v = Math.max(r.v, RAMP.speed);
      r.tricked = false;
    }
    if (r.flight) {
      const k = (r.s - ramp.lip) / RAMP.flight;
      if ((ctl.jump || ctl.spin) && !r.tricked) {
        r.tricked = true;
        r.trick = TRICK_TIME;
        if (mine) events.push({ type: 'hop' });
      }
      if (k < 1) {
        r.h = this.flightHeight(k, r.flight.from);
        return;
      }
      r.flight = null;
      r.h = 0;
      r.squash = LAND_SQUASH;
      if (r.tricked) {
        // A trick in the air pays off as a boost on landing.
        r.boost = BOOST_TIME;
        r.v = Math.max(r.v, DRIVE.boost * r.pace);
        if (mine) events.push({ type: 'boost' });
      }
      return;
    }
    const ground = this.groundAt(r.s);
    if (r.air) {
      r.vh -= HOP_GRAVITY * dt;
      r.h += r.vh * dt;
      if (r.h <= ground) {
        r.h = ground;
        r.air = false;
        r.vh = 0;
        r.squash = 0.88;
      }
    } else {
      r.h = ground;
      if (ctl.jump && !ctl.stop) {
        r.air = true;
        r.vh = HOP_SPEED;
        if (mine) events.push({ type: 'hop' });
      }
    }
  }

  touchPads(r, events, mine) {
    for (const pad of this.pads) {
      if (r.s < pad.s0 || r.s > pad.s1 || r.lastPad === pad) continue;
      if (Math.abs(r.x - pad.x) > pad.half + KART_HALF_WIDTH * 0.5 || r.h > this.groundAt(r.s) + 0.4) continue;
      r.lastPad = pad;
      r.boost = BOOST_TIME;
      r.v = Math.max(r.v, DRIVE.boost * r.pace);
      if (mine) events.push({ type: 'boost' });
    }
  }

  touchBlocks(r, s0, events, mine) {
    const reachS = BLOCK.size / 2 + KART_HALF_LENGTH;
    const reachX = BLOCK.size / 2 + KART_HALF_WIDTH;
    for (const b of this.blocks) {
      const dx = r.x - b.x;
      if (Math.abs(r.s - b.s) >= reachS || Math.abs(dx) >= reachX || r.h > BLOCK.height - 0.15 || r.flight) continue;
      // Glance off to the side with more room; head-on also costs speed.
      let side = Math.sign(dx) || (b.x > 0 ? -1 : 1);
      if (Math.abs(b.x + side * reachX) > X_LIMIT) side = -side;
      if (s0 <= b.s - reachS + 0.05) {
        r.v *= BLOCK_KEEP;
        r.air = true;
        r.vh = 3;
      }
      r.x = clamp(b.x + side * reachX, -X_LIMIT, X_LIMIT);
      r.vx = side * BLOCK_NUDGE;
      r.squash = 0.8;
      if (mine && r.bumpCool <= 0) events.push({ type: 'bump' });
      r.bumpCool = BUMP_COOLDOWN;
    }
  }

  collectBits(r, events) {
    for (const [i, b] of this.bits.entries()) {
      if (b.taken || Math.abs(b.s - r.s) > BIT_RADIUS) continue;
      const d = Math.hypot(b.s - r.s, b.x - r.x, b.h - (r.h + BIT_HEIGHT));
      if (d > BIT_RADIUS) continue;
      b.taken = true;
      events.push({ type: 'bit', pos: b.pos.clone(), index: i });
    }
  }

  collideKarts(events) {
    const p = this.player;
    const q = this.rival;
    const ds = q.s - p.s;
    const dx = q.x - p.x;
    if (Math.abs(ds) > KART_HALF_LENGTH * 2 || Math.abs(dx) > KART_HALF_WIDTH * 2 || Math.abs(p.h - q.h) > 1) return;
    const side = Math.sign(dx) || 1;
    const push = (KART_HALF_WIDTH * 2 - Math.abs(dx)) / 2;
    p.x = clamp(p.x - side * push, -X_LIMIT, X_LIMIT);
    q.x = clamp(q.x + side * push, -X_LIMIT, X_LIMIT);
    p.vx = -side * 4;
    q.vx = side * 4;
    if (p.bumpCool > 0) return;
    // The one behind loses a little, once per bump.
    (ds > 0 ? p : q).v *= KART_BUMP_KEEP;
    events.push({ type: 'bump' });
    p.bumpCool = BUMP_COOLDOWN;
  }

  // ---- Looks ---------------------------------------------------------------------------

  animate(dt) {
    const now = (this.clock = (this.clock ?? 0) + dt);
    for (const r of [this.player, this.rival]) {
      this.placeKart(r, dt, now);
      this.poseDriver(r, dt, now);
    }

    this.bits.forEach((b, i) => {
      bitScale.setScalar(b.taken ? 0 : 1);
      bitTurn.setFromAxisAngle(Y, now * 2.5 + b.phase);
      bitQ.setFromUnitVectors(Y, b.up).multiply(bitTurn);
      tmp.copy(b.pos).addScaledVector(b.up, Math.sin(now * 3 + b.phase) * 0.12);
      this.bitMesh.setMatrixAt(i, bitMatrix.compose(tmp, bitQ, bitScale));
    });
    this.bitMesh.instanceMatrix.needsUpdate = true;

    this.arrows.offset.y = (this.arrows.offset.y - dt * 1.6) % 1;

    this.crystal.position.setFromMatrixPosition(this.crystalAt);
    this.crystal.quaternion.setFromRotationMatrix(this.crystalAt);
    const f = this.track.frame(this.sFinish + CRYSTAL.ahead, this.frameB);
    this.crystal.position.addScaledVector(f.up, Math.sin(now * 1.6) * 0.3);
    // It turns slowly, catching the light.
    this.crystalMesh.rotation.set(0, now * 0.8, Math.sin(now * 1.3) * 0.08);
  }

  placeKart(r, dt, now) {
    const k = r.kart;
    const f = this.track.frame(r.s, r === this.player ? this.frameA : this.frameB);
    this.track.point(r.s, r.x, r.h, k.root.position, f);
    basis.makeBasis(tmp.copy(f.right).negate(), f.up, f.tan);
    k.root.quaternion.setFromRotationMatrix(basis);

    // On the road below; there is none over the ramp's gap.
    const ground = this.groundAt(r.s);
    r.shadow.visible = k.root.scale.x > 0.5 && !(r.s > this.ramp.lip && r.s < this.ramp.gapEnd);
    this.track.point(r.s, r.x, ground + ROAD_LIFT + 0.02, r.shadow.position, f);
    r.shadow.quaternion.copy(k.root.quaternion);
    r.shadow.scale.setScalar(SHADOW_SIZE / (1 + Math.max(0, r.h - ground) * 0.25));

    // Mirio's heading (his travel direction can lag it: a slide); the
    // rival's from his sliding across the road.
    const yaw = -r.yaw - Math.atan2(r.vx, Math.max(Math.abs(r.v), 4)) * 0.9 - r.steer * 0.12;
    const k0 = r.flight ? (r.s - this.ramp.lip) / RAMP.flight : 0;
    const flightPitch = r.flight ? -Math.atan((-r.flight.from + 4 * RAMP.apex * (1 - 2 * k0)) / RAMP.flight) * 0.6 : 0;
    const hopPitch = r.air ? -r.vh * 0.025 : 0;
    const roll = r.trick > 0 ? Math.PI * 2 * smoothstep(0, 1, 1 - r.trick / TRICK_TIME) : 0;
    // Leaning out of a slide.
    k.body.rotation.set(flightPitch + hopPitch, yaw, roll + r.steer * 0.05 + (r.course - r.yaw) * 0.25, 'YXZ');
    k.body.scale.set(1 + (1 - r.squash) * 0.6, r.squash, 1 + (1 - r.squash) * 0.3);

    k.spin += (r.v * dt) / KART.wheelRadius;
    k.front.rotation.x = k.rear.rotation.x = k.spin;
    k.frontSteer.rotation.y = -r.steer * 0.45;
    k.steering.rotation.z = r.steer * 0.9;

    k.flame.visible = this.phase === 'countdown' || ((this.phase === 'race' || this.phase === 'finished') && (r.v > 0.5 || r.throttle > 0));
    let [width, length] = FLAME_IDLE;
    if (r.boost > 0 || r.turbo > 0) [width, length] = FLAME_BOOST;
    else if (r.throttle > 0) [width, length] = FLAME_GAS;
    const flicker = 0.85 + Math.sin(now * 53 + (r === this.player ? 0 : 2)) * 0.1 + Math.sin(now * 31) * 0.08;
    k.flame.scale.set(width, length * flicker, width);

    if (r !== this.player) return;
    this.dust(r, dt);
    const level = driftLevel(r);
    for (const [i, spark] of this.sparks.entries()) {
      spark.visible = r.drift !== 0 && !r.air;
      if (!spark.visible) continue;
      spark.material.color.set(SPARKS[level]);
      spark.scale.setScalar((0.35 + level * 0.25) * (0.75 + 0.25 * Math.sin(now * 40 + i * 2)));
    }
  }

  /** Puffs from Mirio's rear wheels while he slides; they grow and fade where they were left. */
  dust(r, dt) {
    this.puffWait -= dt;
    if (slideOf(r) > DUST.slide && Math.abs(r.v) > 5 && !r.air && !r.flight && this.puffWait <= 0) {
      this.puffWait = DUST.every;
      r.kart.body.updateWorldMatrix(true, false);
      for (const side of [-1, 1]) {
        const p = this.puffs[this.puffNext++ % this.puffs.length];
        p.life = DUST.life;
        r.kart.body.localToWorld(p.sprite.position.set(side * KART.rear.x * 0.9, 0.25, KART.rear.z - 0.2));
      }
    }
    for (const p of this.puffs) {
      p.sprite.visible = p.life > 0;
      if (!p.sprite.visible) continue;
      p.life -= dt;
      const k = 1 - p.life / DUST.life;
      p.sprite.scale.setScalar(0.5 + k * 1.6);
      p.sprite.material.opacity = 0.55 * (1 - k);
    }
  }

  poseDriver(r, dt, now) {
    if (!r.seated) return;
    const m = r.driver;
    const done = r.finished && r.v < 6;
    r.cheer = damp(r.cheer, done ? 1 : 0, 6, dt);
    const lost = r === this.rival && this.result?.place === 1 && done;
    const cheer = lost ? 0 : r.cheer;
    const bob = cheer * Math.abs(Math.sin(now * 7)) * 0.12;
    m.body.position.y = bob + (1 - r.squash) * -0.25;
    m.body.rotation.set(0, 0, r.steer * -0.14);
    m.head.rotation.set(lost ? 0.35 : 0, lost ? Math.sin(now * 3) * 0.4 : r.steer * -0.2, r.steer * -0.08);
    this.poseArms(m, cheer, 1 - cheer, r.steer);
  }

  /** raise: arms up in a V (0..1); drive: forward on the wheel (0..1); steer turns it. */
  poseArms(m, raise, drive, steer) {
    for (const [arm, key, s] of [[m.armL, 'L', -1], [m.armR, 'R', 1]]) {
      const rest = lerp(m.armRestZ[key], s * ARM_DRIVE.z, drive);
      arm.rotation.z = lerp(rest, m.armRaisedZ[key], raise);
      // Turning right lifts the left hand on the wheel and drops the right.
      arm.rotation.x = drive * (ARM_DRIVE.x - steer * 0.3 * s) * (1 - raise);
    }
  }

  // ---- Camera ---------------------------------------------------------------------------

  updateCamera(camera, dt) {
    if (this.phase === 'idle') return;
    dt = Math.min(dt, MAX_DT);
    const c = this.cam;
    const p = this.player;
    const kart = p.kart.root.position;
    const f = this.track.frame(p.s, this.frameB);
    const up = this.track.levelUp(p.s, new THREE.Vector3()).lerp(f.up, CAMERA_BANK).normalize();
    const side = new THREE.Vector3().crossVectors(f.tan, up).normalize();

    // Chase: behind and above in the kart's own track frame (a frame taken
    // behind it would tilt down on these convex orbits); after the line it
    // swings round to Mirio's front, over the middle of the road.
    const k = this.phase === 'finished' ? smoothstep(0.3, FINISH_VIEW.time, this.t) : 0;
    const angle = lerp(Math.PI, FINISH_VIEW.angle, k);
    const boosting = p.boost > 0 || p.turbo > 0;
    const distance = lerp(CHASE.distance + (boosting ? CHASE.boostPull : 0), FINISH_VIEW.distance, k);
    // Behind Mirio's direction of travel (in a drift or a slide his body
    // turns away from it, and that is what should show).
    const turn = p.course * CHASE.heading * (1 - k);
    const ahead = f.tan.clone().multiplyScalar(Math.cos(turn)).addScaledVector(side, Math.sin(turn));
    const offset = new THREE.Vector3()
      .addScaledVector(ahead, Math.cos(angle) * distance)
      .addScaledVector(side, Math.sin(angle) * distance * -this.lane)
      .addScaledVector(up, lerp(CHASE.height, FINISH_VIEW.height, k));
    const look = kart.clone().addScaledVector(up, lerp(CHASE.lookUp, 1.9, k)).addScaledVector(ahead, CHASE.lookAhead * (1 - k));
    const kick = this.phase === 'race' ? (boosting ? CHASE.boostFov : 0) + CHASE.speedFov * Math.max(0, p.v - DRIVE.cruise) : 0;
    c.kick = damp(c.kick, kick, 4, dt);
    let camUp = up;

    if (this.phase === 'intro' || this.phase === 'countdown') {
      // From the side of the leap, then round behind the kart for the start.
      const shot = this.introShot();
      const w = this.phase === 'countdown' ? smoothstep(0.15, COUNT_STEP * 2.6, this.t) : 0;
      offset.copy(shot.pos.lerp(tmp.copy(kart).add(offset), w)).sub(kart);
      look.lerpVectors(shot.look, look, w);
      camUp = shot.up.lerp(up, w).normalize();
    }

    if (c.fresh) {
      c.fresh = false;
      c.blend = this.phase === 'intro' ? 0 : 1;
      c.from.copy(camera.position);
      c.fromUp.copy(camera.up);
      camera.getWorldDirection(c.fromLook).multiplyScalar(10).add(camera.position);
      c.offset.copy(offset);
      c.up.copy(camUp);
      c.look.copy(look);
    }
    c.blend = Math.min(1, c.blend + dt / CAMERA_BLEND);
    const rate = this.phase === 'race' ? CHASE.follow : 5;
    c.offset.lerp(offset, 1 - Math.exp(-rate * dt));
    c.up.lerp(camUp, 1 - Math.exp(-rate * dt)).normalize();
    c.look.lerp(look, 1 - Math.exp(-12 * dt));

    const pos = c.pos.copy(kart).add(c.offset);
    for (const planet of this.planets) {
      const d = pos.distanceTo(planet.center);
      const clear = planet.radius + PLANET_CLEARANCE;
      if (d < clear) pos.sub(planet.center).multiplyScalar(clear / d).add(planet.center);
    }

    const b = smoothstep(0, 1, c.blend);
    camera.position.copy(c.from).lerp(pos, b);
    camera.up.copy(c.fromUp).lerp(c.up, b).normalize();
    camera.lookAt(tmp.copy(c.fromLook).lerp(c.look, b));
  }

  /** Camera for Mirio's leap: from the side of it, on his lane's side of the track. */
  introShot() {
    const kart = this.player.kart;
    const seat = kart.seat.position.clone().applyQuaternion(kart.root.quaternion).add(kart.root.position);
    const from = this.from.pos;
    const up = this.from.up.clone();
    const f = this.track.frame(GRID.s, this.frameA);
    const dir = seat.clone().sub(from);
    const span = dir.length();
    if (dir.addScaledVector(up, -dir.dot(up)).lengthSq() < 1e-4) dir.copy(f.tan);
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    if (side.dot(f.right) * this.lane < 0) side.negate();
    const mid = from.clone().lerp(seat, 0.5);
    return {
      pos: mid.clone()
        .addScaledVector(side, INTRO_VIEW.side + span * INTRO_VIEW.perSpan)
        .addScaledVector(up, INTRO_VIEW.height + span * 0.1)
        .addScaledVector(dir, -INTRO_VIEW.back),
      look: mid.addScaledVector(up, INTRO_VIEW.lookUp),
      up,
    };
  }
}
