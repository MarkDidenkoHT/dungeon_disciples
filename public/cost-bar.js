import { assetUrl } from './asset_base.js';
import { RESOURCE_BAR_SLOTS } from './utils.js';

const COST_BAR_ID = 'shared-cost-bar';

export function hideCostBar() {
  document.getElementById(COST_BAR_ID)?.remove();
}

// Put the row in the DOM without showing it. A screen that WILL price something
// — the castle, the spell tome — can pay for the mount on the way in, so the
// first sheet the player opens reveals a row that is already built and already
// laid out rather than inserting one next to the resource strip mid-interaction.
// Nothing is priced yet at that point, so the row stays hidden until it is.
export function primeCostBar(opts = {}) {
  mountCostBar(null, opts, { hidden: true });
}

// `amountOf(key)` tells the bar what the player holds, `lang` picks the tooltip
// wording, and `onMaterialClick(key)` is what a shortfall column opens. Injected
// so the castle can answer with its own sub-sheet and the spell tome with its own.
export function showCostBar(cost, opts = {}) {
  const entries = Object.entries(cost || {}).filter(([, amt]) => Number(amt) > 0);
  // Nothing to pay is not a reason to tear the row out: it drops back to the
  // primed state so the next sheet still finds it mounted.
  if (!entries.length) { primeCostBar(opts); return; }
  mountCostBar(cost, opts, { hidden: false });
}

function mountCostBar(cost, { amountOf, lang = 'en', onMaterialClick } = {}, { hidden } = {}) {
  hideCostBar();
  const entries = Object.entries(cost || {}).filter(([, amt]) => Number(amt) > 0);

  const resourceRow = document.getElementById('resource-bar-row');
  if (!resourceRow) return;

  // 'gold' in a cost map is the same resource as 'Gold' in the strip above.
  const required = {};
  for (const [item, amt] of entries) {
    const key = item === 'gold' ? 'Gold' : item;
    required[key] = (required[key] || 0) + Number(amt);
  }

  // The aligned slots. A slot with nothing to pay still renders, dimmed,
  // so every column keeps its position under the strip above.
  const slotHtml = (iconHtml, key, label, need) => {
    const have  = amountOf(key);
    const short = have < need;
    // A cost you cannot meet is a question — "where do I get this?" — so the
    // column answers it. Short ones become buttons carrying the material; the
    // ones you can already pay stay inert, since there is nothing to go and
    // find. Covers building costs and mercenary trophy costs alike: both are
    // priced through this same bar.
    const title = `${label}: ${lang === 'ru' ? `нужно ${need}, есть ${have}` : `need ${need}, have ${have}`}`;
    if (!short) {
      return `<div class="res-bar-item cost-bar-item cost-bar-item--ok" title="${title}">
                <span class="res-bar-icon">${iconHtml}</span>
                <span class="res-bar-val">${need}</span>
              </div>`;
    }
    return `<button class="res-bar-item cost-bar-item cost-bar-item--short" data-material="${key}" title="${title}">
              <span class="res-bar-icon">${iconHtml}</span>
              <span class="res-bar-val">${need}</span>
            </button>`;
  };

  const slots = RESOURCE_BAR_SLOTS.map(slot => {
    const need = required[slot.key] ?? 0;
    if (!need) {
      return `<div class="res-bar-item cost-bar-item cost-bar-item--idle">
                <span class="res-bar-icon">${slot.icon}</span>
                <span class="res-bar-val">·</span>
              </div>`;
    }
    return slotHtml(slot.icon, slot.key, slot.label, need);
  }).join('');

  // Trophy costs (mercenary upgrades) have no column above to line up with.
  const extras = Object.entries(required)
    .filter(([key]) => !RESOURCE_BAR_SLOTS.some(s => s.key === key))
    .map(([key, need]) => {
      const name = key.replace(/_/g, ' ');
      const icon = `<img src="${assetUrl(`/assets/icons/recources/${key}.png`)}" class="res-icon-img" alt="${name}" onerror="this.style.visibility='hidden'">`;
      return slotHtml(icon, key, name, need);
    }).join('');

  const bar = document.createElement('div');
  bar.id = COST_BAR_ID;
  bar.className = 'cost-bar-row';
  // Mounted but not shown. `hidden` (not a display:none of our own) so the row
  // is out of the layout AND out of the accessibility tree — a priced-nothing
  // strip of dimmed dots is noise to a screen reader too.
  if (hidden) bar.hidden = true;
  // The two ghost cells stand in for the timeline / errands buttons that flank
  // the strip above. Without them this bar would start at the screen edge and
  // every column would sit one button-width to the left.
  bar.innerHTML = `
    <span class="res-bar-btn cost-bar-ghost" aria-hidden="true"></span>
    <div class="resource-bar cost-bar">${slots}${extras}</div>
    <span class="res-bar-btn cost-bar-ghost" aria-hidden="true"></span>`;
  // The bar lives outside #content-root, next to the resource strip, so no
  // screen-level delegation reaches it — it carries its own listener.
  bar.addEventListener('click', e => {
    const chip = e.target.closest('[data-material]');
    if (chip) onMaterialClick?.(chip.dataset.material);
  });
  resourceRow.insertAdjacentElement('afterend', bar);
}