// Glutzahn's fight in the Glutkessel crater, without a screen. Positions are
// in the arena's flat top: x right, z forward, metres from its centre; the
// player's `height` is above the arena top.
//
// A round: he stomps towards Mirio, then either rears back (the fire is
// announced for most of a second) and breathes a cone of fire, or spins a
// Stachelkreisel across the arena that bounces off the rim. After either he
// is out of breath for a while: that is the moment to jump on his head. Every
// attack is announced; the fire can be dodged sideways and a Kreisel jumped
// over.
//
// Three stages of two hits each: first Glutzahn alone, then Grummel join in,
// then Grummel and Schnappblumen (the run brings them; see volcano-run.js).
// Each stage he walks a little faster and rests a little less.

export const GLUT = Object.freeze({
  hp: 6,
  hitsPerStage: 2,
  stageSpeed: 0.2,
  arena: 14,
  radius: 1.3,
  headLow: 3.1,
  headHigh: 4.8,
  intro: 1.6,
  walk: 2.6,
  walkSpeed: 2.1,
  aim: 0.95,
  fire: 1.5,
  fireLength: 6.8,
  fireHalfAngle: 0.42,
  fireHeight: 2.6,
  throwWind: 0.7,
  tired: 2.6,
  hurt: 1.1,
  kreiselSpeed: 6,
  kreiselLife: 4.5,
  kreiselRadius: 0.75,
  kreiselJump: 0.9,
});


export class GlutzahnRules {
  /** `arena` is the radius of the flat ground he fights on. */
  constructor({ arena = GLUT.arena } = {}) { this.arena = arena; this.reset(); }

  reset() {
    Object.assign(this, {
      mode: 'waiting', timer: 0, hp: GLUT.hp, x: 0, z: -2, facingX: 0, facingZ: 1,
      attacks: 0, kreisels: [], nextId: 1, hits: 0,
    });
  }

  get defeated() { return this.mode === 'defeated'; }

  /** 1, 2 or 3: two hits per stage. */
  get stage() { return Math.min(3, 1 + Math.floor((GLUT.hp - this.hp) / GLUT.hitsPerStage)); }

  #pace() { return 1 + (this.stage - 1) * GLUT.stageSpeed; }

  /** The fight begins when Mirio reaches the arena. */
  start() {
    if (this.mode !== 'waiting') return [];
    this.change('intro');
    return [{ type: 'bossRoar' }];
  }

  change(mode) { this.mode = mode; this.timer = 0; }

