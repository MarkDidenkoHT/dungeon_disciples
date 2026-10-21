// Litanies - scripted multi-speaker executions. See docs/combat-barks-design.md §5.
//
// Unlike a bark, a litany is NOT cosmetic: it stages the killing blow (the
// chorus speaks and may perform for show) and pays a mechanical reward. Its
// required positions and speakers are defined by its formation below.
//
// A CHORUS CELL MAY NAME A CALLING OR MARK `all_alive`; A LEAD CELL NAMES UNITS.
// Still no tags and no filters: a tag does not describe a role well enough for a
// scripted moment, and the Choir Regent is not tagged Demon and is still a heretic
// to be purged. A CALLING is not a tag - it is the one decision about a unit that
// belongs to the player (data/callings.js), bought with 500 gold and resettable -
// so a cell naming one is an instruction to the player, which is what a formation
// is for.
//
// That is what replaced 298 hardcoded ids. Who may LAND THE BLOW is still an
// authoring decision, made by name; who may SING is the player's.
//
// ONE LITANY IS ONE OBJECT, whole. The lead ids, every cell, the verses and the
// reward are written out inside the object, so editing a litany is editing that
// object and nothing else can be affected by it.
//
// THE ONE EXCEPTION IS THE TARGET, which is LITANY_TARGETS below and is the same
// for all seventeen. A litany is staged over the death of the other side's CHAMPION,
// and that is the whole of the condition: who is worth the rite does not change
// from one litany to the next, so writing a per-litany list seventeen times only
// gave seventeen places for the same answer to drift.
//
// SEVENTEEN litanies: five for the Empire, six for each other faction.
//
// ── The formation ─────────────────────────────────────────────────────────────
//
// `cells` is a list of PLACES on the acting side's own half of the board. Each
// cell carries its own letter, its grid row (0 top, 2 bottom), its column
// ('front' / 'back' / 'either', relative to that side) and its `size` - because a cell is as
// big as the unit that stands in it:
//
//   'tile'    one square, at (row, col).
//   'row'     BOTH columns of `row`. `col` is 'both' and is not read.
//   col 'either' on a tile lead means one unit may fill either square in that row.
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
// ── The target ────────────────────────────────────────────────────────────────
//
// LITANY_TARGETS, one list, shared by every litany: an ENEMY CHAMPION. No litany
// names a target of its own and none may - fireLitany reads this list and nothing
// else.
//
// It holds every HERO line of all three playable factions, every tier and both
// branches, and every REGIONAL BOSS line. The heroes are the point; the bosses
// are there because a list of enemy heroes alone makes a litany a drill that can
// only fire in a PvP match, which most hosts never see.
//
// Own-faction heroes are in the list on purpose. A mirror match is two hosts of
// one faction, and a Paladin who cuts down another Paladin has still felled a
// champion - the old per-litany lists made that single case silent for no reason
// a player could see.
//
// A new region's boss belongs here, as a whole line, the day it ships. The
// Reliquary Titan is deliberately out: the Colossus is its own daily activity
// rather than a region's boss.
//
// ── The three kinds of cell ───────────────────────────────────────────────────
//
//   role: 'lead'    the unit that lands the real blow. `def.lead.ids`, a unit
//                   LINE written out by name. The only cell that kills.
//   role: 'hero'    this litany's own hero, `def.hero.ids`. Only on the four
//                   whose hero is a healer and so cannot lead - it sings from
//                   here while something of its own takes the blow.
//   role: 'chorus'  `calling`, one id from data/callings.js, unless the cell has
//                   `all_alive: true`, in which case every living ally except
//                   the lead speaks together. A calling on that cell still
//                   requires its placed anchor to have that calling; the
//                   calling only distinguishes the formation, not the chorus.
//
// A cell's calling must be one of the TWO its faction has. A litany led by the
// Empire naming `hunger` is a litany that can never fire, and nothing at run
// time would say why.
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
// `speaker` is a cell letter, or `all_alive` for every living ally except the
// lead when the formation has an all_alive chorus cell. `strike` is what that
// speaker DOES, and it must match what the unit actually does in data/units.js:
//
//   'visual'   an attacker's blow or a decayer's touch, played at the victim.
//              Cosmetic - no damage, no triggers, no turn spent - and range is
//              not checked.
//   'support'  a healer's or shielder's own rite, played over its own side
//              instead of at the corpse. Priests, Standart Bearers, menders and
//              the ash singers perform; they do not swing.
//   'line'     the speaker says the line without performing an action.
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
// THE REWARD IS WHAT THE CHORUS IS, one side per singing cell. Each calling has
// a `pays` in data/callings.js:
//
//   pays: 'ally'   (Vigil, Denial, Descant)       ally_heal_flat / ally_shield_flat
//   pays: 'enemy'  (Crusade, Acceptance, Hunger)  enemy_damage_flat / enemy_decay_flat
//                                                 / the stagger fields
//
// Two cells of one calling put the whole reward on that side; one of each pays
// both. A 'hero' cell is one of the four healer heroes, so it pays the ally side
// like any other rite. This replaced "the reward is what the chorus DID", which
// could not survive a cell that no longer knows which unit will fill it.
//
// Nothing in the engine enforces it - a reward that does not match its callings
// is a bug here.
//
// Armor and resistances are capped at MITIGATION_CAP_PCT and a shield or decay
// pool at POOL_CAP_PCT of max HP, so a unit already at the ceiling gains nothing
// from those - the same as any other buff.
//
// `message` / `message_ru` is what the battle log and the Litanies page print. It
// is written FROM the fields above it - one clause per side, naming what each
// number is - so the sentence and the mechanics cannot disagree. Edit it by hand
// and it is yours; just keep it saying what the fields do.
//
// ── Which one fires ──────────────────────────────────────────────────────────
//
// fireLitany takes the FIRST match in this array. Each hero's two litanies are
// mutually exclusive, and for each pair it is one of three things that does it:
//
//   the LEAD is in a different place        (iron_sentence / last_volley,
//                                            taken_breath / ash_antiphon)
//   a shared square wants different SIZES   a tile cell and half of a row or
//                                           column unit cannot both be filled
//   a shared square wants different CALLINGS
//                                           (profane_chorus / unbroken_banner,
//                                            clean_passage / carried_cup,
//                                            long_wailing / mothers_answer)
//
// The third is the one to keep in mind when editing: two chorus cells on the
// same square of a hero's two litanies MUST name different callings, or a rich
// board satisfies both and the player only ever sees the earlier one.

