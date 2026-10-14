const express = require('express');
const router = express.Router();

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const { UNITS } = require('../data/units');
const { REGIONS, getEncounter, getLevelRewards, getFirstClearTokens, TOME_XP } = require('../data/embark');
const { getActiveEvent, eventDropsFor, eventBonusFor, eventPayload } = require('../utils/events');
const { getEquipBlock } = require('../data/item_rules');
const { getRespecOptions, getCrossBranchRespecOptions, FACTION_CRYSTAL } = require('../data/buildings');
const { craftingUnlocked, engravingUnlocked, litaniesUnlocked, BUILDING_POOLS, SLOT_CATEGORIES, SLOT_LAYERS, SLOT_UNLOCKS, SLOT_FIXED_BUILDING, slotLockedBy, UNIT_UPGRADE_PATHS, HERO_MAX_LEVEL, THRONE_MAX_LEVEL, buildingLevel, THRONE_UPGRADE_COSTS, buildingMaxLevel, buildingCostForLevel, maxUnitTier, getSpellCostReductionPct, getEmbarkBuildingBonuses, getBuildingDef, upgradeReaches, resolveUpgradeBranch, upgradeBranchCandidates, emptyStructures, DEFAULT_BUILDINGS, MERCENARY_BUILDINGS, SUPPLY_ITEM_TYPE, SUPPLY_ITEMS, SUPPLY_TICK_MINUTES, EMBARK_SUPPLY_COST, maxSupplies, supplyItemName, getUnitHpBonus, callingChangeUnlocked, callingTiersOpen, CALLING_BUILDING, CALLING_BUILDING_LEVEL, CALLING_TIERS } = require('../data/buildings');
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
const { rosterUnitPower } = require('../utils/army-power');
const {
  TOURNEY_BATTLES, TOURNEY_POINTS, TOURNEY_MODE, checkTourneyRules, ruleName,
} = require('../data/tourney');
const { engravingBill, checkEngravingForUnit, applyEngraving, getEngravingCombo, comboKind, nativePassiveKeys } = require('../data/engravings');
const { SPELLS } = require('../data/spells');
const { CALLINGS, CALLING_CHANGE_COST, callingsForFaction, newCallingFor,
        DEVOTION_BLOCKS, OATH_BASE_GOLD, OATH_STEP_GOLD, OATH_BONUS, oathPrice,
        devotionOf, oathsSworn, devotionBonusHp, blockDone, blockFor,
        devotionState, resetDevotionDeeds } = require('../data/callings');
const { telegramWebhookHandler, notifyAdminNewPlayer, notifyAdminPvpQueue, getBotUsername, takePendingInvite } = require('../utils/telegram');
const {
  generateInviteCode, normalizeInviteCode, INVITEE_WELCOME, INVITER_REWARDS,
  INVITER_DAILY_CAP, INVITE_MAX_ACCEPTED,
} = require('../data/invites');
const { ITEM_DEFS, applyItemModifiers, meetsCraftRequirements, craftRequirementText } = require('../data/items');
const { UNIT_ABILITIES } = require('../data/unit_abilities');
const { DEATH_ENABLED } = require('../data/game_flags');
const { DAILY_TASKS, DAILY_REWARDS, DAILY_REWARDS_BY_ID, dailyTasksForTier } = require('../data/daily_tasks');
const { QUESTS_BY_ID, questTiers, questsForTier, QUESTS } = require('../data/quests');
const { pickBotTemplate, buildBotArmy, botArmyAsSquad } = require('../data/bot_templates');
const COL = require('../data/colossus');

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
    const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chatId)}&select=id,faction,timezone,session_token&limit=1`);
    if (!rows.length || rows[0].session_token !== token) return res.status(401).json({ error: 'Unauthorized' });
    req.authenticatedPlayer = {
      id: rows[0].id,
      faction: rows[0].faction,
      timezone: rows[0].timezone,
    };
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
// EMPTY by design. Equipment now comes only from the forge, and the forge only
// opens once the Blacksmith is built — which onboarding walks the player to
// after their first embark. Handing out a free Padded Armor here would have the
// tutorial tell them to craft an item they already owned.
const STARTING_ITEM_KEYS = [];

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

// Supplies are seeded separately: the row name depends on the faction (see
// SUPPLY_ITEMS), so it cannot live in the table above, which is written once
// before a faction is picked. Five is half a level-1 ceiling — enough to get
// through onboarding without the gate being the first thing a new player meets.
const STARTING_SUPPLIES = 5;

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

// ── Atomic economy writes (sql/003_atomic_resources.sql) ────────────────────
// Resource arithmetic does NOT happen here any more. It used to: read `amount`,
// then PATCH the absolute value back — which meant two requests that read the
// same balance both wrote the same result, and N parallel crafts cost one
// craft's worth of gold. The arithmetic now happens in the database, where
// `amount = amount - n` is one statement under a row lock and a whole cost
// bundle is one transaction.
//
// These need their own transport: a `returns void` function answers 204 with an
// empty body, and supabase() above calls r.json() unconditionally.
async function rpc(fnName, args) {
  const r = await fetch(`${SUPABASE_URL}/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!r.ok) throw new Error(data?.message || text || `rpc ${fnName} failed`);
  return data;
}

// costs: { Gold: 100, Crystals_Fire: 14 }. Throws if ANY line cannot be paid,
// having deducted nothing — the whole bundle rolls back together.
function spendResources(chat_id, costs) {
  const payload = Object.fromEntries(
    Object.entries(costs || {}).filter(([, n]) => Number.isFinite(Number(n)) && Number(n) > 0)
  );
  if (!Object.keys(payload).length) return Promise.resolve(null);
  return rpc('spend_resources', { p_chat_id: String(chat_id), p_costs: payload });
}

// grants: [{ item, amount, item_type }]. Upserts, so a trophy the player has
// never held needs no separate INSERT path and cannot race into two rows.
function grantResources(chat_id, grants) {
  const payload = (grants || [])
    .filter(g => g && g.item && Number.isFinite(Number(g.amount)) && Number(g.amount) !== 0)
    .map(g => ({ item: g.item, amount: Number(g.amount), item_type: g.item_type || 'resource' }));
  if (!payload.length) return Promise.resolve(null);
  return rpc('grant_resources', { p_chat_id: String(chat_id), p_grants: payload });
}

// The database raises `insufficient:<item>` when a spend cannot be paid. That is
// an EXPECTED failure — the player is short — so it must reach them as a 400
// with a code, not fall through to serverError's 500.
function shortfallItem(err) {
  const m = /(?:^|\W)insufficient:(\S+)/.exec(err?.message || '');
  return m ? m[1] : null;
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
    // start_param rides along: it is what a t.me/<bot>?start=<code> link carries,
    // and it is inside the signed payload, so an invite code cannot be forged
    // by a client that simply posts one.
    return { ...JSON.parse(userRaw), start_param: params.get('start_param') || null };
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

// The "can I afford this" check and the deduction are the same statement now, so
// there is no window between them. A shortfall throws before anything is spent,
// which is the contract every caller already relied on.
async function consumeCrystalCosts(chat_id, crystals) {
  try {
    await spendResources(chat_id, crystals);
  } catch (err) {
    const short = shortfallItem(err);
    if (short) throw new Error(`Not enough ${short}`);
    throw err;
  }
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
  // favors — the day rollover is computed from the player's local date. The same
  // timezone decides when `daily_tasks` rolls over.
  const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,faction,progress,timezone,adds_daily_view,daily_tasks,quests&limit=1`);
  return rows[0] || null;
}

function buildPlayerUnitFromRosterEntry(r, entry, itemsByRosterId = {}) {
  const def = getUnitByDataId(r.unit_data?.unit_id);
  if (!def) throw new Error(`Unit definition for ${r.unit_data?.unit_id} not found`);
  let unit_data = { ...def, ...(r.unit_data || {}) };
  const item = itemsByRosterId[String(r.id)];
  if (item) unit_data = applyItemModifiers(unit_data, item.item_stats);
  // After the item, so an engraving's penalty is paid on the unit as it is worn.
  if (r.engraving) unit_data = applyEngraving(unit_data, r.engraving);
  return {
    id:              String(entry.id),
    _rosterId:       String(entry._rosterId || entry.id),
    unit_data,
    unit_name:       def.name || def.id,
    is_hero:         !!r.is_hero,
    // Passed through UNTOUCHED, beside unit_data rather than inside it: the
    // calling belongs to the roster row and makeUnitData rebuilds unit_data from
    // the definition on every level-up. createCombatant reads it off here
    // (data/callings.js), and a litany's chorus cells are the only thing in a
    // fight that look at it.
    calling:         r.calling || null,
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

// A player still walking to the board is not a player stalling. The first turn's
// clock therefore does not start at creation — it starts when the player who has
// to act first actually loads the battle (see stampFirstDeadline). A provisional
// deadline covers the other case: an acting player who never turns up at all
// must still lose the turn eventually, or their opponent waits forever.
const PVP_JOIN_GRACE_MS = 45000;

function isPvpRecord(record) {
  return record?.battle_kind === 'pvp' || record?.battle_data?.kind === 'pvp';
}

// A quick match against a bot template (data/bot_templates.js). One owner, the
// enemy army stored in battle_data and played by runAiTurns, but the same 30 s
// turn clock as a duel.
function isBotRecord(record) {
  return record?.battle_kind === 'pvp_bot' || record?.battle_data?.kind === 'pvp_bot';
}

// An attempt on the faction's weekly Colossus (data/colossus.js). PvE in every
// way but three: the boss is stored on the record, units enter at full HP and
// leave with their roster HP untouched, and the payout is damage to a shared pool.
function isColossusRecord(record) {
  return record?.battle_kind === 'colossus' || record?.battle_data?.kind === 'colossus';
}

function isClockedRecord(record) {
  return isPvpRecord(record) || isBotRecord(record);
}

// After a move: a person on the other side answers in their own time, anything
// else answers now. Turns nobody can take are spent either way.
function answerTurns(record, engine) {
  if (engine.done) return;
  if (isPvpRecord(record)) engine.runIdleTurns();
  else                     engine.runAiTurns();
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
  const [rawRoster, hpBonus] = await Promise.all([
    supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero,engraving,calling,devotion`),
    unitHpBonusFor(chat_id),
  ]);
  const rosterRows = withBonusHp(rawRoster, hpBonus);
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

// A hero, and loyalty within that hero's cap. Same rules as the prep screen.
function checkSquad(units) {
  const heroes = units.filter(u => u.is_hero);
  if (!heroes.length)     return { error: 'Squad must include a hero' };
  if (heroes.length > 1)  return { error: 'Squad may only include one hero' };
  const hero       = heroes[0];
  const heroTier   = hero.unit_data?.t ?? 1;
  const maxLoyalty = heroTier >= 4 ? 5 : heroTier + 1;

  // Each non-hero unit costs 1 loyalty; 2-tile units (row/column) cost 2
  let loyaltyUsed = 0;
  for (const u of units) {
    if (u.is_hero) continue;
    const size = u.unit_data?.size ?? 'tile';
    loyaltyUsed += (size === 'row' || size === 'column') ? 2 : 1;
  }
  if (loyaltyUsed > maxLoyalty) {
    return { error: `Squad exceeds loyalty cap (used ${loyaltyUsed}, max ${maxLoyalty} for a tier-${heroTier} hero)` };
  }
  return null;
}

// A queued squad rebuilt from the roster, checked, and its ⚔ counted here.
// The client's power number is never used: bands and bots are picked from this one.
async function loadSquad(chat_id, playerUnitIds) {
  const [rawRoster, hpBonus] = await Promise.all([
    supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero,engraving,calling,devotion`),
    unitHpBonusFor(chat_id),
  ]);
  // Before rosterUnitPower below reads max_hp, so the ⚔ this squad is matched and
  // banded on counts the Temple too — otherwise the client's number (which comes
  // from the decorated /bootstrap roster) and this one would disagree.
  const rosterRows = withBonusHp(rawRoster, hpBonus);
  const rosterById = {};
  for (const r of rosterRows) rosterById[String(r.id)] = r;
  const itemsByRosterId = await getItemsByRosterIds(rosterRows.map(r => r.id));

  const units = [];
  const seen  = new Set();
  let power   = 0;
  for (const entry of playerUnitIds) {
    const rosterId = String(entry?._rosterId || entry?.id);
    const r = rosterById[rosterId];
    if (!r) return { error: `Roster unit ${rosterId} not found or does not belong to this player` };
    if (seen.has(rosterId)) return { error: `Roster unit ${rosterId} is listed twice` };
    seen.add(rosterId);
    units.push(buildPlayerUnitFromRosterEntry(r, entry, itemsByRosterId));
    power += rosterUnitPower(getUnitByDataId(r.unit_data?.unit_id), r.unit_data, itemsByRosterId[rosterId], r.engraving);
  }

  const invalid = checkSquad(units);
  if (invalid) return invalid;
  return { units, power, itemsByRosterId };
}

// Deep enough to protect everything the engine mutates: unit_data and the
// resistances inside it. Everything else on these objects is replaced wholesale
// or never written.
// PvE encounter units are FLAT (see getEncounter): the stats live on the unit
// itself, with no `unit_data` wrapper. Cloning one into a shape that always
// carries `unit_data` handed createCombatant an EMPTY nested object — and
// createCombatant reads `unit.unit_data || unit`, so it took the empty one:
// every enemy lost its name ("Unknown"), its portrait, its action and its
// passives. Only wrap what actually arrived wrapped.
function cloneArmy(units) {
  return (units || []).map(u => (
    u.unit_data
      ? { ...u, unit_data: { ...u.unit_data, resistances: { ...(u.unit_data.resistances || {}) } } }
      : { ...u, resistances: { ...(u.resistances || {}) } }
  ));
}

// The opposing army, shaped the way initCombatants expects an encounter: each
// unit carries the cell it was placed in, because there is no second
// `placement` argument.
//
// MIRRORED, because the two grids face each other. This player arranged their
// formation on a PLAYER grid, where the front column is col 1; standing on the
// enemy side the front column is col 0 (see getValidTargets in
// utils/battle-engine.js). Copying the placement across verbatim put every
// front line in the back and every back line in front — the shield wall stood
// behind the archers, for both players at once.
function asEnemySide(units, placement) {
  return units.map((u, i) => {
    const own = placement[u.id] ?? placement[String(u.id)] ?? i;
    return { ...u, cell: pvpView.mirrorCell(own, u.unit_data?.size ?? 'tile') };
  });
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
  if (!isClockedRecord(record) || engine.done) return false;
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

// Start the first turn's clock on the reader's behalf.
//
// The acting player arriving is what starts it, and they get the full turn. If
// the OTHER player gets there first, a provisional and longer deadline is set
// instead — enough that a no-show cannot stall the duel, but marked so that the
// acting player's own arrival replaces it with a clean full turn.
//
// Returns new battle_data when something changed, else null.
function stampFirstDeadline(record, engine, chat_id) {
  if (!isClockedRecord(record) || engine.done) return null;
  const bd = record.battle_data || {};
  const mine = engine.currentActor()?.side === battleSideFor(record, chat_id);

  if (!bd.turn_deadline) {
    return mine
      ? { ...bd, turn_deadline: Date.now() + PVP_TURN_MS, turn_provisional: false }
      : { ...bd, turn_deadline: Date.now() + PVP_TURN_MS + PVP_JOIN_GRACE_MS, turn_provisional: true };
  }
  if (bd.turn_provisional && mine) {
    return { ...bd, turn_deadline: Date.now() + PVP_TURN_MS, turn_provisional: false };
  }
  return null;
}

// Stamped on every write, so the clock starts when the turn actually begins
// rather than when the previous one was requested.
function withTurnDeadline(battle_data, record, engine) {
  if (!isClockedRecord(record)) return battle_data;
  return {
    ...battle_data,
    kind: isBotRecord(record) ? 'pvp_bot' : 'pvp',
    turn_deadline: engine.done ? null : Date.now() + PVP_TURN_MS,
    turn_provisional: false,
    turn_ms: PVP_TURN_MS,
  };
}

// Write a PvP battle back after the engine has moved, append whatever it logged,
// and wake the other player. Returns the record with its new battle_data so the
// caller can answer from the same state it just stored.
async function persistPvpTurn(record, engine, { causedBy = null } = {}) {
  // Everything this request caused, and nothing else — see freshLog.
  const newEntries  = engine.log;
  const battle_data = await withTourneyResult(
    record, withTurnDeadline(buildBattleData(engine, record.battle_data), record, engine));

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

// The armies of a battle in progress, built once and kept.
//
// WHY: every request that touches a battle rehydrates the engine, and
// rehydrating means rebuilding each army from its owner's roster and equipped
// items — two Supabase queries per side. A PvP battle pays that FOUR times per
// request, and a single exchange costs several requests: the actor's action, the
// opponent's state fetch, and each side's follow-up reads. That was seconds of
// round trips per move, on top of nothing having changed.
//
// Nothing here CAN change mid-battle: a roster row's HP is only written back
// when the fight ends, and the battle's own numbers are applied on top by
// BattleEngine.rehydrate. (An item equipped elsewhere mid-battle used to take
// effect on the next action, which was a bug rather than a feature; the army a
// battle started with is the army it finishes with.)
const battleArmyCache = new Map();   // battle_id -> { armies, at }
const ARMY_CACHE_MS  = 60 * 60 * 1000;
const ARMY_CACHE_MAX = 200;

function armyCacheGet(battle_id) {
  const hit = battleArmyCache.get(battle_id);
  if (!hit) return null;
  if (Date.now() - hit.at > ARMY_CACHE_MS) { battleArmyCache.delete(battle_id); return null; }
  return hit.armies;
}

function armyCacheSet(battle_id, armies) {
  // Oldest out first. A cap rather than a sweep: the map is only ever touched
  // on a request, so a timer would be the only thing keeping the process busy.
  if (battleArmyCache.size >= ARMY_CACHE_MAX) {
    const oldest = [...battleArmyCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) battleArmyCache.delete(oldest[0]);
  }
  battleArmyCache.set(battle_id, { armies, at: Date.now() });
  return armies;
}

function armyCacheDrop(battle_id) {
  battleArmyCache.delete(battle_id);
}

// Rebuilding an engine REPLAYS the opening of the battle: rehydrate goes through
// fromSetup, which fires on_battle_start, which forms Unity bonds and hands out
// battle-start shields — and each of those writes a log entry.
//
// Those entries are not new events. They describe something that happened once,
// when the battle began, and they are already in battle_log. They were being
// re-inserted on EVERY action, because battle_data carries no `log` field, so
// the "everything since last time" slice was measured against an empty array and
// took the whole thing. The client then replayed a Unity bond forming, over and
// over, every turn.
//
// So the log starts empty here: from this point on it holds only what THIS
// request causes, which is exactly what should be appended.
function freshLog(engine) {
  engine.log = [];
  return engine;
}

async function rehydrateEngine(record) {
  const bd = record.battle_data;
  const { playerUnitIds, placement } = bd.setup;
  const chat_id = record.chat_id;

  // PvP: the other side is a real army belonging to a real player, rebuilt from
  // THEIR roster exactly as this side is rebuilt from this one.
  if (isPvpRecord(record)) {
    const opp = bd.setup.opponent || {};
    let armies = armyCacheGet(record.battle_id);
    if (!armies) {
      const [mine, theirs] = await Promise.all([
        buildArmyFor(chat_id, playerUnitIds),
        buildArmyFor(record.opponent_chat_id, opp.playerUnitIds || []),
      ]);
      armies = armyCacheSet(record.battle_id, {
        playerUnits: mine,
        enemies: asEnemySide(theirs, opp.placement || {}),
      });
    }
    // A fresh clone per rehydrate: the engine writes into unit_data (resist
    // shreds, power buffs), and a cached army handed out by reference would
    // carry one battle's damage into the next request's rebuild.
    return freshLog(BattleEngine.rehydrate(
      { playerUnits: cloneArmy(armies.playerUnits), enemies: cloneArmy(armies.enemies), placement },
      bd,
    ));
  }

  let armies = armyCacheGet(record.battle_id);
  if (!armies) {
    armies = armyCacheSet(record.battle_id, {
      playerUnits: await buildArmyFor(chat_id, playerUnitIds),
      // A bot's army is the one it was built with, stored on the record, so a
      // template edited mid-battle does not change the fight.
      enemies:     isBotRecord(record)      ? (bd.bot?.army || [])
                 : isColossusRecord(record) ? [bd.colossus?.boss].filter(Boolean)
                 : getEncounter(bd.region_id, bd.level),
    });
  }

  return freshLog(BattleEngine.rehydrate({
    playerUnits: cloneArmy(armies.playerUnits),
    enemies:     cloneArmy(armies.enemies),
    placement,
  }, bd));
}

function buildBattleData(engine, bd) {
  return {
    ...engine.getBattleData(),
    region_id:       bd.region_id,
    level:           bd.level,
    setup:           bd.setup,
    selected_spells: bd.selected_spells || [],
    // A bot battle's army and template id. Carried on every write: rehydrate
    // rebuilds the enemy from it, and faction rotation reads the template id.
    ...(bd.bot ? { bot: bd.bot } : {}),
    // A Colossus attempt: which weekly boss, and the HP and unit it started with.
    ...(bd.colossus ? { colossus: bd.colossus, kind: 'colossus' } : {}),
    // Which tourney this battle counts toward, and whose result has already been
    // written to it. Carried on every write for the same reason the bot army is:
    // updateBattleState REPLACES battle_data, so a field this function does not
    // name is gone after the first turn. It used to be set only in the creation
    // literals, which meant the settle at the end of the battle could no longer
    // tell it was a tourney battle — every entry scored 0 wins and 0 points
    // however the evening actually went.
    ...(bd.tourney_id ? { tourney_id: bd.tourney_id } : {}),
    ...(bd.tourney_settled ? { tourney_settled: bd.tourney_settled } : {}),
  };
}

// `abandoned` is the penalty path: the player walked out of a battle that was
// still running. Without it, quitting a fight that is going badly is strictly
// better than losing it — the party keeps whatever HP it had left and the dead
// are the only cost. So: the dead STAY dead (no take-backs), and every survivor
// is written back at 1 HP regardless of what they had. Nothing is free.
async function persistBattleRosterState(chat_id, battle_data, { abandoned = false, side = 'player', credit = true } = {}) {
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
    // With DEATH_ENABLED off, falling in battle is not permanent: the unit is
    // written back alive on 1 HP rather than dead on 0. It still earns nothing
    // for the fight — XP recipients are read off the battle record's own alive
    // flags further down (getAlivePlayerRosterIds), never off the roster row we
    // are writing here, so a revived corpse is still not a survivor.
    const fell  = unit.alive === false;
    const alive = DEATH_ENABLED ? !fell : true;
    const survivorHp = abandoned ? Math.min(1, baseMaxHp) : Math.max(0, clampedHp);
    const updatedUnitData = {
      ...current.unit_data,
      alive,
      current_hp: !alive ? 0 : (fell ? Math.min(1, baseMaxHp) : survivorHp),
      max_hp:     baseMaxHp,
    };
    await supabase(`/roster?id=eq.${encodeURIComponent(current.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ unit_data: updatedUnitData }),
    });
  }));

  // Blocks 3 and 4. Here rather than in each payout branch: this runs once per
  // battle per player, with the side already resolved, which is exactly the
  // shape the credit needs. `credit` is false where the caller knows the battle
  // was already settled - closing a claimed battle through Abandon must not pay
  // its deeds a second time.
  if (credit) await creditBattleDevotion(chat_id, battle_data, side);
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
    // Through the engraving, because Harmony moves a passive's RANK and an
    // expedition bonus is read off that rank. The item's own passive is added
    // below, the way applyItemModifiers would have.
    let base = { ...(def || {}), ...(r.unit_data || {}) };
    if (r.engraving) base = applyEngraving(base, r.engraving);
    const keys = nativePassiveKeys(base);
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

