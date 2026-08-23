// Slot ids are STORAGE, not layout. Where each one sits on the castle grid is
// decided in public/style.css by [data-slot]; the numbering here is frozen so a
// saved buildings_data keeps meaning what it meant when it was written.
//
// That is why slots 9-11 are barracks appended at the end rather than inserted
// after slot_5: renumbering to make the ids read in grid order would silently
// move every existing player's buildings to different squares.
const SLOT_CATEGORIES = {
  slot_0:  'throne',
  slot_1:  'barracks',
  slot_2:  'barracks',
  slot_3:  'barracks',
  slot_4:  'barracks',
  slot_5:  'barracks',
  slot_6:  'special',
  slot_7:  'special',
  slot_8:  'special',
  slot_9:  'barracks',
  slot_10: 'barracks',
  slot_11: 'barracks',

  // ── Layer 2 ───────────────────────────────────────────────────────────────
  // The second castle page. Same 4x3 grid as layer 1, one column per line of
  // progression: throne, mercenary, barracks. Ids stay `slot_N` and stay
  // ROW-MAJOR (12,13,14 = top row) because half the codebase identifies a slot
  // with /^slot_\d+$/ and sorts on Number(id.slice(5)); a prettier scheme like
  // slot_t0 would silently drop these from every one of those places.
  slot_12: 'throne_up',   slot_13: 'merc_up',   slot_14: 'barracks_up',
  slot_15: 'throne_up',   slot_16: 'merc_up',   slot_17: 'barracks_up',
  slot_18: 'throne_up',   slot_19: 'merc_up',   slot_20: 'barracks_up',
  slot_21: 'throne_up',   slot_22: 'merc_up',   slot_23: 'barracks_up',
};
const SLOT_IDS = Object.keys(SLOT_CATEGORIES);

// Which page a slot is drawn on. Everything else about a slot works the same on
// either layer — this only decides where it is rendered and which arrow reveals
// it.
const SLOT_LAYERS = {};
for (const slot of SLOT_IDS) {
  SLOT_LAYERS[slot] = Number(slot.slice(5)) >= 12 ? 2 : 1;
}
const LAYER_COUNT = 2;
const slotsOnLayer = layer => SLOT_IDS.filter(s => SLOT_LAYERS[s] === layer);

// ── Slot gating ─────────────────────────────────────────────────────────────
// A slot listed here cannot be built in until the named building exists
// ANYWHERE in the player's castle. The unlockers live on layer 2, which is why
// they are not themselves gated: gating the Mercenary Hall behind a special
// slot would have deadlocked it against the slots it unlocks.
//
// Existing players are not grandfathered — a slot they have already built in
// stays built and keeps working (see isSlotUnlocked), because taking a built
// slot away retroactively is not a feature, it is a bug report.
const SLOT_UNLOCKS = {
  slot_6:  'mercenary_hall',
  slot_7:  'mercenary_hall',
  slot_8:  'mercenary_hall',
  slot_9:  'barracks_2',
  slot_10: 'barracks_2',
  slot_11: 'barracks_2',
};

function hasBuilding(buildingsData, buildingId) {
  if (!buildingsData || !buildingId) return false;
  return Object.entries(buildingsData).some(([key, state]) =>
    /^slot_\d+$/.test(key) && state?.building_id === buildingId);
}

// `reason` is the building id still needed, or null when the slot is open.
function slotLockedBy(buildingsData, slot) {
  const required = SLOT_UNLOCKS[slot];
  if (!required) return null;
  // Already built in = already earned. Only EMPTY gated slots stay shut.
  if (buildingsData?.[slot]?.building_id) return null;
  return hasBuilding(buildingsData, required) ? null : required;
}

function isSlotUnlocked(buildingsData, slot) {
  return slotLockedBy(buildingsData, slot) === null;
}

