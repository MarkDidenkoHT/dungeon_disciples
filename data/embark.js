import { UNITS } from './units.js';

const ALL_CRYSTALS = ['Crystals_Life', 'Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'];

//encounter mapping
// 01
// 23
// 45

const REGION_ENCOUNTERS = {
  crimson_basilica: {
    level_1: [
      { key: 'crimson_basilica.aggrails_herald', cell: 2 },
      { key: 'crimson_basilica.scarlet_recruit', cell: 0 },
      { key: 'crimson_basilica.scarlet_recruit', cell: 4 },
    ],
    level_2:  [
      { key: 'crimson_basilica.aggrails_herald',  cell: 2 },
      { key: 'crimson_basilica.scarlet_recruit',  cell: 0 },
      { key: 'crimson_basilica.initiate',         cell: 3 },
    ],
    level_3:  [
      { key: 'crimson_basilica.aggrails_herald',  cell: 2 },
      { key: 'crimson_basilica.scarlet_recruit',  cell: 0 },
      { key: 'crimson_basilica.scarlet_recruit',  cell: 4 },
      { key: 'crimson_basilica.initiate',         cell: 3 },
    ],
    level_4:  [
      { key: 'crimson_basilica.exalted_herald',   cell: 2 },
      { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
      { key: 'crimson_basilica.initiate',         cell: 3 },
    ],
    level_5:  [
      { key: 'crimson_basilica.exalted_herald',   cell: 2 },
      { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
      { key: 'crimson_basilica.scarlet_recruit',  cell: 4 },
      { key: 'crimson_basilica.initiate',         cell: 3 },
    ],
    level_6:  [
      { key: 'crimson_basilica.exalted_herald',   cell: 2 },
      { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
      { key: 'crimson_basilica.aggrails_devoted', cell: 4 },
      { key: 'crimson_basilica.keeper_of_purity', cell: 1 },
    ],
  },

  mountains_of_valdrek: {
    level_1:  [
      { key: 'mountains_of_valdrek.cinderling',  cell: 0 },
      { key: 'mountains_of_valdrek.cinderling',  cell: 4 },
    ],
    level_2:  [
      { key: 'mountains_of_valdrek.cinderling',  cell: 0 },
      { key: 'mountains_of_valdrek.cinderling',  cell: 4 },
      { key: 'mountains_of_valdrek.patchling',   cell: 1 },
    ],
    level_3:  [
      { key: 'mountains_of_valdrek.cinderling',  cell: 0 },
      { key: 'mountains_of_valdrek.cairn',       cell: 2 },
    ],
  },

  dungeons_of_malgrath: {
    level_1:  [
      { key: 'dungeons_of_malgrath.dungeon_rat',    cell: 0 },
      { key: 'dungeons_of_malgrath.crypt_shambler', cell: 2 },
      { key: 'dungeons_of_malgrath.dungeon_rat',    cell: 4 },
    ],
    level_2:  [
      { key: 'dungeons_of_malgrath.crypt_shambler', cell: 0 },
      { key: 'dungeons_of_malgrath.wailing_ghost',  cell: 2 },
      { key: 'dungeons_of_malgrath.dungeon_rat',    cell: 1 },
      { key: 'dungeons_of_malgrath.crypt_shambler', cell: 4 },
    ],
    level_3:  [
      { key: 'dungeons_of_malgrath.wailing_ghost',  cell: 0 },
      { key: 'dungeons_of_malgrath.bone_knight',    cell: 2 },
      { key: 'dungeons_of_malgrath.crypt_shambler', cell: 1 },
      { key: 'dungeons_of_malgrath.dungeon_rat',    cell: 4 },
    ]
  },
};

const REGION_REWARDS = {
  crimson_casilica: {
    crystal_guaranteed: 'Crystals_Life',
    crystal_pool: ALL_CRYSTALS,
    base: { gold: 15, xp: 30 },
  },
  mountains_of_valdrek: {
    crystal_guaranteed: 'Crystals_Air',
    crystal_pool: ALL_CRYSTALS,
    base: { gold: 15, xp: 30 },
  },
  dungeons_of_malgrath: {
    crystal_guaranteed: 'Crystals_Death',
    crystal_pool: ALL_CRYSTALS,
    base: { gold: 15, xp: 30 },
  },
};

function buildDifficulties(regionId) {
  const region = REGION_ENCOUNTERS[regionId];
  if (!region) return {};
  const base = REGION_REWARDS[regionId]?.base ?? { gold: 15, xp: 30 };
  const out  = {};
  for (const levelKey of Object.keys(region)) {
    const num     = parseInt(levelKey.replace('level_', ''), 10);
    const scale   = 1 + (num - 1) * 0.3;
    out[levelKey] = {
      rewards: {
        gold: Math.round(base.gold * scale),
        xp:   Math.round(base.xp   * scale),
      },
    };
  }
  return out;
}

const REGION_TROPHIES = {
  crimson_basilica: [
    { id: 'vial_of_pure_blood', label: 'Vial of Pure Blood' },
    { id: 'aggrails_signet',    label: "Aggrail's Signet" },
  ],
};

const REGIONS = [
  {
    id: 'crimson_basilica',
    crystal_guaranteed: 'Crystals_Life',
    crystal_pool: ALL_CRYSTALS,
    trophies: REGION_TROPHIES.crimson_basilica,
    difficulties: buildDifficulties('crimson_basilica'),
  },
  {
    id: 'mountains_of_valdrek',
    crystal_guaranteed: 'Crystals_Air',
    crystal_pool: ALL_CRYSTALS,
    difficulties: buildDifficulties('mountains_of_valdrek'),
  },
  {
    id: 'dungeons_of_malgrath',
    crystal_guaranteed: 'Crystals_Death',
    crystal_pool: ALL_CRYSTALS,
    difficulties: buildDifficulties('dungeons_of_malgrath'),
  },
];


function resolveUnitKey(key) {
  const [region, unitId] = key.split('.');
  return UNITS.enemies?.[region]?.[unitId] ?? null;
}

function getEncounter(region_id, level) {
  const levelKey = `level_${level}`;
  const slots    = REGION_ENCOUNTERS[region_id]?.[levelKey];
  if (!slots) return [];
  return slots
    .map(slot => {
      const unitData = resolveUnitKey(slot.key);
      if (!unitData) return null;
      return { ...unitData, cell: slot.cell };
    })
    .filter(Boolean);
}

export { REGIONS, REGION_ENCOUNTERS, REGION_REWARDS, REGION_TROPHIES, getEncounter };
if (typeof module !== 'undefined') module.exports = { REGIONS, REGION_ENCOUNTERS, REGION_REWARDS, REGION_TROPHIES, getEncounter };