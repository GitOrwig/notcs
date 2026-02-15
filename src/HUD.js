// HUD controller — manipulates DOM elements defined in index.html

export class HUD {
  constructor() {
    this.$hp       = document.getElementById('hp-label');
    this.$hpBar    = document.getElementById('hp-bar');
    this.$armorBar = document.getElementById('armor-bar');
    this.$money    = document.getElementById('money-display');
    this.$ammoC    = document.getElementById('ammo-current');
    this.$ammoR    = document.getElementById('ammo-reserve');
    this.$wName    = document.getElementById('weapon-name');
    this.$timer    = document.getElementById('round-timer');
    this.$scoreCT  = document.getElementById('score-ct');
    this.$scoreT   = document.getElementById('score-t');
    this.$killFeed = document.getElementById('kill-feed');
    this.$cross    = document.getElementById('crosshair');
    this.$flash    = document.getElementById('flash-overlay');
    this.$roundOvl = document.getElementById('round-overlay');
    this.$roundTxt = document.getElementById('round-text');
    this.$roundSub = document.getElementById('round-sub');
    this.$buyBanner= document.getElementById('buy-phase-banner');
    this.$buyMenu  = document.getElementById('buy-menu');
    this.$buyMoney = document.getElementById('buy-money-display');
    this.$bombBnr  = document.getElementById('bomb-planted-banner');
    this.$plantPrm = document.getElementById('plant-prompt');
    this.$defPrm   = document.getElementById('defuse-prompt');
    this.$deathScr = document.getElementById('death-screen');
    this.$deathMsg = document.getElementById('death-msg');
    this.$scoreboard= document.getElementById('scoreboard');
    this.$sbCT     = document.getElementById('sb-ct-rows');
    this.$sbT      = document.getElementById('sb-t-rows');
    this.$phLabel  = document.getElementById('phase-label');
    this.$dmScore  = document.getElementById('dm-score');
    this.$slots    = [1,2,3,4,5,6,7].map(i => document.getElementById(`slot-${i}`));

    this._flashTimeout = null;
    this.buyMenuOpen = false;
    this.scoreboardOpen = false;
  }

  updateHealth(hp, maxHp = 100) {
    this.$hp.textContent = Math.max(0, Math.ceil(hp));
    this.$hpBar.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    this.$hpBar.style.background = hp > 50 ? '#00cc44' : hp > 25 ? '#ffaa00' : '#cc2200';
  }

  updateArmor(armor, maxArmor = 100) {
    this.$armorBar.style.width = `${(armor / maxArmor) * 100}%`;
  }

  updateMoney(amount) {
    this.$money.textContent = `$${amount}`;
  }

  updateAmmo(current, reserve, weaponName) {
    this.$ammoC.textContent = current;
    this.$ammoR.textContent = `/ ${reserve}`;
    this.$wName.textContent = weaponName || '';
    // Warn on low ammo
    this.$ammoC.style.color = current <= 5 ? '#ff4444' : '#ffffff';
  }

