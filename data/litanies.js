// Litanies - passive battle-start bonuses earned by matching a formation.
//
// Callings are assigned when units are recruited. Matching cells use those
// assignments directly, so the common opening bonus works before either the
// Temple or Proving Grounds is built.
//
// Every entry defines a formation, availability, and a small bonus for the
// matching side. A lead is a hero line; chorus cells are filled by assigned
// callings. The opening litany is the exception: any hero can lead it, and its
// two chorus cells accept two distinct units carrying the same calling.
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
//
// ── The two kinds of cell ─────────────────────────────────────────────────────
//
//   role: 'lead'    the faction hero that anchors the formation.
//   role: 'chorus'  a unit with the named calling. `calling: 'any'` accepts any
//                   assigned calling; a shared `calling_group` can require
//                   several cells to carry the same one.
//
// Faction-specific cells use only that faction's two assigned callings.
//
// ── The lead ──────────────────────────────────────────────────────────────────
//
// The lead is the faction's hero line. It anchors the formation; no kill or
// combat action is part of the requirement.
//
// ── The reward ────────────────────────────────────────────────────────────────
//
// Bonus fields are applied to every living ally on a side when its formation
// matches at battle setup. The bonus lasts for that battle only.
//
//   hp_flat          max HP and current HP added to each living ally
//   shield_flat      starting shield per ally
//   armor_flat       armor points added per ally
//   power_flat       action power added per ally
//   resist_flat      { school: amount }, resistance points added per ally
//
// `message` / `message_ru` is shown in prep alongside the matched litany.
//
// Every hero can lead their faction's litanies. Keep the complete hero lines
// in one place so a new hero cannot silently miss an existing rite.
const HERO_IDS = {
  empire: [
    'h_e_1', 'h_e_11', 'h_e_111', 'h_e_1111', 'h_e_1112',
    'h_e_12', 'h_e_121', 'h_e_1211', 'h_e_1212',
    'h_e_2', 'h_e_2_a2', 'h_e_2_a3', 'h_e_2_a41', 'h_e_2_a42',
    'h_e_2_b2', 'h_e_2_b3', 'h_e_2_b41', 'h_e_2_b42',
    'h_e_3', 'h_e_3_a2', 'h_e_3_a3', 'h_e_3_a41', 'h_e_3_a42',
    'h_e_3_b2', 'h_e_3_b3', 'h_e_3_b41', 'h_e_3_b42',
  ],
  grail: [
    'h_g_1', 'h_g_1_a2', 'h_g_1_a3', 'h_g_1_a41', 'h_g_1_a42',
    'h_g_1_b2', 'h_g_1_b3', 'h_g_1_b41', 'h_g_1_b42',
    'h_g_2', 'h_g_2_a2', 'h_g_2_a3', 'h_g_2_a41', 'h_g_2_a42',
    'h_g_2_b2', 'h_g_2_b3', 'h_g_2_b41', 'h_g_2_b42',
    'h_g_3', 'h_g_3_a2', 'h_g_3_a3', 'h_g_3_a41', 'h_g_3_a42',
    'h_g_3_b2', 'h_g_3_b3', 'h_g_3_b41', 'h_g_3_b42',
  ],
  choir: [
    'h_d_1', 'h_d_1_a2', 'h_d_1_a3', 'h_d_1_a41', 'h_d_1_a42',
    'h_d_1_b2', 'h_d_1_b3', 'h_d_1_b41', 'h_d_1_b42',
    'h_d_2', 'h_d_2_a2', 'h_d_2_a3', 'h_d_2_a41', 'h_d_2_a42',
    'h_d_2_b2', 'h_d_2_b3', 'h_d_2_b41', 'h_d_2_b42',
    'h_d_3', 'h_d_3_a2', 'h_d_3_a3', 'h_d_3_a41', 'h_d_3_a42',
    'h_d_3_b2', 'h_d_3_b3', 'h_d_3_b41', 'h_d_3_b42',
  ],
};

