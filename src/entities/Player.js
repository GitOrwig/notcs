import * as THREE from 'three';
import { Entity } from './Entity.js';
import { WeaponManager } from '../weapons/WeaponManager.js';

const WALK_SPEED  = 5.5;
const SPRINT_SPEED = 7.0;
const CROUCH_SPEED = 2.5;
const JUMP_VEL    = 7.0;
const GRAVITY     = 20;
const SENSITIVITY = 0.0015;
const CAMERA_HEIGHT = 1.65; // standing eye height
const CAMERA_CROUCH = 0.9;

export class Player extends Entity {
  constructor(config, camera, scene) {
    super({ ...config, health: 100, startMoney: config.startMoney || 800 });
    this.camera = camera;
    this.scene = scene;
    this.pitch = 0; // camera up/down (radians)
    this.yaw   = 0; // camera left/right
    this.isGrounded = false;
    this.isCrouching = false;
    this.isMoving = false;
    this.isScoped = false;
    this.footstepTimer = 0;

    this.weaponManager = new WeaponManager(this.team);
    this.activeGrenadeType = null;
    this.grenadeIndex = 0;

    this._crouchLerp = 0; // 0=standing, 1=crouching
  }

  get isPlayer() { return true; }

  get currentWeapon() {
    return this.weaponManager.activeWeapon;
  }

  initPosition(pos) {
    this.position.copy(pos);
    this.yaw = this.team === 'ct' ? Math.PI : 0;
    this.updateCamera();
  }

  updateCamera() {
    const eyeY = this.position.y + THREE.MathUtils.lerp(
      CAMERA_HEIGHT, CAMERA_CROUCH, this._crouchLerp
    );
    this.camera.position.set(this.position.x, eyeY, this.position.z);

    // Apply yaw + pitch (no roll)
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  look(dx, dy) {
    // dx = mouse X movement, dy = mouse Y movement
    this.yaw   -= dx * SENSITIVITY;
    this.pitch -= dy * SENSITIVITY;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  // Returns {x,y} camera offsets from recoil this frame
  applyRecoilDelta(rx, ry) {
    // ry = upward recoil (positive = pitch up = negative pitch in our system)
    this.pitch -= ry * 0.015;
    this.yaw   += rx * 0.015;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  move(input, dt, mapCollider) {
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    let moving = false;
    const wish = new THREE.Vector3();
    if (input.isDown('KeyW')) { wish.addScaledVector(fwd, 1); moving = true; }
    if (input.isDown('KeyS')) { wish.addScaledVector(fwd, -1); moving = true; }
    if (input.isDown('KeyA')) { wish.addScaledVector(right, -1); moving = true; }
    if (input.isDown('KeyD')) { wish.addScaledVector(right, 1); moving = true; }
    if (wish.lengthSq() > 0) wish.normalize();

    const isCrouching = input.isDown('ControlLeft') || input.isDown('ControlRight');
    this.isCrouching = isCrouching;
    this._crouchLerp = THREE.MathUtils.lerp(
      this._crouchLerp, isCrouching ? 1 : 0, dt * 10
    );

    let speed = isCrouching ? CROUCH_SPEED : WALK_SPEED;
    this.velocity.x = wish.x * speed;
    this.velocity.z = wish.z * speed;

    // Gravity
    if (!this.isGrounded) this.velocity.y -= GRAVITY * dt;
    else if (this.velocity.y < 0) this.velocity.y = 0;

    // Move and collide
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // Map collision (simple AABB vs box list)
    if (mapCollider) {
      mapCollider.resolvePlayer(this);
    }

    this.position.y += this.velocity.y * dt;
    if (mapCollider) {
      const wasGrounded = this.isGrounded;
      this.isGrounded = mapCollider.checkGround(this);
      if (this.isGrounded && !wasGrounded) {
        this.velocity.y = 0;
      }
    } else {
      // Floor fallback
      if (this.position.y < 0) {
        this.position.y = 0;
        this.velocity.y = 0;
        this.isGrounded = true;
      }
    }

    this.isMoving = moving && this.isGrounded;

    // Footstep sounds
    if (this.isMoving) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = isCrouching ? 0.6 : 0.35;
        this._onFootstep?.();
      }
    } else {
      this.footstepTimer = 0;
    }

    this.updateCamera();
  }

  jump() {
    if (this.isGrounded) {
      this.velocity.y = JUMP_VEL;
      this.isGrounded = false;
    }
  }

  setScope(on) {
    if (!this.currentWeapon?.isScoped) return;
    this.isScoped = on;
    this.camera.fov = on ? 15 : 75;
    this.camera.updateProjectionMatrix();
  }

  getForwardRay() {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.quaternion);
    return new THREE.Ray(this.camera.position.clone(), dir);
  }

