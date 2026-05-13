const BUILD_TIMES_MS = {
  1: 5 * 60 * 1000,
  2: 10 * 60 * 1000,
  3: 30 * 60 * 1000,
  4: 60 * 60 * 1000,
};

const SLOT_CATEGORIES = {
  slot_0: 'throne',
  slot_1: 'barracks',
  slot_2: 'barracks',
  slot_3: 'barracks',
  slot_4: 'barracks',
  slot_5: 'barracks',
  slot_6: 'barracks',
  slot_7: 'any',
  slot_8: 'any',
};

const BUILDING_POOLS = {
  empire: {
    throne: [
      { id: 'throne', label: 'Throne', category: 'throne', unit: null },
    ],
    barracks: [
      { 
        id: 'conscript_barracks', 
        label: 'Conscript Barracks', 
        category: 'barracks', 
        unit: 'conscript',
        unit_id: 'e1',
        upgrades: ['e11', 'e12'],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'acolyte_shrine', 
        label: 'Acolyte Shrine', 
        category: 'barracks', 
        unit: 'acolyte',
        unit_id: 'e2',
        upgrades: ['e22', 'e23'],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'mage_tower', 
        label: 'Mage Tower', 
        category: 'barracks', 
        unit: 'apprentice',
        unit_id: 'e4',
        upgrades: ['e41', 'e42'],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'priest_shrine', 
        label: 'Priest Shrine', 
        category: 'barracks', 
        unit: 'priest',
        unit_id: 'e22',
        upgrades: [],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'purgator_chapel', 
        label: 'Purgator Chapel', 
        category: 'barracks', 
        unit: 'purgator',
        unit_id: 'e23',
        upgrades: [],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
    ],
    any: [
      { id: 'market', label: 'Market', category: 'any', unit: null },
      { id: 'watchtower', label: 'Watchtower', category: 'any', unit: null },
    ],
  },
  dungeon: {
    throne: [
      { id: 'dark_throne', label: 'Dark Throne', category: 'throne', unit: null },
    ],
    barracks: [
      { 
        id: 'heretic_pit', 
        label: 'Heretic Pit', 
        category: 'barracks', 
        unit: 'heretic',
        unit_id: 'd1',
        upgrades: ['d3'],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'imp_den', 
        label: 'Imp Den', 
        category: 'barracks', 
        unit: 'imp',
        unit_id: 'd2',
        upgrades: [],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'possession_altar', 
        label: 'Possession Altar', 
        category: 'barracks', 
        unit: 'possessed',
        unit_id: 'd3',
        upgrades: [],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
    ],
    any: [
      { id: 'cursed_vault', label: 'Cursed Vault', category: 'any', unit: null },
      { id: 'shadow_shrine', label: 'Shadow Shrine', category: 'any', unit: null },
    ],
  },
};

const UNIT_UPGRADE_PATHS = {
  empire: {
    e1: [
      { unit_id: 'e11', building_id: 'infantry_barracks', label: 'Infantry Barracks' },
      { unit_id: 'e12', building_id: 'cavalry_stables',   label: 'Cavalry Stables'   },
    ],
    e2: [
      { unit_id: 'e22', building_id: 'priest_shrine',     label: 'Priest Shrine'     },
      { unit_id: 'e23', building_id: 'purgator_chapel',   label: 'Purgator Chapel'   },
    ],
    e4: [
      { unit_id: 'e41', building_id: 'red_mage_tower',    label: 'Red Mage Tower'    },
      { unit_id: 'e42', building_id: 'wizard_tower',      label: 'Wizard Tower'      },
    ],
  },
  dungeon: {
    d1: [
      { unit_id: 'd3', building_id: 'possession_altar',   label: 'Possession Altar'  },
    ],
  },
};

function getBuildingDef(faction, buildingId) {
  const factionPools = BUILDING_POOLS[faction];
  if (!factionPools) return null;
  for (const pool of Object.values(factionPools)) {
    const found = pool.find(b => b.id === buildingId);
    if (found) return found;
  }
  return null;
}

function emptyStructures() {
  const slots = { slot_0: { level: 1, ready_at: null, building_id: null } };
  for (let i = 1; i <= 8; i++) {
    slots[`slot_${i}`] = { level: 0, ready_at: null, building_id: null };
  }
  return slots;
}

module.exports = { BUILDING_POOLS, BUILD_TIMES_MS, SLOT_CATEGORIES, UNIT_UPGRADE_PATHS, getBuildingDef, emptyStructures };