async function syncRosterMaxHp(chat_id) {
  const rows = await supabase(
    `/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data`,
  );
  for (const row of rows) {
    const unitData = row.unit_data || {};
    const def = getUnitByDataId(unitData.unit_id);
    if (!def || !Number.isFinite(def.hp)) {
      console.warn(`Cannot sync max HP for roster unit ${row.id}: missing definition for ${unitData.unit_id}`);
      continue;
    }

    const currentHp = Number(unitData.current_hp);
    const patch = {};
    if (unitData.max_hp !== def.hp) patch.max_hp = def.hp;
    if (Number.isFinite(currentHp) && currentHp > def.hp) patch.current_hp = def.hp;
    if (!Object.keys(patch).length) continue;

    await supabase(`/roster?id=eq.${encodeURIComponent(row.id)}&chat_id=eq.${encodeURIComponent(chat_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ unit_data: { ...unitData, ...patch } }),
    });
  }
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
    // Most level-ups come through here rather than the manual endpoint, so the
    // Temple's reset belongs here too: a unit that advances walks the chain
    // again from the first block.
    //
    // Only when the row actually carries `devotion`. Some callers select a
    // narrower set of columns, and writing a reset computed from a field that
    // was never read would wipe the oaths and the HP they bought.
    const patch = { unit_data: result.unitData };
    if (Object.prototype.hasOwnProperty.call(row, 'devotion')) {
      patch.devotion = resetDevotionDeeds(row);
    }
    await supabase(`/roster?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH', body: JSON.stringify(patch),
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
      await syncRosterMaxHp(chat_id);
      let activeRec = null;
      try { activeRec = await getActiveBattle(chat_id); } catch (e) {}
      // The errand offer is minted here, once per player, rather than derived on
      // every read of /errands — see ensureErrandOffer. It keeps at most one
      // offer available for the player's free slot, so logging in repeatedly
      // cannot reroll or stack errands. Never fatal: a player who cannot get an
      // offer (no structures yet, empty roster) still logs in.
      try { await ensureErrandOffer(chat_id, updated[0]); } catch (e) {}
      // Every player needs a code to share; older accounts predate the column.
      try { updated[0].share_code = await ensureShareCode(updated[0]); } catch (e) {}
      // A bond that was made while the payout failed (or before it worked) is
      // settled here rather than being lost: payInviter pays a moment once, so
      // an inviter who already has their tome gets nothing further.
      if (updated[0].invited_by && !(updated[0].invite_progress || {}).signup) {
        payInviter(updated[0], 'signup').catch(err =>
          console.error('Inviter signup payout failed:', err.message));
      }
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
    await syncRosterMaxHp(chat_id);
    let activeRec = null;
    try { activeRec = await getActiveBattle(chat_id); } catch (e) {}
    // Deliberately not awaited: the admin ping is bookkeeping, and a slow or
    // failing Telegram API must not delay (or fail) the player's first login.
    notifyAdminNewPlayer(created[0]).catch(err =>
      console.error('Admin new-player notify failed:', err.message));

    // The invite code rides inside the SIGNED initData (start_param), so it
    // cannot be forged by a client posting one. Never fatal: a broken invite
    // must not cost someone their first login.
    let invite = null;
    try {
      created[0].share_code = await ensureShareCode(created[0]);
      // The signed start_param first; failing that, whatever the bot was told in
      // a `/start <code>` message moments ago.
      const carried = telegramUser.start_param || takePendingInvite(chat_id);
      if (carried) {
        const result = await acceptInvite(created[0], carried);
        invite = result?.ok ? result : null;
      }
    } catch (err) {
      console.error('Invite accept failed:', err.message);
    }
    res.json({
      player: created[0],
      session_token,
      isNew: true,
      invited_by: invite ? invite.inviter : null,
      active: Boolean(activeRec),
      battle_id: activeRec ? activeRec.battle_id : null,
      battle_data: activeRec ? activeRec.battle_data : null,
    });
  } catch (err) {
    serverError(res, err);
  }
});


// ── Invites ────────────────────────────────────────────────────────────────
// Every player carries a share code; a player who arrives through someone's
// link records `invited_by` once and pays that someone back as they play
// (data/invites.js holds the rewards, docs/daily-activities-design.md the why).

// The player's own code, minted on first need. A collision on the unique index
// is retried rather than reported: the code is random, not meaningful.
async function ensureShareCode(player) {
  if (player?.share_code) return player.share_code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    try {
      const rows = await supabase(
        `/players?chat_id=eq.${encodeURIComponent(player.chat_id)}&share_code=is.null`, {
          method: 'PATCH',
          body: JSON.stringify({ share_code: code }),
          headers: { Prefer: 'return=representation' },
        });
      if (Array.isArray(rows) && rows.length) return rows[0].share_code;
      // No row matched: another request minted one first. Read it back.
      const fresh = await supabase(`/players?chat_id=eq.${encodeURIComponent(player.chat_id)}&select=share_code&limit=1`);
      if (fresh[0]?.share_code) return fresh[0].share_code;
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  return null;
}

// startapp, NOT start: ?start= opens the bot chat and sends it a message, which
// leaves the Mini App launched with nothing. ?startapp= opens the app itself and
// Telegram puts the value in initData.start_param, which is what /login reads.
// Needs a Main Mini App configured in BotFather.
function inviteLinkFor(botUsername, code) {
  return botUsername && code ? `https://t.me/${botUsername}?startapp=${code}` : null;
}

// Grant lines from a reward block. `crystals` pays the player's own faction
// crystal, which is why the faction is needed rather than the block alone.
function inviteGrants(reward, faction) {
  const grants = [];
  for (const [item, amount] of Object.entries(reward?.resources || {})) {
    grants.push({ item, amount, item_type: 'resource' });
  }
  for (const [item, amount] of Object.entries(reward?.tokens || {})) {
    grants.push({ item, amount, item_type: 'token' });
  }
  if (reward?.crystals) {
    grants.push({ item: FACTION_CRYSTAL[faction] || 'Crystals_Life', amount: reward.crystals, item_type: 'resource' });
  }
  return grants;
}

// Pay the inviter for something their invitee just did.
//
// `invite_progress` lives on the INVITEE and is what makes each moment payable
// once: the write that records it is filtered on the old value, so two requests
// racing on the same moment leave exactly one of them holding the payout.
async function payInviter(invitee, moment, attempt = 0) {
  const inviterId = invitee?.invited_by;
  if (!inviterId) return null;
  const progress = invitee.invite_progress || {};

  let next;
  if (moment === 'daily') {
    const done = Number(progress.dailies) || 0;
    if (done >= INVITER_DAILY_CAP) return null;
    next = { ...progress, dailies: done + 1 };
  } else {
    if (progress[moment]) return null;
    next = { ...progress, [moment]: true };
  }

  // The filter matches the value AS IT IS STORED, which is not the same as "has
  // no keys": a freshly bonded invitee holds `{}`, and filtering that on is.null
  // matched no row, so the sign-up payout was skipped without a word.
  const raw = invitee.invite_progress;
  const claimed = await supabase(
    `/players?chat_id=eq.${encodeURIComponent(invitee.chat_id)}`
    + `&invite_progress=${raw == null ? 'is.null' : `eq.${encodeURIComponent(JSON.stringify(raw))}`}`, {
      method: 'PATCH',
      body: JSON.stringify({ invite_progress: next }),
      headers: { Prefer: 'return=representation' },
    });

  // A LOSER RETRIES rather than giving up. Two different moments can land
  // together — a daily claimed as a battle ends — and the one that lost the
  // write has not been paid at all; re-reading and trying again is the
  // difference between "another moment got there first" and "this payout was
  // dropped".
  if (!(Array.isArray(claimed) && claimed.length)) {
    if (attempt >= 2) return null;
    const fresh = await supabase(
      `/players?chat_id=eq.${encodeURIComponent(invitee.chat_id)}&select=chat_id,invited_by,invite_progress&limit=1`
    );
    if (!fresh?.length) return null;
    return payInviter(fresh[0], moment, attempt + 1);
  }

  const inviterRows = await supabase(`/players?chat_id=eq.${encodeURIComponent(inviterId)}&select=chat_id,faction&limit=1`);
  if (!inviterRows.length) return null;

  const grants = inviteGrants(INVITER_REWARDS[moment], inviterRows[0].faction);
  if (grants.length) await grantResources(inviterId, grants);
  return { moment, grants };
}

// "This player just did something their inviter is paid for."
//
// Fire-and-forget, like bumpDailyTask: a reward that belongs to somebody else
// must never slow down, or fail, the thing the player actually asked for. The
// row is read here rather than passed in because every caller holds only a
// chat_id, and payInviter needs the progress this moment is checked against.
function noteInviteMoment(chat_id, moment) {
  supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=chat_id,invited_by,invite_progress&limit=1`)
    .then(rows => {
      const invitee = rows?.[0];
      if (!invitee?.invited_by) return null;
      if (moment !== 'daily' && (invitee.invite_progress || {})[moment]) return null;
      return payInviter(invitee, moment);
    })
    .catch(err => console.error(`Inviter ${moment} payout failed:`, err.message));
}

// Bind a player to whoever invited them and pay both sides. Reached from the
// link (at first login) and from the promo box, where a player types the code by
// hand — so it answers with a REASON rather than a bare null, and the promo box
// can say which of them happened.
//
// A player can be invited once, ever. `invited_by=is.null` in the write is the
// guard, so two requests cannot both bind the same player.
async function acceptInvite(player, rawCode) {
  const code = normalizeInviteCode(rawCode);
  if (!code) return { error: 'invite_unknown' };

  const inviterRows = await supabase(
    `/players?share_code=eq.${encodeURIComponent(code)}&select=chat_id,faction&limit=1`
  );
  const inviter = inviterRows[0];
  if (!inviter) return { error: 'invite_unknown' };
  if (String(inviter.chat_id) === String(player.chat_id)) return { error: 'invite_self' };

  const acceptedRows = await supabase(
    `/players?invited_by=eq.${encodeURIComponent(inviter.chat_id)}&select=chat_id`
  );
  if ((acceptedRows || []).length >= INVITE_MAX_ACCEPTED) return { error: 'invite_full' };

  const bonded = await supabase(
    `/players?chat_id=eq.${encodeURIComponent(player.chat_id)}&invited_by=is.null`, {
      method: 'PATCH',
      body: JSON.stringify({ invited_by: String(inviter.chat_id), invite_progress: {} }),
      headers: { Prefer: 'return=representation' },
    });
  if (!(Array.isArray(bonded) && bonded.length)) return { error: 'invite_used' };

  const welcome = inviteGrants(INVITEE_WELCOME, player.faction);
  if (welcome.length) await grantResources(player.chat_id, welcome);
  await payInviter(bonded[0], 'signup').catch(err => console.error('Inviter signup payout failed:', err.message));
  return { ok: true, inviter: String(inviter.chat_id), granted: welcome };
}

// GET /invite — this player's code, their link, and how many have joined.
router.get('/invite', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const rows = await supabase(
      `/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=chat_id,share_code&limit=1`
    );
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });

    const code = await ensureShareCode(rows[0]);
    const [botUsername, accepted] = await Promise.all([
      getBotUsername(),
      supabase(`/players?invited_by=eq.${encodeURIComponent(chat_id)}&select=chat_id`),
    ]);

    res.json({
      code,
      link: inviteLinkFor(botUsername, code),
      accepted: (accepted || []).length,
      max: INVITE_MAX_ACCEPTED,
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
//     "tokens":    { "tome_of_knowledge": 3 },    // item_type 'token': tomes, sigils, potions
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
      supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,promos,faction,invited_by&limit=1`),
      // ilike rather than eq: the stored name may carry different casing.
      supabase(`/promos?promo_name=ilike.${encodeURIComponent(key)}&limit=20`),
    ]);
    if (!playerRows.length) return res.status(404).json({ error: 'Player not found' });

    // PostgREST reads `*` (and `%`) in an ilike filter as a wildcard, so the
    // query alone would let `*` match whatever promo happens to come back
    // first. The name has to equal the typed code, not merely match it.
    const promo = promoRows.find(p => String(p.promo_name ?? '').trim().toLowerCase() === key);

    // No such promo: the box doubles as where a friend's invite code is typed,
    // for the player who opened the game without ever tapping a link. Tried
    // second, so a promo can never be shadowed by a share code.
    if (!promo) {
      if (playerRows[0].invited_by) {
        return res.status(400).json({ error: 'You have already been invited', code: 'invite_used' });
      }
      const invite = await acceptInvite({ chat_id, faction: playerRows[0].faction }, code);
      if (invite?.ok) {
        // Shaped like a promo payout so the reward modal draws it unchanged:
        // gold on its own, crystals and tokens keyed by item.
        const granted = { gold: 0, crystals: {}, tokens: {}, trophies: {} };
        for (const g of invite.granted || []) {
          if (g.item === 'Gold') granted.gold += g.amount;
          else if (g.item_type === 'token') granted.tokens[g.item] = (granted.tokens[g.item] || 0) + g.amount;
          else granted.crystals[g.item] = (granted.crystals[g.item] || 0) + g.amount;
        }
        return res.json({ success: true, invite: true, name: 'Invite', granted });
      }
      const reason = invite?.error || 'promo_unknown';
      const status = reason === 'invite_unknown' ? 404 : 400;
      return res.status(status).json({ error: 'Code cannot be used', code: reason === 'invite_unknown' ? 'promo_unknown' : reason });
    }

    const player = playerRows[0];
    const taken  = player.promos || {};
    // Keyed on the NORMALISED code, so re-entering it in different casing is
    // still recognised as already used.
    if (taken[key]) return res.status(400).json({ error: 'Code already used', code: 'promo_used' });

    const data     = promo.promo_data || {};
    const granted  = { crystals: {}, trophies: {}, tokens: {}, gold: 0, roster_xp: 0 };

    // Resources and trophies live in the same table, keyed by `item`. A row the
    // player has never held does not exist yet, so grant_resources upserts —
    // otherwise a promo granting an unseen crystal pays nothing.
    const payouts = [];
    const addItem = (item, amount, bucket) => {
      const amt = Number(amount);
      if (!item || !Number.isFinite(amt) || amt <= 0) return;
      // Tokens are their own item_type — the Tome button and the sigil badge
      // read `item_type=eq.token`, so a tome granted as a resource would be
      // invisible to both.
      const itemType = bucket === 'trophies' ? 'trophy' : bucket === 'tokens' ? 'token' : 'resource';
      payouts.push({ item, amount: amt, item_type: itemType });
      if (bucket === 'gold') granted.gold += amt;
      else granted[bucket][item] = (granted[bucket][item] || 0) + amt;
    };

    if (data.gold) addItem('Gold', data.gold, 'gold');
    for (const [type, amt] of Object.entries(data.crystals || {})) addItem(type, amt, 'crystals');
    for (const [id,   amt] of Object.entries(data.trophies || {})) addItem(id,   amt, 'trophies');
    for (const [id,   amt] of Object.entries(data.tokens   || {})) addItem(id,   amt, 'tokens');

    // One call, one transaction: a promo paying gold and three crystals can no
    // longer half-apply and leave the code unburned but partly redeemed.
    await grantResources(chat_id, payouts);

    // Roster XP goes to every unit, hero included. Auto level-ups run afterwards
    // so a unit pushed over its threshold by the promo advances immediately,
    // exactly as it would after a battle.
    let autoLeveled = [];
    if (Number(data.roster_xp) > 0) {
      const xp = Number(data.roster_xp);
      const roster = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero,engraving,calling,devotion`);
      await Promise.all(roster.map(r => supabase(`/roster?id=eq.${encodeURIComponent(r.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ unit_data: { ...(r.unit_data || {}),
          current_xp: Number(r.unit_data?.current_xp ?? 0) + xp } }),
      })));
      granted.roster_xp = xp;

      const structRows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1&select=buildings_data`);
      const fresh = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero,engraving,calling,devotion`);
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
    // player_id comes from the client and requireAuth only proves chat_id, so
    // the items DELETE below — the one thing here keyed on player_id rather
    // than chat_id — would happily wipe another account's stash. Confirm the
    // two belong to the same player before anything is deleted.
    const owner = await supabase(`/players?id=eq.${encodeURIComponent(player_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=timezone&limit=1`);
    if (!owner.length) return res.status(404).json({ error: 'Player not found' });

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
    // dead end: ensureErrandOffer cannot fill its slots while errands are
    // active, and the edge function may need roster data that was just deleted.
    // An untaken offer is stale too (it was minted for the faction and
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

    const preservedTimezone = owner[0]?.timezone ?? null;
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
    const [resources, trophies, tokens, supplyRows, structRows, roster, items] = await Promise.all([
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}&item_type=eq.resource`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}&item_type=eq.trophy`),
      // Tokens are their own item_type rather than a resource, because they must
      // NOT appear in the resource bar — it is full, and a Sigil is not something
      // you spend on a build. They surface only where they are used: a badge on
      // the respec button, a button in the unit sheet.
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}&item_type=eq.token`),
      // Supplies are their own item_type for the same reason tokens are: the
      // resource bar has seven slots and all seven are spoken for. They are
      // drawn by the embark screen, which is the only place they mean anything.
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}&item_type=eq.${SUPPLY_ITEM_TYPE}`),
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
      supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
      player
        ? fetchItems(`/items?player_id=eq.${player.id}&select=id,item_name,item_stats,equipped_by`)
        : Promise.resolve([]),
    ]);
    // Everything the embark screen needs to draw the gate and the countdown,
    // resolved here because data/buildings.js is CommonJS and the client cannot
    // read SUPPLY_MAX_BY_LEVEL or the tick length for itself.
    const supplyItem = supplyItemName(player?.faction);
    const supplies = supplyItem ? {
      item:          supplyItem,
      label_en:      SUPPLY_ITEMS[player.faction]?.en || supplyItem,
      label_ru:      SUPPLY_ITEMS[player.faction]?.ru || supplyItem,
      art:           SUPPLY_ITEMS[player.faction]?.art || null,
      amount:        Number(supplyRows.find(r => r.item === supplyItem)?.amount ?? 0),
      max:           maxSupplies(structRows[0]?.buildings_data),
      tick_minutes:  SUPPLY_TICK_MINUTES,
      embark_cost:   EMBARK_SUPPLY_COST,
    } : null;

    // The Temple's HP is folded in HERE rather than left for each screen to add:
    // every client card, and the ⚔ the client prints, derive from these rows, and
    // the server folds the same bonus in again when it builds the battle army
    // (withBonusHp). Decorating the response only — the stored roster is
    // untouched, and the client never sends unit_data back, so nothing can
    // persist or stack it.
    const rosterWithBonus = withBonusHp(roster, getUnitHpBonus(structRows[0]?.buildings_data));

    res.json({
      resources,
      trophies,
      tokens,
      supplies,
      items,
      structures: structRows[0] || null,
      roster: rosterWithBonus,
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
        // The calling screen is the castle's left page, and the Temple is its
        // ladder. The client draws five columns whatever happens and needs the
        // gate and the price to label them.
        calling_building:       CALLING_BUILDING,
        calling_building_level: CALLING_BUILDING_LEVEL,
        calling_tiers:          CALLING_TIERS,
        calling_tiers_open:     callingTiersOpen(structRows[0]?.buildings_data),
        calling_change_cost:    CALLING_CHANGE_COST,
        callings:               CALLINGS,
        // The five blocks of the Temple's page and what the oath costs, so
        // the client prices the next one without a round-trip.
        devotion_blocks:        DEVOTION_BLOCKS,
        oath_base_gold:         OATH_BASE_GOLD,
        oath_step_gold:         OATH_STEP_GOLD,
        oath_bonus:             OATH_BONUS,
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
      // Today's tasks and their progress. Free — the player row is already
      // loaded — so the shell can badge the button without a round-trip of its
      // own. Claiming still goes through /daily/claim, which re-reads the row.
      daily: player ? dailyPayload(player, heroTierOf(roster)) : null,
      daily_defs: { tasks: DAILY_TASKS, rewards: DAILY_REWARDS },
      // Quests ride along too, so the daily window draws the moment it opens
      // instead of waiting on /quests. The crystal names the player's own
      // element for reward art in both tabs.
      quests: player ? questsPayload(player, heroTierOf(roster)) : [],
      quests_claimable: player ? questsPayload(player, heroTierOf(roster)).filter(q => q.claimable).length : 0,
      faction_crystal: FACTION_CRYSTAL[player?.faction] || 'Crystals_Life',
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
  // slot_0 (Throne) is raised HERE rather than by the player. Its level-1
  // building is not a choice: exactly one tier-1 throne per faction names the
  // hero just picked as its unit_id, and the build was free. Asking the player
  // to confirm it bought nothing — it only gated roster, embark and spell
  // research (all keyed on throne level >= 1) behind a tap whose tutorial
  // prompt /player/reset throws away, since a reset keeps tutorial flags but
  // wipes structures. That combination left a reset player on a locked castle
  // with nothing pointing at the throne.
  const throneDef = (BUILDING_POOLS[faction]?.throne || [])
    .find(b => b.tier === 1 && b.unit_id === hero_id);
  if (throneDef) structures.slot_0 = { level: 1, building_id: throneDef.id };
  const unitDef = startingUnit ? getUnitByDataId(startingUnit.unit_id) : null;
  // The bonus unit starts DEAD so the opening spell tutorial has something to
  // revive (then heal). The hero is alive and armed as usual.
  //
  // With DEATH_ENABLED off it starts alive on 1 HP instead: badly wounded, so
  // the `spell_heal` step still has a unit to teach on (it gates go_embark and
  // the rest of onboarding, so it must still fire), while `unit_fallen` and
  // `spell_revive` find no corpse and skip themselves.
  const startingUnitData = unitDef
    ? { ...makeUnitData(unitDef.id, startingUnit.slot),
        ...(DEATH_ENABLED ? { alive: false, current_hp: 0 } : { alive: true, current_hp: 1 }) }
    : null;
  // Every unit is born with a calling (data/callings.js). The hero included -
  // it is a roster row with no branch left, and a litany cell has to be able to
  // match it.
  const rosterEntries = [
    { chat_id, unit_data: makeUnitData(heroDef.id, 'slot_0'), is_hero: true, calling: newCallingFor(faction) },
    ...(startingUnitData ? [{ chat_id, unit_data: startingUnitData, is_hero: false, calling: newCallingFor(faction) }] : []),
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
        })).concat(
          // The embark gate's opening balance. The building itself came from
          // emptyStructures() in `structures` above, so the ceiling this fills
          // towards is already in place.
          supplyItemName(faction)
            ? [{ chat_id, item_type: SUPPLY_ITEM_TYPE, item: supplyItemName(faction), amount: STARTING_SUPPLIES }]
            : []
        )
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
    const rows = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`);
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

    const rosterRows = await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`);
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
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
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

    const rosterRows = await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`);
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
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
    ]);
    res.json({ success: true, roster: updated[0], resources });
  } catch (err) {
    serverError(res, err);
  }
});

// ── Engravings ─────────────────────────────────────────────────────────────
// A permanent stat triangle on one unit (data/engravings.js): two stats up, one
// down. Only the CHOICE is stored; the numbers are read from the data file every
// time the unit's stats are derived, so retuning a stat retunes every engraving.
//
// Harmony is the exception: instead of stats it moves one of the unit's OWN
// passives up a rank and another down one, and arrives as { up, down } family
// names rather than point maps. It shares this slot — taking it replaces a
// triangle, and a triangle replaces it.
//
// Replacing overwrites the whole triangle and costs the full price again — an
// engraving can be changed, never removed, and never edited a corner at a time.
//
// The penalty is checked against the unit AS WORN. Stats floor at zero, so
// -10 fire resist on a unit holding none of it would be two free bonuses.
router.post('/roster/engrave', requireAuth, async (req, res) => {
  const { chat_id, roster_id, combo, minus, plus, tier, up, down } = req.body;
  if (!chat_id || !roster_id || !combo || !tier) {
    return res.status(400).json({ error: 'chat_id, roster_id, combo and tier required' });
  }
  const isHarmony = comboKind(getEngravingCombo(String(combo))) === 'passive';
  if (isHarmony ? (!up || !down) : (!plus || !minus)) {
    return res.status(400).json({
      error: isHarmony ? 'up and down required' : 'plus and minus required',
    });
  }

  try {
    // The Blacksmith's second level opens this, the way its first opens crafting.
    const structRows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1&select=buildings_data`);
    if (!engravingUnlocked(structRows[0]?.buildings_data)) {
      return res.status(400).json({ error: 'Raise the Blacksmith to level 2 first', code: 'engraving_locked' });
    }

    const rosterRows = await supabase(
      `/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`
    );
    if (!rosterRows.length) return res.status(404).json({ error: 'Roster entry not found' });

    const entry = rosterRows[0];
    const def = getUnitByDataId(entry.unit_data?.unit_id);
    if (!def) return res.status(400).json({ error: 'Unit definition not found' });

    // The unit as it stands: definition, its own values, then the worn item.
    // The engraving already on it is deliberately NOT applied — the new one
    // replaces it, so it is paid for by the unit without it.
    const itemsByRosterId = await getItemsByRosterIds([entry.id]);
    const item = itemsByRosterId[String(entry.id)];
    let unitData = { ...def, ...(entry.unit_data || {}) };
    if (item) unitData = applyItemModifiers(unitData, item.item_stats);

    // Point maps are taken as sent and validated whole: checkEngravingForUnit
    // rejects an unknown stat, a stat outside the combo, a stat moving both
    // ways, a point count that does not match the tier, and a penalty the unit
    // cannot pay. Nothing else is trusted.
    const asPoints = map => Object.fromEntries(
      Object.entries(map || {}).map(([stat, n]) => [String(stat), Number(n)])
    );
    const engraving = isHarmony
      ? { combo: String(combo), tier: String(tier), up: String(up), down: String(down) }
      : {
          combo: String(combo),
          tier:  String(tier),
          plus:  asPoints(plus),
          minus: asPoints(minus),
        };
    const invalid = checkEngravingForUnit(unitData, engraving);
    if (invalid) return res.status(400).json({ error: invalid, code: 'engraving_invalid' });

    try {
      // Valor and tokens in one spend: the database refuses the whole bill if
      // either is short, so a player cannot lose Valor to a missing token.
      await spendResources(chat_id, engravingBill(engraving.tier));
    } catch (err) {
      const short = shortfallItem(err);
      if (short) return res.status(400).json({ error: `Not enough ${short}`, code: 'insufficient', item: short });
      throw err;
    }

    await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ engraving }),
    });

    const [updated, resources] = await Promise.all([
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
    ]);
    res.json({ success: true, roster: updated[0], resources });
  } catch (err) {
    serverError(res, err);
  }
});

