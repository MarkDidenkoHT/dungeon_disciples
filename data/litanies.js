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
// EIGHTEEN litanies: two for each of the nine heroes, six per faction.
//
// ── The formation ─────────────────────────────────────────────────────────────
//
// `cells` is a list of PLACES on the acting side's own half of the board. Each
// cell carries its own letter, its grid row (0 top, 2 bottom), its column
// ('front' / 'back', relative to that side) and its `size` - because a cell is as
// big as the unit that stands in it:
//
//   'tile'    one square, at (row, col).
//   'row'     BOTH columns of `row`. `col` is 'both' and is not read.
//   'column'  (row, col) and the square BELOW it, so `row` is the TOP of the two.
//
// A two-cell unit is ONE speaker standing in two places: a Golden Lion, a
// Chorister, a Gargoyle. getFootprint in utils/battle-engine.js is the authority
// on what a size covers, and a cell is matched against an occupant's WHOLE
// footprint - a `column` unit cannot answer for a `tile` cell, and a cell a large
// unit half-covers is not filled.
//
// Every id in a cell must be the cell's own size. Cells must not overlap: two
// squares of the board cannot both be manned by different units, so an overlap is
// a litany that can never fire.
//
// A cell also has to suit the units standing in it: a back-rank priest does not
// belong in the front column, and `pref_position` in data/units.js is what says
// which is which.
//
// ── The lead ──────────────────────────────────────────────────────────────────
//
// The lead is whoever LANDS THE BLOW, and that is not always the hero. A unit
// whose action targets an ALLY cannot kill (isHealer in utils/battle-engine.js),
// which rules out two heroes outright: the Artificer repairs, and the Choir
// Regent's song is a heal. Both sing from a chorus cell in their own litanies
// while something of theirs leads - the Artificer's own constructs, the Regent's
// Choristers. A lead list of healers is a litany that can never fire.
//
// ── The verses ────────────────────────────────────────────────────────────────
//
// `speaker` is a cell letter. `strike` is what that speaker DOES, and it must
// match what the unit actually does in data/units.js:
//
//   'visual'   an attacker's blow or a decayer's touch, played at the victim.
//              Cosmetic - no damage, no triggers, no turn spent - and range is
//              not checked.
//   'support'  a healer's or shielder's own rite, played over its own side
//              instead of at the corpse. Priests, Standart Bearers, menders and
//              the ash singers perform; they do not swing.
//   'lethal'   the lead's verse. The real killing blow follows it in the log.
//
// A unit with no `action_animation` cannot perform: its verse would be a silent
// beat. That is why the Blessed Soul line (e7..., `action: 'none'`), the Grail
// Acolytes (gs5...) and the Mother's Chalice line (gs83...) appear in no litany.
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
//   enemy_decay_flat       every living enemy gains a decay pool this big, so
//                          healing is eaten before it reaches their HP
//   ally_heal_flat         every living ally heals this much, capped at max HP
//   ally_shield_flat       every living ally gains a shield pool this big
//   ally_initiative_flat   every living ally gains this much initiative
//   ally_armor_flat        every living ally gains this much armor
//   ally_resist_flat       { school: amount }, added to every living ally
//   ally_all_resist_flat   the same amount added to every school
//
// THE REWARD IS WHAT THE CHORUS DID, one field per singing cell:
//
//   a heal action    (priest, mender, ash singer, embrace)  ally_heal_flat
//   a shield action  (Standart Bearer, Warder, Aegis)       ally_shield_flat
//   a decay action   (Pale Mourner)                         enemy_decay_flat
//   an attack        (everyone else)                        enemy_damage_flat,
//                                                           or the stagger fields
//
// Nothing in the engine enforces that - a reward that does not match its singers
// is a bug here.
//
// Armor and resistances are capped at MITIGATION_CAP_PCT and a shield or decay
// pool at POOL_CAP_PCT of max HP, so a unit already at the ceiling gains nothing
// from those - the same as any other buff.
//
// `message` / `message_ru` is what the battle log and the Litanies page print,
// so it has to describe the fields above it. It is not derived from them.
//
// ── Which one fires ──────────────────────────────────────────────────────────
//
// fireLitany takes the FIRST match in this array. Each hero's two litanies are
// mutually exclusive by their formations: either their lead cells are in
// different places, or they demand different units in a square they share, so the
// board decides which one is spoken and never both.

