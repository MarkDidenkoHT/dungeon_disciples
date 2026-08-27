const { runTrigger, calcDamageWithPassives, getAbilityTargets, executeActiveAbility, stackPassiveKeys, effectiveArmor, effectiveResist, MITIGATION_CAP_PCT, addArmor, addResist, clampDefenses } = require('./passive-processor');
const { filterByTagRules } = require('./tag-rules.js');
// Inspiration's reach is also the 'column_adjacent' relation a battle-prep
// preview draws from, so the rule is defined once, there.
const { columnAdjacentCells } = require('../data/formation_synergies.js');
const { SPELLS } = require('../data/spells');
const { COMBAT_BARKS, BARK_CHANCES, HEAL_BARK_THRESHOLD_PCT } = require('../data/combat_barks');

// Anti-stalemate / anti-heal-abuse pressure. Environmental — applies to BOTH
// sides equally, so it also works for PvP later. All tunable here.
//   Battle Fatigue: from the round AFTER fatigue_start_round, every point of HP
//     restored (heals, lifesteal, HoT, drains — everything) is reduced by
//     fatigue_pct_per_round more, capped at fatigue_max_pct.
//   Withering: from the round AFTER wither_start_round, each unit loses
//     wither_pct_max_hp PER STEP of its max HP as true damage at the start of
//     its turn, gaining a step each round up to wither_max_steps
//     (can kill — that's what forces a resolution).
const BATTLE_FATIGUE = {
  fatigue_start_round: 5,
  fatigue_pct_per_round: 10,
  fatigue_max_pct: 50,
  wither_start_round: 10,
  // Per STEP, and one step is gained per round after wither_start_round. It used
  // to be a flat 5% forever, which meant the anti-stall system stopped applying
  // any new pressure the moment it began: with healing only capped at -50%, a
  // team mending more than 10% of max HP a turn out-sustained it indefinitely
  // and the stall it exists to break never broke. Capped so it ends at 25%
  // rather than climbing without limit.
  wither_pct_max_hp: 5,
  wither_max_steps: 5,
};

// ── Shield and Decay ────────────────────────────────────────────────────────
// Two mirrored POOLS, both carried on the unit and both capped at a share of
// its own max HP, so neither scales past the body it is attached to:
//
//   _shield  absorbs incoming DAMAGE  point for point, and is spent doing it
//   _decay   absorbs incoming HEALING point for point, and is spent doing it
//
// The cap is what keeps them honest — a stack applied twenty times on a
// 40 HP recruit cannot exceed 20, so neither pool can make a unit unkillable
// or unhealable no matter how many applications land. Both are expressed as a
// percentage of max_hp rather than a flat number for the same reason: the same
// ability reads the same on a hero and on a chaff unit.
const POOL_CAP_PCT = 50;

// Bracing. Added to the unit's armor AND to every resistance for the round, so
// it works against a sword and a firebolt alike — it used to feed armor only,
// and armor is read exclusively in the physical damage branch, so defending did
// nothing whatsoever against fire, cold, death, life, nature or air. Expressed
// in the game's own percentage-point currency rather than as a hidden
// multiplier, so the player can see what it bought: the inspector already draws
// armor and resistance deltas.
const DEFEND_BONUS = 25;

// How each `recordGrantedBuff` type reads on a portrait tooltip. Keyed by the
// same strings the callers already pass, so a new grant type shows its own name
// rather than nothing.
const STAT_GRANT_LABELS = {
  max_hp:       'max HP',
  armor:        'armor',
  initiative:   'initiative',
  action_power: 'power',
  all_resist:   'all resists',
  damage:       'damage',
};

// ── Power ───────────────────────────────────────────────────────────────────
// The per-cast spell currency, earned inside the battle: each side's HERO gains
// one point every time it acts, capped, and stops earning the moment it dies.
// Crystals now only pay to RESEARCH a spell (POST /spells/research); casting is
// paid for here, and in the hero's turn, because casting IS its action.
//
// Both sides use the same rule — an enemy boss banks power exactly as the
// player's hero does, which is what lets an encounter run its own two spells
// without a separate mechanism.
const POWER_MAX = 5;
const POWER_PER_HERO_ACTION = 1;
// What each side banks before the first turn. See the constructor for why this
// is not zero.
const POWER_START = 1;

