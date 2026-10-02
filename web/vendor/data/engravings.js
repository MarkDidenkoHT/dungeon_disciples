import { applyItemModifiers, STAT_MOD_FLOORS } from './items.js';
import { UNIT_ABILITIES } from './unit_abilities.js';

// Engravings (Гравировки): permanent, small stat changes on one unit.
// A combo is three stats; the player marks ONE of them negative and the other two
// positive. Magnitudes come from the stat, never from the player — the negative is
// worth about twice its positive, so the sacrifice pays for the pair.
//
// Stored on the roster row as { combo, minus }. The numbers are read from here every
// time, so retuning these values retunes every engraving already in the game.

const ENGRAVING_CURRENCY = 'Valor';

// The second half of the price, and the one that cannot be farmed: tokens come
// from placing in the Crown Tourney (3 / 2 / 1 for the top three), so an epic is
// won rather than saved up for.
const ENGRAVING_TOKEN = 'engraving_token';

// Tiers multiply the whole triangle: an epic is three times an uncommon, both
// ways up and down. Valor is the bulk of the price — a strong player earns
// roughly 280 a week from the Colossus — and tokens are the gate.
const ENGRAVING_TIERS = [
  { id: 'uncommon', name: 'Uncommon', name_ru: 'Необычная', steps: 1, cost: 250,  tokens: 3 },
  { id: 'rare',     name: 'Rare',     name_ru: 'Редкая',    steps: 2, cost: 750,  tokens: 6 },
  { id: 'epic',     name: 'Epic',     name_ru: 'Эпическая', steps: 3, cost: 2000, tokens: 10 },
];

function getEngravingTier(id) {
  return ENGRAVING_TIERS.find(t => t.id === id) ?? null;
}

function engravingCost(tierId) {
  return getEngravingTier(tierId)?.cost ?? 0;
}

function engravingTokenCost(tierId) {
  return getEngravingTier(tierId)?.tokens ?? 0;
}

// The third of the price, and the reason gold exists after the castle is built.
// Every other gold sink in the game is one-time — the barracks, the hall
// upgrades, a craft gated by trophies — so gold died exactly when its income
// peaked. Engraving is the one thing a player is never finished with.
//
// Derived from the Valor price rather than written per tier, so retuning a tier
// retunes both halves together and they cannot drift.
const ENGRAVING_GOLD_RATIO = 0.5;

function engravingGoldCost(tierId) {
  return Math.round(engravingCost(tierId) * ENGRAVING_GOLD_RATIO);
}

// The whole bill, shaped for spendResources.
function engravingBill(tierId) {
  const bill = {};
  const valor = engravingCost(tierId);
  const gold = engravingGoldCost(tierId);
  const tokens = engravingTokenCost(tierId);
  if (valor)  bill[ENGRAVING_CURRENCY] = valor;
  if (gold)   bill.Gold = gold;
  if (tokens) bill[ENGRAVING_TOKEN] = tokens;
  return bill;
}

// One point of Power is worth 1 Initiative, 2 Armor, 2 HP or 2 Resist. `step` is
// what one point moves the stat by, the same size whichever way it goes.
const ENGRAVING_STATS = {
  hp:            { key: 'hp',            name: 'HP',         name_ru: 'ОЗ',            step: 2 },
  armor:         { key: 'armor',         name: 'Armor',      name_ru: 'Броня',         step: 2 },
  initiative:    { key: 'initiative',    name: 'Initiative', name_ru: 'Инициатива',    step: 1 },
  action_power:  { key: 'action_power',  name: 'Power',      name_ru: 'Сила',          step: 1 },
  life_resist:   { key: 'life_resist',   name: 'Life res.',  name_ru: 'Защ. от жизни',    step: 2 },
  death_resist:  { key: 'death_resist',  name: 'Death res.', name_ru: 'Защ. от смерти',   step: 2 },
  fire_resist:   { key: 'fire_resist',   name: 'Fire res.',  name_ru: 'Защ. от огня',     step: 2 },
  cold_resist:   { key: 'cold_resist',   name: 'Cold res.',  name_ru: 'Защ. от холода',   step: 2 },
  air_resist:    { key: 'air_resist',    name: 'Air res.',   name_ru: 'Защ. от воздуха',  step: 2 },
  nature_resist: { key: 'nature_resist', name: 'Nature res.',name_ru: 'Защ. от природы',  step: 2 },
};

