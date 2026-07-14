import { api } from '../api.js';
import { preloadAssets } from '../utils.js';

const LOADING_SLIDES = [
  {
    img:  '/assets/loading_screens/loading1.jpg',
    text: 'Characters in back line cannot be damaged by melee attacks while there is at least one character in front line.',
  },
  {
    img:  '/assets/loading_screens/loading2.jpg',
    text: "Many characters have interactions and abilities based on ally tags. Inspect and learn character abilities in Roster tab.",
  },
  {
    img:  '/assets/loading_screens/loading3.jpg',
    text: "Don't forget to check on health of your characters before embarking!",
  },
  {
    img:  '/assets/loading_screens/loading4.jpg',
    text: "Some units occupy two tiles - a row, or a column. These units require 2 loyalty.",
  },
];

//some text ideas for future
//Loyalty is your hero stat that is tied to heroes level. It allows taking more characters in combat.
//Each character can equip an item. Items cna be crafted and equipped in roster.
//Characters that die in combat do not receive exp for that battle, even if remaining characters won.

export function renderLoadingScreen(root) {
  const slide = LOADING_SLIDES[Math.floor(Math.random() * LOADING_SLIDES.length)];

  root.innerHTML = `
    <div class="loading-screen loading-screen--fullbg" style="background-image: url('${slide.img}')">
      <div class="loading-bg-overlay"></div>
      <div class="loading-content">
        <div class="loading-title">Dungeon Disciples</div>
        <div class="loading-flavour">${slide.text}</div>
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