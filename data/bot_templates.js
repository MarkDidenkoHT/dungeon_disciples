import { UNITS } from './units.js';
import { ITEM_DEFS, applyItemModifiers } from './items.js';
import { SPELLS } from './spells.js';

// Hand-made PvP bot armies: one faction's build, with a version per power band.
// Slots follow embark encounters. Cells:
//   0 1
//   2 3
//   4 5
// Column 0 (cells 0/2/4) is the front line, column 1 (cells 1/3/5) the back.
// A row unit anchors on 0/2/4, a column unit on its top cell.
// `hero: true` marks the hero; `spells` are cast by the boss spell AI.

// Inclusive on both ends. Players below 200 meet band_200 (see botBandFor).
const BOT_BANDS = [
  { id: 'band_200', min: 200, max: 300 },
  { id: 'band_300', min: 301, max: 500 },
  { id: 'band_500', min: 501, max: Infinity },
];

const BOT_FACTIONS = ['empire', 'choir_of_the_cursed', 'grail_of_sorrow'];

const BOT_TEMPLATES = [
  {
    id: 'grail_zombie_vamp',
    faction: 'grail_of_sorrow',
    name: 'Zombie-Vamp Hybrid',
    bands: {
      band_500: [
        { unit: 'gs421',    cell: 0, item_id: 'veil_of_discord' },
        { unit: 'gs831',    cell: 2, item_id: 'mothers_gift' },
        { unit: 'h_g_2_a4', cell: 3, item_id: 'gift_of_eternity', hero: true },
        { unit: 'gs5211',   cell: 4, item_id: 'shroud_of_the_fallen' },
        { unit: 'gs121',    cell: 5 },
      ],
      band_300: [
        { unit: 'gs421',    cell: 0, item_id: 'veil_of_discord' },
        { unit: 'gs831',    cell: 2, item_id: 'mothers_gift' },
        { unit: 'h_g_2_a3', cell: 3, item_id: 'gift_of_eternity', hero: true },
        { unit: 'gs5211',   cell: 4, item_id: 'shroud_of_the_fallen' },
        { unit: 'gs121',    cell: 5 },
      ],
    },
  },
  {
    id: 'grail_plague',
    faction: 'grail_of_sorrow',
    name: 'Plague',
    bands: {
      band_500: [
        { unit: 'gs611',    cell: 0, item_id: 'shroud_of_the_fallen' },
        { unit: 'gs331',    cell: 1, item_id: 'iron_armor' },
        { unit: 'gs831',    cell: 2, item_id: 'dark_determination' },
        { unit: 'h_g_2_a4', cell: 3, item_id: 'gift_of_eternity', hero: true },
        { unit: 'gs321',    cell: 4, item_id: 'veil_of_discord' },
        { unit: 'gs111',    cell: 5, item_id: 'might_of_the_pure' },
      ],
    },
  },
  {
    id: 'choir_demon_archers',
    faction: 'choir_of_the_cursed',
    name: 'Demon Archers',
    bands: {
      band_500: [
        { unit: 'opb_e41',   cell: 1, item_id: 'ranger_boots' },
        { unit: 'd521',      cell: 5, item_id: 'veil_of_discord' },
        { unit: 'opb_e411',  cell: 3, item_id: 'aldras_patience' },
        { unit: 'h_d_1_a4',  cell: 4, item_id: 'burning_fury', hero: true },
        { unit: 'd111',      cell: 0, item_id: 'crystal_shield' },
      ],
      band_300: [
        { unit: 'opb_e41',   cell: 1, item_id: 'ranger_boots' },
        { unit: 'opb_e41',  cell: 3, item_id: 'aldras_patience' },
        { unit: 'h_d_2_a3',  cell: 5, item_id: 'veil_of_discord', hero: true },
        { unit: 'd11',      cell: 0, item_id: 'crystal_shield' },
      ],
    },
  },
  {
    id: 'choir_dual_gargoyles',
    faction: 'choir_of_the_cursed',
    name: 'Dual Gargoyles',
    bands: {
      band_500: [
        { unit: 'd3211',     cell: 0 },
        { unit: 'h_d_2_a41', cell: 3, hero: true },
        { unit: 'd711',      cell: 2 },
        { unit: 'd3111',     cell: 4 },
      ],
    },
  },
  {
    id: 'empire_holy_construct',
    faction: 'empire',
    name: 'Holy Construct',
    bands: {
      band_500: [
        { unit: 'e621',     cell: 1, item_id: 'crystal_exoskeleton' },
        { unit: 'e3111',    cell: 0, item_id: 'sanctified_bulwark' },
        { unit: 'e71',      cell: 3, item_id: 'codex_aeternum' },
        { unit: 'h_e_3_a4', cell: 5, item_id: 'might_of_the_pure', hero: true },
        { unit: 'e6112',    cell: 4, item_id: 'everliving_stalk' },
      ],
      band_300: [
        { unit: 'e621',     cell: 1, item_id: 'crystal_exoskeleton' },
        { unit: 'e311',     cell: 0, item_id: 'sanctified_bulwark' },
        { unit: 'e7',      cell: 3, item_id: 'codex_aeternum' },
        { unit: 'h_e_3_a3', cell: 5, item_id: 'might_of_the_pure', hero: true },
      ],
      band_200: [
        { unit: 'e62',      cell: 1, item_id: 'everliving_stalk' },
        { unit: 'e31',      cell: 0, item_id: 'sanctified_bulwark' },
        { unit: 'h_e_3_a2', cell: 3, item_id: 'might_of_the_pure', hero: true },
      ],
    },
  },
];

