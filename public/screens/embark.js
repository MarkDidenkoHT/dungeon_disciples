import { api, navigate, bootstrapCache } from '../api.js';
import { applyBackground } from '../utils.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';
import { lang } from './settings.js';
import { assetUrl } from '../asset_base.js';
// How many levels each region really has. The REGIONS array below is
// presentation only; the level tables live in data/embark.js and are the single
// source of truth for how many pips a region can ever show.
import { REGIONS as REGION_DEFS } from '../../data/embark.js';

const LEVEL_COUNTS = Object.fromEntries(
  REGION_DEFS.map(r => [r.id, Object.keys(r.difficulties || {}).length]));

// Static UI strings, keyed by language (see lang(player)). Region label/desc live
// on REGIONS with _ru suffixes, following the game's inline-localization rule.
// Per-region glow for the event badge. Not on REGIONS because it is purely a
// presentation choice and the server has no opinion about it.
const REGION_GLOW = {
  crimson_basilica:  '#8b1a1a',   // dark blood red
  glittering_abyss:  '#3a7fa8',
  chamber_of_unrest: '#5a7a4a',
};
const DEFAULT_GLOW = '#c8973a';

const UI_TEXT = {
  eventBadge:      { en: 'Event',                ru: 'Событие' },
  eventEnds:       { en: 'Ends in',              ru: 'Осталось' },
  eventDrops:      { en: 'Drops during the event', ru: 'Выпадает во время события' },
  eventBonus:      { en: 'Bonus',                ru: 'Бонус' },
  eventLevel:      { en: 'Level',                ru: 'Уровень' },
  eventXp:         { en: 'XP',                   ru: 'Опыт' },
  eventGold:       { en: 'Gold',                 ru: 'Золото' },
  eventCrystals:   { en: 'Crystals',             ru: 'Кристаллы' },
  eventEverywhere: { en: 'Everywhere',           ru: 'Везде' },
  eventOver:       { en: 'Ended',                ru: 'Завершено' },
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
  // Each region pays two fixed crystal types now — no random roll.
  guaranteed: (L, crystalName) => L === 'ru'
    ? `Кристаллы: ${crystalName}`
    : `Crystals: ${crystalName}`,
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
    crystal: 'Life & Fire',
    crystal_ru: 'Жизни и Огня',
  },
  {
    id: 'glittering_abyss',
    label: 'Glittering Abyss',
    label_ru: 'Мерцающая бездна',
    icon: '💎',
    description: 'A frozen vault of living crystal — mending geodes, frost-shard casters, and the Prismatic Colossus that slumbers in the dark.',
    description_ru: 'Ледяная сокровищница живого кристалла — исцеляющие жеоды, заклинатели морозных осколков и Призматический колосс, дремлющий во тьме.',
    crystal: 'Frost & Air',
    crystal_ru: 'Мороза и Воздуха',
  },
  {
    id: 'chamber_of_unrest',
    label: 'Chamber Of Unrest',
    label_ru: 'Чертог беспокойства',
    icon: '💀',
    description: 'Sunken crypts of the restless dead — cursed knights, shambling horrors, and Malgrath the Undying, who has already died once.',
    description_ru: 'Затопленные склепы неупокоенных мёртвых — проклятые рыцари, бредущие ужасы и Малграт Неумирающий, что уже умирал однажды.',
    crystal: 'Death & Nature',
    crystal_ru: 'Смерти и Природы',
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

// Region art as the card's full background. The text over it carries its own
// shadow (see .embark-card-label / -desc), so the art is shown clean.
function regionBgStyle(r) {
  return `background-image: url('${assetUrl(`/assets/embark/${r.id}.jpg`)}');`;
}

// `highlightRegions` arrives from the item sheet's material detail: the regions
// that drop the material the player tapped. They flash green for a few seconds
// on arrival, then settle — long enough to notice, short enough not to nag.
export function renderEmbark(root, { player, activeCheck, highlightRegions, highlightMaterial } = {}) {
  applyBackground(root, player.faction, 'embark');

  const L = lang(player);
  const rLabel = r => (L === 'ru' && r.label_ru)       || r.label;
  const rDesc  = r => (L === 'ru' && r.description_ru)  || r.description;
  const rCrystal = r => (L === 'ru' && r.crystal_ru)   || r.crystal;

  // ── Event ────────────────────────────────────────────────────────────────
  // Read from the bootstrap payload, so the banner costs no request of its own.
  // Null whenever nothing is running, which is the common case — every helper
  // below returns empty rather than branching at each call site.
  const activeEvent = () => bootstrapCache.data?.event ?? null;

  function eventEndsInText() {
    const ev = activeEvent();
    if (!ev?.time_to) return '';
    const ms = new Date(ev.time_to).getTime() - Date.now();
    if (ms <= 0) return UI_TEXT.eventOver[L];
    const hours = Math.floor(ms / 3600000);
    const days  = Math.floor(hours / 24);
    if (days >= 1)  return `${UI_TEXT.eventEnds[L]} ${days}${L === 'ru' ? 'д' : 'd'}`;
    return `${UI_TEXT.eventEnds[L]} ${Math.max(1, hours)}${L === 'ru' ? 'ч' : 'h'}`;
  }

  // Top-right corner of the region card, glowing that region's colour.
  function eventBadgeHtml(regionId) {
    const ev = activeEvent();
    if (!ev || !ev.regions?.includes(regionId)) return '';
    const glow = REGION_GLOW[regionId] || DEFAULT_GLOW;
    return `
      <button class="embark-event-badge" data-event-region="${regionId}"
              style="--event-glow:${glow}" title="${ev.name || UI_TEXT.eventBadge[L]}">
        <span class="embark-event-badge-dot"></span>
        <span class="embark-event-badge-text">${UI_TEXT.eventBadge[L]}</span>
      </button>`;
  }

  function openEventSheet(regionId) {
    const ev = activeEvent();
    if (!ev) return;
    const glow = REGION_GLOW[regionId] || DEFAULT_GLOW;

    // What drops where, level by level. Only this region's rows — the badge was
    // tapped on a specific card and that is the question being asked.
    const drops = ev.drops?.[regionId] || {};
    const dropRows = Object.entries(drops)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([lvl, items]) => `
        <div class="event-drop-row">
          <span class="event-drop-level">${UI_TEXT.eventLevel[L]} ${lvl}</span>
          <span class="event-drop-items">${Object.entries(items)
            .map(([id, amt]) => `<span class="event-drop-item">${id.replace(/_/g, ' ')} ×${amt}</span>`)
            .join('')}</span>
        </div>`).join('');

    // Global bonuses and this region's own, listed separately so the player can
    // see that they stack rather than replace.
    const pctRow = (src, label) => {
      const bits = [];
      if (src?.xp_pct)      bits.push(`+${src.xp_pct}% ${UI_TEXT.eventXp[L]}`);
      if (src?.gold_pct)    bits.push(`+${src.gold_pct}% ${UI_TEXT.eventGold[L]}`);
      if (src?.crystal_pct) bits.push(`+${src.crystal_pct}% ${UI_TEXT.eventCrystals[L]}`);
      return bits.length ? `<div class="event-bonus-row"><span>${label}</span><span>${bits.join(', ')}</span></div>` : '';
    };
    const bonusHtml = pctRow(ev.bonus, UI_TEXT.eventEverywhere[L])
                    + pctRow(ev.bonus?.regions?.[regionId], rLabel(REGIONS.find(r => r.id === regionId) || {}) || regionId);

    openModal(ev.name || UI_TEXT.eventBadge[L], `
      <div class="event-sheet" style="--event-glow:${glow}">
        <div class="event-sheet-ends">${eventEndsInText()}</div>
        ${dropRows ? `<div class="event-section-label">${UI_TEXT.eventDrops[L]}</div>${dropRows}` : ''}
        ${bonusHtml ? `<div class="event-section-label">${UI_TEXT.eventBonus[L]}</div>${bonusHtml}` : ''}
      </div>`);
  }

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
      // /bootstrap already carries `progress` — the same players.progress column
      // /progress reads — and the shell has just warmed that cache on the way to
      // this screen. Fetching it again cost a round-trip for a value already in
      // memory, and it was AWAITED before anything was drawn.
      const boot = await bootstrapCache.get(player.chat_id);
      const progress = boot?.progress || {};

      // The reconnect check no longer gates the region list. It answers "is
      // there a battle to return to", which is a modal on top of this screen —
      // waiting for it before drawing meant a second serial round-trip before
      // the player saw anything. Fired here, handled when it lands; the pips
      // re-check at the moment of departure anyway (see the click handler).
      if (activeCheck?.active) {
        showReconnectModal(activeCheck.battle_id, activeCheck.battle_data);
      } else if (!activeCheck) {
        api(`/battle/active?chat_id=${player.chat_id}`)
          .then(resp => { if (resp?.active) showReconnectModal(resp.battle_id, resp.battle_data); })
          .catch(e => console.error('Failed to check active battle:', e));
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
        // Clamped to the levels this region actually has. `progress` is the next
        // playable level and reaches levelCount + 1 once the final level is
        // cleared (so craft gates can require clearing the last one) — without
        // the clamp that extra point would draw a pip for a level that does not
        // exist, and tapping it would be rejected by /battle/create.
        //
        // The count comes from LEVEL_COUNTS, NOT from `r`: the REGIONS array in
        // this file is presentation only (labels, art, blurb) and carries no
        // `difficulties`. Reading it off `r` silently yielded 1 for every region
        // and collapsed every map to a single pip.
        const maxLevel = Math.min(progress[r.id] ?? 1, LEVEL_COUNTS[r.id] || 1);
        const levels   = Array.from({ length: maxLevel }, (_, i) => i + 1);
        return `
          <div class="embark-region-block">
            <div class="embark-card" data-id="${r.id}" style="${regionBgStyle(r)}">
              ${eventBadgeHtml(r.id)}
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

      // Flag the regions carrying the material the player came here for.
      if (Array.isArray(highlightRegions) && highlightRegions.length) {
        const HIGHLIGHT_MS = 3000;
        for (const id of highlightRegions) {
          const card = root.querySelector(`.embark-card[data-id="${id}"]`);
          if (!card) continue;
          card.classList.add('embark-card--highlight');
          setTimeout(() => card.classList.remove('embark-card--highlight'), HIGHLIGHT_MS);
        }
        const first = root.querySelector('.embark-card--highlight');
        first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }

      // Bound before the level pips and stopping propagation: the badge sits on
      // the region card, and without this a tap would open the sheet AND count
      // as picking the region.
      root.querySelectorAll('.embark-event-badge').forEach(badge => {
        badge.addEventListener('click', e => {
          e.stopPropagation();
          e.preventDefault();
          openEventSheet(badge.dataset.eventRegion);
        });
      });

      root.querySelectorAll('.embark-level-pip').forEach(pip => {
        pip.addEventListener('click', async () => {
          // Re-check at the moment of departure, not just on screen load. The
          // load-time modal can be dismissed by hand (desktop Telegram exposes
          // devtools), and the server would then reject /battle/create with a
          // bare error after the player had already built a formation. Send
          // them back to reconnect-or-abandon instead, penalty included.
          try {
            const active = await api(`/battle/active?chat_id=${player.chat_id}`);
            if (active?.active) {
              showReconnectModal(active.battle_id, active.battle_data);
              return;
            }
          } catch (e) {
            console.error('Failed to check active battle:', e);
          }
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