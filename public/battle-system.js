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
    console.log('[BattleSystem] Initializing battle with', playerUnits.length, 'player units');
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

  // ==================== TARGETING ====================
  getValidTargets(actor) {
    console.log(`[BattleSystem] getValidTargets for ${actor.unit_name}`);
    const data = actor.unit_data || {};
    const action = data.action || {};
    const range = action.range ?? 1;
    let targetType = action.target_type || data.target_type || data.action;

    // Fix for healers
    if (data.action === 'heal') targetType = 'ally';

    const targets = this.combatants.filter(t => {
      if (!t.alive) return false;
      if (targetType === 'ally') {
        return t.side === actor.side && t.id !== actor.id;
      }
      if (targetType === 'enemy') {
        if (t.side === actor.side) return false;
        if (range === 1) {
          return Math.abs(cellRow(actor.cellIndex) - cellRow(t.cellIndex)) <= 1;
        }
        return true;
      }
      return false;
    });

    console.log(`[BattleSystem] Found ${targets.length} valid targets for ${actor.unit_name}`);
    return targets;
  }

  // ==================== ACTIONS ====================
  executeAction(actor, target = null, actionType = 'attack') {
    console.log(`[BattleSystem] executeAction: ${actionType} by ${actor.unit_name}`);

    if (actionType === 'defend') {
      return this.doDefend(actor);
    }
    if (actionType === 'ability') {
      return this.doAbility(actor, target);
    }

    // Basic Attack / Heal
    if (!target) {
      console.warn('[BattleSystem] No target provided!');
      return false;
    }

    const data = actor.unit_data || {};
    const isHeal = (data.action === 'heal' || data.target_type === 'ally' || data.action?.target_type === 'ally');

    console.log(`[BattleSystem] Is this a heal action? ${isHeal}`);

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
      console.log(`[BattleSystem] ✅ HEAL: ${actor.unit_name} healed ${target.unit_name} for ${value}`);
    } else {
      value = this.calcDamage(actor, target);
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
    return this.afterAction(actor);
  }

  calcHeal(actor) {
    const power = actor.unit_data?.action?.value ?? 15;
    return Math.floor(power * 1.3); // healers are a bit stronger
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

    this.log.push({
      type: 'defend',
      actorName: actor.unit_name,
      message: 'defended (+25 armor & resists)'
    });
    return this.afterAction(actor);
  }

  doAbility(actor, target) {
    if (actor.used_active || !actor.unit_data?.ability) return false;

    actor.used_active = true;
    actor.acted_this_round = true;

    this.log.push({
      type: 'ability',
      actorName: actor.unit_name,
      message: `used ${actor.unit_data.ability.split(' ')[0]}`
    });

    return this.afterAction(actor);
  }

  skipTurn(actor) {
    this.log.push({ type: 'skip', actorName: actor.unit_name });
    actor.acted_this_round = true;
    return this.afterAction(actor);
  }

  afterAction(actor) {
    this.applyStatusEffects(actor);

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

  applyStatusEffects(unit) {
    if (unit.burn > 0) {
      const dmg = Math.floor(unit.max_hp * 0.25);
      unit.battle_hp = Math.max(0, unit.battle_hp - dmg);
      this.log.push({ type: 'status', actorName: unit.unit_name, message: `burned for ${dmg}` });
      unit.burn = 0;
    }
    if (unit.battle_hp <= 0) unit.alive = false;
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
    if (!targets.length) {
      this.skipTurn(actor);
      return null;
    }

    const target = targets.reduce((a, b) => a.battle_hp < b.battle_hp ? a : b);
    this.executeAction(actor, target, 'attack');
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