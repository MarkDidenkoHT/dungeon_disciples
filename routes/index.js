const express = require('express');
const router = express.Router();

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const { UNITS } = require('../data/units');
const { REGIONS, getEncounter, getLevelRewards, getFirstClearTokens, TOME_XP } = require('../data/embark');
const { getActiveEvent, eventDropsFor, eventBonusFor, eventPayload } = require('../utils/events');
const { getEquipBlock } = require('../data/item_rules');
const { RESPEC_COST_PCT, getRespecOptions, getCrossBranchRespecOptions, getRespecCost, FACTION_CRYSTAL } = require('../data/buildings');
const { BUILDING_POOLS, SLOT_CATEGORIES, SLOT_LAYERS, SLOT_UNLOCKS, SLOT_FIXED_BUILDING, slotLockedBy, UNIT_UPGRADE_PATHS, HERO_MAX_LEVEL, THRONE_MAX_LEVEL, buildingLevel, THRONE_UPGRADE_COSTS, buildingMaxLevel, buildingCostForLevel, maxUnitTier, getSpellCostReductionPct, getEmbarkBuildingBonuses, getBuildingDef, upgradeReaches, resolveUpgradeBranch, upgradeBranchCandidates, emptyStructures, MERCENARY_BUILDINGS } = require('../data/buildings');
const { BattleEngine } = require('../utils/battle-engine');
const ERR = require('../data/errands');
const {
  getActiveBattle,
  getBattleState,
  createBattleState,
  updateBattleState,
  claimBattleState,
  closeBattleState,
  appendBattleLogEntries,
  getBattleLogs,
  getBattleLogsSince,
} = require('../utils/realtime');
const battleBus = require('../utils/battle-bus');
const pvpQueue  = require('../utils/pvp-queue');
const pvpView   = require('../utils/pvp-view');
const { SPELLS } = require('../data/spells');
const { telegramWebhookHandler, notifyAdminNewPlayer } = require('../utils/telegram');
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

// ── Error contract ──────────────────────────────────────────────────────────
// EXPECTED failures (the unit is busy, the battle is already claimed) carry a
// stable `code` alongside the English `error`. The code is the part the client
// is allowed to branch on; the prose is for humans and may be reworded or
// translated at any time.
//
// This matters because the client was branching on the PROSE — see
// `/already claimed|already/i.test(err.message)` in screens/battle.js. That makes
// a server-side rewording a silent client bug: no error, no log, just a victory
// screen that starts showing a failure. Codes make that link explicit.
//
// UNEXPECTED failures (a thrown exception) must not hand the player raw
// `err.message`: it is usually Supabase/Postgres text, it is always English, and
// it leaks internals. The detail goes to the server log where it is useful; the
// player gets a stable code the client can translate.
function serverError(res, err, where = '') {
  console.error(`[500]${where ? ' ' + where : ''}:`, err?.message || err);
  return res.status(500).json({ error: 'Server error', code: 'internal' });
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
    serverError(res, err);
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Granted once, when the player picks a faction (see /player/faction). Neutral,
// tag-free gear so it equips on any hero — the roster tutorial walks the player
// through putting it on.
const STARTING_ITEM_KEYS = ['padded_armor'];

// An owned item is IDENTITY ONLY: which item it is, and nothing about what it
// does. Stats live in data/items.js and are attached on the way out, by
// hydrateItems below.
//
// This used to write a full snapshot of the definition into the item_stats
// jsonb, which meant a balance change in data/items.js only affected items
// minted AFTER it. Every item already in a player's stash kept the numbers it
// was born with, forever, and there is no migration that can fix that in
// general — two players holding "the same" sword genuinely had different swords.
// The snapshot had also drifted: it never carried `blocked_tags` or `rarity`, so
// equip restrictions read from a stored item silently disagreed with the ones
// read from the catalog.
//
// `key` stays the column it always was (`item_stats.key`) rather than becoming a
// new `item_key` column, so no schema change and no backfill is needed — old fat
// rows already carry the key, and everything else in them is now ignored.
function makeItemRow(playerId, itemKey) {
  const def = ITEM_DEFS[itemKey];
  if (!def) return null;
  return {
    player_id:  playerId,
    // Denormalised for legibility when reading the table by hand; the name that
    // reaches the client comes from the catalog, not from here.
    item_name:  def.name,
    item_stats: { key: def.key },
  };
}

// The key an /items row is FOR. `icon` is the fallback because the oldest rows
// predate `key` and were only ever identifiable by their icon.
function itemKeyOfRow(row) {
  return row?.item_stats?.key || row?.item_stats?.icon || null;
}

// Replace each row's stored item_stats with the live definition. Every read of
// the items table goes through here, so nothing downstream can see a stale
// snapshot — the call sites keep reading `item_stats` exactly as before and get
// current numbers for free.
//
// A row whose key is no longer in ITEM_DEFS keeps whatever it stored. Dropping
// it instead would delete a player's item because a designer renamed a key, and
// returning it bare would strip the stats off gear that is currently equipped.
function hydrateItems(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => {
    const def = ITEM_DEFS[itemKeyOfRow(row)];
    if (!def) return row;
    return { ...row, item_name: def.name, item_stats: def };
  });
}

// Every items READ goes through this; writes still call supabase directly.
async function fetchItems(path) {
  return hydrateItems(await supabase(path));
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
  { item_type: 'resource', item: 'Crystals_Life',   amount: 50  },
  { item_type: 'resource', item: 'Crystals_Fire',   amount: 50  },
  { item_type: 'resource', item: 'Crystals_Death',  amount: 50  },
  { item_type: 'resource', item: 'Crystals_Nature', amount: 50  },
  { item_type: 'resource', item: 'Crystals_Frost',  amount: 50  },
  { item_type: 'resource', item: 'Crystals_Air',    amount: 50  },
  // One Crossroad Sigil to start with. A player who picks the wrong branch on
  // their very first fork should not have to clear a whole region before they
  // are allowed to change their mind — the first mistake is the one made with
  // the least information.
  { item_type: 'token',    item: 'crossroad_sigil', amount: 1   },
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
  h_e_2: { building_id: 'conscript_barracks', unit_id: 'e1',  slot: 'slot_4' },
  h_e_3: { building_id: 'sentinel_forge',     unit_id: 'e3',  slot: 'slot_4' },
  h_d_1: { building_id: 'peer_court',         unit_id: 'd6',  slot: 'slot_4' },
  h_d_2: { building_id: 'imp_den',            unit_id: 'd1',  slot: 'slot_4' },
  h_d_3: { building_id: 'flame_spawn_pit',    unit_id: 'd7',  slot: 'slot_4' },
  h_g_1: { building_id: 'communicant_chapel', unit_id: 'gs2', slot: 'slot_4' },
  h_g_2: { building_id: 'zombie_pit',         unit_id: 'gs1', slot: 'slot_4' },
  h_g_3: { building_id: 'pale_maiden_barrow', unit_id: 'gs7', slot: 'slot_4' },
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
  const rows = await fetchItems(`/items?or=(${orFilter})&select=id,item_name,item_stats,equipped_by`);
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

// ── PvP battles ─────────────────────────────────────────────────────────────
// A PvP battle is one row with two owners. `chat_id` created it and its army is
// engine-side 'player'; `opponent_chat_id` joined and its army is engine-side
// 'enemy'. Nothing about the engine knows the difference — the second army is
// fed in through the same enemy slot an encounter uses — so the only new rules
// are about WHO may act for which side, and what each of them is shown.

const PVP_TURN_MS = 30000;

// Placeholder payout for a quick match win, flat per surviving-or-not unit of the
// winning army. No gold, no crystals, no trophies: unranked duels are not a
// resource faucet, and what they are worth is a design decision still to make.
const PVP_WIN_XP = 100;

function isPvpRecord(record) {
  return record?.battle_kind === 'pvp' || record?.battle_data?.kind === 'pvp';
}

// Which engine side this player commands, or null if the battle is not theirs.
function battleSideFor(record, chat_id) {
  const id = String(chat_id);
  if (String(record.chat_id) === id) return 'player';
  if (record.opponent_chat_id && String(record.opponent_chat_id) === id) return 'enemy';
  return null;
}

// A record's state and logs as this player should see them: untouched for the
// creator, mirrored for the opponent (see utils/pvp-view.js).
function viewFor(record, chat_id, { state, logs, winner }) {
  if (!isPvpRecord(record) || battleSideFor(record, chat_id) !== 'enemy') {
    return { state, logs, winner };
  }
  return {
    state:  pvpView.flipSnapshot(state),
    logs:   pvpView.flipLogs(logs),
    winner: winner ? pvpView.flipSide(winner) : winner,
  };
}

// Build one player's army from their own roster and items. The same function
// serves both sides of a PvP battle and the player side of a PvE one, so an
// item or a level applies identically whichever grid a unit is standing on.
async function buildArmyFor(chat_id, playerUnitIds) {
  const rosterRows = await supabase(
    `/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero`
  );
  const rosterById = {};
  for (const r of rosterRows) rosterById[String(r.id)] = r;
  const itemsByRosterId = await getItemsByRosterIds(rosterRows.map(r => r.id));

  return playerUnitIds.map(entry => {
    const rosterId = String(entry._rosterId || entry.id);
    const r = rosterById[rosterId];
    if (!r) throw new Error(`Roster unit ${rosterId} not found for ${chat_id}`);
    return buildPlayerUnitFromRosterEntry(r, entry, itemsByRosterId);
  });
}

// The opposing army, shaped the way initCombatants expects an encounter: each
// unit carries the cell it was placed in, because there is no second
// `placement` argument.
function asEnemySide(units, placement) {
  return units.map((u, i) => ({ ...u, cell: placement[u.id] ?? placement[String(u.id)] ?? i }));
}

// Whose turn is it, as a chat_id — null when the battle is over or the actor is
// AI. The turn clock is per ACTOR, not per round: a side with three units gets
// three separate turns and three separate deadlines.
function actingChatIdFor(record, engine) {
  if (!isPvpRecord(record) || engine.done) return null;
  const actor = engine.currentActor();
  if (!actor) return null;
  return actor.side === 'player' ? String(record.chat_id) : String(record.opponent_chat_id);
}

// A player who stops answering must not be able to freeze the other one's game.
// The deadline lives in battle_data and is enforced lazily: whoever next reads
// or writes this battle applies the timeout that has already expired. On a
// single instance that is always someone — the waiting player's client is
// polling — and it needs no scheduler that a restart would lose.
//
// An expired turn DEFENDS. It is the action that does the least on the board and
// the most for the unit that took it, which is the honest reading of a player
// who did not answer: they were not choosing to attack.
function applyExpiredTurns(record, engine) {
  if (!isPvpRecord(record) || engine.done) return false;
  const deadline = record.battle_data?.turn_deadline;
  if (!deadline || Date.now() < deadline) return false;

  let acted = false;
  // One expiry only. Rolling the whole battle forward because a phone was
  // locked for five minutes would resolve a fight nobody was watching; the next
  // read expires the next turn, at its own pace.
  const actor = engine.currentActor();
  if (actor) {
    engine.executeAction(actor, null, 'defend');
    acted = true;
  }
  return acted;
}

// Stamped on every write, so the clock starts when the turn actually begins
// rather than when the previous one was requested.
function withTurnDeadline(battle_data, record, engine) {
  if (!isPvpRecord(record)) return battle_data;
  return {
    ...battle_data,
    kind: 'pvp',
    turn_deadline: engine.done ? null : Date.now() + PVP_TURN_MS,
    turn_ms: PVP_TURN_MS,
  };
}

// Write a PvP battle back after the engine has moved, append whatever it logged,
// and wake the other player. Returns the record with its new battle_data so the
// caller can answer from the same state it just stored.
async function persistPvpTurn(record, engine, { causedBy = null } = {}) {
  const previousLog = Array.isArray(record.battle_data?.log) ? record.battle_data.log : [];
  const newEntries  = engine.log.slice(previousLog.length);
  const battle_data = withTurnDeadline(buildBattleData(engine, record.battle_data), record, engine);

  await updateBattleState(record.battle_id, battle_data);

  let insertedLogs = [];
  try {
    if (newEntries.length) {
      const inserted = await appendBattleLogEntries(record.battle_id, newEntries);
      insertedLogs = (inserted || []).map(row => ({ id: row.id, ...row.event }));
    }
  } catch (err) {
    console.error('Failed to persist battle log:', err);
  }

  battleBus.publish(record.battle_id, {
    last_log_id: insertedLogs.length ? insertedLogs[insertedLogs.length - 1].id : null,
    done: engine.done,
  }, { exceptChatId: causedBy });

  return { ...record, battle_data, _engine: engine, _insertedLogs: insertedLogs };
}

async function rehydrateEngine(record) {
  const bd = record.battle_data;
  const { playerUnitIds, placement } = bd.setup;
  const chat_id = record.chat_id;

  // PvP: the other side is a real army belonging to a real player, rebuilt from
  // THEIR roster exactly as this side is rebuilt from this one.
  if (isPvpRecord(record)) {
    const opp = bd.setup.opponent || {};
    const [mine, theirs] = await Promise.all([
      buildArmyFor(chat_id, playerUnitIds),
      buildArmyFor(record.opponent_chat_id, opp.playerUnitIds || []),
    ]);
    return BattleEngine.rehydrate(
      { playerUnits: mine, enemies: asEnemySide(theirs, opp.placement || {}), placement },
      bd,
    );
  }

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
async function persistBattleRosterState(chat_id, battle_data, { abandoned = false, side = 'player' } = {}) {
  if (!battle_data || !Array.isArray(battle_data.units)) return;
  // `side` is 'player' for every PvE battle and for the player who created a PvP
  // one; the opponent's own army is on the engine's enemy side and is written
  // back to THEIR roster by the same code.
  const playerUnits = battle_data.units.filter(u => u.side === side && u._rosterId != null);
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
  newUnitData.current_xp = Math.max(0, (unitData.current_xp ?? 0) - xpRequired);
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
      // Written on every login. The column has a DEFAULT, which only ever fires
      // on INSERT — so until now `last_login` was just a second copy of
      // created_at and every returning player looked like they had never come
      // back. Nothing else in the codebase touches it.
      const patchBody = { session_token, settings: mergedSettings, last_login: new Date().toISOString() };
      if (timezone) patchBody.timezone = timezone;
      const updated = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      });
      let activeRec = null;
      try { activeRec = await getActiveBattle(chat_id); } catch (e) {}
      // The errand offer is minted here, once per player, rather than derived on
      // every read of /errands — see ensureErrandOffer. It refuses to create a
      // second while one is offered or running, so logging in repeatedly cannot
      // reroll or stack errands. Never fatal: a player who cannot get an offer
      // (no structures yet, empty roster) still logs in.
      try { await ensureErrandOffer(chat_id, updated[0]); } catch (e) {}
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
      // Set explicitly rather than left to the column DEFAULT, so first login
      // and every later one are written by the same code path.
      last_login: new Date().toISOString(),
      settings: { language: telegramUser.language_code || 'en', notifications: true, music_enabled: true, sfx_enabled: true, barks_enabled: true },
    };
    if (timezone) newPlayerBody.timezone = timezone;
    const created = await supabase('/players', {
      method: 'POST',
      body: JSON.stringify(newPlayerBody),
    });
    let activeRec = null;
    try { activeRec = await getActiveBattle(chat_id); } catch (e) {}
    // Deliberately not awaited: the admin ping is bookkeeping, and a slow or
    // failing Telegram API must not delay (or fail) the player's first login.
    notifyAdminNewPlayer(created[0]).catch(err =>
      console.error('Admin new-player notify failed:', err.message));
    res.json({
      player: created[0],
      session_token,
      isNew: true,
      active: Boolean(activeRec),
      battle_id: activeRec ? activeRec.battle_id : null,
      battle_data: activeRec ? activeRec.battle_data : null,
    });
  } catch (err) {
    serverError(res, err);
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
    serverError(res, err);
  }
});

