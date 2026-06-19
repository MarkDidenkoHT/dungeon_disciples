const express = require('express');
const router = express.Router();

const crypto = require('crypto');

const { UNITS } = require('../data/units');
const { REGIONS, getEncounter } = require('../data/embark');
const { BUILDING_POOLS, SLOT_CATEGORIES, UNIT_UPGRADE_PATHS, HERO_MAX_LEVEL, THRONE_UPGRADE_COSTS, getBuildingDef, emptyStructures, MERCENARY_BUILDINGS } = require('../data/buildings');
const { BattleEngine } = require('../utils/battle-engine');
const { getActiveBattle, getBattleState, createBattleState, updateBattleState, closeBattleState } = require('../utils/realtime');
const { SPELLS } = require('../data/spells');


function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'];
  const chatId = (req.body && req.body.chat_id) || req.query.chat_id;
  if (!token || !chatId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chatId)}&select=session_token&limit=1`);
    if (!rows.length || rows[0].session_token !== token) return res.status(401).json({ error: 'Unauthorized' });
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL.replace(/\/+$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_FUNCTIONS_URL = SUPABASE_URL.replace(/\/rest\/v1\/?$/, '');
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const STARTING_RESOURCES = [
  { item_type: 'resource', item: 'Gold',            amount: 200 },
  { item_type: 'resource', item: 'Trophies',        amount: 0   },
  { item_type: 'resource', item: 'Crystals_Life',   amount: 20  },
  { item_type: 'resource', item: 'Crystals_Fire',   amount: 20  },
  { item_type: 'resource', item: 'Crystals_Death',  amount: 20  },
  { item_type: 'resource', item: 'Crystals_Nature', amount: 20  },
  { item_type: 'resource', item: 'Crystals_Frost',  amount: 20  },
  { item_type: 'resource', item: 'Crystals_Air',    amount: 20  },
];

const FACTION_STARTING_SPELLS = {
  empire:              ['e_spell_1', 'e_spell_2'],
  choir_of_the_cursed: ['d_spell_1', 'd_spell_2'],
  grail_of_sorrow:     ['g_spell_1', 'g_spell_2'],
};

const HERO_IDS = ['h_e_1', 'h_e_2', 'h_e_3', 'h_d_1', 'h_d_2', 'h_d_3', 'h_g_1', 'h_g_2', 'h_g_3'];

const HERO_STARTING_UNITS = {
  h_e_1: { building_id: 'acolyte_shrine',     unit_id: 'e2',  slot: 'slot_4' },
  h_e_2: { building_id: 'scout_post',         unit_id: 'e8',  slot: 'slot_4' },
  h_e_3: { building_id: 'conscript_barracks', unit_id: 'e1',  slot: 'slot_4' },
  h_d_1: { building_id: 'heretic_pit',        unit_id: 'd1',  slot: 'slot_4' },
  h_d_2: { building_id: 'heretic_pit',        unit_id: 'd1',  slot: 'slot_4' },
  h_d_3: { building_id: 'heretic_pit',        unit_id: 'd1',  slot: 'slot_4' },
  h_g_1: { building_id: 'zombie_pit',         unit_id: 'gs1', slot: 'slot_4' },
  h_g_2: { building_id: 'zombie_pit',         unit_id: 'gs1', slot: 'slot_4' },
  h_g_3: { building_id: 'zombie_pit',         unit_id: 'gs1', slot: 'slot_4' },
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
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (expectedHash !== hash) return null;
  const authDate = parseInt(params.get('auth_date'), 10);
  if (Date.now() / 1000 - authDate > 86400) return null;
  const userRaw = params.get('user');
  if (!userRaw) return null;
  try {
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

function getUnitByDataId(unitDataId) {
  for (const factionPool of Object.values(UNITS)) {
    if (typeof factionPool !== 'object' || Array.isArray(factionPool)) continue;
    const found = Object.values(factionPool).find(u => u?.id === unitDataId);
    if (found) return found;
  }
  return null;
}

async function consumeCrystalCosts(chat_id, crystals) {
  const crystalEntries = Object.entries(crystals || {}).filter(([, amt]) => Number.isFinite(amt) && amt > 0);
  if (!crystalEntries.length) return;

  const inventoryRows = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`);
  for (const [crystalType, needed] of crystalEntries) {
    const row = inventoryRows.find(r => r.item === crystalType);
    if (!row || row.amount < needed) {
      throw new Error(`Not enough ${crystalType}. Need ${needed}`);
    }
  }

  await Promise.all(crystalEntries.map(([crystalType, needed]) => {
    const row = inventoryRows.find(r => r.item === crystalType);
    return supabase(`/resources?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ amount: row.amount - needed }) });
  }));
}

function buildPlayerUnitFromRosterEntry(r, entry) {
  const def = getUnitByDataId(r.unit_data?.unit_id);
  if (!def) throw new Error(`Unit definition for ${r.unit_data?.unit_id} not found`);
  return {
    id:        String(entry.id),
    _rosterId: String(entry._rosterId || entry.id),
    unit_data: { ...def, ...(r.unit_data || {}) },
    unit_name: def.name || def.id,
    is_hero:   !!r.is_hero,
  };
}

async function rehydrateEngine(record) {
  const bd = record.battle_data;
  const { playerUnitIds, placement } = bd.setup;
  const chat_id = record.chat_id;

  const [rosterRows, enemies] = await Promise.all([
    supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero`),
    Promise.resolve(getEncounter(bd.region_id, bd.level)),
  ]);

  const rosterById = {};
  for (const r of rosterRows) rosterById[String(r.id)] = r;

  const playerUnits = playerUnitIds.map(entry => {
    const rosterId = String(entry._rosterId || entry.id);
    const r = rosterById[rosterId];
    if (!r) throw new Error(`Roster unit ${entry._rosterId || entry.id} not found`);
    return buildPlayerUnitFromRosterEntry(r, entry);
  });

  return BattleEngine.rehydrate({ playerUnits, enemies, placement }, bd);
}

