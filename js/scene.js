// Mirio: builds what you see, and keeps the decoration moving. Game rules
// live elsewhere; this file only turns level data (level.js) into meshes.
//
// Built for phones: the static props are merged into a few meshes per
// material, repeated things (trees, Glitzersteine, grass, flowers, pebbles,
// particles) are instanced, nothing casts real-time shadows, and the
// decoration density follows the device tier (quality.js). Drawing-derived
// props retain their pen hulls; natural scenery has smooth sculpted shading.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hullGeometry, penOutline, toon } from './materials.js';
import { bigCrystalGeometry, buildFlag, buildRocket, gemGeometry } from './props.js';
import { deviceTier } from './quality.js';
import { makeEnvironmentArt } from './environment-art.js';
import { buildScenery } from './scenery.js';
import { buildWater } from './water.js';
import { mulberry32, surfacePoint, tangentDir } from './world.js';

const Y = new THREE.Vector3(0, 1, 0);
const basis = new THREE.Matrix4();
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const dummy = new THREE.Object3D();

const PEN = 0x1b1410;
// World size of one tile of Miro's floor drawing and of the felt strokes.
const FLOOR_TILE = 2.4;
const FELT_TILE = 1.4;

// ---- Materials --------------------------------------------------------------

/**
 * Shader additions for MeshToonMaterial, by name, applied in this order.
 * Each takes the shader and its options.
 */
const FEATURES = {
  /**
   * Projects the map from three sides instead of using UVs. A UV-mapped
   * sphere pinches its texture at the poles, and Mirio starts on a pole.
   */
  triplanar(shader, { scale }) {
    shader.uniforms.triScale = { value: 1 / scale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriPos = position;\nvTriNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float triScale;\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;')
      .replace('#include <map_fragment>', `
        vec3 triW = pow(abs(normalize(vTriNormal)), vec3(4.0));
        triW /= (triW.x + triW.y + triW.z);
        vec3 triP = vTriPos * triScale;
        vec4 triTex = texture2D(map, triP.zy) * triW.x
                    + texture2D(map, triP.xz) * triW.y
                    + texture2D(map, triP.xy) * triW.z;
        // Big soft patches, lighter and darker, so the tile does not repeat visibly.
        float triPatch = sin(vTriPos.x * 0.21 + sin(vTriPos.z * 0.17)) * sin(vTriPos.z * 0.19 + sin(vTriPos.y * 0.23));
        triTex.rgb *= 1.0 + triPatch * 0.1;
        diffuseColor *= triTex;`);
  },

  /** A sandy shore round the lake and a darker lake bed under the water. Needs triplanar. */
  lake(shader, { minLat, maxLat, radius }) {
    const toRad = Math.PI / 180;
    Object.assign(shader.uniforms, {
      lakeLat: { value: new THREE.Vector2(minLat * toRad, maxLat * toRad) },
      lakeRadius: { value: radius },
      lakeSand: { value: new THREE.Color(0xf2d492) },
      lakeBed: { value: new THREE.Color(0x2f8fa0) },
    });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 lakeLat;\nuniform float lakeRadius;\nuniform vec3 lakeSand;\nuniform vec3 lakeBed;')
      .replace('diffuseColor *= triTex;', `diffuseColor *= triTex;
        {
          float r = length(vTriPos);
          float lat = asin(clamp(vTriPos.y / r, -1.0, 1.0));
          float inside = min(lat - lakeLat.x, lakeLat.y - lat) * lakeRadius;
          inside += sin(vTriPos.x * 1.7 + sin(vTriPos.z * 1.3)) * sin(vTriPos.y * 1.1) * 0.18;
          // Only down at the water line: a hill reaching into the lake stays green higher up.
          float low = 1.0 - smoothstep(0.2, 0.7, r - lakeRadius);
          float lum = dot(triTex.rgb, vec3(0.35, 0.5, 0.15));
          diffuseColor.rgb = mix(diffuseColor.rgb, lakeSand * (0.75 + lum), smoothstep(-1.15, -0.7, inside) * low);
          diffuseColor.rgb = mix(diffuseColor.rgb, lakeBed * (0.6 + lum), smoothstep(0.5, 2.4, inside) * low);
        }`);
  },

  /** Grass and flowers sway in the wind, more at the tip. */
  sway(shader, { time, amount = 0.12 }) {
    Object.assign(shader.uniforms, { swayTime: time, swayAmount: { value: amount } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float swayTime;\nuniform float swayAmount;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float swSeed = dot(instanceMatrix[3].xyz, vec3(0.37, 0.21, 0.29));
        #else
          float swSeed = 0.0;
        #endif
        float swK = max(position.y, 0.0) * swayAmount;
        transformed.x += sin(swayTime * 1.9 + swSeed) * swK;
        transformed.z += cos(swayTime * 1.4 + swSeed * 1.3) * swK * 0.7;`);
  },

  /** Wingbeats and a drifting orbit, all on the GPU; no per-frame matrices. */
  flutter(shader, { time }) {
    shader.uniforms.flutterTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float flutterTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float phase = dot(instanceMatrix[3].xyz, vec3(2.1, 3.7, 1.3));
        float flap = sin(flutterTime * 15.0 + phase) * 1.05;
        transformed.y += abs(position.x) * sin(flap);
        transformed.x *= cos(flap);
        transformed.x += sin(flutterTime * 0.65 + phase) * 0.65;
        transformed.z += cos(flutterTime * 0.43 + phase) * 0.5;
        transformed.y += sin(flutterTime * 1.7 + phase) * 0.2;`);
  },

  /** The instance colour tints only the vertices whose `petal` attribute is 1. */
  petal(shader) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float petal;')
      .replace('#include <color_vertex>', `
        #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          vColor = vec4(1.0);
        #endif
        #ifdef USE_COLOR
          vColor.rgb *= color;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, petal);
        #endif`);
  },

  /** Glows in its own (instance) colour. */
  glow(shader, { amount }) {
    shader.uniforms.glowAmount = { value: amount };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float glowAmount;')
      .replace('vec3 totalEmissiveRadiance = emissive;', `vec3 totalEmissiveRadiance = emissive;
        #ifdef USE_COLOR
          totalEmissiveRadiance += vColor.rgb * glowAmount;
        #endif`);
  },

  /** Soft rim light: edges seen at a grazing angle catch a coloured glow. */
  rim(shader, { color, from = 0.55, strength = 1 }) {
    Object.assign(shader.uniforms, {
      rimColor: { value: new THREE.Color(color).multiplyScalar(strength) },
      rimFrom: { value: from },
    });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimFrom;')
      .replace('#include <opaque_fragment>', `
        outgoingLight += rimColor * smoothstep(rimFrom, 1.0, 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0));
        #include <opaque_fragment>`);
  },
};

/** toon() plus shader features from FEATURES, e.g. { rim: { color } }. */
function withFeatures(m, features) {
  const names = Object.keys(FEATURES).filter((k) => features[k]);
  m.onBeforeCompile = (shader) => {
    for (const name of names) FEATURES[name](shader, features[name] === true ? {} : features[name]);
  };
  m.customProgramCacheKey = () => names.join('+');
  return m;
}

function toonWith(color, extra, features) {
  return withFeatures(toon(color, extra), features);
}

// Smooth, satin light belongs to the scenery. Miro's drawings retain their
// original toon materials and textures, so the hero stays unmistakably his.
function surfaceWith(color, extra = {}, features = {}) {
  return withFeatures(new THREE.MeshPhongMaterial({ color, shininess: 14, specular: 0x24301e, ...extra }), features);
}

function jewelWith(environment, extra = {}, features = {}) {
  return surfaceWith(0xffffff, {
    shininess: 95, specular: 0xf1fbff, envMap: environment,
    reflectivity: 0.36, combine: THREE.MixOperation, ...extra,
  }, features);
}

const LOOKS = {
  grass: { tex: 'meadow', size: 6, glow: 0x91ded7, rim: 0xbfe8ff, deco: 'meadow' },
  floor: { tex: 'floor', size: 2.2, glow: 0xb9c6ff, rim: 0xc9b8ff, deco: 'moon' },
  // The Zielplanet: a warm golden meadow with flowers and stones.
  gold: { tex: 'gold', size: 4.5, glow: 0xffc86b, rim: 0xffe6a8, deco: 'gold' },
};
const lookOf = (planet) => LOOKS[planet.look] ?? LOOKS.grass;

// ---- Geometry helpers ------------------------------------------------------

/** Stands `obj` on `planet` at `dir`, `height` above the ground, its +Z toward `facing`. */
export function placeOn(obj, planet, dir, height = 0, facing = null) {
  surfacePoint(planet, dir, height, obj.position);
  const z = facing && tangentDir(facing, dir);
  if (!z) {
    obj.quaternion.setFromUnitVectors(Y, dir);
    return obj;
  }
  const x = new THREE.Vector3().crossVectors(dir, z);
  basis.makeBasis(x, dir, z);
  obj.quaternion.setFromRotationMatrix(basis);
  return obj;
}

/** `geom` moved the way placeOn() would move an object. */
function placed(geom, planet, dir, height = 0, facing = null) {
  placeOn(dummy, planet, dir, height, facing);
  dummy.scale.setScalar(1);
  dummy.updateMatrix();
  return geom.applyMatrix4(dummy.matrix);
}

/** Gives every vertex of `geom` one colour (and a `petal` weight). */
function paint(geom, color, petal = null) {
  const c = new THREE.Color(color);
  const n = geom.attributes.position.count;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(rgb, i * 3);
  geom.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  if (petal !== null) geom.setAttribute('petal', new THREE.BufferAttribute(new Float32Array(n).fill(petal), 1));
  return geom;
}

/** Keeps only the named attributes, so differently built parts can be merged. */
function keep(geom, names) {
  for (const name of Object.keys(geom.attributes)) if (!names.includes(name)) geom.deleteAttribute(name);
  geom.clearGroups();
  return geom;
}

function merge(parts, names) {
  const list = parts.map((g) => keep(g, names));
  const indexed = list.every((g) => g.index);
  return mergeGeometries(indexed ? list : list.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/** Box UVs in world units: one texture tile per `tile`, not per face. */
function boxUv(geom, w, h, d, tile) {
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const uv = geom.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const [du, dv] = dims[Math.floor(i / 4)];
    uv.setXY(i, (uv.getX(i) * du) / tile, (uv.getY(i) * dv) / tile);
  }
  return geom;
}

/** Cylinder or cone UVs in world units, caps included. */
function cylinderUv(geom, radius, height, tile) {
  const uv = geom.attributes.uv;
  const normal = geom.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(normal.getY(i)) > 0.999) {
      uv.setXY(i, ((uv.getX(i) - 0.5) * radius * 2) / tile, ((uv.getY(i) - 0.5) * radius * 2) / tile);
    } else {
      uv.setXY(i, (uv.getX(i) * Math.PI * 2 * radius) / tile, (uv.getY(i) * height) / tile);
    }
  }
  return geom;
}

