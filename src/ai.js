// Simple rule-based CPU opponent - no ML, just distance checks and timed
// decisions. Produces the exact same input shape readInput() does, so
// game.js can drive an AI fighter through the identical update() path a
// real player uses instead of needing a special case.

const ENGAGE_RANGE = 95; // close the gap if farther than this
const ATTACK_RANGE = 82; // attempt an attack once this close
const THINK_INTERVAL_MIN = 8; // frames between re-decisions - not every frame,
const THINK_INTERVAL_MAX = 16; // reads as reaction time instead of an aimbot

function emptyInput() {
  return {
    left: false,
    right: false,
    block: false,
    crouch: false,
    jump: false,
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
      input[towardOpponent] = true;
      // Rarely jump in from further out instead of always walking.
      if (dist > ENGAGE_RANGE * 2 && self.power >= 15 && Math.random() < 0.15) {
        input.jump = true;
      }
      return;
    }

    if (dist <= ATTACK_RANGE) {
      const roll = Math.random();
      if (self.power >= 50 && roll < 0.25) {
        input.special = true;
      } else if (self.power >= 20 && roll < 0.55) {
        input.kick = true;
      } else if (roll < 0.85) {
        input.punch = true;
      } else {
        // Hold ground and block rather than always swinging - keeps it from
        // reading as a button-mashing bot.
        input.block = true;
      }
      return;
    }

    // In the gap between attack range and engage range - close in slowly.
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
