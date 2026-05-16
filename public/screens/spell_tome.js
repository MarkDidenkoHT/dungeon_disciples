import { api }      from '../main.js';
import { navigate } from '../main.js';
import { SPELLS }   from '../../data/spells.js';

const CRYSTAL_ICONS = {
  Crystals_Life:   '🟢',
  Crystals_Fire:   '🔴',
  Crystals_Death:  '🟣',
  Crystals_Frost:  '🔵',
  Crystals_Nature: '🟡',
};

export function renderSpellTome(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-spelltome">
      <main class="spelltome-main">
        <div class="spelltome-header">
          <span class="spelltome-title">📖 Spell Tome</span>
          <span class="spelltome-faction">${player.faction}</span>
          <span class="spelltome-mana" id="spelltome-mana">
            <span class="spelltome-mana-icon">🔮</span>
            <span id="mana-val">…</span>
          </span>
        </div>

        <div class="spelltome-body">
          <div id="spells-list-wrap" class="spells-list-wrap"></div>
          <div class="spell-detail-panel" id="spell-detail-panel">
            <div class="spell-detail-empty">Tap a spell to see details</div>
          </div>
        </div>
      </main>

      <nav class="bottom-nav">
        <button class="nav-btn" data-screen="castle">Castle</button>
        <button class="nav-btn" data-screen="roster">Roster</button>
        <button class="nav-btn" data-screen="embark">Embark</button>
        <button class="nav-btn active" data-screen="spells">Spells</button>
      </nav>
    </div>
  `;

  let playerMana      = 0;
  let learnedSpells   = [];
  let activeSpellId   = null;
  const factionSpells = SPELLS[player.faction] || [];

  const listWrap   = root.querySelector('#spells-list-wrap');
  const detailPanel = root.querySelector('#spell-detail-panel');

  function costHtml(spell) {
    let parts = `<span class="spell-cost-item"><span>🔮</span>${spell.cost.mana}</span>`;
    for (const [type, amt] of Object.entries(spell.cost.crystals || {})) {
      if (amt > 0) parts += `<span class="spell-cost-item"><span>${CRYSTAL_ICONS[type] || '💎'}</span>${amt}</span>`;
    }
    return parts;
  }

  function canAfford(spell) {
    if (playerMana < spell.cost.mana) return false;
    for (const [, amt] of Object.entries(spell.cost.crystals || {})) {
      if (amt > 0) return false;
    }
    return true;
  }

  function updateManaDisplay() {
    root.querySelector('#mana-val').textContent = playerMana;
  }

  function renderList() {
    const learned     = factionSpells.filter(s => learnedSpells.includes(s.id));
    const available   = factionSpells.filter(s => !learnedSpells.includes(s.id));

    let html = '';

    if (learned.length) {
      html += `<div class="spells-section-label">Learned</div><div class="spells-list" id="section-learned">`;
      for (const spell of learned) {
        html += spellRowHtml(spell, true);
      }
      html += `</div>`;
    }

    if (available.length) {
      html += `<div class="spells-section-label">Available to Research</div><div class="spells-list" id="section-available">`;
      for (const spell of available) {
        const affordable = canAfford(spell);
        html += spellRowHtml(spell, false, affordable);
      }
      html += `</div>`;
    }

    if (!factionSpells.length) {
      html = `<div class="spells-empty">No spells available for this faction.</div>`;
    }

    listWrap.innerHTML = html;
    attachRowEvents();
  }

  function spellRowHtml(spell, isLearned, affordable) {
    const isActive = activeSpellId === spell.id;
    let cls = 'spell-row';
    if (isLearned)         cls += ' spell-row--learned';
    if (!isLearned && !affordable) cls += ' spell-row--unavailable';
    if (isActive)          cls += ' spell-row--active';

    return `
      <div class="${cls}" data-spell-id="${spell.id}">
        <div class="spell-row-icon">${spell.icon}</div>
        <div class="spell-row-body">
          <div class="spell-row-name">
            ${spell.name}
            <span class="spell-row-rank">R${spell.rank}</span>
            ${isLearned ? '<span class="spell-row-learned-badge">✓ Learned</span>' : ''}
          </div>
          <div class="spell-row-cost">${costHtml(spell)}</div>
        </div>
        ${!isLearned ? `
        <div class="spell-row-action">
          <button class="research-btn ${affordable ? '' : 'research-btn--disabled'}"
                  data-spell-id="${spell.id}"
                  ${affordable ? '' : 'disabled'}>
            Research
          </button>
        </div>` : ''}
      </div>
    `;
  }

  function showDetail(spell) {
    const isLearned  = learnedSpells.includes(spell.id);
    const affordable = canAfford(spell);

    let paramsHtml = '';
    if (spell.params && Object.keys(spell.params).length) {
      const rows = [];
      if (spell.params.damage)   rows.push(['Damage',   `${spell.params.damage}${spell.params.damage_type ? ' ' + spell.params.damage_type : ''}`]);
      if (spell.params.heal)     rows.push(['Healing',  spell.params.heal]);
      if (spell.params.absorb)   rows.push(['Shield',   `${spell.params.absorb} for ${spell.params.duration || 1} turns`]);
      if (spell.params.splash)   rows.push(['Area',     'All enemies']);
      if (spell.params.status)   rows.push(['Applies',  spell.params.status]);

      if (rows.length) {
        paramsHtml = `<div class="spell-detail-params">
          ${rows.map(([label, val]) => `
            <div class="spell-detail-param-row">
              <span class="spell-detail-param-label">${label}</span>
              <span class="spell-detail-param-val">${val}</span>
            </div>`).join('')}
        </div>`;
      }
    }

    let costItemsHtml = `<span class="spell-detail-cost-item">🔮 ${spell.cost.mana} Mana</span>`;
    for (const [type, amt] of Object.entries(spell.cost.crystals || {})) {
      if (amt > 0) costItemsHtml += `<span class="spell-detail-cost-item">${CRYSTAL_ICONS[type] || '💎'} ${amt}</span>`;
    }

    detailPanel.innerHTML = `
      <div class="spell-detail-inner">
        <div class="spell-detail-header">
          <div class="spell-detail-big-icon">${spell.icon}</div>
          <div class="spell-detail-title">
            <div class="spell-detail-name">${spell.name}</div>
            <div class="spell-detail-meta">
              <span class="spell-detail-rank-chip">Rank ${spell.rank}</span>
              <span class="spell-detail-type-chip">${spell.effect_type || 'Spell'}</span>
            </div>
          </div>
        </div>

        <div class="spell-detail-desc">${spell.description}</div>

        ${paramsHtml}

        <div class="spell-detail-cost-row">
          <span class="spell-detail-cost-label">Cost</span>
          <div class="spell-detail-cost-items">${costItemsHtml}</div>
        </div>

        <div class="spell-detail-action">
          ${isLearned
            ? `<span class="spell-detail-status spell-detail-status--learned">✓ Already learned</span>`
            : `<button class="research-btn-full" id="detail-research-btn" ${affordable ? '' : 'disabled'}>
                 ${affordable ? 'Research Spell' : 'Not enough Mana'}
               </button>`
          }
          <div class="research-feedback" id="research-feedback" style="display:none"></div>
        </div>
      </div>
    `;

    const detailBtn = root.querySelector('#detail-research-btn');
    if (detailBtn) {
      detailBtn.addEventListener('click', async () => {
        detailBtn.disabled = true;
        detailBtn.textContent = '…';
        await doResearch(spell);
      });
    }
  }

  function clearDetail() {
    activeSpellId = null;
    detailPanel.innerHTML = '<div class="spell-detail-empty">Tap a spell to see details</div>';
  }

  function showFeedback(msg, isError) {
    const el = root.querySelector('#research-feedback');
    if (!el) return;
    el.textContent = msg;
    el.className   = `research-feedback ${isError ? 'research-feedback--error' : 'research-feedback--success'}`;
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
        playerMana -= spell.cost.mana;
        learnedSpells.push(spell.id);
        updateManaDisplay();
        renderList();
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

  function attachRowEvents() {
    listWrap.querySelectorAll('.spell-row').forEach(row => {
      const spellId = row.dataset.spellId;
      const spell   = factionSpells.find(s => s.id === spellId);
      if (!spell) return;

      row.addEventListener('click', e => {
        if (e.target.closest('.research-btn')) return;

        if (activeSpellId === spellId) {
          clearDetail();
          renderList();
          return;
        }

        activeSpellId = spellId;
        renderList();
        showDetail(spell);
      });

      const resBtn = row.querySelector('.research-btn');
      if (resBtn) {
        resBtn.addEventListener('click', async e => {
          e.stopPropagation();
          activeSpellId = spellId;
          renderList();
          showDetail(spell);
          const detailBtn = root.querySelector('#detail-research-btn');
          if (detailBtn && !detailBtn.disabled) {
            detailBtn.disabled = true;
            detailBtn.textContent = '…';
            await doResearch(spell);
          }
        });
      }
    });
  }

  async function init() {
    try {
      const [playerData, researchData] = await Promise.all([
        api(`/player?chat_id=${player.chat_id}`),
        api(`/spells/research?chat_id=${player.chat_id}`),
      ]);

      playerMana    = playerData.mana || 0;
      learnedSpells = Array.isArray(researchData)
        ? researchData
        : (researchData?.researched_spells || []);

      updateManaDisplay();
      renderList();
    } catch (err) {
      console.error('Spell tome init failed:', err);
      listWrap.innerHTML = `<div class="spells-empty">Failed to load spells.</div>`;
    }
  }

  init();

  root.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      const screen = btn.dataset.screen;
      if (screen === 'spells') return;
      navigate(screen, { player });
    });
  });
}