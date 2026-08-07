const SLOT_CATEGORIES = {
  slot_0: 'throne',
  slot_1: 'barracks',
  slot_2: 'barracks',
  slot_3: 'barracks',
  slot_4: 'barracks',
  slot_5: 'barracks',
  slot_6: 'special',
  slot_7: 'special',
  slot_8: 'special',
};

const BUILDING_POOLS = {
  empire: {
    throne: [
      { id: 'throne', label: 'Throne', category: 'throne', unit_id: null },
      { id: 'paladin_cathedral_1',       label: 'Paladin Cathedral',       category: 'throne', unit_id: 'h_e_1',    tier: 1, upgrades: ['h_e_11', 'h_e_12'] },
      { id: 'paladin_cathedral_2_a',     label: 'Paladin Cathedral II A',   category: 'throne', unit_id: 'h_e_11',   tier: 2, upgrades: ['h_e_111', 'h_e_121'] },
      { id: 'paladin_cathedral_2_b',     label: 'Paladin Cathedral II B',   category: 'throne', unit_id: 'h_e_12',   tier: 2, upgrades: ['h_e_111', 'h_e_121'] },
      { id: 'paladin_cathedral_3_a',     label: 'Paladin Cathedral III A',  category: 'throne', unit_id: 'h_e_111',  tier: 3, upgrades: ['h_e_1111', 'h_e_1112'] },
      { id: 'paladin_cathedral_3_b',     label: 'Paladin Cathedral III B',  category: 'throne', unit_id: 'h_e_121',  tier: 3, upgrades: ['h_e_1211', 'h_e_1212'] },
      { id: 'paladin_cathedral_4_a',     label: 'Paladin Cathedral IV A',   category: 'throne', unit_id: 'h_e_1111', tier: 4, upgrades: [] },
      { id: 'paladin_cathedral_4_a_alt', label: 'Paladin Cathedral IV A Alt', category: 'throne', unit_id: 'h_e_1112', tier: 4, upgrades: [] },
      { id: 'paladin_cathedral_4_b',     label: 'Paladin Cathedral IV B',   category: 'throne', unit_id: 'h_e_1211', tier: 4, upgrades: [] },
      { id: 'paladin_cathedral_4_b_alt', label: 'Paladin Cathedral IV B Alt', category: 'throne', unit_id: 'h_e_1212', tier: 4, upgrades: [] },
      { id: 'inquisitor_tower_1',        label: 'Inquisitor Tower',         category: 'throne', unit_id: 'h_e_2',    tier: 1, upgrades: ['h_e_2_a2', 'h_e_2_b2'] },
      { id: 'inquisitor_tower_2_a',      label: 'Inquisitor Tower II A',    category: 'throne', unit_id: 'h_e_2_a2', tier: 2, upgrades: ['h_e_2_a3', 'h_e_2_b3'] },
      { id: 'inquisitor_tower_2_b',      label: 'Inquisitor Tower II B',    category: 'throne', unit_id: 'h_e_2_b2', tier: 2, upgrades: ['h_e_2_a3', 'h_e_2_b3'] },
      { id: 'inquisitor_tower_3_a',      label: 'Inquisitor Tower III A',   category: 'throne', unit_id: 'h_e_2_a3', tier: 3, upgrades: ['h_e_2_a41', 'h_e_2_a42'] },
      { id: 'inquisitor_tower_3_b',      label: 'Inquisitor Tower III B',   category: 'throne', unit_id: 'h_e_2_b3', tier: 3, upgrades: ['h_e_2_b41', 'h_e_2_b42'] },
      { id: 'inquisitor_tower_4_a',      label: 'Inquisitor Tower IV A',    category: 'throne', unit_id: 'h_e_2_a41', tier: 4, upgrades: [] },
      { id: 'inquisitor_tower_4_a_alt',  label: 'Inquisitor Tower IV A Alt', category: 'throne', unit_id: 'h_e_2_a42', tier: 4, upgrades: [] },
      { id: 'inquisitor_tower_4_b',      label: 'Inquisitor Tower IV B',    category: 'throne', unit_id: 'h_e_2_b41', tier: 4, upgrades: [] },
      { id: 'inquisitor_tower_4_b_alt',  label: 'Inquisitor Tower IV B Alt', category: 'throne', unit_id: 'h_e_2_b42', tier: 4, upgrades: [] },
      { id: 'artificer_guild_1',         label: 'Artificer Guild',          category: 'throne', unit_id: 'h_e_3',    tier: 1, upgrades: ['h_e_3_a2', 'h_e_3_b2'] },
      { id: 'artificer_guild_2_a',       label: 'Artificer Guild II A',     category: 'throne', unit_id: 'h_e_3_a2', tier: 2, upgrades: ['h_e_3_a3', 'h_e_3_b3'] },
      { id: 'artificer_guild_2_b',       label: 'Artificer Guild II B',     category: 'throne', unit_id: 'h_e_3_b2', tier: 2, upgrades: ['h_e_3_a3', 'h_e_3_b3'] },
      { id: 'artificer_guild_3_a',       label: 'Artificer Guild III A',    category: 'throne', unit_id: 'h_e_3_a3', tier: 3, upgrades: ['h_e_3_a41', 'h_e_3_a42'] },
      { id: 'artificer_guild_3_b',       label: 'Artificer Guild III B',    category: 'throne', unit_id: 'h_e_3_b3', tier: 3, upgrades: ['h_e_3_b41', 'h_e_3_b42'] },
      { id: 'artificer_guild_4_a',       label: 'Artificer Guild IV A',     category: 'throne', unit_id: 'h_e_3_a41', tier: 4, upgrades: [] },
      { id: 'artificer_guild_4_a_alt',   label: 'Artificer Guild IV A Alt', category: 'throne', unit_id: 'h_e_3_a42', tier: 4, upgrades: [] },
      { id: 'artificer_guild_4_b',       label: 'Artificer Guild IV B',     category: 'throne', unit_id: 'h_e_3_b41', tier: 4, upgrades: [] },
      { id: 'artificer_guild_4_b_alt',   label: 'Artificer Guild IV B Alt', category: 'throne', unit_id: 'h_e_3_b42', tier: 4, upgrades: [] },
    ],
    barracks: [
      { id: 'conscript_barracks',  label: 'Conscript Barracks',  category: 'barracks', tier: 1, unit_id: 'e1',   upgrades: ['e11', 'e12'],          cost: { gold: 50 } },
      { id: 'infantry_barracks',   label: 'Infantry Barracks',   category: 'barracks', tier: 2, unit_id: 'e11',  upgrades: ['e111', 'e112'],         cost: { gold: 100 } },
      { id: 'crossbow_range',      label: 'Crossbow Range',      category: 'barracks', tier: 3, unit_id: 'e111', upgrades: [],                        cost: { gold: 200 } },
      { id: 'heavy_barracks',      label: 'Heavy Barracks',      category: 'barracks', tier: 3, unit_id: 'e112', upgrades: [],                        cost: { gold: 200 } },
      { id: 'cavalry_stables',     label: 'Cavalry Stables',     category: 'barracks', tier: 2, unit_id: 'e12',  upgrades: ['e121'],                        cost: { gold: 100 } },
      { id: 'knights_stables', label: 'Knights Stables', category: 'barracks', tier: 3, unit_id: 'e121', upgrades: [] },
      { id: 'sentinel_forge',      label: 'Sentinel Forge',      category: 'barracks', tier: 1, unit_id: 'e3',   upgrades: ['e31', 'e32'],            cost: { gold: 50 } },
      { id: 'automaton_lab',       label: 'Automaton Lab',       category: 'barracks', tier: 2, unit_id: 'e31',  upgrades: ['e311'],                        cost: { gold: 100 } },
      { id: 'golden_lion_lab', label: 'Golden Lion Lab', category: 'barracks', tier: 3, unit_id: 'e311', upgrades: [] },
      { id: 'siege_workshop',      label: 'Siege Workshop',      category: 'barracks', tier: 2, unit_id: 'e32',  upgrades: ['e321'],                        cost: { gold: 100 } },
      { id: 'siege_dreadnought_workshop', label: 'Siege Dreadnought Workshop', category: 'barracks', tier: 3, unit_id: 'e321', upgrades: [] },
      { id: 'smith_workshop',      label: 'Smith Workshop',      category: 'barracks', tier: 1, unit_id: 'e6',   upgrades: ['e61', 'e62'],            cost: { gold: 50 } },
      { id: 'mechanic_den',        label: 'Mechanic Den',        category: 'barracks', tier: 2, unit_id: 'e61',  upgrades: ['e611'],                  cost: { gold: 100 } },
      { id: 'mechanic_den_2',      label: 'Mechanic Den II',     category: 'barracks', tier: 3, unit_id: 'e611', upgrades: [],                        cost: { gold: 200 } },
      { id: 'rifleman_range',      label: 'Rifleman Range',      category: 'barracks', tier: 2, unit_id: 'e62',  upgrades: ['e621', 'e622'],          cost: { gold: 100 } },
      { id: 'devastator_post',     label: 'Devastator Post',     category: 'barracks', tier: 3, unit_id: 'e621', upgrades: [],                        cost: { gold: 200 } },
      { id: 'flamethrower_post',   label: 'Flamethrower Post',   category: 'barracks', tier: 3, unit_id: 'e622', upgrades: [],                        cost: { gold: 200 } },
      { id: 'acolyte_shrine',      label: 'Acolyte Shrine',      category: 'barracks', tier: 1, unit_id: 'e2',   upgrades: ['e21', 'e22'],            cost: { gold: 50 } },
      { id: 'sun_temple',          label: 'Sun Temple',          category: 'barracks', tier: 2, unit_id: 'e21',  upgrades: ['e211'],                  cost: { gold: 100 } },
      { id: 'mithrails_champion_keep', label: 'Mithrails Champion Keep', category: 'barracks', tier: 3, unit_id: 'e211', upgrades: [], cost: { gold: 200 } },
      { id: 'priest_shrine',       label: 'Priest Shrine',       category: 'barracks', tier: 2, unit_id: 'e22',  upgrades: ['e221'],                  cost: { gold: 100 } },
      { id: 'ardent_shrine',       label: 'Ardent Shrine',       category: 'barracks', tier: 3, unit_id: 'e221', upgrades: [],                        cost: { gold: 200 } },
      { id: 'blessed_soul_shrine', label: 'Blessed Soul Shrine', category: 'barracks', tier: 1, unit_id: 'e7',   upgrades: ['e71'],            cost: { gold: 50 } },
      { id: 'mithrails_light_temple', label: 'Mithrails Light Temple', category: 'barracks', tier: 2, unit_id: 'e71', upgrades: ['e711'], cost: { gold: 100 } },
      { id: 'mithrails_will_temple', label: 'Mithrails Will Temple', category: 'barracks', tier: 3, unit_id: 'e711', upgrades: [], cost: { gold: 200 } },
      { id: 'mage_tower',          label: 'Mage Tower',          category: 'barracks', tier: 1, unit_id: 'e4',   upgrades: ['e41', 'e42'],            cost: { gold: 50 } },
      { id: 'red_mage_tower',      label: 'Red Mage Tower',      category: 'barracks', tier: 2, unit_id: 'e41',  upgrades: ['e411', 'e412'],          cost: { gold: 100 } },
      { id: 'ash_sanctum',         label: 'Ash Sanctum',         category: 'barracks', tier: 3, unit_id: 'e411', upgrades: [],                        cost: { gold: 200 } },
      { id: 'cinder_forge',        label: 'Cinder Forge',        category: 'barracks', tier: 3, unit_id: 'e412', upgrades: [],                        cost: { gold: 200 } },
      { id: 'blue_mage_tower',     label: 'Blue Mage Tower',     category: 'barracks', tier: 2, unit_id: 'e42',  upgrades: ['e421'],                        cost: { gold: 100 } },
      { id: 'cryomancer_tower', label: 'Cryomancer Tower', category: 'barracks', tier: 3, unit_id: 'e421', upgrades: [] },
    ],
    special: [
      { id: 'mercenary_hall', label: 'Mercenary Hall', category: 'special', unit_id: null },
    ],
  },

  choir_of_the_cursed: {
    throne: [
      { id: 'dark_throne', label: 'Dark Throne', category: 'throne', unit_id: null },
      { id: 'warlord_keep_1',     label: 'Warlord Keep',      category: 'throne', unit_id: 'h_d_1',    tier: 1, upgrades: ['h_d_1_a2', 'h_d_1_b2'] },
      { id: 'warlord_keep_2_a',   label: 'Warlord Keep II A', category: 'throne', unit_id: 'h_d_1_a2', tier: 2, upgrades: ['h_d_1_a3', 'h_d_1_b3'] },
      { id: 'warlord_keep_2_b',   label: 'Warlord Keep II B', category: 'throne', unit_id: 'h_d_1_b2', tier: 2, upgrades: ['h_d_1_a3', 'h_d_1_b3'] },
      { id: 'warlord_keep_3_a',   label: 'Warlord Keep III A', category: 'throne', unit_id: 'h_d_1_a3', tier: 3, upgrades: ['h_d_1_a41', 'h_d_1_a42'] },
      { id: 'warlord_keep_3_b',   label: 'Warlord Keep III B', category: 'throne', unit_id: 'h_d_1_b3', tier: 3, upgrades: ['h_d_1_b41', 'h_d_1_b42'] },
      { id: 'warlord_keep_4_a',   label: 'Warlord Keep IV A', category: 'throne', unit_id: 'h_d_1_a41', tier: 4, upgrades: [] },
      { id: 'warlord_keep_4_a_alt', label: 'Warlord Keep IV A Alt', category: 'throne', unit_id: 'h_d_1_a42', tier: 4, upgrades: [] },
      { id: 'warlord_keep_4_b',   label: 'Warlord Keep IV B', category: 'throne', unit_id: 'h_d_1_b41', tier: 4, upgrades: [] },
      { id: 'warlord_keep_4_b_alt', label: 'Warlord Keep IV B Alt', category: 'throne', unit_id: 'h_d_1_b42', tier: 4, upgrades: [] },
      { id: 'hexblade_sanctum_1',     label: 'Hexblade Sanctum',      category: 'throne', unit_id: 'h_d_2',    tier: 1, upgrades: ['h_d_2_a2', 'h_d_2_b2'] },
      { id: 'hexblade_sanctum_2_a',   label: 'Hexblade Sanctum II A', category: 'throne', unit_id: 'h_d_2_a2', tier: 2, upgrades: ['h_d_2_a3', 'h_d_2_b3'] },
      { id: 'hexblade_sanctum_2_b',   label: 'Hexblade Sanctum II B', category: 'throne', unit_id: 'h_d_2_b2', tier: 2, upgrades: ['h_d_2_a3', 'h_d_2_b3'] },
      { id: 'hexblade_sanctum_3_a',   label: 'Hexblade Sanctum III A', category: 'throne', unit_id: 'h_d_2_a3', tier: 3, upgrades: ['h_d_2_a41', 'h_d_2_a42'] },
      { id: 'hexblade_sanctum_3_b',   label: 'Hexblade Sanctum III B', category: 'throne', unit_id: 'h_d_2_b3', tier: 3, upgrades: ['h_d_2_b41', 'h_d_2_b42'] },
      { id: 'hexblade_sanctum_4_a',   label: 'Hexblade Sanctum IV A', category: 'throne', unit_id: 'h_d_2_a41', tier: 4, upgrades: [] },
      { id: 'hexblade_sanctum_4_a_alt', label: 'Hexblade Sanctum IV A Alt', category: 'throne', unit_id: 'h_d_2_a42', tier: 4, upgrades: [] },
      { id: 'hexblade_sanctum_4_b',   label: 'Hexblade Sanctum IV B', category: 'throne', unit_id: 'h_d_2_b41', tier: 4, upgrades: [] },
      { id: 'hexblade_sanctum_4_b_alt', label: 'Hexblade Sanctum IV B Alt', category: 'throne', unit_id: 'h_d_2_b42', tier: 4, upgrades: [] },
      { id: 'infernal_spire_1',     label: 'Infernal Spire',      category: 'throne', unit_id: 'h_d_3',    tier: 1, upgrades: ['h_d_3_a2', 'h_d_3_b2'] },
      { id: 'infernal_spire_2_a',   label: 'Infernal Spire II A', category: 'throne', unit_id: 'h_d_3_a2', tier: 2, upgrades: ['h_d_3_a3', 'h_d_3_b3'] },
      { id: 'infernal_spire_2_b',   label: 'Infernal Spire II B', category: 'throne', unit_id: 'h_d_3_b2', tier: 2, upgrades: ['h_d_3_a3', 'h_d_3_b3'] },
      { id: 'infernal_spire_3_a',   label: 'Infernal Spire III A', category: 'throne', unit_id: 'h_d_3_a3', tier: 3, upgrades: ['h_d_3_a41', 'h_d_3_a42'] },
      { id: 'infernal_spire_3_b',   label: 'Infernal Spire III B', category: 'throne', unit_id: 'h_d_3_b3', tier: 3, upgrades: ['h_d_3_b41', 'h_d_3_b42'] },
      { id: 'infernal_spire_4_a',   label: 'Infernal Spire IV A', category: 'throne', unit_id: 'h_d_3_a41', tier: 4, upgrades: [] },
      { id: 'infernal_spire_4_a_alt', label: 'Infernal Spire IV A Alt', category: 'throne', unit_id: 'h_d_3_a42', tier: 4, upgrades: [] },
      { id: 'infernal_spire_4_b',   label: 'Infernal Spire IV B', category: 'throne', unit_id: 'h_d_3_b41', tier: 4, upgrades: [] },
      { id: 'infernal_spire_4_b_alt', label: 'Infernal Spire IV B Alt', category: 'throne', unit_id: 'h_d_3_b42', tier: 4, upgrades: [] },
    ],
    barracks: [
      { id: 'imp_den',           label: 'Imp Den',           category: 'barracks', tier: 1, unit_id: 'd1',  upgrades: ['d11', 'd12'],   cost: { gold: 50 } },
      { id: 'tormentor_pit',     label: 'Tormentor Pit',     category: 'barracks', tier: 2, unit_id: 'd11', upgrades: ['d111'],        cost: { gold: 100 } },
      { id: 'praetor_pit',       label: 'Praetor Pit',       category: 'barracks', tier: 3, unit_id: 'd111', upgrades: [],             cost: { gold: 200 } },
      { id: 'chorister_chamber', label: 'Chorister Chamber', category: 'barracks', tier: 2, unit_id: 'd12', upgrades: ['d121'],        cost: { gold: 100 } },
      { id: 'chanter_chamber',   label: 'Chanter Chamber',   category: 'barracks', tier: 3, unit_id: 'd121', upgrades: [],             cost: { gold: 200 } },
      { id: 'gargoyle_roost',    label: 'Gargoyle Roost',    category: 'barracks', tier: 1, unit_id: 'd3',  upgrades: ['d31', 'd32'],   cost: { gold: 50 } },
      { id: 'stone_gargoyle_den', label: 'Stone Gargoyle Den', category: 'barracks', tier: 2, unit_id: 'd31', upgrades: ['d311'],       cost: { gold: 100 } },
      { id: 'onyx_gargoyle_den',  label: 'Onyx Gargoyle Den',  category: 'barracks', tier: 3, unit_id: 'd311', upgrades: [],            cost: { gold: 200 } },
      { id: 'quartz_gargoyle_den', label: 'Quartz Gargoyle Den', category: 'barracks', tier: 2, unit_id: 'd32', upgrades: ['d321'],    cost: { gold: 100 } },
      { id: 'azurite_gargoyle_den', label: 'Azurite Gargoyle Den', category: 'barracks', tier: 3, unit_id: 'd321', upgrades: [],       cost: { gold: 200 } },
      { id: 'heretic_pit',       label: 'Heretic Pit',       category: 'barracks', tier: 1, unit_id: 'd4',  upgrades: ['d41'],          cost: { gold: 50 } },
      { id: 'possessed_pit',     label: 'Possessed Pit',     category: 'barracks', tier: 2, unit_id: 'd41', upgrades: ['d411', 'd412'], cost: { gold: 100 } },
      { id: 'vessel_altar',      label: 'Vessel Altar',      category: 'barracks', tier: 3, unit_id: 'd411', upgrades: [],             cost: { gold: 200 } },
      { id: 'pain_projector_den', label: 'Pain Projector Den', category: 'barracks', tier: 3, unit_id: 'd412', upgrades: [],           cost: { gold: 200 } },
      { id: 'peer_court',        label: 'Peer Court',        category: 'barracks', tier: 1, unit_id: 'd6',  upgrades: ['d61'],          cost: { gold: 50 } },
      { id: 'nether_baron_hall', label: 'Nether Baron Hall', category: 'barracks', tier: 2, unit_id: 'd61', upgrades: ['d611'],               cost: { gold: 100 } },
      { id: 'nether_lord_hall', label: 'Nether Lord Hall', category: 'barracks', tier: 3, unit_id: 'd611', upgrades: [] },
      { id: 'flame_spawn_pit',   label: 'Flame Spawn Pit',   category: 'barracks', tier: 1, unit_id: 'd7',  upgrades: ['d71'],          cost: { gold: 50 } },
      { id: 'greater_flame_spawn_pit', label: 'Greater Flame Spawn Pit', category: 'barracks', tier: 2, unit_id: 'd71', upgrades: ['d711'], cost: { gold: 100 } },
      { id: 'inferno_spawn_pit', label: 'Inferno Spawn Pit', category: 'barracks', tier: 3, unit_id: 'd711', upgrades: [] },
      { id: 'cultist_shrine',    label: 'Cultist Shrine',    category: 'barracks', tier: 1, unit_id: 'd5',  upgrades: ['d51'],          cost: { gold: 50 } },
      { id: 'choir_servant_shrine', label: 'Choir Servant Shrine', category: 'barracks', tier: 2, unit_id: 'd51', upgrades: ['d511'],       cost: { gold: 100 } },
      { id: 'choir_ascendant_shrine', label: 'Choir Ascendant Shrine', category: 'barracks', tier: 3, unit_id: 'd511', upgrades: [] },
    ],
    special: [
      { id: 'mercenary_hall', label: 'Mercenary Hall', category: 'special', unit_id: null },
    ],
  },

  grail_of_sorrow: {
    throne: [
      { id: 'sorrow_throne', label: 'Throne of Sorrow', category: 'throne', unit_id: null },
      { id: 'prophet_sepulchre_1',     label: 'Prophet Sepulchre',       category: 'throne', unit_id: 'h_g_1',    tier: 1, upgrades: ['h_g_1_a2', 'h_g_1_b2'] },
      { id: 'prophet_sepulchre_2_a',   label: 'Prophet Sepulchre II A',  category: 'throne', unit_id: 'h_g_1_a2', tier: 2, upgrades: ['h_g_1_a3', 'h_g_1_b3'] },
      { id: 'prophet_sepulchre_2_b',   label: 'Prophet Sepulchre II B',  category: 'throne', unit_id: 'h_g_1_b2', tier: 2, upgrades: ['h_g_1_a3', 'h_g_1_b3'] },
      { id: 'prophet_sepulchre_3_a',   label: 'Prophet Sepulchre III A', category: 'throne', unit_id: 'h_g_1_a3', tier: 3, upgrades: ['h_g_1_a41', 'h_g_1_a42'] },
      { id: 'prophet_sepulchre_3_b',   label: 'Prophet Sepulchre III B', category: 'throne', unit_id: 'h_g_1_b3', tier: 3, upgrades: ['h_g_1_b41', 'h_g_1_b42'] },
      { id: 'prophet_sepulchre_4_a',   label: 'Prophet Sepulchre IV A',  category: 'throne', unit_id: 'h_g_1_a41', tier: 4, upgrades: [] },
      { id: 'prophet_sepulchre_4_a_alt', label: 'Prophet Sepulchre IV A Alt', category: 'throne', unit_id: 'h_g_1_a42', tier: 4, upgrades: [] },
      { id: 'prophet_sepulchre_4_b',   label: 'Prophet Sepulchre IV B',  category: 'throne', unit_id: 'h_g_1_b41', tier: 4, upgrades: [] },
      { id: 'prophet_sepulchre_4_b_alt', label: 'Prophet Sepulchre IV B Alt', category: 'throne', unit_id: 'h_g_1_b42', tier: 4, upgrades: [] },
      { id: 'warden_crypt_1',     label: 'Warden Crypt',       category: 'throne', unit_id: 'h_g_2',    tier: 1, upgrades: ['h_g_2_a2', 'h_g_2_b2'] },
      { id: 'warden_crypt_2_a',   label: 'Warden Crypt II A',  category: 'throne', unit_id: 'h_g_2_a2', tier: 2, upgrades: ['h_g_2_a3', 'h_g_2_b3'] },
      { id: 'warden_crypt_2_b',   label: 'Warden Crypt II B',  category: 'throne', unit_id: 'h_g_2_b2', tier: 2, upgrades: ['h_g_2_a3', 'h_g_2_b3'] },
      { id: 'warden_crypt_3_a',   label: 'Warden Crypt III A', category: 'throne', unit_id: 'h_g_2_a3', tier: 3, upgrades: ['h_g_2_a41', 'h_g_2_a42'] },
      { id: 'warden_crypt_3_b',   label: 'Warden Crypt III B', category: 'throne', unit_id: 'h_g_2_b3', tier: 3, upgrades: ['h_g_2_b41', 'h_g_2_b42'] },
      { id: 'warden_crypt_4_a',   label: 'Warden Crypt IV A',  category: 'throne', unit_id: 'h_g_2_a41', tier: 4, upgrades: [] },
      { id: 'warden_crypt_4_a_alt', label: 'Warden Crypt IV A Alt', category: 'throne', unit_id: 'h_g_2_a42', tier: 4, upgrades: [] },
      { id: 'warden_crypt_4_b',   label: 'Warden Crypt IV B',  category: 'throne', unit_id: 'h_g_2_b41', tier: 4, upgrades: [] },
      { id: 'warden_crypt_4_b_alt', label: 'Warden Crypt IV B Alt', category: 'throne', unit_id: 'h_g_2_b42', tier: 4, upgrades: [] },
      { id: 'voice_chapel_1',     label: 'Voice Chapel',       category: 'throne', unit_id: 'h_g_3',    tier: 1, upgrades: ['h_g_3_a2', 'h_g_3_b2'] },
      { id: 'voice_chapel_2_a',   label: 'Voice Chapel II A',  category: 'throne', unit_id: 'h_g_3_a2', tier: 2, upgrades: ['h_g_3_a3', 'h_g_3_b3'] },
      { id: 'voice_chapel_2_b',   label: 'Voice Chapel II B',  category: 'throne', unit_id: 'h_g_3_b2', tier: 2, upgrades: ['h_g_3_a3', 'h_g_3_b3'] },
      { id: 'voice_chapel_3_a',   label: 'Voice Chapel III A', category: 'throne', unit_id: 'h_g_3_a3', tier: 3, upgrades: ['h_g_3_a41', 'h_g_3_a42'] },
      { id: 'voice_chapel_3_b',   label: 'Voice Chapel III B', category: 'throne', unit_id: 'h_g_3_b3', tier: 3, upgrades: ['h_g_3_b41', 'h_g_3_b42'] },
      { id: 'voice_chapel_4_a',   label: 'Voice Chapel IV A',  category: 'throne', unit_id: 'h_g_3_a41', tier: 4, upgrades: [] },
      { id: 'voice_chapel_4_a_alt', label: 'Voice Chapel IV A Alt', category: 'throne', unit_id: 'h_g_3_a42', tier: 4, upgrades: [] },
      { id: 'voice_chapel_4_b',   label: 'Voice Chapel IV B',  category: 'throne', unit_id: 'h_g_3_b41', tier: 4, upgrades: [] },
      { id: 'voice_chapel_4_b_alt', label: 'Voice Chapel IV B Alt', category: 'throne', unit_id: 'h_g_3_b42', tier: 4, upgrades: [] },
    ],
    barracks: [
      { id: 'zombie_pit',            label: 'Zombie Pit',            category: 'barracks', tier: 1, unit_id: 'gs1',  upgrades: ['gs11', 'gs12', 'gs13'],   cost: { gold: 50 } },
      { id: 'ghoul_pit',             label: 'Ghoul Pit',             category: 'barracks', tier: 2, unit_id: 'gs11', upgrades: ['gs111'],                   cost: { gold: 100 } },
      { id: 'plague_knight_barrow',  label: 'Plague Knight Barrow',  category: 'barracks', tier: 3, unit_id: 'gs111', upgrades: [],                         cost: { gold: 200 } },
      { id: 'cannibal_pit',          label: 'Cannibal Pit',          category: 'barracks', tier: 2, unit_id: 'gs12', upgrades: ['gs121'],                   cost: { gold: 100 } },
      { id: 'abomination_vat',       label: 'Abomination Vat',       category: 'barracks', tier: 3, unit_id: 'gs121', upgrades: [],                         cost: { gold: 200 } },
      { id: 'cesswalker_mire',       label: 'Cesswalker Mire',       category: 'barracks', tier: 2, unit_id: 'gs13', upgrades: ['gs131'],                   cost: { gold: 100 } },
      { id: 'blightwalker_mire',     label: 'Blightwalker Mire',     category: 'barracks', tier: 3, unit_id: 'gs131', upgrades: [],                         cost: { gold: 200 } },
      { id: 'communicant_chapel',    label: 'Communicant Chapel',    category: 'barracks', tier: 1, unit_id: 'gs2',  upgrades: ['gs21'],                   cost: { gold: 50 } },
      { id: 'crimson_communicant_chapel', label: 'Crimson Communicant Chapel', category: 'barracks', tier: 2, unit_id: 'gs21', upgrades: ['gs211'], cost: { gold: 100 } },
      { id: 'chosen_chapel', label: 'Chosen Chapel', category: 'barracks', tier: 3, unit_id: 'gs211', upgrades: [] },
      { id: 'adept_crypt',           label: 'Adept Crypt',           category: 'barracks', tier: 1, unit_id: 'gs3',  upgrades: ['gs31', 'gs32', 'gs33'],    cost: { gold: 50 } },
      { id: 'blood_adept_chamber',   label: 'Blood Adept Chamber',   category: 'barracks', tier: 2, unit_id: 'gs31', upgrades: ['gs311', 'gs312'],          cost: { gold: 100 } },
      { id: 'crimson_mage_tower',    label: 'Crimson Mage Tower',    category: 'barracks', tier: 3, unit_id: 'gs311', upgrades: [],                         cost: { gold: 200 } },
      { id: 'blood_knight_crypt',    label: 'Blood Knight Crypt',    category: 'barracks', tier: 3, unit_id: 'gs312', upgrades: [],                         cost: { gold: 200 } },
      { id: 'necromancer_crypt',     label: 'Necromancer Crypt',     category: 'barracks', tier: 2, unit_id: 'gs32', upgrades: ['gs321'],                          cost: { gold: 100 } },
      { id: 'death_lord_crypt', label: 'Death Lord Crypt', category: 'barracks', tier: 3, unit_id: 'gs321', upgrades: [] },
      { id: 'plague_scholar_lab',    label: 'Plague Scholar Lab',    category: 'barracks', tier: 2, unit_id: 'gs33', upgrades: ['gs331'],                   cost: { gold: 100 } },
      { id: 'plague_lord_lab',       label: 'Plague Lord Lab',       category: 'barracks', tier: 3, unit_id: 'gs331', upgrades: [] },
      { id: 'colossus_barrow',       label: 'Colossus Barrow',       category: 'barracks', tier: 1, unit_id: 'gs4',  upgrades: ['gs41', 'gs42'],            cost: { gold: 50 } },
      { id: 'seraph_shrine',         label: 'Seraph Shrine',         category: 'barracks', tier: 2, unit_id: 'gs41', upgrades: ['gs411'],                          cost: { gold: 100 } },
      { id: 'grail_angel_shrine', label: 'Grail Angel Shrine', category: 'barracks', tier: 3, unit_id: 'gs411', upgrades: [] },
      { id: 'chalice_vault',         label: 'Chalice Vault',         category: 'barracks', tier: 2, unit_id: 'gs42', upgrades: ['gs421'],                          cost: { gold: 100 } },
      { id: 'sorrow_vessel_vault', label: 'Sorrow Vessel Vault', category: 'barracks', tier: 3, unit_id: 'gs421', upgrades: [] },
      { id: 'grail_acolyte_chamber', label: 'Grail Acolyte Chamber', category: 'barracks', tier: 1, unit_id: 'gs5',  upgrades: ['gs51', 'gs52'],            cost: { gold: 50 } },
      { id: 'grail_tender_chamber',  label: 'Grail Tender Chamber',  category: 'barracks', tier: 2, unit_id: 'gs51', upgrades: ['gs511'],                          cost: { gold: 100 } },
      { id: 'grail_keeper_chamber', label: 'Grail Keeper Chamber', category: 'barracks', tier: 3, unit_id: 'gs511', upgrades: [] },
      { id: 'grieving_servant_chamber', label: 'Grieving Servant Chamber', category: 'barracks', tier: 2, unit_id: 'gs52', upgrades: ['gs521'], cost: { gold: 100 } },
      { id: 'grieving_custodian_chamber', label: 'Grieving Custodian Chamber', category: 'barracks', tier: 3, unit_id: 'gs521', upgrades: [] },
      { id: 'ghost_manor',           label: 'Ghost Manor',           category: 'barracks', tier: 1, unit_id: 'gs6',  upgrades: ['gs61', 'gs62'],            cost: { gold: 50 } },
      { id: 'specter_hall',          label: 'Specter Hall',          category: 'barracks', tier: 2, unit_id: 'gs61', upgrades: ['gs611'],                          cost: { gold: 100 } },
      { id: 'wraith_hall', label: 'Wraith Hall', category: 'barracks', tier: 3, unit_id: 'gs611', upgrades: [] },
      { id: 'apparition_mist',       label: 'Apparition Mist',       category: 'barracks', tier: 2, unit_id: 'gs62', upgrades: ['gs621'],                          cost: { gold: 100 } },
      { id: 'phantom_mist', label: 'Phantom Mist', category: 'barracks', tier: 3, unit_id: 'gs621', upgrades: [] },
    ],
    special: [
      { id: 'mercenary_hall', label: 'Mercenary Hall', category: 'special', unit_id: null },
    ],
  },
};