function buildBattleData(engine, bd) {
  return {
    ...engine.getBattleData(),
    region_id:       bd.region_id,
    level:           bd.level,
    setup:           bd.setup,
    selected_spells: bd.selected_spells || [],
  };
}

async function persistBattleRosterState(chat_id, battle_data) {
  if (!battle_data || !Array.isArray(battle_data.units)) return;
  const playerUnits = battle_data.units.filter(u => u.side === 'player' && u._rosterId != null);
  await Promise.all(playerUnits.map(async (unit) => {
    const rosterId = String(unit._rosterId);
    const rows = await supabase(
      `/roster?id=eq.${encodeURIComponent(rosterId)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data`
    );
    if (!rows.length) return;
    const current = rows[0];
    const updatedUnitData = {
      ...current.unit_data,
      alive:      unit.alive !== false,
      current_hp: Number.isFinite(Number(unit.battle_hp)) ? Number(unit.battle_hp) : 0,
    };
    await supabase(`/roster?id=eq.${encodeURIComponent(current.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ unit_data: updatedUnitData }),
    });
  }));
}

function getAlivePlayerRosterIds(battle_data) {
  if (!battle_data || !Array.isArray(battle_data.units)) return [];
  return battle_data.units
    .filter(u => u.side === 'player' && u._rosterId != null && u.alive)
    .map(u => String(u._rosterId));
}

function getFactionForUnit(unitDataId) {
  for (const [fKey, factionPool] of Object.entries(UNIT_UPGRADE_PATHS)) {
    if (factionPool[unitDataId]) return fKey;
  }
  return null;
}

function makeUnitData(unitId, buildingSlot) {
  const def = getUnitByDataId(unitId);
  const hp  = def?.hp ?? 50;
  return {
    unit_id: unitId,
    building_slot: buildingSlot || null,
    current_xp: 0,
    current_hp: hp,
    max_hp: hp,
    alive: true,
  };
}

router.post('/login', async (req, res) => {
  const { initData } = req.body;
  if (!initData) return res.status(400).json({ error: 'initData required' });
  const telegramUser = validateTelegramInitData(initData);
  if (!telegramUser) return res.status(401).json({ error: 'Invalid Telegram auth' });
  const chat_id = String(telegramUser.id);
  const session_token = generateSessionToken();
  try {
    const existing = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (existing.length > 0) {
      const updated = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ session_token }),
      });
      let dailyResult = null;
      try {
        dailyResult = await fetch(`${SUPABASE_FUNCTIONS_URL}/functions/v1/daily-crystals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
          body: JSON.stringify({ chat_id }),
        }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.message || JSON.stringify(d)); return d; });
      } catch (e) {}
      let activeRec = null;
      try { activeRec = await getActiveBattle(chat_id); } catch (e) {}
      return res.json({
        player: updated[0],
        session_token,
        isNew: false,
        active: Boolean(activeRec),
        battle_id: activeRec ? activeRec.battle_id : null,
        battle_data: activeRec ? activeRec.battle_data : null,
        daily_result: dailyResult,
      });
    }
    const created = await supabase('/players', {
      method: 'POST',
      body: JSON.stringify({ chat_id, username: telegramUser.username || null, first_name: telegramUser.first_name || null, session_token }),
    });
    let dailyResult = null;
    try {
      dailyResult = await fetch(`${SUPABASE_FUNCTIONS_URL}/functions/v1/daily-crystals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
        body: JSON.stringify({ chat_id }),
      }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.message || JSON.stringify(d)); return d; });
    } catch (e) {}
    let activeRec = null;
    try { activeRec = await getActiveBattle(chat_id); } catch (e) {}
    res.json({
      player: created[0],
      session_token,
      isNew: true,
      active: Boolean(activeRec),
      battle_id: activeRec ? activeRec.battle_id : null,
      battle_data: activeRec ? activeRec.battle_data : null,
      daily_result: dailyResult,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/player', requireAuth, async (req, res) => {
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

const VALID_FACTIONS = ['empire', 'choir_of_the_cursed', 'grail_of_sorrow'];

router.post('/player/faction', requireAuth, async (req, res) => {
  const { player_id, chat_id, faction, hero_id } = req.body;
  if (!player_id || !chat_id || !faction || !hero_id) {
    return res.status(400).json({ error: 'player_id, chat_id, faction, and hero_id required' });
  }
  if (!VALID_FACTIONS.includes(faction)) return res.status(400).json({ error: 'Invalid faction' });
  if (!HERO_IDS.includes(hero_id)) return res.status(400).json({ error: 'Invalid hero_id' });
  const heroDef = getUnitByDataId(hero_id);
  if (!heroDef) return res.status(400).json({ error: 'Hero not found in unit data' });
  try {
    const existing = await supabase(`/players?id=eq.${encodeURIComponent(player_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=faction&limit=1`);
    if (!existing.length) return res.status(404).json({ error: 'Player not found' });
    if (existing[0].faction) return res.status(400).json({ error: 'Faction already chosen' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  const startingUnit = HERO_STARTING_UNITS[hero_id];
  const structures   = emptyStructures();
  if (startingUnit) {
    structures[startingUnit.slot] = { level: 1, building_id: startingUnit.building_id };
  }
  const unitDef = startingUnit ? getUnitByDataId(startingUnit.unit_id) : null;
  const rosterEntries = [
    { chat_id, unit_data: makeUnitData(heroDef.id, null), is_hero: true },
    ...(unitDef ? [{ chat_id, unit_data: makeUnitData(unitDef.id, startingUnit.slot), is_hero: false }] : []),
  ];
  try {
    const [updated] = await Promise.all([
      supabase(`/players?id=eq.${player_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ faction, hero: hero_id, learned_spells: FACTION_STARTING_SPELLS[faction] || [] }),
      }),
      supabase('/roster', { method: 'POST', body: JSON.stringify(rosterEntries) }),
      supabase('/resources', { method: 'POST', body: JSON.stringify(STARTING_RESOURCES.map(r => ({ ...r, chat_id }))) }),
      supabase('/structures', { method: 'POST', body: JSON.stringify({ chat_id, buildings_data: structures }) }),
    ]);
    res.json({ player: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/inventory', requireAuth, async (req, res) => {
  const { chat_id, type } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    let url = `/resources?chat_id=eq.${encodeURIComponent(chat_id)}`;
    if (type) url += `&item_type=eq.${encodeURIComponent(type)}`;
    const rows = await supabase(url);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/roster', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const rows = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/roster/resurrect', requireAuth, async (req, res) => {
  const { chat_id, roster_id, spell_id } = req.body;
  if (!chat_id || !roster_id || !spell_id) return res.status(400).json({ error: 'chat_id, roster_id and spell_id required' });

  try {
    const playerRows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=learned_spells,faction&limit=1`);
    if (!playerRows.length) return res.status(404).json({ error: 'Player not found' });

    const player = playerRows[0];
    const learnedSpells = player.learned_spells || [];
    if (!learnedSpells.includes(spell_id)) return res.status(403).json({ error: 'Spell not learned' });

    const factionSpells = SPELLS[player.faction] || [];
    const spellDef = factionSpells.find(s => s.id === spell_id && s.usage === 'roster' && s.target_scope === 'single_ally');
    if (!spellDef) return res.status(400).json({ error: 'Invalid roster spell' });

    const rosterRows = await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero`);
    if (!rosterRows.length) return res.status(404).json({ error: 'Roster entry not found' });

    const entry = rosterRows[0];
    const unitData = entry.unit_data || {};
    if (unitData.alive !== false) return res.status(400).json({ error: 'Unit is already alive' });

    await consumeCrystalCosts(chat_id, spellDef.cost?.crystals || {});

    const newUnitData = { ...unitData, alive: true, current_hp: 1 };
    await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ unit_data: newUnitData }),
    });

    const updated = await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&select=id,chat_id,unit_data,is_hero`);
    res.json({ success: true, roster: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/roster/levelup', requireAuth, async (req, res) => {
  const { chat_id, roster_id } = req.body;
  if (!chat_id || !roster_id) return res.status(400).json({ error: 'chat_id and roster_id required' });
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
    if (!paths || paths.length === 0) return res.status(400).json({ error: 'Unit is already at max tier or has no upgrade path' });
    const fullDef = getUnitByDataId(currentUnitId);
    if (!fullDef) return res.status(400).json({ error: 'Unit definition not found' });
    const xpRequired = fullDef.xp;
    if (entry.is_hero) {
      const currentTier = fullDef.t ?? 1;
      const throneLevel = structRows[0].buildings_data['slot_0']?.level || 1;
      if (currentTier >= HERO_MAX_LEVEL) return res.status(400).json({ error: 'Hero is already at max tier' });
      if (currentTier >= throneLevel) return res.status(400).json({ error: `Upgrade your Throne to level ${currentTier + 1} first` });
      if (xpRequired != null && unitData.current_xp < xpRequired) return res.status(400).json({ error: `Not enough XP. Need ${xpRequired}, have ${unitData.current_xp}` });
    } else {
      if (xpRequired == null) return res.status(400).json({ error: 'Unit has no xp threshold defined' });
      if (unitData.current_xp < xpRequired) return res.status(400).json({ error: `Not enough XP. Need ${xpRequired}, have ${unitData.current_xp}` });
    }
    const buildingSlot = unitData.building_slot || null;
    let path = null;
    if (paths.length === 1) {
      path = paths[0];
    } else {
      if (!buildingSlot) return res.status(400).json({ error: 'Unit has no building slot assigned; cannot determine upgrade path' });
      const currentBuildingId = structRows[0].buildings_data[buildingSlot]?.building_id;
      const matched = paths.find(p => p.building_id === currentBuildingId);
      if (!matched) return res.status(400).json({ error: `Build ${paths.map(p => p.label).join(' or ')} first to choose an upgrade path` });
      path = matched;
    }
    const nextDef = getUnitByDataId(path.unit_id);
    if (!nextDef) return res.status(400).json({ error: `Definition for ${path.unit_id} not found` });
    const newUnitData = makeUnitData(nextDef.id, buildingSlot);
    newUnitData.current_xp = unitData.current_xp ?? 0;
    const oldHp = Number(unitData.current_hp ?? unitData.max_hp ?? 0);
    if (oldHp > 0) {
      newUnitData.current_hp = Math.min(newUnitData.max_hp, oldHp);
    }
    newUnitData.alive = unitData.alive !== false;
    const updatePromises = [
      supabase(`/roster?id=eq.${roster_id}`, { method: 'PATCH', body: JSON.stringify({ unit_data: newUnitData }) }),
    ];
    if (!entry.is_hero && buildingSlot) {
      const buildings = structRows[0].buildings_data;
      const slotState = buildings[buildingSlot];
      if (slotState) {
        buildings[buildingSlot] = { ...slotState, building_id: path.building_id };
        updatePromises.push(supabase(`/structures?id=eq.${structRows[0].id}`, { method: 'PATCH', body: JSON.stringify({ buildings_data: buildings }) }));
      }
    }
    await Promise.all(updatePromises);
    const updated = await supabase(`/roster?id=eq.${roster_id}&select=id,chat_id,unit_data,is_hero`);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/structures/throne/upgrade', requireAuth, async (req, res) => {
  const { chat_id } = req.body;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const rows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Structures not found' });
    const record    = rows[0];
    const buildings = record.buildings_data;
    const throne    = buildings['slot_0'] || { level: 1, building_id: null };
    const nextLevel = (throne.level || 1) + 1;
    if (nextLevel > HERO_MAX_LEVEL) return res.status(400).json({ error: 'Throne is already at max level' });
    const cost = THRONE_UPGRADE_COSTS[nextLevel];
    if (!cost) return res.status(400).json({ error: 'No cost defined for that level' });
    if (cost.gold > 0) {
      const inventory = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`);
      const goldRow   = inventory.find(r => r.item === 'Gold');
      if (!goldRow || goldRow.amount < cost.gold) return res.status(400).json({ error: `Not enough Gold. Need ${cost.gold}` });
      await supabase(`/resources?id=eq.${goldRow.id}`, { method: 'PATCH', body: JSON.stringify({ amount: goldRow.amount - cost.gold }) });
    }
    buildings['slot_0'] = { ...throne, level: nextLevel };
    const updated = await supabase(`/structures?id=eq.${record.id}`, { method: 'PATCH', body: JSON.stringify({ buildings_data: buildings }) });
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/buildings', (req, res) => {
  res.json({ pools: BUILDING_POOLS, slot_categories: SLOT_CATEGORIES, upgrade_paths: UNIT_UPGRADE_PATHS, hero_max_level: HERO_MAX_LEVEL, throne_upgrade_costs: THRONE_UPGRADE_COSTS, mercenary_buildings: MERCENARY_BUILDINGS });
});

