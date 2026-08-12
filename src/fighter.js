export const MOVE_SPEED = 3;
export const MAX_HEALTH = 100;

const PUNCH = { duration: 22, activeStart: 6, activeEnd: 14, damage: 6, range: 46 };
const KICK = { duration: 34, activeStart: 10, activeEnd: 22, damage: 10, range: 58 };
const HITSTUN_FRAMES = 24;
const JUMP_DURATION = 36;
const JUMP_HEIGHT = 55;

export class Fighter {
  constructor(data, x, facing) {
    this.data = data;
    this.headImg = new Image();
    this.headImg.crossOrigin = "anonymous";
    this.headImg.src = data.imageUrl;

    this.x = x;
    this.facing = facing;
    this.state = "idle";
    this.stateT = 0;
    this.health = MAX_HEALTH;
    this.hasHit = false;
  }

  get name() {
    return this.data.name;
  }

  setState(state) {
    this.state = state;
    this.stateT = 0;
    this.hasHit = false;
  }

  update(input, opponent) {
    if (this.state === "ko") {
      this.stateT++;
      return;
    }

    this.stateT++;

    if (["punch", "kick", "hitstun"].includes(this.state)) {
      const durations = { punch: PUNCH.duration, kick: KICK.duration, hitstun: HITSTUN_FRAMES };
      if (this.stateT >= durations[this.state]) this.setState("idle");
      return;
    }

    if (this.state === "jump") {
      this.applyMove(input, opponent);
      if (this.stateT >= JUMP_DURATION) this.setState("idle");
      return;
    }

    if (this.state === "block" && !input.block) {
      this.setState("idle");
    }

    if (input.block) {
      if (this.state !== "block") this.setState("block");
      return;
    }
    if (input.jump && this.state !== "jump") {
      this.setState("jump");
      return;
    }
    if (input.punch && this.state !== "punch") {
      this.setState("punch");
      return;
    }
    if (input.kick && this.state !== "kick") {
      this.setState("kick");
      return;
    }

    const vx = this.applyMove(input, opponent);
    this.state = vx !== 0 ? "walk" : "idle";
  }

  applyMove(input, opponent) {
    let vx = 0;
    if (input.left) vx -= MOVE_SPEED;
    if (input.right) vx += MOVE_SPEED;
    this.x += vx;
    this.x = Math.max(50, Math.min(750, this.x));

    const minGap = 40;
    if (this.facing === 1 && opponent.x - this.x < minGap) this.x = opponent.x - minGap;
    if (this.facing === -1 && this.x - opponent.x < minGap) this.x = opponent.x + minGap;
    return vx;
  }

  get jumpOffset() {
    if (this.state !== "jump") return 0;
    const t = Math.min(1, this.stateT / JUMP_DURATION);
    return JUMP_HEIGHT * 4 * t * (1 - t);
  }

  attackHitbox() {
    const spec = this.state === "punch" ? PUNCH : this.state === "kick" ? KICK : null;
    if (!spec) return null;
    if (this.stateT < spec.activeStart || this.stateT > spec.activeEnd) return null;
    if (this.hasHit) return null;
    return { from: this.x, to: this.x + this.facing * spec.range, damage: spec.damage };
  }

  takeDamage(amount, fromX) {
    if (this.state === "block") {
      this.health -= amount * 0.2;
    } else {
      this.health -= amount;
      this.setState("hitstun");
    }
    this.health = Math.max(0, this.health);
    if (this.health <= 0) this.setState("ko");
  }
}
