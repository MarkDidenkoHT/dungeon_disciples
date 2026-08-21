// The screen-side of formation synergies: it asks resolveSynergies() what bonds
// exist right now and keeps what is drawn in step with the answer.
//
// One function serves both screens and both sides, because they all want the
// same reconcile — a bond appears, it stands, it goes. What differs is only:
//
//   * how a cell is ADDRESSED. Prep keys cells by grid position (`data-i`,
//     scoped by grid, since the player and enemy grids repeat the same indices);
//     battle keys them by combatant id (`data-id`). That is the `scope`.
//   * how the bond PRESENTS. A 'tether' bond is drawn for as long as it lasts,
//     so it owns an idle loop and a break. A 'flash' bond lights its targets
//     once and leaves the lasting record to the ordinary buff icon, so it has
//     neither. See `present` in data/formation_synergies.js.
//
// In battle the beats fall out of the mechanic for free: a bond forms at battle
// start, stands while both units live, and goes when one of them dies — because
// a dead combatant drops out of the units list and the diff notices.

import { resolveSynergies } from '../data/formation_synergies.js';
import {
  playBondForm, startBondIdle, playBondBreak, playBondFlash, isBattleFxReady,
} from './battle-fx.js';

// `${scope}|${bond.key}` -> { scope, stop, srcSel, dstSel, fx, present }
//
// Namespaced by scope rather than reset when the scope changes, because prep
// drives TWO scopes at once — its player grid and its enemy grid — and they must
// not clear each other. Only entries in the scope being synced take part in its
// diff.
const active = new Map();

// Prep: the bond's ANCHOR cells, not its nearest cells — a multi-cell unit
// renders as one element spanning its whole footprint, anchored at its first
// cell, so only the anchor exists in the DOM.
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
 * Bring the bonds drawn in one scope in line with `units`:
 *
 *   a key that wasn't there before -> play its opening beat
 *   a key that has gone away       -> stop it and close it out
 *   a key that is in both          -> leave it alone
 *
 * The diff is the whole point. Both screens re-render constantly — prep on every
 * placement and drag, battle on every log entry — and without it an untouched
 * bond would replay its opening over and over.
 *
 * `scope` is 'battle', or the id of the grid whose cells these are.
 *
 * Safe to call on every refresh; that is how it is meant to be used.
 */
export function syncFormationSynergies(units, scope = 'player-grid') {
  // Nothing is recorded before there is a canvas to record it against. A bond
  // marked as shown while the FX layer was still coming up would sit in `active`
  // forever without ever appearing.
  if (!isBattleFxReady()) return;

  const selectorsFor = scope === 'battle' ? idSelectors() : gridSelectors(scope);
  const found = resolveSynergies(units);
  const seen = new Set();
  // Cells already flashing this pass. A unit standing between two Inspiration
  // allies is the target of two bonds at once, and the flash is ADD-blended —
  // played twice it lights up about twice as bright as everyone else, which
  // reads as "something special happened here" when nothing did. The buff icon
  // is where the doubled value belongs, and it already sums.
  const flashed = new Set();

  for (const bond of found) {
    // A previewOnly bond is a placement hint only. Its battle side is driven by
    // the LOG instead, because it fires every round and a reconcile would show
    // it once at battle start and never again — see `sustenance` in the registry.
    if (bond.def.previewOnly && scope === 'battle') continue;

    const id = `${scope}|${bond.key}`;
    seen.add(id);
    if (active.has(id)) continue;                   // already standing, already shown

    const [srcSel, dstSel] = selectorsFor(bond);
    const fx = bond.def.fx || {};
    const present = bond.def.present || 'tether';

    // Registered BEFORE the opening animation is awaited. A player can place
    // another unit while it is still playing, which re-enters this function —
    // without the entry already present, the bond would be treated as new a
    // second time and play twice.
    const entry = { scope, stop: null, srcSel, dstSel, fx, present };
    active.set(id, entry);

    // A bond that pays its SOURCE lights the source: the partner is a condition,
    // not a recipient, and flashing it would say the wrong thing about who got
    // something. See `buffs` in data/formation_synergies.js.
    const flashSel = bond.def.buffs === 'source' ? srcSel : dstSel;

    if (present === 'flash') {
      // Lights the affected unit and is done. The buff icon on the cell carries
      // it from here, so there is nothing to hold on to and nothing to tear
      // down — the entry stays only so the diff knows it has been played.
      if (!flashed.has(flashSel)) {
        flashed.add(flashSel);
        playBondFlash(flashSel, fx);
      }
      continue;
    }

    playBondForm(srcSel, dstSel, fx).then(() => {
      // The pair may have been pulled apart while the opening was still playing.
      // Its break has already run by then, so starting an idle loop now would
      // leave a tether on screen with nothing holding it up.
      if (active.get(id) !== entry) return;
      entry.stop = startBondIdle(srcSel, dstSel, fx);
    });
  }

  for (const [id, entry] of [...active]) {
    if (entry.scope !== scope || seen.has(id)) continue;
    active.delete(id);
    entry.stop?.();
    // A flash bond has nothing on screen to dismiss — its buff icon simply stops
    // being rendered, which is how every other buff ends.
    if (entry.present !== 'flash') playBondBreak(entry.srcSel, entry.dstSel, entry.fx);
  }
}

// Tear down every bond without closing animations — for leaving the screen,
// where a recoiling cord on a grid that is about to be erased would be nonsense.
export function clearFormationSynergies() {
  for (const entry of active.values()) entry.stop?.();
  active.clear();
}