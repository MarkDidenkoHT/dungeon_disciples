import { clearSession } from '../utils/session.js';
import { navigate }     from '../main.js';

export function renderCastle(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-castle">
      <header class="castle-header">
        <div class="player-info">
          <span class="player-faction">${player.faction}</span>
          <span class="player-hero">${player.hero}</span>
        </div>
        <button id="logout-btn">Logout</button>
      </header>

      <main class="castle-main">
        <!-- building grid goes here next sprint -->
        <p class="placeholder">Castle scene — buildings coming soon.</p>
      </main>

      <nav class="bottom-nav">
        <button class="nav-btn active" data-screen="castle">Castle</button>
        <button class="nav-btn disabled" data-screen="roster">Roster</button>
        <button class="nav-btn disabled" data-screen="embark">Embark</button>
        <button class="nav-btn disabled" data-screen="pvp">PvP</button>
      </nav>
    </div>
  `;

  root.querySelector('#logout-btn').addEventListener('click', () => {
    clearSession();
    navigate('login');
  });

  root.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) {
        btn.textContent = btn.textContent + ' (soon)';
        setTimeout(() => { btn.textContent = btn.dataset.screen.charAt(0).toUpperCase() + btn.dataset.screen.slice(1); }, 1200);
        return;
      }
    });
  });
}