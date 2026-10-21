import { assetUrl } from '../asset_base.js';
import { api, refreshResourceBar, resourceCache, structuresCache, bootstrapCache } from '../api.js';
import { showCostBar, hideCostBar, primeCostBar } from '../cost-bar.js';
import { SPELLS, SPELL_TIERS } from '../../data/spells.js';
import { UNITS } from '../../data/units.js';
import { LITANIES, LITANY_TARGETS } from '../../data/litanies.js';
import { getCalling } from '../../data/callings.js';

// Mirrors litaniesUnlocked / LITANY_BUILDING_LEVEL in data/buildings.js — that
// file is CommonJS (server-side only) and cannot be imported here, so the value
// is copied the way castle.js copies its slot tables. The SERVER is what
// actually enforces this (see litaniesUnlockedFor in routes/index.js, which
// decides engine.litaniesUnlocked); the copy below only decides what this page
// draws, so the two disagreeing costs a wrong label, never a wrong battle.
const LITANY_BUILDING = 'proving_grounds';
const LITANY_BUILDING_LEVEL = 3;

// The battle grid a litany's formation is read against: three rows deep, and the
// card draws both columns so "front" is a place on a picture rather than a word.
// Mirrors ROWS in public/battle-system.js — a diagram, so a stale copy would
// draw a wrong board, never fight a wrong battle.
const GRID_ROWS = 3;

// What this faction CALLS the thing. One mechanic, three liturgies: a litany is
// the Empire's word for it, the Grail sings dirges over its dead and the Choir
// chants. Nothing in the engine or in data/litanies.js changes — `litany` stays
// the name in the code, and this is only what the page says out loud.
//
// The Russian carries the forms the sentences below need, because a Russian noun
// does not sit unchanged in every slot the way an English one does: `one` opens a
// sentence, `many` titles the page, `manyLower` sits mid-sentence, and `dative`
// is what a host is drilled IN ("обучить войско панихидам").
const RITE_TERMS = {
  empire: {
    en: { one: 'litany', many: 'Litanies', manyLower: 'litanies' },
    ru: { one: 'Литания', many: 'Литании', manyLower: 'литании', dative: 'литаниям' },
  },
  grail_of_sorrow: {
    en: { one: 'dirge', many: 'Dirges', manyLower: 'dirges' },
    ru: { one: 'Панихида', many: 'Панихиды', manyLower: 'панихиды', dative: 'панихидам' },
  },
  choir_of_the_cursed: {
    en: { one: 'chant', many: 'Chants', manyLower: 'chants' },
    ru: { one: 'Распев', many: 'Распевы', manyLower: 'распевы', dative: 'распевам' },
  },
};

// Mirrors buildingLevel in data/buildings.js: a building's level anywhere in
// the castle, 0 when unbuilt.
function buildingLevelOf(buildingsData, buildingId) {
  if (!buildingsData || !buildingId) return 0;
  let best = 0;
  for (const [key, state] of Object.entries(buildingsData)) {
    if (!/^slot_\d+$/.test(key)) continue;
    if (state?.building_id === buildingId) best = Math.max(best, state.level ?? 0);
  }
  return best;
}

function litaniesUnlocked(buildingsData) {
  return buildingLevelOf(buildingsData, LITANY_BUILDING) >= LITANY_BUILDING_LEVEL;
}
import { CRYSTAL_ICONS, applyBackground, openSheet, openSubSheet, closeSheet, closeSubSheet, getSheetBody,
         onSheetClose, cap, playPageTurnSound, escapeHtml, spellName, spellDesc, abilityName, abilityDescription,
         resolveAbility, buildAbilityModalParts, buildUnitCard } from '../utils.js';
import { rootOf } from '../unit_tree.js';

// The tome tabs by TIER, which is the Mage Guild level that opens the tier —
// so the tabs read as the research ladder they are, rather than as a taxonomy.
//
// The two non-combat spells (revive and mend) are neither researched nor cast
// from here: every faction starts with both, and they are used from a unit's
// sheet in the castle. They carry tier 1 in the data, so they would otherwise
// land in the first tab as two permanently-learned entries with no action on
// them — hence TOME_SPELLS below drops them.
const TOME_TIERS = SPELL_TIERS;
// The Mage Guild is the research gate: level N opens tier N.
const RESEARCH_BUILDING = 'mage_guild';


// ── The Library: the tome's second page ──────────────────────────────────────
//
// Everything here is DERIVED, never authored: the player's faction picks a slice
// of data/units.js, those units name their passives and actives, and those
// abilities name the tags they care about. So a new unit or a new passive shows
// up in the Library the moment it is written, with no list to keep in step.
//
// The loop the screen exists for is:
//
//   ability  ──its tags──▶  tag  ──who carries it──▶  units
//
// which is why the tag chips in an ability's sheet are buttons and the portraits
// behind them are the answer to "so who does that actually mean, for me?".

const LIB_TEXT = {
  all:         { en: 'All',                ru: 'Все' },
  passives:    { en: 'Passives',           ru: 'Пассивные' },
  actives:     { en: 'Actives',            ru: 'Активные' },
  empty:       { en: 'Nothing to study here yet.', ru: 'Здесь пока нечего изучать.' },
  ranks:       { en: 'Ranks',              ru: 'Ранги' },
  rank:        { en: 'Rank',               ru: 'Ранг' },
  tags:        { en: 'Tags in play',       ru: 'Задействованные метки' },
  carriedBy:   { en: 'Carried by',         ru: 'Носители' },
  noCarriers:  { en: 'No unit in your faction carries this.', ru: 'Никто в вашей фракции этим не владеет.' },
  tagUnits:    { en: n => `${n} in your faction`, ru: n => `${n} в вашей фракции` },
  noTagUnits:  { en: 'No unit in your faction carries this tag.', ru: 'Никто в вашей фракции не носит эту метку.' },
  tier:        { en: 'T',                  ru: 'Т' },
  backTo:      { en: t => `‹ ${t}`,   ru: t => `‹ ${t}` },
  lineOf:      { en: n => `${n} line`,     ru: n => `Линия: ${n}` },
  // What a tag is DOING in the ability it was read from. The same tag means very
  // different things in "per Zombie ally" and "extra damage against Zombies",
  // and a Library that printed both as a bare chip would teach the wrong lesson.
  roles: {
    scales:   { en: 'Scales per',      ru: 'Масштаб за' },
    requires: { en: 'Requires',        ru: 'Требует' },
    keyed:    { en: 'Keyed to',        ru: 'Завязано на' },
    affects:  { en: 'Affects',         ru: 'Влияет на' },
    vs:       { en: 'Strong against',  ru: 'Силён против' },
    only:     { en: 'Only one of',     ru: 'Только один' },
  },
};

