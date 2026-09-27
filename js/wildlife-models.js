// Original storybook animals, made entirely from shared geometry. These rigs
// never read Miro's drawing textures. A whole species costs one draw per part.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const WHITE = 0xfff5df;
const INK = 0x19253b;
const BLUE = 0x459fd0;
const NAVY = 0x24628d;
const GOLD = 0xf6b844;
const FUR = 0xb56731;
const FUR_LIGHT = 0xd9914c;
const FUR_DARK = 0x77432e;

function paint(geometry, color) {
  const c = new THREE.Color(color);
  const data = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < data.length; i += 3) c.toArray(data, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
  // All merged parts use the same attributes; no unused texture coordinates.
  geometry.deleteAttribute('uv');
  return geometry;
}
function ball(color, scale, pos, rotation = [0, 0, 0], segments = 14) {
  return paint(new THREE.SphereGeometry(1, segments, 10), color)
    .scale(...scale).rotateX(rotation[0]).rotateY(rotation[1]).rotateZ(rotation[2]).translate(...pos);
}
function cone(color, radius, length, pos, rotation = [0, 0, 0]) {
  return paint(new THREE.ConeGeometry(radius, length, 9), color)
    .rotateX(rotation[0]).rotateY(rotation[1]).rotateZ(rotation[2]).translate(...pos);
}
function combine(parts) {
  const merged = mergeGeometries(parts, false);
  for (const geometry of parts) geometry.dispose();
  return merged;
}
function toe(x, z) {
  return ball(GOLD, [0.025, 0.023, 0.13], [x, 0.035, z]);
}
function bird() {
  const body = [
    ball(BLUE, [.31, .36, .4], [0, .45, 0]),
    ball(WHITE, [.245, .29, .16], [0, .43, .29], [-.15, 0, 0]),
    ball(0x8ecee2, [.25, .11, .23], [0, .68, .02]),
  ];
  const head = [
    ball(BLUE, [.29, .27, .28], [0, .05, .05]),
    ball(WHITE, [.225, .17, .19], [0, -.015, .21]),
    cone(GOLD, .105, .24, [0, -.025, .365], [Math.PI / 2, 0, 0]),
    // A small swept crest and soft cheek patches read even from a distance.
    ball(BLUE, [.085, .18, .1], [-.055, .25, -.005], [-.35, 0, -.15]),
    ball(0x6bbce0, [.065, .12, .08], [.055, .23, .025], [-.35, 0, .25]),
  ];
  for (const side of [-1, 1]) {
    head.push(ball(INK, [.044, .06, .04], [side * .18, .075, .262]));
    head.push(ball(0xffffff, [.015, .021, .014], [side * .178 - .008, .093, .295]));
    head.push(ball(0xefb6a0, [.07, .043, .027], [side * .209, -.018, .26]));
  }
  const wing = [ball(NAVY, [.1, .22, .3], [0, -.025, -.075], [.2, 0, 0])];
  for (let i = 0; i < 3; i++) wing.push(ball(i % 2 ? 0x75b9db : BLUE, [.028, .15, .23], [.075, -.035 - i * .022, -.09 - i * .043], [.25, 0, .04]));
  const tail = [-1, 0, 1].map(i => ball(i ? NAVY : BLUE, [.07, .038, .26], [i * .08, 0, -.13], [-.3, i * -.14, 0]));
  const feet = [-1, 1].flatMap(side => [
    ball(GOLD, [.027, .09, .028], [side * .14, .1, .075]),
    toe(side * .14 - .025, .16), toe(side * .14 + .025, .16),
  ]);
  return { body: combine(body), head: combine(head), wing: combine(wing), tail: combine(tail), feet: combine(feet) };
}
function squirrel() {
  const body = [
    ball(FUR, [.3, .47, .3], [0, .58, -.05], [-.12, 0, 0]),
    ball(0xf7dbaf, [.215, .33, .1], [0, .57, .215]),
    ball(FUR_LIGHT, [.25, .23, .25], [0, .32, -.13]),
  ];
  const head = [
    ball(FUR_LIGHT, [.28, .265, .25], [0, .02, .02]),
    ball(FUR, [.255, .2, .2], [0, .12, -.045]),
    ball(0xffe5bc, [.145, .125, .18], [-.09, -.10, .2]),
    ball(0xffe5bc, [.145, .125, .18], [.09, -.10, .2]),
    ball(FUR_DARK, [.065, .043, .042], [0, -.045, .377]),
    ball(0xffffff, [.047, .06, .025], [0, -.19, .31]),
  ];
  for (const side of [-1, 1]) {
    head.push(ball(FUR, [.105, .18, .073], [side * .2, .265, -.045], [0, 0, side * -.17]));
    head.push(ball(0xeab38c, [.063, .12, .025], [side * .2, .274, .02], [0, 0, side * -.17]));
    head.push(cone(FUR_DARK, .06, .14, [side * .21, .443, -.05], [0, 0, side * -.16]));
    head.push(ball(0xffeed1, [.081, .105, .055], [side * .192, .065, .205]));
    head.push(ball(INK, [.052, .075, .045], [side * .199, .06, .248]));
    head.push(ball(0xffffff, [.019, .025, .014], [side * .2 - .013, .088, .285]));
    head.push(ball(FUR_LIGHT, [.095, .04, .05], [side * .18, .19, .19], [0, 0, side * -.15]));
  }
  // The silhouette curls over itself. A continuous tapered sweep and soft
  // tufts suggest plush fur without textures or separate draw calls.
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, .18, -.4),
    new THREE.Vector3(0, .6, -.6), new THREE.Vector3(0, 1.05, -.5),
    new THREE.Vector3(0, 1.16, -.13), new THREE.Vector3(0, .9, .02),
  ]);
  const fur = paint(new THREE.TubeGeometry(path, 32, 1, 12, false), FUR);
  const positions = fur.attributes.position;
  const colors = fur.attributes.color;
  const point = new THREE.Vector3();
  const center = new THREE.Vector3();
  const coat = new THREE.Color(FUR);
  const highlight = new THREE.Color(FUR_LIGHT);
  for (let ring = 0; ring <= 32; ring++) {
    const t = ring / 32;
    path.getPointAt(t, center);
    const width = .09 + Math.sin(t * Math.PI) * .23;
    for (let segment = 0; segment <= 12; segment++) {
      const index = ring * 13 + segment;
      point.fromBufferAttribute(positions, index).sub(center).multiplyScalar(width).add(center);
      positions.setXYZ(index, point.x, point.y, point.z);
      const grain = .1 + .16 * Math.max(0, Math.sin(segment / 12 * Math.PI * 2 + .3));
      const color = coat.clone().lerp(highlight, grain);
      colors.setXYZ(index, color.r, color.g, color.b);
    }
  }
  fur.computeVertexNormals();
  const tail = [fur, ball(FUR, [.095, .095, .095], path.getPoint(1).toArray())];
  // A few soft side tufts break the outline without turning the tail into
  // a stack of visible balls. The continuous sweep does the silhouette.
  for (const t of [.32, .49, .64, .78]) {
    const p = path.getPointAt(t);
    const width = .09 + Math.sin(t * Math.PI) * .23;
    for (const side of [-1, 1]) tail.push(ball(FUR, [.08, .10, .055],
      [side * width * .93, p.y + .015, p.z], [0, 0, side * -.3], 10));
  }
  const arm = combine([
    ball(FUR, [.075, .19, .09], [0, -.11, .035], [-.45, 0, 0]),
    ball(FUR_DARK, [.072, .07, .075], [0, -.235, .105]),
  ]);
  const leg = combine([
    ball(FUR, [.16, .205, .18], [0, .15, -.04]),
    ball(FUR_DARK, [.105, .065, .21], [0, .05, .1]),
    ...[-1, 0, 1].map(i => ball(0xe5bc8a, [.012, .012, .04], [i * .045, .06, .285])),
  ]);
  const acorn = combine([
    ball(0xb07734, [.135, .165, .135], [0, 0, 0]),
    ball(0x694731, [.15, .064, .15], [0, .10, 0]),
    cone(0x684c2f, .025, .1, [0, .19, 0]),
    ...Array.from({ length: 8 }, (_, i) => {
      const a = i / 8 * Math.PI * 2;
      return ball(0x936840, [.03, .026, .03], [Math.cos(a) * .12, .11, Math.sin(a) * .12]);
    }),
  ]);
  return { body: combine(body), head: combine(head), tail: combine(tail), arm, leg, acorn };
}