  updateTimer(seconds, isBuyPhase) {
    const s = Math.max(0, Math.ceil(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    this.$timer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    this.$timer.style.color = (isBuyPhase || s > 30) ? '#ffffff' : s > 10 ? '#ffaa00' : '#ff4444';
  }

  updateScore(ct, t) {
    this.$scoreCT.textContent = `CT: ${ct}`;
    this.$scoreT.textContent  = `T: ${t}`;
  }

  updateWeaponSlots(weaponManager, isDM) {
    const slotNames = {
      1: weaponManager.slots[1]?.name || '—',
      2: weaponManager.slots[2]?.name || '—',
      3: 'KNIFE',
      4: 'HE',
      5: 'FLASH',
      6: 'SMOKE',
      7: 'MLTV',
    };
    const active = weaponManager.activeSlot;
    this.$slots.forEach((el, i) => {
      const slot = i + 1;
      el.textContent = slotNames[slot] || '—';
      el.classList.toggle('active', slot === active || (slot === 4 && active === 'grenade'));
      // Dim if no item
      const hasItem = slot <= 3
        ? !!weaponManager.slots[slot]
        : weaponManager.grenades.includes(['he','flash','smoke','molotov'][slot - 4]);
      el.style.opacity = hasItem ? '1' : '0.3';
    });
  }

  showCrosshair(show) {
    this.$cross.style.display = show ? 'block' : 'none';
  }

  // Flash overlay: opacity 1 → 0 over duration
  applyFlash(intensity, audio) {
    const duration = 2.5 * intensity;
    this.$flash.style.transition = 'none';
    this.$flash.style.opacity = Math.min(1, intensity);
    clearTimeout(this._flashTimeout);
    this._flashTimeout = setTimeout(() => {
      this.$flash.style.transition = `opacity ${duration}s linear`;
      this.$flash.style.opacity = 0;
    }, 50);
    audio?.playFlashRing(intensity);
  }

  flashDamage(amount) {
    // Brief red tint on damage
    this.$flash.style.transition = 'none';
    this.$flash.style.background = '#ff0000';
    this.$flash.style.opacity = Math.min(0.4, amount / 200);
    clearTimeout(this._flashTimeout);
    this._flashTimeout = setTimeout(() => {
      this.$flash.style.transition = 'opacity 0.3s';
      this.$flash.style.opacity = 0;
      setTimeout(() => { this.$flash.style.background = '#fff'; }, 350);
    }, 80);
  }

  addKill(killerName, victimName, weaponName, isPlayer) {
    const el = document.createElement('div');
    el.className = 'kill-entry';
    el.innerHTML = `
      <span class="killer ${isPlayer ? 'you' : ''}">${killerName}</span>
      <span class="weapon">[${weaponName}]</span>
      <span class="victim">${victimName}</span>
    `;
    this.$killFeed.prepend(el);
    // Remove after animation
    setTimeout(() => el.remove(), 4200);
    // Keep max 5
    while (this.$killFeed.children.length > 5) {
      this.$killFeed.lastChild.remove();
    }
  }

  showRoundEnd(winner, message, ctScore, tScore) {
    this.updateScore(ctScore, tScore);
    this.$roundTxt.textContent = winner === 'ct' ? 'CT WIN' : 'T WIN';
    this.$roundTxt.style.color = winner === 'ct' ? '#4488ff' : '#ff8844';
    this.$roundSub.textContent = message;
    this.$roundOvl.style.display = 'block';
    setTimeout(() => { this.$roundOvl.style.display = 'none'; }, 4000);
  }

  showRoundStart(round, winner) {
    this.$roundTxt.textContent = `ROUND ${round}`;
    this.$roundTxt.style.color = '#ffffff';
    this.$roundSub.textContent = '';
    this.$roundOvl.style.display = 'block';
    setTimeout(() => { this.$roundOvl.style.display = 'none'; }, 2500);
  }

  showBuyPhase() {
    this.$buyBanner.style.display = 'block';
    this.$phLabel.textContent = 'BUY PHASE';
  }

  hideBuyPhase() {
    this.$buyBanner.style.display = 'none';
    this.$phLabel.textContent = 'LIVE';
  }

  showBombPlanted(site) {
    this.$bombBnr.textContent = `BOMB PLANTED [${site}]`;
    this.$bombBnr.style.display = 'block';
  }

  hideBombPlanted() {
    this.$bombBnr.style.display = 'none';
  }

  showPlantPrompt(show) {
    this.$plantPrm.style.display = show ? 'block' : 'none';
  }

  showDefusePrompt(show) {
    this.$defPrm.style.display = show ? 'block' : 'none';
  }

  showDeathScreen(killerName) {
    this.$deathScr.style.display = 'flex';
    this.$deathMsg.textContent = `Killed by ${killerName}`;
  }

  hideDeathScreen() {
    this.$deathScr.style.display = 'none';
  }

  showHalftime(ctScore, tScore) {
    this.$roundTxt.textContent = 'HALFTIME';
    this.$roundTxt.style.color = '#ffd700';
    this.$roundSub.textContent = `CT ${ctScore} — T ${tScore}`;
    this.$roundOvl.style.display = 'block';
    setTimeout(() => { this.$roundOvl.style.display = 'none'; }, 5500);
  }

  showGameOver(winner) {
    this.$roundTxt.textContent = winner === 'deathmatch' ? 'GAME OVER' : `${winner.toUpperCase()} WIN`;
    this.$roundTxt.style.color = winner === 'ct' ? '#4488ff' : winner === 't' ? '#ff8844' : '#ffd700';
    this.$roundSub.textContent = 'Reload the page to play again';
    this.$roundOvl.style.display = 'block';
  }

  // Buy menu
  openBuyMenu(weaponManager, playerTeam) {
    this.$buyMenu.style.display = 'block';
    this.buyMenuOpen = true;
    this._populateBuyMenu(weaponManager, playerTeam);
  }

  closeBuyMenu() {
    this.$buyMenu.style.display = 'none';
    this.buyMenuOpen = false;
  }

  hideBuyMenu() {
    this.closeBuyMenu();
  }

  _populateBuyMenu(wm, team) {
    this.$buyMoney.textContent = `$${wm.money ?? 0}`;

    const RIFLES = team === 'ct'
      ? [{ id: 'm4a4', name: 'M4A4', price: 3100 }, { id: 'awp', name: 'AWP', price: 4750 }]
      : [{ id: 'ak47', name: 'AK-47', price: 2700 }, { id: 'awp', name: 'AWP', price: 4750 }];
    const PISTOLS = [
      { id: 'deagle', name: 'Desert Eagle', price: 700 },
    ];
    const UTILITY = [
      { id: 'he',      name: 'HE Grenade',   price: 300 },
      { id: 'flash',   name: 'Flashbang',     price: 200 },
      { id: 'smoke',   name: 'Smoke Grenade', price: 300 },
      { id: 'molotov', name: 'Molotov',        price: 400 },
    ];
    const EQUIP = [
      { id: 'armor',        name: 'Vest',           price: 650 },
      { id: 'armor_helmet', name: 'Vest + Helmet',  price: 1000 },
      ...(team === 'ct' ? [{ id: 'defuse_kit', name: 'Defuse Kit', price: 150 }] : []),
    ];

    const render = (containerId, items, isNade = false, isEquip = false) => {
      const el = document.getElementById(containerId);
      el.innerHTML = '';
      for (const item of items) {
        const btn = document.createElement('div');
        btn.className = 'buy-item';
        if ((wm.money ?? 0) < item.price) btn.classList.add('disabled');
        btn.innerHTML = `${item.name}<span class="item-price">$${item.price}</span>`;
        btn.dataset.id = item.id;
        btn.dataset.type = isNade ? 'nade' : isEquip ? 'equip' : 'weapon';
        el.appendChild(btn);
      }
    };

    render('buy-rifles', RIFLES);
    render('buy-pistols', PISTOLS);
    render('buy-utility', UTILITY, true);
    render('buy-equipment', EQUIP, false, true);

    // Money reference (not player object here — set externally)
    this._wm = wm;
  }

  // Scoreboard
  toggleScoreboard(show, allEntities, player) {
    this.scoreboardOpen = show;
    this.$scoreboard.style.display = show ? 'block' : 'none';
    if (show) this._populateScoreboard(allEntities, player);
  }

  _populateScoreboard(allEntities, player) {
    const render = (container, entities) => {
      container.innerHTML = '';
      const sorted = [...entities].sort((a, b) => b.kills - a.kills);
      for (const ent of sorted) {
        const row = document.createElement('div');
        row.className = 'sb-row' + (ent === player ? ' you' : '');
        row.innerHTML = `
          <span class="name">${ent.name}${ent === player ? ' ★' : ''}</span>
          <span class="kills">${ent.kills}</span>
          <span class="deaths">${ent.deaths}</span>
          <span class="money">$${ent.money}</span>
        `;
        container.appendChild(row);
      }
    };
    const ctEnts = [player, ...allEntities].filter(e => e.team === 'ct');
    const tEnts  = [player, ...allEntities].filter(e => e.team === 't');
    render(this.$sbCT, ctEnts);
    render(this.$sbT, tEnts);
  }

  updateDMScore(kills) {
    this.$dmScore.style.display = 'block';
    this.$dmScore.textContent = `Kills: ${kills}`;
  }
}
