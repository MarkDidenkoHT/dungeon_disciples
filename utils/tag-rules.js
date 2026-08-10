const TAG_RULES = {
  heal: {
    targetExcludeTags: ['Construct', 'Zombie'],
  },
  repair: {
    targetRequireTags: ['Construct'],
  },
  'mend flesh': {
   targetRequireTags: ['Zombie'],
  },
  // The Grail's mend for the bodiless: only a Spirit can be embraced.
  pale_embrace: {
    targetRequireTags: ['Spirit'],
  },
  // The Choir's mend. The song is in a tongue only the damned answer to, so it
  // reaches Demons and nothing else — not the Court, not the Constructs.
  song_of_ash: {
    targetRequireTags: ['Demon'],
  },
}

function unitHasTag(unit, tag) {
  const tags = unit?.unit_data?.tags ?? unit?.tags ?? [];
  return tags.includes(tag);
}

function unitHasAnyTag(unit, tags) {
  return tags.some(tag => unitHasTag(unit, tag));
}

function unitHasAllTags(unit, tags) {
  return tags.every(tag => unitHasTag(unit, tag));
}

function countUnitsWithTag(units, tag) {
  return units.filter(u => unitHasTag(u, tag)).length;
}

function filterByTagRules(units, actionKey) {
  if (!actionKey) return units;
  const rules = TAG_RULES[String(actionKey).toLowerCase()];
  if (!rules) return units;

  return units.filter(unit => {
    if (rules.targetRequireTags && !unitHasAnyTag(unit, rules.targetRequireTags)) return false;
    if (rules.targetExcludeTags && unitHasAnyTag(unit, rules.targetExcludeTags)) return false;
    return true;
  });
}
module.exports = { TAG_RULES, unitHasTag, unitHasAnyTag, unitHasAllTags, countUnitsWithTag, filterByTagRules };