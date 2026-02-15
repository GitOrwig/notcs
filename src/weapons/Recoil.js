// Follow-recoil system. Each weapon has a spray pattern.
// Camera pitch/yaw follows the pattern as shots fire.
// Player counter-strafes by moving mouse opposite the pattern.

export const SPRAY_PATTERNS = {
  ak47: [
    { x: 0,    y: 0.6 },
    { x: 0.15, y: 0.8 },
    { x: 0.3,  y: 0.7 },
    { x: 0.4,  y: 0.5 },
    { x: 0.35, y: 0.6 },
    { x: 0.2,  y: 0.8 },
    { x: -0.1, y: 0.7 },
    { x: -0.3, y: 0.6 },
    { x: -0.45,y: 0.5 },
    { x: -0.4, y: 0.6 },
    { x: -0.25,y: 0.7 },
    { x: -0.1, y: 0.6 },
    { x: 0.1,  y: 0.5 },
    { x: 0.2,  y: 0.55 },
    { x: 0.15, y: 0.6 },
    { x: 0.0,  y: 0.55 },
    { x: -0.1, y: 0.5 },
    { x: -0.2, y: 0.55 },
    { x: -0.15,y: 0.6 },
    { x: 0.0,  y: 0.5 },
  ],
  m4a4: [
    { x: 0,    y: 0.4 },
    { x: 0.1,  y: 0.55 },
    { x: 0.2,  y: 0.5 },
    { x: 0.28, y: 0.45 },
    { x: 0.3,  y: 0.48 },
    { x: 0.2,  y: 0.55 },
    { x: 0.05, y: 0.5 },
    { x: -0.1, y: 0.45 },
    { x: -0.22,y: 0.5 },
    { x: -0.28,y: 0.48 },
    { x: -0.22,y: 0.55 },
    { x: -0.1, y: 0.5 },
    { x: 0.05, y: 0.45 },
    { x: 0.15, y: 0.5 },
    { x: 0.1,  y: 0.48 },
    { x: 0.0,  y: 0.45 },
    { x: -0.05,y: 0.5 },
    { x: -0.1, y: 0.48 },
    { x: -0.05,y: 0.45 },
    { x: 0.0,  y: 0.44 },
  ],
  glock: [
    { x: 0,    y: 0.3 },
    { x: 0.05, y: 0.35 },
    { x: 0.1,  y: 0.3 },
    { x: 0.08, y: 0.32 },
    { x: 0.05, y: 0.3 },
    { x: 0.0,  y: 0.32 },
    { x: -0.05,y: 0.3 },
    { x: -0.08,y: 0.32 },
    { x: -0.05,y: 0.3 },
    { x: 0.0,  y: 0.3 },
  ],
  usp: [
    { x: 0,    y: 0.25 },
    { x: 0.04, y: 0.28 },
    { x: 0.06, y: 0.26 },
    { x: 0.04, y: 0.28 },
    { x: 0.0,  y: 0.26 },
    { x: -0.04,y: 0.28 },
    { x: -0.06,y: 0.26 },
    { x: -0.04,y: 0.28 },
    { x: 0.0,  y: 0.26 },
    { x: 0.04, y: 0.28 },
  ],
  awp: [
    { x: 0, y: 2.0 },
  ],
  knife: [
    { x: 0, y: 0 },
  ],
};

export class Recoil {
  constructor(weaponType) {
    this.pattern = SPRAY_PATTERNS[weaponType] || SPRAY_PATTERNS.ak47;
    this.shotIndex = 0;
    this.accum = { x: 0, y: 0 }; // accumulated camera offset
    this.resetTimer = 0;
    this.RESET_DELAY = 0.45; // seconds of no shooting before reset
    this.RECOVER_SPEED = 8;  // units/sec recovery
  }

  // Called each time the player fires. Returns {x, y} camera delta.
  onShot() {
    const p = this.pattern[this.shotIndex % this.pattern.length];
    this.shotIndex++;
    this.accum.x += p.x;
    this.accum.y += p.y;
    this.resetTimer = this.RESET_DELAY;
    return { x: p.x, y: p.y };
  }

  // Call each frame. mouseDelta is {x, y} mouse movement this frame (in recoil units).
  // Returns the net camera offset to apply.
  update(dt, mouseDeltaX, mouseDeltaY) {
    // Mouse counters recoil accumulation
    const MOUSE_SENSITIVITY_RECOIL = 0.005;
    this.accum.x -= mouseDeltaX * MOUSE_SENSITIVITY_RECOIL;
    this.accum.y -= mouseDeltaY * MOUSE_SENSITIVITY_RECOIL;

    if (this.resetTimer > 0) {
      this.resetTimer -= dt;
    } else {
      // Recover: accum → 0
      this.shotIndex = 0;
      const recover = this.RECOVER_SPEED * dt;
      if (Math.abs(this.accum.x) < recover) this.accum.x = 0;
      else this.accum.x -= Math.sign(this.accum.x) * recover;
      if (Math.abs(this.accum.y) < recover) this.accum.y = 0;
      else this.accum.y -= Math.sign(this.accum.y) * recover;
    }
  }

  reset() {
    this.shotIndex = 0;
    this.accum = { x: 0, y: 0 };
    this.resetTimer = 0;
  }
}
