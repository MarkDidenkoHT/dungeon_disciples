import { api, navigate }  from '../api.js';
import { SPELLS }          from '../../data/spells.js';
import { getEncounter }    from '../../data/embark.js';
import { UNIT_ABILITIES }  from '../../data/unit_abilities.js';
import {
  RESIST_ICONS, RESIST_ORDER,
  cap, dmgReduction, CRYSTAL_ICONS,
  resolveUnitDef, resolveAbility, buildStatDescription,
  renderModalContent, openSheet, closeSheet, getSheetBody,
  playPageTurnSound,
} from '../utils.js';

const REGION_META = {
  crimson_basilica: { label: 'Crimson Basilica', icon: '🌲' },
  mountains_of_valdrek: { label: 'Mountains of Valdrek',  icon: '⛰️' },
  dungeons_of_malgrath: { label: 'Dungeons of Malgrath',  icon: '💀' },
};

const ROWS = 3;
const COLS = 2;

const SIZE_META = {
  tile:   { label: '1×1', rowSpan: 1, colSpan: 1 },
  column: { label: '1×2', rowSpan: 2, colSpan: 1 },
  row:    { label: '2×1', rowSpan: 1, colSpan: 2 },
};

function cellIndex(row, col) { return row * COLS + col; }
function cellRow(i)  { return Math.floor(i / COLS); }
function cellCol(i)  { return i % COLS; }

function getPortraitUrl(unit, variant = 'default') {
  const unitDef = resolveUnitDef(unit);
  const unitId = unitDef?.id;
  if (!unitId) return null;
  const portraitId = unitId.match(/^(h_[a-z]_\d)/)?.[1] ?? unitId;
  const size = unitDef?.size ?? 'tile';
  const prefix = (variant === 'grid' && (size === 'row' || size === 'column')) ? 'p2' : 'p';
  return `/assets/character_portraits/${prefix}_${portraitId}.png`;
}

function unitTypeIcon(unit) {
  const t = unit?.unit_data?.type ?? '';
  const icons = { melee: '⚔', ranged: '🏹', caster: '✦', healer: '✚' };
  return icons[t] ?? '·';
}

function getUnitSize(unit) {
  return resolveUnitDef(unit)?.size ?? 'tile';
}

function getCells(anchor, size) {
  const r = cellRow(anchor), c = cellCol(anchor);
  if (size === 'tile') return [anchor];
  if (size === 'row') {
    const anchorNorm = cellIndex(r, 0);
    return [anchorNorm, cellIndex(r, 1)];
  }
  if (size === 'column') {
    const anchorNorm = r <= ROWS - 2 ? cellIndex(r, c) : cellIndex(r - 1, c);
    return [anchorNorm, cellIndex(cellRow(anchorNorm) + 1, c)];
  }
  return null;
}

function sizeLabel(size)   { return SIZE_META[size]?.label ?? '1×1'; }
function sizeRowSpan(size) { return SIZE_META[size]?.rowSpan ?? 1; }
function sizeColSpan(size) { return SIZE_META[size]?.colSpan ?? 1; }

function getUnitName(unit) {
  return resolveUnitDef(unit)?.name ?? unit.unit_data?.unit_id ?? '?';
}

function getLoyalty(heroUnit) {
  if (!heroUnit) return 2;
  const def = resolveUnitDef(heroUnit);
  const tier = def?.t ?? 1;
  return tier >= 4 ? 5 : tier + 1;
}

