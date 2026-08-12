// Simple rule-based CPU opponent - no ML, just distance checks and timed
// decisions. Produces the exact same input shape readInput() does, so
// game.js can drive an AI fighter through the identical update() path a
// real player uses instead of needing a special case.

const ENGAGE_RANGE = 95; // close the gap if farther than this
const ATTACK_RANGE = 82; // attempt an attack once this close
const SLIDE_REACT_RANGE = 220; // slide closes distance fast, so react to it from further out than a normal swing
const UPPERCUT_REACT_RANGE = 110; // only worth anti-airing a jump that's actually closing in
const THINK_INTERVAL_MIN = 8; // frames between re-decisions - not every frame,
const THINK_INTERVAL_MAX = 16; // reads as reaction time instead of an aimbot

function emptyInput() {
  return {
    left: false,
    right: false,
    block: false,
    crouch: false,
    jump: false,
    uppercut: false,
    slide: false,
    punch: false,
    kick: false,
    special: false,
  };
}

export function createAIController(self, opponent) {
  let input = emptyInput();
  let thinkAt = 0;
  let frame = 0;

  function decide() {
    input = emptyInput();
    const dx = opponent.x - self.x;
    const dist = Math.abs(dx);
    const towardOpponent = dx > 0 ? "right" : "left";

    // A slide can only actually be answered by jumping it - block and crouch
    // both do nothing against it - so it gets its own reaction check ahead
    // of the generic one below, at high odds (jumping it is close to the
    // only sane response) and across a wider window than a normal swing
    // since it closes distance instead of staying in place.
    if (opponent.state === "slide" && dist < SLIDE_REACT_RANGE && Math.random() < 0.7) {
      input.jump = true;
      return;
    }
    // Opponent jumping in close is exactly what the uppercut exists to
    // punish - occasionally take the anti-air instead of just blocking/
    // waiting, so the AI actually uses the move rather than only ever
    // eating jump-ins.
    if (opponent.state === "jump" && dist < UPPERCUT_REACT_RANGE && Math.random() < 0.35) {
      input.uppercut = true;
      return;
    }

    // React to the opponent actively attacking - duck a kick, block a punch,
    // roughly half the time so it isn't a perfect read every single swing.
    const opponentAttacking = ["punch", "kick", "special"].includes(opponent.state) && opponent.stateT < 10;
    if (opponentAttacking && dist < ATTACK_RANGE + 20 && Math.random() < 0.5) {
      if (opponent.state === "kick" && Math.random() < 0.6) {
        input.crouch = true;
      } else if (opponent.state !== "special") {
        input.block = true;
      }
      return;
    }

    if (dist > ENGAGE_RANGE) {
      // Special is a thrown projectile now, not a melee move - it's just as
      // usable from across the arena as it is up close, so take the shot
      // instead of always closing distance first.
      if (self.power >= 50 && Math.random() < 0.25) {
        input.special = true;
        return;
      }
      // Slide covers ground fast - a real alternative to walking in from a
      // distance, not just a close-range finisher.
      if (Math.random() < 0.15) {
        input.slide = true;
        return;
      }
      input[towardOpponent] = true;
      // Rarely jump in from further out instead of always walking - jump is
      // free now, no power gate needed.
      if (dist > ENGAGE_RANGE * 2 && Math.random() < 0.15) {
        input.jump = true;
      }
      return;
    }

    if (dist <= ATTACK_RANGE) {
      const roll = Math.random();
      if (self.power >= 50 && roll < 0.2) {
        input.special = true;
      } else if (self.power >= 20 && roll < 0.45) {
        input.kick = true;
      } else if (roll < 0.6) {
        input.slide = true;
      } else if (roll < 0.9) {
        input.punch = true;
      } else {
        // Hold ground and block rather than always swinging - keeps it from
        // reading as a button-mashing bot.
        input.block = true;
      }
      return;
    }

    // In the gap between attack range and engage range - take a pot-shot
    // with the ranged special or a slide sometimes instead of always just
    // closing in on foot.
    const roll = Math.random();
    if (self.power >= 50 && roll < 0.2) {
      input.special = true;
      return;
    }
    if (roll < 0.35) {
      input.slide = true;
      return;
    }
    input[towardOpponent] = true;
  }

  return function getInput() {
    frame++;
    if (frame >= thinkAt) {
      decide();
      thinkAt = frame + THINK_INTERVAL_MIN + Math.floor(Math.random() * (THINK_INTERVAL_MAX - THINK_INTERVAL_MIN));
    }
    return input;
  };
}