const LITANIES = [

  // The common opening litany is available before either building. Units keep
  // the random calling assigned when recruited; two who happened to draw the
  // same one can fill its simple back-column chorus.
  {
    id: 'first_chorus',
    name: 'The First Chorus',
    name_ru: 'Первый хор',
    availableFromStart: true,
    lead: { ids: [...HERO_IDS.empire, ...HERO_IDS.grail, ...HERO_IDS.choir] },
    formation: { cells: [
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', calling: 'any', calling_group: 'shared' },
      { key: 'B', row: 1, col: 'either', size: 'tile', role: 'lead' },
      { key: 'C', row: 2, col: 'back', size: 'tile', role: 'chorus', calling: 'any', calling_group: 'shared' },
    ] },
    bonus: { hp_flat: 3 },
    message: 'All allies gain 3 max HP.',
    message_ru: 'Все союзники получают 3 к максимальному здоровью.',
  },

  // ── Empire ─────────────────────────────────────────────────────────────────
  {
    id:    'profane_chorus',
    name:  'Argent Hammer',
    name_ru: 'Серебряный Молот',
    // Both Crusade anchors are required; the hero may stand in either middle-row cell.
    lead: { ids: HERO_IDS.empire },
    formation: { cells: [
      // Crusade anchor.
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', calling: 'crusade' },
      // Lead.
      { key: 'B', row: 1, col: 'either', size: 'tile', role: 'lead' },
      // Crusade anchor.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', calling: 'crusade' },
    ] },
    bonus: { power_flat: 1 },
    message: 'All allies gain 1 power.',
    message_ru: 'Все союзники получают 1 силу.',
  },
  {
    id:    'unbroken_banner',
    name:  'Duty Eternal',
    name_ru: 'Вечный долг',
    // The two Vigil anchors distinguish this formation from Argent Hammer.
    lead: { ids: HERO_IDS.empire },
    formation: { cells: [
      // A: required Vigil on the top back cell.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', calling: 'vigil' },
      // Lead.
      { key: 'B', row: 1, col: 'either', size: 'tile', role: 'lead' },
      // Second Vigil anchor.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', calling: 'vigil' },
    ] },
    bonus: { shield_flat: 5 },
    message: 'All allies begin with 5 shield.',
    message_ru: 'Все союзники начинают бой со щитом 5.',
  },

  // ── Grail of Sorrow: the Grail Warden's litanies ──────────────────────────────────
  {
    id:    'carried_cup',
    name:  'The Carried Cup',
    name_ru: 'Несомая чаша',
    // Back column left, front right - the board as the Litanies page draws it:
    //   A C
    //   . B
    //   . .
    //
    // Every Grail hero line can lead from either middle-row cell.
    lead: { ids: HERO_IDS.grail },
    formation: { cells: [
      // Acceptance anchor.
      { key: 'A', row: 0, col: 'back', size: 'tile', role: 'chorus', calling: 'acceptance' },
      // Denial anchor.
      { key: 'C', row: 0, col: 'front', size: 'tile', role: 'chorus', calling: 'denial' },
      // Lead.
      { key: 'B', row: 1, col: 'either', size: 'tile', role: 'lead' },
    ] },
    bonus: { resist_flat: { life: 5 } },
    message: 'All allies gain 5 life resistance.',
    message_ru: 'Все союзники получают 5 сопротивления жизни.',
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
    // Every Grail hero line can lead from either middle-row cell.
    lead: { ids: HERO_IDS.grail },
    formation: { cells: [
      // Acceptance anchor.
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', calling: 'acceptance' },
      // Lead.
      { key: 'B', row: 1, col: 'either', size: 'tile', role: 'lead' },
      // Second Acceptance anchor.
      { key: 'C', row: 2, col: 'back', size: 'tile', role: 'chorus', calling: 'acceptance' },
    ] },
    bonus: { armor_flat: 5 },
    message: 'All allies gain 5 armor.',
    message_ru: 'Все союзники получают 5 брони.',
  },
  // ── Choir of the Cursed ───────────────────────────────────────────────────
  {
    id:    'taken_breath',
    name:  'The Taken Breath',
    name_ru: 'Отнятое дыхание',
    // Back column left, front right - the board as the Litanies page draws it:
    //   B .
    //   B .
    //   A C
    //
    // Every Choir hero line can lead from either middle-row cell.
    lead: { ids: HERO_IDS.choir },
    formation: { cells: [
      // Descant anchor.
      { key: 'B', row: 0, col: 'back', size: 'tile', role: 'chorus', calling: 'descant' },
      // Lead.
      { key: 'A', row: 1, col: 'either', size: 'tile', role: 'lead' },
      // Hunger anchor.
      { key: 'C', row: 2, col: 'front', size: 'tile', role: 'chorus', calling: 'hunger' },
    ] },
    bonus: { resist_flat: { death: 5 } },
    message: 'All allies gain 5 death resistance.',
    message_ru: 'Все союзники получают 5 сопротивления смерти.',
  },
  // ── Choir of the Cursed ───────────────────────────────────────────────────
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
    lead: { ids: HERO_IDS.choir },
    formation: { cells: [
      // Hunger anchor.
      { key: 'A', row: 0, col: 'front', size: 'tile', role: 'chorus', calling: 'hunger' },
      // Lead.
      { key: 'B', row: 1, col: 'either', size: 'tile', role: 'lead' },
      // Descant anchor.
      { key: 'C', row: 2, col: 'back', size: 'tile', role: 'chorus', calling: 'descant' },
    ] },
    bonus: { power_flat: 1 },
    message: 'All allies gain 1 power.',
    message_ru: 'Все союзники получают 1 силу.',
  },
];

