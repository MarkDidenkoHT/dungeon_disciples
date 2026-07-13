import { api } from '../api.js';
import { preloadAssets } from '../utils.js';

const LOADING_SLIDES = [
  {
    img:  '/assets/loading_screens/loading1.jpg',
    text: 'Paladins and Templars of the Empire are defensive front line bruisers, gaining bonuses for being offensive.',
  },
  {
    img:  '/assets/loading_screens/loading2.jpg',
    text: "Grail's Zombies offer sturdy frontlines that grow stronger with numbers.",
  },
  {
    img:  '/assets/loading_screens/loading3.jpg',
    text: 'Crimson Basilica followers have fallen to corruption.',
  },
  {
    img:  '/assets/loading_screens/loading4.jpg',
    text: "Empire has holy machinery watched by engineer. Sentinel is a large unbreakable construct.",
  },
];

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