export const MOVE_SPEED = 3;
export const MAX_HEALTH = 100;
export const MAX_POWER = 100;

const PUNCH = { duration: 22, activeStart: 6, activeEnd: 14, damage: 6, range: 46 };
const KICK = { duration: 34, activeStart: 10, activeEnd: 22, damage: 10, range: 58, cost: 20 };
const SPECIAL = { duration: 40, activeStart: 14, activeEnd: 26, damage: 25, range: 65, cost: 50 };
const HITSTUN_FRAMES = 24;
const JUMP_DURATION = 36;
const JUMP_HEIGHT = 55;
const JUMP_COST = 15;
const PUNCH_POWER_GAIN = 12;
const PASSIVE_REGEN_PER_FRAME = 0.15; // ~9/sec at 60fps

// One mechanical trait per Hood archetype - matches their own "Builders,
// Collectors, Flippers and HODLers" framing directly rather than inventing
// something disconnected from the actual collection identity.
const ARCHETYPES = {
  Builder: { damageMult: 1.25, speedMult: 1, healthMult: 1, blockMult: 1 },
  Flipper: { damageMult: 1, speedMult: 1.3, healthMult: 1, blockMult: 1 },
  Hodler: { damageMult: 1, speedMult: 1, healthMult: 1.25, blockMult: 1 },
  Collector: { damageMult: 1, speedMult: 1, healthMult: 1, blockMult: 0.5 },
};
const DEFAULT_ARCHETYPE = { damageMult: 1, speedMult: 1, healthMult: 1, blockMult: 1 };
const RARE_TRAIT_HEALTH_BONUS = 0.02;

export class Fighter {
  constructor(data, x, facing) {
    this.data = data;
    this.headImg = new Image();
    this.headImg.crossOrigin = "anonymous";
    this.headImg.src = data.imageUrl;

    this.archetype = ARCHETYPES[data.hoodieType] ?? DEFAULT_ARCHETYPE;
    this.maxHealth = Math.round(
      MAX_HEALTH *
        this.archetype.healthMult *
        (1 + RARE_TRAIT_HEALTH_BONUS * (data.rareTraitCount ?? 0)),
    );

    this.x = x;
    this.facing = facing;
    this.state = "idle";
    this.stateT = 0;
    this.health = this.maxHealth;
    this.power = 0;
    this.hasHit = false;
    // Set by the caller (game.js) right after a hit/action lands, so it can
    // trigger the matching sound effect without fighter.js knowing about audio.
    this.lastEvent = null;
  }

  get name() {
    return this.data.name;
  }

  setState(state) {
    this.state = state;
    this.stateT = 0;
    this.hasHit = false;
  }

  spendPower(amount) {
    if (this.power < amount) return false;
    this.power -= amount;
    return true;
  }

  update(input, opponent) {
    this.lastEvent = null;

    if (this.state === "ko") {
      this.stateT++;
      return;
    }

    this.stateT++;

    // Power slowly refills on its own except while jumping or kicking -
    // those are the two moves that spend it, so no free regen mid-spend.
    if (this.state !== "jump" && this.state !== "kick") {
      this.power = Math.min(MAX_POWER, this.power + PASSIVE_REGEN_PER_FRAME);
    }

    if (["punch", "kick", "special", "hitstun"].includes(this.state)) {
      const durations = {
        punch: PUNCH.duration,
        kick: KICK.duration,
        special: SPECIAL.duration,
        hitstun: HITSTUN_FRAMES,
      };
      if (this.stateT >= durations[this.state]) this.setState("idle");
      return;
    }

    if (this.state === "jump") {
      this.applyMove(input, opponent);
      if (this.stateT >= JUMP_DURATION) this.setState("idle");
      return;
    }

    if (this.state === "block" && !input.block) {
      this.setState("idle");
    }
    if (this.state === "crouch" && !input.crouch) {
      this.setState("idle");
    }

    if (input.block) {
      if (this.state !== "block") this.setState("block");
      return;
    }
    // Crouch takes priority over walking (you can still shuffle side to side
    // while ducked) but not over any actual attack/jump input.
    if (input.crouch && !input.punch && !input.kick && !input.special && !input.jump) {
      if (this.state !== "crouch") this.setState("crouch");
      this.applyMove(input, opponent);
      return;
    }
    if (input.special && this.power >= SPECIAL.cost) {
      this.spendPower(SPECIAL.cost);
      this.setState("special");
      this.lastEvent = "special-start";
      return;
    }
    if (input.jump && this.power >= JUMP_COST) {
      this.spendPower(JUMP_COST);
      this.setState("jump");
      this.lastEvent = "jump-start";
      return;
    }
    if (input.punch && this.state !== "punch") {
      this.setState("punch");
      return;
    }
    if (input.kick && this.power >= KICK.cost) {
      this.spendPower(KICK.cost);
      this.setState("kick");
      return;
    }

    const vx = this.applyMove(input, opponent);
    this.state = vx !== 0 ? "walk" : "idle";
  }

  applyMove(input, opponent) {
    const speed = MOVE_SPEED * this.archetype.speedMult;
    let vx = 0;
    if (input.left) vx -= speed;
    if (input.right) vx += speed;
    this.x += vx;
    this.x = Math.max(50, Math.min(750, this.x));

    const minGap = 40;
    if (this.facing === 1 && opponent.x - this.x < minGap) this.x = opponent.x - minGap;
    if (this.facing === -1 && this.x - opponent.x < minGap) this.x = opponent.x + minGap;
    return vx;
  }

  get jumpOffset() {
    if (this.state !== "jump") return 0;
    const t = Math.min(1, this.stateT / JUMP_DURATION);
    return JUMP_HEIGHT * 4 * t * (1 - t);
  }

  attackHitbox() {
    const spec =
      this.state === "punch" ? PUNCH : this.state === "kick" ? KICK : this.state === "special" ? SPECIAL : null;
    if (!spec) return null;
    if (this.stateT < spec.activeStart || this.stateT > spec.activeEnd) return null;
    if (this.hasHit) return null;
    return {
      from: this.x,
      to: this.x + this.facing * spec.range,
      damage: spec.damage * this.archetype.damageMult,
      isPunch: spec === PUNCH,
      kind: spec === PUNCH ? "punch" : spec === KICK ? "kick" : "special",
    };
  }

  onLandedHit(isPunch) {
    if (isPunch) {
      this.power = Math.min(MAX_POWER, this.power + PUNCH_POWER_GAIN);
    }
  }

  takeDamage(amount, fromX, kind) {
    // Specials blow straight through a raised guard - full damage and normal
    // hitstun even if the defender was holding block when it landed.
    if (this.state === "block" && kind !== "special") {
      this.health -= amount * 0.2 * this.archetype.blockMult;
      this.lastEvent = "block-taken";
    } else {
      this.health -= amount;
      this.setState("hitstun");
      this.lastEvent = "hit-taken";
    }
    this.health = Math.max(0, this.health);
    if (this.health <= 0) {
      this.setState("ko");
      this.lastEvent = "ko";
    }
  }
}
