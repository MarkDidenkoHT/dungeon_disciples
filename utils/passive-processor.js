function cellRow(i) { return Math.floor(i / 2); }
function cellCol(i) { return i % 2; }

function resolveAbilityDef(unit, UNIT_ABILITIES, type) {
  const key = type === 'active'
    ? (unit.unit_data?.ability || unit.unit_data?.active_ability)
    : (unit.unit_data?.passive || unit.unit_data?.passive_ability);
  if (!key || !UNIT_ABILITIES) return null;
  return UNIT_ABILITIES[key] ?? null;
}

function runTrigger(trigger, ctx) {
  const { engine, UNIT_ABILITIES } = ctx;

  const sideMap = {
    on_hit:          () => engine.combatants.filter(c => c.side === ctx.actor?.side),
    on_kill:         () => engine.combatants.filter(c => c.side === ctx.actor?.side),
    on_hit_received: () => engine.combatants.filter(c => c.side === ctx.target?.side),
    on_death:        () => engine.combatants.filter(c => c.side === (ctx.dying ?? ctx.actor)?.side),
    on_battle_start: () => engine.combatants,
    on_turn_start:   () => [ctx.actor],
    on_heal:         () => engine.combatants.filter(c => c.side === ctx.actor?.side),
  };

  const pool = (sideMap[trigger] ?? (() => []))();

  for (const unit of pool) {
    const def = resolveAbilityDef(unit, UNIT_ABILITIES, 'passive');
    if (!def || def.trigger !== trigger) continue;
    dispatchPassive(trigger, unit, def, ctx);
  }
}

function dispatchPassive(trigger, owner, def, ctx) {
  const { engine, actor, target, dmg, dying } = ctx;
  const p = def.params || {};

  if (trigger === 'on_battle_start') {
    if (p.ally_max_hp_bonus != null) {
      const allies = engine.combatants.filter(c => c.side === owner.side);
      for (const a of allies) { a.battle_hp += p.ally_max_hp_bonus; a.max_hp += p.ally_max_hp_bonus; }
      engine.recordGrantedBuff(owner, 'max_hp', allies, p.ally_max_hp_bonus);
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: 'all allies', value: p.ally_max_hp_bonus });
    }
    if (p.ally_armor_bonus != null) {
      const allies = engine.combatants.filter(c => c.side === owner.side);
      for (const a of allies) { a.armor += p.ally_armor_bonus; }
      engine.recordGrantedBuff(owner, 'armor', allies, p.ally_armor_bonus);
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: 'all allies', value: p.ally_armor_bonus });
    }
  }

  if (trigger === 'on_turn_start' && owner === actor) {
    if (p.regen_pct != null) {
      const heal = Math.floor(owner.max_hp * p.regen_pct / 100);
      owner.battle_hp = Math.min(owner.max_hp, owner.battle_hp + heal);
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, value: heal });
    }
  }

  if (trigger === 'on_hit' && owner === actor && target && dmg > 0) {
    if (p.lowest_ally_heal_pct != null) {
      const heal = Math.floor(dmg * p.lowest_ally_heal_pct / 100);
      const lowest = engine.combatants
        .filter(c => c.side === owner.side && c.alive)
        .reduce((a, b) => a.battle_hp < b.battle_hp ? a : b, owner);
      const actual = Math.min(heal, lowest.max_hp - lowest.battle_hp);
      lowest.battle_hp += actual;
      if (actual > 0) engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: lowest.unit_name, targetCell: lowest.cellIndex, value: actual });
    }

    if (p.self_heal_pct != null) {
      const heal = Math.floor(dmg * p.self_heal_pct / 100);
      const actual = Math.min(heal, owner.max_hp - owner.battle_hp);
      owner.battle_hp += actual;
      if (actual > 0) engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, value: actual });
    }

    if (p.burn_dot_pct != null) {
      target.burn = Math.floor(dmg * p.burn_dot_pct / 100);
      engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: target.burn });
    }

    if (p.poison_dot_pct != null) {
      target.poison = Math.floor(dmg * p.poison_dot_pct / 100);
      engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: target.poison });
    }

    if (p.armor_shred != null) {
      target.armor = Math.max(0, target.armor - p.armor_shred);
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: p.armor_shred, heal: false });
    }

    if (p.initiative_shred != null) {
      target.initiative = Math.max(0, target.initiative - p.initiative_shred);
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: p.initiative_shred, heal: false });
    }

    if (p.stacks_needed != null && p.stack_burst_damage != null) {
      const key = p.stack_key || 'generic_stack';
      target._stacks[key] = (target._stacks[key] ?? 0) + 1;
      if (target._stacks[key] >= p.stacks_needed) {
        target._stacks[key] = 0;
        const burst = Math.max(1, p.stack_burst_damage - target.armor);
        target.battle_hp = Math.max(0, target.battle_hp - burst);
        if (target.battle_hp <= 0) { target.alive = false; engine.applyOnDeathPassives(target); }
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: burst, heal: false });
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
        behind.battle_hp = Math.max(0, behind.battle_hp - splash);
        if (behind.battle_hp <= 0) { behind.alive = false; engine.applyOnDeathPassives(behind); }
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: behind.unit_name, targetCell: behind.cellIndex, value: splash, heal: false });
      }
    }

    if (p.resistance_shred_pct != null && !target._flags[def.id + '_applied']) {
      target._flags[def.id + '_applied'] = true;
      target._healing_reduction = (target._healing_reduction ?? 0) + p.resistance_shred_pct;
      engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: p.resistance_shred_pct });
    }

    if (p.healing_reduction_pct != null && !target._flags[def.id + '_applied']) {
      target._flags[def.id + '_applied'] = true;
      target._healing_reduction = Math.min(100, (target._healing_reduction ?? 0) + p.healing_reduction_pct);
      engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: p.healing_reduction_pct });
    }
  }

  if (trigger === 'on_hit_received' && owner === target && dmg > 0) {
    if (p.reflect_pct != null) {
      const reflect = Math.floor(dmg * p.reflect_pct / 100);
      actor.battle_hp = Math.max(0, actor.battle_hp - reflect);
      if (actor.battle_hp <= 0) { actor.alive = false; engine.applyOnDeathPassives(actor); }
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, value: reflect, heal: false });
    }

    if (p.adjacent_aoe_damage != null) {
      const adjacent = engine.combatants.filter(c =>
        c.side === actor.side && c.alive && c.id !== actor.id &&
        Math.abs(cellRow(c.cellIndex) - cellRow(owner.cellIndex)) <= (p.range ?? 1)
      );
      for (const adj of adjacent) {
        adj.battle_hp = Math.max(0, adj.battle_hp - p.adjacent_aoe_damage);
        if (adj.battle_hp <= 0) { adj.alive = false; engine.applyOnDeathPassives(adj); }
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: adj.unit_name, targetCell: adj.cellIndex, value: p.adjacent_aoe_damage, heal: false });
      }
    }

    if (p.retaliation_damage != null) {
      actor.battle_hp = Math.max(0, actor.battle_hp - p.retaliation_damage);
      if (actor.battle_hp <= 0) { actor.alive = false; engine.applyOnDeathPassives(actor); }
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: actor.unit_name, targetCell: actor.cellIndex, value: p.retaliation_damage, heal: false });
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

    if (p.death_aoe_damage != null) {
      for (const e of engine.combatants.filter(c => c.side !== owner.side && c.alive)) {
        e.battle_hp = Math.max(0, e.battle_hp - p.death_aoe_damage);
        if (e.battle_hp <= 0) e.alive = false;
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: e.unit_name, targetCell: e.cellIndex, value: p.death_aoe_damage, heal: false });
      }
    }
  }

  if (trigger === 'on_heal' && owner === actor) {
    if (p.hot_pct != null && target) {
      target._hot = (target._hot ?? 0) + Math.floor(dmg * p.hot_pct / 100);
      engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: target._hot });
    }
  }
}