const UNIT_UPGRADE_PATHS = {
  empire: {
    e1:   [{ unit_id: 'e11',  building_id: 'infantry_barracks', label: 'Infantry Barracks' },
           { unit_id: 'e12',  building_id: 'cavalry_stables',   label: 'Cavalry Stables' }],
    e11:  [{ unit_id: 'e111', building_id: 'crossbow_range',    label: 'Crossbow Range' },
           { unit_id: 'e112', building_id: 'heavy_barracks',    label: 'Heavy Barracks' }],
    e3:   [{ unit_id: 'e31',  building_id: 'automaton_lab',     label: 'Automaton Lab' },
           { unit_id: 'e32',  building_id: 'siege_workshop',    label: 'Siege Workshop' }],
    // e5:   [{ unit_id: 'e51',  building_id: 'golden_pride_forge_2', label: 'Golden Pride Forge II' }],
    e6:   [{ unit_id: 'e61',  building_id: 'mechanic_den',      label: 'Mechanic Den' },
           { unit_id: 'e62',  building_id: 'rifleman_range',    label: 'Rifleman Range' }],
    e61:  [{ unit_id: 'e611', building_id: 'mechanic_den_2',    label: 'Mechanic Den II' }],
    e62:  [{ unit_id: 'e621', building_id: 'devastator_post',   label: 'Devastator Post' },
           { unit_id: 'e622', building_id: 'flamethrower_post', label: 'Flamethrower Post' }],
    e2:   [{ unit_id: 'e21',  building_id: 'sun_temple',        label: 'Sun Temple' },
           { unit_id: 'e22',  building_id: 'priest_shrine',     label: 'Priest Shrine' }],
    e21:  [{ unit_id: 'e211', building_id: 'mithrails_champion_keep', label: 'Mithrails Champion Keep' }],
    e22:  [{ unit_id: 'e221', building_id: 'ardent_shrine',     label: 'Ardent Shrine' }],
    e7:   [{ unit_id: 'e71',  building_id: 'mithrails_light_temple', label: 'Mithrails Light Temple' }],
    e71:  [{ unit_id: 'e711', building_id: 'mithrails_will_temple',  label: 'Mithrails Will Temple' }],
    e4:   [{ unit_id: 'e41',  building_id: 'red_mage_tower',    label: 'Red Mage Tower' },
           { unit_id: 'e42',  building_id: 'blue_mage_tower',   label: 'Blue Mage Tower' }],
    e41:  [{ unit_id: 'e411', building_id: 'ash_sanctum',       label: 'Ash Sanctum' },
           { unit_id: 'e412', building_id: 'cinder_forge',      label: 'Cinder Forge' }],
    h_e_1:    [{ unit_id: 'h_e_11',   building_id: 'paladin_cathedral_2_a', label: 'Paladin Cathedral II A' },
               { unit_id: 'h_e_12',   building_id: 'paladin_cathedral_2_b', label: 'Paladin Cathedral II B' }],
    h_e_11:   [{ unit_id: 'h_e_111',  building_id: 'paladin_cathedral_3_a', label: 'Paladin Cathedral III A' },
               { unit_id: 'h_e_121',  building_id: 'paladin_cathedral_3_b', label: 'Paladin Cathedral III B' }],
    h_e_12:   [{ unit_id: 'h_e_111',  building_id: 'paladin_cathedral_3_a', label: 'Paladin Cathedral III A' },
               { unit_id: 'h_e_121',  building_id: 'paladin_cathedral_3_b', label: 'Paladin Cathedral III B' }],
    h_e_111:  [{ unit_id: 'h_e_1111', building_id: 'paladin_cathedral_4_a',     label: 'Paladin Cathedral IV A' },
               { unit_id: 'h_e_1112', building_id: 'paladin_cathedral_4_a_alt', label: 'Paladin Cathedral IV A Alt' }],
    h_e_121:  [{ unit_id: 'h_e_1211', building_id: 'paladin_cathedral_4_b',     label: 'Paladin Cathedral IV B' },
               { unit_id: 'h_e_1212', building_id: 'paladin_cathedral_4_b_alt', label: 'Paladin Cathedral IV B Alt' }],
    h_e_2:    [{ unit_id: 'h_e_2_a2', building_id: 'inquisitor_tower_2_a', label: 'Inquisitor Tower II A' },
               { unit_id: 'h_e_2_b2', building_id: 'inquisitor_tower_2_b', label: 'Inquisitor Tower II B' }],
    h_e_2_a2: [{ unit_id: 'h_e_2_a3', building_id: 'inquisitor_tower_3_a', label: 'Inquisitor Tower III A' },
               { unit_id: 'h_e_2_b3', building_id: 'inquisitor_tower_3_b', label: 'Inquisitor Tower III B' }],
    h_e_2_b2: [{ unit_id: 'h_e_2_a3', building_id: 'inquisitor_tower_3_a', label: 'Inquisitor Tower III A' },
               { unit_id: 'h_e_2_b3', building_id: 'inquisitor_tower_3_b', label: 'Inquisitor Tower III B' }],
    h_e_2_a3: [{ unit_id: 'h_e_2_a41', building_id: 'inquisitor_tower_4_a',     label: 'Inquisitor Tower IV A' },
               { unit_id: 'h_e_2_a42', building_id: 'inquisitor_tower_4_a_alt', label: 'Inquisitor Tower IV A Alt' }],
    h_e_2_b3: [{ unit_id: 'h_e_2_b41', building_id: 'inquisitor_tower_4_b',     label: 'Inquisitor Tower IV B' },
               { unit_id: 'h_e_2_b42', building_id: 'inquisitor_tower_4_b_alt', label: 'Inquisitor Tower IV B Alt' }],
    h_e_3:    [{ unit_id: 'h_e_3_a2', building_id: 'artificer_guild_2_a', label: 'Artificer Guild II A' },
               { unit_id: 'h_e_3_b2', building_id: 'artificer_guild_2_b', label: 'Artificer Guild II B' }],
    h_e_3_a2: [{ unit_id: 'h_e_3_a3', building_id: 'artificer_guild_3_a', label: 'Artificer Guild III A' },
               { unit_id: 'h_e_3_b3', building_id: 'artificer_guild_3_b', label: 'Artificer Guild III B' }],
    h_e_3_b2: [{ unit_id: 'h_e_3_a3', building_id: 'artificer_guild_3_a', label: 'Artificer Guild III A' },
               { unit_id: 'h_e_3_b3', building_id: 'artificer_guild_3_b', label: 'Artificer Guild III B' }],
    h_e_3_a3: [{ unit_id: 'h_e_3_a41', building_id: 'artificer_guild_4_a',     label: 'Artificer Guild IV A' },
               { unit_id: 'h_e_3_a42', building_id: 'artificer_guild_4_a_alt', label: 'Artificer Guild IV A Alt' }],
    h_e_3_b3: [{ unit_id: 'h_e_3_b41', building_id: 'artificer_guild_4_b',     label: 'Artificer Guild IV B' },
               { unit_id: 'h_e_3_b42', building_id: 'artificer_guild_4_b_alt', label: 'Artificer Guild IV B Alt' }],
    e12: [{ unit_id: 'e121', building_id: 'knights_stables', label: 'Knights Stables' }],
    e31: [{ unit_id: 'e311', building_id: 'golden_lion_lab', label: 'Golden Lion Lab' }],
    e32: [{ unit_id: 'e321', building_id: 'siege_dreadnought_workshop', label: 'Siege Dreadnought Workshop' }],
    e71: [{ unit_id: 'e711', building_id: 'mithrails_will_temple', label: 'Mithrails Will' }],
    e42: [{ unit_id: 'e421', building_id: 'cryomancer_tower', label: 'Cryomancer Tower' }],
  },

  choir_of_the_cursed: {
    d1:  [{ unit_id: 'd11', building_id: 'tormentor_pit',      label: 'Tormentor Pit' },
          { unit_id: 'd12', building_id: 'chorister_chamber',  label: 'Chorister Chamber' }],
    d11: [{ unit_id: 'd111', building_id: 'praetor_pit',      label: 'Praetor Pit' }],
    d12: [{ unit_id: 'd121', building_id: 'chanter_chamber',  label: 'Chanter Chamber' }],
    d3:  [{ unit_id: 'd31', building_id: 'stone_gargoyle_den', label: 'Stone Gargoyle Den' },
          { unit_id: 'd32', building_id: 'quartz_gargoyle_den', label: 'Quartz Gargoyle Den' }],
    d31: [{ unit_id: 'd311', building_id: 'onyx_gargoyle_den', label: 'Onyx Gargoyle Den' }],
    d32: [{ unit_id: 'd321', building_id: 'azurite_gargoyle_den', label: 'Azurite Gargoyle Den' }],
    d4:  [{ unit_id: 'd41', building_id: 'possessed_pit',    label: 'Possessed Pit' }],
    d41: [{ unit_id: 'd411', building_id: 'vessel_altar',     label: 'Vessel Altar' },
          { unit_id: 'd412', building_id: 'pain_projector_den', label: 'Pain Projector Den' }],
    d6:  [{ unit_id: 'd61', building_id: 'nether_baron_hall', label: 'Nether Baron Hall' }],
    d7:  [{ unit_id: 'd71', building_id: 'greater_flame_spawn_pit', label: 'Greater Flame Spawn Pit' }],
    d5:  [{ unit_id: 'd51', building_id: 'choir_servant_shrine', label: 'Choir Servant Shrine' }],
    h_d_1:    [{ unit_id: 'h_d_1_a2', building_id: 'warlord_keep_2_a', label: 'Warlord Keep II A' },
               { unit_id: 'h_d_1_b2', building_id: 'warlord_keep_2_b', label: 'Warlord Keep II B' }],
    h_d_1_a2: [{ unit_id: 'h_d_1_a3', building_id: 'warlord_keep_3_a', label: 'Warlord Keep III A' },
               { unit_id: 'h_d_1_b3', building_id: 'warlord_keep_3_b', label: 'Warlord Keep III B' }],
    h_d_1_b2: [{ unit_id: 'h_d_1_a3', building_id: 'warlord_keep_3_a', label: 'Warlord Keep III A' },
               { unit_id: 'h_d_1_b3', building_id: 'warlord_keep_3_b', label: 'Warlord Keep III B' }],
    h_d_1_a3: [{ unit_id: 'h_d_1_a41', building_id: 'warlord_keep_4_a',     label: 'Warlord Keep IV A' },
               { unit_id: 'h_d_1_a42', building_id: 'warlord_keep_4_a_alt', label: 'Warlord Keep IV A Alt' }],
    h_d_1_b3: [{ unit_id: 'h_d_1_b41', building_id: 'warlord_keep_4_b',     label: 'Warlord Keep IV B' },
               { unit_id: 'h_d_1_b42', building_id: 'warlord_keep_4_b_alt', label: 'Warlord Keep IV B Alt' }],
    h_d_2:    [{ unit_id: 'h_d_2_a2', building_id: 'hexblade_sanctum_2_a', label: 'Hexblade Sanctum II A' },
               { unit_id: 'h_d_2_b2', building_id: 'hexblade_sanctum_2_b', label: 'Hexblade Sanctum II B' }],
    h_d_2_a2: [{ unit_id: 'h_d_2_a3', building_id: 'hexblade_sanctum_3_a', label: 'Hexblade Sanctum III A' },
               { unit_id: 'h_d_2_b3', building_id: 'hexblade_sanctum_3_b', label: 'Hexblade Sanctum III B' }],
    h_d_2_b2: [{ unit_id: 'h_d_2_a3', building_id: 'hexblade_sanctum_3_a', label: 'Hexblade Sanctum III A' },
               { unit_id: 'h_d_2_b3', building_id: 'hexblade_sanctum_3_b', label: 'Hexblade Sanctum III B' }],
    h_d_2_a3: [{ unit_id: 'h_d_2_a41', building_id: 'hexblade_sanctum_4_a',     label: 'Hexblade Sanctum IV A' },
               { unit_id: 'h_d_2_a42', building_id: 'hexblade_sanctum_4_a_alt', label: 'Hexblade Sanctum IV A Alt' }],
    h_d_2_b3: [{ unit_id: 'h_d_2_b41', building_id: 'hexblade_sanctum_4_b',     label: 'Hexblade Sanctum IV B' },
               { unit_id: 'h_d_2_b42', building_id: 'hexblade_sanctum_4_b_alt', label: 'Hexblade Sanctum IV B Alt' }],
    h_d_3:    [{ unit_id: 'h_d_3_a2', building_id: 'infernal_spire_2_a', label: 'Infernal Spire II A' },
               { unit_id: 'h_d_3_b2', building_id: 'infernal_spire_2_b', label: 'Infernal Spire II B' }],
    h_d_3_a2: [{ unit_id: 'h_d_3_a3', building_id: 'infernal_spire_3_a', label: 'Infernal Spire III A' },
               { unit_id: 'h_d_3_b3', building_id: 'infernal_spire_3_b', label: 'Infernal Spire III B' }],
    h_d_3_b2: [{ unit_id: 'h_d_3_a3', building_id: 'infernal_spire_3_a', label: 'Infernal Spire III A' },
               { unit_id: 'h_d_3_b3', building_id: 'infernal_spire_3_b', label: 'Infernal Spire III B' }],
    h_d_3_a3: [{ unit_id: 'h_d_3_a41', building_id: 'infernal_spire_4_a',     label: 'Infernal Spire IV A' },
               { unit_id: 'h_d_3_a42', building_id: 'infernal_spire_4_a_alt', label: 'Infernal Spire IV A Alt' }],
    h_d_3_b3: [{ unit_id: 'h_d_3_b41', building_id: 'infernal_spire_4_b',     label: 'Infernal Spire IV B' },
               { unit_id: 'h_d_3_b42', building_id: 'infernal_spire_4_b_alt', label: 'Infernal Spire IV B Alt' }],
    d61: [{ unit_id: 'd611', building_id: 'nether_lord_hall', label: 'Nether Lord Hall' }],
    d71: [{ unit_id: 'd711', building_id: 'inferno_spawn_pit', label: 'Inferno Spawn Pit' }],
    d51: [{ unit_id: 'd511', building_id: 'choir_ascendant_shrine', label: 'Choir Ascendant Shrine' }],
  },

  grail_of_sorrow: {
    gs1:  [{ unit_id: 'gs11',  building_id: 'ghoul_pit',          label: 'Ghoul Pit' },
           { unit_id: 'gs12',  building_id: 'cannibal_pit',        label: 'Cannibal Pit' },
           { unit_id: 'gs13',  building_id: 'cesswalker_mire',     label: 'Cesswalker Mire' }],
    gs11: [{ unit_id: 'gs111', building_id: 'plague_knight_barrow', label: 'Plague Knight Barrow' }],
    gs12: [{ unit_id: 'gs121', building_id: 'abomination_vat',    label: 'Abomination Vat' }],
    gs13: [{ unit_id: 'gs131', building_id: 'blightwalker_mire',  label: 'Blightwalker Mire' }],
    gs2:  [{ unit_id: 'gs21',  building_id: 'crimson_communicant_chapel', label: 'Crimson Communicant Chapel' }],
    gs3:  [{ unit_id: 'gs31',  building_id: 'blood_adept_chamber', label: 'Blood Adept Chamber' },
           { unit_id: 'gs32',  building_id: 'necromancer_crypt',   label: 'Necromancer Crypt' },
           { unit_id: 'gs33',  building_id: 'plague_scholar_lab',  label: 'Plague Scholar Lab' }],
    gs31: [{ unit_id: 'gs311', building_id: 'crimson_mage_tower',  label: 'Crimson Mage Tower' },
           { unit_id: 'gs312', building_id: 'blood_knight_crypt',  label: 'Blood Knight Crypt' }],
    gs33: [{ unit_id: 'gs331', building_id: 'plague_lord_lab',     label: 'Plague Lord Lab' }],
    gs4:  [{ unit_id: 'gs41',  building_id: 'seraph_shrine',       label: 'Seraph Shrine' },
           { unit_id: 'gs42',  building_id: 'chalice_vault',       label: 'Chalice Vault' }],
    gs5:  [{ unit_id: 'gs51',  building_id: 'grail_tender_chamber', label: 'Grail Tender Chamber' },
           { unit_id: 'gs52',  building_id: 'grieving_servant_chamber', label: 'Grieving Servant Chamber' }],
    gs6:  [{ unit_id: 'gs61',  building_id: 'specter_hall',        label: 'Specter Hall' },
           { unit_id: 'gs62',  building_id: 'apparition_mist',     label: 'Apparition Mist' }],
    h_g_1:    [{ unit_id: 'h_g_1_a2', building_id: 'prophet_sepulchre_2_a', label: 'Prophet Sepulchre II A' },
               { unit_id: 'h_g_1_b2', building_id: 'prophet_sepulchre_2_b', label: 'Prophet Sepulchre II B' }],
    h_g_1_a2: [{ unit_id: 'h_g_1_a3', building_id: 'prophet_sepulchre_3_a', label: 'Prophet Sepulchre III A' },
               { unit_id: 'h_g_1_b3', building_id: 'prophet_sepulchre_3_b', label: 'Prophet Sepulchre III B' }],
    h_g_1_b2: [{ unit_id: 'h_g_1_a3', building_id: 'prophet_sepulchre_3_a', label: 'Prophet Sepulchre III A' },
               { unit_id: 'h_g_1_b3', building_id: 'prophet_sepulchre_3_b', label: 'Prophet Sepulchre III B' }],
    h_g_1_a3: [{ unit_id: 'h_g_1_a41', building_id: 'prophet_sepulchre_4_a',     label: 'Prophet Sepulchre IV A' },
               { unit_id: 'h_g_1_a42', building_id: 'prophet_sepulchre_4_a_alt', label: 'Prophet Sepulchre IV A Alt' }],
    h_g_1_b3: [{ unit_id: 'h_g_1_b41', building_id: 'prophet_sepulchre_4_b',     label: 'Prophet Sepulchre IV B' },
               { unit_id: 'h_g_1_b42', building_id: 'prophet_sepulchre_4_b_alt', label: 'Prophet Sepulchre IV B Alt' }],
    h_g_2:    [{ unit_id: 'h_g_2_a2', building_id: 'warden_crypt_2_a', label: 'Warden Crypt II A' },
               { unit_id: 'h_g_2_b2', building_id: 'warden_crypt_2_b', label: 'Warden Crypt II B' }],
    h_g_2_a2: [{ unit_id: 'h_g_2_a3', building_id: 'warden_crypt_3_a', label: 'Warden Crypt III A' },
               { unit_id: 'h_g_2_b3', building_id: 'warden_crypt_3_b', label: 'Warden Crypt III B' }],
    h_g_2_b2: [{ unit_id: 'h_g_2_a3', building_id: 'warden_crypt_3_a', label: 'Warden Crypt III A' },
               { unit_id: 'h_g_2_b3', building_id: 'warden_crypt_3_b', label: 'Warden Crypt III B' }],
    h_g_2_a3: [{ unit_id: 'h_g_2_a41', building_id: 'warden_crypt_4_a',     label: 'Warden Crypt IV A' },
               { unit_id: 'h_g_2_a42', building_id: 'warden_crypt_4_a_alt', label: 'Warden Crypt IV A Alt' }],
    h_g_2_b3: [{ unit_id: 'h_g_2_b41', building_id: 'warden_crypt_4_b',     label: 'Warden Crypt IV B' },
               { unit_id: 'h_g_2_b42', building_id: 'warden_crypt_4_b_alt', label: 'Warden Crypt IV B Alt' }],
    h_g_3:    [{ unit_id: 'h_g_3_a2', building_id: 'voice_chapel_2_a', label: 'Voice Chapel II A' },
               { unit_id: 'h_g_3_b2', building_id: 'voice_chapel_2_b', label: 'Voice Chapel II B' }],
    h_g_3_a2: [{ unit_id: 'h_g_3_a3', building_id: 'voice_chapel_3_a', label: 'Voice Chapel III A' },
               { unit_id: 'h_g_3_b3', building_id: 'voice_chapel_3_b', label: 'Voice Chapel III B' }],
    h_g_3_b2: [{ unit_id: 'h_g_3_a3', building_id: 'voice_chapel_3_a', label: 'Voice Chapel III A' },
               { unit_id: 'h_g_3_b3', building_id: 'voice_chapel_3_b', label: 'Voice Chapel III B' }],
    h_g_3_a3: [{ unit_id: 'h_g_3_a41', building_id: 'voice_chapel_4_a',     label: 'Voice Chapel IV A' },
               { unit_id: 'h_g_3_a42', building_id: 'voice_chapel_4_a_alt', label: 'Voice Chapel IV A Alt' }],
    h_g_3_b3: [{ unit_id: 'h_g_3_b41', building_id: 'voice_chapel_4_b',     label: 'Voice Chapel IV B' },
               { unit_id: 'h_g_3_b42', building_id: 'voice_chapel_4_b_alt', label: 'Voice Chapel IV B Alt' }],
    gs32: [{ unit_id: 'gs321', building_id: 'death_lord_crypt', label: 'Death Lord Crypt' }],
    gs21: [{ unit_id: 'gs211', building_id: 'chosen_chapel', label: 'Chosen Chapel' }],
    gs41: [{ unit_id: 'gs411', building_id: 'grail_angel_shrine', label: 'Grail Angel Shrine' }],
    gs42: [{ unit_id: 'gs421', building_id: 'sorrow_vessel_vault', label: 'Sorrow Vessel Vault' }],
    gs51: [{ unit_id: 'gs511', building_id: 'grail_keeper_chamber', label: 'Grail Keeper Chamber' }],
    gs52: [{ unit_id: 'gs521', building_id: 'grieving_custodian_chamber', label: 'Grieving Custodian Chamber' }],
    gs61: [{ unit_id: 'gs611', building_id: 'wraith_hall', label: 'Wraith Hall' }],
    gs62: [{ unit_id: 'gs621', building_id: 'phantom_mist', label: 'Phantom Mist' }],
  },
};