// Params whose VALUE is a tag (or a list of them), and what that tag is doing.
// `tag_required` is deliberately absent: it carries no single meaning across the
// abilities that declare it, so it is resolved per ability in tagRolesFor().
const TAG_PARAM_ROLES = {
  ally_tag_required:      'affects',
  grant_target_tag:       'affects',
  inspiration_target_tag: 'affects',
  vow_ash_tags:           'affects',
  vs_tag:                 'vs',
  // Warding counts these allies to size the reduction.
  ward_ally_tag:          'scales',
  tag_exclusive:          'only',
};

// A per-tag scaling key is what turns `tag_required` from a gate into a counter.
const SCALING_KEY = /_per_tag$|_per_tagged_unit$/;

// 'chorus_of_war 2' -> 'chorus_of_war'. The rank is a level of the same idea, and
// the Library lists ideas — three Bleed icons taught nothing three times.
function baseKey(id) {
  return String(id || '').trim().replace(/\s+\d+$/, '').replace(/\s+/g, '_');
}

function abilityIconUrl(def) {
  const file = baseKey(def?.id);
  return file ? assetUrl(`/assets/icons/abilities/${file}.jpg`) : '';
}

// The same id rule battle and battle-prep use (getPortraitUrl in both).
//
// A HERO has one portrait for the whole tree: every tier and branch of it is
// still the same face, so `h_d_1_a2` and `h_d_1_b4` both draw `p_h_d_1.png` and
// only the `h_<faction>_<n>` stem is kept. Ordinary units are their own id.
// Without this every hero in the Library rendered as an empty frame, because the
// per-branch file it was asking for has never existed.
function portraitUrl(unitDef) {
  const id = unitDef?.id;
  if (!id) return '';
  const portraitId = String(id).match(/^(h_[a-z]_\d)/)?.[1] ?? id;
  return assetUrl(`/assets/character_portraits/p_${portraitId}.png`);
}

// Every ability key a unit definition names, passives and its active alike.
function abilityKeysOf(unitDef) {
  const raw = unitDef?.passive;
  const passives = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return [...passives, unitDef?.ability].filter(Boolean);
}

// A unit's name in the reader's language. renderLibrary has a local of its own
// that closes over the screen's `lang`; this is the module-level form, for the
// litany page, which indexes units from every faction rather than one.
function unitLabelFor(def, lang) {
  return (lang === 'ru' && def?.name_ru) || def?.name || '';
}

// One entry per unit NAME, not per definition: data/units.js holds a row for
// every tier and every branch of a unit, so an un-deduplicated grid showed the
// Black Castellan seven times. The LOWEST tier that matches wins, because that
// is the form the player meets first and recognises.
function dedupeByName(defs) {
  const byName = new Map();
  for (const d of defs) {
    const seen = byName.get(d.name);
    if (!seen || (d.t ?? 99) < (seen.t ?? 99)) byName.set(d.name, d);
  }
  return [...byName.values()].sort((a, b) => (a.t ?? 0) - (b.t ?? 0) || a.name.localeCompare(b.name));
}

// Every user-facing string in this screen, in the same shape the other screens
// use (CASTLE_TEXT and friends) so there is one place to add a language.
const TOME_TEXT = {
  research:      { en: 'Research Spell',        ru: 'Изучить заклинание' },
  noCrystals:    { en: 'Not enough crystals',   ru: 'Недостаточно кристаллов' },
  researchFail:  { en: 'Research failed',       ru: 'Не удалось изучить' },
  emptyCategory: { en: 'No spells in this tier.', ru: 'Нет заклинаний в этом круге.' },
  tomeAria:      { en: 'Spells',                ru: 'Заклинания' },
  libraryAria:   { en: 'Library',               ru: 'Библиотека' },
  guildRequired: {
    en: tier => `🔒 Mage Guild level ${tier} required`,
    ru: tier => `🔒 Требуется гильдия магов ${tier} уровня`,
  },
  types: {
    buff:      { en: 'Buff',      ru: 'Усиление' },
    debuff:    { en: 'Debuff',    ru: 'Ослабление' },
    resurrect: { en: 'Resurrect', ru: 'Воскрешение' },
  },
  // These five take the faction's own word for the rite (RITE_TERMS above); `t`
  // hands it to them. Everything else on the page is the same in every faction.
  litaniesAria:  { en: w => w.many, ru: w => w.many },
  litaniesTitle: { en: w => w.many, ru: w => w.many },
  litaniesBlurb: {
    en: w => `A ${w.one} is a staged execution. Stand the exact formation below and the chorus speaks before the lead strikes — the killing blow is held back for the last verse.`,
    ru: w => `${w.one} — это обставленная казнь. Постройте бойцов ровно так, как показано ниже, и Свита выступит раньше, чем Инициатор нанесёт удар: смертельный удар придержан до последнего стиха.`,
  },
  litanyLocked: {
    en: `🔒 Requires Proving Grounds level ${LITANY_BUILDING_LEVEL}`,
    ru: `🔒 Требуется Ристалище ${LITANY_BUILDING_LEVEL} уровня`,
  },
  litanyLockedHint: {
    en: w => `Raise the Proving Grounds in your castle to drill your host in the ${w.manyLower}.`,
    ru: w => `Возведите Ристалище в замке, чтобы обучить войско ${w.dative}.`,
  },
  litanyFormation: { en: 'Formation',   ru: 'Построение' },
  litanyTarget:    { en: 'Target',      ru: 'Цель' },
  // The target is ONE list shared by every litany (LITANY_TARGETS in
  // data/litanies.js), so it is said once for the page instead of being repeated
  // on all six cards. The note has to say that out loud — a Target section
  // sitting above the list would otherwise read as belonging to the first card.
  litanyTargetNote: {
    en: w => `Every ${w.one} below is staged over the same death — an enemy champion. No other kill will do:`,
    ru: w => `Все ${w.manyLower} ниже обставляются одной и той же смертью — гибелью вражеского чемпиона. Другая жертва не подойдёт:`,
  },
  litanyReward:    { en: 'Reward',      ru: 'Награда' },
  // The formation is a PLACE on the board, not a list, so the card draws the
  // player's half of the battle grid and keys each marked cell to the band that
  // fills it. "Front column, top to bottom" made the reader rebuild that picture
  // from a sentence every time.
  litanyGridNote:  {
    en: 'Your half of the battle grid — man the marked cells:',
    ru: 'Ваша половина боевой сетки — займите отмеченные клетки:',
  },
  litanyColBack:   { en: 'Back',  ru: 'Тыл' },
  litanyColFront:  { en: 'Front', ru: 'Фронт' },
  // A `row`-sized unit stands in both columns at once, so the cell it fills has
  // no single column to name.
  litanyColBoth:   { en: 'both',  ru: 'обе' },
  // A litany places each cell itself, front column or back, so the label has to
  // read the placement out rather than assert one. Cells arrive already in key
  // order ("A: back column, row 1").
  litanyGridAria:  {
    en: cells => `Cells to man — ${cells}.`,
    ru: cells => `Занять клетки — ${cells}.`,
  },
  // `col` arrives already localized, and `row` may be a span ("1-2") for a cell
  // held by a two-cell unit.
  litanyGridCellAria: {
    en: (key, col, row) => `${key}: ${col} column, row ${row}`,
    ru: (key, col, row) => `${key}: ${col === 'Фронт' ? 'передняя' : col === 'Тыл' ? 'задняя' : 'обе'} колонна, ряд ${row}`,
  },
  // A chorus cell names a CALLING, so the band says the calling rather than
  // drawing the five faces that used to be allowed to fill it. The sentence has
  // to carry what a calling IS, because the Chronicle is a different screen and
  // a player meeting the word here for the first time otherwise sees a label.
  litanyCallingHint: {
    en: name => `any unit sworn to ${name}`,
    ru: name => `любой боец, принявший призвание «${name}»`,
  },
  litanyNoAnchor: {
    en: 'no unit required in this cell',
    ru: 'в этой клетке не требуется отдельный боец',
  },
  litanyHeroHint: {
    en: 'your hero, in person',
    ru: 'ваш герой, лично',
  },
  litanyRoles: {
    // The Russian is NOT a translation of the English here. "Хор" is the faction
    // and the ability of that name, and "Вождь" is a chieftain — both read as
    // something else on this page. "Свита" also covers the cells that fight:
    // eight of the eighteen litanies have a chorus that swings rather than sings.
    chorus: { en: 'Chorus', ru: 'Свита' },
    lead:   { en: 'Lead',   ru: 'Инициатор' },
    // Only on the four whose hero is a healer and so cannot land the blow: the
    // hero sings from a cell of its own while something of its own leads.
    hero:   { en: 'Hero',   ru: 'Герой' },
  },
  litanyNone: {
    en: w => `Your host knows no ${w.manyLower}.`,
    ru: w => `Вашему войску ${w.manyLower} неведомы.`,
  },
};

