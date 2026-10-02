// The item catalog, drawn with the game's own card builder.
//
// Nothing here is a mock-up: ITEM_DEFS is the file the forge crafts from, and
// buildItemCard is the function that draws the card in the game's item sheet.
// The demo only decides which subset to show and what happens on a tap.
import { ITEM_DEFS } from '../vendor/data/items.js';
import { buildItemCard, buildItemModalParts, openSheet, CRYSTAL_ICONS, GOLD_ICON } from '../vendor/public/utils.js';
import { player, L, t, seedResources, renderResourceBar } from './demo-boot.js';

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

// A forge-ready purse, so the prices in a card's sheet read against something.
seedResources({
  Gold:            1450,
  Crystals_Life:   96,
  Crystals_Fire:   74,
  Crystals_Death:  58,
  Crystals_Frost:  61,
  Crystals_Nature: 45,
  Crystals_Air:    83,
});
renderResourceBar(document.getElementById('resource-bar'));

const tabsEl = document.getElementById('tabs');
const gridEl = document.getElementById('grid');
let active   = 'all';

// Materials are crystals, gold or trophy ids. The first two have icons in the
// game; a trophy is named, because its icon lives behind a roster lookup the
// demo has no reason to carry.
function costLine(def) {
  const parts = Object.entries(def.cost || {}).map(([item, amount]) => {
    if (item === 'Gold') return `${GOLD_ICON}${amount}`;
    if (CRYSTAL_ICONS[item]) return `${CRYSTAL_ICONS[item]}${amount}`;
    return `${amount} × ${item.replace(/_/g, ' ')}`;
  });
  if (!parts.length) return '';
  return `<div class="demo-note">${t('Crafted from', 'Создаётся из')}: ${parts.join(' · ')}</div>`;
}

function render() {
  const shown = active === 'all' ? DEFS : DEFS.filter(d => d.rarity === active);

  tabsEl.innerHTML = RARITIES.map(r => `
    <button class="demo-tab${r.id === active ? ' demo-tab--on' : ''}" data-rarity="${r.id}" type="button">
      ${r.label[L]}
    </button>`).join('');

  gridEl.innerHTML = shown.map(def => `<div data-key="${def.key}">${buildItemCard(def, player)}</div>`).join('');
}

tabsEl.addEventListener('click', e => {
  const btn = e.target.closest('.demo-tab');
  if (!btn) return;
  active = btn.dataset.rarity;
  render();
});

gridEl.addEventListener('click', e => {
  const holder = e.target.closest('[data-key]');
  if (!holder) return;
  const def   = ITEM_DEFS[holder.dataset.key];
  const parts = buildItemModalParts(def, player);
  openSheet(parts.title, parts.body + costLine(def), parts.badges);
});

render();
