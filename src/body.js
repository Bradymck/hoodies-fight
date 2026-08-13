const GROUND_Y = 300;
const HEAD_SIZE = 30;
const CHARACTER_Y_OFFSET = 5;
const CHARACTER_SCALE = 1.4;
// Corrects the crouch sheet's own art scale back in line with the other
// sheets - see the comment where this is applied in drawFighter for the
// measured numbers behind it.
const CROUCH_EXTRA_SCALE = 0.77;
// The death sheet fits a full lying-down body into a 62px frame, notably
// narrower than the 78-86px the standing sheets author their (taller,
// upright) art at - without this it reads as a shrunken doll instead of the
// same-sized character just knocked flat. ~78/62, matched to the standing
// sheets' own frame size.
const DEATH_EXTRA_SCALE = 1.3;
const PLATFORM_TILE_COUNT = 4;
// How far the platform texture extends above GROUND_Y - see drawArena.
const PLATFORM_TOP_OVERSCAN = 24;
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
  loadImg("assets/fx/blood-spot-4.png"),
  loadImg("assets/fx/blood-spot-5.png"),
  loadImg("assets/fx/blood-spot-6.png"),
];
const BLOOD_SPATTER_SHEET = loadImg("assets/fx/blood-spatter-sheet.png");
const BLOOD_SPATTER_FRAME = 34;
const BLOOD_SPATTER_FRAMES = 5;

// Static splat shapes layered behind the animated spatter burst for extra
// density - 3 variants (small/medium/large) in one 240x80 sheet, 80px each.
const BLOOD_SPLAT_EXTRA_SHEET = loadImg("assets/fx/blood-splat-extra.png");
const BLOOD_SPLAT_EXTRA_FRAME = 80;
const BLOOD_SPLAT_EXTRA_VARIANTS = 3;

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
  // Replaced with a real collapse-and-fall animation - the old file here was
  // a placeholder, never an actual death pose.
  death: { img: loadImg("assets/sprites/death.png"), frameSize: 62 },
  crouch: { img: loadImg("assets/sprites/crouch.png"), frameSize: 70 },
  block: { img: loadImg("assets/sprites/block.png"), frameSize: 78 },
  spellcast: { img: loadImg("assets/sprites/spellcast.png"), frameSize: 78 },
  // Single-frame still poses, held for their whole state duration rather
  // than cycling - same pattern crouch already uses.
  slide: { img: loadImg("assets/sprites/slide.png"), frameSize: 62 },
  knockback: { img: loadImg("assets/sprites/knockback.png"), frameSize: 76 },
  uppercut: { img: loadImg("assets/sprites/uppercut.png"), frameSize: 78 },
  // Post-match victory pose - only ever entered externally by game.js when
  // a round ends, never by player input.
  flex: { img: loadImg("assets/sprites/flex.png"), frameSize: 78 },
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
  block: [{"x":37.8,"y":-7},{"x":37.8,"y":-7},{"x":38.6,"y":-7},{"x":38.6,"y":-7},{"x":38.6,"y":-7},{"x":39.0,"y":-7},{"x":38.6,"y":-7},{"x":39.0,"y":-7}],
  // Sampled with the same method/offset as every other sheet above (raw
  // topmost-opaque-row + first-6-rows x-center, then the same +3x/-7y net
  // shift that lined up all six other sheets) - the character stands nearly
  // still through the whole cast, so these barely move frame to frame.
  spellcast: [{"x":35.9,"y":-7},{"x":35.9,"y":-7},{"x":35.9,"y":-7},{"x":36.3,"y":-7},{"x":36.4,"y":-7},{"x":36.1,"y":-7},{"x":35.9,"y":-7},{"x":36.3,"y":-7},{"x":36.4,"y":-7},{"x":36.1,"y":-7},{"x":35.9,"y":-7},{"x":36.0,"y":-7},{"x":36.0,"y":-7},{"x":35.9,"y":-7},{"x":35.9,"y":-7},{"x":35.9,"y":-7},{"x":36.9,"y":-7},{"x":38.2,"y":-7},{"x":37.8,"y":-7},{"x":38.3,"y":-7},{"x":36.7,"y":-7}],
  // Single low ground pose - sampled the same way as crouch.
  slide: [{"x":13.5,"y":2}],
  // Single mid-air knocked-back pose.
  knockback: [{"x":63.0,"y":4}],
  // 8-frame crouch-charge-into-upward-strike - same sampling method as
  // every other multi-frame sheet.
  // Frames 5-6 (the punch's peak/follow-through) had the raised fist
  // hijacking the topmost-opaque-pixel sample instead of the hood/collar -
  // re-sampled restricted to the body's central column so the arm can't
  // throw it off; frame 6 in particular was off by ~10px toward the fist.
  uppercut: [{"x":37.8,"y":-7},{"x":38.0,"y":-7},{"x":38.8,"y":3},{"x":39.7,"y":9},{"x":38.9,"y":10},{"x":46.2,"y":-7},{"x":45.1,"y":0},{"x":42.3,"y":-6}],
  // 8-frame crouch-into-flex victory pose - same sampling method.
  flex: [{"x":37.8,"y":-7},{"x":38.4,"y":-4},{"x":38.0,"y":5},{"x":38.0,"y":7},{"x":37.9,"y":7},{"x":41.3,"y":5},{"x":42.8,"y":-1},{"x":40.0,"y":-2}],
};

