// Game state machine
// Phases: menu → team_select → buy → live → round_end → buy → ...

export const PHASE = {
  MENU:       'menu',
  TEAM_SELECT:'team_select',
  BUY:        'buy',
  LIVE:       'live',
  ROUND_END:  'round_end',
  HALFTIME:   'halftime',
  GAME_OVER:  'game_over',
  DEATHMATCH: 'deathmatch',
};

const BUY_PHASE_DURATION    = 15;
const ROUND_DURATION        = 115; // 1m55s
const ROUND_END_DURATION    = 5;
const BOMB_PLANT_TIME       = 3.2;
const BOMB_TIMER            = 40;
const HALFTIME_DURATION     = 6;

// Economy constants
const KILL_REWARD    = 300;
const WIN_REWARD_CT  = 3250;
const WIN_REWARD_T   = 3500;
const BOMB_PLANT_BONUS = 800;
const BOMB_DEFUSE_BONUS = 300;

const LOSS_BONUS = [1400, 1900, 2400, 2900, 3400]; // escalating loss bonus

export class GameState {
  constructor(mode = 'competitive') {
    this.mode = mode; // 'competitive' | 'deathmatch'
    this.phase = PHASE.MENU;
    this.phaseTimer = 0;

    // Round info
    this.round = 1;
    this.maxRounds = 15; // per half
    this.halfRound = 0;  // rounds played in current half

    // Scores
    this.scoreCT = 0;
    this.scoreT  = 0;

    // Bomb
    this.bombPlanted = false;
    this.bombDefused = false;
    this.bombExploded = false;
    this.bombPosition = null;
    this.bombSite     = null;
    this.bombTimer    = 0;

    // Win condition
    this.roundWinner = null; // 'ct' | 't' | null
    this.gameWinner  = null;

    // Loss streak tracking per team
    this.ctLossStreak  = 0;
    this.tLossStreak   = 0;
    this.ctWon = false; // did CT win this round

    // Deathmatch
    this.dmTimer = 600; // 10 minutes
    this.dmKills = {}; // playerId → kills

    // Callbacks
    this.onRoundEnd   = null;
    this.onBombPlant  = null;
    this.onBombDefuse = null;
    this.onBombExplode= null;
    this.onHalftime   = null;
    this.onGameOver   = null;
    this.onPhaseChange= null;
  }

  setPhase(p) {
    this.phase = p;
    this.onPhaseChange?.(p);
  }

  startGame(playerTeam, mode) {
    this.mode = mode;
    this.round = 1;
    this.halfRound = 0;
    this.scoreCT = 0;
    this.scoreT  = 0;
    this.ctLossStreak = 0;
    this.tLossStreak  = 0;

    if (mode === 'deathmatch') {
      this.phase = PHASE.DEATHMATCH;
      this.dmTimer = 600;
    } else {
      this.phaseTimer = BUY_PHASE_DURATION;
      this.setPhase(PHASE.BUY);
    }
  }

  update(dt, allEntities, player, audio, hud) {
    if (this.phase === PHASE.DEATHMATCH) {
      this._updateDeathmatch(dt, allEntities, player, audio, hud);
      return;
    }

    this.phaseTimer -= dt;

    if (this.phase === PHASE.BUY) {
      hud?.updateTimer(this.phaseTimer, true);
      if (this.phaseTimer <= 0) {
        this._startLivePhase(allEntities, hud);
      }
    }
    else if (this.phase === PHASE.LIVE) {
      hud?.updateTimer(this.phaseTimer, false);

      // Bomb beep
      if (this.bombPlanted && !this.bombDefused && !this.bombExploded) {
        this.bombTimer -= dt;
        const beepInterval = Math.max(0.15, 1.0 - (1 - this.bombTimer / BOMB_TIMER) * 0.85);
        this._beepTimer = (this._beepTimer || 0) - dt;
        if (this._beepTimer <= 0) {
          audio?.playBombBeep(beepInterval);
          this._beepTimer = beepInterval;
        }
        if (this.bombTimer <= 0) {
          this._bombExplode(allEntities, audio, hud);
        }
      }

      // Check round-end conditions
      const ctAlive = allEntities.filter(e => e.team === 'ct' && e.isAlive).length +
                      (player.team === 'ct' && player.isAlive ? 1 : 0);
      const tAlive  = allEntities.filter(e => e.team === 't' && e.isAlive).length +
                      (player.team === 't' && player.isAlive ? 1 : 0);

      if (ctAlive === 0 && !this.bombPlanted) {
        this._endRound('t', 'T wins — all CT eliminated', allEntities, player, audio, hud);
      } else if (tAlive === 0 && !this.bombPlanted) {
        this._endRound('ct', 'CT wins — all T eliminated', allEntities, player, audio, hud);
      } else if (tAlive === 0 && this.bombPlanted && !this.bombDefused) {
        this._endRound('ct', 'CT wins — all T eliminated (bomb planted)', allEntities, player, audio, hud);
      } else if (this.bombDefused) {
        this._endRound('ct', 'CT wins — bomb defused!', allEntities, player, audio, hud);
      } else if (this.phaseTimer <= 0 && !this.bombPlanted) {
        this._endRound('ct', 'CT wins — time expired', allEntities, player, audio, hud);
      }
    }
    else if (this.phase === PHASE.ROUND_END) {
      if (this.phaseTimer <= 0) {
        this.halfRound++;
        this.round++;

        // Halftime check
        if (this.halfRound >= this.maxRounds) {
          this._halftime(allEntities, player, hud, audio);
          return;
        }

        // Game over check: first to 13 (or 16 rounds total with overtime)
        if (this.scoreCT >= 13 || this.scoreT >= 13) {
          this.gameWinner = this.scoreCT >= 13 ? 'ct' : 't';
          this.setPhase(PHASE.GAME_OVER);
          this.onGameOver?.(this.gameWinner);
          return;
        }

        this._startBuyPhase(allEntities, player, hud);
      }
    }
    else if (this.phase === PHASE.HALFTIME) {
      if (this.phaseTimer <= 0) {
        this._startBuyPhase(allEntities, player, hud);
      }
    }
  }