const HERO_MAX_LEVEL = 4;

const THRONE_UPGRADE_COSTS = {
  1: { gold: 50 },
  2: { gold: 150 },
  3: { gold: 300 },
  4: { gold: 500 },
};

// Upgrading the Throne to level 2/3/4 lets the player pick ONE perk from that
// level's pair (permanent). The chosen perks live in
// buildings_data.throne_perks = { "2": <id>, "3": <id>, "4": <id> }.
//
// `effect` is read by whatever system owns that reward:
//   spell_cost_reduction_pct  -> routes /spells/research
//   embark_gold_pct / embark_xp_pct / embark_crystal_pct -> routes /battle/reward
//   regen (out-of-combat) and daily_crystal_bonus_pct are applied by the Supabase
//   cron/edge functions, which read throne_perks directly; routes just stores them.
const THRONE_PERKS = {
  2: [
    { id: 'infirmary',   label: 'Infirmary',    label_ru: 'Лазарет',      desc: 'Doubles out-of-combat health regeneration.', desc_ru: 'Удваивает восстановление здоровья вне боя.', effect: { regen_mult: 2 } },
    { id: 'crystal_mine', label: 'Crystal Mine', label_ru: 'Кристальная шахта', desc: '+25% crystals from your daily reward.', desc_ru: '+25% кристаллов от ежедневной награды.', effect: { daily_crystal_bonus_pct: 25 } },
  ],
  3: [
    { id: 'mage_guild', label: 'Mage Guild', label_ru: 'Гильдия магов', desc: 'Spell research costs 25% fewer crystals.', desc_ru: 'Изучение заклинаний стоит на 25% меньше кристаллов.', effect: { spell_cost_reduction_pct: 25 } },
    { id: 'war_chest',  label: 'War Chest',  label_ru: 'Военный сундук', desc: '+15% gold from every embark.', desc_ru: '+15% золота за каждый поход.', effect: { embark_gold_pct: 15 } },
  ],
  4: [
    { id: 'scholars_sanctum', label: "Scholar's Sanctum", label_ru: 'Святилище учёных', desc: '+15% XP from every embark.', desc_ru: '+15% опыта за каждый поход.', effect: { embark_xp_pct: 15 } },
    { id: 'grand_reliquary',  label: 'Grand Reliquary',    label_ru: 'Великий реликварий', desc: '+15% crystals from every embark.', desc_ru: '+15% кристаллов за каждый поход.', effect: { embark_crystal_pct: 15 } },
  ],
};

