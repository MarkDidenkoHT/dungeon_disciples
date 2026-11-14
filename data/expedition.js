// ── Expeditions ─────────────────────────────────────────────────────────────
// An embark in an expedition-mode region (REGIONS[].mode in data/embark.js) is a
// small map of rooms instead of a single fight. Design and every decision behind
// these tables: docs/embark-expedition-design.md.
//
// This file is DATA only. The generator that turns it into a map is
// utils/expedition-map.js, and the server state machine lives in routes/index.js.

// The generator has exactly two modes. Levels up to SMALL_MAX_LEVEL get the 3x3
// map that teaches movement; every level after that is 5x5.
const SMALL_MAX_LEVEL = 3;

// Every map guarantees these cells. Whatever is left (`size * size` minus the
// fixed total) is filled from the level's node pool (POOLS below).
const MODES = {
  small: {
    size: 3,
    walls: false,          // small enough to read; walls arrive with 5x5
    fixed: { entrance: 1, goal: 1, empty: 1, exit: 1, fight: 1 },
    goalMinDistance: 4,    // opposite corner of a 3x3
  },
  large: {
    size: 5,
    walls: true,
    fixed: { entrance: 1, goal: 1, empty: 3, exit: 2, fight: 3 },
    goalMinDistance: 6,
    // Share of the walls left by the maze carve that are knocked out again, so
    // the layout has a few loops instead of being a single tree. Low on purpose:
    // corridors keep fog meaningful (see the design doc, §2).
    openExtraWalls: 0.15,
  },
};

function modeForLevel(level) {
  return Number(level) <= SMALL_MAX_LEVEL ? 'small' : 'large';
}

// Node types a level may hold, each from the level it unlocks at (design doc
// §2.2). New types arrive one or two at a time so each can be learned alone.
const NODE_UNLOCKS = [
  { type: 'empty',  from: 1 },
  { type: 'fight',  from: 1 },
  { type: 'camp',   from: 4 },
  { type: 'shrine', from: 5 },
  { type: 'curse',  from: 7 },
  { type: 'event',  from: 7 },
  { type: 'elite',  from: 9 },
];

function unlockedNodeTypes(level) {
  return NODE_UNLOCKS.filter(n => Number(level) >= n.from).map(n => n.type);
}

// Pool weights for the cells left after the fixed ones, by level band: the
// last band whose `from` the level has reached. `min` guarantees at least that
// many of a type on the map (a camp on every torch-lit map).
const POOLS = [
  { from: 1, weights: { fight: 0.5, empty: 0.5 } },
  { from: 4, weights: { fight: 0.3, empty: 0.6, camp: 0.1 }, min: { camp: 1 } },
  { from: 5, weights: { fight: 0.28, empty: 0.47, camp: 0.1, shrine: 0.15 }, min: { camp: 1 } },
  { from: 7, weights: { fight: 0.25, empty: 0.3, camp: 0.1, shrine: 0.12, curse: 0.11, event: 0.12 }, min: { camp: 1 } },
  { from: 9, weights: { fight: 0.2, elite: 0.1, empty: 0.25, camp: 0.1, shrine: 0.12, curse: 0.11, event: 0.12 }, min: { camp: 1 } },
];

function poolForLevel(level) {
  const lvl = Number(level);
  return POOLS.filter(p => lvl >= p.from).pop();
}

// ── The torch (design doc §5.2) ─────────────────────────────────────────────
// Players see it as RESOLVE: the squad's nerve wearing down in hostile ground,
// with stages Steadfast / Wavering / Shaken / Broken (screens/expedition.js).
// `torch` stays the internal name.
// A per-run meter from TORCH.from_level. Every step burns one. A full torch is
// budget_factor × the shortest route to the goal, so a beeline ends in Dim and
// a full clear goes Dark. Stages are read from what is LEFT, as a share of max.
// Their modifiers apply to every fight started at that stage.
const TORCH = {
  from_level:    4,
  budget_factor: 1.5,
  min_max:       6,
  step_cost:     1,
  stages: [
    { id: 'bright', above: 0.5,  mods: {} },
    { id: 'dim',    above: 0.25, mods: { player: { initiative: -3 } } },
    { id: 'dark',   above: 0,    mods: { player: { initiative: -6 },  enemy: { power_pct: 15 } } },
    { id: 'out',    above: -1,   mods: { player: { initiative: -10 }, enemy: { power_pct: 30 } } },
  ],
};

