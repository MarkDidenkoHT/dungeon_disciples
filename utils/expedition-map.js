// ── Expedition map: generation, movement and fog ────────────────────────────
// Pure functions over plain objects, no I/O. routes/index.js owns the stored
// run and calls into here; tests drive this file directly.
//
// Coordinates are { x, y } with x the column and y the row, 0-based. Movement
// and every "adjacent" in this file are ORTHOGONAL only (up/down/left/right);
// diagonals never count (design doc §2).
//
// A wall sits on an EDGE between two orthogonal neighbours, stored as an edge
// key (see edgeKey). A cell with no wall on an edge can be walked across it.

const EXP = require('../data/expedition');

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// mulberry32: small, fast, good enough for layouts. Seeded so a map can be
// regenerated from its seed (dev tools) and tests are deterministic.
function makeRng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: n => Math.floor(next() * n),
    pick: arr => arr[Math.floor(next() * arr.length)],
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

const cellKey = (x, y) => `${x},${y}`;
const keyOf   = c => cellKey(c.x, c.y);

function edgeKey(a, b) {
  const ka = keyOf(a), kb = keyOf(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

function inBounds(size, x, y) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function gridNeighbours(size, c) {
  const out = [];
  for (const [dx, dy] of DIRS) {
    const x = c.x + dx, y = c.y + dy;
    if (inBounds(size, x, y)) out.push({ x, y });
  }
  return out;
}

// Neighbours reachable in one step: on the grid, orthogonal, no wall between.
function openNeighbours(map, c) {
  const walls = new Set(map.walls || []);
  return gridNeighbours(map.size, c).filter(n => !walls.has(edgeKey(c, n)));
}

function isOrthogonalStep(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function canStep(map, from, to) {
  if (!to || !inBounds(map.size, to.x, to.y)) return false;
  if (!isOrthogonalStep(from, to)) return false;
  return !(map.walls || []).includes(edgeKey(from, to));
}

// BFS step counts from `start` across open edges. Unreachable cells are absent.
function distancesFrom(map, start) {
  const dist = new Map([[keyOf(start), 0]]);
  const queue = [start];
  while (queue.length) {
    const c = queue.shift();
    for (const n of openNeighbours(map, c)) {
      const k = keyOf(n);
      if (dist.has(k)) continue;
      dist.set(k, dist.get(keyOf(c)) + 1);
      queue.push(n);
    }
  }
  return dist;
}

function allCells(size) {
  const out = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out.push({ x, y });
  return out;
}

// Every interior edge starts as a wall; a randomized depth-first carve opens a
// spanning tree (so every cell is reachable), then a share of the remaining
// walls is knocked out to add a few loops.
function carveWalls(size, start, rng, openExtra) {
  const walls = new Set();
  for (const c of allCells(size)) {
    if (c.x + 1 < size) walls.add(edgeKey(c, { x: c.x + 1, y: c.y }));
    if (c.y + 1 < size) walls.add(edgeKey(c, { x: c.x, y: c.y + 1 }));
  }
  const seen = new Set([keyOf(start)]);
  const stack = [start];
  while (stack.length) {
    const c = stack[stack.length - 1];
    const options = rng.shuffle(gridNeighbours(size, c)).filter(n => !seen.has(keyOf(n)));
    if (!options.length) { stack.pop(); continue; }
    const n = options[0];
    walls.delete(edgeKey(c, n));
    seen.add(keyOf(n));
    stack.push(n);
  }
  for (const w of rng.shuffle([...walls])) {
    if (rng.next() < openExtra) walls.delete(w);
  }
  return [...walls].sort();
}

function corners(size) {
  const m = size - 1;
  return [{ x: 0, y: 0 }, { x: m, y: 0 }, { x: 0, y: m }, { x: m, y: m }];
}

function rollLoot(levelRewards, rng, { mult = 1, pct = null, trophy = null } = {}) {
  const L = EXP.SECONDARY_LOOT;
  const share = (n, p) => Math.round((Number(n) || 0) * p / 100 * mult);
  const goldPct = pct ?? L.gold_pct;
  const crystals = {};
  for (const { type, amount } of levelRewards?.crystals || []) {
    if (!type || !amount) continue;
    crystals[type] = Math.max(1, share(amount, pct ?? L.crystal_pct));
  }
  const trophies = {};
  const trophyIds = Object.keys(levelRewards?.trophies || {});
  const dropTrophy = trophy ?? (rng.next() < L.trophy_chance);
  if (trophyIds.length && dropTrophy) trophies[rng.pick(trophyIds)] = mult > 1 ? Math.round(mult) : 1;
  return {
    gold: share(levelRewards?.gold, goldPct),
    xp:   pct == null ? share(levelRewards?.xp, L.xp_pct) : 0,
    crystals,
    trophies,
  };
}

const torchOnLevel = level => Number(level) >= EXP.TORCH.from_level;

// Effects that touch the torch are never offered on a map without one.
function effectPool(table, level) {
  const torch = torchOnLevel(level);
  return Object.keys(table).filter(id => torch || !table[id].needs_torch);
}

// One attempt at a layout. Returns null when this seed cannot satisfy the
// constraints; generateMap moves on to the next seed.
function tryLayout({ seed, region_id, level, levelRewards }) {
  const rng      = makeRng(seed);
  const modeId   = EXP.modeForLevel(level);
  const mode     = EXP.MODES[modeId];
  const size     = mode.size;

  const entrance = rng.pick(corners(size));
  const walls    = mode.walls ? carveWalls(size, entrance, rng, mode.openExtraWalls || 0) : [];
  const map      = { size, mode: modeId, level: Number(level), walls, cells: [], entrance, goal: null };
  const dist     = distancesFrom(map, entrance);
  if (dist.size !== size * size) return null;

  // Goal: as far from the entrance as the layout allows. On 3x3 that is always
  // the opposite corner.
  const maxDist = Math.max(...dist.values());
  if (maxDist < mode.goalMinDistance) return null;
  const goalFloor = Math.max(mode.goalMinDistance, maxDist - 2);
  const goalPool  = allCells(size).filter(c => dist.get(keyOf(c)) >= goalFloor);
  const goal      = rng.pick(goalPool);
  map.goal = goal;

  const taken = new Set([keyOf(entrance), keyOf(goal)]);
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  // Exits: never the entrance, never next to the goal, at least two steps in.
  // On 5x5 one of them must be deep (≥ 4 steps) and they may not touch.
  const exitPool = allCells(size).filter(c =>
    !taken.has(keyOf(c)) && manhattan(c, goal) > 1 && dist.get(keyOf(c)) >= 2);
  const exits = [];
  if (mode.fixed.exit >= 2) {
    const deep = rng.shuffle(exitPool.filter(c => dist.get(keyOf(c)) >= 4));
    if (!deep.length) return null;
    exits.push(deep[0]);
    const rest = rng.shuffle(exitPool.filter(c => keyOf(c) !== keyOf(deep[0]) && manhattan(c, deep[0]) > 1));
    for (const c of rest) { if (exits.length >= mode.fixed.exit) break; exits.push(c); }
  } else {
    exits.push(...rng.shuffle(exitPool).slice(0, mode.fixed.exit));
  }
  if (exits.length !== mode.fixed.exit) return null;
  for (const e of exits) taken.add(keyOf(e));

  // Everything else: the fixed fights and empties first, then the level's pool,
  // then the pool's guaranteed minimums (a camp on every torch-lit map).
  const usedTemplates = new Set();
  const fightQueue = rng.shuffle(EXP.secondaryTemplatesFor(region_id, level));
  const eliteQueue = rng.shuffle(EXP.eliteTemplatesFor(region_id, level));
  const nextFrom = queue => {
    while (queue.length) {
      const t = queue.shift();
      if (!usedTemplates.has(t.id)) { usedTemplates.add(t.id); return t; }
    }
    return null;
  };
  const unlocked = EXP.unlockedNodeTypes(level);
  const pool = EXP.poolForLevel(level);
  const poolTypes = Object.entries(pool.weights).filter(([t, w]) => w > 0 && unlocked.includes(t));
  const poolTotal = poolTypes.reduce((s, [, w]) => s + w, 0);
  const drawPool = () => {
    let r = rng.next() * poolTotal;
    for (const [t, w] of poolTypes) { if ((r -= w) < 0) return t; }
    return poolTypes.length ? poolTypes[poolTypes.length - 1][0] : 'empty';
  };

  const rest = rng.shuffle(allCells(size).filter(c => !taken.has(keyOf(c))));
  const wanted = [];
  for (let i = 0; i < mode.fixed.fight; i++) wanted.push('fight');
  for (let i = 0; i < mode.fixed.empty; i++) wanted.push('empty');
  const poolStart = wanted.length;
  while (wanted.length < rest.length) wanted.push(drawPool());
  for (const [type, n] of Object.entries(pool.min || {})) {
    if (!unlocked.includes(type)) continue;
    let have = wanted.filter(t => t === type).length;
    for (let i = poolStart; i < wanted.length && have < n; i++) {
      if (wanted[i] === 'empty') { wanted[i] = type; have++; }
    }
  }

  const boons   = effectPool(EXP.BOONS, level);
  const curses  = effectPool(EXP.CURSES, level);
  const events  = effectPool(EXP.EVENTS, level);
  const cells = [
    { ...entrance, type: 'entrance' },
    { ...goal,     type: 'goal' },
    ...exits.map(e => ({ ...e, type: 'exit' })),
  ];
  rest.forEach((c, i) => {
    const type = wanted[i];
    if (type === 'fight' || type === 'elite') {
      // A map never repeats a template, so a level with few templates simply
      // gets fewer fights; the spare cell is left empty.
      const t = type === 'elite' ? nextFrom(eliteQueue) : nextFrom(fightQueue);
      if (!t) { cells.push({ ...c, type: 'empty' }); return; }
      const mult = type === 'elite' ? EXP.ELITE.loot_mult : 1;
      cells.push({ ...c, type, template: t.id, loot: rollLoot(levelRewards, rng, { mult }) });
      return;
    }
    if (type === 'shrine') {
      cells.push({ ...c, type, options: rng.shuffle(boons).slice(0, 2) });
      return;
    }
    if (type === 'curse') {
      cells.push({ ...c, type, curse: rng.pick(curses) });
      return;
    }
    if (type === 'event') {
      const id = rng.pick(events);
      const ev = EXP.EVENTS[id];
      const cell = { ...c, type, event: id };
      if (ev.accept.loot_pct) cell.loot = rollLoot(levelRewards, rng, { pct: ev.accept.loot_pct, trophy: !!ev.accept.trophy });
      cells.push(cell);
      return;
    }
    cells.push({ ...c, type });
  });
  cells.sort((a, b) => a.y - b.y || a.x - b.x);
  map.cells = cells;
  return validateMap(map, { level }) ? null : map;
}

const MAX_ATTEMPTS = 60;

function generateMap({ seed, region_id, level, levelRewards }) {
  const base = Number(seed) >>> 0;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const map = tryLayout({ seed: (base + i * 7919) >>> 0, region_id, level, levelRewards });
    if (map) return { ...map, seed: base, attempt: i };
  }
  throw new Error(`Could not generate an expedition map for ${region_id} level ${level} (seed ${base})`);
}

// Returns an error string, or null for a valid map. Run on every generated map
// (and in tests), so a bad template or a tuning change can never hand a player
// an unwinnable layout.
function validateMap(map, { level } = {}) {
  if (!map || !Number.isInteger(map.size)) return 'no map';
  const { size } = map;
  if (map.cells.length !== size * size) return 'cell count';
  const seen = new Set();
  for (const c of map.cells) {
    if (!inBounds(size, c.x, c.y)) return 'cell out of bounds';
    if (seen.has(keyOf(c))) return 'duplicate cell';
    seen.add(keyOf(c));
  }
  const count = t => map.cells.filter(c => c.type === t).length;
  const mode = EXP.MODES[map.mode];
  if (!mode || mode.size !== size) return 'mode';
  if (count('entrance') !== 1) return 'entrance count';
  if (count('goal') !== 1) return 'goal count';
  if (count('exit') !== mode.fixed.exit) return 'exit count';
  const entrance = map.cells.find(c => c.type === 'entrance');
  const goal     = map.cells.find(c => c.type === 'goal');
  if (!corners(size).some(c => keyOf(c) === keyOf(entrance))) return 'entrance not in a corner';
  if (!mode.walls && map.walls.length) return 'walls on a wall-less mode';
  const dist = distancesFrom(map, entrance);
  if (!dist.has(keyOf(goal))) return 'goal unreachable';
  if (dist.get(keyOf(goal)) < mode.goalMinDistance) return 'goal too close';
  for (const e of map.cells.filter(c => c.type === 'exit')) {
    if (!dist.has(keyOf(e))) return 'exit unreachable';
    if (Math.abs(e.x - goal.x) + Math.abs(e.y - goal.y) <= 1) return 'exit next to goal';
  }
  const fights = map.cells.filter(c => c.type === 'fight' || c.type === 'elite');
  if (fights.some(c => !c.template)) return 'fight without template';
  const templates = fights.map(c => c.template);
  if (new Set(templates).size !== templates.length) return 'repeated template';
  if (count('fight') < mode.fixed.fight) return 'fight count';
  if (count('empty') + count('camp') < mode.fixed.empty) return 'empty count';
  if (map.cells.some(c => c.type === 'shrine' && !(c.options?.length))) return 'shrine without boons';
  if (map.cells.some(c => c.type === 'curse' && !EXP.CURSES[c.curse])) return 'curse unknown';
  if (map.cells.some(c => c.type === 'event' && !EXP.EVENTS[c.event])) return 'event unknown';
  if (level != null) {
    const unlocked = EXP.unlockedNodeTypes(level);
    const allowed = new Set(['entrance', 'goal', 'exit', ...unlocked]);
    if (map.cells.some(c => !allowed.has(c.type))) return 'locked node type';
    for (const [type, n] of Object.entries(EXP.poolForLevel(level).min || {})) {
      if (unlocked.includes(type) && count(type) < n) return `${type} minimum`;
    }
  }
  return null;
}

function cellAt(map, x, y) {
  return map.cells.find(c => c.x === x && c.y === y) || null;
}

// ── Run state ───────────────────────────────────────────────────────────────
// The run's `data` jsonb. Everything here is plain JSON so it round-trips
// through Supabase untouched.
function newRunData({ map, squad }) {
  const data = {
    seed:     map.seed,
    map,
    pos:      { ...map.entrance },
    prev:     null,
    visited:  [keyOf(map.entrance)],
    revealed: [keyOf(map.entrance)],
    cleared:  [],
    // Camps, shrines, curses and events that have been used up.
    used:     [],
    pending:  null,
    // The choice on offer where the player stands: { kind, x, y }.
    offer:    null,
    // Lasting boons and curses: { id, kind: 'boon'|'curse', fights_left }.
    effects:  [],
    torch:    null,
    squad,
    fallen:   [],
    bank:     { gold: 0, xp: 0, crystals: {}, trophies: {} },
    battle_id: null,
    steps:    0,
    fights:   0,
    // What the last action did, for the client to announce. Replaced each step.
    notices:  [],
  };
  if (torchOnLevel(map.level)) {
    const route = distancesFrom(map, map.entrance).get(keyOf(map.goal)) || 0;
    const max = Math.max(EXP.TORCH.min_max, Math.ceil(route * EXP.TORCH.budget_factor));
    data.torch = { max, value: max };
  }
  revealAround(data);
  return data;
}

// 2–3 random OPEN neighbours of where the player stands become known. Walls
// block sight as well as movement. Fewer than two open neighbours: all of them.
function revealAround(data) {
  const rng  = makeRng(((Number(data.seed) >>> 0) ^ Math.imul(data.steps + 1, 2654435761)) >>> 0);
  const open = rng.shuffle(openNeighbours(data.map, data.pos));
  const n    = open.length <= 2 ? open.length : 2 + rng.int(2);
  const revealed = new Set(data.revealed);
  revealed.add(keyOf(data.pos));
  for (const c of open.slice(0, n)) revealed.add(keyOf(c));
  data.revealed = [...revealed];
  return data;
}

const FIGHT_TYPES = new Set(['fight', 'elite', 'goal']);

// A fight cell that has not been won yet. Elites and the goal count.
function isLiveFight(data, cell) {
  if (!cell || !FIGHT_TYPES.has(cell.type)) return false;
  return !data.cleared.includes(keyOf(cell));
}

const isUsed = (data, cell) => (data.used || []).includes(keyOf(cell));

// Where the player may step from here. Walking into a fight room commits to the
// fight: while one is pending or under way there is no move at all.
function allowedMoves(data) {
  if (data.battle_id || data.pending) return [];
  return openNeighbours(data.map, data.pos);
}

// A seeded pick that changes every step, so the same map does not always roll
// the same curse from a reliquary.
function stepRng(data, salt) {
  return makeRng(((Number(data.seed) >>> 0) ^ Math.imul(data.steps + 7, 40503) ^ Math.imul(salt + 1, 2246822519)) >>> 0);
}

function changeTorch(data, pct) {
  if (!data.torch) return;
  const delta = Math.round(data.torch.max * pct / 100);
  data.torch.value = Math.max(0, Math.min(data.torch.max, data.torch.value + delta));
}

// Applies a boon or curse. Lasting ones join `effects`; instant ones happen
// now. Returns the roster HP changes the server has to make ({ heal_pct } or
// { hurt_pct }), which this pure module cannot.
function applyEffect(data, kind, id) {
  const def = (kind === 'boon' ? EXP.BOONS : EXP.CURSES)[id];
  if (!def) return [];
  const ops = [];
  if (def.fights) {
    data.effects = [...(data.effects || []), { id, kind, fights_left: def.fights }];
  }
  const inst = def.instant || {};
  if (inst.torch_pct) changeTorch(data, inst.torch_pct);
  if (inst.heal_pct) ops.push({ heal_pct: inst.heal_pct });
  if (inst.hurt_pct) ops.push({ hurt_pct: inst.hurt_pct });
  if (inst.reveal_all) data.revealed = data.map.cells.map(keyOf);
  data.notices.push({ kind, id });
  return ops;
}

function randomEffect(data, kind, salt) {
  const ids = effectPool(kind === 'boon' ? EXP.BOONS : EXP.CURSES, data.map.level);
  return stepRng(data, salt).pick(ids);
}

// What standing on this cell offers, if anything.
function offerFor(data, cell) {
  if (!cell) return null;
  if (cell.type === 'camp') return { kind: 'camp', x: cell.x, y: cell.y, rested: isUsed(data, cell) };
  if ((cell.type === 'shrine' || cell.type === 'event') && !isUsed(data, cell)) {
    return { kind: cell.type, x: cell.x, y: cell.y };
  }
  return null;
}

// Mutates `data`. Returns null on success or { code, error } on refusal. Roster
// HP changes the step caused (a curse) are left in `data._ops` for the server.
function applyMove(data, to) {
  const target = { x: Number(to?.x), y: Number(to?.y) };
  if (!Number.isInteger(target.x) || !Number.isInteger(target.y)) {
    return { code: 'expedition_bad_move', error: 'x and y must be integers' };
  }
  if (data.battle_id) return { code: 'expedition_in_battle', error: 'Finish the fight first' };
  const allowed = allowedMoves(data).some(c => c.x === target.x && c.y === target.y);
  if (!allowed) {
    if (data.pending) return { code: 'expedition_fight_pending', error: 'The fight in this room has to be fought' };
    return { code: 'expedition_bad_move', error: 'You can only move to an open cell up, down, left or right' };
  }

  data.notices = [];
  data._ops = [];
  data.prev = { ...data.pos };
  data.pos  = target;
  data.steps += 1;
  if (data.torch) data.torch.value = Math.max(0, data.torch.value - EXP.TORCH.step_cost);
  if (!data.visited.includes(keyOf(target))) data.visited.push(keyOf(target));
  revealAround(data);

  const cell = cellAt(data.map, target.x, target.y);
  data.offer = offerFor(data, cell);
  if (isLiveFight(data, cell)) {
    data.pending = { ...target };
  } else if (cell?.type === 'curse' && !isUsed(data, cell)) {
    data.used = [...(data.used || []), keyOf(cell)];
    data._ops.push(...applyEffect(data, 'curse', cell.curse));
  }
  return null;
}

// Answers the offer where the player stands. Returns { code, error } on
// refusal, or { ops } — roster HP changes for the server to make.
function chooseOffer(data, choice) {
  const offer = data.offer;
  if (!offer || offer.x !== data.pos.x || offer.y !== data.pos.y) {
    return { code: 'expedition_no_offer', error: 'Nothing to choose here' };
  }
  if (data.battle_id || data.pending) return { code: 'expedition_in_battle', error: 'Finish the fight first' };
  const cell = cellAt(data.map, offer.x, offer.y);
  data.notices = [];
  const ops = [];
  const useUp = () => { if (!isUsed(data, cell)) data.used = [...(data.used || []), keyOf(cell)]; };

  if (offer.kind === 'camp') {
    if (choice !== 'rest') return { code: 'expedition_bad_choice', error: 'Unknown choice' };
    if (isUsed(data, cell)) return { code: 'expedition_rested', error: 'You already rested at this camp' };
    useUp();
    changeTorch(data, EXP.CAMP.torch_refuel_pct);
    ops.push({ heal_pct: EXP.CAMP.heal_pct });
    data.notices.push({ kind: 'camp', id: 'rest' });
    data.offer = offerFor(data, cell);
    return { ops };
  }
  if (offer.kind === 'shrine') {
    if (!(cell.options || []).includes(choice)) return { code: 'expedition_bad_choice', error: 'That boon is not offered here' };
    useUp();
    ops.push(...applyEffect(data, 'boon', choice));
    data.offer = null;
    return { ops };
  }
  if (offer.kind === 'event') {
    if (choice !== 'accept' && choice !== 'decline') return { code: 'expedition_bad_choice', error: 'Unknown choice' };
    useUp();
    data.offer = null;
    if (choice === 'decline') return { ops };
    const acc = EXP.EVENTS[cell.event]?.accept || {};
    if (cell.loot) data.bank = addLoot(data.bank, cell.loot);
    if (acc.torch_pct) changeTorch(data, acc.torch_pct);
    if (acc.hurt_pct) ops.push({ hurt_pct: acc.hurt_pct });
    if (acc.boon) ops.push(...applyEffect(data, 'boon', randomEffect(data, 'boon', 1)));
    if (acc.curse) ops.push(...applyEffect(data, 'curse', randomEffect(data, 'curse', 2)));
    data.notices.unshift({ kind: 'event', id: cell.event, loot: cell.loot || null });
    return { ops };
  }
  return { code: 'expedition_no_offer', error: 'Nothing to choose here' };
}

// The modifiers for a fight started now in `cell`: the torch stage, every
// lasting boon and curse, and an elite room's own. Summed per side, plus the
// list of what contributed, for the client.
function fightMods(data, cell) {
  const total = { player: { initiative: 0, armor: 0, power_pct: 0 }, enemy: { initiative: 0, armor: 0, power_pct: 0 } };
  const sources = [];
  const add = (mods, source) => {
    let any = false;
    for (const side of ['player', 'enemy']) {
      for (const [k, v] of Object.entries(mods?.[side] || {})) {
        if (!v) continue;
        total[side][k] = (total[side][k] || 0) + v;
        any = true;
      }
    }
    if (any) sources.push(source);
  };
  const stage = EXP.torchStage(data.torch);
  if (stage) add(stage.mods, { kind: 'torch', id: stage.id });
  for (const e of data.effects || []) {
    const def = (e.kind === 'boon' ? EXP.BOONS : EXP.CURSES)[e.id];
    if (def?.mods) add(def.mods, { kind: e.kind, id: e.id });
  }
  if (cell?.type === 'elite') add(EXP.ELITE.mods, { kind: 'elite', id: 'elite' });
  return { ...total, sources };
}

// After a won fight: every lasting effect has one fight fewer to run.
function tickEffects(data) {
  data.effects = (data.effects || [])
    .map(e => ({ ...e, fights_left: e.fights_left - 1 }))
    .filter(e => e.fights_left > 0);
}

// Formation check for a camp reshuffle: every living squad unit on a cell of
// its side (0–5), and no two footprints overlapping. `sizeOf(id)` gives a
// unit's size: 'tile', 'row' or 'column'.
function footprint(cell, size) {
  const rows = 3, cols = 2;
  const r = Math.floor(cell / cols), c = cell % cols;
  if (size === 'row') return [r * cols, r * cols + 1];
  if (size === 'column') {
    const top = r <= rows - 2 ? r : r - 1;
    return [top * cols + c, (top + 1) * cols + c];
  }
  return [cell];
}

function validateFormation(livingIds, placement, sizeOf) {
  if (!placement || typeof placement !== 'object') return 'Invalid placement';
  const ids = livingIds.map(String);
  const keys = Object.keys(placement).map(String);
  if (keys.length !== ids.length || keys.some(k => !ids.includes(k))) return 'Every living unit must be placed';
  const taken = new Set();
  for (const id of ids) {
    const cell = Number(placement[id]);
    if (!Number.isInteger(cell) || cell < 0 || cell > 5) return 'Invalid cell';
    for (const c of footprint(cell, sizeOf(id))) {
      if (taken.has(c)) return 'Units overlap';
      taken.add(c);
    }
  }
  return null;
}

function addLoot(bank, loot, share = 1) {
  const out = {
    gold: bank.gold || 0,
    xp:   bank.xp || 0,
    crystals: { ...(bank.crystals || {}) },
    trophies: { ...(bank.trophies || {}) },
  };
  if (!loot) return out;
  out.gold += Math.floor((loot.gold || 0) * share);
  out.xp   += Math.floor((loot.xp || 0) * share);
  for (const [k, v] of Object.entries(loot.crystals || {})) out.crystals[k] = (out.crystals[k] || 0) + Math.floor(v * share);
  for (const [k, v] of Object.entries(loot.trophies || {})) out.trophies[k] = (out.trophies[k] || 0) + Math.floor(v * share);
  return out;
}

// The bank scaled down for an early exit (abandon). Floors, so half of 1 trophy
// is none.
function scaleBank(bank, share) {
  return addLoot({ gold: 0, xp: 0, crystals: {}, trophies: {} }, bank, share);
}

// A won fight: the cell is cleared, its loot banked, the dead noted, and the
// lasting effects tick down.
function settleWonFight(data, { fallenIds = [] } = {}) {
  const at = data.pending || data.pos;
  const cell = cellAt(data.map, at.x, at.y);
  if (cell && !data.cleared.includes(keyOf(cell))) data.cleared.push(keyOf(cell));
  if (cell?.type === 'fight' || cell?.type === 'elite') data.bank = addLoot(data.bank, cell.loot);
  data.fallen = [...new Set([...(data.fallen || []), ...fallenIds.map(String)])];
  data.pending = null;
  data.battle_id = null;
  data.fights += 1;
  data.notices = [];
  tickEffects(data);
  return cell;
}

// What the client is allowed to see. Unrevealed cells carry no type, and fight
// contents are never sent here (the route adds the lineup of a pending fight).
function clientView(run) {
  const data = run.data;
  const { map } = data;
  const visited  = new Set(data.visited);
  const revealed = new Set(data.revealed);
  const cleared  = new Set(data.cleared);
  const used     = new Set(data.used || []);

  const cells = map.cells.map(c => {
    const k = keyOf(c);
    const known = revealed.has(k) || visited.has(k);
    return {
      x: c.x, y: c.y,
      known,
      type:    known ? c.type : null,
      visited: visited.has(k),
      cleared: cleared.has(k),
      used:    used.has(k),
    };
  });
  // Walls are seen from inside a room: those on the edges of visited cells.
  const walls = map.walls.filter(w => w.split('|').some(k => visited.has(k)));

  const here = cellAt(map, data.pos.x, data.pos.y);
  const stage = EXP.torchStage(data.torch);
  let offer = null;
  if (data.offer && !data.pending && !data.battle_id) {
    offer = { ...data.offer };
    if (offer.kind === 'shrine') offer.options = (here?.options || []).slice();
    if (offer.kind === 'event') offer.event = here?.event || null;
  }
  return {
    id:        run.id,
    region_id: run.region_id,
    level:     run.level,
    status:    run.status,
    outcome:   run.outcome || null,
    size:      map.size,
    mode:      map.mode,
    pos:       { ...data.pos },
    prev:      data.prev ? { ...data.prev } : null,
    cells,
    walls,
    moves:     allowedMoves(data),
    pending:   data.pending ? { ...data.pending, goal: cellAt(map, data.pending.x, data.pending.y)?.type === 'goal' } : null,
    at_exit:   here?.type === 'exit' && !data.pending,
    // The goal has fallen: the level is cleared and leaving from anywhere keeps
    // the whole haul.
    goal_cleared: !!data.goal_cleared,
    offer,
    torch:     data.torch ? { ...data.torch, stage: stage?.id || null } : null,
    effects:   (data.effects || []).map(e => ({ ...e })),
    notices:   (data.notices || []).map(n => ({ ...n })),
    battle_id: data.battle_id || null,
    bank:      data.bank,
    squad:     {
      roster_ids: (data.squad?.playerUnitIds || []).map(u => String(u._rosterId || u.id)),
      fallen:     data.fallen || [],
      placement:  { ...(data.squad?.placement || {}) },
    },
    steps:     data.steps,
    fights:    data.fights,
  };
}

module.exports = {
  makeRng, cellKey, keyOf, edgeKey, openNeighbours, canStep, distancesFrom,
  generateMap, validateMap, cellAt, newRunData, revealAround, allowedMoves,
  applyMove, chooseOffer, applyEffect, fightMods, tickEffects, footprint, validateFormation,
  isLiveFight, addLoot, scaleBank, settleWonFight, clientView,
};