// Records the answer to the privacy notice, plus the language chosen on the
// same screen (see public/screens/welcome.js).
//
// Stored as three columns rather than a flag in `settings`, because consent has
// to be auditable: WHAT was agreed to (consent_version), and WHEN (consent_at).
// A bare boolean cannot answer either question, and the version is what lets a
// changed notice re-ask everyone without also wiping their other preferences.
//
// `analytics_consent` is deliberately nullable: NULL means "never asked", which
// is a different state from an explicit false, and it is the one that decides
// whether the welcome screen appears.
router.post('/player/consent', requireAuth, async (req, res) => {
  const { chat_id, analytics_consent, consent_version, language } = req.body;
  if (!chat_id || typeof analytics_consent !== 'boolean' || !consent_version) {
    return res.status(400).json({ error: 'chat_id, analytics_consent and consent_version required' });
  }
  try {
    const existing = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=settings&limit=1`);
    if (!existing.length) return res.status(404).json({ error: 'Player not found' });

    const patch = {
      analytics_consent,
      consent_version:   String(consent_version),
      consent_at:        new Date().toISOString(),
    };
    // The language picker lives on the same screen, so it is written here too —
    // one round trip, and the two can never end up disagreeing.
    if (language === 'en' || language === 'ru') {
      patch.settings = { ...(existing[0].settings || {}), language };
    }

    const updated = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    res.json({ player: updated[0] });
  } catch (err) {
    serverError(res, err);
  }
});

// ── Promo codes ─────────────────────────────────────────────────────────────
// A row in `promos` names a code and what it pays; `players.promos` records
// which codes that player has already taken, as { code: redeemed_at }.
//
// promo_data:
//   {
//     "crystals":  { "Crystals_Life": 50, ... },   // any resource row by name
//     "gold":      100,
//     "trophies":  { "grave_dust": 2 },
//     "roster_xp": 25                              // to EVERY unit on the roster
//   }
//
// Codes are matched case-insensitively and stored lower-cased, so a player
// typing THX4PLAYTST on a phone keyboard is not told their code is wrong.
router.post('/player/promo', requireAuth, async (req, res) => {
  const { chat_id, code } = req.body;
  if (!chat_id || !code) return res.status(400).json({ error: 'chat_id and code required' });

  const key = String(code).trim().toLowerCase();
  if (!key) return res.status(400).json({ error: 'Enter a code', code: 'promo_empty' });

  try {
    const [playerRows, promoRows] = await Promise.all([
      supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,promos&limit=1`),
      // ilike rather than eq: the stored name may carry different casing.
      supabase(`/promos?promo_name=ilike.${encodeURIComponent(key)}&limit=1`),
    ]);
    if (!playerRows.length) return res.status(404).json({ error: 'Player not found' });
    if (!promoRows.length)  return res.status(404).json({ error: 'Unknown code', code: 'promo_unknown' });

    const player = playerRows[0];
    const promo  = promoRows[0];
    const taken  = player.promos || {};
    // Keyed on the NORMALISED code, so re-entering it in different casing is
    // still recognised as already used.
    if (taken[key]) return res.status(400).json({ error: 'Code already used', code: 'promo_used' });

    const data     = promo.promo_data || {};
    const granted  = { crystals: {}, trophies: {}, gold: 0, roster_xp: 0 };
    const inventory = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`);

    // Resources and trophies live in the same table, keyed by `item`. A row the
    // player has never held does not exist yet, so it is inserted rather than
    // skipped — otherwise a promo granting an unseen crystal pays nothing.
    const addItem = async (item, amount, bucket) => {
      const amt = Number(amount);
      if (!item || !Number.isFinite(amt) || amt <= 0) return;
      const row = inventory.find(r => r.item === item);
      if (row) {
        await supabase(`/resources?id=eq.${row.id}`, {
          method: 'PATCH', body: JSON.stringify({ amount: Number(row.amount) + amt }) });
      } else {
        await supabase('/resources', { method: 'POST', body: JSON.stringify({
          chat_id: String(chat_id),
          item,
          amount: amt,
          item_type: bucket === 'trophies' ? 'trophy' : 'resource',
        }) });
      }
      if (bucket === 'gold') granted.gold += amt;
      else granted[bucket][item] = (granted[bucket][item] || 0) + amt;
    };

    if (data.gold) await addItem('Gold', data.gold, 'gold');
    for (const [type, amt] of Object.entries(data.crystals || {})) await addItem(type, amt, 'crystals');
    for (const [id,   amt] of Object.entries(data.trophies || {})) await addItem(id,   amt, 'trophies');

    // Roster XP goes to every unit, hero included. Auto level-ups run afterwards
    // so a unit pushed over its threshold by the promo advances immediately,
    // exactly as it would after a battle.
    let autoLeveled = [];
    if (Number(data.roster_xp) > 0) {
      const xp = Number(data.roster_xp);
      const roster = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero`);
      await Promise.all(roster.map(r => supabase(`/roster?id=eq.${encodeURIComponent(r.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ unit_data: { ...(r.unit_data || {}),
          current_xp: Number(r.unit_data?.current_xp ?? 0) + xp } }),
      })));
      granted.roster_xp = xp;

      const structRows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1&select=buildings_data`);
      const fresh = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero`);
      try { autoLeveled = await applyAutoLevelUps(fresh, structRows[0]?.buildings_data); }
      catch (err) { console.error('promo auto level-up failed:', err.message); }
    }

    // Recorded LAST: if anything above threw, the code is not burned and the
    // player can try again rather than losing it to a half-applied reward.
    await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ promos: { ...taken, [key]: new Date().toISOString() } }),
    });

    res.json({ success: true, code: key, name: promo.promo_name, granted, auto_level_ups: autoLeveled });
  } catch (err) {
    serverError(res, err);
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
    serverError(res, err);
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

    // Errands were the one table a reset left behind, and a RUNNING row is a
    // dead end: ensureErrandOffer returns early while anything is active and
    // /errands/start answers errand_busy, so the player never gets another
    // errand — and the only thing that clears `active` is the edge function
    // finishing THIS one, which needs the roster row the two lines above just
    // deleted. An untaken offer is stale too (it was minted for the faction and
    // throne level being wiped here), and a finished-but-unseen row would pay
    // out a reward for a unit that no longer exists. The whole account is going
    // away, so the rows go with it. Keyed on `player`, which holds the chat_id
    // as text — see ERRAND_TABLE.
    await supabase(`${ERRAND_TABLE}?player=eq.${encodeURIComponent(chat_id)}`, { method: 'DELETE' });
    
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
    // Tutorials are KEPT. A reset takes the faction, hero, units, buildings and
    // resources, but it does not take back what the player already knows, and
    // walking them through onboarding again is a punishment rather than a help.
    // `tutorials` is simply left out of the PATCH below, so the column keeps
    // whatever it held.

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
    serverError(res, err);
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
    serverError(res, err);
  }
});

// The display name a player is known by. Seeded from Telegram at first login
// (see /login) and never written again by it, so an edit here sticks.
//
// NOT checked for uniqueness, and it must not be: chat_id is the identifier
// everything actually keys on. Two players may pick the same name and nothing
// downstream cares.
const USERNAME_MAX = 24;

router.post('/player/username', requireAuth, async (req, res) => {
  const { player_id, chat_id, username } = req.body;
  if (!player_id || !chat_id || typeof username !== 'string') {
    return res.status(400).json({ error: 'player_id, chat_id, and username required' });
  }
  // Collapse runs of whitespace as well as trimming the ends: a name is one
  // line, and padding it out is the cheapest way to make a scoreboard look odd.
  const clean = username.replace(/\s+/g, ' ').trim().slice(0, USERNAME_MAX);
  if (!clean) return res.status(400).json({ error: 'username cannot be empty' });
  try {
    const updated = await supabase(`/players?id=eq.${encodeURIComponent(player_id)}&chat_id=eq.${encodeURIComponent(chat_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ username: clean }),
    });
    if (!updated.length) return res.status(404).json({ error: 'Player not found' });
    res.json(updated[0]);
  } catch (err) {
    serverError(res, err);
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
    const [resources, trophies, tokens, structRows, roster, items] = await Promise.all([
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}&item_type=eq.resource`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}&item_type=eq.trophy`),
      // Tokens are their own item_type rather than a resource, because they must
      // NOT appear in the resource bar — it is full, and a Sigil is not something
      // you spend on a build. They surface only where they are used: a badge on
      // the respec button, a button in the unit sheet.
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}&item_type=eq.token`),
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
      supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero`),
      player
        ? fetchItems(`/items?player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`)
        : Promise.resolve([]),
    ]);
    res.json({
      resources,
      trophies,
      tokens,
      items,
      structures: structRows[0] || null,
      roster,
      // Embark progress rides along so the roster's craft catalog can gate
      // blueprints (data/items.js `requires`) without a second round-trip.
      progress: player?.progress || {},
      buildings: {
        pools:                BUILDING_POOLS,
        slot_categories:      SLOT_CATEGORIES,
        slot_layers:          SLOT_LAYERS,
        slot_unlocks:         SLOT_UNLOCKS,
        slot_fixed_building:  SLOT_FIXED_BUILDING,
        upgrade_paths:        UNIT_UPGRADE_PATHS,
        hero_max_level:       HERO_MAX_LEVEL,
        throne_max_level:     THRONE_MAX_LEVEL,
        throne_upgrade_costs: THRONE_UPGRADE_COSTS,
        base_max_unit_tier:   maxUnitTier({}),
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
      // The second ad type, reported the same way and for the same reason: the
      // errands sheet can label its reroll button without a round-trip of its own.
      errand_reroll: {
        remaining: player ? Math.max(0, REROLL_DAILY_CAP - favorRecordFor(player).reroll.count) : 0,
        cap:       REROLL_DAILY_CAP,
        seconds:   REROLL_AD_SECONDS,
      },
      // The running event, or null. Presentational only — what it actually pays
      // is decided server-side at battle end, never from this.
      event: eventPayload(await getActiveEvent(supabase)),
    });
  } catch (err) {
    serverError(res, err);
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
    return serverError(res, err);
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
    serverError(res, err);
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
    serverError(res, err);
  }
});

