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
      rewards: {
        gold: 15, xp: 30,
        crystals:        [{ type: 'Crystals_Life', amount: 6 }],
        crystals_random: { pool: ['Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 1 },
        trophies:        [{ id: 'vial_of_pure_blood', amount: 1 }],
        spell_trophies:  [{ id: 'aggrails_signet', amount: 1 }],
      },
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
      rewards: {
        gold: 20, xp: 40,
        crystals:        [{ type: 'Crystals_Life', amount: 8 }],
        crystals_random: { pool: ['Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 1 },
        trophies:        [{ id: 'vial_of_pure_blood', amount: 1 }],
        spell_trophies:  [{ id: 'aggrails_signet', amount: 1 }],
      },
    },
    level_3: {
      enemies: [
        { key: 'crimson_basilica.aggrails_herald',  cell: 2 },
        { key: 'crimson_basilica.scarlet_recruit',  cell: 0 },
        { key: 'crimson_basilica.sister_aldra_1',   cell: 5 },
        { key: 'crimson_basilica.initiate',         cell: 1 },
      ],
      rewards: {
        gold: 25, xp: 50,
        crystals:        [{ type: 'Crystals_Life', amount: 10 }],
        crystals_random: { pool: ['Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 1 },
        trophies:        [{ id: 'vial_of_pure_blood', amount: 1 }],
        spell_trophies:  [{ id: 'aggrails_signet', amount: 1 }],
      },
    },
    level_4: {
      enemies: [
        { key: 'crimson_basilica.exalted_herald',   cell: 2 },
        { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
        { key: 'crimson_basilica.initiate',         cell: 3 },
        { key: 'crimson_basilica.crimson_scout',   cell: 1 },
      ],
      rewards: {
        gold: 30, xp: 60,
        crystals:        [{ type: 'Crystals_Life', amount: 11 }],
        crystals_random: { pool: ['Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 1 },
        trophies:        [{ id: 'vial_of_pure_blood', amount: 1 }],
        spell_trophies:  [{ id: 'aggrails_signet', amount: 1 }],
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
        crystals_random: { pool: ['Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 1 },
        trophies:        [{ id: 'vial_of_pure_blood', amount: 2 }],
        spell_trophies:  [{ id: 'aggrails_signet', amount: 1 }],
      },
    },
    level_6: {
      // Enemies can carry gear: `item_id` is any key from data/items.js ITEM_DEFS
      // and applies exactly like a player-equipped item (stats, tags, passive).
      enemies: [
        { key: 'crimson_basilica.exalted_herald',   cell: 2, item_id: 'aegis_of_the_first_ward' },
        { key: 'crimson_basilica.aggrails_devoted', cell: 0, item_id: 'iron_armor' },
        { key: 'crimson_basilica.sister_aldra_2',   cell: 4 },
        { key: 'crimson_basilica.keeper_of_purity', cell: 1 },
        { key: 'crimson_basilica.crimson_hunter',   cell: 5, item_id: 'crude_sword' },
      ],
      // Tailored payout for this level — see getLevelRewards for every option.
      rewards: {
        gold: 40, xp: 80,
        crystals:        [{ type: 'Crystals_Life', amount: 14 }],
        crystals_random: { pool: ['Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 2 },
        trophies:        [{ id: 'vial_of_pure_blood', amount: 2 }],
        spell_trophies:  [{ id: 'aggrails_signet', amount: 2 }],
      },
    },
  },

  mountains_of_valdrek: {
    level_1: {
      enemies: [
        { key: 'mountains_of_valdrek.cinderling',  cell: 0 },
        { key: 'mountains_of_valdrek.cinderling',  cell: 4 },
      ],
      rewards: {
        gold: 15, xp: 30,
        crystals:        [{ type: 'Crystals_Air', amount: 6 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature'], amount: 1 },
        trophies:        [{ id: 'cinder_ash', amount: 1 }],
        spell_trophies:  [{ id: 'patchling_stitching', amount: 1 }],
      },
    },
    level_2: {
      enemies: [
        { key: 'mountains_of_valdrek.cinderling',  cell: 0 },
        { key: 'mountains_of_valdrek.cinderling',  cell: 4 },
        { key: 'mountains_of_valdrek.patchling',   cell: 1 },
      ],
      rewards: {
        gold: 20, xp: 40,
        crystals:        [{ type: 'Crystals_Air', amount: 8 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature'], amount: 1 },
        trophies:        [{ id: 'cinder_ash', amount: 1 }],
        spell_trophies:  [{ id: 'patchling_stitching', amount: 1 }],
      },
    },
    level_3: {
      enemies: [
        { key: 'mountains_of_valdrek.cinderling',  cell: 0 },
        { key: 'mountains_of_valdrek.cairn',       cell: 2 },
      ],
      rewards: {
        gold: 25, xp: 50,
        crystals:        [{ type: 'Crystals_Air', amount: 10 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature'], amount: 1 },
        trophies:        [{ id: 'cinder_ash', amount: 1 }],
        spell_trophies:  [{ id: 'patchling_stitching', amount: 1 }],
      },
    },
  },

  dungeons_of_malgrath: {
    level_1: {
      enemies: [
        { key: 'dungeons_of_malgrath.bone_knight', cell: 0 },
        { key: 'dungeons_of_malgrath.bone_knight', cell: 4 },
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
        { key: 'dungeons_of_malgrath.bone_knight',      cell: 0 },
        { key: 'dungeons_of_malgrath.bone_knight',      cell: 4 },
        { key: 'dungeons_of_malgrath.oathbound_martyr', cell: 3 },
      ],
      rewards: {
        gold: 20, xp: 40,
        crystals:        [{ type: 'Crystals_Death', amount: 8 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 1 },
        trophies:        [{ id: 'grave_dust', amount: 1 }],
        spell_trophies:  [{ id: 'rusted_shackle', amount: 1 }],
      },
    },
    level_3: {
      enemies: [
        { key: 'dungeons_of_malgrath.bone_knight',            cell: 0 },
        { key: 'dungeons_of_malgrath.oathbound_martyr',       cell: 5 },
        { key: 'dungeons_of_malgrath.wailing_ghost',          cell: 3 },
        { key: 'dungeons_of_malgrath.malgrath_the_undying_1', cell: 2 },
      ],
      rewards: {
        gold: 25, xp: 50,
        crystals:        [{ type: 'Crystals_Death', amount: 10 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 1 },
        trophies:        [{ id: 'grave_dust', amount: 1 }],
        spell_trophies:  [{ id: 'rusted_shackle', amount: 1 }],
      },
    },
    level_4: {
      enemies: [
        { key: 'dungeons_of_malgrath.dread_knight',           cell: 0 },
        { key: 'dungeons_of_malgrath.dread_knight',           cell: 4 },
        { key: 'dungeons_of_malgrath.oathbound_martyr',       cell: 2 },
      ],
      rewards: {
        gold: 30, xp: 60,
        crystals:        [{ type: 'Crystals_Death', amount: 11 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 1 },
        trophies:        [{ id: 'grave_dust', amount: 1 }],
        spell_trophies:  [{ id: 'rusted_shackle', amount: 1 }],
      },
    },
    level_5: {
      enemies: [
        { key: 'dungeons_of_malgrath.dread_knight',           cell: 0 },
        { key: 'dungeons_of_malgrath.dread_knight',           cell: 4 },
        { key: 'dungeons_of_malgrath.oathsworn_martyr',       cell: 1 },
        { key: 'dungeons_of_malgrath.revenant',               cell: 5 },
      ],
      rewards: {
        gold: 35, xp: 70,
        crystals:        [{ type: 'Crystals_Death', amount: 13 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 1 },
        trophies:        [{ id: 'grave_dust', amount: 2 }],
        spell_trophies:  [{ id: 'rusted_shackle', amount: 1 }],
      },
    },
    level_6: {
      enemies: [
        { key: 'dungeons_of_malgrath.dread_knight',           cell: 0 },
        { key: 'dungeons_of_malgrath.dread_knight',           cell: 4 },
        { key: 'dungeons_of_malgrath.oathsworn_martyr',       cell: 1 },
        { key: 'dungeons_of_malgrath.revenant',               cell: 5 },
        { key: 'dungeons_of_malgrath.malgrath_the_undying_2', cell: 2 },
      ],
      rewards: {
        gold: 40, xp: 80,
        crystals:        [{ type: 'Crystals_Death', amount: 14 }],
        crystals_random: { pool: ['Crystals_Life', 'Crystals_Fire', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'], amount: 2 },
        trophies:        [{ id: 'grave_dust', amount: 2 }],
        spell_trophies:  [{ id: 'rusted_shackle', amount: 2 }],
      },
    },
  },
};

// Every level states its own payout in REGION_ENCOUNTERS — there is no scaling
// formula. This just surfaces the level list (and its declared gold/xp) so the
// server can validate a level and count how many a region has.
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
  { id: 'mountains_of_valdrek', difficulties: buildDifficulties('mountains_of_valdrek') },
  { id: 'dungeons_of_malgrath', difficulties: buildDifficulties('dungeons_of_malgrath') },
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

      // Optional per-encounter item: slot.item_id references data/items.js ITEM_DEFS.
      // Applies armor/resist/tag/passive bonuses the same way player-equipped items do;
      // HP is added directly to the flat `hp` field since enemies have no persisted
      // roster row to bank the bonus on (unlike player units).
      if (slot.item_id) {
        const itemDef = ITEM_DEFS[slot.item_id];
        if (itemDef) unitData = applyItemModifiers(unitData, itemDef);
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

export { REGIONS, REGION_ENCOUNTERS, getEncounter, getEncounterSpellId, getLevelRewards };
if (typeof module !== 'undefined') module.exports = { REGIONS, REGION_ENCOUNTERS, getEncounter, getEncounterSpellId, getLevelRewards };