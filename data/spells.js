// Spells are grouped by CATEGORY (which drives the Spell Tome tabs) and gated by
// TIER (which is the throne level required to research them).
//
//   category: 'non_combat' | 'buff' | 'debuff' | 'special'
//   tier:     the Mage Guild level that opens it — 1, 2 or 3. The two
//             non-combat spells carry no tier at all: they are granted at
//             character creation and are never researched.
//
// ── Two currencies, two moments ────────────────────────────────────────────
// CRYSTALS are paid ONCE, to research a spell (POST /spells/research). They are
// never spent again. POWER — Lion's Fury for the Empire, Chord of Hate for the
// Choir, Mother's Tear for the Grail — is the per-cast cost, earned during the
// battle itself: the hero gains 1 per action it takes, to a maximum of 5, and
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
// ── Two kinds of art ───────────────────────────────────────────────────────
// The spell's own picture is keyed by ID: /assets/icons/spells/<id>.png. It is
// not a field here because it never differs from the id.
//
// `effect_icon` is a DIFFERENT thing: the badge drawn on a unit's portrait
// while the spell's effect is on it, taken from /assets/icons/abilities/. A
// portrait tile has to sit alongside the passive-driven statuses and read like
// one of them, so it comes from that set rather than from the spell art.
//
// Non-combat spells (resurrect / heal) are unchanged: roster-only, crystal
// cost at point of use, never castable in battle.
const SPELLS = {
  empire: [
    {
      id: 'e_spell_1',
      name: 'Revival Prayer',
      name_ru: 'Молитва воскрешения',
      category: 'non_combat',
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
      effect_name: 'aegis',
      name: 'Holy Aegis',
      name_ru: 'Священная эгида',
      category: 'buff',
      tier: 1,
      type: 'combat',
      effect_icon: 'aegis',
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
      effect_name: 'shared_suffering',
      name: 'Martyrdom',
      name_ru: 'Мученичество',
      category: 'buff',
      tier: 1,
      type: 'combat',
      effect_icon: 'shared_suffering',
      description: 'One ally shoulders 10% of every blow struck against the allies beside it, taking that share onto itself for 2 rounds. +5% per extra power; at full power it lasts 3 rounds.',
      description_ru: 'Союзник принимает на себя 10% каждого удара по соседним союзникам на 2 раунда. +5% за доп. силу; на полной силе — 3 раунда.',
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
      effect_name: 'blessing_of_protection',
      name: 'Vow of Protection',
      name_ru: 'Обет защиты',
      category: 'buff',
      tier: 2,
      type: 'combat',
      effect_icon: 'protector',
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
      name: 'Wrath of Heaven',
      name_ru: 'Гнев Небес',
      category: 'debuff',
      tier: 1,
      type: 'combat',
      effect_icon: 'light_of_dawn',
      description: 'Light falls on the whole enemy line for 15 life damage, +4 per extra power. Heals your whole line for 5, +2 per extra power.',
      description_ru: 'Свет обрушивается на весь вражеский строй: 15 урона жизнью, +4 за каждую доп. силу. Исцеляет весь ваш строй на 5, +2 за доп. силу.',
      cost: { crystals: { Crystals_Life: 10, Crystals_Fire: 5 } },
      power_cost: 1,
      scaling: { damage_flat: 4, heal_flat: 2 },
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'all_enemies',
      effect_name: 'wrath_of_heaven',
      params: { damage_flat: 15, damage_type: 'life', heal_flat: 5, heal_all_allies: true },
    },
    {
      id: 'e_spell_10',
      effect_name: 'condemn',
      name: 'Condemn',
      name_ru: 'Осуждение',
      category: 'debuff',
      tier: 2,
      type: 'combat',
      effect_icon: 'find_weakness',
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
      name: 'Purgation',
      name_ru: 'Очищение',
      category: 'debuff',
      tier: 3,
      type: 'combat',
      effect_icon: 'purge',
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
      effect_name: 'purgation',
      params: { dispel_polarity: 'positive', dispel_count: 1 },
    },
  ],

  choir_of_the_cursed: [
    {
      id: 'd_spell_4',
      effect_name: 'eternal_pyre',
      name: 'Eternal Pyre',
      name_ru: 'Вечный Костёр',
      category: 'debuff',
      tier: 1,
      type: 'combat',
      effect_icon: 'burn',
      description: 'Make the target enemy’s current burn permanent. Costs 2 power.',
      description_ru: 'Делает текущий ожог цели постоянным. Стоит 2 силы.',
      cost: { crystals: { Crystals_Fire: 10 } },
      power_cost: 2,
      effect_type: 'debuff',
      class: 'enemy',
      target_scope: 'single_enemy',
      params: { make_burn_permanent: true },
    },
    {
      id: 'd_spell_1',
      name: 'Rite of Return',
      name_ru: 'Обряд возвращения',
      category: 'non_combat',
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
      effect_name: 'song_of_frenzy',
      name: 'Song of Frenzy',
      name_ru: 'Песнь исступления',
      category: 'buff',
      tier: 1,
      type: 'combat',
      effect_icon: 'rage',
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
      effect_name: 'chorus_of_wrath',
      name: 'Chorus of Wrath',
      name_ru: 'Хор ярости',
      category: 'buff',
      tier: 2,
      type: 'combat',
      effect_icon: 'chorus_of_war',
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
      effect_name: 'shield_ward',
      name: 'Hymn of Warding',
      name_ru: 'Гимн оберега',
      category: 'buff',
      tier: 1,
      type: 'combat',
      effect_icon: 'resist_aura_cold',
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
      name: 'Song of Weakness',
      name_ru: 'Песнь слабости',
      category: 'debuff',
      tier: 1,
      type: 'combat',
      effect_icon: 'slow',
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
      effect_name: 'pyre_requiem',
      name: 'Pyre Requiem',
      name_ru: 'Погребальный реквием',
      category: 'debuff',
      tier: 2,
      type: 'combat',
      effect_icon: 'burn',
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
      effect_name: 'unsung',
      name: 'Unsung',
      name_ru: 'Неспетые',
      category: 'special',
      tier: 3,
      type: 'combat',
      effect_icon: 'dissipate',
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
      id: 'g_spell_4',
      effect_name: 'unending_wound',
      name: 'Unending Wound',
      name_ru: 'Незаживающая Рана',
      category: 'debuff',
      tier: 1,
      type: 'combat',
      effect_icon: 'bleed',
      description: 'Make the target enemy’s current bleed permanent. Costs 2 power.',
      description_ru: 'Делает текущее кровотечение цели постоянным. Стоит 2 силы.',
      cost: { crystals: { Crystals_Death: 10 } },
      power_cost: 2,
      effect_type: 'debuff',
      class: 'enemy',
      target_scope: 'single_enemy',
      params: { make_bleed_permanent: true },
    },
    {
      id: 'g_spell_1',
      name: 'Mourning Rite',
      name_ru: 'Траурный обряд',
      category: 'non_combat',
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
      effect_name: 'sorrows_haste',
      name: "Sorrow's Haste",
      name_ru: 'Скорая скорбь',
      category: 'buff',
      tier: 1,
      type: 'combat',
      effect_icon: 'inspiration_initiative',
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
      effect_name: 'last_rites',
      name: 'Last Rites',
      name_ru: 'Последние обряды',
      category: 'buff',
      tier: 2,
      type: 'combat',
      effect_icon: 'command',
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
      effect_name: 'terror',
      name: 'Pall of Sorrow',
      name_ru: 'Покров скорби',
      category: 'special',
      tier: 1,
      type: 'combat',
      effect_icon: 'sorrow',
      // The drain fantasy in one cast: they are weakened, your own is veiled.
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
      effect_name: 'condemn',
      name: "Sorrow's Weight",
      name_ru: 'Бремя скорби',
      category: 'debuff',
      tier: 1,
      type: 'combat',
      effect_icon: 'find_weakness',
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
      effect_name: 'decay_touch',
      name: 'The Long Rot',
      name_ru: 'Долгий тлен',
      category: 'debuff',
      tier: 2,
      type: 'combat',
      effect_icon: 'aura_of_decay',
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
      effect_name: 'haunt',
      name: 'A Second Longer',
      name_ru: 'Ещё секунда',
      category: 'debuff',
      tier: 3,
      type: 'combat',
      effect_icon: 'death_mark',
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
    // it casts again and again, and the expensive one it only reaches by
    // surviving, which turns its power strip into a clock the player can race.
    {
      id: 'boss_heal',
      effect_name: 'holy_heal',
      name: 'Ministration',
      name_ru: 'Врачевание',
      category: 'buff',
      tier: 1,
      type: 'enemy',
      effect_icon: 'prayer_of_healing',
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
      effect_name: 'raise_dead',
      name: 'Called Back',
      name_ru: 'Призванный обратно',
      category: 'special',
      tier: 1,
      type: 'enemy',
      effect_icon: 'raise_dead',
      description: 'Raise one fallen ally at half health.',
      description_ru: 'Поднимает одного павшего союзника с половиной здоровья.',
      power_cost: 5,
      effect_type: 'resurrect',
      class: 'utility',
      target_scope: 'single_dead_ally',
      params: { resurrect_hp_pct: 50 },
    },

    // ── Malgrath the Undying ────────────────────────────────────────────────
    // A grinding boss: it does not burst you down, it makes your healing stop
    // working and then out-lasts you. The pair reads as one plan — rot the whole
    // line, then execute whatever the rot has left standing.
    {
      id: 'boss_grave_rot',
      effect_name: 'grave_rot',
      name: 'Grave Rot',
      name_ru: 'Могильная гниль',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      effect_icon: 'aura_of_decay',
      description: 'Lays decay on every enemy, eating the healing they receive.',
      description_ru: 'Накладывает тлен на всех врагов, поглощая получаемое ими исцеление.',
      power_cost: 3,
      scaling: { decay_amount: 3 },
      effect_type: 'debuff',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { decay_amount: 8 },
    },
    {
      id: 'boss_deaths_verdict',
      effect_name: 'haunt',
      name: "Death's Verdict",
      name_ru: 'Приговор смерти',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      effect_icon: 'death_mark',
      telegraph: true,
      telegraph_text: 'the bells have chosen',
      telegraph_text_ru: 'колокола выбрали жертву',
      description: 'Death itself passes sentence on one enemy.',
      description_ru: 'Сама смерть выносит приговор одному врагу.',
      power_cost: 4,
      scaling: { damage_flat: 12 },
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'single_enemy',
      params: { damage_flat: 40, damage_type: 'death' },
    },

    // ── Cryodrox ────────────────────────────────────────────────────────────
    // The opposite shape: it hardens its own line and chips at yours, so the
    // fight is a race against a wall that keeps getting thicker.
    {
      id: 'boss_rime_ward',
      effect_name: 'rime_ward',
      name: 'Rime Ward',
      name_ru: 'Иней-оберег',
      category: 'buff',
      tier: 1,
      type: 'enemy',
      effect_icon: 'frost_armor',
      description: 'Sheathes every ally in frost, hardening their armor.',
      description_ru: 'Покрывает всех союзников инеем, укрепляя их броню.',
      power_cost: 2,
      scaling: { armor_boost: 4 },
      effect_type: 'buff',
      class: 'enemy',
      target_scope: 'all_allies',
      params: { armor_boost: 10 },
    },
    {
      id: 'boss_glacial_burst',
      effect_name: 'glacial_burst',
      name: 'Glacial Burst',
      name_ru: 'Ледниковый взрыв',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      effect_icon: 'hungering_frost',
      description: 'Shatters the air across the enemy line with killing cold.',
      description_ru: 'Раскалывает воздух над вражеским строем убийственным холодом.',
      power_cost: 3,
      scaling: { damage_flat: 6 },
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { damage_flat: 18, damage_type: 'cold' },
    },

    // ── The Faction Colossus ────────────────────────────────────────────────
    // One kit per phase, written as a ROTATION rather than a pile the AI picks
    // the dearest affordable item from — see `spell_cycle` on reliquary_titan in
    // data/units.js and aiPickCycledSpell in utils/battle-engine.js. Greedy
    // selection cannot reach an expensive spell that shares a kit with a cheap
    // one: it buys the cheap one the moment it can afford it and the bank never
    // climbs. The rotation is also what makes the boss READABLE — the player
    // learns the order and plays against it.
    //
    // `telegraph: true` means the boss ANNOUNCES the spell on one turn and casts
    // it on the next, attacking as normal in between. The warning costs the boss
    // nothing and buys the player a round to answer it, which is the difference
    // between a fight and a dice roll. Only the heavy hits carry it; the chip
    // spells land the turn they are chosen.
    //
    // Nothing here defends the boss. Its HP IS the faction's weekly progress, so
    // a boss self-buff that cut incoming damage would literally subtract from
    // what the week's attempts are worth — every spell in this kit is a threat
    // to the player instead.
    {
      id: 'boss_sundering_stone',
      effect_name: 'sundering_stone',
      name: 'Sundering Stone',
      name_ru: 'Раскол камня',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      effect_icon: 'impale',
      description: 'Slabs of reliquary stone shear off and scatter across the line.',
      description_ru: 'Плиты камня-реликвария срываются и осыпают весь строй.',
      power_cost: 2,
      scaling: { damage_flat: 5 },
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { damage_flat: 12, damage_type: 'physical' },
    },
    {
      id: 'boss_reliquary_grasp',
      effect_name: 'reliquary_grasp',
      name: 'Reliquary Grasp',
      name_ru: 'Хватка реликвария',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      effect_icon: 'impale',
      description: 'A stone hand closes on one of them and squeezes.',
      description_ru: 'Каменная длань сжимается на одном из них.',
      power_cost: 3,
      scaling: { damage_flat: 8 },
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'single_enemy',
      params: { damage_flat: 26, damage_type: 'physical' },
    },
    {
      id: 'boss_strangling_roots',
      effect_name: 'strangling_roots',
      name: 'Strangling Roots',
      name_ru: 'Душащие корни',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      effect_icon: 'thorns',
      telegraph: true,
      telegraph_text: 'the ground splits as roots coil for the whole line',
      telegraph_text_ru: 'земля трескается — корни свиваются над всем строем',
      description: 'Roots burst through the line and squeeze until bones give.',
      description_ru: 'Корни пробивают строй и сжимают, пока не хрустнут кости.',
      power_cost: 4,
      scaling: { damage_flat: 7 },
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { damage_flat: 24, damage_type: 'nature' },
    },
    {
      id: 'boss_toll_of_bells',
      effect_name: 'toll_of_bells',
      name: 'Toll of Bells',
      name_ru: 'Звон колоколов',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      effect_icon: 'sorrow',
      description: 'The reliquary bells sound, and the sound is a wound.',
      description_ru: 'Колокола реликвария звучат, и этот звук — рана.',
      power_cost: 2,
      scaling: { damage_flat: 5 },
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { damage_flat: 14, damage_type: 'death' },
    },
    {
      id: 'boss_ember_spit',
      effect_name: 'ember_spit',
      name: 'Ember Spit',
      name_ru: 'Плевок углями',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      effect_icon: 'burn',
      description: 'Embers spray from every crack in the stone.',
      description_ru: 'Из каждой трещины в камне брызжут угли.',
      power_cost: 2,
      scaling: { damage_flat: 6 },
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { damage_flat: 16, damage_type: 'fire' },
    },
    {
      id: 'boss_cinder_cascade',
      effect_name: 'cinder_cascade',
      name: 'Cinder Cascade',
      name_ru: 'Каскад пепла',
      category: 'debuff',
      tier: 1,
      type: 'enemy',
      effect_icon: 'conflagration',
      telegraph: true,
      telegraph_text: 'light pours from the cracks — the stone is about to burst',
      telegraph_text_ru: 'из трещин бьёт свет — камень вот-вот лопнет',
      description: 'The cracked stone opens and pours fire over everything.',
      description_ru: 'Треснувший камень раскрывается и заливает всё огнём.',
      power_cost: 4,
      scaling: { damage_flat: 8 },
      effect_type: 'damage',
      class: 'enemy',
      target_scope: 'all_enemies',
      params: { damage_flat: 28, damage_type: 'fire' },
    },
  ],};

// The tome tabs by TIER, and a tier is exactly one Mage Guild level: tab N opens
// at guild N, with no offset to keep in anyone's head. `id` is a NUMBER because
// that is what a spell's own `tier` is, and the tome compares the two directly
// (see renderSlider in public/screens/spell_tome.js).
//
// There are three, not four. The combat spells used to start at tier 2 because
// tier 1 held nothing but the two non-combat spells — which the tome does not
// list — so the first tab was permanently empty and it was the one the tome
// opened on. The non-combat pair is out of the ladder now and the combat spells
// have moved down to fill it.
const SPELL_TIERS = [
  { id: 1, name: 'Tier I',   name_ru: 'Круг I'   },
  { id: 2, name: 'Tier II',  name_ru: 'Круг II'  },
  { id: 3, name: 'Tier III', name_ru: 'Круг III' },
];

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

export { SPELLS, SPELL_CATEGORIES, SPELL_TIERS, POWER_MAX, POWER_PER_HERO_ACTION, POWER_NAMES, spellParamsAtPower };
if (typeof module !== 'undefined') module.exports = { SPELLS, SPELL_CATEGORIES, SPELL_TIERS, POWER_MAX, POWER_PER_HERO_ACTION, POWER_NAMES, spellParamsAtPower };