const local = new THREE.Object3D();
const matrix = new THREE.Matrix4();
const zero = new THREE.Matrix4().makeScale(0, 0, 0);

/** Shared multi-part rigs packed into instanced meshes (15 draw calls total, including contact shadows). */
export class WildlifeModels {
  constructor(parent, birds, squirrels) {
    this.material = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 23, specular: 0x34302c });
    this.group = new THREE.Group();
    this.group.name = 'Meadow wildlife — original bluebirds and squirrels';
    parent.add(this.group);
    this.parts = {};
    this.birdCount = birds;
    this.shadowMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 point = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            point = instanceMatrix * point;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * point;
        }`,
      fragmentShader: `
        varying vec2 vUv;
        void main() {
          float opacity = (1.0 - smoothstep(0.12, 0.5, length(vUv - 0.5))) * 0.25;
          gl_FragColor = vec4(0.07, 0.105, 0.045, opacity);
        }`,
    });
    this.shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.shadowMaterial, birds + squirrels);
    this.shadows.name = 'Wildlife soft contact shadows';
    this.shadows.frustumCulled = false;
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < birds + squirrels; i++) this.shadows.setMatrixAt(i, zero);
    this.group.add(this.shadows);
    this.geometries = new Set();
    const add = (species, name, geometry, count) => {
      const mesh = new THREE.InstancedMesh(geometry, this.material, count);
      mesh.name = `${species}-${name}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Individual animals are culled before writing matrices; a stale
      // aggregate bounding sphere must not hide moving birds.
      mesh.frustumCulled = false;
      for (let i = 0; i < count; i++) mesh.setMatrixAt(i, zero);
      this.group.add(mesh);
      this.parts[`${species}:${name}`] = mesh;
      this.geometries.add(geometry);
    };
    const b = bird();
    for (const key of ['body', 'head', 'tail', 'feet']) add('bird', key, b[key], birds);
    add('bird', 'leftWing', b.wing, birds);
    const rightWing = b.wing.clone().scale(-1, 1, 1);
    const indices = rightWing.index;
    for (let i = 0; i < indices.count; i += 3) {
      const bIndex = indices.getX(i + 1);
      indices.setX(i + 1, indices.getX(i + 2)); indices.setX(i + 2, bIndex);
    }
    add('bird', 'rightWing', rightWing, birds);
    const s = squirrel();
    for (const key of ['body', 'head', 'tail', 'acorn']) add('squirrel', key, s[key], squirrels);
    for (const side of ['left', 'right']) { add('squirrel', `${side}Arm`, s.arm, squirrels); add('squirrel', `${side}Leg`, s.leg, squirrels); }
  }

  part(kind, name, index, base, pos, rotation = [0, 0, 0], scale = [1, 1, 1]) {
    local.position.set(...pos);
    local.rotation.set(...rotation);
    local.scale.set(...scale);
    local.updateMatrix();
    this.parts[`${kind}:${name}`].setMatrixAt(index, matrix.multiplyMatrices(base, local.matrix));
  }

  draw(animal, base, time) {
    const { kind, index, state, phase } = animal;
    const shadowIndex = kind === 'bird' ? index : this.birdCount + index;
    if (animal.height < .25) {
      local.position.set(0, (.018 - animal.height) / animal.scale, 0);
      local.rotation.set(0, 0, 0);
      local.scale.set(kind === 'bird' ? 1.1 : 1.35, 1, kind === 'bird' ? 1.1 : 1.5);
      local.updateMatrix();
      this.shadows.setMatrixAt(shadowIndex, matrix.multiplyMatrices(base, local.matrix));
    } else this.shadows.setMatrixAt(shadowIndex, zero);
    const p = (name, pos, rotation, scale) => this.part(kind, name, index, base, pos, rotation, scale);
    if (kind === 'bird') {
      const flying = ['flee', 'return', 'circle', 'descend'].includes(state);
      const flap = flying ? Math.sin(time * 23 + phase) * 1.03 : .06 * Math.sin(time * 3 + phase);
      const peck = state === 'peck' ? Math.max(0, Math.sin(time * 5 + phase)) ** 8 : 0;
      p('body', [0, 0, 0], [flying ? .24 : peck * .22, 0, 0]);
      p('head', [0, .76 - peck * .15, .16 + peck * .06], [peck * .9, Math.sin(time * 1.8 + phase) * .16, 0]);
      p('leftWing', [-.27, .51, 0], [0, 0, -.1 - flap]);
      p('rightWing', [.27, .51, 0], [0, 0, .1 + flap]);
      p('tail', [0, .42, -.34], [-.15 + (flying ? -.18 : Math.sin(time * 2.1 + phase) * .1), 0, 0]);
      p('feet', [0, flying ? .17 : 0, flying ? -.08 : 0], [flying ? -.6 : 0, 0, 0]);
    } else {
      const run = ['scurry', 'return'].includes(state);
      const stride = run ? Math.sin(time * 22 + phase) : 0;
      const nibble = state === 'sit' ? Math.sin(time * 13 + phase) * .027 : 0;
      const tilt = state === 'forage' ? .35 + Math.sin(time * 2.2 + phase) * .14 : run ? .56 : 0;
      p('body', [0, run ? -.12 + Math.abs(stride) * .08 : 0, 0], [tilt, 0, 0]);
      p('head', [0, .96 - tilt * .36, .16 + tilt * .65], [state === 'forage' ? .52 : nibble, Math.sin(time * 1.5 + phase) * .22, 0]);
      p('tail', [0, .26, -.25], [-.12 + (run ? -.25 : Math.sin(time * 2 + phase) * .09), Math.sin(time * 2.7 + phase) * .17, Math.sin(time * 1.7 + phase) * .13]);
      p('leftArm', [-.2, .66, .22], [run ? stride * .6 : -.5 + nibble, 0, -.2]);
      p('rightArm', [.2, .66, .22], [run ? -stride * .6 : -.5 - nibble, 0, .2]);
      p('leftLeg', [-.205, run ? .05 : 0, -.08 + stride * .13], [run ? stride * .4 : 0, 0, 0]);
      p('rightLeg', [.205, run ? .05 : 0, -.08 - stride * .13], [run ? -stride * .4 : 0, 0, 0]);
      const holding = state === 'sit';
      p('acorn', [0, .50 + nibble, .43], [0, 0, 0], holding ? [1, 1, 1] : [0, 0, 0]);
    }
  }

  hide(kind, index) {
    this.shadows.setMatrixAt(kind === 'bird' ? index : this.birdCount + index, zero);
    for (const [name, mesh] of Object.entries(this.parts)) if (name.startsWith(`${kind}:`)) mesh.setMatrixAt(index, zero);
  }
  flush() {
    for (const mesh of Object.values(this.parts)) mesh.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.group.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    this.material.dispose();
    this.shadows.geometry.dispose();
    this.shadowMaterial.dispose();
  }
}
