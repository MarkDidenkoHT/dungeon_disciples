import { api } from '../api.js';
import { preloadAssets } from '../utils.js';

const LOADING_IMAGES = [
  '/assets/loading_screens/loading1.jpg',
  '/assets/loading_screens/loading2.jpg',
  '/assets/loading_screens/loading3.jpg',
  '/assets/loading_screens/loading4.jpg',
  '/assets/loading_screens/loading5.jpg',
  '/assets/loading_screens/loading6.jpg',
];

const LOADING_TIPS = [
  'Characters in back line cannot be damaged by melee attacks while there is at least one character in front line.',
  'Many characters have interactions and abilities based on ally tags. Inspect and learn character abilities in Roster tab.',
  "Don't forget to check on health of your characters before embarking!",
  'Some units occupy two tiles - a row, or a column. These units require 2 loyalty.',
  'Items can be crafted and equipped in the Roster tab.',
  'Loyalty is your hero stat that is tied to hero level. It allows taking more characters in combat.',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function renderLoadingScreen(root) {
  root.innerHTML = `
    <div class="loading-screen loading-screen--fullbg" style="background-image: url('${pick(LOADING_IMAGES)}')">
      <div class="loading-bg-overlay"></div>
      <div class="loading-content">
        <div class="loading-title">Dungeon Disciples</div>
        <div class="loading-flavour">${pick(LOADING_TIPS)}</div>
        <div class="loading-bar-track">
          <div class="loading-bar-fill" id="loading-bar-fill"></div>
        </div>
        <div class="loading-pct" id="loading-pct">0%</div>
      </div>
    </div>
  `;
  const fill = root.querySelector('#loading-bar-fill');
  const pct  = root.querySelector('#loading-pct');
  return {
    setProgress(p) {
      const clamped = Math.max(0, Math.min(1, p));
      fill.style.width = `${Math.round(clamped * 100)}%`;
      pct.textContent  = `${Math.round(clamped * 100)}%`;
    },
  };
}

export async function runPreload(root) {
  const { setProgress } = renderLoadingScreen(root);
  const start = Date.now();

  let assetUrls = [];
  try {
    const manifest = await api('/assets-manifest');
    assetUrls = Object.values(manifest).flat();
  } catch {
    assetUrls = [];
  }

  await preloadAssets(assetUrls, setProgress);

  const elapsed = Date.now() - start;
  const minDuration = 4500;
  if (elapsed < minDuration) await new Promise(r => setTimeout(r, minDuration - elapsed));
}