const { runTrigger, calcDamageWithPassives, getAbilityTargets, executeActiveAbility } = require('./passive-processor');

let _UNIT_ABILITIES = null;
async function getAbilities() {
  if (_UNIT_ABILITIES) return _UNIT_ABILITIES;
  try {
    const m = await import('../data/unit_abilities.js');
    _UNIT_ABILITIES = m.UNIT_ABILITIES;
  } catch {
    _UNIT_ABILITIES = {};
  }
  return _UNIT_ABILITIES;
}

const TAG_RULES = {
  heal: { targetExcludeTags: ['Construct'] },
  repair: { targetRequireTags: ['Construct'] },
  'mend flesh': { targetRequireTags: ['Zombie'] },
};

function unitHasTag(unit, tag) {
  const tags = unit?.unit_data?.tags ?? unit?.tags ?? [];
  return tags.includes(tag);
}

function unitHasAnyTag(unit, tags) {
  return tags.some(tag => unitHasTag(unit, tag));
}

function filterByTagRules(units, actionKey) {
  if (!actionKey) return units;
  const rules = TAG_RULES[String(actionKey).toLowerCase()];
  if (!rules) return units;
  return units.filter(unit => {
    if (rules.targetRequireTags && !unitHasAnyTag(unit, rules.targetRequireTags)) return false;
    if (rules.targetExcludeTags && unitHasAnyTag(unit, rules.targetExcludeTags)) return false;
    return true;
  });
}

const ROWS = 3;
const COLS = 2;

function cellIndex(row, col) { return row * COLS + col; }
function cellRow(i) { return Math.floor(i / COLS); }
function cellCol(i) { return i % COLS; }

class BattleEngine {
  constructor(state) {
    this.ABILITIES = null;
    if (state) {
      this.combatants = state.combatants;
      this.round      = state.round;
      this.log        = state.log || [];
      this.done       = state.done || false;
      this.winner     = state.winner || null;
    } else {
      this.combatants = [];
      this.round      = 1;
      this.log        = [];
      this.done       = false;
      this.winner     = null;
    }
  }

  async init() {
    this.ABILITIES = await getAbilities();
  }

  static async fromSetup(playerUnits, enemyUnits, placement) {
    const engine = new BattleEngine(null);
    await engine.init();
    engine.initCombatants(playerUnits, enemyUnits, placement);
    return engine;
  }

  static async fromSnapshot(snap) {
    const engine = new BattleEngine(snap);
    await engine.init();
    return engine;
  }

  initCombatants(playerUnits, enemyUnits, placement) {
    playerUnits.forEach((u, i) => {
      const cellIdx = placement[u.id] ?? i;
      this.combatants.push(this.createCombatant(u, 'player', cellIdx));
    });
    enemyUnits.forEach((e, i) => {
      const col = i % COLS;
      const row = Math.min(Math.floor(i / COLS), ROWS - 1);
      this.combatants.push(this.createCombatant(e, 'enemy', cellIndex(row, col)));
    });
    this.fireTrigger('on_battle_start', {});
  }

  createCombatant(unit, side, cellIdx) {
    const rawData = unit.unit_data || unit;
    const data    = { ...rawData };
    if (data.action && typeof data.action === 'object') {
      data.action_power = data.action.value;
      data.range        = data.action.range;
      data.target_type  = data.action.target_type;
    }
    const uniqueId = `${side}:${cellIdx}`;
    return {
      id:         uniqueId,
      _rosterId:  side === 'player' ? (unit._rosterId || unit.id || null) : null,
      _sourceId:  unit.id || null,
      unit_name:  unit.unit_name || data.name || 'Unknown',
      unit_data:  data,
      side,
      cellIndex:  cellIdx,
      battle_hp:  data.hp ?? 50,
      max_hp:     data.hp ?? 50,
      armor:      data.armor ?? 0,
      initiative: data.initiative ?? 40,
      alive:              true,
      acted_this_round:   false,
      used_active:        false,
      defend_armor_bonus: 0,
      dot_dmg:       0,
      _hot:          0,
      _stacks:       {},
      _flags:        {},
      _dmg_mult:          1,
      _healing_reduction: 0,
      _granted_buffs: [],
    };
  }

  fireTrigger(trigger, ctx) {
    runTrigger(trigger, { engine: this, UNIT_ABILITIES: this.ABILITIES, ...ctx });
  }

