// Der Raketenritt: Miro's third set of drawings. Pure rules, no screen; the
// scene is star-run.js.
//
//   flight  Mirio sits on Miro's rocket and flies through an asteroid field.
//           Stars shot from the rocket break asteroids and chase off the
//           Zischer (Miro's black one-eyed rocket creatures), who fly ahead
//           and throw sparks back. A roll protects. Three checkpoints.
//   landing The rocket comes down on the Riesenstern, Miro's star.
//   climb   Krakel, Miro's blue monster, stands on the star on three long
//           arms. Mirio climbs each arm from the claw to the shoulder: Krakel
//           shakes waves down the arm (jump them, or slide back down), and
//           Zischer hover in the way (whirl them off). At the shoulder a
//           tickle spot glows; tickle it and the arm curls up. After three
//           arms Krakel bows, and the last climb goes up over its head.
//   cheer   Krakel laughs and gives up the crystal; the clock has stopped.
//
// Flight positions: `s` along the route, `x` right, `y` up. Climb positions:
// `s` from the claw up the arm, `x` across it, `z` above its surface.

export const FLIGHT = Object.freeze({
  length: 1500, cruise: 27, slowSpeed: 14, width: 10, height: 6.5,
  lateralSpeed: 10, verticalSpeed: 8,
  checkpoints: Object.freeze([375, 750, 1125]),
  // Stars fly this much faster than the rocket, for `shotLife` seconds.
  shotSpeed: 75, shotLife: 1.15, shotCooldown: .16, shotReach: .9,
  rollDuration: .8, rollCooldown: 2.2,
  bumpPenalty: 2, rescuePenalty: 2, invulnerable: 1.6, slow: 1,
  // Zischer arrive from far ahead, hold `hold` seconds in front, then leave.
  zischerRadius: 1.25, zischerHold: 7, zischerAhead: 30, zischerArrive: 1.6,
  sparkEvery: 2.4, sparkSpeed: 9, sparkRadius: .7,
  step: 1 / 120, maxFrame: .25,
});

export const LANDING = Object.freeze({duration: 3.6});

export const CLIMB = Object.freeze({
  speed: 3.8, backSpeed: 2.5, lateralSpeed: 4, width: 1.1,
  jumpSpeed: 7.6, gravity: 22,
  // Above this, a wave passes underneath.
  waveClear: .45, waveSpeed: 11, waveWarning: .75, knockback: 5, stun: .5, invulnerable: 1,
  // A Zischer wakes when Mirio is this far below it; a whirl reaches this far.
  zischerWake: 8, whirlReach: 2.4, hitReach: 1, hitHeight: 1.2,
  // Standing this close to the top is standing on the tickle spot.
  spot: 1.2, tickleCooldown: .35,
  // Seconds of the curling arm flinging Mirio to the next claw.
  switchTime: 1.4, rescuePenalty: 2, cheer: 2.4,
});

/**
 * The four climbs: three arms, then the head. Lengths are along the arm in
 * metres and must match the shapes in star-run.js (krakelPath). Waves come
 * every `waveEvery` seconds; `zischer` are distances up the arm.
 */
export const STAGES = Object.freeze([
  Object.freeze({id: 'arm-left', name: 'Linker Arm', length: 27, waveEvery: 2.8, tickles: 3, zischer: Object.freeze([])}),
  Object.freeze({id: 'arm-middle', name: 'Mittlerer Arm', length: 27, waveEvery: 2.4, tickles: 3, zischer: Object.freeze([14])}),
  Object.freeze({id: 'arm-right', name: 'Rechter Arm', length: 27, waveEvery: 2.1, tickles: 4, zischer: Object.freeze([9, 18])}),
  Object.freeze({id: 'head', name: 'Krakels Kopf', length: 19, waveEvery: 1.9, tickles: 5, zischer: Object.freeze([10])}),
]);

// Share of the progress bar each part takes.
const SHARE = Object.freeze({flight: .55, landing: .05});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = v => (Number.isFinite(v) ? v : 0);
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

