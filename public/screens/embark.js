import { api, navigate, bootstrapCache } from '../api.js';
import { applyBackground, buildUnitCard, handleUnitInspect, resolveUnitDef } from '../utils.js';
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
  eventUnlocks: { en: 'Unlocks', ru: 'Открывает' },
    eventBack:    { en: 'Back', ru: 'Назад' },
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
  pvpSoon:         { en: 'Soon',      ru: 'Скоро' },
  comingSoonTitle: { en: 'Coming soon', ru: 'Скоро' },
  comingSoonBody:  {
    en: 'This mode is not open yet. It is being built — check back soon.',
    ru: 'Этот режим ещё не открыт. Он в разработке — загляните позже.',
  },
  regionsAria:     { en: 'Regions',   ru: 'Регионы' },
  arenaAria:       { en: 'Arena',     ru: 'Арена' },
  // Guaranteed-crystal line; crystalName is already localized per region.
  // Each region pays two fixed crystal types now — no random roll.
  guaranteed: (L, crystalName) => L === 'ru'
    ? `Кристаллы: ${crystalName}`
    : `Crystals: ${crystalName}`,
};

// Levels that end in a boss fight — highlighted red on the level row.
const BOSS_LEVELS = [3, 6, 10];

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
    description: 'Face other players in the arena — quick matches, ranked seasons and tournaments.',
    description_ru: 'Сразитесь с другими игроками на арене — быстрые бои, рейтинговые сезоны и турниры.',
    crystal: null,
    // Not a region: tapping it slides to the arena page rather than departing.
    toArena: true,
  },
];

