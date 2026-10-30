#!/usr/bin/env node
// Reports what every bot lineup is doing WRONG as it stands, before any tourney
// rule touches it. Read-only.
//
//   node scripts/check-bot-formations.js              fatal + advisory
//   node scripts/check-bot-formations.js --all        every lineup, clean ones included
//   node scripts/check-bot-formations.js --quiet      fatal only
//   node scripts/check-bot-formations.js --template=empire_holy_construct
//
// THE SIBLING SCRIPT AND THIS ONE ASK DIFFERENT QUESTIONS
// check-bot-templates.js asks what a squad SURVIVES: hand it a tourney rule and
// see whether what is left can still fight. It is about subtraction, so a
// lineup that is quietly broken in its authored form passes it — the rule did
// not break anything, it was already like that.
//
// This asks whether the lineup is right in the first place. Every finding here
// is something a human typed: a cell number, an item id, a unit swapped without
// re-checking what stood beside it. They are easy to make and invisible in play,
// because a bot that fights badly looks exactly like a bot that is losing.
//
// Exit code 1 if anything is FATAL — an inert unit, an item that cannot be worn,
// an army over the Loyalty cap. The advisory findings do not fail: a unit out of
// its preferred rank is sometimes the right trade, and most lineups stage no
// litany on purpose.

const { BOT_TEMPLATES, buildBotArmy } = require('../data/bot_templates.js');
const { resolveSynergies } = require('../data/formation_synergies.js');
const { matchAvailableLitany } = require('../data/litanies.js');
const { ITEM_DEFS } = require('../data/items.js');
const { getEquipBlock } = require('../data/item_rules.js');
const { UNIT_ABILITIES } = require('../data/unit_abilities.js');

const argv     = process.argv.slice(2);
const showAll  = argv.includes('--all');
const quiet    = argv.includes('--quiet');
const only     = (argv.find(a => a.startsWith('--template=')) || '').slice('--template='.length) || null;

const COLS = 2;
const BANDS = ['band_500', 'band_300', 'band_200'];

// Bots fight on the enemy side, where column 0 is the front rank. Everything
// below is written from the bot's point of view for that reason — the same
// `frontCol: 0` the engine passes when it matches their litany.
const FRONT_COL = 0;
const colOf = cell => cell % COLS;

function footprint(cell, size) {
  if (size === 'row')    return [cell, cell + 1];
  if (size === 'column') return [cell, cell + 2];
  return [cell];
}

const abilityKeysOf = u => (Array.isArray(u.passive) ? u.passive : [u.passive]).filter(Boolean);
const loyaltyOf     = u => ((u.size === 'row' || u.size === 'column') ? 2 : 1);

// Read off the live definitions rather than naming 'unity 1' and 'blood_bond 1',
// so a third guardian bond is covered without touching this file. Same reasoning
// as BOND_ABILITY_KEYS in utils/bot-template-audit.js.
const BOND_ABILITY_KEYS = Object.entries(UNIT_ABILITIES)
  .filter(([, def]) => def?.params?.bond_synergy || def?.params?.unity_bond === true)
  .map(([key]) => key);

// buildBotArmy reads from `template.bands`, and a variant's lineup lives
// somewhere else — so it is handed a throwaway template holding just that one
// lineup. Going through buildBotArmy rather than reading the slots directly is
// the whole point: it folds each item's modifiers in, and `adds_tag` is what
// decides most of the findings below. A bond partner is Holy because its armour
// says so, not because its unit definition does.
function armyFrom(template, slots) {
  const probe = { id: template.id, faction: template.faction, bands: { probe: slots } };
  return buildBotArmy(probe, 'probe', null);
}

