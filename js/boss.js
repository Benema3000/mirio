// Mirio: Finster-Mirio, the boss.
//
// Miro never drew a villain, so the boss is his hero once more: Mirio's own
// model (mirio-model.js), giant, dyed dark violet over the marker strokes,
// with glowing red eyes. The fight is the classic loop: he chases you,
// crouches, leaps at where you stand and slams down a shockwave you have to
// jump over, then sits there dizzy until you jump on his cap. Every hit makes
// him faster and less dizzy; after three he spins away into light.
//
// He moves in the plane of the arena's flat top: x along `right`, z along
// `forward`, h along `up`.

import * as THREE from 'three';
import { buildMirio } from './mirio-model.js';
import { BossToys } from './boss-toys.js';

const SCALE = 2.6;
const MAX_HP = 3;

// Multiplied into every toon material, so Miro's strokes still show through.
const SHADOW_TINT = 0x5b3d8f;
// How much of the marker colour is drained to grey first: red times violet
// is still red, and he should read as a shadow, not as Mirio in the dark.
const SHADOW_DRAIN = 0.8;
const EYE_COLOR = 0xff3a3a;
const EYE_GLOW = 0xff2a1a;
// A red corona round the head, so he reads as the villain from behind too.
const CORONA_COLOR = 0xd4102a;
const AURA_COLOR = 0x5a2aa8;
const STAR_COLOR = 0xffe14d;
// Hit flash and the light he dissolves into.
const GLOW_COLOR = 0xeadcff;
const WAVE_CORE = 0xffffff;
const WAVE_EDGE = 0xa060ff;

// The pencil eyes of the drawing in head coordinates: the head pivots at the
// neck, the face is the front of its ellipsoid (mirio-model.js: HEAD, FACE).
const EYE_X = 0.17;
const EYE_Y = 0.24;
const EYE_Z = 0.335;
const HEAD_Y = 0.22;
// Inner corners down: angry.
const EYE_SLANT = 0.45;

const ROAR_TIME = 1.1;
const CHASE_TIME = 3;
const CHASE_SPEED = 3.2;
const CHASE_SPEED_PER_HIT = 0.8;
const CHASE_ACCEL = 5;
const TURN_SPEED = 3.5;
const CROUCH_TIME = 1.05;
const LEAP_TIME = 1.0;
const LEAP_HEIGHT = 5;
const SLAM_TIME = 0.45;
const DIZZY_TIME = 4.2;
const DIZZY_PER_HIT = 0.4;
const DIZZY_MIN = 3.0;
const DIZZY_SQUASH = 0.65;
const HURT_TIME = 0.8;
const RECOIL_SPEED = 6;
const DEFEAT_TIME = 1.5;
const DEFEAT_TURNS = 4;
// His feet stay this far inside the arena's walkable radius.
const EDGE_MARGIN = 1.5;
// Radians of walk cycle per unit walked: long, heavy strides.
const STRIDE = 1.6;
const MAX_DT = 0.1;

const CONTACT_RADIUS = 1.6;
const STOMP_RADIUS = 1.8;
// A stomp counts from this far below the top of his cap to this far above.
const STOMP_BELOW = 1.0;
const STOMP_ABOVE = 2.0;
const PLAYER_HEIGHT = 2.3;

const WAVE_SPEED = 9;
const WAVE_HALF_WIDTH = 0.6;
// Feet higher than this above the arena clear the shockwave.
const WAVE_CLEARANCE = 0.5;
const WAVE_WALL = 0.6;
const WAVE_LIFT = 0.05;

const SHADOW_SIZE = 3.6;

const tmp = new THREE.Vector3();
const dir = new THREE.Vector3();
const side = new THREE.Vector3();
const basis = new THREE.Matrix4();
const glowColor = new THREE.Color(GLOW_COLOR);

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
const lerp = THREE.MathUtils.lerp;
const damp = (from, to, rate, dt) => lerp(from, to, 1 - Math.exp(-rate * dt));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function glowSprite(map, color, opacity = 1) {
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map, color, opacity, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
}