const ENGRAVING_COMBOS = [
  { id: 'bulwark',     name: 'Bulwark',      name_ru: 'Оплот',        stats: ['life_resist', 'armor', 'action_power'] }, 
  { id: 'duelist',     name: 'Duelist',      name_ru: 'Дуэлянт',      stats: ['action_power', 'initiative', 'hp'] },     
  { id: 'gravewatch',    name: 'Gravewatch',     name_ru: 'Могильный Дозор', stats: ['death_resist', 'armor', 'hp'] },   
  { id: 'emberward',   name: 'Emberward',    name_ru: 'Страж Углей', stats: ['fire_resist', 'armor', 'initiative'] },    
  { id: 'rimeward',    name: 'Rimeward',     name_ru: 'Страж Инея',  stats: ['cold_resist', 'hp', 'action_power'] },     
  { id: 'windrunner',  name: 'Windrunner',   name_ru: 'Бег Ветра',    stats: ['air_resist', 'initiative', 'armor'] },
  { id: 'grovebound',  name: 'Grovebound',   name_ru: 'Узы Рощи',     stats: ['nature_resist', 'hp', 'initiative'] },    

  // The eighth, and the only one that does not touch a stat. Harmony moves a
  // RANK: one of the unit's own passives goes up one, another goes down one.
  // `tiers` narrows the tier row to Epic — a rank is a rank, there is no half
  // of one to sell cheaper — and `kind` is what every branch below switches on.
  { id: 'harmony', name: 'Harmony', name_ru: 'Гармония', kind: 'passive', tiers: ['epic'] },
];

function getEngravingCombo(id) {
  return ENGRAVING_COMBOS.find(c => c.id === id) ?? null;
}

// 'stat' unless a combo says otherwise, so the seven triangles need no field.
function comboKind(combo) {
  return combo?.kind ?? 'stat';
}

// The tiers a combo may be bought at — all of them unless it names a subset.
function comboTiers(combo) {
  const only = combo?.tiers;
  return only ? ENGRAVING_TIERS.filter(t => only.includes(t.id)) : ENGRAVING_TIERS;
}

// ── Harmony: passives by rank ──────────────────────────────────────────────
// A passive key is '<family> <rank>' and nothing else knows that convention, so
// it is taken apart here. Ranks are contiguous from 1 in data/unit_abilities.js,
// which is what makes ±1 always land on a key that exists.
function passiveFamily(key) {
  return String(key || '').replace(/\s+\d+$/, '');
}

function passiveRank(key) {
  const m = /\s(\d+)$/.exec(String(key || ''));
  return m ? Number(m[1]) : (key ? 1 : 0);
}

function passiveKeyAt(family, rank) {
  return `${family} ${rank}`;
}

// The highest rank each passive family is written to. Built once from the
// ability table, so adding a rank 3 to a family raises its ceiling everywhere
// without a second list to keep in step. Families with one rank by design —
// Clear Mind, and sixteen others — simply never appear on the "raise" side.
const PASSIVE_MAX_RANK = (() => {
  const out = {};
  for (const [key, def] of Object.entries(UNIT_ABILITIES)) {
    if (def?.type !== 'passive') continue;
    const family = passiveFamily(key);
    out[family] = Math.max(out[family] ?? 0, def.rank ?? passiveRank(key));
  }
  return out;
})();

function maxPassiveRank(family) {
  return PASSIVE_MAX_RANK[family] ?? 0;
}

