// Mirio: the physics that does not need a screen.
//
// Every planet is a sphere with its own gravity field. A body falls toward
// the planet whose *surface* is nearest, among the planets whose field reaches
// it. A planet may carry terrain: `planet.heightAt(dir)` gives the ground's
// height above its sphere along unit `dir` (the Festland's hills). Ground
// contact, surfacePoint and heightAbove all follow it; terrain too steep to
// walk up is a wall. Planets without it are plain spheres. On a planet, solid things are simple shapes standing on the surface:
// cylinders (tree stumps, trees, stepping stones, the rocket plateau), boxes
// (Miro's floor blocks, floating or standing) and bumps (hills).
//
// No DOM and no rendering here, so tests/mirio-world.test.mjs can run it
// under plain node.

import { Quaternion, Vector3 } from 'three';

export const GRAVITY = 38;
export const RUN_SPEED = 9;

// Jumping: hold the button to rise high, let go early for a
// hop, fall faster than you rose, and chain up to a triple jump by jumping
// again right after landing while running (see jumpFor()).
export const JUMP_SPEED = 13.5;
// Extra take-off speed at full running speed: running jumps go higher.
export const RUN_JUMP_BONUS = 2;
// Take-off speed multipliers for the single, double and triple jump.
export const JUMP_CHAIN = [1, 1.12, 1.3];
// Window after landing in which the next jump continues the chain.
export const CHAIN_WINDOW = 0.28;
// Running speed the chain needs; slower and it starts over.
export const CHAIN_MIN_SPEED = 5;
// Gravity multipliers: rising with jump held, rising after letting go, falling.
export const HOLD_GRAVITY = 0.6;
export const RELEASE_GRAVITY = 1.8;
export const FALL_GRAVITY = 1.5;
export const TERMINAL_FALL = 28;

// Mirio builds up speed, turns with a little inertia, skids when you push the
// other way, and keeps his momentum in the air.
const GROUND_ACCEL = 38;
const GROUND_DECEL = 42;
const SKID_DECEL = 95;
const TURN_RATE = 11;
const SLOW_TURN_BONUS = 20;
const AIR_ACCEL = 20;
const AIR_DRAG = 3;
// How far below a top a falling body still lands on it rather than being
// pushed off the side. Must exceed one physics step of fall. Also the height
// you step up without jumping.
const TOP_LIP = 0.45;
// How far the head may poke into the underside of a floating block before
// it counts as a bump.
const HEAD_LIP = 0.5;
// A grounded body stays glued to the surface over bumps up to this height,
// so running over the curve of a small planet does not launch you.
const SNAP_HEIGHT = 0.25;
// Hills steeper than this are walls.
const WALKABLE = 0.55;
// Terrain rising more than this per metre stops a body like a wall (about 50°).
const STEEP = 1.2;

const tmp = new Vector3();
const tmpRadial = new Vector3();
const tmpTarget = new Vector3();
const tmpTangent = new Vector3();
const tmpAir = new Vector3();
const tmpUp = new Vector3();
const tmpWish = new Vector3();
const tmpPrevious = new Vector3();
const tmpGround = new Vector3();
const tmpSlope = new Vector3();
const tmpSide = new Vector3();
const tmpCross = new Vector3();
const identity = new Quaternion();
const tmpQ = new Quaternion();

/** The planet that pulls on `pos`, or null in open space. */
export function pickGravitySource(pos, planets) {
  let best = null;
  let bestGap = Infinity;
  for (const planet of planets) {
    const d = pos.distanceTo(planet.center);
    if (d > planet.gravityRadius) continue;

    const gap = d - planet.radius;
    if (gap < bestGap) {
      bestGap = gap;
      best = planet;
    }
  }
  return best;
}

export function upAt(pos, planet, out = new Vector3()) {
  return out.subVectors(pos, planet.center).normalize();
}

/** `v` projected onto the plane normal to `up`, normalised; null if parallel. */
export function tangentDir(v, up, out = new Vector3()) {
  out.copy(v).addScaledVector(up, -v.dot(up));
  const len = out.length();
  if (len < 1e-4) return null;
  return out.divideScalar(len);
}

