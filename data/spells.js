const SPELLS = {
  empire: [
    {
      id: 'e_spell_1',
      name: 'Holy Aegis',
      rank: 1,
      type: 'preparation',
      description: 'Bless all allies with divine protection. Grant +20% armor and +25 Life resistance for the battle.',
      cost: { mana: 30, crystals: 3 },
      icon: '✨',
      effect_type: 'buff',
      target_scope: 'all_allies',
      params: {
        armor_boost: 0.20,
        resistances: { life: 25 }
      }
    },
    {
      id: 'e_spell_2',
      name: 'Smite Weakness',
      rank: 1,
      type: 'preparation',
      description: 'Call down divine judgment on enemies. All foes take 30% increased Life damage and lose 15% armor for the battle.',
      cost: { mana: 35, crystals: 4 },
      icon: '⚡',
      effect_type: 'debuff',
      target_scope: 'all_enemies',
      params: {
        armor_reduction: 0.15,
        damage_taken_increase: { life: 0.30 },
        duration: 'entire_battle'
      }
    }
  ],

  dungeon: [
    {
      id: 'd_spell_1',
      name: 'Unholy Pact',
      rank: 1,
      type: 'preparation',
      description: 'Form a dark covenant with your units. Grant all allies +15% lifesteal and +20 Death resistance for the battle.',
      cost: { mana: 32, crystals: 3 },
      icon: '☠️',
      effect_type: 'buff',
      target_scope: 'all_allies',
      params: {
        lifesteal: 0.15,
        resistances: { death: 20 }
      }
    },
    {
      id: 'd_spell_2',
      name: 'Wither Vitality',
      rank: 1,
      type: 'preparation',
      description: 'Drain enemy vitality with dark magic. All foes lose 20% max HP and take 25% increased Death damage for the battle.',
      cost: { mana: 38, crystals: 4 },
      icon: '💀',
      effect_type: 'debuff',
      target_scope: 'all_enemies',
      params: {
        max_hp_reduction: 0.20,
        damage_taken_increase: { death: 0.25 },
        duration: 'entire_battle'
      }
    }
  ],

  grail_of_sorrow: [
    {
      id: 'g_spell_1',
      name: 'Blood Surge',
      rank: 1,
      type: 'preparation',
      description: 'Surge with temporal power. Grant all allies +30 max HP and +25% action speed for the battle. They gain +15% damage output.',
      cost: { mana: 28, crystals: 3 },
      icon: '🩸',
      effect_type: 'buff',
      target_scope: 'all_allies',
      params: {
        max_hp_boost: 30,
        action_speed_boost: 0.25,
        damage_boost: 0.15
      }
    },
    {
      id: 'g_spell_2',
      name: 'Chronal Bind',
      rank: 1,
      type: 'preparation',
      description: 'Bind enemies in temporal stasis. All foes lose 35% initiative and 20% action speed for the battle.',
      cost: { mana: 36, crystals: 4 },
      icon: '⏳',
      effect_type: 'debuff',
      target_scope: 'all_enemies',
      params: {
        initiative_reduction: 0.35,
        action_speed_reduction: 0.20,
        duration: 'entire_battle'
      }
    }
  ]
};

export { SPELLS };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SPELLS };
}