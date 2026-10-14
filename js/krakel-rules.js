// Krakel's fight on the Riesenstern, without a screen. Positions are in the
// arena's flat top: x right, z forward (towards where Mirio comes in),
// metres from its centre; heights are above the arena top.
//
// Krakel (Miro's blue monster) is huge: a round head high over the arena on
// three long lumpy arms whose claws grip the arena's edge. The arms are
// solid: a chain of lumps Mirio runs and jumps up (star-run.js turns
// armLumps() into colliders).
//
//   Three stages, one arm each. The arm of the stage glows at its shoulder.
//   Climb it and stomp the glow (a ground pound, or a good jump onto it):
//   the arm curls up and the next one starts glowing. Meanwhile Krakel spits
//   ink blobs at Mirio (each lands where its shadow was shown, and its
//   splash sends a ring out across the arena to jump), and while Mirio is on
//   the glowing arm he shudders it and then shakes it hard: whoever is
//   standing on it then is thrown off. Each stage spits faster.
//
//   With all three arms curled up Krakel's head comes down, sinking half
//   into the arena, and hops round it after Mirio; every landing sends a ring
//   out, and after it the head sits dazed for a moment: spring flowers grow
//   to get up on it, and a stomp sends it hopping off. Two stomps and Krakel
//   gives up the crystal.
//
// Every attack is announced; nothing hurts without a warning first.

