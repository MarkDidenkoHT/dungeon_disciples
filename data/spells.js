const SPELLS = {
  empire: [
    {
      id: 'e_spell_1',
      name: 'Revival Prayer',
      rank: 1,
      tier: 1,
      type: 'roster',
      description: 'Resurrect one fallen ally at 1 HP.',
      cost: { crystals: { Crystals_Life: 5 } },
      effect_type: 'resurrect',
      class: 'utility',
      usage: 'roster',
      target_scope: 'single_ally',
      params: { resurrect: true }
    },
    {
      id: 'e_spell_2',
      name: 'Divine Mending',
      rank: 1,
      tier: 1,
      type: 'preparation',
      description: 'Restore one ally to half their maximum HP before battle.',
      cost: { crystals: { Crystals_Life: 10 } },
      effect_type: 'heal',
      class: 'boon',
      target_scope: 'single_ally',
      params: { heal_pct: 0.5 }
    },
    {
      id: 'e_spell_3',
      name: 'Holy Aegis',
      rank: 1,
      tier: 1,
      type: 'preparation',
      description: 'Bless one ally with divine protection. Grant +15 armor for the battle.',
      cost: { crystals: { Crystals_Life: 15 } },
      effect_type: 'buff',
      class: 'buff',
      target_scope: 'single_ally',
      params: { armor_boost: 15 }
    },
    {
      id: 'e_spell_4',
      name: 'Mark of the Crusade',
      rank: 2,
      tier: 2,
      type: 'trophy',
      description: 'Slain enemies yield trophies of their fallen.',
      cost: { crystals: { Crystals_Life: 10, Crystals_Nature: 5 } },
      effect_type: 'trophy_gain',
      class: 'utility',
      target_scope: 'none',
      params: { trophy_count: 1 },
    },

    {
      id: 'e_spell_5',
      name: 'A New Dawn',
      rank: 2,
      tier: 2,
      type: 'preparation',
      description: 'At the start of round 3, all Holy allies heal for 10 HP per Holy ally on the field.',
      cost: { crystals: { Crystals_Life: 20, Crystals_Fire: 10 } },
      effect_type: 'round_trigger_heal',
      class: 'boon',
      target_scope: 'tag_allies',
      params: { trigger_round: 3, tag_required: 'Holy', heal_per_tagged_unit: 10 }
    },
    {
      id: 'e_spell_6',
      name: 'Ward',
      rank: 2,
      tier: 2,
      type: 'preparation',
      description: '[PVP PLACEHOLDER] If the opposing player casts a debuff spell, it is ignored.',
      cost: { crystals: { Crystals_Life: 20, Crystals_Fire: 10 } },
      effect_type: 'pvp_dispel_debuff',
      class: 'utility',
      target_scope: 'none',
      params: { cancels_opponent_effect_type: 'debuff' }
    },
    {
      id: 'e_spell_7',
      name: 'Martyrdom',
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: 'Anoint one ally as a martyr. 10% of damage taken by adjacent allies is redirected to the martyr.',
      cost: { crystals: { Crystals_Life: 45 } },
      effect_type: 'buff',
      class: 'buff',
      target_scope: 'single_ally',
      params: { martyrdom_redirect_pct: 10 }
    },
    {
      id: 'e_spell_8',
      name: 'Vow of Protection',
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: 'Select one ally to intercept attacks. Grant +25% intercept chance (stacks with the Protector passive) and +10 armor for the battle.',
      cost: { crystals: { Crystals_Life: 35, Crystals_Fire: 15 } },
      effect_type: 'buff',
      class: 'buff',
      target_scope: 'single_ally',
      params: { intercept_chance_pct: 25, armor_boost: 10 }
    },
    {
      id: 'e_spell_9', //replace
      name: 'Wrath of Heaven',
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: 'Call down righteous fury. All foes lose 20% initiative and 15% max HP for the battle.',
      cost: { crystals: { Crystals_Life: 30, Crystals_Fire: 20 } },
      effect_type: 'debuff',
      class: 'debuff',
      target_scope: 'all_enemies',
      params: { initiative_reduction: 0.20, max_hp_reduction: 0.15 }
    },
    {
      id: 'e_spell_10', //replace
      name: 'Empyrean Blessing',
      rank: 4,
      tier: 4,
      type: 'preparation',
      description: 'Bathe the host in empyrean light. Grant all allies +25 armor and +20 Life resistance for the battle.',
      cost: { crystals: { Crystals_Life: 50, Crystals_Frost: 20 } },
      effect_type: 'buff',
      class: 'buff',
      target_scope: 'all_allies',
      params: { armor_boost: 25, resistances: { life: 20 } }
    },
    {
      id: 'e_spell_11', //replace
      name: 'Wrath of the Heavens',
      rank: 4,
      tier: 4,
      type: 'preparation',
      description: 'Unleash a cataclysmic judgement. All foes lose 30% max HP and 25% armor for the battle.',
      cost: { crystals: { Crystals_Life: 45, Crystals_Fire: 25 } },
      effect_type: 'debuff',
      class: 'debuff',
      target_scope: 'all_enemies',
      params: { max_hp_reduction: 0.30, armor_reduction: 0.25 }
    },
    {
      id: 'e_spell_12', //replace
      name: 'Avatar of Light',
      rank: 4,
      tier: 4,
      type: 'preparation',
      description: 'Channel divine power into one ally. Grant +30% damage and +20 armor for the battle.',
      cost: { crystals: { Crystals_Life: 60 } },
      effect_type: 'buff',
      class: 'buff',
      target_scope: 'single_ally',
      params: { damage_boost: 0.30, armor_boost: 20 }
    },
  ],

  choir_of_the_cursed: [
    {
      id: 'd_spell_1',
      name: 'Grave Resurrection',
      rank: 1,
      tier: 1,
      type: 'roster',
      description: 'Resurrect one fallen ally at 1 HP.',
      cost: { crystals: { Crystals_Fire: 5 } },
      effect_type: 'resurrect',
      class: 'utility',
      usage: 'roster',
      target_scope: 'single_ally',
      params: { resurrect: true }
    },
    {
      id: 'd_spell_2',
      name: 'Dark Mending',
      rank: 1,
      tier: 1,
      type: 'preparation',
      description: 'Restore one ally to half their maximum HP before battle.',
      cost: { crystals: { Crystals_Fire: 10 } },
      effect_type: 'heal',
      class: 'boon',
      target_scope: 'single_ally',
      params: { heal_pct: 0.5 }
    },
    {
      id: 'd_spell_3', //replace
      name: 'Blood Frenzy',
      rank: 1,
      tier: 1,
      type: 'preparation',
      description: 'Drive one ally into a killing frenzy. Grant +20% damage for the battle.',
      cost: { crystals: { Crystals_Fire: 15 } },
      effect_type: 'buff',
      class: 'buff',
      target_scope: 'single_ally',
      params: { damage_boost: 0.20 }
    },
    {
      id: 'd_spell_4',
      name: 'Harvest',
      rank: 2,
      tier: 2,
      type: 'trophy',
      description: 'Slain enemies yield trophies of their fallen.',
      cost: { crystals: { Crystals_Fire: 10, Crystals_Nature: 5 } },
      effect_type: 'trophy_gain',
      class: 'utility',
      target_scope: 'none',
      params: { trophy_count: 1 },
    },

    {
      id: 'd_spell_5', //replace
      name: 'Bone Armor',
      rank: 2,
      tier: 2,
      type: 'preparation',
      description: 'Encase all allies in bone. Grant all allies +12 armor for the battle.',
      cost: { crystals: { Crystals_Fire: 20 } },
      effect_type: 'buff',
      class: 'buff',
      target_scope: 'all_allies',
      params: { armor_boost: 12 }
    },
    {
      id: 'd_spell_6',
      name: 'Nihilism',
      rank: 2,
      tier: 2,
      type: 'preparation',
      description: '[PVP PLACEHOLDER] If the opposing player has also cast a tier 2 spell, it is ignored.',
      cost: { crystals: { Crystals_Fire: 20, Crystals_Nature: 10 } },
      effect_type: 'pvp_counter_tier2',
      class: 'utility',
      target_scope: 'none',
      params: { cancels_opponent_tier: 2 }
    },
    {
      id: 'd_spell_7', //reaplace
      name: 'Soul Rend',
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: 'Tear at the souls of enemies. All foes lose 25% max HP.',
      cost: { crystals: { Crystals_Fire: 35, Crystals_Frost: 15 } },
      effect_type: 'debuff',
      class: 'debuff',
      target_scope: 'all_enemies',
      params: { max_hp_reduction: 0.25 }
    },
    {
      id: 'd_spell_8',
      name: 'Rite of Ruin',
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: 'One random enemy loses all passive abilities for round 1.',
      cost: { crystals: { Crystals_Fire: 40, Crystals_Frost: 10 } },
      effect_type: 'debuff',
      class: 'curse',
      target_scope: 'random_enemy',
      params: { trigger_round: 1, strip_passives: true }
    },
    {
      id: 'd_spell_9', //replace
      name: 'Mass Frenzy',
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: 'Drive all allies into a killing frenzy. Grant all allies +20% damage.',
      cost: { crystals: { Crystals_Fire: 45 } },
      effect_type: 'buff',
      class: 'buff',
      target_scope: 'all_allies',
      params: { damage_boost: 0.20 }
    },
    {
      id: 'd_spell_10', //replace
      name: 'Eternal Night',
      rank: 4,
      tier: 4,
      type: 'preparation',
      description: 'Plunge the battlefield into eternal night. Grant all allies +20% lifesteal and +20 Death resistance for the battle.',
      cost: { crystals: { Crystals_Fire: 55, Crystals_Frost: 20 } },
      effect_type: 'buff',
      class: 'buff',
      target_scope: 'all_allies',
      params: { lifesteal: 0.20, resistances: { death: 20 } }
    },
    {
      id: 'd_spell_11', //replace
      name: 'Plague of Despair',
      rank: 4,
      tier: 4,
      type: 'preparation',
      description: 'Afflict the enemy host with despair. All foes lose 30% max HP and 20% initiative for the battle.',
      cost: { crystals: { Crystals_Fire: 50, Crystals_Nature: 20 } },
      effect_type: 'debuff',
      class: 'debuff',
      target_scope: 'all_enemies',
      params: { max_hp_reduction: 0.30, initiative_reduction: 0.20 }
    },
    {
      id: 'd_spell_12', //replace
      name: 'Cursed Ascendance',
      rank: 4,
      tier: 4,
      type: 'preparation',
      description: 'Ascend your forces with dark power. Grant all allies +25% damage for the battle.',
      cost: { crystals: { Crystals_Fire: 60 } },
      effect_type: 'buff',
      class: 'buff',
      target_scope: 'all_allies',
      params: { damage_boost: 0.25 }
    },
  ],

  grail_of_sorrow: [
    {
      id: 'g_spell_1',
      name: 'Forgiveness',
      rank: 1,
      tier: 1,
      type: 'roster',
      description: 'Resurrect one fallen ally at 1 HP.',
      cost: { crystals: { Crystals_Death: 5 } },
      effect_type: 'resurrect',
      class: 'utility',
      usage: 'roster',
      target_scope: 'single_ally',
      params: { resurrect: true }
    },
    {
      id: 'g_spell_2', //rename
      name: 'Ember Mending',
      rank: 1,
      tier: 1,
      type: 'preparation',
      description: 'Restore one ally to half their maximum HP before battle.',
      cost: { crystals: { Crystals_Death: 10 } },
      effect_type: 'heal',
      class: 'boon',
      target_scope: 'single_ally',
      params: { heal_pct: 0.5 }
    },
    {
      id: 'g_spell_3', //replace
      name: "Sorrow's Haste",
      rank: 1,
      tier: 1,
      type: 'preparation',
      description: 'Bless one ally with sorrowful speed. Grant +15 initiative for the battle.',
      cost: { crystals: { Crystals_Death: 15 } },
      effect_type: 'buff',
      class: 'buff',
      target_scope: 'single_ally',
      params: { initiative_boost: 15 }
    },
    {
      id: 'g_spell_4',
      name: "Sorrow's Offering",
      rank: 2,
      tier: 2,
      type: 'trophy',
      description: 'Slain enemies yield trophies of their fallen.',
      cost: { crystals: { Crystals_Death: 10, Crystals_Nature: 5 } },
      effect_type: 'trophy_gain',
      class: 'utility',
      target_scope: 'none',
      params: { trophy_count: 1 },
    },
    {
      id: 'g_spell_5',
      name: 'Dark Determination',
      rank: 2,
      tier: 2,
      type: 'preparation',
      description: 'Selected ally gains 5 HP and 2 armor, but loses 2 initiative, for each Zombie ally on the field.',
      cost: { crystals: { Crystals_Death: 20, Crystals_Fire: 10 } },
      effect_type: 'tag_count_buff',
      class: 'buff',
      target_scope: 'single_ally',
      params: { tag_required: 'Zombie', hp_per_tagged_unit: 5, armor_per_tagged_unit: 2, initiative_penalty_per_tagged_unit: 2 }
    },
    {
      id: 'g_spell_6',
      name: 'Decay',
      rank: 2,
      tier: 2,
      type: 'preparation',
      description: '[PVP PLACEHOLDER] If the opposing player casts a buff spell, it is ignored.',
      cost: { crystals: { Crystals_Death: 20, Crystals_Fire: 10 } },
      effect_type: 'pvp_dispel_buff',
      class: 'utility',
      target_scope: 'none',
      params: { cancels_opponent_effect_type: 'buff' }
    },
    {
      id: 'g_spell_7', //replace
      name: "Grail's Fury",
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: "Unleash the grail's full power. Grant all allies +20% damage and +20 armor for the battle.",
      cost: { crystals: { Crystals_Death: 40, Crystals_Life: 15 } },
      effect_type: 'buff',
      class: 'buff',
      target_scope: 'all_allies',
      params: { damage_boost: 0.20, armor_boost: 20 }
    },
    {
      id: 'g_spell_8',
      name: 'Dirge',
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: 'No unit on the battlefield may use active abilities during round 1.',
      cost: { crystals: { Crystals_Death: 35, Crystals_Fire: 15 } },
      effect_type: 'debuff',
      class: 'curse',
      target_scope: 'none',
      params: { trigger_round: 1, locks_active_abilities: true }
    },
    {
      id: 'g_spell_9', //replace
      name: 'Searing Decay',
      rank: 3,
      tier: 3,
      type: 'preparation',
      description: 'Sear enemies with decay. All foes lose 20% armor and 15% max HP for the battle.',
      cost: { crystals: { Crystals_Death: 35, Crystals_Fire: 15 } },
      effect_type: 'debuff',
      class: 'debuff',
      target_scope: 'all_enemies',
      params: { armor_reduction: 0.20, max_hp_reduction: 0.15 }
    },
    {
      id: 'g_spell_10', //replace
      name: 'Eternal Flame',
      rank: 4,
      tier: 4,
      type: 'preparation',
      description: 'Ignite an undying flame within your allies. Grant all allies +25% damage and +20 Fire resistance for the battle.',
      cost: { crystals: { Crystals_Death: 50, Crystals_Life: 15 } },
      effect_type: 'buff',
      class: 'buff',
      target_scope: 'all_allies',
      params: { damage_boost: 0.25, resistances: { fire: 20 } }
    },
    {
      id: 'g_spell_11', //replace
      name: 'Temporal Collapse',
      rank: 4,
      tier: 4,
      type: 'preparation',
      description: 'Collapse the flow of time around your foes. All enemies lose 40% initiative and 25% armor for the battle.',
      cost: { crystals: { Crystals_Death: 45, Crystals_Fire: 20 } },
      effect_type: 'debuff',
      class: 'debuff',
      target_scope: 'all_enemies',
      params: { initiative_reduction: 0.40, armor_reduction: 0.25 }
    },
    {
      id: 'g_spell_12', //replace
      name: "Grail's Ascension",
      rank: 4,
      tier: 4,
      type: 'preparation',
      description: "Channel the grail's power into one ally. Grant +35% lifesteal and +20 armor for the battle.",
      cost: { crystals: { Crystals_Death: 55, Crystals_Life: 20 } },
      effect_type: 'buff',
      class: 'buff',
      target_scope: 'single_ally',
      params: { lifesteal: 0.35, armor_boost: 20 }
    },
  ],

  // Convenience bucket for spells that only make sense on enemies (encounter
  // design can also just point an encounter's spell_id at any existing faction
  // spell in this file - see data/embark.js REGION_ENCOUNTERS[region][level]
  // .spell_id / getEncounterSpellId - the lookup checks the whole SPELLS
  // catalog, not just this array). One spell per encounter, same as the
  // player's one-spell-per-battle rule - there is no per-unit caster. Not shown
  // in the player-facing Spell Tome (spell_tome.js only reads
  // SPELLS[player.faction]). Which spell is cast is never revealed to the
  // player - only whether a cast happened.
  enemies: [
    {
      id: 'enemy_spell_1',
      name: 'Enemy Spell 1 (placeholder)',
      rank: 1,
      tier: 1,
      type: 'enemy',
      description: 'Placeholder enemy spell.',
      effect_type: 'buff',
      class: 'enemy',
      target_scope: 'all_allies',
      params: { armor_boost: 5 },
    },
    {
      id: 'enemy_spell_2',
      name: 'Enemy Spell 2 (placeholder)',
      rank: 1,
      tier: 1,
      type: 'enemy',
      description: 'Placeholder enemy spell.',
      effect_type: 'debuff',
      class: 'enemy',
      target_scope: 'none',
      params: {},
    },
    {
      id: 'enemy_spell_3',
      name: 'Enemy Spell 3 (placeholder)',
      rank: 1,
      tier: 1,
      type: 'enemy',
      description: 'Placeholder enemy spell.',
      effect_type: 'heal',
      class: 'enemy',
      target_scope: 'none',
      params: {},
    },
    {
      id: 'enemy_spell_4',
      name: 'Enemy Spell 4 (placeholder)',
      rank: 1,
      tier: 1,
      type: 'enemy',
      description: 'Placeholder enemy spell.',
      effect_type: 'debuff',
      class: 'enemy',
      target_scope: 'none',
      params: {},
    },
  ],
};

export { SPELLS };
if (typeof module !== 'undefined') module.exports = { SPELLS };