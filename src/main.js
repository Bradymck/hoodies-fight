import { loadFighterData, fetchWalletHoodies, fetchToken, fetchFighterStats } from "./api.js";
import { Fighter, ARCHETYPES, RARE_TRAIT_HEALTH_BONUS } from "./fighter.js";
import { createGame } from "./game.js";
import { initSound, playSound, playRandomTrack, stopMusic } from "./sound.js";
import { pickRandomArena, drawArena, drawFighter, drawFlash } from "./body.js";
import { speakTaunt } from "./tts.js";
import { connectWallet, hasInjectedWallet, getConnectedAccount, disconnectWallet } from "./wallet.js";
import { verifyOwnership } from "./chain.js";
import { initBloodCode } from "./blood-code.js";
import { initGamepadDebugOverlay } from "./gamepad.js";
import { initGamepadNav } from "./gamepad-nav.js";
import { renderKOShareCard, shareKOImage } from "./share-card.js";

initGamepadDebugOverlay();
initGamepadNav();

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
const connectWalletBtn = document.getElementById("connect-wallet-btn");
const walletStatus = document.getElementById("wallet-status");
const openseaBtn = document.getElementById("opensea-btn");
const hypeEl = document.getElementById("hype");
const practiceToggle = document.getElementById("practice-toggle");
const readyBtn = document.getElementById("ready-btn");
const exitMatchBtn = document.getElementById("exit-match-btn");
const walletChip = document.getElementById("wallet-chip");
const walletChipAddress = document.getElementById("wallet-chip-address");
const disconnectBtn = document.getElementById("disconnect-btn");

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Persists across the setup/select-screen/arena transition (fixed
// position, lives outside all three) since it's the only place a connected
// visitor can find Disconnect at all - proceedWithWallet moves on to the
// select screen almost immediately, so this can't just live on the setup
// screen and disappear with it.
function showWalletChip(address) {
  walletChipAddress.textContent = shortAddress(address);
  walletChip.classList.remove("hidden");
}

disconnectBtn.addEventListener("click", async () => {
  disconnectBtn.disabled = true;
  await disconnectWallet();
  // Simplest full reset back to the setup screen's initial state - same
  // "give up on hand-resetting every bit of state" call runMatch/
  // exitMatchBtn already make elsewhere in this file.
  location.reload();
});

// The social footer/build-verify line only make sense on the initial menu -
// once a visitor has actually moved into the select screen or a match,
// hiding them is what makes #arena/#select-screen genuinely full-screen
// instead of leaving something scrollable-into below them.
function hideLandingFooter() {
  document.getElementById("site-footer")?.classList.add("hidden");
  document.getElementById("integrity-check")?.classList.add("hidden");
}

const canvasStage = document.getElementById("canvas-stage");
const canvasWrap = document.getElementById("canvas-wrap");

// Same measure-and-fit approach the character-select screen's portraits
// use (fitSelectScreen) - sizes #canvas-wrap to the exact largest
// 800x360-ratio box that fits #canvas-stage, so the canvas (width/height
// 100% of that wrapper) always fills the screen without ever being cropped
// or leaving the HUD/taunt/countdown overlays (positioned against this
// same wrapper) misaligned with the canvas's actual visible pixels.
function fitArenaCanvas() {
  if (document.getElementById("arena").classList.contains("hidden")) return;
  const availW = canvasStage.clientWidth;
  const availH = canvasStage.clientHeight;
  const scale = Math.min(availW / 800, availH / 360);
  canvasWrap.style.width = `${Math.floor(800 * scale)}px`;
  canvasWrap.style.height = `${Math.floor(360 * scale)}px`;
}
window.addEventListener("resize", fitArenaCanvas);

const controlsInfoBtn = document.getElementById("controls-info-btn");
const controlsPanel = document.getElementById("controls-panel");
controlsInfoBtn.addEventListener("click", () => {
  controlsPanel.classList.toggle("open");
});
// Clicking anywhere outside the open panel (including the info button
// itself, which the toggle above already handles) closes it - a slide-out
// panel that only closes by re-hitting a tiny corner button is easy to get
// stuck open by accident mid-match.
document.addEventListener("click", (e) => {
  if (!controlsPanel.classList.contains("open")) return;
  if (controlsPanel.contains(e.target) || e.target === controlsInfoBtn) return;
  controlsPanel.classList.remove("open");
});

// Reload is the same "give up on trying to hand-reset every bit of setup
// state" call as the normal Back to Menu button (see runMatch/
// showMatchOverActions) - a universal bail-out for any match in progress
// (not just practice, which otherwise has no other way out at all since it
// never ends on its own - see createGame's practiceMode), so a visitor
// isn't stuck closing the tab to quit early.
exitMatchBtn.addEventListener("click", () => {
  stopMusic();
  location.reload();
});

// ===== Leaderboard panel (setup screen only) =====
//
// Reads GET /api/leaderboard - unlike pfp-brawl's adapter system this repo
// tracks a single hardcoded collection, so there's no `adapter` query param
// to pass through (see api/leaderboard.js, which reads the plain
// leaderboard:wins sorted set with no namespacing).
const leaderboardBtn = document.getElementById("leaderboard-btn");
const leaderboardPanel = document.getElementById("leaderboard-panel");
const leaderboardCloseBtn = document.getElementById("leaderboard-close-btn");
const leaderboardList = document.getElementById("leaderboard-list");

async function loadLeaderboard() {
  leaderboardList.innerHTML = `<li class="leaderboard-loading"><div class="spinner"></div></li>`;
  try {
    const res = await fetch("/api/leaderboard?limit=10");
    if (!res.ok) throw new Error(`status ${res.status}`);
    const { fighters } = await res.json();
    if (!fighters?.length) {
      leaderboardList.innerHTML = `<li class="leaderboard-empty">No wins recorded yet - be the first.</li>`;
      return;
    }
    leaderboardList.innerHTML = "";
    fighters.forEach((fighter, i) => {
      const row = document.createElement("li");
      row.className = "leaderboard-row";
      row.innerHTML = `
        <span class="leaderboard-rank">#${i + 1}</span>
        <span class="leaderboard-name">#${fighter.tokenId}</span>
        <span class="leaderboard-wins">${fighter.wins}W</span>
      `;
      leaderboardList.appendChild(row);
      // Best-effort name upgrade over the tokenId fallback already showing -
      // fetchToken is the same per-card call the select-screen grid already
      // makes, just one-off here instead of paginated. A failure leaves the
      // #tokenId label in place rather than blocking the rest of the row.
      fetchToken(fighter.tokenId)
        .then((token) => {
          const name = token?.token?.name;
          if (name) row.querySelector(".leaderboard-name").textContent = name;
        })
        .catch(() => {});
    });
  } catch {
    leaderboardList.innerHTML = `<li class="leaderboard-empty">Couldn't load the leaderboard right now.</li>`;
  }
}

leaderboardBtn.addEventListener("click", () => {
  playSound("uiclick");
  leaderboardPanel.classList.remove("hidden");
  loadLeaderboard();
});
leaderboardCloseBtn.addEventListener("click", () => leaderboardPanel.classList.add("hidden"));
// Same click-outside-to-close convention as #controls-panel above.
document.addEventListener("click", (e) => {
  if (leaderboardPanel.classList.contains("hidden")) return;
  if (leaderboardPanel.contains(e.target) || e.target === leaderboardBtn) return;
  leaderboardPanel.classList.add("hidden");
});

// Rotated randomly per visit so the same line doesn't go stale. Both play
// options read clearly on their own now (see index.html's #play-options),
// so this no longer needs to be split by mode - one clear line setting up
// the card(s) below is enough either way.
const HYPE_LINES = [
  "Choose how you want to play:",
  "Two Hoodies enter. One AI leaves in pieces.",
  "Free to play, or bring your own Hoodie.",
];
function setHype() {
  if (!hypeEl) return;
  hypeEl.textContent = HYPE_LINES[Math.floor(Math.random() * HYPE_LINES.length)];
}
setHype();

// Connect Wallet only makes sense to show if a wallet extension actually
// exists - offering it otherwise just leads to a "no wallet found, install
// one" error on click. Play Free always stays visible either way; this
// only ever hides the wallet option, never the free one.
function hideWalletOption() {
  document.getElementById("wallet-play").classList.add("hidden");
  // Some HYPE_LINES mention bringing a Hoodie - not a real option once the
  // wallet card is gone, so replace whichever one setHype already picked.
  if (hypeEl) hypeEl.textContent = "Pick two fighters and jump in.";
}

if (hasInjectedWallet()) {
  tryResumeWalletSession();
} else {
  // Some wallet extensions inject window.ethereum asynchronously, slightly
  // after this script runs - a single synchronous check at load time can
  // race and wrongly decide "no wallet" for someone who actually has one.
  // Give it a brief grace window via the event most wallets fire, with a
  // timeout fallback so a visitor with no wallet at all isn't left staring
  // at an option that never resolves either way.
  let decided = false;
  const onInit = () => {
    if (decided) return;
    decided = true;
    if (hasInjectedWallet()) {
      tryResumeWalletSession();
    } else {
      hideWalletOption();
    }
  };
  window.addEventListener("ethereum#initialized", onInit, { once: true });
  setTimeout(onInit, 300);
}

// ===== Character select screen =====
//
// MK-style: two independent panels (P1 left, P2 right), each its own pool
// of token IDs to page through, each with its own big animated portrait.
// P1's pool is the connected wallet's real Hoodies (paginated - see
// fetchWalletHoodies's own pagination fix) if one's connected, otherwise a
// random sample same as P2 always is (P2 is always AI for now - there's no
// second wallet to pull from). Deliberately built as two symmetric,
// independent panels rather than one shared grid both sides pick from in
// turn - that's not a stylistic choice, it's the shape the future shared-
// lobby system needs (P2's pool source becomes "the other real connected
// player" instead of a random sample; nothing else about this screen has
// to change).

const PANEL_PAGE_SIZE = 12;
const RANDOM_POOL_SIZE = 48;
const MAX_TOKEN_ID = 5999;
const ARENA_BG_IMAGES = ["assets/backgrounds/arena-2.png", "assets/backgrounds/arena-3.png"];

const selectScreen = document.getElementById("select-screen");
const selectContent = document.getElementById("select-content");
const p1Grid = document.getElementById("p1-grid");
const p2Grid = document.getElementById("p2-grid");
const p1Pagination = document.getElementById("p1-pagination");
const p2Pagination = document.getElementById("p2-pagination");
const p1Label = document.getElementById("p1-select-label");
const p2Label = document.getElementById("p2-select-label");

// #select-content is sized naturally (comfortably roomy), then measured
// against the real screen and scaled down if it doesn't actually fit - a
// vh-only budget can't account for variable content height (e.g. a long
// trait name wrapping a fighter-label to two lines), and overflow:hidden
// alone just silently clips instead of shrinking. Measuring the real
// rendered size and scaling the whole block is the only way to guarantee
// nothing (a portrait, a panel, pagination controls) is ever cut off, no
// matter the screen size.
function fitSelectScreen() {
  if (selectScreen.classList.contains("hidden")) return;
  selectContent.style.transform = "none";
  const naturalW = selectContent.scrollWidth;
  const naturalH = selectContent.scrollHeight;
  const availW = selectScreen.clientWidth;
  const availH = selectScreen.clientHeight;
  const scale = Math.min(1, availW / naturalW, availH / naturalH);
  selectContent.style.transform = scale < 1 ? `scale(${scale})` : "none";
}
window.addEventListener("resize", fitSelectScreen);
// Belt-and-suspenders over the explicit fitSelectScreen() calls below: this
// catches ANY change to the content's natural (pre-transform) size - a
// webfont finishing loading after first paint, a label wrapping
// differently, anything - not just the specific moments (screen open, pick
// a fighter) already covered. transform doesn't affect layout box size, so
// this never re-fires from fitSelectScreen's own scale write.
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => fitSelectScreen()).observe(selectContent);
}

