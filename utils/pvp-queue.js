// Matchmaking for quick match.
//
// WHERE THE DECISION IS MADE
// In this process, in the map below — not in the database. The same reasoning as
// utils/battle-bus.js: this server is the only writer, so it already knows the
// whole queue, and pairing in memory needs no lock, no RPC and no round trip.
// PostgREST cannot express "claim the single oldest waiting row" atomically
// without a Postgres function, and adding one to save a lookup we do not need
// would be paying for a problem we do not have.
//
// SCALING NOTE
// One instance holds the whole queue. On more than one, two players on different
// instances would never see each other — at that point this map becomes a shared
// one (Redis, or a Postgres function doing the claim) and `tryMatch` is the only
// function that has to change. The table in sql/001_pvp.sql is the durable
// record either way.
//
// The rows in pvp_queue are written by the route, not from here: this file is
// pure matchmaking and holds no I/O, which keeps it testable on its own.

// chat_id -> entry
const waiting = new Map();

// How far apart two armies may be in ⚔ power, widening the longer someone waits.
// A player alone in the queue at 3am must eventually be matched with whoever
// shows up, so the last band is "anyone" rather than a wider number.
const BANDS = [
  { afterMs: 0,     ratio: 0.15 },
  { afterMs: 10000, ratio: 0.30 },
  { afterMs: 20000, ratio: Infinity },
];

function bandFor(waitedMs) {
  let ratio = BANDS[0].ratio;
  for (const b of BANDS) if (waitedMs >= b.afterMs) ratio = b.ratio;
  return ratio;
}

// Both sides' patience counts, not just the newcomer's: someone who has been
// waiting 30 seconds has already earned "anyone", and the player who just
// arrived should not narrow that back down.
function compatible(a, b, now) {
  const ratio = Math.max(bandFor(now - a.enqueuedAt), bandFor(now - b.enqueuedAt));
  if (ratio === Infinity) return true;
  const hi = Math.max(a.power, b.power);
  const lo = Math.min(a.power, b.power);
  if (hi <= 0) return true;
  return (hi - lo) / hi <= ratio;
}

/**
 * Put a player in the queue, or pair them with someone already in it.
 *
 * Re-queueing while already queued REPLACES the old entry rather than being
 * refused — a client that reconnects after a dropped stream should not have to
 * know whether its previous enqueue survived.
 *
 * Returns { matched: false, entry } or { matched: true, a, b } with both
 * entries already removed from the queue.
 */
function enqueue({ chat_id, mode = 'pvp_quick', formation, power = 0 }) {
  const id = String(chat_id);
  waiting.delete(id);

  const now = Date.now();
  const entry = { chat_id: id, mode, formation, power: Number(power) || 0, enqueuedAt: now };

  // Oldest first, so the queue is fair and nobody starves behind a stream of
  // better-matched newcomers.
  const candidates = [...waiting.values()]
    .filter(o => o.chat_id !== id && o.mode === mode)
    .sort((x, y) => x.enqueuedAt - y.enqueuedAt);

  const opponent = candidates.find(o => compatible(entry, o, now));
  if (opponent) {
    waiting.delete(opponent.chat_id);
    return { matched: true, a: entry, b: opponent };
  }

  waiting.set(id, entry);
  return { matched: false, entry };
}

function leave(chat_id) {
  return waiting.delete(String(chat_id));
}

function has(chat_id) {
  return waiting.has(String(chat_id));
}

function get(chat_id) {
  return waiting.get(String(chat_id)) || null;
}

function size() {
  return waiting.size;
}

// A client that vanishes mid-queue leaves an entry nothing will ever clear: its
// stream closes, but a closed stream is also what a phone locking looks like, so
// the stream is not proof of departure. Age is. Swept on enqueue rather than on a
// timer, because an empty queue should cost nothing.
const STALE_MS = 5 * 60 * 1000;
function sweep(now = Date.now()) {
  const dropped = [];
  for (const [id, e] of waiting) {
    if (now - e.enqueuedAt > STALE_MS) { waiting.delete(id); dropped.push(id); }
  }
  return dropped;
}

module.exports = { enqueue, leave, has, get, size, sweep, STALE_MS };
