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
// silently price every errand at zero.
//
// Level 4 used to fold into tier 3, because it bought capacity rather than a
// raise. It is its own tier now so that SUPPLY_TIER_STEP below can give it a
// fourth rung — the tier is what gets SNAPSHOTTED onto an offer row, so a
// ladder with four values needs four tiers to survive being written down.
const ERRAND_BUILDING_TIER = { 0: 1, 1: 1, 2: 2, 3: 3, 4: 4 };

// Post level 1 pays the base rate, level 2 pays 1.5x, and levels 3-4 pay 2x.
// Tier 4 repeats tier 3 on purpose: for gold, XP and Valor the top post is
// still a capacity upgrade, and only supplies climb past it.
const TIER_REWARD_MULT = { 1: 1, 2: 1.5, 3: 2, 4: 2 };

// Supplies are the one reward that does not want a fractional multiplier — 1.5
// of an embark is nothing — so they ladder by whole steps instead: one supply
// per tier, which is 1/2/3/4 across the four post levels. A part writes how
// many LOTS it pays (always 1 today) and this is the size of a lot.
const SUPPLY_TIER_STEP = { 1: 1, 2: 2, 3: 3, 4: 4 };

// ── Two lengths, and that is the whole choice ─────────────────────────
// The post offers exactly two errands: a SHORT one and a LONG one. Each has its
// length written into it, so the player no longer picks hours — the choice is
// which errand to take, which is the same question asked once instead of twice.
//
// There used to be a 2/4/6 picker on top of the short/grand split, so the sheet
// asked "which?" and then "how long?", and the second question had one sensible
// answer most of the time. Folding the length into the errand removes a control
// without removing a decision.
const SHORT_HOURS = 2;
const LONG_HOURS  = 6;
const DEFAULT_HOURS = SHORT_HOURS;

// Still exported, because the shape is part of this file's contract: one entry
// per length an errand allows. Every errand now allows exactly one, so nothing
// here multiplies a reward any more — a long errand is paid by being written
// richer, not by a x2 hung on a short one.
const DURATIONS = [
  { hours: SHORT_HOURS, mult: 1 },
  { hours: LONG_HOURS,  mult: 1 },
];

// ── Two kinds of errand ──────────────────────────────────────
// The post offers BOTH at once and the player takes one.
//
//   simple  the SHORT errand, two hours. Pays what a player is always short
//           of: XP, gold, a crystal, supplies, a health potion.
//   grand   the LONG errand, six hours. Pays out of a pool the short one never
//           touches — Valor, and a Tome or a Crossroad Sigil.
//
// THEY ARE THE SAME SHAPE. Both name two tags, EITHER tag qualifies a unit, and
// each tag pays its own half — so a unit carrying both brings both halves home.
// The grand errand used to demand BOTH tags for one indivisible reward, which
// made it a different puzzle wearing the same card. The difference between them
// is now the pool and the clock, not the rules.
//
// What keeps the long errand from being a bigger short one is WHAT it pays.
// Valor and tokens cannot be bought and nothing else at home mints them, so the
// choice stays "what do I need?" rather than arithmetic about rates.
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

