import { api }              from '../api.js';
import { navigate }          from '../api.js';
import { refreshResourceBar } from '../api.js';
import { refreshNavLock }    from '../api.js';
import { resourceCache, structuresCache } from '../api.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';
import { UNIT_ABILITIES }    from '../../data/unit_abilities.js';
import { UNITS }             from '../../data/units.js';
import { renderSpellTome }   from './spell_tome.js';
import {
  RESIST_ICONS, RESIST_ORDER,
  resolveAbility, renderModalContent, openSheet, closeSheet, getSheetBody, GOLD_ICON,
  openSubSheet, closeSubSheet, getSubSheetBody, cap,
  buildUnitCard, getActionLabel,
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

  let rosterCount = 0;

  async function load() {
    const [inventory, trophies, structures, buildingsResp, roster] = await Promise.all([
      resourceCache.get(player.chat_id),
      api(`/inventory?chat_id=${player.chat_id}&type=trophy`),
      structuresCache.get(player.chat_id),
      api('/buildings'),
      api(`/roster?chat_id=${player.chat_id}`),
    ]);

    buildingPools      = buildingsResp.pools;
    upgradePaths       = buildingsResp.upgrade_paths || {};
    throneUpgradeCosts = buildingsResp.throne_upgrade_costs || {};
    heroMaxLevel       = buildingsResp.hero_max_level || 4;
    mercenaryBuildings  = buildingsResp.mercenary_buildings || {};
    trophyInventory     = trophies || [];
    structuresRecord   = structures;
    rosterCount        = Array.isArray(roster) ? roster.length : 0;

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
    const throneLevel = throneState?.level ?? 0;
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

    if (throneLevel < 1 && !isTutorialDone(player, 'throne_upgrade')) {
      const throneEl = root.querySelector('.castle-node[data-slot="slot_0"]');
      showTutorialSpotlight(player, 'throne_upgrade', throneEl);
    } else if (throneLevel >= 1 && rosterCount < 3 && !isTutorialDone(player, 'second_building')) {
      const emptySlot = Object.keys(data)
        .filter(s => s !== 'slot_0' && s !== 'slot_4' && !data[s]?.building_id)
        .sort()[0];
      const targetEl = emptySlot ? root.querySelector(`.castle-node[data-slot="${emptySlot}"]`) : null;
      if (targetEl) showTutorialSpotlight(player, 'second_building', targetEl);
      else hideTutorial();
    } else {
      hideTutorial();
    }
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
    const slotCategory = SLOT_CATEGORIES[slot];
    if (!slotCategory) return;

    const factionPools = buildingPools[player.faction] || {};
    const pool         = factionPools[slotCategory] || [];
    const available    = pool.filter(b => b.category !== 'throne' && (b.tier === 1 || b.tier === undefined));

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
        placeholder:   !!b.placeholder,
        slot,
      })),
      s => {
        if (s.buildingId === 'mercenary_hall') { openMercenaryModal(slot); return; }
        if (s.placeholder) { openPlaceholderModal(s.buildingId); return; }
        performBuildingUpgrade(s.slot, s.buildingId);
      }
    );
  }

  async function handleThroneClick() {
    const throneState = structuresRecord.buildings_data['slot_0'];
    const throneLevel = throneState?.level ?? 0;
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
        refreshNavLock(player).catch(() => {});
        if (nextLevel >= 1) markTutorialDone(player, 'throne_upgrade');
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
      if (!isTutorialDone(player, 'second_building')) {
        rosterCount += 1;
        markTutorialDone(player, 'second_building');
      }
      renderBuildings();
      refreshResourceBar(player).catch(() => {});
    } catch (err) {
      console.error(err);
      alert(err.message || 'Upgrade failed');
    }
  }

  function openPlaceholderModal(buildingId) {
    const def   = getBuildingDef(player.faction, buildingId);
    const label = def?.label || 'Building';
    openModal(label, `
      <div class="throne-modal">
        <div class="throne-level-display">${label}</div>
        <p class="throne-desc">This building is still under construction. Check back later!</p>
      </div>`);
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