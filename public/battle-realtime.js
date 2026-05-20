let eventSource = null;
const battleHandlers = new Map();

export function subscribeToBattle(chatId, battleId, onUpdate) {
  if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
    _connect(chatId);
  }

  const handler = { battleId, onUpdate };
  if (!battleHandlers.has(chatId)) battleHandlers.set(chatId, new Set());
  battleHandlers.get(chatId).add(handler);

  return () => {
    battleHandlers.get(chatId)?.delete(handler);
    if (battleHandlers.get(chatId)?.size === 0) {
      battleHandlers.delete(chatId);
      _maybeDisconnect();
    }
  };
}

function _connect(chatId) {
  if (eventSource) eventSource.close();

  eventSource = new EventSource(`/api/battle/events?chat_id=${encodeURIComponent(chatId)}`);

  eventSource.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    const { event, record } = msg;
    if (!record) return;

    for (const [cid, handlers] of battleHandlers) {
      if (String(record.chat_id) !== String(cid)) continue;
      for (const h of handlers) {
        if (h.battleId && record.battle_id !== h.battleId) continue;
        h.onUpdate(event, record);
      }
    }
  };

  eventSource.onerror = () => {
    console.warn('[battle-realtime] SSE error, browser will retry');
  };
}

function _maybeDisconnect() {
  if (battleHandlers.size === 0 && eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

export function disconnectRealtime() {
  battleHandlers.clear();
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}