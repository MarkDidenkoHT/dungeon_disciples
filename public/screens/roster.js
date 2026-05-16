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
        </div>
      </main>

      <div class="roster-nav" id="roster-nav">
        <button class="roster-nav-arrow" id="nav-prev">‹</button>
        <div class="roster-nav-dots" id="roster-dots"></div>
        <span class="roster-nav-label" id="roster-nav-label"></span>
        <button class="roster-nav-arrow" id="nav-next">›</button>
      </div>

      <nav class="bottom-nav">
        <button class="nav-btn" data-screen="castle">Castle</button>
        <button class="nav-btn active" data-screen="roster">Roster</button>
        <button class="nav-btn" data-screen="embark">Embark</button>
        <button class="nav-btn" data-screen="spells">Spells</button>
      </nav>
    </div>
  `;

  let current = 0;
  let units   = [];

  const track     = root.querySelector('#roster-track');
  const dotsWrap  = root.querySelector('#roster-dots');
  const navLabel  = root.querySelector('#roster-nav-label');
  const prevBtn   = root.querySelector('#nav-prev');
  const nextBtn   = root.querySelector('#nav-next');

  let buildingsData = {};
  let upgradePaths  = {};

  function buildCard(u) {
    const d      = u.unit_data || {};
    const unitId = d.id || '';

    const portraitSrc = unitId ? `/assets/character_art/${unitId}.png` : null;

    const passiveKey = d.passive || null;
    const activeKey  = d.ability  || null;
    const res        = d.resistances || {};

    const tier      = d.t ?? null;
    const isHero    = tier == null;
    const tierLabel = isHero ? `Hero Lv ${d.hero_level || 1}` : `Lv ${tier}`;

    const tags     = (d.tags || []).filter(Boolean);
    const tagLeft  = tags[0] || '';
    const tagRight = tags[1] || '';

    const xpRequired = d.xp ?? null;
    const currentXp  = u.experience ?? 0;
    const isMaxTier  = tier >= 2;
    const hasPath    = !isHero && !isMaxTier && xpRequired !== null;

    const heroLevel    = isHero ? (d.hero_level || 1) : null;
    const throneLevel  = buildingsData['slot_0']?.level || 1;
    const heroMaxed    = isHero && heroLevel >= 4;
    const heroCanLevel = isHero && !heroMaxed && throneLevel > heroLevel;

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
          upgradeBuildingHint = `Requires: ${paths.map(p => p.label).join(' or ')}`;
        }
      }
    }

    const canLevelUp = hasPath && currentXp >= xpRequired && upgradeReady;

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
        <div class="unit-portrait-overlay">
          <span class="unit-name">${u.unit_name}</span>
          <span class="unit-level-text">${tierLabel}</span>
        </div>
        ${tagLeft ? `<div class="unit-tag-left">${tagLeft}</div>` : ''}
        ${tagRight ? `<div class="unit-tag-right">${tagRight}</div>` : ''}
      </div>`;

    const coreHtml = `
      <div class="unit-core-stats">
        <div class="core-stat"><span class="core-stat-label">HP</span><span class="core-stat-val">${d.hp ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">Armor</span><span class="core-stat-val">${d.armor ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">Init</span><span class="core-stat-val">${d.initiative ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">XP</span><span class="core-stat-val">${currentXp}</span></div>
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

    const resistsHtml = `<div class="unit-resists-grid">${resistCells}</div>`;

    let levelUpHtml = '';
    if (isHero) {
      if (heroMaxed) {
        levelUpHtml = `
          <div class="levelup-row">
            <span class="hero-level-label">Hero Level ${heroLevel} — Max</span>
            <button class="levelup-btn levelup-btn--locked" disabled style="visibility: hidden;">Level Up</button>
          </div>
          <div class="levelup-hint"></div>
        `;
      } else {
        const throneNeeded = heroLevel + 1;
        const blocked      = !heroCanLevel;
        levelUpHtml = `
          <div class="levelup-row">
            <span class="hero-level-label">Hero Level ${heroLevel}</span>
            <button
              class="levelup-btn ${heroCanLevel ? 'levelup-btn--ready' : 'levelup-btn--locked'}"
              data-roster-id="${u.id}"
              data-is-hero="1"
              ${blocked ? 'disabled' : ''}
            >Level Up</button>
          </div>
          <div class="levelup-hint">${blocked ? `Requires Throne Lv ${throneNeeded} (current: ${throneLevel})` : ''}</div>
        `;
      }
    } else if (hasPath) {
      const pct = Math.min(100, Math.floor((currentXp / xpRequired) * 100));
      levelUpHtml = `
        <div class="levelup-row">
          <div class="levelup-xp-bar">
            <div class="levelup-xp-fill" style="width:${pct}%"></div>
          </div>
          <span class="levelup-xp-label">${currentXp}/${xpRequired} XP</span>
          <button
            class="levelup-btn ${canLevelUp ? 'levelup-btn--ready' : 'levelup-btn--locked'}"
            data-roster-id="${u.id}"
            ${canLevelUp ? '' : 'disabled'}
          >Level Up</button>
        </div>
        <div class="levelup-hint">${upgradeBuildingHint ? upgradeBuildingHint : ''}</div>
      `;
    } else {
      levelUpHtml = `
        <div class="levelup-row">
          ${isMaxTier ? '<span class="hero-level-label">Maximum Level Reached</span>' : '<span class="hero-level-label">Cannot Upgrade</span>'}
          <button class="levelup-btn levelup-btn--locked" disabled style="visibility: hidden;">Level Up</button>
        </div>
        <div class="levelup-hint"></div>
      `;
    }

    function abilityIconHtml(key, type) {
      const def      = resolveAbility(key, type);
      const label    = def ? def.name : (type === 'passive' ? 'No Passive' : 'No Active');
      const isEmpty  = !def;
      const imgSrc   = key && !isEmpty ? `/assets/icons/${key}.jpg` : null;
      const fallback = type === 'passive' ? '◈' : '⚡';
      const typeLabel = type === 'passive' ? 'Passive' : 'Active';

      const thumbHtml = imgSrc
        ? `<div class="ability-icon-thumb">
            <img class="ability-icon-img" src="${imgSrc}" alt="${label}"
              onerror="this.style.display='none';this.nextElementSibling.style.display='inline'">
            <span class="ability-icon-symbol" style="display:none">${fallback}</span>
          </div>`
        : `<div class="ability-icon-thumb"><span class="ability-icon-symbol">${fallback}</span></div>`;

      return `
        <button
          class="ability-icon ability-icon--${type} ${isEmpty ? 'ability-icon--empty' : ''}"
          data-ability-key="${key || ''}"
          data-ability-type="${type}"
          ${isEmpty ? 'disabled' : ''}
        >
          ${thumbHtml}
          <div class="ability-icon-text">
            <span class="ability-icon-type">${typeLabel}</span>
            <span class="ability-icon-label">${label}</span>
          </div>
        </button>`;
    }

    const abilitiesHtml = `
      <div class="unit-abilities-row">
        ${abilityIconHtml(passiveKey, 'passive')}
        ${abilityIconHtml(activeKey, 'active')}
      </div>
      <div class="ability-detail-panel" id="ability-detail-${u.id}" style="display:none;"></div>`;

    return `
      <div class="roster-slide">
        <div class="unit-card">
          ${portraitHtml}
          <div class="unit-info">
            ${coreHtml}
            ${resistsHtml}
            ${levelUpHtml}
            ${abilitiesHtml}
          </div>
        </div>
      </div>
    `;
  }

  function updateNav() {
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === units.length - 1;
    navLabel.textContent = units[current]?.unit_name ?? '';
    dotsWrap.querySelectorAll('.roster-dot').forEach((d, i) => {
      d.classList.toggle('roster-dot--active', i === current);
    });
  }

  function goTo(idx) {
    current = Math.max(0, Math.min(idx, units.length - 1));
    track.style.transform = `translateX(-${current * 100}%)`;
    updateNav();
  }

  prevBtn.addEventListener('click', () => goTo(current - 1));
  nextBtn.addEventListener('click', () => goTo(current + 1));

  function initSlider() {
    track.innerHTML = units.map(u => buildCard(u)).join('');

    dotsWrap.innerHTML = units.map((_, i) =>
      `<span class="roster-dot" data-i="${i}"></span>`
    ).join('');

    dotsWrap.querySelectorAll('.roster-dot').forEach(dot => {
      dot.addEventListener('click', () => goTo(Number(dot.dataset.i)));
    });

    let touchStartX = 0;
    let touchStartY = 0;
    let didSwipe    = false;

    track.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      didSwipe    = false;
    }, { passive: true });

    track.addEventListener('touchmove', e => {
      const dx = Math.abs(e.touches[0].clientX - touchStartX);
      const dy = Math.abs(e.touches[0].clientY - touchStartY);
      if (dx > dy && dx > 8) didSwipe = true;
    }, { passive: true });

    track.addEventListener('touchend', e => {
      if (!didSwipe) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) < 40) return;
      goTo(dx < 0 ? current + 1 : current - 1);
    }, { passive: true });

    goTo(0);
  }

  track.addEventListener('click', async (e) => {
    const lvlBtn = e.target.closest('.levelup-btn--ready');
    if (lvlBtn) {
      const rosterId  = lvlBtn.dataset.rosterId;
      const isHeroBtn = lvlBtn.dataset.isHero === '1';
      lvlBtn.disabled = true;
      lvlBtn.textContent = '…';
      try {
        const endpoint = isHeroBtn ? '/roster/hero-levelup' : '/roster/levelup';
        await api(endpoint, { chat_id: player.chat_id, roster_id: rosterId });
        const [freshUnits, freshStruct] = await Promise.all([
          api(`/roster?chat_id=${player.chat_id}`),
          api(`/structures?chat_id=${player.chat_id}`).catch(() => null),
        ]);
        units         = freshUnits;
        buildingsData = freshStruct?.buildings_data || {};
        const savedIdx = current;
        initSlider();
        goTo(savedIdx);
      } catch (err) {
        lvlBtn.disabled    = false;
        lvlBtn.textContent = 'Level Up';
        alert(err.message || 'Level up failed');
      }
      return;
    }

    const abilityBtn = e.target.closest('.ability-icon:not([disabled])');
    if (abilityBtn) {
      const key      = abilityBtn.dataset.abilityKey;
      const type     = abilityBtn.dataset.abilityType;
      const def      = resolveAbility(key, type);
      if (!def) return;

      const slide    = abilityBtn.closest('.roster-slide');
      const unitId   = slide ? slide.querySelector('[id^="ability-detail-"]')?.id?.replace('ability-detail-', '') : null;
      const panel    = unitId ? root.querySelector(`#ability-detail-${unitId}`) : null;
      if (!panel) return;

      const isOpen   = panel.style.display !== 'none' &&
                       panel.dataset.activeKey === key;
      if (isOpen) {
        panel.style.display = 'none';
        panel.dataset.activeKey = '';
        return;
      }

      const typeLabel = type === 'passive' ? 'Passive' : 'Active';
      panel.innerHTML = `
        <div class="ability-detail-type">${typeLabel}</div>
        <div class="ability-detail-name">
          ${def.name}
          ${def.rank ? `<span class="ability-detail-rank">Rank ${def.rank}</span>` : ''}
        </div>
        <div class="ability-detail-desc">${def.description || ''}</div>
      `;
      panel.style.display = 'flex';
      panel.dataset.activeKey = key;
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