/** Sphere UVs in world units. */
function sphereUv(geom, radius, tile) {
  const uv = geom.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * radius) / tile, (uv.getY(i) * Math.PI * radius) / tile);
  return geom;
}

/** A mesh plus its pen-outline hull, added to `parent`. */
function inked(parent, geom, material, thickness, { instanced = null, name = '' } = {}) {
  const hull = hullGeometry(geom);
  if (instanced) {
    const { count, matrices, colors } = instanced;
    const body = new THREE.InstancedMesh(geom, material, count);
    const line = new THREE.InstancedMesh(hull, penOutline(thickness, PEN, 0.3), count);
    for (let i = 0; i < count; i++) {
      body.setMatrixAt(i, matrices[i]);
      line.setMatrixAt(i, matrices[i]);
      if (colors) body.setColorAt(i, colors[i]);
    }
    body.name = name;
    line.name = `${name}:pen`;
    parent.add(body, line);
    return { body, line };
  }
  const body = new THREE.Mesh(geom, material);
  const line = new THREE.Mesh(hull, penOutline(thickness, PEN, 0.3));
  body.name = name;
  line.name = `${name}:pen`;
  parent.add(body, line);
  return { body, line };
}

/**
 * Merges the plain-coloured toon meshes under `roots` (and their pen hulls)
 * into one mesh and one hull, and hides the originals: e.g. the flag poles.
 * Parts under `moving` (roots[i] -> the object that animates) are left alone,
 * so are textured parts. Returns the merged meshes, or null.
 */
function mergeStatic(scene, roots, moving = () => null) {
  const bodies = [];
  const hulls = [];
  let pen = null;
  for (const root of roots) {
    root.updateMatrixWorld(true);
    const skip = moving(root);
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      for (let p = o; p; p = p.parent) if (p === skip) return;
      const m = o.material;
      if (m.isMeshToonMaterial && !m.map && !m.transparent) {
        bodies.push(paint(o.geometry.clone().applyMatrix4(o.matrixWorld), m.color.getHex()));
        o.visible = false;
      } else if (m.isShaderMaterial && m.side === THREE.BackSide && m.uniforms?.thickness && o.parent?.isMesh) {
        pen ??= { thickness: m.uniforms.thickness.value, color: m.uniforms.color.value.getHex() };
        hulls.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
        o.visible = false;
      }
    });
  }
  if (!bodies.length) return null;
  const body = new THREE.Mesh(merge(bodies, ['position', 'normal', 'color']), toon(0xffffff, { vertexColors: true }));
  scene.add(body);
  if (hulls.length) {
    // Hulls keep the normals of their meshes; the pen pushes along them.
    const line = new THREE.Mesh(merge(hulls, ['position', 'normal']), penOutline(pen.thickness, pen.color, 0));
    scene.add(line);
    return { body, line };
  }
  return { body };
}

// ---- Sky ------------------------------------------------------------------

const SKY_VERTEX = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// Written straight in display colours; the sky is not lit or tone mapped.
const SKY_FRAGMENT = /* glsl */`
  uniform vec3 uBand;
  varying vec3 vDir;
  float wave(vec3 p) {
    return sin(p.x + sin(p.y * 1.3 + sin(p.z * 1.7))) * sin(p.y * 0.9 + sin(p.z * 1.1 + sin(p.x * 1.5)));
  }
  float fbm(vec3 p) {
    return wave(p) * 0.55 + wave(p * 2.03 + 1.7) * 0.3 + wave(p * 4.1 + 3.1) * 0.15;
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y * 0.5 + 0.5;
    vec3 col = mix(vec3(0.03, 0.025, 0.1), vec3(0.1, 0.055, 0.22), h);
    float n = fbm(d * 2.4);
    // The Milky Way's band, dusty and uneven.
    float across = dot(d, uBand) * 3.2 + n * 0.45;
    float band = exp(-across * across);
    col += vec3(0.24, 0.17, 0.46) * band * (0.55 + 0.5 * fbm(d * 5.0 + 2.0));
    col += vec3(0.55, 0.45, 0.75) * pow(band, 5.0) * smoothstep(-0.2, 0.7, n) * 0.3;
    // Pink and teal nebula clouds.
    float pink = smoothstep(0.1, 0.85, fbm(d * 1.6 + vec3(0.5, 1.0, 2.0)));
    float teal = smoothstep(0.15, 0.9, fbm(d * 1.4 + vec3(4.0, 2.0, 1.0)));
    col += vec3(0.45, 0.1, 0.4) * pink * 0.55;
    col += vec3(0.04, 0.22, 0.45) * teal * 0.5;
    col += vec3(0.6, 0.25, 0.55) * pow(pink, 4.0) * 0.25;
    gl_FragColor = vec4(col, 1.0);
  }`;

const STAR_VERTEX = /* glsl */`
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vBig;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Some stars twinkle, each at its own pace.
    float twinkle = 1.0 - step(0.55, fract(aPhase * 3.7)) * 0.45 * (0.5 + 0.5 * sin(uTime * (1.2 + fract(aPhase * 7.3) * 3.0) + aPhase * 6.2831));
    vColor = aColor * twinkle;
    vBig = step(3.5, aSize);
    gl_PointSize = aSize * uPixelRatio * (0.75 + 0.25 * twinkle);
  }`;

const STAR_FRAGMENT = /* glsl */`
  varying vec3 vColor;
  varying float vBig;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p);
    float disc = smoothstep(0.5, 0.15, r);
    // Big stars get four little rays, like Miro's sparkles.
    float rays = (max(0.0, 1.0 - abs(p.x) * 12.0) + max(0.0, 1.0 - abs(p.y) * 12.0)) * smoothstep(0.5, 0.0, r);
    float a = mix(disc, max(smoothstep(0.22, 0.0, r), rays), vBig);
    gl_FragColor = vec4(vColor * a, 1.0);
  }`;

function makeStars(count, band) {
  const rnd = mulberry32(99);
  const pos = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const palette = [0xffffff, 0xfff1c4, 0xc9dcff, 0xffc9ee, 0xffffff].map((c) => new THREE.Color(c));
  const v = new THREE.Vector3();
  for (let i = 0; i < count;) {
    v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
    if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) continue;
    v.normalize();
    // Two in five crowd towards the Milky Way's band.
    if (rnd() < 0.4) v.addScaledVector(band, -v.dot(band) * 0.85).normalize();
    v.multiplyScalar(800).toArray(pos, i * 3);
    palette[i % palette.length].toArray(color, i * 3);
    const big = rnd() < 0.035;
    size[i] = big ? 5 + rnd() * 4 : 1.2 + rnd() * rnd() * 2.2;
    phase[i] = rnd();
    i++;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  geom.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geom.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const uniforms = { uTime: { value: 0 }, uPixelRatio: { value: 1 } };
  const stars = new THREE.Points(geom, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }));
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  stars.onBeforeRender = (renderer) => {
    uniforms.uPixelRatio.value = renderer.getPixelRatio();
  };
  return { stars, uniforms };
}

/** Now and then a shooting star streaks across the sky in front of you. */
class ShootingStar {
  constructor() {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('aUv', new THREE.BufferAttribute(new Float32Array([0, -1, 1, -1, 1, 1, 0, 1]), 2));
    geom.setIndex([0, 1, 2, 0, 2, 3]);
    this.uniforms = { uFade: { value: 0 } };
    this.mesh = new THREE.Mesh(geom, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute vec2 aUv;
        varying vec2 vUv;
        void main() {
          vUv = aUv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uFade;
        varying vec2 vUv;
        void main() {
          float along = pow(vUv.x, 2.2);
          float across = 1.0 - abs(vUv.y);
          vec3 col = mix(vec3(0.8, 0.5, 1.0), vec3(1.0, 0.97, 0.85), vUv.x);
          gl_FragColor = vec4(col * along * across * across * uFade, 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.visible = false;
    this.wait = 3;
    this.t = 0;
    this.start = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.across = new THREE.Vector3();
    this.enabled = true;
  }

  update(dt, camera) {
    if (!this.mesh.visible) {
      this.wait -= dt;
      if (this.wait > 0 || !this.enabled) return;
      // Start somewhere ahead and above, fly sideways and a little down.
      camera.getWorldDirection(tmp);
      const right = tmp2.crossVectors(tmp, camera.up).normalize();
      const side = Math.random() < 0.5 ? -1 : 1;
      this.start.copy(tmp).addScaledVector(right, -side * (0.2 + Math.random() * 0.5)).addScaledVector(camera.up, 0.25 + Math.random() * 0.35).normalize();
      this.dir.copy(right).multiplyScalar(side).addScaledVector(camera.up, -0.35 - Math.random() * 0.3);
      this.dir.addScaledVector(this.start, -this.dir.dot(this.start)).normalize();
      this.t = 0;
      this.mesh.visible = true;
    }
    this.t += dt;
    const k = this.t / 1.1;
    if (k >= 1) {
      this.mesh.visible = false;
      this.wait = 4 + Math.random() * 7;
      return;
    }
    const head = tmp.copy(this.start).addScaledVector(this.dir, k * 0.9).normalize().multiplyScalar(700);
    const length = 140 * Math.sin(Math.PI * Math.min(1, k * 1.2));
    const tail = tmp2.copy(this.dir).multiplyScalar(-length).add(head);
    const across = this.across.crossVectors(this.dir, head).normalize().multiplyScalar(2.2);
    const pos = this.mesh.geometry.attributes.position;
    pos.setXYZ(0, tail.x - across.x, tail.y - across.y, tail.z - across.z);
    pos.setXYZ(1, head.x - across.x, head.y - across.y, head.z - across.z);
    pos.setXYZ(2, head.x + across.x, head.y + across.y, head.z + across.z);
    pos.setXYZ(3, tail.x + across.x, tail.y + across.y, tail.z + across.z);
    pos.needsUpdate = true;
    this.uniforms.uFade.value = Math.sin(Math.PI * k);
  }
}

/**
 * The nebula is too many sines per pixel to paint every frame on a phone, so
 * it is painted once into a small cube map, on the first frame (that is the
 * first moment the renderer is at hand), and the sky just looks it up.
 */
function bakeSky(renderer, band, size) {
  const target = new THREE.WebGLCubeRenderTarget(size, { generateMipmaps: false });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: { uBand: { value: band } },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
    }),
  ));
  // Into a render target three writes the shader's values as they are, and
  // the sky reads them back the same way: no colour conversion either way.
  new THREE.CubeCamera(1, 100, target).update(renderer, scene);
  scene.children[0].geometry.dispose();
  scene.children[0].material.dispose();
  return target.texture;
}

