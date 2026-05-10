import { api }          from '../main.js';
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
        <div class="header-mana">
          <span class="mana-icon">✦</span>
          <span id="mana-value">…</span>
        </div>
      </header>

      <main class="castle-main">
        <section class="resources-section">
          <h2>Resources</h2>
          <div id="resources-list" class="resource-list">
            <p class="placeholder">Loading…</p>
          </div>
        </section>
      </main>

      <nav class="bottom-nav">
        <button class="nav-btn active" data-screen="castle">Castle</button>
        <button class="nav-btn" data-screen="roster">Roster</button>
        <button class="nav-btn disabled" data-screen="embark">Embark</button>
        <button class="nav-btn disabled" data-screen="pvp">PvP</button>
      </nav>
    </div>
  `;

  async function load() {
    const [playerData, inventory] = await Promise.all([
      api(`/player?chat_id=${player.chat_id}`),
      api(`/inventory?chat_id=${player.chat_id}&type=resource`),
    ]);

    root.querySelector('#mana-value').textContent = playerData.mana ?? 0;

    const list = root.querySelector('#resources-list');
    if (!inventory.length) {
      list.innerHTML = `<p class="placeholder">No resources yet.</p>`;
      return;
    }
    list.innerHTML = inventory.map(r => `
      <div class="resource-row">
        <span class="resource-name">${r.item}</span>
        <span class="resource-amount">${r.amount}</span>
      </div>
    `).join('');
  }

  load();

  root.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      const screen = btn.dataset.screen;
      if (screen === 'castle') return;
      navigate(screen, { player });
    });
  });
}