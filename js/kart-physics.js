// Mirio: how Mirio's kart drives. Pure functions on a small state
// object, so tests/mirio-world.test.mjs can drive a kart without a screen.
//
// Gas and brake: an engine that pulls hard from standstill and runs out of
// breath near its top speed, air drag, rolling resistance, and the slope
// (downhill pulls, uphill holds back). The brake stops the kart and, held
// once it stands, backs it up.
//
// Steering turns the kart's body (`yaw`, radians relative to the road's
// direction, positive = pointing right) and the tyres pull the direction it
// travels (`course`) after it, quickly: a kart grips and goes where it
// points, and every bend can be taken on full gas. Braking into a turn at
// speed breaks the grip and the kart slides. A drift (jump held, or gas and
// brake together, while steering) carves an arc the stick tightens or
// widens, the body turned into the bend, and charges a mini-turbo that fires
// when it is let go. Sliding scrubs off speed.
//
// The road bends underneath (curvature, positive = bending right): a kart
// that does not steer runs wide towards the outer kerb, and the inside of a
// bend is shorter. A gentle assist turns it part of the way with the road
// and straightens it when the stick is let go, so a child who steers roughly
// the right way stays on it.

export const DRIVE = {
  // Engine: pull from standstill (u/s²), fading to nothing at `top`.
  engine: 21,
  top: 19,
  // Drag per speed², rolling resistance, and engine braking off the gas.
  drag: 0.009,
  roll: 0.6,
  engineBrake: 2.5,
  // Downhill pull per unit of slope (the track's slope: height lost per unit).
  slope: 13,
  brake: 26,
  reverse: 7,
  reverseTop: 5,
  // Boost pads and mini-turbos: extra pull, and the top speed while it lasts.
  boost: 34,
  boostTop: 26,
  // Steering: turn rate (rad/s), reached at `turnFullSpeed`; this share of it
  // at top speed (still enough for the tightest bend); more while braking.
  // In the air it turns this much less.
  turn: 2.4,
  turnFullSpeed: 5,
  turnAtTop: 0.85,
  brakeTurn: 1.3,
  steerResponse: 14,
  airTurn: 0.5,
  // Tyres: how fast the travel direction follows the body (1/s); braking
  // into a turn at speed lets it lag, a slide.
  grip: 22,
  slideGrip: 2.5,
  // Speed lost per second per unit of sideways slide, as a share of speed;
  // a drift is meant to slide and loses only this share of that.
  scrub: 0.9,
  driftScrub: 0.25,
  // Share of each bend the kart follows by itself, and how fast it
  // straightens without input.
  assist: 0.25,
  recenter: 1.2,
  maxYaw: 1.1,
  // Drift: needs this speed; the arc turns this fast, plus or minus the
  // stick's share; the body turns this far into it, following this fast.
  driftSpeed: 9,
  driftTurn: 1.2,
  driftSteer: 0.9,
  driftAngle: 0.45,
  bodyFollow: 10,
  // Seconds of drifting for a blue and an orange mini-turbo, and their length.
  charge: [0.6, 1.3],
  turbo: [0.6, 1.1],
  // Kerbs: faster than this into them bounces; slower scrapes along.
  wallHit: 4,
  wallKeep: 0.72,
  wallBounce: 0.5,
  scrape: 10,
  knockDecay: 5,
  // Finster-Mirio's kart is not driven with gas and brake: it heads for a
  // target speed, cruising plus the slope's share, within these bounds.
  cruise: 13.5,
  slopeGain: 27,
  slowest: 10,
  fastest: 21,
  aiAccel: 14,
  aiCoast: 6,
};

export function newKart() {
  return { s: 0, x: 0, v: 0, yaw: 0, course: 0, steer: 0, vx: 0, drift: 0, charge: 0, turbo: 0, scraping: false };
}

