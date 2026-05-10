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

const BUILDING_DEFS = {
  protectors: {
    slot_0: { id: 'throne',            label: 'Throne',             category: 'throne',     unit: null         },
    slot_1: { id: 'farm',              label: 'Farm',               category: 'production', unit: null         },
    slot_2: { id: 'empty',             label: 'Empty',              category: 'production', unit: null         },
    slot_3: { id: 'empty',             label: 'Empty',              category: 'production', unit: null         },
    slot_4: { id: 'conscript_barracks',label: 'Conscript Barracks', category: 'barracks',   unit: 'conscript'  },
    slot_5: { id: 'acolyte_shrine',    label: 'Acolyte Shrine',     category: 'barracks',   unit: 'acolyte'    },
    slot_6: { id: 'mage_tower',        label: 'Mage Tower',         category: 'barracks',   unit: 'apprentice' },
    slot_7: { id: 'empty',             label: 'Empty',              category: 'any',        unit: null         },
    slot_8: { id: 'empty',             label: 'Empty',              category: 'any',        unit: null         },
  },
  dungeon: {
    slot_0: { id: 'dark_throne',       label: 'Dark Throne',        category: 'throne',     unit: null         },
    slot_1: { id: 'farm',              label: 'Farm',               category: 'production', unit: null         },
    slot_2: { id: 'empty',             label: 'Empty',              category: 'production', unit: null         },
    slot_3: { id: 'empty',             label: 'Empty',              category: 'production', unit: null         },
    slot_4: { id: 'heretic_pit',       label: 'Heretic Pit',        category: 'barracks',   unit: 'heretic'    },
    slot_5: { id: 'imp_den',           label: 'Imp Den',            category: 'barracks',   unit: 'imp'        },
    slot_6: { id: 'possession_altar',  label: 'Possession Altar',   category: 'barracks',   unit: 'possessed'  },
    slot_7: { id: 'empty',             label: 'Empty',              category: 'any',        unit: null         },
    slot_8: { id: 'empty',             label: 'Empty',              category: 'any',        unit: null         },
  },
};

function emptyStructures() {
  const slots = { slot_0: { level: 1, ready_at: null } };
  for (let i = 1; i <= 8; i++) {
    slots[`slot_${i}`] = { level: 0, ready_at: null };
  }
  return slots;
}

module.exports = { BUILDING_DEFS, BUILD_TIMES_MS, SLOT_CATEGORIES, emptyStructures };