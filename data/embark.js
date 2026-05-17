import { UNITS } from './units.js';

const REGION_ENCOUNTERS = {
  life_grove: {
    level_1:  [
      { key: 'life_grove.grove_sprite',  cell: 0 },
      { key: 'life_grove.thornback',     cell: 2 },
      { key: 'life_grove.grove_sprite',  cell: 4 },
    ],
    level_2:  [
      { key: 'life_grove.thornback',     cell: 0 },
      { key: 'life_grove.vine_lurker',   cell: 2 },
      { key: 'life_grove.grove_sprite',  cell: 1 },
      { key: 'life_grove.grove_sprite',  cell: 4 },
    ],
    level_3:  [
      { key: 'life_grove.vine_lurker',   cell: 0 },
      { key: 'life_grove.root_golem',    cell: 2 },
      { key: 'life_grove.thornback',     cell: 1 },
      { key: 'life_grove.grove_sprite',  cell: 4 },
    ],
    level_4:  [
      { key: 'life_grove.root_golem',    cell: 0 },
      { key: 'life_grove.vine_lurker',   cell: 2 },
      { key: 'life_grove.dryad_healer',  cell: 4 },
      { key: 'life_grove.thornback',     cell: 1 },
      { key: 'life_grove.grove_sprite',  cell: 3 },
    ],
    level_5:  [
      { key: 'life_grove.overgrown_stalker', cell: 0 },
      { key: 'life_grove.dryad_healer',      cell: 2 },
      { key: 'life_grove.vine_lurker',       cell: 1 },
      { key: 'life_grove.root_golem',        cell: 4 },
    ],
    level_6:  [
      { key: 'life_grove.overgrown_stalker', cell: 0 },
      { key: 'life_grove.spore_shaman',      cell: 2 },
      { key: 'life_grove.dryad_healer',      cell: 4 },
      { key: 'life_grove.vine_lurker',       cell: 1 },
      { key: 'life_grove.root_golem',        cell: 3 },
    ],
    level_7:  [
      { key: 'life_grove.ancient_treant',    cell: 2 },
      { key: 'life_grove.spore_shaman',      cell: 0 },
      { key: 'life_grove.dryad_healer',      cell: 4 },
      { key: 'life_grove.overgrown_stalker', cell: 1 },
      { key: 'life_grove.vine_lurker',       cell: 3 },
    ],
    level_8:  [
      { key: 'life_grove.ancient_treant',    cell: 2 },
      { key: 'life_grove.lifebringer',       cell: 0 },
      { key: 'life_grove.spore_shaman',      cell: 4 },
      { key: 'life_grove.overgrown_stalker', cell: 1 },
      { key: 'life_grove.root_golem',        cell: 3 },
    ],
    level_9:  [
      { key: 'life_grove.world_serpent',     cell: 0 },
      { key: 'life_grove.lifebringer',       cell: 2 },
      { key: 'life_grove.ancient_treant',    cell: 4 },
      { key: 'life_grove.spore_shaman',      cell: 1 },
      { key: 'life_grove.dryad_healer',      cell: 3 },
    ],
    level_10: [
      { key: 'life_grove.world_serpent',     cell: 0 },
      { key: 'life_grove.ancient_treant',    cell: 2 },
      { key: 'life_grove.lifebringer',       cell: 4 },
      { key: 'life_grove.spore_shaman',      cell: 1 },
      { key: 'life_grove.overgrown_stalker', cell: 3 },
    ],
  },

  fire_wastes: {
    level_1:  [
      { key: 'fire_wastes.ash_crawler',  cell: 0 },
      { key: 'fire_wastes.flame_imp',    cell: 2 },
      { key: 'fire_wastes.ash_crawler',  cell: 4 },
    ],
    level_2:  [
      { key: 'fire_wastes.flame_imp',    cell: 0 },
      { key: 'fire_wastes.lava_hound',   cell: 2 },
      { key: 'fire_wastes.ash_crawler',  cell: 1 },
      { key: 'fire_wastes.flame_imp',    cell: 4 },
    ],
    level_3:  [
      { key: 'fire_wastes.lava_hound',   cell: 0 },
      { key: 'fire_wastes.pyroclast',    cell: 2 },
      { key: 'fire_wastes.ash_crawler',  cell: 1 },
      { key: 'fire_wastes.flame_imp',    cell: 4 },
    ],
    level_4:  [
      { key: 'fire_wastes.cinder_knight', cell: 0 },
      { key: 'fire_wastes.pyroclast',     cell: 2 },
      { key: 'fire_wastes.lava_hound',    cell: 4 },
      { key: 'fire_wastes.flame_imp',     cell: 1 },
      { key: 'fire_wastes.ash_crawler',   cell: 3 },
    ],
    level_5:  [
      { key: 'fire_wastes.magma_brute',   cell: 0 },
      { key: 'fire_wastes.pyroclast',     cell: 2 },
      { key: 'fire_wastes.cinder_knight', cell: 4 },
      { key: 'fire_wastes.lava_hound',    cell: 1 },
    ],
    level_6:  [
      { key: 'fire_wastes.magma_brute',   cell: 0 },
      { key: 'fire_wastes.hellfire_witch', cell: 2 },
      { key: 'fire_wastes.cinder_knight', cell: 4 },
      { key: 'fire_wastes.pyroclast',     cell: 1 },
      { key: 'fire_wastes.lava_hound',    cell: 3 },
    ],
    level_7:  [
      { key: 'fire_wastes.inferno_titan', cell: 0 },
      { key: 'fire_wastes.hellfire_witch', cell: 2 },
      { key: 'fire_wastes.magma_brute',   cell: 4 },
      { key: 'fire_wastes.pyroclast',     cell: 1 },
      { key: 'fire_wastes.cinder_knight', cell: 3 },
    ],
    level_8:  [
      { key: 'fire_wastes.inferno_titan', cell: 0 },
      { key: 'fire_wastes.flame_oracle',  cell: 2 },
      { key: 'fire_wastes.hellfire_witch', cell: 4 },
      { key: 'fire_wastes.magma_brute',   cell: 1 },
      { key: 'fire_wastes.cinder_knight', cell: 3 },
    ],
    level_9:  [
      { key: 'fire_wastes.lord_of_cinders', cell: 0 },
      { key: 'fire_wastes.flame_oracle',    cell: 2 },
      { key: 'fire_wastes.inferno_titan',   cell: 4 },
      { key: 'fire_wastes.hellfire_witch',  cell: 1 },
      { key: 'fire_wastes.pyroclast',       cell: 3 },
    ],
    level_10: [
      { key: 'fire_wastes.lord_of_cinders', cell: 0 },
      { key: 'fire_wastes.inferno_titan',   cell: 2 },
      { key: 'fire_wastes.flame_oracle',    cell: 4 },
      { key: 'fire_wastes.hellfire_witch',  cell: 1 },
      { key: 'fire_wastes.magma_brute',     cell: 3 },
    ],
  },

  death_crypts: {
    level_1:  [
      { key: 'death_crypts.grave_rat',    cell: 0 },
      { key: 'death_crypts.risen_soldier', cell: 2 },
      { key: 'death_crypts.grave_rat',    cell: 4 },
    ],
    level_2:  [
      { key: 'death_crypts.risen_soldier', cell: 0 },
      { key: 'death_crypts.wailing_ghost', cell: 2 },
      { key: 'death_crypts.grave_rat',     cell: 1 },
      { key: 'death_crypts.risen_soldier', cell: 4 },
    ],
    level_3:  [
      { key: 'death_crypts.wailing_ghost',  cell: 0 },
      { key: 'death_crypts.crypt_guardian', cell: 2 },
      { key: 'death_crypts.risen_soldier',  cell: 1 },
      { key: 'death_crypts.grave_rat',      cell: 4 },
    ],
    level_4:  [
      { key: 'death_crypts.crypt_guardian', cell: 0 },
      { key: 'death_crypts.death_herald',   cell: 2 },
      { key: 'death_crypts.wailing_ghost',  cell: 4 },
      { key: 'death_crypts.risen_soldier',  cell: 1 },
      { key: 'death_crypts.grave_rat',      cell: 3 },
    ],
    level_5:  [
      { key: 'death_crypts.tomb_colossus',  cell: 0 },
      { key: 'death_crypts.death_herald',   cell: 2 },
      { key: 'death_crypts.wailing_ghost',  cell: 4 },
      { key: 'death_crypts.crypt_guardian', cell: 1 },
    ],
    level_6:  [
      { key: 'death_crypts.tomb_colossus',  cell: 0 },
      { key: 'death_crypts.revenant',       cell: 2 },
      { key: 'death_crypts.death_herald',   cell: 4 },
      { key: 'death_crypts.crypt_guardian', cell: 1 },
      { key: 'death_crypts.wailing_ghost',  cell: 3 },
    ],
    level_7:  [
      { key: 'death_crypts.dread_knight',   cell: 0 },
      { key: 'death_crypts.soul_harvester', cell: 2 },
      { key: 'death_crypts.tomb_colossus',  cell: 4 },
      { key: 'death_crypts.revenant',       cell: 1 },
      { key: 'death_crypts.death_herald',   cell: 3 },
    ],
    level_8:  [
      { key: 'death_crypts.dread_knight',   cell: 0 },
      { key: 'death_crypts.soul_harvester', cell: 2 },
      { key: 'death_crypts.revenant',       cell: 4 },
      { key: 'death_crypts.tomb_colossus',  cell: 1 },
      { key: 'death_crypts.death_herald',   cell: 3 },
    ],
    level_9:  [
      { key: 'death_crypts.lich_king',      cell: 0 },
      { key: 'death_crypts.dread_knight',   cell: 2 },
      { key: 'death_crypts.soul_harvester', cell: 4 },
      { key: 'death_crypts.revenant',       cell: 1 },
      { key: 'death_crypts.wailing_ghost',  cell: 3 },
    ],
    level_10: [
      { key: 'death_crypts.lich_king',      cell: 0 },
      { key: 'death_crypts.dread_knight',   cell: 2 },
      { key: 'death_crypts.soul_harvester', cell: 4 },
      { key: 'death_crypts.tomb_colossus',  cell: 1 },
      { key: 'death_crypts.revenant',       cell: 3 },
    ],
  },

  frost_peaks: {
    level_1:  [
      { key: 'frost_peaks.ice_shard',  cell: 0 },
      { key: 'frost_peaks.frost_imp',  cell: 2 },
      { key: 'frost_peaks.ice_shard',  cell: 4 },
    ],
    level_2:  [
      { key: 'frost_peaks.frost_imp',  cell: 0 },
      { key: 'frost_peaks.tundra_wolf', cell: 2 },
      { key: 'frost_peaks.ice_shard',  cell: 1 },
      { key: 'frost_peaks.frost_imp',  cell: 4 },
    ],
    level_3:  [
      { key: 'frost_peaks.tundra_wolf',    cell: 0 },
      { key: 'frost_peaks.glacial_knight', cell: 2 },
      { key: 'frost_peaks.ice_shard',      cell: 1 },
      { key: 'frost_peaks.frost_imp',      cell: 4 },
    ],
    level_4:  [
      { key: 'frost_peaks.glacial_knight',  cell: 0 },
      { key: 'frost_peaks.blizzard_caster', cell: 2 },
      { key: 'frost_peaks.tundra_wolf',     cell: 4 },
      { key: 'frost_peaks.frost_imp',       cell: 1 },
      { key: 'frost_peaks.ice_shard',       cell: 3 },
    ],
    level_5:  [
      { key: 'frost_peaks.permafrost_giant', cell: 0 },
      { key: 'frost_peaks.blizzard_caster',  cell: 2 },
      { key: 'frost_peaks.glacial_knight',   cell: 4 },
      { key: 'frost_peaks.tundra_wolf',      cell: 1 },
    ],
    level_6:  [
      { key: 'frost_peaks.permafrost_giant', cell: 0 },
      { key: 'frost_peaks.ice_empress',      cell: 2 },
      { key: 'frost_peaks.glacial_knight',   cell: 4 },
      { key: 'frost_peaks.blizzard_caster',  cell: 1 },
      { key: 'frost_peaks.tundra_wolf',      cell: 3 },
    ],
    level_7:  [
      { key: 'frost_peaks.avalanche_colossus', cell: 0 },
      { key: 'frost_peaks.ice_empress',        cell: 2 },
      { key: 'frost_peaks.permafrost_giant',   cell: 4 },
      { key: 'frost_peaks.blizzard_caster',    cell: 1 },
      { key: 'frost_peaks.glacial_knight',     cell: 3 },
    ],
    level_8:  [
      { key: 'frost_peaks.avalanche_colossus', cell: 0 },
      { key: 'frost_peaks.winter_oracle',      cell: 2 },
      { key: 'frost_peaks.ice_empress',        cell: 4 },
      { key: 'frost_peaks.permafrost_giant',   cell: 1 },
      { key: 'frost_peaks.glacial_knight',     cell: 3 },
    ],
    level_9:  [
      { key: 'frost_peaks.the_endless_frost',  cell: 0 },
      { key: 'frost_peaks.winter_oracle',      cell: 2 },
      { key: 'frost_peaks.avalanche_colossus', cell: 4 },
      { key: 'frost_peaks.ice_empress',        cell: 1 },
      { key: 'frost_peaks.blizzard_caster',    cell: 3 },
    ],
    level_10: [
      { key: 'frost_peaks.the_endless_frost',  cell: 0 },
      { key: 'frost_peaks.avalanche_colossus', cell: 2 },
      { key: 'frost_peaks.winter_oracle',      cell: 4 },
      { key: 'frost_peaks.ice_empress',        cell: 1 },
      { key: 'frost_peaks.permafrost_giant',   cell: 3 },
    ],
  },

  nature_wilds: {
    level_1:  [
      { key: 'nature_wilds.bog_creeper', cell: 0 },
      { key: 'nature_wilds.venomfang',   cell: 2 },
      { key: 'nature_wilds.bog_creeper', cell: 4 },
    ],
    level_2:  [
      { key: 'nature_wilds.venomfang',   cell: 0 },
      { key: 'nature_wilds.moss_troll',  cell: 2 },
      { key: 'nature_wilds.bog_creeper', cell: 1 },
      { key: 'nature_wilds.venomfang',   cell: 4 },
    ],
    level_3:  [
      { key: 'nature_wilds.moss_troll',  cell: 0 },
      { key: 'nature_wilds.briar_witch', cell: 2 },
      { key: 'nature_wilds.venomfang',   cell: 1 },
      { key: 'nature_wilds.bog_creeper', cell: 4 },
    ],
    level_4:  [
      { key: 'nature_wilds.alpha_predator', cell: 0 },
      { key: 'nature_wilds.briar_witch',    cell: 2 },
      { key: 'nature_wilds.moss_troll',     cell: 4 },
      { key: 'nature_wilds.venomfang',      cell: 1 },
      { key: 'nature_wilds.bog_creeper',    cell: 3 },
    ],
    level_5:  [
      { key: 'nature_wilds.swamp_colossus', cell: 0 },
      { key: 'nature_wilds.briar_witch',    cell: 2 },
      { key: 'nature_wilds.alpha_predator', cell: 4 },
      { key: 'nature_wilds.moss_troll',     cell: 1 },
    ],
    level_6:  [
      { key: 'nature_wilds.swamp_colossus',  cell: 0 },
      { key: 'nature_wilds.spiderweb_queen', cell: 2 },
      { key: 'nature_wilds.alpha_predator',  cell: 4 },
      { key: 'nature_wilds.briar_witch',     cell: 1 },
      { key: 'nature_wilds.moss_troll',      cell: 3 },
    ],
    level_7:  [
      { key: 'nature_wilds.primordial_beast', cell: 0 },
      { key: 'nature_wilds.spiderweb_queen',  cell: 2 },
      { key: 'nature_wilds.swamp_colossus',   cell: 4 },
      { key: 'nature_wilds.briar_witch',      cell: 1 },
      { key: 'nature_wilds.alpha_predator',   cell: 3 },
    ],
    level_8:  [
      { key: 'nature_wilds.primordial_beast', cell: 0 },
      { key: 'nature_wilds.grove_sovereign',  cell: 2 },
      { key: 'nature_wilds.spiderweb_queen',  cell: 4 },
      { key: 'nature_wilds.swamp_colossus',   cell: 1 },
      { key: 'nature_wilds.alpha_predator',   cell: 3 },
    ],
    level_9:  [
      { key: 'nature_wilds.the_devouring_root', cell: 0 },
      { key: 'nature_wilds.grove_sovereign',    cell: 2 },
      { key: 'nature_wilds.primordial_beast',   cell: 4 },
      { key: 'nature_wilds.spiderweb_queen',    cell: 1 },
      { key: 'nature_wilds.briar_witch',        cell: 3 },
    ],
    level_10: [
      { key: 'nature_wilds.the_devouring_root', cell: 0 },
      { key: 'nature_wilds.primordial_beast',   cell: 2 },
      { key: 'nature_wilds.grove_sovereign',    cell: 4 },
      { key: 'nature_wilds.spiderweb_queen',    cell: 1 },
      { key: 'nature_wilds.swamp_colossus',     cell: 3 },
    ],
  },
};

function resolveUnitKey(key) {
  const [region, unitId] = key.split('.');
  return UNITS.enemies[region]?.[unitId] ?? null;
}

function getEncounter(region_id, level) {
  const regionKey = region_id.replace(' ', '_');
  const levelKey  = `level_${level}`;
  const slots     = REGION_ENCOUNTERS[regionKey]?.[levelKey];
  if (!slots) return [];

  return slots
    .map(slot => {
      const unitData = resolveUnitKey(slot.key);
      if (!unitData) return null;
      return { ...unitData, cell: slot.cell };
    })
    .filter(Boolean);
}

export { REGION_ENCOUNTERS, getEncounter };