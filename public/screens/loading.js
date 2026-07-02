import { api } from '../api.js';
import { preloadAssets } from '../utils.js';

export function renderLoadingScreen(root) {
  root.innerHTML = `
    <div class="loading-screen">
      <div class="loading-crest">
        <img src="/assets/icons/ui/castle.png" class="loading-crest-icon" alt="">
      </div>
      <div class="loading-title">Dungeon Disciples</div>
      <div class="loading-bar-track">
        <div class="loading-bar-fill" id="loading-bar-fill"></div>
      </div>
      <div class="loading-pct" id="loading-pct">0%</div>
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
  const minDuration = 500;
  if (elapsed < minDuration) await new Promise(r => setTimeout(r, minDuration - elapsed));
}