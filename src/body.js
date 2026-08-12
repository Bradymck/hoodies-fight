const GROUND_Y = 300;
const HEAD_SIZE = 30;

const SHEETS = {
  idle: { img: loadImg("assets/sprites/idle.png"), frameSize: 78 },
  walk: { img: loadImg("assets/sprites/walk.png"), frameSize: 86 },
  attack: { img: loadImg("assets/sprites/attack.png"), frameSize: 86 },
  kick: { img: loadImg("assets/sprites/kick.png"), frameSize: 86 },
  jump: { img: loadImg("assets/sprites/jump.png"), frameSize: 86 },
  hurt: { img: loadImg("assets/sprites/hurt.png"), frameSize: 78 },
  death: { img: loadImg("assets/sprites/death.png"), frameSize: 86 },
};

// Per-frame neck/collar anchor points, sampled directly from each sheet's
// pixel bounding box (topmost opaque row, x-center of its first ~6 rows).
// This is what makes the head actually follow the body's lean/recoil
// instead of sitting pinned at one fixed point regardless of animation.
// Shifted 10px up from the raw sampled points - at the raw anchor the
// collar covered most of the head. Then nudged +3px x / +2px y after that
// still sat too far back/high relative to the body art.
const HEAD_ANCHORS = {
  idle: [{"x":37.8,"y":-8},{"x":37.8,"y":-8},{"x":37.8,"y":-8},{"x":38.3,"y":-8},{"x":38.8,"y":-8},{"x":38.8,"y":-8},{"x":38.5,"y":-8},{"x":37.8,"y":-8}],
  walk: [{"x":40.9,"y":5},{"x":42.5,"y":4},{"x":41.4,"y":3},{"x":42.1,"y":2},{"x":40.5,"y":4},{"x":40.9,"y":5},{"x":42.2,"y":3},{"x":41.8,"y":2}],
  attack: [{"x":42.0,"y":1},{"x":41.3,"y":0},{"x":40.9,"y":1},{"x":37.0,"y":3},{"x":33.3,"y":0},{"x":47.8,"y":-1},{"x":49.8,"y":2},{"x":47.3,"y":1}],
  kick: [{"x":42.0,"y":1},{"x":41.1,"y":2},{"x":39.8,"y":2},{"x":33.8,"y":2},{"x":43.5,"y":0},{"x":40.7,"y":-3},{"x":45.7,"y":4},{"x":42.3,"y":1}],
  jump: [{"x":42.0,"y":1},{"x":41.0,"y":1},{"x":41.6,"y":5},{"x":42.9,"y":10},{"x":45.3,"y":-4},{"x":41.5,"y":-6},{"x":40.9,"y":-3},{"x":41.3,"y":2}],
  hurt: [{"x":37.8,"y":-8},{"x":37.7,"y":-8},{"x":37.5,"y":-8},{"x":38.0,"y":-7},{"x":39.0,"y":-8},{"x":38.7,"y":-7},{"x":37.5,"y":-8},{"x":37.8,"y":-8}],
};

const ANIMS = {
  idle: { sheet: "idle", frames: 8, cyclesPerSec: 1.1, loop: true },
  walk: { sheet: "walk", frames: 8, cyclesPerSec: 2, loop: true },
  block: { sheet: "idle", frames: 1, cyclesPerSec: 0, loop: true },
  jump: { sheet: "jump", frames: 8, durationFrames: 36, loop: false },
  punch: { sheet: "attack", frames: 8, durationFrames: 22, loop: false },
  kick: { sheet: "kick", frames: 8, durationFrames: 34, loop: false },
  // No dedicated special-move sprite was generated - reusing the kick sheet
  // (same anchors work fine) with a gold glow + scale-up to read as a
  // distinct, bigger move rather than a plain kick.
  special: { sheet: "kick", frames: 8, durationFrames: 40, loop: false },
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
  const { x, facing, state, stateT, headImg, jumpOffset } = fighter;
  const anim = ANIMS[state] || ANIMS.idle;
  const { img: sheet, frameSize } = SHEETS[anim.sheet];
  const frame = frameIndex(anim, stateT);

  const isSpecial = state === "special";

  ctx.save();
  ctx.translate(x, GROUND_Y - frameSize - jumpOffset);
  if (facing === -1) {
    ctx.translate(frameSize, 0);
    ctx.scale(-1, 1);
  }

  if (isSpecial) {
    const glowT = Math.sin((frame / 8) * Math.PI);
    ctx.save();
    ctx.globalAlpha = 0.35 * glowT;
    ctx.filter = "brightness(3) saturate(0)";
    ctx.beginPath();
    ctx.arc(frameSize / 2, frameSize / 2, frameSize * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd700";
    ctx.fill();
    ctx.restore();
    ctx.translate(frameSize / 2, frameSize / 2);
    ctx.scale(1.15, 1.15);
    ctx.translate(-frameSize / 2, -frameSize / 2);
  }

  ctx.filter = isSpecial ? `${TINTS[playerNum]} saturate(2) brightness(1.2)` : TINTS[playerNum];
  if (sheet && sheet.complete) {
    ctx.drawImage(
      sheet,
      frame * frameSize,
      0,
      frameSize,
      frameSize,
      0,
      0,
      frameSize,
      frameSize,
    );
  }
  ctx.filter = "none";

  // Head is drawn on top of the body, in front of the collar. The head art
  // itself is now V-cropped at the bottom (see api.js cropToHeadShape) so
  // its neck point should land close to the body sprite's own collar V
  // instead of overlapping the shoulders.
  if (headImg && headImg.complete && state !== "ko") {
    const anchors = HEAD_ANCHORS[anim.sheet];
    const anchor = anchors ? anchors[frame % anchors.length] : { x: frameSize / 2, y: 10 };

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      headImg,
      anchor.x - HEAD_SIZE / 2,
      anchor.y - HEAD_SIZE / 2,
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

export function drawFlash(ctx, w, h, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export { GROUND_Y };
