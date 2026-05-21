const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function supabaseService(path, options = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
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

async function getActiveBattle(chat_id) {
  const rows = await supabaseService(
    `/battle_state?chat_id=eq.${encodeURIComponent(chat_id)}&battle_active=eq.true&order=created_at.desc&limit=1`
  );
  return rows[0] || null;
}

async function getBattleState(battle_id) {
  const rows = await supabaseService(
    `/battle_state?battle_id=eq.${encodeURIComponent(battle_id)}&battle_active=eq.true&limit=1`
  );
  return rows[0] || null;
}

async function createBattleState({ chat_id, battle_id, battle_data }) {
  const created = await supabaseService('/battle_state', {
    method: 'POST',
    body: JSON.stringify({ chat_id, battle_id, battle_data, battle_active: true }),
  });
  return created[0];
}

async function updateBattleState(battle_id, battle_data) {
  const updated = await supabaseService(
    `/battle_state?battle_id=eq.${encodeURIComponent(battle_id)}&battle_active=eq.true`,
    {
      method: 'PATCH',
      body: JSON.stringify({ battle_data }),
    }
  );
  return updated[0] || null;
}

async function closeBattleState(battle_id) {
  const updated = await supabaseService(
    `/battle_state?battle_id=eq.${encodeURIComponent(battle_id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ battle_active: false }),
    }
  );
  return updated[0] || null;
}

module.exports = { getActiveBattle, getBattleState, createBattleState, updateBattleState, closeBattleState };