const assert = require('node:assert/strict');
const test = require('node:test');
const { UNITS } = require('../data/units.js');
const { MERCENARY_BUILDINGS } = require('../data/buildings.js');
const { ITEM_DEFS, applyItemModifiers } = require('../data/items.js');
const { UNIT_ABILITIES } = require('../data/unit_abilities.js');

function findUnit(node, id) {
  for (const value of Object.values(node || {})) {
    if (!value || typeof value !== 'object') continue;
    if (value.id === id) return value;
    const found = findUnit(value, id);
    if (found) return found;
  }
  return null;
}

function findBuilding(node, predicate) {
  if (Array.isArray(node)) {
    return node.find(predicate) || node.map(value => findBuilding(value, predicate)).find(Boolean) || null;
  }
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  return Object.values(node).map(value => findBuilding(value, predicate)).find(Boolean) || null;
}

test('Darkness requires a Caster, adds Knight, and grants Lancing Steel 2', () => {
  const item = ITEM_DEFS.darkness;
  const wearer = { id: 'test-caster', tags: ['Caster'], armor: 30, action_power: 15 };
  const modified = applyItemModifiers(wearer, item);

  assert.equal(item.tag_required, 'Caster');
  assert.equal(item.adds_tag, 'Knight');
  assert.equal(item.passive, 'lancing_steel 2');
  assert.ok(modified.tags.includes('Knight'));
  assert.equal(modified.action_power, 24);
  assert.equal(UNIT_ABILITIES['lancing_steel 1'].params.armor_to_action_power_pct, 20);
  assert.equal(UNIT_ABILITIES['lancing_steel 2'].params.armor_to_action_power_pct, 30);
  assert.equal(UNIT_ABILITIES['lancing_steel 3'].params.armor_to_action_power_pct, 40);
  assert.equal(item.requires.level, 2);
});

test('Metallon Shadowforger is available as the level-four Metallon Invoker upgrade', () => {
  const unit = findUnit(UNITS, 'dm_e1211');
  const invoker = findBuilding(MERCENARY_BUILDINGS, building => building.id === 'cu_metallon_invoker');
  const shadowforger = findBuilding(MERCENARY_BUILDINGS, building => building.unit_id === 'dm_e1211');

  assert.ok(unit);
  assert.equal(unit.name, 'Metallon Shadowforger');
  assert.equal(unit.t, 4);
  assert.ok(invoker.upgrades.includes(shadowforger.id));
  assert.equal(shadowforger.tier, 4);
  assert.equal(shadowforger.label, unit.name);
});
