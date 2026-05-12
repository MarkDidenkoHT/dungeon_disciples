const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const crypto = require('crypto');

const { UNITS, HERO_DATA } = require('../data/units');
const { REGIONS } = require('../data/embark');
const { BUILDING_POOLS, BUILD_TIMES_MS, SLOT_CATEGORIES, getBuildingDef, emptyStructures } = require('../data/buildings');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const STARTING_RESOURCES = [
  { item_type: 'resource', item: 'Gold',            amount: 200 },
  { item_type: 'resource', item: 'Trophies',        amount: 0   },
  { item_type: 'resource', item: 'Mana',            amount: 0   },
  { item_type: 'resource', item: 'Crystals_Life',   amount: 20  },
  { item_type: 'resource', item: 'Crystals_Fire',   amount: 20  },
  { item_type: 'resource', item: 'Crystals_Death',  amount: 20  },
  { item_type: 'resource', item: 'Crystals_Nature', amount: 20  },
  { item_type: 'resource', item: 'Crystals_Frost',  amount: 20  },
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
    const existing = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);

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

const HERO_STARTING_BARRACKS = {
  paladin:    { building_id: 'acolyte_shrine',    unit_id: 'acolyte'    },
  inquisitor: { building_id: 'conscript_barracks', unit_id: 'conscript'  },
  ranger:     { building_id: 'conscript_barracks', unit_id: 'conscript'  },
  warlord:    { building_id: 'heretic_pit',        unit_id: 'heretic'    },
  hexblade:   { building_id: 'heretic_pit',        unit_id: 'heretic'    },
  shadowbow:  { building_id: 'heretic_pit',        unit_id: 'heretic'    },
};

const DUNGEON_RANDOM_BARRACKS = [
  { building_id: 'heretic_pit',      unit_id: 'heretic'   },
  { building_id: 'possession_altar', unit_id: 'possessed' },
];

function getStartingBarracks(hero) {
  if (['warlord', 'hexblade', 'shadowbow'].includes(hero)) {
    return DUNGEON_RANDOM_BARRACKS[Math.floor(Math.random() * DUNGEON_RANDOM_BARRACKS.length)];
  }
  return HERO_STARTING_BARRACKS[hero] ?? null;
}

router.post('/player/faction', async (req, res) => {
  const { player_id, chat_id, faction, hero } = req.body;
  if (!player_id || !chat_id || !faction || !hero) {
    return res.status(400).json({ error: 'player_id, chat_id, faction, and hero required' });
  }

  const heroStats = HERO_DATA[hero];
  if (!heroStats) return res.status(400).json({ error: 'Unknown hero' });

  const startingBarracks = getStartingBarracks(hero);
  const structures = emptyStructures();

  if (startingBarracks) {
    structures['slot_4'] = { level: 1, ready_at: null, building_id: startingBarracks.building_id };
  }

  const unitId = startingBarracks?.unit_id;
  const unitData = unitId ? (UNITS.protectors?.[unitId] ?? UNITS.dungeon?.[unitId] ?? null) : null;

  try {
    const [updated] = await Promise.all([
      supabase(`/players?id=eq.${player_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ faction, hero }),
      }),
      supabase('/roster', {
        method: 'POST',
        body: JSON.stringify([
          {
            chat_id,
            unit_name: hero.charAt(0).toUpperCase() + hero.slice(1),
            unit_data: heroStats,
            experience: 0,
          },
          ...(unitData ? [{
            chat_id,
            unit_name: unitData.name,
            unit_data: unitData,
            experience: 0,
          }] : []),
        ]),
      }),
      supabase('/inventory_and_resources', {
        method: 'POST',
        body: JSON.stringify(STARTING_RESOURCES.map(r => ({ ...r, chat_id }))),
      }),
      supabase('/structures', {
        method: 'POST',
        body: JSON.stringify({ chat_id, buildings_data: structures }),
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
    const rows = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=*`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/buildings', (req, res) => {
  res.json({ pools: BUILDING_POOLS, slot_categories: SLOT_CATEGORIES });
});

router.get('/structures', async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });

  try {
    const rows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Structures not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/structures/build', async (req, res) => {
  const { chat_id, faction, slot, building_id } = req.body;
  if (!chat_id || !faction || !slot || !building_id) {
    return res.status(400).json({ error: 'chat_id, faction, slot, and building_id required' });
  }

  const slotCategory = SLOT_CATEGORIES[slot];
  if (!slotCategory) return res.status(400).json({ error: 'Invalid slot' });
  if (slotCategory === 'throne') return res.status(400).json({ error: 'Throne cannot be built' });

  const def = getBuildingDef(faction, building_id);
  if (!def) return res.status(400).json({ error: 'Unknown building_id for this faction' });

  if (slotCategory !== 'any' && def.category !== slotCategory) {
    return res.status(400).json({ error: `Slot ${slot} only accepts ${slotCategory} buildings` });
  }

  try {
    const rows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Structures not found' });

    const record = rows[0];
    const buildings = record.buildings_data;
    const current = buildings[slot];

    if (current.building_id && current.building_id !== building_id && current.level > 0) {
      return res.status(400).json({ error: 'Slot already has a building. Demolish it first.' });
    }

    if (current.ready_at && new Date(current.ready_at) > new Date()) {
      return res.status(400).json({ error: 'Building already under construction' });
    }

    const nextLevel = (current.level || 0) + 1;
    if (nextLevel > 4) return res.status(400).json({ error: 'Already at max level' });

    const ready_at = new Date(Date.now() + BUILD_TIMES_MS[nextLevel]).toISOString();

    buildings[slot] = { level: current.level || 0, ready_at, building_id };

    const updated = await supabase(`/structures?id=eq.${record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ buildings_data: buildings }),
    });

    res.json(updated[0]);
  } catch (err) {
    console.error('build error', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/structures/complete', async (req, res) => {
  const { chat_id, slot } = req.body;
  if (!chat_id || !slot) return res.status(400).json({ error: 'chat_id and slot required' });

  try {
    const rows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Structures not found' });

    const record = rows[0];
    const buildings = record.buildings_data;
    const current = buildings[slot];

    if (!current.ready_at || new Date(current.ready_at) > new Date()) {
      return res.status(400).json({ error: 'Building not ready yet' });
    }

    buildings[slot] = {
      level: (current.level || 0) + 1,
      ready_at: null,
      building_id: current.building_id,
    };

    const updated = await supabase(`/structures?id=eq.${record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ buildings_data: buildings }),
    });

    res.json(updated[0]);
  } catch (err) {
    console.error('complete error', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/regions', (req, res) => {
  res.json(REGIONS);
});

router.get('/progress', async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });
    res.json(rows[0].progress || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/progress/unlock', async (req, res) => {
  const { chat_id, region_id, level } = req.body;
  if (!chat_id || !region_id || level === undefined) return res.status(400).json({ error: 'chat_id, region_id, level required' });
  try {
    const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });
    const progress = rows[0].progress || {};
    progress[region_id] = level;
    const updated = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ progress }),
    });
    res.json(updated[0].progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;