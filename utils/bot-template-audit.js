// Bot templates, audited against every tourney rule they can be asked to fight
// under — the check data/bot_templates.js's own checkBotTemplate does NOT do.
//
// checkBotTemplate validates a template AS AUTHORED. But a tourney bot never
// fights as authored: adaptSlotsToRules bends the squad to the evening's rules
// first, and it does so by SUBTRACTION — gear is nulled, units are dropped. So a
// template can be perfectly clean and still take the field as half an army with
// no gear, which is what happened and what nothing was measuring.
//
// This module builds the army the way the tourney actually builds it, once per
// rule and once per rule PAIR (the cron rolls one or two), and reports what came
// out. It is read-only: nothing here changes how a bot is picked or built.
//
// The three questions, in order of how badly a failure reads to the player:
//
//   1. Can the army still FIGHT? A squad with no hero, no front line, or a
//      healer that cannot legally touch anybody is not a weak opponent, it is a
//      broken one. Items carry adds_tag/removes_tag (data/items.js), and tags
//      gate ability targeting (utils/tag-rules.js), so stripping gear can leave
//      a mender with no legal target in its own squad.
//   2. Is it still the BUILD? Units dropped and gear removed, counted.
//   3. Is it still a MATCH? Adapted ⚔ against the unadapted band's ⚔.

const {
  BOT_BANDS, BOT_TEMPLATES, buildBotArmy, botArmyAsSquad, findBotUnit, variantSlotsFor,
} = require('../data/bot_templates.js');
const { TOURNEY_RULES, checkTourneyRules } = require('../data/tourney.js');
const { ITEM_DEFS, ITEM_DOWNGRADES } = require('../data/items.js');
const { UNIT_ABILITIES } = require('../data/unit_abilities.js');
const { resolveSynergies } = require('../data/formation_synergies.js');
const { filterByTagRules, TAG_RULES } = require('./tag-rules.js');
const { calcUnitPower } = require('./army-power.js');

// Only the rules that touch the SQUAD reach adaptSlotsToRules. `twist` and
// `engravings_off` change the battle instead (battleRulesOf), so sweeping them
// would produce a column of identical rows.
const SQUAD_RULE_KINDS = new Set(['ban_tag', 'size_only', 'loyalty_max', 'item_rarity_max', 'no_items']);

// How far below the unadapted band's ⚔ an adapted army may land before it stops
// being an opponent. Some loss is the rule doing its job — the player pays it
// too — but a bot at half power is a free win dressed as a tournament battle.
const POWER_FLOOR_PCT = 85;

// Under the grid's six cells, a squad this small cannot hold a line whatever it
// is carrying.
const MIN_UNITS = 3;

const squadRules = () => TOURNEY_RULES.filter(r => SQUAD_RULE_KINDS.has(r.kind));

// Singles first, then pairs, because that is what a day can roll. Ordered so a
// report reads singles-then-pairs rather than interleaved.
function ruleSets(rules = squadRules()) {
  const sets = rules.map(r => [r]);
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) sets.push([rules[i], rules[j]]);
  }
  return sets;
}

const armyPower = army => army.reduce((n, u) => n + calcUnitPower(u), 0);

const loyaltyCost = unit => ((unit.size === 'row' || unit.size === 'column') ? 2 : 1);

// The strongest squad this build could field under a Loyalty cap, by picking
// from its OWN units — a small knapsack over cost 1 and 2 bodies, with the hero
// free because the rule does not charge for it.
//
// This is the reference a Loyalty rule has to be judged against. A cap of 3
// buys three tiles where the authored squad had five bodies, so NO squad can
// match the uncapped one and measuring against it condemns every lineup,
// the player's included. The question worth asking is whether the cut took the
// best three the build had.
function bestPowerUnderLoyalty(army, cap) {
  const hero = army.find(u => u.is_hero);
  const rest = army.filter(u => !u.is_hero).map(u => ({ cost: loyaltyCost(u), val: calcUnitPower(u) }));
  const best = new Array(cap + 1).fill(0);
  for (const { cost, val } of rest) {
    // Backwards, so each unit is taken at most once.
    for (let c = cap; c >= cost; c--) best[c] = Math.max(best[c], best[c - cost] + val);
  }
  return best[cap] + (hero ? calcUnitPower(hero) : 0);
}

