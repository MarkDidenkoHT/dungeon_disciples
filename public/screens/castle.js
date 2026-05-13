import { api }      from '../main.js';
import { navigate } from '../main.js';

function timeLeft(ready_at) {
  const diff = new Date(ready_at) - Date.now();
  if (diff <= 0) return 'Ready';
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const CATEGORY_ICONS = {
  throne: '♛',
  barracks: '⚔',
  any: '✦',
};

export function renderCastle(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-castle">
      <main class="castle-main">
        <div class="res-mana-top" id="res-mana"></div>
        <div class="castle-grounds">
          <div class="res-col res-col--left" id="res-col-left"></div>
          <div class="castle-grid-wrap">
            <div class="outer-ring" id="outer-ring"></div>
            <div class="center-slot" id="center-slot"></div>
          </div>
          <div class="res-col res-col--right" id="res-col-right"></div>
        </div>
      </main>

      <nav class="bottom-nav">
        <button class="nav-btn active" data-screen="castle">Castle</button>
        <button class="nav-btn" data-screen="roster">Roster</button>
        <button class="nav-btn" data-screen="embark">Embark</button>
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
  let buildingPools = null;

  function openModal(title, bodyHtml) {
    root.querySelector('#modal-title').textContent = title;
    root.querySelector('#modal-body').innerHTML = bodyHtml;
    root.querySelector('#modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    root.querySelector('#modal-overlay').classList.add('hidden');
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

    const find = (name) => inventory.find(r => r.item === name) || { amount: 0 };

    root.querySelector('#res-mana').innerHTML = `
      <div class="res-item"><span class="res-icon">🔮</span><span class="res-amount">${find('Mana').amount}</span></div>
    `;

    root.querySelector('#res-col-left').innerHTML = `
      <div class="res-item"><span class="res-icon">🪙</span><span class="res-amount">${find('Gold').amount}</span></div>
    `;

    root.querySelector('#res-col-right').innerHTML = `
      <div class="res-item"><span class="res-icon">🟢</span><span class="res-amount">${find('Crystals_Life').amount}</span></div>
      <div class="res-item"><span class="res-icon">🔴</span><span class="res-amount">${find('Crystals_Fire').amount}</span></div>
      <div class="res-item"><span class="res-icon">🟣</span><span class="res-amount">${find('Crystals_Death').amount}</span></div>
      <div class="res-item"><span class="res-icon">🟡</span><span class="res-amount">${find('Crystals_Nature').amount}</span></div>
      <div class="res-item"><span class="res-icon">🔵</span><span class="res-amount">${find('Crystals_Frost').amount}</span></div>
    `;

    buildingPools = buildingsResp.pools;
    structuresRecord = structures;

    renderBuildings();
  }

  function renderBuildings() {
    const data = structuresRecord.buildings_data;

    // Throne
    const throneState = data['slot_0'];
    root.querySelector('#center-slot').innerHTML = `
      <div class="castle-node castle-node--throne" data-slot="slot_0">
        <div class="castle-node-icon">♛</div>
        <div class="castle-node-label">Throne</div>
        <div class="castle-node-level">Lv ${throneState.level}</div>
      </div>
    `;

    // Barracks & other slots
    root.querySelector('#outer-ring').innerHTML = Object.keys(data).filter(s => s !== 'slot_0').map(slot => {
      const state = data[slot] || { level: 0, building_id: null };
      const def = state.building_id ? getBuildingDef(player.faction, state.building_id) : null;
      const isEmpty = !state.building_id;
      const isBuilding = state.ready_at && new Date(state.ready_at) > Date.now();

      return `
        <div class="castle-node ${isEmpty ? 'castle-node--empty' : ''} ${isBuilding ? 'castle-node--building' : ''}" data-slot="${slot}">
          <div class="castle-node-icon">⚔</div>
          <div class="castle-node-label">${def ? def.label : 'Empty'}</div>
          ${state.level > 0 ? `<div class="castle-node-level">Lv ${state.level}</div>` : ''}
          ${isBuilding ? `<div class="castle-node-timer" data-ready="${state.ready_at}">⏳</div>` : ''}
        </div>
      `;
    }).join('');

    root.querySelectorAll('.castle-node').forEach(node => {
      node.addEventListener('click', () => handleSlotClick(node.dataset.slot));
    });
  }

  function getBuildingDef(faction, buildingId) {
    if (!buildingPools || !faction) return null;
    for (const pool of Object.values(buildingPools[faction])) {
      const found = pool.find(b => b.id === buildingId);
      if (found) return found;
    }
    return null;
  }

  async function handleSlotClick(slot) {
    const state = structuresRecord.buildings_data[slot];
    if (!state || !state.building_id) return;

    const def = getBuildingDef(player.faction, state.building_id);
    if (!def) return;

    let html = `<h3>${def.label} (Level ${state.level})</h3>`;

    if (def.upgrades && def.upgrades.length > 0) {
      html += `<p><strong>Upgrade paths:</strong></p><ul>`;
      def.upgrades.forEach(uid => {
        html += `<li>→ Unlocks unit <strong>${uid}</strong></li>`;
      });
      html += `</ul>`;

      html += `<button id="upgrade-btn" data-slot="${slot}">Upgrade Building (50 Gold)</button>`;
    } else {
      html += `<p>No further upgrades available.</p>`;
    }

    openModal(def.label, html);

    const upgradeBtn = document.getElementById('upgrade-btn');
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', () => upgradeBuilding(slot, def));
    }
  }

  async function upgradeBuilding(slot, def) {
    closeModal();

    try {
      const updated = await api('/structures/build', {
        chat_id: player.chat_id,
        faction: player.faction,
        slot: slot,
        building_id: def.id   // current building id - backend will handle next level
      });

      structuresRecord = updated;
      renderBuildings();
      alert(`Building upgraded successfully!`);
    } catch (err) {
      alert(err.message || 'Failed to upgrade building');
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