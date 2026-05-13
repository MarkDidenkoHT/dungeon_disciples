import { api }      from '../main.js';
import { navigate } from '../main.js';
import { PASSIVES }  from '../../data/passives.js';
import { ABILITIES } from '../../data/abilities.js';

const RESIST_ICONS = {
  air:    { icon: '🌬️', label: 'Air'    },
  fire:   { icon: '🔥', label: 'Fire'   },
  nature: { icon: '🌿', label: 'Nature' },
  cold:   { icon: '❄️', label: 'Cold'   },
  life:   { icon: '✨', label: 'Life'   },
  death:  { icon: '🌑', label: 'Death'  },
};

const RESIST_ORDER = ['air', 'fire', 'nature', 'cold', 'life', 'death'];

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function resolveAbility(key, type) {
  if (!key || key === 'None') return null;
  if (type === 'passive') return PASSIVES[key]  || null;
  if (type === 'active')  return ABILITIES[key] || null;
  return null;
}

export function renderRoster(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-roster">
      <main class="roster-main">
        <div class="roster-slider-wrap">
          <div class="roster-track" id="roster-track"></div>
          <div class="roster-dots" id="roster-dots"></div>
        </div>
      </main>

      <div class="ability-tooltip" id="ability-tooltip" style="display:none;">
        <div class="ability-tooltip-inner">
          <button class="ability-tooltip-close" id="tooltip-close">✕</button>
          <div class="ability-tooltip-type" id="tooltip-type"></div>
          <div class="ability-tooltip-name" id="tooltip-name"></div>
          <div class="ability-tooltip-desc" id="tooltip-desc"></div>
        </div>
      </div>

      <nav class="bottom-nav">
        <button class="nav-btn" data-screen="castle">Castle</button>
        <button class="nav-btn active" data-screen="roster">Roster</button>
        <button class="nav-btn" data-screen="embark">Embark</button>
        <button class="nav-btn disabled" data-screen="pvp">PvP</button>
      </nav>
    </div>
  `;

  let current = 0;
  let units   = [];

  const track   = root.querySelector('#roster-track');
  const dots    = root.querySelector('#roster-dots');
  const tooltip = root.querySelector('#ability-tooltip');

  let buildingsData = {};
  let upgradePaths  = {};

  function showTooltip(abilityKey, abilityType) {
    const def = resolveAbility(abilityKey, abilityType);
    if (!def) return;
    root.querySelector('#tooltip-type').textContent = abilityType === 'passive' ? 'PASSIVE' : 'ACTIVE';
    root.querySelector('#tooltip-name').textContent = def.name + (def.rank ? ` — Rank ${def.rank}` : '');
    root.querySelector('#tooltip-desc').textContent = def.description || '';
    tooltip.style.display = 'flex';
  }

  root.querySelector('#tooltip-close').addEventListener('click', () => {
    tooltip.style.display = 'none';
  });
  tooltip.addEventListener('click', (e) => {
    if (e.target === tooltip) tooltip.style.display = 'none';
  });

  function buildCard(u) {
    const d      = u.unit_data || {};
    const gender = u.char_gender || 'f';
    const unitId = d.id || '';

    const portraitSrc = unitId ? `/assets/character_art/${unitId}.${gender}.png` : null;

    const passiveKey = d.passive || null;
    const activeKey  = d.ability  || null;
    const res        = d.resistances || {};

    const tier    = d.t ?? null;
    const isHero  = (tier == null);
    const tierLabel = isHero ? 'Hero' : `Level ${tier}`;

    const tags     = (d.tags || []).filter(Boolean);
    const unitType = cap(d.type || '');

    const xpRequired = d.xp ?? null;
    const currentXp  = u.experience ?? 0;
    const isMaxTier  = (tier >= 2);
    const hasPath    = !isHero && !isMaxTier && xpRequired !== null;

    let upgradeReady        = true;
    let upgradeBuildingHint = '';
    if (hasPath) {
      const faction = d.f === 'e' ? 'empire' : 'dungeon';
      const paths   = (upgradePaths[faction] || {})[unitId] || [];
      if (paths.length > 1) {
        const slot           = d.building_slot;
        const slotBuildingId = slot ? buildingsData[slot]?.building_id : null;
        const matched        = paths.find(p => p.building_id === slotBuildingId);
        upgradeReady         = !!matched;
        if (!upgradeReady) {
          const labels = paths.map(p => p.label).join(' or ');
          upgradeBuildingHint = `Requires: ${labels}`;
        }
      }
    }

    const canLevelUp = hasPath && currentXp >= xpRequired && upgradeReady;

    // Portrait — always shown, fallback to unit id text if image fails
    const portraitHtml = `
      <div class="unit-portrait">
        <img
          src="${portraitSrc || ''}"
          alt="${u.unit_name}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
        >
        <div class="unit-portrait-fallback" style="display:none;">
          <span>${unitId || u.unit_name}</span>
        </div>
      </div>`;

    // Header
    const headerHtml = `
      <div class="unit-header">
        <span class="unit-name">${u.unit_name}</span>
        <span class="unit-xp">XP ${currentXp}</span>
      </div>`;

    // Sub-header: type chip + level chip + tag chips
    const tagChips = tags.map(t => `<span class="unit-tag">${t}</span>`).join('');
    const subHtml = `
      <div class="unit-sub-header">
        ${unitType ? `<span class="unit-type-chip">${unitType}</span>` : ''}
        <span class="unit-level-chip">${tierLabel}</span>
        ${tagChips}
      </div>`;

    // Core stats
    const coreHtml = `
      <div class="unit-core-stats">
        <div class="core-stat"><span class="core-stat-label">HP</span><span class="core-stat-val">${d.hp ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">Armor</span><span class="core-stat-val">${d.armor ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">Init</span><span class="core-stat-val">${d.initiative ?? '—'}</span></div>
      </div>`;

    // Resistances: icon + value stacked per cell, all in one row
    const resistCells = RESIST_ORDER.map(r => {
      const info = RESIST_ICONS[r];
      return `<div class="resist-cell" title="${info.label}">
        <span class="resist-icon">${info.icon}</span>
        <span class="resist-val">${res[r] ?? 0}</span>
      </div>`;
    }).join('');

    const resistsHtml = `<div class="unit-resists-grid">${resistCells}</div>`;

    // Level-up row
    let levelUpHtml = '';
    if (hasPath) {
      const pct = Math.min(100, Math.floor((currentXp / xpRequired) * 100));
      levelUpHtml = `
        <div class="levelup-row">
          <div class="levelup-xp-bar">
            <div class="levelup-xp-fill" style="width: ${pct}%"></div>
          </div>
          <span class="levelup-xp-label">${currentXp} / ${xpRequired} XP</span>
          <button
            class="levelup-btn ${canLevelUp ? 'levelup-btn--ready' : 'levelup-btn--locked'}"
            data-roster-id="${u.id}"
            ${canLevelUp ? '' : 'disabled'}
          >Level Up</button>
        </div>
        ${upgradeBuildingHint ? `<div class="levelup-hint">${upgradeBuildingHint}</div>` : ''}
      `;
    }

    // Abilities: square icon buttons at the bottom
    function abilityIconHtml(key, type) {
      const def     = resolveAbility(key, type);
      const label   = def ? def.name : '—';
      const isEmpty = !def;
      const symbol  = type === 'passive' ? '◈' : '⚡';
      return `
        <button
          class="ability-icon ability-icon--${type} ${isEmpty ? 'ability-icon--empty' : ''}"
          data-ability-key="${key || ''}"
          data-ability-type="${type}"
          ${isEmpty ? 'disabled' : ''}
          title="${label}"
        >
          <span class="ability-icon-symbol">${symbol}</span>
          <span class="ability-icon-label">${label}</span>
        </button>`;
    }

    const abilitiesHtml = `
      <div class="unit-abilities-row">
        ${abilityIconHtml(passiveKey, 'passive')}
        ${abilityIconHtml(activeKey,  'active')}
      </div>`;

    return `
      <div class="roster-slide">
        <div class="unit-card">
          ${portraitHtml}
          <div class="unit-info">
            ${headerHtml}
            ${subHtml}
            ${coreHtml}
            ${resistsHtml}
            ${levelUpHtml}
            ${abilitiesHtml}
          </div>
        </div>
      </div>
    `;
  }

  function goTo(idx) {
    current = Math.max(0, Math.min(idx, units.length - 1));
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.querySelectorAll('.roster-dot').forEach((d, i) => {
      d.classList.toggle('roster-dot--active', i === current);
    });
  }

  function initSlider() {
    track.innerHTML = units.map(u => buildCard(u)).join('');
    dots.innerHTML  = units.map((_, i) => `<span class="roster-dot" data-i="${i}"></span>`).join('');

    dots.querySelectorAll('.roster-dot').forEach(dot => {
      dot.addEventListener('click', () => goTo(Number(dot.dataset.i)));
    });

    let touchStartX = 0;
    track.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    track.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) < 40) return;
      if (dx < 0) goTo(current + 1);
      else        goTo(current - 1);
    }, { passive: true });

    goTo(0);
  }

  track.addEventListener('click', async (e) => {
    // Level up
    const lvlBtn = e.target.closest('.levelup-btn--ready');
    if (lvlBtn) {
      const rosterId = lvlBtn.dataset.rosterId;
      lvlBtn.disabled = true;
      lvlBtn.textContent = '...';
      try {
        await api('/roster/levelup', { chat_id: player.chat_id, roster_id: rosterId });
        const [freshUnits, freshStruct] = await Promise.all([
          api(`/roster?chat_id=${player.chat_id}`),
          api(`/structures?chat_id=${player.chat_id}`).catch(() => null),
        ]);
        units = freshUnits;
        buildingsData = freshStruct?.buildings_data || {};
        const savedIdx = current;
        initSlider();
        goTo(savedIdx);
      } catch (err) {
        lvlBtn.disabled = false;
        lvlBtn.textContent = 'Level Up';
        alert(err.message || 'Level up failed');
      }
      return;
    }

    // Ability icon
    const abilityBtn = e.target.closest('.ability-icon:not([disabled])');
    if (abilityBtn) {
      const key  = abilityBtn.dataset.abilityKey;
      const type = abilityBtn.dataset.abilityType;
      if (key) showTooltip(key, type);
    }
  });

  async function load() {
    const [fetchedUnits, structRes, buildingRes] = await Promise.all([
      api(`/roster?chat_id=${player.chat_id}`),
      api(`/structures?chat_id=${player.chat_id}`).catch(() => null),
      api('/buildings').catch(() => null),
    ]);

    units         = fetchedUnits;
    buildingsData = structRes?.buildings_data  || {};
    upgradePaths  = buildingRes?.upgrade_paths || {};

    if (!units.length) {
      track.innerHTML = `<div class="roster-slide"><p class="placeholder">No units yet.</p></div>`;
      return;
    }

    initSlider();
  }

  load();

  root.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      const screen = btn.dataset.screen;
      if (screen === 'roster') return;
      navigate(screen, { player });
    });
  });
}