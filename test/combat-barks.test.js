const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { BARK_UNIT_GROUPS, COMBAT_BARKS } = require('../data/combat_barks.js');
const { BattleEngine } = require('../utils/battle-engine.js');

function makeUnit(engine, definitionId, name, side, cellIndex, tags = []) {
  return engine.createCombatant({
    id: definitionId,
    name,
    f: 'e',
    tags,
    hp: 50,
    action: 'attack',
    target_type: 'enemy',
    action_power: 10,
  }, side, cellIndex);
}

function withCertainBark(run) {
  const random = Math.random;
  Math.random = () => 0;
  try {
    run();
  } finally {
    Math.random = random;
  }
}

test('bark groups use explicit, non-overlapping unit IDs', () => {
  assert.deepEqual(BARK_UNIT_GROUPS.empire_sisters, [
    'e8', 'e81', 'e811', 'e8111', 'e82', 'e821', 'e8211',
  ]);
  assert.deepEqual(BARK_UNIT_GROUPS.empire_bound_sentinels, ['e3', 'e31', 'e311', 'e3111']);

  const unitSource = fs.readFileSync(require.resolve('../data/units.js'), 'utf8');
  const unitIds = new Set(
    [...unitSource.matchAll(/id:\s*'([^']+)',\s*f:\s*'[egd]'/g)].map((match) => match[1]),
  );
  const litanySource = fs.readFileSync(require.resolve('../data/litanies.js'), 'utf8');
  const heroIds = new Set([...litanySource.matchAll(/'((?:h_e|h_g|h_d)_[^']+)'/g)].map((match) => match[1]));
  const groupedIds = Object.values(BARK_UNIT_GROUPS).flat();
  assert.equal(new Set(groupedIds).size, groupedIds.length, 'a unit must belong to only one group');
  for (const id of groupedIds) {
    assert.ok(unitIds.has(id) || heroIds.has(id), `group references unknown unit ID ${id}`);
  }
  for (const id of unitIds) {
    assert.ok(groupedIds.includes(id), `playable unit ${id} has no bark group`);
  }

  const engine = new BattleEngine(null);
  const unrelatedConstruct = makeUnit(
    engine, 'other_construct', 'Other Construct', 'player', 0,
    ['Construct', 'Warrior', 'Spirit'],
  );
  assert.equal(engine.barkFilterScore({ group: 'empire_bound_sentinels' }, unrelatedConstruct), -1);
});

test('bark data contains no deprecated triggers or overlapping selectors', () => {
  const triggers = new Set(['on_hit', 'on_kill', 'on_death', 'on_buff', 'on_healed', 'on_battle_start']);
  for (const rule of COMBAT_BARKS) {
    assert.ok(triggers.has(rule.trigger), `deprecated trigger ${rule.trigger}`);
    for (const selector of [rule.actor, rule.target].filter(Boolean)) {
      assert.deepEqual(Object.keys(selector).filter(key => !['id', 'ids', 'group'].includes(key)), []);
    }
  }
});

test('a configured buff exchange emits one bark for each matching unit', () => {
  const engine = new BattleEngine(null);
  const sister = makeUnit(engine, 'e8', 'Sister Novice', 'player', 0);
  const templar = makeUnit(engine, 'e211', 'Mithrails Champion', 'player', 1);
  sister.unit_data.action = 'empower';
  sister.unit_data.action_power = 5;
  engine.combatants = [sister, templar];

  withCertainBark(() => engine.executeAction(sister, templar, 'attack', { turnStart: false }));

  const barks = engine.log.filter(entry => entry.type === 'bark');
  assert.equal(barks.length, 2);
  assert.deepEqual(barks.map(({ actorId, text, text_ru }) => ({ actorId, text, text_ru })), [
    { actorId: sister.id, text: 'What is your duty?', text_ru: 'В чём твой долг?' },
    { actorId: templar.id, text: 'To serve Mithrail’s will.', text_ru: 'Служить воле Митраила.' },
  ]);
});

test('a buff exchange does not match a unit outside the selected branch even with shared tags', () => {
  const engine = new BattleEngine(null);
  const sister = makeUnit(engine, 'e8', 'Sister Novice', 'player', 0);
  const unrelated = makeUnit(engine, 'other', 'Other Knight', 'player', 1, ['Knight', 'Holy']);

  withCertainBark(() => engine.checkBark('on_buff', sister, { target: unrelated }));

  assert.equal(engine.log.filter(entry => entry.type === 'bark').length, 0);
});

test('canonical hit events select only their explicit unit group', () => {
  const engine = new BattleEngine(null);
  const sentinel = makeUnit(engine, 'e31', 'Iron Automaton', 'player', 0);
  const enemy = makeUnit(engine, 'x1', 'Enemy', 'enemy', 1);

  withCertainBark(() => engine.checkBark('on_hit', sentinel, { target: enemy }));

  assert.equal(engine.log.filter(entry => entry.type === 'bark').length, 1);
});

test('a successful heal reaches the group-based on_healed event', () => {
  const engine = new BattleEngine(null);
  const sister = makeUnit(engine, 'e8', 'Sister Novice', 'player', 0);
  const ally = makeUnit(engine, 'e211', 'Mithrails Champion', 'player', 1);
  engine.combatants = [sister, ally];

  withCertainBark(() => engine.fireHealTriggers(sister, ally, 5));

  const barks = engine.log.filter(entry => entry.type === 'bark');
  assert.equal(barks.length, 2);
  assert.equal(barks[0].actorId, sister.id);
  assert.equal(barks[0].text, 'Your hand is steady again.');
  assert.equal(barks[1].actorId, ally.id);
  assert.equal(barks[1].text, 'Then I have no excuse.');
});

test('the event dispatcher applies branch barks to hit and kill events', () => {
  const engine = new BattleEngine(null);
  const sentinel = makeUnit(engine, 'e31', 'Iron Automaton', 'player', 0);
  const target = makeUnit(engine, 'enemy', 'Enemy', 'enemy', 1);
  engine.combatants = [sentinel, target];

  withCertainBark(() => {
    engine.fireTrigger('on_hit', { actor: sentinel, target, dmg: 4 });
    target.alive = false;
    engine.fireTrigger('on_kill', { actor: sentinel, target, dmg: 4 });
  });

  const barks = engine.log.filter(entry => entry.type === 'bark');
  assert.equal(barks.length, 2);
  assert.equal(barks[0].text, 'I remember this weight. It is welcome.');
  assert.equal(barks[1].text, 'The living may pass in peace.');
});

test('a target-specific branch bark outranks the actor-only bark', () => {
  const engine = new BattleEngine(null);
  const templar = makeUnit(engine, 'e211', 'Mithrails Champion', 'player', 0);
  const risen = makeUnit(engine, 'gs1', 'Risen', 'enemy', 1);

  withCertainBark(() => engine.checkBark('on_hit', templar, { target: risen }));

  const barks = engine.log.filter(entry => entry.type === 'bark');
  assert.equal(barks.length, 1);
  assert.equal(barks[0].text, 'The grave called. You refused its peace.');
});
