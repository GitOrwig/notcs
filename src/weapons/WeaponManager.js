import { Weapon } from './Weapon.js';

// Weapon definitions
export const WEAPON_DEFS = {
  ak47: {
    id: 'ak47', name: 'AK-47', slot: 1, damage: 36, fireRate: 10, magSize: 30,
    reserveMax: 90, reloadTime: 2.4, spread: 0.015, moveSpread: 0.07,
    price: 2700, team: 't', weaponType: 'rifle', isAuto: true,
    headshotMultiplier: 4,
  },
  m4a4: {
    id: 'm4a4', name: 'M4A4', slot: 1, damage: 33, fireRate: 10, magSize: 30,
    reserveMax: 90, reloadTime: 3.1, spread: 0.012, moveSpread: 0.06,
    price: 3100, team: 'ct', weaponType: 'rifle', isAuto: true,
    headshotMultiplier: 4,
  },
  awp: {
    id: 'awp', name: 'AWP', slot: 1, damage: 115, fireRate: 0.67, magSize: 10,
    reserveMax: 30, reloadTime: 3.7, spread: 0.1, moveSpread: 0.3,
    price: 4750, team: 'both', isScoped: true, weaponType: 'awp', isAuto: false,
    headshotMultiplier: 4, range: 500,
  },
  glock: {
    id: 'glock', name: 'Glock-18', slot: 2, damage: 25, fireRate: 8, magSize: 20,
    reserveMax: 120, reloadTime: 2.2, spread: 0.03, moveSpread: 0.09,
    price: 200, team: 't', weaponType: 'pistol', isAuto: true,
    headshotMultiplier: 4,
  },
  usp: {
    id: 'usp', name: 'USP-S', slot: 2, damage: 35, fireRate: 5, magSize: 12,
    reserveMax: 36, reloadTime: 2.2, spread: 0.015, moveSpread: 0.06,
    price: 200, team: 'ct', weaponType: 'pistol', isAuto: false,
    headshotMultiplier: 4,
  },
  deagle: {
    id: 'deagle', name: 'Desert Eagle', slot: 2, damage: 63, fireRate: 3, magSize: 7,
    reserveMax: 35, reloadTime: 2.2, spread: 0.04, moveSpread: 0.12,
    price: 700, team: 'both', weaponType: 'pistol', isAuto: false,
    headshotMultiplier: 4, range: 300,
  },
  knife: {
    id: 'knife', name: 'Knife', slot: 3, damage: 85, fireRate: 1.2, magSize: 1,
    reserveMax: 1, reloadTime: 0, spread: 0, moveSpread: 0,
    price: 0, team: 'both', weaponType: 'pistol', isAuto: false, range: 2.5,
  },
};

export class WeaponManager {
  constructor(team) {
    this.team = team;
    this.slots = {}; // slot# → Weapon
    this.grenades = []; // array of grenade type strings
    this.activeSlot = null;
    this.hasArmor = false;
    this.hasHelmet = false;
    this.hasDefuseKit = false;
    this._giveDefaultWeapons(team);
  }

  _giveDefaultWeapons(team) {
    const pistolId = team === 'ct' ? 'usp' : 'glock';
    this.slots[2] = new Weapon(WEAPON_DEFS[pistolId]);
    this.slots[3] = new Weapon(WEAPON_DEFS.knife);
    this.activeSlot = 2;
  }

  get activeWeapon() {
    return this.slots[this.activeSlot] || null;
  }

  switchTo(slot) {
    if (this.slots[slot]) {
      if (this.activeWeapon) this.activeWeapon.cancelReload();
      this.activeSlot = slot;
    }
  }

  switchToGrenade() {
    this.activeSlot = 'grenade';
  }

  buyWeapon(weaponId, money) {
    const def = WEAPON_DEFS[weaponId];
    if (!def) return { success: false, msg: 'Unknown weapon' };
    if (def.price > money) return { success: false, msg: 'Not enough money' };
    if (def.team !== 'both' && def.team !== this.team) {
      return { success: false, msg: 'Wrong team weapon' };
    }
    if (this.slots[def.slot]) {
      // Replace existing
      if (this.slots[def.slot].id === weaponId) {
        // Refill ammo instead
        this.slots[def.slot].refillAmmo();
        return { success: true, cost: def.price };
      }
    }
    this.slots[def.slot] = new Weapon(def);
    return { success: true, cost: def.price };
  }

  buyGrenade(type, money) {
    const NADE_COSTS = { he: 300, flash: 200, smoke: 300, molotov: 400 };
    const cost = NADE_COSTS[type];
    if (!cost || cost > money) return { success: false };
    const current = this.grenades.filter(g => g === type).length;
    const MAX = type === 'flash' ? 2 : 1;
    if (current >= MAX) return { success: false };
    this.grenades.push(type);
    return { success: true, cost };
  }

  buyArmor(withHelmet, money) {
    const cost = withHelmet ? 1000 : 650;
    if (cost > money) return { success: false };
    this.hasArmor = true;
    if (withHelmet) this.hasHelmet = true;
    return { success: true, cost };
  }

  buyDefuseKit(money) {
    if (this.team !== 'ct') return { success: false };
    if (150 > money) return { success: false };
    this.hasDefuseKit = true;
    return { success: true, cost: 150 };
  }

  removeGrenade(type) {
    const i = this.grenades.indexOf(type);
    if (i !== -1) this.grenades.splice(i, 1);
  }

  hasGrenade(type) {
    return this.grenades.includes(type);
  }

  getFirstGrenade() {
    return this.grenades[0] || null;
  }

  update(dt, mouseDeltaX, mouseDeltaY) {
    for (const w of Object.values(this.slots)) {
      w.update(dt, mouseDeltaX, mouseDeltaY);
    }
  }

  resetRound() {
    // Don't reset weapons (CS2 keeps weapons between rounds)
  }
}
