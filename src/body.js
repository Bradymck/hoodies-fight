const GROUND_Y = 300;
const HEAD_SIZE = 30;
const CHARACTER_Y_OFFSET = 5;
const CHARACTER_SCALE = 1.4;
const PLATFORM_TILE_COUNT = 4;
const ARENA_BACKGROUNDS = [
  loadImg("assets/backgrounds/arena-2.png"),
  loadImg("assets/backgrounds/arena-3.png"),
];
const PLATFORM_TILE = loadImg("assets/backgrounds/platform.png");
let platformPattern = null;
let currentArenaIndex = 0;

// Called once per fight (see main.js) so the backdrop stays fixed for the
// whole match instead of changing mid-fight.
export function pickRandomArena() {
  currentArenaIndex = Math.floor(Math.random() * ARENA_BACKGROUNDS.length);
}

const BLOOD_SPOTS = [
  loadImg("assets/fx/blood-spot-1.png"),
  loadImg("assets/fx/blood-spot-2.png"),
  loadImg("assets/fx/blood-spot-3.png"),
];
const BLOOD_SPATTER_SHEET = loadImg("assets/fx/blood-spatter-sheet.png");
const BLOOD_SPATTER_FRAME = 34;
const BLOOD_SPATTER_FRAMES = 5;

// KO flourish - single static burst image (pulled from the aquaprime-sandbox
// project's fx set), animated here via scale/fade rather than a frame sheet.
const HEAD_POP_IMG = loadImg("assets/fx/head-pop.png");
export const HEAD_POP_DURATION = 30;

const SHEETS = {
  idle: { img: loadImg("assets/sprites/idle.png"), frameSize: 78 },
  walk: { img: loadImg("assets/sprites/walk.png"), frameSize: 86 },
  attack: { img: loadImg("assets/sprites/attack.png"), frameSize: 86 },
  kick: { img: loadImg("assets/sprites/kick.png"), frameSize: 86 },
  jump: { img: loadImg("assets/sprites/jump.png"), frameSize: 86 },
  hurt: { img: loadImg("assets/sprites/hurt.png"), frameSize: 78 },
  death: { img: loadImg("assets/sprites/death.png"), frameSize: 86 },
  crouch: { img: loadImg("assets/sprites/crouch.png"), frameSize: 70 },
};

// Per-frame neck/collar anchor points, sampled directly from each sheet's
// pixel bounding box (topmost opaque row, x-center of its first ~6 rows).
// This is what makes the head actually follow the body's lean/recoil
// instead of sitting pinned at one fixed point regardless of animation.
// Shifted 10px up from the raw sampled points - at the raw anchor the
// collar covered most of the head. Then nudged +3px x / +2px y after that
// still sat too far back/high relative to the body art.
const HEAD_ANCHORS = {
  idle: [{"x":37.8,"y":-7},{"x":37.8,"y":-7},{"x":37.8,"y":-7},{"x":38.3,"y":-7},{"x":38.8,"y":-7},{"x":38.8,"y":-7},{"x":38.5,"y":-7},{"x":37.8,"y":-7}],
  walk: [{"x":40.9,"y":6},{"x":42.5,"y":5},{"x":41.4,"y":4},{"x":42.1,"y":3},{"x":40.5,"y":5},{"x":40.9,"y":6},{"x":42.2,"y":4},{"x":41.8,"y":3}],
  attack: [{"x":42.0,"y":2},{"x":41.3,"y":1},{"x":40.9,"y":2},{"x":37.0,"y":4},{"x":33.3,"y":1},{"x":47.8,"y":0},{"x":49.8,"y":3},{"x":47.3,"y":2}],
  kick: [{"x":42.0,"y":2},{"x":41.1,"y":3},{"x":39.8,"y":3},{"x":33.8,"y":3},{"x":43.5,"y":1},{"x":40.7,"y":-2},{"x":45.7,"y":5},{"x":42.3,"y":2}],
  jump: [{"x":42.0,"y":2},{"x":41.0,"y":2},{"x":41.6,"y":6},{"x":42.9,"y":11},{"x":45.3,"y":-3},{"x":41.5,"y":-5},{"x":40.9,"y":-2},{"x":41.3,"y":3}],
  hurt: [{"x":37.8,"y":-7},{"x":37.7,"y":-7},{"x":37.5,"y":-7},{"x":38.0,"y":-6},{"x":39.0,"y":-7},{"x":38.7,"y":-6},{"x":37.5,"y":-7},{"x":37.8,"y":-7}],
  // Single static pose - hunched crouch leaves very little headroom above
  // the hood, unlike the standing sheets, so this sits much closer to the
  // sampled raw point than the others needed to. Shifted forward (+9x) from
  // the raw sample - the hunch leans the head toward the front, not the
  // trailing/rear edge the raw collar point sat at.
  crouch: [{"x":40,"y":4}],
};

