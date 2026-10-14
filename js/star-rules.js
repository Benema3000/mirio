// Der Raketenritt's flight: Mirio on Miro's rocket, through the asteroids to
// the Riesenstern. Pure rules, no screen; the scene is star-run.js, which
// takes over on the star (star-level.js, krakel-rules.js).
//
// The lane is fast. Golden rings mark a line through it: each one fires a
// burst of speed and adds to a chain. Three asteroid belts wall the lane off
// but for one gap, where a ring waits; drifters swing across it. Stars shot
// from the rocket break asteroids (big ones take three) and chase off the
// Zischer (Miro's black one-eyed rocket creatures), who come in five waves,
// hold in front of the rocket and throw sparks back. A roll protects; a
// bump costs time and the chain. Three checkpoints.
//
// Positions: `s` along the lane, `x` right, `y` up.

export const FLIGHT = Object.freeze({
  length: 1850, cruise: 40, slowSpeed: 22, burstSpeed: 56, burst: 0.9, width: 11, height: 7,
  lateralSpeed: 13, verticalSpeed: 10,
  checkpoints: Object.freeze([460, 920, 1380]),
  belts: Object.freeze([560, 1060, 1560]),
  ringRadius: 2.6,
  // Stars fly this much faster than the rocket, for `shotLife` seconds.
  shotSpeed: 90, shotLife: 1, shotCooldown: 0.14, shotReach: 1,
  rollDuration: 0.7, rollCooldown: 1.8,
  bumpPenalty: 2, rescuePenalty: 2, invulnerable: 1.4, slow: 0.9,
  // Zischer arrive from far ahead, hold `hold` seconds in front, then leave.
  zischerRadius: 1.4, zischerHold: 5.5, zischerAhead: 34, zischerArrive: 1.3,
  sparkEvery: 1.7, sparkSpeed: 12, sparkRadius: 0.7,
  step: 1 / 120, maxFrame: 0.25,
});

export const LANDING = Object.freeze({ duration: 3.4 });

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = v => (Number.isFinite(v) ? v : 0);
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
// Where each belt's gap (and its ring) is: [x, y].
const GAPS = Object.freeze([[-6, 3], [7, -3.5], [0, 4.5]]);

/** Rings, asteroids (with the belts and drifters) and Zischer waves, the same every time. */
export function makeStarCourse() {
  const rings = [], asteroids = [], zischer = [];
  const ring = (s, x, y) => rings.push({ id: `ring-${rings.length}`, s, x, y });
  // The ring line weaves across the lane; in a belt it runs through the gap.
  for (let i = 0, s = 70; s < FLIGHT.length - 40; i++, s += 30) {
    if (FLIGHT.belts.some(b => Math.abs(b - s) < 15)) continue;
    const ramp = Math.min(1, i / 4);
    ring(s, Math.sin(s / 95) * 7.5 * ramp, Math.sin(s / 61) * 4 * ramp);
  }
  FLIGHT.belts.forEach((b, i) => ring(b, ...GAPS[i]));
  rings.sort((a, b) => a.s - b.s);
  const ringAt = s => rings.reduce((best, r) => (Math.abs(r.s - s) < Math.abs(best.s - s) ? r : best));
  const add = (s, x, y, extra = {}) => asteroids.push({ id: `asteroid-${asteroids.length}`, s, x, y, big: false, hp: 1, radius: 1.4,
    spin: 0.4 + (asteroids.length % 4) * 0.25, drift: 0.5, sweep: 0, phase: asteroids.length * 1.7, ...extra });
  // Loose rocks, kept off the ring line and the checkpoints.
  for (let i = 0, s = 120; s < FLIGHT.length - 60; i++, s += 21) {
    if (FLIGHT.belts.some(b => Math.abs(b - s) < 30) || FLIGHT.checkpoints.some(c => Math.abs(c - s) < 20)) continue;
    const r = ringAt(s), big = i % 6 === 3, kind = big ? { big, hp: 3, radius: 2.8, drift: 0.3 } : { radius: 1.2 + (i % 3) * 0.3 };
    // Every fifth is a drifter, swinging right across the lane.
    if (!big && i % 5 === 1) { add(s, 0, clamp(r.y - 2.5, -FLIGHT.height + 1, FLIGHT.height - 1), { sweep: 8, radius: 1.6 }); continue; }
    // Beside the ring line, never on it: if the lane's edge is too close, the other side.
    const clear = kind.radius + (kind.drift ?? 0.5) + FLIGHT.ringRadius + 0.8 + (i % 3) * 1.4;
    let side = i % 2 ? 1 : -1;
    if (Math.abs(r.x + side * clear) > FLIGHT.width - 1) side = -side;
    add(s, r.x + side * clear, clamp(r.y + ((i % 4) - 1.5) * 1.2, -FLIGHT.height + 1, FLIGHT.height - 1), kind);
  }
  // Belts: a wall of rocks across the whole lane but for the gap round its ring.
  FLIGHT.belts.forEach((b, i) => {
    const [gx, gy] = GAPS[i];
    for (let x = -FLIGHT.width; x <= FLIGHT.width + 0.01; x += 3.2) {
      for (let y = -FLIGHT.height; y <= FLIGHT.height + 0.01; y += 3.2) {
        if (Math.hypot(x - gx, y - gy) < 4.2) continue;
        add(b + Math.abs(Math.round(x * 7 + y * 3)) % 3, x, y, { radius: 1.55, drift: 0.15, belt: true });
      }
    }
  });
  for (const [wave, s] of [280, 700, 840, 1220, 1650].entries()) {
    const count = wave === 0 ? 2 : 3;
    for (let k = 0; k < count; k++) {
      zischer.push({ id: `zischer-${wave}-${k}`, wave, s, x: (k - (count - 1) / 2) * 6, y: wave % 2 ? 2.5 : -1.5, phase: k * 2.1 + wave });
    }
  }
  return { length: FLIGHT.length, checkpoints: FLIGHT.checkpoints, belts: FLIGHT.belts, rings, asteroids, zischer };
}

