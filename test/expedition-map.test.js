const test   = require('node:test');
const assert = require('node:assert/strict');

const M   = require('../utils/expedition-map');
const EXP = require('../data/expedition');
const { getLevelRewards, REGIONS } = require('../data/embark');
const { UNITS } = require('../data/units');

const REGION = 'crimson_basilica';
const LEVELS = Array.from({ length: 15 }, (_, i) => i + 1);

function gen(level, seed) {
  return M.generateMap({ seed, region_id: REGION, level, levelRewards: getLevelRewards(REGION, level) });
}

test('basilica is an expedition region, the others are not yet', () => {
  assert.equal(REGIONS.find(r => r.id === REGION).mode, 'expedition');
  for (const r of REGIONS.filter(r => r.id !== REGION)) assert.equal(r.mode, undefined);
});

test('every secondary template resolves to real enemy units', () => {
  for (const t of EXP.SECONDARY_ENCOUNTERS[REGION]) {
    assert.ok(t.min <= t.max, t.id);
    const cells = new Set();
    for (const slot of t.enemies) {
      const [region, id] = slot.key.split('.');
      assert.ok(UNITS.enemies[region]?.[id], `${t.id}: ${slot.key}`);
      assert.ok(slot.cell >= 0 && slot.cell <= 5, `${t.id}: cell ${slot.cell}`);
      assert.ok(!cells.has(slot.cell), `${t.id}: cell ${slot.cell} used twice`);
      cells.add(slot.cell);
    }
  }
  const ids = EXP.SECONDARY_ENCOUNTERS[REGION].map(t => t.id);
  assert.equal(new Set(ids).size, ids.length, 'template ids are unique');
});

test('every level has templates to draw from', () => {
  for (const level of LEVELS) {
    const n = EXP.secondaryTemplatesFor(REGION, level).length;
    const mode = EXP.MODES[EXP.modeForLevel(level)];
    assert.ok(n >= mode.fixed.fight, `level ${level} has ${n} templates`);
  }
});

test('levels 1-3 are 3x3 without walls, the rest are 5x5', () => {
  for (const level of LEVELS) {
    const map = gen(level, 1234 + level);
    if (level <= 3) {
      assert.equal(map.size, 3);
      assert.equal(map.walls.length, 0);
    } else {
      assert.equal(map.size, 5);
    }
  }
});

test('generated maps are valid across many seeds', () => {
  for (const level of LEVELS) {
    for (let seed = 1; seed <= 150; seed++) {
      const map = gen(level, seed * 104729);
      assert.equal(M.validateMap(map, { level }), null, `level ${level} seed ${seed}`);
      const count = t => map.cells.filter(c => c.type === t).length;
      const mode = EXP.MODES[map.mode];
      assert.equal(count('entrance'), 1);
      assert.equal(count('goal'), 1);
      assert.equal(count('exit'), mode.fixed.exit);
      assert.ok(count('fight') >= mode.fixed.fight, `level ${level} seed ${seed}: fights`);
      assert.ok(count('empty') >= mode.fixed.empty);
    }
  }
});

test('3x3 puts the goal in the opposite corner', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const map = gen(2, seed);
    const goal = map.cells.find(c => c.type === 'goal');
    assert.equal(goal.x, 2 - map.entrance.x);
    assert.equal(goal.y, 2 - map.entrance.y);
  }
});

test('the same seed gives the same map', () => {
  assert.deepEqual(gen(8, 99), gen(8, 99));
});

test('secondary fights carry loot below the goal reward', () => {
  const map = gen(6, 4242);
  const goal = getLevelRewards(REGION, 6);
  for (const c of map.cells.filter(c => c.type === 'fight')) {
    assert.ok(c.loot.gold > 0 && c.loot.gold < goal.gold);
    assert.ok(c.loot.xp > 0 && c.loot.xp < goal.xp);
  }
});

function runOn(level, seed) {
  const map = gen(level, seed);
  return M.newRunData({ map, squad: { playerUnitIds: [{ id: '1', _rosterId: '1' }], placement: { 1: 0 } } });
}

