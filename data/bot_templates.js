import { UNITS } from './units.js';
import { ITEM_DEFS, applyItemModifiers } from './items.js';
import { SPELLS } from './spells.js';
import { TOURNEY_RULES_BY_ID, RARITY_ORDER } from './tourney.js';

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
        { unit: 'gs2111',     cell: 0,  item_id: 'dark_determination' },          
        { unit: 'gs831',     cell: 3,  item_id: 'mothers_gift' },                 
        { unit: 'h_g_2_a41', cell: 4,  item_id: 'gift_of_eternity', hero: true,
          spells: [{ spell_id: 'g_spell_7', power: 3 }, { spell_id: 'g_spell_9', power: 5 }] },
        { unit: 'gs5211',    cell: 1,  item_id: 'shroud_of_the_fallen' },         
        { unit: 'gs3311',     cell: 5, item_id: 'staff_of_thaumaturgy' },                            
      ],
      band_300: [
        { unit: 'gs211',    cell: 0, item_id: 'dark_determination' },
        { unit: 'gs83',    cell: 3, item_id: 'mothers_gift' },
        { unit: 'h_g_2_a3', cell: 4, item_id: 'gift_of_eternity', hero: true,
          spells: [{ spell_id: 'g_spell_7', power: 2 }, { spell_id: 'g_spell_9', power: 4 }] },
        { unit: 'gs5211',   cell: 1, item_id: 'shroud_of_the_fallen' },
      ],
      band_200: [
        { unit: 'gs21',    cell: 0, item_id: 'dark_determination' },
        { unit: 'gs83',    cell: 3, item_id: 'mothers_gift' },
        { unit: 'h_g_2_a2', cell: 4, item_id: 'gift_of_eternity', hero: true,
          spells: [{ spell_id: 'g_spell_7', power: 2 }, { spell_id: 'g_spell_3', power: 3 }] },
      ],
    },
  },
  {
    id: 'grail_plague',
    faction: 'grail_of_sorrow',
    name: 'Plague',
    bands: {
      band_500: [
        { unit: 'gs611',     cell: 5, item_id: 'shroud_of_the_fallen' },
        { unit: 'gs1111',     cell: 4, item_id: 'iron_armor' },
        { unit: 'gs831',     cell: 3, item_id: 'dark_determination' },
        { unit: 'h_g_2_a41', cell: 2, item_id: 'gift_of_eternity', hero: true,
          spells: [{ spell_id: 'g_spell_7', power: 3 }, { spell_id: 'g_spell_9', power: 5 }] },
        { unit: 'gs321',     cell: 1, item_id: 'veil_of_discord' },
        { unit: 'gs1111',     cell: 0, item_id: 'might_of_the_pure' },
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
        { unit: 'h_d_1_a41', cell: 4, item_id: 'burning_fury', hero: true,
          spells: [{ spell_id: 'd_spell_3', power: 3 }, { spell_id: 'd_spell_10', power: 5 }] },
        { unit: 'd111',      cell: 0, item_id: 'crystal_shield' },
      ],
      band_300: [
        { unit: 'opb_e41',  cell: 1, item_id: 'ranger_boots' },
        { unit: 'opb_e41',  cell: 3, item_id: 'aldras_patience' },
        { unit: 'h_d_2_a3', cell: 5, item_id: 'veil_of_discord', hero: true,
          spells: [{ spell_id: 'd_spell_3', power: 2 }, { spell_id: 'd_spell_10', power: 4 }] },
        { unit: 'd11',      cell: 0, item_id: 'crystal_shield' },
      ],
      band_200: [
        { unit: 'opb_e41',  cell: 1, item_id: 'ranger_boots' },
        { unit: 'h_d_2_a2', cell: 3, item_id: 'veil_of_discord', hero: true,
          spells: [{ spell_id: 'd_spell_3', power: 2 }, { spell_id: 'd_spell_7', power: 3 }] },
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
        { unit: 'h_d_2_a41', cell: 3, hero: true,
          spells: [{ spell_id: 'd_spell_5', power: 3 }, { spell_id: 'd_spell_9', power: 5 }] },
        { unit: 'd711',      cell: 2 },
        { unit: 'd3111',     cell: 4 },
      ],
      band_300: [
        { unit: 'd3211',    cell: 0 },
        { unit: 'h_d_2_a3', cell: 3, hero: true,
          spells: [{ spell_id: 'd_spell_5', power: 2 }, { spell_id: 'd_spell_9', power: 4 }] },
        { unit: 'd3111',    cell: 4 },
      ],
    },
  },
  {
    id: 'empire_holy_construct',
    faction: 'empire',
    name: 'Holy Construct',
    bands: {
      band_500: [
        { unit: 'e621',      cell: 1, item_id: 'crystal_exoskeleton' },
        { unit: 'e3111',     cell: 0, item_id: 'sanctified_bulwark' },
        { unit: 'e71',       cell: 3, item_id: 'codex_aeternum' },
        { unit: 'h_e_3_a41', cell: 5, item_id: 'might_of_the_pure', hero: true,
          spells: [{ spell_id: 'e_spell_3', power: 3 }, { spell_id: 'e_spell_9', power: 5 }] },
        { unit: 'e6112',     cell: 4, item_id: 'everliving_stalk' },
      ],
      band_300: [
        { unit: 'e621',     cell: 1, item_id: 'crystal_exoskeleton' },
        { unit: 'e311',     cell: 0, item_id: 'sanctified_bulwark' },
        { unit: 'e71',      cell: 3, item_id: 'codex_aeternum' },
        { unit: 'h_e_3_a3', cell: 5, item_id: 'might_of_the_pure', hero: true,
          spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_9', power: 4 }] },
      ],
      band_200: [
        { unit: 'e62',      cell: 1, item_id: 'everliving_stalk' },
        { unit: 'e31',      cell: 0, item_id: 'sanctified_bulwark' },
        { unit: 'h_e_3_a2', cell: 3, item_id: 'lion_signet', hero: true,
          spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_9', power: 3 }] },
      ],
    },
  },
  {
    id: 'empire_mage_college',
    faction: 'empire',
    name: 'Mage College',
    bands: {
      band_500: [
        { unit: 'dm_e111',   cell: 0, item_id: 'forbidden_vow' },
        { unit: 'e4121',     cell: 2, item_id: 'lightbringer' },
        { unit: 'e4121',     cell: 4, item_id: 'dragon_skin' },
        { unit: 'e4111',     cell: 1, item_id: 'fire_staff' },
        { unit: 'e4321',     cell: 3, item_id: 'sanctified_bulwark' },
        { unit: 'h_e_2_a41', cell: 5, item_id: 'might_of_the_pure', hero: true,
          spells: [{ spell_id: 'e_spell_10', power: 3 }, { spell_id: 'e_spell_9', power: 5 }] },
      ],
      band_300: [
        { unit: 'dm_e111',  cell: 0, item_id: 'forbidden_vow' },
        { unit: 'e412',     cell: 2, item_id: 'lightbringer' },
        { unit: 'e411',     cell: 1, item_id: 'fire_staff' },
        { unit: 'e432',     cell: 3, item_id: 'crystal_shield' },
        { unit: 'h_e_2_a3', cell: 5, item_id: 'might_of_the_pure', hero: true,
          spells: [{ spell_id: 'e_spell_10', power: 2 }, { spell_id: 'e_spell_9', power: 4 }] },
      ],
      band_200: [
        { unit: 'dm_e11',   cell: 0, item_id: 'iron_sword' },
        { unit: 'e41',      cell: 1, item_id: 'orb_of_fire' },
        { unit: 'e43',      cell: 3, item_id: 'caster_hat' },
        { unit: 'h_e_2_a2', cell: 5, item_id: 'codex_militarum', hero: true,
          spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_9', power: 3 }] },
      ],
    },
  },
  {
    id: 'empire_templars',
    faction: 'empire',
    name: 'Templars',
    bands: {
      band_500: [
        { unit: 'e2111',   cell: 0, item_id: 'lightbringer' },
        { unit: 'e2121',   cell: 2, item_id: 'aegis_of_the_first_ward' },
        { unit: 'h_e_1211', cell: 4, item_id: 'might_of_the_pure', hero: true,
          spells: [{ spell_id: 'e_spell_3', power: 3 }, { spell_id: 'e_spell_8', power: 5 }] },
        { unit: 'e2211',   cell: 1, item_id: 'travelers_bedroll' },
        { unit: 'e2221',   cell: 3, item_id: 'codex_aeternum' },
        { unit: 'e1311',   cell: 5, item_id: 'knights_oath' },
      ],
      band_300: [
        { unit: 'e211',    cell: 0, item_id: 'lightbringer' },
        { unit: 'e212',    cell: 2, item_id: 'knights_oath' },
        { unit: 'h_e_121', cell: 4, item_id: 'might_of_the_pure', hero: true,
          spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_8', power: 4 }] },
        { unit: 'e221',    cell: 1, item_id: 'travelers_bedroll' },
        { unit: 'e131',    cell: 3, item_id: 'codex_aeternum' },
      ],
      band_200: [
        { unit: 'e21',     cell: 0, item_id: 'lightbringer' },
        { unit: 'h_e_11',  cell: 2, item_id: 'lion_signet', hero: true,
          spells: [{ spell_id: 'e_spell_3', power: 2 }, { spell_id: 'e_spell_7', power: 3 }] },
        { unit: 'e22',     cell: 1, item_id: 'travelers_bedroll' },
      ],
    },
  },
  {
    id: 'choir_demon_warriors',
    faction: 'choir_of_the_cursed',
    name: 'Demon Warriors',
    bands: {
      band_500: [
        { unit: 'd1111',     cell: 0, item_id: 'crystal_shield' },
        { unit: 'h_d_1_a41', cell: 4, item_id: 'burning_fury', hero: true,
          spells: [{ spell_id: 'd_spell_3', power: 3 }, { spell_id: 'd_spell_9', power: 5 }] },
        { unit: 'd1211',     cell: 1, item_id: 'ember_mantle' },
        { unit: 'd2111',     cell: 5, item_id: 'caster_hat' },
      ],
      band_300: [
        { unit: 'd111',     cell: 0, item_id: 'crystal_shield' },
        { unit: 'h_d_1_a3', cell: 4, item_id: 'burning_fury', hero: true,
          spells: [{ spell_id: 'd_spell_3', power: 2 }, { spell_id: 'd_spell_9', power: 4 }] },
        { unit: 'd121',     cell: 1, item_id: 'ember_mantle' },
        { unit: 'd211',     cell: 5, item_id: 'caster_hat' },
      ],
      band_200: [
        { unit: 'd11',      cell: 0, item_id: 'iron_armor' },
        { unit: 'h_d_1_a2', cell: 4, item_id: 'burning_fury', hero: true,
          spells: [{ spell_id: 'd_spell_3', power: 2 }, { spell_id: 'd_spell_5', power: 3 }] },
        { unit: 'd21',      cell: 1, item_id: 'caster_hat' },
      ],
    },
  },
  {
    id: 'choir_infernal_court',
    faction: 'choir_of_the_cursed',
    name: 'Infernal Court',
    bands: {
      band_500: [
        { unit: 'd7111',     cell: 0, item_id: 'burning_fury' },
        { unit: 'd7111',     cell: 2, item_id: 'dragon_skin' },
        { unit: 'd4111',     cell: 4, item_id: 'crystal_shield' },
        { unit: 'd6111',     cell: 1, item_id: 'court_regalia' },
        { unit: 'h_d_3_a41', cell: 3, item_id: 'burning_tyrant', hero: true,
          spells: [{ spell_id: 'd_spell_7', power: 3 }, { spell_id: 'd_spell_10', power: 5 }] },
        { unit: 'd5211',     cell: 5, item_id: 'ember_mantle' },
      ],
      band_300: [
        { unit: 'd711',     cell: 0, item_id: 'burning_fury' },
        { unit: 'd411',     cell: 2, item_id: 'crystal_shield' },
        { unit: 'd611',     cell: 1, item_id: 'court_regalia' },
        { unit: 'h_d_3_a3', cell: 3, item_id: 'orb_of_fire', hero: true,
          spells: [{ spell_id: 'd_spell_7', power: 2 }, { spell_id: 'd_spell_10', power: 4 }] },
        { unit: 'd521',     cell: 5, item_id: 'ember_mantle' },
      ],
      band_200: [
        { unit: 'd71',      cell: 0, item_id: 'burning_fury' },
        { unit: 'd61',      cell: 1, item_id: 'court_regalia' },
        { unit: 'h_d_3_a2', cell: 3, item_id: 'orb_of_fire', hero: true,
          spells: [{ spell_id: 'd_spell_7', power: 2 }, { spell_id: 'd_spell_3', power: 3 }] },
      ],
    },
  },
  {
    id: 'grail_ghost',
    faction: 'grail_of_sorrow',
    name: 'Grail Ghosts',
    bands: {
      band_500: [
        { unit: 'h_g_3_b41',     cell: 3,  item_id: 'knights_oath', hero: true,
          spells: [{ spell_id: 'g_spell_3', power: 3 }, { spell_id: 'g_spell_10', power: 5 }] },
        { unit: 'gs7111',        cell: 2,  item_id: 'crystal_shield' },                 
        { unit: 'gs7311',        cell: 4,  item_id: 'iron_greaves' }, 
        { unit: 'gs7211',        cell: 0,  item_id: 'caster_hat' },
        { unit: 'gs6211',        cell: 1,  item_id: 'veil_of_discord' },          
        { unit: 'dm_e311',       cell: 5,  item_id: 'ember_mantle' },                            
      ],
      band_300: [
        { unit: 'h_g_3_b3',    cell: 3, item_id: 'knights_oath', hero: true,
          spells: [{ spell_id: 'g_spell_3', power: 2 }, { spell_id: 'g_spell_10', power: 4 }] },
        { unit: 'gs711',       cell: 0, item_id: 'crystal_shield' },
        { unit: 'gs711',       cell: 4, item_id: 'iron_greaves' },
        { unit: 'gs721',       cell: 1, item_id: 'caster_hat' },   
        { unit: 'dm_e311',     cell: 5, item_id: 'ember_mantle' },
      ],
      band_200: [
        { unit: 'h_g_3_b2',    cell: 3, item_id: 'knights_oath', hero: true,
          spells: [{ spell_id: 'g_spell_3', power: 2 }, { spell_id: 'g_spell_5', power: 3 }] },
        { unit: 'gs711',       cell: 2, item_id: 'iron_shield' },
        { unit: 'gs72',        cell: 1, item_id: 'caster_hat' },
        { unit: 'dm_e31',      cell: 5, item_id: 'ember_mantle' },
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

// How many of the templates just fought are kept out of the next pick. Two, not
// one: excluding only the last still allowed A, B, A, B all evening, which over a
// five-battle tourney is two opponents, not five.
const BOT_REPEAT_AVOID = 2;

// The template for the next bot battle.
// `recent` is this player's last bot template ids, newest first.
//
// Band: the player's own, else the nearest band that has templates (lower first on a tie).
// Faction: a faction whose last appearance is about to fall out of the window is forced;
// otherwise random. Only factions with a template in the band take part.
// Never the same template twice in a row, unless it is the only one.
// `allow(template, bandId)` narrows the pool before anything else is decided —
// the tourney passes one so a bot cannot field what the player was forbidden to
// bring. A band with nothing allowed is skipped like an empty one.
function pickBotTemplate({ power, recent = [], templates = BOT_TEMPLATES, rng = Math.random, allow = null }) {
  const home = BOT_BANDS.findIndex(b => b.id === botBandFor(power));
  const byDistance = BOT_BANDS
    .map((b, i) => ({ id: b.id, d: Math.abs(i - home), i }))
    .sort((a, b) => a.d - b.d || a.i - b.i);

  let bandId = null;
  let pool = [];
  for (const { id } of byDistance) {
    pool = templates.filter(t => Array.isArray(t.bands?.[id]) && t.bands[id].length);
    if (allow) pool = pool.filter(t => allow(t, id));
    if (pool.length) { bandId = id; break; }
  }
  if (!bandId) return null;

  // Relaxed a step at a time rather than applied once: excluding the last two
  // must never empty the pool, because an empty pool is a player left without an
  // opponent. Two if two can be spared, else one, else whatever there is —
  // and a pool of one template still repeats, which is a content problem
  // (checkBotTemplates) and not something to solve by handing back nothing.
  for (let avoid = BOT_REPEAT_AVOID; avoid >= 1; avoid--) {
    const recently = recent.slice(0, avoid);
    const rest = pool.filter(t => !recently.includes(t.id));
    if (rest.length) { pool = rest; break; }
  }

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

// A template's slots, bent to obey a tourney's squad rules rather than being
// turned away by them.
//
// Filtering whole templates out was the first attempt and it collapsed the pool.
// Every slot in every template carries gear, and most of that gear is Epic or
// better, so `plain_gear` left exactly ONE legal template in each band — the same
// bot every battle of the evening — while `lean_squad` and `bare_steel` left
// bands with NONE, and a player waited out their tourney against an opponent that
// was never going to be offered.
//
// So the two rule kinds that are about what a squad brings are applied to the bot
// instead: gear it may not wear comes off, and units are dropped until it is
// inside the Loyalty cap. That is the same thing the rule does to the player, and
// it keeps every template eligible, which is what lets the rotation below work.
//
// The rules that are about WHICH units may fight at all — a banned tag, a size
// limit — are deliberately not adapted: dropping every Demon from a Choir army
// leaves something that is no longer that army's build. Those still reject a
// template, and there are enough legal ones in each band for them to.
function adaptSlotsToRules(slots, rules) {
  const list = (rules || []).map(r => (typeof r === 'string' ? TOURNEY_RULES_BY_ID[r] : r)).filter(Boolean);
  if (!list.length) return slots;

  let out = slots;
  for (const rule of list) {
    // Gear the rule forbids is simply not worn. It must come off HERE, at the
    // slot, rather than after the army is built: buildBotArmy folds an item's
    // modifiers into the unit's stats, so a unit built with the item and stripped
    // afterwards would keep the stats and lose only the label.
    if (rule.kind === 'no_items') {
      out = out.map(slot => (slot.item_id ? { ...slot, item_id: null } : slot));
    }

    if (rule.kind === 'item_rarity_max') {
      const cap = RARITY_ORDER.indexOf(rule.rarity);
      if (cap >= 0) out = out.map(slot => {
        if (!slot.item_id) return slot;
        const rank = RARITY_ORDER.indexOf(ITEM_DEFS[slot.item_id]?.rarity ?? 'common');
        return rank > cap ? { ...slot, item_id: null } : slot;
      });
    }

    // The hero is free and always stays — an army without one is not a build the
    // AI knows how to play. Everything else is dropped dearest first (a row or
    // column unit frees 2, a tile 1, exactly as loyaltyOf counts them), and the
    // last slot listed first among equals, so the front of the build survives.
    if (rule.kind === 'loyalty_max') {
      const cost = slot => {
        const size = findBotUnit(slot.unit)?.size ?? 'tile';
        return (size === 'row' || size === 'column') ? 2 : 1;
      };
      const paying = out.filter(slot => !slot.hero);
      let used = paying.reduce((n, slot) => n + cost(slot), 0);
      if (used > rule.max) {
        const order = [...paying].reverse().sort((a, b) => cost(b) - cost(a));
        const dropped = new Set();
        for (const slot of order) {
          if (used <= rule.max) break;
          dropped.add(slot);
          used -= cost(slot);
        }
        out = out.filter(slot => !dropped.has(slot));
      }
    }
  }
  return out;
}

// Flat units, the same shape getEncounter returns. `rules` is a tourney's rule
// list when the battle is one of its own, so the bot is built under the same
// restrictions the player queued under.
function buildBotArmy(template, bandId, rules = null) {
  let slots = template?.bands?.[bandId];
  if (!Array.isArray(slots)) return [];
  if (rules?.length) slots = adaptSlotsToRules(slots, rules);
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

// A bot army in the shape the squad checks expect: unit_data per unit, the hero
// flagged, and the worn items keyed the way a roster's are. Lets the tourney run
// its own rule check over a template before offering it as an opponent.
function botArmyAsSquad(template, bandId, rules = null) {
  const army = buildBotArmy(template, bandId, rules);
  const units = army.map((u, i) => ({ id: String(i), _rosterId: String(i), is_hero: !!u.is_hero, unit_data: u }));
  const itemsByRosterId = {};
  army.forEach((u, i) => {
    if (u.item_id) itemsByRosterId[String(i)] = { item_name: u.item_id, item_stats: { key: u.item_id } };
  });
  return { units, itemsByRosterId };
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

export { BOT_BANDS, BOT_FACTIONS, BOT_TEMPLATES, findBotUnit, findBotSpell, botBandFor, pickBotTemplate, buildBotArmy, botArmyAsSquad, checkBotTemplate, checkBotTemplates };
if (typeof module !== 'undefined') module.exports = { BOT_BANDS, BOT_FACTIONS, BOT_TEMPLATES, findBotUnit, findBotSpell, botBandFor, pickBotTemplate, buildBotArmy, botArmyAsSquad, checkBotTemplate, checkBotTemplates };
