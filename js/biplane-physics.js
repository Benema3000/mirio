// A small toy biplane that follows one planet's surface. This is deliberately
// independent of rendering, input devices and the player character.
import { Quaternion, Vector3 } from 'three';
import { collide, surfacePoint, tangentDir } from './world.js';

export const FLIGHT = Object.freeze({
  hoverHeight: 0.65, maxAltitude: 4.5, ceiling: 4.5, speed: 13, boostSpeed: 18,
  boostTime: 1, boostCooldown: 3,
  acceleration: 13, braking: 18, turnRate: 2.8,
  climbSpeed: 3.2, descendSpeed: 3, heightResponse: 4, verticalResponse: 8,
  bank: 0.42, radius: 1.3, height: 2.4,
  collisionBounce: 0.18, bumpCooldown: 0.4,
  step: 1 / 120, maxFrame: 0.25,
});

const UP = new Vector3(0, 1, 0), FORWARD = new Vector3(0, 0, 1);
const normal = new Vector3(), horizontal = new Vector3(), wanted = new Vector3();
const heading = new Vector3(), axis = new Vector3(), delta = new Vector3();
const previous = new Vector3(), previousUp = new Vector3(), contactBefore = new Vector3();
const contactNormal = new Vector3(), checkPos = new Vector3(), checkVel = new Vector3();
const supportPos = new Vector3(), relative = new Vector3();
const transport = new Quaternion();
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const damp = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-rate * dt));

function safeHeading(direction, up, out) {
  if (direction && tangentDir(direction, up, out)) return out;
  out.copy(Math.abs(up.y) < 0.9 ? UP : FORWARD);
  return tangentDir(out, up, out);
}

/** pos is the lowest wheel point; the model's fuselage sits above it. */
export function createFlight(planet, dir, forward = FORWARD) {
  const up = dir.clone();
  if (up.lengthSq() < 1e-8) up.copy(UP);
  up.normalize();
  return {
    planet, pos: surfacePoint(planet, up, FLIGHT.hoverHeight), up,
    forward: safeHeading(forward, up, new Vector3()), vel: new Vector3(),
    radius: FLIGHT.radius, height: FLIGHT.height,
    altitude: FLIGHT.hoverHeight, speed: 0, bank: 0, pitch: 0,
    boost: 0, cooldown: 0, boostHeld: false, bumpCooldown: 0,
    state: 'flying', distance: 0,
  };
}

function overWater(planet, up) {
  if (!planet.water) return false;
  const latitude = Math.asin(clamp(up.y, -1, 1)) * 180 / Math.PI;
  return latitude > planet.water.minLat && latitude < planet.water.maxLat;
}

/** Legal support immediately below the wheels, not an automatic wall climb. */
function supportAt(body, colliders) {
  let support = 0;
  for (const c of colliders) {
    let altitude;
    if (c.kind === 'bump') {
      relative.subVectors(c.center, body.planet.center);
      const along = relative.dot(body.up);
      const discriminant = c.radius ** 2 - (relative.lengthSq() - along ** 2);
      if (discriminant < 0) continue;
      altitude = along + Math.sqrt(discriminant) - body.planet.radius;
    } else {
      const aligned = body.up.dot(c.axis);
      if (aligned < 0.5) continue;
      relative.subVectors(c.base, body.planet.center);
      altitude = (c.height + relative.dot(c.axis)) / aligned - body.planet.radius;
      surfacePoint(body.planet, body.up, altitude, supportPos);
      relative.subVectors(supportPos, c.base);
      const inside = c.kind === 'box'
        ? Math.abs(relative.dot(c.right)) < c.halfW + body.radius * 0.7 && Math.abs(relative.dot(c.forward)) < c.halfD + body.radius * 0.7
        : relative.addScaledVector(c.axis, -relative.dot(c.axis)).length() < c.radius + body.radius * 0.7;
      if (!inside) continue;
    }
    if (altitude > support && altitude <= body.altitude + 0.4 && altitude <= FLIGHT.maxAltitude) support = altitude;
  }
  return support;
}

// A top above the flight ceiling is a wall. Letting world.collide step up to
// it and then clamping down would otherwise leave the plane inside the prop.
function flightColliders(planet, colliders) {
  return colliders.map(c => {
    if (c.kind === 'bump') return c;
    const top = c.base.distanceTo(planet.center) + c.height - planet.radius;
    return top > FLIGHT.maxAltitude ? { ...c, height: c.height + FLIGHT.height + FLIGHT.maxAltitude } : c;
  });
}

