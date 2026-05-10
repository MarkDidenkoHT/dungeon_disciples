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

const CATEGORY_ICONS = {
  throne:     '♛',
  production: '⚙',
  barracks:   '⚔',
  any:        '✦',
};

const LAYOUT_ROWS = [
  { label: 'Production', slots: ['slot_1', 'slot_2', 'slot_3'] },
  { label: 'Throne',     slots: ['slot_7', 'slot_0', 'slot_8'] },
  { label: 'Barracks',   slots: ['slot_4', 'slot_5', 'slot_6'] },
];

export function renderCastle(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-castle">
      <header class="castle-header">
        <div class="header-resources">
          <div class="res-row">
            <div class="res-item"><span class="res-icon">🪙</span><span id="res-gold">…</span></div>
            <div class="res-item"><span class="res-icon">🏆</span><span id="res-trophies">…</span></div>
            <div class="res-item mana-item">
              <div class="mana-orb" id="res-mana">…</div>
              <span class="mana-label">mana</span>
            </div>
          </div>
          <div class="res-row" id="res-crystals"></div>
        </div>
      </header>

      <main class="castle-main">
        <div class="castle-grid" id="castle-grid"></div>
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
  let buildingPools    = null;
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

    buildingPools    = buildingsResp.pools;
    slotCategories   = buildingsResp.slot_categories;
    structuresRecord = structures;
    renderBuildings();
  }

  function getSlotDef(slot, building_id) {
    if (!building_id || !buildingPools) return null;
    const faction = buildingPools[player.faction];
    if (!faction) return null;
    for (const pool of Object.values(faction)) {
      const found = pool.find(b => b.id === building_id);
      if (found) return found;
    }
    return null;
  }

  function renderSlotNode(slot) {
    const data = structuresRecord.buildings_data;
    const state = data[slot] ?? { level: 0, ready_at: null, building_id: null };
    const cat   = slotCategories?.[slot] ?? 'any';
    const isThrone = cat === 'throne';

    const def        = getSlotDef(slot, state.building_id);
    const isEmpty    = !state.building_id && state.level === 0;
    const isBuilding = state.ready_at && new Date(state.ready_at) > new Date();
    const isReady    = state.ready_at && new Date(state.ready_at) <= new Date();

    let label = isThrone
      ? (def?.label ?? 'Throne')
      : (def?.label ?? (isEmpty ? 'Empty' : slot));

    let classes = `castle-node castle-node--${cat}`;
    if (isEmpty)    classes += ' castle-node--empty';
    if (isBuilding) classes += ' castle-node--building';
    if (isReady)    classes += ' castle-node--ready';
    if (isThrone)   classes += ' castle-node--throne';

    return `
      <div class="${classes}" data-slot="${slot}">
        <div class="castle-node-icon">${CATEGORY_ICONS[cat] ?? '·'}</div>
        <div class="castle-node-label">${label}</div>
        ${state.level > 0 ? `<div class="castle-node-level">Lv ${state.level}</div>` : ''}
        ${isBuilding ? `<div class="castle-node-timer" data-ready="${state.ready_at}">⏳</div>` : ''}
        ${isReady    ? `<div class="castle-node-ready">✓</div>` : ''}
      </div>
    `;
  }

  function renderBuildings() {
    const grid = root.querySelector('#castle-grid');

    grid.innerHTML = LAYOUT_ROWS.map(row => `
      <div class="castle-row castle-row--${row.label.toLowerCase()}">
        ${row.slots.map(slot => renderSlotNode(slot)).join('')}
      </div>
    `).join('');

    grid.querySelectorAll('.castle-node').forEach(node => {
      node.addEventListener('click', () => handleSlotClick(node.dataset.slot));
    });

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(tickTimers, 1000);
  }

  function handleSlotClick(slot) {
    const state = structuresRecord.buildings_data[slot];
    const cat   = slotCategories?.[slot] ?? 'any';

    if (cat === 'throne') {
      showThroneModal(state);
      return;
    }

    const isEmpty = !state || (!state.building_id && state.level === 0);
    if (isEmpty) {
      showBuildChoiceModal(slot, cat);
    } else {
      const def = getSlotDef(slot, state.building_id);
      showDetailsModal(slot, state, def, cat);
    }
  }

  function showBuildChoiceModal(slot, cat) {
    const factionPools = buildingPools?.[player.faction];
    if (!factionPools) {
      openModal('Error', '<p class="modal-empty">No building data available.</p>');
      return;
    }
    let options = [];
    if (cat === 'any') {
      for (const [poolCat, pool] of Object.entries(factionPools)) {
        if (poolCat !== 'throne') options = options.concat(pool);
      }
    } else {
      options = factionPools[cat] ?? [];
    }

    if (!options.length) {
      openModal('Empty Slot', '<p class="modal-empty">No buildings available for this slot yet.</p>');
      return;
    }

    const categoryLabel = cat === 'any' ? 'Special' : cat.charAt(0).toUpperCase() + cat.slice(1);

    openModal(`Build — ${categoryLabel} Slot`, `
      <p class="modal-subtitle">Choose a building to construct:</p>
      <div class="modal-building-list">
        ${options.map(b => `
          <div class="modal-building-option modal-building-card" data-building-id="${b.id}" data-slot="${slot}">
            <div class="modal-building-card-icon">${CATEGORY_ICONS[b.category] ?? '·'}</div>
            <div class="modal-building-card-info">
              <div class="modal-building-card-label">${b.label}</div>
              ${b.unit ? `<div class="modal-building-card-unit">Recruits: <strong>${b.unit}</strong></div>` : ''}
              <div class="modal-building-card-cat">${b.category}</div>
            </div>
            <button class="building-btn confirm-build-btn" data-building-id="${b.id}" data-slot="${slot}">Build</button>
          </div>
        `).join('')}
      </div>
    `);

    root.querySelectorAll('.confirm-build-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const chosenSlot       = btn.dataset.slot;
        const chosenBuildingId = btn.dataset.buildingId;
        closeModal();
        await startBuild(chosenSlot, chosenBuildingId);
      });
    });
  }

  function showDetailsModal(slot, state, def, cat) {
    const isBuilding = state.ready_at && new Date(state.ready_at) > new Date();
    const isReady    = state.ready_at && new Date(state.ready_at) <= new Date();
    const canUpgrade = !isBuilding && !isReady && state.level < 4;

    openModal(def?.label ?? slot, `
      <div class="modal-building-option">
        <div class="modal-building-meta">${CATEGORY_ICONS[cat]} ${def?.category ?? cat}</div>
        <div class="modal-building-level-row">
          <span class="modal-level-badge">Level ${state.level}</span>
          ${state.level < 4 ? `<span class="modal-max-hint">max 4</span>` : ''}
        </div>
        ${def?.unit ? `<div class="modal-building-unit">Recruits: <strong>${def.unit}</strong></div>` : ''}
        ${isBuilding ? `<div class="modal-building-timer" data-ready="${state.ready_at}">⏳ Building… ${timeLeft(state.ready_at)}</div>` : ''}
        ${isReady    ? `<button class="building-btn confirm-build-btn complete-mode" data-slot="${slot}">Complete</button>` : ''}
        ${canUpgrade ? `<button class="building-btn confirm-build-btn upgrade-mode" data-slot="${slot}">Upgrade to Lv ${state.level + 1}</button>` : ''}
      </div>
    `);

    root.querySelectorAll('.confirm-build-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const s = btn.dataset.slot;
        closeModal();
        if (btn.classList.contains('complete-mode')) {
          await completeBuild(s);
        } else {
          await startBuild(s, state.building_id);
        }
      });
    });
  }

  function showThroneModal(state) {
    openModal('Throne', `
      <div class="modal-building-option">
        <div class="modal-building-meta">${CATEGORY_ICONS.throne} throne</div>
        <div class="modal-building-level-row">
          <span class="modal-level-badge">Level ${state?.level ?? 1}</span>
        </div>
        <p class="modal-empty">The seat of your power. Cannot be moved or demolished.</p>
      </div>
    `);
  }

  function tickTimers() {
    root.querySelectorAll('.castle-node-timer').forEach(el => {
      const left = timeLeft(el.dataset.ready);
      if (left === 'Ready') renderBuildings();
    });
    root.querySelectorAll('.modal-building-timer').forEach(el => {
      const left = timeLeft(el.dataset.ready);
      el.textContent = left === 'Ready' ? '✓ Ready to complete' : `⏳ Building… ${left}`;
    });
  }

  async function startBuild(slot, building_id) {
    try {
      const updated = await api('/structures/build', {
        chat_id: player.chat_id,
        faction: player.faction,
        slot,
        building_id,
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