/** Unit direction for latitude/longitude in degrees, +Y is north. */
export function dirFromLatLon(lat, lon, out = new Vector3()) {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return out.set(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo));
}

/** Latitude in degrees of `pos` on `planet`, +Y is north. */
export function latitudeOf(pos, planet) {
  const rel = tmp.subVectors(pos, planet.center);
  return (Math.asin(Math.max(-1, Math.min(1, rel.y / rel.length()))) * 180) / Math.PI;
}

/** Distance from the centre of `planet` to its ground along unit `dir`, terrain included. */
export function groundRadius(planet, dir) {
  return planet.heightAt ? planet.radius + planet.heightAt(dir) : planet.radius;
}

/** Point `height` above the ground of `planet` in direction `dir`. */
export function surfacePoint(planet, dir, height = 0, out = new Vector3()) {
  return out.copy(planet.center).addScaledVector(dir, groundRadius(planet, dir) + height);
}

/** Height of `pos` above the ground of `planet`. */
export function heightAbove(pos, planet) {
  if (!planet.heightAt) return pos.distanceTo(planet.center) - planet.radius;
  const rel = tmpGround.subVectors(pos, planet.center), d = rel.length();
  return d - groundRadius(planet, rel.divideScalar(d));
}

/**
 * Uphill direction of the terrain at unit `dir`, on the tangent plane, scaled
 * by the slope (metres up per metre across); zero on a plain sphere.
 */
export function terrainSlope(planet, dir, out = new Vector3()) {
  out.set(0, 0, 0);
  if (!planet.heightAt) return out;
  const e = 0.2;
  const a = tangentDir(Math.abs(dir.y) < 0.9 ? tmpSide.set(0, 1, 0) : tmpSide.set(1, 0, 0), dir, tmpSlope);
  const b = tmpCross.crossVectors(dir, a);
  for (const t of [a, b]) {
    const p = tmpGround.copy(dir).multiplyScalar(planet.radius).addScaledVector(t, e).normalize();
    const hi = planet.heightAt(p);
    p.copy(dir).multiplyScalar(planet.radius).addScaledVector(t, -e).normalize();
    out.addScaledVector(t, (hi - planet.heightAt(p)) / (2 * e));
  }
  return out;
}

/** True when `pos` is on the water ring of `planet` (lake surface level). */
export function inWater(pos, planet) {
  if (!planet?.water) return false;
  const lat = latitudeOf(pos, planet);
  return lat > planet.water.minLat && lat < planet.water.maxLat && heightAbove(pos, planet) < 0.2;
}

/** Keeps `pos` out of the planet; true when it touched the ground. */
export function resolvePlanet(pos, vel, planet) {
  const up = upAt(pos, planet, tmp);
  const ground = groundRadius(planet, up);
  if (pos.distanceTo(planet.center) > ground) return false;

  pos.copy(planet.center).addScaledVector(up, ground);
  const vUp = vel.dot(up);
  if (vUp < 0) vel.addScaledVector(up, -vUp);
  return true;
}

function landOnTop(pos, vel, c, along, vAlong) {
  pos.addScaledVector(c.axis, c.height - along);
  vel.addScaledVector(c.axis, -vAlong);
  return 'top';
}

function bumpHead(pos, vel, c, along, vAlong, bodyHeight) {
  pos.addScaledVector(c.axis, -bodyHeight - along);
  if (vAlong > 0) vel.addScaledVector(c.axis, -vAlong);
  return 'head';
}

/**
 * Upright cylinder: `c` = { kind: 'cyl', base, axis (unit), radius, height }.
 * Solid from `base` to `base + axis * height`; the base may float.
 */