function boundPosition(body, minimum) {
  normal.subVectors(body.pos, body.planet.center);
  const radius = normal.length();
  if (radius < 1e-8) normal.copy(body.up);
  else normal.divideScalar(radius);
  const altitude = clamp(radius - body.planet.radius, minimum, FLIGHT.maxAltitude);
  surfacePoint(body.planet, normal, altitude, body.pos);
  body.up.copy(normal);
  body.altitude = altitude;
}

function bump(body, events, impact) {
  if (body.bumpCooldown > 0) return;
  body.bumpCooldown = FLIGHT.bumpCooldown;
  events.push({ type: 'bump', pos: body.pos.clone(), speed: impact });
}

function flightContact(pos, vel, body, collider, previousPosition = null) {
  if (collider.kind !== 'bump') {
    const head = relative.subVectors(pos, collider.base).dot(collider.axis) + body.height;
    // A soft downward recoil at the exact underside is already separating.
    // Floating-point dust must not reinterpret it as a deep side collision.
    if (head <= 1e-5 && vel.dot(collider.axis) <= 0) return null;
  }
  return collide(pos, vel, body, collider, body.up, previousPosition);
}

/**
 * intent: {direction: camera-relative world vector, throttle:0..1,
 *          climb, descend, boost}. Descend also brakes for a safe landing.
 * Held climb rises; releasing settles to a low hover. Held descend lands
 * on dry ground. Water always preserves at least hoverHeight clearance.
 * Returns boost/bump/land/takeoff events. The supplied planet never changes.
 */
