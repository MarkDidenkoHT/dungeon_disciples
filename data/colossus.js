import { UNITS } from './units.js';

// Faction Colossus: one weekly boss per faction, with a shared HP pool far
// larger than one battle can remove. See docs/daily-activities-design.md.
//
// Every number a tester is likely to ask about lives here: pool size, reset
// time, phases, milestones and payouts. The database holds only the live pool
// and who hit it (sql/colossus.sql).

const COLOSSUS_MAX_HP = 10000;

// Monday 18:00 UTC — 21:00 Moscow, the testers' evening.
const COLOSSUS_RESET = { weekday: 1, hourUtc: 18 };

// The boss is a row unit on the middle row: it spans both lines, so melee and
// ranged units can both reach it from the first round.
const COLOSSUS_CELL = 2;

// Resource the Colossus pays out, banked until Engravings give it a use.
// The name is still open (see the design doc).
const COLOSSUS_CURRENCY = 'Valor';

// Season score for the order factions kill their boss in.
const COLOSSUS_KILL_POINTS = { 1: 3, 2: 2, 3: 1 };

// The damage ONE ATTEMPT has to deal to walk the whole phase ladder. Phases are
// read against this, not against the pool (see the note on COLOSSUS_PHASES), so
// every player meets the same escalation whenever in the week they turn up.
//
// THE NUMBER TO TUNE. The thresholds fall out of it: a quarter of the arc opens
// phase 2, half opens phase 3, three quarters opens phase 4. At 240 that is
// 60 / 120 / 180 damage.
//
// Measured against what an attempt actually does. A bare five-unit squad of
// tier-3 definitions — no hero, no items, no casts — deals 16-25 a round and
// about 140 over the ~11 rounds before the Withering finishes it; the same at
// tier 4 is 25 a round and about 170. Real squads sit above both, and the top
// milestone's pace (2500 a week over roughly a squad a day) is ~360 an attempt.
// So at 240: a weak squad still reaches phase 3, a middling one opens phase 4
// near the end, and a strong one fights inside Last Light for a while.
//
// Raise it if testers are reaching phase 4 in the first few rounds; lower it if
// most attempts end in phase 1 or 2.
const COLOSSUS_PHASE_ARC = 240;

// What the pool pays for depth. Damage credited to the faction's bar is
// multiplied by this, picked from the deepest phase the attempt reached.
//
// Without it, per-attempt phases would be a pure tax: the deeper you push the
// harder the boss hits and the less raw damage you manage, so the optimal play
// would be to stall in phase 1 — which is the opposite of the point. The bonus
// is paid on the phase REACHED, and reaching phase 4 means having already dealt
// three quarters of the arc, so there is nothing to cheese: you cannot buy the
// multiplier without doing the damage that earns it.
const COLOSSUS_PHASE_BONUS_PCT = { 1: 0, 2: 15, 3: 30, 4: 45 };

// Stagger: deal `threshold` damage to the boss inside a SINGLE round and the
// stone cracks — it loses its next turn, and for `rounds` rounds its armor and
// every resistance count for nothing (utils/passive-processor.js: effectiveArmor
// and effectiveResist both read _stagger_rounds).
//
// This is the one thing in the fight that rewards a burst build. Armor 25 and a
// 25-40 resistance table are flat for the whole attempt otherwise, which makes
// steady chip damage strictly correct and every setup turn a waste.
//
// THE OTHER NUMBER TO TUNE, and the harder of the two, because what it has to
// beat is a round the player SET UP rather than an average one. Plain attacks
// from a five-unit squad come to 16-25 a round (see COLOSSUS_PHASE_ARC), so 50
// is about twice an ordinary round: out of reach by accident, and reachable with
// a hero cast, a damage buff or a focused alpha strike. Watch the testers: if
// nobody ever staggers it, this is too high and the feature is dead; if it is
// staggered most rounds, the boss never gets a turn.
//
// Armor AND resistances, not armor alone: armor only answers physical damage, so
// an armor-only stagger would be worth a great deal to one squad and nothing at
// all to a caster line.
const COLOSSUS_STAGGER = { threshold: 50, rounds: 2 };

// The pool multiplier for an attempt that reached `phase`.
function colossusPhaseBonusPct(phase) {
  return COLOSSUS_PHASE_BONUS_PCT[Number(phase)] ?? 0;
}