export function createStarRun() {
  return {
    status: 'playing', phase: 'flight', time: 0, elapsed: 0, penalty: 0, phaseTime: 0,
    s: 0, x: 0, y: 0, vx: 0, vy: 0, speed: FLIGHT.cruise, checkpoint: 0,
    roll: 0, rollCooldown: 0, shotCooldown: 0, invulnerable: 0, slow: 0, burst: 0,
    shots: [], sparks: [], nextShot: 0, nextSpark: 0,
    asteroidHp: new Map(), broken: new Set(), passed: new Set(), ringsPassed: new Set(), ringsTaken: new Set(),
    zischerState: new Map(), chased: new Set(),
    asteroids: 0, zapped: 0, bumps: 0, combo: 0, bestCombo: 0,
  };
}

/** Where a flight asteroid is at `time`: it wobbles round its spot; a drifter swings across the lane. */
export function asteroidPosition(asteroid, time) {
  return {
    x: asteroid.x + Math.sin(time * 0.5 + asteroid.phase) * asteroid.drift + Math.sin(time * 0.9 + asteroid.phase) * asteroid.sweep,
    y: asteroid.y + Math.cos(time * 0.4 + asteroid.phase) * asteroid.drift * 0.6,
  };
}

/**
 * A flying Zischer's position and its route distance, or null when it has
 * not come yet or has flown off. They arrive from far ahead, hold a fixed
 * distance in front of the rocket and weave, then shoot away.
 */
export function zischerPosition(zischer, state, runS) {
  if (!state || state.gone) return null;
  const t = state.age;
  const arrive = clamp(t / FLIGHT.zischerArrive, 0, 1), leave = clamp(t - FLIGHT.zischerHold, 0, 1);
  return {
    s: runS + FLIGHT.zischerAhead + (1 - arrive) * 70 + leave * 110,
    x: clamp(zischer.x + Math.sin(t * 1.6 + zischer.phase) * 2.8, -FLIGHT.width, FLIGHT.width),
    y: clamp(zischer.y + Math.sin(t * 2.2 + zischer.phase) * 1.5, -FLIGHT.height, FLIGHT.height),
  };
}

function bump(run, events, from) {
  run.slow = FLIGHT.slow;
  run.burst = 0;
  run.invulnerable = FLIGHT.invulnerable;
  run.time += FLIGHT.bumpPenalty;
  run.penalty += FLIGHT.bumpPenalty;
  run.bumps++;
  run.combo = 0;
  run.vx += (Math.sign(run.x - from.x) || 1) * 2.5;
  events.push({ type: 'planeBump', penalty: FLIGHT.bumpPenalty });
}

