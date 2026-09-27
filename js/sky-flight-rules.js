// An original, forgiving sky slalom. Course rules have no renderer or DOM.
export const SKY = Object.freeze({
  length: 1800, cruise: 24, boostSpeed: 35, boostDuration: 1.45, boostCooldown: 5,
  lateralSpeed: 9.5, verticalSpeed: 7.5, width: 9, height: 5.5,
  ringRadius: 2.3, ringDraft: .45, draftSpeed: 28,
  rollDuration: .8, rollCooldown: 2.4,
  bumpPenalty: 2.5, rescuePenalty: 2, invulnerable: 1.6,
  step: 1 / 120, maxFrame: .25,
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = v => Number.isFinite(v) ? v : 0;
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

/** Rings describe a gentle, visible line; balloons leave more than one way past. */
export function makeSkyCourse() {
  const rings = Array.from({length: 48}, (_, i) => {
    const s = 50 + i * 35.5;
    const ramp = Math.min(1, i / 5);
    return {id: `sky-ring-${i}`, s, x: Math.sin(i * .39) * 5.4 * ramp,
      y: Math.sin(i * .54) * 2.7 * ramp, radius: SKY.ringRadius};
  });
  const obstacles = Array.from({length: 20}, (_, i) => {
    let s = 150 + i * 77;
    for (const checkpoint of [450, 900, 1350]) if (Math.abs(s - checkpoint) < 25) s = checkpoint + 30;
    const ring = rings.reduce((best, r) => Math.abs(r.s - s) < Math.abs(best.s - s) ? r : best);
    // Obstacles sit across from the marked route, with a few central slaloms.
    const x = clamp(-Math.sign(ring.x || 1) * (3.5 + (i % 3) * 1.1), -7, 7);
    return {id: `sky-balloon-${i}`, s, x, y: Math.sin(i * 1.8) * 2.5,
      radius: 1.65, phase: i * 1.37, drift: .55, color: i % 3};
  });
  return {length: SKY.length, rings, obstacles, checkpoints: [450, 900, 1350]};
}

export function createSkyRun() {
  return {status: 'playing', s: 0, time: 0, elapsed: 0, penalty: 0,
    x: 0, y: 0, vx: 0, vy: 0, speed: SKY.cruise,
    boost: 0, cooldown: 0, draft: 0, roll: 0, rollCooldown: 0,
    actionHeld: false, jumpHeld: false, invulnerable: 0, slow: 0,
    checkpoint: 0, combo: 0, bestCombo: 0, bumps: 0,
    collected: new Set(), passed: new Set(), cleared: new Set()};
}

export function balloonPosition(obstacle, time) {
  return {x: obstacle.x + Math.sin(time * .65 + obstacle.phase) * obstacle.drift,
    y: obstacle.y + Math.sin(time * .9 + obstacle.phase) * .35};
}

export function stepSkyRun(run, course, dt, controls = {}) {
  const events = [];
  if (run.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return events;
  dt = Math.min(SKY.maxFrame, dt);
  const action = Boolean(controls.action), jump = Boolean(controls.jump);
  if (action && !run.actionHeld && run.cooldown <= 0) {
    run.boost = SKY.boostDuration;
    run.cooldown = SKY.boostCooldown;
    events.push({type: 'boost', kind: 'speed'});
  }
  if (jump && !run.jumpHeld && run.rollCooldown <= 0) {
    run.roll = SKY.rollDuration;
    run.rollCooldown = SKY.rollCooldown;
    events.push({type: 'boost', kind: 'roll'});
  }
  run.actionHeld = action;
  run.jumpHeld = jump;
  let x = clamp(finite(controls.x), -1, 1), y = clamp(finite(controls.y), -1, 1);
  const magnitude = Math.hypot(x, y);
  if (magnitude > 1) { x /= magnitude; y /= magnitude; }
  const count = Math.ceil(dt / SKY.step), h = dt / count;
  for (let n = 0; n < count && run.status === 'playing'; n++) {
    const before = {s: run.s, x: run.x, y: run.y};
    for (const key of ['boost', 'cooldown', 'draft', 'roll', 'rollCooldown', 'invulnerable', 'slow']) run[key] = Math.max(0, run[key] - h);
    run.vx = damp(run.vx, x * SKY.lateralSpeed, 12, h);
    run.vy = damp(run.vy, y * SKY.verticalSpeed, 12, h);
    run.x = clamp(run.x + run.vx * h, -SKY.width, SKY.width);
    run.y = clamp(run.y + run.vy * h, -SKY.height, SKY.height);
    if (Math.abs(run.x) === SKY.width && Math.sign(run.vx) === Math.sign(run.x)) run.vx = 0;
    if (Math.abs(run.y) === SKY.height && Math.sign(run.vy) === Math.sign(run.y)) run.vy = 0;
    const target = run.slow > 0 ? 13 : run.boost > 0 ? SKY.boostSpeed : run.draft > 0 ? SKY.draftSpeed : SKY.cruise;
    run.speed = damp(run.speed, target, 6, h);
    const advance = Math.min(run.speed * h, course.length - run.s);
    const used = advance / Math.max(1, run.speed);
    run.s += advance;
    run.elapsed += used;
    run.time += used;
    const at = s => {
      const k = clamp((s - before.s) / Math.max(1e-8, advance), 0, 1);
      return {x: before.x + (run.x - before.x) * k, y: before.y + (run.y - before.y) * k};
    };
    for (const ring of course.rings) {
      if (run.passed.has(ring.id) || ring.s < before.s || ring.s > run.s) continue;
      run.passed.add(ring.id);
      const p = at(ring.s);
      if (Math.hypot(p.x - ring.x, p.y - ring.y) <= ring.radius) {
        // Re-flying a rescued section never awards the same hoop twice.
        if (!run.collected.has(ring.id)) {
          run.collected.add(ring.id);
          run.combo++;
          run.bestCombo = Math.max(run.bestCombo, run.combo);
          run.draft = SKY.ringDraft;
          events.push({type: 'ring', id: ring.id, combo: run.combo, collectibles: run.collected.size});
        }
      } else run.combo = 0;
    }
    for (const obstacle of course.obstacles) {
      if (run.cleared.has(obstacle.id) || obstacle.s < before.s || obstacle.s > run.s) continue;
      run.cleared.add(obstacle.id);
      const p = at(obstacle.s), o = balloonPosition(obstacle, run.elapsed);
      if (run.invulnerable > 0 || run.roll > 0 || Math.hypot(p.x - o.x, p.y - o.y) > obstacle.radius + .65) continue;
      run.slow = 1.05;
      run.boost = run.draft = 0;
      run.combo = 0;
      run.invulnerable = SKY.invulnerable;
      run.time += SKY.bumpPenalty;
      run.penalty += SKY.bumpPenalty;
      run.bumps++;
      // A little nudge makes contact readable, while controls remain responsive.
      run.vx += (Math.sign(p.x - o.x) || 1) * 2;
      events.push({type: 'bump', id: obstacle.id, penalty: SKY.bumpPenalty});
    }
    for (let i = 0; i < course.checkpoints.length; i++) {
      if (run.checkpoint >= i + 1 || course.checkpoints[i] < before.s || run.s < course.checkpoints[i]) continue;
      run.checkpoint = i + 1;
      events.push({type: 'checkpoint', checkpoint: run.checkpoint});
    }
    if (run.s >= course.length) {
      run.status = 'finished';
      events.push({type: 'finish', time: run.time, collectibles: run.collected.size});
    }
  }
  return events;
}

export function rescueSkyRun(run, course) {
  if (run.status !== 'playing') return [];
  run.s = course.checkpoints[run.checkpoint - 1] ?? 0;
  run.x = run.y = run.vx = run.vy = 0;
  run.speed = SKY.cruise;
  run.boost = run.draft = run.roll = run.slow = 0;
  run.actionHeld = run.jumpHeld = false;
  run.combo = 0;
  run.invulnerable = 2;
  run.time += SKY.rescuePenalty;
  run.penalty += SKY.rescuePenalty;
  run.passed = new Set(course.rings.filter(r => r.s < run.s).map(r => r.id));
  run.cleared = new Set(course.obstacles.filter(o => o.s < run.s).map(o => o.id));
  return [{type: 'checkpoint', checkpoint: run.checkpoint, rescued: true, penalty: SKY.rescuePenalty}];
}

/** Test navigation only: no rewards, checkpoint credit or finish event. */
export function seekSkyRun(run, course, progress) {
  run.s = clamp(finite(progress), 0, .999) * course.length;
  run.x = run.y = run.vx = run.vy = 0;
  run.speed = SKY.cruise;
  run.boost = run.draft = run.roll = run.slow = 0;
  run.actionHeld = run.jumpHeld = false;
  run.status = 'playing';
  run.passed = new Set(course.rings.filter(r => r.s < run.s).map(r => r.id));
  run.cleared = new Set(course.obstacles.filter(o => o.s < run.s).map(o => o.id));
}

export function skySnapshot(run, course) {
  return {status: run.status, time: run.time, elapsed: run.elapsed, penalty: run.penalty,
    progress: run.s / course.length, distance: run.s, x: run.x, y: run.y, speed: run.speed,
    collectibles: run.collected.size, totalCollectibles: course.rings.length,
    checkpoint: run.checkpoint, checkpoints: course.checkpoints.length,
    boost: run.boost, cooldown: run.cooldown, roll: run.roll, rollCooldown: run.rollCooldown,
    combo: run.combo, bestCombo: run.bestCombo, bumps: run.bumps};
}
