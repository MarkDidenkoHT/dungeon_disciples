// The game's real transmutation page, on a purse that exists only in this tab.
import { mountTransmutation } from '../vendor/public/transmute.js';
import { player, demoState, seedResources } from './demo-boot.js';

// Deliberately uneven. The widget caps the batch at whatever the two paid
// crystals can cover, which is only visible when the player does not have round
// numbers of everything.
seedResources({
  Gold:            820,
  Crystals_Life:   64,
  Crystals_Fire:   41,
  Crystals_Death:  28,
  Crystals_Frost:  37,
  Crystals_Nature: 19,
  Crystals_Air:    52,
});

mountTransmutation(document.getElementById('host'), {
  player,
  getResources:       () => demoState.resources,
});