function stepFlight(run, course, h, x, y, events) {
  for (const key of ['roll', 'rollCooldown', 'shotCooldown', 'invulnerable', 'slow', 'burst']) run[key] = Math.max(0, run[key] - h);
  run.vx = damp(run.vx, x * FLIGHT.lateralSpeed, 12, h);
  run.vy = damp(run.vy, y * FLIGHT.verticalSpeed, 12, h);
  run.x = clamp(run.x + run.vx * h, -FLIGHT.width, FLIGHT.width);
  run.y = clamp(run.y + run.vy * h, -FLIGHT.height, FLIGHT.height);
  run.speed = damp(run.speed, run.slow > 0 ? FLIGHT.slowSpeed : run.burst > 0 ? FLIGHT.burstSpeed : FLIGHT.cruise, 5, h);
  const before = run.s, advance = Math.min(run.speed * h, course.length - run.s);
  run.s += advance;
  const protectedNow = run.invulnerable > 0 || run.roll > 0;

  // Rings: through one is a burst and the chain grows; past one breaks the chain.
  for (const r of course.rings) {
    if (run.ringsPassed.has(r.id) || r.s < before || r.s > run.s) continue;
    run.ringsPassed.add(r.id);
    if (Math.hypot(run.x - r.x, run.y - r.y) > FLIGHT.ringRadius) { run.combo = 0; continue; }
    if (run.ringsTaken.has(r.id)) continue;
    run.ringsTaken.add(r.id);
    run.burst = FLIGHT.burst;
    run.combo++;
    run.bestCombo = Math.max(run.bestCombo, run.combo);
    events.push({ type: 'ring', id: r.id, combo: run.combo });
  }

  // Zischer: wake when their wave comes up, age, and throw sparks.
  for (const z of course.zischer) {
    let state = run.zischerState.get(z.id);
    if (!state && run.s >= z.s - 40 && !run.chased.has(z.id)) {
      state = { age: 0, gone: false, sparkIn: 1.2 + z.phase % 1 };
      run.zischerState.set(z.id, state);
    }
    if (!state || state.gone) continue;
    state.age += h;
    if (state.age > FLIGHT.zischerHold + 1) { state.gone = true; continue; }
    state.sparkIn -= h;
    if (state.sparkIn <= 0 && state.age < FLIGHT.zischerHold) {
      state.sparkIn = FLIGHT.sparkEvery;
      const p = zischerPosition(z, state, run.s);
      // Thrown at where the rocket is now: easy to read and to dodge.
      run.sparks.push({ id: run.nextSpark++, s: p.s, x: p.x, y: p.y, tx: run.x, ty: run.y, from: p.s, cx: p.x, cy: p.y });
      events.push({ type: 'spark' });
    }
  }

  // Stars from the rocket.
  for (const shot of run.shots) {
    shot.s += (run.speed + FLIGHT.shotSpeed) * h;
    shot.life -= h;
    for (const a of course.asteroids) {
      if (shot.life <= 0 || run.broken.has(a.id) || Math.abs(a.s - shot.s) > a.radius + 2) continue;
      const p = asteroidPosition(a, run.elapsed);
      if (Math.hypot(p.x - shot.x, p.y - shot.y) > a.radius + FLIGHT.shotReach) continue;
      shot.life = 0;
      const hp = (run.asteroidHp.get(a.id) ?? a.hp) - 1;
      run.asteroidHp.set(a.id, hp);
      if (hp > 0) { events.push({ type: 'bump', id: a.id, hp }); continue; }
      run.broken.add(a.id);
      run.asteroids++;
      events.push({ type: 'slam', id: a.id, big: a.big, asteroids: run.asteroids });
    }
    for (const z of course.zischer) {
      const state = run.zischerState.get(z.id), p = zischerPosition(z, state, run.s);
      if (shot.life <= 0 || !p || Math.abs(p.s - shot.s) > 3) continue;
      if (Math.hypot(p.x - shot.x, p.y - shot.y) > FLIGHT.zischerRadius + FLIGHT.shotReach) continue;
      shot.life = 0;
      state.gone = true;
      run.chased.add(z.id);
      run.zapped++;
      events.push({ type: 'enemyDefeat', id: z.id, zapped: run.zapped, at: p });
    }
  }
  run.shots = run.shots.filter(shot => shot.life > 0);

  // Sparks drift back towards where they were aimed; the rocket flies into them.
  for (const spark of run.sparks) {
    spark.s -= FLIGHT.sparkSpeed * h;
    const k = clamp((spark.from - spark.s) / Math.max(1, spark.from - run.s), 0, 1);
    spark.cx = spark.x + (spark.tx - spark.x) * k;
    spark.cy = spark.y + (spark.ty - spark.y) * k;
    if (spark.s > run.s) continue;
    spark.done = true;
    if (!protectedNow && Math.hypot(spark.cx - run.x, spark.cy - run.y) < FLIGHT.sparkRadius + 0.6) bump(run, events, { x: spark.cx, y: spark.cy });
  }
  run.sparks = run.sparks.filter(spark => !spark.done);

  // Asteroids the rocket passes through.
  for (const a of course.asteroids) {
    if (run.passed.has(a.id) || a.s < before || a.s > run.s) continue;
    run.passed.add(a.id);
    if (run.broken.has(a.id) || run.invulnerable > 0 || run.roll > 0) continue;
    const p = asteroidPosition(a, run.elapsed);
    if (Math.hypot(p.x - run.x, p.y - run.y) > a.radius + 0.7) continue;
    bump(run, events, p);
  }
  for (const [i, checkpoint] of course.checkpoints.entries()) {
    if (run.checkpoint >= i + 1 || checkpoint < before || run.s < checkpoint) continue;
    run.checkpoint = i + 1;
    events.push({ type: 'checkpoint', checkpoint: run.checkpoint });
  }
  if (run.s >= course.length) {
    run.phase = 'landing';
    run.phaseTime = 0;
    run.shots = [];
    run.sparks = [];
    events.push({ type: 'arrive' });
  }
}

