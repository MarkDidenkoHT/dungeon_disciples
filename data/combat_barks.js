// Cosmetic combat barks - zero mechanical effect, purely flavor text shown as a
// toast next to the unit that triggered it. Keyed by unit name (not id), so all
// tiers/upgrade paths of the same named unit share the same lines (e.g. every
// "Paladin" tier from h_e_1 through h_e_1211 uses the same 'Paladin' lines).
//
// Chance to actually speak decays per unit per trigger, per battle:
//   0 barks spoken so far -> 50% chance
//   1 bark spoken so far  -> 25% chance
//   2+ spoken             -> 0% (never again this battle)
// See BattleEngine.checkBark() in utils/battle-engine.js.

const COMBAT_BARKS = {
  heal_low_hp: {
    threshold_pct: 25, // only considered if the target was below this HP% before the heal
    units: {
      Acolyte: [
        'You shall not fall!',
        'Stay with me!',
        'The light will not abandon you!',
      ],
      Priest: [
        'You shall not fall!',
        'Hold on, I have you!',
        'Rise, and fight on!',
      ],
    },
  },
  kill_tag: {
    tag: 'Demon',
    units: {
      Paladin: [
        'Feel the might of the righteous!',
        'Back to the abyss with you!',
      ],
      Templar: [
        'No mercy for the wicked!',
        'The light purges all!',
      ],
    },
  },
};

export { COMBAT_BARKS };
if (typeof module !== 'undefined') module.exports = { COMBAT_BARKS };