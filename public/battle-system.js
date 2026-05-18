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
    playerUnits.forEach(u => {
      const cellIdx = placement[u.id] ?? this.combatants.length;
      this.combatants.push(this.createCombatant(u, 'player', cellIdx));
    });

    enemyUnits.forEach((e, i) => {
      const col = i % COLS;
      const row = Math.min(Math.floor(i / COLS), ROWS - 1);
      this.combatants.push(this.createCombatant(e, 'enemy', cellIndex(row, col)));
    });

    this.applyBattleStartPassives();
  }

  createCombatant(unit, side, cellIdx) {
    const rawData = unit.unit_data || unit;
    const data    = { ...rawData };

    if (data.action && typeof data.action === 'object') {
      data.action_power = data.action.value;
      data.range        = data.action.range;
      data.target_type  = data.action.target_type;
    }

    return {
      id:         unit.id || `enemy_${Math.random().toString(36).slice(2)}`,
      _rosterId:  side === 'player' ? (unit._rosterId || unit.id || null) : null,
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
      shield:   0,
      burn:     0,
      poison:   0,
      _stacks:  {},
      _flags:   {},
      _dmg_mult:          1,
      _healing_reduction: 0,
    };
  }

  // ─── on_battle_start ─────────────────────────────────────────────────────

  applyBattleStartPassives() {
    for (const c of this.combatants) {
      const passive = c.unit_data?.passive || c.unit_data?.passive_ability;
      if (!passive) continue;

      if (passive.startsWith('vitality')) {
        const map   = { 'vitality 1': 5, 'vitality 2': 15, 'vitality 3': 25 };
        const bonus = map[passive] ?? 0;
        if (!bonus) continue;
        for (const a of this.combatants.filter(x => x.side === c.side)) { a.battle_hp += bonus; a.max_hp += bonus; }
        this.pushLog({ type: 'passive', passive: 'Vitality', actorName: c.unit_name, targetName: 'all allies', value: bonus });
      }

      if (passive.startsWith('hardened')) {
        const map   = { 'hardened 1': 3, 'hardened 2': 6 };
        const bonus = map[passive] ?? 0;
        if (!bonus) continue;
        c.armor += bonus;
        this.pushLog({ type: 'passive', passive: 'Hardened', actorName: c.unit_name, targetName: c.unit_name, value: bonus });
      }

      if (passive.startsWith('bone_shield')) {
        const map   = { 'bone_shield 1': 30, 'bone_shield 2': 60 };
        const bonus = map[passive] ?? 0;
        if (!bonus) continue;
        c.shield = bonus;
        this.pushLog({ type: 'passive', passive: 'Bone Shield', actorName: c.unit_name, targetName: c.unit_name, value: bonus });
      }

      if (passive.startsWith('rooted')) {
        const map    = { 'rooted 1': 5, 'rooted 2': 12 };
        const debuff = map[passive] ?? 0;
        if (!debuff) continue;
        for (const e of this.combatants.filter(x => x.side !== c.side)) {
          e.initiative = Math.max(0, e.initiative - debuff);
        }
        this.pushLog({ type: 'passive', passive: 'Rooted', actorName: c.unit_name, targetName: 'all enemies', value: debuff });
      }
    }
  }

  // ─── on_turn_start ───────────────────────────────────────────────────────

  applyTurnStartPassives(actor) {
    const passive = actor.unit_data?.passive || actor.unit_data?.passive_ability;
    if (!passive) return;

    if (passive.startsWith('regenerate')) {
      const map  = { 'regenerate 1': 10, 'regenerate 2': 18 };
      const pct  = map[passive] ?? 0;
      const heal = Math.floor(actor.max_hp * pct / 100);
      actor.battle_hp = Math.min(actor.max_hp, actor.battle_hp + heal);
      this.pushLog({ type: 'passive', passive: 'Regenerate', actorName: actor.unit_name, targetName: actor.unit_name, value: heal });
    }

    if (passive.startsWith('frost_aura')) {
      const map    = { 'frost_aura 1': 5, 'frost_aura 2': 10 };
      const debuff = map[passive] ?? 0;
      if (!actor._flags.frost_aura_applied) {
        for (const e of this.combatants.filter(x => x.side !== actor.side && x.alive)) {
          e.initiative = Math.max(0, e.initiative - debuff);
        }
        actor._flags.frost_aura_applied = true;
        this.pushLog({ type: 'passive', passive: 'Frost Aura', actorName: actor.unit_name, targetName: 'all enemies', value: debuff });
      }
    }

    if (passive.startsWith('hex_aura')) {
      if (!actor._flags.hex_aura_applied) {
        for (const e of this.combatants.filter(x => x.side !== actor.side && x.alive)) {
          e._dmg_mult = Math.max(0.1, (e._dmg_mult ?? 1) - 0.10);
        }
        actor._flags.hex_aura_applied = true;
        this.pushLog({ type: 'passive', passive: 'Hex Aura', actorName: actor.unit_name, targetName: 'all enemies', value: 10 });
      }
    }
  }

  // ─── on_hit (attacker) ───────────────────────────────────────────────────

  applyOnHitPassives(actor, target, dmg) {
    const passive = actor.unit_data?.passive || actor.unit_data?.passive_ability;
    if (!passive || dmg <= 0) return;

    if (passive.startsWith('mithrails_light')) {
      const heal   = Math.floor(dmg * 0.25);
      const lowest = this.combatants
        .filter(c => c.side === actor.side && c.alive)
        .reduce((a, b) => a.battle_hp < b.battle_hp ? a : b, actor);
      const actual = Math.min(heal, lowest.max_hp - lowest.battle_hp);
      lowest.battle_hp += actual;
      if (actual > 0) this.pushLog({ type: 'passive', passive: "Mithrail's Light", actorName: actor.unit_name, targetName: lowest.unit_name, value: actual });
    }

    if (passive.startsWith('lifesteal')) {
      const map    = { 'lifesteal 1': 25, 'lifesteal 2': 40 };
      const heal   = Math.floor(dmg * (map[passive] ?? 0) / 100);
      const actual = Math.min(heal, actor.max_hp - actor.battle_hp);
      actor.battle_hp += actual;
      if (actual > 0) this.pushLog({ type: 'passive', passive: 'Lifesteal', actorName: actor.unit_name, targetName: actor.unit_name, value: actual });
    }

    if (passive.startsWith('burn')) {
      const map    = { 'burn 1': 25, 'burn 2': 40 };
      target.burn  = Math.floor(dmg * (map[passive] ?? 0) / 100);
      this.pushLog({ type: 'status', passive: 'Burn', actorName: actor.unit_name, targetName: target.unit_name, value: target.burn });
    }

    if (passive.startsWith('poison')) {
      const map      = { 'poison 1': 25, 'poison 2': 40 };
      target.poison  = Math.floor(dmg * (map[passive] ?? 0) / 100);
      this.pushLog({ type: 'status', passive: 'Poison', actorName: actor.unit_name, targetName: target.unit_name, value: target.poison });
    }

    if (passive.startsWith('shatter')) {
      const map  = { 'shatter 1': 3, 'shatter 2': 6 };
      const val  = map[passive] ?? 0;
      target.armor = Math.max(0, target.armor - val);
      this.pushLog({ type: 'passive', passive: 'Shatter', actorName: actor.unit_name, targetName: target.unit_name, value: val });
    }

    if (passive.startsWith('frostbite')) {
      const map = { 'frostbite 1': 8, 'frostbite 2': 15 };
      const val = map[passive] ?? 0;
      target.initiative = Math.max(0, target.initiative - val);
      this.pushLog({ type: 'passive', passive: 'Frostbite', actorName: actor.unit_name, targetName: target.unit_name, value: val });
    }

    if (passive.startsWith('death_mark')) {
      const map = { 'death_mark 1': { stacks: 3, dmg: 25 }, 'death_mark 2': { stacks: 3, dmg: 45 } };
      const cfg = map[passive];
      if (cfg) {
        target._stacks.death_mark = (target._stacks.death_mark ?? 0) + 1;
        if (target._stacks.death_mark >= cfg.stacks) {
          target._stacks.death_mark = 0;
          const burst = Math.max(1, cfg.dmg - target.armor);
          target.battle_hp = Math.max(0, target.battle_hp - burst);
          if (target.battle_hp <= 0) { target.alive = false; this.applyOnDeathPassives(target); }
          this.pushLog({ type: 'passive', passive: 'Death Mark', actorName: actor.unit_name, targetName: target.unit_name, value: burst });
        }
      }
    }

    if (passive.startsWith('overpower')) {
      if (actor._stacks.overpower_target !== target.id) {
        actor._stacks.overpower        = 1;
        actor._stacks.overpower_target = target.id;
      } else if ((actor._stacks.overpower ?? 0) < 3) {
        actor._stacks.overpower++;
      }
      actor._dmg_mult = 1 + (actor._stacks.overpower * 0.10);
    }

    if (passive.startsWith('smite')) {
      const tags = target.unit_data?.tags ?? [];
      if (tags.includes('Undead') || tags.includes('Demon')) {
        const bonus = Math.max(1, 15 - target.armor);
        target.battle_hp = Math.max(0, target.battle_hp - bonus);
        if (target.battle_hp <= 0) { target.alive = false; this.applyOnDeathPassives(target); }
        this.pushLog({ type: 'passive', passive: 'Smite', actorName: actor.unit_name, targetName: target.unit_name, value: bonus });
      }
    }

    if (passive.startsWith('impale')) {
      const row    = cellRow(target.cellIndex);
      const col    = cellCol(target.cellIndex);
      const behind = this.combatants.find(c =>
        c.side === target.side && c.alive && c.id !== target.id &&
        cellRow(c.cellIndex) === row && cellCol(c.cellIndex) !== col
      );
      if (behind) {
        const splash = Math.floor(dmg * 0.25);
        behind.battle_hp = Math.max(0, behind.battle_hp - splash);
        if (behind.battle_hp <= 0) { behind.alive = false; this.applyOnDeathPassives(behind); }
        this.pushLog({ type: 'passive', passive: 'Impale', actorName: actor.unit_name, targetName: behind.unit_name, value: splash });
      }
    }

    if (passive.startsWith('wither') && !target._flags.withered) {
      target._flags.withered    = true;
      target._healing_reduction = (target._healing_reduction ?? 0) + 10;
      this.pushLog({ type: 'status', passive: 'Wither', actorName: actor.unit_name, targetName: target.unit_name, value: 10 });
    }
  }

  // ─── on_hit_received (defender) ──────────────────────────────────────────

  applyOnHitReceivedPassives(actor, target, dmg) {
    const passive = target.unit_data?.passive || target.unit_data?.passive_ability;
    if (!passive || dmg <= 0) return;

    if (passive.startsWith('thorns')) {
      const map     = { 'thorns 1': 20, 'thorns 2': 35 };
      const reflect = Math.floor(dmg * (map[passive] ?? 0) / 100);
      actor.battle_hp = Math.max(0, actor.battle_hp - reflect);
      if (actor.battle_hp <= 0) { actor.alive = false; this.applyOnDeathPassives(actor); }
      this.pushLog({ type: 'passive', passive: 'Thorns', actorName: target.unit_name, targetName: actor.unit_name, value: reflect });
    }

    if (passive.startsWith('thorn_wall')) {
      const reflect = Math.floor(dmg * 0.15);
      actor.battle_hp = Math.max(0, actor.battle_hp - reflect);
      if (actor.battle_hp <= 0) { actor.alive = false; this.applyOnDeathPassives(actor); }
      this.pushLog({ type: 'passive', passive: 'Thorn Wall', actorName: target.unit_name, targetName: actor.unit_name, value: reflect });
    }

    if (passive.startsWith('spore_cloud')) {
      const map      = { 'spore_cloud 1': 8, 'spore_cloud 2': 16 };
      const aoe      = map[passive] ?? 0;
      const adjacent = this.combatants.filter(c =>
        c.side === actor.side && c.alive && c.id !== actor.id &&
        Math.abs(cellRow(c.cellIndex) - cellRow(target.cellIndex)) <= 1
      );
      for (const adj of adjacent) {
        adj.battle_hp = Math.max(0, adj.battle_hp - aoe);
        if (adj.battle_hp <= 0) { adj.alive = false; this.applyOnDeathPassives(adj); }
        this.pushLog({ type: 'passive', passive: 'Spore Cloud', actorName: target.unit_name, targetName: adj.unit_name, value: aoe });
      }
    }

    if (passive.startsWith('volcanic_skin')) {
      const val = 12;
      actor.battle_hp = Math.max(0, actor.battle_hp - val);
      if (actor.battle_hp <= 0) { actor.alive = false; this.applyOnDeathPassives(actor); }
      this.pushLog({ type: 'passive', passive: 'Volcanic Skin', actorName: target.unit_name, targetName: actor.unit_name, value: val });
    }

    if (passive.startsWith('glacial_armor')) {
      target._stacks.glacial_armor = (target._stacks.glacial_armor ?? 0) + 1;
      if (target._stacks.glacial_armor >= 3) {
        target._stacks.glacial_armor = 0;
        target.armor += 10;
        this.pushLog({ type: 'passive', passive: 'Glacial Armor', actorName: target.unit_name, targetName: target.unit_name, value: 10 });
      }
    }
  }

  // ─── on_kill ─────────────────────────────────────────────────────────────

  applyOnKillPassives(actor) {
    const passive = actor.unit_data?.passive || actor.unit_data?.passive_ability;
    if (!passive) return;

    if (passive.startsWith('soul_drain')) {
      const map    = { 'soul_drain 1': 30, 'soul_drain 2': 55 };
      const heal   = map[passive] ?? 0;
      const actual = Math.min(heal, actor.max_hp - actor.battle_hp);
      actor.battle_hp += actual;
      this.pushLog({ type: 'passive', passive: 'Soul Drain', actorName: actor.unit_name, targetName: actor.unit_name, value: actual });
    }

    if (passive.startsWith('blood_frenzy')) {
      actor._dmg_mult = (actor._dmg_mult ?? 1) + 0.15;
      this.pushLog({ type: 'passive', passive: 'Blood Frenzy', actorName: actor.unit_name, targetName: actor.unit_name, value: 15 });
    }
  }

  // ─── on_death ────────────────────────────────────────────────────────────

  applyOnDeathPassives(dying) {
    const passive = dying.unit_data?.passive || dying.unit_data?.passive_ability;
    if (!passive) return;

    if (passive.startsWith('undying') && !dying._flags.undying_used) {
      dying._flags.undying_used = true;
      dying.alive     = true;
      dying.battle_hp = passive === 'undying 2'
        ? 1 + Math.floor(dying.max_hp * 0.20)
        : 1;
      this.pushLog({ type: 'passive', passive: 'Undying', actorName: dying.unit_name, targetName: dying.unit_name, value: dying.battle_hp });
    }

    if (passive.startsWith('noxious_death')) {
      const map = { 'noxious_death 1': 20, 'noxious_death 2': 40 };
      const dmg = map[passive] ?? 0;
      for (const e of this.combatants.filter(c => c.side !== dying.side && c.alive)) {
        e.battle_hp = Math.max(0, e.battle_hp - dmg);
        if (e.battle_hp <= 0) e.alive = false;
        this.pushLog({ type: 'passive', passive: 'Noxious Death', actorName: dying.unit_name, targetName: e.unit_name, value: dmg });
      }
    }
  }

  // ─── on_below_half_hp ────────────────────────────────────────────────────

  applyBelowHalfPassive(unit) {
    if (unit._flags.enrage_triggered) return;
    const passive = unit.unit_data?.passive || unit.unit_data?.passive_ability;
    if (!passive?.startsWith('enrage')) return;

    const map  = { 'enrage 1': 1.30, 'enrage 2': 1.50 };
    const mult = map[passive] ?? 1;
    unit._dmg_mult = (unit._dmg_mult ?? 1) * mult;
    unit._flags.enrage_triggered = true;
    this.pushLog({ type: 'passive', passive: 'Enrage', actorName: unit.unit_name, targetName: unit.unit_name, value: Math.round((mult - 1) * 100) });
  }

  // ─── Targeting ───────────────────────────────────────────────────────────

  isHealer(unit) {
    const data = unit.unit_data || unit;
    const tt   = data.target_type || data.action?.target_type;
    return tt === 'ally';
  }

  getValidTargets(actor, forAbility = false) {
    if (forAbility) return this.getAbilityTargets(actor);

    const isHeal = this.isHealer(actor);
    return this.combatants.filter(t => {
      if (!t.alive) return false;
      if (isHeal) return t.side === actor.side;
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

  getAbilityTargets(actor) {
    const key = String(actor.unit_data?.ability || actor.unit_data?.active_ability || '').toLowerCase();
    if (key.startsWith('purge'))       return this.combatants.filter(c => c.side !== actor.side && c.alive);
    if (key.startsWith('mark_of_ash')) return this.combatants.filter(c => c.side !== actor.side && c.alive);
    if (key.startsWith('raise_dead'))  return this.combatants.filter(c => c.side === actor.side && !c.alive && (c.unit_data?.tags ?? []).includes('Undead'));
    if (key.startsWith('devour'))      return this.combatants.filter(c => c.side === actor.side && c.alive && c.id !== actor.id);
    if (key.startsWith('lions_roar'))  return [actor];
    return this.combatants.filter(c => c.side !== actor.side && c.alive);
  }

  // ─── Damage / Heal calc ───────────────────────────────────────────────────

  calcDamage(actor, target) {
    const data    = actor.unit_data || actor;
    let   power   = data.action_power ?? data.action?.value ?? 12;
    const armor   = Math.max(0, target.armor + (target.defend_armor_bonus || 0));
    const passive = actor.unit_data?.passive || actor.unit_data?.passive_ability;

    if (passive?.startsWith('predator') && target.battle_hp / target.max_hp < 0.5) {
      power = Math.floor(power * 1.20);
    }

    if (passive?.startsWith('pierce')) {
      const map            = { 'pierce 1': 0.25, 'pierce 2': 0.50 };
      const effectiveArmor = Math.floor(armor * (1 - (map[passive] ?? 0)));
      return Math.max(1, Math.floor(power * (actor._dmg_mult ?? 1)) - effectiveArmor);
    }

    return Math.max(1, Math.floor(power * (actor._dmg_mult ?? 1)) - armor);
  }

  calcHeal(actor) {
    const data  = actor.unit_data || actor;
    const power = data.action_power ?? data.action?.value ?? 15;
    return Math.floor(power * 1.3);
  }

  // ─── Execute ─────────────────────────────────────────────────────────────

  executeAction(actor, target = null, actionType = 'attack') {
    this.applyTurnStartPassives(actor);

    if (actionType === 'defend')  return this.doDefend(actor);
    if (actionType === 'ability') return this.doAbility(actor, target);
    if (!target) return false;

    if (this.isHealer(actor)) {
      const raw    = this.calcHeal(actor);
      const factor = 1 - (target._healing_reduction ?? 0) / 100;
      const heal   = Math.floor(Math.min(raw * factor, target.max_hp - target.battle_hp));
      target.battle_hp += heal;
      this.pushLog({ type: 'action', actorName: actor.unit_name, targetName: target.unit_name, value: heal, heal: true });
    } else {
      let remaining = this.calcDamage(actor, target);

      if (target.shield > 0) {
        const absorbed = Math.min(target.shield, remaining);
        target.shield -= absorbed;
        remaining     -= absorbed;
      }

      target.battle_hp = Math.max(0, target.battle_hp - remaining);
      const dead       = target.battle_hp <= 0;

      if (dead) {
        target.alive = false;
        this.applyOnDeathPassives(target);
      } else if (target.battle_hp < target.max_hp / 2) {
        this.applyBelowHalfPassive(target);
      }

      this.pushLog({ type: 'action', actorName: actor.unit_name, targetName: target.unit_name, value: remaining, killed: !target.alive });

      this.applyOnHitPassives(actor, target, remaining);
      this.applyOnHitReceivedPassives(actor, target, remaining);

      if (dead && !target.alive) this.applyOnKillPassives(actor);

      this.applyDoTs(target);
    }

    actor.acted_this_round = true;
    return this.afterAction(actor);
  }

  applyDoTs(unit) {
    if (!unit.alive) return;
    if (unit.burn > 0) {
      unit.battle_hp = Math.max(0, unit.battle_hp - unit.burn);
      this.pushLog({ type: 'passive', passive: 'Burn', actorName: '🔥', targetName: unit.unit_name, value: unit.burn });
      if (!unit._flags.mark_of_ash) unit.burn = 0;
      if (unit.battle_hp <= 0) { unit.alive = false; this.applyOnDeathPassives(unit); }
    }
    if (unit.poison > 0) {
      unit.battle_hp = Math.max(0, unit.battle_hp - unit.poison);
      this.pushLog({ type: 'passive', passive: 'Poison', actorName: '☠️', targetName: unit.unit_name, value: unit.poison });
      unit.poison = 0;
      if (unit.battle_hp <= 0) { unit.alive = false; this.applyOnDeathPassives(unit); }
    }
  }

  doDefend(actor) {
    actor.defend_armor_bonus = 25;
    actor.acted_this_round   = true;
    this.pushLog({ type: 'defend', actorName: actor.unit_name, message: 'defended (+25 armor this round)' });
    return this.afterAction(actor);
  }

  doAbility(actor, target) {
    const key = String(actor.unit_data?.ability || actor.unit_data?.active_ability || '').toLowerCase();
    if (actor.used_active || !key) {
      actor.acted_this_round = true;
      return this.afterAction(actor);
    }

    actor.used_active      = true;
    actor.acted_this_round = true;

    if (key.startsWith('purge')) {
      if (!target) return false;
      target.burn = 0; target.poison = 0; target._flags.withered = false;
      target._dmg_mult = Math.min(target._dmg_mult ?? 1, 1);
      this.pushLog({ type: 'ability', actorName: actor.unit_name, targetName: target.unit_name, message: 'Purge — stripped all debuffs' });
    }

    else if (key.startsWith('mark_of_ash')) {
      if (!target) return false;
      const dot = Math.floor((actor.unit_data?.action_power ?? 10) * 0.25);
      target.burn = dot;
      target._flags.mark_of_ash = true;
      this.pushLog({ type: 'ability', actorName: actor.unit_name, targetName: target.unit_name, message: `Mark of Ash — permanent burn (${dot}/turn)` });
    }

    else if (key.startsWith('raise_dead')) {
      if (!target) return false;
      target.alive     = true;
      target.battle_hp = Math.floor(target.max_hp * 0.50);
      this.pushLog({ type: 'ability', actorName: actor.unit_name, targetName: target.unit_name, message: `Raise Dead — resurrected at ${target.battle_hp} HP` });
    }

    else if (key.startsWith('devour')) {
      const allies = this.combatants.filter(c => c.side === actor.side && c.alive && c.id !== actor.id);
      let drained  = 0;
      for (const a of allies) {
        const d = Math.floor(a.max_hp * 0.25);
        a.battle_hp = Math.max(1, a.battle_hp - d);
        drained    += d;
      }
      actor._dmg_mult = (actor._dmg_mult ?? 1) + (Math.floor(drained * 0.5) / 100);
      this.pushLog({ type: 'ability', actorName: actor.unit_name, targetName: 'allies', message: `Devour — drained ${drained} HP, gained ${Math.floor(drained * 0.5)}% damage` });
    }

    else if (key.startsWith('lions_roar')) {
      for (const a of this.combatants.filter(c => c.side === actor.side && c.alive)) {
        a.initiative += 20;
      }
      this.pushLog({ type: 'ability', actorName: actor.unit_name, targetName: 'all allies', message: "Lion's Roar — +20 initiative to all allies" });
    }

    return this.afterAction(actor);
  }

  skipTurn(actor) {
    this.pushLog({ type: 'skip', actorName: actor.unit_name });
    actor.acted_this_round = true;
    return this.afterAction(actor);
  }

  // ─── Round management ─────────────────────────────────────────────────────

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
      if (!c._flags.mark_of_ash) c.burn = 0;
      c._flags.frost_aura_applied = false;
      c._flags.hex_aura_applied   = false;
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