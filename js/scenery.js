// Original living garden scenery. All plants are merged prototypes, instanced
// around the curved ground; the child's drawings are never sampled here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dirFromLatLon, mulberry32, surfacePoint, tangentDir } from './world.js';

const UP = new THREE.Vector3(0, 1, 0);
const object = new THREE.Object3D();
const turn = new THREE.Quaternion();
const point = new THREE.Vector3();
const normal = new THREE.Vector3();
const direction = new THREE.Vector3();

function paint(geometry, color) {
  const tint = new THREE.Color(color);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
function merged(parts) {
  return mergeGeometries(parts.map(source => {
    const g = source.index ? source.toNonIndexed() : source;
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
    return g;
  }));
}
function stem(from, to, radius, color = 0x497f3f) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const delta = b.clone().sub(a);
  return paint(new THREE.CylinderGeometry(radius * .65, radius, delta.length(), 5)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, delta.normalize()))
    .translate(...a.add(b).multiplyScalar(.5).toArray()), color);
}
function leaf(length, width, color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, length * .42, .045, width, length, -.025, 0,
    0, 0, 0, length, -.025, 0, length * .42, .045, -width,
  ], 3));
  g.computeVertexNormals();
  return paint(g, color);
}
function vein(from, to, width) {
  const geometry = new THREE.BufferGeometry();
  const [ax, ay, az] = from, [bx, by, bz] = to;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    ax, ay, az - width, bx, by, bz - width, bx, by, bz + width,
    ax, ay, az - width, bx, by, bz + width, ax, ay, az + width,
  ], 3));
  geometry.computeVertexNormals();
  return paint(geometry, 0x829e55);
}
function fernGeometry() {
  const parts = [];
  for (let f = 0; f < 6; f++) {
    const angle = f / 6 * Math.PI * 2;
    const length = .65 + (f % 3) * .12;
    const frond = [];
    for (let j = 0; j < 6; j++) {
      const t = (j + .4) / 6;
      const x = t * length;
      const y = Math.sin(t * Math.PI * .88) * .4 + .07;
      const size = .19 * (1 - t * .73);
      for (const side of [-1, 1]) {
        frond.push(leaf(size, size * .31, new THREE.Color(0x38845a).lerp(new THREE.Color(0xa5cf71), t * .85))
          .rotateY(side * 1.13).rotateZ(.15).translate(x, y, 0));
      }
      if (j) {
        const before = (j - .6) / 6;
        frond.push(vein([before * length, Math.sin(before * Math.PI * .88) * .4 + .07, 0], [x, y, 0], .007));
      }
    }
    parts.push(merged(frond).rotateY(angle));
  }
  return merged(parts);
}
function shrubGeometry() {
  const parts = [];
  for (const [x, y, z, radius] of [[0, .3, 0, .45], [-.32, .28, .08, .33], [.3, .27, .15, .36], [.12, .38, -.22, .33]]) {
    const ball = new THREE.IcosahedronGeometry(radius, 2).scale(1, .82, 1);
    paint(ball, 0x59985e);
    const position = ball.attributes.position, colors = ball.attributes.color;
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const k = THREE.MathUtils.clamp(position.getY(i) / radius * .5 + .5, 0, 1);
      color.set(0x286c56).lerp(new THREE.Color(0x9cbd6c), k);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    parts.push(ball.translate(x, y, z));
  }
  for (const [x, y, z] of [[-.2, .54, .33], [.38, .43, .26], [.07, .61, .26], [-.39, .38, .13]]) {
    parts.push(paint(new THREE.IcosahedronGeometry(.055, 1).translate(x, y, z), 0xedb06c));
  }
  return merged(parts);
}
function blossomGeometry(color) {
  const parts = [];
  for (const [x, h, z, size] of [[0, .55, 0, 1], [.19, .38, .13, .72], [-.15, .42, -.09, .82]]) {
    parts.push(stem([x, 0, z], [x + .03, h, z], .013));
    parts.push(leaf(.19, .06, 0x70a655).rotateY(x * 12).rotateZ(.3).translate(x, h * .45, z));
    for (let p = 0; p < 5; p++) {
      const petal = new THREE.SphereGeometry(.115 * size, 6, 3).scale(.82, .3, 1.48)
        .rotateX(-.27).translate(0, .016, .108 * size).rotateY(p / 5 * Math.PI * 2).translate(x + .03, h, z);
      parts.push(paint(petal, color));
    }
    parts.push(paint(new THREE.SphereGeometry(.052 * size, 6, 3).scale(1, .6, 1).translate(x + .03, h + .03, z), 0xf6d06a));
  }
  return merged(parts);
}
function reedGeometry() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4, h = .65 + (i % 3) * .19;
    parts.push(stem([Math.cos(a) * .09, 0, Math.sin(a) * .09], [Math.cos(a) * .15, h, Math.sin(a) * .15], .012, 0x81954e));
    parts.push(paint(new THREE.CapsuleGeometry(.037, .17, 3, 6).translate(Math.cos(a) * .15, h - .01, Math.sin(a) * .15), 0xb69354));
    parts.push(leaf(.62, .036, 0x85a860).rotateZ(.78).rotateY(a).translate(0, .07, 0));
  }
  return merged(parts);
}