function collideCylinder(pos, vel, body, c, previous) {
  const rel = tmp.subVectors(pos, c.base);
  const along = rel.dot(c.axis);
  const vAlong = vel.dot(c.axis);
  const before = previous ? previous.dot(c.axis) - c.base.dot(c.axis) : along;
  const crossedTop = previous && before >= c.height - 0.01 && along <= c.height && vAlong <= 0;
  const crossedHead = previous && before + body.height <= 0.01 && along + body.height >= 0 && vAlong > 0;
  if (!crossedTop && !crossedHead && (along > c.height + 0.01 || along + body.height < 0)) return null;

  const radial = tmpRadial.copy(rel).addScaledVector(c.axis, -along);
  const rd = radial.length();
  const reach = c.radius + body.radius;
  if (rd >= reach) return null;

  if (crossedTop || (along > c.height - TOP_LIP && vAlong <= 0.01)) return landOnTop(pos, vel, c, along, vAlong);
  if (crossedHead || (along < 0 && along + body.height < HEAD_LIP && vAlong > -0.01)) {
    return bumpHead(pos, vel, c, along, vAlong, body.height);
  }

  if (rd < 1e-4) {
    // Dead centre: any horizontal direction will do.
    radial.set(1, 0, 0).addScaledVector(c.axis, -c.axis.x);
    if (radial.lengthSq() < 0.01) radial.set(0, 0, 1).addScaledVector(c.axis, -c.axis.z);
  }
  radial.normalize();
  pos.addScaledVector(radial, reach - rd);
  const vIn = vel.dot(radial);
  if (vIn < 0) vel.addScaledVector(radial, -vIn);
  return 'side';
}

/**
 * Upright box: `c` = { kind: 'box', base, axis, right, forward, halfW, halfD,
 * height }. `right` and `forward` are unit tangents at the base.
 */
function collideBox(pos, vel, body, c, previous) {
  const rel = tmp.subVectors(pos, c.base);
  const along = rel.dot(c.axis);
  const vAlong = vel.dot(c.axis);
  const before = previous ? previous.dot(c.axis) - c.base.dot(c.axis) : along;
  const crossedTop = previous && before >= c.height - 0.01 && along <= c.height && vAlong <= 0;
  const crossedHead = previous && before + body.height <= 0.01 && along + body.height >= 0 && vAlong > 0;
  if (!crossedTop && !crossedHead && (along > c.height + 0.01 || along + body.height < 0)) return null;

  const x = rel.dot(c.right);
  const z = rel.dot(c.forward);
  const px = c.halfW + body.radius - Math.abs(x);
  const pz = c.halfD + body.radius - Math.abs(z);
  if (px <= 0 || pz <= 0) return null;

  if (crossedTop || (along > c.height - TOP_LIP && vAlong <= 0.01)) return landOnTop(pos, vel, c, along, vAlong);
  if (crossedHead || (along < 0 && along + body.height < HEAD_LIP && vAlong > -0.01)) {
    return bumpHead(pos, vel, c, along, vAlong, body.height);
  }

  const [dir, depth, side] = px < pz ? [c.right, px, Math.sign(x) || 1] : [c.forward, pz, Math.sign(z) || 1];
  pos.addScaledVector(dir, depth * side);
  const vIn = vel.dot(dir) * side;
  if (vIn < 0) vel.addScaledVector(dir, -vIn * side);
  return 'side';
}

/** A hill: the part of a sphere `c` = { kind: 'bump', center, radius } above ground. */
function collideBump(pos, vel, body, c, up) {
  const rel = tmp.subVectors(pos, c.center);
  const d = rel.length();
  if (d >= c.radius) return null;

  const n = rel.divideScalar(d || 1);
  pos.copy(c.center).addScaledVector(n, c.radius);
  const vIn = vel.dot(n);
  if (vIn < 0) vel.addScaledVector(n, -vIn);
  return n.dot(up) > WALKABLE ? 'top' : 'side';
}

/** Resolves a collider; previous feet position also catches fast surface crossings. */
export function collide(pos, vel, body, c, up, previous = null) {
  if (c.kind === 'box') return collideBox(pos, vel, body, c, previous);
  if (c.kind === 'bump') return collideBump(pos, vel, body, c, up);
  return collideCylinder(pos, vel, body, c, previous);
}

