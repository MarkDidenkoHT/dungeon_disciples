// The screen-side of formation synergies: it asks resolveSynergies() what bonds
// exist and draws them.
//
// Two entry points, because the two screens want different things:
//
//   syncFormationSynergies()  battle prep — a LIVE view. Bonds form, persist and
//                             break as the player rearranges the grid.
//   playFormationSynergies()  battle — a one-shot at mount. The bonds are
//                             already decided by then; this just shows them.
//
// Neither knows what a bond is. Both take the normalised unit shape that
// data/formation_synergies.js reads, and a way to turn a bond into the two cell
// selectors it should be drawn between — which differs per screen: prep keys
// cells by grid position (`data-i`, scoped by grid, since the player and enemy
// grids repeat the same indices), battle keys them by combatant id (`data-id`).

import { resolveSynergies } from '../data/formation_synergies.js';
import { playBondForm, startBondIdle, playBondBreak, isBattleFxReady } from './battle-fx.js';

// key -> { stop, srcSel, dstSel, fx }
const active = new Map();
let currentScope = null;

// Prep: cells carry `data-i`, a grid POSITION that repeats between the player
// and enemy grids, so the selector is scoped by its grid. The bond's ANCHOR
// cells are used rather than its nearest cells — a multi-cell unit renders as
// one element spanning its whole footprint, anchored at its first cell, so only
// the anchor exists in the DOM.
const gridSelectors = gridId => bond => [
  `#${gridId} .battle-cell[data-i="${bond.sourceAnchor}"]`,
  `#${gridId} .battle-cell[data-i="${bond.partnerAnchor}"]`,
];

// Battle: one cell element per combatant, keyed by that combatant's id.
const idSelectors = () => bond => [
  `.battle-cell[data-id="${bond.sourceId}"]`,
  `.battle-cell[data-id="${bond.partnerId}"]`,
];

/**
 * Battle prep. Bring the drawn bonds in line with `units`:
 *
 *   a key that wasn't there before -> formation, then start its idle loop
 *   a key that has gone away       -> stop the idle loop, then break
 *   a key that is in both          -> leave it alone, its loop is still running
 *
 * The diff is the whole point. Prep re-renders its grid on every placement,
 * drag and spell selection; without it, arranging the rest of your army would
 * replay the formation flare of an untouched bond over and over.
 *
 * Safe to call on every refresh; that is how it is meant to be used.
 */
export function syncFormationSynergies(units, gridId = 'player-grid') {
  // Nothing is recorded before there is a canvas to record it against. A bond
  // marked as drawn while the FX layer was still coming up would sit in
  // `active` forever without ever appearing.
  if (!isBattleFxReady()) return;
  if (currentScope && currentScope !== gridId) clearFormationSynergies();
  currentScope = gridId;

  const selectorsFor = gridSelectors(gridId);
  const found = resolveSynergies(units);
  const seen = new Set();
  // Logged only when the set CHANGES, in the same shape as battle-fx's own
  // logs. A bond that never appears is otherwise indistinguishable from a bond
  // that was never resolved, and those have very different causes.
  if (found.length !== active.size) {
    console.log('[synergy] bonds:', found.map(b => b.key).join(', ') || '(none)', '| was', active.size);
  }

  for (const bond of found) {
    seen.add(bond.key);
    if (active.has(bond.key)) continue;             // already standing, already drawn

    const [srcSel, dstSel] = selectorsFor(bond);
    const fx = bond.def.fx || {};

    // Registered BEFORE the formation animation is awaited. A player can place
    // another unit inside those 620ms, which re-enters this function — without
    // the entry already present, the bond would be treated as new a second time
    // and flare twice.
    const entry = { stop: null, srcSel, dstSel, fx };
    active.set(bond.key, entry);

    playBondForm(srcSel, dstSel, fx).then(() => {
      // The pair may have been pulled apart while the flare was still playing.
      // Its break has already run by then, so starting an idle loop now would
      // leave a tether on screen with nothing holding it up.
      if (active.get(bond.key) !== entry) return;
      entry.stop = startBondIdle(srcSel, dstSel, fx);
    });
  }

  for (const [key, entry] of [...active]) {
    if (seen.has(key)) continue;
    active.delete(key);
    entry.stop?.();
    playBondBreak(entry.srcSel, entry.dstSel, entry.fx);
  }
}

/**
 * Battle start. Plays the formation beat for every bond on the field, once.
 *
 * Driven off the COMBATANTS rather than off the battle log, which is the only
 * way it can work: /battle/create fires on_battle_start server-side and hands
 * the client those entries at mount, where seedPlayedLogs() marks them as
 * already shown — so a battle-start passive's log entry never reaches the FX
 * dispatcher at all. The bond is visible in the board state regardless, so that
 * is what this reads.
 *
 * Both sides, since an enemy formation is worth reading too.
 */
export async function playFormationSynergies(units) {
  if (!isBattleFxReady()) return;
  const selectorsFor = idSelectors();
  const bonds = resolveSynergies(units);
  console.log('[synergy] battle start bonds:', bonds.map(b => b.key).join(', ') || '(none)');
  // Together, not in sequence: every bond on the field forms at the same
  // instant, and awaiting them one by one would read as a chain of separate
  // events.
  await Promise.all(bonds.map(bond => {
    const [srcSel, dstSel] = selectorsFor(bond);
    return playBondForm(srcSel, dstSel, bond.def.fx || {});
  }));
}

// Tear down every bond without playing a break — for leaving the screen, where
// a recoiling cord on a grid that is about to be erased would be nonsense.
export function clearFormationSynergies() {
  for (const entry of active.values()) entry.stop?.();
  active.clear();
  currentScope = null;
}