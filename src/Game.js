import * as THREE from 'three';
import { Input } from './Input.js';
import { Audio } from './Audio.js';
import { HUD } from './HUD.js';
import { GameMap } from './Map.js';
import { Player } from './entities/Player.js';
import { Bot } from './entities/Bot.js';
import { GameState, PHASE } from './GameState.js';
import { HEGrenade } from './utility/HEGrenade.js';
import { Flashbang } from './utility/Flashbang.js';
import { SmokeGrenade } from './utility/SmokeGrenade.js';
import { Molotov } from './utility/Molotov.js';

export class Game {
  constructor() {
    this.canvas  = document.getElementById('canvas');
    this.renderer= new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene  = new THREE.Scene();
    this.scene.background = new THREE.Color(0x6b8cba);
    this.scene.fog = new THREE.Fog(0x6b8cba, 40, 80);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 200);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
    sun.position.set(10, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    this.scene.add(sun);

    this.input  = new Input();
    this.audio  = new Audio();
    this.hud    = new HUD();
    this.state  = new GameState();

    this.gameMap = null;
    this.player  = null;
    this.bots    = [];
    this.grenades= [];
    this.smokes  = [];
    this.molotovs= [];

    this._lastTime = 0;
    this._shooting = false;
    this._shootRepeat = 0;
    this._mode = 'competitive';

    // Minimap
    this._minimapCtx = document.getElementById('minimap-canvas').getContext('2d');

    this._bindMenus();
    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('keyup', e => {
      if (e.code === 'Tab') this.hud.toggleScoreboard(false, this.bots, this.player);
    });
    window.addEventListener('contextmenu', e => e.preventDefault());
  }

  _bindMenus() {
    // Main menu
    document.getElementById('btn-competitive').addEventListener('click', () => {
      this._mode = 'competitive';
      this._showTeamSelect();
    });
    document.getElementById('btn-deathmatch').addEventListener('click', () => {
      this._mode = 'deathmatch';
      this._showTeamSelect();
    });

    // Team select
    document.getElementById('btn-ct').addEventListener('click', () => this._startGame('ct'));
    document.getElementById('btn-t').addEventListener('click', () => this._startGame('t'));

    // Buy menu close
    document.getElementById('buy-close').addEventListener('click', () => {
      this.hud.closeBuyMenu();
    });

    // Buy menu item clicks
    document.getElementById('buy-menu').addEventListener('click', e => {
      const item = e.target.closest('.buy-item');
      if (!item || item.classList.contains('disabled')) return;
      this._processBuy(item.dataset.id, item.dataset.type);
    });
  }

