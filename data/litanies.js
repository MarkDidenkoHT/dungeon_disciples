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

// Templar and both Mithrail branches.
const LITANY_CHORUS_IDS = ['e21', 'e211', 'e2111', 'e212', 'e2121'];

// Paladin, every tier of both paths.
const LITANY_LEAD_IDS = [
  'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
  'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212',
];

// Every Choir hero: Black Castellan, Choir Regent, Infernal Ascendant — plus
// Sister Aldra, every tier. She is a Demon who wears Holy, which is exactly the
// heresy the chorus is sung over, and she is the only such target outside a PvP
// match: without her the litany is a drill the player can only ever perform
// against another player, and most hosts would never see it fire.
const LITANY_TARGET_IDS = [
  'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
           'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42',
  'h_d_2', 'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42',
           'h_d_2_b2', 'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42',
  'h_d_3', 'h_d_3_a2', 'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42',
           'h_d_3_b2', 'h_d_3_b3', 'h_d_3_b41', 'h_d_3_b42',
  // Sister Aldra, the Crimson Basilica's boss (data/units.js, enemies).
  'opb_e5', 'opb_e51', 'opb_e511',
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
];

export { LITANIES, LITANY_CHORUS_IDS, LITANY_LEAD_IDS, LITANY_TARGET_IDS };
