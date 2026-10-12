import { ITEM_DEFS } from './items.js';

// Crown Tourney: one evening tournament a day, five battles a player, rules that
// change daily (docs/daily-activities-design.md).
//
// 19:00–21:00 Moscow, which is UTC+3 — the same clock the Colossus reset is
// written against ("Monday 18:00 UTC / 21:00 Moscow").
const TOURNEY_START_UTC_HOUR = 16;
const TOURNEY_END_UTC_HOUR   = 18;

// The queue mode. Its own mode means tourney entrants only ever meet each other:
// utils/pvp-queue.js pairs within a mode.
const TOURNEY_MODE = 'pvp_tourney';

// A format, not a stamina bar: five battles is the tournament's length, and two
// hours is room to play them without hurrying.
const TOURNEY_BATTLES = 5;

// A played-out loss still scores: turning up and fighting is the point, and a
// player who is losing must never be better off closing the app.
const TOURNEY_POINTS = { win: 3, loss: 1, forfeit: 0 };

// Points first, then fewer units lost, then whoever finished earlier.
const TOURNEY_TIEBREAKERS = ['points', 'units_lost', 'finished_at'];

// Valor for everyone by result; the podium is the primary source of engraving
// tokens, which also appear as very rare rewards on the longest quest milestones.
const TOURNEY_PRIZES = {
  valor_per_win:    7,
  valor_per_battle: 2,
  podium_valor:     [30, 20, 12],
  podium_tokens:    [3, 2, 1],
};

// The pool a day's tourney draws one or two rules from. `kind` is what the check
// below switches on; everything else is the rule's own parameters.
//
// Every rule here is a SQUAD rule: it decides who may enter, and the server
// enforces it at the queue gate. `engravings_off` and `twist` were the other
// half — rules that change how the battle is BUILT — and they are gone:
//
//   • `swift` gave every unit +2 Initiative, which is no rule at all. Shifting
//     the whole turn order by the same amount leaves the same turn order.
//   • `raw_stats` (engravings off) was a real rule that nothing in the engine
//     honours — a promise on the card the battle did not keep.
//   • `warband` (3+ Warriors) asked for a tag most rosters cannot field three
//     of, and locked those players out of the evening rather than making them
//     think about their squad.
//
// `grim` is the one twist left. It is listed so the name and the shape survive,
// but the cron does not roll it either (RULE_KINDS in the tourney-notify edge
// function) until the engine halves healing. Anything added here must be
// enforced somewhere before the cron is allowed to draw it. The
// cron does not roll them either (RULE_KINDS in supabase/functions/tourney-notify):
// rolling a rule nothing enforces would read as a bug to the player.
const TOURNEY_RULES = [
  { id: 'no_demons',     kind: 'ban_tag',         tag: 'Demon',
    name: 'No Demons',            name_ru: 'Без демонов' },
  { id: 'no_undead',     kind: 'ban_tag',         tag: 'Undead',
    name: 'No Undead',            name_ru: 'Без нежити' },
  { id: 'tiles_only',    kind: 'size_only',       sizes: ['tile'],
    name: 'Tile-size units only', name_ru: 'Только одноклеточные' },
  { id: 'lean_squad',    kind: 'loyalty_max',     max: 3,
    name: 'Loyalty 3 or less',    name_ru: 'Верность не выше 3' },
  { id: 'plain_gear',    kind: 'item_rarity_max', rarity: 'rare',
    name: 'Nothing above Rare',   name_ru: 'Не выше редкого' },
  { id: 'bare_steel',    kind: 'no_items',
    name: 'No items at all',      name_ru: 'Совсем без предметов' },
  { id: 'grim',          kind: 'twist',           effect: { healing_pct: 50 },
    name: 'Healing halved',       name_ru: 'Лечение вдвое слабее' },
];

const TOURNEY_RULES_BY_ID = Object.fromEntries(TOURNEY_RULES.map(r => [r.id, r]));

// Appended rather than slotted in, the same order the items screen uses.
const RARITY_ORDER = ['common', 'rare', 'epic', 'mythic', 'shattered'];

function ruleName(rule, lang = 'en') {
  const def = typeof rule === 'string' ? TOURNEY_RULES_BY_ID[rule] : rule;
  if (!def) return '';
  return (lang === 'ru' && def.name_ru) || def.name || def.id;
}

