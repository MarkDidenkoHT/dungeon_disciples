// ─── Unit type → grid size mapping ───────────────────────────────────────────
//
//  'tile'   → occupies 1×1  (one cell)
//  'column' → occupies 1×2  (two cells in the same column, rows r and r+1)
//  'row'    → occupies 2×1  (two cells in the same row, cols 0 and 1)
//
// This is the single source of truth consumed by both the server (routes/index.js)
// and the client (public/screens/battle-prep.js).

const UNIT_TYPES = {
  melee:  { size: 'tile',   icon: '⚔',  label: 'Melee'  },
  ranged: { size: 'row',    icon: '🏹',  label: 'Ranged' },
  caster: { size: 'column', icon: '✦',  label: 'Caster' },
  healer: { size: 'column', icon: '✚',  label: 'Healer' },
};

// Grid display helpers derived from size
const UNIT_SIZES = {
  tile:   { label: '1×1', rowSpan: 1, colSpan: 1 },
  column: { label: '1×2', rowSpan: 2, colSpan: 1 },
  row:    { label: '2×1', rowSpan: 1, colSpan: 2 },
};

// ─── Hero data ────────────────────────────────────────────────────────────────

const HERO_DATA = {
  warlord: {
    type: 'melee',
    size: 'tile',
    hp: 120, armor: 8, initiative: 4,
    resist_fire: 2, resist_ice: 2, resist_lightning: 2, resist_dark: 5, resist_holy: 2,
    action: { value: 14, range: 1, target_type: 'enemy', target_amount: 'single' },
    passive_ability: null, active_ability: null,
  },
  hexblade: {
    type: 'caster',
    size: 'column',
    hp: 70, armor: 2, initiative: 6,
    resist_fire: 4, resist_ice: 4, resist_lightning: 4, resist_dark: 10, resist_holy: 2,
    action: { value: 18, range: 2, target_type: 'enemy', target_amount: 'single' },
    passive_ability: null, active_ability: null,
  },
  shadowbow: {
    type: 'ranged',
    size: 'row',
    hp: 80, armor: 3, initiative: 10,
    resist_fire: 3, resist_ice: 3, resist_lightning: 3, resist_dark: 6, resist_holy: 2,
    action: { value: 16, range: 3, target_type: 'enemy', target_amount: 'single' },
    passive_ability: null, active_ability: null,
  },
  paladin: {
    type: 'melee',
    size: 'tile',
    hp: 115, armor: 9, initiative: 4,
    resist_fire: 3, resist_ice: 3, resist_lightning: 3, resist_dark: 3, resist_holy: 10,
    action: { value: 12, range: 1, target_type: 'enemy', target_amount: 'single' },
    passive_ability: null, active_ability: null,
  },
  inquisitor: {
    type: 'ranged',
    size: 'row',
    hp: 72, armor: 2, initiative: 7,
    resist_fire: 4, resist_ice: 4, resist_lightning: 4, resist_dark: 4, resist_holy: 10,
    action: { value: 17, range: 2, target_type: 'enemy', target_amount: 'single' },
    passive_ability: null, active_ability: null,
  },
  ranger: {
    type: 'ranged',
    size: 'row',
    hp: 82, armor: 3, initiative: 11,
    resist_fire: 4, resist_ice: 4, resist_lightning: 4, resist_dark: 3, resist_holy: 4,
    action: { value: 15, range: 3, target_type: 'enemy', target_amount: 'single' },
    passive_ability: null, active_ability: null,
  },
};

// ─── Player units ─────────────────────────────────────────────────────────────

