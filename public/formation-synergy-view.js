// The screen-side of formation synergies: it asks resolveSynergies() what bonds
// exist right now and keeps what is drawn in step with the answer.
//
// One function serves both screens, because both want the same three beats — a
// bond forms, it stands, it breaks. Only the way a cell is ADDRESSED differs:
// prep keys cells by grid position (`data-i`, scoped by grid, since the player
// and enemy grids repeat the same indices), battle keys them by combatant id
// (`data-id`). That is the whole of the difference, so it is the only thing the
// caller has to say.
//
// In battle the three beats fall out of the mechanic for free: the bond forms at
// battle start, stands while both units live, and breaks when one of them dies —
// because a dead combatant drops out of the units list and the diff notices.

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
 * Bring the drawn bonds in line with `units`:
 *
 *   a key that wasn't there before -> formation, then start its idle loop
 *   a key that has gone away       -> stop the idle loop, then break
 *   a key that is in both          -> leave it alone, its loop is still running
 *
 * The diff is the whole point. Both screens re-render constantly — prep on every
 * placement and drag, battle on every log entry — and without it an untouched
 * bond would replay its formation flare over and over.
 *
 * `scope` is 'battle', or the id of the grid the cells live in. It also
 * identifies the screen: changing it drops every bond, since selectors from the
 * old screen cannot resolve on the new one.
 *
 * Safe to call on every refresh; that is how it is meant to be used.
 */
export function syncFormationSynergies(units, scope = 'player-grid') {
  // Nothing is recorded before there is a canvas to record it against. A bond
  // marked as drawn while the FX layer was still coming up would sit in
  // `active` forever without ever appearing.
  if (!isBattleFxReady()) return;
  if (currentScope && currentScope !== scope) clearFormationSynergies();
  currentScope = scope;

  const selectorsFor = scope === 'battle' ? idSelectors() : gridSelectors(scope);
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

// Tear down every bond without playing a break — for leaving the screen, where
// a recoiling cord on a grid that is about to be erased would be nonsense.
export function clearFormationSynergies() {
  for (const entry of active.values()) entry.stop?.();
  active.clear();
  currentScope = null;
}