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
// formation.rows are read against the ACTING side's front column, top to bottom.
// Every row must be manned by an alive unit or nothing happens - there is no
// shorter version and no substitute speaker.
//
// A chorus cell holds ONE unit, so every id in a chorus list must be
// `size: 'tile'`. A `column` unit fills all three rows at once and can never
// man row 0 and row 2 as two separate speakers.

// ── Empire: profane_chorus ─────────────────────────────────────────────────

const LITANY_CHORUS_IDS = ['e21', 'e211', 'e2111', 'e212', 'e2121'];

const LITANY_LEAD_IDS = [
  'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
  'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212',
];

const LITANY_TARGET_IDS = [
  'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
           'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42',
  'h_d_2', 'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42',
           'h_d_2_b2', 'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42',
  'h_d_3', 'h_d_3_a2', 'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42',
           'h_d_3_b2', 'h_d_3_b3', 'h_d_3_b41', 'h_d_3_b42',
  'opb_e5', 'opb_e51', 'opb_e511',
];

// ── Grail of Sorrow: clean_passage ─────────────────────────────────────────

const CLEAN_PASSAGE_CHORUS_IDS = ['gs1', 'gs11', 'gs111', 'gs1111','gs4','gs41','gs411','gs4111'];

const CLEAN_PASSAGE_LEAD_IDS = [
  'h_g_2', 'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42',
           'h_g_2_b2', 'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42',
];

const CLEAN_PASSAGE_TARGET_IDS = [
  'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
  'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212',
  'h_e_2', 'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42',
           'h_e_2_b2', 'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42',
  'h_e_3', 'h_e_3_a2', 'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42',
           'h_e_3_b2', 'h_e_3_b3', 'h_e_3_b41', 'h_e_3_b42',
  'opb_e5', 'opb_e51', 'opb_e511',
];

// ── Choir of the Cursed: taken_breath ──────────────────────────────────────

// Choir Servant and Ash Cantor, both lines to tier 4. The Chorister branch
// (d12, d121, d1211, d1212) is the obvious chorus by name and cannot be used:
// those units are `size: 'column'` and fill row 0, 1 and 2 as one body.
const TAKEN_BREATH_CHORUS_IDS = ['d51', 'd511', 'd5111', 'd52', 'd521', 'd5211'];

// Choir Regent, every tier of both paths.
const TAKEN_BREATH_LEAD_IDS = [
  'h_d_2', 'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42',
           'h_d_2_b2', 'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42',
];

// Every Grail hero — Mourning Prophet, Grail Warden, Mother's Voice — plus
// Malgrath the Undying, every tier, as the PvE half (data/units.js, enemies).
const TAKEN_BREATH_TARGET_IDS = [
  'h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42',
           'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42',
  'h_g_2', 'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42',
           'h_g_2_b2', 'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42',
  'h_g_3', 'h_g_3_a2', 'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42',
           'h_g_3_b2', 'h_g_3_b3', 'h_g_3_b41', 'h_g_3_b42',
  'dm_e4', 'dm_e41', 'dm_e411',
];

const LITANIES = [
  {
    id:    'profane_chorus',
    name:  'Profane Chorus',
    name_ru: 'Нечестивый Хор',
    lead:   { ids: LITANY_LEAD_IDS },
    target: { ids: LITANY_TARGET_IDS },
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: LITANY_CHORUS_IDS },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: LITANY_CHORUS_IDS },
      ],
    },
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
      initiative_flat_reduction: 10,
      message:    'Profane Chorus - the Light breaks them: every enemy loses 10 initiative.',
      message_ru: 'Нечестивый Хор — Свет ломает их: все враги теряют 10 инициативы.',
    },
    once_per: 'battle',
  },
  {
    id:    'clean_passage',
    name:  'The Clean Passage',
    name_ru: 'Чистый переход',
    lead:   { ids: CLEAN_PASSAGE_LEAD_IDS },
    target: { ids: CLEAN_PASSAGE_TARGET_IDS },
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: CLEAN_PASSAGE_CHORUS_IDS },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: CLEAN_PASSAGE_CHORUS_IDS },
      ],
    },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      initiative_flat_reduction: 10,
      message:    'The Clean Passage - every enemy loses 10 initiative.',
      message_ru: 'Чистый переход — все враги теряют 10 инициативы.',
    },
    once_per: 'battle',
  },
  {
    id:    'taken_breath',
    name:  'The Taken Breath',
    name_ru: 'Отнятое дыхание',
    lead:   { ids: TAKEN_BREATH_LEAD_IDS },
    target: { ids: TAKEN_BREATH_TARGET_IDS },
    formation: {
      column: 'front',
      rows: [
        { row: 0, role: 'chorus', ids: TAKEN_BREATH_CHORUS_IDS },
        { row: 1, role: 'lead' },
        { row: 2, role: 'chorus', ids: TAKEN_BREATH_CHORUS_IDS },
      ],
    },
    verses: [
      { speaker: 'row0', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row2', strike: 'visual', line: ['placeholder', 'текст'] },
      { speaker: 'row1', strike: 'lethal', line: ['placeholder', 'текст'] },
    ],
    reward: {
      initiative_flat_reduction: 10,
      message:    'The Taken Breath - every enemy loses 10 initiative.',
      message_ru: 'Отнятое дыхание — все враги теряют 10 инициативы.',
    },
    once_per: 'battle',
  },
];

export { LITANIES, LITANY_CHORUS_IDS, LITANY_LEAD_IDS, LITANY_TARGET_IDS };
