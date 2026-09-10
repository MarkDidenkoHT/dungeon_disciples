import { api } from '../api.js';
import { preloadAssets } from '../utils.js';
import { assetUrl } from '../asset_base.js';

// Shown in the corner of the loading screen so a player reporting a bug can say
// which build they were on. Bump this on every release.
export const GAME_VERSION = '0.4413';

const LOADING_IMAGES = [
  assetUrl('/assets/loading_screens/loading1.jpg'),
  assetUrl('/assets/loading_screens/loading2.jpg'),
  assetUrl('/assets/loading_screens/loading3.jpg'),
  assetUrl('/assets/loading_screens/loading4.jpg'),
  assetUrl('/assets/loading_screens/loading5.jpg'),
  assetUrl('/assets/loading_screens/loading6.jpg'),
  assetUrl('/assets/loading_screens/loading7.jpg'),
  assetUrl('/assets/loading_screens/loading8.jpg'),
];

const LOADING_TIPS = {
  en: [
    'Characters in back line cannot be damaged by melee attacks while there is at least one character in front line.',
    'Many characters have interactions and abilities based on ally tags. Tap a building in your castle to inspect the unit standing in it.',
    "Don't forget to check on health of your characters before embarking!",
    'Some units occupy two tiles - a row, or a column. These units require 2 loyalty.',
    'Items are crafted in the Items tab, and equipped from the item slot on a unit in your castle.',
    'Loyalty is your hero stat that is tied to hero level. It allows taking more characters in combat.',
    'Some equippable items provide unique bonuses - like tags or abilities.',
  ],
  ru: [
    'Персонажи на задней линии не могут получать урон от ближних атак, пока на передней линии есть хотя бы один персонаж.',
    'Многие персонажи имеют взаимодействия и способности, основанные на метках союзников. Коснитесь здания в замке, чтобы осмотреть стоящего в нём бойца.',
    'Не забывайте проверять здоровье персонажей перед отправлением в поход!',
    'Некоторые юниты занимают две клетки — ряд или колонку. Такие юниты требуют 2 единицы лояльности.',
    'Предметы создаются во вкладке «Предметы», а надеваются через слот снаряжения бойца в замке.',
    'Лояльность — характеристика героя, связанная с его уровнем. Она позволяет брать больше персонажей в бой.',
    'Некоторые предметы дают уникальные бонусы - такие как тэги или способности.',
  ],
};

export function getLoadingLanguage() {
  const cached = localStorage.getItem('player_language');
  if (cached === 'ru' || cached === 'en') return cached;
  const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  if (tgLang === 'ru') return 'ru';
  return 'en';
}

export function saveLanguageCache(language) {
  localStorage.setItem('player_language', language);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// The loading screen is an OVERLAY on <body>, not the contents of #app, so the
// first real screen can be built, fetched and painted underneath it and only
// revealed once it is complete (see revealWhenReady).
let _overlay = null;
let _setBar = () => {};

export function renderLoadingScreen() {
  const lang = getLoadingLanguage();
  const tips = LOADING_TIPS[lang] || LOADING_TIPS.en;

  _overlay?.remove();
  const root = document.createElement('div');
  root.className = 'loading-overlay';
  document.body.appendChild(root);
  _overlay = root;

  root.innerHTML = `
    <div class="loading-screen loading-screen--fullbg" style="background-image: url('${pick(LOADING_IMAGES)}')">
      <div class="loading-bg-overlay"></div>
      <!-- The title sits at the top of the screen, clear of the art's focal
           point; the tip and progress bar stay anchored to the bottom. -->
      <div class="loading-title">Shattered Crown</div>
      <div class="loading-content">
        <div class="loading-flavour">${pick(tips)}</div>
        <div class="loading-bar-track">
          <div class="loading-bar-fill" id="loading-bar-fill"></div>
        </div>
      </div>
      <div class="loading-version">v${GAME_VERSION}</div>
    </div>
  `;
  // The bar is the whole progress readout — no numeric percentage.
  const fill = root.querySelector('#loading-bar-fill');
  let shown = 0;
  _setBar = p => {
    // Never runs backwards: the phases hand over at fixed points on the bar.
    shown = Math.max(shown, Math.max(0, Math.min(1, p)));
    fill.style.width = `${Math.round(shown * 100)}%`;
  };
  return { setProgress: p => _setBar(p) };
}

// Bar layout: manifest art 0–60%, game data 60–75%, the first screen's own
// render and images 75–100%.
const ART_END = 0.6;
const DATA_END = 0.75;
// Hard cap on the reveal phase, so one hung image cannot keep the game shut.
const REVEAL_TIMEOUT_MS = 12000;
// The DOM counts as settled after this long without a mutation. Screens render
// in steps (shell, then skeleton, then data), so "rendered once" is not enough.
const SETTLE_MS = 300;

function waitForDomSettle(el, timeoutAt) {
  return new Promise(resolve => {
    let timer;
    const done = () => { obs.disconnect(); clearTimeout(timer); resolve(); };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(done, Math.max(0, Math.min(SETTLE_MS, timeoutAt - Date.now())));
    };
    const obs = new MutationObserver(arm);
    obs.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style', 'class'] });
    arm();
  });
}

// Every image the screen will paint: <img> sources plus CSS background images
// (castle nodes, screen backdrops, framed bars are all backgrounds).
function collectScreenImageUrls(el) {
  const urls = new Set();
  for (const img of el.querySelectorAll('img')) {
    if (img.currentSrc || img.src) urls.add(img.currentSrc || img.src);
  }
  for (const node of [el, ...el.querySelectorAll('*')]) {
    const bg = getComputedStyle(node).backgroundImage;
    if (!bg || bg === 'none') continue;
    for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.add(m[1]);
  }
  return [...urls];
}

