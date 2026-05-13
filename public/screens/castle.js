import { api }      from '../main.js';
import { navigate } from '../main.js';

let UNITS = null;

async function loadUnits() {
  try {
    const mod = await import('../../data/units.js');
    UNITS = mod.UNITS || mod.default?.UNITS || mod;
    return UNITS;
  } catch (err) {
    console.error('[Castle] FAILED to load units.js:', err);
    return null;
  }
}

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
  let upgradePaths = null;

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

    root.querySelector('#res-mana').innerHTML = `<div class="res-item"><span class="res-icon">🔮</span><span class="res-amount">${find('Mana').amount}</span></div>`;
    root.querySelector('#res-col-left').innerHTML = `<div class="res-item"><span class="res-icon">🪙</span><span class="res-amount">${find('Gold').amount}</span></div>`;
    root.querySelector('#res-col-right').innerHTML = `
      <div class="res-item"><span class="res-icon">🟢</span><span class="res-amount">${find('Crystals_Life').amount}</span></div>
      <div class="res-item"><span class="res-icon">🔴</span><span class="res-amount">${find('Crystals_Fire').amount}</span></div>
      <div class="res-item"><span class="res-icon">🟣</span><span class="res-amount">${find('Crystals_Death').amount}</span></div>
      <div class="res-item"><span class="res-icon">🟡</span><span class="res-amount">${find('Crystals_Nature').amount}</span></div>
      <div class="res-item"><span class="res-icon">🔵</span><span class="res-amount">${find('Crystals_Frost').amount}</span></div>
    `;

    buildingPools  = buildingsResp.pools;
    upgradePaths   = buildingsResp.upgrade_paths || {};
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

  function getUnitByUnitId(unitId) {
    if (!unitId || !UNITS) return null;
    const all = { ...UNITS.empire, ...UNITS.dungeon, ...UNITS.enemies };
    return Object.values(all).find(u => u.id === unitId) || null;
  }

  function getUpgradePathsForBuilding(faction, def) {
    if (!def || !def.upgrades || def.upgrades.length === 0) return [];
    const factionPaths = upgradePaths[faction] || {};
    const paths = factionPaths[def.unit_id];
    if (paths && paths.length > 0) return paths;
    return def.upgrades.map(uid => ({ unit_id: uid, building_id: uid, label: uid }));
  }

  function statDiff(current, next, key) {
    if (current == null || next == null) return '';
    const diff = next[key] - current[key];
    if (diff === 0) return '';
    return diff > 0
      ? `<span class="stat-diff stat-diff--up">+${diff}</span>`
      : `<span class="stat-diff stat-diff--down">${diff}</span>`;
  }

  function renderUnitCard(unit, label) {
    if (!unit) return `<div class="upgrade-unit-card upgrade-unit-card--empty"><div class="upgrade-unit-label">${label}</div><div class="upgrade-unit-unknown">Unknown Unit</div></div>`;

    const typeIcon = { melee: '⚔', ranged: '🏹', caster: '✦', healer: '✚' }[unit.type] || '?';
    const tags = (unit.tags || []).filter(Boolean).join(', ');

    return `
      <div class="upgrade-unit-card">
        <div class="upgrade-unit-label">${label}</div>
        <div class="upgrade-unit-name">${unit.name}</div>
        <div class="upgrade-unit-type">${typeIcon} ${unit.type}${tags ? ' · ' + tags : ''}</div>
        <div class="upgrade-unit-stats">
          <div class="upgrade-stat"><span class="upgrade-stat-label">HP</span><span class="upgrade-stat-val">${unit.hp}</span></div>
          <div class="upgrade-stat"><span class="upgrade-stat-label">Armor</span><span class="upgrade-stat-val">${unit.armor}</span></div>
          <div class="upgrade-stat"><span class="upgrade-stat-label">Initiative</span><span class="upgrade-stat-val">${unit.initiative}</span></div>
          <div class="upgrade-stat"><span class="upgrade-stat-label">Power</span><span class="upgrade-stat-val">${unit.action_power}</span></div>
          <div class="upgrade-stat"><span class="upgrade-stat-label">Targets</span><span class="upgrade-stat-val">${unit.targets}</span></div>
          <div class="upgrade-stat"><span class="upgrade-stat-label">Range</span><span class="upgrade-stat-val">${unit.range}</span></div>
        </div>
        <div class="upgrade-unit-res">
          ${Object.entries(unit.resistances || {}).filter(([,v]) => v !== 0).map(([k,v]) => `<span class="res-badge ${v > 0 ? 'res-badge--pos' : 'res-badge--neg'}">${k} ${v > 0 ? '+' : ''}${v}%</span>`).join('')}
        </div>
        ${unit.passive ? `<div class="upgrade-unit-trait"><span class="trait-label">Passive</span> ${unit.passive}</div>` : ''}
        ${unit.ability ? `<div class="upgrade-unit-trait"><span class="trait-label">Ability</span> ${unit.ability}</div>` : ''}
      </div>
    `;
  }

  function renderUnitComparison(currentUnit, nextUnit) {
    if (!currentUnit || !nextUnit) {
      return `
        <div class="upgrade-comparison">
          ${renderUnitCard(currentUnit, 'Current')}
          <div class="upgrade-arrow">→</div>
          ${renderUnitCard(nextUnit, 'After Upgrade')}
        </div>
      `;
    }

    const statKeys = ['hp', 'armor', 'initiative', 'action_power', 'targets', 'range'];
    const statLabels = { hp: 'HP', armor: 'Armor', initiative: 'Initiative', action_power: 'Power', targets: 'Targets', range: 'Range' };
    const typeIcon = (t) => ({ melee: '⚔', ranged: '🏹', caster: '✦', healer: '✚' }[t] || '?');

    const buildStatRow = (unit, other, key) => {
      const diff = other[key] - unit[key];
      const diffHtml = diff === 0 ? ''
        : diff > 0 ? `<span class="stat-diff stat-diff--up">▲${diff}</span>`
        : `<span class="stat-diff stat-diff--down">▼${Math.abs(diff)}</span>`;
      return `
        <div class="cmp-stat-row">
          <span class="cmp-stat-key">${statLabels[key]}</span>
          <span class="cmp-stat-cur">${unit[key]}</span>
          <span class="cmp-stat-arrow">→</span>
          <span class="cmp-stat-nxt">${other[key]}${diffHtml}</span>
        </div>
      `;
    };

    const tagsA = (currentUnit.tags || []).filter(Boolean).join(', ');
    const tagsB = (nextUnit.tags || []).filter(Boolean).join(', ');

    return `
      <div class="upgrade-comparison">
        <div class="upgrade-unit-card">
          <div class="upgrade-unit-label">Current</div>
          <div class="upgrade-unit-name">${currentUnit.name}</div>
          <div class="upgrade-unit-type">${typeIcon(currentUnit.type)} ${currentUnit.type}${tagsA ? ' · ' + tagsA : ''}</div>
          <div class="upgrade-unit-res">
            ${Object.entries(currentUnit.resistances || {}).filter(([,v]) => v !== 0).map(([k,v]) => `<span class="res-badge ${v > 0 ? 'res-badge--pos' : 'res-badge--neg'}">${k} ${v > 0 ? '+' : ''}${v}%</span>`).join('')}
          </div>
          ${currentUnit.passive ? `<div class="upgrade-unit-trait"><span class="trait-label">Passive</span> ${currentUnit.passive}</div>` : ''}
          ${currentUnit.ability ? `<div class="upgrade-unit-trait"><span class="trait-label">Ability</span> ${currentUnit.ability}</div>` : ''}
        </div>

        <div class="upgrade-stats-col">
          ${statKeys.map(k => buildStatRow(currentUnit, nextUnit, k)).join('')}
        </div>

        <div class="upgrade-unit-card">
          <div class="upgrade-unit-label">After Upgrade</div>
          <div class="upgrade-unit-name">${nextUnit.name}</div>
          <div class="upgrade-unit-type">${typeIcon(nextUnit.type)} ${nextUnit.type}${tagsB ? ' · ' + tagsB : ''}</div>
          <div class="upgrade-unit-res">
            ${Object.entries(nextUnit.resistances || {}).filter(([,v]) => v !== 0).map(([k,v]) => `<span class="res-badge ${v > 0 ? 'res-badge--pos' : 'res-badge--neg'}">${k} ${v > 0 ? '+' : ''}${v}%</span>`).join('')}
          </div>
          ${nextUnit.passive ? `<div class="upgrade-unit-trait"><span class="trait-label">Passive</span> ${nextUnit.passive}</div>` : ''}
          ${nextUnit.ability ? `<div class="upgrade-unit-trait"><span class="trait-label">Ability</span> ${nextUnit.ability}</div>` : ''}
        </div>
      </div>
    `;
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
      openModal('Error', '<p>Building definition not found.</p>');
      return;
    }

    const paths = getUpgradePathsForBuilding(player.faction, def);

    if (!paths || paths.length === 0) {
      const currentUnit = getUnitByUnitId(def.unit_id);
      openModal(def.label, `
        <div class="upgrade-no-paths">
          ${renderUnitCard(currentUnit, 'Current Unit')}
          <p class="upgrade-maxed">No upgrades available for this building.</p>
        </div>
      `);
      return;
    }

    openUpgradeModal(slot, def, paths);
  }

  function openUpgradeModal(slot, def, paths) {
    let selectedPathIndex = 0;

    function buildModalHtml(selIdx) {
      const tabsHtml = paths.length > 1 ? `
        <div class="upgrade-tabs">
          ${paths.map((p, i) => {
            const u = getUnitByUnitId(p.unit_id);
            return `<button class="upgrade-tab ${i === selIdx ? 'upgrade-tab--active' : ''}" data-path-index="${i}">${u ? u.name : p.label}</button>`;
          }).join('')}
        </div>
      ` : '';

      const selectedPath = paths[selIdx];
      const currentUnit  = getUnitByUnitId(def.unit_id);
      const nextUnit     = getUnitByUnitId(selectedPath.unit_id);

      return `
        ${tabsHtml}
        <div class="upgrade-body">
          ${renderUnitComparison(currentUnit, nextUnit)}
        </div>
        <button class="upgrade-confirm-btn" id="confirm-upgrade-btn">Upgrade Building</button>
      `;
    }

    openModal(def.label, buildModalHtml(selectedPathIndex));

    function attachListeners() {
      root.querySelectorAll('.upgrade-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedPathIndex = parseInt(btn.dataset.pathIndex, 10);
          root.querySelector('#modal-body').innerHTML = buildModalHtml(selectedPathIndex);
          attachListeners();
        });
      });

      const confirmBtn = root.querySelector('#confirm-upgrade-btn');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          const selectedPath = paths[selectedPathIndex];
          performBuildingUpgrade(slot, selectedPath.building_id);
        });
      }
    }

    attachListeners();
  }

  async function performBuildingUpgrade(slot, building_id) {
    closeModal();
    try {
      const updated = await api('/structures/build', {
        chat_id: player.chat_id,
        faction: player.faction,
        slot: slot,
        building_id: building_id
      });
      structuresRecord = updated;
      renderBuildings();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Upgrade failed');
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