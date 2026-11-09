const assert = require('node:assert/strict');
const test = require('node:test');
const { UNIT_ABILITIES } = require('../data/unit_abilities.js');
const { BattleEngine } = require('../utils/battle-engine.js');

function addInfectStacks(engine, unit, count) {
  unit._infect_stacks = count;
  for (let i = 1; i <= count; i++) {
    engine.registerEffect(unit, {
      key: `healing_reduction_${i}`,
      name: 'Infect',
      polarity: 'negative',
      dispellable: true,
      restore: { _infect_stacks: -1 },
      amount: 1,
    });
  }
}

function makeEmpowerAction() {
  const engine = new BattleEngine(null);
  engine.ABILITIES = UNIT_ABILITIES;
  const sister = engine.createCombatant({
    id: 'sister',
    name: 'Sister Protector',
    action: 'empower',
    target_type: 'ally',
    action_power: 19,
    passive: ['dispel 1'],
  }, 'player', 0);
  const ally = engine.createCombatant({
    id: 'ally',
    name: 'Mithrails Exemplar',
    action: 'attack',
    target_type: 'enemy',
    action_power: 18,
  }, 'player', 1);
  engine.combatants = [sister, ally];
  addInfectStacks(engine, sister, 3);
  addInfectStacks(engine, ally, 3);
  return { engine, sister, ally };
}

test('Dispel 1 removes two Infect stacks from the chosen ally only', () => {
  const { engine, sister, ally } = makeEmpowerAction();

  engine.executeAction(sister, ally, 'attack', { turnStart: false });

  assert.equal(ally._infect_stacks, 1);
  assert.equal(sister._infect_stacks, 3);
  const dispels = engine.log.filter(entry => entry.passive === 'Dispel');
  assert.equal(dispels.length, 1);
  assert.equal(dispels[0].targetId, ally.id);
  assert.match(dispels[0].message, /\(3 → 1\)$/);
});

test('duplicate Dispel triggers in one action cannot cleanse the actor too', () => {
  const { engine, sister, ally } = makeEmpowerAction();
  const fireTrigger = engine.fireTrigger.bind(engine);
  engine.fireTrigger = (trigger, ctx) => {
    fireTrigger(trigger, ctx);
    if (trigger === 'on_pool' && ctx.actor === sister && ctx.target === ally) {
      fireTrigger(trigger, { ...ctx, target: sister });
    }
  };

  engine.executeAction(sister, ally, 'attack', { turnStart: false });

  assert.equal(ally._infect_stacks, 1);
  assert.equal(sister._infect_stacks, 3);
  const dispels = engine.log.filter(entry => entry.passive === 'Dispel');
  assert.equal(dispels.length, 1);
  assert.equal(dispels[0].targetId, ally.id);
});
