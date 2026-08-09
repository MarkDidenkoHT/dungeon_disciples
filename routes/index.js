const express = require('express');
const router = express.Router();

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const { UNITS } = require('../data/units');
const { REGIONS, getEncounter, getEncounterSpellId, getLevelRewards } = require('../data/embark');
const { getEquipBlock } = require('../data/item_rules');
const { RESPEC_COST_PCT, getRespecOptions, getRespecCost, FACTION_CRYSTAL } = require('../data/buildings');
const { BUILDING_POOLS, SLOT_CATEGORIES, UNIT_UPGRADE_PATHS, HERO_MAX_LEVEL, THRONE_UPGRADE_COSTS, THRONE_PERKS, getThronePerkEmbarkBonuses, getSpellCostReductionPct, getBuildingDef, upgradeReaches, resolveUpgradeBranch, upgradeBranchCandidates, emptyStructures, MERCENARY_BUILDINGS } = require('../data/buildings');
const { BattleEngine } = require('../utils/battle-engine');
const {
  getActiveBattle,
  getBattleState,
  createBattleState,
  updateBattleState,
  closeBattleState,
  appendBattleLogEntries,
  getBattleLogs,
  getBattleLogsSince,
} = require('../utils/realtime');
const { SPELLS } = require('../data/spells');
const { telegramWebhookHandler } = require('../utils/telegram');
const { ITEM_DEFS, applyItemModifiers, meetsCraftRequirements, craftRequirementText } = require('../data/items');
const { UNIT_ABILITIES } = require('../data/unit_abilities');

const ASSETS_DIR = path.join(__dirname, '..', 'public', 'assets');
const MANIFEST_FOLDERS = {
  ui:            'icons/ui',
  recources:     'icons/recources',
  spells:        'icons/spells',
  abilities:     'icons/abilities',
  screens:       'screens',
  character_art: 'character_art',
  character_portraits: 'character_portraits',
};

function listAssetFolder(relFolder) {
  const dir = path.join(ASSETS_DIR, relFolder);
  try {
    return fs.readdirSync(dir)
      .filter(f => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f))
      .map(f => `/assets/${relFolder}/${f}`);
  } catch {
    return [];
  }
}

router.get('/assets-manifest', (req, res) => {
  const manifest = {};
  for (const [key, relFolder] of Object.entries(MANIFEST_FOLDERS)) {
    manifest[key] = listAssetFolder(relFolder);
  }
  res.json(manifest);
});

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

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Granted once, when the player picks a faction (see /player/faction). Neutral,
// tag-free gear so it equips on any hero — the roster tutorial walks the player
// through putting it on.
const STARTING_ITEM_KEYS = ['padded_armor'];

// Shapes an ITEM_DEFS entry into an /items row. The item_stats snapshot is what
// equip/craft read back, so this must stay the single source of that shape.
function makeItemRow(playerId, itemKey) {
  const def = ITEM_DEFS[itemKey];
  if (!def) return null;
  return {
    player_id:  playerId,
    item_name:  def.name,
    item_stats: {
      key:          def.key,
      faction:      def.faction,
      tag_required: def.tag_required,
      adds_tag:     def.adds_tag,
      stat_mods:    def.stat_mods,
      passive:      def.passive,
      icon:         def.icon,
      unique:       def.unique ?? false,
    },
  };
}

// Sized against data/buildings.js AND the throne track, because the throne is
// part of the opening too:
//   throne level 1   free (the tutorial's first tap)
//   one large dwelling  60 gold + 30 crystals
//   one small dwelling  40 gold + 20 crystals
//   throne level 2     150 gold   <- gates the hero's first level-up
// 200 gold covered the dwellings and left the player 50 short of the throne,
// stuck farming 15-gold level-1 runs before their hero could advance. 300 covers
// the whole opening with a little slack.
// The faction's own crystal is topped up to STARTING_FACTION_CRYSTAL when the
// faction is picked (this table is written before that choice exists).
// 60 covered the worst case exactly: a large and a small dwelling whose units
// BOTH use the faction's own element, so the faction and element halves of the
// cost merge (30 + 30). Exactly-enough left no room to make a single different
// choice, so it is 80 — the same worst case plus slack. 25 of every other
// crystal covers the same worst case for an element that is not the faction's
// (15 + 10).
const STARTING_FACTION_CRYSTAL = 80;
const STARTING_RESOURCES = [
  { item_type: 'resource', item: 'Gold',            amount: 300 },
  { item_type: 'resource', item: 'Crystals_Life',   amount: 25  },
  { item_type: 'resource', item: 'Crystals_Fire',   amount: 25  },
  { item_type: 'resource', item: 'Crystals_Death',  amount: 25  },
  { item_type: 'resource', item: 'Crystals_Nature', amount: 25  },
  { item_type: 'resource', item: 'Crystals_Frost',  amount: 25  },
  { item_type: 'resource', item: 'Crystals_Air',    amount: 25  },
];

// Both support (non-combat) spells plus the faction's first buff, pre-learned so
// the opening spell tutorial can teach revive, heal, and buff. The buff is
// normally throne-2 gated, but pre-granting bypasses the research gate.
const FACTION_STARTING_SPELLS = {
  empire:              ['e_spell_1', 'e_spell_2', 'e_spell_3'],
  choir_of_the_cursed: ['d_spell_1', 'd_spell_2', 'd_spell_3'],
  grail_of_sorrow:     ['g_spell_1', 'g_spell_2', 'g_spell_3'],
};

const HERO_IDS = ['h_e_1', 'h_e_2', 'h_e_3', 'h_d_1', 'h_d_2', 'h_d_3', 'h_g_1', 'h_g_2', 'h_g_3'];

const HERO_STARTING_UNITS = {
  h_e_1: { building_id: 'acolyte_shrine',     unit_id: 'e2',  slot: 'slot_4' },
  h_e_2: { building_id: 'conscript_barracks',         unit_id: 'e1',  slot: 'slot_4' },
  h_e_3: { building_id: 'sentinel_forge', unit_id: 'e3',  slot: 'slot_4' },
  h_d_1: { building_id: 'peer_court',        unit_id: 'd6',  slot: 'slot_4' },
  h_d_2: { building_id: 'imp_den',        unit_id: 'd1',  slot: 'slot_4' },
  h_d_3: { building_id: 'flame_spawn_pit',        unit_id: 'd7',  slot: 'slot_4' },
  h_g_1: { building_id: 'communicant_chapel',         unit_id: 'gs2', slot: 'slot_4' },
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
  for (const [key, factionPool] of Object.entries(UNITS)) {
    if (typeof factionPool !== 'object' || Array.isArray(factionPool)) continue;
    // `enemies` nests one level deeper (region -> slug -> unit), so a flat scan
    // silently missed every mercenary. That is why a mercenary's definition
    // could not be found by id, and with it its `xp` threshold and stats.
    if (key === 'enemies') {
      for (const regionPool of Object.values(factionPool)) {
        if (typeof regionPool !== 'object') continue;
        const hit = Object.values(regionPool).find(u => u?.id === unitDataId);
        if (hit) return hit;
      }
      continue;
    }
    const found = Object.values(factionPool).find(u => u?.id === unitDataId);
    if (found) return found;
  }
  return null;
}