/**
 * Clones every material of the model once (they are shared between meshes)
 * and dyes the toon ones. The outline hulls keep their black, but get their
 * own copy too: the defeat animation recolours them.
 */
function darken(model) {
  const clones = new Map();
  const tint = new THREE.Color(SHADOW_TINT);
  model.group.traverse((o) => {
    if (!o.isMesh) return;
    let mat = clones.get(o.material);
    if (!mat) {
      mat = o.material.clone();
      if (mat.isMeshToonMaterial) {
        mat.color.multiply(tint);
        if (mat.map) mat.onBeforeCompile = drainMap;
        mat.emissive.copy(glowColor);
        mat.emissiveIntensity = 0;
      }
      clones.set(o.material, mat);
    }
    o.material = mat;
  });
  const all = [...clones.values()];
  const outlines = all.filter((m) => m.isShaderMaterial && m.uniforms.color);
  return {
    toons: all.filter((m) => m.isMeshToonMaterial),
    outlines: outlines.map((m) => ({ uniform: m.uniforms.color, color: m.uniforms.color.value.clone() })),
  };
}

/**
 * Two slanted red eyes with a glint each, and the corona: a big glow in the
 * middle of the head, so the head itself hides its centre and only a red rim
 * shows round it, from the front and from behind.
 */
function addEyes(head, glowMap) {
  const mat = new THREE.MeshBasicMaterial({ color: EYE_COLOR });
  const geom = new THREE.SphereGeometry(1, 16, 10);
  const glint = glowSprite(glowMap, EYE_GLOW).material;
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(geom, mat);
    eye.scale.set(0.085, 0.052, 0.03);
    eye.position.set(EYE_X * s, EYE_Y, EYE_Z);
    eye.rotation.set(0, 0.4 * s, EYE_SLANT * s);
    head.add(eye);
    const sprite = new THREE.Sprite(glint);
    sprite.position.set(EYE_X * s, EYE_Y, EYE_Z + 0.06);
    sprite.scale.setScalar(0.3);
    head.add(sprite);
  }
  const corona = glowSprite(glowMap, CORONA_COLOR);
  corona.position.y = HEAD_Y + 0.08;
  corona.scale.setScalar(2.3);
  head.add(corona);
  return { glint, corona: corona.material };
}

/**
 * The shockwave: a glowing ring on the arena floor plus a low wall of light
 * above it, both clipped to the arena disc. Drawn in the arena's own frame,
 * so the ring keeps its width however far it has spread.
 */