function gardenMaterial(time, extra = {}) {
  const material = new THREE.MeshPhongMaterial({ vertexColors: true, color: 0xffffff, side: THREE.DoubleSide,
    shininess: 20, specular: 0x334e29, ...extra });
  material.onBeforeCompile = shader => {
    shader.uniforms.gardenTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float gardenTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float seed = dot(instanceMatrix[3].xyz, vec3(.7, .21, .5));
        float bend = max(position.y, 0.0) * max(position.y, 0.0);
        transformed.x += sin(gardenTime * 1.25 + seed) * bend * .075;
        transformed.z += sin(gardenTime * 1.7 + seed * .7) * bend * .04;`);
  };
  material.customProgramCacheKey = () => 'garden-sway-v1';
  return material;
}

/** Match the analytic hill surface so plants neither hover nor sink. */
function sampleGround(level, planet, dir, out, up) {
  let height = 0, hill = null;
  for (const b of level.bumps) {
    if (b.planet !== planet) continue;
    const center = b.dir.clone().multiplyScalar(planet.radius + b.height - b.radius);
    const along = center.dot(dir);
    const disc = along * along - (center.lengthSq() - b.radius * b.radius);
    if (disc < 0) continue;
    const h = along + Math.sqrt(disc) - planet.radius;
    if (h > height) { height = h; hill = center.add(planet.center); }
  }
  surfacePoint(planet, dir, height, out);
  if (hill) up.subVectors(out, hill).normalize(); else up.copy(dir);
}

function gardenClear(level, planet, dir) {
  if (planet.water) {
    const lat = THREE.MathUtils.radToDeg(Math.asin(dir.y));
    if (lat > planet.water.minLat - 2 && lat < planet.water.maxLat + 2) return false;
  }
  const close = (other, radius) => other && dir.dot(other) > Math.cos(radius / planet.radius);
  if (level.spawn.planet === planet && close(level.spawn.dir, 2.2)) return false;
  // Plant centres need a little extra room for spreading fern/flower leaves.
  if (level.biplaneHome?.planet === planet && close(level.biplaneHome.dir, 3.2)) return false;
  if (level.plateau.planet === planet && close(level.plateau.dir, level.plateau.radius + 1.1)) return false;
  for (const item of [...level.stumps, ...level.stones, ...level.flags, ...level.blocks]) {
    if (item.planet !== planet || item.bottom > 1) continue;
    if (close(item.dir, item.size ? item.size * .85 + .9 : item.radius ? item.radius + .9 : 1.9)) return false;
  }
  for (const bit of level.bits) {
    if (bit.planet !== planet) continue;
    direction.subVectors(bit.pos, planet.center).normalize();
    if (close(direction, 1.15)) return false;
  }
  if (planet === level.planets[0]) {
    for (const [lat, lon] of [[81, 35], [24, 43], [-14, -28]]) if (close(dirFromLatLon(lat, lon), 2.4)) return false;
  }
  return true;
}

function cloudMesh(level, tier, time) {
  const planets = level.planets.filter(p => p.look !== 'floor');
  const count = planets.length * (tier === 2 ? 9 : 6);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const centers = new Float32Array(count * 3);
  const material = new THREE.ShaderMaterial({
    uniforms: { cloudTime: time }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float cloudTime;
      attribute vec3 planetCenter;
      varying vec2 vUv;
      varying float vFade;
      void main() {
        vUv = uv;
        vec3 local = instanceMatrix[3].xyz - planetCenter;
        float a = cloudTime * .013;
        local.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * local.xz;
        vec3 center = planetCenter + local;
        vec4 mv = modelViewMatrix * vec4(center, 1.0);
        mv.xy += position.xy * vec2(instanceMatrix[0].x, instanceMatrix[1].y);
        vFade = smoothstep(8.0, 18.0, distance(cameraPosition, center));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec2 vUv;
      varying float vFade;
      float puff(vec2 p, vec2 c, vec2 size) {
        return exp(-dot((p-c)/size, (p-c)/size) * 3.0);
      }
      void main() {
        float shape = puff(vUv, vec2(.24,.42), vec2(.32,.33)) + puff(vUv, vec2(.45,.55), vec2(.35,.43))
          + puff(vUv, vec2(.68,.43), vec2(.37,.32)) + puff(vUv, vec2(.84,.36), vec2(.2,.2));
        float alpha = smoothstep(.07, .95, shape) * .32 * vFade;
        vec3 color = mix(vec3(.49,.67,.73), vec3(.88,.95,.9), smoothstep(.16,.8,vUv.y));
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const rnd = mulberry32(732);
  let index = 0;
  for (const planet of planets) for (let i = 0; i < count / planets.length; i++) {
    const lon = i / (count / planets.length) * 360 + 25;
    const dir = dirFromLatLon(-42 + rnd() * 82, lon);
    surfacePoint(planet, dir, 8 + rnd() * 3, object.position);
    object.quaternion.identity();
    object.scale.set(7 + rnd() * 4, 2 + rnd() * 1.1, 1);
    object.updateMatrix();
    mesh.setMatrixAt(index, object.matrix);
    planet.center.toArray(centers, index * 3);
    index++;
  }
  geometry.setAttribute('planetCenter', new THREE.InstancedBufferAttribute(centers, 3));
  mesh.frustumCulled = false;
  mesh.name = 'scenery:cloud-wisps';
  return mesh;
}

export function buildScenery(scene, level, art, { tier = 2, time, makeCull }) {
  const group = new THREE.Group();
  group.name = 'scenery:garden';
  scene.add(group);
  const rnd = mulberry32(924);
  const batches = { fern: [], shrub: [], blossom0: [], blossom1: [], blossom2: [], reed: [] };
  const anchors = [];
  for (const tree of level.trees) if (tree.planet.look !== 'floor') anchors.push({ planet: tree.planet, dir: tree.dir, radius: tree.scale * 1.2, plants: [5, 8, 12][tier] });
  for (const [lat, lon] of [[83, 90], [83, -90], [76, 65], [73, -58], [29, -34], [11, 39], [-8, 43], [-19, -40]]) {
    anchors.push({ planet: level.planets[0], dir: dirFromLatLon(lat, lon), radius: .5, plants: [7, 11, 17][tier] });
  }
  const offset = (anchor, angle, distance) => {
    const east = tangentDir(new THREE.Vector3(.3, .1, .9), anchor.dir);
    const north = new THREE.Vector3().crossVectors(anchor.dir, east);
    return anchor.dir.clone().multiplyScalar(Math.cos(distance / anchor.planet.radius))
      .addScaledVector(east, Math.sin(distance / anchor.planet.radius) * Math.cos(angle))
      .addScaledVector(north, Math.sin(distance / anchor.planet.radius) * Math.sin(angle)).normalize();
  };
  for (const anchor of anchors) for (let i = 0; i < anchor.plants; i++) {
    const dir = offset(anchor, rnd() * Math.PI * 2, anchor.radius + rnd() * 1.65);
    if (!gardenClear(level, anchor.planet, dir)) continue;
    const type = i % 7 === 0 ? 'shrub' : i % 3 === 0 ? 'fern' : `blossom${Math.floor(rnd() * 3)}`;
    batches[type].push({ planet: anchor.planet, dir, scale: .75 + rnd() * .55, yaw: rnd() * Math.PI * 2 });
  }
  for (const planet of level.planets.filter(p => p.water)) {
    for (const lat of [planet.water.minLat - 2.3, planet.water.maxLat + 2.3]) for (let lon = 24; lon < 360; lon += 18) {
      if (Math.abs(lon - 180) < 18) continue;
      const dir = dirFromLatLon(lat, lon);
      if (gardenClear(level, planet, dir)) batches.reed.push({ planet, dir, scale: .85 + rnd() * .4, yaw: rnd() * 6.28 });
    }
  }
  const prototypes = { fern: fernGeometry(), shrub: shrubGeometry(), blossom0: blossomGeometry(0xffb0c6),
    blossom1: blossomGeometry(0xffedb0), blossom2: blossomGeometry(0xc8b1ef), reed: reedGeometry() };
  const material = gardenMaterial(time);
  const shrubs = gardenMaterial(time, { map: art.canopy, bumpMap: art.canopy, bumpScale: .015 });
  // Shrubs use position-derived UVs because the source merged geometry omits
  // UV seams; all other garden plants only need their painted vertex colours.
  const shrubPos = prototypes.shrub.attributes.position;
  const uv = new Float32Array(shrubPos.count * 2);
  for (let i = 0; i < shrubPos.count; i++) { uv[i * 2] = shrubPos.getX(i); uv[i * 2 + 1] = shrubPos.getZ(i); }
  prototypes.shrub.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const extras = [];
  const culls = [];
  for (const [name, items] of Object.entries(batches)) {
    const mesh = new THREE.InstancedMesh(prototypes[name], name === 'shrub' ? shrubs : material, items.length);
    mesh.name = `scenery:${name}`;
    items.forEach((item, i) => {
      sampleGround(level, item.planet, item.dir, point, normal);
      item.top = point.distanceTo(item.planet.center) - item.planet.radius + 1.2 * item.scale;
      object.position.copy(point).addScaledVector(normal, -.035);
      object.quaternion.setFromUnitVectors(UP, normal).multiply(turn.setFromAxisAngle(UP, item.yaw));
      object.scale.setScalar(item.scale);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
    });
    if (makeCull) culls.push(makeCull([mesh], items.map(item => ({
      planet: item.planet, dir: item.dir, top: item.top,
    }))));
    else mesh.computeBoundingSphere();
    group.add(mesh);
    if (name === 'fern' || name.startsWith('blossom')) extras.push(mesh);
  }

  // A single instanced petal draw: slow falls, sideways gusts and a little roll.
  const petalGeometry = new THREE.SphereGeometry(.09, 5, 3).scale(.65, .15, 1.35);
  const petalMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide, shininess: 15 });
  petalMaterial.onBeforeCompile = shader => {
    shader.uniforms.petalTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float petalTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float phase = dot(instanceMatrix[3].xyz, vec3(3.1,2.7,1.2));
        float fall = fract(petalTime * .12 + phase);
        float turn = petalTime * 2.0 + phase;
        transformed.xy = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * transformed.xy;
        transformed.x += sin(petalTime * .7 + phase) * 1.3;
        transformed.z += cos(petalTime * .53 + phase) * 1.1;
        transformed.y += .2 + (1.0 - fall) * 2.6;`);
  };
  petalMaterial.customProgramCacheKey = () => 'drifting-petals-v1';
  const petals = new THREE.InstancedMesh(petalGeometry, petalMaterial, tier === 0 ? 0 : anchors.length * 2);
  const palette = [0xffdca1, 0xffb1c2, 0xcfeaaa].map(c => new THREE.Color(c));
  for (let i = 0; i < petals.count; i++) {
    const anchor = anchors[i % anchors.length];
    const dir = offset(anchor, rnd() * 6.28, anchor.radius + .5);
    sampleGround(level, anchor.planet, dir, object.position, normal);
    object.quaternion.setFromUnitVectors(UP, normal);
    object.scale.setScalar(.7 + rnd() * .65);
    object.updateMatrix();
    petals.setMatrixAt(i, object.matrix);
    petals.setColorAt(i, palette[i % palette.length]);
  }
  petals.name = 'scenery:drifting-petals';
  petals.frustumCulled = false;
  group.add(petals);
  const clouds = cloudMesh(level, tier, time);
  group.add(clouds);
  return {
    group,
    update(_t, camera) { for (const cull of culls) cull.update(camera.position); },
    setQuality(quality) {
      petals.visible = quality > 0;
      clouds.visible = quality > 0;
      for (const mesh of extras) mesh.visible = quality > 0;
    },
  };
}
