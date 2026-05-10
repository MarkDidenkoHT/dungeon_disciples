import { api }      from '../main.js';
import { navigate } from '../main.js';

function timeLeft(ready_at) {
  const diff = new Date(ready_at) - Date.now();
  if (diff <= 0) return 'Ready';
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const CRYSTAL_TYPES = [
  { key: 'Crystals_Life',   icon: '🟢', label: 'Life'   },
  { key: 'Crystals_Fire',   icon: '🔴', label: 'Fire'   },
  { key: 'Crystals_Death',  icon: '🟣', label: 'Death'  },
  { key: 'Crystals_Nature', icon: '🟡', label: 'Nature' },
  { key: 'Crystals_Frost',  icon: '🔵', label: 'Frost'  },
];

export function renderCastle(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-castle">
      <header class="castle-header">
        <div class="player-info">
          <span class="player-faction">${player.faction}</span>
          <span class="player-hero">${player.hero}</span>
        </div>
        <div class="header-resources">
          <div class="res-col res-left">
            <div class="res-item"><span class="res-icon">🪙</span><span id="res-gold">…</span></div>
            <div class="res-item"><span class="res-icon">🏆</span><span id="res-trophies">…</span></div>
          </div>
          <div class="res-center">
            <div class="mana-orb" id="res-mana">…</div>
            <span class="mana-label">mana</span>
          </div>
          <div class="res-col res-right" id="res-crystals"></div>
        </div>
      </header>

      <main class="castle-main">
        <section class="buildings-section">
          <div id="buildings-grid" class="buildings-grid">
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

  let structuresRecord = null;
  let timerInterval    = null;

  async function load() {
    const [inventory, structures] = await Promise.all([
      api(`/inventory?chat_id=${player.chat_id}&type=resource`),
      api(`/structures?chat_id=${player.chat_id}`),
    ]);

    const find = (name) => inventory.find(r => r.item === name);

    root.querySelector('#res-gold').textContent     = find('Gold')?.amount     ?? 0;
    root.querySelector('#res-trophies').textContent = find('Trophies')?.amount ?? 0;
    root.querySelector('#res-mana').textContent     = find('Mana')?.amount     ?? 0;

    root.querySelector('#res-crystals').innerHTML = CRYSTAL_TYPES.map(c => `
      <div class="res-item">
        <span class="res-icon">${c.icon}</span>
        <span>${find(c.key)?.amount ?? 0}</span>
      </div>
    `).join('');

    structuresRecord = structures;
    renderBuildings();
  }

  function renderBuildings() {
    const data = structuresRecord.buildings_data;
    const grid = root.querySelector('#buildings-grid');

    grid.innerHTML = Object.entries(data).map(([slot, state]) => {
      const isBuilding = state.ready_at && new Date(state.ready_at) > new Date();
      const isReady    = state.ready_at && new Date(state.ready_at) <= new Date();

      return `
        <div class="building-card" data-slot="${slot}">
          <div class="building-top">
            <span class="building-label">${state.label ?? slot.replace('_', ' ')}</span>
            <span class="building-level">${state.level > 0 ? `Lv ${state.level}` : 'Unbuilt'}</span>
          </div>
          ${isBuilding ? `<div class="building-timer" data-ready="${state.ready_at}">⏳ ${timeLeft(state.ready_at)}</div>` : ''}
          ${isReady    ? `<button class="building-btn complete-btn" data-slot="${slot}">Complete</button>` : ''}
          ${!isBuilding && !isReady && state.level < 4
            ? `<button class="building-btn build-btn" data-slot="${slot}">${state.level === 0 ? 'Build' : 'Upgrade'}</button>`
            : ''}
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.build-btn').forEach(btn => {
      btn.addEventListener('click', () => startBuild(btn.dataset.slot));
    });
    grid.querySelectorAll('.complete-btn').forEach(btn => {
      btn.addEventListener('click', () => completeBuild(btn.dataset.slot));
    });

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(tickTimers, 1000);
  }

  function tickTimers() {
    root.querySelectorAll('.building-timer').forEach(el => {
      const left = timeLeft(el.dataset.ready);
      el.textContent = left === 'Ready' ? '' : `⏳ ${left}`;
      if (left === 'Ready') renderBuildings();
    });
  }

  async function startBuild(slot) {
    try {
      const updated = await api('/structures/build', { chat_id: player.chat_id, faction: player.faction, slot });
      structuresRecord = updated;
      renderBuildings();
    } catch (err) {
      alert(err.message);
    }
  }

  async function completeBuild(slot) {
    try {
      const updated = await api('/structures/complete', { chat_id: player.chat_id, slot });
      structuresRecord = updated;
      renderBuildings();
    } catch (err) {
      alert(err.message);
    }
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