function randomTokenPool(count) {
  const pool = new Set();
  while (pool.size < count) {
    pool.add(1 + Math.floor(Math.random() * MAX_TOKEN_ID));
  }
  return [...pool];
}

const panelState = {
  p1: { pool: [], page: 0, selectedId: null, selectedData: null },
  p2: { pool: [], page: 0, selectedId: null, selectedData: null },
};

// Emoji + flavor text per archetype - the numbers (damage/speed/health/
// block multipliers) come straight from fighter.js's own ARCHETYPES so this
// can't drift out of sync with what actually happens in a fight.
// Special text mirrors game.js's spawnProjectile pairing (stage 3 archetype
// rework - Flipper+Hodler throw the ground-level rat rush, Builder+Collector
// throw the head-height bolt; true minimal churn, only the two former-melee
// archetypes picked up a projectile they didn't already have).
const ARCHETYPE_INFO = {
  Builder: { emoji: "🔨", perk: "Hits harder", special: "Special: the long-range bolt" },
  Flipper: { emoji: "⚡", perk: "Moves faster", special: "Special: Hood Rat Rush - a rat swarm along the ground" },
  Hodler: { emoji: "💎", perk: "More health", special: "Special: Hood Rat Rush - a rat swarm along the ground" },
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

// Drives one portrait canvas's idle-loop animation. Reuses the exact same
// drawFighter the real match/pre-fight screens use (same sprite sheets, no
// new art needed) rather than blowing up the flat NFT head art - `visual`
// is a plain object matching just the fields drawFighter actually reads
// (state/stateT/x/facing/headImg/jumpOffset), not a real Fighter, since
// this never needs to take input or deal damage. Manually increments
// stateT itself each frame - unlike a real match, nothing else is driving
// this object's clock.
function createPortraitRenderer(canvasId, playerNum, facing) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  let visual = null;
  let raf = null;

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (visual) {
      visual.stateT++;
      drawFighter(ctx, visual, playerNum);
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    setHead(imageUrl) {
      // drawFighter checks headImg.complete before drawing it - a real
      // Fighter builds this same Image-from-data-URL itself (see fighter.js
      // constructor), but this visual is a plain object standing in for one,
      // so it needs to do that conversion itself. Passing the raw data-URL
      // string straight through (what this did before) meant
      // `headImg.complete` was always undefined - the head silently never
      // drew, body only.
      const headImg = new Image();
      headImg.crossOrigin = "anonymous";
      headImg.src = imageUrl;
      visual = { x: 347, facing, state: "idle", stateT: 0, headImg, jumpOffset: 0 };
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
    },
  };
}

