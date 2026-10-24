// ── Errands ─────────────────────────────────────────────────────────────────
// A solo task for ONE non-hero unit. The unit leaves the roster for the errand's
// duration and comes back with the reward; there is no failure roll and no
// outcome to survive. The whole cost is the absence — a unit on an errand cannot
// embark, so the player trades that unit's next few hours for what it brings.
//
// REQUIREMENTS ARE TAGS, NOT PASSIVES
// A passive is a per-unit detail; a tag is what the unit IS. There are only six
// or seven tags in a faction against ~60 passives, so a tag requirement is
// something a player can hold in their head, and "who can go?" is answered by
// looking at a unit, not by reading a list. It also gives item-granted tags
// somewhere to matter: a unit is read through unit_data first (see unitProfile),
// so a third tag hung on a unit by its item counts here exactly like a native one.
//
// TWO TAGS, TWO PARTS
// Every SIMPLE errand names two tags and pays one reward part per tag. A unit
// qualifies by having EITHER tag and earns only the part(s) it actually matches
// — so the unit carrying both tags brings both halves home. The pool the parts
// are drawn from is deliberately small: XP for the unit, gold, or one
// faction-appropriate crystal.
//
// TWO ERRANDS, ONE SLOT
// The post offers a simple errand and a GRAND one at the same time, and the
// player takes one. A grand errand demands both of its tags, runs for a fixed
// length written into the errand rather than chosen, and pays a token out of the
// supply pool. See the KIND_* block below for why the two are shaped so
// differently.
//
// COMPLETABILITY
// Nothing here guarantees an errand is offerable. That is enforced when the
// offer is CREATED (see ensureErrandOffer in routes/index.js): the server filters
// to errands some free unit really satisfies, so a player is never shown a task
// their roster cannot do.
// Errand payouts scale with the MESSENGER'S POST, not the throne. The post is
// the building that opens errands, so it is the one that should make them worth
// running — one tier per level. Level 0 (no post) still maps to tier 1 rather
// than to nothing, because a caller that has not loaded structures yet must not
// silently price every errand at zero. Level 4 adds capacity, not a higher
// payout tier.
const ERRAND_BUILDING_TIER = { 0: 1, 1: 1, 2: 2, 3: 3, 4: 3 };

// Post level 1 pays the base rate, level 2 pays 1.5x, and levels 3-4 pay 2x.
// Level 4 expands capacity without increasing the reward rate.
const TIER_REWARD_MULT = { 1: 1, 2: 1.5, 3: 2 };

// ── Duration ────────────────────────────────────────────────────────────────
// The player picks how long the unit is gone. Longer is better per errand but
// worse per hour (2h pays 10/h, 6h pays 6.7/h), so the short trip is right when
// the unit is wanted for an embark and the long one is right overnight. There is
// no failure roll, so this choice IS the errand's decision.
//
// A GRAND errand has no such choice: its `hours` is part of the errand, the way
// its reward is, so the trip length varies per errand rather than per player.
const DURATIONS = [
  { hours: 2, mult: 1 },
  { hours: 4, mult: 1.5 },
  { hours: 6, mult: 2 },
];
const DEFAULT_HOURS = 2;

// ── Two kinds of errand ─────────────────────────────────────────────────────
// The post offers BOTH at once and the player takes one, so the decision the
// sheet asks is no longer "how long?" but "which?".
//
//   simple  the errand this file was written for: two tags, EITHER qualifies,
//           one reward part per tag matched, and the player picks 2/4/6 hours.
//           Pays XP, gold or a crystal — the currencies that are always useful
//           and never scarce.
//   grand   one errand, both tags, a fixed long trip, and a reward out of the
//           supply pool rather than the treasury: a Tome, a Sigil, a stack of
//           potions. These are the things a player cannot buy, so the grand
//           errand is the only standing way to earn one at home.
//
// The grand errand is deliberately NOT a bigger simple one. Its cost is the
// pair of tags (a dual-tag unit is a real roster constraint, not a filter) plus
// a unit gone for most of a day, and what it buys is a token — a different
// currency, not more of the same one. That keeps the choice between the two a
// choice about what the player NEEDS rather than arithmetic about rates.
const KIND_SIMPLE = 'simple';
const KIND_GRAND  = 'grand';

// Grand errands are the Messenger's Post's second level earning its keep. At
// level 1 only the simple offer is minted, so the post has a reason to rise
// beyond the payout multiplier.
const GRAND_MIN_POST_LEVEL = 2;