function calcDamageWithPassives(actor, target, UNIT_ABILITIES) {
  const data = actor.unit_data || actor;
  let power = data.action_power ?? data.action?.value ?? 12;

  const def = resolveAbilityDef(actor, UNIT_ABILITIES, 'passive');
  const p = def?.params || {};

  if (p.execute_bonus_pct != null && p.execute_threshold_pct != null) {
    if (target.battle_hp / target.max_hp < p.execute_threshold_pct / 100) {
      power = Math.floor(power * (1 + p.execute_bonus_pct / 100));
    }
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
  } else {
    const resistance = resistances[damageSource] ?? 0;
    dmg = Math.floor(rawDmg * (1 - resistance / 100));
  }

  return Math.max(1, dmg);
}

function getAbilityTargets(actor, combatants, UNIT_ABILITIES) {
  const abilityKey = actor.unit_data?.ability || actor.unit_data?.active_ability;
  if (!abilityKey || !UNIT_ABILITIES) return combatants.filter(c => c.side !== actor.side && c.alive);

  const def = UNIT_ABILITIES[abilityKey];
  if (!def) return combatants.filter(c => c.side !== actor.side && c.alive);

  const p = def.params || {};

  if (def.target === 'enemy')    return combatants.filter(c => c.side !== actor.side && c.alive);
  if (def.target === 'self')     return [actor];
  if (def.target === 'ally')     return combatants.filter(c => c.side === actor.side && c.alive && c.id !== actor.id);
  if (def.target === 'ally_any') return combatants.filter(c => c.side === actor.side && c.alive);
  if (def.target === 'ally_dead') {
    return combatants.filter(c =>
      c.side === actor.side && !c.alive &&
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

  if (p.cleanse_debuffs && target) {
    target.burn = 0;
    target.poison = 0;
    target._hot = 0;
    target._healing_reduction = 0;
    target._dmg_mult = Math.min(target._dmg_mult ?? 1, 1);
    for (const key of Object.keys(target._flags)) {
      if (key.endsWith('_applied')) target._flags[key] = false;
    }
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — stripped all debuffs` });
  }

  if (p.resurrect_hp_pct != null && target) {
    target.alive = true;
    target.battle_hp = Math.floor(target.max_hp * p.resurrect_hp_pct / 100);
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — resurrected at ${target.battle_hp} HP` });
  }

  if (p.ally_drain_pct != null) {
    const allies = combatants.filter(c => c.side === actor.side && c.alive && c.id !== actor.id);
    let drained = 0;
    for (const a of allies) {
      const d = Math.floor(a.max_hp * p.ally_drain_pct / 100);
      a.battle_hp = Math.max(1, a.battle_hp - d);
      drained += d;
    }
    const ratio = p.drain_to_damage_ratio ?? 0.5;
    actor._dmg_mult = (actor._dmg_mult ?? 1) + (Math.floor(drained * ratio) / 100);
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: 'allies', message: `${def.name} — drained ${drained} HP, gained ${Math.floor(drained * ratio)}% damage` });
  }

  if (p.ally_initiative_bonus != null) {
    for (const a of combatants.filter(c => c.side === actor.side && c.alive)) {
      a.initiative += p.ally_initiative_bonus;
    }
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: 'all allies', message: `${def.name} — +${p.ally_initiative_bonus} initiative to all allies` });
  }

  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runTrigger, calcDamageWithPassives, getAbilityTargets, executeActiveAbility, resolveAbilityDef };
}

export { runTrigger, calcDamageWithPassives, getAbilityTargets, executeActiveAbility, resolveAbilityDef };