import { drawFighter, drawArena, drawFlash } from "./body.js";
import { MAX_POWER } from "./fighter.js";
import { playSound, playJumpWhoosh } from "./sound.js";

const KEYMAP = {
  p1: { left: "a", right: "d", block: "s", jump: "w", punch: "f", kick: "g", special: "r" },
  p2: {
    left: "arrowleft",
    right: "arrowright",
    block: "arrowdown",
    jump: "arrowup",
    punch: "k",
    kick: "l",
    special: "j",
  },
};

const SHAKE_ON_HIT = 6;
const SHAKE_ON_SPECIAL = 12;
const FLASH_ON_HIT = 0.25;

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
      jump: pressed.has(map.jump),
      punch: pressed.has(map.punch),
      kick: pressed.has(map.kick),
      special: pressed.has(map.special),
    };
  }

  let timeLeft = 60;
  let frame = 0;
  let ended = false;
  let shake = 0;
  let flash = 0;
  const powerFullFired = { p1: false, p2: false };

  function checkHit(attacker, defender) {
    const box = attacker.attackHitbox();
    if (!box) return;
    if (defender.state === "jump") return;
    const lo = Math.min(box.from, box.to);
    const hi = Math.max(box.from, box.to);
    if (defender.x >= lo && defender.x <= hi) {
      attacker.hasHit = true;
      defender.takeDamage(box.damage, attacker.x);
      attacker.onLandedHit(box.isPunch);
      attacker.lastEvent = `${attacker.state}-hit`;
      shake = Math.max(shake, attacker.state === "special" ? SHAKE_ON_SPECIAL : SHAKE_ON_HIT);
      flash = Math.max(flash, FLASH_ON_HIT);
    }
  }

  function handleSounds(fighter) {
    switch (fighter.lastEvent) {
      case "punch-hit":
        playSound("punch");
        break;
      case "kick-hit":
      case "special-hit":
        playSound("kick", { rate: fighter.lastEvent === "special-hit" ? 0.75 : 1 });
        break;
      case "block-taken":
        playSound("block");
        break;
      case "hit-taken":
        playSound("hit");
        break;
      case "jump-start":
        playJumpWhoosh();
        break;
      case "special-start":
        playSound("powerfull", { rate: 1.15 });
        break;
      case "ko":
        playSound("ko");
        break;
    }
  }

  function updateHud() {
    document.getElementById("p1-health").style.width = `${(p1.health / p1.maxHealth) * 100}%`;
    document.getElementById("p2-health").style.width = `${(p2.health / p2.maxHealth) * 100}%`;

    const p1PowerPct = (p1.power / MAX_POWER) * 100;
    const p2PowerPct = (p2.power / MAX_POWER) * 100;
    const p1PowerEl = document.getElementById("p1-power");
    const p2PowerEl = document.getElementById("p2-power");
    p1PowerEl.style.width = `${p1PowerPct}%`;
    p2PowerEl.style.width = `${p2PowerPct}%`;
    p1PowerEl.classList.toggle("power-ready", p1PowerPct >= 100);
    p2PowerEl.classList.toggle("power-ready", p2PowerPct >= 100);

    if (p1PowerPct >= 100 && !powerFullFired.p1) {
      powerFullFired.p1 = true;
      playSound("powerfull");
    } else if (p1PowerPct < 100) powerFullFired.p1 = false;

    if (p2PowerPct >= 100 && !powerFullFired.p2) {
      powerFullFired.p2 = true;
      playSound("powerfull");
    } else if (p2PowerPct < 100) powerFullFired.p2 = false;
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
    handleSounds(p1);
    handleSounds(p2);
    updateHud();

    if (frame % 60 === 0 && timeLeft > 0) {
      timeLeft--;
      document.getElementById("timer").textContent = timeLeft;
    }

    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      shake *= 0.8;
      if (shake < 0.5) shake = 0;
    }
    drawArena(ctx, canvas.width, canvas.height);
    drawFighter(ctx, p1, 1);
    drawFighter(ctx, p2, 2);
    ctx.restore();

    if (flash > 0) {
      drawFlash(ctx, canvas.width, canvas.height, flash);
      flash *= 0.75;
      if (flash < 0.02) flash = 0;
    }

    if (p1.health <= 0 && p2.health <= 0) endRound(null);
    else if (p1.health <= 0) endRound(p2);
    else if (p2.health <= 0) endRound(p1);
    else if (timeLeft <= 0) {
      const p1Ratio = p1.health / p1.maxHealth;
      const p2Ratio = p2.health / p2.maxHealth;
      if (p1Ratio === p2Ratio) endRound(null);
      else endRound(p1Ratio > p2Ratio ? p1 : p2);
    }

    if (!ended) requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  return () => {
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
  };
}
