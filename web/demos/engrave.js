// The game's real engraving page over a hand-made roster.
//
// The widget reads the unit from data/units.js and the stat maths from
// data/engravings.js, so every number the demo shows is the number the game
// would show for that unit at that tier.
import { mountEngraving } from '../vendor/public/engrave.js';
import { ENGRAVING_CURRENCY, ENGRAVING_TOKEN } from '../vendor/data/engravings.js';
import {
  player, faction, demoState, seedResources, renderResourceBar, renderValorBar,
} from './demo-boot.js';

// Three units per faction, picked because they have portrait art and sit at
// different points on the stat ladder — a wall, a striker and a caster, so the
// + / − trade reads differently on each.
const ROSTERS = {
  empire:              ['h_e_1', 'e421', 'e61'],
  choir_of_the_cursed: ['h_d_1', 'd41',  'd61'],
  grail_of_sorrow:     ['h_g_1', 'gs21', 'gs61'],
};

demoState.roster = (ROSTERS[faction] || ROSTERS.empire).map((unit_id, i) => ({
  id: `demo-${i}`,
  unit_data: { unit_id },
  engraving: null,
}));
demoState.items = [];

// One epic's worth of everything, so the top tier is reachable from the start —
// a locked tier row would be a worse demo than an affordable one.
// The crystals are not spent here, but the strip above the page is the game's
// and shows all seven slots — leaving them at zero would read as a broken
// read-out rather than as "this page does not want crystals".
seedResources({
  [ENGRAVING_CURRENCY]: 2400,
  [ENGRAVING_TOKEN]:    12,
  Gold:            1200,
  Crystals_Life:   74,
  Crystals_Fire:   48,
  Crystals_Death:  53,
  Crystals_Frost:  29,
  Crystals_Nature: 36,
  Crystals_Air:    62,
});

const resBar   = document.getElementById('resource-bar');
const valorBar = document.getElementById('valor-bar');
const draw = () => { renderResourceBar(resBar); renderValorBar(valorBar); };

demoState.onChange = draw;
draw();

mountEngraving(document.getElementById('host'), {
  player,
  getUnits:     () => demoState.roster,
  getItems:     () => demoState.items,
  getResources: () => demoState.resources,
  onChanged:    async () => draw(),
});
