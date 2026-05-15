// dungeon_disciples-main/data/spells.js

const SPELLS = {
  empire: [
    {
      id: 'holy_bolt_1',
      name: 'Holy Bolt',
      rank: 1,
      type: 'active',
      description: 'Deals 40 Life damage to a single enemy. Heals the lowest HP ally for 20 HP.',
      cost: { mana: 25 },
      icon: '✨',
      params: { damage: 40, damage_type: 'life', heal: 20 }
    },
    {
      id: 'divine_shield_1',
      name: 'Divine Shield',
      rank: 1,
      type: 'active',
      description: 'Grants an ally a shield that absorbs 30 damage for 2 turns.',
      cost: { mana: 30 },
      icon: '🛡️',
      params: { target: 'ally', absorb: 30, duration: 2 }
    }
  ],

  dungeon: [
    {
      id: 'shadow_bolt_1',
      name: 'Shadow Bolt',
      rank: 1,
      type: 'active',
      description: 'Deals 45 Death damage to a single enemy and applies Infect (10% less healing).',
      cost: { mana: 25 },
      icon: '🌑',
      params: { damage: 45, damage_type: 'death', status: 'infect 1' }
    },
    {
      id: 'soul_harvest_1',
      name: 'Soul Harvest',
      rank: 1,
      type: 'active',
      description: 'Deals 30 Death damage to all enemies. Gain 15 Mana if any enemy dies.',
      cost: { mana: 35 },
      icon: '☠️',
      params: { damage: 30, damage_type: 'death', splash: true }
    }
  ],

  // grail_of_sorrow can be expanded later
  grail_of_sorrow: []
};

export { SPELLS };

// CommonJS support for server
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SPELLS };
}