  recordGrantedBuff(source, type, targets, value) {
    source._granted_buffs.push({ type, targetIds: targets.map(t => t.id), value });
  }

  revokeGrantedBuffs(dying) {
    for (const buff of dying._granted_buffs) {
      for (const targetId of buff.targetIds) {
        const target = this.combatants.find(c => c.id === targetId);
        if (!target) continue;
        if (buff.type === 'max_hp') {
          target.max_hp    = Math.max(1, target.max_hp - buff.value);
          target.battle_hp = Math.min(target.battle_hp, target.max_hp);
        } else if (buff.type === 'armor') {
          target.armor = Math.max(0, target.armor - buff.value);
        } else if (buff.type === 'initiative') {
          target.initiative = Math.max(0, target.initiative + buff.value);
        }
      }
    }
    dying._granted_buffs = [];
  }

  applyOnDeathPassives(dying) {
    this.revokeGrantedBuffs(dying);
    this.fireTrigger('on_death', { dying, actor: dying, target: null, dmg: 0 });
  }

  getActionKey(unit) {
    const data = unit.unit_data || unit;
    const raw  = data.action;
    if (!raw) return null;
    if (typeof raw === 'string') return raw.toLowerCase();
    if (typeof raw === 'object' && raw.id) return raw.id.toLowerCase();
    return null;
  }

  isHealer(unit) {
    const data = unit.unit_data || unit;
    const tt   = data.target_type || data.action?.target_type;
    return tt === 'ally';
  }

  getValidTargets(actor, forAbility = false) {
    if (forAbility) {
      return getAbilityTargets(actor, this.combatants, this.ABILITIES);
    }
    const isHeal    = this.isHealer(actor);
    const actionKey = this.getActionKey(actor);
    return this.combatants.filter(t => {
      if (!t.alive) return false;
      if (isHeal) {
        if (t.side !== actor.side) return false;
        return filterByTagRules([t], actionKey).length > 0;
      }
      if (t.side === actor.side) return false;
      const range = actor.unit_data?.range ?? 1;
      if (range === 1) {
        const frontCol   = t.side === 'enemy' ? 0 : 1;
        const backCol    = t.side === 'enemy' ? 1 : 0;
        const frontAlive = this.combatants.filter(c => c.side === t.side && c.alive && cellCol(c.cellIndex) === frontCol);
        const reachable  = frontAlive.length > 0 ? frontCol : backCol;
        return cellCol(t.cellIndex) === reachable;
      }
      return true;
    });
  }

  calcDamage(actor, target) {
    return calcDamageWithPassives(actor, target, this.ABILITIES);
  }

  calcHeal(actor) {
    const data  = actor.unit_data || actor;
    const power = data.action_power ?? data.action?.value ?? 15;
    return Math.floor(power * 1.3);
  }

  executeAction(actor, target = null, actionType = 'attack') {
    this.fireTrigger('on_turn_start', { actor, target: actor, dmg: 0, dying: null });

    if (actionType === 'defend')  return this.doDefend(actor);
    if (actionType === 'ability') return this.doAbility(actor, target);
    if (!target) return false;

    if (this.isHealer(actor)) {
      const raw    = this.calcHeal(actor);
      const factor = 1 - (target._healing_reduction ?? 0) / 100;
      const heal   = Math.floor(Math.min(raw * factor, target.max_hp - target.battle_hp));
      target.battle_hp += heal;
      this.fireTrigger('on_heal', { actor, target, dmg: heal, dying: null });
      this.pushLog({ type: 'action', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: heal, heal: true });
    } else {
      target = this.resolveProtectorIntercept(actor, target);

      const dmg = this.calcDamage(actor, target);
      if (dmg > 0) {
        let remaining = this.applyMartyrdomRedirect(actor, target, dmg);
        if (remaining > 0) {
          target.battle_hp = Math.max(0, target.battle_hp - remaining);
          const dead = target.battle_hp <= 0;
          if (dead) { target.alive = false; this.applyOnDeathPassives(target); }
          this.pushLog({ type: 'action', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: remaining, killed: !target.alive });
          this.fireTrigger('on_hit', { actor, target, dmg: remaining, dying: null });
          this.fireTrigger('on_hit_received', { actor, target, dmg: remaining, dying: null });
          if (dead && !target.alive) this.fireTrigger('on_kill', { actor, target, dmg: remaining, dying: null });
        } else {
          this.pushLog({ type: 'action', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: 0, killed: false });
        }
      } else {
        this.pushLog({ type: 'action', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: 0, killed: false });
      }
      this.applyDoTs(target);
    }
    actor.acted_this_round = true;
    return this.afterAction(actor);
  }

