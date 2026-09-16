// Long-running quests. Unlike the daily tasks these never roll over with the
// day: progress accumulates across every mode — regions, Colossus, bots, PvP —
// and each quest is a chain of five milestones, each claimed on its own.
//
// Build-time constants read from BOTH sides — `require`d by routes/index.js and
// imported as an ES module by public/daily.js — so the server and the sheet can
// never disagree about targets or payouts.
//
// Progress lives in players.quests (jsonb), shape per quest:
//   { "progress": 1840, "tier": 1, "cycles": 0 }
// `tier` is the index of the NEXT milestone to claim. Claiming the last one
// resets the chain to tier 0 with progress 0 (see sql/005_quests.sql), unless
// the quest is `repeat: false`, which stays finished.
//
// `counter` names what the server bumps. Battle counters are read off the
// engine's tally (see BattleEngine.tallyDamage / applyOnDeathPassives):
//   damage_physical   damage dealt as physical
//   damage_elemental  damage dealt as any of the six schools
//   kills             enemy units slain
//   kills:<Tag>       enemy units slain carrying that tag
// The rest are bumped by the routes that do the thing.
//
// `go` is where the quest's button takes the player:
//   embark | colossus | arena | spells | errands
//
// Rewards: `resources` (Gold), `crystals` (a count of the player's OWN faction
// crystal, resolved server-side), `tokens` (tome_of_knowledge, health_potion).

// The milestone ladder every standard quest climbs, as multiples of its `base`.
const TIER_STEPS = [1, 3, 5, 7.5, 10];

