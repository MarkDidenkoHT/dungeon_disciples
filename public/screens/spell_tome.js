import { api, refreshResourceBar, resourceCache, structuresCache } from '../api.js';
import { SPELLS }                  from '../../data/spells.js';
import { CRYSTAL_ICONS, applyBackground, openSheet, closeSheet, getSheetBody, cap, playPageTurnSound, spellName, spellDesc } from '../utils.js';

export function renderSpellTome(root, { player }) {
  applyBackground(root, player.faction, 'spells');

  root.innerHTML = `
    <div class="screen screen-spelltome">
      <main class="spelltome-main">
        <div class="tier-tabs" id="tier-tabs">
          <button class="tier-tab tier-tab--active" data-tier="1">Tier I</button>
          <button class="tier-tab" data-tier="2">Tier II</button>
          <button class="tier-tab" data-tier="3">Tier III</button>
          <button class="tier-tab" data-tier="4">Tier IV</button>
        </div>

        <div class="spelltome-body">
          <div class="spells-slider-wrap" id="spells-slider-wrap">
            <div class="spells-slider" id="spells-slider"></div>
          </div>
        </div>
      </main>
    </div>
  `;

  let playerCrystals  = {};
  let throneLevel     = 1;
  let learnedSpells   = [];
  let activeSpellId   = null;
  let activeTier      = 1;
  const factionSpells = SPELLS[player.faction] || [];

  const slider      = root.querySelector('#spells-slider');
  const sliderWrap  = root.querySelector('#spells-slider-wrap');
  const tierTabs    = root.querySelector('#tier-tabs');

  function costHtml(spell) {
    let parts = '';
    for (const [type, amt] of Object.entries(spell.cost.crystals || {})) {
      if (amt > 0) parts += `<span class="spell-cost-item"><span>${CRYSTAL_ICONS[type] || '💎'}</span>${amt}</span>`;
    }
    return parts || '—';
  }

  function spellIconSlug(spell) {
    return spell.name
      .toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function spellIconUrl(spell) {
    return `/assets/icons/spells/${spell.id}.png`;
  }

  function canAfford(spell) {
    for (const [type, amt] of Object.entries(spell.cost.crystals || {})) {
      if (amt > 0 && (playerCrystals[type] || 0) < amt) return false;
    }
    return true;
  }

  function renderSlider() {
    const tierSpells   = factionSpells.filter(s => s.tier === activeTier);
    const tierUnlocked = throneLevel >= activeTier;

    if (!tierSpells.length) {
      slider.innerHTML = `<div class="spells-empty">No spells for this tier.</div>`;
      return;
    }

    slider.innerHTML = tierSpells.map(spell => {
      const isLearned  = learnedSpells.includes(spell.id);
      const affordable = canAfford(spell);
      const isActive   = activeSpellId === spell.id;

      let cardCls = 'spell-card';
      if (isLearned)                                       cardCls += ' spell-card--learned';
      if (!tierUnlocked)                                   cardCls += ' spell-card--locked';
      if (isActive)                                        cardCls += ' spell-card--active';
      if (tierUnlocked && !isLearned && !affordable)       cardCls += ' spell-card--unaffordable';

      return `
        <div class="${cardCls}" data-spell-id="${spell.id}">
          ${isLearned ? '<div class="spell-card-learned-ring"></div>' : ''}
          <div class="spell-card-icon">
            <img src="${spellIconUrl(spell)}" alt="${spellName(spell, player)}" onerror="this.style.display='none'">
            ${!isLearned ? '<img src="/assets/icons/spells/spell_locked.png" alt="Locked" class="spell-card-lock-img">' : ''}
          </div>
          <div class="spell-card-name">${spellName(spell, player)}</div>
          <div class="spell-card-cost">${costHtml(spell)}</div>
          ${isLearned ? '<div class="spell-card-check">✓</div>' : ''}
        </div>
      `;
    }).join('');

    slider.querySelectorAll('.spell-card').forEach(card => {
      const spellId = card.dataset.spellId;
      const spell   = factionSpells.find(s => s.id === spellId);
      if (!spell) return;

      card.addEventListener('click', () => {
        if (activeSpellId === spellId) {
          activeSpellId = null;
          renderSlider();
          closeSheet();
          return;
        }
        activeSpellId = spellId;
        renderSlider();
        openSpellModal(spell);
      });
    });
  }

  function modalBodyHtml(spell) {
    const isLearned    = learnedSpells.includes(spell.id);
    const affordable   = canAfford(spell);
    const tierUnlocked = throneLevel >= spell.tier;
    const canResearch  = tierUnlocked && !isLearned && affordable;

    let actionHtml;
    if (isLearned) {
      actionHtml = `<span class="spell-detail-status spell-detail-status--learned">✓ Learned</span>`;
    } else if (!tierUnlocked) {
      actionHtml = `<span class="spell-detail-status spell-detail-status--locked">🔒 Throne level ${spell.tier} required</span>`;
    } else {
      actionHtml = `
        <button class="research-btn-full" id="detail-research-btn" ${canResearch ? '' : 'disabled'}>
          ${canResearch ? 'Research Spell' : 'Not enough crystals'}
        </button>
      `;
    }

    const typeLabels = { buff: 'Buff', debuff: 'Debuff', resurrect: 'Resurrect' };
    const typeLabel  = typeLabels[spell.effect_type] || cap(spell.effect_type || '');

    return `
      <div class="spell-modal-type spell-modal-type--${spell.effect_type}">${typeLabel}</div>
      <div class="spell-modal-desc">${spellDesc(spell, player)}</div>
      <div class="spell-detail-action">
        ${actionHtml}
        <div class="research-feedback" id="research-feedback" style="display:none"></div>
      </div>
    `;
  }

  function bindModalActions(spell) {
    const detailBtn = getSheetBody().querySelector('#detail-research-btn');
    if (detailBtn) {
      detailBtn.addEventListener('click', async () => {
        detailBtn.disabled    = true;
        detailBtn.textContent = '…';
        await doResearch(spell);
      });
    }
  }

  function openSpellModal(spell) {
    openSheet(spellName(spell, player), modalBodyHtml(spell));
    bindModalActions(spell);

    const overlay = document.querySelector('.modal-overlay');
    if (overlay) {
      const onClose = () => {
        activeSpellId = null;
        renderSlider();
      };
      overlay.querySelector('.modal-close-btn')?.addEventListener('click', onClose, { once: true });
      overlay.addEventListener('click', e => { if (e.target === overlay) onClose(); }, { once: true });
    }
  }

  function refreshModalBody(spell) {
    getSheetBody().innerHTML = modalBodyHtml(spell);
    bindModalActions(spell);
  }

  function showFeedback(msg, isError) {
    const el = getSheetBody().querySelector('#research-feedback');
    if (!el) return;
    el.textContent   = msg;
    el.className     = `research-feedback ${isError ? 'research-feedback--error' : 'research-feedback--success'}`;
    el.style.display = 'inline-block';
  }

  async function doResearch(spell) {
    try {
      const result = await api('/spells/research', {
        chat_id:  player.chat_id,
        spell_id: spell.id,
        faction:  player.faction,
      });

      if (result?.success) {
        for (const [type, amt] of Object.entries(spell.cost.crystals || {})) {
          if (amt > 0) playerCrystals[type] = (playerCrystals[type] || 0) - amt;
        }
        learnedSpells.push(spell.id);
        refreshResourceBar(player).catch(() => {});
        renderSlider();
        refreshModalBody(spell);
        showFeedback('Spell learned!', false);
      } else {
        showFeedback(result?.message || 'Research failed', true);
        const btn = getSheetBody().querySelector('#detail-research-btn');
        if (btn) { btn.disabled = false; btn.textContent = 'Research Spell'; }
      }
    } catch (err) {
      showFeedback(err.message || 'Research failed', true);
      const btn = getSheetBody().querySelector('#detail-research-btn');
      if (btn) { btn.disabled = false; btn.textContent = 'Research Spell'; }
    }
  }

  function setTier(tier) {
    tier = Math.max(1, Math.min(4, tier));
    if (tier === activeTier) return;
    playPageTurnSound();
    activeTier    = tier;
    activeSpellId = null;
    tierTabs.querySelectorAll('.tier-tab').forEach(t =>
      t.classList.toggle('tier-tab--active', Number(t.dataset.tier) === tier));
    renderSlider();
    closeSheet();
  }

  tierTabs.querySelectorAll('.tier-tab').forEach(tab => {
    tab.addEventListener('click', () => setTier(Number(tab.dataset.tier)));
  });

  // Most of the game switches views by swiping; the spell tome's tiers are tabs,
  // and testers tried to swipe them. Let a horizontal swipe change tier too.
  let touchX = 0, touchY = 0, swiping = false;
  sliderWrap.addEventListener('touchstart', e => {
    touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; swiping = false;
  }, { passive: true });
  sliderWrap.addEventListener('touchmove', e => {
    const dx = Math.abs(e.touches[0].clientX - touchX);
    const dy = Math.abs(e.touches[0].clientY - touchY);
    if (dx > dy && dx > 8) swiping = true;
  }, { passive: true });
  sliderWrap.addEventListener('touchend', e => {
    if (!swiping) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) < 40) return;
    setTier(activeTier + (dx < 0 ? 1 : -1)); // swipe left → next tier
  }, { passive: true });

  async function init() {
    try {
      const [structData, researchData, inventory] = await Promise.all([
        structuresCache.get(player.chat_id),
        api(`/spells/research?chat_id=${player.chat_id}`),
        resourceCache.get(player.chat_id),
      ]);

      throneLevel   = structData?.buildings_data?.slot_0?.level ?? 0;
      learnedSpells = Array.isArray(researchData)
        ? researchData
        : (researchData?.researched_spells || []);

      const find = name => inventory.find(r => r.item === name) || { amount: 0 };
      playerCrystals = {
        Crystals_Life:   find('Crystals_Life').amount,
        Crystals_Fire:   find('Crystals_Fire').amount,
        Crystals_Death:  find('Crystals_Death').amount,
        Crystals_Nature: find('Crystals_Nature').amount,
        Crystals_Frost:  find('Crystals_Frost').amount,
      };

      renderSlider();
    } catch (err) {
      console.error('Spell tome init failed:', err);
      slider.innerHTML = `<div class="spells-empty">Failed to load spells.</div>`;
    }
  }

  init();
}