// A unit's ability keys, the shape matchesSpec wants. `passive` is the unit's
// own list; an item's passive is already folded into `passive` by
// applyItemModifiers, so nothing extra is needed here.
const abilityKeysOf = unit => (Array.isArray(unit.passive) ? unit.passive : [unit.passive]).filter(Boolean);

function footprint(cell, size) {
  if (size === 'row')    return [cell, cell + 1];
  if (size === 'column') return [cell, cell + 2];
  return [cell];
}

// Column 0 (cells 0/2/4) is the front line; a row unit spans both columns and so
// always holds one. An army entirely in column 1 is archers with nobody in front.
const holdsFrontLine = army =>
  army.some(u => (u.size === 'row') || footprint(u.cell, u.size ?? 'tile').some(c => c % 2 === 0));

// Whether a mender can legally touch anyone in its own squad. This is the check
// that catches a stripped adds_tag: 'mend flesh' only reaches Zombies,
// 'song_of_ash' only Demons, 'pale_embrace' only Spirits (utils/tag-rules.js),
// and the tag those clauses read can arrive on an ITEM.
function actionKeyOf(unit) {
  const raw = unit.action;
  if (!raw) return null;
  if (typeof raw === 'string') return raw.toLowerCase();
  if (typeof raw === 'object' && raw.id) return String(raw.id).toLowerCase();
  return null;
}

const isHealer = unit => (unit.target_type || unit.action?.target_type) === 'ally';

function unreachableActions(army) {
  const out = [];
  for (const unit of army) {
    const key = actionKeyOf(unit);
    if (!key) continue;
    const allies = army.filter(u => u !== unit);

    // Sacrifice needs somebody to spend, whatever their tags.
    if (key === 'sacrifice') {
      if (!allies.length) out.push(`${unit.name} can only sacrifice an ally and stands alone`);
      continue;
    }
    // Only ally-aimed actions are tag-gated. An attacker always has the enemy.
    if (!isHealer(unit) && key !== 'holy_shock') continue;
    // holy_shock mends allies under the 'heal' clause and strikes enemies, so it
    // is never fully dead — but a Holy Shock that can mend nobody is half a unit.
    const clause = key === 'holy_shock' ? 'heal' : key;
    if (!TAG_RULES[clause]) continue;
    if (!filterByTagRules(allies, clause).length) {
      out.push(`${unit.name}: '${clause}' can reach nobody in this squad`);
    }
  }
  return out;
}

// A hard tag gate on an ability, as opposed to a per-tag COUNTER. 'resurrect …
// tag_required: Zombie' does nothing without a Zombie; 'armor_per_tag … Caster'
// merely scales to zero. Only the former makes a unit dead weight.
function unmetAbilityGates(army) {
  const tags = new Set(army.flatMap(u => u.tags ?? []));
  const out = [];
  for (const unit of army) {
    for (const key of abilityKeysOf(unit)) {
      const params = UNIT_ABILITIES[key]?.params;
      const want = params?.tag_required;
      if (!want || tags.has(want)) continue;
      const scales = Object.keys(params).some(k => /_per_tag$/.test(k));
      if (!scales) out.push(`${unit.name}: '${key}' needs a ${want} ally and there is none`);
    }
  }
  return out;
}

// Synergies the authored squad forms and the adapted one does not. A dropped
// partner breaks the bond silently — the surviving unit keeps its cell and loses
// the reason it was standing there.
// Guardian-bond carriers (Unity, Blood Bond) standing with no partner to bond to.
//
// A carrier is not a weak unit without its bond, it is a NON-UNIT: its action is
// 'none', so an orphan takes a slot in a six-cell grid, does nothing all battle,
// hands over no stats and dies for free. Worse than any lost synergy, which is why
// this is fatal rather than a soft note — and it is exactly what subtraction
// produces, since the partner is matched on a TAG (Holy, Vampire) and a tag ban
// can take the host while leaving the carrier standing.
//
// Read off the live ability definitions rather than naming 'unity 1' and
// 'blood_bond 1', so a third bond ability is caught without touching this.
const BOND_ABILITY_KEYS = Object.entries(UNIT_ABILITIES)
  .filter(([, def]) => def?.params?.bond_synergy || def?.params?.unity_bond === true)
  .map(([key]) => key);

