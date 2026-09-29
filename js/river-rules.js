// Mirio and Damai ride a log down the forest river to the waterfall.
// Rules without a screen: js/river-scene.js draws them, tests drive them.
//
// Positions are river coordinates: `s` metres downstream, `x` metres across
// from the river's centre (positive = the same side as the steering input).
// The river winds (`course.center(s)`), but the log follows the water, so
// the rules never see the bends; the scene adds them back.

export const RIVER = Object.freeze({
  length: 320, halfWidth: 4.5,
  startSpeed: 8, topSpeed: 15, recover: 1.6,
  steerSpeed: 6, steerResponse: 7,
  // The log's footprint for contact: a little shorter than it looks.
  logHalfWidth: .45, logReach: 1,
  bumpSpeed: 4, bumpPush: 4, invulnerable: 1, bumpPenalty: 1,
  whirlPull: 3, whirlReach: 1.5,
  scrapeDrag: 2, scrapeInterval: .6,
  gemReach: 1, branchThickness: .35,
  calmStart: 25, lipClear: 20, fallTime: 1.4,
  step: 1 / 120, maxFrame: .25,
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// Same generator as world.js; copied so the rules stay free of three.js.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How far along the river an obstacle reaches from its `s`. */
export function obstacleDepth(o) {
  return o.kind === 'branch' ? RIVER.branchThickness : o.radius;
}
/** The stretch of the river's width an obstacle covers. */
export function obstacleSpan(o) {
  const half = o.kind === 'branch' ? o.halfLength : o.radius;
  return [o.x - half, o.x + half];
}

/** The widest open stretch across the river at `s`, avoiding whirlpools too. */
export function riverLane(course, s) {
  const blocked = course.obstacles.filter(o => Math.abs(o.s - s) <= obstacleDepth(o)).map(obstacleSpan)
    .sort((a, b) => a[0] - b[0]);
  let best = {from: -RIVER.halfWidth, to: -RIVER.halfWidth}, from = -RIVER.halfWidth;
  for (const [a, b] of [...blocked, [RIVER.halfWidth, Infinity]]) {
    const to = Math.min(a, RIVER.halfWidth);
    if (to - from > best.to - best.from) best = {from, to};
    from = Math.max(from, b);
  }
  return {...best, width: best.to - best.from, center: (best.from + best.to) / 2};
}

/**
 * A winding river with rows of obstacles, each blocking one side. Rows come
 * closer together and settle into a strict left-right slalom towards the
 * end; every row leaves a wide lane, and gems mark the tight line through it.
 */
export function makeRiverCourse(seed = 1) {
  const rng = random(seed * 7919 + 17), L = RIVER.length, W = RIVER.halfWidth;
  const phase = rng() * Math.PI * 2;
  // The bends' phase speeds up along the river, so later bends are tighter.
  const bend = s => { const u = s / L; return 2 * Math.PI * (1.2 * u + 1.3 * u * u) + phase; };
  const center = s => {
    const settle = smooth(clamp(s, 0, L) / 40);
    return settle * (5 * Math.sin(bend(s)) - 5 * Math.sin(phase));
  };
  const obstacles = [], gems = [];
  const add = o => { o.id = `river-${o.kind}-${obstacles.length}`; obstacles.push(o); };
  let side = rng() < .5 ? -1 : 1, s = RIVER.calmStart + 7, row = 0;
  while (s < L - RIVER.lipClear - 3) {
    const t = (s - RIVER.calmStart) / (L - RIVER.calmStart - RIVER.lipClear);
    const first = obstacles.length;
    // Early rows pick their side freely; the last stretch alternates strictly.
    side = t > .55 || rng() < .7 ? -side : side;
    const pick = rng(), late = t > .55;
    if (t > .25 && t < .75 && row % 3 === 1 && pick < .5) {
      // A fallen branch from the bank, leaving an open gap of 3.2-3.8 m, with
      // extra room either side: its lane can be far from the last one.
      s += 4;
      const gap = 3.2 + rng() * .6, inner = -side * (W - gap), outer = side * (W + .8);
      add({kind: 'branch', s, x: (inner + outer) / 2, halfLength: Math.abs(outer - inner) / 2});
    } else if (t > .2 && t < .8 && pick > .8) {
      add({kind: 'whirl', s, x: side * (1.7 + rng() * .7), radius: 1.3});
    } else if (t > .45 && pick < .35) {
      add({kind: 'rock', s: s - .4, x: side * 1.1, radius: .8});
      add({kind: 'rock', s: s + .5, x: side * 3.4, radius: .9});
    } else {
      // Late rocks sit near the middle: a short, quick swing rather than a long one.
      add({kind: 'rock', s, x: side * (late ? .8 + rng() * .5 : .6 + rng() * 1.2), radius: .8 + rng() * (late ? .2 : .35)});
    }
    // Three gems on the lane's edge nearest the middle: the brave, short line.
    const lane = riverLane({obstacles: obstacles.slice(first)}, s);
    const gx = clamp(0, lane.from + 1, lane.to - 1);
    for (const ds of [-3, 0, 2.5]) gems.push({id: `river-gem-${gems.length}`, s: s + ds, x: gx});
    s += 15 - 3.5 * smooth(t) + (rng() - .5) * 2 + (obstacles.at(-1).kind === 'branch' ? 3 : 0);
    row++;
  }
  // A welcome line in the calm start teaches steering before anything is in the way.
  for (const [ds, x] of [[9, 0], [12, .9], [15, 1.8], [18, .9], [21, 0]]) gems.push({id: `river-gem-${gems.length}`, s: ds, x});
  gems.sort((a, b) => a.s - b.s);
  return {length: L, halfWidth: W, seed, center, obstacles, gems};
}

export function createRiverRun() {
  return {status: 'riding', s: 0, x: 0, vx: 0, speed: RIVER.startSpeed, time: 0, penalty: 0,
    invulnerable: 0, scrape: 0, fall: 0, bumps: 0,
    collected: new Set(), hit: new Set(), whirled: new Set()};
}

function touches(run, o) {
  const along = Math.abs(o.s - run.s) - RIVER.logReach;
  if (o.kind === 'branch') {
    const [a, b] = obstacleSpan(o);
    return along <= RIVER.branchThickness && run.x + RIVER.logHalfWidth > a && run.x - RIVER.logHalfWidth < b;
  }
  return Math.hypot(Math.max(0, along), o.x - run.x) < o.radius + RIVER.logHalfWidth;
}

export function stepRiverRun(run, course, dt, {x = 0} = {}) {
  const events = [];
  if (run.status === 'done' || !Number.isFinite(dt) || dt <= 0) return events;
  dt = Math.min(RIVER.maxFrame, dt);
  const steer = clamp(Number.isFinite(x) ? x : 0, -1, 1), W = course.halfWidth ?? RIVER.halfWidth;
  const count = Math.ceil(dt / RIVER.step - 1e-9), h = dt / count;
  for (let n = 0; n < count && run.status !== 'done'; n++) {
    if (run.status === 'falling') {
      run.fall += h;
      if (run.fall >= RIVER.fallTime) { run.status = 'done'; events.push({type: 'landed'}); }
      continue;
    }
    run.invulnerable = Math.max(0, run.invulnerable - h);
    run.scrape = Math.max(0, run.scrape - h);
    run.vx = damp(run.vx, steer * RIVER.steerSpeed, RIVER.steerResponse, h);
    let drift = 0;
    for (const o of course.obstacles) {
      if (o.kind !== 'whirl') continue;
      const d = Math.hypot(o.s - run.s, o.x - run.x);
      if (d > o.radius + RIVER.whirlReach) continue;
      if (!run.whirled.has(o.id)) { run.whirled.add(o.id); events.push({type: 'whirl', id: o.id}); }
      // A drift towards the eye, fading with distance and slower than steering.
      drift += Math.sign(o.x - run.x) * Math.min(1, Math.abs(o.x - run.x) / .5)
        * RIVER.whirlPull * (1 - d / (o.radius + RIVER.whirlReach));
    }
    run.x += (run.vx + drift) * h;
    if (Math.abs(run.x) > W) {
      const pushing = run.vx * Math.sign(run.x) > 0;
      run.x = Math.sign(run.x) * W;
      if (Math.sign(run.vx) === Math.sign(run.x)) run.vx = 0;
      run.speed = Math.max(RIVER.bumpSpeed, run.speed - RIVER.scrapeDrag * h);
      if (pushing && run.scrape <= 0) { run.scrape = RIVER.scrapeInterval; events.push({type: 'scrape', side: Math.sign(run.x)}); }
    }
    const target = RIVER.startSpeed + (RIVER.topSpeed - RIVER.startSpeed) * smooth((run.s - RIVER.calmStart) / (course.length - RIVER.calmStart));
    run.speed = run.speed < target ? damp(run.speed, target, RIVER.recover, h) : target;
    const before = run.s;
    run.s = Math.min(course.length, run.s + run.speed * h);
    run.time += h;
    for (const o of course.obstacles) {
      if (o.kind === 'whirl' || run.hit.has(o.id) || !touches(run, o)) continue;
      // Each obstacle costs at most once; the grace period covers its neighbours.
      run.hit.add(o.id);
      if (run.invulnerable > 0) continue;
      run.invulnerable = RIVER.invulnerable;
      run.speed = Math.min(run.speed, RIVER.bumpSpeed);
      run.time += RIVER.bumpPenalty;
      run.penalty += RIVER.bumpPenalty;
      run.bumps++;
      const away = o.kind === 'branch' ? -Math.sign(o.x) : Math.sign(run.x - o.x) || -Math.sign(o.x) || 1;
      run.vx = away * RIVER.bumpPush;
      events.push({type: 'bump', id: o.id, kind: o.kind, penalty: RIVER.bumpPenalty});
    }
    for (const g of course.gems) {
      if (run.collected.has(g.id) || g.s < before - RIVER.gemReach || g.s > run.s + RIVER.gemReach) continue;
      if (Math.hypot(Math.max(0, Math.abs(g.s - run.s) - .5), g.x - run.x) > RIVER.gemReach) continue;
      run.collected.add(g.id);
      events.push({type: 'gem', id: g.id, collected: run.collected.size});
    }
    if (run.s >= course.length) {
      run.status = 'falling';
      events.push({type: 'waterfall', time: run.time, bumps: run.bumps, collected: run.collected.size});
    }
  }
  return events;
}

export function riverSnapshot(run, course) {
  return {s: run.s, x: run.x, worldX: course.center(run.s) + run.x, speed: run.speed,
    progress: clamp(run.s / course.length, 0, 1), collected: run.collected.size, totalGems: course.gems.length,
    bumps: run.bumps, time: run.time, penalty: run.penalty, status: run.status,
    fall: run.status === 'riding' ? 0 : clamp(run.fall / RIVER.fallTime, 0, 1)};
}