// Enemy/mercenary units are keyed by name slug (e.g. `bone_knight`), not by their
// `id` (`dm_e1`), so mercenary building defs — which reference the id — must look
// the template up by scanning the region rather than indexing into it.
function findEnemyUnit(region, unitId) {
  const pool = UNITS.enemies?.[region];
  if (!pool) return null;
  return Object.values(pool).find(u => u?.id === unitId) || null;
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

async function getItemsByRosterIds(rosterIds) {
  const ids = [...new Set((rosterIds || []).map(String))].filter(Boolean);
  if (!ids.length) return {};
  const orFilter = ids.map(id => `equipped_by.eq.${id}`).join(',');
  const rows = await supabase(`/items?or=(${orFilter})&select=id,item_name,item_stats,equipped_by`);
  const map = {};
  for (const row of rows) map[String(row.equipped_by)] = row;
  return map;
}

// Unequipping only clears the link. Item stats are never baked into the roster
// row — they are derived from the worn item wherever the unit is used.
async function unequipItemFromRosterUnit(item, rosterId) {
  await supabase(`/items?id=eq.${item.id}`, { method: 'PATCH', body: JSON.stringify({ equipped_by: null }) });
}

async function getPlayerByChatId(chat_id) {
  // `progress` rides along for the craft gate (data/items.js `requires`), which
  // both /bootstrap and /items/craft read off this same lookup. `timezone` and
  // `adds_daily_view` are what /bootstrap needs to report the remaining daily
  // favors — the day rollover is computed from the player's local date.
  const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,faction,progress,timezone,adds_daily_view&limit=1`);
  return rows[0] || null;
}

function buildPlayerUnitFromRosterEntry(r, entry, itemsByRosterId = {}) {
  const def = getUnitByDataId(r.unit_data?.unit_id);
  if (!def) throw new Error(`Unit definition for ${r.unit_data?.unit_id} not found`);
  let unit_data = { ...def, ...(r.unit_data || {}) };
  const item = itemsByRosterId[String(r.id)];
  if (item) unit_data = applyItemModifiers(unit_data, item.item_stats);
  return {
    id:              String(entry.id),
    _rosterId:       String(entry._rosterId || entry.id),
    unit_data,
    unit_name:       def.name || def.id,
    is_hero:         !!r.is_hero,
    _equipped_item:  item ? { id: item.id, item_name: item.item_name, item_stats: item.item_stats } : null,
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

  const itemsByRosterId = await getItemsByRosterIds(rosterRows.map(r => r.id));

  const playerUnits = playerUnitIds.map(entry => {
    const rosterId = String(entry._rosterId || entry.id);
    const r = rosterById[rosterId];
    if (!r) throw new Error(`Roster unit ${entry._rosterId || entry.id} not found`);
    return buildPlayerUnitFromRosterEntry(r, entry, itemsByRosterId);
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

// `abandoned` is the penalty path: the player walked out of a battle that was
// still running. Without it, quitting a fight that is going badly is strictly
// better than losing it — the party keeps whatever HP it had left and the dead
// are the only cost. So: the dead STAY dead (no take-backs), and every survivor
// is written back at 1 HP regardless of what they had. Nothing is free.
async function persistBattleRosterState(chat_id, battle_data, { abandoned = false } = {}) {
  if (!battle_data || !Array.isArray(battle_data.units)) return;
  const playerUnits = battle_data.units.filter(u => u.side === 'player' && u._rosterId != null);
  await Promise.all(playerUnits.map(async (unit) => {
    const rosterId = String(unit._rosterId);
    const rows = await supabase(
      `/roster?id=eq.${encodeURIComponent(rosterId)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data`
    );
    if (!rows.length) return;
    const current = rows[0];
    const def = getUnitByDataId(current.unit_data?.unit_id);
    const baseMaxHp = def?.hp ?? Number(current.unit_data?.max_hp ?? 0);
    const rawHp = Number.isFinite(Number(unit.battle_hp)) ? Number(unit.battle_hp) : 0;
    const clampedHp = Math.min(rawHp, baseMaxHp);
    const alive = unit.alive !== false;
    const survivorHp = abandoned ? Math.min(1, baseMaxHp) : Math.max(0, clampedHp);
    const updatedUnitData = {
      ...current.unit_data,
      alive,
      current_hp: alive ? survivorHp : 0,
      max_hp:     baseMaxHp,
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

// Expedition passives (data/unit_abilities.js, trigger 'on_embark_complete').
// Every copy across the party contributes — a unit's own passives AND its
// equipped item's — and same-kind bonuses SUM: two Scavenger 1 units plus a
// Scavenger's Satchel is a flat +30% gold. servitudeIds are the roster ids that
// keep their XP share when dead (Unending Servitude is self-scoped).
function collectEmbarkBonuses(rosterRows, itemsByRosterId) {
  const totals = { heal_pct: 0, xp_pct: 0, gold_pct: 0, crystal_pct: 0 };
  const servitudeIds = new Set();
  for (const r of rosterRows) {
    const def = getUnitByDataId(r.unit_data?.unit_id);
    const own = r.unit_data?.passive ?? def?.passive;
    const keys = Array.isArray(own) ? [...own] : (own ? [own] : []);
    const item = itemsByRosterId[String(r.id)];
    if (item?.item_stats?.passive) keys.push(item.item_stats.passive);
    for (const key of keys) {
      const p = UNIT_ABILITIES[key]?.params;
      if (!p) continue;
      totals.heal_pct    += p.embark_heal_pct          ?? 0;
      totals.xp_pct      += p.embark_xp_bonus_pct      ?? 0;
      totals.gold_pct    += p.embark_gold_bonus_pct    ?? 0;
      totals.crystal_pct += p.embark_crystal_bonus_pct ?? 0;
      if (p.dead_unit_gains_xp) servitudeIds.add(String(r.id));
    }
  }
  return { totals, servitudeIds };
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

// ── Automatic level-up ──────────────────────────────────────────────────────
// A unit that has both the XP and the building it needs has nothing left to
// decide, so making the player find it in the roster and press a button is just
// bookkeeping. This runs after a victory awards XP, and again whenever a
// building is raised, so whichever half arrives second completes the upgrade.
//
// DELIBERATELY CONSERVATIVE — it only ever fires when the outcome is certain:
//   * the building standing in the unit's slot must actually support the
//     upgrade (unlike the manual endpoint, which lets a single-path unit
//     advance with nothing built);
//   * a branch the player has not committed to is never guessed. An ambiguous
//     tree is left for them to choose in the roster.
function buildingSupportsUpgrade(faction, path, buildingId) {
  if (!buildingId) return false;
  if (buildingId === path.building_id) return true;
  // Built PAST this tier already — the slot leads to the same place.
  const built = getBuildingDef(faction, buildingId);
  return !!built?.unit_id && upgradeReaches(faction, path.unit_id, built.unit_id);
}

// Returns the new unit_data, or null when the unit cannot advance right now.
function resolveAutoLevelUp(row, buildingsData) {
  const unitData = row?.unit_data || {};
  const currentUnitId = unitData.unit_id;
  if (!currentUnitId) return null;

  const faction = getFactionForUnit(currentUnitId);
  if (!faction) return null;
  const paths = (UNIT_UPGRADE_PATHS[faction] || {})[currentUnitId];
  if (!paths || !paths.length) return null;

  const def = getUnitByDataId(currentUnitId);
  const xpRequired = def?.xp;
  if (xpRequired == null || (unitData.current_xp ?? 0) < xpRequired) return null;

  const buildingSlot = unitData.building_slot || null;
  if (!buildingSlot) return null;
  const currentBuildingId = buildingsData?.[buildingSlot]?.building_id || null;

  if (row.is_hero) {
    const currentTier = def.t ?? 1;
    const throneLevel = buildingsData?.['slot_0']?.level ?? 0;
    if (currentTier >= HERO_MAX_LEVEL) return null;
    if (currentTier >= throneLevel) return null;   // throne must lead the hero
  }

  const candidates = upgradeBranchCandidates(faction, paths, currentBuildingId);
  if (candidates.length !== 1) return null;        // ambiguous or nothing fits
  const path = candidates[0];
  if (!buildingSupportsUpgrade(faction, path, currentBuildingId)) return null;

  const nextDef = getUnitByDataId(path.unit_id);
  if (!nextDef) return null;

  const newUnitData = makeUnitData(nextDef.id, buildingSlot);
  newUnitData.current_xp = unitData.current_xp ?? 0;
  const oldHp = Number(unitData.current_hp ?? unitData.max_hp ?? 0);
  if (oldHp > 0) newUnitData.current_hp = Math.min(newUnitData.max_hp, oldHp);
  newUnitData.alive = unitData.alive !== false;
  return { unitData: newUnitData, from: currentUnitId, to: path.unit_id };
}

// Runs resolveAutoLevelUp over a set of roster rows and persists whatever
// advanced. Returns the list of upgrades for the client to report.
async function applyAutoLevelUps(rows, buildingsData) {
  const upgraded = [];
  await Promise.all((rows || []).map(async row => {
    const result = resolveAutoLevelUp(row, buildingsData);
    if (!result) return;
    await supabase(`/roster?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH', body: JSON.stringify({ unit_data: result.unitData }),
    });
    upgraded.push({ roster_id: String(row.id), from: result.from, to: result.to });
  }));
  return upgraded;
}

