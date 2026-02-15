import * as THREE from 'three';
import { Entity } from './Entity.js';
import { WeaponManager } from '../weapons/WeaponManager.js';
import { WEAPON_DEFS } from '../weapons/WeaponManager.js';
import { Weapon } from '../weapons/Weapon.js';

const BOT_SPEED = 4.5;
const BOT_CROUCH_SPEED = 2.0;
const GRAVITY = 20;
const SIGHT_RANGE = 40;
const REACTION_MIN = 0.2;
const REACTION_MAX = 0.5;
const WAYPOINT_REACH = 1.5;

// Bot AI states
const STATE = {
  PATROL:      'PATROL',
  ENGAGE:      'ENGAGE',
  RETREAT:     'RETREAT',
  USE_UTILITY: 'USE_UTILITY',
  PLANT_BOMB:  'PLANT_BOMB',
  DEFUSE_BOMB: 'DEFUSE_BOMB',
  DEAD:        'DEAD',
  BUYING:      'BUYING',
};

export class Bot extends Entity {
  constructor(config, scene) {
    super({ ...config, health: 100, startMoney: config.startMoney || 800 });
    this.scene = scene;

    // Build mesh (capsule-like box)
    const bodyGeo = new THREE.BoxGeometry(0.7, 1.7, 0.7);
    const headGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const teamColor = this.team === 'ct' ? 0x4488ff : 0xff8844;
    const bodyMat = new THREE.MeshLambertMaterial({ color: teamColor });
    const headMat = new THREE.MeshLambertMaterial({ color: teamColor });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.1;
    this.mesh = new THREE.Group();
    this.mesh.add(body);
    this.mesh.add(head);
    this.mesh.position.copy(this.position);
    scene.add(this.mesh);

    this.weaponManager = new WeaponManager(this.team);
    // Give bots a rifle immediately (they always buy in buy phase)
    this._giveDefaultGun();

    this.state = STATE.PATROL;
    this.waypoints = [];
    this.waypointIndex = 0;
    this.target = null; // enemy Entity in sight
    this.reactionTimer = 0;
    this.hasReacted = false;
    this.strafeDir = 1;
    this.strafeTimer = 0;
    this.shootTimer = 0;
    this.utilityQueued = null;
    this.isGrounded = true;
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.hasBomb = false;
    this.isPlanting = false;
    this.plantTimer = 0;
    this.isDefusing = false;
    this.defuseTimer = 0;
    this.peekTimer = 0;
    this.isPeeking = false;
    this.flankRoute = null;
  }

  _giveDefaultGun() {
    const rifleId = this.team === 'ct' ? 'm4a4' : 'ak47';
    this.weaponManager.slots[1] = new Weapon(WEAPON_DEFS[rifleId]);
    this.weaponManager.activeSlot = 1;
  }

  get currentWeapon() { return this.weaponManager.activeWeapon; }

  setWaypoints(wps) {
    this.waypoints = wps.map(w => w.clone());
    this.waypointIndex = 0;
  }

  setState(s) { this.state = s; }

