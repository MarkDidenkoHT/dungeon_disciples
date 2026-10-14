// Callings - the one decision about a unit that belongs to the player.
// See docs/unit-identity-design.md §2 and docs/combat-barks-design.md §5.
//
// Each faction has exactly TWO, and every unit in that faction is offered the
// same pair, so there is no profile detection and no unit left with a track it
// cannot fill. A calling is stored on the roster row (`roster.calling` jsonb,
// `{"id":"vigil"}`), assigned at random when the unit is created, and changed
// on the castle's left page for CALLING_CHANGE_COST once the Temple is built.
//
// TWO SYSTEMS READ THIS FILE:
//
//   The Chronicle   which deeds rungs 1/3/5 ask for, which stats the unit may
//                   raise, which passive the capstone can hand it. Not built.
//                   The Training Grounds' system, not the Temple's - the
//                   Temple owns the calling, the Chronicle owns the track.
//   Litanies        a chorus cell names a CALLING instead of a list of unit ids
//                   (data/litanies.js). Built - this is the calling's first
//                   visible payoff, and the reason it is a tactical choice and
//                   not only a stat track.
//
// `pays` is the side a calling's reward lands on when it sings in a litany, and
// it is the whole of the rule that used to be "the reward is what the chorus
// did". A chorus of two Crusade cells pays the enemy side; one of each pays
// both. It is read by nothing at run time - the engine applies the fields the
// litany lists - but a litany whose reward disagrees with its cells' `pays` is
// a bug in data/litanies.js, and the validator says so.
//
// THE RUSSIAN IS NOT A TRANSLATION where a translation reads wrong, the same
// rule RITE_TERMS follows in public/screens/spell_tome.js. "Крестовый поход" is
// the literal Crusade and is three syllables too long for a chip on a phone, so
// the calling is "Поход" - the march, the thing carried forward.

const CALLINGS = {
  empire: [
    // Holding the line. The Empire's patience: the shield that is still there
    // in the morning.
    { id: 'vigil',   name: 'Vigil',   name_ru: 'Бдение', pays: 'ally',  tint: '#6f8fbf' },
    // Carrying it forward.
    { id: 'crusade', name: 'Crusade', name_ru: 'Поход',  pays: 'enemy', tint: '#c8803a' },
  ],
  grail_of_sorrow: [
    // Refusing the price - the Grail's healing and warding, which is a refusal
    // that the loss has happened at all.
    { id: 'denial',     name: 'Denial',     name_ru: 'Отрицание', pays: 'ally',  tint: '#9b8fd0' },
    // Paying it. The Grail's violence is bought with its own blood, which is
    // why this is the enemy-facing one and not the gentler of the two.
    { id: 'acceptance', name: 'Acceptance', name_ru: 'Смирение',  pays: 'enemy', tint: '#b5556a' },
  ],
  choir_of_the_cursed: [
    // Your own voice above the song.
    { id: 'descant', name: 'Descant', name_ru: 'Дискант', pays: 'ally',  tint: '#5fa89b' },
    // Power taken from others.
    { id: 'hunger',  name: 'Hunger',  name_ru: 'Голод',   pays: 'enemy', tint: '#8aa83f' },
  ],
};

// Flat index. Ids are unique across the three factions on purpose: a calling
// never has to be looked up with its faction in hand, and a litany cell can
// carry one word.
const CALLING_BY_ID = {};
for (const [faction, list] of Object.entries(CALLINGS)) {
  for (const c of list) CALLING_BY_ID[c.id] = { ...c, faction };
}

const CALLING_IDS = Object.keys(CALLING_BY_ID);

// What a change costs. The design doc said 500, which is a wall in front of the
// first correction a player ever wants to make to a unit they did not choose
// the calling for - it was assigned at creation. 100 is a sink they can afford
// to use, which is the point of a sink.
const CALLING_CHANGE_COST = { gold: 100 };

// Assigned when the unit is created, so no roster row is ever without one and
// a litany cell always has something to match. Random between the faction's two
// on purpose: the player's decision is the CHANGE, and the Temple sells it.
function randomCallingFor(faction) {
  const pair = callingsForFaction(faction);
  if (!pair.length) return null;
  return pair[Math.floor(Math.random() * pair.length)].id;
}

// The jsonb the roster column holds, ready to go into an insert.
function newCallingFor(faction) {
  const id = randomCallingFor(faction);
  return id ? { id } : null;
}

