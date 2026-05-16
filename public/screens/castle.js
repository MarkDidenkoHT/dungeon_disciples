import { api } from '../main.js';
import { navigate } from '../main.js';
import { renderSpellTome } from './spell_tome.js';

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
        <button class="nav-btn" data-screen="spells">Spells</button>
      </nav>
    </div>

    <!-- Modal lives OUTSIDE .screen-castle so it overlays everything -->
    <div id="modal-overlay" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header">
          <span id="modal-title"></span>
          <button id="modal-close" aria-label="Close">✕</button>
        </div>
        <div id="modal-body" class="modal-body"></div>
      </div>
    </div>
  `;

  /* ── State ── */
  let structuresRecord  = null;
  let buildingPools     = null;
  let upgradePaths      = null;
  let throneUpgradeCosts = {};
  let heroMaxLevel      = 4;

  /* ── Modal helpers ── */

  const overlay   = root.querySelector('#modal-overlay');
  const modalBody = root.querySelector('#modal-body');
  const modalTitle = root.querySelector('#modal-title');

  function openModal(title, bodyHtml) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    overlay.classList.remove('hidden');
    // Prevent body scroll while modal open
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  root.querySelector('#modal-close').addEventListener('click', closeModal);

  // Tap backdrop to dismiss
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  /* ── Data loading ── */

  async function load() {
    const [inventory, structures, buildingsResp] = await Promise.all([
      api(`/inventory?chat_id=${player.chat_id}&type=resource`),
      api(`/structures?chat_id=${player.chat_id}`),
      api('/buildings'),
    ]);

    const find = (name) => inventory.find(r => r.item === name) || { amount: 0 };

    root.querySelector('#res-mana').innerHTML = `
      <div class="res-item">
        <span class="res-icon">🔮</span>
        <span class="res-amount">${find('Mana').amount}</span>
      </div>`;

    root.querySelector('#res-col-left').innerHTML = `
      <div class="res-item">
        <span class="res-icon">🪙</span>
        <span class="res-amount">${find('Gold').amount}</span>
      </div>`;

    root.querySelector('#res-col-right').innerHTML = `
      <div class="res-item"><span class="res-icon">🟢</span><span class="res-amount">${find('Crystals_Life').amount}</span></div>
      <div class="res-item"><span class="res-icon">🔴</span><span class="res-amount">${find('Crystals_Fire').amount}</span></div>
      <div class="res-item"><span class="res-icon">🟣</span><span class="res-amount">${find('Crystals_Death').amount}</span></div>
      <div class="res-item"><span class="res-icon">🟡</span><span class="res-amount">${find('Crystals_Nature').amount}</span></div>
      <div class="res-item"><span class="res-icon">🔵</span><span class="res-amount">${find('Crystals_Frost').amount}</span></div>`;

    buildingPools      = buildingsResp.pools;
    upgradePaths       = buildingsResp.upgrade_paths || {};
    throneUpgradeCosts = buildingsResp.throne_upgrade_costs || {};
    heroMaxLevel       = buildingsResp.hero_max_level || 4;
    structuresRecord   = structures;

    await loadUnits();

    // Auto-complete any finished builds
    const readySlots = Object.entries(structures.buildings_data)
      .filter(([, s]) => s.ready_at && new Date(s.ready_at) <= new Date())
      .map(([slot]) => slot);

    if (readySlots.length > 0) {
      await Promise.all(readySlots.map(slot =>
        api('/structures/complete', { chat_id: player.chat_id, slot, faction: player.faction })
      ));
      structuresRecord = await api(`/structures?chat_id=${player.chat_id}`);
    }

    renderBuildings();
  }

  /* ── Lookup helpers ── */

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

  /* ── Render helpers ── */

  function renderUnitCard(unit, label) {
    if (!unit) {
      return `
        <div class="upgrade-unit-card upgrade-unit-card--empty">
          <div class="upgrade-unit-label">${label}</div>
          <div class="upgrade-unit-unknown">Unknown Unit</div>
        </div>`;
    }

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
          ${Object.entries(unit.resistances || {})
            .filter(([, v]) => v !== 0)
            .map(([k, v]) => `<span class="res-badge ${v > 0 ? 'res-badge--pos' : 'res-badge--neg'}">${k} ${v > 0 ? '+' : ''}${v}%</span>`)
            .join('')}
        </div>
        ${unit.passive ? `<div class="upgrade-unit-trait"><span class="trait-label">Passive</span> ${unit.passive}</div>` : ''}
        ${unit.ability ? `<div class="upgrade-unit-trait"><span class="trait-label">Ability</span> ${unit.ability}</div>` : ''}
      </div>`;
  }

  function renderUnitComparison(currentUnit, nextUnit) {
    const typeIcon = (t) => ({ melee: '⚔', ranged: '🏹', caster: '✦', healer: '✚' }[t] || '?');
    const statKeys   = ['hp', 'armor', 'initiative', 'action_power', 'targets', 'range'];
    const statLabels = { hp: 'HP', armor: 'Armor', initiative: 'Init', action_power: 'Power', targets: 'Targets', range: 'Range' };

    if (!currentUnit || !nextUnit) {
      return `
        <div class="upgrade-comparison">
          ${renderUnitCard(currentUnit, 'Current')}
          <div style="display:flex;align-items:center;color:var(--muted)">→</div>
          ${renderUnitCard(nextUnit, 'After Upgrade')}
        </div>`;
    }

    const buildStatRow = (key) => {
      const a = currentUnit[key], b = nextUnit[key];
      const diff = b - a;
      const diffHtml = diff === 0 ? ''
        : diff > 0 ? `<span class="stat-diff stat-diff--up">▲${diff}</span>`
        : `<span class="stat-diff stat-diff--down">▼${Math.abs(diff)}</span>`;
      return `
        <div class="cmp-stat-row">
          <span class="cmp-stat-key">${statLabels[key]}</span>
          <span class="cmp-stat-cur">${a}</span>
          <span class="cmp-stat-arrow">→</span>
          <span class="cmp-stat-nxt">${b}${diffHtml}</span>
        </div>`;
    };

    const tagsA = (currentUnit.tags || []).filter(Boolean).join(', ');
    const tagsB = (nextUnit.tags  || []).filter(Boolean).join(', ');

    const unitCol = (unit, label, tags) => `
      <div class="upgrade-unit-card">
        <div class="upgrade-unit-label">${label}</div>
        <div class="upgrade-unit-name">${unit.name}</div>
        <div class="upgrade-unit-type">${typeIcon(unit.type)} ${unit.type}${tags ? ' · ' + tags : ''}</div>
        <div class="upgrade-unit-res">
          ${Object.entries(unit.resistances || {})
            .filter(([, v]) => v !== 0)
            .map(([k, v]) => `<span class="res-badge ${v > 0 ? 'res-badge--pos' : 'res-badge--neg'}">${k} ${v > 0 ? '+' : ''}${v}%</span>`)
            .join('')}
        </div>
        ${unit.passive ? `<div class="upgrade-unit-trait"><span class="trait-label">Passive</span> ${unit.passive}</div>` : ''}
        ${unit.ability ? `<div class="upgrade-unit-trait"><span class="trait-label">Ability</span> ${unit.ability}</div>` : ''}
      </div>`;

    return `
      <div class="upgrade-comparison">
        ${unitCol(currentUnit, 'Current', tagsA)}
        <div class="upgrade-stats-col">
          ${statKeys.map(buildStatRow).join('')}
        </div>
        ${unitCol(nextUnit, 'After Upgrade', tagsB)}
      </div>`;
  }

  /* ── Castle grid rendering ── */

  function renderBuildings() {
    const data = structuresRecord.buildings_data;

    const throneState  = data['slot_0'];
    const throneLevel  = throneState?.level || 1;
    const throneMaxed  = throneLevel >= heroMaxLevel;

    root.querySelector('#center-slot').innerHTML = `
      <div class="castle-node castle-node--throne castle-node--clickable" data-slot="slot_0">
        <div class="castle-node-icon">♛</div>
        <div class="castle-node-label">Throne</div>
        <div class="castle-node-level">Lv ${throneLevel}</div>
        ${!throneMaxed ? `<div class="castle-node-hint">Upgrade</div>` : ''}
      </div>`;

    root.querySelector('#outer-ring').innerHTML = Object.keys(data)
      .filter(s => s !== 'slot_0')
      .map(slot => {
        const state      = data[slot] || { level: 0, building_id: null };
        const def        = state.building_id ? getBuildingDef(player.faction, state.building_id) : null;
        const isEmpty    = !state.building_id;
        const isBuilding = state.ready_at && new Date(state.ready_at) > Date.now();
        const hasUpgrade = def && getUpgradePathsForBuilding(player.faction, def).length > 0;

        const nodeClass = [
          'castle-node',
          isEmpty    ? 'castle-node--empty'    : '',
          isBuilding ? 'castle-node--building' : '',
        ].filter(Boolean).join(' ');

        return `
          <div class="${nodeClass}" data-slot="${slot}">
            <div class="castle-node-icon">${isEmpty ? '＋' : '⚔'}</div>
            <div class="castle-node-label">${def ? def.label : (isEmpty ? 'Build' : 'Empty')}</div>
            ${state.level > 0 ? `<div class="castle-node-level">Lv ${state.level}</div>` : ''}
            ${isBuilding ? `<div class="castle-node-timer" data-ready="${state.ready_at}">⏳</div>` : ''}
            ${!isEmpty && !isBuilding && hasUpgrade ? `<div class="castle-node-hint">Upgrade</div>` : ''}
          </div>`;
      }).join('');

    root.querySelectorAll('.castle-node').forEach(node => {
      node.addEventListener('click', () => handleSlotClick(node.dataset.slot));
    });
  }

  /* ── Slot click handlers ── */

  async function handleSlotClick(slot) {
    const state = structuresRecord.buildings_data[slot];

    if (slot === 'slot_0') { handleThroneClick(); return; }
    if (!state || !state.building_id) { openBuildModal(slot); return; }

    const def = getBuildingDef(player.faction, state.building_id);
    if (!def) { openModal('Error', '<p class="modal-empty">Building definition not found.</p>'); return; }

    const paths = getUpgradePathsForBuilding(player.faction, def);

    if (!paths || paths.length === 0) {
      const currentUnit = getUnitByUnitId(def.unit_id);
      openModal(def.label, `
        <div class="upgrade-no-paths">
          ${renderUnitCard(currentUnit, 'Current Unit')}
          <p class="upgrade-maxed">No upgrades available for this building.</p>
        </div>`);
      return;
    }

    openUpgradeModal(slot, def, paths);
  }

  function openBuildModal(slot) {
    const SLOT_CATEGORIES = {
      slot_0: 'throne', slot_1: 'barracks', slot_2: 'barracks',
      slot_3: 'barracks', slot_4: 'barracks', slot_5: 'barracks',
      slot_6: 'barracks', slot_7: 'any', slot_8: 'any',
    };
    const slotCategory = SLOT_CATEGORIES[slot] || 'any';
    const factionPools = buildingPools[player.faction] || {};
    const available    = [];

    for (const [cat, pool] of Object.entries(factionPools)) {
      if (slotCategory === 'any' || cat === slotCategory) {
        for (const b of pool) {
          if (b.category !== 'throne' && b.tier === 1) available.push(b);
        }
      }
    }

    if (!available.length) {
      openModal('Build', '<p class="modal-empty">No buildings available for this slot.</p>');
      return;
    }

    openModal('Choose Building', `
      <div class="build-options">
        ${available.map(b => {
          const unitDef = b.unit_id ? getUnitByUnitId(b.unit_id) : null;
          return `
            <div class="build-option">
              <div class="build-option-name">${b.label}</div>
              ${unitDef ? `<div class="build-option-unit">Trains · ${unitDef.name}</div>` : ''}
              <button class="build-option-btn" data-building-id="${b.id}" data-slot="${slot}">Build</button>
            </div>`;
        }).join('')}
      </div>`);

    // Attach after innerHTML is set
    modalBody.querySelectorAll('.build-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        performBuildingUpgrade(btn.dataset.slot, btn.dataset.buildingId);
      });
    });
  }

  async function handleThroneClick() {
    const throneState = structuresRecord.buildings_data['slot_0'];
    const throneLevel = throneState?.level || 1;
    const nextLevel   = throneLevel + 1;
    const cost        = throneUpgradeCosts[nextLevel];
    const isMaxed     = throneLevel >= heroMaxLevel;
    const label       = player.faction === 'dungeon' ? 'Dark Throne' : 'Throne';

    if (isMaxed) {
      openModal(label, `
        <div class="throne-modal">
          <div class="throne-level-display">Level <span class="throne-level-num">${throneLevel}</span></div>
          <p class="throne-maxed">The Throne is fully upgraded. Your hero may reach their full potential.</p>
        </div>`);
      return;
    }

    openModal(label, `
      <div class="throne-modal">
        <div class="throne-level-display">
          Level <span class="throne-level-num">${throneLevel}</span>
          → <span class="throne-level-num throne-level-next">${nextLevel}</span>
        </div>
        <p class="throne-desc">Upgrading the Throne allows your hero to reach level ${nextLevel}.</p>
        <div class="throne-cost">
          ${cost?.gold > 0 ? `<span class="throne-cost-item">🪙 ${cost.gold} Gold</span>` : ''}
          ${cost?.mana  > 0 ? `<span class="throne-cost-item">🔮 ${cost.mana} Mana</span>`  : ''}
        </div>
        <button class="upgrade-confirm-btn" id="confirm-throne-btn">Upgrade Throne</button>
      </div>`);

    modalBody.querySelector('#confirm-throne-btn')?.addEventListener('click', async () => {
      closeModal();
      try {
        const updated = await api('/structures/throne/upgrade', { chat_id: player.chat_id });
        structuresRecord = updated;
        renderBuildings();
      } catch (err) {
        alert(err.message || 'Throne upgrade failed');
      }
    });
  }

  function openUpgradeModal(slot, def, paths) {
    let selectedPathIndex = 0;

    function buildBody(selIdx) {
      const tabsHtml = paths.length > 1 ? `
        <div class="upgrade-tabs">
          ${paths.map((p, i) => {
            const u = getUnitByUnitId(p.unit_id);
            return `<button class="upgrade-tab ${i === selIdx ? 'upgrade-tab--active' : ''}" data-path-index="${i}">${u ? u.name : p.label}</button>`;
          }).join('')}
        </div>` : '';

      const path        = paths[selIdx];
      const currentUnit = getUnitByUnitId(def.unit_id);
      const nextUnit    = getUnitByUnitId(path.unit_id);

      return `
        ${tabsHtml}
        <div class="upgrade-body">
          ${renderUnitComparison(currentUnit, nextUnit)}
        </div>
        <button class="upgrade-confirm-btn" id="confirm-upgrade-btn">Upgrade Building</button>`;
    }

    openModal(def.label, buildBody(selectedPathIndex));

    function attachListeners() {
      modalBody.querySelectorAll('.upgrade-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedPathIndex = parseInt(btn.dataset.pathIndex, 10);
          modalBody.innerHTML = buildBody(selectedPathIndex);
          attachListeners();
        });
      });

      modalBody.querySelector('#confirm-upgrade-btn')?.addEventListener('click', () => {
        const path = paths[selectedPathIndex];
        performBuildingUpgrade(slot, path.building_id);
      });
    }

    attachListeners();
  }

  async function performBuildingUpgrade(slot, building_id) {
    closeModal();
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
      console.error(err);
      alert(err.message || 'Upgrade failed');
    }
  }

  /* ── Boot ── */

  load();

  root.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      const screen = btn.dataset.screen;
      if (screen === 'spells') {
        renderSpellTome(root, { player });
      } else if (screen === 'castle') {
        renderBuildings();
      } else {
        navigate(screen, { player });
      }
    });
  });
}