  update(dt, player, allEntities, gameMap, gameState, audio, onShoot, onUtility) {
    if (!this.isAlive) return;
    if (this.state === STATE.DEAD) return;

    // Update weapon
    const w = this.currentWeapon;
    if (w) w.update(dt, 0, 0);

    // Update mesh position
    this.mesh.position.copy(this.position);
    this.mesh.position.y += 0.85; // center the mesh

    // Gravity
    if (!this.isGrounded) {
      this.velocity.y -= GRAVITY * dt;
    } else {
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
    this.position.y += this.velocity.y * dt;

    // Ground check (simple)
    if (this.position.y < 0) {
      this.position.y = 0;
      this.velocity.y = 0;
      this.isGrounded = true;
    }

    // Look for enemies
    const enemy = this._findEnemy(player, allEntities, gameMap);

    // State machine
    switch (this.state) {
      case STATE.PATROL:      this._patrol(dt, enemy, gameMap, gameState, onUtility); break;
      case STATE.ENGAGE:      this._engage(dt, enemy, gameMap, audio, onShoot); break;
      case STATE.RETREAT:     this._retreat(dt, gameMap); break;
      case STATE.USE_UTILITY: this._useUtility(dt, onUtility); break;
      case STATE.PLANT_BOMB:  this._plant(dt, gameMap, gameState, audio); break;
      case STATE.DEFUSE_BOMB: this._defuse(dt, gameMap, gameState, audio); break;
    }

    // Face direction of movement or target
    if (this.target) {
      const dx = this.target.position.x - this.position.x;
      const dz = this.target.position.z - this.position.z;
      this.yaw = Math.atan2(dx, dz);
    }
    this.mesh.rotation.y = this.yaw;
  }

  _findEnemy(player, allEntities, gameMap) {
    const candidates = [player, ...allEntities.filter(e => e !== this)];
    let closest = null;
    let closestDist = SIGHT_RANGE;

    for (const ent of candidates) {
      if (!ent.isAlive) continue;
      if (ent.team === this.team) continue;
      const dist = this.position.distanceTo(ent.position);
      if (dist > SIGHT_RANGE) continue;

      // Line of sight raycast
      const dir = ent.position.clone().sub(this.position).normalize();
      const hit = gameMap?.raycast(
        this.position.clone().add(new THREE.Vector3(0, 1.6, 0)),
        dir, dist - 0.5
      );
      if (hit) continue; // wall in the way

      if (dist < closestDist) {
        closestDist = dist;
        closest = ent;
      }
    }
    return closest;
  }

  _patrol(dt, enemy, gameMap, gameState, onUtility) {
    if (enemy) {
      this.target = enemy;
      this.reactionTimer = REACTION_MIN + Math.random() * (REACTION_MAX - REACTION_MIN);
      this.hasReacted = false;
      this.state = STATE.ENGAGE;
      return;
    }

    // Check if should use utility before entering a site
    if (this.weaponManager.grenades.length > 0 && this.waypointIndex === 2) {
      const nade = this.weaponManager.grenades[0];
      if (nade === 'flash' || nade === 'smoke') {
        this.utilityQueued = nade;
        this.state = STATE.USE_UTILITY;
        return;
      }
    }

    // Move along waypoints
    if (this.waypoints.length === 0) return;
    const wp = this.waypoints[this.waypointIndex];
    const dist = this._moveTo(wp, dt, BOT_SPEED);
    if (dist < WAYPOINT_REACH) {
      this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;

      // T with bomb: if at site, plant
      if (this.hasBomb && gameMap) {
        const site = gameMap.isInBombSite(this.position);
        if (site && gameState?.phase === 'live') {
          this.state = STATE.PLANT_BOMB;
        }
      }

      // CT: if bomb planted, go defuse
      if (this.team === 'ct' && gameState?.bombPlanted && gameState?.phase === 'live') {
        this._routeToBomb(gameState.bombPosition);
        this.state = STATE.DEFUSE_BOMB;
      }
    }
  }

  _engage(dt, enemy, gameMap, audio, onShoot) {
    if (!enemy || !enemy.isAlive) {
      this.target = null;
      this.hasReacted = false;
      this.state = STATE.PATROL;
      return;
    }

    this.target = enemy;

    // Reaction delay
    if (!this.hasReacted) {
      this.reactionTimer -= dt;
      if (this.reactionTimer > 0) {
        // Face the enemy but don't shoot yet
        return;
      }
      this.hasReacted = true;
    }

    // Strafe
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeDir *= -1;
      this.strafeTimer = 0.5 + Math.random() * 0.8;
    }

    const toEnemy = new THREE.Vector3(
      enemy.position.x - this.position.x, 0,
      enemy.position.z - this.position.z
    ).normalize();
    const strafe = new THREE.Vector3(-toEnemy.z, 0, toEnemy.x).multiplyScalar(this.strafeDir);

    const dist = this.position.distanceTo(enemy.position);
    // Move closer if far, strafe if close
    if (dist > 12) {
      this._moveTo(enemy.position, dt, BOT_SPEED * 0.6);
    } else {
      this.position.addScaledVector(strafe, BOT_SPEED * 0.5 * dt);
    }

    // Shoot
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      const w = this.currentWeapon;
      if (w && w.ammo > 0) {
        const recoilDelta = w.tryShoot(false, false, false);
        if (recoilDelta) {
          audio?.playGunshot(w.weaponType);
          onShoot?.(this, enemy, w);
          this.shootTimer = 1 / (w.fireRate * 0.7); // bots shoot a bit slower
        }
      } else if (w && w.ammo === 0 && w.reserve > 0) {
        w.startReload();
        audio?.playReload(w.weaponType);
        this.shootTimer = w.reloadTime;
      }
    }