function inspect(template, slots) {
  const army = armyFrom(template, slots);
  if (!army.length) return null;

  const fatal = [];
  const notes = [];
  const slotFor = unit => slots.find(s => s.cell === unit.cell) || {};
  const units = army.map((u, i) => ({
    id: String(i), side: 'enemy', cells: footprint(u.cell, u.size ?? 'tile'),
    tags: u.tags ?? [], abilityKeys: abilityKeysOf(u), type: u.type, unitId: u.id,
    anchor: u.cell,
  }));

  // ── Guardian bonds ────────────────────────────────────────────────────────
  // An unbonded carrier is not a weakened unit, it is a non-unit: its action is
  // 'none', so it holds a cell in a six-cell grid, does nothing all battle and
  // dies for free. The partner is matched on a TAG, which is why this breaks
  // from a cell number changing somewhere else entirely.
  const bonded = new Set(resolveSynergies(units)
    .filter(b => b.defId === 'unity_bond' || b.defId === 'blood_bond')
    .map(b => b.sourceId));
  army.forEach((u, i) => {
    if (!abilityKeysOf(u).some(k => BOND_ABILITY_KEYS.includes(k))) return;
    if (bonded.has(String(i))) return;
    fatal.push(`${u.name} on cell ${u.cell} carries a guardian bond with no partner `
      + `beside it — its action is 'none', so it does nothing all battle`);
  });

  // ── Gear ──────────────────────────────────────────────────────────────────
  // An item the carrier cannot wear is not a smaller bonus, it is no bonus, and
  // a tag gate fails silently: the stats land and the passive never fires.
  for (const slot of slots) {
    if (!slot.item_id) continue;
    const item = ITEM_DEFS[slot.item_id];
    if (!item) { fatal.push(`cell ${slot.cell} wears '${slot.item_id}', which is not an item`); continue; }
    const unit = army.find(u => u.cell === slot.cell);
    if (!unit) continue;

    const block = getEquipBlock(item, unit, UNIT_ABILITIES);
    if (block) fatal.push(`${unit.name} cannot carry ${item.name} — ${block.reason || block.message || 'refused'}`);

    const missing = item.tag_required
      ? [].concat(item.tag_required).filter(t => !(unit.tags || []).includes(t))
      : [];
    if (missing.length) fatal.push(`${unit.name} lacks ${missing.join(' + ')} for ${item.name}, which is gated on it`);

    if (item.faction && item.faction !== template.faction) {
      fatal.push(`${item.name} is ${item.faction}-only and this is a ${template.faction} squad`);
    }
  }

  // ── Loyalty ───────────────────────────────────────────────────────────────
  // The same cap checkSquad applies to a player (routes/index.js): one Loyalty a
  // body, two for a row or column, and the hero pays nothing. Over it is an army
  // no player could field.
  const hero     = army.find(u => slotFor(u).hero);
  const heroTier = hero?.t ?? 1;
  const cap      = heroTier >= 4 ? 5 : heroTier + 1;
  const spent    = army.filter(u => u !== hero).reduce((n, u) => n + loyaltyOf(u), 0);
  if (spent > cap) fatal.push(`${spent} Loyalty spent against a cap of ${cap} for a tier-${heroTier} hero`);
  if (!hero) notes.push('no slot is marked `hero: true`');

  // ── Preferred rank ────────────────────────────────────────────────────────
  // Advisory: a ranged unit in the front rank still acts, it just takes the hits
  // meant for somebody else. Worth seeing, and sometimes worth paying.
  for (const u of army) {
    const cols = [...new Set(footprint(u.cell, u.size ?? 'tile').map(colOf))];
    if (cols.length !== 1) continue;            // spans both ranks; nothing to prefer
    const inFront = cols[0] === FRONT_COL;
    if (u.pref_position === 'back'  && inFront)  notes.push(`${u.name} prefers the back rank, stands in front (cell ${u.cell})`);
    if (u.pref_position === 'front' && !inFront) notes.push(`${u.name} prefers the front rank, stands behind (cell ${u.cell})`);
  }

  // ── Litany ────────────────────────────────────────────────────────────────
  // Informational. Most lineups stage none, and that is a choice — but a lineup
  // whose comment names one and whose cells no longer match it is a silent loss
  // of whatever that litany granted.
  const litany = matchAvailableLitany(
    army.map((u, i) => ({
      id: String(i), unitId: u.id, calling: slotFor(u).calling, alive: true,
      footprint: footprint(u.cell, u.size ?? 'tile'),
    })),
    { frontCol: FRONT_COL, unlocked: true },
  );

  return { fatal, notes, litany: litany?.def?.name ?? null, units: army.length };
}

// Every authored band, then every published variant lineup — a variant is a
// hand-written squad like any other and goes wrong the same ways.
function lineups(template) {
  const out = [];
  for (const band of BANDS) {
    const slots = template.bands?.[band];
    if (Array.isArray(slots) && slots.length) out.push({ label: band, slots });
  }
  for (const [key, bands] of Object.entries(template.variants || {})) {
    for (const band of BANDS) {
      const slots = bands?.[band];
      if (Array.isArray(slots) && slots.length) out.push({ label: `${key}/${band}`, slots });
    }
  }
  return out;
}

let fatalCount = 0, noteCount = 0, checked = 0;
const blocks = [];

for (const template of BOT_TEMPLATES) {
  if (only && template.id !== only) continue;
  for (const { label, slots } of lineups(template)) {
    const found = inspect(template, slots);
    if (!found) continue;
    checked++;
    fatalCount += found.fatal.length;
    noteCount  += found.notes.length;

    const worth = found.fatal.length || (!quiet && found.notes.length) || showAll;
    if (!worth) continue;

    const lines = [`\n  ${template.id} · ${label}   ${found.units} units · litany: ${found.litany ?? 'none'}`];
    for (const f of found.fatal) lines.push(`    ✗ ${f}`);
    if (!quiet) for (const n of found.notes) lines.push(`    · ${n}`);
    blocks.push(lines.join('\n'));
  }
}

console.log(fatalCount ? '\nFATAL AND ADVISORY' : '\nNOTHING FATAL');
if (blocks.length) console.log(blocks.join('\n'));
// Nothing printed does not always mean nothing found: --quiet suppresses the
// advisory findings, and saying "clean" there would be a lie by omission.
else if (quiet && noteCount) console.log(`\n  no fatal findings · ${noteCount} advisory hidden by --quiet`);
else console.log('\n  every lineup clean');

console.log(`\n${checked} lineups checked · ${fatalCount} fatal · ${noteCount} advisory`);
if (fatalCount) console.log('\nFatal means the lineup is wrong as typed: an inert unit, unwearable gear,\nor an army over the Loyalty cap. Advisory findings are trades, not bugs.');

process.exit(fatalCount ? 1 : 0);
