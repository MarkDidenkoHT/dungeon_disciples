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
      hideTutorial();
    }
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
          .then(async () => { await reloadFromBootstrap(); openSlotUnitSheet(slot); })
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
  function openSlotItemPicker(slot, rosterId) {
    const unit = rosterCache.find(u => String(u.id) === String(rosterId));
    if (!unit) return;

    const def      = resolveUnitDef(unit);
    const unitTags = (def?.tags || []).filter(Boolean);
    // Everything not already worn by somebody else, plus whatever this unit has
    // on right now (so it can be taken off from the same list).
    const candidates = itemsCache.filter(it =>
      it.equipped_by == null || String(it.equipped_by) === String(rosterId));

    const cards = candidates.map(it => {
      const stats     = it.item_stats || {};
      const here      = String(it.equipped_by) === String(rosterId);
      const factionOk = !stats.faction || stats.faction === player.faction;
      const tagOk     = !stats.tag_required || unitTags.includes(stats.tag_required);
      // Incoherent pairings are refused with the reason spelled out, matching
      // what POST /items/equip enforces server-side (data/item_rules.js).
      const block     = getEquipBlock(stats, def, UNIT_ABILITIES);
      const canEquip  = factionOk && tagOk && !block && !here;

      let reason = '';
      if (!factionOk)   reason = CASTLE_TEXT.wrongFaction[castleLang];
      else if (block)   reason = castleLang === 'ru' ? block.reason_ru : block.reason;
      else if (!tagOk)  reason = `${CASTLE_TEXT.requires[castleLang]}: ${stats.tag_required}`;

      return `
        <div class="item-card item-card--rarity-${itemRarity(it)} ${here ? 'item-card--equipped' : ''}">
          <div class="item-card-body">
            <div class="item-card-main">
              <div class="item-card-name">${itemName(it, player)}</div>
            </div>
          </div>
          ${here
            ? `<button class="item-action-btn item-action-btn--unequip" data-item-id="${it.id}">${CASTLE_TEXT.unequip[castleLang]}</button>`
            : `<button class="item-action-btn item-action-btn--equip" data-item-id="${it.id}" data-roster-id="${rosterId}" ${canEquip ? '' : 'disabled'}>${CASTLE_TEXT.equip[castleLang]}</button>`}
          ${reason && !here ? `<div class="item-card-blocked">${reason}</div>` : ''}
        </div>`;
    }).join('');

    // Same reason as the main sheet: bind to fresh content, not the reused body.
    openSubSheet(
      CASTLE_TEXT.itemsTitle[castleLang],
      `<div id="slot-item-root">${cards || `<p class="modal-empty">${CASTLE_TEXT.noItems[castleLang]}</p>`}</div>`
    );

    const body = getSubSheetBody()?.querySelector('#slot-item-root');
    body?.addEventListener('click', async e => {
      const equipBtn   = e.target.closest('.item-action-btn--equip:not([disabled])');
      const unequipBtn = e.target.closest('.item-action-btn--unequip');
      if (!equipBtn && !unequipBtn) return;

      const btn = equipBtn || unequipBtn;
      btn.disabled = true;
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

    const optionCards = options.map(o => {
      const unit = getUnitByUnitId(o.unit_id);
      const cost = respecCostFor(o.id, state.level);
      const costStr = Object.entries(cost)
        .map(([item, amt]) => `${amt} ${item === 'gold' ? 'Gold' : item.replace(/_/g, ' ')}`)
        .join(', ') || (ru ? 'бесплатно' : 'free');
      return `
        <button class="respec-option" data-building="${o.id}">
          <span class="respec-option-label">${unit?.name || o.label}</span>
          <span class="respec-option-sub">${o.label}</span>
          <span class="respec-option-cost">${costStr}</span>
        </button>`;
    }).join('');

    openModal(ru ? 'Разбор' : 'Deconstruct', `
      <div class="deconstruct-body">
        <p class="deconstruct-intro">
          ${ru
            ? `Смена ветки того же уровня стоит ${respecCostPct}% цены нового здания. Опыт бойца сохраняется.`
            : `Switching to another branch of the same tier costs ${respecCostPct}% of the new building's price. The unit keeps its XP.`}
        </p>
        ${options.length
          ? `<div class="respec-options">${optionCards}</div>`
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

    getSheetBody()?.querySelectorAll('.respec-option').forEach(btn => {
      btn.addEventListener('click', () => performRespec(slot, btn.dataset.building));
    });
    getSheetBody()?.querySelector('#deconstruct-clear')?.addEventListener('click', () => {
      confirmAndClear(slot, def);
    });
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
        rosterCount += 1;
        markTutorialDone(player, 'second_building');
        // Onboarding hands off to the roster here: the player has a second unit
        // and an unequipped starting item, so the roster steps run before embark.
        navigate('roster', { player });
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