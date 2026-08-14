import { loadFighterData, fetchWalletHoodies, fetchToken } from "./api.js";
import { Fighter, ARCHETYPES, RARE_TRAIT_HEALTH_BONUS } from "./fighter.js";
import { createGame } from "./game.js";
import { initSound, playSound, playRandomTrack, stopMusic } from "./sound.js";
import { pickRandomArena, drawArena, drawFighter } from "./body.js";
import { speakTaunt } from "./tts.js";
import { connectWallet, hasInjectedWallet, getConnectedAccount } from "./wallet.js";
import { initBloodCode } from "./blood-code.js";

initBloodCode();

// Space's default browser behavior is "scroll the page down" - game.js only
// guards against that once an actual match is running (its own keydown
// listener isn't attached until createGame() starts), which left a gap on
// the setup screen and during the pre-fight countdown/taunt window where
// jump's key still scrolled the page. Global and always-on instead, so
// there's no gap regardless of which screen is showing - except while an
// actual text/number input is focused, where space should behave normally.
window.addEventListener("keydown", (e) => {
  if (e.key !== " ") return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  e.preventDefault();
});

const startBtn = document.getElementById("start-btn");
const setupStatus = document.getElementById("setup-status");
const connectWalletBtn = document.getElementById("connect-wallet-btn");
const walletStatus = document.getElementById("wallet-status");
const openseaBtn = document.getElementById("opensea-btn");
const freePlayBtn = document.getElementById("free-play-btn");
const characterSelect = document.getElementById("character-select");
const characterGrid = document.getElementById("character-grid");
const hypeEl = document.getElementById("hype");
const practiceToggleWallet = document.getElementById("practice-toggle-wallet");
const practiceToggleLocal = document.getElementById("practice-toggle-local");
const exitPracticeBtn = document.getElementById("exit-practice-btn");

// Reload is the same "give up on trying to hand-reset every bit of setup
// state" call as the normal Back to Menu button (see runMatch/
// showMatchOverActions) - practice just reaches it a different way, since
// a practice match never ends on its own to get there through that flow.
exitPracticeBtn.addEventListener("click", () => {
  stopMusic();
  location.reload();
});

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
  tryResumeWalletSession();
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
    if (hasInjectedWallet()) {
      showWalletOnly();
      tryResumeWalletSession();
    } else {
      showLocalOnly();
    }
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
  // Practice never ends on its own (see createGame's practiceMode) - this is
  // the only way out, since the normal match-over Back/Play Again buttons
  // are never reached.
  document.getElementById("exit-practice-btn").classList.toggle("hidden", !opts.practiceMode);

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  // runMatch resolves once the whole match (not just a round) is decided,
  // with true if the vs-AI-only "Play Again" was clicked - see
  // showMatchOverActions. Anything else (Back, or a PvP match once that
  // exists) falls through to a full reload instead of trying to hand-reset
  // every bit of setup-screen state (wallet connection, character grid,
  // free-play vs wallet-play panel) - simpler and can't leave the UI in a
  // half-reset state a real reload wouldn't have.
  let playAgain = true;
  while (playAgain) {
    playRandomTrack();
    playAgain = await runMatch(data1, data2, canvas, ctx, opts);
  }
  stopMusic();
  location.reload();
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
    await startMatch(data1, data2, { p2AI: true, practiceMode: practiceToggleLocal.checked });
  } catch (err) {
    setupStatus.textContent = err.message;
    startBtn.disabled = false;
  }
});

// Shared by both the manual "Connect Wallet" click and the silent
// auto-resume path below - the only difference is whether a real user
// gesture backs this call (unlockSound), since initSound()/an audible
// click sound both need one and the resume path doesn't have one to spend.
async function proceedWithWallet(address, { unlockSound }) {
  walletStatus.textContent = "Scanning the chain for your Hoodies...";
  const soundReady = unlockSound ? initSound() : Promise.resolve();

  try {
    const tokenIds = await fetchWalletHoodies(address);
    await soundReady;
    if (unlockSound) playSound("uiclick");

    if (!tokenIds.length) {
      walletStatus.textContent = "No Hoodies in this wallet yet - grab one and come back swinging.";
      openseaBtn.classList.remove("hidden");
      // Not everyone with a wallet wants to buy in just to try it out - this
      // drops them straight into the same free local-play flow as someone
      // with no wallet at all, no NFT required.
      freePlayBtn.classList.remove("hidden");
      connectWalletBtn.disabled = false;
      return;
    }

    openseaBtn.classList.add("hidden");
    freePlayBtn.classList.add("hidden");
    walletStatus.textContent = `${tokenIds.length} Hoodie${tokenIds.length === 1 ? "" : "s"} found - pick your fighter.`;
    await renderCharacterGrid(tokenIds);
  } catch (err) {
    walletStatus.textContent = err.message;
    connectWalletBtn.disabled = false;
  }
}

