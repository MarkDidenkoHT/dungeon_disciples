const assert = require('node:assert/strict');
const test = require('node:test');
const { SPELLS } = require('../data/spells.js');
const { UNIT_ABILITIES } = require('../data/unit_abilities.js');
const { BattleEngine } = require('../utils/battle-engine.js');

function makeUnit(engine, id, side, { ability = null, passive = null, hero = false } = {}) {
  return engine.createCombatant({
    id,
    name: id,
    max_hp: 100,
    action: 'attack',
    target_type: 'enemy',
    action_power: 10,
    ability,
    passive,
    is_hero: hero,
    spells: hero ? ['test_spell'] : [],
  }, side, 0);
}

test('Second Wind refreshes used ally abilities, but not heroes or enemies', () => {
  const engine = new BattleEngine(null);
  const spent = makeUnit(engine, 'spent', 'player', { ability: 'test_ability' });
  const ready = makeUnit(engine, 'ready', 'player', { ability: 'test_ability' });
  const hero = makeUnit(engine, 'hero', 'player', { ability: 'test_ability', hero: true });
  const enemy = makeUnit(engine, 'enemy', 'enemy', { ability: 'test_ability' });
  engine.combatants = [spent, ready, hero, enemy];
  spent.used_active = true;
  hero.used_active = true;
  enemy.used_active = true;

  const spell = SPELLS.empire.find(def => def.id === 'e_spell_8');
  assert.equal(spell.power_cost, 3);
  assert.equal(spell.max_power, 3);
  engine.power.player = 3;
  const cast = engine.doCast(hero, spell, { power: 5 });

  assert.deepEqual(cast, { ok: true, spent: 3, remaining: 0 });
  assert.equal(spent.used_active, false);
  assert.equal(ready.used_active, false);
  assert.equal(hero.used_active, true);
  assert.equal(enemy.used_active, true);
});

for (const [faction, spellId] of [
  ['choir_of_the_cursed', 'd_spell_8'],
  ['grail_of_sorrow', 'g_spell_8'],
]) {
  test(`${faction} ability cooldown spell disables enemy unit abilities`, () => {
    const engine = new BattleEngine(null);
    const ally = makeUnit(engine, 'ally', 'player', { ability: 'test_ability' });
    const enemy = makeUnit(engine, 'enemy', 'enemy', { ability: 'test_ability' });
    const enemyWithoutAbility = makeUnit(engine, 'enemy_without_ability', 'enemy');
    engine.combatants = [ally, enemy, enemyWithoutAbility];
    const spell = SPELLS[faction].find(def => def.id === spellId);

    assert.equal(spell.power_cost, 3);
    assert.equal(spell.max_power, 3);
    engine.castSpell(spell, { casterSide: 'player', power: 3 });

    assert.equal(enemy.used_active, true);
    assert.equal(ally.used_active, false);
    assert.equal(enemyWithoutAbility.used_active, false);
  });
}

test('Sanctified Words repeats the litany at base strength when its carrier uses an ability', () => {
  const engine = new BattleEngine(null);
  const owner = makeUnit(engine, 'sanctified', 'player', {
    ability: 'litany_test_ability',
    passive: ['sanctified_words 1'],
  });
  const ally = makeUnit(engine, 'ally', 'player');
  const enemy = makeUnit(engine, 'enemy', 'enemy');
  const litany = { id: 'duty_eternal', name: 'Duty Eternal', bonus: { shield_flat: 5 } };
  engine.ABILITIES = {
    ...UNIT_ABILITIES,
    litany_test_ability: { id: 'litany_test_ability', name: 'Test Ability', type: 'active', target: 'enemy' },
  };
  engine.combatants = [owner, ally, enemy];
  engine.litanyFormationForSide = side => side === 'player' ? { def: litany, lead: owner } : null;

  engine.fireTrigger('on_battle_start', {});
  engine.applyLitanyBonuses();
  assert.equal(owner._shield, 10);
  assert.equal(ally._shield, 10);

  engine.doAbility(owner, enemy);

  assert.equal(owner._shield, 15);
  assert.equal(ally._shield, 15);
  assert.equal(enemy._shield, 0);
});
