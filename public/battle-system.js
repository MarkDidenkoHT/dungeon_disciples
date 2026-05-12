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
    this.log = [];
    this.done = false;
    this.winner = null;

    this.initCombatants(playerUnits, enemyUnits, placement);
  }

  initCombatants(playerUnits, enemyUnits, placement) {
    playerUnits.forEach(u => {
      const cellIdx = placement[u.id] ?? this.combatants.length;
      this.combatants.push(this.createCombatant(u, 'player', cellIdx));
    });

    enemyUnits.forEach((e, i) => {
      const col = i % COLS;
      const row = Math.min(Math.floor(i / COLS), ROWS - 1);
      this.combatants.push(this.createCombatant(e, 'enemy', cellIndex(row, col)));
    });
  }

  createCombatant(unit, side, cellIndex) {
    const data = unit.unit_data || unit;
    return {
      id: unit.id || `enemy_${Math.random().toString(36).slice(2)}`,
      unit_name: unit.unit_name || data.name,
      unit_data: data,
      side,
      cellIndex,
      battle_hp: data.hp ?? 50,
      max_hp: data.hp ?? 50,
      armor: data.armor ?? 0,
      initiative: data.initiative ?? 40,
      alive: true,
      acted_this_round: false,
      used_active: false,
      defend_armor_bonus: 0,
      defend_resist_bonus: 0,
      burn: 0,
      poison: 0,
    };
  }

  getValidTargets(actor) {
    const data = actor.unit_data || {};
    let targetType = data.action?.target_type || data.target_type || data.action;

    // Strong fix for healers like Acolyte
    if (data.action === 'heal' || data.type === 'healer') {
      targetType = 'ally';
    }

    return this.combatants.filter(t => {
      if (!t.alive) return false;
      if (targetType === 'ally') {
        return t.side === actor.side && t.id !== actor.id;
      }
      if (targetType === 'enemy') {
        if (t.side === actor.side) return false;
        const range = data.action?.range ?? 1;
        if (range === 1) {
          return Math.abs(cellRow(actor.cellIndex) - cellRow(t.cellIndex)) <= 1;
        }
        return true;
      }
      return false;
    });
  }

  executeAction(actor, target = null, actionType = 'attack') {
    if (actionType === 'defend') return this.doDefend(actor);
    if (actionType === 'ability') return this.doAbility(actor, target);

    if (!target) return false;

    const data = actor.unit_data || {};
    const isHeal = (data.action === 'heal' || 
                   data.target_type === 'ally' || 
                   data.action?.target_type === 'ally' ||
                   data.type === 'healer');

    let value;
    if (isHeal) {
      value = this.calcHeal(actor);
      target.battle_hp = Math.min(target.max_hp, target.battle_hp + value);
      this.log.push({
        type: 'action',
        actorName: actor.unit_name,
        targetName: target.unit_name,
        value,
        heal: true
      });
    } else {
      value = this.calcDamage(actor, target);
      target.battle_hp = Math.max(0, target.battle_hp - value);
      if (target.battle_hp <= 0) target.alive = false;
      this.log.push({
        type: 'action',
        actorName: actor.unit_name,
        targetName: target.unit_name,
        value,
        killed: !target.alive
      });
    }

    actor.acted_this_round = true;
    return this.afterAction(actor);
  }

  calcHeal(actor) {
    return (actor.unit_data?.action?.value ?? 15) + 5;
  }

  calcDamage(attacker, target) {
    const power = attacker.unit_data?.action?.value ?? 12;
    const armor = Math.max(0, target.armor + (target.defend_armor_bonus || 0));
    return Math.max(1, power - armor);
  }

  doDefend(actor) {
    actor.defend_armor_bonus = 25;
    actor.defend_resist_bonus = 25;
    actor.acted_this_round = true;
    this.log.push({ type: 'defend', actorName: actor.unit_name, message: 'defended (+25 armor & resists)' });
    return this.afterAction(actor);
  }

  doAbility(actor, target) {
    if (actor.used_active) return false;
    actor.used_active = true;
    actor.acted_this_round = true;
    this.log.push({ type: 'ability', actorName: actor.unit_name, message: `used ability` });
    return this.afterAction(actor);
  }

  skipTurn(actor) {
    this.log.push({ type: 'skip', actorName: actor.unit_name });
    actor.acted_this_round = true;
    return this.afterAction(actor);
  }

  afterAction(actor) {
    const win = this.checkWin();
    if (win) {
      this.done = true;
      this.winner = win;
      return true;
    }
    if (this.getActingOrder().length === 0) this.advanceRound();
    return true;
  }

  advanceRound() {
    this.combatants.forEach(c => {
      c.acted_this_round = false;
      c.defend_armor_bonus = 0;
      c.defend_resist_bonus = 0;
    });
    this.round++;
    this.log.push({ type: 'round', round: this.round });
  }

  checkWin() {
    const playerAlive = this.combatants.some(c => c.side === 'player' && c.alive);
    const enemyAlive = this.combatants.some(c => c.side === 'enemy' && c.alive);
    if (!playerAlive) return 'enemy';
    if (!enemyAlive) return 'player';
    return null;
  }

  getActingOrder() {
    return this.combatants
      .filter(c => c.alive && !c.acted_this_round)
      .sort((a, b) => b.initiative - a.initiative);
  }

  currentActor() {
    return this.getActingOrder()[0] ?? null;
  }

  aiTurn() {
    const actor = this.currentActor();
    if (!actor || actor.side !== 'enemy') return null;
    const targets = this.getValidTargets(actor);
    if (!targets.length) return this.skipTurn(actor);
    const target = targets.reduce((a, b) => a.battle_hp < b.battle_hp ? a : b);
    this.executeAction(actor, target, 'attack');
  }

  getState() {
    return { combatants: this.combatants, round: this.round, log: this.log, done: this.done, winner: this.winner };
  }
}