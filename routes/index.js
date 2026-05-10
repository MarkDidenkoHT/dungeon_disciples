const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function supabase(path, options = {}) {
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

router.post('/login', async (req, res) => {
  const { chat_id } = req.body;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });

  try {
    const existing = await supabase(
      `/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`
    );

    if (existing.length > 0) {
      return res.json({ player: existing[0], isNew: false });
    }

    const created = await supabase('/players', {
      method: 'POST',
      body: JSON.stringify({ chat_id }),
    });

    res.json({ player: created[0], isNew: true });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/player/faction', async (req, res) => {
  const { player_id, faction, hero } = req.body;
  if (!player_id || !faction || !hero) {
    return res.status(400).json({ error: 'player_id, faction, and hero required' });
  }

  try {
    const updated = await supabase(
      `/players?id=eq.${player_id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ faction, hero }),
      }
    );
    res.json({ player: updated[0] });
  } catch (err) {
    console.error('faction error', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;