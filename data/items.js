const ITEM_DEFS = {

  meteor_exoskeleton: {
    key:          'meteor_exoskeleton',
    name:         'Meteor Exoskeleton',
    faction:      'empire',
    tag_required: 'Engineer',
    adds_tag:     'Construct',
    stat_mods:    { hp: 3, armor: 3 },
    passive:      null,
    icon:         'meteor_exoskeleton',
    cost:         { cinder_ash: 2, Gold: 100 },
  },
  aegis_of_the_first_ward: {
    key:          'aegis_of_the_first_ward',
    name:         'Aegis of the First Ward',
    faction:      'empire',
    tag_required: 'Knight',
    adds_tag:     null,
    stat_mods:    { fire_resist: 8, death_resist: 8 },
    passive:      null,
    icon:         'aegis_of_the_first_ward',
    cost:         { vial_of_pure_blood: 1, Gold: 60, Crystals_Life: 45 },
  },
  might_of_the_pure: {
    key:          'might_of_the_pure',
    name:         'Might Of The Pure',
    faction:      'empire',
    tag_required: 'Knight',
    adds_tag:     null,
    stat_mods:    { action_power: 5, death_resist: 5 },
    passive:      null,
    icon:         'might_of_the_pure',
    cost:         { Gold: 100, Crystals_Life: 25, Crystals_Death: 25 },
    item_cost:    { death_resistance_potion: 1, mace: 1, broken_seal: 1}
  },
  sanctified_bulwark: {
    key:          'sanctified_bulwark',
    name:         'Sanctified Bulwark',
    faction:      'empire',
    tag_required: 'Knight',
    adds_tag:     'Holy',
    stat_mods:    { hp: 3, armor: 5 },
    passive:      'inspiration_damage 1',
    icon:         'sanctified_bulwark',
    cost:         { aggrails_signet: 2, Gold: 90, Crystals_Life: 25 },
    item_cost:    { iron_armor: 1 },
  },
  court_regalia: {
    key:          'court_regalia',
    name:         'Court Regalia',
    faction:      'choir_of_the_cursed',
    tag_required: 'Court',
    adds_tag:     null,
    stat_mods:    { hp: 15 },
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
    stat_mods:    { armor: 3, hp: 5, fire_resist: 5 },
    passive:      'volcanic_skin 1',
    icon:         'dragon_skin',
    cost:         { cinder_ash: 2, Gold: 75, Crystals_Fire: 25 },
    item_cost:    { iron_armor: 1, fire_resistance_potion: 1 },
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
    cost:         { grave_dust: 2, Gold: 100, Crystals_Death: 25 },
  },
  padded_armor: {
    key:          'padded_armor',
    name:         "Padded Armor",
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { hp: 5 },
    passive:      null,
    icon:         'padded_armor',
    cost:         { Gold: 50 },
  },
    iron_armor: {
    key:          'iron_armor',
    name:         "Iron Armor",
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { armor: 3, hp: 5 },
    passive:      null,
    icon:         'iron_armor',
    cost:         { Gold: 50 },
    item_cost:    { padded_armor: 1 },
  },
    fire_resistance_potion: {
    key:          'fire_resistance_potion',
    name:         "Fire Resistance Potion",
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { fire_resistance: 5 },
    passive:      null,
    icon:         'fire_resistance_potion',
    cost:         { Gold: 25, Crystals_Fire: 25 },
  },
    death_resistance_potion: {
    key:          'death_resistance_potion',
    name:         "Death Resistance Potion",
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { fire_resistance: 5 },
    passive:      null,
    icon:         'death_resistance_potion',
    cost:         { Gold: 25, Crystals_Death: 25 },
  },
    crude_sword: {
    key:          'crude_sword',
    name:         "Crude Sword",
    faction:      null,
    tag_required: 'Knight',
    adds_tag:     null,
    stat_mods:    { power: 3, initiative: 3 },
    passive:      null,
    icon:         'crude_sword',
    cost:         { Gold: 25, Crystals_Death: 25 },
  },
    mace: {
    key:          'mace',
    name:         "Mace",
    faction:      null,
    tag_required: 'Knight',
    adds_tag:     null,
    stat_mods:    { power: 3 },
    passive:      null,
    icon:         'mace',
    cost:         { Gold: 25, Crystals_Death: 25 },
  },
  broken_seal: {
    key:          'broken_seal',
    name:         "Broken Seal",
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { power: 2 },
    passive:      null,
    icon:         'broken_seal',
    cost:         { aggrails_signet: 1, Gold: 25 },
  },
  lion_signet: {
    key:          'lion_signet',
    name:         "Lion Signet",
    faction:      'empire',
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { power: 3, hp: 3 },
    passive:      null,
    icon:         'lion_signet',
    cost:         { aggrails_signet: 1, Gold: 25 },
    item_cost:    { broken_seal: 1 },
  },
  staff_of_thaumaturgy: {
    key:          'staff_of_thaumaturgy',
    name:         "Staff Of Thaumaturgy",
    faction:      'grail_of_sorrow',
    tag_required: 'Vampire',
    adds_tag:     'Caster',
    stat_mods:    { power: 3, hp: 3 },
    passive:      'bleed 1',
    icon:         'staff_of_thaumaturgy',
    cost:         { vial_of_pure_blood: 1, Gold: 25 },
    item_cost:    { broken_seal: 1 },
  },
    dendrareume: {
    key:          'dendrareume',
    name:         "Dendrareume",
    faction:      null,
    tag_required: null,
    adds_tag:     'Treefolk',
    stat_mods:    { power: 2, nature_resist: 5 },
    passive:      null,
    icon:         'dendrareume',
    cost:         { vial_of_pure_blood: 1, Gold: 25 },
    item_cost:    { broken_seal: 1 },
  },
  poisonous_dagger: {
    key:          'poisonous_dagger',
    name:         "Poisonous Dagger",
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { power: 2 },
    passive:      'poison 1',
    icon:         'poisonous_dagger',
    cost:         { vial_of_pure_blood: 1, Gold: 25 },
    item_cost:    { broken_seal: 1 },
  },
  frost_lance: {
    key:          'frost_lance',
    name:         "Frost Lance",
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { power: 2 },
    passive:      'chill 2',
    icon:         'frost_lance',
    cost:         { vial_of_pure_blood: 1, Gold: 25 },
    item_cost:    { broken_seal: 1 },
  },
  bone_barrier: {
    key:          'bone_barrier',
    name:         "Bone Barrier",
    faction:      null,
    tag_required: null,
    adds_tag:     'Skeleton',
    stat_mods:    { armor: 5 },
    passive:      'undying 1',
    icon:         'bone_barrier',
    cost:         { vial_of_pure_blood: 1, Gold: 25 },
    item_cost:    { broken_seal: 1 },
  },
  veil_of_discord: {
    key:          'veil_of_discord',
    name:         "Veil Of Discord",
    faction:      'grail_of_sorrow',
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { cold_resist: 3, air_resist_3 },
    passive:      'undying 1',
    icon:         'veil_of_discord',
    cost:         { vial_of_pure_blood: 1, Gold: 25 },
    item_cost:    { broken_seal: 1 },
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
  let   armor        = unitData.armor        ?? 0;
  let   action_power = unitData.action_power ?? 0;
  let   initiative   = unitData.initiative   ?? 0;

  for (const [statKey, val] of Object.entries(mods)) {
    if (statKey === 'hp')           continue;
    if (statKey === 'armor')        { armor        += val; continue; }
    if (statKey === 'action_power') { action_power += val; continue; }
    if (statKey === 'initiative')   { initiative   += val; continue; }
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

  return { ...unitData, tags, armor, action_power, initiative, resistances, passive };
}

export { ITEM_DEFS, applyItemModifiers };
if (typeof module !== 'undefined') module.exports = { ITEM_DEFS, applyItemModifiers };