// Pool damage credited for `dealt` raw damage by an attempt that reached `phase`.
function colossusCreditedDamage(dealt, phase) {
  const raw = Math.max(0, Math.floor(Number(dealt) || 0));
  return Math.round(raw * (1 + colossusPhaseBonusPct(phase) / 100));
}

// A phase is read from the damage THIS ATTEMPT has dealt, against the arc
// below, and it is LIVE: the boss changes phase the moment a blow takes the
// attempt past a threshold, mid-battle, so the player watches the stone crack
// open and the fight change under them.
//
// It used to be read from the POOL's HP, and that was the single worst thing
// about the fight. The pool is the faction's weekly progress, so the phase a
// player met was decided by everyone else's schedule: Monday attempts were
// always phase 1, Friday attempts always phase 4, and nobody ever fought the
// ladder. The escalation — the whole point of having phases — was invisible to
// every individual player, and the late-week attempts were strictly harder for
// exactly the same payout.
//
// Per attempt, everyone gets the whole arc. The pool keeps its own job: it is
// the shared bar on the Colossus page and the thing a faction kills. What ties
// the two back together is the phase bonus below — damage credited to the pool
// is multiplied by how deep into the ladder the attempt reached, so pushing
// into the harder phases pays for itself instead of punishing you.
//
// `below_pct` is a percentage of the arc REMAINING and is inclusive: at exactly
// 75% left (a quarter of the arc dealt) the boss is in phase 2. Phases only ever
// go FORWARD (see maybeAdvancePhases).
//
// Overrides replace fields on the base unit in data/units.js. Every phase
// declares the SAME set of fields, so applying one on top of another is total
// rather than partial: a field one phase set and the next left out would
// otherwise linger from the earlier phase. Adding a field to one phase means
// adding it to all four.
//
// Phase 1 is meant to be easy. From phase 2 the sweep leaves physical damage
// (so armor stops carrying the fight) and every hit cuts healing on the whole
// line (infect, then decay), because a healer line outlasts a flat sweep forever.
//
// `spells` is an ORDERED ROTATION, not a menu — the boss casts them in turn and
// banks power for the next one rather than buying whatever it can afford (see
// `spell_cycle` on reliquary_titan and aiPickCycledSpell in the engine). Each
// kit is a cheap chip spell plus one heavy hit that is TELEGRAPHED a round ahead
// in data/spells.js, which gives the rotation a rhythm the player can read and
// answer. The old kits held one spell each for a reason that no longer applies:
// under greedy selection a cheap second spell meant the boss never saved up for
// the expensive one, and a rotation cannot be starved that way.
//
// KEEP THE KITS SHORT. Power is +1 per boss turn capped at 5, and a cast empties
// the bank, so every extra entry pushes the heavy hit further out: a three-entry
// kit of 2/3/4 needs eleven-odd rounds to come round to the 4, and an attempt
// only lasts until the Withering finishes the player's army (~14 rounds). Two
// entries per phase is what makes the telegraphed spell land twice in an attempt
// instead of once or never.
const COLOSSUS_PHASES = [
  {
    id: 1, below_pct: 100,
    name: 'Awakened', name_ru: 'Пробуждение',
    description: 'Stone and root stir. It sweeps the whole line.',
    description_ru: 'Камень и корни приходят в движение. Бьёт по всему строю.',
    overrides: {
      action_power: 14, damage_source: 'physical', armor: 25, initiative: 40,
      passive: ['unbreakable 2', 'stoicism 1'],
    },
    spells: [
      { spell_id: 'boss_sundering_stone',  power: 2 },
      { spell_id: 'boss_reliquary_grasp',  power: 3 },
    ],
  },
  {
    id: 2, below_pct: 75,
    name: 'Roots Take Hold', name_ru: 'Корни впиваются',
    description: 'Thorned roots strike past armor, sap healing and spread rot.',
    description_ru: 'Шипастые корни бьют сквозь броню, ослабляют лечение и сеют гниль.',
    overrides: {
      action_power: 22, damage_source: 'nature', armor: 25, initiative: 40,
      passive: ['unbreakable 2', 'stoicism 1', 'thorns 1', 'infect 1'],
    },
    spells: [
      { spell_id: 'boss_grave_rot',        power: 3 },
      { spell_id: 'boss_strangling_roots', power: 4 },
    ],
  },
  {
    id: 3, below_pct: 50,
    name: 'The Bells Toll', name_ru: 'Звонят колокола',
    description: 'Death rings through the line, and the bells pass sentence on the weakest.',
    description_ru: 'Смерть звенит над строем, а колокола выносят приговор слабейшему.',
    overrides: {
      action_power: 28, damage_source: 'death', armor: 25, initiative: 40,
      passive: ['unbreakable 2', 'stoicism 1', 'thorns 1', 'infect 2'],
    },
    spells: [
      { spell_id: 'boss_toll_of_bells',    power: 2 },
      { spell_id: 'boss_deaths_verdict',   power: 4 },
    ],
  },
  {
    id: 4, below_pct: 25,
    name: 'Last Light', name_ru: 'Последний свет',
    description: 'The stone cracks open and burns. Faster, deadlier, easier to hurt.',
    description_ru: 'Камень трескается и пылает. Быстрее, смертоноснее — и уязвимее.',
    overrides: {
      action_power: 34, damage_source: 'fire', armor: 15, initiative: 55,
      passive: ['unbreakable 2', 'stoicism 1', 'thorns 2', 'infect 2', 'decay 2'],
    },
    spells: [
      { spell_id: 'boss_ember_spit',       power: 2 },
      { spell_id: 'boss_cinder_cascade',   power: 4 },
      { spell_id: 'boss_deaths_verdict',   power: 4 },
    ],
  },
];

