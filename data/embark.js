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
      ],
      rewards: {
        gold: 25, xp: 45,
        crystals:        [{ type: 'Crystals_Life', amount: 5 }, { type: 'Crystals_Fire', amount: 5 }],
        trophies:        { vial_of_pure_blood: 1, aggrails_signet: 1 },
      },
    },
    level_2: {
      enemies: [
        { key: 'crimson_basilica.aggrails_herald',  cell: 2 },
        { key: 'crimson_basilica.scarlet_recruit',  cell: 0 },
        { key: 'crimson_basilica.initiate',         cell: 3, item_id: 'fire_resistance_potion' },
      ],
      rewards: {
        gold: 35, xp: 60,
        crystals:        [{ type: 'Crystals_Life', amount: 8 }, { type: 'Crystals_Fire', amount: 8 }],
        trophies:        { aggrails_signet: 1, vial_of_pure_blood: 2 },
      },
    },
    level_3: {
      enemies: [
        { key: 'crimson_basilica.aggrails_herald',  cell: 2 },
        { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
        { key: 'crimson_basilica.sister_aldra_1',   cell: 3 , item_id: 'aldras_devotion',
          spells: [{ spell_id: 'boss_heal', power: 2 }] },
        { key: 'crimson_basilica.initiate',         cell: 1},
      ],
      rewards: {
        gold: 45, xp: 85,
        crystals:        [{ type: 'Crystals_Life', amount: 10 }, { type: 'Crystals_Fire', amount: 10 }],
        trophies:        { vial_of_pure_blood: 2, shard_of_devotion: 1 },
      },
    },
    level_4: {
      enemies: [
        { key: 'crimson_basilica.exalted_herald',   cell: 2 },
        { key: 'crimson_basilica.aggrails_devoted', cell: 0, item_id: 'mace' },
        { key: 'crimson_basilica.initiate', cell: 3,  item_id: 'everliving_stalk' },
        { key: 'crimson_basilica.crimson_hunter',   cell: 1 },
      ],
      rewards: {
        gold: 55, xp: 115,
        crystals:        [{ type: 'Crystals_Life', amount: 11 }, { type: 'Crystals_Fire', amount: 11 }],
        trophies:        { aggrails_signet: 2, vial_of_pure_blood: 2 },
      },
    },
    level_5: {
      enemies: [
        { key: 'crimson_basilica.exalted_herald',   cell: 2, item_id: 'divine_circlet' },
        { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
        { key: 'crimson_basilica.scarlet_recruit',  cell: 4 },
        { key: 'crimson_basilica.keeper_of_purity', cell: 3 },
        { key: 'crimson_basilica.crimson_hunter',   cell: 1 },
      ],
      rewards: {
        gold: 65, xp: 150,
        crystals:        [{ type: 'Crystals_Life', amount: 13 }, { type: 'Crystals_Fire', amount: 13 }],
        trophies:        { vial_of_pure_blood: 3, aggrails_signet: 2 },
      },
    },
    level_6: {
      enemies: [
        { key: 'crimson_basilica.exalted_herald',   cell: 2, item_id: 'aegis_of_the_first_ward' },
        { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
        { key: 'crimson_basilica.sister_aldra_2',   cell: 3, item_id: 'aldras_devotion',
          spells: [{ spell_id: 'boss_resurrect', power: 5 }] },
        { key: 'crimson_basilica.high_keeper', cell: 1 },
        { key: 'crimson_basilica.crimson_stalker',   cell: 5 },
      ],
      rewards: {
        gold: 75, xp: 200,
        crystals:        [{ type: 'Crystals_Life', amount: 14 }, { type: 'Crystals_Fire', amount: 14 }],
        trophies:        { shard_of_devotion: 3 },
      },
    },
    level_7: {
      enemies: [
        { key: 'crimson_basilica.exalted_evangelist', cell: 2 },
        { key: 'crimson_basilica.aggrails_champion',  cell: 0 },
        { key: 'crimson_basilica.high_keeper',        cell: 3 },
        { key: 'crimson_basilica.crimson_stalker',    cell: 1 },
      ],
      rewards: {
        gold: 85, xp: 250,
        crystals:        [{ type: 'Crystals_Life', amount: 16 }, { type: 'Crystals_Fire', amount: 16 }],
        trophies:        { shard_of_devotion: 2, aggrails_signet: 3 },
      },
    },
    level_8: {
      enemies: [
        { key: 'crimson_basilica.exalted_evangelist', cell: 2 },
        { key: 'crimson_basilica.aggrails_champion',  cell: 0 },
        { key: 'crimson_basilica.high_keeper',        cell: 3 },
        { key: 'crimson_basilica.crimson_stalker',    cell: 1 },
        { key: 'crimson_basilica.keeper_of_purity',   cell: 5 },
      ],
      rewards: {
        gold: 100, xp: 325,
        crystals:        [{ type: 'Crystals_Life', amount: 18 }, { type: 'Crystals_Fire', amount: 18 }],
        trophies:        { shard_of_devotion: 3, vial_of_pure_blood: 4 },
      },
    },
    level_9: {
      enemies: [
        { key: 'crimson_basilica.sister_aldra_2',     cell: 3, item_id: 'aldras_devotion',
          spells: [{ spell_id: 'boss_resurrect', power: 5 }] },
        { key: 'crimson_basilica.exalted_evangelist', cell: 0 },
        { key: 'crimson_basilica.aggrails_champion',  cell: 4 },
        { key: 'crimson_basilica.exalted_herald',     cell: 2 },
        { key: 'crimson_basilica.crimson_stalker',    cell: 1 },
        { key: 'crimson_basilica.high_keeper',        cell: 5 },
      ],
      rewards: {
        gold: 120, xp: 400,
        crystals:        [{ type: 'Crystals_Life', amount: 20 }, { type: 'Crystals_Fire', amount: 20 }],
        trophies:        { shard_of_devotion: 4, aggrails_signet: 4 },
      },
    },
    level_10: {
      enemies: [
        { key: 'crimson_basilica.sister_aldra_3',      cell: 1, item_id: 'aldras_devotion',
          spells: [{ spell_id: 'boss_resurrect', power: 4 }] },
        { key: 'crimson_basilica.grand_keeper',        cell: 3 },
        { key: 'crimson_basilica.exalted_evangelist',  cell: 0 },
        { key: 'crimson_basilica.aggrails_champion',   cell: 4 },
        { key: 'crimson_basilica.aggrails_desecrator', cell: 2 },
        { key: 'crimson_basilica.crimson_stalker',     cell: 5 },
      ],
      rewards: {
        gold: 150, xp: 500,
        crystals:        [{ type: 'Crystals_Life', amount: 22 }, { type: 'Crystals_Fire', amount: 22 }],
        trophies:        { shard_of_devotion: 5, vial_of_pure_blood: 5, aggrails_signet: 5 },
      },
    },
  },

  glittering_abyss: {
    level_1: {
      enemies: [
        { key: 'glittering_abyss.chillrock',  cell: 0 },
      ],
      rewards: {
        gold: 25, xp: 45,
        crystals:        [{ type: 'Crystals_Frost', amount: 6 }, { type: 'Crystals_Air', amount: 6 }],
        trophies:        { crystal_dust: 1, crystal_shard: 1 },
      },
    },
    level_2: {
      enemies: [
        { key: 'glittering_abyss.frostshard',  cell: 1 },
        { key: 'glittering_abyss.cryostax',  cell: 3 },
        { key: 'glittering_abyss.frostshard',  cell: 5 },
      ],
      rewards: {
        gold: 35, xp: 60,
        crystals:        [{ type: 'Crystals_Frost', amount: 8 }, { type: 'Crystals_Air', amount: 8 }],
        trophies:        { crystal_shard: 1, crystal_dust: 1 },
      },
    },
    level_3: {
      enemies: [
        { key: 'glittering_abyss.cryodrox',  cell: 2,
          spells: [{ spell_id: 'boss_rime_ward', power: 2 }] },
        { key: 'glittering_abyss.chillrock',  cell: 0 },
      ],
      rewards: {
        gold: 45, xp: 85,
        crystals:        [{ type: 'Crystals_Frost', amount: 10 }, { type: 'Crystals_Air', amount: 10 }],
        trophies:        { living_geode: 2 },
      },
    },
    level_4: {
      enemies: [
        { key: 'glittering_abyss.rime_splinter',       cell: 1 },
        { key: 'glittering_abyss.rime_splinter',       cell: 3 },
        { key: 'glittering_abyss.rime_splinter',       cell: 5 },
      ],
      rewards: {
        gold: 55, xp: 115,
        crystals:        [{ type: 'Crystals_Frost', amount: 11 }, { type: 'Crystals_Air', amount: 11 }],
        trophies:        { crystal_dust: 1, crystal_shard: 1 },
      },
    },
    level_5: {
      enemies: [
        { key: 'glittering_abyss.rimewarden',             cell: 2 },
        { key: 'glittering_abyss.glaciron',               cell: 1 },
        { key: 'glittering_abyss.rime_splinter',          cell: 5 },
      ],
      rewards: {
        gold: 65, xp: 150,
        crystals:        [{ type: 'Crystals_Frost', amount: 13 }, { type: 'Crystals_Air', amount: 13 }],
        trophies:        { crystal_shard: 2, crystal_dust: 1 },
      },
    },
    level_6: {
      enemies: [
        { key: 'glittering_abyss.cryodrox2',      cell: 0,
          spells: [{ spell_id: 'boss_rime_ward', power: 2 },
                   { spell_id: 'boss_glacial_burst', power: 3 }] },
        { key: 'glittering_abyss.rimewarden',     cell: 4 },
        { key: 'glittering_abyss.rime_splinter',  cell: 1 },
        { key: 'glittering_abyss.rime_splinter',  cell: 3 },
      ],
      rewards: {
        gold: 75, xp: 200,
        crystals:        [{ type: 'Crystals_Frost', amount: 14 }, { type: 'Crystals_Air', amount: 14 }],
        trophies:        { living_geode: 3 },
      },
    },
    level_7: {
      enemies: [
        { key: 'glittering_abyss.glaciok',        cell: 2 },
        { key: 'glittering_abyss.glacial_prism',  cell: 0 },
        { key: 'glittering_abyss.rime_splinter',  cell: 1 },
        { key: 'glittering_abyss.arctyx',         cell: 5 },
      ],
      rewards: {
        gold: 85, xp: 250,
        crystals:        [{ type: 'Crystals_Frost', amount: 16 }, { type: 'Crystals_Air', amount: 16 }],
        trophies:        { crystal_shard: 3, living_geode: 2 },
      },
    },
    level_8: {
      enemies: [
        { key: 'glittering_abyss.glaciok',        cell: 2 },
        { key: 'glittering_abyss.rimewarden',     cell: 4 },
        { key: 'glittering_abyss.glacial_prism',  cell: 0 },
        { key: 'glittering_abyss.arctyx',         cell: 1 },
      ],
      rewards: {
        gold: 100, xp: 325,
        crystals:        [{ type: 'Crystals_Frost', amount: 18 }, { type: 'Crystals_Air', amount: 18 }],
        trophies:        { crystal_dust: 4, living_geode: 3 },
      },
    },
    level_9: {
      enemies: [
        { key: 'glittering_abyss.cryodrox2',      cell: 0,
          spells: [{ spell_id: 'boss_rime_ward', power: 2 },
                   { spell_id: 'boss_glacial_burst', power: 3 }] },
        { key: 'glittering_abyss.rimewarden',     cell: 4 },
        { key: 'glittering_abyss.glacial_prism',  cell: 1 },
        { key: 'glittering_abyss.arctyx',         cell: 3 },
      ],
      rewards: {
        gold: 125, xp: 400,
        crystals:        [{ type: 'Crystals_Frost', amount: 20 }, { type: 'Crystals_Air', amount: 20 }],
        trophies:        { living_geode: 4, crystal_shard: 4 },
      },
    },
    level_10: {
      enemies: [
        { key: 'glittering_abyss.cryodrox3',      cell: 0,
          spells: [{ spell_id: 'boss_rime_ward', power: 3 },
                   { spell_id: 'boss_glacial_burst', power: 4 }] },
        { key: 'glittering_abyss.glaciok',        cell: 4 },
        { key: 'glittering_abyss.glacial_prism',  cell: 1 },
        { key: 'glittering_abyss.arctyx',         cell: 3 },
      ],
      rewards: {
        gold: 150, xp: 500,
        crystals:        [{ type: 'Crystals_Frost', amount: 22 }, { type: 'Crystals_Air', amount: 22 }],
        trophies:        { living_geode: 5, crystal_shard: 5, crystal_dust: 5 },
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
        gold: 25, xp: 45,
        crystals:        [{ type: 'Crystals_Death', amount: 6 }, { type: 'Crystals_Nature', amount: 6 }],
        trophies:        { grave_dust: 1, rusted_shackle: 1 },
      },
    },
    level_2: {
      enemies: [
        { key: 'chamber_of_unrest.bone_knight',      cell: 0 },
        { key: 'chamber_of_unrest.bone_knight',      cell: 4 },
        { key: 'chamber_of_unrest.oathbound_martyr', cell: 3 },
      ],
      rewards: {
        gold: 35, xp: 60,
        crystals:        [{ type: 'Crystals_Death', amount: 8 }, { type: 'Crystals_Nature', amount: 8 }],
        trophies:        { rusted_shackle: 1, grave_dust: 1 },
      },
    },
    level_3: {
      enemies: [
        { key: 'chamber_of_unrest.bone_knight',            cell: 0 },
        { key: 'chamber_of_unrest.oathbound_martyr',       cell: 5 },
        { key: 'chamber_of_unrest.wailing_ghost',          cell: 3 },
        { key: 'chamber_of_unrest.malgrath_the_undying_1', cell: 2,
          spells: [{ spell_id: 'boss_grave_rot', power: 3 }] },
      ],
      rewards: {
        gold: 45, xp: 85,
        crystals:        [{ type: 'Crystals_Death', amount: 10 }, { type: 'Crystals_Nature', amount: 10 }],
        trophies:        { shard_of_might: 2 },
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
        gold: 55, xp: 115,
        crystals:        [{ type: 'Crystals_Death', amount: 11 }, { type: 'Crystals_Nature', amount: 11 }],
        trophies:        { grave_dust: 1, rusted_shackle: 1 },
      },
    },
    level_5: {
      enemies: [
        { key: 'chamber_of_unrest.death_knight',           cell: 0 },
        { key: 'chamber_of_unrest.dread_knight',           cell: 4 },
        { key: 'chamber_of_unrest.oathsworn_martyr',       cell: 1 },
        { key: 'chamber_of_unrest.revenant',               cell: 5 },
      ],
      rewards: {
        gold: 65, xp: 150,
        crystals:        [{ type: 'Crystals_Death', amount: 13 }, { type: 'Crystals_Nature', amount: 13 }],
        trophies:        { rusted_shackle: 2, grave_dust: 1 },
      },
    },
    level_6: {
      enemies: [
        { key: 'chamber_of_unrest.dread_knight',           cell: 0 },
        { key: 'chamber_of_unrest.death_knight',           cell: 4 },
        { key: 'chamber_of_unrest.oathsworn_martyr',       cell: 1 },
        { key: 'chamber_of_unrest.revenant',               cell: 5 },
        { key: 'chamber_of_unrest.malgrath_the_undying_2', cell: 2,
          spells: [{ spell_id: 'boss_grave_rot', power: 3 },
                   { spell_id: 'boss_deaths_verdict', power: 4 }] },
      ],
      rewards: {
        gold: 75, xp: 200,
        crystals:        [{ type: 'Crystals_Death', amount: 14 }, { type: 'Crystals_Nature', amount: 14 }],
        trophies:        { shard_of_might: 3 },
      },
    },
    level_7: {
      enemies: [
        { key: 'chamber_of_unrest.death_knight',           cell: 0 },
        { key: 'chamber_of_unrest.martyr_of_the_vow',      cell: 1 },
        { key: 'chamber_of_unrest.soul_harvester',         cell: 3 },
        { key: 'chamber_of_unrest.revenant',               cell: 5 },
      ],
      rewards: {
        gold: 85, xp: 250,
        crystals:        [{ type: 'Crystals_Death', amount: 16 }, { type: 'Crystals_Nature', amount: 16 }],
        trophies:        { shard_of_might: 2, rusted_shackle: 3 },
      },
    },
    level_8: {
      enemies: [
        { key: 'chamber_of_unrest.death_knight',           cell: 0 },
        { key: 'chamber_of_unrest.death_knight',           cell: 4 },
        { key: 'chamber_of_unrest.martyr_of_the_vow',      cell: 1 },
        { key: 'chamber_of_unrest.soul_harvester',         cell: 3 },
        { key: 'chamber_of_unrest.oathsworn_martyr',       cell: 5 },
      ],
      rewards: {
        gold: 100, xp: 325,
        crystals:        [{ type: 'Crystals_Death', amount: 18 }, { type: 'Crystals_Nature', amount: 18 }],
        trophies:        { shard_of_might: 3, grave_dust: 4 },
      },
    },
    level_9: {
      enemies: [
        { key: 'chamber_of_unrest.malgrath_the_undying_2', cell: 2,
          spells: [{ spell_id: 'boss_grave_rot', power: 3 },
                   { spell_id: 'boss_deaths_verdict', power: 4 }] },
        { key: 'chamber_of_unrest.death_knight',           cell: 0 },
        { key: 'chamber_of_unrest.dread_knight',           cell: 4 },
        { key: 'chamber_of_unrest.martyr_of_the_vow',      cell: 1 },
        { key: 'chamber_of_unrest.soul_harvester',         cell: 3 },
        { key: 'chamber_of_unrest.revenant',               cell: 5 },
      ],
      rewards: {
        gold: 125, xp: 400,
        crystals:        [{ type: 'Crystals_Death', amount: 20 }, { type: 'Crystals_Nature', amount: 20 }],
        trophies:        { shard_of_might: 4, rusted_shackle: 4 },
      },
    },
    level_10: {
      enemies: [
        { key: 'chamber_of_unrest.malgrath_the_undying_3', cell: 2,
          spells: [{ spell_id: 'boss_grave_rot', power: 4 },
                   { spell_id: 'boss_deaths_verdict', power: 5 }] },
        { key: 'chamber_of_unrest.death_knight',           cell: 0 },
        { key: 'chamber_of_unrest.death_knight',           cell: 4 },
        { key: 'chamber_of_unrest.martyr_of_the_vow',      cell: 1 },
        { key: 'chamber_of_unrest.soul_harvester',         cell: 3 },
        { key: 'chamber_of_unrest.soul_harvester',         cell: 5 },
      ],
      rewards: {
        gold: 150, xp: 500,
        crystals:        [{ type: 'Crystals_Death', amount: 22 }, { type: 'Crystals_Nature', amount: 22 }],
        trophies:        { shard_of_might: 5, grave_dust: 5, rusted_shackle: 5 },
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

const REGIONS = [
  { id: 'crimson_basilica',     difficulties: buildDifficulties('crimson_basilica') },
  { id: 'glittering_abyss', difficulties: buildDifficulties('glittering_abyss') },
  { id: 'chamber_of_unrest', difficulties: buildDifficulties('chamber_of_unrest') },
];

function getLevelRewards(region_id, level) {
  const declared = REGION_ENCOUNTERS[region_id]?.[`level_${level}`]?.rewards ?? {};
  return {
    gold:     declared.gold ?? 0,
    xp:       declared.xp   ?? 0,
    crystals: Array.isArray(declared.crystals) ? declared.crystals : [],
    trophies: declared.trophies && typeof declared.trophies === 'object' ? declared.trophies : {},
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

      // `spells` makes the engine treat this unit as a hero: it banks power.
      return { ...unitData, cell: slot.cell, item_id: slot.item_id || null, spells: slot.spells || [] };
    })
    .filter(Boolean);
}

// ── Where does X drop? ──────────────────────────────────────────────────────
// material -> region ids, so tapping a crafting ingredient can say where to go.
// Materials are crystal names ('Crystals_Fire'), trophy ids ('grave_dust'), or
// 'Gold'.
let _dropIndex = null;
function buildDropIndex() {
  const index = {};
  const add = (material, regionId) => {
    if (!material) return;
    (index[material] = index[material] || new Set()).add(regionId);
  };
  for (const region of REGIONS) {
    if (region.comingSoon) continue;
    for (const key of Object.keys(REGION_ENCOUNTERS[region.id] || {})) {
      const level = Number(String(key).replace('level_', ''));
      if (!Number.isFinite(level)) continue;
      const rw = getLevelRewards(region.id, level);
      if (rw.gold) add('Gold', region.id);
      for (const c of rw.crystals) add(c.type, region.id);
      for (const id of Object.keys(rw.trophies)) add(id, region.id);
    }
  }
  return Object.fromEntries(Object.entries(index).map(([k, v]) => [k, [...v]]));
}

function getRegionsForMaterial(material) {
  if (!_dropIndex) _dropIndex = buildDropIndex();
  return _dropIndex[material] || [];
}

// Regions that drop `material` because of the RUNNING event. Kept separate from
// the static index above because the two answer different questions: the index
// is permanent and derived from these tables, while this depends on a database
// row that will stop existing. The event is passed in rather than read here —
// this file has no server access and must stay pure.
//
// An empty result for a material with no static source either means "that is
// crafted, not dropped" or "that is event-only and no event is running", and the
// callers say so rather than claiming it drops nowhere.
function eventRegionsForMaterial(material, event) {
  const drops = event?.drops;
  if (!material || !drops) return [];
  return Object.keys(drops).filter(regionId =>
    Object.values(drops[regionId] || {}).some(items => items && material in items));
}

// A faction opens on whichever region drops the crystal its buildings cost, so
// retuning the reward tables moves this automatically.
const FACTION_CRYSTAL_FOR_REGION = {
  empire:              'Crystals_Life',
  choir_of_the_cursed: 'Crystals_Fire',
  grail_of_sorrow:     'Crystals_Death',
};

function getFactionHomeRegion(faction) {
  const crystal = FACTION_CRYSTAL_FOR_REGION[faction];
  const regions = crystal ? getRegionsForMaterial(crystal) : [];
  return regions[0] || REGIONS.find(r => !r.comingSoon)?.id || null;
}

export { REGIONS, REGION_ENCOUNTERS, getEncounter, getLevelRewards, getRegionsForMaterial, eventRegionsForMaterial, getFactionHomeRegion };
if (typeof module !== 'undefined') module.exports = { REGIONS, REGION_ENCOUNTERS, getEncounter, getLevelRewards, getRegionsForMaterial, eventRegionsForMaterial, getFactionHomeRegion };