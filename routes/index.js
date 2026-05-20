const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const { UNITS } = require('../data/units');
const { REGIONS } = require('../data/embark');
const { BUILDING_POOLS, SLOT_CATEGORIES, UNIT_UPGRADE_PATHS, HERO_MAX_LEVEL, THRONE_UPGRADE_COSTS, getBuildingDef, emptyStructures } = require('../data/buildings');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const STARTING_RESOURCES = [
  { item_type: 'resource', item: 'Gold',            amount: 200 },
  { item_type: 'resource', item: 'Trophies',        amount: 0   },
  { item_type: 'resource', item: 'Crystals_Life',   amount: 20  },
  { item_type: 'resource', item: 'Crystals_Fire',   amount: 20  },
  { item_type: 'resource', item: 'Crystals_Death',  amount: 20  },
  { item_type: 'resource', item: 'Crystals_Nature', amount: 20  },
  { item_type: 'resource', item: 'Crystals_Frost',  amount: 20  },
];

const FACTION_STARTING_SPELLS = {
  empire:              ['e_spell_1'],
  choir_of_the_cursed: ['d_spell_1'],
  grail_of_sorrow:     ['g_spell_1'],
};

const HERO_IDS = ['h_e_1', 'h_e_2', 'h_e_3', 'h_d_1', 'h_d_2', 'h_d_3'];

const HERO_STARTING_UNITS = {
  h_e_1: { building_id: 'acolyte_shrine',     unit_id: 'e2',  slot: 'slot_4' },
  h_e_2: { building_id: 'scout_post',         unit_id: 'e8',  slot: 'slot_4' },
  h_e_3: { building_id: 'conscript_barracks', unit_id: 'e1',  slot: 'slot_4' },
  h_d_1: { building_id: 'heretic_pit',        unit_id: 'd1',  slot: 'slot_4' },
  h_d_2: { building_id: 'heretic_pit',        unit_id: 'd1',  slot: 'slot_4' },
  h_d_3: { building_id: 'heretic_pit',        unit_id: 'd1',  slot: 'slot_4' },
};

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

function getUnitByDataId(unitDataId) {
  for (const factionPool of Object.values(UNITS)) {
    if (typeof factionPool !== 'object' || Array.isArray(factionPool)) continue;
    const found = Object.values(factionPool).find(u => u?.id === unitDataId);
    if (found) return found;
  }
  return null;
}

function getFactionForUnit(unitDataId) {
  for (const [fKey, factionPool] of Object.entries(UNIT_UPGRADE_PATHS)) {
    if (factionPool[unitDataId]) return fKey;
  }
  return null;
}

function makeUnitData(unitId, buildingSlot) {
  return {
    unit_id: unitId,
    building_slot: buildingSlot || null,
    current_xp: 0,
    buffs: [],
    debuffs: [],
  };
}