connectWalletBtn.addEventListener("click", async () => {
  connectWalletBtn.disabled = true;
  walletStatus.textContent = "Connecting wallet...";
  openseaBtn.classList.add("hidden");
  freePlayBtn.classList.add("hidden");

  try {
    const address = await connectWallet();
    await proceedWithWallet(address, { unlockSound: true });
  } catch (err) {
    walletStatus.textContent = err.message;
    connectWalletBtn.disabled = false;
  }
});

// eth_accounts never prompts - if this site already has permission from an
// earlier visit/click, skip straight to "pick your fighter" instead of
// making a returning visitor click Connect again on every reload/back-
// navigation. unlockSound stays false here (no real gesture backs this
// call, initSound() would just start suspended) - the character-card click
// in renderCharacterGrid unlocks it instead, same as startBtn's own click
// already does for local play.
async function tryResumeWalletSession() {
  const address = await getConnectedAccount();
  if (!address) return;
  connectWalletBtn.disabled = true;
  await proceedWithWallet(address, { unlockSound: false });
}

// Drops a wallet-connected-but-no-Hoodie visitor straight into the same
// free local-play form a no-wallet visitor already gets - reveals it
// in-place rather than requiring a page reload, since local-play was only
// hidden in the first place because a wallet got detected.
freePlayBtn.addEventListener("click", () => {
  document.getElementById("wallet-play").classList.add("hidden");
  document.getElementById("local-play").classList.remove("hidden");
  setHype(HYPE_LOCAL);
});

// Emoji + flavor text per archetype - the numbers (damage/speed/health/
// block multipliers) come straight from fighter.js's own ARCHETYPES so this
// can't drift out of sync with what actually happens in a fight.
const ARCHETYPE_INFO = {
  Builder: { emoji: "🔨", perk: "Hits harder", special: "Special: a big flying high kick" },
  Flipper: { emoji: "⚡", perk: "Moves faster", special: "Special: Hood Rat Rush - a rat swarm along the ground" },
  Hodler: { emoji: "💎", perk: "More health", special: "Special: a low sweep kick that blocks hits and stops slides cold" },
  Collector: { emoji: "🛡️", perk: "Blocks better", special: "Special: the long-range bolt" },
};

function archetypeTooltip(type, rareTraitCount) {
  const info = ARCHETYPE_INFO[type];
  if (!info) return "";
  const mult = ARCHETYPES[type];
  const lines = [`${type} - ${info.perk}`];
  if (mult) {
    if (mult.damageMult !== 1) lines.push(`+${Math.round((mult.damageMult - 1) * 100)}% damage`);
    if (mult.speedMult !== 1) lines.push(`+${Math.round((mult.speedMult - 1) * 100)}% move speed`);
    if (mult.healthMult !== 1) lines.push(`+${Math.round((mult.healthMult - 1) * 100)}% health`);
    if (mult.blockMult !== 1) lines.push(`${Math.round((1 - mult.blockMult) * 100)}% less chip damage blocking`);
  }
  lines.push(info.special);
  if (rareTraitCount > 0) {
    lines.push(`+${Math.round(rareTraitCount * RARE_TRAIT_HEALTH_BONUS * 100)}% health (${rareTraitCount} rare trait${rareTraitCount === 1 ? "" : "s"})`);
  }
  return lines.join("\n");
}

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
    // The token's own name is just its collection index ("OnChainHoodies
    // #495") - not useful for picking a fighter. The archetype is what
    // actually matters here (it's what determines their stats and special),
    // so that's the label, with a hover badge for the specifics.
    const type = token.traits?.hoodie ?? "Builder";
    const { dress, mouth, top, eyes } = token.traits ?? {};
    const rareTraitCount = [dress, mouth, top, eyes].filter((t) => t?.tier === "Rare").length;
    const info = ARCHETYPE_INFO[type];
    const card = document.createElement("div");
    card.className = "character-card";
    card.innerHTML = `
      <img src="${token.image?.svg ?? ""}" alt="${type}" />
      <div class="card-label">${type}</div>
      ${info ? `<div class="card-badge">${info.emoji}</div>` : ""}
    `;
    card.addEventListener("click", () => pickFighter(id));
    if (info) attachBadgeTooltip(card.querySelector(".card-badge"), archetypeTooltip(type, rareTraitCount));
    characterGrid.appendChild(card);
  });
}

// One shared tooltip node, appended straight to <body> - NOT nested inside
// a card. position: fixed is supposed to escape all ancestor clipping, but
// .character-card:hover applies its own transform: scale(), and CSS hover
// state bubbles to ancestors, so while a badge is hovered its parent card
// is ALSO :hover and gets transformed - which per spec makes that card the
// containing block for any position:fixed descendant instead of the
// viewport, trapping the tooltip right back inside the grid's own overflow
// clip. Living outside every card (and being reused rather than one per
// card) sidesteps that entirely.
let sharedTooltip = null;
function getSharedTooltip() {
  if (sharedTooltip) return sharedTooltip;
  sharedTooltip = document.createElement("div");
  sharedTooltip.id = "badge-tooltip";
  document.body.appendChild(sharedTooltip);
  return sharedTooltip;
}

