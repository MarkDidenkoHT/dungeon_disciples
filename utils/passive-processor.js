function cellRow(i) { return Math.floor(i / 2); }
function cellCol(i) { return i % 2; }
function resolveAbilityDef(unit, UNIT_ABILITIES, type) {
  const key = type === 'active'
    ? (unit.unit_data?.ability || unit.unit_data?.active_ability)
    : (unit.unit_data?.passive || unit.unit_data?.passive_ability);
  if (!key || !UNIT_ABILITIES) return null;
  return UNIT_ABILITIES[key] ?? null;
}
function resolvePassiveDefs(unit, UNIT_ABILITIES) {
  if (unit._passives_locked) return [];
  if (!UNIT_ABILITIES) return [];
  const raw = unit.unit_data?.passive || unit.unit_data?.passive_ability;
  if (!raw) return [];
  const keys = Array.isArray(raw) ? raw : [raw];
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
  for (const unit of pool) {
    const defs = resolvePassiveDefs(unit, UNIT_ABILITIES);
    for (const def of defs) {
      if (def.trigger !== trigger) continue;
      dispatchPassive(trigger, unit, def, ctx);
    }
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
    if (p.adjacent_physical_dmg_reduction_pct != null) {

      const enemies = engine.combatants.filter(c => c.side !== owner.side);
      const fearRange = p.range ?? 1;
      for (const e of enemies) {
        if (Math.abs(Math.floor(e.cellIndex / 2) - Math.floor(owner.cellIndex / 2)) <= fearRange) {
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
    if (p.sorrow_initiative_drain === true) {      const specter_count = engine.combatants.filter(c => c.side === owner.side && c.alive && (c.unit_data?.tags ?? []).includes('Specter')).length;
      if (specter_count > 0) {
        const drain = 2 * specter_count;
        const enemies = engine.combatants.filter(c => c.side !== owner.side);
        for (const e of enemies) {
          e.initiative = Math.max(0, e.initiative - drain);
          e._sorrow_source_ids = e._sorrow_source_ids ?? [];
          e._sorrow_source_ids.push(owner.id);
        }
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: 'all enemies', value: drain });
      }
    }
    if (p.inspiration_stat != null && p.inspiration_value != null) {
      const targets = engine.getInspirationTargets(owner);
      for (const t of targets) {
        if (p.inspiration_stat === 'armor') {
          t.armor += p.inspiration_value;
        } else if (p.inspiration_stat === 'initiative') {
          t.initiative += p.inspiration_value;
        } else if (p.inspiration_stat === 'max_hp') {
          t.max_hp    += p.inspiration_value;
          t.battle_hp += p.inspiration_value;
        } else if (p.inspiration_stat === 'damage') {
          t._dmg_mult = (t._dmg_mult ?? 1) * (1 + p.inspiration_value / 100);
        }
      }
      if (targets.length) {
        engine.recordGrantedBuff(owner, p.inspiration_stat, targets, p.inspiration_stat === 'damage' ? p.inspiration_value / 100 : p.inspiration_value);
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: targets.map(t => t.unit_name).join(', '), value: p.inspiration_value, message: `${def.name} — +${p.inspiration_value}${p.inspiration_stat === 'damage' ? '%' : ''} ${p.inspiration_stat} to adjacent allies in column` });
      }
    }
    if (p.unity_bond === true && !owner._flags[def.id + '_bonded']) {
      owner._flags[def.id + '_bonded'] = true;
      const ownerRow = cellRow(owner.cellIndex);
      const ownerCol = cellCol(owner.cellIndex);
      const hostCol = ownerCol === 1 ? 0 : 1;
      const host = engine.combatants.find(c =>
        c.side === owner.side && c.alive && c.id !== owner.id &&
        cellRow(c.cellIndex) === ownerRow && cellCol(c.cellIndex) === hostCol &&
        (c.unit_data?.tags ?? []).includes('Holy')
      );
      if (host) {
        owner._unity_host_id = host.id;
        host._unity_bonded_id = owner.id;
        owner._invulnerable = true;
        owner._untargetable = true;
        const stats = ['battle_hp', 'max_hp', 'armor', 'initiative'];
        for (const stat of stats) {
          const bonus = Math.floor((owner.unit_data?.[stat] ?? owner[stat] ?? 0) * 0.5);
          if (stat === 'battle_hp') { host.battle_hp += bonus; host.max_hp += bonus; engine.recordGrantedBuff(owner, 'max_hp', [host], bonus); }
          else if (stat === 'max_hp') { }
          else if (stat === 'armor') { host.armor += bonus; engine.recordGrantedBuff(owner, 'armor', [host], bonus); }
          else if (stat === 'initiative') { host.initiative += bonus; engine.recordGrantedBuff(owner, 'initiative', [host], bonus); }
        }
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: host.unit_name, targetCell: host.cellIndex, message: `${owner.unit_name} bonds to ${host.unit_name} — 50% stats transferred, Unity guardian is invulnerable.` });
      }
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
    if (owner._deferred_dmg > 0) {
      const deferred = owner._deferred_dmg;
      owner._deferred_dmg = 0;
      owner.battle_hp = Math.max(0, owner.battle_hp - deferred);
      engine.pushLog({ type: 'passive', passive: 'Recuperate (deferred)', actorName: '⏳', targetName: owner.unit_name, targetCell: owner.cellIndex, value: deferred, heal: false });
      if (owner.battle_hp <= 0) { owner.alive = false; engine.applyOnDeathPassives(owner); }
    }
    if (owner._bleed_dmg > 0) {
      const bleed = owner._bleed_dmg;
      owner._bleed_dmg = 0;
      owner.battle_hp = Math.max(0, owner.battle_hp - bleed);
      engine.pushLog({ type: 'passive', passive: 'Bleed', actorName: '🦸', targetName: owner.unit_name, targetCell: owner.cellIndex, value: bleed, heal: false });
      if (owner.battle_hp <= 0) { owner.alive = false; engine.applyOnDeathPassives(owner); }
    }
    if (owner._chill_dmg > 0) {
      const chill = owner._chill_dmg;
      owner._chill_dmg = 0;
      owner.battle_hp = Math.max(0, owner.battle_hp - chill);
      engine.pushLog({ type: 'passive', passive: 'Chill', actorName: '❄️', targetName: owner.unit_name, targetCell: owner.cellIndex, value: chill, heal: false });
      if (owner.battle_hp <= 0) { owner.alive = false; engine.applyOnDeathPassives(owner); }
    }
    if (p.light_of_dawn === true) {
      const ownerRow = cellRow(owner.cellIndex);
      const ownerCol = cellCol(owner.cellIndex);
      const frontAllyCol = ownerCol === 1 ? 0 : 1;
      const frontAlly = engine.combatants.find(c =>
        c.side === owner.side && c.alive && c.id !== owner.id &&
        cellRow(c.cellIndex) === ownerRow && cellCol(c.cellIndex) === frontAllyCol
      );
      if (frontAlly) {
        const healAmt = Math.min(p.light_of_dawn_heal ?? 15, frontAlly.max_hp - frontAlly.battle_hp);
        if (healAmt > 0) {
          frontAlly.battle_hp += healAmt;
          engine.fireHealTriggers(owner, frontAlly, healAmt);
          engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: frontAlly.unit_name, targetCell: frontAlly.cellIndex, value: healAmt, heal: true });
        }
      }
      const frontEnemyCol = ownerCol === 0 ? 0 : 1;
      const frontEnemy = engine.combatants.find(c =>
        c.side !== owner.side && c.alive &&
        cellRow(c.cellIndex) === ownerRow && cellCol(c.cellIndex) === frontEnemyCol
      );
      if (frontEnemy) {
        const dmgAmt = p.light_of_dawn_dmg ?? 15;
        frontEnemy.battle_hp = Math.max(0, frontEnemy.battle_hp - dmgAmt);
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: frontEnemy.unit_name, targetCell: frontEnemy.cellIndex, value: dmgAmt, heal: false });
        if (frontEnemy.battle_hp <= 0) { frontEnemy.alive = false; engine.applyOnDeathPassives(frontEnemy); }
      }
    }
  }
  if (trigger === 'on_hit' && owner === actor && target && dmg > 0) {
    if (p.lowest_ally_heal_pct != null) {
      const heal = Math.floor(dmg * p.lowest_ally_heal_pct / 100);
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
        const extra = Math.max(1, Math.floor(dmg * p.lowest_enemy_dmg_pct / 100));
        lowest.battle_hp = Math.max(0, lowest.battle_hp - extra);
        if (lowest.battle_hp <= 0) { lowest.alive = false; engine.applyOnDeathPassives(lowest); }
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: lowest.unit_name, targetCell: lowest.cellIndex, value: extra, heal: false });
      }
    }
    if (p.self_heal_pct != null) {
      const heal = Math.floor(dmg * p.self_heal_pct / 100);
      const actual = Math.min(heal, owner.max_hp - owner.battle_hp);
      owner.battle_hp += actual;
      if (actual > 0) {
        engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, value: actual });
        engine.fireHealTriggers(owner, owner, actual);
      }
    }
    if (p.dot_dmg_pct != null) {
      target.dot_dmg = Math.floor(dmg * p.dot_dmg_pct / 100);
      engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: target.dot_dmg });
    }
    if (p.bleed_dmg_pct != null) {
      target._bleed_dmg = Math.floor(dmg * p.bleed_dmg_pct / 100);
      engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: target._bleed_dmg });
    }
    if (p.chill_dmg_pct != null) {
      target._chill_dmg = Math.floor(dmg * p.chill_dmg_pct / 100);
      engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: target._chill_dmg });
    }
    if (p.armor_shred != null) {
      const reduction = target._debuff_reduction ?? 0;
      const effective = Math.max(1, Math.floor(p.armor_shred * (1 - reduction / 100)));
      target.armor = Math.max(0, target.armor - effective);
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: effective, heal: false });
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
    if (p.healing_reduction_pct != null && !target._flags[def.id + '_applied']) {
      target._flags[def.id + '_applied'] = true;
      target._healing_reduction = Math.min(100, (target._healing_reduction ?? 0) + p.healing_reduction_pct);
      engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: p.healing_reduction_pct });
    }
    if (p.chain_targets != null && !ctx._is_chain_hit) {
      const enemies = engine.combatants.filter(c => c.side !== owner.side && c.alive && c.id !== target.id);
      const count = Math.min(p.chain_targets, enemies.length);
      const shuffled = enemies.sort(() => Math.random() - 0.5);
      for (let i = 0; i < count; i++) {
        const chainTarget = shuffled[i];
        const chainDmg = Math.max(1, Math.floor(dmg * (1 - p.chain_damage_reduction_pct / 100)));
        chainTarget.battle_hp = Math.max(0, chainTarget.battle_hp - chainDmg);
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
            resistances[damageSource] = Math.max(0, current - effective);
            engine.pushLog({ type: 'status', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, value: effective });
          }
        }
      }
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
    if (p.debuff_reduction_pct != null && owner._debuff_reduction == null) {
      owner._debuff_reduction = p.debuff_reduction_pct;
    }
    if (p.rage_atk_bonus != null) {
      owner._dmg_mult = (owner._dmg_mult ?? 1) + p.rage_atk_bonus / 100;
      owner.initiative = (owner.initiative ?? 0) + (p.rage_init_bonus ?? 0);
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
        const ownerRow = cellRow(owner.cellIndex);
        const adjEnemies = engine.combatants.filter(c =>
          c.side !== owner.side && c.alive &&
          Math.abs(cellRow(c.cellIndex) - ownerRow) <= 1
        );
        for (const e of adjEnemies) {
          e.battle_hp = Math.max(0, e.battle_hp - radDmg);
          engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: e.unit_name, targetCell: e.cellIndex, value: radDmg, heal: false });
          if (e.battle_hp <= 0) { e.alive = false; engine.applyOnDeathPassives(e); }
        }
      }
    }
  }
  if (trigger === 'on_take_damage' && owner === target && dmg > 0) {
    if (p.resist_gain != null && p.match_damage_type) {

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
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, value: p.resist_gain });
    }
  }
  if (trigger === 'on_receive_ally_buff' && owner === target) {
    if (p.dmg_bonus_pct != null) {
      owner._dmg_mult = (owner._dmg_mult ?? 1) + p.dmg_bonus_pct / 100;
      engine.pushLog({ type: 'passive', passive: def.name, actorName: owner.unit_name, actorCell: owner.cellIndex, targetName: owner.unit_name, targetCell: owner.cellIndex, value: p.dmg_bonus_pct });
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
          const healed = Math.min(actualSacrifice, lowest.max_hp - lowest.battle_hp);
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
function calcDamageWithPassives(actor, target, UNIT_ABILITIES) {
  const data = actor.unit_data || actor;
  let power = data.action_power ?? data.action?.value ?? 12;
  const defs = resolvePassiveDefs(actor, UNIT_ABILITIES);
  const p = Object.assign({}, ...defs.map(d => d.params || {}));
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

    if (actor._fear_dmg_reduction) {
      dmg = Math.floor(dmg * (1 - actor._fear_dmg_reduction / 100));
    }

    if (actor._terror_reduction && (actor._terror_rounds ?? 0) > 0) {
      dmg = Math.floor(dmg * (1 - actor._terror_reduction / 100));
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
  if (def.target === 'enemy_front') {
    const actorRow = cellRow(actor.cellIndex);
    return combatants.filter(c =>
      c.side !== actor.side && c.alive &&
      cellRow(c.cellIndex) === actorRow &&
      cellCol(c.cellIndex) === (c.side === 'enemy' ? 0 : 1)
    );
  }
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
      target.battle_hp = Math.max(0, target.battle_hp - dmg);
      const dead = target.battle_hp <= 0;
      if (dead) { target.alive = false; engine.applyOnDeathPassives(target); }
      engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — ${actor.unit_name} sacrifices ${cost} HP to strike ${target.unit_name} for ${dmg}`, value: dmg, heal: false });
    }
  }
  if (p.mothers_kiss === true && !actor._mothers_kiss) {
    actor._mothers_kiss = true;
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: 'self', message: `${def.name} — ${actor.unit_name} begins channeling Mother's Kiss each turn.` });
  }
  if (p.cleanse_debuffs && target) {
    target.dot_dmg = 0;
    target._hot = 0;
    target._bleed_dmg = 0;
    target._chill_dmg = 0;
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
  if (p.ally_drain_pct != null && target) {
    const drained  = Math.floor(target.max_hp * p.ally_drain_pct / 100);
    target.battle_hp = Math.max(1, target.battle_hp - drained);
    const healAmount = drained * (p.ally_drain_heal_mult ?? 1);
    const healed = Math.min(healAmount, actor.max_hp - actor.battle_hp);
    actor.battle_hp += healed;
    if (p.devour_dmg_bonus_pct != null) {
      actor._dmg_mult = (actor._dmg_mult ?? 1) + p.devour_dmg_bonus_pct / 100;
    }
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — drained ${drained} HP from ${target.unit_name}, healed self for ${healed}${p.devour_dmg_bonus_pct != null ? `, +${p.devour_dmg_bonus_pct}% damage` : ''}` });
    if (healed > 0) engine.fireHealTriggers(actor, actor, healed);
  }
  if (p.ally_initiative_bonus != null) {
    for (const a of combatants.filter(c => c.side === actor.side && c.alive)) {
      a.initiative += p.ally_initiative_bonus;
    }
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: 'all allies', message: `${def.name} — +${p.ally_initiative_bonus} initiative to all allies` });
  }
  if (p.bonus_attack != null && target) {
    const enemies = combatants.filter(c => c.side !== actor.side && c.alive);
    if (enemies.length > 0) {
      const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
      const basePower = target.unit_data?.action_power ?? target.unit_data?.action?.value ?? 12;
      const attackPower = Math.floor(basePower * p.bonus_attack / 100);
      const armor = Math.max(0, randomEnemy.armor ?? 0);
      const dmg = Math.max(1, Math.floor(attackPower * (1 - armor / 100)));
      randomEnemy.battle_hp = Math.max(0, randomEnemy.battle_hp - dmg);
      if (randomEnemy.battle_hp <= 0) { randomEnemy.alive = false; engine.applyOnDeathPassives(randomEnemy); }
      engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: randomEnemy.unit_name, targetCell: randomEnemy.cellIndex, message: `${def.name} — ${target.unit_name} strikes ${randomEnemy.unit_name} for ${dmg}`, value: dmg });
    }
  }

  if (p.heal_flat != null && def.target === 'all_allies') {
    const allies = combatants.filter(c => c.side === actor.side && c.alive);
    for (const a of allies) {
      const factor = 1 - ((a._healing_reduction ?? 0) / 100);
      const healed = Math.min(Math.floor(p.heal_flat * factor), a.max_hp - a.battle_hp);
      if (healed > 0) {
        a.battle_hp += healed;
        engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: a.unit_name, targetCell: a.cellIndex, message: `${def.name} — healed ${a.unit_name} for ${healed}`, value: healed, heal: true });
        engine.fireTrigger('on_heal',   { actor, target: a, dmg: healed, dying: null });
        engine.fireTrigger('on_healed', { actor, target: a, dmg: healed, dying: null });
      }
    }

    for (const a of allies) {
      engine.fireTrigger('on_receive_ally_buff', { actor, target: a, dmg: 0, dying: null });
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
    engine.recordGrantedBuff(actor, 'all_resist', [target], p.all_resist_bonus);
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — +${p.all_resist_bonus} all resists for ${p.duration_rounds} rounds` });
    engine.fireTrigger('on_receive_ally_buff', { actor, target, dmg: 0, dying: null });
  }

  if (p.damage_flat != null && p.lowest_ally_heal_pct != null && target && def.target === 'enemy') {
    const armor = Math.max(0, target.armor ?? 0);
    const dmg = Math.max(1, Math.floor(p.damage_flat * (1 - armor / 100)));
    target.battle_hp = Math.max(0, target.battle_hp - dmg);
    const dead = target.battle_hp <= 0;
    if (dead) { target.alive = false; engine.applyOnDeathPassives(target); }
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — smote ${target.unit_name} for ${dmg}`, value: dmg, heal: false });
    const heal = Math.floor(dmg * p.lowest_ally_heal_pct / 100);
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
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — -${p.physical_dmg_reduction_pct}% physical dmg for ${p.duration_rounds} rounds` });
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
  if (p.taunt === true && target && def.target === 'enemy_front') {
    target._taunted_by_id = actor.id;
    target._actives_locked = true;
    engine.pushLog({ type: 'ability', actorName: actor.unit_name, actorCell: actor.cellIndex, targetName: target.unit_name, targetCell: target.cellIndex, message: `${def.name} — ${target.unit_name} is forced to attack ${actor.unit_name} on their next turn` });
  }
  return true;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runTrigger, calcDamageWithPassives, getAbilityTargets, executeActiveAbility, resolveAbilityDef, resolvePassiveDefs };
}