function torchStage(torch) {
  if (!torch || !(torch.max > 0)) return null;
  if (torch.value <= 0) return TORCH.stages.find(s => s.id === 'out');
  const left = torch.value / torch.max;
  return TORCH.stages.find(s => left > s.above);
}

// ── Camps ───────────────────────────────────────────────────────────────────
// Rest is once per camp. Standing on a camp also allows reshuffling the squad.
const CAMP = {
  torch_refuel_pct: 50,   // of the torch's max
  heal_pct:         20,   // of each living unit's max HP
};

// ── Boons and curses (design doc §7) ────────────────────────────────────────
// Every lasting effect is a fight modifier: { player|enemy: { initiative,
// armor, power_pct } } for `fights` fights. `instant` effects happen once, on
// the spot. Names and descriptions are shown to the player.
const BOONS = {
  valor:   { fights: 2, mods: { player: { power_pct: 15 } },
             name: { en: 'Valor', ru: 'Доблесть' },
             desc: { en: '+15% attack power for 2 fights', ru: '+15% к силе атаки на 2 боя' } },
  haste:   { fights: 2, mods: { player: { initiative: 5 } },
             name: { en: 'Haste', ru: 'Стремительность' },
             desc: { en: '+5 initiative for 2 fights', ru: '+5 к инициативе на 2 боя' } },
  aegis:   { fights: 2, mods: { player: { armor: 4 } },
             name: { en: 'Aegis', ru: 'Эгида' },
             desc: { en: '+4 armor for 2 fights', ru: '+4 к броне на 2 боя' } },
  lantern: { instant: { torch_pct: 50 }, needs_torch: true,
             name: { en: 'Rally', ru: 'Сплочение' },
             desc: { en: 'Restore half of the squad\'s resolve', ru: 'Восстановить половину решимости отряда' } },
  mending: { instant: { heal_pct: 25 },
             name: { en: 'Mending', ru: 'Исцеление' },
             desc: { en: 'Living units heal 25% of their max HP', ru: 'Живые бойцы восстанавливают 25% здоровья' } },
  farsight:{ instant: { reveal_all: true },
             name: { en: 'Farsight', ru: 'Ясновидение' },
             desc: { en: 'Reveal every room on the map', ru: 'Открыть все комнаты на карте' } },
};

const CURSES = {
  frailty:  { fights: 2, mods: { player: { power_pct: -15 } },
              name: { en: 'Frailty', ru: 'Слабость' },
              desc: { en: '-15% attack power for 2 fights', ru: '-15% к силе атаки на 2 боя' } },
  torpor:   { fights: 2, mods: { player: { initiative: -5 } },
              name: { en: 'Torpor', ru: 'Оцепенение' },
              desc: { en: '-5 initiative for 2 fights', ru: '-5 к инициативе на 2 боя' } },
  exposure: { fights: 2, mods: { player: { armor: -4 } },
              name: { en: 'Exposure', ru: 'Уязвимость' },
              desc: { en: '-4 armor for 2 fights', ru: '-4 к броне на 2 боя' } },
  gloom:    { instant: { torch_pct: -30 }, needs_torch: true,
              name: { en: 'Dread', ru: 'Ужас' },
              desc: { en: 'The squad loses 30% of its resolve', ru: 'Отряд теряет 30% решимости' } },
  bleeding: { instant: { hurt_pct: 15 },
              name: { en: 'Bleeding', ru: 'Кровотечение' },
              desc: { en: 'Living units lose 15% of their current HP', ru: 'Живые бойцы теряют 15% текущего здоровья' } },
};

