import { api, navigate, bootstrapCache } from '../api.js';
import { applyBackground, buildUnitCard, handleUnitInspect, resolveUnitDef } from '../utils.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';
import { lang } from './settings.js';
import { assetUrl } from '../asset_base.js';
// How many levels each region really has. The REGIONS array below is
// presentation only; the level tables live in data/embark.js and are the single
// source of truth for how many pips a region can ever show.
import { REGIONS as REGION_DEFS } from '../../data/embark.js';
import { ruleName } from '../../data/tourney.js';
import { loadColossus, renderColossusPage, renderColossusError, colossusCardStatus } from '../colossus-page.js';

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
  supplyOutTitle:  { en: 'Out of supplies', ru: 'Припасы кончились' },
  supplyOutBody:   {
    en: 'Every embark costs one. They come back on their own — the Arena, the Colossus and the Crown Tourney cost none, so there is still a fight to be had.',
    ru: 'Каждый поход стоит одного. Они восполняются сами — Арена, Колосс и Турнир Короны не требуют припасов, так что бой всё ещё есть.',
  },
  supplyNextIn:    { en: 'Next in',   ru: 'Следующий через' },
  supplyFull:      { en: 'Full',      ru: 'Полно' },
  supplyMin:       { en: 'min',       ru: 'мин' },
  pvpSoon:         { en: 'Soon',      ru: 'Скоро' },
  tourneyLoading:  { en: 'Loading…',        ru: 'Загрузка…' },
  tourneyToday:    { en: 'Today',           ru: 'Сегодня' },
  tourneyNext:     { en: 'Next',            ru: 'Следующий' },
  tourneyNoRules:  { en: 'No special rules', ru: 'Без особых правил' },
  tourneyBoard:    { en: 'Standings',       ru: 'Турнирная таблица' },
  tourneyEmpty:    { en: 'No one has fought yet tonight.',
                     ru: 'Сегодня ещё никто не сражался.' },
  tourneyYou:      { en: 'You',             ru: 'Вы' },
  tourneyAnon:     { en: 'Challenger',      ru: 'Боец' },
  tourneyPts:      { en: 'pts',             ru: 'очк.' },
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
export const REGIONS = [
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
    id: 'colossus',
    label: 'Faction Colossus',
    label_ru: 'Колосс фракций',
    icon: '♜',
    description: 'A weekly boss your whole faction fights together. Every hit counts.',
    description_ru: 'Еженедельный босс, с которым сражается вся фракция. Каждый удар на счету.',
    crystal: null,
    // Not a region: tapping it slides to the Colossus page, left of the regions.
    toColossus: true,
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
    id: 'pvp_tourney',
    label: 'Crown Tourney',
    label_ru: 'Турнир Короны',
    description: 'Five battles every evening under changing rules.',
    description_ru: 'Пять боёв каждый вечер по меняющимся правилам.',
    live: true,
    // Drawn from GET /tourney rather than from this table: the card carries the
    // clock and the player's record, which is the whole tourney UI.
    tourney: true,
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
export function renderEmbark(root, params = {}) {
  const { player } = params;
  // INSTRUCTIONS, not state: each is consumed by the load it arrives with and
  // then cleared. The screen outlives a visit now, so leaving them standing
  // would replay a reconnect prompt, or flash the regions a player was pointed
  // at an hour ago, every time they came back. onShow takes the new ones.
  let { activeCheck, highlightRegions, layer } = params;

  // Whether the player is actually looking at this screen. Hidden screens keep
  // every node they ever had (see the screen stack in main.js), so nothing
  // asked of the DOM can answer this. It starts false for a PREBUILD — a screen
  // built ahead of time on idle, which must draw itself and then sit still: no
  // tutorial, no clock, nothing that assumes it is being looked at.
  let hostVisible = !params.prebuild;
  applyBackground(root, player.faction, 'embark');

  const L = lang(player);

  // The embark gate, as /bootstrap resolved it: { item, label_en, label_ru, art,
  // amount, max, tick_minutes, embark_cost }, or null before a faction is
  // picked. Refreshed by every loadRegions, which is what a return from battle
  // goes through.
  let supplies = null;

  const supplyName = () => (L === 'ru' ? supplies?.label_ru : supplies?.label_en) || supplies?.item || '';

  // Per-faction art, named by the server for the same reason the label is: the
  // table lives in data/buildings.js, which the client cannot read. No art means
  // no icon rather than a placeholder — the name alone already reads correctly.
  const supplyIcon = () => (supplies?.art
    ? `<img class="embark-supply-icon" src="${assetUrl('/' + String(supplies.art).replace(/^\//, ''))}" alt=""
            onerror="this.remove()">`
    : '');

  // The refill is a Supabase cron on a fixed minute step, so the next tick is
  // the next wall-clock minute divisible by it — the same instant for everyone
  // regardless of timezone. That is why no per-player timestamp is stored for
  // it and why this can be worked out on the client.
  function minutesToNextTick() {
    const step = Number(supplies?.tick_minutes) || 30;
    const now = new Date();
    const past = now.getMinutes() % step;
    const mins = step - past;
    // A tick that is 40 seconds away should read "1 min", not "0 min".
    return now.getSeconds() > 0 ? mins : mins || step;
  }

  const canEmbark = () => !supplies || supplies.amount >= (supplies.embark_cost ?? 1);

  // Drawn above the regions rather than in the resource bar: the bar's seven
  // slots are full, and a supply only means anything on this screen.
  function supplyPillHtml() {
    if (!supplies) return '';
    const full = supplies.amount >= supplies.max;
    const note = full
      ? UI_TEXT.supplyFull[L]
      : `${UI_TEXT.supplyNextIn[L]} ${minutesToNextTick()} ${UI_TEXT.supplyMin[L]}`;
    return `
      <div class="embark-supply-pill${canEmbark() ? '' : ' embark-supply-pill--empty'}">
        ${supplyIcon()}
        <span class="embark-supply-name">${supplyName()}</span>
        <span class="embark-supply-count">${supplies.amount} / ${supplies.max}</span>
        <span class="embark-supply-note">${note}</span>
      </div>`;
  }

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
            <div class="embark-layer-track" id="embark-layer-track" style="transform:translateX(-100%)">

              <div class="embark-layer" data-layer="1">
                <div class="colossus-page" id="colossus-page">
                  <div style="color:var(--muted);text-align:center;padding:2rem">${UI_TEXT.checking[L]}</div>
                </div>
              </div>

              <div class="embark-layer" data-layer="2">
                <div class="embark-regions-grid" id="embark-regions">
                  <div style="color:var(--muted);text-align:center;padding:2rem">${UI_TEXT.checking[L]}</div>
                </div>
              </div>

              <div class="embark-layer" data-layer="3">
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
  // 1 Colossus · 2 Regions · 3 Arena. The screen opens on the regions unless
  // the caller asked for a page by name (a quest's Go button does).
  const LAYER_COUNT = 3;
  let currentLayer = layer === 'colossus' ? 1 : layer === 'arena' ? 3 : 2;

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
      const open  = m.tourney ? tourneyIsOpen() : m.live;
      return `
        <div class="embark-region-block">
          <div class="embark-card embark-card--pvp${open ? '' : ' embark-card--locked'}"
               data-pvp-mode="${m.id}" data-label="${label}"
               style="${m.art ? regionBgStyle(m) : ''}">
            <div class="embark-card-info">
              <span class="embark-card-label">${label}</span>
              <span class="embark-card-desc">${m.tourney ? tourneyLine() : desc}</span>
            </div>
            ${m.tourney ? tourneyBadgeHtml() : (m.live ? '' : `<span class="embark-card-badge embark-card-badge--soon">${UI_TEXT.pvpSoon[L]}</span>`)}
          </div>
          ${m.tourney ? tourneyBoardHtml() : ''}
        </div>`;
    }).join('');

    // A live mode departs for battle prep with no region and no level: prep
    // knows from `mode` that the other grid stays fogged until the queue pairs
    // the player. The two unbuilt modes answer with the placeholder.
    host.querySelectorAll('[data-pvp-mode]').forEach(card => {
      const mode = PVP_MODES.find(m => m.id === card.dataset.pvpMode);
      card.addEventListener('click', () => {
        // The tourney card refuses on its own terms: the badge already says when
        // it opens and how many battles are left, so a tap that cannot enter is
        // answered by the card rather than by a popup.
        if (mode?.tourney) {
          if (!tourneyIsOpen() || tourneyBattlesLeft() <= 0) return;
          return navigate('battle-prep', { player, mode: mode.id });
        }
        if (!mode?.live) return comingSoon(card.dataset.label);
        navigate('battle-prep', { player, mode: mode.id });
      });
    });
  }

  // ── Crown Tourney ─────────────────────────────────────────────────────────
  // There is no tourney screen: the arena card IS it. The badge carries the
  // clock — time left while it runs, time until it opens while it does not —
  // plus wins and battles remaining once it is running.
  let tourneyState = null;
  let tourneyTimer = null;
  const BOARD_REFRESH_TICKS = 30;

  function tourneyIsOpen() {
    const t = tourneyState?.tourney;
    if (!t) return false;
    const now = Date.now();
    return now >= new Date(t.starts_at).getTime() && now < new Date(t.ends_at).getTime();
  }

  function tourneyBattlesLeft() {
    return Number(tourneyState?.battles_left ?? 0);
  }

  function countdown(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  // Today's rules while it runs, the next one's while it does not — a player who
  // knows tomorrow's rules tonight has something to plan.
  function tourneyLine() {
    if (!tourneyState) return UI_TEXT.tourneyLoading[L];
    const open = tourneyIsOpen();
    const t = open ? tourneyState.tourney : (tourneyState.next || tourneyState.tourney);
    const rules = (t?.rules || []).map(id => ruleName(id, L)).filter(Boolean);
    if (!rules.length) return UI_TEXT.tourneyNoRules[L];
    return `${open ? UI_TEXT.tourneyToday[L] : UI_TEXT.tourneyNext[L]}: ${rules.join(' · ')}`;
  }

  function tourneyBadgeHtml() {
    const t = tourneyState?.tourney || tourneyState?.next;
    if (!t) return '';
    const open = tourneyIsOpen();
    const target = open ? t.ends_at : (tourneyState.next || t).starts_at;
    const left = new Date(target).getTime() - Date.now();
    const parts = [`${open ? '⏳' : '🕔'} ${countdown(left)}`];
    if (open) parts.push(`🏅 ${Number(tourneyState.entry?.wins ?? 0)}`, `⚔ ${tourneyBattlesLeft()}`);
    return `<span class="embark-card-badge embark-card-badge--tourney">${parts.join(' · ')}</span>`;
  }

  // Usernames come from Telegram, so they are somebody else's text in this
  // player's DOM. Nothing here interpolates a name without passing it through.
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // The board, drawn BELOW the card rather than on it: the card is a control
  // with art behind it, and a ten-row table on top of art is neither readable
  // nor tappable. The block grows taller; the card itself is untouched, so the
  // tap target and the art frame stay exactly what they were.
  //
  // Only while a tourney is running. Between evenings there is nothing to stand
  // in — the card shows the next one's rules, and an empty board under it would
  // read as "nobody is playing this" rather than "it has not started".
  function tourneyBoardHtml() {
    if (!tourneyIsOpen()) return '';
    const rows = tourneyState?.standings || [];
    const body = rows.length
      ? rows.map(r => `
          <li class="tourney-board-row${r.you ? ' tourney-board-row--you' : ''}">
            <span class="tourney-board-place">${r.place}</span>
            <span class="tourney-board-name">${escapeHtml(r.you ? UI_TEXT.tourneyYou[L] : (r.name || UI_TEXT.tourneyAnon[L]))}</span>
            <span class="tourney-board-record">🏅 ${r.wins}/${r.battles}</span>
            <span class="tourney-board-points">${r.points} ${UI_TEXT.tourneyPts[L]}</span>
          </li>`).join('')
      : `<li class="tourney-board-empty">${UI_TEXT.tourneyEmpty[L]}</li>`;
    return `
      <div class="tourney-board">
        <div class="tourney-board-title">${UI_TEXT.tourneyBoard[L]}</div>
        <ol class="tourney-board-list">${body}</ol>
      </div>`;
  }

  // The clock alone changes each second, so only the clock is rewritten. Repainting
  // the whole grid once a second rebuilt all three cards — a tap landing in that
  // moment hit a node that was already gone.
  function tickTourneyCard() {
    const card = root.querySelector('[data-pvp-mode="pvp_tourney"]');
    if (!card) return false;
    const badge = card.querySelector('.embark-card-badge--tourney');
    const desc  = card.querySelector('.embark-card-desc');
    const html  = tourneyBadgeHtml();
    if (badge && html) {
      const next = html.replace(/^<span[^>]*>|<\/span>$/g, '');
      if (badge.innerHTML !== next) badge.innerHTML = next;
    } else if (!badge !== !html) {
      return false;   // the badge appeared or vanished: a full render draws it
    }
    const line = tourneyLine();
    if (desc && desc.textContent !== line) desc.textContent = line;
    card.classList.toggle('embark-card--locked', !tourneyIsOpen());
    return true;
  }

  async function loadTourney() {
    try {
      tourneyState = await api(`/tourney?chat_id=${encodeURIComponent(player.chat_id)}`);
    } catch (err) {
      console.error('Tourney read failed:', err);
      return;
    }
    renderPvpModes();
    clearInterval(tourneyTimer);
    // The player left while this read was in the air. Draw what came back — the
    // card is theirs to find next time — but do not start a clock behind them.
    if (!hostVisible) return;
    // The clock ticks locally; the state is re-read only when the window flips,
    // which is the one moment the card means something different.
    //
    // Aliveness is asked of the SCREEN, not the DOM. This used to watch a node
    // for isConnected, which was already a half-truth — #content-root was never
    // removed, only emptied — and is now simply false: a screen that is hidden
    // keeps every node it ever had. Without this the arena's clock would tick on
    // behind the castle, re-reading the standings once a minute forever.
    //
    // onHide stops it and onShow starts it again; the check here catches the
    // narrow case of a loadTourney already in flight when the player left.
    let wasOpen = tourneyIsOpen();
    let ticks = 0;
    tourneyTimer = setInterval(() => {
      if (!hostVisible) { clearInterval(tourneyTimer); return; }
      if (tourneyIsOpen() !== wasOpen) { wasOpen = tourneyIsOpen(); loadTourney(); return; }
      // The clock is local, but the board is not: the places on it change as
      // other people finish their fights. While the tourney is running it is
      // re-read on a slow beat — often enough that a player watching it sees
      // themselves move, rarely enough that a card showing two numbers is not
      // polling the database every second.
      if (wasOpen && ++ticks % BOARD_REFRESH_TICKS === 0) { loadTourney(); return; }
      if (!tickTourneyCard()) renderPvpModes();
    }, 1000);
  }

  renderPvpModes();
  // The standings and the Colossus are the two things here that are NOT read
  // from a cache, and onShow reads them again on arrival anyway — so a prebuild
  // draws the page from what it already has and leaves the round trips for the
  // visit that needs them.
  if (hostVisible) loadTourney();
  applyLayer();

  // ── Colossus page ────────────────────────────────────────────────────────
  // Loaded once on arrival: the same answer fills the page and the line on its
  // card in the regions list, whichever of the two is drawn first.
  let colossusState = null;

  function paintColossusCard() {
    const el = root.querySelector('#colossus-card-status');
    if (el && colossusState) el.textContent = colossusCardStatus(colossusState, L);
  }

  function loadColossusPage() {
    const host = root.querySelector('#colossus-page');
    loadColossus(player)
      .then(state => {
        colossusState = state;
        paintColossusCard();
        return renderColossusPage(host, state, {
          player, L,
          onAttack: () => navigate('battle-prep', { player, mode: 'colossus' }),
          // Waking a resting unit changes who may enter, so the page is re-read
          // rather than patched: the same load draws the new resting list.
          onRefresh: loadColossusPage,
        });
      })
      .catch(err => {
        console.error('Failed to load Colossus:', err);
        renderColossusError(host, { L, onRetry: loadColossusPage });
      });
  }
  if (hostVisible) loadColossusPage();

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
      supplies = boot?.supplies || null;

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
      // Answered. A later visit is not the visit that was bounced back here.
      activeCheck = null;

      root.querySelector('#embark-regions').innerHTML = supplyPillHtml() + REGIONS.map(r => {
        if (r.toColossus) {
          return `
            <div class="embark-region-block embark-region-block--arena">
              <div class="embark-card embark-card--arena" data-to-colossus="1" data-id="${r.id}" style="${regionBgStyle(r)}">
                <div class="embark-card-info">
                  <span class="embark-card-label">${rLabel(r)}</span>
                  <span class="embark-card-desc">${rDesc(r)}</span>
                  <span class="embark-card-crystal" id="colossus-card-status"></span>
                </div>
                <span class="embark-card-chev">‹</span>
              </div>
            </div>
          `;
        }
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
      // Shown. The player was pointed here once, for one material.
      highlightRegions = null;

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
        // The gate is explained, not hidden. Nothing on this screen is disabled
        // for want of supplies — the same cards sit beside the Arena, the
        // Colossus and the Tourney, none of which cost any, so a dead button
        // would read as "embark is broken" rather than "spend your evening
        // somewhere else". /battle/create is the authority either way and
        // answers `no_supplies`; this only saves the round-trip.
        if (!canEmbark()) {
          openModal(UI_TEXT.supplyOutTitle[L], `
            <p>${UI_TEXT.supplyOutBody[L]}</p>
            <p class="embark-supply-next">${UI_TEXT.supplyNextIn[L]} ${minutesToNextTick()} ${UI_TEXT.supplyMin[L]}</p>
          `);
          return;
        }
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
      root.querySelectorAll('.embark-card:not(.embark-card--coming-soon):not([data-to-arena]):not([data-to-colossus])').forEach(card => {
        card.addEventListener('click', () => departTo(card.dataset.id, parseInt(card.dataset.maxLevel)));
      });

      root.querySelector('.embark-card[data-to-arena]')
        ?.addEventListener('click', () => setLayer(3));
      root.querySelector('.embark-card[data-to-colossus]')
        ?.addEventListener('click', () => setLayer(1));
      paintColossusCard();

      // Gated on having no battle behind them, not on an earlier step's flag.
      // It used to require `second_building`, which is SKIPPED rather than
      // completed for anyone whose barracks were already full — and a skipped
      // step sets no flag, so those players reached this screen and were shown
      // nothing at all. Standing here is the qualification: the tab that leads
      // here is locked until the castle chain opens it.
      // Both branches teach, and neither may run from behind another screen: a
      // prebuilt embark would spotlight a region the player cannot see, or
      // hideTutorial() the step the castle is in the middle of showing.
      if (hostVisible) {
        if (!isTutorialDone(player, 'embark_region') && !isTutorialDone(player, 'battle_done')) {
          const firstPip = root.querySelector('.embark-level-pip[data-region="crimson_basilica"][data-level="1"]');
          if (firstPip) showTutorialSpotlight(player, 'embark_region', firstPip);
        } else {
          hideTutorial();
        }
      }
    } catch (err) {
      console.error('Failed to load regions:', err);
    }
  }

  loadRegions();

  // Embark is kept alive between visits, and it is the screen most often
  // arrived at WITH something to do — a material to flash, a battle to
  // reconnect to, a page to open on — so it takes its params on the way in
  // rather than being rebuilt for them (acceptsParams).
  //
  // The page the player left it on is NOT reset: coming back from a tourney
  // battle should land on the arena, not send them across the track again. A
  // caller that means otherwise says so with `layer`.
  return {
    acceptsParams: true,
    onShow: (next = {}) => {
      hostVisible      = true;
      activeCheck      = next.activeCheck;
      highlightRegions = next.highlightRegions;
      if (next.layer) setLayer(next.layer === 'colossus' ? 1 : next.layer === 'arena' ? 3 : 2);
      // Regions open as the player progresses, the tourney window turns over on
      // a server clock, and the Colossus is beaten down by everyone at once —
      // none of it is state this screen can keep on its own.
      loadRegions();
      loadTourney();
      loadColossusPage();
    },
    onHide: () => {
      hostVisible = false;
      clearInterval(tourneyTimer);
    },
    destroy: () => {
      hostVisible = false;
      clearInterval(tourneyTimer);
    },
  };
}