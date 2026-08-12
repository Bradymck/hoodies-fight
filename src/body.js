const FRAME_SIZE = 86;
const GROUND_Y = 300;
const HEAD_SIZE = 30;
const HEAD_ANCHOR_X = 40;
const HEAD_ANCHOR_Y = 10;

const SHEETS = {
  idle: loadImg("assets/sprites/idle.png"),
  attack: loadImg("assets/sprites/attack.png"),
  hurt: loadImg("assets/sprites/hurt.png"),
  death: loadImg("assets/sprites/death.png"),
};

const ANIMS = {
  idle: { sheet: "idle", frames: 8, cyclesPerSec: 1.1, loop: true },
  walk: { sheet: "idle", frames: 8, cyclesPerSec: 2.2, loop: true },
  block: { sheet: "idle", frames: 1, cyclesPerSec: 0, loop: true },
  punch: { sheet: "attack", frames: 8, durationFrames: 22, loop: false },
  kick: { sheet: "attack", frames: 8, durationFrames: 34, loop: false },
  hitstun: { sheet: "hurt", frames: 8, durationFrames: 24, loop: false },
  ko: { sheet: "death", frames: 12, durationFrames: 60, loop: false },
};

const TINTS = {
  1: "hue-rotate(-88deg) saturate(1.6) brightness(1.05)",
  2: "hue-rotate(-58deg) saturate(1.3) brightness(0.85)",
};

function loadImg(src) {
  const img = new Image();
  img.src = src;
  return img;
}

function frameIndex(anim, stateT) {
  if (anim.loop) {
    if (anim.cyclesPerSec === 0) return 0;
    const framesPerSec = anim.cyclesPerSec * anim.frames;
    return Math.floor((stateT / 60) * framesPerSec) % anim.frames;
  }
  const perFrame = anim.durationFrames / anim.frames;
  return Math.min(anim.frames - 1, Math.floor(stateT / perFrame));
}

export function drawFighter(ctx, fighter, playerNum) {
  const { x, facing, state, stateT, headImg } = fighter;
  const anim = ANIMS[state] || ANIMS.idle;
  const sheet = SHEETS[anim.sheet];
  const frame = frameIndex(anim, stateT);

  ctx.save();
  ctx.translate(x, GROUND_Y - FRAME_SIZE);
  if (facing === -1) {
    ctx.translate(FRAME_SIZE, 0);
    ctx.scale(-1, 1);
  }

  ctx.filter = TINTS[playerNum];
  if (sheet && sheet.complete) {
    ctx.drawImage(
      sheet,
      frame * FRAME_SIZE,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
      0,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
    );
  }
  ctx.filter = "none";

  if (headImg && headImg.complete && state !== "ko") {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      headImg,
      HEAD_ANCHOR_X - HEAD_SIZE / 2,
      HEAD_ANCHOR_Y - HEAD_SIZE / 2,
      HEAD_SIZE,
      HEAD_SIZE,
    );
  }

  ctx.restore();
}

export function drawArena(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#1b1330";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#3a2a5c";
  ctx.fillRect(0, GROUND_Y, w, h - GROUND_Y);
  ctx.strokeStyle = "#5a4680";
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(w, GROUND_Y);
  ctx.stroke();
}

export { GROUND_Y };
