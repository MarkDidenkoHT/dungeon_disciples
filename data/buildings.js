const BUILD_TIMES_MS = {
  1: 5  * 60 * 1000,
  2: 10 * 60 * 1000,
  3: 30 * 60 * 1000,
  4: 60 * 60 * 1000,
};

const BUILDING_DEFS = {
  protectors: {
    slot_1: { id: 'farm',              label: 'Farm',               category: 'production', unit: null          },
    slot_2: { id: 'empty',             label: 'Empty',              category: 'production', unit: null          },
    slot_3: { id: 'empty',             label: 'Empty',              category: 'production', unit: null          },
    slot_4: { id: 'conscript_barracks',label: 'Conscript Barracks', category: 'barracks',   unit: 'conscript'   },
    slot_5: { id: 'acolyte_shrine',    label: 'Acolyte Shrine',     category: 'barracks',   unit: 'acolyte'     },
    slot_6: { id: 'mage_tower',        label: 'Mage Tower',         category: 'barracks',   unit: 'apprentice'  },
    slot_7: { id: 'empty',             label: 'Empty',              category: 'any',        unit: null          },
    slot_8: { id: 'empty',             label: 'Empty',              category: 'any',        unit: null          },
  },
  dungeon: {
    slot_1: { id: 'farm',              label: 'Farm',               category: 'production', unit: null          },
    slot_2: { id: 'empty',             label: 'Empty',              category: 'production', unit: null          },
    slot_3: { id: 'empty',             label: 'Empty',              category: 'production', unit: null          },
    slot_4: { id: 'heretic_pit',       label: 'Heretic Pit',        category: 'barracks',   unit: 'heretic'     },
    slot_5: { id: 'imp_den',           label: 'Imp Den',            category: 'barracks',   unit: 'imp'         },
    slot_6: { id: 'possession_altar',  label: 'Possession Altar',   category: 'barracks',   unit: 'possessed'   },
    slot_7: { id: 'empty',             label: 'Empty',              category: 'any',        unit: null          },
    slot_8: { id: 'empty',             label: 'Empty',              category: 'any',        unit: null          },
  },
};

function emptyStructures() {
  return Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [
      `slot_${i + 1}`,
      { level: 0, ready_at: null },
    ])
  );
}

module.exports = { BUILDING_DEFS, BUILD_TIMES_MS, emptyStructures };