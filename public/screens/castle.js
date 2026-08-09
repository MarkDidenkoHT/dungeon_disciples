import { api }              from '../api.js';
import { navigate }          from '../api.js';
import { refreshResourceBar } from '../api.js';
import { refreshNavLock }    from '../api.js';
import { bootstrapCache } from '../api.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone, firstRecruitHint } from '../tutorial.js';
import { UNIT_ABILITIES }    from '../../data/unit_abilities.js';
import { UNITS }             from '../../data/units.js';
import { SPELLS }            from '../../data/spells.js';
import { renderSpellTome }   from './spell_tome.js';
import {
  RESIST_ICONS, RESIST_ORDER,
  resolveAbility, renderModalContent, openSheet, closeSheet, getSheetBody, GOLD_ICON,
  openSubSheet, closeSubSheet, getSubSheetBody, cap, onSheetClose, RESOURCE_BAR_SLOTS,
  buildUnitCard, getActionLabel, buildAbilityModalParts,
  renderItemSlotIcon, withEquippedItem, resolveUnitDef, itemName, itemRarity,
  handleUnitInspect,
} from '../utils.js';
import { getEquipBlock } from '../../data/item_rules.js';

// Castle copy that was still hardcoded English while the rest of the sheet
// followed the player's language (the perk chooser and Deconstruct modal were
// already localized, so the upgrade button read "Upgrade -> X" next to
// "Разобрать...").
const CASTLE_TEXT = {
  upgradeTo:   { en: n => `Upgrade → ${n}`,             ru: n => `Улучшить → ${n}` },
  upgradeCost: { en: (n, c) => `Upgrade → ${n} (${c})`, ru: (n, c) => `Улучшить → ${n} (${c})` },
  maxed:       { en: 'Maxed — No Upgrades',             ru: 'Максимальный уровень' },
  notEnough:   { en: 'Not enough trophies for this upgrade.', ru: 'Недостаточно трофеев для улучшения.' },
  deconstruct: { en: 'Deconstruct',                           ru: 'Разобрать' },
  close:       { en: 'Close',                                 ru: 'Закрыть' },
  confirm:     { en: 'Confirm',                               ru: 'Подтвердить' },
  build:       { en: 'Build',                                 ru: 'Построить' },
  upgrade:     { en: 'Upgrade',                               ru: 'Улучшить' },
  equip:       { en: 'Equip',                                 ru: 'Надеть' },
  unequip:     { en: 'Unequip',                               ru: 'Снять' },
  itemsTitle:  { en: 'Item',                                  ru: 'Предмет' },
  noItems:     { en: 'No items available.',                   ru: 'Нет доступных предметов.' },
  wrongFaction:{ en: 'Wrong faction',                         ru: 'Другая фракция' },
  requires:    { en: 'Requires',                              ru: 'Требует' },
  // Item picker chrome. Same two axes the old roster sheet filtered on — what
  // the item does and how good it is — minus the craft tab, which now lives on
  // the Items screen.
  tabEquippable:{ en: 'Equippable',                           ru: 'Подходящие' },
  tabOwned:    { en: 'Owned',                                 ru: 'В наличии' },
  filterRarity:{ en: 'Rarity',                                ru: 'Редкость' },
  filterStat:  { en: 'Stat',                                  ru: 'Фильтр' },
  groupStats:  { en: 'Stats',                                 ru: 'Характеристики' },
  groupTraits: { en: 'Traits',                                ru: 'Свойства' },
  any:         { en: 'Any',                                   ru: 'Любая' },
  all:         { en: 'All',                                   ru: 'Все' },
  common:      { en: 'Common',                                ru: 'Обычные' },
  rare:        { en: 'Rare',                                  ru: 'Редкие' },
  epic:        { en: 'Epic',                                  ru: 'Эпические' },
  mythic:      { en: 'Mythic',                                ru: 'Мифические' },
  rarity_common:{ en: 'Common',                               ru: 'Обычный' },
  rarity_rare: { en: 'Rare',                                  ru: 'Редкий' },
  rarity_epic: { en: 'Epic',                                  ru: 'Эпический' },
  rarity_mythic:{ en: 'Mythic',                               ru: 'Мифический' },
  statHp:      { en: 'HP',                                    ru: 'HP' },
  statArmor:   { en: 'Armor',                                 ru: 'Броня' },
  statInit:    { en: 'Init',                                  ru: 'Иниц.' },
  statPower:   { en: 'Power',                                 ru: 'Сила' },
  statResist:  { en: 'Resist',                                ru: 'Сопр.' },
  traitPassive:{ en: 'Passive',                               ru: 'Пассивка' },
  traitGrants: { en: 'Grants Tag',                            ru: 'Даёт метку' },
  traitNeeds:  { en: 'Needs Tag',                             ru: 'Нужна метка' },
  unique:      { en: 'Unique',                                ru: 'Уникальный' },
  grantsTag:   { en: 'Grants tag',                            ru: 'Даёт метку' },
  equippedElse:{ en: 'Equipped on another unit',              ru: 'Надет на другом бойце' },
  nothingMatches:{ en: 'Nothing matches these filters.',      ru: 'Ничего не найдено по фильтрам.' },
  equippedOn:  { en: 'on',                                    ru: 'у' },
  // Divine favor: the ad-funded alternative to Resurrect / Heal. Each faction
  // petitions its own god — the mechanic is identical, only the name changes,
  // so FAVOR_LABELS is presentation, not behaviour. The "Ad" marker is never
  // dropped: disguising an ad as a prayer is the one thing this must not do.
  adBadge:     { en: 'Ad',                                    ru: 'Реклама' },
  favorLeft:   { en: n => `${n} left today`,                  ru: n => `Осталось сегодня: ${n}` },
  favorNoneUI: { en: 'No favors left today',                  ru: 'Сегодня милостей больше нет' },
  favorWatching:{ en: 'Your prayer is heard…',                ru: 'Молитва услышана…' },
  favorCancel: { en: 'Cancel',                                ru: 'Отмена' },
  favorFailed: { en: 'Favor failed',                          ru: 'Милость не получена' },
  favorPlaceholder: { en: 'Advertisement placeholder',        ru: 'Место для рекламы' },
  resurrect:   { en: 'Resurrect',                             ru: 'Воскресить' },
  resurrecting:{ en: 'Resurrecting…',                         ru: 'Воскрешаем…' },
  heal:        { en: 'Heal',                                  ru: 'Лечить' },
  healing:     { en: 'Healing…',                              ru: 'Лечим…' },
  cannotAfford:{ en: 'Not enough resources. Needs',           ru: 'Недостаточно ресурсов. Нужно' },
};

const CASTLE_BACKGROUNDS = {
  empire:              '/assets/screens/empire.jpg',
  choir_of_the_cursed: '/assets/screens/choir.jpg',
  grail_of_sorrow:     '/assets/screens/grail.jpg',
};