router.post('/login', async (req, res) => {
  const { initData, timezone } = req.body;
  if (!initData) return res.status(400).json({ error: 'initData required' });
  const telegramUser = validateTelegramInitData(initData);
  if (!telegramUser) return res.status(401).json({ error: 'Invalid Telegram auth' });
  const chat_id = String(telegramUser.id);
  const session_token = generateSessionToken();
  try {
    const existing = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (existing.length > 0) {
      const mergedSettings = { ...(existing[0].settings || {}), language: existing[0].settings?.language || telegramUser.language_code || 'en' };
      const patchBody = { session_token, settings: mergedSettings };
      if (timezone) patchBody.timezone = timezone;
      const updated = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      });
      let activeRec = null;
      try { activeRec = await getActiveBattle(chat_id); } catch (e) {}
      return res.json({
        player: updated[0],
        session_token,
        isNew: false,
        active: Boolean(activeRec),
        battle_id: activeRec ? activeRec.battle_id : null,
        battle_data: activeRec ? activeRec.battle_data : null,
      });
    }
    const newPlayerBody = {
      chat_id,
      username: telegramUser.username || null,
      first_name: telegramUser.first_name || null,
      session_token,
      settings: { language: telegramUser.language_code || 'en', notifications: true, music_enabled: true, sfx_enabled: true, barks_enabled: true },
    };
    if (timezone) newPlayerBody.timezone = timezone;
    const created = await supabase('/players', {
      method: 'POST',
      body: JSON.stringify(newPlayerBody),
    });
    let activeRec = null;
    try { activeRec = await getActiveBattle(chat_id); } catch (e) {}
    res.json({
      player: created[0],
      session_token,
      isNew: true,
      active: Boolean(activeRec),
      battle_id: activeRec ? activeRec.battle_id : null,
      battle_data: activeRec ? activeRec.battle_data : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Telegram bot webhook (welcome flow lives in utils/telegram.js). Register once:
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<HOST>/api/telegram/webhook&secret_token=<SECRET>"
router.post('/telegram/webhook', telegramWebhookHandler);

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

router.post('/player/settings', requireAuth, async (req, res) => {
  const { player_id, chat_id, settings } = req.body;
  if (!player_id || !chat_id || !settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'player_id, chat_id, and settings required' });
  }
  try {
    const existing = await supabase(`/players?id=eq.${encodeURIComponent(player_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=settings&limit=1`);
    if (!existing.length) return res.status(404).json({ error: 'Player not found' });
    const mergedSettings = { ...(existing[0].settings || {}), ...settings };
    const updated = await supabase(`/players?id=eq.${encodeURIComponent(player_id)}&chat_id=eq.${encodeURIComponent(chat_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ settings: mergedSettings }),
    });
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/player/reset', requireAuth, async (req, res) => {
  const { player_id, chat_id } = req.body;
  if (!player_id || !chat_id) {
    return res.status(400).json({ error: 'player_id and chat_id required' });
  }
  try {
    const battles = await supabase(`/battle_state?chat_id=eq.${encodeURIComponent(chat_id)}&select=battle_id`);
    const battleIds = [...new Set((battles || []).map(b => b.battle_id).filter(Boolean))];
    await Promise.all(battleIds.map(id =>
      supabase(`/battle_log?battle_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
    ));

    await supabase(`/battle_state?chat_id=eq.${encodeURIComponent(chat_id)}`, { method: 'DELETE' });
    
    const rosterEntries = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id`);
    const rosterIds = rosterEntries.map(r => r.id);
    
    if (rosterIds.length) {
      await Promise.all(rosterIds.map(id =>
        supabase(`/items?equipped_by=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
      ));
    }
    
    await supabase(`/items?player_id=eq.${encodeURIComponent(player_id)}`, { method: 'DELETE' });
    await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}`, { method: 'DELETE' });
    await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}`, { method: 'DELETE' });
    
    const deleteResult = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`, { method: 'DELETE' });
    
    const verifyBeforeInsert = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`);
    if (verifyBeforeInsert.length > 0) {
      throw new Error(`Failed to delete resources: ${verifyBeforeInsert.length} records remain`);
    }

    // Seeded so a reset player who never reaches faction select still reads a
    // sane bar. /player/faction deletes these and re-seeds with the faction
    // crystal bonus, so this set is provisional — do not treat it as final.
    await supabase('/resources', {
      method: 'POST',
      body: JSON.stringify(STARTING_RESOURCES.map(r => ({ ...r, chat_id }))),
    });

    const existingPlayer = await supabase(`/players?id=eq.${encodeURIComponent(player_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=timezone&limit=1`);
    const preservedTimezone = existingPlayer[0]?.timezone ?? null;

    const emptySlots = emptyStructures();
    await supabase('/structures', {
      method: 'POST',
      body: JSON.stringify({ chat_id, buildings_data: emptySlots }),
    });

    const updated = await supabase(`/players?id=eq.${encodeURIComponent(player_id)}&chat_id=eq.${encodeURIComponent(chat_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        faction: null,
        hero: null,
        progress: null,
        learned_spells: null,
        tutorials: null,
        timezone: preservedTimezone,
      }),
    });

    const verifyResources = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`);
    
    res.json({ 
      player: updated[0],
      resources: verifyResources
    });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/player/tutorials', requireAuth, async (req, res) => {
  const { player_id, chat_id, tutorials } = req.body;
  if (!player_id || !chat_id || !tutorials || typeof tutorials !== 'object') {
    return res.status(400).json({ error: 'player_id, chat_id, and tutorials required' });
  }
  try {
    const existing = await supabase(`/players?id=eq.${encodeURIComponent(player_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=tutorials&limit=1`);
    if (!existing.length) return res.status(404).json({ error: 'Player not found' });
    const mergedTutorials = { ...(existing[0].tutorials || {}), ...tutorials };
    const updated = await supabase(`/players?id=eq.${encodeURIComponent(player_id)}&chat_id=eq.${encodeURIComponent(chat_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ tutorials: mergedTutorials }),
    });
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/bootstrap', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    // Items ride along with the rest: roster, battle-prep and battle all need
    // them, and fetching them here costs one extra parallel query instead of a
    // separate round-trip per screen.
    const player = await getPlayerByChatId(chat_id);
    const [resources, trophies, structRows, roster, items] = await Promise.all([
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}&item_type=eq.resource`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}&item_type=eq.trophy`),
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
      supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero`),
      player
        ? supabase(`/items?player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`)
        : Promise.resolve([]),
    ]);
    res.json({
      resources,
      trophies,
      items,
      structures: structRows[0] || null,
      roster,
      // Embark progress rides along so the roster's craft catalog can gate
      // blueprints (data/items.js `requires`) without a second round-trip.
      progress: player?.progress || {},
      buildings: {
        pools:                BUILDING_POOLS,
        slot_categories:      SLOT_CATEGORIES,
        upgrade_paths:        UNIT_UPGRADE_PATHS,
        hero_max_level:       HERO_MAX_LEVEL,
        throne_upgrade_costs: THRONE_UPGRADE_COSTS,
        throne_perks:         THRONE_PERKS,
        mercenary_buildings:  MERCENARY_BUILDINGS,
        respec_cost_pct:      RESPEC_COST_PCT,
      },
      // How many divine favors (rewarded ads) are left today, so the roster can
      // label the button without its own round-trip. Read-only — spending still
      // goes through /favor/start + /favor/claim.
      favor: {
        remaining: player ? Math.max(0, FAVOR_DAILY_CAP - favorRecordFor(player).count) : 0,
        cap:       FAVOR_DAILY_CAP,
        seconds:   FAVOR_AD_SECONDS,
      },
    });
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
  // slot_0 (Throne) intentionally starts empty (level 0) - the tutorial's first
  // tap on the throne triggers a free build to level 1 via /structures/build
  // (see the isNew branch there). The hero still gets building_slot: 'slot_0'
  // now so upgrade-path resolution works once that build happens.
  const unitDef = startingUnit ? getUnitByDataId(startingUnit.unit_id) : null;
  // The bonus unit starts DEAD so the opening spell tutorial has something to
  // revive (then heal). The hero is alive and armed as usual.
  const rosterEntries = [
    { chat_id, unit_data: makeUnitData(heroDef.id, 'slot_0'), is_hero: true },
    ...(unitDef ? [{ chat_id, unit_data: { ...makeUnitData(unitDef.id, startingUnit.slot), alive: false, current_hp: 0 }, is_hero: false }] : []),
  ];
  const startingItems = STARTING_ITEM_KEYS.map(k => makeItemRow(player_id, k)).filter(Boolean);
  try {
    const existingStruct = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    const structuresWrite = existingStruct.length
      ? supabase(`/structures?id=eq.${existingStruct[0].id}`, { method: 'PATCH', body: JSON.stringify({ buildings_data: structures }) })
      : supabase('/structures', { method: 'POST', body: JSON.stringify({ chat_id, buildings_data: structures }) });

    // Wipe any existing resource rows before seeding. /player/reset already
    // seeds a starting set, so without this a reset -> pick-faction cycle left
    // TWO rows per resource. Every reader here uses .find(), which takes the
    // first match, so one row would be spent while its stale twin survived and
    // resurfaced later — the "resources aren't deleted on restart" bug.
    // Deleting here also makes this endpoint idempotent on its own.
    await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`, { method: 'DELETE' });

    const [updated] = await Promise.all([
      supabase(`/players?id=eq.${player_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ faction, hero: hero_id, learned_spells: FACTION_STARTING_SPELLS[faction] || [] }),
      }),
      supabase('/roster', { method: 'POST', body: JSON.stringify(rosterEntries) }),
      // The faction's own crystal starts higher than the rest — dwellings are
      // paid for in it, and 50 covers a tier-1 large (30) plus a small (20).
      supabase('/resources', { method: 'POST', body: JSON.stringify(
        STARTING_RESOURCES.map(r => ({
          ...r,
          chat_id,
          amount: r.item === FACTION_CRYSTAL[faction]
            ? Math.max(r.amount, STARTING_FACTION_CRYSTAL)
            : r.amount,
        }))
      ) }),
      structuresWrite,
      ...(startingItems.length ? [supabase('/items', { method: 'POST', body: JSON.stringify(startingItems) })] : []),
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