let _unitIndex = null;
function findBotUnit(id) {
  if (!_unitIndex) {
    _unitIndex = new Map();
    for (const [key, pool] of Object.entries(UNITS)) {
      if (!pool || typeof pool !== 'object' || Array.isArray(pool)) continue;
      const pools = key === 'enemies' ? Object.values(pool) : [pool];
      for (const p of pools) {
        for (const u of Object.values(p || {})) if (u?.id) _unitIndex.set(u.id, u);
      }
    }
  }
  return _unitIndex.get(id) ?? null;
}

function findBotSpell(id) {
  return Object.values(SPELLS).flat().find(s => s.id === id) ?? null;
}

function botBandFor(power) {
  return (BOT_BANDS.find(b => power <= b.max) ?? BOT_BANDS[BOT_BANDS.length - 1]).id;
}

// Any 5 bot battles in a row hold every faction at least once.
const BOT_ROTATION_WINDOW = 5;

// The template for the next bot battle.
// `recent` is this player's last bot template ids, newest first.
//
// Band: the player's own, else the nearest band that has templates (lower first on a tie).
// Faction: a faction whose last appearance is about to fall out of the window is forced;
// otherwise random. Only factions with a template in the band take part.
// Never the same template twice in a row, unless it is the only one.
function pickBotTemplate({ power, recent = [], templates = BOT_TEMPLATES, rng = Math.random }) {
  const home = BOT_BANDS.findIndex(b => b.id === botBandFor(power));
  const byDistance = BOT_BANDS
    .map((b, i) => ({ id: b.id, d: Math.abs(i - home), i }))
    .sort((a, b) => a.d - b.d || a.i - b.i);

  let bandId = null;
  let pool = [];
  for (const { id } of byDistance) {
    pool = templates.filter(t => Array.isArray(t.bands?.[id]) && t.bands[id].length);
    if (pool.length) { bandId = id; break; }
  }
  if (!bandId) return null;

  const last = recent[0];
  if (pool.length > 1) pool = pool.filter(t => t.id !== last);

  // Picks left (this one included) before each faction must appear. Seen at recent[i]
  // leaves 5 - i; a faction missing from the last 5 is overdue and must go now.
  const factionOf = id => templates.find(t => t.id === id)?.faction;
  const history = recent.slice(0, BOT_ROTATION_WINDOW).map(factionOf);
  const factions = [...new Set(pool.map(t => t.faction))];
  const deadline = f => {
    const i = history.indexOf(f);
    return BOT_ROTATION_WINDOW - (i >= 0 ? i : Math.min(recent.length, BOT_ROTATION_WINDOW));
  };
  // Earliest deadline first: if k factions all fall due within k picks, one of them goes now.
  for (let k = 1; k <= factions.length; k++) {
    const due = factions.filter(f => deadline(f) <= k);
    if (due.length >= k) { pool = pool.filter(t => due.includes(t.faction)); break; }
  }

  const template = pool[Math.floor(rng() * pool.length)];
  return { template, bandId };
}

