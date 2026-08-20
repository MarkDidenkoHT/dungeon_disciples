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

const COLS = 2;
const cellRow = i => Math.floor(i / COLS);
const cellCol = i => i % COLS;

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
const RELATIONS = {
  front:     (a, b) => sharesRowAcrossColumns(a, b),
  behind:    (a, b) => sharesRowAcrossColumns(a, b),
  same_row:  (a, b) => a.some(x => b.some(y => cellRow(x) === cellRow(y))),
  same_col:  (a, b) => a.some(x => b.some(y => cellCol(x) === cellCol(y))),
  adjacent:  (a, b) => a.some(x => b.some(y =>
                 Math.abs(cellRow(x) - cellRow(y)) + Math.abs(cellCol(x) - cellCol(y)) === 1)),
  any_ally:  () => true,
};

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
// effect: the key into EFFECTS in public/battle-fx.js. fx: the palette and
// parts that effect is built from, so a second bond of the same shape is a row
// in this table rather than another hand-written animation.
const FORMATION_SYNERGIES = {
  unity_bond: {
    id: 'unity_bond',
    source:   { ability: 'unity 1' },
    partner:  { tag: 'Holy' },
    relation: 'front',
    effect:   'unity_bond',
    fx: {
      tether: 0xffe6a8,      // the cord itself
      glow:   0xfff2cf,      // the bloom on both cells
      mark:   0xffd77a,      // the sigil on the host
      sigil:  'ring',
    },
    label: 'Unity', label_ru: 'Единство',
  },
};

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
    if (!relation) continue;
    for (const source of alive) {
      if (!matchesSpec(source, def.source)) continue;
      // A Unity guardian is itself tagged Holy, so without this it would bond
      // to its own reflection.
      const partner = alive.find(p =>
        p.id !== source.id &&
        p.side === source.side &&
        matchesSpec(p, def.partner) &&
        relation(source.cells, p.cells)
      );
      if (!partner) continue;
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
        key: `${def.id}:${source.id}:${partner.id}`,
      });
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

export { FORMATION_SYNERGIES, RELATIONS, resolveSynergies, findPartnerFor, matchesSpec };
if (typeof module !== 'undefined') {
  module.exports = { FORMATION_SYNERGIES, RELATIONS, resolveSynergies, findPartnerFor, matchesSpec };
}