function orphanedBonds(army) {
  const carriers = army.filter(u => abilityKeysOf(u).some(k => BOND_ABILITY_KEYS.includes(k)));
  if (!carriers.length) return [];
  // resolveSynergies is the same resolver the battle engine bonds through, so a
  // carrier it does not pair here is one formGuardianBond will not pair either.
  const units = army.map((u, i) => ({
    id: String(i), side: 'enemy', cells: footprint(u.cell, u.size ?? 'tile'),
    tags: u.tags ?? [], abilityKeys: abilityKeysOf(u), type: u.type, unitId: u.id,
  }));
  const bonded = new Set(resolveSynergies(units)
    .filter(b => b.defId === 'unity_bond' || b.defId === 'blood_bond')
    .map(b => b.sourceId));
  return carriers
    .filter(u => !bonded.has(String(army.indexOf(u))))
    .map(u => `${u.name} has no bond partner and cannot act — a wasted slot`);
}

function synergyIds(army) {
  const units = army.map((u, i) => ({
    id: String(i),
    side: 'enemy',
    cells: footprint(u.cell, u.size ?? 'tile'),
    tags: u.tags ?? [],
    abilityKeys: abilityKeysOf(u),
    type: u.type,
    unitId: u.id,
  }));
  return new Set(resolveSynergies(units).map(b => b.defId));
}

// One template, one band, one rule set. `status` is the worst thing found:
//
//   ineligible  the adapted squad STILL breaks the rules, so pickBotTemplate's
//               `allow` filter rejects it and this template is not offered
//               tonight. Not a defect on its own — tag bans are meant to do
//               this — but it shrinks the pool, so it is counted.
//   broken      it would take the field and cannot fight properly.
//   gutted      it can fight, but it is no longer the build or no longer a match.
//   ok          it pays the rule's price and stays an opponent.
function auditCase(template, bandId, rules) {
  const ruleIds  = rules.map(r => r.id);
  const baseline = buildBotArmy(template, bandId, null);
  const adapted  = buildBotArmy(template, bandId, rules);

  // What plain subtraction would have produced: the authored squad under these
  // rules with no variant. It is the alternative a variant replaces, and the
  // honest yardstick for one — comparing a GEARLESS lineup against the GEARED
  // squad counts the rule itself as damage and reports a defect where there is
  // none.
  const variant  = variantSlotsFor(template, bandId, rules);
  const stripped = variant
    ? buildBotArmy({ ...template, variants: null }, bandId, rules)
    : adapted;
  const forbidsItems = rules.some(r => r.kind === 'no_items');

  const basePower = armyPower(baseline);
  const power     = armyPower(adapted);

  // A Loyalty cap is judged against the best squad the cap allows, not against
  // the uncapped one (see bestPowerUnderLoyalty). Every other rule is judged
  // against the band, because a bot that cannot match the band is not an
  // opponent whatever took it there.
  const loyaltyRule = rules.find(r => r.kind === 'loyalty_max');
  const refPower = loyaltyRule ? bestPowerUnderLoyalty(baseline, loyaltyRule.max) : basePower;
  const pct      = refPower ? Math.round((power / refPower) * 100) : 100;

  // Which authored bodies came with gear, by unit and cell — the key survives
  // adaptation, since the adapter nulls items and drops slots but never moves one.
  const woreAnItem = new Set(baseline.filter(u => u.item_id).map(u => `${u.id}@${u.cell}`));

  const result = {
    template: template.id, band: bandId, rules: ruleIds,
    units: adapted.length, baselineUnits: baseline.length,
    power, basePower, refPower, pct,
    // Gear taken off a unit that is STILL STANDING. Counting the baseline's
    // items against the adapted army's instead made every dropped unit look
    // like a stripped item too, double-charging one cut.
    itemsLost: adapted.filter(u => !u.item_id && woreAnItem.has(`${u.id}@${u.cell}`)).length,
    notes: [],
  };

  const squad  = botArmyAsSquad(template, bandId, rules);
  const broken = squad.units.length
    ? checkTourneyRules(squad.units, rules, { itemsByRosterId: squad.itemsByRosterId })
    : [{ rule: 'empty', text: 'adapted to nothing' }];
  if (broken.length) {
    result.status = 'ineligible';
    result.notes  = broken.map(b => b.text);
    return result;
  }

  // Fatal, in the order a player would notice.
  const fatal = [];
  if (!adapted.length) fatal.push('no units left');
  if (!adapted.some(u => u.is_hero)) fatal.push('no hero — the AI has no build to play');
  if (adapted.length && adapted.length < MIN_UNITS) fatal.push(`${adapted.length} units, fewer than ${MIN_UNITS}`);
  if (adapted.length && !holdsFrontLine(adapted)) fatal.push('nothing in the front line');
  fatal.push(...unreachableActions(adapted), ...unmetAbilityGates(adapted), ...orphanedBonds(adapted));

  // Degradations, measured against what these rules ALLOW rather than against
  // the geared squad. Power stays measured against the band, because that is
  // the question the player's opponent has to answer.
  const soft = [];
  // Measured in FIGHTING bodies. An orphaned bond carrier is not a unit — it
  // cannot act — so a lineup that drops one and keeps the rest has not lost a
  // body, and counting it as one reported a defect for fixing a defect.
  const strippedBodies = stripped.length - orphanedBonds(stripped).length;
  const dropped = strippedBodies - result.units;
  if (dropped > 0) soft.push(`${dropped} of ${strippedBodies} units dropped`);
  // Gear coming off is the rule doing its job when the rule is `no_items`; it
  // is a defect only when the rule merely CAPPED rarity and the adapter took
  // the item away instead of finding a legal one.
  if (!forbidsItems && result.itemsLost > 0) soft.push(`${result.itemsLost} items removed outright`);
  if (pct < POWER_FLOOR_PCT) {
    soft.push(loyaltyRule
      ? `⚔ ${power} vs ${refPower} best under Loyalty ${loyaltyRule.max} (${pct}%)`
      : `⚔ ${power} vs ${basePower} (${pct}% of the band)`);
  }
  const lostSynergies = [...synergyIds(stripped)].filter(id => !synergyIds(adapted).has(id));
  if (lostSynergies.length) soft.push(`synergies lost: ${lostSynergies.join(', ')}`);

  if (variant) {
    result.variant = variant.rule;
    const gained = [...synergyIds(adapted)].filter(id => !synergyIds(stripped).has(id));
    if (gained.length) result.gained = gained;
  }

  result.notes  = [...fatal, ...soft];
  result.status = fatal.length ? 'broken' : (soft.length ? 'gutted' : 'ok');
  return result;
}

