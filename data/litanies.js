// Litanies - scripted multi-speaker executions. See docs/combat-barks-design.md §5.
//
// Unlike a bark, a litany is NOT cosmetic: it stages the killing blow (the
// chorus strikes first, for show only) and pays a mechanical reward. It fires
// only when the exact formation below is standing on the board.
//
// EVERY ROLE IS A HARDCODED ID LIST. No tags, no factions, no filters: tags do
// not describe roles well enough for a scripted moment (the Choir Regent is not
// tagged Demon and is still a heretic to be purged). Adding a unit to a role is
// editing one of these arrays.
//
// ONE LITANY IS ONE OBJECT, whole. Nothing is shared between them and nothing is
// built for them: the lead ids, both chorus cells, the target ids, the verses and
// the reward are all written out inside the object, so editing a litany is
// editing that object and nothing else can be affected by it. The ids repeat
// between litanies on purpose - that is the price of each one standing alone.
//
// formation.rows are read against the ACTING side's front column, top to bottom.
// Every row must be manned by an alive unit or nothing happens - there is no
// shorter version and no substitute speaker.
//
// A chorus cell holds ONE unit, so every id in a chorus list must be
// `size: 'tile'`. A `column` unit fills all three rows at once and can never man
// row 0 and row 2 as two separate speakers.
//
// Each hero leads two or three litanies, and fireLitany (utils/battle-engine.js)
// takes the FIRST match in this array: two litanies sharing a lead are only both
// reachable when their chorus or their target differs. No two below agree on
// either, so the formation on the board decides which one is spoken.
//
// REWARDS are any mix of the flat fields below, applied to the acting side and
// its enemies once the kill has landed, and PERMANENT for the battle - no
// rounds, no expiry, no dispel. applyLitanyReward in utils/battle-engine.js is
// the whole of what reads them; a field left out simply does nothing.
//
//   enemy_initiative_flat  every living enemy loses this much initiative (min 1)
//   enemy_armor_flat       every living enemy loses this much armor (min 0)
//   enemy_damage_flat      every living enemy takes this much damage, ignoring
//                          armor and resistances - it can kill
//   ally_heal_flat         every living ally heals this much, capped at max HP
//   ally_initiative_flat   every living ally gains this much initiative
//   ally_armor_flat        every living ally gains this much armor
//   ally_resist_flat       { school: amount }, added to every living ally
//   ally_all_resist_flat   the same amount added to every school
//
// Armor and resistances are capped at MITIGATION_CAP_PCT, so a unit already at
// the ceiling gains nothing from those two - the same as any other buff.
//
// `message` / `message_ru` is what the battle log and the Litanies page print,
// so it has to describe the fields above it. It is not derived from them.

