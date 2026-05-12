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

    console.log('[BattleSystem] === BATTLE INITIALIZED ===');
    this.initCombatants(playerUnits, enemyUnits, placement);
  }

  initCombatants(playerUnits, enemyUnits, placement) {
    console.log(`[BattleSystem] Player units: ${playerUnits.length} | Enemies: ${enemyUnits.length}`);
    
    playerUnits.forEach((u, idx) => {
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
    let data = unit.unit_data || unit;

    // Normalize action object
    if (data.action && typeof data.action === 'object') {
      data.action_value = data.action.value;
      data.action_range = data.action.range;
      data.target_type = data.action.target_type;
    }

    console.log(`[BattleSystem] Created ${side}: ${unit.unit_name || data.name} | type=${data.type} | target_type=${data.target_type} | action_value=${data.action_value || data.action_power}`);

    return {
      id: unit.id || `enemy_${Math.random().toString(36).slice(2)}`,
      unit_name: unit.unit_name || data.name || 'Unknown',
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

  isHealer(unit) {
    const data = unit.unit_data || unit;
    const targetType = data.target_type || (data.action && data.action.target_type);
    const actionType = data.type;

    const result = Boolean(
      actionType === 'healer' || 
      targetType === 'ally' ||
      (data.action && data.action.target_type === 'ally')
    );

    console.log(`[BattleSystem] isHealer(${unit.unit_name}) = ${result} | type=${actionType} | target_type=${targetType}`);
    return result;
  }

  getValidTargets(actor) {
    console.log(`\n[BattleSystem] getValidTargets for ${actor.unit_name}`);
    const isHeal = this.isHealer(actor);

    const targets = this.combatants.filter(t => {
      if (!t.alive) return false;
      if (isHeal) {
        return t.side === actor.side && t.id !== actor.id;
      } else {
        if (t.side === actor.side) return false;
        const range = actor.unit_data?.action_range ?? actor.unit_data?.range ?? 1;
        if (range === 1) {
          return Math.abs(cellRow(actor.cellIndex) - cellRow(t.cellIndex)) <= 1;
        }
        return true;
      }
    });

    console.log(`[BattleSystem] Found ${targets.length} valid targets`);
    return targets;
  }

  executeAction(actor, target = null, actionType = 'attack') {
    console.log(`\n=== EXECUTE ACTION === ${actionType} by ${actor.unit_name} on ${target ? target.unit_name : 'null'}`);

    if (actionType === 'defend') return this.doDefend(actor);
    if (actionType === 'ability') return this.doAbility(actor, target);

    if (!target) {
      console.error("[BattleSystem] No target!");
      return false;
    }

    const isHeal = this.isHealer(actor);
    console.log(`Is heal action? ${isHeal}`);

    let value;
    if (isHeal) {
      value = this.calcHeal(actor);
      const oldHp = target.battle_hp;
      target.battle_hp = Math.min(target.max_hp, target.battle_hp + value);
      const actualHeal = target.battle_hp - oldHp;

      this.log.push({ 
        type: 'action', 
        actorName: actor.unit_name, 
        targetName: target.unit_name, 
        value: actualHeal, 
        heal: true 
      });
      console.log(`✅ HEAL SUCCESS: +${actualHeal} HP to ${target.unit_name}`);
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
    const data = actor.unit_data || actor;
    const power = data.action_value ?? data.action?.value ?? data.action_power ?? 15;
    console.log(`[calcHeal] Using power: ${power}`);
    return Math.floor(power * 1.3);
  }

  calcDamage(attacker, target) {
    const data = attacker.unit_data || attacker;
    const power = data.action_value ?? data.action?.value ?? data.action_power ?? 12;
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