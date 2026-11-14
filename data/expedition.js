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
// fixed total) is filled from the level's node pool below.
const MODES = {
  small: {
    size: 3,
    walls: false,          // small enough to read; walls arrive with 5x5
    fixed: { entrance: 1, goal: 1, empty: 1, exit: 1, fight: 1 },
    // Pool weights for the leftover cells.
    pool:  { fight: 0.5, empty: 0.5 },
    goalMinDistance: 4,    // opposite corner of a 3x3
  },
  large: {
    size: 5,
    walls: true,
    fixed: { entrance: 1, goal: 1, empty: 3, exit: 2, fight: 3 },
    pool:  { fight: 0.3, empty: 0.7 },
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

// Node types a level's pool may draw. Milestone 1 ships only empty cells and
// secondary fights; camps, shrines, curses and elites join here as they are
// built (design doc §2.2), each from the level it unlocks at.
const NODE_UNLOCKS = [
  { type: 'empty', from: 1 },
  { type: 'fight', from: 1 },
];

function unlockedNodeTypes(level) {
  return NODE_UNLOCKS.filter(n => Number(level) >= n.from).map(n => n.type);
}

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
      { key: 'crimson_basilica.aggrails_herald', cell: 2 },
      { key: 'crimson_basilica.initiate',        cell: 3 },
    ] },
    { id: 'cb_vigil',         min: 3,  max: 5,  enemies: [
      { key: 'crimson_basilica.scarlet_recruit', cell: 0 },
      { key: 'crimson_basilica.crimson_scout',   cell: 3 },
      { key: 'crimson_basilica.initiate',        cell: 5 },
    ] },

    // ── Levels 4–9 ──
    { id: 'cb_herald_keeper', min: 4,  max: 6,  enemies: [
      { key: 'crimson_basilica.exalted_herald',   cell: 0 },
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
      { key: 'crimson_basilica.exalted_herald', cell: 2 },
      { key: 'crimson_basilica.initiate',       cell: 1 },
      { key: 'crimson_basilica.initiate',       cell: 5 },
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
      { key: 'crimson_basilica.initiate',       cell: 5 },
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
      { key: 'crimson_basilica.exalted_evangelist', cell: 2 },
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
      { key: 'crimson_basilica.exalted_evangelist', cell: 0 },
      { key: 'crimson_basilica.aggrails_exorcist',  cell: 4 },
      { key: 'crimson_basilica.high_keeper',        cell: 1 },
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

function getSecondaryTemplate(region_id, templateId) {
  return (SECONDARY_ENCOUNTERS[region_id] || []).find(t => t.id === templateId) || null;
}

export {
  SMALL_MAX_LEVEL, MODES, modeForLevel, NODE_UNLOCKS, unlockedNodeTypes,
  SECONDARY_LOOT, ABANDON_SHARE, SECONDARY_ENCOUNTERS, secondaryTemplatesFor, getSecondaryTemplate,
};
if (typeof module !== 'undefined') module.exports = {
  SMALL_MAX_LEVEL, MODES, modeForLevel, NODE_UNLOCKS, unlockedNodeTypes,
  SECONDARY_LOOT, ABANDON_SHARE, SECONDARY_ENCOUNTERS, secondaryTemplatesFor, getSecondaryTemplate,
};
