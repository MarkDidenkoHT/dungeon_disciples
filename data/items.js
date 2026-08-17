// Each entry is an item blueprint. Fields the crafting/equip systems care about:
//   faction       null = craftable by anyone; otherwise only that faction may
//                 craft it, AND it is hidden from other factions' catalogs.
//   unique        true = the player may only ever own ONE copy (crafting a
//                 second is refused). Absent/false = craft as many as you like.
//                 By convention every epic/mythic item is unique; commons and
//                 rares are stackable. Flip per-item as balance needs.
//   cost/item_cost resource + item-ingredient cost to craft.
//   requires      embark progress the craft is gated behind. Omit for the
//                 rarity default; see the craft gating block below ITEM_DEFS.
//
// Equip restrictions (checked in data/item_rules.js, enforced by
// POST /items/equip and mirrored by the roster UI):
//   tag_required  unit must carry this tag
//   blocked_tags    ['Construct']  refuse units carrying ANY of these
//   blocked_actions ['heal']       refuse units whose action is of this kind
//                                  ('damage' | 'heal' | 'sacrifice' | 'none')
//   requires_action 'damage'       unit's action MUST be of this kind
// The last three are only needed for special cases: an item whose `passive`
// declares a trigger that requires attacking (on_hit / on_kill /
// preemptive_strike) or healing (on_heal) is ALREADY refused automatically on a
// unit that cannot do that — no authoring required.
const ITEM_DEFS = {

  crystal_exoskeleton: {
    key:          'crystal_exoskeleton',
    name:         'Crystal Exoskeleton',
    name_ru:      'Кристальный Экзоскелет',
    faction:      null,
    tag_required: null,
    adds_tag:     'Construct',
    stat_mods:    { hp: 3, armor: 3, cold_resist: 5 },
    passive:      'magic_attunement 1',
    blocked_tags: ['Spirit'],       // nothing incorporeal to encase in crystal
    icon:         'crystal_exoskeleton',
    rarity:       'mythic',
    unique:       true,
    cost:         { living_geode: 10, crystal_dust: 2, crystal_shard: 1, Gold: 100, Crystals_Frost: 50 },
    item_cost:    { iron_armor: 1, cold_resistance_potion: 2 },
    requires:     [
      { region: 'glittering_abyss',  level: 4 },
      { region: 'chamber_of_unrest', level: 6 },
    ],
  },
  crystal_shield: {
    key:          'crystal_shield',
    name:         'Crystal Shield',
    name_ru:      'Кристальный Щит',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { hp: 2, armor: 3, cold_resist: 5 },
    passive:      'unbreakable 1',
    icon:         'crystal_shield',
    rarity:       'epic',
    cost:         { crystal_shard: 1, Gold: 50, Crystals_Frost: 25 },
    item_cost:    { iron_shield: 1, cold_resistance_potion: 1 },
  },
  aegis_of_the_first_ward: {
    key:          'aegis_of_the_first_ward',
    name:         'Aegis of the First Ward',
    name_ru:      'Эгида Первого Оберега',
    faction:      'empire',
    tag_required: 'Knight',
    adds_tag:     null,
    stat_mods:    { fire_resist: 8, death_resist: 8 },
    passive:      'radiance 1',
    icon:         'aegis_of_the_first_ward',
    rarity:       'mythic',
    unique:       true,
    cost:         { vial_of_pure_blood: 3, crystal_shard: 3, Crystals_Life: 40 },
    item_cost:    { iron_shield: 1, death_resistance_potion: 1, fire_resistance_potion: 1, veterans_medal: 1 },
  },
  might_of_the_pure: {
    key:          'might_of_the_pure',
    name:         'Might Of The Pure',
    name_ru:      'Мощь Непорочных',
    faction:      'empire',
    tag_required: 'Knight',
    adds_tag:     null,
    stat_mods:    { action_power: 5, death_resist: 5 },
    passive:      'iron_will 2',
    icon:         'might_of_the_pure',
    rarity:       'mythic',
    unique:       true,
    cost:         { shard_of_might: 10, vial_of_pure_blood: 2, Gold: 150, Crystals_Life: 25, Crystals_Death: 25 },
    item_cost:    { death_resistance_potion: 2, mace: 1, seal_of_power: 1}
  },
  sanctified_bulwark: {
    key:          'sanctified_bulwark',
    name:         'Sanctified Bulwark',
    name_ru:      'Освящённый Оплот',
    faction:      'empire',
    tag_required: 'Knight',
    adds_tag:     'Holy',
    stat_mods:    { hp: 2, armor: 5 },
    passive:      'inspiration_damage 1',
    icon:         'sanctified_bulwark',
    rarity:       'epic',
    unique:       true,
    cost:         { aggrails_signet: 2  },
    item_cost:    { iron_armor: 1, codex_militarum: 1 },
  },
  sanctified_guardian: {
    key:          'sanctified_guardian',
    name:         'Sanctified Guardian',
    name_ru:      'Освящённый Страж',
    faction:      'empire',
    tag_required: 'Knight',
    adds_tag:     'Holy',
    stat_mods:    { hp: 2, armor: 5 },
    passive:      'protector 1',
    icon:         'sanctified_guardian',
    rarity:       'epic',
    unique:       true,
    cost:         { aggrails_signet: 2, Gold: 90, Crystals_Life: 25 },
    item_cost:    { iron_shield: 1 },
  },
  knights_oath: {
    key:          'knights_oath',
    name:         'Knights Oath',
    name_ru:      'Обет Рыцарства',
    faction:      'empire',
    tag_required:  null,
    adds_tag:     'Knight',
    stat_mods:    { hp: 2, armor: 5 },
    passive:      'iron_will 1',
    icon:         'knights_oath',
    rarity:       'epic',
    unique:       true,
    cost:         { aggrails_signet: 2, Gold: 90, Crystals_Life: 25 },
    item_cost:    { codex_aeternum: 1 },
  },
  iron_shield: {
    key:          'iron_shield',
    name:         'Iron Shield',
    name_ru:      'Железный Щит',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { armor: 5 },
    passive:      'protector 1',
    icon:         'iron_shield',
    rarity:       'rare',
    cost:         { aggrails_signet: 2, Gold: 90, Crystals_Life: 25 },
  },
  codex_aeternum: {
    key:          'codex_aeternum',
    name:         'Codex Aeternum',
    name_ru:      'Кодекс Вечности',
    faction:      'empire',
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { hp: 2, armor: 3 },
    passive:      'inspiration_max_hp 1',
    icon:         'codex_aeternum',
    rarity:       'rare',
    cost:         { Gold: 50, Crystals_Life: 25 },
    item_cost:    { padded_armor: 1 },
  },
  codex_militarum: {
    key:          'codex_militarum',
    name:         'Codex Militarum',
    name_ru:      'Кодекс Воинства',
    faction:      'empire',
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { action_power: 3 },
    passive:      'inspiration_damage 1',
    icon:         'codex_militarum',
    rarity:       'rare',
    cost:         { Gold: 90, Crystals_Life: 25 },
  },
  court_regalia: {
    key:          'court_regalia',
    name:         'Court Regalia',
    name_ru:      'Придворные Регалии',
    faction:      'choir_of_the_cursed',
    tag_required: 'Court',
    adds_tag:     null,
    stat_mods:    { hp: 7 },
    passive:      null,
    icon:         'court_regalia',
    rarity:       'rare',
    cost:         { vial_of_pure_blood: 1, Gold: 50 },
    item_cost:    { life_charm: 2},
  },
  dragon_skin: {
    key:          'dragon_skin',
    name:         'Dragon Skin',
    name_ru:      'Драконья Кожа',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { armor: 2, hp: 4, fire_resist: 8 },
    passive:      'volcanic_skin 1',
    icon:         'dragon_skin',
    rarity:       'mythic',
    unique:       true,
    cost:         { crystal_dust: 3, Gold: 75, Crystals_Fire: 25 },
    item_cost:    { iron_armor: 1, fire_resistance_potion: 1, dragon_scale: 3 },
  },
  aldras_devotion: {
    key:          'aldras_devotion',
    name:         "Aldra's Devotion",
    name_ru:      'Преданность Алдры',
    faction:      null,
    tag_required: null,
    adds_tag:     'demon',
    stat_mods:    { armor: 3, hp: 3, death_resist: 5},
    passive:      'fortify 1',
    icon:         'aldras_devotion',
    rarity:       'mythic',
    unique:       true,
    cost:         { shard_of_devotion: 10, Gold: 75, Crystals_Life: 40, Crystals_Death: 35 },
    item_cost:    { iron_armor: 1, death_resistance_potion: 2 },
  },
  shroud_of_the_fallen: {
    key:          'shroud_of_the_fallen',
    name:         'Shroud of the Fallen',
    name_ru:      'Саван Павших',
    faction:      'grail_of_sorrow',
    tag_required: 'Vampire',
    adds_tag:     'Zombie',
    blocked_tags: ['Holy'],         
    stat_mods:    { hp: 3, armor: 3 },
    passive:      'horde 1',
    icon:         'shroud_of_the_fallen',
    rarity:       'epic',
    unique:       true,
    cost:         { grave_dust: 2, Gold: 50, Crystals_Death: 20 },
    item_cost:    { iron_armor: 1, mothers_gift: 1 },
  },
  mothers_gift: {
    key:          'mothers_gift',
    name:         "Mother's Gift",
    name_ru:      'Дар Матери',
    faction:      'grail_of_sorrow',
    tag_required: 'Vampire',
    adds_tag:     null,
    stat_mods:    { hp: 4 },
    passive:      null,
    icon:         'mothers_gift',
    rarity:       'common',
    cost:         { Gold: 30, Crystals_Death: 10 },
    requires:     { region: 'any', level: 1 },
  },
  padded_armor: {
    key:          'padded_armor',
    name:         "Padded Armor",
    name_ru:      'Стёганый Доспех',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { hp: 2, armor: 2 },
    passive:      null,
    icon:         'padded_armor',
    rarity:       'common',
    cost:         { Gold: 50 },
  },
  iron_armor: {
    key:          'iron_armor',
    name:         "Iron Armor",
    name_ru:      'Железный Доспех',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { armor: 3, hp: 4 },
    passive:      null,
    icon:         'iron_armor',
    rarity:       'rare',
    cost:         { Gold: 40, Crystals_Frost: 15, Crystals_Fire: 15 },
    item_cost:    { padded_armor: 1 },
  },
  rimeheart: {
    key:          'rimeheart',
    name:         "Rime Heart",
    name_ru:      'Сердце Зимы',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { armor: 3, hp: 2, cold_resist: 5 },
    passive:      'rimeguard 1',
    icon:         'rimeheart',
    rarity:       'epic',
    cost:         { Gold: 50, Crystals_Frost: 25 },
    item_cost:    { iron_armor: 1, cold_resistance_potion: 1 },
  },
  everliving_stalk: {
    key:          'everliving_stalk',
    name:         "Everliving Stalk",
    name_ru:      'Стебель Вечноживника',
    faction:      null,
    tag_required: null,
    adds_tag:     'Treefolk',
    stat_mods:    {hp: 5},
    passive:      'regenerate 1',
    icon:         'everliving_stalk',
    rarity:       'epic',
    cost:         { Gold: 100, Crystals_Life: 20, Crystals_Death: 20, Crystals_Nature: 20, Crystals_Air: 20, Crystals_Fire: 20 },
  },
  fire_resistance_potion: {
    key:          'fire_resistance_potion',
    name:         "Fire Resistance Potion",
    name_ru:      'Зелье Огнестойкости',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { fire_resist: 5 },
    passive:      null,
    icon:         'fire_resistance_potion',
    rarity:       'common',
    cost:         { Gold: 30, Crystals_Fire: 10 },
    requires:     { region: 'any', level: 1 },
  },
  orb_of_fire: {
    key:          'orb_of_fire',
    name:         "Orb Of Fire",
    name_ru:      'Сфера Пламени',
    faction:      null,
    tag_required: 'Caster',
    adds_tag:     null,
    stat_mods:    { fire_resist: 5 },
    passive:      'burn 1',
    icon:         'orb_of_fire',
    rarity:       'rare',
    cost:         { Gold: 50, Crystals_Fire: 25 },
    item_cost:    { fire_resistance_potion: 1 },
  },
  fire_staff: {
    key:          'fire_staff',
    name:         "Fire Staff",
    name_ru:      'Посох Пламени',
    faction:      null,
    tag_required: 'Caster',
    adds_tag:     null,
    stat_mods:    { fire_resist: 10 },
    passive:      'burn 2',
    icon:         'fire_staff',
    rarity:       'epic',
    cost:         { Gold: 50, Crystals_Fire: 25, aggrails_signet: 1 },
    item_cost:    { fire_resistance_potion: 1, orb_of_fire: 1 },
  },
  burning_tyrant: {
    key:          'burning_tyrant',
    name:         "Burning Tyrant",
    name_ru:      'Пылающий Тиран',
    faction:      'choir_of_the_cursed',
    tag_required: 'Caster',
    adds_tag:     null,
    stat_mods:    { fire_resist: 7, hp: 2, action_power: 2, armor: 2 },
    passive:      'burn 2',
    icon:         'burning_tyrant',
    rarity:       'mythic',
    unique:       true,
    cost:         { aggrails_signet: 2, grave_dust: 2 },
    item_cost:    { fire_staff: 1, orb_of_fire: 1, dragon_scale: 1 },
  },
  dragon_scale: {
    key:          'dragon_scale',
    name:         "Dragon Scale",
    name_ru:      'Драконья Чешуя',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { hp: 1, action_power: 1, armor: 1 },
    passive:      null,
    icon:         'dragon_scale',
    rarity:       'common',
    cost:         { Gold: 20, Crystals_Fire: 15 },
  },
  frost_cloak: {
    key:          'frost_cloak',
    name:         "Cold Resistance Potion",
    name_ru:      'Зелье Защиты От Холода',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { cold_resist: 5 },
    passive:      'resist_aura_cold 2',
    icon:         'frost_cloak',
    rarity:       'rare',
    unique:       true,
    cost:         { Gold: 30, Crystals_Frost: 10 },
    requires:     { region: 'any', level: 2 },
    item_cost:    {cold_resistance_potion: 2}
  },
  death_resistance_potion: {
    key:          'death_resistance_potion',
    name:         "Death Resistance Potion",
    name_ru:      'Зелье Защиты От Смерти',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { death_resist: 5 },
    passive:      null,
    icon:         'death_resistance_potion',
    rarity:       'common',
    cost:         { Gold: 30, Crystals_Death: 10 },
  },
  cold_resistance_potion: {
    key:          'cold_resistance_potion',
    name:         "Cold Resistance Potion",
    name_ru:      'Зелье Защиты От Холода',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { cold_resist: 5 },
    passive:      null,
    icon:         'cold_resistance_potion',
    rarity:       'common',
    cost:         { Gold: 30, Crystals_Frost: 10 },
    requires:     { region: 'any', level: 1 },
  },
  life_resistance_potion: {
    key:          'life_resistance_potion',
    name:         "Life Resistance Potion",
    name_ru:      'Зелье Защиты От Жизни',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { life_resist: 5 },
    passive:      null,
    icon:         'life_resistance_potion',
    rarity:       'common',
    cost:         { Gold: 30, Crystals_Life: 10 },
    requires:     { region: 'any', level: 1 },
  },
  nature_resistance_potion: {
    key:          'nature_resistance_potion',
    name:         "Nature Resistance Potion",
    name_ru:      'Зелье Защиты От Природы',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { nature_resist: 5 },
    passive:      null,
    icon:         'nature_resistance_potion',
    rarity:       'common',
    cost:         { Gold: 30, Crystals_Nature: 10 },
    requires:     { region: 'any', level: 1 },
  },
  air_resistance_potion: {
    key:          'air_resistance_potion',
    name:         "Air Resistance Potion",
    name_ru:      'Зелье Защиты От Воздуха',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { air_resist: 5 },
    passive:      null,
    icon:         'air_resistance_potion',
    rarity:       'common',
    cost:         { Gold: 30, Crystals_Air: 10 },
    // Resistance is a lesson you learn by losing to an element, not a day-one buy.
    requires:     { region: 'any', level: 1 },
  },
  crude_sword: {
    key:          'crude_sword',
    name:         "Crude Sword",
    name_ru:      'Грубый Меч',
    faction:      null,
    tag_required: null,
    requires_action: 'damage',      // a blade is dead weight on a unit that never strikes
    adds_tag:     null,
    stat_mods:    { action_power: 1, initiative: 1 },
    passive:      null,
    icon:         'crude_sword',
    rarity:       'common',
    cost:         { Gold: 25, Crystals_Death: 5, Crystals_Fire: 5 },
  },
  iron_sword: {
    key:          'iron_sword',
    name:         "Iron Sword",
    name_ru:      'Железный Меч',
    faction:      null,
    tag_required: null,
    requires_action: 'damage',
    adds_tag:     null,
    stat_mods:    { action_power: 3, initiative: 2 },
    passive:      null,
    icon:         'iron_sword',
    rarity:       'rare',
    cost:         { Gold: 40, Crystals_Fire: 15, Crystals_Nature: 15 },
    item_cost:    { crude_sword: 1 },
  },
  crystal_sword: {
    key:          'crystal_sword',
    name:         "Crystal Sword",
    name_ru:      'Кристальный Меч',
    faction:      null,
    tag_required: null,
    requires_action: 'damage',
    adds_tag:     null,
    stat_mods:    { action_power: 3, initiative: 2 },
    passive:      'chill 2',
    icon:         'crystal_sword',
    rarity:       'epic',
    unique:       true,
    cost:         { crystal_shard: 1, Gold: 75, Crystals_Air: 20, Crystals_Frost: 20 },
    item_cost:    { iron_sword: 1 },
  },
  forbidden_vow: {
    key:          'forbidden_vow',
    name:         "Forbidden Vow",
    name_ru:      'Запретная Клятва',
    faction:      null,
    tag_required: 'Skeleton',
    adds_tag:     null,
    stat_mods:    { action_power: 2, initiative: 3 },
    passive:      'infect 2',
    blocked_tags: ['Holy'],         // a vow of undeath on a holy unit is incoherent
    icon:         'forbidden_vow',
    rarity:       'epic',
    unique:       true,
    cost:         { grave_dust: 2, Gold: 50, Crystals_Air: 15, Crystals_Frost: 15 },
    item_cost:    { iron_sword: 1, poisonous_dagger: 1 },
  },
  burning_fury: {
    key:          'burning_fury',
    name:         "Burning Fury",
    name_ru:      'Пылающая Ярость',
    faction:      null,
    tag_required: 'Demon',
    adds_tag:     null,
    stat_mods:    { action_power: 4 },
    passive:      'rage 1',
    icon:         'burning_fury',
    rarity:       'epic',
    unique:       true,
    cost:         { Gold: 90, Crystals_Air: 15, Crystals_Frost: 15 },
    item_cost:    { iron_sword: 1 },
  },
  mace: {
    key:          'mace',
    name:         "Mace",
    name_ru:      'Булава',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    null,
    passive:      'shatter 1',
    icon:         'mace',
    rarity:       'common',
    unique:       true,
    cost:         { Gold: 30, Crystals_Death: 5, Crystals_Air: 5 },
  },
  morning_star: {
    key:          'morning_star',
    name:         "Morning Star",
    name_ru:      'Утренняя Здвезда',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { action_power: 3 },
    passive:      'shatter 1',
    icon:         'morning_star',
    rarity:       'rare',
    unique:       true,
    cost:         { shard_of_devotion: 1, Gold: 40, Crystals_Death: 15, Crystals_Nature: 15 },
    item_cost:    {mace: 1},
  },
  seal_of_power: {
    key:          'seal_of_power',
    name:         "Seal Of Power",
    name_ru:      'Печать Силы',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { action_power: 2 },
    passive:      null,
    icon:         'seal_of_power',
    rarity:       'common',
    cost:         { Gold: 50 },
  },
  lion_signet: {
    key:          'lion_signet',
    name:         "Lion Signet",
    name_ru:      'Львиный Перстень',
    faction:      'empire',
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { action_power: 3, hp: 3 },
    passive:      null,
    icon:         'lion_signet',
    rarity:       'rare',
    cost:         { aggrails_signet: 1, Gold: 25, Crystals_Life: 10 },
    item_cost:    { seal_of_power: 1, life_charm: 1 },
  },
  life_charm: {
    key:          'life_charm',
    name:         "Life Charm",
    name_ru:      'Кулон Жизни',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { hp: 3 },
    passive:      null,
    icon:         'life_charm',
    rarity:       'common',
    cost:         { Gold: 10, Crystals_Life: 10, Crystals_Death: 10 },
  },
  orb_of_pure_blood: {
    key:          'orb_of_pure_blood',
    name:         "Orb Of Pure Blood",
    name_ru:      'Сфера Чистой Крови',
    faction:      null,
    tag_required: 'Caster',
    adds_tag:     null,
    stat_mods:    { hp: 4 },
    passive:      'bleed 1',
    icon:         'orb_of_pure_blood',
    rarity:       'rare',
    cost:         { vial_of_pure_blood: 1, Crystals_Death: 25 },
    item_cost:    { seal_of_power: 1, life_charm: 1 },
  },
  staff_of_thaumaturgy: {
    key:          'staff_of_thaumaturgy',
    name:         "Staff Of Thaumaturgy",
    name_ru:      'Посох Тауматургии',
    faction:      'grail_of_sorrow',
    tag_required: 'Caster',
    adds_tag:     'Vampire',
    stat_mods:    { action_power: 4, hp: 4 },
    passive:      'bleed 2',
    icon:         'staff_of_thaumaturgy',
    rarity:       'mythic',
    unique:       true,
    cost:         { vial_of_pure_blood: 4, Gold: 125 },
    item_cost:    { seal_of_power: 1, orb_of_pure_blood: 2 },
  },
  grovekeeper_staff: {
    key:          'grovekeeper_staff',
    name:         "Grovekeeper's Staff",
    name_ru:      "Посох Хранителя Рощи",
    faction:      null,
    tag_required: null,
    adds_tag:     'Treefolk',
    stat_mods:    { action_power: 2, nature_resist: 3 },
    passive:      null,
    icon:         'grovekeeper_staff',
    rarity:       'rare',
    unique:       true,
    cost:         { vial_of_pure_blood: 1, Gold: 40, Crystals_Nature: 25 },
    item_cost:    { seal_of_power: 1 },
  },
  poisonous_dagger: {
    key:          'poisonous_dagger',
    name:         "Poisonous Dagger",
    name_ru:      'Ядовитый Кинжал',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    null,
    passive:      'poison 1',
    icon:         'poisonous_dagger',
    rarity:       'common',
    cost:         { Gold: 30, Crystals_Nature: 10  },
  },
  frost_lance: {
    key:          'frost_lance',
    name:         "Frost Lance",
    name_ru:      'Морозная Пика',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { action_power: 2 },
    passive:      'chill 1',
    icon:         'frost_lance',
    rarity:       'rare',
    cost:         { crystal_dust: 1, Gold: 25, Crystals_Frost: 25 },
    item_cost:    { seal_of_power: 1 },
  },
  bone_barrier: {
    key:          'bone_barrier',
    name:         "Bone Barrier",
    name_ru:      'Костяной Барьер',
    faction:      null,
    tag_required: null,
    adds_tag:     'Skeleton',
    stat_mods:    { hp: 3, armor: 5 },
    passive:      'undying 1',
    icon:         'bone_barrier',
    rarity:       'epic',
    unique:       true,
    cost:         { grave_dust: 2, shard_of_might: 1, shard_of_devotion: 1, Gold: 125 },
    item_cost:    { iron_armor: 1 },
  },
  veil_of_discord: {
    key:          'veil_of_discord',
    name:         "Veil Of Discord",
    name_ru:      'Покров Раздора',
    faction:      'grail_of_sorrow',
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { cold_resist: 5, air_resist: 5 },
    passive:      'resist_aura_life 1',
    icon:         'veil_of_discord',
    rarity:       'epic',
    unique:       true,
    cost:         { grave_dust: 2, Gold: 90 },
    item_cost:    { cold_resistance_potion: 1, air_resistance_potion: 1, life_resistance_potion: 2 },
  },
  cloak_of_evasion: {
    key:          'cloak_of_evasion',
    name:         "Cloak Of Evasion",
    name_ru:      'Плащ Уклонения',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    null,
    passive:      'dodge 1',
    icon:         'cloak_of_evasion',
    rarity:       'common',
    cost:         { Gold: 10, Crystals_Air: 10, Crystals_Nature: 10  },
  },
  travelers_bedroll: {
    key:          'travelers_bedroll',
    name:         "Traveler's Bedroll",
    name_ru:      'Походная Скатка',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    {hp: 3},
    passive:      'field_medic 1',
    icon:         'travelers_bedroll',
    rarity:       'rare',
    unique:       true,
    cost:         { Gold: 100, Crystals_Life: 15, Crystals_Frost: 10 },
  },
  veterans_medal: {
    key:          'veterans_medal',
    name:         "Veteran's Medal",
    name_ru:      'Медаль Ветерана',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    {hp: 3},
    passive:      'combat_veteran 1',
    icon:         'veterans_medal',
    rarity:       'rare',
    unique:       true,
    cost:         { Gold: 100, Crystals_Fire: 15, Crystals_Air: 10 },
  },
  shackle_of_servitude: {
    key:          'shackle_of_servitude',
    name:         'Shackle of Servitude',
    name_ru:      'Оковы Служения',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    {hp: 3},
    passive:      'unending_servitude 1',
    icon:         'shackle_of_servitude',
    rarity:       'rare',
    unique:       true,
    cost:         { Gold: 100, Crystals_Death: 15, Crystals_Life: 10 },
  },
  scavengers_satchel: {
    key:          'scavengers_satchel',
    name:         "Scavenger's Satchel",
    name_ru:      'Сумка Мародёра',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    {hp: 3},
    passive:      'scavenger 1',
    icon:         'scavengers_satchel',
    rarity:       'rare',
    unique:       true,
    cost:         { Gold: 100, Crystals_Nature: 15, Crystals_Fire: 10 },
  },
  attuned_focus: {
    key:          'attuned_focus',
    name:         'Attuned Focus',
    name_ru:      'Настроенный Фокус',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    {hp: 3},
    passive:      'magic_attunement 1',
    icon:         'attuned_focus',
    rarity:       'rare',
    unique:       true,
    cost:         { Gold: 100, Crystals_Air: 15, Crystals_Frost: 10 },
  },
  striders: {
    key:          'striders',
    name:         'Travellers Boots',
    name_ru:      'Сапоги Путешественника',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { initiative: 3},
    passive:      null,
    icon:         'striders',
    rarity:       'common',
    cost:         { Gold: 20, Crystals_Air: 15 },
  },
  ranger_boots: {
    key:          'ranger_boots',
    name:         'Ranger Boots',
    name_ru:      'Сапоги Рейнджера',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { initiative: 5},
    passive:      null,
    icon:         'ranger_boots',
    rarity:       'rare',
    unique:       true,
    unique:       true,
    cost:         { Gold: 75, Crystals_Nature: 15 },
    item_cost:    { striders: 1}
  },
  dragon_step: {
    key:          'dragon_step',
    name:         'Ranger Boots',
    name_ru:      'Сапоги Рейнджера',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { initiative: 6, hp: 2},
    passive:      null,
    icon:         'dragon_step',
    rarity:       'epic',
    unique:       true,
    unique:       true,
    cost:         { Gold: 100, Crystals_Nature: 15, Crystals_Fire: 15, Crystals_Life: 15 },
    item_cost:    { ranger_boots: 1, dragon_scale: 1}
  },
  glimmering_steps: {
    key:          'glimmering_steps',
    name:         'Glimmering Steps',
    name_ru:      'Мерцающая Поступь',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { initiative: 6, hp: 2},
    passive:      'resist_aura_air 1',
    icon:         'glimmering_steps',
    rarity:       'epic',
    unique:       true,
    unique:       true,
    cost:         { Gold: 50, Crystals_Nature: 15, Crystals_Fire: 15, Crystals_Life: 15 },
    item_cost:    { dragon_step: 1, dragon_scale: 1}
  },
  iron_greaves: {
    key:          'iron_greaves',
    name:         'Iron Greaves',
    name_ru:      'Железные Поножи',
    faction:      null,
    tag_required: null,
    adds_tag:     null,
    stat_mods:    { initiative: 3, armor: 3},
    passive:      null,
    icon:         'iron_greaves',
    rarity:       'rare',
    unique:       true,
    unique:       true,
    cost:         { Gold: 50, Crystals_Nature: 15, Crystals_Life: 15 },
    item_cost:    { striders: 1}
  },
};