export function renderBattlePrep(root, { player, region_id, level }) {
  const meta = REGION_META[region_id] || { label: region_id, icon: '⚔' };

  root.innerHTML = `
    <div class="screen screen-battle-prep">
      <div class="embark-header">
        <span class="embark-title">${meta.icon} ${meta.label} — Lv ${level}</span>
      </div>

      <div class="battle-arena">
        <div class="battle-half battle-half--player">
          <div class="battle-half-label">Your Formation <span id="loyalty-counter" class="loyalty-counter"></span></div>
          <div class="battle-grid-wrap">
            <div class="battle-grid" id="player-grid"></div>
          </div>
        </div>
        <div class="battle-half battle-half--enemy">
          <div class="battle-half-label">Enemies</div>
          <div class="battle-grid-wrap">
            <div class="battle-grid" id="enemy-grid"></div>
          </div>
        </div>
      </div>

      <div class="battle-prep-tabs">
        <button class="battle-prep-tab-btn active" data-tab="formation">Formation</button>
      </div>

      <div class="battle-prep-tab-content active" id="tab-formation">
        <div class="prep-track-wrap">
          <div class="portrait-track" id="portrait-track"></div>
        </div>
      </div>

      <button id="ready-btn" style="display:none" disabled></button>
    </div>

    <div id="spell-sheet-overlay" class="spell-sheet-overlay hidden">
      <div class="spell-sheet" id="spell-sheet">
        <div class="spell-sheet-handle"></div>
        <div class="spell-sheet-header">
          <span class="spell-sheet-title">Spells</span>
          <button class="spell-sheet-close" id="spell-sheet-close" aria-label="Close">✕</button>
        </div>
        <div class="tier-tabs" id="spell-sheet-tier-tabs">
          <button class="tier-tab tier-tab--active" data-tier="1">Tier I</button>
          <button class="tier-tab" data-tier="2">Tier II</button>
          <button class="tier-tab" data-tier="3">Tier III</button>
          <button class="tier-tab" data-tier="4">Tier IV</button>
        </div>
        <div class="spell-sheet-body" id="spell-sheet-body"></div>
      </div>
    </div>

    <div id="spell-target-overlay" class="spell-sheet-overlay hidden">
      <div class="spell-sheet" id="spell-target-sheet">
        <div class="spell-sheet-handle"></div>
        <div class="spell-sheet-header">
          <span class="spell-sheet-title" id="spell-target-title">Choose Target</span>
          <button class="spell-sheet-close" id="spell-target-close" aria-label="Close">✕</button>
        </div>
        <div class="spell-sheet-body" id="spell-target-body"></div>
      </div>
    </div>
  `;

  let roster           = [];
  let enemies          = [];
  let heroId           = null;
  let maxNonHero       = 2;
  let dragUnit         = null;
  let dragFromCell     = null;
  let hoverCell        = null;
  const occupied       = {};
  const selectedSpells = [];

  let playerCrystals = {};
  let learnedSpells  = [];
  let activeSpellTier = 1;

  function openModal(title, bodyHtml) { openSheet(title, bodyHtml); }
  function closeModal() { closeSheet(); }

  const spellSheetOverlay  = root.querySelector('#spell-sheet-overlay');
  const spellSheetBody     = root.querySelector('#spell-sheet-body');
  const spellSheetTierTabs = root.querySelector('#spell-sheet-tier-tabs');

  const targetOverlay   = root.querySelector('#spell-target-overlay');
  const targetBody      = root.querySelector('#spell-target-body');
  const targetTitle     = root.querySelector('#spell-target-title');

  function openSpellSheet() {
    renderSpellSheetList();
    spellSheetOverlay.classList.remove('hidden');
  }

  function closeSpellSheet() {
    spellSheetOverlay.classList.add('hidden');
  }

  root.querySelector('#spell-sheet-close').addEventListener('click', closeSpellSheet);
  spellSheetOverlay.addEventListener('click', e => { if (e.target === spellSheetOverlay) closeSpellSheet(); });

  root.querySelector('#spell-target-close').addEventListener('click', closeTargetSheet);
  targetOverlay.addEventListener('click', e => { if (e.target === targetOverlay) closeTargetSheet(); });

  function closeTargetSheet() {
    targetOverlay.classList.add('hidden');
  }

  function syncSpellSheetTierTabs() {
    spellSheetTierTabs.querySelectorAll('.tier-tab').forEach(t => {
      t.classList.toggle('tier-tab--active', Number(t.dataset.tier) === activeSpellTier);
    });
  }

  spellSheetTierTabs.querySelectorAll('.tier-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tier = parseInt(tab.dataset.tier, 10);
      if (tier === activeSpellTier) return;
      playPageTurnSound();
      activeSpellTier = tier;
      syncSpellSheetTierTabs();
      renderSpellSheetList();
    });
  });

  const spellsNavBtn = document.querySelector('.nav-btn[data-screen="spells"]');
  if (spellsNavBtn) {
    spellsNavBtn.querySelector('.nav-btn-label').textContent = 'Cast Spell';
    spellsNavBtn._battlePrepHandler = (e) => { e.stopImmediatePropagation(); openSpellSheet(); };
    spellsNavBtn.addEventListener('click', spellsNavBtn._battlePrepHandler, true);
  }

  const embarkNavBtn = document.querySelector('.nav-btn[data-screen="embark"]');
  if (embarkNavBtn) {
    embarkNavBtn._battlePrepHandler = (e) => {
      e.stopImmediatePropagation();
      const btn = root.querySelector('#ready-btn');
      if (btn && !btn.disabled) btn.click();
    };
    embarkNavBtn.addEventListener('click', embarkNavBtn._battlePrepHandler, true);
  }

  function restoreNavLabels() {
    const s = document.querySelector('.nav-btn[data-screen="spells"]');
    const em = document.querySelector('.nav-btn[data-screen="embark"]');
    if (s) {
      s.querySelector('.nav-btn-label').textContent = 'Spells';
      if (s._battlePrepHandler) { s.removeEventListener('click', s._battlePrepHandler, true); delete s._battlePrepHandler; }
    }
    if (em) {
      em.querySelector('.nav-btn-label').textContent = 'Embark';
      em.classList.remove('nav-btn--battle-ready');
      if (em._battlePrepHandler) { em.removeEventListener('click', em._battlePrepHandler, true); delete em._battlePrepHandler; }
    }
  }



  function updateSpellsBadge() {
    const spellsNav = document.querySelector('.nav-btn[data-screen="spells"] .nav-btn-label');
    if (!spellsNav) return;
    spellsNav.textContent = selectedSpells.length > 0 ? `Cast Spell (${selectedSpells.length})` : 'Cast Spell';
  }

  function showDetail(title, html) {
    openSheet(title, html);
  }

  function clearDetail() {
    closeSheet();
  }

  function unitDetailHtml(unit) {
    const def    = resolveUnitDef(unit);
    const stored = unit.unit_data || {};
    const isHero = unit.id === heroId;
    const portraitUrl = getPortraitUrl(unit);
    const currentHp = stored.current_hp != null ? stored.current_hp : (def?.hp ?? '—');
    const maxHp     = stored.max_hp != null ? stored.max_hp : (def?.hp ?? '—');
    const alive     = stored.alive !== false;
    const res        = def?.resistances || {};

    const coreHtml = `
      <div class="unit-core-stats">
        <div class="core-stat"><span class="core-stat-label">HP</span><span class="core-stat-val">${currentHp}/${maxHp}</span></div>
        <div class="core-stat"><span class="core-stat-label">Armor</span><span class="core-stat-val">${def?.armor ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">Init</span><span class="core-stat-val">${def?.initiative ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">XP</span><span class="core-stat-val">${stored.current_xp ?? 0}</span></div>
      </div>
      ${alive ? '' : `<div class="battle-prep-dead-label">Dead / unavailable</div>`}
    `;

    const resistCells = RESIST_ORDER.map(r => {
      const info = RESIST_ICONS[r];
      const val  = res[r] ?? 0;
      const cls  = val > 0 ? 'resist-val--pos' : val < 0 ? 'resist-val--neg' : '';
      return `<div class="resist-cell" title="${info.label}">
        <span class="resist-icon">${info.icon}</span>
        <span class="resist-val ${cls}">${val}</span>
      </div>`;
    }).join('');

    const resistsHtml = `<div class="unit-resists-grid">${resistCells}</div>`;

    function abilityIconHtml(key, type) {
      const aDef    = resolveAbility(key);
      const isEmpty = !aDef;
      const fileKey = key ? key.replace(/\s+/g, '_').replace(/_\d+$/, '') : null;
      const imgSrc  = aDef ? `/assets/icons/abilities/${fileKey}.jpg` : null;
      return `
        <button
          class="ability-icon ability-icon--${type}${isEmpty ? ' ability-icon--empty' : ''}"
          data-ability-key="${key || ''}"
          data-ability-type="${type}"
          ${isEmpty ? 'disabled' : ''}
        >
          ${imgSrc ? `<img class="ability-icon-img" src="${imgSrc}" alt="${aDef.name}" onerror="this.style.visibility='hidden'">` : ''}
        </button>`;
    }

    const passiveSlots = [];
    if (def?.passive) {
      if (Array.isArray(def.passive)) {
        for (const p of def.passive) passiveSlots.push(p);
      } else {
        passiveSlots.push(def.passive);
      }
    }
    const activeSlot = def?.ability || null;
    const visible = [
      activeSlot,
      passiveSlots[0] || null,
      passiveSlots[1] || null,
      passiveSlots[2] || null,
    ];

    const iconsHtml = visible.map((k, i) => {
      if (!k) return abilityIconHtml('', 'empty');
      const t = i === 0 ? 'active' : 'passive';
      return abilityIconHtml(k, t);
    }).join('');

    const abilitiesHtml = `
      <div class="unit-abilities-row">
        <div class="unit-abilities-icons">
          ${iconsHtml}
        </div>
      </div>
    `;

    const name  = def?.name ?? stored.unit_id ?? '?';
    const tier  = def?.t ?? 1;
    const badge = isHero ? '★ Hero' : sizeLabel(getUnitSize(unit));

    return `
      <div class="detail-unit-header">
        ${portraitUrl ? `<img class="detail-unit-portrait" src="${portraitUrl}" alt="${name}" onerror="this.style.display='none'">` : ''}
        <div class="detail-unit-info">
          <span class="detail-unit-name">${name}</span>
          <span class="detail-unit-badge">${badge}</span>
          ${isHero ? `<span class="detail-unit-tier">Lv ${tier}</span>` : `<span class="detail-unit-tier">Tier ${tier}</span>`}
        </div>
      </div>
      ${coreHtml}
      ${resistsHtml}
      ${abilitiesHtml}
    `;
  }

  function enemyDetailHtml(e) {
    return `
      <div class="detail-unit-header">
        <span class="detail-unit-name">${e.name}</span>
        <span class="detail-unit-badge detail-unit-badge--enemy">Enemy</span>
      </div>
      <div class="unit-core-stats">
        <div class="core-stat"><span class="core-stat-label">HP</span><span class="core-stat-val">${e.hp}</span></div>
        <div class="core-stat"><span class="core-stat-label">Armor</span><span class="core-stat-val">${e.armor ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">Init</span><span class="core-stat-val">${e.initiative ?? '—'}</span></div>
      </div>
      ${e.action ? `
      <div class="detail-action">
        <span class="detail-action-label">Basic Action</span>
        <div class="unit-core-stats">
          <div class="core-stat"><span class="core-stat-label">DMG</span><span class="core-stat-val">${e.action.value ?? '—'}</span></div>
          <div class="core-stat"><span class="core-stat-label">Range</span><span class="core-stat-val">${e.action.range ?? '—'}</span></div>
          <div class="core-stat"><span class="core-stat-label">Target</span><span class="core-stat-val">${e.action.target_type ?? '—'}</span></div>
        </div>
      </div>` : ''}
    `;
  }

  function spellTargetLabel(spell) {
    const scope = spell.target_scope || 'unknown';
    if (scope === 'all_allies') return 'All allies';
    if (scope === 'all_enemies') return 'All enemies';
    if (scope === 'single_ally') return 'Single ally';
    if (scope === 'single_enemy') return 'Single enemy';
    if (scope === 'tag_allies' && spell.params?.tag) return `All allied ${spell.params.tag}s`;
    if (scope === 'tag_enemies' && spell.params?.tag) return `All enemy ${spell.params.tag}s`;
    return scope.replace(/_/g, ' ');
  }

  function spellCostLabel(spell) {
    const parts = [];
    for (const [type, amt] of Object.entries(spell.cost.crystals || {})) {
      if (amt > 0) parts.push(`${CRYSTAL_ICONS[type] || '💎'}${amt}`);
    }
    return parts.join(' ');
  }

  function canAffordSpell(spell) {
    const crystalMap = spell.cost.crystals || {};
    for (const [type, needed] of Object.entries(crystalMap)) {
      if ((playerCrystals[type] || 0) < needed) return false;
    }
    return true;
  }

  function renderSpellSheetList() {
    const factionSpells = SPELLS[player.faction] || [];
    const learned       = factionSpells.filter(s => learnedSpells.includes(s.id) && s.tier === activeSpellTier);

    if (learned.length === 0) {
      spellSheetBody.innerHTML = `<div class="spell-sheet-empty">No learned spells in this tier</div>`;
      return;
    }

    spellSheetBody.innerHTML = learned.map(spell => {
      const affordable = canAffordSpell(spell);
      const usedEntry  = selectedSpells.find(s => s.id === spell.id);
      const used       = !!usedEntry;
      const spellSlotFull = selectedSpells.length > 0 && !used;
      const targetLabel = used && usedEntry.target_name ? `→ ${usedEntry.target_name}` : spellTargetLabel(spell);

      return `
        <div class="spell-list-row ${!affordable && !used ? 'spell-list-row--disabled' : ''} ${used ? 'spell-list-row--used' : ''}"
             data-spell-id="${spell.id}">
          <div class="spell-list-icon"><img src="/assets/icons/spells/${spell.id}.png" class="spell-icon-img" alt="${spell.name}" onerror="this.style.display='none'"></div>
          <div class="spell-list-info">
            <div class="spell-list-name">${spell.name}</div>
            <div class="spell-list-meta">
              <span class="spell-list-cost">${spellCostLabel(spell)}</span>
              <span class="spell-list-target">${targetLabel}</span>
            </div>
            <div class="spell-list-desc">${spell.description}</div>
          </div>
          <div class="spell-list-action">
            ${used
              ? `<button class="spell-list-undo-btn" data-undo-id="${spell.id}">Undo</button>`
              : spellSlotFull
                ? `<span class="spell-list-locked">Undo active spell first</span>`
                : affordable
                  ? `<button class="spell-list-use-btn" data-use-id="${spell.id}">Use</button>`
                  : `<span class="spell-list-locked">✕</span>`
            }
          </div>
        </div>
      `;
    }).join('');

    spellSheetBody.querySelectorAll('.spell-list-use-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const spellId = btn.dataset.useId;
        const spell   = factionSpells.find(s => s.id === spellId);
        if (!spell) return;
        initiateSpellUse(spell, factionSpells);
      });
    });

    spellSheetBody.querySelectorAll('.spell-list-undo-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const spellId = btn.dataset.undoId;
        await undoSpell(spellId);
        renderSpellSheetList();
        updateSpellsBadge();
      });
    });
  }

  function needsTargetSelection(spell) {
    return spell.target_scope === 'single_ally' || spell.target_scope === 'single_enemy';
  }

  function getEligibleTargets(spell) {
    if (spell.target_scope === 'single_ally') {
      return roster.filter(u => placedUnitIds().has(u.id) && (u.unit_data?.alive !== false));
    }
    if (spell.target_scope === 'single_enemy') {
      return enemies.map((e, i) => ({ id: `enemy_${i}`, name: e.name, _enemyData: e }));
    }
    if (spell.target_scope === 'tag_allies' && spell.params?.tag) {
      const tag = spell.params.tag;
      return roster.filter(u => {
        const def = resolveUnitDef(u);
        return (def?.tags ?? []).includes(tag);
      });
    }
    return [];
  }

  function initiateSpellUse(spell, factionSpells) {
    if (needsTargetSelection(spell)) {
      const targets = getEligibleTargets(spell);
      if (targets.length === 0) {
        showTargetSheet(spell, [], factionSpells);
        return;
      }
      closeSpellSheet();
      showTargetSheet(spell, targets, factionSpells);
    } else if (spell.target_scope === 'tag_allies' && spell.params?.tag) {
      const targets = getEligibleTargets(spell);
      if (targets.length === 0) {
        closeSpellSheet();
        showTargetSheet(spell, [], factionSpells);
        return;
      }
      confirmAndUseSpell(spell, null, factionSpells);
    } else {
      confirmAndUseSpell(spell, null, factionSpells);
    }
  }

  function showTargetSheet(spell, targets, factionSpells) {
    targetTitle.textContent = `${spell.name} — Choose Target`;

    if (targets.length === 0) {
      targetBody.innerHTML = `<div class="spell-sheet-empty">No eligible targets${spell.params?.tag ? ` (no ${spell.params.tag}s placed)` : ''}</div>`;
      targetOverlay.classList.remove('hidden');
      return;
    }

    targetBody.innerHTML = `
      <div class="spell-target-hint">${spell.description}</div>
      <div class="spell-target-grid" id="spell-target-grid">
        ${targets.map(u => {
          const isEnemy = !!u._enemyData;
          const name    = isEnemy ? u.name : getUnitName(u);
          const portraitUrl = isEnemy ? null : getPortraitUrl(u);
          return `
            <button class="spell-target-card" data-target-id="${u.id}" data-target-name="${name}">
              ${portraitUrl
                ? `<img class="spell-target-portrait" src="${portraitUrl}" alt="${name}" onerror="this.style.display='none'">`
                : `<div class="spell-target-icon">${isEnemy ? '💀' : unitTypeIcon(u)}</div>`
              }
              <div class="spell-target-name">${name}</div>
              ${!isEnemy ? `<div class="spell-target-sub">${sizeLabel(getUnitSize(u))}</div>` : ''}
            </button>
          `;
        }).join('')}
      </div>
      <button class="spell-cast-cancel-btn" id="spell-cast-cancel">Cancel</button>
    `;

    targetBody.querySelector('#spell-cast-cancel').addEventListener('click', () => {
      closeTargetSheet();
      openSpellSheet();
    });

    targetBody.querySelectorAll('.spell-target-card').forEach(card => {
      card.addEventListener('click', async () => {
        const targetId   = card.dataset.targetId;
        const targetName = card.dataset.targetName;
        closeTargetSheet();
        await confirmAndUseSpell(spell, { id: targetId, name: targetName }, factionSpells);
      });
    });

    targetOverlay.classList.remove('hidden');
  }

  async function confirmAndUseSpell(spell, target, factionSpells) {
    const entry = { ...spell };
    if (target) {
      entry.target_id   = target.id;
      entry.target_name = target.name;
    }
    const idx = selectedSpells.findIndex(s => s.id === spell.id);
    if (idx < 0) selectedSpells.push(entry);
    else selectedSpells[idx] = entry;

    updateSpellsBadge();
    renderSpellSheetList();
    openSpellSheet();
  }

  async function undoSpell(spellId) {
    const idx = selectedSpells.findIndex(s => s.id === spellId);
    if (idx < 0) return;
    selectedSpells.splice(idx, 1);
    await loadResources();
  }

  function placedUnitIds() {
    return new Set(Object.values(occupied).map(p => p.unitId));
  }

  function placedLoyaltyUsed() {
    return [...placedUnitIds()]
      .filter(id => id !== heroId)
      .reduce((sum, id) => {
        const unit = roster.find(u => String(u.id) === String(id));
        const size = getUnitSize(unit);
        return sum + ((size === 'row' || size === 'column') ? 2 : 1);
      }, 0);
  }

  function placedNonHeroCount() { return placedLoyaltyUsed(); }

  function removeUnit(unitId) {
    for (const key of Object.keys(occupied)) {
      if (occupied[key].unitId === unitId) delete occupied[key];
    }
  }

  function canPlace(unit, anchor, ignoredUnitId = null) {
    const size  = getUnitSize(unit);
    const cells = getCells(anchor, size);
    if (!cells) return false;
    if (!cells.every(c => !occupied[c] || occupied[c].unitId === ignoredUnitId)) return false;

    const isHero = unit.id === heroId;
    if (!isHero) {
      const thisCost      = (size === 'row' || size === 'column') ? 2 : 1;
      const alreadyPlaced = ignoredUnitId && ignoredUnitId !== heroId && placedUnitIds().has(ignoredUnitId);
      const ignoredUnit   = alreadyPlaced ? roster.find(u => String(u.id) === String(ignoredUnitId)) : null;
      const ignoredCost   = ignoredUnit ? ((getUnitSize(ignoredUnit) === 'row' || getUnitSize(ignoredUnit) === 'column') ? 2 : 1) : 0;
      const effectiveCost = placedLoyaltyUsed() - (alreadyPlaced ? ignoredCost : 0) + thisCost;
      if (effectiveCost > maxNonHero) return false;
    }

    return true;
  }

  function placeUnit(unit, anchor, ignoredUnitId = null) {
    const size  = getUnitSize(unit);
    const cells = getCells(anchor, size);
    if (!cells) return false;
    if (!cells.every(c => !occupied[c] || occupied[c].unitId === ignoredUnitId)) return false;

    const isHero = unit.id === heroId;
    if (!isHero) {
      const alreadyPlaced2 = ignoredUnitId && ignoredUnitId !== heroId && placedUnitIds().has(ignoredUnitId);
      const ignoredUnit2   = alreadyPlaced2 ? roster.find(u => String(u.id) === String(ignoredUnitId)) : null;
      const ignoredCost2   = ignoredUnit2 ? ((getUnitSize(ignoredUnit2) === 'row' || getUnitSize(ignoredUnit2) === 'column') ? 2 : 1) : 0;
      const thisCost2      = (size === 'row' || size === 'column') ? 2 : 1;
      if (placedLoyaltyUsed() - (alreadyPlaced2 ? ignoredCost2 : 0) + thisCost2 > maxNonHero) return false;
    }

    const normAnchor = cells[0];
    cells.forEach(c => { occupied[c] = { unitId: unit.id, anchor: normAnchor, size }; });
    return true;
  }

  function updateLoyaltyHint() {
    const counter = root.querySelector('#loyalty-counter');
    if (counter) counter.textContent = `${placedLoyaltyUsed()}/${maxNonHero}`;
  }

  function renderPlayerGrid() {
    const grid = root.querySelector('#player-grid');
    grid.innerHTML = Array.from({ length: ROWS * COLS }, (_, i) => {
      const occ = occupied[i];
      if (occ && occ.anchor === i) {
        const unit    = roster.find(u => u.id === occ.unitId);
        const isHero  = occ.unitId === heroId;
        const rowSpan = sizeRowSpan(occ.size);
        const colSpan = sizeColSpan(occ.size);
        const name    = unit ? getUnitName(unit) : '?';
        const portraitUrl = getPortraitUrl(unit, 'grid');
        const currentHp   = unit.unit_data?.current_hp != null ? unit.unit_data.current_hp : (resolveUnitDef(unit)?.hp ?? '—');
        const maxHp       = unit.unit_data?.max_hp != null ? unit.unit_data.max_hp : (resolveUnitDef(unit)?.hp ?? '—');
        const isAlive     = unit.unit_data?.alive !== false;
        const spellBuffs = selectedSpells.filter(s => {
          if (s.target_scope === 'all_allies') return true;
          if (s.target_scope === 'all_enemies') return false;
          if (s.target_id && unit && String(s.target_id) === String(unit.id)) return true;
          if (s.target_scope === 'tag_allies' && s.params?.tag) {
            const def = resolveUnitDef(unit);
            return (def?.tags ?? []).includes(s.params.tag);
          }
          return false;
        });
        const spellDot = spellBuffs.length > 0 ? `<span class="battle-cell-spell-dot">✦</span>` : '';
        return `<div class="battle-cell battle-cell--placed ${isHero ? 'battle-cell--hero' : ''} ${isAlive ? '' : 'battle-cell--dead'}"
                     data-i="${i}" style="grid-row:span ${rowSpan};grid-column:span ${colSpan};">
          ${portraitUrl ? `<img class="battle-cell-portrait" src="${portraitUrl}" alt="${name}" onerror="this.style.display='none'">` : ''}
          <div class="battle-cell-info">
            <span class="battle-cell-name">${name}</span>
            <span class="battle-cell-sub">${isAlive ? `${currentHp}/${maxHp}` : 'Dead'}</span>
          </div>
          ${spellDot}
          <span class="battle-cell-remove" data-remove="${i}">✕</span>
        </div>`;
      }
      if (occ && occ.anchor !== i) return '';
      return `<div class="battle-cell battle-cell--empty" data-i="${i}">
        <span class="battle-cell-row-hint">R${cellRow(i) + 1}</span>
      </div>`;
    }).join('');
  }

  function renderEnemyGrid() {
    const grid = root.querySelector('#enemy-grid');

    const unitAtCell = {};
    for (const e of enemies) {
      if (e.size === 'row') {
        unitAtCell[e.cell] = e;
        unitAtCell[e.cell + 1] = { _shadow: true };
      } else {
        unitAtCell[e.cell] = e;
      }
    }

    grid.innerHTML = Array.from({ length: ROWS * COLS }, (_, i) => {
      const e = unitAtCell[i];
      if (!e) return `<div class="battle-cell battle-cell--fog">???</div>`;
      if (e._shadow) return '';
      const colSpan = e.size === 'row' ? 2 : 1;
      const rowSpan = e.size === 'column' ? 2 : 1;
      return `<div class="battle-cell battle-cell--enemy" data-i="${i}" style="grid-column:span ${colSpan};grid-row:span ${rowSpan};">
        <img class="battle-cell-portrait" src="/assets/character_portraits/p_${e.id}.png" alt="${e.name}" onerror="this.style.display='none'">
        <div class="battle-cell-info">
          <span class="battle-cell-name">${e.name}</span>
          <span class="battle-cell-sub">❤ ${e.hp}</span>
        </div>
      </div>`;
    }).join('');

    grid.querySelectorAll('.battle-cell--enemy').forEach(cell => {
      cell.addEventListener('click', () => {
        const e = unitAtCell[Number(cell.dataset.i)];
        if (e && !e._shadow) showDetail(e.name, enemyDetailHtml(e));
      });
    });
  }

  function renderPortraitTrack() {
    const track     = root.querySelector('#portrait-track');
    const placed    = placedUnitIds();
    const available = roster.filter(u => !placed.has(u.id) && (u.unit_data?.alive !== false));
    const loyaltyLeft = maxNonHero - placedLoyaltyUsed();

    if (!available.length) {
      track.innerHTML = `<span class="track-empty-hint">All units placed</span>`;
      return;
    }

    track.innerHTML = available.map(u => {
      const isHero     = u.id === heroId;
      const isSelected = dragUnit?.id === u.id;
      const unitCost   = (getUnitSize(u) === 'row' || getUnitSize(u) === 'column') ? 2 : 1;
      const locked     = !isHero && loyaltyLeft < unitCost;
      const name       = getUnitName(u);
      const size       = getUnitSize(u);
      const portraitUrl = getPortraitUrl(u);
      return `
        <div class="portrait-card
                    ${isHero     ? 'portrait-card--hero'     : ''}
                    ${isSelected ? 'portrait-card--selected' : ''}
                    ${locked     ? 'portrait-card--locked'   : ''}"
             data-id="${u.id}">
          ${portraitUrl ? `<img class="portrait-art-img" src="${portraitUrl}" alt="${name}" onerror="this.style.display='none'">` : `<div class="portrait-art">${isHero ? '★' : unitTypeIcon(u)}</div>`}
          <div class="portrait-name">${name}</div>
          <div class="portrait-size">${sizeLabel(size)}</div>
        </div>
      `;
    }).join('');
  }

  function checkReady() {
    const heroPlaced   = heroId !== null && placedUnitIds().has(heroId);
    const embarkNavBtn = document.querySelector('.nav-btn[data-screen="embark"]');
    if (embarkNavBtn) {
      embarkNavBtn.classList.toggle('nav-btn--battle-ready', heroPlaced);
      embarkNavBtn.querySelector('.nav-btn-label').textContent = 'Enter Battle';
    }
    const btn = root.querySelector('#ready-btn');
    if (btn) btn.disabled = !heroPlaced;
  }

  function setHover(i) {
    if (hoverCell === i) return;
    clearHover();
    hoverCell = i;
    const cell = root.querySelector(`#player-grid [data-i="${i}"]`);
    if (cell) cell.classList.add('battle-cell--hover');
  }

  function clearHover() {
    if (hoverCell !== null) {
      const prev = root.querySelector(`#player-grid [data-i="${hoverCell}"]`);
      if (prev) prev.classList.remove('battle-cell--hover');
      hoverCell = null;
    }
  }

  function fullRefresh() {
    renderPlayerGrid();
    renderPortraitTrack();
    attachPortraitEvents();
    attachGridDragEvents();
    updateLoyaltyHint();
    checkReady();
  }

  let activeGhost    = null;
  let pointerDragging = false;

  function makeDragGhost(unit) {
    const size     = getUnitSize(unit);
    const name     = getUnitName(unit);
    const portrait = getPortraitUrl(unit);
    const isHero   = unit.id === heroId;

    const sampleCell = playerGrid.querySelector('.battle-cell') ||
                       root.querySelector('.battle-cell');
    const cellW = sampleCell ? sampleCell.offsetWidth  : 80;
    const cellH = sampleCell ? sampleCell.offsetHeight : 110;

    const w = size === 'row'    ? cellW * 2 : cellW;
    const h = size === 'column' ? cellH * 2 : cellH;

    const ghost = document.createElement('div');
    ghost.style.cssText = [
      `width:${w}px`, `height:${h}px`,
      'position:fixed', 'top:-9999px', 'left:-9999px',
      'pointer-events:none', 'z-index:9999',
      'border-radius:0', 'overflow:hidden',
      `outline:2px solid ${isHero ? 'gold' : 'var(--accent)'}`,
      `background:${isHero ? '#2a2a10' : '#1a2a1a'}`,
      'display:flex', 'flex-direction:column',
      'align-items:stretch', 'justify-content:flex-end',
      'opacity:0.85',
    ].join(';');

    if (portrait) {
      const img = document.createElement('img');
      img.src = portrait;
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top center;';
      ghost.appendChild(img);
    }

    const info = document.createElement('div');
    info.style.cssText = [
      'position:absolute', 'bottom:0', 'left:0', 'right:0',
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:2px',
      'padding:10px 4px 4px',
      'background:linear-gradient(to top,rgba(0,0,0,0.80) 0%,transparent 100%)',
    ].join(';');

    const nameEl = document.createElement('span');
    nameEl.textContent = name;
    nameEl.style.cssText = 'font-size:0.52rem;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;text-align:center;';
    info.appendChild(nameEl);
    ghost.appendChild(info);

    document.body.appendChild(ghost);
    return { ghost, w, h };
  }

  function moveGhost(clientX, clientY) {
    if (!activeGhost) return;
    const { ghost, w, h } = activeGhost;
    ghost.style.left = `${clientX - w / 2}px`;
    ghost.style.top  = `${clientY - h / 2}px`;
  }

  function removeGhost() {
    if (activeGhost) { activeGhost.ghost.remove(); activeGhost = null; }
  }

  function cellFromPoint(clientX, clientY) {
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      const cell = el.closest('#player-grid [data-i]');
      if (cell) return cell;
    }
    return null;
  }

  function startPointerDrag(unit, fromCell, clientX, clientY) {
    dragUnit        = unit;
    dragFromCell    = fromCell;
    pointerDragging = true;
    activeGhost     = makeDragGhost(unit);
    moveGhost(clientX, clientY);
    root.querySelectorAll('.battle-cell--dragging').forEach(c => c.classList.remove('battle-cell--dragging'));
    if (fromCell !== null) {
      const el = playerGrid.querySelector(`[data-i="${fromCell}"]`);
      if (el) el.classList.add('battle-cell--dragging');
    }
  }

  function isOverSlider(clientX, clientY) {
    const track = root.querySelector('#portrait-track');
    if (!track) return false;
    const rect = track.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function finishPointerDrag(clientX, clientY) {
    clearHover();
    removeGhost();
    pointerDragging = false;

    const cell     = cellFromPoint(clientX, clientY);
    const ignoreId = dragFromCell !== null ? (occupied[dragFromCell]?.unitId ?? null) : null;

    if (cell && dragUnit) {
      const i = Number(cell.dataset.i);
      if (canPlace(dragUnit, i, ignoreId)) {
        if (ignoreId) removeUnit(ignoreId);
        placeUnit(dragUnit, i);
        dragUnit     = null;
        dragFromCell = null;
        fullRefresh();
        return;
      }
    }

    if (dragUnit && dragFromCell !== null && ignoreId) {
      removeUnit(ignoreId);
      dragUnit     = null;
      dragFromCell = null;
      fullRefresh();
      return;
    }

    dragUnit     = null;
    dragFromCell = null;
    root.querySelectorAll('.battle-cell--dragging').forEach(c => c.classList.remove('battle-cell--dragging'));
    fullRefresh();
  }

  function cancelPointerDrag() {
    clearHover();
    removeGhost();
    pointerDragging = false;
    dragUnit        = null;
    dragFromCell    = null;
    root.querySelectorAll('.battle-cell--dragging').forEach(c => c.classList.remove('battle-cell--dragging'));
    const track = root.querySelector('#portrait-track');
    if (track) track.classList.remove('portrait-track--drop-target');
  }

  document.addEventListener('pointermove', e => {
    if (!pointerDragging) return;
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);

    const cell     = cellFromPoint(e.clientX, e.clientY);
    const ignoreId = dragFromCell !== null ? (occupied[dragFromCell]?.unitId ?? null) : null;
    const track    = root.querySelector('#portrait-track');

    if (cell) {
      const i         = Number(cell.dataset.i);
      const targetOcc = occupied[i];
      const isSelf    = targetOcc && targetOcc.unitId === ignoreId;
      if ((!targetOcc || isSelf) && canPlace(dragUnit, i, ignoreId)) {
        setHover(i);
        if (track) track.classList.remove('portrait-track--drop-target');
        return;
      }
    }

    if (track && dragFromCell !== null) {
      const overSlider = isOverSlider(e.clientX, e.clientY);
      track.classList.toggle('portrait-track--drop-target', overSlider);
    }

    clearHover();
  }, { passive: false });

  document.addEventListener('pointerup', e => {
    if (!pointerDragging) return;
    finishPointerDrag(e.clientX, e.clientY);
  });

  document.addEventListener('pointercancel', () => {
    if (pointerDragging) cancelPointerDrag();
  });

  const playerGrid = root.querySelector('#player-grid');

  function attachGridDragEvents() {
    playerGrid.querySelectorAll('.battle-cell--placed').forEach(cell => {
      cell.addEventListener('pointerdown', e => {
        if (e.target.closest('[data-remove]')) return;
        e.preventDefault();
        const anchor = Number(cell.dataset.i);
        const occ    = occupied[anchor];
        if (!occ) return;
        const unit = roster.find(u => u.id === occ.unitId);
        if (!unit) return;
        cell.setPointerCapture(e.pointerId);
        startPointerDrag(unit, anchor, e.clientX, e.clientY);
      });
    });
  }

  playerGrid.addEventListener('click', e => {
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) {
      const anchor = Number(removeBtn.dataset.remove);
      const occ    = occupied[anchor];
      if (occ) removeUnit(occ.unitId);
      fullRefresh();
      clearDetail();
      return;
    }

    if (pointerDragging) return;

    const cell = e.target.closest('[data-i]');
    if (!cell) return;
    const i   = Number(cell.dataset.i);
    const occ = occupied[i];

    if (occ) {
      const unit = roster.find(u => u.id === occ.unitId);
      if (unit) {
        const def  = resolveUnitDef(unit);
        const name = def?.name ?? unit.unit_data?.unit_id ?? 'Unit';
        showDetail(name, unitDetailHtml(unit));
      }
      return;
    }

    if (dragUnit && !pointerDragging && canPlace(dragUnit, i)) {
      if (dragFromCell !== null) removeUnit(dragUnit.id);
      placeUnit(dragUnit, i);
      dragUnit     = null;
      dragFromCell = null;
      fullRefresh();
    }
  });

  document.addEventListener('click', e => {
    const abilityBtn = e.target.closest('.ability-icon');
    if (!abilityBtn) return;
    const key  = abilityBtn.dataset.abilityKey;
    const type = abilityBtn.dataset.abilityType;
    const def  = resolveAbility(key);
    if (!def) return;
    const typeLabel   = type === 'passive' ? 'Passive' : 'Active';
    const description = buildStatDescription(def, type) || 'No details available.';
    const text = `[${typeLabel}] ${def.name}${def.rank ? ` (Rank ${def.rank})` : ''}\n\n${description}`;
    openModal(`${typeLabel} Ability`, renderModalContent(text));
  });

  function attachPortraitEvents() {
    root.querySelectorAll('.portrait-card').forEach(card => {
      const u = roster.find(r => String(r.id) === String(card.dataset.id));
      if (!u) return;

      if (card.classList.contains('portrait-card--locked')) return;

      card.addEventListener('pointerdown', e => {
        e.preventDefault();
        card.setPointerCapture(e.pointerId);
        startPointerDrag(u, null, e.clientX, e.clientY);
      });

      card.addEventListener('click', e => {
        if (pointerDragging) return;
        const wasSelected = dragUnit?.id === u.id;
        dragUnit     = wasSelected ? null : u;
        dragFromCell = null;
        renderPortraitTrack();
        attachPortraitEvents();
        const uDef  = resolveUnitDef(u);
        const uName = uDef?.name ?? u.unit_data?.unit_id ?? 'Unit';
        showDetail(uName, unitDetailHtml(u));
      });
    });
  }

  async function loadResources() {
    try {
      const inventory = await api(`/inventory?chat_id=${player.chat_id}&type=resource`);
      playerCrystals = {};
      if (Array.isArray(inventory)) {
        for (const row of inventory) {
          if (row.item in CRYSTAL_ICONS) {
            playerCrystals[row.item] = row.amount;
          }
        }
      }
    } catch (err) {
      console.error('Failed to load resources:', err);
      playerCrystals = {};
    }
  }

  async function loadLearnedSpells() {
    try {
      const response = await api(`/spells/research?chat_id=${player.chat_id}`);
      if (!response || typeof response !== 'object') return;
      learnedSpells = Array.isArray(response) ? response : (response.researched_spells || []);
    } catch (err) {
      console.error('Failed to load learned spells:', err);
      learnedSpells = [];
    }
  }

  root.querySelector('#ready-btn').addEventListener('click', async () => {
    if (!placedUnitIds().has(heroId)) return;

    const loyaltyUsed = placedLoyaltyUsed();
    const loyaltyLeft = maxNonHero - loyaltyUsed;
    const hasUnplacedFollowers = roster.some(u => {
      if (u.id === heroId) return false;
      if (placedUnitIds().has(u.id)) return false;
      const cost = u.unit_data?.loyalty_cost ?? 1;
      return cost <= loyaltyLeft;
    });

    if (hasUnplacedFollowers) {
      const confirmed = await new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
          <div class="confirm-modal">
            <div class="confirm-modal-text">You can take more followers into battle. Continue without them?</div>
            <div class="confirm-modal-actions">
              <button class="confirm-modal-btn confirm-modal-btn--cancel">Go Back</button>
              <button class="confirm-modal-btn confirm-modal-btn--confirm">Continue</button>
            </div>
          </div>`;
        overlay.querySelector('.confirm-modal-btn--cancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
        overlay.querySelector('.confirm-modal-btn--confirm').addEventListener('click', () => { overlay.remove(); resolve(true); });
        document.body.appendChild(overlay);
      });
      if (!confirmed) return;
    }

    const btn = root.querySelector('#ready-btn');
    btn.disabled = true;
    btn.textContent = 'Preparing…';

    const playerUnitIds = roster
      .filter(u => placedUnitIds().has(u.id))
      .map(u => ({ id: String(u.id), _rosterId: String(u.id) }));

    const placement = {};
    for (const [cellIdx, occ] of Object.entries(occupied)) {
      if (occ.anchor === Number(cellIdx)) {
        placement[occ.unitId] = Number(cellIdx);
      }
    }

    try {
      const battle_id = `${player.chat_id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const result = await api('/battle/create', {
        chat_id: player.chat_id,
        battle_id,
        playerUnitIds,
        placement,
        region_id,
        level,
        selected_spells: selectedSpells.map(s => ({
          spell_id:  s.id,
          target_id: s.target_id ?? null,
        })),
      });
      navigate('battle', { player, battle_id, region_id, level, snapshot: result.state, selectedSpells });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Ready Up';
      console.error('Failed to create battle:', err);
    }
  });

  (async () => {
    try {
      const [rosterData] = await Promise.all([
        api(`/roster?chat_id=${player.chat_id}`),
      ]);

      roster = rosterData.map((u, i) => ({ ...u, id: u.id != null ? u.id : String(i) }));

      const heroUnit = roster.find(u => u.is_hero === true);
      heroId     = heroUnit?.id ?? null;
      maxNonHero = getLoyalty(heroUnit);

      enemies = getEncounter(region_id, level);

      await Promise.all([loadResources(), loadLearnedSpells()]);

      const factionSpellsAll = SPELLS[player.faction] || [];
      const firstLearnedTier = factionSpellsAll.find(s => learnedSpells.includes(s.id))?.tier;
      if (firstLearnedTier) {
        activeSpellTier = firstLearnedTier;
        syncSpellSheetTierTabs();
      }

      renderPlayerGrid();
      renderEnemyGrid();
      renderPortraitTrack();
      attachPortraitEvents();
      attachGridDragEvents();
      updateLoyaltyHint();
      checkReady();
    } catch (err) {
      console.error('Failed to initialise battle prep:', err);
    }
  })();
}