// Every trip length this errand allows, priced. Exactly one, either way: the
// length is a property of the errand now, not a choice on top of it. An errand
// may still override with its own `hours` — nothing in the table does, and the
// kind decides it — but a one-off would not need a new concept to express.
//
// The multiplier is always 1. It stays in the shape because offerPayload and
// durationFor both read it, and because a reward that scaled with a length the
// player cannot pick would be scaling with nothing.
function errandDurations(errand) {
  const hours = Number(errand?.hours) || (isGrand(errand) ? LONG_HOURS : SHORT_HOURS);
  return [{ hours, mult: 1 }];
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
// BOTH kinds:
//   parts    exactly two, one per tag:
//              tag     the unit tag this half is for
//              reward  what that half pays — xp_self, xp_roster, resources
//                      or tokens
//
// `resources` keys are treasury lines (Gold, Crystals_*, Valor). They take the
// post multiplier, except Valor, which steps by VALOR_PER_TIER instead.
// `tokens` keys are TOKEN_DEFS ids from data/embark.js
// (crossroad_sigil, tome_of_knowledge, health_potion) plus the placeholder
// 'supplies', and none of them scale.
//
// `hours` is optional and nothing uses it: the kind decides the length (see
// errandDurations). `require_tags` is gone — both kinds take either tag.
//
// SCALE — what these numbers are measured against:
//   one unit's share of a battle   10 XP (level 1) to 26 XP (level 6)
//   a level-6 battle               40 gold
//   XP to advance a tier-1 unit    50-75      a tier-2 unit  300-360
// One part at post level 1 for two hours is about one battle share. A unit
// matching both tags doubles that, the post multiplies it (x1, x1.5, x2) and so
// does the trip length (x1, x1.5, x2) — so the ceiling is a dual-tag unit at a
// level-3 post for six hours, which is 160 XP and 160 gold.
// The SHORT pool. These are BASES: the post multiplies them (x1, x1.5, x2), so
// the gold half runs 25 -> 38 -> 50 and tops out at 50, which is a level-6
// battle's 40 and a bit. Written as the base rather than the ceiling because
// that is what the multiplier takes; the ceiling is the number that was
// agreed, and it is the one to check after changing anything here.
const PART_XP    = 20;
const PART_GOLD  = 25;
const PART_CRYST = 6;

// Potions are a COUNT OF A WHOLE THING, written once and never scaled — see
// rewardForTags. Supplies are counted in LOTS, and SUPPLY_TIER_STEP above
// decides how big a lot is at this post; one lot is 1 supply at level 1 and 4
// at level 4.
const PART_SUPPLY = 1;
const PART_POTION = 2;

// The LONG pool, and nothing from the short one appears in it. Valor is the
// engraving currency (data/engravings.js) whose only other standing source is
// the daily; the token is a Tome or a Sigil, and a token never scales.
//
// Valor climbs by a FLAT +5 an upgrade — 10, 15, 20, 25 — rather than on the
// x1/x1.5/x2 multiplier everything else uses. The multiplier cannot draw that
// line: it repeats at tiers 3 and 4, so the top post would pay the same as the
// one below it and the ladder would stop at 20. A currency this scarce is
// easier to reason about as a straight line anyway.
const LONG_VALOR     = 10;
const VALOR_PER_TIER = 5;

// `supplies` is NOT a token id. It is a placeholder the player's FACTION
// resolves at payout — Camping Supplies, Liquid Sin, Chalice Of Sustenance —
// exactly as the battle drop and the daily claim already spend it (see
// supplyItemName in data/buildings.js). It rides inside `tokens` because that
// is the map the payout walks, and it is written with item_type 'supplies'.

const ERRANDS = [
  // ── EMPIRE ────────────────────────────────────────────
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
    id: 'emp_depot_rations', faction: 'empire', art: 'supply_depot',
    title: { en: 'Count the Marching Rations',   ru: 'Счесть походный паёк' },
    desc:  { en: 'The depot was packed in a hurry and nobody wrote down what went in. Open every crate, count it honestly, and close it again.',
             ru: 'Склад грузили впопыхах, и никто не записал, что вошло внутрь. Вскройте каждый ящик, сочтите честно и закройте снова.' },
    parts: [
      { tag: 'Warrior',  reward: { tokens: { supplies: PART_SUPPLY } } },
      { tag: 'Engineer', reward: { resources: { Gold: PART_GOLD } } },
    ],
  },
  {
    id: 'emp_infirmary_ward', faction: 'empire', art: 'infirmary',
    title: { en: 'A Turn on the Ward',           ru: 'Смена в лазарете' },
    desc:  { en: 'The ward brews more than it can bottle and the surgeons will not stop to do it. Stand at the bench until the rack is full.',
             ru: 'Лазарет варит больше, чем успевает разливать, а хирургам не до того. Встаньте у стола, пока стойка не заполнится.' },
    parts: [
      { tag: 'Holy',   reward: { tokens: { health_potion: PART_POTION } } },
      { tag: 'Caster', reward: { xp_self: PART_XP } },
    ],
  },

  // ── CHOIR OF THE CURSED ──────────────────────────────────────
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
      { tag: 'Court',  reward: { resources: { Crystals_Fire: PART_CRYST } } },
    ],
  },
  {
    id: 'cho_depot_tithe', faction: 'choir_of_the_cursed', art: 'supply_depot',
    title: { en: "Draw the Night's Tithe",       ru: 'Взять ночную десятину' },
    desc:  { en: 'The cellar pays its tithe in full measures and short tempers. Carry it up, and do not drink the difference.',
             ru: 'Погреб платит десятину полной мерой и дурным нравом. Поднимите её наверх — и не выпейте разницу.' },
    parts: [
      { tag: 'Warrior', reward: { tokens: { supplies: PART_SUPPLY } } },
      { tag: 'Demon',   reward: { resources: { Gold: PART_GOLD } } },
    ],
  },
  {
    id: 'cho_infirmary_draughts', faction: 'choir_of_the_cursed', art: 'infirmary',
    title: { en: 'Hold Down the Draughts',       ru: 'Удержать отвары' },
    desc:  { en: 'What the Choir brews fights the bottle. Something that does not flinch has to hold the funnel until it is all in.',
             ru: 'То, что варит Хор, спорит с бутылью. Воронку должен держать тот, кто не дрогнет, пока всё не окажется внутри.' },
    parts: [
      { tag: 'Beast',  reward: { tokens: { health_potion: PART_POTION } } },
      { tag: 'Caster', reward: { xp_self: PART_XP } },
    ],
  },

  // ── GRAIL OF SORROW ─────────────────────────────────────────
  {
    id: 'gra_infirmary_fallen', faction: 'grail_of_sorrow', art: 'infirmary',
    title: { en: 'Tend to the Fallen',           ru: 'Позаботиться о павших' },
    desc:  { en: 'Carry the fallen down to the infirmary before the sun does the work badly. It is heavy, and nobody thanks you.',
             ru: 'Отнесите павших в лазарет, прежде чем солнце сделает это скверно. Ноша тяжела, и никто не поблагодарит.' },
    parts: [
      { tag: 'Zombie', reward: { tokens: { health_potion: PART_POTION } } },
      { tag: 'Knight', reward: { xp_self: PART_XP } },
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
    id: 'gra_depot_chalice', faction: 'grail_of_sorrow', art: 'supply_depot',
    title: { en: 'Fill the Lesser Chalice',      ru: 'Наполнить малую чашу' },
    desc:  { en: 'The reliquary wants its lesser chalice full by dawn, and someone who can take it from another and still walk home.',
             ru: 'Реликварию нужна полная малая чаша к рассвету — и тот, кто возьмёт её у другого и сам дойдёт домой.' },
    parts: [
      { tag: 'Vampire', reward: { tokens: { supplies: PART_SUPPLY } } },
      { tag: 'Holy',    reward: { resources: { Gold: PART_GOLD } } },
    ],
  },
  {
    id: 'gra_mine_quiet_seam', faction: 'grail_of_sorrow', art: 'crystal_mine',
    title: { en: 'The Quiet Seam',               ru: 'Тихая жила' },
    desc:  { en: 'The seam runs under the old ward and the living will not dig there. It is cold, it is close, and it does not need breathing.',
             ru: 'Жила уходит под старую палату, и живые там копать не станут. Там холодно, там тесно — и дышать там не нужно.' },
    parts: [
      { tag: 'Zombie',  reward: { resources: { Crystals_Death: PART_CRYST } } },
      { tag: 'Vampire', reward: { resources: { Gold: PART_GOLD } } },
    ],
  },

  // ── LONG ERRANDS ───────────────────────────────────────────
  // Two per faction, one paying a Tome and one a Sigil, so a reroll has
  // somewhere to land and both tokens have a standing source at home.
  //
  // Same two-tag shape as the short ones: either tag qualifies, each pays its
  // half, and the unit carrying both brings home the Valor AND the token. The
  // pairs are read off the real rosters (data/units.js), so each is a constraint
  // a player can satisfy without it being one they can ignore.
  {
    id: 'emp_temple_long_vigil', kind: KIND_GRAND, faction: 'empire', art: 'temple',
    title: { en: 'The Long Vigil',               ru: 'Долгое бдение' },
    desc:  { en: 'Six hours knelt in the Lion\u2019s Temple, reading the hard pages aloud until they are yours. Only a blessed voice can hold the light that long.',
             ru: 'Шесть часов на коленях в Храме Льва — читать трудные страницы вслух, пока они не станут вашими. Лишь благословенный голос удержит свет так долго.' },
    parts: [
      { tag: 'Holy',   reward: { resources: { Valor: LONG_VALOR } } },
      { tag: 'Caster', reward: { tokens: { tome_of_knowledge: 1 } } },
    ],
  },
  {
    id: 'emp_grounds_long_drill', kind: KIND_GRAND, faction: 'empire', art: 'proving_grounds',
    title: { en: 'Hold the Proving Line',        ru: 'Держать линию полигона' },
    desc:  { en: 'The grounds are testing a crossing that keeps killing the recruits who walk it. Walk it all day instead, and mark where it turns.',
             ru: 'На полигоне испытывают перекрестье, что раз за разом убивает новобранцев. Пройдите его весь день сами — и отметьте, где оно поворачивает.' },
    parts: [
      { tag: 'Knight',  reward: { resources: { Valor: LONG_VALOR } } },
      { tag: 'Warrior', reward: { tokens: { crossroad_sigil: 1 } } },
    ],
  },
  {
    id: 'cho_guild_long_transcription', kind: KIND_GRAND, faction: 'choir_of_the_cursed', art: 'mage_guild',
    title: { en: 'Copy the Crossroad Leaf',      ru: 'Переписать лист перекрестья' },
    desc:  { en: 'The guild holds one leaf of the old crossroad work and will not let it leave the room. Copy it by hand, in a hand the ink does not burn.',
             ru: 'Гильдия хранит один лист старой работы о перекрестьях и не выпустит его из комнаты. Перепишите его рукой, которую не жжёт эта тушь.' },
    parts: [
      { tag: 'Demon',  reward: { resources: { Valor: LONG_VALOR } } },
      { tag: 'Caster', reward: { tokens: { crossroad_sigil: 1 } } },
    ],
  },
  {
    id: 'cho_temple_long_ledger', kind: KIND_GRAND, faction: 'choir_of_the_cursed', art: 'temple',
    title: { en: 'Read the Ember Ledger',        ru: 'Прочесть угольную книгу' },
    desc:  { en: 'Everything the Temple of Embers was ever given is written down, and none of it in order. Read the whole book aloud, and the Court listens for the gaps.',
             ru: 'Всё, что когда-либо отдали Храму Угольев, записано — и ничего по порядку. Прочтите всю книгу вслух, и Двор послушает, где пробелы.' },
    parts: [
      { tag: 'Court',   reward: { resources: { Valor: LONG_VALOR } } },
      { tag: 'Warrior', reward: { tokens: { tome_of_knowledge: 1 } } },
    ],
  },
  {
    id: 'gra_infirmary_long_watch', kind: KIND_GRAND, faction: 'grail_of_sorrow', art: 'infirmary',
    title: { en: 'A Night and a Day in the Ward', ru: 'Ночь и день в палате' },
    desc:  { en: 'The infirmary brews through the night and needs hands that do not tire and a back that does not turn. Stay until the vats are full.',
             ru: 'Лазарет варит всю ночь: нужны руки, что не устанут, и спина, что не отвернётся. Останьтесь, пока чаны не наполнятся.' },
    parts: [
      { tag: 'Zombie', reward: { resources: { Valor: LONG_VALOR } } },
      { tag: 'Knight', reward: { tokens: { tome_of_knowledge: 1 } } },
    ],
  },
  {
    id: 'gra_hall_long_oath', kind: KIND_GRAND, faction: 'grail_of_sorrow', art: 'mercenary_hall',
    title: { en: 'Sit the Long Oath',            ru: 'Высидеть долгую клятву' },
    desc:  { en: 'The hall swears its companies in one at a time, and somebody of standing must sit through every word. It takes all day and it cannot be hurried.',
             ru: 'Зал приводит роты к присяге по одной, и кто-то с положением обязан высидеть каждое слово. Это займёт весь день, и торопить нельзя.' },
    parts: [
      { tag: 'Vampire', reward: { resources: { Valor: LONG_VALOR } } },
      { tag: 'Caster',  reward: { tokens: { crossroad_sigil: 1 } } },
    ],
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

// The two tags an errand names, in the order its reward parts are listed. Both
// kinds are parts-based now, so there is one place to read them from — a grand
// errand's `require_tags` is gone with the rule that needed it.
function errandTags(errand) {
  return (errand?.parts || []).map(p => p.tag);
}

// What this errand demands, resolved into the shape that is snapshotted onto the
// errand row so the UI can still explain it after the fact. Both kinds ask the
// same thing now — EITHER tag lets a unit go, and carrying both is what pays
// double — so both resolve to `tags_any`.
//
// `tags_all` is still understood by unitMeets below. Rows minted before this
// change carry it, and a row is read back long after it was written.
function resolveRequirement(errand) {
  return { tags_any: errandTags(errand) };
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
// tags gets both halves; a unit matching one gets one. The post tier multiplies
// what comes out, never which parts apply. One path for both kinds — a long
// errand is richer because its parts are written richer, not because it is
// handled somewhere else.
//
// WHAT DOES NOT TAKE THE MULTIPLIER. A token is a whole thing: x1.5 of one
// Sigil is either a rounding bug or a doubling, never a 50% raise. So a Tome,
// a Sigil and a potion are copied across at face value, while everything in
// `resources` — XP, gold, crystals and Valor alike — takes the post tier
// multiplier.
//
// Two things grow with the post without using the multiplier, because neither
// wants a fractional or a repeating step: supplies take SUPPLY_TIER_STEP, so a
// part writing `supplies: 1` pays 1, 2, 3 or 4 of them, and Valor adds
// VALOR_PER_TIER for 10, 15, 20, 25.
function rewardForTags(errand, tags, postLevel, tierOverride = null, hours = DEFAULT_HOURS) {
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
      // Valor adds its step instead of taking the multiplier. Only ever one
      // part per errand pays it, so adding the step to the written amount is
      // the whole of it; two Valor parts on one errand would step twice.
      out.resources[k] = (out.resources[k] ?? 0) + (k === 'Valor'
        ? v + VALOR_PER_TIER * (tier - 1)
        : scaleAmount(v, mult));
    }
    for (const [k, v] of Object.entries(r.tokens || {})) {
      out.tokens = out.tokens || {};
      out.tokens[k] = (out.tokens[k] ?? 0)
        + (k === 'supplies' ? v * (SUPPLY_TIER_STEP[tier] ?? 1) : v);
    }
  }
  return out;
}

// Everything a long errand pays when ONE unit earns both halves — the headline
// the card is sold on. Derived from the parts rather than written beside them,
// so it cannot disagree with what the player is actually paid.
//
// Still exported under its old name because routes/index.js and the sheet both
// call it, but it is no longer the grand path's reward function: rewardForTags
// is, for both kinds.
function grandReward(errand, postLevel = 0, tierOverride = null) {
  return rewardForTags(errand, errandTags(errand), postLevel, tierOverride);
}

// Every part priced on its own, for the sheet: the player sees which tag pays
// what BEFORE choosing who goes, which is the whole point of the two-part split.
// Both kinds report parts now, so the sheet has one thing to draw.
function rewardParts(errand, postLevel, tierOverride = null, hours = DEFAULT_HOURS) {
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
  SUPPLY_TIER_STEP,
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
  SUPPLY_TIER_STEP,
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