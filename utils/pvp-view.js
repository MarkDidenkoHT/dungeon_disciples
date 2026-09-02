// One battle, two points of view.
//
// A PvP battle is stored ONCE, from the perspective of the player who created
// it: their units are side 'player', their opponent's are side 'enemy'. Storing
// a second, mirrored copy would give two records that can disagree — so the
// mirror is made on the way out instead, per request, from the one record.
//
// Only the SIDE LABELS move. Cells do not: each side owns its own 0..5 grid
// (see `placement` and enemy `cell`), so a unit standing in cell 3 of its own
// board stands in cell 3 whoever is looking. Combatant ids do not move either —
// `player:3` is an opaque key to the client, which resolves everything through
// the combatant list and never parses the prefix.

const OPPOSITE = { player: 'enemy', enemy: 'player' };

function flipSide(side) {
  return OPPOSITE[side] ?? side;
}

function flipPower(power) {
  if (!power) return power;
  return { player: power.enemy ?? 0, enemy: power.player ?? 0 };
}

// A log entry as the other player should read it. Two event types carry a side
// of their own (power gains and casts); everything else refers to units by id,
// which is already perspective-free.
function flipLog(entry) {
  if (!entry || typeof entry !== 'object' || entry.side === undefined) return entry;
  return { ...entry, side: flipSide(entry.side) };
}

function flipLogs(logs) {
  return Array.isArray(logs) ? logs.map(flipLog) : logs;
}

function flipSnapshot(snap) {
  if (!snap) return snap;
  return {
    ...snap,
    combatants: (snap.combatants || []).map(c => ({ ...c, side: flipSide(c.side) })),
    log:        flipLogs(snap.log),
    power:      flipPower(snap.power),
    winner:     snap.winner ? flipSide(snap.winner) : snap.winner,
  };
}

module.exports = { flipSide, flipPower, flipLog, flipLogs, flipSnapshot };