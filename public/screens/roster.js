import { api }      from '../utils/api.js';
import { navigate } from '../main.js';

export function renderRoster(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-castle">
      <header class="castle-header">
        <div class="player-info">
          <span class="player-faction">${player.faction}</span>
          <span class="player-hero">${player.hero}</span>
        </div>
      </header>

      <main class="castle-main">
        <section class="resources-section">
          <h2>Roster</h2>
          <div id="roster-list" class="roster-list">
            <p class="placeholder">Loading…</p>
          </div>
        </section>
      </main>

      <nav class="bottom-nav">
        <button class="nav-btn" data-screen="castle">Castle</button>
        <button class="nav-btn active" data-screen="roster">Roster</button>
        <button class="nav-btn disabled" data-screen="embark">Embark</button>
        <button class="nav-btn disabled" data-screen="pvp">PvP</button>
      </nav>
    </div>
  `;

  async function load() {
    const units = await api(`/roster?chat_id=${player.chat_id}`);
    const list = root.querySelector('#roster-list');

    if (!units.length) {
      list.innerHTML = `<p class="placeholder">No units yet.</p>`;
      return;
    }

    list.innerHTML = units.map(u => `
      <div class="unit-card">
        <div class="unit-header">
          <span class="unit-name">${u.unit_name}</span>
          <span class="unit-xp">XP ${u.experience ?? 0}</span>
        </div>
        ${u.unit_data ? `
          <div class="unit-stats">
            ${Object.entries(u.unit_data).map(([k, v]) => `
              <span class="unit-stat"><em>${k}</em> ${v}</span>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  load();

  root.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      const screen = btn.dataset.screen;
      if (screen === 'roster') return;
      navigate(screen, { player });
    });
  });
}