// ── Events ──────────────────────────────────────────────────────────────────
// A choice with a catch: accept for what is offered and pay what it costs, or
// decline and walk on. Either answer uses the event up.
const EVENTS = {
  reliquary: {
    accept: { loot_pct: 40, trophy: true, curse: true },
    name: { en: 'Reliquary', ru: 'Реликварий' },
    desc: { en: 'A sealed reliquary. Its treasure is real — so is whatever guards it.',
            ru: 'Запечатанный реликварий. Сокровище настоящее — как и то, что его стережёт.' },
    acceptLabel: { en: 'Take the treasure (gain loot, suffer a curse)', ru: 'Забрать сокровище (добыча и проклятие)' },
  },
  blood_altar: {
    accept: { hurt_pct: 20, boon: true },
    name: { en: 'Blood Altar', ru: 'Кровавый алтарь' },
    desc: { en: 'The altar asks for blood and promises strength in return.',
            ru: 'Алтарь просит крови и обещает силу взамен.' },
    acceptLabel: { en: 'Bleed (lose 20% HP, gain a boon)', ru: 'Пролить кровь (−20% HP, получить благословение)' },
  },
  dark_well: {
    accept: { torch_pct: 40, curse: true }, needs_torch: true,
    name: { en: 'Whispering Well', ru: 'Шепчущий колодец' },
    desc: { en: 'Voices rise from the well, promising courage. Something else listens with them.',
            ru: 'Из колодца поднимаются голоса и обещают отвагу. Вместе с ними слушает что-то ещё.' },
    acceptLabel: { en: 'Listen (resolve +40%, suffer a curse)', ru: 'Прислушаться (решимость +40%, проклятие)' },
  },
};

// ── Elite fights ────────────────────────────────────────────────────────────
// A lineup from a harder band (templates that fit level + lead_min..lead_max),
// with the enemy strengthened through the same modifier slot, and more loot.
const ELITE = {
  lead_min: 2,
  lead_max: 3,
  mods: { enemy: { power_pct: 20, armor: 3 } },
  loot_mult: 2,
};

// ── Secondary fight loot ────────────────────────────────────────────────────
// Placeholder economy (design doc §10.1): a secondary fight pays a share of the
// level's goal reward. Rolled once, when the map is generated, so a room's loot
// is fixed the moment the room exists.
const SECONDARY_LOOT = {
  gold_pct:      25,
  crystal_pct:   25,
  xp_pct:        25,
  // Chance that the room also drops one of the level's own trophies.
  trophy_chance: 0.2,
};

// Leaving from the map without an exit door, or abandoning a fight, pays this
// share of what was banked (design doc §6).
const ABANDON_SHARE = 0.5;