function buildWave(arenaRadius) {
  const uniforms = {
    radius: { value: 0 },
    origin: { value: new THREE.Vector2() },
    opacity: { value: 1 },
    halfWidth: { value: WAVE_HALF_WIDTH },
    wallHeight: { value: WAVE_WALL },
    arenaRadius: { value: arenaRadius },
    core: { value: new THREE.Color(WAVE_CORE) },
    edge: { value: new THREE.Color(WAVE_EDGE) },
  };
  const vertexShader = `
    uniform float radius;
    uniform vec2 origin;
    varying vec2 vFlat;
    varying float vHeight;
    void main() {
      vec3 p = position;
    #ifdef WALL
      p.xz = p.xz * radius + origin;
    #endif
      vFlat = p.xz;
      vHeight = p.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;
  const fragmentShader = `
    uniform float radius, opacity, halfWidth, wallHeight, arenaRadius;
    uniform vec2 origin;
    uniform vec3 core, edge;
    varying vec2 vFlat;
    varying float vHeight;
    void main() {
      if (length(vFlat) > arenaRadius) discard;
    #ifdef WALL
      float k = 1.0 - vHeight / wallHeight;
      k *= k * 0.8;
    #else
      float off = distance(vFlat, origin) - radius;
      float k = 1.0 - smoothstep(0.0, halfWidth, abs(off));
      // A faint wake inside the ring.
      if (off < 0.0) k = max(k, 0.3 * exp(off * 1.2));
    #endif
      gl_FragColor = vec4(mix(edge, core, k * k) * k * opacity, 1.0);
    }`;
  const material = (defines) => new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, defines,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });

  const group = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(arenaRadius * 2, arenaRadius * 2).rotateX(-Math.PI / 2),
    material({}),
  );
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, WAVE_WALL, 72, 1, true).translate(0, WAVE_WALL / 2, 0),
    material({ WALL: '' }),
  );
  // The shader moves the wall's vertices, so its bounding sphere is wrong.
  wall.frustumCulled = false;
  group.add(floor, wall);
  group.visible = false;
  return { group, uniforms, active: false, x: 0, z: 0, radius: 0, reach: 0 };
}

function buildShadow(map) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    }),
  );
}

export class Boss {
  #toys;
  constructor(scene, art, arena, colliders = null) {
    this.arena = arena;
    this.maxHp = MAX_HP;

    // Tangent basis of the arena top; yaw 0 faces `forward`.
    this.up = arena.up.clone().normalize();
    const ref = Math.abs(this.up.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    this.forward = ref.addScaledVector(this.up, -ref.dot(this.up)).normalize();
    this.right = new THREE.Vector3().crossVectors(this.up, this.forward);
    this.flat = new THREE.Quaternion().setFromRotationMatrix(basis.makeBasis(this.right, this.up, this.forward));

    // Everything the boss draws; hide this to hide him.
    this.group = new THREE.Group();
    scene.add(this.group);
    this.root = new THREE.Group();
    this.group.add(this.root);

    this.model = buildMirio(art);
    this.model.group.scale.setScalar(SCALE);
    this.root.add(this.model.group);
    this.materials = darken(this.model);
    this.glow = addEyes(this.model.head, art.glow);

    // Behind him: its centre sits in his middle, so his body hides the near half.
    this.aura = glowSprite(art.glow, AURA_COLOR, 0.5);
    this.aura.position.y = 1.15;
    this.aura.scale.setScalar(3.6);
    this.model.group.add(this.aura);

    const starMat = new THREE.SpriteMaterial({ map: art.sparkle, color: STAR_COLOR, transparent: true, depthWrite: false });
    this.stars = [0, 1, 2].map(() => {
      const s = new THREE.Sprite(starMat);
      s.scale.setScalar(0.9);
      this.root.add(s);
      return s;
    });

    this.shadow = buildShadow(art.shadow);
    this.shadow.quaternion.copy(this.flat);
    this.group.add(this.shadow);

    this.wave = buildWave(arena.radius);
    this.wave.group.position.copy(arena.center).addScaledVector(this.up, WAVE_LIFT);
    this.wave.group.quaternion.copy(this.flat);
    this.group.add(this.wave.group);

    this.#toys = new BossToys(this.group, arena, this.flat, colliders);
    this.limbs = {};
    this.reset();
  }

  snapshot() { return {state:this.state,hp:this.hpLeft,defeated:this.defeated,target:{...this.target},toys:this.#toys.snapshot()}; }

  layout() { return {pads:this.#toys.layout()}; }

  get hp() {
    return this.hpLeft;
  }

  get defeated() {
    return this.hpLeft <= 0;
  }

  /** His feet in world space: a fresh vector on every call. */
  get position() {
    return this.toWorld(this.x, this.z, this.h, new THREE.Vector3());
  }

  reset() {
    this.hpLeft = MAX_HP;
    this.state = 'idle';
    this.stateT = 0;
    this.time = 0;
    this.roarPending = false;
    this.x = this.z = this.h = 0;
    this.yaw = 0;
    this.speed = 0;
    this.walkPhase = 0;
    this.target = { x: 0, z: 0 };
    this.leap = { x0: 0, z0: 0, x1: 0, z1: 0 };
    this.recoil = { x: 0, z: 0 };
    this.dizzyTime = DIZZY_TIME;
    this.wave.active = false;
    this.wave.group.visible = false;
    this.#toys.reset();
    for (const s of this.stars) s.visible = false;
    Object.assign(this.limbs, { squash: 1, raise: 0, legL: 0, legR: 0, armL: 0, armR: 0, lean: 0 });
    this.setGlow(0, 0);
    this.group.visible = true;
    this.model.group.scale.setScalar(SCALE);
    this.model.group.rotation.set(0, 0, 0);
    this.pose(0);
    this.place();
  }

  start() {
    if (this.state === 'idle') this.roarPending = true;
  }

  /** Height of the top of his cap above the arena surface. */
  headTop() {
    const body = this.model.body;
    return this.h + this.model.group.scale.y * (body.position.y + this.model.height * body.scale.y);
  }

  update(dt, player) {
    const events = [];
    if (this.state === 'gone') return events;
    dt = Math.min(dt, MAX_DT);
    this.time += dt;
    this.stateT += dt;
    const p = this.readPlayer(player);
    // The warning commits to one landing spot so a child can read and dodge it.
    if (p && !['crouch', 'leap', 'slam'].includes(this.state)) Object.assign(this.target, { x: p.x, z: p.z });

    if (this.roarPending) {
      this.roarPending = false;
      this.enter('roar');
      events.push({ type: 'roar' });
    }

    switch (this.state) {
      case 'idle':
        if (p && Math.hypot(p.x, p.z) < this.arena.radius * 2) this.turnToward(p.x, p.z, TURN_SPEED * 0.4, dt);
        break;
      case 'roar':
        if (this.stateT >= ROAR_TIME) this.enter('chase');
        break;
      case 'chase':
        this.chase(dt);
        if (this.stateT >= CHASE_TIME) this.enter('crouch');
        break;
      case 'crouch':
        this.turnToward(this.target.x, this.target.z, TURN_SPEED, dt);
        if (this.stateT >= CROUCH_TIME) this.takeOff(events);
        break;
      case 'leap':
        this.fly(dt, events);
        break;
      case 'slam':
        if (this.stateT >= SLAM_TIME) this.enter('dizzy');
        break;
      case 'dizzy':
        if (p && this.stomped(p)) this.hit(player, p, events);
        else if (this.stateT >= this.dizzyTime) this.enter('chase');
        break;
      case 'hurt': {
        const k = Math.max(0, 1 - this.stateT / HURT_TIME) * RECOIL_SPEED * dt;
        this.moveTo(this.x + this.recoil.x * k, this.z + this.recoil.z * k);
        if (p) this.turnToward(p.x, p.z, TURN_SPEED, dt);
        if (this.stateT >= HURT_TIME) this.enter('chase');
        break;
      }
      case 'defeated':
        if (this.stateT >= DEFEAT_TIME) {
          this.state = 'gone';
          this.group.visible = false;
          events.push({ type: 'defeated', pos: this.toWorld(this.x, this.z, 0, new THREE.Vector3()) });
          return events;
        }
        break;
    }

    if (p && this.touching(p)) this.hurtPlayer(player, p, this.x, this.z, events);
    this.updateWave(dt, p, player, events);
    this.#toys.update(dt, this, p, player, events);
    this.pose(dt);
    this.place();
    return events;
  }

  enter(state) {
    this.state = state;
    this.stateT = 0;
    const hits = MAX_HP - this.hpLeft;
    if (state === 'chase') this.speed = 0;
    if (state === 'crouch') [this.target.x, this.target.z] = this.inside(this.target.x, this.target.z);
    if (state === 'dizzy') this.dizzyTime = Math.max(DIZZY_MIN, DIZZY_TIME - DIZZY_PER_HIT * hits);
    for (const s of this.stars) s.visible = state === 'dizzy';
  }

  /** Mirio in arena coordinates, or null when he cannot interact. */
  readPlayer(player) {
    if (!player || player.state !== 'play') return null;
    const b = player.body;
    const rel = tmp.subVectors(b.pos, this.arena.center);
    return {
      x: rel.dot(this.right),
      z: rel.dot(this.forward),
      h: rel.dot(this.up),
      falling: b.vel.dot(this.up) < 0 || player.pounding,
      vulnerable: !(player.invulnerable > 0),
    };
  }

  toWorld(x, z, h, out) {
    return out.copy(this.arena.center)
      .addScaledVector(this.right, x)
      .addScaledVector(this.forward, z)
      .addScaledVector(this.up, h);
  }

  /** (x, z) pulled back inside the arena, as [x, z]. */
  inside(x, z) {
    const max = this.arena.radius - EDGE_MARGIN;
    const k = Math.min(1, max / Math.max(Math.hypot(x, z), 1e-6));
    return [x * k, z * k];
  }

  moveTo(x, z) {
    [this.x, this.z] = this.inside(x, z);
  }

  turnToward(x, z, rate, dt) {
    const dx = x - this.x;
    const dz = z - this.z;
    if (dx * dx + dz * dz < 1e-4) return 0;
    const diff = wrapAngle(Math.atan2(dx, dz) - this.yaw);
    this.yaw = wrapAngle(this.yaw + THREE.MathUtils.clamp(diff, -rate * dt, rate * dt));
    return diff;
  }

  /** Lumbers toward Mirio: turns first, walks the way he faces. */
  chase(dt) {
    const hits = MAX_HP - this.hpLeft;
    const top = CHASE_SPEED + CHASE_SPEED_PER_HIT * hits;
    this.speed = Math.min(top, this.speed + CHASE_ACCEL * dt);
    const diff = this.turnToward(this.target.x, this.target.z, TURN_SPEED, dt);
    const dist = Math.hypot(this.target.x - this.x, this.target.z - this.z);
    const step = Math.min(dist, this.speed * Math.max(0, Math.cos(diff)) * dt);
    const x0 = this.x;
    const z0 = this.z;
    this.moveTo(this.x + Math.sin(this.yaw) * step, this.z + Math.cos(this.yaw) * step);
    this.walkPhase += Math.hypot(this.x - x0, this.z - z0) * STRIDE;
  }

  takeOff(events) {
    const [x1, z1] = this.inside(this.target.x, this.target.z);
    Object.assign(this.leap, { x0: this.x, z0: this.z, x1, z1 });
    this.enter('leap');
    events.push({ type: 'jump', pos: this.position });
  }

  fly(dt, events) {
    const L = this.leap;
    const t = Math.min(1, this.stateT / LEAP_TIME);
    this.x = lerp(L.x0, L.x1, t);
    this.z = lerp(L.z0, L.z1, t);
    this.h = 4 * LEAP_HEIGHT * t * (1 - t);
    this.turnToward(L.x1, L.z1, TURN_SPEED, dt);
    if (t < 1) return;

    this.h = 0;
    this.enter('slam');
    this.limbs.squash = 0.45;
    const w = this.wave;
    Object.assign(w, { active: true, x: this.x, z: this.z, radius: 0 });
    w.reach = Math.hypot(this.x, this.z) + this.arena.radius + WAVE_HALF_WIDTH;
    w.uniforms.origin.value.set(this.x, this.z);
    events.push({ type: 'slam', pos: this.position });
  }

  stomped(p) {
    const top = this.headTop();
    return p.falling
      && p.h > top - STOMP_BELOW && p.h < top + STOMP_ABOVE
      && Math.hypot(p.x - this.x, p.z - this.z) < STOMP_RADIUS;
  }

  hit(player, p, events) {
    this.hpLeft -= 1;
    player.bounce();
    // A ring still out there would catch him on the way down from his bounce.
    this.wave.active = false;
    events.push({ type: 'hit', hp: this.hpLeft, pos: this.toWorld(this.x, this.z, this.headTop(), new THREE.Vector3()) });
    if (this.hpLeft <= 0) {
      this.enter('defeated');
      return;
    }
    // Recoil away from Mirio, or backwards if he is right on the axis.
    const dx = this.x - p.x;
    const dz = this.z - p.z;
    const len = Math.hypot(dx, dz);
    this.recoil.x = len > 0.2 ? dx / len : -Math.sin(this.yaw);
    this.recoil.z = len > 0.2 ? dz / len : -Math.cos(this.yaw);
    this.enter('hurt');
  }

  /** Walking into him hurts, except while he is dizzy or hurt himself. */
  touching(p) {
    if (!['chase', 'crouch', 'leap', 'slam'].includes(this.state)) return false;
    return p.vulnerable
      && Math.hypot(p.x - this.x, p.z - this.z) < CONTACT_RADIUS
      && p.h < this.headTop()
      && p.h + PLAYER_HEIGHT > this.h;
  }

  /** Knocks Mirio away from (x, z) on the arena surface. */
  hurtPlayer(player, p, x, z, events) {
    // Right on top of (x, z) the direction is undefined: push him out the
    // way the boss faces.
    const nearAxis = Math.hypot(p.x - x, p.z - z) < 0.1;
    const from = this.toWorld(
      nearAxis ? x - Math.sin(this.yaw) * 0.5 : x,
      nearAxis ? z - Math.cos(this.yaw) * 0.5 : z,
      0,
      new THREE.Vector3(),
    );
    player.hurt(from);
    p.vulnerable = false;
    events.push({ type: 'hurtPlayer', pos: from });
  }

  updateWave(dt, p, player, events) {
    const w = this.wave;
    w.group.visible = w.active;
    if (!w.active) return;
    w.radius += WAVE_SPEED * dt;
    if (w.radius > w.reach) {
      w.active = false;
      w.group.visible = false;
      return;
    }
    w.uniforms.radius.value = w.radius;
    w.uniforms.opacity.value = 1 - 0.55 * (w.radius / w.reach);
    if (!p || !p.vulnerable || Math.abs(p.h) > WAVE_CLEARANCE) return;
    const d = Math.hypot(p.x - w.x, p.z - w.z);
    if (Math.abs(d - w.radius) < WAVE_HALF_WIDTH) this.hurtPlayer(player, p, w.x, w.z, events);
  }

  /** Emissive on the body, the same colour on the outlines (0..1 each). */
  setGlow(body, outline) {
    for (const m of this.materials.toons) m.emissiveIntensity = body;
    for (const o of this.materials.outlines) o.uniform.value.copy(o.color).lerp(glowColor, outline);
  }

  pose(dt) {
    const m = this.model;
    const L = this.limbs;
    const t = this.stateT;
    const now = this.time;
    // Targets; the limbs ease toward them.
    const T = { squash: 1 + Math.sin(now * 1.6) * 0.015, raise: 0.15, legL: 0, legR: 0, armL: 0, armR: 0, lean: 0 };
    let roll = 0;
    let bob = 0;
    let headX = 0;
    let headZ = 0;
    let eyes = 0.85 + Math.sin(now * 3) * 0.1;
    let squashRate = 10;

    switch (this.state) {
      case 'roar':
        Object.assign(T, { squash: 1.08, raise: 1, lean: -0.22 });
        headX = -0.35;
        roll = Math.sin(now * 40) * 0.02;
        eyes = 1.4;
        break;
      case 'chase': {
        const run = Math.min(1, this.speed / CHASE_SPEED);
        const swing = Math.sin(this.walkPhase);
        Object.assign(T, { raise: 0.45, lean: 0.12 * run });
        T.legL = swing * 0.6 * run;
        T.legR = -T.legL;
        T.armL = -swing * 0.45 * run;
        T.armR = -T.armL;
        roll = swing * 0.06 * run;
        bob = Math.abs(swing) * 0.07 * run;
        headZ = Math.sin(this.walkPhase * 0.5) * 0.05 * run;
        break;
      }
      case 'crouch':
        Object.assign(T, { squash: 0.72, raise: 1, lean: 0.2 });
        roll = Math.sin(now * 55) * 0.025;
        eyes = 1.5;
        break;
      case 'leap': {
        const rising = t < LEAP_TIME / 2;
        Object.assign(T, { squash: rising ? 1.12 : 1.02, raise: 1, legL: 0.55, legR: -0.25, lean: rising ? -0.05 : 0.1 });
        eyes = 1.3;
        squashRate = 14;
        break;
      }
      case 'slam':
        Object.assign(T, { squash: DIZZY_SQUASH, raise: 0.2, lean: 0.1 });
        squashRate = 6;
        break;
      case 'dizzy':
        Object.assign(T, { squash: DIZZY_SQUASH + Math.sin(now * 3) * 0.02, raise: 0, armL: 0.35, armR: 0.35 });
        roll = Math.sin(now * 2.4) * 0.12;
        headZ = Math.sin(now * 2.4 + 1) * 0.18;
        headX = 0.15;
        eyes = 0.35 + Math.sin(now * 5) * 0.15;
        break;
      case 'hurt': {
        const k = 1 - t / HURT_TIME;
        Object.assign(T, { squash: 1 + Math.sin(t * 24) * 0.14 * k, raise: 0.9, lean: -0.28 * k });
        T.armL = Math.sin(t * 30) * 0.5 * k;
        T.armR = -T.armL;
        headX = -0.3 * k;
        eyes = 1.2;
        squashRate = 30;
        break;
      }
      case 'defeated':
        T.raise = 1;
        eyes = 1 - t / DEFEAT_TIME;
        break;
    }

    L.squash = damp(L.squash, T.squash, squashRate, dt);
    for (const key of ['raise', 'lean']) L[key] = damp(L[key], T[key], 10, dt);
    for (const key of ['legL', 'legR', 'armL', 'armR']) L[key] = damp(L[key], T[key], 14, dt);

    const wide = 1 + (1 - L.squash) * 0.5;
    m.body.scale.set(wide, L.squash, wide);
    m.body.position.y = bob;
    m.body.rotation.set(L.lean, 0, roll);
    m.head.rotation.set(headX, 0, headZ);
    m.legL.rotation.x = L.legL;
    m.legR.rotation.x = L.legR;
    m.armL.rotation.x = L.armL;
    m.armR.rotation.x = L.armR;
    m.armL.rotation.z = lerp(m.armRestZ.L, m.armRaisedZ.L, L.raise);
    m.armR.rotation.z = lerp(m.armRestZ.R, m.armRaisedZ.R, L.raise);

    this.glow.glint.opacity = Math.max(0, eyes);
    this.glow.corona.opacity = Math.max(0, eyes) * 0.8;
    this.aura.material.opacity = 0.45 + Math.sin(now * 2) * 0.1;
    this.aura.material.color.setHex(AURA_COLOR);
    this.setGlow(0, 0);

    if (this.state === 'hurt') this.setGlow(Math.floor(t / 0.08) % 2 === 0 ? 0.8 : 0, 0);
    if (this.state === 'defeated') {
      // Spins faster and faster, glows up, and shrinks into a point of light.
      const k = Math.min(1, t / DEFEAT_TIME);
      const e = Math.min(1, k * 2.5);
      this.setGlow(e, e);
      m.group.rotation.y = DEFEAT_TURNS * Math.PI * 2 * k * k;
      m.group.scale.setScalar(SCALE * (1 - k * k * k));
      this.h = k * 1.5;
      this.aura.material.color.setHex(AURA_COLOR).lerp(glowColor, e);
      this.aura.material.opacity = Math.sin(k * Math.PI) * 1.2;
    }

    if (this.state === 'dizzy') {
      const top = this.headTop() - this.h;
      this.stars.forEach((s, i) => {
        const a = now * 3.2 + (i * Math.PI * 2) / 3;
        s.position.set(Math.cos(a) * 1.35, top + 0.35 + Math.sin(a * 2) * 0.18, Math.sin(a) * 1.35);
      });
      this.stars[0].material.rotation = now * 2;
    }
  }

  place() {
    this.toWorld(this.x, this.z, this.h, this.root.position);
    dir.copy(this.forward).multiplyScalar(Math.cos(this.yaw)).addScaledVector(this.right, Math.sin(this.yaw));
    side.crossVectors(this.up, dir);
    this.root.quaternion.setFromRotationMatrix(basis.makeBasis(side, this.up, dir));

    const air = Math.min(1, this.h / LEAP_HEIGHT);
    this.toWorld(this.x, this.z, 0.03, this.shadow.position);
    this.shadow.scale.setScalar(SHADOW_SIZE * (1 - air * 0.45) * (this.model.group.scale.x / SCALE));
  }
}
