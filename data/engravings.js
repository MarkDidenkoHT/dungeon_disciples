import { applyItemModifiers, STAT_MOD_FLOORS } from './items.js';

// Engravings (Гравировки): permanent, small stat changes on one unit.
// A combo is three stats; the player marks ONE of them negative and the other two
// positive. Magnitudes come from the stat, never from the player — the negative is
// worth about twice its positive, so the sacrifice pays for the pair.
//
// Stored on the roster row as { combo, minus }. The numbers are read from here every
// time, so retuning these values retunes every engraving already in the game.

const ENGRAVING_CURRENCY = 'Valor';

// Tiers multiply the whole triangle: an epic is three times an uncommon, both
// ways up and down. Costs are meant to be an endgame goal — a strong player
// earns roughly 280 Valor a week from the Colossus, so uncommon is about a
// week, rare about three, epic about seven.
const ENGRAVING_TIERS = [
  { id: 'uncommon', name: 'Uncommon', name_ru: 'Необычная', steps: 1, cost: 250 },
  { id: 'rare',     name: 'Rare',     name_ru: 'Редкая',    steps: 2, cost: 750 },
  { id: 'epic',     name: 'Epic',     name_ru: 'Эпическая', steps: 3, cost: 2000 },
];

function getEngravingTier(id) {
  return ENGRAVING_TIERS.find(t => t.id === id) ?? null;
}

function engravingCost(tierId) {
  return getEngravingTier(tierId)?.cost ?? 0;
}

// One point of Power is worth 1 Initiative, 2 Armor, 2 HP or 2 Resist, so a
// stat's plus follows that scale and its minus is twice its plus.
const ENGRAVING_STATS = {
  hp:            { key: 'hp',            name: 'HP',         name_ru: 'ОЗ',            plus: 2, minus: 4 },
  armor:         { key: 'armor',         name: 'Armor',      name_ru: 'Броня',         plus: 2, minus: 4 },
  initiative:    { key: 'initiative',    name: 'Initiative', name_ru: 'Инициатива',    plus: 1, minus: 2 },
  action_power:  { key: 'action_power',  name: 'Power',      name_ru: 'Сила',          plus: 1, minus: 2 },
  life_resist:   { key: 'life_resist',   name: 'Life res.',  name_ru: 'Защ. жизни',    plus: 2, minus: 4 },
  death_resist:  { key: 'death_resist',  name: 'Death res.', name_ru: 'Защ. смерти',   plus: 2, minus: 4 },
  fire_resist:   { key: 'fire_resist',   name: 'Fire res.',  name_ru: 'Защ. огня',     plus: 2, minus: 4 },
  cold_resist:   { key: 'cold_resist',   name: 'Cold res.',  name_ru: 'Защ. холода',   plus: 2, minus: 4 },
  air_resist:    { key: 'air_resist',    name: 'Air res.',   name_ru: 'Защ. воздуха',  plus: 2, minus: 4 },
  nature_resist: { key: 'nature_resist', name: 'Nature res.',name_ru: 'Защ. природы',  plus: 2, minus: 4 },
};

const ENGRAVING_COMBOS = [
  { id: 'bulwark',     name: 'Bulwark',      name_ru: 'Оплот',        stats: ['hp', 'armor', 'initiative'] },
  { id: 'duelist',     name: 'Duelist',      name_ru: 'Дуэлянт',      stats: ['action_power', 'initiative', 'hp'] },
  { id: 'zealot',      name: 'Zealot',       name_ru: 'Фанатик',      stats: ['action_power', 'hp', 'life_resist'] },
  { id: 'ironhide',    name: 'Ironhide',     name_ru: 'Железная шкура', stats: ['armor', 'death_resist', 'action_power'] },
  { id: 'emberward',   name: 'Emberward',    name_ru: 'Стража углей', stats: ['fire_resist', 'armor', 'initiative'] },
  { id: 'rimeward',    name: 'Rimeward',     name_ru: 'Стража инея',  stats: ['cold_resist', 'hp', 'action_power'] },
  { id: 'windrunner',  name: 'Windrunner',   name_ru: 'Бег ветра',    stats: ['air_resist', 'initiative', 'armor'] },
  { id: 'grovebound',  name: 'Grovebound',   name_ru: 'Узы рощи',     stats: ['nature_resist', 'hp', 'armor'] },
  { id: 'gravewatch',  name: 'Gravewatch',   name_ru: 'Могильный дозор', stats: ['death_resist', 'life_resist', 'initiative'] },
  { id: 'thaumaturge', name: 'Thaumaturge',  name_ru: 'Тауматург',    stats: ['action_power', 'fire_resist', 'air_resist'] },
];

function getEngravingCombo(id) {
  return ENGRAVING_COMBOS.find(c => c.id === id) ?? null;
}