  _showTeamSelect() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('team-select').style.display = 'flex';
  }

  _startGame(team) {
    document.getElementById('team-select').style.display = 'none';
    this.audio.resume();

    this._setupScene(team);
    this.state.startGame(team, this._mode);

    this._bindInputs();

    // Game state callbacks
    this.state.onPhaseChange = p => this._onPhaseChange(p);
    this.state.onRoundEnd    = w => this._onRoundEnd(w);
    this.state.onBombExplode = () => this._onBombExplode();
    this.state.onGameOver    = w => this.hud.showGameOver(w);

    // Start loop
    requestAnimationFrame(t => this._loop(t));
  }

  _setupScene(playerTeam) {
    // Map
    this.gameMap = new GameMap(this.scene);

    // Player
    this.player = new Player(
      { name: 'You', team: playerTeam, startMoney: 800 },
      this.camera, this.scene
    );
    this.player._onFootstep = () => this.audio.playFootstep();

    const spawnPos = playerTeam === 'ct'
      ? this.gameMap.spawnsCT[0]
      : this.gameMap.spawnsT[0];
    this.player.initPosition(spawnPos.clone().add(new THREE.Vector3(0, 0.9, 0)));

    // Bots — 4 teammates + 5 enemies
    const enemyTeam = playerTeam === 'ct' ? 't' : 'ct';
    const botNames = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India'];
    let nameIdx = 0;

    // 4 teammates
    for (let i = 0; i < 4; i++) {
      const bot = new Bot({ name: botNames[nameIdx++], team: playerTeam, startMoney: 800 }, this.scene);
      const sp = playerTeam === 'ct' ? this.gameMap.spawnsCT[i + 1] : this.gameMap.spawnsT[i + 1];
      bot.position.copy(sp.clone().add(new THREE.Vector3(0, 0.9, 0)));
      const wps = this.gameMap.getWaypointsForTeam(playerTeam, i < 2 ? 'A' : 'B');
      bot.setWaypoints(wps);
      bot.giveUtility();
      this.bots.push(bot);
    }

    // 5 enemy bots
    for (let i = 0; i < 5; i++) {
      const bot = new Bot({ name: botNames[nameIdx++], team: enemyTeam, startMoney: 800 }, this.scene);
      const sp = enemyTeam === 'ct' ? this.gameMap.spawnsCT[i] : this.gameMap.spawnsT[i];
      bot.position.copy(sp.clone().add(new THREE.Vector3(0, 0.9, 0)));
      const route = i < 3 ? 'A' : 'B';
      const wps = this.gameMap.getWaypointsForTeam(enemyTeam, route);
      bot.setWaypoints(wps);
      bot.giveUtility();

      // One T bot carries bomb
      if (enemyTeam === 't' && i === 0) bot.hasBomb = true;
      if (playerTeam === 't' && i === 0) bot.hasBomb = false; // player's team T

      this.bots.push(bot);
    }

    // If player is T, player carries bomb option
    if (playerTeam === 't') {
      // Give bomb to player or first T bot
      this.player._hasBomb = true;
    }
  }

  _bindInputs() {
    this.input.onShoot = () => {
      if (!this.player?.isAlive) return;
      if (this.hud.buyMenuOpen || this.hud.scoreboardOpen) return;
      this._shoot();
    };
    this.input.onReload = () => {
      if (!this.player?.isAlive) return;
      const w = this.player.currentWeapon;
      if (w?.startReload()) {
        this.audio.playReload(w.weaponType);
      }
    };
    this.input.onJump  = () => this.player?.jump();
    this.input.onScope = on => this.player?.setScope(on);
    this.input.onBuyMenu = () => {
      if (this.state.phase !== PHASE.BUY) return;
      if (this.hud.buyMenuOpen) this.hud.closeBuyMenu();
      else this.hud.openBuyMenu({ ...this.player.weaponManager, money: this.player.money }, this.player.team);
    };
    this.input.onScoreboard = () => {
      this.hud.toggleScoreboard(true, this.bots, this.player);
    };
    this.input.onInteract = () => this._interact();
    this.input.onUseUtility = () => this._throwGrenade();
    this.input.onCycleUtility = () => {
      const nades = this.player.weaponManager.grenades;
      if (nades.length === 0) return;
      this.player.grenadeIndex = (this.player.grenadeIndex + 1) % nades.length;
      this.player.activeGrenadeType = nades[this.player.grenadeIndex];
    };
    this.input.onSwitchSlot = slot => {
      if (slot <= 3) this.player.weaponManager.switchTo(slot);
    };

    // Pointer lock on click
    this.canvas.addEventListener('click', () => {
      if (!this.input.isPointerLocked) {
        this.input.requestPointerLock(this.canvas);
      }
    });
  }

  _processBuy(id, type) {
    if (!this.player || this.state.phase !== PHASE.BUY) return;

    let result;
    if (type === 'weapon') {
      result = this.player.weaponManager.buyWeapon(id, this.player.money);
    } else if (type === 'nade') {
      result = this.player.weaponManager.buyGrenade(id, this.player.money);
    } else if (type === 'equip') {
      if (id === 'armor')        result = this.player.weaponManager.buyArmor(false, this.player.money);
      else if (id === 'armor_helmet') result = this.player.weaponManager.buyArmor(true, this.player.money);
      else if (id === 'defuse_kit')   result = this.player.weaponManager.buyDefuseKit(this.player.money);
    }

    if (result?.success) {
      this.player.spendMoney(result.cost);
      if (result.cost) this.audio.resume(), this._clickSound();
      // Refresh buy menu
      this.hud.openBuyMenu({ ...this.player.weaponManager, money: this.player.money }, this.player.team);
      // Sync armor
      if (this.player.weaponManager.hasArmor) this.player.armor = 100;
    }
  }

  _clickSound() {
    this.audio._clickSound(this.audio.ctx.currentTime, 700);
  }

  _interact() {
    if (!this.player?.isAlive || this.state.phase !== PHASE.LIVE) return;
    // Plant bomb (if T with bomb near bomb site)
    if (this.player.team === 't' && this.player._hasBomb) {
      const site = this.gameMap.isInBombSite(this.player.position);
      if (site) {
        this._startPlanting(site);
        return;
      }
    }
    // Defuse bomb (if CT near planted bomb)
    if (this.player.team === 'ct' && this.state.bombPlanted && !this.state.bombDefused) {
      const dist = this.player.position.distanceTo(this.state.bombPosition);
      if (dist < 2.5) {
        this._startDefusing();
        return;
      }
    }
  }

  _plantTimer = 0;
  _planting = false;
  _defuseTimer = 0;
  _defusing = false;
  _plantSite = null;

  _startPlanting(site) {
    this._planting = true;
    this._plantTimer = 3.2;
    this._plantSite = site;
  }

  _startDefusing() {
    this._defusing = true;
    this._defuseTimer = this.player.weaponManager.hasDefuseKit ? 5 : 10;
  }

  _throwGrenade() {
    if (!this.player?.isAlive) return;
    if (this.state.phase !== PHASE.LIVE) return;
    const nades = this.player.weaponManager.grenades;
    if (nades.length === 0) return;

    const idx = this.player.grenadeIndex % nades.length;
    const type = nades[idx];
    const data = this.player.getGrenadeThrowData();

    const config = { origin: data.origin, direction: data.direction, owner: this.player, scene: this.scene };
    let nade;
    if (type === 'he')      nade = new HEGrenade(config);
    else if (type === 'flash')  nade = new Flashbang(config);
    else if (type === 'smoke')  nade = new SmokeGrenade(config);
    else if (type === 'molotov')nade = new Molotov(config);

    if (nade) {
      this.scene.add(nade.mesh);
      if (type === 'smoke') this.smokes.push(nade);
      else if (type === 'molotov') this.molotovs.push(nade);
      else this.grenades.push(nade);
      this.player.weaponManager.removeGrenade(type);
    }
  }

  _shoot() {
    if (!this.player?.isAlive) return;
    const w = this.player.currentWeapon;
    if (!w) return;

    // Auto fire: hold mouse
    const result = this.player.shoot(this.audio, this.bots, this.gameMap);
    if (result?.hit) {
      const ent = result.entity;
      if (!ent.isAlive) {
        // Just killed this frame
        this.state.onKill(this.player, ent, this.audio);
        this.hud.addKill(this.player.name, ent.name, w.name, true);
        if (this._mode === 'deathmatch') {
          this.hud.updateDMScore(this.player.kills);
          setTimeout(() => this._respawnBot(ent), 2000);
        }
      }
      this.hud.flashDamage(result.dmg);
    }
  }

  _onPhaseChange(phase) {
    if (phase === PHASE.BUY) {
      this.hud.showBuyPhase();
      this._respawnAll();
      this._clearGrenades();
    } else if (phase === PHASE.LIVE) {
      this.hud.hideBuyPhase();
    }
  }

  _onRoundEnd(winner) {
    // Update HUD score
    this.hud.updateScore(this.state.scoreCT, this.state.scoreT);
  }

  _onBombExplode() {
    // Kill player if CT
    if (this.player.team === 'ct' && this.player.isAlive) {
      this.player.die();
      this.hud.showDeathScreen('Bomb');
      this.audio.playDeath();
    }
  }

  _respawnAll() {
    // Respawn player
    if (!this.player.isAlive) {
      const sp = this.gameMap.getSpawnPoint(this.player.team, this.gameMap.spawnsCT, this.gameMap.spawnsT);
      this.player.respawn(sp.clone().add(new THREE.Vector3(0, 0.9, 0)));
      this.hud.hideDeathScreen();
    }

    // Respawn bots
    for (const bot of this.bots) {
      const sp = this.gameMap.getSpawnPoint(bot.team, this.gameMap.spawnsCT, this.gameMap.spawnsT);
      bot.respawn(sp.clone().add(new THREE.Vector3(0, 0.9, 0)));
      bot.giveUtility();
    }

    // Give bomb to a T
    const tBots = this.bots.filter(b => b.team === 't');
    if (this.player.team === 't') {
      this.player._hasBomb = true;
    } else if (tBots.length > 0) {
      tBots[0].hasBomb = true;
    }
  }

  _respawnBot(bot) {
    if (this._mode !== 'deathmatch') return;
    const sp = this.gameMap.getSpawnPoint(bot.team, this.gameMap.spawnsCT, this.gameMap.spawnsT);
    bot.respawn(sp.clone().add(new THREE.Vector3(0, 0.9, 0)));
  }

  _clearGrenades() {
    for (const g of [...this.grenades, ...this.smokes, ...this.molotovs]) {
      this.scene.remove(g.mesh);
      if (g.smokeMesh) this.scene.remove(g.smokeMesh);
      if (g.fireMeshes) g.fireMeshes.forEach(m => this.scene.remove(m));
    }
    this.grenades = [];
    this.smokes = [];
    this.molotovs = [];
  }

  _loop(timestamp) {
    requestAnimationFrame(t => this._loop(t));

    const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05);
    this._lastTime = timestamp;

    if (this.state.phase === PHASE.MENU || !this.player) return;

    this._update(dt);
    this._render();
    this._updateHUD();
  }

  _update(dt) {
    if (!this.player) return;

    // Input mouse delta
    const mouse = this.input.consumeMouseDelta();

    // Player
    if (this.player.isAlive && this.input.isPointerLocked && !this.hud.buyMenuOpen) {
      this.player.look(mouse.x, mouse.y);
      this.player.move(this.input, dt, this.gameMap);
      this.player.weaponManager.update(dt, mouse.x, mouse.y);

      // Auto-fire (hold LMB)
      const w = this.player.currentWeapon;
      if (this.input.isMouseLeft() && w?.isAuto) {
        this._shoot();
      }

      // Plant / defuse progress
      if (this._planting) {
        if (!this.input.isDown('KeyE')) {
          this._planting = false;
        } else {
          this._plantTimer -= dt;
          if (this._plantTimer <= 0) {
            this._planting = false;
            this.player._hasBomb = false;
            this.state.onBombPlanted(this.player.position, this._plantSite, this.audio, this.hud);
          }
        }
      }
      if (this._defusing) {
        if (!this.input.isDown('KeyE')) {
          this._defusing = false;
        } else {
          this._defuseTimer -= dt;
          if (this._defuseTimer <= 0) {
            this._defusing = false;
            this.state.bombDefused = true;
            this.state.onBombDefuse?.();
            this.audio.playBombDefuse();
          }
        }
      }
    }

    // Bots update
    const allEntities = this.bots;
    for (const bot of this.bots) {
      bot.update(dt, this.player, allEntities, this.gameMap, this.state, this.audio,
        (shooter, target, weapon) => {
          // Bot shot at target
          const spread = weapon.getCurrentSpread(false, false, false);
          const hitChance = 0.6 - spread * 2; // worse spread = worse accuracy
          if (Math.random() < hitChance) {
            const hitZone = Math.random() < 0.15 ? 'head' : 'body';
            let dmg = weapon.damage;
            if (hitZone === 'head') dmg *= weapon.headshotMultiplier;

            if (target === this.player || target.isPlayer) {
              const actual = target.takeDamage(dmg, hitZone);
              this.audio.playHurt();
              this.hud.flashDamage(actual);
              if (!target.isAlive) {
                this.state.onKill(shooter, target, this.audio);
                this.hud.addKill(shooter.name, target.name, weapon.name, false);
                this.hud.showDeathScreen(shooter.name);
                this.audio.playDeath();
                if (this._mode === 'deathmatch') {
                  setTimeout(() => {
                    const sp = this.gameMap.getSpawnPoint(this.player.team, this.gameMap.spawnsCT, this.gameMap.spawnsT);
                    this.player.respawn(sp.clone().add(new THREE.Vector3(0, 0.9, 0)));
                    this.hud.hideDeathScreen();
                  }, 2000);
                }
              }
            } else if (target instanceof Bot) {
              const actual = target.takeDamage(dmg, hitZone);
              if (!target.isAlive) {
                this.state.onKill(shooter, target, this.audio);
                this.hud.addKill(shooter.name, target.name, weapon.name, false);
              }
            }
          }
        },
        (bot, nadeType, origin, dir) => {
          const config = { origin, direction: dir, owner: bot, scene: this.scene };
          let nade;
          if (nadeType === 'flash') nade = new Flashbang(config);
          else if (nadeType === 'smoke') nade = new SmokeGrenade(config);
          else if (nadeType === 'he') nade = new HEGrenade(config);
          if (nade) {
            this.scene.add(nade.mesh);
            if (nadeType === 'smoke') this.smokes.push(nade);
            else this.grenades.push(nade);
          }
        }
      );
    }

    // Grenades (HE + Flash)
    const allEntsForDmg = [this.player, ...this.bots];
    for (const g of this.grenades) {
      g.update(dt, this.gameMap, this.audio);
      if (g.exploded && !g._effectApplied) {
        g._effectApplied = true;
        g.applyEffect(allEntsForDmg, this.gameMap, this.hud, this.camera);
      }
    }
    // Smoke (scene stored in _sceneRef, deployed inside detonate via update)
    for (const s of this.smokes) {
      if (!s.active && !s.smokeActive) continue;
      s.update(dt, this.gameMap, this.audio);
      s.updateSmoke(dt);
    }
    // Molotovs (scene stored in _sceneRef, deployed inside detonate via update)
    for (const m of this.molotovs) {
      m.update(dt, this.gameMap, this.audio);
      m.updateFire(dt, allEntsForDmg, this.hud);
    }

    // Clean up dead grenades
    this.grenades = this.grenades.filter(g => g.active || !g._effectApplied);
    this.smokes   = this.smokes.filter(s => s.smokeActive || s.active);
    this.molotovs = this.molotovs.filter(m => m.fireActive || m.active);

    // Prompt displays
    if (this.player.isAlive && this.state.phase === PHASE.LIVE) {
      const site = this.gameMap.isInBombSite(this.player.position);
      const canPlant = this.player.team === 't' && this.player._hasBomb && site && !this.state.bombPlanted;
      this.hud.showPlantPrompt(canPlant);

      const nearBomb = this.state.bombPlanted && !this.state.bombDefused &&
        this.player.position.distanceTo(this.state.bombPosition || new THREE.Vector3(0,0,0)) < 2.5;
      this.hud.showDefusePrompt(this.player.team === 'ct' && nearBomb);
    } else {
      this.hud.showPlantPrompt(false);
      this.hud.showDefusePrompt(false);
    }

    // Kill feed for bot-vs-bot
    // Check newly dead bots
    for (const bot of this.bots) {
      if (!bot.isAlive && !bot._deathLogged) {
        bot._deathLogged = true;
      }
    }

    // Game state
    this.state.update(dt, this.bots, this.player, this.audio, this.hud);
  }

  _render() {
    this.renderer.render(this.scene, this.camera);
    this._drawMinimap();
  }

  _drawMinimap() {
    const ctx = this._minimapCtx;
    const W = 160, H = 160;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    // Map extent: x: -45 to 45, z: -25 to 70 → 90×95
    const mapMinX = -45, mapMaxX = 45;
    const mapMinZ = -25, mapMaxZ = 70;
    const scaleX = W / (mapMaxX - mapMinX);
    const scaleZ = H / (mapMaxZ - mapMinZ);

    const toMM = (wx, wz) => ({
      x: (wx - mapMinX) * scaleX,
      y: (wz - mapMinZ) * scaleZ,
    });

    // Draw simplified map zones
    const zones = [
      { color: '#4a6fa5', x: -20, z: -20, w: 30, d: 15, label: 'CT' },
      { color: '#a55a4a', x: -15, z: 50, w: 30, d: 15, label: 'T' },
      { color: '#d4b896', x: 10,  z: -5, w: 30, d: 30, label: 'A' },
      { color: '#d4b896', x: -40, z: 5,  w: 25, d: 30, label: 'B' },
    ];

    ctx.font = '8px monospace';
    for (const z of zones) {
      const p = toMM(z.x, z.z);
      ctx.fillStyle = z.color + '88';
      ctx.fillRect(p.x, p.y, z.w * scaleX, z.d * scaleZ);
      ctx.fillStyle = '#ffffff66';
      ctx.fillText(z.label, p.x + 2, p.y + 10);
    }

    // Draw entities
    const drawDot = (wx, wz, color, size = 3) => {
      const p = toMM(wx, wz);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    };

    for (const bot of this.bots) {
      if (!bot.isAlive) continue;
      const color = bot.team === 'ct' ? '#4488ff' : '#ff8844';
      drawDot(bot.position.x, bot.position.z, color, 3);
    }

    if (this.player?.isAlive) {
      drawDot(this.player.position.x, this.player.position.z, '#ffffff', 4);
      // Direction indicator
      const mmP = toMM(this.player.position.x, this.player.position.z);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mmP.x, mmP.y);
      ctx.lineTo(
        mmP.x + Math.sin(-this.player.yaw) * 8,
        mmP.y + Math.cos(-this.player.yaw) * 8
      );
      ctx.stroke();
    }

    // Bomb
    if (this.state.bombPlanted && this.state.bombPosition) {
      drawDot(this.state.bombPosition.x, this.state.bombPosition.z, '#ff0000', 4);
    }
  }

  _updateHUD() {
    if (!this.player) return;
    this.hud.updateHealth(this.player.health);
    this.hud.updateArmor(this.player.armor);
    this.hud.updateMoney(this.player.money);

    const w = this.player.currentWeapon;
    if (w) {
      this.hud.updateAmmo(w.ammo, w.reserve, w.name);
    }
    this.hud.updateWeaponSlots(this.player.weaponManager, this._mode === 'deathmatch');
    this.hud.showCrosshair(!this.player.isScoped);

    if (this.state.phase === PHASE.BUY) {
      if (this.hud.buyMenuOpen && this.hud._wm) {
        this.hud._wm.money = this.player.money;
        this.hud.$buyMoney.textContent = `$${this.player.money}`;
      }
    }
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
