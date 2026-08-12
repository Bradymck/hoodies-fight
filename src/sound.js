const CLIPS = {
  punch: "assets/sounds/punch.mp3",
  kick: "assets/sounds/kick.mp3",
  jump: "assets/sounds/jump.mp3",
  hit: "assets/sounds/hit.mp3",
  block: "assets/sounds/block.mp3",
  ko: "assets/sounds/ko.mp3",
  powerfull: "assets/sounds/powerfull.mp3",
  uiclick: "assets/sounds/uiclick.mp3",
};

let ctx = null;
const buffers = {};

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