router.post('/login', async (req, res) => {
  const { initData } = req.body;
  if (!initData) return res.status(400).json({ error: 'initData required' });

  const telegramUser = validateTelegramInitData(initData);
  if (!telegramUser) return res.status(401).json({ error: 'Invalid Telegram auth' });

  const chat_id = String(telegramUser.id);

  try {
    const existing = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (existing.length > 0) return res.json({ player: existing[0], isNew: false });

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

router.get('/heroes', (req, res) => {
  const heroes = HERO_IDS.map(id => getUnitByDataId(id)).filter(Boolean);
  res.json(heroes);
});

router.post('/player/faction', async (req, res) => {
  const { player_id, chat_id, faction, hero_id } = req.body;
  if (!player_id || !chat_id || !faction || !hero_id) {
    return res.status(400).json({ error: 'player_id, chat_id, faction, and hero_id required' });
  }

  if (!HERO_IDS.includes(hero_id)) {
    return res.status(400).json({ error: 'Invalid hero_id' });
  }

  const heroDef = getUnitByDataId(hero_id);
  if (!heroDef) return res.status(400).json({ error: 'Hero not found in unit data' });

  const startingUnit = HERO_STARTING_UNITS[hero_id];
  const structures   = emptyStructures();

  if (startingUnit) {
    structures[startingUnit.slot] = { level: 1, building_id: startingUnit.building_id };
  }

  const unitDef = startingUnit ? getUnitByDataId(startingUnit.unit_id) : null;

  const rosterEntries = [
    {
      chat_id,
      unit_data: makeUnitData(heroDef.id, null),
      is_hero: true,
    },
    ...(unitDef ? [{
      chat_id,
      unit_data: makeUnitData(unitDef.id, startingUnit.slot),
      is_hero: false,
    }] : []),
  ];

  try {
    const [updated] = await Promise.all([
      supabase(`/players?id=eq.${player_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ faction, hero: hero_id, learned_spells: FACTION_STARTING_SPELLS[faction] || [] }),
      }),
      supabase('/roster', {
        method: 'POST',
        body: JSON.stringify(rosterEntries),
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
    const rows = await supabase(
      `/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero`
    );
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
    const [rosterRows, structRows] = await Promise.all([
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero`),
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
    ]);

    if (!rosterRows.length) return res.status(404).json({ error: 'Roster entry not found' });
    if (!structRows.length)  return res.status(404).json({ error: 'Structures not found' });

    const entry    = rosterRows[0];
    const unitData = entry.unit_data || {};
    const currentUnitId = unitData.unit_id;
    if (!currentUnitId) return res.status(400).json({ error: 'Unit has no unit_id in unit_data' });

    const faction = getFactionForUnit(currentUnitId);
    if (!faction) return res.status(400).json({ error: `No upgrade path found for ${currentUnitId}` });

    const paths = UNIT_UPGRADE_PATHS[faction][currentUnitId];
    if (!paths || paths.length === 0) {
      return res.status(400).json({ error: 'Unit is already at max tier or has no upgrade path' });
    }

    const fullDef = getUnitByDataId(currentUnitId);
    if (!fullDef) return res.status(400).json({ error: 'Unit definition not found' });

    const xpRequired = fullDef.xp;

    if (entry.is_hero) {
      const currentTier = fullDef.t ?? 1;
      const throneLevel = structRows[0].buildings_data['slot_0']?.level || 1;

      if (currentTier >= HERO_MAX_LEVEL) {
        return res.status(400).json({ error: 'Hero is already at max tier' });
      }
      if (currentTier >= throneLevel) {
        return res.status(400).json({ error: `Upgrade your Throne to level ${currentTier + 1} first` });
      }
      if (xpRequired != null && unitData.current_xp < xpRequired) {
        return res.status(400).json({ error: `Not enough XP. Need ${xpRequired}, have ${unitData.current_xp}` });
      }
    } else {
      if (xpRequired == null) return res.status(400).json({ error: 'Unit has no xp threshold defined' });
      if (unitData.current_xp < xpRequired) {
        return res.status(400).json({ error: `Not enough XP. Need ${xpRequired}, have ${unitData.current_xp}` });
      }
    }

    const buildingSlot = unitData.building_slot || null;
    let path = null;

    if (paths.length === 1) {
      path = paths[0];
    } else {
      if (!buildingSlot) {
        return res.status(400).json({ error: 'Unit has no building slot assigned; cannot determine upgrade path' });
      }
      const currentBuildingId = structRows[0].buildings_data[buildingSlot]?.building_id;
      const matched = paths.find(p => p.building_id === currentBuildingId);
      if (!matched) {
        const required = paths.map(p => p.label).join(' or ');
        return res.status(400).json({ error: `Build ${required} first to choose an upgrade path` });
      }
      path = matched;
    }

    const nextDef = getUnitByDataId(path.unit_id);
    if (!nextDef) return res.status(400).json({ error: `Definition for ${path.unit_id} not found` });

    const newUnitData = makeUnitData(nextDef.id, buildingSlot);
    newUnitData.current_xp = unitData.current_xp ?? 0;

    const updatePromises = [
      supabase(`/roster?id=eq.${roster_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ unit_data: newUnitData }),
      }),
    ];

    if (!entry.is_hero && buildingSlot) {
      const buildings = structRows[0].buildings_data;
      const slotState = buildings[buildingSlot];
      if (slotState) {
        buildings[buildingSlot] = { ...slotState, building_id: path.building_id };
        updatePromises.push(
          supabase(`/structures?id=eq.${structRows[0].id}`, {
            method: 'PATCH',
            body: JSON.stringify({ buildings_data: buildings }),
          })
        );
      }
    }

    await Promise.all(updatePromises);

    const updated = await supabase(`/roster?id=eq.${roster_id}&select=id,chat_id,unit_data,is_hero`);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/structures/throne/upgrade', async (req, res) => {
  const { chat_id } = req.body;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });

  try {
    const rows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Structures not found' });

    const record    = rows[0];
    const buildings = record.buildings_data;
    const throne    = buildings['slot_0'] || { level: 1, building_id: null };
    const nextLevel = (throne.level || 1) + 1;

    if (nextLevel > HERO_MAX_LEVEL) {
      return res.status(400).json({ error: 'Throne is already at max level' });
    }

    const cost = THRONE_UPGRADE_COSTS[nextLevel];
    if (!cost) return res.status(400).json({ error: 'No cost defined for that level' });

    if (cost.gold > 0) {
      const inventory = await supabase(`/inventory_and_resources?chat_id=eq.${encodeURIComponent(chat_id)}`);
      const goldRow   = inventory.find(r => r.item === 'Gold');

      if (!goldRow || goldRow.amount < cost.gold) {
        return res.status(400).json({ error: `Not enough Gold. Need ${cost.gold}` });
      }

      await supabase(`/inventory_and_resources?id=eq.${goldRow.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ amount: goldRow.amount - cost.gold }),
      });
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

router.get('/buildings', (req, res) => {
  res.json({
    pools: BUILDING_POOLS,
    slot_categories: SLOT_CATEGORIES,
    upgrade_paths: UNIT_UPGRADE_PATHS,
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

    buildings[slot] = { level: nextLevel, building_id };

    const updated = await supabase(`/structures?id=eq.${record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ buildings_data: buildings }),
    });

    if (isNew && def.unit_id) {
      const unitDef = getUnitByDataId(def.unit_id);
      if (unitDef) {
        await supabase('/roster', {
          method: 'POST',
          body: JSON.stringify([{
            chat_id,
            unit_data: makeUnitData(unitDef.id, slot),
            is_hero: false,
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

router.post('/battle/reward', async (req, res) => {
  const { chat_id, region_id, level, won, survivor_ids } = req.body;
  if (!chat_id || !region_id || level === undefined || won === undefined) {
    return res.status(400).json({ error: 'chat_id, region_id, level, won required' });
  }

  try {
    const region = REGIONS.find(r => r.id === region_id);
    if (!region) return res.status(404).json({ error: 'Region not found' });

    const levelDef = region.difficulties?.[`level_${level}`];
    if (!levelDef) return res.status(404).json({ error: 'Level not found' });

    const rewards = levelDef.rewards;
    const result  = { xp_granted: 0, gold: 0, crystal: 0, progress_unlocked: false };

    if (won) {
      const inventoryRows = await supabase(
        `/inventory_and_resources?chat_id=eq.${encodeURIComponent(chat_id)}`
      );

      const updateItem = async (itemName, amount) => {
        const row = inventoryRows.find(r => r.item === itemName);
        if (!row) return;
        await supabase(`/inventory_and_resources?id=eq.${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ amount: Number(row.amount) + amount }),
        });
      };

      await updateItem('Gold', rewards.gold);
      await updateItem(region.crystal_type, rewards.crystal);

      result.gold    = rewards.gold;
      result.crystal = rewards.crystal;

      if (survivor_ids && survivor_ids.length > 0) {
        const xpEach = Math.floor(rewards.xp / survivor_ids.length);
        result.xp_granted = xpEach;

        await Promise.all(survivor_ids.map(async (rosterId) => {
          const rows = await supabase(
            `/roster?id=eq.${encodeURIComponent(rosterId)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data`
          );
          if (!rows.length) return;
          const current = rows[0];
          const updatedUnitData = {
            ...current.unit_data,
            current_xp: (current.unit_data?.current_xp ?? 0) + xpEach,
          };
          await supabase(`/roster?id=eq.${current.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ unit_data: updatedUnitData }),
          });
        }));
      }

      const playerRows = await supabase(
        `/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`
      );
      if (playerRows.length) {
        const progress     = playerRows[0].progress || {};
        const currentLevel = progress[region_id] ?? 1;
        const maxLevel     = Object.keys(region.difficulties).length;
        if (level >= currentLevel && level < maxLevel) {
          progress[region_id] = level + 1;
          await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ progress }),
          });
          result.progress_unlocked = true;
          result.next_level        = level + 1;
        }
      }
    }

    res.json(result);
  } catch (err) {
    console.error('battle/reward error', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/spells/research', async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });

  try {
    const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=learned_spells&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });
    res.json({ researched_spells: rows[0].learned_spells || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/spells/research', async (req, res) => {
  const { chat_id, spell_id, faction } = req.body;
  if (!chat_id || !spell_id || !faction) return res.status(400).json({ error: 'chat_id, spell_id, faction required' });

  const { SPELLS } = require('../data/spells');
  const factionSpells = SPELLS[faction] || [];
  const spell = factionSpells.find(s => s.id === spell_id);
  if (!spell) return res.status(404).json({ error: 'Spell not found' });

  try {
    const [playerRows, structRows] = await Promise.all([
      supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
    ]);

    if (!playerRows.length) return res.status(404).json({ error: 'Player not found' });
    if (!structRows.length)  return res.status(404).json({ error: 'Structures not found' });

    const learned     = playerRows[0].learned_spells || [];
    const throneLevel = structRows[0].buildings_data['slot_0']?.level || 1;
    const spellTier   = spell.tier || 1;

    if (learned.includes(spell_id)) return res.status(400).json({ error: 'Spell already researched' });
    if (throneLevel < spellTier) return res.status(400).json({ error: `Throne level ${spellTier} required to research this spell` });

    const crystalEntries = Object.entries(spell.cost.crystals || {}).filter(([, amt]) => amt > 0);

    if (crystalEntries.length > 0) {
      const inventoryRows = await supabase(`/inventory_and_resources?chat_id=eq.${encodeURIComponent(chat_id)}`);

      for (const [crystalType, needed] of crystalEntries) {
        const row = inventoryRows.find(r => r.item === crystalType);
        if (!row || row.amount < needed) return res.status(400).json({ error: `Not enough ${crystalType}. Need ${needed}` });
      }

      await Promise.all(crystalEntries.map(([crystalType, needed]) => {
        const row = inventoryRows.find(r => r.item === crystalType);
        return supabase(`/inventory_and_resources?id=eq.${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ amount: row.amount - needed }),
        });
      }));
    }

    const newLearned = [...learned, spell_id];
    await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ learned_spells: newLearned }),
    });

    res.json({ success: true, learned_spells: newLearned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/spells/consume', async (req, res) => {
  const { chat_id, spell_id, crystals_cost } = req.body;
  if (!chat_id || !spell_id) return res.status(400).json({ error: 'chat_id, spell_id required' });

  try {
    const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });

    const learned = rows[0].learned_spells || [];
    if (!learned.includes(spell_id)) return res.status(400).json({ error: 'Spell not learned' });

    const crystalEntries = Object.entries(
      crystals_cost && typeof crystals_cost === 'object' ? crystals_cost : {}
    ).filter(([, amt]) => amt > 0);

    if (crystalEntries.length > 0) {
      const inventoryRows = await supabase(`/inventory_and_resources?chat_id=eq.${encodeURIComponent(chat_id)}`);

      for (const [crystalType, needed] of crystalEntries) {
        const row = inventoryRows.find(r => r.item === crystalType);
        if (!row || row.amount < needed) return res.status(400).json({ error: `Not enough ${crystalType}. Need ${needed}` });
      }

      await Promise.all(crystalEntries.map(([crystalType, needed]) => {
        const row = inventoryRows.find(r => r.item === crystalType);
        return supabase(`/inventory_and_resources?id=eq.${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ amount: row.amount - needed }),
        });
      }));
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/battle/active', async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });

  try {
    const rows = await supabase(
      `/battle_state?chat_id=eq.${encodeURIComponent(chat_id)}&battle_active=eq.true&order=created_at.desc&limit=1`
    );
    res.json(rows.length ? rows[0] : null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/battle/create', async (req, res) => {
  const { chat_id, region_id, level, playerUnits, enemies, placement, selectedSpells } = req.body;
  if (!chat_id || !region_id || level === undefined) {
    return res.status(400).json({ error: 'chat_id, region_id, level required' });
  }

  try {
    await supabase(
      `/battle_state?chat_id=eq.${encodeURIComponent(chat_id)}&battle_active=eq.true`,
      { method: 'PATCH', body: JSON.stringify({ battle_active: false }) }
    );

    const characters = {};

    if (Array.isArray(playerUnits)) {
      for (const u of playerUnits) {
        characters[u.id] = {
          id: u.id,
          side: 'player',
          unit_name: u.unit_name,
          unit_data: u.unit_data || {},
          current_hp: u.unit_data?.hp ?? null,
          max_hp: u.unit_data?.hp ?? null,
          cell: placement?.[u.id] ?? null,
          alive: true,
          buffs: [],
          debuffs: [],
          status_effects: [],
        };
      }
    }

    if (Array.isArray(enemies)) {
      for (const e of enemies) {
        const enemyId = `enemy_${e.cell ?? e.name}`;
        characters[enemyId] = {
          id: enemyId,
          side: 'enemy',
          unit_name: e.name,
          unit_data: e,
          current_hp: e.hp ?? null,
          max_hp: e.hp ?? null,
          cell: e.cell ?? null,
          alive: true,
          buffs: [],
          debuffs: [],
          status_effects: [],
        };
      }
    }

    const battleData = {
      region_id,
      level,
      turn: 1,
      phase: 'player_turn',
      characters,
      placement: placement || {},
      selected_spells: selectedSpells || [],
      log: [],
    };

    const created = await supabase('/battle_state', {
      method: 'POST',
      body: JSON.stringify({
        chat_id,
        battle_id: uuidv4(),
        battle_active: true,
        battle_data: battleData,
      }),
    });

    res.json(created[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/battle/update', async (req, res) => {
  const { chat_id, battle_id, battle_data } = req.body;
  if (!chat_id || !battle_id || !battle_data) {
    return res.status(400).json({ error: 'chat_id, battle_id, battle_data required' });
  }

  try {
    const rows = await supabase(
      `/battle_state?chat_id=eq.${encodeURIComponent(chat_id)}&battle_id=eq.${encodeURIComponent(battle_id)}&limit=1`
    );
    if (!rows.length) return res.status(404).json({ error: 'Battle not found' });

    const updated = await supabase(`/battle_state?id=eq.${rows[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ battle_data }),
    });

    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/battle/end', async (req, res) => {
  const { chat_id, battle_id } = req.body;
  if (!chat_id || !battle_id) {
    return res.status(400).json({ error: 'chat_id, battle_id required' });
  }

  try {
    const rows = await supabase(
      `/battle_state?chat_id=eq.${encodeURIComponent(chat_id)}&battle_id=eq.${encodeURIComponent(battle_id)}&limit=1`
    );
    if (!rows.length) return res.status(404).json({ error: 'Battle not found' });

    const updated = await supabase(`/battle_state?id=eq.${rows[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ battle_active: false }),
    });

    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;