const ANIMS = {
  idle: { sheet: "idle", frames: 8, cyclesPerSec: 1.1, loop: true },
  walk: { sheet: "walk", frames: 8, cyclesPerSec: 2, loop: true },
  block: { sheet: "idle", frames: 1, cyclesPerSec: 0, loop: true },
  crouch: { sheet: "crouch", frames: 1, cyclesPerSec: 0, loop: true },
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
  // frameSize is per-sheet (crouch's is shorter than the standing sheets),
  // so anchoring off it here naturally grounds the crouch pose without any
  // extra transform - a hunched sprite is just a shorter frame.
  ctx.translate(x, GROUND_Y - frameSize * CHARACTER_SCALE - jumpOffset + CHARACTER_Y_OFFSET);
  ctx.scale(CHARACTER_SCALE, CHARACTER_SCALE);
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
  const bg = ARENA_BACKGROUNDS[currentArenaIndex];
  if (bg.complete && bg.naturalWidth > 0) {
    ctx.drawImage(bg, 0, 0, w, h);
  } else {
    ctx.fillStyle = "#1b1330";
    ctx.fillRect(0, 0, w, h);
  }

  if (PLATFORM_TILE.complete && PLATFORM_TILE.naturalWidth > 0) {
    if (!platformPattern) platformPattern = ctx.createPattern(PLATFORM_TILE, "repeat");
    const platformH = h - GROUND_Y;
    // Non-uniform scale so exactly PLATFORM_TILE_COUNT tiles span the full
    // width with no partial tile cut off at the edge - keeps the seams
    // landing cleanly instead of stopping mid-tile.
    const scaleX = w / (PLATFORM_TILE_COUNT * PLATFORM_TILE.naturalWidth);
    const scaleY = platformH / PLATFORM_TILE.naturalHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(0, GROUND_Y);
    ctx.scale(scaleX, scaleY);
    ctx.fillStyle = platformPattern;
    ctx.fillRect(0, 0, w / scaleX, platformH / scaleY);
    ctx.restore();
  }
}

export function drawFlash(ctx, w, h, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// Ground blood decals persist for the whole fight. `decal` is
// {imgIndex, x, y, size, rotation} - imgIndex picked/randomized by the
// caller so repeated hits don't all look identical. `size` is the desired
// on-screen width in px - the three source images are different native
// sizes (32/50/100px), so this normalizes them to a comparable footprint.
export function drawBloodSpot(ctx, decal) {
  const img = BLOOD_SPOTS[decal.imgIndex % BLOOD_SPOTS.length];
  if (!img.complete || img.naturalWidth === 0) return;
  ctx.save();
  ctx.translate(decal.x, decal.y);
  ctx.rotate(decal.rotation);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -decal.size / 2, -decal.size / 2, decal.size, decal.size);
  ctx.restore();
}

export function pickBloodSpotVariant() {
  return Math.floor(Math.random() * BLOOD_SPOTS.length);
}

// Brief impact burst at the hit location - plays through its 5 frames once
// and is gone, unlike the ground spots which stay.
export const BLOOD_SPATTER_TOTAL_FRAMES = BLOOD_SPATTER_FRAMES;

// Drawn at ~1.8x native size - the source frames read as too small/subtle
// at 1:1 next to the 1.4x-scaled fighters.
const BLOOD_SPATTER_DRAW_SCALE = 1.8;

export function drawBloodSpatter(ctx, x, y, frame) {
  if (!BLOOD_SPATTER_SHEET.complete || BLOOD_SPATTER_SHEET.naturalWidth === 0) return;
  const f = Math.min(BLOOD_SPATTER_FRAMES - 1, Math.max(0, frame));
  const size = BLOOD_SPATTER_FRAME * BLOOD_SPATTER_DRAW_SCALE;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    BLOOD_SPATTER_SHEET,
    f * BLOOD_SPATTER_FRAME,
    0,
    BLOOD_SPATTER_FRAME,
    BLOOD_SPATTER_FRAME,
    x - size / 2,
    y - size / 2,
    size,
    size,
  );
  ctx.restore();
}

// Plays once over the KO's head position - scales up and fades out rather
// than stepping frames, since the source art is one still burst image.
export function drawHeadPop(ctx, x, y, t) {
  if (!HEAD_POP_IMG.complete || HEAD_POP_IMG.naturalWidth === 0) return;
  const progress = Math.min(1, t / HEAD_POP_DURATION);
  const scale = 0.6 + progress * 1.4;
  const alpha = 1 - progress;
  const size = HEAD_POP_IMG.naturalWidth * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(HEAD_POP_IMG, x - size / 2, y - size / 2, size, size);
  ctx.restore();
}

export { GROUND_Y };
