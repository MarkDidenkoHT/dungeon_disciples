export class SpellSystem {
  constructor() {
    this.active_spells = new Map();
  }

  applyPreparationSpell(spell, combatants, caster_side) {
    const spell_effect = {
      spell_id: spell.id,
      spell_name: spell.name,
      effect_type: spell.effect_type,
      applied_at: Date.now(),
      targets: []
    };

    const targets = this.getSpellTargets(spell, combatants, caster_side);

    for (const target of targets) {
      this.applySpellToUnit(spell, target);
      spell_effect.targets.push({
        unit_id: target.id,
        unit_name: target.unit_name,
        changes: this.describeSpellChanges(spell, target)
      });
    }

    this.active_spells.set(spell.id, spell_effect);
    return spell_effect;
  }

  getSpellTargets(spell, combatants, caster_side) {
    if (spell.target_scope === 'all_allies') {
      return combatants.filter(c => c.alive && c.side === caster_side);
    }
    if (spell.target_scope === 'all_enemies') {
      const enemy_side = caster_side === 'player' ? 'enemy' : 'player';
      return combatants.filter(c => c.alive && c.side === enemy_side);
    }
    return [];
  }

  applySpellToUnit(spell, unit) {
    const params = spell.params || {};

    if (spell.effect_type === 'buff') {
      if (params.armor_boost) {
        unit.armor = Math.round(unit.armor * (1 + params.armor_boost));
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.armor_boost = true;
      }

      if (params.resistances) {
        unit.resistances = unit.resistances || {};
        Object.entries(params.resistances).forEach(([res_type, value]) => {
          unit.resistances[res_type] = (unit.resistances[res_type] || 0) + value;
        });
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.resistances_modified = true;
      }

      if (params.lifesteal) {
        unit.lifesteal = (unit.lifesteal || 0) + params.lifesteal;
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.lifesteal_granted = true;
      }

      if (params.max_hp_boost) {
        unit.max_hp = (unit.max_hp || unit.battle_hp) + params.max_hp_boost;
        unit.battle_hp = unit.max_hp;
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.hp_boosted = true;
      }

      if (params.damage_boost) {
        unit.spell_damage_multiplier = (unit.spell_damage_multiplier || 1) + params.damage_boost;
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.damage_boosted = true;
      }

      if (params.armor_boost && !params.armor_boost.toString().includes('%')) {
        unit.armor = (unit.armor || 0) + params.armor_boost;
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.armor_boosted = true;
      }
    }

    if (spell.effect_type === 'debuff') {
      if (params.damage_reduction) {
        unit.damage_reduction = (unit.damage_reduction || 0) + params.damage_reduction;
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.weakened = true;
      }

      if (params.armor_reduction) {
        unit.armor = Math.round(unit.armor * (1 - params.armor_reduction));
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.armor_reduced = true;
      }

      if (params.max_hp_reduction) {
        unit.max_hp = Math.round(unit.max_hp * (1 - params.max_hp_reduction));
        unit.battle_hp = Math.min(unit.battle_hp, unit.max_hp);
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.hp_reduced = true;
      }

      if (params.damage_taken_increase) {
        unit.damage_type_vulnerabilities = unit.damage_type_vulnerabilities || {};
        Object.entries(params.damage_taken_increase).forEach(([dmg_type, multiplier]) => {
          unit.damage_type_vulnerabilities[dmg_type] = (unit.damage_type_vulnerabilities[dmg_type] || 1) + multiplier;
        });
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.vulnerable = true;
      }

      if (params.initiative_reduction) {
        unit.initiative = Math.round(unit.initiative * (1 - params.initiative_reduction));
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.slowed = true;
      }
    }
  }

  describeSpellChanges(spell, unit) {
    const changes = [];
    const params = spell.params || {};

    if (params.armor_boost && typeof params.armor_boost === 'number' && params.armor_boost > 0.1) {
      changes.push(`+${Math.round(params.armor_boost * 100)}% Armor`);
    } else if (params.armor_boost && typeof params.armor_boost === 'number') {
      changes.push(`+${params.armor_boost} Armor`);
    }

    if (params.resistances) {
      Object.entries(params.resistances).forEach(([type, val]) => {
        if (val > 0) changes.push(`+${val} ${type} Resist`);
        if (val < 0) changes.push(`${val} ${type} Resist`);
      });
    }

    if (params.lifesteal) {
      changes.push(`+${Math.round(params.lifesteal * 100)}% Lifesteal`);
    }

    if (params.max_hp_boost) {
      changes.push(`+${params.max_hp_boost} Max HP`);
    }

    if (params.damage_boost) {
      changes.push(`+${Math.round(params.damage_boost * 100)}% Damage`);
    }

    if (params.damage_reduction) {
      changes.push(`-${Math.round(params.damage_reduction * 100)}% Damage`);
    }

    if (params.armor_reduction) {
      changes.push(`-${Math.round(params.armor_reduction * 100)}% Armor`);
    }

    if (params.max_hp_reduction) {
      changes.push(`-${Math.round(params.max_hp_reduction * 100)}% Max HP`);
    }

    if (params.initiative_reduction) {
      changes.push(`-${Math.round(params.initiative_reduction * 100)}% Initiative`);
    }

    return changes;
  }

  getActiveSpellsForUnit(unit) {
    const spells = [];
    this.active_spells.forEach((effect, spell_id) => {
      if (effect.targets.some(t => t.unit_id === unit.id)) {
        spells.push({
          spell_id,
          spell_name: effect.spell_name,
          effect_type: effect.effect_type
        });
      }
    });
    return spells;
  }

  clear() {
    this.active_spells.clear();
  }
}