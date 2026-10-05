// The item catalog, drawn with the game's own card builder.
//
// Nothing here is a mock-up: ITEM_DEFS is the file the forge crafts from, and
// buildItemCard is the function that draws the card in the game's item sheet.
// The demo only decides which subset to show.
//
// The cards do not open anything. The game's card already carries the name, the
// rarity, the stat chips, the passive and its description, and the tags it needs
// or grants — tapping one opened a sheet holding the same card again. One card,
// read where it stands.
import { ITEM_DEFS } from '../vendor/data/items.js';
import { buildItemCard } from '../vendor/public/utils.js';
import { player, L } from './demo-boot.js';

// The power ladder, then SHATTERED — which is not on it. See the note at the
// top of data/items.js: a shattered item is epic in scale and priced like one,
// and is its own rarity so tournament rules can budget it separately.
const RARITIES = [
  { id: 'all',       label: { en: 'All',       ru: 'Все' } },
  { id: 'common',    label: { en: 'Common',    ru: 'Обычные' } },
  { id: 'rare',      label: { en: 'Rare',      ru: 'Редкие' } },
  { id: 'epic',      label: { en: 'Epic',      ru: 'Эпические' } },
  { id: 'mythic',    label: { en: 'Mythic',    ru: 'Мифические' } },
  { id: 'shattered', label: { en: 'Shattered', ru: 'Расколотые' } },
];

const RARITY_ORDER = ['common', 'rare', 'epic', 'mythic', 'shattered'];

const DEFS = Object.values(ITEM_DEFS)
  .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)
               || String(a.name).localeCompare(String(b.name)));

const tabsEl = document.getElementById('tabs');
const gridEl = document.getElementById('grid');
let active   = 'all';

function render() {
  const shown = active === 'all' ? DEFS : DEFS.filter(d => d.rarity === active);

  tabsEl.innerHTML = RARITIES.map(r => `
    <button class="demo-tab${r.id === active ? ' demo-tab--on' : ''}" data-rarity="${r.id}" type="button">
      ${r.label[L]}
    </button>`).join('');

  gridEl.innerHTML = shown.map(def => buildItemCard(def, player)).join('');
}

tabsEl.addEventListener('click', e => {
  const btn = e.target.closest('.demo-tab');
  if (!btn) return;
  active = btn.dataset.rarity;
  render();
});

render();
