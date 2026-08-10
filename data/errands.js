// ── Errands ─────────────────────────────────────────────────────────────────
// A daily solo task for ONE non-hero unit. The unit leaves the roster for the
// errand's duration and comes back with the reward; there is no failure roll and
// no outcome to survive. The whole cost is the absence — a unit on an errand
// cannot embark, so the player trades a day of that unit for what it brings.
//
// WHY THE REQUIREMENTS ARE GROUPS
// An errand asks for a KIND of soldier ("someone who can hold a line"), not one
// exact passive. There are three errands per faction, one per role — the one who
// holds, the one who teaches, the one who takes — so each group has to be wide
// enough that most of a faction's roster answers at least one of the three.
//
// COMPLETABILITY
// Nothing here guarantees an errand is offerable. That is enforced at SELECTION
// time (see pickErrandFor): the server filters to errands some free unit really
// satisfies, so a player is never shown a task their roster cannot do. That also
// means the numbers below can be tuned freely — a threshold that is too high
// simply stops being offered instead of becoming a dead end.
//
// THRONE SCALES DIFFICULTY
//   throne 1 -> rank 1, throne 2 -> rank 2, throne 3+ -> rank 3
// A required passive rank is clamped to the highest rank that passive actually
// HAS (only 41 of 61 have more than one), or a throne-3 player would be asked
// for "Renew 3", which does not exist and never would be offered.
const THRONE_TIER = { 0: 1, 1: 1, 2: 2, 3: 3, 4: 3 };

// Stat thresholds and rewards both grow with the tier. Requirements are checked
// against the real roster before an errand is offered, so growth can never
// produce something unachievable — it just narrows who qualifies.
const TIER_STAT_MULT   = { 1: 1,   2: 1.35, 3: 1.7 };
// Throne 1 pays 20 XP for the plain errand, throne 2 pays 40, throne 3+ pays 80.
// The throne is the only thing that moves the base rate; the errand pool itself
// does not get richer as the game goes on.
const TIER_REWARD_MULT = { 1: 1,   2: 2,    3: 4 };