  #face(player) {
    const dx = player.x - this.x, dz = player.z - this.z, d = Math.hypot(dx, dz);
    if (d > 0.01) { this.facingX = dx / d; this.facingZ = dz / d; }
    return d;
  }

  /** Whether the fire cone reaches `player` right now. */
  inFire(player) {
    if (this.mode !== 'fire') return false;
    const dx = player.x - (this.x + this.facingX * GLUT.radius), dz = player.z - (this.z + this.facingZ * GLUT.radius);
    const along = dx * this.facingX + dz * this.facingZ;
    const side = Math.abs(dx * this.facingZ - dz * this.facingX);
    return along > 0 && along < GLUT.fireLength && side < along * Math.tan(GLUT.fireHalfAngle) + 0.5 && player.height < GLUT.fireHeight;
  }

  /**
   * One step. `player` = {x, z, height, vy, pounding}. Returns events:
   * bossRoar, bossAim, bossFire, bossThrow, bossTired, bossHit {hp}, bossDefeat,
   * bossBounce (Mirio bounced off his head while he was not tired), and
   * hurt {x, z} (fire, a Kreisel or bumping into him).
   */
  step(dt, player) {
    const events = [];
    if (!Number.isFinite(dt) || dt <= 0 || this.mode === 'waiting' || this.mode === 'defeated') return events;
    this.timer += dt;
    const distance = Math.hypot(player.x - this.x, player.z - this.z);

    switch (this.mode) {
      case 'intro':
        this.#face(player);
        if (this.timer >= GLUT.intro) this.change('walk');
        break;
      case 'walk': {
        const d = this.#face(player);
        if (d > GLUT.radius + 1.4) {
          const step = Math.min(d - GLUT.radius - 1.4, GLUT.walkSpeed * this.#pace() * dt);
          this.x += this.facingX * step;
          this.z += this.facingZ * step;
          const r = Math.hypot(this.x, this.z), max = this.arena - GLUT.radius;
          if (r > max) { this.x *= max / r; this.z *= max / r; }
        }
        if (this.timer >= GLUT.walk / this.#pace()) {
          // Fire and Kreisel take turns, fire first.
          this.change(this.attacks++ % 2 === 0 ? 'aim' : 'wind');
          events.push({ type: this.mode === 'aim' ? 'bossAim' : 'bossWind' });
        }
        break;
      }
      case 'aim':
        // He aims while rearing back, then the direction is set.
        if (this.timer < GLUT.aim * 0.6) this.#face(player);
        if (this.timer >= GLUT.aim) { this.change('fire'); events.push({ type: 'bossFire' }); }
        break;
      case 'fire':
        if (this.timer >= GLUT.fire) { this.change('tired'); events.push({ type: 'bossTired' }); }
        break;
      case 'wind':
        this.#face(player);
        if (this.timer >= GLUT.throwWind) {
          this.kreisels.push({ id: this.nextId++, x: this.x + this.facingX * (GLUT.radius + 0.8), z: this.z + this.facingZ * (GLUT.radius + 0.8),
            vx: this.facingX * GLUT.kreiselSpeed, vz: this.facingZ * GLUT.kreiselSpeed, age: 0 });
          events.push({ type: 'bossThrow' });
          this.change('tired');
          events.push({ type: 'bossTired' });
        }
        break;
      case 'tired':
        if (this.timer >= GLUT.tired / this.#pace()) this.change('walk');
        break;
      case 'hurt':
        if (this.timer >= GLUT.hurt) this.change(this.hp > 0 ? 'walk' : 'defeated');
        break;
    }

    // The Kreisels roll and bounce off the rim, then fizzle out.
    for (const k of this.kreisels) {
      k.age += dt;
      k.x += k.vx * dt;
      k.z += k.vz * dt;
      const r = Math.hypot(k.x, k.z), max = this.arena - 0.4;
      if (r > max) {
        const nx = k.x / r, nz = k.z / r, inward = k.vx * nx + k.vz * nz;
        k.vx -= 2 * inward * nx;
        k.vz -= 2 * inward * nz;
        k.x = nx * max;
        k.z = nz * max;
      }
    }
    this.kreisels = this.kreisels.filter(k => k.age < GLUT.kreiselLife);

    // Mirio against Glutzahn: his head, his body, the fire, the Kreisels.
    const onHead = distance < GLUT.radius + 0.4 && player.height > GLUT.headLow && player.height < GLUT.headHigh && player.vy <= 0;
    if (onHead) {
      if (this.mode === 'tired') {
        const stage = this.stage;
        this.hp -= 1;
        this.hits += 1;
        this.change('hurt');
        events.push({ type: 'bossHit', hp: this.hp });
        if (this.hp <= 0) events.push({ type: 'bossDefeat' });
        else if (this.stage !== stage) events.push({ type: 'bossStage', stage: this.stage });
      } else if (this.mode !== 'hurt' && this.mode !== 'defeated') {
        events.push({ type: 'bossBounce' });
      }
    } else if (distance < GLUT.radius + 0.35 && player.height < GLUT.headLow && !['tired', 'hurt', 'intro'].includes(this.mode)) {
      events.push({ type: 'hurt', x: this.x, z: this.z });
    }
    if (this.inFire(player)) events.push({ type: 'hurt', x: this.x, z: this.z });
    for (const k of this.kreisels) {
      if (Math.hypot(player.x - k.x, player.z - k.z) < GLUT.kreiselRadius + 0.35 && player.height < GLUT.kreiselJump) {
        events.push({ type: 'hurt', x: k.x, z: k.z });
      }
    }
    return events;
  }

  snapshot() {
    return { mode: this.mode, hp: this.hp, stage: this.stage, x: this.x, z: this.z, facing: [this.facingX, this.facingZ],
      kreisels: this.kreisels.map(k => ({ id: k.id, x: k.x, z: k.z })) };
  }
}