const UNITS = {
  protectors: {
    conscript: {
      name: 'Conscript',
      type: 'melee',
      size: 'tile',
      hp: 60, armor: 10, initiative: 50,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 10, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    acolyte: {
      name: 'Acolyte',
      type: 'caster',
      size: 'tile',
      hp: 40, armor: 0, initiative: 20,
      resist_fire: 5, resist_ice: 5, resist_lightning: 5, resist_dark: 5, resist_holy: 5,
      action: { value: 15, range: 3, target_type: 'ally', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    apprentice: {
      name: 'Apprentice',
      type: 'caster',
      size: 'tile',
      hp: 40, armor: 0, initiative: 40,
      resist_fire: 5, resist_ice: 5, resist_lightning: 5, resist_dark: 5, resist_holy: 5,
      action: { value: 20, range: 3, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
  },

  dungeon: {
    heretic: {
      name: 'Heretic',
      type: 'caster',
      size: 'column',
      hp: 45, armor: 0, initiative: 25,
      resist_fire: 5, resist_ice: 5, resist_lightning: 5, resist_dark: 5, resist_holy: 5,
      action: { value: 10, range: 3, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    imp: {
      name: 'Imp',
      type: 'melee',
      size: 'tile',
      hp: 110, armor: 5, initiative: 0,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 15, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    possessed: {
      name: 'Possessed',
      type: 'melee',
      size: 'tile',
      hp: 60, armor: 10, initiative: 50,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 15, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
  },

  // ─── Enemy units (used by REGIONS in embark.js) ──────────────────────────────

  enemies: {
    // Life Grove
    grove_warden: {
      name: 'Grove Warden',
      type: 'melee',
      size: 'tile',
      hp: 60, armor: 6, initiative: 35,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 10, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    sacred_beast: {
      name: 'Sacred Beast',
      type: 'melee',
      size: 'tile',
      hp: 45, armor: 2, initiative: 50,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 8, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    elder_druid: {
      name: 'Elder Druid',
      type: 'caster',
      size: 'column',
      hp: 55, armor: 0, initiative: 60,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 16, range: 3, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    ancient_guardian: {
      name: 'Ancient Guardian',
      type: 'melee',
      size: 'tile',
      hp: 160, armor: 14, initiative: 20,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 24, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },

    // Fire Wastes
    fire_cultist: {
      name: 'Fire Cultist',
      type: 'ranged',
      size: 'row',
      hp: 40, armor: 0, initiative: 55,
      resist_fire: 10, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 12, range: 2, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    ember_hound: {
      name: 'Ember Hound',
      type: 'melee',
      size: 'tile',
      hp: 55, armor: 3, initiative: 40,
      resist_fire: 10, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 9, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    molten_elemental: {
      name: 'Molten Elemental',
      type: 'melee',
      size: 'tile',
      hp: 90, armor: 5, initiative: 25,
      resist_fire: 20, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 18, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    inferno_lord: {
      name: 'Inferno Lord',
      type: 'melee',
      size: 'tile',
      hp: 175, armor: 12, initiative: 30,
      resist_fire: 30, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 30, range: 2, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },

    // Death Crypts
    skeleton: {
      name: 'Skeleton',
      type: 'melee',
      size: 'tile',
      hp: 35, armor: 2, initiative: 30,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 20, resist_holy: -10,
      action: { value: 8, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    crypt_wraith: {
      name: 'Crypt Wraith',
      type: 'caster',
      size: 'column',
      hp: 30, armor: 0, initiative: 65,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 20, resist_holy: -10,
      action: { value: 11, range: 2, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    bone_champion: {
      name: 'Bone Champion',
      type: 'melee',
      size: 'tile',
      hp: 85, armor: 8, initiative: 20,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 20, resist_holy: -10,
      action: { value: 16, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    lich_sovereign: {
      name: 'Lich Sovereign',
      type: 'caster',
      size: 'column',
      hp: 160, armor: 5, initiative: 45,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 30, resist_holy: -20,
      action: { value: 28, range: 3, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },

    // Frost Peaks
    frost_wraith: {
      name: 'Frost Wraith',
      type: 'caster',
      size: 'column',
      hp: 45, armor: 0, initiative: 60,
      resist_fire: 0, resist_ice: 20, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 12, range: 2, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    ice_golem: {
      name: 'Ice Golem',
      type: 'melee',
      size: 'tile',
      hp: 80, armor: 9, initiative: 15,
      resist_fire: -10, resist_ice: 20, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 13, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    blizzard_hound: {
      name: 'Blizzard Hound',
      type: 'melee',
      size: 'tile',
      hp: 60, armor: 4, initiative: 45,
      resist_fire: -10, resist_ice: 20, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 14, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    frost_sovereign: {
      name: 'Frost Sovereign',
      type: 'melee',
      size: 'tile',
      hp: 195, armor: 15, initiative: 30,
      resist_fire: -10, resist_ice: 30, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 30, range: 2, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },

    // Nature Wilds
    feral_hunter: {
      name: 'Feral Hunter',
      type: 'ranged',
      size: 'row',
      hp: 50, armor: 2, initiative: 50,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 10, range: 2, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    earth_sprite: {
      name: 'Earth Sprite',
      type: 'caster',
      size: 'column',
      hp: 35, armor: 0, initiative: 55,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 8, range: 2, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    stone_titan: {
      name: 'Stone Titan',
      type: 'melee',
      size: 'tile',
      hp: 120, armor: 12, initiative: 10,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 20, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    wild_colossus: {
      name: 'Wild Colossus',
      type: 'melee',
      size: 'tile',
      hp: 185, armor: 13, initiative: 20,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 28, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
  },
};

module.exports = { UNITS, HERO_DATA, UNIT_TYPES, UNIT_SIZES };