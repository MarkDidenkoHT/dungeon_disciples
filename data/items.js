// Item definitions. These are "templates" used when crafting/granting an item.
// A crafted item's full stats are snapshotted into items.item_stats at creation
// time (see items table), so balance changes here do not retroactively affect
// items players already own.
//
// item_stats shape (as stored in items.item_stats jsonb):
// {
//   key:          'meteor_exoskeleton',  // template id, matches ITEM_DEFS key
//   name:         'Meteor Exoskeleton',
//   faction:      'empire',              // required faction to equip, or null for any
//   tag_required: 'Engineer',            // unit must have this tag to equip, or null for any
//   adds_tag:     'Construct',           // tag granted to the wearer while equipped, or null
//   stat_mods:    { hp: 5, armor: 5, air_resist: 5 }, // added to base stats while equipped
//   passive:      null,                  // UNIT_ABILITIES key granted while equipped, or null
//   icon:         'meteor_exoskeleton',  // /assets/icons/items/<icon>.png
// }

const ITEM_DEFS = {
  meteor_exoskeleton: {
    key:          'meteor_exoskeleton',
    name:         'Meteor Exoskeleton',
    faction:      'empire',
    tag_required: 'Engineer',
    adds_tag:     'Construct',
    stat_mods:    { hp: 5, armor: 5, air_resist: 5 },
    passive:      null,
    icon:         'meteor_exoskeleton',
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