// Resolves the chosen perk def for a given level from a throne_perks map.
function getThronePerk(level, throne_perks) {
  const chosenId = throne_perks?.[String(level)] ?? throne_perks?.[level];
  if (!chosenId) return null;
  return (THRONE_PERKS[level] || []).find(p => p.id === chosenId) || null;
}

// Sums every chosen perk's embark reward bonuses across all levels.
function getThronePerkEmbarkBonuses(throne_perks) {
  const totals = { gold_pct: 0, xp_pct: 0, crystal_pct: 0 };
  for (const level of Object.keys(THRONE_PERKS)) {
    const perk = getThronePerk(Number(level), throne_perks);
    if (!perk) continue;
    totals.gold_pct    += perk.effect.embark_gold_pct    ?? 0;
    totals.xp_pct      += perk.effect.embark_xp_pct      ?? 0;
    totals.crystal_pct += perk.effect.embark_crystal_pct ?? 0;
  }
  return totals;
}

// Spell-research cost reduction from the Mage Guild perk (0 if not chosen).
function getSpellCostReductionPct(throne_perks) {
  for (const level of Object.keys(THRONE_PERKS)) {
    const perk = getThronePerk(Number(level), throne_perks);
    if (perk?.effect.spell_cost_reduction_pct) return perk.effect.spell_cost_reduction_pct;
  }
  return 0;
}

