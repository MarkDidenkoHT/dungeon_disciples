const REGIONS = [
  {
    id: 'life_grove',
    label: 'Life Grove',
    crystal_type: 'Crystals_Life',
    crystal_icon: '🟢',
    description: 'Ancient forests teeming with wardens and sacred beasts.',
    type: 'pve',
    difficulties: {
      normal: {
        food_cost: 10,
        rewards: { gold: 50, crystal: 10, xp: 20 },
        enemies: [
          { id: 'grove_warden',  name: 'Grove Warden',  hp: 60,  armor: 6,  initiative: 35, action: { value: 10, range: 1, target_type: 'enemy', target_amount: 'single' } },
          { id: 'sacred_beast',  name: 'Sacred Beast',  hp: 45,  armor: 2,  initiative: 50, action: { value: 8,  range: 1, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
      hard: {
        food_cost: 20,
        rewards: { gold: 80, crystal: 20, xp: 35 },
        enemies: [
          { id: 'grove_warden',   name: 'Grove Warden',   hp: 78,  armor: 8,  initiative: 35, action: { value: 13, range: 1, target_type: 'enemy', target_amount: 'single' } },
          { id: 'sacred_beast',   name: 'Sacred Beast',   hp: 58,  armor: 3,  initiative: 50, action: { value: 10, range: 1, target_type: 'enemy', target_amount: 'single' } },
          { id: 'elder_druid',    name: 'Elder Druid',    hp: 55,  armor: 0,  initiative: 60, action: { value: 16, range: 3, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
      nightmare: {
        food_cost: 40,
        rewards: { gold: 120, crystal: 35, xp: 60 },
        enemies: [
          { id: 'grove_warden',    name: 'Grove Warden',    hp: 102, armor: 10, initiative: 35, action: { value: 17, range: 1, target_type: 'enemy', target_amount: 'single' } },
          { id: 'elder_druid',     name: 'Elder Druid',     hp: 72,  armor: 0,  initiative: 60, action: { value: 21, range: 3, target_type: 'enemy', target_amount: 'single' } },
          { id: 'ancient_guardian',name: 'Ancient Guardian',hp: 160, armor: 14, initiative: 20, action: { value: 24, range: 1, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
    },
  },
  {
    id: 'fire_wastes',
    label: 'Fire Wastes',
    crystal_type: 'Crystals_Fire',
    crystal_icon: '🔴',
    description: 'Scorched badlands ruled by fire cults and molten elementals.',
    type: 'pve',
    difficulties: {
      normal: {
        food_cost: 10,
        rewards: { gold: 50, crystal: 10, xp: 20 },
        enemies: [
          { id: 'fire_cultist',  name: 'Fire Cultist',  hp: 40,  armor: 0,  initiative: 55, action: { value: 12, range: 2, target_type: 'enemy', target_amount: 'single' } },
          { id: 'ember_hound',   name: 'Ember Hound',   hp: 55,  armor: 3,  initiative: 40, action: { value: 9,  range: 1, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
      hard: {
        food_cost: 20,
        rewards: { gold: 80, crystal: 20, xp: 35 },
        enemies: [
          { id: 'fire_cultist',    name: 'Fire Cultist',    hp: 52,  armor: 0,  initiative: 55, action: { value: 16, range: 2, target_type: 'enemy', target_amount: 'single' } },
          { id: 'ember_hound',     name: 'Ember Hound',     hp: 72,  armor: 4,  initiative: 40, action: { value: 12, range: 1, target_type: 'enemy', target_amount: 'single' } },
          { id: 'molten_elemental',name: 'Molten Elemental',hp: 90,  armor: 5,  initiative: 25, action: { value: 18, range: 1, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
      nightmare: {
        food_cost: 40,
        rewards: { gold: 120, crystal: 35, xp: 60 },
        enemies: [
          { id: 'fire_cultist',     name: 'Fire Cultist',     hp: 68,  armor: 0,  initiative: 55, action: { value: 21, range: 2, target_type: 'enemy', target_amount: 'single' } },
          { id: 'molten_elemental', name: 'Molten Elemental', hp: 117, armor: 6,  initiative: 25, action: { value: 23, range: 1, target_type: 'enemy', target_amount: 'single' } },
          { id: 'inferno_lord',     name: 'Inferno Lord',     hp: 175, armor: 12, initiative: 30, action: { value: 30, range: 2, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
    },
  },
  {
    id: 'death_crypts',
    label: 'Death Crypts',
    crystal_type: 'Crystals_Death',
    crystal_icon: '🟣',
    description: 'Sunken tombs crawling with undead and cursed wraiths.',
    type: 'pve',
    difficulties: {
      normal: {
        food_cost: 10,
        rewards: { gold: 50, crystal: 10, xp: 20 },
        enemies: [
          { id: 'skeleton',  name: 'Skeleton',  hp: 35,  armor: 2,  initiative: 30, action: { value: 8,  range: 1, target_type: 'enemy', target_amount: 'single' } },
          { id: 'crypt_wraith', name: 'Crypt Wraith', hp: 30, armor: 0, initiative: 65, action: { value: 11, range: 2, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
      hard: {
        food_cost: 20,
        rewards: { gold: 80, crystal: 20, xp: 35 },
        enemies: [
          { id: 'skeleton',      name: 'Skeleton',      hp: 46,  armor: 3,  initiative: 30, action: { value: 10, range: 1, target_type: 'enemy', target_amount: 'single' } },
          { id: 'crypt_wraith',  name: 'Crypt Wraith',  hp: 39,  armor: 0,  initiative: 65, action: { value: 14, range: 2, target_type: 'enemy', target_amount: 'single' } },
          { id: 'bone_champion', name: 'Bone Champion', hp: 85,  armor: 8,  initiative: 20, action: { value: 16, range: 1, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
      nightmare: {
        food_cost: 40,
        rewards: { gold: 120, crystal: 35, xp: 60 },
        enemies: [
          { id: 'crypt_wraith',   name: 'Crypt Wraith',   hp: 51,  armor: 0,  initiative: 65, action: { value: 18, range: 2, target_type: 'enemy', target_amount: 'single' } },
          { id: 'bone_champion',  name: 'Bone Champion',  hp: 110, armor: 10, initiative: 20, action: { value: 21, range: 1, target_type: 'enemy', target_amount: 'single' } },
          { id: 'lich_sovereign', name: 'Lich Sovereign', hp: 160, armor: 5,  initiative: 45, action: { value: 28, range: 3, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
    },
  },
  {
    id: 'frost_peaks',
    label: 'Frost Peaks',
    crystal_type: 'Crystals_Frost',
    crystal_icon: '🔵',
    description: 'Frozen summits haunted by ice spirits and glacial beasts.',
    type: 'pve',
    difficulties: {
      normal: {
        food_cost: 10,
        rewards: { gold: 50, crystal: 10, xp: 20 },
        enemies: [
          { id: 'frost_wraith', name: 'Frost Wraith', hp: 45,  armor: 0,  initiative: 60, action: { value: 12, range: 2, target_type: 'enemy', target_amount: 'single' } },
          { id: 'ice_golem',    name: 'Ice Golem',    hp: 80,  armor: 9,  initiative: 15, action: { value: 13, range: 1, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
      hard: {
        food_cost: 20,
        rewards: { gold: 80, crystal: 20, xp: 35 },
        enemies: [
          { id: 'frost_wraith',   name: 'Frost Wraith',   hp: 59,  armor: 0,  initiative: 60, action: { value: 16, range: 2, target_type: 'enemy', target_amount: 'single' } },
          { id: 'ice_golem',      name: 'Ice Golem',      hp: 104, armor: 11, initiative: 15, action: { value: 17, range: 1, target_type: 'enemy', target_amount: 'single' } },
          { id: 'blizzard_hound', name: 'Blizzard Hound', hp: 60,  armor: 4,  initiative: 45, action: { value: 14, range: 1, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
      nightmare: {
        food_cost: 40,
        rewards: { gold: 120, crystal: 35, xp: 60 },
        enemies: [
          { id: 'frost_wraith',   name: 'Frost Wraith',   hp: 77,  armor: 0,  initiative: 60, action: { value: 21, range: 2, target_type: 'enemy', target_amount: 'single' } },
          { id: 'ice_golem',      name: 'Ice Golem',      hp: 135, armor: 14, initiative: 15, action: { value: 22, range: 1, target_type: 'enemy', target_amount: 'single' } },
          { id: 'frost_sovereign',name: 'Frost Sovereign',hp: 195, armor: 15, initiative: 30, action: { value: 30, range: 2, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
    },
  },
  {
    id: 'nature_wilds',
    label: 'Nature Wilds',
    crystal_type: 'Crystals_Nature',
    crystal_icon: '🟡',
    description: 'Untamed wilderness thick with feral hunters and earth titans.',
    type: 'pve',
    difficulties: {
      normal: {
        food_cost: 10,
        rewards: { gold: 50, crystal: 10, xp: 20 },
        enemies: [
          { id: 'feral_hunter', name: 'Feral Hunter', hp: 50,  armor: 2,  initiative: 50, action: { value: 10, range: 2, target_type: 'enemy', target_amount: 'single' } },
          { id: 'earth_sprite', name: 'Earth Sprite', hp: 35,  armor: 0,  initiative: 55, action: { value: 8,  range: 2, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
      hard: {
        food_cost: 20,
        rewards: { gold: 80, crystal: 20, xp: 35 },
        enemies: [
          { id: 'feral_hunter', name: 'Feral Hunter', hp: 65,  armor: 3,  initiative: 50, action: { value: 13, range: 2, target_type: 'enemy', target_amount: 'single' } },
          { id: 'earth_sprite', name: 'Earth Sprite', hp: 46,  armor: 0,  initiative: 55, action: { value: 11, range: 2, target_type: 'enemy', target_amount: 'single' } },
          { id: 'stone_titan',  name: 'Stone Titan',  hp: 120, armor: 12, initiative: 10, action: { value: 20, range: 1, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
      nightmare: {
        food_cost: 40,
        rewards: { gold: 120, crystal: 35, xp: 60 },
        enemies: [
          { id: 'feral_hunter',  name: 'Feral Hunter',  hp: 85,  armor: 4,  initiative: 50, action: { value: 17, range: 2, target_type: 'enemy', target_amount: 'single' } },
          { id: 'stone_titan',   name: 'Stone Titan',   hp: 156, armor: 15, initiative: 10, action: { value: 26, range: 1, target_type: 'enemy', target_amount: 'single' } },
          { id: 'wild_colossus', name: 'Wild Colossus', hp: 185, armor: 13, initiative: 20, action: { value: 28, range: 1, target_type: 'enemy', target_amount: 'single' } },
        ],
      },
    },
  },
  {
    id: 'pvp_arena',
    label: 'PvP Arena',
    crystal_type: null,
    crystal_icon: '🏆',
    description: 'Face other players. Win trophies, gold, and glory.',
    type: 'pvp',
    difficulties: null,
  },
];

module.exports = { REGIONS };