router.get('/roster', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const rows = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero`);
    res.json(rows);
  } catch (err) {
    serverError(res, err);
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

    const [updated, resources] = await Promise.all([
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&select=id,chat_id,unit_data,is_hero`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
    ]);
    res.json({ success: true, roster: updated[0], resources });
  } catch (err) {
    serverError(res, err);
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

    const [updated, resources] = await Promise.all([
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&select=id,chat_id,unit_data,is_hero`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
    ]);
    res.json({ success: true, roster: updated[0], resources });
  } catch (err) {
    serverError(res, err);
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
// Second ad type: swap today's errand offer for a different one. Same length of
// view and same daily allowance as a favor, deliberately — two ad types with
// different rules is two things for a player to learn about watching an ad.
const REROLL_AD_SECONDS  = 15;
const REROLL_DAILY_CAP   = 3;
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
//
// SHAPE. The column started as one ad type (favor) and its three fields sit at
// the top level: { date, count, pending }. A second ad type — rerolling the
// errand offer — is nested under its own key rather than adding `reroll_count`
// and `reroll_pending` beside them, so a third type is one more sub-object
// instead of two more loose fields:
//
//   { date, count, pending, reroll: { count, pending } }
//
// Favor stays where it is on purpose: moving it would have to migrate every
// in-flight record, and the day it is read wrong is the day someone gets free
// revives.
//
// EVERY caller must write back the WHOLE record. writeAdsRecord PATCHes the
// column outright, so a favor claim that wrote only its own fields would erase
// the day's reroll count — which is why both halves are carried here together.
function favorRecordFor(player) {
  const today = playerLocalDate(player.timezone);
  const rec   = player.adds_daily_view || {};
  const blank = { count: 0, pending: null };
  if (rec.date !== today) return { date: today, count: 0, pending: null, reroll: { ...blank } };
  return {
    date:    today,
    count:   Number(rec.count) || 0,
    pending: rec.pending || null,
    reroll: {
      count:   Number(rec.reroll?.count) || 0,
      pending: rec.reroll?.pending || null,
    },
  };
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

// ── Errands ─────────────────────────────────────────────────────────────────
// A daily solo task for one non-hero unit. Errands cannot fail; the cost is that
// the unit is away until it returns.
//
// THIS SERVICE DOES NOT COMPLETE ERRANDS. Everything past the start belongs to
// the Supabase edge functions: they finish the row, apply whatever it granted,
// and notify the player through the bot. What lives here is the offer, the
// start, and reading back a finished row so the player can SEE the result.
//
// Storage is the existing `errands` table — nothing was added to `roster` or
// `players`:
//   player       chat_id (FK)
//   errand       the errand id from data/errands.js
//   errand_data  jsonb, written on start (below) and extended on completion by
//                the edge function
//   active       true while the unit is out; the edge function flips it false
//
// The OFFER is not stored at all. It is derived from (chat_id + local date), so
// it is identical on every request that day — no reroll by refreshing — and it
// costs no column and no write.
const ERRAND_TABLE = '/errands';

// The Messenger's Post level, which is what errand payouts scale with. Named
// apart from throneLevelOf so the two cannot be swapped by accident — they used
// to be the same number.
function errandPostLevelOf(structures) {
  return buildingLevel(structures?.buildings_data, 'messenger_post');
}

function throneLevelOf(structures) {
  return structures?.buildings_data?.slot_0?.level ?? 0;
}

// Unit defs live in data/units.js keyed by faction; a roster row only carries
// unit_id, so the def is looked up the way the client's resolveUnitDef does.
let _errandUnitIndex = null;
function unitDefById(unitId) {
  if (!_errandUnitIndex) {
    _errandUnitIndex = {};
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.id && (node.tags || node.hp)) { _errandUnitIndex[node.id] = node; return; }
      Object.values(node).forEach(walk);
    })(UNITS);
  }
  return _errandUnitIndex[unitId] || null;
}
const resolveRosterDef = row => unitDefById(row?.unit_data?.unit_id);

// Deterministic per player per day, so the same offer survives a refresh and a
// bug is reproducible.
function dailySeed(chat_id, date) {
  const s = `${chat_id}|${date}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// The completability rule: only errands SOME free unit actually satisfies are
// eligible, so an offer can never be a dead end.
//
// The pick is deterministic per player per day (dailySeed), which mattered when
// the offer was derived on every read. It is now derived ONCE and stored (see
// ensureErrandOffer), so the seed is really only a tie-breaker — but it is kept
// because it makes a bad pick reproducible.
// `salt` varies the otherwise fixed daily seed. Without it a reroll re-ran the
// same modulo over the same list and handed back the identical errand — the
// determinism that makes the daily offer stable is exactly what has to be broken
// to change it.
//
// `requireDifferent` turns the "no fresh option" case from a silent fallback
// into a null. Normally, if the only eligible errand is the one just run, giving
// it again beats giving nothing. For a reroll it does not: the player paid an ad
// view for a DIFFERENT errand, so the caller needs to know it cannot deliver and
// refund rather than hand back what they already had.
function pickErrandFor({ chat_id, faction, postLevel, freeRows, date, lastErrandId = null, salt = '', requireDifferent = false }) {
  if (!freeRows.length) return null;

  const profiles = freeRows.map(row => ({ row, profile: ERR.unitProfile(row, resolveRosterDef) }));
  const pool = ERR.ERRANDS.filter(e => e.faction === faction);
  const tier = ERR.errandTier(postLevel);

  const eligible = [];
  for (const errand of pool) {
    const resolved = ERR.resolveRequirement(errand);
    if (profiles.some(p => ERR.unitMeets(p.profile, resolved))) eligible.push({ errand, resolved });
  }
  if (!eligible.length) return null;

  // Don't hand back the last errand run while another one fits.
  const fresh = eligible.filter(e => e.errand.id !== lastErrandId);
  if (requireDifferent && !fresh.length) return null;
  const from  = fresh.length ? fresh : eligible;
  const pick  = from[dailySeed(chat_id, `${date}${salt ? `|${salt}` : ''}`) % from.length];

  return { errand_id: pick.errand.id, tier, requirement: pick.resolved };
}

// Who on the roster can take this offer RIGHT NOW, and what each of them would
// bring back. Recomputed on every read rather than stored with the offer: the
// roster changes under a standing offer (a unit dies, a new one is recruited, an
// item grants a tag), and a stale candidate list would either hide a legal unit
// or offer one that no longer qualifies.
function errandCandidates(offer, freeRows) {
  const def = ERR.ERRANDS_BY_ID[offer.errand_id];
  if (!def) return [];
  return freeRows
    .map(row => ({ row, profile: ERR.unitProfile(row, resolveRosterDef) }))
    .filter(p => ERR.unitMeets(p.profile, offer.requirement))
    .map(p => ({ roster_id: String(p.row.id), tags: p.profile.tags }));
}

// The whole offer as the client needs it: the errand, every duration priced, and
// what each tag half pays. Per-unit totals are NOT precomputed — the sheet shows
// the two halves and the player works out that a dual-tag unit takes both.
function offerPayload(offer, freeRows, postLevel) {
  const def = ERR.ERRANDS_BY_ID[offer.errand_id];
  if (!def) return null;
  const durations = ERR.DURATIONS.map(d => ({
    hours: d.hours,
    mult:  d.mult,
    parts: ERR.rewardParts(def, postLevel, offer.tier, d.hours),
  }));
  const cands = errandCandidates(offer, freeRows);
  return {
    errand_id:   offer.errand_id,
    tier:        offer.tier,
    requirement: offer.requirement,
    durations,
    hours:       durations[0].hours,
    // Roster ids only, so the existing client filter keeps working; the tag
    // detail rides alongside for the "what would this one bring?" line.
    candidates:      cands.map(c => c.roster_id),
    candidate_tags:  Object.fromEntries(cands.map(c => [c.roster_id, c.tags])),
  };
}

// Free = on the roster, alive, not the hero, not already out on an errand.
// Roster rows for the errand checks, each carrying the stats of whatever item
// the unit is wearing. Equipping only records the link — the roster row keeps
// base stats — so a tag an item grants is invisible to any check that reads the
// row on its own, and errands are tag checks. See `unitProfile` in
// data/errands.js, which reads `_item_stats` off the row.
async function errandRosterRows(chat_id, player) {
  const [roster, items] = await Promise.all([
    supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero`),
    player?.id
      ? fetchItems(`/items?player_id=eq.${player.id}&select=item_stats,equipped_by`)
      : Promise.resolve([]),
  ]);
  const byRosterId = new Map();
  for (const it of items) {
    if (it.equipped_by != null) byRosterId.set(String(it.equipped_by), it.item_stats || null);
  }
  return roster.map(r => ({ ...r, _item_stats: byRosterId.get(String(r.id)) || null }));
}

function freeRosterRows(roster, activeRows) {
  const busy = new Set(activeRows.map(r => String(r.errand_data?.roster_id)));
  return roster.filter(r =>
    r.is_hero !== true && r.unit_data?.alive !== false && !busy.has(String(r.id)));
}

// ── The offer is a ROW, not a derivation ────────────────────────────────────
// It used to be recomputed from (chat_id + date) on every request, which meant
// /errands/start had to re-derive it and trust that it matched what the player
// was shown. Now the offer is written once — at login — and start only ever
// reads it back. Consequences that are the point of the change:
//   * there is at most ONE offer row per player, so an offer cannot be farmed by
//     calling start repeatedly or by racing two clients
//   * the errand a player is holding cannot change under them mid-session
//   * start validates against stored server state instead of against input
//
// Row states, all on the same `errands` table:
//   offered   active=false, errand_data.offered=true   waiting to be taken
//   running   active=true                              unit is out
//   finished  active=false, no `offered` flag          edge function ended it
async function ensureErrandOffer(chat_id, player) {
  const [structRows, roster, rows] = await Promise.all([
    supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
    errandRosterRows(chat_id, player),
    errandRowsFor(chat_id),
  ]);

  const active  = rows.filter(r => r.active);
  const offered = rows.filter(r => !r.active && r.errand_data?.offered);

  // One at a time. A second errand while one is out would let a player empty the
  // roster and then be unable to embark, which is the opposite of a draw.
  if (active.length) return { rows, active, offerRow: null, roster, structRows };
  // Already holding an offer: hand back the oldest and never mint a second. If a
  // race did write two, this consistently picks the same one and the extra is
  // simply never shown.
  if (offered.length) {
    const offerRow = offered.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
    return { rows, active, offerRow, roster, structRows };
  }

  const offer = pickErrandFor({
    chat_id,
    faction: player.faction,
    postLevel: errandPostLevelOf(structRows[0]),
    freeRows: freeRosterRows(roster, active),
    date: playerLocalDate(player.timezone),
    lastErrandId: rows[0]?.errand ?? null,
  });
  if (!offer) return { rows, active, offerRow: null, roster, structRows };

  const inserted = await supabase(ERRAND_TABLE, {
    method: 'POST',
    body: JSON.stringify({
      player: String(chat_id),
      errand: offer.errand_id,
      errand_data: {
        offered:     true,
        tier:        offer.tier,
        requirement: offer.requirement,
        offered_at:  new Date().toISOString(),
      },
      active: false,
    }),
    headers: { Prefer: 'return=representation' },
  });
  const offerRow = Array.isArray(inserted) ? inserted[0] : inserted;
  return { rows: [offerRow, ...rows], active, offerRow, roster, structRows };
}

// Rows this player has, newest first. `active` separates "out" from "finished".
async function errandRowsFor(chat_id) {
  return supabase(`${ERRAND_TABLE}?player=eq.${encodeURIComponent(chat_id)}&order=created_at.desc&limit=20`);
}

// GET /errands — the standing offer, whatever is running, and any finished
// errand the player has not been shown yet. Creating the offer here as well as
// at login is deliberate: a player whose session predates the offer row, or
// whose roster only just became able to answer one, still gets theirs — and
// ensureErrandOffer refuses to mint a second either way.
router.get('/errands', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const player = await getPlayerByChatId(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const { rows, active, offerRow, roster, structRows } = await ensureErrandOffer(chat_id, player);

    // Finished but not yet acknowledged. The edge function ends the errand and
    // the bot announces it; this is what the player sees when they come back in.
    // An OFFERED row is also `active: false`, so it has to be excluded here or
    // an untaken offer would be reported as a completed one.
    const unseen = rows.filter(r => !r.active && !r.errand_data?.offered && !r.errand_data?.seen);

    const offer = offerRow
      ? offerPayload(
          { errand_id: offerRow.errand, ...offerRow.errand_data },
          freeRosterRows(roster, active),
          errandPostLevelOf(structRows[0]))
      : null;

    res.json({
      offer,
      active: active.map(r => ({ id: r.id, errand_id: r.errand, ...r.errand_data })),
      finished: unseen.map(r => ({ id: r.id, errand_id: r.errand, ...r.errand_data })),
      definitions: ERR.ERRANDS,
    });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /errands/start — send a unit on the standing offer. The offer is read
// back from its row; the request only says WHO goes and for HOW LONG, and both
// are validated. Nothing about the errand or its reward comes from the client.
router.post('/errands/start', requireAuth, async (req, res) => {
  const { chat_id, roster_id, hours } = req.body;
  if (!chat_id || !roster_id) return res.status(400).json({ error: 'chat_id and roster_id required' });
  try {
    const player = await getPlayerByChatId(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const [structRows, roster, rows] = await Promise.all([
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
      errandRosterRows(chat_id, player),
      errandRowsFor(chat_id),
    ]);
    // The building that runs errands has to exist. Enforced here as well as in
    // the UI, because the UI only hides the button.
    if (errandPostLevelOf(structRows[0]) < 1) {
      return res.status(400).json({ error: "Build the Messenger's Post first", code: 'errand_no_post' });
    }

    const active = rows.filter(r => r.active);
    if (active.length) {
      return res.status(400).json({ error: 'A unit is already on an errand', code: 'errand_busy' });
    }

    const offerRow = rows
      .filter(r => !r.active && r.errand_data?.offered)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
    if (!offerRow) return res.status(400).json({ error: 'No errand available', code: 'errand_no_offer' });

    const offer = { errand_id: offerRow.errand, ...offerRow.errand_data };
    const def   = ERR.ERRANDS_BY_ID[offer.errand_id];
    if (!def) return res.status(400).json({ error: 'No errand available', code: 'errand_no_offer' });

    const row = roster.find(r => String(r.id) === String(roster_id));
    if (!row) return res.status(404).json({ error: 'Unit not found' });
    if (row.is_hero === true) return res.status(400).json({ error: 'The hero cannot run errands', code: 'errand_hero' });
    if (row.unit_data?.alive === false) {
      return res.status(400).json({ error: 'That unit cannot go', code: 'errand_requirement' });
    }

    const profile = ERR.unitProfile(row, resolveRosterDef);
    if (!ERR.unitMeets(profile, offer.requirement)) {
      return res.status(400).json({ error: 'That unit does not meet the requirement', code: 'errand_requirement' });
    }

    const postLevel = errandPostLevelOf(structRows[0]);
    const now         = Date.now();
    // The client sends which trip it picked; an unknown value resolves to the
    // shortest one, so the duration multiplier can never be forged.
    const duration = ERR.durationFor(hours);

    // Everything the edge function needs to finish this without re-deriving it,
    // and everything the client needs to render it. The reward is computed from
    // the tags THIS unit has — a unit carrying both of the errand's tags earns
    // both halves, one carrying a single tag earns one.
    const errand_data = {
      roster_id:   String(roster_id),
      unit_id:     row.unit_data?.unit_id ?? null,
      unit_name:   resolveRosterDef(row)?.name ?? null,
      unit_tags:   profile.tags,
      // Carried on the row so the edge function can name the errand in the bot
      // message without importing data/errands.js (it is CommonJS, and Deno
      // would have to reimplement the lookup to read it).
      title:       def.title,
      tier:        offer.tier,
      hours:       duration.hours,
      started_at:  new Date(now).toISOString(),
      ends_at:     new Date(now + duration.hours * 3600 * 1000).toISOString(),
      requirement: offer.requirement,
      // What the errand is WORTH. The edge function applies it and may write
      // back what it actually granted; this stays as the promise that was made.
      reward:      ERR.rewardForTags(def, profile.tags, postLevel, offer.tier, duration.hours),
    };

    // The offer row BECOMES the running errand — it is not a second row. That is
    // what keeps "one errand per player" true no matter how the endpoint is
    // called: there was one row, and now it is busy.
    const updated = await supabase(`${ERRAND_TABLE}?id=eq.${encodeURIComponent(offerRow.id)}&active=is.false`, {
      method: 'PATCH',
      body: JSON.stringify({ errand_data, active: true }),
      headers: { Prefer: 'return=representation' },
    });
    const startedRow = Array.isArray(updated) ? updated[0] : updated;
    // The `active=is.false` filter is the race guard: a second start that lands
    // after the first matches no row and comes back empty rather than
    // overwriting a unit that is already out.
    if (!startedRow) {
      return res.status(400).json({ error: 'A unit is already on an errand', code: 'errand_busy' });
    }

    res.json({ success: true, errand: startedRow });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /errands/seen — the player has been shown the result. Marks the finished
// row acknowledged so it stops reappearing. Display bookkeeping only: it grants
// nothing and never touches `active`.
router.post('/errands/seen', requireAuth, async (req, res) => {
  const { chat_id, errand_row_id } = req.body;
  if (!chat_id || !errand_row_id) return res.status(400).json({ error: 'chat_id and errand_row_id required' });
  try {
    const rows = await supabase(`${ERRAND_TABLE}?id=eq.${encodeURIComponent(errand_row_id)}&player=eq.${encodeURIComponent(chat_id)}&limit=1`);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Errand not found' });
    if (row.active) return res.status(400).json({ error: 'That errand is still running', code: 'errand_active' });

    await supabase(`${ERRAND_TABLE}?id=eq.${encodeURIComponent(errand_row_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ errand_data: { ...(row.errand_data || {}), seen: true } }),
    });
    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
});

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
    serverError(res, err);
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
    serverError(res, err);
  }
});

