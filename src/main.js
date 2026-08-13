import { loadFighterData, fetchWalletHoodies, fetchToken } from "./api.js";
import { Fighter } from "./fighter.js";
import { createGame } from "./game.js";
import { initSound, playSound, playRandomTrack } from "./sound.js";
import { pickRandomArena, drawArena, drawFighter } from "./body.js";
import { speakTaunt } from "./tts.js";
import { connectWallet, hasInjectedWallet } from "./wallet.js";

const startBtn = document.getElementById("start-btn");
const setupStatus = document.getElementById("setup-status");
const connectWalletBtn = document.getElementById("connect-wallet-btn");
const walletStatus = document.getElementById("wallet-status");
const openseaBtn = document.getElementById("opensea-btn");
const characterSelect = document.getElementById("character-select");
const characterGrid = document.getElementById("character-grid");
const hypeEl = document.getElementById("hype");

// Rotated randomly per visit so the same line doesn't go stale, and split
// by mode - a wallet holder is about to put their actual Hoodie's name on
// the line against the AI, which reads differently than "no wallet, just
// picking two for free."
const HYPE_LOCAL = [
  "Pick two Hoodies. Beat the AI senseless.",
  "No wallet? No problem. Grab two fighters and go.",
  "Two Hoodies enter. One AI leaves in pieces.",
  "Free fights, zero mercy. Choose your Hoodies.",
];
const HYPE_WALLET = [
  "Your Hoodie. Your rep. The AI won't go easy.",
  "Connect up and put your Hoodie's name on the line.",
  "This one's on-chain. Fight like it matters.",
  "Your NFT, your knuckles. Let's see what it's got.",
];
function setHype(pool) {
  if (!hypeEl) return;
  hypeEl.textContent = pool[Math.floor(Math.random() * pool.length)];
}

// One clear path per visitor instead of both options competing for
// attention: a wallet means real-Hoodie-vs-AI is the whole point, so free
// local play (and all the wallet/crypto UI) just gets out of the way for
// anyone who doesn't have one.
function showWalletOnly() {
  document.getElementById("local-play").classList.add("hidden");
  setHype(HYPE_WALLET);
}
function showLocalOnly() {
  document.getElementById("wallet-play").classList.add("hidden");
  setHype(HYPE_LOCAL);
}

if (hasInjectedWallet()) {
  showWalletOnly();
} else {
  // Some wallet extensions inject window.ethereum asynchronously, slightly
  // after this script runs - a single synchronous check at load time can
  // race and wrongly decide "no wallet" for someone who actually has one.
  // Give it a brief grace window via the event most wallets fire, with a
  // timeout fallback so a visitor with no wallet at all isn't left staring
  // at a decision that never resolves.
  let decided = false;
  const onInit = () => {
    if (decided) return;
    decided = true;
    if (hasInjectedWallet()) showWalletOnly();
    else showLocalOnly();
  };
  window.addEventListener("ethereum#initialized", onInit, { once: true });
  setTimeout(onInit, 300);
}

async function startMatch(data1, data2, opts) {
  document.getElementById("setup").classList.add("hidden");
  document.querySelector("h1").classList.add("hidden");
  document.getElementById("arena").classList.remove("hidden");
  document.getElementById("p1-name").textContent = `${data1.name} (${data1.hoodieType})`;
  document.getElementById("p2-name").textContent = `${data2.name} (${data2.hoodieType})`;

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  playRandomTrack();
  await runMatch(data1, data2, canvas, ctx, opts);
}

startBtn.addEventListener("click", async () => {
  const id1 = document.getElementById("p1-id").value;
  const id2 = document.getElementById("p2-id").value;

  startBtn.disabled = true;
  setupStatus.textContent = "Suiting up...";
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
    // Free play fights an AI opponent too, same as the wallet flow - it was
    // quietly requiring a second person on the same keyboard to do
    // anything, which isn't really "free play" for one person.
    await startMatch(data1, data2, { p2AI: true });
  } catch (err) {
    setupStatus.textContent = err.message;
    startBtn.disabled = false;
  }
});

