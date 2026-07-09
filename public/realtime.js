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
      const cfg = await api(`/battle/realtime-config?chat_id=${encodeURIComponent(playerId)}`);
      const url = normalizeSupabaseUrl(cfg?.url);
      const anonKey = cfg?.anonKey;

      if (!(url && anonKey && isSupabaseAvailable())) {
        onError?.(new Error('Realtime unavailable: missing config or Supabase client'));
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
          refreshFromServer();
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onError?.(new Error(`Realtime channel status: ${status}`));
          stopped = true;
        }
      });
    } catch (err) {
      onError?.(err);
    }
  }

  function stop() {
    stopped = true;
    if (channel) {
      try { channel.unsubscribe(); } catch {}
      channel = null;
    }
  }

  return { start, stop, refresh: refreshFromServer };
}
