const SUPABASE_URL = process.env.SUPABASE_URL.replace(/\/+$/, '');
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
    `/battle_state?battle_id=eq.${encodeURIComponent(battle_id)}&order=created_at.desc&limit=1`
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

// Atomically claim a finished battle for payout. This is closeBattleState with
// one crucial difference: the `battle_active=eq.true` filter makes the write
// itself the guard, so the database decides the winner of a race rather than the
// application.
//
// Postgres evaluates the WHERE and applies the UPDATE under one row lock, so of
// two concurrent callers exactly one gets a row back and the other gets [].
// `Prefer: return=representation` (see supabaseService) is what makes that
// visible to us — without it PostgREST answers 204 and the caller cannot tell
// whether it won.
//
// Reading `battle_active` and closing the battle later is NOT equivalent: every
// await between the read and the write is a window in which a second request
// passes the same check and pays the same reward out twice. A double-tap on the
// victory screen, or a client retry on a dropped connection, is enough.
async function claimBattleState(battle_id) {
  const claimed = await supabaseService(
    `/battle_state?battle_id=eq.${encodeURIComponent(battle_id)}&battle_active=eq.true`,
    {
      method: 'PATCH',
      body: JSON.stringify({ battle_active: false }),
    }
  );
  return claimed[0] || null;
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

async function appendBattleLogEntries(battle_id, events = []) {
  if (!battle_id || !Array.isArray(events) || !events.length) return [];
  const payload = events.map(event => ({ battle_id, event }));
  return supabaseService('/battle_log', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function getBattleLogs(battle_id) {
  if (!battle_id) return [];
  const rows = await supabaseService(`/battle_log?battle_id=eq.${encodeURIComponent(battle_id)}&order=id.asc`);
  return (rows || []).map(row => ({ id: row.id, ...row.event })).filter(Boolean);
}

async function getBattleLogsSince(battle_id, last_log_id) {
  if (!battle_id) return [];
  const filter = last_log_id
    ? `/battle_log?battle_id=eq.${encodeURIComponent(battle_id)}&id=gt.${last_log_id}&order=id.asc`
    : `/battle_log?battle_id=eq.${encodeURIComponent(battle_id)}&order=id.asc`;
  const rows = await supabaseService(filter);
  return (rows || []).map(row => ({ id: row.id, ...row.event })).filter(Boolean);
}

module.exports = {
  getActiveBattle,
  getBattleState,
  createBattleState,
  updateBattleState,
  claimBattleState,
  closeBattleState,
  appendBattleLogEntries,
  getBattleLogs,
  getBattleLogsSince,
};