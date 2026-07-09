import { api } from './api.js';

function isSupabaseAvailable() {
  return typeof window !== 'undefined' && !!window.supabase?.createClient;
}

export function createBattleRealtimeController({ battleId, playerId, onStateChange, onError }) {
  let channel = null;
  let pollTimer = null;
  let stopped = false;

  async function refreshFromServer() {
    if (!battleId || stopped) return;
    try {
      const data = await api(`/battle/state?battle_id=${encodeURIComponent(battleId)}&chat_id=${encodeURIComponent(playerId)}`);
      onStateChange?.(data);
    } catch (err) {
      onError?.(err);
    }
  }

  async function start() {
    if (!battleId || stopped) return;

    try {
      const cfg = await api('/battle/realtime-config');
      const url = cfg?.url;
      const anonKey = cfg?.anonKey;

      if (url && anonKey && isSupabaseAvailable()) {
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
            refreshFromServer();
            return;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            startPolling();
          }
        });
        return;
      }
    } catch (err) {
      onError?.(err);
    }

    startPolling();
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    refreshFromServer();
    pollTimer = window.setInterval(() => {
      refreshFromServer();
    }, 2000);
  }

  function stop() {
    stopped = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (channel) {
      try { channel.unsubscribe(); } catch {}
      channel = null;
    }
  }

  return { start, stop, refresh: refreshFromServer };
}
