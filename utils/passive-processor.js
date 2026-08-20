function cellRow(i) { return Math.floor(i / 2); }
function cellCol(i) { return i % 2; }

// Formation bonds — who may bond with whom, and where they must be standing.
// The battle-prep screen previews these while the player is still placing units,
// so the adjacency rule CANNOT live here as well: two copies drift, and the
// visible symptom is prep promising a bond that this file then refuses to form.
// See data/formation_synergies.js.
const { findPartnerFor } = require('../data/formation_synergies.js');

// The shape resolveSynergies() reads, built from live combatants. The prep
// screen builds the same shape from its placement map; that shared shape is what
// lets one geometry rule serve both.
function synergyUnitsFor(engine) {
  return (engine?.combatants || [])
    .filter(c => c.alive)
    .map(c => {
      const raw = c.unit_data?.passive || c.unit_data?.passive_ability;
      const passives = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      return {
        id: c.id,
        side: c.side,
        cells: engine.getFootprint(c),
        anchor: c.cellIndex,
        tags: c.unit_data?.tags ?? [],
        abilityKeys: [c.unit_data?.ability, ...passives].filter(Boolean),
        type: c.unit_data?.type,
        unitId: c.unit_data?.unit_id ?? c.unit_data?.id,
      };
    });
}

// How many living units on `side` carry `tag`. The unit of account for every
// "per Zombie / per Demon / per Holy" passive, so they all count the same way:
// the owner counts itself when it carries the tag, and the dead never count.
function tagCount(engine, side, tag) {
  return engine?.tagCountFor ? engine.tagCountFor(side, tag) : 0;
}

// A percentage that may be flat or scaled per tag. Returns 0 when neither is
// declared, so a caller can multiply unconditionally.
function pctFor(p, engine, side, flatKey, perTagKey) {
  if (p[perTagKey] != null) return p[perTagKey] * tagCount(engine, side, p.tag_required);
  return p[flatKey] ?? 0;
}

// The ONE way a passive takes hit points off a unit.
//
// Invulnerability (Unity's bonded guardian) was checked only on the two direct
// attack paths in battle-engine.js, so every INDIRECT source went straight
// through it: splash, chain, on-death AoE, thorns, decay auras, radiance. A unit
// that "cannot be targeted and is invulnerable" was still losing HP to anything
// that picked its victims by iterating the board instead of by selecting a
// target. Routing every reduction through here closes all of them at once.
//
// Returns the damage actually dealt, so callers that log or check for a kill
// report what really happened rather than what they intended.
// How much a damage-over-time effect applies for, floored at the effect's RANK.
//
// A percentage of a small hit rounds to nothing — a Ghost's 6-damage attack
// applying "Poison (0/turn)". Worse than cosmetic: every tick is gated on the
// stored amount being > 0, so a 0 application registered the status icon and
// then never ticked at all. Rank is the floor, so Poison 1 always costs at
// least 1 a turn and Poison 2 at least 2, however weak the hit that applied it.
//
// The tick sites in battle-engine.js floor by rank as well. That stays as a
// safety net for anything stored before this existed (a battle in progress
// across a deploy), but the value is correct at APPLICATION now — which is what
// the log line quotes, and what decides whether the effect ticks at all.
function dotAmount(dmg, pct, def) {
  return Math.max(def?.rank ?? 1, Math.floor(dmg * pct / 100));
}

// What a passive's flat hit actually lands for once the target's defences are
// read. Physical goes through armor, everything else through the matching
// resistance — the same split calcDamageWithPassives and applySpellParams use,
// so a passive that names a damage type is resisted exactly like an attack or a
// spell of that type. Untyped (or 'physical') keeps the armor behaviour.
function typedAmount(target, amount, type) {
  if (!type || type === 'physical') {
    const armor = Math.max(0, (target.armor ?? 0) + (target.defend_armor_bonus || 0));
    return Math.max(1, Math.floor(amount * (1 - armor / 100)));
  }
  const resist = Math.min(100,
    ((target.unit_data?.resistances ?? target.resistances ?? {})[type] ?? 0) + (target.defend_armor_bonus || 0));
  return Math.max(1, Math.floor(amount * (1 - resist / 100)));
}

function hurt(unit, amount) {
  if (!unit || !unit.alive || unit._invulnerable) return 0;
  const before = unit.battle_hp;
  unit.battle_hp = Math.max(0, before - amount);
  return before - unit.battle_hp;
}
function resolveAbilityDef(unit, UNIT_ABILITIES, type) {
  const key = type === 'active'
    ? (unit.unit_data?.ability || unit.unit_data?.active_ability)
    : (unit.unit_data?.passive || unit.unit_data?.passive_ability);
  if (!key || !UNIT_ABILITIES) return null;
  return UNIT_ABILITIES[key] ?? null;
}
// Collapses duplicate passives (same base name, e.g. an item granting a passive
// the unit already has) into a single higher rank: 'regenerate 1' + 'regenerate 1'
// -> 'regenerate 2'. Ranks add, capped at 3 AND at the highest rank actually
// defined for that ability (so we never produce a missing key like 'regenerate 3'
// when only ranks 1–2 exist). Unknown/rankless keys pass through untouched.
function stackPassiveKeys(keys, UNIT_ABILITIES) {
  if (!Array.isArray(keys) || keys.length < 2 || !UNIT_ABILITIES) return keys;
  const parse = k => { const m = /^(.*)\s+(\d+)$/.exec(k); return m ? { base: m[1], rank: +m[2] } : null; };

  const summed = {};
  for (const k of keys) {
    const pr = parse(k);
    if (pr && UNIT_ABILITIES[k]) summed[pr.base] = (summed[pr.base] ?? 0) + pr.rank;
  }
  const maxRank = {};
  for (const key of Object.keys(UNIT_ABILITIES)) {
    const pr = parse(key);
    if (pr) maxRank[pr.base] = Math.max(maxRank[pr.base] ?? 0, pr.rank);
  }
  const emitted = {};
  const out = [];
  for (const k of keys) {
    const pr = parse(k);
    if (!pr || !UNIT_ABILITIES[k]) { out.push(k); continue; }
    if (emitted[pr.base]) continue; // stacked version already placed at first occurrence
    emitted[pr.base] = true;
    const rank = Math.max(1, Math.min(3, maxRank[pr.base] ?? pr.rank, summed[pr.base]));
    out.push(`${pr.base} ${rank}`);
  }
  return out;
}

function resolvePassiveDefs(unit, UNIT_ABILITIES) {
  if (unit._passives_locked) return [];
  if (!UNIT_ABILITIES) return [];
  const raw = unit.unit_data?.passive || unit.unit_data?.passive_ability;
  if (!raw) return [];
  const keys = stackPassiveKeys(Array.isArray(raw) ? raw : [raw], UNIT_ABILITIES);
  return keys.map(k => UNIT_ABILITIES[k] ?? null).filter(Boolean);
}
function runTrigger(trigger, ctx) {
  const { engine, UNIT_ABILITIES } = ctx;
  const sideMap = {
    on_hit:                () => engine.combatants.filter(c => c.side === ctx.actor?.side),
    on_kill:               () => engine.combatants.filter(c => c.side === ctx.actor?.side),
    on_hit_received:       () => engine.combatants.filter(c => c.side === ctx.target?.side),
    on_death:              () => engine.combatants.filter(c => c.side === (ctx.dying ?? ctx.actor)?.side),
    on_battle_start:       () => engine.combatants,
    on_turn_start:         () => [ctx.actor],
    on_heal:               () => engine.combatants.filter(c => c.side === ctx.actor?.side),
    on_healed:             () => engine.combatants.filter(c => c.side === ctx.target?.side),
    on_take_damage:        () => engine.combatants.filter(c => c.side === ctx.target?.side),
    on_receive_ally_buff:  () => engine.combatants.filter(c => c.side === ctx.target?.side),
    on_ally_death:         () => engine.combatants.filter(c => c.side === (ctx.dying ?? ctx.actor)?.side),
    on_round_start:        () => engine.combatants,
  };
  const pool = (sideMap[trigger] ?? (() => []))();
  // Work that must see the FINAL state of this trigger rather than the state
  // partway through it. Guardian bonds are the case: they hand over half of the
  // guardian, and the guardian's own passives are still growing it. See
  // formGuardianBond.
  const deferred = [];
  const innerCtx = { ...ctx, _deferToEnd: fn => deferred.push(fn) };
  for (const unit of pool) {
    const defs = resolvePassiveDefs(unit, UNIT_ABILITIES);
    for (const def of defs) {
      if (def.trigger !== trigger) continue;
      dispatchPassive(trigger, unit, def, innerCtx);
    }
  }
  for (const fn of deferred) fn();
}
// Half of the guardian, handed to the ally in front. Read LIVE, not from
// unit_data: that is a copy of the unit's DEFINITION, so `armor` and
// `initiative` there are the blueprint values and never move. Anything that
// buffed the guardian during the battle — Banquet, a spell, an aura — writes to
// the combatant instead, and reading the blueprint silently left all of it
// behind. action_power is the exception and lives in unit_data, because that is
// where the engine keeps live power (see calcDamageWithPassives).
const BOND_STATS = {
  battle_hp:    o => o.battle_hp ?? 0,
  armor:        o => o.armor ?? 0,
  initiative:   o => o.initiative ?? 0,
  action_power: o => o.unit_data?.action_power ?? o.unit_data?.action?.value ?? 0,
};

