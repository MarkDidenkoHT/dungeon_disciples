const BUILD_TIMES_MS = {
  1: 5  * 60 * 1000,
  2: 10 * 60 * 1000,
  3: 30 * 60 * 1000,
  4: 60 * 60 * 1000,
};

const SLOT_CATEGORIES = {
  slot_0: 'throne',
  slot_1: 'production',
  slot_2: 'production',
  slot_3: 'production',
  slot_4: 'barracks',
  slot_5: 'barracks',
  slot_6: 'barracks',
  slot_7: 'any',
  slot_8: 'any',
};

const BUILDING_POOLS = {
  protectors: {
    throne: [
      { id: 'throne', label: 'Throne', category: 'throne', unit: null },
    ],
    production: [
      { id: 'farm',        label: 'Farm',        category: 'production', unit: null },
      { id: 'lumber_mill', label: 'Lumber Mill', category: 'production', unit: null },
      { id: 'gold_mine',   label: 'Gold Mine',   category: 'production', unit: null },
    ],
    barracks: [
      { id: 'conscript_barracks', label: 'Conscript Barracks', category: 'barracks', unit: 'conscript'  },
      { id: 'acolyte_shrine',     label: 'Acolyte Shrine',     category: 'barracks', unit: 'acolyte'    },
      { id: 'mage_tower',         label: 'Mage Tower',         category: 'barracks', unit: 'apprentice' },
    ],
    any: [
      { id: 'market',    label: 'Market',    category: 'any', unit: null },
      { id: 'watchtower',label: 'Watchtower',category: 'any', unit: null },
    ],
  },
  dungeon: {
    throne: [
      { id: 'dark_throne', label: 'Dark Throne', category: 'throne', unit: null },
    ],
    production: [
      { id: 'bone_farm',      label: 'Bone Farm',      category: 'production', unit: null },
      { id: 'soul_extractor', label: 'Soul Extractor', category: 'production', unit: null },
      { id: 'dark_forge',     label: 'Dark Forge',     category: 'production', unit: null },
    ],
    barracks: [
      { id: 'heretic_pit',       label: 'Heretic Pit',       category: 'barracks', unit: 'heretic'   },
      { id: 'imp_den',           label: 'Imp Den',           category: 'barracks', unit: 'imp'       },
      { id: 'possession_altar',  label: 'Possession Altar',  category: 'barracks', unit: 'possessed' },
    ],
    any: [
      { id: 'cursed_vault', label: 'Cursed Vault',  category: 'any', unit: null },
      { id: 'shadow_shrine',label: 'Shadow Shrine', category: 'any', unit: null },
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

module.exports = { BUILDING_POOLS, BUILD_TIMES_MS, SLOT_CATEGORIES, getBuildingDef, emptyStructures };