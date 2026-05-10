import { api }      from '../main.js';
import { navigate } from '../main.js';

const BUILDING_DEFS = {
  protectors: {
    slot_1: { label: 'Farm',               category: 'production' },
    slot_2: { label: 'Empty',              category: 'production' },
    slot_3: { label: 'Empty',              category: 'production' },
    slot_4: { label: 'Conscript Barracks', category: 'barracks'   },
    slot_5: { label: 'Acolyte Shrine',     category: 'barracks'   },
    slot_6: { label: 'Mage Tower',         category: 'barracks'   },
    slot_7: { label: 'Empty',              category: 'any'        },
    slot_8: { label: 'Empty',              category: 'any'        },
  },
  dungeon: {
    slot_1: { label: 'Farm',               category: 'production' },
    slot_2: { label: 'Empty',              category: 'production' },
    slot_3: { label: 'Empty',              category: 'production' },
    slot_4: { label: 'Heretic Pit',        category: 'barracks'   },
    slot_5: { label: 'Imp Den',            category: 'barracks'   },
    slot_6: { label: 'Possession Altar',   category: 'barracks'   },
    slot_7: { label: 'Empty',              category: 'any'        },
    slot_8: { label: 'Empty',             category: 'any'        },
  },
};

function timeLeft(ready_at) {
  const diff = new Date(ready_at) - Date.now();
  if (diff <= 0) return 'Ready';
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

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
          <div id="resources-list" class="resource-list">
            <p class="placeholder">Loading…</p>
          </div>
        </section>

        <section class="buildings-section">
          <h2>Buildings</h2>
          <div id="buildings-grid" class="buildings-grid">
            <p class="placeholder">Loading…</p>
          </div>
        </section>
      </main>

      <nav class="bottom-nav">
        <button class="nav-btn active" data-screen="castle">Castle</button>
        <button class="nav-btn" data-screen="roster">Roster</button>
        <button class="nav-btn disabled" data-screen="embark">Embark</button>
        <button class="nav-btn" data-screen="settings">Settings</button>
      </nav>
    </div>
  `;

  let structuresRecord = null;
  let timerInterval = null;

  async function load() {
    const [playerData, inventory, structures] = await Promise.all([
      api(`/player?chat_id=${player.chat_id}`),
      api(`/inventory?chat_id=${player.chat_id}&type=resource`),
      api(`/structures?chat_id=${player.chat_id}`),
    ]);

    root.querySelector('#mana-value').textContent = playerData.mana ?? 0;

    const resList = root.querySelector('#resources-list');
    resList.innerHTML = inventory.length
      ? inventory.map(r => `
          <div class="resource-row">
            <span class="resource-name">${r.item}</span>
            <span class="resource-amount">${r.amount}</span>
          </div>
        `).join('')
      : `<p class="placeholder">No resources yet.</p>`;

    structuresRecord = structures;
    renderBuildings();
  }

  function renderBuildings() {
    const defs = BUILDING_DEFS[player.faction];
    const data = structuresRecord.buildings_data;
    const grid = root.querySelector('#buildings-grid');

    grid.innerHTML = Object.entries(defs).map(([slot, def]) => {
      const state = data[slot] || { level: 0, ready_at: null };
      const isBuilding = state.ready_at && new Date(state.ready_at) > new Date();
      const isReady = state.ready_at && new Date(state.ready_at) <= new Date();
      const isEmpty = def.label === 'Empty';

      return `
        <div class="building-card ${isEmpty ? 'building-empty' : ''}" data-slot="${slot}">
          <div class="building-top">
            <span class="building-label">${def.label}</span>
            <span class="building-level">${state.level > 0 ? `Lv ${state.level}` : 'Unbuilt'}</span>
          </div>
          <div class="building-category">${def.category}</div>
          ${isBuilding ? `<div class="building-timer" data-ready="${state.ready_at}">⏳ ${timeLeft(state.ready_at)}</div>` : ''}
          ${isReady   ? `<button class="building-btn complete-btn" data-slot="${slot}">Complete</button>` : ''}
          ${!isBuilding && !isReady && !isEmpty && state.level < 4
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
      const ready = el.dataset.ready;
      const left = timeLeft(ready);
      el.textContent = left === 'Ready' ? '' : `⏳ ${left}`;
      if (left === 'Ready') renderBuildings();
    });
  }

  async function startBuild(slot) {
    try {
      const updated = await api('/structures/build', {
        chat_id: player.chat_id,
        faction: player.faction,
        slot,
      });
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