const portraits = {
  p1: createPortraitRenderer("p1-portrait", 1, 1),
  p2: createPortraitRenderer("p2-portrait", 2, -1),
};

function updateReadyState() {
  readyBtn.disabled = !(panelState.p1.selectedData && panelState.p2.selectedData);
}

async function selectFighter(side, tokenId, token) {
  const grid = side === "p1" ? p1Grid : p2Grid;
  for (const card of grid.querySelectorAll(".character-card")) {
    card.classList.toggle("selected", Number(card.dataset.tokenId) === tokenId);
  }
  panelState[side].selectedId = tokenId;
  const label = side === "p1" ? p1Label : p2Label;
  const type = token.traits?.hoodie ?? "Builder";
  const baseLabel = `${token.token?.name ?? `#${tokenId}`} - ${type}`;
  label.textContent = baseLabel;
  fitSelectScreen();

  // Fire-and-forget alongside loadFighterData below rather than chained
  // after it - stats and fighter art are independent, no reason to make one
  // wait on the other. Guarded on selectedId still matching tokenId in case
  // the user picks a different card before this resolves, and on
  // label.textContent still matching baseLabel in case the loadFighterData
  // failure branch below has already overwritten it with an error message.
  fetchFighterStats(tokenId).then((stats) => {
    if (!stats || panelState[side].selectedId !== tokenId || label.textContent !== baseLabel) return;
    label.textContent = `${baseLabel} · ${stats.wins}W-${stats.losses}L`;
    fitSelectScreen();
  });

  try {
    const data = await loadFighterData(tokenId);
    panelState[side].selectedData = data;
    portraits[side].setHead(data.imageUrl);
    updateReadyState();
  } catch {
    label.textContent = "Couldn't load that Hoodie - try another.";
    fitSelectScreen();
  }
}

