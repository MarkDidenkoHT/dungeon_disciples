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
        tier: 1,
        unit: 'conscript',
        unit_id: 'e1',
        upgrades: ['e11', 'e12'],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'acolyte_shrine', 
        label: 'Acolyte Shrine', 
        category: 'barracks', 
        tier: 1,
        unit: 'acolyte',
        unit_id: 'e2',
        upgrades: ['e22', 'e23'],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'mage_tower', 
        label: 'Mage Tower', 
        category: 'barracks', 
        tier: 1,
        unit: 'apprentice',
        unit_id: 'e4',
        upgrades: ['e41', 'e42'],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'priest_shrine', 
        label: 'Priest Shrine', 
        category: 'barracks', 
        tier: 2,
        unit: 'priest',
        unit_id: 'e22',
        upgrades: [],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'purgator_chapel', 
        label: 'Purgator Chapel', 
        category: 'barracks', 
        tier: 2,
        unit: 'purgator',
        unit_id: 'e23',
        upgrades: [],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'purgator_chapel', 
        label: 'Purgator Chapel', 
        category: 'barracks', 
        tier: 2,
        unit: 'purgator',
        unit_id: 'e21',
        upgrades: [],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      }
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
        tier: 1,
        unit: 'heretic',
        unit_id: 'd1',
        upgrades: ['d3'],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'imp_den', 
        label: 'Imp Den', 
        category: 'barracks', 
        tier: 1,
        unit: 'imp',
        unit_id: 'd2',
        upgrades: [],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'possession_altar', 
        label: 'Possession Altar', 
        category: 'barracks', 
        tier: 2,
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
  grail_of_sorrow: {
    throne: [
      { id: 'sorrow_throne', label: 'Throne of Sorrow', category: 'throne', unit: null },
    ],
    barracks: [
      { 
        id: 'zombie_pit', 
        label: 'Zombie Pit', 
        category: 'barracks', 
        tier: 1,
        unit: 'zombie_risen',
        unit_id: 'gs1',
        upgrades: ['gs11', 'gs12', 'gs13'],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'catapult_workshop', 
        label: 'Catapult Workshop', 
        category: 'barracks', 
        tier: 2,
        unit: 'catapult',
        unit_id: 'gs2',
        upgrades: ['gs21', 'gs22'],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'adept_crypt', 
        label: 'Adept Crypt', 
        category: 'barracks', 
        tier: 2,
        unit: 'adept',
        unit_id: 'gs3',
        upgrades: ['gs31', 'gs32', 'gs33'],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'dragon_barrow', 
        label: 'Dragon Barrow', 
        category: 'barracks', 
        tier: 3,
        unit: 'dragon_c',
        unit_id: 'gs4',
        upgrades: ['gs41', 'gs42'],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'skeleton_crypt', 
        label: 'Skeleton Crypt', 
        category: 'barracks', 
        tier: 2,
        unit: 'skeleton_warrior',
        unit_id: 'gs5',
        upgrades: ['gs51', 'gs52'],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
      { 
        id: 'ghost_manor', 
        label: 'Ghost Manor', 
        category: 'barracks', 
        tier: 2,
        unit: 'ghost',
        unit_id: 'gs6',
        upgrades: ['gs61', 'gs62'],
        cost: { gold: 50, mana: 0, crystals_life: 0, crystals_fire: 0, crystals_death: 0, crystals_nature: 0, crystals_frost: 0 }
      },
    ],
    any: [
      { id: 'sorrow_altar', label: 'Altar of Sorrow', category: 'any', unit: null },
      { id: 'soul_vault', label: 'Soul Vault', category: 'any', unit: null },
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
      { unit_id: 'e21', building_id: 'priest_shrine',     label: 'Priest Shrine'     },
      { unit_id: 'e22', building_id: 'paladin_shrine',   label: 'Paladin Chapel'   },
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
  grail_of_sorrow: {
    gs1: [
      { unit_id: 'gs11', building_id: 'poison_ghoul_pit',     label: 'Poison Ghoul Pit' },
      { unit_id: 'gs12', building_id: 'cannibal_ghoul_pit',   label: 'Cannibal Ghoul Pit' },
      { unit_id: 'gs13', building_id: 'cesswalker_mire',      label: 'Cesswalker Mire' },
    ],
    gs2: [
      { unit_id: 'gs21', building_id: 'corpse_launcher_workshop', label: 'Corpse Launcher Workshop' },
      { unit_id: 'gs22', building_id: 'meat_wagon_butchery',      label: 'Meat Wagon Butchery' },
    ],
    gs3: [
      { unit_id: 'gs31', building_id: 'blood_adept_chamber', label: 'Blood Adept Chamber' },
      { unit_id: 'gs32', building_id: 'necromancer_crypt',    label: 'Necromancer Crypt' },
      { unit_id: 'gs33', building_id: 'plague_scholar_lab',   label: 'Plague Scholar Lab' },
    ],
    gs4: [
      { unit_id: 'gs41', building_id: 'dragon_c_death_barrow', label: 'Death Dragon Barrow' },
      { unit_id: 'gs42', building_id: 'dragon_c_aerem',        label: 'Aerem Dragon Shrine' },
    ],
    gs5: [
      { unit_id: 'gs51', building_id: 'reformed_crypt',   label: 'Reformed Crypt' },
      { unit_id: 'gs52', building_id: 'skeletal_mage_tower', label: 'Skeletal Mage Tower' },
    ],
    gs6: [
      { unit_id: 'gs61', building_id: 'specter_hall',     label: 'Specter Hall' },
      { unit_id: 'gs62', building_id: 'apparition_mist',  label: 'Apparition Mist' },
    ],
  },
};

// Hero level-up stat progressions.
// Each entry maps hero name -> level -> stat deltas applied on top of the previous level.
// Level 1 = base stats from HERO_DATA (no entry needed).
// Level N requires throne to be at level N.
// Passives and actives will be added later; only core combat stats for now.
const HERO_LEVEL_DATA = {
  warlord: {
    2: { hp: 20, armor: 2, initiative:  0, action_power: 5 },
    3: { hp: 25, armor: 3, initiative:  5, action_power: 5 },
    4: { hp: 30, armor: 4, initiative:  5, action_power: 8 },
  },
  hexblade: {
    2: { hp: 15, armor: 1, initiative:  5, action_power: 6 },
    3: { hp: 18, armor: 1, initiative:  5, action_power: 7 },
    4: { hp: 22, armor: 2, initiative: 10, action_power: 9 },
  },
  shadowbow: {
    2: { hp: 15, armor: 1, initiative: 10, action_power: 5 },
    3: { hp: 18, armor: 1, initiative: 10, action_power: 6 },
    4: { hp: 22, armor: 2, initiative: 15, action_power: 8 },
  },
  paladin: {
    2: { hp: 18, armor: 2, initiative:  0, action_power: 4 },
    3: { hp: 22, armor: 3, initiative:  5, action_power: 5 },
    4: { hp: 28, armor: 4, initiative:  5, action_power: 7 },
  },
  inquisitor: {
    2: { hp: 14, armor: 1, initiative:  5, action_power: 5 },
    3: { hp: 18, armor: 1, initiative:  5, action_power: 7 },
    4: { hp: 22, armor: 2, initiative: 10, action_power: 9 },
  },
  ranger: {
    2: { hp: 15, armor: 1, initiative: 10, action_power: 5 },
    3: { hp: 18, armor: 1, initiative: 15, action_power: 6 },
    4: { hp: 22, armor: 2, initiative: 15, action_power: 8 },
  },
};

// Maximum hero level (matches max throne level)
const HERO_MAX_LEVEL = 4;

// Throne upgrade costs per target level (cost to upgrade from level N-1 to N)
const THRONE_UPGRADE_COSTS = {
  2: { gold: 150, mana:   0 },
  3: { gold: 300, mana:  50 },
  4: { gold: 600, mana: 150 },
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

// Compute a hero's current stats by stacking all level deltas up to heroLevel.
function computeHeroStats(heroKey, baseStats, heroLevel) {
  const levels = HERO_LEVEL_DATA[heroKey] || {};
  const result = { ...baseStats };
  for (let lvl = 2; lvl <= heroLevel; lvl++) {
    const delta = levels[lvl];
    if (!delta) continue;
    for (const [stat, val] of Object.entries(delta)) {
      if (result[stat] !== undefined) result[stat] += val;
    }
  }
  return result;
}

module.exports = {
  BUILDING_POOLS,
  BUILD_TIMES_MS,
  SLOT_CATEGORIES,
  UNIT_UPGRADE_PATHS,
  HERO_LEVEL_DATA,
  HERO_MAX_LEVEL,
  THRONE_UPGRADE_COSTS,
  getBuildingDef,
  emptyStructures,
  computeHeroStats,
};