// ── Callings ───────────────────────────────────────────────────────────────
// The Temple's first level sells one thing: the right to change what a unit IS.
// Every roster row is born with a calling already on it (newCallingFor, at each
// of the three insert sites), so this is never the first assignment - it is a
// correction, and that is what the gold pays for.
//
// Nothing is reset here. The rungs the design doc has a change wiping do not
// exist yet, and a reset that clears nothing is a line of code that will be
// wrong the day they land - it belongs with them.
router.post('/roster/calling', requireAuth, async (req, res) => {
  const { chat_id, roster_id, calling } = req.body;
  if (!chat_id || !roster_id || !calling) {
    return res.status(400).json({ error: 'chat_id, roster_id and calling required' });
  }

  try {
    const [structRows, playerRows, rosterRows] = await Promise.all([
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1&select=buildings_data`),
      supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=faction&limit=1`),
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
    ]);

    if (!callingChangeUnlocked(structRows[0]?.buildings_data)) {
      return res.status(400).json({ error: 'Build the Temple first', code: 'calling_locked' });
    }
    const faction = playerRows[0]?.faction;
    if (!faction) return res.status(400).json({ error: 'Player has no faction' });
    if (!rosterRows.length) return res.status(404).json({ error: 'Roster entry not found' });

    // Only the player's own faction's two. A calling from another faction would
    // sit in the row for ever and never match a litany cell.
    const next = String(calling);
    if (!callingsForFaction(faction).some(c => c.id === next)) {
      return res.status(400).json({ error: 'That calling does not belong to your faction', code: 'calling_invalid' });
    }
    // Paying to pick the one it already has is a mis-tap, not a purchase.
    if (rosterRows[0].calling?.id === next) {
      return res.status(400).json({ error: 'That unit already has this calling', code: 'calling_unchanged' });
    }

    const bill = {};
    for (const [item, amount] of Object.entries(CALLING_CHANGE_COST)) {
      bill[item === 'gold' ? 'Gold' : item] = amount;
    }
    try {
      await spendResources(chat_id, bill);
    } catch (err) {
      const short = shortfallItem(err);
      if (short) return res.status(400).json({ error: `Not enough ${short}`, code: 'insufficient', item: short });
      throw err;
    }

    await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ calling: { id: next } }),
    });

    const [updated, resources] = await Promise.all([
      supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
    ]);
    res.json({ success: true, roster: withBonusHp(updated, getUnitHpBonus(structRows[0]?.buildings_data)), resources });
  } catch (err) {
    serverError(res, err);
  }
});

// ── The oath ───────────────────────────────────────────────
// Block 5 of the Temple's page, and the only one that never finishes. A unit
// at the end of its branch keeps earning XP that buys nothing; the oath is what
// that unit spends GOLD on instead, and the price climbs for ever - 1000, then
// 1500, then 2000 (data/callings.js).
//
// The price is decided inside the transaction, from the count already stored,
// because deciding it here is the race: two taps both read three oaths and both
// pay the fourth price. See roster_oath_buy in sql/010_temple_devotion.sql.
router.post('/roster/oath', requireAuth, async (req, res) => {
  const { chat_id, roster_id } = req.body;
  if (!chat_id || !roster_id) return res.status(400).json({ error: 'chat_id and roster_id required' });

  try {
    const [structRows, playerRows, rosterRows] = await Promise.all([
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1&select=buildings_data`),
      supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=faction&limit=1`),
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
    ]);

    const buildings = structRows[0]?.buildings_data;
    // The last block, so the last Temple level.
    if (callingTiersOpen(buildings) < CALLING_TIERS) {
      return res.status(400).json({ error: `Raise the Temple to level ${CALLING_TIERS} first`, code: 'oath_locked' });
    }
    const faction = playerRows[0]?.faction;
    if (!faction) return res.status(400).json({ error: 'Player has no faction' });
    if (!rosterRows.length) return res.status(404).json({ error: 'Roster entry not found' });

    const row = rosterRows[0];
    if (!atEndOfBranch(faction, row.unit_data)) {
      return res.status(400).json({ error: 'That unit still has a branch to finish', code: 'oath_not_maxed' });
    }
    // The blocks are a chain: the oath is the last of them and only opens once
    // the three deeds before it are done (devotionState in data/callings.js).
    // Checked here as well as drawn there - the client cannot be the thing that
    // decides whether a sink is open.
    const unfinished = DEVOTION_BLOCKS.find(b => b.kind === 'deed' && !blockDone(row, b));
    if (unfinished) {
      return res.status(400).json({
        error: `That unit has not finished: ${unfinished.name}`, code: 'oath_chain',
      });
    }

    let updatedRow = null;
    try {
      updatedRow = await rpc('roster_oath_buy', {
        p_chat_id:   String(chat_id),
        p_roster_id: Number(roster_id),
        p_base:      OATH_BASE_GOLD,
        p_step:      OATH_STEP_GOLD,
        p_bonus:     OATH_BONUS,
      });
    } catch (err) {
      const short = shortfallItem(err);
      if (short) {
        return res.status(400).json({
          error: `Not enough ${short}`, code: 'insufficient', item: short,
          price: oathPrice(oathsSworn(row)),
        });
      }
      throw err;
    }

    const [roster, resources] = await Promise.all([
      supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
    ]);
    res.json({
      success:  true,
      devotion: devotionOf(Array.isArray(updatedRow) ? updatedRow[0] : updatedRow),
      roster:   withBonusHp(roster, getUnitHpBonus(buildings)),
      resources,
    });
  } catch (err) {
    serverError(res, err);
  }
});

// ── Bulk restore ───────────────────────────────────────────────────────────
// The single-unit routes above are for surgical use — fix THIS unit. After a
// bad fight with four casualties they turn into fifteen taps: open slot sheet,
// tap, sheet reopens, back out, next slot. This does the whole party in one
// press.
//
// `mode` is what the castle's two buttons ask for:
//   'resurrect'      raise every fallen unit (to 1 HP, exactly as the spell does)
//   'resurrect_heal' raise them AND heal everyone hurt, in one bill
//   'heal'           heal every wounded unit, paid in crystals
//   'heal_potions'   heal every wounded unit to FULL, paid one Health Potion each
//
// Potions are offered ahead of crystals and only when there are enough for the
// whole party: one potion heals to full where the spell heals heal_pct, so a
// mixed bill would charge crystals for a worse result on some units than the
// potions gave others. Short of a potion per wounded unit, the crystal 'heal' is
// what the client offers instead.
//
// All or nothing. The client never offers a button it cannot pay for in full
// (see castleRestorePlan), so a shortfall here means the state moved underneath
// it — and half a restore, silently charged, is worse than a refusal. The
// crystal bill is therefore computed for the WHOLE set and debited once, before
// any roster row is touched.
router.post('/roster/restore', requireAuth, async (req, res) => {
  const { chat_id, mode } = req.body;
  if (!chat_id || !['resurrect', 'resurrect_heal', 'heal', 'heal_potions'].includes(mode)) {
    return res.status(400).json({ error: 'chat_id and a valid mode required' });
  }

  try {
    const playerRows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=learned_spells,faction&limit=1`);
    if (!playerRows.length) return res.status(404).json({ error: 'Player not found' });

    const player        = playerRows[0];
    const learnedSpells = player.learned_spells || [];
    const factionSpells = SPELLS[player.faction] || [];

    const resSpell  = factionSpells.find(s => s.usage === 'roster' && s.target_scope === 'single_ally');
    const healSpell = factionSpells.find(s => s.effect_type === 'heal' && s.target_scope === 'single_ally');

    // Potions need no spell: the per-unit potion button does not ask for one
    // either, and a token the player already holds should not be gated behind
    // a spellbook entry.
    const needRes  = mode !== 'heal' && mode !== 'heal_potions';
    const needHeal = mode !== 'resurrect' && mode !== 'heal_potions';
    if (needRes  && !(resSpell  && learnedSpells.includes(resSpell.id)))  return res.status(403).json({ error: 'Spell not learned' });
    if (needHeal && !(healSpell && learnedSpells.includes(healSpell.id))) return res.status(403).json({ error: 'Spell not learned' });

    const rosterRows = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`);

    // A unit is counted ONCE, for the thing it needs. In 'resurrect_heal' the
    // fallen pay both spells — raised at 1 HP by one, brought to full by the
    // other — which is exactly what the two presses would have cost.
    const dead    = rosterRows.filter(r => r.unit_data?.alive === false);
    const wounded = rosterRows.filter(r => {
      const d = r.unit_data || {};
      if (d.alive === false) return false;
      const maxHp = Number(d.max_hp ?? 0);
      const curHp = Number(d.current_hp ?? maxHp);
      return maxHp > 0 && curHp < maxHp;
    });

    // Paid in potions, one per wounded unit, and healed to full — the same
    // effect the single-unit /roster/potion gives. The spend is atomic, so a
    // player who is short pays nothing and no roster row is touched.
    if (mode === 'heal_potions') {
      if (!wounded.length) return res.status(400).json({ error: 'Nobody needs restoring' });
      try {
        await spendResources(chat_id, { health_potion: wounded.length });
      } catch (err) {
        if (shortfallItem(err)) {
          return res.status(400).json({ error: 'Not enough Health Potions', code: 'no_potion' });
        }
        throw err;
      }
      await Promise.all(wounded.map(r => supabase(`/roster?id=eq.${encodeURIComponent(r.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ unit_data: { ...r.unit_data, current_hp: Number(r.unit_data.max_hp ?? 0) } }),
      })));

      const [healed, resourcesAfter] = await Promise.all([
        supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
        supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
      ]);
      return res.json({ success: true, count: wounded.length, spent: { health_potion: wounded.length }, roster: healed, resources: resourcesAfter });
    }

    const resCount  = needRes  ? dead.length : 0;
    const healCount = needHeal ? (mode === 'resurrect_heal' ? dead.length + wounded.length : wounded.length) : 0;
    if (!resCount && !healCount) return res.status(400).json({ error: 'Nobody needs restoring' });

    const bill = {};
    const addCost = (spell, times) => {
      for (const [type, amt] of Object.entries(spell?.cost?.crystals || {})) {
        if (amt > 0 && times > 0) bill[type] = (bill[type] || 0) + amt * times;
      }
    };
    addCost(resSpell,  resCount);
    addCost(healSpell, healCount);

    try {
      await consumeCrystalCosts(chat_id, bill);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const healPct = healSpell?.params?.heal_pct ?? 1;
    const restored = [];
    for (const r of rosterRows) {
      const d      = r.unit_data || {};
      const isDead = d.alive === false;
      if (isDead && !needRes) continue;
      if (!isDead && !wounded.includes(r)) continue;
      if (!isDead && !needHeal) continue;

      const maxHp = Number(d.max_hp ?? 0);
      let next;
      if (isDead) {
        // Raised at 1 HP; the heal half of 'resurrect_heal' then tops it up.
        const raisedHp = mode === 'resurrect_heal' && maxHp > 0
          ? Math.min(maxHp, 1 + Math.floor(maxHp * healPct))
          : 1;
        next = { ...d, alive: true, current_hp: raisedHp };
      } else {
        const curHp = Number(d.current_hp ?? maxHp);
        next = { ...d, current_hp: Math.min(maxHp, curHp + Math.floor(maxHp * healPct)) };
      }
      restored.push({ id: r.id, unit_data: next });
    }

    await Promise.all(restored.map(u => supabase(`/roster?id=eq.${encodeURIComponent(u.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ unit_data: u.unit_data }),
    })));

    const [updated, resources] = await Promise.all([
      supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
    ]);
    res.json({ success: true, count: restored.length, spent: bill, roster: updated, resources });
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

// ── Daily tasks ─────────────────────────────────────────────────────────────
// Three small nudges a day — fight, send an errand, cast something real — and
// one reward of the player's choosing for finishing all three. The point is
// habit, not balance: the payout is deliberately generous while the systems it
// points at are the ones players skip.
//
// Storage is players.daily_tasks (jsonb), NOT a table of its own. It is exactly
// the shape adds_daily_view already has — a date stamp plus counters — and the
// player row is fetched by /bootstrap anyway, so progress and the button badge
// ride along at no extra query.
//
// Progress is only ever bumped by the server, from inside the routes that do
// the thing being counted, AFTER those routes have committed. Nothing the
// client sends can move a counter.

// Today's record, rolled over when the player's local day has moved on. Never
// null, and never trusts a stale `date`.
function dailyRecordFor(player) {
  const today = playerLocalDate(player?.timezone);
  const rec   = player?.daily_tasks || {};
  const blank = { date: today, claimed: false, reward: null };
  for (const t of DAILY_TASKS) blank[t.id] = 0;
  if (rec.date !== today) return blank;
  return {
    ...blank,
    ...Object.fromEntries(DAILY_TASKS.map(t => [t.id, Number(rec[t.id]) || 0])),
    claimed: rec.claimed === true,
    reward:  rec.reward || null,
  };
}

// The hero's tier, which decides which tasks make up the day (see
// min_hero_tier in data/daily_tasks.js). Tier lives on the unit definition.
function heroTierOf(rosterRows) {
  const hero = (rosterRows || []).find(r => r.is_hero);
  if (!hero) return 1;
  return getUnitByDataId(hero.unit_data?.unit_id)?.t ?? hero.unit_data?.t ?? 1;
}

async function heroTierFor(chat_id) {
  const rows = await supabase(
    `/roster?chat_id=eq.${encodeURIComponent(chat_id)}&is_hero=eq.true&select=unit_data,is_hero&limit=1`
  );
  return heroTierOf(rows);
}

// What the client is told: per-task progress, whether the set is finished, and
// whether the reward is still owed. Derived, so the client cannot disagree.
// Only the tasks this hero's tier has unlocked are part of the day.
function dailyPayload(player, heroTier = 1) {
  const record = dailyRecordFor(player);
  const tasks  = dailyTasksForTier(heroTier).map(t => ({
    id:       t.id,
    target:   t.target,
    progress: Math.min(record[t.id], t.target),
    done:     record[t.id] >= t.target,
  }));
  return {
    date:      record.date,
    tasks,
    complete:  tasks.every(t => t.done),
    claimed:   record.claimed,
    reward:    record.reward,
    claimable: tasks.every(t => t.done) && !record.claimed,
  };
}

// Add to one counter. Read-modify-write on the player row, like the ad
// allowance — the three actions this counts are sequential in practice, and a
// lost increment costs a player one step of one day's progress, which is not
// worth a stored procedure.
//
// NEVER awaited by the route that calls it, and never allowed to throw: a
// failed daily counter must not fail the battle, errand or cast that earned it.
// `taskId` may be a list: counters earned by the same action MUST be bumped in
// one call. Two unawaited calls each read the row, bump their own counter and
// write the whole record back, so the later write erased the earlier one — a
// Colossus attempt bumped 'battles' and 'colossus' side by side and lost one.
async function bumpDailyTask(chat_id, taskId, amount = 1) {
  const ids = Array.isArray(taskId) ? taskId : [taskId];
  try {
    const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=timezone,daily_tasks&limit=1`);
    if (!rows.length) return;
    const record = dailyRecordFor(rows[0]);
    let changed = false;
    for (const id of ids) {
      // Counting past the target is pointless and lets a number grow forever.
      const target = DAILY_TASKS.find(t => t.id === id)?.target ?? 0;
      if (record[id] >= target) continue;
      record[id] = Math.min(target, record[id] + amount);
      changed = true;
    }
    if (!changed) return;
    await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ daily_tasks: record }),
    });
  } catch (err) {
    console.error(`daily task bump failed (${ids.join(',')}):`, err.message);
  }
}

// ── Quests ──────────────────────────────────────────────────────────────────
// Milestone chains that never roll over (data/quests.js). Stored in
// players.quests; both the bump and the claim run as database functions (see
// sql/005_quests.sql) because a battle's counters land fire-and-forget while
// the player may be claiming on the same row.

function questState(player, quest) {
  const rec   = player?.quests?.[quest.id] || {};
  const tiers = questTiers(quest);
  const tier  = Math.max(0, Number(rec.tier) || 0);
  const progress = Number(rec.progress) || 0;
  const finished = tier >= tiers.length;
  return {
    id:        quest.id,
    tier,
    tiers,
    progress:  Math.min(progress, tiers[tiers.length - 1]),
    target:    finished ? tiers[tiers.length - 1] : tiers[tier],
    finished,
    cycles:    Number(rec.cycles) || 0,
    claimable: !finished && progress >= tiers[tier],
  };
}

// Only the quests this hero's tier has unlocked (min_hero_tier in data/quests.js).
function questsPayload(player, heroTier = 1) {
  return questsForTier(heroTier).map(q => questState(player, q));
}

// counters: { damage_physical: 412, 'kills:Demon': 2, battles_won: 1 }.
// Every quest reading one of those counters moves. NEVER awaited by the route
// that calls it, and never allowed to throw — same contract as bumpDailyTask.
async function bumpQuests(chat_id, counters) {
  try {
    const amounts = {};
    const caps    = {};
    for (const q of QUESTS) {
      const n = Math.floor(Number(counters?.[q.counter]) || 0);
      if (n <= 0) continue;
      const tiers = questTiers(q);
      amounts[q.id] = n;
      caps[q.id]    = tiers[tiers.length - 1];
    }
    if (!Object.keys(amounts).length) return;
    await rpc('quest_bump', { p_chat_id: String(chat_id), p_amounts: amounts, p_caps: caps });
  } catch (err) {
    console.error('quest bump failed:', err.message);
  }
}

// What one side of a finished battle did, as quest counters.
function battleQuestCounters(battle_data, side, extra = {}) {
  return { ...(battle_data?.tally?.[side] || {}), ...extra };
}

// Bumps the counters AND reports what that did, for the battle result screen:
// every visible quest the battle moved, where it was, where it is now, and
// whether a milestone was crossed. Worked out from a read taken just before the
// bump, capped exactly as quest_bump caps. Never throws — an empty report is
// the worst case, and the bump itself still runs.
async function bumpQuestsWithReport(chat_id, counters) {
  let report = [];
  try {
    const [rows, heroTier] = await Promise.all([
      supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=quests&limit=1`),
      heroTierFor(chat_id),
    ]);
    const player = rows[0];
    if (player) {
      for (const q of questsForTier(heroTier)) {
        const gain = Math.floor(Number(counters?.[q.counter]) || 0);
        if (gain <= 0) continue;
        const state = questState(player, q);
        if (state.finished) continue;
        const cap    = state.tiers[state.tiers.length - 1];
        const before = Math.min(cap, Number(player.quests?.[q.id]?.progress) || 0);
        const after  = Math.min(cap, before + gain);
        if (after === before) continue;
        report.push({
          id:      q.id,
          before,
          after,
          target:  state.target,
          tier:    state.tier,
          tiers:   state.tiers.length,
          reached: before < state.target && after >= state.target,
        });
      }
    }
  } catch (err) {
    console.error('quest report failed:', err.message);
    report = [];
  }
  await bumpQuests(chat_id, counters);
  return report;
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

