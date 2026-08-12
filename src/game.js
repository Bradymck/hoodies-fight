import {
  drawFighter,
  drawArena,
  drawFlash,
  drawBloodSpot,
  drawBloodSpatter,
  drawBloodSplatExtra,
  pickBloodSpotVariant,
  pickBloodSplatVariant,
  drawHeadPop,
  BLOOD_SPATTER_TOTAL_FRAMES,
  HEAD_POP_DURATION,
  GROUND_Y,
} from "./body.js";
import { MAX_POWER } from "./fighter.js";
import { playSound } from "./sound.js";

const KEYMAP = {
  p1: {
    left: "a",
    right: "d",
    block: "c",
    crouch: "s",
    jump: " ",
    jump2: "w",
    punch: "f",
    kick: "g",
    special: "r",
  },
  p2: {
    left: "arrowleft",
    right: "arrowright",
    block: "m",
    crouch: "arrowdown",
    jump: "arrowup",
    punch: "k",
    kick: "l",
    special: "j",
  },
};

const SHAKE_ON_HIT = 6;
const SHAKE_ON_SPECIAL = 12;
const FLASH_ON_HIT = 0.25;
const SPATTER_TICKS_PER_FRAME = 3;
const MAX_GROUND_BLOOD = 90;
// Solid-body distance the two fighters can never close past - matches the
// actual rendered sprite width (~60px at full scale) so their bodies visibly
// meet without overlapping, not just an arbitrary small number. Attack
// ranges (fighter.js) are all sized to clear this with margin.
const MIN_FIGHTER_GAP = 68;
const ARENA_MIN_X = 50;
const ARENA_MAX_X = 750;

// Pushes both fighters apart symmetrically whenever they'd overlap, instead
// of each fighter unilaterally checking only its own (static) facing - that
// old approach didn't account for the opponent's own movement and let them
// slide past each other. Clamping each side to the arena bounds
// independently after a naive symmetric push isn't enough on its own: if one
// side is pinned against a wall, its half of the push gets silently
// swallowed by the clamp and the other side never receives it, letting the
// pair stay overlapped (or, at the extreme, the wall-pinned one gets read as
// "off" its own clamped position because the other overshoots). Instead each
// side's shortfall against the wall is measured and handed to the other side
// so the full gap is still enforced.
function resolveCollision(a, b) {
  const dx = b.x - a.x;
  if (Math.abs(dx) >= MIN_FIGHTER_GAP) return;
  const dir = dx >= 0 ? 1 : -1;
  const overlap = MIN_FIGHTER_GAP - Math.abs(dx);
  const halfPush = (dir * overlap) / 2;

  const aTarget = a.x - halfPush;
  const bTarget = b.x + halfPush;
  const aClamped = Math.max(ARENA_MIN_X, Math.min(ARENA_MAX_X, aTarget));
  const bClamped = Math.max(ARENA_MIN_X, Math.min(ARENA_MAX_X, bTarget));
  // Whatever either side couldn't take because it hit a wall gets handed to
  // the other side, so the full gap is still enforced even when one fighter
  // is pinned - a one-directional version of this let the pinned side's
  // shortfall just vanish, silently leaving the pair overlapped.
  const aShortfall = aTarget - aClamped;
  const bShortfall = bTarget - bClamped;
  a.x = Math.max(ARENA_MIN_X, Math.min(ARENA_MAX_X, aClamped - bShortfall));
  b.x = Math.max(ARENA_MIN_X, Math.min(ARENA_MAX_X, bClamped - aShortfall));
}