// ── Errand reroll (ad) ──────────────────────────────────────────────────────
// Watch an ad, swap today's offer for a different errand. Same two-step shape as
// /favor: start mints a token, claim verifies the view actually elapsed on the
// SERVER's clock and only then does the work.
//
// The reroll deletes the offer row and writes a new one, rather than editing it
// in place — `errand_data` carries `offered_at`, and a rerolled offer is a new
// offer, not the old one wearing a different id.
router.post('/errands/reroll/start', requireAuth, async (req, res) => {
  const { chat_id } = req.body;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const player = await getPlayerByChatId(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const rows    = await errandRowsFor(chat_id);
    const active  = rows.filter(r => r.active);
    const offered = rows.filter(r => !r.active && r.errand_data?.offered);

    // Nothing to swap. Checked before the allowance so a player cannot burn a
    // day's rerolls against an offer that is not there.
    if (active.length)   return res.status(400).json({ error: 'An errand is already running', code: 'errand_busy' });
    if (!offered.length) return res.status(400).json({ error: 'No offer to reroll',           code: 'reroll_no_offer' });

    const record = favorRecordFor(player);
    if (record.reroll.count >= REROLL_DAILY_CAP) {
      return res.status(429).json({ error: 'Daily reroll limit reached', code: 'reroll_cap', remaining: 0, cap: REROLL_DAILY_CAP });
    }

    const token = crypto.randomUUID();
    record.reroll.pending = { token, started_at: Date.now() };
    await writeFavorRecord(chat_id, record);

    res.json({
      token,
      seconds:   REROLL_AD_SECONDS,
      remaining: REROLL_DAILY_CAP - record.reroll.count,
      cap:       REROLL_DAILY_CAP,
    });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/errands/reroll/claim', requireAuth, async (req, res) => {
  const { chat_id, token } = req.body;
  if (!chat_id || !token) return res.status(400).json({ error: 'chat_id and token required' });
  try {
    const player = await getPlayerByChatId(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    // Recomputed, so a view started just before local midnight lands in the new
    // day's allowance rather than double-spending the old one.
    const record  = favorRecordFor(player);
    const pending = record.reroll.pending;
    if (!pending || pending.token !== token) {
      return res.status(400).json({ error: 'No reroll in progress', code: 'reroll_none' });
    }

    const elapsedMs = Date.now() - Number(pending.started_at || 0);
    if (elapsedMs > FAVOR_PENDING_TTL_MS) {
      record.reroll.pending = null;
      await writeFavorRecord(chat_id, record);
      return res.status(400).json({ error: 'Reroll expired — start again', code: 'reroll_expired' });
    }
    if (elapsedMs < REROLL_AD_SECONDS * 1000 - 750) {
      return res.status(400).json({ error: 'Ad not finished', code: 'reroll_early' });
    }
    if (record.reroll.count >= REROLL_DAILY_CAP) {
      record.reroll.pending = null;
      await writeFavorRecord(chat_id, record);
      return res.status(429).json({ error: 'Daily reroll limit reached', code: 'reroll_cap', remaining: 0, cap: REROLL_DAILY_CAP });
    }

    // Re-read rather than trusting what was true at start — the player may have
    // taken the errand while the ad played.
    const [structRows, roster, rows] = await Promise.all([
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
      errandRosterRows(chat_id, player),
      errandRowsFor(chat_id),
    ]);
    const active  = rows.filter(r => r.active);
    const offered = rows.filter(r => !r.active && r.errand_data?.offered);
    if (active.length || !offered.length) {
      // Burn the token, do NOT spend a daily use — there is nothing to swap.
      record.reroll.pending = null;
      await writeFavorRecord(chat_id, record);
      return res.status(400).json({ error: 'No offer to reroll', code: 'reroll_no_offer' });
    }

    const oldRow = offered.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];

    // The whole point of the ad: it must not come back the same. `salt` moves
    // the daily seed off its fixed value and requireDifferent refuses rather
    // than falling back to the errand being replaced.
    const offer = pickErrandFor({
      chat_id,
      faction:      player.faction,
      postLevel:    errandPostLevelOf(structRows[0]),
      freeRows:     freeRosterRows(roster, active),
      date:         playerLocalDate(player.timezone),
      lastErrandId: oldRow.errand,
      salt:         `reroll:${record.reroll.count + 1}`,
      requireDifferent: true,
    });
    if (!offer) {
      // Only one errand this roster can answer. Refund by not counting it.
      record.reroll.pending = null;
      await writeFavorRecord(chat_id, record);
      return res.status(400).json({ error: 'No other errand fits your roster right now', code: 'reroll_no_alternative' });
    }

    await supabase(`${ERRAND_TABLE}?id=eq.${encodeURIComponent(oldRow.id)}`, { method: 'DELETE' });
    const inserted = await supabase(ERRAND_TABLE, {
      method: 'POST',
      body: JSON.stringify({
        player: String(chat_id),
        errand: offer.errand_id,
        errand_data: {
          offered:     true,
          tier:        offer.tier,
          requirement: offer.requirement,
          offered_at:  new Date().toISOString(),
          rerolled_from: oldRow.errand,
        },
        active: false,
      }),
      headers: { Prefer: 'return=representation' },
    });
    const offerRow = Array.isArray(inserted) ? inserted[0] : inserted;

    record.reroll.count  += 1;
    record.reroll.pending = null;
    await writeFavorRecord(chat_id, record);

    res.json({
      success:   true,
      offer:     offerPayload({
        errand_id:   offerRow.errand,
        tier:        offerRow.errand_data.tier,
        requirement: offerRow.errand_data.requirement,
      }, freeRosterRows(roster, active), errandPostLevelOf(structRows[0])),
      remaining: REROLL_DAILY_CAP - record.reroll.count,
      cap:       REROLL_DAILY_CAP,
    });
  } catch (err) {
    serverError(res, err);
  }
});

// Tome of Knowledge: pour a flat 100 XP into one unit and auto-level it if that
// carries it over a threshold. The catch-up tool — a player switching to a fresh
// branch late should be able to field the new unit beside their veterans instead
// of re-grinding a whole army's worth of history.
//
// Deliberately NOT gated on the unit being new or low-level: the player decides
// what needs catching up. The gate is supply — six tomes exist, all first-clear.
router.post('/roster/tome', requireAuth, async (req, res) => {
  const { chat_id, roster_id } = req.body;
  if (!chat_id || !roster_id) return res.status(400).json({ error: 'chat_id and roster_id required' });
  try {
    const [rosterRows, tokenRows] = await Promise.all([
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}&item_type=eq.token&item=eq.tome_of_knowledge`),
    ]);
    if (!rosterRows.length) return res.status(404).json({ error: 'Roster entry not found' });
    const tomeRow = tokenRows[0];
    if (!tomeRow || Number(tomeRow.amount) < 1) {
      return res.status(400).json({ error: 'No Tome of Knowledge to use', code: 'no_tome' });
    }

    const entry    = rosterRows[0];
    const unitData = entry.unit_data || {};
    // A fallen unit cannot be taught. Resurrect first — same rule the heal
    // button follows, and for the same reason: the roster screen should not let
    // a player quietly spend something on a corpse.
    if (unitData.alive === false) return res.status(400).json({ error: 'Cannot use a Tome on a fallen unit — resurrect it first' });

    await supabase(`/resources?id=eq.${tomeRow.id}`, {
      method: 'PATCH', body: JSON.stringify({ amount: Number(tomeRow.amount) - 1 }) });
    await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ unit_data: { ...unitData, current_xp: Number(unitData.current_xp ?? 0) + TOME_XP } }),
    });

    // Same auto-level pass the promo and post-battle paths use, so a unit the
    // tome pushes over its threshold advances right away — including the hero,
    // whose level applyAutoLevelUps caps at the throne's.
    let autoLeveled = [];
    const structRows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1&select=buildings_data`);
    const fresh = await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&select=id,unit_data,is_hero`);
    try { autoLeveled = await applyAutoLevelUps(fresh, structRows[0]?.buildings_data); }
    catch (err) { console.error('tome auto level-up failed:', err.message); }

    const updated = await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&select=id,chat_id,unit_data,is_hero`);
    res.json({ success: true, xp: TOME_XP, roster: updated[0], tomes_left: Number(tomeRow.amount) - 1, auto_level_ups: autoLeveled });
  } catch (err) {
    serverError(res, err);
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
      // Units stop at tier 2 until the Proving Grounds is raised. Checked on the
      // UNIT's next tier, not the building's, because the building can already
      // stand a tier above the unit inside it.
      const tierCap  = maxUnitTier(structRows[0].buildings_data);
      const nextTier = (fullDef.t ?? 1) + 1;
      if (nextTier > tierCap) {
        return res.status(400).json({
          error: `Tier ${nextTier} needs the Proving Grounds. Build or raise it first.`,
          code: 'tier_capped', tier_cap: tierCap,
        });
      }
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
    newUnitData.current_xp = Math.max(0, (unitData.current_xp ?? 0) - (xpRequired ?? 0));
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
    serverError(res, err);
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
    let target    = options.find(o => o.id === building_id);

    // Failing that, the target may be across a fork. That is a different move
    // with a different price: the ordinary cost AND a Crossroad Sigil, which
    // cannot be bought. The tier check still holds — getCrossBranchRespecOptions
    // only ever returns buildings standing at the tier this slot is already at.
    let usedSigil = false;
    if (!target) {
      target = getCrossBranchRespecOptions(faction, current.building_id).find(o => o.id === building_id);
      if (target) usedSigil = true;
    }
    if (!target) return res.status(400).json({ error: 'That building is not a valid respec for this slot' });

    const cost = getRespecCost(faction, target.id, current.level);
    const inventory = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`);
    for (const [item, amount] of Object.entries(cost)) {
      const key = item === 'gold' ? 'Gold' : item;
      const row = inventory.find(r => r.item === key);
      if (!row || Number(row.amount) < amount) return res.status(400).json({ error: `Not enough ${key}. Need ${amount}` });
    }
    // Checked before anything is spent, so a player short a Sigil does not pay
    // the gold and then get refused.
    const sigilRow = usedSigil
      ? inventory.find(r => r.item === 'crossroad_sigil' && r.item_type === 'token')
      : null;
    if (usedSigil && (!sigilRow || Number(sigilRow.amount) < 1)) {
      return res.status(400).json({ error: 'A Crossroad Sigil is needed to respec across branches', code: 'no_sigil' });
    }
    // Together, not one after another: these are independent rows, and a build
    // costing gold + two crystals was three sequential trips to Supabase before
    // the player saw anything happen.
    await Promise.all(Object.entries(cost).map(([item, amount]) => {
      const key = item === 'gold' ? 'Gold' : item;
      const row = inventory.find(r => r.item === key);
      return supabase(`/resources?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(row.amount) - amount }) });
    }));

    if (sigilRow) {
      await supabase(`/resources?id=eq.${sigilRow.id}`, {
        method: 'PATCH', body: JSON.stringify({ amount: Number(sigilRow.amount) - 1 }) });
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
    res.json({ structures: updated[0], cost, swapped_unit: swappedUnit, used_sigil: usedSigil });
  } catch (err) {
    serverError(res, err);
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
      const items = await fetchItems(`/items?equipped_by=eq.${encodeURIComponent(entry.id)}&select=id`);
      for (const item of items) await unequipItemFromRosterUnit(item, entry.id);
      await supabase(`/roster?id=eq.${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
    }

    buildings[slot] = { level: 0, building_id: null };
    const updated = await supabase(`/structures?id=eq.${record.id}`, { method: 'PATCH', body: JSON.stringify({ buildings_data: buildings }) });
    res.json({ structures: updated[0], removed_units: doomed.map(d => d.id) });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/structures/build', requireAuth, async (req, res) => {
  const { chat_id, slot, building_id } = req.body;
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
    // A fixed slot is one building, not a category. Enforced here so the ladder
    // cannot be sidestepped by posting a different id of the right category.
    const fixedBuilding = SLOT_FIXED_BUILDING[slot];
    if (SLOT_LAYERS[slot] === 2) {
      if (!fixedBuilding) {
        return res.status(400).json({ error: `Slot ${slot} is reserved`, code: 'slot_reserved' });
      }
      if (building_id !== fixedBuilding) {
        return res.status(400).json({ error: `Slot ${slot} only accepts ${fixedBuilding}`, code: 'slot_fixed', requires: fixedBuilding });
      }
    }
    if (!rows.length) return res.status(404).json({ error: 'Structures not found' });
    const record    = rows[0];
    const buildings = record.buildings_data;
    // Gated slots (the special row, and the three barracks added with layer 2)
    // stay shut until their unlocking building exists. Enforced here, not only
    // in the UI, because the UI is a suggestion and this endpoint is the rule.
    const lockedBy = slotLockedBy(buildings, slot);
    if (lockedBy) {
      return res.status(400).json({ error: `That slot is locked until you build: ${lockedBy}`, code: 'slot_locked', requires: lockedBy });
    }
    const current   = buildings[slot] || { level: 0, building_id: null };
    const isNew     = !current.building_id;
    // A BRANCH upgrade swaps the slot for a DIFFERENT building, so it starts at
    // level 1 — it does not continue the old building's level. Only a building
    // that levels IN PLACE (the throne, and layer 2's ladder) counts up.
    //
    // Without this every branch upgrade was rejected outright: a Smith Workshop
    // at level 1 upgrading to a Mechanic Den computed level 2 and compared it
    // against the Den's own max level of 1, so the answer was always "Already at
    // max level". It also priced the build at a level the new building does not
    // have.
    // The THRONE is excluded: it advances by changing building_id AND counting
    // up — artificer_guild_2_b to artificer_guild_3_b is level 2 to level 3, one
    // building per level. Treating that as a swap reset it to level 1, which
    // then blocked the hero, because a hero may only reach a tier BELOW the
    // throne's level (see resolveAutoLevelUp).
    const isBranchSwap = !isNew && slotCategory !== 'throne' && current.building_id !== building_id;
    const nextLevel = isBranchSwap ? 1 : (current.level || 0) + 1;
    const cap = slotCategory === 'throne' ? THRONE_MAX_LEVEL : buildingMaxLevel(building_id);
    if (nextLevel > cap) return res.status(400).json({ error: 'Already at max level', code: 'max_level' });

    // Throne perks are gone — the throne is levels only, and what used to be a
    // perk is a building on layer 2. A `perk` in the body is ignored rather than
    // rejected, so an old client mid-session does not start failing.

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
      const cost = buildingCostForLevel(def, nextLevel);
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
        await Promise.all(wanted.map(([item, amount]) => {
          const row = inventory.find(r => r.item === item);
          return supabase(`/resources?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(row.amount) - amount }) });
        }));
      }
    }

    buildings[slot] = { level: nextLevel, building_id };

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

    // Roster and resources ride along: a build spawns a unit and spends the
    // cost, and without them the client has to go and read the whole bootstrap
    // back just to redraw what this call already knows.
    const [rosterAfter, resourcesAfter] = await Promise.all([
      supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
    ]);
    res.json({ ...updated[0], auto_level_ups: autoLeveled, roster: rosterAfter, resources: resourcesAfter });
  } catch (err) {
    serverError(res, err);
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
    serverError(res, err);
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
    serverError(res, err);
  }
});