function errandCapacityForLevel(level) {
  return level >= 4 ? 2 : 1;
}

function throneLevelOf(structures) {
  return structures?.buildings_data?.slot_0?.level ?? 0;
}

// The Proving Grounds' third level, read once when a battle is CREATED and then
// carried in battle_data — a castle raised mid-fight must not change a fight
// already under way. One read, so a battle that cannot reach the castle (a bot
// sim, a test) simply keeps the engine's unlocked default.
async function litaniesUnlockedFor(chat_id) {
  try {
    const rows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1&select=buildings_data`);
    return litaniesUnlocked(rows[0]?.buildings_data);
  } catch {
    // A castle we cannot read is not a reason to take the drill away from
    // someone who has earned it; the formation still has to be exact.
    return true;
  }
}

// The Temple's flat max HP (data/buildings.js), +1 a level to +5. A castle we
// cannot read gives nothing rather than guessing upward: a battle fought without
// the bonus is a smaller wrong than one fought with a bonus the player has not
// built.
async function unitHpBonusFor(chat_id) {
  try {
    const rows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1&select=buildings_data`);
    return getUnitHpBonus(rows[0]?.buildings_data);
  } catch (err) {
    console.error('Temple HP read failed (fielding without it):', err.message);
    return 0;
  }
}

// Fold that bonus into roster rows as they are read, before anything derives from
// them. Applied at EVERY read of a roster row a unit is built or priced from —
// the three army builds and /bootstrap — so the HP on the card, the ⚔ both sides
// compute, and the unit that walks onto the board are one number.
//
// Never written back. The roster keeps the unit's own HP and the bonus is
// re-derived from the castle every time, so razing the Temple cannot leave a
// stale total behind, and re-reading cannot stack it.
//
// current_hp rises with the maximum for the same reason an item's does: a unit at
// full health must not enter its next battle already wounded.
function withBonusHp(rosterRows, hpBonus) {
  return (rosterRows || []).map(r => {
    // The Temple's flat HP is the same for every unit; the oath's is the unit's
    // own, bought one point at a time on the Temple's page (sql/010). Both are
    // folded in HERE and never written to the row, because every battle rewrites
    // unit_data.max_hp from the unit's definition.
    const bonus = (hpBonus || 0) + devotionBonusHp(r);
    if (!bonus) return r;
    const unit_data = r?.unit_data;
    const maxHp = Number(unit_data?.max_hp);
    if (!Number.isFinite(maxHp)) return r;
    const curHp = Number.isFinite(Number(unit_data.current_hp)) ? Number(unit_data.current_hp) : maxHp;
    return { ...r, unit_data: { ...unit_data, max_hp: maxHp + bonus, current_hp: Math.min(curHp + bonus, maxHp + bonus) } };
  });
}

// ── Devotion, the Temple's record ──────────────────────────────────────────
// Counters live in `roster.devotion` and are added in the database, never read
// then written from here (sql/010_temple_devotion.sql).
//
// WHERE EACH BLOCK IS COUNTED:
//   errands   POST /errands/seen, below. The edge function that FINISHES an
//             errand lives outside this repo, so the first moment this service
//             can see a finished one is when the player is shown the result -
//             which is also the one place that is idempotent, because it sets
//             the `seen` flag.
//   deeds     the battle engine credits damage, healing and active shields per roster id
//             (creditDeed); banked at reward time, below.
//   litanies  every player unit that was on the board when one fired. The deed
//             is standing there, not performing a role - most units can never
//             be a lead or a chorister (data/litanies.js).
// ONLY THE LIVE BLOCK COUNTS. A deed earned for a block that is not this unit's
// turn is dropped on the floor - it is not banked and not remembered. That is
// the whole point of the chain: without it a unit with a battle record behind it
// clears three blocks the instant the first one lands, and the Temple stops
// being a reason to go and do the thing it is asking for.
//
// Decided HERE rather than in the database so there is one implementation of the
// chain (devotionState, data/callings.js) and the rpc stays a dumb atomic adder.
// The cost is two small reads per credit; the alternative is the same rules
// written twice in two languages.
async function bumpDevotion(chat_id, bumps) {
  const ids = Object.keys(bumps || {}).filter(id => /^\d+$/.test(String(id)));
  if (!ids.length) return null;

  const [structRows, rows] = await Promise.all([
    supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1&select=buildings_data`),
    supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&id=in.(${ids.join(',')})&select=id,is_hero,devotion`),
  ]);
  const temple = callingTiersOpen(structRows[0]?.buildings_data);
  if (!temple) return null;

  const byId = new Map(rows.map(r => [String(r.id), r]));
  const payload = {};
  for (const rosterId of ids) {
    const row = byId.get(rosterId);
    if (!row) continue;
    // At most one deed block is ever 'open' for a unit (devotionState walks the
    // chain in order), so this is the one counter that may move.
    const live = DEVOTION_BLOCKS.find(
      b => b.kind === 'deed' && devotionState(row, b, temple) === 'open');
    if (!live) continue;
    const counter = blockFor(row, live).counter;
    const n = Math.floor(Number(bumps[rosterId]?.[counter]) || 0);
    if (n > 0) payload[rosterId] = { [counter]: n };
  }
  if (!Object.keys(payload).length) return null;
  return rpc('roster_devotion_bump', { p_chat_id: String(chat_id), p_bumps: payload });
}

// Never throws: a battle's payout must not fail because a counter did not move.
async function creditBattleDevotion(chat_id, battle_data, side = 'player') {
  try {
    if (!battle_data || !Array.isArray(battle_data.units)) return;
    const mine = battle_data.units.filter(u => u.side === side && u._rosterId != null);
    if (!mine.length) return;

    const deeds = battle_data.deeds || {};
    // `litaniesFired` is `<litany id>:<side>`, one entry per litany per side.
    const litanies = (battle_data.litaniesFired || [])
      .filter(k => String(k).endsWith(`:${side}`)).length;

    const bumps = {};
    for (const u of mine) {
      const id = String(u._rosterId);
      const add = {};
      const dealt = Math.floor(Number(deeds[id]) || 0);
      if (dealt > 0) add.deeds = dealt;
      if (litanies > 0) add.litanies = litanies;
      if (Object.keys(add).length) bumps[id] = add;
    }
    await bumpDevotion(chat_id, bumps);
  } catch (err) {
    console.error('devotion credit failed:', err.message);
  }
}

// End of branch: the unit has nowhere left to evolve, so the XP it keeps
// earning has nothing to buy. That is the whole premise of the oath, and it is
// the same test for a hero - a hero at the top of the throne ladder has no
// path either (UNIT_UPGRADE_PATHS in data/buildings.js).
function atEndOfBranch(faction, unitData) {
  const paths = UNIT_UPGRADE_PATHS?.[faction]?.[unitData?.unit_id];
  return !paths || !paths.length;
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
    supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero,engraving,calling,devotion`),
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
  const postLevel = errandPostLevelOf(structRows[0]);
  const capacity = errandCapacityForLevel(postLevel);

  // Keep the second offer available only while a level-4 errand slot is free.
  if (active.length >= capacity) return { rows, active, offerRow: null, roster, structRows };
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
    postLevel,
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
    const player = req.authenticatedPlayer;
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

    const postLevel = errandPostLevelOf(structRows[0]);
    const active = rows.filter(r => r.active);
    if (active.length >= errandCapacityForLevel(postLevel)) {
      return res.status(400).json({ error: 'All errand slots are full', code: 'errand_busy' });
    }
    if (active.some(r => String(r.errand_data?.roster_id) === String(roster_id))) {
      return res.status(400).json({ error: 'That unit is already on an errand', code: 'errand_unit_busy' });
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

    // The offer row becomes the running errand. Filtering on active=false
    // prevents a second request from starting the same offer twice.
    const updated = await supabase(`${ERRAND_TABLE}?id=eq.${encodeURIComponent(offerRow.id)}&player=eq.${encodeURIComponent(chat_id)}&active=is.false`, {
      method: 'PATCH',
      body: JSON.stringify({ errand_data, active: true }),
      headers: { Prefer: 'return=representation' },
    });
    const startedRow = Array.isArray(updated) ? updated[0] : updated;
    if (!startedRow) {
      return res.status(400).json({ error: 'That errand was already taken', code: 'errand_busy' });
    }

    bumpDailyTask(chat_id, 'errands');
    bumpQuests(chat_id, { errands: 1 });
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

    // Block 2 of the Temple's page. Counted HERE and nowhere else: the `seen`
    // flag below makes this the only moment a finished errand is acknowledged
    // exactly once, and the edge function that finishes it cannot reach this
    // column. An errand already marked seen credits nothing on a retry.
    const alreadySeen = row.errand_data?.seen === true;
    const errandUnit  = row.errand_data?.roster_id;

    await supabase(`${ERRAND_TABLE}?id=eq.${encodeURIComponent(errand_row_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ errand_data: { ...(row.errand_data || {}), seen: true } }),
    });

    if (!alreadySeen && errandUnit != null) {
      await bumpDevotion(chat_id, { [String(errandUnit)]: { errands: 1 } }).catch(err => {
        console.error('errand devotion bump failed:', err.message);
      });
    }
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
    const rosterRows = await supabase(`/roster?id=eq.${encodeURIComponent(pending.roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`);
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

    const updated = await supabase(`/roster?id=eq.${encodeURIComponent(pending.roster_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`);
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

// GET /daily — today's tasks, standalone. /bootstrap carries the same payload,
// so this exists for the sheet, which wants a fresh read rather than whatever
// the cache happened to hold when the player last navigated.
router.get('/daily', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=faction,timezone,daily_tasks&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });
    // Which crystal stands for this player's faction, so the crystal reward can
    // be drawn with their own element's art instead of a generic gem. The map
    // lives in data/buildings.js, which is CommonJS and cannot be imported by
    // the browser — so the answer is sent rather than re-derived client-side.
    res.json({
      ...dailyPayload(rows[0], await heroTierFor(chat_id)),
      faction_crystal: FACTION_CRYSTAL[rows[0].faction] || 'Crystals_Life',
      tasks_def: DAILY_TASKS,
      rewards: DAILY_REWARDS,
    });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /daily/claim — every task done, take one of the rewards.
//
// The record is re-read here and every gate is re-checked against it: what the
// client believed when it drew the sheet is never the authority on whether the
// day is finished or already paid.
router.post('/daily/claim', requireAuth, async (req, res) => {
  const { chat_id, reward } = req.body;
  if (!chat_id || !reward) return res.status(400).json({ error: 'chat_id and reward required' });
  const rewardDef = DAILY_REWARDS_BY_ID[reward];
  if (!rewardDef) return res.status(400).json({ error: 'Unknown reward', code: 'daily_bad_reward' });
  try {
    const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=faction,timezone,daily_tasks&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });

    const record = dailyRecordFor(rows[0]);
    if (record.claimed) return res.status(400).json({ error: 'Already claimed today', code: 'daily_claimed' });
    if (!dailyTasksForTier(await heroTierFor(chat_id)).every(t => record[t.id] >= t.target)) {
      return res.status(400).json({ error: 'Tasks not finished', code: 'daily_incomplete' });
    }

    // MARK IT CLAIMED BEFORE PAYING ANYTHING OUT — the same order /battle/reward
    // uses, and for the same reason: every line below this awaits, and each of
    // those awaits is a window in which a double-tap pays the reward twice. The
    // filter makes the write itself the race guard, so a second request matches
    // no row and comes back empty. The date is matched too, so a stale record
    // from a previous day can never be mistaken for today's unclaimed one.
    const marked = await supabase(
      `/players?chat_id=eq.${encodeURIComponent(chat_id)}`
      + `&daily_tasks->>date=eq.${encodeURIComponent(record.date)}`
      + `&daily_tasks->>claimed=not.eq.true`, {
        method: 'PATCH',
        body: JSON.stringify({ daily_tasks: { ...record, claimed: true, reward } }),
        headers: { Prefer: 'return=representation' },
      });
    if (!(Array.isArray(marked) ? marked.length : marked)) {
      return res.status(400).json({ error: 'Already claimed today', code: 'daily_claimed' });
    }

    const inventoryRows = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`);
    const granted = { resources: {}, tokens: {}, supplies: 0 };
    const payouts = [];

    // Resources (gold, crystals) always have a row — they are seeded at
    // registration — so a missing one means something is wrong with the account
    // and is skipped rather than invented. The read still decides that; only the
    // write moved into the database.
    for (const [item, amount] of Object.entries(rewardDef.resources || {})) {
      if (!rewardDef.upsert && !inventoryRows.some(r => r.item === item && r.item_type === 'resource')) continue;
      granted.resources[item] = amount;
      payouts.push({ item, amount, item_type: 'resource' });
    }

    // Tokens may genuinely be absent — a player who has never earned a tome has
    // no row — so these upsert the way first-clear token drops do.
    for (const [item, amount] of Object.entries(rewardDef.tokens || {})) {
      granted.tokens[item] = amount;
      payouts.push({ item, amount, item_type: 'token' });
    }

    // Supplies name their row per faction, so the amount is all the reward def
    // can state. No ceiling is applied: the pool is allowed to sit above its max
    // until it is spent down (see the supplies reward in data/daily_tasks.js).
    const supplyItem = supplyItemName(rows[0].faction);
    if (rewardDef.supplies && supplyItem) {
      granted.supplies = rewardDef.supplies;
      payouts.push({ item: supplyItem, amount: rewardDef.supplies, item_type: SUPPLY_ITEM_TYPE });
    }

    await grantResources(chat_id, payouts);

    // The day is done and paid: the inviter earns their crystals for it, capped
    // per invitee in data/invites.js.
    noteInviteMoment(chat_id, 'daily');

    res.json({ success: true, reward, granted });
  } catch (err) {
    serverError(res, err);
  }
});

// GET /quests — every quest's chain position and progress.
router.get('/quests', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=faction,quests&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });
    res.json({
      quests: questsPayload(rows[0], await heroTierFor(chat_id)),
      faction_crystal: FACTION_CRYSTAL[rows[0].faction] || 'Crystals_Life',
    });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /quests/claim — take the next milestone of one quest.
//
// The claim is the database's decision (quest_claim), made before anything is
// paid: it only moves the tier when that tier is still the next one and its
// target is met, so a double-tap pays once.
router.post('/quests/claim', requireAuth, async (req, res) => {
  const { chat_id, quest } = req.body;
  if (!chat_id || !quest) return res.status(400).json({ error: 'chat_id and quest required' });
  const def = QUESTS_BY_ID[quest];
  if (!def) return res.status(400).json({ error: 'Unknown quest', code: 'quest_unknown' });
  try {
    const rows = await supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=faction,quests&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Player not found' });

    if ((def.min_hero_tier ?? 1) > await heroTierFor(chat_id)) {
      return res.status(400).json({ error: 'Quest locked', code: 'quest_locked' });
    }
    const state = questState(rows[0], def);
    if (!state.claimable) return res.status(400).json({ error: 'Milestone not reached', code: 'quest_incomplete' });

    const taken = await rpc('quest_claim', {
      p_chat_id: String(chat_id),
      p_quest:   def.id,
      p_tier:    state.tier,
      p_target:  state.target,
      p_last:    state.tier === state.tiers.length - 1,
      p_repeat:  def.repeat !== false,
    });
    if (taken !== true) return res.status(400).json({ error: 'Already claimed', code: 'quest_claimed' });

    const reward  = def.rewards[state.tier] || {};
    const crystal = FACTION_CRYSTAL[rows[0].faction] || 'Crystals_Life';
    const payouts = [];
    for (const [item, amount] of Object.entries(reward.resources || {})) payouts.push({ item, amount, item_type: 'resource' });
    if (reward.crystals) payouts.push({ item: crystal, amount: reward.crystals, item_type: 'resource' });
    for (const [item, amount] of Object.entries(reward.tokens || {})) payouts.push({ item, amount, item_type: 'token' });
    // Per-faction row name, and no ceiling: a milestone may leave the pool above
    // its max, where it stays until spent.
    const supplyItem = supplyItemName(rows[0].faction);
    if (reward.supplies && supplyItem) {
      payouts.push({ item: supplyItem, amount: reward.supplies, item_type: SUPPLY_ITEM_TYPE });
    }
    await grantResources(chat_id, payouts);

    res.json({ success: true, granted: payouts });
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

    const [structRows, rows] = await Promise.all([
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
      errandRowsFor(chat_id),
    ]);
    const active  = rows.filter(r => r.active);
    const offered = rows.filter(r => !r.active && r.errand_data?.offered);
    const capacity = errandCapacityForLevel(errandPostLevelOf(structRows[0]));

    // Nothing to swap. Checked before the allowance so a player cannot burn a
    // day's rerolls against an offer that is not there.
    if (active.length >= capacity) {
      return res.status(400).json({ error: 'All errand slots are full', code: 'errand_busy' });
    }
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
    const capacity = errandCapacityForLevel(errandPostLevelOf(structRows[0]));
    if (active.length >= capacity || !offered.length) {
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
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
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

    // The tome is spent before the XP is granted, and the spend is the guard: a
    // player double-tapping the button used to have both requests read amount=1
    // and both write 0, teaching the unit twice for one tome.
    try {
      await spendResources(chat_id, { tome_of_knowledge: 1 });
    } catch (err) {
      if (shortfallItem(err)) {
        return res.status(400).json({ error: 'No Tome of Knowledge to use', code: 'no_tome' });
      }
      throw err;
    }
    await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ unit_data: { ...unitData, current_xp: Number(unitData.current_xp ?? 0) + TOME_XP } }),
    });

    // Same auto-level pass the promo and post-battle paths use, so a unit the
    // tome pushes over its threshold advances right away — including the hero,
    // whose level applyAutoLevelUps caps at the throne's.
    let autoLeveled = [];
    const structRows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1&select=buildings_data`);
    const fresh = await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&select=id,unit_data,is_hero,engraving,calling,devotion`);
    try { autoLeveled = await applyAutoLevelUps(fresh, structRows[0]?.buildings_data); }
    catch (err) { console.error('tome auto level-up failed:', err.message); }

    const updated = await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`);
    res.json({ success: true, xp: TOME_XP, roster: updated[0], tomes_left: Number(tomeRow.amount) - 1, auto_level_ups: autoLeveled });
  } catch (err) {
    serverError(res, err);
  }
});

