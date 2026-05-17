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

function dmgReduction(val) {
  return Math.abs(val);
}

function resolveAbility(key, type) {
  if (!key || key === 'None') return null;
  const k = key.replace(/\s+/g, '_');
  if (type === 'passive') return PASSIVES[k]  || PASSIVES[key]  || null;
  if (type === 'active')  return ABILITIES[k] || ABILITIES[key] || null;
  return null;
}

function buildStatDescription(def, type) {
  let parts = [];

  if (def.description) parts.push(def.description);

  if (type === 'passive' && def.stats) {
    const statLines = Object.entries(def.stats).map(([stat, val]) => {
      const sign = val >= 0 ? '+' : '';
      if (stat === 'hp') return `${sign}${val} HP`;
      if (stat === 'hp_regen') return `${sign}${val} HP regen/turn`;
      if (stat === 'initiative') return `${sign}${val} Initiative`;
      if (stat === 'armor') {
        const pct = dmgReduction(val);
        return `${sign}${val} Armor (${pct}% dmg reduction)`;
      }
      if (stat === 'armor_reduction') return `${val} Armor reduction`;
      if (stat.includes('resist')) {
        const resistType = stat.replace('_resist', '');
        const pct = dmgReduction(val);
        return `${sign}${val} ${cap(resistType)} resist (${pct}% dmg reduction)`;
      }
      return `${sign}${val} ${cap(stat)}`;
    });
    if (statLines.length) parts.push(statLines.join(', '));
  }

  return parts.join('\n\n');
}