// Kept for older clients only. Nothing in the current client asks for it — the
// browser no longer talks to Supabase realtime at all; it holds one SSE
// connection to us instead (GET /battle/stream). Returning nulls makes a stale
// client fall through to its polling path rather than opening a socket that
// counts against the Supabase connection cap.
router.get('/battle/realtime-config', requireAuth, async (req, res) => {
  res.json({ url: null, anonKey: null, superseded_by: '/battle/stream' });
});

// GET /battle/stream — server-sent events for one battle.
//
// EventSource cannot set request headers, so the session token arrives as a
// query parameter here rather than in x-session-token. It is checked against the
// same players.session_token column requireAuth uses; the token is not a bearer
// credential for anything outside this app, and the alternative (an unauthed
// stream) would let anyone watch any battle by id.
router.get('/battle/stream', async (req, res) => {
  const { chat_id, battle_id, token } = req.query;
  if (!chat_id || !battle_id || !token) {
    return res.status(400).json({ error: 'chat_id, battle_id and token required' });
  }
  try {
    const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=session_token&limit=1`);
    if (!rows.length || rows[0].session_token !== token) return res.status(401).json({ error: 'Unauthorized' });

    const record = await getBattleState(battle_id);
    if (!record) return res.status(404).json({ error: 'No such battle' });
    // Both sides of a PvP battle watch the same room; battleSideFor is null for
    // anyone who is not in this fight.
    if (!battleSideFor(record, chat_id)) return res.status(403).json({ error: 'Forbidden' });

    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      // Render sits behind a proxy that will otherwise buffer the stream and
      // deliver nothing until it closes.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    const close = battleBus.subscribe(battle_id, String(chat_id), res);
    if (!close) {
      // Room full — say so and hang up, so the client takes its polling path
      // instead of sitting on a stream that will never speak.
      res.write('event: full\ndata: {}\n\n');
      return res.end();
    }

    // An opening frame is what tells the client the stream is live, as opposed
    // to a request that connected but is being buffered somewhere.
    res.write(`event: ready\ndata: ${JSON.stringify({ battle_id })}\n\n`);
    req.on('close', close);
  } catch (err) {
    // Headers may already be sent, in which case serverError would throw.
    if (res.headersSent) { try { res.end(); } catch {} return; }
    serverError(res, err);
  }
});

router.get('/battle/state', requireAuth, async (req, res) => {
  const { battle_id, last_log_id, chat_id } = req.query;
  if (!battle_id) return res.status(400).json({ error: 'battle_id required' });
  try {
    let record = await getBattleState(battle_id);
    if (!record) return res.status(404).json({ error: 'No active battle found' });
    if (isPvpRecord(record) && chat_id && !battleSideFor(record, chat_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    let engine = await rehydrateEngine(record);

    // The waiting player's own poll is what enforces the other player's clock.
    // Nothing schedules this: a read that finds an expired turn resolves it and
    // writes the result, so the battle cannot sit frozen behind a locked phone.
    if (applyExpiredTurns(record, engine)) {
      record = await persistPvpTurn(record, engine, { causedBy: null });
      engine = record._engine || engine;
    }

    const logs = await getBattleLogsSince(battle_id, last_log_id ? Number(last_log_id) : null);
    const bd = record.battle_data;
    const view = viewFor(record, chat_id, {
      state:  engine.getSnapshot(),
      logs,
      winner: bd.winner ?? null,
    });
    res.json({
      state:     view.state,
      logs:      view.logs,
      done:      bd.done ?? false,
      winner:    view.winner,
      region_id: bd.region_id,
      level:     bd.level,
      kind:      isPvpRecord(record) ? 'pvp' : 'pve',
      // Whose move it is, and how long they have left — the client needs both to
      // draw "opponent's turn" and a countdown without inventing its own clock.
      your_side:     battleSideFor(record, chat_id),
      acting_side:   engine.done ? null : (engine.currentActor()?.side ?? null),
      turn_deadline: bd.turn_deadline ?? null,
    });
  } catch (err) {
    serverError(res, err);
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
    if (existing) return res.status(400).json({ error: 'A battle is already in progress', code: 'battle_in_progress' });
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

    // Spells are no longer chosen before the fight. They are cast IN battle by
    // the hero, paid for with power earned during it (POST /battle/cast), so
    // nothing is selected, validated or charged here any more. Crystals are
    // spent once at research time and never again.
    //
    // `selected_spells` is still accepted and stored so an in-flight client does
    // not 400, but it is inert.

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
    serverError(res, err);
  }
});

// POST /battle/cast — the hero spends its turn on a spell.
//
// The spell must be RESEARCHED (crystals were paid then, once) and the side must
// hold enough power, which is earned only inside this battle. Everything is
// re-checked here against server state: the client sends an id, a power amount
// and a target, and nothing else it says is trusted.
router.post('/battle/cast', requireAuth, async (req, res) => {
  const { chat_id, battle_id, spell_id, power, target_id } = req.body;
  if (!chat_id || !battle_id || !spell_id) {
    return res.status(400).json({ error: 'chat_id, battle_id and spell_id required' });
  }
  try {
    const record = await getBattleState(battle_id);
    if (!record) return res.status(404).json({ error: 'No active battle found' });
    const mySide = battleSideFor(record, chat_id);
    if (!mySide) return res.status(403).json({ error: 'Forbidden' });

    const engine = await rehydrateEngine(record);
    if (engine.done) return res.status(400).json({ error: 'Battle is already over' });

    const hero = engine.heroFor(mySide);
    if (!hero)        return res.status(400).json({ error: 'No hero on the field' });
    if (!hero.alive)  return res.status(400).json({ error: 'Your hero has fallen' });

    // Casting IS the hero's turn, so it can only happen on the hero's turn.
    const currentActor = engine.currentActor();
    if (!currentActor || currentActor.id !== hero.id) {
      return res.status(400).json({ error: 'Not your hero\'s turn' });
    }

    const playerRows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=learned_spells,faction&limit=1`);
    if (!playerRows.length) return res.status(404).json({ error: 'Player not found' });
    const learned = playerRows[0].learned_spells || [];
    if (!learned.includes(spell_id)) return res.status(403).json({ error: 'Spell not researched' });

    const spellDef = (SPELLS[playerRows[0].faction] || []).find(s => s.id === spell_id);
    if (!spellDef) return res.status(404).json({ error: 'Spell not found for your faction' });

    const result = engine.doCast(hero, spellDef, { power, targetId: target_id ?? null });
    if (result.error) return res.status(400).json({ error: result.error });

    // The enemy answers immediately, exactly as after any other hero action —
    // unless the enemy is a player, who answers in their own time.
    if (!engine.done && !isPvpRecord(record)) engine.runAiTurns();

    const battle_data = withTurnDeadline(buildBattleData(engine, record.battle_data), record, engine);
    const previousLog = Array.isArray(record.battle_data?.log) ? record.battle_data.log : [];
    const newEntries  = engine.log.slice(previousLog.length);

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

    // Tell every other watcher of this battle that it moved. Only a pointer
    // travels — the client re-reads through /battle/state?last_log_id=N, so the
    // event and the data cannot drift apart. The caller who made this request
    // already has the result in the response body and ignores its own echo.
    battleBus.publish(battle_id, {
      last_log_id: insertedLogs.length ? insertedLogs[insertedLogs.length - 1].id : null,
      done: engine.done,
    }, { exceptChatId: chat_id });

    const view = viewFor(record, chat_id, { state: engine.getSnapshot(), logs: insertedLogs, winner: engine.winner });
    res.json({ ok: true, done: engine.done, winner: view.winner, logs: view.logs, state: view.state });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/battle/action', requireAuth, async (req, res) => {
  const { chat_id, battle_id, action, actor_id, target_id } = req.body;
  if (!chat_id || !battle_id || !action || !actor_id) return res.status(400).json({ error: 'chat_id, battle_id, action, actor_id required' });
  try {
    const record = await getBattleState(battle_id);
    if (!record) return res.status(404).json({ error: 'No active battle found' });
    // In PvE 'player' is the only commandable side and it belongs to chat_id. In
    // PvP each player commands the side they were seated on, so ownership is a
    // lookup rather than a constant.
    const mySide = battleSideFor(record, chat_id);
    if (!mySide) return res.status(403).json({ error: 'Forbidden' });

    const engine = await rehydrateEngine(record);
    if (engine.done) return res.status(400).json({ error: 'Battle is already over' });

    // A turn that ran out before this request arrived is resolved first, which
    // is also what stops a player who reconnects late from acting on a turn the
    // clock already spent.
    if (applyExpiredTurns(record, engine)) {
      const after = await persistPvpTurn(record, engine, { causedBy: null });
      return res.status(409).json({
        error: 'That turn expired', code: 'turn_expired',
        logs: after._insertedLogs, done: engine.done,
      });
    }

    const actor = engine.combatants.find(c => c.id === actor_id);
    if (!actor) return res.status(400).json({ error: 'Actor not found' });

    const currentActor = engine.currentActor();
    if (!currentActor || currentActor.id !== actor_id) return res.status(400).json({ error: 'Not this unit\'s turn' });
    if (actor.side !== mySide) return res.status(400).json({ error: 'Cannot control the other side\'s units' });

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

    // The other side is a person in PvP: the engine stops here and waits for
    // them, rather than answering on their behalf.
    if (!engine.done && !isPvpRecord(record)) {
      engine.runAiTurns();
    }

    // Auto-process any unity-bonded player units whose turn is next —
    // they can't act but their passives should still trigger, same as the AI loop.
    if (!engine.done && !isPvpRecord(record)) {
      let next = engine.currentActor();
      while (next && next.side === 'player' && (next._unity_host_id != null || next._invulnerable)) {
        // executeAction fires on_turn_start itself (see battle-engine.js), so
        // firing it here as well ran every on_turn_start passive TWICE for
        // exactly these units. Light of Dawn made it visible — the units that
        // carry it also carry Unity (data/units.js), so they always take this
        // path, and it healed and burnt twice every turn. The AI loop's version
        // of this branch calls doNone directly, which does NOT fire the
        // trigger, which is why it needs its own call and this one does not.
        engine.executeAction(next, null, 'none');
        if (engine.done) break;
        engine.runAiTurns();
        next = engine.currentActor();
      }
    }

    const battle_data = withTurnDeadline(buildBattleData(engine, record.battle_data), record, engine);

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

    // Tell every other watcher of this battle that it moved. Only a pointer
    // travels — the client re-reads through /battle/state?last_log_id=N, so the
    // event and the data cannot drift apart. The caller who made this request
    // already has the result in the response body and ignores its own echo.
    battleBus.publish(battle_id, {
      last_log_id: insertedLogs.length ? insertedLogs[insertedLogs.length - 1].id : null,
      done: engine.done,
    }, { exceptChatId: chat_id });

    const view = viewFor(record, chat_id, { state: engine.getSnapshot(), logs: insertedLogs, winner: engine.winner });
    res.json({ ok: true, done: engine.done, winner: view.winner, logs: view.logs, state: view.state });
  } catch (err) {
    serverError(res, err);
  }
});

