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
  { slot: 'slot_4', pos: 3 },
  { slot: 'slot_5', pos: 4 },
  { slot: 'slot_6', pos: 5 },
  { slot: 'slot_7', pos: 6 },
  { slot: 'slot_8', pos: 7 },
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
        <div class="castle-grounds">
          <div class="outer-ring" id="outer-ring"></div>
          <div class="center-slot" id="center-slot"></div>
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

  function slotLabel(slot, state) {
    const def = buildingDefs?.[player.faction]?.[slot];
    if (state.level > 0) return def?.label ?? slot;
    if (def && def.id !== 'empty') return def.label;
    return 'Empty';
  }

  function renderBuildings() {
    const data = structuresRecord.buildings_data;

    const throneState = data['slot_0'];
    const throneDef   = buildingDefs?.[player.faction]?.['slot_0'];
    root.querySelector('#center-slot').innerHTML = `
      <div class="castle-node castle-node--throne" data-slot="slot_0">
        <div class="castle-node-icon">${CATEGORY_ICONS.throne}</div>
        <div class="castle-node-label">${throneDef?.label ?? 'Throne'}</div>
        ${throneState?.level > 0 ? `<div class="castle-node-level">Lv ${throneState.level}</div>` : ''}
      </div>
    `;

    root.querySelector('#outer-ring').innerHTML = SLOT_LAYOUT.map(({ slot }) => {
      const state    = data[slot];
      const cat      = slotCategories?.[slot] ?? 'any';
      const isEmpty  = !state || (state.level === 0 && !state.ready_at);
      const isBuilding = state?.ready_at && new Date(state.ready_at) > new Date();
      const isReady    = state?.ready_at && new Date(state.ready_at) <= new Date();
      const label    = slotLabel(slot, state ?? { level: 0 });

      return `
        <div class="castle-node castle-node--${cat} ${isEmpty ? 'castle-node--empty' : ''} ${isBuilding ? 'castle-node--building' : ''} ${isReady ? 'castle-node--ready' : ''}" data-slot="${slot}">
          <div class="castle-node-icon">${CATEGORY_ICONS[cat] ?? '·'}</div>
          <div class="castle-node-label">${label}</div>
          ${state?.level > 0 ? `<div class="castle-node-level">Lv ${state.level}</div>` : ''}
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
    const def   = buildingDefs?.[player.faction]?.[slot];
    const cat   = slotCategories?.[slot] ?? 'any';

    if (!state || (state.level === 0 && !state.ready_at)) {
      if (cat === 'throne') return;
      showBuildModal(slot);
      return;
    }

    showDetailsModal(slot, state, def, cat);
  }

  function showBuildModal(slot) {
    const def = buildingDefs?.[player.faction]?.[slot];

    if (!def || def.id === 'empty') {
      openModal('Empty Slot', `<p class="modal-empty">No buildings available for this slot yet.</p>`);
      return;
    }

    const cat = slotCategories?.[slot] ?? 'any';

    openModal(`Build — ${def.label}`, `
      <div class="modal-building-option">
        <div class="modal-building-meta">${CATEGORY_ICONS[cat]} ${def.category}</div>
        ${def.unit ? `<div class="modal-building-unit">Recruits: <strong>${def.unit}</strong></div>` : ''}
        <button class="building-btn confirm-build-btn" data-slot="${slot}">Build</button>
      </div>
    `);

    root.querySelector('.confirm-build-btn').addEventListener('click', async () => {
      closeModal();
      await startBuild(slot);
    });
  }

  function showDetailsModal(slot, state, def, cat) {
    const isBuilding = state.ready_at && new Date(state.ready_at) > new Date();
    const isReady    = state.ready_at && new Date(state.ready_at) <= new Date();
    const isThrone   = cat === 'throne';

    const canUpgrade = !isThrone && !isBuilding && !isReady && state.level < 4;

    openModal(def?.label ?? slot, `
      <div class="modal-building-option">
        <div class="modal-building-meta">${CATEGORY_ICONS[cat]} ${def?.category ?? cat}</div>
        <div class="modal-building-level-row">
          <span class="modal-level-badge">Level ${state.level}</span>
          ${state.level < 4 && !isThrone ? `<span class="modal-max-hint">max 4</span>` : ''}
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
          await startBuild(btn.dataset.slot);
        }
      });
    });
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