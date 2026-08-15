// Spells are grouped by CATEGORY (which drives the Spell Tome tabs) and gated by
// TIER (which is the throne level required to research them).
//
//   category: 'non_combat' | 'buff' | 'debuff' | 'special'
//   tier:     1 = throne 1, 2 = throne 2, ...
//
// ── Two currencies, two moments ────────────────────────────────────────────
// CRYSTALS are paid ONCE, to research a spell (POST /spells/research). They are
// never spent again. POWER — Lion's Fury for the Empire, Chord of Hate for the
// Choir, Mother's Tear for the Grail — is the per-cast cost, earned during the
// battle itself: the hero gains 1 每 action it takes, to a maximum of 5, and
// generation stops when the hero dies. Casting IS the hero's action, so every
// cast is paid for twice over: once in power, once in the attack not made.
//
// This replaced a system where a spell cost 10-30 crystals per cast, could only
// be chosen before the fight started, and only one could be used per battle.
// Players learned resurrect and heal — 3 crystals, roster-only, guaranteed
// value — and nothing else, because every combat spell was a blind bet at ten
// times the price.
//
// ── Scaling ────────────────────────────────────────────────────────────────
// A combat spell has `power_cost` (the minimum, always 1) and scales with every
// point spent above it. `scaling` names the params that grow and by how much
// per extra point; `max_power_bonus` is what changes only at a full 5-power
// cast, which is how a duration step is expressed. So one spell covers what
// used to be three tiered near-duplicates:
//
//   Holy Aegis at 1 power -> +15 armor, 2 rounds
//   Holy Aegis at 5 power -> +35 armor, 3 rounds
//
// Non-combat spells (resurrect / heal) are unchanged: roster-only, crystal
// cost at point of use, never castable in battle. They are the repair kit
// between fights, not part of the combat economy.
const SPELLS = {
  empire: [
    {
      id: 'e_spell_1',
      name: 'Revival Prayer',
      name_ru: 'Молитва воскрешения',
      category: 'non_combat',
      tier: 1,
      type: 'roster',
      description: 'Resurrect one fallen ally at 1 HP.',
      description_ru: 'Воскрешает одного павшего союзника с 1 HP.',
      cost: { crystals: { Crystals_Life: 3 } },
      effect_type: 'resurrect',
      class: 'utility',
      usage: 'roster',
      target_scope: 'single_ally',
      params: { resurrect: true }
    },
    {
      id: 'e_spell_2',
      name: 'Divine Mending',
      name_ru: 'Божественное исцеление',
      category: 'non_combat',
      tier: 1,
      type: 'roster',
      description: 'Restore one wounded ally to half their maximum HP.',
      description_ru: 'Восстанавливает одному раненому союзнику половину максимального здоровья.',
      cost: { crystals: { Crystals_Life: 3 } },
      effect_type: 'heal',
      class: 'boon',
      usage: 'roster',
      target_scope: 'single_ally',
      params: { heal_pct: 1 }
    },
    {
      id: 'e_spell_3',
      icon: 'holy_aegis',
      name: 'Holy Aegis',
      name_ru: 'Священная эгида',
      category: 'buff',
      tier: 2,
      type: 'combat',
      description: 'Bless one ally with divine protection: +15 armor for 2 rounds, +5 per extra power. At full power it lasts 3 rounds.',
      description_ru: 'Благословляет союзника: +15 брони на 2 раунда, +5 за каждую доп. силу. На полной силе — 3 раунда.',
      cost: { crystals: { Crystals_Life: 10 } },
      power_cost: 1,
      scaling: { armor_boost: 5 },
      max_power_bonus: { duration_rounds: 1 },
      effect_type: 'buff',
      class: 'boon',
      target_scope: 'single_ally',
      params: { armor_boost: 15, duration_rounds: 2 },
    },
    {
      id: 'e_spell_7',
      icon: 'martyrdom',
      name: 'Martyrdom',
      name_ru: 'Мученичество',
      category: 'buff',
      tier: 2,
      type: 'combat',
      description: 'One ally redirects 10% of the damage it takes to the rest of the line for 2 rounds, +5% per extra power. At full power it lasts 3 rounds.',
      description_ru: 'Союзник перенаправляет 10% получаемого урона на остальной строй на 2 раунда, +5% за доп. силу. На полной силе — 3 раунда.',
      cost: { crystals: { Crystals_Life: 10, Crystals_Frost: 5 } },
      power_cost: 1,
      scaling: { martyrdom_redirect_pct: 5 },
      max_power_bonus: { duration_rounds: 1 },
      effect_type: 'buff',
      class: 'boon',
      target_scope: 'single_ally',
      params: { martyrdom_redirect_pct: 10, duration_rounds: 2 },
    },
    {
      id: 'e_spell_8',
      icon: 'vow_of_protection',
      name: 'Vow of Protection',
      name_ru: 'Обет защиты',
      category: 'buff',
      tier: 3,
      type: 'combat',
      description: 'One ally guards the line: 25% chance to intercept blows aimed at its row, +5% per extra power, and +10 armor. 2 rounds.',
      description_ru: 'Союзник прикрывает строй: 25% шанс перехватить удар по своему ряду, +5% за доп. силу, и +10 брони. 2 раунда.',
      cost: { crystals: { Crystals_Life: 15, Crystals_Fire: 5 } },
      power_cost: 1,
      scaling: { intercept_chance_pct: 5 },
      effect_type: 'buff',
      class: 'boon',
      target_scope: 'single_ally',
      params: { intercept_chance_pct: 25, armor_boost: 10, duration_rounds: 2 },
    },
    {
      id: 'e_spell_9',
      icon: 'wrath_of_heaven',
      name: 'Wrath of Heaven',
      name_ru: 'Гнев небес',
      category: 'debuff',
      tier: 2,
      type: 'combat',
      // Was a round-3 delayed hit — which only made sense when the spell was
      // chosen before the battle began. Cast reactively, a nuke that lands two
      // rounds later is strictly worse than one that lands now.
      description: 'Light falls on the whole enemy line for 20 life damage, +6 per extra power.',
      description_ru: 'Свет обрушивается на весь вражеский строй: 20 урона жизнью, +6 за каждую доп. силу.',
      cost: { crystals: { Crystals_Life: 10, Crystals_Fire: 5 } },
      power_cost: 1,
      scaling: { damage_flat: 6 },
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { damage_flat: 20, damage_type: 'life' },
    },
    {
      id: 'e_spell_10',
      icon: 'condemn',
      name: 'Condemn',
      name_ru: 'Осуждение',
      category: 'debuff',
      tier: 3,
      type: 'combat',
      description: 'The enemy line is judged: −10 life resistance and −10 armor for 2 rounds, −5 more per extra power. At full power it lasts 3 rounds.',
      description_ru: 'Вражеский строй осуждён: −10 сопр. жизни и −10 брони на 2 раунда, ещё −5 за доп. силу. На полной силе — 3 раунда.',
      cost: { crystals: { Crystals_Life: 15, Crystals_Frost: 5 } },
      power_cost: 1,
      scaling: { armor_flat_reduction: 5, 'resist_reduction.life': 5 },
      max_power_bonus: { duration_rounds: 1 },
      effect_type: 'debuff',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { resist_reduction: { life: 10 }, armor_flat_reduction: 10, duration_rounds: 2 },
    },
    {
      id: 'e_spell_11',
      icon: 'purgation',
      name: 'Purgation',
      name_ru: 'Очищение',
      category: 'debuff',
      tier: 4,
      type: 'combat',
      // One blessing per point of power, on ONE enemy. Stripping the whole line
      // was the strongest effect in the game for a single cast.
      description: 'Tear the blessings off one enemy: 1 buff removed per power spent.',
      description_ru: 'Срывает благословения с одного врага: по 1 усилению за каждую потраченную силу.',
      cost: { crystals: { Crystals_Life: 20, Crystals_Fire: 5 } },
      power_cost: 1,
      scaling: { dispel_count: 1 },
      effect_type: 'dispel',
      class: 'enemy',
      target_scope: 'single_enemy',
      params: { dispel_polarity: 'positive', dispel_count: 1 },
    },
  ],

  choir_of_the_cursed: [
    {
      id: 'd_spell_1',
      name: 'Rite of Return',
      name_ru: 'Обряд возвращения',
      category: 'non_combat',
      tier: 1,
      type: 'roster',
      description: 'Resurrect one fallen ally at 1 HP.',
      description_ru: 'Воскрешает одного павшего союзника с 1 HP.',
      cost: { crystals: { Crystals_Fire: 3 } },
      effect_type: 'resurrect',
      class: 'utility',
      usage: 'roster',
      target_scope: 'single_ally',
      params: { resurrect: true }
    },
    {
      id: 'd_spell_2',
      name: 'Ember Mending',
      name_ru: 'Исцеление углями',
      category: 'non_combat',
      tier: 1,
      type: 'roster',
      description: 'Restore one wounded ally to half their maximum HP.',
      description_ru: 'Восстанавливает одному раненому союзнику половину максимального здоровья.',
      cost: { crystals: { Crystals_Fire: 3 } },
      effect_type: 'heal',
      class: 'boon',
      usage: 'roster',
      target_scope: 'single_ally',
      params: { heal_pct: 1 }
    },
    {
      id: 'd_spell_3',
      icon: 'song_of_frenzy',
      name: 'Song of Frenzy',
      name_ru: 'Песнь исступления',
      category: 'buff',
      tier: 2,
      type: 'combat',
      description: 'One ally sings itself into a fury: +15% damage for 2 rounds, +5% per extra power. At full power it lasts 3 rounds.',
      description_ru: 'Союзник впадает в исступление: +15% урона на 2 раунда, +5% за доп. силу. На полной силе — 3 раунда.',
      cost: { crystals: { Crystals_Fire: 10 } },
      power_cost: 1,
      scaling: { damage_boost_pct: 5 },
      max_power_bonus: { duration_rounds: 1 },
      effect_type: 'buff',
      class: 'boon',
      target_scope: 'single_ally',
      params: { damage_boost_pct: 15, duration_rounds: 2 },
    },
    {
      id: 'd_spell_9',
      icon: 'chorus_of_wrath',
      name: 'Chorus of Wrath',
      name_ru: 'Хор ярости',
      category: 'buff',
      tier: 3,
      type: 'combat',
      description: 'The whole choir takes up the verse: +8% damage to every ally for 2 rounds, +3% per extra power. At full power it lasts 3 rounds.',
      description_ru: 'Весь хор подхватывает: +8% урона каждому союзнику на 2 раунда, +3% за доп. силу. На полной силе — 3 раунда.',
      cost: { crystals: { Crystals_Fire: 20 } },
      power_cost: 1,
      scaling: { damage_boost_pct: 3 },
      max_power_bonus: { duration_rounds: 1 },
      effect_type: 'buff',
      class: 'boon',
      target_scope: 'all_allies',
      params: { damage_boost_pct: 8, duration_rounds: 2 },
    },
    {
      id: 'd_spell_5',
      icon: 'hymn_of_warding',
      name: 'Hymn of Warding',
      name_ru: 'Гимн оберега',
      category: 'buff',
      tier: 2,
      type: 'combat',
      description: 'One ally is warded against air and cold: +15 to both for 2 rounds, +5 per extra power.',
      description_ru: 'Союзник защищён от воздуха и холода: +15 к обоим на 2 раунда, +5 за доп. силу.',
      cost: { crystals: { Crystals_Fire: 15 } },
      power_cost: 1,
      scaling: { 'resistances.air': 5, 'resistances.cold': 5 },
      effect_type: 'buff',
      class: 'boon',
      target_scope: 'single_ally',
      params: { resistances: { air: 15, cold: 15 }, duration_rounds: 2 },
    },
    {
      id: 'd_spell_7',
      icon: 'song_of_weakness',
      name: 'Song of Weakness',
      name_ru: 'Песнь слабости',
      category: 'debuff',
      tier: 2,
      type: 'combat',
      description: 'The enemy line falters: −10% damage dealt for 1 round, −5% per extra power. At full power it lasts 2 rounds.',
      description_ru: 'Вражеский строй слабеет: −10% наносимого урона на 1 раунд, −5% за доп. силу. На полной силе — 2 раунда.',
      cost: { crystals: { Crystals_Fire: 10, Crystals_Frost: 5 } },
      power_cost: 1,
      scaling: { damage_dealt_reduction_pct: 5 },
      max_power_bonus: { duration_rounds: 1 },
      effect_type: 'debuff',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { damage_dealt_reduction_pct: 10, duration_rounds: 1 },
    },
    {
      id: 'd_spell_10',
      icon: 'pyre_requiem',
      name: 'Pyre Requiem',
      name_ru: 'Погребальный реквием',
      category: 'debuff',
      tier: 3,
      type: 'combat',
      description: 'Fire answers the verse: 15 fire damage to the whole enemy line, +6 per extra power.',
      description_ru: 'Огонь отвечает на песнь: 15 урона огнём всему вражескому строю, +6 за доп. силу.',
      cost: { crystals: { Crystals_Fire: 20, Crystals_Frost: 5 } },
      power_cost: 1,
      scaling: { damage_flat: 6 },
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { damage_flat: 15, damage_type: 'fire' },
    },
    {
      id: 'd_spell_11',
      icon: 'unsung',
      name: 'Unsung',
      name_ru: 'Неспетые',
      category: 'special',
      tier: 4,
      type: 'combat',
      // In a faction where everything is song, the punishment is being left out
      // of it: their passives go unsung.
      description: 'The enemy is left out of the verse: their passives fall silent for 1 round. At full power, 2 rounds.',
      description_ru: 'Врага не вписали в песнь: их пассивные умения молчат 1 раунд. На полной силе — 2 раунда.',
      cost: { crystals: { Crystals_Fire: 20, Crystals_Nature: 5 } },
      power_cost: 1,
      max_power_bonus: { lock_all_passives_rounds: 1 },
      effect_type: 'debuff',
      class: 'enemy',
      target_scope: 'none',
      params: { lock_all_passives_rounds: 1 },
    },
  ],

  grail_of_sorrow: [
    {
      id: 'g_spell_1',
      name: 'Mourning Rite',
      name_ru: 'Траурный обряд',
      category: 'non_combat',
      tier: 1,
      type: 'roster',
      description: 'Resurrect one fallen ally at 1 HP.',
      description_ru: 'Воскрешает одного павшего союзника с 1 HP.',
      cost: { crystals: { Crystals_Death: 3 } },
      effect_type: 'resurrect',
      class: 'utility',
      usage: 'roster',
      target_scope: 'single_ally',
      params: { resurrect: true }
    },
    {
      id: 'g_spell_2',
      name: "Mother's Mending",
      name_ru: 'Исцеление Матери',
      category: 'non_combat',
      tier: 1,
      type: 'roster',
      description: 'Restore one wounded ally to half their maximum HP.',
      description_ru: 'Восстанавливает одному раненому союзнику половину максимального здоровья.',
      cost: { crystals: { Crystals_Death: 3 } },
      effect_type: 'heal',
      class: 'boon',
      usage: 'roster',
      target_scope: 'single_ally',
      params: { heal_pct: 1 }
    },
    {
      id: 'g_spell_3',
      icon: 'sorrows_haste',
      name: "Sorrow's Haste",
      name_ru: 'Скорая скорбь',
      category: 'buff',
      tier: 2,
      type: 'combat',
      description: 'One ally moves ahead of its grief: +15 initiative for 2 rounds, +5 per extra power.',
      description_ru: 'Союзник опережает свою скорбь: +15 инициативы на 2 раунда, +5 за доп. силу.',
      cost: { crystals: { Crystals_Death: 10 } },
      power_cost: 1,
      scaling: { initiative_boost: 5 },
      effect_type: 'buff',
      class: 'boon',
      target_scope: 'single_ally',
      params: { initiative_boost: 15, duration_rounds: 2 },
    },
    {
      id: 'g_spell_10',
      icon: 'last_rites',
      name: 'Last Rites',
      name_ru: 'Последние обряды',
      category: 'buff',
      tier: 3,
      type: 'combat',
      description: 'The whole line is spoken over: +10 initiative to every ally for 2 rounds, +4 per extra power.',
      description_ru: 'Над всем строем читают отходную: +10 инициативы каждому союзнику на 2 раунда, +4 за доп. силу.',
      cost: { crystals: { Crystals_Death: 15, Crystals_Life: 5 } },
      power_cost: 1,
      scaling: { initiative_boost: 4 },
      effect_type: 'buff',
      class: 'boon',
      target_scope: 'all_allies',
      params: { initiative_boost: 10, duration_rounds: 2 },
    },
    {
      id: 'g_spell_5',
      icon: 'pall_of_sorrow',
      name: 'Pall of Sorrow',
      name_ru: 'Покров скорби',
      category: 'special',
      tier: 2,
      type: 'combat',
      // The drain fantasy in one cast: they are weakened, your own is veiled.
      // Replaces Dark Determination, whose Zombie-count buff only worked for one
      // army composition and did nothing at all for the rest.
      description: 'A shroud settles over one enemy — −10% damage dealt for 2 rounds, −5% per extra power — and your hero is veiled with an 8-point shield, +4 per extra power.',
      description_ru: 'Покров ложится на врага — −10% наносимого урона на 2 раунда, −5% за доп. силу — а вашего героя укрывает щит на 8 единиц, +4 за доп. силу.',
      cost: { crystals: { Crystals_Death: 10, Crystals_Fire: 5 } },
      power_cost: 1,
      scaling: { damage_dealt_reduction_pct: 5, shield_caster: 4 },
      effect_type: 'debuff',
      class: 'enemy',
      target_scope: 'single_enemy',
      params: { damage_dealt_reduction_pct: 10, duration_rounds: 2, shield_caster: 8 },
    },
    {
      id: 'g_spell_7',
      icon: 'sorrows_weight',
      name: "Sorrow's Weight",
      name_ru: 'Бремя скорби',
      category: 'debuff',
      tier: 2,
      type: 'combat',
      description: 'Grief presses on the enemy line: −10 death resistance for 2 rounds, −5 per extra power.',
      description_ru: 'Скорбь давит на вражеский строй: −10 сопр. смерти на 2 раунда, −5 за доп. силу.',
      cost: { crystals: { Crystals_Death: 10, Crystals_Life: 5 } },
      power_cost: 1,
      scaling: { 'resist_reduction.death': 5 },
      effect_type: 'debuff',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { resist_reduction: { death: 10 }, duration_rounds: 2 },
    },
    {
      id: 'g_spell_9',
      icon: 'the_long_rot',
      name: 'The Long Rot',
      name_ru: 'Долгий тлен',
      category: 'debuff',
      tier: 3,
      type: 'combat',
      // The game's only answer to an enemy healer. Uses the Decay pool: healing
      // is eaten point for point until the pool is spent.
      description: 'Rot settles into one enemy: 6 Decay, +3 per extra power. Decay eats the healing they receive, point for point.',
      description_ru: 'Тлен въедается в одного врага: 6 Тлена, +3 за доп. силу. Тлен поглощает получаемое им исцеление один к одному.',
      cost: { crystals: { Crystals_Death: 15, Crystals_Fire: 5 } },
      power_cost: 1,
      scaling: { decay_amount: 3 },
      effect_type: 'decay',
      class: 'enemy',
      target_scope: 'single_enemy',
      params: { decay_amount: 6 },
    },
    {
      id: 'g_spell_11',
      icon: 'a_second_longer',
      name: 'A Second Longer',
      name_ru: 'Ещё секунда',
      category: 'debuff',
      tier: 4,
      type: 'combat',
      // Named for the spell that ruined them: one second, and a century passed.
      description: 'A stolen second catches up with one enemy: 20 death damage, +6 per extra power.',
      description_ru: 'Украденная секунда настигает врага: 20 урона смертью, +6 за доп. силу.',
      cost: { crystals: { Crystals_Death: 20, Crystals_Fire: 5 } },
      power_cost: 1,
      scaling: { damage_flat: 6 },
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'single_enemy',
      params: { damage_flat: 20, damage_type: 'death' },
    },
  ],

  enemies: [
    // ── Boss spells ─────────────────────────────────────────────────────────
    // Encounter bosses use the SAME power economy the player's hero does: one
    // point per action, capped at 5, generation stops when they die. An
    // encounter gives a boss its two spells in data/embark.js — the cheap one
    // it will cast again and again, and the expensive one it only reaches by
    // surviving long enough, which turns its power strip into a clock the
    // player can read and race.
    {
      id: 'boss_heal',
      icon: 'ministration',
      name: 'Ministration',
      name_ru: 'Врачевание',
      category: 'buff',
      tier: 1,
      type: 'enemy',
      description: 'Mend the most wounded ally.',
      description_ru: 'Исцеляет самого раненого союзника.',
      power_cost: 2,
      scaling: { heal_pct: 0.08 },
      effect_type: 'heal',
      class: 'boon',
      target_scope: 'single_ally',
      params: { heal_pct: 0.25 },
    },
    {
      id: 'boss_resurrect',
      icon: 'called_back',
      name: 'Called Back',
      name_ru: 'Призванный обратно',
      category: 'special',
      tier: 1,
      type: 'enemy',
      description: 'Raise one fallen ally at half health.',
      description_ru: 'Поднимает одного павшего союзника с половиной здоровья.',
      power_cost: 5,
      effect_type: 'resurrect',
      class: 'utility',
      target_scope: 'single_dead_ally',
      params: { resurrect_hp_pct: 50 },
    },

    {
      id: 'enemy_spell_1',
      name: 'Enemy Spell 1 (placeholder)',
      category: 'buff',
      tier: 1,
      type: 'enemy',
      description: 'Placeholder enemy spell.',
      effect_type: 'buff',
      class: 'enemy',
      target_scope: 'all_allies',
      params: { armor_boost: 5 },
    },
    // Encounter spells cast by the enemy before the first round (see
    // castEncounterSpell in utils/battle-engine.js). `all_enemies` is resolved
    // relative to the CASTER, so for an enemy caster it means the player's
    // units. Damage is typed: 'physical' is reduced by armor, everything else by
    // the matching resistance.
    {
      id: 'enemy_spell_2',
      name: 'Opening Volley',
      name_ru: 'Первый залп',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      description: 'Deals 10 physical damage to every enemy unit.',
      description_ru: 'Наносит 10 физического урона всем вражеским бойцам.',
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { damage_flat: 10, damage_type: 'physical' },
    },
    {
      id: 'enemy_spell_3',
      name: 'Killing Frost',
      name_ru: 'Смертельный холод',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      description: 'Deals 15 cold damage to every enemy unit.',
      description_ru: 'Наносит 15 урона холодом всем вражеским бойцам.',
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { damage_flat: 15, damage_type: 'cold' },
    },
    {
      id: 'enemy_spell_4',
      name: 'Deathly Pall',
      name_ru: 'Смертная пелена',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      description: 'Deals 15 death damage to every enemy unit.',
      description_ru: 'Наносит 15 урона смертью всем вражеским бойцам.',
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { damage_flat: 15, damage_type: 'death' },
    },
    {
      id: 'enemy_spell_5',
      name: 'Leaden Limbs',
      name_ru: 'Свинцовые члены',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      description: 'Every enemy unit loses 5 initiative.',
      description_ru: 'Все вражеские бойцы теряют 5 инициативы.',
      effect_type: 'debuff',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { initiative_flat_reduction: 5 },
    },
    {
      id: 'enemy_spell_6',
      name: 'Crushing Salvo',
      name_ru: 'Сокрушительный залп',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      description: 'Deals 15 physical damage to every enemy unit.',
      description_ru: 'Наносит 15 физического урона всем вражеским бойцам.',
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { damage_flat: 15, damage_type: 'physical' },
    },
    {
      id: 'enemy_spell_7',
      name: 'Sundered Plate',
      name_ru: 'Расколотые латы',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      description: 'Every enemy unit loses 7 armor.',
      description_ru: 'Все вражеские бойцы теряют 7 брони.',
      effect_type: 'debuff',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { armor_flat_reduction: 7 },
    },
  ],};