// Every field on a token (image URL, trait names, the fighter's display
// name) comes straight from the OnChainHoodies REST API or, on API
// downtime, the on-chain tokenURI fallback in chain.js - neither is a
// source we control, so a malicious collection/token could hand back
// crafted strings instead of the plain image URLs/trait labels this UI
// expects. img.src is a property assignment (not HTML parsing) so it can't
// smuggle markup, but a `javascript:`/`data:text/html`-style scheme could
// still turn a rendered <img> into a script gadget in some browsers -
// restricting to the schemes OnChainHoodies actually returns (https, or a
// data:image URI for the on-chain SVG fallback) closes that off without
// needing to know anything else about the string. http:// is deliberately
// NOT allowed here even though it'd be equally safe against the script-
// gadget risk above - this whole site is served over https, and a mixed-
// content image load is its own (much smaller, but free to just avoid)
// problem.
function isSafeImageUrl(url) {
  if (typeof url !== "string") return false;
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith("https://") || trimmed.startsWith("data:image/");
}

async function renderPanel(side) {
  const state = panelState[side];
  const grid = side === "p1" ? p1Grid : p2Grid;
  const pageIds = state.pool.slice(state.page * PANEL_PAGE_SIZE, (state.page + 1) * PANEL_PAGE_SIZE);

  grid.innerHTML = `<div class="grid-loading"><div class="spinner"></div></div>`;

  const tokens = await Promise.all(
    pageIds.map(async (id) => {
      try {
        return await fetchToken(id);
      } catch {
        return null;
      }
    }),
  );

  grid.innerHTML = "";
  tokens.forEach((token, i) => {
    if (!token) return;
    const id = pageIds[i];
    const type = token.traits?.hoodie ?? "Builder";
    const { dress, mouth, top, eyes } = token.traits ?? {};
    const rareTraitCount = [dress, mouth, top, eyes].filter((t) => t?.tier === "Rare").length;
    const info = ARCHETYPE_INFO[type];
    const card = document.createElement("div");
    card.className = "character-card";
    card.dataset.tokenId = id;
    card.tabIndex = 0;
    if (state.selectedId === id) card.classList.add("selected");
    // Built with real DOM nodes + property/textContent assignment rather
    // than an innerHTML template - `type` and the image URL above are
    // untrusted token metadata (see isSafeImageUrl's comment), and this way
    // they're only ever readable as text/an image resource, never parsed
    // as markup, no matter what a hostile token throws at them.
    const img = document.createElement("img");
    // An empty string src (`src=""`) re-requests the CURRENT page URL, not
    // "no image" - omitting the attribute entirely is the actual no-op.
    if (isSafeImageUrl(token.image?.svg)) img.src = token.image.svg;
    img.alt = type;
    card.appendChild(img);

    const labelEl = document.createElement("div");
    labelEl.className = "card-label";
    labelEl.textContent = type;
    card.appendChild(labelEl);

    let badgeEl = null;
    if (info) {
      badgeEl = document.createElement("div");
      badgeEl.className = "card-badge";
      badgeEl.textContent = info.emoji;
      card.appendChild(badgeEl);
    }
    card.addEventListener("click", () => selectFighter(side, id, token));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.click();
      }
    });
    if (info) attachBadgeTooltip(badgeEl, archetypeTooltip(type, rareTraitCount));
    grid.appendChild(card);
  });

  renderPagination(side);
}