    // Health check: retreat if low
    if (this.health < 25) {
      this.state = STATE.RETREAT;
    }
  }

  _retreat(dt, gameMap) {
    // Move away from last known target position
    if (this.waypoints.length > 0) {
      const safeWp = this.waypoints[0]; // retreat to start
      this._moveTo(safeWp, dt, BOT_SPEED);
      const dist = this.position.distanceTo(safeWp);
      if (dist < WAYPOINT_REACH) {
        this.state = STATE.PATROL;
        this.waypointIndex = 0;
      }
    } else {
      this.state = STATE.PATROL;
    }
  }

  _useUtility(dt, onUtility) {
    const type = this.utilityQueued;
    if (!type) { this.state = STATE.PATROL; return; }

    // Throw forward
    const dir = new THREE.Vector3(-Math.sin(this.yaw), 0.3, -Math.cos(this.yaw)).normalize();
    const origin = this.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    onUtility?.(this, type, origin, dir);
    this.weaponManager.removeGrenade(type);
    this.utilityQueued = null;
    this.state = STATE.PATROL;
  }

  _plant(dt, gameMap, gameState, audio) {
    if (!gameMap || !gameState) return;
    const site = gameMap.isInBombSite(this.position);
    if (!site) {
      this.state = STATE.PATROL;
      return;
    }
    this.isPlanting = true;
    this.plantTimer += dt;
    if (this.plantTimer >= 3.2) {
      this.isPlanting = false;
      this.plantTimer = 0;
      this.hasBomb = false;
      gameState.bombPlanted = true;
      gameState.bombPosition = this.position.clone();
      gameState.bombSite = site;
      gameState.bombTimer = 40;
      audio?.playBombPlant();
      this.state = STATE.PATROL;
    }
  }

  _defuse(dt, gameMap, gameState, audio) {
    if (!gameState?.bombPlanted) {
      this.state = STATE.PATROL;
      return;
    }
    const dist = this.position.distanceTo(gameState.bombPosition);
    if (dist > 2) {
      this._moveTo(gameState.bombPosition, dt, BOT_SPEED);
      return;
    }
    this.isDefusing = true;
    this.defuseTimer += dt;
    const defuseTime = this.weaponManager.hasDefuseKit ? 5 : 10;
    if (this.defuseTimer >= defuseTime) {
      this.isDefusing = false;
      this.defuseTimer = 0;
      gameState.bombDefused = true;
      audio?.playBombDefuse();
      this.state = STATE.PATROL;
    }
  }

  _routeToBomb(bombPos) {
    if (!bombPos) return;
    this.waypoints = [this.position.clone(), bombPos.clone()];
    this.waypointIndex = 0;
  }

  _moveTo(target, dt, speed) {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < 0.1) return dist;
    const step = Math.min(speed * dt, dist);
    this.position.x += (dx / dist) * step;
    this.position.z += (dz / dist) * step;
    return dist;
  }

  die() {
    super.die();
    this.state = STATE.DEAD;
    this.mesh.visible = false;
  }

  respawn(position) {
    super.respawn(position);
    this.state = STATE.PATROL;
    this.target = null;
    this.hasReacted = false;
    this.isPlanting = false;
    this.plantTimer = 0;
    this.isDefusing = false;
    this.defuseTimer = 0;
    this.waypointIndex = 0;
    this._giveDefaultGun();
    this.mesh.visible = true;
  }

  giveUtility() {
    // Medium bots get some grenades
    const roll = Math.random();
    if (roll < 0.5) this.weaponManager.grenades.push('flash');
    if (roll < 0.3) this.weaponManager.grenades.push('smoke');
    if (roll < 0.2) this.weaponManager.grenades.push('he');
  }
}
