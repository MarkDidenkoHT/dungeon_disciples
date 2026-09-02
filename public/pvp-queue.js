import { api, getSessionToken } from './api.js';

// The client half of quick match. Same arrangement as createBattleRealtimeController
// in realtime.js: one SSE stream carries the nudge, and everything the client acts
// on comes back over plain HTTP.
//
// The stream is a convenience, not a requirement. In the Telegram webview a
// locked phone kills it, and a player waiting for an opponent is exactly the
// player most likely to lock their phone — so a poll runs alongside it, and the
// server keeps the queue entry regardless of whether the stream is up.
export function createQueueController({ playerId, mode = 'pvp_quick', onMatched, onEnded, onError }) {
  let es = null;
  let poll = null;
  let stopped = false;
  let settled = false;

  const POLL_MS = 4000;

  function done() {
    if (es) { try { es.close(); } catch {} es = null; }
    if (poll) { clearInterval(poll); poll = null; }
  }

  function settle(fn, ...args) {
    if (settled || stopped) return;
    settled = true;
    done();
    fn?.(...args);
  }

  function openStream() {
    const token = getSessionToken();
    if (!token || typeof EventSource === 'undefined') return;   // poll carries it
    try {
      es = new EventSource(
        `/api/pvp/stream?chat_id=${encodeURIComponent(playerId)}&token=${encodeURIComponent(token)}`);
    } catch {
      return;
    }
    es.addEventListener('pvp', e => {
      let data = null;
      try { data = JSON.parse(e.data); } catch { return; }
      if (data?.status === 'matched') settle(onMatched, data);
    });
    // A dead stream is not a dead queue — the poll below is still running, and
    // the server does not drop a player because their socket went quiet.
    es.onerror = () => { if (es) { try { es.close(); } catch {} es = null; } };
  }

  function startPolling() {
    poll = setInterval(async () => {
      if (stopped || settled) return;
      try {
        const data = await api(`/pvp/status?chat_id=${encodeURIComponent(playerId)}`);
        // The poll is the whole safety net when the stream is down, and it is
        // also what drives a matchmaking pass server-side — the power bands
        // widen with waiting, so a pair that was illegal on arrival becomes
        // legal purely through time, and somebody has to ask.
        if (data?.status === 'matched') { settle(onMatched, data); return; }
        // Neither waiting nor matched: cancelled elsewhere, or swept for age.
        if (data?.status !== 'waiting') settle(onEnded, data);
      } catch (err) {
        onError?.(err);
      }
    }, POLL_MS);
  }

  /**
   * Join the queue. `formation` is the same { playerUnitIds, placement } pair
   * POST /battle/create takes, so a matched player needs to send nothing more.
   * Resolves once the server has accepted the entry — a match found on the spot
   * arrives through onMatched, not through this promise.
   */
  async function start(formation, power = 0) {
    const data = await api('/pvp/enqueue', { chat_id: playerId, mode, formation, power });
    if (data?.status === 'matched') { settle(onMatched, data); return data; }
    openStream();
    startPolling();
    return data;
  }

  async function cancel() {
    if (stopped) return;
    stopped = true;
    done();
    try { await api('/pvp/leave', { chat_id: playerId }); } catch (err) { onError?.(err); }
  }

  // Leaving the screen without cancelling: the queue entry has to go, or the
  // player is matched into a battle they are no longer watching for.
  function stop() { stopped = true; done(); }

  return { start, cancel, stop };
}