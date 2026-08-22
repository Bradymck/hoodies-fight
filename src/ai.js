// Simple rule-based CPU opponent - no ML, just distance checks and timed
// decisions. Produces the exact same input shape readInput() does, so
// game.js can drive an AI fighter through the identical update() path a
// real player uses instead of needing a special case.

import {
  SLIDE,
  UPPERCUT,
  PUNCH_POSES,
  KICK_POSES,
  CROUCH_LIGHT,
  CROUCH_MEDIUM,
  CROUCH_HEAVY,
  AIR_LIGHT,
  AIR_MEDIUM,
  AIR_HEAVY,
  AIR_FINISHER,
  AIR_KICK_POSES,
  JUGGLE_FINISHER,
  BURST_COST,
} from "./fighter.js";

// Every non-grounded-kick attack pose the defensive react-check below treats
// as "hold back" material - standing Light/Heavy (PUNCH_POSES), both
// crouching punches AND the crouching kick (crouchKick still gets blocked by
// a standing guard too - see takeDamage's own blockedByStanding, which only
// ever excludes kind "special"/"slide", nothing crouch-specific), and every
// airborne melee pose (a jump-in has to be guarded standing, ducking doesn't
// save you from one - see checkAirAttackHit/checkAirPunchHit in game.js).
// Real per-state lists (not bare string checks) for the same future-proofing
// reason fighter.js's own PUNCH_POSES/KICK_POSES stay real exported lists -
// this whole file goes blind to any of these otherwise the instant a pose
// gets renamed or a new one gets added, exactly the class of bug this sweep
// exists to catch.
const HOLD_BACK_POSES = [
  ...PUNCH_POSES,
  CROUCH_LIGHT.state,
  CROUCH_MEDIUM.state,
  CROUCH_HEAVY.state,
  AIR_LIGHT.state,
  AIR_HEAVY.state,
  AIR_FINISHER.state,
  ...AIR_KICK_POSES,
];

const ENGAGE_RANGE = 95; // close the gap if farther than this
const ATTACK_RANGE = 82; // attempt an attack once this close
const SLIDE_REACT_RANGE = 220; // slide closes distance fast, so react to it from further out than a normal swing
const UPPERCUT_REACT_RANGE = 110; // only worth anti-airing a jump that's actually closing in
// fighter.js's own JUGGLE_SPIKE_MIN_HITS (isJuggleSpike there) - not
// exported (only BURST_COST was worth adding to fighter.js's export list
// for this pass), matched here as a plain literal instead. Reused below to
// decide when a juggle sequence is deep enough to reach for an ender
// (AIR_FINISHER/JUGGLE_FINISHER) instead of just extending it further.
const JUGGLE_SPIKE_MIN_HITS = 3;
// Small, offense-only launcher probability (see the offensive-uppercut
// branch in decide() below) - every OTHER `input.uppercut` write in this
// file is purely reactive (anti-air, or the blockLow-punish rung of the
// ATTACK_RANGE ladder further down), so this is the one place the AI ever
// throws it as a genuine opener. Deliberately low even at max difficulty -
// this is meant to read as an occasional read that keeps the juggle system
// two-sided, not a spammed launcher.
const OFFENSIVE_UPPERCUT_CHANCE = 0.08;
// Both reaction speed and every reactive/opportunistic probability below
// scale off this - starts noticeably softer than the old fixed baseline (a
// new player should be able to land real hits before the fight gets hard)
// and ramps up as the AI actually takes damage, ending a bit sharper than
// the old baseline once it's genuinely hurt. Tied to the AI's own health
// ratio rather than elapsed time, so it's "get damage in to make it
// harder", not just "wait it out."
const DIFFICULTY_MIN = 0.35;
const DIFFICULTY_MAX = 1.15;
const THINK_INTERVAL_MIN = 10; // frames between re-decisions at difficulty 1.0
const THINK_INTERVAL_MAX = 20; // - divided by difficulty below, so it shrinks (faster reactions) as difficulty rises

function difficultyFor(self) {
  const damageRatio = 1 - self.health / self.maxHealth;
  return DIFFICULTY_MIN + (DIFFICULTY_MAX - DIFFICULTY_MIN) * Math.min(1, Math.max(0, damageRatio));
}

