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
      console.log(`[BattleSystem] Player unit ${idx}:`, JSON.stringify(u, null, 2));
      const cellIdx = placement[u.id] ?? this.combatants.length;
      this.combatants.push(this.createCombatant(u, 'player', cellIdx));
    });

    enemyUnits.forEach((e, i) => {
      const col = i % COLS;
      const row = Math.min(Math.floor(i / COLS), ROWS - 1);
      this.combatants.push(this.createCombatant(e, 'enemy', cellIndex(row, col)));
    });

    // Apply on_battle_start passives after all combatants exist
    this.applyBattleStartPassives();
  }

  createCombatant(unit, side, cellIndex) {
    const rawData = unit.unit_data || unit;
    const data = { ...rawData };

    if (data.action && typeof data.action === 'object') {
      data.action_power = data.action.value;
      data.range = data.action.range;
      data.target_type = data.action.target_type;
    }

    console.log(`[BattleSystem] Created ${side}: ${unit.unit_name || data.name} | type=${data.type} | target_type=${data.target_type} | power=${data.action_power}`);

    return {
      id: unit.id || `enemy_${Math.random().toString(36).slice(2)}`,
      _rosterId: side === 'player' ? (unit._rosterId || unit.id || null) : null,
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
      shield: 0,
      burn: 0,
      poison: 0,
    };
  }

  // ─── Battle-Start Passives ────────────────────────────────────────────────

  applyBattleStartPassives() {
    for (const c of this.combatants) {
      const passive = c.unit_data?.passive || c.unit_data?.passive_ability;
      if (!passive) continue;

      // vitality: all allies gain HP
      if (passive.startsWith('vitality')) {
        const bonusMap = { 'vitality 1': 5, 'vitality 2': 15, 'vitality 3': 25 };
        const bonus = bonusMap[passive] ?? 0;
        if (!bonus) continue;
        const allies = this.combatants.filter(a => a.side === c.side);
        for (const ally of allies) {
          ally.battle_hp += bonus;
          ally.max_hp    += bonus;
        }
        console.log(`[Passive] ${c.unit_name} Vitality: +${bonus} HP to ${allies.length} allies`);
        this.log.push({ type: 'passive', actorName: c.unit_name, targetName: 'all allies', value: bonus, passive: 'Vitality' });
      }

      // hardened: self gains bonus armor
      if (passive.startsWith('hardened')) {
        const bonusMap = { 'hardened 1': 3, 'hardened 2': 6 };
        const bonus = bonusMap[passive] ?? 0;
        if (!bonus) continue;
        c.armor += bonus;
        console.log(`[Passive] ${c.unit_name} Hardened: +${bonus} armor`);
        this.log.push({ type: 'passive', actorName: c.unit_name, targetName: c.unit_name, value: bonus, passive: 'Hardened' });
      }

      // bone_shield: self starts with a damage-absorbing shield
      if (passive.startsWith('bone_shield')) {
        const bonusMap = { 'bone_shield 1': 30, 'bone_shield 2': 60 };
        const bonus = bonusMap[passive] ?? 0;
        if (!bonus) continue;
        c.shield = bonus;
        console.log(`[Passive] ${c.unit_name} Bone Shield: ${bonus} shield`);
        this.log.push({ type: 'passive', actorName: c.unit_name, targetName: c.unit_name, value: bonus, passive: 'Bone Shield' });
      }

      // rooted: all enemies lose initiative
      if (passive.startsWith('rooted')) {
        const bonusMap = { 'rooted 1': 5, 'rooted 2': 12 };
        const debuff = bonusMap[passive] ?? 0;
        if (!debuff) continue;
        const enemies = this.combatants.filter(e => e.side !== c.side);
        for (const enemy of enemies) {
          enemy.initiative = Math.max(0, enemy.initiative - debuff);
        }
        console.log(`[Passive] ${c.unit_name} Rooted: -${debuff} initiative to ${enemies.length} enemies`);
        this.log.push({ type: 'passive', actorName: c.unit_name, targetName: 'all enemies', value: debuff, passive: 'Rooted' });
      }
    }
  }

  // ─── Targeting ───────────────────────────────────────────────────────────

  isHealer(unit) {
    const data = unit.unit_data || unit;
    const targetType = data.target_type || (data.action && data.action.target_type);
    const result = targetType === 'ally';
    console.log(`[BattleSystem] isHealer(${unit.unit_name}) = ${result} | target_type=${targetType} | type=${data.type}`);
    return result;
  }

  getValidTargets(actor) {
    console.log(`\n[BattleSystem] getValidTargets for ${actor.unit_name}`);
    const isHeal = this.isHealer(actor);

    const targets = this.combatants.filter(t => {
      if (!t.alive) return false;
      if (isHeal) {
        return t.side === actor.side;
      } else {
        if (t.side === actor.side) return false;
        const range = actor.unit_data?.range ?? 1;
        if (range === 1) {
          const targetSide = t.side;
          const frontCol = targetSide === 'enemy' ? 0 : 1;
          const backCol  = targetSide === 'enemy' ? 1 : 0;

          const targetSideCombatants = this.combatants.filter(c => c.side === targetSide && c.alive);
          const frontColAlive = targetSideCombatants.filter(c => cellCol(c.cellIndex) === frontCol);
          const reachableCol = frontColAlive.length > 0 ? frontCol : backCol;
          return cellCol(t.cellIndex) === reachableCol;
        }
        return true;
      }
    });

    console.log(`[BattleSystem] Found ${targets.length} valid targets`);
    return targets;
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

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

      // Absorb damage with shield first
      if (target.shield > 0) {
        const absorbed = Math.min(target.shield, value);
        target.shield -= absorbed;
        value = Math.max(0, value - absorbed);
        console.log(`[Shield] ${target.unit_name} absorbed ${absorbed} damage (shield left: ${target.shield})`);
      }

      const oldHp = target.battle_hp;
      target.battle_hp = Math.max(0, target.battle_hp - value);
      if (target.battle_hp <= 0) target.alive = false;

      this.log.push({
        type: 'action',
        actorName: actor.unit_name,
        targetName: target.unit_name,
        value,
        killed: !target.alive
      });
      console.log(`✅ DAMAGE: ${value} to ${target.unit_name}`);

      // Mithrail's Light passive
      if (actor.unit_data?.passive === 'mithrails_light 1' ||
          actor.unit_data?.passive_ability === 'mithrails_light 1') {
        this.applyMithrailsLight(actor, value);
      }
    }

    actor.acted_this_round = true;
    return this.afterAction(actor);
  }

  applyMithrailsLight(actor, damageDealt) {
    const healAmount = Math.floor(damageDealt * 0.25);
    if (healAmount <= 0) return;

    const allies = this.combatants.filter(c => c.side === actor.side && c.alive);
    if (allies.length === 0) return;

    const lowest = allies.reduce((a, b) => a.battle_hp < b.battle_hp ? a : b);
    const oldHp = lowest.battle_hp;
    lowest.battle_hp = Math.min(lowest.max_hp, lowest.battle_hp + healAmount);
    const actualHeal = lowest.battle_hp - oldHp;

    this.log.push({
      type: 'passive',
      actorName: actor.unit_name,
      targetName: lowest.unit_name,
      value: actualHeal,
      passive: "Mithrail's Light"
    });

    console.log(`✨ MITHRAIL'S LIGHT: +${actualHeal} HP to ${lowest.unit_name}`);
  }

  calcHeal(actor) {
    const data = actor.unit_data || actor;
    const power = data.action_power ?? (data.action && data.action.value) ?? 15;
    console.log(`[calcHeal] Power: ${power}`);
    return Math.floor(power * 1.3);
  }

  calcDamage(attacker, target) {
    const data = attacker.unit_data || attacker;
    const power = data.action_power ?? (data.action && data.action.value) ?? 12;
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

  // ─── Round Management ─────────────────────────────────────────────────────

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
    const enemyAlive  = this.combatants.some(c => c.side === 'enemy'  && c.alive);
    if (!playerAlive) return 'enemy';
    if (!enemyAlive)  return 'player';
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