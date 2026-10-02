// Callings - the one decision about a unit that belongs to the player.
// See docs/unit-identity-design.md §2 and docs/combat-barks-design.md §5.
//
// Each faction has exactly TWO, and every unit in that faction is offered the
// same pair, so there is no profile detection and no unit left with a track it
// cannot fill. A calling is stored on the roster row (`roster.calling` jsonb,
// `{"id":"vigil"}`), costs 500 gold to change, and resets the unit's rungs when
// it does - that reset is what makes the first pick a choice.
//
// TWO SYSTEMS READ THIS FILE:
//
//   The Chronicle   which deeds rungs 1/3/5 ask for, which stats the unit may
//                   raise, which passive the capstone can hand it. Not built.
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
    { id: 'vigil',   name: 'Vigil',   name_ru: 'Бдение', pays: 'ally'  },
    // Carrying it forward.
    { id: 'crusade', name: 'Crusade', name_ru: 'Поход',  pays: 'enemy' },
  ],
  grail_of_sorrow: [
    // Refusing the price - the Grail's healing and warding, which is a refusal
    // that the loss has happened at all.
    { id: 'denial',     name: 'Denial',     name_ru: 'Отрицание', pays: 'ally'  },
    // Paying it. The Grail's violence is bought with its own blood, which is
    // why this is the enemy-facing one and not the gentler of the two.
    { id: 'acceptance', name: 'Acceptance', name_ru: 'Смирение',  pays: 'enemy' },
  ],
  choir_of_the_cursed: [
    // Your own voice above the song.
    { id: 'descant', name: 'Descant', name_ru: 'Дискант', pays: 'ally'  },
    // Power taken from others.
    { id: 'hunger',  name: 'Hunger',  name_ru: 'Голод',   pays: 'enemy' },
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
  CALLINGS, CALLING_BY_ID, CALLING_IDS,
  getCalling, callingsForFaction, factionOfCalling, callingIdOf, callingName,
};
if (typeof module !== 'undefined') {
  module.exports = {
    CALLINGS, CALLING_BY_ID, CALLING_IDS,
    getCalling, callingsForFaction, factionOfCalling, callingIdOf, callingName,
  };
}