function makeSky(tier) {
  const group = new THREE.Group();
  const band = new THREE.Vector3(0.35, 0.8, -0.48).normalize();
  const uniforms = { uCube: { value: null } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SKY_VERTEX,
      fragmentShader: /* glsl */`
        uniform samplerCube uCube;
        varying vec3 vDir;
        void main() {
          gl_FragColor = vec4(textureCube(uCube, vDir).rgb, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  // Right before the sky's first draw call, so even that frame is complete.
  sky.onBeforeRender = (renderer) => {
    uniforms.uCube.value ??= bakeSky(renderer, band, tier === 2 ? 384 : 256);
  };
  group.add(sky);
  const { stars, uniforms: starUniforms } = makeStars([900, 1400, 1900][tier], band);
  group.add(stars);
  const shooting = new ShootingStar();
  group.add(shooting.mesh);
  return { group, stars: starUniforms, shooting };
}

/** A far-away ringed planet, because every night sky needs one. */
function makeBackdropPlanet(art) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(
    sphereUv(new THREE.SphereGeometry(60, 40, 24), 60, 30),
    toonWith(0x8a7cff, { map: art.felt ?? null }, { rim: { color: 0xffb8f0, from: 0.4, strength: 0.8 } }),
  );
  g.add(ball);
  g.add(new THREE.Mesh(hullGeometry(ball.geometry), penOutline(1.6, PEN, 0.2)));
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(80, 118, 96, 1),
    new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        varying float vR;
        void main() {
          vR = length(position.xy);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying float vR;
        void main() {
          float k = (vR - 80.0) / 38.0;
          // Felt-pen stripes of lilac, pink and cream.
          float stripe = sin(k * 38.0) * 0.5 + 0.5;
          vec3 col = mix(vec3(0.78, 0.7, 1.0), vec3(1.0, 0.78, 0.9), step(0.5, fract(k * 3.0)));
          col = mix(col, vec3(1.0, 0.95, 0.82), step(0.82, stripe) * 0.5);
          float edge = smoothstep(0.0, 0.05, k) * (1.0 - smoothstep(0.93, 1.0, k));
          float dark = step(0.97, stripe) * 0.35;
          gl_FragColor = vec4(col * (1.0 - dark), edge * 0.72);
        }`,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      forceSinglePass: true,
      toneMapped: false,
    }),
  );
  ring.rotation.x = Math.PI / 2.4;
  g.add(ring);
  g.position.set(-300, 140, -460);
  return g;
}

/**
 * Soft glow round a planet: the back faces of a slightly larger sphere,
 * brightest near the planet's rim. From inside that shell every back face
 * would glow and tint the whole screen, so it fades out as the camera enters.
 */