  _startLivePhase(allEntities, hud) {
    this.phaseTimer = ROUND_DURATION;
    this.bombPlanted = false;
    this.bombDefused = false;
    this.bombExploded = false;
    this.bombPosition = null;
    this.bombTimer = BOMB_TIMER;
    this._beepTimer = 1;
    this.roundWinner = null;
    this.setPhase(PHASE.LIVE);
    hud?.hideBuyPhase();
    hud?.hideBuyMenu();
  }

  _startBuyPhase(allEntities, player, hud) {
    this.phaseTimer = BUY_PHASE_DURATION;
    this.setPhase(PHASE.BUY);
    hud?.showBuyPhase();
    hud?.showRoundStart(this.round, null);
  }

  _endRound(winner, message, allEntities, player, audio, hud) {
    if (this.phase !== PHASE.LIVE) return;
    this.roundWinner = winner;
    this.phaseTimer = ROUND_END_DURATION;
    this.setPhase(PHASE.ROUND_END);

    const playerWon = player.team === winner;
    if (playerWon) audio?.playRoundWin();
    else audio?.playRoundLose();

    // Update scores
    if (winner === 'ct') this.scoreCT++;
    else this.scoreT++;

    hud?.showRoundEnd(winner, message, this.scoreCT, this.scoreT);

    // Economy
    this._distributeEconomy(winner, allEntities, player);

    this.onRoundEnd?.(winner);
  }

  _distributeEconomy(winner, allEntities, player) {
    const winReward  = winner === 'ct' ? WIN_REWARD_CT : WIN_REWARD_T;
    const loseTeam   = winner === 'ct' ? 't' : 'ct';
    const loseStreak = loseTeam === 'ct' ? this.ctLossStreak : this.tLossStreak;
    const loseReward = LOSS_BONUS[Math.min(loseStreak, LOSS_BONUS.length - 1)];

    const allEnt = [...allEntities, player];
    for (const ent of allEnt) {
      if (ent.team === winner) {
        ent.addMoney(winReward);
        if (loseTeam === 'ct') this.ctLossStreak = 0;
        else this.tLossStreak = 0;
      } else {
        ent.addMoney(loseReward);
        if (loseTeam === 'ct') this.ctLossStreak = Math.min(this.ctLossStreak + 1, 4);
        else this.tLossStreak = Math.min(this.tLossStreak + 1, 4);
      }
    }
  }

  onKill(killer, victim, audio) {
    killer.kills++;
    killer.addMoney(KILL_REWARD);
    if (killer.isPlayer) {
      audio?.playRoundWin(); // brief "got a kill" audio cue would be here
    }
  }

  onBombPlanted(position, site, audio, hud) {
    this.bombPlanted = true;
    this.bombPosition = position.clone();
    this.bombSite = site;
    this.bombTimer = BOMB_TIMER;
    this._beepTimer = 1;
    audio?.playBombPlant();
    hud?.showBombPlanted(site);
    this.onBombPlant?.();
  }

  _bombExplode(allEntities, audio, hud) {
    this.bombExploded = true;
    audio?.playBombExplode();
    hud?.hideBombPlanted();
    // Kill all CT entities
    const allEnt = allEntities;
    for (const ent of allEnt) {
      if (ent.team === 'ct' && ent.isAlive) ent.die?.();
    }
    this._endRound('t', 'T wins — bomb exploded!', allEntities, null, audio, hud);
    this.onBombExplode?.();
  }

  _halftime(allEntities, player, hud, audio) {
    this.halfRound = 0;
    this.phaseTimer = HALFTIME_DURATION;
    this.setPhase(PHASE.HALFTIME);
    // Swap teams
    hud?.showHalftime(this.scoreCT, this.scoreT);
    this.onHalftime?.();
  }

  // Deathmatch update
  _updateDeathmatch(dt, allEntities, player, audio, hud) {
    this.dmTimer -= dt;
    hud?.updateTimer(this.dmTimer, false);
    if (this.dmTimer <= 0) {
      this.phase = PHASE.GAME_OVER;
      this.onGameOver?.('deathmatch');
    }
  }

  // Respawn a dead entity at a random spawn point
  getSpawnPoint(team, mapSpawnsCT, mapSpawnsT) {
    const spawns = team === 'ct' ? mapSpawnsCT : mapSpawnsT;
    return spawns[Math.floor(Math.random() * spawns.length)];
  }
}