/** One step of the flight and the landing. Controls: {x, y, jump, action} as main.js passes them. */
export function stepStarFlight(run, course, dt, controls = {}) {
  const events = [];
  if (run.status !== 'playing' || !['flight', 'landing'].includes(run.phase) || !Number.isFinite(dt) || dt <= 0) return events;
  dt = Math.min(FLIGHT.maxFrame, dt);
  let x = clamp(finite(controls.x), -1, 1), y = clamp(finite(controls.y), -1, 1);
  const magnitude = Math.hypot(x, y);
  if (magnitude > 1) { x /= magnitude; y /= magnitude; }
  if (run.phase === 'flight') {
    if (controls.action && run.shotCooldown <= 0) {
      run.shotCooldown = FLIGHT.shotCooldown;
      run.shots.push({ id: run.nextShot++, s: run.s + 1.5, x: run.x, y: run.y, life: FLIGHT.shotLife });
      events.push({ type: 'zap' });
    }
    if (controls.jump && run.rollCooldown <= 0) {
      run.roll = FLIGHT.rollDuration;
      run.rollCooldown = FLIGHT.rollCooldown;
      events.push({ type: 'spin' });
    }
  }
  const count = Math.ceil(dt / FLIGHT.step), h = dt / count;
  for (let n = 0; n < count && run.phase !== 'star'; n++) {
    run.elapsed += h;
    run.phaseTime += h;
    run.time += h;
    if (run.phase === 'flight') stepFlight(run, course, h, x, y, events);
    else if (run.phaseTime >= LANDING.duration) { run.phase = 'star'; run.phaseTime = 0; events.push({ type: 'land' }); }
  }
  return events;
}

/** The rescue button in the flight: back to the last checkpoint, two seconds on. */
export function rescueStarFlight(run, course) {
  if (run.status !== 'playing' || run.phase !== 'flight') return [];
  run.s = course.checkpoints[run.checkpoint - 1] ?? 0;
  run.x = run.y = run.vx = run.vy = 0;
  run.speed = FLIGHT.cruise;
  run.roll = run.slow = run.burst = 0;
  run.combo = 0;
  run.shots = [];
  run.sparks = [];
  run.invulnerable = 2;
  run.time += FLIGHT.rescuePenalty;
  run.penalty += FLIGHT.rescuePenalty;
  skipBehind(run, course);
  return [{ type: 'checkpoint', rescued: true, penalty: FLIGHT.rescuePenalty }];
}

/** What lies behind run.s is passed; Zischer behind are gone, those ahead come again. */
function skipBehind(run, course) {
  run.passed = new Set(course.asteroids.filter(a => a.s < run.s).map(a => a.id));
  run.ringsPassed = new Set(course.rings.filter(r => r.s < run.s).map(r => r.id));
  for (const z of course.zischer) {
    if (z.s < run.s) run.zischerState.set(z.id, { age: 99, gone: true, sparkIn: 0 });
    else if (!run.chased.has(z.id)) run.zischerState.delete(z.id);
  }
}

/** Test navigation only: no rewards, checkpoint credit or finish. */
export function seekStarFlight(run, course, fraction) {
  run.phase = 'flight';
  run.s = clamp(finite(fraction), 0, 0.999) * course.length;
  run.x = run.y = run.vx = run.vy = 0;
  run.shots = [];
  run.sparks = [];
  skipBehind(run, course);
}

export function flightSnapshot(run, course) {
  return {
    distance: run.s, x: run.x, y: run.y, speed: run.speed, roll: run.roll, rollCooldown: run.rollCooldown, burst: run.burst,
    checkpoint: run.checkpoint, checkpoints: course.checkpoints.length,
    asteroids: run.asteroids, totalAsteroids: course.asteroids.length, zapped: run.zapped, bumps: run.bumps,
    rings: run.ringsTaken.size, totalRings: course.rings.length, combo: run.combo, bestCombo: run.bestCombo,
  };
}