// Health Potion: the crystal Heal spell's effect (see /roster/heal) paid for with
// a token instead of crystals — and to FULL health rather than heal_pct. Same
// rules otherwise: not on a fallen unit, not on one already at full.
router.post('/roster/potion', requireAuth, async (req, res) => {
  const { chat_id, roster_id } = req.body;
  if (!chat_id || !roster_id) return res.status(400).json({ error: 'chat_id and roster_id required' });
  try {
    const rosterRows = await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`);
    if (!rosterRows.length) return res.status(404).json({ error: 'Roster entry not found' });

    const unitData = rosterRows[0].unit_data || {};
    if (unitData.alive === false) return res.status(400).json({ error: 'Cannot heal a fallen unit — resurrect it first' });
    const maxHp = Number(unitData.max_hp ?? 0);
    const curHp = Number(unitData.current_hp ?? maxHp);
    if (maxHp <= 0 || curHp >= maxHp) return res.status(400).json({ error: 'Unit is already at full health' });

    // Spend first, as the tome does: the spend is the double-tap guard.
    try {
      await spendResources(chat_id, { health_potion: 1 });
    } catch (err) {
      if (shortfallItem(err)) return res.status(400).json({ error: 'No Health Potion to use', code: 'no_potion' });
      throw err;
    }
    await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ unit_data: { ...unitData, current_hp: maxHp } }),
    });

    const updated = await supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`);
    res.json({ success: true, roster: updated[0] });
  } catch (err) {
    serverError(res, err);
  }
});

// ── Transmutation ─────────────────────────────────────────────────────────
// Two DIFFERENT crystals in, one of each per crystal out, into a third crystal
// of the player's choice. Timed like an errand: 1 hour + 1 minute per crystal
// produced. The inputs are paid at start; the output is granted at claim.
//
// Stored in its own `transmutations` table, one row per job. A row with
// collected_at NULL is the player's open job; a partial unique index on
// (chat_id) WHERE collected_at IS NULL makes "one at a time" a database fact,
// not just a check here. Collected rows stay as history.
const TRANSMUTE_TABLE = '/transmutations';
const TRANSMUTE_CRYSTALS = ['Crystals_Life', 'Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'];
const TRANSMUTE_MAX = 999;
const transmuteMinutes = amount => 60 + amount;

async function openTransmutation(chat_id) {
  const rows = await supabase(`${TRANSMUTE_TABLE}?chat_id=eq.${encodeURIComponent(chat_id)}&collected_at=is.null&limit=1`);
  return rows[0] || null;
}

router.get('/transmute', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const job = await openTransmutation(chat_id);
    res.json({ job, now: new Date().toISOString() });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/transmute/start', requireAuth, async (req, res) => {
  const { chat_id, target, a, b } = req.body;
  const amount = Math.floor(Number(req.body.amount));
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  if (![target, a, b].every(k => TRANSMUTE_CRYSTALS.includes(k))) {
    return res.status(400).json({ error: 'Choose three crystals', code: 'transmute_bad_crystal' });
  }
  if (new Set([target, a, b]).size !== 3) {
    return res.status(400).json({ error: 'All three crystals must be different', code: 'transmute_same' });
  }
  if (!Number.isFinite(amount) || amount < 1 || amount > TRANSMUTE_MAX) {
    return res.status(400).json({ error: `Amount must be 1–${TRANSMUTE_MAX}`, code: 'transmute_amount' });
  }
  try {
    // The Transmutation Lab opens this, the way the Blacksmith opens crafting.
    // Only START is gated: a job already running can always be collected.
    const structRows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1&select=buildings_data`);
    if (buildingLevel(structRows[0]?.buildings_data, 'transmute_lab') < 1) {
      return res.status(400).json({ error: 'Build the Transmutation Lab first', code: 'transmute_no_lab' });
    }
    if (await openTransmutation(chat_id)) {
      return res.status(400).json({ error: 'A transmutation is already running', code: 'transmute_busy' });
    }

    // Paid up front; the spend itself refuses a shortfall atomically.
    try {
      await spendResources(chat_id, { [a]: amount, [b]: amount });
    } catch (err) {
      if (shortfallItem(err)) return res.status(400).json({ error: 'Not enough crystals', code: 'transmute_short' });
      throw err;
    }

    const now = Date.now();
    let inserted;
    try {
      inserted = await supabase(TRANSMUTE_TABLE, {
        method: 'POST',
        body: JSON.stringify({
          chat_id: String(chat_id), target, a, b, amount,
          started_at: new Date(now).toISOString(),
          ends_at:    new Date(now + transmuteMinutes(amount) * 60000).toISOString(),
        }),
        headers: { Prefer: 'return=representation' },
      });
    } catch (err) {
      // The partial unique index is the race guard: a second start that got
      // past the check above fails here. Its crystals are handed back.
      await grantResources(chat_id, [{ item: a, amount }, { item: b, amount }]);
      if (/23505|duplicate/i.test(err?.message || '')) {
        return res.status(400).json({ error: 'A transmutation is already running', code: 'transmute_busy' });
      }
      throw err;
    }
    res.json({ success: true, job: Array.isArray(inserted) ? inserted[0] : inserted });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/transmute/claim', requireAuth, async (req, res) => {
  const { chat_id } = req.body;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const job = await openTransmutation(chat_id);
    if (!job) return res.status(400).json({ error: 'Nothing is transmuting', code: 'transmute_none' });
    if (new Date(job.ends_at).getTime() > Date.now()) {
      return res.status(400).json({ error: 'Not finished yet', code: 'transmute_running' });
    }
    // Close first, conditioned on the row still being open, so a double tap
    // grants once: the second PATCH matches nothing.
    const cleared = await supabase(
      `${TRANSMUTE_TABLE}?id=eq.${encodeURIComponent(job.id)}&collected_at=is.null`, {
        method: 'PATCH',
        body: JSON.stringify({ collected_at: new Date().toISOString() }),
        headers: { Prefer: 'return=representation' },
      });
    if (!(Array.isArray(cleared) ? cleared[0] : cleared)) {
      return res.status(400).json({ error: 'Already collected', code: 'transmute_none' });
    }
    await grantResources(chat_id, [{ item: job.target, amount: job.amount }]);
    res.json({ success: true, granted: { [job.target]: job.amount } });
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
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
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
    // LEVELLING UP WIPES THE TEMPLE'S DEEDS. The unit that comes out the other
    // side is a new unit as far as the Temple is concerned, and it walks the
    // chain again from the first block — which is the point: the deeds are
    // errands, then fighting, then litanies, and a unit that keeps advancing
    // keeps being sent back round every corner of the game.
    //
    // What survives is what was BOUGHT: `oaths` (it sets the next price) and
    // `bonus` (the HP that gold already paid for). Only an oath may move a stat,
    // and nothing may take one back.
    const updatePromises = [
      supabase(`/roster?id=eq.${roster_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ unit_data: newUnitData, devotion: resetDevotionDeeds(entry) }),
      }),
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
    const updated = await supabase(`/roster?id=eq.${roster_id}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`);
    res.json(updated[0]);
  } catch (err) {
    serverError(res, err);
  }
});

// ── Deconstruction ──────────────────────────────────────────────────────────
// Respec: swap a slot's building for a sibling or alternate branch at the same
// tier. The slot keeps its level and the unit it granted keeps its XP; sigils
// are the only cost. The throne may be respecced but never cleared.
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

    // A direct sibling costs one sigil. A target across another fork costs the
    // number assigned by its depth on the branch tree.
    const options = getRespecOptions(faction, current.building_id);
    let target    = options.find(o => o.id === building_id);
    let sigilsRequired = target ? 1 : 0;

    // Failing that, the target may be across a fork. The tier check still holds —
    // getCrossBranchRespecOptions only returns buildings at this slot's tier.
    if (!target) {
      target = getCrossBranchRespecOptions(faction, current.building_id).find(o => o.id === building_id);
      if (target) sigilsRequired = target.sigils_required;
    }
    if (!target) return res.status(400).json({ error: 'That building is not a valid respec for this slot' });

    const bill = { crossroad_sigil: sigilsRequired };

    try {
      await spendResources(chat_id, bill);
    } catch (err) {
      const short = shortfallItem(err);
      if (short === 'crossroad_sigil') {
        const sigilWord = sigilsRequired === 1 ? 'Sigil is' : 'Sigils are';
        return res.status(400).json({
          error: `${sigilsRequired} Crossroad ${sigilWord} needed to respec`,
          code: 'no_sigil',
        });
      }
      if (short) return res.status(400).json({ error: `Not enough ${short}` });
      throw err;
    }

    buildings[slot] = { level: current.level, building_id: target.id };
    const updated = await supabase(`/structures?id=eq.${record.id}`, { method: 'PATCH', body: JSON.stringify({ buildings_data: buildings }) });

    // Swap the unit this slot granted. XP survives the respec — the player is
    // re-choosing a branch, not starting over — but HP is re-rolled from the new
    // unit's definition, since max_hp differs between lines.
    let swappedUnit = null;
    if (target.unit_id) {
      const rosterRows = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero,engraving,calling,devotion`);
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
    res.json({
      structures: updated[0],
      cost,
      swapped_unit: swappedUnit,
      used_sigil: sigilsRequired > 0,
      sigils_spent: sigilsRequired,
    });
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
  // Exempt for the same reason as the throne: it was granted rather than built,
  // and demolishing it only throws away the levels the player paid for. The
  // ceiling would fall back to the level-1 value rather than locking embark
  // (see maxSupplies), so this is not a safety check — it is refusing to let
  // someone spend gold on a building and then delete it by accident.
  if (DEFAULT_BUILDINGS[slot]) return res.status(400).json({ error: 'That building cannot be demolished' });
  try {
    const rows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (!rows.length) return res.status(404).json({ error: 'Structures not found' });
    const record    = rows[0];
    const buildings = record.buildings_data;
    const current   = buildings[slot];
    if (!current || !current.building_id) return res.status(400).json({ error: 'That slot is already empty' });

    const rosterRows = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero,engraving,calling,devotion`);
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

    // The throne charges gold; every other slot charges gold + the faction's
    // crystal (see applyBuildingCosts in data/buildings.js). Both end up in one
    // bill, so a build costing gold and two crystals is a single transaction
    // that either clears in full or takes nothing.
    const bill = {};
    if (slotCategory === 'throne') {
      if (!isNew) {
        const cost = THRONE_UPGRADE_COSTS[nextLevel];
        if (cost?.gold > 0) bill.Gold = Number(cost.gold);
      }
    } else {
      for (const [item, amount] of Object.entries(buildingCostForLevel(def, nextLevel))) {
        const key = item === 'gold' ? 'Gold' : item;
        if (Number(amount) > 0) bill[key] = (bill[key] || 0) + Number(amount);
      }
    }

    try {
      await spendResources(chat_id, bill);
    } catch (err) {
      const short = shortfallItem(err);
      if (short) {
        return res.status(400).json({ error: `Not enough ${short.replace('Crystals_', '')}` });
      }
      throw err;
    }

    buildings[slot] = { level: nextLevel, building_id };

    const updated = await supabase(`/structures?id=eq.${record.id}`, { method: 'PATCH', body: JSON.stringify({ buildings_data: buildings }) });
    if (isNew && def.unit_id && slotCategory !== 'throne') {
      const unitDef = getUnitByDataId(def.unit_id);
      if (unitDef) {
        await supabase('/roster', { method: 'POST', body: JSON.stringify([{ chat_id, unit_data: makeUnitData(unitDef.id, slot), is_hero: false, calling: newCallingFor(faction) }]) });
      }
    }

    // The other half of the auto level-up: a unit may have been sitting on
    // enough XP for a while, waiting only on this building. Upgrading the slot
    // is what unblocks it, so check now rather than making the player go to the
    // roster and press a button that can only have one outcome. Scoped to the
    // occupants of this slot (plus the hero, whom the throne gates).
    let autoLeveled = [];
    try {
      const rosterRows = await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero,engraving,calling,devotion`);
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
      supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
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
    // Two things can leave the battle parked on a turn nobody will take: a clock
    // that ran out, and a unit that has no action. Both are resolved by whoever
    // reads next, and only written back if something actually moved.
    if (isClockedRecord(record)) {
      const expired = applyExpiredTurns(record, engine);
      // A bot answers the defended turn straight away; a person answers in theirs.
      if (expired && isBotRecord(record)) answerTurns(record, engine);
      const idle    = isPvpRecord(record) && engine.runIdleTurns() > 0;
      if (expired || idle) {
        record = await persistPvpTurn(record, engine, { causedBy: null });
        engine = record._engine || engine;
      } else {
        // Nothing moved, but this may be the arrival that starts the clock.
        const stamped = stampFirstDeadline(record, engine, chat_id);
        if (stamped) {
          await updateBattleState(battle_id, stamped);
          record = { ...record, battle_data: stamped };
        }
      }
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
      kind:      isClockedRecord(record) ? 'pvp' : 'pve',
      // Whose move it is, and how long they have left — the client needs both to
      // draw the countdown without inventing a clock of its own. See the note on
      // your_turn in POST /battle/action for why this is a boolean.
      your_turn:     !bd.done && engine.currentActor()?.side === battleSideFor(record, chat_id),
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

    // The level has to be UNLOCKED, not merely real. The checks above only
    // establish that the region and level exist, so a request naming level 10 on
    // a fresh account was accepted and paid out at level 10 rates — the whole
    // progression skipped, from the client that never offers it.
    //
    // `progress[region_id]` is the next level available, defaulting to 1, and it
    // is advanced by /battle/reward on a first clear. A finished region reads
    // maxLevel + 1, so replaying the last level still passes. This is the same
    // bound the embark screen clamps its level pips to (see embark.js) — the
    // difference is that this one is the authority.
    const player = await getPlayerByChatId(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const unlocked = Number(player.progress?.[region_id] ?? 1);
    if (Number(level) > unlocked) {
      return res.status(400).json({ error: 'That level is not unlocked yet', code: 'level_locked' });
    }

    const [rawRoster, hpBonus] = await Promise.all([
      supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero,engraving,calling,devotion`),
      unitHpBonusFor(chat_id),
    ]);
    const rosterRows = withBonusHp(rawRoster, hpBonus);
    const rosterById = {};
    for (const r of rosterRows) rosterById[String(r.id)] = r;

    const itemsByRosterId = await getItemsByRosterIds(rosterRows.map(r => r.id));

    const playerUnits = [];
    let   heroRosterId = null;
    const seenRosterIds = new Set();
    for (const entry of playerUnitIds) {
      const rosterId = String(entry._rosterId || entry.id);
      const r = rosterById[rosterId];
      if (!r) return res.status(400).json({ error: `Roster unit ${rosterId} not found or does not belong to this player` });
      if (seenRosterIds.has(rosterId)) return res.status(400).json({ error: `Roster unit ${rosterId} is listed twice` });
      seenRosterIds.add(rosterId);
      if (r.is_hero) heroRosterId = rosterId;
      playerUnits.push(buildPlayerUnitFromRosterEntry(r, entry, itemsByRosterId));
    }

    const invalidSquad = checkSquad(playerUnits);
    if (invalidSquad) return res.status(400).json({ error: invalidSquad.error });

    const enemies = getEncounter(region_id, level);
    if (!enemies.length) return res.status(400).json({ error: 'No enemies for this region/level' });

    const engine = await BattleEngine.fromSetup(playerUnits, enemies, placement);
    engine.litaniesUnlocked = await litaniesUnlockedFor(chat_id);

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

    // THE EMBARK GATE. One supply per region embark, charged here and nowhere
    // else — this route is reached only from the embark screen (the Colossus
    // goes through /colossus/attack and the arena through the queue), so
    // charging it here is what makes PvP, the Colossus and the tourney free.
    //
    // Charged at the LAST possible moment before the battle exists. Everything
    // above is validation and pure engine work with no side effects, so a squad
    // that fails checkSquad or a level that is not unlocked costs nothing; a
    // player who is charged is a player who got a battle.
    //
    // Flat, regardless of region or level. A tier-3 army spending its supply on
    // level 1 is wasting it, and that is the whole mechanism: the resource is
    // scarce, so where it is spent becomes a decision.
    const supplyItem = supplyItemName(player.faction);
    if (supplyItem) {
      try {
        await spendResources(chat_id, { [supplyItem]: EMBARK_SUPPLY_COST });
      } catch (err) {
        if (shortfallItem(err)) {
          return res.status(400).json({
            error: `Out of ${supplyItem}`,
            code:  'no_supplies',
            item:  supplyItem,
          });
        }
        throw err;
      }
    }

    let record;
    try {
      record = await createBattleState({ chat_id, battle_id, battle_data });
    } catch (err) {
      // The supply was taken for a battle that does not exist. Hand it back
      // rather than leaving the player short for something they never got.
      if (supplyItem) {
        try {
          await grantResources(chat_id, [{ item: supplyItem, amount: EMBARK_SUPPLY_COST, item_type: SUPPLY_ITEM_TYPE }]);
        } catch (refundErr) {
          console.error('Failed to refund supply after battle create failed:', refundErr);
        }
      }
      throw err;
    }
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

    // The cast landed, so it counts toward the day. Power is 1-5; only a real
    // investment qualifies. Not awaited — see bumpDailyTask.
    if (Number(power) >= 3) bumpDailyTask(chat_id, 'spells');

    // Block 2 of the Temple's page, the hero's version of it (data/callings.js).
    // ANY power counts here: the block asks for ten spells, not ten good ones,
    // and the daily task above is what rewards the investment. Battle casts
    // only - the roster's out-of-combat heal and raise go through their own
    // routes, and a bulk restore would otherwise bank the whole party as casts.
    if (hero._rosterId != null) {
      bumpDevotion(chat_id, { [String(hero._rosterId)]: { spells: 1 } })
        .catch(err => console.error('spell devotion bump failed:', err.message));
    }

    // The enemy answers immediately, exactly as after any other hero action —
    // unless the enemy is a player, who answers in their own time. Either way,
    // turns nobody can take are spent rather than waited on.
    answerTurns(record, engine);

    const battle_data = await withTourneyResult(
      record, withTurnDeadline(buildBattleData(engine, record.battle_data), record, engine));
    const newEntries  = engine.log;   // see freshLog

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
    res.json({
      ok: true, done: engine.done, winner: view.winner, logs: view.logs, state: view.state,
      // The clock for the turn this action just handed over, so the acting
      // client starts counting from the same instant the server does.
      kind:          isClockedRecord(record) ? 'pvp' : 'pve',
      turn_deadline: battle_data.turn_deadline ?? null,
      // A BOOLEAN, not a side. Sides are absolute in storage and mirrored in the
      // opponent's view, so handing the client either frame's label invites it to
      // compare the wrong two things; whether it is your move is the same answer
      // from both chairs.
      your_turn:     !engine.done && engine.currentActor()?.side === battleSideFor(record, chat_id),
    });
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
      answerTurns(record, engine);
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
    // them, rather than answering on their behalf — but only at a turn somebody
    // can actually take.
    answerTurns(record, engine);

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

    const battle_data = await withTourneyResult(
      record, withTurnDeadline(buildBattleData(engine, record.battle_data), record, engine));

    const newEntries = engine.log;   // see freshLog

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
    res.json({
      ok: true, done: engine.done, winner: view.winner, logs: view.logs, state: view.state,
      // The clock for the turn this action just handed over, so the acting
      // client starts counting from the same instant the server does.
      kind:          isClockedRecord(record) ? 'pvp' : 'pve',
      turn_deadline: battle_data.turn_deadline ?? null,
      // A BOOLEAN, not a side. Sides are absolute in storage and mirrored in the
      // opponent's view, so handing the client either frame's label invites it to
      // compare the wrong two things; whether it is your move is the same answer
      // from both chairs.
      your_turn:     !engine.done && engine.currentActor()?.side === battleSideFor(record, chat_id),
    });
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
  // Only the 'player' side is gated, and in a duel that side is A's army. B
  // fights from the 'enemy' side, which is ungated by design — see fireLitany.
  engine.litaniesUnlocked = await litaniesUnlockedFor(a.chat_id);

  engine.firePendingRoundEffects();
  // Deliberately NO runAiTurns: both sides are people, and the first turn
  // belongs to whichever unit initiative gives it to. Units that have no turn to
  // take are still spent here — a Mithrails Will winning initiative would
  // otherwise freeze the duel on round one, with neither player able to act and
  // only the turn clock to break the deadlock.
  engine.runIdleTurns();

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
    // Null for a quick match. Present, this battle counts toward that tourney
    // for BOTH players — they queued into the same one.
    tourney_id:     a.tourney_id ?? b.tourney_id ?? null,
    // Deliberately null: the first turn is clocked from when its player has the
    // board in front of them, not from when the pairing happened. Getting told
    // about a duel and loading into it cost one player twenty seconds of their
    // own first turn.
    turn_deadline:  null,
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

  // Counted at the START, for both sides: a player who walks out of a losing
  // fight has still spent one of their five.
  if (battle_data.tourney_id) {
    await Promise.all([a, b].map(p =>
      countTourneyBattle(battle_data.tourney_id, p.chat_id)
        .catch(err => console.error('Tourney battle count failed:', err.message))));
  }

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