// An engraving is { combo, tier, plus: { stat: points }, minus: { stat: points } }.
// A tier hands out points: every point spent on + has to be paid for with a
// point of − on a DIFFERENT stat, so the two sides always balance.
function engravingPoints(map) {
  return Object.values(map || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

// null when the engraving is usable, else why not.
function checkEngraving(engraving) {
  if (!engraving) return null;
  const combo = getEngravingCombo(engraving.combo);
  if (!combo) return `Unknown combo "${engraving.combo}"`;
  const tier = getEngravingTier(engraving.tier);
  if (!tier) return `Unknown tier "${engraving.tier}"`;

  const plus  = engraving.plus  || {};
  const minus = engraving.minus || {};
  for (const [stat, points] of [...Object.entries(plus), ...Object.entries(minus)]) {
    if (!combo.stats.includes(stat)) return `"${stat}" is not part of ${combo.id}`;
    if (!ENGRAVING_STATS[stat])      return `Unknown stat "${stat}"`;
    if (!Number.isInteger(points) || points < 1) return `"${stat}" has no whole points`;
  }
  for (const stat of Object.keys(plus)) {
    if (minus[stat]) return `${ENGRAVING_STATS[stat].name} cannot rise and fall at once`;
  }

  const up = engravingPoints(plus);
  const down = engravingPoints(minus);
  if (up !== tier.steps)   return `${tier.name} spends ${tier.steps} point${tier.steps > 1 ? 's' : ''}, this spends ${up}`;
  if (down !== tier.steps) return `${up} point${up > 1 ? 's' : ''} up needs ${up} down, this pays ${down}`;
  return null;
}

// Stats floor at STAT_MOD_FLOORS, so a penalty a unit cannot afford is a free
// engraving: -10 fire resist on a unit with 0 fire resist costs it nothing. The
// sacrifice has to land in full, on the unit as it stands (items included).
// null when it does, else why not.
function checkEngravingForUnit(unitData, engraving) {
  const shape = checkEngraving(engraving);
  if (shape) return shape;
  if (!unitData || !engraving) return null;

  for (const [stat, points] of Object.entries(engraving.minus || {})) {
    const def = ENGRAVING_STATS[stat];
    const cost = def.minus * points;
    const resist = def.key.match(/^(air|fire|nature|cold|life|death)_resist$/);
    const current = resist
      ? (unitData.resistances?.[resist[1]] ?? 0)
      : def.key === 'hp'
        ? (unitData.max_hp ?? unitData.hp ?? 0)
        : (unitData[def.key] ?? 0);
    const floor = resist ? STAT_MOD_FLOORS.resist : (STAT_MOD_FLOORS[def.key] ?? 0);
    if (current - cost < floor) return `${def.name} is ${current}; this engraving takes ${cost}`;
  }
  return null;
}

// What one point moves a stat by. A point of − is worth twice a point of +,
// which is what makes the sacrifice real.
function engravingStep(stat, negative) {
  const def = ENGRAVING_STATS[stat];
  if (!def) return 0;
  return negative ? -def.minus : def.plus;
}

// [{ stat, key, value, points, name, name_ru }] — the gains first, the costs last.
function engravingValues(engraving) {
  const combo = getEngravingCombo(engraving?.combo);
  if (!combo || checkEngraving(engraving)) return [];
  const out = [];
  for (const [stat, points] of Object.entries(engraving.plus || {})) {
    const def = ENGRAVING_STATS[stat];
    out.push({ stat, key: def.key, name: def.name, name_ru: def.name_ru, points, value: engravingStep(stat, false) * points });
  }
  for (const [stat, points] of Object.entries(engraving.minus || {})) {
    const def = ENGRAVING_STATS[stat];
    out.push({ stat, key: def.key, name: def.name, name_ru: def.name_ru, points, value: engravingStep(stat, true) * points });
  }
  return out.sort((a, b) => (a.value < 0) - (b.value < 0));
}

// The same shape an item's stat_mods take, so the engine path is shared.
function engravingStatMods(engraving) {
  const mods = {};
  for (const v of engravingValues(engraving)) mods[v.key] = (mods[v.key] || 0) + v.value;
  return mods;
}

// Applied like an item: the floors that keep a penalty from breaking a unit live there.
function applyEngraving(unitData, engraving) {
  if (!unitData || !engraving || checkEngraving(engraving)) return unitData;
  const stat_mods = engravingStatMods(engraving);
  if (!Object.keys(stat_mods).length) return unitData;
  return applyItemModifiers(unitData, { stat_mods });
}

export {
  ENGRAVING_CURRENCY, ENGRAVING_TIERS, ENGRAVING_STATS, ENGRAVING_COMBOS,
  getEngravingCombo, getEngravingTier, engravingCost, engravingStep, engravingPoints,
  checkEngraving, checkEngravingForUnit, engravingValues, engravingStatMods, applyEngraving,
};
if (typeof module !== 'undefined') module.exports = {
  ENGRAVING_CURRENCY, ENGRAVING_TIERS, ENGRAVING_STATS, ENGRAVING_COMBOS,
  getEngravingCombo, getEngravingTier, engravingCost, engravingStep, engravingPoints,
  checkEngraving, checkEngravingForUnit, engravingValues, engravingStatMods, applyEngraving,
};
