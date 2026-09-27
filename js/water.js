// Mirio: the ring lake. One band of the sphere, one draw call, all of
// it in a small shader: drifting felt-pen strokes, gentle waves, a lighter
// shallow rim, foam along both shores and round every stepping stone (and
// the foot of any hill that reaches into the lake), fresnel and sparkles.
// No reflections and no render targets, so it stays cheap on phones.

import * as THREE from 'three';
import { surfacePoint } from './world.js';

// The surface floats this far above the ground (the old lake band did too).
const LIFT = 0.12;
// The band reaches this far onto the shore, where it fades into foam.
const OVERLAP = 0.5;
const MAX_OBSTACLES = 16;
// World size of one tile of the scribble texture.
const TILE = 4.5;
// Sparkle cells per texture tile, along each axis.
const CELLS = 3;

const vertexShader = /* glsl */`
  varying vec3 vWorld;
  varying vec3 vUp;
  varying float vLat;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vUp = normalize(position);
    vLat = asin(clamp(vUp.y, -1.0, 1.0));
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const fragmentShader = /* glsl */`
  uniform float uTime;
  uniform vec3 uSun;
  uniform float uRadius;
  uniform vec2 uLat;
  uniform float uLonScale;
  uniform float uSparkle;
  uniform sampler2D uScribble;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSky;
  #if NUM_OBSTACLES > 0
  uniform vec4 uObstacles[NUM_OBSTACLES];
  #endif
  varying vec3 vWorld;
  varying vec3 vUp;
  varying float vLat;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    // Distance to the nearest shore, stone or hill, in world units.
    float shore = min(vLat - uLat.x, uLat.y - vLat) * uRadius;
    float d = shore;
    #if NUM_OBSTACLES > 0
    for (int i = 0; i < NUM_OBSTACLES; i++) {
      d = min(d, distance(vWorld, uObstacles[i].xyz) - uObstacles[i].w);
    }
    #endif

    // Flat map of the band: longitude scaled so a whole number of tiles
    // goes round (no seam), latitude in world units.
    float lon = atan(vUp.x, vUp.z);
    vec2 uv = vec2(lon * uLonScale, vLat * uRadius);

    vec3 N = normalize(vUp);
    vec3 V = normalize(cameraPosition - vWorld);

    // Gentle waves: a few travelling sines tilt the normal.
    vec3 k1 = vec3(0.83, 0.31, 0.46);
    vec3 k2 = vec3(-0.42, 0.68, 0.6);
    vec3 k3 = vec3(0.25, -0.8, 0.55);
    vec3 g = k1 * cos(dot(vWorld, k1) * 1.3 + uTime * 1.3) * 0.5
           + k2 * cos(dot(vWorld, k2) * 2.2 - uTime * 1.7) * 0.3
           + k3 * cos(dot(vWorld, k3) * 3.6 + uTime * 2.2) * 0.2;
    g -= N * dot(g, N);
    vec3 n = normalize(N - g * 0.25);

    // Two layers of Miro-style strokes drifting past each other.
    // At the one meridian where the longitude wraps, the texture coordinate
    // jumps by whole tiles; take that jump out of the derivatives, or the
    // mipmap choice draws a seam.
    vec2 st = uv / ${TILE.toFixed(1)};
    vec2 sdx = dFdx(st);
    vec2 sdy = dFdy(st);
    float period = uLonScale * 6.2831853 / ${TILE.toFixed(1)};
    sdx.x -= sign(sdx.x) * period * step(period * 0.5, abs(sdx.x));
    sdy.x -= sign(sdy.x) * period * step(period * 0.5, abs(sdy.x));
    float s1 = textureGrad(uScribble, st + vec2(uTime * 0.018, uTime * 0.007), sdx, sdy).g;
    float s2 = textureGrad(uScribble, st * 0.71 + vec2(-uTime * 0.011, uTime * 0.013) + g.xz * 0.04, sdx * 0.71, sdy * 0.71).g;
    float stroke = (s1 + s2) * 0.5 - 0.39;

    // Shallow and light near every edge, deeper blue further out.
    float depth = smoothstep(0.1, 2.8, d);
    vec3 col = mix(uShallow, uDeep, depth);
    col *= 1.0 + stroke * 1.5;

    // Two bands of light, like the toon ground; the sun rides with the camera.
    float lambert = dot(n, uSun);
    col *= mix(0.8, 1.0, smoothstep(0.05, 0.25, lambert));

    // Fresnel: the sky's colour at grazing angles.
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col = mix(col, uSky, fres * 0.5);

    // Sparkles: a sharp sun glint, and little four-point stars that twinkle.
    vec3 h = normalize(uSun + V);
    float nh = max(dot(n, h), 0.0);
    float glint = step(0.985, nh);
    vec2 cellUv = uv * ${(CELLS / TILE).toFixed(4)};
    vec2 cell = floor(cellUv);
    float r = hash(cell);
    vec2 f = fract(cellUv) - 0.5 - (vec2(hash(cell + 7.1), hash(cell + 3.3)) - 0.5) * 0.5;
    float star = max(0.0, 1.0 - length(f) * 9.0)
               + max(0.0, 1.0 - abs(f.x) * 40.0) * max(0.0, 1.0 - abs(f.y) * 4.5)
               + max(0.0, 1.0 - abs(f.y) * 40.0) * max(0.0, 1.0 - abs(f.x) * 4.5);
    float twinkle = step(0.8, r) * pow(max(0.0, sin(uTime * (1.5 + r * 2.5) + r * 60.0)), 4.0);
    float sparkle = step(0.45, star * twinkle) * uSparkle * (0.4 + 0.6 * smoothstep(0.6, 0.95, nh));
    col += vec3(1.0, 0.98, 0.9) * (glint * 0.8 + sparkle);

    // Foam: a wobbly felt-pen line along every edge, and dashed rings that
    // drift out from it.
    // Along the band, only whole waves per tile, so nothing breaks at the wrap.
    float wob = sin(st.x * 6.2831853 + uTime * 0.8) * sin(uv.y * 2.7 - uTime * 0.6);
    float edgeFoam = 1.0 - smoothstep(0.16, 0.3, d + wob * 0.07);
    float ph = fract(d * 1.3 - uTime * 0.4);
    float ring = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.1, 0.17, ph));
    float dash = smoothstep(-0.1, 0.35, sin(st.x * 12.566371 + uv.y * 1.9 + d * 1.5));
    ring *= dash * (1.0 - smoothstep(0.4, 1.9, d));
    float foam = max(edgeFoam, ring * 0.8);
    col = mix(col, uFoam, foam);

    // Soft transparency: clearer near the shore, and the band fades out
    // just past the shore line onto the sand.
    float alpha = mix(0.78, 0.95, max(depth, fres));
    alpha = max(alpha, foam);
    alpha *= smoothstep(-${OVERLAP.toFixed(2)}, -${(OVERLAP * 0.3).toFixed(2)}, shore);

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * The ring lake on `planet` (planet.water gives its latitudes). `stones` are
 * the stepping stones on it, `bumps` the hills; foam hugs both. Returns the
 * mesh and update(t, sunDir).
 */
