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

      // Temporary buffs
      defend_armor_bonus: 0,
      defend_resist_bonus: 0,

      // Status effects
      burn: 0,      // damage on next turn
      poison: 0,
    };
  }

  // ==================== CORE CALCULATIONS ====================

  getEffectiveArmor(target) {
    return Math.max(0, target.armor + (target.defend_armor_bonus || 0));
  }

  calcDamage(attacker, target, multiplier = 1.0) {
    const power = attacker.unit_data?.action?.value ?? 12;
    const armor = this.getEffectiveArmor(target);
    let damage = Math.max(1, Math.floor(power * multiplier - armor));

    // Simple resistance simulation (can be expanded)
    const resist = target.unit_data?.resistances?.[attacker.unit_data?.damage_source] || 0;
    damage = Math.max(1, Math.floor(damage * (1 - resist / 100)));

    return damage;
  }

  calcHeal(attacker, multiplier = 1.0) {
    const power = attacker.unit_data?.action?.value ?? 15;
    return Math.floor(power * multiplier);
  }

  // ==================== ACTIONS ====================

  executeAction(actor, target = null, actionType = 'attack') {
    if (!actor || !actor.alive) return false;

    switch (actionType) {
      case 'defend':
        return this.doDefend(actor);

      case 'ability':
        return this.doAbility(actor, target);

      case 'attack':
      default:
        if (!target) return false;
        return this.doBasicAttack(actor, target);
    }
  }

  doDefend(actor) {
    actor.defend_armor_bonus = 25;
    actor.defend_resist_bonus = 25;
    actor.acted_this_round = true;

    this.log.push({
      type: 'defend',
      actorName: actor.unit_name,
      message: 'defended (+25 armor & resists this round)'
    });
    return this.afterAction(actor);
  }

  doBasicAttack(actor, target) {
    const isHeal = actor.unit_data?.action?.target_type === 'ally';
    const value = isHeal 
      ? this.calcHeal(actor) 
      : this.calcDamage(actor, target);

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

      // Lifesteal example
      if (actor.unit_data?.passive?.includes('lifesteal')) {
        const heal = Math.floor(value * 0.25);
        actor.battle_hp = Math.min(actor.max_hp, actor.battle_hp + heal);
      }
    }

    actor.acted_this_round = true;
    return this.afterAction(actor);
  }

  doAbility(actor, target) {
    if (actor.used_active || !actor.unit_data?.ability) return false;

    const abilityId = actor.unit_data.ability;
    actor.used_active = true;
    actor.acted_this_round = true;

    this.log.push({
      type: 'ability',
      actorName: actor.unit_name,
      message: `used ${abilityId.split(' ')[0]}`
    });

    // Basic ability effects (expandable)
    if (abilityId.includes('purge')) {
      if (target) {
        target.burn = 0;
        target.poison = 0;
      }
    } else if (abilityId.includes('raise_dead') && target) {
      // Simple resurrection simulation
      if (!target.alive && target.unit_data?.tags?.includes('Undead')) {
        target.alive = true;
        target.battle_hp = Math.floor(target.max_hp * 0.5);
      }
    } else if (abilityId.includes('mark_of_ash') && target) {
      target.burn = Math.max(target.burn, 25);
    }

    return this.afterAction(actor);
  }

  skipTurn(actor) {
    this.log.push({ type: 'skip', actorName: actor.unit_name });
    actor.acted_this_round = true;
    return this.afterAction(actor);
  }

  // ==================== TURN MANAGEMENT ====================

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
      const burnDmg = Math.floor(unit.max_hp * (unit.burn / 100));
      unit.battle_hp = Math.max(0, unit.battle_hp - burnDmg);
      this.log.push({ type: 'status', actorName: unit.unit_name, message: `burned for ${burnDmg}` });
      unit.burn = 0;
    }
    if (unit.poison > 0) {
      const poisonDmg = Math.floor(unit.max_hp * 0.08);
      unit.battle_hp = Math.max(0, unit.battle_hp - poisonDmg);
      this.log.push({ type: 'status', actorName: unit.unit_name, message: `poisoned for ${poisonDmg}` });
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

  // ==================== TARGETING & AI ====================

  getValidTargets(actor) {
    const action = actor.unit_data?.action || {};
    const range = action.range ?? 1;
    const targetType = action.target_type ?? 'enemy';

    return this.combatants.filter(t => {
      if (!t.alive) return false;
      if (targetType === 'ally') return t.side === actor.side && t.id !== actor.id;
      if (targetType === 'enemy') {
        if (t.side === actor.side) return false;
        if (range === 1) {
          return Math.abs(cellRow(actor.cellIndex) - cellRow(t.cellIndex)) <= 1;
        }
        return true;
      }
      return false;
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

  aiTurn() {
    const actor = this.currentActor();
    if (!actor || actor.side !== 'enemy') return null;

    const validTargets = this.getValidTargets(actor);

    // Prioritize healer if low HP
    if (actor.unit_data?.type === 'healer') {
      const allyToHeal = validTargets.find(t => t.side === 'enemy' && t.battle_hp < t.max_hp * 0.5);
      if (allyToHeal) {
        this.executeAction(actor, allyToHeal, 'attack');
        return;
      }
    }

    // Use ability if available and good condition
    if (!actor.used_active && actor.unit_data?.ability && validTargets.length > 0) {
      this.executeAction(actor, validTargets[0], 'ability');
      return;
    }

    // Normal attack
    if (validTargets.length > 0) {
      const target = validTargets.reduce((a, b) => a.battle_hp < b.battle_hp ? a : b);
      this.executeAction(actor, target, 'attack');
    } else {
      this.skipTurn(actor);
    }
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