/** Mini-turbo level the current drift has charged: 0, 1 (blue) or 2 (orange). */
export function driftLevel(k) {
  return k.drift ? DRIVE.charge.filter((c) => k.charge >= c).length : 0;
}

/** How far the kart slides sideways: 0 = rolling straight, 1 = fully sideways. */
export function slideOf(k) {
  return Math.abs(Math.sin(k.yaw - k.course));
}

/** Finster-Mirio's cruising speed on a road with this `slope` (positive = downhill). */
export function targetSpeed(slope) {
  return Math.min(DRIVE.fastest, Math.max(DRIVE.slowest, DRIVE.cruise + DRIVE.slopeGain * slope));
}

/** Finster-Mirio's speed after `dt`: towards his target, or a boost's. */
export function approachSpeed(v, slope, dt, { pace = 1, boosting = false } = {}) {
  let target = targetSpeed(slope);
  if (boosting) target = Math.max(target, DRIVE.boostTop);
  target *= pace;
  if (v < target) return Math.min(target, v + DRIVE.aiAccel * dt);
  return Math.max(target, v - DRIVE.aiCoast * dt);
}

/**
 * Mirio's speed after `dt`. Forces that push (engine, slope, a boost, the
 * brake backing up) change it freely; forces that only resist (rolling,
 * engine braking, the brake) slow it towards standstill, never past it, so
 * a kart left alone stands still instead of rocking to and fro.
 */
function nextSpeed(v, throttle, brake, slope, boosting, dt) {
  const top = boosting ? DRIVE.boostTop : DRIVE.top;
  let push = DRIVE.slope * slope - DRIVE.drag * v * Math.abs(v) + (boosting ? DRIVE.boost * Math.max(0, 1 - v / top) : 0);
  let resist = DRIVE.roll;
  if (brake > 0) {
    // Rolling forwards it brakes; standing or rolling back, it reverses.
    if (v > 0.5) resist += DRIVE.brake * brake;
    else if (v > -DRIVE.reverseTop) push -= DRIVE.reverse * brake;
  } else if (throttle > 0) {
    // Rolling back, the gas brakes first.
    if (v < -0.5) resist += DRIVE.brake * throttle;
    else push += DRIVE.engine * throttle * Math.max(0, 1 - v / top);
  } else {
    resist += DRIVE.engineBrake;
  }
  const pushed = v + push * dt;
  return Math.sign(pushed) * Math.max(0, Math.abs(pushed) - resist * dt);
}

/**
 * One step of driving.
 *   k     kart state (newKart())
 *   ctl   { steer -1..1, throttle 0..1, brake 0..1, hold (jump held) }
 *   road  { curvature, slope, limit (|x| the kerbs allow) }
 *   dt    seconds
 *   opts  { boosting (a dash panel), airborne (keeps its speed, turns less) }
 * Returns an array of event names: 'drift', 'turbo', 'bump'.
 */