export const KRAKEL = Object.freeze({
  arena: 17,
  // The head's centre over the arena's centre. Down on the arena it sinks in
  // to `sunkTop` high (spring flowers then grow to get up there).
  head: Object.freeze({ height: 17.5, radius: 5.5, sunkTop: 6, sunkHeight: 0.5 }),
  // Each arm: lumps from the claw (at `claw` from the centre, near the
  // ground), bulging out on the way, to a big elbow knob with the glowing
  // spot on top; from the knob a steep neck of lumps rises into the head.
  arm: Object.freeze({ claw: 15.5, low: -0.3, bulge: 1, lumps: 11, radius: 1.5 }),
  knob: Object.freeze({ r: 7.5, height: 8.5, radius: 2.1 }),
  neck: Object.freeze([[5.6, 11, 1.35], [4.8, 12.3, 1.3], [3.9, 13.6, 1.3]]),
  // Yaw of each arm from +z (towards Mirio's way in), in stage order.
  arms: Object.freeze([0, 2.15, -2.15]),
  intro: 2,
  // Seconds between attacks in stage 1, 2, 3, and for the head.
  every: Object.freeze([3.2, 2.8, 2.5, 2.6]),
  spitFlight: 1.15, splash: 1.8, splashHeight: 1.4,
  wave: Object.freeze({ speed: 6.5, reach: 8, band: 0.6, height: 0.6 }),
  shudder: 0.9, shake: 0.35,
  // A stomp counts within this of the glowing spot; a plain landing needs this fall speed.
  spot: 1.7, stompSpeed: 7,
  hurt: 1.6, bow: 1.6,
  hop: Object.freeze({ air: 1.1, dazed: 2.6, reach: 7, hp: 2 }),
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The lumps of arm `i`, claw first, the knob last: [{x, z, height, radius}]
 * (height of the lump's centre). These are what Mirio climbs.
 */
export function armLumps(i) {
  const A = KRAKEL.arm, K = KRAKEL.knob, yaw = KRAKEL.arms[i], lumps = [];
  const at = (r, height, radius) => lumps.push({ x: Math.sin(yaw) * r, z: Math.cos(yaw) * r, height, radius });
  for (let k = 0; k < A.lumps; k++) {
    const t = k / A.lumps, bulge = Math.sin(Math.PI * t);
    // The drawing's arms swell and narrow as they go.
    at(lerp(A.claw, K.r, t) + bulge * A.bulge, lerp(A.low, K.height, t) + bulge * A.bulge * 0.4, A.radius * (1 + 0.12 * Math.sin(k * 2.1)));
  }
  at(K.r, K.height, K.radius);
  return lumps;
}

/** The steep neck from arm `i`'s knob up into the head: solid, but no way up. */
export function neckLumps(i) {
  const yaw = KRAKEL.arms[i];
  return KRAKEL.neck.map(([r, height, radius]) => ({ x: Math.sin(yaw) * r, z: Math.cos(yaw) * r, height, radius }));
}

/** The glowing spot on top of arm `i`'s knob. */
export function armSpot(i) {
  const knob = armLumps(i).at(-1);
  return { x: knob.x, z: knob.z, height: knob.height + knob.radius };
}

export class KrakelRules {
  constructor() { this.reset(); }

  reset() {
    Object.assign(this, {
      mode: 'waiting', timer: 0, stage: 1, attackIn: KRAKEL.every[0], curled: [false, false, false],
      spits: [], waves: [], nextId: 1, shaking: 0, shudder: 0, headHp: KRAKEL.hop.hp,
      head: { x: 0, z: 0, height: KRAKEL.head.height, top: KRAKEL.head.height + KRAKEL.head.radius }, hopFrom: null, hopTo: null,
    });
  }

  get defeated() { return this.mode === 'defeated'; }
  /** The arm that glows now, or null once all are curled. */
  get activeArm() { return this.stage <= 3 && this.mode !== 'waiting' ? this.stage - 1 : null; }

  change(mode) { this.mode = mode; this.timer = 0; }

  /** The fight begins when Mirio steps onto the arena. */
  start() {
    if (this.mode !== 'waiting') return [];
    this.change('intro');
    return [{ type: 'roar', kind: 'intro' }];
  }

  /** Whether `player` stands on arm `i`: feet on top of one of its lumps. */
  onArm(i, player) {
    if (i === null || this.curled[i] || !player.onGround) return false;
    return armLumps(i).some(l => Math.hypot(player.x - l.x, player.z - l.z, player.height - l.height) < l.radius + 0.45);
  }

  /**
   * One step. `player`: {x, z, height, onGround, invulnerable, impact} where
   * `impact` is set on the frame Mirio lands: {x, z, height, pound, speed}.
   * Returns events; {type: 'hurt', x, z, height} and {type: 'toss', arm}
   * are for the run to apply to Mirio.
   */
  step(dt, player) {
    const events = [];
    if (this.mode === 'waiting' || this.mode === 'defeated' || !(dt > 0)) return events;
    this.timer += dt;
    this.#projectiles(dt, player, events);
    if (this.mode === 'intro') {
      if (this.timer >= KRAKEL.intro) this.change('arms');
      return events;
    }
    if (this.mode === 'hurt') {
      if (this.timer < KRAKEL.hurt) return events;
      if (this.stage <= 3) { this.change('arms'); this.attackIn = KRAKEL.every[this.stage - 1]; events.push({ type: 'bossStage', stage: this.stage }); }
      else { this.change('bow'); events.push({ type: 'roar', kind: 'bow' }); }
      return events;
    }
    if (this.mode === 'arms') this.#arms(dt, player, events);
    else if (this.mode === 'bow') this.#bow(events);
    else if (this.mode === 'hop' || this.mode === 'dazed') this.#head(dt, player, events);
    return events;
  }

  #arms(dt, player, events) {
    const arm = this.activeArm, on = this.onArm(arm, player);
    // The stomp on the glowing spot.
    const hit = player.impact && (player.impact.pound || player.impact.speed >= KRAKEL.stompSpeed);
    const spot = armSpot(arm);
    if (hit && Math.hypot(player.impact.x - spot.x, player.impact.z - spot.z, player.impact.height - spot.height) < KRAKEL.spot) {
      this.curled[arm] = true;
      this.shudder = this.shaking = 0;
      this.stage++;
      this.change('hurt');
      events.push({ type: 'bossHit', arm, hp: this.curled.filter(c => !c).length + this.headHp, stage: this.stage });
      return;
    }
    // Shudder, then shake: only while Mirio is on the glowing arm.
    if (this.shudder > 0) {
      this.shudder = Math.max(0, this.shudder - dt);
      if (this.shudder === 0) { this.shaking = KRAKEL.shake; events.push({ type: 'shake', arm }); }
    } else if (this.shaking > 0) {
      this.shaking = Math.max(0, this.shaking - dt);
      if (on) { this.shaking = 0; events.push({ type: 'toss', arm }); }
    }
    this.attackIn -= dt;
    if (this.attackIn > 0 || this.shudder > 0 || this.shaking > 0) return;
    this.attackIn = KRAKEL.every[this.stage - 1];
    if (on) { this.shudder = KRAKEL.shudder; events.push({ type: 'shudder', arm }); return; }
    this.#spit(player.x, player.z, events);
    // In stage three a second blob lands beside him.
    if (this.stage >= 3) this.#spit(player.x * 0.6 + (this.stage === 3 ? 3 : -3), player.z * 0.6 + 2, events);
  }

  #spit(x, z, events) {
    const r = Math.hypot(x, z), max = KRAKEL.arena - 1;
    if (r > max) { x *= max / r; z *= max / r; }
    this.spits.push({ id: this.nextId++, x, z, t: 0 });
    events.push({ type: 'spit', x, z });
  }

  #wave(x, z) { this.waves.push({ id: this.nextId++, x, z, r: 0 }); }

  #projectiles(dt, player, events) {
    for (const s of this.spits) {
      s.t += dt;
      if (s.t < KRAKEL.spitFlight) continue;
      s.done = true;
      this.#wave(s.x, s.z);
      events.push({ type: 'splash', x: s.x, z: s.z });
      if (Math.hypot(player.x - s.x, player.z - s.z) < KRAKEL.splash && player.height < KRAKEL.splashHeight) events.push({ type: 'hurt', x: s.x, z: s.z, height: 0 });
    }
    this.spits = this.spits.filter(s => !s.done);
    const W = KRAKEL.wave;
    for (const w of this.waves) {
      const before = w.r;
      w.r += W.speed * dt;
      const d = Math.hypot(player.x - w.x, player.z - w.z);
      // Only on the arena floor: the arms and a jump are safe.
      if (player.height < W.height && d > before - W.band && d < w.r + W.band && !w.hit) {
        w.hit = true;
        events.push({ type: 'hurt', x: w.x, z: w.z, height: 0 });
      }
    }
    this.waves = this.waves.filter(w => w.r < W.reach);
  }

  #bow(events) {
    const k = clamp(this.timer / KRAKEL.bow, 0, 1), H = KRAKEL.head;
    this.head.height = lerp(H.height, H.sunkHeight, k * k);
    this.head.top = lerp(H.height + H.radius, H.sunkTop, k * k);
    if (k < 1) return;
    this.#wave(this.head.x, this.head.z);
    events.push({ type: 'slam', x: this.head.x, z: this.head.z });
    this.change('dazed');
  }

  #head(dt, player, events) {
    const H = KRAKEL.hop, R = KRAKEL.head.radius;
    if (this.mode === 'dazed') {
      const hit = player.impact && (player.impact.pound || player.impact.speed >= KRAKEL.stompSpeed);
      if (hit && Math.hypot(player.impact.x - this.head.x, player.impact.z - this.head.z) < R * 0.75 && player.impact.height > this.head.top - 1.5) {
        this.headHp--;
        events.push({ type: 'bossHit', hp: this.headHp, stage: 4 });
        if (this.headHp <= 0) { this.change('defeated'); this.spits = []; this.waves = []; events.push({ type: 'bossDefeat' }); return; }
        // Shaken awake: off it hops at once, so the next stamp needs a new way up.
        this.timer = H.dazed;
        events.push({ type: 'bounce' });
      }
      if (this.timer < H.dazed) return;
      // Up and after Mirio, never out of the arena; from right under him, away across it.
      let dx = player.x - this.head.x, dz = player.z - this.head.z, d = Math.hypot(dx, dz), step = Math.min(H.reach, d);
      if (d < R) { dx = -this.head.x || 1; dz = -this.head.z; d = Math.hypot(dx, dz); step = H.reach; }
      let x = this.head.x + dx / d * step, z = this.head.z + dz / d * step;
      const r = Math.hypot(x, z), max = KRAKEL.arena - R - 1;
      if (r > max) { x *= max / r; z *= max / r; }
      this.hopFrom = { ...this.head };
      this.hopTo = { x, z };
      this.change('hop');
      events.push({ type: 'bossJump' });
      return;
    }
    const k = clamp(this.timer / H.air, 0, 1);
    this.head.x = lerp(this.hopFrom.x, this.hopTo.x, k);
    this.head.z = lerp(this.hopFrom.z, this.hopTo.z, k);
    // Up in the air; sunk in again where it lands.
    this.head.height = R + Math.sin(Math.PI * k) * 7;
    this.head.top = this.head.height + R;
    if (k < 1) return;
    this.head.height = KRAKEL.head.sunkHeight;
    this.head.top = KRAKEL.head.sunkTop;
    this.#wave(this.head.x, this.head.z);
    events.push({ type: 'slam', x: this.head.x, z: this.head.z });
    if (Math.hypot(player.x - this.head.x, player.z - this.head.z) < R + 0.6 && player.height < KRAKEL.head.sunkTop) events.push({ type: 'hurt', x: this.head.x, z: this.head.z, height: 0 });
    this.change('dazed');
  }

  /** 0..1 through the fight, for the progress bar. */
  get progress() {
    if (this.mode === 'defeated') return 1;
    return Math.min(3, this.stage - 1) / 4 + (this.stage > 3 ? (KRAKEL.hop.hp - this.headHp) / KRAKEL.hop.hp / 4 : 0);
  }

  snapshot() {
    return {
      mode: this.mode, stage: this.stage, activeArm: this.activeArm, curled: [...this.curled], headHp: this.headHp,
      head: { ...this.head }, spits: this.spits.map(s => ({ ...s })), waves: this.waves.map(w => ({ x: w.x, z: w.z, r: w.r })),
      shudder: this.shudder, shaking: this.shaking,
    };
  }
}