const ANIMS = {
  idle: { sheet: "idle", frames: 8, cyclesPerSec: 1.1, loop: true },
  walk: { sheet: "walk", frames: 8, cyclesPerSec: 2, loop: true },
  block: { sheet: "block", frames: 8, cyclesPerSec: 1.3, loop: true },
  crouch: { sheet: "crouch", frames: 1, cyclesPerSec: 0, loop: true },
  // durationFrames (48) matches JUMP_DURATION in fighter.js - taller/longer
  // arc than before so a jump can actually clear over the other fighter
  // instead of just hopping in place.
  jump: { sheet: "jump", frames: 8, durationFrames: 48, loop: false },
  punch: { sheet: "attack", frames: 8, durationFrames: 22, loop: false },
  kick: { sheet: "kick", frames: 8, durationFrames: 34, loop: false },
  // durationFrames (30) matches SPECIAL.release in fighter.js exactly, so
  // the cast finishes on the sheet's last (fullest-charge) frame right as
  // the projectile fires - frameIndex clamps to that last frame for the
  // remaining recovery frames in SPECIAL.duration, holding the release pose.
  special: { sheet: "spellcast", frames: 21, durationFrames: 30, loop: false },
  hitstun: { sheet: "hurt", frames: 8, durationFrames: 24, loop: false },
  // Single still frame held for the whole slide (game.js moves the fighter's
  // x directly while this state is active - see updateSlide). durationFrames
  // matches SLIDE.duration in fighter.js.
  slide: { sheet: "slide", frames: 1, durationFrames: 44, loop: false },
  // Single still frame held while knocked back from a connecting slide.
  knockback: { sheet: "knockback", frames: 1, durationFrames: 28, loop: false },
  // durationFrames (32) over 8 sheet frames matches UPPERCUT.duration in
  // fighter.js.
  uppercut: { sheet: "uppercut", frames: 8, durationFrames: 32, loop: false },
  // Slowed from 60 (a blink-and-you-miss-it 1s) to actually read as a
  // collapse instead of a flicker.
  ko: { sheet: "death", frames: 8, durationFrames: 100, loop: false },
  // Plays the crouch-into-flex sequence once, then frameIndex's own
  // non-loop clamping holds on the final (fullest-flex) frame for however
  // much longer the post-match display runs - not looped, so it doesn't
  // visibly crouch back down and repeat mid-celebration.
  flex: { sheet: "flex", frames: 8, durationFrames: 40, loop: false },
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
  // Every other pose faces the way this fighter is actually facing (always
  // toward the opponent). Knockback is the one exception - it's the fighter
  // flying AWAY from whatever just hit them, i.e. travelling backward
  // relative to their own facing, so the source art (which leads in one
  // fixed direction) needs the opposite mirror rule or it reads as flying
  // toward the attacker instead of away from them.
  const shouldFlip = state === "knockback" ? facing === 1 : facing === -1;
  if (shouldFlip) {
    ctx.translate(frameSize, 0);
    ctx.scale(-1, 1);
  }

  const isCrouch = state === "crouch";

  // The crouch source art draws the character filling notably more of its
  // frame than every other sheet (measured ~69% of frame width vs ~47% for
  // idle/walk/etc), so at the same CHARACTER_SCALE it read as the character
  // visibly growing on the squat instead of just hunching down. Only the
  // body sprite is scaled down here (in its own save/restore) - the head is
  // drawn afterward at its normal size, just repositioned to follow, so
  // ducking shrinks the body without also shrinking the head.
  ctx.save();
  if (isCrouch) {
    ctx.translate(frameSize / 2, frameSize);
    ctx.scale(CROUCH_EXTRA_SCALE, CROUCH_EXTRA_SCALE);
    ctx.translate(-frameSize / 2, -frameSize);
  } else if (state === "ko") {
    // Same bottom-center pivot as crouch, scaling up instead of down - keeps
    // the now-larger lying-down body anchored to the ground instead of
    // growing upward/off-position.
    ctx.translate(frameSize / 2, frameSize);
    ctx.scale(DEATH_EXTRA_SCALE, DEATH_EXTRA_SCALE);
    ctx.translate(-frameSize / 2, -frameSize);
  }

  if (isSpecial) {
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
  ctx.restore();

  // Head is drawn on top of the body, in front of the collar, at its normal
  // (unshrunk) size - see isCrouch above. The head art itself is now
  // V-cropped at the bottom (see api.js cropToHeadShape) so its neck point
  // should land close to the body sprite's own collar V instead of
  // overlapping the shoulders.
  if (headImg && headImg.complete && state !== "ko") {
    const anchors = HEAD_ANCHORS[anim.sheet];
    let anchor = anchors ? anchors[frame % anchors.length] : { x: frameSize / 2, y: 10 };
    // Anchors are sampled against the crouch sheet's own (unscaled) pixels,
    // so they need the same pivot transform applied above to still land on
    // the now-shrunk body instead of where the head used to sit.
    if (isCrouch) {
      const pivotX = frameSize / 2;
      const pivotY = frameSize;
      anchor = {
        x: (anchor.x - pivotX) * CROUCH_EXTRA_SCALE + pivotX,
        y: (anchor.y - pivotY) * CROUCH_EXTRA_SCALE + pivotY,
      };
    }

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
    // Extends the wood texture upward past GROUND_Y (purely visual - the
    // actual "ground" line everything else stands/calculates on doesn't
    // move) so ground blood decals, which can reach a bit above GROUND_Y,
    // land on visible floor instead of spilling out over the background.
    const platformTop = GROUND_Y - PLATFORM_TOP_OVERSCAN;
    const platformH = h - platformTop;
    // Non-uniform scale so exactly PLATFORM_TILE_COUNT tiles span the full
    // width with no partial tile cut off at the edge - keeps the seams
    // landing cleanly instead of stopping mid-tile.
    const scaleX = w / (PLATFORM_TILE_COUNT * PLATFORM_TILE.naturalWidth);
    const scaleY = platformH / PLATFORM_TILE.naturalHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(0, platformTop);
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

export function drawBloodSpatter(ctx, x, y, frame, rotation = 0) {
  if (!BLOOD_SPATTER_SHEET.complete || BLOOD_SPATTER_SHEET.naturalWidth === 0) return;
  const f = Math.min(BLOOD_SPATTER_FRAMES - 1, Math.max(0, frame));
  const size = BLOOD_SPATTER_FRAME * BLOOD_SPATTER_DRAW_SCALE;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(
    BLOOD_SPATTER_SHEET,
    f * BLOOD_SPATTER_FRAME,
    0,
    BLOOD_SPATTER_FRAME,
    BLOOD_SPATTER_FRAME,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  ctx.restore();
}

// Static splat layered behind the animated spatter burst for extra density -
// one of 3 fixed variants, randomized position/rotation/scale per spawn.
export function drawBloodSplatExtra(ctx, x, y, variant, rotation, scale) {
  if (!BLOOD_SPLAT_EXTRA_SHEET.complete || BLOOD_SPLAT_EXTRA_SHEET.naturalWidth === 0) return;
  const v = Math.min(BLOOD_SPLAT_EXTRA_VARIANTS - 1, Math.max(0, variant));
  const size = BLOOD_SPLAT_EXTRA_FRAME * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(
    BLOOD_SPLAT_EXTRA_SHEET,
    v * BLOOD_SPLAT_EXTRA_FRAME,
    0,
    BLOOD_SPLAT_EXTRA_FRAME,
    BLOOD_SPLAT_EXTRA_FRAME,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  ctx.restore();
}

export function pickBloodSplatVariant() {
  return Math.floor(Math.random() * BLOOD_SPLAT_EXTRA_VARIANTS);
}

// Traveling projectile fired by the ranged special (game.js owns its
// position/lifetime, this just draws whatever frame it's on). The sheet's
// 16th frame is a leftover opaque placeholder tile from the source asset,
// not real content, so only the first 15 are ever indexed.
const SURGE_BLAST_SHEET = loadImg("assets/fx/surge-blast.png");
const SURGE_BLAST_FRAME = 180;
export const SURGE_BLAST_TOTAL_FRAMES = 15;
// Native frames are huge relative to the ~78px fighter frames - scaled down
// to read as a fireball roughly proportional to the character throwing it.
const SURGE_BLAST_DRAW_SCALE = 0.55;

export function drawSurgeBlast(ctx, x, y, frame, facing) {
  if (!SURGE_BLAST_SHEET.complete || SURGE_BLAST_SHEET.naturalWidth === 0) return;
  const f = ((frame % SURGE_BLAST_TOTAL_FRAMES) + SURGE_BLAST_TOTAL_FRAMES) % SURGE_BLAST_TOTAL_FRAMES;
  const size = SURGE_BLAST_FRAME * SURGE_BLAST_DRAW_SCALE;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  if (facing === -1) ctx.scale(-1, 1);
  ctx.drawImage(
    SURGE_BLAST_SHEET,
    f * SURGE_BLAST_FRAME,
    0,
    SURGE_BLAST_FRAME,
    SURGE_BLAST_FRAME,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  ctx.restore();
}

// Flipper's special - a rat swarm rushing along the ground instead of a
// ranged bolt (game.js owns its position/lifetime, same as the surge blast
// above). 18 frames, rearing up then flattening into a low charge - cycled
// on a loop while it travels rather than played once, so it reads as a
// scuttling mass the whole time it's in flight.
const RAT_RUSH_SHEET = loadImg("assets/fx/rat-rush.png");
const RAT_RUSH_FRAME = 190;
export const RAT_RUSH_TOTAL_FRAMES = 18;
const RAT_RUSH_DRAW_SCALE = 0.55;

// Ground-anchored (bottom edge at y, not center) unlike the head-height
// surge blast - this is meant to be hugging the floor it's rushing across.
export function drawRatRush(ctx, x, y, frame, facing) {
  if (!RAT_RUSH_SHEET.complete || RAT_RUSH_SHEET.naturalWidth === 0) return;
  const f = ((frame % RAT_RUSH_TOTAL_FRAMES) + RAT_RUSH_TOTAL_FRAMES) % RAT_RUSH_TOTAL_FRAMES;
  const size = RAT_RUSH_FRAME * RAT_RUSH_DRAW_SCALE;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  if (facing === -1) ctx.scale(-1, 1);
  ctx.drawImage(
    RAT_RUSH_SHEET,
    f * RAT_RUSH_FRAME,
    0,
    RAT_RUSH_FRAME,
    RAT_RUSH_FRAME,
    -size / 2,
    -size,
    size,
    size,
  );
  ctx.restore();
}

// Impact burst where a projectile actually lands - plays through once, like
// the melee blood-spatter burst, and is gone.
const ENERGY_BURST_SHEET = loadImg("assets/fx/energy-burst.png");
const ENERGY_BURST_FRAME = 80;
export const ENERGY_BURST_TOTAL_FRAMES = 5;
const ENERGY_BURST_DRAW_SCALE = 1.6;

export function drawEnergyBurst(ctx, x, y, frame) {
  if (!ENERGY_BURST_SHEET.complete || ENERGY_BURST_SHEET.naturalWidth === 0) return;
  const f = Math.min(ENERGY_BURST_TOTAL_FRAMES - 1, Math.max(0, frame));
  const size = ENERGY_BURST_FRAME * ENERGY_BURST_DRAW_SCALE;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  ctx.drawImage(
    ENERGY_BURST_SHEET,
    f * ENERGY_BURST_FRAME,
    0,
    ENERGY_BURST_FRAME,
    ENERGY_BURST_FRAME,
    -size / 2,
    -size / 2,
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
