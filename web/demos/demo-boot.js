// Shared setup for every demo frame.
//
// Each demo is its own tiny page loaded in an <iframe> on the landing page.
// The iframe is why the game's stylesheet can be used verbatim: style.css
// styles `html`, `body` and `#shell` as a full-screen Telegram mini-app, which
// would fight the landing page if both lived in one document. In a frame it
// gets the whole document to itself, exactly as it does in the game.
//
// The language arrives as ?lang= on the frame's src. The landing page reloads
// its frames when the visitor switches languages rather than trying to re-render
// them in place — a widget's text is baked in at mount time (`const L = ...`),
// so a reload is both the correct answer and the cheap one.

import { setUiLanguage, applyFactionTheme } from '../vendor/public/utils.js';
import { assetUrl } from '../vendor/public/asset_base.js';
import { ENGRAVING_CURRENCY, ENGRAVING_TOKEN } from '../vendor/data/engravings.js';
import { demoState } from '../vendor/public/api.js';

export { demoState };

export const FACTIONS = {
  empire:              { label: { en: 'Empire of Aurex',      ru: 'Империя Аурекс' }, crest: 'empire' },
  choir_of_the_cursed: { label: { en: 'Choir of the Cursed', ru: 'Хор Проклятых' },   crest: 'choir' },
  grail_of_sorrow:     { label: { en: 'Grail of Sorrow',     ru: 'Грааль Скорби' },   crest: 'grail' },
};

export const L = (() => {
  const q = new URLSearchParams(location.search).get('lang');
  return q === 'ru' ? 'ru' : 'en';
})();

export const t = (en, ru) => (L === 'ru' ? ru : en);

// The faction the frame opens on, so the landing page can point a demo at a
// particular castle from its own faction cards.
export const faction = (() => {
  const q = new URLSearchParams(location.search).get('faction');
  return FACTIONS[q] ? q : 'empire';
})();

// What the vendored widgets are handed in place of a logged-in player. The
// chat_id is only ever echoed back into the stubbed endpoints.
export const player = {
  chat_id:  'demo',
  faction,
  settings: { language: L },
};

setUiLanguage(L);
document.documentElement.lang = L;
applyFactionTheme(faction);

// ── Resource read-outs ──────────────────────────────────────────────────────
// The gold / crystal strip the game hangs above every screen is deliberately
// not reproduced here. It belongs to the app shell rather than to any screen,
// and on the landing page it read as a HUD for a purse the visitor does not
// have — numbers they cannot spend, above a demo they cannot lose. The purse
// itself still exists (`seedResources`), because the widgets price against it.
//
// What the engraving page spends: Valor from the Colossus, and the tokens won
// in the Crown Tourney. Gold rides in the resource bar above it.
export function renderValorBar(el) {
  if (!el) return;
  const amountOf = key => demoState.resources.find(r => r.item === key)?.amount ?? 0;
  const chips = [
    { item: ENGRAVING_CURRENCY, icon: 'valor',         fallback: '⚔' },
    { item: ENGRAVING_TOKEN,    icon: ENGRAVING_TOKEN, fallback: '✦' },
  ];
  el.className = 'roster-trophy-bar';
  el.innerHTML = chips.map(c => `
    <div class="trophy-bar-item" title="${c.item} — ${amountOf(c.item)}">
      <div class="trophy-bar-icon-wrap">
        <img src="${assetUrl(`/assets/icons/recources/${c.icon}.png`)}"
             class="trophy-bar-icon" alt="${c.item}"
             onerror="this.style.display='none';this.nextSibling.style.display='flex';">
        <span class="trophy-bar-icon-fallback">${c.fallback}</span>
      </div>
      <span class="trophy-bar-val">${amountOf(c.item)}</span>
    </div>`).join('');
}

export function seedResources(pairs) {
  demoState.resources = Object.entries(pairs).map(([item, amount]) => ({ item, amount }));
}

// The faction switcher a few demos carry. Switching hands the choice UP to the
// landing page rather than reloading this frame on its own: the page keeps one
// faction for everything on it, so the header and the other frames have to move
// together with this one. Standalone (no parent), it still reloads itself.
export function mountFactionTabs(el) {
  if (!el) return;
  el.innerHTML = Object.entries(FACTIONS).map(([id, f]) => `
    <button class="demo-tab${id === faction ? ' demo-tab--on' : ''}" data-faction="${id}" type="button">
      ${f.label[L]}
    </button>`).join('');
  el.addEventListener('click', e => {
    const btn = e.target.closest('.demo-tab');
    if (!btn || btn.dataset.faction === faction) return;
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'sc-faction', faction: btn.dataset.faction }, '*');
      return;
    }
    location.search = `?lang=${L}&faction=${btn.dataset.faction}`;
  });
}
