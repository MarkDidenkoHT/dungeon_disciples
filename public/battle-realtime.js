const SUPABASE_URL = window.__SUPABASE_URL__ || '';
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || '';

let realtimeSocket = null;
let realtimeRef = 0;
let heartbeatTimer = null;
const battleSubscriptions = {};

function nextRef() {
  return String(++realtimeRef);
}

function getRealtimeUrl() {
  const base = SUPABASE_URL.replace(/^https?/, 'wss');
  return `${base}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;
}

function ensureRealtimeConnected() {
  if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) return;
  if (realtimeSocket && realtimeSocket.readyState === WebSocket.CONNECTING) return;

  realtimeSocket = new WebSocket(getRealtimeUrl());

  realtimeSocket.addEventListener('open', () => {
    heartbeatTimer = setInterval(() => {
      if (realtimeSocket.readyState === WebSocket.OPEN) {
        realtimeSocket.send(JSON.stringify({
          topic: 'phoenix',
          event: 'heartbeat',
          payload: {},
          ref: nextRef(),
        }));
      }
    }, 20000);

    for (const topic of Object.keys(battleSubscriptions)) {
      sendJoin(topic);
    }
  });

  realtimeSocket.addEventListener('message', (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    const { topic, event, payload } = msg;
    if (!topic || event === 'phx_reply' || event === 'heartbeat') return;

    const handlers = battleSubscriptions[topic];
    if (!handlers || !handlers.length) return;

    if (event === 'UPDATE' || event === 'INSERT' || event === 'DELETE') {
      handlers.forEach(fn => fn(event, payload?.record, payload?.old_record));
    }
  });

  realtimeSocket.addEventListener('close', () => {
    clearInterval(heartbeatTimer);
    realtimeSocket = null;
    setTimeout(ensureRealtimeConnected, 3000);
  });

  realtimeSocket.addEventListener('error', () => {
    realtimeSocket?.close();
  });
}

function sendJoin(topic) {
  if (!realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) return;
  realtimeSocket.send(JSON.stringify({
    topic,
    event: 'phx_join',
    payload: { config: { broadcast: { self: false }, presence: { key: '' } } },
    ref: nextRef(),
  }));
}

export function subscribeToBattle(chatId, battleId, onUpdate) {
  const topic = `realtime:public:battle_state:chat_id=eq.${chatId}`;

  if (!battleSubscriptions[topic]) {
    battleSubscriptions[topic] = [];
  }

  const handler = (event, record) => {
    if (!record) return;
    if (battleId && record.battle_id !== battleId) return;
    onUpdate(event, record);
  };

  battleSubscriptions[topic].push(handler);
  ensureRealtimeConnected();

  if (realtimeSocket?.readyState === WebSocket.OPEN) {
    sendJoin(topic);
  }

  return () => {
    battleSubscriptions[topic] = battleSubscriptions[topic].filter(fn => fn !== handler);
    if (battleSubscriptions[topic].length === 0) {
      delete battleSubscriptions[topic];
    }
  };
}

export function disconnectRealtime() {
  clearInterval(heartbeatTimer);
  if (realtimeSocket) {
    realtimeSocket.close();
    realtimeSocket = null;
  }
}