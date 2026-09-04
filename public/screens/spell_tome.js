import { assetUrl } from '../asset_base.js';
import { api, refreshResourceBar, resourceCache, structuresCache } from '../api.js';
import { showCostBar, hideCostBar } from '../cost-bar.js';
import { SPELLS, SPELL_CATEGORIES } from '../../data/spells.js';
import { UNITS } from '../../data/units.js';
import { CRYSTAL_ICONS, applyBackground, openSheet, openSubSheet, closeSheet, getSheetBody, onSheetClose, cap,
         playPageTurnSound, spellName, spellDesc, abilityName, abilityDescription, resolveAbility,
         buildAbilityModalParts } from '../utils.js';

// The tome is for RESEARCH, and the two non-combat spells (revive and mend) are
// neither researched nor cast from here — every faction starts with both, and
// they are used from a unit's sheet in the castle. A tab listing two spells that
// are always already learned and have no action attached to them is a dead page,
// so the tome shows the combat categories only. Same filter battle-prep applies.
const TOME_CATEGORIES = SPELL_CATEGORIES.filter(c => c.id !== 'non_combat');


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

function portraitUrl(unitDef) {
  return assetUrl(`/assets/character_portraits/p_${unitDef.id}.png`);
}

// Every ability key a unit definition names, passives and its active alike.
function abilityKeysOf(unitDef) {
  const raw = unitDef?.passive;
  const passives = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return [...passives, unitDef?.ability].filter(Boolean);
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
  emptyCategory: { en: 'No spells in this category.', ru: 'Нет заклинаний в этой категории.' },
  tomeAria:      { en: 'Spells',                ru: 'Заклинания' },
  libraryAria:   { en: 'Library',               ru: 'Библиотека' },
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
        <div class="tome-layers">
          <button class="tome-layer-arrow tome-layer-arrow--prev" id="tome-layer-prev"
                  type="button" aria-label="${TOME_TEXT.tomeAria[lang]}"><span>&lsaquo;</span></button>

          <div class="tome-layer-viewport">
            <div class="tome-layer-track" id="tome-layer-track">

              <div class="tome-layer" data-layer="1">
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
              </div>

              <div class="tome-layer" data-layer="2" id="tome-library"></div>

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
  const LAYER_COUNT = 2;
  let currentLayer = 1;

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
    if (prev) {
      const can = currentLayer > 1;
      prev.disabled = !can;
      prev.classList.toggle('tome-layer-arrow--live', can);
    }
    if (next) {
      const can = currentLayer < LAYER_COUNT;
      next.disabled = !can;
      next.classList.toggle('tome-layer-arrow--live', can);
    }
  }

  function setLayer(target) {
    const clamped = Math.min(LAYER_COUNT, Math.max(1, target));
    if (clamped === currentLayer) return;
    currentLayer = clamped;
    playPageTurnSound();
    // The cost bar belongs to a selected spell on page one; carrying it onto the
    // Library would leave a price tag hanging under a screen that sells nothing.
    if (currentLayer !== 1) { hideCostBar(); closeSheet(); }
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

    function portraitsHtml(unitDefs) {
      return `<div class="library-portraits">${unitDefs.map(u => `
        <div class="library-portrait">
          <span class="library-portrait-frame">
            <img src="${portraitUrl(u)}" alt="${u.name}" onerror="this.style.visibility='hidden'">
            ${u.t ? `<span class="library-portrait-tier">${t('tier')}${u.t}</span>` : ''}
          </span>
          <span class="library-portrait-name">${(L === 'ru' && u.name_ru) || u.name}</span>
          <span class="library-portrait-tags">${(u.tags || []).join(' · ')}</span>
        </div>`).join('')}</div>`;
    }

    // A tag, answered with faces. The SUB-sheet is used rather than replacing the
    // ability sheet, so closing it returns the player to the ability they came
    // from — which is what makes this a loop instead of a walk.
    function openTagSheet(tag) {
      const units = dedupeByName(factionUnits.filter(u => (u.tags || []).includes(tag)));
      const body = units.length
        ? `<div class="library-section-label">${LIB_TEXT.tagUnits[L](units.length)}</div>${portraitsHtml(units)}`
        : `<div class="library-empty">${t('noTagUnits')}</div>`;
      openSubSheet(tag, body);
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

      // Bound on the freshly written body, once per open. openSheet replaces the
      // body's innerHTML, so the previous ability's listener has already gone with
      // the nodes it was attached to — nothing accumulates.
      document.querySelector('.modal-overlay .modal-body')
        ?.addEventListener('click', e => {
          const chip = e.target.closest('.library-tagchip');
          if (chip) openTagSheet(chip.dataset.tag);
        });
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

  // Same shape the castle hands the shared bar: resource keys to amounts.
  function costMap(spell) {
    const out = {};
    for (const [type, amt] of Object.entries(spell.cost?.crystals || {})) {
      if (amt > 0) out[type] = amt;
    }
    return out;
  }

  const crystalAmount = key => Number(playerCrystals[key] || 0);

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
          hideCostBar();
          closeSheet();
          return;
        }
        activeSpellId = spellId;
        renderSlider();
        showCostBar(costMap(spell), { amountOf: crystalAmount, lang });
        openSpellModal(spell);
        // Dismissing the sheet by the X or the backdrop has to take the bar with
        // it, or it outlives the spell it was describing.
        onSheetClose(() => { activeSpellId = null; hideCostBar(); renderSlider(); });
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
      const [structData, inventory] = await Promise.all([
        structuresCache.get(player.chat_id),
        resourceCache.get(player.chat_id),
      ]);

      throneLevel   = structData?.buildings_data?.slot_0?.level ?? 0;
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
}