import { api, navigate } from '../api.js';
import { applyBackground } from '../utils.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';
import { lang } from './settings.js';

// Static UI strings, keyed by language (see lang(player)). Region label/desc live
// on REGIONS with _ru suffixes, following the game's inline-localization rule.
const UI_TEXT = {
  selectRegion:    { en: 'Select Region',        ru: 'Выберите регион' },
  checking:        { en: 'Checking active battles…', ru: 'Проверка активных боёв…' },
  reconnectTitle:  { en: 'Reconnect to Battle',   ru: 'Вернуться в бой' },
  reconnectBody:   {
    en: 'You have an unfinished battle in progress. Reconnect to continue where you left off, or abandon it and start a new fight.',
    ru: 'У вас есть незавершённый бой. Вернитесь, чтобы продолжить с того места, где остановились, или бросьте его и начните новый.',
  },
  abandonWarning:  {
    en: 'Abandoning costs you the field: the fallen stay dead, and every survivor walks away at 1 HP.',
    ru: 'Бросить бой — значит уступить поле: павшие остаются мёртвыми, а выжившие уходят с 1 HP.',
  },
  abandon:         { en: 'Abandon',   ru: 'Бросить' },
  reconnect:       { en: 'Reconnect', ru: 'Вернуться' },
  levelAria:       { en: 'Level',     ru: 'Уровень' },
  // Guaranteed-crystal line; crystalName is already localized per region.
  guaranteed: (L, crystalName) => L === 'ru'
    ? `Гарантировано: кристаллы ${crystalName} + 1 случайный`
    : `Guaranteed: ${crystalName} Crystals + 1 random`,
};

// Levels that end in a boss fight — highlighted red on the level row.
const BOSS_LEVELS = [3, 6];

// Each region card uses /assets/embark/<id>.jpg as its full background (see the
// regionBgStyle scrim below). Descriptions and the guaranteed crystal match the
// region's real roster and rewards (see data/units.js + data/embark.js).
const REGIONS = [
  {
    id: 'crimson_basilica',
    label: 'Crimson Basilica',
    label_ru: 'Багровая базилика',
    icon: '🩸',
    description: 'A blood-soaked cathedral of the Aggrail faithful — zealous heralds, the devoted, and Sister Aldra, who bleeds for her god.',
    description_ru: 'Залитый кровью собор верных Аграилу — рьяные глашатаи, преданные и Сестра Алдра, что кровоточит во славу своего бога.',
    crystal: 'Life',
    crystal_ru: 'Жизни',
  },
  {
    id: 'glittering_abyss',
    label: 'Glittering Abyss',
    label_ru: 'Мерцающая бездна',
    icon: '💎',
    description: 'A frozen vault of living crystal — mending geodes, frost-shard casters, and the Prismatic Colossus that slumbers in the dark.',
    description_ru: 'Ледяная сокровищница живого кристалла — исцеляющие жеоды, заклинатели морозных осколков и Призматический колосс, дремлющий во тьме.',
    crystal: 'Air',
    crystal_ru: 'Воздуха',
  },
  {
    id: 'chamber_of_unrest',
    label: 'Chamber Of Unrest',
    label_ru: 'Чертог беспокойства',
    icon: '💀',
    description: 'Sunken crypts of the restless dead — cursed knights, shambling horrors, and Malgrath the Undying, who has already died once.',
    description_ru: 'Затопленные склепы неупокоенных мёртвых — проклятые рыцари, бредущие ужасы и Малграт Неумирающий, что уже умирал однажды.',
    crystal: 'Death',
    crystal_ru: 'Смерти',
  },
  {
    id: 'pvp',
    label: 'PvP Arena',
    label_ru: 'Арена PvP',
    icon: '⚔',
    description: 'Challenge other players in ranked combat. Coming soon.',
    description_ru: 'Сразитесь с другими игроками в рейтинговых боях. Скоро.',
    crystal: null,
    comingSoon: true,
  },
];

// Region art as the card's full background, under a dark scrim so the overlaid
// text stays readable. If the art is missing the browser just drops the image
// layer and the scrim tints the card's base surface — no broken state.
function regionBgStyle(r) {
  return `background-image: linear-gradient(rgba(12,15,22,.60), rgba(12,15,22,.84)), url('/assets/embark/${r.id}.jpg');`;
}

export function renderEmbark(root, { player, activeCheck } = {}) {
  applyBackground(root, player.faction, 'embark');

  const L = lang(player);
  const rLabel = r => (L === 'ru' && r.label_ru)       || r.label;
  const rDesc  = r => (L === 'ru' && r.description_ru)  || r.description;
  const rCrystal = r => (L === 'ru' && r.crystal_ru)   || r.crystal;

  root.innerHTML = `
    <div class="screen screen-embark">
      <main class="embark-main">
        <div class="embark-header">
          <h2>${UI_TEXT.selectRegion[L]}</h2>
        </div>
        <div class="embark-regions-grid" id="embark-regions">
          <div style="color:var(--muted);text-align:center;padding:2rem">${UI_TEXT.checking[L]}</div>
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
    openModal(UI_TEXT.reconnectTitle[L], `
      <div style="display:flex;flex-direction:column;gap:1rem;">
        <div style="color:var(--muted);font-size:.95rem;line-height:1.4;">
          ${UI_TEXT.reconnectBody[L]}
        </div>
        <div style="color:var(--danger);font-size:.85rem;line-height:1.4;">
          ${UI_TEXT.abandonWarning[L]}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:.75rem;flex-wrap:wrap;">
          <button id="modal-abandon-btn" class="action-btn action-btn--cancel" type="button">${UI_TEXT.abandon[L]}</button>
          <button id="modal-reconnect-btn" class="action-btn" type="button">${UI_TEXT.reconnect[L]}</button>
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
              <div class="embark-card embark-card--coming-soon" data-id="${r.id}" style="${regionBgStyle(r)}">
                <div class="embark-card-info">
                  <span class="embark-card-label">${rLabel(r)}</span>
                  <span class="embark-card-desc">${rDesc(r)}</span>
                </div>
              </div>
            </div>
          `;
        }
        const maxLevel = progress[r.id] ?? 1;
        const levels   = Array.from({ length: maxLevel }, (_, i) => i + 1);
        return `
          <div class="embark-region-block">
            <div class="embark-card" data-id="${r.id}" style="${regionBgStyle(r)}">
              <div class="embark-card-info">
                <span class="embark-card-label">${rLabel(r)}</span>
                <span class="embark-card-desc">${rDesc(r)}</span>
                <span class="embark-card-crystal">${UI_TEXT.guaranteed(L, rCrystal(r))}</span>
              </div>
            </div>
            <div class="embark-level-row">
              ${levels.map(lv => `
                <button
                  class="embark-level-pip${BOSS_LEVELS.includes(lv) ? ' embark-level-pip--boss' : ''}"
                  data-region="${r.id}"
                  data-level="${lv}"
                  data-label="${rLabel(r)}"
                  aria-label="${UI_TEXT.levelAria[L]} ${lv}"
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

      // Deliberately gated on the castle step, not the roster ones: onboarding
      // order is enforced by navigation (castle -> roster -> here), so a player
      // who reaches embark another way still gets this step instead of being
      // stranded behind a roster step that never ran.
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