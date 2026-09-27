// Litanies - scripted multi-speaker executions. See docs/combat-barks-design.md §5.
//
// Unlike a bark, a litany is NOT cosmetic: it stages the killing blow (the
// chorus performs first, for show only) and pays a mechanical reward. It fires
// only when the exact formation below is standing on the board.
//
// EVERY ROLE IS A HARDCODED ID LIST. No tags, no factions, no filters: tags do
// not describe roles well enough for a scripted moment (the Choir Regent is not
// tagged Demon and is still a heretic to be purged). Adding a unit to a role is
// editing one of these arrays.
//
// ONE LITANY IS ONE OBJECT, whole. Nothing is shared between them and nothing is
// built for them: the lead ids, every cell, the target ids, the verses and the
// reward are written out inside the object, so editing a litany is editing that
// object and nothing else can be affected by it. The ids repeat between litanies
// on purpose - that is the price of each one standing alone.
//
// ── The formation ─────────────────────────────────────────────────────────────
//
// `cells` is a list of PLACES on the acting side's own half of the board. Each
// cell carries its own letter, its grid row (0 top, 2 bottom) and its column,
// 'front' or 'back' relative to that side. Two cells may share a row across the
// two columns, so a litany can put its lead on the line and its singers behind
// it:
//
//     A C         A  back column, row 0
//     . B         C  front column, row 0
//     . .         B  front column, row 1 - the lead
//
// The letters are the litany's own: a verse names its speaker by letter, the
// Litanies page keys the same letters onto its board, and editing a cell's
// `row`/`col` moves it on both. Every cell must be manned by an alive unit or
// nothing happens - there is no shorter version and no substitute speaker.
//
// Every id in a cell must be `size: 'tile'`. A `column` unit fills all three
// rows at once and a `row` unit fills both columns, so neither can man one cell
// of a formation - which is why the Chorister branch (d12...) cannot be a chorus
// however well its name fits, and why the Grail Angels (gs4...) are no longer in
// the Clean Passage.
//
// A cell also has to suit the units standing in it: a back-rank priest does not
// belong in the front column, and `pref_position` in data/units.js is what says
// which is which.
//
// ── The verses ────────────────────────────────────────────────────────────────
//
// `speaker` is a cell letter. `strike` is what that speaker DOES, and it must
// match what the unit actually does in data/units.js:
//
//   'visual'   a fighter's blow, played at the victim. Cosmetic - no damage, no
//              triggers, no turn spent - and range is not checked.
//   'support'  a healer's, shielder's or singer's own rite, played over its own
//              side instead of at the corpse. Priests, Standart Bearers, the ash
//              singers and the menders perform; they do not swing.
//   'lethal'   the lead's verse. The real killing blow follows it in the log.
//
// A unit with no `action_animation` at all cannot perform: its verse would be a
// silent beat. That is why the Blessed Soul line (e7..., `action: 'none'`), the
// Grail Acolytes (gs5...) and the Mother's Chalice line (gs83...) appear in no
// litany.
//
// ── The reward ────────────────────────────────────────────────────────────────
//
// Any mix of the flat fields below, applied to the acting side and its enemies
// once the kill has landed, and PERMANENT for the battle - no rounds, no expiry,
// no dispel. applyLitanyReward in utils/battle-engine.js is the whole of what
// reads them; a field left out simply does nothing.
//
//   enemy_initiative_flat  every living enemy loses this much initiative (min 1)
//   enemy_armor_flat       every living enemy loses this much armor (min 0)
//   enemy_damage_flat      every living enemy takes this much damage, ignoring
//                          armor and resistances - it can kill
//   ally_heal_flat         every living ally heals this much, capped at max HP
//   ally_shield_flat       every living ally gains a shield pool this big
//   ally_initiative_flat   every living ally gains this much initiative
//   ally_armor_flat        every living ally gains this much armor
//   ally_resist_flat       { school: amount }, added to every living ally
//   ally_all_resist_flat   the same amount added to every school
//
// THE REWARD IS WHAT THE CHORUS SANG. A priest cell pays a heal, a Standart
// Bearer cell pays a shield, a Flame Spawn cell pays damage: the payout is the
// formation's own units doing their own work at once. Nothing in the engine
// enforces that - a reward that does not match its singers is a bug here.
//
// Armor and resistances are capped at MITIGATION_CAP_PCT and a shield pool at
// POOL_CAP_PCT of max HP, so a unit already at the ceiling gains nothing from
// those - the same as any other buff.
//
// `message` / `message_ru` is what the battle log and the Litanies page print,
// so it has to describe the fields above it. It is not derived from them.
//
// ── Which one fires ──────────────────────────────────────────────────────────
//
// Each hero leads two or three litanies, and fireLitany takes the FIRST match in
// this array. Two litanies under one lead are kept apart by their formations: a
// cell they share cannot hold two different units, so the board decides. Where
// their cells do NOT overlap at all, a rich enough board can satisfy both - and
// then the earlier one in this array is the one that is spoken.

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
    formation: { cells: [
      // A: Templar to Paragon, both branches: front-rank mace and holy_shock.
      { key: 'A', row: 0, col: 'front', role: 'chorus', ids: [
        'e21', 'e211', 'e2111', 'e212', 'e2121',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', role: 'lead' },
      // C: Templar to Paragon, both branches: front-rank mace and holy_shock.
      { key: 'C', row: 2, col: 'front', role: 'chorus', ids: [
        'e21', 'e211', 'e2111', 'e212', 'e2121',
      ] },
    ] },
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
      { speaker: 'A', strike: 'visual',
        line: ['I am His shield against the talons in the night!',
                'Я Его щит от когтей в ночи!'] },
      { speaker: 'C', strike: 'visual',
        line: ['I am His light that burns the unclean!',
                'Я Его свет испепеляющий нечистых!'] },
      { speaker: 'B', strike: 'lethal',
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
    id:    'unbroken_banner',
    name:  'The Unbroken Banner',
    name_ru: 'Несломленное знамя',
    // Lead: Paladin, every tier of both paths.
    lead: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212',
    ] },
    formation: { cells: [
      // A: Priest to Seraph, both branches: back-rank heal (holy_heal).
      { key: 'A', row: 0, col: 'back', role: 'chorus', ids: [
        'e22', 'e221', 'e2211', 'e222', 'e2221',
      ] },
      // C: Standart Bearer to Gonfalonier: shields the WHOLE line (shield_ward,
    // targets: 6). The one support line placed in the FRONT column, deliberately:
    // a banner stands on the line, whatever pref_position says.
      { key: 'C', row: 0, col: 'front', role: 'chorus', ids: [
        'e13', 'e131', 'e1311',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', role: 'lead' },
    ] },
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
      { speaker: 'A', strike: 'support',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'support',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      ally_heal_flat: 5,
      ally_shield_flat: 5,
      message:    'The Unbroken Banner - the priest mends and the banner wards: every ally heals 5 and gains a 5 shield.',
      message_ru: 'Несломленное знамя — жрец исцеляет, знамя защищает: все союзники лечатся на 5 и получают щит 5.',
    },
    once_per: 'battle',
  },
  {
    id:    'wall_of_spears',
    name:  'The Wall of Spears',
    name_ru: 'Стена копий',
    // Lead: Paladin, every tier of both paths.
    lead: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212',
    ] },
    formation: { cells: [
      // A: Conscript into the Infantry and Blade lines: front-rank impale and
    // sword. The Crossbowman branch is left out — it shoots from the BACK.
      { key: 'A', row: 0, col: 'front', role: 'chorus', ids: [
        'e1', 'e11', 'e112', 'e1121', 'e113',
        'e1131',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', role: 'lead' },
      // C: Conscript into the Infantry and Blade lines: front-rank impale and
    // sword. The Crossbowman branch is left out — it shoots from the BACK.
      { key: 'C', row: 2, col: 'front', role: 'chorus', ids: [
        'e1', 'e11', 'e112', 'e1121', 'e113',
        'e1131',
      ] },
    ] },
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
      { speaker: 'A', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      enemy_armor_flat: 5,
      message:    'The Wall of Spears - the line closes: every enemy takes 5 damage and loses 5 armor.',
      message_ru: 'Стена копий — строй смыкается: все враги получают 5 урона и теряют 5 брони.',
    },
    once_per: 'battle',
  },

  // ── Empire: the Inquisitor leads ──────────────────────────────────────────
  {
    id:    'cinder_verdict',
    name:  'The Cinder Verdict',
    name_ru: 'Приговор угля',
    // Lead: Inquisitor, every tier of both paths.
    lead: { ids: [
      'h_e_2', 'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42',
      'h_e_2_b2', 'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42',
    ] },
    formation: { cells: [
      // A: Cinder Knight and Dragon Knight: the mage line that fights in the
    // FRONT rank, fire claws.
      { key: 'A', row: 0, col: 'front', role: 'chorus', ids: [
        'e412', 'e4121',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', role: 'lead' },
      // C: Cinder Knight and Dragon Knight: the mage line that fights in the
    // FRONT rank, fire claws.
      { key: 'C', row: 2, col: 'front', role: 'chorus', ids: [
        'e412', 'e4121',
      ] },
    ] },
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
      { speaker: 'A', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      ally_resist_flat: { fire: 5 },
      message:    'The Cinder Verdict - every enemy takes 5 fire, every ally gains 5 fire resistance.',
      message_ru: 'Приговор угля — все враги получают 5 урона огнём, все союзники получают 5 сопротивления огню.',
    },
    once_per: 'battle',
  },
  {
    id:    'winter_sermon',
    name:  'The Winter Sermon',
    name_ru: 'Зимняя проповедь',
    // Lead: Inquisitor, every tier of both paths.
    lead: { ids: [
      'h_e_2', 'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42',
      'h_e_2_b2', 'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42',
    ] },
    formation: { cells: [
      // A: Warder Adept to Bulwark Archon: back-rank shield (shield_ward).
      { key: 'A', row: 0, col: 'back', role: 'chorus', ids: [
        'e43', 'e431', 'e4311',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', role: 'lead' },
      // C: Blue Mage to Winter Magus: back-rank frost and fire bolts, all enemies.
      { key: 'C', row: 2, col: 'back', role: 'chorus', ids: [
        'e42', 'e421', 'e4211',
      ] },
    ] },
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
      { speaker: 'A', strike: 'support',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      ally_shield_flat: 5,
      enemy_damage_flat: 5,
      message:    'The Winter Sermon - the ward holds and the cold bites: every ally gains a 5 shield, every enemy takes 5.',
      message_ru: 'Зимняя проповедь — щит держит, холод кусает: все союзники получают щит 5, все враги получают 5 урона.',
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
    formation: { cells: [
      // A: Smith to Grand Machinist: back-rank repair. The Armsmaster branch is
    // left out — it swings a sword instead.
      { key: 'A', row: 0, col: 'back', role: 'chorus', ids: [
        'e6', 'e61', 'e611', 'e6111',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', role: 'lead' },
      // C: Rifleman to Annihilator: back-rank cannon shot.
      { key: 'C', row: 2, col: 'back', role: 'chorus', ids: [
        'e62', 'e621', 'e6211',
      ] },
    ] },
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
      { speaker: 'A', strike: 'support',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      ally_heal_flat: 5,
      enemy_armor_flat: 5,
      message:    'The Iron Sentence - the crew works: every ally is mended 5, every enemy loses 5 armor.',
      message_ru: 'Железный приговор — расчёт работает: все союзники восстанавливают 5, все враги теряют 5 брони.',
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
    formation: { cells: [
      // A: Flamethrower and Incinerator: back-rank fire, all enemies.
      { key: 'A', row: 0, col: 'back', role: 'chorus', ids: [
        'e622', 'e6221',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', role: 'lead' },
      // C: Aegis Warden and Sentinel: the shield line that stands in the FRONT
    // rank (shield_ward).
      { key: 'C', row: 2, col: 'front', role: 'chorus', ids: [
        'e432', 'e4321',
      ] },
    ] },
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
      { speaker: 'A', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'support',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      ally_shield_flat: 5,
      message:    'The Last Volley - every enemy takes 5, every ally gains a 5 shield.',
      message_ru: 'Последний залп — все враги получают 5 урона, все союзники получают щит 5.',
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
    formation: { cells: [
      // A: Risen to Plague Champion: front-rank claws.
      { key: 'A', row: 0, col: 'front', role: 'chorus', ids: [
        'gs1', 'gs11', 'gs111', 'gs1111',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', role: 'lead' },
      // C: Risen to Plague Champion: front-rank claws.
      { key: 'C', row: 2, col: 'front', role: 'chorus', ids: [
        'gs1', 'gs11', 'gs111', 'gs1111',
      ] },
    ] },
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
      { speaker: 'A', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
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
    formation: { cells: [
      // A: Stitcher to Blight Surgeon: back-rank mend_flesh.
      { key: 'A', row: 0, col: 'back', role: 'chorus', ids: [
        'gs13', 'gs131', 'gs1311',
      ] },
      // C: Pale Maiden to Pale Sovereign: front-rank sword.
      { key: 'C', row: 0, col: 'front', role: 'chorus', ids: [
        'gs7', 'gs71', 'gs711', 'gs7111',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', role: 'lead' },
    ] },
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
      { speaker: 'A', strike: 'support',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      ally_heal_flat: 5,
      enemy_damage_flat: 5,
      message:    'The Carried Cup - the flesh is sewn and the blades fall: every ally heals 5, every enemy takes 5.',
      message_ru: 'Несомая чаша — плоть сшита, клинки падают: все союзники лечатся на 5, все враги получают 5 урона.',
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
    formation: { cells: [
      // A: Cannibal Ghoul to Blood Abomination: front-rank claws.
      { key: 'A', row: 0, col: 'front', role: 'chorus', ids: [
        'gs12', 'gs121', 'gs1211',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', role: 'lead' },
      // C: Cannibal Ghoul to Blood Abomination: front-rank claws.
      { key: 'C', row: 2, col: 'front', role: 'chorus', ids: [
        'gs12', 'gs121', 'gs1211',
      ] },
    ] },
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
      { speaker: 'A', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      ally_heal_flat: 5,
      message:    'The Hungry Vigil - the host feeds: every enemy takes 5, every ally heals 5.',
      message_ru: 'Голодное бдение — войско кормится: все враги получают 5 урона, все союзники лечатся на 5.',
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
    formation: { cells: [
      // A: Blood Knight and Sanguine Lord: front-rank sword.
      { key: 'A', row: 0, col: 'front', role: 'chorus', ids: [
        'gs311', 'gs3111',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', role: 'lead' },
      // C: Blood Adept to Crimson Archon: back-rank blood bolts. The tier-1 Adept
    // is left out — it throws an arcane bolt, not blood.
      { key: 'C', row: 2, col: 'back', role: 'chorus', ids: [
        'gs31', 'gs312', 'gs3121',
      ] },
    ] },
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
      { speaker: 'A', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      ally_resist_flat: { life: 5 },
      message:    'The First Sorrow - every enemy takes 5, every ally gains 5 life resistance.',
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
    formation: { cells: [
      // A: Pale Votaress to Pale Prioress: pale_embrace over the whole line
    // (targets: 6).
      { key: 'A', row: 0, col: 'back', role: 'chorus', ids: [
        'gs72', 'gs721', 'gs7211',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', role: 'lead' },
      // C: Pale Mourner to Pale Dirge: front-rank decay_touch on an enemy.
      { key: 'C', row: 2, col: 'front', role: 'chorus', ids: [
        'gs73', 'gs731', 'gs7311',
      ] },
    ] },
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
      { speaker: 'A', strike: 'support',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      ally_shield_flat: 5,
      enemy_armor_flat: 5,
      message:    'The Pale Procession - the embrace covers and the touch rots: every ally gains a 5 shield, every enemy loses 5 armor.',
      message_ru: 'Бледная процессия — объятие укрывает, касание гниёт: все союзники получают щит 5, все враги теряют 5 брони.',
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
    formation: { cells: [
      // A: Ghost to Revenant: back-rank haunt, all enemies from tier 2.
      { key: 'A', row: 0, col: 'back', role: 'chorus', ids: [
        'gs6', 'gs61', 'gs611', 'gs6111',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', role: 'lead' },
      // C: Apparition to Nightmare: back-rank haunt on one enemy.
      { key: 'C', row: 2, col: 'back', role: 'chorus', ids: [
        'gs62', 'gs621', 'gs6211',
      ] },
    ] },
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
      { speaker: 'A', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
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
    formation: { cells: [
      // A: Necromancer to Mother's Hand: back-rank mend_flesh.
      { key: 'A', row: 0, col: 'back', role: 'chorus', ids: [
        'gs32', 'gs321', 'gs3211',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', role: 'lead' },
      // C: Mother's Vigil to Mother's Mantle: back-rank claws.
      { key: 'C', row: 2, col: 'back', role: 'chorus', ids: [
        'gs82', 'gs821', 'gs8211',
      ] },
    ] },
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
      { speaker: 'A', strike: 'support',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      ally_heal_flat: 5,
      enemy_damage_flat: 5,
      message:    "Mother's Answer - every ally heals 5, every enemy takes 5.",
      message_ru: 'Ответ Матери — все союзники лечатся на 5, все враги получают 5 урона.',
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
    formation: { cells: [
      // A: Cultist to Choir Exalted: back-rank fire bolts.
      { key: 'A', row: 0, col: 'back', role: 'chorus', ids: [
        'd5', 'd51', 'd511', 'd5111',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', role: 'lead' },
      // C: Ash Cantor to Ash Liturgist: song_of_ash over an ally.
      { key: 'C', row: 2, col: 'back', role: 'chorus', ids: [
        'd52', 'd521', 'd5211',
      ] },
    ] },
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
      { speaker: 'A', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'support',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_initiative_flat: 10,
      ally_resist_flat: { fire: 5 },
      message:    'The Taken Breath - every enemy loses 10 initiative, every ally gains 5 fire resistance.',
      message_ru: 'Отнятое дыхание — все враги теряют 10 инициативы, все союзники получают 5 сопротивления огню.',
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
    formation: { cells: [
      // A: Ash Acolyte to Pyre Choir: song_of_ash, and at tier 4 over the whole
    // line (targets: 6).
      { key: 'A', row: 0, col: 'back', role: 'chorus', ids: [
        'd2', 'd21', 'd211', 'd2111', 'd2112',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', role: 'lead' },
      // C: Peer to Nether Sovereign: back-rank fire bolts.
      { key: 'C', row: 2, col: 'back', role: 'chorus', ids: [
        'd6', 'd61', 'd611', 'd6111',
      ] },
    ] },
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
      { speaker: 'A', strike: 'support',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      ally_resist_flat: { fire: 5 },
      enemy_damage_flat: 5,
      message:    'The Ash Antiphon - the song banks the fire: every ally gains 5 fire resistance, every enemy takes 5.',
      message_ru: 'Пепельный антифон — песнь копит огонь: все союзники получают 5 сопротивления огню, все враги получают 5 урона.',
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
    formation: { cells: [
      // A: Heretic to Broken Vessel: front-rank mace.
      { key: 'A', row: 0, col: 'front', role: 'chorus', ids: [
        'd4', 'd41', 'd411', 'd4111',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', role: 'lead' },
      // C: Peer to Nether Sovereign: back-rank fire bolts.
      { key: 'C', row: 2, col: 'back', role: 'chorus', ids: [
        'd6', 'd61', 'd611', 'd6111',
      ] },
    ] },
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
      { speaker: 'A', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      enemy_initiative_flat: 5,
      message:    'The Court Adjourned - the court is dismissed: every enemy takes 5 and loses 5 initiative.',
      message_ru: 'Двор распущен — двор закрыт: все враги получают 5 урона и теряют 5 инициативы.',
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
    formation: { cells: [
      // A: Heretic to Broken Vessel: front-rank mace.
      { key: 'A', row: 0, col: 'front', role: 'chorus', ids: [
        'd4', 'd41', 'd411', 'd4111',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', role: 'lead' },
      // C: Ash Cantor to Ash Liturgist: song_of_ash over an ally.
      { key: 'C', row: 2, col: 'back', role: 'chorus', ids: [
        'd52', 'd521', 'd5211',
      ] },
    ] },
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
      { speaker: 'A', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'support',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      ally_resist_flat: { fire: 5 },
      message:    'The Iron Homily - the mace answers the song: every enemy takes 5, every ally gains 5 fire resistance.',
      message_ru: 'Железная проповедь — булава отвечает песне: все враги получают 5 урона, все союзники получают 5 сопротивления огню.',
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
    formation: { cells: [
      // A: Flame Spawn to Inferno Scion: front-rank fire claws.
      { key: 'A', row: 0, col: 'front', role: 'chorus', ids: [
        'd7', 'd71', 'd711', 'd7111',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', role: 'lead' },
      // C: Flame Spawn to Inferno Scion: front-rank fire claws.
      { key: 'C', row: 2, col: 'front', role: 'chorus', ids: [
        'd7', 'd71', 'd711', 'd7111',
      ] },
    ] },
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
      { speaker: 'A', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      enemy_initiative_flat: 5,
      message:    'The Shut Gate - the way closes: every enemy takes 5 and loses 5 initiative.',
      message_ru: 'Затворённые врата — путь закрыт: все враги получают 5 урона и теряют 5 инициативы.',
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
    formation: { cells: [
      // A: Flame Spawn to Inferno Scion: front-rank fire claws.
      { key: 'A', row: 0, col: 'front', role: 'chorus', ids: [
        'd7', 'd71', 'd711', 'd7111',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', role: 'lead' },
      // C: Flame Spawn to Inferno Scion: front-rank fire claws.
      { key: 'C', row: 2, col: 'front', role: 'chorus', ids: [
        'd7', 'd71', 'd711', 'd7111',
      ] },
    ] },
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
      { speaker: 'A', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      ally_initiative_flat: 5,
      message:    'The Kindling Creed - every enemy takes 5, every ally gains 5 initiative.',
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
    formation: { cells: [
      // A: Ash Acolyte to Pyre Choir: song_of_ash, and at tier 4 over the whole
    // line (targets: 6).
      { key: 'A', row: 0, col: 'back', role: 'chorus', ids: [
        'd2', 'd21', 'd211', 'd2111', 'd2112',
      ] },
      // B: the lead, the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', role: 'lead' },
      // C: Cultist to Choir Exalted: back-rank fire bolts.
      { key: 'C', row: 2, col: 'back', role: 'chorus', ids: [
        'd5', 'd51', 'd511', 'd5111',
      ] },
    ] },
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
      { speaker: 'A', strike: 'support',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      ally_resist_flat: { fire: 5 },
      enemy_damage_flat: 5,
      message:    'The Seventh Ember - every ally gains 5 fire resistance, every enemy takes 5.',
      message_ru: 'Седьмой уголь — все союзники получают 5 сопротивления огню, все враги получают 5 урона.',
    },
    once_per: 'battle',
  },
];

export { LITANIES };