const BUILDING_POOLS = {
  empire: {
    throne: [
      { id: 'throne', label: 'Throne', label_ru: 'Трон', category: 'throne', unit_id: null },
      { id: 'paladin_cathedral_1',       label: 'Paladin Cathedral', label_ru: 'Собор паладинов',       category: 'throne', unit_id: 'h_e_1',    tier: 1, upgrades: ['paladin_cathedral_2_a', 'paladin_cathedral_2_b'] },
      { id: 'paladin_cathedral_2_a',     label: 'Paladin Cathedral II A', label_ru: 'Собор паладинов II A',   category: 'throne', unit_id: 'h_e_11',   tier: 2, upgrades: ['paladin_cathedral_3_a'] },
      { id: 'paladin_cathedral_2_b',     label: 'Paladin Cathedral II B', label_ru: 'Собор паладинов II B',   category: 'throne', unit_id: 'h_e_12',   tier: 2, upgrades: ['paladin_cathedral_3_b'] },
      { id: 'paladin_cathedral_3_a',     label: 'Paladin Cathedral III A', label_ru: 'Собор паладинов III A',  category: 'throne', unit_id: 'h_e_111',  tier: 3, upgrades: ['paladin_cathedral_4_a', 'paladin_cathedral_4_a_alt'] },
      { id: 'paladin_cathedral_3_b',     label: 'Paladin Cathedral III B', label_ru: 'Собор паладинов III B',  category: 'throne', unit_id: 'h_e_121',  tier: 3, upgrades: ['paladin_cathedral_4_b', 'paladin_cathedral_4_b_alt'] },
      { id: 'paladin_cathedral_4_a',     label: 'Paladin Cathedral IV A', label_ru: 'Собор паладинов IV A',   category: 'throne', unit_id: 'h_e_1111', tier: 4, upgrades: [] },
      { id: 'paladin_cathedral_4_a_alt', label: 'Paladin Cathedral IV A Alt', label_ru: 'Собор паладинов IV A Alt', category: 'throne', unit_id: 'h_e_1112', tier: 4, upgrades: [] },
      { id: 'paladin_cathedral_4_b',     label: 'Paladin Cathedral IV B', label_ru: 'Собор паладинов IV B',   category: 'throne', unit_id: 'h_e_1211', tier: 4, upgrades: [] },
      { id: 'paladin_cathedral_4_b_alt', label: 'Paladin Cathedral IV B Alt', label_ru: 'Собор паладинов IV B Alt', category: 'throne', unit_id: 'h_e_1212', tier: 4, upgrades: [] },
      { id: 'inquisitor_tower_1',        label: 'Inquisitor Tower', label_ru: 'Башня инквизиторов',         category: 'throne', unit_id: 'h_e_2',    tier: 1, upgrades: ['inquisitor_tower_2_a', 'inquisitor_tower_2_b'] },
      { id: 'inquisitor_tower_2_a',      label: 'Inquisitor Tower II A', label_ru: 'Башня инквизиторов II A',    category: 'throne', unit_id: 'h_e_2_a2', tier: 2, upgrades: ['inquisitor_tower_3_a'] },
      { id: 'inquisitor_tower_2_b',      label: 'Inquisitor Tower II B', label_ru: 'Башня инквизиторов II B',    category: 'throne', unit_id: 'h_e_2_b2', tier: 2, upgrades: ['inquisitor_tower_3_b'] },
      { id: 'inquisitor_tower_3_a',      label: 'Inquisitor Tower III A', label_ru: 'Башня инквизиторов III A',   category: 'throne', unit_id: 'h_e_2_a3', tier: 3, upgrades: ['inquisitor_tower_4_a', 'inquisitor_tower_4_a_alt'] },
      { id: 'inquisitor_tower_3_b',      label: 'Inquisitor Tower III B', label_ru: 'Башня инквизиторов III B',   category: 'throne', unit_id: 'h_e_2_b3', tier: 3, upgrades: ['inquisitor_tower_4_b', 'inquisitor_tower_4_b_alt'] },
      { id: 'inquisitor_tower_4_a',      label: 'Inquisitor Tower IV A', label_ru: 'Башня инквизиторов IV A',    category: 'throne', unit_id: 'h_e_2_a41', tier: 4, upgrades: [] },
      { id: 'inquisitor_tower_4_a_alt',  label: 'Inquisitor Tower IV A Alt', label_ru: 'Башня инквизиторов IV A Alt', category: 'throne', unit_id: 'h_e_2_a42', tier: 4, upgrades: [] },
      { id: 'inquisitor_tower_4_b',      label: 'Inquisitor Tower IV B', label_ru: 'Башня инквизиторов IV B',    category: 'throne', unit_id: 'h_e_2_b41', tier: 4, upgrades: [] },
      { id: 'inquisitor_tower_4_b_alt',  label: 'Inquisitor Tower IV B Alt', label_ru: 'Башня инквизиторов IV B Alt', category: 'throne', unit_id: 'h_e_2_b42', tier: 4, upgrades: [] },
      { id: 'artificer_guild_1',         label: 'Artificer Guild', label_ru: 'Гильдия артефакторов',          category: 'throne', unit_id: 'h_e_3',    tier: 1, upgrades: ['artificer_guild_2_a', 'artificer_guild_2_b'] },
      { id: 'artificer_guild_2_a',       label: 'Artificer Guild II A', label_ru: 'Гильдия артефакторов II A',     category: 'throne', unit_id: 'h_e_3_a2', tier: 2, upgrades: ['artificer_guild_3_a'] },
      { id: 'artificer_guild_2_b',       label: 'Artificer Guild II B', label_ru: 'Гильдия артефакторов II B',     category: 'throne', unit_id: 'h_e_3_b2', tier: 2, upgrades: ['artificer_guild_3_b'] },
      { id: 'artificer_guild_3_a',       label: 'Artificer Guild III A', label_ru: 'Гильдия артефакторов III A',    category: 'throne', unit_id: 'h_e_3_a3', tier: 3, upgrades: ['artificer_guild_4_a', 'artificer_guild_4_a_alt'] },
      { id: 'artificer_guild_3_b',       label: 'Artificer Guild III B', label_ru: 'Гильдия артефакторов III B',    category: 'throne', unit_id: 'h_e_3_b3', tier: 3, upgrades: ['artificer_guild_4_b', 'artificer_guild_4_b_alt'] },
      { id: 'artificer_guild_4_a',       label: 'Artificer Guild IV A', label_ru: 'Гильдия артефакторов IV A',     category: 'throne', unit_id: 'h_e_3_a41', tier: 4, upgrades: [] },
      { id: 'artificer_guild_4_a_alt',   label: 'Artificer Guild IV A Alt', label_ru: 'Гильдия артефакторов IV A Alt', category: 'throne', unit_id: 'h_e_3_a42', tier: 4, upgrades: [] },
      { id: 'artificer_guild_4_b',       label: 'Artificer Guild IV B', label_ru: 'Гильдия артефакторов IV B',     category: 'throne', unit_id: 'h_e_3_b41', tier: 4, upgrades: [] },
      { id: 'artificer_guild_4_b_alt',   label: 'Artificer Guild IV B Alt', label_ru: 'Гильдия артефакторов IV B Alt', category: 'throne', unit_id: 'h_e_3_b42', tier: 4, upgrades: [] },
    ],
    barracks: [
      { id: 'conscript_barracks',  label: 'Conscript Barracks', label_ru: 'Казармы рекрутов',  category: 'barracks', tier: 1, unit_id: 'e1',   upgrades: ['infantry_barracks', 'cavalry_stables'],          cost: { gold: 50 } },
      { id: 'infantry_barracks',   label: 'Infantry Barracks', label_ru: 'Пехотные казармы',   category: 'barracks', tier: 2, unit_id: 'e11',  upgrades: ['crossbow_range', 'heavy_barracks', 'blade_guard_hall'], cost: { gold: 100 } },
      { id: 'crossbow_range',      label: 'Crossbow Range', label_ru: 'Стрельбище арбалетчиков',      category: 'barracks', tier: 3, unit_id: 'e111', upgrades: [],                        cost: { gold: 200 } },
      { id: 'heavy_barracks',      label: 'Heavy Barracks', label_ru: 'Тяжёлые казармы',      category: 'barracks', tier: 3, unit_id: 'e112', upgrades: [],                        cost: { gold: 200 } },
      { id: 'blade_guard_hall',    label: 'Blade Guard Hall', label_ru: 'Зал Стражей Клинка',    category: 'barracks', tier: 3, unit_id: 'e113', upgrades: [],                        cost: { gold: 200 } },
      { id: 'cavalry_stables',     label: 'Cavalry Stables', label_ru: 'Кавалерийские конюшни',     category: 'barracks', tier: 2, unit_id: 'e12',  upgrades: ['knights_stables'],                        cost: { gold: 100 } },
      { id: 'knights_stables', label: 'Knights Stables', label_ru: 'Рыцарские конюшни', category: 'barracks', tier: 3, unit_id: 'e121', upgrades: [] },
      { id: 'sentinel_forge',      label: 'Sentinel Forge', label_ru: 'Кузня стражей',      category: 'barracks', tier: 1, unit_id: 'e3',   upgrades: ['automaton_lab', 'siege_workshop'],            cost: { gold: 50 } },
      { id: 'automaton_lab',       label: 'Automaton Lab', label_ru: 'Лаборатория автоматонов',       category: 'barracks', tier: 2, unit_id: 'e31',  upgrades: ['golden_lion_lab'],                        cost: { gold: 100 } },
      { id: 'golden_lion_lab', label: 'Golden Lion Lab', label_ru: 'Лаборатория золотых львов', category: 'barracks', tier: 3, unit_id: 'e311', upgrades: [] },
      { id: 'siege_workshop',      label: 'Siege Workshop', label_ru: 'Осадная мастерская',      category: 'barracks', tier: 2, unit_id: 'e32',  upgrades: ['siege_dreadnought_workshop'],                        cost: { gold: 100 } },
      { id: 'siege_dreadnought_workshop', label: 'Siege Dreadnought Workshop', label_ru: 'Мастерская осадных дредноутов', category: 'barracks', tier: 3, unit_id: 'e321', upgrades: [] },
      { id: 'smith_workshop',      label: 'Smith Workshop', label_ru: 'Кузнечная мастерская',      category: 'barracks', tier: 1, unit_id: 'e6',   upgrades: ['mechanic_den', 'rifleman_range'],            cost: { gold: 50 } },
      { id: 'mechanic_den',        label: 'Mechanic Den', label_ru: 'Мастерская механиков',        category: 'barracks', tier: 2, unit_id: 'e61',  upgrades: ['mechanic_den_2'],                  cost: { gold: 100 } },
      { id: 'mechanic_den_2',      label: 'Mechanic Den II', label_ru: 'Мастерская механиков II',     category: 'barracks', tier: 3, unit_id: 'e611', upgrades: [],                        cost: { gold: 200 } },
      { id: 'rifleman_range',      label: 'Rifleman Range', label_ru: 'Стрельбище стрелков',      category: 'barracks', tier: 2, unit_id: 'e62',  upgrades: ['devastator_post', 'flamethrower_post'],          cost: { gold: 100 } },
      { id: 'devastator_post',     label: 'Devastator Post', label_ru: 'Пост опустошителей',     category: 'barracks', tier: 3, unit_id: 'e621', upgrades: [],                        cost: { gold: 200 } },
      { id: 'flamethrower_post',   label: 'Flamethrower Post', label_ru: 'Пост огнемётчиков',   category: 'barracks', tier: 3, unit_id: 'e622', upgrades: [],                        cost: { gold: 200 } },
      { id: 'acolyte_shrine',      label: 'Acolyte Shrine', label_ru: 'Святилище послушников',      category: 'barracks', tier: 1, unit_id: 'e2',   upgrades: ['sun_temple', 'priest_shrine'],            cost: { gold: 50 } },
      { id: 'sun_temple',          label: 'Sun Temple', label_ru: 'Храм Солнца',          category: 'barracks', tier: 2, unit_id: 'e21',  upgrades: ['mithrails_champion_keep'],                  cost: { gold: 100 } },
      { id: 'mithrails_exemplar_keep', label: 'Mithrails Exemplar Keep', label_ru: 'Твердыня экземпларов Митраила', category: 'barracks', tier: 4, unit_id: 'e2111', upgrades: [], cost: { gold: 400 } },
      { id: 'mithrails_champion_keep', label: 'Mithrails Champion Keep', label_ru: 'Твердыня поборников Митраила', category: 'barracks', tier: 3, unit_id: 'e211', upgrades: ['mithrails_exemplar_keep'], cost: { gold: 200 } },
      { id: 'priest_shrine',       label: 'Priest Shrine', label_ru: 'Святилище жрецов',       category: 'barracks', tier: 2, unit_id: 'e22',  upgrades: ['ardent_shrine'],                  cost: { gold: 100 } },
      { id: 'ardent_shrine',       label: 'Ardent Shrine', label_ru: 'Ревностное святилище',       category: 'barracks', tier: 3, unit_id: 'e221', upgrades: ['high_priest_shrine'],     cost: { gold: 200 } },
      { id: 'high_priest_shrine',  label: 'High Priest Shrine', label_ru: 'Святилище верховных жрецов', category: 'barracks', tier: 4, unit_id: 'e2211', upgrades: [],                    cost: { gold: 400 } },
      { id: 'blessed_soul_shrine', label: 'Blessed Soul Shrine', label_ru: 'Святилище благословенных душ', category: 'barracks', tier: 1, unit_id: 'e7',   upgrades: ['mithrails_light_temple'],            cost: { gold: 50 } },
      { id: 'mithrails_light_temple', label: 'Mithrails Light Temple', label_ru: 'Храм Света Митраила', category: 'barracks', tier: 2, unit_id: 'e71', upgrades: ['mithrails_will_temple'], cost: { gold: 100 } },
      { id: 'mithrails_will_temple', label: 'Mithrails Will Temple', label_ru: 'Храм Воли Митраила', category: 'barracks', tier: 3, unit_id: 'e711', upgrades: [], cost: { gold: 200 } },
      { id: 'mage_tower',          label: 'Mage Tower', label_ru: 'Башня магов',          category: 'barracks', tier: 1, unit_id: 'e4',   upgrades: ['red_mage_tower', 'blue_mage_tower', 'warder_sanctum'], cost: { gold: 50 } },
      { id: 'red_mage_tower',      label: 'Red Mage Tower', label_ru: 'Башня красных магов',      category: 'barracks', tier: 2, unit_id: 'e41',  upgrades: ['ash_sanctum', 'cinder_forge'],          cost: { gold: 100 } },
      { id: 'ash_sanctum',         label: 'Ash Sanctum', label_ru: 'Пепельный санктум',         category: 'barracks', tier: 3, unit_id: 'e411', upgrades: [],                        cost: { gold: 200 } },
      { id: 'cinder_forge',        label: 'Cinder Forge', label_ru: 'Кузня углей',        category: 'barracks', tier: 3, unit_id: 'e412', upgrades: [],                        cost: { gold: 200 } },
      { id: 'blue_mage_tower',     label: 'Blue Mage Tower', label_ru: 'Башня синих магов',     category: 'barracks', tier: 2, unit_id: 'e42',  upgrades: ['cryomancer_tower'],                        cost: { gold: 100 } },
      { id: 'cryomancer_tower', label: 'Cryomancer Tower', label_ru: 'Башня криомантов', category: 'barracks', tier: 3, unit_id: 'e421', upgrades: [] },
      { id: 'warder_sanctum',      label: 'Warder Sanctum', label_ru: 'Санктум хранителей',      category: 'barracks', tier: 2, unit_id: 'e43',  upgrades: ['bulwark_sanctum', 'aegis_bastion'], cost: { gold: 100 } },
      { id: 'bulwark_sanctum',     label: 'Bulwark Sanctum', label_ru: 'Санктум оплота',     category: 'barracks', tier: 3, unit_id: 'e431', upgrades: [], cost: { gold: 200 } },
      { id: 'aegis_bastion',       label: 'Aegis Bastion', label_ru: 'Бастион Эгиды',       category: 'barracks', tier: 3, unit_id: 'e432', upgrades: [], cost: { gold: 200 } },
    ],
    special: [],
    merc_up: [
      { id: 'mercenary_hall', label: 'Mercenary Hall', label_ru: 'Зал наёмников', category: 'merc_up', unit_id: null, tier: 1, upgrades: [],
        cost: { gold: 120, Crystals_Life: 40 } },
    ],
    barracks_up: [
      { id: 'barracks_2', label: 'Barracks II', label_ru: 'Казармы II', category: 'barracks_up', unit_id: null, tier: 1, upgrades: [],
        cost: { gold: 150, Crystals_Life: 50 } },
    ],
    throne_up: [],
  },

  choir_of_the_cursed: {
    throne: [
      { id: 'dark_throne', label: 'Dark Throne', label_ru: 'Тёмный трон', category: 'throne', unit_id: null },
      { id: 'warlord_keep_1',     label: 'Warlord Keep', label_ru: 'Твердыня военачальников',      category: 'throne', unit_id: 'h_d_1',    tier: 1, upgrades: ['warlord_keep_2_a', 'warlord_keep_2_b'] },
      { id: 'warlord_keep_2_a',   label: 'Warlord Keep II A', label_ru: 'Твердыня военачальников II A', category: 'throne', unit_id: 'h_d_1_a2', tier: 2, upgrades: ['warlord_keep_3_a'] },
      { id: 'warlord_keep_2_b',   label: 'Warlord Keep II B', label_ru: 'Твердыня военачальников II B', category: 'throne', unit_id: 'h_d_1_b2', tier: 2, upgrades: ['warlord_keep_3_b'] },
      { id: 'warlord_keep_3_a',   label: 'Warlord Keep III A', label_ru: 'Твердыня военачальников III A', category: 'throne', unit_id: 'h_d_1_a3', tier: 3, upgrades: ['warlord_keep_4_a', 'warlord_keep_4_a_alt'] },
      { id: 'warlord_keep_3_b',   label: 'Warlord Keep III B', label_ru: 'Твердыня военачальников III B', category: 'throne', unit_id: 'h_d_1_b3', tier: 3, upgrades: ['warlord_keep_4_b', 'warlord_keep_4_b_alt'] },
      { id: 'warlord_keep_4_a',   label: 'Warlord Keep IV A', label_ru: 'Твердыня военачальников IV A', category: 'throne', unit_id: 'h_d_1_a41', tier: 4, upgrades: [] },
      { id: 'warlord_keep_4_a_alt', label: 'Warlord Keep IV A Alt', label_ru: 'Твердыня военачальников IV A Alt', category: 'throne', unit_id: 'h_d_1_a42', tier: 4, upgrades: [] },
      { id: 'warlord_keep_4_b',   label: 'Warlord Keep IV B', label_ru: 'Твердыня военачальников IV B', category: 'throne', unit_id: 'h_d_1_b41', tier: 4, upgrades: [] },
      { id: 'warlord_keep_4_b_alt', label: 'Warlord Keep IV B Alt', label_ru: 'Твердыня военачальников IV B Alt', category: 'throne', unit_id: 'h_d_1_b42', tier: 4, upgrades: [] },
      { id: 'hexblade_sanctum_1',     label: 'Hexblade Sanctum', label_ru: 'Санктум проклятого клинка',      category: 'throne', unit_id: 'h_d_2',    tier: 1, upgrades: ['hexblade_sanctum_2_a', 'hexblade_sanctum_2_b'] },
      { id: 'hexblade_sanctum_2_a',   label: 'Hexblade Sanctum II A', label_ru: 'Санктум проклятого клинка II A', category: 'throne', unit_id: 'h_d_2_a2', tier: 2, upgrades: ['hexblade_sanctum_3_a'] },
      { id: 'hexblade_sanctum_2_b',   label: 'Hexblade Sanctum II B', label_ru: 'Санктум проклятого клинка II B', category: 'throne', unit_id: 'h_d_2_b2', tier: 2, upgrades: ['hexblade_sanctum_3_b'] },
      { id: 'hexblade_sanctum_3_a',   label: 'Hexblade Sanctum III A', label_ru: 'Санктум проклятого клинка III A', category: 'throne', unit_id: 'h_d_2_a3', tier: 3, upgrades: ['hexblade_sanctum_4_a', 'hexblade_sanctum_4_a_alt'] },
      { id: 'hexblade_sanctum_3_b',   label: 'Hexblade Sanctum III B', label_ru: 'Санктум проклятого клинка III B', category: 'throne', unit_id: 'h_d_2_b3', tier: 3, upgrades: ['hexblade_sanctum_4_b', 'hexblade_sanctum_4_b_alt'] },
      { id: 'hexblade_sanctum_4_a',   label: 'Hexblade Sanctum IV A', label_ru: 'Санктум проклятого клинка IV A', category: 'throne', unit_id: 'h_d_2_a41', tier: 4, upgrades: [] },
      { id: 'hexblade_sanctum_4_a_alt', label: 'Hexblade Sanctum IV A Alt', label_ru: 'Санктум проклятого клинка IV A Alt', category: 'throne', unit_id: 'h_d_2_a42', tier: 4, upgrades: [] },
      { id: 'hexblade_sanctum_4_b',   label: 'Hexblade Sanctum IV B', label_ru: 'Санктум проклятого клинка IV B', category: 'throne', unit_id: 'h_d_2_b41', tier: 4, upgrades: [] },
      { id: 'hexblade_sanctum_4_b_alt', label: 'Hexblade Sanctum IV B Alt', label_ru: 'Санктум проклятого клинка IV B Alt', category: 'throne', unit_id: 'h_d_2_b42', tier: 4, upgrades: [] },
      { id: 'infernal_spire_1',     label: 'Infernal Spire', label_ru: 'Инфернальный шпиль',      category: 'throne', unit_id: 'h_d_3',    tier: 1, upgrades: ['infernal_spire_2_a', 'infernal_spire_2_b'] },
      { id: 'infernal_spire_2_a',   label: 'Infernal Spire II A', label_ru: 'Инфернальный шпиль II A', category: 'throne', unit_id: 'h_d_3_a2', tier: 2, upgrades: ['infernal_spire_3_a'] },
      { id: 'infernal_spire_2_b',   label: 'Infernal Spire II B', label_ru: 'Инфернальный шпиль II B', category: 'throne', unit_id: 'h_d_3_b2', tier: 2, upgrades: ['infernal_spire_3_b'] },
      { id: 'infernal_spire_3_a',   label: 'Infernal Spire III A', label_ru: 'Инфернальный шпиль III A', category: 'throne', unit_id: 'h_d_3_a3', tier: 3, upgrades: ['infernal_spire_4_a', 'infernal_spire_4_a_alt'] },
      { id: 'infernal_spire_3_b',   label: 'Infernal Spire III B', label_ru: 'Инфернальный шпиль III B', category: 'throne', unit_id: 'h_d_3_b3', tier: 3, upgrades: ['infernal_spire_4_b', 'infernal_spire_4_b_alt'] },
      { id: 'infernal_spire_4_a',   label: 'Infernal Spire IV A', label_ru: 'Инфернальный шпиль IV A', category: 'throne', unit_id: 'h_d_3_a41', tier: 4, upgrades: [] },
      { id: 'infernal_spire_4_a_alt', label: 'Infernal Spire IV A Alt', label_ru: 'Инфернальный шпиль IV A Alt', category: 'throne', unit_id: 'h_d_3_a42', tier: 4, upgrades: [] },
      { id: 'infernal_spire_4_b',   label: 'Infernal Spire IV B', label_ru: 'Инфернальный шпиль IV B', category: 'throne', unit_id: 'h_d_3_b41', tier: 4, upgrades: [] },
      { id: 'infernal_spire_4_b_alt', label: 'Infernal Spire IV B Alt', label_ru: 'Инфернальный шпиль IV B Alt', category: 'throne', unit_id: 'h_d_3_b42', tier: 4, upgrades: [] },
    ],
    barracks: [
      { id: 'imp_den',           label: 'Imp Den', label_ru: 'Логово бесов',           category: 'barracks', tier: 1, unit_id: 'd1',  upgrades: ['tormentor_pit', 'chorister_chamber'],   cost: { gold: 50 } },
      { id: 'tormentor_pit',     label: 'Tormentor Pit', label_ru: 'Яма мучителей',     category: 'barracks', tier: 2, unit_id: 'd11', upgrades: ['praetor_pit'],        cost: { gold: 100 } },
      { id: 'praetor_pit',       label: 'Praetor Pit', label_ru: 'Яма преторов',       category: 'barracks', tier: 3, unit_id: 'd111', upgrades: [],             cost: { gold: 200 } },
      { id: 'chorister_chamber', label: 'Chorister Chamber', label_ru: 'Палата хористов', category: 'barracks', tier: 2, unit_id: 'd12', upgrades: ['chanter_chamber'],        cost: { gold: 100 } },
      { id: 'chanter_chamber',   label: 'Chanter Chamber', label_ru: 'Палата певчих',   category: 'barracks', tier: 3, unit_id: 'd121', upgrades: ['archchanter_chamber'], cost: { gold: 200 } },
      { id: 'archchanter_chamber', label: 'Archchanter Chamber', label_ru: 'Палата архипевчих', category: 'barracks', tier: 4, unit_id: 'd1211', upgrades: [] },
      { id: 'ash_novitiate',   label: 'Ash Novitiate', label_ru: 'Пепельный новициат',   category: 'barracks', tier: 1, unit_id: 'd2',  upgrades: ['ember_vigil'], cost: { gold: 50 } },
      { id: 'ember_vigil',    label: 'Ember Vigil', label_ru: 'Бдение углей',    category: 'barracks', tier: 2, unit_id: 'd21', upgrades: ['pyre_watch'], cost: { gold: 100 } },
      { id: 'pyre_watch', label: 'Pyre Watch', label_ru: 'Дозор костра', category: 'barracks', tier: 3, unit_id: 'd211', upgrades: [], cost: { gold: 200 } },
      { id: 'gargoyle_roost',    label: 'Gargoyle Roost', label_ru: 'Насест горгулий',    category: 'barracks', tier: 1, unit_id: 'd3',  upgrades: ['stone_gargoyle_den', 'quartz_gargoyle_den'],   cost: { gold: 50 } },
      { id: 'stone_gargoyle_den', label: 'Stone Gargoyle Den', label_ru: 'Логово каменных горгулий', category: 'barracks', tier: 2, unit_id: 'd31', upgrades: ['onyx_gargoyle_den'],       cost: { gold: 100 } },
      { id: 'onyx_gargoyle_den',  label: 'Onyx Gargoyle Den', label_ru: 'Логово ониксовых горгулий',  category: 'barracks', tier: 3, unit_id: 'd311', upgrades: [],            cost: { gold: 200 } },
      { id: 'quartz_gargoyle_den', label: 'Quartz Gargoyle Den', label_ru: 'Логово кварцевых горгулий', category: 'barracks', tier: 2, unit_id: 'd32', upgrades: ['azurite_gargoyle_den'],    cost: { gold: 100 } },
      { id: 'azurite_gargoyle_den', label: 'Azurite Gargoyle Den', label_ru: 'Логово азуритовых горгулий', category: 'barracks', tier: 3, unit_id: 'd321', upgrades: [],       cost: { gold: 200 } },
      { id: 'heretic_pit',       label: 'Heretic Pit', label_ru: 'Яма еретиков',       category: 'barracks', tier: 1, unit_id: 'd4',  upgrades: ['possessed_pit'],          cost: { gold: 50 } },
      { id: 'possessed_pit',     label: 'Possessed Pit', label_ru: 'Яма одержимых',     category: 'barracks', tier: 2, unit_id: 'd41', upgrades: ['vessel_altar', 'pain_projector_den'], cost: { gold: 100 } },
      { id: 'vessel_altar',      label: 'Vessel Altar', label_ru: 'Алтарь сосудов',      category: 'barracks', tier: 3, unit_id: 'd411', upgrades: [],             cost: { gold: 200 } },
      { id: 'pain_projector_den', label: 'Pain Projector Den', label_ru: 'Логово проводников боли', category: 'barracks', tier: 3, unit_id: 'd412', upgrades: [],           cost: { gold: 200 } },
      { id: 'peer_court',        label: 'Peer Court', label_ru: 'Двор пэров',        category: 'barracks', tier: 1, unit_id: 'd6',  upgrades: ['nether_baron_hall'],          cost: { gold: 50 } },
      { id: 'nether_baron_hall', label: 'Nether Baron Hall', label_ru: 'Зал баронов Преисподней', category: 'barracks', tier: 2, unit_id: 'd61', upgrades: ['nether_lord_hall'],               cost: { gold: 100 } },
      { id: 'nether_lord_hall', label: 'Nether Lord Hall', label_ru: 'Зал владык Преисподней', category: 'barracks', tier: 3, unit_id: 'd611', upgrades: ['nether_sovereign_hall'] },
      { id: 'nether_sovereign_hall', label: 'Nether Sovereign Hall', label_ru: 'Зал государей Преисподней', category: 'barracks', tier: 4, unit_id: 'd6111', upgrades: [] },
      { id: 'flame_spawn_pit',   label: 'Flame Spawn Pit', label_ru: 'Яма порождений пламени',   category: 'barracks', tier: 1, unit_id: 'd7',  upgrades: ['greater_flame_spawn_pit'],          cost: { gold: 50 } },
      { id: 'greater_flame_spawn_pit', label: 'Greater Flame Spawn Pit', label_ru: 'Большая яма порождений пламени', category: 'barracks', tier: 2, unit_id: 'd71', upgrades: ['inferno_spawn_pit'], cost: { gold: 100 } },
      { id: 'inferno_spawn_pit', label: 'Inferno Spawn Pit', label_ru: 'Яма порождений инферно', category: 'barracks', tier: 3, unit_id: 'd711', upgrades: [] },
      { id: 'cultist_shrine',    label: 'Cultist Shrine', label_ru: 'Святилище культистов',    category: 'barracks', tier: 1, unit_id: 'd5',  upgrades: ['choir_servant_shrine', 'ash_cantor_chancel'], cost: { gold: 50 } },
      { id: 'choir_servant_shrine', label: 'Choir Servant Shrine', label_ru: 'Святилище служек Хора', category: 'barracks', tier: 2, unit_id: 'd51', upgrades: ['choir_ascendant_shrine'],       cost: { gold: 100 } },
      { id: 'choir_ascendant_shrine', label: 'Choir Ascendant Shrine', label_ru: 'Святилище вознесённых Хора', category: 'barracks', tier: 3, unit_id: 'd511', upgrades: ['choir_exalted_shrine'] },
      { id: 'choir_exalted_shrine', label: 'Choir Exalted Shrine', label_ru: 'Святилище превознесённых Хора', category: 'barracks', tier: 4, unit_id: 'd5111', upgrades: [] },
      // The mender branch off the Cultist. A chancel is where the choir stands
      // to sing, which is what this half of the line does instead of burning.
      { id: 'ash_cantor_chancel',    label: 'Ash Cantor Chancel', label_ru: 'Клирос пепельного кантора',    category: 'barracks', tier: 2, unit_id: 'd52',  upgrades: ['ash_precentor_chancel'], cost: { gold: 100 } },
      { id: 'ash_precentor_chancel', label: 'Ash Precentor Chancel', label_ru: 'Клирос пепельного регента', category: 'barracks', tier: 3, unit_id: 'd521', upgrades: [] },
    ],
    special: [],
    merc_up: [
      { id: 'mercenary_hall', label: 'Mercenary Hall', label_ru: 'Зал наёмников', category: 'merc_up', unit_id: null, tier: 1, upgrades: [],
        cost: { gold: 120, Crystals_Fire: 40 } },
    ],
    barracks_up: [
      { id: 'barracks_2', label: 'Barracks II', label_ru: 'Казармы II', category: 'barracks_up', unit_id: null, tier: 1, upgrades: [],
        cost: { gold: 150, Crystals_Fire: 50 } },
    ],
    throne_up: [],
  },

  grail_of_sorrow: {
    throne: [
      { id: 'sorrow_throne', label: 'Throne of Sorrow', label_ru: 'Трон Скорби', category: 'throne', unit_id: null },
      { id: 'prophet_sepulchre_1',     label: 'Prophet Sepulchre', label_ru: 'Гробница пророков',       category: 'throne', unit_id: 'h_g_1',    tier: 1, upgrades: ['prophet_sepulchre_2_a', 'prophet_sepulchre_2_b'] },
      { id: 'prophet_sepulchre_2_a',   label: 'Prophet Sepulchre II A', label_ru: 'Гробница пророков II A',  category: 'throne', unit_id: 'h_g_1_a2', tier: 2, upgrades: ['prophet_sepulchre_3_a'] },
      { id: 'prophet_sepulchre_2_b',   label: 'Prophet Sepulchre II B', label_ru: 'Гробница пророков II B',  category: 'throne', unit_id: 'h_g_1_b2', tier: 2, upgrades: ['prophet_sepulchre_3_b'] },
      { id: 'prophet_sepulchre_3_a',   label: 'Prophet Sepulchre III A', label_ru: 'Гробница пророков III A', category: 'throne', unit_id: 'h_g_1_a3', tier: 3, upgrades: ['prophet_sepulchre_4_a', 'prophet_sepulchre_4_a_alt'] },
      { id: 'prophet_sepulchre_3_b',   label: 'Prophet Sepulchre III B', label_ru: 'Гробница пророков III B', category: 'throne', unit_id: 'h_g_1_b3', tier: 3, upgrades: ['prophet_sepulchre_4_b', 'prophet_sepulchre_4_b_alt'] },
      { id: 'prophet_sepulchre_4_a',   label: 'Prophet Sepulchre IV A', label_ru: 'Гробница пророков IV A',  category: 'throne', unit_id: 'h_g_1_a41', tier: 4, upgrades: [] },
      { id: 'prophet_sepulchre_4_a_alt', label: 'Prophet Sepulchre IV A Alt', label_ru: 'Гробница пророков IV A Alt', category: 'throne', unit_id: 'h_g_1_a42', tier: 4, upgrades: [] },
      { id: 'prophet_sepulchre_4_b',   label: 'Prophet Sepulchre IV B', label_ru: 'Гробница пророков IV B',  category: 'throne', unit_id: 'h_g_1_b41', tier: 4, upgrades: [] },
      { id: 'prophet_sepulchre_4_b_alt', label: 'Prophet Sepulchre IV B Alt', label_ru: 'Гробница пророков IV B Alt', category: 'throne', unit_id: 'h_g_1_b42', tier: 4, upgrades: [] },
      { id: 'warden_crypt_1',     label: 'Warden Crypt', label_ru: 'Склеп стражей',       category: 'throne', unit_id: 'h_g_2',    tier: 1, upgrades: ['warden_crypt_2_a', 'warden_crypt_2_b'] },
      { id: 'warden_crypt_2_a',   label: 'Warden Crypt II A', label_ru: 'Склеп стражей II A',  category: 'throne', unit_id: 'h_g_2_a2', tier: 2, upgrades: ['warden_crypt_3_a'] },
      { id: 'warden_crypt_2_b',   label: 'Warden Crypt II B', label_ru: 'Склеп стражей II B',  category: 'throne', unit_id: 'h_g_2_b2', tier: 2, upgrades: ['warden_crypt_3_b'] },
      { id: 'warden_crypt_3_a',   label: 'Warden Crypt III A', label_ru: 'Склеп стражей III A', category: 'throne', unit_id: 'h_g_2_a3', tier: 3, upgrades: ['warden_crypt_4_a', 'warden_crypt_4_a_alt'] },
      { id: 'warden_crypt_3_b',   label: 'Warden Crypt III B', label_ru: 'Склеп стражей III B', category: 'throne', unit_id: 'h_g_2_b3', tier: 3, upgrades: ['warden_crypt_4_b', 'warden_crypt_4_b_alt'] },
      { id: 'warden_crypt_4_a',   label: 'Warden Crypt IV A', label_ru: 'Склеп стражей IV A',  category: 'throne', unit_id: 'h_g_2_a41', tier: 4, upgrades: [] },
      { id: 'warden_crypt_4_a_alt', label: 'Warden Crypt IV A Alt', label_ru: 'Склеп стражей IV A Alt', category: 'throne', unit_id: 'h_g_2_a42', tier: 4, upgrades: [] },
      { id: 'warden_crypt_4_b',   label: 'Warden Crypt IV B', label_ru: 'Склеп стражей IV B',  category: 'throne', unit_id: 'h_g_2_b41', tier: 4, upgrades: [] },
      { id: 'warden_crypt_4_b_alt', label: 'Warden Crypt IV B Alt', label_ru: 'Склеп стражей IV B Alt', category: 'throne', unit_id: 'h_g_2_b42', tier: 4, upgrades: [] },
      { id: 'voice_chapel_1',     label: 'Voice Chapel', label_ru: 'Часовня Голоса',       category: 'throne', unit_id: 'h_g_3',    tier: 1, upgrades: ['voice_chapel_2_a', 'voice_chapel_2_b'] },
      { id: 'voice_chapel_2_a',   label: 'Voice Chapel II A', label_ru: 'Часовня Голоса II A',  category: 'throne', unit_id: 'h_g_3_a2', tier: 2, upgrades: ['voice_chapel_3_a'] },
      { id: 'voice_chapel_2_b',   label: 'Voice Chapel II B', label_ru: 'Часовня Голоса II B',  category: 'throne', unit_id: 'h_g_3_b2', tier: 2, upgrades: ['voice_chapel_3_b'] },
      { id: 'voice_chapel_3_a',   label: 'Voice Chapel III A', label_ru: 'Часовня Голоса III A', category: 'throne', unit_id: 'h_g_3_a3', tier: 3, upgrades: ['voice_chapel_4_a', 'voice_chapel_4_a_alt'] },
      { id: 'voice_chapel_3_b',   label: 'Voice Chapel III B', label_ru: 'Часовня Голоса III B', category: 'throne', unit_id: 'h_g_3_b3', tier: 3, upgrades: ['voice_chapel_4_b', 'voice_chapel_4_b_alt'] },
      { id: 'voice_chapel_4_a',   label: 'Voice Chapel IV A', label_ru: 'Часовня Голоса IV A',  category: 'throne', unit_id: 'h_g_3_a41', tier: 4, upgrades: [] },
      { id: 'voice_chapel_4_a_alt', label: 'Voice Chapel IV A Alt', label_ru: 'Часовня Голоса IV A Alt', category: 'throne', unit_id: 'h_g_3_a42', tier: 4, upgrades: [] },
      { id: 'voice_chapel_4_b',   label: 'Voice Chapel IV B', label_ru: 'Часовня Голоса IV B',  category: 'throne', unit_id: 'h_g_3_b41', tier: 4, upgrades: [] },
      { id: 'voice_chapel_4_b_alt', label: 'Voice Chapel IV B Alt', label_ru: 'Часовня Голоса IV B Alt', category: 'throne', unit_id: 'h_g_3_b42', tier: 4, upgrades: [] },
    ],
    barracks: [
      { id: 'zombie_pit',            label: 'Zombie Pit', label_ru: 'Яма зомби',            category: 'barracks', tier: 1, unit_id: 'gs1',  upgrades: ['ghoul_pit', 'cannibal_pit', 'cesswalker_mire'],   cost: { gold: 50 } },
      { id: 'ghoul_pit',             label: 'Ghoul Pit', label_ru: 'Яма упырей',             category: 'barracks', tier: 2, unit_id: 'gs11', upgrades: ['plague_knight_barrow'],                   cost: { gold: 100 } },
      { id: 'plague_knight_barrow',  label: 'Plague Knight Barrow', label_ru: 'Курган чумных рыцарей',  category: 'barracks', tier: 3, unit_id: 'gs111', upgrades: [],                         cost: { gold: 200 } },
      { id: 'cannibal_pit',          label: 'Cannibal Pit', label_ru: 'Яма людоедов',          category: 'barracks', tier: 2, unit_id: 'gs12', upgrades: ['abomination_vat'],                   cost: { gold: 100 } },
      { id: 'abomination_vat',       label: 'Abomination Vat', label_ru: 'Чан мерзости',       category: 'barracks', tier: 3, unit_id: 'gs121', upgrades: [],                         cost: { gold: 200 } },
      { id: 'cesswalker_mire',       label: 'Cesswalker Mire', label_ru: 'Топь бродящих в скверне',       category: 'barracks', tier: 2, unit_id: 'gs13', upgrades: ['blightwalker_mire'],                   cost: { gold: 100 } },
      { id: 'blightwalker_mire',     label: 'Blightwalker Mire', label_ru: 'Топь бродящих в порче',     category: 'barracks', tier: 3, unit_id: 'gs131', upgrades: [],                         cost: { gold: 200 } },
      { id: 'communicant_chapel',    label: 'Communicant Chapel', label_ru: 'Часовня причастников',    category: 'barracks', tier: 1, unit_id: 'gs2',  upgrades: ['crimson_communicant_chapel'],                   cost: { gold: 50 } },
      { id: 'crimson_communicant_chapel', label: 'Crimson Communicant Chapel', label_ru: 'Часовня багровых причастников', category: 'barracks', tier: 2, unit_id: 'gs21', upgrades: ['chosen_chapel'], cost: { gold: 100 } },
      { id: 'chosen_chapel', label: 'Chosen Chapel', label_ru: 'Часовня избранных', category: 'barracks', tier: 3, unit_id: 'gs211', upgrades: [] },
      { id: 'adept_crypt',           label: 'Adept Crypt', label_ru: 'Склеп адептов',           category: 'barracks', tier: 1, unit_id: 'gs3',  upgrades: ['blood_adept_chamber', 'necromancer_crypt', 'plague_scholar_lab'],    cost: { gold: 50 } },
      { id: 'blood_adept_chamber',   label: 'Blood Adept Chamber', label_ru: 'Палата адептов крови',   category: 'barracks', tier: 2, unit_id: 'gs31', upgrades: ['crimson_mage_tower', 'blood_knight_crypt'],          cost: { gold: 100 } },
      { id: 'crimson_mage_tower',    label: 'Crimson Mage Tower', label_ru: 'Башня багровых магов',    category: 'barracks', tier: 3, unit_id: 'gs311', upgrades: [],                         cost: { gold: 200 } },
      { id: 'blood_knight_crypt',    label: 'Blood Knight Crypt', label_ru: 'Склеп рыцарей крови',    category: 'barracks', tier: 3, unit_id: 'gs312', upgrades: [],                         cost: { gold: 200 } },
      { id: 'necromancer_crypt',     label: 'Necromancer Crypt', label_ru: 'Склеп некромантов',     category: 'barracks', tier: 2, unit_id: 'gs32', upgrades: ['death_lord_crypt'],                          cost: { gold: 100 } },
      { id: 'death_lord_crypt', label: 'Death Lord Crypt', label_ru: 'Склеп владык смерти', category: 'barracks', tier: 3, unit_id: 'gs321', upgrades: [] },
      { id: 'plague_scholar_lab',    label: 'Plague Scholar Lab', label_ru: 'Лаборатория чумных учёных',    category: 'barracks', tier: 2, unit_id: 'gs33', upgrades: ['plague_lord_lab'],                   cost: { gold: 100 } },
      { id: 'plague_lord_lab',       label: 'Plague Lord Lab', label_ru: 'Лаборатория владык чумы',       category: 'barracks', tier: 3, unit_id: 'gs331', upgrades: ['plague_archon_lab'] },
      { id: 'plague_archon_lab',     label: 'Plague Archon Lab', label_ru: 'Лаборатория архонтов чумы',   category: 'barracks', tier: 4, unit_id: 'gs3311', upgrades: [], cost: { gold: 400 } },
      { id: 'colossus_barrow',       label: 'Colossus Barrow', label_ru: 'Курган колоссов',       category: 'barracks', tier: 1, unit_id: 'gs4',  upgrades: ['seraph_shrine', 'chalice_vault'],            cost: { gold: 50 } },
      { id: 'seraph_shrine',         label: 'Seraph Shrine', label_ru: 'Святилище серафимов',         category: 'barracks', tier: 2, unit_id: 'gs41', upgrades: ['grail_angel_shrine'],                          cost: { gold: 100 } },
      { id: 'grail_angel_shrine', label: 'Grail Angel Shrine', label_ru: 'Святилище ангелов Грааля', category: 'barracks', tier: 3, unit_id: 'gs411', upgrades: [] },
      { id: 'chalice_vault',         label: 'Chalice Vault', label_ru: 'Хранилище чаши',         category: 'barracks', tier: 2, unit_id: 'gs42', upgrades: ['sorrow_vessel_vault'],                          cost: { gold: 100 } },
      { id: 'sorrow_vessel_vault', label: 'Sorrow Vessel Vault', label_ru: 'Хранилище сосудов скорби', category: 'barracks', tier: 3, unit_id: 'gs421', upgrades: [] },
      { id: 'grail_acolyte_chamber', label: 'Grail Acolyte Chamber', label_ru: 'Палата послушников Грааля', category: 'barracks', tier: 1, unit_id: 'gs5',  upgrades: ['grail_tender_chamber', 'grieving_servant_chamber'],            cost: { gold: 50 } },
      { id: 'grail_tender_chamber',  label: 'Grail Tender Chamber', label_ru: 'Палата смотрителей Грааля',  category: 'barracks', tier: 2, unit_id: 'gs51', upgrades: ['grail_keeper_chamber'],                          cost: { gold: 100 } },
      { id: 'grail_keeper_chamber', label: 'Grail Keeper Chamber', label_ru: 'Палата хранителей Грааля', category: 'barracks', tier: 3, unit_id: 'gs511', upgrades: [] },
      { id: 'grieving_servant_chamber', label: 'Grieving Servant Chamber', label_ru: 'Палата скорбящих слуг', category: 'barracks', tier: 2, unit_id: 'gs52', upgrades: ['grieving_custodian_chamber'], cost: { gold: 100 } },
      { id: 'grieving_custodian_chamber', label: 'Grieving Custodian Chamber', label_ru: 'Палата скорбящих блюстителей', category: 'barracks', tier: 3, unit_id: 'gs521', upgrades: ['grieving_warden_chamber'] },
      { id: 'grieving_warden_chamber', label: 'Grieving Warden Chamber', label_ru: 'Палата скорбящих стражей', category: 'barracks', tier: 4, unit_id: 'gs5211', upgrades: [], cost: { gold: 400 } },
      { id: 'ghost_manor',           label: 'Ghost Manor', label_ru: 'Усадьба призраков',           category: 'barracks', tier: 1, unit_id: 'gs6',  upgrades: ['specter_hall', 'apparition_mist'],            cost: { gold: 50 } },
      { id: 'specter_hall',          label: 'Specter Hall', label_ru: 'Зал спектров',          category: 'barracks', tier: 2, unit_id: 'gs61', upgrades: ['wraith_hall'],                          cost: { gold: 100 } },
      { id: 'wraith_hall', label: 'Wraith Hall', label_ru: 'Зал духов', category: 'barracks', tier: 3, unit_id: 'gs611', upgrades: [] },
      { id: 'apparition_mist',       label: 'Apparition Mist', label_ru: 'Туман привидений',       category: 'barracks', tier: 2, unit_id: 'gs62', upgrades: ['phantom_mist'],                          cost: { gold: 100 } },
      { id: 'phantom_mist', label: 'Phantom Mist', label_ru: 'Туман фантомов', category: 'barracks', tier: 3, unit_id: 'gs621', upgrades: [] },
      // Sorrow Maiden line — Mothers Voice starts with this one raised (see
      // HERO_STARTING_UNITS in routes/index.js). A single chain, no branch.
      { id: 'pale_maiden_barrow',    label: 'Pale Maiden Barrow', label_ru: 'Курган бледных дев',    category: 'barracks', tier: 1, unit_id: 'gs7',   upgrades: ['pale_dame_barrow', 'pale_votaress_chantry', 'pale_mourner_shrine'], cost: { gold: 50 } },
      { id: 'pale_dame_barrow',      label: 'Pale Dame Barrow', label_ru: 'Курган бледных госпож',      category: 'barracks', tier: 2, unit_id: 'gs71',  upgrades: ['pale_matriarch_barrow'], cost: { gold: 100 } },
      { id: 'pale_matriarch_barrow', label: 'Pale Matriarch Barrow', label_ru: 'Курган бледных праматерей', category: 'barracks', tier: 3, unit_id: 'gs711', upgrades: [] },
      // The mender branch. A chantry is where masses are sung for the dead,
      // which is what this half of the line is for.
      { id: 'pale_votaress_chantry', label: 'Pale Votaress Chantry', label_ru: 'Часовня бледных послушниц', category: 'barracks', tier: 2, unit_id: 'gs72',  upgrades: ['pale_abbess_chantry'],   cost: { gold: 100 } },
      { id: 'pale_abbess_chantry',   label: 'Pale Abbess Chantry', label_ru: 'Часовня бледных аббатис',   category: 'barracks', tier: 3, unit_id: 'gs721', upgrades: [] },
      { id: 'pale_mourner_shrine',   label: 'Pale Mourner Shrine', label_ru: 'Святилище бледных плакальщиц',   category: 'barracks', tier: 2, unit_id: 'gs73',  upgrades: ['pale_lamenter_shrine'], cost: { gold: 100 } },
      { id: 'pale_lamenter_shrine',  label: 'Pale Lamenter Shrine', label_ru: 'Святилище бледных скорбниц',  category: 'barracks', tier: 3, unit_id: 'gs731', upgrades: [], cost: { gold: 200 } },
      // Mother's Tear line. A font is the basin the tears are collected in.
      { id: 'mothers_tear_font',     label: "Mother's Tear Font", label_ru: 'Купель Слезы Матери',    category: 'barracks', tier: 1, unit_id: 'gs8',   upgrades: ['mothers_sorrow_font', 'mothers_vigil_reliquary', 'mothers_chalice_altar'], cost: { gold: 50 } },
      // The greedy branch — vitality, it just drinks deeper.
      { id: 'mothers_sorrow_font',   label: "Mother's Sorrow Font", label_ru: 'Купель Скорби Матери',  category: 'barracks', tier: 2, unit_id: 'gs81',  upgrades: ['mothers_grief_font'], cost: { gold: 100 } },
      { id: 'mothers_grief_font',    label: "Mother's Grief Font", label_ru: 'Купель Горя Матери',   category: 'barracks', tier: 3, unit_id: 'gs811', upgrades: [], cost: { gold: 200 } },
      // The protective branch — a reliquary shelters what it holds, which is
      // what the nature resist aura does for the horde around it.
      { id: 'mothers_vigil_reliquary',  label: "Mother's Vigil Reliquary", label_ru: 'Реликварий Бдения Матери',  category: 'barracks', tier: 2, unit_id: 'gs82',  upgrades: ['mothers_shroud_reliquary'], cost: { gold: 100 } },
      { id: 'mothers_shroud_reliquary', label: "Mother's Shroud Reliquary", label_ru: 'Реликварий Покрова Матери', category: 'barracks', tier: 3, unit_id: 'gs821', upgrades: [], cost: { gold: 200 } },
      // The offering branch — an altar is where something is given up, which is
      // what a Blood Bond guardian does with itself.
      { id: 'mothers_chalice_altar', label: "Mother's Chalice Altar", label_ru: 'Алтарь Чаши Матери',  category: 'barracks', tier: 2, unit_id: 'gs83',  upgrades: ['mothers_vessel_altar'], cost: { gold: 100 } },
      { id: 'mothers_vessel_altar',  label: "Mother's Vessel Altar", label_ru: 'Алтарь Сосуда Матери', category: 'barracks', tier: 3, unit_id: 'gs831', upgrades: [], cost: { gold: 200 } },
    ],
    special: [],
    merc_up: [
      { id: 'mercenary_hall', label: 'Mercenary Hall', label_ru: 'Зал наёмников', category: 'merc_up', unit_id: null, tier: 1, upgrades: [],
        cost: { gold: 120, Crystals_Death: 40 } },
    ],
    barracks_up: [
      { id: 'barracks_2', label: 'Barracks II', label_ru: 'Казармы II', category: 'barracks_up', unit_id: null, tier: 1, upgrades: [],
        cost: { gold: 150, Crystals_Death: 50 } },
    ],
    throne_up: [],
  },
};