// Personal damage for the week. `faction_crystal` pays in the player's own
// faction crystal.
const COLOSSUS_MILESTONES = [
  { damage: 300,  rewards: { [COLOSSUS_CURRENCY]: 20, faction_crystal: 10 } },
  { damage: 800,  rewards: { [COLOSSUS_CURRENCY]: 30, faction_crystal: 15 } },
  { damage: 1500, rewards: { [COLOSSUS_CURRENCY]: 50, faction_crystal: 25 } },
  { damage: 2500, rewards: { [COLOSSUS_CURRENCY]: 80, faction_crystal: 40 } },
];

// Paid to everyone who dealt any damage to a boss that was killed.
const COLOSSUS_KILL_REWARD = { [COLOSSUS_CURRENCY]: 100, Gold: 300, faction_crystal: 30 };

// What it costs to send ONE resting unit back in on the same day, charged per
// unit. A follower rests after an attempt, which caps the week at one squad a
// day; this buys that cap off a unit at a time rather than lifting it.
//
// Gold is the point of it — the game had no recurring gold sink past the castle —
// and the potions stop it being a pure gold tap: they are earned, so a player
// cannot simply out-grind the rest by hoarding coin.
const COLOSSUS_REST_REFRESH = { Gold: 50, health_potion: 2 };

// The bill for n units, shaped for spendResources.
function colossusRefreshBill(units) {
  const n = Math.max(0, Math.floor(Number(units) || 0));
  if (!n) return {};
  return Object.fromEntries(Object.entries(COLOSSUS_REST_REFRESH).map(([item, each]) => [item, each * n]));
}

const DAY_MS = 24 * 60 * 60 * 1000;

// The week `now` falls in: the date of its reset (the row key) and when it ends.
function colossusWeek(now = Date.now()) {
  const d = new Date(now);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), COLOSSUS_RESET.hourUtc));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() - COLOSSUS_RESET.weekday + 7) % 7));
  if (start.getTime() > now) start.setUTCDate(start.getUTCDate() - 7);
  return {
    weekStart: start.toISOString().slice(0, 10),
    startsAt:  start.getTime(),
    resetsAt:  start.getTime() + 7 * DAY_MS,
  };
}

// The pool's band. NOT the phase a fight is in any more — attempts walk their own
// ladder (see COLOSSUS_PHASE_ARC) — so this is only ever "how beaten down is the
// shared bar", which is what the landing-page demo draws with it.
function colossusPhaseFor(hp, maxHp = COLOSSUS_MAX_HP) {
  const pct = maxHp > 0 ? (hp / maxHp) * 100 : 0;
  return [...COLOSSUS_PHASES].reverse().find(p => pct <= p.below_pct) ?? COLOSSUS_PHASES[0];
}

