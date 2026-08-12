const CLIPS = {
  punch: "assets/sounds/punch.mp3",
  kick: "assets/sounds/kick.mp3",
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

// No good "jump whoosh" in the Kenney packs used elsewhere, so this one is
// synthesized instead: a quick rising-then-falling pitch sweep.
export function playJumpWhoosh() {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.linearRampToValueAtTime(520, now + 0.12);
  osc.frequency.linearRampToValueAtTime(180, now + 0.3);
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.32);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.32);
}
