import { api } from '../api.js';
import { preloadAssets } from '../utils.js';
import { assetUrl } from '../asset_base.js';

// Shown in the corner of the loading screen so a player reporting a bug can say
// which build they were on. Bump this on every release.
export const GAME_VERSION = '0.4251';

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

export function renderLoadingScreen(root) {
  const lang = getLoadingLanguage();
  const tips = LOADING_TIPS[lang] || LOADING_TIPS.en;

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
  return {
    setProgress(p) {
      const clamped = Math.max(0, Math.min(1, p));
      fill.style.width = `${Math.round(clamped * 100)}%`;
    },
  };
}

// Manifest groups the player must WAIT for, because they are on screen the
// moment the game opens: chrome icons, resource icons, ability/spell icons and
// the screen backdrops, plus the portraits used by every roster and battle tile.
const CRITICAL_GROUPS = ['ui', 'recources', 'spells', 'abilities', 'screens', 'character_portraits'];
// Everything else is fetched quietly AFTER the game is interactive. In practice
// that is `character_art` — the full-body art, ~19 MB of the ~27 MB total, and
// none of it is visible until a unit card is opened.
export async function runPreload(root) {
  const { setProgress } = renderLoadingScreen(root);
  const start = Date.now();

  let critical = [];
  let deferred = [];
  try {
    // The manifest is built from the app server's own copy of the files and so
    // lists origin paths (/assets/…). Preloading those would warm the wrong
    // origin and spend the bandwidth this move exists to save, so every entry
    // is routed through assetUrl — which is a no-op when the CDN is down.
    const manifest = await api('/assets-manifest');
    for (const [group, paths] of Object.entries(manifest)) {
      const urls = paths.map(assetUrl);
      (CRITICAL_GROUPS.includes(group) ? critical : deferred).push(...urls);
    }
  } catch {
    critical = [];
    deferred = [];
  }

  await preloadAssets(critical, setProgress);

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
  const minDuration = 4500;
  if (elapsed < minDuration) await new Promise(r => setTimeout(r, minDuration - elapsed));
}