// ── Faction Colossus ────────────────────────────────────────────────────────
// A weekly boss per faction with a shared HP pool (data/colossus.js,
// sql/colossus.sql). Each attempt is one battle; whatever it takes off the boss
// comes off the pool when the battle is claimed or abandoned.

// This week's three bosses, created on first sight. Insert-or-ignore on the
// (week_start, faction) key, so two first visitors cannot make two bosses.
async function ensureColossusWeek(weekStart) {
  const read = () => supabase(`/colossus_instances?week_start=eq.${weekStart}&select=*`);
  const rows = await read();
  const missing = VALID_FACTIONS.filter(f => !rows.some(r => r.faction === f));
  if (!missing.length) return rows;
  await supabase('/colossus_instances?on_conflict=week_start,faction', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify(missing.map(faction => ({
      week_start: weekStart, faction, max_hp: COL.COLOSSUS_MAX_HP, hp: COL.COLOSSUS_MAX_HP,
    }))),
  });
  return read();
}

// Roster ids resting on the player's local `day`.
async function colossusRestingIds(chat_id, day) {
  const rows = await supabase(
    `/colossus_exhaustion?chat_id=eq.${encodeURIComponent(chat_id)}&day=eq.${day}&select=roster_id`
  );
  return new Set(rows.map(r => String(r.roster_id)));
}

// Kill rewards owed to this player from any killed boss they hit, this week or
// an earlier one. Each is claimed by a filtered PATCH, so a double request pays once.
async function claimColossusKillRewards(player) {
  const chat_id = String(player.chat_id);
  const owed = await supabase(
    `/colossus_contributions?chat_id=eq.${encodeURIComponent(chat_id)}&kill_reward_claimed=eq.false&damage=gt.0`
    + `&select=instance_id,colossus_instances!inner(week_start,faction,killed_at)`
    + `&colossus_instances.killed_at=not.is.null`
  );
  const paid = [];
  for (const row of owed) {
    const claimed = await supabase(
      `/colossus_contributions?instance_id=eq.${row.instance_id}&chat_id=eq.${encodeURIComponent(chat_id)}&kill_reward_claimed=eq.false`,
      { method: 'PATCH', body: JSON.stringify({ kill_reward_claimed: true }) }
    );
    if (!claimed.length) continue;
    const grants = COL.colossusGrants(COL.COLOSSUS_KILL_REWARD, FACTION_CRYSTAL[player.faction]);
    await grantResources(chat_id, grants);
    paid.push({ faction: row.colossus_instances.faction, week_start: row.colossus_instances.week_start, grants });
  }
  return paid;
}

// Apply what an attempt dealt, then pay any damage milestones it passed.
async function settleColossusAttempt(record) {
  const bd  = record.battle_data || {};
  const col = bd.colossus;
  if (!col) return null;
  const chat_id = String(record.chat_id);

  const boss  = (bd.units || []).find(u => u.side === 'enemy');
  const endHp = Math.max(0, Number(boss?.battle_hp ?? col.start_hp));
  const dealt = Math.max(0, col.start_hp - endHp);
  // The phase the attempt ENDED in. Phases move mid-battle now (see
  // maybeAdvancePhases), so `col.phase` is only where the fight opened — a player
  // who pushed the pool across a threshold deserves to be told they did.
  const endPhase = Number(boss?._phase) || col.phase;

  const [row] = await rpc('colossus_apply_damage', {
    p_instance_id: col.instance_id, p_chat_id: chat_id, p_damage: dealt,
  });
  if (!row) return null;

  if (row.killed) {
    await supabase(`/colossus_instances?id=eq.${col.instance_id}`, {
      method: 'PATCH', body: JSON.stringify({ season_points: COL.COLOSSUS_KILL_POINTS[row.kill_rank] ?? 0 }),
    }).catch(err => console.error('Colossus season points write failed:', err.message));
  }

  const player  = await getPlayerByChatId(chat_id);
  const crystal = FACTION_CRYSTAL[player?.faction];
  const milestones = COL.colossusMilestonesCrossed(row.damage_before, row.damage_after)
    .map(m => ({ damage: m.damage, grants: COL.colossusGrants(m.rewards, crystal) }));
  const grants = milestones.flatMap(m => m.grants);
  if (grants.length) await grantResources(chat_id, grants);

  return {
    dealt,
    applied:    row.applied,
    hp_left:    row.hp_left,
    max_hp:     COL.COLOSSUS_MAX_HP,
    killed:     row.killed,
    kill_rank:  row.kill_rank,
    phase:      col.phase,
    end_phase:  endPhase,
    week_total: row.damage_after,
    milestones,
  };
}

