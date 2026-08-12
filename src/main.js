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
    pickRandomArena();

    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const p1 = new Fighter(data1, 200, 1);
    const p2 = new Fighter(data2, 600, -1);

    // Head images were just pointed at a URL (see Fighter constructor) and
    // load async, so they're almost never ready on this very first draw.
    // Keep redrawing every frame through the whole countdown instead of
    // drawing once, so the heads pop in the moment they finish loading
    // rather than staying missing until the real fight loop takes over.
    const stopPreFightRender = startPreFightRender(ctx, canvas, p1, p2);

    showTaunt("taunt-p1", data1.taunt);
    showTaunt("taunt-p2", data2.taunt);
    const tauntsSpoken = Promise.all([speakTaunt(data1.taunt), speakTaunt(data2.taunt)]);

    await runCountdown(tauntsSpoken);

    stopPreFightRender();
    document.getElementById("taunt-p1").classList.add("hidden");
    document.getElementById("taunt-p2").classList.add("hidden");
    playRandomTrack();
    createGame({ ctx, canvas, p1, p2 });
  } catch (err) {
    setupStatus.textContent = err.message;
    startBtn.disabled = false;
  }
});

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
