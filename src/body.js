const COLORS = {
  1: { body: "#3d8bfd", limb: "#2a5fb0" },
  2: { body: "#fd3d5c", limb: "#b02a3f" },
};

const GROUND_Y = 300;
const BODY_W = 40;
const BODY_H = 90;
const HEAD_SIZE = 26;

export function drawFighter(ctx, fighter, playerNum) {
  const { x, facing, state, stateT, headImg } = fighter;
  const c = COLORS[playerNum];
  const f = facing; // 1 = facing right, -1 = facing left

  ctx.save();
  ctx.translate(x, GROUND_Y);

  if (state === "ko") {
    ctx.rotate((f * Math.PI) / 2);
    ctx.translate(-BODY_H / 2, 0);
  }

  const flash = state === "hitstun" && Math.floor(stateT / 60) % 2 === 0;
  ctx.fillStyle = flash ? "#ffffff" : c.body;

  const legLift = state === "walk" ? Math.sin(stateT / 60) * 8 : 0;
  ctx.fillRect(-BODY_W / 2, -BODY_H + 40, 12, 40 - legLift);
  ctx.fillRect(2, -BODY_H + 40, 12, 40 + legLift);

  let kickExtend = 0;
  if (state === "kick") kickExtend = Math.min(stateT / 2, 34);
  ctx.fillRect(f * (BODY_W / 2 - 6), -BODY_H + 45, f * (14 + kickExtend), 14);

  ctx.fillRect(-BODY_W / 2, -BODY_H + 18, BODY_W, 40);

  ctx.fillStyle = flash ? "#ffffff" : c.limb;
  if (state === "block") {
    ctx.fillRect(f * (BODY_W / 2 - 4), -BODY_H + 20, f * 18, 30);
  } else {
    let punchExtend = 0;
    if (state === "punch") punchExtend = Math.min(stateT / 1.5, 30);
    ctx.fillRect(f * (BODY_W / 2 - 4), -BODY_H + 24, f * (16 + punchExtend), 10);
    ctx.fillRect(-BODY_W / 2 - 4, -BODY_H + 30, 10, 24);
  }

  if (headImg && headImg.complete) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      headImg,
      -HEAD_SIZE / 2,
      -BODY_H + 18 - HEAD_SIZE + 4,
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

export { GROUND_Y, BODY_W, BODY_H };