// GET /colossus — everything the Colossus page shows, and any kill rewards
// owed, paid on the way.
router.get('/colossus', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const player = await getPlayerByChatId(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (!player.faction) return res.status(400).json({ error: 'Choose a faction first', code: 'no_faction' });

    const week      = COL.colossusWeek();
    const instances = await ensureColossusWeek(week.weekStart);
    const mine      = instances.find(i => i.faction === player.faction);
    if (!mine) return res.status(500).json({ error: 'Colossus not found for this faction' });

    const [contribs, resting, kill_rewards] = await Promise.all([
      supabase(`/colossus_contributions?instance_id=in.(${instances.map(i => i.id).join(',')})&damage=gt.0&select=instance_id,chat_id,damage,attempts&order=damage.desc`),
      colossusRestingIds(chat_id, playerLocalDate(player.timezone)),
      claimColossusKillRewards({ ...player, chat_id }).catch(err => {
        console.error('Colossus kill reward claim failed:', err.message);
        return [];
      }),
    ]);

    // Each faction's hitters, strongest first. The top five are shown, plus the
    // player's own row when it falls below them.
    const TOP_SHOWN  = 5;
    const isMe       = c => String(c.chat_id) === String(chat_id);
    const byInstance = new Map(instances.map(i => [i.id, contribs.filter(c => c.instance_id === i.id)]));
    const mineList   = byInstance.get(mine.id) || [];
    const myIndex    = mineList.findIndex(isMe);
    const myRow      = myIndex >= 0 ? mineList[myIndex] : null;
    const shownFor   = list => {
      const shown = list.slice(0, TOP_SHOWN);
      const meAt  = list.findIndex(isMe);
      if (meAt >= TOP_SHOWN) shown.push(list[meAt]);
      return shown;
    };

    // Names only. chat_id is a real Telegram id and never leaves the server.
    const shownIds = [...new Set(instances.flatMap(i => shownFor(byInstance.get(i.id) || [])).map(c => String(c.chat_id)))];
    const names = {};
    if (shownIds.length) {
      const list = shownIds.map(id => `"${id}"`).join(',');
      const rows = await supabase(`/players?chat_id=in.(${encodeURIComponent(list)})&select=chat_id,username`);
      for (const r of rows) names[String(r.chat_id)] = r.username;
    }

    const order  = [player.faction, ...VALID_FACTIONS.filter(f => f !== player.faction)];
    const bosses = order.map(f => instances.find(i => i.faction === f)).filter(Boolean).map(i => {
      const list = byInstance.get(i.id) || [];
      return {
        faction:      i.faction,
        max_hp:       i.max_hp,
        hp:           i.hp,
        phase:        COL.colossusPhaseFor(i.hp, i.max_hp).id,
        killed_at:    i.killed_at,
        kill_rank:    i.kill_rank,
        contributors: list.length,
        attempts:     list.reduce((sum, c) => sum + (c.attempts || 0), 0),
        top: shownFor(list).map(c => ({
          rank:   list.indexOf(c) + 1,
          name:   names[String(c.chat_id)] || null,
          damage: c.damage,
          me:     isMe(c),
        })),
      };
    });

    const damage = myRow?.damage ?? 0;
    res.json({
      week:      { week_start: week.weekStart, resets_at: week.resetsAt },
      faction:   player.faction,
      bosses,
      boss:      mine.killed_at ? null : COL.buildColossusBoss(mine.hp),
      me: {
        damage,
        attempts:       myRow?.attempts ?? 0,
        rank:           myRow ? myIndex + 1 : null,
        next_milestone: COL.COLOSSUS_MILESTONES.find(m => m.damage > damage) ?? null,
      },
      resting_roster_ids: [...resting],
      kill_rewards,
    });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /colossus/rest/refresh — send resting units back in today, for a price.
//
// A follower rests for the rest of the player's local day after an attempt, which
// is what stops one strong squad farming the boss. This does not lift that: it
// buys it off one unit at a time, at COLOSSUS_REST_REFRESH each, so a second
// attempt costs real resources rather than nothing.
//
// Order matters here. The DELETE is filtered on the rows still existing and
// returns what it actually removed, which makes it the claim: two taps on the
// same unit delete it once, and the second is charged for nothing. Balances are
// therefore checked BEFORE it, so the common case cannot charge for a refresh it
// did not deliver — the reverse order would wake the units and then discover the
// player was short.
router.post('/colossus/rest/refresh', requireAuth, async (req, res) => {
  const { chat_id, roster_ids } = req.body;
  if (!chat_id || !Array.isArray(roster_ids) || !roster_ids.length) {
    return res.status(400).json({ error: 'chat_id and roster_ids required' });
  }
  try {
    const player = await getPlayerByChatId(chat_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const today   = playerLocalDate(player.timezone);
    const resting = await colossusRestingIds(chat_id, today);
    // Only units that are actually resting today are billable. Anything else in
    // the list is silently dropped rather than paid for.
    const wanted = [...new Set(roster_ids.map(String))].filter(id => resting.has(id));
    if (!wanted.length) {
      return res.status(400).json({ error: 'No resting units in that list', code: 'colossus_not_resting' });
    }

    const bill = COL.colossusRefreshBill(wanted.length);
    const held = await supabase(
      `/resources?chat_id=eq.${encodeURIComponent(chat_id)}&item=in.(${encodeURIComponent(Object.keys(bill).map(i => `"${i}"`).join(','))})&select=item,amount`
    );
    const have = item => Number(held.find(r => r.item === item)?.amount) || 0;
    const short = Object.entries(bill).find(([item, amount]) => have(item) < amount);
    if (short) {
      return res.status(400).json({
        error: `Not enough ${short[0]}`, code: 'colossus_refresh_short', item: short[0],
        needed: short[1], held: have(short[0]),
      });
    }

    const removed = await supabase(
      `/colossus_exhaustion?chat_id=eq.${encodeURIComponent(chat_id)}&day=eq.${today}`
      + `&roster_id=in.(${encodeURIComponent(wanted.map(id => `"${id}"`).join(','))})`,
      { method: 'DELETE' }   // supabase() already asks for return=representation
    );
    const refreshed = (removed || []).map(r => String(r.roster_id));
    if (!refreshed.length) {
      return res.status(400).json({ error: 'Those units are no longer resting', code: 'colossus_not_resting' });
    }

    // Charged for what was actually woken, never for the whole list.
    try {
      await spendResources(chat_id, COL.colossusRefreshBill(refreshed.length));
    } catch (err) {
      // The units are already awake. Losing the charge is the lesser of the two
      // failures, but it must be visible rather than silent.
      console.error(`Colossus refresh charge FAILED after waking ${refreshed.join(', ')} for ${chat_id}:`, err.message);
      if (!shortfallItem(err)) throw err;
    }

    res.json({
      success: true,
      refreshed,
      paid: COL.colossusRefreshBill(refreshed.length),
      resting_roster_ids: [...await colossusRestingIds(chat_id, today)],
    });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /colossus/attack — start an attempt with the formation from battle prep.
router.post('/colossus/attack', requireAuth, async (req, res) => {
  const { chat_id, playerUnitIds, placement } = req.body;
  if (!chat_id || !Array.isArray(playerUnitIds) || !playerUnitIds.length || playerUnitIds.length > 6
      || !placement || typeof placement !== 'object') {
    return res.status(400).json({ error: 'chat_id, playerUnitIds (1-6) and placement required' });
  }
  try {
    const existing = await getActiveBattle(chat_id);
    if (existing) return res.status(400).json({ error: 'A battle is already in progress', code: 'battle_in_progress' });

    const player = await getPlayerByChatId(chat_id);
    if (!player?.faction) return res.status(400).json({ error: 'Choose a faction first', code: 'no_faction' });

    const week      = COL.colossusWeek();
    const instances = await ensureColossusWeek(week.weekStart);
    const mine      = instances.find(i => i.faction === player.faction);
    if (!mine || mine.killed_at || mine.hp <= 0) {
      return res.status(400).json({ error: 'Your faction has already slain this week\'s Colossus', code: 'colossus_killed' });
    }

    const squad = await loadSquad(chat_id, playerUnitIds);
    if (squad.error) return res.status(400).json({ error: squad.error, code: 'invalid_squad' });

    // The hero leads every attempt, so only its followers rest. Resting the hero
    // too would make one attempt a day the whole allowance.
    const today   = playerLocalDate(player.timezone);
    const resting = await colossusRestingIds(chat_id, today);
    if (squad.units.some(u => !u.is_hero && resting.has(String(u._rosterId)))) {
      return res.status(400).json({ error: 'A unit in this squad has already fought the Colossus today', code: 'colossus_unit_resting' });
    }

    // Everyday HP never gates this: every unit enters whole.
    const playerUnits = squad.units.map(u => {
      const maxHp = Number(u.unit_data?.max_hp ?? u.unit_data?.hp) || undefined;
      return { ...u, unit_data: { ...u.unit_data, current_hp: maxHp, alive: true } };
    });

    const boss = COL.buildColossusBoss(mine.hp);
    if (!boss) return res.status(500).json({ error: 'Colossus unit is missing from data/units.js' });

    const engine = await BattleEngine.fromSetup(playerUnits, cloneArmy([boss]), placement);
    engine.litaniesUnlocked = await litaniesUnlockedFor(chat_id);
    engine.firePendingRoundEffects();
    if (!engine.done) engine.runAiTurns();

    const battle_id = `colossus_${chat_id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const battle_data = buildBattleData(engine, {
      region_id: null,
      level:     null,
      selected_spells: [],
      setup: {
        playerUnitIds: playerUnits.map(u => ({ id: u.id, _rosterId: u._rosterId })),
        placement,
      },
      colossus: {
        instance_id: mine.id,
        week_start:  week.weekStart,
        faction:     player.faction,
        phase:       boss.phase,
        start_hp:    boss.current_hp,
        boss,
      },
    });

    const record = await createBattleState({ chat_id: String(chat_id), battle_id, battle_data, battle_kind: 'colossus' });

    // Rested once the attempt exists, so a failed start costs nothing, and
    // before any result, so abandoning the attempt does not hand the units back.
    const restRows = playerUnits
      .filter(u => !u.is_hero)
      .map(u => ({ chat_id: String(chat_id), day: today, roster_id: String(u._rosterId) }));
    if (restRows.length) {
      await supabase('/colossus_exhaustion?on_conflict=chat_id,day,roster_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(restRows),
      });
    }

    let initialLogs = [];
    try {
      const initialEvents = Array.isArray(engine.log) ? engine.log : [];
      if (initialEvents.length) {
        const inserted = await appendBattleLogEntries(battle_id, initialEvents);
        initialLogs = (inserted || []).map(row => ({ id: row.id, ...row.event }));
      }
    } catch (err) {
      console.error('Failed to persist initial Colossus log:', err);
    }

    res.json({ record, battle_id, state: engine.getSnapshot(), logs: initialLogs });
  } catch (err) {
    serverError(res, err);
  }
});

// ── PvP: bots ───────────────────────────────────────────────────────────────
// Nobody to fight within BOT_FALLBACK_MS: a hand-made template army from
// data/bot_templates.js takes the enemy side. The player keeps the duel's
// turn clock; the bot moves inside the player's own requests, as a region
// encounter does.

const BOT_FALLBACK_MS = 30000;

// The template ids of this player's last bot battles, newest first, for faction
// rotation. Read from the records so a restart does not reset it.
async function recentBotTemplateIds(chat_id) {
  try {
    const rows = await supabase(
      `/battle_state?chat_id=eq.${encodeURIComponent(chat_id)}&battle_kind=eq.pvp_bot`
      + `&select=template_id:battle_data->bot->>template_id&order=created_at.desc&limit=5`
    );
    return rows.map(r => r.template_id).filter(Boolean);
  } catch (err) {
    console.error('Bot history read failed (rotating without it):', err.message);
    return [];
  }
}

function botOpponentCard(template) {
  return { name: template.name || template.id, faction: template.faction, bot: true };
}

async function createBotBattle(entry, { template, bandId, rules = null }) {
  const battle_id = `pvpbot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Under the same rules the player queued under: the army the rule check passed
  // is the army that takes the field, so the bot cannot field gear or a Loyalty
  // bill the player was forbidden to bring.
  const army = buildBotArmy(template, bandId, rules);
  if (!army.length) throw new Error(`Bot template ${template.id} has no units for ${bandId}`);

  const playerUnits = await buildArmyFor(entry.chat_id, entry.formation.playerUnitIds);
  const placement   = entry.formation.placement || {};

  const engine = await BattleEngine.fromSetup(playerUnits, cloneArmy(army), placement);
  engine.litaniesUnlocked = await litaniesUnlockedFor(entry.chat_id);
  engine.firePendingRoundEffects();
  // The bot may hold the first turn; it takes it now, as a region encounter does.
  if (!engine.done) engine.runAiTurns();

  const battle_data = {
    ...buildBattleData(engine, {
      region_id: null,
      level:     null,
      selected_spells: [],
      setup: {
        playerUnitIds: playerUnits.map(u => ({ id: u.id, _rosterId: u._rosterId })),
        placement,
      },
      bot: { template_id: template.id, band: bandId, faction: template.faction, name: template.name || template.id, army },
    }),
    kind:          'pvp_bot',
    mode:          entry.mode || 'pvp_quick',
    tourney_id:    entry.tourney_id ?? null,
    turn_deadline: null,   // started when the player loads the board, see stampFirstDeadline
    turn_ms:       PVP_TURN_MS,
  };

  const record = await createBattleState({
    chat_id: String(entry.chat_id),
    battle_id,
    battle_data,
    battle_kind: 'pvp_bot',
  });

  if (battle_data.tourney_id) {
    await countTourneyBattle(battle_data.tourney_id, entry.chat_id)
      .catch(err => console.error('Tourney battle count failed:', err.message));
  }

  try {
    const initialEvents = Array.isArray(engine.log) ? engine.log : [];
    if (initialEvents.length) await appendBattleLogEntries(battle_id, initialEvents);
  } catch (err) {
    console.error('Failed to persist initial bot battle log:', err);
  }

  return { record, battle_id };
}

// Hand everyone who has waited past BOT_FALLBACK_MS a bot. Called from
// runMatchmaking after human pairs, so a person who turns up in time still wins.
async function assignBots() {
  // Both queues: nobody should sit out their tourney evening because the other
  // entrants happen to be between battles.
  const waiting = [
    ...pvpQueue.overdue(BOT_FALLBACK_MS, 'pvp_quick'),
    ...pvpQueue.overdue(BOT_FALLBACK_MS, TOURNEY_MODE),
  ];
  for (const entry of waiting) {
    const recent = await recentBotTemplateIds(entry.chat_id);
    // The read above is a window: the player may have left, re-queued or been paired.
    if (pvpQueue.get(entry.chat_id) !== entry) continue;

    // In a tourney the bot fights under the same rules as the player. The army is
    // ADAPTED to them first (adaptSlotsToRules) and only then checked, so a rule
    // about gear or Loyalty costs the bot what it costs the player instead of
    // striking the template off the list. What survives the check is what fights.
    let allow = null;
    let rules = null;
    if (entry.tourney_id) {
      rules = await tourneyRulesFor(entry.tourney_id);
      if (rules?.length) {
        allow = (template, bandId) => {
          const squad = botArmyAsSquad(template, bandId, rules);
          return squad.units.length > 0
            && checkTourneyRules(squad.units, rules, { itemsByRosterId: squad.itemsByRosterId }).length === 0;
        };
      } else {
        rules = null;
      }
    }

    const picked = pickBotTemplate({ power: entry.power, recent, allow });
    if (!picked) {
      // Nothing in any band can field a legal army. That is a content hole, not a
      // quiet no-op: without this the player sits in the queue for the rest of the
      // evening waiting for an opponent that is never offered.
      console.error(`[pvp] no legal bot for ${entry.chat_id} (⚔ ${entry.power})`
        + `${rules ? ` under ${rules.join(', ')}` : ''}: keeping them queued for a person`);
      continue;
    }

    pvpQueue.leave(entry.chat_id);
    markPairing(entry.chat_id);
    try {
      const created = await createBotBattle(entry, { ...picked, rules });
      await clearQueueRows([entry.chat_id]);
      const card = botOpponentCard(picked.template);
      noteMatch(entry.chat_id, created.battle_id, card);
      const delivered = battleBus.publish(pvpRoom(entry.chat_id), {
        status: 'matched', mode: entry.mode, opponent: card, battle_id: created.battle_id,
      }, { event: 'pvp' });
      console.log(`[pvp] bot ${picked.template.id}/${picked.bandId} -> ${entry.chat_id} (⚔ ${entry.power}): delivered to ${delivered} stream(s)`);
    } catch (err) {
      console.error('Failed to build a bot duel:', err);
      clearPairing(entry.chat_id);
      battleBus.publish(pvpRoom(entry.chat_id), { status: 'failed' }, { event: 'pvp' });
      await clearQueueRows([entry.chat_id]);
    }
  }
}


// ── Crown Tourney ──────────────────────────────────────────────────────────
// The tourney rows themselves are created and announced by a Supabase cron
// (supabase/functions/tourney-notify) and paid out by the same function when the
// window closes. This server only READS them, and writes what players do:
// entering, and the result of each battle.

async function openTourney() {
  const now = new Date().toISOString();
  const rows = await supabase(
    `/tourneys?starts_at=lte.${now}&ends_at=gt.${now}&select=*&order=starts_at.asc&limit=1`
  );
  return rows[0] || null;
}

async function nextTourney() {
  const now = new Date().toISOString();
  const rows = await supabase(`/tourneys?starts_at=gt.${now}&select=*&order=starts_at.asc&limit=1`);
  return rows[0] || null;
}

// The rules of one tourney, remembered for the evening: the bot fallback asks
// for them on every assignment, and they never change once the row exists.
const tourneyRuleCache = new Map();
async function tourneyRulesFor(tourney_id) {
  const hit = tourneyRuleCache.get(String(tourney_id));
  if (hit) return hit;
  const rows = await supabase(`/tourneys?id=eq.${tourney_id}&select=rules&limit=1`);
  const rules = rows[0]?.rules || [];
  tourneyRuleCache.set(String(tourney_id), rules);
  return rules;
}

async function tourneyEntry(tourney_id, chat_id) {
  const rows = await supabase(
    `/tourney_entries?tourney_id=eq.${tourney_id}&chat_id=eq.${encodeURIComponent(chat_id)}&select=*&limit=1`
  );
  return rows[0] || null;
}

// Created when the player QUEUES, not when they look at the screen — the gate
// below needs a row to read `battles` from. A row is therefore not proof of
// having played, so the payout pays on `battles > 0` rather than on existence.
async function ensureTourneyEntry(tourney_id, chat_id) {
  const existing = await tourneyEntry(tourney_id, chat_id);
  if (existing) return existing;
  const rows = await supabase('/tourney_entries', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ tourney_id, chat_id: String(chat_id) }),
  });
  return rows?.[0] || (await tourneyEntry(tourney_id, chat_id));
}

// A battle is counted the moment it STARTS. Otherwise walking out of a losing
// fight would cost nothing and five battles would mean five wins or nothing.
// The compare-and-set can lose a race, and losing it silently would hand the
// player a free sixth battle, so a miss re-reads and tries once more.
async function countTourneyBattle(tourney_id, chat_id) {
  let entry = await ensureTourneyEntry(tourney_id, chat_id);
  for (let attempt = 0; entry && attempt < 3; attempt++) {
    const rows = await supabase(
      `/tourney_entries?tourney_id=eq.${tourney_id}&chat_id=eq.${encodeURIComponent(chat_id)}&battles=eq.${entry.battles}`, {
        method: 'PATCH',
        body: JSON.stringify({ battles: entry.battles + 1 }),
        headers: { Prefer: 'return=representation' },
      });
    if (rows?.[0]) return rows[0];
    entry = await tourneyEntry(tourney_id, chat_id);
  }
  console.error(`Tourney battle count lost the race: ${tourney_id} / ${chat_id}`);
  return null;
}

// The result of one tourney battle. Points, how many of their units fell, and
// when they finished — the three the standings sort on.
async function recordTourneyResult(tourney_id, chat_id, { won, unitsLost, forfeited = false }) {
  const entry = await tourneyEntry(tourney_id, chat_id);
  if (!entry) return null;
  const points = forfeited ? TOURNEY_POINTS.forfeit : (won ? TOURNEY_POINTS.win : TOURNEY_POINTS.loss);
  await supabase(
    `/tourney_entries?tourney_id=eq.${tourney_id}&chat_id=eq.${encodeURIComponent(chat_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        points:      (entry.points || 0) + points,
        wins:        (entry.wins || 0) + (won ? 1 : 0),
        units_lost:  (entry.units_lost || 0) + unitsLost,
        finished_at: new Date().toISOString(),
      }),
    });
  return { points, won };
}

function unitsLostFor(battle_data, side) {
  return (battle_data?.units || [])
    .filter(u => u.side === side && (u.alive === false || Number(u.battle_hp) <= 0))
    .length;
}

// Called the moment a tourney battle FINISHES, from whichever write saw it
// finish — not when the reward is claimed.
//
// The claim was the wrong moment for it. A battle is counted at the start and
// scored at the end, and between those two points sits everything that can stop
// a player reaching the result screen: closing the app on the victory banner,
// a dropped connection, the second player in a duel never coming back. Every one
// of those left a battle on the board with no result against it. Scoring where
// the battle ends needs nothing from the player at all.
//
// `battle_data` is the state about to be written, so the dead are counted from
// the same snapshot the players are looking at. Returns the chat_ids settled by
// this call, for `tourney_settled`: the caller stamps them onto the row so a
// second write of a finished battle cannot score it twice.
async function settleTourneyBattle(record, battle_data) {
  const tourney_id = battle_data?.tourney_id;
  if (!tourney_id || !battle_data.done) return [];

  // Both players in a duel, scored from one request: the loser is not asked to
  // come and collect their point. A bot duel has one owner.
  const sides = [[record.chat_id, 'player']];
  if (record.opponent_chat_id) sides.push([record.opponent_chat_id, 'enemy']);

  const already = battle_data.tourney_settled || [];
  const settled = [];
  for (const [chat_id, side] of sides) {
    if (!chat_id || already.includes(String(chat_id))) continue;
    try {
      // A concession is neither a win nor a played-out loss: TOURNEY_POINTS
      // scores a forfeit 0, so walking out cannot pay the same as staying in a
      // fight that is going badly.
      const forfeited = String(battle_data.abandoned_by || '') === String(chat_id);
      await recordTourneyResult(tourney_id, chat_id, {
        won:       !forfeited && battle_data.winner === side,
        forfeited,
        unitsLost: unitsLostFor(battle_data, side),
      });
      settled.push(String(chat_id));
    } catch (err) {
      console.error(`Tourney result failed for ${chat_id}:`, err.message);
    }
  }
  return settled;
}

// Score a finished tourney battle onto `battle_data` before it is written, so
// the result and the mark that says it was scored land in the same row. Every
// path that persists a battle calls this; on the overwhelming majority of writes
// (a battle still running, or no tourney) it does nothing and returns its input.
async function withTourneyResult(record, battle_data) {
  if (!battle_data?.tourney_id || !battle_data.done) return battle_data;
  const settled = await settleTourneyBattle(record, battle_data);
  if (!settled.length) return battle_data;
  return {
    ...battle_data,
    tourney_settled: [...(battle_data.tourney_settled || []), ...settled],
  };
}

// Tonight's board: the top ten in tiebreaker order, which is the order the
// payout pays in — the player is looking at the same list that decides the
// podium, not a decoration.
//
// Only entries that have fought are on it: a row is created when a player
// queues, so an untouched one is somebody who looked and left.
//
// tourney_entries has no foreign key to players, so the names are a second
// read. It returns `name`, never chat_id — the same rule as pvpOpponentCard:
// that column is a real Telegram account id and does not belong in a browser.
// `you` is how the client finds the player's own row without one.
const TOURNEY_BOARD_LIMIT = 10;
async function tourneyStandings(tourney_id, chat_id) {
  const rows = await supabase(
    `/tourney_entries?tourney_id=eq.${tourney_id}&battles=gt.0`
    + `&select=chat_id,points,wins,battles,units_lost`
    + `&order=points.desc,units_lost.asc,finished_at.asc&limit=${TOURNEY_BOARD_LIMIT}`
  );
  if (!rows.length) return [];

  // A failed name read costs the names, not the board.
  const players = new Map();
  try {
    const list = rows.map(r => `"${String(r.chat_id)}"`).join(',');
    const found = await supabase(
      `/players?chat_id=in.(${encodeURIComponent(list)})&select=chat_id,username,faction`
    );
    for (const p of found) players.set(String(p.chat_id), p);
  } catch (err) {
    console.error('Tourney board names failed (continuing):', err.message);
  }

  return rows.map((r, i) => {
    const p = players.get(String(r.chat_id));
    return {
      place:      i + 1,
      name:       p?.username || null,
      faction:    p?.faction ?? null,
      points:     r.points || 0,
      wins:       r.wins || 0,
      battles:    r.battles || 0,
      units_lost: r.units_lost || 0,
      you:        String(r.chat_id) === String(chat_id),
    };
  });
}

// GET /tourney — what the arena card draws: the open tourney and the next one's
// rules (announced a day ahead), this player's entry, and tonight's board.
router.get('/tourney', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  try {
    const [live, next] = await Promise.all([openTourney(), nextTourney()]);
    const entry = live ? await tourneyEntry(live.id, chat_id) : null;
    const standings = live ? await tourneyStandings(live.id, chat_id) : [];

    res.json({
      tourney: live,
      next,
      battles_left: live ? Math.max(0, TOURNEY_BATTLES - (entry?.battles || 0)) : 0,
      entry,
      standings,
    });
  } catch (err) {
    serverError(res, err);
  }
});

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

// What one player is told about the other: their chosen display name and their
// faction, and nothing else.
//
// DELIBERATELY NOT chat_id. That column holds a real Telegram account id, and
// putting it in an opponent's browser would let anyone who queues a few times
// collect identifiers that are usable well outside this game. Nothing on the
// client needs it — whose turn it is comes back as the boolean `your_turn` from
// the battle endpoints, computed server-side where the seating is known.
async function pvpOpponentCard(chat_id) {
  try {
    const rows = await supabase(
      `/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=username,faction&limit=1`
    );
    return { name: rows[0]?.username || null, faction: rows[0]?.faction ?? null };
  } catch {
    return { name: null, faction: null };
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

// A match that has already happened, kept just long enough for both clients to
// find out about it. The SSE event is the fast path; this is what /pvp/status
// answers with when a client's stream was down — without it, a polling client
// sees itself gone from the queue and cannot tell "matched" from "dropped".
const recentMatches = new Map();   // chat_id -> { battle_id, at }
const RECENT_MATCH_MS = 2 * 60 * 1000;

// Players who have left the queue because they were paired, but whose duel is
// still being built.
//
// WHY: pairing removes both players from the queue map synchronously, and then
// awaits several Supabase writes to create the battle. For that whole window a
// player is in neither place — not queued, not yet matched — and a status poll
// landing in it answered "idle", which the client reads as "no opponent found"
// and gives up on. With polls every 1.5s and a creation taking about as long,
// this was easy to hit: one player walked into the duel while the other was told
// the queue had ended.
const pairing = new Set();
function markPairing(...chatIds) { for (const id of chatIds) pairing.add(String(id)); }
function clearPairing(...chatIds) { for (const id of chatIds) pairing.delete(String(id)); }

// The match a player was handed is theirs until they queue again or the battle
// ends. Forgetting it here is what stops the NEXT queue from being answered with
// the LAST battle: recentMatches is replayed to a connecting stream, so a player
// who finished a duel and re-queued inside the window was thrown straight back
// into the battle they had just claimed — which then refused its own reward.
function forgetMatch(chat_id) {
  recentMatches.delete(String(chat_id));
}

function noteMatch(chat_id, battle_id, opponent = null) {
  const now = Date.now();
  clearPairing(chat_id);
  for (const [id, m] of recentMatches) if (now - m.at > RECENT_MATCH_MS) recentMatches.delete(id);
  recentMatches.set(String(chat_id), { battle_id, opponent, at: now });
}

// Pair everyone who can now be paired, and build their duels.
//
// Runs on a timer as well as on every status poll, because the power bands
// widen with waiting: two players out of range when the second one queued come
// into range purely through time passing, and nothing else would ever look.
let matchmakingRunning = false;
async function runMatchmaking() {
  if (matchmakingRunning) return;          // one pass at a time; the next tick retries
  matchmakingRunning = true;
  try {
    pvpQueue.sweep();
    for (const { a, b } of pvpQueue.matchWaiting()) {
      // BEFORE the first await: matchWaiting has already taken both out of the
      // queue, so from here until noteMatch they exist only here.
      markPairing(a.chat_id, b.chat_id);
      try {
        // The one who waited longer creates, so seating is deterministic.
        const [first, second] = a.enqueuedAt <= b.enqueuedAt ? [a, b] : [b, a];
        const created = await createPvpBattle(first, second);
        await clearQueueRows([first.chat_id, second.chat_id]);

        for (const [me, them] of [[first, second], [second, first]]) {
          noteMatch(me.chat_id, created.battle_id);
          const card = await pvpOpponentCard(them.chat_id);
          const delivered = battleBus.publish(pvpRoom(me.chat_id), {
            status: 'matched', mode: me.mode, opponent: card, battle_id: created.battle_id,
          }, { event: 'pvp' });
          // 0 means nobody was listening: that player finds out on their next
          // poll, or when their stream reconnects and replays it. Worth seeing
          // in the log — it is the difference between an instant match and one
          // that takes a poll interval to land.
          console.log(`[pvp] match ${created.battle_id} -> ${me.chat_id}: delivered to ${delivered} stream(s)`);
        }
      } catch (err) {
        console.error('Failed to build a matched duel:', err);
        // Neither player is left believing in a duel that does not exist.
        clearPairing(a.chat_id, b.chat_id);
        for (const p of [a, b]) battleBus.publish(pvpRoom(p.chat_id), { status: 'failed' }, { event: 'pvp' });
        await clearQueueRows([a.chat_id, b.chat_id]);
      }
    }
    await assignBots();
  } finally {
    matchmakingRunning = false;
  }
}

// Unref'd: a queue nobody is in must not hold the process open.
const matchmakingTimer = setInterval(() => { runMatchmaking().catch(() => {}); }, 1500);
if (typeof matchmakingTimer.unref === 'function') matchmakingTimer.unref();

// POST /pvp/enqueue — join the queue with the formation just arranged in prep.
router.post('/pvp/enqueue', requireAuth, async (req, res) => {
  const { chat_id, mode = 'pvp_quick', formation } = req.body;
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

    // Whatever this player was matched into before, they are asking for a NEW
    // opponent now.
    forgetMatch(chat_id);

    const squad = await loadSquad(chat_id, units);
    if (squad.error) return res.status(400).json({ error: squad.error, code: 'invalid_squad' });

    // A tourney entry is a quick match with three extra gates: the window has to
    // be open, the player has to have battles left, and the squad has to obey
    // today's rules. All three are re-checked here because the client's copy of
    // them is only there to explain itself.
    let tourney = null;
    if (mode === TOURNEY_MODE) {
      tourney = await openTourney();
      if (!tourney) return res.status(400).json({ error: 'No tourney is running', code: 'tourney_closed' });

      const entry = await ensureTourneyEntry(tourney.id, chat_id);
      if ((entry?.battles || 0) >= TOURNEY_BATTLES) {
        return res.status(400).json({ error: 'No battles left today', code: 'tourney_spent' });
      }

      const broken = checkTourneyRules(squad.units, tourney.rules, { itemsByRosterId: squad.itemsByRosterId });
      if (broken.length) {
        // `rules` so the client can name them in its own language; `problems`
        // is the English prose, for the log and for anything without the names.
        return res.status(400).json({
          error:    broken[0].text,
          code:     'tourney_rules',
          rules:    broken.map(b => b.rule),
          problems: broken.map(b => b.text),
        });
      }
    }

    pvpQueue.sweep();
    const previousEntry = pvpQueue.get(chat_id);
    const result = pvpQueue.enqueue({
      chat_id: String(chat_id), mode, formation, power: squad.power, tourney_id: tourney?.id ?? null,
    });

    if (!result.matched) {
      await writeQueueRow(result.entry);
      if (!previousEntry || previousEntry.mode !== mode) {
        notifyAdminPvpQueue({
          chat_id: String(chat_id),
          mode,
          power: squad.power,
          waiting: pvpQueue.size(),
        }).catch(err => console.error('Admin PvP queue notify failed:', err.message));
      }
      return res.json({ status: 'waiting', queued_at: result.entry.enqueuedAt, waiting: pvpQueue.size() });
    }

    // Paired. The duel is built here, from the two formations already stored,
    // so neither client is asked for anything again.
    const { a, b } = result;
    // Same window as in runMatchmaking: `b` was taken out of the queue by
    // enqueue() and has nothing to poll until the duel exists.
    markPairing(a.chat_id, b.chat_id);
    await clearQueueRows([a.chat_id, b.chat_id]);

    const [cardA, cardB] = await Promise.all([pvpOpponentCard(a.chat_id), pvpOpponentCard(b.chat_id)]);

    let created;
    try {
      created = await createPvpBattle(b, a);   // b waited longer, so b creates
    } catch (err) {
      console.error('Failed to create PvP battle:', err);
      // Neither player is left believing they matched into something that does
      // not exist: both are told to queue again.
      clearPairing(a.chat_id, b.chat_id);
      battleBus.publish(pvpRoom(b.chat_id), { status: 'failed' }, { event: 'pvp' });
      return res.status(500).json({ error: 'Could not start the duel', code: 'pvp_create_failed' });
    }

    noteMatch(a.chat_id, created.battle_id);
    noteMatch(b.chat_id, created.battle_id);

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
  clearPairing(chat_id);
  await clearQueueRows([chat_id]);
  res.json({ status: 'left', was_queued: removed });
});

// GET /pvp/status — the polling fallback for a client whose stream is down.
router.get('/pvp/status', requireAuth, async (req, res) => {
  const { chat_id } = req.query;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });

  // Every poll is also a matchmaking tick. The timer above would get there on
  // its own, but a client asking "am I matched yet?" is the most natural moment
  // to check, and it makes the queue work even if the timer is ever removed.
  await runMatchmaking().catch(err => console.error('Matchmaking pass failed:', err));

  const match = recentMatches.get(String(chat_id));
  if (match) return res.json({ status: 'matched', battle_id: match.battle_id, opponent: match.opponent });

  const entry = pvpQueue.get(chat_id);
  if (entry) return res.json({ status: 'waiting', queued_at: entry.enqueuedAt, waiting: pvpQueue.size() });

  // Paired, duel still being built. Still 'waiting' as far as the player is
  // concerned — they are seconds from a battle, not out of the queue.
  if (pairing.has(String(chat_id))) return res.json({ status: 'waiting', pairing: true });

  // Neither queued nor matched: cancelled elsewhere, or swept for age.
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

    // Replay a match this player has already been paired into.
    //
    // publish() reaches whoever is subscribed AT THAT INSTANT and nothing else —
    // a match announced while this stream was still connecting, or between two
    // reconnects, was gone for good and that player waited for their next poll
    // instead. A phone waking up sits in exactly that window.
    const pending = recentMatches.get(String(chat_id));
    if (pending) {
      res.write(`event: pvp
data: ${JSON.stringify({ status: 'matched', battle_id: pending.battle_id, opponent: pending.opponent })}

`);
    }
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

    // Leaving a Colossus attempt early still counts what was dealt, and costs no
    // HP: roster HP is never read or written by these battles.
    if (isColossusRecord(record)) {
      const claimed = await claimBattleState(battle_id);
      armyCacheDrop(battle_id);
      const colossus = claimed ? await settleColossusAttempt(record) : null;
      // The task is "any damage counts", so an attempt left early that dealt
      // some still earns it.
      if (colossus?.dealt > 0) bumpDailyTask(chat_id, 'colossus');
      return res.json({ success: true, abandoned, colossus });
    }

    // A battle whose rewards are already claimed is history; closing it again
    // writes HP back harmlessly but must not re-credit the Temple's counters.
    await persistBattleRosterState(chat_id, record.battle_data, {
      abandoned, side: mySide, credit: record.battle_active !== false,
    });
    // Walking out ends the match as surely as claiming it does.
    forgetMatch(chat_id);

    // Walking out of a duel is a concession, not a draw: the player still on the
    // field wins it, and is told so through the battle stream they are already
    // holding. The same penalty applies as in a region fight — the dead stay
    // dead and the survivors leave at 1 HP.
    if (isPvpRecord(record) && abandoned) {
      const winner = mySide === 'player' ? 'enemy' : 'player';
      // The conceder has settled their own roster above and is owed nothing, so
      // their claim is recorded here. Without it `rewards_claimed` could never
      // hold both players, the row would stay battle_active forever, and BOTH
      // of them would be blocked from queueing again by the active-battle guard.
      const claims = { ...(record.battle_data?.rewards_claimed || {}), [String(chat_id)]: true };
      const battle_data = await withTourneyResult(record, {
        ...record.battle_data,
        done: true, winner, abandoned_by: String(chat_id),
        turn_deadline: null, rewards_claimed: claims,
      });
      await updateBattleState(battle_id, battle_data);
      armyCacheDrop(battle_id);
      battleBus.publish(battle_id, { done: true, last_log_id: null }, { exceptChatId: chat_id });
      return res.json({ success: true, abandoned, conceded_to: winner });
    }

    // Walking out of a tourney battle against a BOT is the same concession as
    // walking out of a duel: the battle was counted when it started, so it is
    // scored now (a forfeit, worth nothing) rather than left on the board with
    // no result against it. A duel returns above; this is the one-owner case.
    if (abandoned && record.battle_data?.tourney_id) {
      const battle_data = await withTourneyResult(record, {
        ...record.battle_data,
        done: true, winner: 'enemy', abandoned_by: String(chat_id), turn_deadline: null,
      });
      await updateBattleState(battle_id, battle_data);
    }

    await closeBattleState(battle_id);
    armyCacheDrop(battle_id);
    res.json({ success: true, abandoned });
  } catch (err) {
    serverError(res, err);
  }
});

// PVP_WIN_XP to every unit of `side` that fought, survivor or not.
async function grantPvpWinXp(chat_id, battle_data, side) {
  const ids = (battle_data.units || [])
    .filter(u => u.side === side && u._rosterId != null)
    .map(u => String(u._rosterId));
  const rows = ids.length
    ? await supabase(`/roster?id=in.(${ids.join(',')})&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,unit_data,is_hero,engraving,calling,devotion`)
    : [];

  const xp_awards = [];
  await Promise.all(rows.map(async row => {
    const unitData = { ...(row.unit_data || {}), current_xp: ((row.unit_data || {}).current_xp ?? 0) + PVP_WIN_XP };
    xp_awards.push({
      roster_id:  String(row.id),
      unit_id:    unitData.unit_id,
      xp_gained:  PVP_WIN_XP,
      current_xp: unitData.current_xp,
      alive:      unitData.alive !== false,
    });
    await supabase(`/roster?id=eq.${encodeURIComponent(row.id)}`, { method: 'PATCH', body: JSON.stringify({ unit_data: unitData }) });
  }));
  xp_awards.sort((a, b) => Number(a.roster_id) - Number(b.roster_id));
  return { xp_granted: PVP_WIN_XP, xp_awards };
}

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
    // ── Colossus payout ────────────────────────────────────────────────────
    // Won or lost, the attempt pays in damage to the pool; the claim makes that
    // single-shot, the same as a region reward.
    if (isColossusRecord(record)) {
      const claimed = await claimBattleState(battle_id);
      if (!claimed) return res.status(400).json({ error: 'Rewards already claimed', code: 'battle_rewards_claimed' });
      armyCacheDrop(battle_id);
      bumpDailyTask(chat_id, ['battles', 'colossus']);
      noteInviteMoment(chat_id, 'first_battle');
      const colossus = await settleColossusAttempt(record);
      await creditBattleDevotion(chat_id, record.battle_data, 'player');
      const quest_progress = await bumpQuestsWithReport(chat_id, battleQuestCounters(record.battle_data, 'player', {
        colossus_damage: colossus?.dealt || 0,
        battles_won:     record.battle_data?.winner === 'player' ? 1 : 0,
      }));
      return res.json({
        xp_granted: 0, gold: 0, crystal: 0, crystals_gained: {}, xp_awards: [], progress_unlocked: false,
        won: record.battle_data?.winner === 'player', colossus, quest_progress,
      });
    }

    // ── Bot payout ─────────────────────────────────────────────────────────
    // One owner, so the PvE claim applies as it is. Same 100 XP as a duel won.
    if (isBotRecord(record)) {
      const claimed = await claimBattleState(battle_id);
      if (!claimed) return res.status(400).json({ error: 'Rewards already claimed', code: 'battle_rewards_claimed' });
      armyCacheDrop(battle_id);
      await persistBattleRosterState(chat_id, record.battle_data);
      // A bot duel is a quick match for the day's task, win or lose — and a
      // duel is a battle, so it counts for both.
      bumpDailyTask(chat_id, ['pvp', 'battles']);
      noteInviteMoment(chat_id, 'first_battle');
      // Settled: this match is history, and must never be replayed to a stream.
      forgetMatch(chat_id);

      const won = record.battle_data?.winner === 'player';
      // The tourney result is NOT written here: it was written when the battle
      // finished (withTourneyResult), so a player who never opens the result
      // screen still scores the battle they fought.
      const quest_progress = await bumpQuestsWithReport(chat_id, battleQuestCounters(record.battle_data, 'player', { pvp_matches: 1, battles_won: won ? 1 : 0 }));
      const result = { xp_granted: 0, gold: 0, crystal: 0, crystals_gained: {}, xp_awards: [], progress_unlocked: false, pvp: true, bot: true, won, quest_progress };
      if (won) Object.assign(result, await grantPvpWinXp(chat_id, record.battle_data, 'player'));
      return res.json(result);
    }

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
      // Counts for both players, win or lose. A player who concedes claims
      // through /battle/end instead and does not count: walking out is not a fight.
      // A duel is also a battle, so it counts for both tasks.
      bumpDailyTask(chat_id, ['pvp', 'battles']);
      noteInviteMoment(chat_id, 'first_battle');
      // Settled: this match is history, and must never be replayed to a stream.
      forgetMatch(chat_id);

      const won = record.battle_data?.winner === mySide;
      // Written at the end of the battle, not here — see the bot payout above.
      const quest_progress = await bumpQuestsWithReport(chat_id, battleQuestCounters(record.battle_data, mySide, { pvp_matches: 1, battles_won: won ? 1 : 0 }));
      const result = { xp_granted: 0, gold: 0, crystal: 0, crystals_gained: {}, xp_awards: [], progress_unlocked: false, pvp: true, won, quest_progress };

      if (won) Object.assign(result, await grantPvpWinXp(chat_id, record.battle_data, mySide));

      const claims = { ...alreadyClaimed, [String(chat_id)]: true };
      await updateBattleState(battle_id, { ...record.battle_data, rewards_claimed: claims });
      // The row stays open until the other player has taken theirs; the loser
      // claims too (they get nothing, but the claim is what closes the battle
      // and frees them to queue again).
      const bothIn = [String(record.chat_id), String(record.opponent_chat_id)].every(id => claims[id]);
      if (bothIn) { await closeBattleState(battle_id); armyCacheDrop(battle_id); }

      return res.json(result);
    }

    const claimed = await claimBattleState(battle_id);
    if (!claimed) return res.status(400).json({ error: 'Rewards already claimed', code: 'battle_rewards_claimed' });
    armyCacheDrop(battle_id);

    // Counted here rather than at /battle/end because this is the route a
    // finished battle actually passes through, and claimBattleState above has
    // already made it single-shot: a retry cannot count the same battle twice.
    // A loss counts — the task is to fight, not to win.
    bumpDailyTask(chat_id, 'battles');
    // Any finished battle is "their first battle" for the invite payout; it pays
    // once, so whichever kind comes first is the one that counts.
    noteInviteMoment(chat_id, 'first_battle');

    await persistBattleRosterState(chat_id, record.battle_data);

    const { region_id, level } = record.battle_data;
    const won = record.battle_data?.winner === 'player';
    // Started now, awaited just before responding: it runs alongside the payout
    // rather than in front of it.
    const questReport = bumpQuestsWithReport(chat_id, battleQuestCounters(record.battle_data, 'player', { battles_won: won ? 1 : 0 }));
    const region = REGIONS.find(r => r.id === region_id);
    if (!region) return res.status(404).json({ error: 'Region not found' });
    const levelDef = region.difficulties?.[`level_${level}`];
    if (!levelDef) return res.status(404).json({ error: 'Level not found' });
    const rewards = levelDef.rewards;
    const result  = { xp_granted: 0, gold: 0, crystal: 0, crystals_gained: {}, xp_awards: [], progress_unlocked: false };
    if (won) {
      const inventoryRows = await supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`);
      // Gold, crystals and trophies are collected here and paid out in ONE
      // transaction below, rather than a write per line. A victory paying gold,
      // two crystal types and six trophies was nine sequential round trips on
      // the screen the player is staring at, and any of them could fail alone.
      const payouts = [];
      const updateItem = (itemName, amount) => {
        // A resource row the player has never held is skipped, not invented:
        // gold and crystals are seeded at registration, so a missing row means
        // something is wrong with the account rather than a new currency.
        if (!inventoryRows.some(r => r.item === itemName)) return;
        payouts.push({ item: itemName, amount, item_type: 'resource' });
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
        ? await supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&or=(${participantIds.map(id => `id.eq.${id}`).join(',')})&select=id,unit_data,is_hero,engraving,calling,devotion`)
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
      updateItem('Gold', goldPayout);
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
        updateItem(type, amt);
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
      // Trophies join the same bill. A trophy the player has never held is
      // upserted rather than skipped — unlike gold, a first drop is normal.
      for (const [id, amount] of Object.entries(granted)) {
        payouts.push({ item: id, amount, item_type: 'trophy' });
      }

      // The whole haul, one transaction.
      await grantResources(chat_id, payouts);

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
        // `devotion` rides along so applyAutoLevelUps can reset it — this is the
        // commonest level-up of all, and without the field the reset is skipped.
        postXpRows.push({ id: row.id, unit_data: unitData, is_hero: row.is_hero, devotion: row.devotion });
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
            // `supplies` is not a token. It is paid into the supply pool, whose
            // row name is per faction (SUPPLY_ITEMS), so the key in the drop
            // table is a placeholder the faction resolves here. Everything else
            // is a token and keeps its key as its row name.
            //
            // A drop can push the pool ABOVE its ceiling, and is allowed to:
            // it is three supplies across a whole account, once, and the refill
            // simply idles until the overflow is spent (see supply-tick).
            const supplyItem = supplyItemName(playerRows[0].faction);
            const grants = [];
            for (const [item, amount] of Object.entries(tokenDrops)) {
              if (item === 'supplies') {
                if (supplyItem) grants.push({ item: supplyItem, amount, item_type: SUPPLY_ITEM_TYPE });
              } else {
                grants.push({ item, amount, item_type: 'token' });
              }
            }
            if (grants.length) await grantResources(chat_id, grants);
            result.tokens_gained = tokenDrops;   // { crossroad_sigil: 1 }
          }
        }
      }
    }

    // Already closed by the claim above — closing again here would be harmless
    // but misleading, since it would read as the point where the battle ends.

    result.quest_progress = await questReport;
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
    const learned = playerRows[0].learned_spells || [];
    // The Mage Guild is the research gate, one level per tier — the same rule the
    // Spell Tome draws its tabs from. This used to read the THRONE instead, which
    // the tome never mentioned: a player with the guild built saw a spell offered
    // and was refused here, and one with a tall throne and no guild was refused by
    // the tome for something the server would have allowed.
    const guildLevel = buildingLevel(structRows[0].buildings_data, 'mage_guild');
    // A spell with no tier is not researched at all — the two non-combat spells are
    // granted at character creation (FACTION_STARTING_SPELLS) and cast from a unit's
    // sheet. Refused outright rather than defaulted to tier 1, so the tome's own
    // rule ("this is not researched here") holds on the server too.
    if (spell.tier == null) return res.status(400).json({ error: 'That spell is not researched' });
    if (learned.includes(spell_id)) return res.status(400).json({ error: 'Spell already researched' });
    if (guildLevel < spell.tier) return res.status(400).json({ error: `Mage Guild level ${spell.tier} required to research this spell` });
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
    bumpQuests(chat_id, { spells_learned: 1 });
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

    // The faction is read for the calling the new row is born with: a mercenary
    // is a foreign unit but a row in the PLAYER's roster, and it stands in the
    // player's litanies.
    const [structRows, inventoryRows, mercPlayerRows] = await Promise.all([
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
      supabase(`/players?chat_id=eq.${encodeURIComponent(chat_id)}&select=faction&limit=1`),
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
    try {
      await spendResources(chat_id, cost);
    } catch (err) {
      const short = shortfallItem(err);
      if (short) {
        const have = inventoryRows.find(r => r.item === short)?.amount ?? 0;
        return res.status(400).json({ error: `Not enough ${short} (need ${cost[short]}, have ${have})` });
      }
      throw err;
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
        calling:   newCallingFor(mercPlayerRows[0]?.faction),
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
  // roster_id is optional: this upgrades the building, and the units it can
  // auto-level are found by slot. A dead or dismissed mercenary must not block it.
  if (!chat_id || !mercenary_building_id || !slot) return res.status(400).json({ error: 'chat_id, mercenary_building_id, and slot required' });
  try {
    const allMercBuildings = Object.values(MERCENARY_BUILDINGS).flat();
    const bDef = allMercBuildings.find(b => b.id === mercenary_building_id);
    if (!bDef) return res.status(404).json({ error: 'Mercenary building not found' });

    const [allRosterRows, structRows, inventoryRows] = await Promise.all([
      supabase(`/roster?chat_id=eq.${encodeURIComponent(chat_id)}&is_hero=eq.false&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
      supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`),
      supabase(`/resources?chat_id=eq.${encodeURIComponent(chat_id)}`),
    ]);
    if (!structRows.length) return res.status(404).json({ error: 'Structures not found' });
    const rosterRows = allRosterRows.filter(r =>
      roster_id ? String(r.id) === String(roster_id) : r.unit_data?.building_slot === slot);

    const record  = structRows[0];
    const slots   = record.buildings_data || {};
    if (!allMercBuildings.some(b => b.id === slots[slot]?.building_id)) {
      return res.status(400).json({ error: 'Slot does not contain a mercenary' });
    }

    // Resolve the template before spending anything, so a data gap can never
    // charge the player and then fail.
    const unitTemplate = findEnemyUnit(bDef.region, bDef.unit_id);
    if (!unitTemplate) return res.status(500).json({ error: 'Unit definition not found' });

    const cost = bDef.cost || {};
    try {
      await spendResources(chat_id, cost);
    } catch (err) {
      const short = shortfallItem(err);
      if (short) {
        const have = inventoryRows.find(r => r.item === short)?.amount ?? 0;
        return res.status(400).json({ error: `Not enough ${short} (need ${cost[short]}, have ${have})` });
      }
      throw err;
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

    const rosterEntryId = rosterRows[0]?.id;
    const updatedRoster = rosterEntryId
      ? await supabase(`/roster?id=eq.${encodeURIComponent(rosterEntryId)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`)
      : [];
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
      supabase(`/roster?id=eq.${encodeURIComponent(roster_id)}&chat_id=eq.${encodeURIComponent(chat_id)}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
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
      supabase(`/roster?id=eq.${roster_id}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
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
      supabase(`/roster?id=eq.${item.equipped_by}&select=id,chat_id,unit_data,is_hero,engraving,calling,devotion`),
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

    // The forge gate. Crafting is the only source of finished equipment, so
    // without a Blacksmith standing there is nothing to craft WITH. The items
    // screen greys the buttons for the same reason, but this route is the
    // authority.
    const structRows = await supabase(`/structures?chat_id=eq.${encodeURIComponent(chat_id)}&limit=1`);
    if (!craftingUnlocked(structRows[0]?.buildings_data)) {
      return res.status(400).json({ error: 'Build a Blacksmith before you can craft', code: 'no_blacksmith' });
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

    // Spend, consume and mint in ONE transaction (see craft_item in
    // sql/003_atomic_resources.sql).
    //
    // The three checks above are all read-then-write, and every one of them was
    // racing: two parallel crafts both saw the balance and both deducted from
    // it, both saw zero copies of a unique item and both minted one, and both
    // picked the SAME unequipped shard rows as ingredients — the second DELETE
    // then matched nothing and the craft succeeded anyway. Craft is the most
    // worthwhile endpoint in the game to race, so the checks are re-run inside
    // the transaction and the whole thing rolls back if any of them now fails.
    //
    // The checks are still done here as well, because this is where the good
    // error messages live; the database is the authority, not the messenger.
    const row = makeItemRow(player.id, item_key);
    let inserted;
    try {
      inserted = await rpc('craft_item', {
        p_chat_id:        String(chat_id),
        p_player_id:      player.id,
        p_item_key:       item_key,
        p_item_name:      row.item_name,
        p_costs:          cost,
        p_ingredient_ids: ingredientRows.map(it => Number(it.id)),
        p_unique:         Boolean(itemDef.unique),
      });
    } catch (err) {
      const short = shortfallItem(err);
      if (short) return res.status(400).json({ error: `Not enough ${short}`, code: 'craft_insufficient' });
      if (/already_owned:/.test(err.message)) {
        return res.status(400).json({ error: 'You already own this unique item', code: 'craft_duplicate' });
      }
      if (/ingredients_missing/.test(err.message)) {
        return res.status(400).json({ error: 'Those ingredients are no longer available', code: 'craft_ingredients' });
      }
      throw err;
    }

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