const SCROLL_KEYS = new Set([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"]);

export function createGame({ ctx, canvas, p1, p2, onEnd, timeLimit = 60 }) {
  const pressed = new Set();
  const keydown = (e) => {
    const key = e.key.toLowerCase();
    if (SCROLL_KEYS.has(key)) e.preventDefault();
    pressed.add(key);
  };
  const keyup = (e) => pressed.delete(e.key.toLowerCase());
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);

  function readInput(map) {
    return {
      left: pressed.has(map.left),
      right: pressed.has(map.right),
      block: pressed.has(map.block),
      crouch: pressed.has(map.crouch),
      jump: pressed.has(map.jump) || (map.jump2 && pressed.has(map.jump2)),
      punch: pressed.has(map.punch),
      kick: pressed.has(map.kick),
      special: pressed.has(map.special),
    };
  }

  let timeLeft = timeLimit;
  let frame = 0;
  let ended = false;
  let shake = 0;
  let flash = 0;
  const powerFullFired = { p1: false, p2: false };
  const groundBlood = [];
  const spatters = [];
  const splatExtras = [];
  const headPops = [];

  // Rough head height rather than a per-frame anchor lookup - matches the
  // same level-of-precision the blood-spatter positioning already uses.
  const HEAD_Y = GROUND_Y - 95;

  // fighter.x is the LEFT EDGE of the sprite's full bounding box, not its
  // visual center - drawFighter always translates to x then draws the frame
  // running rightward from there, for both facings (mirroring flips content
  // within that box, not the box's position). Every position calculated off
  // a fighter for blood/FX purposes needs this offset or it lands entirely
  // inside that fighter's own silhouette instead of at their actual body.
  const BODY_CENTER_OFFSET = 53;

  function spawnBloodEffects(defender, attacker) {
    const defenderCenterX = defender.x + BODY_CENTER_OFFSET;
    const attackerCenterX = attacker.x + BODY_CENTER_OFFSET;

    // Ground spots spray wide around the contact point instead of a tight
    // cluster - several per hit, reads as a real gory mess, not a dot.
    const spotCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < spotCount; i++) {
      groundBlood.push({
        imgIndex: pickBloodSpotVariant(),
        x: defenderCenterX + (Math.random() - 0.5) * 70,
        y: GROUND_Y + 2 + Math.random() * 14,
        size: 14 + Math.random() * 20,
        rotation: Math.random() * Math.PI * 2,
      });
    }
    while (groundBlood.length > MAX_GROUND_BLOOD) groundBlood.shift();

    // Anchored between the two fighters' actual visual centers, offset
    // toward wherever the attacker actually is - NOT the defender's own
    // (static, never-changing) facing, which pointed the wrong way whenever
    // the real attacker was standing behind that fixed direction, and NOT
    // raw defender.x either, which is that fighter's left edge rather than
    // their body - anchoring there and then offsetting further toward the
    // attacker landed the burst inside the ATTACKER's own silhouette.
    // Scales with the actual gap between them (~68-94px depending on the
    // move) instead of a small fixed nudge. Biased 40% of the way rather
    // than a true 50/50 midpoint - the attacker's own lunge animation pushes
    // them visually closer than their logical x, so a true midpoint reads as
    // skewed toward the attacker. Height varies by attack type so a kick
    // lands lower than a punch/special.
    const gapX = Math.abs(attackerCenterX - defenderCenterX);
    const towardAttacker = attackerCenterX >= defenderCenterX ? 1 : -1;
    const contactHeight = attacker.state === "kick" ? GROUND_Y - 20 : GROUND_Y - 50;
    const contactX = defenderCenterX + towardAttacker * (gapX * 0.4);

    // A static splat layered behind the animated burst first, for extra
    // density - fully randomized position/rotation/scale each time so
    // stacking several hits' worth never looks like the same stamp reused.
    const splatCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < splatCount; i++) {
      splatExtras.push({
        x: contactX + (Math.random() - 0.5) * 24,
        y: contactHeight + (Math.random() - 0.5) * 20,
        variant: pickBloodSplatVariant(),
        rotation: Math.random() * Math.PI * 2,
        scale: 0.7 + Math.random() * 0.6,
      });
    }
    while (splatExtras.length > MAX_GROUND_BLOOD) splatExtras.shift();

    const burstCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < burstCount; i++) {
      spatters.push({
        x: contactX + (Math.random() - 0.5) * 14,
        y: contactHeight + (Math.random() - 0.5) * 16,
        rotation: Math.random() * Math.PI * 2,
        t: -Math.floor(Math.random() * 3),
      });
    }
  }

  function checkHit(attacker, defender) {
    const box = attacker.attackHitbox();
    if (!box) return;
    if (defender.state === "jump") return;
    // Ducking clears kicks clean over the top - punches and the unblockable
    // special still connect through a crouch, only the low kick whiffs.
    if (defender.state === "crouch" && box.kind === "kick") return;
    const lo = Math.min(box.from, box.to);
    const hi = Math.max(box.from, box.to);
    if (defender.x >= lo && defender.x <= hi) {
      const wasBlocking = defender.state === "block" && box.kind !== "special";
      attacker.hasHit = true;
      defender.takeDamage(box.damage, attacker.x, box.kind);
      attacker.onLandedHit(box.isPunch);
      attacker.lastEvent = `${attacker.state}-hit`;
      shake = Math.max(shake, attacker.state === "special" ? SHAKE_ON_SPECIAL : SHAKE_ON_HIT);
      flash = Math.max(flash, FLASH_ON_HIT);
      if (!wasBlocking) spawnBloodEffects(defender, attacker);
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
        playSound("jump");
        break;
      case "special-start":
        playSound("powerfull", { rate: 1.15 });
        break;
      case "ko":
        playSound("ko");
        headPops.push({ x: fighter.x, y: HEAD_Y, t: 0 });
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

  // Prefers a quote the fighter hasn't already said pre-fight (their
  // taunt), so the win screen doesn't just repeat the intro line. Falls
  // back to the taunt itself if that's all they've got recorded.
  function pickVictoryQuote(fighter) {
    const history = fighter.data.talkHistory ?? [];
    const fresh = history.filter((q) => q !== fighter.data.taunt);
    const pool = fresh.length > 0 ? fresh : history;
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
    return fighter.data.taunt ?? null;
  }

  function endRound(winner) {
    if (ended) return;
    ended = true;
    document.getElementById("result-title").textContent = winner ? `${winner.name} WINS!` : "DRAW";
    const quote = winner ? pickVictoryQuote(winner) : null;
    document.getElementById("result-quote").textContent = quote ? `"${quote}"` : "";
    document.getElementById("result").classList.remove("hidden");
    if (onEnd) onEnd(winner);
  }

  function loop() {
    if (ended) return;
    frame++;

    p1.update(readInput(KEYMAP.p1));
    p2.update(readInput(KEYMAP.p2));
    resolveCollision(p1, p2);

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
    // Ground blood draws in front of both fighters, not underneath - at
    // close range a lunging attack sprite can visually overlap the
    // defender's spot and hide/misattribute a decal drawn below them.
    for (const decal of groundBlood) drawBloodSpot(ctx, decal);
    // Static splats layer behind the animated spatter burst, per the extra
    // asset - drawn after the ground spots but before the burst itself.
    for (const s of splatExtras) {
      drawBloodSplatExtra(ctx, s.x, s.y, s.variant, s.rotation, s.scale);
    }
    for (let i = spatters.length - 1; i >= 0; i--) {
      const s = spatters[i];
      const spriteFrame = Math.floor(s.t / SPATTER_TICKS_PER_FRAME);
      if (spriteFrame >= BLOOD_SPATTER_TOTAL_FRAMES) {
        spatters.splice(i, 1);
        continue;
      }
      drawBloodSpatter(ctx, s.x, s.y, spriteFrame, s.rotation);
      s.t++;
    }
    for (let i = headPops.length - 1; i >= 0; i--) {
      const p = headPops[i];
      if (p.t >= HEAD_POP_DURATION) {
        headPops.splice(i, 1);
        continue;
      }
      drawHeadPop(ctx, p.x, p.y, p.t);
      p.t++;
    }
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

  document.getElementById("timer").textContent = timeLeft;
  requestAnimationFrame(loop);

  return () => {
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
  };
}
