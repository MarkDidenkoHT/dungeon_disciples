import { UNITS } from './units.js';

const ALL_CRYSTALS = ['Crystals_Life', 'Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'];

const REGION_ENCOUNTERS = {
  crimson_basilica: {
    level_1: [
      { key: 'crimson_basilica.aggrails_herald', cell: 1 },
      { key: 'crimson_basilica.crimson_archer',  cell: 4 },
      { key: 'crimson_basilica.crimson_archer',  cell: 2 },
    ],
    level_2:  [
      { key: 'crimson_basilica.aggrails_herald',  cell: 0 },
      { key: 'crimson_basilica.aggrails_devoted',  cell: 1 },
      { key: 'crimson_basilica.crimson_archer', cell: 2 },
    ],
    level_3:  [
      { key: 'crimson_basilica.aggrails_herald',  cell: 0 },
      { key: 'crimson_basilica.aggrails_devoted', cell: 1 },
      { key: 'crimson_basilica.crimson_archer',  cell: 2 },
      { key: 'crimson_basilica.keeper_of_purity', cell: 3 },
    ],
  },

  mountains_of_valdrek: {
    level_1:  [
      { key: 'mountains_of_valdrek.rockjaw',     cell: 0 },
      { key: 'mountains_of_valdrek.peak_harpy',  cell: 2 },
      { key: 'mountains_of_valdrek.rockjaw',     cell: 4 },
    ],
    level_2:  [
      { key: 'mountains_of_valdrek.peak_harpy',  cell: 0 },
      { key: 'mountains_of_valdrek.stone_golem', cell: 2 },
      { key: 'mountains_of_valdrek.rockjaw',     cell: 1 },
      { key: 'mountains_of_valdrek.peak_harpy',  cell: 4 },
    ],
    level_3:  [
      { key: 'mountains_of_valdrek.stone_golem', cell: 0 },
      { key: 'mountains_of_valdrek.frost_shaman', cell: 2 },
      { key: 'mountains_of_valdrek.rockjaw',     cell: 1 },
      { key: 'mountains_of_valdrek.peak_harpy',  cell: 4 },
    ],
    level_4:  [
      { key: 'mountains_of_valdrek.stone_golem',      cell: 0 },
      { key: 'mountains_of_valdrek.frost_shaman',      cell: 2 },
      { key: 'mountains_of_valdrek.mountain_warden',  cell: 4 },
      { key: 'mountains_of_valdrek.peak_harpy',        cell: 1 },
      { key: 'mountains_of_valdrek.rockjaw',           cell: 3 },
    ],
    level_5:  [
      { key: 'mountains_of_valdrek.glacier_brute',    cell: 0 },
      { key: 'mountains_of_valdrek.frost_shaman',      cell: 2 },
      { key: 'mountains_of_valdrek.mountain_warden',  cell: 4 },
      { key: 'mountains_of_valdrek.stone_golem',      cell: 1 },
    ],
    level_6:  [
      { key: 'mountains_of_valdrek.glacier_brute',    cell: 0 },
      { key: 'mountains_of_valdrek.rune_caster',      cell: 2 },
      { key: 'mountains_of_valdrek.mountain_warden',  cell: 4 },
      { key: 'mountains_of_valdrek.frost_shaman',      cell: 1 },
      { key: 'mountains_of_valdrek.stone_golem',      cell: 3 },
    ],
    level_7:  [
      { key: 'mountains_of_valdrek.peak_titan',       cell: 0 },
      { key: 'mountains_of_valdrek.rune_caster',      cell: 2 },
      { key: 'mountains_of_valdrek.glacier_brute',    cell: 4 },
      { key: 'mountains_of_valdrek.frost_shaman',      cell: 1 },
      { key: 'mountains_of_valdrek.mountain_warden',  cell: 3 },
    ],
    level_8:  [
      { key: 'mountains_of_valdrek.peak_titan',       cell: 0 },
      { key: 'mountains_of_valdrek.storm_witch',      cell: 2 },
      { key: 'mountains_of_valdrek.rune_caster',      cell: 4 },
      { key: 'mountains_of_valdrek.glacier_brute',    cell: 1 },
      { key: 'mountains_of_valdrek.mountain_warden',  cell: 3 },
    ],
    level_9:  [
      { key: 'mountains_of_valdrek.the_mountain_king', cell: 0 },
      { key: 'mountains_of_valdrek.storm_witch',       cell: 2 },
      { key: 'mountains_of_valdrek.peak_titan',        cell: 4 },
      { key: 'mountains_of_valdrek.rune_caster',       cell: 1 },
      { key: 'mountains_of_valdrek.glacier_brute',     cell: 3 },
    ],
    level_10: [
      { key: 'mountains_of_valdrek.the_mountain_king', cell: 0 },
      { key: 'mountains_of_valdrek.peak_titan',        cell: 2 },
      { key: 'mountains_of_valdrek.storm_witch',       cell: 4 },
      { key: 'mountains_of_valdrek.rune_caster',       cell: 1 },
      { key: 'mountains_of_valdrek.glacier_brute',     cell: 3 },
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
    ],
    level_4:  [
      { key: 'dungeons_of_malgrath.bone_knight',    cell: 0 },
      { key: 'dungeons_of_malgrath.death_cultist',  cell: 2 },
      { key: 'dungeons_of_malgrath.wailing_ghost',  cell: 4 },
      { key: 'dungeons_of_malgrath.crypt_shambler', cell: 1 },
      { key: 'dungeons_of_malgrath.dungeon_rat',    cell: 3 },
    ],
    level_5:  [
      { key: 'dungeons_of_malgrath.tomb_colossus',  cell: 0 },
      { key: 'dungeons_of_malgrath.death_cultist',  cell: 2 },
      { key: 'dungeons_of_malgrath.wailing_ghost',  cell: 4 },
      { key: 'dungeons_of_malgrath.bone_knight',    cell: 1 },
    ],
    level_6:  [
      { key: 'dungeons_of_malgrath.tomb_colossus',  cell: 0 },
      { key: 'dungeons_of_malgrath.revenant',       cell: 2 },
      { key: 'dungeons_of_malgrath.death_cultist',  cell: 4 },
      { key: 'dungeons_of_malgrath.bone_knight',    cell: 1 },
      { key: 'dungeons_of_malgrath.wailing_ghost',  cell: 3 },
    ],
    level_7:  [
      { key: 'dungeons_of_malgrath.soul_harvester', cell: 0 },
      { key: 'dungeons_of_malgrath.revenant',       cell: 2 },
      { key: 'dungeons_of_malgrath.tomb_colossus',  cell: 4 },
      { key: 'dungeons_of_malgrath.death_cultist',  cell: 1 },
      { key: 'dungeons_of_malgrath.bone_knight',    cell: 3 },
    ],
    level_8:  [
      { key: 'dungeons_of_malgrath.dread_knight',   cell: 0 },
      { key: 'dungeons_of_malgrath.soul_harvester', cell: 2 },
      { key: 'dungeons_of_malgrath.revenant',       cell: 4 },
      { key: 'dungeons_of_malgrath.tomb_colossus',  cell: 1 },
      { key: 'dungeons_of_malgrath.death_cultist',  cell: 3 },
    ],
    level_9:  [
      { key: 'dungeons_of_malgrath.malgrath_the_undying', cell: 0 },
      { key: 'dungeons_of_malgrath.dread_knight',         cell: 2 },
      { key: 'dungeons_of_malgrath.soul_harvester',       cell: 4 },
      { key: 'dungeons_of_malgrath.revenant',             cell: 1 },
      { key: 'dungeons_of_malgrath.wailing_ghost',        cell: 3 },
    ],
    level_10: [
      { key: 'dungeons_of_malgrath.malgrath_the_undying', cell: 0 },
      { key: 'dungeons_of_malgrath.dread_knight',         cell: 2 },
      { key: 'dungeons_of_malgrath.soul_harvester',       cell: 4 },
      { key: 'dungeons_of_malgrath.tomb_colossus',        cell: 1 },
      { key: 'dungeons_of_malgrath.revenant',             cell: 3 },
    ],
  },
};

const REGION_REWARDS = {
  crimson_casilica: {
    crystal_guaranteed: 'Crystals_Nature',
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

const REGIONS = [
  {
    id: 'crimson_basilica',
    crystal_guaranteed: 'Crystals_Nature',
    crystal_pool: ALL_CRYSTALS,
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

export { REGIONS, REGION_ENCOUNTERS, REGION_REWARDS, getEncounter };
if (typeof module !== 'undefined') module.exports = { REGIONS, REGION_ENCOUNTERS, REGION_REWARDS, getEncounter };