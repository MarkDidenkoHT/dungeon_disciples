import { assetUrl } from '../asset_base.js';
import { api, refreshResourceBar, resourceCache, structuresCache } from '../api.js';
import { SPELLS, SPELL_CATEGORIES } from '../../data/spells.js';
import { CRYSTAL_ICONS, applyBackground, openSheet, closeSheet, getSheetBody, cap, playPageTurnSound, spellName, spellDesc } from '../utils.js';

// The tome is for RESEARCH, and the two non-combat spells (revive and mend) are
// neither researched nor cast from here — every faction starts with both, and
// they are used from a unit's sheet in the castle. A tab listing two spells that
// are always already learned and have no action attached to them is a dead page,
// so the tome shows the combat categories only. Same filter battle-prep applies.
const TOME_CATEGORIES = SPELL_CATEGORIES.filter(c => c.id !== 'non_combat');

// Every user-facing string in this screen, in the same shape the other screens
// use (CASTLE_TEXT and friends) so there is one place to add a language.
const TOME_TEXT = {
  research:      { en: 'Research Spell',        ru: 'Изучить заклинание' },
  noCrystals:    { en: 'Not enough crystals',   ru: 'Недостаточно кристаллов' },
  researchFail:  { en: 'Research failed',       ru: 'Не удалось изучить' },
  emptyCategory: { en: 'No spells in this category.', ru: 'Нет заклинаний в этой категории.' },
  throneRequired: {
    en: tier => `🔒 Throne level ${tier} required`,
    ru: tier => `🔒 Требуется тронный зал ${tier} уровня`,
  },
  types: {
    buff:      { en: 'Buff',      ru: 'Усиление' },
    debuff:    { en: 'Debuff',    ru: 'Ослабление' },
    resurrect: { en: 'Resurrect', ru: 'Воскрешение' },
  },
};