function getBuildingDef(faction, buildingId) {
  const factionPools = BUILDING_POOLS[faction];
  if (!factionPools) return null;
  for (const pool of Object.values(factionPools)) {
    const found = pool.find(b => b.id === buildingId);
    if (found) return found;
  }
  return null;
}

// ── Building costs ──────────────────────────────────────────────────────────
// Unit dwellings are priced by a formula rather than per building, so a new
// building never has to be balanced by hand:
//
//   tier N  ->  40 x N gold
//            +  20 x N of the FACTION crystal      (the predictable floor)
//            +  10 x N of the unit's OWN element   (so every crystal type has a
//                                                   sink, not just the faction's)
//   a dwelling whose unit occupies TWO cells (size 'row' / 'column') costs
//   LARGE_UNIT_COST_MULT more of everything, because it is worth two of a small
//   one on the field and eats two points of loyalty.
//
// The element comes from the unit's damage_source; a unit with none (physical or
// null, e.g. most knights) pays the faction crystal only, and a unit whose
// element IS the faction crystal simply pays the two amounts merged.
//
// Tier 1: small 40g + 20 faction + 10 element, large 60g + 30 + 15. See
// STARTING_RESOURCES in routes/index.js — a new player can afford one of each.
const BUILDING_COST_PER_TIER = { gold: 40, faction_crystals: 20, element_crystals: 10 };
const LARGE_UNIT_COST_MULT   = 1.5;