// The passives the unit owns ITSELF — never the one its item lends it.
// applyItemModifiers parks the pre-item list in native_passive, so reading that
// first is what keeps an engraving from depending on what is currently worn.
function nativePassiveKeys(unitData) {
  const src = unitData?.native_passive ?? unitData?.passive;
  const list = Array.isArray(src) ? src : (src ? [src] : []);
  const seen = new Set();
  return list.filter(key => {
    if (!key || seen.has(passiveFamily(key))) return false;
    seen.add(passiveFamily(key));
    return true;
  });
}

// { up: [key], down: [key] } — which of a unit's own passives Harmony can move,
// and in which direction. A family at its last rank cannot rise, and one at
// rank 1 cannot fall, because falling out of rank 1 would delete the passive.
function harmonyOptions(unitData) {
  const keys = nativePassiveKeys(unitData).filter(k => UNIT_ABILITIES[k]?.type === 'passive');
  return {
    up:   keys.filter(k => passiveRank(k) < maxPassiveRank(passiveFamily(k))),
    down: keys.filter(k => passiveRank(k) > 1),
  };
}

// The key a unit currently holds for a family, or null if it holds none.
function currentPassiveKey(unitData, family) {
  return nativePassiveKeys(unitData).find(k => passiveFamily(k) === family) ?? null;
}

// Shape-only: everything checkable without knowing the unit.
function checkHarmony(engraving, tier) {
  const up   = String(engraving.up   || '');
  const down = String(engraving.down || '');
  if (!up || !down)  return 'Harmony needs one passive to raise and one to lower';
  if (up === down)   return 'A passive cannot rise and fall at once';
  if (!maxPassiveRank(up))   return `Unknown passive "${up}"`;
  if (!maxPassiveRank(down)) return `Unknown passive "${down}"`;
  if (tier.id !== 'epic')    return 'Harmony is only engraved as an Epic';
  return null;
}

// Against the unit as it stands: it has to own both passives, the one going up
// has to have somewhere to go, and the one coming down has to be able to afford
// the rank.
function checkHarmonyForUnit(unitData, engraving) {
  const upKey   = currentPassiveKey(unitData, engraving.up);
  const downKey = currentPassiveKey(unitData, engraving.down);
  const label = key => UNIT_ABILITIES[key]?.name || key;
  if (!upKey)   return `This unit does not have ${engraving.up}`;
  if (!downKey) return `This unit does not have ${engraving.down}`;
  if (passiveRank(upKey) >= maxPassiveRank(engraving.up)) {
    return `${label(upKey)} is already at its highest rank`;
  }
  if (passiveRank(downKey) <= 1) {
    return `${label(downKey)} is rank 1 — lowering it would remove it`;
  }
  return null;
}

// [{ family, from, to, fromKey, toKey, name, name_ru }] — the rise first, the
// fall last, mirroring engravingValues. Needs the unit, because a rank change
// only means something against the rank the unit is holding.
function harmonyChanges(unitData, engraving) {
  const combo = getEngravingCombo(engraving?.combo);
  if (!combo || comboKind(combo) !== 'passive') return [];
  if (checkEngraving(engraving) || checkHarmonyForUnit(unitData, engraving)) return [];
  return [[engraving.up, 1], [engraving.down, -1]].map(([family, dir]) => {
    const fromKey = currentPassiveKey(unitData, family);
    const to = passiveRank(fromKey) + dir;
    const toKey = passiveKeyAt(family, to);
    const def = UNIT_ABILITIES[toKey] || UNIT_ABILITIES[fromKey];
    return {
      family, dir, fromKey, toKey,
      from: passiveRank(fromKey), to,
      name: def?.name || family, name_ru: def?.name_ru || def?.name || family,
    };
  });
}