export function renderRoster(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-roster">
      <div class="resource-bar" id="resource-bar"></div>
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

  async function loadResourceBar() {
    try {
      const inventory = await api(`/inventory?chat_id=${player.chat_id}&type=resource`);
      const find = (name) => inventory.find(r => r.item === name) || { amount: 0 };
      root.querySelector('#resource-bar').innerHTML = `
        <div class="res-bar-item"><span class="res-bar-icon">🪙</span><span class="res-bar-val">${find('Gold').amount}</span></div>
        <div class="res-bar-sep"></div>
        <div class="res-bar-item"><span class="res-bar-icon">🔮</span><span class="res-bar-val">${find('Mana').amount}</span></div>
        <div class="res-bar-sep"></div>
        <div class="res-bar-item"><span class="res-bar-icon">🟢</span><span class="res-bar-val">${find('Crystals_Life').amount}</span></div>
        <div class="res-bar-item"><span class="res-bar-icon">🔴</span><span class="res-bar-val">${find('Crystals_Fire').amount}</span></div>
        <div class="res-bar-item"><span class="res-bar-icon">🟣</span><span class="res-bar-val">${find('Crystals_Death').amount}</span></div>
        <div class="res-bar-item"><span class="res-bar-icon">🟡</span><span class="res-bar-val">${find('Crystals_Nature').amount}</span></div>
        <div class="res-bar-item"><span class="res-bar-icon">🔵</span><span class="res-bar-val">${find('Crystals_Frost').amount}</span></div>
      `;
    } catch (err) {
      console.error('Failed to load resource bar:', err);
    }
  }

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
          </div>
        `;
      } else {
        const throneNeeded = heroLevel + 1;
        const blocked      = !heroCanLevel;
        levelUpHtml = `
          <div class="levelup-row">
            <span class="hero-level-label">Hero Level ${heroLevel}${blocked ? ` — Level Up Requires Throne Lv ${throneNeeded}` : ''}</span>
            ${!blocked ? `<button
              class="levelup-btn levelup-btn--ready"
              data-roster-id="${u.id}"
              data-is-hero="1"
            >Level Up</button>` : ''}
          </div>
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
        ${upgradeBuildingHint ? `<div class="levelup-hint">${upgradeBuildingHint}</div>` : ''}
      `;
    } else {
      levelUpHtml = `
        <div class="levelup-row">
          <span class="hero-level-label">${isMaxTier ? 'Maximum Level Reached' : 'Cannot Upgrade'}</span>
        </div>
      `;
    }

    function abilityIconHtml(key, type) {
      const def      = resolveAbility(key, type);
      const isEmpty  = !def;
      const fileKey  = key ? key.replace(/\s+/g, '_') : null;
      const imgSrc   = def ? `/assets/icons/abilities/${fileKey}.png` : null;
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

    const passiveHtml = abilityIconHtml(passiveKey, 'passive');
    const activeHtml  = abilityIconHtml(activeKey, 'active');

    const abilitiesHtml = `
      <div class="unit-abilities-row">
        <div class="unit-abilities-icons">
          ${passiveHtml}
          ${activeHtml}
        </div>
        <div class="ability-detail-panel">
          <div class="ability-detail-desc"></div>
        </div>
      </div>`;

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

  function showInPanel(slide, text, activeKey) {
    const panel = slide.querySelector('.ability-detail-panel');
    const desc  = slide.querySelector('.ability-detail-desc');
    if (!panel || !desc) return;
    if (panel.dataset.activeKey === activeKey) {
      panel.dataset.activeKey = '';
      desc.textContent = '';
      slide.querySelectorAll('.ability-icon').forEach(b => b.classList.remove('ability-icon--selected'));
      return;
    }
    panel.dataset.activeKey = activeKey;
    desc.textContent = text;
    slide.querySelectorAll('.ability-icon').forEach(b => b.classList.remove('ability-icon--selected'));
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

    const abilityBtn = e.target.closest('.ability-icon');
    if (abilityBtn) {
      const key  = abilityBtn.dataset.abilityKey;
      const type = abilityBtn.dataset.abilityType;
      const def  = resolveAbility(key, type);
      if (!def) return;
      const slide = abilityBtn.closest('.roster-slide');
      if (!slide) return;
      const typeLabel   = type === 'passive' ? 'Passive' : 'Active';
      const description = buildStatDescription(def, type);
      const text        = `[${typeLabel}] ${def.name}${def.rank ? ` (Rank ${def.rank})` : ''}\n${description}`;
      abilityBtn.classList.toggle('ability-icon--selected', slide.querySelector('.ability-detail-panel')?.dataset.activeKey !== key);
      showInPanel(slide, text, key);
      return;
    }

    const coreStat = e.target.closest('.core-stat');
    if (coreStat) {
      const slide = coreStat.closest('.roster-slide');
      if (!slide) return;
      const label = coreStat.querySelector('.core-stat-label')?.textContent?.trim() || '';
      const val   = coreStat.querySelector('.core-stat-val')?.textContent?.trim() || '—';
      const u     = units[current];
      const d     = u?.unit_data || {};
      let text    = '';
      if (label === 'HP')    text = `HP: ${val}\nMaximum hit points. Unit is defeated when HP reaches 0.`;
      else if (label === 'Armor') {
        const numVal = parseFloat(val);
        const pct    = isNaN(numVal) ? 0 : dmgReduction(numVal);
        text = `Armor: ${val}\nReduces physical damage taken by ${pct}%.`;
      }
      else if (label === 'Init')  text = `Initiative: ${val}\nDetermines turn order in combat. Higher acts first.`;
      else if (label === 'XP')    text = `Experience: ${val}\nAccumulated XP toward next level.`;
      else text = `${label}: ${val}`;
      showInPanel(slide, text, `core-${label}`);
      return;
    }

    const resistCell = e.target.closest('.resist-cell');
    if (resistCell) {
      const slide = resistCell.closest('.roster-slide');
      if (!slide) return;
      const label  = resistCell.getAttribute('title') || '';
      const valEl  = resistCell.querySelector('.resist-val');
      const numVal = parseInt(valEl?.textContent ?? '0', 10);
      const pct    = dmgReduction(numVal);
      let text     = '';
      if (numVal === 0) {
        text = `${label} Resistance: 0\nNo modifier to ${label.toLowerCase()} damage taken.`;
      } else if (numVal > 0) {
        text = `${label} Resistance: +${numVal}\nReduces ${label.toLowerCase()} damage taken by ${pct}%.`;
      } else {
        text = `${label} Resistance: ${numVal}\nIncreases ${label.toLowerCase()} damage taken by ${pct}%.`;
      }
      showInPanel(slide, text, `resist-${label}`);
      return;
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
  loadResourceBar();

  root.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      const screen = btn.dataset.screen;
      if (screen === 'roster') return;
      navigate(screen, { player });
    });
  });
}