const FACTION_CRYSTAL = {
  empire:              'Crystals_Life',
  choir_of_the_cursed: 'Crystals_Fire',
  grail_of_sorrow:     'Crystals_Death',
};

// data/units.js spells the cold element 'cold'; the resource is Crystals_Frost.
const ELEMENT_CRYSTAL = {
  fire:   'Crystals_Fire',
  life:   'Crystals_Life',
  death:  'Crystals_Death',
  nature: 'Crystals_Nature',
  cold:   'Crystals_Frost',
  air:    'Crystals_Air',
};

let _unitIndex = null;
function findUnitDef(unitId) {
  if (!_unitIndex) {
    _unitIndex = {};
    try {
      const { UNITS } = require('./units');
      (function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (node.id && (node.tags || node.hp)) { _unitIndex[node.id] = node; return; }
        Object.values(node).forEach(walk);
      })(UNITS);
    } catch { _unitIndex = {}; }
  }
  return _unitIndex[unitId] || null;
}

function isLargeUnit(unitId) {
  const size = findUnitDef(unitId)?.size ?? 'tile';
  return size === 'row' || size === 'column';
}

function elementCrystalFor(unitId) {
  const src = findUnitDef(unitId)?.damage_source;
  return ELEMENT_CRYSTAL[String(src)] || null;
}

