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
      { id: 'throne', label: 'Throne', category: 'throne', unit_id: null },
      { id: 'paladin_cathedral_1', label: 'Paladin Cathedral', category: 'throne', unit_id: 'h_e_1', tier: 1, upgrades: ['h_e_11', 'h_e_12'] },
      { id: 'paladin_cathedral_2', label: 'Paladin Cathedral II', category: 'throne', unit_id: 'h_e_11', tier: 2, upgrades: ['h_e_111', 'h_e_112'] },
      { id: 'paladin_cathedral_2_b', label: 'Paladin Cathedral II B', category: 'throne', unit_id: 'h_e_12', tier: 2, upgrades: ['h_e_121', 'h_e_122'] },
      { id: 'paladin_cathedral_3_a', label: 'Paladin Cathedral III A', category: 'throne', unit_id: 'h_e_111', tier: 3, upgrades: ['h_e_1111', 'h_e_1112'] },
      { id: 'paladin_cathedral_3_a_alt', label: 'Paladin Cathedral III A Alt', category: 'throne', unit_id: 'h_e_112', tier: 3, upgrades: ['h_e_1121', 'h_e_1122'] },
      { id: 'paladin_cathedral_3_b', label: 'Paladin Cathedral III B', category: 'throne', unit_id: 'h_e_121', tier: 3, upgrades: ['h_e_1211', 'h_e_1212'] },
      { id: 'paladin_cathedral_3_b_alt', label: 'Paladin Cathedral III B Alt', category: 'throne', unit_id: 'h_e_122', tier: 3, upgrades: ['h_e_1221', 'h_e_1222'] },
      { id: 'paladin_cathedral_4_a', label: 'Paladin Cathedral IV A', category: 'throne', unit_id: 'h_e_1111', tier: 4, upgrades: [] },
      { id: 'paladin_cathedral_4_a_alt', label: 'Paladin Cathedral IV A Alt', category: 'throne', unit_id: 'h_e_1112', tier: 4, upgrades: [] },
      { id: 'paladin_cathedral_4_a_alt2', label: 'Paladin Cathedral IV A Alt 2', category: 'throne', unit_id: 'h_e_1121', tier: 4, upgrades: [] },
      { id: 'paladin_cathedral_4_a_alt3', label: 'Paladin Cathedral IV A Alt 3', category: 'throne', unit_id: 'h_e_1122', tier: 4, upgrades: [] },
      { id: 'paladin_cathedral_4_b', label: 'Paladin Cathedral IV B', category: 'throne', unit_id: 'h_e_1211', tier: 4, upgrades: [] },
      { id: 'paladin_cathedral_4_b_alt', label: 'Paladin Cathedral IV B Alt', category: 'throne', unit_id: 'h_e_1212', tier: 4, upgrades: [] },
      { id: 'paladin_cathedral_4_b_alt2', label: 'Paladin Cathedral IV B Alt 2', category: 'throne', unit_id: 'h_e_1221', tier: 4, upgrades: [] },
      { id: 'paladin_cathedral_4_b_alt3', label: 'Paladin Cathedral IV B Alt 3', category: 'throne', unit_id: 'h_e_1222', tier: 4, upgrades: [] },
      { id: 'inquisitor_tower_1', label: 'Inquisitor Tower', category: 'throne', unit_id: 'h_e_2', tier: 1, upgrades: ['h_e_2_t2', 'h_e_2_t3', 'h_e_2_t4'] },
      { id: 'inquisitor_tower_2', label: 'Inquisitor Tower II', category: 'throne', unit_id: 'h_e_2_t2', tier: 2, upgrades: ['h_e_2_t3'] },
      { id: 'inquisitor_tower_3', label: 'Inquisitor Tower III', category: 'throne', unit_id: 'h_e_2_t3', tier: 3, upgrades: ['h_e_2_t4'] },
      { id: 'inquisitor_tower_4', label: 'Inquisitor Tower IV', category: 'throne', unit_id: 'h_e_2_t4', tier: 4, upgrades: [] },
      { id: 'ranger_outpost_1', label: 'Ranger Outpost', category: 'throne', unit_id: 'h_e_3', tier: 1, upgrades: ['h_e_3_t2', 'h_e_3_t3', 'h_e_3_t4'] },
      { id: 'ranger_outpost_2', label: 'Ranger Outpost II', category: 'throne', unit_id: 'h_e_3_t2', tier: 2, upgrades: ['h_e_3_t3'] },
      { id: 'ranger_outpost_3', label: 'Ranger Outpost III', category: 'throne', unit_id: 'h_e_3_t3', tier: 3, upgrades: ['h_e_3_t4'] },
      { id: 'ranger_outpost_4', label: 'Ranger Outpost IV', category: 'throne', unit_id: 'h_e_3_t4', tier: 4, upgrades: [] },
    ],
    barracks: [
      { id: 'conscript_barracks', label: 'Conscript Barracks', category: 'barracks', tier: 1, unit: 'conscript', unit_id: 'e1', upgrades: ['e11', 'e12'], cost: { gold: 50 } },
      { id: 'cavalry_stables', label: 'Cavalry Stables', category: 'barracks', tier: 2, unit: 'horseman', unit_id: 'e12', upgrades: ['e11', 'e12'], cost: { gold: 50 } },
      { id: 'acolyte_shrine', label: 'Acolyte Shrine', category: 'barracks', tier: 1, unit: 'acolyte', unit_id: 'e2', upgrades: ['e21', 'e22', 'e23'], cost: { gold: 50 } },
      { id: 'mage_tower', label: 'Mage Tower', category: 'barracks', tier: 1, unit: 'apprentice', unit_id: 'e4', upgrades: ['e41', 'e42'], cost: { gold: 50 } },
      { id: 'scout_post', label: 'Scout Post', category: 'barracks', tier: 1, unit: 'scout', unit_id: 'e8', upgrades: ['e81', 'e82'], cost: { gold: 50 } },
      { id: 'workshop', label: 'Workshop', category: 'barracks', tier: 1, unit: 'smith', unit_id: 'e6', upgrades: ['e61', 'e62'], cost: { gold: 50 } },
      { id: 'workshop_ii', label: 'Workshop II', category: 'barracks', tier: 2, unit: 'mechanic', unit_id: 'e61', upgrades: [], cost: { gold: 50 } },
      { id: 'workshop_iii', label: 'Workshop III', category: 'barracks', tier: 2, unit: 'rifleman', unit_id: 'e62', upgrades: [], cost: { gold: 50 } },
      { id: 'archer_range', label: 'Archer Range', category: 'barracks', tier: 2, unit: 'archer', unit_id: 'e81', upgrades: [], cost: { gold: 50 } },
      { id: 'sniper_nest', label: 'Sniper Nest', category: 'barracks', tier: 2, unit: 'sniper', unit_id: 'e82', upgrades: [], cost: { gold: 50 } },
      { id: 'priest_shrine', label: 'Priest Shrine', category: 'barracks', tier: 2, unit: 'priest', unit_id: 'e22', upgrades: [], cost: { gold: 50 } },
      { id: 'sun_temple', label: 'Sun Temple', category: 'barracks', tier: 2, unit: 'templar', unit_id: 'e21', upgrades: [], cost: { gold: 50 } },
      { id: 'purgator_chapel', label: 'Purgator Chapel', category: 'barracks', tier: 2, unit: 'purgator', unit_id: 'e23', upgrades: [], cost: { gold: 50 } },
    ],
    any: [
      { id: 'market', label: 'Market', category: 'any', unit_id: null },
      { id: 'watchtower', label: 'Watchtower', category: 'any', unit_id: null },
    ],
  },
  choir_of_the_cursed: {
    throne: [
      { id: 'dark_throne', label: 'Dark Throne', category: 'throne', unit_id: null },
      { id: 'warlord_keep_1', label: 'Warlord Keep', category: 'throne', unit_id: 'h_d_1', tier: 1, upgrades: ['h_d_1_t2', 'h_d_1_t3', 'h_d_1_t4'] },
      { id: 'warlord_keep_2', label: 'Warlord Keep II', category: 'throne', unit_id: 'h_d_1_t2', tier: 2, upgrades: ['h_d_1_t3'] },
      { id: 'warlord_keep_3', label: 'Warlord Keep III', category: 'throne', unit_id: 'h_d_1_t3', tier: 3, upgrades: ['h_d_1_t4'] },
      { id: 'warlord_keep_4', label: 'Warlord Keep IV', category: 'throne', unit_id: 'h_d_1_t4', tier: 4, upgrades: [] },
      { id: 'hexblade_sanctum_1', label: 'Hexblade Sanctum', category: 'throne', unit_id: 'h_d_2', tier: 1, upgrades: ['h_d_2_t2', 'h_d_2_t3', 'h_d_2_t4'] },
      { id: 'hexblade_sanctum_2', label: 'Hexblade Sanctum II', category: 'throne', unit_id: 'h_d_2_t2', tier: 2, upgrades: ['h_d_2_t3'] },
      { id: 'hexblade_sanctum_3', label: 'Hexblade Sanctum III', category: 'throne', unit_id: 'h_d_2_t3', tier: 3, upgrades: ['h_d_2_t4'] },
      { id: 'hexblade_sanctum_4', label: 'Hexblade Sanctum IV', category: 'throne', unit_id: 'h_d_2_t4', tier: 4, upgrades: [] },
      { id: 'shadowbow_den_1', label: 'Shadowbow Den', category: 'throne', unit_id: 'h_d_3', tier: 1, upgrades: ['h_d_3_t2', 'h_d_3_t3', 'h_d_3_t4'] },
      { id: 'shadowbow_den_2', label: 'Shadowbow Den II', category: 'throne', unit_id: 'h_d_3_t2', tier: 2, upgrades: ['h_d_3_t3'] },
      { id: 'shadowbow_den_3', label: 'Shadowbow Den III', category: 'throne', unit_id: 'h_d_3_t3', tier: 3, upgrades: ['h_d_3_t4'] },
      { id: 'shadowbow_den_4', label: 'Shadowbow Den IV', category: 'throne', unit_id: 'h_d_3_t4', tier: 4, upgrades: [] },
    ],
    barracks: [
      { id: 'heretic_pit', label: 'Heretic Pit', category: 'barracks', tier: 1, unit: 'heretic', unit_id: 'd1', upgrades: ['d3'], cost: { gold: 50 } },
      { id: 'imp_den', label: 'Imp Den', category: 'barracks', tier: 1, unit: 'imp', unit_id: 'd2', upgrades: [], cost: { gold: 50 } },
      { id: 'possession_altar', label: 'Possession Altar', category: 'barracks', tier: 1, unit: 'possessed', unit_id: 'd3', upgrades: [], cost: { gold: 50 } },
    ],
    any: [
      { id: 'cursed_vault', label: 'Cursed Vault', category: 'any', unit_id: null },
      { id: 'shadow_shrine', label: 'Shadow Shrine', category: 'any', unit_id: null },
    ],
  },
  grail_of_sorrow: {
    throne: [
      { id: 'sorrow_throne', label: 'Throne of Sorrow', category: 'throne', unit_id: null },
    ],
    barracks: [
      { id: 'zombie_pit', label: 'Zombie Pit', category: 'barracks', tier: 1, unit: 'zombie_risen', unit_id: 'gs1', upgrades: ['gs11', 'gs12', 'gs13'], cost: { gold: 50 } },
      { id: 'catapult_workshop', label: 'Catapult Workshop', category: 'barracks', tier: 1, unit: 'catapult', unit_id: 'gs2', upgrades: ['gs21', 'gs22'], cost: { gold: 50 } },
      { id: 'adept_crypt', label: 'Adept Crypt', category: 'barracks', tier: 1, unit: 'adept', unit_id: 'gs3', upgrades: ['gs31', 'gs32', 'gs33'], cost: { gold: 50 } },
      { id: 'dragon_barrow', label: 'Dragon Barrow', category: 'barracks', tier: 1, unit: 'dragon_c', unit_id: 'gs4', upgrades: ['gs41', 'gs42'], cost: { gold: 50 } },
      { id: 'skeleton_crypt', label: 'Skeleton Crypt', category: 'barracks', tier: 1, unit: 'skeleton', unit_id: 'gs5', upgrades: ['gs51', 'gs52'], cost: { gold: 50 } },
      { id: 'ghost_manor', label: 'Ghost Manor', category: 'barracks', tier: 1, unit: 'ghost', unit_id: 'gs6', upgrades: ['gs61', 'gs62'], cost: { gold: 50 } },
    ],
    any: [
      { id: 'sorrow_altar', label: 'Altar of Sorrow', category: 'any', unit_id: null },
      { id: 'soul_vault', label: 'Soul Vault', category: 'any', unit_id: null },
    ],
  },
};