export function renderSpellTome(root, { player }) {
  applyBackground(root, player.faction, 'spells');

  const isRu = player?.settings?.language === 'ru';
  const lang = isRu ? 'ru' : 'en';

  root.innerHTML = `
    <div class="screen screen-spelltome">
      <main class="spelltome-main">
        <div class="tier-tabs" id="tier-tabs">
          ${TOME_CATEGORIES.map((c, i) => `
            <button class="tier-tab${i === 0 ? ' tier-tab--active' : ''}" data-category="${c.id}">${isRu ? c.name_ru : c.name}</button>
          `).join('')}
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
  let activeCategory  = TOME_CATEGORIES[0].id;
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
    return assetUrl(`/assets/icons/spells/${spell.id}.png`);
  }

  function canAfford(spell) {
    for (const [type, amt] of Object.entries(spell.cost.crystals || {})) {
      if (amt > 0 && (playerCrystals[type] || 0) < amt) return false;
    }
    return true;
  }

  function renderSlider() {
    // Tabs are categories now; the lock is per-spell, since the three spells in
    // a combat category unlock at throne 2 / 3 / 4 rather than as a block.
    const catSpells = factionSpells
      .filter(s => s.category === activeCategory)
      .sort((a, b) => a.tier - b.tier);

    if (!catSpells.length) {
      slider.innerHTML = `<div class="spells-empty">${TOME_TEXT.emptyCategory[lang]}</div>`;
      return;
    }

    slider.innerHTML = catSpells.map(spell => {
      const isLearned  = learnedSpells.includes(spell.id);
      const affordable = canAfford(spell);
      const isActive   = activeSpellId === spell.id;
      const unlocked   = throneLevel >= spell.tier;

      let cardCls = 'spell-card';
      if (isLearned)                                       cardCls += ' spell-card--learned';
      if (!unlocked)                                       cardCls += ' spell-card--locked';
      if (isActive)                                        cardCls += ' spell-card--active';
      if (unlocked && !isLearned && !affordable)           cardCls += ' spell-card--unaffordable';

      return `
        <div class="${cardCls}" data-spell-id="${spell.id}">
          ${isLearned ? '<div class="spell-card-learned-ring"></div>' : ''}
          <div class="spell-card-icon">
            <img src="${spellIconUrl(spell)}" alt="${spellName(spell, player)}" onerror="this.style.display='none'">
            ${!isLearned ? `<img src="${assetUrl('/assets/icons/spells/spell_locked.png')}" alt="Locked" class="spell-card-lock-img">` : ''}
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

    // A learned spell has nothing left to act on: no button to press and no
    // failure to report, so the whole action row (and the feedback slot inside
    // it) is dropped rather than rendered holding a redundant "✓ Learned" —
    // the card's checkmark and ring already say it.
    let actionHtml = '';
    if (!isLearned) {
      actionHtml = tierUnlocked
        ? `
        <button class="research-btn-full" id="detail-research-btn" ${canResearch ? '' : 'disabled'}>
          ${canResearch ? TOME_TEXT.research[lang] : TOME_TEXT.noCrystals[lang]}
        </button>
      `
        : `<span class="spell-detail-status spell-detail-status--locked">${TOME_TEXT.throneRequired[lang](spell.tier)}</span>`;
    }

    const typeLabel = TOME_TEXT.types[spell.effect_type]?.[lang] || cap(spell.effect_type || '');

    return `
      <div class="spell-modal-type spell-modal-type--${spell.effect_type}">${typeLabel}</div>
      <div class="spell-modal-desc">${spellDesc(spell, player)}</div>
      ${isLearned ? '' : `
      <div class="spell-detail-action">
        ${actionHtml}
        <div class="research-feedback" id="research-feedback" style="display:none"></div>
      </div>`}
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

  // Failures only — success is communicated by the card's checkmark and the
  // detail's "✓ Learned" status, so there is nothing left to announce.
  function showFeedback(msg) {
    const el = getSheetBody().querySelector('#research-feedback');
    if (!el) return;
    el.textContent   = msg;
    el.className     = 'research-feedback research-feedback--error';
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
        // No success banner: refreshModalBody already swaps the button for the
        // green "✓ Learned" status and the card gains its checkmark. Saying it a
        // third time in words was noise.
        refreshModalBody(spell);
      } else {
        showFeedback(result?.message || TOME_TEXT.researchFail[lang]);
        const btn = getSheetBody().querySelector('#detail-research-btn');
        if (btn) { btn.disabled = false; btn.textContent = TOME_TEXT.research[lang]; }
      }
    } catch (err) {
      showFeedback(err.message || TOME_TEXT.researchFail[lang]);
      const btn = getSheetBody().querySelector('#detail-research-btn');
      if (btn) { btn.disabled = false; btn.textContent = 'Research Spell'; }
    }
  }

  function setCategory(categoryId) {
    if (!categoryId || categoryId === activeCategory) return;
    playPageTurnSound();
    activeCategory = categoryId;
    activeSpellId  = null;
    tierTabs.querySelectorAll('.tier-tab').forEach(t =>
      t.classList.toggle('tier-tab--active', t.dataset.category === categoryId));
    renderSlider();
    closeSheet();
  }

  // Swiping steps one tab along the TOME_CATEGORIES order, stopping at the ends.
  function stepCategory(delta) {
    const i    = TOME_CATEGORIES.findIndex(c => c.id === activeCategory);
    const next = Math.max(0, Math.min(TOME_CATEGORIES.length - 1, i + delta));
    setCategory(TOME_CATEGORIES[next].id);
  }

  tierTabs.querySelectorAll('.tier-tab').forEach(tab => {
    tab.addEventListener('click', () => setCategory(tab.dataset.category));
  });

  // Most of the game switches views by swiping; the spell tome's tabs are tabs,
  // and testers tried to swipe them. Let a horizontal swipe change tab too.
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
    stepCategory(dx < 0 ? 1 : -1); // swipe left → next tab
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