// Keeps the loading screen up until the screen underneath is actually complete:
// its data has arrived and rendered, and every image in it is loaded and
// decoded. Only then does the overlay fade out.
export async function revealWhenReady(el) {
  if (!_overlay) return;
  const timeoutAt = Date.now() + REVEAL_TIMEOUT_MS;
  try {
    await waitForDomSettle(el, timeoutAt);
    // Lazy <img> would never load while covered; the screen is about to be seen.
    el.querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });
    const urls = collectScreenImageUrls(el);
    const remaining = Math.max(0, timeoutAt - Date.now());
    await Promise.race([
      preloadAssets(urls, p => _setBar(DATA_END + p * (1 - DATA_END))),
      new Promise(r => setTimeout(r, remaining)),
    ]);
    // Images can add more DOM (fallbacks swapped in on error); let that land too.
    await waitForDomSettle(el, Date.now() + SETTLE_MS * 2);
  } catch {}
  _setBar(1);
  const overlay = _overlay;
  _overlay = null;
  overlay.classList.add('loading-overlay--out');
  setTimeout(() => overlay.remove(), 350);
}

export function dismissLoadingScreen() {
  _overlay?.remove();
  _overlay = null;
}

// Manifest groups the player must WAIT for, because they are on screen the
// moment the game opens: chrome icons, resource icons, ability/spell icons and
// the screen backdrops, plus the portraits used by every roster and battle tile.
const CRITICAL_GROUPS = ['ui', 'recources', 'spells', 'abilities', 'screens', 'character_portraits'];
// Everything else is fetched quietly AFTER the game is interactive. In practice
// that is `character_art` — the full-body art, ~19 MB of the ~27 MB total, and
// none of it is visible until a unit card is opened.
// The manifest is a directory listing that only changes when the game is
// deployed, but it used to be fetched fresh AFTER the CDN probe had resolved —
// so a launch paid the probe round trip and then an app-server round trip
// before it could ask for its first image.
//
// Two changes. It is kicked off by main.js in PARALLEL with the probe (the
// listing is the app server's own file list; it does not depend on where the
// art is served from), and it is remembered between launches keyed by
// GAME_VERSION, so a returning player on the same build skips the request
// entirely and a new build misses the key and refetches.
const MANIFEST_KEY = `assets_manifest_v${GAME_VERSION}`;
let _manifestPromise = null;

function readCachedManifest() {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function startManifestFetch() {
  if (_manifestPromise) return _manifestPromise;
  const cached = readCachedManifest();
  if (cached) {
    _manifestPromise = Promise.resolve(cached);
    return _manifestPromise;
  }
  _manifestPromise = api('/assets-manifest')
    .then(m => {
      try {
        // Drop every OTHER version's copy first: the key carries the version, so
        // without this each release leaves its listing behind forever.
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith('assets_manifest_v') && k !== MANIFEST_KEY) localStorage.removeItem(k);
        }
        localStorage.setItem(MANIFEST_KEY, JSON.stringify(m));
      } catch {}
      return m;
    })
    .catch(() => null);
  return _manifestPromise;
}

// Upper bound on waiting for game data. Past this the game opens anyway and the
// screen shows its own loading state — a slow API must not look like a hung launch.
const DATA_TIMEOUT_MS = 10000;

// Phase one of the launch: manifest art and game data. The loading screen is
// NOT taken down here — main.js renders the first screen underneath and calls
// revealWhenReady, which covers the last stretch of the bar.
export async function runPreload(_root, dataReady = Promise.resolve()) {
  const { setProgress: setBar } = renderLoadingScreen();
  const start = Date.now();

  let artP = 0, dataP = 0;
  const setProgress = p => { artP = p; setBar(artP * ART_END + dataP * (DATA_END - ART_END)); };
  const dataDone = Promise.race([
    Promise.resolve(dataReady).catch(() => {}),
    new Promise(r => setTimeout(r, DATA_TIMEOUT_MS)),
  ]).then(() => { dataP = 1; setProgress(artP); });

  let critical = [];
  let deferred = [];
  try {
    // The manifest lists ORIGIN paths (/assets/…). Preloading those would warm
    // the wrong origin and spend the bandwidth this move exists to save, so
    // every entry is routed through assetUrl — a no-op when the CDN is down.
    const manifest = await startManifestFetch();
    if (!manifest) throw new Error('no manifest');
    for (const [group, paths] of Object.entries(manifest)) {
      const urls = paths.map(assetUrl);
      (CRITICAL_GROUPS.includes(group) ? critical : deferred).push(...urls);
    }
  } catch {
    critical = [];
    deferred = [];
  }

  await Promise.all([preloadAssets(critical, setProgress), dataDone]);

  // Warm the rest in the background at low concurrency, so it competes with
  // neither the first render nor the player's first API calls. Deliberately not
  // awaited — nothing on screen is waiting for it.
  if (deferred.length) {
    setTimeout(() => { preloadAssets(deferred, null, 3).catch(() => {}); }, 1500);
  }

  const elapsed = Date.now() - start;
  // A floor, so the art and the tip are actually readable rather than a flash.
  // Was 4500ms, which a returning player with a warm cache sat through for no
  // reason; the preload itself is now much shorter, so this is mostly what the
  // launch costs.
  // The reveal phase adds its own time on top, so this floor only needs to
  // cover a warm-cache launch that would otherwise flash the tip.
  const minDuration = 1500;
  if (elapsed < minDuration) await new Promise(r => setTimeout(r, minDuration - elapsed));
}