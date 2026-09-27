// Original little woodland / moon creatures. These rules need no renderer.
// Attacks are short, announced and tied to a small home patch: exploring
// past a creature never creates an endless chase.
export const ENEMY_RULES = Object.freeze({
  leash: 2.5, notice: 4.2, patrolRadius: 0.95,
  patrolSpeed: 0.75, chargeSpeed: 3.6,
  windup: 0.85, charge: 0.62, recover: 1.5, rest: 1.5,
  stun: 3.8, vanish: 0.65, radius: 0.7, height: 1.1,
});

const moveTowards = (state, x, z, speed, dt) => {
  const dx = x - state.x, dz = z - state.z, distance = Math.hypot(dx, dz);
  if (distance < 0.001) return;
  const travel = Math.min(distance, speed * dt);
  state.x += dx / distance * travel;
  state.z += dz / distance * travel;
  state.facingX = dx / distance;
  state.facingZ = dz / distance;
};

export class EnemyBrain {
  constructor(kind = 'beetle', phase = 0) {
    this.kind = kind;
    this.phase = phase;
    this.reset();
  }

  reset() {
    this.mode = 'patrol';
    this.age = this.timer = this.x = this.z = this.hop = 0;
    this.facingX = 0;
    this.facingZ = 1;
    this.rest = 1.2;
    this.spinReady = true;
  }

  change(mode) { this.mode = mode; this.timer = 0; }

  /** target is {x,z,height}; null means Mirio is elsewhere. */
  step(dt, target = null, active = true) {
    // A hop that meets the leash or gets stunned settles onto the ground
    // over a few ticks instead of snapping down from its airborne pose.
    this.hop = Math.max(0, this.hop - dt * 4);
    if (this.mode === 'defeated') { this.timer += dt; return null; }
    if (!active) {
      // No surprise attack waiting when a boss fight or cutscene finishes.
      if (this.mode === 'windup' || this.mode === 'charge') this.change('recover');
      this.rest = ENEMY_RULES.rest;
      return null;
    }
    this.age += dt;
    this.timer += dt;
    this.rest = Math.max(0, this.rest - dt);
    if (this.mode === 'stunned') {
      if (this.timer >= ENEMY_RULES.stun) { this.change('recover'); this.rest = ENEMY_RULES.rest; }
      return null;
    }
    if (this.mode === 'recover') {
      // Return home without pushing through Mirio or doing contact damage.
      moveTowards(this, 0, 0, ENEMY_RULES.patrolSpeed, dt);
      if (this.timer >= ENEMY_RULES.recover) { this.change('patrol'); this.rest = ENEMY_RULES.rest; }
      return null;
    }
    if (this.mode === 'windup') {
      if (!target || Math.hypot(target.x, target.z) > ENEMY_RULES.leash + ENEMY_RULES.notice) {
        this.change('recover');
      } else if (this.timer >= ENEMY_RULES.windup) this.change('charge');
      return null;
    }
    if (this.mode === 'charge') {
      this.x += this.facingX * ENEMY_RULES.chargeSpeed * dt;
      this.z += this.facingZ * ENEMY_RULES.chargeSpeed * dt;
      if (this.kind === 'pebble') this.hop = Math.sin(Math.min(1, this.timer / ENEMY_RULES.charge) * Math.PI) * 0.8;
      const radius = Math.hypot(this.x, this.z);
      if (radius > ENEMY_RULES.leash) {
        this.x *= ENEMY_RULES.leash / radius;
        this.z *= ENEMY_RULES.leash / radius;
      }
      if (this.timer >= ENEMY_RULES.charge || radius >= ENEMY_RULES.leash) this.change('recover');
      return null;
    }
    const angle = this.age * 0.5 + this.phase;
    moveTowards(this, Math.sin(angle) * ENEMY_RULES.patrolRadius, Math.cos(angle) * ENEMY_RULES.patrolRadius * 0.7, ENEMY_RULES.patrolSpeed, dt);
    if (this.kind === 'pebble') this.hop = Math.max(0, Math.sin(this.age * 3 + this.phase)) * 0.18;
    if (!target || this.rest > 0 || target.height > 2.3 || target.height < -0.6) return null;
    const dx = target.x - this.x, dz = target.z - this.z, distance = Math.hypot(dx, dz);
    if (distance < ENEMY_RULES.notice && Math.hypot(target.x, target.z) < ENEMY_RULES.leash + 1.4) {
      // Aim once. The warning gives a child time to move out of this line.
      if (distance > 0.01) { this.facingX = dx / distance; this.facingZ = dz / distance; }
      this.change('windup');
      return 'notice';
    }
    return null;
  }

  /**
   * Contact in the creature's local surface frame. Feet is Mirio's height
   * relative to the creature's feet; spin has a deliberately generous reach.
   * Returns an outcome once; the caller applies bounce/hurt and effects.
   */
  contact({ distance, feet, verticalSpeed, spinning = false, pounding = false,
    poundImpact = false, invulnerable = false, playerHeight = 2.1 }) {
    if (!spinning) this.spinReady = true;
    if (this.mode === 'defeated') return null;
    const overlap = feet < ENEMY_RULES.height + 0.35 && feet + playerHeight > 0.1;
    if (poundImpact && distance < 2.3 && Math.abs(feet) < 1.2) {
      this.change('defeated');
      return { type: 'defeat', method: 'pound', bounce: false };
    }
    if (distance < ENEMY_RULES.radius + 0.45 && verticalSpeed < -1 && feet > ENEMY_RULES.height - 0.5 && feet < ENEMY_RULES.height + 0.7) {
      this.change('defeated');
      return { type: 'defeat', method: pounding ? 'pound' : 'stomp', bounce: true };
    }
    if (overlap && distance < ENEMY_RULES.radius + 1 && spinning && this.spinReady) {
      this.spinReady = false;
      const defeated = this.mode === 'stunned';
      this.change(defeated ? 'defeated' : 'stunned');
      return { type: defeated ? 'defeat' : 'stun', method: 'spin', bounce: false };
    }
    if (overlap && distance < ENEMY_RULES.radius + 0.4 && !invulnerable && (this.mode === 'patrol' || this.mode === 'charge')) {
      this.change('recover');
      this.rest = ENEMY_RULES.rest;
      return { type: 'hurt' };
    }
    return null;
  }
}