/** Asteroids and Zischer waves, laid out the same way every time. */
export function makeStarCourse() {
  const asteroids = [];
  for (let i = 0; i < 46; i++) {
    let s = 90 + i * 29.5;
    // Nothing sits on a checkpoint, where a rescue puts the rocket back.
    for (const checkpoint of FLIGHT.checkpoints) if (Math.abs(s - checkpoint) < 18) s = checkpoint + 20;
    const big = i % 5 === 2;
    const ramp = Math.min(1, i / 6);
    asteroids.push({id: `asteroid-${i}`, s, big, hp: big ? 3 : 1, radius: big ? 2.6 : 1.3 + (i % 3) * .25,
      x: clamp(Math.sin(i * 2.17) * 7.5 * ramp, -8.5, 8.5), y: clamp(Math.cos(i * 1.31) * 4.5 * ramp, -5, 5),
      spin: .4 + (i % 4) * .2, drift: big ? .4 : .8, phase: i * 1.7});
  }
  const zischer = [];
  for (const [wave, s] of [260, 640, 980, 1290].entries()) {
    const count = wave === 0 ? 2 : 3;
    for (let k = 0; k < count; k++) {
      zischer.push({id: `zischer-${wave}-${k}`, wave, s, x: (k - (count - 1) / 2) * 5.5, y: wave % 2 ? 2 : -1.5, phase: k * 2.1 + wave});
    }
  }
  return {length: FLIGHT.length, checkpoints: FLIGHT.checkpoints, asteroids, zischer, stages: STAGES};
}

function freshClimb() {
  return {stage: 0, s: 0, x: 0, z: 0, vz: 0, grounded: true, stun: 0, invulnerable: 0,
    tickles: 0, tickleCooldown: 0, waveClock: 0, warning: 0, waves: [], zischer: [], switching: 0};
}

export function createStarRun() {
  return {status: 'playing', phase: 'flight', time: 0, elapsed: 0, penalty: 0, phaseTime: 0,
    // Flight
    s: 0, x: 0, y: 0, vx: 0, vy: 0, speed: FLIGHT.cruise, checkpoint: 0,
    roll: 0, rollCooldown: 0, shotCooldown: 0, invulnerable: 0, slow: 0,
    shots: [], sparks: [], nextShot: 0, nextSpark: 0,
    asteroidHp: new Map(), broken: new Set(), passed: new Set(),
    zischerState: new Map(), chased: new Set(),
    asteroids: 0, zapped: 0, bumps: 0, jumpHeld: false, actionHeld: false,
    // Climb
    climb: freshClimb(), armsDown: 0, shaken: 0, whirled: 0};
}

/** Where a flight asteroid is at `time`: it wobbles a little round its spot. */
export function asteroidPosition(asteroid, time) {
  return {x: asteroid.x + Math.sin(time * .5 + asteroid.phase) * asteroid.drift,
    y: asteroid.y + Math.cos(time * .4 + asteroid.phase) * asteroid.drift * .6};
}

/**
 * A flying Zischer's position and its route distance at `time`, or null when
 * it has not come yet or has flown off. They arrive from far ahead, hold a
 * fixed distance in front of the rocket and weave, then shoot away.
 */
export function zischerPosition(zischer, state, runS) {
  if (!state || state.gone) return null;
  const t = state.age;
  const arrive = clamp(t / FLIGHT.zischerArrive, 0, 1), leave = clamp((t - FLIGHT.zischerHold) / 1.2, 0, 1);
  const ahead = FLIGHT.zischerAhead + (1 - arrive) * 60 + leave * 90;
  return {s: runS + ahead,
    x: clamp(zischer.x + Math.sin(t * 1.3 + zischer.phase) * 2.2, -FLIGHT.width, FLIGHT.width),
    y: clamp(zischer.y + Math.sin(t * 1.9 + zischer.phase) * 1.2, -FLIGHT.height, FLIGHT.height)};
}

function flightProgress(run, course) { return clamp(run.s / course.length, 0, 1); }

