const SPELLS = {
  empire: [
    {
      id: 'e_spell_1',
      name: 'Holy Aegis',
      rank: 1,
      tier: 1,
      type: 'preparation',
      description: 'Bless all allies with divine protection. Grant +10 armor for the battle.',
      cost: { crystals: { Crystals_Life: 15 } },
      icon: '✨',
      effect_type: 'buff',
      target_scope: 'all_allies',
      params: { armor_boost: 10 }
    },
    {
      id: 'e_spell_2',
      name: 'Smite',
      rank: 1,
      tier: 1,
      type: 'preparation',
      description: 'Weaken enemy armor with divine judgment. All foes lose 10% armor for the battle.',
      cost: { crystals: { Crystals_Life: 15 } },
      icon: '⚡',
      effect_type: 'debuff',
      target_scope: 'all_enemies',
      params: { armor_reduction: 0.10 }
    },
    {
      id: 'e_spell_3',
      name: 'Radiant Ward',
      rank: 2,
      tier: 2,
      type: 'preparation',
      description: 'Shield allies with radiant light. Grant all allies +15 Life resistance and +15 armor for the battle.',
      cost: { crystals: { Crystals_Life: 25, Crystals_Frost: 10 } },
      icon: '🛡️',
      effect_type: 'buff',
      target_scope: 'all_allies',
      params: { armor_boost: 15, resistances: { life: 15 } }
    },
    {
      id: 'e_spell_4',
      name: 'Divine Wrath',
      rank: 2,
      tier: 2,
      type: 'preparation',
      description: 'Curse enemies with holy fire. All foes lose 15% armor and 20% initiative for the battle.',
      cost: { crystals: { Crystals_Life: 20, Crystals_Fire: 10 } },
      icon: '🔥',
      effect_type: 'debuff',
      target_scope: 'all_enemies',
      params: { armor_reduction: 0.15, initiative_reduction: 0.20 }
    },
    {
      id: 'e_spell_5',
      name: 'Martyrdom',
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: 'Sacrifice life force for power. Grant all allies +20% damage and +15% lifesteal for the battle.',
      cost: { crystals: { Crystals_Life: 45 } },
      icon: '✝️',
      effect_type: 'buff',
      target_scope: 'all_allies',
      params: { damage_boost: 0.20, lifesteal: 0.15 }
    },
    {
      id: 'e_spell_6',
      name: 'Judgement',
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: 'Pass divine judgement on all foes. Enemies lose 25% max HP and 20% armor for the battle.',
      cost: { crystals: { Crystals_Life: 35, Crystals_Fire: 15 } },
      icon: '⚖️',
      effect_type: 'debuff',
      target_scope: 'all_enemies',
      params: { max_hp_reduction: 0.25, armor_reduction: 0.20 }
    },
  ],

  dungeon: [
    {
      id: 'd_spell_1',
      name: 'Dark Shroud',
      rank: 1,
      tier: 1,
      type: 'preparation',
      description: 'Cloak allies in shadow. Grant all allies +10 armor for the battle.',
      cost: { crystals: { Crystals_Death: 15 } },
      icon: '🌑',
      effect_type: 'buff',
      target_scope: 'all_allies',
      params: { armor_boost: 10 }
    },
    {
      id: 'd_spell_2',
      name: 'Enfeeble',
      rank: 1,
      tier: 1,
      type: 'preparation',
      description: 'Drain enemy strength. All foes deal 15% less damage for the battle.',
      cost: { crystals: { Crystals_Death: 15 } },
      icon: '🕸️',
      effect_type: 'debuff',
      target_scope: 'all_enemies',
      params: { damage_reduction: 0.15 }
    },
    {
      id: 'd_spell_3',
      name: 'Unholy Pact',
      rank: 2,
      tier: 2,
      type: 'preparation',
      description: 'Form a dark covenant. Grant all allies +15% lifesteal and +15 Death resistance for the battle.',
      cost: { crystals: { Crystals_Death: 25, Crystals_Nature: 10 } },
      icon: '☠️',
      effect_type: 'buff',
      target_scope: 'all_allies',
      params: { lifesteal: 0.15, resistances: { death: 15 } }
    },
    {
      id: 'd_spell_4',
      name: 'Wither',
      rank: 2,
      tier: 2,
      type: 'preparation',
      description: 'Wither enemy vitality. All foes lose 15% max HP and 20% initiative for the battle.',
      cost: { crystals: { Crystals_Death: 20, Crystals_Frost: 10 } },
      icon: '💀',
      effect_type: 'debuff',
      target_scope: 'all_enemies',
      params: { max_hp_reduction: 0.15, initiative_reduction: 0.20 }
    },
    {
      id: 'd_spell_5',
      name: 'Blood Frenzy',
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: 'Drive allies into a killing frenzy. Grant all allies +20% damage and +25% action speed for the battle.',
      cost: { crystals: { Crystals_Death: 45 } },
      icon: '🩸',
      effect_type: 'buff',
      target_scope: 'all_allies',
      params: { damage_boost: 0.20, action_speed_boost: 0.25 }
    },
    {
      id: 'd_spell_6',
      name: 'Soul Rend',
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: 'Tear at the souls of enemies. All foes lose 25% max HP and 20% action speed for the battle.',
      cost: { crystals: { Crystals_Death: 35, Crystals_Frost: 15 } },
      icon: '👻',
      effect_type: 'debuff',
      target_scope: 'all_enemies',
      params: { max_hp_reduction: 0.25, action_speed_reduction: 0.20 }
    },
  ],

  grail_of_sorrow: [
    {
      id: 'g_spell_1',
      name: 'Sorrow\'s Touch',
      rank: 1,
      tier: 1,
      type: 'preparation',
      description: 'Bolster allies with sorrow\'s power. Grant all allies +10 armor for the battle.',
      cost: { crystals: { Crystals_Fire: 15 } },
      icon: '🩸',
      effect_type: 'buff',
      target_scope: 'all_allies',
      params: { armor_boost: 10 }
    },
    {
      id: 'g_spell_2',
      name: 'Chronal Snare',
      rank: 1,
      tier: 1,
      type: 'preparation',
      description: 'Slow enemies with temporal distortion. All foes lose 20% initiative for the battle.',
      cost: { crystals: { Crystals_Fire: 15 } },
      icon: '⏳',
      effect_type: 'debuff',
      target_scope: 'all_enemies',
      params: { initiative_reduction: 0.20 }
    },
    {
      id: 'g_spell_3',
      name: 'Blood Surge',
      rank: 2,
      tier: 2,
      type: 'preparation',
      description: 'Surge with grave power. Grant all allies +15% damage and +20% action speed for the battle.',
      cost: { crystals: { Crystals_Fire: 25, Crystals_Life: 10 } },
      icon: '🔴',
      effect_type: 'buff',
      target_scope: 'all_allies',
      params: { damage_boost: 0.15, action_speed_boost: 0.20 }
    },
    {
      id: 'g_spell_4',
      name: 'Chronal Bind',
      rank: 2,
      tier: 2,
      type: 'preparation',
      description: 'Bind enemies in temporal stasis. All foes lose 25% initiative and 15% action speed for the battle.',
      cost: { crystals: { Crystals_Fire: 20, Crystals_Death: 10 } },
      icon: '⌛',
      effect_type: 'debuff',
      target_scope: 'all_enemies',
      params: { initiative_reduction: 0.25, action_speed_reduction: 0.15 }
    },
    {
      id: 'g_spell_5',
      name: 'Grail\'s Fury',
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: 'Unleash the grail\'s full power. Grant all allies +20% damage and +20 armor for the battle.',
      cost: { crystals: { Crystals_Fire: 40, Crystals_Life: 15 } },
      icon: '🏆',
      effect_type: 'buff',
      target_scope: 'all_allies',
      params: { damage_boost: 0.20, armor_boost: 20 }
    },
    {
      id: 'g_spell_6',
      name: 'Time Collapse',
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: 'Collapse enemy timeline. All foes lose 35% initiative and 20% max HP for the battle.',
      cost: { crystals: { Crystals_Fire: 35, Crystals_Death: 15 } },
      icon: '🌀',
      effect_type: 'debuff',
      target_scope: 'all_enemies',
      params: { initiative_reduction: 0.35, max_hp_reduction: 0.20 }
    },
  ]
};

export { SPELLS };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SPELLS };
}