// A formation matches a unit's complete footprint, not just its anchor. This
// shared matcher keeps the battle-start grant and battle-prep preview aligned.
function litanyCellFootprints(cell, frontCol) {
  const size = cell.size ?? 'tile';
  if (size === 'row') return [[cell.row * 2, cell.row * 2 + 1]];
  if (cell.col === 'either') return [[cell.row * 2], [cell.row * 2 + 1]];
  const col = cell.col === 'front' ? frontCol : cell.col === 'back' ? 1 - frontCol : cell.col;
  const at = cell.row * 2 + col;
  if (size === 'column') return [[at, at + 2]];
  return [[at]];
}

export function matchLitanyFormation(def, units, { frontCol = 1 } = {}) {
  if (!def?.formation?.cells?.length || !Array.isArray(units)) return null;
  const used = new Set();
  const speakers = {};
  const groupCallings = {};
  const sameCells = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  for (const cell of def.formation.cells) {
    const wants = litanyCellFootprints(cell, frontCol);
    const occupant = units.find(unit => {
      if (unit.alive === false || used.has(unit.id)) return false;
      if (!wants.some(cells => sameCells(cells, [...(unit.footprint || [])].sort((a, b) => a - b)))) return false;
      if (cell.role === 'lead') return (def.lead?.ids || []).includes(unit.unitId);
      if (cell.role !== 'chorus') return false;
      if (cell.calling === 'any') {
        if (!unit.calling) return false;
        if (cell.calling_group && groupCallings[cell.calling_group] && groupCallings[cell.calling_group] !== unit.calling) return false;
        return true;
      }
      return !!cell.calling && unit.calling === cell.calling;
    });
    if (!occupant) return null;
    used.add(occupant.id);
    speakers[cell.key] = occupant;
    if (cell.calling === 'any' && cell.calling_group && !groupCallings[cell.calling_group]) {
      groupCallings[cell.calling_group] = occupant.calling;
    }
  }
  return { def, speakers, lead: Object.values(speakers).find(unit => (def.lead?.ids || []).includes(unit.unitId)) || null };
}

export function matchAvailableLitany(units, { frontCol = 1, unlocked = false } = {}) {
  // The unlocked faction rites take precedence; the common opening rite is the
  // fallback. This prevents an easy starter layout from masking a stronger one.
  const defs = unlocked
    ? [...LITANIES.filter(def => !def.availableFromStart), ...LITANIES.filter(def => def.availableFromStart)]
    : LITANIES.filter(def => def.availableFromStart);
  for (const def of defs) {
    const match = matchLitanyFormation(def, units, { frontCol });
    if (match) return match;
  }
  return null;
}

export { LITANIES };
