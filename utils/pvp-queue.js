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

// TWO PEOPLE IN THE QUEUE FIGHT EACH OTHER. There is no second condition.
//
// There used to be one: a ⚔ power band that started at ±15% and widened to
// "anyone" over twenty seconds, so that a close match was preferred while one
// was reachable. It is gone, and it is worth saying why, because it looks like
// the responsible thing to have.
//
// It only pays off when there is a CROWD to choose from — when refusing this
// opponent means picking a better one from the five others also waiting. With
// two people in the queue there is no better one. The band does not improve the
// match; it just makes both of them wait for the clock to permit the only
// pairing available. Two players who joined seconds apart and happened to be
// 20% apart in power sat there for fifteen seconds, both clients saying
// "searching", with nothing wrong and nobody else coming.
//
// Fairness, where it belongs, is still there: `power` rides along on the entry
// and is what picks the BOT's band for a player nobody turned up for. Against a
// person, a mismatched fight now beats no fight.
//
// If this ever has a crowd to choose from, the place to put a preference back is
// matchWaiting — sort candidates by closeness rather than refusing them — not a
// time-gated veto that can leave the queue holding two people and pairing
// neither.

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
function enqueue({ chat_id, mode = 'pvp_quick', formation, power = 0, tourney_id = null }) {
  const id = String(chat_id);
  waiting.delete(id);

  const now = Date.now();
  // tourney_id rides along so the battle built from this entry knows which
  // tourney it counts for; it is null for a quick match.
  const entry = { chat_id: id, mode, formation, power: Number(power) || 0, tourney_id, enqueuedAt: now };

  // Whoever has waited longest in this mode. Mode is the only thing that can
  // disqualify an opponent — a tourney entry and a quick match are different
  // fights under different rules — and the longest wait goes first so nobody
  // starves behind a stream of newcomers.
  let opponent = null;
  for (const o of waiting.values()) {
    if (o.chat_id === id || o.mode !== mode) continue;
    if (!opponent || o.enqueuedAt < opponent.enqueuedAt) opponent = o;
  }
  if (opponent) {
    waiting.delete(opponent.chat_id);
    return { matched: true, a: entry, b: opponent };
  }

  waiting.set(id, entry);
  return { matched: false, entry };
}

// Pair off everyone who can be paired, oldest first.
//
// Since enqueue() now pairs on the spot with anyone in the same mode, this
// should never find anything: the invariant it enforces is that the queue holds
// at most one person per mode. It is kept because that invariant is the whole
// promise of this file and it costs a sort of a map with one entry in it to
// guarantee rather than assume — a re-queue racing a failed duel build, or any
// future path that puts someone in `waiting` without looking for an opponent,
// gets picked up on the next tick instead of leaving two people staring at a
// spinner. That is exactly the bug the old power bands caused on purpose.
//
// Returns every pair it could make, each already removed from the queue.
function matchWaiting() {
  const pairs = [];
  const pool = [...waiting.values()].sort((a, b) => a.enqueuedAt - b.enqueuedAt);

  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    if (!waiting.has(a.chat_id)) continue;
    for (let j = i + 1; j < pool.length; j++) {
      const b = pool[j];
      if (!waiting.has(b.chat_id)) continue;
      if (a.mode !== b.mode) continue;
      waiting.delete(a.chat_id);
      waiting.delete(b.chat_id);
      pairs.push({ a, b });
      break;
    }
  }
  return pairs;
}

// Everyone in `mode` who has waited at least `ms`, oldest first. Not removed:
// the caller takes an entry out with leave() once it has something to give it.
function overdue(ms, mode, now = Date.now()) {
  return [...waiting.values()]
    .filter(e => e.mode === mode && now - e.enqueuedAt >= ms)
    .sort((a, b) => a.enqueuedAt - b.enqueuedAt);
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

module.exports = { enqueue, matchWaiting, overdue, leave, has, get, size, sweep, STALE_MS };