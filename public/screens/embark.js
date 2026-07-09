import { api, navigate } from '../api.js';
import { applyBackground } from '../utils.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';

const REGIONS = [
  {
    id: 'crimson_basilica',
    label: 'Crimson Basilica',
    icon: '🌲',
    description: 'Ancient woodland teeming with feral beasts, overgrown guardians, and things that should not breathe.',
    crystal: 'Nature',
  },
  {
    id: 'mountains_of_valdrek',
    label: 'Mountains of Valdrek',
    icon: '⛰️',
    description: 'Wind-scoured peaks ruled by stone colossi, frost shamans, and a king that does not die.',
    crystal: 'Air',
  },
  {
    id: 'dungeons_of_malgrath',
    label: 'Dungeons of Malgrath',
    icon: '💀',
    description: 'Sunken halls choked with undead, cursed knights, and Malgrath himself — who has already died once.',
    crystal: 'Death',
  },
  {
    id: 'pvp',
    label: 'PvP Arena',
    icon: '⚔',
    description: 'Challenge other players in ranked combat. Coming soon.',
    crystal: null,
    comingSoon: true,
  },
];

export function renderEmbark(root, { player, activeCheck } = {}) {
  applyBackground(root, player.faction, 'embark');

  root.innerHTML = `
    <div class="screen screen-embark">
      <main class="embark-main">
        <div class="embark-header">
          <h2>Select Region</h2>
        </div>
        <div class="embark-regions-grid" id="embark-regions">
          <div style="color:var(--muted);text-align:center;padding:2rem">Checking active battles…</div>
        </div>

      </main>

      <div id="modal-overlay" class="modal-overlay hidden">
        <div class="modal">
          <div class="modal-header">
            <span id="modal-title"></span>
            <button id="modal-close" aria-label="Close">✕</button>
          </div>
          <div id="modal-body" class="modal-body"></div>
        </div>
      </div>
    </div>
  `;

  let modalClosable  = true;

  const overlay       = root.querySelector('#modal-overlay');
  const modalBody     = root.querySelector('#modal-body');
  const modalTitle    = root.querySelector('#modal-title');
  const modalCloseBtn = root.querySelector('#modal-close');

  function openModal(title, bodyHtml, { closable = true } = {}) {
    if (!overlay || !modalBody || !modalTitle) return;
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalClosable = closable;
    if (modalCloseBtn) {
      modalCloseBtn.style.display = closable ? '' : 'none';
      modalCloseBtn.setAttribute('aria-hidden', String(!closable));
    }
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(force = false) {
    if (!overlay || (!modalClosable && !force)) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
    modalClosable = true;
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeModal);
    if (overlay) overlay.addEventListener('click', (e) => {
      if (modalClosable && e.target === overlay) closeModal();
    });
  }

  function showReconnectModal(battle_id, battle_data) {
    openModal('Reconnect to Battle', `
      <div style="display:flex;flex-direction:column;gap:1rem;">
        <div style="color:var(--muted);font-size:.95rem;line-height:1.4;">
          You have an unfinished battle in progress. Reconnect to continue where you left off, or abandon it and start a new fight.
        </div>
        <div style="display:flex;justify-content:flex-end;gap:.75rem;flex-wrap:wrap;">
          <button id="modal-abandon-btn" class="action-btn action-btn--cancel" type="button">Abandon</button>
          <button id="modal-reconnect-btn" class="action-btn" type="button">Reconnect</button>
        </div>
      </div>
    `, { closable: false });

    root.querySelector('#modal-reconnect-btn')?.addEventListener('click', async () => {
      const region_id = battle_data.region_id;
      const level     = battle_data.level;
      if (!region_id) return;
      try {
        const { state, logs } = await api(`/battle/state?battle_id=${encodeURIComponent(battle_id)}&chat_id=${encodeURIComponent(player.chat_id)}`);
        navigate('battle', { player, battle_id, reconnect: true, snapshot: state, logs, region_id, level });
      } catch (err) {
        console.error('Failed to reconnect:', err);
      }
    });

    root.querySelector('#modal-abandon-btn')?.addEventListener('click', async () => {
      try { await api('/battle/end', { battle_id, chat_id: player.chat_id }); } catch (_) {}
      closeModal(true);
    });
  }



  async function loadRegions() {
    try {
      const progress = await api(`/progress?chat_id=${player.chat_id}`);
      let activeResp = activeCheck;
      if (!activeResp) {
        try {
          activeResp = await api(`/battle/active?chat_id=${player.chat_id}`);
        } catch (e) {
          console.error('Failed to check active battle:', e);
        }
      }

      if (activeResp && activeResp.active) {
        showReconnectModal(activeResp.battle_id, activeResp.battle_data);
      }

      root.querySelector('#embark-regions').innerHTML = REGIONS.map(r => {
        if (r.comingSoon) {
          return `
            <div class="embark-region-block embark-region-block--coming-soon">
              <div class="embark-card embark-card--coming-soon" data-id="${r.id}">
                <span class="embark-card-icon">${r.icon}</span>
                <div class="embark-card-info">
                  <span class="embark-card-label">${r.label}</span>
                  <span class="embark-card-desc">${r.description}</span>
                </div>
              </div>
            </div>
          `;
        }
        const maxLevel = progress[r.id] ?? 1;
        const levels   = Array.from({ length: maxLevel }, (_, i) => i + 1);
        return `
          <div class="embark-region-block">
            <div class="embark-card" data-id="${r.id}">
              <span class="embark-card-icon">${r.icon}</span>
              <div class="embark-card-info">
                <span class="embark-card-label">${r.label}</span>
                <span class="embark-card-desc">${r.description}</span>
                <span class="embark-card-crystal">Guaranteed: ${r.crystal} Crystals + 1 random</span>
              </div>
            </div>
            <div class="embark-level-row">
              ${levels.map(lv => `
                <button
                  class="embark-level-pip"
                  data-region="${r.id}"
                  data-level="${lv}"
                  data-label="${r.label}"
                  aria-label="Level ${lv}"
                >${lv}</button>
              `).join('')}
            </div>
          </div>
        `;
      }).join('');

      root.querySelectorAll('.embark-level-pip').forEach(pip => {
        pip.addEventListener('click', () => {
          markTutorialDone(player, 'embark_region');
          navigate('battle-prep', { player, region_id: pip.dataset.region, level: parseInt(pip.dataset.level) });
        });
      });

      if (isTutorialDone(player, 'second_building') && !isTutorialDone(player, 'embark_region')) {
        const firstPip = root.querySelector('.embark-level-pip[data-region="crimson_basilica"][data-level="1"]');
        if (firstPip) showTutorialSpotlight(player, 'embark_region', firstPip);
      } else {
        hideTutorial();
      }
    } catch (err) {
      console.error('Failed to load regions:', err);
    }
  }

  loadRegions();
}