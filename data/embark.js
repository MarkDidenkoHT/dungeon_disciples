import { UNITS } from './units.js';
import { ITEM_DEFS, applyItemModifiers } from './items.js';

const ALL_CRYSTALS = ['Crystals_Life', 'Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'];

//encounter mapping
// 01
// 23
// 45

const REGION_ENCOUNTERS = {
  crimson_basilica: {
    level_1: {
      enemies: [
        { key: 'crimson_basilica.aggrails_herald', cell: 2 },
        { key: 'crimson_basilica.scarlet_recruit', cell: 0 },
        { key: 'crimson_basilica.scarlet_recruit', cell: 4 },
      ],
    },
    level_2: {
      // One hardcoded spell per encounter, same as the player's one-spell-per-battle -
      // there's no per-unit caster, the level itself "casts" this at battle start.
      spell_id: 'enemy_spell_1',
      enemies: [
        { key: 'crimson_basilica.crimson_scout',    cell: 1 },
        { key: 'crimson_basilica.aggrails_herald',  cell: 2 },
        { key: 'crimson_basilica.scarlet_recruit',  cell: 0 },
        { key: 'crimson_basilica.initiate',         cell: 3 },
      ],
    },
    level_3: {
      enemies: [
        { key: 'crimson_basilica.aggrails_herald',  cell: 2 },
        { key: 'crimson_basilica.scarlet_recruit',  cell: 0 },
        { key: 'crimson_basilica.sister_aldra_1',   cell: 5 },
        { key: 'crimson_basilica.initiate',         cell: 1 },
      ],
    },
    level_4: {
      enemies: [
        { key: 'crimson_basilica.exalted_herald',   cell: 2 },
        { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
        { key: 'crimson_basilica.initiate',         cell: 3 },
        { key: 'crimson_basilica.crimson_scout',   cell: 1 },
      ],
    },
    level_5: {
      enemies: [
        { key: 'crimson_basilica.exalted_herald',   cell: 2 },
        { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
        { key: 'crimson_basilica.scarlet_recruit',  cell: 4 },
        { key: 'crimson_basilica.initiate',         cell: 3 },
        { key: 'crimson_basilica.crimson_hunter',   cell: 1 },
      ],
    },
    level_6: {
      enemies: [
        { key: 'crimson_basilica.exalted_herald',   cell: 2 },
        { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
        { key: 'crimson_basilica.sister_aldra_2',   cell: 4 },
        { key: 'crimson_basilica.keeper_of_purity', cell: 1 },
        { key: 'crimson_basilica.crimson_hunter',   cell: 5 },
      ],
    },
  },

  mountains_of_valdrek: {
    level_1: {
      enemies: [
        { key: 'mountains_of_valdrek.cinderling',  cell: 0 },
        { key: 'mountains_of_valdrek.cinderling',  cell: 4 },
      ],
    },
    level_2: {
      enemies: [
        { key: 'mountains_of_valdrek.cinderling',  cell: 0 },
        { key: 'mountains_of_valdrek.cinderling',  cell: 4 },
        { key: 'mountains_of_valdrek.patchling',   cell: 1 },
      ],
    },
    level_3: {
      enemies: [
        { key: 'mountains_of_valdrek.cinderling',  cell: 0 },
        { key: 'mountains_of_valdrek.cairn',       cell: 2 },
      ],
    },
  },

  dungeons_of_malgrath: {
    level_1: {
      enemies: [
        { key: 'dungeons_of_malgrath.bone_knight', cell: 0 },
        { key: 'dungeons_of_malgrath.bone_knight', cell: 4 },
      ],
    },
    level_2: {
      enemies: [
        { key: 'dungeons_of_malgrath.bone_knight',      cell: 0 },
        { key: 'dungeons_of_malgrath.bone_knight',      cell: 4 },
        { key: 'dungeons_of_malgrath.oathbound_martyr', cell: 3 },
      ],
    },
    level_3: {
      enemies: [
        { key: 'dungeons_of_malgrath.bone_knight',            cell: 0 },
        { key: 'dungeons_of_malgrath.oathbound_martyr',       cell: 5 },
        { key: 'dungeons_of_malgrath.wailing_ghost',          cell: 3 },
        { key: 'dungeons_of_malgrath.malgrath_the_undying_1', cell: 2 },
      ],
    },
    level_4: {
      enemies: [
        { key: 'dungeons_of_malgrath.dread_knight',           cell: 0 },
        { key: 'dungeons_of_malgrath.dread_knight',           cell: 4 },
        { key: 'dungeons_of_malgrath.oathbound_martyr',       cell: 2 },
      ],
    },
    level_5: {
      enemies: [
        { key: 'dungeons_of_malgrath.dread_knight',           cell: 0 },
        { key: 'dungeons_of_malgrath.dread_knight',           cell: 4 },
        { key: 'dungeons_of_malgrath.oathsworn_martyr',       cell: 1 },
        { key: 'dungeons_of_malgrath.revenant',               cell: 5 },
      ],
    },
    level_6: {
      enemies: [
        { key: 'dungeons_of_malgrath.dread_knight',           cell: 0 },
        { key: 'dungeons_of_malgrath.dread_knight',           cell: 4 },
        { key: 'dungeons_of_malgrath.oathsworn_martyr',       cell: 1 },
        { key: 'dungeons_of_malgrath.revenant',               cell: 5 },
        { key: 'dungeons_of_malgrath.malgrath_the_undying_2', cell: 2 },
      ],
    },
  },
};

const REGION_REWARDS = {
  crimson_basilica: {
    crystal_guaranteed: 'Crystals_Life',
    crystal_pool: ALL_CRYSTALS,
    base: { gold: 15, xp: 30 },
  },
  mountains_of_valdrek: {
    crystal_guaranteed: 'Crystals_Fire',
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
  mountains_of_valdrek: [
    { id: 'cinder_ash',           label: 'Cinder Ash' },
    { id: 'patchling_stitching',  label: 'Patchling Stitching' },
  ],
  dungeons_of_malgrath: [
    { id: 'rusted_shackle', label: 'Rusted Shackle' },
    { id: 'grave_dust',     label: 'Grave Dust' },
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
    trophies: REGION_TROPHIES.mountains_of_valdrek,
    difficulties: buildDifficulties('mountains_of_valdrek'),
  },
  {
    id: 'dungeons_of_malgrath',
    crystal_guaranteed: 'Crystals_Death',
    crystal_pool: ALL_CRYSTALS,
    trophies: REGION_TROPHIES.dungeons_of_malgrath,
    difficulties: buildDifficulties('dungeons_of_malgrath'),
  },
];


function resolveUnitKey(key) {
  const [region, unitId] = key.split('.');
  return UNITS.enemies?.[region]?.[unitId] ?? null;
}

function getEncounter(region_id, level) {
  const levelKey = `level_${level}`;
  const slots    = REGION_ENCOUNTERS[region_id]?.[levelKey]?.enemies;
  if (!slots) return [];
  return slots
    .map(slot => {
      let unitData = resolveUnitKey(slot.key);
      if (!unitData) return null;

      // Optional per-encounter item: slot.item_id references data/items.js ITEM_DEFS.
      // Applies armor/resist/tag/passive bonuses the same way player-equipped items do;
      // HP is added directly to the flat `hp` field since enemies have no persisted
      // roster row to bank the bonus on (unlike player units).
      if (slot.item_id) {
        const itemDef = ITEM_DEFS[slot.item_id];
        if (itemDef) {
          unitData = applyItemModifiers(unitData, itemDef);
          const hpBonus = Number(itemDef.stat_mods?.hp || 0);
          if (hpBonus) unitData = { ...unitData, hp: (unitData.hp ?? 0) + hpBonus };
        }
      }

      return { ...unitData, cell: slot.cell, item_id: slot.item_id || null };
    })
    .filter(Boolean);
}

// One hardcoded spell per encounter (level), same as the player's one-spell-per-
// battle rule - there is no per-unit caster and no in-battle selection for
// enemies. spell_id can be any spell in data/spells.js (a faction spell or one
// of SPELLS.enemies); the effect runs through the same target-scope + params
// engine as player casts (see BattleEngine.castEnemyPreparedSpells). Never
// shown to the player - only whether a cast happened (battle-prep.js
// enemy-spell-indicator).
function getEncounterSpellId(region_id, level) {
  const levelKey = `level_${level}`;
  return REGION_ENCOUNTERS[region_id]?.[levelKey]?.spell_id || null;
}

export { REGIONS, REGION_ENCOUNTERS, REGION_REWARDS, REGION_TROPHIES, getEncounter, getEncounterSpellId };
if (typeof module !== 'undefined') module.exports = { REGIONS, REGION_ENCOUNTERS, REGION_REWARDS, REGION_TROPHIES, getEncounter, getEncounterSpellId };