function errandKind(errand) {
  return errand?.kind === KIND_GRAND ? KIND_GRAND : KIND_SIMPLE;
}
function isGrand(errand) {
  return errandKind(errand) === KIND_GRAND;
}

// Every trip length this errand allows, priced. One entry for a grand errand
// (its own `hours`, no multiplier — the reward is already written for that
// length), three for a simple one.
function errandDurations(errand) {
  if (isGrand(errand)) return [{ hours: Number(errand.hours) || DEFAULT_HOURS, mult: 1 }];
  return DURATIONS;
}

// Server and client both resolve a requested duration through this, so an
// arbitrary `hours` in a request body cannot buy a multiplier or a shorter trip
// than the errand asks for.
function durationFor(errand, hours) {
  const allowed = errandDurations(errand);
  return allowed.find(d => d.hours === Number(hours)) ?? allowed[0];
}

// ── Definition shape ────────────────────────────────────────────────────────
//   id       unique key, referenced by the errand row
//   kind     'simple' (the default when absent) or 'grand'
//   faction  which faction may be offered it
//   art      a building art key (see buildings.js). The image shown is that
//            building in THIS errand's faction, /assets/buildings/<art>_<e|c|g>.jpg,
//            so an errand costs no art of its own — naming a building is enough.
//            Missing art degrades to no image.
//
// SIMPLE only:
//   parts    exactly two, one per tag:
//              tag     the unit tag this half is for
//              reward  what that half pays — xp_self, xp_roster, or resources
//
// GRAND only:
//   require_tags  exactly two; the unit must carry BOTH
//   hours         the one trip length this errand has
//   reward        the whole payout, flat — scaled by neither post nor duration
//                 (see rewardForTags). `tokens` keys are TOKEN_DEFS ids from
//                 data/embark.js: crossroad_sigil, tome_of_knowledge,
//                 health_potion.
//
// SCALE — what these numbers are measured against:
//   one unit's share of a battle   10 XP (level 1) to 26 XP (level 6)
//   a level-6 battle               40 gold
//   XP to advance a tier-1 unit    50-75      a tier-2 unit  300-360
// One part at post level 1 for two hours is about one battle share. A unit
// matching both tags doubles that, the post multiplies it (x1, x1.5, x2) and so
// does the trip length (x1, x1.5, x2) — so the ceiling is a dual-tag unit at a
// level-3 post for six hours, which is 160 XP and 160 gold.
const PART_XP    = 20;
const PART_GOLD  = 20;
const PART_CRYST = 6;