// Mirrors spellParamsAtPower in data/spells.js. Duplicated rather than imported
// because that module is ESM and this one is CommonJS — the same reason
// BATTLE_FATIGUE is duplicated in the client. If the scaling rule changes,
// change it in both.
function scaleSpellParams(spell, power) {
  const out = JSON.parse(JSON.stringify(spell?.params || {}));
  if (!spell) return out;
  const steps = Math.max(0, (Number(power) || 0) - (spell.power_cost ?? 1));
  const bump = (target, key, amount) => {
    const path = String(key).split('.');
    let node = target;
    for (let i = 0; i < path.length - 1; i++) {
      if (node[path[i]] == null || typeof node[path[i]] !== 'object') node[path[i]] = {};
      node = node[path[i]];
    }
    const leaf = path[path.length - 1];
    node[leaf] = (Number(node[leaf]) || 0) + amount;
  };
  for (const [key, per] of Object.entries(spell.scaling || {})) bump(out, key, per * steps);
  if ((Number(power) || 0) >= POWER_MAX) {
    for (const [key, amount] of Object.entries(spell.max_power_bonus || {})) bump(out, key, amount);
  }
  return out;
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
      this.power = { player: 0, enemy: 0, ...(state.power || {}) };
    } else {
      this.combatants = [];
      this.round      = 1;
      this.log        = [];
      this.done       = false;
      this.winner     = null;
      this.pendingRoundEffects   = [];
      // Power never carries between battles — the second fight of a run must not
      // open on a full bank — but each side STARTS with one.
      //
      // It used to start at zero, which meant a hero's cast action was dead for
      // the whole of round one: nothing to spend, so the button was disabled at
      // the exact moment a new player pokes at it. With the hero's only action
      // now being the cast, opening at zero would leave it with nothing to do at
      // all. One is enough to make round one a decision — cheapest spell now, or
      // attack and bank toward something bigger.
      this.power = { player: POWER_START, enemy: POWER_START };
    }
  }

  // ── Power ─────────────────────────────────────────────────────────────────
  // The hero of a side: the flagged roster unit for the player, and for the
  // enemy whichever combatant carries spells (an encounter boss). Only a LIVING
  // hero earns, so killing it shuts the other side's casting down for good.
  // Living units on `side` carrying `tag`. The unit of account for every
  // "per Zombie / per Caster / per Knight" effect, so they all count alike.
  tagCountFor(side, tag) {
    if (!tag) return 0;
    return this.combatants.filter(c =>
      c.side === side && c.alive && (c.unit_data?.tags ?? c.tags ?? []).includes(tag)
    ).length;
  }

  // A protector's own intercept chance: flat, or scaled by how many of the tag
  // stand with it — a Knight line covers its own better the more of it there is.
  // Read in two places (the "is anyone able to intercept?" filter and the roll
  // itself), which must never disagree.
  interceptChanceOf(unit, interceptDef) {
    const ip = interceptDef?.params;
    if (!ip) return 0;
    if (ip.intercept_chance_pct_per_tag != null) {
      return ip.intercept_chance_pct_per_tag * this.tagCountFor(unit.side, ip.tag_required);
    }
    return ip.intercept_chance_pct ?? 0;
  }

  heroFor(side) {
    return this.combatants.find(c => c.side === side && c._is_hero) || null;
  }

  powerFor(side) { return this.power?.[side] ?? 0; }

  // Called from afterAction, so every route a hero's turn can take — attack,
  // ability, defend, a pool action, even standing ready — pays the same.
  // Casting is excluded by the caster itself: it spends, it does not earn.
  gainPower(actor) {
    if (!actor?._is_hero || !actor.alive) return;
    const side   = actor.side;
    const before = this.powerFor(side);
    const after  = Math.min(POWER_MAX, before + POWER_PER_HERO_ACTION);
    if (after === before) return;
    this.power[side] = after;
    this.pushLog({
      type: 'power', side, actorId: actor.id, actorName: actor.unit_name,
      actorCell: actor.cellIndex, value: after - before, total: after,
    });
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
    const combatant = {
      id:         uniqueId,
      _rosterId:  side === 'player' ? (unit._rosterId || unit.id || null) : null,
      _sourceId:  unit.id || null,
      unit_name:  unit.unit_name || data.name || 'Unknown',
      // A COMBATANT-OWNED copy, not the caller's object.
      //
      // `data` for an enemy is a shallow spread of its definition in
      // data/units.js (see getEncounter), so `resistances` was literally the
      // same object as the module-level def. Dissipate, Shatter, Condemn and
      // every other resist-shredding effect write into it in place — which meant
      // they were editing the game's own data: permanently, for every player, on
      // every battle, accumulating until the resistance hit zero and staying
      // there until the process restarted.
      //
      // Only the nested objects that get mutated need cloning; the flat fields
      // are replaced wholesale or never written.
      unit_data:  { ...data, resistances: { ...(data.resistances || {}) } },
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
      _shield:            0,   // damage this unit can still absorb  (see POOL_CAP_PCT)
      _decay:             0,   // healing this unit can still lose   (see POOL_CAP_PCT)
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
      // Stack COUNTS, kept purely so the client can draw "Rage x3" on the
      // portrait. The bonuses themselves live in _dmg_mult / armor / resists —
      // these never feed back into any calculation.
      _rage_stacks:       0,
      _fanaticism_stacks: 0,
      _aegis_stacks:      0,
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
      _passives_locked_rounds: 0,
      _actives_locked_rounds:  0,
      _taunted_by_id:      null,
      _clear_shot_active:  false,
      _clear_shot_initiative_amt: 0,
      _clear_shot_dmg_amt: 0,
      _bark_counts: {},
      // Drives the power economy. The player's hero is flagged on the roster
      // row; an enemy is a "hero" when the encounter gave it spells to cast.
      _is_hero: !!(unit.is_hero || data.is_hero || (Array.isArray(data.spells) && data.spells.length > 0)),
      _spells:  Array.isArray(data.spells) ? data.spells : [],
      // Frozen copy of the stats a buff/debuff can move, taken before anything
      // has been applied. Armor, initiative and resistances are all mutated in
      // place during a battle, so without this there is nothing left to compare
      // the live numbers against and the inspector can only show a bare value
      // that looks identical whether or not the unit is buffed.
      _base_stats: {
        max_hp:       maxHp,
        armor:        data.armor ?? 0,
        initiative:   data.initiative ?? 40,
        action_power: data.action_power ?? data.action?.value ?? 0,
        resistances:  { ...(data.resistances || {}) },
      },
    };
    // The last gate before a unit enters a battle. Item stat_mods, upgrade
    // tiers and resistance auras all pile onto the same two stats from outside
    // the add helpers, so a unit can arrive already over the ceiling — the
    // Communicant showing 54 life resistance came in this way, not through a
    // buff. Clamped here, and _base_stats above is captured pre-clamp on
    // purpose so the inspector's delta still reads against the real base.
    clampDefenses(combatant);
    return combatant;
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
  // One row beyond this unit's extent, in each column it occupies. The rule
  // itself lives in data/formation_synergies.js, because battle prep previews
  // the same reach while the player is still placing units — two copies of it
  // would drift, and the visible symptom is a preview that lies.
  getInspirationTargetCells(unit) {
    return columnAdjacentCells(this.getFootprint(unit));
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

  // Every ally buff in the game funnels through here, so this is also where
  // 'on_receive_ally_buff' is fired. It used to be fired by hand at three call
  // sites, which meant Fanaticism ("gain damage whenever an ally buffs you")
  // silently ignored Lion's Roar, Command, Inspiration and every aura — the
  // buffs a Herald standing next to a Recruit actually hands out.
  // Self-buffs are not ally buffs: a unit warding ITSELF (Aegis, Stone Form)
  // must not feed its own Fanaticism, hence the id check.
  //
  // It is also where the beacons are paid out. Beacon of Hope / Beacon of
  // Despair "increase the effect of buffs on allies", and a buff is granted from
  // a dozen different call sites — amplifying at each of them would mean a dozen
  // chances to forget one. Here there is exactly one, and the amplifier applies
  // to whatever a passive, ability or aura hands an ally.
  //
  // The extra is booked as its OWN granted-buff record rather than folded into
  // the caller's value, so revokeGrantedBuffs undoes base and bonus by the same
  // arithmetic that applied them (this matters for 'damage', which is
  // multiplicative).
  // `appliedByTarget` is an optional Map<targetId, number> of what each target
  // ACTUALLY gained, for the capped stats where the ask and the gain can differ
  // per unit. Omit it and `value` is recorded for everyone, which is right for
  // every uncapped stat.
  // `def` is the ability doing the granting. Pass it and every recipient also
  // gets a portrait icon for the buff; omit it when the caller already registers
  // an effect of its own (Stone Form, Sanctuary, Frost Armor) or already sets a
  // BUFF_DEFS field (Inspiration, Aegis), so nothing is drawn twice.
  //
  // This is the general fix for buffs that were only ever RECORDED and never
  // SHOWN: _granted_buffs is filed against the SOURCE, for revocation, so a unit
  // handed +8 initiative carried no sign of it anywhere.
  recordGrantedBuff(source, type, targets, value, appliedByTarget = null, def = null) {
    for (const t of targets) {
      const landed = appliedByTarget ? (appliedByTarget.get(t.id) ?? 0) : value;
      if (appliedByTarget && !landed) continue;   // nothing got through the cap
      source._granted_buffs.push({ type, targetIds: [t.id], value: landed });
      if (def && landed) this.registerStatGrantEffect(t, def, landed, type);
      // Self-buffs are not ally buffs — the same rule fireAllyBuffTriggers uses.
      if (!t || !t.alive || t.id === source?.id) continue;
      // Signed: positive amplifies (Beacon of Hope / Despair on our side),
      // negative shrinks (the enemy's Beacon of Despair). `=== 0` rather than
      // `<= 0`, or the reduction half would be skipped entirely.
      const pct = this.buffAmpPctFor(t.side);
      if (pct === 0) continue;
      // 'damage' carries a fraction (0.15 = +15%); every other type is a flat
      // stat point and must stay whole. Truncated TOWARD ZERO, not floored —
      // Math.floor(-2.5) is -3, which would remove more than the percentage
      // asked for.
      let extra = type === 'damage' ? value * pct / 100 : Math.trunc(value * pct / 100);
      // A reduction can cancel a buff but never invert it into a penalty.
      if (extra < 0) extra = Math.max(extra, -value);
      if (!extra) continue;
      const landedExtra = this.applyStatBuff(t, type, extra);
      if (landedExtra) source._granted_buffs.push({ type, targetIds: [t.id], value: landedExtra });
    }
    this.fireAllyBuffTriggers(source, targets);
  }
  // NET buff strength for a side: what its own beacons add, minus what the
  // OPPOSING side's Beacon of Despair takes away.
  //
  // One signed number rather than two systems: a positive result grants extra
  // buff exactly as before, a negative one shrinks the buff being granted, and
  // both travel the same `applyStatBuff` path so both revert correctly when the
  // granting unit dies.
  //
  // Clamped at -100: the most Despair can do is cancel a buff outright. Past
  // that it would silently invert into a debuff, which is a different mechanic
  // and not one anything here declares.
  buffAmpPctFor(side) {
    const other = side === 'player' ? 'enemy' : 'player';
    let pct = 0;
    for (const c of this.combatants) {
      if (!c.alive) continue;
      const own = c.side === side;
      if (!own && c.side !== other) continue;
      for (const def of this.resolveAllPassiveDefs(c)) {
        const p = def.params || {};
        if (own) {
          if (p.buff_effect_bonus_pct_per_tag != null) {
            pct += p.buff_effect_bonus_pct_per_tag * this.tagCountFor(side, p.tag_required);
          } else if (p.buff_effect_bonus_pct != null) {
            pct += p.buff_effect_bonus_pct;
          }
        } else {
          // Despair is carried by the ENEMY and counts ITS tags, not ours.
          if (p.enemy_buff_effect_reduction_pct_per_tag != null) {
            pct -= p.enemy_buff_effect_reduction_pct_per_tag * this.tagCountFor(other, p.tag_required);
          } else if (p.enemy_buff_effect_reduction_pct != null) {
            pct -= p.enemy_buff_effect_reduction_pct;
          }
        }
      }
    }
    return Math.max(-100, pct);
  }
  // Adds `amount` of one buff type to a unit, in the same shape the granting
  // sites use — so the beacon bonus lands exactly where the base buff did.
  // Returns the amount ACTUALLY applied, which differs from `amount` only for
  // armor and resistance — the two stats with a hard ceiling. Callers that will
  // later revoke the grant must record the return value, not what they asked
  // for; see addArmor in passive-processor.js for why.
  applyStatBuff(unit, type, amount) {
    if (!unit || !amount) return 0;
    if (type === 'max_hp') {
      unit.max_hp    += amount;
      unit.battle_hp += amount;
    } else if (type === 'armor') {
      return addArmor(unit, amount);
    } else if (type === 'initiative') {
      unit.initiative = (unit.initiative || 0) + amount;
    } else if (type === 'damage') {
      unit._dmg_mult = (unit._dmg_mult ?? 1) * (1 + amount);
    } else if (type === 'action_power' && unit.unit_data) {
      unit.unit_data.action_power = (unit.unit_data.action_power ?? 0) + amount;
    } else if (type === 'all_resist' && unit.unit_data?.resistances) {
      // One number back for a fan-out across schools: the largest delta any
      // school actually took. Nothing revokes 'all_resist' through
      // _granted_buffs today, so this is a reasonable summary rather than a
      // per-school ledger; if something ever does, it needs the map treatment
      // ally_armor_bonus got.
      let most = 0;
      for (const k of Object.keys(unit.unit_data.resistances)) {
        const got = addResist(unit, k, amount);
        if (Math.abs(got) > Math.abs(most)) most = got;
      }
      return most;
    }
    return amount;
  }
  fireAllyBuffTriggers(source, targets) {
    // A passive answering this trigger could grant another buff; the flag keeps
    // that from looping back in on itself.
    if (this._in_ally_buff) return;
    this._in_ally_buff = true;
    try {
      for (const t of targets) {
        if (!t || t.id === source?.id || !t.alive) continue;
        if (source && t.side !== source.side) continue;
        this.fireTrigger('on_receive_ally_buff', { actor: source, target: t, dmg: 0, dying: null });
      }
    } finally {
      this._in_ally_buff = false;
    }
  }
  revokeGrantedBuffs(dying) {
    for (const buff of dying._granted_buffs) {
      for (const targetId of buff.targetIds) {
        const target = this.combatants.find(c => c.id === targetId);
        if (!target) continue;
        if (buff.type === 'max_hp') {
          target.max_hp    = Math.max(1, target.max_hp - buff.value);
          target.battle_hp = Math.min(target.battle_hp, target.max_hp);
          // Shield and Decay are capped at a share of max_hp, so shrinking it
          // can leave a pool that was legal when applied sitting over the line.
          this.clampPools(target);
        } else if (buff.type === 'armor') {
          addArmor(target, -buff.value);
        } else if (buff.type === 'initiative') {
          target.initiative = Math.max(0, target.initiative - buff.value);
        } else if (buff.type === 'damage') {
          target._dmg_mult = Math.max(0.01, (target._dmg_mult ?? 1) / (1 + buff.value));
        } else if (buff.type === 'action_power' && target.unit_data) {
          // Mirrors applyStatBuff, which has always been able to GRANT power.
          // Without the matching branch here a guardian bond's transferred power
          // outlived the guardian while the HP, armor and initiative it handed
          // over all reverted — the host kept half a dead ally's damage.
          target.unit_data = {
            ...target.unit_data,
            action_power: Math.max(0, (target.unit_data.action_power ?? 0) - buff.value),
          };
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
    // 0. THE ATTACKER'S OWN LINE. Range 1 means contact, and a unit standing in
    // its own back column has none while its own front column is manned — its
    // allies are in the way. It reaches only once that front column is empty.
    //
    // Without this the back column was strictly better for melee: full reach
    // AND immunity to enemy melee, which inverted the whole front/back trade the
    // formation screen teaches. A unit blocked here has no valid targets, and
    // both sides already handle that — the AI defends instead of idling, and the
    // player simply sees no lit cells.
    //
    // Footprint-based: a 'row' unit spans both columns, so it is always in
    // contact and is never blocked by this.
    const ownFront = actor.side === 'enemy' ? 0 : 1;
    const actorInOwnFront = this.getFootprint(actor).some(cell => cellCol(cell) === ownFront);
    if (!actorInOwnFront) {
      const ownFrontManned = this.combatants.some(c =>
        c.side === actor.side && c.alive && c.id !== actor.id &&
        this.getFootprint(c).some(cell => cellCol(cell) === ownFront));
      if (ownFrontManned) return false;
    }

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
    // `this` is passed so per-tag scaling (the vs_tag slayer family) can count
    // living allies — without it those passives silently resolve to +0%.
    return calcDamageWithPassives(actor, target, this.ABILITIES, this);
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
  // How hard the Withering bites this round, as a percentage of max HP. One step
  // per round past the threshold, so round 11 is 5% and round 15 is 25%, and it
  // holds there. The client mirrors this in screens/battle.js — change both.
  witherStepsForRound(round = this.round) {
    const over = round - BATTLE_FATIGUE.wither_start_round;
    if (over <= 0) return 0;
    return Math.min(BATTLE_FATIGUE.wither_max_steps, over);
  }
  witherPctForRound(round = this.round) {
    return this.witherStepsForRound(round) * BATTLE_FATIGUE.wither_pct_max_hp;
  }
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
  // ── Shield / Decay ────────────────────────────────────────────────────────
  // Both pools cap at the SAME share of the target's own max HP, so a stacking
  // application saturates instead of growing without bound. Returns what was
  // actually added, which is what a dispel has to hand back.
  poolCap(unit) { return Math.max(0, Math.floor((unit?.max_hp ?? 0) * POOL_CAP_PCT / 100)); }

  // The cap is a share of max_hp, and max_hp MOVES: an ally_max_hp_bonus is
  // handed back when the unit granting it dies, so a pool that was legal when
  // applied can end up over the line afterwards. Re-clamped whenever a pool is
  // touched and once per round, rather than trying to catch every write to
  // max_hp scattered across the passives.
  clampPools(unit) {
    if (!unit) return;
    const cap = this.poolCap(unit);
    if ((unit._shield ?? 0) > cap) unit._shield = cap;
    if ((unit._decay  ?? 0) > cap) unit._decay  = cap;
  }

  // `source` is whoever granted it, when there is one — an action names its
  // caster in the log; a passive that fires on being hit does not.
  grantShield(target, amount, def, source = null) {
    if (!target || !target.alive || !(amount > 0)) return 0;
    const cap    = this.poolCap(target);
    const before = target._shield ?? 0;
    const added  = Math.min(cap, before + amount) - before;
    if (added <= 0) return 0;
    target._shield = before + added;
    this.registerEffect(target, {
      key: 'shield', name: def?.name || 'Shield', polarity: 'positive',
      dispellable: def ? def.dispellable === true : true,
      restore: { _shield: -added },
    });
    // Its own log type: a pool is not a per-turn tick, and the 'status' line
    // would have read "Shield (12/turn)".
    this.pushLog({
      type: 'pool', pool: 'shield', passive: def?.name || 'Shield',
      // Named here rather than per-unit: effectForEntry checks entry.effect_name
      // first, so a pool animates the same whether an action, a passive or a
      // spell granted it.
      effect_name: 'shield_ward',
      actorId: source?.id, actorName: (source || target).unit_name, actorCell: (source || target).cellIndex,
      targetId: target.id, targetName: target.unit_name, targetCell: target.cellIndex,
      value: added, total: target._shield,
    });
    return added;
  }

  applyDecay(target, amount, def, source = null) {
    if (!target || !target.alive || !(amount > 0)) return 0;
    const cap    = this.poolCap(target);
    const before = target._decay ?? 0;
    const added  = Math.min(cap, before + amount) - before;
    if (added <= 0) return 0;
    target._decay = before + added;
    this.registerEffect(target, {
      key: 'decay', name: def?.name || 'Decay', polarity: 'negative',
      dispellable: def ? def.dispellable === true : true,
      restore: { _decay: -added },
    });
    this.pushLog({
      type: 'pool', pool: 'decay', passive: def?.name || 'Decay',
      effect_name: 'decay_touch',
      actorId: source?.id, actorName: (source || target).unit_name, actorCell: (source || target).cellIndex,
      targetId: target.id, targetName: target.unit_name, targetCell: target.cellIndex,
      value: added, total: target._decay,
    });
    return added;
  }

  // Damage first passes through the shield, which is spent point for point.
  // Returns what still reaches HP. Sits alongside recuperate in BOTH damage
  // paths (executeAction's inline strike and strikeTarget) so a shielded unit
  // behaves identically whether it was hit once or as part of a volley.
  absorbWithShield(target, dmg) {
    this.clampPools(target);
    const pool = target?._shield ?? 0;
    if (!(pool > 0) || !(dmg > 0)) return dmg;
    const absorbed = Math.min(pool, dmg);
    target._shield = pool - absorbed;
    const through  = dmg - absorbed;
    this.pushLog({
      type: 'shield', targetId: target.id, targetName: target.unit_name,
      actorCell: target.cellIndex, targetCell: target.cellIndex,
      value: absorbed, remaining: through,
    });
    // Spent pools stop being dispellable effects — otherwise a dispel would
    // "restore" a shield that no longer exists.
    if (target._shield <= 0) this.clearEffect(target, 'shield');
    return through;
  }

  // The mirror image: healing is eaten by decay before it reaches HP, and the
  // decay is spent doing it. Every heal in the game funnels through here, so a
  // Renew tick and a priest's mend are reduced by the same rule.
  absorbWithDecay(target, heal) {
    this.clampPools(target);
    const pool = target?._decay ?? 0;
    if (!(pool > 0) || !(heal > 0)) return heal;
    const absorbed = Math.min(pool, heal);
    target._decay = pool - absorbed;
    const through  = heal - absorbed;
    this.pushLog({
      type: 'decay', targetId: target.id, targetName: target.unit_name,
      actorCell: target.cellIndex, targetCell: target.cellIndex,
      value: absorbed, remaining: through,
    });
    if (target._decay <= 0) this.clearEffect(target, 'decay');
    return through;
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

    // ── Decay / Shield as ACTIONS ─────────────────────────────────────────
    // A unit whose turn IS the debuff or the ward, rather than a passive that
    // rides along with an attack. Magnitude is the unit's own action_power, and
    // `targets > 1` fans out exactly like the heal and attack branches below —
    // so one definition covers a single-target warder and a whole-line one.
    //
    // Keyed off the unit's intrinsic action, not `actionType`, for the same
    // reason `sacrifice` is above: the AI drives every turn through 'attack'.
    const poolAction = this.getActionKey(actor);
    if (poolAction === 'shield' || poolAction === 'decay') {
      const power   = Number(actor.unit_data?.action_power ?? actor.unit_data?.action?.value ?? 0);
      const maxHits = Math.max(1, Number(actor.unit_data?.targets ?? 1));
      const list    = maxHits > 1 ? this.getValidTargets(actor).slice(0, maxHits) : [target];
      const label   = { name: poolAction === 'shield' ? 'Shield' : 'Decay', dispellable: true };
      for (const t of list) {
        if (!actor.alive) break;
        if (!t?.alive) continue;
        if (poolAction === 'shield') this.grantShield(t, power, label, actor);
        else                         this.applyDecay(t, power, label, actor);
      }
      actor.acted_this_round = true;
      return this.afterAction(actor);
    }

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
          // After recuperate, before HP: a shield is the last thing between the
          // blow and the body.
          if (remaining > 0) remaining = this.absorbWithShield(target, remaining);
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
    // Decay is applied to the heal BEFORE the overheal clamp, so a decayed unit
    // at full HP still burns its decay down rather than having the clamp hide
    // it — otherwise topping up a healthy ally would silently cleanse them.
    const scaled = Math.floor(raw * factor * this.fatigueHealMult());
    const afterDecay = this.absorbWithDecay(target, scaled);
    const heal   = Math.max(0, Math.min(afterDecay, target.max_hp - target.battle_hp));
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
    if (remaining > 0) remaining = this.absorbWithShield(target, remaining);
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
      const passiveChance = this.interceptChanceOf(c, interceptDef);
      const spellChance   = c.intercept_bonus_pct ?? 0;
      return (passiveChance + spellChance) > 0;
    });
    for (const protector of protectors) {
      const defs = this.resolveAllPassiveDefs(protector);
      const interceptDef  = defs.find(d => d.trigger === 'intercept');
      const passiveChance = this.interceptChanceOf(protector, interceptDef);
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
      // Shown on the badge, so it has to total the stacks the same way the undo
      // does — two Dissipates on one unit read as one record.
      if (rec.amount != null) existing.amount = (existing.amount || 0) + rec.amount;
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
      // Carried so the client can draw the effect on a portrait: `icon` names an
      // image, `rounds` is how long it was applied for. Both are display-only —
      // nothing in the engine reads them.
      ...(rec.icon   ? { icon: rec.icon }     : {}),
      ...(rec.rounds ? { rounds: rec.rounds } : {}),
      // Magnitude, for effects whose size is the point (a resistance shred).
      // Display-only, like `icon` and `rounds`.
      ...(rec.amount != null ? { amount: rec.amount } : {}),
      // What the effect actually did, spelled out ("+4 HP, +8 armor"). A grant
      // that moves several stats at once cannot be summed into one `amount`, so
      // the tooltip carries the sentence instead. Display-only.
      ...(rec.detail ? { detail: rec.detail } : {}),
      // `dispellable: false` opts an effect out of dispels (permanent/structural).
      ...(rec.dispellable === false ? { dispellable: false } : {}),
    };
    unit._effects.push(eff);
    return eff;
  }

  // Puts a stat grant on the recipient's portrait.
  //
  // The BUFF_DEFS table the client draws from reads fixed combatant fields, so a
  // passive that only moves a number — Vitality, Iron Will, Lion's Roar, Command,
  // Unity's transfer, the resistance auras — left nothing for it to find and was
  // invisible however large it was. An effect record is what a spell already
  // leaves behind, so registering one here reuses the existing icon path.
  //
  // `dispellable: false`: these are structural, not wards to be stripped. The
  // icon key follows the ability-art convention ('iron_will 1' -> iron_will.jpg).
  registerStatGrantEffect(unit, def, amount, type = null, detail = null) {
    if (!unit || !def) return;
    const key = String(def.id ?? def.name ?? '').replace(/\s+\d+$/, '').replace(/\s+/g, '_');
    if (!key) return;
    const label = STAT_GRANT_LABELS[type] ?? type;
    // 'damage' carries a fraction (0.15 = +15%); every other type is stat points.
    const shown = type === 'damage' ? Math.round(amount * 100) : amount;
    const text  = detail || (label ? `+${shown}${type === 'damage' ? '%' : ''} ${label}` : null);
    return this.registerEffect(unit, {
      key,
      name:        def.name,
      polarity:    'positive',
      icon:        key,
      dispellable: false,
      ...(shown ? { amount: shown } : {}),
      ...(text   ? { detail: text } : {}),
    });
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
      const wither = Math.max(1, Math.floor(unit.max_hp * this.witherPctForRound() / 100));
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
      // Through decay like every other heal — a regen that ignored it would be
      // the obvious way to play around the debuff.
      const ticked = this.absorbWithDecay(unit, Math.floor(unit._hot * this.fatigueHealMult()));
      const actual = Math.max(0, Math.min(ticked, unit.max_hp - unit.battle_hp));
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
  // A hero spending its turn on a spell. Returns { ok } or { error } — the
  // caller (the /battle/cast route, or the AI) decides what to do with a
  // refusal; nothing is spent unless every check passes.
  //
  // Casting costs the turn AND the power, which is the whole tension: the hero
  // is usually the best attacker on the field, so every cast is an attack not
  // made. `_skip_power_gain` stops afterAction handing the point straight back.
  doCast(actor, spellDef, { power = null, targetId = null } = {}) {
    if (!actor?.alive)        return { error: 'Caster is not alive' };
    if (!actor._is_hero)      return { error: 'Only a hero can cast' };
    if (!spellDef)            return { error: 'Spell not found' };
    if (spellDef.usage === 'roster' || spellDef.category === 'non_combat') {
      return { error: 'That spell cannot be cast in battle' };
    }
    const min   = spellDef.power_cost ?? 1;
    const spend = Math.max(min, Math.min(POWER_MAX, Number(power) || min));
    const have  = this.powerFor(actor.side);
    if (have < spend) return { error: `Not enough power (need ${spend}, have ${have})` };

    this.power[actor.side] = have - spend;
    // Resolved BEFORE the cast so the announcement can say how wide it lands.
    // A six-target debuff and a single-target one read identically otherwise —
    // the player saw "casts Grave Rot" and then a wall of separate decay lines
    // with nothing tying them to it.
    const willHit = this.getSpellTargets(spellDef, actor.side, targetId);
    this.pushLog({
      type: 'cast', side: actor.side, spell_id: spellDef.id, spell: spellDef.name,
      actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex,
      targetId: targetId ?? null, value: spend, total: this.power[actor.side],
      // `targets` is the count; `targetName` names the victim when there is
      // exactly one, so a single-target cast reads as a sentence rather than
      // as "1 target".
      targets: willHit.length,
      targetName: willHit.length === 1 ? willHit[0].unit_name : null,
      targetCell: willHit.length === 1 ? willHit[0].cellIndex : undefined,
      scope: spellDef.target_scope || null,
      effect_name: spellDef.effect_name || null,
    });

    this.castSpell(spellDef, { casterSide: actor.side, targetId, power: spend });

    actor._skip_power_gain = true;
    actor.acted_this_round = true;
    this.afterAction(actor);
    return { ok: true, spent: spend, remaining: this.power[actor.side] };
  }

  doDefend(actor) {
    actor.defend_armor_bonus = DEFEND_BONUS;
    actor.acted_this_round   = true;
    this.pushLog({ type: 'defend', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, value: DEFEND_BONUS, message: `defended (+${DEFEND_BONUS} armor and all resists this round)` });
    return this.afterAction(actor);
  }
  doAbility(actor, target) {
    actor.defend_armor_bonus = 0;
    // A HERO does not have an active ability — casting is its ability. The
    // `ability` field is still on hero definitions in data/units.js and is left
    // there deliberately, but it is not an action any more, so it is not read
    // here. Passives are a separate field (`passive`) and are untouched by this.
    const key = actor._is_hero
      ? null
      : (actor.unit_data?.ability || actor.unit_data?.active_ability);
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
    // Every completed hero turn earns power. Sits here rather than in each
    // action so nothing can be added later that quietly skips it — a cast is
    // the one exception, and it opts out by flagging the actor.
    if (!actor?._skip_power_gain) this.gainPower(actor);
    actor._skip_power_gain = false;
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
      this.clampPools(c);
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
            // _sanctuary_resist is a per-school map of what each type ACTUALLY
            // gained, not one shared number — the cap can clip one school and
            // not another. See the grant site in passive-processor.js.
            const applied = c._sanctuary_resist;
            for (const type of resistTypes) {
              const back = typeof applied === 'number' ? applied : (applied?.[type] ?? 0);
              if (back) addResist(c, type, -back);
            }
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
      // Aegis is a per-round ward, so its stack badge clears with it. Rage and
      // Fanaticism stacks are kept for the whole battle, same as their bonuses.
      c._aegis_stacks = 0;

      // Both locks used to be plain booleans cleared here, which made every
      // silence exactly one round long. They are now driven by a round counter,
      // so an ability can disable something for longer — Headshot and Skullcrack
      // silence passives for two. Anything that still sets the boolean directly
      // leaves its counter at 0 and so behaves exactly as before: gone next
      // round.
      c._passives_locked_rounds = Math.max(0, (c._passives_locked_rounds ?? 0) - 1);
      c._actives_locked_rounds  = Math.max(0, (c._actives_locked_rounds  ?? 0) - 1);
      c._passives_locked = c._passives_locked_rounds > 0;
      c._actives_locked  = c._actives_locked_rounds  > 0;
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
        const resist = effectiveResist(unit, effect.damage_type);
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
        if (r.armor)      addArmor(unit, r.armor);
        if (r.initiative) unit.initiative = Math.max(1, (unit.initiative || 40) + r.initiative);
        if (r.dmg_mult_div) unit._dmg_mult = (unit._dmg_mult || 1) / r.dmg_mult_div;
        if (r.resistances) {
          if (!unit.unit_data.resistances) unit.unit_data.resistances = {};
          for (const [rType, rVal] of Object.entries(r.resistances)) {
            addResist(unit, rType, rVal);
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
    // `dispellable !== false` on both, matching dispelEffects exactly: an effect
    // a dispel cannot remove is not a reason to cast one. Battle-start stat
    // grants (Vitality, Iron Will, the resistance auras) register as positive
    // structural effects, so without this test a Purge would fire every turn at
    // a target it could strip nothing from.
    const dispellable = e => e.dispellable !== false;
    const hasNegative = c => (c._effects || []).some(e => e.polarity === 'negative' && dispellable(e))
      || (c.dot_dmg > 0) || (c._poison_dmg > 0) || (c._bleed_dmg > 0) || (c._chill_dmg > 0) || (c._healing_reduction > 0);
    const hasPositive = c => (c._effects || []).some(e => e.polarity === 'positive' && dispellable(e)) || (c._dmg_mult || 1) > 1;

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

  // A boss spending its banked power. Encounter units carry `spells` in
  // data/embark.js as [{ spell_id, power }] — the cheap one it will cast
  // repeatedly, the expensive one it can only reach by surviving.
  //
  // Greedy on purpose: it casts the most expensive spell it can currently pay
  // for. That makes the enemy power strip a clock the player can read and race,
  // rather than a hidden roll.
  aiPickSpell(actor) {
    if (!actor?._is_hero || !actor._spells?.length) return null;
    const have = this.powerFor(actor.side);
    const options = actor._spells
      .map(s => {
        const def = Object.values(SPELLS).flat().find(x => x.id === s.spell_id);
        if (!def) return null;
        const cost = Math.max(def.power_cost ?? 1, Number(s.power) || def.power_cost || 1);
        return cost <= have ? { def, cost } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.cost - a.cost);
    return options[0] || null;
  }

  // Chooses this enemy's whole turn: ability / defend / attack / skip.
  chooseAiAction(actor) {
    const spell = this.aiPickSpell(actor);
    if (spell) return { type: 'spell', spell: spell.def, power: spell.cost, target: null };
    // Heroes (which on the enemy side means bosses) cast instead of using an
    // ability. With no spell affordable this turn they fall through to defend or
    // attack like anyone else, rather than reaching for an ability they no
    // longer have.
    const key = actor._is_hero
      ? null
      : (actor.unit_data?.ability || actor.unit_data?.active_ability);
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
      // Bled/burned/chilled out before it could move. This has to close the turn
      // out the same way every other path does — afterAction() is the ONLY place
      // that checks for a win and advances the round. Without it, an enemy dying
      // here left `done` false and `winner` null even when it was the last one
      // standing: the endpoint answered done:false, and the client sat waiting
      // for input on a battle that was already over with nothing left to attack.
      // executeAction's copy of this branch (see the turnStart block there) has
      // always called afterAction; this one did not.
      if (!actor.alive) {
        actor.acted_this_round = true;
        this.afterAction(actor);
        newLog.push(...this.log.slice(before));
        continue;
      }
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
      // The round BEFORE the action, for the guard below. A completed action can
      // legitimately clear acted_this_round: afterAction() advances the round
      // once the last unit has moved, and advanceRound() resets the flag on
      // every combatant. So a flag reading false does not mean "did nothing" —
      // it also means "acted, and was the last to do so".
      const roundBefore = this.round;
      if (decision.type === 'spell') {
        // Single-target enemy spells aim at the weakest of whatever they can
        // reach; everything else resolves on its own scope.
        const scope = decision.spell.target_scope;
        let targetId = null;
        if (scope === 'single_ally') {
          targetId = this.combatants
            .filter(c => c.side === actor.side && c.alive)
            .sort((a, b) => (a.battle_hp / a.max_hp) - (b.battle_hp / b.max_hp))[0]?.id ?? null;
        } else if (scope === 'single_enemy') {
          // Skips `_untargetable`, or the AI aims every spell at a bonded
          // guardian: it is deliberately the lowest-HP unit on the field and it
          // cannot be hurt, so this sort handed it the spell every single time.
          targetId = this.combatants
            .filter(c => c.side !== actor.side && c.alive && !c._untargetable)
            .sort((a, b) => a.battle_hp - b.battle_hp)[0]?.id ?? null;
        }
        this.doCast(actor, decision.spell, { power: decision.power, targetId });
      } else if (decision.type === 'ability') {
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
      //
      // `this.round === roundBefore` is what keeps this net from firing on a
      // unit that DID act: the last enemy to move each round came back here with
      // its flag freshly reset by advanceRound(), was declared idle, and had the
      // skip below burn its turn in the round that had just begun. That is the
      // "unit randomly skips a turn" report — always the last actor of a round.
      if (actor.alive && !actor.acted_this_round && this.round === roundBefore) {
        console.error('[battle] AI turn produced no action', {
          unit: actor.unit_name, cell: actor.cellIndex, decision: decision?.type,
          action: actor.unit_data?.action, hasTarget: !!decision?.target,
        });
        // Braces rather than skipping. There is never a reason for a unit to
        // forfeit its turn outright — defending beats doing nothing, and it
        // keeps this safety net from handing the player a free round when
        // something upstream goes wrong. The console error above is still where
        // the actual fault gets reported.
        this.doDefend(actor);
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
      // The client draws a power strip per side and gates the spell list on it.
      power:      this.power,
    };
  }
  getBattleData() {
    return {
      round:  this.round,
      done:   this.done,
      winner: this.winner,
      pendingRoundEffects: this.pendingRoundEffects,
      // Per-battle, never carried between fights — but it must survive a reload
      // mid-fight or a hero would bank its power twice.
      power: this.power,
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
        _base_stats:      c._base_stats ?? null,
        // Live resistances. rehydrate() rebuilds combatants from the setup, so
        // without these every resist buff and shred silently reverted on reload.
        _resistances:     { ...(c.unit_data?.resistances || {}) },
        // Live power, for the same reason: Horde and Fanaticism grow
        // unit_data.action_power during the battle, and rehydrate() would
        // otherwise hand back the roster's starting value.
        _action_power:    c.unit_data?.action_power ?? null,
        buffs: {
          dot_dmg:             c.dot_dmg,
          _hot:                c._hot,
          _shield:             c._shield ?? 0,
          _decay:              c._decay  ?? 0,
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
          _rage_stacks:        c._rage_stacks       ?? 0,
          _fanaticism_stacks:  c._fanaticism_stacks ?? 0,
          _aegis_stacks:       c._aegis_stacks      ?? 0,
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
          _inspiration_initiative: c._inspiration_initiative ?? 0,
          _inspiration_damage:     c._inspiration_damage ?? 0,
          _inspiration_armor:      c._inspiration_armor ?? 0,
          _chorus_power:           c._chorus_power ?? 0,
          _inspiration_max_hp:     c._inspiration_max_hp ?? 0,
          _unity_host_id:      c._unity_host_id,
          _unity_bonded_id:    c._unity_bonded_id,
          _mothers_kiss:       c._mothers_kiss,
          _sorrow_source_ids:  c._sorrow_source_ids,
          _reanimate_pending:  c._reanimate_pending ?? null,
          _stun_rounds:        c._stun_rounds ?? 0,
          _stun_initiative_lost: c._stun_initiative_lost ?? 0,
          _passives_locked:    c._passives_locked ?? false,
          _passives_locked_rounds: c._passives_locked_rounds ?? 0,
          _actives_locked_rounds:  c._actives_locked_rounds ?? 0,
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
    // Banked power survives a reload. fromSetup starts both sides at zero, so
    // without this a player could reload to refill — and an enemy boss would
    // lose the charge it had built toward its own spell.
    engine.power = { player: 0, enemy: 0, ...(battleData.power || {}) };
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
      if (s.armor         != null) c.armor         = Math.max(0, Math.min(MITIGATION_CAP_PCT, s.armor));
      c.defend_armor_bonus = s.defend_armor_bonus ?? 0;
      c.martyrdom_pct      = s.martyrdom_pct      ?? 0;
      c._lifesteal         = s._lifesteal          ?? 0;
      c.intercept_bonus_pct = s.intercept_bonus_pct ?? 0;
      c._base_max_hp        = s._base_max_hp ?? c.max_hp;
      c._fanaticism_bonus   = s._fanaticism_bonus ?? 0;
      if (s._base_stats) c._base_stats = s._base_stats;
      if (s._resistances) {
        c.unit_data = c.unit_data || {};
        c.unit_data.resistances = { ...s._resistances };
      }
      if (s._action_power != null) {
        c.unit_data = c.unit_data || {};
        c.unit_data.action_power = s._action_power;
      }
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
      c._shield            = b._shield            ?? 0;
      c._decay             = b._decay             ?? 0;
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
      c._rage_stacks       = b._rage_stacks       ?? 0;
      c._fanaticism_stacks = b._fanaticism_stacks ?? 0;
      c._aegis_stacks      = b._aegis_stacks      ?? 0;
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
      c._inspiration_initiative = b._inspiration_initiative ?? 0;
      c._inspiration_damage     = b._inspiration_damage     ?? 0;
      c._inspiration_armor      = b._inspiration_armor      ?? 0;
      c._chorus_power           = b._chorus_power           ?? 0;
      c._inspiration_max_hp     = b._inspiration_max_hp     ?? 0;
      c._unity_host_id     = b._unity_host_id     ?? null;
      c._unity_bonded_id   = b._unity_bonded_id   ?? null;
      c._mothers_kiss      = b._mothers_kiss      ?? false;
      c._sorrow_source_ids = b._sorrow_source_ids ?? [];
      c._reanimate_pending = b._reanimate_pending ?? null;
      c._stun_rounds       = b._stun_rounds       ?? 0;
      c._stun_initiative_lost = b._stun_initiative_lost ?? 0;
      c._passives_locked   = b._passives_locked   ?? false;
      c._passives_locked_rounds = b._passives_locked_rounds ?? 0;
      c._actives_locked_rounds  = b._actives_locked_rounds  ?? 0;
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
    engine.log    = [];
    return engine;
  }
  // Enemies cast through their UNITS now — a boss carries `spells` in
  // data/embark.js, banks power like any hero and casts in the open, named in
  // the log. The encounter-level spell that used to fire anonymously at battle
  // start (castEncounterSpell / declareCounter / the counter-spell branch) was a
  // weaker parallel answer to the same question and has been removed. Its
  // counter half had been unreachable since the spell refactor deleted the
  // pre-battle player cast that set the category.

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
    // The only scope that looks for the DEAD — a boss resurrect picks its own
    // corpse (the first to fall), so it needs no target from the caller.
    if (scope === 'single_dead_ally') {
      const fallen = this.combatants.filter(c => c.side === allySide && !c.alive);
      return fallen.length ? [fallen[0]] : [];
    }
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

    // Shields the CASTER, not the targets — Pall of Sorrow weakens an enemy and
    // veils your own hero in the same breath, so it cannot ride the per-target
    // loop below.
    if (params.shield_caster && params._caster_side) {
      const hero = this.heroFor(params._caster_side);
      if (hero) this.grantShield(hero, params.shield_caster, { name: params._spell_name || 'Shield' }, hero);
    }

    for (const c of targets) {
      // Undo ledger for this unit, filled in as timed params are applied.
      const revert = {};

      // Raising the fallen — the boss resurrect. Has to run before anything
      // else touches HP, and it is the one spell param that acts on a corpse.
      if (params.resurrect_hp_pct && !c.alive) {
        c.alive     = true;
        c.battle_hp = Math.max(1, Math.floor(c.max_hp * params.resurrect_hp_pct / 100));
        this.pushLog({
          type: 'passive', passive: params._spell_name || 'Resurrect',
          actorName: params._spell_name || 'Resurrect',
          targetId: c.id, targetName: c.unit_name, targetCell: c.cellIndex,
          value: c.battle_hp, heal: true,
          message: `${c.unit_name} rises again`,
        });
      }
      if (params.heal_pct)             { const heal = Math.floor(c.max_hp * params.heal_pct * this.fatigueHealMult()); c.battle_hp = Math.min(c.max_hp, (c.battle_hp || 0) + heal); }
      // Reverted by what LANDED, not by what the spell offered — a target
      // already at the ceiling gains nothing and must give nothing back.
      if (params.armor_boost)          { revert.armor = -addArmor(c, params.armor_boost); }
      if (params.armor_reduction)      c.armor      = Math.max(0, Math.min(MITIGATION_CAP_PCT, Math.floor((c.armor || 0) * (1 - params.armor_reduction))));
      if (params.armor_flat_reduction) {
        // Flat shred, unlike armor_reduction's percentage. Only give back what
        // was actually taken, so a unit at 3 armor doesn't rebound to 10.
        const taken = Math.min(c.armor || 0, params.armor_flat_reduction);
        revert.armor = (revert.armor || 0) - addArmor(c, -taken);
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
      // Both are read through the shared helpers, so the MITIGATION_CAP_PCT
      // ceiling applies to a spell exactly as it does to an attack.
      if (params.damage_flat) {
        const type = params.damage_type || 'physical';
        let dmg;
        if (type === 'physical') {
          dmg = Math.max(1, Math.floor(params.damage_flat * (1 - effectiveArmor(c) / 100)));
        } else {
          // Defending adds to the matching resistance as well as to armor —
          // see calcDamageWithPassives. Without this, bracing helped against a
          // sword and not against a firebolt.
          dmg = Math.max(1, Math.floor(params.damage_flat * (1 - effectiveResist(c, type) / 100)));
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
          const landedR = addResist(c, rType, rVal);
          revert.resistances = revert.resistances || {};
          revert.resistances[rType] = (revert.resistances[rType] || 0) - landedR;
        }
      }
      if (params.resist_reduction) {
        for (const [rType, rVal] of Object.entries(params.resist_reduction)) {
          if (!c.unit_data.resistances) c.unit_data.resistances = {};
          const taken = Math.min(c.unit_data.resistances[rType] || 0, rVal);
          const shed = -addResist(c, rType, -taken);
          revert.resistances = revert.resistances || {};
          revert.resistances[rType] = (revert.resistances[rType] || 0) + shed;
        }
      }

      // Timed stat changes are also dispellable effects, so Purgation and the
      // like can strip them early — registerEffect's revert runs the same undo.
      if (duration && Object.keys(revert).length) {
        const polarity = params.resist_reduction || params.armor_flat_reduction || params.damage_dealt_reduction_pct
          || params.initiative_flat_reduction
          ? 'negative' : 'positive';
        // Registered as well as queued. The comment above always claimed these
        // were dispellable, but nothing recorded them — so Purgation could not
        // see a spell buff, and the portrait had no way to show one either. The
        // record carries the spell's own icon, which is what lets the client
        // draw it beside the ability-driven statuses.
        this.registerEffect(c, {
          key:      `spell:${params._spell_id || params._spell_name}`,
          name:     params._spell_name || 'Spell',
          icon:     params._spell_icon || null,
          polarity,
          dispellable: true,
          rounds:   duration,
          restore:  revert,
        });
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

      // Immediate dispel — Purgation. One blessing per point of power, off ONE
      // enemy. dispelEffects reverses each effect it removes, so a stripped
      // buff hands its stat back rather than lingering as a number with no
      // effect record behind it.
      if (params.dispel_count) {
        const removed = this.dispelEffects(c, params.dispel_polarity || 'positive', params.dispel_count);
        this.pushLog({
          type: 'passive', passive: params._spell_name || 'Dispel',
          actorName: params._spell_name || 'Dispel',
          targetId: c.id, targetName: c.unit_name, targetCell: c.cellIndex,
          value: removed.length, heal: false,
          message: removed.length
            ? `${removed.map(e => e.name).join(', ')} stripped`
            : 'nothing to strip',
        });
      }

      // Decay pool — The Long Rot. Same pool the Decay ACTION fills, so a
      // spell-cast rot and a unit-cast one are the same debuff at different
      // magnitudes rather than two systems that look alike.
      if (params.decay_amount) this.applyDecay(c, params.decay_amount, { name: params._spell_name || 'Decay' });

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
  // `power` scales the spell — see spellParamsAtPower in data/spells.js. Omitted
  // (the encounter-spell path) it falls back to the spell's own minimum, which
  // is the unscaled base.
  castSpell(spellDef, { casterSide = 'player', targetId = null, power = null } = {}) {
    const spent   = Number(power) || spellDef.power_cost || 1;
    const targets = this.getSpellTargets(spellDef, casterSide, targetId);
    const scaled  = scaleSpellParams(spellDef, spent);
    // _spell_name only rides along so deferred effects can name themselves in
    // the log; it is never read as a gameplay param.
    this.applySpellParams(targets, {
      ...scaled,
      _spell_name: spellDef.name,
      _spell_id:   spellDef.id,
      // The portrait badge, from the ABILITIES icon set — not the spell's own
      // art, which is keyed by id and used in the casting sheet.
      _spell_icon: spellDef.effect_icon || null,
      _caster_side: casterSide,
    });
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