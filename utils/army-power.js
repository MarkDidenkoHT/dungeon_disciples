const { applyItemModifiers } = require('../data/items');

// Server copy of calcUnitPower in public/utils.js. Keep the two in step.
function calcUnitPower(unit) {
  const res      = unit.resistances || {};
  const avgRes   = Object.values(res).reduce((s, v) => s + (v || 0), 0) / 6;
  const armor    = unit.armor ?? 0;
  const hp       = unit.max_hp ?? unit.hp ?? 0;
  const hp_num   = typeof hp === 'string' ? parseInt(hp.split('/')[1] || hp) : hp;
  const vitality = ((avgRes + armor) / 2) + hp_num;

  const power      = unit.action_power ?? unit.action?.value ?? 0;
  const targets    = unit.targets ?? 1;
  const initiative = unit.initiative ?? 0;
  const dps        = power * (targets / 2) * (1 + initiative / 100);

  return Math.round(vitality + dps);
}

// Built the same way the prep screen builds it: definition, roster max HP, worn item.
function rosterUnitPower(def, rosterUnitData, item) {
  if (!def) return 0;
  const base = { ...def, hp: rosterUnitData?.max_hp ?? def.hp };
  return calcUnitPower(item ? applyItemModifiers(base, item.item_stats) : base);
}

module.exports = { calcUnitPower, rosterUnitPower };
