// Formation synergies — bonds that exist between two ALLIED units because of
// where they stand relative to each other.
//
// This is the shared source of truth for three consumers that must never
// disagree:
//   * battle prep  (public/formation-synergy-view.js) previews the bond while
//     the player is still arranging units,
//   * the battle engine (utils/passive-processor.js) forms the bond for real at
//     battle start,
//   * battle-fx     (public/battle-fx.js) draws the same picture for both.
//
// Before this file, the prep preview and the server's bond each carried their
// own copy of the row/column rule. Two copies of a geometry rule drift, and the
// failure is the worst kind: prep promises a bond that the battle then refuses
// to honour. So the RELATION functions below are the only place adjacency is
// decided, and everyone calls resolveSynergies().
//
// A synergy describes WHO bonds with WHOM and WHAT IT LOOKS LIKE. It never
// describes what the bond does — the mechanical effect stays with the ability
// in data/unit_abilities.js, where the rest of the ability already lives.

const ROWS = 3;
const COLS = 2;
const cellRow = i => Math.floor(i / COLS);
const cellCol = i => i % COLS;
const cellIndex = (row, col) => row * COLS + col;

// ── Relations ────────────────────────────────────────────────────────────────
//
// Each takes the two units' FOOTPRINTS (arrays of cell indices, so a 1×2 or 2×1
// unit is judged on every cell it occupies, not on a notional single square)
// and answers whether the pair stands in that arrangement.
//
// The grid is two columns wide, so "directly in front" and "directly behind"
// are the same test from opposite ends: same row, other column. They are kept
// as separate names because a registry entry reads far better saying which way
// it faces, and because a wider grid would eventually tell them apart.
// Which column a side's FRONT rank is. Mirrored, because the two armies face
// each other across the board: see frontCol in utils/battle-engine.js, the rule
// melee reach and intercepts already use.
const frontColFor = side => (side === 'enemy' ? 0 : 1);

// Each relation takes the two footprints, plus the two units themselves, for the
// few rules that need to know which way a side is facing.
const RELATIONS = {
  // NOT directional, despite the names: on a two-column board "the other column
  // in the same row" is the whole of it, and this is the rule Unity has always
  // used. partner_behind below is the one that really knows front from back.
  front:     (a, b) => sharesRowAcrossColumns(a, b),
  behind:    (a, b) => sharesRowAcrossColumns(a, b),
  // The partner stands in the BACK rank, directly behind a source that stands in
  // the front rank — a Caster sheltering behind the Warrior it sings for.
  // Genuinely directional, so it reads correctly for both armies.
  partner_behind: (a, b, source) => {
    const front = frontColFor(source.side);
    const back  = 1 - front;
    return a.some(x => cellCol(x) === front &&
                  b.some(y => cellCol(y) === back && cellRow(x) === cellRow(y)));
  },
  same_row:  (a, b) => a.some(x => b.some(y => cellRow(x) === cellRow(y))),
  same_col:  (a, b) => a.some(x => b.some(y => cellCol(x) === cellCol(y))),
  adjacent:  (a, b) => a.some(x => b.some(y =>
                 Math.abs(cellRow(x) - cellRow(y)) + Math.abs(cellCol(x) - cellCol(y)) === 1)),
  // Note this is NOT `adjacent` restricted to a column: it reaches one row past
  // the source's EXTENT in each column it occupies, which for a multi-cell unit
  // is not the same set. A 2x1 unit lying across a row occupies both columns and
  // so reaches four cells, two above and two below.
  column_adjacent: (a, b) => {
    const cells = columnAdjacentCells(a);
    return b.some(y => cells.includes(y));
  },
  // Beside me in this row, whichever rank either of us is in. `front`/`behind`
  // compute the same thing on a two-column board; this name is for rules that
  // genuinely do not care which way round the pair stands.
  same_row_any: (a, b) => sharesRowAcrossColumns(a, b),
  any_ally:  () => true,
};

// The cells one row beyond a footprint, per column it occupies. Used by
// `column_adjacent` and by the battle engine's Inspiration targeting, which
// calls this rather than keeping its own copy.
//
//   row0  .            a unit at row1/col0 reaches row0 and row2 of col0;
//   row1  X   ->       a unit at row0/col0 reaches only row1, since there is
//   row2  .            no row above it.
function columnAdjacentCells(cells) {
  const rowsByCol = {};
  for (const cell of cells) {
    const col = cellCol(cell), row = cellRow(cell);
    (rowsByCol[col] = rowsByCol[col] || []).push(row);
  }
  const targets = new Set();
  for (const [col, rows] of Object.entries(rowsByCol)) {
    const colNum = Number(col);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    if (minRow - 1 >= 0)        targets.add(cellIndex(minRow - 1, colNum));
    if (maxRow + 1 <= ROWS - 1) targets.add(cellIndex(maxRow + 1, colNum));
  }
  return [...targets];
}