export function stepFlight(body, intent = {}, colliders = [], dt = 0) {
  const events = [];
  if (!(dt > 0) || !Number.isFinite(dt)) return events;
  dt = Math.min(dt, FLIGHT.maxFrame);
  const descend = Boolean(intent.descend);
  const throttle = descend ? 0 : clamp(intent.throttle ?? 0, 0, 1);
  if (intent.boost && !body.boostHeld && body.cooldown <= 0 && !descend) {
    body.boost = FLIGHT.boostTime;
    body.cooldown = FLIGHT.boostCooldown;
    events.push({ type: 'boost', pos: body.pos.clone() });
  }
  body.boostHeld = Boolean(intent.boost);
  if (descend) body.boost = 0;
  const obstacles = flightColliders(body.planet, colliders);
  const count = Math.max(1, Math.ceil(dt / FLIGHT.step));
  const h = dt / count;
  for (let step = 0; step < count; step++) {
    body.boost = Math.max(0, body.boost - h);
    body.cooldown = Math.max(0, body.cooldown - h);
    body.bumpCooldown = Math.max(0, body.bumpCooldown - h);
    boundPosition(body, overWater(body.planet, body.up) ? FLIGHT.hoverHeight : 0);
    previous.copy(body.pos);
    previousUp.copy(body.up);
    safeHeading(body.forward, body.up, body.forward);
    const support = supportAt(body, colliders);
    const water = overWater(body.planet, body.up);
    const targetAltitude = descend ? Math.max(support, water ? FLIGHT.hoverHeight : 0)
      : intent.climb ? FLIGHT.maxAltitude : Math.min(FLIGHT.maxAltitude, support + FLIGHT.hoverHeight);
    const desiredVertical = clamp((targetAltitude - body.altitude) * FLIGHT.heightResponse, -FLIGHT.descendSpeed, FLIGHT.climbSpeed);
    const vertical = damp(clamp(body.vel.dot(body.up), -FLIGHT.descendSpeed, FLIGHT.climbSpeed), desiredVertical, FLIGHT.verticalResponse, h);
    horizontal.copy(body.vel).addScaledVector(body.up, -body.vel.dot(body.up));
    const wantedSpeed = body.boost > 0 ? FLIGHT.boostSpeed : throttle * FLIGHT.speed;
    safeHeading(intent.direction ?? body.forward, body.up, heading);
    const turn = Math.atan2(axis.crossVectors(body.forward, heading).dot(body.up), clamp(body.forward.dot(heading), -1, 1));
    const yaw = clamp(turn, -FLIGHT.turnRate * h, FLIGHT.turnRate * h);
    body.forward.applyAxisAngle(body.up, yaw).normalize();
    wanted.copy(body.forward).multiplyScalar(wantedSpeed);
    delta.subVectors(wanted, horizontal);
    const acceleration = wantedSpeed < horizontal.length() ? FLIGHT.braking : FLIGHT.acceleration;
    horizontal.addScaledVector(delta, Math.min(1, acceleration * h / (delta.length() || 1)));
    // Great-circle transport prevents artificial lift and pole singularities.
    const travel = horizontal.length() * h;
    if (travel > 1e-8) {
      axis.crossVectors(body.up, horizontal).normalize();
      transport.setFromAxisAngle(axis, travel / (body.planet.radius + body.altitude));
      body.up.applyQuaternion(transport).normalize();
      body.forward.applyQuaternion(transport).normalize();
      horizontal.applyQuaternion(transport);
    }
    const minimum = overWater(body.planet, body.up) ? FLIGHT.hoverHeight : 0;
    const nextAltitude = clamp(body.altitude + vertical * h, minimum, FLIGHT.maxAltitude);
    surfacePoint(body.planet, body.up, nextAltitude, body.pos);
    body.vel.copy(horizontal).addScaledVector(body.up, vertical);
    // Two passes settle corners and terrain pushed back to the height cap.
    for (let pass = 0; pass < 2; pass++) {
      for (const c of obstacles) {
        contactBefore.copy(body.pos);
        const impact = body.vel.length();
        const hit = flightContact(body.pos, body.vel, body, c, previous);
        if (hit === 'side' || hit === 'head') {
          contactNormal.subVectors(body.pos, contactBefore);
          if (contactNormal.lengthSq() > 1e-10) {
            contactNormal.normalize();
            body.vel.addScaledVector(contactNormal, Math.min(impact, 6) * FLIGHT.collisionBounce);
          }
          if (impact > 0.8) bump(body, events, impact);
        }
      }
      boundPosition(body, minimum);
    }
    // A steep hill or an unusual overlapping prop must never push the
    // aircraft through its ceiling. Stay at the last legal point instead.
    const blocked = obstacles.some(c => {
      checkPos.copy(body.pos); checkVel.copy(body.vel);
      flightContact(checkPos, checkVel, body, c);
      return checkPos.distanceToSquared(body.pos) > 1e-5;
    });
    if (blocked) {
      body.pos.copy(previous); body.up.copy(previousUp);
      body.vel.copy(horizontal).multiplyScalar(-FLIGHT.collisionBounce);
      bump(body, events, horizontal.length());
      boundPosition(body, overWater(body.planet, body.up) ? FLIGHT.hoverHeight : 0);
    }
    safeHeading(body.forward, body.up, body.forward);
    const verticalAfter = clamp(body.vel.dot(body.up), -FLIGHT.descendSpeed, FLIGHT.climbSpeed);
    horizontal.copy(body.vel).addScaledVector(body.up, -body.vel.dot(body.up));
    body.vel.copy(horizontal).addScaledVector(body.up,
      body.altitude >= FLIGHT.maxAltitude && verticalAfter > 0 ? 0 : verticalAfter);
    const floor = supportAt(body, colliders);
    const landed = descend && !overWater(body.planet, body.up) && body.altitude - floor < 0.025;
    if (landed) {
      surfacePoint(body.planet, body.up, floor, body.pos);
      body.altitude = floor;
      body.vel.copy(horizontal);
    }
    const state = landed ? 'landed' : 'flying';
    if (state !== body.state) events.push({ type: landed ? 'land' : 'takeoff', pos: body.pos.clone() });
    body.state = state;
    body.speed = horizontal.length();
    body.bank = damp(body.bank, -yaw / h / FLIGHT.turnRate * FLIGHT.bank * Math.min(1, body.speed / 5), 6, h);
    // Positive pitch means nose-up; the +Z-facing model renders it as negative X rotation.
    body.pitch = damp(body.pitch, clamp(Math.atan2(body.vel.dot(body.up), Math.max(4, body.speed)), -0.32, 0.35), 6, h);
    body.distance += previousUp.angleTo(body.up) * (body.planet.radius + body.altitude);
  }
  return events;
}