export function renderSpellTome(root, { player }) {
  applyBackground(root, player.faction, 'spells');

  const isRu = player?.settings?.language === 'ru';
  const lang = isRu ? 'ru' : 'en';

  // What this host calls its rites (RITE_TERMS). A faction with no table of its
  // own falls back to the Empire's word rather than printing nothing — the page
  // has to be readable before it is flavourful.
  const rite = (RITE_TERMS[player?.faction] || RITE_TERMS.empire)[lang];
  // Most entries are plain strings; the handful that name the rite are functions.
  const tomeText = key => {
    const entry = TOME_TEXT[key]?.[lang];
    return typeof entry === 'function' ? entry(rite) : entry;
  };

  root.innerHTML = `
    <div class="screen screen-spelltome">
      <main class="spelltome-main">
        <div class="tome-layers">
          <button class="tome-layer-arrow tome-layer-arrow--prev" id="tome-layer-prev"
                  type="button" aria-label="${tomeText('litaniesAria')}"><span>&lsaquo;</span></button>

          <div class="tome-layer-viewport">
            <div class="tome-layer-track" id="tome-layer-track">

              <div class="tome-layer" data-layer="1" id="tome-litanies"></div>

              <div class="tome-layer" data-layer="2">
                <div class="tier-tabs" id="tier-tabs">
                  ${TOME_TIERS.map((t, i) => `
                    <button class="tier-tab${i === 0 ? ' tier-tab--active' : ''}" data-tier="${t.id}">${isRu ? t.name_ru : t.name}</button>
                  `).join('')}
                </div>

                <div class="spelltome-body">
                  <div class="spells-slider-wrap" id="spells-slider-wrap">
                    <div class="spells-slider" id="spells-slider"></div>
                  </div>
                </div>
              </div>

              <div class="tome-layer" data-layer="3" id="tome-library"></div>

            </div>
          </div>

          <button class="tome-layer-arrow tome-layer-arrow--next" id="tome-layer-next"
                  type="button" aria-label="${TOME_TEXT.libraryAria[lang]}"><span>&rsaquo;</span></button>
        </div>
      </main>
    </div>
  `;

  // ── Pages ─────────────────────────────────────────────────────────────────
  // The tome's two pages, arranged exactly the way the castle's and embark's are
  // (see applyLayer in embark.js): both sit side by side on one track and
  // switching slides it, so neither is rebuilt and the arrows cannot race a
  // render. The Library is built ONCE, here, because it derives everything from
  // static data — nothing about it changes while the screen is open.
  // The book reads Litanies ← Spells → Library, and it OPENS on the spells:
  // that is what the tab is for, with a page to either side of it. Named rather
  // than numbered, because the order is a layout decision and these indices are
  // read in five places.
  const LAYER_LITANIES = 1;
  const LAYER_SPELLS   = 2;
  const LAYER_LIBRARY  = 3;
  const LAYER_COUNT    = 3;
  const LAYER_LABELS = {
    [LAYER_LITANIES]: 'litaniesAria',
    [LAYER_SPELLS]:   'tomeAria',
    [LAYER_LIBRARY]:  'libraryAria',
  };
  // An arrow is named for where it LEADS, not where it sits.
  const labelForLayer = n => tomeText(LAYER_LABELS[n] || 'tomeAria');

  let currentLayer = LAYER_SPELLS;

  function applyLayer() {
    const track = root.querySelector('#tome-layer-track');
    if (track) track.style.transform = `translateX(-${(currentLayer - 1) * 100}%)`;
    root.querySelectorAll('.tome-layer').forEach(el => {
      const isCurrent = Number(el.dataset.layer) === currentLayer;
      el.classList.toggle('tome-layer--active', isCurrent);
      el.setAttribute('aria-hidden', String(!isCurrent));
    });
    // An arrow that leads nowhere is disabled rather than hidden: a control that
    // vanishes moves everything beside it.
    const prev = root.querySelector('#tome-layer-prev');
    const next = root.querySelector('#tome-layer-next');
    // Three pages, so neither arrow always leads to the same one.
    if (prev) {
      const can = currentLayer > 1;
      prev.disabled = !can;
      prev.classList.toggle('tome-layer-arrow--live', can);
      prev.setAttribute('aria-label', labelForLayer(can ? currentLayer - 1 : currentLayer));
    }
    if (next) {
      const can = currentLayer < LAYER_COUNT;
      next.disabled = !can;
      next.classList.toggle('tome-layer-arrow--live', can);
      next.setAttribute('aria-label', labelForLayer(can ? currentLayer + 1 : currentLayer));
    }
  }

  function setLayer(target) {
    const clamped = Math.min(LAYER_COUNT, Math.max(1, target));
    if (clamped === currentLayer) return;
    currentLayer = clamped;
    playPageTurnSound();
    // The cost bar belongs to a selected spell; carrying it onto the Library or
    // the Litanies would leave a price tag hanging under a page that sells
    // nothing.
    if (currentLayer !== LAYER_SPELLS) { primeCostBar(costBarOpts()); closeSheet(); }
    applyLayer();
  }

  root.querySelector('#tome-layer-prev')?.addEventListener('click', () => setLayer(currentLayer - 1));
  root.querySelector('#tome-layer-next')?.addEventListener('click', () => setLayer(currentLayer + 1));
  applyLayer();

  // Layer two, built in place. It derives everything from static data, so it is
  // rendered ONCE when the screen is: nothing about it changes while it is open.
  function renderLibrary(container) {
    // `lang` is the screen's, computed once at the top — the Library is part of
    // this screen now, not a guest with its own copy.
    const L = lang;
    const t = key => LIB_TEXT[key][L];

    const factionUnits = Object.values(UNITS[player.faction] || {});
    const unitById = new Map(factionUnits.map(u => [u.id, u]));

    // ── The faction's abilities, collapsed to one entry per idea ───────────────
    //
    // Built once. Each entry keeps EVERY rank it found (so the sheet can show the
    // progression) and every unit definition that carries any of them (so "carried
    // by" is answered without a second pass over units.js).
    const entries = new Map();
    for (const unitDef of factionUnits) {
      for (const key of abilityKeysOf(unitDef)) {
        const def = resolveAbility(key);
        if (!def) continue;
        const base = baseKey(def.id ?? key);
        if (!entries.has(base)) entries.set(base, { base, def, ranks: [], carriers: [] });
        const entry = entries.get(base);
        if (!entry.ranks.some(r => r.id === def.id)) entry.ranks.push(def);
        // The lowest rank is the one the grid shows and the sheet leads with.
        if ((def.rank ?? 1) < (entry.def.rank ?? 1)) entry.def = def;
        entry.carriers.push(unitDef);
      }
    }
    for (const entry of entries.values()) {
      entry.ranks.sort((a, b) => (a.rank ?? 1) - (b.rank ?? 1));
      entry.carriers = dedupeByName(entry.carriers);
    }
    const allEntries = [...entries.values()]
      .sort((a, b) => abilityName(a.def).localeCompare(abilityName(b.def)));

    // What each tag named in an ability is DOING there. Returns [{ tag, role }].
    function tagRolesFor(def) {
      const p = def?.params || {};
      const out = [];
      const push = (tag, role) => {
        if (!tag || out.some(o => o.tag === tag && o.role === role)) return;
        out.push({ tag, role });
      };

      // `tag_required` is the one tag param with no fixed meaning, so it is read
      // three ways rather than mislabelled one way:
      //   a per-tag scaling key present -> the tag is being COUNTED  ("scales per")
      //   an active                     -> the tag is a GATE on the target
      //                                    ("requires" — Raise Dead needs a Zombie)
      //   a passive                     -> anything from "only one of you" to
      //                                    "split among these", which no single
      //                                    verb covers honestly, so it is stated
      //                                    neutrally and the description says the
      //                                    rest.
      if (p.tag_required) {
        const scales = Object.keys(p).some(k => SCALING_KEY.test(k));
        const role = scales ? 'scales' : (def.type === 'active' ? 'requires' : 'keyed');
        push(p.tag_required, role);
      }
      for (const [key, role] of Object.entries(TAG_PARAM_ROLES)) {
        const val = p[key];
        if (!val) continue;
        for (const tag of (Array.isArray(val) ? val : [val])) push(tag, role);
      }
      return out;
    }

    // ── Markup ────────────────────────────────────────────────────────────────
    const FILTERS = [
      { id: 'all',     label: t('all') },
      { id: 'passive', label: t('passives') },
      { id: 'active',  label: t('actives') },
    ];
    let activeFilter = 'all';

    container.innerHTML = `
      <div class="library">
        <div class="tier-tabs library-filters" id="library-filters">
          ${FILTERS.map((f, i) => `
            <button class="tier-tab${i === 0 ? ' tier-tab--active' : ''}" data-filter="${f.id}">${f.label}</button>
          `).join('')}
        </div>
        <div class="library-grid" id="library-grid"></div>
      </div>
    `;

    const grid = container.querySelector('#library-grid');

    function visibleEntries() {
      if (activeFilter === 'all') return allEntries;
      return allEntries.filter(e => (e.def.type || 'passive') === activeFilter);
    }

    function renderGrid() {
      const list = visibleEntries();
      if (!list.length) {
        grid.innerHTML = `<div class="library-empty">${t('empty')}</div>`;
        return;
      }
      grid.innerHTML = list.map(entry => {
        // The rank count sits on the icon rather than in the name: it is the one
        // thing the grid can say that the name cannot, and it marks the abilities
        // worth opening because they grow.
        const ranks = entry.ranks.length > 1
          ? `<span class="library-cell-ranks">${entry.ranks.length}</span>` : '';
        return `
          <button class="library-cell" type="button" data-base="${entry.base}">
            <span class="library-cell-icon">
              <img src="${abilityIconUrl(entry.def)}" alt="" onerror="this.style.visibility='hidden'">
              ${ranks}
            </span>
            <span class="library-cell-name">${abilityName(entry.def)}</span>
          </button>`;
      }).join('');
    }

    const unitLabel = u => (L === 'ru' && u.name_ru) || u.name;

    // Which upgrade LINE a unit belongs to, answered by the same walk the
    // castle's evolution tree uses (rootOf in unit_tree.js) over the same map.
    // A unit the map does not mention — a mercenary, or anything recruited
    // outside the faction tree — is the root of its own one-unit line.
    function lineRootId(u) {
      const paths = upgradePaths[player.faction] || {};
      return rootOf(paths, u.id) || u.id;
    }

    // Portraits were previously one flat run sorted by tier, which put four
    // unrelated T1s beside each other and split every line apart. Grouping by
    // line keeps a unit next to what it grows into, so the answer to "who has
    // this tag" reads as a set of lines to invest in rather than a pile of
    // faces.
    function groupByLine(unitDefs) {
      const groups = new Map();
      for (const u of unitDefs) {
        const rootId = lineRootId(u);
        if (!groups.has(rootId)) groups.set(rootId, []);
        groups.get(rootId).push(u);
      }
      return [...groups.entries()]
        .map(([rootId, members]) => ({
          // The root itself may not be in this list (a tag the line only picks
          // up at tier 3, say) so it is looked up rather than taken from it.
          root: unitById.get(rootId) || members[0],
          members: members.sort((a, b) => (a.t ?? 0) - (b.t ?? 0) || String(a.id).localeCompare(String(b.id))),
        }))
        .sort((a, b) => (a.root.t ?? 0) - (b.root.t ?? 0)
                     || unitLabel(a.root).localeCompare(unitLabel(b.root)));
    }

    function portraitTileHtml(u) {
      return `
        <button class="library-portrait" type="button" data-unit-id="${u.id}">
          <span class="library-portrait-frame">
            <img src="${portraitUrl(u)}" alt="" onerror="this.remove()">
            ${u.t ? `<span class="library-portrait-tier">${t('tier')}${u.t}</span>` : ''}
          </span>
          <span class="library-portrait-name">${unitLabel(u)}</span>
          <span class="library-portrait-tags">${(u.tags || []).join(' · ')}</span>
        </button>`;
    }

    // Every line is its own block, separated by a rule. A line of ONE — a hero,
    // whose branches all share a name and collapse to a single tile — gets no
    // header, since naming a line of one is noise; the rule is what keeps it
    // from reading as the last member of the line above it.
    function portraitsHtml(unitDefs) {
      return groupByLine(unitDefs).map(g => `
        <div class="library-line">
          ${g.members.length > 1 ? `<div class="library-line-label">${LIB_TEXT.lineOf[L](unitLabel(g.root))}</div>` : ''}
          <div class="library-portraits">${g.members.map(portraitTileHtml).join('')}</div>
        </div>`).join('');
    }

    // A tag, answered with faces. The SUB-sheet is used rather than replacing the
    // ability sheet, so closing it returns the player to the ability they came
    // from — which is what makes this a loop instead of a walk.
    function openTagSheet(tag) {
      const units = dedupeByName(factionUnits.filter(u => (u.tags || []).includes(tag)));
      const body = units.length
        ? `<div class="library-section-label">${LIB_TEXT.tagUnits[L](units.length)}</div>${portraitsHtml(units)}`
        : `<div class="library-empty">${t('noTagUnits')}</div>`;
      subBackTag = tag;
      openSubSheet(tag, body);
      bindSheetsOnce();
    }

    // One unit, as the card the castle and battle prep already draw — same
    // stats, same resistances, same ability row. buildUnitCard takes a raw
    // definition, which is exactly what the Library is holding.
    //
    // Rendered into the SUB-sheet rather than a third overlay: two layers is as
    // deep as this should go, so a unit reached from a tag replaces that tag's
    // list and offers a way back to it.
    function openUnitSheet(unitDef, backTag) {
      const back = backTag
        ? `<button class="library-back" type="button" data-back-tag="${backTag}">${LIB_TEXT.backTo[L](backTag)}</button>`
        : '';
      subBackTag = backTag;
      openSubSheet(unitLabel(unitDef), `${back}${buildUnitCard(unitDef)}`);
      bindSheetsOnce();
    }

    // Both sheets are created ONCE by utils.js and cached; opening one replaces
    // its body's innerHTML, not the body element. So these handlers are
    // installed exactly once and read the current view out of `subBackTag` —
    // re-binding per open would stack a listener every time and fire a click as
    // many times as the player had navigated.
    let subBackTag = null;
    // Tracked per sheet: utils.js builds each overlay lazily, so the sub-sheet
    // does not exist until it is first opened, while the main one is already
    // there. One shared flag would have left the main sheet unbound on the very
    // first ability opened.
    let mainBound = false;
    let subBound  = false;

    // The ability icons on a unit card are the loop closing: tapping one takes
    // the MAIN sheet to that ability's Library entry and drops the sub-sheet,
    // so ability -> tag -> unit -> another ability keeps going without ever
    // stacking a third overlay.
    function bindSheetsOnce() {
      const main = document.querySelector('.modal-overlay:not(.modal-overlay--sub) .modal-body');
      const sub  = document.querySelector('.modal-overlay--sub .modal-body');

      if (main && !mainBound) {
        mainBound = true;

        // Selector-scoped, so these are inert while the sheet is showing a SPELL
        // rather than a Library entry — the tome shares both overlays.
        main.addEventListener('click', e => {
          const chip = e.target.closest('.library-tagchip');
          if (chip) { openTagSheet(chip.dataset.tag); return; }
          // A carrier portrait opens straight onto that unit, with no tag to
          // return to — the ability sheet behind it is already the way back.
          const tile = e.target.closest('.library-portrait[data-unit-id]');
          const u = tile && unitById.get(tile.dataset.unitId);
          if (u) openUnitSheet(u, null);
        });
      }

      if (sub && !subBound) {
        subBound = true;
        sub.addEventListener('click', e => {
          const back = e.target.closest('.library-back');
          if (back) { openTagSheet(back.dataset.backTag); return; }

          const tile = e.target.closest('.library-portrait[data-unit-id]');
          if (tile) {
            const u = unitById.get(tile.dataset.unitId);
            if (u) openUnitSheet(u, subBackTag);
            return;
          }

          const icon = e.target.closest('.ability-icon[data-ability-key]');
          if (icon && icon.dataset.abilityKey) {
            const def = resolveAbility(icon.dataset.abilityKey);
            const next = def && entries.get(baseKey(def.id ?? icon.dataset.abilityKey));
            if (next) { closeSubSheet(); openAbilitySheet(next); }
          }
        });
      }
    }

    function openAbilitySheet(entry) {
      const parts = buildAbilityModalParts(entry.def, entry.def.type);

      // Ranks beyond the first, as the numbers actually change. The lead
      // description above is rank one's, so repeating it here would say nothing.
      const higher = entry.ranks.slice(1);
      const ranksHtml = higher.length ? `
        <div class="library-section-label">${t('ranks')}</div>
        <div class="library-ranks">
          ${higher.map(r => `
            <div class="library-rank">
              <span class="library-rank-pill">${t('rank')} ${r.rank ?? '?'}</span>
              <span class="library-rank-desc">${abilityDescription(r)}</span>
            </div>`).join('')}
        </div>` : '';

      const roles = tagRolesFor(entry.def);
      const tagsHtml = roles.length ? `
        <div class="library-section-label">${t('tags')}</div>
        <div class="library-tagchips">
          ${roles.map(r => `
            <button class="library-tagchip library-tagchip--${r.role}" type="button" data-tag="${r.tag}">
              <span class="library-tagchip-role">${LIB_TEXT.roles[r.role][L]}</span>
              <span class="library-tagchip-tag">${r.tag}</span>
            </button>`).join('')}
        </div>` : '';

      const carriersHtml = `
        <div class="library-section-label">${t('carriedBy')}</div>
        ${entry.carriers.length
          ? portraitsHtml(entry.carriers)
          : `<div class="library-empty">${t('noCarriers')}</div>`}`;

      openSheet(parts.title, `${parts.body}${ranksHtml}${tagsHtml}${carriersHtml}`, parts.badges);
      bindSheetsOnce();
    }

    grid.addEventListener('click', e => {
      const cell = e.target.closest('.library-cell');
      if (!cell) return;
      const entry = entries.get(cell.dataset.base);
      if (entry) openAbilitySheet(entry);
    });

    container.querySelector('#library-filters').addEventListener('click', e => {
      const btn = e.target.closest('.tier-tab');
      if (!btn || btn.dataset.filter === activeFilter) return;
      playPageTurnSound();
      activeFilter = btn.dataset.filter;
      container.querySelectorAll('#library-filters .tier-tab').forEach(b =>
        b.classList.toggle('tier-tab--active', b.dataset.filter === activeFilter));
      renderGrid();
    });

    renderGrid();
  }

  renderLibrary(root.querySelector('#tome-library'));

  // ── Layer three: the Litanies ─────────────────────────────────────────────
  // A codex page, not a shop: nothing here is bought. It shows the formation a
  // litany demands, who may stand in each cell, what is said and what it pays.
  // Locked until the Proving Grounds reaches its third level — shown rather than
  // hidden, so the page teaches that the drill exists and what buys it.
  //
  // The lock is cosmetic here and real in utils/battle-engine.js (fireLitany);
  // this page only mirrors it.
  let litaniesReady = false;

  // Takes unit DEFS, already deduplicated by name — data/litanies.js lists every
  // tier and branch that may fill a role, which is the same face over and over
  // to a reader.
  function litanyUnitChips(defs) {
    if (!defs.length) return '';
    // Faces, not a list. The name rides on `title` and `alt` so the portrait is
    // still identifiable on hover and to a screen reader — which is the only
    // way to read it now that the label is gone.
    return `<div class="litany-unit-chips">${defs.map(d => {
      const name = escapeHtml(unitLabelFor(d, lang));
      return `<span class="litany-unit-chip" title="${name}">
        <img src="${portraitUrl(d)}" alt="${name}" class="litany-unit-portrait"
             onerror="this.style.visibility='hidden'">
      </span>`;
    }).join('')}</div>`;
  }

  function renderLitanies(container) {
    if (!container) return;
    const t = tomeText;

    // Role ids are matched against unit DEFINITION ids, and a litany spans two
    // sides — profane_chorus is spoken by Empire units over a Choir hero — so
    // the index is every unit in the game, not the player's faction.
    //
    // UNITS.enemies nests one level deeper than the playable factions — its
    // values are encounter groups (crimson_basilica and the rest), not defs —
    // so the walk recurses instead of reading one level. A flat read skipped
    // every enemy silently, which is how Sister Aldra could be a litany target
    // and still leave a blank space where her face belongs.
    const unitById = new Map();
    const factionOfUnitId = new Map();
    const indexUnits = (node, factionKey) => {
      for (const value of Object.values(node || {})) {
        if (!value || typeof value !== 'object') continue;
        if (value.id) {
          if (!unitById.has(value.id)) unitById.set(value.id, value);
          if (!factionOfUnitId.has(value.id)) factionOfUnitId.set(value.id, factionKey);
        } else {
          indexUnits(value, factionKey);
        }
      }
    };
    for (const [factionKey, faction] of Object.entries(UNITS)) indexUnits(faction, factionKey);

    // Whose drill is this? The litany is performed by the side that supplies the
    // LEAD — the unit that lands the real blow — so the player's own faction has
    // to be able to field one. Derived rather than declared on the litany: the
    // role id lists in data/litanies.js are already the authoring decision, and a
    // `faction` field beside them would be a second copy to keep in step.
    //
    // No mercenary supplies a litany role, so the player's faction is the whole
    // of what they can field for this purpose.
    const canPerform = def =>
      (def.lead?.ids || []).some(id => factionOfUnitId.get(id) === player.faction);

    // Only the litanies this player could actually stage. A Choir player has no
    // Paladin to lead profane_chorus and never will, so listing it would be a
    // page of units they cannot recruit — staging the execution of their own
    // heroes, at that.
    const performable = LITANIES.filter(canPerform);

    // One band, ONE LINE: the letter, then what fills that cell, then the role.
    // It used to be a stacked card - a head row above a row of faces - which was
    // the right shape when a cell named a list of units. A cell names a calling
    // or a single line now, so the card was mostly air: the letter and the thing
    // it points at sit side by side instead, and a formation of three reads in
    // three lines rather than a page of scrolling.
    const bandHtml = (role, label, ids, key = '') => {
      const defs = dedupeByName(ids.map(id => unitById.get(id)).filter(Boolean));
      return `
        <div class="litany-row litany-row--${role}">
          ${key ? `<span class="litany-row-key">${escapeHtml(key)}</span>` : ''}
          ${litanyUnitChips(defs)}
          ${label ? `<span class="litany-row-role">${escapeHtml(label)}</span>` : ''}
        </div>`;
    };

    const cards = performable.map((def, i) => {
      // A formation is a list of CELLS, each carrying its own letter, its grid
      // row and its column — the litany decides where its singers stand, and two
      // of them can share a row across the two columns (see data/litanies.js).
      // The letters are authored rather than derived: the data says A, and the
      // band, the board and the verse that names its speaker all say A.
      // A cell is as big as the unit that stands in it, so it can cover two
      // squares of the board: 'row' spans both columns of its row, 'column' its
      // row and the one below. Both squares carry the same letter — a Golden Lion
      // is one speaker standing in two places, and drawing only its anchor made
      // the other half of it look free to fill.
      const cells = [...(def.formation?.cells || [])]
        .sort((a, b) => String(a.key).localeCompare(String(b.key)));
      const squaresOf = c => {
        const size = c.size || 'tile';
        if (size === 'row')    return [`${c.row}:back`, `${c.row}:front`];
        if (size === 'column') return [`${c.row}:${c.col}`, `${c.row + 1}:${c.col}`];
        return [`${c.row}:${c.col}`];
      };
      const keyOfCell  = new Map();
      const roleOfCell = new Map();
      for (const c of cells) for (const sq of squaresOf(c)) {
        keyOfCell.set(sq, c.key);
        roleOfCell.set(sq, c.role);
      }

      // The player's own half of the board, drawn at the size of a diagram: two
      // columns, three rows, oriented exactly as battle prep lays out the
      // player's side (frontColFor in data/formation_synergies.js). Empty cells
      // are drawn too, so the marked cells keep their place on the board.
      //
      // ONE CELL IS ONE BLOCK. A two-cell unit is a single square of the diagram
      // spanning two places, with ONE letter on it — drawing its letter twice said
      // "two units of this line", which is the opposite of what a Golden Lion is.
      // Every element is placed explicitly (`grid-area`) rather than flowed,
      // because a spanning block makes auto-placement shuffle everything after it.
      // A board row `r` is grid row `r + 1`.
      //
      // A block carries no size of its own: the GRID's tracks size it (see
      // .litany-grid in style.css), so a span always covers its squares and the
      // gap between them exactly. A hardcoded width could not reliably cover a
      // spanning cell and its gap.
      const gridArea = c => {
        const col = c.col === 'back' ? 1 : 2;
        const row = (c.row ?? 0) + 1;
        if (c.size === 'row')    return `grid-area: ${row} / 1 / span 1 / span 2`;
        if (c.size === 'column') return `grid-area: ${row} / ${col} / span 2 / span 1`;
        return `grid-area: ${row} / ${col}`;
      };

      // WHAT FILLS EACH CELL, in its own row to the right of the formation.
      // Unlike the board, this list is per cell: two cells can share a board row
      // but their requirements must still start on separate rows.
      const reqHtml = cell => {
        const roleLabel = TOME_TEXT.litanyRoles[cell.role]?.[lang] || cap(cell.role || '');
        const keyTag = cell.key
          ? `<span class="litany-row-key">${escapeHtml(cell.key)}</span>` : '';
        // A chorus cell's calling is its formation requirement. `all_alive`
        // changes who speaks, not what must occupy the marked cell.
        if (cell.role === 'chorus') {
          const calling = cell.calling ? getCalling(cell.calling) : null;
          if (!calling) {
            if (!cell.all_alive) return '';
            return `
            <div class="litany-grid-req litany-grid-req--chorus"
                 title="${escapeHtml(roleLabel)}">
              ${keyTag}
              <span class="litany-calling-name">${escapeHtml(t('litanyNoAnchor'))}</span>
            </div>`;
          }
          const name = lang === 'ru' ? calling.name_ru : calling.name;
          return `
            <div class="litany-grid-req litany-grid-req--chorus"
                 title="${escapeHtml(roleLabel)} — ${escapeHtml(TOME_TEXT.litanyCallingHint[lang](name))}">
              ${keyTag}
              <span class="litany-calling-name">${escapeHtml(name)}</span>
            </div>`;
        }
        // 'hero' is the litany's own hero line; 'lead' is whoever lands the
        // blow, which on fourteen of the eighteen is that same hero.
        const ids  = cell.role === 'hero' ? (def.hero?.ids || []) : (def.lead?.ids || []);
        const defs = dedupeByName(ids.map(id => unitById.get(id)).filter(Boolean));
        return `
          <div class="litany-grid-req litany-grid-req--${cell.role}" title="${escapeHtml(roleLabel)}">
            ${keyTag}
            ${litanyUnitChips(defs)}
          </div>`;
      };

      const reqRowsHtml = [...cells]
        .sort((a, b) => String(a.key).localeCompare(String(b.key)))
        .map(reqHtml).join('');

      // The squares no cell covers, drawn empty so the two columns read as a board.
      const empties = [];
      for (let r = 0; r < GRID_ROWS; r++) for (const col of ['back', 'front']) {
        if (!keyOfCell.has(`${r}:${col}`)) empties.push({ row: r, col, size: 'tile' });
      }
      const gridHtml = `
        <div class="litany-formation" role="img"
             aria-label="${escapeHtml(TOME_TEXT.litanyGridAria[lang](
               cells.map(c => TOME_TEXT.litanyGridCellAria[lang](
                 c.key,
                 t(c.size === 'row' ? 'litanyColBoth'
                   : c.col === 'back' ? 'litanyColBack' : 'litanyColFront'),
                 c.size === 'column' ? `${(c.row ?? 0) + 1}-${(c.row ?? 0) + 2}` : (c.row ?? 0) + 1)).join('; ')))}">
          <div class="litany-grid">
            ${cells.map(c => `
              <span class="litany-grid-cell litany-grid-cell--filled litany-grid-cell--${c.role}"
                    style="${gridArea(c)}">${escapeHtml(c.key)}</span>`).join('')}
            ${empties.map(sq => `
              <span class="litany-grid-cell" style="${gridArea(sq)}"></span>`).join('')}
          </div>
          <div class="litany-grid-reqs" style="grid-template-rows: repeat(${cells.length}, minmax(36px, auto))">
            ${reqRowsHtml}
          </div>
        </div>`;

      // The verses are deliberately NOT listed here. They are the moment itself,
      // and reading them off a page before the battle spends them — the card
      // teaches the formation and the payout, and the fight delivers the words.
      const reward = lang === 'ru'
        ? (def.reward?.message_ru || def.reward?.message || '')
        : (def.reward?.message || '');

      // <details> rather than a button and a class: the open/closed state, the
      // keyboard handling and the aria-expanded wiring are the element's job,
      // and there is no JS here to get them wrong.
      //
      // The first card opens and the rest start shut. There is one litany per
      // faction today, so this reads as "open" now; once a faction has one per
      // hero the page arrives as a list of names to pick from rather than a
      // scroll through every formation.
      return `
        <details class="litany-card${litaniesReady ? '' : ' litany-card--locked'}"${i === 0 ? ' open' : ''}>
          <summary class="litany-card-head">
            <span class="litany-card-caret" aria-hidden="true"></span>
            <h3 class="litany-name">${escapeHtml(lang === 'ru' ? (def.name_ru || def.name) : def.name)}</h3>
            ${litaniesReady ? '' : `<span class="litany-lock">${escapeHtml(t('litanyLocked'))}</span>`}
          </summary>

          <section class="litany-section">
            <h4 class="litany-section-title">${escapeHtml(t('litanyFormation'))}</h4>
            <p class="litany-section-note">${escapeHtml(t('litanyGridNote'))}</p>
            ${gridHtml}
          </section>

          ${reward ? `
            <section class="litany-section">
              <h4 class="litany-section-title">${escapeHtml(t('litanyReward'))}</h4>
              <p class="litany-reward">${escapeHtml(reward)}</p>
            </section>` : ''}
        </details>`;
    }).join('');

    // Whose death a litany is staged around — the same answer for all eighteen
    // (LITANY_TARGETS in data/litanies.js), so it is drawn ONCE for the page.
    // It used to be a section on every card, which was the same twelve faces
    // repeated six times and read as if each litany had a quarrel of its own.
    //
    // Deduped by name, so the ninety ids behind it come out as the nine hero
    // lines and the three bosses — a reader recognises a face, not a tier.
    const targetHtml = performable.length ? bandHtml('target', '', LITANY_TARGETS) : '';

    // The lock only has something to say when this faction HAS a litany to
    // unlock. Telling a host with none to go raise the Proving Grounds would
    // point them at a building that would give them nothing.
    const showLock = performable.length > 0 && !litaniesReady;

    container.innerHTML = `
      <div class="litany-page">
        <header class="litany-page-head">
          <h2 class="litany-page-title">${escapeHtml(t('litaniesTitle'))}</h2>
          <p class="litany-page-blurb">${escapeHtml(t('litaniesBlurb'))}</p>
          ${showLock ? `
            <p class="litany-page-lock">
              <span class="litany-lock">${escapeHtml(t('litanyLocked'))}</span>
              <span class="litany-lock-hint">${escapeHtml(t('litanyLockedHint'))}</span>
            </p>` : ''}
        </header>
        ${targetHtml ? `
          <section class="litany-page-target">
            <h3 class="litany-section-title">${escapeHtml(t('litanyTarget'))}</h3>
            <p class="litany-section-note">${escapeHtml(t('litanyTargetNote'))}</p>
            ${targetHtml}
          </section>` : ''}
        <div class="litany-list">${cards || `<p class="spells-empty">${escapeHtml(t('litanyNone'))}</p>`}</div>
      </div>`;
  }

  renderLitanies(root.querySelector('#tome-litanies'));

  // The faction's upgrade map, for grouping Library portraits by unit line. It
  // rides the bootstrap the castle already fetches, so this costs no request —
  // but it arrives AFTER the first render. Everything that needs it is opened by
  // a tap, long after init() has settled, and an empty map simply means every
  // unit is its own line rather than an error.
  let upgradePaths    = {};
  let playerCrystals  = {};
  let guildLevel      = 0;
  let learnedSpells   = [];
  let activeSpellId   = null;
  let activeTier      = TOME_TIERS[0].id;
  const factionSpells = SPELLS[player.faction] || [];
  // What the tome will show: everything researchable, which is everything bar
  // the two roster-only support spells.
  const tomeSpells    = factionSpells.filter(s => s.category !== 'non_combat');

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

  // Same shape the castle hands the shared bar: resource keys to amounts.
  function costMap(spell) {
    const out = {};
    for (const [type, amt] of Object.entries(spell.cost?.crystals || {})) {
      if (amt > 0) out[type] = amt;
    }
    return out;
  }

  const crystalAmount = key => Number(playerCrystals[key] || 0);
  const costBarOpts = () => ({ amountOf: crystalAmount, lang });

  function canAfford(spell) {
    for (const [type, amt] of Object.entries(spell.cost.crystals || {})) {
      if (amt > 0 && (playerCrystals[type] || 0) < amt) return false;
    }
    return true;
  }

  function renderSlider() {
    // A tab IS the gate now: every spell in it opens at the same Mage Guild
    // level, so the tier either reads as locked whole or not at all. The one
    // exception is tier 1, where the faction's starting buff is pre-granted and
    // its shelfmate still needs the guild built.
    const catSpells = tomeSpells
      .filter(s => s.tier === activeTier)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!catSpells.length) {
      slider.innerHTML = `<div class="spells-empty">${TOME_TEXT.emptyCategory[lang]}</div>`;
      return;
    }

    slider.innerHTML = catSpells.map(spell => {
      const isLearned  = learnedSpells.includes(spell.id);
      const affordable = canAfford(spell);
      const isActive   = activeSpellId === spell.id;
      const unlocked   = guildLevel >= spell.tier;

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
      const spell   = tomeSpells.find(s => s.id === spellId);
      if (!spell) return;

      card.addEventListener('click', () => {
        if (activeSpellId === spellId) {
          activeSpellId = null;
          renderSlider();
          primeCostBar(costBarOpts());
          closeSheet();
          return;
        }
        activeSpellId = spellId;
        renderSlider();
        showCostBar(costMap(spell), costBarOpts());
        openSpellModal(spell);
        // Dismissing the sheet by the X or the backdrop has to take the bar with
        // it, or it outlives the spell it was describing.
        onSheetClose(() => { activeSpellId = null; primeCostBar(costBarOpts()); renderSlider(); });
      });
    });
  }

  function modalBodyHtml(spell) {
    const isLearned    = learnedSpells.includes(spell.id);
    const affordable   = canAfford(spell);
    const tierUnlocked = guildLevel >= spell.tier;
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
        : `<span class="spell-detail-status spell-detail-status--locked">${TOME_TEXT.guildRequired[lang](spell.tier)}</span>`;
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
        // Written back to the player, not just to this screen's copy. The
        // private array was why nothing else could rely on player.learned_spells
        // — research it here and every other screen still believed the old set.
        learnedSpells = Array.isArray(result.learned_spells)
          ? result.learned_spells
          : [...learnedSpells, spell.id];
        player.learned_spells = learnedSpells;
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

  function setTier(tierId) {
    const tier = Number(tierId);
    if (!tier || tier === activeTier) return;
    playPageTurnSound();
    activeTier    = tier;
    activeSpellId = null;
    tierTabs.querySelectorAll('.tier-tab').forEach(t =>
      t.classList.toggle('tier-tab--active', Number(t.dataset.tier) === tier));
    renderSlider();
    closeSheet();
  }

  // Swiping steps one tab along the TOME_TIERS order, stopping at the ends.
  function stepCategory(delta) {
    const i    = TOME_TIERS.findIndex(t => t.id === activeTier);
    const next = Math.max(0, Math.min(TOME_TIERS.length - 1, i + delta));
    setTier(TOME_TIERS[next].id);
  }

  tierTabs.querySelectorAll('.tier-tab').forEach(tab => {
    tab.addEventListener('click', () => setTier(tab.dataset.tier));
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
      const [structData, inventory, boot] = await Promise.all([
        structuresCache.get(player.chat_id),
        resourceCache.get(player.chat_id),
        // Cached and already fetched by the castle, so this is a read, not a
        // round-trip. Failing it must not take the spell list down with it.
        bootstrapCache.get(player.chat_id).catch(() => null),
      ]);
      upgradePaths = boot?.buildings?.upgrade_paths || {};

      guildLevel    = buildingLevelOf(structData?.buildings_data, RESEARCH_BUILDING);
      // Same structures read the guild level comes from, so the litany page
      // costs no extra request. Re-rendered rather than patched: the page is
      // static apart from this one flag.
      litaniesReady = litaniesUnlocked(structData?.buildings_data);
      renderLitanies(root.querySelector('#tome-litanies'));
      // Off the player, not the network. `learned_spells` is a column on the
      // players row and arrives with /login, so the GET this replaced was
      // fetching something the client already held — every time the tab was
      // opened. doResearch below keeps it current, which is what makes it
      // trustworthy as the only copy.
      learnedSpells = Array.isArray(player.learned_spells) ? player.learned_spells : [];

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

  // The tome survives between visits now. Nothing here runs on a timer or
  // reaches outside the host, so the only obligation on the way back in is
  // freshness: crystals are spent in battle and the Mage Guild that opens a
  // research tier is raised in the castle, both off this screen. init() re-reads the caches (a hit inside the
  // TTL costs no request) and repaints, which is exactly what the old router
  // got by rebuilding the screen from nothing.
  // The build-cost strip is mounted beside the resource bar, OUTSIDE this host,
  // so hiding the host does not hide it — and a selected spell is what puts it
  // there. Dropping the selection on the way out is what onSheetClose already
  // does when the player dismisses the card themselves.
  return {
    onShow: () => { init(); },
    onHide: () => {
      activeSpellId = null;
      hideCostBar();
      renderSlider();
    },
    destroy: () => { hideCostBar(); },
  };
}
