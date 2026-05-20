const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function supabaseAnon(path, options = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {}),
    },
  }).then(async r => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || JSON.stringify(data));
    return data;
  });
}

async function getBattleState(battle_id) {
  const rows = await supabaseAnon(
    `/battle_state?battle_id=eq.${encodeURIComponent(battle_id)}&battle_active=eq.true&limit=1`
  );
  return rows[0] || null;
}

async function upsertBattleState({ chat_id, battle_id, battle_data, battle_active = true }) {
  const existing = await supabaseAnon(
    `/battle_state?battle_id=eq.${encodeURIComponent(battle_id)}&limit=1`
  );

  if (existing.length > 0) {
    const updated = await supabaseAnon(
      `/battle_state?id=eq.${existing[0].id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ battle_data, battle_active }),
      }
    );
    return updated[0];
  }

  const created = await supabaseAnon('/battle_state', {
    method: 'POST',
    body: JSON.stringify({ chat_id, battle_id, battle_data, battle_active }),
  });
  return created[0];
}

async function closeBattleState(battle_id) {
  const updated = await supabaseAnon(
    `/battle_state?battle_id=eq.${encodeURIComponent(battle_id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ battle_active: false }),
    }
  );
  return updated[0] || null;
}

module.exports = { getBattleState, upsertBattleState, closeBattleState };