// ── Duration ────────────────────────────────────────────────────────────────
// The player picks how long the unit is gone. Longer is better per errand but
// worse per hour (2h pays 10/h, 6h pays 6.7/h), so the short trip is the right
// call when the unit is wanted for an embark and the long one is right overnight.
// There is no failure roll, so this choice IS the errand's decision.
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
//   id            unique key, referenced by roster.errand.errand_id
//   faction       which faction may be offered it
//   requires      passive_any  one of these base passives (rank scales by throne)
//                 action_any   the unit's action must be one of these
//                 stat         minimum stats, scaled by TIER_STAT_MULT
//   reward        xp_self      XP to the unit that went
//                 xp_roster    a POOL of XP split between everyone left at home,
//                              exactly as a battle splits its XP between the
//                              units that fought (see /battle/reward). Paying it
//                              per-unit instead made a five-unit roster earn
//                              more from one errand than from a whole battle.
//                 heal_pct     % of max HP the unit returns healed by
//                 resources    flat resource grant, scaled by TIER_REWARD_MULT
//
// SCALE — what these numbers are measured against:
//   one unit's share of a battle   10 XP (level 1) to 26 XP (level 6)
//   a level-6 battle               40 gold
//   a tier-1 dwelling              40 gold + 20 faction crystal
//   XP to advance a tier-1 unit    50-75      a tier-2 unit  300-360
// An errand is a no-risk daily costing one unit's time, so the 2h/throne-1 rate
// is about one battle share — 20 XP, or 20 gold, or 6 crystal. Everything above
// that comes from the throne (x2, x4) and the duration the player picks
// (x1, x1.5, x2), so the ceiling is 160 XP for a throne-3 player who gives up a
// unit for six hours.
//
// THREE PER FACTION, ONE PER ROLE. Every faction gets the same three shapes so
// the choice reads the same everywhere, and only the flavour is faction-owned:
//   the WATCH    someone who endures  -> pays the unit that went (XP, healing)
//   the TEACHING someone others hear  -> pays the roster left at home
//   the TAKING   someone who hunts    -> pays materials (gold, crystal)
const ERRANDS = [
  // ── EMPIRE ────────────────────────────────────────────────────────────────
  // The Empire's errands are civic duty: a watch kept, a levy drilled, a debt
  // to the crown collected.
  {
    id: 'emp_gate_watch', faction: 'empire',
    title: { en: 'Watch on the Low Gate',        ru: 'Стража у Нижних врат' },
    desc:  { en: 'The low gate has stood unmanned since the levy marched. Stand it, and the quarter sleeps.',
             ru: 'Нижние врата пусты с тех пор, как ополчение ушло. Постойте там — и квартал будет спать спокойно.' },
    requires: { passive_any: ['protector', 'fortify', 'unbreakable', 'aegis', 'iron_will', 'taunt',
                              'thorns', 'stone_form', 'parry', 'reforge',
                              'resist_aura_air', 'resist_aura_cold', 'resist_aura_death'] },
    reward: { xp_self: 20, heal_pct: 25 },
  },
  {
    id: 'emp_drill_the_levy', faction: 'empire',
    title: { en: 'Drill the Levy',               ru: 'Учения ополчения' },
    desc:  { en: 'Farmhands with spears. Teach them where to put the shield and they may live through the season.',
             ru: 'Крестьяне с копьями. Научите их держать щит — и они переживут этот сезон.' },
    requires: { passive_any: ['command', 'unity', 'inspiration_damage', 'inspiration_initiative',
                              'inspiration_armor', 'inspiration_max_hp', 'lions_roar', 'combat_veteran',
                              'field_medic', 'renew', 'prayer_of_healing', 'radiance', 'light_of_dawn',
                              'beacon_of_hope', 'mithrails_light', 'cleanse', 'sanctuary', 'redemption'] },
    reward: { xp_self: 6, xp_roster: 20 },
  },
  {
    id: 'emp_traitor_hunt', faction: 'empire',
    title: { en: 'Hunt a Traitor',               ru: 'Охота на предателя' },
    desc:  { en: 'A quartermaster sold the road schedules. He runs fast, he knows the alleys, and the crown pays on delivery.',
             ru: 'Интендант продал расписание обозов. Бегает он быстро, переулки знает, а корона платит по доставке.' },
    requires: { passive_any: ['pierce', 'impale', 'shatter', 'execute', 'chain', 'volley', 'clear_shot',
                              'find_weakness', 'duelist', 'furious_strike', 'stun', 'purge',
                              'magic_attunement', 'radiant_surge', 'mark_of_ash', 'scavenger'],
                stat: { initiative: 35 } },
    reward: { xp_self: 8, resources: { Gold: 20, Crystals_Life: 4 } },
  },

  // ── CHOIR OF THE CURSED ───────────────────────────────────────────────────
  // The Choir's errands are all appetite and oath: fire that must be fed, a
  // verse that must be taught correctly, a debt taken in person.
  {
    id: 'cho_forge_vigil', faction: 'choir_of_the_cursed',
    title: { en: 'Vigil at the Forge Mouth',     ru: 'Бдение у зева горна' },
    desc:  { en: 'The great forge cannot be banked and cannot be left. Stand where nothing else can stand.',
             ru: 'Великий горн нельзя ни притушить, ни оставить. Встаньте там, где не выстоит никто другой.' },
    requires: { passive_any: ['fellfire', 'burn', 'volcanic_skin', 'resist_aura_fire', 'mark_of_ash',
                              'last_verse', 'undying', 'unbreakable', 'fortify', 'aegis', 'taunt',
                              'stone_form', 'recuperate', 'regenerate', 'vitality', 'pact'],
                stat: { hp: 40 } },
    reward: { xp_self: 20, heal_pct: 25 },
  },
  {
    id: 'cho_read_the_choir', faction: 'choir_of_the_cursed',
    title: { en: 'Read to the Choir',            ru: 'Читать Хору' },
    desc:  { en: 'The younger voices learn the verse faster when something that has already burned for it reads aloud.',
             ru: 'Молодые голоса заучивают стих быстрее, когда читает тот, кто за него уже горел.' },
    requires: { passive_any: ['command', 'unity', 'inspiration_damage', 'inspiration_initiative',
                              'inspiration_armor', 'inspiration_max_hp', 'magic_attunement',
                              'infernal_mandate', 'fanaticism', 'shared_suffering', 'last_verse',
                              'combat_veteran', 'dissipate', 'clear_shot'] },
    reward: { xp_self: 6, xp_roster: 20 },
  },
  {
    id: 'cho_debt_collection', faction: 'choir_of_the_cursed',
    title: { en: 'Collect What Is Owed',         ru: 'Взыскать долг' },
    desc:  { en: 'Three names on the list have stopped paying. Only one of them needs to be made an example of.',
             ru: 'Трое в списке перестали платить. Показательным нужно сделать лишь одного.' },
    requires: { passive_any: ['rage', 'blood_frenzy', 'blood_craze', 'vengeance', 'execute', 'impale',
                              'find_weakness', 'duelist', 'furious_strike', 'stun', 'exsanguinate',
                              'thorns', 'terror', 'fear', 'pierce', 'chain'],
                stat: { action_power: 8 } },
    reward: { xp_self: 8, resources: { Gold: 20, Crystals_Fire: 4 } },
  },

  // ── GRAIL OF SORROW ───────────────────────────────────────────────────────
  // No labour errands here. The Grail does not need a trench dug — it needs the
  // rites kept, the novices taught, and the chalice filled.
  {
    id: 'gra_stand_the_barrow', faction: 'grail_of_sorrow',
    title: { en: 'Stand the Barrow Door',        ru: 'Стоять у двери кургана' },
    desc:  { en: 'Grave-robbers work in threes and lose their nerve quickly when the door is not empty. Be the reason it is not empty.',
             ru: 'Расхитители могил ходят по трое и быстро теряют смелость, если дверь не пуста. Станьте причиной, по которой она не пуста.' },
    requires: { passive_any: ['horde', 'reanimate', 'raise_dead', 'unending_servitude', 'undying',
                              'sorrow', 'eternal_grief', 'fear', 'terror', 'dodge', 'slow', 'dissipate',
                              'protector', 'thorns', 'recuperate', 'regenerate', 'vitality', 'taunt',
                              'resist_aura_air', 'resist_aura_cold', 'resist_aura_fire',
                              'resist_aura_nature', 'resist_aura_life'] },
    reward: { xp_self: 20, heal_pct: 25 },
  },
  {
    id: 'gra_teach_the_novices', faction: 'grail_of_sorrow',
    title: { en: 'Lead the Mourning Rite',       ru: 'Вести обряд скорби' },
    desc:  { en: 'The novices have the grief and none of the form. One of those can be taught in an evening.',
             ru: 'Скорби у послушников довольно, а вот выучки нет. За вечер можно поправить одно из двух.' },
    requires: { passive_any: ['command', 'unity', 'inspiration_damage', 'inspiration_initiative',
                              'inspiration_armor', 'inspiration_max_hp', 'grails_blessing',
                              'mothers_blessing', 'aggrails_blessing', 'communion', 'sacrament',
                              'libation', 'prayer_of_healing', 'rite_of_reclamation', 'sorrow',
                              'magic_attunement', 'combat_veteran'] },
    reward: { xp_self: 6, xp_roster: 20 },
  },
  {
    id: 'gra_fill_the_chalice', faction: 'grail_of_sorrow',
    title: { en: 'Fill the Lesser Chalice',      ru: 'Наполнить малую чашу' },
    desc:  { en: 'The rite needs a full chalice by dawn, and a donor who can take it from someone else and still walk home.',
             ru: 'К рассвету обряду нужна полная чаша — и тот, кто возьмёт её у другого и сам дойдёт домой.' },
    requires: { passive_any: ['lifesteal', 'leech', 'exsanguinate', 'bleed', 'death_mark', 'infect',
                              'poison', 'aura_of_decay', 'noxious_death', 'communion', 'sacrament',
                              'libation', 'duelist', 'execute', 'impale', 'rage', 'find_weakness',
                              'scavenger'],
                stat: { action_power: 8 } },
    reward: { xp_self: 8, resources: { Gold: 20, Crystals_Death: 4 } },
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
const baseKey = key => String(key).replace(/\s+\d+$/, '');
const keyRank = key => { const m = String(key).match(/\s+(\d+)$/); return m ? Number(m[1]) : 1; };

function throneTier(throneLevel) {
  return THRONE_TIER[Math.max(0, Math.min(4, Number(throneLevel) || 0))] ?? 1;
}

// The highest rank a passive actually has, so a throne-3 errand never asks for
// "Renew 3" — 20 of the 61 base passives are rank 1 only.
function maxRankOf(basePassive, UNIT_ABILITIES) {
  let max = 1;
  for (const key of Object.keys(UNIT_ABILITIES || {})) {
    if (baseKey(key) !== basePassive) continue;
    max = Math.max(max, UNIT_ABILITIES[key]?.rank ?? 1);
  }
  return max;
}

// Everything a roster row brings to a requirement check. `resolveDef` is passed
// in so this file needs no import of units.js (the client already has one).
function unitProfile(row, resolveDef) {
  const stored = row?.unit_data || {};
  const def    = resolveDef ? resolveDef(row) : null;
  const raw    = stored.passive ?? def?.passive ?? [];
  const list   = Array.isArray(raw) ? raw : (raw ? [raw] : []);

  const passives = {};
  for (const key of list) {
    const b = baseKey(key);
    passives[b] = Math.max(passives[b] ?? 0, keyRank(key));
  }

  const action = stored.action ?? def?.action;
  return {
    passives,
    action: typeof action === 'string' ? action.toLowerCase() : String(action?.id ?? '').toLowerCase(),
    stats: {
      hp:           stored.max_hp     ?? def?.hp        ?? 0,
      armor:        stored.armor      ?? def?.armor     ?? 0,
      initiative:   stored.initiative ?? def?.initiative ?? 0,
      action_power: stored.action_power ?? def?.action_power ?? 0,
    },
  };
}

// What this errand demands of a unit at this throne level, with every number
// already resolved — the same object is snapshotted onto the roster row when the
// errand starts, so the UI can explain the requirement after the fact.
// `tierOverride` lets the selector step the difficulty DOWN. Throne level is
// what the errand should ask for, but it is not a promise the roster can answer:
// a throne-2 player fielding tier-1 units has nothing but rank-1 passives, and
// asking rank 2 of them left whole factions with no offerable errand at all.
// The selector tries the throne's tier first and walks down until something
// fits, so the difficulty tracks the throne where it can and the player always
// has something to do where it cannot.
function resolveRequirement(errand, throneLevel, UNIT_ABILITIES, tierOverride = null) {
  const tier = tierOverride ?? throneTier(throneLevel);
  const req  = errand.requires || {};
  const mult = TIER_STAT_MULT[tier] ?? 1;

  const passives = (req.passive_any || []).map(b => ({
    passive: b,
    rank: Math.min(tier, maxRankOf(b, UNIT_ABILITIES)),
  }));

  const stats = {};
  for (const [k, v] of Object.entries(req.stat || {})) stats[k] = Math.round(v * mult);

  return { tier, passive_any: passives, action_any: req.action_any || null, stat: stats };
}

function unitMeets(profile, resolved) {
  if (resolved.passive_any?.length) {
    const ok = resolved.passive_any.some(p => (profile.passives[p.passive] ?? 0) >= p.rank);
    if (!ok) return false;
  }
  if (resolved.action_any?.length) {
    if (!resolved.action_any.map(a => a.toLowerCase()).includes(profile.action)) return false;
  }
  for (const [k, v] of Object.entries(resolved.stat || {})) {
    if ((profile.stats[k] ?? 0) < v) return false;
  }
  return true;
}

// Reward follows the tier the errand was actually SET at, not the throne — an
// errand that stepped down to tier 1 because the roster is young pays tier-1
// rates. Otherwise stepping down would be free difficulty relief.
// `hours` is the duration the player chose; it multiplies on top of the tier
// (2h x1, 4h x1.5, 6h x2). An unknown value falls back to the shortest trip
// rather than erroring, so a stale client can never mint a better rate.
function scaleReward(errand, throneLevel, tierOverride = null, hours = DEFAULT_HOURS) {
  const tier = tierOverride ?? throneTier(throneLevel);
  const m    = (TIER_REWARD_MULT[tier] ?? 1) * durationFor(hours).mult;
  const r    = errand.reward || {};
  const out  = {};
  if (r.xp_self)   out.xp_self   = Math.round(r.xp_self * m);
  if (r.xp_roster) out.xp_roster = Math.round(r.xp_roster * m);
  if (r.heal_pct)  out.heal_pct  = r.heal_pct;              // a percentage does not scale
  if (r.resources) {
    out.resources = {};
    for (const [k, v] of Object.entries(r.resources)) out.resources[k] = Math.round(v * m);
  }
  return out;
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
  TIER_STAT_MULT,
  TIER_REWARD_MULT,
  DURATIONS,
  DEFAULT_HOURS,
  durationFor,
  throneTier,
  maxRankOf,
  unitProfile,
  resolveRequirement,
  unitMeets,
  scaleReward,
  baseKey,
};

if (typeof module !== 'undefined') module.exports = {
  ERRANDS,
  ERRANDS_BY_ID,
  THRONE_TIER,
  TIER_STAT_MULT,
  TIER_REWARD_MULT,
  DURATIONS,
  DEFAULT_HOURS,
  durationFor,
  throneTier,
  maxRankOf,
  unitProfile,
  resolveRequirement,
  unitMeets,
  scaleReward,
  baseKey,
};