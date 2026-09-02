// One battle, two points of view.
//
// A PvP battle is stored ONCE, from the perspective of the player who created
// it: their units are side 'player', their opponent's are side 'enemy'. Storing
// a second, mirrored copy would give two records that can disagree — so the
// mirror is made on the way out instead, per request, from the one record.
//
// The two grids FACE each other, so a cell means different things on them: the
// engine's front column is col 1 on the player side and col 0 on the enemy side
// (see getValidTargets in utils/battle-engine.js). Mirroring the side labels
// therefore has to mirror the columns with them, or a player's front line is
// drawn — and fought — as their back line.
//
// Combatant ids do not move: `player:3` is an opaque key to the client, which
// resolves everything through the combatant list and never parses the prefix.

const OPPOSITE = { player: 'enemy', enemy: 'player' };

const COLS = 2;

// The same cell as seen from the other side of the field.
//
// A `row` unit spans BOTH columns, so it mirrors onto itself — but its anchor
// must stay the left-hand cell, which is where the footprint is measured from.
// Mirroring its anchor to the right-hand cell would push the footprint off the
// board and silently drop the unit.
function mirrorCell(cell, size) {
  if (!Number.isInteger(cell)) return cell;
  const row = Math.floor(cell / COLS);
  const col = cell % COLS;
  if (size === 'row') return row * COLS;
  return row * COLS + (COLS - 1 - col);
}

function flipSide(side) {
  return OPPOSITE[side] ?? side;
}

function flipPower(power) {
  if (!power) return power;
  return { player: power.enemy ?? 0, enemy: power.player ?? 0 };
}

// A log entry as the other player should read it. Two event types carry a side
// of their own (power gains and casts), and several carry the cell a unit acted
// from or was hit in — which the client prints as "(R2C1)" and so has to be in
// the reader's own frame.
function flipLog(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const out = { ...entry };
  let touched = false;
  if (out.side !== undefined)       { out.side = flipSide(out.side); touched = true; }
  // Size is not carried on a log entry, so a `row` unit's anchor cannot be
  // preserved exactly here. It is a label in a sentence, not a position the
  // engine reads, and R2C1 vs R2C2 for a unit occupying both is not a lie worth
  // threading size through every log line to avoid.
  if (Number.isInteger(out.actorCell))  { out.actorCell  = mirrorCell(out.actorCell);  touched = true; }
  if (Number.isInteger(out.targetCell)) { out.targetCell = mirrorCell(out.targetCell); touched = true; }
  return touched ? out : entry;
}

function flipLogs(logs) {
  return Array.isArray(logs) ? logs.map(flipLog) : logs;
}

function flipSnapshot(snap) {
  if (!snap) return snap;
  return {
    ...snap,
    combatants: (snap.combatants || []).map(c => ({
      ...c,
      side:      flipSide(c.side),
      cellIndex: mirrorCell(c.cellIndex, c.size),
    })),
    log:        flipLogs(snap.log),
    power:      flipPower(snap.power),
    winner:     snap.winner ? flipSide(snap.winner) : snap.winner,
  };
}

module.exports = { flipSide, flipPower, flipLog, flipLogs, flipSnapshot, mirrorCell };