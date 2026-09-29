// The forest river: water, banks, obstacles, gems, the waterfall and the log
// Mirio and Damai ride. Rules live in js/river-rules.js; the level supplies
// `toWorld(s, x, h, out)` from river coordinates (x from the straight
// reference line, h above the flat ground) to world space.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hullGeometry, outlineMaterial, penOutline, toon } from './materials.js';
import { gemGeometry } from './props.js';
import { RIVER } from './river-rules.js';
import { mulberry32 } from './world.js';

export const RIVER_SCENE = Object.freeze({
  // The water floats a little above the ground so the bed covers it.
  waterHeight: .12, bedHeight: .05,
  // Water beyond the usable half-width, then the grassy berm.
  edge: 1.2, bank: 3.6,
  // Past the lip the river drops `drop` metres into a pool `pool` metres long.
  drop: 6, pool: 16,
  logLength: 3, logRadius: .42,
  stripe: 6, station: 2, start: -12,
});
const S = RIVER_SCENE, W = RIVER.halfWidth;
const WATER_W = W + S.edge + .4, BANK_IN = W + S.edge;
const GEM_COLORS = [0xffd35c, 0x8fe0f0, 0xf59ac0];
const dummy = new THREE.Object3D(), local = new THREE.Matrix4(), rot = new THREE.Quaternion(), euler = new THREE.Euler();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

function paint(geometry, color) {
  const tint = new THREE.Color(color), colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
function merged(parts) {
  const geometries = parts.map(part => {
    const geometry = part.index ? part.toNonIndexed() : part;
    for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'color'].includes(name)) geometry.deleteAttribute(name);
    return geometry;
  });
  const geometry = mergeGeometries(geometries);
  for (const g of new Set([...parts, ...geometries])) g.dispose();
  return geometry;
}
function ellipsoid(x, y, z, sx, sy, sz, color, detail = 8) {
  return paint(new THREE.SphereGeometry(1, detail, Math.max(4, detail / 2)).scale(sx, sy, sz).translate(x, y, z), color);
}

