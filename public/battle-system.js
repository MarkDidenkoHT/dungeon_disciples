import { filterByTagRules } from '../utils/tag-rules.js';
import { UNIT_ABILITIES } from '../data/unit_abilities.js';
import { runTrigger, calcDamageWithPassives, getAbilityTargets, executeActiveAbility } from './passive-processor.js';

const ROWS = 3;
const COLS = 2;

export function cellIndex(row, col) { return row * COLS + col; }
export function cellRow(i) { return Math.floor(i / COLS); }
export function cellCol(i) { return i % COLS; }

export class BattleSystem {
  constructor(playerUnits, enemyUnits, placement) {
    this.combatants = [];
    this.round      = 1;
    this.log        = [];
    this.done       = false;
    this.winner     = null;

    this.initCombatants(playerUnits, enemyUnits, placement);
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
    // An EMPTY `unit_data` must not shadow a flat unit: a wrapper with no keys
    // means the stats are on the unit itself (PvE encounters), not in it.
    const rawData = (unit.unit_data && Object.keys(unit.unit_data).length) ? unit.unit_data : unit;
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
      size:       data.size ?? 'tile',
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
    runTrigger(trigger, { engine: this, UNIT_ABILITIES, ...ctx });
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
      return getAbilityTargets(actor, this.combatants, UNIT_ABILITIES);
    }

    const isHeal     = this.isHealer(actor);
    const actionKey  = this.getActionKey(actor);

    if (actionKey === 'sacrifice') {
      return this.combatants.filter(t => t.alive && t.side === actor.side && t.id !== actor.id);
    }

    return this.combatants.filter(t => {
      if (!t.alive) return false;

      if (isHeal) {
        if (t.side !== actor.side) return false;
        const candidates = filterByTagRules([t], actionKey);
        return candidates.length > 0;
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
    return calcDamageWithPassives(actor, target, UNIT_ABILITIES);
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
    if (actionType === 'sacrifice') return this.doSacrifice(actor, target);
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
        let remaining = dmg;

        remaining = this.applyMartyrdomRedirect(actor, target, remaining);

        if (remaining > 0) {
          target.battle_hp = Math.max(0, target.battle_hp - remaining);
          const dead = target.battle_hp <= 0;

          if (dead) {
            target.alive = false;
            this.applyOnDeathPassives(target);
          }

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
      const defs = this.resolveAllPassiveDefs(c);
      const interceptDef = defs.find(d => d.trigger === 'intercept');
      if (!interceptDef) return false;
      if (cellCol(c.cellIndex) !== frontCol) return false;
      if (cellRow(c.cellIndex) !== targetRow) return false;
      return interceptDef.params?.intercept_chance_pct != null;
    });

    for (const protector of protectors) {
      const def = this.resolveAllPassiveDefs(protector).find(d => d.trigger === 'intercept');
      const chance = (def.params.intercept_chance_pct ?? 0) / 100;
      if (Math.random() < chance) {
        this.pushLog({ type: 'intercept', passive: def.name, actorName: protector.unit_name, actorCell: protector.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex });
        return protector;
      }
    }

    return target;
  }

  applyMartyrdomRedirect(actor, target, dmg) {
    const COLS = 2;
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
    if (!key || !UNIT_ABILITIES) return null;
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
      const def = UNIT_ABILITIES[k];
      if (def) return def;
    }
    return null;
  }

  resolveAllPassiveDefs(unit) {
    const key = unit.unit_data?.passive || unit.unit_data?.passive_ability;
    if (!key || !UNIT_ABILITIES) return [];
    const keys = Array.isArray(key) ? key : [key];
    return keys.map(k => UNIT_ABILITIES[k]).filter(Boolean);
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

  doSacrifice(actor, target) {
    if (!target || target.id === actor.id) {
      actor.acted_this_round = true;
      return this.afterAction(actor);
    }
    const raw    = this.calcHeal(actor);
    const factor = 1 - (target._healing_reduction ?? 0) / 100;
    const heal   = Math.floor(Math.min(raw * factor, target.max_hp - target.battle_hp));
    target.battle_hp += heal;
    this.fireTrigger('on_heal', { actor, target, dmg: heal, dying: null });
    this.pushLog({ type: 'action', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: heal, heal: true });
    const selfDmg = Math.floor(heal / 2);
    if (selfDmg > 0) {
      actor.battle_hp = Math.max(0, actor.battle_hp - selfDmg);
      const dead = actor.battle_hp <= 0;
      if (dead) { actor.alive = false; this.applyOnDeathPassives(actor); }
      this.pushLog({ type: 'passive', passive: 'Sacrifice', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, value: selfDmg, heal: false });
    }
    actor.acted_this_round = true;
    return this.afterAction(actor);
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

    executeActiveAbility(actor, target, this.combatants, UNIT_ABILITIES, this);

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

  aiTurn() {
    const actor = this.currentActor();
    if (!actor || actor.side !== 'enemy') return null;

    const hasAbility = !!(actor.unit_data?.ability || actor.unit_data?.active_ability);

    if (hasAbility && !actor.used_active) {
      const targets = this.getValidTargets(actor, true);
      if (targets.length > 0) return this.doAbility(actor, targets[0]);
    }

    const targets = this.getValidTargets(actor);
    if (!targets.length) return this.skipTurn(actor);
    const target = targets.reduce((a, b) => a.battle_hp < b.battle_hp ? a : b);
    this.executeAction(actor, target, 'attack');
  }

  getState() {
    return { combatants: this.combatants, round: this.round, log: this.log, done: this.done, winner: this.winner };
  }

  pushLog(entry) { this.log.push(entry); }
}