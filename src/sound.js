// Every clip here is a paid Splice sample, not bundled in the repo - see
// .gitignore and the README's licensing note. Missing/failed clips degrade
// to silence, not a crash - see initSound/playSound below.
const CLIPS = {
  punch: "assets/sounds/punch.mp3",
  kick: "assets/sounds/kick.mp3",
  jump: "assets/sounds/jump.mp3",
  hit: "assets/sounds/hit.mp3",
  block: "assets/sounds/block.mp3",
  ko: "assets/sounds/ko.mp3",
  powerfull: "assets/sounds/powerfull.mp3",
  uiclick: "assets/sounds/uiclick.mp3",
  boltWhoosh: "assets/sounds/bolt-whoosh.mp3",
  boltImpact: "assets/sounds/bolt-impact.mp3",
};

const TRACKS = [
  "assets/music/garbage-world.mp3",
  "assets/music/lets-go.mp3",
  "assets/music/missed-calls.mp3",
  "assets/music/muppet-trash.mp3",
  "assets/music/trash-panda.mp3",
  "assets/music/when-trash-cans-dance.mp3",
  "assets/music/waste-management.mp3",
];

let ctx = null;
const buffers = {};
// Music streams through a plain <audio> element instead of decoded Web
// Audio buffers - these are full tracks (3-5MB each), not short SFX, so
// decoding them all into memory up front would be wasteful.
let musicEl = null;

async function loadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

// Browsers block audio until a user gesture. Call this from the click
// handler that starts the fight so everything is ready in time.
export async function initSound() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Some browsers still create the context in a "suspended" state even
  // when constructed inside a gesture handler - resume() is a no-op if
  // it's already running, so this is safe to call unconditionally.
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => {});
  }
  await Promise.all(
    Object.entries(CLIPS).map(async ([name, url]) => {
      if (buffers[name]) return;
      try {
        buffers[name] = await loadBuffer(url);
      } catch (err) {
        console.warn(`[sound] failed to load "${name}" from ${url}:`, err);
        buffers[name] = null;
      }
    }),
  );
}

export function playSound(name, { volume = 0.7, rate = 1 } = {}) {
  const buffer = buffers[name];
  if (!ctx) {
    console.warn("[sound] playSound called before initSound completed:", name);
    return;
  }
  if (!buffer) {
    console.warn(`[sound] no buffer loaded for "${name}"`);
    return;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(ctx.destination);
  source.start();
}

// Picks a new random track each call so a rematch doesn't repeat the same
// song - swaps musicEl's src directly rather than creating a new element
// each time, so there's only ever one music track playing.
export function playRandomTrack({ volume = 0.35 } = {}) {
  if (!musicEl) {
    musicEl = new Audio();
    musicEl.loop = true;
  }
  let next = TRACKS[Math.floor(Math.random() * TRACKS.length)];
  if (TRACKS.length > 1 && next === musicEl.dataset.src) {
    next = TRACKS[(TRACKS.indexOf(next) + 1) % TRACKS.length];
  }
  musicEl.dataset.src = next;
  musicEl.src = next;
  musicEl.volume = volume;
  musicEl.currentTime = 0;
  musicEl.play().catch((err) => console.warn("[sound] music playback failed:", err));
}

export function stopMusic() {
  if (musicEl) musicEl.pause();
}