function attachBadgeTooltip(badge, text) {
  if (!badge) return;
  badge.addEventListener("mouseenter", () => {
    const tooltip = getSharedTooltip();
    tooltip.textContent = text;
    tooltip.classList.add("visible");
    const badgeRect = badge.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(
      badgeRect.left + badgeRect.width / 2 - tipRect.width / 2,
      window.innerWidth - tipRect.width - 8,
    ));
    const above = badgeRect.top - tipRect.height - 8;
    const top = above < 8 ? badgeRect.bottom + 8 : above;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  });
  badge.addEventListener("mouseleave", () => {
    getSharedTooltip().classList.remove("visible");
  });
}

async function pickFighter(tokenId) {
  characterSelect.classList.add("hidden");
  walletStatus.textContent = "Suiting up...";
  // Normally a no-op - connectWalletBtn's click already unlocked sound. On
  // the silent auto-resume path (tryResumeWalletSession) nothing did yet,
  // since that path has no real user gesture of its own to spend - this
  // click is the first one, so it's the one that has to do it.
  const soundReady = initSound();
  try {
    const [playerData, aiData] = await Promise.all([
      loadFighterData(tokenId),
      loadFighterData(pickRandomOpponentId(tokenId)),
      soundReady,
    ]);
    playSound("uiclick");
    await startMatch(playerData, aiData, { p2AI: true, practiceMode: practiceToggleWallet.checked });
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

async function runMatch(data1, data2, canvas, ctx, { p2AI = false, practiceMode = false } = {}) {
  const wins = { p1: 0, p2: 0 };
  let roundNum = 1;
  let drawStreak = 0;

  while (wins.p1 < ROUNDS_TO_WIN && wins.p2 < ROUNDS_TO_WIN) {
    if (practiceMode) {
      document.getElementById("round-info").textContent = "PRACTICE MODE";
    } else {
      updateRoundInfo(roundNum, wins);
    }

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
        practiceMode,
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

    // game.js already held the round-result screen up for its own linger
    // window before resolving this promise. For a mid-match round that's
    // all it needs - clear it and move straight into the next round. The
    // match-deciding round instead keeps that same screen up and adds
    // buttons to it (see showMatchOverActions) - previously this just fell
    // through to nothing, leaving the match frozen with no way to leave.
    if (!matchWinner) {
      document.getElementById("result").classList.add("hidden");
      if (winner) roundNum++;
      // A draw replays the same round number rather than advancing it.
      continue;
    }

    return showMatchOverActions(p2AI);
  }
}

// Resolves once the player picks a way forward. true only for "Play
// Again", which is only ever offered for a vs-AI match - see the comment
// on startMatch's while loop for why a PvP "Back" doesn't try to hand-reset
// UI state itself.
function showMatchOverActions(p2AI) {
  return new Promise((resolve) => {
    const actions = document.getElementById("result-actions");
    const againBtn = document.getElementById("result-again");
    const backBtn = document.getElementById("result-back");
    actions.classList.remove("hidden");
    againBtn.classList.toggle("hidden", !p2AI);

    function onAgain() {
      cleanup();
      resolve(true);
    }
    function onBack() {
      cleanup();
      resolve(false);
    }
    function cleanup() {
      actions.classList.add("hidden");
      document.getElementById("result").classList.add("hidden");
      againBtn.removeEventListener("click", onAgain);
      backBtn.removeEventListener("click", onBack);
    }

    againBtn.addEventListener("click", onAgain);
    backBtn.addEventListener("click", onBack);
  });
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

// version.json is stamped at deploy time by scripts/stamp-version.sh
// (Vercel's buildCommand, see vercel.json) with the exact commit Vercel is
// serving - lets a visitor click straight through to the real source
// instead of taking "it's open source" on faith. 404s on local dev (no
// Vercel build ran) - that's expected, so the footer just stays empty
// rather than showing a broken or fake link.
async function showBuildFooter() {
  const el = document.getElementById("build-footer");
  if (!el) return;
  try {
    const res = await fetch("version.json", { cache: "no-store" });
    if (!res.ok) return;
    const { commit, repo } = await res.json();
    if (!commit || !repo) return;
    const short = commit.slice(0, 7);
    el.innerHTML = `Running <a href="https://github.com/${repo}/commit/${commit}" target="_blank" rel="noopener noreferrer">commit ${short}</a> - verify this matches <a href="https://github.com/${repo}" target="_blank" rel="noopener noreferrer">the source on GitHub</a>`;
  } catch {
    // No network, or not a Vercel deploy - leave the footer empty.
  }
}
showBuildFooter();
