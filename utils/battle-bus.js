// Server-side fan-out for battle updates.
//
// WHY THIS EXISTS
// Every browser used to open its OWN websocket to Supabase and subscribe to
// postgres_changes on battle_state / battle_log. One socket per player in a
// battle, held for the whole fight, plus a fresh one on every reconnect — which
// in the Telegram webview happens each time a phone locks. That runs into
// Supabase's concurrent-connection cap with a very ordinary number of players,
// and it spent a persistent socket to deliver zero bytes: the event carried no
// data, it only told the client to go and fetch from us over HTTP anyway.
//
// The insight that makes this simple: THIS SERVER IS THE ONLY WRITER of battle
// state. Nothing else touches battle_state or battle_log. So we do not need to
// listen to the database to know when a battle changed — we already know, at
// the exact moment we change it. No upstream subscription, no Supabase realtime
// dependency, and the connection count against Supabase drops to zero.
//
// Clients hold one SSE connection to us instead, which costs a socket on our
// own process and nothing anywhere else.
//
// SCALING NOTE
// This is an IN-PROCESS bus, so it fans out only to clients connected to the
// same instance. On a single instance (Render's free tier) that is every client.
// If this is ever run multi-instance, publish() is the single choke point to
// swap for a shared transport — Redis pub/sub, or Supabase realtime BROADCAST
// on one server-held connection rather than one per player. Nothing else in the
// codebase needs to change for that.

// battle_id -> Set<subscriber>
const rooms = new Map();

// Idle proxies (Render's included) hang up a quiet connection. A comment frame
// is not delivered to onmessage, so it keeps the pipe warm without the client
// having to filter it out.
const HEARTBEAT_MS = 25000;

// A runaway client that reconnects in a loop must not be able to pin unbounded
// memory on one battle.
const MAX_SUBSCRIBERS_PER_BATTLE = 16;

function roomFor(battleId) {
  if (!rooms.has(battleId)) rooms.set(battleId, new Set());
  return rooms.get(battleId);
}

function writeFrame(res, event, data) {
  try {
    if (event) res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;   // socket already gone; the close handler will clean up
  }
}

/**
 * Register an SSE client for one battle. Returns a teardown function; the
 * caller wires it to the request's 'close' so a vanished browser cannot leak a
 * subscriber or its heartbeat timer.
 */
function subscribe(battleId, chatId, res) {
  const room = roomFor(battleId);
  if (room.size >= MAX_SUBSCRIBERS_PER_BATTLE) {
    // Refuse rather than grow without bound. The client falls back to polling,
    // which is the same path it uses when SSE is unavailable at all.
    return null;
  }

  const sub = { chatId, res, timer: null };
  room.add(sub);

  sub.timer = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { close(); }
  }, HEARTBEAT_MS);
  if (typeof sub.timer.unref === 'function') sub.timer.unref();

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    clearInterval(sub.timer);
    const r = rooms.get(battleId);
    if (r) {
      r.delete(sub);
      if (!r.size) rooms.delete(battleId);   // no empty rooms left behind
    }
    try { res.end(); } catch {}
  }

  return close;
}

/**
 * Tell everyone watching this battle that it moved. Deliberately carries only a
 * pointer — `last_log_id` — and not the state itself: the client already has a
 * conditional endpoint (/battle/state?last_log_id=N) that returns exactly the
 * entries it has not seen, and duplicating state into the event would give two
 * sources of truth that can disagree.
 */
function publish(battleId, payload = {}, { exceptChatId = null, event = 'battle' } = {}) {
  const room = rooms.get(battleId);
  if (!room || !room.size) return 0;
  let delivered = 0;
  for (const sub of [...room]) {
    // Never echo to the player who caused it. They already have the result in
    // the response body and have played it; a stream event on top made the same
    // exchange animate a SECOND time, because the catch-up fetch it triggers
    // arrives after playback has finished and `processing` has gone false.
    if (exceptChatId != null && sub.chatId === String(exceptChatId)) continue;
    if (writeFrame(sub.res, event, { battle_id: battleId, ...payload })) delivered++;
  }
  return delivered;
}

// Watchers per battle, for logging and debugging.
function stats() {
  return {
    battles: rooms.size,
    subscribers: [...rooms.values()].reduce((n, r) => n + r.size, 0),
  };
}

module.exports = { subscribe, publish, stats, HEARTBEAT_MS };