import { drawFighter, drawArena } from "./body.js";
import { MAX_HEALTH } from "./fighter.js";

const KEYMAP = {
  p1: { left: "a", right: "d", block: "s", punch: "f", kick: "g" },
  p2: { left: "arrowleft", right: "arrowright", block: "arrowdown", punch: "k", kick: "l" },
};

export function createGame({ ctx, canvas, p1, p2, onEnd }) {
  const pressed = new Set();
  const keydown = (e) => pressed.add(e.key.toLowerCase());
  const keyup = (e) => pressed.delete(e.key.toLowerCase());
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);

  function readInput(map) {
    return {
      left: pressed.has(map.left),
      right: pressed.has(map.right),
      block: pressed.has(map.block),
      punch: pressed.has(map.punch),
      kick: pressed.has(map.kick),
    };
  }

  let timeLeft = 60;
  let frame = 0;
  let ended = false;

  function checkHit(attacker, defender) {
    const box = attacker.attackHitbox();
    if (!box) return;
    const lo = Math.min(box.from, box.to);
    const hi = Math.max(box.from, box.to);
    if (defender.x >= lo && defender.x <= hi) {
      attacker.hasHit = true;
      defender.takeDamage(box.damage, attacker.x);
    }
  }

  function updateHealthBars() {
    document.getElementById("p1-health").style.width = `${(p1.health / MAX_HEALTH) * 100}%`;
    document.getElementById("p2-health").style.width = `${(p2.health / MAX_HEALTH) * 100}%`;
  }

  function endRound(winner) {
    if (ended) return;
    ended = true;
    const result = document.getElementById("result");
    result.textContent = winner ? `${winner.name} WINS!` : "DRAW";
    result.classList.remove("hidden");
    if (onEnd) onEnd(winner);
  }

  function loop() {
    if (ended) return;
    frame++;

    p1.update(readInput(KEYMAP.p1), p2);
    p2.update(readInput(KEYMAP.p2), p1);

    checkHit(p1, p2);
    checkHit(p2, p1);
    updateHealthBars();

    if (frame % 60 === 0 && timeLeft > 0) {
      timeLeft--;
      document.getElementById("timer").textContent = timeLeft;
    }

    drawArena(ctx, canvas.width, canvas.height);
    drawFighter(ctx, p1, 1);
    drawFighter(ctx, p2, 2);

    if (p1.health <= 0 && p2.health <= 0) endRound(null);
    else if (p1.health <= 0) endRound(p2);
    else if (p2.health <= 0) endRound(p1);
    else if (timeLeft <= 0) {
      if (p1.health === p2.health) endRound(null);
      else endRound(p1.health > p2.health ? p1 : p2);
    }

    if (!ended) requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  return () => {
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
  };
}