  resolveProtectorIntercept(actor, target) {
    const targetCol = cellCol(target.cellIndex);
    const targetRow = cellRow(target.cellIndex);
    const frontCol  = target.side === 'enemy' ? 0 : 1;
    const backCol   = target.side === 'enemy' ? 1 : 0;

    if (targetCol !== backCol) return target;

    const protectors = this.combatants.filter(c => {
      if (!c.alive || c.side !== target.side || c.id === target.id) return false;
      const def = this.resolvePassiveDef(c);
      if (!def || def.trigger !== 'intercept') return false;
      if (cellCol(c.cellIndex) !== frontCol) return false;
      if (cellRow(c.cellIndex) !== targetRow) return false;
      return (def.params?.intercept_chance_pct != null);
    });

    for (const protector of protectors) {
      const def = this.resolvePassiveDef(protector);
      const chance = (def.params.intercept_chance_pct ?? 0) / 100;
      if (Math.random() < chance) {
        this.pushLog({ type: 'passive', passive: def.name, actorName: protector.unit_name, actorCell: protector.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: 0, heal: false });
        return protector;
      }
    }

    return target;
  }

  applyMartyrdomRedirect(actor, target, dmg) {
    const targetRow = cellRow(target.cellIndex);
    const targetCol = cellCol(target.cellIndex);

    const martyrs = this.combatants.filter(c => {
      if (!c.alive || c.side !== target.side || c.id === target.id) return false;
      if (!(c.martyrdom_pct > 0)) return false;
      const mr = cellRow(c.cellIndex);
      const mc = cellCol(c.cellIndex);
      return (Math.abs(mr - targetRow) <= 1 && mc === targetCol) ||
             (mr === targetRow && Math.abs(mc - targetCol) === 1);
    });

    if (martyrs.length === 0) return dmg;

    let remaining = dmg;
    for (const martyr of martyrs) {
      const redirected = Math.floor(dmg * martyr.martyrdom_pct / 100);
      if (redirected <= 0) continue;
      remaining -= redirected;
      martyr.battle_hp = Math.max(0, martyr.battle_hp - redirected);
      const dead = martyr.battle_hp <= 0;
      if (dead) { martyr.alive = false; this.applyOnDeathPassives(martyr); }
      this.pushLog({ type: 'passive', passive: 'Martyrdom', actorName: martyr.unit_name, actorCell: martyr.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: redirected, heal: false });
    }

    return Math.max(0, remaining);
  }

  resolvePassiveDef(unit) {
    const key = unit.unit_data?.passive || unit.unit_data?.passive_ability;
    if (!key || !this.ABILITIES) return null;
    return this.ABILITIES[key] ?? null;
  }

  applyDoTs(unit) {
    if (!unit.alive) return;
    if (unit.dot_dmg > 0) {
      unit.battle_hp = Math.max(0, unit.battle_hp - unit.dot_dmg);
      this.pushLog({ type: 'passive', passive: 'DoT', actorName: '💀', targetName: unit.unit_name, targetCell: unit.cellIndex, value: unit.dot_dmg, heal: false });
      unit.dot_dmg = 0;
      if (unit.battle_hp <= 0) { unit.alive = false; this.applyOnDeathPassives(unit); }
    }
    if (unit._hot > 0) {
      const actual = Math.min(unit._hot, unit.max_hp - unit.battle_hp);
      unit.battle_hp += actual;
      this.pushLog({ type: 'passive', passive: 'Renew', actorName: '💚', targetName: unit.unit_name, targetCell: unit.cellIndex, value: actual, heal: true });
      unit._hot = 0;
    }
  }

  doDefend(actor) {
    actor.defend_armor_bonus = 25;
    actor.acted_this_round   = true;
    this.pushLog({ type: 'defend', actorName: actor.unit_name, actorCell: actor.cellIndex, message: 'defended (+25 armor this round)' });
    return this.afterAction(actor);
  }

