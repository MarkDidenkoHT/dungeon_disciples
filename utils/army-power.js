const { applyItemModifiers } = require('../data/items');
const { applyEngraving } = require('../data/engravings');

// A 6-target action reaches the whole enemy side, and six fed straight into
// the damage term triples the unit's score. 43 of the 273 units in
// data/units.js carry one, so the scores for a sixth of the roster sat far
// above anything they could be compared against. Six counts as three: a
// sweep rarely finds six live targets and never keeps them, so three is
// nearer what it actually does.
//
// This is a SCORING cap and nothing else. The engine still strikes every
// target the action has (maxTargets in utils/battle-engine.js), and item
// eligibility still reads the real number (max_targets in data/item_rules.js).
const TARGETS_SCORE_CAP = 3;

// Server copy of calcUnitPower in public/utils.js. Keep the two in step.
function calcUnitPower(unit) {
  const res      = unit.resistances || {};
  const avgRes   = Object.values(res).reduce((s, v) => s + (v || 0), 0) / 6;
  const armor    = unit.armor ?? 0;
  const hp       = unit.max_hp ?? unit.hp ?? 0;
  const hp_num   = typeof hp === 'string' ? parseInt(hp.split('/')[1] || hp) : hp;
  const vitality = ((avgRes + armor) / 2) + hp_num;

  const power      = unit.action_power ?? unit.action?.value ?? 0;
  const targets    = Math.min(unit.targets ?? 1, TARGETS_SCORE_CAP);
  const initiative = unit.initiative ?? 0;
  const dps        = power * (targets / 2) * (1 + initiative / 100);

  return Math.round(vitality + dps);
}

// Built the same way the prep screen builds it: definition, roster max HP, worn
// item, then the engraving.
function rosterUnitPower(def, rosterUnitData, item, engraving) {
  if (!def) return 0;
  let unit = { ...def, hp: rosterUnitData?.max_hp ?? def.hp };
  if (item) unit = applyItemModifiers(unit, item.item_stats);
  if (engraving) unit = applyEngraving(unit, engraving);
  return calcUnitPower(unit);
}

module.exports = { calcUnitPower, rosterUnitPower };