// Every champion a litany may be staged over. ONE list, read by fireLitany for
// all seventeen - see "The target" above.
const LITANY_TARGETS = [

  // ── The heroes ──────────────────────────────────────────────────────────────
  // All nine lines, every tier, both branches. Own faction included: a mirror
  // match is still a champion felled.

  // Empire: Paladin, Inquisitor, Artificer.
  'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
  'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212',
  'h_e_2', 'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42',
  'h_e_2_b2', 'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42',
  'h_e_3', 'h_e_3_a2', 'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42',
  'h_e_3_b2', 'h_e_3_b3', 'h_e_3_b41', 'h_e_3_b42',

  // Choir of the Cursed: Black Castellan, Choir Regent, Infernal Ascendant.
  'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
  'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42',
  'h_d_2', 'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42',
  'h_d_2_b2', 'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42',
  'h_d_3', 'h_d_3_a2', 'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42',
  'h_d_3_b2', 'h_d_3_b3', 'h_d_3_b41', 'h_d_3_b42',

  // Grail of Sorrow: Mourning Prophet, Grail Warden, Mother's Voice.
  'h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42',
  'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42',
  'h_g_2', 'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42',
  'h_g_2_b2', 'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42',
  'h_g_3', 'h_g_3_a2', 'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42',
  'h_g_3_b2', 'h_g_3_b3', 'h_g_3_b41', 'h_g_3_b42',

  // ── The regional bosses ─────────────────────────────────────────────────────
  // So a litany is not a PvP-only drill. (data/units.js, enemies)

  'opb_e5', 'opb_e51', 'opb_e511',   // Sister Aldra, the Crimson Basilica
  'dm_e4', 'dm_e41', 'dm_e411',      // Malgrath the Undying
  'mv_e4', 'mv_e41', 'mv_e411',      // Cryodrox, the Glittering Abyss
];

