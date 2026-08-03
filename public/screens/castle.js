import { api }              from '../api.js';
import { navigate }          from '../api.js';
import { refreshResourceBar } from '../api.js';
import { refreshNavLock }    from '../api.js';
import { bootstrapCache } from '../api.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';
import { UNIT_ABILITIES }    from '../../data/unit_abilities.js';
import { UNITS }             from '../../data/units.js';
import { renderSpellTome }   from './spell_tome.js';
import {
  RESIST_ICONS, RESIST_ORDER,
  resolveAbility, renderModalContent, openSheet, closeSheet, getSheetBody, GOLD_ICON,
  openSubSheet, closeSubSheet, getSubSheetBody, cap,
  buildUnitCard, getActionLabel, buildAbilityModalParts,
} from '../utils.js';

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
    structuresRecord   = structures;
    rosterCount        = Array.isArray(roster) ? roster.length : 0;
    rosterCache        = Array.isArray(roster) ? roster : [];

    renderBuildings();
  }

  // Single refresh path: /bootstrap holds resources, trophies, structures, roster
  // and items, so every post-mutation update is ONE request rather than one per
  // slice. refreshResourceBar shares the same in-flight fetch.
  async function reloadFromBootstrap() {
    const boot = await bootstrapCache.refresh(player.chat_id);
    structuresRecord = boot.structures;
    trophyInventory  = boot.trophies || [];
    rosterCache      = boot.roster || [];
    rosterCount      = rosterCache.length;
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

  function getUpgradePathsForBuilding(faction, def) {
    if (!def || !def.upgrades || def.upgrades.length === 0) return [];
    const factionPaths = upgradePaths[faction] || {};
    const paths = factionPaths[def.unit_id];
    if (paths && paths.length > 0) return paths;
    return def.upgrades.map(uid => ({ unit_id: uid, building_id: uid, label: uid }));
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
        <div class="track-action-row">
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
        if (dx < 0 && current < slides.length - 1) { current++; sheetBody.innerHTML = renderSliderHtml(current); attach(); }
        if (dx > 0 && current > 0)                  { current--; sheetBody.innerHTML = renderSliderHtml(current); attach(); }
      });

      sheetBody.querySelectorAll('#branch-track .portrait-card').forEach(card => {
        card.addEventListener('click', () => {
          const i = Number(card.dataset.i);
          if (i === current) return;
          current = i;
          sheetBody.innerHTML = renderSliderHtml(current);
          attach();
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

  function renderBuildings() {
    const data        = structuresRecord.buildings_data;
    const throneState = data['slot_0'];
    const throneLevel = throneState?.level ?? 0;
    const throneMaxed = throneLevel >= heroMaxLevel;

    root.querySelector('#center-slot').innerHTML = `
      <div class="castle-node castle-node--throne castle-node--clickable" data-slot="slot_0">
        <div class="castle-node-icon">♛</div>
        <div class="castle-node-label">Throne</div>
        <div class="castle-node-level">Lv ${throneLevel}</div>
        ${!throneMaxed ? `<div class="castle-node-hint">Upgrade</div>` : ''}
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
        const classes    = ['castle-node', isEmpty ? 'castle-node--empty' : ''].filter(Boolean).join(' ');

        return `
          <div class="${classes}" data-slot="${slot}">
            <div class="castle-node-icon">${isEmpty ? '＋' : '⚔'}</div>
            <div class="castle-node-label">${def ? def.label : (isEmpty ? 'Build' : 'Empty')}</div>
            ${state.level > 0 ? `<div class="castle-node-level">Lv ${state.level}</div>` : ''}
            ${!isEmpty && hasUpgrade ? `<div class="castle-node-hint">Upgrade</div>` : ''}
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
      if (targetEl) showTutorialSpotlight(player, 'second_building', targetEl);
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

  async function handleSlotClick(slot) {
    const state = structuresRecord.buildings_data[slot];
    if (!state || !state.building_id) { openBuildModal(slot); return; }

    const mercDef = getMercBuildingDef(state.building_id);
    if (mercDef) {
      const paths = getMercUpgradePaths(mercDef);
      if (!paths.length) {
        openSliderModal(mercDef.label,
          [{ unit: getUnitByUnitId(mercDef.unit_id), buildingLabel: mercDef.label, confirmLabel: CASTLE_TEXT.maxed[castleLang] }],
          () => closeModal(),
          { deconstructSlot: slot }
        );
        return;
      }
      openMercUpgradeModal(slot, mercDef, paths);
      return;
    }

    const def = getBuildingDef(player.faction, state.building_id);
    if (!def) { openModal('Error', '<p class="modal-empty">Building definition not found.</p>'); return; }

    const paths = getUpgradePathsForBuilding(player.faction, def);

    if (!paths || paths.length === 0) {
      openSliderModal(def.label,
        [{ unit: getUnitByUnitId(def.unit_id), buildingLabel: def.label, confirmLabel: CASTLE_TEXT.maxed[castleLang] }],
        () => closeModal(),
        { deconstructSlot: slot }
      );
      return;
    }

    openUpgradeModal(slot, def, paths);
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
      available.map(b => ({
        unit:          getUnitByUnitId(b.unit_id),
        buildingLabel: b.label,
        confirmLabel:  slot === 'slot_0' ? `Build ${b.label}` : `Build · ${b.label}`,
        buildingId:    b.id,
        placeholder:   !!b.placeholder,
        slot,
      })),
      s => {
        if (s.buildingId === 'mercenary_hall') { openMercenaryModal(slot); return; }
        if (s.placeholder) { openPlaceholderModal(s.buildingId); return; }
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

    openSliderModal(def.label,
      paths.map(path => {
        const nextUnit = getUnitByUnitId(path.unit_id);
        return {
          unit:          nextUnit,
          buildingLabel: nextUnit?.name || path.label,
          confirmLabel:  CASTLE_TEXT.upgradeTo[castleLang](nextUnit?.name || path.label),
          compareUnit:   currentUnit,
          buildingId:    path.building_id,
          slot,
        };
      }),
      s => performBuildingUpgrade(s.slot, s.buildingId),
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