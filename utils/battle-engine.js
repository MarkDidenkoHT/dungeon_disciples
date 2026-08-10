const { runTrigger, calcDamageWithPassives, getAbilityTargets, executeActiveAbility, stackPassiveKeys } = require('./passive-processor');
const { filterByTagRules } = require('./tag-rules.js');
const { SPELLS } = require('../data/spells');
const { COMBAT_BARKS, BARK_CHANCES, HEAL_BARK_THRESHOLD_PCT } = require('../data/combat_barks');

// Anti-stalemate / anti-heal-abuse pressure. Environmental — applies to BOTH
// sides equally, so it also works for PvP later. All tunable here.
//   Battle Fatigue: from the round AFTER fatigue_start_round, every point of HP
//     restored (heals, lifesteal, HoT, drains — everything) is reduced by
//     fatigue_pct_per_round more, capped at fatigue_max_pct.
//   Withering: from the round AFTER wither_start_round, each unit loses
//     wither_pct_max_hp of its max HP as true damage at the start of its turn
//     (can kill — that's what forces a resolution).
const BATTLE_FATIGUE = {
  fatigue_start_round: 5,
  fatigue_pct_per_round: 10,
  fatigue_max_pct: 50,
  wither_start_round: 10,
  wither_pct_max_hp: 5,
};

