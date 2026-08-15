import { api, getSessionToken } from './api.js';

// Battle updates arrive over ONE server-sent-events stream from our own server,
// not over a per-player Supabase websocket. See utils/battle-bus.js for why:
// this server is the only writer of battle state, so it can announce a change at
// the moment it makes one, and we stop spending a Supabase connection per player
// to deliver an event that carried no data anyway.
//
// The event is only a nudge. All state still comes from /battle/state, which
// returns exactly the log entries this client has not seen — one source of truth.

export function createBattleRealtimeController({ battleId, playerId, onStateChange, onError }) {
  let es = null;
  let stopped = false;
  let lastLogId = null;
  let retries = 0;
  let retryTimer = null;
  let onVisible = null;

  // A connection in a Telegram webview does not survive being backgrounded — the
  // phone locks and the stream dies quietly. This is the safety net: an error is
  // a setback, not the end, and polling carries the battle in the meantime.
  const RETRY_MS = [1000, 2000, 5000, 10000, 20000];   // then hold at 20s

  // Overlapping catch-ups would hand the same entries to playback twice, so a
  // fetch already in flight absorbs the nudge that arrives during it.
  let inFlight = null;

  function refreshFromServer() {
    if (!battleId || stopped) return inFlight || Promise.resolve();
    if (inFlight) return inFlight;

    const url = lastLogId
      ? `/battle/state?battle_id=${encodeURIComponent(battleId)}&chat_id=${encodeURIComponent(playerId)}&last_log_id=${lastLogId}`
      : `/battle/state?battle_id=${encodeURIComponent(battleId)}&chat_id=${encodeURIComponent(playerId)}`;

    inFlight = api(url).then(data => {
      if (data?.logs?.length) lastLogId = data.logs[data.logs.length - 1].id;
      onStateChange?.(data);
    }).catch(err => {
      onError?.(err);
    }).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function setLastLogId(id) {
    if (id != null) lastLogId = id;
  }

  function closeStream() {
    if (!es) return;
    try { es.close(); } catch {}
    es = null;
  }

  function start() {
    if (!battleId || stopped) return;
    watchVisibility();
    closeStream();

    const token = getSessionToken();
    if (!token || typeof EventSource === 'undefined') {
      // No stream available at all — the battle must still progress, so fall
      // back to polling rather than going silent.
      scheduleReconnect('no stream transport');
      return;
    }

    const url = `/api/battle/stream?battle_id=${encodeURIComponent(battleId)}`
              + `&chat_id=${encodeURIComponent(playerId)}`
              + `&token=${encodeURIComponent(token)}`;

    try {
      es = new EventSource(url);
    } catch (err) {
      onError?.(err);
      scheduleReconnect('stream construct failed');
      return;
    }

    // The server's opening frame — proof the stream is live rather than sitting
    // in a proxy buffer. Every (re)connection begins by catching up: anything
    // that happened while it was down comes from this fetch, not from the stream.
    es.addEventListener('ready', () => {
      retries = 0;
      refreshFromServer();
    });

    es.addEventListener('battle', () => {
      refreshFromServer();
    });

    // The battle's room is full. Hang up for good and let polling carry it;
    // reconnecting would just be refused again.
    es.addEventListener('full', () => {
      closeStream();
      scheduleReconnect('stream room full');
    });

    es.onerror = () => {
      // EventSource retries on its own, but with no backoff we can control and
      // no catch-up. Take it over.
      closeStream();
      scheduleReconnect('stream error');
    };
  }

  function scheduleReconnect(reason) {
    if (stopped || retryTimer) return;
    // Fetch immediately as well: the state may already have moved on, and a
    // successful poll is what unfreezes the screen even if the stream stays bad.
    refreshFromServer();

    const delay = RETRY_MS[Math.min(retries, RETRY_MS.length - 1)];
    retries++;
    console.warn(`[realtime] ${reason} — reconnecting in ${delay}ms (attempt ${retries})`);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (stopped) return;
      start();
    }, delay);
  }

  // Coming back from the lock screen is the most common way to miss updates: the
  // stream died while backgrounded and no error fired for it. So on every return
  // to foreground, catch up and rebuild the stream if it is gone.
  function watchVisibility() {
    if (typeof document === 'undefined' || onVisible) return;
    onVisible = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      refreshFromServer();
      if (!es) scheduleReconnect('returned to foreground');
    };
    document.addEventListener('visibilitychange', onVisible);
  }

  function stop() {
    stopped = true;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (onVisible) {
      document.removeEventListener('visibilitychange', onVisible);
      onVisible = null;
    }
    closeStream();
  }

  return { start, stop, refresh: refreshFromServer, setLastLogId };
}