const UNIT_UPGRADE_PATHS = {
  empire: {
    e1:   [{ unit_id: 'e11',  building_id: 'infantry_barracks', label: 'Infantry Barracks', label_ru: 'Пехотные казармы' },
           { unit_id: 'e12',  building_id: 'cavalry_stables',   label: 'Cavalry Stables', label_ru: 'Кавалерийские конюшни' }],
    e11:  [{ unit_id: 'e111', building_id: 'crossbow_range',    label: 'Crossbow Range', label_ru: 'Стрельбище арбалетчиков' },
           { unit_id: 'e112', building_id: 'heavy_barracks',    label: 'Heavy Barracks', label_ru: 'Тяжёлые казармы' },
           { unit_id: 'e113', building_id: 'blade_guard_hall',  label: 'Blade Guard Hall', label_ru: 'Зал Стражей Клинка' }],
    e3:   [{ unit_id: 'e31',  building_id: 'automaton_lab',     label: 'Automaton Lab', label_ru: 'Лаборатория автоматонов' },
           { unit_id: 'e32',  building_id: 'siege_workshop',    label: 'Siege Workshop', label_ru: 'Осадная мастерская' }],
    // e5:   [{ unit_id: 'e51',  building_id: 'golden_pride_forge_2', label: 'Golden Pride Forge II' }],
    e6:   [{ unit_id: 'e61',  building_id: 'mechanic_den',      label: 'Mechanic Den', label_ru: 'Мастерская механиков' },
           { unit_id: 'e62',  building_id: 'rifleman_range',    label: 'Rifleman Range', label_ru: 'Стрельбище стрелков' }],
    e61:  [{ unit_id: 'e611', building_id: 'mechanic_den_2',    label: 'Mechanic Den II', label_ru: 'Мастерская механиков II' }],
    e62:  [{ unit_id: 'e621', building_id: 'devastator_post',   label: 'Devastator Post', label_ru: 'Пост опустошителей' },
           { unit_id: 'e622', building_id: 'flamethrower_post', label: 'Flamethrower Post', label_ru: 'Пост огнемётчиков' }],
    e2:   [{ unit_id: 'e21',  building_id: 'sun_temple',        label: 'Sun Temple', label_ru: 'Храм Солнца' },
           { unit_id: 'e22',  building_id: 'priest_shrine',     label: 'Priest Shrine', label_ru: 'Святилище жрецов' }],
    e21:  [{ unit_id: 'e211', building_id: 'mithrails_champion_keep', label: 'Mithrails Champion Keep', label_ru: 'Твердыня поборников Митраила' }],
    e211: [{ unit_id: 'e2111', building_id: 'mithrails_exemplar_keep', label: 'Mithrails Exemplar Keep', label_ru: 'Твердыня экземпларов Митраила' }],
    e22:  [{ unit_id: 'e221', building_id: 'ardent_shrine',     label: 'Ardent Shrine', label_ru: 'Ревностное святилище' }],
    e221: [{ unit_id: 'e2211', building_id: 'high_priest_shrine', label: 'High Priest Shrine', label_ru: 'Святилище верховных жрецов' }],
    e7:   [{ unit_id: 'e71',  building_id: 'mithrails_light_temple', label: 'Mithrails Light Temple', label_ru: 'Храм Света Митраила' }],
    e71:  [{ unit_id: 'e711', building_id: 'mithrails_will_temple',  label: 'Mithrails Will Temple', label_ru: 'Храм Воли Митраила' }],
    e4:   [{ unit_id: 'e41',  building_id: 'red_mage_tower',    label: 'Red Mage Tower', label_ru: 'Башня красных магов' },
           { unit_id: 'e42',  building_id: 'blue_mage_tower',   label: 'Blue Mage Tower', label_ru: 'Башня синих магов' },
           { unit_id: 'e43',  building_id: 'warder_sanctum',     label: 'Warder Sanctum', label_ru: 'Санктум хранителей' }],
    e41:  [{ unit_id: 'e411', building_id: 'ash_sanctum',       label: 'Ash Sanctum', label_ru: 'Пепельный санктум' },
           { unit_id: 'e412', building_id: 'cinder_forge',      label: 'Cinder Forge', label_ru: 'Кузня углей' }],
    h_e_1:    [{ unit_id: 'h_e_11',   building_id: 'paladin_cathedral_2_a', label: 'Paladin Cathedral II A', label_ru: 'Собор паладинов II A' },
               { unit_id: 'h_e_12',   building_id: 'paladin_cathedral_2_b', label: 'Paladin Cathedral II B', label_ru: 'Собор паладинов II B' }],
    h_e_11:   [{ unit_id: 'h_e_111',  building_id: 'paladin_cathedral_3_a', label: 'Paladin Cathedral III A', label_ru: 'Собор паладинов III A' }],
    h_e_12:   [{ unit_id: 'h_e_121',  building_id: 'paladin_cathedral_3_b', label: 'Paladin Cathedral III B', label_ru: 'Собор паладинов III B' }],
    h_e_111:  [{ unit_id: 'h_e_1111', building_id: 'paladin_cathedral_4_a',     label: 'Paladin Cathedral IV A', label_ru: 'Собор паладинов IV A' },
               { unit_id: 'h_e_1112', building_id: 'paladin_cathedral_4_a_alt', label: 'Paladin Cathedral IV A Alt', label_ru: 'Собор паладинов IV A Alt' }],
    h_e_121:  [{ unit_id: 'h_e_1211', building_id: 'paladin_cathedral_4_b',     label: 'Paladin Cathedral IV B', label_ru: 'Собор паладинов IV B' },
               { unit_id: 'h_e_1212', building_id: 'paladin_cathedral_4_b_alt', label: 'Paladin Cathedral IV B Alt', label_ru: 'Собор паладинов IV B Alt' }],
    h_e_2:    [{ unit_id: 'h_e_2_a2', building_id: 'inquisitor_tower_2_a', label: 'Inquisitor Tower II A', label_ru: 'Башня инквизиторов II A' },
               { unit_id: 'h_e_2_b2', building_id: 'inquisitor_tower_2_b', label: 'Inquisitor Tower II B', label_ru: 'Башня инквизиторов II B' }],
    h_e_2_a2: [{ unit_id: 'h_e_2_a3', building_id: 'inquisitor_tower_3_a', label: 'Inquisitor Tower III A', label_ru: 'Башня инквизиторов III A' }],
    h_e_2_b2: [{ unit_id: 'h_e_2_b3', building_id: 'inquisitor_tower_3_b', label: 'Inquisitor Tower III B', label_ru: 'Башня инквизиторов III B' }],
    h_e_2_a3: [{ unit_id: 'h_e_2_a41', building_id: 'inquisitor_tower_4_a',     label: 'Inquisitor Tower IV A', label_ru: 'Башня инквизиторов IV A' },
               { unit_id: 'h_e_2_a42', building_id: 'inquisitor_tower_4_a_alt', label: 'Inquisitor Tower IV A Alt', label_ru: 'Башня инквизиторов IV A Alt' }],
    h_e_2_b3: [{ unit_id: 'h_e_2_b41', building_id: 'inquisitor_tower_4_b',     label: 'Inquisitor Tower IV B', label_ru: 'Башня инквизиторов IV B' },
               { unit_id: 'h_e_2_b42', building_id: 'inquisitor_tower_4_b_alt', label: 'Inquisitor Tower IV B Alt', label_ru: 'Башня инквизиторов IV B Alt' }],
    h_e_3:    [{ unit_id: 'h_e_3_a2', building_id: 'artificer_guild_2_a', label: 'Artificer Guild II A', label_ru: 'Гильдия артефакторов II A' },
               { unit_id: 'h_e_3_b2', building_id: 'artificer_guild_2_b', label: 'Artificer Guild II B', label_ru: 'Гильдия артефакторов II B' }],
    h_e_3_a2: [{ unit_id: 'h_e_3_a3', building_id: 'artificer_guild_3_a', label: 'Artificer Guild III A', label_ru: 'Гильдия артефакторов III A' }],
    h_e_3_b2: [{ unit_id: 'h_e_3_b3', building_id: 'artificer_guild_3_b', label: 'Artificer Guild III B', label_ru: 'Гильдия артефакторов III B' }],
    h_e_3_a3: [{ unit_id: 'h_e_3_a41', building_id: 'artificer_guild_4_a',     label: 'Artificer Guild IV A', label_ru: 'Гильдия артефакторов IV A' },
               { unit_id: 'h_e_3_a42', building_id: 'artificer_guild_4_a_alt', label: 'Artificer Guild IV A Alt', label_ru: 'Гильдия артефакторов IV A Alt' }],
    h_e_3_b3: [{ unit_id: 'h_e_3_b41', building_id: 'artificer_guild_4_b',     label: 'Artificer Guild IV B', label_ru: 'Гильдия артефакторов IV B' },
               { unit_id: 'h_e_3_b42', building_id: 'artificer_guild_4_b_alt', label: 'Artificer Guild IV B Alt', label_ru: 'Гильдия артефакторов IV B Alt' }],
    e12: [{ unit_id: 'e121', building_id: 'knights_stables', label: 'Knights Stables', label_ru: 'Рыцарские конюшни' }],
    e31: [{ unit_id: 'e311', building_id: 'golden_lion_lab', label: 'Golden Lion Lab', label_ru: 'Лаборатория золотых львов' }],
    e32: [{ unit_id: 'e321', building_id: 'siege_dreadnought_workshop', label: 'Siege Dreadnought Workshop', label_ru: 'Мастерская осадных дредноутов' }],
    e71: [{ unit_id: 'e711', building_id: 'mithrails_will_temple', label: 'Mithrails Will', label_ru: 'Воля Митраила' }],
    e42: [{ unit_id: 'e421', building_id: 'cryomancer_tower', label: 'Cryomancer Tower', label_ru: 'Башня криомантов' }],
    e43: [{ unit_id: 'e431', building_id: 'bulwark_sanctum',  label: 'Bulwark Sanctum', label_ru: 'Санктум оплота' },
          { unit_id: 'e432', building_id: 'aegis_bastion',    label: 'Aegis Bastion', label_ru: 'Бастион Эгиды' }],
  },

  choir_of_the_cursed: {
    d1:  [{ unit_id: 'd11', building_id: 'tormentor_pit',      label: 'Tormentor Pit', label_ru: 'Яма мучителей' },
          { unit_id: 'd12', building_id: 'chorister_chamber',  label: 'Chorister Chamber', label_ru: 'Палата хористов' }],
    d11: [{ unit_id: 'd111', building_id: 'praetor_pit',      label: 'Praetor Pit', label_ru: 'Яма преторов' }],
    d12: [{ unit_id: 'd121', building_id: 'chanter_chamber',  label: 'Chanter Chamber', label_ru: 'Палата певчих' }],
    d121: [{ unit_id: 'd1211', building_id: 'archchanter_chamber', label: 'Archchanter Chamber', label_ru: 'Палата архипевчих' }],
    d2:  [{ unit_id: 'd21', building_id: 'ember_vigil',    label: 'Ember Vigil', label_ru: 'Бдение углей' }],
    d21: [{ unit_id: 'd211', building_id: 'pyre_watch', label: 'Pyre Watch', label_ru: 'Дозор костра' }],
    d3:  [{ unit_id: 'd31', building_id: 'stone_gargoyle_den', label: 'Stone Gargoyle Den', label_ru: 'Логово каменных горгулий' },
          { unit_id: 'd32', building_id: 'quartz_gargoyle_den', label: 'Quartz Gargoyle Den', label_ru: 'Логово кварцевых горгулий' }],
    d31: [{ unit_id: 'd311', building_id: 'onyx_gargoyle_den', label: 'Onyx Gargoyle Den', label_ru: 'Логово ониксовых горгулий' }],
    d32: [{ unit_id: 'd321', building_id: 'azurite_gargoyle_den', label: 'Azurite Gargoyle Den', label_ru: 'Логово азуритовых горгулий' }],
    d4:  [{ unit_id: 'd41', building_id: 'possessed_pit',    label: 'Possessed Pit', label_ru: 'Яма одержимых' }],
    d41: [{ unit_id: 'd411', building_id: 'vessel_altar',     label: 'Vessel Altar', label_ru: 'Алтарь сосудов' },
          { unit_id: 'd412', building_id: 'pain_projector_den', label: 'Pain Projector Den', label_ru: 'Логово проводников боли' }],
    d6:  [{ unit_id: 'd61', building_id: 'nether_baron_hall', label: 'Nether Baron Hall', label_ru: 'Зал баронов Преисподней' }],
    d7:  [{ unit_id: 'd71', building_id: 'greater_flame_spawn_pit', label: 'Greater Flame Spawn Pit', label_ru: 'Большая яма порождений пламени' }],
    d5:  [{ unit_id: 'd51', building_id: 'choir_servant_shrine', label: 'Choir Servant Shrine', label_ru: 'Святилище служек Хора' },
          { unit_id: 'd52', building_id: 'ash_cantor_chancel',   label: 'Ash Cantor Chancel', label_ru: 'Клирос пепельного кантора' }],
    h_d_1:    [{ unit_id: 'h_d_1_a2', building_id: 'warlord_keep_2_a', label: 'Warlord Keep II A', label_ru: 'Твердыня военачальников II A' },
               { unit_id: 'h_d_1_b2', building_id: 'warlord_keep_2_b', label: 'Warlord Keep II B', label_ru: 'Твердыня военачальников II B' }],
    h_d_1_a2: [{ unit_id: 'h_d_1_a3', building_id: 'warlord_keep_3_a', label: 'Warlord Keep III A', label_ru: 'Твердыня военачальников III A' }],
    h_d_1_b2: [{ unit_id: 'h_d_1_b3', building_id: 'warlord_keep_3_b', label: 'Warlord Keep III B', label_ru: 'Твердыня военачальников III B' }],
    h_d_1_a3: [{ unit_id: 'h_d_1_a41', building_id: 'warlord_keep_4_a',     label: 'Warlord Keep IV A', label_ru: 'Твердыня военачальников IV A' },
               { unit_id: 'h_d_1_a42', building_id: 'warlord_keep_4_a_alt', label: 'Warlord Keep IV A Alt', label_ru: 'Твердыня военачальников IV A Alt' }],
    h_d_1_b3: [{ unit_id: 'h_d_1_b41', building_id: 'warlord_keep_4_b',     label: 'Warlord Keep IV B', label_ru: 'Твердыня военачальников IV B' },
               { unit_id: 'h_d_1_b42', building_id: 'warlord_keep_4_b_alt', label: 'Warlord Keep IV B Alt', label_ru: 'Твердыня военачальников IV B Alt' }],
    h_d_2:    [{ unit_id: 'h_d_2_a2', building_id: 'hexblade_sanctum_2_a', label: 'Hexblade Sanctum II A', label_ru: 'Санктум проклятого клинка II A' },
               { unit_id: 'h_d_2_b2', building_id: 'hexblade_sanctum_2_b', label: 'Hexblade Sanctum II B', label_ru: 'Санктум проклятого клинка II B' }],
    h_d_2_a2: [{ unit_id: 'h_d_2_a3', building_id: 'hexblade_sanctum_3_a', label: 'Hexblade Sanctum III A', label_ru: 'Санктум проклятого клинка III A' }],
    h_d_2_b2: [{ unit_id: 'h_d_2_b3', building_id: 'hexblade_sanctum_3_b', label: 'Hexblade Sanctum III B', label_ru: 'Санктум проклятого клинка III B' }],
    h_d_2_a3: [{ unit_id: 'h_d_2_a41', building_id: 'hexblade_sanctum_4_a',     label: 'Hexblade Sanctum IV A', label_ru: 'Санктум проклятого клинка IV A' },
               { unit_id: 'h_d_2_a42', building_id: 'hexblade_sanctum_4_a_alt', label: 'Hexblade Sanctum IV A Alt', label_ru: 'Санктум проклятого клинка IV A Alt' }],
    h_d_2_b3: [{ unit_id: 'h_d_2_b41', building_id: 'hexblade_sanctum_4_b',     label: 'Hexblade Sanctum IV B', label_ru: 'Санктум проклятого клинка IV B' },
               { unit_id: 'h_d_2_b42', building_id: 'hexblade_sanctum_4_b_alt', label: 'Hexblade Sanctum IV B Alt', label_ru: 'Санктум проклятого клинка IV B Alt' }],
    h_d_3:    [{ unit_id: 'h_d_3_a2', building_id: 'infernal_spire_2_a', label: 'Infernal Spire II A', label_ru: 'Инфернальный шпиль II A' },
               { unit_id: 'h_d_3_b2', building_id: 'infernal_spire_2_b', label: 'Infernal Spire II B', label_ru: 'Инфернальный шпиль II B' }],
    h_d_3_a2: [{ unit_id: 'h_d_3_a3', building_id: 'infernal_spire_3_a', label: 'Infernal Spire III A', label_ru: 'Инфернальный шпиль III A' }],
    h_d_3_b2: [{ unit_id: 'h_d_3_b3', building_id: 'infernal_spire_3_b', label: 'Infernal Spire III B', label_ru: 'Инфернальный шпиль III B' }],
    h_d_3_a3: [{ unit_id: 'h_d_3_a41', building_id: 'infernal_spire_4_a',     label: 'Infernal Spire IV A', label_ru: 'Инфернальный шпиль IV A' },
               { unit_id: 'h_d_3_a42', building_id: 'infernal_spire_4_a_alt', label: 'Infernal Spire IV A Alt', label_ru: 'Инфернальный шпиль IV A Alt' }],
    h_d_3_b3: [{ unit_id: 'h_d_3_b41', building_id: 'infernal_spire_4_b',     label: 'Infernal Spire IV B', label_ru: 'Инфернальный шпиль IV B' },
               { unit_id: 'h_d_3_b42', building_id: 'infernal_spire_4_b_alt', label: 'Infernal Spire IV B Alt', label_ru: 'Инфернальный шпиль IV B Alt' }],
    d61: [{ unit_id: 'd611', building_id: 'nether_lord_hall', label: 'Nether Lord Hall', label_ru: 'Зал владык Преисподней' }],
    d611: [{ unit_id: 'd6111', building_id: 'nether_sovereign_hall', label: 'Nether Sovereign Hall', label_ru: 'Зал государей Преисподней' }],
    d71: [{ unit_id: 'd711', building_id: 'inferno_spawn_pit', label: 'Inferno Spawn Pit', label_ru: 'Яма порождений инферно' }],
    d51: [{ unit_id: 'd511', building_id: 'choir_ascendant_shrine', label: 'Choir Ascendant Shrine', label_ru: 'Святилище вознесённых Хора' }],
    d511: [{ unit_id: 'd5111', building_id: 'choir_exalted_shrine', label: 'Choir Exalted Shrine', label_ru: 'Святилище превознесённых Хора' }],
    d52: [{ unit_id: 'd521', building_id: 'ash_precentor_chancel',  label: 'Ash Precentor Chancel', label_ru: 'Клирос пепельного регента' }],
  },

  grail_of_sorrow: {
    gs1:  [{ unit_id: 'gs11',  building_id: 'ghoul_pit',          label: 'Ghoul Pit', label_ru: 'Яма упырей' },
           { unit_id: 'gs12',  building_id: 'cannibal_pit',        label: 'Cannibal Pit', label_ru: 'Яма людоедов' },
           { unit_id: 'gs13',  building_id: 'cesswalker_mire',     label: 'Cesswalker Mire', label_ru: 'Топь бродящих в скверне' }],
    gs11: [{ unit_id: 'gs111', building_id: 'plague_knight_barrow', label: 'Plague Knight Barrow', label_ru: 'Курган чумных рыцарей' }],
    gs12: [{ unit_id: 'gs121', building_id: 'abomination_vat',    label: 'Abomination Vat', label_ru: 'Чан мерзости' }],
    gs13: [{ unit_id: 'gs131', building_id: 'blightwalker_mire',  label: 'Blightwalker Mire', label_ru: 'Топь бродящих в порче' }],
    gs2:  [{ unit_id: 'gs21',  building_id: 'crimson_communicant_chapel', label: 'Crimson Communicant Chapel', label_ru: 'Часовня багровых причастников' }],
    gs3:  [{ unit_id: 'gs31',  building_id: 'blood_adept_chamber', label: 'Blood Adept Chamber', label_ru: 'Палата адептов крови' },
           { unit_id: 'gs32',  building_id: 'necromancer_crypt',   label: 'Necromancer Crypt', label_ru: 'Склеп некромантов' },
           { unit_id: 'gs33',  building_id: 'plague_scholar_lab',  label: 'Plague Scholar Lab', label_ru: 'Лаборатория чумных учёных' }],
    gs31: [{ unit_id: 'gs311', building_id: 'crimson_mage_tower',  label: 'Crimson Mage Tower', label_ru: 'Башня багровых магов' },
           { unit_id: 'gs312', building_id: 'blood_knight_crypt',  label: 'Blood Knight Crypt', label_ru: 'Склеп рыцарей крови' }],
    gs33: [{ unit_id: 'gs331', building_id: 'plague_lord_lab',     label: 'Plague Lord Lab', label_ru: 'Лаборатория владык чумы' }],
    gs331: [{ unit_id: 'gs3311', building_id: 'plague_archon_lab',  label: 'Plague Archon Lab', label_ru: 'Лаборатория архонтов чумы' }],
    gs4:  [{ unit_id: 'gs41',  building_id: 'seraph_shrine',       label: 'Seraph Shrine', label_ru: 'Святилище серафимов' },
           { unit_id: 'gs42',  building_id: 'chalice_vault',       label: 'Chalice Vault', label_ru: 'Хранилище чаши' }],
    gs5:  [{ unit_id: 'gs51',  building_id: 'grail_tender_chamber', label: 'Grail Tender Chamber', label_ru: 'Палата смотрителей Грааля' },
           { unit_id: 'gs52',  building_id: 'grieving_servant_chamber', label: 'Grieving Servant Chamber', label_ru: 'Палата скорбящих слуг' }],
    gs6:  [{ unit_id: 'gs61',  building_id: 'specter_hall',        label: 'Specter Hall', label_ru: 'Зал спектров' },
           { unit_id: 'gs62',  building_id: 'apparition_mist',     label: 'Apparition Mist', label_ru: 'Туман привидений' }],
    h_g_1:    [{ unit_id: 'h_g_1_a2', building_id: 'prophet_sepulchre_2_a', label: 'Prophet Sepulchre II A', label_ru: 'Гробница пророков II A' },
               { unit_id: 'h_g_1_b2', building_id: 'prophet_sepulchre_2_b', label: 'Prophet Sepulchre II B', label_ru: 'Гробница пророков II B' }],
    h_g_1_a2: [{ unit_id: 'h_g_1_a3', building_id: 'prophet_sepulchre_3_a', label: 'Prophet Sepulchre III A', label_ru: 'Гробница пророков III A' }],
    h_g_1_b2: [{ unit_id: 'h_g_1_b3', building_id: 'prophet_sepulchre_3_b', label: 'Prophet Sepulchre III B', label_ru: 'Гробница пророков III B' }],
    h_g_1_a3: [{ unit_id: 'h_g_1_a41', building_id: 'prophet_sepulchre_4_a',     label: 'Prophet Sepulchre IV A', label_ru: 'Гробница пророков IV A' },
               { unit_id: 'h_g_1_a42', building_id: 'prophet_sepulchre_4_a_alt', label: 'Prophet Sepulchre IV A Alt', label_ru: 'Гробница пророков IV A Alt' }],
    h_g_1_b3: [{ unit_id: 'h_g_1_b41', building_id: 'prophet_sepulchre_4_b',     label: 'Prophet Sepulchre IV B', label_ru: 'Гробница пророков IV B' },
               { unit_id: 'h_g_1_b42', building_id: 'prophet_sepulchre_4_b_alt', label: 'Prophet Sepulchre IV B Alt', label_ru: 'Гробница пророков IV B Alt' }],
    h_g_2:    [{ unit_id: 'h_g_2_a2', building_id: 'warden_crypt_2_a', label: 'Warden Crypt II A', label_ru: 'Склеп стражей II A' },
               { unit_id: 'h_g_2_b2', building_id: 'warden_crypt_2_b', label: 'Warden Crypt II B', label_ru: 'Склеп стражей II B' }],
    h_g_2_a2: [{ unit_id: 'h_g_2_a3', building_id: 'warden_crypt_3_a', label: 'Warden Crypt III A', label_ru: 'Склеп стражей III A' }],
    h_g_2_b2: [{ unit_id: 'h_g_2_b3', building_id: 'warden_crypt_3_b', label: 'Warden Crypt III B', label_ru: 'Склеп стражей III B' }],
    h_g_2_a3: [{ unit_id: 'h_g_2_a41', building_id: 'warden_crypt_4_a',     label: 'Warden Crypt IV A', label_ru: 'Склеп стражей IV A' },
               { unit_id: 'h_g_2_a42', building_id: 'warden_crypt_4_a_alt', label: 'Warden Crypt IV A Alt', label_ru: 'Склеп стражей IV A Alt' }],
    h_g_2_b3: [{ unit_id: 'h_g_2_b41', building_id: 'warden_crypt_4_b',     label: 'Warden Crypt IV B', label_ru: 'Склеп стражей IV B' },
               { unit_id: 'h_g_2_b42', building_id: 'warden_crypt_4_b_alt', label: 'Warden Crypt IV B Alt', label_ru: 'Склеп стражей IV B Alt' }],
    h_g_3:    [{ unit_id: 'h_g_3_a2', building_id: 'voice_chapel_2_a', label: 'Voice Chapel II A', label_ru: 'Часовня Голоса II A' },
               { unit_id: 'h_g_3_b2', building_id: 'voice_chapel_2_b', label: 'Voice Chapel II B', label_ru: 'Часовня Голоса II B' }],
    h_g_3_a2: [{ unit_id: 'h_g_3_a3', building_id: 'voice_chapel_3_a', label: 'Voice Chapel III A', label_ru: 'Часовня Голоса III A' }],
    h_g_3_b2: [{ unit_id: 'h_g_3_b3', building_id: 'voice_chapel_3_b', label: 'Voice Chapel III B', label_ru: 'Часовня Голоса III B' }],
    h_g_3_a3: [{ unit_id: 'h_g_3_a41', building_id: 'voice_chapel_4_a',     label: 'Voice Chapel IV A', label_ru: 'Часовня Голоса IV A' },
               { unit_id: 'h_g_3_a42', building_id: 'voice_chapel_4_a_alt', label: 'Voice Chapel IV A Alt', label_ru: 'Часовня Голоса IV A Alt' }],
    h_g_3_b3: [{ unit_id: 'h_g_3_b41', building_id: 'voice_chapel_4_b',     label: 'Voice Chapel IV B', label_ru: 'Часовня Голоса IV B' },
               { unit_id: 'h_g_3_b42', building_id: 'voice_chapel_4_b_alt', label: 'Voice Chapel IV B Alt', label_ru: 'Часовня Голоса IV B Alt' }],
    gs32: [{ unit_id: 'gs321', building_id: 'death_lord_crypt', label: 'Death Lord Crypt', label_ru: 'Склеп владык смерти' }],
    gs21: [{ unit_id: 'gs211', building_id: 'chosen_chapel', label: 'Chosen Chapel', label_ru: 'Часовня избранных' }],
    gs41: [{ unit_id: 'gs411', building_id: 'grail_angel_shrine', label: 'Grail Angel Shrine', label_ru: 'Святилище ангелов Грааля' }],
    gs42: [{ unit_id: 'gs421', building_id: 'sorrow_vessel_vault', label: 'Sorrow Vessel Vault', label_ru: 'Хранилище сосудов скорби' }],
    gs51: [{ unit_id: 'gs511', building_id: 'grail_keeper_chamber', label: 'Grail Keeper Chamber', label_ru: 'Палата хранителей Грааля' }],
    gs52: [{ unit_id: 'gs521', building_id: 'grieving_custodian_chamber', label: 'Grieving Custodian Chamber', label_ru: 'Палата скорбящих блюстителей' }],
    gs521: [{ unit_id: 'gs5211', building_id: 'grieving_warden_chamber', label: 'Grieving Warden Chamber', label_ru: 'Палата скорбящих стражей' }],
    gs61: [{ unit_id: 'gs611', building_id: 'wraith_hall', label: 'Wraith Hall', label_ru: 'Зал духов' }],
    gs62: [{ unit_id: 'gs621', building_id: 'phantom_mist', label: 'Phantom Mist', label_ru: 'Туман фантомов' }],
    gs7:  [{ unit_id: 'gs71',  building_id: 'pale_dame_barrow',      label: 'Pale Dame Barrow', label_ru: 'Курган бледных госпож' },
           { unit_id: 'gs72',  building_id: 'pale_votaress_chantry', label: 'Pale Votaress Chantry', label_ru: 'Часовня бледных послушниц' },
           { unit_id: 'gs73',  building_id: 'pale_mourner_shrine', label: 'Pale Mourner Shrine', label_ru: 'Святилище бледных плакальщиц' }],
    gs71: [{ unit_id: 'gs711', building_id: 'pale_matriarch_barrow', label: 'Pale Matriarch Barrow', label_ru: 'Курган бледных праматерей' }],
    gs72: [{ unit_id: 'gs721', building_id: 'pale_abbess_chantry',   label: 'Pale Abbess Chantry', label_ru: 'Часовня бледных аббатис' }],
    gs73: [{ unit_id: 'gs731', building_id: 'pale_lamenter_shrine',  label: 'Pale Lamenter Shrine', label_ru: 'Святилище бледных скорбниц' }],
    gs8:  [{ unit_id: 'gs81',  building_id: 'mothers_sorrow_font',      label: "Mother's Sorrow Font", label_ru: 'Купель Скорби Матери' },
           { unit_id: 'gs82',  building_id: 'mothers_vigil_reliquary',  label: "Mother's Vigil Reliquary", label_ru: 'Реликварий Бдения Матери' },
           { unit_id: 'gs83',  building_id: 'mothers_chalice_altar',    label: "Mother's Chalice Altar", label_ru: 'Алтарь Чаши Матери' }],
    gs81: [{ unit_id: 'gs811', building_id: 'mothers_grief_font',       label: "Mother's Grief Font", label_ru: 'Купель Горя Матери' }],
    gs82: [{ unit_id: 'gs821', building_id: 'mothers_shroud_reliquary', label: "Mother's Shroud Reliquary", label_ru: 'Реликварий Покрова Матери' }],
    gs83: [{ unit_id: 'gs831', building_id: 'mothers_vessel_altar',     label: "Mother's Vessel Altar", label_ru: 'Алтарь Сосуда Матери' }],
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
    { id: 'infirmary',   label: 'Infirmary', label_ru: 'Лазарет',    label_ru: 'Лазарет',      desc: 'Doubles out-of-combat health regeneration.', desc_ru: 'Удваивает восстановление здоровья вне боя.', effect: { regen_mult: 2 } },
    { id: 'crystal_mine', label: 'Crystal Mine', label_ru: 'Кристальная шахта', label_ru: 'Кристальная шахта', desc: '+25% crystals from your daily reward.', desc_ru: '+25% кристаллов от ежедневной награды.', effect: { daily_crystal_bonus_pct: 25 } },
  ],
  3: [
    { id: 'mage_guild', label: 'Mage Guild', label_ru: 'Гильдия магов', label_ru: 'Гильдия магов', desc: 'Spell research costs 25% fewer crystals.', desc_ru: 'Изучение заклинаний стоит на 25% меньше кристаллов.', effect: { spell_cost_reduction_pct: 25 } },
    { id: 'war_chest',  label: 'War Chest', label_ru: 'Военная казна',  label_ru: 'Военный сундук', desc: '+15% gold from every embark.', desc_ru: '+15% золота за каждый поход.', effect: { embark_gold_pct: 15 } },
  ],
  4: [
    { id: 'scholars_sanctum', label: "Scholar's Sanctum", label_ru: 'Санктум учёных', label_ru: 'Святилище учёных', desc: '+15% XP from every embark.', desc_ru: '+15% опыта за каждый поход.', effect: { embark_xp_pct: 15 } },
    { id: 'grand_reliquary',  label: 'Grand Reliquary', label_ru: 'Великий реликварий',    label_ru: 'Великий реликварий', desc: '+15% crystals from every embark.', desc_ru: '+15% кристаллов за каждый поход.', effect: { embark_crystal_pct: 15 } },
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
  if (factionPools) {
    for (const pool of Object.values(factionPools)) {
      const found = pool.find(b => b.id === buildingId);
      if (found) return found;
    }
  }
  // Mercenary halls live in their own table, but they flow through the SAME
  // upgrade resolver as faction dwellings, so they have to be findable here or
  // every branch check involving a mercenary comes back empty.
  for (const list of Object.values(MERCENARY_BUILDINGS)) {
    const found = list.find(b => b.id === buildingId);
    if (found) return found;
  }
  return null;
}

// Is `targetUnitId` anywhere downstream of `fromUnitId` on the upgrade tree
// (or the same unit)? Used to recognise a branch the player has already
// committed to by building further up it.
function upgradeReaches(faction, fromUnitId, targetUnitId) {
  if (!fromUnitId || !targetUnitId) return false;
  const paths = UNIT_UPGRADE_PATHS[faction] || {};
  const seen  = new Set();
  const stack = [fromUnitId];
  while (stack.length) {
    const id = stack.pop();
    if (id === targetUnitId) return true;
    if (seen.has(id)) continue;      // guards against a cycle in the data
    seen.add(id);
    for (const p of paths[id] || []) stack.push(p.unit_id);
  }
  return false;
}

// Which branch should a unit advance along, given the building actually standing
// in its slot?
//
// Buildings and units advance a tier at a time, but NOT in lockstep: a player
// can build the tier-3 barracks while the unit living there is still tier 1.
// Matching the slot's building id against the immediate next step then fails —
// the slot holds "Crimson Mage Tower" (tier 3) while the tier-1 Adept's only
// options are the three tier-2 buildings — and the unit becomes unupgradable
// despite the player having overbuilt for it.
//
// So: exact match first (the ordinary case), otherwise the branch whose line
// LEADS to whatever is built. The unit still advances one tier at a time.
// Every branch that is consistent with what is standing in the slot. Usually
// zero or one; more than one means the player genuinely has a choice to make.
//
// The hero trees MERGE — both tier-2 Paladin branches continue into the same
// tier-3 units — so a tier-3 cathedral cannot say which tier-2 kit was wanted,
// and those kits differ (Protector vs Beacon of Hope). Guessing would silently
// pick a build for the player, so both are returned and the caller asks.
function upgradeBranchCandidates(faction, paths, buildingId) {
  if (!paths || !paths.length) return [];
  if (paths.length === 1) return [paths[0]];   // no branch to disambiguate
  if (!buildingId) return [];

  const exact = paths.find(p => p.building_id === buildingId);
  if (exact) return [exact];

  const built = getBuildingDef(faction, buildingId);
  if (!built || !built.unit_id) return [];

  return paths.filter(p => upgradeReaches(faction, p.unit_id, built.unit_id));
}

// The unambiguous branch, or null when the player still has to choose. Callers
// that can ask should use upgradeBranchCandidates instead of treating null as
// "cannot upgrade" — that is what left an overbuilt hero permanently stuck.
function resolveUpgradeBranch(faction, paths, buildingId) {
  const candidates = upgradeBranchCandidates(faction, paths, buildingId);
  return candidates.length === 1 ? candidates[0] : null;
}

// ── Building costs ──────────────────────────────────────────────────────────
// DECLARED PER BUILDING, on purpose. Costs used to be derived — "base x tier",
// plus a crystal picked from the unit's damage_source — which had two problems:
// a unit with no element (physical or null, i.e. most knights) paid nothing
// but its faction crystal, and no cost written in this file could survive,
// because the formula overwrote every def.cost at load. Both are gone: what is
// written below is what a building costs, and it can be edited freely.
//
// The seed values follow one rule, which is worth keeping to when adding a
// building but is NOT enforced anywhere:
//
//   gold      tier 1  40    tier 2  60    tier 3  96
//   MAIN      the faction's own crystal — Life (Empire), Fire (Choir),
//             Death (Grail):  20 / 30 / 48
//   MIXED     one or two OTHER crystals at 5 / 8 / 12 each, so every crystal
//             type has a sink. Seeded from the unit's own damage element first,
//             then its strongest resistances; a unit with neither got one
//             picked off its id so it is still charged something.
//   a dwelling whose unit occupies TWO cells ('row' / 'column') is x1.5 on
//   everything — it is worth two of a small one and eats two loyalty.
//
// Tier 2 sits 25% under the old formula's 80/40/20 and tier 3 20% under its
// 120/60/30; the upper tiers were pricing players out. STARTING_RESOURCES in
// routes/index.js still covers one tier-1 dwelling.
const BUILDING_COSTS = {
  // ── empire ────────────────────────────────────────────────────
  conscript_barracks:            { gold: 40, Crystals_Life: 20, Crystals_Air: 5 },
  infantry_barracks:             { gold: 60, Crystals_Life: 30, Crystals_Nature: 8 },
  crossbow_range:                { gold: 96, Crystals_Life: 48, Crystals_Air: 12, Crystals_Frost: 12 },
  heavy_barracks:                { gold: 96, Crystals_Life: 48, Crystals_Death: 12, Crystals_Frost: 12 },
  blade_guard_hall:              { gold: 96, Crystals_Life: 48, Crystals_Fire: 12, Crystals_Air: 12 },
  cavalry_stables:               { gold: 90, Crystals_Life: 45, Crystals_Frost: 12, Crystals_Nature: 12 },
  knights_stables:               { gold: 144, Crystals_Life: 72, Crystals_Frost: 18, Crystals_Nature: 18 },
  sentinel_forge:                { gold: 60, Crystals_Life: 30, Crystals_Death: 8, Crystals_Frost: 8 },
  automaton_lab:                 { gold: 90, Crystals_Life: 45, Crystals_Death: 12, Crystals_Frost: 12 },
  golden_lion_lab:               { gold: 144, Crystals_Life: 72, Crystals_Death: 18, Crystals_Air: 18 },
  siege_workshop:                { gold: 90, Crystals_Life: 45, Crystals_Fire: 12, Crystals_Death: 12 },
  siege_dreadnought_workshop:    { gold: 144, Crystals_Life: 72, Crystals_Fire: 18, Crystals_Death: 18 },
  smith_workshop:                { gold: 40, Crystals_Life: 20, Crystals_Fire: 5, Crystals_Nature: 5 },
  mechanic_den:                  { gold: 60, Crystals_Life: 30, Crystals_Fire: 8, Crystals_Nature: 8 },
  mechanic_den_2:                { gold: 96, Crystals_Life: 48, Crystals_Fire: 12, Crystals_Nature: 12 },
  rifleman_range:                { gold: 60, Crystals_Life: 30, Crystals_Fire: 8, Crystals_Nature: 8 },
  devastator_post:               { gold: 96, Crystals_Life: 48, Crystals_Fire: 12, Crystals_Nature: 12 },
  flamethrower_post:             { gold: 96, Crystals_Life: 48, Crystals_Fire: 12, Crystals_Nature: 12 },
  acolyte_shrine:                { gold: 40, Crystals_Life: 20, Crystals_Nature: 5 },
  sun_temple:                    { gold: 60, Crystals_Life: 30, Crystals_Death: 8, Crystals_Nature: 8 },
  mithrails_champion_keep:       { gold: 96, Crystals_Life: 48, Crystals_Air: 12, Crystals_Fire: 12 },
  // Tier 4 — the first in the game, so it costs a clear step past every tier 3.
  mithrails_exemplar_keep:       { gold: 160, Crystals_Life: 80, Crystals_Air: 20, Crystals_Fire: 20 },
  priest_shrine:                 { gold: 60, Crystals_Life: 30, Crystals_Nature: 8 },
  ardent_shrine:                 { gold: 96, Crystals_Life: 48, Crystals_Fire: 12, Crystals_Nature: 12 },
  high_priest_shrine:            { gold: 160, Crystals_Life: 80, Crystals_Fire: 20, Crystals_Nature: 20 },
  blessed_soul_shrine:           { gold: 40, Crystals_Life: 20, Crystals_Air: 5, Crystals_Fire: 5 },
  mithrails_light_temple:        { gold: 60, Crystals_Life: 30, Crystals_Air: 8, Crystals_Fire: 8 },
  mithrails_will_temple:         { gold: 96, Crystals_Life: 48, Crystals_Air: 12, Crystals_Fire: 12 },
  mage_tower:                    { gold: 40, Crystals_Life: 20, Crystals_Air: 5, Crystals_Fire: 5 },
  red_mage_tower:                { gold: 60, Crystals_Life: 30, Crystals_Fire: 8, Crystals_Air: 8 },
  ash_sanctum:                   { gold: 96, Crystals_Life: 48, Crystals_Fire: 12, Crystals_Air: 12 },
  cinder_forge:                  { gold: 96, Crystals_Life: 48, Crystals_Fire: 12, Crystals_Air: 12 },
  blue_mage_tower:               { gold: 60, Crystals_Life: 30, Crystals_Frost: 8, Crystals_Air: 8 },
  cryomancer_tower:              { gold: 96, Crystals_Life: 48, Crystals_Fire: 12, Crystals_Frost: 12 },
  warder_sanctum:                { gold: 60, Crystals_Life: 30, Crystals_Air: 8 },
  bulwark_sanctum:               { gold: 96, Crystals_Life: 48, Crystals_Air: 12, Crystals_Frost: 12 },
  aegis_bastion:                 { gold: 96, Crystals_Life: 48, Crystals_Air: 12, Crystals_Frost: 12 },

  // ── choir_of_the_cursed ───────────────────────────────────────
  imp_den:                       { gold: 60, Crystals_Fire: 30, Crystals_Nature: 8 },
  ash_novitiate:               { gold: 40, Crystals_Fire: 20, Crystals_Air: 5 },
  ember_vigil:                { gold: 90, Crystals_Fire: 45, Crystals_Life: 12 },
  pyre_watch:             { gold: 144, Crystals_Fire: 72, Crystals_Life: 18, Crystals_Air: 12 },
  tormentor_pit:                 { gold: 90, Crystals_Fire: 45, Crystals_Air: 12, Crystals_Death: 12 },
  praetor_pit:                   { gold: 144, Crystals_Fire: 72, Crystals_Air: 18, Crystals_Death: 18 },
  chorister_chamber:             { gold: 90, Crystals_Fire: 45, Crystals_Death: 12 },
  chanter_chamber:               { gold: 144, Crystals_Fire: 72, Crystals_Death: 18 },
  archchanter_chamber:           { gold: 240, Crystals_Fire: 120, Crystals_Death: 30 },
  gargoyle_roost:                { gold: 60, Crystals_Fire: 30, Crystals_Air: 8, Crystals_Life: 8 },
  stone_gargoyle_den:            { gold: 90, Crystals_Fire: 45, Crystals_Air: 12, Crystals_Life: 12 },
  onyx_gargoyle_den:             { gold: 144, Crystals_Fire: 72, Crystals_Air: 18, Crystals_Death: 18 },
  quartz_gargoyle_den:           { gold: 90, Crystals_Fire: 45, Crystals_Death: 12, Crystals_Frost: 12 },
  azurite_gargoyle_den:          { gold: 144, Crystals_Fire: 72, Crystals_Frost: 18, Crystals_Death: 18 },
  heretic_pit:                   { gold: 40, Crystals_Fire: 20, Crystals_Life: 5 },
  possessed_pit:                 { gold: 60, Crystals_Fire: 30, Crystals_Life: 8, Crystals_Death: 8 },
  vessel_altar:                  { gold: 96, Crystals_Fire: 48, Crystals_Death: 12 },
  pain_projector_den:            { gold: 96, Crystals_Fire: 48, Crystals_Death: 12 },
  peer_court:                    { gold: 40, Crystals_Fire: 20, Crystals_Life: 5 },
  nether_baron_hall:             { gold: 60, Crystals_Fire: 30, Crystals_Life: 8 },
  nether_lord_hall:              { gold: 96, Crystals_Fire: 48, Crystals_Life: 12 },
  nether_sovereign_hall:         { gold: 160, Crystals_Fire: 80, Crystals_Life: 20 },
  flame_spawn_pit:               { gold: 40, Crystals_Fire: 20, Crystals_Death: 5 },
  greater_flame_spawn_pit:       { gold: 60, Crystals_Fire: 30, Crystals_Frost: 8 },
  inferno_spawn_pit:             { gold: 96, Crystals_Fire: 48, Crystals_Life: 12 },
  cultist_shrine:                { gold: 40, Crystals_Fire: 20, Crystals_Life: 5 },
  choir_servant_shrine:          { gold: 60, Crystals_Fire: 30, Crystals_Life: 8, Crystals_Death: 8 },
  choir_ascendant_shrine:        { gold: 96, Crystals_Fire: 48, Crystals_Life: 12, Crystals_Death: 12 },
  choir_exalted_shrine:          { gold: 160, Crystals_Fire: 80, Crystals_Life: 20, Crystals_Death: 20 },
  // Priced against the shrine branch it forks from; the Life crystal is heavier
  // because this half mends instead of burns.
  ash_cantor_chancel:            { gold: 60, Crystals_Fire: 30, Crystals_Life: 12, Crystals_Air: 5 },
  ash_precentor_chancel:         { gold: 96, Crystals_Fire: 48, Crystals_Life: 18, Crystals_Air: 8 },

  // ── grail_of_sorrow ───────────────────────────────────────────
  zombie_pit:                    { gold: 40, Crystals_Death: 20, Crystals_Air: 5, Crystals_Frost: 5 },
  ghoul_pit:                     { gold: 60, Crystals_Death: 30, Crystals_Air: 8, Crystals_Frost: 8 },
  plague_knight_barrow:          { gold: 96, Crystals_Death: 48, Crystals_Nature: 12, Crystals_Air: 12 },
  cannibal_pit:                  { gold: 60, Crystals_Death: 30, Crystals_Air: 8, Crystals_Frost: 8 },
  abomination_vat:               { gold: 96, Crystals_Death: 48, Crystals_Air: 12, Crystals_Frost: 12 },
  cesswalker_mire:               { gold: 60, Crystals_Death: 30, Crystals_Air: 8, Crystals_Nature: 8 },
  blightwalker_mire:             { gold: 96, Crystals_Death: 48, Crystals_Air: 12, Crystals_Nature: 12 },
  communicant_chapel:            { gold: 60, Crystals_Death: 30, Crystals_Frost: 8 },
  crimson_communicant_chapel:    { gold: 90, Crystals_Death: 45, Crystals_Nature: 12 },
  chosen_chapel:                 { gold: 144, Crystals_Death: 72, Crystals_Life: 18 },
  adept_crypt:                   { gold: 40, Crystals_Death: 20, Crystals_Life: 5 },
  blood_adept_chamber:           { gold: 60, Crystals_Death: 30, Crystals_Air: 8 },
  crimson_mage_tower:            { gold: 96, Crystals_Death: 48, Crystals_Nature: 12 },
  blood_knight_crypt:            { gold: 96, Crystals_Death: 48, Crystals_Life: 12 },
  necromancer_crypt:             { gold: 60, Crystals_Death: 30, Crystals_Frost: 8 },
  death_lord_crypt:              { gold: 96, Crystals_Death: 48, Crystals_Life: 12 },
  plague_scholar_lab:            { gold: 60, Crystals_Death: 30, Crystals_Nature: 8 },
  plague_lord_lab:               { gold: 96, Crystals_Death: 48, Crystals_Nature: 12 },
  plague_archon_lab:             { gold: 154, Crystals_Death: 77, Crystals_Nature: 19 },
  colossus_barrow:               { gold: 60, Crystals_Death: 30, Crystals_Air: 8, Crystals_Fire: 8 },
  seraph_shrine:                 { gold: 90, Crystals_Death: 45, Crystals_Frost: 12, Crystals_Nature: 12 },
  grail_angel_shrine:            { gold: 144, Crystals_Death: 72, Crystals_Frost: 18, Crystals_Nature: 18 },
  chalice_vault:                 { gold: 90, Crystals_Death: 45, Crystals_Fire: 12 },
  sorrow_vessel_vault:           { gold: 144, Crystals_Death: 72, Crystals_Fire: 18 },
  grail_acolyte_chamber:         { gold: 40, Crystals_Death: 20, Crystals_Air: 5 },
  grail_tender_chamber:          { gold: 60, Crystals_Death: 30, Crystals_Fire: 8, Crystals_Frost: 8 },
  grail_keeper_chamber:          { gold: 96, Crystals_Death: 48, Crystals_Fire: 12, Crystals_Frost: 12 },
  grieving_servant_chamber:      { gold: 60, Crystals_Death: 30, Crystals_Nature: 8 },
  grieving_custodian_chamber:    { gold: 96, Crystals_Death: 48, Crystals_Frost: 12 },
  // Tier 4, priced off mithrails_exemplar_keep (the existing tier 4 barracks)
  // with the Grail's own crystal in the lead.
  grieving_warden_chamber:       { gold: 160, Crystals_Death: 80, Crystals_Frost: 20, Crystals_Nature: 20 },
  ghost_manor:                   { gold: 40, Crystals_Death: 20, Crystals_Air: 5 },
  specter_hall:                  { gold: 60, Crystals_Death: 30, Crystals_Frost: 8 },
  wraith_hall:                   { gold: 96, Crystals_Death: 48, Crystals_Frost: 12 },
  apparition_mist:               { gold: 60, Crystals_Death: 30, Crystals_Frost: 8 },
  phantom_mist:                  { gold: 96, Crystals_Death: 48, Crystals_Frost: 12 },
  pale_maiden_barrow:            { gold: 40, Crystals_Death: 20, Crystals_Frost: 5 },
  pale_dame_barrow:              { gold: 60, Crystals_Death: 30, Crystals_Frost: 8 },
  pale_matriarch_barrow:         { gold: 96, Crystals_Death: 48, Crystals_Frost: 12 },
  pale_votaress_chantry:         { gold: 60, Crystals_Death: 30, Crystals_Frost: 8, Crystals_Air: 8 },
  pale_mourner_shrine:           { gold: 60, Crystals_Death: 30, Crystals_Nature: 8 },
  pale_lamenter_shrine:          { gold: 96, Crystals_Death: 48, Crystals_Nature: 12, Crystals_Frost: 12 },
  pale_abbess_chantry:           { gold: 96, Crystals_Death: 48, Crystals_Air: 12, Crystals_Frost: 12 },
};

const FACTION_CRYSTAL = {
  empire:              'Crystals_Life',
  choir_of_the_cursed: 'Crystals_Fire',
  grail_of_sorrow:     'Crystals_Death',
};

// Applied at module load. A building with no entry above keeps whatever cost it
// declares inline; only the throne (THRONE_UPGRADE_COSTS) and the mercenary
// halls (trophy costs) are deliberately absent from the table.
function applyBuildingCosts() {
  for (const pools of Object.values(BUILDING_POOLS)) {
    for (const [category, list] of Object.entries(pools)) {
      if (category === 'throne') continue;
      for (const def of list) {
        const cost = BUILDING_COSTS[def.id];
        if (cost) def.cost = { ...cost };
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
// A respec swaps a building for a SIBLING — another branch the same parent
// leads to. It is re-choosing a fork, not moving to an unrelated line.
//
// It used to match on category + tier alone, which is far too wide: every
// hero's cathedral is category 'throne', so a tier 3 Paladin cathedral offered
// the Inquisitor and Artificer towers and a respec silently changed which HERO
// the player had. The same hole let a Sun Temple (the Acolyte line) become an
// Automaton Lab, carrying the unit's XP across to an unrelated unit.
function getRespecOptions(faction, buildingId) {
  const pools = BUILDING_POOLS[faction];
  if (!pools) return [];
  const current = getBuildingDef(faction, buildingId);
  if (!current) return [];
  const pool = pools[current.category] || [];

  // The building that upgrades INTO this one. Its other upgrades are the forks
  // the player could have taken instead, and those are the only legal swaps.
  const parent = pool.find(b => (b.upgrades || []).includes(current.id));
  if (parent) {
    return (parent.upgrades || [])
      .filter(id => id !== current.id)
      .map(id => pool.find(b => b.id === id))
      .filter(b => b && b.unit_id);
  }

  // No parent: a tier 1 building raised straight from the pool. Swapping one of
  // those is re-picking a starting choice, which is reasonable for barracks —
  // but the throne IS the hero, chosen once at registration, and must never
  // become a different hero's line.
  if (current.category === 'throne') return [];
  return pool.filter(b =>
    b.id !== current.id &&
    b.tier != null && b.tier === current.tier &&
    b.unit_id
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

// Driven off SLOT_CATEGORIES so adding a slot there is the only edit needed.
// Existing records are NOT migrated: a slot missing from a saved buildings_data
// simply reads as empty everywhere (`buildings[slot] || { level: 0 }`), and is
// written the first time the player builds in it.
function emptyStructures() {
  const slots = {};
  for (const slot of SLOT_IDS) slots[slot] = { level: 0, building_id: null };
  return slots;
}

const MERCENARY_BUILDINGS = {
  crimson_basilica: [
    {
      id:       'cb_aggrails_herald',
      label:    'Aggrails Herald', label_ru: 'Вестник Агграила',
      region:   'crimson_basilica',
      unit_id:  'opb_e1',
      tier:     1,
      upgrades: ['cb_exalted_herald'],
      cost:     { vial_of_pure_blood: 5, aggrails_signet: 5 },
    },
    {
      id:       'cb_exalted_herald',
      label:    'Exalted Herald', label_ru: 'Возвышенный Вестник',
      region:   'crimson_basilica',
      unit_id:  'opb_e11',
      tier:     2,
      upgrades: ['cb_exalted_evangelist'],
      cost:     { vial_of_pure_blood: 10, aggrails_signet: 10 },
    },
    {
      id:       'cb_exalted_evangelist',
      label:    'Exalted Evangelist', label_ru: 'Возвышенный Евангелист',
      region:   'crimson_basilica',
      unit_id:  'opb_e111',
      tier:     3,
      upgrades: [],
      cost:     { vial_of_pure_blood: 20, aggrails_signet: 20 },
    },
    {
      id:       'cb_scarlet_recruit',
      label:    'Recruit', label_ru: 'Новобранец',
      region:   'crimson_basilica',
      unit_id:  'opb_e2',
      tier:     1,
      upgrades: ['cb_aggrails_devoted', 'cb_aggrails_exorcist'],
      cost:     { vial_of_pure_blood: 5, aggrails_signet: 5 },
    },
    {
      id:       'cb_aggrails_devoted',
      label:    'Aggrails Devoted', label_ru: 'Преданный Агграилу',
      region:   'crimson_basilica',
      unit_id:  'opb_e21',
      tier:     2,
      upgrades: ['cb_aggrails_champion', 'cb_aggrails_desecrator'],
      cost:     { vial_of_pure_blood: 10, aggrails_signet: 10 },
    },
    {
      id:       'cb_aggrails_exorcist',
      label:    'Aggrails Exorcist', label_ru: 'Экзорцист Агграила',
      region:   'crimson_basilica',
      unit_id:  'opb_e22',
      tier:     2,
      upgrades: [],
      cost:     { vial_of_pure_blood: 10, aggrails_signet: 10 },
    },
    {
      id:       'cb_aggrails_champion',
      label:    'Aggrails Champion', label_ru: 'Поборник Агграила',
      region:   'crimson_basilica',
      unit_id:  'opb_e211',
      tier:     3,
      upgrades: [],
      cost:     { vial_of_pure_blood: 15, aggrails_signet: 15 },
    },
    {
      id:       'cb_aggrails_desecrator',
      label:    'Aggrails Desecrator', label_ru: 'Осквернитель Агграила',
      region:   'crimson_basilica',
      unit_id:  'opb_e212',
      tier:     3,
      upgrades: [],
      cost:     { vial_of_pure_blood: 15, aggrails_signet: 15 },
    },
    {
      id:       'cb_initiate',
      label:    'Initiate', label_ru: 'Посвящённая',
      region:   'crimson_basilica',
      unit_id:  'opb_e3',
      tier:     1,
      upgrades: ['cb_keeper_of_purity'],
      cost:     { vial_of_pure_blood: 5, aggrails_signet: 5 },
    },
    {
      id:       'cb_keeper_of_purity',
      label:    'Keeper of Purity', label_ru: 'Хранитель Чистоты',
      region:   'crimson_basilica',
      unit_id:  'opb_e31',
      tier:     2,
      upgrades: ['cb_high_keeper'],
      cost:     { vial_of_pure_blood: 10, aggrails_signet: 10 },
    },
    {
      id:       'cb_high_keeper',
      label:    'High Keeper', label_ru: 'Верховный Хранитель',
      region:   'crimson_basilica',
      unit_id:  'opb_e311',
      tier:     3,
      upgrades: ['cb_grand_keeper', 'cb_bloodied_veil'],
      cost:     { vial_of_pure_blood: 15, aggrails_signet: 15 },
    },
    {
      id:       'cb_grand_keeper',
      label:    'Grand Keeper', label_ru: 'Великий Хранитель',
      region:   'crimson_basilica',
      unit_id:  'opb_e3111',
      tier:     4,
      upgrades: [],
      cost:     { shard_of_devotion: 20, vial_of_pure_blood: 25 },
    },
    {
      // EVENT BRANCH. `bloodied_brooch` drops only while a Basilica event runs
      // (see the events table). The DROP expires with the event; this building
      // never does — a player who banked brooches can raise it whenever, which
      // is the whole reason the trophy is worth chasing during the window.
      id:       'cb_bloodied_veil',
      label:    'Keeper of the Bloodied Veil', label_ru: 'Хранитель Окровавленной Завесы',
      region:   'crimson_basilica',
      unit_id:  'opb_e3112',
      tier:     4,
      upgrades: [],
      cost:     { bloodied_brooch: 10, shard_of_devotion: 15 },
    },
    // Archer line. The id stays cb_crimson_hunter — saved buildings_data rows
    // reference it — but the label now names the unit it actually grants
    // (opb_e4 is the Crimson Scout; the Hunter is its tier-2 upgrade).
    {
      id:       'cb_crimson_hunter',
      label:    'Crimson Scout', label_ru: 'Багровый разведчик',
      region:   'crimson_basilica',
      unit_id:  'opb_e4',
      tier:     1,
      upgrades: ['cb_crimson_hunter_2'],
      cost:     { vial_of_pure_blood: 5, aggrails_signet: 5 },
    },
    {
      id:       'cb_crimson_hunter_2',
      label:    'Crimson Hunter', label_ru: 'Багровый охотник',
      region:   'crimson_basilica',
      unit_id:  'opb_e41',
      tier:     2,
      upgrades: ['cb_crimson_stalker'],
      cost:     { vial_of_pure_blood: 10, aggrails_signet: 10 },
    },
    {
      id:       'cb_crimson_stalker',
      label:    'Crimson Stalker', label_ru: 'Багровый преследователь',
      region:   'crimson_basilica',
      unit_id:  'opb_e411',
      tier:     3,
      upgrades: [],
      cost:     { vial_of_pure_blood: 15, aggrails_signet: 15 },
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
      label:    'Geodeling', label_ru: 'Жеодыш',
      region:   'glittering_abyss',
      unit_id:  'mv_e1',
      tier:     1,
      upgrades: ['ga_geode_mender'],
      cost:     { crystal_dust: 5, crystal_shard: 5 },
    },
    {
      id:       'ga_geode_mender',
      label:    'Geode Mender', label_ru: 'Жеодный целитель',
      region:   'glittering_abyss',
      unit_id:  'mv_e11',
      tier:     2,
      upgrades: ['ga_radiant_geode'],
      cost:     { crystal_dust: 10, crystal_shard: 10 },
    },
    {
      id:       'ga_radiant_geode',
      label:    'Radiant Geode', label_ru: 'Сияющая жеода',
      region:   'glittering_abyss',
      unit_id:  'mv_e111',
      tier:     3,
      upgrades: [],
      cost:     { crystal_dust: 15, crystal_shard: 15 },
    },
    // Frostshard line — fast cold strikers.
    {
      id:       'ga_frostshard',
      label:    'Frostshard', label_ru: 'Морозный осколок',
      region:   'glittering_abyss',
      unit_id:  'mv_e2',
      tier:     1,
      upgrades: ['ga_rime_splinter'],
      cost:     { crystal_dust: 5, crystal_shard: 5 },
    },
    {
      id:       'ga_rime_splinter',
      label:    'Rime Splinter', label_ru: 'Инеевый осколок',
      region:   'glittering_abyss',
      unit_id:  'mv_e21',
      tier:     2,
      upgrades: ['ga_glacial_prism'],
      cost:     { crystal_dust: 10, crystal_shard: 10 },
    },
    {
      id:       'ga_glacial_prism',
      label:    'Glacial Prism', label_ru: 'Ледниковая призма',
      region:   'glittering_abyss',
      unit_id:  'mv_e211',
      tier:     3,
      upgrades: [],
      cost:     { crystal_dust: 15, crystal_shard: 15 },
    },
    // Cairnling line — row-holding protectors.
    {
      id:       'ga_cairnling',
      label:    'Cairnling', label_ru: 'Курганник',
      region:   'glittering_abyss',
      unit_id:  'mv_e3',
      tier:     1,
      upgrades: ['ga_rimewarden'],
      cost:     { crystal_dust: 5, crystal_shard: 5 },
    },
    {
      id:       'ga_rimewarden',
      label:    'Rimewarden', label_ru: 'Инеевый страж',
      region:   'glittering_abyss',
      unit_id:  'mv_e31',
      tier:     2,
      upgrades: ['ga_bulwark_geode'],
      cost:     { crystal_dust: 10, crystal_shard: 10 },
    },
    {
      id:       'ga_bulwark_geode',
      label:    'Bulwark Geode', label_ru: 'Оплотная жеода',
      region:   'glittering_abyss',
      unit_id:  'mv_e311',
      tier:     3,
      upgrades: [],
      cost:     { crystal_dust: 15, crystal_shard: 15 },
    },
  ],

  // Restless dead of the Chamber of Unrest. Costs use its trophies (grave_dust /
  // rusted_shackle). Malgrath the Undying (dm_e4/dm_e41) is a boss — not here.
  chamber_of_unrest: [
    // Bone Knight line.
    { id: 'cu_bone_knight',  label: 'Bone Knight', label_ru: 'Костяной рыцарь',  region: 'chamber_of_unrest', unit_id: 'dm_e1',   tier: 1, upgrades: ['cu_dread_knight'], cost: { grave_dust: 5, rusted_shackle: 5 } },
    { id: 'cu_dread_knight', label: 'Dread Knight', label_ru: 'Рыцарь ужаса', region: 'chamber_of_unrest', unit_id: 'dm_e11',  tier: 2, upgrades: ['cu_death_knight'], cost: { grave_dust: 10, rusted_shackle: 10 } },
    { id: 'cu_death_knight', label: 'Death Knight', label_ru: 'Рыцарь смерти', region: 'chamber_of_unrest', unit_id: 'dm_e111', tier: 3, upgrades: [],                   cost: { grave_dust: 15, rusted_shackle: 15 } },
    // Oathbound Martyr line.
    { id: 'cu_oathbound_martyr', label: 'Oathbound Martyr', label_ru: 'Мученик клятвы', region: 'chamber_of_unrest', unit_id: 'dm_2',   tier: 1, upgrades: ['cu_oathsworn_martyr'], cost: { grave_dust: 5, rusted_shackle: 5 } },
    { id: 'cu_oathsworn_martyr', label: 'Oathsworn Martyr', label_ru: 'Присягнувший мученик', region: 'chamber_of_unrest', unit_id: 'dm_21',  tier: 2, upgrades: ['cu_martyr_of_the_vow'], cost: { grave_dust: 10, rusted_shackle: 10 } },
    { id: 'cu_martyr_of_the_vow', label: 'Martyr of the Vow', label_ru: 'Мученик обета', region: 'chamber_of_unrest', unit_id: 'dm_211', tier: 3, upgrades: [],                       cost: { grave_dust: 15, rusted_shackle: 15 } },
    // Wailing Ghost line.
    { id: 'cu_wailing_ghost',  label: 'Wailing Ghost', label_ru: 'Стенающий призрак',  region: 'chamber_of_unrest', unit_id: 'dm_e3',   tier: 1, upgrades: ['cu_revenant'],       cost: { grave_dust: 5, rusted_shackle: 5 } },
    { id: 'cu_revenant',       label: 'Revenant', label_ru: 'Ревенант',       region: 'chamber_of_unrest', unit_id: 'dm_e31',  tier: 2, upgrades: ['cu_soul_harvester'], cost: { grave_dust: 10, rusted_shackle: 10 } },
    { id: 'cu_soul_harvester', label: 'Soul Harvester', label_ru: 'Жнец душ', region: 'chamber_of_unrest', unit_id: 'dm_e311', tier: 3, upgrades: [],                     cost: { grave_dust: 15, rusted_shackle: 15 } },
  ],
};

// Mercenaries advance by exactly the same rules as faction units: reach the XP
// threshold, have the building that supports the next tier, level up. That only
// holds if they go through the SAME table and the same resolver, so their tree —
// which is declared once in MERCENARY_BUILDINGS via each hall's `upgrades` — is
// projected into UNIT_UPGRADE_PATHS here under its region key rather than being
// written out a second time and left to drift.
//
// The region key acts as the "faction" for these units: getFactionForUnit finds
// it by scanning this table, and getBuildingDef above already falls back to
// MERCENARY_BUILDINGS, so every branch check resolves without a special case.
for (const [region, halls] of Object.entries(MERCENARY_BUILDINGS)) {
  const byId  = new Map(halls.map(h => [h.id, h]));
  const paths = {};
  for (const hall of halls) {
    const next = (hall.upgrades || []).map(id => byId.get(id)).filter(Boolean);
    if (!next.length) continue;
    // label_ru rides along with label — these entries are what the castle's
    // upgrade slider reads, so dropping it here would leave every mercenary
    // branch showing an English name while the rest of the castle is translated.
    paths[hall.unit_id] = next.map(n => ({ unit_id: n.unit_id, building_id: n.id, label: n.label, label_ru: n.label_ru }));
  }
  if (Object.keys(paths).length) UNIT_UPGRADE_PATHS[region] = paths;
}

module.exports = {
  BUILDING_POOLS,
  MERCENARY_BUILDINGS,
  SLOT_CATEGORIES,
  SLOT_IDS,
  SLOT_LAYERS,
  LAYER_COUNT,
  slotsOnLayer,
  SLOT_UNLOCKS,
  slotLockedBy,
  isSlotUnlocked,
  UNIT_UPGRADE_PATHS,
  HERO_MAX_LEVEL,
  THRONE_UPGRADE_COSTS,
  THRONE_PERKS,
  getThronePerk,
  getThronePerkEmbarkBonuses,
  getSpellCostReductionPct,
  getBuildingDef,
  upgradeReaches,
  resolveUpgradeBranch,
  upgradeBranchCandidates,
  emptyStructures,
  FACTION_CRYSTAL,
  BUILDING_COSTS,
  RESPEC_COST_PCT,
  getRespecOptions,
  getRespecCost,
  scaleCost,
};