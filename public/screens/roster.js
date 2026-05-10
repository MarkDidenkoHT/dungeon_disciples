import { api }      from '../main.js';
import { navigate } from '../main.js';

const RESIST_LABELS = {
  resist_fire:      '🔥',
  resist_ice:       '❄️',
  resist_lightning: '⚡',
  resist_dark:      '🌑',
  resist_holy:      '✨',
};

const TARGET_LABELS = {
  single: 'Single',
  row:    'Row',
  column: 'Column',
  all:    'All',
};

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

    list.innerHTML = units.map(u => {
      const d = u.unit_data || {};
      const action = d.action || {};

      return `
        <div class="unit-card">
          <div class="unit-header">
            <span class="unit-name">${u.unit_name}</span>
            <span class="unit-xp">XP ${u.experience ?? 0}</span>
          </div>

          <div class="unit-core-stats">
            <span class="unit-stat"><em>HP</em> ${d.hp ?? '—'}</span>
            <span class="unit-stat"><em>Armor</em> ${d.armor ?? '—'}</span>
            <span class="unit-stat"><em>Initiative</em> ${d.initiative ?? '—'}</span>
          </div>

          <div class="unit-resists">
            ${Object.entries(RESIST_LABELS).map(([key, icon]) => `
              <span class="unit-resist">${icon} ${d[key] ?? '—'}</span>
            `).join('')}
          </div>

          <div class="unit-action">
            <span class="unit-action-label">Basic Action</span>
            <div class="unit-action-stats">
              <span class="unit-stat"><em>DMG</em> ${action.value ?? '—'}</span>
              <span class="unit-stat"><em>Range</em> ${action.range ?? '—'}</span>
              <span class="unit-stat"><em>Target</em> ${action.target_type ?? '—'}</span>
              <span class="unit-stat"><em>Amount</em> ${TARGET_LABELS[action.target_amount] ?? '—'}</span>
            </div>
          </div>

          <div class="unit-abilities">
            <div class="unit-ability">
              <span class="unit-ability-label">Passive</span>
              <span class="unit-ability-value">${d.passive_ability ?? 'Coming soon'}</span>
            </div>
            <div class="unit-ability">
              <span class="unit-ability-label">Active</span>
              <span class="unit-ability-value">${d.active_ability ?? 'Coming soon'}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
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