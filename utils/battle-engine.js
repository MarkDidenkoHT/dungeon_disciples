const { runTrigger, calcDamageWithPassives, getAbilityTargets, executeActiveAbility } = require('./passive-processor');
const { filterByTagRules } = require('./tag-rules.js');

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
      this.pendingRoundEffects = state.pendingRoundEffects || [];
    } else {
      this.combatants = [];
      this.round      = 1;
      this.log        = [];
      this.done       = false;
      this.winner     = null;
      this.pendingRoundEffects = [];
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
      const cellIdx = e.cell ?? cellIndex(Math.min(Math.floor(i / COLS), ROWS - 1), i % COLS);
      this.combatants.push(this.createCombatant(e, 'enemy', cellIdx));
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
    const maxHp = Number.isFinite(Number(data.max_hp)) && Number(data.max_hp) > 0
      ? Number(data.max_hp)
      : Number.isFinite(Number(data.hp)) && Number(data.hp) > 0
        ? Number(data.hp)
        : 50;
    const currentHp = Number.isFinite(Number(data.current_hp))
      ? Number(data.current_hp)
      : maxHp;
    const battleHp = Math.max(0, Math.min(currentHp, maxHp));
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
      battle_hp:  battleHp,
      max_hp:     maxHp,
      armor:      data.armor ?? 0,
      initiative: data.initiative ?? 40,
      alive:      data.alive !== false && battleHp > 0,
      acted_this_round:   false,
      used_active:        false,
      defend_armor_bonus: 0,
      dot_dmg:            0,
      _hot:               0,
      _stacks:            {},
      _flags:             {},
      _dmg_mult:          1,
      _healing_reduction: 0,
      _deferred_dmg:      0,
      _debuff_reduction:  0,
      _granted_buffs:     [],
      _fear_dmg_reduction: 0,
      _terror_reduction:  0,
      _terror_rounds:     0,
      _sanctuary_rounds:  0,
      _sanctuary_resist:  null,
      _parry_available:   false,
      _aegis_armor:       0,
      _aegis_resists:     {},
      _invulnerable:      false,
      _untargetable:      false,
      _unity_host_id:     null,
      _unity_bonded_id:   null,
      _mothers_kiss:      false,
      _sorrow_source_ids: [],
      _reanimate_pending: null,
      _stun_rounds: 0,
      _stun_initiative_lost: 0,
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
          target.initiative = Math.max(0, target.initiative - buff.value);
        }
      }
    }
    dying._granted_buffs = [];
  }
  applyOnDeathPassives(dying) {
    this.revokeGrantedBuffs(dying);
    this.fireTrigger('on_death', { dying, actor: dying, target: null, dmg: 0 });
    const bonded = this.combatants.find(c => c._unity_host_id === dying.id && c.alive);
    if (bonded) {
      bonded.alive = false;
      this.pushLog({ type: 'passive', passive: 'Unity', actorName: bonded.unit_name, actorCell: bonded.cellIndex, targetName: bonded.unit_name, targetCell: bonded.cellIndex, message: `${bonded.unit_name} perishes with their host.` });
      this.revokeGrantedBuffs(bonded);
      this.fireTrigger('on_death', { dying: bonded, actor: bonded, target: null, dmg: 0 });
    }
    const dyingTags = dying.unit_data?.tags ?? [];
    if (dyingTags.includes('Specter')) {
      for (const e of this.combatants.filter(c => c.side !== dying.side && c.alive)) {
        const sorrowIdx = e._sorrow_source_ids.indexOf(dying.id);
        if (sorrowIdx !== -1) {
          e._sorrow_source_ids.splice(sorrowIdx, 1);
          e.initiative = Math.max(0, e.initiative + 2);
          this.pushLog({ type: 'passive', passive: 'Sorrow', actorName: dying.unit_name, actorCell: dying.cellIndex, targetName: e.unit_name, targetCell: e.cellIndex, message: `Sorrow fades — ${e.unit_name} regains 2 initiative.`, value: 2 });
        }
      }
    }
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
    if (actionKey === 'sacrifice') {
      return this.combatants.filter(t => t.alive && t.side === actor.side && t.id !== actor.id);
    }
    return this.combatants.filter(t => {
      if (!t.alive) return false;
      if (t._untargetable) return false;
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
  applyRecuperate(target, rawDmg) {
    const defs = this.resolveAllPassiveDefs(target);
    const recuperateDef = defs.find(d => d.params?.recuperate_prevent_pct != null);
    if (!recuperateDef) return rawDmg;
    const p = recuperateDef.params;
    const prevented   = Math.floor(rawDmg * p.recuperate_prevent_pct / 100);
    const deferred    = Math.floor(prevented * p.recuperate_defer_pct / 100);
    const immediate   = rawDmg - prevented;
    target._deferred_dmg = (target._deferred_dmg ?? 0) + deferred;
    if (prevented > 0) {
      this.pushLog({
        type: 'passive', passive: recuperateDef.name,
        actorName: target.unit_name, actorCell: target.cellIndex,
        targetName: target.unit_name, targetCell: target.cellIndex,
        message: `Recuperate — ${prevented} prevented, ${deferred} deferred, ${immediate} taken now`,
        value: immediate,
      });
    }
    return immediate;
  }
  executeAction(actor, target = null, actionType = 'attack') {
    this.fireTrigger('on_turn_start', { actor, target: actor, dmg: 0, dying: null });
    if (actionType === 'none')    return this.doNone(actor);
    if (actionType === 'defend')  return this.doDefend(actor);
    if (actionType === 'ability') return this.doAbility(actor, target);
    if (actionType === 'sacrifice') return this.doSacrifice(actor, target);
    if (!target) return false;
    if (this.isHealer(actor)) {
      if (actor._mothers_kiss) {
        return this.doMothersKiss(actor);
      }
      const raw    = this.calcHeal(actor);
      const factor = 1 - (target._healing_reduction ?? 0) / 100;
      const heal   = Math.floor(Math.min(raw * factor, target.max_hp - target.battle_hp));
      target.battle_hp += heal;
      this.fireTrigger('on_heal', { actor, target, dmg: heal, dying: null });
      this.fireTrigger('on_healed', { actor, target, dmg: heal, dying: null });
      this.pushLog({ type: 'action', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: heal, heal: true });
    } else {
      target = this.resolveProtectorIntercept(actor, target);

      const actorRange = actor.unit_data?.range ?? 1;
      if (actorRange <= 1 && target._parry_available) {
        const parryDef = this.resolveAllPassiveDefs(target).find(d => d.params?.block_first_melee);
        if (parryDef) {
          target._parry_available = false;
          this.pushLog({ type: 'passive', passive: parryDef.name, actorName: target.unit_name, actorCell: target.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, message: `${parryDef.name} — blocked the attack!`, value: 0 });
          actor.acted_this_round = true;
          return this.afterAction(actor);
        }
      }
      const dmg = this.calcDamage(actor, target);
      if (target._invulnerable) {
        this.pushLog({ type: 'action', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: 0, killed: false, message: `${target.unit_name} is invulnerable!` });
        actor.acted_this_round = true;
        return this.afterAction(actor);
      }
      if (dmg > 0) {
        let remaining = this.applyMartyrdomRedirect(actor, target, dmg);
        if (remaining > 0) {
          remaining = this.applyRecuperate(target, remaining);
          if (remaining > 0) {
            target.battle_hp = Math.max(0, target.battle_hp - remaining);
            const dead = target.battle_hp <= 0;
            if (dead) { target.alive = false; this.applyOnDeathPassives(target); }
            this.pushLog({ type: 'action', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: remaining, killed: !target.alive });
            this.fireTrigger('on_hit', { actor, target, dmg: remaining, dying: null });
            this.fireTrigger('on_hit_received', { actor, target, dmg: remaining, dying: null });
            this.fireTrigger('on_take_damage', { actor, target, dmg: remaining, dying: null });
            if (dead && !target.alive) {
              this.fireTrigger('on_kill', { actor, target, dmg: remaining, dying: null });
              this.fireTrigger('on_ally_death', { actor, target, dmg: remaining, dying: target });
            }
          } else {
            this.pushLog({ type: 'action', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: 0, killed: false });
          }
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
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
      const def = this.ABILITIES[k];
      if (def) return def;
    }
    return null;
  }
  resolveAllPassiveDefs(unit) {
    const key = unit.unit_data?.passive || unit.unit_data?.passive_ability;
    if (!key || !this.ABILITIES) return [];
    const keys = Array.isArray(key) ? key : [key];
    return keys.map(k => this.ABILITIES[k]).filter(Boolean);
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
    this.fireTrigger('on_healed', { actor, target, dmg: heal, dying: null });
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
  doNone(actor) {
    this.pushLog({ type: 'skip', actorName: actor.unit_name, actorCell: actor.cellIndex, message: `${actor.unit_name} stands ready.` });
    actor.acted_this_round = true;
    return this.afterAction(actor);
  }
  doMothersKiss(actor) {
    const allies = this.combatants.filter(c => c.side === actor.side && c.alive && c.id !== actor.id);
    const sacrificePerAlly = Math.max(1, Math.floor(actor.battle_hp * 0.05));
    const totalCost = sacrificePerAlly * allies.length;
    if (actor.battle_hp <= totalCost) {
      this.pushLog({ type: 'passive', passive: "Mother's Kiss", actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, message: `${actor.unit_name} is too weak to channel Mother's Kiss.`, value: 0 });
      actor.acted_this_round = true;
      return this.afterAction(actor);
    }
    actor.battle_hp = Math.max(1, actor.battle_hp - totalCost);
    this.pushLog({ type: 'passive', passive: "Mother's Kiss", actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, value: totalCost, heal: false });
    for (const a of allies) {
      const healAmt = Math.min(sacrificePerAlly, a.max_hp - a.battle_hp);
      if (healAmt > 0) {
        a.battle_hp += healAmt;
        this.fireHealTriggers(actor, a, healAmt);
        this.pushLog({ type: 'action', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: a.unit_name, targetCell: a.cellIndex, value: healAmt, heal: true });
      }
    }
    actor.acted_this_round = true;
    return this.afterAction(actor);
  }
  fireHealTriggers(healer, target, amount) {
    this.fireTrigger('on_heal', { actor: healer, target, dmg: amount, dying: null });
    this.fireTrigger('on_healed', { actor: healer, target, dmg: amount, dying: null });
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

      if (c._terror_rounds > 0) {
        c._terror_rounds--;
        if (c._terror_rounds === 0) c._terror_reduction = 0;
      }

      if (c._stun_rounds > 0) {
        c._stun_rounds--;
        if (c._stun_rounds === 0 && c._stun_initiative_lost > 0) {
          c.initiative += c._stun_initiative_lost;
          c._stun_initiative_lost = 0;
        }
      }

      if (c._sanctuary_rounds > 0) {
        c._sanctuary_rounds--;
        if (c._sanctuary_rounds === 0 && c._sanctuary_resist != null) {
          const resistTypes = ['air', 'fire', 'life', 'death', 'cold', 'nature'];
          const res = c.unit_data?.resistances ?? c.resistances;
          if (res) {
            for (const type of resistTypes) res[type] = Math.max(0, (res[type] ?? 0) - c._sanctuary_resist);
          }
          c._sanctuary_resist = null;
        }
      }

      if (c._aegis_armor) { c.armor = Math.max(0, c.armor - c._aegis_armor); c._aegis_armor = 0; }
      if (c._aegis_resists) {
        const res = c.unit_data?.resistances ?? c.resistances;
        if (res) {
          for (const [type, val] of Object.entries(c._aegis_resists)) {
            res[type] = Math.max(0, (res[type] ?? 0) - val);
          }
        }
        c._aegis_resists = {};
      }
    }
    this.fireTrigger('on_round_start', { actor: null, target: null, dmg: 0, dying: null });
    // Reanimate: revive units that were marked for revival last round
    for (const c of this.combatants) {
      if (c._reanimate_pending != null && !c.alive) {
        c.alive = true;
        c.battle_hp = c._reanimate_pending;
        c._reanimate_pending = null;
        this.pushLog({ type: 'passive', passive: 'Reanimate', actorName: c.unit_name, actorCell: c.cellIndex, targetName: c.unit_name, targetCell: c.cellIndex, value: c.battle_hp, message: `Reanimate — ${c.unit_name} rises from the dead with ${c.battle_hp} HP!` });
      }
    }
    this.round++;
    this.pushLog({ type: 'round', round: this.round });
    this.firePendingRoundEffects();
  }
  firePendingRoundEffects() {
    if (!this.pendingRoundEffects?.length) return;
    const remaining = [];
    for (const effect of this.pendingRoundEffects) {
      if (this.round !== effect.round) { remaining.push(effect); continue; }
      if (effect.type === 'tag_heal_per_unit') {
        const side    = effect.side;
        const tagged  = this.combatants.filter(c => c.side === side && c.alive && (c.unit_data?.tags ?? []).includes(effect.tag));
        const healAmt = tagged.length * effect.heal_per_tagged_unit;
        if (healAmt > 0) {
          for (const c of tagged) {
            const healed = Math.min(healAmt, c.max_hp - c.battle_hp);
            if (healed > 0) c.battle_hp += healed;
          }
          this.pushLog({ type: 'spell', spell: effect.name, targetName: `all ${effect.tag} allies`, value: healAmt, heal: true, message: `${effect.name} — all ${effect.tag} allies heal for ${healAmt} (${tagged.length} ${effect.tag} on the field)` });
        }
      }
    }
    this.pendingRoundEffects = remaining;
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
      const before = this.log.length;
      if (actor._unity_host_id != null || actor._invulnerable) {
        this.doNone(actor);
        newLog.push(...this.log.slice(before));
        continue;
      }
      const actionDef = actor.unit_data?.action;
      const actionType = typeof actionDef === 'object' ? actionDef?.action_type : null;
      if (actionType === 'none') {
        this.doNone(actor);
        newLog.push(...this.log.slice(before));
        continue;
      }
      const hasAbility = !!(actor.unit_data?.ability || actor.unit_data?.active_ability);
      if (hasAbility && !actor.used_active) {
        const targets = this.getValidTargets(actor, true);
        if (targets.length > 0) { this.doAbility(actor, targets[0]); newLog.push(...this.log.slice(before)); continue; }
      }
      const targets = this.getValidTargets(actor);
      if (!targets.length) { this.skipTurn(actor); }
      else {
        const target = targets.reduce((a, b) => a.battle_hp < b.battle_hp ? a : b);
        this.executeAction(actor, target, 'attack');
      }
      newLog.push(...this.log.slice(before));
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
      pendingRoundEffects: this.pendingRoundEffects,
      units:  this.combatants.map(c => ({
        id:               c.id,
        side:             c.side,
        cellIndex:        c.cellIndex,
        size:             c.size,
        alive:            c.alive,
        battle_hp:        c.battle_hp,
        max_hp:           c.max_hp,
        armor:            c.armor,
        initiative:       c.initiative,
        defend_armor_bonus: c.defend_armor_bonus ?? 0,
        martyrdom_pct:    c.martyrdom_pct ?? 0,
        _lifesteal:       c._lifesteal ?? 0,
        acted_this_round: c.acted_this_round,
        _rosterId:        c._rosterId ?? null,
        buffs: {
          dot_dmg:             c.dot_dmg,
          _hot:                c._hot,
          _stacks:             c._stacks,
          _flags:              c._flags,
          _granted_buffs:      c._granted_buffs,
          _deferred_dmg:       c._deferred_dmg,
          _debuff_reduction:   c._debuff_reduction,
          _healing_reduction:  c._healing_reduction,
          _dmg_mult:           c._dmg_mult,
          _fear_dmg_reduction: c._fear_dmg_reduction,
          _terror_reduction:   c._terror_reduction,
          _terror_rounds:      c._terror_rounds,
          _sanctuary_rounds:   c._sanctuary_rounds,
          _sanctuary_resist:   c._sanctuary_resist,
          _parry_available:    c._parry_available,
          _aegis_armor:        c._aegis_armor,
          _aegis_resists:      c._aegis_resists,
          _bleed_dmg:          c._bleed_dmg ?? 0,
          _chill_dmg:          c._chill_dmg ?? 0,
          _invulnerable:       c._invulnerable,
          _untargetable:       c._untargetable,
          _unity_host_id:      c._unity_host_id,
          _unity_bonded_id:    c._unity_bonded_id,
          _mothers_kiss:       c._mothers_kiss,
          _sorrow_source_ids:  c._sorrow_source_ids,
          _reanimate_pending:  c._reanimate_pending ?? null,
          _stun_rounds:        c._stun_rounds ?? 0,
          _stun_initiative_lost: c._stun_initiative_lost ?? 0,
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
      c.size               = s.size ?? c.size;
      c.acted_this_round   = s.acted_this_round;
      if (s.initiative    != null) c.initiative    = s.initiative;
      if (s.max_hp        != null) c.max_hp        = s.max_hp;
      if (s.armor         != null) c.armor         = s.armor;
      c.defend_armor_bonus = s.defend_armor_bonus ?? 0;
      c.martyrdom_pct      = s.martyrdom_pct      ?? 0;
      c._lifesteal         = s._lifesteal          ?? 0;
      if (s._rosterId     != null) c._rosterId     = s._rosterId;
      const b              = s.buffs || {};
      c.dot_dmg            = b.dot_dmg            ?? 0;
      c._hot               = b._hot               ?? 0;
      c._stacks            = b._stacks            || {};
      c._flags             = b._flags             || {};
      c._granted_buffs     = b._granted_buffs     || [];
      c._deferred_dmg      = b._deferred_dmg      ?? 0;
      c._debuff_reduction  = b._debuff_reduction  ?? 0;
      c._healing_reduction = b._healing_reduction ?? 0;
      c._dmg_mult          = b._dmg_mult          ?? 1;
      c._fear_dmg_reduction = b._fear_dmg_reduction ?? 0;
      c._terror_reduction  = b._terror_reduction  ?? 0;
      c._terror_rounds     = b._terror_rounds     ?? 0;
      c._sanctuary_rounds  = b._sanctuary_rounds  ?? 0;
      c._sanctuary_resist  = b._sanctuary_resist  ?? null;
      c._parry_available   = b._parry_available   ?? false;
      c._aegis_armor       = b._aegis_armor       ?? 0;
      c._aegis_resists     = b._aegis_resists     || {};
      c._bleed_dmg         = b._bleed_dmg         ?? 0;
      c._chill_dmg         = b._chill_dmg         ?? 0;
      c._invulnerable      = b._invulnerable      ?? false;
      c._untargetable      = b._untargetable      ?? false;
      c._unity_host_id     = b._unity_host_id     ?? null;
      c._unity_bonded_id   = b._unity_bonded_id   ?? null;
      c._mothers_kiss      = b._mothers_kiss      ?? false;
      c._sorrow_source_ids = b._sorrow_source_ids ?? [];
      c._reanimate_pending = b._reanimate_pending ?? null;
      c._stun_rounds       = b._stun_rounds       ?? 0;
      c._stun_initiative_lost = b._stun_initiative_lost ?? 0;
    }
    engine.round  = battleData.round;
    engine.done   = battleData.done;
    engine.winner = battleData.winner;
    engine.pendingRoundEffects = battleData.pendingRoundEffects || [];
    engine.log    = [];
    return engine;
  }
  pushLog(entry) { this.log.push(entry); }
}
module.exports = { BattleEngine };