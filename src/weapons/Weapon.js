import { Recoil } from './Recoil.js';

export class Weapon {
  constructor(config) {
    this.id         = config.id;
    this.name       = config.name;
    this.slot       = config.slot;         // 1=primary, 2=secondary, 3=knife
    this.damage     = config.damage;
    this.headshotMultiplier = config.headshotMultiplier || 4;
    this.fireRate   = config.fireRate;     // shots/sec
    this.magSize    = config.magSize;
    this.reserveMax = config.reserveMax;
    this.reloadTime = config.reloadTime;   // seconds
    this.range      = config.range || 200; // max effective range
    this.spread     = config.spread || 0.02;
    this.moveSpread = config.moveSpread || 0.08;
    this.crouchSpread = config.crouchSpread || 0.005;
    this.isScoped   = config.isScoped || false;
    this.price      = config.price || 0;
    this.team       = config.team || 'both'; // 'ct', 't', 'both'
    this.weaponType = config.weaponType || 'rifle'; // for audio
    this.isAuto     = config.isAuto !== undefined ? config.isAuto : true;

    this.ammo    = this.magSize;
    this.reserve = this.reserveMax;
    this.recoil  = new Recoil(this.id);

    this._fireTimer = 0;
    this._reloading = false;
    this._reloadTimer = 0;
    this._scoped = false;
  }

  // Returns recoil delta {x,y} if fired, null if can't fire
  tryShoot(isMoving, isCrouching, isScoped) {
    if (this._reloading) return null;
    if (this._fireTimer > 0) return null;
    if (this.ammo <= 0) return null;

    this.ammo--;
    this._fireTimer = 1 / this.fireRate;

    return this.recoil.onShot();
  }

  startReload() {
    if (this._reloading) return false;
    if (this.reserve <= 0) return false;
    if (this.ammo === this.magSize) return false;
    this._reloading = true;
    this._reloadTimer = this.reloadTime;
    return true;
  }

  cancelReload() {
    this._reloading = false;
    this._reloadTimer = 0;
  }

  update(dt, mouseDeltaX, mouseDeltaY) {
    if (this._fireTimer > 0) this._fireTimer -= dt;
    if (this._reloading) {
      this._reloadTimer -= dt;
      if (this._reloadTimer <= 0) {
        this._reloading = false;
        const needed = this.magSize - this.ammo;
        const give = Math.min(needed, this.reserve);
        this.ammo += give;
        this.reserve -= give;
      }
    }
    this.recoil.update(dt, mouseDeltaX, mouseDeltaY);
  }

  addAmmo(amount) {
    this.reserve = Math.min(this.reserve + amount, this.reserveMax);
  }

  refillAmmo() {
    this.ammo = this.magSize;
    this.reserve = this.reserveMax;
  }

  get isReloading() { return this._reloading; }
  get reloadProgress() {
    if (!this._reloading) return 1;
    return 1 - this._reloadTimer / this.reloadTime;
  }

  getCurrentSpread(isMoving, isCrouching, isScoped) {
    if (isScoped) return 0.001;
    if (isCrouching) return this.crouchSpread;
    if (isMoving) return this.moveSpread;
    return this.spread;
  }
}
