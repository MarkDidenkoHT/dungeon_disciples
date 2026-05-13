const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const crypto = require('crypto');

const { UNITS, HERO_DATA } = require('../data/units');
const { REGIONS } = require('../data/embark');
const { BUILDING_POOLS, BUILD_TIMES_MS, SLOT_CATEGORIES, UNIT_UPGRADE_PATHS, HERO_LEVEL_DATA, HERO_MAX_LEVEL, THRONE_UPGRADE_COSTS, getBuildingDef, emptyStructures, computeHeroStats } = require('../data/buildings');

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

function getUnitByDataId(faction, unitDataId) {
  const pool = UNITS[faction] || {};
  return Object.values(pool).find(u => u.id === unitDataId) || null;
}

function findUpgradeTarget(faction, currentUnitDataId, targetUnitDataId) {
  const factionPaths = UNIT_UPGRADE_PATHS[faction] || {};
  const paths = factionPaths[currentUnitDataId];
  if (!paths) return null;
  return paths.find(p => p.unit_id === targetUnitDataId) || null;
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

function getStartingBarracks(faction, hero) {
  const mapping = {
    empire: {
      paladin:    { building_id: 'acolyte_shrine',     unit_id: 'acolyte',    slot: 'slot_4' },
      inquisitor: { building_id: 'conscript_barracks', unit_id: 'conscript',  slot: 'slot_4' },
      ranger:     { building_id: 'conscript_barracks', unit_id: 'conscript',  slot: 'slot_4' },
    },
    dungeon: {
      warlord:    { building_id: 'heretic_pit',        unit_id: 'heretic',    slot: 'slot_4' },
      hexblade:   { building_id: 'heretic_pit',        unit_id: 'heretic',    slot: 'slot_4' },
      shadowbow:  { building_id: 'heretic_pit',        unit_id: 'heretic',    slot: 'slot_4' },
    },
  };

  return mapping[faction]?.[hero] || null;
}

router.post('/player/faction', async (req, res) => {
  const { player_id, chat_id, faction, hero } = req.body;
  if (!player_id || !chat_id || !faction || !hero) {
    return res.status(400).json({ error: 'player_id, chat_id, faction, and hero required' });
  }

  const heroStats = HERO_DATA[hero];
  if (!heroStats) return res.status(400).json({ error: 'Unknown hero' });

  const startingBarracks = getStartingBarracks(faction, hero);
  const structures = emptyStructures();

  if (startingBarracks) {
    structures[startingBarracks.slot] = { level: 1, ready_at: null, building_id: startingBarracks.building_id };
  }

  const unitId   = startingBarracks?.unit_id;
  const unitSlot = startingBarracks?.slot;
  const unitData = unitId ? UNITS[faction]?.[unitId] : null;

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
            unit_data: { ...unitData, building_slot: unitSlot },
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
    const rows = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_name,unit_data,experience,char_gender`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/roster/levelup', async (req, res) => {
  const { chat_id, roster_id } = req.body;
  if (!chat_id || !roster_id) {
    return res.status(400).json({ error: 'chat_id and roster_id required' });
  }

  try {
    const rows = await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_name,unit_data,experience,char_gender`);
    if (!rows.length) return res.status(404).json({ error: 'Roster entry not found' });

    const entry    = rows[0];
    const unitData = entry.unit_data || {};
    const faction  = unitData.f === 'e' ? 'empire' : 'dungeon';
    const currentId = unitData.id;

    if (!currentId) return res.status(400).json({ error: 'Unit has no id in unit_data' });
    if (unitData.t >= 2) return res.status(400).json({ error: 'Unit is already at max tier' });

    const xpRequired = unitData.xp;
    if (xpRequired == null) return res.status(400).json({ error: 'Unit has no xp threshold defined' });
    if (entry.experience < xpRequired) {
      return res.status(400).json({ error: `Not enough XP. Need ${xpRequired}, have ${entry.experience}` });
    }

    const factionPaths = UNIT_UPGRADE_PATHS[faction] || {};
    const paths = factionPaths[currentId];
    if (!paths || paths.length === 0) {
      return res.status(400).json({ error: 'No upgrade paths defined for this unit' });
    }

    let path = null;

    const buildingSlot = unitData.building_slot || null;

    if (paths.length === 1) {
      // Single upgrade path — no building choice needed, always valid
      path = paths[0];
    } else {
      // Multiple upgrade paths — must have the correct upgrade building already built in the slot
      if (!buildingSlot) {
        return res.status(400).json({ error: 'Unit has no building slot assigned; cannot determine upgrade path' });
      }
      const structRowsCheck = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
      if (!structRowsCheck.length) {
        return res.status(400).json({ error: 'No structures record found' });
      }
      const currentBuildingId = structRowsCheck[0].buildings_data[buildingSlot]?.building_id;
      const matched = paths.find(p => p.building_id === currentBuildingId);
      if (!matched) {
        const required = paths.map(p => p.label).join(' or ');
        return res.status(400).json({ error: `Build ${required} first to choose an upgrade path` });
      }
      path = matched;
    }
    const nextUnitDef = getUnitByDataId(faction, path.unit_id);
    if (!nextUnitDef) return res.status(400).json({ error: `Target unit ${path.unit_id} not found` });
    const newUnitData  = { ...nextUnitDef, building_slot: buildingSlot };

    const updatePromises = [
      supabase(`/roster?id=eq.${roster_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          unit_name: nextUnitDef.name,
          unit_data: newUnitData,
        }),
      }),
    ];

    if (buildingSlot) {
      const structRows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
      if (structRows.length) {
        const structRecord = structRows[0];
        const buildings    = structRecord.buildings_data;
        const slotState    = buildings[buildingSlot];
        if (slotState) {
          const upgradedBuildingId = path.building_id;
          buildings[buildingSlot] = { ...slotState, building_id: upgradedBuildingId };
          updatePromises.push(
            supabase(`/structures?id=eq.${structRecord.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ buildings_data: buildings }),
            })
          );
        }
      }
    }

    await Promise.all(updatePromises);

    const updated = await supabase(`/roster?id=eq.${roster_id}&select=id,chat_id,unit_name,unit_data,experience,char_gender`);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upgrade the throne (slot_0) to the next level.