  shoot(audio, entities, mapCollider) {
    const w = this.currentWeapon;
    if (!w) return null;

    // Check if auto or need release
    const recoilDelta = w.tryShoot(this.isMoving, this.isCrouching, this.isScoped);
    if (!recoilDelta) {
      if (w.ammo === 0) audio?.playEmptyClick();
      return null;
    }

    audio?.playGunshot(w.weaponType);
    this.applyRecoilDelta(recoilDelta.x, recoilDelta.y);

    // Auto-reload on empty
    if (w.ammo === 0 && w.reserve > 0) {
      w.startReload();
      audio?.playReload(w.weaponType);
    }

    return this._performShot(w, entities, mapCollider);
  }

  _performShot(weapon, entities, mapCollider) {
    if (weapon.id === 'knife') {
      return this._meleeAttack(weapon, entities);
    }

    const spread = weapon.getCurrentSpread(this.isMoving, this.isCrouching, this.isScoped);
    const dir = new THREE.Vector3(0, 0, -1);
    // Add spread
    dir.x += (Math.random() - 0.5) * spread * 2;
    dir.y += (Math.random() - 0.5) * spread * 2;
    dir.normalize();
    dir.applyQuaternion(this.camera.quaternion);

    const ray = new THREE.Raycaster(this.camera.position.clone(), dir);
    ray.far = weapon.range;

    // Check entities
    for (const ent of (entities || [])) {
      if (!ent.isAlive || ent === this) continue;
      if (ent.team === this.team) continue;
      if (!ent.mesh) continue;

      const intersects = ray.intersectObject(ent.mesh, true);
      if (intersects.length > 0) {
        const d = intersects[0].distance;
        if (d > weapon.range) continue;
        const hitY = intersects[0].point.y;
        const entY = ent.position.y;
        const hitZone = hitY > entY + 1.4 ? 'head' : 'body';
        let dmg = weapon.damage;
        if (hitZone === 'head') dmg *= weapon.headshotMultiplier;
        // Falloff
        const falloff = 1 - Math.min(1, d / weapon.range) * 0.5;
        dmg = Math.round(dmg * falloff);
        ent.takeDamage(dmg, hitZone, false, this.name);
        return { hit: true, entity: ent, dmg, hitZone };
      }
    }

    return { hit: false };
  }

  _meleeAttack(weapon, entities) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    for (const ent of (entities || [])) {
      if (!ent.isAlive || ent === this) continue;
      if (ent.team === this.team) continue;
      const dist = this.position.distanceTo(ent.position);
      if (dist < weapon.range) {
        const angle = fwd.dot(ent.position.clone().sub(this.position).normalize());
        if (angle > 0.5) {
          ent.takeDamage(weapon.damage, 'body');
          return { hit: true, entity: ent, dmg: weapon.damage, hitZone: 'body' };
        }
      }
    }
    return { hit: false };
  }

  getGrenadeThrowData() {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    return {
      origin: this.camera.position.clone(),
      direction: dir,
    };
  }

  die() {
    super.die();
    this.isScoped = false;
    this.camera.fov = 75;
    this.camera.updateProjectionMatrix();
  }
}
