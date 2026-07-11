const ITEM_DEFS = {

  meteor_exoskeleton: {
    key:          'meteor_exoskeleton',
    name:         'Meteor Exoskeleton',
    faction:      'empire',
    tag_required: 'Engineer',
    adds_tag:     'Construct',
    stat_mods:    { hp: 5, armor: 5 },
    passive:      null,
    icon:         'meteor_exoskeleton',
    cost:         { cinder_ash: 2, Gold: 100, Crystals_Air: 8 },
  },
  aegis_of_the_first_ward: {
    key:          'aegis_of_the_first_ward',
    name:         'Aegis of the First Ward',
    faction:      'empire',
    tag_required: 'Knight',
    adds_tag:     null,
    stat_mods:    { fire_resist: 10, death_resist: 10 },
    passive:      null,
    icon:         'aegis_of_the_first_ward',
    cost:         { vial_of_pure_blood: 1, Gold: 60, Crystals_Life: 4 },
  },
    might_of_the_pure: {
    key:          'might_of_the_pure',
    name:         'Might Of The Pure',
    faction:      'empire',
    tag_required: 'Knight',
    adds_tag:     null,
    stat_mods:    { action_power: 10, death_resist: 5 },
    passive:      null,
    icon:         'might_of_the_pure',
    cost:         { Gold: 160, Crystals_Life: 45 },
  },
  sanctified_bulwark: {
    key:          'sanctified_bulwark',
    name:         'Sanctified Bulwark',
    faction:      'empire',
    tag_required: 'Knight',
    adds_tag:     'Holy',
    stat_mods:    null,
    passive:      'inspiration_damage 1',
    icon:         'sanctified_bulwark',
    cost:         { aggrails_signet: 2, rusted_shackle: 1, Gold: 90, Crystals_Life: 6 },
  },
  court_regalia: {
    key:          'court_regalia',
    name:         'Court Regalia',
    faction:      'choir_of_the_cursed',
    tag_required: 'Court',
    adds_tag:     null,
    stat_mods:    { armor: 5, hp: 15 },
    passive:      null,
    icon:         'court_regalia',
    cost:         { vial_of_pure_blood: 1, Gold: 60, Crystals_Life: 4 },
  },
  dragon_skin: {
    key:          'dragon_skin',
    name:         'Dragon SKin',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { fire_resist: 5 },
    passive:      'volcanic_skin 1',
    icon:         'dragon_skin',
    cost:         { cinder_ash: 1, Gold: 170, Crystals_Fire: 25 },
    item_cost:    { padded_armor: 1 },
  },
  shroud_of_the_fallen: {
    key:          'shroud_of_the_fallen',
    name:         'Shroud of the Fallen',
    faction:      'grail_of_sorrow',
    tag_required: 'Vampire',
    adds_tag:     'Zombie',
    stat_mods:    { hp: 10 },
    passive:      null,
    icon:         'shroud_of_the_fallen',
    cost:         { grave_dust: 2, aggrails_signet: 1, Gold: 100, Crystals_Death: 8 },
  },
  padded_armor: {
    key:          'padded_armor',
    name:         "Padded Armor",
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { armor: 5, hp: 5 },
    passive:      null,
    icon:         'padded_armor',
    cost:         { Gold: 50 },
  },
};

// Applies an item's non-HP modifiers (armor, resistances, tags, passive) on top
// of a unit_data object. HP is handled separately since it is persisted directly
// on the roster row (see equip/unequip in routes/index.js) rather than derived
// on the fly, so it is intentionally skipped here.
function applyItemModifiers(unitData, itemStats) {
  if (!itemStats) return unitData;

  const tags = Array.isArray(unitData.tags) ? [...unitData.tags] : [];
  if (itemStats.adds_tag && !tags.includes(itemStats.adds_tag)) tags.push(itemStats.adds_tag);

  const resistances = { ...(unitData.resistances || {}) };
  const mods  = itemStats.stat_mods || {};
  let   armor = unitData.armor ?? 0;

  for (const [statKey, val] of Object.entries(mods)) {
    if (statKey === 'hp') continue;
    if (statKey === 'armor') { armor += val; continue; }
    const resistMatch = statKey.match(/^(air|fire|nature|cold|life|death)_resist$/);
    if (resistMatch) {
      const resType = resistMatch[1];
      resistances[resType] = (resistances[resType] || 0) + val;
    }
  }

  let passive = unitData.passive;
  if (itemStats.passive) {
    if (Array.isArray(passive)) passive = [...passive, itemStats.passive];
    else if (passive)           passive = [passive, itemStats.passive];
    else                        passive = itemStats.passive;
  }

  return { ...unitData, tags, armor, resistances, passive };
}

export { ITEM_DEFS, applyItemModifiers };
if (typeof module !== 'undefined') module.exports = { ITEM_DEFS, applyItemModifiers };