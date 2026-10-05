// The weekly faction boss, drawn by the game's own Colossus page.
//
// renderColossusPage is imported unchanged, so the health bars, the phase
// ladder, the milestone track and the resting-unit row are the real ones. What
// the demo supplies is the week's state — three bosses at different healths, a
// leaderboard and a couple of exhausted units.
//
// `Attack` in the game opens a battle. There is no battle engine on this page,
// so here it resolves a round's worth of damage against the boss: the point it
// has to make is the phase ladder — the Colossus changes what it does as its
// health falls, and the card reads differently at every step.
import { renderColossusPage } from '../vendor/public/colossus-page.js';
import {
  COLOSSUS_MAX_HP, COLOSSUS_MILESTONES, colossusPhaseFor, colossusWeek,
} from '../vendor/data/colossus.js';
import {
  player, faction, FACTIONS, L, demoState, seedResources,
} from './demo-boot.js';

const OTHERS = Object.keys(FACTIONS).filter(f => f !== faction);

// Two units sleeping it off, so the wake buttons have something to wake. The
// Colossus rests whoever fought it until they are paid for.
const RESTING = {
  empire:              ['h_e_1', 'e421'],
  choir_of_the_cursed: ['h_d_1', 'd41'],
  grail_of_sorrow:     ['h_g_1', 'gs21'],
};
demoState.roster = (RESTING[faction] || RESTING.empire).map((unit_id, i) => ({
  id: `rest-${i}`, unit_data: { unit_id },
}));
seedResources({
  Gold:            400,
  Crystals_Life:   52,
  Crystals_Fire:   38,
  Crystals_Death:  44,
  Crystals_Frost:  26,
  Crystals_Nature: 31,
  Crystals_Air:    40,
  health_potion:   6,
});
// The wake button is billed in gold and potions, and the two live in different
// lists in the game's bootstrap — resources and tokens.
demoState.tokens = [{ item: 'health_potion', amount: 6 }];

const week = colossusWeek();

function boss(factionId, hp) {
  return {
    faction: factionId,
    hp,
    max_hp: COLOSSUS_MAX_HP,
    phase: colossusPhaseFor(hp).id,
    killed_at: null,
    contributors: factionId === faction ? 14 : 9 + Math.floor(hp / 2000),
    attempts: factionId === faction ? 61 : 40,
    top: factionId === faction
      ? [
          { rank: 1, name: 'Varnan',  damage: 1840 },
          { rank: 2, name: 'Iselde',  damage: 1465 },
          { rank: 3, me: true,        damage: 1120 },
          { rank: 4, name: 'Korrath', damage: 870 },
        ]
      : [],
  };
}

// Your own faction's Colossus is the one you can hit, so it is the one with
// room left to fall. One rival is further along and one is nearly finished —
// the race between the three is the whole point of the week.
const state = {
  faction,
  week: { ...week, resets_at: week.resetsAt },
  bosses: [boss(faction, 6400), boss(OTHERS[0], 3100), boss(OTHERS[1], 900)],
  resting_roster_ids: demoState.roster.map(u => u.id),
  kill_rewards: [],
  me: { damage: 1120, attempts: 7, rank: 3 },
};

function nextMilestone(damage) {
  return COLOSSUS_MILESTONES.find(m => m.damage > damage) ?? null;
}
state.me.next_milestone = nextMilestone(state.me.damage);

demoState.colossus = state;

async function render() {
  await renderColossusPage(document.getElementById('host'), state, {
    player,
    L,
    onAttack:  attack,
    onRefresh: () => render(),
  });
}

function attack() {
  const mine = state.bosses[0];
  if (mine.hp <= 0) return;
  // About what a mid-game party takes off it in one battle.
  const hit = 240 + Math.floor(Math.random() * 420);
  mine.hp = Math.max(0, mine.hp - hit);
  mine.phase = colossusPhaseFor(mine.hp).id;
  mine.attempts += 1;
  if (mine.hp === 0) {
    mine.killed_at = Date.now();
    mine.kill_rank = 1;
  }
  state.me.damage += hit;
  state.me.attempts += 1;
  state.me.next_milestone = nextMilestone(state.me.damage);
  const me = mine.top.find(row => row.me);
  if (me) me.damage = state.me.damage;
  mine.top.sort((a, b) => b.damage - a.damage).forEach((row, i) => { row.rank = i + 1; });
  state.me.rank = me?.rank ?? state.me.rank;
  // Two more units come back tired from every run at it.
  state.resting_roster_ids = demoState.roster.map(u => u.id);
  render();
}

render();