// This does NOT auto-level the hero — it just unlocks the ability to do so.
router.post('/structures/throne/upgrade', async (req, res) => {
  const { chat_id } = req.body;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });

  try {
    const rows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Structures not found' });

    const record    = rows[0];
    const buildings = record.buildings_data;
    const throne    = buildings['slot_0'] || { level: 1, ready_at: null, building_id: null };
    const nextLevel = (throne.level || 1) + 1;

    if (nextLevel > HERO_MAX_LEVEL) {
      return res.status(400).json({ error: 'Throne is already at max level' });
    }

    const cost = THRONE_UPGRADE_COSTS[nextLevel];
    if (!cost) return res.status(400).json({ error: 'No cost defined for that level' });

    // Deduct resources if cost > 0 (gold, mana)
    if (cost.gold > 0 || cost.mana > 0) {
      const inventory = await supabase(`/inventory_and_resources?chat_id=eq.${encodeURIComponent(chat_id)}`);
      const goldRow   = inventory.find(r => r.item === 'Gold');
      const manaRow   = inventory.find(r => r.item === 'Mana');

      if (!goldRow || goldRow.amount < cost.gold) {
        return res.status(400).json({ error: `Not enough Gold. Need ${cost.gold}` });
      }
      if (!manaRow || manaRow.amount < cost.mana) {
        return res.status(400).json({ error: `Not enough Mana. Need ${cost.mana}` });
      }

      const deductions = [];
      if (cost.gold > 0) {
        deductions.push(supabase(`/inventory_and_resources?id=eq.${goldRow.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ amount: goldRow.amount - cost.gold }),
        }));
      }
      if (cost.mana > 0) {
        deductions.push(supabase(`/inventory_and_resources?id=eq.${manaRow.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ amount: manaRow.amount - cost.mana }),
        }));
      }
      await Promise.all(deductions);
    }

    buildings['slot_0'] = { ...throne, level: nextLevel };

    const updated = await supabase(`/structures?id=eq.${record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ buildings_data: buildings }),
    });

    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Level up the hero. Requires:
//   - The hero's current hero_level < throne level
//   - hero_level < HERO_MAX_LEVEL
// Applies cumulative stat deltas for the new level and saves to roster.
router.post('/roster/hero-levelup', async (req, res) => {
  const { chat_id, roster_id } = req.body;
  if (!chat_id || !roster_id) {
    return res.status(400).json({ error: 'chat_id and roster_id required' });
  }

  try {
    const [rosterRows, structRows] = await Promise.all([
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_name,unit_data,experience,char_gender`),
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
    ]);

    if (!rosterRows.length) return res.status(404).json({ error: 'Roster entry not found' });
    if (!structRows.length)  return res.status(404).json({ error: 'Structures not found' });

    const entry    = rosterRows[0];
    const unitData = entry.unit_data || {};

    // Confirm this is a hero (heroes have no 't' tier field)
    if (unitData.t !== undefined && unitData.t !== null) {
      return res.status(400).json({ error: 'This unit is not a hero' });
    }

    const heroKey     = entry.unit_name.toLowerCase();
    const heroLevel   = unitData.hero_level || 1;
    const throneLevel = structRows[0].buildings_data['slot_0']?.level || 1;

    if (heroLevel >= HERO_MAX_LEVEL) {
      return res.status(400).json({ error: 'Hero is already at max level' });
    }
    if (heroLevel >= throneLevel) {
      return res.status(400).json({ error: `Upgrade your Throne to level ${heroLevel + 1} first` });
    }

    const nextLevel = heroLevel + 1;
    const delta     = (HERO_LEVEL_DATA[heroKey] || {})[nextLevel];
    if (!delta) {
      return res.status(400).json({ error: `No level data for ${heroKey} level ${nextLevel}` });
    }

    // Apply the stat delta for the next level
    const newUnitData = { ...unitData, hero_level: nextLevel };
    for (const [stat, val] of Object.entries(delta)) {
      if (newUnitData[stat] !== undefined) newUnitData[stat] += val;
    }

    const updated = await supabase(`/roster?id=eq.${roster_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ unit_data: newUnitData }),
    });

    const fresh = await supabase(`/roster?id=eq.${roster_id}&select=id,chat_id,unit_name,unit_data,experience,char_gender`);
    res.json(fresh[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/buildings', (req, res) => {
  res.json({
    pools: BUILDING_POOLS,
    slot_categories: SLOT_CATEGORIES,
    upgrade_paths: UNIT_UPGRADE_PATHS,
    hero_level_data: HERO_LEVEL_DATA,
    hero_max_level: HERO_MAX_LEVEL,
    throne_upgrade_costs: THRONE_UPGRADE_COSTS,
  });
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

    const record    = rows[0];
    const buildings = record.buildings_data;
    const current   = buildings[slot] || { level: 0, building_id: null };
    const isNew     = !current.building_id;
    const nextLevel = (current.level || 0) + 1;
    if (nextLevel > 4) return res.status(400).json({ error: 'Already at max level' });

    buildings[slot] = { level: nextLevel, ready_at: null, building_id };

    const updated = await supabase(`/structures?id=eq.${record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ buildings_data: buildings }),
    });

    if (isNew && def.unit_id) {
      const factionKey = faction === 'empire' ? 'empire' : 'dungeon';
      const unitDef = Object.values(UNITS[factionKey] || {}).find(u => u.id === def.unit_id);
      if (unitDef) {
        await supabase('/roster', {
          method: 'POST',
          body: JSON.stringify([{
            chat_id,
            unit_name: unitDef.name,
            unit_data: { ...unitDef, building_slot: slot },
            experience: 0,
          }]),
        });
      }
    }

    res.json(updated[0]);
  } catch (err) {
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