// ── PvP ──────────────────────────────────────────────────────────────────────
// The arena is the SECOND page of this screen, not a screen of its own: it is
// the other place a player departs from, and it reads that way with the same
// cards, the same arrows and the same track the castle uses for its two layers.
//
// Art follows the region convention — /assets/embark/<id>.jpg — so a mode gets
// its picture by dropping the file in and flipping `art` on. Until then the card
// paints the gradient in .embark-card--pvp rather than an empty box; the inline
// background is left off entirely, because an inline url() to a file that does
// not exist beats the stylesheet and leaves a blank card.
const PVP_MODES = [
  {
    id: 'pvp_quick',
    label: 'Quick Match',
    label_ru: 'Быстрый бой',
    description: 'Unranked duels against a party close to your own strength. Nothing is at stake but the win.',
    description_ru: 'Нерейтинговые дуэли против отряда, близкого вам по силе. На кону только победа.',
    live: true,
  },
  {
    id: 'pvp_ranked',
    label: 'Ranked',
    label_ru: 'Рейтинговый бой',
    description: 'Season duels that move your rating, and your faction\u2019s standing with it.',
    description_ru: 'Сезонные дуэли, влияющие на ваш рейтинг и на положение вашей фракции.',
    live: false,
  },
  {
    id: 'pvp_tournament',
    label: 'Tournament',
    label_ru: 'Турнир',
    description: 'Bracketed runs on a schedule. Win through the bracket, claim a shard of the crown.',
    description_ru: 'Турнирная сетка по расписанию. Пройдите её до конца и заберите осколок короны.',
    live: false,
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

  // The art file for an event is named after the event: "The Blood Vigil" is
  // assets/icons/events/blood_vigil.png. Events are rows in a table typed by
  // hand, so nothing enforces a slug column — deriving it from the name means a
  // new event only needs its art dropped in under the matching filename.
  //
  // A leading "The" is dropped because it is part of the title, not the subject.
  function eventIconKey(ev) {
    if (ev?.icon) return ev.icon;               // explicit wins, if ever set
    return String(ev?.name || '')
      .trim()
      .toLowerCase()
      .replace(/^the\s+/, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  // The description column is localised the way everything else on the screen
  // is: { en, ru }. A plain string is still accepted so an event written before
  // this reads as English rather than as nothing.
  function eventDescription(ev) {
    const d = ev?.description;
    if (!d) return '';
    if (typeof d === 'string') return d;
    return d[L] || d.en || '';
  }

  // Top-right corner of the region card, glowing that region's colour.
  function eventBadgeHtml(regionId) {
    const ev = activeEvent();
    if (!ev || !ev.regions?.includes(regionId)) return '';
    const glow = REGION_GLOW[regionId] || DEFAULT_GLOW;
    const label = ev.name || UI_TEXT.eventBadge[L];
    const key   = eventIconKey(ev);
    // The dot is the fallback, not decoration: an event whose art has not been
    // added yet still needs something round, glowing and tappable in the corner
    // rather than an empty box. `onerror` hides the broken image and reveals it.
    return `
      <button class="embark-event-badge" data-event-region="${regionId}"
              style="--event-glow:${glow}" title="${label}" aria-label="${label}">
        <img class="embark-event-badge-img"
             src="${assetUrl(`/assets/icons/events/${key}.png`)}" alt=""
             onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
        <span class="embark-event-badge-dot"></span>
      </button>`;
  }

  // Pretty name for a trophy id. Trophies have no def table of their own, so the
  // id IS the name — bloodied_brooch reads as Bloodied Brooch.
  function trophyLabel(id) {
    return String(id).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // What this event's trophy is FOR. A drop table on its own tells a player what
  // falls out, not why they should care — the brooch exists to raise one
  // mercenary, and that is the reason to run the event before it closes.
  function eventPayoffHtml(ev) {
    const merc = ev?.payoff;
    if (!merc) return '';
    const label = (L === 'ru' ? merc.label_ru : merc.label) || merc.label;
    const cost  = Object.entries(merc.cost || {})
      .map(([id, amt]) => `${trophyLabel(id)} \u00d7${amt}`).join(' + ');
    return `
      <div class="embark-event-section-label">${UI_TEXT.eventUnlocks[L]}</div>
      <button class="embark-event-payoff" data-payoff-unit="${merc.unit_id}"
              aria-label="${label}">
        <img class="embark-event-payoff-art"
             src="${assetUrl(`/assets/character_portraits/p_${merc.unit_id}.png`)}"
             alt="" onerror="this.style.display='none'">
        <div class="embark-event-payoff-text">
          <span class="embark-event-payoff-name">${label}</span>
          <span class="embark-event-payoff-cost">${cost}</span>
        </div>
        <span class="embark-event-payoff-chev">\u203a</span>
      </button>`;
  }


  function openEventSheet(regionId) {
    const ev = activeEvent();
    if (!ev) return;
    const glow = REGION_GLOW[regionId] || DEFAULT_GLOW;

    // What drops where, level by level. Only this region's rows — the badge was
    // tapped on a specific card and that is the question being asked.
    //
    // Laid out as one column per level rather than a row per level: the levels
    // are the axis a player is scanning ("how deep do I have to go?"), and at
    // three or four of them the columns fit a phone without scrolling.
    const drops = ev.drops?.[regionId] || {};
    const levels = Object.keys(drops).sort((a, b) => Number(a) - Number(b));
    const dropTable = levels.length ? `
      <div class="embark-drop-table">
        <table class="embark-drop-grid">
          <thead>
            <tr>${levels.map(lvl =>
              `<th>${UI_TEXT.eventLevel[L]} ${lvl}</th>`).join('')}</tr>
          </thead>
          <tbody>
            <tr>${levels.map(lvl => `
              <td>${Object.entries(drops[lvl] || {}).map(([id, amt]) => `
                <span class="embark-drop-pill" title="${trophyLabel(id)}">
                  <img class="embark-drop-icon"
                       src="${assetUrl(`/assets/icons/recources/${id}.png`)}"
                       alt="${trophyLabel(id)}"
                       onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'embark-drop-icon-fallback',textContent:'${trophyLabel(id)}'}))">
                  <span class="embark-drop-amt">\u00d7${amt}</span>
                </span>`).join('')}</td>`).join('')}</tr>
          </tbody>
        </table>
      </div>` : '';

    // Global bonuses and this region's own, listed separately so the player can
    // see that they stack rather than replace.
    const pctRow = (src, label) => {
      const bits = [];
      if (src?.xp_pct)      bits.push(`+${src.xp_pct}% ${UI_TEXT.eventXp[L]}`);
      if (src?.gold_pct)    bits.push(`+${src.gold_pct}% ${UI_TEXT.eventGold[L]}`);
      if (src?.crystal_pct) bits.push(`+${src.crystal_pct}% ${UI_TEXT.eventCrystals[L]}`);
      return bits.length ? `<div class="embark-bonus-row"><span>${label}</span><span class="embark-bonus-value">${bits.join(', ')}</span></div>` : '';
    };
    const bonusHtml = pctRow(ev.bonus, UI_TEXT.eventEverywhere[L])
                    + pctRow(ev.bonus?.regions?.[regionId], rLabel(REGIONS.find(r => r.id === regionId) || {}) || regionId);

    const desc = eventDescription(ev);
    openEventModal(ev.name || UI_TEXT.eventBadge[L], `
      <div class="embark-event-sheet" style="--embark-event-glow:${glow}">
        <div class="embark-event-ends">${eventEndsInText()}</div>
        ${desc ? `<p class="embark-event-desc">${desc}</p>` : ''}
        ${dropTable ? `<div class="embark-event-section-label">${UI_TEXT.eventDrops[L]}</div>${dropTable}` : ''}
        ${eventPayoffHtml(ev)}
        ${bonusHtml ? `<div class="embark-event-section-label">${UI_TEXT.eventBonus[L]}</div>${bonusHtml}` : ''}
      </div>`);
  }

  // The event gets its OWN overlay, built on demand and reused. It deliberately
  // shares no class name with the screen's .modal-overlay: that one is a bottom
  // sheet for blocking flows (reconnect, coming-soon), and every attempt to
  // style the event through it fought those rules.
  let _eventOverlay = null;
  function openEventModal(title, bodyHtml) {
    if (!_eventOverlay) {
      _eventOverlay = document.createElement('div');
      _eventOverlay.className = 'embark-modal-overlay embark-modal-overlay--event hidden';
      _eventOverlay.innerHTML = `
        <div class="embark-modal">
          <div class="embark-modal-header">
            <span class="embark-modal-title"></span>
            <button class="embark-modal-close" aria-label="Close">\u2715</button>
          </div>
          <div class="embark-modal-body"></div>
        </div>`;
      const close = () => _eventOverlay.classList.add('hidden');
      _eventOverlay.querySelector('.embark-modal-close').addEventListener('click', close);
      _eventOverlay.addEventListener('click', e => { if (e.target === _eventOverlay) close(); });
      // Delegated, because the body is replaced whenever the panel drills into
      // the unit and back — a listener bound to the row itself would die there.
      _eventOverlay.addEventListener('click', e => {
        const row = e.target.closest('[data-payoff-unit]');
        if (row) openPayoffUnit(row.dataset.payoffUnit);
      });
      root.appendChild(_eventOverlay);
    }
    _eventOverlay.querySelector('.embark-modal-title').textContent = title;
    _eventOverlay.querySelector('.embark-modal-body').innerHTML = bodyHtml;
    _eventOverlay.classList.remove('hidden');
  }

  // The payoff row opens the unit it names. A player being told to chase a
  // trophy for ten runs deserves to see what they are chasing BEFORE committing
  // the evening, not after they have paid for the hall.
  //
  // Swaps the panel's own body rather than opening a second overlay: this is the
  // same question drilling one level deeper, and stacking two dark panels over a
  // region card to answer it would bury the screen.
  function openPayoffUnit(unitId) {
    // resolveUnitDef walks the faction/branch nesting for us: the unit table is
    // not a flat list, and mercenaries do not sit under a player faction.
    const unit = resolveUnitDef({ unit_data: { unit_id: unitId } });
    if (!unit || !_eventOverlay) return;
    const body  = _eventOverlay.querySelector('.embark-modal-body');
    const title = _eventOverlay.querySelector('.embark-modal-title');
    const backTo = { title: title.textContent, html: body.innerHTML };

    title.textContent = (L === 'ru' ? unit.name_ru : unit.name) || unit.name;
    body.innerHTML = `
      <div class="embark-event-unit">
        ${buildUnitCard(unit, {})}
        <button class="embark-event-back">\u2039 ${UI_TEXT.eventBack[L]}</button>
      </div>`;

    body.querySelector('.embark-event-back')?.addEventListener('click', () => {
      title.textContent = backTo.title;
      body.innerHTML = backTo.html;
    });
    // Stats and abilities on the card stay inspectable, the same as anywhere else.
    body.addEventListener('click', e => handleUnitInspect(e, openEventModal), { once: false });
  }

  root.innerHTML = `
    <div class="screen screen-embark">
      <main class="embark-main">
        <div class="embark-layers">
          <button class="embark-layer-arrow embark-layer-arrow--prev" id="embark-layer-prev"
                  type="button" aria-label="${UI_TEXT.regionsAria[L]}"><span>‹</span></button>

          <div class="embark-layer-viewport">
            <div class="embark-layer-track" id="embark-layer-track">

              <div class="embark-layer" data-layer="1">
                <div class="embark-regions-grid" id="embark-regions">
                  <div style="color:var(--muted);text-align:center;padding:2rem">${UI_TEXT.checking[L]}</div>
                </div>
              </div>

              <div class="embark-layer" data-layer="2">
                <div class="embark-regions-grid" id="embark-pvp-modes"></div>
              </div>

            </div>
          </div>

          <button class="embark-layer-arrow embark-layer-arrow--next" id="embark-layer-next"
                  type="button" aria-label="${UI_TEXT.arenaAria[L]}"><span>›</span></button>
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

  // ── Pages ────────────────────────────────────────────────────────────────
  // Same arrangement as the castle's two layers (see setLayer in castle.js):
  // both pages sit side by side on one track and switching slides it, so
  // neither is rebuilt and the arrows cannot race a render.
  const LAYER_COUNT = 2;
  let currentLayer = 1;

  function applyLayer() {
    const track = root.querySelector('#embark-layer-track');
    if (track) track.style.transform = `translateX(-${(currentLayer - 1) * 100}%)`;
    root.querySelectorAll('.embark-layer').forEach(el => {
      const isCurrent = Number(el.dataset.layer) === currentLayer;
      el.classList.toggle('embark-layer--active', isCurrent);
      el.setAttribute('aria-hidden', String(!isCurrent));
    });
    // An arrow that leads nowhere is disabled rather than hidden: a control that
    // vanishes moves everything beside it.
    const prev = root.querySelector('#embark-layer-prev');
    const next = root.querySelector('#embark-layer-next');
    if (prev) {
      const can = currentLayer > 1;
      prev.disabled = !can;
      prev.classList.toggle('embark-layer-arrow--live', can);
    }
    if (next) {
      const can = currentLayer < LAYER_COUNT;
      next.disabled = !can;
      next.classList.toggle('embark-layer-arrow--live', can);
    }
  }

  function setLayer(next) {
    const clamped = Math.min(LAYER_COUNT, Math.max(1, next));
    if (clamped === currentLayer) return;
    currentLayer = clamped;
    applyLayer();
  }

  root.querySelector('#embark-layer-prev')?.addEventListener('click', () => setLayer(currentLayer - 1));
  root.querySelector('#embark-layer-next')?.addEventListener('click', () => setLayer(currentLayer + 1));

  function comingSoon(label) {
    openModal(label, `
      <div style="display:flex;flex-direction:column;gap:1rem;">
        <div style="color:var(--muted);font-size:.95rem;line-height:1.4;">
          ${UI_TEXT.comingSoonBody[L]}
        </div>
      </div>`);
  }

  // The arena page. Modes are region cards by design — same art frame, same
  // label/desc block — because they are the same choice made in the same place.
  function renderPvpModes() {
    const host = root.querySelector('#embark-pvp-modes');
    if (!host) return;

    host.innerHTML = PVP_MODES.map(m => {
      const label = (L === 'ru' && m.label_ru) || m.label;
      const desc  = (L === 'ru' && m.description_ru) || m.description;
      return `
        <div class="embark-region-block">
          <div class="embark-card embark-card--pvp${m.live ? '' : ' embark-card--locked'}"
               data-pvp-mode="${m.id}" data-label="${label}"
               style="${m.art ? regionBgStyle(m) : ''}">
            <div class="embark-card-info">
              <span class="embark-card-label">${label}</span>
              <span class="embark-card-desc">${desc}</span>
            </div>
            ${m.live ? '' : `<span class="embark-card-badge embark-card-badge--soon">${UI_TEXT.pvpSoon[L]}</span>`}
          </div>
        </div>`;
    }).join('');

    // Quick Match is the mode being built next, so it is the one that will stop
    // saying this. The other two answer the same way on purpose — a placeholder
    // that behaves differently from its neighbours reads as a bug.
    host.querySelectorAll('[data-pvp-mode]').forEach(card => {
      card.addEventListener('click', () => comingSoon(card.dataset.label));
    });
  }

  renderPvpModes();
  applyLayer();

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

      // Shown only when a caller HANDS us an active battle — today that is
      // battle-prep, bounced back here by /battle/create. This screen does not
      // go looking for one.
      //
      // It used to fire its own /battle/active on arrival, and again on every
      // departure tap. Both were redundant: main.js checks once at boot and
      // blocks navigation entirely if a battle is open, so a battle this client
      // does not know about can only have been started by another device — which
      // that device's own boot check covers, and which /battle/create refuses
      // outright either way. The arrival check also never had an activeCheck to
      // skip, since nothing passed one, so it ran on every single embark nav.
      if (activeCheck?.active) {
        showReconnectModal(activeCheck.battle_id, activeCheck.battle_data);
      }

      root.querySelector('#embark-regions').innerHTML = REGIONS.map(r => {
        if (r.toArena) {
          return `
            <div class="embark-region-block embark-region-block--arena">
              <div class="embark-card embark-card--arena" data-to-arena="1" data-id="${r.id}" style="${regionBgStyle(r)}">
                <div class="embark-card-info">
                  <span class="embark-card-label">${rLabel(r)}</span>
                  <span class="embark-card-desc">${rDesc(r)}</span>
                </div>
                <span class="embark-card-chev">\u203a</span>
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
            <div class="embark-card" data-id="${r.id}" data-max-level="${maxLevel}" style="${regionBgStyle(r)}">
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

      // Departs immediately. /battle/create is the authority on whether a second
      // battle is allowed, and battle-prep sends the player back here with the
      // active battle in hand if it refuses — so the only cost of not checking
      // first is paid in the one case where a battle really is open, instead of
      // by every honest departure.
      function departTo(regionId, level) {
        if (!regionId || !level) return;
        markTutorialDone(player, 'embark_region');
        navigate('battle-prep', { player, region_id: regionId, level });
      }

      root.querySelectorAll('.embark-level-pip').forEach(pip => {
        pip.addEventListener('click', () => departTo(pip.dataset.region, parseInt(pip.dataset.level)));
      });

      // The card art is the biggest thing on the screen and reads as the button,
      // so players tap it expecting to play rather than to be told to aim at a
      // small numbered pip underneath. Tapping it departs for the furthest level
      // they have unlocked, which is the one they almost always want; the pips
      // stay for replaying an earlier level. Coming-soon cards are excluded —
      // they have a data-id but nothing to enter.
      root.querySelectorAll('.embark-card:not(.embark-card--coming-soon):not([data-to-arena])').forEach(card => {
        card.addEventListener('click', () => departTo(card.dataset.id, parseInt(card.dataset.maxLevel)));
      });

      root.querySelector('.embark-card[data-to-arena]')
        ?.addEventListener('click', () => setLayer(2));

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