const SPELL_CATEGORIES = [
  { id: 'non_combat', name: 'Non-Combat', name_ru: 'Вне боя' },
  { id: 'buff',       name: 'Buffs',      name_ru: 'Усиления' },
  { id: 'debuff',     name: 'Debuffs',    name_ru: 'Ослабления' },
  { id: 'special',    name: 'Special',    name_ru: 'Особые' },
];

// Power is the per-cast currency, earned in battle. Named per faction purely for
// flavour — the mechanic is identical for all three, and for enemy bosses.
const POWER_MAX = 5;
const POWER_PER_HERO_ACTION = 1;
const POWER_NAMES = {
  empire:              { en: "Lion's Fury",   ru: 'Ярость льва' },
  choir_of_the_cursed: { en: 'Chord of Hate',  ru: 'Аккорд ненависти' },
  grail_of_sorrow:     { en: "Mother's Tear", ru: 'Слеза Матери' },
  enemies:             { en: 'Power',          ru: 'Сила' },
};

// What a spell actually does at N power: base params with every scaling entry
// advanced (N - power_cost) steps, plus the max-power bonus at a full 5.
// Dotted keys ('resist_reduction.death') address one field inside a nested
// object, which is how a resist table grows without replacing it wholesale.
function spellParamsAtPower(spell, power) {
  const out = JSON.parse(JSON.stringify(spell?.params || {}));
  if (!spell) return out;
  const steps = Math.max(0, (Number(power) || 0) - (spell.power_cost ?? 1));
  const bump = (target, key, amount) => {
    const path = String(key).split('.');
    let node = target;
    for (let i = 0; i < path.length - 1; i++) {
      if (node[path[i]] == null || typeof node[path[i]] !== 'object') node[path[i]] = {};
      node = node[path[i]];
    }
    const leaf = path[path.length - 1];
    node[leaf] = (Number(node[leaf]) || 0) + amount;
  };
  for (const [key, per] of Object.entries(spell.scaling || {})) bump(out, key, per * steps);
  if ((Number(power) || 0) >= POWER_MAX) {
    for (const [key, amount] of Object.entries(spell.max_power_bonus || {})) bump(out, key, amount);
  }
  return out;
}

export { SPELLS, SPELL_CATEGORIES, POWER_MAX, POWER_PER_HERO_ACTION, POWER_NAMES, spellParamsAtPower };
if (typeof module !== 'undefined') module.exports = { SPELLS, SPELL_CATEGORIES, POWER_MAX, POWER_PER_HERO_ACTION, POWER_NAMES, spellParamsAtPower };