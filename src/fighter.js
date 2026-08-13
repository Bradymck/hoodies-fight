export const MOVE_SPEED = 3;
export const MAX_HEALTH = 100;
export const MAX_POWER = 100;

// Ranges need to clear MIN_FIGHTER_GAP (game.js) - the closest the solid-body
// collision will ever let two fighters stand - or the attack could never
// connect at point-blank range. Sprite bodies render ~60px wide at full
// scale, so the enforced gap is ~68px; these all clear it with margin.
const PUNCH = { duration: 22, activeStart: 6, activeEnd: 14, damage: 6, range: 74 };
const KICK = { duration: 34, activeStart: 10, activeEnd: 22, damage: 10, range: 84, cost: 20 };
// Ranged, not a melee hitbox - the cast animation plays out over `release`
// frames, then game.js reads "special-release" off lastEvent and spawns a
// projectile of its own that travels and hits independently. `duration`
// leaves a few recovery frames after release for the throw's follow-through
// before control returns. damage bumped well past kick's (10) - at the old
// value (25, only ~2.5x kick before archetype multipliers) it didn't feel
// meaningfully different from a kick landing, despite costing 50 power and
// a full cast animation to throw.
const SPECIAL = { duration: 42, release: 30, damage: 32, cost: 50 };
const HITSTUN_FRAMES = 24;
// Tall/long enough that the arc actually clears over the other fighter's
// full standing height (~109px at CHARACTER_SCALE) instead of just a hop in
// place - see resolveCollision in game.js, which now lets fighters pass
// through each other horizontally while either is airborne, so this is what
// makes "jump over them" a real, usable option instead of just a dodge.
const JUMP_DURATION = 48;
const JUMP_HEIGHT = 140;
// Ground-closing move: moves forward on its own the whole time it's active
// (see updateSlide in game.js) rather than reading movement input. Free,
// like jump/punch - the danger is landing the hit, not the cost. Exported
// (along with UPPERCUT below) since game.js's updateSlide/checkUppercutHit
// need the timing/range numbers directly - unlike damage, none of this
// varies by archetype, so plain constants rather than a getter.
// duration * SLIDE_SPEED (game.js) needs to comfortably clear the full
// ~700px arena width, not just a typical engage distance - a slide that
// times out short of a dodging opponent can never actually deliver the
// "land behind them" payoff, it just stops in the middle of the floor.
export const SLIDE = { duration: 44, damage: 12, knockback: 90 };
// How long the "hit by a slide" reaction pose holds before returning to
// idle - see takeDamage's kind==="slide" branch.
const KNOCKBACK_DURATION = 28;
// Arc height for the knockback flight - a real launch-and-land trajectory
// (see jumpOffset and setKnockbackMotion below) rather than the old instant
// teleport-then-freeze. Shorter than a real jump's arc (140) since this is a
// reaction, not a voluntary leap.
const KNOCKBACK_ARC_HEIGHT = 55;
// Anti-air counter: rises like a (shorter, faster) jump with an active
// hitbox partway through, specifically so it can catch an opponent mid-jump
// - see checkUppercutHit in game.js, which deliberately does NOT exclude a
// jumping defender the way every other melee hit does. range needs to clear
// MIN_FIGHTER_GAP (68, game.js) same as every melee range does - a range of
// 60 here missed every time (verified live: two grounded fighters can never
// stand closer than 68px apart in the first place, so a 60px range could
// never reach anyone even standing right next to you).
export const UPPERCUT = { duration: 32, activeStart: 16, activeEnd: 30, damage: 14, range: 80, height: 90, knockback: 100 };
// Archetype-specific specials - everyone still shares the same cast pose/
// timing (SPECIAL.duration/release above), only what happens at the
// release moment differs. Builder and Collector are both "high" (dodged by
// a crouch or a jump, matching the bolt's own dodge rule); Flipper and
// Hodler are both "low/ground" (only a jump clears them, matching the rat
// rush - a ground attack can't be ducked under, you're already down there).
// See spawnProjectile/checkBuilderSpecialHit/checkHodlerSpecialHit in
// game.js for where each is actually resolved.
export const BUILDER_SPECIAL = { damage: 30, range: 85 };
export const HODLER_SPECIAL = { damage: 26, range: 92 };
// Power now mostly comes from actually fighting - landing a hit or holding
// a block - rather than sitting still. Passive trickle is deliberately
// slow (was 0.15/frame, ~9/sec - fast enough that special was basically
// always available for free) so the special reads as something you earn,
// not something you wait out. special itself grants nothing back (already
// the most expensive thing you can do) - the resource wall is the point.
const PASSIVE_REGEN_PER_FRAME = 0.03; // ~1.8/sec at 60fps
const POWER_GAIN = { punch: 10, kick: 12, slide: 14, uppercut: 16, special: 0 };
const BLOCK_POWER_GAIN = 8;

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

  // Called by game.js right after takeDamage sets state to "knockback" -
  // records the launch point/direction/distance so update() can fly the
  // fighter there over KNOCKBACK_DURATION instead of snapping instantly.
  setKnockbackMotion(dir, total) {
    this.knockbackStartX = this.x;
    this.knockbackDir = dir;
    this.knockbackTotal = total;
  }

  update(input) {
    this.lastEvent = null;

    if (this.state === "ko") {
      this.stateT++;
      return;
    }

    this.stateT++;

    // Power slowly refills on its own except while kicking - jump is free
    // (it's the dodge tool, including for the ranged special, so it can't be
    // gated behind a resource you might not have when you need to dodge).
    if (this.state !== "kick") {
      this.power = Math.min(MAX_POWER, this.power + PASSIVE_REGEN_PER_FRAME);
    }

    // slide and uppercut both hold their pose/travel on their own timers -
    // game.js's updateSlide/checkUppercutHit own the actual x movement and
    // hit detection for them, this just counts down back to idle. knockback
    // is never entered via input at all (see takeDamage), only ever reached
    // by getting hit by a slide.
    if (["punch", "kick", "special", "hitstun", "slide", "knockback", "uppercut"].includes(this.state)) {
      const durations = {
        punch: PUNCH.duration,
        kick: KICK.duration,
        special: SPECIAL.duration,
        hitstun: HITSTUN_FRAMES,
        slide: SLIDE.duration,
        knockback: KNOCKBACK_DURATION,
        uppercut: UPPERCUT.duration,
      };
      // Fires exactly once, the frame the cast animation completes - this is
      // what game.js listens for to actually spawn the projectile.
      if (this.state === "special" && this.stateT === SPECIAL.release) {
        this.lastEvent = "special-release";
      }
      // Real launch-and-land flight instead of the old instant teleport -
      // eased out (fast launch, decelerating into the landing) toward the
      // total distance set by setKnockbackMotion, driven off absolute t so
      // there's no drift/accumulation error frame to frame.
      if (this.state === "knockback" && this.knockbackDir) {
        const t = Math.min(1, this.stateT / KNOCKBACK_DURATION);
        const eased = 1 - (1 - t) * (1 - t);
        this.x = Math.max(
          50,
          Math.min(750, this.knockbackStartX + this.knockbackDir * this.knockbackTotal * eased),
        );
      }
      if (this.stateT >= durations[this.state]) this.setState("idle");
      return;
    }

    if (this.state === "jump") {
      this.applyMove(input);
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
    // Crouch locks you in place - no shuffling while ducked, and it doesn't
    // engage over any actual attack/jump input.
    if (
      input.crouch &&
      !input.punch &&
      !input.kick &&
      !input.special &&
      !input.jump &&
      !input.slide &&
      !input.uppercut
    ) {
      if (this.state !== "crouch") this.setState("crouch");
      return;
    }
    if (input.special && this.power >= SPECIAL.cost) {
      this.spendPower(SPECIAL.cost);
      this.setState("special");
      this.lastEvent = "special-start";
      return;
    }
    if (input.jump) {
      this.setState("jump");
      this.lastEvent = "jump-start";
      return;
    }
    if (input.uppercut) {
      this.setState("uppercut");
      this.lastEvent = "uppercut-start";
      return;
    }
    if (input.slide) {
      this.setState("slide");
      this.lastEvent = "slide-start";
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

    const vx = this.applyMove(input);
    this.state = vx !== 0 ? "walk" : "idle";
  }

  // Collision (keeping the two fighters from ever overlapping) is resolved
  // symmetrically by the caller after both fighters have moved - see
  // resolveCollision in game.js. Doing it here per-fighter, keyed off each
  // one's own static facing, didn't account for the opponent's own movement
  // and could still let them slide past each other.
  applyMove(input) {
    const speed = MOVE_SPEED * this.archetype.speedMult;
    let vx = 0;
    if (input.left) vx -= speed;
    if (input.right) vx += speed;
    this.x += vx;
    this.x = Math.max(50, Math.min(750, this.x));
    return vx;
  }

  // Covers real jump, uppercut's own (shorter) rise, and knockback's launch
  // arc - all the same parabola shape, different height/duration - so
  // body.js's draw code can stay untouched and just read one property
  // regardless of which move it is.
  get jumpOffset() {
    if (this.state === "jump") {
      const t = Math.min(1, this.stateT / JUMP_DURATION);
      return JUMP_HEIGHT * 4 * t * (1 - t);
    }
    if (this.state === "uppercut") {
      const t = Math.min(1, this.stateT / UPPERCUT.duration);
      return UPPERCUT.height * 4 * t * (1 - t);
    }
    if (this.state === "knockback") {
      const t = Math.min(1, this.stateT / KNOCKBACK_DURATION);
      return KNOCKBACK_ARC_HEIGHT * 4 * t * (1 - t);
    }
    return 0;
  }

  // Special has no melee hitbox of its own anymore - see spawnProjectile in
  // game.js, which handles its hit detection independently once the
  // projectile it fires is actually in flight.
  attackHitbox() {
    const spec = this.state === "punch" ? PUNCH : this.state === "kick" ? KICK : null;
    if (!spec) return null;
    if (this.stateT < spec.activeStart || this.stateT > spec.activeEnd) return null;
    if (this.hasHit) return null;
    return {
      from: this.x,
      to: this.x + this.facing * spec.range,
      damage: spec.damage * this.archetype.damageMult,
      isPunch: spec === PUNCH,
      kind: spec === PUNCH ? "punch" : "kick",
    };
  }

  get specialDamage() {
    return SPECIAL.damage * this.archetype.damageMult;
  }

  get builderSpecialDamage() {
    return BUILDER_SPECIAL.damage * this.archetype.damageMult;
  }

  get hodlerSpecialDamage() {
    return HODLER_SPECIAL.damage * this.archetype.damageMult;
  }

  get slideDamage() {
    return SLIDE.damage * this.archetype.damageMult;
  }

  get uppercutDamage() {
    return UPPERCUT.damage * this.archetype.damageMult;
  }

  // kind is whatever attackHitbox()/updateSlide/checkUppercutHit call this
  // with ("punch"/"kick"/"slide"/"uppercut"/"special") - landing any real
  // hit builds power now, not just a punch, so kick/slide/uppercut (which
  // all cost power - see input handling above, or in slide/uppercut's case
  // spend the risk of missing) get some of it back on a successful hit.
  onLandedHit(kind) {
    const gain = POWER_GAIN[kind] ?? 0;
    if (gain > 0) this.power = Math.min(MAX_POWER, this.power + gain);
  }

  takeDamage(amount, fromX, kind) {
    // Hodler's own special is a holding stance, not just a strike - it
    // blocks whatever the opponent throws at it the same as a real block,
    // matching every other archetype's special still costing the same power
    // and lockout window for the privilege.
    const isHolding = this.data.hoodieType === "Hodler" && this.state === "special";
    // Specials and slides both blow straight through a raised guard - full
    // damage even if the defender was holding block when it landed. A slide
    // is meant to be dodged by jumping over it, not blocked; block doing
    // nothing against it makes that the actual answer instead of a false one.
    if ((this.state === "block" || isHolding) && kind !== "special" && kind !== "slide") {
      this.health -= amount * 0.2 * this.archetype.blockMult;
      // A successful block is real defensive skill, not just standing
      // there - rewarding it with power gives blocking a reason to exist
      // beyond just "take less damage this once".
      this.power = Math.min(MAX_POWER, this.power + BLOCK_POWER_GAIN);
      this.lastEvent = "block-taken";
    } else {
      this.health -= amount;
      // A slide connecting gets its own reaction pose/knockback instead of
      // the generic hitstun - see updateSlide in game.js for the actual
      // push, this just picks which animation plays while it happens.
      this.setState(kind === "slide" ? "knockback" : "hitstun");
      this.lastEvent = "hit-taken";
    }
    this.health = Math.max(0, this.health);
    if (this.health <= 0) {
      this.setState("ko");
      this.lastEvent = "ko";
    }
  }
}