function renderPagination(side) {
  const state = panelState[side];
  const el = side === "p1" ? p1Pagination : p2Pagination;
  const totalPages = Math.max(1, Math.ceil(state.pool.length / PANEL_PAGE_SIZE));
  el.innerHTML = "";

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "‹ PREV";
  prevBtn.disabled = state.page <= 0;
  prevBtn.addEventListener("click", () => {
    state.page--;
    renderPanel(side);
  });

  const pageLabel = document.createElement("span");
  pageLabel.textContent = `PAGE ${state.page + 1} / ${totalPages}`;

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "NEXT ›";
  nextBtn.disabled = state.page >= totalPages - 1;
  nextBtn.addEventListener("click", () => {
    state.page++;
    renderPanel(side);
  });

  el.append(prevBtn, pageLabel, nextBtn);
}

// walletTokenIds is null for free play (both sides get a random sample) or
// the connected wallet's real Hoodies for P1 (P2 is still always a random
// sample - see the top-of-section comment on why this stays two symmetric
// pools instead of one shared list).
async function enterSelectScreen(walletTokenIds) {
  document.getElementById("setup").classList.add("hidden");
  document.querySelector("h1").classList.add("hidden");
  hideLandingFooter();
  selectScreen.classList.remove("hidden");
  selectScreen.style.setProperty(
    "--select-bg-image",
    `url(${ARENA_BG_IMAGES[Math.floor(Math.random() * ARENA_BG_IMAGES.length)]})`,
  );

  panelState.p1 = { pool: walletTokenIds?.length ? walletTokenIds : randomTokenPool(RANDOM_POOL_SIZE), page: 0, selectedId: null, selectedData: null };
  panelState.p2 = { pool: randomTokenPool(RANDOM_POOL_SIZE), page: 0, selectedId: null, selectedData: null };
  p1Label.textContent = "CHOOSE YOUR FIGHTER";
  p2Label.textContent = "CHOOSE YOUR OPPONENT";
  updateReadyState();
  await Promise.all([renderPanel("p1"), renderPanel("p2")]);
  // Never open on two blank portraits - auto-pick the top-left fighter in
  // each pool so both sides show something immediately, same as if the
  // visitor had just clicked the first card themselves.
  p1Grid.querySelector(".character-card")?.click();
  p2Grid.querySelector(".character-card")?.click();
  fitSelectScreen();
}