/** Moves vector `v` toward `target` by at most `maxDelta`. */
function approach(v, target, maxDelta) {
  const diff = tmpTarget.subVectors(target, v);
  const len = diff.length();
  if (len <= maxDelta) return v.copy(target);
  return v.addScaledVector(diff, maxDelta / len);
}

/**
 * Ground steering on the tangent plane: turn the velocity toward `wish`
 * (quicker when slow), speed up or slow down toward `wishSpeed`, and skid
 * when asked to reverse at speed. Returns true while skidding.
 */
function steerGround(tangent, wish, wishSpeed, up, dt) {
  const speed = tangent.length();
  if (!wish || wishSpeed <= 0) {
    if (speed > 0) tangent.multiplyScalar(Math.max(0, speed - GROUND_DECEL * dt) / speed);
    return false;
  }
  if (speed < 0.5) {
    tangent.copy(wish).multiplyScalar(Math.min(wishSpeed, speed + GROUND_ACCEL * dt));
    return false;
  }

  const dir = tmpTarget.copy(tangent).divideScalar(speed);
  const cos = Math.max(-1, Math.min(1, dir.dot(wish)));
  if (cos < -0.5 && speed > 4) {
    tangent.multiplyScalar(Math.max(0, speed - SKID_DECEL * dt) / speed);
    return true;
  }

  const angle = Math.acos(cos);
  if (angle > 1e-4) {
    const sign = Math.sign(tmp.crossVectors(dir, wish).dot(up)) || 1;
    const rate = TURN_RATE + SLOW_TURN_BONUS * (1 - Math.min(1, speed / RUN_SPEED));
    dir.applyAxisAngle(up, sign * Math.min(angle, rate * dt));
  }
  const change = speed < wishSpeed ? GROUND_ACCEL : GROUND_DECEL;
  const next = speed < wishSpeed ? Math.min(wishSpeed, speed + change * dt) : Math.max(wishSpeed, speed - change * dt);
  tangent.copy(dir).multiplyScalar(next);
  return false;
}

/** Air control: steer a little, keep the momentum you had. */
function steerAir(tangent, wish, wishSpeed, dt) {
  if (!wish || wishSpeed <= 0) {
    const speed = tangent.length();
    if (speed > 0) tangent.multiplyScalar(Math.max(0, speed - AIR_DRAG * dt) / speed);
    return;
  }
  // Never let air control brake a faster run-up; only steer it.
  const target = tmpAir.copy(wish).multiplyScalar(Math.max(wishSpeed, Math.min(tangent.length(), RUN_SPEED * 1.2)));
  approach(tangent, target, AIR_ACCEL * dt);
}

/**
 * Take-off speed for the next jump: `chain` is the jump just before (0 none,
 * 1 single, 2 double), `sinceLanding` seconds on the ground since it,
 * `speed` the running speed. Returns { level (1..3), speed }.
 */
export function jumpFor(chain, sinceLanding, speed) {
  const continues = chain > 0 && chain < JUMP_CHAIN.length && sinceLanding <= CHAIN_WINDOW && speed >= CHAIN_MIN_SPEED;
  const level = continues ? chain + 1 : 1;
  const run = Math.min(1, speed / RUN_SPEED);
  return { level, speed: (JUMP_SPEED + RUN_JUMP_BONUS * run) * JUMP_CHAIN[level - 1] };
}

/**
 * One physics step for anything that walks on planets.
 *
 * body = { pos, vel, up, radius, height, onGround, planet }
 * wish = unit tangent direction the body wants to move in (may be null)
 * wishSpeed = 0..RUN_SPEED
 * opts.gravityScale scales gravity (held jump, spin float); opts.terminal
 * overrides the fall-speed cap (the ground pound drops faster).
 */
