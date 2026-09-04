// Global gameplay toggles. Build-time constants, not player state — flipping
// one is a code change and a redeploy, deliberately. Read from BOTH sides:
// `require`d by routes/index.js and imported as an ES module by the screens in
// public/, so server and client can never disagree about which rules are live.

// ── DEATH_ENABLED ───────────────────────────────────────────────────────────
// The permanent-death economy. When TRUE (the shipped game):
//   * a unit that falls in combat is written back dead, and the only way up is
//     the Resurrect spell (crystals) or a divine favor;
//   * the bonus recruit a new player starts with is seeded DEAD, so the opening
//     tutorial has something to raise (the `unit_fallen` -> `spell_revive`
//     steps in public/screens/castle.js).
//
// When FALSE, death is switched off as an economy: a unit that falls in combat
// comes back alive at 1 HP instead. It still earns NO XP for that battle —
// that is decided from the battle record's own alive flags, not from what gets
// written to the roster, so it needs no special-casing here. The starting
// recruit is seeded alive at 1 HP instead of dead, which skips the two
// resurrection tutorial steps (their ready() finds no fallen unit) while
// leaving `spell_heal` a wounded unit to teach on — that step gates go_embark,
// the restore controls and the end of onboarding, so it must still fire.
//
// Everything else needs no branch. The per-unit Resurrect button, the
// restore-bar's Resurrect / Resurrect all modes and the favor system's revive
// kind are all conditional on a unit actually being dead, so with this off they
// simply never appear.
const DEATH_ENABLED = false;

export { DEATH_ENABLED };
if (typeof module !== 'undefined') module.exports = { DEATH_ENABLED };
