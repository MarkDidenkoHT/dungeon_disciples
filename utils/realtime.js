const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let ws = null;
let heartbeatInterval = null;
let subscriptions = {};
let reconnectTimeout = null;
let connected = false;
let messageRef = 0;

function nextRef() {
  return String(++messageRef);
}

function getWsUrl() {
  const base = SUPABASE_URL.replace(/^https?/, 'wss');
  return `${base}/realtime/v1/websocket?apikey=${SUPABASE_SERVICE_KEY}&vsn=1.0.0`;
}

function connect() {
  if (ws) return;

  ws = new (require('ws'))(getWsUrl(), {
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });

  ws.on('open', () => {
    connected = true;
    heartbeatInterval = setInterval(() => {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() }));
      }
    }, 20000);

    for (const topic of Object.keys(subscriptions)) {
      sendSubscribe(topic);
    }
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const { topic, event, payload } = msg;

    if (event === 'phx_reply' && payload?.status === 'ok') return;
    if (event === 'heartbeat') return;

    const handlers = subscriptions[topic];
    if (!handlers) return;

    if (event === 'INSERT' || event === 'UPDATE' || event === 'DELETE') {
      handlers.forEach(fn => fn(event, payload?.record, payload?.old_record));
    }
  });

  ws.on('close', () => {
    connected = false;
    ws = null;
    clearInterval(heartbeatInterval);
    reconnectTimeout = setTimeout(connect, 3000);
  });

  ws.on('error', () => {
    ws?.terminate();
  });
}

function sendSubscribe(topic) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({
    topic,
    event: 'phx_join',
    payload: { config: { broadcast: { self: false }, presence: { key: '' } } },
    ref: nextRef(),
  }));
}

function subscribe(table, filter, handler) {
  const topic = `realtime:public:${table}${filter ? `:${filter}` : ''}`;

  if (!subscriptions[topic]) {
    subscriptions[topic] = [];
    if (connected) sendSubscribe(topic);
  }
  subscriptions[topic].push(handler);

  if (!ws) connect();

  return () => {
    subscriptions[topic] = subscriptions[topic].filter(fn => fn !== handler);
    if (subscriptions[topic].length === 0) {
      delete subscriptions[topic];
    }
  };
}

module.exports = { subscribe, connect };