readyBtn.addEventListener("click", async () => {
  readyBtn.disabled = true;
  // Must be kicked off from this click handler - browsers block audio until
  // a real user gesture, and this is the closest one we get.
  await initSound();
  playSound("uiclick");
  const data1 = panelState.p1.selectedData;
  const data2 = panelState.p2.selectedData;
  await startMatch(data1, data2, { p2AI: true, practiceMode: practiceToggle.checked });
});

async function startMatch(data1, data2, opts) {
  selectScreen.classList.add("hidden");
  document.getElementById("arena").classList.remove("hidden");
  fitArenaCanvas();
  document.getElementById("p1-name").textContent = `${data1.name} (${data1.hoodieType})`;
  document.getElementById("p2-name").textContent = `${data2.name} (${data2.hoodieType})`;
  // avatarUrl is loadFighterData's raw, unprocessed token.image.svg (see
  // its own comment in api.js on why that's kept separate from the
  // canvas-cropped imageUrl) - still the same untrusted OnChainHoodies/
  // on-chain field as the select-screen cards, so it gets the same scheme
  // check before landing on an actual <img>. removeAttribute, not src="" -
  // an empty src re-requests the current page URL, it isn't a no-op.
  const p1Pfp = document.getElementById("p1-pfp");
  const p2Pfp = document.getElementById("p2-pfp");
  if (isSafeImageUrl(data1.avatarUrl)) p1Pfp.src = data1.avatarUrl; else p1Pfp.removeAttribute("src");
  if (isSafeImageUrl(data2.avatarUrl)) p2Pfp.src = data2.avatarUrl; else p2Pfp.removeAttribute("src");
  // Universal for any match, not just practice - a normal AI match had no
  // way to bail early either before this existed, only a post-match Back
  // to Menu button.
  exitMatchBtn.classList.remove("hidden");

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  // runMatch resolves once the whole match (not just a round) is decided,
  // with true if the vs-AI-only "Play Again" was clicked - see
  // showMatchOverActions. Anything else (Back, or a PvP match once that
  // exists) falls through to a full reload instead of trying to hand-reset
  // every bit of setup-screen state (wallet connection, select-screen
  // pools) - simpler and can't leave the UI in a half-reset state a real
  // reload wouldn't have.
  let playAgain = true;
  while (playAgain) {
    playRandomTrack();
    playAgain = await runMatch(data1, data2, canvas, ctx, opts);
  }
  stopMusic();
  location.reload();
}

startBtn.addEventListener("click", () => {
  playSound("uiclick");
  enterSelectScreen(null);
});

// Shared by both the manual "Connect Wallet" click and the silent
// auto-resume path below - the only difference is whether a real user
// gesture backs this call (unlockSound), since initSound()/an audible
// click sound both need one and the resume path doesn't have one to spend.
async function proceedWithWallet(address, { unlockSound }) {
  walletStatus.textContent = "Scanning the chain for your Hoodies...";
  showWalletChip(address);
  const soundReady = unlockSound ? initSound() : Promise.resolve();

  try {
    const tokenIds = await fetchWalletHoodies(address);
    await soundReady;
    if (unlockSound) playSound("uiclick");

    if (!tokenIds.length) {
      // No separate "Play Free Instead" button here - the always-visible
      // "PLAY FREE" button in the local-play column already covers this,
      // and having two buttons that do the exact same thing on screen at
      // once read as redundant/confusing (reported live).
      walletStatus.textContent = "No Hoodies in this wallet yet - grab one and come back swinging.";
      openseaBtn.classList.remove("hidden");
      connectWalletBtn.disabled = false;
      return;
    }

    openseaBtn.classList.add("hidden");
    walletStatus.textContent = `${tokenIds.length} Hoodie${tokenIds.length === 1 ? "" : "s"} found - pick your fighter.`;
    enterSelectScreen(tokenIds);
  } catch (err) {
    walletStatus.textContent = err.message;
    connectWalletBtn.disabled = false;
  }
}