// Build the duel from two queued formations and seat both players on it.
//
// The player who was already waiting is seated as the creator (engine side
// 'player'); the one who just arrived takes the enemy side. Which is which
// matters to nothing but storage — each of them is shown themselves on the left
// (see viewFor).
async function createPvpBattle(a, b) {
  const battle_id = `pvp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const [armyA, armyB] = await Promise.all([
    buildArmyFor(a.chat_id, a.formation.playerUnitIds),
    buildArmyFor(b.chat_id, b.formation.playerUnitIds),
  ]);

  const engine = await BattleEngine.fromSetup(
    armyA,
    asEnemySide(armyB, b.formation.placement || {}),
    a.formation.placement || {},
  );

  engine.firePendingRoundEffects();
  // Deliberately NO runAiTurns: both sides are people, and the first turn
  // belongs to whichever unit initiative gives it to.

  const battle_data = {
    ...buildBattleData(engine, {
      region_id: null,
      level:     null,
      selected_spells: [],
      setup: {
        playerUnitIds: armyA.map(u => ({ id: u.id, _rosterId: u._rosterId })),
        placement:     a.formation.placement || {},
        opponent: {
          chat_id:       String(b.chat_id),
          playerUnitIds: armyB.map(u => ({ id: u.id, _rosterId: u._rosterId })),
          placement:     b.formation.placement || {},
        },
      },
    }),
    kind:           'pvp',
    mode:           a.mode || 'pvp_quick',
    turn_deadline:  Date.now() + PVP_TURN_MS,
    turn_ms:        PVP_TURN_MS,
    rewards_claimed: {},
  };

  const record = await createBattleState({
    chat_id: String(a.chat_id),
    battle_id,
    battle_data,
    opponent_chat_id: String(b.chat_id),
    battle_kind: 'pvp',
  });

  let initialLogs = [];
  try {
    const initialEvents = Array.isArray(engine.log) ? engine.log : [];
    if (initialEvents.length) {
      const inserted = await appendBattleLogEntries(battle_id, initialEvents);
      initialLogs = (inserted || []).map(row => ({ id: row.id, ...row.event }));
    }
  } catch (err) {
    console.error('Failed to persist initial PvP log:', err);
  }

  return { record, battle_id, engine, initialLogs };
}

// ── PvP: quick match queue ──────────────────────────────────────────────────
//
// The queue lives in this process (utils/pvp-queue.js); pvp_queue in the
// database is its durable record, written best-effort. A failed write there
// must never cost a player their match, so every one of them is caught: the
// authority on who is queued is the map, and the row exists so a restart and a
// human looking at the table can both see what happened.
//
// A player waiting for an opponent holds an SSE connection on a room keyed by
// their own chat_id rather than by a battle — there is no battle yet, which is
// the whole point. GET /pvp/status is the same answer over HTTP, for the client
// whose stream never connected.

function pvpRoom(chatId) { return `pvp:${chatId}`; }

// What one player is told about the other. Deliberately not the formation: the
// opposing board is revealed by the battle, not by the queue.
async function pvpOpponentCard(chat_id) {
  try {
    const rows = await supabase(
      `/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=faction&limit=1`
    );
    return { chat_id: String(chat_id), faction: rows[0]?.faction ?? null };
  } catch {
    return { chat_id: String(chat_id), faction: null };
  }
}

async function writeQueueRow(entry) {
  try {
    await supabase('/pvp_queue', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        chat_id:     entry.chat_id,
        mode:        entry.mode,
        formation:   entry.formation,
        power:       entry.power,
        status:      'waiting',
        battle_id:   null,
        opponent_id: null,
        enqueued_at: new Date(entry.enqueuedAt).toISOString(),
        updated_at:  new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error('pvp_queue write failed (continuing):', err.message);
  }
}

async function clearQueueRows(chatIds) {
  const ids = chatIds.map(String).filter(Boolean);
  if (!ids.length) return;
  const list = ids.map(id => `"${id}"`).join(',');
  try {
    await supabase(`/pvp_queue?chat_id=in.(${encodeURIComponent(list)})`, { method: 'DELETE' });
  } catch (err) {
    console.error('pvp_queue delete failed (continuing):', err.message);
  }
}

// POST /pvp/enqueue — join the queue with the formation just arranged in prep.
router.post('/pvp/enqueue', requireAuth, async (req, res) => {
  const { chat_id, mode = 'pvp_quick', formation, power = 0 } = req.body;
  if (!chat_id || !formation) return res.status(400).json({ error: 'chat_id and formation required' });

  const units     = Array.isArray(formation.playerUnitIds) ? formation.playerUnitIds : null;
  const placement = formation.placement;
  if (!units || !units.length || units.length > 6 || !placement || typeof placement !== 'object') {
    return res.status(400).json({ error: 'formation must carry playerUnitIds (1-6) and placement' });
  }

  try {
    // The same guard region battles use. Queueing while a fight is open would
    // hand this player a second one the moment they matched.
    const existing = await getActiveBattle(chat_id);
    if (existing) {
      return res.status(400).json({ error: 'A battle is already in progress', code: 'battle_in_progress' });
    }

    pvpQueue.sweep();
    const result = pvpQueue.enqueue({ chat_id: String(chat_id), mode, formation, power });

    if (!result.matched) {
      await writeQueueRow(result.entry);
      return res.json({ status: 'waiting', queued_at: result.entry.enqueuedAt, waiting: pvpQueue.size() });
    }

    // Paired. The duel is built here, from the two formations already stored,
    // so neither client is asked for anything again.
    const { a, b } = result;
    await clearQueueRows([a.chat_id, b.chat_id]);

    const [cardA, cardB] = await Promise.all([pvpOpponentCard(a.chat_id), pvpOpponentCard(b.chat_id)]);

    let created;
    try {
      created = await createPvpBattle(b, a);   // b waited longer, so b creates
    } catch (err) {
      console.error('Failed to create PvP battle:', err);
      // Neither player is left believing they matched into something that does
      // not exist: both are told to queue again.
      battleBus.publish(pvpRoom(b.chat_id), { status: 'failed' }, { event: 'pvp' });
      return res.status(500).json({ error: 'Could not start the duel', code: 'pvp_create_failed' });
    }

    // Only the OTHER player needs waking: this one is holding the response.
    battleBus.publish(pvpRoom(b.chat_id), {
      status: 'matched', mode, opponent: cardA, battle_id: created.battle_id,
    }, { event: 'pvp' });

    res.json({ status: 'matched', mode, opponent: cardB, battle_id: created.battle_id });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /pvp/leave — cancel. Idempotent: a player who was already matched or
// already gone gets the same answer as one who was really removed.
router.post('/pvp/leave', requireAuth, async (req, res) => {
  const { chat_id } = req.body;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  const removed = pvpQueue.leave(chat_id);
  await clearQueueRows([chat_id]);
  res.json({ status: 'left', was_queued: removed });
});

// GET /pvp/status — the polling fallback for a client whose stream is down.
router.get('/pvp/status', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  const entry = pvpQueue.get(chat_id);
  if (entry) return res.json({ status: 'waiting', queued_at: entry.enqueuedAt, waiting: pvpQueue.size() });

  // Not in the queue. Either matched (the battle will say so once step two
  // builds one) or never queued — the client knows which it was expecting.
  res.json({ status: 'idle' });
});

// GET /pvp/stream — server-sent events while waiting for an opponent.
//
// Same shape and same reasoning as /battle/stream, including the token in the
// query string because EventSource cannot set headers. The room is this
// player's own id: there is no battle to key on until they are matched.
router.get('/pvp/stream', async (req, res) => {
  const { chat_id, token } = req.query;
  if (!chat_id || !token) return res.status(400).json({ error: 'chat_id and token required' });
  try {
    const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=session_token&limit=1`);
    if (!rows.length || rows[0].session_token !== token) return res.status(401).json({ error: 'Unauthorized' });

    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    const room  = pvpRoom(String(chat_id));
    const close = battleBus.subscribe(room, String(chat_id), res);
    if (!close) {
      res.write('event: full\ndata: {}\n\n');
      return res.end();
    }

    res.write(`event: ready\ndata: ${JSON.stringify({ room })}\n\n`);
    // Leaving the queue when the stream dies would be wrong: in the Telegram
    // webview a locked phone closes the stream, and that player is still
    // waiting. The queue is cleared by an explicit cancel, by a match, or by
    // age (see sweep in utils/pvp-queue.js).
    req.on('close', close);
  } catch (err) {
    if (res.headersSent) { try { res.end(); } catch {} return; }
    serverError(res, err);
  }
});

