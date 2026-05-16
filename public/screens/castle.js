import { api } from '../main.js';
import { navigate } from '../main.js';
import { renderSpellTome } from './spell_tome.js';

let UNITS = null;

async function loadUnits() {
  try {
    const mod = await import('../../data/units.js');
    UNITS = mod.UNITS || mod.default?.UNITS || mod;
    return UNITS;
  } catch (err) {
    console.error('[Castle] FAILED to load units.js:', err);
    return null;
  }
}

export function renderCastle(root, { player }) {
  root.innerHTML = `
    <div class="screen screen-castle">
      <main class="castle-main">
        <div class="res-mana-top" id="res-mana"></div>
        <div class="castle-grounds">
          <div class="res-col res-col--left" id="res-col-left"></div>
          <div class="castle-grid-wrap">
            <div class="outer-ring" id="outer-ring"></div>
            <div class="center-slot" id="center-slot"></div>
          </div>
          <div class="res-col res-col--right" id="res-col-right"></div>
        </div>
      </main>

      <nav class="bottom-nav">
        <button class="nav-btn active" data-screen="castle">Castle</button>
        <button class="nav-btn" data-screen="roster">Roster</button>
        <button class="nav-btn" data-screen="embark">Embark</button>
        <button class="nav-btn" data-screen="spells">Spells</button>
      </nav>
    </div>

    <div id="modal-overlay" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header">
          <span id="modal-title"></span>
          <button id="modal-close" aria-label="Close">&#x2715;</button>
        </div>
        <div id="modal-body" class="modal-body"></div>
      </div>
    </div>
  `;

  /* ── State ── */
  let structuresRecord   = null;
  let buildingPools      = null;
  let upgradePaths       = null;
  let throneUpgradeCosts = {};
  let heroMaxLevel       = 4;

  /* ── Modal ── */
  const overlay    = root.querySelector('#modal-overlay');
  const modalBody  = root.querySelector('#modal-body');
  const modalTitle = root.querySelector('#modal-title');

  function openModal(title, bodyHtml) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  root.querySelector('#modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  /* ── Data loading ── */
  async function load() {
    const [inventory, structures, buildingsResp] = await Promise.all([
      api('/inventory?chat_id=' + player.chat_id + '&type=resource'),
      api('/structures?chat_id=' + player.chat_id),
      api('/buildings'),
    ]);

    const find = (name) => inventory.find(r => r.item === name) || { amount: 0 };

    root.querySelector('#res-mana').innerHTML =
      '<div class="res-item"><span class="res-icon">&#x1F52E;</span><span class="res-amount">' + find('Mana').amount + '</span></div>';

    root.querySelector('#res-col-left').innerHTML =
      '<div class="res-item"><span class="res-icon">&#x1FA99;</span><span class="res-amount">' + find('Gold').amount + '</span></div>';

    root.querySelector('#res-col-right').innerHTML = [
      ['&#x1F7E2;', 'Crystals_Life'],
      ['&#x1F534;', 'Crystals_Fire'],
      ['&#x1F7E3;', 'Crystals_Death'],
      ['&#x1F7E1;', 'Crystals_Nature'],
      ['&#x1F535;', 'Crystals_Frost'],
    ].map(([icon, key]) =>
      '<div class="res-item"><span class="res-icon">' + icon + '</span><span class="res-amount">' + find(key).amount + '</span></div>'
    ).join('');

    buildingPools      = buildingsResp.pools;
    upgradePaths       = buildingsResp.upgrade_paths || {};
    throneUpgradeCosts = buildingsResp.throne_upgrade_costs || {};
    heroMaxLevel       = buildingsResp.hero_max_level || 4;
    structuresRecord   = structures;

    await loadUnits();

    const readySlots = Object.entries(structures.buildings_data)
      .filter(([, s]) => s.ready_at && new Date(s.ready_at) <= new Date())
      .map(([slot]) => slot);

    if (readySlots.length > 0) {
      await Promise.all(readySlots.map(slot =>
        api('/structures/complete', { chat_id: player.chat_id, slot, faction: player.faction })
      ));
      structuresRecord = await api('/structures?chat_id=' + player.chat_id);
    }

    renderBuildings();
  }

  /* ── Lookups ── */
  function getBuildingDef(faction, buildingId) {
    if (!buildingPools || !faction) return null;
    for (const pool of Object.values(buildingPools[faction])) {
      const found = pool.find(b => b.id === buildingId);
      if (found) return found;
    }
    return null;
  }

  function getUnitByUnitId(unitId) {
    if (!unitId || !UNITS) return null;
    const all = Object.assign({}, UNITS.empire, UNITS.dungeon, UNITS.enemies);
    return Object.values(all).find(u => u.id === unitId) || null;
  }

  function getUpgradePathsForBuilding(faction, def) {
    if (!def || !def.upgrades || def.upgrades.length === 0) return [];
    const factionPaths = upgradePaths[faction] || {};
    const paths = factionPaths[def.unit_id];
    if (paths && paths.length > 0) return paths;
    return def.upgrades.map(uid => ({ unit_id: uid, building_id: uid, label: uid }));
  }

  /* ── Slider / unit card ── */
  const TYPE_ICON   = { melee: '\u2694', ranged: '\uD83C\uDFF9', caster: '\u2736', healer: '\u271A' };
  const STAT_KEYS   = ['hp', 'armor', 'initiative', 'action_power', 'targets', 'range'];
  const STAT_LABELS = { hp: 'HP', armor: 'Armor', initiative: 'Init', action_power: 'Power', targets: 'Targets', range: 'Range' };

  function unitPortraitSrc(unit) {
    if (!unit) return null;
    return '../assets/character_art/' + unit.id.toUpperCase() + '.png';
  }

  function renderSlide(unit, opts) {
    opts = opts || {};
    var label       = opts.label || '';
    var compareUnit = opts.compareUnit || null;
    var isNew       = opts.isNew || false;

    if (!unit) return '<div class="unit-slide"><p class="modal-empty">Unknown unit</p></div>';

    var tags     = (unit.tags || []).filter(Boolean).join(' \u00B7 ');
    var portrait = unitPortraitSrc(unit);
    var icon     = TYPE_ICON[unit.type] || '?';

    var statRows = STAT_KEYS.map(function(key) {
      var diffHtml = '';
      if (compareUnit) {
        var diff = unit[key] - compareUnit[key];
        if (diff > 0) diffHtml = '<span class="stat-diff stat-diff--up">+' + diff + '</span>';
        else if (diff < 0) diffHtml = '<span class="stat-diff stat-diff--down">' + diff + '</span>';
      }
      return '<div class="unit-stat-row">' +
        '<span class="unit-stat-label">' + STAT_LABELS[key] + '</span>' +
        '<span class="unit-stat-val">' + unit[key] + diffHtml + '</span>' +
        '</div>';
    }).join('');

    var resBadges = Object.entries(unit.resistances || {})
      .filter(function(e) { return e[1] !== 0; })
      .map(function(e) {
        var k = e[0], v = e[1];
        var cls = v > 0 ? 'res-badge--pos' : 'res-badge--neg';
        return '<span class="res-badge ' + cls + '">' + k + ' ' + (v > 0 ? '+' : '') + v + '%</span>';
      }).join('');

    var portraitHtml = '';
    if (portrait) {
      portraitHtml = '<img src="' + portrait + '" alt="' + unit.name +
        '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">';
    }

    return '<div class="unit-slide">' +
      '<div class="unit-slide-portrait">' +
        portraitHtml +
        '<div class="unit-slide-portrait-fallback"' + (portrait ? ' style="display:none"' : '') + '>' + icon + '</div>' +
        (isNew ? '<div class="unit-slide-badge">New</div>' : '') +
        (label ? '<div class="unit-slide-label">' + label + '</div>' : '') +
      '</div>' +
      '<div class="unit-slide-info">' +
        '<div class="unit-slide-name">' + unit.name + '</div>' +
        '<div class="unit-slide-type">' + icon + ' ' + unit.type + (tags ? ' \u00B7 ' + tags : '') + '</div>' +
        (unit.description ? '<p class="unit-slide-desc">' + unit.description + '</p>' : '') +
        '<div class="unit-slide-stats">' + statRows + '</div>' +
        (resBadges ? '<div class="unit-slide-res">' + resBadges + '</div>' : '') +
        (unit.passive ? '<div class="unit-trait"><span class="trait-label">Passive</span>' + unit.passive + '</div>' : '') +
        (unit.ability ? '<div class="unit-trait"><span class="trait-label">Ability</span>' + unit.ability + '</div>' : '') +
      '</div>' +
    '</div>';
  }

  function openSliderModal(title, slides, onConfirm) {
    var current = 0;

    function render(idx) {
      var s    = slides[idx];
      var dots = '';
      if (slides.length > 1) {
        dots = '<div class="slider-dots">' +
          slides.map(function(_, i) {
            return '<span class="slider-dot' + (i === idx ? ' slider-dot--active' : '') + '"></span>';
          }).join('') +
          '</div>';
      }
      var arrows = '';
      if (slides.length > 1) {
        arrows =
          '<button class="slider-arrow slider-arrow--prev" id="slider-prev"' + (idx === 0 ? ' disabled' : '') + '>\u2039</button>' +
          '<button class="slider-arrow slider-arrow--next" id="slider-next"' + (idx === slides.length - 1 ? ' disabled' : '') + '>\u203A</button>';
      }
      return '<div class="unit-slider">' +
          '<div class="unit-slider-track" id="slider-track">' +
            renderSlide(s.unit, { label: s.label, compareUnit: s.compareUnit, isNew: s.isNew }) +
          '</div>' +
          arrows +
          dots +
        '</div>' +
        '<button class="upgrade-confirm-btn" id="slider-confirm">' + (s.confirmLabel || 'Confirm') + '</button>';
    }

    openModal(title, render(current));

    function attach() {
      var track      = modalBody.querySelector('#slider-track');
      var touchStart = null;

      if (track) {
        track.addEventListener('touchstart', function(e) {
          touchStart = e.touches[0].clientX;
        }, { passive: true });
        track.addEventListener('touchend', function(e) {
          if (touchStart === null) return;
          var dx = e.changedTouches[0].clientX - touchStart;
          touchStart = null;
          if (Math.abs(dx) < 40) return;
          if (dx < 0 && current < slides.length - 1) { current++; modalBody.innerHTML = render(current); attach(); }
          if (dx > 0 && current > 0)                  { current--; modalBody.innerHTML = render(current); attach(); }
        });
      }

      var prev = modalBody.querySelector('#slider-prev');
      var next = modalBody.querySelector('#slider-next');
      if (prev) prev.addEventListener('click', function() {
        if (current > 0) { current--; modalBody.innerHTML = render(current); attach(); }
      });
      if (next) next.addEventListener('click', function() {
        if (current < slides.length - 1) { current++; modalBody.innerHTML = render(current); attach(); }
      });

      var confirm = modalBody.querySelector('#slider-confirm');
      if (confirm) confirm.addEventListener('click', function() { onConfirm(slides[current]); });
    }

    attach();
  }

  /* ── Castle grid ── */
  function renderBuildings() {
    var data        = structuresRecord.buildings_data;
    var throneState = data['slot_0'];
    var throneLevel = (throneState && throneState.level) ? throneState.level : 1;
    var throneMaxed = throneLevel >= heroMaxLevel;

    root.querySelector('#center-slot').innerHTML =
      '<div class="castle-node castle-node--throne castle-node--clickable" data-slot="slot_0">' +
        '<div class="castle-node-icon">\u265B</div>' +
        '<div class="castle-node-label">Throne</div>' +
        '<div class="castle-node-level">Lv ' + throneLevel + '</div>' +
        (!throneMaxed ? '<div class="castle-node-hint">Upgrade</div>' : '') +
      '</div>';

    root.querySelector('#outer-ring').innerHTML = Object.keys(data)
      .filter(function(s) { return s !== 'slot_0'; })
      .map(function(slot) {
        var state      = data[slot] || { level: 0, building_id: null };
        var def        = state.building_id ? getBuildingDef(player.faction, state.building_id) : null;
        var isEmpty    = !state.building_id;
        var isBuilding = state.ready_at && new Date(state.ready_at) > Date.now();
        var hasUpgrade = def && getUpgradePathsForBuilding(player.faction, def).length > 0;

        var classes = 'castle-node' +
          (isEmpty    ? ' castle-node--empty'    : '') +
          (isBuilding ? ' castle-node--building' : '');

        return '<div class="' + classes + '" data-slot="' + slot + '">' +
          '<div class="castle-node-icon">' + (isEmpty ? '\uFF0B' : '\u2694') + '</div>' +
          '<div class="castle-node-label">' + (def ? def.label : (isEmpty ? 'Build' : 'Empty')) + '</div>' +
          (state.level > 0 ? '<div class="castle-node-level">Lv ' + state.level + '</div>' : '') +
          (isBuilding ? '<div class="castle-node-timer" data-ready="' + state.ready_at + '">\u23F3</div>' : '') +
          (!isEmpty && !isBuilding && hasUpgrade ? '<div class="castle-node-hint">Upgrade</div>' : '') +
        '</div>';
      }).join('');

    root.querySelectorAll('.castle-node').forEach(function(node) {
      node.addEventListener('click', function() { handleSlotClick(node.dataset.slot); });
    });
  }

  /* ── Slot handlers ── */
  async function handleSlotClick(slot) {
    var state = structuresRecord.buildings_data[slot];

    if (slot === 'slot_0') { handleThroneClick(); return; }
    if (!state || !state.building_id) { openBuildModal(slot); return; }

    var def = getBuildingDef(player.faction, state.building_id);
    if (!def) { openModal('Error', '<p class="modal-empty">Building definition not found.</p>'); return; }

    var paths = getUpgradePathsForBuilding(player.faction, def);

    if (!paths || paths.length === 0) {
      // maxed — show current unit as a single slide, no confirm action
      var currentUnit = getUnitByUnitId(def.unit_id);
      openSliderModal(def.label,
        [{ unit: currentUnit, label: 'Current Unit', confirmLabel: 'Maxed — No Upgrades' }],
        function() { closeModal(); }
      );
      return;
    }

    openUpgradeModal(slot, def, paths);
  }

  function openBuildModal(slot) {
    var SLOT_CATEGORIES = {
      slot_0: 'throne', slot_1: 'barracks', slot_2: 'barracks',
      slot_3: 'barracks', slot_4: 'barracks', slot_5: 'barracks',
      slot_6: 'barracks', slot_7: 'any',     slot_8: 'any',
    };
    var slotCategory = SLOT_CATEGORIES[slot] || 'any';
    var factionPools = buildingPools[player.faction] || {};
    var available    = [];

    Object.entries(factionPools).forEach(function(entry) {
      var cat = entry[0], pool = entry[1];
      if (slotCategory === 'any' || cat === slotCategory) {
        pool.forEach(function(b) {
          if (b.category !== 'throne' && b.tier === 1) available.push(b);
        });
      }
    });

    if (!available.length) {
      openModal('Build', '<p class="modal-empty">No buildings available for this slot.</p>');
      return;
    }

    var slides = available.map(function(b) {
      return {
        unit:         getUnitByUnitId(b.unit_id),
        label:        b.label,
        confirmLabel: 'Build \u00B7 ' + b.label,
        isNew:        true,
        buildingId:   b.id,
        slot:         slot,
      };
    });

    openSliderModal('Choose Building', slides, function(s) {
      performBuildingUpgrade(s.slot, s.buildingId);
    });
  }

  async function handleThroneClick() {
    var throneState = structuresRecord.buildings_data['slot_0'];
    var throneLevel = (throneState && throneState.level) ? throneState.level : 1;
    var nextLevel   = throneLevel + 1;
    var cost        = throneUpgradeCosts[nextLevel];
    var isMaxed     = throneLevel >= heroMaxLevel;
    var label       = player.faction === 'dungeon' ? 'Dark Throne' : 'Throne';

    if (isMaxed) {
      openModal(label,
        '<div class="throne-modal">' +
          '<div class="throne-level-display">Level <span class="throne-level-num">' + throneLevel + '</span></div>' +
          '<p class="throne-maxed">The Throne is fully upgraded. Your hero may reach their full potential.</p>' +
        '</div>'
      );
      return;
    }

    openModal(label,
      '<div class="throne-modal">' +
        '<div class="throne-level-display">Level <span class="throne-level-num">' + throneLevel + '</span>' +
          ' \u2192 <span class="throne-level-num throne-level-next">' + nextLevel + '</span></div>' +
        '<p class="throne-desc">Upgrading the Throne allows your hero to reach level ' + nextLevel + '.</p>' +
        '<div class="throne-cost">' +
          (cost && cost.gold > 0 ? '<span class="throne-cost-item">\uD83E\uDE99 ' + cost.gold + ' Gold</span>' : '') +
          (cost && cost.mana  > 0 ? '<span class="throne-cost-item">\uD83D\uDD2E ' + cost.mana + ' Mana</span>'  : '') +
        '</div>' +
        '<button class="upgrade-confirm-btn" id="confirm-throne-btn">Upgrade Throne</button>' +
      '</div>'
    );

    var throneBtn = modalBody.querySelector('#confirm-throne-btn');
    if (throneBtn) {
      throneBtn.addEventListener('click', async function() {
        closeModal();
        try {
          var updated = await api('/structures/throne/upgrade', { chat_id: player.chat_id });
          structuresRecord = updated;
          renderBuildings();
        } catch (err) {
          alert(err.message || 'Throne upgrade failed');
        }
      });
    }
  }

  function openUpgradeModal(slot, def, paths) {
    var currentUnit = getUnitByUnitId(def.unit_id);

    var slides = paths.map(function(path) {
      var nextUnit = getUnitByUnitId(path.unit_id);
      return {
        unit:         nextUnit,
        label:        nextUnit ? nextUnit.name : path.label,
        confirmLabel: 'Upgrade \u2192 ' + (nextUnit ? nextUnit.name : path.label),
        compareUnit:  currentUnit,
        buildingId:   path.building_id,
        slot:         slot,
      };
    });

    openSliderModal(def.label, slides, function(s) {
      performBuildingUpgrade(s.slot, s.buildingId);
    });
  }

  async function performBuildingUpgrade(slot, building_id) {
    closeModal();
    try {
      var updated = await api('/structures/build', {
        chat_id:    player.chat_id,
        faction:    player.faction,
        slot:       slot,
        building_id: building_id,
      });
      structuresRecord = updated;
      renderBuildings();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Upgrade failed');
    }
  }

  /* ── Boot ── */
  load();

  root.querySelectorAll('.nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (btn.classList.contains('disabled')) return;
      var screen = btn.dataset.screen;
      if (screen === 'spells') {
        renderSpellTome(root, { player: player });
      } else if (screen === 'castle') {
        renderBuildings();
      } else {
        navigate(screen, { player: player });
      }
    });
  });
}