connectWalletBtn.addEventListener("click", async () => {
  connectWalletBtn.disabled = true;
  walletStatus.textContent = "Connecting wallet...";
  openseaBtn.classList.add("hidden");

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
// in renderPanel unlocks it instead, same as startBtn's own click already
// does for local play.
async function tryResumeWalletSession() {
  const address = await getConnectedAccount();
  if (!address) return;
  connectWalletBtn.disabled = true;
  await proceedWithWallet(address, { unlockSound: false });
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

    const matchLoser = matchWinner === p1 ? p2 : p1;
    // p1 is always the human-controlled side today (p2AI is always true -
    // see readyBtn's click handler) - this is what gates the verified-owner
    // flourish to "a real player won", not the AI. A future real PvP lobby
    // would need a genuine per-side "is this a human, and which wallet"
    // concept instead of this shortcut.

    return showMatchOverActions(p2AI, matchWinner, matchLoser, matchWinner === p1, canvas, ctx, wins);
  }
}

// Resolves once the player picks a way forward. true only for "Play
// Again", which is only ever offered for a vs-AI match - see the comment
// on startMatch's while loop for why a PvP "Back" doesn't try to hand-reset
// UI state itself.
//
// canvas/ctx here are the same live match canvas startMatch already set up -
// game.js stops drawing once a match ends but never clears the canvas, so by
// the time this runs it's still showing the frozen winner-flex frame, exactly
// what the share card and flourish flash both want to capture/draw over.
function showMatchOverActions(p2AI, matchWinner, matchLoser, isP1Winner, canvas, ctx, wins) {
  return new Promise((resolve) => {
    const actions = document.getElementById("result-actions");
    const againBtn = document.getElementById("result-again");
    const backBtn = document.getElementById("result-back");
    const shareBtn = document.getElementById("result-share");
    const verifiedBadge = document.getElementById("result-verified-badge");
    actions.classList.remove("hidden");
    againBtn.classList.toggle("hidden", !p2AI);
    shareBtn.classList.remove("hidden");
    shareBtn.disabled = false;
    shareBtn.textContent = "SHARE YOUR WIN";

    // Flips once cleanup() runs (Play Again/Back clicked) - guards the
    // flourish's own async ownership check and the share button's async
    // render/share call, both of which can still be in flight after the
    // result screen has already been dismissed, from touching DOM state
    // (badge, button label) that's moved on to the next round/match.
    let cancelled = false;

    async function onShare() {
      shareBtn.disabled = true;
      shareBtn.textContent = "RENDERING…";
      try {
        const shareCanvas = await renderKOShareCard({
          winnerName: matchWinner.data.name,
          loserName: matchLoser.data.name,
          roundScore: wins,
          winnerCanvas: canvas,
        });
        await shareKOImage(shareCanvas, {
          title: `${matchWinner.data.name} won in Hood Vs Hood`,
          text: `${matchWinner.data.name} just won a fight in Hood Vs Hood!`,
        });
      } finally {
        if (!cancelled) {
          shareBtn.disabled = false;
          shareBtn.textContent = "SHARE YOUR WIN";
        }
      }
    }
    shareBtn.addEventListener("click", onShare);

    maybeShowVictoryFlourish(matchWinner, isP1Winner, canvas, ctx, verifiedBadge, () => cancelled);

    function onAgain() {
      cleanup();
      resolve(true);
    }
    function onBack() {
      cleanup();
      resolve(false);
    }
    function cleanup() {
      cancelled = true;
      actions.classList.add("hidden");
      document.getElementById("result").classList.add("hidden");
      againBtn.removeEventListener("click", onAgain);
      backBtn.removeEventListener("click", onBack);
      shareBtn.removeEventListener("click", onShare);
      shareBtn.classList.add("hidden");
      verifiedBadge.classList.add("hidden");
    }

    againBtn.addEventListener("click", onAgain);
    backBtn.addEventListener("click", onBack);
  });
}

// Cosmetic flex, not a security boundary - a purely client-side game has no
// way to make a client-only win screen cheat-proof (a visitor could patch
// this function to always show the badge), and that's fine here because
// nothing of real value is gated behind it: no prize, no leaderboard/rivalry
// write depends on this check, it only ever changes what the result screen
// looks like. Every early-return below is a "degrade to the completely
// normal win screen" path, not an error case, which is exactly the point -
// the overwhelmingly common case (disconnected wallet, AI opponent, free
// play) should hit none of this and see zero behavior change.
async function maybeShowVictoryFlourish(matchWinner, isP1Winner, canvas, ctx, verifiedBadge, isCancelled) {
  if (!isP1Winner) return; // AI (p2) won - see runMatch's own comment on why p1 is "the real player" today

  let address = null;
  try {
    address = await getConnectedAccount();
  } catch {
    address = null;
  }
  if (!address || isCancelled()) return; // free play, or never connected

  let owns = false;
  try {
    owns = await verifyOwnership(matchWinner.data.tokenId, address);
  } catch {
    // RPC hiccup, wrong chain mid-check, whatever - fail closed to the
    // normal screen rather than risk showing "verified" on an error.
    owns = false;
  }
  if (!owns || isCancelled()) return; // connected wallet doesn't actually hold this token

  verifiedBadge.classList.remove("hidden");
  playSound("ko", { volume: 0.9 });
  flashVictoryScreen(canvas, ctx, isCancelled);
}

// Two decaying pulses over the frozen final match frame rather than a flat
// single blink, so it reads as a deliberate flourish rather than a glitch.
// drawFlash only overlays semi-transparent white on top of whatever's
// already drawn (see body.js) - it never clears first - so the winner's
// flex pose and arena background underneath are untouched, just flashed
// over. Runs its own short rAF loop instead of hooking into game.js's, since
// that loop already stopped (createGame's returned stopGate) by the time
// this fires.
const VICTORY_FLASH_FRAMES = 30;
function flashVictoryScreen(canvas, ctx, isCancelled) {
  let frame = 0;
  function step() {
    // Bails the instant Play Again/Back is clicked (same cancelled flag
    // showMatchOverActions' cleanup() flips) - without this, a fast click
    // right as the flourish starts would leave this rAF loop still running
    // and painting white flash frames over whatever the NEXT match's own
    // loop is now drawing to this same ctx/canvas.
    if (isCancelled()) return;
    const t = frame / VICTORY_FLASH_FRAMES;
    const pulse = Math.abs(Math.sin(t * Math.PI * 2.5));
    drawFlash(ctx, canvas.width, canvas.height, pulse * (1 - t) * 0.7);
    frame++;
    if (frame <= VICTORY_FLASH_FRAMES) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
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
// Vercel build ran) - that's expected, so this just stays empty rather
// than showing a broken or fake link.
async function showIntegrityCheck() {
  const el = document.getElementById("integrity-check");
  if (!el) return;
  try {
    const res = await fetch("version.json", { cache: "no-store" });
    if (!res.ok) return;
    const { commit, repo } = await res.json();
    if (!commit || !repo) return;
    const short = commit.slice(0, 7);
    // Can't link the *exact* attestation record for this build - its ID is
    // only assigned once actions/attest-build-provenance runs in CI, which
    // happens after this very file (part of the attested artifact) is
    // already built - a chicken-and-egg problem. Linking the repo's
    // attestations list instead; a visitor can cross-reference it against
    // the commit shown right here.
    el.innerHTML = `&#10003; Build verified &mdash; <a href="https://github.com/${repo}/commit/${commit}" target="_blank" rel="noopener noreferrer">commit ${short}</a> &middot; <a href="https://github.com/${repo}/attestations" target="_blank" rel="noopener noreferrer">Sigstore attestation</a>`;
  } catch {
    // No network, or not a Vercel deploy - leave it empty.
  }
}
showIntegrityCheck();