export function renderCastle(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-castle">
      <main class="castle-main">
        <div class="castle-grounds">
          <div class="castle-grid-wrap">
            <div class="outer-ring" id="outer-ring"></div>
            <div class="center-slot" id="center-slot"></div>
          </div>
        </div>
      </main>
    </div>
  `;

  let structuresRecord   = null;
  let buildingPools      = null;
  let upgradePaths       = null;
  let throneUpgradeCosts = {};
  let thronePerks        = {};
  let heroMaxLevel       = 4;
  let mercenaryBuildings = {};
  let trophyInventory    = [];
  let resourceInventory  = [];
  let respecCostPct      = 25;   // overwritten from /bootstrap
  const castleLang = player?.settings?.language === 'ru' ? 'ru' : 'en';

  function openModal(title, bodyHtml, badgesHtml = '') { openSheet(title, bodyHtml, badgesHtml); }
  function closeModal() { closeSheet(); closeSubSheet(); }

  function openAbilityModal(title, bodyHtml, badgesHtml = '') {
    openSubSheet(title, bodyHtml, badgesHtml);
  }

  function closeAbilityModal() { closeSubSheet(); }

  const backgroundUrl = CASTLE_BACKGROUNDS[player.faction];
  if (backgroundUrl) {
    root.style.backgroundImage = `url('${backgroundUrl}')`;
    root.style.backgroundSize = 'cover';
    root.style.backgroundPosition = 'center';
    root.style.backgroundRepeat = 'no-repeat';
    root.style.backgroundColor = 'rgba(17, 19, 24, 0.75)';
  }

  let rosterCount = 0;
  let rosterCache = [];   // from /bootstrap; no separate /roster fetch
  // Owned item rows. A castle slot now manages the unit that stands in it, so
  // equipping happens here rather than on a separate roster screen.
  let itemsCache  = [];
  // Divine favor budget, from /bootstrap — same source the roster reads.
  let favorRemaining = 0;
  let favorSeconds   = 15;

  // A building slot and the unit occupying it are linked by unit_data.building_slot,
  // written by makeUnitData when the building raises the unit. That is what makes
  // the slot addressable as a UNIT rather than as a blueprint.
  function rosterUnitForSlot(slot) {
    return rosterCache.find(u => u?.unit_data?.building_slot === slot) || null;
  }

  function equippedItemFor(rosterId) {
    if (rosterId == null) return null;
    return itemsCache.find(it => String(it.equipped_by) === String(rosterId)) || null;
  }

  async function load() {
    const boot = await bootstrapCache.get(player.chat_id);

    const inventory     = boot.resources;
    const trophies       = boot.trophies;
    const structures     = boot.structures;
    const buildingsResp = boot.buildings;
    const roster        = boot.roster;

    buildingPools      = buildingsResp.pools;
    upgradePaths       = buildingsResp.upgrade_paths || {};
    throneUpgradeCosts = buildingsResp.throne_upgrade_costs || {};
    thronePerks        = buildingsResp.throne_perks || {};
    heroMaxLevel       = buildingsResp.hero_max_level || 4;
    mercenaryBuildings  = buildingsResp.mercenary_buildings || {};
    respecCostPct       = buildingsResp.respec_cost_pct ?? 25;
    trophyInventory     = trophies || [];
    resourceInventory   = inventory || [];
    structuresRecord   = structures;
    rosterCount        = Array.isArray(roster) ? roster.length : 0;
    rosterCache        = Array.isArray(roster) ? roster : [];
    itemsCache         = boot.items || [];
    favorRemaining     = boot.favor?.remaining ?? 0;
    favorSeconds       = boot.favor?.seconds ?? favorSeconds;

    renderBuildings();
  }

  // Single refresh path: /bootstrap holds resources, trophies, structures, roster
  // and items, so every post-mutation update is ONE request rather than one per
  // slice. refreshResourceBar shares the same in-flight fetch.
  async function reloadFromBootstrap() {
    const boot = await bootstrapCache.refresh(player.chat_id);
    structuresRecord = boot.structures;
    trophyInventory  = boot.trophies || [];
    resourceInventory = boot.resources || [];
    rosterCache      = boot.roster || [];
    rosterCount      = rosterCache.length;
    itemsCache       = boot.items || [];
    favorRemaining   = boot.favor?.remaining ?? favorRemaining;
    favorSeconds     = boot.favor?.seconds ?? favorSeconds;
    renderBuildings();
    refreshResourceBar(player).catch(() => {});
  }

  function getBuildingDef(faction, buildingId) {
    if (!buildingPools || !faction) return null;
    for (const pool of Object.values(buildingPools[faction])) {
      const found = pool.find(b => b.id === buildingId);
      if (found) return found;
    }
    return null;
  }

  // Same portrait convention as the roster / formation track.
  function branchPortraitUrl(unit) {
    const id = unit?.id;
    if (!id) return '';
    const portraitId = id.match(/^(h_[a-z]_\d)/)?.[1] ?? id;
    return `/assets/character_portraits/p_${portraitId}.png`;
  }

  function getUnitByUnitId(unitId) {
    if (!unitId || !UNITS) return null;
    const factions = ['empire', 'choir_of_the_cursed', 'grail_of_sorrow'];
    for (const f of factions) {
      if (!UNITS[f]) continue;
      const found = Object.values(UNITS[f]).find(u => u?.id === unitId);
      if (found) return found;
    }
    if (UNITS.enemies) {
      for (const region of Object.values(UNITS.enemies)) {
        if (!region || typeof region !== 'object') continue;
        const found = Object.values(region).find(u => u?.id === unitId);
        if (found) return found;
      }
    }
    return null;
  }

  // data/buildings.js is CommonJS (server-side only) and cannot be imported
  // here — but /bootstrap already sends the whole pool table, so the respec
  // rules are derived from that. Kept deliberately identical to
  // getRespecOptions/getRespecCost in data/buildings.js, which the server
  // enforces; this copy only decides what the UI offers.
  function respecOptionsFor(buildingId) {
    const pools = buildingPools?.[player.faction];
    if (!pools) return [];
    const current = getBuildingDef(player.faction, buildingId);
    if (!current) return [];
    const pool = pools[current.category] || [];
    return pool.filter(b => b.id !== current.id && b.tier != null && b.tier === current.tier && b.unit_id);
  }

  function respecCostFor(buildingId, level) {
    const def = getBuildingDef(player.faction, buildingId);
    if (!def) return {};
    const base = def.cost || (def.category === 'throne' ? throneUpgradeCosts[level] : null) || {};
    const out = {};
    for (const [item, amount] of Object.entries(base)) {
      const scaled = Math.ceil(Number(amount) * respecCostPct / 100);
      if (scaled > 0) out[item] = scaled;
    }
    return out;
  }

  // Dwellings are paid for in gold + the faction's crystal now (see
  // applyBuildingCosts in data/buildings.js), so the sheet has to say what a
  // build costs and refuse to offer one the player cannot pay for.
  function amountOf(item) {
    const key = item === 'gold' ? 'Gold' : item;
    const row = resourceInventory.find(r => r.item === key);
    return row ? Number(row.amount) : 0;
  }

  function canAffordCost(cost) {
    return Object.entries(cost || {}).every(([item, amt]) => amountOf(item) >= Number(amt));
  }

  function costLabelFor(cost) {
    return Object.entries(cost || {})
      .map(([item, amt]) => `${amt} ${item === 'gold' ? 'Gold' : item.replace('Crystals_', '')}`)
      .join(' + ');
  }

  // ── Cost bar ────────────────────────────────────────────────────────────────
  // What a build or upgrade costs used to live only in the confirm button's
  // tooltip, which on a phone means nowhere. This is a second strip that slides
  // in directly under the resource bar (the slot the roster's trophy bar uses)
  // and mirrors it column for column: the gold you need sits under the gold you
  // have, fire crystals under fire crystals. Reading down a column answers
  // "can I afford this?" without any arithmetic.
  //
  // Costs are keyed 'gold' + 'Crystals_*' (data/buildings.js) — mercenary
  // upgrades are priced in trophies instead, which have no column in the strip
  // above, so those are appended after the seven fixed slots.
  const COST_BAR_ID = 'castle-cost-bar';

  function hideCostBar() {
    document.getElementById(COST_BAR_ID)?.remove();
  }

  function showCostBar(cost) {
    hideCostBar();
    const entries = Object.entries(cost || {}).filter(([, amt]) => Number(amt) > 0);
    if (!entries.length) return;

    const resourceRow = document.getElementById('resource-bar-row');
    if (!resourceRow) return;

    // 'gold' in a cost map is the same resource as 'Gold' in the strip above.
    const required = {};
    for (const [item, amt] of entries) {
      const key = item === 'gold' ? 'Gold' : item;
      required[key] = (required[key] || 0) + Number(amt);
    }

    // The seven aligned slots. A slot with nothing to pay still renders, dimmed,
    // so every column keeps its position under the strip above.
    const slotHtml = (iconHtml, key, label, need) => {
      const have  = amountOf(key);
      const short = have < need;
      return `<div class="res-bar-item cost-bar-item ${short ? 'cost-bar-item--short' : 'cost-bar-item--ok'}"
                   title="${label}: ${castleLang === 'ru' ? `нужно ${need}, есть ${have}` : `need ${need}, have ${have}`}">
                <span class="res-bar-icon">${iconHtml}</span>
                <span class="res-bar-val">${need}</span>
              </div>`;
    };

    const slots = RESOURCE_BAR_SLOTS.map(slot => {
      const need = required[slot.key] ?? 0;
      if (!need) {
        return `<div class="res-bar-item cost-bar-item cost-bar-item--idle">
                  <span class="res-bar-icon">${slot.icon}</span>
                  <span class="res-bar-val">·</span>
                </div>`;
      }
      return slotHtml(slot.icon, slot.key, slot.label, need);
    }).join('');

    // Trophy costs (mercenary upgrades) have no column above to line up with.
    const extras = Object.entries(required)
      .filter(([key]) => !RESOURCE_BAR_SLOTS.some(s => s.key === key))
      .map(([key, need]) => {
        const name = key.replace(/_/g, ' ');
        const icon = `<img src="/assets/icons/recources/${key}.png" class="res-icon-img" alt="${name}" onerror="this.style.visibility='hidden'">`;
        return slotHtml(icon, key, name, need);
      }).join('');

    const bar = document.createElement('div');
    bar.id = COST_BAR_ID;
    bar.className = 'cost-bar-row';
    // The two ghost cells stand in for the timeline / errands buttons that flank
    // the strip above. Without them this bar would start at the screen edge and
    // every column would sit one button-width to the left.
    bar.innerHTML = `
      <span class="res-bar-btn cost-bar-ghost" aria-hidden="true"></span>
      <div class="resource-bar cost-bar">${slots}${extras}</div>
      <span class="res-bar-btn cost-bar-ghost" aria-hidden="true"></span>`;
    resourceRow.insertAdjacentElement('afterend', bar);
  }

  // `def.upgrades` lists the BUILDING ids this building can become — the same
  // shape MERCENARY_BUILDINGS uses, and kept in sync with UNIT_UPGRADE_PATHS.
  // The path table is preferred because it carries the unit each branch grants;
  // the fallback resolves the building defs directly so an entry missing from
  // the path table still yields a usable branch instead of a dead end.
  function getUpgradePathsForBuilding(faction, def) {
    if (!def || !def.upgrades || def.upgrades.length === 0) return [];
    const factionPaths = upgradePaths[faction] || {};
    const paths = factionPaths[def.unit_id];
    if (paths && paths.length > 0) return paths;
    return def.upgrades
      .map(bid => getBuildingDef(faction, bid))
      .filter(Boolean)
      .map(d => ({ unit_id: d.unit_id, building_id: d.id, label: d.label }));
  }

  function openSliderModal(title, slides, onConfirm, opts = {}) {
    let current = 0;

    function renderSliderHtml(idx) {
      const s = slides[idx];
      // Branch picker. An upgrade offers at most three paths, so they all fit as
      // portrait cards — the same frame art the roster, formation track and
      // initiative queue use — instead of arrows and dots that hide the choice.
      // Build sits to the LEFT of the portraits, deconstruct to the RIGHT, so
      // the whole bottom strip is one thumb-height row: act, choose, remove.
      const confirmLabel = s.confirmLabel || CASTLE_TEXT.confirm[castleLang];
      const cards = slides.map((slide, i) => `
        <div class="portrait-card portrait-card--branch ${i === idx ? 'portrait-card--selected' : ''}"
             data-i="${i}" title="${slide.unit?.name || slide.buildingLabel || ''}">
          ${slide.unit ? `<img class="portrait-art-img" src="${branchPortraitUrl(slide.unit)}" alt="${slide.unit.name}" onerror="this.style.display='none'">` : ''}
          <div class="portrait-name">${slide.unit?.name || slide.buildingLabel || ''}</div>
        </div>`).join('');

      return `
        <div class="castle-unit-slider">
          <div class="castle-slider-track" id="slider-track">
            ${buildUnitCard(s.unit, { buildingLabel: s.buildingLabel, compareUnit: s.compareUnit })}
          </div>
        </div>
        <div class="track-action-row track-action-row--framed">
          <button class="frame-action frame-action--confirm" id="slider-confirm"
                  title="${confirmLabel}" aria-label="${confirmLabel}">⚒</button>
          <div class="prep-track-wrap branch-track-wrap">
            <div class="portrait-track" id="branch-track">${cards}</div>
          </div>
          ${opts.deconstructSlot
            ? `<button class="frame-action frame-action--deconstruct" id="slider-deconstruct"
                       title="${CASTLE_TEXT.deconstruct[castleLang]}"
                       aria-label="${CASTLE_TEXT.deconstruct[castleLang]}">⛏</button>`
            : '<span class="frame-action frame-action--spacer" aria-hidden="true"></span>'}
        </div>`;
    }

    // The sheet's own ✕ is the only close control — no duplicate.
    openModal(title, renderSliderHtml(current));
    // The cost belongs to the SELECTED slide, so it is refreshed on every branch
    // change alongside the card, and torn down with the sheet however it closes.
    showCostBar(slides[current]?.cost ?? slides[current]?.mercCost);
    onSheetClose(hideCostBar);

    function attachAbilityListeners() {
      getSheetBody().querySelectorAll('.ability-icon:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
          const key  = btn.dataset.abilityKey;
          const type = btn.dataset.abilityType;
          const def  = resolveAbility(key);
          if (!def) return;
          const parts = buildAbilityModalParts(def, type);
          openAbilityModal(parts.title, parts.body, parts.badges);
        });
      });
    }

    // Every path that changes the selected branch goes through here, so the card
    // and the cost bar under the resource strip can never disagree about which
    // building is being priced.
    function showSlide(i) {
      current = i;
      getSheetBody().innerHTML = renderSliderHtml(current);
      showCostBar(slides[current]?.cost ?? slides[current]?.mercCost);
      attach();
    }

    function attach() {
      const sheetBody = getSheetBody();
      const track = sheetBody.querySelector('#slider-track');
      let touchStartX = null;
      let touchStartY = null;

      track?.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      track?.addEventListener('touchend', e => {
        if (touchStartX === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        touchStartX = null;
        if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 40) return;
        if (dx < 0 && current < slides.length - 1) showSlide(current + 1);
        else if (dx > 0 && current > 0)            showSlide(current - 1);
      });

      // The track scrolls like the roster strip: picking a branch slides it to
      // the middle, so the choice is never left half-hidden behind a button.
      const centreSelected = (behavior = 'smooth') => {
        sheetBody.querySelector('#branch-track .portrait-card--selected')
          ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior });
      };
      centreSelected('auto');

      sheetBody.querySelectorAll('#branch-track .portrait-card').forEach(card => {
        card.addEventListener('click', () => {
          const i = Number(card.dataset.i);
          if (i === current) return;
          showSlide(i);
        });
      });
      sheetBody.querySelector('#slider-confirm')?.addEventListener('click', () => onConfirm(slides[current]));
      sheetBody.querySelector('#slider-deconstruct')?.addEventListener('click', () => openDeconstructModal(opts.deconstructSlot));

      attachAbilityListeners();
    }

    attach();
  }

  // buildings_data mixes building slots with bookkeeping keys such as
  // throne_perks; anything that isn't slot_N must never be treated as a slot.
  function buildingSlotKeys(data) {
    return Object.keys(data || {})
      .filter(k => /^slot_\d+$/.test(k))
      .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
  }

  // HP bar for the unit standing in a slot. Same markup, classes and thresholds
  // as the roster portrait strip (portrait-hp-bar / portrait-hp-fill--<state>,
  // critical at <=33%), so the two read identically — a slot with no occupant
  // shows nothing rather than an empty bar.
  function nodeHpBar(slot) {
    const u = rosterUnitForSlot(slot);
    if (!u) return '';
    const stored = u.unit_data || {};
    const cur    = stored.current_hp;
    const max    = stored.max_hp;
    if (cur == null || max == null || max <= 0) return '';

    const alive = stored.alive !== false;
    if (!alive) return `<div class="portrait-status portrait-status--dead">💀</div>`;

    const pct     = Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
    const damaged = cur < max;
    const state   = pct <= 33 ? 'critical' : (damaged ? 'damaged' : 'ok');
    return `
      <div class="portrait-hp-bar" title="${cur}/${max}">
        <div class="portrait-hp-fill portrait-hp-fill--${state}" style="width:${pct}%"></div>
      </div>`;
  }

  function renderBuildings() {
    const data        = structuresRecord.buildings_data;
    const throneState = data['slot_0'];
    const throneLevel = throneState?.level ?? 0;
    const throneMaxed = throneLevel >= heroMaxLevel;

    // The unit a slot houses IS what the slot is for, so its portrait carries
    // the node instead of a generic glyph. Falls back to the glyph when there is
    // no unit (empty slot) or no art for it — see .castle-node--portrait, which
    // lays a gradient over the image to keep the label legible.
    const nodeBackground = unitId => {
      const unit = unitId ? getUnitByUnitId(unitId) : null;
      const url  = unit ? branchPortraitUrl(unit) : '';
      return url ? ` style="background-image:url('${url}')"` : '';
    };
    const throneDef  = throneState?.building_id ? getBuildingDef(player.faction, throneState.building_id) : null;
    const throneBg   = nodeBackground(throneDef?.unit_id);

    root.querySelector('#center-slot').innerHTML = `
      <div class="castle-node castle-node--throne castle-node--clickable ${throneBg ? 'castle-node--portrait' : ''}" data-slot="slot_0"${throneBg}>
        ${throneBg ? '' : '<div class="castle-node-icon">♛</div>'}
        ${nodeHpBar('slot_0')}
      </div>`;

    // buildings_data also carries non-slot keys (throne_perks); only slot_N
    // entries are castle nodes.
    root.querySelector('#outer-ring').innerHTML = buildingSlotKeys(data)
      .filter(s => s !== 'slot_0')
      .map(slot => {
        const state      = data[slot] || { level: 0, building_id: null };
        const def        = state.building_id ? getBuildingDef(player.faction, state.building_id) : null;
        const isEmpty    = !state.building_id;
        const hasUpgrade = def && getUpgradePathsForBuilding(player.faction, def).length > 0;
        // A mercenary slot's unit lives in MERCENARY_BUILDINGS, not the faction
        // pool, so both are consulted before giving up on a portrait.
        const mercDef    = !def && state.building_id ? getMercBuildingDef(state.building_id) : null;
        const bg         = nodeBackground((def || mercDef)?.unit_id);
        const classes    = ['castle-node', isEmpty ? 'castle-node--empty' : '', bg ? 'castle-node--portrait' : '']
          .filter(Boolean).join(' ');

        return `
          <div class="${classes}" data-slot="${slot}"${bg}>
            ${bg ? '' : `<div class="castle-node-icon">${isEmpty ? '＋' : '⚔'}</div>`}
            ${nodeHpBar(slot)}
          </div>`;
      }).join('');

    root.querySelectorAll('.castle-node').forEach(node => {
      node.addEventListener('click', () => handleSlotClick(node.dataset.slot));
    });

    if (throneLevel < 1 && !isTutorialDone(player, 'throne_upgrade')) {
      const throneEl = root.querySelector('.castle-node[data-slot="slot_0"]');
      showTutorialSpotlight(player, 'throne_upgrade', throneEl);
    } else if (throneLevel >= 1 && rosterCount < 3 && !isTutorialDone(player, 'second_building')) {
      const emptySlot = buildingSlotKeys(data)
        .filter(s => s !== 'slot_0' && s !== 'slot_4' && !data[s]?.building_id)
        .sort()[0];
      const targetEl = emptySlot ? root.querySelector(`.castle-node[data-slot="${emptySlot}"]`) : null;
      // The faction's "what to build first" advice rides along with this step —
      // the moment the choice is actually in front of the player.
      if (targetEl) showTutorialSpotlight(player, 'second_building', targetEl,
        { extraText: firstRecruitHint(player) });
      else hideTutorial();
    } else {
      runCastleOnboarding();
    }
  }

  // ── Onboarding, after the second building ─────────────────────────────────
  // These steps used to run on the roster screen, which handed the player a
  // slider of unit cards. Units live in castle slots now, so the whole chain
  // plays out here: inspect the building → its item slot → equip → the spells
  // that fix a fallen recruit → embark. The step IDs are unchanged, so a player
  // part-way through onboarding resumes rather than repeating.
  const STARTING_ITEM_KEY = 'padded_armor';

  // True only while the revive → heal lesson is running, so the two spell
  // buttons advance the chain during onboarding and never spotlight for a
  // veteran reviving a unit in normal play.
  let spellTutorialActive = false;

  function heroRosterUnit() {
    return rosterCache.find(u => u.is_hero === true) || null;
  }
  function slotOfUnit(unit) {
    return unit?.unit_data?.building_slot || null;
  }
  function nodeForSlot(slot) {
    return slot ? root.querySelector(`.castle-node[data-slot="${slot}"]`) : null;
  }
  function deadTutorialUnit() {
    return rosterCache.find(u => u.is_hero !== true && u.unit_data?.alive === false) || null;
  }
  function woundedTutorialUnit() {
    return rosterCache.find(u => u.is_hero !== true && u.unit_data?.alive !== false &&
      u.unit_data?.current_hp != null && u.unit_data?.max_hp != null &&
      u.unit_data.current_hp < u.unit_data.max_hp) || null;
  }
  function isEquippableBy(item, unit) {
    const stats = item.item_stats || {};
    const def   = resolveUnitDef(unit);
    const tags  = (def?.tags || []).filter(Boolean);
    return (!stats.faction || stats.faction === player.faction)
        && (!stats.tag_required || tags.includes(stats.tag_required))
        && !getEquipBlock(stats, def, UNIT_ABILITIES);
  }

  // A sheet slides up over 0.22s. Measuring a control inside it before that
  // settles reads a rect still off the bottom of the screen, which puts the
  // spotlight hole off-screen and leaves the blockers covering everything.
  function afterSheetSettles(fn, sub = false) {
    const sel = sub
      ? '.modal-overlay--sub:not(.hidden) .modal'
      : '.modal-overlay:not(.hidden):not(.modal-overlay--sub) .modal';
    const modal = document.querySelector(sel);
    if (!modal) { requestAnimationFrame(fn); return; }
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      modal.removeEventListener('animationend', run);
      fn();
    };
    modal.addEventListener('animationend', run);
    setTimeout(run, 400);   // in case the animation was skipped or already over
  }

  function runCastleOnboarding() {
    if (!isTutorialDone(player, 'second_building')) { hideTutorial(); return; }
    const hero = heroRosterUnit();

    // Self-heal: roster_equip is only marked when the player equips THROUGH the
    // tutorial. Someone who armed their hero any other way would keep the flag
    // false forever and be taught the same lesson on every castle visit. If it
    // is already moot, retire it.
    if (!isTutorialDone(player, 'roster_equip') &&
        (isTutorialDone(player, 'spell_heal') || (hero && equippedItemFor(hero.id)))) {
      markTutorialDone(player, 'roster_equip');
    }

    if (!isTutorialDone(player, 'roster_equip')) { startEquipChain(); return; }

    // Equip done but the spell lesson didn't finish (a reload mid-way): resume
    // it as long as there is still a fallen or wounded recruit to act on.
    if (!isTutorialDone(player, 'spell_heal') && (deadTutorialUnit() || woundedTutorialUnit())) {
      spellTutorialActive = true;
      showReviveStep();
      return;
    }
    hideTutorial();
  }

  function startEquipChain() {
    const hero = heroRosterUnit();
    if (!hero) { hideTutorial(); return; }
    // Nothing to teach if the hero is already armed, or has nothing to put on
    // (an account that registered before starting gear was granted). Just stop —
    // never mark the step done here, or a later item could never teach it.
    if (equippedItemFor(hero.id)) { hideTutorial(); return; }
    if (!itemsCache.some(it => !it.equipped_by && isEquippableBy(it, hero))) { hideTutorial(); return; }

    const slot = slotOfUnit(hero);
    const node = nodeForSlot(slot);
    if (!slot || !node) { hideTutorial(); return; }

    if (!isTutorialDone(player, 'roster_intro')) {
      // An action step: the tap opens the slot sheet through the node's own
      // click handler, and this only chains what happens next.
      showTutorialSpotlight(player, 'roster_intro', node, {
        onAdvance: () => {
          markTutorialDone(player, 'roster_intro');
          afterSheetSettles(() => showEquipSlotStep(hero));
        },
      });
      return;
    }

    // Intro already seen — open the sheet ourselves and pick up at the slot.
    openSlotUnitSheet(slot);
    afterSheetSettles(() => showEquipSlotStep(hero));
  }

  function showEquipSlotStep(hero) {
    const slotEl = getSheetBody()?.querySelector(`[data-item-slot][data-roster-id="${hero.id}"]`);
    if (!slotEl) return;
    showTutorialSpotlight(player, 'roster_equip_slot', slotEl, {
      // The same tap opens the item picker via the sheet's delegated handler,
      // which runs after this one — wait for that sub-sheet to settle first.
      onAdvance: () => afterSheetSettles(() => showEquipButtonStep(), true),
    });
  }

  // The picker shows one item at a time, so the button to point at is whichever
  // card is on screen. On a fresh account that is the starting armor; if the
  // player has other gear and it is showing instead, teaching Equip on that one
  // is the same lesson.
  function showEquipButtonStep() {
    const body    = getSubSheetBody();
    const buttons = [...(body?.querySelectorAll('.item-action-btn--equip:not([disabled])') || [])];
    const target  = buttons.find(b => {
      const item = itemsCache.find(it => String(it.id) === String(b.dataset.itemId));
      return (item?.item_stats?.key || item?.item_stats?.icon) === STARTING_ITEM_KEY;
    }) || buttons[0];
    if (target) showTutorialSpotlight(player, 'roster_equip', target);
  }

  // Payoff: the picker is closed and the slot now carries the item.
  function showEquippedStep(rosterId) {
    const slotEl = getSheetBody()?.querySelector(`[data-item-slot][data-roster-id="${rosterId}"]`);
    if (!slotEl) { startSpellTutorialOrEmbark(); return; }
    showTutorialSpotlight(player, 'roster_equipped', slotEl, {
      showContinue: true,
      onAdvance: () => showPassiveStackStep(),
    });
  }

  // Taught while the player is looking at the row where a unit's passives and
  // its item's passive sit side by side. Ranks add and cap at 3.
  function showPassiveStackStep() {
    if (isTutorialDone(player, 'roster_passive_stack')) { startSpellTutorialOrEmbark(); return; }
    const row = getSheetBody()?.querySelector('.unit-abilities-row');
    if (!row) { startSpellTutorialOrEmbark(); return; }
    showTutorialSpotlight(player, 'roster_passive_stack', row, {
      showContinue: true,
      onAdvance: () => {
        markTutorialDone(player, 'roster_passive_stack');
        startSpellTutorialOrEmbark();
      },
    });
  }

  function startSpellTutorialOrEmbark() {
    closeSheet();
    if (!isTutorialDone(player, 'spell_heal') && (deadTutorialUnit() || woundedTutorialUnit())) {
      spellTutorialActive = true;
      showReviveStep();
    } else {
      navigate('embark', { player });
    }
  }

  // Revive and Heal both live on the fallen recruit's own slot sheet, so each
  // step opens that sheet and points at the button on it.
  function showReviveStep() {
    if (isTutorialDone(player, 'spell_revive')) { showHealStep(); return; }
    const dead = deadTutorialUnit();
    const slot = slotOfUnit(dead);
    if (!dead || !slot) { showHealStep(); return; }
    openSlotUnitSheet(slot);
    afterSheetSettles(() => {
      const btn = getSheetBody()?.querySelector('.resurrect-btn');
      if (!btn) { showHealStep(); return; }
      // An action step: the resurrect handler marks it done and chains onward
      // once the unit is really back on its feet.
      showTutorialSpotlight(player, 'spell_revive', btn);
    });
  }

  function showHealStep() {
    const finish = () => {
      markTutorialDone(player, 'spell_heal');
      spellTutorialActive = false;
      closeSheet();
      navigate('embark', { player });
    };
    if (isTutorialDone(player, 'spell_heal')) { spellTutorialActive = false; closeSheet(); navigate('embark', { player }); return; }
    const target = woundedTutorialUnit();
    const slot   = slotOfUnit(target);
    if (!target || !slot) { finish(); return; }
    openSlotUnitSheet(slot);
    afterSheetSettles(() => {
      const btn = getSheetBody()?.querySelector('.heal-btn');
      if (!btn) { finish(); return; }
      showTutorialSpotlight(player, 'spell_heal', btn);
    });
  }

  function getMercBuildingDef(buildingId) {
    for (const pool of Object.values(mercenaryBuildings)) {
      const found = pool.find(b => b.id === buildingId);
      if (found) return found;
    }
    return null;
  }

  function getMercUpgradePaths(def) {
    if (!def || !def.upgrades || !def.upgrades.length) return [];
    const pool = mercenaryBuildings[def.region] || [];
    return def.upgrades.map(uid => pool.find(b => b.id === uid)).filter(Boolean);
  }

  const FAVOR_LABELS = {
    // Dative case in RU — the prayer is addressed TO the god:
    // Митраил → Митраилю, Агграил → Агграилю, Асталот → Асталоту.
    empire:              { en: 'Devotion to Mithrail', ru: 'Молитва Митраилю' },
    choir_of_the_cursed: { en: 'Song to Aggrail',      ru: 'Песнь Агграилю' },
    grail_of_sorrow:     { en: 'Dirge to Astaloth',    ru: 'Плач Асталоту' },
  };
  const FAVOR_FALLBACK = { en: 'Ask for a favor', ru: 'Просить о милости' };
  const FAVOR_ERRORS = {
    favor_cap:        { en: 'No favors left today. Come back tomorrow.', ru: 'На сегодня милостей больше нет. Возвращайтесь завтра.' },
    favor_not_needed: { en: 'This unit needs no favor.',                 ru: 'Этому бойцу милость не нужна.' },
    favor_none:       { en: 'No favor in progress.',                     ru: 'Нет активной молитвы.' },
    favor_expired:    { en: 'The moment passed — try again.',            ru: 'Момент упущен — попробуйте снова.' },
    favor_early:      { en: 'The ad has not finished.',                  ru: 'Реклама ещё не досмотрена.' },
    favor_no_unit:    { en: 'Unit not found.',                           ru: 'Боец не найден.' },
  };

  function favorError(err) {
    return FAVOR_ERRORS[err?.code]?.[castleLang] || CASTLE_TEXT.favorFailed[castleLang];
  }

  async function runFavor(slot, rosterId) {
    let started;
    try {
      started = await api('/favor/start', { chat_id: player.chat_id, roster_id: rosterId });
    } catch (err) {
      alert(favorError(err));
      return;
    }

    const completed = await playAdPlaceholder(started.seconds ?? favorSeconds);
    if (!completed) return;   // cancelled — the token is simply left unclaimed

    try {
      const res = await api('/favor/claim', { chat_id: player.chat_id, token: started.token });
      favorRemaining = res.remaining ?? Math.max(0, favorRemaining - 1);
      await reloadFromBootstrap();
      openSlotUnitSheet(slot);
    } catch (err) {
      alert(favorError(err));
    }
  }

  // Resolves true if the "ad" ran to completion, false if the player backed out.
  function playAdPlaceholder(seconds) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'favor-overlay';
      overlay.innerHTML = `
        <div class="favor-modal">
          <div class="favor-modal-ad">
            <span class="favor-modal-adbadge">${CASTLE_TEXT.adBadge[castleLang]}</span>
            <span class="favor-modal-adtext">${CASTLE_TEXT.favorPlaceholder[castleLang]}</span>
          </div>
          <div class="favor-modal-title">${CASTLE_TEXT.favorWatching[castleLang]}</div>
          <div class="favor-modal-bar"><div class="favor-modal-fill"></div></div>
          <div class="favor-modal-count">${seconds}</div>
          <button class="favor-modal-cancel">${CASTLE_TEXT.favorCancel[castleLang]}</button>
        </div>`;
      document.body.appendChild(overlay);

      const fill  = overlay.querySelector('.favor-modal-fill');
      const count = overlay.querySelector('.favor-modal-count');
      const endAt = Date.now() + seconds * 1000;

      let done = false;
      const finish = ok => {
        if (done) return;
        done = true;
        clearInterval(timer);
        overlay.remove();
        resolve(ok);
      };

      // Driven off wall-clock rather than a tick count, so a backgrounded tab
      // (which throttles intervals) doesn't leave the bar stuck behind the
      // server's own timer.
      const timer = setInterval(() => {
        const leftMs = endAt - Date.now();
        const left   = Math.max(0, Math.ceil(leftMs / 1000));
        count.textContent = left;
        fill.style.width  = `${Math.min(100, 100 - (leftMs / (seconds * 1000)) * 100)}%`;
        if (leftMs <= 0) finish(true);
      }, 100);

      overlay.querySelector('.favor-modal-cancel').addEventListener('click', () => finish(false));
    });
  }

  // Resurrect / Heal, lifted from the roster screen unchanged: the same two
  // spells (resurrect = a roster-usage single-ally spell, heal = an effect_type
  // 'heal' single-ally one), the same crystal cost formatting, the same
  // .unit-card-overlay--actions markup, and the same /roster/resurrect and
  // /roster/heal endpoints. Divine favor is deliberately NOT copied — it is
  // gated on the roster's onboarding state, which does not exist here.
  function spellCostLabel(spell) {
    return spell
      ? Object.entries(spell.cost?.crystals || {})
          .filter(([, amt]) => amt > 0)
          .map(([type, amt]) => `${type.replace('Crystals_', '')} ${amt}`)
          .join(', ')
      : '';
  }

  function unitActionOverlay(rosterUnit) {
    const stored = rosterUnit.unit_data || {};
    const alive  = stored.alive !== false;
    const isDamaged = alive && stored.current_hp != null && stored.max_hp != null
                   && stored.current_hp < stored.max_hp;

    const resurrectionSpell = SPELLS[player.faction]?.find(s => s.usage === 'roster' && s.target_scope === 'single_ally');
    const healSpell         = SPELLS[player.faction]?.find(s => s.effect_type === 'heal' && s.target_scope === 'single_ally');

    // Offered whenever a unit is dead or hurt, INCLUDING when the player cannot
    // afford (or has not learned) the spell — that gap is the whole point of it.
    // Hidden for the whole of onboarding: the spell tutorial exists to teach
    // Resurrect and Heal on exactly the unit this button would fix in one tap,
    // so offering the shortcut there teaches players to skip the mechanic being
    // taught, and puts an ad in front of someone who has not seen the game yet.
    const onboarding  = !isTutorialDone(player, 'spell_heal');
    const favorNeeded = (!alive || isDamaged) && !onboarding;
    const favorLabel  = (FAVOR_LABELS[player.faction] || FAVOR_FALLBACK)[castleLang];
    const favorHtml = favorNeeded ? `
        <button class="favor-btn${favorRemaining <= 0 ? ' favor-btn--spent' : ''}"
                data-roster-id="${rosterUnit.id}"
                ${favorRemaining <= 0 ? 'disabled' : ''}>
          <span class="favor-btn-top">
            <span class="favor-btn-ad">${CASTLE_TEXT.adBadge[castleLang]}</span>
            <span class="favor-btn-label">${favorLabel}</span>
          </span>
          <span class="favor-btn-left">${favorRemaining > 0
            ? CASTLE_TEXT.favorLeft[castleLang](favorRemaining)
            : CASTLE_TEXT.favorNoneUI[castleLang]}</span>
        </button>` : '';

    const resurrectHtml = !alive && resurrectionSpell ? `
        <button class="resurrect-btn" data-roster-id="${rosterUnit.id}" data-spell-id="${resurrectionSpell.id}">
          ${CASTLE_TEXT.resurrect[castleLang]} (${spellCostLabel(resurrectionSpell)})
        </button>` : '';

    const healHtml = isDamaged && healSpell ? `
        <button class="heal-btn" data-roster-id="${rosterUnit.id}" data-spell-id="${healSpell.id}">
          ${CASTLE_TEXT.heal[castleLang]} (${spellCostLabel(healSpell)})
        </button>` : '';

    if (!favorHtml && !resurrectHtml && !healHtml) return '';
    // ONE overlay holding favor + spell, stacked, so favor sits directly above
    // the spell button instead of the two being positioned independently.
    // A dead unit's button owns the middle of the card; a wounded one is still
    // playable, so --heal drops its buttons low and out of the way.
    return `
      <div class="unit-card-overlay unit-card-overlay--actions ${alive ? 'unit-card-overlay--heal' : ''}">
        ${favorHtml}
        ${resurrectHtml}
        ${healHtml}
      </div>`;
  }

  // ── Slot unit sheet ───────────────────────────────────────────────────────
  // Tapping a built slot used to drop straight into the upgrade branch picker.
  // It now opens the UNIT standing in that slot — its real roster row, with the
  // item it carries — and upgrading is a deliberate second step behind its own
  // button. The slot is the unit's home, so this is where you manage it.
  function openSlotUnitSheet(slot) {
    const state = structuresRecord.buildings_data[slot];
    if (!state?.building_id) return;

    const mercDef = getMercBuildingDef(state.building_id);
    const def     = mercDef || getBuildingDef(player.faction, state.building_id);
    if (!def) { openModal('Error', '<p class="modal-empty">Building definition not found.</p>'); return; }

    const paths = mercDef ? getMercUpgradePaths(mercDef) : getUpgradePathsForBuilding(player.faction, def);
    const rosterUnit = rosterUnitForSlot(slot);
    const item       = rosterUnit ? equippedItemFor(rosterUnit.id) : null;

    // Prefer the roster row: it carries current HP/XP and can hold an item. A
    // slot with no occupant yet (building raised, unit not spawned) still shows
    // the blueprint so the sheet is never empty.
    const baseUnit = rosterUnit ? resolveUnitDef(rosterUnit) : getUnitByUnitId(def.unit_id);
    const liveUnit = rosterUnit && item ? withEquippedItem(baseUnit, item) : baseUnit;

    const itemSlotHtml = rosterUnit
      ? renderItemSlotIcon(item, rosterUnit.id, { player })
      : '';

    const canUpgrade = paths && paths.length > 0;
    const actionOverlayHtml = rosterUnit ? unitActionOverlay(rosterUnit) : '';
    // Wrapper is not cosmetic: openSheet only replaces the body's innerHTML, so
    // the body element itself survives across opens and a listener bound to it
    // would accumulate — re-opening the sheet twice would fire equip twice.
    // Binding to this div instead ties the listener's life to the content.
    const bodyHtml = `
      <div id="slot-sheet-root">
      <div class="castle-unit-card-wrap">
        ${buildUnitCard(liveUnit, { buildingLabel: def.label, itemSlotHtml })}
        ${actionOverlayHtml}
      </div>
      <div class="track-action-row track-action-row--framed">
        ${canUpgrade
          ? `<button class="frame-action frame-action--confirm" id="slot-upgrade"
                     title="${CASTLE_TEXT.upgrade[castleLang]}" aria-label="${CASTLE_TEXT.upgrade[castleLang]}">⚒</button>`
          : `<span class="castle-slot-maxed">${CASTLE_TEXT.maxed[castleLang]}</span>`}
        <button class="frame-action frame-action--deconstruct" id="slot-deconstruct"
                title="${CASTLE_TEXT.deconstruct[castleLang]}" aria-label="${CASTLE_TEXT.deconstruct[castleLang]}">⛏</button>
      </div>
      </div>`;

    openModal(def.label, bodyHtml);

    const body = getSheetBody()?.querySelector('#slot-sheet-root');
    body?.addEventListener('click', e => {
      // Stat / ability / resist inspection, same as every other unit card.
      if (handleUnitInspect(e, openAbilityModal)) return;

      const itemSlot = e.target.closest('[data-item-slot]');
      if (itemSlot) { openSlotItemPicker(slot, itemSlot.dataset.rosterId); return; }

      const favorBtn = e.target.closest('.favor-btn:not([disabled])');
      if (favorBtn) { runFavor(slot, favorBtn.dataset.rosterId); return; }

      const resurrectBtn = e.target.closest('.resurrect-btn');
      const healBtn      = e.target.closest('.heal-btn');
      if (resurrectBtn || healBtn) {
        const btn  = resurrectBtn || healBtn;
        const path = resurrectBtn ? '/roster/resurrect' : '/roster/heal';
        btn.disabled    = true;
        btn.textContent = resurrectBtn
          ? CASTLE_TEXT.resurrecting[castleLang]
          : CASTLE_TEXT.healing[castleLang];
        api(path, {
          chat_id: player.chat_id,
          roster_id: btn.dataset.rosterId,
          spell_id: btn.dataset.spellId,
        })
          .then(async () => {
            await reloadFromBootstrap();
            openSlotUnitSheet(slot);
            // Onboarding: revive done → on to the heal step; heal done → the
            // spell lesson is over and the player is ready to embark. Gated on
            // spellTutorialActive so a veteran reviving a unit in normal play
            // never gets a spotlight.
            if (!spellTutorialActive) return;
            if (resurrectBtn && !isTutorialDone(player, 'spell_revive')) {
              markTutorialDone(player, 'spell_revive');
              hideTutorial();
              showHealStep();
            } else if (healBtn && !isTutorialDone(player, 'spell_heal')) {
              markTutorialDone(player, 'spell_heal');
              spellTutorialActive = false;
              hideTutorial();
              closeModal();
              navigate('embark', { player });
            }
          })
          .catch(err => {
            btn.disabled = false;
            openAbilityModal(def.label, renderModalContent(err?.message || 'Failed.'));
          });
        return;
      }
    });

    body?.querySelector('#slot-upgrade')?.addEventListener('click', () => {
      if (mercDef) openMercUpgradeModal(slot, mercDef, paths);
      else         openUpgradeModal(slot, def, paths);
    });
    body?.querySelector('#slot-deconstruct')?.addEventListener('click', () => openDeconstructModal(slot));
  }

  // ── Item equipping, in the castle ─────────────────────────────────────────
  // Lives here rather than on the roster screen: the castle slot is now the
  // unit's home, and the roster is being turned into a dedicated item tab.
  // Item art, stat chips, passive and tag chips — the same card the roster
  // showed. An item is chosen by what it DOES, and a name alone says none of it.
  const ITEM_STAT_ICONS = {
    hp:           { icon: '❤',  en: 'HP',         ru: 'HP' },
    armor:        { icon: '🛡',  en: 'Armor',      ru: 'Броня' },
    action_power: { icon: '⚔',  en: 'Power',      ru: 'Сила' },
    initiative:   { icon: '⚡', en: 'Initiative', ru: 'Инициатива' },
  };

  function itemStatChip(key, val) {
    const sign = val >= 0 ? '+' : '';
    const cls  = val >= 0 ? 'stat-chip--pos' : 'stat-chip--neg';

    const resistMatch = key.match(/^(air|fire|nature|cold|life|death)_resist$/);
    if (resistMatch) {
      const r     = resistMatch[1];
      const icon  = RESIST_ICONS[r]?.icon ?? '◆';
      const label = `${cap(r)} ${castleLang === 'ru' ? 'сопротивление' : 'Resist'}`;
      return `<span class="stat-chip ${cls}" title="${label} ${sign}${val}">
                <span class="stat-chip-icon">${icon}</span>${sign}${val}
              </span>`;
    }

    const meta  = ITEM_STAT_ICONS[key];
    const icon  = meta?.icon ?? '◆';
    const label = meta ? meta[castleLang] : cap(key);
    return `<span class="stat-chip ${cls}" title="${label} ${sign}${val}">
              <span class="stat-chip-icon">${icon}</span>${sign}${val}
            </span>`;
  }

  function itemStatModsHtml(statMods) {
    return Object.entries(statMods || {}).map(([k, v]) => itemStatChip(k, v)).join('');
  }

  function itemPassiveHtml(stats) {
    const key = stats?.passive;
    if (!key) return '';
    const def   = resolveAbility(key);
    const label = def?.name || String(key).split(' ')[0].replace(/_/g, ' ');
    return `<button class="item-passive" data-ability-key="${key}" data-ability-type="passive">
              <span class="item-passive-icon">✦</span>${label}
            </button>`;
  }

  // `unitTags` marks an unmet requirement on the chip itself, so the reason line
  // underneath never has to repeat it.
  function itemTagsHtml(stats, unitTags = null) {
    const unmet = stats.tag_required && Array.isArray(unitTags) && !unitTags.includes(stats.tag_required);
    return [
      stats.tag_required ? `<span class="item-card-tag ${unmet ? 'item-card-tag--unmet' : ''}">${CASTLE_TEXT.requires[castleLang]}: ${stats.tag_required}</span>` : '',
      stats.adds_tag     ? `<span class="item-card-tag item-card-tag--adds">${CASTLE_TEXT.grantsTag[castleLang]}: ${stats.adds_tag}</span>` : '',
    ].join('');
  }

  // ── Item equipping, in the castle ─────────────────────────────────────────
  // Lives here rather than on the roster screen: the castle slot is now the
  // unit's home, and the roster tab has become a dedicated item screen. Crafting
  // is deliberately absent — this sheet only decides what the unit wears.
  function openSlotItemPicker(slot, rosterId) {
    const unit = rosterCache.find(u => String(u.id) === String(rosterId));
    if (!unit) return;

    const unitDef  = resolveUnitDef(unit);
    const unitTags = (unitDef?.tags || []).filter(Boolean);

    let filter     = 'equippable';   // 'equippable' | 'owned'
    let rarity     = 'all';
    let statFilter = 'all';
    let selected   = 0;

    const itemKeyOf = it => it.item_stats?.key || it.item_stats?.icon;
    const RARITIES  = ['common', 'rare', 'epic', 'mythic'];
    const STAT_FILTERS = [
      ['hp',           CASTLE_TEXT.statHp[castleLang]],
      ['armor',        CASTLE_TEXT.statArmor[castleLang]],
      ['initiative',   CASTLE_TEXT.statInit[castleLang]],
      ['action_power', CASTLE_TEXT.statPower[castleLang]],
      ['resist',       CASTLE_TEXT.statResist[castleLang]],
    ];
    const TRAIT_FILTERS = [
      ['passive',    CASTLE_TEXT.traitPassive[castleLang]],
      ['grants_tag', CASTLE_TEXT.traitGrants[castleLang]],
      ['needs_tag',  CASTLE_TEXT.traitNeeds[castleLang]],
    ];

    function matchesStat(stats) {
      if (statFilter === 'all') return true;
      if (statFilter === 'passive')    return !!stats?.passive;
      if (statFilter === 'grants_tag') return !!stats?.adds_tag;
      if (statFilter === 'needs_tag')  return !!stats?.tag_required;
      const mods = stats?.stat_mods || {};
      if (statFilter === 'resist') return Object.keys(mods).some(k => k.endsWith('_resist'));
      return Object.prototype.hasOwnProperty.call(mods, statFilter);
    }

    const matchesRarity = it => rarity === 'all' || itemRarity(it) === rarity;

    // The filtered list, as DATA — the big card and the selector track are two
    // views of it, so they cannot disagree about what is on screen.
    function currentList() {
      const visible = itemsCache.filter(it => {
        if (!matchesRarity(it) || !matchesStat(it.item_stats)) return false;
        if (filter === 'owned') return true;
        const stats     = it.item_stats || {};
        const factionOk = !stats.faction || stats.faction === player.faction;
        const tagOk     = !stats.tag_required || unitTags.includes(stats.tag_required);
        const here      = String(it.equipped_by) === String(rosterId);
        return here || (factionOk && tagOk && it.equipped_by == null);
      });

      // Five Padded Armors are one entry reading ×5, not five identical cards.
      // A worn copy stays its own entry — its card names its carrier, or offers
      // Unequip, and neither can be merged into a stack.
      const stacks = new Map();
      const out = [];
      for (const it of visible) {
        const key = itemKeyOf(it);
        if (it.equipped_by != null || !key) { out.push({ item: it, count: 1 }); continue; }
        const stack = stacks.get(key);
        if (stack) { stack.count += 1; continue; }
        const entry = { item: it, count: 1 };
        stacks.set(key, entry);
        out.push(entry);
      }
      return out;
    }

    function itemCard(entry) {
      if (!entry) return `<p class="placeholder">${CASTLE_TEXT.nothingMatches[castleLang]}</p>`;
      const it     = entry.item;
      const stats  = it.item_stats || {};
      const iconId = stats.icon || stats.key || 'item';
      const here   = String(it.equipped_by) === String(rosterId);
      const elsewhere = it.equipped_by != null && !here;
      const factionOk = !stats.faction || stats.faction === player.faction;
      const tagOk     = !stats.tag_required || unitTags.includes(stats.tag_required);
      // Incoherent pairings are refused with the reason spelled out, matching
      // what POST /items/equip enforces server-side (data/item_rules.js).
      const block     = getEquipBlock(stats, unitDef, UNIT_ABILITIES);
      const canEquip  = factionOk && tagOk && !block && !here && !elsewhere;

      // Only reasons the card cannot state any other way — a missing tag is
      // already written on the red "Requires: X" chip.
      let reason = '';
      if (!factionOk)     reason = CASTLE_TEXT.wrongFaction[castleLang];
      else if (block)     reason = castleLang === 'ru' ? block.reason_ru : block.reason;
      else if (elsewhere) reason = CASTLE_TEXT.equippedElse[castleLang];

      const holder = elsewhere
        ? rosterCache.find(u => String(u.id) === String(it.equipped_by))
        : null;
      const holderName = holder ? (resolveUnitDef(holder)?.name ?? '') : '';
      const countLine  = entry.count > 1
        ? `×${entry.count}`
        : (holderName ? `${CASTLE_TEXT.equippedOn[castleLang]} ${holderName}` : '');

      return `
        <div class="item-card item-card--rarity-${itemRarity(it)} ${here ? 'item-card--equipped' : ''}">
          <div class="item-card-body">
            <div class="item-card-aside">
              <div class="item-card-icon">
                <img src="/assets/icons/items/${iconId}.png" alt="${itemName(it, player)}"
                     onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                <span class="item-card-icon-fallback" style="display:none;">⚙</span>
              </div>
              <div class="item-card-rarity item-card-rarity--${itemRarity(it)}">${CASTLE_TEXT['rarity_' + itemRarity(it)][castleLang]}</div>
              ${stats.unique ? `<div class="item-card-unique">${CASTLE_TEXT.unique[castleLang]}</div>` : ''}
              ${countLine ? `<div class="item-card-count-line">${countLine}</div>` : ''}
            </div>
            <div class="item-card-main">
              <div class="item-card-name">${itemName(it, player)}</div>
              <div class="item-card-stats">${itemStatModsHtml(stats.stat_mods)}</div>
              ${itemPassiveHtml(stats)}
              <div class="item-card-tags">${itemTagsHtml(stats, unitTags)}</div>
            </div>
          </div>
          ${here
            ? `<button class="item-action-btn item-action-btn--unequip" data-item-id="${it.id}">${CASTLE_TEXT.unequip[castleLang]}</button>`
            : `<button class="item-action-btn item-action-btn--equip" data-item-id="${it.id}" data-roster-id="${rosterId}" ${canEquip ? '' : 'disabled'}>${CASTLE_TEXT.equip[castleLang]}</button>`}
          ${reason && !here ? `<div class="item-card-blocked">${reason}</div>` : ''}
        </div>`;
    }

    function trackCards(list) {
      if (!list.length) return `<span class="track-empty-hint">${CASTLE_TEXT.nothingMatches[castleLang]}</span>`;
      return list.map((entry, i) => {
        const stats = entry.item.item_stats || {};
        const icon  = stats.icon || stats.key || 'item';
        const name  = itemName(entry.item, player);
        return `
          <div class="portrait-card portrait-card--item ${i === selected ? 'portrait-card--selected' : ''}"
               data-i="${i}" title="${name}">
            <img class="portrait-art-img" src="/assets/icons/items/${icon}.png" alt="${name}"
                 onerror="this.style.display='none'">
            ${entry.count > 1 ? `<span class="item-track-owned">${entry.count}</span>` : ''}
          </div>`;
      }).join('');
    }

    function render() {
      const tab = (id, label) =>
        `<button class="items-tab ${filter === id ? 'items-tab--active' : ''}" data-filter="${id}">${label}</button>`;
      const opt = (id, label, cur) =>
        `<option value="${id}"${cur === id ? ' selected' : ''}>${label}</option>`;

      const list = currentList();
      if (selected >= list.length) selected = 0;

      if (!itemsCache.length) {
        return `<div id="slot-item-root"><p class="modal-empty">${CASTLE_TEXT.noItems[castleLang]}</p></div>`;
      }

      return `
        <div class="items-modal" id="slot-item-root">
          <div class="items-tabs">
            ${tab('equippable', CASTLE_TEXT.tabEquippable[castleLang])}
            ${tab('owned', CASTLE_TEXT.tabOwned[castleLang])}
          </div>

          <div class="items-filters">
            <div class="items-filter-row items-filter-row--selects">
              <select class="items-select items-select--rarity-${rarity}"
                      id="items-rarity-select" aria-label="${CASTLE_TEXT.filterRarity[castleLang]}">
                ${opt('all', CASTLE_TEXT.any[castleLang], rarity)}
                ${RARITIES.map(r => opt(r, CASTLE_TEXT[r][castleLang], rarity)).join('')}
              </select>

              <select class="items-select" id="items-stat-select" aria-label="${CASTLE_TEXT.filterStat[castleLang]}">
                ${opt('all', CASTLE_TEXT.all[castleLang], statFilter)}
                <optgroup label="${CASTLE_TEXT.groupStats[castleLang]}">
                  ${STAT_FILTERS.map(([id, label]) => opt(id, label, statFilter)).join('')}
                </optgroup>
                <optgroup label="${CASTLE_TEXT.groupTraits[castleLang]}">
                  ${TRAIT_FILTERS.map(([id, label]) => opt(id, label, statFilter)).join('')}
                </optgroup>
              </select>
            </div>
          </div>

          <div class="item-detail" id="item-detail">${itemCard(list[selected])}</div>

          <div class="prep-track-wrap items-track-wrap">
            <div class="portrait-track" id="items-track">${trackCards(list)}</div>
          </div>
        </div>`;
    }

    // The shell is not cosmetic: openSubSheet only replaces the body's
    // innerHTML, so the body element itself survives across opens and listeners
    // bound to it would accumulate — re-opening this picker twice would fire
    // equip twice. Binding to a wrapper created fresh per open ties the
    // listeners' life to the content, and repaint() only ever swaps what is
    // INSIDE the shell, so the wrapper (and its listeners) survive a repaint.
    openSubSheet(CASTLE_TEXT.itemsTitle[castleLang], `<div id="slot-item-shell">${render()}</div>`);

    const shell   = getSubSheetBody()?.querySelector('#slot-item-shell');
    const rootEl  = () => shell?.querySelector('#slot-item-root');
    const repaint = () => { if (shell) shell.innerHTML = render(); };

    function centreSelected(behavior = 'smooth') {
      rootEl()?.querySelector('#items-track .portrait-card--selected')
        ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior });
    }

    // Repaint the detail card and the selector track together — two views of
    // currentList(), so they must not drift apart.
    function refreshList() {
      const list = currentList();
      if (selected >= list.length) selected = 0;
      const el = rootEl();
      const detail = el?.querySelector('#item-detail');
      const track  = el?.querySelector('#items-track');
      if (detail) detail.innerHTML = itemCard(list[selected]);
      if (track)  track.innerHTML  = trackCards(list);
      centreSelected('auto');
    }

    shell?.addEventListener('change', e => {
      const sel = e.target.closest('select');
      if (!sel) return;
      if (sel.id === 'items-rarity-select') {
        rarity = sel.value;
        // Keeps the closed select tinted with the rarity it is showing.
        sel.className = `items-select items-select--rarity-${rarity}`;
        selected = 0;
        refreshList();
        return;
      }
      if (sel.id === 'items-stat-select') {
        statFilter = sel.value;
        selected = 0;
        refreshList();
      }
    });

    shell?.addEventListener('click', async e => {
      const tabBtn = e.target.closest('[data-filter]');
      if (tabBtn) { filter = tabBtn.dataset.filter; selected = 0; repaint(); return; }

      const trackCard = e.target.closest('#items-track .portrait-card');
      if (trackCard) {
        selected = Number(trackCard.dataset.i);
        const list = currentList();
        rootEl().querySelector('#item-detail').innerHTML = itemCard(list[selected]);
        rootEl().querySelectorAll('#items-track .portrait-card').forEach((c, ci) =>
          c.classList.toggle('portrait-card--selected', ci === selected));
        centreSelected();
        return;
      }

      // The item's passive — same description modal the unit card uses.
      const passiveBtn = e.target.closest('.item-passive');
      if (passiveBtn) {
        const def = resolveAbility(passiveBtn.dataset.abilityKey);
        if (def) {
          const parts = buildAbilityModalParts(def, 'passive');
          openAbilityModal(parts.title, parts.body, parts.badges);
        }
        return;
      }

      const equipBtn   = e.target.closest('.item-action-btn--equip:not([disabled])');
      const unequipBtn = e.target.closest('.item-action-btn--unequip');
      if (!equipBtn && !unequipBtn) return;

      const btn = equipBtn || unequipBtn;
      btn.disabled = true;
      // Whether this equip is onboarding's equip beat has to be read BEFORE the
      // await — reloadFromBootstrap re-runs renderBuildings, and with it the
      // onboarding gate — but the step is only marked once the equip has really
      // succeeded, never on the tap that requested it.
      const teachingEquip = !!equipBtn && !isTutorialDone(player, 'roster_equip');
      try {
        if (equipBtn) {
          await api('/items/equip', {
            chat_id: player.chat_id,
            roster_id: equipBtn.dataset.rosterId,
            item_id: equipBtn.dataset.itemId,
          });
        } else {
          await api('/items/unequip', { chat_id: player.chat_id, item_id: unequipBtn.dataset.itemId });
        }
        await reloadFromBootstrap();
        closeSubSheet();
        openSlotUnitSheet(slot);   // re-open so the card shows the new loadout
        if (teachingEquip) {
          markTutorialDone(player, 'roster_equip');
          afterSheetSettles(() => showEquippedStep(equipBtn.dataset.rosterId));
        }
      } catch (err) {
        btn.disabled = false;
        openAbilityModal(CASTLE_TEXT.itemsTitle[castleLang],
          renderModalContent(err?.message || 'Failed.'));
      }
    });
  }

  async function handleSlotClick(slot) {
    const state = structuresRecord.buildings_data[slot];
    if (!state || !state.building_id) { openBuildModal(slot); return; }
    openSlotUnitSheet(slot);
  }

  // ── Deconstruction ────────────────────────────────────────────────────────
  // Respec swaps the slot for a same-tier sibling at RESPEC_COST_PCT of its
  // cost; Demolish empties it entirely. The throne is respec-only — a player
  // without a throne has no hero. Both are server-validated; this is the UI.
  function openDeconstructModal(slot) {
    const state = structuresRecord.buildings_data[slot];
    if (!state?.building_id) return;
    const def     = getBuildingDef(player.faction, state.building_id);
    const options = respecOptionsFor(state.building_id);
    const isThrone = slot === 'slot_0';
    const ru = castleLang === 'ru';

    openModal(ru ? 'Разбор' : 'Deconstruct', `
      <div class="deconstruct-body">
        ${options.length
          ? `<button class="deconstruct-btn deconstruct-btn--respec" id="deconstruct-respec">
               ${ru ? 'Сменить ветку' : 'Respec Building'}
             </button>
             <p class="deconstruct-intro">
               ${ru
                 ? `Смена ветки того же уровня стоит ${respecCostPct}% цены нового здания. Опыт бойца сохраняется.`
                 : `Switching to another branch of the same tier costs ${respecCostPct}% of the new building's price. The unit keeps its XP.`}
             </p>`
          : `<p class="modal-empty">${ru ? 'Нет вариантов того же уровня.' : 'No same-tier alternatives.'}</p>`}
        ${isThrone
          ? `<p class="deconstruct-note">${ru ? 'Трон нельзя снести.' : 'The throne cannot be demolished.'}</p>`
          : `<button class="deconstruct-btn" id="deconstruct-clear">
               ${ru ? 'Снести здание' : 'Demolish Building'}
             </button>
             <p class="deconstruct-warn">
               ${ru
                 ? 'Здание и его боец будут удалены безвозвратно. Снаряжение вернётся в хранилище. Возврата ресурсов нет.'
                 : 'The building and its unit are destroyed for good. Equipped gear returns to your stash. Nothing is refunded.'}
             </p>`}
      </div>`);

    getSheetBody()?.querySelector('#deconstruct-respec')?.addEventListener('click', () => {
      openRespecPicker(slot, options, state.level);
    });
    getSheetBody()?.querySelector('#deconstruct-clear')?.addEventListener('click', () => {
      confirmAndClear(slot, def);
    });
  }

  // WHICH branch to switch to is the next question, asked in the picker the
  // rest of the castle already uses: one unit card at a time, the branch track
  // underneath, and the price on the cost bar under the resource strip. The
  // flat list of every same-tier sibling said all of that at once, in words.
  function openRespecPicker(slot, options, level) {
    const ru = castleLang === 'ru';
    const currentDef  = getBuildingDef(player.faction, structuresRecord.buildings_data[slot]?.building_id);
    const currentUnit = currentDef ? getUnitByUnitId(currentDef.unit_id) : null;

    openSliderModal(ru ? 'Сменить ветку' : 'Respec',
      options.map(o => {
        const unit     = getUnitByUnitId(o.unit_id);
        const cost     = respecCostFor(o.id, level);
        const costText = costLabelFor(cost);
        const name     = unit?.name || o.label;
        return {
          unit,
          buildingLabel: name,
          confirmLabel:  costText
            ? `${ru ? 'Сменить' : 'Respec'} → ${name} (${costText})`
            : `${ru ? 'Сменить' : 'Respec'} → ${name}`,
          compareUnit:   currentUnit,
          buildingId:    o.id,
          cost,
          affordable:    canAffordCost(cost),
        };
      }),
      s => {
        if (s.affordable === false) { alert(`${CASTLE_TEXT.cannotAfford[castleLang]} ${costLabelFor(s.cost)}`); return; }
        performRespec(slot, s.buildingId);
      }
    );
  }

  async function performRespec(slot, building_id) {
    try {
      const result = await api('/structures/respec', { chat_id: player.chat_id, slot, building_id });
      structuresRecord = result.structures;
      closeModal();
      renderBuildings();
      refreshResourceBar(player).catch(() => {});
    } catch (err) {
      alert(err.message || 'Respec failed');
    }
  }

  function confirmAndClear(slot, def) {
    const ru = castleLang === 'ru';
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal">
        <div class="confirm-modal-text">
          ${ru
            ? `Снести «${def?.label ?? ''}»? Боец из этого здания будет удалён навсегда.`
            : `Demolish ${def?.label ?? 'this building'}? Its unit is deleted permanently.`}
        </div>
        <div class="confirm-modal-actions">
          <button class="confirm-modal-btn confirm-modal-btn--cancel">${ru ? 'Отмена' : 'Cancel'}</button>
          <button class="confirm-modal-btn confirm-modal-btn--confirm">${ru ? 'Снести' : 'Demolish'}</button>
        </div>
      </div>`;
    overlay.querySelector('.confirm-modal-btn--cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.confirm-modal-btn--confirm').addEventListener('click', async () => {
      overlay.remove();
      try {
        const result = await api('/structures/clear', { chat_id: player.chat_id, slot });
        structuresRecord = result.structures;
        closeModal();
        renderBuildings();
        refreshNavLock(player).catch(() => {});
      } catch (err) {
        alert(err.message || 'Demolish failed');
      }
    });
    document.body.appendChild(overlay);
  }

  function openBuildModal(slot) {
    const SLOT_CATEGORIES = {
      slot_0: 'throne', slot_1: 'barracks', slot_2: 'barracks',
      slot_3: 'barracks', slot_4: 'barracks', slot_5: 'barracks',
      slot_6: 'special', slot_7: 'special', slot_8: 'special',
    };
    const slotCategory = SLOT_CATEGORIES[slot];
    if (!slotCategory) return;

    // Special slots are mercenary-only now — skip straight to the recruit picker
    // instead of building an empty hall first.
    if (slotCategory === 'special') { openMercenaryModal(slot); return; }

    const factionPools = buildingPools[player.faction] || {};
    const pool         = factionPools[slotCategory] || [];
    let available;
    if (slot === 'slot_0') {
      available = pool.filter(b => b.category === 'throne' && b.tier === 1 && b.unit_id === player.hero);
      // Defensive fallback: player.hero should always be set by this point, but
      // if it's ever missing, show every tier-1 throne option for the faction
      // instead of a dead-end "no buildings available" screen.
      if (!available.length) {
        available = pool.filter(b => b.category === 'throne' && b.tier === 1);
      }
    } else {
      available = pool.filter(b => b.category !== 'throne' && (b.tier === 1 || b.tier === undefined));
    }

    if (!available.length) {
      openModal('Build', '<p class="modal-empty">No buildings available for this slot.</p>');
      return;
    }

    openSliderModal(slot === 'slot_0' ? 'Begin Your Reign' : 'Choose Building',
      available.map(b => {
        const costText = slot === 'slot_0' ? '' : costLabelFor(b.cost);
        return {
          unit:          getUnitByUnitId(b.unit_id),
          buildingLabel: b.label,
          confirmLabel:  costText
            ? `${CASTLE_TEXT.build[castleLang]} · ${b.label} (${costText})`
            : `${CASTLE_TEXT.build[castleLang]} ${b.label}`,
          buildingId:    b.id,
          placeholder:   !!b.placeholder,
          cost:          b.cost,
          affordable:    slot === 'slot_0' || b.placeholder || canAffordCost(b.cost),
          slot,
        };
      }),
      s => {
        if (s.buildingId === 'mercenary_hall') { openMercenaryModal(slot); return; }
        if (s.placeholder) { openPlaceholderModal(s.buildingId); return; }
        if (s.affordable === false) { alert(`${CASTLE_TEXT.cannotAfford[castleLang]} ${costLabelFor(s.cost)}`); return; }
        performBuildingUpgrade(s.slot, s.buildingId);
      }
    );
  }

  async function openMercUpgradeModal(slot, def, paths) {
    const currentUnit = getUnitByUnitId(def.unit_id);

    function trophyAmount(item) {
      const row = trophyInventory.find(r => r.item === item);
      return row ? Number(row.amount) : 0;
    }

    function costLabel(cost) {
      return Object.entries(cost || {})
        .map(([item, amt]) => `${amt} ${item.replace(/_/g, ' ')}`)
        .join(' + ');
    }

    // Roster comes from the bootstrap payload the screen already loaded.
    const rosterEntry = rosterCache.find(r => r.unit_data?.mercenary && r.unit_data?.mercenary_region === def.region && r.unit_data?.id === currentUnit?.id);

    openSliderModal(def.label,
      paths.map(path => {
        const nextUnit = getUnitByUnitId(path.unit_id);
        return {
          unit:           nextUnit,
          buildingLabel:  nextUnit?.name || path.label,
          confirmLabel:   CASTLE_TEXT.upgradeCost[castleLang](nextUnit?.name || path.label, costLabel(path.cost)),
          compareUnit:    currentUnit,
          mercBuildingId: path.id,
          mercCost:       path.cost,
          rosterId:       rosterEntry?.id,
          slot,
        };
      }),
      s => {
        const cost  = s.mercCost || {};
        const short = Object.entries(cost).some(([item, amt]) => trophyAmount(item) < amt);
        if (short) { alert(CASTLE_TEXT.notEnough[castleLang]); return; }
        performMercenaryUpgrade(s.mercBuildingId, slot, s.rosterId);
      },
      { deconstructSlot: slot }
    );
  }

  function openUpgradeModal(slot, def, paths) {
    const currentUnit = getUnitByUnitId(def.unit_id);

    // The throne — i.e. every hero upgrade — is priced by the LEVEL it moves to,
    // not by the building it becomes: applyBuildingCosts in data/buildings.js
    // skips throne entries, so nextDef.cost is undefined for all of them. That is
    // why a hero upgrade showed no cost anywhere and read as free. This mirrors
    // POST /structures/build, which charges THRONE_UPGRADE_COSTS[nextLevel].
    const isThrone   = def.category === 'throne';
    const nextLevel  = (structuresRecord.buildings_data[slot]?.level ?? 0) + 1;
    const throneCost = isThrone ? (throneUpgradeCosts[nextLevel] || null) : null;

    openSliderModal(def.label,
      paths.map(path => {
        const nextUnit = getUnitByUnitId(path.unit_id);
        const nextDef  = getBuildingDef(player.faction, path.building_id);
        const cost     = isThrone ? throneCost : nextDef?.cost;
        const costText = costLabelFor(cost);
        return {
          unit:          nextUnit,
          buildingLabel: nextUnit?.name || path.label,
          confirmLabel:  costText
            ? CASTLE_TEXT.upgradeCost[castleLang](nextUnit?.name || path.label, costText)
            : CASTLE_TEXT.upgradeTo[castleLang](nextUnit?.name || path.label),
          compareUnit:   currentUnit,
          buildingId:    path.building_id,
          cost,
          affordable:    canAffordCost(cost),
          slot,
        };
      }),
      s => {
        if (s.affordable === false) { alert(`${CASTLE_TEXT.cannotAfford[castleLang]} ${costLabelFor(s.cost)}`); return; }
        performBuildingUpgrade(s.slot, s.buildingId);
      },
      { deconstructSlot: slot }
    );
  }

  // Perk choice shown when upgrading the Throne to a level that offers perks.
  function openThronePerkChoice(level, perks, onPick) {
    const cards = perks.map(p => `
      <button class="throne-perk-card" data-perk="${p.id}">
        <div class="throne-perk-label">${castleLang === 'ru' ? (p.label_ru || p.label) : p.label}</div>
        <div class="throne-perk-desc">${castleLang === 'ru' ? (p.desc_ru || p.desc) : p.desc}</div>
      </button>`).join('');
    openModal(castleLang === 'ru' ? `Трон — уровень ${level}` : `Throne — Level ${level}`, `
      <div class="throne-perk-choice">
        <p class="throne-perk-intro">${castleLang === 'ru' ? 'Выберите постоянное улучшение:' : 'Choose one permanent boon:'}</p>
        ${cards}
      </div>`);
    getSheetBody()?.querySelectorAll('.throne-perk-card').forEach(btn => {
      btn.addEventListener('click', () => onPick(btn.dataset.perk));
    });
  }

  async function performBuildingUpgrade(slot, building_id, perk = null) {
    // Throne upgrades to a perk level require a perk pick first.
    if (slot === 'slot_0' && !perk) {
      const nextLevel = (structuresRecord.buildings_data.slot_0?.level ?? 0) + 1;
      const perks = thronePerks[nextLevel];
      if (perks && perks.length) {
        openThronePerkChoice(nextLevel, perks, chosen => performBuildingUpgrade(slot, building_id, chosen));
        return;
      }
    }
    closeModal();
    try {
      const updated = await api('/structures/build', {
        chat_id: player.chat_id,
        slot,
        building_id,
        perk,
      });
      structuresRecord = updated;
      if (slot !== 'slot_0' && !isTutorialDone(player, 'second_building')) {
        markTutorialDone(player, 'second_building');
        // The player now has a second unit and an unequipped starting item, so
        // the equip lesson runs next. It used to hand off to the roster screen;
        // units live in these slots now, so it stays here — reloading first so
        // the new unit and its gear are actually in rosterCache/itemsCache when
        // renderBuildings starts the chain.
        await reloadFromBootstrap();
        return;
      }
      renderBuildings();
      refreshResourceBar(player).catch(() => {});
      refreshNavLock(player).catch(() => {});
    } catch (err) {
      console.error(err);
      alert(err.message || 'Upgrade failed');
    }
  }

  function openPlaceholderModal(buildingId) {
    const def   = getBuildingDef(player.faction, buildingId);
    const label = def?.label || 'Building';
    openModal(label, `
      <div class="throne-modal">
        <div class="throne-level-display">${label}</div>
        <p class="throne-desc">This building is still under construction. Check back later!</p>
      </div>`);
  }

  function openMercenaryModal(slot) {
    // Tier-1 mercenaries from EVERY region — a merc's region trophies gate it
    // implicitly (no trophies → not affordable → not shown), so unlocked-region
    // logic is handled by resources, not a separate check.
    const tier1Defs = Object.values(mercenaryBuildings).flat().filter(b => b.tier === 1);

    const trophyAmount = item => { const row = trophyInventory.find(r => r.item === item); return row ? Number(row.amount) : 0; };
    const canAfford    = cost => Object.entries(cost || {}).every(([item, amt]) => trophyAmount(item) >= amt);
    const costLabel    = cost => Object.entries(cost || {}).map(([item, amt]) => `${amt} ${item.replace(/_/g, ' ')}`).join(' + ');

    const affordable = tier1Defs.filter(b => canAfford(b.cost));
    // Nothing you can afford → don't build anything, just say why.
    if (!affordable.length) {
      openModal('Mercenary Hall',
        '<p class="modal-empty">No mercenaries you can afford yet — gather more trophies from embarks.</p>');
      return;
    }

    openSliderModal('Mercenary Hall',
      affordable.map(b => ({
        unit:          getUnitByUnitId(b.unit_id),
        buildingLabel: b.label,
        confirmLabel:  `Recruit · ${b.label} (${costLabel(b.cost)})`,
        mercBuildingId: b.id,
        mercCost:       b.cost,
        slot,
      })),
      s => performMercenaryRecruit(s.mercBuildingId, slot)
    );
  }

  async function performMercenaryRecruit(mercenary_building_id, slot) {
    closeModal();
    try {
      const result = await api('/structures/mercenary/recruit', {
        chat_id: player.chat_id,
        mercenary_building_id,
        slot,
      });
      if (result.structures) structuresRecord = result.structures;
      // One refresh feeds trophies, roster AND the resource bar — /bootstrap
      // carries all three, so there is nothing to fetch separately.
      await reloadFromBootstrap();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Recruit failed');
    }
  }

  async function performMercenaryUpgrade(mercenary_building_id, slot, roster_id) {
    closeModal();
    try {
      const result = await api('/structures/mercenary/upgrade', {
        chat_id: player.chat_id,
        mercenary_building_id,
        slot,
        roster_id,
      });
      if (result.structures) structuresRecord = result.structures;
      // One refresh feeds trophies, roster AND the resource bar — /bootstrap
      // carries all three, so there is nothing to fetch separately.
      await reloadFromBootstrap();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Upgrade failed');
    }
  }

  load();
}