const LITANIES = [

  // ── Empire: the Paladin's litanies ────────────────────────────────────────────────
  {
    id:    'profane_chorus',
    name:  'Profane Chorus',
    name_ru: 'Нечестивый Хор',
    // Back column left, front right - the board as the Litanies page draws it:
    //   . A
    //   . B
    //   . C
    //
    // Lead: Paladin, every tier of both paths.
    lead: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212',
    ] },
    formation: { cells: [
      // A: Templar to Paragon, both branches: front-rank mace and holy_shock.
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', ids: [
        'e21', 'e211', 'e2111', 'e212', 'e2121',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
      // C: Templar to Paragon, both branches: front-rank mace and holy_shock.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', ids: [
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
    // Back column left, front right - the board as the Litanies page draws it:
    //   A C
    //   . B
    //   . .
    //
    // Lead: Paladin, every tier of both paths.
    lead: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212',
    ] },
    formation: { cells: [
      // A: Priest to Seraph, both branches: back-rank heal (holy_heal).
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', ids: [
        'e22', 'e221', 'e2211', 'e222', 'e2221',
      ] },
      // C: Standart Bearer to Gonfalonier: shields the WHOLE line (shield_ward,
      // targets: 6). The one support line placed in the FRONT column, deliberately:
      // a banner stands on the line, whatever pref_position says.
      { key: 'C', row: 0, col: 'front', size: 'tile', role: 'chorus', ids: [
        'e13', 'e131', 'e1311',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
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

  // ── Empire: the Inquisitor's litanies ─────────────────────────────────────────────
  {
    id:    'cinder_verdict',
    name:  'The Cinder Verdict',
    name_ru: 'Приговор угля',
    // Back column left, front right - the board as the Litanies page draws it:
    //   . A
    //   B .
    //   . C
    //
    // Lead: Inquisitor, every tier of both paths.
    lead: { ids: [
      'h_e_2', 'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42',
      'h_e_2_b2', 'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42',
    ] },
    formation: { cells: [
      // A: Cinder Knight and Dragon Knight: the mage line that fights in the FRONT
      // rank, fire claws.
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', ids: [
        'e412', 'e4121',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', size: 'tile', role: 'lead' },
      // C: Cinder Knight and Dragon Knight: the mage line that fights in the FRONT
      // rank, fire claws.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', ids: [
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
      enemy_initiative_flat: 5,
      message:    'The Cinder Verdict - the claws close on them: every enemy takes 5 and loses 5 initiative.',
      message_ru: 'Приговор угля — когти смыкаются: все враги получают 5 урона и теряют 5 инициативы.',
    },
    once_per: 'battle',
  },
  {
    id:    'winter_sermon',
    name:  'The Winter Sermon',
    name_ru: 'Зимняя проповедь',
    // Back column left, front right - the board as the Litanies page draws it:
    //   A .
    //   B C
    //   . C
    //
    // Lead: Inquisitor, every tier of both paths.
    lead: { ids: [
      'h_e_2', 'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42',
      'h_e_2_b2', 'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42',
    ] },
    formation: { cells: [
      // A: Warder Adept to Bulwark Archon: back-rank shield (shield_ward).
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', ids: [
        'e43', 'e431', 'e4311',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', size: 'tile', role: 'lead' },
      // C: Sentinel to Golden Lion: a TWO-CELL construct in the front column,
      // shield_bash. The Artificer keeps it standing; it does the killing.
      { key: 'C', row: 1, col: 'front', size: 'column', role: 'chorus', ids: [
        'e3', 'e31', 'e311', 'e3111',
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
      message:    'The Winter Sermon - the ward holds and the lion strikes: every ally gains a 5 shield, every enemy takes 5.',
      message_ru: 'Зимняя проповедь — щит держит, лев бьёт: все союзники получают щит 5, все враги получают 5 урона.',
    },
    once_per: 'battle',
  },

  // ── Empire: the Artificer's litanies — the Artificer sings, its construct leads ───
  {
    id:    'iron_sentence',
    name:  'The Iron Sentence',
    name_ru: 'Железный приговор',
    // Back column left, front right - the board as the Litanies page draws it:
    //   A .
    //   . B
    //   C B
    //
    // Lead: Sentinel to Golden Lion: a TWO-CELL construct in the front column,
    // shield_bash. The Artificer keeps it standing; it does the killing.
    lead: { ids: [
      'e3', 'e31', 'e311', 'e3111',
    ] },
    formation: { cells: [
      // A: Artificer, every tier of both paths. It repairs - it cannot kill, so it
      // sings here and its own construct leads.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', ids: [
        'h_e_3', 'h_e_3_a2', 'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42',
        'h_e_3_b2', 'h_e_3_b3', 'h_e_3_b41', 'h_e_3_b42',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'column', role: 'lead' },
      // C: Rifleman to Annihilator: back-rank cannon shot.
      { key: 'C', row: 2, col: 'back', size: 'tile', role: 'chorus', ids: [
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
      enemy_damage_flat: 5,
      message:    'The Iron Sentence - the crew works: every ally is mended 5, every enemy takes 5.',
      message_ru: 'Железный приговор — расчёт работает: все союзники восстанавливают 5, все враги получают 5 урона.',
    },
    once_per: 'battle',
  },
  {
    id:    'last_volley',
    name:  'The Last Volley',
    name_ru: 'Последний залп',
    // Back column left, front right - the board as the Litanies page draws it:
    //   B .
    //   B .
    //   A C
    //
    // Lead: Siege Engine to Siege Leviathan: a TWO-CELL gun carriage in the back
    // column, cannon shot.
    lead: { ids: [
      'e32', 'e321', 'e3211',
    ] },
    formation: { cells: [
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 0, col: 'back', size: 'column', role: 'lead' },
      // A: Artificer, every tier of both paths. It repairs - it cannot kill, so it
      // sings here and its own construct leads.
      { key: 'A', row: 2, col: 'back', size: 'tile', role: 'chorus', ids: [
        'h_e_3', 'h_e_3_a2', 'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42',
        'h_e_3_b2', 'h_e_3_b3', 'h_e_3_b41', 'h_e_3_b42',
      ] },
      // C: Aegis Warden and Sentinel: the shield line that stands in the FRONT
      // rank (shield_ward).
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', ids: [
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
      message:    'The Last Volley - the engine is kept and the ward is raised: every ally is mended 5 and gains a 5 shield.',
      message_ru: 'Последний залп — машину держат, щит поднят: все союзники восстанавливают 5 и получают щит 5.',
    },
    once_per: 'battle',
  },

  // ── Grail of Sorrow: the Grail Warden's litanies ──────────────────────────────────
  {
    id:    'clean_passage',
    name:  'The Clean Passage',
    name_ru: 'Чистый переход',
    // Back column left, front right - the board as the Litanies page draws it:
    //   . A
    //   . B
    //   . C
    //
    // Lead: Grail Warden, every tier of both paths.
    lead: { ids: [
      'h_g_2', 'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42',
      'h_g_2_b2', 'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42',
    ] },
    formation: { cells: [
      // A: Risen to Plague Champion: front-rank claws.
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', ids: [
        'gs1', 'gs11', 'gs111', 'gs1111',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
      // C: Risen to Plague Champion: front-rank claws.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', ids: [
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
    // Back column left, front right - the board as the Litanies page draws it:
    //   A C
    //   . B
    //   . .
    //
    // Lead: Grail Warden, every tier of both paths.
    lead: { ids: [
      'h_g_2', 'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42',
      'h_g_2_b2', 'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42',
    ] },
    formation: { cells: [
      // A: Stitcher to Blight Surgeon: back-rank mend_flesh.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', ids: [
        'gs13', 'gs131', 'gs1311',
      ] },
      // C: Pale Maiden to Pale Sovereign: front-rank sword.
      { key: 'C', row: 0, col: 'front', size: 'tile', role: 'chorus', ids: [
        'gs7', 'gs71', 'gs711', 'gs7111',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
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

  // ── Grail of Sorrow: the Mourning Prophet's litanies ──────────────────────────────
  {
    id:    'first_sorrow',
    name:  'The First Sorrow',
    name_ru: 'Первая скорбь',
    // Back column left, front right - the board as the Litanies page draws it:
    //   . A
    //   . B
    //   C .
    //
    // Lead: Mourning Prophet, every tier of both paths.
    lead: { ids: [
      'h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42',
      'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42',
    ] },
    formation: { cells: [
      // A: Blood Knight and Sanguine Lord: front-rank sword.
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', ids: [
        'gs311', 'gs3111',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
      // C: Blood Adept to Crimson Archon: back-rank blood bolts. The tier-1 Adept is
      // left out - it throws an arcane bolt, not blood.
      { key: 'C', row: 2, col: 'back', size: 'tile', role: 'chorus', ids: [
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
      enemy_armor_flat: 5,
      message:    'The First Sorrow - every enemy takes 5 and loses 5 armor.',
      message_ru: 'Первая скорбь — все враги получают 5 урона и теряют 5 брони.',
    },
    once_per: 'battle',
  },
  {
    id:    'pale_procession',
    name:  'The Pale Procession',
    name_ru: 'Бледная процессия',
    // Back column left, front right - the board as the Litanies page draws it:
    //   A .
    //   . B
    //   C C
    //
    // Lead: Mourning Prophet, every tier of both paths.
    lead: { ids: [
      'h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42',
      'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42',
    ] },
    formation: { cells: [
      // A: Pale Votaress to Pale Prioress: pale_embrace, a heal over every Spirit
      // ally (targets: 6).
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', ids: [
        'gs72', 'gs721', 'gs7211',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
      // C: Husk Colossus to Grail Archangel: a unit that fills BOTH columns of its
      // row, claws. The Sorrow Bearer branch is left out - it mends instead.
      { key: 'C', row: 2, col: 'both', size: 'row', role: 'chorus', ids: [
        'gs4', 'gs41', 'gs411', 'gs4111',
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
      enemy_damage_flat: 5,
      message:    'The Pale Procession - the embrace covers and the angel falls on them: every ally heals 5, every enemy takes 5.',
      message_ru: 'Бледная процессия — объятие укрывает, ангел падает на них: все союзники лечатся на 5, все враги получают 5 урона.',
    },
    once_per: 'battle',
  },

  // ── Grail of Sorrow: Mother's Voice's litanies ────────────────────────────────────
  {
    id:    'long_wailing',
    name:  'The Long Wailing',
    name_ru: 'Долгий плач',
    // Back column left, front right - the board as the Litanies page draws it:
    //   A .
    //   B .
    //   . C
    //
    // Lead: Mother's Voice, every tier of both paths.
    lead: { ids: [
      'h_g_3', 'h_g_3_a2', 'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42',
      'h_g_3_b2', 'h_g_3_b3', 'h_g_3_b41', 'h_g_3_b42',
    ] },
    formation: { cells: [
      // A: Ghost to Revenant: back-rank haunt, the whole field from tier 2.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', ids: [
        'gs6', 'gs61', 'gs611', 'gs6111',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', size: 'tile', role: 'lead' },
      // C: Pale Mourner to Pale Dirge: front-rank decay_touch, which lays a decay
      // pool on an enemy rather than damaging it.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', ids: [
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
      { speaker: 'A', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'C', strike: 'visual',
        line: ['placeholder', 'текст'] },
      { speaker: 'B', strike: 'lethal',
        line: ['placeholder', 'текст'] },
    ],
    reward: {
      enemy_damage_flat: 5,
      enemy_decay_flat: 5,
      message:    'The Long Wailing - the wail and the rot: every enemy takes 5 and carries 5 decay.',
      message_ru: 'Долгий плач — плач и гниение: все враги получают 5 урона и несут 5 гнили.',
    },
    once_per: 'battle',
  },
  {
    id:    'mothers_answer',
    name:  "Mother's Answer",
    name_ru: 'Ответ Матери',
    // Back column left, front right - the board as the Litanies page draws it:
    //   A .
    //   B C
    //   . C
    //
    // Lead: Mother's Voice, every tier of both paths.
    lead: { ids: [
      'h_g_3', 'h_g_3_a2', 'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42',
      'h_g_3_b2', 'h_g_3_b3', 'h_g_3_b41', 'h_g_3_b42',
    ] },
    formation: { cells: [
      // A: Necromancer to Mother's Hand: back-rank mend_flesh.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', ids: [
        'gs32', 'gs321', 'gs3211',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', size: 'tile', role: 'lead' },
      // C: Communicant to Anointed: a TWO-CELL vampire knight in the front column,
      // claws. The Consecrated branch is left out - it stands in the BACK.
      { key: 'C', row: 1, col: 'front', size: 'column', role: 'chorus', ids: [
        'gs2', 'gs21', 'gs211', 'gs2111',
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

  // ── Choir of the Cursed: the Choir Regent's litanies — the Regent sings, a Chorister leads ───
  {
    id:    'taken_breath',
    name:  'The Taken Breath',
    name_ru: 'Отнятое дыхание',
    // Back column left, front right - the board as the Litanies page draws it:
    //   B .
    //   B .
    //   A C
    //
    // Lead: Chorister to Doomchanter: a TWO-CELL singer in the back column that
    // throws fire and, at Doomchanter, haunts. The Regent sings; this kills.
    lead: { ids: [
      'd12', 'd121', 'd1211', 'd1212',
    ] },
    formation: { cells: [
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 0, col: 'back', size: 'column', role: 'lead' },
      // A: Choir Regent, every tier of both paths. Its song is a heal - it cannot
      // kill, so it sings here and a Chorister leads.
      { key: 'A', row: 2, col: 'back', size: 'tile', role: 'chorus', ids: [
        'h_d_2', 'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42',
        'h_d_2_b2', 'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42',
      ] },
      // C: Heretic to Broken Vessel: front-rank mace. The Pain Projector branch is
      // left out - `sacrifice` is a two-cell animation aimed at an ALLY, which a
      // chorus verse has no target for.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', ids: [
        'd4', 'd41', 'd411', 'd4111',
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
      enemy_initiative_flat: 10,
      ally_heal_flat: 5,
      message:    'The Taken Breath - every enemy loses 10 initiative, every ally is sung 5 back.',
      message_ru: 'Отнятое дыхание — все враги теряют 10 инициативы, все союзники восстанавливают 5.',
    },
    once_per: 'battle',
  },
  {
    id:    'ash_antiphon',
    name:  'The Ash Antiphon',
    name_ru: 'Пепельный антифон',
    // Back column left, front right - the board as the Litanies page draws it:
    //   A .
    //   C B
    //   . B
    //
    // Lead: Imp to Conqueror: a TWO-CELL demon in the front column, claws.
    lead: { ids: [
      'd1', 'd11', 'd111', 'd1111',
    ] },
    formation: { cells: [
      // A: Choir Regent, every tier of both paths. Its song is a heal - it cannot
      // kill, so it sings here and a Chorister leads.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', ids: [
        'h_d_2', 'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42',
        'h_d_2_b2', 'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42',
      ] },
      // C: Cultist to Choir Exalted: back-rank fire bolts.
      { key: 'C', row: 1, col: 'back', size: 'tile', role: 'chorus', ids: [
        'd5', 'd51', 'd511', 'd5111',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'column', role: 'lead' },
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
      message:    'The Ash Antiphon - the song mends and the fire answers: every ally heals 5, every enemy takes 5.',
      message_ru: 'Пепельный антифон — песнь исцеляет, огонь отвечает: все союзники лечатся на 5, все враги получают 5 урона.',
    },
    once_per: 'battle',
  },

  // ── Choir of the Cursed: the Black Castellan's litanies ───────────────────────────
  {
    id:    'iron_homily',
    name:  'The Iron Homily',
    name_ru: 'Железная проповедь',
    // Back column left, front right - the board as the Litanies page draws it:
    //   . A
    //   . B
    //   C .
    //
    // Lead: Black Castellan, every tier of both paths.
    lead: { ids: [
      'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
      'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42',
    ] },
    formation: { cells: [
      // A: Heretic to Broken Vessel: front-rank mace. The Pain Projector branch is
      // left out - `sacrifice` is a two-cell animation aimed at an ALLY, which a
      // chorus verse has no target for.
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', ids: [
        'd4', 'd41', 'd411', 'd4111',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
      // C: Ash Cantor to Ash Liturgist: song_of_ash, which is a HEAL on a Demon
      // ally (isHealer in utils/battle-engine.js).
      { key: 'C', row: 2, col: 'back', size: 'tile', role: 'chorus', ids: [
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
      ally_heal_flat: 5,
      message:    'The Iron Homily - the mace answers the song: every enemy takes 5, every ally is sung 5 back.',
      message_ru: 'Железная проповедь — булава отвечает песне: все враги получают 5 урона, все союзники восстанавливают 5.',
    },
    once_per: 'battle',
  },
  {
    id:    'shut_gate',
    name:  'The Shut Gate',
    name_ru: 'Затворённые врата',
    // Back column left, front right - the board as the Litanies page draws it:
    //   A A
    //   . B
    //   . C
    //
    // Lead: Black Castellan, every tier of both paths.
    lead: { ids: [
      'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
      'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42',
    ] },
    formation: { cells: [
      // A: Clay Gargoyle to Malachite: a unit that fills BOTH columns of its row and
      // throws stone at the whole field. The Alabaster branch is left out - it
      // sings instead of throwing.
      { key: 'A', row: 0, col: 'both', size: 'row', role: 'chorus', ids: [
        'd3', 'd31', 'd311', 'd3111', 'd32',
        'd321', 'd3211',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
      // C: Flame Spawn to Inferno Scion: front-rank fire claws.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', ids: [
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
      message:    'The Shut Gate - stone and fire close the way: every enemy takes 5 and loses 5 initiative.',
      message_ru: 'Затворённые врата — камень и огонь закрывают путь: все враги получают 5 урона и теряют 5 инициативы.',
    },
    once_per: 'battle',
  },

  // ── Choir of the Cursed: the Infernal Ascendant's litanies ────────────────────────
  {
    id:    'kindling_creed',
    name:  'The Kindling Creed',
    name_ru: 'Символ разжигания',
    // Back column left, front right - the board as the Litanies page draws it:
    //   . A
    //   B .
    //   . C
    //
    // Lead: Infernal Ascendant, every tier of both paths.
    lead: { ids: [
      'h_d_3', 'h_d_3_a2', 'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42',
      'h_d_3_b2', 'h_d_3_b3', 'h_d_3_b41', 'h_d_3_b42',
    ] },
    formation: { cells: [
      // A: Flame Spawn to Inferno Scion: front-rank fire claws.
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', ids: [
        'd7', 'd71', 'd711', 'd7111',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', size: 'tile', role: 'lead' },
      // C: Flame Spawn to Inferno Scion: front-rank fire claws.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', ids: [
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
      enemy_armor_flat: 5,
      message:    'The Kindling Creed - every enemy takes 5 and loses 5 armor.',
      message_ru: 'Символ разжигания — все враги получают 5 урона и теряют 5 брони.',
    },
    once_per: 'battle',
  },
  {
    id:    'seventh_ember',
    name:  'The Seventh Ember',
    name_ru: 'Седьмой уголь',
    // Back column left, front right - the board as the Litanies page draws it:
    //   A .
    //   B .
    //   C C
    //
    // Lead: Infernal Ascendant, every tier of both paths.
    lead: { ids: [
      'h_d_3', 'h_d_3_a2', 'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42',
      'h_d_3_b2', 'h_d_3_b3', 'h_d_3_b41', 'h_d_3_b42',
    ] },
    formation: { cells: [
      // A: Ash Acolyte to Pyre Choir: song_of_ash, and at tier 4 over the whole
      // line (targets: 6).
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', ids: [
        'd2', 'd21', 'd211', 'd2111', 'd2112',
      ] },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', size: 'tile', role: 'lead' },
      // C: Clay Gargoyle to Malachite: a unit that fills BOTH columns of its row and
      // throws stone at the whole field. The Alabaster branch is left out - it
      // sings instead of throwing.
      { key: 'C', row: 2, col: 'both', size: 'row', role: 'chorus', ids: [
        'd3', 'd31', 'd311', 'd3111', 'd32',
        'd321', 'd3211',
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
      ally_heal_flat: 5,
      enemy_damage_flat: 5,
      message:    'The Seventh Ember - the song mends and the stone flies: every ally heals 5, every enemy takes 5.',
      message_ru: 'Седьмой уголь — песнь исцеляет, камень летит: все союзники лечатся на 5, все враги получают 5 урона.',
    },
    once_per: 'battle',
  },
];

export { LITANIES };