const LITANIES = [

  // ── Empire: Argent Hammer (Inquisitor) and Duty Eternal (Paladin) ────────────
  {
    id:    'profane_chorus',
    name:  'Argent Hammer',
    name_ru: 'Серебряный Молот',
    // A and C are Crusade callers; the Inquisitor lead may stand in either
    // column of row 1. The merged B cell on the page shows those two choices.
    //
    // Lead: Inquisitor, every tier of both paths (moved from Cinder Verdict).
    lead: { ids: [
      'h_e_2', 'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42',
      'h_e_2_b2', 'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42',
    ] },
    formation: { cells: [
      // A: a Crusade - like the other, so the whole reward lands on the enemy side.
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', calling: 'crusade' },
      // B: the lead kills from either front or back in the middle row.
      { key: 'B', row: 1, col: 'either', size: 'tile', role: 'lead' },
      // C: a Crusade - like the other, so the whole reward lands on the enemy side.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', calling: 'crusade' },
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
      message:    'Enemies lose 10 initiative.',
      message_ru: 'Враги теряют 10 инициативы.',
    },
    once_per: 'battle',
  },
  {
    id:    'unbroken_banner',
    name:  'Duty Eternal',
    name_ru: 'Вечный долг',
    // A and C are both required Vigil anchors; C sits on the bottom front cell
    // to keep this distinct from Profane Chorus, which needs Crusade in C. The
    // speaking chorus itself is every living ally except the lead.
    lead: { ids: [
      'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
      'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212',
    ] },
    formation: { cells: [
      // A: required Vigil on the top back cell.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', calling: 'vigil' },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
      // C: Vigil anchor distinguishes this from Profane Chorus; everyone joins.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', calling: 'vigil', all_alive: true },
    ] },
    verses: [
      { speaker: 'B', strike: 'line',
        line: ['What is your duty!', 'В чём ваш долг!'] },
      { speaker: 'all_alive', strike: 'line',
        line: ['To serve Mithrails will.', 'Служить воле Митраила.'] },
      { speaker: 'B', strike: 'line',
        line: ['What is Mithrails will!', 'Какова воля Митраила!'] },
      { speaker: 'all_alive', strike: 'line',
        line: ['That we fight and die.', 'Сражаться и умирать.'] },
      { speaker: 'B', strike: 'line',
        line: ['What is death!', 'Что есть смерть!'] },
      { speaker: 'all_alive', strike: 'line',
        line: ['It is our Duty!', 'Это наш долг!'] },
    ],
    reward: {
      ally_heal_flat: 5,
      ally_shield_flat: 5,
      message:    'Allies are healed for 5 HP and gain a 5 shield.',
      message_ru: 'Союзники лечатся на 5 HP и получают щит 5.',
    },
    once_per: 'battle',
  },

  // ── Empire: the Inquisitor's litanies ─────────────────────────────────────────────
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
      // A: a Vigil - the ally half of the reward.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', calling: 'vigil' },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', size: 'tile', role: 'lead' },
      // C: a Crusade - the enemy half of the reward.
      { key: 'C', row: 1, col: 'front', size: 'column', role: 'chorus', calling: 'crusade' },
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
      message:    'Allies gain a 5 shield and enemies take 5 damage.',
      message_ru: 'Союзники получают щит 5, враги получают 5 урона.',
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
    // The hero of this litany, for the cell marked role: 'hero'. The Artificer
    // cannot be the lead - a healer lands no blows - so the hero line is named
    // here, apart from the lead, and sings from a cell of its own.
    hero: { ids: [
      'h_e_3', 'h_e_3_a2', 'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42',
      'h_e_3_b2', 'h_e_3_b3', 'h_e_3_b41', 'h_e_3_b42',
    ] },
    lead: { ids: [
      'e3', 'e31', 'e311', 'e3111',
    ] },
    formation: { cells: [
      // A: the Artificer. She repairs, so she cannot land the blow - B does.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'hero' },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'column', role: 'lead' },
      // C: a Crusade - the enemy half of the reward.
      { key: 'C', row: 2, col: 'back', size: 'tile', role: 'chorus', calling: 'crusade' },
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
      message:    'Allies are healed for 5 HP and enemies take 5 damage.',
      message_ru: 'Союзники лечатся на 5 HP, враги получают 5 урона.',
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
    // The hero of this litany, for the cell marked role: 'hero'. The Artificer
    // cannot be the lead - a healer lands no blows - so the hero line is named
    // here, apart from the lead, and sings from a cell of its own.
    hero: { ids: [
      'h_e_3', 'h_e_3_a2', 'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42',
      'h_e_3_b2', 'h_e_3_b3', 'h_e_3_b41', 'h_e_3_b42',
    ] },
    lead: { ids: [
      'e32', 'e321', 'e3211',
    ] },
    formation: { cells: [
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 0, col: 'back', size: 'column', role: 'lead' },
      // A: the Artificer. She repairs, so she cannot land the blow - B does.
      { key: 'A', row: 2, col: 'back', size: 'tile', role: 'hero' },
      // C: a Vigil - the ally half of the reward.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', calling: 'vigil' },
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
      message:    'Allies are healed for 5 HP and gain a 5 shield.',
      message_ru: 'Союзники лечатся на 5 HP и получают щит 5.',
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
      // A: a Acceptance - like the other, so the whole reward lands on the enemy side.
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', calling: 'acceptance' },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
      // C: a Acceptance - like the other, so the whole reward lands on the enemy side.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', calling: 'acceptance' },
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
      message:    'Enemies lose 10 initiative.',
      message_ru: 'Враги теряют 10 инициативы.',
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
      // A: a Acceptance - the enemy half of the reward.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', calling: 'acceptance' },
      // C: a Denial - the ally half of the reward.
      { key: 'C', row: 0, col: 'front', size: 'tile', role: 'chorus', calling: 'denial' },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
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
      message:    'Allies are healed for 5 HP and enemies take 5 damage.',
      message_ru: 'Союзники лечатся на 5 HP, враги получают 5 урона.',
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
      // A: a Acceptance - like the other, so the whole reward lands on the enemy side.
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', calling: 'acceptance' },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
      // C: a Acceptance - like the other, so the whole reward lands on the enemy side.
      { key: 'C', row: 2, col: 'back', size: 'tile', role: 'chorus', calling: 'acceptance' },
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
      message:    'Enemies take 5 damage and lose 5 armor.',
      message_ru: 'Враги получают 5 урона и теряют 5 брони.',
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
      // A: a Denial - the ally half of the reward.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', calling: 'denial' },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
      // C: a Acceptance - the enemy half of the reward.
      { key: 'C', row: 2, col: 'both', size: 'row', role: 'chorus', calling: 'acceptance' },
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
      message:    'Allies are healed for 5 HP and enemies take 5 damage.',
      message_ru: 'Союзники лечатся на 5 HP, враги получают 5 урона.',
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
      // A: a Acceptance - like the other, so the whole reward lands on the enemy side.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', calling: 'acceptance' },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', size: 'tile', role: 'lead' },
      // C: a Acceptance - like the other, so the whole reward lands on the enemy side.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', calling: 'acceptance' },
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
      message:    'Enemies take 5 damage and gain 5 decay.',
      message_ru: 'Враги получают 5 урона и 5 Тлена.',
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
      // A: a Denial - the ally half of the reward.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', calling: 'denial' },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', size: 'tile', role: 'lead' },
      // C: a Acceptance - the enemy half of the reward.
      { key: 'C', row: 1, col: 'front', size: 'column', role: 'chorus', calling: 'acceptance' },
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
      message:    'Allies are healed for 5 HP and enemies take 5 damage.',
      message_ru: 'Союзники лечатся на 5 HP, враги получают 5 урона.',
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
    // The hero of this litany, for the cell marked role: 'hero'. The Choir Regent
    // cannot be the lead - a healer lands no blows - so the hero line is named
    // here, apart from the lead, and sings from a cell of its own.
    hero: { ids: [
      'h_d_2', 'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42',
      'h_d_2_b2', 'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42',
    ] },
    lead: { ids: [
      'd12', 'd121', 'd1211', 'd1212',
    ] },
    formation: { cells: [
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 0, col: 'back', size: 'column', role: 'lead' },
      // A: the Choir Regent. His song is a heal, so he cannot land the blow - B does.
      { key: 'A', row: 2, col: 'back', size: 'tile', role: 'hero' },
      // C: a Hunger - the enemy half of the reward.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', calling: 'hunger' },
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
      message:    'Allies are healed for 5 HP and enemies lose 10 initiative.',
      message_ru: 'Союзники лечатся на 5 HP, враги теряют 10 инициативы.',
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
    // The hero of this litany, for the cell marked role: 'hero'. The Choir Regent
    // cannot be the lead - a healer lands no blows - so the hero line is named
    // here, apart from the lead, and sings from a cell of its own.
    hero: { ids: [
      'h_d_2', 'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42',
      'h_d_2_b2', 'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42',
    ] },
    lead: { ids: [
      'd1', 'd11', 'd111', 'd1111',
    ] },
    formation: { cells: [
      // A: the Choir Regent. His song is a heal, so he cannot land the blow - B does.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'hero' },
      // C: a Hunger - the enemy half of the reward.
      { key: 'C', row: 1, col: 'back', size: 'tile', role: 'chorus', calling: 'hunger' },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'column', role: 'lead' },
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
      message:    'Allies are healed for 5 HP and enemies take 5 damage.',
      message_ru: 'Союзники лечатся на 5 HP, враги получают 5 урона.',
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
      // A: a Hunger - the enemy half of the reward.
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', calling: 'hunger' },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
      // C: a Descant - the ally half of the reward.
      { key: 'C', row: 2, col: 'back', size: 'tile', role: 'chorus', calling: 'descant' },
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
      message:    'Allies are healed for 5 HP and enemies take 5 damage.',
      message_ru: 'Союзники лечатся на 5 HP, враги получают 5 урона.',
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
      // A: a Hunger - like the other, so the whole reward lands on the enemy side.
      { key: 'A', row: 0, col: 'both', size: 'row', role: 'chorus', calling: 'hunger' },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'front', size: 'tile', role: 'lead' },
      // C: a Hunger - like the other, so the whole reward lands on the enemy side.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', calling: 'hunger' },
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
      message:    'Enemies take 5 damage and lose 5 initiative.',
      message_ru: 'Враги получают 5 урона и теряют 5 инициативы.',
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
      // A: a Hunger - like the other, so the whole reward lands on the enemy side.
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', calling: 'hunger' },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', size: 'tile', role: 'lead' },
      // C: a Hunger - like the other, so the whole reward lands on the enemy side.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', calling: 'hunger' },
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
      message:    'Enemies take 5 damage and lose 5 armor.',
      message_ru: 'Враги получают 5 урона и теряют 5 брони.',
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
      // A: a Descant - the ally half of the reward.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', calling: 'descant' },
      // B: the lead - the only cell that kills. Its own list is `lead` below.
      { key: 'B', row: 1, col: 'back', size: 'tile', role: 'lead' },
      // C: a Hunger - the enemy half of the reward.
      { key: 'C', row: 2, col: 'both', size: 'row', role: 'chorus', calling: 'hunger' },
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
      message:    'Allies are healed for 5 HP and enemies take 5 damage.',
      message_ru: 'Союзники лечатся на 5 HP, враги получают 5 урона.',
    },
    once_per: 'battle',
  },
];

export { LITANIES, LITANY_TARGETS };
