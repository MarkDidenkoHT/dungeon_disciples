import { api }              from '../api.js';
import { navigate }          from '../api.js';
import { refreshResourceBar } from '../api.js';
import { UNIT_ABILITIES }    from '../../data/unit_abilities.js';
import { UNITS }             from '../../data/units.js';
import { renderSpellTome }   from './spell_tome.js';
import {
  RESIST_ICONS, RESIST_ORDER,
  resolveAbility, renderModalContent, openSheet, closeSheet, getSheetBody, GOLD_ICON,
  openSubSheet, closeSubSheet, getSubSheetBody, cap,
} from '../utils.js';

const CASTLE_BACKGROUNDS = {
  empire:              '/assets/screens/empire.jpg',
  choir_of_the_cursed: '/assets/screens/choir.jpg',
  grail_of_sorrow:     '/assets/screens/grail.jpg',
};

export function renderCastle(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-castle">
      <main class="castle-main">
        <div class="castle-grounds">
          <div class="castle-grid-wrap">
            <div class="outer-ring" id="outer-ring"></div>
            <div class="center-slot" id="center-slot"></div>
          </div>
        </div>
      </main>
    </div>
  `;

  let structuresRecord   = null;
  let buildingPools      = null;
  let upgradePaths       = null;
  let throneUpgradeCosts = {};
  let heroMaxLevel       = 4;
  let mercenaryBuildings = {};
  let trophyInventory    = [];

  function openModal(title, bodyHtml) { openSheet(title, bodyHtml); }
  function closeModal() { closeSheet(); closeSubSheet(); }

  function openAbilityModal(title, bodyHtml) {
    openSubSheet(title, bodyHtml);
  }

  function closeAbilityModal() { closeSubSheet(); }

  const backgroundUrl = CASTLE_BACKGROUNDS[player.faction];
  if (backgroundUrl) {
    root.style.backgroundImage = `url('${backgroundUrl}')`;
    root.style.backgroundSize = 'cover';
    root.style.backgroundPosition = 'center';
    root.style.backgroundRepeat = 'no-repeat';
    root.style.backgroundColor = 'rgba(17, 19, 24, 0.75)';
  }

  async function load() {
    const [inventory, trophies, structures, buildingsResp] = await Promise.all([
      api(`/inventory?chat_id=${player.chat_id}&type=resource`),
      api(`/inventory?chat_id=${player.chat_id}&type=trophy`),
      api(`/structures?chat_id=${player.chat_id}`),
      api('/buildings'),
    ]);

    buildingPools      = buildingsResp.pools;
    upgradePaths       = buildingsResp.upgrade_paths || {};
    throneUpgradeCosts = buildingsResp.throne_upgrade_costs || {};
    heroMaxLevel       = buildingsResp.hero_max_level || 4;
    mercenaryBuildings  = buildingsResp.mercenary_buildings || {};
    trophyInventory     = trophies || [];
    structuresRecord   = structures;

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
    const factions = ['empire', 'choir_of_the_cursed', 'grail_of_sorrow'];
    for (const f of factions) {
      if (!UNITS[f]) continue;
      const found = Object.values(UNITS[f]).find(u => u?.id === unitId);
      if (found) return found;
    }
    if (UNITS.enemies) {
      for (const region of Object.values(UNITS.enemies)) {
        if (!region || typeof region !== 'object') continue;
        const found = Object.values(region).find(u => u?.id === unitId);
        if (found) return found;
      }
    }
    return null;
  }

  function getUpgradePathsForBuilding(faction, def) {
    if (!def || !def.upgrades || def.upgrades.length === 0) return [];
    const factionPaths = upgradePaths[faction] || {};
    const paths = factionPaths[def.unit_id];
    if (paths && paths.length > 0) return paths;
    return def.upgrades.map(uid => ({ unit_id: uid, building_id: uid, label: uid }));
  }

  function getActionLabel(actionKey) {
    if (!actionKey) return '—';
    const k = typeof actionKey === 'string' ? actionKey : (actionKey.id || '');
    const map = {
      attack:       'Attack',
      heal:         'Heal',
      repair:       'Repair',
      'mend flesh': 'Mend Flesh',
      sacrifice:    'Sacrifice',
    };
    return map[k.toLowerCase()] || cap(k);
  }

  function buildUnitCard(unit, opts = {}) {
    if (!unit) return `<div class="unit-card"><p class="placeholder">Unknown unit</p></div>`;

    const { buildingLabel = '', compareUnit = null } = opts;
    const tags     = (unit.tags || []).filter(Boolean);
    const tagLeft  = tags[0] || '';
    const tagRight = tags[1] || '';
    const portraitId = unit.id.match(/^(h_[a-z]_\d)/)?.[1] ?? unit.id;
    const portrait = `/assets/character_art/${portraitId}.png`;
    const res      = unit.resistances || {};

    const portraitHtml = `
      <div class="unit-portrait">
        <img
          src="${portrait}"
          alt="${unit.name}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
        >
        <div class="unit-portrait-fallback" style="display:none;">
          <span>${unit.id}</span>
        </div>
        <div class="unit-identity-bar">
          <div class="unit-identity-main">
            <span class="unit-name">${unit.name}</span>
            <span class="unit-level-text">${buildingLabel || unit.type || ''}</span>
          </div>
          <div class="unit-identity-tags">
            ${tagLeft  ? `<span class="unit-tag">${tagLeft}</span>`  : ''}
            ${tagRight ? `<span class="unit-tag">${tagRight}</span>` : ''}
          </div>
        </div>
      </div>`;

    const actionLabel = getActionLabel(unit.action);
    const power       = unit.action_power ?? unit.action?.value ?? '—';

    const coreHtml = `
      <div class="unit-core-stats">
        <div class="core-stat"><span class="core-stat-label">HP</span><span class="core-stat-val">${unit.hp ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">Init</span><span class="core-stat-val">${unit.initiative ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">Power</span><span class="core-stat-val">${power}</span></div>
        <div class="core-stat"><span class="core-stat-label">Action</span><span class="core-stat-val core-stat-val--action">${actionLabel}</span></div>
        <div class="core-stat"><span class="core-stat-label">XP</span><span class="core-stat-val">${unit.xp ?? '—'}</span></div>
      </div>`;

    const STAT_MAP = [
      { label: 'HP',      key: 'hp'           },
      { label: 'Armor',   key: 'armor'        },
      { label: 'Init',    key: 'initiative'   },
      { label: 'Power',   key: 'action_power' },
      { label: 'Targets', key: 'targets'      },
      { label: 'Range',   key: 'range'        },
    ];

    let diffHtml = '';
    if (compareUnit) {
      const chips = STAT_MAP
        .map(s => ({ label: s.label, diff: (unit[s.key] ?? 0) - (compareUnit[s.key] ?? 0) }))
        .filter(d => d.diff !== 0)
        .map(d => {
          const cls = d.diff > 0 ? 'stat-diff--up' : 'stat-diff--down';
          return `<span class="stat-diff-chip ${cls}">${d.label} ${d.diff > 0 ? '+' : ''}${d.diff}</span>`;
        });
      if (chips.length) diffHtml = `<div class="unit-stat-diffs">${chips.join('')}</div>`;
    }

    const armorVal = unit.armor ?? 0;
    const armorCls = armorVal > 0 ? 'resist-val--pos' : '';
    const armorCell = `
      <div class="resist-cell" title="Armor" data-armor="${armorVal}">
        <span class="resist-icon">🛡</span>
        <span class="resist-val ${armorCls}">${armorVal}</span>
      </div>`;

    const resistCells = RESIST_ORDER.map(r => {
      const info = RESIST_ICONS[r];
      const val  = res[r] ?? 0;
      const cls  = val > 0 ? 'resist-val--pos' : val < 0 ? 'resist-val--neg' : '';
      return `<div class="resist-cell" title="${info.label}">
        <span class="resist-icon">${info.icon}</span>
        <span class="resist-val ${cls}">${val}</span>
      </div>`;
    }).join('');

    const resistHtml = `<div class="unit-resists-grid">${armorCell}${resistCells}</div>`;

    const descHtml = unit.description
      ? `<p class="unit-slide-desc">${unit.description}</p>`
      : '';

    function abilityIconHtml(key, type) {
      const def     = resolveAbility(key);
      const isEmpty = !def;
      const fileKey = key ? key.replace(/\s+/g, '_').replace(/_\d+$/, '') : null;
      const imgSrc  = def ? `/assets/icons/abilities/${fileKey}.jpg` : null;
      return `
        <button
          class="ability-icon ability-icon--${type}${isEmpty ? ' ability-icon--empty' : ''}"
          data-ability-key="${key || ''}"
          data-ability-type="${type}"
          ${isEmpty ? 'disabled' : ''}
        >
          ${imgSrc ? `<img class="ability-icon-img" src="${imgSrc}" alt="${def.name}" onerror="this.style.visibility='hidden'">` : ''}
        </button>`;
    }

    const passiveKeys = Array.isArray(unit.passive)
      ? unit.passive.filter(Boolean)
      : (unit.passive ? [unit.passive] : []);

    const iconsHtml = [
      unit.ability   ? abilityIconHtml(unit.ability,   'active')  : abilityIconHtml('', 'empty'),
      passiveKeys[0] ? abilityIconHtml(passiveKeys[0], 'passive') : abilityIconHtml('', 'empty'),
      passiveKeys[1] ? abilityIconHtml(passiveKeys[1], 'passive') : abilityIconHtml('', 'empty'),
      passiveKeys[2] ? abilityIconHtml(passiveKeys[2], 'passive') : abilityIconHtml('', 'empty'),
    ].join('');

    const abilitiesHtml = `
      <div class="unit-abilities-row">
        <div class="unit-abilities-icons">
          ${iconsHtml}
        </div>
      </div>`;

    return `
      <div class="unit-card">
        ${portraitHtml}
        <div class="unit-info">
          ${coreHtml}
          ${diffHtml}
          ${resistHtml}
          ${descHtml}
          ${abilitiesHtml}
        </div>
      </div>`;
  }

  function openSliderModal(title, slides, onConfirm) {
    let current = 0;

    function renderSliderHtml(idx) {
      const s = slides[idx];
      const dots = slides.length > 1
        ? `<div class="slider-dots">${slides.map((_, i) =>
            `<span class="slider-dot${i === idx ? ' slider-dot--active' : ''}"></span>`
          ).join('')}</div>`
        : '';
      const arrows = slides.length > 1
        ? `<button class="slider-arrow slider-arrow--prev" id="slider-prev"${idx === 0 ? ' disabled' : ''}>&#x2039;</button>
           <button class="slider-arrow slider-arrow--next" id="slider-next"${idx === slides.length - 1 ? ' disabled' : ''}>&#x203A;</button>`
        : '';
      return `
        <div class="castle-unit-slider">
          <div class="castle-slider-track" id="slider-track">
            ${buildUnitCard(s.unit, { buildingLabel: s.buildingLabel, compareUnit: s.compareUnit })}
          </div>
          ${arrows}
          ${dots}
        </div>
        <button class="upgrade-confirm-btn" id="slider-confirm">${s.confirmLabel || 'Confirm'}</button>`;
    }

    openModal(title, renderSliderHtml(current));

    function attachAbilityListeners() {
      getSheetBody().querySelectorAll('.ability-icon:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
          const key  = btn.dataset.abilityKey;
          const type = btn.dataset.abilityType;
          const def  = resolveAbility(key);
          if (!def) return;

          const typeLabel = type === 'passive' ? 'Passive' : 'Active';
          const fileKey   = key.replace(/\s+/g, '_').replace(/_\d+$/, '');
          const imgSrc    = `/assets/icons/abilities/${fileKey}.jpg`;

          const bodyHtml = `
            <div class="ability-modal-content">
              <div class="ability-modal-header">
                <div class="ability-modal-icon">
                  <img src="${imgSrc}" alt="${def.name}" onerror="this.style.visibility='hidden'">
                </div>
                <div class="ability-modal-titles">
                  <div class="ability-modal-name">${def.name}${def.rank ? ` <span class="ability-modal-rank">Rank ${def.rank}</span>` : ''}</div>
                  <div class="ability-modal-type ability-modal-type--${type}">${typeLabel}</div>
                </div>
              </div>
              <p class="ability-modal-desc">${def.description || ''}</p>
            </div>`;

          openAbilityModal(`${typeLabel} Ability`, bodyHtml);
        });
      });
    }

    function attach() {
      const sheetBody = getSheetBody();
      const track = sheetBody.querySelector('#slider-track');
      let touchStartX = null;
      let touchStartY = null;

      track?.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      track?.addEventListener('touchend', e => {
        if (touchStartX === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        touchStartX = null;
        if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 40) return;
        if (dx < 0 && current < slides.length - 1) { current++; sheetBody.innerHTML = renderSliderHtml(current); attach(); }
        if (dx > 0 && current > 0)                  { current--; sheetBody.innerHTML = renderSliderHtml(current); attach(); }
      });

      sheetBody.querySelector('#slider-prev')?.addEventListener('click', () => {
        if (current > 0) { current--; sheetBody.innerHTML = renderSliderHtml(current); attach(); }
      });
      sheetBody.querySelector('#slider-next')?.addEventListener('click', () => {
        if (current < slides.length - 1) { current++; sheetBody.innerHTML = renderSliderHtml(current); attach(); }
      });
      sheetBody.querySelector('#slider-confirm')?.addEventListener('click', () => onConfirm(slides[current]));

      attachAbilityListeners();
    }

    attach();
  }

  function renderBuildings() {
    const data        = structuresRecord.buildings_data;
    const throneState = data['slot_0'];
    const throneLevel = throneState?.level || 1;
    const throneMaxed = throneLevel >= heroMaxLevel;

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
        const hasUpgrade = def && getUpgradePathsForBuilding(player.faction, def).length > 0;
        const classes    = ['castle-node', isEmpty ? 'castle-node--empty' : ''].filter(Boolean).join(' ');

        return `
          <div class="${classes}" data-slot="${slot}">
            <div class="castle-node-icon">${isEmpty ? '＋' : '⚔'}</div>
            <div class="castle-node-label">${def ? def.label : (isEmpty ? 'Build' : 'Empty')}</div>
            ${state.level > 0 ? `<div class="castle-node-level">Lv ${state.level}</div>` : ''}
            ${!isEmpty && hasUpgrade ? `<div class="castle-node-hint">Upgrade</div>` : ''}
          </div>`;
      }).join('');

    root.querySelectorAll('.castle-node').forEach(node => {
      node.addEventListener('click', () => handleSlotClick(node.dataset.slot));
    });
  }

  function getMercBuildingDef(buildingId) {
    for (const pool of Object.values(mercenaryBuildings)) {
      const found = pool.find(b => b.id === buildingId);
      if (found) return found;
    }
    return null;
  }

  function getMercUpgradePaths(def) {
    if (!def || !def.upgrades || !def.upgrades.length) return [];
    const pool = mercenaryBuildings[def.region] || [];
    return def.upgrades.map(uid => pool.find(b => b.id === uid)).filter(Boolean);
  }

  async function handleSlotClick(slot) {
    const state = structuresRecord.buildings_data[slot];
    if (slot === 'slot_0') { handleThroneClick(); return; }
    if (!state || !state.building_id) { openBuildModal(slot); return; }

    const mercDef = getMercBuildingDef(state.building_id);
    if (mercDef) {
      const paths = getMercUpgradePaths(mercDef);
      if (!paths.length) {
        openSliderModal(mercDef.label,
          [{ unit: getUnitByUnitId(mercDef.unit_id), buildingLabel: mercDef.label, confirmLabel: 'Maxed — No Upgrades' }],
          () => closeModal()
        );
        return;
      }
      openMercUpgradeModal(slot, mercDef, paths);
      return;
    }

    const def = getBuildingDef(player.faction, state.building_id);
    if (!def) { openModal('Error', '<p class="modal-empty">Building definition not found.</p>'); return; }

    const paths = getUpgradePathsForBuilding(player.faction, def);

    if (!paths || paths.length === 0) {
      openSliderModal(def.label,
        [{ unit: getUnitByUnitId(def.unit_id), buildingLabel: def.label, confirmLabel: 'Maxed — No Upgrades' }],
        () => closeModal()
      );
      return;
    }

    openUpgradeModal(slot, def, paths);
  }

  function openBuildModal(slot) {
    const SLOT_CATEGORIES = {
      slot_0: 'throne', slot_1: 'barracks', slot_2: 'barracks',
      slot_3: 'barracks', slot_4: 'barracks', slot_5: 'barracks',
      slot_6: 'special', slot_7: 'special', slot_8: 'special',
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

    openSliderModal('Choose Building',
      available.map(b => ({
        unit:          getUnitByUnitId(b.unit_id),
        buildingLabel: b.label,
        confirmLabel:  `Build · ${b.label}`,
        buildingId:    b.id,
        slot,
      })),
      s => {
        if (s.buildingId === 'mercenary_hall') { openMercenaryModal(slot); return; }
        performBuildingUpgrade(s.slot, s.buildingId);
      }
    );
  }

  async function handleThroneClick() {
    const throneState = structuresRecord.buildings_data['slot_0'];
    const throneLevel = throneState?.level || 1;
    const nextLevel   = throneLevel + 1;
    const cost        = throneUpgradeCosts[nextLevel];
    const isMaxed     = throneLevel >= heroMaxLevel;
    const label       = player.faction === 'choir_of_the_cursed' ? 'Dark Throne' : 'Throne';

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
          ${cost?.gold > 0 ? `<span class="throne-cost-item">${GOLD_ICON} ${cost.gold} Gold</span>` : ''}
        </div>
        <button class="upgrade-confirm-btn" id="confirm-throne-btn">Upgrade Throne</button>
      </div>`);

    getSheetBody().querySelector('#confirm-throne-btn')?.addEventListener('click', async () => {
      closeModal();
      try {
        const updated = await api('/structures/throne/upgrade', { chat_id: player.chat_id });
        structuresRecord = updated;
        renderBuildings();
        refreshResourceBar(player).catch(() => {});
      } catch (err) {
        alert(err.message || 'Throne upgrade failed');
      }
    });
  }

  async function openMercUpgradeModal(slot, def, paths) {
    const currentUnit = getUnitByUnitId(def.unit_id);

    function trophyAmount(item) {
      const row = trophyInventory.find(r => r.item === item);
      return row ? Number(row.amount) : 0;
    }

    function costLabel(cost) {
      return Object.entries(cost || {})
        .map(([item, amt]) => `${amt} ${item.replace(/_/g, ' ')}`)
        .join(' + ');
    }

    const roster = await api(`/roster?chat_id=${player.chat_id}`).catch(() => []);
    const rosterEntry = roster.find(r => r.unit_data?.mercenary && r.unit_data?.mercenary_region === def.region && r.unit_data?.id === currentUnit?.id);

    openSliderModal(def.label,
      paths.map(path => {
        const nextUnit = getUnitByUnitId(path.unit_id);
        return {
          unit:           nextUnit,
          buildingLabel:  nextUnit?.name || path.label,
          confirmLabel:   `Upgrade → ${nextUnit?.name || path.label} (${costLabel(path.cost)})`,
          compareUnit:    currentUnit,
          mercBuildingId: path.id,
          mercCost:       path.cost,
          rosterId:       rosterEntry?.id,
          slot,
        };
      }),
      s => {
        const cost  = s.mercCost || {};
        const short = Object.entries(cost).some(([item, amt]) => trophyAmount(item) < amt);
        if (short) { alert('Not enough trophies for this upgrade.'); return; }
        performMercenaryUpgrade(s.mercBuildingId, slot, s.rosterId);
      }
    );
  }

  function openUpgradeModal(slot, def, paths) {
    const currentUnit = getUnitByUnitId(def.unit_id);

    openSliderModal(def.label,
      paths.map(path => {
        const nextUnit = getUnitByUnitId(path.unit_id);
        return {
          unit:          nextUnit,
          buildingLabel: nextUnit?.name || path.label,
          confirmLabel:  `Upgrade → ${nextUnit?.name || path.label}`,
          compareUnit:   currentUnit,
          buildingId:    path.building_id,
          slot,
        };
      }),
      s => performBuildingUpgrade(s.slot, s.buildingId)
    );
  }

  async function performBuildingUpgrade(slot, building_id) {
    closeModal();
    try {
      const updated = await api('/structures/build', {
        chat_id: player.chat_id,
        slot,
        building_id,
      });
      structuresRecord = updated;
      renderBuildings();
      refreshResourceBar(player).catch(() => {});
    } catch (err) {
      console.error(err);
      alert(err.message || 'Upgrade failed');
    }
  }

  function openMercenaryModal(slot) {
    const region = 'crimson_basilica';
    const allMercDefs = mercenaryBuildings[region] || [];
    const tier1Defs    = allMercDefs.filter(b => b.tier === 1);

    if (!tier1Defs.length) {
      openModal('Mercenary Hall', '<p class="modal-empty">No mercenaries available yet.</p>');
      return;
    }

    function trophyAmount(item) {
      const row = trophyInventory.find(r => r.item === item);
      return row ? Number(row.amount) : 0;
    }

    function costLabel(cost) {
      return Object.entries(cost || {})
        .map(([item, amt]) => `${amt} ${item.replace(/_/g, ' ')}`)
        .join(' + ');
    }

    openSliderModal('Mercenary Hall',
      tier1Defs.map(b => ({
        unit:          getUnitByUnitId(b.unit_id),
        buildingLabel: b.label,
        confirmLabel:  `Recruit · ${b.label} (${costLabel(b.cost)})`,
        mercBuildingId: b.id,
        mercCost:       b.cost,
        slot,
      })),
      s => {
        const cost  = s.mercCost || {};
        const short = Object.entries(cost).some(([item, amt]) => trophyAmount(item) < amt);
        if (short) { alert('Not enough trophies for this mercenary.'); return; }
        performMercenaryRecruit(s.mercBuildingId, slot);
      }
    );
  }

  async function performMercenaryRecruit(mercenary_building_id, slot) {
    closeModal();
    try {
      const result = await api('/structures/mercenary/recruit', {
        chat_id: player.chat_id,
        mercenary_building_id,
        slot,
      });
      if (result.structures) structuresRecord = result.structures;
      const trophies = await api(`/inventory?chat_id=${player.chat_id}&type=trophy`);
      trophyInventory = trophies || [];
      renderBuildings();
      refreshResourceBar(player).catch(() => {});
    } catch (err) {
      console.error(err);
      alert(err.message || 'Recruit failed');
    }
  }

  async function performMercenaryUpgrade(mercenary_building_id, slot, roster_id) {
    closeModal();
    try {
      const result = await api('/structures/mercenary/upgrade', {
        chat_id: player.chat_id,
        mercenary_building_id,
        slot,
        roster_id,
      });
      if (result.structures) structuresRecord = result.structures;
      const trophies = await api(`/inventory?chat_id=${player.chat_id}&type=trophy`);
      trophyInventory = trophies || [];
      renderBuildings();
      refreshResourceBar(player).catch(() => {});
    } catch (err) {
      console.error(err);
      alert(err.message || 'Upgrade failed');
    }
  }

  load();
}