function atmosphere(planet, color) {
  const outer = planet.radius * 1.18;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(color) },
      center: { value: planet.center.clone() },
      outer: { value: outer },
    },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform vec3 center;
      uniform float outer;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(max(0.0, -dot(vN, vV)), 2.2);
        float outside = smoothstep(outer, outer * 1.25, distance(cameraPosition, center));
        gl_FragColor = vec4(glowColor * f * 1.3 * outside, 1.0);
      }`,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(outer, 36, 18), mat);
  mesh.position.copy(planet.center);
  return mesh;
}

// ---- Planets and props ------------------------------------------------------

/**
 * A planet and its hills as one mesh (one draw call), in the planet's own
 * coordinates, so the hills share the ground's texture seamlessly. The pen
 * hull uses coarser spheres: only its silhouette shows.
 */
function planetGeometry(planet, bumps, detail) {
  const seg = Math.round(THREE.MathUtils.clamp(planet.radius * 3.2, 48, 88) * detail);
  const parts = [new THREE.SphereGeometry(planet.radius, seg, Math.round(seg * 0.6))];
  const hulls = [new THREE.SphereGeometry(planet.radius, Math.round(seg * 0.6), Math.round(seg * 0.36))];
  for (const b of bumps) {
    if (b.planet !== planet) continue;
    // Only the cap above the ground, a little past where it meets the planet.
    const depth = planet.radius + b.height - b.radius;
    const cos = (planet.radius ** 2 - depth ** 2 - b.radius ** 2) / (2 * depth * b.radius);
    const cap = Math.min(Math.PI, Math.acos(THREE.MathUtils.clamp(cos, -1, 1)) + 0.12);
    const q = tmpQ.setFromUnitVectors(Y, b.dir);
    const offset = b.dir.clone().multiplyScalar(depth);
    for (const [list, w, h] of [[parts, 32, 10], [hulls, 20, 6]]) {
      list.push(new THREE.SphereGeometry(b.radius, Math.round(w * detail), Math.round(h * detail), 0, Math.PI * 2, 0, cap)
        .applyQuaternion(q).translate(offset.x, offset.y, offset.z));
    }
  }
  return {
    body: merge(parts, ['position', 'normal', 'uv']),
    hull: hullGeometry(merge(hulls, ['position'])),
  };
}

/** Tree stumps, in world coordinates, as one felt-textured mesh with vertex colours. */
function stumpsGeometry(stumps) {
  const body = [];
  const tops = [];
  for (const p of stumps) {
    const h = p.height + 0.3;
    const trunk = cylinderUv(new THREE.CylinderGeometry(1.15, 1.3, h, 32, 6, true), 1.2, h, FELT_TILE);
    paint(trunk, TRUNK);
    const vertices = trunk.attributes.position;
    const colors = trunk.attributes.color;
    for (let i = 0; i < vertices.count; i++) {
      const a = Math.atan2(vertices.getZ(i), vertices.getX(i));
      const y = vertices.getY(i);
      const vein = Math.cos(a * 16 + Math.sin(y * 2.4 + a * 3) * 0.24);
      const shade = 0.84 + vein * 0.16;
      colors.setXYZ(i, colors.getX(i) * shade, colors.getY(i) * shade, colors.getZ(i) * shade);
      const k = 1 + vein * 0.013;
      vertices.setXYZ(i, vertices.getX(i) * k, y, vertices.getZ(i) * k);
    }
    trunk.translate(0, h / 2 - 0.3, 0);
    body.push(placed(trunk, p.planet, p.dir));
    const top = new THREE.CircleGeometry(1.15, 32).rotateX(-Math.PI / 2).translate(0, p.height, 0);
    tops.push(placed(paint(top, STUMP_WOOD), p.planet, p.dir));
    // Growth rings.
    for (const [r, w] of [[1.07, 0.022], [0.85, 0.025], [0.63, 0.02], [0.39, 0.02], [0.18, 0.015]]) {
      const ring = new THREE.RingGeometry(r - w, r + w, 40);
      const vertices = ring.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        const a = Math.atan2(vertices.getY(i), vertices.getX(i));
        const k = 1 + Math.sin(a * 3 + r * 2) * 0.026 + Math.cos(a * 5) * 0.018;
        vertices.setXYZ(i, vertices.getX(i) * k + 0.05, vertices.getY(i) * k, 0);
      }
      ring.rotateX(-Math.PI / 2).translate(0, p.height + 0.01, 0);
      tops.push(placed(paint(ring, STUMP_RING), p.planet, p.dir));
    }
  }
  return { bark: merge(body, ['position', 'normal', 'uv', 'color']), wood: merge(tops, ['position', 'normal', 'uv', 'color']) };
}

/** Blocks, stepping stones and the plateau on `planet`, in world coordinates. */
function floorGeometry(level, planet) {
  const parts = [];
  for (const b of level.blocks) {
    if (b.planet !== planet) continue;
    const height = b.top - b.bottom;
    const geom = boxUv(new THREE.BoxGeometry(b.size, height, b.size), b.size, height, b.size, FLOOR_TILE);
    geom.translate(0, height / 2, 0);
    parts.push(placed(geom, b.planet, b.dir, b.bottom, b.forward));
  }
  for (const s of level.stones) {
    if (s.planet !== planet) continue;
    const h = s.top + 0.6;
    const geom = cylinderUv(new THREE.CylinderGeometry(s.radius * 0.92, s.radius, h, 16), s.radius, h, FLOOR_TILE);
    geom.translate(0, h / 2 - 0.6, 0);
    parts.push(placed(geom, s.planet, s.dir));
  }
  const pl = level.plateau;
  if (pl?.planet === planet) {
    const h = pl.top + 1.4;
    const geom = cylinderUv(new THREE.CylinderGeometry(pl.radius, pl.radius + 0.4, h, 40), pl.radius, h, FLOOR_TILE);
    geom.translate(0, h / 2 - 1.4, 0);
    parts.push(placed(geom, pl.planet, pl.dir));
  }
  return parts.length ? merge(parts, ['position', 'normal', 'uv']) : null;
}

// ---- Trees -------------------------------------------------------------

const TRUNK = 0x84522f;
const STUMP_WOOD = 0xf3d29a;
const STUMP_RING = 0xb27b42;

/** A wood branch between two local points, with longitudinal bark UVs. */
function woodBranch(from, to, bottom, top = bottom * 0.6) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const direction = b.clone().sub(a);
  const geometry = cylinderUv(new THREE.CylinderGeometry(top, bottom, direction.length(), 9, 2), bottom, direction.length(), 1.2);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, direction.normalize()));
  geometry.translate(...a.add(b).multiplyScalar(0.5).toArray());
  return paint(geometry, TRUNK);
}

/** Rounded, lobed crowns; smooth light defines overlaps instead of ink seams. */
function roundTree(apples, detail) {
  const wood = [woodBranch([0, -.12, 0], [.1, 2.55, -.03], .34, .17)];
  const foliage = [];
  const fruit = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + .25;
    wood.push(woodBranch([0, .25, 0], [Math.cos(a) * .68, -.025, Math.sin(a) * .68], .18, .025));
    wood.push(woodBranch([.04, 1.45, 0], [Math.cos(a) * .78, 2.65 + (i % 2) * .25, Math.sin(a) * .78], .13, .055));
  }
  const lobes = [[0, 2.85, 0, 1.17, 1.04], [.87, 2.62, .15, .92, .88], [-.78, 2.67, -.18, .94, .92],
    [.16, 3.55, -.05, .87, .96], [-.4, 3.32, -.58, .79, .9], [-.28, 2.65, .82, .85, .9],
    [.57, 3.16, .68, .75, .94], [.3, 2.55, -.8, .77, .86]];
  const low = new THREE.Color(0x2f7951);
  const middle = new THREE.Color(0x62ad49);
  const high = new THREE.Color(0xafd971);
  for (const [j, [x, y, z, r, squash]] of lobes.slice(0, detail ? 8 : 5).entries()) {
    const ball = new THREE.IcosahedronGeometry(r, detail ? 3 : 1);
    const points = ball.attributes.position;
    paint(ball, 0xffffff);
    const colors = ball.attributes.color;
    const color = new THREE.Color();
    for (let i = 0; i < points.count; i++) {
      const px = points.getX(i), py = points.getY(i), pz = points.getZ(i);
      const scale = 1 + Math.sin(px * 5.5 + j) * Math.sin(pz * 5.2 + py * 4) * .065;
      points.setXYZ(i, px * scale, py * scale * squash, pz * scale);
      const height = (py * squash + y - 1.8) / 2.5;
      color.copy(height < .5 ? low : middle).lerp(height < .5 ? middle : high, THREE.MathUtils.clamp(height < .5 ? height * 2 : height * 2 - 1, 0, 1));
      color.multiplyScalar(.95 + Math.sin(px * 3 + pz * 2 + j) * .045);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    foliage.push(ball.translate(x, y, z));
  }
  if (apples) {
    for (const [i, [x, y, z]] of [[1.14, 2.7, .7], [-1.12, 2.75, .66], [.42, 2.45, -1.24], [-.37, 3.55, .91],
      [.78, 3.23, -.79], [-.65, 2.42, -.86]].entries()) {
      fruit.push(paint(new THREE.SphereGeometry(.19, 12, 9).scale(1, .89, 1).translate(x, y, z), i % 3 === 0 ? 0xffac58 : 0xf94d4c));
      wood.push(woodBranch([x, y + .15, z], [x + .03, y + .27, z], .018, .009));
      foliage.push(paint(new THREE.SphereGeometry(.09, 7, 5).scale(1.5, .2, .65).rotateZ(.3).translate(x + .07, y + .23, z), 0x91c65c));
    }
  }
  return {
    wood: merge(wood, ['position', 'normal', 'uv', 'color']),
    foliage: merge(foliage, ['position', 'normal', 'uv', 'color']),
    fruit: fruit.length ? merge(fruit, ['position', 'normal', 'uv', 'color']) : null,
  };
}

/** Softly swept fir skirts, each with a scalloped, brightly tipped hem. */
function pineTree(detail) {
  const wood = [woodBranch([0, -.1, 0], [0, 3.9, 0], .25, .055)];
  const foliage = [];
  for (const [j, [radius, height, y]] of [[1.3, 1.45, 1.4], [1.09, 1.34, 2.16], [.85, 1.18, 2.89], [.58, 1.1, 3.55]].entries()) {
    const profile = [[radius * .93, -height * .46], [radius, -height * .35], [radius * .72, -height * .16],
      [radius * .45, height * .1], [radius * .2, height * .32], [.012, height * .55]].map(([x, yy]) => new THREE.Vector2(x, yy));
    const bough = new THREE.LatheGeometry(profile, detail ? 24 : 12);
    paint(bough, 0xffffff);
    const points = bough.attributes.position;
    const colors = bough.attributes.color;
    const low = new THREE.Color(0x286f62), high = new THREE.Color(0x88c889);
    const color = new THREE.Color();
    for (let i = 0; i < points.count; i++) {
      const a = Math.atan2(points.getZ(i), points.getX(i));
      const fade = 1 - (points.getY(i) / height + .5);
      const flare = 1 + Math.cos(a * 8 + j) * .08 * fade;
      const h = points.getY(i) - Math.cos(a * 8 + j) * .08 * fade;
      points.setXYZ(i, points.getX(i) * flare, h, points.getZ(i) * flare);
      const brightness = .25 + j * .07 + Math.pow(Math.max(0, fade), 4) * .55;
      color.copy(low).lerp(high, Math.min(1, brightness));
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    foliage.push(bough.translate(0, y, 0));
  }
  return { wood: merge(wood, ['position', 'normal', 'uv', 'color']), foliage: merge(foliage, ['position', 'normal', 'uv', 'color']), fruit: null };
}

// ---- Decoration ---------------------------------------------------------------

/** A tuft of five grass blades, grey from dark root to light tip (the instance colour tints it). */
function tuftGeometry() {
  const pos = [];
  const col = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + (k % 2) * 0.4;
    const h = 0.3 + ((k * 7) % 5) * 0.05;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const px = -cz * 0.045;
    const pz = cx * 0.045;
    pos.push(cx * 0.05 - px, 0, cz * 0.05 - pz, cx * 0.05 + px, 0, cz * 0.05 + pz, cx * 0.2, h, cz * 0.2);
    col.push(0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 1, 1, 1);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Lit like the ground under it, from either side.
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geom.name = 'tufts';
  return geom;
}

/** Flat five-petal shape in the XZ plane at height y, as a triangle fan. */
function petalFan(radius, y, points = 15) {
  const pos = [0, y, 0];
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const r = radius * (0.62 + 0.38 * Math.abs(Math.cos(a * 2.5)));
    pos.push(Math.cos(a) * r, y - radius * 0.2 + Math.sin(a * 2.5) ** 2 * radius * 0.18, Math.sin(a) * r);
  }
  const index = [];
  for (let i = 1; i <= points; i++) index.push(0, i + 1, i);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geom.setIndex(index);
  return geom;
}

/** A little flower: stem, pen-dark rim, petals (tinted per instance), yellow middle. */
function flowerGeometry() {
  const stem = new THREE.BufferGeometry();
  stem.setAttribute('position', new THREE.Float32BufferAttribute([-0.025, 0, 0, 0.025, 0, 0, 0, 0.34, 0], 3));
  stem.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  stem.setIndex([0, 1, 2]);
  const parts = [
    paint(stem, 0x2f8f2a, 0),
    paint(petalFan(0.205, 0.335, 25), 0x6c543c, 0),
    paint(petalFan(0.19, 0.345, 25), 0xffffff, 1),
    paint(new THREE.SphereGeometry(0.051, 8, 4).scale(1, 0.45, 1).translate(0, 0.352, 0), 0xffd23f, 0),
  ];
  return Object.assign(merge(parts, ['position', 'normal', 'color', 'petal']), { name: 'flowers' });
}

function pebbleGeometry() {
  return Object.assign(new THREE.IcosahedronGeometry(0.2, 1).scale(1, 0.55, 0.85).translate(0, 0.04, 0), { name: 'pebbles' });
}

/** Two pairs of softly pointed wings and a slim body, tinted per butterfly. */
function butterflyGeometry() {
  const pos = [];
  const col = [];
  const triangle = (vertices, shade) => {
    pos.push(...vertices.flat());
    for (let i = 0; i < 3; i++) col.push(shade, shade * 0.94, shade);
  };
  for (const side of [-1, 1]) {
    triangle([[0, 0, -0.04], [side * 0.24, 0, -0.2], [side * 0.2, 0, 0.035]], 1);
    triangle([[0, 0, -0.04], [side * 0.2, 0, 0.035], [side * 0.1, 0, 0.18]], 0.73);
  }
  triangle([[-0.018, 0.012, -0.12], [0.018, 0.012, -0.12], [0, 0.012, 0.16]], 0.23);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  geometry.name = 'butterflies';
  return geometry;
}

/** A red toadstool with white dots, as kids draw them. */
function mushroomGeometry() {
  const parts = [
    paint(new THREE.CylinderGeometry(0.07, 0.09, 0.26, 6, 1, true).translate(0, 0.13, 0), 0xfff4e0),
    paint(new THREE.SphereGeometry(0.2, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1).translate(0, 0.24, 0), 0xff3b30),
  ];
  for (const [x, z] of [[0.09, 0.05], [-0.08, 0.08], [0.02, -0.11], [-0.1, -0.04]]) {
    const y = 0.24 + Math.sqrt(Math.max(0, 0.04 - x * x - z * z)) * 0.75;
    parts.push(paint(new THREE.CircleGeometry(0.034, 4).rotateX(-Math.PI / 2).translate(x, y + 0.004, z), 0xffffff));
  }
  return Object.assign(merge(parts, ['position', 'normal', 'color']), { name: 'mushrooms' });
}

/** Three crystals leaning apart. */
function crystalGeometry() {
  const parts = [];
  for (const [x, z, h, tilt] of [[0, 0, 1, 0], [0.16, 0.06, 0.7, 0.35], [-0.12, 0.1, 0.6, -0.4]]) {
    const g = new THREE.OctahedronGeometry(0.16, 0).scale(0.75, 2.2 * h, 0.75).translate(0, 0.3 * h, 0);
    g.rotateZ(tilt).rotateX(tilt * 0.5).translate(x, 0, z);
    parts.push(g);
  }
  return Object.assign(merge(parts, ['position', 'normal']), { name: 'crystals' });
}

const DECO = {
  meadow: {
    tufts: { density: 0.18, colors: [0x92c965, 0x81b754, 0xb1d478] },
    flowers: { density: 0.062, colors: [0xff91b7, 0xffdd77, 0xfff7e0, 0xc9a4f6, 0xff765e] },
    pebbles: { density: 0.012, colors: [0xa6a6b4, 0xb8ad98, 0x8e93a2] },
    mushrooms: { density: 0.0022 },
    butterflies: { density: 0.003, colors: [0xffc95c, 0x8ae5fa, 0xed9bf5, 0xffa979] },
  },
  moon: {
    pebbles: { density: 0.045, colors: [0x858a9c, 0xa2a8ba, 0x6c7080] },
    crystals: { density: 0.006, colors: [0xc58bff, 0x7fe3ff, 0xff8fd8] },
  },
  gold: {
    tufts: { density: 0.08, colors: [0xf0c050, 0xe6a83a, 0xc8d050] },
    flowers: { density: 0.05, colors: [0xff4a3d, 0xfff7c2, 0xff8a1f, 0xff6fb5] },
    pebbles: { density: 0.02, colors: [0xc49467, 0xd8b384, 0x9c7048] },
    mushrooms: { density: 0.0018 },
    butterflies: { density: 0.003, colors: [0xffffb9, 0xffaabd, 0xc6b6ff] },
  },
};

/**
 * Where decoration may stand on `planet`: not in the lake, not inside
 * anything solid, not on the spawn points. Returns a test for a direction.
 */
function freeGround(level, planet) {
  const circles = [];
  const boxes = [];
  const add = (dir, radius) => circles.push({ dir, cos: Math.cos(radius / planet.radius) });
  for (const t of level.trees) if (t.planet === planet) add(t.dir, 0.95 * t.scale);
  for (const p of level.stumps) if (p.planet === planet) add(p.dir, 1.5);
  for (const s of level.stones) if (s.planet === planet) add(s.dir, s.radius + 0.4);
  for (const f of level.flags) if (f.planet === planet) add(f.dir, 0.7);
  if (level.plateau?.planet === planet) add(level.plateau.dir, level.plateau.radius + 0.7);
  if (level.spawn?.planet === planet) add(level.spawn.dir, 1.2);
  if (level.biplaneHome?.planet === planet) add(level.biplaneHome.dir, 2.5);
  if (level.moonSpawn?.planet === planet) add(level.moonSpawn.dir, 1.2);
  if (level.rocket?.to === planet) add(level.rocket.flight.landing, 2.6);
  if (level.course?.finish?.planet === planet) add(level.course.finish.dir, 4);
  for (const b of level.blocks) {
    if (b.planet !== planet || b.bottom > 0) continue;
    boxes.push({ dir: b.dir, forward: b.forward, right: new THREE.Vector3().crossVectors(b.forward, b.dir), half: b.size / 2 + 0.3 });
  }
  const toRad = Math.PI / 180;
  const lakeMargin = 1.2 / planet.radius;
  return (dir) => {
    if (planet.water) {
      const lat = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
      if (lat > planet.water.minLat * toRad - lakeMargin && lat < planet.water.maxLat * toRad + lakeMargin) return false;
    }
    for (const c of circles) if (dir.dot(c.dir) > c.cos) return false;
    for (const b of boxes) {
      tmp.subVectors(dir, b.dir).multiplyScalar(planet.radius);
      if (Math.abs(tmp.dot(b.forward)) < b.half && Math.abs(tmp.dot(b.right)) < b.half) return false;
    }
    return true;
  };
}

/** Ground point and normal at `dir`: on the planet, or up on a hill. */
function groundAt(planet, hills, dir, outPos, outNormal) {
  let best = 0;
  let hill = null;
  for (const h of hills) {
    // Where the ray from the planet's centre leaves the hill's sphere.
    const rel = tmp.subVectors(h.center, planet.center);
    const along = rel.dot(dir);
    const disc = along * along - (rel.lengthSq() - h.radius * h.radius);
    if (disc <= 0) continue;
    const height = along + Math.sqrt(disc) - planet.radius;
    if (height > best) {
      best = height;
      hill = h;
    }
  }
  surfacePoint(planet, dir, best, outPos);
  if (hill) outNormal.subVectors(outPos, hill.center).normalize();
  else outNormal.copy(dir);
  return outPos;
}

/** Baked soft contact shadows, curved to the planet, in a single draw call. */
function contactShadows(level, texture) {
  const pieces = [];
  const direction = new THREE.Vector3();
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (const planet of level.planets) {
    const hills = level.bumps.filter((b) => b.planet === planet).map((b) => ({
      center: surfacePoint(planet, b.dir, b.height - b.radius), radius: b.radius,
    }));
    const items = [
      ...level.trees.filter((t) => t.planet === planet).map((t) => [t.dir, 1.85 * t.scale]),
      ...level.stumps.filter((s) => s.planet === planet).map((s) => [s.dir, 1.6]),
      ...level.blocks.filter((b) => b.planet === planet && b.bottom <= 0).map((b) => [b.dir, b.size * 0.87]),
    ];
    for (const [dir, radius] of items) {
      const geometry = placed(new THREE.PlaneGeometry(radius * 2, radius * 2, 6, 6).rotateX(-Math.PI / 2), planet, dir);
      const vertices = geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        direction.fromBufferAttribute(vertices, i).sub(planet.center).normalize();
        groundAt(planet, hills, direction, point, normal).addScaledVector(normal, 0.025);
        vertices.setXYZ(i, point.x, point.y, point.z);
      }
      pieces.push(geometry);
    }
  }
  if (!pieces.length) return null;
  const mesh = new THREE.Mesh(merge(pieces, ['position', 'uv']), new THREE.MeshBasicMaterial({
    map: texture, color: 0x254024, opacity: 0.65,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  }));
  mesh.name = 'scenery:contact-shadows';
  mesh.renderOrder = -2;
  return mesh;
}

/** Instance matrix: standing at `pos` along `normal`, turned `yaw`, sunk a touch. */
function standing(pos, normal, yaw, scale, sink = 0.03) {
  dummy.position.copy(pos).addScaledVector(normal, -sink);
  dummy.quaternion.setFromUnitVectors(Y, normal).multiply(tmpQ.setFromAxisAngle(Y, yaw));
  dummy.scale.setScalar(scale);
  dummy.updateMatrix();
  return dummy.matrix.clone();
}

const occA = new THREE.Vector3();
const occB = new THREE.Vector3();
/** True when `planet` (shrunk by `shrink`) hides `point` from `eye`. */
function hiddenBehind(planet, eye, point, shrink = 0) {
  const d = occA.subVectors(point, eye);
  const len = d.length();
  d.divideScalar(len);
  const oc = occB.subVectors(planet.center, eye);
  const along = oc.dot(d);
  if (along < 0 || along > len) return false;
  const r = planet.radius - shrink;
  return oc.lengthSq() - along * along < r * r;
}

/**
 * Instanced things standing on planets: only the instances this side of
 * their planet's horizon are drawn, compacted to the front of the buffers.
 * From near the ground that is a small cap of the planet. Redone only when
 * the camera has moved a little. `items` give each instance's `planet`,
 * `dir` from the planet's centre and `top`, its highest point above ground.
 */
class HorizonCull {
  constructor(meshes, items) {
    this.meshes = meshes;
    this.count = items.length;
    this.planets = [...new Set(items.map((it) => it.planet))];
    this.planetOf = new Uint8Array(this.count);
    this.dirs = new Float32Array(this.count * 3);
    this.reach = new Float32Array(this.count);
    items.forEach((it, i) => {
      this.planetOf[i] = this.planets.indexOf(it.planet);
      it.dir.toArray(this.dirs, i * 3);
      // How far past the horizon its top still peeks over.
      this.reach[i] = Math.acos(it.planet.radius / (it.planet.radius + Math.max(0, it.top)));
    });
    this.source = meshes.map((m) => {
      m.computeBoundingSphere();
      return { matrix: m.instanceMatrix.array.slice(), color: m.instanceColor?.array.slice() ?? null };
    });
    this.views = this.planets.map(() => ({ dir: new THREE.Vector3(), horizon: 0 }));
    this.seen = new THREE.Vector3(Infinity, 0, 0);
  }

  update(cameraPos) {
    if (cameraPos.distanceToSquared(this.seen) < 0.16) return;
    this.seen.copy(cameraPos);
    for (const [k, p] of this.planets.entries()) {
      const view = this.views[k];
      const dist = view.dir.subVectors(cameraPos, p.center).length();
      view.dir.divideScalar(dist);
      // The slack covers the camera moving until the next rebuild.
      view.horizon = Math.acos(Math.min(1, p.radius / dist)) + 0.05;
    }
    const { dirs, reach, meshes, source, planetOf, views } = this;
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      const { dir, horizon } = views[planetOf[i]];
      const c = dirs[i * 3] * dir.x + dirs[i * 3 + 1] * dir.y + dirs[i * 3 + 2] * dir.z;
      if (Math.acos(Math.max(-1, Math.min(1, c))) > horizon + reach[i]) continue;
      for (let k = 0; k < meshes.length; k++) {
        meshes[k].instanceMatrix.array.set(source[k].matrix.subarray(i * 16, i * 16 + 16), n * 16);
        if (source[k].color) meshes[k].instanceColor.array.set(source[k].color.subarray(i * 3, i * 3 + 3), n * 3);
      }
      n++;
    }
    for (const m of meshes) {
      m.count = n;
      for (const [attr, size] of [[m.instanceMatrix, 16], [m.instanceColor, 3]]) {
        if (!attr) continue;
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, n * size);
        attr.needsUpdate = true;
      }
    }
  }

  setHidden(hidden) {
    for (const m of this.meshes) m.visible = !hidden;
  }
}

/** Scatters the planet's decoration as instanced meshes into `group`. */
function decorate(group, level, planet, deco, tier, sway) {
  const rnd = mulberry32(Math.round(planet.radius * 1000) + 7);
  const free = freeGround(level, planet);
  const hills = level.bumps.filter((b) => b.planet === planet).map((b) => ({
    center: surfacePoint(planet, b.dir, b.height - b.radius), radius: b.radius,
  }));
  const area = 4 * Math.PI * planet.radius ** 2;
  const amount = [0.35, 0.6, 1][tier];
  const dir = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const normal = new THREE.Vector3();
  // Soft patches, so flowers grow in meadows rather than evenly.
  const seed = rnd() * 10;
  const patch = (d) => Math.sin(d.x * 5.1 + seed) * Math.sin(d.y * 4.3 + seed * 0.7) + Math.sin(d.z * 6.7 - seed) * 0.5;
  const layers = {};

  const scatter = (name, count, accept = () => true) => {
    const spec = deco[name];
    const items = [];
    for (let tries = 0; items.length < count && tries < count * 8; tries++) {
      dir.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      const len = dir.length();
      if (len > 1 || len < 1e-3) continue;
      dir.divideScalar(len);
      if (!free(dir) || !accept(dir)) continue;
      groundAt(planet, hills, dir, pos, normal);
      if (name === 'butterflies') pos.addScaledVector(normal, 0.9 + rnd() * 0.8);
      items.push({ pos: pos.clone(), normal: normal.clone(), color: spec.colors?.[Math.floor(rnd() * spec.colors.length)] });
    }
    layers[name] = items;
  };

  for (const name of Object.keys(deco)) {
    const n = Math.round(deco[name].density * area * amount);
    if (name === 'flowers') scatter(name, n, (d) => patch(d) > 0.1 || rnd() < 0.15);
    else if (name === 'mushrooms') scatter(name, tier === 0 ? 0 : n, (d) => patch(d) < -0.2);
    else if (name === 'butterflies') scatter(name, tier === 0 ? 0 : n, (d) => patch(d) > 0);
    else scatter(name, n);
  }

  // Tufts round the foot of trees, stumps and the plateau, so they stand in grass.
  if (deco.tufts) {
    const around = [];
    for (const t of level.trees) if (t.planet === planet) around.push([t.dir, 0.55 * t.scale, 4]);
    for (const p of level.stumps) if (p.planet === planet) around.push([p.dir, 1.4, 6]);
    if (level.plateau?.planet === planet) around.push([level.plateau.dir, level.plateau.radius + 0.5, 22]);
    for (const [center, radius, n] of around) {
      const east = tangentDir(tmp2.set(0.3, 0.1, 0.9), center, new THREE.Vector3()) ?? new THREE.Vector3(1, 0, 0);
      const north = new THREE.Vector3().crossVectors(center, east);
      for (let i = 0; i < n * (tier ? 1 : 0.5); i++) {
        const a = (i / n) * Math.PI * 2 + rnd();
        const r = (radius + 0.2 + rnd() * 0.45) / planet.radius;
        dir.copy(center).multiplyScalar(Math.cos(r)).addScaledVector(east, Math.sin(r) * Math.cos(a)).addScaledVector(north, Math.sin(r) * Math.sin(a)).normalize();
        if (!free(dir)) continue;
        groundAt(planet, hills, dir, pos, normal);
        layers.tufts.push({ pos: pos.clone(), normal: normal.clone(), color: deco.tufts.colors[i % deco.tufts.colors.length] });
      }
    }
  }

  const instances = (items, scale) => {
    const color = new THREE.Color();
    return {
      count: items.length,
      matrices: items.map((it) => standing(it.pos, it.normal, rnd() * Math.PI * 2, scale[0] + rnd() * (scale[1] - scale[0]))),
      colors: items.map((it) => color.set(it.color ?? 0xffffff).offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.08).clone()),
    };
  };
  const culled = (meshes, items, height) => new HorizonCull(meshes, items.map((it) => ({
    planet,
    dir: tmp2.subVectors(it.pos, planet.center).normalize().clone(),
    top: it.pos.distanceTo(planet.center) - planet.radius + height,
  })));
  const plain = (geom, material, items, scale, height) => {
    const data = instances(items, scale);
    const mesh = new THREE.InstancedMesh(geom, material, data.count);
    mesh.name = geom.name;
    data.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    data.colors.forEach((c, i) => mesh.setColorAt(i, c));
    group.add(mesh);
    return culled([mesh], items, height);
  };
  const outlined = (geom, material, thickness, items, scale, height) => {
    const { body, line } = inked(group, geom, material, thickness, { instanced: instances(items, scale), name: geom.name });
    return culled([body, line], items, height);
  };

  const built = {};
  if (layers.tufts?.length) {
    built.tufts = plain(tuftGeometry(), toonWith(0xffffff, { vertexColors: true, side: THREE.DoubleSide }, { sway: { time: sway, amount: 0.25 } }), layers.tufts, [0.8, 1.5], 0.8);
  }
  if (layers.flowers?.length) {
    built.flowers = plain(flowerGeometry(), toonWith(0xffffff, { vertexColors: true, side: THREE.DoubleSide }, { sway: { time: sway, amount: 0.12 }, petal: true }), layers.flowers, [0.9, 1.5], 0.6);
  }
  if (layers.pebbles?.length) {
    built.pebbles = outlined(pebbleGeometry(), surfaceWith(0xffffff, { shininess: 6 }, { rim: { color: 0x9fb0ff, strength: 0.16 } }), 0.012, layers.pebbles, [0.6, 1.8], 0.3);
  }
  if (layers.mushrooms?.length) {
    built.mushrooms = outlined(mushroomGeometry(), toon(0xffffff, { vertexColors: true }), 0.02, layers.mushrooms, [0.9, 1.6], 0.6);
  }
  if (layers.crystals?.length) {
    built.crystals = outlined(crystalGeometry(), surfaceWith(0xffffff, { shininess: 90, specular: 0xffffff }, { glow: { amount: 0.2 }, rim: { color: 0xaadfff, strength: 0.4 } }), 0.01, layers.crystals, [1.2, 2.2], 1.6);
  }
  if (layers.butterflies?.length) {
    built.butterflies = plain(butterflyGeometry(), surfaceWith(0xffffff, { vertexColors: true, side: THREE.DoubleSide, shininess: 25 }, { flutter: { time: sway } }), layers.butterflies, [0.8, 1.3], 1.2);
  }
  return built;
}

// ---- Glitzersteine, goal, arena --------------------------------------------------

/** A see-through bubble with a bright rim, a soap-film shimmer and a highlight. */
function bubbleMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = 1.0 - max(dot(vN, vV), 0.0);
        float rim = smoothstep(0.35, 1.0, f);
        vec3 film = 0.5 + 0.5 * cos(6.2831 * (f * 1.3 + uTime * 0.15 + vec3(0.0, 0.33, 0.67)));
        float spot = smoothstep(0.93, 0.97, dot(vN, normalize(vec3(-0.4, 0.55, 0.75))));
        vec3 col = mix(uColor, film, 0.35) * (0.35 + rim * 1.2) + spot;
        gl_FragColor = vec4(col, 0.12 + rim * 0.55 + spot * 0.6);
      }`,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}

