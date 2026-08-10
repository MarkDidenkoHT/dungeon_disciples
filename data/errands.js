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
// Every errand names two tags and pays one reward part per tag. A unit qualifies
// by having EITHER tag and earns only the part(s) it actually matches — so the
// unit carrying both tags brings both halves home, and that is the interesting
// choice in the sheet. The pool the parts are drawn from is deliberately small:
// XP for the unit, gold, or one faction-appropriate crystal.
//
// COMPLETABILITY
// Nothing here guarantees an errand is offerable. That is enforced when the
// offer is CREATED (see ensureErrandOffer in routes/index.js): the server filters
// to errands some free unit really satisfies, so a player is never shown a task
// their roster cannot do.
const THRONE_TIER = { 0: 1, 1: 1, 2: 2, 3: 3, 4: 3 };

// Throne 1 pays the base rate, throne 2 doubles it, throne 3+ quadruples it —
// 20 XP, 40, 80 for a two-hour trip. The errand pool itself does not get richer
// as the game goes on; the throne is the only thing that moves the rate.
const TIER_REWARD_MULT = { 1: 1, 2: 1.5, 3: 2 };

// ── Duration ────────────────────────────────────────────────────────────────
// The player picks how long the unit is gone. Longer is better per errand but
// worse per hour (2h pays 10/h, 6h pays 6.7/h), so the short trip is right when
// the unit is wanted for an embark and the long one is right overnight. There is
// no failure roll, so this choice IS the errand's decision.
const DURATIONS = [
  { hours: 2, mult: 1 },
  { hours: 4, mult: 1.5 },
  { hours: 6, mult: 2 },
];
const DEFAULT_HOURS = 2;

// Server and client both resolve a requested duration through this, so an
// arbitrary `hours` in a request body cannot buy a multiplier.
function durationFor(hours) {
  return DURATIONS.find(d => d.hours === Number(hours)) ?? DURATIONS[0];
}

// ── Definition shape ────────────────────────────────────────────────────────
//   id       unique key, referenced by the errand row
//   faction  which faction may be offered it
//   art      file in /assets/icons/errands; missing art degrades to no image
//   parts    exactly two, one per tag:
//              tag     the unit tag this half is for
//              reward  what that half pays — xp_self, xp_roster, or resources
//
// SCALE — what these numbers are measured against:
//   one unit's share of a battle   10 XP (level 1) to 26 XP (level 6)
//   a level-6 battle               40 gold
//   XP to advance a tier-1 unit    50-75      a tier-2 unit  300-360
// One part at throne 1 for two hours is about one battle share. A unit matching
// both tags doubles that, the throne multiplies it (x2, x4) and so does the trip
// length (x1, x1.5, x2) — so the ceiling is a dual-tag unit at throne 3 for six
// hours, which is 160 XP and 160 gold.
const PART_XP    = 20;
const PART_GOLD  = 20;
const PART_CRYST = 6;