function formGuardianBond(owner, def, synergyId, engine) {
  // The host rule lives in data/formation_synergies.js, resolved by the same
  // function the prep preview calls — so what the player was shown while placing
  // and what actually bonds here are one rule, not two.
  const bond = findPartnerFor(synergyUnitsFor(engine), owner.id, synergyId);
  const host = bond ? engine.combatants.find(c => c.id === bond.partnerId) : null;
  if (!host) return;

  owner._unity_host_id = host.id;
  host._unity_bonded_id = owner.id;
  owner._invulnerable = true;
  owner._untargetable = true;

  const half = stat => Math.floor(BOND_STATS[stat](owner) * 0.5);

  const hp = half('battle_hp');
  if (hp) { host.battle_hp += hp; host.max_hp += hp; engine.recordGrantedBuff(owner, 'max_hp', [host], hp); }

  const armor = half('armor');
  if (armor) { host.armor += armor; engine.recordGrantedBuff(owner, 'armor', [host], armor); }

  const initiative = half('initiative');
  if (initiative) { host.initiative += initiative; engine.recordGrantedBuff(owner, 'initiative', [host], initiative); }

  const power = half('action_power');
  if (power && host.unit_data) {
    host.unit_data = { ...host.unit_data, action_power: (host.unit_data.action_power ?? 0) + power };
    engine.recordGrantedBuff(owner, 'action_power', [host], power);
  }

  // Half of the resistances too, from unit_data — which for resistances IS the
  // live copy, cloned per combatant and written in place by every resist effect.
  const ownerResists = owner.unit_data?.resistances || {};
  if (host.unit_data) {
    const hostResists = { ...(host.unit_data.resistances || {}) };
    for (const [type, val] of Object.entries(ownerResists)) {
      hostResists[type] = (hostResists[type] || 0) + Math.floor(val * 0.5);
    }
    host.unit_data = { ...host.unit_data, resistances: hostResists };
  }

  // actorId/targetId carry the bond FX: the client anchors a two-cell effect on
  // the cells those ids name (see SRC_TARGET_FX in battle.js). Without them the
  // entry still READ correctly but had no cells to draw between, so the tether
  // never appeared.
  engine.pushLog({
    type: 'passive', passive: def.name,
    actorId: owner.id, actorName: owner.unit_name, actorCell: owner.cellIndex,
    targetId: host.id, targetName: host.unit_name, targetCell: host.cellIndex,
    message: `${owner.unit_name} bonds to ${host.unit_name} — +${hp} HP, +${armor} armor, +${initiative} initiative, +${power} power transferred; the ${def.name} guardian is invulnerable.`,
  });
}

