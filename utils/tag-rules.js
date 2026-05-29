const TAG_RULES = {
  heal: {
    targetExcludeTags: ['Construct'],
  },
  repair: {
    targetRequireTags: ['Construct'],
  },
  'mend flesh': {
   targetRequireTags: ['Zombie'],
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