// ── Craft gating ─────────────────────────────────────────────────────────────
// Not every blueprint should be makeable on day one. A craft can require that
// the player has CLEARED a given level of a given embark region.
//
// Declare it on the item as `requires`:
//
//   requires: { region: 'crimson_basilica', level: 3 }   // one condition
//   requires: { region: 'any',              level: 2 }   // any single region
//   requires: [                                          // ANY of these (OR)
//     { region: 'crimson_basilica', level: 3 },
//     { region: 'glittering_abyss', level: 5 },
//   ]
//
// `level: 3` means "level 3 of that region has been beaten". Regions run 1..6.
// `requires: null` on an item forces it ungated regardless of the rarity default
// below. Omit the field entirely and the rarity default applies.
//
// Both the roster catalog and POST /items/craft call meetsCraftRequirements(),
// so the Craft button and the server can never disagree. The server is the
// authority; the client uses it to disable the button and say what is missing.
const CRAFT_REGION_LABELS = {
  crimson_basilica:  { en: 'Crimson Basilica',  ru: 'Багровая базилика' },
  glittering_abyss:  { en: 'Glittering Abyss',  ru: 'Мерцающая бездна' },
  chamber_of_unrest: { en: 'Chamber of Unrest', ru: 'Чертог беспокойства' },
};