// -- Devotion: the Temple's five blocks -------------------------------------
// One block per Temple level, in order, and the level is the block's own index.
// Stored in `roster.devotion` jsonb (sql/010_temple_devotion.sql).
//
//   kind 'calling'  the portrait itself - tap to change the calling
//   kind 'deed'     a counter against a target
//   kind 'oath'     the unending one: gold for a permanent stat, and the price
//                   climbs with every oath the unit has already sworn
//
// The deeds are deliberately NOT split by calling yet. "Deal, heal or shield
// 500" pools damage, healing and shields into one number, so every unit can fill
// the block by doing its own job.
const DEVOTION_BLOCKS = [
  { tier: 1, id: 'calling',  kind: 'calling',
    short: 'Calling',  short_ru: 'Призвание' },
  // `hero` is what this block asks of the HERO instead. A hero never leaves
  // on an errand - freeRosterRows in routes/index.js skips them - so the
  // ordinary block is a rung it could never reach. Casting is the thing only
  // the hero does, so that is what its block counts.
  { tier: 2, id: 'errands',  kind: 'deed', counter: 'errands',  target: 3,
    name: 'Finish 3 errands',        name_ru: 'Завершить 3 поручения',
    short: 'Errands',  short_ru: 'Поручения',
    hero: { id: 'spells', counter: 'spells', target: 10,
            name: 'Cast 10 spells',      name_ru: 'Сотворить 10 заклинаний',
            short: 'Spells',             short_ru: 'Заклинания' } },
  { tier: 3, id: 'deeds',    kind: 'deed', counter: 'deeds',    target: 500,
    name: 'Deal, heal or shield 500', name_ru: 'Нанести урон, исцелить или защитить на 500',
    short: 'Points',   short_ru: 'Очки' },
  { tier: 4, id: 'litanies', kind: 'deed', counter: 'litanies', target: 3,
    name: 'Stand in 3 litanies',     name_ru: 'Выстоять в 3 литаниях',
    short: 'Litanies', short_ru: 'Литании' },
  { tier: 5, id: 'oath',     kind: 'oath',
    name: 'Swear an oath',           name_ru: 'Принести обет',
    short: 'Oath',     short_ru: 'Обет' },
];

// The oath's price, and what it pays. First 1000 gold, then 1500, 2000, and on
// with no ceiling - this is the endgame gold sink, so it must never stop
// asking. The reward starts at a single point of HP; it is stored as a bonus
// rather than recomputed from the count, so raising it later never rewrites
// what the oaths already bought (see sql/010_temple_devotion.sql).
const OATH_BASE_GOLD = 1000;
const OATH_STEP_GOLD = 500;
const OATH_BONUS     = { hp: 1 };

function oathPrice(sworn) {
  return OATH_BASE_GOLD + OATH_STEP_GOLD * Math.max(0, Number(sworn) || 0);
}

// What the roster column holds, unwrapped, the way callingIdOf unwraps the
// other one. Always an object, so no caller has to guard.
function devotionOf(row) {
  const d = row?.devotion;
  return (d && typeof d === 'object' && !Array.isArray(d)) ? d : {};
}

function devotionCount(row, counter) {
  return Math.max(0, Number(devotionOf(row)[counter]) || 0);
}

function oathsSworn(row) {
  return devotionCount(row, 'oaths');
}

// The permanent HP the oaths have paid for. Read at the same moment the
// Temple's flat HP is - never written into unit_data, which every battle
// rewrites from the unit's definition.
function devotionBonusHp(row) {
  return Math.max(0, Number(devotionOf(row).bonus?.hp) || 0);
}

// The block as it applies to THIS unit. Everything but block 2 is the same for
// everyone; block 2 asks the hero for something else. Resolved in one place so
// the screen, the server and anything counting agree on which counter a unit's
// block is keyed to.
function blockFor(row, block) {
  if (!block) return block;
  return (row?.is_hero === true && block.hero) ? { ...block, ...block.hero } : block;
}

// Done is done: a counter past its target stays past it. Counters are lifetime
// and nothing resets them.
function blockDone(row, block) {
  const b = blockFor(row, block);
  if (!b || b.kind !== 'deed') return false;
  return devotionCount(row, b.counter) >= b.target;
}

