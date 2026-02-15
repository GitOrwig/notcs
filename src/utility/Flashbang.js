import { Grenade } from './Grenade.js';
import * as THREE from 'three';

const FLASH_RADIUS = 15;

export class Flashbang extends Grenade {
  constructor(config) {
    super({ ...config, type: 'flash', fuseTime: 2.0 });
  }

  detonate(audio) {
    super.detonate(audio);
    audio?.playExplosion();
  }

  applyEffect(entities, gameMap, hud, camera) {
    for (const ent of entities) {
      if (!ent.isAlive) continue;
      const dist = this.position.distanceTo(ent.position);
      if (dist > FLASH_RADIUS) continue;

      // Check if entity is looking toward flash
      let facingFlash = 1.0;
      if (ent.isPlayer && camera) {
        const toFlash = this.position.clone().sub(camera.position).normalize();
        const look = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        facingFlash = Math.max(0, look.dot(toFlash)); // 1 = staring at it
      } else {
        // Bots: random flash effectiveness
        facingFlash = Math.random();
      }

      const intensity = facingFlash * (1 - dist / FLASH_RADIUS);
      if (intensity < 0.05) continue;

      if (ent.isPlayer) {
        hud?.applyFlash(intensity, audio);
      } else if (ent.setBlinded) {
        ent.setBlinded(intensity * 2.5); // blind duration in seconds
      }
    }
  }
}