router.post('/battle/end', requireAuth, async (req, res) => {
  const { chat_id, battle_id } = req.body;
  if (!chat_id || !battle_id) return res.status(400).json({ error: 'chat_id and battle_id required' });
  try {
    const record = await getBattleState(battle_id);
    if (!record) return res.status(404).json({ error: 'Battle not found' });
    const mySide = battleSideFor(record, chat_id);
    if (!mySide) return res.status(403).json({ error: 'Forbidden' });
    // Both callers of this route are "Abandon" buttons, but only a battle that
    // had not resolved is an abandonment. A finished battle closed through here
    // keeps its real HP; nothing is being escaped.
    const abandoned = !record.battle_data?.done;
    await persistBattleRosterState(chat_id, record.battle_data, { abandoned, side: mySide });

    // Walking out of a duel is a concession, not a draw: the player still on the
    // field wins it, and is told so through the battle stream they are already
    // holding. The same penalty applies as in a region fight — the dead stay
    // dead and the survivors leave at 1 HP.
    if (isPvpRecord(record) && abandoned) {
      const winner = mySide === 'player' ? 'enemy' : 'player';
      const battle_data = { ...record.battle_data, done: true, winner, abandoned_by: String(chat_id), turn_deadline: null };
      await updateBattleState(battle_id, battle_data);
      battleBus.publish(battle_id, { done: true, last_log_id: null }, { exceptChatId: chat_id });
      return res.json({ success: true, abandoned, conceded_to: winner });
    }

    await closeBattleState(battle_id);
    res.json({ success: true, abandoned });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/battle/reward', requireAuth, async (req, res) => {
  const { chat_id, battle_id, survivor_ids } = req.body;
  if (!chat_id || !battle_id) {
    return res.status(400).json({ error: 'chat_id and battle_id required' });
  }
  try {
    const record = await getBattleState(battle_id);
    if (!record) return res.status(404).json({ error: 'Battle not found', code: 'battle_not_found' });
    if (!battleSideFor(record, chat_id)) return res.status(403).json({ error: 'Battle does not belong to this player', code: 'battle_forbidden' });
    if (!record.battle_active) return res.status(400).json({ error: 'Rewards already claimed', code: 'battle_rewards_claimed' });
    if (!record.battle_data?.done) return res.status(400).json({ error: 'Battle is not finished yet', code: 'battle_unfinished' });

    // CLAIM THE BATTLE BEFORE PAYING ANYTHING OUT.
    //
    // The battle_active check above is necessary but not sufficient: everything
    // below it awaits — roster persistence, resource reads, resource writes, XP
    // — and every one of those awaits is a window in which a second request
    // passes the same check and pays the same rewards out again. The battle used
    // to be closed at the very END of this handler, so that window was the whole
    // handler. A double-tap on the victory screen or a client retry duplicated
    // the payout.
    //
    // claimBattleState flips battle_active to false with the filter
    // `battle_active=eq.true` in the same statement, so Postgres decides the
    // winner under a row lock: exactly one caller gets a row back, everyone else
    // gets null and stops here having paid out nothing.
    // ── PvP payout ─────────────────────────────────────────────────────────
    // Both players claim their own rewards from the same row, so the PvE claim —
    // which flips battle_active and would lock the second player out — is not
    // used here. The row closes once both sides have taken theirs.
    //
    // A flat 100 XP to the winner's army, and nothing to the loser. This is the
    // placeholder payout: no gold, no crystals, no trophies, no progress, and no
    // region to read a reward table from.
    if (isPvpRecord(record)) {
      const mySide = battleSideFor(record, chat_id);
      if (!mySide) return res.status(403).json({ error: 'Battle does not belong to this player', code: 'battle_forbidden' });

      const alreadyClaimed = record.battle_data?.rewards_claimed || {};
      if (alreadyClaimed[String(chat_id)]) {
        return res.status(400).json({ error: 'Rewards already claimed', code: 'battle_rewards_claimed' });
      }

      await persistBattleRosterState(chat_id, record.battle_data, { side: mySide });

      const won = record.battle_data?.winner === mySide;
      const result = { xp_granted: 0, gold: 0, crystal: 0, crystals_gained: {}, xp_awards: [], progress_unlocked: false, pvp: true, won };

      if (won) {
        const myUnits = (record.battle_data.units || [])
          .filter(u => u.side === mySide && u._rosterId != null);
        const ids = myUnits.map(u => String(u._rosterId));
        const rows = ids.length
          ? await supabase(`/roster?id=in.(${ids.join(',')})&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero`)
          : [];

        result.xp_granted = PVP_WIN_XP;
        await Promise.all(rows.map(async row => {
          const unitData = { ...(row.unit_data || {}), current_xp: ((row.unit_data || {}).current_xp ?? 0) + PVP_WIN_XP };
          result.xp_awards.push({
            roster_id:  String(row.id),
            unit_id:    unitData.unit_id,
            xp_gained:  PVP_WIN_XP,
            current_xp: unitData.current_xp,
            alive:      unitData.alive !== false,
          });
          await supabase(`/roster?id=eq.${encodeURIComponent(row.id)}`, { method: 'PATCH', body: JSON.stringify({ unit_data: unitData }) });
        }));
        result.xp_awards.sort((a, b) => Number(a.roster_id) - Number(b.roster_id));
      }

      const claims = { ...alreadyClaimed, [String(chat_id)]: true };
      await updateBattleState(battle_id, { ...record.battle_data, rewards_claimed: claims });
      // The row stays open until the other player has taken theirs; the loser
      // claims too (they get nothing, but the claim is what closes the battle
      // and frees them to queue again).
      const bothIn = [String(record.chat_id), String(record.opponent_chat_id)].every(id => claims[id]);
      if (bothIn) await closeBattleState(battle_id);

      return res.json(result);
    }

    const claimed = await claimBattleState(battle_id);
    if (!claimed) return res.status(400).json({ error: 'Rewards already claimed', code: 'battle_rewards_claimed' });

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

      // Castle buildings (Training Grounds today) feed the same gold/xp/crystal
      // pipeline as the expedition passives — the slot the throne perks used to
      // occupy.
      const structForBonuses = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1&select=buildings_data`);
      const buildingBonus = getEmbarkBuildingBonuses(structForBonuses[0]?.buildings_data);
      embarkBonus.gold_pct    += buildingBonus.gold_pct;
      embarkBonus.xp_pct      += buildingBonus.xp_pct;
      embarkBonus.crystal_pct += buildingBonus.crystal_pct;

      // A timed event is the third feeder into the same pipeline, after the
      // expedition passives and the castle. Global and per-region bonuses are
      // both additive, so a 10% global + 10% regional event is +20% there.
      const activeEvent = await getActiveEvent(supabase);
      const eventBonus  = eventBonusFor(activeEvent, region_id);
      embarkBonus.gold_pct    += eventBonus.gold_pct;
      embarkBonus.xp_pct      += eventBonus.xp_pct;
      embarkBonus.crystal_pct += eventBonus.crystal_pct;

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

      // Trophies are declared as { id: amount } on the level and always drop on
      // a win. There used to be a second `spell_trophies` track granted on top
      // when a trophy_gain spell had been cast — both halves of that are gone:
      // no spell carries trophy_gain any more, and pre-battle spell selection
      // was removed, so it could never fire.
      const granted = {};
      for (const [id, amount] of Object.entries(tuned.trophies)) {
        if (id && amount) granted[id] = (granted[id] || 0) + amount;
      }
      // Event drops land in the SAME map, so they are written by the same batch
      // and reported on the victory screen like any other trophy. An event
      // trophy on a level that already drops one simply adds to it.
      const eventDrops = eventDropsFor(activeEvent, region_id, level);
      for (const [id, amount] of Object.entries(eventDrops)) {
        if (id && amount) granted[id] = (granted[id] || 0) + amount;
      }
      result.event_trophies = eventDrops;
      // Trophies land together — a six-trophy haul was six sequential writes on
      // the victory screen, which is precisely where the player is waiting.
      await Promise.all(Object.entries(granted).map(([id, amount]) => {
        const trophyRow = inventoryRows.find(r => r.item === id);
        return trophyRow
          ? supabase(`/resources?id=eq.${trophyRow.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(trophyRow.amount) + amount }) })
          : supabase('/resources', { method: 'POST', body: JSON.stringify({ chat_id: String(chat_id), item_type: 'trophy', item: id, amount }) });
      }));
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
      result.auto_level_ups = await applyAutoLevelUps(postXpRows, structForBonuses[0]?.buildings_data);

      // Stable order — Promise.all resolution order is not meaningful, and the
      // victory list should not reshuffle between runs.
      result.xp_awards = xpAwards.sort((a, b) => Number(a.roster_id) - Number(b.roster_id));
      const playerRows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
      if (playerRows.length) {
        const progress     = playerRows[0].progress || {};
        const currentLevel = progress[region_id] ?? 1;
        const maxLevel     = Object.keys(region.difficulties).length;
        // `<= maxLevel`, not `<`. Clearing the FINAL level used to advance
        // nothing, so progress capped at maxLevel and `clearedLevel`
        // (progress - 1, see data/items.js) capped one below the last level.
        // With every region holding 6 levels that made the mythic craft gate —
        // "clear any region level 6" — unreachable for everybody, permanently.
        // Progress may now read maxLevel + 1, meaning "this region is finished";
        // the embark screen clamps its level pips to the real level count so it
        // never draws a pip for a level that does not exist.
        if (level >= currentLevel && level <= maxLevel) {
          progress[region_id] = level + 1;
          await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}`, { method: 'PATCH', body: JSON.stringify({ progress }) });
          result.progress_unlocked = true;
          result.next_level        = level + 1;

          // Tokens drop HERE and nowhere else — inside the branch that advances
          // progress, which is the game's own definition of a first clear. A
          // replay of a level already beaten never reaches this line, so the
          // drops cannot be farmed. See FIRST_CLEAR_TOKENS in data/embark.js.
          const tokenDrops = getFirstClearTokens(level);
          if (tokenDrops) {
            const tokenRows = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}&item_type=eq.token`);
            await Promise.all(Object.entries(tokenDrops).map(([item, amount]) => {
              const row = tokenRows.find(r => r.item === item);
              return row
                ? supabase(`/resources?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(row.amount) + amount }) })
                : supabase('/resources', { method: 'POST', body: JSON.stringify({ chat_id: String(chat_id), item_type: 'token', item, amount }) });
            }));
            result.tokens_gained = tokenDrops;   // { crossroad_sigil: 1 }
          }
        }
      }
    }

    // Already closed by the claim above — closing again here would be harmless
    // but misleading, since it would read as the point where the battle ends.

    res.json(result);
  } catch (err) {
    serverError(res, err);
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
    serverError(res, err);
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
    const spellDiscount = getSpellCostReductionPct(structRows[0].buildings_data) / 100;
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
    serverError(res, err);
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
    const mercLockedBy = slotLockedBy(slots, slot);
    if (mercLockedBy) {
      return res.status(400).json({ error: `That slot is locked until you build: ${mercLockedBy}`, code: 'slot_locked', requires: mercLockedBy });
    }
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

    await Promise.all(Object.entries(cost).map(([item, required]) => {
      const row = inventoryRows.find(r => r.item === item);
      if (!row) return null;
      return supabase(`/resources?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(row.amount) - required }) });
    }));

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
    serverError(res, err);
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

    await Promise.all(Object.entries(cost).map(([item, required]) => {
      const row = inventoryRows.find(r => r.item === item);
      if (!row) return null;
      return supabase(`/resources?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(row.amount) - required }) });
    }));

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
    serverError(res, err);
  }
});

router.get('/items', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const player = await getPlayerByChatId(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const rows = await fetchItems(`/items?player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`);
    res.json(rows);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/items/equip', requireAuth, async (req, res) => {
  const { chat_id, roster_id, item_id } = req.body;
  if (!chat_id || !roster_id || !item_id) return res.status(400).json({ error: 'chat_id, roster_id, and item_id required' });
  try {
    const player = await getPlayerByChatId(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const [itemRows, rosterRows] = await Promise.all([
      fetchItems(`/items?id=eq.${encodeURIComponent(item_id)}&player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`),
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
    const currentlyEquipped = await fetchItems(`/items?equipped_by=eq.${encodeURIComponent(roster_id)}&select=id,item_stats`);
    for (const old of currentlyEquipped) {
      if (String(old.id) === String(item_id)) continue;
      await unequipItemFromRosterUnit(old, roster_id);
    }

    // Equipping only records the link. The roster row keeps the unit's BASE
    // stats; every consumer derives base + item via applyItemModifiers.
    await supabase(`/items?id=eq.${item_id}`, { method: 'PATCH', body: JSON.stringify({ equipped_by: roster_id }) });

    const [updatedRoster, readItems] = await Promise.all([
      supabase(`/roster?id=eq.${roster_id}&select=id,chat_id,unit_data,is_hero`),
      fetchItems(`/items?player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`),
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
    serverError(res, err);
  }
});

router.post('/items/unequip', requireAuth, async (req, res) => {
  const { chat_id, item_id } = req.body;
  if (!chat_id || !item_id) return res.status(400).json({ error: 'chat_id and item_id required' });
  try {
    const player = await getPlayerByChatId(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const itemRows = await fetchItems(`/items?id=eq.${encodeURIComponent(item_id)}&player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`);
    if (!itemRows.length) return res.status(404).json({ error: 'Item not found' });
    const item = itemRows[0];
    if (!item.equipped_by) return res.status(400).json({ error: 'Item is not equipped' });

    await unequipItemFromRosterUnit(item, item.equipped_by);

    const [updatedRoster, readItems] = await Promise.all([
      supabase(`/roster?id=eq.${item.equipped_by}&select=id,chat_id,unit_data,is_hero`),
      fetchItems(`/items?player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`),
    ]);

    // Same read-after-write reconciliation as /items/equip: the replica can
    // still show the item as equipped, leaving the character block showing
    // stats the unit no longer has.
    const items = (Array.isArray(readItems) ? readItems : []).map(r =>
      String(r.id) === String(item_id) ? { ...r, equipped_by: null } : r
    );

    res.json({ success: true, roster: updatedRoster[0], items });
  } catch (err) {
    serverError(res, err);
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
      fetchItems(`/items?player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`),
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
    await Promise.all(Object.entries(cost).map(([resName, required]) => {
      const row = inventoryRows.find(r => r.item === resName);
      return supabase(`/resources?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(row.amount) - required }) });
    }));

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
      fetchItems(`/items?player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`),
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
    serverError(res, err);
  }
});

module.exports = router;