// Rewrites the unit's own passive keys one rank each way. The item's passive is
// left exactly where applyItemModifiers appended it: Harmony is bought against
// what the unit owns, so changing the item can never change what it did.
function applyHarmony(unitData, engraving) {
  const changes = harmonyChanges(unitData, engraving);
  if (!changes.length) return unitData;

  const shift = {};
  for (const c of changes) shift[c.family] = c.toKey;

  const native = nativePassiveKeys(unitData);
  const moved  = native.map(key => shift[passiveFamily(key)] ?? key);

  // Whatever sat after the native block is the item's, and it stays untouched.
  let passive = unitData.passive;
  if (Array.isArray(passive)) passive = [...moved, ...passive.slice(native.length)];
  else                        passive = moved.length === 1 ? moved[0] : moved;

  const wasArray = Array.isArray(unitData.native_passive ?? unitData.passive);
  return {
    ...unitData,
    passive,
    native_passive: wasArray || moved.length !== 1 ? moved : moved[0],
  };
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
  if (!comboTiers(combo).some(t => t.id === tier.id)) {
    return `${combo.name} cannot be engraved as ${tier.name}`;
  }

  // Harmony spends no stat points: it is a rank up and a rank down, checked
  // whole against the unit in checkEngravingForUnit.
  if (comboKind(combo) === 'passive') return checkHarmony(engraving, tier);

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

  if (comboKind(getEngravingCombo(engraving.combo)) === 'passive') {
    return checkHarmonyForUnit(unitData, engraving);
  }

  for (const [stat, points] of Object.entries(engraving.minus || {})) {
    const def = ENGRAVING_STATS[stat];
    const cost = def.step * points;
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

// What one point moves a stat by — the same size up or down.
function engravingStep(stat, negative) {
  const def = ENGRAVING_STATS[stat];
  if (!def) return 0;
  return negative ? -def.step : def.step;
}

// [{ stat, key, value, points, name, name_ru }] — the gains first, the costs last.
function engravingValues(engraving) {
  const combo = getEngravingCombo(engraving?.combo);
  if (!combo || comboKind(combo) === 'passive' || checkEngraving(engraving)) return [];
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
  // A Harmony whose passives the unit no longer has — a branch was taken that
  // dropped one, or pushed it to its last rank — simply does nothing. It stays
  // on the row, greyed on the engraving page, waiting to be replaced.
  if (comboKind(getEngravingCombo(engraving.combo)) === 'passive') {
    return applyHarmony(unitData, engraving);
  }
  const stat_mods = engravingStatMods(engraving);
  if (!Object.keys(stat_mods).length) return unitData;
  return applyItemModifiers(unitData, { stat_mods });
}

export {
  ENGRAVING_CURRENCY, ENGRAVING_TOKEN, ENGRAVING_TIERS, ENGRAVING_STATS, ENGRAVING_COMBOS,
  getEngravingCombo, comboKind, comboTiers, getEngravingTier, engravingCost, engravingTokenCost, engravingGoldCost, engravingBill, engravingStep, engravingPoints,
  checkEngraving, checkEngravingForUnit, engravingValues, engravingStatMods, applyEngraving,
  passiveFamily, passiveRank, maxPassiveRank, nativePassiveKeys, harmonyOptions, currentPassiveKey, harmonyChanges,
};
if (typeof module !== 'undefined') module.exports = {
  ENGRAVING_CURRENCY, ENGRAVING_TOKEN, ENGRAVING_TIERS, ENGRAVING_STATS, ENGRAVING_COMBOS,
  getEngravingCombo, comboKind, comboTiers, getEngravingTier, engravingCost, engravingTokenCost, engravingGoldCost, engravingBill, engravingStep, engravingPoints,
  checkEngraving, checkEngravingForUnit, engravingValues, engravingStatMods, applyEngraving,
  passiveFamily, passiveRank, maxPassiveRank, nativePassiveKeys, harmonyOptions, currentPassiveKey, harmonyChanges,
};