const QUESTS = [
  {
    id:      'physical_damage',
    counter: 'damage_physical',
    base:    1000,
    go:      'embark',
    title:   { en: 'Steel and Sinew',  ru: 'Сталь и мышцы' },
    desc:    { en: 'Deal {n} physical damage in battle.', ru: 'Нанесите {n} физического урона в бою.' },
    rewards: [
      { resources: { Gold: 100 } },
      { tokens:    { health_potion: 1 } },
      { resources: { Gold: 300 } },
      { crystals:  40 },
      { tokens:    { tome_of_knowledge: 1 }, resources: { Gold: 300 } },
    ],
  },
  {
    id:      'elemental_damage',
    counter: 'damage_elemental',
    base:    1000,
    go:      'embark',
    title:   { en: 'Wrath of the Elements', ru: 'Гнев стихий' },
    desc:    { en: 'Deal {n} elemental damage — fire, cold, air, nature, life or death.',
               ru: 'Нанесите {n} стихийного урона — огнём, холодом, воздухом, природой, жизнью или смертью.' },
    rewards: [
      { crystals:  15 },
      { resources: { Gold: 200 } },
      { tokens:    { health_potion: 1 } },
      { crystals:  50 },
      { tokens:    { tome_of_knowledge: 1 }, crystals: 30 },
    ],
  },
  {
    id:      'slay_any',
    counter: 'kills',
    base:    25,
    go:      'embark',
    title:   { en: 'Warlord',          ru: 'Полководец' },
    desc:    { en: 'Slay {n} enemy units.', ru: 'Уничтожьте {n} вражеских бойцов.' },
    rewards: [
      { resources: { Gold: 150 } },
      { crystals:  25 },
      { tokens:    { health_potion: 2 } },
      { resources: { Gold: 500 } },
      { tokens:    { tome_of_knowledge: 1 }, crystals: 40 },
    ],
  },
  {
    id:      'slay_demons',
    counter: 'kills:Demon',
    base:    10,
    go:      'embark',
    title:   { en: 'Demonbane',        ru: 'Гроза демонов' },
    desc:    { en: 'Slay {n} Demons.', ru: 'Уничтожьте {n} демонов.' },
    rewards: [
      { tokens:    { health_potion: 1 } },
      { resources: { Gold: 250 } },
      { crystals:  35 },
      { tokens:    { health_potion: 2 } },
      { tokens:    { tome_of_knowledge: 1 }, resources: { Gold: 400 } },
    ],
  },
  {
    id:      'slay_knights',
    counter: 'kills:Knight',
    base:    10,
    go:      'embark',
    title:   { en: 'Breaker of Oaths', ru: 'Сокрушитель клятв' },
    desc:    { en: 'Slay {n} Knights.', ru: 'Уничтожьте {n} рыцарей.' },
    rewards: [
      { resources: { Gold: 150 } },
      { tokens:    { health_potion: 1 } },
      { crystals:  35 },
      { resources: { Gold: 450 } },
      { tokens:    { tome_of_knowledge: 1 }, crystals: 40 },
    ],
  },
  {
    id:      'slay_holy',
    counter: 'kills:Holy',
    base:    10,
    go:      'embark',
    title:   { en: 'Heretic',          ru: 'Еретик' },
    desc:    { en: 'Slay {n} Holy units.', ru: 'Уничтожьте {n} святых бойцов.' },
    rewards: [
      { crystals:  15 },
      { resources: { Gold: 250 } },
      { tokens:    { health_potion: 2 } },
      { crystals:  50 },
      { tokens:    { tome_of_knowledge: 1 }, resources: { Gold: 400 } },
    ],
  },
  {
    id:      'battles_won',
    counter: 'battles_won',
    base:    5,
    go:      'embark',
    title:   { en: 'Undefeated',       ru: 'Непобедимый' },
    desc:    { en: 'Win {n} battles in any mode.', ru: 'Одержите {n} побед в любом режиме.' },
    rewards: [
      { resources: { Gold: 200 } },
      { crystals:  30 },
      { tokens:    { health_potion: 2 } },
      { resources: { Gold: 600 } },
      { tokens:    { tome_of_knowledge: 2 } },
    ],
  },
  {
    id:      'colossus_damage',
    counter: 'colossus_damage',
    base:    1000,
    go:      'colossus',
    title:   { en: 'Giant Slayer',     ru: 'Убийца гигантов' },
    desc:    { en: 'Deal {n} damage to the Colossus.', ru: 'Нанесите Колоссу {n} урона.' },
    rewards: [
      { crystals:  25 },
      { resources: { Gold: 300 } },
      { tokens:    { health_potion: 2 } },
      { crystals:  60 },
      { tokens:    { tome_of_knowledge: 2 }, resources: { Gold: 500 } },
    ],
  },
  {
    id:      'pvp_matches',
    counter: 'pvp_matches',
    base:    3,
    go:      'arena',
    title:   { en: 'Duelist',          ru: 'Дуэлянт' },
    desc:    { en: 'Fight {n} quick matches, win or lose.', ru: 'Проведите {n} быстрых боёв — победа или поражение.' },
    rewards: [
      { resources: { Gold: 150 } },
      { crystals:  20 },
      { tokens:    { health_potion: 1 } },
      { resources: { Gold: 400 } },
      { tokens:    { tome_of_knowledge: 1 }, crystals: 30 },
    ],
  },
  {
    id:      'errands_sent',
    counter: 'errands',
    base:    3,
    go:      'errands',
    title:   { en: 'Many Hands',       ru: 'Много рук' },
    desc:    { en: 'Send units on {n} errands.', ru: 'Отправьте бойцов на {n} поручений.' },
    rewards: [
      { resources: { Gold: 100 } },
      { tokens:    { health_potion: 1 } },
      { crystals:  30 },
      { resources: { Gold: 350 } },
      { tokens:    { tome_of_knowledge: 1 } },
    ],
  },
  // A faction has a fixed number of spells, so this ladder is spelled out rather
  // than scaled, and it does not restart: there would be nothing left to learn.
  {
    id:      'learn_spells',
    counter: 'spells_learned',
    tiers:   [1, 2, 3, 4, 5],
    repeat:  false,
    go:      'spells',
    title:   { en: 'Scholar of the Arcane', ru: 'Знаток тайного' },
    desc:    { en: 'Research {n} new spells in the Spell Tome.', ru: 'Изучите {n} новых заклинаний в Книге заклинаний.' },
    rewards: [
      { crystals:  20 },
      { resources: { Gold: 200 } },
      { tokens:    { health_potion: 1 } },
      { crystals:  50 },
      { tokens:    { tome_of_knowledge: 2 } },
    ],
  },
];

function questTiers(quest) {
  return quest.tiers || TIER_STEPS.map(m => Math.round(quest.base * m));
}

const QUESTS_BY_ID = Object.fromEntries(QUESTS.map(q => [q.id, q]));

export { QUESTS, QUESTS_BY_ID, TIER_STEPS, questTiers };
if (typeof module !== 'undefined') {
  module.exports = { QUESTS, QUESTS_BY_ID, TIER_STEPS, questTiers };
}
