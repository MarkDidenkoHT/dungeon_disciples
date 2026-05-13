import { api }      from '../main.js';
import { navigate } from '../main.js';

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
  let UNITS = null;

  function openModal(title, bodyHtml) {
    root.querySelector('#modal-title').textContent = title;
    root.querySelector('#modal-body').innerHTML = bodyHtml;
    root.querySelector('#modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    root.querySelector('#modal-overlay').classList.add('hidden');
  }

  root.querySelector('#modal-close').addEventListener('click', closeModal);
  root.querySelector('#modal-overlay').addEventListener('click', e => {
    if (e.target === root.querySelector('#modal-overlay')) closeModal();
  });

  async function loadUnits() {
    if (UNITS) return UNITS;
    const mod = await import('../../data/units.js');
    UNITS = mod.UNITS || mod.default?.UNITS || mod;
    return UNITS;
  }

  async function load() {
    const [inventory, structures, buildingsResp] = await Promise.all([
      api(`/inventory?chat_id=${player.chat_id}&type=resource`),
      api(`/structures?chat_id=${player.chat_id}`),
      api('/buildings'),
    ]);

    const find = (name) => inventory.find(r => r.item === name) || { amount: 0 };

    root.querySelector('#res-mana').innerHTML = `<div class="res-item"><span class="res-icon">🔮</span><span class="res-amount">${find('Mana').amount}</span></div>`;
    root.querySelector('#res-col-left').innerHTML = `<div class="res-item"><span class="res-icon">🪙</span><span class="res-amount">${find('Gold').amount}</span></div>`;
    root.querySelector('#res-col-right').innerHTML = `
      <div class="res-item"><span class="res-icon">🟢</span><span class="res-amount">${find('Crystals_Life').amount}</span></div>
      <div class="res-item"><span class="res-icon">🔴</span><span class="res-amount">${find('Crystals_Fire').amount}</span></div>
      <div class="res-item"><span class="res-icon">🟣</span><span class="res-amount">${find('Crystals_Death').amount}</span></div>
      <div class="res-item"><span class="res-icon">🟡</span><span class="res-amount">${find('Crystals_Nature').amount}</span></div>
      <div class="res-item"><span class="res-icon">🔵</span><span class="res-amount">${find('Crystals_Frost').amount}</span></div>
    `;

    buildingPools = buildingsResp.pools;
    structuresRecord = structures;
    await loadUnits();
    renderBuildings();
  }

  function getBuildingDef(faction, buildingId) {
    if (!buildingPools || !faction) return null;
    for (const pool of Object.values(buildingPools[faction])) {
      const found = pool.find(b => b.id === buildingId);
      if (found) return found;
    }
    return null;
  }

  function getUnitData(unitId) {
    if (!unitId || !UNITS) return null;
    const all = { ...UNITS.empire, ...UNITS.dungeon, ...UNITS.enemies };
    return all[unitId] || null;
  }

  function renderBuildings() {
    const data = structuresRecord.buildings_data;

    root.querySelector('#center-slot').innerHTML = `
      <div class="castle-node castle-node--throne" data-slot="slot_0">
        <div class="castle-node-icon">♛</div>
        <div class="castle-node-label">Throne</div>
        <div class="castle-node-level">Lv ${data['slot_0'].level}</div>
      </div>
    `;

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

  async function handleSlotClick(slot) {
    const state = structuresRecord.buildings_data[slot];
    if (!state || !state.building_id) return;

    const def = getBuildingDef(player.faction, state.building_id);
    if (!def) {
      openModal("Building", `<p>No information available.</p>`);
      return;
    }

    openModal(def.label, `<p>Building clicked: ${def.label} (Level ${state.level})<br>Upgrades not fully implemented yet.</p>`);
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