function dispatchPassive(trigger, owner, def, ctx) {
  const { engine, actor, target, dmg, dying } = ctx;
  const p = def.params || {};
  const abilityKey = def.id ?? def.name ?? null;
  if (trigger === 'on_battle_start') {
    // Shield handed out up front — the defensive shape of the ability, as
    // opposed to the on_hit one below that hardens a unit as it fights.
    // `shield_target: 'all_allies'` puts it on the whole side; anything else
    // shields the owner, since there is no "target" at battle start.
    if (p.shield_amount != null) {
      const who = p.shield_target === 'all_allies'
        ? engine.combatants.filter(c => c.side === owner.side && c.alive)
        : [owner];
      for (const u of who) engine.grantShield(u, p.shield_amount, def);
    }
    if (p.ally_max_hp_bonus != null || p.ally_max_hp_bonus_per_tag != null) {
      const hpEach = p.ally_max_hp_bonus_per_tag != null
        ? p.ally_max_hp_bonus_per_tag * tagCount(engine, owner.side, p.tag_required)
        : p.ally_max_hp_bonus;
      const allies = engine.combatants.filter(c => c.side === owner.side);
      for (const a of allies) { a.battle_hp += hpEach; a.max_hp += hpEach; }
      engine.recordGrantedBuff(owner, 'max_hp', allies, hpEach);
      // `stat` marks this as a stat grant, not a heal — without it the client's
      // log renderer defaults to "healed" (entry.heal !== false).
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: 'all allies', value: hpEach, heal: false, stat: 'max HP' });
    }
    if (p.ally_armor_bonus != null) {
      // `ally_tag_required` narrows WHO RECEIVES the armor — distinct from
      // `tag_required`, which elsewhere scales HOW MUCH. Omit it and every ally
      // is covered, as before. Fortify uses it to plate only Constructs.
      const allies = engine.combatants.filter(c =>
        c.side === owner.side &&
        (!p.ally_tag_required || (c.unit_data?.tags ?? c.tags ?? []).includes(p.ally_tag_required))
      );
      if (allies.length) {
        for (const a of allies) { a.armor += p.ally_armor_bonus; }
        engine.recordGrantedBuff(owner, 'armor', allies, p.ally_armor_bonus);
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: p.ally_tag_required ? `all ${p.ally_tag_required} allies` : 'all allies', value: p.ally_armor_bonus, heal: false, stat: 'armor' });
      }
    }
    // ── KINSHIP TEMPLATE ──────────────────────────────────────────────────────
    // Horde, Iron Will, Choir, Banquet: the owner grows for each living ally
    // carrying `tag_required`, itself included. Mix any of the four stat keys.
    //
    //   tag_required               the tag counted
    //   hp_per_tagged_unit         max HP (and current) per tagged ally
    //   armor_per_tagged_unit      armor per tagged ally
    //   power_per_tagged_unit      action power per tagged ally
    //   initiative_per_tagged_unit initiative per tagged ally
    //
    // The gate used to require hp_per_tagged_unit, which silently dropped any
    // passive that grants no HP — Banquet (power + initiative) would have done
    // nothing at all. It now fires when ANY of the four is declared.
    if (p.tag_required != null && (p.hp_per_tagged_unit != null || p.armor_per_tagged_unit != null ||
                                   p.power_per_tagged_unit != null || p.initiative_per_tagged_unit != null)) {
      const n = tagCount(engine, owner.side, p.tag_required);
      if (n > 0) {
        const hpBonus    = (p.hp_per_tagged_unit ?? 0) * n;
        const armorBonus = (p.armor_per_tagged_unit ?? 0) * n;
        // Horde now pays HP and POWER rather than HP and armor: a swarm passive
        // that only made each zombie harder to kill made the swarm slower to
        // resolve, not more dangerous.
        const powerBonus = (p.power_per_tagged_unit ?? 0) * n;
        const initBonus  = (p.initiative_per_tagged_unit ?? 0) * n;
        if (hpBonus > 0) {
          owner.battle_hp += hpBonus;
          owner.max_hp    += hpBonus;
          engine.recordGrantedBuff(owner, 'max_hp', [owner], hpBonus);
        }
        if (armorBonus > 0) {
          owner.armor += armorBonus;
          engine.recordGrantedBuff(owner, 'armor', [owner], armorBonus);
        }
        if (powerBonus > 0 && owner.unit_data) {
          owner.unit_data.action_power = (owner.unit_data.action_power ?? 0) + powerBonus;
          engine.recordGrantedBuff(owner, 'action_power', [owner], powerBonus);
        }
        if (initBonus > 0) {
          owner.initiative = (owner.initiative ?? 0) + initBonus;
          engine.recordGrantedBuff(owner, 'initiative', [owner], initBonus);
        }
        const parts = [];
        if (hpBonus)    parts.push(`+${hpBonus} HP`);
        if (armorBonus) parts.push(`+${armorBonus} armor`);
        if (powerBonus) parts.push(`+${powerBonus} power`);
        if (initBonus)  parts.push(`+${initBonus} initiative`);
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, value: n, message: `${def.name} — ${n} ${p.tag_required} allies: ${parts.join(', ')}` });
      }
    }
    // Ethereal Form: a shield at battle start, scaled by how many of the tag are
    // fielded. On battle start only — it is the ghosts arriving together, not a
    // ward that renews.
    if (p.shield_per_tagged_unit != null && p.tag_required != null) {
      const n = tagCount(engine, owner.side, p.tag_required);
      const amount = p.shield_per_tagged_unit * n;
      if (amount > 0) engine.grantShield(owner, amount, def, owner);
    }
    if (p.adjacent_physical_dmg_reduction_pct != null) {
      // ADJACENT, as the description says — not "anywhere within a row or two".
      // The old test compared rows only, so on a 3-row grid `range: 1` from the
      // middle row covered every row, and from an outer row still covered two
      // thirds of the field: the aura hit the whole enemy side and the range
      // parameter did nothing.
      //
      // Adjacency here is the same shape the engine already uses for melee
      // reach: the enemy must stand in the column FACING this unit, and be
      // within `range` rows of it. Footprint-to-footprint, so a large unit is
      // measured by the cells it actually occupies rather than its anchor.
      const enemies   = engine.combatants.filter(c => c.side !== owner.side);
      const fearRange = p.range ?? 1;
      const ownerRows = engine.getFootprint(owner).map(cellRow);
      for (const e of enemies) {
        const cells = engine.getFootprint(e);
        // Front column of the enemy's own side — the rank standing opposite.
        const facingCol = e.side === 'enemy' ? 0 : 1;
        if (!cells.some(cell => cellCol(cell) === facingCol)) continue;
        const rowDist = Math.min(...cells.map(cellRow)
          .flatMap(r => ownerRows.map(or => Math.abs(r - or))));
        if (rowDist <= fearRange) {
          e._fear_dmg_reduction = Math.min(100, (e._fear_dmg_reduction ?? 0) + p.adjacent_physical_dmg_reduction_pct);
        }
      }
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: 'adjacent enemies', value: p.adjacent_physical_dmg_reduction_pct });
    }
    if (p.command_initiative_bonus != null) {
      const ownerRow = cellRow(owner.cellIndex);
      const rowAlly = engine.combatants.find(c =>
        c.side === owner.side && c.alive && c.id !== owner.id &&
        cellRow(c.cellIndex) === ownerRow
      );
      if (rowAlly) {
        rowAlly.initiative += p.command_initiative_bonus;
        engine.recordGrantedBuff(owner, 'initiative', [rowAlly], p.command_initiative_bonus);
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: rowAlly.unit_name, targetCell: rowAlly.cellIndex, value: p.command_initiative_bonus });
      }
    }
    if (p.sorrow_initiative_drain === true) {
      // Counted 'Specter', a tag no unit in the game carries, so the drain was
      // always 2 x 0 and Sorrow did nothing at all. The tag is Spirit, and it
      // now comes from the params rather than being hardcoded.
      const n = tagCount(engine, owner.side, p.tag_required ?? 'Spirit');
      if (n > 0) {
        const drain = (p.sorrow_drain_per_tag ?? 2) * n;
        const enemies = engine.combatants.filter(c => c.side !== owner.side);
        for (const e of enemies) {
          e.initiative = Math.max(0, e.initiative - drain);
          e._sorrow_source_ids = e._sorrow_source_ids ?? [];
          e._sorrow_source_ids.push(owner.id);
        }
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: 'all enemies', value: drain });
      }
    }
    if (p.inspiration_stat != null && (p.inspiration_value != null || p.inspiration_value_per_tag != null)) {
      // The magnitude can scale with how many of the tag are fielded; who it
      // reaches (adjacent allies in the column) is unchanged.
      const inspVal = p.inspiration_value_per_tag != null
        ? p.inspiration_value_per_tag * tagCount(engine, owner.side, p.tag_required)
        : p.inspiration_value;
      const targets = inspVal > 0 ? engine.getInspirationTargets(owner) : [];
      for (const t of targets) {
        if (p.inspiration_stat === 'armor') {
          t.armor += inspVal;
        } else if (p.inspiration_stat === 'initiative') {
          t.initiative += inspVal;
          // The buff icon needs something ON THE TARGET to read. recordGrantedBuff
          // files the grant against the SOURCE, and applyStatBuff just moves the
          // number, so without this the inspired unit carries no sign of it and
          // the icon row has nothing to show.
          t._inspiration_initiative = (t._inspiration_initiative ?? 0) + inspVal;
        } else if (p.inspiration_stat === 'max_hp') {
          t.max_hp    += inspVal;
          t.battle_hp += inspVal;
          t._inspiration_max_hp = (t._inspiration_max_hp ?? 0) + inspVal;
        } else if (p.inspiration_stat === 'damage') {
          t._dmg_mult = (t._dmg_mult ?? 1) * (1 + inspVal / 100);
          // Summed for DISPLAY while the multiplier above compounds, so two +3%
          // sources read as 6% on the icon and are worth 6.09% in the maths. The
          // icon is a summary of what is helping this unit, not a damage
          // calculator, and a compounded figure there would be unreadable.
          t._inspiration_damage = (t._inspiration_damage ?? 0) + inspVal;
        }
      }
      if (targets.length) {
        engine.recordGrantedBuff(owner, p.inspiration_stat, targets, p.inspiration_stat === 'damage' ? inspVal / 100 : inspVal);
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: targets.map(t => t.unit_name).join(', '), value: inspVal, message: `${def.name} — +${inspVal}${p.inspiration_stat === 'damage' ? '%' : ''} ${p.inspiration_stat} to adjacent allies in column` });
      }
    }
    // Resistance aura: +N of one school to every living ally, the carrier
    // included. Written into unit_data.resistances so calcDamage's existing
    // resistance step picks it up with no special case. Guarded by a flag —
    // on_battle_start can fire more than once for a revived unit, and this must
    // not stack with itself.
    if (p.resist_aura_school != null && (p.resist_aura_value != null || p.resist_aura_value_per_tag != null) &&
        !owner._flags[def.id + '_aura']) {
      owner._flags[def.id + '_aura'] = true;
      const school = p.resist_aura_school;
      const auraVal = p.resist_aura_value_per_tag != null
        ? p.resist_aura_value_per_tag * tagCount(engine, owner.side, p.tag_required)
        : p.resist_aura_value;
      const allies = engine.combatants.filter(c => c.side === owner.side && c.alive);
      for (const t of allies) {
        if (!t.unit_data) continue;
        const resists = { ...(t.unit_data.resistances || {}) };
        resists[school] = (resists[school] || 0) + auraVal;
        t.unit_data = { ...t.unit_data, resistances: resists };
      }
      if (allies.length) {
        engine.pushLog({
          type: 'passive', passive: def.name,
          actorId: owner.id, actorName: owner.unit_name, actorCell: owner.cellIndex,
          targetName: 'all allies', value: auraVal,
          heal: false, stat: `${school} resistance`,
          message: `${def.name} — +${auraVal} ${school} resistance to the party`,
        });
      }
    }

    // Guardian bonds: this unit gives half of itself to the ally in front and
    // becomes an untouchable passenger. Unity (Holy) and Blood Bond (Vampire) are
    // the same mechanic against different hosts, so the ability names WHICH
    // synergy it forms and everything below is shared. `unity_bond: true` is the
    // original spelling, kept working so no data has to move.
    const bondSynergyId = p.bond_synergy || (p.unity_bond === true ? 'unity_bond' : null);
    if (bondSynergyId && !owner._flags[def.id + '_bonded']) {
      // Flagged NOW, not when the bond actually forms, so a deferred bond cannot
      // be queued twice.
      owner._flags[def.id + '_bonded'] = true;
      const form = () => formGuardianBond(owner, def, bondSynergyId, engine);
      // DEFERRED to the end of the trigger. The guardian's own other battle-start
      // passives grow the stats being handed over — Banquet gives Mother's
      // Chalice power and initiative per Vampire ally — and passives run in the
      // order the unit lists them, so a bond that formed inline handed over
      // whatever half of them happened to have run first. Half of the FINAL unit
      // is the only answer that does not depend on array order.
      if (typeof ctx._deferToEnd === 'function') ctx._deferToEnd(form);
      else form();
    }
  }
  if (trigger === 'on_turn_start' && owner === actor) {
    if (p.regen_pct != null) {
      const heal = Math.floor(owner.max_hp * p.regen_pct / 100);
      const before = owner.battle_hp;
      owner.battle_hp = Math.min(owner.max_hp, owner.battle_hp + heal);
      const actual = owner.battle_hp - before;
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, value: heal });
      if (actual > 0) engine.fireHealTriggers(owner, owner, actual);
    }
    // Bleed, burn, poison, chill, Renew and Recuperate's deferred damage are
    // ticks any unit can carry, so they run in engine.applyTurnStartTicks — not
    // here, where the block only executes for units that own an on_turn_start
    // passive. Only genuine passives (regen above, light_of_dawn below) belong here.
    if (p.light_of_dawn === true) {
      const ownerRow = cellRow(owner.cellIndex);

      // "The one in front" means the FIRST unit standing in that row — front
      // column if anyone is there, otherwise the back one. It does not mean a
      // fixed cell.
      //
      // The old version picked a column arithmetically from the OWNER's own
      // column: the ally was whichever column the owner was not in (so a unit
      // standing in the front column healed the one BEHIND it), and the enemy
      // was the owner's column index mirrored onto the other side, ignoring
      // that the enemy's front column is 0 while the player's is 1. Both
      // therefore hit the wrong cell, and hit nothing at all whenever that one
      // cell happened to be empty even though the row was occupied.
      //
      // Footprint-aware, because a 'row' unit stands in both columns and a
      // 'column' unit covers two rows — matching on cellIndex alone misses them.
      const frontColOf = side => (side === 'enemy' ? 0 : 1);
      const firstInRow = (side, row, excludeId = null) => {
        const front = frontColOf(side);
        for (const col of [front, front === 0 ? 1 : 0]) {
          const hit = engine.combatants.find(c =>
            c.side === side && c.alive && c.id !== excludeId &&
            engine.getFootprint(c).some(cell => cellRow(cell) === row && cellCol(cell) === col));
          if (hit) return hit;
        }
        return null;
      };

      const frontAlly = firstInRow(owner.side, ownerRow, owner.id);
      if (frontAlly) {
        const healBase = p.light_of_dawn_per_tag != null
          ? p.light_of_dawn_per_tag * tagCount(engine, owner.side, p.tag_required)
          : (p.light_of_dawn_heal ?? 15);
        const healAmt = Math.min(Math.floor(healBase * engine.fatigueHealMult()), frontAlly.max_hp - frontAlly.battle_hp);
        if (healAmt > 0) {
          frontAlly.battle_hp += healAmt;
          engine.fireHealTriggers(owner, frontAlly, healAmt);
          engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: frontAlly.unit_name, targetId: frontAlly.id, targetCell: frontAlly.cellIndex, value: healAmt, heal: true });
        }
      }
      const frontEnemy = firstInRow(owner.side === 'player' ? 'enemy' : 'player', ownerRow);
      if (frontEnemy) {
        // Typed, so resistances apply: the dawn light was raw HP loss that a
        // unit resistant to life took in full, unlike every other typed source.
        const dmgBase = p.light_of_dawn_per_tag != null
          ? p.light_of_dawn_per_tag * tagCount(engine, owner.side, p.tag_required)
          : (p.light_of_dawn_dmg ?? 15);
        const dmgAmt = typedAmount(frontEnemy, dmgBase, p.light_of_dawn_damage_type ?? 'life');
        hurt(frontEnemy, dmgAmt);
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: frontEnemy.unit_name, targetId: frontEnemy.id, targetCell: frontEnemy.cellIndex, value: dmgAmt, heal: false });
        if (frontEnemy.battle_hp <= 0) { frontEnemy.alive = false; engine.applyOnDeathPassives(frontEnemy); }
      }
    }
  }
  if (trigger === 'on_hit' && owner === actor && target && dmg > 0) {
    if (p.lowest_ally_heal_pct != null) {
      const healPct = pctFor(p, engine, owner.side, "lowest_ally_heal_pct", "lowest_ally_heal_pct_per_tag");
      const heal = Math.floor(dmg * healPct / 100 * engine.fatigueHealMult());
      const candidates = engine.combatants.filter(c => c.side === owner.side && c.alive && c.max_hp > c.battle_hp);
      if (candidates.length > 0) {
        const lowest = candidates.reduce((a, b) => {
          const aMissing = a.max_hp - a.battle_hp;
          const bMissing = b.max_hp - b.battle_hp;
          if (aMissing === bMissing) {
            return a.battle_hp < b.battle_hp ? a : b;
          }
          return aMissing > bMissing ? a : b;
        }, candidates[0]);
        const actual = Math.min(heal, lowest.max_hp - lowest.battle_hp);
        lowest.battle_hp += actual;
        if (actual > 0) {
          // Include sourceId/sourceCell so visual effects (e.g. communion) can
          // draw transfers from the damaged enemy to the healed ally.
          engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: lowest.unit_name, targetCell: lowest.cellIndex, targetId: lowest.id, value: actual, sourceId: target?.id, sourceCell: target?.cellIndex });
          engine.fireHealTriggers(owner, lowest, actual);
        }
      }
    }
    if (p.lowest_enemy_dmg_pct != null) {
      const enemies = engine.combatants.filter(c => c.side !== owner.side && c.alive);
      if (enemies.length > 0) {
        const lowest = enemies.reduce((a, b) => a.battle_hp < b.battle_hp ? a : b, enemies[0]);
        const extra = Math.max(1, Math.floor(dmg * pctFor(p, engine, owner.side, "lowest_enemy_dmg_pct", "lowest_enemy_dmg_pct_per_tag") / 100));
        hurt(lowest, extra);
        if (lowest.battle_hp <= 0) { lowest.alive = false; engine.applyOnDeathPassives(lowest); }
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: lowest.unit_name, targetCell: lowest.cellIndex, value: extra, heal: false });
      }
    }
    if (p.self_heal_pct != null) {
      const heal = Math.floor(dmg * p.self_heal_pct / 100 * engine.fatigueHealMult());
      const actual = Math.min(heal, owner.max_hp - owner.battle_hp);
      owner.battle_hp += actual;
      if (actual > 0) {
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, value: actual });
        engine.fireHealTriggers(owner, owner, actual);
      }
    }
    if (p.dot_dmg_pct != null) {
      // Burn and Poison are now INDEPENDENT damage-over-time effects on separate
      // slots (burn -> dot_dmg, poison -> _poison_dmg), so a unit can carry both
      // at once. Each new hit STACKS onto whatever is already there.
      const add      = dotAmount(dmg, p.dot_dmg_pct, def);
      const isPoison = (def.name || '').toLowerCase() === 'poison';
      if (isPoison) {
        target._poison_dmg = (target._poison_dmg ?? 0) + add;
        target._poison_source_key = abilityKey;
        engine.registerEffect(target, {
          key: 'poison', name: def.name, polarity: 'negative', dispellable: def.dispellable === true,
          clear: { _poison_dmg: 0, _poison_source_key: null },
        });
      } else {
        target.dot_dmg = (target.dot_dmg ?? 0) + add;
        target._dot_type = 'burn';
        target._dot_source_key = abilityKey;
        engine.registerEffect(target, {
          key: 'dot', name: def.name, polarity: 'negative', dispellable: def.dispellable === true,
          clear: { dot_dmg: 0, _dot_permanent: 0, _dot_type: null, _dot_source_key: null },
        });
      }
      engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: add });
    }
    if (p.bleed_dmg_pct != null) {
      const add = dotAmount(dmg, p.bleed_dmg_pct, def);
      target._bleed_dmg = (target._bleed_dmg ?? 0) + add; // stacks
      target._bleed_source_key = abilityKey;
      engine.registerEffect(target, {
        key: 'bleed', name: def.name, polarity: 'negative', dispellable: def.dispellable === true,
        clear: { _bleed_dmg: 0, _bleed_permanent: 0, _bleed_source_key: null },
      });
      engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: add });
    }
    if (p.chill_dmg_pct != null) {
      const add = dotAmount(dmg, p.chill_dmg_pct, def);
      target._chill_dmg = (target._chill_dmg ?? 0) + add; // stacks
      target._chill_source_key = abilityKey;
      engine.registerEffect(target, {
        key: 'chill', name: def.name, polarity: 'negative', dispellable: def.dispellable === true,
        clear: { _chill_dmg: 0, _chill_source_key: null },
      });
      engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: add });
    }
    if (p.armor_shred != null) {
      const reduction = target._debuff_reduction ?? 0;
      const effective = Math.max(1, Math.floor(p.armor_shred * (1 - reduction / 100)));
      const applied   = Math.min(effective, target.armor); // can't restore more than was taken
      target.armor = Math.max(0, target.armor - effective);
      engine.registerEffect(target, {
        key: 'armor_shred', name: def.name, polarity: 'negative', dispellable: def.dispellable === true, restore: { armor: applied },
      });
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: effective, heal: false });
    }
    if (p.initiative_shred != null) {
      const applied = Math.min(p.initiative_shred, target.initiative);
      target.initiative = Math.max(0, target.initiative - p.initiative_shred);
      engine.registerEffect(target, {
        key: 'initiative_shred', name: def.name, polarity: 'negative', dispellable: def.dispellable === true, restore: { initiative: applied },
      });
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: p.initiative_shred, heal: false });
    }
    if (p.stacks_needed != null && p.stack_burst_damage != null) {
      const key = p.stack_key || 'generic_stack';
      target._stacks[key] = (target._stacks[key] ?? 0) + 1;
      if (target._stacks[key] >= p.stacks_needed) {
        target._stacks[key] = 0;
        // The burst used to be `stack_burst_damage - target.armor` — armor as a
        // FLAT subtraction, which nothing else in the game does. Armor is a
        // percentage everywhere else (calcDamageWithPassives: armorRed =
        // armor/100, and the Armor tooltip says "each point reduces damage by
        // 1%"), so Death Mark's 15 became 1 against any target with 15 armor.
        // It read as the passive having stopped working, because against
        // anything armoured it did nothing.
        //
        // `damage_type` was declared on the param and then ignored outright: a
        // 'death' burst is not physical, so it goes through the target's
        // resistance like every other typed hit, not through armor at all.
        const burst = typedAmount(target, p.stack_burst_damage, p.damage_type ?? 'physical');
        hurt(target, burst);
        if (target.battle_hp <= 0) { target.alive = false; engine.applyOnDeathPassives(target); }
        // targetId, so the client can place the animation on the struck cell —
        // the FX layer resolves its target by id (see effectForEntry/playback in
        // screens/battle.js) and this entry never carried one.
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetId: target.id, targetName: target.unit_name, targetCell: target.cellIndex, value: burst, heal: false });
      }
    }
    if (p.stack_bonus_pct != null && p.max_stacks != null) {
      const key = p.stack_key || 'generic_stack';
      if (owner._stacks[key + '_target'] !== target.id) {
        owner._stacks[key] = 1;
        owner._stacks[key + '_target'] = target.id;
      } else if ((owner._stacks[key] ?? 0) < p.max_stacks) {
        owner._stacks[key]++;
      }
      owner._dmg_mult = 1 + (owner._stacks[key] * p.stack_bonus_pct / 100);
    }
    if (p.behind_splash_pct != null) {
      const row = cellRow(target.cellIndex);
      const col = cellCol(target.cellIndex);
      const behind = engine.combatants.find(c =>
        c.side === target.side && c.alive && c.id !== target.id &&
        cellRow(c.cellIndex) === row && cellCol(c.cellIndex) !== col
      );
      if (behind) {
        const splash = Math.floor(dmg * p.behind_splash_pct / 100);
        hurt(behind, splash);
        if (behind.battle_hp <= 0) { behind.alive = false; engine.applyOnDeathPassives(behind); }
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: behind.unit_name, targetCell: behind.cellIndex, value: splash, heal: false });
      }
    }
    if (p.fellfire_pct != null || p.fellfire_pct_per_tag != null) {
      // Splash a fraction of the damage to every OTHER burning enemy.
      const burning = engine.combatants.filter(c =>
        c.side !== owner.side && c.alive && c.id !== target.id && (c.dot_dmg ?? 0) > 0
      );
      for (const b of burning) {
        const splash = Math.max(1, Math.floor(dmg * pctFor(p, engine, owner.side, "fellfire_pct", "fellfire_pct_per_tag") / 100));
        hurt(b, splash);
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: b.unit_name, targetId: b.id, targetCell: b.cellIndex, value: splash, heal: false });
        if (b.battle_hp <= 0) {
          b.alive = false;
          engine.applyOnDeathPassives(b);
          engine.fireTrigger('on_kill', { actor: owner, target: b, dmg: splash, dying: null });
          engine.fireTrigger('on_ally_death', { actor: owner, target: b, dmg: splash, dying: b });
        }
      }
    }
    if (p.healing_reduction_pct != null) {
      // Infect does NOT stack. Every hit re-applies it, and re-applying takes
      // the stronger of the two rather than adding: an attacker with Infect
      // lands several blows a round, and stacking drove any target to a 100%
      // healing block within two rounds, which made healers pointless rather
      // than pressured. A higher rank (or a second infector) still upgrades a
      // weaker one — it just cannot pile onto itself.
      const before  = target._healing_reduction ?? 0;
      const applied = Math.max(0, Math.min(100, p.healing_reduction_pct) - before);
      if (applied > 0) {
        target._healing_reduction = before + applied;
        engine.registerEffect(target, {
          key: 'healing_reduction', name: def.name, polarity: 'negative', dispellable: def.dispellable === true,
          restore: { _healing_reduction: -applied }, // dispel undoes exactly what was added
        });
        engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: target._healing_reduction });
      }
    }
    // ── Decay: stacking anti-heal pool on the TARGET (see POOL_CAP_PCT).
    if (p.decay_amount != null) {
      engine.applyDecay(target, p.decay_amount, def);
    }
    // ── Shield: absorbs damage. `shield_target: 'self'` shields the attacker
    // (a unit that hardens as it strikes); anything else shields whoever was
    // hit, which is what an ally-facing trigger wants.
    if (p.shield_amount != null) {
      engine.grantShield(p.shield_target === 'self' ? owner : target, p.shield_amount, def);
    }
    if (p.chain_targets != null && !ctx._is_chain_hit) {
      const enemies = engine.combatants.filter(c => c.side !== owner.side && c.alive && c.id !== target.id);
      const count = Math.min(p.chain_targets, enemies.length);
      const shuffled = enemies.sort(() => Math.random() - 0.5);
      for (let i = 0; i < count; i++) {
        const chainTarget = shuffled[i];
        const chainDmg = Math.max(1, Math.floor(dmg * (1 - p.chain_damage_reduction_pct / 100)));
        hurt(chainTarget, chainDmg);
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: chainTarget.unit_name, targetCell: chainTarget.cellIndex, value: chainDmg, heal: false });
        if (chainTarget.battle_hp <= 0) {
          chainTarget.alive = false;
          engine.applyOnDeathPassives(chainTarget);
          engine.fireTrigger('on_kill', { actor: owner, target: chainTarget, dmg: chainDmg, dying: null });
          engine.fireTrigger('on_ally_death', { actor: owner, target: chainTarget, dmg: chainDmg, dying: chainTarget });
        }
        engine.fireTrigger('on_hit', { actor: owner, target: chainTarget, dmg: chainDmg, dying: null, _is_chain_hit: true });
        engine.fireTrigger('on_hit_received', { actor: owner, target: chainTarget, dmg: chainDmg, dying: null, _is_chain_hit: true });
      }
    }
    if (p.dissipate_resistance_pct != null) {
      const flagKey = def.id + '_applied_' + target.id;
      if (!owner._flags[flagKey]) {
        owner._flags[flagKey] = true;
        const damageSource = owner.unit_data?.damage_source ?? 'physical';
        if (damageSource !== 'physical') {
          const resistances = target.unit_data?.resistances ?? target.resistances;
          if (resistances) {
            const current = resistances[damageSource] ?? 0;
            const reduction = target._debuff_reduction ?? 0;
            const effective = Math.floor(p.dissipate_resistance_pct * (1 - reduction / 100));
            // How much was ACTUALLY taken. Clamped at zero, so a resistance
            // already low gives back only what it lost — the undo has to match
            // the deduction or a dispel would hand out resistance from nowhere.
            const applied = Math.min(effective, current);
            resistances[damageSource] = current - applied;
            if (applied > 0) {
              // Registered so the shred is VISIBLE: a portrait badge like every
              // other debuff, and dispellable. It was previously applied
              // silently — the number moved on the inspector and nothing said
              // why, and no cleanse could touch it.
              // No `rounds`: nothing schedules an expiry for this record, so the
              // shred stands until the battle ends or something dispels it.
              // `amount` is what the badge prints — the record used to say only
              // "Dissipate", which told the player nothing about how much
              // resistance had gone or to which school.
              engine.registerEffect(target, {
                key:  `dissipate:${damageSource}`,
                name: `${def.name} · ${damageSource} resistance`,
                polarity: 'negative',
                dispellable: def.dispellable !== false,
                icon: 'dissipate',
                amount: applied,
                restore: { [`unit_data.resistances.${damageSource}`]: applied },
              });
            }
            engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: applied });
          }
        }
      }
    }
  }
  if (trigger === 'on_hit_received' && owner === target && dmg > 0) {
    if (p.reflect_pct != null) {
      const reflect = Math.floor(dmg * p.reflect_pct / 100);
      hurt(actor, reflect);
      if (actor.battle_hp <= 0) { actor.alive = false; engine.applyOnDeathPassives(actor); }
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, value: reflect, heal: false });
    }
    if (p.adjacent_aoe_damage != null || p.adjacent_aoe_damage_per_tag != null) {
      // Retaliation splash, centred on the ATTACKER and including it.
      //
      // It used to measure row distance from the OWNER and exclude the attacker,
      // which was wrong twice over: the owner stands on the opposite grid so the
      // comparison was across boards, and with no column term at all `range: 1`
      // selected every cell in three rows — four of six cells minimum, all six
      // from the middle row. The one unit it reliably spared was the attacker,
      // which is precisely who a retaliation is for.
      //
      // Manhattan distance, so range 1 is the struck cell plus its orthogonal
      // neighbours and a diagonal stays out. Footprint-to-footprint, because a
      // 'row' or 'column' unit stands in more than one cell.
      const splashDmg  = p.adjacent_aoe_damage_per_tag != null
        ? p.adjacent_aoe_damage_per_tag * tagCount(engine, owner.side, p.tag_required)
        : p.adjacent_aoe_damage;
      const range      = p.range ?? 1;
      const actorCells = engine.getFootprint(actor);
      const withinRange = c => engine.getFootprint(c).some(tc =>
        actorCells.some(ac =>
          Math.abs(cellRow(tc) - cellRow(ac)) + Math.abs(cellCol(tc) - cellCol(ac)) <= range));

      const adjacent = engine.combatants.filter(c =>
        c.side === actor.side && c.alive && withinRange(c)
      );
      for (const adj of adjacent) {
        hurt(adj, splashDmg);
        if (adj.battle_hp <= 0) { adj.alive = false; engine.applyOnDeathPassives(adj); }
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: adj.unit_name, targetCell: adj.cellIndex, value: splashDmg, heal: false });
      }
    }
    if (p.retaliation_damage != null) {
      hurt(actor, p.retaliation_damage);
      if (actor.battle_hp <= 0) { actor.alive = false; engine.applyOnDeathPassives(actor); }
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, value: p.retaliation_damage, heal: false });
    }
    if (p.debuff_reduction_pct != null && owner._debuff_reduction == null) {
      owner._debuff_reduction = p.debuff_reduction_pct;
    }
    if (p.rage_atk_bonus != null) {
      owner._dmg_mult = (owner._dmg_mult ?? 1) + p.rage_atk_bonus / 100;
      owner.initiative = (owner.initiative ?? 0) + (p.rage_init_bonus ?? 0);
      owner._rage_stacks = (owner._rage_stacks ?? 0) + 1;   // display only
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, value: p.rage_atk_bonus });
    }
  }
  if (trigger === 'on_kill' && owner === actor) {
    if (p.kill_damage_bonus_pct != null) {
      owner._dmg_mult = (owner._dmg_mult ?? 1) + p.kill_damage_bonus_pct / 100;
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, value: p.kill_damage_bonus_pct });
    }
  }
  if (trigger === 'on_death' && owner === dying) {
    if (p.survive_uses != null && !owner._flags[def.id + '_used']) {
      owner._flags[def.id + '_used'] = true;
      owner.alive = true;
      owner.battle_hp = p.survive_heal_pct != null
        ? 1 + Math.floor(owner.max_hp * p.survive_heal_pct / 100)
        : 1;
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, value: owner.battle_hp });
    }
    if (p.reanimate === true && !owner._flags[def.id + '_used']) {
      owner._flags[def.id + '_used'] = true;
      // Count Zombie-tagged units on this side (including self — already dead but still combatant)
      const zombieCount = engine.combatants.filter(c => c.side === owner.side && (c.unit_data?.tags ?? []).includes('Zombie')).length;
      const reviveHpPct = zombieCount * (p.reanimate_hp_pct_per_zombie ?? 10);
      const reviveHp = Math.max(1, Math.floor(owner.max_hp * reviveHpPct / 100));
      // Mark for revival next round instead of immediately restoring alive
      owner._reanimate_pending = reviveHp;
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, message: `${def.name} — ${owner.unit_name} will reanimate next turn with ${reviveHp} HP (${zombieCount} Zombie tag${zombieCount !== 1 ? 's' : ''})` });
    }
    if (p.death_aoe_damage != null || p.death_aoe_damage_per_tag != null) {
      const deathDmg = p.death_aoe_damage_per_tag != null
        ? p.death_aoe_damage_per_tag * tagCount(engine, owner.side, p.tag_required)
        : p.death_aoe_damage;
      for (const e of engine.combatants.filter(c => c.side !== owner.side && c.alive)) {
        hurt(e, deathDmg);
        if (e.battle_hp <= 0) e.alive = false;
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: e.unit_name, targetId: e.id, targetCell: e.cellIndex, value: deathDmg, heal: false });
      }
    }
  }
  if (trigger === 'on_heal' && owner === actor) {
    if ((p.hot_pct != null || p.hot_pct_per_tag != null) && target) {
      target._hot = (target._hot ?? 0) + Math.floor(dmg * pctFor(p, engine, owner.side, "hot_pct", "hot_pct_per_tag") / 100);
      engine.registerEffect(target, {
        key: 'hot', name: def.name, polarity: 'positive', dispellable: def.dispellable === true, clear: { _hot: 0 },
      });
      engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: target._hot });
    }
  }
  if (trigger === 'on_healed' && owner === target && dmg > 0) {
    if (p.fanaticism_max_stack_pct != null) {
      const cap       = Math.floor(owner._base_max_hp * p.fanaticism_max_stack_pct / 100);
      const remaining = Math.max(0, cap - (owner._fanaticism_bonus ?? 0));
      const grow      = Math.min(dmg, remaining);
      if (grow > 0) {
        owner._fanaticism_bonus = (owner._fanaticism_bonus ?? 0) + grow;
        owner.max_hp    += grow;
        owner.battle_hp += grow;
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, value: grow, message: `${def.name} — max HP grows by ${grow} (${owner._fanaticism_bonus}/${cap})` });
      }
    }
    if (p.radiance_pct != null) {
      const radDmg = Math.floor(dmg * p.radiance_pct / 100);
      if (radDmg > 0) {
        // ADJACENT, not "everyone across the way". Row proximity alone was the
        // whole test, and with three rows that reaches every row from the
        // middle one and both columns besides — i.e. the entire enemy team.
        // An enemy can only be beside this unit if it stands in its own FRONT
        // column (the two grids face each other: player col 1 meets enemy col
        // 0, same as target: 'enemy_front' in getAbilityTargets below), and in
        // this unit's row or one either side of it.
        const ownerRow = cellRow(owner.cellIndex);
        const adjEnemies = engine.combatants.filter(c =>
          c.side !== owner.side && c.alive &&
          cellCol(c.cellIndex) === (c.side === 'enemy' ? 0 : 1) &&
          Math.abs(cellRow(c.cellIndex) - ownerRow) <= 1
        );
        for (const e of adjEnemies) {
          hurt(e, radDmg);
          // targetId is what the client resolves the victim's cell by — a player
          // and an enemy routinely share a cellIndex, so the cell alone cannot
          // find it, and without this Radiance logged correctly but never
          // animated. actorId anchors the beam on the caster it leaves from.
          engine.pushLog({ type: 'passive', passive: def.name, actorId: owner.id, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: e.unit_name, targetId: e.id, targetCell: e.cellIndex, value: radDmg, heal: false });
          if (e.battle_hp <= 0) { e.alive = false; engine.applyOnDeathPassives(e); }
        }
      }
    }
  }
  if (trigger === 'on_take_damage' && owner === target && dmg > 0) {
    if (p.resist_gain != null && p.match_damage_type) {
      owner._aegis_stacks = (owner._aegis_stacks ?? 0) + 1;   // display only

      const damageSource = actor?.unit_data?.damage_source ?? 'physical';
      if (damageSource === 'physical') {
        owner._aegis_armor = (owner._aegis_armor ?? 0) + p.resist_gain;
        owner.armor += p.resist_gain;
        engine.recordGrantedBuff(owner, 'armor', [owner], p.resist_gain);
      } else {
        const res = owner.unit_data?.resistances ?? owner.resistances;
        if (res) {
          res[damageSource] = (res[damageSource] ?? 0) + p.resist_gain;
          owner._aegis_resists = owner._aegis_resists ?? {};
          owner._aegis_resists[damageSource] = (owner._aegis_resists[damageSource] ?? 0) + p.resist_gain;
        }
      }
      // targetId is required for the animation to find a cell to draw on — the
      // client's passive dispatch looks the target up by id, not by cell index
      // (a player and an enemy routinely share a cell index). Without it Aegis
      // logged correctly but never animated.
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetId: owner.id, targetCell: owner.cellIndex, value: p.resist_gain });
    }
  }
  if (trigger === 'on_receive_ally_buff' && owner === target) {
    // Fanaticism pays in POWER, not in a damage multiplier: the multiplier
    // compounded with every other percentage the unit carried and was invisible
    // on the sheet, while power is the stat the attack is actually built from
    // and shows up in the inspector. Written straight onto unit_data and never
    // revoked or timed out, so it holds for the whole battle.
    if (p.power_bonus_flat != null && owner.unit_data) {
      owner.unit_data.action_power = (owner.unit_data.action_power ?? 0) + p.power_bonus_flat;
      owner._fanaticism_stacks = (owner._fanaticism_stacks ?? 0) + 1;
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetId: owner.id, targetName: owner.unit_name, targetCell: owner.cellIndex, value: p.power_bonus_flat, message: `${def.name} — +${p.power_bonus_flat} power (${owner.unit_data.action_power} total)` });
    }
  }
  if (trigger === 'on_ally_death' && owner !== dying && owner.side === dying?.side && owner.alive) {
    if (p.dmg_bonus_pct != null) {
      owner._dmg_mult = (owner._dmg_mult ?? 1) + p.dmg_bonus_pct / 100;
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, value: p.dmg_bonus_pct });
    }
    if (p.eternal_grief_sacrifice_pct != null) {
      const sacrifice = Math.floor(owner.max_hp * p.eternal_grief_sacrifice_pct / 100);
      const actualSacrifice = Math.min(sacrifice, owner.battle_hp - 1);
      if (actualSacrifice > 0) {
        owner.battle_hp -= actualSacrifice;
        const candidates = engine.combatants.filter(c => c.side === owner.side && c.alive && c.id !== owner.id);
        if (candidates.length > 0) {
          const lowest = candidates.reduce((a, b) => a.battle_hp < b.battle_hp ? a : b);
          const healed = Math.min(Math.floor(actualSacrifice * engine.fatigueHealMult()), lowest.max_hp - lowest.battle_hp);
          if (healed > 0) {
            lowest.battle_hp += healed;
            engine.fireHealTriggers(owner, lowest, healed);
          }
          engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: lowest.unit_name, targetCell: lowest.cellIndex, value: healed, heal: true, message: `${def.name} — ${owner.unit_name} sacrifices ${actualSacrifice} HP to heal ${lowest.unit_name} for ${healed}` });
        }
      }
    }
  }
  if (trigger === 'on_round_start') {
    if (p.block_first_melee === true) {

      owner._parry_available = true;
    }
    if (p.clear_shot_initiative_bonus_pct != null || p.clear_shot_dmg_bonus_pct != null) {
      if (owner._clear_shot_active) {
        owner.initiative = Math.max(0, owner.initiative - (owner._clear_shot_initiative_amt || 0));
        owner._dmg_mult   = (owner._dmg_mult ?? 1) - (owner._clear_shot_dmg_amt || 0);
        owner._clear_shot_active = false;
        owner._clear_shot_initiative_amt = 0;
        owner._clear_shot_dmg_amt = 0;
      }
      if (owner.alive) {
        const ownerCol = cellCol(owner.cellIndex);
        const ownerRow = cellRow(owner.cellIndex);
        const frontCol = owner.side === 'enemy' ? 0 : 1;
        const backCol  = owner.side === 'enemy' ? 1 : 0;
        if (ownerCol === backCol) {
          const covered = engine.combatants.some(c =>
            c.alive && c.side === owner.side && c.id !== owner.id &&
            cellCol(c.cellIndex) === frontCol && cellRow(c.cellIndex) === ownerRow &&
            !engine.resolveAllPassiveDefs(c).some(d => d.trigger === 'intercept')
          );
          if (!covered) {
            const initAmt = Math.round(owner.initiative * (p.clear_shot_initiative_bonus_pct ?? 0) / 100);
            const dmgAmt  = (p.clear_shot_dmg_bonus_pct ?? 0) / 100;
            owner.initiative += initAmt;
            owner._dmg_mult    = (owner._dmg_mult ?? 1) + dmgAmt;
            owner._clear_shot_active = true;
            owner._clear_shot_initiative_amt = initAmt;
            owner._clear_shot_dmg_amt = dmgAmt;
            engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, message: `${def.name} — clear line of sight, +${p.clear_shot_initiative_bonus_pct ?? 0}% initiative and damage`, value: p.clear_shot_dmg_bonus_pct ?? 0 });
          }
        }
      }
    }
  }
}
function calcDamageWithPassives(actor, target, UNIT_ABILITIES, engine) {
  const data = actor.unit_data || actor;
  let power = data.action_power ?? data.action?.value ?? 12;
  const defs = resolvePassiveDefs(actor, UNIT_ABILITIES);
  const p = Object.assign({}, ...defs.map(d => d.params || {}));
  if (p.execute_bonus_pct != null && p.execute_threshold_pct != null) {
    if (target.battle_hp / target.max_hp < p.execute_threshold_pct / 100) {
      power = Math.floor(power * (1 + p.execute_bonus_pct / 100));
    }
  }
  // Leech: bonus damage against bleeding targets.
  if (p.leech_bleed_bonus_pct != null && (target._bleed_dmg ?? 0) > 0) {
    power = Math.floor(power * (1 + p.leech_bleed_bonus_pct / 100));
  }
  // Slayer family (Exorcism and anything added beside it): bonus damage when
  // the TARGET carries `vs_tag`, optionally scaled by how many of
  // `tag_required` stand with the ATTACKER. Deliberately generic — a new
  // "hunts X" passive is a data entry in unit_abilities.js and nothing here.
  // Applied to `power` alongside execute and leech, so it lands before armor
  // and resistance rather than on top of them.
  if (p.vs_tag && (target.unit_data?.tags ?? target.tags ?? []).includes(p.vs_tag)) {
    const bonus = pctFor(p, engine, actor.side, 'vs_tag_dmg_bonus_pct', 'vs_tag_dmg_bonus_pct_per_tag');
    if (bonus) power = Math.floor(power * (1 + bonus / 100));
  }
  const rawDmg = Math.floor(power * (actor._dmg_mult ?? 1));
  const damageSource = data.damage_source ?? 'physical';
  const resistances = target.unit_data?.resistances ?? target.resistances ?? {};
  let dmg = rawDmg;
  if (damageSource === 'physical') {
    const armor = Math.max(0, (target.armor ?? 0) + (target.defend_armor_bonus || 0));
    const armorRed = armor / 100;
    if (p.armor_ignore_pct != null) {
      dmg = Math.floor(rawDmg * (1 - armorRed * (1 - p.armor_ignore_pct / 100)));
    } else {
      dmg = Math.floor(rawDmg * (1 - armorRed));
    }

    if (actor._fear_dmg_reduction) {
      dmg = Math.floor(dmg * (1 - actor._fear_dmg_reduction / 100));
    }

    if (actor._terror_reduction && (actor._terror_rounds ?? 0) > 0) {
      dmg = Math.floor(dmg * (1 - actor._terror_reduction / 100));
    }
  } else {
    // Defending covers TYPED damage too. It used to add only to armor, which is
    // read in the physical branch above — so a defending unit took full fire,
    // cold, death, life, nature and air damage. Against the whole Chamber of
    // Unrest (death) or a Wailing Ghost (cold), pressing Defend did nothing.
    const resistance = Math.min(100, (resistances[damageSource] ?? 0) + (target.defend_armor_bonus || 0));
    dmg = Math.floor(rawDmg * (1 - resistance / 100));
  }
  return { dmg: Math.max(1, dmg), rawDmg };
}
function getAbilityTargets(actor, combatants, UNIT_ABILITIES) {
  const abilityKey = actor.unit_data?.ability || actor.unit_data?.active_ability;
  if (!abilityKey || !UNIT_ABILITIES) return combatants.filter(c => c.side !== actor.side && c.alive);
  const def = UNIT_ABILITIES[abilityKey];
  if (!def) return combatants.filter(c => c.side !== actor.side && c.alive);
  const p = def.params || {};
  if (def.target === 'enemy')    return combatants.filter(c => c.side !== actor.side && c.alive);
  if (def.target === 'enemy_front') {
    const actorRow = cellRow(actor.cellIndex);
    return combatants.filter(c =>
      c.side !== actor.side && c.alive &&
      cellRow(c.cellIndex) === actorRow &&
      cellCol(c.cellIndex) === (c.side === 'enemy' ? 0 : 1)
    );
  }
  // 'any' — the ability itself decides what to do with whoever is picked
  // (Holy Shock heals allies, damages enemies).
  if (def.target === 'any')      return combatants.filter(c => c.alive);
  if (def.target === 'self')     return [actor];
  if (def.target === 'ally')     return combatants.filter(c => c.side === actor.side && c.alive && c.id !== actor.id);
  if (def.target === 'ally_any') return combatants.filter(c => c.side === actor.side && c.alive);
  if (def.target === 'all_allies') return combatants.filter(c => c.side === actor.side && c.alive);
  if (def.target === 'ally_dead') {
    return combatants.filter(c =>
      c.side === actor.side && !c.alive &&
      (!p.tag_required || (c.unit_data?.tags ?? []).includes(p.tag_required))
    );
  }
  if (def.target === 'ally_tagged') {
    return combatants.filter(c =>
      c.side === actor.side && c.alive && c.id !== actor.id &&
      (!p.tag_required || (c.unit_data?.tags ?? []).includes(p.tag_required))
    );
  }
  return combatants.filter(c => c.side !== actor.side && c.alive);
}
function executeActiveAbility(actor, target, combatants, UNIT_ABILITIES, engine) {
  const abilityKey = actor.unit_data?.ability || actor.unit_data?.active_ability;
  if (!abilityKey || !UNIT_ABILITIES) return false;
  const def = UNIT_ABILITIES[abilityKey];
  if (!def) return false;
  const p = def.params || {};
  if (p.libation_sacrifice_pct != null && target && def.target === 'enemy') {
    const cost = Math.floor(actor.max_hp * p.libation_sacrifice_pct / 100);
    if (actor.battle_hp <= cost + 1) {
      engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, message: `${def.name} — ${actor.unit_name} is too weak to invoke Libation.` });
    } else {
      actor.battle_hp -= cost;
      const armor = Math.max(0, target.armor ?? 0);
      const dmg = Math.max(1, Math.floor(cost * (1 - armor / 100)));
      hurt(target, dmg);
      const dead = target.battle_hp <= 0;
      if (dead) { target.alive = false; engine.applyOnDeathPassives(target); }
      engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — ${actor.unit_name} sacrifices ${cost} HP to strike ${target.unit_name} for ${dmg}`, value: dmg, heal: false });
    }
  }
  // Radiant Surge — the target's side decides the effect. Damage goes through the
  // target's resistance for the declared school (life by default) and its armor
  // is NOT applied: this is magic, same as Libation.
  if ((p.radiant_surge_heal != null || p.radiant_surge_damage != null) && target) {
    if (target.side === actor.side) {
      const raw    = p.radiant_surge_heal ?? 0;
      const factor = 1 - (target._healing_reduction ?? 0) / 100;
      const heal   = Math.floor(Math.min(raw * factor * engine.fatigueHealMult(),
                                         target.max_hp - target.battle_hp));
      const preHealRatio = target.max_hp > 0 ? target.battle_hp / target.max_hp : 1;
      target.battle_hp += heal;
      engine.fireTrigger('on_heal',   { actor, target, dmg: heal, dying: null });
      engine.fireTrigger('on_healed', { actor, target, dmg: heal, dying: null });
      engine.pushLog({ type: 'ability', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex,
        targetName: target.unit_name, targetCell: target.cellIndex, targetId: target.id,
        value: heal, heal: true, message: `${def.name} — mended ${target.unit_name} for ${heal}` });
      engine.checkBark('heal_low_hp', actor, { target, preHealRatio });
    } else {
      const school   = p.radiant_surge_source || 'life';
      const resist   = (target.unit_data?.resistances || {})[school] ?? 0;
      const reduction = Math.max(0, Math.min(90, resist));
      const dmg      = Math.max(1, Math.floor((p.radiant_surge_damage ?? 0) * (1 - reduction / 100)));
      hurt(target, dmg);
      const dead = target.battle_hp <= 0;
      if (dead) { target.alive = false; engine.applyOnDeathPassives(target); }
      engine.pushLog({ type: 'ability', actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex,
        targetName: target.unit_name, targetCell: target.cellIndex, targetId: target.id,
        value: dmg, heal: false, killed: dead,
        message: `${def.name} — struck ${target.unit_name} for ${dmg} ${school} damage` });
    }
  }

  if (p.mothers_kiss === true && !actor._mothers_kiss) {
    actor._mothers_kiss = true;
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: 'self', message: `${def.name} — ${actor.unit_name} begins channeling Mother's Kiss each turn.` });
  }
  // Dispels. `dispel_negative` strips debuffs (cast on an ally), `dispel_positive`
  // strips buffs (cast on an enemy). Count defaults to all. Both read the unit's
  // _effects registry, so any effect registered via engine.registerEffect is
  // covered automatically — no dispel needs to know individual mechanics.
  if (p.dispel_negative != null && target) {
    const removed = engine.dispelEffects(target, 'negative', p.dispel_negative === true ? Infinity : p.dispel_negative);
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex,
      message: removed.length
        ? `${def.name} — cleansed ${removed.map(e => e.name).join(', ')} from ${target.unit_name}`
        : `${def.name} — nothing to cleanse` });
  }
  if (p.dispel_positive != null && target) {
    const removed = engine.dispelEffects(target, 'positive', p.dispel_positive === true ? Infinity : p.dispel_positive);
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex,
      message: removed.length
        ? `${def.name} — stripped ${removed.map(e => e.name).join(', ')} from ${target.unit_name}`
        : `${def.name} — nothing to strip` });
  }
  if (p.cleanse_debuffs && target) {
    // Legacy blanket cleanse. Also drop the registry entries so _effects doesn't
    // keep stale records for debuffs this just wiped.
    engine.dispelEffects(target, 'negative');
    target.dot_dmg = 0;
    target._poison_dmg = 0;
    target._dot_permanent = 0;
    target._hot = 0;
    target._bleed_dmg = 0;
    target._bleed_permanent = 0;
    target._chill_dmg = 0;
    target._healing_reduction = 0;
    target._dmg_mult = Math.min(target._dmg_mult ?? 1, 1);
    for (const key of Object.keys(target._flags)) {
      if (key.endsWith('_applied')) target._flags[key] = false;
    }
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — stripped all debuffs` });
  }
  if (p.make_burn_permanent === true && target) {
    if ((target.dot_dmg ?? 0) > 0) {
      target._dot_permanent = target.dot_dmg;
      engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — ${target.unit_name}'s Burn is now permanent (${target.dot_dmg}/turn)` });
    } else {
      engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — ${target.unit_name} is not burning` });
    }
  }
  if (p.make_chill_permanent === true && target) {
    if ((target.dot_dmg ?? 0) > 0) {
      target._dot_permanent = target.dot_dmg;
      engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — ${target.unit_name}'s Chill is now permanent (${target.dot_dmg}/turn)` });
    } else {
      engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — ${target.unit_name} is not chilled` });
    }
  }
  if (p.make_bleed_permanent === true && target) {
    if ((target._bleed_dmg ?? 0) > 0) {
      target._bleed_permanent = target._bleed_dmg;
      engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — ${target.unit_name}'s Bleed is now permanent (${target._bleed_dmg}/turn)` });
    } else {
      engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — ${target.unit_name} is not bleeding` });
    }
  }
  if (p.resurrect_hp_pct != null && target) {
    target.alive = true;
    target.battle_hp = Math.floor(target.max_hp * p.resurrect_hp_pct / 100);
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — resurrected at ${target.battle_hp} HP` });
  }
  if (p.ally_drain_pct != null && target) {
    const drained  = Math.floor(target.max_hp * pctFor(p, engine, actor.side, "ally_drain_pct", "ally_drain_pct_per_tag") / 100);
    target.battle_hp = Math.max(1, target.battle_hp - drained);
    const healAmount = Math.floor(drained * (p.ally_drain_heal_mult ?? 1) * engine.fatigueHealMult());
    const healed = Math.min(healAmount, actor.max_hp - actor.battle_hp);
    actor.battle_hp += healed;
    if (p.devour_dmg_bonus_pct != null) {
      actor._dmg_mult = (actor._dmg_mult ?? 1) + p.devour_dmg_bonus_pct / 100;
    }
    engine.pushLog({ type: 'ability', ability: abilityKey, actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetId: target.id, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — drained ${drained} HP from ${target.unit_name}, healed self for ${healed}${p.devour_dmg_bonus_pct != null ? `, +${p.devour_dmg_bonus_pct}% damage` : ''}` });
    if (healed > 0) engine.fireHealTriggers(actor, actor, healed);
  }
  if (p.ally_initiative_bonus != null) {
    const allies = combatants.filter(c => c.side === actor.side && c.alive);
    for (const a of allies) {
      a.initiative += p.ally_initiative_bonus;
    }
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: 'all allies', message: `${def.name} — +${p.ally_initiative_bonus} initiative to all allies` });
    // Recorded so the bonus is handed back if the caster dies, and so anyone
    // with Fanaticism registers that an ally just buffed them.
    engine.recordGrantedBuff(actor, 'initiative', allies.filter(a => a.id !== actor.id), p.ally_initiative_bonus);
  }
  if ((p.bonus_attack != null || p.bonus_attack_per_tag != null) && target) {
    // Route through engine.executeAction so range, invulnerability, unity bonds,
    // and all other targeting/damage rules are fully respected.
    //
    // `bonus_attack_per_tag` scales the strike by how many of that tag are on
    // the field, so the ability rewards committing to the archetype rather than
    // paying the same whatever the party looks like. The commanded unit counts
    // itself — it is one of the Vampires/Demons standing there.
    let pct = p.bonus_attack ?? 0;
    if (p.bonus_attack_per_tag != null) {
      const tagCount = combatants.filter(c =>
        c.side === actor.side && c.alive &&
        (c.unit_data?.tags ?? []).includes(p.tag_required)).length;
      pct = p.bonus_attack_per_tag * tagCount;
    }
    const savedPower = target.unit_data?.action_power;
    const scaledPower = Math.floor((savedPower ?? 12) * pct / 100);
    if (target.unit_data) target.unit_data = { ...target.unit_data, action_power: scaledPower };
    const validTargets = engine.getValidTargets(target, false);
    if (validTargets.length > 0) {
      const randomEnemy = validTargets[Math.floor(Math.random() * validTargets.length)];
      engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — commands ${target.unit_name} to strike` });
      // Out-of-turn strike: don't tick the commanded unit's own turn-start DoTs.
      engine.executeAction(target, randomEnemy, 'attack', { turnStart: false });
    }
    if (target.unit_data) target.unit_data = { ...target.unit_data, action_power: savedPower };
  }

  if (p.heal_flat != null && def.target === 'all_allies') {
    const allies = combatants.filter(c => c.side === actor.side && c.alive);
    for (const a of allies) {
      const factor = 1 - ((a._healing_reduction ?? 0) / 100);
      const healed = Math.min(Math.floor(p.heal_flat * factor * engine.fatigueHealMult()), a.max_hp - a.battle_hp);
      if (healed > 0) {
        a.battle_hp += healed;
        engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: a.unit_name, targetCell: a.cellIndex, message: `${def.name} — healed ${a.unit_name} for ${healed}`, value: healed, heal: true });
        engine.fireTrigger('on_heal',   { actor, target: a, dmg: healed, dying: null });
        engine.fireTrigger('on_healed', { actor, target: a, dmg: healed, dying: null });
      }
    }

    engine.fireAllyBuffTriggers(actor, allies);
  }

  // ── Frost Armor ───────────────────────────────────────────────────────────
  // Armor plus one school of resistance, for a couple of rounds. Both are added
  // to the live stats and given back by advanceRound — the same shape Sanctuary
  // uses, kept separate because this touches ONE resist rather than all six.
  if (p.frost_armor_armor != null && target) {
    const armorAmt  = p.frost_armor_armor;
    const resistAmt = p.frost_armor_resist ?? 0;
    const school    = p.frost_armor_resist_type || 'cold';
    // Stacking a second cast would leak the first one's bonuses (only one
    // amount can be given back), so a re-cast refreshes rather than adds.
    if (target._frost_armor_rounds > 0) engine.expireFrostArmor(target);

    target.armor = (target.armor ?? 0) + armorAmt;
    const res = target.unit_data?.resistances ?? target.resistances;
    if (res && resistAmt) res[school] = (res[school] ?? 0) + resistAmt;

    target._frost_armor_rounds = p.duration_rounds ?? 2;
    target._frost_armor_armor  = armorAmt;
    target._frost_armor_resist = resistAmt;
    target._frost_armor_school = school;

    const resPath = target.unit_data?.resistances ? 'unit_data.resistances' : 'resistances';
    engine.registerEffect(target, {
      key: 'frost_armor', name: def.name, polarity: 'positive', dispellable: def.dispellable === true,
      restore: { armor: -armorAmt, [`${resPath}.${school}`]: -resistAmt },
      clear:   { _frost_armor_rounds: 0, _frost_armor_armor: 0, _frost_armor_resist: 0, _frost_armor_school: null },
    });
    engine.recordGrantedBuff(actor, 'armor', [target], armorAmt);
    engine.pushLog({ type: 'ability', ability: abilityKey, actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex,
      targetId: target.id, targetName: target.unit_name, targetCell: target.cellIndex,
      value: armorAmt, heal: false, stat: 'armor',
      message: `${def.name} — +${armorAmt} armor and +${resistAmt} ${school} resist for ${p.duration_rounds ?? 2} rounds` });
    // The ally-buff trigger is fired by engine.recordGrantedBuff above.
  }

  // ── Volley ────────────────────────────────────────────────────────────────
  // Everyone on the other side, whoever was tapped. One log entry per enemy, so
  // the client plays the arrows against all of them at once.
  if (p.volley_damage != null) {
    const enemies = combatants.filter(c => c.side !== actor.side && c.alive && !c._invulnerable);
    for (const e of enemies) {
      const armor = Math.max(0, e.armor ?? 0);
      const dmg   = Math.max(1, Math.floor(p.volley_damage * (1 - armor / 100)));
      hurt(e, dmg);
      const dead = e.battle_hp <= 0;
      if (dead) { e.alive = false; engine.applyOnDeathPassives(e); }
      engine.pushLog({ type: 'ability', ability: abilityKey, actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex,
        targetId: e.id, targetName: e.unit_name, targetCell: e.cellIndex,
        value: dmg, heal: false, killed: dead,
        message: `${def.name} — struck ${e.unit_name} for ${dmg}` });
    }
    if (!enemies.length) {
      engine.pushLog({ type: 'ability', ability: abilityKey, actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex,
        targetName: 'all enemies', message: `${def.name} — nothing left to shoot at` });
    }
  }

  // ── Stone Form ────────────────────────────────────────────────────────────
  // Self-buff: armor for a couple of rounds, and a chunk of health back at once.
  if (p.stone_form_armor != null) {
    const armorAmt = p.stone_form_armor;
    if (actor._stone_form_rounds > 0) engine.expireStoneForm(actor);

    actor.armor = (actor.armor ?? 0) + armorAmt;
    actor._stone_form_rounds = p.duration_rounds ?? 2;
    actor._stone_form_armor  = armorAmt;
    engine.registerEffect(actor, {
      key: 'stone_form', name: def.name, polarity: 'positive', dispellable: def.dispellable === true,
      restore: { armor: -armorAmt },
      clear:   { _stone_form_rounds: 0, _stone_form_armor: 0 },
    });
    engine.recordGrantedBuff(actor, 'armor', [actor], armorAmt);

    // The mend goes through the normal heal path: fatigue weakens it, a healing
    // reduction on the unit applies, and it cannot overheal.
    const pct    = p.stone_form_heal_pct ?? 0;
    const factor = 1 - ((actor._healing_reduction ?? 0) / 100);
    const healed = Math.min(
      Math.floor(actor.max_hp * pct / 100 * factor * engine.fatigueHealMult()),
      actor.max_hp - actor.battle_hp);
    if (healed > 0) actor.battle_hp += healed;

    engine.pushLog({ type: 'ability', ability: abilityKey, actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex,
      targetId: actor.id, targetName: actor.unit_name, targetCell: actor.cellIndex,
      value: healed, heal: true,
      message: `${def.name} — +${armorAmt} armor for ${p.duration_rounds ?? 2} rounds, mended ${healed}` });
    if (healed > 0) engine.fireHealTriggers(actor, actor, healed);
  }

  // ── Furious Strike ────────────────────────────────────────────────────────
  // A harder version of the unit's own attack, paid for in blood. Routed
  // through engine.strikeTarget rather than reimplemented, so armor, resists,
  // dodge, Protector intercepts, martyrdom and every on-hit passive behave
  // exactly as they do for a normal swing.
  if (p.furious_strike_pct != null && target) {
    const mult = p.furious_strike_pct / 100;
    // The boost is captured as a DELTA and taken back off afterwards, rather
    // than saving and restoring the multiplier: passives that fire during the
    // swing (Rage on a retaliation, a kill bonus) also write to _dmg_mult, and
    // restoring a saved value would wipe what they earned.
    const boost = (actor._dmg_mult ?? 1) * (mult - 1);
    actor._dmg_mult = (actor._dmg_mult ?? 1) + boost;

    const before = target.battle_hp;
    engine.strikeTarget(actor, target);
    const dealt = Math.max(0, before - target.battle_hp);

    actor._dmg_mult = Math.max(0, (actor._dmg_mult ?? 1) - boost);

    const recoil = Math.floor(dealt * (p.furious_strike_recoil_pct ?? 0) / 100);
    if (recoil > 0 && actor.alive) {
      actor.battle_hp = Math.max(0, actor.battle_hp - recoil);
      engine.pushLog({ type: 'ability', ability: abilityKey, actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex,
        targetId: actor.id, targetName: actor.unit_name, targetCell: actor.cellIndex,
        value: recoil, heal: false,
        message: `${def.name} — ${actor.unit_name} takes ${recoil} recoil` });
      // The recoil is DAMAGE TAKEN, so it wakes the same passives a blow would —
      // Rage in particular, which is the point of hurting yourself on purpose.
      // (A unit carrying both Rage and a retaliation passive will also retaliate
      // against itself here; that is what "taking damage" means to those two.)
      engine.fireTrigger('on_hit_received', { actor, target: actor, dmg: recoil, dying: null });
      engine.fireTrigger('on_take_damage',  { actor, target: actor, dmg: recoil, dying: null });
      if (actor.battle_hp <= 0) { actor.alive = false; engine.applyOnDeathPassives(actor); }
    }
  }

  if (p.all_resist_bonus != null && target && def.target === 'ally') {
    const resistTypes = ['air', 'fire', 'life', 'death', 'cold', 'nature'];
    const res = target.unit_data?.resistances ?? target.resistances;
    if (res) {
      for (const type of resistTypes) res[type] = (res[type] ?? 0) + p.all_resist_bonus;
    }
    target._sanctuary_rounds = p.duration_rounds ?? 2;
    target._sanctuary_resist = p.all_resist_bonus;
    // Dispellable positive: give the resistances back on each type it touched.
    const resPath = target.unit_data?.resistances ? 'unit_data.resistances' : 'resistances';
    const sanctuaryRestore = {};
    for (const type of resistTypes) sanctuaryRestore[`${resPath}.${type}`] = -p.all_resist_bonus;
    engine.registerEffect(target, {
      key: 'sanctuary', name: def.name, polarity: 'positive', dispellable: def.dispellable === true,
      restore: sanctuaryRestore,
      clear:   { _sanctuary_rounds: 0, _sanctuary_resist: null },
    });
    engine.recordGrantedBuff(actor, 'all_resist', [target], p.all_resist_bonus);
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — +${p.all_resist_bonus} all resists for ${p.duration_rounds} rounds` });
    // The ally-buff trigger is fired by engine.recordGrantedBuff above.
  }

  if (p.damage_flat != null && p.lowest_ally_heal_pct != null && target && def.target === 'enemy') {
    const armor = Math.max(0, target.armor ?? 0);
    const dmg = Math.max(1, Math.floor(p.damage_flat * (1 - armor / 100)));
    hurt(target, dmg);
    const dead = target.battle_hp <= 0;
    if (dead) { target.alive = false; engine.applyOnDeathPassives(target); }
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — smote ${target.unit_name} for ${dmg}`, value: dmg, heal: false });
    const heal = Math.floor(dmg * p.lowest_ally_heal_pct / 100 * engine.fatigueHealMult());
    const lowest = combatants
      .filter(c => c.side === actor.side && c.alive)
      .reduce((a, b) => a.battle_hp < b.battle_hp ? a : b, actor);
    const actual = Math.min(heal, lowest.max_hp - lowest.battle_hp);
    if (actual > 0) {
      lowest.battle_hp += actual;
      engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: lowest.unit_name, targetCell: lowest.cellIndex, message: `${def.name} — healed ${lowest.unit_name} for ${actual}`, value: actual, heal: true });
      engine.fireHealTriggers(actor, lowest, actual);
    }
  }

  if (p.physical_dmg_reduction_pct != null && target && def.target === 'enemy') {
    target._terror_reduction = Math.min(100, (target._terror_reduction ?? 0) + p.physical_dmg_reduction_pct);
    target._terror_rounds = p.duration_rounds ?? 2;
    // actorId + targetId are what the client resolves the two cells by (a player
    // and an enemy routinely share a cellIndex, so the cell alone cannot find
    // one). Without them Terror logged correctly and drew nothing.
    engine.pushLog({ type: 'ability', ability: abilityKey, actorId: actor.id, actorName: actor.unit_name, actorCell: actor.cellIndex, targetId: target.id, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — -${p.physical_dmg_reduction_pct}% physical dmg for ${p.duration_rounds} rounds` });
  }
  if (p.stun_initiative_reduction_pct != null && target && def.target === 'enemy') {
    const actorRange = actor.unit_data?.range ?? actor.unit_data?.action?.range ?? 1;
    const abilityRange = def.range ?? 1;
    if (actorRange <= abilityRange) {
      const reduction = Math.floor(target.initiative * p.stun_initiative_reduction_pct / 100);
      target.initiative = Math.max(0, target.initiative - reduction);
      target._stun_rounds = p.duration_rounds ?? 2;
      target._stun_initiative_lost = (target._stun_initiative_lost ?? 0) + reduction;
      engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — ${target.unit_name} loses ${reduction} initiative for ${p.duration_rounds} rounds`, value: reduction });
    }
  }
  // Mother's Blessing — a STANDING effect, not a one-shot. Activating it only
  // raises the flag; the sacrifice-and-heal itself runs from the engine's
  // turn-start ticks (see applyTurnStartTicks) so it keeps firing every turn
  // until the battle ends. The param was declared but never read by anything,
  // which is why using the ability appeared to do nothing at all.
  if (p.mothers_blessing === true) {
    if (!actor._mothers_blessing) {
      actor._mothers_blessing = true;
      actor._mothers_blessing_pct = p.mothers_blessing_hp_cost_pct ?? 10;
      engine.pushLog({
        type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex,
        targetName: actor.unit_name, targetCell: actor.cellIndex,
        message: `${def.name} — ${actor.unit_name} offers herself; every ally is mended each turn.`,
      });
    }
  }
  if (p.taunt === true && target && def.target === 'enemy_front') {
    target._taunted_by_id = actor.id;
    target._actives_locked = true;
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — ${target.unit_name} is forced to attack ${actor.unit_name} on their next turn` });
  }
  return true;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runTrigger, calcDamageWithPassives, getAbilityTargets, executeActiveAbility, resolveAbilityDef, resolvePassiveDefs, stackPassiveKeys };
}