function emptyInput() {
  return {
    left: false,
    right: false,
    crouch: false,
    jump: false,
    uppercut: false,
    slide: false,
    light: false,
    medium: false,
    heavy: false,
    special: false,
    dashForward: false,
    dashBack: false,
  };
}

export function createAIController(self, opponent) {
  let input = emptyInput();
  let thinkAt = 0;
  let frame = 0;

  function decide(difficulty) {
    input = emptyInput();
    const dx = opponent.x - self.x;
    const dist = Math.abs(dx);
    const towardOpponent = dx > 0 ? "right" : "left";
    // Block has no dedicated input anymore (see fighter.js's isHoldingBack) -
    // holding the physical direction AWAY from the opponent is what guards
    // now, so everywhere this AI used to just set input.block = true, it now
    // holds this direction instead.
    const awayFromOpponent = towardOpponent === "right" ? "left" : "right";

    // Self-juggled escape (requirement 15's burst, fighter.js) - the ONLY
    // way out of "juggled" is entirely input-driven: a genuine RISING EDGE
    // of holding away from the opponent while airborne (fighter.js's own
    // justPressed.block, derived from isHoldingBack in _trackInput), never
    // a callable method - see BURST_COST/BURST_IMMUNITY_FRAMES/
    // BURST_PUSHOUT's own comments there for the full mechanic. Checked
    // first, ahead of every other reactive branch below - while
    // self.state === "juggled", fighter.js's own "juggled" branch reads
    // input ONLY for this one check (see its early return there), so every
    // other flag this file could set (attacks, guard, uppercut) is
    // completely inert anyway - nothing lost by returning immediately
    // either way.
    if (self.state === "juggled") {
      if (self.power >= BURST_COST) {
        // fighter.js's edge-detection compares THIS tick's held-back read
        // against this.prevInput.block, which reflects whatever `input`
        // was already doing on the last REAL frame before this decide()
        // call runs - not just what the previous decide() call intended.
        // If the AI was already holding away (e.g. it was mid-block
        // against the very swing that launched it), setting the same
        // direction again here is a no-op read to fighter.js (still
        // "held", never a fresh press) and the burst attempt would
        // silently do nothing. Leave this tick's press cleared instead
        // (emptyInput() above already defaults both directions false) so
        // the away flag reads false for at least one real frame -
        // guaranteeing the NEXT think tick's attempt is a genuine rising
        // edge fighter.js will actually honor. MAX_JUGGLE_FRAMES (150,
        // fighter.js) comfortably outlasts even this file's own
        // worst-case THINK_INTERVAL (up to ~57 frames at DIFFICULTY_MIN),
        // so there's real room left for that retry.
        if (!self.prevInput.block) {
          // Real chance, not a guaranteed escape - keeps a juggle
          // genuinely dangerous even against the AI (banking the power to
          // afford this in the first place is only the first gate - see
          // BURST_COST's own comment in fighter.js on why that's the
          // ONLY real lever available). Scales with difficulty the same
          // way every other reactive/opportunistic roll in this file
          // already does - DIFFICULTY_MIN bursts rarely (a new player
          // should be able to land a real juggle clean), DIFFICULTY_MAX
          // bursts often (a beat-up AI fighting for its life escapes
          // almost every time it can afford to).
          if (Math.random() < 0.2 + 0.6 * difficulty) {
            input[awayFromOpponent] = true;
          }
        }
      }
      return;
    }

    // Jumping a slide is still the clean, zero-damage answer and gets first
    // crack at it - high odds (close to the only sane response), wide
    // window (it closes distance instead of staying in place), scaled off a
    // high floor (0.5) instead of straight multiplying difficulty so even
    // at DIFFICULTY_MIN this is a ~68% per-think-tick roll instead of ~25%.
    // That's the odds IF this check runs, not the real-world dodge rate -
    // decide() (and this check with it) only fires on think ticks (see
    // getInput's frame >= thinkAt gate below, paced by THINK_INTERVAL_MIN/MAX
    // over difficulty), so how often this branch even gets evaluated while
    // a slide is active depends on think-tick cadence vs. the slide's own
    // active window, not just this roll alone.
    if (opponent.state === "slide" && dist < SLIDE_REACT_RANGE) {
      if (Math.random() < 0.5 + 0.5 * difficulty) {
        input.jump = true;
        return;
      }
      // Crouch+back (blockLow) is the OTHER thing that actually stops a
      // slide now - the low half of the standing/crouching guard mixup (see
      // fighter.js's takeDamage) - and doesn't need a jump's frame-perfect
      // timing, so a whiffed jump-read still has a real shot at only chip
      // damage instead of eating the slide clean. Deliberately a smaller,
      // separate roll rather than folded into the jump check above - this
      // is a fallback for missing the better answer, not a replacement for
      // it, and shouldn't make the slide trivially safe to throw into
      // either.
      if (Math.random() < 0.35 * difficulty) {
        input[awayFromOpponent] = true;
        input.crouch = true;
        return;
      }
    }
    // Opponent jumping in close is exactly what the uppercut exists to
    // punish - occasionally take the anti-air instead of just blocking/
    // waiting, so the AI actually uses the move rather than only ever
    // eating jump-ins.
    if (opponent.state === "jump" && dist < UPPERCUT_REACT_RANGE && Math.random() < 0.35 * difficulty) {
      input.uppercut = true;
      return;
    }

    // React to the opponent actively attacking - duck a standing Medium
    // (the one grounded pose a plain crouch dodges clean, see checkHit's own
    // box.kind==="kick" exclusion in game.js), hold back against everything
    // else (HOLD_BACK_POSES above - standing Light/Heavy, every crouching
    // attack, every airborne one), roughly half the time (scaled by
    // difficulty) so it isn't a perfect read every single swing. KICK_POSES
    // (not a literal state check) - future-proofs this against a later art
    // pass reintroducing combo-string pose variety (see fighter.js's own
    // comment on that list) without this silently going blind to anything
    // past the first hit of a string.
    const isGroundKickPose = KICK_POSES.includes(opponent.state);
    const opponentAttacking = (isGroundKickPose || HOLD_BACK_POSES.includes(opponent.state) || opponent.state === "special") && opponent.stateT < 10;
    if (opponentAttacking && dist < ATTACK_RANGE + 20 && Math.random() < 0.5 * difficulty) {
      if (isGroundKickPose && Math.random() < 0.6) {
        input.crouch = true;
      } else if (opponent.state !== "special") {
        input[awayFromOpponent] = true;
      }
      return;
    }

    // Opponent-juggled pursuit - the other side of the juggle system. A
    // launched HUMAN opponent is real free damage sitting in the air and
    // the old AI simply never followed up (no offensive uppercut anywhere,
    // no aerial attacks at all - the AI would let every launch just fall
    // back to the ground untouched). self.state === "juggled" already
    // returned above, so reaching here means self is free to act.
    if (opponent.state === "juggled") {
      // Already airborne (either from this exact pursuit's own jump entry
      // below on an earlier think tick, or incidentally from something
      // else, e.g. dodging a slide) - the one moment an air attack can
      // actually land on a juggled defender at all (checkAirAttackHit/
      // checkAirPunchHit in game.js don't exclude an airborne target the
      // way every grounded attack's own dodge logic already does - see
      // HOLD_BACK_POSES's own comment above). Deliberately NOT combined
      // with the jump press itself below in the same input object -
      // fighter.js's BUFFERABLE_ACTIONS buffers only ONE action per real
      // tick, checked in that array's own fixed order, and "jump" sits
      // ahead of every attack button in it; a same-tick {jump:true,
      // medium:true} would silently buffer only "jump" (a no-op - the
      // fresh press already handles jump directly, see fighter.js's own
      // neutral entry point) and the medium press would just never
      // register, buffered or otherwise. Splitting into two separate
      // think ticks - jump now (below), attack once self.state genuinely
      // reads "jump" (here) - sidesteps that collision entirely.
      if (self.state === "jump") {
        const spiked = opponent.juggleHits >= JUGGLE_SPIKE_MIN_HITS;
        if (spiked && self.power >= AIR_FINISHER.cost && Math.random() < 0.4) {
          // AIR_FINISHER needs crouch HELD alongside a fresh Light press
          // (see fighter.js's own crouch-gated check, right above the
          // plain AIR_LIGHT entry) - setting both together here reads as
          // exactly that combination.
          input.crouch = true;
          input.light = true;
        } else {
          // Mix the three real air buttons rather than only ever throwing
          // the one air-kick move - keeps the pursuit from reading as a
          // single deterministic string.
          const roll = Math.random();
          if (self.power >= AIR_MEDIUM.cost && roll < 0.5) {
            // AIR_MEDIUM (airKick/flyingKick) - the move whose own
            // comment in fighter.js calls out reaching a juggled defender
            // as its entire purpose.
            input.medium = true;
          } else if (self.power >= AIR_HEAVY.cost && roll < 0.75) {
            input.heavy = true;
          } else if (self.power >= AIR_LIGHT.cost) {
            input.light = true;
          }
        }
        return;
      }

      // Grounded - the Heavy+Special hold fighter.js's own neutral branch
      // reads as JUGGLE_FINISHER (a real "Scorpion pull" gap-closer that
      // walks the attacker underneath the juggled target on its own, see
      // that constant's own comment in fighter.js) fires straight off the
      // ground, no jump needed at all - lean on it once the sequence is
      // deep enough to actually afford ending it outright instead of
      // always climbing into the air first. Both flags set together here,
      // same as any other fresh offensive press in this file (both false
      // the previous tick) - fighter.js's own simultaneous-press check
      // fires the finisher immediately rather than arming its
      // grace-window fallback.
      if (opponent.juggleHits >= JUGGLE_SPIKE_MIN_HITS && self.power >= JUGGLE_FINISHER.cost && Math.random() < 0.3 * difficulty) {
        input.heavy = true;
        input.special = true;
        return;
      }

      // Otherwise close the distance if needed - every air-attack range
      // here (85-88, see AIR_LIGHT/AIR_MEDIUM/AIR_HEAVY above) clears
      // MIN_FIGHTER_GAP with the same real margin every melee range in
      // this file already does, same reasoning ATTACK_RANGE leans on -
      // then commit to the jump that starts the airborne branch above on
      // a later think tick, instead of idling while free damage floats
      // overhead.
      if (dist > ATTACK_RANGE) {
        input[towardOpponent] = true;
        return;
      }
      input.jump = true;
      return;
    }

    // Offensive uppercut - every OTHER `input.uppercut` write in this file
    // is purely reactive (the anti-air check above, or the blockLow-punish
    // rung of the ATTACK_RANGE ladder further below); this is the one
    // place the AI ever throws it as a genuine opener against a grounded,
    // non-blocking opponent, so the launcher/juggle system stays
    // two-sided instead of only ever punishing a human's own mistakes.
    // Restricted to "idle"/"walk" specifically (not crouch/block/blockLow/
    // any attack pose) - a real opening, not a read that happens to also
    // catch a guard.
    if (
      dist < ATTACK_RANGE &&
      self.power >= UPPERCUT.cost &&
      (opponent.state === "idle" || opponent.state === "walk") &&
      Math.random() < OFFENSIVE_UPPERCUT_CHANCE * difficulty
    ) {
      input.uppercut = true;
      return;
    }

    if (dist > ENGAGE_RANGE) {
      // Shared-roll ladder, same convention as the ATTACK_RANGE/potshot
      // ladders below (one roll, ascending cumulative thresholds) instead of
      // this branch's old independent-roll-per-check style. Bands:
      // special [0, 0.25d), slide [0.25d, 0.40d). Special is a thrown
      // projectile now, not a melee move - it's just as usable from across
      // the arena as it is up close, so take the shot instead of always
      // closing distance first, at its original 0.25d odds. Slide covers
      // ground fast - a real alternative to walking in from a distance, not
      // just a close-range finisher - and keeps its original 0.15d BAND
      // WIDTH (0.40d - 0.25d), matching its old odds when special had
      // already failed; the old code rolled slide's 0.15d independently
      // (so its true unconditional odds were (1 - 0.25d) * 0.15d, slightly
      // lower), but a same-size band on the shared roll is the closest
      // match to that intent under this file's established ladder
      // convention, and costs real power, so check for it first - otherwise
      // the AI "chooses" slide and just does nothing that frame once it
      // can't afford it.
      //
      // Slide's band is bounded on BOTH sides (roll >= 0.25d, not just
      // roll < 0.4d): when power is in [SLIDE.cost, 50) the AI can afford
      // slide but not special, so the special check above never runs for
      // this roll at all - without the lower bound, slide would then also
      // catch every roll in special's [0, 0.25d) band, firing at ~0.4d odds
      // instead of its intended ~0.15d band width whenever the AI is
      // mid-power (a common state during a real match).
      const roll = Math.random();
      if (self.power >= 50 && roll < 0.25 * difficulty) {
        input.special = true;
        return;
      }
      if (self.power >= SLIDE.cost && roll >= 0.25 * difficulty && roll < 0.4 * difficulty) {
        input.slide = true;
        return;
      }
      input[towardOpponent] = true;
      // Rarely jump in from further out instead of always walking - jump is
      // free now, no power gate needed.
      if (dist > ENGAGE_RANGE * 2 && Math.random() < 0.15 * difficulty) {
        input.jump = true;
      }
      return;
    }

    if (dist <= ATTACK_RANGE) {
      const roll = Math.random();
      // Medium and special both whiff clean over a crouching opponent, guard
      // raised or not (see checkHit's crouch/blockLow kick check and
      // updateProjectiles' crouch/blockLow dodge) - throwing them anyway
      // just burns power for nothing. Was the actual mechanism behind "hold
      // crouch, spam Light, win every time" against the OLD ai.js (Medium/
      // special wasted into a crouching opponent instead of the Light that
      // actually connects) - still true here regardless of which of the two
      // crouching states the opponent is actually in, which is the specific
      // thing to re-verify after adding blockLow: it must never regress back
      // into wasting power on a Medium/special against either one.
      if (opponent.state === "crouch" || opponent.state === "blockLow") {
        // blockLow is a genuine guard, not just a duck - it now stops both
        // slide and Light/Heavy (chip damage - see the high/low guard mixup
        // in fighter.js's takeDamage), so neither is the free punish plain
        // crouch still is. Uppercut is the one thing that actually beats it
        // clean (a crouching hurtbox still ducks Medium/special regardless,
        // but doesn't stop an anti-air) - lean on that instead specifically
        // when a guard is actually up. Against plain crouch (no guard
        // raised), slide stays the real free punish, same as before this
        // mechanic existed.
        if (opponent.state === "blockLow" && self.power >= UPPERCUT.cost && roll < 0.4) {
          input.uppercut = true;
        } else if (opponent.state === "crouch" && self.power >= SLIDE.cost && roll < 0.35) {
          input.slide = true;
        } else if (roll < 0.9) {
          input.light = true;
        } else {
          input[awayFromOpponent] = true;
        }
        return;
      }
      if (self.power >= 50 && roll < 0.2) {
        input.special = true;
      } else if (roll < 0.4) {
        // Medium - also free, same as Light/Heavy (MEDIUM_ATTACK.cost is 0,
        // fighter.js) - the `self.power >= 20` gate here was stale from
        // before Medium's cost was zeroed out and no longer reflects a real
        // resource requirement.
        input.medium = true;
      } else if (roll < 0.55) {
        // Heavy - free, same as Light, no power gate needed. Was entirely
        // missing from this ladder (the AI would defend against a Heavy but
        // never actually throw one itself) - real offense needs all three
        // rungs of the ladder represented, not just Light/Medium.
        input.heavy = true;
      } else if (self.power >= SLIDE.cost && roll < 0.65) {
        input.slide = true;
      } else if (roll < 0.9) {
        input.light = true;
      } else {
        // Hold ground and guard (hold back) rather than always swinging -
        // keeps it from reading as a button-mashing bot.
        input[awayFromOpponent] = true;
      }
      return;
    }

    // In the gap between attack range and engage range - take a pot-shot
    // with the ranged special or a slide sometimes instead of always just
    // closing in on foot.
    const roll = Math.random();
    if (self.power >= 50 && roll < 0.2 * difficulty) {
      input.special = true;
      return;
    }
    if (self.power >= SLIDE.cost && roll < 0.35 * difficulty) {
      input.slide = true;
      return;
    }
    input[towardOpponent] = true;
  }

  return function getInput() {
    frame++;
    if (frame >= thinkAt) {
      const difficulty = difficultyFor(self);
      decide(difficulty);
      const min = THINK_INTERVAL_MIN / difficulty;
      const max = THINK_INTERVAL_MAX / difficulty;
      thinkAt = frame + min + Math.floor(Math.random() * (max - min));
    }
    return input;
  };
}