// Out-of-combat heal (roster only): restores a living but damaged unit by the
// spell's heal_pct of its max HP. Counterpart to /roster/resurrect for the dead.
router.post('/roster/heal', requireAuth, async (req, res) => {
  const { chat_id, roster_id, spell_id } = req.body;
  if (!chat_id || !roster_id || !spell_id) return res.status(400).json({ error: 'chat_id, roster_id and spell_id required' });

  try {
    const playerRows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=learned_spells,faction&limit=1`);
    if (!playerRows.length) return res.status(404).json({ error: 'Player not found' });

    const player = playerRows[0];
    const learnedSpells = player.learned_spells || [];
    if (!learnedSpells.includes(spell_id)) return res.status(403).json({ error: 'Spell not learned' });

    const factionSpells = SPELLS[player.faction] || [];
    const spellDef = factionSpells.find(s => s.id === spell_id && s.effect_type === 'heal' && s.target_scope === 'single_ally');
    if (!spellDef) return res.status(400).json({ error: 'Invalid roster spell' });

    const rosterRows = await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero`);
    if (!rosterRows.length) return res.status(404).json({ error: 'Roster entry not found' });

    const entry = rosterRows[0];
    const unitData = entry.unit_data || {};
    if (unitData.alive === false) return res.status(400).json({ error: 'Cannot heal a fallen unit — resurrect it first' });

    const maxHp = Number(unitData.max_hp ?? 0);
    const curHp = Number(unitData.current_hp ?? maxHp);
    if (maxHp <= 0 || curHp >= maxHp) return res.status(400).json({ error: 'Unit is already at full health' });

    const healPct = spellDef.params?.heal_pct ?? 0.5;
    const healed  = Math.min(maxHp, curHp + Math.floor(maxHp * healPct));

    try {
      await consumeCrystalCosts(chat_id, spellDef.cost?.crystals || {});
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const newUnitData = { ...unitData, current_hp: healed };
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

// ── Divine favor (rewarded ad) ─────────────────────────────────────────────
// A player watches an ad and one unit is revived (at 1 HP) or healed to full.
// Revival is deliberately WORSE than the resurrection spell so the spell keeps
// a reason to exist.
//
// Two-step by design, and it must stay that way. The client is never trusted to
// say "the ad finished, do the thing": /favor/start stamps the start time
// server-side and hands back a single-use token, /favor/claim checks the clock
// and the token before anything happens. A client-side countdown is a devtools
// tweak away from being zero, and the API is reachable without the UI at all.
// The placeholder is MORE forgeable than a real SDK, not less.
//
// Swapping in a real ad network later replaces the timing check in /favor/claim
// with the network's completion callback. Nothing else about this shape moves.
const FAVOR_AD_SECONDS   = 15;
const FAVOR_DAILY_CAP    = 3;
const FAVOR_PENDING_TTL_MS = 10 * 60 * 1000;  // an abandoned view stops blocking

// The player's LOCAL calendar day, from the timezone recorded at login. Day
// rollover cannot come from the client — the date is a request away from being
// whatever the player wants it to be.
function playerLocalDate(timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    // An unknown/garbage timezone string must not take the endpoint down.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }
}

// Reads adds_daily_view, rolling it over when the player's local day has moved
// on. Returns the record for today, never null.
function favorRecordFor(player) {
  const today = playerLocalDate(player.timezone);
  const rec   = player.adds_daily_view || {};
  if (rec.date !== today) return { date: today, count: 0, pending: null };
  return { date: today, count: Number(rec.count) || 0, pending: rec.pending || null };
}

// What a favor would do for this unit, or null if it needs nothing.
function favorKindFor(unitData) {
  if (unitData.alive === false) return 'revive';
  const max = Number(unitData.max_hp ?? 0);
  const cur = Number(unitData.current_hp ?? max);
  if (max > 0 && cur < max) return 'heal';
  return null;
}

async function loadFavorPlayer(chat_id) {
  const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,faction,timezone,adds_daily_view&limit=1`);
  return rows[0] || null;
}

function writeFavorRecord(chat_id, record) {
  return supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ adds_daily_view: record }),
  });
}

router.post('/favor/start', requireAuth, async (req, res) => {
  const { chat_id, roster_id } = req.body;
  if (!chat_id || !roster_id) return res.status(400).json({ error: 'chat_id and roster_id required' });
  try {
    const player = await loadFavorPlayer(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    // Scoped by chat_id as well as id, so a roster_id from another account is
    // simply not found rather than actionable.
    const rosterRows = await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data`);
    if (!rosterRows.length) return res.status(404).json({ error: 'Roster entry not found', code: 'favor_no_unit' });

    const kind = favorKindFor(rosterRows[0].unit_data || {});
    if (!kind) return res.status(400).json({ error: 'Unit needs no favor', code: 'favor_not_needed' });

    const record = favorRecordFor(player);
    if (record.count >= FAVOR_DAILY_CAP) {
      return res.status(429).json({ error: 'Daily favor limit reached', code: 'favor_cap', remaining: 0, cap: FAVOR_DAILY_CAP });
    }

    // Overwrites any previous pending view: starting a new one abandons the old,
    // so a half-watched ad can never be banked and claimed later.
    const token = crypto.randomUUID();
    record.pending = { token, roster_id: String(roster_id), kind, started_at: Date.now() };
    await writeFavorRecord(chat_id, record);

    res.json({
      token,
      kind,
      seconds:   FAVOR_AD_SECONDS,
      remaining: FAVOR_DAILY_CAP - record.count,
      cap:       FAVOR_DAILY_CAP,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/favor/claim', requireAuth, async (req, res) => {
  const { chat_id, token } = req.body;
  if (!chat_id || !token) return res.status(400).json({ error: 'chat_id and token required' });
  try {
    const player = await loadFavorPlayer(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    // Recomputed, so a view started just before local midnight lands in the new
    // day's allowance rather than double-spending the old one.
    const record  = favorRecordFor(player);
    const pending = record.pending;
    if (!pending || pending.token !== token) {
      return res.status(400).json({ error: 'No favor in progress', code: 'favor_none' });
    }

    const elapsedMs = Date.now() - Number(pending.started_at || 0);
    if (elapsedMs > FAVOR_PENDING_TTL_MS) {
      record.pending = null;
      await writeFavorRecord(chat_id, record);
      return res.status(400).json({ error: 'Favor expired — start again', code: 'favor_expired' });
    }
    // The actual gate. 750ms of slack absorbs clock skew and round-trip time
    // without opening a window worth exploiting.
    if (elapsedMs < FAVOR_AD_SECONDS * 1000 - 750) {
      return res.status(400).json({ error: 'Ad not finished', code: 'favor_early' });
    }
    if (record.count >= FAVOR_DAILY_CAP) {
      record.pending = null;
      await writeFavorRecord(chat_id, record);
      return res.status(429).json({ error: 'Daily favor limit reached', code: 'favor_cap', remaining: 0, cap: FAVOR_DAILY_CAP });
    }

    // Re-read rather than trusting what was true at /favor/start — the unit may
    // have been healed, revived or killed in between.
    const rosterRows = await supabase(`/roster?id=eq.${encodeURIComponent(pending.roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero`);
    if (!rosterRows.length) return res.status(404).json({ error: 'Roster entry not found', code: 'favor_no_unit' });

    const unitData = rosterRows[0].unit_data || {};
    const kind     = favorKindFor(unitData);
    if (!kind) {
      // Nothing left to grant. Burn the token but do NOT spend a daily use.
      record.pending = null;
      await writeFavorRecord(chat_id, record);
      return res.status(400).json({ error: 'Unit needs no favor', code: 'favor_not_needed' });
    }

    // Revive lands at 1 HP; heal fills. Revival stays strictly worse than the
    // resurrection spell, which restores and costs crystals.
    const maxHp = Number(unitData.max_hp ?? 0);
    const newUnitData = kind === 'revive'
      ? { ...unitData, alive: true, current_hp: 1 }
      : { ...unitData, current_hp: maxHp };

    await supabase(`/roster?id=eq.${encodeURIComponent(pending.roster_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ unit_data: newUnitData }),
    });

    record.count  += 1;
    record.pending = null;
    await writeFavorRecord(chat_id, record);

    const updated = await supabase(`/roster?id=eq.${encodeURIComponent(pending.roster_id)}&select=id,chat_id,unit_data,is_hero`);
    res.json({
      success:   true,
      kind,
      roster:    updated[0],
      remaining: FAVOR_DAILY_CAP - record.count,
      cap:       FAVOR_DAILY_CAP,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/roster/levelup', requireAuth, async (req, res) => {
  // target_unit_id is optional: only sent to break a tie between branches that
  // are all consistent with the building standing in the slot.
  const { chat_id, roster_id, target_unit_id } = req.body;
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
      const throneLevel = structRows[0].buildings_data['slot_0']?.level ?? 0;
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
      // Accepts a building further UP the branch, not just the immediate next
      // one - see resolveUpgradeBranch in data/buildings.js. Building the tier-3
      // barracks over a tier-1 unit used to leave that unit unupgradable.
      // Guarded: if data/buildings.js is older than this file (they are deployed
      // by hand), upgradeBranchCandidates is undefined and calling it throws a
      // 500 instead of answering. Fall back to the single-branch resolver, which
      // has existed for far longer.
      const candidates = typeof upgradeBranchCandidates === 'function'
        ? upgradeBranchCandidates(faction, paths, currentBuildingId)
        : [resolveUpgradeBranch(faction, paths, currentBuildingId)].filter(Boolean);

      // More than one branch fits what is built (the hero trees merge, so a
      // tier-3 cathedral is reached from either tier-2 kit). The player picks,
      // and sends the pick back as target_unit_id. Validated against the
      // candidates so this can never be used to jump to an arbitrary unit.
      const chosen = target_unit_id
        ? candidates.find(p => p.unit_id === target_unit_id)
        : null;
      if (target_unit_id && !chosen) {
        return res.status(400).json({ error: `${target_unit_id} is not a valid upgrade for this unit right now` });
      }

      const matched = chosen || (candidates.length === 1 ? candidates[0] : null);
      if (!matched && candidates.length > 1) {
        // Answerable: hand back the options rather than a dead end.
        return res.status(400).json({
          error: 'Choose an upgrade path',
          code: 'upgrade_branch_choice',
          slot: buildingSlot,
          slot_building: currentBuildingId || null,
          choices: candidates.map(p => ({ unit_id: p.unit_id, building_id: p.building_id, label: p.label })),
        });
      }
      if (!matched) {
        // Name what is actually standing there. "Build X or Y first" is baffling
        // when the player HAS built one — the usual causes are the building
        // sitting in a different slot from the unit, or an ambiguous one that
        // several branches lead to, and the message should let them tell which.
        const builtDef = currentBuildingId ? getBuildingDef(faction, currentBuildingId) : null;
        const standing = builtDef ? `"${builtDef.label}"` : 'nothing';
        return res.status(400).json({
          error: `This unit's slot (${buildingSlot}) holds ${standing}. Build ${paths.map(p => p.label).join(' or ')} in THAT slot to choose an upgrade path.`,
          code: 'upgrade_branch_unresolved',
          slot: buildingSlot,
          slot_building: currentBuildingId || null,
        });
      }
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
        // Move the building forward WITH the unit, but never backwards. When the
        // player has already built past this tier, overwriting building_id with
        // the branch's own building would silently demolish the higher tier they
        // paid for.
        const builtDef  = getBuildingDef(faction, slotState.building_id);
        const targetDef = getBuildingDef(faction, path.building_id);
        const aheadAlready = builtDef && targetDef && (builtDef.tier ?? 1) >= (targetDef.tier ?? 1);
        if (!aheadAlready) {
          buildings[buildingSlot] = { ...slotState, building_id: path.building_id };
          updatePromises.push(supabase(`/structures?id=eq.${structRows[0].id}`, { method: 'PATCH', body: JSON.stringify({ buildings_data: buildings }) }));
        }
      }
    }
    await Promise.all(updatePromises);
    const updated = await supabase(`/roster?id=eq.${roster_id}&select=id,chat_id,unit_data,is_hero`);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Deconstruction ──────────────────────────────────────────────────────────
// Respec: swap a slot's building for a sibling of the SAME category and tier,
// for RESPEC_COST_PCT of the new building's cost. The slot keeps its level and
// the unit it granted keeps its XP — only which unit it is changes. The throne
// may be respecced (a different hero line at the same level) but never cleared.
router.post('/structures/respec', requireAuth, async (req, res) => {
  const { chat_id, slot, building_id } = req.body;
  if (!chat_id || !slot || !building_id) return res.status(400).json({ error: 'chat_id, slot, and building_id required' });
  try {
    const [rows, playerRows] = await Promise.all([
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
      supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=faction&limit=1`),
    ]);
    if (!rows.length)       return res.status(404).json({ error: 'Structures not found' });
    if (!playerRows.length) return res.status(404).json({ error: 'Player not found' });
    const faction = playerRows[0].faction;
    const record    = rows[0];
    const buildings = record.buildings_data;
    const current   = buildings[slot];
    if (!current || !current.building_id) return res.status(400).json({ error: 'Nothing to respec in this slot' });

    // The target must be an offered sibling — same category, same tier. This is
    // the whole guard against respeccing into a higher tier for a quarter price.
    const options = getRespecOptions(faction, current.building_id);
    const target  = options.find(o => o.id === building_id);
    if (!target) return res.status(400).json({ error: 'That building is not a valid respec for this slot' });

    const cost = getRespecCost(faction, target.id, current.level);
    const inventory = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`);
    for (const [item, amount] of Object.entries(cost)) {
      const key = item === 'gold' ? 'Gold' : item;
      const row = inventory.find(r => r.item === key);
      if (!row || Number(row.amount) < amount) return res.status(400).json({ error: `Not enough ${key}. Need ${amount}` });
    }
    for (const [item, amount] of Object.entries(cost)) {
      const key = item === 'gold' ? 'Gold' : item;
      const row = inventory.find(r => r.item === key);
      await supabase(`/resources?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(row.amount) - amount }) });
    }

    buildings[slot] = { level: current.level, building_id: target.id };
    const updated = await supabase(`/structures?id=eq.${record.id}`, { method: 'PATCH', body: JSON.stringify({ buildings_data: buildings }) });

    // Swap the unit this slot granted. XP survives the respec — the player is
    // re-choosing a branch, not starting over — but HP is re-rolled from the new
    // unit's definition, since max_hp differs between lines.
    let swappedUnit = null;
    if (target.unit_id) {
      const rosterRows = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero`);
      const entry = rosterRows.find(r => r.unit_data?.building_slot === slot);
      const newDef = getUnitByDataId(target.unit_id);
      if (entry && newDef) {
        const newHp = newDef.hp ?? entry.unit_data?.max_hp ?? 50;
        const unit_data = {
          ...entry.unit_data,
          unit_id:    newDef.id,
          max_hp:     newHp,
          current_hp: Math.min(entry.unit_data?.current_hp ?? newHp, newHp),
          alive:      entry.unit_data?.alive !== false,
        };
        await supabase(`/roster?id=eq.${entry.id}`, { method: 'PATCH', body: JSON.stringify({ unit_data }) });
        swappedUnit = { roster_id: entry.id, unit_id: newDef.id };
      }
    }
    res.json({ structures: updated[0], cost, swapped_unit: swappedUnit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear: demolish a slot outright. The building AND the unit it granted are
// gone; equipped items return to the player's stash rather than vanishing with
// the unit. Nothing is refunded — the respec above is the cheap path, this is
// the destructive one. Refused for the throne.
router.post('/structures/clear', requireAuth, async (req, res) => {
  const { chat_id, slot } = req.body;
  if (!chat_id || !slot) return res.status(400).json({ error: 'chat_id and slot required' });
  if (slot === 'slot_0') return res.status(400).json({ error: 'The throne cannot be demolished' });
  try {
    const rows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Structures not found' });
    const record    = rows[0];
    const buildings = record.buildings_data;
    const current   = buildings[slot];
    if (!current || !current.building_id) return res.status(400).json({ error: 'That slot is already empty' });

    const rosterRows = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero`);
    const doomed = rosterRows.filter(r => r.unit_data?.building_slot === slot && r.is_hero !== true);

    // Strip gear first: an item whose owner is deleted would otherwise stay
    // flagged as equipped by a roster id that no longer exists.
    for (const entry of doomed) {
      const items = await supabase(`/items?equipped_by=eq.${encodeURIComponent(entry.id)}&select=id`);
      for (const item of items) await unequipItemFromRosterUnit(item, entry.id);
      await supabase(`/roster?id=eq.${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
    }

    buildings[slot] = { level: 0, building_id: null };
    const updated = await supabase(`/structures?id=eq.${record.id}`, { method: 'PATCH', body: JSON.stringify({ buildings_data: buildings }) });
    res.json({ structures: updated[0], removed_units: doomed.map(d => d.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/structures/build', requireAuth, async (req, res) => {
  const { chat_id, slot, building_id, perk } = req.body;
  if (!chat_id || !slot || !building_id) return res.status(400).json({ error: 'chat_id, slot, and building_id required' });
  const slotCategory = SLOT_CATEGORIES[slot];
  if (!slotCategory) return res.status(400).json({ error: 'Invalid slot' });
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
    if (def.category !== slotCategory) return res.status(400).json({ error: `Slot ${slot} only accepts ${slotCategory} buildings` });
    if (!rows.length) return res.status(404).json({ error: 'Structures not found' });
    const record    = rows[0];
    const buildings = record.buildings_data;
    const current   = buildings[slot] || { level: 0, building_id: null };
    const isNew     = !current.building_id;
    const nextLevel = (current.level || 0) + 1;
    if (nextLevel > 4) return res.status(400).json({ error: 'Already at max level' });

    // Levels 2–4 offer a perk choice; validate + record it. Stored under
    // buildings_data.throne_perks so both routes and the Supabase cron/edge
    // functions (regen, daily crystals) can read the player's picks.
    let chosenPerk = null;
    if (slotCategory === 'throne' && !isNew && THRONE_PERKS[nextLevel]) {
      chosenPerk = THRONE_PERKS[nextLevel].find(p => p.id === perk);
      if (!chosenPerk) {
        return res.status(400).json({ error: `Choose a perk: ${THRONE_PERKS[nextLevel].map(p => p.id).join(' or ')}` });
      }
    }

    if (slotCategory === 'throne' && !isNew) {
      const cost = THRONE_UPGRADE_COSTS[nextLevel];
      if (cost?.gold > 0) {
        const inventory = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`);
        const goldRow   = inventory.find(r => r.item === 'Gold');
        if (!goldRow || goldRow.amount < cost.gold) return res.status(400).json({ error: `Not enough Gold. Need ${cost.gold}` });
        await supabase(`/resources?id=eq.${goldRow.id}`, { method: 'PATCH', body: JSON.stringify({ amount: goldRow.amount - cost.gold }) });
      }
    }

    // Dwellings cost gold + the faction's crystal (see applyBuildingCosts in
    // data/buildings.js). This used to be declared on the building and never
    // charged, so every barracks was free.
    if (slotCategory !== 'throne') {
      const cost = def.cost || {};
      const wanted = Object.entries(cost)
        .map(([item, amount]) => [item === 'gold' ? 'Gold' : item, Number(amount)])
        .filter(([, amount]) => amount > 0);
      if (wanted.length) {
        const inventory = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`);
        for (const [item, amount] of wanted) {
          const row = inventory.find(r => r.item === item);
          if (!row || Number(row.amount) < amount) {
            return res.status(400).json({ error: `Not enough ${item.replace('Crystals_', '')}. Need ${amount}` });
          }
        }
        for (const [item, amount] of wanted) {
          const row = inventory.find(r => r.item === item);
          await supabase(`/resources?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(row.amount) - amount }) });
        }
      }
    }

    buildings[slot] = { level: nextLevel, building_id };
    if (chosenPerk) {
      buildings.throne_perks = { ...(buildings.throne_perks || {}), [nextLevel]: chosenPerk.id };
    }
    const updated = await supabase(`/structures?id=eq.${record.id}`, { method: 'PATCH', body: JSON.stringify({ buildings_data: buildings }) });
    if (isNew && def.unit_id && slotCategory !== 'throne') {
      const unitDef = getUnitByDataId(def.unit_id);
      if (unitDef) {
        await supabase('/roster', { method: 'POST', body: JSON.stringify([{ chat_id, unit_data: makeUnitData(unitDef.id, slot), is_hero: false }]) });
      }
    }

    // The other half of the auto level-up: a unit may have been sitting on
    // enough XP for a while, waiting only on this building. Upgrading the slot
    // is what unblocks it, so check now rather than making the player go to the
    // roster and press a button that can only have one outcome. Scoped to the
    // occupants of this slot (plus the hero, whom the throne gates).
    let autoLeveled = [];
    try {
      const rosterRows = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero`);
      const affected = (rosterRows || []).filter(r =>
        r.unit_data?.building_slot === slot || (r.is_hero && slotCategory === 'throne'));
      autoLeveled = await applyAutoLevelUps(affected, buildings);
    } catch (err) {
      // Never fail the build over this — the building itself is already saved,
      // and the player can still level up by hand.
      console.error('auto level-up after build failed:', err.message);
    }

    res.json({ ...updated[0], auto_level_ups: autoLeveled });
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

router.get('/battle/realtime-config', requireAuth, async (req, res) => {
  res.json({
    url: process.env.SUPABASE_URL || null,
    anonKey: process.env.SUPABASE_ANON_KEY || null,
  });
});

router.get('/battle/state', requireAuth, async (req, res) => {
  const { battle_id, last_log_id } = req.query;
  if (!battle_id) return res.status(400).json({ error: 'battle_id required' });
  try {
    const record = await getBattleState(battle_id);
    if (!record) return res.status(404).json({ error: 'No active battle found' });

    const [engine, logs] = await Promise.all([
      rehydrateEngine(record),
      getBattleLogsSince(battle_id, last_log_id ? Number(last_log_id) : null),
    ]);
    const bd = record.battle_data;
    res.json({
      state:     engine.getSnapshot(),
      logs,
      done:      bd.done   ?? false,
      winner:    bd.winner ?? null,
      region_id: bd.region_id,
      level:     bd.level,
    });
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

    const itemsByRosterId = await getItemsByRosterIds(rosterRows.map(r => r.id));

    const playerUnits = [];
    let   heroRosterId = null;
    for (const entry of playerUnitIds) {
      const rosterId = String(entry._rosterId || entry.id);
      const r = rosterById[rosterId];
      if (!r) return res.status(400).json({ error: `Roster unit ${rosterId} not found or does not belong to this player` });
      if (r.is_hero) heroRosterId = rosterId;
      playerUnits.push(buildPlayerUnitFromRosterEntry(r, entry, itemsByRosterId));
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

        const targets = spellDef.effect_type === 'round_trigger_heal'
          ? []
          : engine.getSpellTargets(spellDef, 'player', targetId);

        if (spellDef.effect_type === 'round_trigger_heal') {
          engine.pendingRoundEffects.push({
            type:                 'tag_heal_per_unit',
            round:                params.trigger_round,
            side:                 'player',
            tag:                  params.tag_required,
            heal_per_tagged_unit: params.heal_per_tagged_unit,
            name:                 spellDef.name,
            effect_name:          spellDef.effect_name || null,
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

        // A counter-spell has no effect of its own — it just arms the check in
        // castEncounterSpell below, which is why that cast happens after this
        // loop rather than right after fromSetup.
        if (params.counters_category) engine.declareCounter(params.counters_category);

        engine.applySpellParams(targets, { ...params, _spell_name: spellDef.name });
      }
    }

    engine.castEncounterSpell(getEncounterSpellId(region_id, level));

    // Round 1 never goes through advanceRound(), so anything a spell scheduled
    // for the round the battle opens on has to be drained explicitly.
    engine.firePendingRoundEffects();

    if (!engine.done) engine.runAiTurns();

    const battle_data = buildBattleData(engine, { region_id, level, selected_spells: Array.isArray(selected_spells) ? selected_spells : [], setup: {
      playerUnitIds: playerUnits.map(u => ({ id: u.id, _rosterId: u._rosterId })),
      placement,
    }});
    const record = await createBattleState({ chat_id, battle_id, battle_data });
    let initialLogs = [];
    try {
      const initialEvents = Array.isArray(engine.log) ? engine.log : [];
      if (initialEvents.length) {
        const inserted = await appendBattleLogEntries(battle_id, initialEvents);
        initialLogs = (inserted || []).map(row => ({ id: row.id, ...row.event }));
      }
    } catch (err) {
      console.error('Failed to persist initial battle log:', err);
    }
    res.json({ record, state: engine.getSnapshot(), logs: initialLogs });
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

    // Auto-process any unity-bonded player units whose turn is next —
    // they can't act but their passives should still trigger, same as the AI loop.
    if (!engine.done) {
      let next = engine.currentActor();
      while (next && next.side === 'player' && (next._unity_host_id != null || next._invulnerable)) {
        engine.fireTrigger('on_turn_start', { actor: next, target: next, dmg: 0, dying: null });
        engine.executeAction(next, null, 'none');
        if (engine.done) break;
        engine.runAiTurns();
        next = engine.currentActor();
      }
    }

    const battle_data = buildBattleData(engine, record.battle_data);

    const previousLog = Array.isArray(record.battle_data?.log) ? record.battle_data.log : [];
    const newEntries = engine.log.slice(previousLog.length);

    await updateBattleState(battle_id, battle_data);
    let insertedLogs = [];
    try {
      if (newEntries.length) {
        const inserted = await appendBattleLogEntries(battle_id, newEntries);
        insertedLogs = (inserted || []).map(row => ({ id: row.id, ...row.event }));
      }
    } catch (err) {
      console.error('Failed to persist battle log:', err);
    }

    res.json({ ok: true, done: engine.done, winner: engine.winner, logs: insertedLogs, state: engine.getSnapshot() });
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
    // Both callers of this route are "Abandon" buttons, but only a battle that
    // had not resolved is an abandonment. A finished battle closed through here
    // keeps its real HP; nothing is being escaped.
    const abandoned = !record.battle_data?.done;
    await persistBattleRosterState(chat_id, record.battle_data, { abandoned });
    await closeBattleState(battle_id);
    res.json({ success: true, abandoned });
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
    const result  = { xp_granted: 0, gold: 0, crystal: 0, crystals_gained: {}, xp_awards: [], progress_unlocked: false };
    if (won) {
      const inventoryRows = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`);
      const updateItem = async (itemName, amount) => {
        const row = inventoryRows.find(r => r.item === itemName);
        if (!row) return;
        await supabase(`/resources?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(row.amount) + amount }) });
      };
      // Per-level payout, declared on the level itself (see getLevelRewards in
      // data/embark.js). No scaling formula — what the level says is what it pays.
      const tuned = getLevelRewards(region_id, level);

      // Expedition passives: everything the party carried into this battle
      // (units + their equipped items) contributes; same-kind bonuses sum.
      // Fetched AFTER persistBattleRosterState so unit_data reflects the battle.
      const participantIds = (record.battle_data.units || [])
        .filter(u => u.side === 'player' && u._rosterId != null)
        .map(u => String(u._rosterId));
      const participantRows = participantIds.length
        // is_hero rides along for the post-battle auto level-up, which gates the
        // hero on the throne's level.
        ? await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&or=(${participantIds.map(id => `id.eq.${id}`).join(',')})&select=id,unit_data,is_hero`)
        : [];
      const embarkItems = await getItemsByRosterIds(participantIds);
      const { totals: embarkBonus, servitudeIds } = collectEmbarkBonuses(participantRows, embarkItems);

      // Throne perks (War Chest / Scholar's Sanctum / Grand Reliquary) feed the
      // same gold/xp/crystal bonus pipeline as the expedition passives.
      const structForPerks = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1&select=buildings_data`);
      const perkBonus = getThronePerkEmbarkBonuses(structForPerks[0]?.buildings_data?.throne_perks);
      embarkBonus.gold_pct    += perkBonus.gold_pct;
      embarkBonus.xp_pct      += perkBonus.xp_pct;
      embarkBonus.crystal_pct += perkBonus.crystal_pct;

      // Gold, then the level's guaranteed crystals (exact types and amounts).
      const goldPayout = Math.round(tuned.gold * (1 + embarkBonus.gold_pct / 100));
      await updateItem('Gold', goldPayout);
      result.gold = goldPayout;
      // Reported per type, the way trophies are — a level paying 14 Fire and 14
      // Life is two different rewards, and collapsing them to "28 💎" hid both
      // which elements dropped and how much of each.
      const crystalMult = 1 + embarkBonus.crystal_pct / 100;
      const crystalsGained = {};
      let crystalTotal = 0;
      for (const { type, amount } of tuned.crystals) {
        if (!type || !amount) continue;
        const amt = Math.round(amount * crystalMult);
        await updateItem(type, amt);
        crystalsGained[type] = (crystalsGained[type] || 0) + amt;
        crystalTotal += amt;
      }
      result.crystals_gained = crystalsGained;   // { Crystals_Fire: 14, … }
      result.crystal         = crystalTotal;     // kept: the summed total

      // Two independent trophy tracks that COMBINE: `trophies` always drop on a
      // win; `spell_trophies` are granted on top when a trophy_gain spell was cast.
      const activeTrophySpell = (record.battle_data.selected_spells || [])
        .map(s => Object.values(SPELLS).flat().find(sp => sp.id === s.spell_id))
        .find(sp => sp && sp.effect_type === 'trophy_gain');

      const granted = {};
      for (const { id, amount } of tuned.trophies) {
        if (id && amount) granted[id] = (granted[id] || 0) + amount;
      }
      if (activeTrophySpell) {
        for (const { id, amount } of tuned.spell_trophies) {
          if (id && amount) granted[id] = (granted[id] || 0) + amount;
        }
      }
      for (const [id, amount] of Object.entries(granted)) {
        const trophyRow = inventoryRows.find(r => r.item === id);
        if (trophyRow) {
          await supabase(`/resources?id=eq.${trophyRow.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(trophyRow.amount) + amount }) });
        } else {
          await supabase('/resources', { method: 'POST', body: JSON.stringify({ chat_id: String(chat_id), item_type: 'trophy', item: id, amount }) });
        }
      }
      if (Object.keys(granted).length) {
        result.trophies_gained = granted;             // { trophy_id: amount }
        result.trophy_gained   = Object.keys(granted)[0]; // legacy single-id field
      }

      // No finished-item drops by design — equipment comes only from crafting.
      // The shards above are the crafting inputs.

      const validSurvivorIds = getAlivePlayerRosterIds(record.battle_data);

      // XP goes to survivors plus any fallen unit with Unending Servitude —
      // those still take their share of the split. Combat Veteran multiplies
      // everyone's share.
      const deadEarnerIds = participantIds.filter(id => !validSurvivorIds.includes(id) && servitudeIds.has(id));
      const xpRecipients  = [...validSurvivorIds, ...deadEarnerIds];

      // One unit_data patch per unit: XP share and the post-embark camp regen
      // (Rejuvenating Presence heals every SURVIVOR by the summed percentage).
      const xpEach = xpRecipients.length > 0
        ? Math.round(Math.floor(rewards.xp / xpRecipients.length) * (1 + embarkBonus.xp_pct / 100))
        : 0;
      result.xp_granted = xpEach;

      // Per-unit XP detail for the victory screen. The single xp_granted figure
      // says how much each recipient got but not WHO got it — and the recipient
      // list is not obvious (the fallen can earn via Unending Servitude, and the
      // rest of the party earns nothing). Reporting the actual post-award total
      // also lets the client draw each unit's progress toward its next tier.
      const xpAwards = [];
      // Every participant's FINAL unit_data, fed to the auto level-up pass below.
      const postXpRows = [];

      await Promise.all(participantRows.map(async (row) => {
        const rosterId = String(row.id);
        let unitData  = row.unit_data || {};
        let changed   = false;

        if (xpEach > 0 && xpRecipients.includes(rosterId)) {
          unitData = { ...unitData, current_xp: (unitData.current_xp ?? 0) + xpEach };
          changed  = true;
          xpAwards.push({
            roster_id:  rosterId,
            unit_id:    unitData.unit_id,
            xp_gained:  xpEach,
            current_xp: unitData.current_xp,
            alive:      unitData.alive !== false,
          });
        }

        if (embarkBonus.heal_pct > 0 && unitData.alive !== false) {
          const maxHp = Number(unitData.max_hp ?? 0);
          const cur   = Number(unitData.current_hp ?? maxHp);
          if (maxHp > 0 && cur < maxHp) {
            const healed = Math.min(maxHp, cur + Math.round(maxHp * embarkBonus.heal_pct / 100));
            unitData = { ...unitData, current_hp: healed };
            changed  = true;
          }
        }

        // Kept regardless of `changed` — a unit may already have been over the
        // threshold and merely waiting on a building.
        postXpRows.push({ id: row.id, unit_data: unitData, is_hero: row.is_hero });
        if (!changed) return;
        await supabase(`/roster?id=eq.${encodeURIComponent(rosterId)}`, { method: 'PATCH', body: JSON.stringify({ unit_data: unitData }) });
      }));

      // Anything the XP award just pushed over its threshold levels up now,
      // provided its building already supports the upgrade and the branch is
      // unambiguous. Runs AFTER the XP patches so it sees the new totals.
      result.auto_level_ups = await applyAutoLevelUps(postXpRows, structForPerks[0]?.buildings_data);

      // Stable order — Promise.all resolution order is not meaningful, and the
      // victory list should not reshuffle between runs.
      result.xp_awards = xpAwards.sort((a, b) => Number(a.roster_id) - Number(b.roster_id));
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
    const throneLevel = structRows[0].buildings_data['slot_0']?.level ?? 0;
    const spellTier   = spell.tier || 1;
    if (learned.includes(spell_id)) return res.status(400).json({ error: 'Spell already researched' });
    if (throneLevel < spellTier) return res.status(400).json({ error: `Throne level ${spellTier} required to research this spell` });
    // Mage Guild throne perk discounts the crystal cost.
    const spellDiscount = getSpellCostReductionPct(structRows[0].buildings_data?.throne_perks) / 100;
    const discountedCost = {};
    for (const [type, amt] of Object.entries(spell.cost?.crystals || {})) {
      discountedCost[type] = Math.max(0, Math.ceil(amt * (1 - spellDiscount)));
    }
    try {
      await consumeCrystalCosts(chat_id, discountedCost);
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
    if (slots[slot]?.building_id && slots[slot].building_id !== 'mercenary_hall') return res.status(400).json({ error: 'Slot already occupied' });

    // Resolve the template before spending anything, so a data gap can never
    // charge the player and then fail.
    const unitTemplate = findEnemyUnit(bDef.region, bDef.unit_id);
    if (!unitTemplate) return res.status(500).json({ error: 'Unit definition not found' });

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

    slots[slot] = { level: 1, building_id: mercenary_building_id };
    const [updatedStruct, inserted] = await Promise.all([
      supabase(`/structures?id=eq.${record.id}`, { method: 'PATCH', body: JSON.stringify({ buildings_data: slots }) }),
      // The SAME roster shape every other unit uses. This used to spread the
      // whole template (`...unitTemplate`), which left the row with no `unit_id`
      // and no `building_slot` — the two fields every shared helper keys off —
      // so mercenaries fell out of upgrade-path resolution, level-up and the
      // auto level-up entirely. `mercenary` / `mercenary_region` ride alongside
      // as extras, not as a replacement for the standard fields.
      supabase('/roster', { method: 'POST', body: JSON.stringify({
        chat_id:   String(chat_id),
        is_hero:   false,
        unit_data: {
          ...makeUnitData(unitTemplate.id, slot),
          mercenary:        true,
          mercenary_region: bDef.region,
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

    // Resolve the template before spending anything, so a data gap can never
    // charge the player and then fail.
    const unitTemplate = findEnemyUnit(bDef.region, bDef.unit_id);
    if (!unitTemplate) return res.status(500).json({ error: 'Unit definition not found' });

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

    // Upgrades the BUILDING only — it no longer swaps the unit out. This used to
    // hand the player a new tier the moment they could pay for it, which is not
    // how any other unit works: everywhere else the building is the prerequisite
    // and the unit still has to earn the XP. The unit now advances through the
    // ordinary path (auto below, or the roster's Level Up button), so a
    // mercenary and a faction unit obey identical rules.
    slots[slot] = { level: bDef.tier, building_id: mercenary_building_id };
    const updatedStruct = await supabase(`/structures?id=eq.${record.id}`, {
      method: 'PATCH', body: JSON.stringify({ buildings_data: slots }),
    });

    // Same courtesy as /structures/build: if this was the last thing the unit
    // was waiting on, finish the job now.
    let autoLeveled = [];
    try {
      autoLeveled = await applyAutoLevelUps(rosterRows, slots);
    } catch (err) {
      console.error('auto level-up after mercenary upgrade failed:', err.message);
    }

    const updatedRoster = await supabase(`/roster?id=eq.${roster_id}&select=id,chat_id,unit_data,is_hero`);
    res.json({
      success: true,
      structures: Array.isArray(updatedStruct) ? updatedStruct[0] : updatedStruct,
      roster_entry: updatedRoster[0],
      auto_level_ups: autoLeveled,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/items', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const player = await getPlayerByChatId(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const rows = await supabase(`/items?player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/items/equip', requireAuth, async (req, res) => {
  const { chat_id, roster_id, item_id } = req.body;
  if (!chat_id || !roster_id || !item_id) return res.status(400).json({ error: 'chat_id, roster_id, and item_id required' });
  try {
    const player = await getPlayerByChatId(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const [itemRows, rosterRows] = await Promise.all([
      supabase(`/items?id=eq.${encodeURIComponent(item_id)}&player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`),
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero`),
    ]);
    if (!itemRows.length)   return res.status(404).json({ error: 'Item not found' });
    if (!rosterRows.length) return res.status(404).json({ error: 'Roster unit not found' });

    const item        = itemRows[0];
    const rosterEntry = rosterRows[0];
    const stats        = item.item_stats || {};

    if (stats.faction && stats.faction !== player.faction) {
      return res.status(400).json({ error: 'This item cannot be equipped by your faction' });
    }

    const unitDef  = getUnitByDataId(rosterEntry.unit_data?.unit_id);
    const unitTags = (unitDef?.tags || []).filter(Boolean);
    if (stats.tag_required && !unitTags.includes(stats.tag_required)) {
      return res.status(400).json({ error: `This item requires the ${stats.tag_required} tag` });
    }

    // Incoherent pairings — e.g. a passive that only fires on a damaging hit
    // going to a unit whose action is a heal. See data/item_rules.js; the client
    // greys the button out using the same call, this is the enforcement.
    const equipBlock = getEquipBlock(stats, unitDef, UNIT_ABILITIES);
    if (equipBlock) {
      return res.status(400).json({ error: equipBlock.reason, code: equipBlock.code });
    }

    // If this item is currently equipped by a different unit, unequip it there first.
    if (item.equipped_by && String(item.equipped_by) !== String(roster_id)) {
      await unequipItemFromRosterUnit(item, item.equipped_by);
    }

    // Each character can only equip one item at a time - unequip whatever this unit already has on.
    const currentlyEquipped = await supabase(`/items?equipped_by=eq.${encodeURIComponent(roster_id)}&select=id,item_stats`);
    for (const old of currentlyEquipped) {
      if (String(old.id) === String(item_id)) continue;
      await unequipItemFromRosterUnit(old, roster_id);
    }

    // Equipping only records the link. The roster row keeps the unit's BASE
    // stats; every consumer derives base + item via applyItemModifiers.
    await supabase(`/items?id=eq.${item_id}`, { method: 'PATCH', body: JSON.stringify({ equipped_by: roster_id }) });

    const [updatedRoster, readItems] = await Promise.all([
      supabase(`/roster?id=eq.${roster_id}&select=id,chat_id,unit_data,is_hero`),
      supabase(`/items?player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`),
    ]);

    // This SELECT can answer from a replica that has not caught up with the
    // PATCHes above, handing back the item still unequipped. The client caches
    // that list and redraws the character block from it, so the stat changes
    // simply never appear. Reconcile against what we KNOW happened instead.
    const unequippedIds = new Set(
      currentlyEquipped.filter(o => String(o.id) !== String(item_id)).map(o => String(o.id))
    );
    const items = (Array.isArray(readItems) ? readItems : []).map(r => {
      if (String(r.id) === String(item_id))   return { ...r, equipped_by: roster_id };
      if (unequippedIds.has(String(r.id)))    return { ...r, equipped_by: null };
      return r;
    });

    res.json({ success: true, roster: updatedRoster[0], items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/items/unequip', requireAuth, async (req, res) => {
  const { chat_id, item_id } = req.body;
  if (!chat_id || !item_id) return res.status(400).json({ error: 'chat_id and item_id required' });
  try {
    const player = await getPlayerByChatId(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const itemRows = await supabase(`/items?id=eq.${encodeURIComponent(item_id)}&player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`);
    if (!itemRows.length) return res.status(404).json({ error: 'Item not found' });
    const item = itemRows[0];
    if (!item.equipped_by) return res.status(400).json({ error: 'Item is not equipped' });

    await unequipItemFromRosterUnit(item, item.equipped_by);

    const [updatedRoster, readItems] = await Promise.all([
      supabase(`/roster?id=eq.${item.equipped_by}&select=id,chat_id,unit_data,is_hero`),
      supabase(`/items?player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`),
    ]);

    // Same read-after-write reconciliation as /items/equip: the replica can
    // still show the item as equipped, leaving the character block showing
    // stats the unit no longer has.
    const items = (Array.isArray(readItems) ? readItems : []).map(r =>
      String(r.id) === String(item_id) ? { ...r, equipped_by: null } : r
    );

    res.json({ success: true, roster: updatedRoster[0], items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crafts an item from data/items.js ITEM_DEFS[item_key].cost - trophies, Gold,
// and/or crystals, same cost-map shape and validate-then-deduct pattern as
// /structures/mercenary/recruit. Faction-restricted items require the item's
// faction to match the player's; neutral items (faction: null) are craftable
// by anyone.
router.post('/items/craft', requireAuth, async (req, res) => {
  const { chat_id, item_key } = req.body;
  if (!chat_id || !item_key) return res.status(400).json({ error: 'chat_id and item_key required' });
  try {
    const itemDef = ITEM_DEFS[item_key];
    if (!itemDef) return res.status(404).json({ error: 'Unknown item' });

    const player = await getPlayerByChatId(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    if (itemDef.faction && itemDef.faction !== player.faction) {
      return res.status(400).json({ error: 'This item cannot be crafted by your faction' });
    }

    // Progress gate. The roster catalog disables the button for the same reason,
    // but the check has to live here too — this route is the authority.
    if (!meetsCraftRequirements(itemDef, player.progress || {})) {
      return res.status(400).json({ error: `Locked — ${craftRequirementText(itemDef)}` });
    }

    const cost     = itemDef.cost      || {};
    const itemCost = itemDef.item_cost || {};

    const [inventoryRows, ownedItems] = await Promise.all([
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
      supabase(`/items?player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`),
    ]);

    // Unique items are one-per-player: refuse a second copy (equipped or not).
    if (itemDef.unique) {
      const alreadyOwned = ownedItems.some(it => (it.item_stats?.key || it.item_stats?.icon) === item_key);
      if (alreadyOwned) return res.status(400).json({ error: 'You already own this unique item' });
    }

    // Validate resource costs
    for (const [resName, required] of Object.entries(cost)) {
      const row  = inventoryRows.find(r => r.item === resName);
      const have = row ? Number(row.amount) : 0;
      if (have < required) return res.status(400).json({ error: `Not enough ${resName} (need ${required}, have ${have})` });
    }

    // Validate item ingredient costs — must own the item unequipped
    const ingredientRows = [];
    for (const [ingredientKey, requiredCount] of Object.entries(itemCost)) {
      const matches = ownedItems.filter(it =>
        (it.item_stats?.key || it.item_stats?.icon) === ingredientKey && !it.equipped_by
      );
      if (matches.length < requiredCount) {
        return res.status(400).json({ error: `Need ${requiredCount} unequipped ${ingredientKey} as ingredient` });
      }
      ingredientRows.push(...matches.slice(0, requiredCount));
    }

    // Deduct resource costs
    for (const [resName, required] of Object.entries(cost)) {
      const row = inventoryRows.find(r => r.item === resName);
      await supabase(`/resources?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(row.amount) - required }) });
    }

    // Consume item ingredients
    await Promise.all(ingredientRows.map(it =>
      supabase(`/items?id=eq.${it.id}`, { method: 'DELETE' })
    ));

    const inserted = await supabase('/items', {
      method: 'POST',
      body: JSON.stringify(makeItemRow(player.id, item_key)),
      headers: { Prefer: 'return=representation' },
    });

    const [readItems, updatedResources] = await Promise.all([
      supabase(`/items?player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
    ]);

    // This SELECT can answer from a replica that has not caught up with the
    // INSERT and DELETEs just issued, so it is reconciled against what we KNOW
    // happened rather than trusted outright. Without this the crafted item is
    // missing from the list the client caches, so no other recipe counts it as
    // an ingredient until a reload — and consumed ingredients can linger and be
    // counted twice.
    const newRow    = Array.isArray(inserted) ? inserted[0] : inserted;
    const consumed  = new Set(ingredientRows.map(it => String(it.id)));
    const items     = (Array.isArray(readItems) ? readItems : [])
      .filter(r => !consumed.has(String(r.id)));
    if (newRow?.id && !items.some(r => String(r.id) === String(newRow.id))) items.push(newRow);

    res.json({
      success:   true,
      item:      newRow,
      items,
      resources: updatedResources,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;