/** The big crystal the boss guards: a glowing cluster with a halo and rays. */
function makeGoalCrystal(art, environment) {
  const g = new THREE.Group();
  const crystal = new THREE.Mesh(bigCrystalGeometry(), jewelWith(environment, { color: CRYSTAL_COLOR, emissive: CRYSTAL_GLOW }, { rim: { color: 0xa8efff, strength: 0.45 } }));
  crystal.add(new THREE.Mesh(hullGeometry(crystal.geometry), penOutline(0.026, 0x2a617c, 0.15)));
  g.add(crystal);
  const rays = new THREE.Sprite(new THREE.SpriteMaterial({
    map: art.rays ?? art.glow, color: 0xc9f7ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.45,
  }));
  rays.scale.setScalar(7);
  g.add(rays);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: art.glow, color: 0x9eeeff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  halo.scale.setScalar(6);
  g.add(halo);
  return { group: g, crystal, halo, rays };
}

/** The floating boss arena: a disc of Miro's floor on a rock keel, a glowing rim and a shimmering fence of light. */
function makeArena(level, floorMaterial, detail) {
  const ar = level.arena;
  const disc = new THREE.Group();
  const seg = detail ? 48 : 32;
  const slab = cylinderUv(new THREE.CylinderGeometry(ar.radius, ar.radius * 0.85, 1.0, seg), ar.radius, 1.0, FLOOR_TILE).translate(0, -0.5, 0);
  const keelHeight = ar.radius * 0.7;
  const keel = cylinderUv(new THREE.ConeGeometry(ar.radius * 0.85, keelHeight, Math.round(seg / 2), 1, true), ar.radius * 0.6, keelHeight, FLOOR_TILE)
    .rotateX(Math.PI).translate(0, -1.0 - keelHeight / 2, 0);
  inked(disc, merge([slab, keel], ['position', 'normal', 'uv']), floorMaterial, 0.07, { name: 'arena' });

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(ar.radius, 0.14, 8, seg * 2),
    new THREE.MeshBasicMaterial({ color: 0xd9a8ff, toneMapped: false }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.02;
  disc.add(rim);

  const fenceUniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xc58bff) } };
  const fence = new THREE.Mesh(
    new THREE.CylinderGeometry(ar.radius, ar.radius, 1.4, seg * 2, 1, true).translate(0, 0.7, 0),
    new THREE.ShaderMaterial({
      uniforms: fenceUniforms,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float fade = pow(1.0 - vUv.y, 2.5);
          float wave = 0.55 + 0.45 * sin(vUv.x * 150.0 + uTime * 2.0 + sin(vUv.y * 6.0 - uTime * 3.0));
          gl_FragColor = vec4(uColor * fade * wave * 0.8, 1.0);
        }`,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      forceSinglePass: true,
      toneMapped: false,
    }),
  );
  disc.add(fence);
  placeOn(disc, ar.planet, ar.dir, ar.top, ar.facing);
  return { disc, fence: fenceUniforms };
}

// ---- Billboards: particles and glows ----------------------------------------------

const BILLBOARD_VERTEX = /* glsl */`
  attribute vec3 center;
  attribute vec4 tint;
  attribute vec2 shape;
  varying vec2 vUv;
  varying vec4 vTint;
  void main() {
    vUv = position.xy + 0.5;
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(center, 1.0);
    float c = cos(shape.y);
    float s = sin(shape.y);
    mv.xy += mat2(c, s, -s, c) * position.xy * shape.x;
    gl_Position = projectionMatrix * mv;
  }`;

const BILLBOARD_FRAGMENT = /* glsl */`
  uniform sampler2D map;
  uniform float halo;
  varying vec2 vUv;
  varying vec4 vTint;
  void main() {
    float a = texture2D(map, vUv).a;
    a = max(a, smoothstep(0.5, 0.0, length(vUv - 0.5)) * halo);
    gl_FragColor = vec4(vTint.rgb, a * vTint.a);
    #include <colorspace_fragment>
  }`;

/** Camera-facing quads, all in one instanced draw call. */
class Billboards {
  constructor(max, map, halo = 0) {
    const geom = new THREE.InstancedBufferGeometry();
    geom.setIndex([0, 1, 2, 0, 2, 3]);
    geom.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    const attr = (size) => new THREE.InstancedBufferAttribute(new Float32Array(max * size), size).setUsage(THREE.DynamicDrawUsage);
    this.center = attr(3);
    this.tint = attr(4);
    this.shape = attr(2);
    geom.setAttribute('center', this.center);
    geom.setAttribute('tint', this.tint);
    geom.setAttribute('shape', this.shape);
    geom.instanceCount = 0;
    this.mesh = new THREE.Mesh(geom, new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, halo: { value: halo } },
      vertexShader: BILLBOARD_VERTEX,
      fragmentShader: BILLBOARD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  set(i, pos, color, alpha, size, spin) {
    this.center.setXYZ(i, pos.x, pos.y, pos.z);
    this.tint.setXYZW(i, color.r, color.g, color.b, alpha);
    this.shape.setXY(i, size, spin);
  }

  commit(count) {
    this.mesh.geometry.instanceCount = count;
    this.mesh.visible = count > 0;
    if (!count) return;
    for (const a of [this.center, this.tint, this.shape]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, count * a.itemSize);
      a.needsUpdate = true;
    }
  }
}

const WHITE = new THREE.Color(0xffffff);

/** Pooled sparkles, splashes and confetti: one draw call for all of them. */
export class Particles {
  constructor(scene, texture, max = 200) {
    this.board = new Billboards(max, texture, 0.3);
    this.board.mesh.renderOrder = 2;
    this.board.mesh.name = 'particles';
    scene.add(this.board.mesh);
    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), color: new THREE.Color(), g: new THREE.Vector3(),
        life: 0, max: 1, size: 1, gravity: null, spin: 0, turn: 0,
      });
    }
    this.next = 0;
    this.color = new THREE.Color();
  }

  burst(pos, { count = 10, color = 0xffffff, speed = 5, life = 0.6, size = 0.5, gravity = null, along = null } = {}) {
    for (let i = 0; i < count; i++) {
      const p = this.items[this.next];
      this.next = (this.next + 1) % this.items.length;
      p.pos.copy(pos);
      p.color.set(Array.isArray(color) ? color[i % color.length] : color);
      p.vel.randomDirection().multiplyScalar(speed * (0.5 + Math.random() * 0.5));
      if (along) p.vel.addScaledVector(along, speed);
      p.life = p.max = life * (0.7 + Math.random() * 0.6);
      p.size = size;
      // Copied: callers often pass a scratch vector they go on reusing.
      p.gravity = gravity ? p.g.copy(gravity) : null;
      p.spin = Math.random() * Math.PI;
      p.turn = (Math.random() - 0.5) * 8;
    }
  }

  update(dt) {
    let n = 0;
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.gravity) p.vel.addScaledVector(p.gravity, dt);
      p.pos.addScaledVector(p.vel, dt);
      p.spin += p.turn * dt;
      const k = p.life / p.max;
      // Pop in, flash white for a moment, then shrink and fade.
      const pop = Math.min(1, (1 - k) * 10);
      const size = p.size * (0.3 + k * 0.7) * (0.5 + 0.5 * pop) * 1.15;
      this.color.copy(p.color).lerp(WHITE, Math.max(0, (k - 0.8) * 2.5));
      this.board.set(n++, p.pos, this.color, Math.min(1, k * 2.2), size, p.spin);
    }
    this.board.commit(n);
  }
}

/** Soft dark disc under a figure, the one depth cue a 3D jump needs most. */
export function makeShadow(art, size) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: art.shadow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    }),
  );
  m.geometry.rotateX(-Math.PI / 2);
  return m;
}

// ---- The whole world -----------------------------------------------------------

// The big crystal: ice blue, lit from inside.
const CRYSTAL_COLOR = 0x8ff3ff;
const CRYSTAL_GLOW = 0x1d7fa8;
const BIT_COLORS = [0xffe14d, 0xff6fb5, 0x5fe3ff, 0x8dff6a, 0xc58bff];

/**
 * Builds the static world, the lights, and the meshes for collectables, flags
 * and the rocket. Call update(dt, t, camera, focus) on the result every frame.
 */
export function buildScene(scene, level, art, { tier = deviceTier() } = {}) {
  const detail = tier === 0 ? 0 : 1;
  const environment = makeEnvironmentArt();
  const sky = makeSky(tier);
  sky.group.name = 'sky';
  scene.add(sky.group);
  const backdrop = makeBackdropPlanet(art);
  backdrop.name = 'backdrop';
  scene.add(backdrop);
  // Kept for anything else that dresses up in Miro's floor.
  art.blockMaterial = toon(0xffffff, { map: art.floor });
  const floorMaterial = toonWith(0xffffff, { map: art.floor }, { rim: { color: 0xc9b8ff, from: 0.7, strength: 0.3 } });

  // The light rides with the camera (see update), so the side of a planet
  // you are looking at is never in the dark.
  const ambient = new THREE.AmbientLight(0xd0dcff, 0.87);
  const sun = new THREE.DirectionalLight(0xffedcb, 2.15);
  const fill = new THREE.DirectionalLight(0xa9d9ff, 0.6);
  scene.add(ambient, sun, sun.target, fill, fill.target);

  const sway = { value: 0 };
  const decorations = [];
  const culls = [];
  const glows = [];
  for (const p of level.planets) {
    const look = lookOf(p);
    const { body, hull } = planetGeometry(p, level.bumps, tier === 0 ? 0.8 : 1);
    const features = {
      triplanar: { scale: look.size },
      rim: { color: look.rim, from: 0.65, strength: 0.32 },
      lake: p.water ? { ...p.water, radius: p.radius } : null,
    };
    // The moon deliberately keeps the actual floor drawing and its original material.
    const material = p.look === 'floor'
      ? toonWith(0xffffff, { map: art.floor }, features)
      : surfaceWith(0xffffff, { map: environment[look.tex] ?? environment.meadow, shininess: 7 }, features);
    const mesh = new THREE.Mesh(body, material);
    mesh.position.copy(p.center);
    const line = new THREE.Mesh(hull, penOutline(0.035 + p.radius * 0.002, PEN, 0.15));
    line.position.copy(p.center);
    mesh.name = `planet:${p.id}`;
    line.name = `planet:${p.id}:pen`;
    const glow = atmosphere(p, look.glow);
    glow.name = `atmosphere:${p.id}`;
    glows.push({ mesh: glow, planet: p, outer: p.radius * 1.18 });
    scene.add(mesh, line, glow);
    const deco = new THREE.Group();
    deco.name = `decoration:${p.id}`;
    const built = decorate(deco, level, p, DECO[look.deco], tier, sway);
    decorations.push(built);
    culls.push(...Object.values(built));
    scene.add(deco);
  }

  // The ring lake (water.js).
  const lakes = level.planets.filter((p) => p.water).map((p) => {
    const w = buildWater(p, { stones: level.stones, bumps: level.bumps, scribble: environment.water, detail });
    w.mesh.renderOrder = -1;
    w.mesh.name = `water:${p.id}`;
    scene.add(w.mesh);
    return w;
  });
  // `flow` stays for older callers; the lake animates in update().
  const water = { flow: { value: 0 }, lakes, mesh: lakes[0]?.mesh ?? null };

  // Satin wood, gently raised fibres and cut end grain. The collision tops stay put.
  const woodMaterial = surfaceWith(0xffffff, { map: environment.bark, bumpMap: environment.bark, bumpScale: .035, vertexColors: true, shininess: 12, specular: 0x423222 });
  if (level.stumps.length) {
    const { bark, wood } = stumpsGeometry(level.stumps);
    const stumps = new THREE.Mesh(bark, woodMaterial);
    const tops = new THREE.Mesh(wood, surfaceWith(0xffffff, { map: environment.grain, vertexColors: true, shininess: 9 }));
    stumps.name = 'stumps';
    tops.name = 'stumps:cut-wood';
    scene.add(stumps, tops);
  }
  for (const p of level.planets) {
    const geom = floorGeometry(level, p);
    if (geom) inked(scene, geom, floorMaterial, 0.055, { name: `floor:${p.id}` });
  }

  const shadows = contactShadows(level, art.shadow);
  if (shadows) scene.add(shadows);

  // Trees: round ones with and without apples, and firs; all instanced.
  const trees = level.trees.map((t, i) => ({ ...t, kind: t.scale > 1.3 || i % 3 !== 1 ? (i % 2 ? 'apple' : 'round') : 'pine' }));
  const canopyMaterial = surfaceWith(0xffffff, { map: environment.canopy, bumpMap: environment.canopy, bumpScale: .035, vertexColors: true, shininess: 25, specular: 0x49602c }, { rim: { color: 0xd8ffb0, strength: 0.16 }, sway: { time: sway, amount: .008 } });
  const fruitMaterial = surfaceWith(0xffffff, { vertexColors: true, shininess: 65, specular: 0xffdba5 });
  const treeRnd = mulberry32(5);
  for (const [kind, parts] of [['round', roundTree(false, detail)], ['apple', roundTree(true, detail)], ['pine', pineTree(detail)]]) {
    const list = trees.filter((t) => t.kind === kind);
    if (!list.length) continue;
    const color = new THREE.Color();
    const matrices = list.map((t) => {
      surfacePoint(t.planet, t.dir, -.05, tmp);
      return standing(tmp, t.dir, treeRnd() * Math.PI * 2, t.scale * (.95 + treeRnd() * .1), 0);
    });
    const colors = list.map(() => color.setHSL(0, 0, 1).offsetHSL((treeRnd() - .5) * .035, 0, (treeRnd() - .5) * .05).clone());
    const meshes = [];
    for (const [part, material] of [['wood', woodMaterial], ['foliage', canopyMaterial], ['fruit', fruitMaterial]]) {
      if (!parts[part]) continue;
      const mesh = new THREE.InstancedMesh(parts[part], material, list.length);
      mesh.name = `trees:${kind}:${part}`;
      matrices.forEach((matrix, i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, colors[i]); });
      scene.add(mesh);
      meshes.push(mesh);
    }
    culls.push(new HorizonCull(meshes, list.map((t) => ({ planet: t.planet, dir: t.dir, top: 4.5 * t.scale }))));
  }

  const scenery = buildScenery(scene, level, environment, { tier, time: sway, makeCull: (meshes, items) => new HorizonCull(meshes, items) });

  const north = new THREE.Vector3(0, 1, 0);
  const flags = level.flags.map((f) => {
    const built = buildFlag(art);
    placeOn(built.group, f.planet, f.dir, 0, north);
    built.group.name = 'flag';
    scene.add(built.group);
    return { ...f, ...built, center: built.group.position.clone(), reached: false, raise: 0 };
  });
  // Poles and knobs never move: one mesh and one pen line for all of them.
  const flagParts = mergeStatic(scene, flags.map((f) => f.group), (root) => flags.find((f) => f.group === root)?.flag);
  if (flagParts) flagParts.body.name = 'flags:poles';

  const rocket = buildRocket(art);
  rocket.group.name = 'rocket';
  scene.add(rocket.group);

  // Two more of Miro's rockets, just flying round the world.
  const flyers = [0.5, 0.42].map((scale, i) => {
    const r = buildRocket(art);
    r.group.scale.setScalar(scale);
    r.flame.visible = true;
    r.group.name = 'flyer';
    scene.add(r.group);
    const tilt = new THREE.Vector3(i ? -0.4 : 0.5, 1, i ? 0.6 : -0.3).normalize();
    return { ...r, axis: tilt, radius: 44 + i * 6, speed: i ? -0.11 : 0.14, phase: i * 2 };
  });

  // Glitzersteine: each keeps a plain Object3D as `mesh` (position, rotation,
  // visible) and one instanced mesh draws them all from those.
  const bitMesh = new THREE.InstancedMesh(gemGeometry(), jewelWith(environment.jewel, {}, { glow: { amount: 0.18 } }), level.bits.length);
  const bitLine = new THREE.InstancedMesh(hullGeometry(bitMesh.geometry), penOutline(0.012, 0x3a3d64, 0.15), level.bits.length);
  const bitColor = new THREE.Color();
  const bits = level.bits.map((b, i) => {
    const mesh = new THREE.Object3D();
    mesh.position.copy(b.pos);
    mesh.updateMatrix();
    bitMesh.setMatrixAt(i, mesh.matrix);
    bitLine.setMatrixAt(i, mesh.matrix);
    bitMesh.setColorAt(i, bitColor.set(BIT_COLORS[i % BIT_COLORS.length]));
    return { ...b, mesh, color: BIT_COLORS[i % BIT_COLORS.length], taken: false, phase: i * 0.7 };
  });
  bitMesh.computeBoundingSphere();
  bitLine.computeBoundingSphere();
  bitMesh.name = 'bits';
  bitLine.name = 'bits:pen';
  scene.add(bitMesh, bitLine);
  const bitGlow = new Billboards(Math.max(1, bits.length), art.glow, 0);
  bitGlow.mesh.name = 'bits:glow';
  scene.add(bitGlow.mesh);
  const bitColors = bits.map((b) => new THREE.Color(b.color));
  let glowTime = 0;
  // Synced from the Object3Ds right before drawing, so a taken bit
  // (mesh.visible = false) disappears whether or not update() runs. Bits
  // hidden behind their planet are left out.
  bitGlow.mesh.onBeforeRender = (renderer, _scene, camera) => {
    let n = 0;
    for (const [i, b] of bits.entries()) {
      const proxy = b.mesh;
      if (!proxy.visible || hiddenBehind(b.planet, camera.position, proxy.position, 0.3)) continue;
      proxy.updateMatrix();
      bitMesh.setMatrixAt(n, proxy.matrix);
      bitLine.setMatrixAt(n, proxy.matrix);
      bitMesh.setColorAt(n, bitColors[i]);
      bitGlow.set(n, proxy.position, bitColors[i], 0.4 + 0.12 * Math.sin(glowTime * 3 + b.phase), 1.5, 0);
      n++;
    }
    bitMesh.count = bitLine.count = n;
    bitMesh.instanceMatrix.needsUpdate = true;
    bitLine.instanceMatrix.needsUpdate = true;
    bitMesh.instanceColor.needsUpdate = true;
    bitGlow.commit(n);
    // Stays in the render list, so this runs again when bits come back.
    bitGlow.mesh.visible = true;
  };
  bitGlow.mesh.visible = true;

  const arena = makeArena(level, floorMaterial, detail);
  arena.disc.name = 'arena';
  scene.add(arena.disc);

  const goal = makeGoalCrystal(art, environment.jewel);
  placeOn(goal.group, level.goal.planet, level.goal.dir, level.goal.height);
  goal.group.name = 'goal';
  scene.add(goal.group);
  // Until the boss is beaten the crystal sits in a bubble you cannot reach through.
  const bubbleMat = bubbleMaterial(0xc58bff);
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(2.1, 32, 24), bubbleMat);
  goal.group.add(bubble);

  const camDir = new THREE.Vector3();
  const right = new THREE.Vector3();
  const sunDir = new THREE.Vector3();

  return {
    sky: sky.group,
    water,
    bits,
    flags,
    rocket,
    flyers,
    arena: arena.disc,
    goal: { ...level.goal, ...goal, bubble, center: goal.group.position.clone() },
    lights: { ambient, sun, fill },

    /** All decorative animation; call once per frame, after the camera has moved. */
    update(dt, t, camera, focus = null) {
      glowTime = t;
      sky.group.position.copy(camera.position);
      sky.stars.uTime.value = t;
      sky.shooting.update(dt, camera);

      camera.getWorldDirection(camDir);
      right.crossVectors(camDir, camera.up).normalize();
      sun.position.copy(camera.position).addScaledVector(camera.up, 30).addScaledVector(right, 12);
      if (focus) sun.target.position.copy(focus);
      else sun.target.position.copy(camera.position).addScaledVector(camDir, 10);
      fill.position.copy(camera.position).addScaledVector(camera.up, 8).addScaledVector(right, -25);
      fill.target.position.copy(sun.target.position);
      sunDir.subVectors(sun.position, sun.target.position).normalize();

      for (const lake of lakes) lake.update(t, sunDir);
      sway.value = t;
      scenery.update(t, camera);

      for (const r of flyers) {
        // Round the world on a tilted circle, nose first, flame on.
        const a = r.phase + t * r.speed;
        const u = tmp.set(1, 0, 0).addScaledVector(r.axis, -r.axis.x).normalize();
        const v = tmp2.crossVectors(r.axis, u);
        r.group.position.copy(u).multiplyScalar(Math.cos(a) * r.radius).addScaledVector(v, Math.sin(a) * r.radius);
        const dir = u.multiplyScalar(-Math.sin(a)).addScaledVector(v, Math.cos(a)).multiplyScalar(Math.sign(r.speed));
        r.group.quaternion.setFromUnitVectors(Y, dir.normalize());
        r.flame.scale.y = 0.8 + Math.random() * 0.4;
        // Behind the world it cannot be seen: skip its dozen draw calls.
        r.group.visible = !level.planets.some((p) => hiddenBehind(p, camera.position, r.group.position, 2));
      }
      for (const c of culls) c.update(camera.position);
      // Inside its shell a planet's glow fades to nothing (see atmosphere()),
      // but would still cost a full-screen blended pass.
      for (const g of glows) g.mesh.visible = camera.position.distanceTo(g.planet.center) > g.outer;

      goal.rays.material.rotation = t * 0.25;
      goal.rays.material.opacity = 0.4 + Math.sin(t * 2.3) * 0.1;
      bubbleMat.uniforms.uTime.value = t;
      arena.fence.uTime.value = t;
    },

    /** Follows QualityGovernor's level: 0 drops the extras. */
    setQuality(level) {
      const on = level > 0;
      for (const d of decorations) {
        d.tufts?.setHidden(!on);
        d.pebbles?.setHidden(!on);
        d.butterflies?.setHidden(!on);
      }
      if (shadows) shadows.visible = on;
      scenery.setQuality(level);
      for (const lake of lakes) lake.uniforms.uSparkle.value = on ? 1 : 0;
      sky.shooting.enabled = on;
    },
  };
}