const ERRANDS = [
  // ── EMPIRE ────────────────────────────────────────────────────────────────
  {
    id: 'emp_annex_watch', faction: 'empire', art: 'garrison_annex',
    title: { en: 'Watch on the Annex Wall',      ru: 'Стража на стене пристройки' },
    desc:  { en: 'The garrison annex has stood unmanned since the levy marched. Stand its wall, and the quarter sleeps.',
             ru: 'Гарнизонная пристройка пуста с тех пор, как ополчение ушло. Постойте на её стене — и квартал будет спать спокойно.' },
    parts: [
      { tag: 'Knight',    reward: { xp_self: PART_XP } },
      { tag: 'Construct', reward: { resources: { Gold: PART_GOLD } } },
    ],
  },
  {
    id: 'emp_forge_commission', faction: 'empire', art: 'blacksmith',
    title: { en: "The Forge's Commission",       ru: 'Заказ кузницы' },
    desc:  { en: 'The blacksmith is behind on a crown order and paying anyone who can hold a file steady.',
             ru: 'Кузница не поспевает с королевским заказом и платит любому, кто твёрдо держит напильник.' },
    parts: [
      { tag: 'Engineer', reward: { resources: { Gold: PART_GOLD } } },
      { tag: 'Spirit',   reward: { xp_self: PART_XP } },
    ],
  },
  {
    id: 'emp_temple_dawn_office', faction: 'empire', art: 'temple',
    title: { en: "Dawn Office in the Lion's Temple", ru: 'Рассветная служба в Храме Льва' },
    desc:  { en: 'The temple needs a voice that carries the dawn office and a hand that can hold the light steady through it.',
             ru: 'Храму нужен голос, что проведёт рассветную службу, и рука, что удержит свет до конца.' },
    parts: [
      { tag: 'Caster', reward: { xp_self: PART_XP } },
      { tag: 'Holy',   reward: { resources: { Crystals_Life: PART_CRYST } } },
    ],
  },

  // ── CHOIR OF THE CURSED ───────────────────────────────────────────────────
  {
    id: 'cho_forge_vigil', faction: 'choir_of_the_cursed', art: 'blacksmith',
    title: { en: 'Vigil at the Forge Mouth',     ru: 'Бдение у зева горна' },
    desc:  { en: 'The great forge cannot be banked and cannot be left. Stand where nothing else can stand.',
             ru: 'Великий горн нельзя ни притушить, ни оставить. Встаньте там, где не выстоит никто другой.' },
    parts: [
      { tag: 'Demon',     reward: { xp_self: PART_XP } },
      { tag: 'Construct', reward: { resources: { Gold: PART_GOLD } } },
    ],
  },
  {
    id: 'cho_guild_song', faction: 'choir_of_the_cursed', art: 'mage_guild',
    title: { en: 'A Song in the Mage Guild',     ru: 'Песнь в Гильдии магов' },
    desc:  { en: 'The guild wants the old verse sung over the work of the night, where it was written. Sing it badly and the court remembers.',
             ru: 'Гильдия желает услышать старый стих над ночной работой, там, где он был написан. Спойте плохо — двор запомнит.' },
    parts: [
      { tag: 'Caster', reward: { xp_self: PART_XP } },
      { tag: 'Court', reward: { resources: { Crystals_Fire: PART_CRYST } } },
    ],
  },
  {
    id: 'cho_temple_gifts', faction: 'choir_of_the_cursed', art: 'temple',
    title: { en: 'Gather the Gifts of Aggrail',  ru: 'Собрать дары Агграила' },
    desc:  { en: 'What the faithful leave at the Temple of Embers is owed upward. Collect it, and count it honestly.',
             ru: 'Оставленное верующими в Храме Угольев принадлежит выше. Соберите — и сочтите честно.' },
    parts: [
      { tag: 'Caster',  reward: { resources: { Gold: PART_GOLD } } },
      { tag: 'Warrior', reward: { xp_self: PART_XP } },
    ],
  },

  // ── GRAIL OF SORROW ───────────────────────────────────────────────────────
  {
    id: 'gra_infirmary_fallen', faction: 'grail_of_sorrow', art: 'infirmary',
    title: { en: 'Tend to the Fallen',           ru: 'Позаботиться о павших' },
    desc:  { en: 'Carry the fallen down to the infirmary before the sun does the work badly. It is heavy, and nobody thanks you.',
             ru: 'Отнесите павших в лазарет, прежде чем солнце сделает это скверно. Ноша тяжела, и никто не поблагодарит.' },
    parts: [
      { tag: 'Zombie', reward: { xp_self: PART_XP } },
      { tag: 'Knight', reward: { resources: { Gold: PART_GOLD } } },
    ],
  },
  {
    id: 'gra_temple_lost_souls', faction: 'grail_of_sorrow', art: 'temple',
    title: { en: 'Help the Lost Souls Home',     ru: 'Проводить заблудшие души' },
    desc:  { en: 'They gather at the Temple of Sorrow and will not go in. Someone has to stand at the doors and tell them the way.',
             ru: 'Они собираются у Храма Скорби и не входят. Кто-то должен встать у дверей и указать им путь.' },
    parts: [
      { tag: 'Spirit', reward: { xp_self: PART_XP } },
      { tag: 'Caster', reward: { resources: { Crystals_Death: PART_CRYST } } },
    ],
  },
  {
    id: 'gra_reliquary_chalice', faction: 'grail_of_sorrow', art: 'supply_depot',
    title: { en: 'Fill the Lesser Chalice',      ru: 'Наполнить малую чашу' },
    desc:  { en: 'The reliquary wants its lesser chalice full by dawn, and someone who can take it from another and still walk home.',
             ru: 'Реликварию нужна полная малая чаша к рассвету — и тот, кто возьмёт её у другого и сам дойдёт домой.' },
    parts: [
      { tag: 'Vampire', reward: { resources: { Gold: PART_GOLD } } },
      { tag: 'Holy',    reward: { xp_self: PART_XP } },
    ],
  },

  // ── GRAND ERRANDS ─────────────────────────────────────────────────────────
  // One per faction, each paying a different token, each a different length.
  // The tag pairs are chosen off the real rosters (data/units.js): Caster+Holy
  // is thirteen Empire units, Caster+Demon is forty-two Choir ones, and
  // Knight+Zombie is eleven in the Grail — a constraint a player can satisfy
  // without it being a constraint they can ignore.
  {
    id: 'emp_temple_long_vigil', kind: KIND_GRAND, faction: 'empire', art: 'temple',
    require_tags: ['Caster', 'Holy'],
    hours: 6,
    reward: { tokens: { tome_of_knowledge: 1 } },
    title: { en: 'The Long Vigil',               ru: 'Долгое бдение' },
    desc:  { en: 'Six hours knelt in the Lion\'s Temple, reading the hard pages aloud until they are yours. Only a blessed voice can hold the light that long.',
             ru: 'Шесть часов на коленях в Храме Льва — читать трудные страницы вслух, пока они не станут вашими. Лишь благословенный голос удержит свет так долго.' },
  },
  {
    id: 'cho_guild_long_transcription', kind: KIND_GRAND, faction: 'choir_of_the_cursed', art: 'mage_guild',
    require_tags: ['Caster', 'Demon'],
    hours: 8,
    reward: { tokens: { crossroad_sigil: 1 } },
    title: { en: 'Copy the Crossroad Leaf',      ru: 'Переписать лист перекрестья' },
    desc:  { en: 'The guild holds one leaf of the old crossroad work and will not let it leave the room. Copy it by hand, in a hand the ink does not burn.',
             ru: 'Гильдия хранит один лист старой работы о перекрестьях и не выпустит его из комнаты. Перепишите его рукой, которую не жжёт эта тушь.' },
  },
  {
    id: 'gra_infirmary_long_watch', kind: KIND_GRAND, faction: 'grail_of_sorrow', art: 'infirmary',
    require_tags: ['Knight', 'Zombie'],
    hours: 12,
    reward: { tokens: { health_potion: 5 } },
    title: { en: 'A Night and a Day in the Ward', ru: 'Ночь и день в палате' },
    desc:  { en: 'The infirmary brews through the night and needs hands that do not tire and a back that does not turn. Stay until the vats are full.',
             ru: 'Лазарет варит всю ночь: нужны руки, что не устанут, и спина, что не отвернётся. Останьтесь, пока чаны не наполнятся.' },
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function errandTier(postLevel) {
  return ERRAND_BUILDING_TIER[Math.max(0, Math.min(4, Number(postLevel) || 0))] ?? 1;
}

// Everything a roster row brings to a requirement check. `resolveDef` is passed
// in so this file needs no import of units.js (the client already has one).
// unit_data wins over the definition, for any per-unit change stored there.
//
// A tag from a worn item is NOT one of those: equipping only writes the items
// link and the roster row keeps the unit's base stats, so the item has to be
// handed in separately. Callers that read a row without its item get base tags —
// which is why `_item_stats` rides along on the rows the errand endpoints load.
function unitProfile(row, resolveDef, itemStats = row?._item_stats ?? null) {
  const stored = row?.unit_data || {};
  const def    = resolveDef ? resolveDef(row) : null;
  const raw    = stored.tags ?? def?.tags ?? [];
  const list   = (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map(String);
  const granted = itemStats?.adds_tag ? String(itemStats.adds_tag) : null;
  if (granted && !list.includes(granted)) list.push(granted);
  // ...and a tag it TAKES AWAY (Broken Sigil). An errand judges the unit as the
  // battlefield does, so a stripped tag must not satisfy a requirement here
  // either. Kept inline rather than imported for the reason above; the authority
  // is removedTags() in data/items.js and this must match it.
  const stripSpec = itemStats?.removes_tag;
  const strip = (Array.isArray(stripSpec) ? stripSpec : (stripSpec ? [stripSpec] : []))
    .filter(Boolean).map(t => String(t).toLowerCase());
  const kept = strip.length ? list.filter(t => !strip.includes(t.toLowerCase())) : list;
  return { tags: kept };
}

// The two tags an errand names — the order its reward parts are listed in for a
// simple one, the order written in `require_tags` for a grand one.
function errandTags(errand) {
  if (isGrand(errand)) return (errand?.require_tags || []).slice();
  return (errand?.parts || []).map(p => p.tag);
}

// What this errand demands, resolved into the shape that is snapshotted onto the
// errand row so the UI can still explain it after the fact. The two kinds differ
// only in the key: `tags_any` for either, `tags_all` for both.
function resolveRequirement(errand) {
  return isGrand(errand)
    ? { tags_all: errandTags(errand) }
    : { tags_any: errandTags(errand) };
}

function unitMeets(profile, resolved) {
  const all = resolved?.tags_all || [];
  if (all.length) return all.every(t => profile.tags.includes(t));
  const want = resolved?.tags_any || [];
  if (!want.length) return true;
  return want.some(t => profile.tags.includes(t));
}

function scaleAmount(n, mult) { return Math.round(n * mult); }

// Merge the parts a unit has EARNED into one reward object. A unit matching both
// tags gets both halves; a unit matching one gets one. Tier and duration
// multiply what comes out, never which parts apply.
function rewardForTags(errand, tags, postLevel, tierOverride = null, hours = DEFAULT_HOURS) {
  // A grand errand pays exactly what it is written to pay. Nothing multiplies
  // it: its length is fixed, and a token is a whole thing — x1.5 of one Sigil
  // is either a rounding bug or a doubling, never a 50% raise. The post level
  // gates whether it is OFFERED (GRAND_MIN_POST_LEVEL) instead of scaling it.
  if (isGrand(errand)) return grandReward(errand);

  const tier = tierOverride ?? errandTier(postLevel);
  const mult = (TIER_REWARD_MULT[tier] ?? 1) * durationFor(errand, hours).mult;
  const have = (tags || []).filter(Boolean).map(String);

  const out = {};
  for (const part of errand.parts || []) {
    if (!have.includes(part.tag)) continue;
    const r = part.reward || {};
    if (r.xp_self)   out.xp_self   = (out.xp_self   ?? 0) + scaleAmount(r.xp_self, mult);
    if (r.xp_roster) out.xp_roster = (out.xp_roster ?? 0) + scaleAmount(r.xp_roster, mult);
    for (const [k, v] of Object.entries(r.resources || {})) {
      out.resources = out.resources || {};
      out.resources[k] = (out.resources[k] ?? 0) + scaleAmount(v, mult);
    }
  }
  return out;
}

// A deep-ish copy, so a caller that merges into the returned object (the way
// the simple path builds one up) cannot write into the definition itself.
function grandReward(errand) {
  const r = errand?.reward || {};
  const out = {};
  if (r.xp_self)   out.xp_self   = r.xp_self;
  if (r.xp_roster) out.xp_roster = r.xp_roster;
  if (r.resources) out.resources = { ...r.resources };
  if (r.tokens)    out.tokens    = { ...r.tokens };
  return out;
}

// Every part priced on its own, for the sheet: the player sees which tag pays
// what BEFORE choosing who goes, which is the whole point of the two-part split.
// A grand errand has no parts — both tags buy one indivisible reward — so it
// reports an empty list and the sheet shows `reward` instead.
function rewardParts(errand, postLevel, tierOverride = null, hours = DEFAULT_HOURS) {
  if (isGrand(errand)) return [];
  return (errand.parts || []).map(p => ({
    tag:    p.tag,
    reward: rewardForTags(errand, [p.tag], postLevel, tierOverride, hours),
  }));
}

const ERRANDS_BY_ID = Object.fromEntries(ERRANDS.map(e => [e.id, e]));

// Dual export, same as data/units.js: the browser imports this file as an ES
// module and routes/index.js `require`s it. One of the two forms is always the
// wrong one, so both are provided — without the `export` the client throws
// "does not provide an export named ERRANDS_BY_ID" at load.
export {
  ERRANDS,
  ERRANDS_BY_ID,
  ERRAND_BUILDING_TIER,
  TIER_REWARD_MULT,
  DURATIONS,
  DEFAULT_HOURS,
  KIND_SIMPLE,
  KIND_GRAND,
  GRAND_MIN_POST_LEVEL,
  errandKind,
  isGrand,
  errandDurations,
  grandReward,
  durationFor,
  errandTier,
  unitProfile,
  errandTags,
  resolveRequirement,
  unitMeets,
  rewardForTags,
  rewardParts,
};

if (typeof module !== 'undefined') module.exports = {
  ERRANDS,
  ERRANDS_BY_ID,
  ERRAND_BUILDING_TIER,
  TIER_REWARD_MULT,
  DURATIONS,
  DEFAULT_HOURS,
  KIND_SIMPLE,
  KIND_GRAND,
  GRAND_MIN_POST_LEVEL,
  errandKind,
  isGrand,
  errandDurations,
  grandReward,
  durationFor,
  errandTier,
  unitProfile,
  errandTags,
  resolveRequirement,
  unitMeets,
  rewardForTags,
  rewardParts,
};