const ERRANDS = [
  // ── EMPIRE ────────────────────────────────────────────────────────────────
  {
    id: 'emp_gate_watch', faction: 'empire', art: 'empire_errand_1.jpg',
    title: { en: 'Watch on the Low Gate',        ru: 'Стража у Нижних врат' },
    desc:  { en: 'The low gate has stood unmanned since the levy marched. Stand it, and the quarter sleeps.',
             ru: 'Нижние врата пусты с тех пор, как ополчение ушло. Постойте там — и квартал будет спать спокойно.' },
    parts: [
      { tag: 'Knight',    reward: { xp_self: PART_XP } },
      { tag: 'Construct', reward: { resources: { Gold: PART_GOLD } } },
    ],
  },
  {
    id: 'emp_armoury_commission', faction: 'empire', art: 'empire_errand_2.jpg',
    title: { en: "The Armoury's Commission",     ru: 'Заказ оружейной' },
    desc:  { en: 'The armoury is behind on a crown order and paying anyone who can hold a file steady.',
             ru: 'Оружейная не поспевает с королевским заказом и платит любому, кто твёрдо держит напильник.' },
    parts: [
      { tag: 'Engineer', reward: { resources: { Gold: PART_GOLD } } },
      { tag: 'Spirit',   reward: { xp_self: PART_XP } },
    ],
  },
  {
    id: 'emp_prayer_to_mithrail', faction: 'empire', art: 'empire_errand_3.jpg',
    title: { en: 'Prayer to Mithrail',           ru: 'Молитва Митраилу' },
    desc:  { en: 'The dawn office needs a voice that carries and a hand that can hold the light steady through it.',
             ru: 'Рассветной службе нужен голос, который слышно, и рука, что удержит свет до конца.' },
    parts: [
      { tag: 'Caster', reward: { xp_self: PART_XP } },
      { tag: 'Holy',   reward: { resources: { Crystals_Life: PART_CRYST } } },
    ],
  },

  // ── CHOIR OF THE CURSED ───────────────────────────────────────────────────
  {
    id: 'cho_forge_vigil', faction: 'choir_of_the_cursed', art: 'choir_errand_1.jpg',
    title: { en: 'Vigil at the Forge Mouth',     ru: 'Бдение у зева горна' },
    desc:  { en: 'The great forge cannot be banked and cannot be left. Stand where nothing else can stand.',
             ru: 'Великий горн нельзя ни притушить, ни оставить. Встаньте там, где не выстоит никто другой.' },
    parts: [
      { tag: 'Demon',     reward: { xp_self: PART_XP } },
      { tag: 'Construct', reward: { resources: { Gold: PART_GOLD } } },
    ],
  },
  {
    id: 'cho_throne_song', faction: 'choir_of_the_cursed', art: 'choir_errand_2.jpg',
    title: { en: 'A Song in the Throne Room',    ru: 'Песнь в тронном зале' },
    desc:  { en: 'The court wants the old verse sung where it was written. Sing it badly and the court remembers.',
             ru: 'Двор желает услышать старый стих там, где он был написан. Спойте плохо — двор запомнит.' },
    parts: [
      { tag: 'Choir', reward: { xp_self: PART_XP } },
      { tag: 'Court', reward: { resources: { Crystals_Fire: PART_CRYST } } },
    ],
  },
  {
    id: 'cho_gifts_of_aggrail', faction: 'choir_of_the_cursed', art: 'choir_errand_3.jpg',
    title: { en: 'Gather the Gifts of Aggrail',  ru: 'Собрать дары Агграила' },
    desc:  { en: 'What the faithful leave at the shrines is owed upward. Collect it, and count it honestly.',
             ru: 'Оставленное верующими у святилищ принадлежит выше. Соберите — и сочтите честно.' },
    parts: [
      { tag: 'Caster',  reward: { resources: { Gold: PART_GOLD } } },
      { tag: 'Warrior', reward: { xp_self: PART_XP } },
    ],
  },

  // ── GRAIL OF SORROW ───────────────────────────────────────────────────────
  {
    id: 'gra_tend_the_fallen', faction: 'grail_of_sorrow', art: 'grail_errand_1.jpg',
    title: { en: 'Tend to the Fallen',           ru: 'Позаботиться о павших' },
    desc:  { en: 'Carry the fallen to the house of rot before the sun does the work badly. It is heavy, and nobody thanks you.',
             ru: 'Отнесите павших в дом гнили, прежде чем солнце сделает это скверно. Ноша тяжела, и никто не поблагодарит.' },
    parts: [
      { tag: 'Zombie', reward: { xp_self: PART_XP } },
      { tag: 'Knight', reward: { resources: { Gold: PART_GOLD } } },
    ],
  },
  {
    id: 'gra_lost_souls', faction: 'grail_of_sorrow', art: 'grail_errand_2.jpg',
    title: { en: 'Help the Lost Souls Home',     ru: 'Проводить заблудшие души' },
    desc:  { en: 'They are still walking the road they died on. Someone has to go out and tell them the way.',
             ru: 'Они всё ещё бредут дорогой, на которой умерли. Кто-то должен выйти и указать им путь.' },
    parts: [
      { tag: 'Spirit', reward: { xp_self: PART_XP } },
      { tag: 'Caster', reward: { resources: { Crystals_Death: PART_CRYST } } },
    ],
  },
  {
    id: 'gra_fill_the_chalice', faction: 'grail_of_sorrow', art: 'grail_errand_3.jpg',
    title: { en: 'Fill the Lesser Chalice',      ru: 'Наполнить малую чашу' },
    desc:  { en: 'The rite needs a full chalice by dawn, and someone who can take it from another and still walk home.',
             ru: 'К рассвету обряду нужна полная чаша — и тот, кто возьмёт её у другого и сам дойдёт домой.' },
    parts: [
      { tag: 'Vampire', reward: { resources: { Gold: PART_GOLD } } },
      { tag: 'Holy',    reward: { xp_self: PART_XP } },
    ],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function throneTier(throneLevel) {
  return THRONE_TIER[Math.max(0, Math.min(4, Number(throneLevel) || 0))] ?? 1;
}

// Everything a roster row brings to a requirement check. `resolveDef` is passed
// in so this file needs no import of units.js (the client already has one).
// unit_data wins over the definition: that is where a tag granted by an item, or
// any other per-unit change, would live.
function unitProfile(row, resolveDef) {
  const stored = row?.unit_data || {};
  const def    = resolveDef ? resolveDef(row) : null;
  const raw    = stored.tags ?? def?.tags ?? [];
  const list   = (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map(String);
  return { tags: list };
}

// The two tags an errand accepts, in the order their reward parts are listed.
function errandTags(errand) {
  return (errand?.parts || []).map(p => p.tag);
}

// What this errand demands, resolved into the shape that is snapshotted onto the
// errand row so the UI can still explain it after the fact.
function resolveRequirement(errand) {
  return { tags_any: errandTags(errand) };
}

function unitMeets(profile, resolved) {
  const want = resolved?.tags_any || [];
  if (!want.length) return true;
  return want.some(t => profile.tags.includes(t));
}

function scaleAmount(n, mult) { return Math.round(n * mult); }

// Merge the parts a unit has EARNED into one reward object. A unit matching both
// tags gets both halves; a unit matching one gets one. Tier and duration
// multiply what comes out, never which parts apply.
function rewardForTags(errand, tags, throneLevel, tierOverride = null, hours = DEFAULT_HOURS) {
  const tier = tierOverride ?? throneTier(throneLevel);
  const mult = (TIER_REWARD_MULT[tier] ?? 1) * durationFor(hours).mult;
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

// Every part priced on its own, for the sheet: the player sees which tag pays
// what BEFORE choosing who goes, which is the whole point of the two-part split.
function rewardParts(errand, throneLevel, tierOverride = null, hours = DEFAULT_HOURS) {
  return (errand.parts || []).map(p => ({
    tag:    p.tag,
    reward: rewardForTags(errand, [p.tag], throneLevel, tierOverride, hours),
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
  THRONE_TIER,
  TIER_REWARD_MULT,
  DURATIONS,
  DEFAULT_HOURS,
  durationFor,
  throneTier,
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
  THRONE_TIER,
  TIER_REWARD_MULT,
  DURATIONS,
  DEFAULT_HOURS,
  durationFor,
  throneTier,
  unitProfile,
  errandTags,
  resolveRequirement,
  unitMeets,
  rewardForTags,
  rewardParts,
};