function bump(run, events, penalty, from) {
  run.slow = FLIGHT.slow;
  run.invulnerable = FLIGHT.invulnerable;
  run.time += penalty;
  run.penalty += penalty;
  run.bumps++;
  run.vx += (Math.sign(run.x - from.x) || 1) * 2;
  events.push({type: 'planeBump', penalty});
}

function stepFlight(run, course, h, x, y, events) {
  for (const key of ['roll', 'rollCooldown', 'shotCooldown', 'invulnerable', 'slow']) run[key] = Math.max(0, run[key] - h);
  run.vx = damp(run.vx, x * FLIGHT.lateralSpeed, 12, h);
  run.vy = damp(run.vy, y * FLIGHT.verticalSpeed, 12, h);
  run.x = clamp(run.x + run.vx * h, -FLIGHT.width, FLIGHT.width);
  run.y = clamp(run.y + run.vy * h, -FLIGHT.height, FLIGHT.height);
  run.speed = damp(run.speed, run.slow > 0 ? FLIGHT.slowSpeed : FLIGHT.cruise, 6, h);
  const before = run.s, advance = Math.min(run.speed * h, course.length - run.s);
  run.s += advance;
  const protectedNow = run.invulnerable > 0 || run.roll > 0;

  // Zischer: wake when their wave comes up, age, and throw sparks.
  for (const z of course.zischer) {
    let state = run.zischerState.get(z.id);
    if (!state && run.s >= z.s - 40 && !run.chased.has(z.id)) {
      state = {age: 0, gone: false, sparkIn: 1.6 + z.phase % 1.2};
      run.zischerState.set(z.id, state);
    }
    if (!state || state.gone) continue;
    state.age += h;
    if (state.age > FLIGHT.zischerHold + 1.2) { state.gone = true; continue; }
    state.sparkIn -= h;
    const p = zischerPosition(z, state, run.s);
    if (state.sparkIn <= 0 && state.age < FLIGHT.zischerHold) {
      state.sparkIn = FLIGHT.sparkEvery;
      // Thrown at where the rocket is now: easy to read and to dodge.
      run.sparks.push({id: run.nextSpark++, s: p.s, x: p.x, y: p.y, tx: run.x, ty: run.y, from: p.s});
      events.push({type: 'spark'});
    }
  }

  // Stars from the rocket.
  for (const shot of run.shots) {
    shot.s += (run.speed + FLIGHT.shotSpeed) * h;
    shot.life -= h;
    for (const a of course.asteroids) {
      if (shot.life <= 0 || run.broken.has(a.id) || Math.abs(a.s - shot.s) > a.radius + 1.5) continue;
      const p = asteroidPosition(a, run.elapsed);
      if (Math.hypot(p.x - shot.x, p.y - shot.y) > a.radius + FLIGHT.shotReach) continue;
      shot.life = 0;
      const hp = (run.asteroidHp.get(a.id) ?? a.hp) - 1;
      run.asteroidHp.set(a.id, hp);
      if (hp > 0) { events.push({type: 'bump', id: a.id, hp}); continue; }
      run.broken.add(a.id);
      run.asteroids++;
      events.push({type: 'slam', id: a.id, big: a.big, asteroids: run.asteroids});
    }
    for (const z of course.zischer) {
      const state = run.zischerState.get(z.id), p = zischerPosition(z, state, run.s);
      if (shot.life <= 0 || !p || Math.abs(p.s - shot.s) > 2.5) continue;
      if (Math.hypot(p.x - shot.x, p.y - shot.y) > FLIGHT.zischerRadius + FLIGHT.shotReach) continue;
      shot.life = 0;
      state.gone = true;
      run.chased.add(z.id);
      run.zapped++;
      events.push({type: 'enemyDefeat', id: z.id, zapped: run.zapped});
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
    if (!protectedNow && Math.hypot(spark.cx - run.x, spark.cy - run.y) < FLIGHT.sparkRadius + .6) bump(run, events, FLIGHT.bumpPenalty, {x: spark.cx, y: spark.cy});
  }
  run.sparks = run.sparks.filter(spark => !spark.done);

  // Asteroids the rocket passes through.
  for (const a of course.asteroids) {
    if (run.passed.has(a.id) || a.s < before || a.s > run.s) continue;
    run.passed.add(a.id);
    if (run.broken.has(a.id) || run.invulnerable > 0 || run.roll > 0) continue;
    const p = asteroidPosition(a, run.elapsed);
    if (Math.hypot(p.x - run.x, p.y - run.y) > a.radius + .7) continue;
    bump(run, events, FLIGHT.bumpPenalty, p);
  }
  for (const [i, checkpoint] of course.checkpoints.entries()) {
    if (run.checkpoint >= i + 1 || checkpoint < before || run.s < checkpoint) continue;
    run.checkpoint = i + 1;
    events.push({type: 'checkpoint', checkpoint: run.checkpoint});
  }
  if (run.s >= course.length) {
    run.phase = 'landing';
    run.phaseTime = 0;
    run.shots = [];
    run.sparks = [];
    events.push({type: 'arrive'});
  }
}

function stage(run, course) { return course.stages[run.climb.stage]; }

function stepClimb(run, course, h, x, y, jump, action, events) {
  const c = run.climb, st = stage(run, course);
  if (c.switching > 0) {
    c.switching = Math.max(0, c.switching - h);
    if (c.switching === 0) events.push({type: 'land'});
    return;
  }
  for (const key of ['stun', 'invulnerable', 'tickleCooldown', 'warning']) c[key] = Math.max(0, c[key] - h);

  // Krakel's waves: a warning shudder, then a bulge running down the arm.
  c.waveClock += h;
  if (c.waveClock >= st.waveEvery && !c.warning) {
    c.waveClock = 0;
    c.warning = CLIMB.waveWarning;
    c.pending = true;
    events.push({type: 'roar'});
  }
  if (c.pending && c.warning === 0) {
    c.pending = false;
    c.waves.push({pos: st.length + 1});
  }

  if (c.stun === 0) {
    const forward = y > 0 ? y * CLIMB.speed : y * CLIMB.backSpeed;
    c.s = clamp(c.s + forward * h, 0, st.length);
    c.x = clamp(c.x + x * CLIMB.lateralSpeed * h, -CLIMB.width, CLIMB.width);
    if (jump && c.grounded) {
      c.vz = CLIMB.jumpSpeed;
      c.grounded = false;
      events.push({type: 'jump'});
    }
  }
  if (!c.grounded) {
    c.vz -= CLIMB.gravity * h;
    c.z += c.vz * h;
    if (c.z <= 0) { c.z = 0; c.vz = 0; c.grounded = true; }
  }

  for (const wave of c.waves) {
    const from = wave.pos;
    wave.pos -= CLIMB.waveSpeed * h;
    if (from < c.s || wave.pos > c.s) continue;
    if (c.z >= CLIMB.waveClear || c.invulnerable > 0) continue;
    c.s = Math.max(0, c.s - CLIMB.knockback);
    c.stun = CLIMB.stun;
    c.invulnerable = CLIMB.invulnerable;
    c.vz = 4; c.grounded = false;
    run.shaken++;
    events.push({type: 'hurt', kind: 'wave'});
  }
  c.waves = c.waves.filter(wave => wave.pos > -1);

  // Zischer hover on the arm, weaving across it, until whirled off.
  for (const [i, at] of st.zischer.entries()) {
    const z = c.zischer[i];
    if (z.gone) continue;
    if (!z.awake && c.s > at - CLIMB.zischerWake) { z.awake = true; events.push({type: 'enemyNotice'}); }
    if (!z.awake) continue;
    z.age += h;
    z.x = Math.sin(z.age * 1.7) * CLIMB.width;
    const ds = at - c.s;
    if (action && Math.abs(ds) < CLIMB.whirlReach) {
      z.gone = true;
      run.whirled++;
      events.push({type: 'enemyDefeat', kind: 'whirl'});
      action = false;
      continue;
    }
    if (c.invulnerable > 0 || Math.abs(ds) > CLIMB.hitReach || Math.abs(z.x - c.x) > CLIMB.hitReach || c.z > CLIMB.hitHeight) continue;
    c.s = Math.max(0, c.s - CLIMB.knockback * .8);
    c.stun = CLIMB.stun;
    c.invulnerable = CLIMB.invulnerable;
    run.shaken++;
    events.push({type: 'hurt', kind: 'zischer'});
  }

  if (action && c.s >= st.length - CLIMB.spot && c.grounded && c.tickleCooldown === 0) {
    c.tickleCooldown = CLIMB.tickleCooldown;
    c.tickles++;
    const left = st.tickles - c.tickles;
    events.push({type: 'tickle', left, stage: c.stage});
    if (left > 0) return;
    if (c.stage === course.stages.length - 1) {
      run.phase = 'cheer';
      run.phaseTime = 0;
      events.push({type: 'bossDown', final: true});
      return;
    }
    run.armsDown++;
    events.push({type: 'armDown', arms: run.armsDown});
    const next = c.stage + 1;
    Object.assign(c, freshClimb(), {stage: next, switching: CLIMB.switchTime});
    c.zischer = course.stages[next].zischer.map(() => ({awake: false, gone: false, age: 0, x: 0}));
  }
}

function startClimb(run, course) {
  run.phase = 'climb';
  run.phaseTime = 0;
  run.climb = freshClimb();
  run.climb.zischer = course.stages[0].zischer.map(() => ({awake: false, gone: false, age: 0, x: 0}));
}

/** One step of the chapter. Controls: {x, y, jump, action} as main.js passes them. */
export function stepStarRun(run, course, dt, controls = {}) {
  const events = [];
  if (run.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return events;
  dt = Math.min(FLIGHT.maxFrame, dt);
  let x = clamp(finite(controls.x), -1, 1), y = clamp(finite(controls.y), -1, 1);
  const magnitude = Math.hypot(x, y);
  if (magnitude > 1) { x /= magnitude; y /= magnitude; }
  let jump = Boolean(controls.jump), action = Boolean(controls.action);
  if (run.phase === 'flight') {
    if (action && run.shotCooldown <= 0) {
      run.shotCooldown = FLIGHT.shotCooldown;
      run.shots.push({id: run.nextShot++, s: run.s + 1.5, x: run.x, y: run.y, life: FLIGHT.shotLife});
      events.push({type: 'zap'});
    }
    if (jump && run.rollCooldown <= 0) {
      run.roll = FLIGHT.rollDuration;
      run.rollCooldown = FLIGHT.rollCooldown;
      events.push({type: 'spin'});
    }
  }
  const count = Math.ceil(dt / FLIGHT.step), h = dt / count;
  for (let n = 0; n < count && run.status === 'playing'; n++) {
    run.elapsed += h;
    run.phaseTime += h;
    if (run.phase !== 'cheer') run.time += h;
    if (run.phase === 'flight') stepFlight(run, course, h, x, y, events);
    else if (run.phase === 'landing') {
      if (run.phaseTime >= LANDING.duration) { startClimb(run, course); events.push({type: 'land'}); }
    } else if (run.phase === 'climb') {
      stepClimb(run, course, h, x, y, jump, action, events);
      // A press counts once, not once per physics step.
      jump = action = false;
    } else if (run.phase === 'cheer' && run.phaseTime >= CLIMB.cheer) {
      run.status = 'finished';
      events.push({type: 'finish', time: run.time});
    }
  }
  return events;
}

/** The rescue button: back to the last checkpoint, or to the claw of this arm. */
export function rescueStarRun(run, course) {
  if (run.status !== 'playing') return [];
  if (run.phase === 'flight') {
    run.s = course.checkpoints[run.checkpoint - 1] ?? 0;
    run.x = run.y = run.vx = run.vy = 0;
    run.speed = FLIGHT.cruise;
    run.roll = run.slow = 0;
    run.shots = [];
    run.sparks = [];
    run.invulnerable = 2;
    run.passed = new Set(course.asteroids.filter(a => a.s < run.s).map(a => a.id));
    for (const z of course.zischer) if (z.s < run.s) run.zischerState.set(z.id, {age: 99, gone: true, sparkIn: 0});
      else if (!run.chased.has(z.id)) run.zischerState.delete(z.id);
  } else if (run.phase === 'climb' && !run.climb.switching) {
    const c = run.climb;
    Object.assign(c, {s: 0, x: 0, z: 0, vz: 0, grounded: true, stun: 0, invulnerable: 1.5, waves: [], warning: 0, pending: false, waveClock: 0});
  } else return [];
  run.time += FLIGHT.rescuePenalty;
  run.penalty += FLIGHT.rescuePenalty;
  return [{type: 'checkpoint', rescued: true, penalty: FLIGHT.rescuePenalty}];
}

/**
 * Test navigation only: no rewards or finish. Progress below the flight's
 * share flies there; above it jumps to the climb stage that share covers.
 */
export function seekStarRun(run, course, progress) {
  progress = clamp(finite(progress), 0, .999);
  run.status = 'playing';
  run.shots = [];
  run.sparks = [];
  if (progress < SHARE.flight) {
    run.phase = 'flight';
    run.s = progress / SHARE.flight * course.length;
    run.x = run.y = run.vx = run.vy = 0;
    run.passed = new Set(course.asteroids.filter(a => a.s < run.s).map(a => a.id));
    for (const z of course.zischer) if (z.s < run.s) run.zischerState.set(z.id, {age: 99, gone: true, sparkIn: 0});
    return;
  }
  startClimb(run, course);
  const climbShare = (progress - SHARE.flight - SHARE.landing) / (1 - SHARE.flight - SHARE.landing);
  const index = clamp(Math.floor(climbShare * course.stages.length), 0, course.stages.length - 1);
  run.climb.stage = index;
  run.armsDown = Math.min(index, 3);
  run.climb.zischer = course.stages[index].zischer.map(() => ({awake: false, gone: false, age: 0, x: 0}));
}

/** The whole chapter on one bar: flight, landing, then the four climbs. */
export function starProgress(run, course) {
  if (run.phase === 'flight') return flightProgress(run, course) * SHARE.flight;
  if (run.phase === 'landing') return SHARE.flight + clamp(run.phaseTime / LANDING.duration, 0, 1) * SHARE.landing;
  if (run.phase === 'cheer' || run.status === 'finished') return 1;
  const c = run.climb, st = course.stages[c.stage], climbed = c.stage + clamp(c.s / st.length, 0, 1) * .9 + c.tickles / st.tickles * .1;
  return SHARE.flight + SHARE.landing + climbed / course.stages.length * (1 - SHARE.flight - SHARE.landing);
}

export function starSnapshot(run, course) {
  const c = run.climb, st = course.stages[c.stage];
  let actionHint = null;
  if (run.phase === 'climb' && !c.switching) {
    const nearZischer = st.zischer.some((at, i) => c.zischer[i]?.awake && !c.zischer[i].gone && Math.abs(at - c.s) < CLIMB.whirlReach);
    if (nearZischer) actionHint = 'Wegwirbeln!';
    else if (c.s >= st.length - CLIMB.spot) actionHint = `Kitzeln! ${st.tickles - c.tickles}×`;
  }
  return {status: run.status, phase: run.phase, time: run.time, elapsed: run.elapsed, penalty: run.penalty,
    progress: starProgress(run, course),
    distance: run.s, x: run.x, y: run.y, speed: run.speed, roll: run.roll, rollCooldown: run.rollCooldown,
    checkpoint: run.checkpoint, checkpoints: course.checkpoints.length,
    asteroids: run.asteroids, totalAsteroids: course.asteroids.length, zapped: run.zapped, bumps: run.bumps,
    stage: c.stage, stageId: st.id, stageName: st.name, stages: course.stages.length, armsDown: run.armsDown,
    climb: {s: c.s, x: c.x, z: c.z, length: st.length, tickles: c.tickles, tickleGoal: st.tickles,
      waves: c.waves.map(w => w.pos), warning: c.warning, switching: c.switching, stun: c.stun, invulnerable: c.invulnerable},
    shaken: run.shaken, whirled: run.whirled, defeated: run.zapped + run.whirled, actionHint};
}
