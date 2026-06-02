import { applyBackground } from '../utils.js';

export function renderPvp(root, { player }) {
  applyBackground(root, player.faction, 'embark');

  root.innerHTML = `
    <div class="screen screen-pvp">
      <main class="pvp-main">
        <div class="pvp-placeholder">
          <div class="pvp-placeholder-icon">⚔</div>
          <div class="pvp-placeholder-title">PvP Arena</div>
          <div class="pvp-placeholder-desc">Challenge other players in ranked combat. Coming soon.</div>
        </div>
      </main>
    </div>
  `;
}