import { api, refreshResourceBar } from '../main.js';
import { SPELLS }                  from '../../data/spells.js';
import { CRYSTAL_ICONS, applyBackground } from '../utils.js';

export function renderSpellTome(root, { player }) {
  applyBackground(root, player.faction, 'spells');

  root.innerHTML = `
    <div class="screen screen-spelltome">
      <main class="spelltome-main">
        <div class="tier-tabs" id="tier-tabs">
          <button class="tier-tab tier-tab--active" data-tier="1">Tier I</button>
          <button class="tier-tab" data-tier="2">Tier II</button>
          <button class="tier-tab" data-tier="3">Tier III</button>
        </div>

        <div class="spelltome-body">
          <div class="spells-slider-wrap" id="spells-slider-wrap">
            <div class="spells-slider" id="spells-slider"></div>
          </div>

          <div class="spell-detail-panel" id="spell-detail-panel">
            <div class="spell-detail-empty">Select a spell to see details</div>
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
  const detailPanel = root.querySelector('#spell-detail-panel');
  const tierTabs    = root.querySelector('#tier-tabs');

  function costHtml(spell) {
    let parts = '';
    for (const [type, amt] of Object.entries(spell.cost.crystals || {})) {
      if (amt > 0) parts += `<span class="spell-cost-item"><span>${CRYSTAL_ICONS[type] || '💎'}</span>${amt}</span>`;
    }
    return parts || '—';
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
      if (isLearned)                                  cardCls += ' spell-card--learned';
      if (!tierUnlocked)                              cardCls += ' spell-card--locked';
      if (isActive)                                   cardCls += ' spell-card--active';
      if (tierUnlocked && !isLearned && !affordable)  cardCls += ' spell-card--unaffordable';

      const typeColor = spell.effect_type === 'buff' ? 'spell-card-type--buff' : 'spell-card-type--debuff';

      return `
        <div class="${cardCls}" data-spell-id="${spell.id}">
          ${isLearned    ? '<div class="spell-card-learned-ring"></div>'          : ''}
          ${!tierUnlocked ? '<div class="spell-card-lock-overlay"><span>🔒</span></div>' : ''}
          <div class="spell-card-icon">${spell.icon}</div>
          <div class="spell-card-name">${spell.name}</div>
          <div class="spell-card-type ${typeColor}">${spell.effect_type}</div>
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
          clearDetail();
          return;
        }
        activeSpellId = spellId;
        renderSlider();
        showDetail(spell);
      });
    });
  }

  function showDetail(spell) {
    const isLearned    = learnedSpells.includes(spell.id);
    const affordable   = canAfford(spell);
    const tierUnlocked = throneLevel >= spell.tier;
    const canResearch  = tierUnlocked && !isLearned && affordable;

    let costItemsHtml = '';
    for (const [type, amt] of Object.entries(spell.cost.crystals || {})) {
      if (amt > 0) costItemsHtml += `<span class="spell-detail-cost-item">${CRYSTAL_ICONS[type] || '💎'} ${amt}</span>`;
    }
    if (!costItemsHtml) costItemsHtml = '<span class="spell-detail-cost-item">Free</span>';

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

    const typeColor = spell.effect_type === 'buff' ? 'spell-detail-type-chip--buff' : 'spell-detail-type-chip--debuff';

    detailPanel.innerHTML = `
      <div class="spell-detail-inner">
        <div class="spell-detail-header">
          <div class="spell-detail-big-icon">${spell.icon}</div>
          <div class="spell-detail-title">
            <div class="spell-detail-name">${spell.name}</div>
            <div class="spell-detail-meta">
              <span class="spell-detail-rank-chip">Tier ${spell.tier}</span>
              <span class="spell-detail-type-chip ${typeColor}">${spell.effect_type}</span>
            </div>
          </div>
          <div class="spell-detail-cost-col">
            <div class="spell-detail-cost-label">Cost</div>
            <div class="spell-detail-cost-items">${costItemsHtml}</div>
          </div>
        </div>
        <div class="spell-detail-desc">${spell.description}</div>
        <div class="spell-detail-action">
          ${actionHtml}
          <div class="research-feedback" id="research-feedback" style="display:none"></div>
        </div>
      </div>
    `;

    const detailBtn = root.querySelector('#detail-research-btn');
    if (detailBtn) {
      detailBtn.addEventListener('click', async () => {
        detailBtn.disabled    = true;
        detailBtn.textContent = '…';
        await doResearch(spell);
      });
    }
  }

  function clearDetail() {
    detailPanel.innerHTML = '<div class="spell-detail-empty">Select a spell to see details</div>';
  }

  function showFeedback(msg, isError) {
    const el = root.querySelector('#research-feedback');
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
        showDetail(spell);
        showFeedback('Spell learned!', false);
      } else {
        showFeedback(result?.message || 'Research failed', true);
        const btn = root.querySelector('#detail-research-btn');
        if (btn) { btn.disabled = false; btn.textContent = 'Research Spell'; }
      }
    } catch (err) {
      showFeedback(err.message || 'Research failed', true);
      const btn = root.querySelector('#detail-research-btn');
      if (btn) { btn.disabled = false; btn.textContent = 'Research Spell'; }
    }
  }

  tierTabs.querySelectorAll('.tier-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTier    = parseInt(tab.dataset.tier);
      activeSpellId = null;
      tierTabs.querySelectorAll('.tier-tab').forEach(t => t.classList.remove('tier-tab--active'));
      tab.classList.add('tier-tab--active');
      renderSlider();
      clearDetail();
    });
  });

  async function init() {
    try {
      const [structData, researchData, inventory] = await Promise.all([
        api(`/structures?chat_id=${player.chat_id}`),
        api(`/spells/research?chat_id=${player.chat_id}`),
        api(`/inventory?chat_id=${player.chat_id}&type=resource`),
      ]);

      throneLevel   = structData?.buildings_data?.slot_0?.level || 1;
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