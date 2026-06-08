import { api }              from '../main.js';
import { refreshResourceBar } from '../main.js';
import {
  RESIST_ICONS, RESIST_ORDER,
  cap, dmgReduction,
  resolveUnitDef, resolveAbility, buildStatDescription,
  renderModalContent, mountModal, applyBackground,
} from '../utils.js';

export function renderRoster(root, { player }) {
  applyBackground(root, player.faction, 'roster');

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
        <button class="roster-nav-arrow" id="nav-next">›</button>
      </div>
    </div>

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

  let current = 0;
  let units   = [];

  const track    = root.querySelector('#roster-track');
  const dotsWrap = root.querySelector('#roster-dots');
  const prevBtn  = root.querySelector('#nav-prev');
  const nextBtn  = root.querySelector('#nav-next');

  let buildingsData = {};
  let upgradePaths  = {};

  const modal = mountModal(root);
  function openModal(title, bodyHtml) { modal.open(title, bodyHtml); }

  function getActionLabel(actionKey) {
    if (!actionKey) return '—';
    const k = typeof actionKey === 'string' ? actionKey : (actionKey.id || '');
    const map = {
      attack:     'Attack',
      heal:       'Heal',
      repair:     'Repair',
      'mend flesh': 'Mend Flesh',
      sacrifice:  'Sacrifice',
    };
    return map[k.toLowerCase()] || cap(k);
  }

  function buildCard(u) {
    const stored   = u.unit_data || {};
    const def      = resolveUnitDef(u);
    const isHero   = u.is_hero === true;
    const unitId   = stored.unit_id || '';
    const unitName = def?.name ?? unitId;

    const portraitSrc = unitId ? `/assets/character_art/${unitId}.png` : null;

    const res       = def?.resistances || {};
    const tier      = def?.t ?? 1;
    const tierLabel = isHero ? `Hero Lv ${tier}` : `Lv ${tier}`;

    const tags     = (def?.tags || []).filter(Boolean);
    const tagLeft  = tags[0] || '';
    const tagRight = tags[1] || '';

    const currentXp  = stored.current_xp ?? 0;
    const throneLevel = buildingsData['slot_0']?.level || 1;

    let heroPathsForUnit = [];
    if (isHero) {
      for (const factionPaths of Object.values(upgradePaths)) {
        if (factionPaths[unitId]) { heroPathsForUnit = factionPaths[unitId]; break; }
      }
    }

    const heroMaxed    = isHero && heroPathsForUnit.length === 0;
    const xpRequired   = def?.xp ?? null;
    const heroXpMet    = xpRequired == null || currentXp >= xpRequired;
    const heroCanLevel = isHero && !heroMaxed && throneLevel > tier && heroXpMet;

    const isMaxTier = !isHero && xpRequired === null && !Object.values(upgradePaths).some(fp => fp[unitId]);
    const hasPath   = !isHero && !isMaxTier && xpRequired !== null;

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
        if (!upgradeReady) upgradeBuildingHint = `Requires: ${unitPaths.map(p => p.label).join(' or ')}`;
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

    const actionRaw   = def?.action;
    const actionLabel = getActionLabel(actionRaw);
    const power       = def?.action_power ?? def?.action?.value ?? '—';

    const coreHtml = `
      <div class="unit-core-stats">
        <div class="core-stat"><span class="core-stat-label">HP</span><span class="core-stat-val">${def?.hp ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">Init</span><span class="core-stat-val">${def?.initiative ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">Power</span><span class="core-stat-val">${power}</span></div>
        <div class="core-stat"><span class="core-stat-label">Action</span><span class="core-stat-val core-stat-val--action">${actionLabel}</span></div>
        <div class="core-stat"><span class="core-stat-label">XP</span><span class="core-stat-val">${currentXp}</span></div>
      </div>`;

    const armorVal = def?.armor ?? 0;
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

    const resistsHtml = `<div class="unit-resists-grid">${armorCell}${resistCells}</div>`;

    let levelUpHtml = '';
    if (isHero) {
      if (heroMaxed) {
        levelUpHtml = `
          <div class="levelup-row">
            <span class="hero-level-label">Hero Level ${tier} — Max</span>
          </div>`;
      } else {
        const throneBlocked = throneLevel <= tier;
        const xpBlocked     = xpRequired != null && currentXp < xpRequired;
        const blocked       = throneBlocked || xpBlocked;

        let blockedMsg = '';
        if (throneBlocked)     blockedMsg = ` — Level Up Requires Throne Lv ${tier + 1}`;
        else if (xpBlocked)    blockedMsg = ` — Need ${xpRequired} XP`;

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
            ${!blocked ? `<button class="levelup-btn levelup-btn--ready" data-roster-id="${u.id}">Level Up</button>` : ''}
          </div>`;
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
        ${upgradeBuildingHint ? `<div class="levelup-hint">${upgradeBuildingHint}</div>` : ''}`;
    } else {
      levelUpHtml = `
        <div class="levelup-row">
          <span class="hero-level-label">${isMaxTier ? 'Maximum Level Reached' : 'Cannot Upgrade'}</span>
        </div>`;
    }

    function abilityIconHtml(key, type) {
      const aDef    = resolveAbility(key);
      const isEmpty = !aDef;
      const fileKey = key ? key.replace(/\s+/g, '_').replace(/_\d+$/, '') : null;
      const imgSrc  = aDef ? `/assets/icons/abilities/${fileKey}.jpg` : null;
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

    const passiveKeys = Array.isArray(def?.passive)
      ? def.passive.filter(Boolean)
      : (def?.passive ? [def.passive] : []);

    const iconsHtml = [
      def?.ability     ? abilityIconHtml(def.ability,     'active')  : abilityIconHtml('', 'empty'),
      passiveKeys[0]   ? abilityIconHtml(passiveKeys[0],  'passive') : abilityIconHtml('', 'empty'),
      passiveKeys[1]   ? abilityIconHtml(passiveKeys[1],  'passive') : abilityIconHtml('', 'empty'),
      passiveKeys[2]   ? abilityIconHtml(passiveKeys[2],  'passive') : abilityIconHtml('', 'empty'),
    ].join('');

    const abilitiesHtml = `
      <div class="unit-abilities-row">
        <div class="unit-abilities-icons">
          ${iconsHtml}
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
      </div>`;
  }

  function updateNav() {
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === units.length - 1;
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

  function openDetailModal(title, bodyHtml) {
    openModal(title, bodyHtml);
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
      const def  = resolveAbility(key);
      if (!def) return;
      const typeLabel   = type === 'passive' ? 'Passive' : 'Active';
      const description = buildStatDescription(def, type) || 'No details available.';
      const bodyHtml = `
        <div class="ability-modal-content">
          <div class="ability-modal-type ability-modal-type--${type}">${typeLabel}</div>
          <div class="ability-modal-name">${def.name}${def.rank ? ` <span class="ability-modal-rank">Rank ${def.rank}</span>` : ''}</div>
          <div class="ability-modal-desc">${description}</div>
        </div>`;
      openDetailModal(`${typeLabel} Ability`, bodyHtml);
      return;
    }

    const armorCell = e.target.closest('[data-armor]');
    if (armorCell) {
      const val = parseInt(armorCell.dataset.armor ?? '0', 10);
      const bodyHtml = renderModalContent(`Armor: ${val}\nReduces physical damage taken. Each point of armor reduces damage by 1%.`);
      openDetailModal('Armor', bodyHtml);
      return;
    }

    const coreStat = e.target.closest('.core-stat');
    if (coreStat) {
      const label  = coreStat.querySelector('.core-stat-label')?.textContent?.trim() || '';
      const val    = coreStat.querySelector('.core-stat-val')?.textContent?.trim() || '—';
      let text = '';
      if (label === 'HP') {
        text = `HP: ${val}\nCurrent hit points. Unit is defeated when HP reaches 0.`;
      } else if (label === 'Init') {
        text = `Initiative: ${val}\nDetermines turn order in combat. Higher acts first.`;
      } else if (label === 'Power') {
        text = `Power: ${val}\nBase damage or healing output of the unit's action.`;
      } else if (label === 'Action') {
        text = `Action: ${val}\nThe type of action this unit performs each turn.`;
      } else if (label === 'XP') {
        text = `Experience: ${val}\nAccumulated XP toward next level.`;
      } else {
        text = `${label}: ${val}`;
      }
      openDetailModal(label, renderModalContent(text));
      return;
    }

    const resistCell = e.target.closest('.resist-cell');
    if (resistCell) {
      if (resistCell.dataset.armor !== undefined) return;
      const label  = resistCell.getAttribute('title') || '';
      const valEl  = resistCell.querySelector('.resist-val');
      const numVal = parseInt(valEl?.textContent ?? '0', 10);
      let text = '';
      if (numVal === 0) {
        text = `${label} Resistance: 0\nNo modifier to ${label.toLowerCase()} damage taken.`;
      } else if (numVal > 0) {
        text = `${label} Resistance: +${numVal}\nReduces ${label.toLowerCase()} damage taken.`;
      } else {
        text = `${label} Resistance: ${numVal}\nIncreases ${label.toLowerCase()} damage taken.`;
      }
      openDetailModal(label, renderModalContent(text));
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