// The default gate for an item that declares no `requires` of its own. Tuning
// these four lines re-gates the whole catalog at once; a per-item `requires`
// always wins over them. Commons stay open so a new player has a starting kit.
const CRAFT_GATE_BY_RARITY = {
  common: null,
  rare:   { region: 'any', level: 2 },
  epic:   { region: 'any', level: 4 },
  mythic: { region: 'any', level: 6 },
};

// Normalises whatever an item declared into a flat list of {region, level}.
// An empty list means "craftable from the start".
function craftRequirements(itemDef) {
  if (!itemDef) return [];
  const raw = Object.prototype.hasOwnProperty.call(itemDef, 'requires')
    ? itemDef.requires
    : CRAFT_GATE_BY_RARITY[itemDef.rarity];
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw])
    .filter(r => r && r.region && Number(r.level) > 0)
    .map(r => ({ region: r.region, level: Number(r.level) }));
}

// `progress` is the player's { region_id: next_playable_level } map — beating
// level N writes N+1 (see POST /battle/complete), and a region never played is
// absent, which reads as level 1 playable / nothing cleared.
function clearedLevel(progress, regionId) {
  return Math.max(0, Number(progress?.[regionId] ?? 1) - 1);
}

function meetsCraftRequirements(itemDef, progress) {
  const reqs = craftRequirements(itemDef);
  if (!reqs.length) return true;
  // Any single satisfied condition unlocks the craft.
  return reqs.some(r => r.region === 'any'
    ? Object.keys(CRAFT_REGION_LABELS).some(id => clearedLevel(progress, id) >= r.level)
    : clearedLevel(progress, r.region) >= r.level);
}

