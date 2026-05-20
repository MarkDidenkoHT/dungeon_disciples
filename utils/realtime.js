const { createClient } = require('@supabase/supabase-js');

let sseClients = null;

function registerSseMap(map) {
  sseClients = map;
}

function pushToClients(chat_id, event, record) {
  if (!sseClients) return;
  const clients = sseClients.get(String(chat_id));
  if (!clients || clients.size === 0) return;
  const payload = JSON.stringify({ event, record });
  for (const res of clients) {
    try { res.write(`data: ${payload}\n\n`); }
    catch { clients.delete(res); }
  }
}

function connect() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  supabase
    .channel('battle_state_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'battle_state' }, (payload) => {
      const record = payload.new || payload.old;
      if (!record?.chat_id) return;
      pushToClients(record.chat_id, payload.eventType, record);
    })
    .subscribe((status) => {
      console.log('[realtime] Supabase channel status:', status);
    });
}

module.exports = { connect, registerSseMap };
