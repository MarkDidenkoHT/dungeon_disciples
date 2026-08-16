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
        gold: 15, xp: 30,
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
        gold: 20, xp: 50,
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
        gold: 25, xp: 50,
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
        gold: 30, xp: 60,
        crystals:        [{ type: 'Crystals_Life', amount: 11 }, { type: 'Crystals_Fire', amount: 11 }],
        trophies:        { aggrails_signet: 2, vial_of_pure_blood: 2 },
      },
    },
    level_5: {
      enemies: [
        { key: 'crimson_basilica.exalted_herald',   cell: 2 },
        { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
        { key: 'crimson_basilica.scarlet_recruit',  cell: 4 },
        { key: 'crimson_basilica.keeper_of_purity', cell: 3 },
        { key: 'crimson_basilica.crimson_hunter',   cell: 1 },
      ],
      rewards: {
        gold: 35, xp: 70,
        crystals:        [{ type: 'Crystals_Life', amount: 13 }, { type: 'Crystals_Fire', amount: 13 }],
        trophies:        { vial_of_pure_blood: 3, aggrails_signet: 2 },
      },
    },
    level_6: {
      enemies: [
        { key: 'crimson_basilica.exalted_herald',   cell: 2, item_id: 'aegis_of_the_first_ward' },
        { key: 'crimson_basilica.aggrails_devoted', cell: 0 },
        { key: 'crimson_basilica.sister_aldra_2',   cell: 4, item_id: 'aldras_devotion',
          spells: [{ spell_id: 'boss_heal', power: 2 }, { spell_id: 'boss_resurrect', power: 5 }] },
        { key: 'crimson_basilica.high_keeper', cell: 1 },
        { key: 'crimson_basilica.crimson_stalker',   cell: 5 },
      ],
      rewards: {
        gold: 40, xp: 80,
        crystals:        [{ type: 'Crystals_Life', amount: 14 }, { type: 'Crystals_Fire', amount: 14 }],
        trophies:        { shard_of_devotion: 3 },
      },
    },
  },

  glittering_abyss: {
    level_1: {
      enemies: [
        { key: 'glittering_abyss.chillrock',  cell: 0 },
      ],
      rewards: {
        gold: 15, xp: 30,
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
        gold: 20, xp: 40,
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
        gold: 25, xp: 50,
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
        gold: 30, xp: 60,
        crystals:        [{ type: 'Crystals_Frost', amount: 11 }, { type: 'Crystals_Air', amount: 11 }],
        trophies:        { crystal_dust: 1, rusted_shackle: 1 },
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
        crystals:        [{ type: 'Crystals_Frost', amount: 13 }, { type: 'Crystals_Air', amount: 13 }],
        trophies:        { rusted_shackle: 2, crystal_dust: 1 },
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
        gold: 40, xp: 80,
        crystals:        [{ type: 'Crystals_Frost', amount: 14 }, { type: 'Crystals_Air', amount: 14 }],
        trophies:        { living_geode: 3 },
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
        gold: 20, xp: 40,
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
        gold: 25, xp: 50,
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
        gold: 30, xp: 60,
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
        gold: 35, xp: 70,
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
        gold: 40, xp: 80,
        crystals:        [{ type: 'Crystals_Death', amount: 14 }, { type: 'Crystals_Nature', amount: 14 }],
        trophies:        { shard_of_might: 3 },
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


// Every level states exactly what it pays; nothing is scaled or randomised.
// Omitted keys simply don't drop. Trophies are the crafting inputs — finished
// equipment is never a drop.
//
//   rewards: {
//     gold: 40, xp: 90,
//     crystals: [{ type: 'Crystals_Life', amount: 8 }],
//     trophies: { vial_of_pure_blood: 1, aggrails_signet: 2 },
//   }
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

export { REGIONS, REGION_ENCOUNTERS, getEncounter, getLevelRewards, getRegionsForMaterial, getFactionHomeRegion };
if (typeof module !== 'undefined') module.exports = { REGIONS, REGION_ENCOUNTERS, getEncounter, getLevelRewards, getRegionsForMaterial, getFactionHomeRegion };