router.get('/structures', requireAuth, async (req, res) => {
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

router.post('/structures/build', requireAuth, async (req, res) => {
  const { chat_id, slot, building_id } = req.body;
  if (!chat_id || !slot || !building_id) return res.status(400).json({ error: 'chat_id, slot, and building_id required' });
  const slotCategory = SLOT_CATEGORIES[slot];
  if (!slotCategory) return res.status(400).json({ error: 'Invalid slot' });
  if (slotCategory === 'throne') return res.status(400).json({ error: 'Throne cannot be built' });
  if (building_id === 'mercenary_hall') return res.status(400).json({ error: 'Use the mercenary recruit endpoint instead' });
  try {
    const [rows, playerRows] = await Promise.all([
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
      supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=faction&limit=1`),
    ]);
    if (!playerRows.length) return res.status(404).json({ error: 'Player not found' });
    const faction = playerRows[0].faction;
    if (!faction) return res.status(400).json({ error: 'Player has no faction' });
    const def = getBuildingDef(faction, building_id);
    if (!def) return res.status(400).json({ error: 'Unknown building_id for this faction' });
    if (slotCategory !== 'any' && def.category !== slotCategory) return res.status(400).json({ error: `Slot ${slot} only accepts ${slotCategory} buildings` });
    if (!rows.length) return res.status(404).json({ error: 'Structures not found' });
    const record    = rows[0];
    const buildings = record.buildings_data;
    const current   = buildings[slot] || { level: 0, building_id: null };
    const isNew     = !current.building_id;
    const nextLevel = (current.level || 0) + 1;
    if (nextLevel > 4) return res.status(400).json({ error: 'Already at max level' });
    buildings[slot] = { level: nextLevel, building_id };
    const updated = await supabase(`/structures?id=eq.${record.id}`, { method: 'PATCH', body: JSON.stringify({ buildings_data: buildings }) });
    if (isNew && def.unit_id) {
      const unitDef = getUnitByDataId(def.unit_id);
      if (unitDef) {
        await supabase('/roster', { method: 'POST', body: JSON.stringify([{ chat_id, unit_data: makeUnitData(unitDef.id, slot), is_hero: false }]) });
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

router.get('/progress', requireAuth, async (req, res) => {
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

router.get('/battle/active', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const record = await getActiveBattle(chat_id);
    if (!record) return res.json({ active: false });
    res.json({ active: true, battle_id: record.battle_id, battle_data: record.battle_data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/battle/state', requireAuth, async (req, res) => {
  const { battle_id } = req.query;
  if (!battle_id) return res.status(400).json({ error: 'battle_id required' });
  try {
    const record = await getBattleState(battle_id);
    if (!record) return res.status(404).json({ error: 'No active battle found' });

    const engine = await rehydrateEngine(record);
    res.json({ state: engine.getSnapshot(), region_id: record.battle_data.region_id, level: record.battle_data.level });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.post('/battle/create', requireAuth, async (req, res) => {
  const { chat_id, battle_id, playerUnitIds, placement, region_id, level, selected_spells } = req.body;
  if (!chat_id || !battle_id || !playerUnitIds || !placement || !region_id || level === undefined) {
    return res.status(400).json({ error: 'chat_id, battle_id, playerUnitIds, placement, region_id, level required' });
  }
  if (!Array.isArray(playerUnitIds) || playerUnitIds.length === 0 || playerUnitIds.length > 6) {
    return res.status(400).json({ error: 'playerUnitIds must be a non-empty array of up to 6 entries' });
  }
  const region = REGIONS.find(r => r.id === region_id);
  if (!region) return res.status(400).json({ error: 'Invalid region_id' });
  if (!region.difficulties?.[`level_${level}`]) return res.status(400).json({ error: 'Invalid level' });
  try {
    const existing = await getActiveBattle(chat_id);
    if (existing) return res.status(400).json({ error: 'A battle is already in progress' });
    const rosterRows = await supabase(
      `/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero`
    );
    const rosterById = {};
    for (const r of rosterRows) rosterById[String(r.id)] = r;

    const playerUnits = [];
    let   heroRosterId = null;
    for (const entry of playerUnitIds) {
      const rosterId = String(entry._rosterId || entry.id);
      const r = rosterById[rosterId];
      if (!r) return res.status(400).json({ error: `Roster unit ${rosterId} not found or does not belong to this player` });
      if (r.is_hero) heroRosterId = rosterId;
      playerUnits.push(buildPlayerUnitFromRosterEntry(r, entry));
    }

    const heroDef    = playerUnits.find(u => u.is_hero);
    if (!heroDef) return res.status(400).json({ error: 'Squad must include a hero' });
    const heroTier   = heroDef.unit_data?.t ?? 1;
    const maxLoyalty = heroTier >= 4 ? 5 : heroTier + 1;

    // Each non-hero unit costs 1 loyalty; 2-tile units (row/column) cost 2
    let loyaltyUsed = 0;
    for (const u of playerUnits) {
      if (u.is_hero) continue;
      const size = u.unit_data?.size ?? 'tile';
      loyaltyUsed += (size === 'row' || size === 'column') ? 2 : 1;
    }
    if (loyaltyUsed > maxLoyalty) {
      return res.status(400).json({
        error: `Squad exceeds loyalty cap (used ${loyaltyUsed}, max ${maxLoyalty} for a tier-${heroTier} hero)`,
      });
    }

    const enemies = getEncounter(region_id, level);
    if (!enemies.length) return res.status(400).json({ error: 'No enemies for this region/level' });

    const engine = await BattleEngine.fromSetup(playerUnits, enemies, placement);

    if (Array.isArray(selected_spells) && selected_spells.length > 1) {
      return res.status(400).json({ error: 'Only one spell may be cast per battle' });
    }
    if (Array.isArray(selected_spells) && selected_spells.length > 0) {
      const playerRows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=learned_spells,faction&limit=1`);
      if (!playerRows.length) return res.status(404).json({ error: 'Player not found' });
      const learnedSpells = playerRows[0].learned_spells || [];

      for (const clientSpell of selected_spells) {
        const spellId = clientSpell.spell_id;
        if (!spellId) return res.status(400).json({ error: 'selected_spells entries must include spell_id' });
        if (!learnedSpells.includes(spellId)) return res.status(403).json({ error: `Spell ${spellId} is not learned` });

        const spellDef = Object.values(SPELLS).flat().find(s => s.id === spellId);
        if (!spellDef) return res.status(400).json({ error: `Spell definition not found for ${spellId}` });

        // Deduct crystal cost server-side before applying effects
        try {
          await consumeCrystalCosts(chat_id, spellDef.cost?.crystals || {});
        } catch (e) {
          return res.status(400).json({ error: e.message });
        }

        const scope    = spellDef.target_scope || '';
        const params   = spellDef.params || {};
        const targetId = clientSpell.target_id ?? null;

        function getTargets() {
          if (scope === 'all_allies')    return engine.combatants.filter(c => c.side === 'player' && c.alive);
          if (scope === 'all_enemies')   return engine.combatants.filter(c => c.side === 'enemy'  && c.alive);
          if (scope === 'single_ally')   return engine.combatants.filter(c => c.side === 'player' && c.alive && (String(c._rosterId) === String(targetId) || String(c._sourceId) === String(targetId) || String(c.id) === String(targetId)));
          if (scope === 'single_enemy')  return engine.combatants.filter(c => c.side === 'enemy'  && c.alive && (String(c.id) === String(targetId) || String(c._sourceId) === String(targetId)));
          if (scope === 'tag_allies') {
            const tag = params.tag_required;
            return engine.combatants.filter(c => c.side === 'player' && c.alive && (c.unit_data?.tags ?? []).includes(tag));
          }
          if (scope === 'tag_enemies') {
            const tag = params.tag_required;
            return engine.combatants.filter(c => c.side === 'enemy' && c.alive && (c.unit_data?.tags ?? []).includes(tag));
          }
          return [];
        }

        const targets = spellDef.effect_type === 'round_trigger_heal' ? [] : getTargets();

        if (spellDef.effect_type === 'round_trigger_heal') {
          engine.pendingRoundEffects.push({
            type:                 'tag_heal_per_unit',
            round:                params.trigger_round,
            side:                 'player',
            tag:                  params.tag_required,
            heal_per_tagged_unit: params.heal_per_tagged_unit,
            name:                 spellDef.name,
          });
        }

        if (spellDef.effect_type === 'tag_count_buff') {
          const taggedCount = playerUnits.filter(u => (u.unit_data?.tags ?? []).includes(params.tag_required)).length;
          const single = engine.combatants.find(c => c.side === 'player' && c.alive && (String(c._rosterId) === String(targetId) || String(c._sourceId) === String(targetId) || String(c.id) === String(targetId)));
          if (single && taggedCount > 0) {
            const hpGain = taggedCount * (params.hp_per_tagged_unit || 0);
            single.max_hp     += hpGain;
            single.battle_hp  += hpGain;
            single.armor       = (single.armor || 0) + taggedCount * (params.armor_per_tagged_unit || 0);
            single.initiative  = Math.max(1, (single.initiative || 40) - taggedCount * (params.initiative_penalty_per_tagged_unit || 0));
          }
        }

        for (const c of targets) {
          if (params.heal_pct)             { const heal = Math.floor(c.max_hp * params.heal_pct); c.battle_hp = Math.min(c.max_hp, (c.battle_hp || 0) + heal); }
          if (params.armor_boost)          c.armor      = (c.armor      || 0) + params.armor_boost;
          if (params.armor_reduction)      c.armor      = Math.max(0, Math.floor((c.armor || 0) * (1 - params.armor_reduction)));
          if (params.max_hp_reduction)     { const cut = Math.floor(c.max_hp * params.max_hp_reduction); c.max_hp = Math.max(1, c.max_hp - cut); c.battle_hp = Math.min(c.battle_hp, c.max_hp); }
          if (params.initiative_boost)     c.initiative = (c.initiative || 40) + params.initiative_boost;
          if (params.initiative_reduction) c.initiative = Math.max(1, Math.floor((c.initiative || 40) * (1 - params.initiative_reduction)));
          if (params.damage_boost)         c._dmg_mult  = (c._dmg_mult || 1) * (1 + params.damage_boost);
          if (params.lifesteal)            c._lifesteal = (c._lifesteal || 0) + params.lifesteal;
          if (params.martyrdom_redirect_pct && c.side === 'player') c.martyrdom_pct = (c.martyrdom_pct || 0) + params.martyrdom_redirect_pct;
          if (params.resistances) {
            for (const [rType, rVal] of Object.entries(params.resistances)) {
              if (!c.unit_data.resistances) c.unit_data.resistances = {};
              c.unit_data.resistances[rType] = (c.unit_data.resistances[rType] || 0) + rVal;
            }
          }
        }
      }
    }

    if (!engine.done) engine.runAiTurns();

    const battle_data = buildBattleData(engine, { region_id, level, selected_spells: Array.isArray(selected_spells) ? selected_spells : [], setup: {
      playerUnitIds: playerUnits.map(u => ({ id: u.id, _rosterId: u._rosterId })),
      placement,
    }});
    const record = await createBattleState({ chat_id, battle_id, battle_data });
    res.json({ record, state: engine.getSnapshot() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/battle/action', requireAuth, async (req, res) => {
  const { chat_id, battle_id, action, actor_id, target_id } = req.body;
  if (!chat_id || !battle_id || !action || !actor_id) return res.status(400).json({ error: 'chat_id, battle_id, action, actor_id required' });
  try {
    const record = await getBattleState(battle_id);
    if (!record) return res.status(404).json({ error: 'No active battle found' });
    if (record.chat_id !== String(chat_id)) return res.status(403).json({ error: 'Forbidden' });

    const engine = await rehydrateEngine(record);
    if (engine.done) return res.status(400).json({ error: 'Battle is already over' });

    const actor = engine.combatants.find(c => c.id === actor_id);
    if (!actor) return res.status(400).json({ error: 'Actor not found' });

    const currentActor = engine.currentActor();
    if (!currentActor || currentActor.id !== actor_id) return res.status(400).json({ error: 'Not this unit\'s turn' });
    if (actor.side !== 'player') return res.status(400).json({ error: 'Cannot control enemy units' });

    let target = null;
    if (target_id) {
      target = engine.combatants.find(c => c.id === target_id);
      if (!target) return res.status(400).json({ error: 'Target not found' });
    }

    if (action === 'attack' || action === 'ability' || action === 'sacrifice') {
      if (!target) return res.status(400).json({ error: 'target_id required for attack/ability/sacrifice' });
      const valid = engine.getValidTargets(actor, action === 'ability');
      if (!valid.some(t => t.id === target_id)) return res.status(400).json({ error: 'Invalid target' });
    }

    if (action === 'none') {
      engine.executeAction(actor, null, 'none');
    } else {
      engine.executeAction(actor, target, action);
    }

    if (!engine.done) {
      engine.runAiTurns();
    }

    const battle_data = buildBattleData(engine, record.battle_data);

    await updateBattleState(battle_id, battle_data);

    res.json({ state: engine.getSnapshot(), done: engine.done, winner: engine.winner });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/battle/advance', requireAuth, async (req, res) => {
  const { chat_id, battle_id } = req.body;
  if (!chat_id || !battle_id) return res.status(400).json({ error: 'chat_id and battle_id required' });
  try {
    const record = await getBattleState(battle_id);
    if (!record) return res.status(404).json({ error: 'No active battle found' });
    if (record.chat_id !== String(chat_id)) return res.status(403).json({ error: 'Forbidden' });

    const engine = await rehydrateEngine(record);
    if (engine.done) return res.status(400).json({ error: 'Battle is already over' });

    const actor = engine.currentActor();
    if (!actor || actor.side !== 'enemy') {
      return res.status(400).json({ error: 'No enemy turn to advance' });
    }

    engine.runAiTurns();

    const battle_data = buildBattleData(engine, record.battle_data);
    await updateBattleState(battle_id, battle_data);

    res.json({ state: engine.getSnapshot(), done: engine.done, winner: engine.winner });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/battle/end', requireAuth, async (req, res) => {
  const { chat_id, battle_id } = req.body;
  if (!chat_id || !battle_id) return res.status(400).json({ error: 'chat_id and battle_id required' });
  try {
    const record = await getBattleState(battle_id);
    if (!record) return res.status(404).json({ error: 'Battle not found' });
    if (record.chat_id !== String(chat_id)) return res.status(403).json({ error: 'Forbidden' });
    await persistBattleRosterState(chat_id, record.battle_data);
    await closeBattleState(battle_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/battle/reward', requireAuth, async (req, res) => {
  const { chat_id, battle_id, survivor_ids } = req.body;
  if (!chat_id || !battle_id) {
    return res.status(400).json({ error: 'chat_id and battle_id required' });
  }
  try {
    const record = await getBattleState(battle_id);
    if (!record) return res.status(404).json({ error: 'Battle not found' });
    if (record.chat_id !== String(chat_id)) return res.status(403).json({ error: 'Battle does not belong to this player' });
    if (!record.battle_active) return res.status(400).json({ error: 'Rewards already claimed' });
    if (!record.battle_data?.done) return res.status(400).json({ error: 'Battle is not finished yet' });

    await persistBattleRosterState(chat_id, record.battle_data);

    const { region_id, level } = record.battle_data;
    const won = record.battle_data?.winner === 'player';
    const region = REGIONS.find(r => r.id === region_id);
    if (!region) return res.status(404).json({ error: 'Region not found' });
    const levelDef = region.difficulties?.[`level_${level}`];
    if (!levelDef) return res.status(404).json({ error: 'Level not found' });
    const rewards = levelDef.rewards;
    const result  = { xp_granted: 0, gold: 0, crystal: 0, crystal_bonus: 0, crystal_bonus_type: null, progress_unlocked: false };
    if (won) {
      const inventoryRows = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`);
      const updateItem = async (itemName, amount) => {
        const row = inventoryRows.find(r => r.item === itemName);
        if (!row) return;
        await supabase(`/resources?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(row.amount) + amount }) });
      };
      const crystalAmount  = Math.round(6 * (1 + (level - 1) * 0.3));
      const guaranteedType = region.crystal_guaranteed;
      const pool           = region.crystal_pool || [guaranteedType];
      const randomType     = pool[Math.floor(Math.random() * pool.length)];
      await updateItem('Gold', rewards.gold);
      await updateItem(guaranteedType, crystalAmount);
      if (randomType !== guaranteedType) {
        await updateItem(randomType, 1);
        result.crystal_bonus      = 1;
        result.crystal_bonus_type = randomType;
      }
      result.gold    = rewards.gold;
      result.crystal = crystalAmount;

      const activeTrophySpell = (record.battle_data.selected_spells || [])
        .map(s => Object.values(SPELLS).flat().find(sp => sp.id === s.spell_id))
        .find(sp => sp && sp.effect_type === 'trophy_gain' && sp.region === region_id);
      if (activeTrophySpell && region.trophies?.length) {
        const trophy = region.trophies[Math.floor(Math.random() * region.trophies.length)];
        const trophyRow = inventoryRows.find(r => r.item === trophy.id);
        if (trophyRow) {
          await supabase(`/resources?id=eq.${trophyRow.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(trophyRow.amount) + 1 }) });
        } else {
          await supabase('/resources', { method: 'POST', body: JSON.stringify({ chat_id: String(chat_id), item_type: 'trophy', item: trophy.id, amount: 1 }) });
        }
        result.trophy_gained = trophy.id;
        result.trophy_label  = trophy.label;
      }

      const validSurvivorIds = getAlivePlayerRosterIds(record.battle_data);

      if (validSurvivorIds.length > 0) {
        const xpEach = Math.floor(rewards.xp / validSurvivorIds.length);
        result.xp_granted = xpEach;
        await Promise.all(validSurvivorIds.map(async (rosterId) => {
          const rows = await supabase(`/roster?id=eq.${encodeURIComponent(rosterId)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data`);
          if (!rows.length) return;
          const current        = rows[0];
          const updatedUnitData = { ...current.unit_data, current_xp: (current.unit_data?.current_xp ?? 0) + xpEach };
          await supabase(`/roster?id=eq.${encodeURIComponent(current.id)}`, { method: 'PATCH', body: JSON.stringify({ unit_data: updatedUnitData }) });
        }));
      }
      const playerRows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
      if (playerRows.length) {
        const progress     = playerRows[0].progress || {};
        const currentLevel = progress[region_id] ?? 1;
        const maxLevel     = Object.keys(region.difficulties).length;
        if (level >= currentLevel && level < maxLevel) {
          progress[region_id] = level + 1;
          await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}`, { method: 'PATCH', body: JSON.stringify({ progress }) });
          result.progress_unlocked = true;
          result.next_level        = level + 1;
        }
      }
    }

    await closeBattleState(battle_id);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/spells/research', requireAuth, async (req, res) => {
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

router.post('/spells/research', requireAuth, async (req, res) => {
  const { chat_id, spell_id } = req.body;
  if (!chat_id || !spell_id) return res.status(400).json({ error: 'chat_id, spell_id required' });
  try {
    const [playerRows, structRows] = await Promise.all([
      supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
    ]);
    if (!playerRows.length) return res.status(404).json({ error: 'Player not found' });
    if (!structRows.length)  return res.status(404).json({ error: 'Structures not found' });
    const faction = playerRows[0].faction;
    if (!faction) return res.status(400).json({ error: 'Player has no faction' });
    const factionSpells = SPELLS[faction] || [];
    const spell = factionSpells.find(s => s.id === spell_id);
    if (!spell) return res.status(404).json({ error: 'Spell not found for your faction' });
    const learned     = playerRows[0].learned_spells || [];
    const throneLevel = structRows[0].buildings_data['slot_0']?.level || 1;
    const spellTier   = spell.tier || 1;
    if (learned.includes(spell_id)) return res.status(400).json({ error: 'Spell already researched' });
    if (throneLevel < spellTier) return res.status(400).json({ error: `Throne level ${spellTier} required to research this spell` });
    try {
      await consumeCrystalCosts(chat_id, spell.cost?.crystals || {});
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const newLearned = [...learned, spell_id];
    await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}`, { method: 'PATCH', body: JSON.stringify({ learned_spells: newLearned }) });
    res.json({ success: true, learned_spells: newLearned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/structures/mercenary/recruit', requireAuth, async (req, res) => {
  const { chat_id, mercenary_building_id, slot } = req.body;
  if (!chat_id || !mercenary_building_id || !slot) return res.status(400).json({ error: 'chat_id, mercenary_building_id, and slot required' });
  try {
    const allMercBuildings = Object.values(MERCENARY_BUILDINGS).flat();
    const bDef = allMercBuildings.find(b => b.id === mercenary_building_id);
    if (!bDef) return res.status(404).json({ error: 'Mercenary building not found' });

    const slotCategory = SLOT_CATEGORIES[slot];
    if (slotCategory !== 'special') return res.status(400).json({ error: 'Mercenaries can only be placed in special slots' });

    const [structRows, inventoryRows] = await Promise.all([
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
    ]);
    if (!structRows.length) return res.status(404).json({ error: 'Structures not found' });

    const record = structRows[0];
    const slots  = record.buildings_data || {};
    if (slots[slot]?.building_id) return res.status(400).json({ error: 'Slot already occupied' });

    const cost = bDef.cost || {};
    for (const [item, required] of Object.entries(cost)) {
      const row = inventoryRows.find(r => r.item === item);
      const have = row ? Number(row.amount) : 0;
      if (have < required) return res.status(400).json({ error: `Not enough ${item} (need ${required}, have ${have})` });
    }

    for (const [item, required] of Object.entries(cost)) {
      const row = inventoryRows.find(r => r.item === item);
      if (!row) continue;
      await supabase(`/resources?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(row.amount) - required }) });
    }

    const { UNITS } = require('../data/units');
    const unitTemplate = UNITS.enemies?.[bDef.region]?.[bDef.unit_id];
    if (!unitTemplate) return res.status(500).json({ error: 'Unit definition not found' });

    slots[slot] = { level: 1, building_id: mercenary_building_id };
    const [updatedStruct, inserted] = await Promise.all([
      supabase(`/structures?id=eq.${record.id}`, { method: 'PATCH', body: JSON.stringify({ buildings_data: slots }) }),
      supabase('/roster', { method: 'POST', body: JSON.stringify({
        chat_id:   String(chat_id),
        is_hero:   false,
        unit_data: {
          ...unitTemplate,
          mercenary:        true,
          mercenary_region: bDef.region,
          alive:            true,
          current_hp:       unitTemplate.hp,
          current_xp:       0,
          tier:             bDef.tier,
        },
      }), headers: { Prefer: 'return=representation' } }),
    ]);
    res.json({ success: true, structures: Array.isArray(updatedStruct) ? updatedStruct[0] : updatedStruct, roster_entry: Array.isArray(inserted) ? inserted[0] : inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/structures/mercenary/upgrade', requireAuth, async (req, res) => {
  const { chat_id, roster_id, mercenary_building_id, slot } = req.body;
  if (!chat_id || !roster_id || !mercenary_building_id || !slot) return res.status(400).json({ error: 'chat_id, roster_id, mercenary_building_id, and slot required' });
  try {
    const allMercBuildings = Object.values(MERCENARY_BUILDINGS).flat();
    const bDef = allMercBuildings.find(b => b.id === mercenary_building_id);
    if (!bDef) return res.status(404).json({ error: 'Mercenary building not found' });

    const [rosterRows, structRows, inventoryRows] = await Promise.all([
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero`),
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
    ]);
    if (!rosterRows.length) return res.status(404).json({ error: 'Roster entry not found' });
    if (!structRows.length) return res.status(404).json({ error: 'Structures not found' });

    const record  = structRows[0];
    const slots   = record.buildings_data || {};
    if (slots[slot]?.building_id !== rosterRows[0].unit_data?.mercenary_building_id_ref &&
        !allMercBuildings.some(b => b.id === slots[slot]?.building_id)) {
      return res.status(400).json({ error: 'Slot does not contain a mercenary' });
    }

    const cost = bDef.cost || {};
    for (const [item, required] of Object.entries(cost)) {
      const row = inventoryRows.find(r => r.item === item);
      const have = row ? Number(row.amount) : 0;
      if (have < required) return res.status(400).json({ error: `Not enough ${item} (need ${required}, have ${have})` });
    }

    for (const [item, required] of Object.entries(cost)) {
      const row = inventoryRows.find(r => r.item === item);
      if (!row) continue;
      await supabase(`/resources?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(row.amount) - required }) });
    }

    const { UNITS } = require('../data/units');
    const unitTemplate = UNITS.enemies?.[bDef.region]?.[bDef.unit_id];
    if (!unitTemplate) return res.status(500).json({ error: 'Unit definition not found' });

    const oldUnitData = rosterRows[0].unit_data || {};
    const newUnitData = {
      ...unitTemplate,
      mercenary:        true,
      mercenary_region: bDef.region,
      alive:            oldUnitData.alive !== false,
      current_hp:       Math.min(unitTemplate.hp, oldUnitData.current_hp ?? unitTemplate.hp),
      current_xp:       oldUnitData.current_xp ?? 0,
      tier:             bDef.tier,
    };

    slots[slot] = { level: bDef.tier, building_id: mercenary_building_id };

    const [updatedStruct] = await Promise.all([
      supabase(`/structures?id=eq.${record.id}`, { method: 'PATCH', body: JSON.stringify({ buildings_data: slots }) }),
      supabase(`/roster?id=eq.${roster_id}`, { method: 'PATCH', body: JSON.stringify({ unit_data: newUnitData }) }),
    ]);

    const updatedRoster = await supabase(`/roster?id=eq.${roster_id}&select=id,chat_id,unit_data,is_hero`);
    res.json({ success: true, structures: Array.isArray(updatedStruct) ? updatedStruct[0] : updatedStruct, roster_entry: updatedRoster[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;