connectWalletBtn.addEventListener("click", async () => {
  connectWalletBtn.disabled = true;
  walletStatus.textContent = "Connecting wallet...";
  openseaBtn.classList.add("hidden");
  const soundReady = initSound();

  try {
    const address = await connectWallet();
    walletStatus.textContent = "Scanning the chain for your Hoodies...";
    const tokenIds = await fetchWalletHoodies(address);
    await soundReady;
    playSound("uiclick");

    if (!tokenIds.length) {
      walletStatus.textContent = "No Hoodies in this wallet yet - grab one and come back swinging.";
      openseaBtn.classList.remove("hidden");
      connectWalletBtn.disabled = false;
      return;
    }

    openseaBtn.classList.add("hidden");
    walletStatus.textContent = `${tokenIds.length} Hoodie${tokenIds.length === 1 ? "" : "s"} found - pick your fighter.`;
    await renderCharacterGrid(tokenIds);
  } catch (err) {
    walletStatus.textContent = err.message;
    connectWalletBtn.disabled = false;
  }
});

async function renderCharacterGrid(tokenIds) {
  // The grid used to just sit empty while every token's art loaded in
  // parallel - blank space with no feedback reads as broken, not loading.
  characterGrid.innerHTML = `
    <div class="grid-loading">
      <div class="spinner"></div>
      <p>Loading your fighters...</p>
    </div>
  `;
  characterSelect.classList.remove("hidden");

  const previews = await Promise.all(
    tokenIds.map(async (id) => {
      try {
        return await fetchToken(id);
      } catch {
        return null;
      }
    }),
  );

  characterGrid.innerHTML = "";
  previews.forEach((token, i) => {
    if (!token) return;
    const id = tokenIds[i];
    const card = document.createElement("div");
    card.className = "character-card";
    card.innerHTML = `
      <img src="${token.image?.svg ?? ""}" alt="${token.token?.name ?? `#${id}`}" />
      <div class="card-label">${token.token?.name ?? `#${id}`}</div>
    `;
    card.addEventListener("click", () => pickFighter(id));
    characterGrid.appendChild(card);
  });
}

async function pickFighter(tokenId) {
  characterSelect.classList.add("hidden");
  walletStatus.textContent = "Suiting up...";
  try {
    const [playerData, aiData] = await Promise.all([
      loadFighterData(tokenId),
      loadFighterData(pickRandomOpponentId(tokenId)),
    ]);
    playSound("uiclick");
    await startMatch(playerData, aiData, { p2AI: true });
  } catch (err) {
    walletStatus.textContent = err.message;
    connectWalletBtn.disabled = false;
  }
}

// AI's own look - any Hoodie other than the player's own works fine, this
// is purely cosmetic since the AI just plays the fighter state machine.
function pickRandomOpponentId(excludeId) {
  let id = excludeId;
  while (id === excludeId) {
    id = 1 + Math.floor(Math.random() * 5999);
  }
  return id;
}

const ROUNDS_TO_WIN = 2;
// A drawn round (timeout tie or double-KO) replays instead of counting -
// best-of-3 needs a decisive result each round to make progress. Repeated
// draws shrink the clock each retry so two evenly-matched players can't
// stall the match forever; sudden-death floor guarantees it resolves.
const DRAW_RETRY_TIME_LIMITS = [45, 30, 15];

async function runMatch(data1, data2, canvas, ctx, { p2AI = false } = {}) {
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
        p2AI,
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

    // game.js already held the result on screen (winner's flex + spoken
    // taunt) for its own linger window before resolving this promise, so
    // there's nothing left to wait for here - just clear it and move on.
    document.getElementById("result").classList.add("hidden");

    const matchWinner = wins.p1 >= ROUNDS_TO_WIN ? p1 : wins.p2 >= ROUNDS_TO_WIN ? p2 : null;
    if (matchWinner) break;

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