const LITANIES = [

  // ── Empire: the Paladin leads ─────────────────────────────────────────────
  {
    id:    'profane_chorus',
    name:  'Profane Chorus',
    name_ru: 'Нечестивый Хор',
    // Lead: Paladin, every tier of both paths.
    lead: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212',
    ] },
    // Chorus: Templar line to tier 4, both branches.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'e21', 'e211', 'e2111', 'e212', 'e2121',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'e21', 'e211', 'e2111', 'e212', 'e2121',
        ] },
      ],
    },
    target: { ids: [
      'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
      'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42', 'h_d_2',
      'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42', 'h_d_2_b2',
      'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42', 'h_d_3', 'h_d_3_a2',
      'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42', 'h_d_3_b2', 'h_d_3_b3',
      'h_d_3_b41', 'h_d_3_b42', 'opb_e5', 'opb_e51', 'opb_e511',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual',
        line: ['I am His shield against the talons in the night!',
               'Я Его щит от когтей в ночи!'] },
      { speaker: 'row2', strike: 'visual',
        line: ['I am His light that burns the unclean!',
               'Я Его свет испепеляющий нечистых!'] },
      { speaker: 'row1', strike: 'lethal',
        line: ['I am His hammer and your end!',
               'Я его Молот и твоя смерть!'] },
    ],
    reward: {
      enemy_initiative_flat: 10,
      message:    'Profane Chorus - the Light breaks them: every enemy loses 10 initiative.',
      message_ru: 'Нечестивый Хор — Свет ломает их: все враги теряют 10 инициативы.',
    },
    once_per: 'battle',
  },
  {
    id:    'sanctified_ash',
    name:  'The Sanctified Ash',
    name_ru: 'Освящённый прах',
    // Lead: Paladin, every tier of both paths.
    lead: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212',
    ] },
    // Chorus: Priest line to tier 4, both branches.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'e22', 'e221', 'e2211', 'e222', 'e2221',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'e22', 'e221', 'e2211', 'e222', 'e2221',
        ] },
      ],
    },
    // Target: Every Grail hero — Mourning Prophet, Grail Warden, Mother's Voice — plus
    // Malgrath the Undying, every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42',
      'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42', 'h_g_2',
      'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42', 'h_g_2_b2',
      'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42', 'h_g_3', 'h_g_3_a2',
      'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42', 'h_g_3_b2', 'h_g_3_b3',
      'h_g_3_b41', 'h_g_3_b42', 'dm_e4', 'dm_e41', 'dm_e411',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      ally_heal_flat: 5,
      ally_resist_flat: { death: 5 },
      message:    'The Sanctified Ash - every ally heals 5 and gains 5 death resistance.',
      message_ru: 'Освящённый прах — все союзники лечатся на 5 и получают 5 сопротивления смерти.',
    },
    once_per: 'battle',
  },
  {
    id:    'unbroken_banner',
    name:  'The Unbroken Banner',
    name_ru: 'Несломленное знамя',
    // Lead: Paladin, every tier of both paths.
    lead: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212',
    ] },
    // Chorus: Standart Bearer line to tier 4.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'e13', 'e131', 'e1311',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'e13', 'e131', 'e1311',
        ] },
      ],
    },
    // Target: Every Choir hero — Black Castellan, Choir Regent, Infernal Ascendant —
    // plus Sister Aldra, every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
      'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42', 'h_d_2',
      'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42', 'h_d_2_b2',
      'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42', 'h_d_3', 'h_d_3_a2',
      'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42', 'h_d_3_b2', 'h_d_3_b3',
      'h_d_3_b41', 'h_d_3_b42', 'opb_e5', 'opb_e51', 'opb_e511',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      ally_armor_flat: 5,
      ally_initiative_flat: 5,
      message:    'The Unbroken Banner - every ally gains 5 armor and 5 initiative.',
      message_ru: 'Несломленное знамя — все союзники получают 5 брони и 5 инициативы.',
    },
    once_per: 'battle',
  },

  // ── Empire: the Inquisitor leads ──────────────────────────────────────────
  {
    id:    'unspoken_name',
    name:  'The Unspoken Name',
    name_ru: 'Неназванное имя',
    // Lead: Inquisitor, every tier of both paths.
    lead: { ids: [
      'h_e_2', 'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42',
      'h_e_2_b2', 'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42',
    ] },
    // Chorus: Blessed Soul line to tier 4.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'e7', 'e71', 'e711', 'e7111',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'e7', 'e71', 'e711', 'e7111',
        ] },
      ],
    },
    // Target: Every Choir hero — Black Castellan, Choir Regent, Infernal Ascendant —
    // plus Sister Aldra, every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
      'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42', 'h_d_2',
      'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42', 'h_d_2_b2',
      'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42', 'h_d_3', 'h_d_3_a2',
      'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42', 'h_d_3_b2', 'h_d_3_b3',
      'h_d_3_b41', 'h_d_3_b42', 'opb_e5', 'opb_e51', 'opb_e511',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      message:    'The Unspoken Name - every enemy takes 5 damage.',
      message_ru: 'Неназванное имя — все враги получают 5 урона.',
    },
    once_per: 'battle',
  },
  {
    id:    'cinder_verdict',
    name:  'The Cinder Verdict',
    name_ru: 'Приговор угля',
    // Lead: Inquisitor, every tier of both paths.
    lead: { ids: [
      'h_e_2', 'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42',
      'h_e_2_b2', 'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42',
    ] },
    // Chorus: Apprentice into the Red Mage line, both tier-4 branches.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'e4', 'e41', 'e411', 'e4111', 'e412',
          'e4121',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'e4', 'e41', 'e411', 'e4111', 'e412',
          'e4121',
        ] },
      ],
    },
    // Target: Every Grail hero — Mourning Prophet, Grail Warden, Mother's Voice — plus
    // Malgrath the Undying, every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42',
      'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42', 'h_g_2',
      'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42', 'h_g_2_b2',
      'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42', 'h_g_3', 'h_g_3_a2',
      'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42', 'h_g_3_b2', 'h_g_3_b3',
      'h_g_3_b41', 'h_g_3_b42', 'dm_e4', 'dm_e41', 'dm_e411',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      ally_resist_flat: { fire: 5 },
      message:    'The Cinder Verdict - every enemy takes 5 damage, every ally gains 5 fire resistance.',
      message_ru: 'Приговор угля — все враги получают 5 урона, все союзники получают 5 сопротивления огню.',
    },
    once_per: 'battle',
  },

  // ── Empire: the Artificer leads ───────────────────────────────────────────
  {
    id:    'iron_sentence',
    name:  'The Iron Sentence',
    name_ru: 'Железный приговор',
    // Lead: Artificer, every tier of both paths.
    lead: { ids: [
      'h_e_3', 'h_e_3_a2', 'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42',
      'h_e_3_b2', 'h_e_3_b3', 'h_e_3_b41', 'h_e_3_b42',
    ] },
    // Chorus: Smith into the Mechanic line, both tier-4 branches.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'e6', 'e61', 'e611', 'e6111', 'e6112',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'e6', 'e61', 'e611', 'e6111', 'e6112',
        ] },
      ],
    },
    // Target: Every Choir hero — Black Castellan, Choir Regent, Infernal Ascendant —
    // plus Sister Aldra, every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
      'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42', 'h_d_2',
      'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42', 'h_d_2_b2',
      'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42', 'h_d_3', 'h_d_3_a2',
      'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42', 'h_d_3_b2', 'h_d_3_b3',
      'h_d_3_b41', 'h_d_3_b42', 'opb_e5', 'opb_e51', 'opb_e511',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_armor_flat: 5,
      ally_armor_flat: 5,
      message:    'The Iron Sentence - every enemy loses 5 armor, every ally gains 5.',
      message_ru: 'Железный приговор — все враги теряют 5 брони, все союзники получают 5.',
    },
    once_per: 'battle',
  },
  {
    id:    'last_volley',
    name:  'The Last Volley',
    name_ru: 'Последний залп',
    // Lead: Artificer, every tier of both paths.
    lead: { ids: [
      'h_e_3', 'h_e_3_a2', 'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42',
      'h_e_3_b2', 'h_e_3_b3', 'h_e_3_b41', 'h_e_3_b42',
    ] },
    // Chorus: Rifleman and Flamethrower lines to tier 4.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'e62', 'e621', 'e6211', 'e622', 'e6221',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'e62', 'e621', 'e6211', 'e622', 'e6221',
        ] },
      ],
    },
    // Target: Every Grail hero — Mourning Prophet, Grail Warden, Mother's Voice — plus
    // Malgrath the Undying, every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42',
      'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42', 'h_g_2',
      'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42', 'h_g_2_b2',
      'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42', 'h_g_3', 'h_g_3_a2',
      'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42', 'h_g_3_b2', 'h_g_3_b3',
      'h_g_3_b41', 'h_g_3_b42', 'dm_e4', 'dm_e41', 'dm_e411',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      ally_initiative_flat: 5,
      message:    'The Last Volley - every enemy takes 5 damage, every ally gains 5 initiative.',
      message_ru: 'Последний залп — все враги получают 5 урона, все союзники получают 5 инициативы.',
    },
    once_per: 'battle',
  },

  // ── Grail of Sorrow: the Grail Warden leads ───────────────────────────────
  {
    id:    'clean_passage',
    name:  'The Clean Passage',
    name_ru: 'Чистый переход',
    // Lead: Grail Warden, every tier of both paths.
    lead: { ids: [
      'h_g_2', 'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42',
      'h_g_2_b2', 'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42',
    ] },
    // Chorus: Risen into the Plague Knight line, and the Husk Colossus into the Grail
    // Angels. The gs4 ids are `size: 'row'` and cannot in fact man two chorus
    // cells — kept as authored rather than quietly changing this litany.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'gs1', 'gs11', 'gs111', 'gs1111', 'gs4',
          'gs41', 'gs411', 'gs4111',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'gs1', 'gs11', 'gs111', 'gs1111', 'gs4',
          'gs41', 'gs411', 'gs4111',
        ] },
      ],
    },
    // Target: Every Empire hero — Paladin, Inquisitor, Artificer — plus Sister Aldra,
    // every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212', 'h_e_2',
      'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42', 'h_e_2_b2',
      'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42', 'h_e_3', 'h_e_3_a2',
      'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42', 'h_e_3_b2', 'h_e_3_b3',
      'h_e_3_b41', 'h_e_3_b42', 'opb_e5', 'opb_e51', 'opb_e511',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_initiative_flat: 10,
      message:    'The Clean Passage - every enemy loses 10 initiative.',
      message_ru: 'Чистый переход — все враги теряют 10 инициативы.',
    },
    once_per: 'battle',
  },
  {
    id:    'carried_cup',
    name:  'The Carried Cup',
    name_ru: 'Несомая чаша',
    // Lead: Grail Warden, every tier of both paths.
    lead: { ids: [
      'h_g_2', 'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42',
      'h_g_2_b2', 'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42',
    ] },
    // Chorus: Grail Acolyte into the Tender and Grieving Servant lines, to tier 4.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'gs5', 'gs51', 'gs511', 'gs5111', 'gs52',
          'gs521', 'gs5211',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'gs5', 'gs51', 'gs511', 'gs5111', 'gs52',
          'gs521', 'gs5211',
        ] },
      ],
    },
    // Target: Every Choir hero — Black Castellan, Choir Regent, Infernal Ascendant —
    // plus Sister Aldra, every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
      'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42', 'h_d_2',
      'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42', 'h_d_2_b2',
      'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42', 'h_d_3', 'h_d_3_a2',
      'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42', 'h_d_3_b2', 'h_d_3_b3',
      'h_d_3_b41', 'h_d_3_b42', 'opb_e5', 'opb_e51', 'opb_e511',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      ally_heal_flat: 5,
      ally_armor_flat: 5,
      message:    'The Carried Cup - every ally heals 5 and gains 5 armor.',
      message_ru: 'Несомая чаша — все союзники лечатся на 5 и получают 5 брони.',
    },
    once_per: 'battle',
  },
  {
    id:    'hungry_vigil',
    name:  'The Hungry Vigil',
    name_ru: 'Голодное бдение',
    // Lead: Grail Warden, every tier of both paths.
    lead: { ids: [
      'h_g_2', 'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42',
      'h_g_2_b2', 'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42',
    ] },
    // Chorus: Cannibal Ghoul line to tier 4.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'gs12', 'gs121', 'gs1211',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'gs12', 'gs121', 'gs1211',
        ] },
      ],
    },
    // Target: Every Empire hero — Paladin, Inquisitor, Artificer — plus Sister Aldra,
    // every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212', 'h_e_2',
      'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42', 'h_e_2_b2',
      'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42', 'h_e_3', 'h_e_3_a2',
      'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42', 'h_e_3_b2', 'h_e_3_b3',
      'h_e_3_b41', 'h_e_3_b42', 'opb_e5', 'opb_e51', 'opb_e511',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      ally_heal_flat: 5,
      message:    'The Hungry Vigil - every enemy takes 5 damage, every ally heals 5.',
      message_ru: 'Голодное бдение — все враги получают 5 урона, все союзники лечатся на 5.',
    },
    once_per: 'battle',
  },

  // ── Grail of Sorrow: the Mourning Prophet leads ───────────────────────────
  {
    id:    'first_sorrow',
    name:  'The First Sorrow',
    name_ru: 'Первая скорбь',
    // Lead: Mourning Prophet, every tier of both paths.
    lead: { ids: [
      'h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42',
      'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42',
    ] },
    // Chorus: Adept into the Blood Adept line, both tier-4 branches.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'gs3', 'gs31', 'gs311', 'gs3111', 'gs312',
          'gs3121',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'gs3', 'gs31', 'gs311', 'gs3111', 'gs312',
          'gs3121',
        ] },
      ],
    },
    // Target: Every Empire hero — Paladin, Inquisitor, Artificer — plus Sister Aldra,
    // every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212', 'h_e_2',
      'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42', 'h_e_2_b2',
      'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42', 'h_e_3', 'h_e_3_a2',
      'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42', 'h_e_3_b2', 'h_e_3_b3',
      'h_e_3_b41', 'h_e_3_b42', 'opb_e5', 'opb_e51', 'opb_e511',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      ally_resist_flat: { life: 5 },
      message:    'The First Sorrow - every enemy takes 5 damage, every ally gains 5 life resistance.',
      message_ru: 'Первая скорбь — все враги получают 5 урона, все союзники получают 5 сопротивления жизни.',
    },
    once_per: 'battle',
  },
  {
    id:    'pale_procession',
    name:  'The Pale Procession',
    name_ru: 'Бледная процессия',
    // Lead: Mourning Prophet, every tier of both paths.
    lead: { ids: [
      'h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42',
      'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42',
    ] },
    // Chorus: Pale Maiden into the Dame and Votaress lines, to tier 4.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'gs7', 'gs71', 'gs711', 'gs7111', 'gs72',
          'gs721', 'gs7211',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'gs7', 'gs71', 'gs711', 'gs7111', 'gs72',
          'gs721', 'gs7211',
        ] },
      ],
    },
    // Target: Every Choir hero — Black Castellan, Choir Regent, Infernal Ascendant —
    // plus Sister Aldra, every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
      'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42', 'h_d_2',
      'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42', 'h_d_2_b2',
      'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42', 'h_d_3', 'h_d_3_a2',
      'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42', 'h_d_3_b2', 'h_d_3_b3',
      'h_d_3_b41', 'h_d_3_b42', 'opb_e5', 'opb_e51', 'opb_e511',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_initiative_flat: 5,
      ally_armor_flat: 5,
      message:    'The Pale Procession - every enemy loses 5 initiative, every ally gains 5 armor.',
      message_ru: 'Бледная процессия — все враги теряют 5 инициативы, все союзники получают 5 брони.',
    },
    once_per: 'battle',
  },

  // ── Grail of Sorrow: Mother's Voice leads ─────────────────────────────────
  {
    id:    'long_wailing',
    name:  'The Long Wailing',
    name_ru: 'Долгий плач',
    // Lead: Mother's Voice, every tier of both paths.
    lead: { ids: [
      'h_g_3', 'h_g_3_a2', 'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42',
      'h_g_3_b2', 'h_g_3_b3', 'h_g_3_b41', 'h_g_3_b42',
    ] },
    // Chorus: Ghost into the Specter and Apparition lines, to tier 4.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'gs6', 'gs61', 'gs611', 'gs6111', 'gs62',
          'gs621', 'gs6211',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'gs6', 'gs61', 'gs611', 'gs6111', 'gs62',
          'gs621', 'gs6211',
        ] },
      ],
    },
    // Target: Every Choir hero — Black Castellan, Choir Regent, Infernal Ascendant —
    // plus Sister Aldra, every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
      'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42', 'h_d_2',
      'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42', 'h_d_2_b2',
      'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42', 'h_d_3', 'h_d_3_a2',
      'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42', 'h_d_3_b2', 'h_d_3_b3',
      'h_d_3_b41', 'h_d_3_b42', 'opb_e5', 'opb_e51', 'opb_e511',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_initiative_flat: 5,
      enemy_armor_flat: 5,
      message:    'The Long Wailing - every enemy loses 5 initiative and 5 armor.',
      message_ru: 'Долгий плач — все враги теряют 5 инициативы и 5 брони.',
    },
    once_per: 'battle',
  },
  {
    id:    'mothers_answer',
    name:  "Mother's Answer",
    name_ru: 'Ответ Матери',
    // Lead: Mother's Voice, every tier of both paths.
    lead: { ids: [
      'h_g_3', 'h_g_3_a2', 'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42',
      'h_g_3_b2', 'h_g_3_b3', 'h_g_3_b41', 'h_g_3_b42',
    ] },
    // Chorus: Mother's Tear into the Sorrow and Vigil lines, to tier 4.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'gs8', 'gs81', 'gs811', 'gs8111', 'gs82',
          'gs821', 'gs8211',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'gs8', 'gs81', 'gs811', 'gs8111', 'gs82',
          'gs821', 'gs8211',
        ] },
      ],
    },
    // Target: Every Empire hero — Paladin, Inquisitor, Artificer — plus Sister Aldra,
    // every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212', 'h_e_2',
      'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42', 'h_e_2_b2',
      'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42', 'h_e_3', 'h_e_3_a2',
      'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42', 'h_e_3_b2', 'h_e_3_b3',
      'h_e_3_b41', 'h_e_3_b42', 'opb_e5', 'opb_e51', 'opb_e511',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      ally_heal_flat: 5,
      ally_all_resist_flat: 5,
      message:    "Mother's Answer - every ally heals 5 and gains 5 to every resistance.",
      message_ru: 'Ответ Матери — все союзники лечатся на 5 и получают 5 ко всем сопротивлениям.',
    },
    once_per: 'battle',
  },

  // ── Choir of the Cursed: the Choir Regent leads ───────────────────────────
  {
    id:    'taken_breath',
    name:  'The Taken Breath',
    name_ru: 'Отнятое дыхание',
    // Lead: Choir Regent, every tier of both paths.
    lead: { ids: [
      'h_d_2', 'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42',
      'h_d_2_b2', 'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42',
    ] },
    // Chorus: Choir Servant and Ash Cantor, both lines to tier 4. The Chorister branch
    // (d12, d121, d1211, d1212) is the obvious chorus by name and cannot be used:
    // those units are `size: 'column'` and fill row 0, 1 and 2 as one body.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'd51', 'd511', 'd5111', 'd52', 'd521',
          'd5211',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'd51', 'd511', 'd5111', 'd52', 'd521',
          'd5211',
        ] },
      ],
    },
    // Target: Every Grail hero — Mourning Prophet, Grail Warden, Mother's Voice — plus
    // Malgrath the Undying, every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42',
      'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42', 'h_g_2',
      'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42', 'h_g_2_b2',
      'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42', 'h_g_3', 'h_g_3_a2',
      'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42', 'h_g_3_b2', 'h_g_3_b3',
      'h_g_3_b41', 'h_g_3_b42', 'dm_e4', 'dm_e41', 'dm_e411',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_initiative_flat: 10,
      message:    'The Taken Breath - every enemy loses 10 initiative.',
      message_ru: 'Отнятое дыхание — все враги теряют 10 инициативы.',
    },
    once_per: 'battle',
  },
  {
    id:    'ash_antiphon',
    name:  'The Ash Antiphon',
    name_ru: 'Пепельный антифон',
    // Lead: Choir Regent, every tier of both paths.
    lead: { ids: [
      'h_d_2', 'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42',
      'h_d_2_b2', 'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42',
    ] },
    // Chorus: Ash Acolyte line to tier 4, both branches.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'd2', 'd21', 'd211', 'd2111', 'd2112',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'd2', 'd21', 'd211', 'd2111', 'd2112',
        ] },
      ],
    },
    // Target: Every Empire hero — Paladin, Inquisitor, Artificer — plus Sister Aldra,
    // every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212', 'h_e_2',
      'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42', 'h_e_2_b2',
      'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42', 'h_e_3', 'h_e_3_a2',
      'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42', 'h_e_3_b2', 'h_e_3_b3',
      'h_e_3_b41', 'h_e_3_b42', 'opb_e5', 'opb_e51', 'opb_e511',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      ally_resist_flat: { fire: 5 },
      message:    'The Ash Antiphon - every enemy takes 5 damage, every ally gains 5 fire resistance.',
      message_ru: 'Пепельный антифон — все враги получают 5 урона, все союзники получают 5 сопротивления огню.',
    },
    once_per: 'battle',
  },
  {
    id:    'court_adjourned',
    name:  'The Court Adjourned',
    name_ru: 'Двор распущен',
    // Lead: Choir Regent, every tier of both paths.
    lead: { ids: [
      'h_d_2', 'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42',
      'h_d_2_b2', 'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42',
    ] },
    // Chorus: Peer into the Nether Court, to tier 4.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'd6', 'd61', 'd611', 'd6111',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'd6', 'd61', 'd611', 'd6111',
        ] },
      ],
    },
    // Target: Every Grail hero — Mourning Prophet, Grail Warden, Mother's Voice — plus
    // Malgrath the Undying, every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42',
      'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42', 'h_g_2',
      'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42', 'h_g_2_b2',
      'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42', 'h_g_3', 'h_g_3_a2',
      'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42', 'h_g_3_b2', 'h_g_3_b3',
      'h_g_3_b41', 'h_g_3_b42', 'dm_e4', 'dm_e41', 'dm_e411',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_initiative_flat: 5,
      ally_initiative_flat: 5,
      message:    'The Court Adjourned - every enemy loses 5 initiative, every ally gains 5.',
      message_ru: 'Двор распущен — все враги теряют 5 инициативы, все союзники получают 5.',
    },
    once_per: 'battle',
  },

  // ── Choir of the Cursed: the Black Castellan leads ────────────────────────
  {
    id:    'iron_homily',
    name:  'The Iron Homily',
    name_ru: 'Железная проповедь',
    // Lead: Black Castellan, every tier of both paths.
    lead: { ids: [
      'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
      'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42',
    ] },
    // Chorus: Heretic line to tier 4, both branches.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'd4', 'd41', 'd411', 'd4111', 'd412',
          'd4121',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'd4', 'd41', 'd411', 'd4111', 'd412',
          'd4121',
        ] },
      ],
    },
    // Target: Every Empire hero — Paladin, Inquisitor, Artificer — plus Sister Aldra,
    // every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212', 'h_e_2',
      'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42', 'h_e_2_b2',
      'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42', 'h_e_3', 'h_e_3_a2',
      'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42', 'h_e_3_b2', 'h_e_3_b3',
      'h_e_3_b41', 'h_e_3_b42', 'opb_e5', 'opb_e51', 'opb_e511',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_armor_flat: 5,
      ally_armor_flat: 5,
      message:    'The Iron Homily - every enemy loses 5 armor, every ally gains 5.',
      message_ru: 'Железная проповедь — все враги теряют 5 брони, все союзники получают 5.',
    },
    once_per: 'battle',
  },
  {
    id:    'shut_gate',
    name:  'The Shut Gate',
    name_ru: 'Затворённые врата',
    // Lead: Black Castellan, every tier of both paths.
    lead: { ids: [
      'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
      'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42',
    ] },
    // Chorus: Flame Spawn line to tier 4.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'd7', 'd71', 'd711', 'd7111',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'd7', 'd71', 'd711', 'd7111',
        ] },
      ],
    },
    // Target: Every Grail hero — Mourning Prophet, Grail Warden, Mother's Voice — plus
    // Malgrath the Undying, every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42',
      'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42', 'h_g_2',
      'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42', 'h_g_2_b2',
      'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42', 'h_g_3', 'h_g_3_a2',
      'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42', 'h_g_3_b2', 'h_g_3_b3',
      'h_g_3_b41', 'h_g_3_b42', 'dm_e4', 'dm_e41', 'dm_e411',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      ally_armor_flat: 5,
      message:    'The Shut Gate - every enemy takes 5 damage, every ally gains 5 armor.',
      message_ru: 'Затворённые врата — все враги получают 5 урона, все союзники получают 5 брони.',
    },
    once_per: 'battle',
  },

  // ── Choir of the Cursed: the Infernal Ascendant leads ─────────────────────
  {
    id:    'kindling_creed',
    name:  'The Kindling Creed',
    name_ru: 'Символ разжигания',
    // Lead: Infernal Ascendant, every tier of both paths.
    lead: { ids: [
      'h_d_3', 'h_d_3_a2', 'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42',
      'h_d_3_b2', 'h_d_3_b3', 'h_d_3_b41', 'h_d_3_b42',
    ] },
    // Chorus: Flame Spawn line to tier 4.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'd7', 'd71', 'd711', 'd7111',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'd7', 'd71', 'd711', 'd7111',
        ] },
      ],
    },
    // Target: Every Empire hero — Paladin, Inquisitor, Artificer — plus Sister Aldra,
    // every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212', 'h_e_2',
      'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42', 'h_e_2_b2',
      'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42', 'h_e_3', 'h_e_3_a2',
      'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42', 'h_e_3_b2', 'h_e_3_b3',
      'h_e_3_b41', 'h_e_3_b42', 'opb_e5', 'opb_e51', 'opb_e511',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      ally_initiative_flat: 5,
      message:    'The Kindling Creed - every enemy takes 5 damage, every ally gains 5 initiative.',
      message_ru: 'Символ разжигания — все враги получают 5 урона, все союзники получают 5 инициативы.',
    },
    once_per: 'battle',
  },
  {
    id:    'seventh_ember',
    name:  'The Seventh Ember',
    name_ru: 'Седьмой уголь',
    // Lead: Infernal Ascendant, every tier of both paths.
    lead: { ids: [
      'h_d_3', 'h_d_3_a2', 'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42',
      'h_d_3_b2', 'h_d_3_b3', 'h_d_3_b41', 'h_d_3_b42',
    ] },
    // Chorus: Ash Acolyte line to tier 4, both branches.
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: [
          'd2', 'd21', 'd211', 'd2111', 'd2112',
        ] },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: [
          'd2', 'd21', 'd211', 'd2111', 'd2112',
        ] },
      ],
    },
    // Target: Every Grail hero — Mourning Prophet, Grail Warden, Mother's Voice — plus
    // Malgrath the Undying, every tier, as the PvE half (data/units.js, enemies).
    target: { ids: [
      'h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42',
      'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42', 'h_g_2',
      'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42', 'h_g_2_b2',
      'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42', 'h_g_3', 'h_g_3_a2',
      'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42', 'h_g_3_b2', 'h_g_3_b3',
      'h_g_3_b41', 'h_g_3_b42', 'dm_e4', 'dm_e41', 'dm_e411',
    ] },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      ally_heal_flat: 5,
      message:    'The Seventh Ember - every enemy takes 5 damage, every ally heals 5.',
      message_ru: 'Седьмой уголь — все враги получают 5 урона, все союзники лечатся на 5.',
    },
    once_per: 'battle',
  },
];

export { LITANIES };