// Dispatcher for enemy-cast spells (data/spells.js SPELLS.enemies). This runs
// through the exact same target-resolution + param-application system as player
// prep-spells (BattleEngine.getSpellTargets / applySpellParams below) - an
// enemy_spell entry with e.g. target_scope: 'all_allies' and
// params: { armor_boost: 10 } will buff every enemy combatant, the same way a
// player spell with those fields buffs every player combatant. Fill in
// spellDef.target_scope/params on the SPELLS.enemies entries; nothing else to
// wire up. Only add a manual branch here for effects that don't fit the generic
// scope/params shape (e.g. something like the player-only 'tag_count_buff').
function applyEnemySpellEffect(engine, actor, spellDef) {
  engine.castSpell(spellDef, { casterSide: 'enemy', targetId: null });
}

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
      this.pendingRoundEffects   = state.pendingRoundEffects || [];
      this._encounter_spell_cast = state._encounter_spell_cast || false;
    } else {
      this.combatants = [];
      this.round      = 1;
      this.log        = [];
      this.done       = false;
      this.winner     = null;
      this.pendingRoundEffects   = [];
      this._encounter_spell_cast = false;
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
      _base_max_hp: maxHp,
      _fanaticism_bonus: 0,
      armor:      data.armor ?? 0,
      initiative: data.initiative ?? 40,
      alive:      data.alive !== false && battleHp > 0,
      acted_this_round:   false,
      used_active:        false,
      defend_armor_bonus: 0,
      dot_dmg:            0,
      _poison_dmg:        0,
      _dot_permanent:     0,
      _bleed_permanent:   0,
      _dot_source_key:    null,
      _poison_source_key: null,
      _bleed_source_key:  null,
      _chill_source_key:  null,
      _dodge_count:       0,
      _effects:           [],
      _effect_seq:        0,
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
      _frost_armor_rounds: 0,
      _frost_armor_armor:  0,
      _frost_armor_resist: 0,
      _frost_armor_school: null,
      _stone_form_rounds:  0,
      _stone_form_armor:   0,
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
      intercept_bonus_pct: 0,
      _passives_locked: false,
      _actives_locked:  false,
      _taunted_by_id:      null,
      _clear_shot_active:  false,
      _clear_shot_initiative_amt: 0,
      _clear_shot_dmg_amt: 0,
      _bark_counts: {},
    };
  }
  fireTrigger(trigger, ctx) {
    runTrigger(trigger, { engine: this, UNIT_ABILITIES: this.ABILITIES, ...ctx });
  }
  getFootprint(unit) {
    const size = unit.size ?? 'tile';
    const r = cellRow(unit.cellIndex), c = cellCol(unit.cellIndex);
    if (size === 'row') return [cellIndex(r, 0), cellIndex(r, 1)];
    if (size === 'column') {
      const topRow = r <= ROWS - 2 ? r : r - 1;
      return [cellIndex(topRow, c), cellIndex(topRow + 1, c)];
    }
    return [unit.cellIndex];
  }
  getInspirationTargetCells(unit) {
    const footprint = this.getFootprint(unit);
    const rowsByCol = {};
    for (const cell of footprint) {
      const col = cellCol(cell), row = cellRow(cell);
      rowsByCol[col] = rowsByCol[col] || [];
      rowsByCol[col].push(row);
    }
    const targets = new Set();
    for (const [col, rows] of Object.entries(rowsByCol)) {
      const colNum  = Number(col);
      const minRow  = Math.min(...rows);
      const maxRow  = Math.max(...rows);
      if (minRow - 1 >= 0)        targets.add(cellIndex(minRow - 1, colNum));
      if (maxRow + 1 <= ROWS - 1) targets.add(cellIndex(maxRow + 1, colNum));
    }
    return [...targets];
  }
  getInspirationTargets(owner) {
    const targetCells = this.getInspirationTargetCells(owner);
    if (!targetCells.length) return [];
    const results = [];
    for (const c of this.combatants) {
      if (!c.alive || c.side !== owner.side || c.id === owner.id) continue;
      const footprint = this.getFootprint(c);
      if (footprint.some(cell => targetCells.includes(cell))) results.push(c);
    }
    return results;
  }
  // Resolves the container object for a possibly-dotted path. `create` builds
  // missing objects (for clears); without it a missing branch yields null.
  _effectPathOwner(unit, parts, create) {
    let cur = unit;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') {
        if (!create) return null;
        cur[parts[i]] = {};
      }
      cur = cur[parts[i]];
    }
    return cur;
  }

  revertEffect(unit, eff) {
    if (!unit || !eff) return;
    // Stat give-backs first, then flag/field clears. Both accept dotted paths
    // (e.g. 'unit_data.resistances.fire' or '_flags.shatter 1_applied').
    for (const [path, amount] of Object.entries(eff.restore || {})) {
      const parts = path.split('.');
      const owner = this._effectPathOwner(unit, parts, false);
      if (!owner) continue;
      const last = parts[parts.length - 1];
      owner[last] = Math.max(0, (Number(owner[last]) || 0) + Number(amount || 0));
    }
    for (const [path, value] of Object.entries(eff.clear || {})) {
      const parts = path.split('.');
      const owner = this._effectPathOwner(unit, parts, true);
      if (!owner) continue;
      owner[parts[parts.length - 1]] = value;
    }
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
        } else if (buff.type === 'damage') {
          target._dmg_mult = Math.max(0.01, (target._dmg_mult ?? 1) / (1 + buff.value));
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
      this.pushLog({ type: 'passive', passive: 'Unity', actorId: bonded.id, actorName: bonded.unit_name, actorCell: bonded.cellIndex, targetName: bonded.unit_name, targetCell: bonded.cellIndex, message: `${bonded.unit_name} perishes with their host.` });
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
          this.pushLog({ type: 'passive', passive: 'Sorrow', actorId: dying.id, actorName: dying.unit_name, actorCell: dying.cellIndex, targetName: e.unit_name, targetCell: e.cellIndex, message: `Sorrow fades — ${e.unit_name} regains 2 initiative.`, value: 2 });
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
      if (actor._taunted_by_id != null) return [];
      return getAbilityTargets(actor, this.combatants, this.ABILITIES);
    }
    const isHeal    = this.isHealer(actor);
    const actionKey = this.getActionKey(actor);

    if (actor._taunted_by_id != null) {
      const taunter = this.combatants.find(c => c.id === actor._taunted_by_id && c.alive);
      if (!taunter) {
        actor._taunted_by_id = null;
      } else if (isHeal || actionKey === 'sacrifice') {
        return [];
      } else {
        return [taunter];
      }
    }

    if (actionKey === 'sacrifice') {
      return this.combatants.filter(t => t.alive && t.side === actor.side && t.id !== actor.id);
    }

    // Holy Shock is the only action that reaches BOTH sides: an ally is mended,
    // an enemy is struck. Allies are filtered by the heal tag rules (a Construct
    // or Zombie cannot be mended); enemies use the unit's normal reach.
    if (actionKey === 'holy_shock') {
      return this.combatants.filter(t => {
        if (!t.alive || t._untargetable) return false;
        if (t.side === actor.side) {
          if (t.id === actor.id) return false;
          return filterByTagRules([t], 'heal').length > 0;
        }
        const range = actor.unit_data?.range ?? 1;
        return range === 1 ? this.meleeCanReach(actor, t) : true;
      });
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
      if (range === 1) return this.meleeCanReach(actor, t);
      return true;
    });
  }
  // Melee reach (range 1). Two gates:
  //  1. Column — the target must be in the reachable column: the FRONT column
  //     (nearest this side) while any front-column defender lives, otherwise the
  //     back column. The whole front column must fall before the back is exposed.
  //  2. Row — within that column, the target must be in an ADJACENT row (±1 of
  //     the attacker). If no unit in the reachable column is adjacent, the melee
  //     unit instead reaches the NEAREST one(s) by row distance, so it's never
  //     stranded when a target exists in its lane.
  meleeCanReach(actor, t) {
    const side       = t.side;
    const frontCol   = side === 'enemy' ? 0 : 1;
    const backCol    = side === 'enemy' ? 1 : 0;
    // Column tests go through the FOOTPRINT, not the anchor cell. A large 'row'
    // unit spans both columns, but its anchor sits in only one of them — testing
    // the anchor alone made a row unit anchored in the back column read as "no
    // front-column defender", which exposed the real backline to melee.
    const occupiesCol = (c, col) => this.getFootprint(c).some(cell => cellCol(cell) === col);
    const frontAlive = this.combatants.some(c => c.side === side && c.alive && occupiesCol(c, frontCol));
    const reachableCol = frontAlive ? frontCol : backCol;
    if (!occupiesCol(t, reachableCol)) return false;

    // Row distance is measured footprint-to-footprint for the same reason: a
    // 'column' unit covers two rows, so the closest of its rows is what a melee
    // attacker actually stands next to, and a large attacker reaches from any
    // row it occupies.
    const actorRows = this.getFootprint(actor).map(cellRow);
    const rowDist = c => {
      const rows = this.getFootprint(c).map(cellRow);
      return Math.min(...rows.flatMap(r => actorRows.map(ar => Math.abs(r - ar))));
    };

    const colUnits = this.combatants.filter(c => c.side === side && c.alive && occupiesCol(c, reachableCol));
    const tDist    = rowDist(t);
    const hasAdjacent = colUnits.some(c => rowDist(c) <= 1);
    if (hasAdjacent) return tDist <= 1;
    const minDist = Math.min(...colUnits.map(rowDist));
    return tDist === minDist;
  }
  calcDamage(actor, target) {
    return calcDamageWithPassives(actor, target, this.ABILITIES);
  }
  calcDamageValue(actor, target) {
    return this.calcDamage(actor, target).dmg;
  }
  calcHeal(actor) {
    const data  = actor.unit_data || actor;
    // Heal equals the unit's action_power — no hidden multiplier. (Previously
    // ×1.3, which made a power-10 healer restore 13 and read as a bug.)
    return data.action_power ?? data.action?.value ?? 15;
  }
  // ── Battle Fatigue (see BATTLE_FATIGUE) ─────────────────────────────────────
  // Current healing-reduction percentage from fatigue (0 until it kicks in).
  fatigueHealReductionPct() {
    const over = this.round - BATTLE_FATIGUE.fatigue_start_round;
    if (over <= 0) return 0;
    return Math.min(BATTLE_FATIGUE.fatigue_max_pct, over * BATTLE_FATIGUE.fatigue_pct_per_round);
  }
  // Multiplier applied to EVERY point of HP restored while fatigue is active.
  // Call this at each heal site so no heal source (heal, lifesteal, HoT, drain)
  // can dodge the reduction.
  fatigueHealMult() {
    return 1 - this.fatigueHealReductionPct() / 100;
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
        actorId: target.id, actorName: target.unit_name, actorCell: target.cellIndex,
        targetName: target.unit_name, targetCell: target.cellIndex,
        message: `Recuperate — ${prevented} prevented, ${deferred} deferred, ${immediate} taken now`,
        value: immediate,
      });
    }
    return immediate;
  }
  // opts.turnStart defaults true: this is the unit's own turn beginning, so its
  // turn-start DoTs tick here. Pass { turnStart: false } for out-of-turn strikes
  // (e.g. a commanded Infernal Mandate hit) so they don't tick the striker's DoTs.
  executeAction(actor, target = null, actionType = 'attack', opts = {}) {
    this.fireTrigger('on_turn_start', { actor, target: actor, dmg: 0, dying: null });
    if (opts.turnStart !== false) {
      this.applyTurnStartTicks(actor);
      // If the unit bled/chilled out at the start of its own turn, it doesn't act.
      if (!actor.alive) { actor.acted_this_round = true; return this.afterAction(actor); }
    }
    actor.defend_armor_bonus = 0;
    // A unit whose intrinsic action is 'sacrifice' always pays the HP cost, even
    // when the AI drives it (the AI loop calls this with 'attack'). Without this,
    // enemy sacrifice-healers healed allies for free.
    if (actionType === 'attack' && actor.unit_data?.action === 'sacrifice') actionType = 'sacrifice';
    // Holy Shock: whether this turn heals or hurts is decided by WHO was picked,
    // not by the action. Pointed at an ally it runs the heal branch below; at an
    // enemy it falls through to the ordinary attack path, so intercepts, parry,
    // resistances and every on-hit passive behave exactly as for a normal strike.
    const holyShockHeal = this.getActionKey(actor) === 'holy_shock' &&
                          target && target.side === actor.side;
    if (actionType === 'none')    return this.doNone(actor);
    if (actionType === 'defend')  return this.doDefend(actor);
    if (actionType === 'ability') return this.doAbility(actor, target);
    if (actionType === 'sacrifice') return this.doSacrifice(actor, target);
    if (!target) return false;
    if (this.isHealer(actor) || holyShockHeal) {
      if (actor._mothers_kiss) {
        return this.doMothersKiss(actor);
      }
      // Multi-target menders (unit_data.targets > 1) mend every valid ally at
      // once, mirroring the multi-target attack branch below — Pale Embrace is
      // the first of them. getValidTargets has already applied the action's tag
      // rules, so a Spirit-only mend reaches Spirits and nobody else.
      //
      // Holy Shock is excluded on purpose: its heal half is aimed at ONE ally by
      // the player's tap, and it is not a `targets`-driven action.
      const maxHealTargets = holyShockHeal ? 1 : Math.max(1, Number(actor.unit_data?.targets ?? 1));
      if (maxHealTargets > 1) {
        const list = this.getValidTargets(actor).slice(0, maxHealTargets);
        for (const tgt of list) {
          if (!actor.alive) break;
          if (tgt.alive) this.healTarget(actor, tgt);
        }
        actor.acted_this_round = true;
        return this.afterAction(actor);
      }
      this.healTarget(actor, target);
    } else {
      // Multi-target attackers (unit_data.targets > 1) strike every valid target
      // at once — an AoE hit, e.g. the Gargoyles' targets:6 sweeps the whole
      // enemy field. All current multi-target units are ranged, so the melee-only
      // parry/duelist reactions below don't apply to them; strikeTarget still
      // runs per-target dodge and all the on-hit machinery.
      const maxTargets = Math.max(1, Number(actor.unit_data?.targets ?? 1));
      if (maxTargets > 1) {
        const list = this.getValidTargets(actor).slice(0, maxTargets);
        for (const tgt of list) {
          if (!actor.alive) break;
          if (tgt.alive) this.strikeTarget(actor, tgt);
        }
        actor.acted_this_round = true;
        return this.afterAction(actor);
      }

      target = this.resolveProtectorIntercept(actor, target);

      const actorRange = actor.unit_data?.range ?? 1;
      if (actorRange <= 1 && target._parry_available) {
        const parryDef = this.resolveAllPassiveDefs(target).find(d => d.params?.block_first_melee);
        if (parryDef) {
          target._parry_available = false;
          this.pushLog({ type: 'passive', passive: parryDef.name, actorId: target.id, actorName: target.unit_name, actorCell: target.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, message: `${parryDef.name} — blocked the attack!`, value: 0, heal: false });
          actor.acted_this_round = true;
          return this.afterAction(actor);
        }
      }
      if (actorRange <= 1) {
        const duelistDef = this.resolveAllPassiveDefs(target).find(d => d.params?.preemptive_strike_pct != null);
        if (duelistDef && cellRow(actor.cellIndex) === cellRow(target.cellIndex) && cellCol(actor.cellIndex) === (actor.side === 'enemy' ? 0 : 1)) {
          const p = duelistDef.params;
          const preemptDmg = Math.max(1, Math.floor(this.calcDamage(target, actor).dmg * p.preemptive_strike_pct / 100));
          if (!actor._invulnerable) actor.battle_hp = Math.max(0, actor.battle_hp - preemptDmg);
          const actorDied = actor.battle_hp <= 0;
          this.pushLog({ type: 'passive', passive: duelistDef.name, actorId: target.id, actorName: target.unit_name, actorCell: target.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, message: `${duelistDef.name} — preemptive strike for ${preemptDmg}${actorDied ? ', cancelling the attack!' : ''}`, value: preemptDmg, heal: false });
          if (actorDied) {
            actor.alive = false;
            this.applyOnDeathPassives(actor);
            this.fireTrigger('on_hit',        { actor: target, target: actor, dmg: preemptDmg, dying: null });
            this.fireTrigger('on_hit_received', { actor: target, target: actor, dmg: preemptDmg, dying: null });
            this.fireTrigger('on_kill',       { actor: target, target: actor, dmg: preemptDmg, dying: null });
            this.fireTrigger('on_ally_death', { actor: target, target: actor, dmg: preemptDmg, dying: actor });
            actor.acted_this_round = true;
            return this.afterAction(actor);
          }
        }
      }
      // Dodge — every Nth physical attack against this unit is avoided entirely.
      if ((actor.unit_data?.damage_source ?? 'physical') === 'physical') {
        const dodgeDef = this.resolveAllPassiveDefs(target).find(d => d.params?.dodge_every != null);
        if (dodgeDef) {
          target._dodge_count = (target._dodge_count ?? 0) + 1;
          if (target._dodge_count % dodgeDef.params.dodge_every === 0) {
            this.pushLog({ type: 'passive', passive: dodgeDef.name, actorId: target.id, actorName: target.unit_name, actorCell: target.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, message: `${dodgeDef.name} — dodged ${actor.unit_name}'s attack!`, value: 0, heal: false });
            actor.acted_this_round = true;
            return this.afterAction(actor);
          }
        }
      }
      const { dmg, rawDmg } = this.calcDamage(actor, target);
      if (target._invulnerable) {
        this.pushLog({ type: 'action', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: 0, killed: false, message: `${target.unit_name} is invulnerable!` });
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
            this.pushLog({ type: 'action', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, targetId: target.id, value: remaining, rawDmg, resisted: rawDmg - remaining, killed: !target.alive });
            this.fireTrigger('on_hit', { actor, target, dmg: remaining, dying: null });
            this.fireTrigger('on_hit_received', { actor, target, dmg: remaining, dying: null });
            this.fireTrigger('on_take_damage', { actor, target, dmg: remaining, dying: null });
            if (dead && !target.alive) {
              this.fireTrigger('on_kill', { actor, target, dmg: remaining, dying: null });
              this.fireTrigger('on_ally_death', { actor, target, dmg: remaining, dying: target });
              this.checkBark('kill', actor, { target });
              this.checkBark('death', target, { target: actor }); // the dying unit's last words; its "target" is the killer
            } else {
              this.checkBark('attack', actor, { target });
            }
          } else {
            this.pushLog({ type: 'action', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: 0, killed: false });
          }
        } else {
          this.pushLog({ type: 'action', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: 0, killed: false });
        }
      } else {
        this.pushLog({ type: 'action', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: 0, killed: false });
      }
    }
    actor.acted_this_round = true;
    return this.afterAction(actor);
  }
  // Mends ONE ally. Split out of executeAction so a multi-target mender and a
  // single-target one heal by exactly the same rules — fatigue, the target's
  // healing reduction, the overheal clamp and the heal triggers.
  healTarget(actor, target) {
    if (!target || !target.alive) return 0;
    const raw    = this.calcHeal(actor);
    const factor = 1 - (target._healing_reduction ?? 0) / 100;
    const heal   = Math.floor(Math.min(raw * factor * this.fatigueHealMult(), target.max_hp - target.battle_hp));
    const preHealRatio = target.max_hp > 0 ? target.battle_hp / target.max_hp : 1;
    target.battle_hp += heal;
    this.fireTrigger('on_heal',   { actor, target, dmg: heal, dying: null });
    this.fireTrigger('on_healed', { actor, target, dmg: heal, dying: null });
    this.pushLog({ type: 'action', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, targetId: target.id, value: heal, heal: true });
    this.checkBark('heal_low_hp', actor, { target, preHealRatio });
    return heal;
  }

  // Applies one physical/typed strike from actor to a single target: protector
  // intercept, per-target dodge, damage, martyrdom/recuperate, and all on-hit
  // triggers. Does NOT set acted_this_round or call afterAction — the caller owns
  // turn flow. Used by the multi-target attack path; the single-target path still
  // inlines this same sequence alongside its melee-only parry/duelist reactions.
  strikeTarget(actor, target) {
    target = this.resolveProtectorIntercept(actor, target);
    if (!target || !target.alive) return;

    // Dodge — every Nth physical attack against this unit is avoided entirely.
    if ((actor.unit_data?.damage_source ?? 'physical') === 'physical') {
      const dodgeDef = this.resolveAllPassiveDefs(target).find(d => d.params?.dodge_every != null);
      if (dodgeDef) {
        target._dodge_count = (target._dodge_count ?? 0) + 1;
        if (target._dodge_count % dodgeDef.params.dodge_every === 0) {
          this.pushLog({ type: 'passive', passive: dodgeDef.name, actorId: target.id, actorName: target.unit_name, actorCell: target.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, message: `${dodgeDef.name} — dodged ${actor.unit_name}'s attack!`, value: 0, heal: false });
          return;
        }
      }
    }

    if (target._invulnerable) {
      this.pushLog({ type: 'action', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: 0, killed: false, message: `${target.unit_name} is invulnerable!` });
      return;
    }

    const { dmg, rawDmg } = this.calcDamage(actor, target);
    if (dmg <= 0) {
      this.pushLog({ type: 'action', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: 0, killed: false });
      return;
    }

    let remaining = this.applyMartyrdomRedirect(actor, target, dmg);
    if (remaining > 0) remaining = this.applyRecuperate(target, remaining);
    if (remaining > 0) {
      target.battle_hp = Math.max(0, target.battle_hp - remaining);
      const dead = target.battle_hp <= 0;
      if (dead) { target.alive = false; this.applyOnDeathPassives(target); }
      this.pushLog({ type: 'action', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, targetId: target.id, value: remaining, rawDmg, resisted: rawDmg - remaining, killed: !target.alive });
      this.fireTrigger('on_hit', { actor, target, dmg: remaining, dying: null });
      this.fireTrigger('on_hit_received', { actor, target, dmg: remaining, dying: null });
      this.fireTrigger('on_take_damage', { actor, target, dmg: remaining, dying: null });
      if (dead && !target.alive) {
        this.fireTrigger('on_kill', { actor, target, dmg: remaining, dying: null });
        this.fireTrigger('on_ally_death', { actor, target, dmg: remaining, dying: target });
        this.checkBark('kill', actor, { target });
        this.checkBark('death', target, { target: actor });
      } else {
        this.checkBark('attack', actor, { target });
      }
    } else {
      this.pushLog({ type: 'action', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: 0, killed: false });
    }
  }
  resolveProtectorIntercept(actor, target) {
    const frontCol  = target.side === 'enemy' ? 0 : 1;
    const backCol   = target.side === 'enemy' ? 1 : 0;
    // Footprint-based, matching meleeCanReach: a large 'row' target already
    // stands in the front column and so cannot be protected from behind, and a
    // large protector shields every row it actually covers.
    const targetCells = this.getFootprint(target);
    const targetRows  = new Set(targetCells.map(cellRow));
    if (!targetCells.some(cell => cellCol(cell) === backCol)) return target;
    if (targetCells.some(cell => cellCol(cell) === frontCol)) return target;
    const protectors = this.combatants.filter(c => {
      if (!c.alive || c.side !== target.side || c.id === target.id) return false;
      const cells = this.getFootprint(c);
      if (!cells.some(cell => cellCol(cell) === frontCol)) return false;
      if (!cells.some(cell => targetRows.has(cellRow(cell)))) return false;
      const defs = this.resolveAllPassiveDefs(c);
      const interceptDef  = defs.find(d => d.trigger === 'intercept');
      const passiveChance = interceptDef?.params?.intercept_chance_pct ?? 0;
      const spellChance   = c.intercept_bonus_pct ?? 0;
      return (passiveChance + spellChance) > 0;
    });
    for (const protector of protectors) {
      const defs = this.resolveAllPassiveDefs(protector);
      const interceptDef  = defs.find(d => d.trigger === 'intercept');
      const passiveChance = interceptDef?.params?.intercept_chance_pct ?? 0;
      const spellChance   = protector.intercept_bonus_pct ?? 0;
      const chance = (passiveChance + spellChance) / 100;
      if (Math.random() < chance) {
        // sourceId/sourceCell = the ATTACKER. The entry already named the
        // protector (actor) and the ally it saved (target), but not who the blow
        // came from — and the shield has to face that direction to read as a
        // block rather than a generic aura.
        this.pushLog({ type: 'intercept', passive: interceptDef?.name || 'Vow of Protection', actorId: protector.id, actorName: protector.unit_name, actorCell: protector.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, sourceId: actor.id, sourceCell: actor.cellIndex });
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
      // An invulnerable martyr cannot absorb the blow, so the damage must stay
      // with its original target rather than vanishing into a unit that ignores it.
      if (martyr._invulnerable) continue;
      remaining -= redirected;
      martyr.battle_hp = Math.max(0, martyr.battle_hp - redirected);
      const dead = martyr.battle_hp <= 0;
      if (dead) { martyr.alive = false; this.applyOnDeathPassives(martyr); }
      this.pushLog({ type: 'passive', passive: 'Martyrdom', actorId: martyr.id, actorName: martyr.unit_name, actorCell: martyr.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: redirected, heal: false });
    }
    return Math.max(0, remaining);
  }
  resolvePassiveDef(unit) {
    if (unit._passives_locked) return null;
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
    if (unit._passives_locked) return [];
    const key = unit.unit_data?.passive || unit.unit_data?.passive_ability;
    if (!key || !this.ABILITIES) return [];
    const keys = stackPassiveKeys(Array.isArray(key) ? key : [key], this.ABILITIES);
    return keys.map(k => this.ABILITIES[k]).filter(Boolean);
  }
  // ── Dispellable effect registry ─────────────────────────────────────────────
  // Every applied status (bleed, poison, slow, renew, …) also registers a plain
  // data record here so it can be removed later by a dispel. Records must stay
  // JSON-serializable (they ride along in the battle snapshot), so the "undo" is
  // data rather than a callback:
  //   clear:   { field: value }  -> on dispel, set unit[field] = value
  //   restore: { field: amount } -> on dispel, unit[field] += amount (undo a shred)
  // polarity is 'negative' (a debuff, dispelled off allies) or 'positive'
  // (a buff, stripped off enemies).
  registerEffect(unit, rec) {
    if (!unit || !rec?.key) return;
    unit._effects = unit._effects || [];
    const existing = unit._effects.find(e => e.key === rec.key);
    if (existing) {
      // Re-applied: keep one record, but accumulate the undo so a dispel fully
      // reverses every stack of a shred-style effect.
      for (const [f, amt] of Object.entries(rec.restore || {})) {
        existing.restore = existing.restore || {};
        existing.restore[f] = (existing.restore[f] || 0) + amt;
      }
      existing.clear = { ...(existing.clear || {}), ...(rec.clear || {}) };
      existing.name  = rec.name || existing.name;
      return existing;
    }
    const eff = {
      key:      rec.key,
      name:     rec.name || rec.key,
      polarity: rec.polarity === 'positive' ? 'positive' : 'negative',
      clear:    rec.clear   || {},
      restore:  rec.restore || {},
      // `dispellable: false` opts an effect out of dispels (permanent/structural).
      ...(rec.dispellable === false ? { dispellable: false } : {}),
    };
    unit._effects.push(eff);
    return eff;
  }

  // Drops an effect record without reverting anything — for when the effect ends
  // naturally (e.g. a DoT ticks and expires) rather than being dispelled.
  clearEffect(unit, key) {
    if (!unit?._effects?.length) return;
    unit._effects = unit._effects.filter(e => e.key !== key);
  }

  // Removes up to `count` effects of the given polarity, reversing each. Returns
  // the removed records so the caller can log what was stripped.
  dispelEffects(unit, polarity, count = Infinity) {
    if (!unit?._effects?.length) return [];
    const matching = unit._effects
      .filter(e => e.polarity === polarity && e.dispellable !== false)
      .slice(0, count);
    if (!matching.length) return [];
    // revertEffect handles dotted `_flags.x` paths and clamps stats at 0.
    for (const eff of matching) this.revertEffect(unit, eff);
    const removed = new Set(matching);
    unit._effects = unit._effects.filter(e => !removed.has(e));
    return matching;
  }

  // Every over-time tick a unit can be carrying, damage or heal, resolved in one
  // place at the start of that unit's own turn: withering, Recuperate's deferred
  // hit, bleed, chill, burn, poison, and Renew. None of them depend on the unit's
  // own passives. Two things used to split this up: the passive processor's
  // on_turn_start branch only ran for units that happened to own an on_turn_start
  // passive (so on most units bleed/chill silently never fired), and burn, poison
  // and Renew ticked from applyDoTs the moment the carrier was struck — which for
  // burn and poison meant firing immediately on the turn they were applied.
  applyTurnStartTicks(unit) {
    if (!unit || !unit.alive) return;
    // An invulnerable unit (Unity's bonded guardian) takes nothing from a
    // damage-over-time tick either. This was the one damage route that ignored
    // invulnerability outright: burn/bleed/chill/poison and the withering tick
    // never pass through the attack paths that check it, so a guardian that
    // should be untouchable was bleeding out on its own turn.
    // Skipped entirely rather than logged as zero — a tick that cannot land is
    // not an event worth a line in the battle log.
    if (unit._invulnerable) return;
    const tick = (amount, passive, actorName, extra = {}) => {
      unit.battle_hp = Math.max(0, unit.battle_hp - amount);
      this.pushLog({ type: 'passive', passive, actorName, targetName: unit.unit_name, targetId: unit.id, targetCell: unit.cellIndex, value: amount, heal: false, ...extra });
      if (unit.battle_hp <= 0) { unit.alive = false; this.applyOnDeathPassives(unit); }
    };
    // Withering — after wither_start_round, every unit loses a % of its max HP as
    // true damage at the start of its turn (can kill; both sides). Forces a
    // resolution when heals + reduced healing still aren't ending the fight.
    if (this.round > BATTLE_FATIGUE.wither_start_round) {
      const wither = Math.max(1, Math.floor(unit.max_hp * BATTLE_FATIGUE.wither_pct_max_hp / 100));
      tick(wither, 'Withering', '🥀', { dot_kind: 'wither' });
      if (!unit.alive) return;
    }
    if (unit._deferred_dmg > 0) {
      const d = unit._deferred_dmg; unit._deferred_dmg = 0;
      tick(d, 'Recuperate (deferred)', '⏳');
    }
    // Mother's Blessing — the caster pays a slice of her own maximum HP and
    // every living ally is healed for that amount. Lives here rather than in a
    // passive because it is an ACTIVE that leaves a standing effect; the flag is
    // raised in executeActiveAbility. The cost is skipped (not fatal) while it
    // would drop her to 0, so the ability can never kill its own caster.
    if (unit.alive && unit._mothers_blessing) {
      const pct  = unit._mothers_blessing_pct ?? 10;
      const cost = Math.max(1, Math.floor(unit.max_hp * pct / 100));
      if (unit.battle_hp > cost) {
        unit.battle_hp -= cost;
        const heal = Math.max(1, Math.floor(cost * this.fatigueHealMult()));
        // The caster is NOT among them. She is paying the cost, and healing her
        // for the same amount she just spent made the sacrifice cost nothing
        // (better than nothing, in fact: she paid a slice of max HP and got the
        // full heal back, so a wounded caster gained HP by "sacrificing").
        const allies = this.combatants.filter(c => c.side === unit.side && c.alive && c.id !== unit.id);
        // The cost, stated once and on its own — it happens whether or not
        // anybody had room to be healed. No targetId, so it draws nothing.
        this.pushLog({
          type: 'passive', passive: "Mother's Blessing",
          actorId: unit.id, actorName: unit.unit_name, actorCell: unit.cellIndex,
          targetName: 'all allies', value: cost, heal: false,
          message: `${unit.unit_name} sacrifices ${cost} HP`,
        });
        // Then one entry per ally actually mended. Each carries targetId, which
        // is what the animation collects to draw a soul to every one of them —
        // and they are one simultaneous play, not a queue (see FAN_OUT_FX).
        for (const a of allies) {
          const actual = Math.min(heal, a.max_hp - a.battle_hp);
          if (actual <= 0) continue;
          a.battle_hp += actual;
          this.fireHealTriggers(unit, a, actual);
          this.pushLog({
            type: 'passive', passive: "Mother's Blessing",
            actorId: unit.id, actorName: unit.unit_name, actorCell: unit.cellIndex,
            targetId: a.id, targetName: a.unit_name, targetCell: a.cellIndex,
            value: actual, heal: true,
            message: `${a.unit_name} is mended for ${actual}`,
          });
        }
      }
    }
    if (unit.alive && unit._bleed_dmg > 0) {
      const bleedSourceKey = unit._bleed_source_key ?? null;
      const bleedRank = bleedSourceKey && this.ABILITIES
        ? (this.ABILITIES[bleedSourceKey]?.rank ?? 1)
        : 1;
      const b = Math.max(bleedRank, unit._bleed_dmg);
      unit._bleed_dmg = 0;
      tick(b, 'Bleed', '🩸', { dot_kind: 'bleed' });
      if (unit.alive && unit._bleed_permanent > 0) unit._bleed_dmg = unit._bleed_permanent;
      else this.clearEffect(unit, 'bleed');
    }
    if (unit.alive && unit._chill_dmg > 0) {
      const chillSourceKey = unit._chill_source_key ?? null;
      const chillRank = chillSourceKey && this.ABILITIES
        ? (this.ABILITIES[chillSourceKey]?.rank ?? 1)
        : 1;
      const c = Math.max(chillRank, unit._chill_dmg);
      unit._chill_dmg = 0;
      tick(c, 'Chill', '❄️', { dot_kind: 'chill' });
      this.clearEffect(unit, 'chill');
    }
    // Burn (dot_dmg) — "deals X% of damage to target on their next turn", which
    // is exactly this moment. Clears after ticking unless made permanent (Mark
    // of Ash).
    if (unit.alive && unit.dot_dmg > 0) {
      const dotSourceKey = unit._dot_source_key ?? null;
      const dotRank = dotSourceKey && this.ABILITIES
        ? (this.ABILITIES[dotSourceKey]?.rank ?? 1)
        : 1;
      const d = Math.max(dotRank, unit.dot_dmg);
      unit.dot_dmg = 0;
      tick(d, 'Burn', '🔥', { dot_kind: 'burn' });
      if (unit.alive && unit._dot_permanent > 0) unit.dot_dmg = unit._dot_permanent;
      else { unit._dot_type = null; this.clearEffect(unit, 'dot'); }
    }
    // Poison (_poison_dmg) — an independent slot from burn (a unit can carry
    // both), same turn-start timing. Ticks once, then clears.
    if (unit.alive && unit._poison_dmg > 0) {
      const psnKey  = unit._poison_source_key ?? null;
      const psnRank = psnKey && this.ABILITIES ? (this.ABILITIES[psnKey]?.rank ?? 1) : 1;
      const p = Math.max(psnRank, unit._poison_dmg);
      unit._poison_dmg = 0;
      unit._poison_source_key = null;
      tick(p, 'Poison', '☠️', { dot_kind: 'poison' });
      this.clearEffect(unit, 'poison');
    }
    // Renew (_hot) — the heal-over-time ticks on the same schedule as the damage
    // ones: once, at the start of the healed unit's own turn. It used to tick
    // whenever the unit happened to be struck. Last in the order, so a unit the
    // afflictions above just killed doesn't heal out of its own death.
    if (unit.alive && unit._hot > 0) {
      const actual = Math.min(Math.floor(unit._hot * this.fatigueHealMult()), unit.max_hp - unit.battle_hp);
      unit.battle_hp += actual;
      this.pushLog({ type: 'passive', passive: 'Renew', actorName: '💚', targetName: unit.unit_name, targetId: unit.id, targetCell: unit.cellIndex, value: actual, heal: true });
      unit._hot = 0;
      this.clearEffect(unit, 'hot');
      if (actual > 0) this.fireHealTriggers(unit, unit, actual);
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
    this.pushLog({ type: 'action', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, targetId: target.id, value: heal, heal: true });
    // Cost is fifth the channelled heal, not half of what actually landed — the
    // sacrifice is paid even when the ally couldn't absorb the full amount.
    const selfDmg = Math.floor((raw * factor) / 5);
    if (selfDmg > 0) {
      actor.battle_hp = Math.max(0, actor.battle_hp - selfDmg);
      const dead = actor.battle_hp <= 0;
      if (dead) { actor.alive = false; this.applyOnDeathPassives(actor); }
      this.pushLog({ type: 'passive', passive: 'Sacrifice', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, value: selfDmg, heal: false });
    }
    actor.acted_this_round = true;
    return this.afterAction(actor);
  }
  doNone(actor) {
    this.pushLog({ type: 'skip', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, message: `${actor.unit_name} stands ready.` });
    actor.acted_this_round = true;
    return this.afterAction(actor);
  }
  doMothersKiss(actor) {
    const allies = this.combatants.filter(c => c.side === actor.side && c.alive && c.id !== actor.id);
    const sacrificePerAlly = Math.max(1, Math.floor(actor.battle_hp * 0.05));
    const totalCost = sacrificePerAlly * allies.length;
    if (actor.battle_hp <= totalCost) {
      this.pushLog({ type: 'passive', passive: "Mother's Kiss", actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, message: `${actor.unit_name} is too weak to channel Mother's Kiss.`, value: 0 });
      actor.acted_this_round = true;
      return this.afterAction(actor);
    }
    actor.battle_hp = Math.max(1, actor.battle_hp - totalCost);
    this.pushLog({ type: 'passive', passive: "Mother's Kiss", actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, value: totalCost, heal: false });
    for (const a of allies) {
      const healAmt = Math.min(Math.floor(sacrificePerAlly * this.fatigueHealMult()), a.max_hp - a.battle_hp);
      if (healAmt > 0) {
        a.battle_hp += healAmt;
        this.fireHealTriggers(actor, a, healAmt);
        this.pushLog({ type: 'action', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: a.unit_name, targetCell: a.cellIndex, targetId: a.id, value: healAmt, heal: true });
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
    this.pushLog({ type: 'defend', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, message: 'defended (+25 armor this round)' });
    return this.afterAction(actor);
  }
  doAbility(actor, target) {
    actor.defend_armor_bonus = 0;
    const key = actor.unit_data?.ability || actor.unit_data?.active_ability;
    if (actor._actives_locked || actor.used_active || !key) {
      actor.acted_this_round = true;
      return this.afterAction(actor);
    }
    actor.used_active      = true;
    actor.acted_this_round = true;
    executeActiveAbility(actor, target, this.combatants, this.ABILITIES, this);
    return this.afterAction(actor);
  }
  skipTurn(actor) {
    actor.defend_armor_bonus = 0;
    this.pushLog({ type: 'skip', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex });
    actor.acted_this_round = true;
    return this.afterAction(actor);
  }
  afterAction(actor) {
    actor._taunted_by_id = null;
    const win = this.checkWin();
    if (win) { this.done = true; this.winner = win; return true; }
    if (this.getActingOrder().length === 0) this.advanceRound();
    return true;
  }
  // Both of these hand back exactly what was granted, so a re-cast (which
  // refreshes rather than stacks) and the round timer running out take the same
  // path and neither can leave a unit permanently buffed.
  expireFrostArmor(unit) {
    if (!unit) return;
    if (unit._frost_armor_armor) unit.armor = Math.max(0, (unit.armor ?? 0) - unit._frost_armor_armor);
    const res = unit.unit_data?.resistances ?? unit.resistances;
    if (res && unit._frost_armor_school && unit._frost_armor_resist) {
      const school = unit._frost_armor_school;
      res[school] = Math.max(0, (res[school] ?? 0) - unit._frost_armor_resist);
    }
    unit._frost_armor_rounds = 0;
    unit._frost_armor_armor  = 0;
    unit._frost_armor_resist = 0;
    unit._frost_armor_school = null;
  }

  expireStoneForm(unit) {
    if (!unit) return;
    if (unit._stone_form_armor) unit.armor = Math.max(0, (unit.armor ?? 0) - unit._stone_form_armor);
    unit._stone_form_rounds = 0;
    unit._stone_form_armor  = 0;
  }

  advanceRound() {
    for (const c of this.combatants) {
      c.acted_this_round   = false;
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

      if (c._frost_armor_rounds > 0) {
        c._frost_armor_rounds--;
        if (c._frost_armor_rounds === 0) this.expireFrostArmor(c);
      }

      if (c._stone_form_rounds > 0) {
        c._stone_form_rounds--;
        if (c._stone_form_rounds === 0) this.expireStoneForm(c);
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

      c._passives_locked = false;
      c._actives_locked  = false;
    }
    this.fireTrigger('on_round_start', { actor: null, target: null, dmg: 0, dying: null });
    // Reanimate: revive units that were marked for revival last round
    for (const c of this.combatants) {
      if (c._reanimate_pending != null && !c.alive) {
        c.alive = true;
        c.battle_hp = c._reanimate_pending;
        c._reanimate_pending = null;
        this.pushLog({ type: 'passive', passive: 'Reanimate', actorId: c.id, actorName: c.unit_name, actorCell: c.cellIndex, targetName: c.unit_name, targetCell: c.cellIndex, value: c.battle_hp, message: `Reanimate — ${c.unit_name} rises from the dead with ${c.battle_hp} HP!` });
      }
    }
    this.round++;
    this.pushLog({ type: 'round', round: this.round });
    // Environmental-pressure onset notices, once, as each phase begins.
    if (this.round === BATTLE_FATIGUE.fatigue_start_round + 1) {
      this.pushLog({ type: 'notice', message: 'Battle Fatigue sets in — healing grows weaker each round.' });
    }
    if (this.round === BATTLE_FATIGUE.wither_start_round + 1) {
      this.pushLog({ type: 'notice', message: 'The Withering takes hold — every combatant decays each turn.' });
    }
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
        const healAmt = Math.floor(tagged.length * effect.heal_per_tagged_unit * this.fatigueHealMult());
        if (healAmt > 0) {
          for (const c of tagged) {
            const healed = Math.min(healAmt, c.max_hp - c.battle_hp);
            if (healed > 0) c.battle_hp += healed;
          }
          // targetId anchors the animation. light_of_dawn paints a screen-wide
          // band across the anchor's row, so any healed ally is a fine anchor —
          // but without one the client has no cell and plays nothing.
          this.pushLog({ type: 'spell', spell: effect.name, targetName: `all ${effect.tag} allies`, targetId: tagged[0]?.id ?? null, targetCell: tagged[0]?.cellIndex, value: healAmt, heal: true, effect_name: effect.effect_name || null, message: `${effect.name} — all ${effect.tag} allies heal for ${healAmt} (${tagged.length} ${effect.tag} on the field)` });
        }
      }
      else if (effect.type === 'round_damage') {
        const unit = this.combatants.find(c => c.id === effect.unitId);
        if (!unit || !unit.alive) continue;
        // Typed damage, so it obeys the target's resistance the same way a
        // non-physical attack does (see calcDamageWithPassives).
        const resist = (unit.unit_data?.resistances ?? unit.resistances ?? {})[effect.damage_type] ?? 0;
        const dmg    = Math.max(1, Math.floor(effect.amount * (1 - resist / 100)));
        if (unit._invulnerable) continue;   // Unity guardian: spells cannot touch it either
        unit.battle_hp = Math.max(0, unit.battle_hp - dmg);
        this.pushLog({ type: 'spell', spell: effect.name, targetName: unit.unit_name, targetId: unit.id, targetCell: unit.cellIndex, value: dmg, heal: false, message: `${unit.unit_name} takes ${dmg} ${effect.damage_type} damage` });
        if (unit.battle_hp <= 0) { unit.alive = false; this.applyOnDeathPassives(unit); }
      }
      else if (effect.type === 'apply_passive') {
        const unit = this.combatants.find(c => c.id === effect.unitId);
        if (!unit || !unit.alive) continue;
        // resolvePassiveDefs reads unit_data.passive, so a granted passive has
        // to land there — stackPassiveKeys then merges it with any same-named
        // passive the unit already owns (infect 1 + infect 2 -> infect 3).
        if (!unit.unit_data) continue;
        const owned = unit.unit_data.passive ?? unit.unit_data.passive_ability;
        const list  = Array.isArray(owned) ? [...owned] : (owned ? [owned] : []);
        list.push(effect.key);
        unit.unit_data = { ...unit.unit_data, passive: list };
        this.pushLog({ type: 'status', spell: effect.name, targetName: unit.unit_name, targetId: unit.id, targetCell: unit.cellIndex, message: `${unit.unit_name} is afflicted with ${effect.key}` });
      }
      else if (effect.type === 'dispel_per_round') {
        const unit = this.combatants.find(c => c.id === effect.unitId);
        if (unit?.alive) {
          const removed = this.dispelEffects(unit, effect.polarity, effect.count);
          if (removed.length) {
            this.pushLog({ type: 'status', spell: effect.name, targetName: unit.unit_name, targetId: unit.id, targetCell: unit.cellIndex, message: `${unit.unit_name} loses ${removed.map(e => e.key).join(', ')}` });
          }
        }
        // Re-queue for the next round until the duration is spent. Requeue even
        // if the unit died, so the entry drains rather than lingering forever.
        if (effect.remaining > 1) {
          remaining.push({ ...effect, round: this.round + 1, remaining: effect.remaining - 1 });
        }
      }
      else if (effect.type === 'expire_modifier') {
        const unit = this.combatants.find(c => c.id === effect.unitId);
        if (!unit) continue;
        const r = effect.revert || {};
        if (r.armor)      unit.armor      = Math.max(0, (unit.armor      || 0) + r.armor);
        if (r.initiative) unit.initiative = Math.max(1, (unit.initiative || 40) + r.initiative);
        if (r.dmg_mult_div) unit._dmg_mult = (unit._dmg_mult || 1) / r.dmg_mult_div;
        if (r.resistances) {
          if (!unit.unit_data.resistances) unit.unit_data.resistances = {};
          for (const [rType, rVal] of Object.entries(r.resistances)) {
            unit.unit_data.resistances[rType] = Math.max(0, (unit.unit_data.resistances[rType] || 0) + rVal);
          }
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

  // ── Enemy AI ────────────────────────────────────────────────────────────────
  // A light strategy layer: cast abilities only when they'd actually accomplish
  // something and on a sensible target, let a threatened tank defend when the
  // team can heal it and still deal damage, and focus attacks to secure kills.
  // Deliberately shallow — readable heuristics, not a planner.

  // Does this unit's basic action heal allies (target_type 'ally')?
  aiIsHealer(u) { return this.isHealer(u); }

  // Can this unit contribute offense — a normal attacker with power?
  aiIsDamageDealer(u) {
    if (this.aiIsHealer(u)) return false;
    const power = u.unit_data?.action_power ?? u.unit_data?.action?.value ?? 0;
    return power > 0;
  }

  // Picks the best target for a basic action. Healers ALWAYS mend the ally with
  // the lowest current HP (preferring wounded ones, so a full-HP unit is never
  // chosen while someone is hurt); attackers prefer a target they can kill this
  // hit, then soft/low-HP ones.
  aiPickActionTarget(actor, targets) {
    if (!targets.length) return null;
    // Holy Shock can go either way, so the AI decides by need: mend the most
    // hurt ally once someone is meaningfully wounded, otherwise strike. Without
    // this it would fall into the attacker branch and never heal.
    if (this.getActionKey(actor) === 'holy_shock') {
      const wounded = targets
        .filter(c => c.side === actor.side && c.battle_hp / c.max_hp <= 0.6)
        .sort((a, b) => (a.battle_hp / a.max_hp) - (b.battle_hp / b.max_hp))[0];
      if (wounded) return wounded;
      const foes = targets.filter(c => c.side !== actor.side);
      if (!foes.length) return targets[0] ?? null;
      targets = foes; // fall through to the attacker scoring below
    }
    if (this.aiIsHealer(actor)) {
      const wounded = targets.filter(c => c.battle_hp < c.max_hp);
      const pool    = wounded.length ? wounded : targets;
      return pool.slice().sort((a, b) => a.battle_hp - b.battle_hp)[0];
    }
    let best = null, bestScore = -Infinity;
    for (const t of targets) {
      const dmg    = this.calcDamageValue(actor, t);
      const lethal = dmg >= t.battle_hp ? 1 : 0;
      // Kills first; then raw damage; then favour finishing lower-HP targets.
      const score = lethal * 100000 + dmg - t.battle_hp * 0.5;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  // Returns a target to cast the ability on, or null to NOT cast it this turn
  // (so the AI won't waste a heal on the healthy or a cleanse on the clean).
  aiPickAbilityTarget(actor, def, targets) {
    if (!def || !targets.length) return null;
    const p = def.params || {};
    const hasNegative = c => (c._effects || []).some(e => e.polarity === 'negative')
      || (c.dot_dmg > 0) || (c._poison_dmg > 0) || (c._bleed_dmg > 0) || (c._chill_dmg > 0) || (c._healing_reduction > 0);
    const hasPositive = c => (c._effects || []).some(e => e.polarity === 'positive') || (c._dmg_mult || 1) > 1;

    // Resurrect a fallen ally — always worth it when a valid corpse exists.
    if (p.resurrect_hp_pct != null) return targets[0];
    // Cleanse — only if an ally actually carries a debuff.
    if (p.dispel_negative != null) return targets.find(hasNegative) || null;
    // Purge — only if an enemy actually carries a buff.
    if (p.dispel_positive != null) return targets.find(hasPositive) || null;
    // Drain from an ally — only from a healthy-ish donor (never the near-dead).
    if (p.ally_drain_pct != null || p.libation_sacrifice_pct != null) {
      return targets.filter(c => c.id !== actor.id && c.battle_hp / c.max_hp > 0.5)
        .sort((a, b) => b.battle_hp - a.battle_hp)[0] || null;
    }
    // Radiant Surge reads its target's side, so the AI picks by need: mend the
    // worst-hurt ally when one is meaningfully wounded, otherwise strike.
    if (p.radiant_surge_heal != null || p.radiant_surge_damage != null) {
      const wounded = this.combatants
        .filter(c => c.side === actor.side && c.alive && c.battle_hp / c.max_hp <= 0.6)
        .sort((a, b) => (a.battle_hp / a.max_hp) - (b.battle_hp / b.max_hp))[0];
      if (wounded) return wounded;
      const foes = targets.filter(c => c.side !== actor.side);
      return foes.length ? this.aiPickActionTarget(actor, foes) : null;
    }
    // Heal-type ability — only if someone is wounded.
    if (p.lowest_ally_heal_pct != null || p.heal_pct != null || p.ally_heal != null) {
      return targets.filter(c => c.battle_hp < c.max_hp)
        .sort((a, b) => (a.battle_hp / a.max_hp) - (b.battle_hp / b.max_hp))[0] || null;
    }
    // Team/self buff (initiative, etc.) — cast it; earlier is better, and the
    // AI only gets one shot at it anyway.
    if (def.target === 'self' || def.target === 'all_allies' || def.target === 'ally' || def.target === 'ally_any' || def.target === 'ally_tagged') {
      return targets.includes(actor) ? actor : targets[0];
    }
    // Offensive ability — same target logic as an attack (secure kills).
    return this.aiPickActionTarget(actor, targets);
  }

  // A wounded tank should defend when a healer is alive to mend it and someone
  // else can carry the offense — exactly the "hold the line" case. Healers never
  // defend (they should be healing).
  aiShouldDefend(actor) {
    if (this.aiIsHealer(actor)) return false;
    if (actor.battle_hp / actor.max_hp >= 0.4) return false; // only when threatened
    const allies = this.combatants.filter(c => c.side === actor.side && c.alive && c.id !== actor.id);
    const hasHealer = allies.some(a => this.aiIsHealer(a));
    const hasOtherDamage = allies.some(a => this.aiIsDamageDealer(a));
    return hasHealer && hasOtherDamage;
  }

  // Chooses this enemy's whole turn: ability / defend / attack / skip.
  chooseAiAction(actor) {
    const key = actor.unit_data?.ability || actor.unit_data?.active_ability;
    if (key && !actor.used_active && !actor._actives_locked) {
      const def = this.ABILITIES?.[key];
      const abilityTargets = this.getValidTargets(actor, true);
      if (abilityTargets.length) {
        const pick = this.aiPickAbilityTarget(actor, def, abilityTargets);
        if (pick) return { type: 'ability', target: pick };
      }
    }
    if (this.aiShouldDefend(actor)) return { type: 'defend', target: null };
    const targets = this.getValidTargets(actor);
    // No one to act on (e.g. a melee unit with nothing in reach): brace instead
    // of idling — a defending unit is better than a wasted turn.
    if (!targets.length) return { type: 'defend', target: null };
    return { type: 'attack', target: this.aiPickActionTarget(actor, targets) };
  }

  runAiTurns() {
    const newLog = [];
    while (!this.done) {
      const actor = this.currentActor();
      if (!actor || actor.side !== 'enemy') break;
      const before = this.log.length;
      // Turn-start DoTs tick once here, before whichever branch this enemy takes
      // (ability/skip/none/attack all bypass executeAction's own tick — see the
      // { turnStart: false } on the attack branch below).
      this.applyTurnStartTicks(actor);
      if (!actor.alive) { actor.acted_this_round = true; newLog.push(...this.log.slice(before)); continue; }
      if (actor._unity_host_id != null || actor._invulnerable) {
        this.fireTrigger('on_turn_start', { actor, target: actor, dmg: 0, dying: null });
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
      const decision = this.chooseAiAction(actor);
      if (decision.type === 'ability') {
        this.doAbility(actor, decision.target);
      } else if (decision.type === 'defend') {
        this.executeAction(actor, null, 'defend', { turnStart: false });
      } else {
        this.executeAction(actor, decision.target, 'attack', { turnStart: false }); // already ticked at loop top
      }

      // THE TURN MUST ADVANCE. Every branch above is supposed to end with the
      // actor either dead or flagged acted_this_round, but executeAction has one
      // path that returns without doing either — `if (!target) return false`,
      // reachable the moment an action type or a unit's data does not line up
      // with what chooseAiAction produced. currentActor() would then hand back
      // this same unit forever: an infinite loop inside a request, which does
      // not throw, does not time out on its own, and pins the worker until the
      // platform kills it. The battle is simply gone.
      //
      // So: if the actor is still standing and still owed a turn, take it. The
      // unit forfeits its action, the fight continues, and the log says so.
      if (actor.alive && !actor.acted_this_round) {
        console.error('[battle] AI turn produced no action', {
          unit: actor.unit_name, cell: actor.cellIndex, decision: decision?.type,
          action: actor.unit_data?.action, hasTarget: !!decision?.target,
        });
        this.pushLog({
          type: 'skip', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex,
          message: `${actor.unit_name} hesitates.`,
        });
        actor.acted_this_round = true;
        this.afterAction(actor);
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
      _encounter_spell_cast: this._encounter_spell_cast ?? false,
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
        intercept_bonus_pct: c.intercept_bonus_pct ?? 0,
        _base_max_hp:     c._base_max_hp ?? c.max_hp,
        _fanaticism_bonus: c._fanaticism_bonus ?? 0,
        acted_this_round: c.acted_this_round,
        used_active:      c.used_active ?? false,
        _rosterId:        c._rosterId ?? null,
        buffs: {
          dot_dmg:             c.dot_dmg,
          _hot:                c._hot,
          _stacks:             c._stacks,
          _flags:              c._flags,
          _granted_buffs:      c._granted_buffs,
          _deferred_dmg:       c._deferred_dmg,
          // Standing effect from an active — must survive a reload or the
          // caster silently stops paying and healing mid-battle.
          _mothers_blessing:     c._mothers_blessing,
          _mothers_blessing_pct: c._mothers_blessing_pct,
          _debuff_reduction:   c._debuff_reduction,
          _healing_reduction:  c._healing_reduction,
          _dmg_mult:           c._dmg_mult,
          _fear_dmg_reduction: c._fear_dmg_reduction,
          _terror_reduction:   c._terror_reduction,
          _terror_rounds:      c._terror_rounds,
          _sanctuary_rounds:   c._sanctuary_rounds,
          _sanctuary_resist:   c._sanctuary_resist,
          // Timed armor buffs. Without these the round counter resets on every
          // reload and the armor they granted is never handed back.
          _frost_armor_rounds: c._frost_armor_rounds ?? 0,
          _frost_armor_armor:  c._frost_armor_armor  ?? 0,
          _frost_armor_resist: c._frost_armor_resist ?? 0,
          _frost_armor_school: c._frost_armor_school ?? null,
          _stone_form_rounds:  c._stone_form_rounds  ?? 0,
          _stone_form_armor:   c._stone_form_armor   ?? 0,
          _parry_available:    c._parry_available,
          _aegis_armor:        c._aegis_armor,
          _aegis_resists:      c._aegis_resists,
          _bleed_dmg:          c._bleed_dmg ?? 0,
          _chill_dmg:          c._chill_dmg ?? 0,
          _poison_dmg:         c._poison_dmg ?? 0,
          _dot_type:           c._dot_type ?? null,
          _dot_permanent:      c._dot_permanent ?? 0,
          _bleed_permanent:    c._bleed_permanent ?? 0,
          _dot_source_key:   c._dot_source_key   ?? null,
          _poison_source_key: c._poison_source_key ?? null,
          _bleed_source_key: c._bleed_source_key ?? null,
          _chill_source_key: c._chill_source_key ?? null,
          _dodge_count:        c._dodge_count ?? 0,
          _effects:            c._effects ?? [],
          _effect_seq:         c._effect_seq ?? 0,
          _invulnerable:       c._invulnerable,
          _untargetable:       c._untargetable,
          _unity_host_id:      c._unity_host_id,
          _unity_bonded_id:    c._unity_bonded_id,
          _mothers_kiss:       c._mothers_kiss,
          _sorrow_source_ids:  c._sorrow_source_ids,
          _reanimate_pending:  c._reanimate_pending ?? null,
          _stun_rounds:        c._stun_rounds ?? 0,
          _stun_initiative_lost: c._stun_initiative_lost ?? 0,
          _passives_locked:    c._passives_locked ?? false,
          _actives_locked:     c._actives_locked  ?? false,
          _taunted_by_id:      c._taunted_by_id ?? null,
          _clear_shot_active:  c._clear_shot_active ?? false,
          _clear_shot_initiative_amt: c._clear_shot_initiative_amt ?? 0,
          _clear_shot_dmg_amt: c._clear_shot_dmg_amt ?? 0,
          _bark_counts: c._bark_counts ?? {},
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
      c.used_active        = s.used_active ?? false;
      if (s.initiative    != null) c.initiative    = s.initiative;
      if (s.max_hp        != null) c.max_hp        = s.max_hp;
      if (s.armor         != null) c.armor         = s.armor;
      c.defend_armor_bonus = s.defend_armor_bonus ?? 0;
      c.martyrdom_pct      = s.martyrdom_pct      ?? 0;
      c._lifesteal         = s._lifesteal          ?? 0;
      c.intercept_bonus_pct = s.intercept_bonus_pct ?? 0;
      c._base_max_hp        = s._base_max_hp ?? c.max_hp;
      c._fanaticism_bonus   = s._fanaticism_bonus ?? 0;
      if (s._rosterId     != null) c._rosterId     = s._rosterId;
      const b              = s.buffs || {};
      c.dot_dmg            = b.dot_dmg            ?? 0;
      c._poison_dmg        = b._poison_dmg        ?? 0;
      c._dot_type          = b._dot_type          ?? null;
      c._dot_source_key   = b._dot_source_key   ?? null;
      c._poison_source_key = b._poison_source_key ?? null;
      c._bleed_source_key = b._bleed_source_key ?? null;
      c._chill_source_key = b._chill_source_key ?? null;
      c._hot               = b._hot               ?? 0;
      c._stacks            = b._stacks            || {};
      c._flags             = b._flags             || {};
      c._granted_buffs     = b._granted_buffs     || [];
      c._deferred_dmg      = b._deferred_dmg      ?? 0;
      c._mothers_blessing     = b._mothers_blessing     ?? false;
      c._mothers_blessing_pct = b._mothers_blessing_pct ?? 10;
      c._debuff_reduction  = b._debuff_reduction  ?? 0;
      c._healing_reduction = b._healing_reduction ?? 0;
      c._dmg_mult          = b._dmg_mult          ?? 1;
      c._fear_dmg_reduction = b._fear_dmg_reduction ?? 0;
      c._terror_reduction  = b._terror_reduction  ?? 0;
      c._terror_rounds     = b._terror_rounds     ?? 0;
      c._sanctuary_rounds  = b._sanctuary_rounds  ?? 0;
      c._sanctuary_resist  = b._sanctuary_resist  ?? null;
      c._frost_armor_rounds = b._frost_armor_rounds ?? 0;
      c._frost_armor_armor  = b._frost_armor_armor  ?? 0;
      c._frost_armor_resist = b._frost_armor_resist ?? 0;
      c._frost_armor_school = b._frost_armor_school ?? null;
      c._stone_form_rounds  = b._stone_form_rounds  ?? 0;
      c._stone_form_armor   = b._stone_form_armor   ?? 0;
      c._parry_available   = b._parry_available   ?? false;
      c._aegis_armor       = b._aegis_armor       ?? 0;
      c._aegis_resists     = b._aegis_resists     || {};
      c._bleed_dmg         = b._bleed_dmg         ?? 0;
      c._chill_dmg         = b._chill_dmg         ?? 0;
      c._dot_permanent     = b._dot_permanent     ?? 0;
      c._bleed_permanent   = b._bleed_permanent   ?? 0;
      c._dodge_count       = b._dodge_count       ?? 0;
      c._effects           = b._effects           || [];
      c._effect_seq        = b._effect_seq        ?? 0;
      c._effects           = b._effects           ?? [];
      c._invulnerable      = b._invulnerable      ?? false;
      c._untargetable      = b._untargetable      ?? false;
      c._unity_host_id     = b._unity_host_id     ?? null;
      c._unity_bonded_id   = b._unity_bonded_id   ?? null;
      c._mothers_kiss      = b._mothers_kiss      ?? false;
      c._sorrow_source_ids = b._sorrow_source_ids ?? [];
      c._reanimate_pending = b._reanimate_pending ?? null;
      c._stun_rounds       = b._stun_rounds       ?? 0;
      c._stun_initiative_lost = b._stun_initiative_lost ?? 0;
      c._passives_locked   = b._passives_locked   ?? false;
      c._actives_locked    = b._actives_locked    ?? false;
      c._taunted_by_id      = b._taunted_by_id ?? null;
      c._clear_shot_active  = b._clear_shot_active ?? false;
      c._clear_shot_initiative_amt = b._clear_shot_initiative_amt ?? 0;
      c._clear_shot_dmg_amt = b._clear_shot_dmg_amt ?? 0;
      c._bark_counts = b._bark_counts ?? {};
    }
    engine.round  = battleData.round;
    engine.done   = battleData.done;
    engine.winner = battleData.winner;
    engine.pendingRoundEffects   = battleData.pendingRoundEffects || [];
    engine._encounter_spell_cast = battleData._encounter_spell_cast ?? false;
    engine.log    = [];
    return engine;
  }
  // Casts the encounter's one hardcoded spell (see data/embark.js
  // getEncounterSpellId - REGION_ENCOUNTERS[region][level].spell_id), once, at
  // battle start. This mirrors the player's one-spell-per-battle rule exactly:
  // there is no per-unit caster, the level itself "casts" this. spellId can
  // reference ANY spell in data/spells.js - a faction spell, or one of the
  // SPELLS.enemies placeholders - same catalog, same effect engine as player
  // casts. Only logs that a hidden spell was cast - never the spell's name or
  // effect.
  // Counter-spells (Ward / Nihilism / Decay) negate the encounter spell when its
  // category matches. Recorded by the player's cast so castEncounterSpell can
  // check it — which means the encounter spell must be cast AFTER the player's
  // (see routes/index.js /battle/create). The encounter is the PvE stand-in for
  // an opposing player, so PvP will set this from the opponent's pick instead.
  declareCounter(category) {
    if (category) this._counter_category = category;
  }
  castEncounterSpell(spellId) {
    if (!spellId || this._encounter_spell_cast) return;
    this._encounter_spell_cast = true;
    const spellDef = Object.values(SPELLS).flat().find(s => s.id === spellId);
    if (!spellDef) return;
    if (this._counter_category && spellDef.category === this._counter_category) {
      // Tell the player their counter earned its keep, without revealing which
      // spell it ate — the encounter's spell stays hidden either way.
      this.pushLog({
        type:    'notice',
        message: 'The enemy reaches for a hidden power — your counter-spell smothers it.',
      });
      return;
    }
    this.pushLog({
      type:    'notice',
      message: 'The enemy channels a hidden power before the battle begins.',
    });
    applyEnemySpellEffect(this, null, spellDef);
  }
  // Resolves the combatants a spell/cast affects, generalized by which side is
  // casting (so the exact same scopes used by player prep-spells - 'all_allies',
  // 'single_enemy', 'tag_allies', etc. - work identically for an enemy caster,
  // just with ally/enemy flipped relative to the caster's own side).
  getSpellTargets(spellDef, casterSide, targetId = null) {
    const scope     = spellDef.target_scope || '';
    const params     = spellDef.params || {};
    const allySide   = casterSide;
    const enemySide  = casterSide === 'player' ? 'enemy' : 'player';

    if (scope === 'all_allies')   return this.combatants.filter(c => c.side === allySide  && c.alive);
    if (scope === 'all_enemies')  return this.combatants.filter(c => c.side === enemySide && c.alive);
    if (scope === 'single_ally')  return this.combatants.filter(c => c.side === allySide  && c.alive && (String(c._rosterId) === String(targetId) || String(c._sourceId) === String(targetId) || String(c.id) === String(targetId)));
    if (scope === 'single_enemy') return this.combatants.filter(c => c.side === enemySide && c.alive && (String(c.id) === String(targetId) || String(c._sourceId) === String(targetId)));
    if (scope === 'tag_allies') {
      const tag = params.tag_required;
      return this.combatants.filter(c => c.side === allySide && c.alive && (c.unit_data?.tags ?? []).includes(tag));
    }
    if (scope === 'tag_enemies') {
      const tag = params.tag_required;
      return this.combatants.filter(c => c.side === enemySide && c.alive && (c.unit_data?.tags ?? []).includes(tag));
    }
    if (scope === 'random_enemy') {
      const pool = this.combatants.filter(c => c.side === enemySide && c.alive);
      if (!pool.length) return [];
      return [pool[Math.floor(Math.random() * pool.length)]];
    }
    return [];
  }

  // Applies the common param-based spell effects (heal_pct, armor_boost, etc.)
  // to a resolved target list. This is the same effect application used for
  // player prep-spells (routes/index.js /battle/create) - shared, not duplicated.
  //
  // Params fall into three groups:
  //   * instant, permanent-for-the-battle (armor_boost, damage_boost, ...)
  //   * instant but time-limited - the same params plus `duration_rounds`, which
  //     schedules an 'expire_modifier' that undoes exactly what was applied
  //   * deferred - round_damage / apply_passive / dispel_per_round, which queue a
  //     pendingRoundEffect that fires at the start of the round they name
  // Duration and deferral are orthogonal to the param itself, so a new timed
  // buff usually needs no new code here at all.
  applySpellParams(targets, params = {}) {
    const duration = params.duration_rounds || 0;

    for (const c of targets) {
      // Undo ledger for this unit, filled in as timed params are applied.
      const revert = {};

      if (params.heal_pct)             { const heal = Math.floor(c.max_hp * params.heal_pct * this.fatigueHealMult()); c.battle_hp = Math.min(c.max_hp, (c.battle_hp || 0) + heal); }
      if (params.armor_boost)          { c.armor = (c.armor || 0) + params.armor_boost; revert.armor = -params.armor_boost; }
      if (params.armor_reduction)      c.armor      = Math.max(0, Math.floor((c.armor || 0) * (1 - params.armor_reduction)));
      if (params.armor_flat_reduction) {
        // Flat shred, unlike armor_reduction's percentage. Only give back what
        // was actually taken, so a unit at 3 armor doesn't rebound to 10.
        const taken = Math.min(c.armor || 0, params.armor_flat_reduction);
        c.armor = (c.armor || 0) - taken;
        revert.armor = (revert.armor || 0) + taken;
      }
      if (params.max_hp_reduction)     { const cut = Math.floor(c.max_hp * params.max_hp_reduction); c.max_hp = Math.max(1, c.max_hp - cut); c.battle_hp = Math.min(c.battle_hp, c.max_hp); }
      if (params.initiative_boost)     { c.initiative = (c.initiative || 40) + params.initiative_boost; revert.initiative = -params.initiative_boost; }
      if (params.initiative_reduction) c.initiative = Math.max(1, Math.floor((c.initiative || 40) * (1 - params.initiative_reduction)));
      // Flat counterpart to initiative_reduction's percentage — "-5 initiative"
      // rather than "-20% initiative". Only give back what was actually taken.
      if (params.initiative_flat_reduction) {
        const taken = Math.min((c.initiative || 40) - 1, params.initiative_flat_reduction);
        c.initiative = Math.max(1, (c.initiative || 40) - taken);
        revert.initiative = (revert.initiative || 0) + taken;
      }
      // Immediate damage, as opposed to round_damage's deferred tick. Physical
      // damage is reduced by the target's armor (1% per point, as in
      // calcDamageWithPassives); typed damage obeys the matching resistance.
      if (params.damage_flat) {
        const type = params.damage_type || 'physical';
        let dmg;
        if (type === 'physical') {
          const armor = Math.max(0, (c.armor ?? 0) + (c.defend_armor_bonus || 0));
          dmg = Math.max(1, Math.floor(params.damage_flat * (1 - armor / 100)));
        } else {
          const resist = (c.unit_data?.resistances ?? c.resistances ?? {})[type] ?? 0;
          dmg = Math.max(1, Math.floor(params.damage_flat * (1 - resist / 100)));
        }
        c.battle_hp = Math.max(0, (c.battle_hp || 0) - dmg);
        this.pushLog({
          type: 'spell', targetName: c.unit_name, targetId: c.id, targetCell: c.cellIndex,
          value: dmg, heal: false,
          message: `${c.unit_name} takes ${dmg} ${type} damage`,
        });
        if (c.battle_hp <= 0 && c.alive) { c.alive = false; this.applyOnDeathPassives(c); }
      }
      if (params.damage_boost)         { c._dmg_mult = (c._dmg_mult || 1) * (1 + params.damage_boost); revert.dmg_mult_div = (revert.dmg_mult_div || 1) * (1 + params.damage_boost); }
      if (params.damage_dealt_reduction_pct) {
        const factor = 1 - params.damage_dealt_reduction_pct / 100;
        c._dmg_mult = (c._dmg_mult || 1) * factor;
        revert.dmg_mult_div = (revert.dmg_mult_div || 1) * factor;
      }
      if (params.lifesteal)            c._lifesteal = (c._lifesteal || 0) + params.lifesteal;
      if (params.martyrdom_redirect_pct && c.side === 'player') c.martyrdom_pct = (c.martyrdom_pct || 0) + params.martyrdom_redirect_pct;
      if (params.intercept_chance_pct) c.intercept_bonus_pct = (c.intercept_bonus_pct || 0) + params.intercept_chance_pct;
      if (params.strip_passives)       c._passives_locked = true;
      if (params.resistances) {
        for (const [rType, rVal] of Object.entries(params.resistances)) {
          if (!c.unit_data.resistances) c.unit_data.resistances = {};
          c.unit_data.resistances[rType] = (c.unit_data.resistances[rType] || 0) + rVal;
          revert.resistances = revert.resistances || {};
          revert.resistances[rType] = (revert.resistances[rType] || 0) - rVal;
        }
      }
      if (params.resist_reduction) {
        for (const [rType, rVal] of Object.entries(params.resist_reduction)) {
          if (!c.unit_data.resistances) c.unit_data.resistances = {};
          const taken = Math.min(c.unit_data.resistances[rType] || 0, rVal);
          c.unit_data.resistances[rType] = (c.unit_data.resistances[rType] || 0) - taken;
          revert.resistances = revert.resistances || {};
          revert.resistances[rType] = (revert.resistances[rType] || 0) + taken;
        }
      }

      // Timed stat changes are also dispellable effects, so Purgation and the
      // like can strip them early — registerEffect's revert runs the same undo.
      if (duration && Object.keys(revert).length) {
        const polarity = params.resist_reduction || params.armor_flat_reduction || params.damage_dealt_reduction_pct
          || params.initiative_flat_reduction
          ? 'negative' : 'positive';
        this.pendingRoundEffects.push({
          type:   'expire_modifier',
          round:  this.round + duration,
          unitId: c.id,
          revert,
        });
      }

      // Deferred: a flat hit of typed damage on a named round.
      if (params.round_damage) {
        this.pendingRoundEffects.push({
          type:   'round_damage',
          round:  params.round_damage.round,
          unitId: c.id,
          amount: params.round_damage.amount,
          damage_type: params.round_damage.damage_type,
          name:   params._spell_name,
        });
      }

      // Deferred: hang a passive on the target on a named round (e.g. Infect 2).
      if (params.apply_passive) {
        this.pendingRoundEffects.push({
          type:   'apply_passive',
          round:  params.apply_passive.round,
          unitId: c.id,
          key:    params.apply_passive.key,
          name:   params._spell_name,
        });
      }

      // Deferred + recurring: strip N effects of a polarity, every round, for
      // `rounds` rounds. The handler re-queues itself until the count runs out.
      if (params.dispel_per_round) {
        this.pendingRoundEffects.push({
          type:     'dispel_per_round',
          round:    this.round,
          unitId:   c.id,
          polarity: params.dispel_per_round.polarity || 'positive',
          count:    params.dispel_per_round.count ?? 1,
          remaining: params.dispel_per_round.rounds ?? 1,
          name:     params._spell_name,
        });
      }
    }

    // Battlefield-wide locks are deliberately not per-target: they hit every
    // combatant on BOTH sides, the caster's own units included. advanceRound()
    // clears both flags each round, so a 1-round lock needs no expiry entry.
    if (params.lock_all_passives_rounds) {
      for (const c of this.combatants) c._passives_locked = true;
    }
    if (params.lock_all_actives_rounds) {
      for (const c of this.combatants) c._actives_locked = true;
    }
  }

  // Convenience wrapper: resolve targets for casterSide then apply params. This
  // is the generic path both player prep-spells and enemy prepared-spells run
  // through; it does not cover the handful of bespoke effect_types (e.g.
  // 'round_trigger_heal', 'tag_count_buff') that are still handled specially in
  // routes/index.js for player casts.
  castSpell(spellDef, { casterSide = 'player', targetId = null } = {}) {
    const targets = this.getSpellTargets(spellDef, casterSide, targetId);
    // _spell_name only rides along so deferred effects can name themselves in
    // the log; it is never read as a gameplay param.
    this.applySpellParams(targets, { ...(spellDef.params || {}), _spell_name: spellDef.name });
    // Spells resolve before round 1 has "advanced", and firePendingRoundEffects
    // otherwise only runs from advanceRound() — so anything scheduled for the
    // current round would never fire. Drain it here.
    this.firePendingRoundEffects();
    return targets;
  }

  // Every entry carries the HP the field is left on once that event has
  // resolved, so the client can move the numbers as it plays each entry rather
  // than snapping every bar at the end of the whole exchange (which read as
  // "my spell did nothing until the enemy had taken its turn").
  //
  // Only what CHANGED since the previous entry is stamped, and the values are
  // absolute, not deltas — so a replay lands on the right numbers no matter
  // where it starts, and an entry nothing died or bled for costs nothing.
  pushLog(entry) {
    try {
      if (!this._hpSeen) this._hpSeen = {};
      const hp = {};
      for (const c of this.combatants || []) {
        if (c?.id == null) continue;
        if (this._hpSeen[c.id] !== c.battle_hp) {
          hp[c.id] = c.battle_hp;
          this._hpSeen[c.id] = c.battle_hp;
        }
      }
      if (Object.keys(hp).length) entry.hp = hp;
    } catch {
      // Never let bookkeeping break combat resolution.
    }
    this.log.push(entry);
  }

  // Cosmetic combat barks - see data/combat_barks.js for the rule format and
  // the decaying-chance rules. Purely flavor text; never affects gameplay state
  // beyond the log, and must never be allowed to throw into combat resolution.
  barkTags(unit) {
    if (!unit) return [];
    const tags = unit.unit_data?.tags ?? unit.tags ?? [];
    return Array.isArray(tags) ? tags.filter(Boolean) : [];
  }

  // The unit definition's faction code: 'e' Empire, 'g' Grail, 'd' Choir, plus
  // the enemy pools ('dm' bone knights, 'mv' frost things, 'opb' heralds).
  // Rides on unit_data for the same reason tags do — routes/index.js spreads the
  // whole def into unit_data before the row ever reaches the engine.
  barkFaction(unit) {
    return unit?.unit_data?.f ?? unit?.f ?? null;
  }

  // Returns the filter's specificity score, or -1 if the unit does not match.
  // An absent filter matches anything at score 0.
  barkFilterScore(filter, unit) {
    if (!filter) return 0;
    if (!unit) return -1;
    let score = 0;
    if (filter.name != null) {
      if (unit.unit_name !== filter.name) return -1;
      score += 100; // a named rule must always beat any tag combination
    }
    // Faction outranks any single tag (+3 vs +2) because it is the thing that
    // decides the VOICE: Knight, Holy, Spirit, Zombie and Construct all span
    // several factions, and an Empire zealot and a Grail mourner cannot share
    // lines. A unit whose def carries no faction fails every faction rule and
    // falls through to the neutral tag rule instead of borrowing a voice.
    if (filter.faction != null) {
      const want = Array.isArray(filter.faction) ? filter.faction : [filter.faction];
      const own  = this.barkFaction(unit);
      if (!own || !want.includes(own)) return -1;
      score += 3;
    }
    const tags = this.barkTags(unit);
    const wanted = filter.tags ?? (filter.tag != null ? [filter.tag] : []);
    for (const t of wanted) {
      if (!tags.includes(t)) return -1;
      score += 2;
    }
    // `not` is a pure gate and scores nothing: a rule must not out-rank a more
    // specific one just by listing more exclusions.
    const banned = filter.not == null ? [] : (Array.isArray(filter.not) ? filter.not : [filter.not]);
    for (const t of banned) {
      if (tags.includes(t)) return -1;
    }
    return score;
  }

  checkBark(triggerKey, owner, ctx = {}) {
    if (!owner) return;
    if (triggerKey === 'heal_low_hp') {
      if (ctx.preHealRatio == null || ctx.preHealRatio >= HEAL_BARK_THRESHOLD_PCT / 100) return;
    }

    // Chance decays per unit, per trigger, per battle; check it before the
    // (more expensive) rule scan so most calls cost almost nothing.
    owner._bark_counts = owner._bark_counts || {};
    const spoken  = owner._bark_counts[triggerKey] ?? 0;
    const chances = BARK_CHANCES[triggerKey] ?? [];
    const chance  = chances[spoken] ?? 0;
    if (chance <= 0 || Math.random() >= chance) return;

    let best = -1;
    let pool = [];    // English lines
    let poolRu = [];  // Russian lines, kept index-aligned with pool
    for (const rule of COMBAT_BARKS) {
      if (rule.trigger !== triggerKey) continue;
      const aScore = this.barkFilterScore(rule.actor, owner);
      if (aScore < 0) continue;
      const tScore = this.barkFilterScore(rule.target, ctx.target);
      if (tScore < 0) continue;
      const score = aScore + tScore;
      if (score < best) continue;
      if (score > best) { best = score; pool = []; poolRu = []; }
      const lines = rule.lines ?? [];
      pool.push(...lines);
      // Pad ru so it stays index-aligned even if a rule lacks/short lines_ru.
      poolRu.push(...lines.map((_, i) => (rule.lines_ru ?? [])[i] ?? ''));
    }
    if (!pool.length) return;

    owner._bark_counts[triggerKey] = spoken + 1;
    const idx = Math.floor(Math.random() * pool.length);
    // Carry both languages; the client picks by the viewer's language (no fallback).
    this.pushLog({ type: 'bark', actorId: owner.id, actorId: owner.id, actorName: owner.unit_name, actorCell: owner.cellIndex, text: pool[idx], text_ru: poolRu[idx] });
  }
}
module.exports = { BattleEngine, getAbilities };