function sharesRowAcrossColumns(a, b) {
  return a.some(x => b.some(y => cellRow(x) === cellRow(y) && cellCol(x) !== cellCol(y)));
}

// ── Predicates ───────────────────────────────────────────────────────────────
//
// `source` and `partner` are DATA, not functions, so the registry stays
// serialisable and a synergy can be described without writing code. Every key
// present must match (they are AND-ed); a key may name one value or a list, in
// which case any one of them satisfies it.
function matchesSpec(unit, spec) {
  if (!spec) return false;
  for (const [key, want] of Object.entries(spec)) {
    const wanted = Array.isArray(want) ? want : [want];
    let ok = false;
    if (key === 'tag')     ok = wanted.some(w => (unit.tags ?? []).includes(w));
    // Matched on the FULL key ('unity 1'), so ranks can be told apart, and on
    // the base name ('unity'), so a synergy can opt into every rank at once.
    else if (key === 'ability') ok = wanted.some(w => (unit.abilityKeys ?? []).some(k => k === w || baseKey(k) === baseKey(w)));
    else if (key === 'type')    ok = wanted.includes(unit.type);
    else if (key === 'unit_id') ok = wanted.includes(unit.unitId);
    else return false;                    // unknown key: never silently pass
    if (!ok) return false;
  }
  return true;
}

const baseKey = k => String(k || '').replace(/\s+\d+$/, '');

// ── Registry ─────────────────────────────────────────────────────────────────
//
// `present` is how the bond SHOWS, and it is the main thing that varies:
//
//   'tether'  a cord between the two units, a sigil on the receiver, and a glow
//             on both, held for as long as the bond stands. For a bond that is
//             about the LINK itself — two units becoming one thing.
//   'flash'   a bloom on the affected units and nothing after. For a bond that
//             is about the BUFF, where the lasting record belongs in the normal
//             buff-icon row rather than in an overlay of its own.
//
// effect: the key into EFFECTS in public/battle-fx.js. fx: the palette that
// effect is built from, so a second bond of the same shape is a row in this
// table rather than another hand-written animation.
//
// multi: bond every matching partner, not just the first.
// One green for the whole Inspiration family — every rank and every stat. See
// the note on inspiration_damage below for why they must not differ.
const INSPIRATION_FX = {
  glow: 0x8cff9b,       // the bloom on each inspired unit
  core: 0xd6ffdc,       // its bright centre
};

