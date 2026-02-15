import { Grenade } from './Grenade.js';

const BLAST_RADIUS = 5;
const MAX_DAMAGE   = 98;

export class HEGrenade extends Grenade {
  constructor(config) {
    super({ ...config, type: 'he', fuseTime: 3.0 });
  }

  detonate(audio) {
    super.detonate(audio);
    audio?.playExplosion();
  }

  applyEffect(entities, gameMap, hud) {
    for (const ent of entities) {
      if (!ent.isAlive) continue;
      const dist = this.position.distanceTo(ent.position);
      if (dist > BLAST_RADIUS) continue;
      // Damage falls off with distance
      const dmg = Math.round(MAX_DAMAGE * (1 - dist / BLAST_RADIUS));
      if (dmg <= 0) continue;

      // Check LoS to blast (simple — no wall occlusion for HE)
      const actual = ent.takeDamage(dmg, 'body', false, this.owner?.name || 'Grenade');
      if (ent.isPlayer) {
        hud?.flashDamage(actual);
        if (!ent.isAlive) hud?.showDeathScreen('Grenade');
      }
    }
  }
}