test('movement is orthogonal only; diagonals and jumps are refused', () => {
  const data = runOn(2, 7);
  const { x, y } = data.pos;
  const dx = x === 0 ? 1 : -1, dy = y === 0 ? 1 : -1;
  assert.equal(M.applyMove(data, { x: x + dx, y: y + dy })?.code, 'expedition_bad_move', 'diagonal');
  assert.equal(M.applyMove(data, { x: x + 2 * dx, y })?.code, 'expedition_bad_move', 'jump');
  assert.equal(M.applyMove(data, { x, y })?.code, 'expedition_bad_move', 'stay');
  for (const m of M.allowedMoves(data)) {
    assert.equal(Math.abs(m.x - x) + Math.abs(m.y - y), 1);
  }
});

test('walls block movement', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const data = runOn(9, seed);
    for (const wall of data.map.walls) {
      const [a, b] = wall.split('|').map(k => { const [x, y] = k.split(',').map(Number); return { x, y }; });
      assert.equal(M.canStep(data.map, a, b), false);
      assert.equal(M.canStep(data.map, b, a), false);
    }
  }
});

test('the entrance and some neighbours start revealed', () => {
  const data = runOn(10, 3);
  assert.ok(data.revealed.includes(M.keyOf(data.map.entrance)));
  assert.ok(data.revealed.length >= 2);
});

test('a reveal shows 2-3 open neighbours, never across a wall', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const data = runOn(12, seed);
    const before = new Set(data.revealed);
    const open = M.openNeighbours(data.map, data.pos).map(M.keyOf);
    const fresh = [...before].filter(k => k !== M.keyOf(data.pos));
    assert.ok(fresh.every(k => open.includes(k)), 'only open neighbours');
    assert.ok(fresh.length === Math.min(open.length, Math.max(2, fresh.length)) && fresh.length <= 3);
  }
});

test('stepping onto a fight commits to it: no move at all until it is fought', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const data = runOn(5, seed);
    const fightNext = M.allowedMoves(data).find(m => M.cellAt(data.map, m.x, m.y).type === 'fight');
    if (!fightNext) continue;
    const start = { ...data.pos };
    assert.equal(M.applyMove(data, fightNext), null);
    assert.deepEqual(data.pending, fightNext);
    assert.deepEqual(M.allowedMoves(data), []);
    assert.equal(M.applyMove(data, start)?.code, 'expedition_fight_pending', 'no stepping back');
    for (const n of M.openNeighbours(data.map, data.pos)) {
      assert.equal(M.applyMove(data, n)?.code, 'expedition_fight_pending');
    }
    assert.deepEqual(data.pending, fightNext);
    return;
  }
  assert.fail('no seed put a fight next to the entrance');
});

test('a won fight banks its loot, clears the cell and records the fallen', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const data = runOn(5, seed);
    const fightNext = M.allowedMoves(data).find(m => M.cellAt(data.map, m.x, m.y).type === 'fight');
    if (!fightNext) continue;
    M.applyMove(data, fightNext);
    const cell = M.settleWonFight(data, { fallenIds: ['42'] });
    assert.equal(data.pending, null);
    assert.ok(data.cleared.includes(M.keyOf(cell)));
    assert.equal(data.bank.gold, cell.loot.gold);
    assert.deepEqual(data.fallen, ['42']);
    assert.ok(M.allowedMoves(data).length > 0);
    return;
  }
  assert.fail('no seed put a fight next to the entrance');
});

test('half the bank is floored', () => {
  const half = M.scaleBank({ gold: 11, xp: 5, crystals: { Crystals_Fire: 3 }, trophies: { a: 1 } }, 0.5);
  assert.deepEqual(half, { gold: 5, xp: 2, crystals: { Crystals_Fire: 1 }, trophies: { a: 0 } });
});

test('the client view hides unrevealed cells and the walls of unvisited rooms', () => {
  const data = runOn(11, 5);
  const view = M.clientView({ id: 'r', region_id: REGION, level: 11, status: 'active', data });
  const hidden = view.cells.filter(c => !c.known);
  assert.ok(hidden.length > 0);
  assert.ok(hidden.every(c => c.type === null));
  assert.ok(view.walls.every(w => w.split('|').includes(M.keyOf(data.pos))));
  assert.equal(JSON.stringify(view).includes('template'), false, 'no fight contents');
  assert.equal(JSON.stringify(view).includes('loot'), false, 'no loot');
});