const FORMATION_SYNERGIES = {
  unity_bond: {
    id: 'unity_bond',
    source:   { ability: 'unity 1' },
    partner:  { tag: 'Holy' },
    relation: 'front',
    present:  'tether',
    effect:   'unity_bond',
    fx: {
      tether: 0xffe6a8,      // the cord itself
      glow:   0xfff2cf,      // the bloom on both cells
      mark:   0xffd77a,      // the sigil on the host
    },
    label: 'Unity', label_ru: 'Единство',
  },

  // The Vampire mirror of Unity. Identical mechanics and an identical
  // presentation — only the host tag and the palette differ, which is the whole
  // reason this table exists: a second guardian bond is a row, not a rewrite.
  blood_bond: {
    id: 'blood_bond',
    source:   { ability: 'blood_bond 1' },
    partner:  { tag: 'Vampire' },
    relation: 'front',
    present:  'tether',
    effect:   'blood_bond',
    fx: {
      tether: 0xc2102a,      // the cord — arterial, not orange
      glow:   0x6e0716,      // a dark bloom, so the pair reads as heavy
      mark:   0xff2d44,      // the sigil on the host, the brightest part
    },
    label: 'Blood Bond', label_ru: 'Кровные узы',
  },

  // Matched on the BASE name, so ranks 1 and 2 both take this row. They look the
  // same deliberately: the rank changes how much initiative is granted, and the
  // number is already on the buff icon.
  //
  // `partner: {}` is every ally. The tag on the ability scales the VALUE (2 per
  // Caster ally) — it never decides who is eligible.
  inspiration_initiative: {
    id: 'inspiration_initiative',
    source:   { ability: 'inspiration_initiative' },
    partner:  {},
    relation: 'column_adjacent',
    multi:    true,
    present:  'flash',
    effect:   'inspiration_flash',
    fx: INSPIRATION_FX,
    // The buff icon this bond leaves behind, in the ability-icon folder. Battle
    // renders it through BUFF_DEFS, prep as a badge on the cell. `valueParam`
    // names the per-tag parameter on the ABILITY that prep multiplies by the tag
    // count, so the badge can show a live number while units are still moving.
    buff: { icon: 'inspiration_initiative.jpg', suffix: '', valueParam: 'inspiration_value_per_tag' },
    label: 'Inspiration', label_ru: 'Вдохновение',
  },

  // The other two Inspirations are the same bond with a different payload, so
  // they are the same row with a different icon. They deliberately share
  // INSPIRATION_FX: two of these can live on ONE unit (see units.js, where a
  // couple of captains carry damage and max HP together), which means one
  // source bonding twice to the same neighbour. A single flash colour is what
  // makes that read as one event; the stat is told apart by the icon, which
  // carries the number anyway.
  inspiration_damage: {
    id: 'inspiration_damage',
    source:   { ability: 'inspiration_damage' },
    partner:  {},
    relation: 'column_adjacent',
    multi:    true,
    present:  'flash',
    effect:   'inspiration_flash',
    fx: INSPIRATION_FX,
    buff: { icon: 'inspiration_damage.jpg', suffix: '%', valueParam: 'inspiration_value_per_tag' },
    label: 'Inspiration', label_ru: 'Вдохновение',
  },

  inspiration_max_hp: {
    id: 'inspiration_max_hp',
    source:   { ability: 'inspiration_max_hp' },
    partner:  {},
    relation: 'column_adjacent',
    multi:    true,
    present:  'flash',
    effect:   'inspiration_flash',
    fx: INSPIRATION_FX,
    buff: { icon: 'inspiration_max_hp.jpg', suffix: '', valueParam: 'inspiration_value_per_tag' },
    label: 'Inspiration', label_ru: 'Вдохновение',
  },

  // ── Cross-tag bonds ────────────────────────────────────────────────────────
  //
  // The three above pay a tag its own kind. These pay a DIFFERENT kind, so a
  // list of one tag cannot trigger them at all — the mix is the cost.

  // Grail. The horde is livestock: a Zombie opens a vein for the Vampire beside
  // it, every round, and pays for it in its own blood.
  //
  // previewOnly because the battle side is driven by the LOG instead: this fires
  // each round, and a reconcile would show it once at battle start and never
  // again. Prep still previews the pairing, which is the placement decision.
  cattle: {
    id: 'cattle',
    source:      { ability: 'cattle' },
    partner:     { tag: 'Vampire' },
    relation:    'same_row_any',
    present:     'flash',
    effect:      'cattle_flash',
    previewOnly: true,
    fx: {
      glow: 0x8c0f1e,      // dark arterial bloom
      core: 0xff3b52,      // the bright centre of it
    },
    label: 'Cattle', label_ru: 'Скот',
  },

  // Choir. A Caster sheltering directly behind a Warrior sings it forward. The
  // position unlocks it; the number of Casters fielded decides how much — so it
  // is a placement decision AND a roster decision at once.
  //
  // buffs: 'source' — the Warrior carries the ability and keeps the power. Every
  // other bond pays its partner, so this is the first that pays itself, and the
  // partner is a condition rather than a recipient.
  chorus_of_war: {
    id: 'chorus_of_war',
    source:   { ability: 'chorus_of_war' },
    partner:  { tag: 'Caster' },
    relation: 'partner_behind',
    present:  'flash',
    effect:   'chorus_flash',
    buffs:    'source',
    fx: {
      glow: 0xb46cff,      // the choir's light, not the warrior's steel
      core: 0xe9d2ff,
    },
    buff: { icon: 'command.jpg', suffix: '', valueParam: 'chorus_power_per_tag' },
    label: 'Chorus of War', label_ru: 'Хор войны',
  },

  // Empire. An Artificer keeping the machines beside it running. Same reach as
  // Inspiration — one row above and below, in each column the source occupies —
  // but it pays only Constructs, and it scales off Engineers, so neither tag is
  // worth fielding alone.
  fortify: {
    id: 'fortify',
    source:   { ability: 'fortify' },
    partner:  { tag: 'Construct' },
    relation: 'column_adjacent',
    multi:    true,
    present:  'flash',
    effect:   'fortify_flash',
    fx: {
      glow: 0x9fb4c9,      // cold worked steel
      core: 0xe6f0fa,
    },
    buff: { icon: 'reforge.jpg', suffix: '', valueParam: 'inspiration_value_per_tag' },
    label: 'Fortify', label_ru: 'Укрепление',
  },
};