export function buildWater(planet, { stones = [], bumps = [], scribble, detail = 1 }) {
  const { minLat, maxLat } = planet.water;
  const toRad = Math.PI / 180;
  const radius = planet.radius + LIFT;
  const overlap = OVERLAP / planet.radius;
  const lo = minLat * toRad - overlap;
  const hi = maxLat * toRad + overlap;
  const geometry = new THREE.SphereGeometry(radius, detail ? 128 : 96, detail ? 14 : 10, 0, Math.PI * 2, Math.PI / 2 - hi, hi - lo);

  // Everything the foam should hug, nearest the lake first.
  const obstacles = [];
  for (const s of stones) {
    if (s.planet !== planet) continue;
    obstacles.push({ v: new THREE.Vector4(...surfacePoint(planet, s.dir, LIFT).toArray(), s.radius), gap: 0 });
  }
  for (const b of bumps) {
    if (b.planet !== planet) continue;
    const center = surfacePoint(planet, b.dir, b.height - b.radius);
    // Latitude reach of the hill's footprint on the ground.
    const lat = Math.asin(THREE.MathUtils.clamp(b.dir.y, -1, 1));
    const reach = Math.sqrt(Math.max(0, b.radius ** 2 - (b.radius - b.height) ** 2)) / planet.radius;
    const gap = Math.max(lo - (lat + reach), (lat - reach) - hi);
    if (gap < 0.02) obstacles.push({ v: new THREE.Vector4(center.x, center.y, center.z, b.radius), gap });
  }
  obstacles.sort((a, b) => a.gap - b.gap);
  const list = obstacles.slice(0, MAX_OBSTACLES).map((o) => o.v);

  const mid = ((minLat + maxLat) / 2) * toRad;
  const tiles = Math.max(1, Math.round((Math.PI * 2 * planet.radius * Math.cos(mid)) / TILE));
  const uniforms = {
    uTime: { value: 0 },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uRadius: { value: planet.radius },
    uLat: { value: new THREE.Vector2(minLat * toRad, maxLat * toRad) },
    uLonScale: { value: (tiles * TILE) / (Math.PI * 2) },
    uSparkle: { value: 1 },
    uScribble: { value: scribble },
    uDeep: { value: new THREE.Color(0x1f7fd0) },
    uShallow: { value: new THREE.Color(0x5fe0e8) },
    uFoam: { value: new THREE.Color(0xf4fbff) },
    uSky: { value: new THREE.Color(0xc9d4ff) },
  };
  if (list.length) uniforms.uObstacles = { value: list };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    defines: { NUM_OBSTACLES: list.length },
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(planet.center);
  mesh.renderOrder = 1;

  return {
    mesh,
    uniforms,
    update(t, sunDir) {
      uniforms.uTime.value = t;
      if (sunDir) uniforms.uSun.value.copy(sunDir);
    },
  };
}
