const assert = require('node:assert/strict');
const test = require('node:test');
const { BARK_UNIT_GROUPS } = require('../data/combat_barks.js');
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

test('bark groups contain explicit branch IDs and do not infer from tags', () => {
  assert.deepEqual(BARK_UNIT_GROUPS.empire_sisters, [
    'e8', 'e81', 'e811', 'e8111', 'e82', 'e821', 'e8211',
  ]);
  assert.deepEqual(BARK_UNIT_GROUPS.bound_sentinels, ['e3', 'e31', 'e311', 'e3111']);

  const engine = new BattleEngine(null);
  const unrelatedConstruct = makeUnit(
    engine, 'other_construct', 'Other Construct', 'player', 0,
    ['Construct', 'Warrior', 'Spirit'],
  );
  assert.equal(engine.barkFilterScore({ group: 'bound_sentinels' }, unrelatedConstruct), -1);
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

test('a buff exchange does not match a neighboring Templar branch by tags alone', () => {
  const engine = new BattleEngine(null);
  const sister = makeUnit(engine, 'e8', 'Sister Novice', 'player', 0);
  const templar = makeUnit(engine, 'e21', 'Templar', 'player', 1, ['Knight', 'Holy']);

  withCertainBark(() => engine.checkBark('on_buff', sister, { target: templar }));

  assert.equal(engine.log.filter(entry => entry.type === 'bark').length, 0);
});

test('canonical hit events still select existing legacy tag rules', () => {
  const engine = new BattleEngine(null);
  const vampire = makeUnit(engine, 'g1', 'Vampire', 'player', 0, ['Vampire']);
  vampire.unit_data.f = 'g';
  const demon = makeUnit(engine, 'd1', 'Demon', 'enemy', 1, ['Demon']);
  demon.unit_data.f = 'd';

  withCertainBark(() => engine.checkBark('on_hit', vampire, { target: demon }));

  assert.equal(engine.log.filter(entry => entry.type === 'bark').length, 1);
});

test('a successful heal reaches the group-based on_healed event', () => {
  const engine = new BattleEngine(null);
  const sister = makeUnit(engine, 'e8', 'Sister Novice', 'player', 0);
  const ally = makeUnit(engine, 'e211', 'Mithrails Champion', 'player', 1);
  engine.combatants = [sister, ally];

  withCertainBark(() => engine.fireHealTriggers(sister, ally, 5, 0.5));

  const barks = engine.log.filter(entry => entry.type === 'bark');
  assert.equal(barks.length, 1);
  assert.equal(barks[0].actorId, sister.id);
  assert.equal(barks[0].text, 'Back to the line.');
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
  assert.equal(barks[0].text, 'The line holds. Advance.');
  assert.equal(barks[1].text, 'One less threat to the living.');
});
