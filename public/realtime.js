import { api } from './api.js';

function isSupabaseAvailable() {
  return typeof window !== 'undefined' && !!window.supabase?.createClient;
}

function normalizeSupabaseUrl(url) {
  if (!url) return null;
  return String(url).replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

export function createBattleRealtimeController({ battleId, playerId, onStateChange, onError }) {
  let channel = null;
  let stopped = false;
  let lastLogId = null;
  let retries = 0;
  let retryTimer = null;
  let onVisible = null;

  // A websocket in a Telegram webview does not survive being backgrounded — the
  // phone locks, the socket dies, and the old controller set `stopped = true` on
  // CHANNEL_ERROR and never tried again. The battle then never updated: no
  // reconnect, no polling, nothing but a reload. This is that safety net.
  const RETRY_MS = [1000, 2000, 5000, 10000, 20000];   // then hold at 20s

  async function refreshFromServer() {
    if (!battleId || stopped) return;
    try {
      const url = lastLogId
        ? `/battle/state?battle_id=${encodeURIComponent(battleId)}&chat_id=${encodeURIComponent(playerId)}&last_log_id=${lastLogId}`
        : `/battle/state?battle_id=${encodeURIComponent(battleId)}&chat_id=${encodeURIComponent(playerId)}`;
      const data = await api(url);
      if (data?.logs?.length) {
        lastLogId = data.logs[data.logs.length - 1].id;
      }
      onStateChange?.(data);
    } catch (err) {
      onError?.(err);
    }
  }

  function setLastLogId(id) {
    if (id != null) lastLogId = id;
  }

  async function start() {
    if (!battleId || stopped) return;
    watchVisibility();

    try {
      const cfg = await api(`/battle/realtime-config?chat_id=${encodeURIComponent(playerId)}`);
      const url = normalizeSupabaseUrl(cfg?.url);
      const anonKey = cfg?.anonKey;

      if (!(url && anonKey && isSupabaseAvailable())) {
        // No socket at all — but the battle must still progress. Fall back to
        // polling rather than going silent, which is what happened before.
        onError?.(new Error('Realtime unavailable: missing config or Supabase client'));
        scheduleReconnect('no realtime transport');
        return;
      }

      const supabase = window.supabase.createClient(url, anonKey, { auth: { persistSession: false } });
      channel = supabase.channel(`battle:${battleId}`, {
        config: { broadcast: { self: false } },
      });

      channel.on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'battle_state',
        filter: `battle_id=eq.${battleId}`,
      }, () => {
        refreshFromServer();
      });

      channel.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'battle_log',
        filter: `battle_id=eq.${battleId}`,
      }, () => {
        refreshFromServer();
      });

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Every (re)connection begins by catching up. Anything that happened
          // while the socket was down is delivered by this, not by the socket.
          retries = 0;
          refreshFromServer();
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          scheduleReconnect(status);
        }
      });
    } catch (err) {
      onError?.(err);
      scheduleReconnect('start failed');
    }
  }

  // Tears the dead channel down and comes back, backing off so a server that is
  // properly down is not hammered. `stopped` is only ever set by stop() now —
  // an error is a setback, not the end.
  function scheduleReconnect(reason) {
    if (stopped || retryTimer) return;
    // Fetch immediately as well: the state may already have moved on, and a
    // successful poll is what unfreezes the screen even if the socket stays bad.
    refreshFromServer();

    const delay = RETRY_MS[Math.min(retries, RETRY_MS.length - 1)];
    retries++;
    console.warn(`[realtime] ${reason} — reconnecting in ${delay}ms (attempt ${retries})`);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (stopped) return;
      if (channel) { try { channel.unsubscribe(); } catch {} channel = null; }
      start();
    }, delay);
  }

  // Coming back from the lock screen is the single most common way to miss
  // updates: the socket died quietly while the app was backgrounded, and no
  // status callback fires for it. So on every return to foreground, catch up
  // from the server and rebuild the channel if it is gone.
  function watchVisibility() {
    if (typeof document === 'undefined' || onVisible) return;
    onVisible = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      refreshFromServer();
      if (!channel) scheduleReconnect('returned to foreground');
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
    if (channel) {
      try { channel.unsubscribe(); } catch {}
      channel = null;
    }
  }

  return { start, stop, refresh: refreshFromServer, setLastLogId };
}