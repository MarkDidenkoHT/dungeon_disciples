// Equip restrictions BEYOND faction and tag_required (which live on the item
// itself and are checked separately). This module answers one question:
//
//   "Would putting this item on this unit produce something incoherent?"
//
// Two layers, checked in this order:
//
//   1. EXPLICIT — fields an item may declare in data/items.js:
//        blocked_tags:    ['Construct']   unit carrying ANY of these is refused
//        blocked_actions: ['heal']        unit whose action is of this kind is refused
//        requires_action: 'damage'        unit must have an action of this kind
//      Use these when an item is a special case the derived layer cannot know
//      about. They always win over the derived rules.
//
//   2. DERIVED — inferred from the item's passive. A passive that only ever
//      fires off a damaging hit is dead weight on a healer, and one that fires
//      on healing is dead weight on a pure attacker. Rather than let a player
//      spend a mythic on a unit that can never trigger it, the pairing is
//      refused with an explanation. This layer needs no per-item authoring:
//      add a passive to an item and its requirement follows automatically from
//      the trigger declared in data/unit_abilities.js.
//
// Both the roster UI and POST /items/equip call getEquipBlock(), so the rule is
// stated once. The server is the authority; the client uses it to disable the
// button and say why before the player taps.

// What a unit's action actually does, derived from its definition in
// data/units.js. Actions seen there: attack, heal, repair, 'mend flesh'
// (several casings), sacrifice, none.
function unitActionKind(unitDef) {
  if (!unitDef) return 'unknown';
  const raw = unitDef.action;
  const actionType = (raw && typeof raw === 'object') ? raw.action_type : raw;
  const name = String(actionType ?? '').toLowerCase().trim();
  const targetType = (raw && typeof raw === 'object' ? raw.target_type : null) ?? unitDef.target_type;

  if (!name || name === 'none') return 'none';
  if (name === 'sacrifice')     return 'sacrifice';
  if (/heal|mend|repair/.test(name)) return 'heal';
  // Anything aimed at an ally restores rather than harms, whatever it is called.
  if (targetType === 'ally') return 'heal';
  return 'damage';
}

// Passive triggers that require the carrier to land a damaging hit of its own.
// A unit that heals (or does nothing) can never satisfy these.
const NEEDS_DAMAGE_TRIGGERS = new Set(['on_hit', 'on_kill', 'preemptive_strike']);

// Passive triggers that require the carrier to heal somebody.
const NEEDS_HEAL_TRIGGERS = new Set(['on_heal']);

// Splits 'regenerate 2' into its base key so the ability can be looked up.
function passiveBaseKey(key) {
  return String(key || '').trim().split(/\s+/)[0];
}

function passiveKeysOf(stats) {
  const raw = stats?.passive;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
}

/**
 * Returns null when the pairing is fine, or a block object:
 *   { code, reason, reason_ru }
 *
 * `unitAbilities` is data/unit_abilities.js's UNIT_ABILITIES map, passed in so
 * this module stays free of import-cycle concerns on both client and server.
 */
function getEquipBlock(itemStats, unitDef, unitAbilities = {}) {
  const stats = itemStats || {};
  if (!unitDef) return null;

  const tags = (unitDef.tags || []).filter(Boolean);
  const kind = unitActionKind(unitDef);

  // ---- 1. explicit, per-item ------------------------------------------------
  const blockedTags = stats.blocked_tags || [];
  const hitTag = blockedTags.find(t => tags.includes(t));
  if (hitTag) {
    return {
      code: 'blocked_tag',
      reason:    `Cannot be carried by ${hitTag} units`,
      reason_ru: `Не может носиться бойцами с меткой «${hitTag}»`,
    };
  }

  const blockedActions = stats.blocked_actions || [];
  if (blockedActions.includes(kind)) {
    return {
      code: 'blocked_action',
      reason:    'This unit\'s action cannot use this item',
      reason_ru: 'Действие этого бойца не подходит для предмета',
    };
  }

  if (stats.requires_action && stats.requires_action !== kind) {
    return {
      code: 'requires_action',
      reason:    stats.requires_action === 'heal'
        ? 'Only healers can carry this'
        : 'Only attacking units can carry this',
      reason_ru: stats.requires_action === 'heal'
        ? 'Только целители могут это носить'
        : 'Только атакующие бойцы могут это носить',
    };
  }

  // ---- 2. derived from the item's passive -----------------------------------
  for (const key of passiveKeysOf(stats)) {
    const def = unitAbilities[key] || unitAbilities[passiveBaseKey(key)];
    const trigger = def?.trigger;
    if (!trigger) continue;

    if (NEEDS_DAMAGE_TRIGGERS.has(trigger) && (kind === 'heal' || kind === 'none')) {
      const label = def.name || passiveBaseKey(key);
      return {
        code: 'passive_needs_damage',
        reason:    `${label} only triggers on a damaging hit — this unit does not attack`,
        reason_ru: `«${label}» срабатывает только при атаке — этот боец не атакует`,
      };
    }

    if (NEEDS_HEAL_TRIGGERS.has(trigger) && kind !== 'heal') {
      const label = def.name || passiveBaseKey(key);
      return {
        code: 'passive_needs_heal',
        reason:    `${label} only triggers on healing — this unit does not heal`,
        reason_ru: `«${label}» срабатывает только при лечении — этот боец не лечит`,
      };
    }
  }

  return null;
}

export { getEquipBlock, unitActionKind, NEEDS_DAMAGE_TRIGGERS, NEEDS_HEAL_TRIGGERS };
if (typeof module !== 'undefined') {
  module.exports = { getEquipBlock, unitActionKind, NEEDS_DAMAGE_TRIGGERS, NEEDS_HEAL_TRIGGERS };
}