// inspiration_armor exists in data/unit_abilities.js but no unit carries it and
// it has no icon, so it is deliberately absent here. Adding it is one more row
// once something actually has it.

// ── Resolver ─────────────────────────────────────────────────────────────────
//
// units: [{ id, side, cells:[cellIndex], tags:[], abilityKeys:[], type, unitId }]
// Callers adapt their own shape into this — prep from its `occupied` map, the
// engine from its combatants — so neither side's data model leaks in here.
//
// Returns one entry per bond:
//   { defId, def, sourceId, partnerId, sourceCell, partnerCell, key }
//
// sourceCell/partnerCell are the cells of each unit that lie NEAREST the
// partner, so a tether drawn between them attaches to the touching edge of a
// multi-cell unit instead of to some far corner of its footprint.
//
// `key` identifies this exact bond between these exact two units. The prep
// overlay diffs on it to tell a bond that still stands from one that just
// formed, so an unrelated re-render does not replay the formation animation.
function resolveSynergies(units, opts = {}) {
  const defs = opts.registry || FORMATION_SYNERGIES;
  const out = [];
  const alive = (units || []).filter(u => u && Array.isArray(u.cells) && u.cells.length);

  for (const def of Object.values(defs)) {
    const relation = RELATIONS[def.relation];
    // Loud, because the alternative is silent: a registry row naming a relation
    // that does not exist simply never produces a bond, and the ability looks
    // broken everywhere else instead of here.
    if (!relation) {
      console.warn(`[formation_synergies] '${def.id}' names unknown relation '${def.relation}' — no bonds will form`);
      continue;
    }
    for (const source of alive) {
      if (!matchesSpec(source, def.source)) continue;
      // A Unity guardian is itself tagged Holy, so without this it would bond
      // to its own reflection.
      const eligible = p =>
        p.id !== source.id &&
        p.side === source.side &&
        matchesSpec(p, def.partner) &&
        relation(source.cells, p.cells, source, p);
      // A one-to-one bond takes the first match; Inspiration buffs everyone it
      // reaches, which is up to four units for a source lying across a row.
      const partners = def.multi ? alive.filter(eligible) : [alive.find(eligible)].filter(Boolean);
      for (const partner of partners) {
      const [sourceCell, partnerCell] = nearestPair(source.cells, partner.cells);
      out.push({
        defId: def.id, def,
        sourceId: source.id, partnerId: partner.id,
        sourceCell, partnerCell,
        // Where to ATTACH a drawn tether, which is not the same question as
        // which cells are adjacent. A multi-cell unit renders as ONE element
        // spanning its whole footprint, anchored at its first cell, so only the
        // anchor exists in the DOM — and its box is centred on the whole unit,
        // which is where a cord should meet it anyway.
        sourceAnchor: source.anchor ?? sourceCell,
        partnerAnchor: partner.anchor ?? partnerCell,
        // Per PARTNER, so the bonds of a multi source diff independently: move
        // one target away and only its own bond breaks.
        key: `${def.id}:${source.id}:${partner.id}`,
      });
      }
    }
  }
  return out;
}

// The two cells — one from each footprint — that sit closest together.
function nearestPair(aCells, bCells) {
  let best = [aCells[0], bCells[0]];
  let bestD = Infinity;
  for (const a of aCells) {
    for (const b of bCells) {
      const d = Math.abs(cellRow(a) - cellRow(b)) + Math.abs(cellCol(a) - cellCol(b));
      if (d < bestD) { bestD = d; best = [a, b]; }
    }
  }
  return best;
}

// Convenience for the engine, which asks a narrower question than the screens:
// "given THIS unit as the source of THIS synergy, who is its partner?"
function findPartnerFor(units, sourceId, defId) {
  return resolveSynergies(units).find(s => s.sourceId === sourceId && s.defId === defId) || null;
}

export { FORMATION_SYNERGIES, RELATIONS, resolveSynergies, findPartnerFor, matchesSpec, columnAdjacentCells };
if (typeof module !== 'undefined') {
  module.exports = { FORMATION_SYNERGIES, RELATIONS, resolveSynergies, findPartnerFor, matchesSpec, columnAdjacentCells };
}