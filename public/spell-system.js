import { unitHasTag } from './tag-rules.js';

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
    const scale   = this.getTagScale(spell, targets);

    for (const target of targets) {
      this.applySpellToUnit(spell, target, scale);
      spell_effect.targets.push({
        unit_id: target.id,
        unit_name: target.unit_name,
        changes: this.describeSpellChanges(spell, target, scale)
      });
    }

    this.active_spells.set(spell.id, spell_effect);
    return spell_effect;
  }

  getSpellTargets(spell, combatants, caster_side) {
    const params    = spell.params || {};
    const enemy_side = caster_side === 'player' ? 'enemy' : 'player';

    if (spell.target_scope === 'all_allies') {
      return combatants.filter(c => c.alive && c.side === caster_side);
    }
    if (spell.target_scope === 'all_enemies') {
      return combatants.filter(c => c.alive && c.side === enemy_side);
    }
    if (spell.target_scope === 'single_ally') {
      return combatants.filter(c => c.alive && c.side === caster_side).slice(0, 1);
    }
    if (spell.target_scope === 'single_enemy') {
      return combatants.filter(c => c.alive && c.side === enemy_side).slice(0, 1);
    }
    if (spell.target_scope === 'tag_allies' && params.tag) {
      return combatants.filter(c => c.alive && c.side === caster_side && unitHasTag(c, params.tag));
    }
    if (spell.target_scope === 'tag_enemies' && params.tag) {
      return combatants.filter(c => c.alive && c.side === enemy_side && unitHasTag(c, params.tag));
    }
    return [];
  }

  applySpellToUnit(spell, unit, scale = 1) {
    const params = spell.params || {};
    const effective = {
      armor_boost: params.armor_boost != null ? params.armor_boost * scale : undefined,
      resistances: params.resistances,
      lifesteal: params.lifesteal != null ? params.lifesteal * scale : undefined,
      max_hp_boost: params.max_hp_boost != null ? params.max_hp_boost * scale : undefined,
      damage_boost: params.damage_boost != null ? params.damage_boost * scale : undefined,
      damage_reduction: params.damage_reduction != null ? params.damage_reduction * scale : undefined,
      armor_reduction: params.armor_reduction != null ? params.armor_reduction * scale : undefined,
      max_hp_reduction: params.max_hp_reduction != null ? params.max_hp_reduction * scale : undefined,
      damage_taken_increase: params.damage_taken_increase,
      initiative_reduction: params.initiative_reduction != null ? params.initiative_reduction * scale : undefined,
    };

    if (spell.effect_type === 'buff') {
      if (effective.armor_boost) {
        unit.armor = Math.round(unit.armor + effective.armor_boost);
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

      if (effective.lifesteal) {
        unit.lifesteal = (unit.lifesteal || 0) + effective.lifesteal;
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.lifesteal_granted = true;
      }

      if (effective.max_hp_boost) {
        unit.max_hp = (unit.max_hp || unit.battle_hp) + effective.max_hp_boost;
        unit.battle_hp = unit.max_hp;
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.hp_boosted = true;
      }

      if (effective.damage_boost) {
        unit.spell_damage_multiplier = (unit.spell_damage_multiplier || 1) + effective.damage_boost;
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.damage_boosted = true;
      }
    }

    if (spell.effect_type === 'debuff') {
      if (effective.damage_reduction) {
        unit.damage_reduction = (unit.damage_reduction || 0) + effective.damage_reduction;
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.weakened = true;
      }

      if (effective.armor_reduction) {
        unit.armor = Math.round(unit.armor * (1 - effective.armor_reduction));
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.armor_reduced = true;
      }

      if (effective.max_hp_reduction) {
        unit.max_hp = Math.round(unit.max_hp * (1 - effective.max_hp_reduction));
        unit.battle_hp = Math.min(unit.battle_hp, unit.max_hp);
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.hp_reduced = true;
      }

      if (effective.damage_taken_increase) {
        unit.damage_type_vulnerabilities = unit.damage_type_vulnerabilities || {};
        Object.entries(effective.damage_taken_increase).forEach(([dmg_type, multiplier]) => {
          unit.damage_type_vulnerabilities[dmg_type] = (unit.damage_type_vulnerabilities[dmg_type] || 1) + multiplier;
        });
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.vulnerable = true;
      }

      if (effective.initiative_reduction) {
        unit.initiative = Math.round(unit.initiative * (1 - effective.initiative_reduction));
        unit.spell_effects = unit.spell_effects || {};
        unit.spell_effects.slowed = true;
      }
    }
  }

  getTagScale(spell, targets) {
    const params = spell.params || {};
    if (params.tag && params.scale_by_tag_count) {
      return Math.max(1, targets.length);
    }
    return 1;
  }

  describeSpellChanges(spell, unit, scale = 1) {
    const changes = [];
    const params = spell.params || {};
    const actual = {
      armor_boost: params.armor_boost != null ? params.armor_boost * scale : undefined,
      lifesteal: params.lifesteal != null ? params.lifesteal * scale : undefined,
      damage_boost: params.damage_boost != null ? params.damage_boost * scale : undefined,
      damage_reduction: params.damage_reduction != null ? params.damage_reduction * scale : undefined,
      armor_reduction: params.armor_reduction != null ? params.armor_reduction * scale : undefined,
      max_hp_reduction: params.max_hp_reduction != null ? params.max_hp_reduction * scale : undefined,
      initiative_reduction: params.initiative_reduction != null ? params.initiative_reduction * scale : undefined,
    };

    if (actual.armor_boost != null && typeof actual.armor_boost === 'number' && actual.armor_boost <= 1) {
      changes.push(`+${Math.round(actual.armor_boost * 100)}% Armor`);
    } else if (actual.armor_boost != null && typeof actual.armor_boost === 'number') {
      changes.push(`+${actual.armor_boost} Armor`);
    }

    if (params.resistances) {
      Object.entries(params.resistances).forEach(([type, val]) => {
        if (val > 0) changes.push(`+${val} ${type} Resist`);
        if (val < 0) changes.push(`${val} ${type} Resist`);
      });
    }

    if (actual.lifesteal) {
      changes.push(`+${Math.round(actual.lifesteal * 100)}% Lifesteal`);
    }

    if (actual.max_hp_boost) {
      changes.push(`+${actual.max_hp_boost} Max HP`);
    }

    if (actual.damage_boost) {
      changes.push(`+${Math.round(actual.damage_boost * 100)}% Damage`);
    }

    if (actual.damage_reduction) {
      changes.push(`-${Math.round(actual.damage_reduction * 100)}% Damage`);
    }

    if (actual.armor_reduction) {
      changes.push(`-${Math.round(actual.armor_reduction * 100)}% Armor`);
    }

    if (actual.max_hp_reduction) {
      changes.push(`-${Math.round(actual.max_hp_reduction * 100)}% Max HP`);
    }

    if (actual.initiative_reduction) {
      changes.push(`-${Math.round(actual.initiative_reduction * 100)}% Initiative`);
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