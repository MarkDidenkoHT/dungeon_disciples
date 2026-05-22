import { api }              from '../main.js';
import { navigate }          from '../main.js';
import { refreshResourceBar } from '../main.js';

import { UNIT_ABILITIES } from '../../data/unit_abilities.js';
import { renderSpellTome }   from './spell_tome.js';

let UNITS = null;

async function loadUnits() {
  try {
    const mod = await import('../../data/units.js');
    UNITS = mod.UNITS || mod.default?.UNITS || mod;
  } catch (err) {
    console.error('[Castle] failed to load units.js:', err);
  }
}

const RESIST_ICONS = {
  air:    { icon: '🌬️', label: 'Air'    },
  fire:   { icon: '🔥', label: 'Fire'   },
  nature: { icon: '🌿', label: 'Nature' },
  cold:   { icon: '❄️', label: 'Cold'   },
  life:   { icon: '✨', label: 'Life'   },
  death:  { icon: '🌑', label: 'Death'  },
};
const RESIST_ORDER = ['air', 'fire', 'nature', 'cold', 'life', 'death'];

function resolveAbility(key, type) {
  if (!key || key === 'None') return null;
  const k = key.replace(/\s+/g, '_');
  return UNIT_ABILITIES[k] || UNIT_ABILITIES[key] || null;
}

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
    <div id="modal-overlay" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header">
          <span id="modal-title"></span>
          <button id="modal-close" aria-label="Close">&#x2715;</button>
        </div>
        <div id="modal-body" class="modal-body"></div>
      </div>
    </div>
  `;

  let structuresRecord   = null;
  let buildingPools      = null;
  let upgradePaths       = null;
  let throneUpgradeCosts = {};
  let heroMaxLevel       = 4;

  const overlay    = root.querySelector('#modal-overlay');
  const modalBody  = root.querySelector('#modal-body');
  const modalTitle = root.querySelector('#modal-title');

  function openModal(title, bodyHtml) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  root.querySelector('#modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  async function load() {
    const [inventory, structures, buildingsResp] = await Promise.all([
      api(`/inventory?chat_id=${player.chat_id}&type=resource`),
      api(`/structures?chat_id=${player.chat_id}`),
      api('/buildings'),
    ]);

    buildingPools      = buildingsResp.pools;
    upgradePaths       = buildingsResp.upgrade_paths || {};
    throneUpgradeCosts = buildingsResp.throne_upgrade_costs || {};
    heroMaxLevel       = buildingsResp.hero_max_level || 4;
    structuresRecord   = structures;

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
    const all = { ...UNITS.empire, ...UNITS.choir_of_the_cursed, ...UNITS.grail_of_sorrow, ...UNITS.enemies };
    return Object.values(all).find(u => u.id === unitId) || null;
  }

  function getUpgradePathsForBuilding(faction, def) {
    if (!def || !def.upgrades || def.upgrades.length === 0) return [];
    const factionPaths = upgradePaths[faction] || {};
    const paths = factionPaths[def.unit_id];
    if (paths && paths.length > 0) return paths;
    return def.upgrades.map(uid => ({ unit_id: uid, building_id: uid, label: uid }));
  }

  function buildUnitCard(unit, opts = {}) {
    if (!unit) return `<div class="unit-card"><p class="placeholder">Unknown unit</p></div>`;

    const { buildingLabel = '', compareUnit = null } = opts;
    const tags     = (unit.tags || []).filter(Boolean);
    const tagLeft  = tags[0] || '';
    const tagRight = tags[1] || '';
    const portrait = `/assets/character_art/${unit.id}.png`;
    const res      = unit.resistances || {};

    const portraitHtml = `
      <div class="unit-portrait">
        <img src="${portrait}" alt="${unit.name}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
        <div class="unit-portrait-fallback" style="display:none;"><span>${unit.id}</span></div>
        <div class="unit-portrait-overlay">
          <span class="unit-name">${unit.name}</span>
          <span class="unit-level-text">${buildingLabel || unit.type || ''}</span>
        </div>
        ${tagLeft  ? `<div class="unit-tag-left">${tagLeft}</div>`   : ''}
        ${tagRight ? `<div class="unit-tag-right">${tagRight}</div>` : ''}
      </div>`;

    const STAT_MAP = [
      { label: 'HP',      key: 'hp'           },
      { label: 'Armor',   key: 'armor'        },
      { label: 'Init',    key: 'initiative'   },
      { label: 'Power',   key: 'action_power' },
      { label: 'Targets', key: 'targets'      },
      { label: 'Range',   key: 'range'        },
    ];

    const coreHtml = `
      <div class="unit-core-stats unit-core-stats--6">
        ${STAT_MAP.map(s => `
          <div class="core-stat">
            <span class="core-stat-label">${s.label}</span>
            <span class="core-stat-val">${unit[s.key] ?? '—'}</span>
          </div>`).join('')}
      </div>`;

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

    const resistHtml = `
      <div class="unit-resists-grid">
        ${RESIST_ORDER.map(r => {
          const info = RESIST_ICONS[r];
          const val  = res[r] ?? 0;
          const cls  = val > 0 ? 'resist-val--pos' : val < 0 ? 'resist-val--neg' : '';
          return `<div class="resist-cell" title="${info.label}">
            <span class="resist-icon">${info.icon}</span>
            <span class="resist-val ${cls}">${val}</span>
          </div>`;
        }).join('')}
      </div>`;

    const descHtml = unit.description
      ? `<p class="unit-slide-desc">${unit.description}</p>`
      : '';

    function abilityIconHtml(key, type) {
      const def     = resolveAbility(key, type);
      const isEmpty = !def;
      const fileKey = key ? key.replace(/\s+/g, '_') : null;
      const imgSrc  = def ? `/assets/icons/abilities/${fileKey}.png` : null;
      return `<button
        class="ability-icon ability-icon--${type}${isEmpty ? ' ability-icon--empty' : ''}"
        data-ability-key="${key || ''}"
        data-ability-type="${type}"
        ${isEmpty ? 'disabled' : ''}
      >${imgSrc ? `<img class="ability-icon-img" src="${imgSrc}" alt="${def.name}" onerror="this.style.visibility='hidden'">` : ''}</button>`;
    }

    const slots = [];
    if (unit.passive) {
      if (Array.isArray(unit.passive)) {
        slots.push(...unit.passive);
      } else {
        slots.push(unit.passive);
      }
    }
    if (unit.ability) {
      slots.push(unit.ability);
    }

    const visible = slots.filter(Boolean).slice(0, 4);
    while (visible.length < 4) visible.push(null);

    const iconsHtml = visible.map(k => {
      if (!k) return abilityIconHtml('', 'empty');
      const t = (unit.ability && unit.ability === k) ? 'active' : 'passive';
      return abilityIconHtml(k, t);
    }).join('');

    const abilitiesHtml = `
      <div class="unit-abilities-row">
        <div class="unit-abilities-icons">
          ${iconsHtml}
        </div>
        <div class="ability-detail-panel">
          <div class="ability-detail-desc"></div>
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
      modalBody.querySelectorAll('.ability-icon:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
          const key  = btn.dataset.abilityKey;
          const type = btn.dataset.abilityType;
          const def  = resolveAbility(key, type);
          if (!def) return;
          const panel = modalBody.querySelector('.ability-detail-panel');
          const desc  = modalBody.querySelector('.ability-detail-desc');
          if (!panel || !desc) return;
          const isOpen = panel.dataset.activeKey === key;
          panel.dataset.activeKey = isOpen ? '' : key;
          desc.textContent = isOpen ? '' : `[${type === 'passive' ? 'Passive' : 'Active'}] ${def.name}${def.rank ? ` Rank ${def.rank}` : ''}\n${def.description || ''}`;
          modalBody.querySelectorAll('.ability-icon').forEach(b => b.classList.remove('ability-icon--selected'));
          if (!isOpen) btn.classList.add('ability-icon--selected');
        });
      });
    }

    function attach() {
      const track = modalBody.querySelector('#slider-track');
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
        if (dx < 0 && current < slides.length - 1) { current++; modalBody.innerHTML = renderSliderHtml(current); attach(); }
        if (dx > 0 && current > 0)                  { current--; modalBody.innerHTML = renderSliderHtml(current); attach(); }
      });

      modalBody.querySelector('#slider-prev')?.addEventListener('click', () => {
        if (current > 0) { current--; modalBody.innerHTML = renderSliderHtml(current); attach(); }
      });
      modalBody.querySelector('#slider-next')?.addEventListener('click', () => {
        if (current < slides.length - 1) { current++; modalBody.innerHTML = renderSliderHtml(current); attach(); }
      });
      modalBody.querySelector('#slider-confirm')?.addEventListener('click', () => onConfirm(slides[current]));

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

  async function handleSlotClick(slot) {
    const state = structuresRecord.buildings_data[slot];
    if (slot === 'slot_0') { handleThroneClick(); return; }
    if (!state || !state.building_id) { openBuildModal(slot); return; }

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

    openSliderModal('Choose Building',
      available.map(b => ({
        unit:          getUnitByUnitId(b.unit_id),
        buildingLabel: b.label,
        confirmLabel:  `Build · ${b.label}`,
        buildingId:    b.id,
        slot,
      })),
      s => performBuildingUpgrade(s.slot, s.buildingId)
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
          ${cost?.gold > 0 ? `<span class="throne-cost-item">🪙 ${cost.gold} Gold</span>` : ''}
        </div>
        <button class="upgrade-confirm-btn" id="confirm-throne-btn">Upgrade Throne</button>
      </div>`);

    modalBody.querySelector('#confirm-throne-btn')?.addEventListener('click', async () => {
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
        faction: player.faction,
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

  load();
}