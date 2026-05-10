const UNITS = {
  protectors: {
    conscript: {
      name: 'Conscript',
      type: 'melee',
      hp: 60, armor: 10, initiative: 50,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 10, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    acolyte: {
      name: 'Acolyte',
      type: 'caster',
      hp: 40, armor: 0, initiative: 20,
      resist_fire: 5, resist_ice: 5, resist_lightning: 5, resist_dark: 5, resist_holy: 5,
      action: { value: 15, range: 3, target_type: 'ally', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    apprentice: {
      name: 'Apprentice',
      type: 'caster',
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
      hp: 45, armor: 0, initiative: 25,
      resist_fire: 5, resist_ice: 5, resist_lightning: 5, resist_dark: 5, resist_holy: 5,
      action: { value: 10, range: 3, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    imp: {
      name: 'Imp',
      type: 'melee',
      hp: 110, armor: 5, initiative: 0,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 15, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
    possessed: {
      name: 'Possessed',
      type: 'melee',
      hp: 60, armor: 10, initiative: 50,
      resist_fire: 0, resist_ice: 0, resist_lightning: 0, resist_dark: 0, resist_holy: 0,
      action: { value: 15, range: 1, target_type: 'enemy', target_amount: 'single' },
      passive_ability: null,
      active_ability: null,
    },
  },
};

module.exports = { UNITS };