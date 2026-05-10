const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const HERO_DATA = {
  warlord: {
    hp: 120, armor: 8, initiative: 4,
    resist_fire: 2, resist_ice: 2, resist_lightning: 2, resist_dark: 5, resist_holy: 2,
    action: { value: 14, range: 1, target_type: 'enemy', target_amount: 'single' },
    passive_ability: null,
    active_ability: null,
  },
  hexblade: {
    hp: 70, armor: 2, initiative: 6,
    resist_fire: 4, resist_ice: 4, resist_lightning: 4, resist_dark: 10, resist_holy: 2,
    action: { value: 18, range: 2, target_type: 'enemy', target_amount: 'single' },
    passive_ability: null,
    active_ability: null,
  },
  shadowbow: {
    hp: 80, armor: 3, initiative: 10,
    resist_fire: 3, resist_ice: 3, resist_lightning: 3, resist_dark: 6, resist_holy: 2,
    action: { value: 16, range: 3, target_type: 'enemy', target_amount: 'single' },
    passive_ability: null,
    active_ability: null,
  },
  paladin: {
    hp: 115, armor: 9, initiative: 4,
    resist_fire: 3, resist_ice: 3, resist_lightning: 3, resist_dark: 3, resist_holy: 10,
    action: { value: 12, range: 1, target_type: 'enemy', target_amount: 'single' },
    passive_ability: null,
    active_ability: null,
  },
  inquisitor: {
    hp: 72, armor: 2, initiative: 7,
    resist_fire: 4, resist_ice: 4, resist_lightning: 4, resist_dark: 4, resist_holy: 10,
    action: { value: 17, range: 2, target_type: 'enemy', target_amount: 'single' },
    passive_ability: null,
    active_ability: null,
  },
  ranger: {
    hp: 82, armor: 3, initiative: 11,
    resist_fire: 4, resist_ice: 4, resist_lightning: 4, resist_dark: 3, resist_holy: 4,
    action: { value: 15, range: 3, target_type: 'enemy', target_amount: 'single' },
    passive_ability: null,
    active_ability: null,
  },
};

const STARTING_RESOURCES = [
  { item_type: 'resource', item: 'Gold',  amount: 200 },
  { item_type: 'resource', item: 'Wood',  amount: 100 },
  { item_type: 'resource', item: 'Stone', amount: 50  },
];

function supabase(path, options = {}) {
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

function validateTelegramInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (expectedHash !== hash) return null;

  const authDate = parseInt(params.get('auth_date'), 10);
  if (Date.now() / 1000 - authDate > 86400) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;

  return JSON.parse(userRaw);
}

router.post('/login', async (req, res) => {
  const { initData } = req.body;
  if (!initData) return res.status(400).json({ error: 'initData required' });

  const telegramUser = validateTelegramInitData(initData);
  if (!telegramUser) return res.status(401).json({ error: 'Invalid Telegram auth' });

  const chat_id = String(telegramUser.id);

  try {
    const existing = await supabase(
      `/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`
    );

    if (existing.length > 0) {
      return res.json({ player: existing[0], isNew: false });
    }

    const created = await supabase('/players', {
      method: 'POST',
      body: JSON.stringify({
        chat_id,
        username: telegramUser.username || null,
        first_name: telegramUser.first_name || null,
      }),
    });

    res.json({ player: created[0], isNew: true });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/player', async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });

  try {
    const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/player/faction', async (req, res) => {
  const { player_id, chat_id, faction, hero } = req.body;
  if (!player_id || !chat_id || !faction || !hero) {
    return res.status(400).json({ error: 'player_id, chat_id, faction, and hero required' });
  }

  const heroStats = HERO_DATA[hero];
  if (!heroStats) return res.status(400).json({ error: 'Unknown hero' });

  try {
    const [updated] = await Promise.all([
      supabase(`/players?id=eq.${player_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ faction, hero }),
      }),
      supabase('/roster', {
        method: 'POST',
        body: JSON.stringify({
          chat_id,
          unit_name: hero.charAt(0).toUpperCase() + hero.slice(1),
          unit_data: heroStats,
          experience: 0,
        }),
      }),
      supabase('/inventory_and_resources', {
        method: 'POST',
        body: JSON.stringify(STARTING_RESOURCES.map(r => ({ ...r, chat_id }))),
      }),
    ]);

    res.json({ player: updated[0] });
  } catch (err) {
    console.error('faction error', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/inventory', async (req, res) => {
  const { chat_id, type } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });

  try {
    let url = `/inventory_and_resources?chat_id=eq.${encodeURIComponent(chat_id)}`;
    if (type) url += `&item_type=eq.${encodeURIComponent(type)}`;
    const rows = await supabase(url);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/roster', async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });

  try {
    const rows = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;