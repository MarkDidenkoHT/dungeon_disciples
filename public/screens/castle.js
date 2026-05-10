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
  { key: 'Crystals_Life',   icon: '🟢' },
  { key: 'Crystals_Fire',   icon: '🔴' },
  { key: 'Crystals_Death',  icon: '🟣' },
  { key: 'Crystals_Nature', icon: '🟡' },
  { key: 'Crystals_Frost',  icon: '🔵' },
];

const CATEGORY_LABELS = {
  production: 'Production',
  barracks:   'Barracks',
  any:        'Special',
};

const CATEGORY_ORDER = ['production', 'barracks', 'any'];

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

    <div id="modal-overlay" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header">
          <span id="modal-title"></span>
          <button id="modal-close">✕</button>
        </div>
        <div id="modal-body" class="modal-body"></div>
      </div>
    </div>
  `;

  let structuresRecord = null;
  let buildingDefs     = null;
  let slotCategories   = null;
  let timerInterval    = null;

  function openModal(title, bodyHtml) {
    root.querySelector('#modal-title').textContent = title;
    root.querySelector('#modal-body').innerHTML    = bodyHtml;
    root.querySelector('#modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    root.querySelector('#modal-overlay').classList.add('hidden');
    root.querySelector('#modal-body').innerHTML = '';
  }

  root.querySelector('#modal-close').addEventListener('click', closeModal);
  root.querySelector('#modal-overlay').addEventListener('click', (e) => {
    if (e.target === root.querySelector('#modal-overlay')) closeModal();
  });

  async function load() {
    const [inventory, structures, buildingsResp] = await Promise.all([
      api(`/inventory?chat_id=${player.chat_id}&type=resource`),
      api(`/structures?chat_id=${player.chat_id}`),
      api('/buildings'),
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

    buildingDefs     = buildingsResp.defs;
    slotCategories   = buildingsResp.slot_categories;
    structuresRecord = structures;
    renderBuildings();
  }

  function renderBuildings() {
    const data = structuresRecord.buildings_data;
    const grid = root.querySelector('#buildings-grid');

    const grouped = {};
    for (const [slot, state] of Object.entries(data)) {
      const cat = slotCategories?.[slot] ?? 'any';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ slot, state });
    }

    grid.innerHTML = CATEGORY_ORDER.map(cat => {
      const entries = grouped[cat];
      if (!entries || entries.length === 0) return '';

      const cards = entries.map(({ slot, state }) => {
        const isBuilding = state.ready_at && new Date(state.ready_at) > new Date();
        const isReady    = state.ready_at && new Date(state.ready_at) <= new Date();
        const isEmpty    = state.level === 0 && !state.ready_at;

        const factionSlotDef = buildingDefs?.[player.faction]?.[slot];
        const label = isEmpty
          ? (factionSlotDef && factionSlotDef.id !== 'empty' ? factionSlotDef.label : 'Empty')
          : (state.label ?? slot.replace('_', ' '));

        return `
          <div class="building-card ${isEmpty ? 'building-empty' : ''}" data-slot="${slot}">
            <div class="building-top">
              <span class="building-label">${label}</span>
              <span class="building-level">${state.level > 0 ? `Lv ${state.level}` : 'Empty'}</span>
            </div>
            ${isBuilding ? `<div class="building-timer" data-ready="${state.ready_at}">⏳ ${timeLeft(state.ready_at)}</div>` : ''}
            ${isReady    ? `<button class="building-btn complete-btn" data-slot="${slot}">Complete</button>` : ''}
            ${isEmpty    ? `<button class="building-btn build-btn" data-slot="${slot}">Build</button>` : ''}
            ${!isEmpty && !isBuilding && !isReady && state.level < 4
              ? `<button class="building-btn build-btn" data-slot="${slot}">Upgrade</button>`
              : ''}
          </div>
        `;
      }).join('');

      return `
        <div class="building-group">
          <div class="building-group-label">${CATEGORY_LABELS[cat] ?? cat}</div>
          <div class="building-group-slots">${cards}</div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.build-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const slot  = btn.dataset.slot;
        const state = structuresRecord.buildings_data[slot];
        if (state.level === 0) {
          showBuildModal(slot);
        } else {
          startBuild(slot);
        }
      });
    });

    grid.querySelectorAll('.complete-btn').forEach(btn => {
      btn.addEventListener('click', () => completeBuild(btn.dataset.slot));
    });

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(tickTimers, 1000);
  }

  function showBuildModal(slot) {
    const factionDefs = buildingDefs[player.faction];
    const slotDef     = factionDefs?.[slot];

    if (!slotDef || slotDef.id === 'empty') {
      openModal('Build', `<p class="modal-empty">No buildings available for this slot.</p>`);
      return;
    }

    const cat = slotCategories?.[slot] ?? 'any';

    openModal(`Build — ${CATEGORY_LABELS[cat] ?? cat} Slot`, `
      <div class="modal-building-option" data-slot="${slot}">
        <div class="modal-building-name">${slotDef.label}</div>
        <div class="modal-building-meta">${slotDef.category}</div>
        ${slotDef.unit ? `<div class="modal-building-unit">Recruits: ${slotDef.unit}</div>` : ''}
        <button class="building-btn confirm-build-btn" data-slot="${slot}">Build</button>
      </div>
    `);

    root.querySelector('.confirm-build-btn').addEventListener('click', async () => {
      closeModal();
      await startBuild(slot);
    });
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

function timeLeft(ready_at) {
  const diff = new Date(ready_at) - Date.now();
  if (diff <= 0) return 'Ready';
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const CRYSTAL_TYPES = [
  { key: 'Crystals_Life',   icon: '🟢' },
  { key: 'Crystals_Fire',   icon: '🔴' },
  { key: 'Crystals_Death',  icon: '🟣' },
  { key: 'Crystals_Nature', icon: '🟡' },
  { key: 'Crystals_Frost',  icon: '🔵' },
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

    <div id="modal-overlay" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header">
          <span id="modal-title"></span>
          <button id="modal-close">✕</button>
        </div>
        <div id="modal-body" class="modal-body"></div>
      </div>
    </div>
  `;

  let structuresRecord = null;
  let buildingDefs     = null;
  let timerInterval    = null;

  function openModal(title, bodyHtml) {
    root.querySelector('#modal-title').textContent = title;
    root.querySelector('#modal-body').innerHTML    = bodyHtml;
    root.querySelector('#modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    root.querySelector('#modal-overlay').classList.add('hidden');
    root.querySelector('#modal-body').innerHTML = '';
  }

  root.querySelector('#modal-close').addEventListener('click', closeModal);
  root.querySelector('#modal-overlay').addEventListener('click', (e) => {
    if (e.target === root.querySelector('#modal-overlay')) closeModal();
  });

  async function load() {
    const [inventory, structures, defs] = await Promise.all([
      api(`/inventory?chat_id=${player.chat_id}&type=resource`),
      api(`/structures?chat_id=${player.chat_id}`),
      api('/buildings'),
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

    buildingDefs     = defs;
    structuresRecord = structures;
    renderBuildings();
  }

  function renderBuildings() {
    const data = structuresRecord.buildings_data;
    const grid = root.querySelector('#buildings-grid');

    grid.innerHTML = Object.entries(data).map(([slot, state]) => {
      const isBuilding = state.ready_at && new Date(state.ready_at) > new Date();
      const isReady    = state.ready_at && new Date(state.ready_at) <= new Date();
      const isEmpty    = state.level === 0 && !state.ready_at;

      return `
        <div class="building-card ${isEmpty ? 'building-empty' : ''}" data-slot="${slot}">
          <div class="building-top">
            <span class="building-label">${state.label ?? slot.replace('_', ' ')}</span>
            <span class="building-level">${state.level > 0 ? `Lv ${state.level}` : 'Empty'}</span>
          </div>
          ${isBuilding ? `<div class="building-timer" data-ready="${state.ready_at}">⏳ ${timeLeft(state.ready_at)}</div>` : ''}
          ${isReady    ? `<button class="building-btn complete-btn" data-slot="${slot}">Complete</button>` : ''}
          ${isEmpty    ? `<button class="building-btn build-btn" data-slot="${slot}">Build</button>` : ''}
          ${!isEmpty && !isBuilding && !isReady && state.level < 4
            ? `<button class="building-btn build-btn" data-slot="${slot}">Upgrade</button>`
            : ''}
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.build-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const slot  = btn.dataset.slot;
        const state = structuresRecord.buildings_data[slot];
        if (state.level === 0) {
          showBuildModal(slot);
        } else {
          startBuild(slot);
        }
      });
    });

    grid.querySelectorAll('.complete-btn').forEach(btn => {
      btn.addEventListener('click', () => completeBuild(btn.dataset.slot));
    });

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(tickTimers, 1000);
  }

  function showBuildModal(slot) {
    const factionDefs = buildingDefs[player.faction];
    const slotDef     = factionDefs?.[slot];

    if (!slotDef || slotDef.id === 'empty') {
      openModal('Build', `<p class="modal-empty">No buildings available for this slot.</p>`);
      return;
    }

    openModal(`Build — ${slot.replace('_', ' ')}`, `
      <div class="modal-building-option" data-slot="${slot}">
        <div class="modal-building-name">${slotDef.label}</div>
        <div class="modal-building-meta">${slotDef.category}</div>
        ${slotDef.unit ? `<div class="modal-building-unit">Recruits: ${slotDef.unit}</div>` : ''}
        <button class="building-btn confirm-build-btn" data-slot="${slot}">Build</button>
      </div>
    `);

    root.querySelector('.confirm-build-btn').addEventListener('click', async () => {
      closeModal();
      await startBuild(slot);
    });
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