  doAbility(actor, target) {
    const key = actor.unit_data?.ability || actor.unit_data?.active_ability;
    if (actor.used_active || !key) {
      actor.acted_this_round = true;
      return this.afterAction(actor);
    }
    actor.used_active      = true;
    actor.acted_this_round = true;
    executeActiveAbility(actor, target, this.combatants, this.ABILITIES, this);
    return this.afterAction(actor);
  }

  skipTurn(actor) {
    this.pushLog({ type: 'skip', actorName: actor.unit_name, actorCell: actor.cellIndex });
    actor.acted_this_round = true;
    return this.afterAction(actor);
  }

  afterAction(actor) {
    const win = this.checkWin();
    if (win) { this.done = true; this.winner = win; return true; }
    if (this.getActingOrder().length === 0) this.advanceRound();
    return true;
  }

  advanceRound() {
    for (const c of this.combatants) {
      c.acted_this_round   = false;
      c.defend_armor_bonus = 0;
      c.dot_dmg = 0;
    }
    this.round++;
    this.pushLog({ type: 'round', round: this.round });
  }

  checkWin() {
    const pa = this.combatants.some(c => c.side === 'player' && c.alive);
    const ea = this.combatants.some(c => c.side === 'enemy'  && c.alive);
    if (!pa) return 'enemy';
    if (!ea) return 'player';
    return null;
  }

  getActingOrder() {
    return this.combatants
      .filter(c => c.alive && !c.acted_this_round)
      .sort((a, b) => b.initiative - a.initiative);
  }

  currentActor() { return this.getActingOrder()[0] ?? null; }

  runAiTurns() {
    const newLog = [];
    while (!this.done) {
      const actor = this.currentActor();
      if (!actor || actor.side !== 'enemy') break;
      const hasAbility = !!(actor.unit_data?.ability || actor.unit_data?.active_ability);
      if (hasAbility && !actor.used_active) {
        const targets = this.getValidTargets(actor, true);
        if (targets.length > 0) { this.doAbility(actor, targets[0]); newLog.push(...this.log.slice(-1)); continue; }
      }
      const targets = this.getValidTargets(actor);
      if (!targets.length) { this.skipTurn(actor); }
      else {
        const target = targets.reduce((a, b) => a.battle_hp < b.battle_hp ? a : b);
        this.executeAction(actor, target, 'attack');
      }
      newLog.push(...this.log.slice(-(this.log.length)));
    }
    return newLog;
  }

  getSnapshot() {
    return {
      combatants: this.combatants,
      round:      this.round,
      log:        this.log,
      done:       this.done,
      winner:     this.winner,
    };
  }

  getBattleData() {
    return {
      round:  this.round,
      done:   this.done,
      winner: this.winner,
      units:  this.combatants.map(c => ({
        id:               c.id,
        side:             c.side,
        cellIndex:        c.cellIndex,
        alive:            c.alive,
        battle_hp:        c.battle_hp,
        acted_this_round: c.acted_this_round,
        buffs: {
          dot_dmg:        c.dot_dmg,
          _hot:           c._hot,
          _stacks:        c._stacks,
          _flags:         c._flags,
          _granted_buffs: c._granted_buffs,
        },
      })),
    };
  }

  static async rehydrate(setup, battleData) {
    const engine = await BattleEngine.fromSetup(setup.playerUnits, setup.enemies, setup.placement);
    const stateById = {};
    for (const u of battleData.units) stateById[u.id] = u;
    for (const c of engine.combatants) {
      const s = stateById[c.id];
      if (!s) continue;
      c.alive              = s.alive;
      c.battle_hp          = s.battle_hp;
      c.cellIndex          = s.cellIndex;
      c.acted_this_round   = s.acted_this_round;
      const b              = s.buffs || {};
      c.dot_dmg            = b.dot_dmg        ?? 0;
      c._hot               = b._hot           ?? 0;
      c._stacks            = b._stacks        || {};
      c._flags             = b._flags         || {};
      c._granted_buffs     = b._granted_buffs || [];
    }
    engine.round  = battleData.round;
    engine.done   = battleData.done;
    engine.winner = battleData.winner;
    engine.log    = [];
    return engine;
  }

  pushLog(entry) { this.log.push(entry); }
}

module.exports = { BattleEngine };