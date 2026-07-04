import { api }              from '../api.js';
import { refreshResourceBar } from '../api.js';
import { SPELLS }           from '../../data/spells.js';
import {
  RESIST_ICONS, RESIST_ORDER,
  cap, dmgReduction,
  resolveUnitDef, resolveAbility, buildStatDescription,
  renderModalContent, openSheet, closeSheet, applyBackground,
  renderUnitPortrait, renderUnitCoreStatsColumn, renderUnitResistColumn, renderUnitAbilitiesRow,
  getActionLabel,
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
  `;

  let current = 0;
  let units   = [];

  const track    = root.querySelector('#roster-track');
  const dotsWrap = root.querySelector('#roster-dots');
  const prevBtn  = root.querySelector('#nav-prev');
  const nextBtn  = root.querySelector('#nav-next');

  let buildingsData = {};
  let upgradePaths  = {};

  function openModal(title, bodyHtml) { openSheet(title, bodyHtml); }

  function buildCard(u) {
    const stored   = u.unit_data || {};
    const def      = resolveUnitDef(u);
    const isHero   = u.is_hero === true;
    const unitId   = stored.unit_id || '';
    const unitName = def?.name ?? unitId;

    const tier      = def?.t ?? 1;
    const tierLabel = isHero ? `Hero Lv ${tier}` : `Lv ${tier}`;

    const currentXp  = stored.current_xp ?? 0;
    const currentHp  = stored.current_hp != null ? stored.current_hp : (def?.hp ?? '—');
    const maxHp      = stored.max_hp != null ? stored.max_hp : (def?.hp ?? '—');
    const alive      = stored.alive !== false;
    const throneLevel = buildingsData['slot_0']?.level ?? 0;

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

    const liveUnit = {
      ...(def || {}),
      id:   unitId || def?.id,
      name: unitName,
      hp:   `${currentHp}/${maxHp}`,
      xp:   currentXp,
    };

    const portraitHtml = renderUnitPortrait(liveUnit, { badge: alive ? tierLabel : '💀 Dead' });
    const coreHtml      = renderUnitCoreStatsColumn(liveUnit);
    const resistsHtml   = renderUnitResistColumn(liveUnit);

    const resurrectionSpell = SPELLS[player.faction]?.find(s => s.usage === 'roster' && s.target_scope === 'single_ally');
    const resurrectionCost = resurrectionSpell
      ? Object.entries(resurrectionSpell.cost?.crystals || {})
          .filter(([, amt]) => amt > 0)
          .map(([type, amt]) => `${type.replace('Crystals_', '')} ${amt}`)
          .join(', ')
      : '';
    const resurrectButtonHtml = !alive && resurrectionSpell ? `
      <div class="unit-resurrect-row">
        <button class="resurrect-btn" data-roster-id="${u.id}" data-spell-id="${resurrectionSpell.id}">
          Resurrect (${resurrectionCost})
        </button>
      </div>
    ` : '';

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

    const abilitiesHtml = renderUnitAbilitiesRow(liveUnit);

    return `
      <div class="roster-slide">
        <div class="unit-card ${alive ? '' : 'unit-card--dead'}">
          <div class="unit-main-row">
            ${coreHtml}
            ${portraitHtml}
            ${resistsHtml}
          </div>
          <div class="unit-info">
            ${resurrectButtonHtml}
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

    const resurrectBtn = e.target.closest('.resurrect-btn');
    if (resurrectBtn) {
      const rosterId = resurrectBtn.dataset.rosterId;
      const spellId  = resurrectBtn.dataset.spellId;
      resurrectBtn.disabled    = true;
      resurrectBtn.textContent = 'Resurrecting…';
      try {
        await api('/roster/resurrect', { chat_id: player.chat_id, roster_id: rosterId, spell_id: spellId });
        const freshUnits = await api(`/roster?chat_id=${player.chat_id}`);
        units = freshUnits;
        await refreshResourceBar(player).catch(() => {});
        const savedIdx = current;
        initSlider();
        goTo(savedIdx);
      } catch (err) {
        alert(err.message || 'Resurrection failed');
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