function colossusBaseDef() {
  return UNITS.enemies?.colossus?.reliquary_titan ?? null;
}

// The boss as it stands for an attempt: base unit, the opening phase's changes,
// and the pool's current HP. Same flat shape getEncounter returns.
//
// Every attempt opens in phase 1, whatever the pool is down to. The ladder is
// walked by the damage this attempt deals, so the pool decides only how much HP
// is left to take off — never how hard the fight is.
function buildColossusBoss(hp) {
  const def = colossusBaseDef();
  if (!def) return null;
  const phase = COLOSSUS_PHASES[0];
  const current = Math.max(0, Math.min(COLOSSUS_MAX_HP, Math.floor(hp)));
  return {
    ...def,
    ...phase.overrides,
    resistances:   { ...(def.resistances || {}) },
    hp:            COLOSSUS_MAX_HP,
    max_hp:        COLOSSUS_MAX_HP,
    current_hp:    current,
    cell:          COLOSSUS_CELL,
    item_id:       null,
    spells:        phase.spells,
    phase:         phase.id,
    // The whole ladder travels with the boss, because the engine advances it
    // mid-battle (maybeAdvancePhases) rather than reading this module.
    phases:        COLOSSUS_PHASES,
    // What the ladder is measured against. 'attempt' tells the engine to read
    // the band from damage dealt SINCE THIS ATTEMPT OPENED — `current_hp` above
    // is that starting point, and it is frozen on the battle record, so a reload
    // mid-attempt measures from the same place. Leave it out and the engine
    // falls back to the unit's own HP fraction, which is what every other
    // phase-laddered unit wants.
    phase_basis:   'attempt',
    phase_arc:     COLOSSUS_PHASE_ARC,
    // Stagger (see COLOSSUS_STAGGER). Read off unit_data by the engine, so any
    // unit can be given one without the engine changing.
    stagger_threshold: COLOSSUS_STAGGER.threshold,
    stagger_rounds:    COLOSSUS_STAGGER.rounds,
    // Withering is the attempt's timer: it wears the player's army down, never the boss.
    wither_immune: true,
  };
}

// Milestones passed going from `before` to `after` weekly damage.
function colossusMilestonesCrossed(before, after) {
  return COLOSSUS_MILESTONES.filter(m => before < m.damage && after >= m.damage);
}

// A reward table as grant lines. `factionCrystal` is the player's crystal item name.
function colossusGrants(rewards, factionCrystal) {
  const lines = [];
  for (const [item, amount] of Object.entries(rewards || {})) {
    const name = item === 'faction_crystal' ? factionCrystal : item;
    if (name && amount > 0) lines.push({ item: name, amount });
  }
  return lines;
}

export {
  COLOSSUS_MAX_HP, COLOSSUS_RESET, COLOSSUS_CELL, COLOSSUS_CURRENCY, COLOSSUS_KILL_POINTS,
  COLOSSUS_PHASES, COLOSSUS_MILESTONES, COLOSSUS_KILL_REWARD, COLOSSUS_REST_REFRESH,
  COLOSSUS_PHASE_ARC, COLOSSUS_PHASE_BONUS_PCT, COLOSSUS_STAGGER,
  colossusWeek, colossusPhaseFor, colossusBaseDef, buildColossusBoss, colossusMilestonesCrossed, colossusGrants,
  colossusRefreshBill, colossusPhaseBonusPct, colossusCreditedDamage,
};
if (typeof module !== 'undefined') module.exports = {
  COLOSSUS_MAX_HP, COLOSSUS_RESET, COLOSSUS_CELL, COLOSSUS_CURRENCY, COLOSSUS_KILL_POINTS,
  COLOSSUS_PHASES, COLOSSUS_MILESTONES, COLOSSUS_KILL_REWARD, COLOSSUS_REST_REFRESH,
  COLOSSUS_PHASE_ARC, COLOSSUS_PHASE_BONUS_PCT, COLOSSUS_STAGGER,
  colossusWeek, colossusPhaseFor, colossusBaseDef, buildColossusBoss, colossusMilestonesCrossed, colossusGrants,
  colossusRefreshBill, colossusPhaseBonusPct, colossusCreditedDamage,
};