function unitTags(unit) {
  const tags = unit?.unit_data?.tags ?? unit?.tags ?? [];
  return Array.isArray(tags) ? tags.filter(Boolean) : [];
}

function unitSize(unit) {
  return unit?.unit_data?.size ?? unit?.size ?? 'tile';
}

function loyaltyOf(units) {
  let used = 0;
  for (const u of units) {
    if (u.is_hero) continue;
    const size = unitSize(u);
    used += (size === 'row' || size === 'column') ? 2 : 1;
  }
  return used;
}

// What a squad breaks, as { rule, text } — the rule id so the client can name it
// in its own language, the text so the server has something to log and return.
// Empty means it may enter.
//
// `items` is the equipped item per roster id, because two of the rules are about
// gear the unit is wearing rather than the unit itself.
function checkTourneyRules(units, rules, { itemsByRosterId = {} } = {}) {
  const problems = [];
  const list = (rules || []).map(r => (typeof r === 'string' ? TOURNEY_RULES_BY_ID[r] : r)).filter(Boolean);

  for (const rule of list) {
    if (rule.kind === 'ban_tag') {
      const guilty = units.filter(u => unitTags(u).includes(rule.tag));
      if (guilty.length) problems.push({ rule: rule.id, text: `${rule.tag} units are banned today` });
    }

    if (rule.kind === 'size_only') {
      const guilty = units.filter(u => !rule.sizes.includes(unitSize(u)));
      if (guilty.length) problems.push({ rule: rule.id, text: `Only ${rule.sizes.join(' / ')} units today` });
    }

    if (rule.kind === 'loyalty_max') {
      const used = loyaltyOf(units);
      if (used > rule.max) problems.push({ rule: rule.id, text: `Loyalty ${used}, limit is ${rule.max}` });
    }

    if (rule.kind === 'item_rarity_max') {
      const cap = RARITY_ORDER.indexOf(rule.rarity);
      for (const u of units) {
        const item = itemsByRosterId[String(u._rosterId ?? u.id)];
        const key  = item?.item_stats?.key;
        const rank = RARITY_ORDER.indexOf(ITEM_DEFS[key]?.rarity ?? 'common');
        if (cap >= 0 && rank > cap) problems.push({ rule: rule.id, text: `${item.item_name || key} is above ${rule.rarity}` });
      }
    }

    if (rule.kind === 'no_items') {
      const worn = units.filter(u => itemsByRosterId[String(u._rosterId ?? u.id)]);
      if (worn.length) problems.push({ rule: rule.id, text: 'No items may be worn today' });
    }
  }

  return problems;
}

// Rules that change the BATTLE rather than the squad, for whoever builds it.
// No rule in the pool produces either of these today (see the note above) — it
// is kept so the battle builder has somewhere to read them from when one does.
function battleRulesOf(rules) {
  const list = (rules || []).map(r => (typeof r === 'string' ? TOURNEY_RULES_BY_ID[r] : r)).filter(Boolean);
  return {
    engravings_off: list.some(r => r.kind === 'engravings_off'),
    twists: list.filter(r => r.kind === 'twist').map(r => r.effect),
  };
}

export {
  TOURNEY_START_UTC_HOUR, TOURNEY_END_UTC_HOUR, TOURNEY_MODE, TOURNEY_BATTLES, TOURNEY_POINTS,
  TOURNEY_TIEBREAKERS, TOURNEY_PRIZES, TOURNEY_RULES, TOURNEY_RULES_BY_ID,
  ruleName, checkTourneyRules, battleRulesOf, loyaltyOf, RARITY_ORDER,
};
if (typeof module !== 'undefined') module.exports = {
  TOURNEY_START_UTC_HOUR, TOURNEY_END_UTC_HOUR, TOURNEY_MODE, TOURNEY_BATTLES, TOURNEY_POINTS,
  TOURNEY_TIEBREAKERS, TOURNEY_PRIZES, TOURNEY_RULES, TOURNEY_RULES_BY_ID,
  ruleName, checkTourneyRules, battleRulesOf, loyaltyOf, RARITY_ORDER,
};
