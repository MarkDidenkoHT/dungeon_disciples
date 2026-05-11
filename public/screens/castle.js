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

const SLOT_LAYOUT = [
  { slot: 'slot_1', pos: 0 },
  { slot: 'slot_2', pos: 1 },
  { slot: 'slot_3', pos: 2 },
  { slot: 'slot_7', pos: 3 },
  { slot: 'slot_8', pos: 4 },
  { slot: 'slot_4', pos: 5 },
  { slot: 'slot_5', pos: 6 },
  { slot: 'slot_6', pos: 7 },
];

export function renderCastle(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-castle">
      <main class="castle-main">
        <div class="castle-grounds">
          <div class="res-col res-col--left" id="res-col-left"></div>
          <div class="outer-ring" id="outer-ring"></div>
          <div class="center-slot" id="center-slot"></div>
          <div class="res-col res-col--right" id="res-col-right"></div>
        </div>
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

    root.querySelector('#res-col-left').innerHTML = [
      { icon: '🪙', amount: find('Gold')?.amount ?? 0 },
      { icon: '🏆', amount: find('Trophies')?.amount ?? 0 },
      { icon: '🔮', amount: find('Mana')?.amount ?? 0 },
    ].map(r => `
      <div class="res-item">
        <span class="res-icon">${r.icon}</span>
        <span class="res-amount">${r.amount}</span>
      </div>
    `).join('');

    root.querySelector('#res-col-right').innerHTML = CRYSTAL_TYPES.map(c => `
      <div class="res-item">
        <span class="res-icon">${c.icon}</span>
        <span class="res-amount">${find(c.key)?.amount ?? 0}</span>
      </div>
    `).join('');

    buildingPools    = buildingsResp.pools;
    slotCategories   = buildingsResp.slot_categories;
    structuresRecord = structures;
    renderBuildings();
  }

  function getSlotDef(building_id) {
    if (!building_id || !buildingPools) return null;
    const faction = buildingPools[player.faction];
    if (!faction) return null;
    for (const pool of Object.values(faction)) {
      const found = pool.find(b => b.id === building_id);
      if (found) return found;
    }
    return null;
  }

  function renderBuildings() {
    const data = structuresRecord.buildings_data;

    const throneState = data['slot_0'];
    const throneDef   = getSlotDef(throneState?.building_id);
    root.querySelector('#center-slot').innerHTML = `
      <div class="castle-node castle-node--throne" data-slot="slot_0">
        <div class="castle-node-icon">${CATEGORY_ICONS.throne}</div>
        <div class="castle-node-label">${throneDef?.label ?? 'Throne'}</div>
        ${throneState?.level > 0 ? `<div class="castle-node-level">Lv ${throneState.level}</div>` : ''}
      </div>
    `;

    root.querySelector('#outer-ring').innerHTML = SLOT_LAYOUT.map(({ slot }) => {
      const state      = data[slot] ?? { level: 0, ready_at: null, building_id: null };
      const cat        = slotCategories?.[slot] ?? 'any';
      const def        = getSlotDef(state.building_id);
      const isEmpty    = !state.building_id && state.level === 0;
      const isBuilding = state.ready_at && new Date(state.ready_at) > new Date();
      const isReady    = state.ready_at && new Date(state.ready_at) <= new Date();
      const label      = def?.label ?? (isEmpty ? 'Empty' : slot);

      return `
        <div class="castle-node castle-node--${cat} ${isEmpty ? 'castle-node--empty' : ''} ${isBuilding ? 'castle-node--building' : ''} ${isReady ? 'castle-node--ready' : ''}" data-slot="${slot}">
          <div class="castle-node-icon">${CATEGORY_ICONS[cat] ?? '·'}</div>
          <div class="castle-node-label">${label}</div>
          ${state.level > 0 ? `<div class="castle-node-level">Lv ${state.level}</div>` : ''}
          ${isBuilding ? `<div class="castle-node-timer" data-ready="${state.ready_at}">⏳</div>` : ''}
          ${isReady    ? `<div class="castle-node-ready">✓</div>` : ''}
        </div>
      `;
    }).join('');

    root.querySelector('#outer-ring').querySelectorAll('.castle-node').forEach(node => {
      node.addEventListener('click', () => handleSlotClick(node.dataset.slot));
    });

    root.querySelector('#center-slot').querySelector('.castle-node').addEventListener('click', () => {
      handleSlotClick('slot_0');
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
      showDetailsModal(slot, state, getSlotDef(state.building_id), cat);
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
          <div class="modal-building-card">
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
        closeModal();
        await startBuild(btn.dataset.slot, btn.dataset.buildingId);
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
        closeModal();
        if (btn.classList.contains('complete-mode')) {
          await completeBuild(btn.dataset.slot);
        } else {
          await startBuild(btn.dataset.slot, state.building_id);
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
      if (timeLeft(el.dataset.ready) === 'Ready') renderBuildings();
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