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
        { key: 'crimson_basilica.aggrails_herald', cell: 2, item_id: 'padded_armor' },
        { key: 'crimson_basilica.scarlet_recruit', cell: 0 },
      ],
      rewards: {
        gold: 15, xp: 30,
        crystals:        [{ type: 'Crystals_Life', amount: 5 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Death'], amount: 1 },
        trophies:        [{ id: 'vial_of_pure_blood', amount: 1 }],
        spell_trophies:  [{ id: 'aggrails_signet', amount: 1 }],
      },
    },
    level_2: {
      spell_id: 'enemy_spell_1',
      enemies: [
        { key: 'crimson_basilica.crimson_scout',    cell: 1 },
        { key: 'crimson_basilica.aggrails_herald',  cell: 2 },
        { key: 'crimson_basilica.scarlet_recruit',  cell: 0 },
        { key: 'crimson_basilica.initiate',         cell: 3, item_id: 'fire_resistance_potion' },
      ],
      rewards: {
        gold: 20, xp: 50,
        crystals:        [{ type: 'Crystals_Life', amount: 8 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Death', 'Crystals_Fire'], amount: 2 },
        trophies:        [{ id: 'vial_of_pure_blood', amount: 2 }],
        spell_trophies:  [{ id: 'aggrails_signet', amount: 1 }],
      },
    },
    level_3: {
      enemies: [
        { key: 'crimson_basilica.aggrails_herald',  cell: 2 },
        { key: 'crimson_basilica.scarlet_recruit',  cell: 0 },
        { key: 'crimson_basilica.sister_aldra_1',   cell: 3 , item_id: 'aldras_devotion'},
        { key: 'crimson_basilica.initiate',         cell: 1 },
      ],
      rewards: {
        gold: 25, xp: 50,
        crystals:        [{ type: 'Crystals_Life', amount: 10 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Death', 'Crystals_Fire'], amount: 3 },
        trophies:        [{ id: 'vial_of_pure_blood', amount: 2 }],
        spell_trophies:  [{ id: 'shard_of_devotion', amount: 2 }],
      },
    },
    level_4: {
      enemies: [
        { key: 'crimson_basilica.exalted_herald',   cell: 2 },
        { key: 'crimson_basilica.aggrails_devoted', cell: 0, item_id: 'mace' },
        { key: 'crimson_basilica.initiate',         cell: 3 },
        { key: 'crimson_basilica.crimson_scout',   cell: 1 },
      ],
      rewards: {
        gold: 30, xp: 60,
        crystals:        [{ type: 'Crystals_Life', amount: 11 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Death', 'Crystals_Fire'], amount: 4 },
        trophies:        [{ id: 'vial_of_pure_blood', amount: 3 }],
        spell_trophies:  [{ id: 'aggrails_signet', amount: 2 }],
      },
    },
    level_5: {
      enemies: [
        { key: 'crimson_basilica.exalted_herald',   cell: 2 },
        { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
        { key: 'crimson_basilica.scarlet_recruit',  cell: 4 },
        { key: 'crimson_basilica.initiate',         cell: 3 },
        { key: 'crimson_basilica.crimson_hunter',   cell: 1 },
      ],
      rewards: {
        gold: 35, xp: 70,
        crystals:        [{ type: 'Crystals_Life', amount: 13 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Death', 'Crystals_Fire'], amount: 5 },
        trophies:        [{ id: 'vial_of_pure_blood', amount: 3 }],
        spell_trophies:  [{ id: 'aggrails_signet', amount: 2 }],
      },
    },
    level_6: {
      enemies: [
        { key: 'crimson_basilica.exalted_herald',   cell: 2, item_id: 'aegis_of_the_first_ward' },
        { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
        { key: 'crimson_basilica.sister_aldra_2',   cell: 4, item_id: 'aldras_devotion'},
        { key: 'crimson_basilica.keeper_of_purity', cell: 1 },
        { key: 'crimson_basilica.crimson_hunter',   cell: 5 },
      ],
      rewards: {
        gold: 40, xp: 80,
        crystals:        [{ type: 'Crystals_Life', amount: 14 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Death', 'Crystals_Fire'], amount: 6 },
        trophies:        [{ id: 'vial_of_pure_blood', amount: 3 }],
        spell_trophies:  [{ id: 'shard_of_devotion', amount: 2 }],
      },
    },
  },

  glittering_abyss: {
    level_1: {
      enemies: [
        { key: 'glittering_abyss.сhillrock',  cell: 0 },
        { key: 'glittering_abyss.cryostax',  cell: 3 },
      ],
      rewards: {
        gold: 15, xp: 30,
        crystals:        [{ type: 'Crystals_Frost', amount: 6 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Nature'], amount: 1 },
        trophies:        [{ id: 'crystal_dust', amount: 1 }],
        spell_trophies:  [{ id: 'crystal_shard', amount: 1 }],
      },
    },
    level_2: {
      enemies: [
        { key: 'glittering_abyss.сhillrock',  cell: 0 },
        { key: 'glittering_abyss.cryostax',  cell: 3 },
        { key: 'glittering_abyss.frostshard',  cell: 3 },
      ],
      rewards: {
        gold: 20, xp: 40,
        crystals:        [{ type: 'Crystals_Frost', amount: 8 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Nature'], amount: 2 },
        trophies:        [{ id: 'crystal_dust', amount: 1 }],
        spell_trophies:  [{ id: 'crystal_shard', amount: 1 }],
      },
    },
    level_3: {
      enemies: [
        { key: 'glittering_abyss.cryodrox',  cell: 2 },
        { key: 'glittering_abyss.cryostax',  cell: 1 },
        { key: 'glittering_abyss.frostshard',  cell: 3 },
      ],
      rewards: {
        gold: 25, xp: 50,
        crystals:        [{ type: 'Crystals_Frost', amount: 10 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Nature'], amount: 3 },
        trophies:        [{ id: 'crystal_dust', amount: 2 }],
        spell_trophies:  [{ id: 'living_geode', amount: 1 }],
      },
    },
    level_4: {
      enemies: [
        { key: 'glittering_abyss.rime_splinter',       cell: 1 },
        { key: 'glittering_abyss.rime_splinter',       cell: 3 },
        { key: 'glittering_abyss.rime_splinter',       cell: 5 },
      ],
      rewards: {
        gold: 30, xp: 60,
        crystals:        [{ type: 'Crystals_Death', amount: 11 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 4 },
        trophies:        [{ id: 'crystal_dust', amount: 1 }],
        spell_trophies:  [{ id: 'rusted_shackle', amount: 1 }],
      },
    },
    level_5: {
      enemies: [
        { key: 'glittering_abyss.rimewarden',             cell: 2 },
        { key: 'glittering_abyss.glaciron',               cell: 1 },
        { key: 'glittering_abyss.rime_splinter',          cell: 5 },
      ],
      rewards: {
        gold: 35, xp: 70,
        crystals:        [{ type: 'Crystals_Death', amount: 13 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 5 },
        trophies:        [{ id: 'crystal_dust', amount: 2 }],
        spell_trophies:  [{ id: 'rusted_shackle', amount: 1 }],
      },
    },
    level_6: {
      enemies: [
        { key: 'glittering_abyss.cryodrox2',      cell: 0 },
        { key: 'glittering_abyss.rimewarden',     cell: 4 },
        { key: 'glittering_abyss.rime_splinter',  cell: 1 },
        { key: 'glittering_abyss.rime_splinter',  cell: 3 },
      ],
      rewards: {
        gold: 40, xp: 80,
        crystals:        [{ type: 'Crystals_Death', amount: 14 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 6 },
        trophies:        [{ id: 'crystal_dust', amount: 2 }],
        spell_trophies:  [{ id: 'living_geode', amount: 2 }],
      },
    },
  },

  chamber_of_unrest: {
    level_1: {
      enemies: [
        { key: 'chamber_of_unrest.bone_knight',   cell: 0 },
        { key: 'chamber_of_unrest.bone_knight',   cell: 4 },
      ],
      rewards: {
        gold: 15, xp: 30,
        crystals:        [{ type: 'Crystals_Death', amount: 6 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 1 },
        trophies:        [{ id: 'grave_dust', amount: 1 }],
        spell_trophies:  [{ id: 'rusted_shackle', amount: 1 }],
      },
    },
    level_2: {
      enemies: [
        { key: 'chamber_of_unrest.bone_knight',      cell: 0, item_id: 'iron_armor' },
        { key: 'chamber_of_unrest.bone_knight',      cell: 4 },
        { key: 'chamber_of_unrest.oathbound_martyr', cell: 3, item_id: 'everliving_stalk' },
      ],
      rewards: {
        gold: 20, xp: 40,
        crystals:        [{ type: 'Crystals_Death', amount: 8 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Frost', 'Crystals_Air'], amount: 2},
        trophies:        [{ id: 'grave_dust', amount: 1 }],
        spell_trophies:  [{ id: 'rusted_shackle', amount: 1 }],
      },
    },
    level_3: {
      enemies: [
        { key: 'chamber_of_unrest.bone_knight',            cell: 0 },
        { key: 'chamber_of_unrest.oathbound_martyr',       cell: 5 },
        { key: 'chamber_of_unrest.wailing_ghost',          cell: 3 },
        { key: 'chamber_of_unrest.malgrath_the_undying_1', cell: 2 },
      ],
      rewards: {
        gold: 25, xp: 50,
        crystals:        [{ type: 'Crystals_Death', amount: 10 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 3 },
        trophies:        [{ id: 'grave_dust', amount: 2 }],
        spell_trophies:  [{ id: 'shard_of_might', amount: 1 }],
      },
    },
    level_4: {
      enemies: [
        { key: 'chamber_of_unrest.dread_knight',           cell: 0 },
        { key: 'chamber_of_unrest.dread_knight',           cell: 4 },
        { key: 'chamber_of_unrest.oathbound_martyr',       cell: 1 },
        { key: 'chamber_of_unrest.oathbound_martyr',       cell: 5 },
      ],
      rewards: {
        gold: 30, xp: 60,
        crystals:        [{ type: 'Crystals_Death', amount: 11 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 4 },
        trophies:        [{ id: 'grave_dust', amount: 1 }],
        spell_trophies:  [{ id: 'rusted_shackle', amount: 1 }],
      },
    },
    level_5: {
      enemies: [
        { key: 'chamber_of_unrest.dread_knight',           cell: 0 },
        { key: 'chamber_of_unrest.dread_knight',           cell: 4 },
        { key: 'chamber_of_unrest.oathsworn_martyr',       cell: 1 },
        { key: 'chamber_of_unrest.revenant',               cell: 5 },
      ],
      rewards: {
        gold: 35, xp: 70,
        crystals:        [{ type: 'Crystals_Death', amount: 13 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 5 },
        trophies:        [{ id: 'grave_dust', amount: 2 }],
        spell_trophies:  [{ id: 'rusted_shackle', amount: 1 }],
      },
    },
    level_6: {
      enemies: [
        { key: 'chamber_of_unrest.dread_knight',           cell: 0 },
        { key: 'chamber_of_unrest.dread_knight',           cell: 4 },
        { key: 'chamber_of_unrest.oathsworn_martyr',       cell: 1 },
        { key: 'chamber_of_unrest.revenant',               cell: 5 },
        { key: 'chamber_of_unrest.malgrath_the_undying_2', cell: 2 },
      ],
      rewards: {
        gold: 40, xp: 80,
        crystals:        [{ type: 'Crystals_Death', amount: 14 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 6 },
        trophies:        [{ id: 'grave_dust', amount: 2 }],
        spell_trophies:  [{ id: 'shard_of_might', amount: 2 }],
      },
    },
  },
};

function buildDifficulties(regionId) {
  const region = REGION_ENCOUNTERS[regionId];
  if (!region) return {};
  const out = {};
  for (const levelKey of Object.keys(region)) {
    const r = region[levelKey]?.rewards ?? {};
    out[levelKey] = {
      rewards: {
        gold: r.gold ?? 0,
        xp:   r.xp   ?? 0,
      },
    };
  }
  return out;
}

// Regions carry no reward data — every drop is declared on the level itself.
// `difficulties` only exists so the server can validate a level and count them.
const REGIONS = [
  { id: 'crimson_basilica',     difficulties: buildDifficulties('crimson_basilica') },
  { id: 'glittering_abyss', difficulties: buildDifficulties('glittering_abyss') },
  { id: 'chamber_of_unrest', difficulties: buildDifficulties('chamber_of_unrest') },
];


// ── Per-level rewards ────────────────────────────────────────────────────────
// No formulas, no region pools, no randomised trophy tables. Every level states
// exactly what it pays out in its own `rewards` block in REGION_ENCOUNTERS:
//
//   rewards: {
//     gold: 40, xp: 90,
//
//     // Guaranteed crystals — exact types and amounts. List as many as you like.
//     crystals: [{ type: 'Crystals_Life', amount: 8 }],
//
//     // The ONLY random element: one type is picked from this pool.
//     crystals_random: { pool: ['Crystals_Fire', 'Crystals_Air'], amount: 1 },
//
//     // Basic shards — always drop on a win, no spell needed.
//     trophies: [{ id: 'vial_of_pure_blood', amount: 1 }],
//
//     // Extra shards the trophy spell unlocks. These COMBINE with `trophies`
//     // (both are granted when a trophy_gain spell was cast), they don't replace them.
//     spell_trophies: [{ id: 'aggrails_signet', amount: 1 }],
//   }
//
// Anything omitted simply doesn't drop — nothing is inferred or invented.
// Finished items are NEVER dropped; equipment comes only from crafting, so
// these shards are the crafting inputs.
function getLevelRewards(region_id, level) {
  const declared = REGION_ENCOUNTERS[region_id]?.[`level_${level}`]?.rewards ?? {};
  const rnd      = declared.crystals_random ?? {};
  const asList   = v => (Array.isArray(v) ? v : []);
  return {
    gold: declared.gold ?? 0,
    xp:   declared.xp   ?? 0,
    crystals:        asList(declared.crystals),
    crystals_random: { pool: asList(rnd.pool), amount: rnd.amount ?? 0 },
    trophies:        asList(declared.trophies),
    spell_trophies:  asList(declared.spell_trophies),
  };
}

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

      if (slot.item_id) {
        const itemDef = ITEM_DEFS[slot.item_id];
        if (itemDef) unitData = applyItemModifiers(unitData, itemDef);
      }

      return { ...unitData, cell: slot.cell, item_id: slot.item_id || null };
    })
    .filter(Boolean);
}

function getEncounterSpellId(region_id, level) {
  const levelKey = `level_${level}`;
  return REGION_ENCOUNTERS[region_id]?.[levelKey]?.spell_id || null;
}

export { REGIONS, REGION_ENCOUNTERS, getEncounter, getEncounterSpellId, getLevelRewards };
if (typeof module !== 'undefined') module.exports = { REGIONS, REGION_ENCOUNTERS, getEncounter, getEncounterSpellId, getLevelRewards };