const UNIT_UPGRADE_PATHS = {
  empire: {
    e1: [
      { unit_id: 'e11', building_id: 'infantry_barracks', label: 'Infantry Barracks' },
      { unit_id: 'e12', building_id: 'cavalry_stables', label: 'Cavalry Stables' },
    ],
    e2: [
      { unit_id: 'e21', building_id: 'priest_shrine', label: 'Priest Shrine' },
      { unit_id: 'e22', building_id: 'sun_temple', label: 'Sun Temple' },
      { unit_id: 'e23', building_id: 'purgator_chapel', label: 'Purgator Chapel' },
    ],
    e4: [
      { unit_id: 'e41', building_id: 'red_mage_tower', label: 'Red Mage Tower' },
      { unit_id: 'e42', building_id: 'wizard_tower', label: 'Wizard Tower' },
    ],
    e8: [
      { unit_id: 'e81', building_id: 'archer_range', label: 'Archer Range' },
      { unit_id: 'e82', building_id: 'sniper_nest', label: 'Sniper Nest' },
    ],
    h_e_1: [
      { unit_id: 'h_e_11', building_id: 'paladin_cathedral_2', label: 'Paladin Cathedral II' },
      { unit_id: 'h_e_12', building_id: 'paladin_cathedral_2_b', label: 'Paladin Cathedral II B' },
    ],
    h_e_11: [
      { unit_id: 'h_e_111', building_id: 'paladin_cathedral_3_a', label: 'Paladin Cathedral III A' },
      { unit_id: 'h_e_112', building_id: 'paladin_cathedral_3_a_alt', label: 'Paladin Cathedral III A Alt' },
    ],
    h_e_12: [
      { unit_id: 'h_e_121', building_id: 'paladin_cathedral_3_b', label: 'Paladin Cathedral III B' },
      { unit_id: 'h_e_122', building_id: 'paladin_cathedral_3_b_alt', label: 'Paladin Cathedral III B Alt' },
    ],
    h_e_111: [
      { unit_id: 'h_e_1111', building_id: 'paladin_cathedral_4_a', label: 'Paladin Cathedral IV A' },
      { unit_id: 'h_e_1112', building_id: 'paladin_cathedral_4_a_alt', label: 'Paladin Cathedral IV A Alt' },
    ],
    h_e_112: [
      { unit_id: 'h_e_1121', building_id: 'paladin_cathedral_4_a_alt2', label: 'Paladin Cathedral IV A Alt 2' },
      { unit_id: 'h_e_1122', building_id: 'paladin_cathedral_4_a_alt3', label: 'Paladin Cathedral IV A Alt 3' },
    ],
    h_e_121: [
      { unit_id: 'h_e_1211', building_id: 'paladin_cathedral_4_b', label: 'Paladin Cathedral IV B' },
      { unit_id: 'h_e_1212', building_id: 'paladin_cathedral_4_b_alt', label: 'Paladin Cathedral IV B Alt' },
    ],
    h_e_122: [
      { unit_id: 'h_e_1221', building_id: 'paladin_cathedral_4_b_alt2', label: 'Paladin Cathedral IV B Alt 2' },
      { unit_id: 'h_e_1222', building_id: 'paladin_cathedral_4_b_alt3', label: 'Paladin Cathedral IV B Alt 3' },
    ],
    h_e_2: [
      { unit_id: 'h_e_2_t2', building_id: 'inquisitor_tower_2', label: 'Inquisitor Tower II' },
    ],
    h_e_2_t2: [
      { unit_id: 'h_e_2_t3', building_id: 'inquisitor_tower_3', label: 'Inquisitor Tower III' },
    ],
    h_e_2_t3: [
      { unit_id: 'h_e_2_t4', building_id: 'inquisitor_tower_4', label: 'Inquisitor Tower IV' },
    ],
    h_e_3: [
      { unit_id: 'h_e_3_t2', building_id: 'ranger_outpost_2', label: 'Ranger Outpost II' },
    ],
    h_e_3_t2: [
      { unit_id: 'h_e_3_t3', building_id: 'ranger_outpost_3', label: 'Ranger Outpost III' },
    ],
    h_e_3_t3: [
      { unit_id: 'h_e_3_t4', building_id: 'ranger_outpost_4', label: 'Ranger Outpost IV' },
    ],
  },
  choir_of_the_cursed: {
    d1: [
      { unit_id: 'd3', building_id: 'possession_altar', label: 'Possession Altar' },
    ],
    h_d_1: [
      { unit_id: 'h_d_1_t2', building_id: 'warlord_keep_2', label: 'Warlord Keep II' },
    ],
    h_d_1_t2: [
      { unit_id: 'h_d_1_t3', building_id: 'warlord_keep_3', label: 'Warlord Keep III' },
    ],
    h_d_1_t3: [
      { unit_id: 'h_d_1_t4', building_id: 'warlord_keep_4', label: 'Warlord Keep IV' },
    ],
    h_d_2: [
      { unit_id: 'h_d_2_t2', building_id: 'hexblade_sanctum_2', label: 'Hexblade Sanctum II' },
    ],
    h_d_2_t2: [
      { unit_id: 'h_d_2_t3', building_id: 'hexblade_sanctum_3', label: 'Hexblade Sanctum III' },
    ],
    h_d_2_t3: [
      { unit_id: 'h_d_2_t4', building_id: 'hexblade_sanctum_4', label: 'Hexblade Sanctum IV' },
    ],
    h_d_3: [
      { unit_id: 'h_d_3_t2', building_id: 'shadowbow_den_2', label: 'Shadowbow Den II' },
    ],
    h_d_3_t2: [
      { unit_id: 'h_d_3_t3', building_id: 'shadowbow_den_3', label: 'Shadowbow Den III' },
    ],
    h_d_3_t3: [
      { unit_id: 'h_d_3_t4', building_id: 'shadowbow_den_4', label: 'Shadowbow Den IV' },
    ],
  },
  grail_of_sorrow: {
    gs1: [
      { unit_id: 'gs11', building_id: 'poison_ghoul_pit', label: 'Poison Ghoul Pit' },
      { unit_id: 'gs12', building_id: 'cannibal_ghoul_pit', label: 'Cannibal Ghoul Pit' },
      { unit_id: 'gs13', building_id: 'cesswalker_mire', label: 'Cesswalker Mire' },
    ],
    gs2: [
      { unit_id: 'gs21', building_id: 'corpse_launcher_workshop', label: 'Corpse Launcher Workshop' },
      { unit_id: 'gs22', building_id: 'meat_wagon_butchery', label: 'Meat Wagon Butchery' },
    ],
    gs3: [
      { unit_id: 'gs31', building_id: 'blood_adept_chamber', label: 'Blood Adept Chamber' },
      { unit_id: 'gs32', building_id: 'necromancer_crypt', label: 'Necromancer Crypt' },
      { unit_id: 'gs33', building_id: 'plague_scholar_lab', label: 'Plague Scholar Lab' },
    ],
    gs4: [
      { unit_id: 'gs41', building_id: 'dragon_c_death_barrow', label: 'Death Dragon Barrow' },
      { unit_id: 'gs42', building_id: 'dragon_c_aerem', label: 'Aerem Dragon Shrine' },
    ],
    gs5: [
      { unit_id: 'gs51', building_id: 'reformed_crypt', label: 'Reformed Crypt' },
      { unit_id: 'gs52', building_id: 'skeletal_mage_tower', label: 'Skeletal Mage Tower' },
    ],
    gs6: [
      { unit_id: 'gs61', building_id: 'specter_hall', label: 'Specter Hall' },
      { unit_id: 'gs62', building_id: 'apparition_mist', label: 'Apparition Mist' },
    ],
  },
};

const HERO_MAX_LEVEL = 4;

const THRONE_UPGRADE_COSTS = {
  2: { gold: 150 },
  3: { gold: 300 },
  4: { gold: 600 },
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
  const slots = { slot_0: { level: 1, building_id: null } };
  for (let i = 1; i <= 8; i++) {
    slots[`slot_${i}`] = { level: 0, building_id: null };
  }
  return slots;
}

module.exports = {
  BUILDING_POOLS,
  SLOT_CATEGORIES,
  UNIT_UPGRADE_PATHS,
  HERO_MAX_LEVEL,
  THRONE_UPGRADE_COSTS,
  getBuildingDef,
  emptyStructures,
};