import { UNITS } from './units.js';

// Faction Colossus: one weekly boss per faction, with a shared HP pool far
// larger than one battle can remove. See docs/daily-activities-design.md.
//
// Every number a tester is likely to ask about lives here: pool size, reset
// time, phases, milestones and payouts. The database holds only the live pool
// and who hit it (sql/colossus.sql).

const COLOSSUS_MAX_HP = 10000;

// Monday 18:00 UTC — 21:00 Moscow, the testers' evening.
const COLOSSUS_RESET = { weekday: 1, hourUtc: 18 };

// The boss is a row unit on the middle row: it spans both lines, so melee and
// ranged units can both reach it from the first round.
const COLOSSUS_CELL = 2;

// Resource the Colossus pays out, banked until Engravings give it a use.
// The name is still open (see the design doc).
const COLOSSUS_CURRENCY = 'Valor';

// Season score for the order factions kill their boss in.
const COLOSSUS_KILL_POINTS = { 1: 3, 2: 2, 3: 1 };

// A phase is picked from the pool's HP when an attempt starts, and holds for
// that whole battle. `below_pct` is inclusive: at exactly 75% the boss is in
// phase 2. Overrides replace fields on the base unit in data/units.js.
const COLOSSUS_PHASES = [
  {
    id: 1, below_pct: 100,
    name: 'Awakened', name_ru: 'Пробуждение',
    description: 'Stone and root stir. It sweeps the whole line.',
    description_ru: 'Камень и корни приходят в движение. Бьёт по всему строю.',
    overrides: { action_power: 14 },
    spells: [],
  },
  {
    id: 2, below_pct: 75,
    name: 'Roots Take Hold', name_ru: 'Корни впиваются',
    description: 'Thorned roots answer every blow, and rot spreads through your line.',
    description_ru: 'Шипастые корни отвечают на каждый удар, а по строю ползёт гниль.',
    overrides: { action_power: 16, passive: ['unbreakable 2', 'stoicism 1', 'thorns 1'] },
    spells: [{ spell_id: 'boss_grave_rot', power: 3 }],
  },
  {
    id: 3, below_pct: 50,
    name: 'The Bells Toll', name_ru: 'Звонят колокола',
    description: 'The cathedral bells ring out a sentence on the weakest.',
    description_ru: 'Колокола собора выносят приговор слабейшему.',
    overrides: { action_power: 19, passive: ['unbreakable 2', 'stoicism 1', 'thorns 1'] },
    spells: [{ spell_id: 'boss_grave_rot', power: 3 }, { spell_id: 'boss_deaths_verdict', power: 4 }],
  },
  {
    id: 4, below_pct: 25,
    name: 'Last Light', name_ru: 'Последний свет',
    description: 'The stone cracks open. Faster, harder, and easier to hurt.',
    description_ru: 'Камень трескается. Быстрее, сильнее — и уязвимее.',
    overrides: { action_power: 23, initiative: 55, armor: 15, passive: ['unbreakable 2', 'stoicism 1', 'thorns 2'] },
    spells: [{ spell_id: 'boss_grave_rot', power: 3 }, { spell_id: 'boss_deaths_verdict', power: 4 }],
  },
];

// Personal damage for the week. `faction_crystal` pays in the player's own
// faction crystal.
const COLOSSUS_MILESTONES = [
  { damage: 300,  rewards: { [COLOSSUS_CURRENCY]: 20, faction_crystal: 10 } },
  { damage: 800,  rewards: { [COLOSSUS_CURRENCY]: 30, faction_crystal: 15 } },
  { damage: 1500, rewards: { [COLOSSUS_CURRENCY]: 50, faction_crystal: 25 } },
  { damage: 2500, rewards: { [COLOSSUS_CURRENCY]: 80, faction_crystal: 40 } },
];

// Paid to everyone who dealt any damage to a boss that was killed.
const COLOSSUS_KILL_REWARD = { [COLOSSUS_CURRENCY]: 100, Gold: 300, faction_crystal: 30 };

const DAY_MS = 24 * 60 * 60 * 1000;

// The week `now` falls in: the date of its reset (the row key) and when it ends.
function colossusWeek(now = Date.now()) {
  const d = new Date(now);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), COLOSSUS_RESET.hourUtc));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() - COLOSSUS_RESET.weekday + 7) % 7));
  if (start.getTime() > now) start.setUTCDate(start.getUTCDate() - 7);
  return {
    weekStart: start.toISOString().slice(0, 10),
    startsAt:  start.getTime(),
    resetsAt:  start.getTime() + 7 * DAY_MS,
  };
}

function colossusPhaseFor(hp, maxHp = COLOSSUS_MAX_HP) {
  const pct = maxHp > 0 ? (hp / maxHp) * 100 : 0;
  return [...COLOSSUS_PHASES].reverse().find(p => pct <= p.below_pct) ?? COLOSSUS_PHASES[0];
}

function colossusBaseDef() {
  return UNITS.enemies?.colossus?.cathedral_colossus ?? null;
}

// The boss as it stands for an attempt: base unit, the phase's changes, and the
// pool's current HP. Same flat shape getEncounter returns.
function buildColossusBoss(hp) {
  const def = colossusBaseDef();
  if (!def) return null;
  const phase = colossusPhaseFor(hp);
  const current = Math.max(0, Math.min(COLOSSUS_MAX_HP, Math.floor(hp)));
  return {
    ...def,
    ...phase.overrides,
    resistances:   { ...(def.resistances || {}) },
    hp:            COLOSSUS_MAX_HP,
    max_hp:        COLOSSUS_MAX_HP,
    current_hp:    current,
    cell:          COLOSSUS_CELL,
    item_id:       null,
    spells:        phase.spells,
    phase:         phase.id,
    // Withering is the attempt's timer: it wears the player's army down, never the boss.
    wither_immune: true,
  };
}

// Milestones passed going from `before` to `after` weekly damage.
function colossusMilestonesCrossed(before, after) {
  return COLOSSUS_MILESTONES.filter(m => before < m.damage && after >= m.damage);
}

// A reward table as grant lines. `factionCrystal` is the player's crystal item name.
function colossusGrants(rewards, factionCrystal) {
  const lines = [];
  for (const [item, amount] of Object.entries(rewards || {})) {
    const name = item === 'faction_crystal' ? factionCrystal : item;
    if (name && amount > 0) lines.push({ item: name, amount });
  }
  return lines;
}

export {
  COLOSSUS_MAX_HP, COLOSSUS_RESET, COLOSSUS_CELL, COLOSSUS_CURRENCY, COLOSSUS_KILL_POINTS,
  COLOSSUS_PHASES, COLOSSUS_MILESTONES, COLOSSUS_KILL_REWARD,
  colossusWeek, colossusPhaseFor, colossusBaseDef, buildColossusBoss, colossusMilestonesCrossed, colossusGrants,
};
if (typeof module !== 'undefined') module.exports = {
  COLOSSUS_MAX_HP, COLOSSUS_RESET, COLOSSUS_CELL, COLOSSUS_CURRENCY, COLOSSUS_KILL_POINTS,
  COLOSSUS_PHASES, COLOSSUS_MILESTONES, COLOSSUS_KILL_REWARD,
  colossusWeek, colossusPhaseFor, colossusBaseDef, buildColossusBoss, colossusMilestonesCrossed, colossusGrants,
};