export function stepBody(body, wish, wishSpeed, planets, collidersOf, dt, opts = {}) {
  tmpPrevious.copy(body.pos);
  const src = pickGravitySource(body.pos, planets);
  body.planet = src;
  if (src) upAt(body.pos, src, body.up);

  const up = body.up;
  const vUp = body.vel.dot(up);
  const tangent = tmpTangent.copy(body.vel).addScaledVector(up, -vUp);

  // Intent is sampled once per rendered frame, but the surface normal
  // changes every physics tick on a small planet. Keep steering tangent.
  const direction = wish ? tangentDir(wish, up, tmpWish) : null;

  body.skidding = false;
  if (body.onGround) body.skidding = steerGround(tangent, direction, wishSpeed, up, dt);
  else steerAir(tangent, direction, wishSpeed, dt);

  const g = src ? GRAVITY * (src.gravityScale ?? 1) * (opts.gravityScale ?? 1) : 0;
  const vUpNext = Math.max(vUp - g * dt, -(opts.terminal ?? TERMINAL_FALL));
  body.vel.copy(tangent).addScaledVector(up, vUpNext);
  body.pos.addScaledVector(body.vel, dt);

  const wasOnGround = body.onGround;
  body.onGround = false;
  body.bumpedHead = false;
  if (!src) return body;
  if (src.heightAt) blockSteep(body, src);

  if (resolvePlanet(body.pos, body.vel, src)) {
    body.onGround = true;
  } else if (wasOnGround && heightAbove(body.pos, src) < SNAP_HEIGHT) {
    const nowUp = upAt(body.pos, src, tmpRadial);
    if (body.vel.dot(nowUp) <= 0.5) {
      body.pos.copy(src.center).addScaledVector(nowUp, groundRadius(src, nowUp));
      body.vel.addScaledVector(nowUp, -body.vel.dot(nowUp));
      body.onGround = true;
    }
  }

  const localUp = upAt(body.pos, src, tmpUp);
  for (const c of collidersOf(src)) {
    const hit = collide(body.pos, body.vel, body, c, localUp, tmpPrevious);
    if (hit === 'top') body.onGround = true;
    else if (hit === 'head') body.bumpedHead = true;
  }
  upAt(body.pos, src, body.up);
  return body;
}

/**
 * Terrain too steep to walk up is a wall: a step that would put the body
 * inside a rise steeper than STEEP is taken back sideways, and the part of
 * the velocity going uphill is dropped, so the body slides along the foot of
 * the slope (or down its face) instead of being lifted up it.
 */
function blockSteep(body, planet) {
  const rel = tmpGround.subVectors(body.pos, planet.center), d = rel.length();
  const now = tmpRadial.copy(rel).divideScalar(d);
  const ground = groundRadius(planet, now);
  if (d >= ground) return;
  const before = tmpTarget.subVectors(tmpPrevious, planet.center).normalize();
  const run = now.distanceTo(before) * planet.radius;
  if (run < 1e-5 || ground - groundRadius(planet, before) <= STEEP * run) return;
  const uphill = terrainSlope(planet, before, tmpAir);
  body.pos.copy(planet.center).addScaledVector(before, d);
  const len = uphill.length();
  if (len < 1e-6) return;
  uphill.divideScalar(len);
  const into = body.vel.dot(uphill);
  if (into > 0) body.vel.addScaledVector(uphill, -into);
}

/**
 * Quaternion that turns unit vector `from` a fraction `t` of the way to `to`.
 * Near-opposite vectors have no unique shortest rotation, so they turn about
 * `fallbackAxis` (must be perpendicular to `from`). For the camera that axis is
 * its right vector, which makes a gravity flip pitch the view over the top
 * instead of rolling it sideways.
 */
export function partialTurn(from, to, t, fallbackAxis, out = new Quaternion()) {
  if (from.dot(to) < -0.98) return out.setFromAxisAngle(fallbackAxis, Math.PI * t);
  tmpQ.setFromUnitVectors(from, to);
  return out.slerpQuaternions(identity, tmpQ, t);
}

/** Point on a cubic Bézier curve. */
export function bezier(p0, p1, p2, p3, t, out = new Vector3()) {
  const u = 1 - t;
  return out.copy(p0).multiplyScalar(u * u * u)
    .addScaledVector(p1, 3 * u * u * t)
    .addScaledVector(p2, 3 * u * t * t)
    .addScaledVector(p3, t * t * t);
}

/** Deterministic PRNG, so decoration is the same on every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
