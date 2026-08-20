// The battle-prep side of formation synergies: it watches the player's grid and
// keeps the drawn bonds in step with what is actually placed.
//
// Nothing in here knows what a bond IS. It asks resolveSynergies() what pairs
// exist right now, diffs that against what it drew last time, and plays the
// matching beat:
//
//   a key that wasn't there before  -> formation, then start its idle loop
//   a key that has gone away        -> stop the idle loop, then break
//   a key that is in both           -> leave it alone, its loop is still running
//
// The diff is the whole point. Prep re-renders its grid on every single
// placement, drag and spell selection; without a diff, arranging the rest of
// your army would replay the formation flare of an untouched bond over and over.

import { resolveSynergies } from '../data/formation_synergies.js';
import { playBondForm, startBondIdle, playBondBreak, isBattleFxReady } from './battle-fx.js';

// key -> { stop, srcSel, dstSel, fx }
const active = new Map();
let currentGridId = null;

// Prep cells carry `data-i`, which is a grid POSITION and repeats between the
// player and enemy grids, so every selector is scoped by its grid.
function selFor(gridId, cellIndex) {
  return `#${gridId} .battle-cell[data-i="${cellIndex}"]`;
}

/**
 * Bring the drawn bonds in line with `units`.
 *
 * units: the normalised shape resolveSynergies() takes —
 *        { id, side, cells, anchor, tags, abilityKeys, type, unitId }
 * gridId: the id of the grid element those cells live in ('player-grid').
 *
 * Safe to call on every refresh; that is how it is meant to be used.
 */
export function syncFormationSynergies(units, gridId = 'player-grid') {
  // Nothing is recorded before there is a canvas to record it against. Prep can
  // refresh its grid while the FX layer is still coming up (a restored formation
  // places units before the arena has been measured), and a bond marked as drawn
  // in that window would sit in `active` forever without ever appearing.
  if (!isBattleFxReady()) return;

  // A different grid means a different screen instance — drop everything rather
  // than leave loops pointing at selectors that no longer resolve.
  if (currentGridId && currentGridId !== gridId) clearFormationSynergies();
  currentGridId = gridId;

  const found = resolveSynergies(units);
  const seen = new Set();

  for (const bond of found) {
    seen.add(bond.key);
    if (active.has(bond.key)) continue;             // already standing, already drawn

    const srcSel = selFor(gridId, bond.sourceAnchor);
    const dstSel = selFor(gridId, bond.partnerAnchor);
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

// Tear down every bond without playing a break — for leaving the screen, where
// a recoiling cord on a grid that is about to be erased would be nonsense.
export function clearFormationSynergies() {
  for (const entry of active.values()) entry.stop?.();
  active.clear();
  currentGridId = null;
}