// Applied to every non-throne dwelling at module load. Throne buildings keep
// THRONE_UPGRADE_COSTS; mercenary buildings keep their trophy costs.
function applyBuildingCosts() {
  for (const [faction, pools] of Object.entries(BUILDING_POOLS)) {
    const factionCrystal = FACTION_CRYSTAL[faction];
    for (const [category, list] of Object.entries(pools)) {
      if (category === 'throne') continue;
      for (const def of list) {
        if (!def.unit_id || def.placeholder) continue;
        const tier = def.tier ?? 1;
        const mult = isLargeUnit(def.unit_id) ? LARGE_UNIT_COST_MULT : 1;
        const scale = amount => Math.round(amount * tier * mult);

        const cost = { gold: scale(BUILDING_COST_PER_TIER.gold) };
        if (factionCrystal) cost[factionCrystal] = scale(BUILDING_COST_PER_TIER.faction_crystals);

        const element = elementCrystalFor(def.unit_id);
        if (element) {
          // Same crystal on both counts (a Life-damage Empire unit) just adds up.
          cost[element] = (cost[element] || 0) + scale(BUILDING_COST_PER_TIER.element_crystals);
        }
        def.cost = cost;
      }
    }
  }
}
applyBuildingCosts();

// ── Deconstruction ──────────────────────────────────────────────────────────
// Two operations on an occupied slot:
//   RESPEC  swap the building for a SIBLING — same category, same tier — so a
//           player who took the wrong branch of an upgrade tree is not stuck
//           with it. Costs RESPEC_COST_PCT of the new building's build cost.
//   CLEAR   demolish the slot outright, freeing it for a different line. The
//           throne is exempt: it can be respecced but never cleared, since a
//           player without a throne has no hero and no game.
const RESPEC_COST_PCT = 25;

// Same category and same tier as `buildingId`, excluding itself. For the throne
// this is the other branch at the current level (…_2_a <-> …_2_b).
function getRespecOptions(faction, buildingId) {
  const pools = BUILDING_POOLS[faction];
  if (!pools) return [];
  const current = getBuildingDef(faction, buildingId);
  if (!current) return [];
  const pool = pools[current.category] || [];
  return pool.filter(b =>
    b.id !== current.id &&
    b.tier != null && b.tier === current.tier &&
    b.unit_id // 'throne' itself is a placeholder with no unit and no tier
  );
}

// A percentage of a cost map, rounded up so a respec is never free.
function scaleCost(cost, pct) {
  const out = {};
  for (const [item, amount] of Object.entries(cost || {})) {
    const scaled = Math.ceil(Number(amount) * pct / 100);
    if (scaled > 0) out[item] = scaled;
  }
  return out;
}

// What a respec into `buildingId` costs. Throne buildings carry no `cost` of
// their own — they are paid for through THRONE_UPGRADE_COSTS — so fall back to
// the cost of the level the slot currently sits at.
function getRespecCost(faction, buildingId, level) {
  const def = getBuildingDef(faction, buildingId);
  if (!def) return {};
  const base = def.cost || (def.category === 'throne' ? THRONE_UPGRADE_COSTS[level] : null) || {};
  return scaleCost(base, RESPEC_COST_PCT);
}

function emptyStructures() {
  const slots = { slot_0: { level: 0, building_id: null } };
  for (let i = 1; i <= 8; i++) {
    slots[`slot_${i}`] = { level: 0, building_id: null };
  }
  return slots;
}