// Every template × band × rule set. Bands a template does not define are skipped.
function auditBotTemplates(templates = BOT_TEMPLATES) {
  const sets = ruleSets();
  const cases = [];
  for (const template of templates) {
    for (const band of BOT_BANDS) {
      const slots = template.bands?.[band.id];
      if (!Array.isArray(slots) || !slots.length) continue;
      for (const rules of sets) cases.push(auditCase(template, band.id, rules));
    }
  }
  return cases;
}

// Per rule, how many (template, band) pairs survive it — the number that decides
// whether an evening has opponents. `pool` counts the ones pickBotTemplate may
// actually offer (ok + gutted): ineligible and broken ones are not opponents.
function auditByRule(cases) {
  const out = {};
  for (const c of cases) {
    if (c.rules.length !== 1) continue;
    const key = c.rules[0];
    const row = out[key] ??= { ok: 0, gutted: 0, broken: 0, ineligible: 0, pool: 0 };
    row[c.status]++;
    if (c.status === 'ok' || c.status === 'gutted') row.pool++;
  }
  return out;
}


// Downgrade ladders that drop a granted tag, as readable lines.
//
// Advisory, not a defect: `aldras_patience` rides units that are already Demons,
// so losing +Demon costs nothing, and a tag that fed only the departing item's
// own passive leaves with it. It matters when a NATIVE passive reads the tag —
// which the per-case ability check catches — so this list is here to be read
// when a new item is added, before the audit has to find it the hard way.
function checkDowngrades() {
  const lines = [];
  for (const [from, subs] of Object.entries(ITEM_DOWNGRADES)) {
    const tag = ITEM_DEFS[from]?.adds_tag;
    if (!tag) continue;
    const keeps = subs.filter(id => ITEM_DEFS[id]?.adds_tag === tag);
    if (!keeps.length) lines.push(`${from} grants ${tag}; no rung keeps it (${subs.join(' → ')})`);
  }
  return lines;
}

module.exports = {
  auditBotTemplates, auditByRule, auditCase, ruleSets, squadRules, checkDowngrades,
  POWER_FLOOR_PCT, MIN_UNITS,
};