// A CHAIN, not four open tabs. A block is only workable once every deed block
// before it is finished, so a unit walks 2 -> 3 -> 4 -> 5 in order and the page
// always shows exactly one thing to be getting on with.
//
//   'temple'   the Temple has not reached this block's level
//   'waiting'  an earlier block in the chain is unfinished
//   'open'     this is the one to work on
//   'done'     finished, and it stays finished
//
// Counters themselves are still lifetime and credited whenever they are earned
// (sql/010_temple_devotion.sql) - a deed done is done, and a unit that arrives
// here with a battle record already behind it keeps it. The chain decides what
// the page OFFERS, not what the world counts.
function devotionState(row, block, templeLevel) {
  const b = blockFor(row, block);
  if (!b) return 'temple';
  if ((templeLevel || 0) < b.tier) return 'temple';
  for (const prev of DEVOTION_BLOCKS) {
    if (prev.tier >= b.tier) break;
    if (prev.kind !== 'deed') continue;
    if (!blockDone(row, prev)) return 'waiting';
  }
  if (b.kind === 'deed' && blockDone(row, b)) return 'done';
  return 'open';
}

// The block the unit is working on, or null when the chain is finished or has
// not opened. Used for the "finish X first" line on a waiting block.
function previousUnfinished(row, block) {
  const b = blockFor(row, block);
  if (!b) return null;
  for (const prev of DEVOTION_BLOCKS) {
    if (prev.tier >= b.tier) break;
    if (prev.kind !== 'deed') continue;
    if (!blockDone(row, prev)) return blockFor(row, prev);
  }
  return null;
}

// What a unit's devotion looks like after it levels up: every deed counter
// gone, and it walks the chain again from the first block. That is deliberate -
// the chain runs errands, then fighting, then litanies, so a unit that keeps
// advancing keeps being sent back round every corner of the game.
//
// `oaths` and `bonus` survive, because they were BOUGHT. The count sets the
// next oath's price and the bonus is HP already paid for; a reset that took
// either back would be taking gold back.
function resetDevotionDeeds(row) {
  const d = devotionOf(row);
  const kept = {};
  if (Number(d.oaths) > 0) kept.oaths = Number(d.oaths);
  if (d.bonus && typeof d.bonus === 'object') kept.bonus = d.bonus;
  return kept;
}

function blockName(block, lang = 'en') {
  if (!block) return '';
  return lang === 'ru' ? (block.name_ru || block.name || '') : (block.name || '');
}

function blockShort(block, lang = 'en') {
  if (!block) return '';
  return lang === 'ru' ? (block.short_ru || block.short || '') : (block.short || '');
}

// The colour the portrait's border carries. Null for a unit with no calling,
// which the screen draws in its ordinary border.
function callingTint(id) {
  return CALLING_BY_ID[id]?.tint || null;
}

function getCalling(id) {
  return CALLING_BY_ID[id] || null;
}

function callingsForFaction(faction) {
  return CALLINGS[faction] || [];
}

// Which faction a calling belongs to, or null. A litany may only name a calling
// of the faction that LEADS it - checked by the validator, because a cell
// naming the wrong faction's calling is a litany that can never fire and
// nothing at run time would say so.
function factionOfCalling(id) {
  return CALLING_BY_ID[id]?.faction || null;
}

// What the roster row holds, unwrapped. The column is jsonb so that rungs and
// counters can move in later without a migration; everything that only needs to
// know WHICH calling goes through here rather than reaching into the shape.
function callingIdOf(row) {
  if (!row) return null;
  const raw = row.calling ?? row;
  const id = typeof raw === 'string' ? raw : raw?.id;
  return (id && CALLING_BY_ID[id]) ? id : null;
}

function callingName(id, lang = 'en') {
  const c = CALLING_BY_ID[id];
  if (!c) return '';
  return lang === 'ru' ? c.name_ru : c.name;
}

export {
  CALLINGS, CALLING_BY_ID, CALLING_IDS, CALLING_CHANGE_COST,
  getCalling, callingsForFaction, factionOfCalling, callingIdOf, callingName,
  randomCallingFor, newCallingFor,
  DEVOTION_BLOCKS, OATH_BASE_GOLD, OATH_STEP_GOLD, OATH_BONUS, oathPrice,
  devotionOf, devotionCount, oathsSworn, devotionBonusHp, blockFor, blockDone, blockName,
  devotionState, previousUnfinished, resetDevotionDeeds,
  blockShort, callingTint,
};
if (typeof module !== 'undefined') {
  module.exports = {
    CALLINGS, CALLING_BY_ID, CALLING_IDS, CALLING_CHANGE_COST,
    getCalling, callingsForFaction, factionOfCalling, callingIdOf, callingName,
    randomCallingFor, newCallingFor,
    DEVOTION_BLOCKS, OATH_BASE_GOLD, OATH_STEP_GOLD, OATH_BONUS, oathPrice,
    devotionOf, devotionCount, oathsSworn, devotionBonusHp, blockFor, blockDone, blockName,
    devotionState, previousUnfinished, resetDevotionDeeds,
    blockShort, callingTint,
  };
}
