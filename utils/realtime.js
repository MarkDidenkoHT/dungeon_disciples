const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let ws = null;
let heartbeatInterval = null;
let reconnectTimeout = null;
let connected = false;
let messageRef = 0;

let sseClients = null;

function registerSseMap(map) {
  sseClients = map;
}

function nextRef() {
  return String(++messageRef);
}

function getWsUrl() {
  const base = SUPABASE_URL.replace(/^https?/, 'wss');
  return `${base}/realtime/v1/websocket?apikey=${SUPABASE_SERVICE_KEY}&vsn=1.0.0`;
}

function pushToClients(chat_id, event, record) {
  if (!sseClients) return;
  const clients = sseClients.get(String(chat_id));
  if (!clients || clients.size === 0) return;

  const payload = JSON.stringify({ event, record });
  for (const res of clients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (e) {
      clients.delete(res);
    }
  }
}

function subscribeToTable() {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({
    topic: 'realtime:public:battle_state',
    event: 'phx_join',
    payload: {
      config: {
        broadcast: { self: false },
        presence: { key: '' },
        postgres_changes: [{ event: '*', schema: 'public', table: 'battle_state' }],
      },
    },
    ref: nextRef(),
  }));
}

function connect() {
  if (ws) return;

  ws = new (require('ws'))(getWsUrl(), {
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });

  ws.on('open', () => {
    connected = true;
    console.log('[realtime] Connected to Supabase');

    heartbeatInterval = setInterval(() => {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          topic: 'phoenix',
          event: 'heartbeat',
          payload: {},
          ref: nextRef(),
        }));
      }
    }, 20000);

    subscribeToTable();
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const { event, payload } = msg;

    if (event === 'phx_reply' || event === 'heartbeat' || event === 'phx_error') return;

    if (event === 'postgres_changes') {
      const change = payload?.data;
      if (!change) return;
      const record = change.record || change.new;
      if (!record?.chat_id) return;
      pushToClients(record.chat_id, change.type, record);
      return;
    }

    if (event === 'INSERT' || event === 'UPDATE' || event === 'DELETE') {
      const record = payload?.record;
      if (!record?.chat_id) return;
      pushToClients(record.chat_id, event, record);
    }
  });

  ws.on('close', (code, reason) => {
    connected = false;
    ws = null;
    clearInterval(heartbeatInterval);
    console.log(`[realtime] Disconnected (${code}), reconnecting in 3s…`);
    reconnectTimeout = setTimeout(connect, 3000);
  });

  ws.on('error', (err) => {
    console.error('[realtime] WS error:', err.message);
    ws?.terminate();
  });
}

module.exports = { connect, registerSseMap };