const MERCENARY_BUILDINGS = {
  crimson_basilica: [
    {
      id:       'cb_aggrails_herald',
      label:    'Aggrails Herald',
      region:   'crimson_basilica',
      unit_id:  'opb_e1',
      tier:     1,
      upgrades: ['cb_exalted_herald'],
      cost:     { vial_of_pure_blood: 1, aggrails_signet: 1 },
    },
    {
      id:       'cb_exalted_herald',
      label:    'Exalted Herald',
      region:   'crimson_basilica',
      unit_id:  'opb_e11',
      tier:     2,
      upgrades: ['cb_exalted_evangelist'],
      cost:     { vial_of_pure_blood: 2, aggrails_signet: 2 },
    },
    {
      id:       'cb_exalted_evangelist',
      label:    'Exalted Evangelist',
      region:   'crimson_basilica',
      unit_id:  'opb_e111',
      tier:     3,
      upgrades: [],
      cost:     { vial_of_pure_blood: 4, aggrails_signet: 3 },
    },
    {
      id:       'cb_scarlet_recruit',
      label:    'Recruit',
      region:   'crimson_basilica',
      unit_id:  'opb_e2',
      tier:     1,
      upgrades: ['cb_aggrails_devoted'],
      cost:     { vial_of_pure_blood: 1, aggrails_signet: 1 },
    },
    {
      id:       'cb_aggrails_devoted',
      label:    'Aggrails Devoted',
      region:   'crimson_basilica',
      unit_id:  'opb_e21',
      tier:     2,
      upgrades: ['cb_aggrails_champion'],
      cost:     { vial_of_pure_blood: 2, aggrails_signet: 2 },
    },
    {
      id:       'cb_aggrails_champion',
      label:    'Aggrails Champion',
      region:   'crimson_basilica',
      unit_id:  'opb_e211',
      tier:     3,
      upgrades: [],
      cost:     { vial_of_pure_blood: 4, aggrails_signet: 3 },
    },
    {
      id:       'cb_initiate',
      label:    'Initiate',
      region:   'crimson_basilica',
      unit_id:  'opb_e3',
      tier:     1,
      upgrades: ['cb_keeper_of_purity'],
      cost:     { vial_of_pure_blood: 1, aggrails_signet: 2 },
    },
    {
      id:       'cb_keeper_of_purity',
      label:    'Keeper of Purity',
      region:   'crimson_basilica',
      unit_id:  'opb_e31',
      tier:     2,
      upgrades: ['cb_high_keeper'],
      cost:     { vial_of_pure_blood: 3, aggrails_signet: 3 },
    },
    {
      id:       'cb_high_keeper',
      label:    'High Keeper',
      region:   'crimson_basilica',
      unit_id:  'opb_e311',
      tier:     3,
      upgrades: [],
      cost:     { vial_of_pure_blood: 4, aggrails_signet: 4 },
    },
    // Archer line. The id stays cb_crimson_hunter — saved buildings_data rows
    // reference it — but the label now names the unit it actually grants
    // (opb_e4 is the Crimson Scout; the Hunter is its tier-2 upgrade).
    {
      id:       'cb_crimson_hunter',
      label:    'Crimson Scout',
      region:   'crimson_basilica',
      unit_id:  'opb_e4',
      tier:     1,
      upgrades: ['cb_crimson_hunter_2'],
      cost:     { vial_of_pure_blood: 1, aggrails_signet: 1 },
    },
    {
      id:       'cb_crimson_hunter_2',
      label:    'Crimson Hunter',
      region:   'crimson_basilica',
      unit_id:  'opb_e41',
      tier:     2,
      upgrades: ['cb_crimson_stalker'],
      cost:     { vial_of_pure_blood: 2, aggrails_signet: 2 },
    },
    {
      id:       'cb_crimson_stalker',
      label:    'Crimson Stalker',
      region:   'crimson_basilica',
      unit_id:  'opb_e411',
      tier:     3,
      upgrades: [],
      cost:     { vial_of_pure_blood: 4, aggrails_signet: 3 },
    },
    // Sister Aldra (opb_e5/opb_e51) is a boss — deliberately NOT recruitable.
  ],

  // Living-crystal mercenaries of the Glittering Abyss. Costs use the region's
  // trophies (crystal_dust / crystal_shard). The Prismatis line (mv_e4/mv_e41)
  // is a boss and is intentionally absent — bosses are never mercenaries.
  glittering_abyss: [
    // Geodeling line — repairing menders.
    {
      id:       'ga_geodeling',
      label:    'Geodeling',
      region:   'glittering_abyss',
      unit_id:  'mv_e1',
      tier:     1,
      upgrades: ['ga_geode_mender'],
      cost:     { crystal_dust: 1, crystal_shard: 1 },
    },
    {
      id:       'ga_geode_mender',
      label:    'Geode Mender',
      region:   'glittering_abyss',
      unit_id:  'mv_e11',
      tier:     2,
      upgrades: ['ga_radiant_geode'],
      cost:     { crystal_dust: 2, crystal_shard: 2 },
    },
    {
      id:       'ga_radiant_geode',
      label:    'Radiant Geode',
      region:   'glittering_abyss',
      unit_id:  'mv_e111',
      tier:     3,
      upgrades: [],
      cost:     { crystal_dust: 4, crystal_shard: 3 },
    },
    // Frostshard line — fast cold strikers.
    {
      id:       'ga_frostshard',
      label:    'Frostshard',
      region:   'glittering_abyss',
      unit_id:  'mv_e2',
      tier:     1,
      upgrades: ['ga_rime_splinter'],
      cost:     { crystal_dust: 1, crystal_shard: 1 },
    },
    {
      id:       'ga_rime_splinter',
      label:    'Rime Splinter',
      region:   'glittering_abyss',
      unit_id:  'mv_e21',
      tier:     2,
      upgrades: ['ga_glacial_prism'],
      cost:     { crystal_dust: 2, crystal_shard: 2 },
    },
    {
      id:       'ga_glacial_prism',
      label:    'Glacial Prism',
      region:   'glittering_abyss',
      unit_id:  'mv_e211',
      tier:     3,
      upgrades: [],
      cost:     { crystal_dust: 4, crystal_shard: 3 },
    },
    // Cairnling line — row-holding protectors.
    {
      id:       'ga_cairnling',
      label:    'Cairnling',
      region:   'glittering_abyss',
      unit_id:  'mv_e3',
      tier:     1,
      upgrades: ['ga_rimewarden'],
      cost:     { crystal_dust: 2, crystal_shard: 1 },
    },
    {
      id:       'ga_rimewarden',
      label:    'Rimewarden',
      region:   'glittering_abyss',
      unit_id:  'mv_e31',
      tier:     2,
      upgrades: ['ga_bulwark_geode'],
      cost:     { crystal_dust: 3, crystal_shard: 2 },
    },
    {
      id:       'ga_bulwark_geode',
      label:    'Bulwark Geode',
      region:   'glittering_abyss',
      unit_id:  'mv_e311',
      tier:     3,
      upgrades: [],
      cost:     { crystal_dust: 5, crystal_shard: 3 },
    },
  ],

  // Restless dead of the Chamber of Unrest. Costs use its trophies (grave_dust /
  // rusted_shackle). Malgrath the Undying (dm_e4/dm_e41) is a boss — not here.
  chamber_of_unrest: [
    // Bone Knight line.
    { id: 'cu_bone_knight',  label: 'Bone Knight',  region: 'chamber_of_unrest', unit_id: 'dm_e1',   tier: 1, upgrades: ['cu_dread_knight'], cost: { grave_dust: 1, rusted_shackle: 1 } },
    { id: 'cu_dread_knight', label: 'Dread Knight', region: 'chamber_of_unrest', unit_id: 'dm_e11',  tier: 2, upgrades: ['cu_death_knight'], cost: { grave_dust: 2, rusted_shackle: 2 } },
    { id: 'cu_death_knight', label: 'Death Knight', region: 'chamber_of_unrest', unit_id: 'dm_e111', tier: 3, upgrades: [],                   cost: { grave_dust: 4, rusted_shackle: 3 } },
    // Oathbound Martyr line.
    { id: 'cu_oathbound_martyr', label: 'Oathbound Martyr', region: 'chamber_of_unrest', unit_id: 'dm_2',   tier: 1, upgrades: ['cu_oathsworn_martyr'], cost: { grave_dust: 1, rusted_shackle: 1 } },
    { id: 'cu_oathsworn_martyr', label: 'Oathsworn Martyr', region: 'chamber_of_unrest', unit_id: 'dm_21',  tier: 2, upgrades: ['cu_martyr_of_the_vow'], cost: { grave_dust: 2, rusted_shackle: 2 } },
    { id: 'cu_martyr_of_the_vow', label: 'Martyr of the Vow', region: 'chamber_of_unrest', unit_id: 'dm_211', tier: 3, upgrades: [],                       cost: { grave_dust: 4, rusted_shackle: 3 } },
    // Wailing Ghost line.
    { id: 'cu_wailing_ghost',  label: 'Wailing Ghost',  region: 'chamber_of_unrest', unit_id: 'dm_e3',   tier: 1, upgrades: ['cu_revenant'],       cost: { grave_dust: 2, rusted_shackle: 1 } },
    { id: 'cu_revenant',       label: 'Revenant',       region: 'chamber_of_unrest', unit_id: 'dm_e31',  tier: 2, upgrades: ['cu_soul_harvester'], cost: { grave_dust: 3, rusted_shackle: 2 } },
    { id: 'cu_soul_harvester', label: 'Soul Harvester', region: 'chamber_of_unrest', unit_id: 'dm_e311', tier: 3, upgrades: [],                     cost: { grave_dust: 5, rusted_shackle: 3 } },
  ],
};

module.exports = {
  BUILDING_POOLS,
  MERCENARY_BUILDINGS,
  SLOT_CATEGORIES,
  UNIT_UPGRADE_PATHS,
  HERO_MAX_LEVEL,
  THRONE_UPGRADE_COSTS,
  THRONE_PERKS,
  getThronePerk,
  getThronePerkEmbarkBonuses,
  getSpellCostReductionPct,
  getBuildingDef,
  emptyStructures,
  FACTION_CRYSTAL,
  BUILDING_COST_PER_TIER,
  LARGE_UNIT_COST_MULT,
  RESPEC_COST_PCT,
  getRespecOptions,
  getRespecCost,
  scaleCost,
};