// One line for the card and the server's error: "Requires Crimson Basilica lv. 3
// or Glittering Abyss lv. 5". Empty string when the item is ungated.
function craftRequirementText(itemDef, lang = 'en') {
  const reqs = craftRequirements(itemDef);
  if (!reqs.length) return '';
  const L = lang === 'ru' ? 'ru' : 'en';
  const anyLabel = L === 'ru' ? 'любой регион' : 'any region';
  const parts = reqs.map(r => {
    const label = r.region === 'any' ? anyLabel : (CRAFT_REGION_LABELS[r.region]?.[L] || r.region);
    return L === 'ru' ? `${label}, ур. ${r.level}` : `${label} lv. ${r.level}`;
  });
  const joined = parts.join(L === 'ru' ? ' или ' : ' or ');
  return L === 'ru' ? `Требуется пройти: ${joined}` : `Requires clearing ${joined}`;
}

// Applies every modifier an item grants (hp, armor, action_power, initiative,
// resistances, added tag, granted passive) on top of a unit_data object.
//
// This is the SINGLE place item stats are applied. Equipping only records that
// the item is worn (items.equipped_by); nothing is ever baked into the roster
// row. Roster, battle-prep and the battle engine all derive stats by running a
// unit through here, so a unit's stats are always base + currently-worn item.
//
// `max_hp` and `hp` both get the bonus so this works for roster rows (max_hp)
// and raw unit defs (hp). `current_hp` is real damage carried between battles,
// so it is never inflated — only clamped so it can't exceed the new maximum.
function applyItemModifiers(unitData, itemStats) {
  if (!itemStats) return unitData;

  const tags = Array.isArray(unitData.tags) ? [...unitData.tags] : [];
  if (itemStats.adds_tag && !tags.includes(itemStats.adds_tag)) tags.push(itemStats.adds_tag);

  const resistances = { ...(unitData.resistances || {}) };
  const mods  = itemStats.stat_mods || {};
  let   armor        = unitData.armor        ?? 0;
  let   action_power = unitData.action_power ?? 0;
  let   initiative   = unitData.initiative   ?? 0;
  let   hpBonus      = 0;

  for (const [statKey, val] of Object.entries(mods)) {
    if (statKey === 'hp')           { hpBonus      += val; continue; }
    if (statKey === 'armor')        { armor        += val; continue; }
    if (statKey === 'action_power') { action_power += val; continue; }
    if (statKey === 'initiative')   { initiative   += val; continue; }
    const resistMatch = statKey.match(/^(air|fire|nature|cold|life|death)_resist$/);
    if (resistMatch) {
      const resType = resistMatch[1];
      resistances[resType] = (resistances[resType] || 0) + val;
    }
  }

  // The unit's OWN passives, before the item's is folded in. A unit can carry up
  // to three natively and an item can add a fourth — the ability row only has
  // three slots, and the item's passive belongs to the item, shown on the item.
  const nativePassive = unitData.native_passive ?? unitData.passive;

  let passive = unitData.passive;
  if (itemStats.passive) {
    if (Array.isArray(passive)) passive = [...passive, itemStats.passive];
    else if (passive)           passive = [passive, itemStats.passive];
    else                        passive = itemStats.passive;
  }

  const out = { ...unitData, tags, armor, action_power, initiative, resistances, passive, native_passive: nativePassive };
  if (hpBonus) {
    if (typeof out.max_hp === 'number') out.max_hp = out.max_hp + hpBonus;
    if (typeof out.hp     === 'number') out.hp     = out.hp     + hpBonus;
    // The bonus is extra HP the unit actually gains, so current_hp rises with it
    // (a full unit stays full instead of entering battle already wounded), then
    // clamps to the new max. Derivation always runs from the stored BASE current_hp,
    // so this stays idempotent — re-deriving never stacks the bonus.
    if (typeof out.current_hp === 'number' && typeof out.max_hp === 'number') {
      out.current_hp = Math.min(out.current_hp + hpBonus, out.max_hp);
    }
  }
  return out;
}

export {
  ITEM_DEFS, applyItemModifiers,
  CRAFT_REGION_LABELS, CRAFT_GATE_BY_RARITY,
  craftRequirements, meetsCraftRequirements, craftRequirementText,
};
if (typeof module !== 'undefined') module.exports = {
  ITEM_DEFS, applyItemModifiers,
  CRAFT_REGION_LABELS, CRAFT_GATE_BY_RARITY,
  craftRequirements, meetsCraftRequirements, craftRequirementText,
};