// ── Secondary encounter templates ───────────────────────────────────────────
// Hand-authored like the goal fights, in the same slot format as
// REGION_ENCOUNTERS so the same resolver builds them. Each template can appear
// on levels min..max. A map never uses the same template twice, so the number
// of templates that fit a level caps how many secondary fights it can have.
//
// Cells: 0 1 / 2 3 / 4 5 — even cells are the front column.
//
// Every lineup needs at least as many attackers as supports. Heralds and
// Evangelists only shield and Initiates and Keepers only heal: a room made of
// them cannot hurt the squad and is a slow, pointless grind (a herald + initiate
// room shipped like that once). test/expedition-map.test.js enforces the rule.
const SECONDARY_ENCOUNTERS = {
  crimson_basilica: [
    // ── Levels 1–4 ──
    { id: 'cb_patrol',        min: 1,  max: 3,  enemies: [
      { key: 'crimson_basilica.scarlet_recruit', cell: 0 },
      { key: 'crimson_basilica.initiate',        cell: 1 },
    ] },
    { id: 'cb_watch',         min: 1,  max: 3,  enemies: [
      { key: 'crimson_basilica.aggrails_herald', cell: 0 },
      { key: 'crimson_basilica.crimson_scout',   cell: 1 },
    ] },
    { id: 'cb_recruits',      min: 1,  max: 3,  enemies: [
      { key: 'crimson_basilica.scarlet_recruit', cell: 0 },
      { key: 'crimson_basilica.scarlet_recruit', cell: 4 },
    ] },
    { id: 'cb_scouts',        min: 1,  max: 4,  enemies: [
      { key: 'crimson_basilica.crimson_scout',   cell: 1 },
      { key: 'crimson_basilica.crimson_scout',   cell: 5 },
    ] },
    { id: 'cb_sermon',        min: 2,  max: 4,  enemies: [
      { key: 'crimson_basilica.scarlet_recruit', cell: 0 },
      { key: 'crimson_basilica.aggrails_herald', cell: 2 },
      { key: 'crimson_basilica.crimson_scout',   cell: 3 },
    ] },
    { id: 'cb_vigil',         min: 3,  max: 5,  enemies: [
      { key: 'crimson_basilica.scarlet_recruit', cell: 0 },
      { key: 'crimson_basilica.crimson_scout',   cell: 3 },
      { key: 'crimson_basilica.initiate',        cell: 5 },
    ] },

    // ── Levels 4–9 ──
    { id: 'cb_herald_keeper', min: 4,  max: 6,  enemies: [
      { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
      { key: 'crimson_basilica.exalted_herald',   cell: 2 },
      { key: 'crimson_basilica.crimson_hunter',   cell: 1 },
      { key: 'crimson_basilica.keeper_of_purity', cell: 3 },
    ] },
    { id: 'cb_devoted_pair',  min: 4,  max: 6,  enemies: [
      { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
      { key: 'crimson_basilica.aggrails_devoted', cell: 4 },
      { key: 'crimson_basilica.crimson_scout',    cell: 1 },
    ] },
    { id: 'cb_exorcism',      min: 4,  max: 7,  enemies: [
      { key: 'crimson_basilica.aggrails_exorcist', cell: 2 },
      { key: 'crimson_basilica.crimson_hunter',    cell: 1 },
    ] },
    { id: 'cb_choir',         min: 4,  max: 7,  enemies: [
      { key: 'crimson_basilica.aggrails_devoted',  cell: 0 },
      { key: 'crimson_basilica.aggrails_exorcist', cell: 4 },
      { key: 'crimson_basilica.initiate',          cell: 1 },
    ] },
    { id: 'cb_hunt',          min: 4,  max: 6,  enemies: [
      { key: 'crimson_basilica.scarlet_recruit', cell: 2 },
      { key: 'crimson_basilica.crimson_hunter',  cell: 1 },
      { key: 'crimson_basilica.crimson_hunter',  cell: 5 },
    ] },
    { id: 'cb_cloister',      min: 5,  max: 8,  enemies: [
      { key: 'crimson_basilica.aggrails_devoted',  cell: 0 },
      { key: 'crimson_basilica.aggrails_exorcist', cell: 4 },
      { key: 'crimson_basilica.keeper_of_purity',  cell: 3 },
    ] },
    { id: 'cb_procession',    min: 5,  max: 8,  enemies: [
      { key: 'crimson_basilica.exalted_herald', cell: 0 },
      { key: 'crimson_basilica.crimson_hunter', cell: 3 },
      { key: 'crimson_basilica.crimson_scout',  cell: 5 },
    ] },
    { id: 'cb_champion',      min: 6,  max: 9,  enemies: [
      { key: 'crimson_basilica.aggrails_champion', cell: 2 },
      { key: 'crimson_basilica.keeper_of_purity',  cell: 1 },
    ] },
    { id: 'cb_crusade',       min: 6,  max: 9,  enemies: [
      { key: 'crimson_basilica.aggrails_crusader', cell: 0 },
      { key: 'crimson_basilica.crimson_hunter',    cell: 1 },
      { key: 'crimson_basilica.crimson_hunter',    cell: 5 },
    ] },

    // ── Levels 7–12 ──
    { id: 'cb_evangel',       min: 7,  max: 10, enemies: [
      { key: 'crimson_basilica.aggrails_champion',  cell: 0 },
      { key: 'crimson_basilica.exalted_evangelist', cell: 2 },
      { key: 'crimson_basilica.crimson_hunter',     cell: 1 },
      { key: 'crimson_basilica.high_keeper',        cell: 3 },
    ] },
    { id: 'cb_desecration',   min: 7,  max: 10, enemies: [
      { key: 'crimson_basilica.aggrails_desecrator', cell: 0 },
      { key: 'crimson_basilica.aggrails_crusader',   cell: 4 },
      { key: 'crimson_basilica.crimson_hunter',      cell: 3 },
    ] },
    { id: 'cb_stalked',       min: 7,  max: 10, enemies: [
      { key: 'crimson_basilica.aggrails_champion', cell: 0 },
      { key: 'crimson_basilica.crimson_stalker',   cell: 1 },
      { key: 'crimson_basilica.keeper_of_purity',  cell: 5 },
    ] },
    { id: 'cb_tribunal',      min: 8,  max: 11, enemies: [
      { key: 'crimson_basilica.aggrails_crusader', cell: 0 },
      { key: 'crimson_basilica.aggrails_exorcist', cell: 4 },
      { key: 'crimson_basilica.high_keeper',       cell: 1 },
    ] },
    { id: 'cb_crossfire',     min: 8,  max: 11, enemies: [
      { key: 'crimson_basilica.aggrails_champion', cell: 2 },
      { key: 'crimson_basilica.crimson_stalker',   cell: 1 },
      { key: 'crimson_basilica.crimson_stalker',   cell: 5 },
    ] },
    { id: 'cb_garrison',      min: 9,  max: 12, enemies: [
      { key: 'crimson_basilica.aggrails_desecrator', cell: 0 },
      { key: 'crimson_basilica.aggrails_champion',   cell: 4 },
      { key: 'crimson_basilica.high_keeper',         cell: 3 },
      { key: 'crimson_basilica.crimson_hunter',      cell: 1 },
    ] },
    { id: 'cb_sanctum_guard', min: 9,  max: 12, enemies: [
      { key: 'crimson_basilica.aggrails_crusader', cell: 2 },
      { key: 'crimson_basilica.crimson_stalker',   cell: 1 },
      { key: 'crimson_basilica.high_keeper',       cell: 5 },
    ] },

    // ── Levels 10–15 ──
    { id: 'cb_blasphemy',     min: 10, max: 13, enemies: [
      { key: 'crimson_basilica.aggrails_blasphemer', cell: 2 },
      { key: 'crimson_basilica.high_keeper',         cell: 3 },
    ] },
    { id: 'cb_lions_den',     min: 10, max: 13, enemies: [
      { key: 'crimson_basilica.aggrails_lion',    cell: 0 },
      { key: 'crimson_basilica.crimson_stalker',  cell: 1 },
      { key: 'crimson_basilica.keeper_of_purity', cell: 5 },
    ] },
    { id: 'cb_inquest',       min: 10, max: 14, enemies: [
      { key: 'crimson_basilica.exalted_evangelist',  cell: 0 },
      { key: 'crimson_basilica.aggrails_desecrator', cell: 4 },
      { key: 'crimson_basilica.crimson_stalker',     cell: 3 },
      { key: 'crimson_basilica.high_keeper',         cell: 1 },
    ] },
    { id: 'cb_grand_rite',    min: 11, max: 15, enemies: [
      { key: 'crimson_basilica.aggrails_blasphemer', cell: 0 },
      { key: 'crimson_basilica.aggrails_crusader',   cell: 4 },
      { key: 'crimson_basilica.grand_keeper',        cell: 3 },
    ] },
    { id: 'cb_pride',         min: 11, max: 15, enemies: [
      { key: 'crimson_basilica.aggrails_lion',   cell: 2 },
      { key: 'crimson_basilica.crimson_stalker', cell: 1 },
      { key: 'crimson_basilica.crimson_stalker', cell: 5 },
    ] },
    { id: 'cb_veiled',        min: 12, max: 15, enemies: [
      { key: 'crimson_basilica.aggrails_lion',               cell: 0 },
      { key: 'crimson_basilica.aggrails_blasphemer',         cell: 4 },
      { key: 'crimson_basilica.keeper_of_the_bloodied_veil', cell: 1 },
    ] },
    { id: 'cb_conclave',      min: 12, max: 15, enemies: [
      { key: 'crimson_basilica.aggrails_champion',  cell: 0 },
      { key: 'crimson_basilica.exalted_evangelist', cell: 2 },
      { key: 'crimson_basilica.grand_keeper',       cell: 3 },
      { key: 'crimson_basilica.crimson_stalker',    cell: 1 },
    ] },
    { id: 'cb_last_wall',     min: 13, max: 15, enemies: [
      { key: 'crimson_basilica.aggrails_blasphemer', cell: 2 },
      { key: 'crimson_basilica.aggrails_lion',       cell: 4 },
      { key: 'crimson_basilica.grand_keeper',        cell: 1 },
      { key: 'crimson_basilica.crimson_stalker',     cell: 5 },
    ] },
    { id: 'cb_red_vigil',     min: 13, max: 15, enemies: [
      { key: 'crimson_basilica.aggrails_desecrator',         cell: 0 },
      { key: 'crimson_basilica.aggrails_lion',               cell: 2 },
      { key: 'crimson_basilica.keeper_of_the_bloodied_veil', cell: 3 },
      { key: 'crimson_basilica.high_keeper',                 cell: 5 },
    ] },
  ],
};

function secondaryTemplatesFor(region_id, level) {
  const lvl = Number(level);
  return (SECONDARY_ENCOUNTERS[region_id] || []).filter(t => lvl >= t.min && lvl <= t.max);
}

// Elite rooms draw from a harder band: templates that fit level + lead.
function eliteTemplatesFor(region_id, level) {
  const all = SECONDARY_ENCOUNTERS[region_id] || [];
  // Clamped to the hardest band that exists, so the last levels still have elites.
  const top = Math.max(0, ...all.map(t => t.max));
  const lo = Math.min(Number(level) + ELITE.lead_min, top);
  const hi = Math.max(lo, Number(level) + ELITE.lead_max);
  return all.filter(t => t.max >= lo && t.min <= hi);
}

function getSecondaryTemplate(region_id, templateId) {
  return (SECONDARY_ENCOUNTERS[region_id] || []).find(t => t.id === templateId) || null;
}

export {
  SMALL_MAX_LEVEL, MODES, modeForLevel, NODE_UNLOCKS, unlockedNodeTypes, POOLS, poolForLevel,
  TORCH, torchStage, CAMP, BOONS, CURSES, EVENTS, ELITE, eliteTemplatesFor,
  SECONDARY_LOOT, ABANDON_SHARE, SECONDARY_ENCOUNTERS, secondaryTemplatesFor, getSecondaryTemplate,
};
if (typeof module !== 'undefined') module.exports = {
  SMALL_MAX_LEVEL, MODES, modeForLevel, NODE_UNLOCKS, unlockedNodeTypes, POOLS, poolForLevel,
  TORCH, torchStage, CAMP, BOONS, CURSES, EVENTS, ELITE, eliteTemplatesFor,
  SECONDARY_LOOT, ABANDON_SHARE, SECONDARY_ENCOUNTERS, secondaryTemplatesFor, getSecondaryTemplate,
};
