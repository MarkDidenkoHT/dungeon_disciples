import { api }              from '../main.js';
import { navigate }          from '../main.js';
import { refreshResourceBar } from '../main.js';
import { PASSIVES }          from '../../data/passives.js';
import { ABILITIES }         from '../../data/abilities.js';
import { UNITS }             from '../../data/units.js';

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

function resolveUnitDef(unit) {
  const uid = unit.unit_data?.unit_id;
  if (!uid) return null;

  for (const factionPool of Object.values(UNITS)) {
    if (typeof factionPool !== 'object' || Array.isArray(factionPool)) continue;
    for (const entry of Object.values(factionPool)) {
      if (entry?.id === uid) return entry;
      if (typeof entry === 'object' && !entry.id) {
        const nested = Object.values(entry).find(u => u?.id === uid);
        if (nested) return nested;
      }
    }
  }

  return null;
}

function resolveAbility(key, type) {
  if (!key || key === 'None') return null;
  const k = key.replace(/\s+/g, '_');
  if (type === 'passive') return PASSIVES[k]  || PASSIVES[key]  || null;
  if (type === 'active')  return ABILITIES[k] || ABILITIES[key] || null;
  return null;
}

function buildStatDescription(def, type) {
  const parts = [];

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
    const stored   = u.unit_data || {};
    const def      = resolveUnitDef(u);
    const isHero   = u.is_hero === true;
    const unitId   = stored.unit_id || '';
    const unitName = def?.name ?? unitId;

    const portraitSrc = unitId ? `/assets/character_art/${unitId}.png` : null;

    const passiveKey = def?.passive || null;
    const activeKey  = def?.ability || null;
    const res        = def?.resistances || {};

    const tier      = def?.t ?? 1;
    const tierLabel = isHero ? `Hero Lv ${tier}` : `Lv ${tier}`;

    const tags     = (def?.tags || []).filter(Boolean);
    const tagLeft  = tags[0] || '';
    const tagRight = tags[1] || '';

    const currentXp = stored.current_xp ?? 0;

    const throneLevel = buildingsData['slot_0']?.level || 1;

    let heroPathsForUnit = [];
    if (isHero) {
      for (const factionPaths of Object.values(upgradePaths)) {
        if (factionPaths[unitId]) { heroPathsForUnit = factionPaths[unitId]; break; }
      }
    }

    const heroMaxed  = isHero && heroPathsForUnit.length === 0;
    const xpRequired = def?.xp ?? null;
    const heroXpMet  = xpRequired == null || currentXp >= xpRequired;
    const heroCanLevel = isHero && !heroMaxed && throneLevel > tier && heroXpMet;

    const isMaxTier  = !isHero && xpRequired === null && !Object.values(upgradePaths).some(fp => fp[unitId]);
    const hasPath    = !isHero && !isMaxTier && xpRequired !== null;

    let upgradeReady        = true;
    let upgradeBuildingHint = '';
    if (hasPath) {
      let unitPaths = [];
      for (const factionPaths of Object.values(upgradePaths)) {
        if (factionPaths[unitId]) { unitPaths = factionPaths[unitId]; break; }
      }
      if (unitPaths.length > 1) {
        const slot           = stored.building_slot;
        const slotBuildingId = slot ? buildingsData[slot]?.building_id : null;
        const matched        = unitPaths.find(p => p.building_id === slotBuildingId);
        upgradeReady         = !!matched;
        if (!upgradeReady) {
          upgradeBuildingHint = `Requires: ${unitPaths.map(p => p.label).join(' or ')}`;
        }
      }
    }

    const canLevelUp = hasPath && currentXp >= xpRequired && upgradeReady;

    const portraitHtml = `
      <div class="unit-portrait">
        <img
          src="${portraitSrc || ''}"
          alt="${unitName}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
        >
        <div class="unit-portrait-fallback" style="display:none;">
          <span>${unitId || unitName}</span>
        </div>
        <div class="unit-portrait-overlay">
          <span class="unit-name">${unitName}</span>
          <span class="unit-level-text">${tierLabel}</span>
        </div>
        ${tagLeft  ? `<div class="unit-tag-left">${tagLeft}</div>`   : ''}
        ${tagRight ? `<div class="unit-tag-right">${tagRight}</div>` : ''}
      </div>`;

    const currentHp = def?.hp ?? '—';

    const coreHtml = `
      <div class="unit-core-stats">
        <div class="core-stat"><span class="core-stat-label">HP</span><span class="core-stat-val">${currentHp}</span></div>
        <div class="core-stat"><span class="core-stat-label">Armor</span><span class="core-stat-val">${def?.armor ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">Init</span><span class="core-stat-val">${def?.initiative ?? '—'}</span></div>
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
            <span class="hero-level-label">Hero Level ${tier} — Max</span>
          </div>
        `;
      } else {
        const throneBlocked = throneLevel <= tier;
        const xpBlocked     = xpRequired != null && currentXp < xpRequired;
        const blocked       = throneBlocked || xpBlocked;

        let blockedMsg = '';
        if (throneBlocked) blockedMsg = ` — Level Up Requires Throne Lv ${tier + 1}`;
        else if (xpBlocked) blockedMsg = ` — Need ${xpRequired} XP`;

        const pct = xpRequired != null ? Math.min(100, Math.floor((currentXp / xpRequired) * 100)) : 100;

        levelUpHtml = `
          <div class="levelup-row">
            ${xpRequired != null ? `
              <div class="levelup-xp-bar">
                <div class="levelup-xp-fill" style="width:${pct}%"></div>
              </div>
              <span class="levelup-xp-label">${currentXp}/${xpRequired} XP</span>
            ` : ''}
            <span class="hero-level-label">Hero Level ${tier}${blockedMsg}</span>
            ${!blocked ? `<button
              class="levelup-btn levelup-btn--ready"
              data-roster-id="${u.id}"
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
      const aDef    = resolveAbility(key, type);
      const isEmpty = !aDef;
      const fileKey = key ? key.replace(/\s+/g, '_') : null;
      const imgSrc  = aDef ? `/assets/icons/abilities/${fileKey}.png` : null;
      return `
        <button
          class="ability-icon ability-icon--${type}${isEmpty ? ' ability-icon--empty' : ''}"
          data-ability-key="${key || ''}"
          data-ability-type="${type}"
          ${isEmpty ? 'disabled' : ''}
        >
          ${imgSrc ? `<img class="ability-icon-img" src="${imgSrc}" alt="${aDef.name}" onerror="this.style.visibility='hidden'">` : ''}
        </button>`;
    }

    const abilitiesHtml = `
      <div class="unit-abilities-row">
        <div class="unit-abilities-icons">
          ${abilityIconHtml(passiveKey, 'passive')}
          ${abilityIconHtml(activeKey, 'active')}
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
    const u   = units[current];
    const def = u ? resolveUnitDef(u) : null;
    navLabel.textContent = def?.name ?? u?.unit_data?.unit_id ?? '';
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
      const rosterId = lvlBtn.dataset.rosterId;
      lvlBtn.disabled    = true;
      lvlBtn.textContent = '…';
      try {
        await api('/roster/levelup', { chat_id: player.chat_id, roster_id: rosterId });
        const [freshUnits, freshStruct] = await Promise.all([
          api(`/roster?chat_id=${player.chat_id}`),
          api(`/structures?chat_id=${player.chat_id}`).catch(() => null),
        ]);
        units         = freshUnits;
        buildingsData = freshStruct?.buildings_data || {};
        // Level up doesn't cost resources but good practice to keep bar fresh
        refreshResourceBar(player).catch(() => {});
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
      const slide  = coreStat.closest('.roster-slide');
      if (!slide) return;
      const label  = coreStat.querySelector('.core-stat-label')?.textContent?.trim() || '';
      const val    = coreStat.querySelector('.core-stat-val')?.textContent?.trim() || '—';
      let text = '';
      if (label === 'HP') {
        text = `HP: ${val}\nCurrent hit points. Unit is defeated when HP reaches 0.`;
      } else if (label === 'Armor') {
        const numVal = parseFloat(val);
        const pct    = isNaN(numVal) ? 0 : dmgReduction(numVal);
        text = `Armor: ${val}\nReduces physical damage taken by ${pct}%.`;
      } else if (label === 'Init') {
        text = `Initiative: ${val}\nDetermines turn order in combat. Higher acts first.`;
      } else if (label === 'XP') {
        text = `Experience: ${val}\nAccumulated XP toward next level.`;
      } else {
        text = `${label}: ${val}`;
      }
      showInPanel(slide, text, `core-${label}`);
      return;
    }

    const resistCell = e.target.closest('.resist-cell');
    if (resistCell) {
      const slide  = resistCell.closest('.roster-slide');
      if (!slide) return;
      const label  = resistCell.getAttribute('title') || '';
      const valEl  = resistCell.querySelector('.resist-val');
      const numVal = parseInt(valEl?.textContent ?? '0', 10);
      const pct    = dmgReduction(numVal);
      let text = '';
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
}