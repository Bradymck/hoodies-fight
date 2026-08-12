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
  const arrayBuffer = await res.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

// Browsers block audio until a user gesture. Call this from the click
// handler that starts the fight so everything is ready in time.
export async function initSound() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  await Promise.all(
    Object.entries(CLIPS).map(async ([name, url]) => {
      try {
        buffers[name] = await loadBuffer(url);
      } catch {
        buffers[name] = null;
      }
    }),
  );
}

export function playSound(name, { volume = 0.7, rate = 1 } = {}) {
  const buffer = buffers[name];
  if (!ctx || !buffer) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(ctx.destination);
  source.start();
}