/** Light streaks on a pale ground; multiplied with the water's vertex colours. */
function stripeTexture() {
  const w = 16, h = 64, data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const phase = (j + i * 23 + (i % 2) * 11) % 32, streak = i % 4 !== 1 && phase < 6 ? Math.sin(phase / 6 * Math.PI) : 0;
    const value = Math.round(212 + 43 * streak);
    data.set([value, value, value, 255], (j * w + i) * 4);
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** A flat three-armed spiral in the XZ plane, radius 1, pale at the rim. */
function spiralGeometry() {
  const positions = [], colors = [], normals = [], index = [], inner = new THREE.Color(0x2f7f8a), outer = new THREE.Color(0xf2fbf7), c = new THREE.Color();
  const steps = 18;
  for (let arm = 0; arm < 3; arm++) {
    const base = positions.length / 3;
    for (let k = 0; k <= steps; k++) {
      const u = k / steps, r = .12 + u * .88, a = arm * Math.PI * 2 / 3 + u * Math.PI * 1.7, half = .05 + u * .07;
      for (const d of [-half, half]) {
        positions.push(Math.cos(a) * (r + d), 0, Math.sin(a) * (r + d));
        normals.push(0, 1, 0);
        c.copy(inner).lerp(outer, u).toArray(colors, colors.length);
      }
      if (k) { const i = base + k * 2; index.push(i - 2, i - 1, i, i - 1, i + 1, i); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  return merged([g, paint(new THREE.TorusGeometry(1.02, .045, 4, 32).rotateX(Math.PI / 2).scale(1, .3, 1), 0xe6f7f4)]);
}

/** The log: bark body with ridges, end caps with growth rings, a leafy stub. */
function buildLog() {
  const R = S.logRadius, L = S.logLength, group = new THREE.Group();
  group.name = 'river:log';
  const floats = new THREE.Group();
  // Partly under water: the axis rides a little above the surface.
  floats.position.y = R * .3;
  group.add(floats);
  const bark = new THREE.CylinderGeometry(R, R * .96, L, 16, 1).rotateX(Math.PI / 2), body = new THREE.Mesh(bark, toon(0x8a5a36));
  // A hull with smooth corners, so the pen line does not tear at the cut ends.
  body.add(new THREE.Mesh(hullGeometry(bark), outlineMaterial(.03)));
  body.name = 'river:log-body';
  const caps = [];
  for (const end of [-1, 1]) {
    for (let ring = 0; ring < 4; ring++) {
      const r0 = ring * R / 4, r1 = (ring + 1) * R / 4 - .005;
      caps.push(paint(new THREE.RingGeometry(r0, r1, 16).rotateY(end > 0 ? 0 : Math.PI).translate(0, 0, end * (L / 2 + .003)),
        ring % 2 ? 0xc9955e : 0xe4bd84));
    }
  }
  const details = [];
  for (const z of [-1.15, -.4, .45, 1.2]) details.push(paint(new THREE.TorusGeometry(R * 1.01, .035, 4, 18).translate(0, 0, z), 0x5e3b22));
  // Bark stripes along the top, where the camera looks.
  for (const a of [-.5, .1, .7]) details.push(paint(new THREE.BoxGeometry(.05, .03, L * .8).translate(Math.sin(a) * R, Math.cos(a) * R, 0), 0x6b4428));
  details.push(paint(new THREE.CylinderGeometry(.06, .09, .45, 6).rotateZ(-.9).translate(R * .75, R * .8, .9), 0x7a4e2e));
  details.push(ellipsoid(R * .75 + .32, R * .8 + .28, .9, .16, .06, .1, 0x6fb35a), ellipsoid(R * .75 + .2, R * .8 + .36, .98, .12, .05, .09, 0x8fc766));
  const capMesh = new THREE.Mesh(merged(caps), toon(0xffffff, {vertexColors: true}));
  const detailMesh = new THREE.Mesh(merged(details), toon(0xffffff, {vertexColors: true}));
  floats.add(body, capMesh, detailMesh);
  // Where the integrator seats the riders: Damai at the front, Mirio behind him.
  const seats = {mirio: new THREE.Object3D(), damai: new THREE.Object3D()};
  seats.mirio.name = 'river:seat-mirio'; seats.damai.name = 'river:seat-damai';
  seats.mirio.position.set(0, R, -.45); seats.damai.position.set(0, R, .85);
  floats.add(seats.mirio, seats.damai);
  return {group, floats, seats};
}

export class RiverScene {
  constructor(scene, course, toWorld) {
    this.course = course;
    this.toWorld = toWorld;
    this.group = new THREE.Group();
    this.group.name = 'river';
    scene.add(this.group);
    // River +x may map to either side of the log's local +X; steering tilt needs to know which.
    this.basis(0, 0, 0, local);
    const side = v1.setFromMatrixColumn(local, 0);
    this.lateral = Math.sign(side.dot(this.point(0, 1, 0, v2).sub(this.point(0, 0, 0, v3)))) || 1;
    const rng = mulberry32(course.seed * 131 + 5);
    this.buildWater();
    this.buildBanks(rng);
    this.buildObstacles(rng);
    this.buildGems();
    this.buildWaterfall();
    const log = buildLog();
    this.log = log.group; this.logFloat = log.floats; this.seats = log.seats;
    this.group.add(this.log);
    this.lastT = undefined;
    this.flow = 0;
    this.lean = 0;
  }

  /** World position of river coordinates, with the bends added. */
  point(s, x, h, out = new THREE.Vector3()) {
    return this.toWorld(s, this.course.center(s) + x, h, out);
  }
  /** Local frame at a river point: +X across, +Y up, +Z downstream. */
  basis(s, x, h, out = new THREE.Matrix4()) {
    const p = this.point(s, x, h, new THREE.Vector3());
    const up = this.point(s, x, h + 1, new THREE.Vector3()).sub(p).normalize();
    const forward = this.point(s + .5, x, h, new THREE.Vector3()).sub(this.point(s - .5, x, h, new THREE.Vector3()));
    forward.addScaledVector(up, -forward.dot(up)).normalize();
    const across = new THREE.Vector3().crossVectors(up, forward);
    return out.makeBasis(across, up, forward).setPosition(p);
  }
  /** Geometry built in a local frame, moved to its place on the river. */
  place(geometry, s, x, h) { return geometry.applyMatrix4(this.basis(s, x, h)); }

  /** A grid of rows × columns; `at(i, j)` gives [s, x, h, colour, v]. */
  sheet(rows, cols, at) {
    const count = (rows + 1) * (cols + 1), position = new Float32Array(count * 3), color = new Float32Array(count * 3), uv = new Float32Array(count * 2);
    const c = new THREE.Color(), p = new THREE.Vector3(), index = [];
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
      const n = i * (cols + 1) + j, [s, x, h, tint, v = 0] = at(i, j);
      this.point(s, x, h, p).toArray(position, n * 3);
      c.set(tint).toArray(color, n * 3);
      uv[n * 2] = j / cols; uv[n * 2 + 1] = v;
      if (i && j) index.push(n - cols - 2, n - 1, n - cols - 1, n - cols - 1, n - 1, n);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(position, 3));
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }

  buildWater() {
    const L = this.course.length, rows = Math.ceil((L - S.start) / S.station), cols = 10;
    this.waterMap = stripeTexture();
    // Double-sided sheets light correctly whichever way toWorld turns their winding.
    const material = toon(0xffffff, {map: this.waterMap, vertexColors: true, transparent: true, opacity: .86, depthWrite: false, side: THREE.DoubleSide});
    const tint = x => new THREE.Color(0x4fb3c0).lerp(new THREE.Color(0x9fe0dc), Math.abs(x) / WATER_W);
    const surface = this.sheet(rows, cols, (i, j) => {
      const s = S.start + (L - S.start) * i / rows, x = -WATER_W + 2 * WATER_W * j / cols;
      return [s, x, S.waterHeight, tint(x), s / S.stripe];
    });
    this.water = new THREE.Mesh(surface, material);
    this.water.name = 'river:water'; this.water.renderOrder = 1;
    this.group.add(this.water);
  }

  buildBanks(rng) {
    const L = this.course.length, rows = Math.ceil((L - S.start) / S.station);
    const at = u => S.start + (L - S.start) * u;
    // Across one side: under water, pebbly edge, grassy berm, back down to the ground.
    const profile = [[BANK_IN, S.bedHeight, 0x6f8f6a], [BANK_IN + .6, S.waterHeight + .16, 0xc8b88a],
      [BANK_IN + 1.1, .42, 0x86b55e], [BANK_IN + 1.9, .55, 0x6fa651], [BANK_IN + S.bank, 0, 0x78ad57]];
    const parts = [this.sheet(rows, 2, (i, j) => [at(i / rows), -BANK_IN + 2 * BANK_IN * j / 2, S.bedHeight, j === 1 ? 0x2f6f73 : 0x467f6c])];
    for (const side of [-1, 1]) {
      parts.push(this.sheet(rows, profile.length - 1, (i, j) => {
        const [x, h, tint] = profile[j];
        return [at(i / rows), side * x, h, new THREE.Color(tint).offsetHSL(0, 0, ((i * 7 + j * 3) % 5 - 2) * .012)];
      }));
    }
    // Stones on the banks and reeds on the berms; reeds skip the outline, like grass.
    const stones = [], plants = [];
    for (let s = 4; s < L - 4; s += 5 + rng() * 6) {
      const side = rng() < .5 ? -1 : 1, r = .22 + rng() * .35;
      stones.push(this.place(paint(new THREE.DodecahedronGeometry(1, 0).scale(r, r * .7, r).rotateY(rng() * 3), rng() < .5 ? 0x9a9d99 : 0x8a8f8c),
        s, side * (BANK_IN + .2 + rng() * .5), S.waterHeight));
    }
    for (let s = 2; s < L - 6; s += 7 + rng() * 9) {
      const side = rng() < .5 ? -1 : 1, x = side * (BANK_IN + .7 + rng() * .5);
      for (let k = 0; k < 5; k++) {
        const hgt = .8 + rng() * .6, dx = (rng() - .5) * .6, dz = (rng() - .5) * .8, lean = (rng() - .5) * .25;
        plants.push(this.place(paint(new THREE.ConeGeometry(.035, hgt, 4).translate(0, hgt / 2, 0).rotateZ(lean).translate(dx, 0, dz), 0x5d9448), s, x, .3));
        if (k % 2) plants.push(this.place(paint(new THREE.CylinderGeometry(.06, .06, .22, 6).translate(0, hgt * .85, 0).rotateZ(lean).translate(dx, 0, dz), 0x7a5234), s, x, .3));
      }
    }
    this.banks = new THREE.Mesh(merged(parts), toon(0xffffff, {vertexColors: true, side: THREE.DoubleSide}));
    this.banks.name = 'river:banks';
    this.group.add(this.banks);
    this.stoneParts = stones;
    this.plantParts = plants;
  }

  buildObstacles(rng) {
    const props = this.stoneParts, plants = this.plantParts;
    this.whirls = [];
    for (const o of this.course.obstacles) {
      if (o.kind === 'rock') {
        const r = o.radius, rock = new THREE.IcosahedronGeometry(1, 1);
        // Rounded but not a ball: squashed, turned, one side a little fuller.
        rock.scale(r, r * .75, r * .9).rotateY(rng() * Math.PI).translate(0, r * .15, 0);
        props.push(this.place(paint(rock, rng() < .5 ? 0x8e9392 : 0x9ea19c), o.s, o.x, S.waterHeight - .12));
      } else if (o.kind === 'branch') {
        const len = o.halfLength * 2, parts = [paint(new THREE.CylinderGeometry(.2, .28, len, 8).rotateZ(Math.PI / 2), 0x7b5230)], leaves = [];
        for (let k = 0; k < 3; k++) {
          const along = (k - 1) * len * .3 + (rng() - .5) * .4, tilt = (rng() - .5) * .8;
          parts.push(paint(new THREE.CylinderGeometry(.05, .08, .9, 5).translate(0, .45, 0).rotateX(tilt).rotateZ(.5 - k * .5).translate(along, .1, 0), 0x6e4828));
          for (let n = 0; n < 3; n++) {
            leaves.push(ellipsoid(along + Math.sin(.5 - k * .5) * -.8 + (rng() - .5) * .4, .8 + rng() * .25, (rng() - .5) * .5,
              .26, .1, .17, n % 2 ? 0x6fb35a : 0x8fc766, 6));
          }
        }
        props.push(this.place(merged(parts), o.s, o.x, S.waterHeight + .05));
        plants.push(this.place(merged(leaves), o.s, o.x, S.waterHeight + .05));
      } else if (o.kind === 'whirl') {
        this.whirls.push({o, base: this.basis(o.s, o.x, S.waterHeight + .02)});
      }
    }
    // The cliff stones either side of the lip are static too: merged with the rest.
    const L = this.course.length;
    for (const side of [-1, 1]) for (let k = 0; k < 9; k++) {
      const r = .7 + rng() * .6, h = -S.drop + (k % 3) * 2.2 + r * .6, s = L - 1 + Math.floor(k / 3) * 1.8;
      props.push(this.place(paint(new THREE.DodecahedronGeometry(1, 0).scale(r * 1.2, r, r).rotateY(rng() * 3), k % 2 ? 0x7f8583 : 0x929794),
        s, side * (BANK_IN + .2 + rng() * .8 + (k % 3) * .3), h));
    }
    const geometry = merged(props);
    this.props = new THREE.Mesh(geometry, toon(0xffffff, {vertexColors: true}));
    this.props.add(new THREE.Mesh(hullGeometry(geometry), penOutline(.035)));
    this.props.name = 'river:stones-and-branches';
    this.plants = new THREE.Mesh(merged(plants), toon(0xffffff, {vertexColors: true}));
    this.plants.name = 'river:reeds-and-leaves';
    this.whirlMesh = new THREE.InstancedMesh(spiralGeometry(), new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, opacity: .8, depthWrite: false}), Math.max(1, this.whirls.length));
    this.whirlMesh.count = this.whirls.length;
    this.whirlMesh.name = 'river:whirlpools'; this.whirlMesh.renderOrder = 2; this.whirlMesh.frustumCulled = false;
    this.group.add(this.props, this.plants, this.whirlMesh);
    delete this.stoneParts; delete this.plantParts;
  }

  buildGems() {
    const gems = this.course.gems, geometry = gemGeometry(.34), count = Math.max(1, gems.length);
    this.gemMesh = new THREE.InstancedMesh(geometry, toon(0xffffff, {emissive: 0x3a3320}), count);
    this.gemHull = new THREE.InstancedMesh(hullGeometry(geometry), penOutline(.035), count);
    this.gemMesh.count = this.gemHull.count = gems.length;
    const c = new THREE.Color();
    gems.forEach((g, i) => this.gemMesh.setColorAt(i, c.set(GEM_COLORS[i % GEM_COLORS.length])));
    this.gemBases = gems.map(g => this.basis(g.s, g.x, S.waterHeight + .55));
    for (const mesh of [this.gemMesh, this.gemHull]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; this.group.add(mesh);
    }
    this.gemMesh.name = 'river:gems';
  }

  buildWaterfall() {
    const L = this.course.length, cols = 10, rows = 12, reach = 2.4;
    // The curtain arcs out over the lip and falls into the pool.
    this.fallMap = this.waterMap.clone();
    const curtain = this.sheet(rows, cols, (i, j) => {
      const t = i / rows, x = -WATER_W + 2 * WATER_W * j / cols;
      return [L + reach * t, x, S.waterHeight - (S.drop + .05) * t * t, new THREE.Color(0x8fd6dc).lerp(new THREE.Color(0xeefaf8), t), t * 2];
    });
    const fall = new THREE.Mesh(curtain, toon(0xffffff, {map: this.fallMap, vertexColors: true, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide}));
    fall.name = 'river:waterfall'; fall.renderOrder = 1;
    const low = S.waterHeight - S.drop, poolW = WATER_W + 2;
    const pool = this.sheet(8, cols, (i, j) => {
      const s = L + 1 + S.pool * i / 8, x = -poolW + 2 * poolW * j / cols;
      return [s, x, low, new THREE.Color(0xe8f7f4).lerp(new THREE.Color(0x4fb3c0), Math.min(1, i / 3)), s / S.stripe];
    });
    const poolMesh = new THREE.Mesh(pool, this.water.material);
    poolMesh.name = 'river:pool'; poolMesh.renderOrder = 1;
    // Behind the curtain: the rock face under the lip and the pool's bed.
    const rock = [this.sheet(4, cols, (i, j) => [L + .05, -(poolW + 1) + 2 * (poolW + 1) * j / cols, S.bedHeight - (S.drop + .2) * i / 4, (i + j) % 2 ? 0x7c8280 : 0x8a8f8c]),
      this.sheet(4, 2, (i, j) => [L + .2 + (S.pool + 1) * i / 4, -poolW + poolW * j, S.bedHeight - S.drop, j === 1 ? 0x2f6f73 : 0x467f6c])];
    const rockMesh = new THREE.Mesh(merged(rock), this.banks.material);
    rockMesh.name = 'river:cliff';
    // Foam along the lip and where the curtain lands, then spray drifting up.
    this.foam = [];
    for (let k = 0; k < 12; k++) this.foam.push({s: L + .15, x: -WATER_W + 2 * WATER_W * (k + .5) / 12, h: S.waterHeight + .02, r: .32});
    for (let k = 0; k < 16; k++) this.foam.push({s: L + reach + (k % 2) * .6, x: -WATER_W + 2 * WATER_W * (k + .5) / 16, h: low + .02, r: .55});
    this.foamMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6).scale(1, .55, 1), toon(0xffffff), this.foam.length);
    this.foamMesh.name = 'river:foam';
    this.spray = Array.from({length: 36}, (_, i) => ({x: -WATER_W + 2 * WATER_W * ((i * .618) % 1), phase: (i * .37) % 1, reach: .6 + (i * .29) % 1.4}));
    this.sprayMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.16, 0), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: .7, depthWrite: false}), this.spray.length);
    this.sprayMesh.name = 'river:spray';
    for (const mesh of [this.foamMesh, this.sprayMesh]) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; }
    this.group.add(fall, poolMesh, rockMesh, this.foamMesh, this.sprayMesh);
  }

  update(run, t, {reducedMotion = false} = {}) {
    t = Number.isFinite(t) ? t : 0;
    const dt = this.lastT === undefined ? 0 : Math.max(0, Math.min(.1, t - this.lastT));
    this.lastT = t;
    const calm = reducedMotion ? .35 : 1, L = this.course.length;
    // Stripes travel with the log's speed, so the water visibly carries it.
    this.flow = (this.flow + dt * (run.speed || RIVER.startSpeed) / S.stripe * (reducedMotion ? .5 : 1)) % 1;
    this.waterMap.offset.y = -this.flow;
    this.fallMap.offset.y = -((t * 1.6 * calm) % 1);
    this.placeLog(run, t, dt, reducedMotion);
    for (let i = 0; i < this.whirls.length; i++) {
      const {o, base} = this.whirls[i];
      rot.setFromAxisAngle(v1.set(0, 1, 0), -t * 2.2 * calm);
      local.compose(v2.set(0, 0, 0), rot, v3.setScalar(o.radius));
      this.whirlMesh.setMatrixAt(i, local.premultiply(base));
    }
    this.whirlMesh.instanceMatrix.needsUpdate = true;
    this.course.gems.forEach((g, i) => {
      const bob = reducedMotion ? 0 : Math.sin(t * 2.4 + i) * .08;
      rot.setFromAxisAngle(v1.set(0, 1, 0), t * 1.8 * calm + i);
      local.compose(v2.set(0, bob, 0), rot, v3.setScalar(run.collected?.has(g.id) ? 0 : 1)).premultiply(this.gemBases[i]);
      this.gemMesh.setMatrixAt(i, local); this.gemHull.setMatrixAt(i, local);
    });
    this.gemMesh.instanceMatrix.needsUpdate = this.gemHull.instanceMatrix.needsUpdate = true;
    this.foam.forEach((f, i) => {
      const pulse = 1 + Math.sin(t * 5 * calm + i * 1.7) * .15;
      this.point(f.s, f.x, f.h, dummy.position);
      dummy.scale.set(f.r * pulse, f.r * pulse, f.r * pulse);
      dummy.updateMatrix(); this.foamMesh.setMatrixAt(i, dummy.matrix);
    });
    this.foamMesh.instanceMatrix.needsUpdate = true;
    this.spray.forEach((p, i) => {
      const life = (t * .7 * calm + p.phase) % 1;
      this.point(L + 2.4 + life * p.reach * 2, p.x + Math.sin(i + life * 3) * .3, S.waterHeight - S.drop + Math.sin(life * Math.PI) * (1.2 + p.reach), dummy.position);
      dummy.scale.setScalar(1 - life * .6);
      dummy.updateMatrix(); this.sprayMesh.setMatrixAt(i, dummy.matrix);
    });
    this.sprayMesh.instanceMatrix.needsUpdate = true;
  }

  placeLog(run, t, dt, reducedMotion) {
    const L = this.course.length;
    let s = run.s, h = S.waterHeight, pitch = 0;
    if (run.status === 'riding') {
      if (!reducedMotion) { h += Math.sin(t * 2.3) * .04; pitch = Math.sin(t * 1.7) * .02; }
    } else {
      // Over the lip: out along the curtain's arc, nose down, level again in the pool.
      const f = run.status === 'done' ? 1 : Math.min(1, run.fall / RIVER.fallTime);
      s = L + 2.4 * f;
      h = S.waterHeight - S.drop * f * f + (run.status === 'done' && !reducedMotion ? Math.sin(t * 2.3) * .04 : 0);
      pitch = Math.sin(f * Math.PI) * (reducedMotion ? .25 : .7);
    }
    // Lean into the steering: nose towards the motion, top leaning with it.
    const target = run.status === 'riding' && !reducedMotion ? this.lateral * (run.vx || 0) / RIVER.steerSpeed : 0;
    this.lean += (target - this.lean) * (1 - Math.exp(-8 * dt));
    this.basis(s, run.x || 0, h, local);
    local.decompose(this.log.position, this.log.quaternion, v1);
    rot.setFromEuler(euler.set(pitch, this.lean * .22, -this.lean * .18, 'YXZ'));
    this.log.quaternion.multiply(rot);
  }

  /** Plain numbers for tests and the integrator. */
  layout() {
    let meshes = 0;
    this.group.traverse(o => { if (o.isMesh && o.visible) meshes++; });
    const count = kind => this.course.obstacles.filter(o => o.kind === kind).length;
    return {length: this.course.length, halfWidth: RIVER.halfWidth, waterHalfWidth: WATER_W, waterHeight: S.waterHeight,
      drop: S.drop, pool: S.pool, logLength: S.logLength, logRadius: S.logRadius, seatHeight: S.logRadius * 1.3,
      rocks: count('rock'), branches: count('branch'), whirls: count('whirl'), gems: this.course.gems.length, meshes};
  }
}
