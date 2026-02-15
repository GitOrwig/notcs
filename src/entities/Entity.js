import * as THREE from 'three';

export class Entity {
  constructor(config = {}) {
    this.id = config.id || Math.random().toString(36).slice(2);
    this.name = config.name || 'Entity';
    this.team = config.team || 'ct'; // 'ct' or 't'
    this.position = new THREE.Vector3(
      config.x || 0,
      config.y || 0,
      config.z || 0
    );
    this.velocity = new THREE.Vector3();
    this.health = config.health || 100;
    this.maxHealth = config.maxHealth || 100;
    this.armor = 0;
    this.maxArmor = 100;
    this.isAlive = true;

    this.kills = 0;
    this.deaths = 0;
    this.money = config.startMoney || 800;

    // Hitbox: half-extents
    this.halfW = 0.4;
    this.halfH = 0.9; // half height (crouch: 0.5)
    this.halfD = 0.4;
    this.isCrouching = false;

    // Mesh group
    this.mesh = null;
  }

  get isPlayer() { return false; }

  get halfHeight() {
    return this.isCrouching ? 0.5 : 0.9;
  }

  // World AABB for collision
  getAABB() {
    return {
      min: this.position.clone().sub(new THREE.Vector3(this.halfW, this.halfHeight, this.halfD)),
      max: this.position.clone().add(new THREE.Vector3(this.halfW, this.halfHeight, this.halfD)),
    };
  }

  takeDamage(amount, hitZone = 'body', attackerArmor = false, attackerName = 'Unknown') {
    if (!this.isAlive) return 0;

    let dmg = amount;
    // Headshot check
    if (hitZone === 'head') {
      // Armor reduces head damage too in CS
      if (this.armor > 0) dmg *= 0.5;
    } else {
      // Body armor
      if (this.armor > 0) {
        const armorAbsorb = dmg * 0.5;
        this.armor = Math.max(0, this.armor - armorAbsorb);
        dmg *= 0.5;
      }
    }

    dmg = Math.ceil(dmg);
    this.health = Math.max(0, this.health - dmg);
    if (this.health <= 0) this.die();
    return dmg;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  die() {
    this.isAlive = false;
    this.health = 0;
    this.deaths++;
    if (this.mesh) this.mesh.visible = false;
  }

  respawn(position) {
    this.isAlive = true;
    this.health = this.maxHealth;
    this.armor = 0;
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    if (this.mesh) this.mesh.visible = true;
  }

  addMoney(amount) {
    this.money = Math.min(16000, this.money + amount);
  }

  spendMoney(amount) {
    this.money = Math.max(0, this.money - amount);
  }
}
