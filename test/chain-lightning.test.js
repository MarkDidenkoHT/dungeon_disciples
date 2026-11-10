const assert = require('node:assert/strict');
const test = require('node:test');
const { UNIT_ABILITIES } = require('../data/unit_abilities.js');
const { BattleEngine } = require('../utils/battle-engine.js');

// A Metallon caster (air attack, Chain passive, Chain Lightning) against four
// enemies with no air resistance, so the arithmetic is the raw share of power.
function setup(abilityKey, chainPassive = 'chain 1') {
  const engine = new BattleEngine(null);
  engine.ABILITIES = UNIT_ABILITIES;
  const caster = engine.createCombatant({
    id: 'caster', name: 'Metallon Invoker',
    action: 'attack', target_type: 'enemy', targets: 1, range: 3,
    damage_source: 'air', action_power: 20,
    passive: [chainPassive], ability: abilityKey,
    hp: 50, resistances: { air: 0 },
  }, 'player', 0);
  const foes = [0, 1, 2, 3].map(i => engine.createCombatant({
    id: `foe${i}`, name: `Foe ${i}`,
    action: 'attack', target_type: 'enemy', action_power: 1,
    hp: 100, armor: 0, resistances: { air: 0 },
  }, 'enemy', i));
  engine.combatants = [caster, ...foes];
  return { engine, caster, foes };
}

const newLog = (engine, from) => engine.log.slice(from);

test('Chain Lightning 3 strikes the target, then leaps 50/40/30 to three other enemies', () => {
  const { engine, caster, foes } = setup('chain_lightning 3');
  const start = engine.log.length;
  engine.executeAction(caster, foes[0], 'ability', { turnStart: false });

  const bolts = newLog(engine, start).filter(e => e.type === 'ability' && e.ability === 'chain_lightning 3');
  assert.deepEqual(bolts.map(b => b.value), [20, 10, 8, 6]);
  assert.equal(bolts[0].targetId, foes[0].id);
  // Every hop leaps from the previous victim, and nobody is struck twice.
  for (let i = 1; i < bolts.length; i++) assert.equal(bolts[i].sourceId, bolts[i - 1].targetId);
  assert.equal(new Set(bolts.map(b => b.targetId)).size, 4);
});

test('Chain Lightning does not set off the Chain passive', () => {
  const { engine, caster, foes } = setup('chain_lightning 1');
  const start = engine.log.length;
  engine.executeAction(caster, foes[0], 'ability', { turnStart: false });

  const chainHops = newLog(engine, start).filter(e => e.type === 'passive' && e.passive === 'Chain');
  assert.equal(chainHops.length, 0);
  const damaged = foes.filter(f => f.battle_hp < f.max_hp);
  assert.equal(damaged.length, 2); // the target and its single hop
});

test('Chain Lightning stops when it runs out of fresh enemies', () => {
  const { engine, caster, foes } = setup('chain_lightning 3');
  foes[2].alive = false; foes[3].alive = false;
  const start = engine.log.length;
  engine.executeAction(caster, foes[0], 'ability', { turnStart: false });
  const bolts = newLog(engine, start).filter(e => e.type === 'ability' && e.ability === 'chain_lightning 3');
  assert.equal(bolts.length, 2);
});

test('A basic attack still chains, and the hop names the unit it leapt from', () => {
  const { engine, caster, foes } = setup('chain_lightning 1');
  const start = engine.log.length;
  engine.executeAction(caster, foes[0], 'attack', { turnStart: false });

  const hops = newLog(engine, start).filter(e => e.type === 'passive' && e.passive === 'Chain');
  assert.equal(hops.length, 1);
  assert.equal(hops[0].sourceId, foes[0].id);
  assert.notEqual(hops[0].targetId, foes[0].id);
});

test('Chain ranks apply their damage percentage to each successive hop', () => {
  for (const [rank, percentages] of [
    [1, [40]],
    [2, [40, 30]],
    [3, [40, 30, 20]],
  ]) {
    const { engine, caster, foes } = setup('chain_lightning 1', `chain ${rank}`);
    const start = engine.log.length;
    engine.executeAction(caster, foes[0], 'attack', { turnStart: false });

    const hops = newLog(engine, start).filter(e => e.type === 'passive' && e.passive === 'Chain');
    assert.equal(hops.length, percentages.length, `rank ${rank} hop count`);
    assert.deepEqual(hops.map(hop => hop.value), percentages.map(pct => Math.floor(20 * pct / 100)));
  }
});