// Flat units, the same shape getEncounter returns.
function buildBotArmy(template, bandId) {
  const slots = template?.bands?.[bandId];
  if (!Array.isArray(slots)) return [];
  return slots
    .map(slot => {
      let unit = findBotUnit(slot.unit);
      if (!unit) return null;
      const itemDef = slot.item_id ? ITEM_DEFS[slot.item_id] : null;
      if (itemDef) unit = applyItemModifiers(unit, itemDef);
      return { ...unit, cell: slot.cell, item_id: slot.item_id || null, is_hero: !!slot.hero, spells: slot.spells || [] };
    })
    .filter(Boolean);
}

function footprint(cell, size) {
  if (size === 'row')    return [cell, cell + 1];
  if (size === 'column') return [cell, cell + 2];
  return [cell];
}

// Everything wrong with one template, as readable lines. Empty means clean.
function checkBotTemplate(template) {
  const problems = [];
  if (!template?.id) problems.push('Template has no id');
  if (!BOT_FACTIONS.includes(template?.faction)) problems.push(`Unknown faction "${template?.faction}"`);
  const bands = Object.entries(template?.bands || {});
  if (!bands.length) problems.push('No bands');

  for (const [bandId, slots] of bands) {
    const at = msg => problems.push(`${bandId}: ${msg}`);
    if (!BOT_BANDS.some(b => b.id === bandId)) { at('unknown band'); continue; }
    if (!Array.isArray(slots) || !slots.length) { at('no slots'); continue; }

    const taken = new Map();
    const heroes = slots.filter(s => s.hero);
    if (heroes.length !== 1) at(`needs exactly one hero, has ${heroes.length}`);
    if (slots.length > 6) at(`${slots.length} slots, the grid holds 6`);

    for (const slot of slots) {
      const def = findBotUnit(slot.unit);
      const label = slot.unit ?? '(no unit)';
      if (!def) { at(`unknown unit "${label}"`); continue; }
      if (slot.item_id && !ITEM_DEFS[slot.item_id]) at(`${label}: unknown item "${slot.item_id}"`);

      const cell = slot.cell;
      const size = def.size ?? 'tile';
      if (!Number.isInteger(cell) || cell < 0 || cell > 5) { at(`${label}: cell ${cell} is off the grid`); continue; }
      if (size === 'row' && cell % 2 !== 0) at(`${label}: row unit must anchor on 0, 2 or 4`);
      if (size === 'column' && cell > 3) at(`${label}: column unit must anchor on 0-3`);
      for (const c of footprint(cell, size)) {
        if (taken.has(c)) at(`${label}: cell ${c} already holds ${taken.get(c)}`);
        else taken.set(c, label);
      }
      // Front line is column 0 (cells 0/2/4). A row unit spans both lines, so it has no wrong one.
      if (size !== 'row') {
        const col = cell % 2;
        if (def.pref_position === 'front' && col === 1) at(`${label}: front-line unit stands in the back line (cell ${cell})`);
        if (def.pref_position === 'back'  && col === 0) at(`${label}: back-line unit stands in the front line (cell ${cell})`);
      }

      const spells = slot.spells || [];
      if (spells.length && !slot.hero) at(`${label}: has spells but is not the hero`);
      if (slot.hero && !spells.length) at(`${label}: hero has no spells yet`);
      if (spells.length > 2) at(`${label}: ${spells.length} spells, aim for 1-2`);
      for (const s of spells) {
        if (!findBotSpell(s.spell_id)) at(`${label}: unknown spell "${s.spell_id}"`);
      }
    }
  }
  return problems;
}

function checkBotTemplates(templates = BOT_TEMPLATES) {
  const seen = new Set();
  const out = {};
  for (const t of templates) {
    const problems = checkBotTemplate(t);
    if (seen.has(t.id)) problems.unshift(`Duplicate template id "${t.id}"`);
    seen.add(t.id);
    out[t.id] = problems;
  }
  return out;
}

export { BOT_BANDS, BOT_FACTIONS, BOT_TEMPLATES, findBotUnit, findBotSpell, botBandFor, pickBotTemplate, buildBotArmy, checkBotTemplate, checkBotTemplates };
if (typeof module !== 'undefined') module.exports = { BOT_BANDS, BOT_FACTIONS, BOT_TEMPLATES, findBotUnit, findBotSpell, botBandFor, pickBotTemplate, buildBotArmy, checkBotTemplate, checkBotTemplates };