export function driveKart(k, ctl, road, dt, { boosting = false, airborne = false } = {}) {
  const events = [];
  const throttle = Math.max(0, Math.min(1, ctl.throttle ?? 0));
  const brake = Math.max(0, Math.min(1, ctl.brake ?? 0));
  const steer = Math.max(-1, Math.min(1, ctl.steer ?? 0));
  k.steer += (steer - k.steer) * (1 - Math.exp(-DRIVE.steerResponse * dt));
  k.turbo = Math.max(0, k.turbo - dt);

  // Drifting: starts on the ground (after the hop that holding jump begins
  // with) while steering at speed; ends on release, paying out the charge.
  if (!k.drift && !airborne && ctl.hold && Math.abs(steer) > 0.35 && k.v > DRIVE.driftSpeed) {
    k.drift = Math.sign(steer);
    k.charge = 0;
    events.push('drift');
  }
  if (k.drift && (!ctl.hold || k.v < DRIVE.driftSpeed * 0.6)) {
    const level = driftLevel(k);
    if (level > 0 && !ctl.hold) {
      k.turbo = DRIVE.turbo[level - 1];
      events.push('turbo');
    }
    k.drift = 0;
    k.charge = 0;
  }
  if (k.drift && !airborne) k.charge += dt;

  // Speed along the heading; sliding scrubs some off.
  if (!airborne) {
    k.v = nextSpeed(k.v, throttle, brake, road.slope, boosting || k.turbo > 0, dt);
    k.v -= DRIVE.scrub * (k.drift ? DRIVE.driftScrub : 1) * slideOf(k) * k.v * dt;
  }

  // Both angles are relative to the road, which bends away underneath.
  const speed = Math.abs(k.v);
  const along = k.v * Math.cos(k.course);
  const bend = road.curvature * along;
  const assist = DRIVE.assist * bend;
  const air = airborne ? DRIVE.airTurn : 1;
  if (k.drift) {
    // The stick steers the arc; the body turns into it.
    const carve = k.drift * (DRIVE.driftTurn + DRIVE.driftSteer * k.steer * k.drift);
    const offset = k.yaw - k.course;
    k.course = clampYaw(k.course + (carve * air + assist - bend) * dt);
    k.yaw = clampYaw(k.course + offset + (k.drift * DRIVE.driftAngle - offset) * (1 - Math.exp(-DRIVE.bodyFollow * dt)));
  } else {
    // The stick turns the body: faster when braking, a little slower at top
    // speed, the other way round when reversing. The tyres pull the travel
    // direction after it, unless braking into the turn at speed.
    const fade = Math.min(1, speed / DRIVE.turnFullSpeed) * (1 - (1 - DRIVE.turnAtTop) * Math.min(1, speed / DRIVE.top));
    const braking = brake > 0 && k.v > 0.5;
    let rate = k.steer * DRIVE.turn * fade * (braking ? DRIVE.brakeTurn : 1) * (k.v < 0 ? -1 : 1) * air + assist;
    if (Math.abs(steer) < 0.1) rate -= DRIVE.recenter * k.yaw;
    k.yaw = clampYaw(k.yaw + (rate - bend) * dt);
    const sliding = braking && Math.abs(k.steer) > 0.3 && k.v > DRIVE.driftSpeed;
    const grip = airborne ? 0 : sliding ? DRIVE.slideGrip : DRIVE.grip;
    k.course = clampYaw(k.course - bend * dt);
    k.course += (k.yaw - k.course) * (1 - Math.exp(-grip * dt));
  }

  // Position: across the road along the travel direction plus any knock,
  // along it faster on the inside of a bend (its length is the centre line).
  k.vx *= Math.exp(-DRIVE.knockDecay * dt);
  k.x += (k.v * Math.sin(k.course) + k.vx) * dt;
  k.s += (along * dt) / Math.max(0.6, 1 - road.curvature * k.x);

  // Kerbs.
  k.scraping = false;
  if (Math.abs(k.x) > road.limit) {
    const side = Math.sign(k.x);
    k.x = side * road.limit;
    const into = k.v * Math.sin(k.course) * side + k.vx * side;
    if (into > DRIVE.wallHit) {
      k.v *= DRIVE.wallKeep;
      k.yaw = -k.yaw * DRIVE.wallBounce;
      k.course = -k.course * DRIVE.wallBounce;
      k.vx = -side * 3;
      k.drift = 0;
      k.charge = 0;
      events.push('bump');
    } else {
      if (k.course * side > 0) k.course *= Math.exp(-10 * dt);
      if (k.yaw * side > 0) k.yaw *= Math.exp(-6 * dt);
      if (k.vx * side > 0) k.vx = 0;
      k.v -= Math.sign(k.v) * Math.min(Math.abs(k.v), DRIVE.scrape * dt);
      k.scraping = true;
    }
  }
  return events;
}

function clampYaw(yaw) {
  return Math.max(-DRIVE.maxYaw, Math.min(DRIVE.maxYaw, yaw));
}
