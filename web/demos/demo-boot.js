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
    // Keeps ?demo= — the frame is one page serving every demo, so dropping it
    // would reload this one as no demo at all.
    const q = new URLSearchParams(location.search);
    q.set('lang', L);
    q.set('faction', btn.dataset.faction);
    location.search = `?${q}`;
  });
}

// ── The demos ───────────────────────────────────────────────────────────────
// Every demo used to be its own .html file, and the eight of them were the same
// document eight times over: the same head, the same stylesheet pair, the same
// .demo-root, differing only in the handful of elements the screen mounts into
// and in which module was loaded at the bottom. They are that handful of
// elements now, and `demo.html?demo=<name>` is the one page that serves them.
//
// `title` is the frame's document title; the landing page labels the <iframe>
// itself, so this is only ever read by assistive tech that reaches inside.
// `shell` is what goes inside .demo-root — the game's own classes throughout,
// because the point of a framed demo is that style.css is used verbatim.
export const DEMOS = {
  castle: {
    title: 'Castle',
    shell: `
      <div class="demo-tabs" id="factions"></div>
      <div class="screen screen-castle">
        <main class="castle-main">
          <div class="castle-grounds">
            <button class="castle-layer-arrow castle-layer-arrow--prev" id="layer-prev" type="button" aria-label="Previous"><span>&lsaquo;</span></button>
            <div class="castle-layer-viewport">
              <div class="castle-layer-track" id="castle-layer-track">
                <div class="castle-layer" data-layer="1">
                  <div class="castle-grid-wrap">
                    <div class="outer-ring" id="outer-ring"></div>
                    <div class="center-slot" id="center-slot"></div>
                  </div>
                </div>
                <div class="castle-layer" data-layer="2">
                  <div class="castle-grid-wrap castle-grid-wrap--upgrades">
                    <div class="upgrade-col" id="hall-col"></div>
                    <div class="upgrade-col" id="merc-col"></div>
                    <div class="upgrade-col" id="barracks-col"></div>
                  </div>
                </div>
              </div>
            </div>
            <button class="castle-layer-arrow castle-layer-arrow--next" id="layer-next" type="button" aria-label="Next"><span>&rsaquo;</span></button>
          </div>
        </main>
      </div>`,
  },

  heroes: {
    title: 'Heroes',
    shell: `
      <div class="demo-tabs" id="factions"></div>
      <div class="screen">
        <div class="demo-scroll">
          <div class="faction-slide-content">
            <div id="hero-card"></div>
            <p class="faction-slide-desc" id="hero-flavor"></p>
          </div>
        </div>
      </div>
      <div class="prep-track-wrap branch-track-wrap">
        <div class="portrait-track" id="hero-track"></div>
      </div>`,
  },

  evolve: {
    title: 'Unit evolution',
    shell: `
      <div class="demo-tabs" id="factions"></div>
      <div class="screen">
        <div class="demo-scroll" id="tree-host"></div>
      </div>
      <div class="prep-track-wrap branch-track-wrap">
        <div class="portrait-track" id="line-track"></div>
      </div>`,
  },

  embark: {
    title: 'Embark',
    shell: `
      <div class="screen screen-embark">
        <main class="embark-main">
          <div class="demo-scroll">
            <div class="embark-regions-grid" id="regions"></div>
          </div>
        </main>
      </div>`,
  },

  items: {
    title: 'Items',
    shell: `
      <div class="demo-tabs" id="tabs"></div>
      <div class="demo-scroll">
        <div class="demo-grid" id="grid"></div>
      </div>`,
  },

  // The tome layers are the game's own item-screen chrome: engraving and
  // transmutation are both mounted into a layer of it.
  transmute: {
    title: 'Transmutation',
    shell: `
      <div class="screen"><main class="items-main"><div class="tome-layers">
        <div class="tome-layer-viewport"><div class="tome-layer-track">
          <div class="tome-layer tome-layer--active" id="host"></div>
        </div></div>
      </div></main></div>`,
  },

  // The Valor row above the tome: in the game it belongs to the app shell
  // rather than to any screen, and a framed screen has no shell to inherit it
  // from, so demo-boot renders it (`renderValorBar`).
  engrave: {
    title: 'Engraving',
    shell: `
      <div id="valor-bar"></div>
      <div class="screen"><main class="items-main"><div class="tome-layers">
        <div class="tome-layer-viewport"><div class="tome-layer-track">
          <div class="tome-layer tome-layer--active" id="host"></div>
        </div></div>
      </div></main></div>`,
  },

  colossus: {
    title: 'Colossus',
    shell: `
      <div class="screen">
        <div class="demo-scroll">
          <div class="colossus-page" id="host"></div>
        </div>
      </div>`,
  },
};
