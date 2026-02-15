import * as THREE from 'three';

const GRAVITY = 20;
const BOUNCE_RESTITUTION = 0.4;

export class Grenade {
  constructor(config) {
    this.type    = config.type;
    this.owner   = config.owner;
    this.team    = config.owner?.team;
    this.fuseTime = config.fuseTime || 3.0;
    this.timer   = this.fuseTime;
    this.exploded = false;
    this.active  = true;

    // Physics
    this.position = config.origin.clone();
    this.velocity = config.direction.clone().multiplyScalar(config.speed || 18);
    this.velocity.y += 4; // arc upward
    this.gravity = GRAVITY;
    this.radius = 0.12;

    // Three.js mesh
    const geo = new THREE.SphereGeometry(this.radius, 6, 6);
    const mat = new THREE.MeshLambertMaterial({ color: this._color() });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this.position);
  }

  _color() {
    switch (this.type) {
      case 'he':      return 0x888800;
      case 'flash':   return 0xddddff;
      case 'smoke':   return 0x888888;
      case 'molotov': return 0xff4400;
      default:        return 0xaaaaaa;
    }
  }

  update(dt, mapCollider, audio) {
    if (!this.active) return;

    this.timer -= dt;
    this.velocity.y -= this.gravity * dt;

    const newPos = this.position.clone().addScaledVector(this.velocity, dt);

    // Floor bounce
    if (newPos.y < 0) {
      newPos.y = 0;
      this.velocity.y *= -BOUNCE_RESTITUTION;
      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;
      audio?.playGrenadeBounce();
    }

    // Map wall bounce (simple)
    if (mapCollider) {
      const hit = mapCollider.raycast(
        this.position, this.velocity.clone().normalize(),
        this.velocity.length() * dt + this.radius
      );
      if (hit) {
        // Reflect velocity on wall normal (simplified: just negate)
        this.velocity.x *= -BOUNCE_RESTITUTION;
        this.velocity.z *= -BOUNCE_RESTITUTION;
        audio?.playGrenadeBounce();
      }
    }

    this.position.copy(newPos);
    this.mesh.position.copy(this.position);

    if (this.timer <= 0) {
      this.detonate(audio);
    }
  }

  detonate(audio) {
    this.exploded = true;
    this.active = false;
    this.mesh.visible = false;
  }

  // Override in subclasses
  applyEffect(entities, gameMap, hud) {}
}
