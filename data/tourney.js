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
// A tag rule CAPS a tag, it does not ban one. The bans came first, and they were
// not rules — they were evenings a player sat out. `no_demons` took roughly four
// in five units off a Choir roster, heroes included, so the player who owned
// that roster had no squad to bring and nothing to think about; the same held
// for any tag a faction is built out of. A cap of TOURNEY_TAG_CAP leaves every
// roster something to field and still makes the mono-tag squad find bodies
// elsewhere, which is what a rule that changes the evening is for.
//
// Capping is also why Caster is back in the pool. 164 units carry it, and the
// ban left the Choir 9 units and the bot pool 3 templates of 27
// (scripts/check-bot-templates.js): every squad on the field would have been
// built out of the same three answers. A cap costs those rosters a few slots
// instead of the roster.
//
// A `max_tag` rule names ONE tag, spelled exactly as data/units.js writes it on
// the unit, and the count includes the HERO — the hero is the unit a mono-tag
// roster is built around, so a cap that skipped it would barely bite. There is
// no `max_undead`, for the same reason there was no honest `no_undead`: there is
// no Undead tag, so that rule bound nobody — it announced a rule on a word
// printed on no card in the game and then let every skeleton-and-vampire squad
// through the gate. Zombie, Vampire and Skeleton are three tags, so they are
// three rules, never one under a group name the player cannot check their own
// roster against.
//
// The tags with a rule are the ones a PLAYER can field. Absent on purpose:
//
//   • Skeleton, Boss — enemy-only. No unit in choir_of_the_cursed, empire or
//     grail_of_sorrow carries either, so the cap binds nobody: the `no_undead`
//     bug again, with a correctly spelled tag.
//   • Archer — two Empire units and nothing in the other two factions. Real, but
//     it changes no squad anyone would have brought.
//
// `grim` is the one twist left. It is listed so the name and the shape survive,
// but the cron does not roll it either (RULE_KINDS in the tourney-notify edge
// function) until the engine halves healing. Anything added here must be
// enforced somewhere before the cron is allowed to draw it. The cron also keeps
// its own copy of the tag caps (TAG_CAPS in supabase/functions/tourney-notify):
// a rule that rolls there and is missing here announces a cap nothing enforces.
// The cron still names the retired `no_*` ban ids in its message table, so a row
// rolled before the caps landed reads correctly until it is paid out; they are
// gone from here, because nothing has to enforce a rule that can no longer be
// drawn.

// How many units carrying the night's tag a squad may bring, hero included.
// Three is the number that leaves every faction a squad and still forces the
// mono-tag roster to bring something else. The edge function holds the same
// number as TAG_CAP — the two have to agree, or the card announces one limit
// and the queue gate enforces another.
const TOURNEY_TAG_CAP = 3;

const TOURNEY_RULES = [
  { id: 'max_casters',    kind: 'max_tag', tag: 'Caster',    max: TOURNEY_TAG_CAP,
    name: `No more than ${TOURNEY_TAG_CAP} Casters`,    name_ru: `Магов не больше ${TOURNEY_TAG_CAP}` },
  { id: 'max_knights',    kind: 'max_tag', tag: 'Knight',    max: TOURNEY_TAG_CAP,
    name: `No more than ${TOURNEY_TAG_CAP} Knights`,    name_ru: `Рыцарей не больше ${TOURNEY_TAG_CAP}` },
  { id: 'max_demons',     kind: 'max_tag', tag: 'Demon',     max: TOURNEY_TAG_CAP,
    name: `No more than ${TOURNEY_TAG_CAP} Demons`,     name_ru: `Демонов не больше ${TOURNEY_TAG_CAP}` },
  { id: 'max_holy',       kind: 'max_tag', tag: 'Holy',      max: TOURNEY_TAG_CAP,
    name: `No more than ${TOURNEY_TAG_CAP} Holy`,       name_ru: `Святых не больше ${TOURNEY_TAG_CAP}` },
  { id: 'max_zombies',    kind: 'max_tag', tag: 'Zombie',    max: TOURNEY_TAG_CAP,
    name: `No more than ${TOURNEY_TAG_CAP} Zombies`,    name_ru: `Зомби не больше ${TOURNEY_TAG_CAP}` },
  { id: 'max_spirits',    kind: 'max_tag', tag: 'Spirit',    max: TOURNEY_TAG_CAP,
    name: `No more than ${TOURNEY_TAG_CAP} Spirits`,    name_ru: `Духов не больше ${TOURNEY_TAG_CAP}` },
  { id: 'max_vampires',   kind: 'max_tag', tag: 'Vampire',   max: TOURNEY_TAG_CAP,
    name: `No more than ${TOURNEY_TAG_CAP} Vampires`,   name_ru: `Вампиров не больше ${TOURNEY_TAG_CAP}` },
  { id: 'max_warriors',   kind: 'max_tag', tag: 'Warrior',   max: TOURNEY_TAG_CAP,
    name: `No more than ${TOURNEY_TAG_CAP} Warriors`,   name_ru: `Воинов не больше ${TOURNEY_TAG_CAP}` },
  { id: 'max_constructs', kind: 'max_tag', tag: 'Construct', max: TOURNEY_TAG_CAP,
    name: `No more than ${TOURNEY_TAG_CAP} Constructs`, name_ru: `Конструктов не больше ${TOURNEY_TAG_CAP}` },
  { id: 'max_engineers',  kind: 'max_tag', tag: 'Engineer',  max: TOURNEY_TAG_CAP,
    name: `No more than ${TOURNEY_TAG_CAP} Engineers`,  name_ru: `Инженеров не больше ${TOURNEY_TAG_CAP}` },
  { id: 'max_court',      kind: 'max_tag', tag: 'Court',     max: TOURNEY_TAG_CAP,
    name: `No more than ${TOURNEY_TAG_CAP} Court`,      name_ru: `Двора не больше ${TOURNEY_TAG_CAP}` },
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
    // Counted over the WHOLE squad, hero included: the hero is the unit a
    // mono-tag roster is built around, so a cap that skipped it would barely
    // bite the squads it exists for.
    if (rule.kind === 'max_tag') {
      const cap = rule.max ?? TOURNEY_TAG_CAP;
      const guilty = units.filter(u => unitTags(u).includes(rule.tag));
      if (guilty.length > cap) {
        problems.push({ rule: rule.id, text: `${guilty.length} ${rule.tag} units, limit is ${cap}` });
      }
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
  TOURNEY_TIEBREAKERS, TOURNEY_PRIZES, TOURNEY_TAG_CAP, TOURNEY_RULES, TOURNEY_RULES_BY_ID,
  ruleName, checkTourneyRules, battleRulesOf, loyaltyOf, RARITY_ORDER,
};
if (typeof module !== 'undefined') module.exports = {
  TOURNEY_START_UTC_HOUR, TOURNEY_END_UTC_HOUR, TOURNEY_MODE, TOURNEY_BATTLES, TOURNEY_POINTS,
  TOURNEY_TIEBREAKERS, TOURNEY_PRIZES, TOURNEY_TAG_CAP, TOURNEY_RULES, TOURNEY_RULES_BY_ID,
  ruleName, checkTourneyRules, battleRulesOf, loyaltyOf, RARITY_ORDER,
};
