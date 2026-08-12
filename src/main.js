import { loadFighterData } from "./api.js";
import { Fighter } from "./fighter.js";
import { createGame } from "./game.js";
import { initSound, playSound, playRandomTrack } from "./sound.js";
import { pickRandomArena, drawArena, drawFighter } from "./body.js";
import { speakTaunt } from "./tts.js";

const startBtn = document.getElementById("start-btn");
const setupStatus = document.getElementById("setup-status");

startBtn.addEventListener("click", async () => {
  const id1 = document.getElementById("p1-id").value;
  const id2 = document.getElementById("p2-id").value;

  startBtn.disabled = true;
  setupStatus.textContent = "Loading Hoodies...";
  // initSound() must be kicked off from this click handler - browsers block
  // audio until a real user gesture, and this is the closest one we get.
  const soundReady = initSound();

  try {
    const [data1, data2] = await Promise.all([
      loadFighterData(id1),
      loadFighterData(id2),
      soundReady,
    ]);
    playSound("uiclick");

    document.getElementById("setup").classList.add("hidden");
    document.querySelector("h1").classList.add("hidden");
    document.getElementById("arena").classList.remove("hidden");
    document.getElementById("p1-name").textContent = `${data1.name} (${data1.hoodieType})`;
    document.getElementById("p2-name").textContent = `${data2.name} (${data2.hoodieType})`;

    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    playRandomTrack();
    await runMatch(data1, data2, canvas, ctx);
  } catch (err) {
    setupStatus.textContent = err.message;
    startBtn.disabled = false;
  }
});

const ROUNDS_TO_WIN = 2;
// A drawn round (timeout tie or double-KO) replays instead of counting -
// best-of-3 needs a decisive result each round to make progress. Repeated
// draws shrink the clock each retry so two evenly-matched players can't
// stall the match forever; sudden-death floor guarantees it resolves.
const DRAW_RETRY_TIME_LIMITS = [45, 30, 15];
const ROUND_RESULT_PAUSE_MS = 2200;

async function runMatch(data1, data2, canvas, ctx) {
  const wins = { p1: 0, p2: 0 };
  let roundNum = 1;
  let drawStreak = 0;

  while (wins.p1 < ROUNDS_TO_WIN && wins.p2 < ROUNDS_TO_WIN) {
    updateRoundInfo(roundNum, wins);

    const p1 = new Fighter(data1, 200, 1);
    const p2 = new Fighter(data2, 600, -1);
    pickRandomArena();
    // Bars would otherwise still show the previous round's ending values
    // (e.g. the loser's empty health bar) through the whole next countdown.
    resetBars();

    const stopPreFightRender = startPreFightRender(ctx, canvas, p1, p2);

    // Taunts only play out on the very first round - hearing the same two
    // lines (spoken aloud, no less) every single round gets old fast.
    let tauntsSpoken = Promise.resolve();
    if (roundNum === 1) {
      showTaunt("taunt-p1", data1.taunt);
      showTaunt("taunt-p2", data2.taunt);
      tauntsSpoken = Promise.all([speakTaunt(data1.taunt), speakTaunt(data2.taunt)]);
    }

    await runCountdown(tauntsSpoken);

    stopPreFightRender();
    document.getElementById("taunt-p1").classList.add("hidden");
    document.getElementById("taunt-p2").classList.add("hidden");

    const timeLimit = drawStreak > 0
      ? DRAW_RETRY_TIME_LIMITS[Math.min(drawStreak - 1, DRAW_RETRY_TIME_LIMITS.length - 1)]
      : 60;

    const winner = await new Promise((resolve) => {
      const stopGame = createGame({
        ctx,
        canvas,
        p1,
        p2,
        timeLimit,
        onEnd: (w) => {
          stopGame();
          resolve(w);
        },
      });
    });

    if (winner === p1) {
      wins.p1++;
      drawStreak = 0;
    } else if (winner === p2) {
      wins.p2++;
      drawStreak = 0;
    } else {
      drawStreak++;
    }

    const matchWinner = wins.p1 >= ROUNDS_TO_WIN ? p1 : wins.p2 >= ROUNDS_TO_WIN ? p2 : null;
    if (matchWinner) {
      const title = document.getElementById("result-title");
      title.textContent = `${matchWinner.name} WINS THE MATCH! (${wins.p1}-${wins.p2})`;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, ROUND_RESULT_PAUSE_MS));
    document.getElementById("result").classList.add("hidden");
    if (winner) roundNum++;
    // A draw replays the same round number rather than advancing it.
  }
}

function resetBars() {
  for (const id of ["p1-health", "p2-health"]) {
    document.getElementById(id).style.width = "100%";
  }
  for (const id of ["p1-power", "p2-power"]) {
    const el = document.getElementById(id);
    el.style.width = "0%";
    el.classList.remove("power-ready");
  }
}

function updateRoundInfo(roundNum, wins) {
  document.getElementById("round-info").textContent =
    `ROUND ${roundNum} · ${wins.p1} - ${wins.p2}`;
}

function startPreFightRender(ctx, canvas, p1, p2) {
  let raf = requestAnimationFrame(function frame() {
    drawArena(ctx, canvas.width, canvas.height);
    drawFighter(ctx, p1, 1);
    drawFighter(ctx, p2, 2);
    raf = requestAnimationFrame(frame);
  });
  return () => cancelAnimationFrame(raf);
}

function showTaunt(elId, text) {
  const el = document.getElementById(elId);
  if (!text) return;
  el.textContent = `"${text}"`;
  el.classList.remove("hidden");
}

function showStep(el, text) {
  el.textContent = text;
  el.classList.remove("hidden");
  // Restart the pop-in animation on every step (just toggling the class
  // wouldn't retrigger it since it'd already be "on").
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
}

// Ticks through 3/2/1 on a fixed clock, then holds on "1" until both taunts
// have actually finished playing before showing FIGHT! - a taunt can easily
// run past a bare 2-second countdown, and cutting it off mid-line felt
// broken. Capped so a stalled/blocked speechSynthesis can't hang the fight.
const TAUNT_WAIT_CAP_MS = 6000;

async function runCountdown(tauntsSpoken) {
  const el = document.getElementById("countdown");
  for (const step of ["3", "2", "1"]) {
    showStep(el, step);
    await new Promise((resolve) => setTimeout(resolve, 650));
  }
  await Promise.race([
    tauntsSpoken,
    new Promise((resolve) => setTimeout(resolve, TAUNT_WAIT_CAP_MS)),
  ]);
  showStep(el, "FIGHT!");
  await new Promise((resolve) => setTimeout(resolve, 650));
  el.classList.add("hidden");
}
