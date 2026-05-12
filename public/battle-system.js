// public/battle-system.js

const ROWS = 3;
const COLS = 2;

export function cellIndex(row, col) { return row * COLS + col; }
export function cellRow(i) { return Math.floor(i / COLS); }
export function cellCol(i) { return i % COLS; }

export class BattleSystem {
  constructor(playerUnits, enemyUnits, placement) {
    this.combatants = [];
    this.round = 1;
    this.phase = 'player_turn';
    this.log = [];
    this.done = false;
    this.winner = null;

    this.initCombatants(playerUnits, enemyUnits, placement);
  }

  initCombatants(playerUnits, enemyUnits, placement) {
    // Player units
    playerUnits.forEach(u => {
      const cellIdx = placement[u.id] ?? this.combatants.length;
      this.combatants.push({
        id: u.id,
        unit_name: u.unit_name,
        unit_data: u.unit_data || u,
        side: 'player',
        cellIndex: cellIdx,
        battle_hp: u.unit_data?.hp ?? 50,
        max_hp: u.unit_data?.hp ?? 50,
        armor: u.unit_data?.armor ?? 0,
        initiative: u.unit_data?.initiative ?? 40,
        alive: true,
        acted_this_round: false,
        used_active: false,
      });
    });

    // Enemy units
    enemyUnits.forEach((e, i) => {
      const col = i % COLS;
      const row = Math.min(Math.floor(i / COLS), ROWS - 1);
      this.combatants.push({
        id: `enemy_${i}`,
        unit_name: e.name,
        unit_data: { ...e, action: e.action || {} },
        side: 'enemy',
        cellIndex: cellIndex(row, col),
        battle_hp: e.hp ?? 50,
        max_hp: e.hp ?? 50,
        armor: e.armor ?? 0,
        initiative: e.initiative ?? 30,
        alive: true,
        acted_this_round: false,
        used_active: false,
      });
    });
  }

  getActingOrder() {
    return this.combatants
      .filter(c => c.alive && !c.acted_this_round)
      .sort((a, b) => b.initiative - a.initiative);
  }

  currentActor() {
    return this.getActingOrder()[0] ?? null;
  }

  checkWin() {
    const playerAlive = this.combatants.some(c => c.side === 'player' && c.alive);
    const enemyAlive = this.combatants.some(c => c.side === 'enemy' && c.alive);

    if (!playerAlive) return 'enemy';
    if (!enemyAlive) return 'player';
    return null;
  }

  advanceRound() {
    this.combatants.forEach(c => { c.acted_this_round = false; });
    this.round++;
    this.log.push({ type: 'round', round: this.round });
  }

  calcDamage(attacker, target) {
    const power = attacker.unit_data?.action?.value ?? 10;
    return Math.max(1, power - (target.armor ?? 0));
  }

  getValidTargets(actor) {
    const action = actor.unit_data?.action || {};
    const range = action.range ?? 1;
    const targetType = action.target_type ?? 'enemy';

    return this.combatants.filter(t => {
      if (!t.alive) return false;
      if (targetType === 'ally') {
        return t.side === actor.side && t.id !== actor.id;
      }
      if (targetType === 'enemy') {
        if (t.side === actor.side) return false;
        if (range === 1) {
          const actorRow = cellRow(actor.cellIndex);
          const targetRow = cellRow(t.cellIndex);
          return Math.abs(actorRow - targetRow) <= 1;
        }
        return true; // ranged
      }
      return false;
    });
  }

  // Main action
  executeAction(actor, target) {
    if (!actor || !target || !actor.alive || !target.alive) return false;

    const isHeal = actor.unit_data?.action?.target_type === 'ally';
    const value = this.calcDamage(actor, target);

    if (isHeal) {
      target.battle_hp = Math.min(target.max_hp, target.battle_hp + value);
      this.log.push({
        type: 'action',
        actorName: actor.unit_name,
        targetName: target.unit_name,
        value,
        heal: true
      });
    } else {
      target.battle_hp = Math.max(0, target.battle_hp - value);
      const killed = target.battle_hp <= 0;
      if (killed) target.alive = false;

      this.log.push({
        type: 'action',
        actorName: actor.unit_name,
        targetName: target.unit_name,
        value,
        killed
      });
    }

    actor.acted_this_round = true;

    const win = this.checkWin();
    if (win) {
      this.done = true;
      this.winner = win;
      return true;
    }

    if (this.getActingOrder().length === 0) {
      this.advanceRound();
    }

    return true;
  }

  skipTurn(actor) {
    if (!actor) return false;
    this.log.push({ type: 'skip', actorName: actor.unit_name });
    actor.acted_this_round = true;

    const win = this.checkWin();
    if (win) {
      this.done = true;
      this.winner = win;
      return true;
    }

    if (this.getActingOrder().length === 0) {
      this.advanceRound();
    }
    return true;
  }

  // AI simple turn
  aiTurn() {
    const actor = this.currentActor();
    if (!actor || actor.side !== 'enemy') return null;

    const targets = this.getValidTargets(actor);
    if (!targets.length) {
      this.skipTurn(actor);
      return null;
    }

    // Target lowest HP
    const target = targets.reduce((a, b) => a.battle_hp < b.battle_hp ? a : b);
    this.executeAction(actor, target);
    return target;
  }

  getState() {
    return {
      combatants: this.combatants,
      round: this.round,
      log: this.log,
      done: this.done,
      winner: this.winner,
    };
  }
}