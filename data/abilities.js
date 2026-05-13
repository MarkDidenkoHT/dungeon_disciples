const ABILITIES = {
  'purge 1': {
    id: 'purge 1',
    name: 'Purge',
    rank: 1,
    type: 'active',
    target: 'enemy',
    description: 'Removes all buffs from target.',
    params: {},
  },
  'mark_of_ash 1': {
    id: 'mark_of_ash 1',
    name: 'Mark of Ash',
    rank: 1,
    type: 'active',
    target: 'enemy',
    description: 'Makes Burn 1 last on the target until end of battle.',
    params: { applies: 'burn 1', duration: 'permanent' },
  },
  'raise_dead 1': {
    id: 'raise_dead 1',
    name: 'Raise Dead',
    rank: 1,
    type: 'active',
    target: 'ally_dead',
    description: 'Resurrects a friendly undead unit with 50% HP.',
    params: { hp_pct: 50, tag_required: 'Undead' },
  },
  'devour 1': {
    id: 'devour 1',
    name: 'Devour',
    rank: 1,
    type: 'active',
    target: 'ally',
    description: "Applies Feast to all available allies. Drains 25% of their HP and gains 50% of that as a damage buff.",
    params: { drain_pct: 25, dmg_buff_pct: 50, status: 'feast' },
  },
};

export { ABILITIES };