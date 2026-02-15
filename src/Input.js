export class Input {
  constructor() {
    this.keys = {};
    this.mouseDelta = { x: 0, y: 0 };
    this.mouseButtons = { left: false, right: false };
    this.mouseDeltaAccum = { x: 0, y: 0 };
    this.isPointerLocked = false;
    this.scrollDelta = 0;

    // Action callbacks
    this.onShoot = null;
    this.onReload = null;
    this.onJump = null;
    this.onUseUtility = null;
    this.onInteract = null;
    this.onSwitchSlot = null;
    this.onBuyMenu = null;
    this.onScoreboard = null;
    this.onScope = null;
    this.onCycleUtility = null;

    this._bind();
  }

  _bind() {
    document.addEventListener('keydown', e => this._onKeyDown(e));
    document.addEventListener('keyup', e => { this.keys[e.code] = false; });
    document.addEventListener('mousemove', e => this._onMouseMove(e));
    document.addEventListener('mousedown', e => this._onMouseDown(e));
    document.addEventListener('mouseup', e => this._onMouseUp(e));
    document.addEventListener('wheel', e => { this.scrollDelta += e.deltaY; });
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement != null;
    });
  }

  requestPointerLock(element) {
    element.requestPointerLock();
  }

  _onKeyDown(e) {
    if (this.keys[e.code]) return; // Already held
    this.keys[e.code] = true;

    switch (e.code) {
      case 'KeyR': this.onReload?.(); break;
      case 'Space': this.onJump?.(); break;
      case 'KeyG': this.onUseUtility?.(); break;
      case 'KeyQ': this.onCycleUtility?.(); break;
      case 'KeyE': this.onInteract?.(); break;
      case 'KeyB': this.onBuyMenu?.(); break;
      case 'Tab': e.preventDefault(); this.onScoreboard?.(true); break;
      case 'Digit1': this.onSwitchSlot?.(1); break;
      case 'Digit2': this.onSwitchSlot?.(2); break;
      case 'Digit3': this.onSwitchSlot?.(3); break;
      case 'Digit4': this.onSwitchSlot?.(4); break;
      case 'Digit5': this.onSwitchSlot?.(5); break;
    }
  }

  _onMouseMove(e) {
    if (this.isPointerLocked) {
      this.mouseDeltaAccum.x += e.movementX;
      this.mouseDeltaAccum.y += e.movementY;
    }
  }

  _onMouseDown(e) {
    if (e.button === 0) {
      this.mouseButtons.left = true;
      this.onShoot?.();
    }
    if (e.button === 2) {
      this.mouseButtons.right = true;
      this.onScope?.(true);
    }
  }

  _onMouseUp(e) {
    if (e.button === 0) this.mouseButtons.left = false;
    if (e.button === 2) {
      this.mouseButtons.right = false;
      this.onScope?.(false);
    }
  }

  onKeyUp(code, cb) {
    document.addEventListener('keyup', e => { if (e.code === code) cb(); });
  }

  // Call at end of each frame to consume accumulated delta
  consumeMouseDelta() {
    const d = { ...this.mouseDeltaAccum };
    this.mouseDeltaAccum.x = 0;
    this.mouseDeltaAccum.y = 0;
    return d;
  }

  consumeScroll() {
    const s = this.scrollDelta;
    this.scrollDelta = 0;
    return s;
  }

  isDown(code) { return !!this.keys[code]; }
  isMouseLeft() { return this.mouseButtons.left; }
  isMouseRight() { return this.mouseButtons.right; }
}
