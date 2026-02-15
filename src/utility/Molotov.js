import * as THREE from 'three';
import { Grenade } from './Grenade.js';

const MOLOTOV_RADIUS   = 3.5;
const MOLOTOV_DURATION = 7;
const MOLOTOV_DPS      = 8; // damage per second while standing in fire

export class Molotov extends Grenade {
  constructor(config) {
    super({ ...config, type: 'molotov', fuseTime: 1.5 });
    this.fireActive = false;
    this.fireTimer  = 0;
    this.fireMeshes = [];
    this._sceneRef  = config.scene || null;
  }

  detonate(audio, scene) {
    if (this.exploded && this.fireActive) return; // prevent double-detonate
    super.detonate(audio);
    audio?.playMolotovIgnite();
    this.fireActive = true;
    this.fireTimer  = MOLOTOV_DURATION;

    // Create fire planes
    const s = scene || this._sceneRef;
    if (s) {
      const firePos = this.position.clone();
      firePos.y = 0.05;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const r = Math.random() * MOLOTOV_RADIUS * 0.8;
        const geo = new THREE.PlaneGeometry(1.5 + Math.random(), 1.5 + Math.random());
        const mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(1.0, 0.3 + Math.random() * 0.3, 0),
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        });
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(
          firePos.x + Math.cos(angle) * r,
          firePos.y,
          firePos.z + Math.sin(angle) * r
        );
        s.add(m);
        this.fireMeshes.push(m);
      }
    }
  }

  updateFire(dt, entities, hud) {
    if (!this.fireActive) return;
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireActive = false;
      this.fireMeshes.forEach(m => m.parent?.remove(m));
      this.fireMeshes = [];
      return;
    }

    // Damage entities in fire zone
    for (const ent of entities) {
      if (!ent.isAlive) continue;
      const dx = ent.position.x - this.position.x;
      const dz = ent.position.z - this.position.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist < MOLOTOV_RADIUS) {
        const dmg = MOLOTOV_DPS * dt;
        ent.health -= dmg;
        if (ent.health <= 0) {
          ent.health = 0;
          ent.die?.();
        }
        if (ent.isPlayer) {
          hud?.flashDamage(Math.round(dmg));
        }
      }
    }

    // Flicker opacity
    this.fireMeshes.forEach(m => {
      m.material.opacity = 0.4 + Math.random() * 0.4;
      m.scale.y = 0.8 + Math.random() * 0.4;
    });
  }

  isInFire(position) {
    if (!this.fireActive) return false;
    const dx = position.x - this.position.x;
    const dz = position.z - this.position.z;
    return Math.sqrt(dx*dx + dz*dz) < MOLOTOV_RADIUS;
  }
}
