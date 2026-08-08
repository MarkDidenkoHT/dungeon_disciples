import { api, navigate, resourceCache, refreshResourceBar, bootstrapCache }  from '../api.js';
import { SPELLS, SPELL_CATEGORIES } from '../../data/spells.js';

// The Spell Tome's tabs minus non-combat, which is roster-only and has nothing
// castable in a battle.
const COMBAT_CATEGORIES = SPELL_CATEGORIES.filter(c => c.id !== 'non_combat');
import { getEncounter, getEncounterSpellId } from '../../data/embark.js';
import { UNIT_ABILITIES }  from '../../data/unit_abilities.js';
import { derivePrefPosition, isPositionSatisfied, pickPositionBark } from '../../data/position_barks.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';
import { lang } from './settings.js';
import {
  RESIST_ICONS, RESIST_ORDER,
  cap, dmgReduction, CRYSTAL_ICONS,
  resolveUnitDef, resolveAbility, buildStatDescription,
  renderModalContent, openSheet, closeSheet, getSheetBody,
  playPageTurnSound, buildUnitCard,
  renderItemSlotIcon, buildItemModalParts, buildAbilityModalParts, calcUnitPower,
  itemFromDefKey, combatantItem,
  spellName, spellDesc, withEquippedItem,
} from '../utils.js';

const BP_TEXT = {
  undo:        { en: 'Undo',   ru: 'Отменить' },
  use:         { en: 'Use',    ru: 'Применить' },
  cancel:      { en: 'Cancel', ru: 'Отмена' },
  hiddenSpell: { en: 'This group has a hidden spell prepared',
                 ru: 'У этой группы заготовлено скрытое заклинание' },
  goBack:      { en: 'Go Back', ru: 'Назад' },
  continueOn:  { en: 'Continue', ru: 'Продолжить' },
  undoFirst:   { en: 'Undo active spell first', ru: 'Сначала отмените активное заклинание' },
  moreFollowers: {
    en: 'You can take more followers into battle. Continue without them?',
    ru: 'Вы можете взять в бой больше спутников. Продолжить без них?',
  },
};

const BP_NAV_LABELS = {
  spells:      { en: 'Spells',      ru: 'Заклинания' },
  embark:      { en: 'Embark',      ru: 'Поход' },
  castSpell:   { en: 'Cast Spell',  ru: 'Заклинание' },
  enterBattle: { en: 'Enter Battle', ru: 'В бой' },
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
  const L = lang(player);

  root.innerHTML = `
    <div class="screen screen-battle-prep">
      <div class="battle-arena">
        <div class="battle-half battle-half--player">
          <div class="battle-grid-wrap">
            <div class="battle-grid" id="player-grid"></div>
          </div>
        </div>
        <div class="battle-half battle-half--enemy">
          <div class="battle-grid-wrap">
            <div class="battle-grid" id="enemy-grid"></div>
          </div>
        </div>
      </div>

      <!-- Sits BELOW the grids: a launch button pinned to the top edge of the
           screen is awkward to reach on a phone. Your power on the left, the
           enemy's on the right, the button in the gap between them. Both sides
           use the same type scale so neither one shouts. -->
      <div class="battle-prep-header">
        <div class="prep-side prep-side--player">
          <span class="prep-side-label">Your Power</span>
          <span class="prep-side-stats">
            <span id="loyalty-counter" class="loyalty-counter"></span>
            <span id="player-army-power" class="army-power"></span>
          </span>
        </div>

        <button id="ready-btn" class="battle-prep-enter-btn" disabled aria-label="To Battle">
          <img src="/assets/icons/ui/to_battle.png" alt="To Battle"
               onerror="this.replaceWith(document.createTextNode('⚔'))">
        </button>

        <div class="prep-side prep-side--enemy">
          <span class="prep-side-label">Enemy Power</span>
          <span class="prep-side-stats">
            <span class="enemy-spell-indicator" id="enemy-spell-indicator" title="${BP_TEXT.hiddenSpell[L]}" style="display:none;">📖</span>
            <span id="enemy-army-power" class="army-power"></span>
          </span>
        </div>
      </div>

      <div class="battle-prep-tab-content active" id="tab-formation">
        <div class="prep-track-wrap">
          <div class="portrait-track" id="portrait-track"></div>
        </div>
      </div>

    </div>

    <div id="spell-sheet-overlay" class="spell-sheet-overlay hidden">
      <div class="spell-sheet" id="spell-sheet">
        <div class="spell-sheet-handle"></div>
        <div class="spell-sheet-header">
          <span class="spell-sheet-title">Spells</span>
          <button class="spell-sheet-close" id="spell-sheet-close" aria-label="Close">✕</button>
        </div>
        <!-- Non-combat spells are roster-only, so that tab is omitted here. -->
        <div class="tier-tabs" id="spell-sheet-tier-tabs">
          ${COMBAT_CATEGORIES.map((c, i) => `
            <button class="tier-tab${i === 0 ? ' tier-tab--active' : ''}" data-category="${c.id}">${player?.settings?.language === 'ru' ? c.name_ru : c.name}</button>
          `).join('')}
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
  let items            = [];

  function equippedItemFor(rosterId) {
    return items.find(it => String(it.equipped_by) === String(rosterId)) || null;
  }
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
  let activeSpellCategory = COMBAT_CATEGORIES[0].id;

  function openModal(title, bodyHtml, badgesHtml = '') { openSheet(title, bodyHtml, badgesHtml); }
  function closeModal() { closeSheet(); }

  const spellSheetOverlay  = root.querySelector('#spell-sheet-overlay');
  const spellSheetBody     = root.querySelector('#spell-sheet-body');
  const spellSheetTierTabs = root.querySelector('#spell-sheet-tier-tabs');

  const targetOverlay   = root.querySelector('#spell-target-overlay');
  const targetBody      = root.querySelector('#spell-target-body');
  const targetTitle     = root.querySelector('#spell-target-title');

  // Guards the one-time spell_buff onboarding prompt so checkReady (which runs
  // often) can't re-trigger it.
  let spellBuffPrompted = false;

  // The resource bar is collapsed in battle prep; slide it down while the spell
  // sheet is open so the player can see their crystals, then slide it back up.
  function setResourceBarVisible(visible) {
    // The ROW, not the strip — the timeline and errands buttons are siblings of
    // the strip now and must collapse with it.
    const row = document.getElementById('resource-bar-row') || document.getElementById('resource-bar');
    if (row) row.classList.toggle('resource-bar--collapsed', !visible);
  }

  function openSpellSheet() {
    renderSpellSheetList();
    spellSheetOverlay.classList.remove('hidden');
    refreshResourceBar(player).catch(() => {}); // show current crystal counts
    setResourceBarVisible(true);
    // Opening the book satisfies the buff lesson.
    if (!isTutorialDone(player, 'spell_buff')) {
      markTutorialDone(player, 'spell_buff');
      hideTutorial();
    }
  }

  function closeSpellSheet() {
    spellSheetOverlay.classList.add('hidden');
    setResourceBarVisible(false);
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
      t.classList.toggle('tier-tab--active', t.dataset.category === activeSpellCategory);
    });
  }

  spellSheetTierTabs.querySelectorAll('.tier-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const category = tab.dataset.category;
      if (category === activeSpellCategory) return;
      playPageTurnSound();
      activeSpellCategory = category;
      syncSpellSheetTierTabs();
      renderSpellSheetList();
    });
  });

  const spellsNavBtn = document.querySelector('.nav-btn[data-screen="spells"]');
  if (spellsNavBtn) {
    spellsNavBtn.querySelector('.nav-btn-label').textContent = BP_NAV_LABELS.castSpell[L];
    spellsNavBtn._battlePrepHandler = (e) => { e.stopImmediatePropagation(); openSpellSheet(); };
    spellsNavBtn.addEventListener('click', spellsNavBtn._battlePrepHandler, true);
  }


  function restoreNavLabels() {
    const s = document.querySelector('.nav-btn[data-screen="spells"]');
    if (s) {
      s.querySelector('.nav-btn-label').textContent = BP_NAV_LABELS.spells[L];
      if (s._battlePrepHandler) { s.removeEventListener('click', s._battlePrepHandler, true); delete s._battlePrepHandler; }
    }
  }



  function updateSpellsBadge() {
    const spellsNav = document.querySelector('.nav-btn[data-screen="spells"] .nav-btn-label');
    if (!spellsNav) return;
    spellsNav.textContent = selectedSpells.length > 0 ? `${BP_NAV_LABELS.castSpell[L]} (${selectedSpells.length})` : BP_NAV_LABELS.castSpell[L];
  }

  function showDetail(title, html) {
    openSheet(title, html);
  }

  function clearDetail() {
    closeSheet();
  }

  function unitDetailHtml(unit) {
    const def    = resolveUnitDef(unit);
    if (!def) return renderModalContent('Unit data unavailable.');
    const stored = unit.unit_data || {};
    const isHero = unit.id === heroId;
    const alive     = stored.alive !== false;
    const equippedItem = equippedItemFor(unit.id);
    // HP derived from base + worn item, same as every other item stat.
    const baseMaxHp = stored.max_hp != null ? stored.max_hp : (def.hp ?? null);
    const derived   = withEquippedItem(
      { max_hp: baseMaxHp ?? 0, current_hp: stored.current_hp ?? baseMaxHp ?? 0 },
      equippedItem);
    const currentHp = baseMaxHp == null ? '—' : derived.current_hp;
    const maxHp     = baseMaxHp == null ? '—' : derived.max_hp;

    const liveUnit = { ...def, hp: `${currentHp}/${maxHp}`, xp: stored.current_xp ?? 0 };
    const badge    = isHero ? '★ Hero' : sizeLabel(getUnitSize(unit));
    const deadHtml = alive ? '' : `<div class="battle-prep-dead-label">Dead / unavailable</div>`;
    const itemSlotHtml  = renderItemSlotIcon(equippedItem, unit.id, { interactive: false, player });

    return buildUnitCard(liveUnit, { badge, itemSlotHtml }) + deadHtml;
  }

  function enemyDetailHtml(e) {
    // Enemies carry items too — encounter slots in data/embark.js name an
    // item_id, and getEncounter folds its stats in. Show the slot so the player
    // can see (and read) what the thing facing them is wearing.
    const enemyItem = itemFromDefKey(e.item_id);
    const itemSlotHtml = enemyItem
      ? renderItemSlotIcon(enemyItem, null, { interactive: false, player })
      : '';
    return buildUnitCard(e, { badge: 'Enemy', itemSlotHtml });
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

  // Non-combat spells (resurrect/heal) are usable only from the roster screen,
  // never in a battle. Their category is the single source of truth for that.
  function isRosterOnlySpell(spell) {
    return spell.category === 'non_combat';
  }

  function renderSpellSheetList() {
    const factionSpells = SPELLS[player.faction] || [];
    const learned       = factionSpells
      .filter(s => learnedSpells.includes(s.id) && s.category === activeSpellCategory)
      .sort((a, b) => a.tier - b.tier);

    if (learned.length === 0) {
      spellSheetBody.innerHTML = `<div class="spell-sheet-empty">No learned spells in this category</div>`;
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
          <div class="spell-list-icon"><img src="/assets/icons/spells/${spell.id}.png" class="spell-icon-img" alt="${spellName(spell, player)}" onerror="this.style.display='none'"></div>
          <div class="spell-list-info">
            <div class="spell-list-name">${spellName(spell, player)}</div>
            <div class="spell-list-meta">
              <span class="spell-list-cost">${spellCostLabel(spell)}</span>
              <span class="spell-list-target">${targetLabel}</span>
            </div>
            <div class="spell-list-desc">${spellDesc(spell, player)}</div>
          </div>
          <div class="spell-list-action">
            ${used
              ? `<button class="spell-list-undo-btn" data-undo-id="${spell.id}">${BP_TEXT.undo[L]}</button>`
              : spellSlotFull
                ? `<span class="spell-list-locked">${BP_TEXT.undoFirst[L]}</span>`
                : affordable
                  ? `<button class="spell-list-use-btn" data-use-id="${spell.id}">${BP_TEXT.use[L]}</button>`
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
    targetTitle.textContent = `${spellName(spell, player)} — Choose Target`;

    if (targets.length === 0) {
      targetBody.innerHTML = `<div class="spell-sheet-empty">No eligible targets${spell.params?.tag ? ` (no ${spell.params.tag}s placed)` : ''}</div>`;
      targetOverlay.classList.remove('hidden');
      return;
    }

    targetBody.innerHTML = `
      <div class="spell-target-hint">${spellDesc(spell, player)}</div>
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
      <button class="spell-cast-cancel-btn" id="spell-cast-cancel">${BP_TEXT.cancel[L]}</button>
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

    // Formation hint. Queued rather than shown here because the grid is about to
    // be re-rendered by fullRefresh(), which would destroy the toast's cell.
    // Every placement path funnels through placeUnit, so this covers drag-drop,
    // tap-to-place and grid-to-grid moves alike.
    queuePositionBark(unit, cells, normAnchor);
    return true;
  }

  // A unit whose footprint does not include its preferred column objects. Large
  // 2-wide units span both columns and so never object — see position_barks.js.
  function queuePositionBark(unit, cells, anchor) {
    if (player?.settings?.barks_enabled === false) return;
    const def = resolveUnitDef(unit);
    const prefers = derivePrefPosition(def);
    if (!prefers) return;
    if (isPositionSatisfied(prefers, cells.map(cellCol))) return;
    const bark = pickPositionBark(def, prefers);
    if (!bark) return;
    const text = L === 'en' ? bark.text : bark.text_ru;
    if (!text) return;
    pendingPositionBark = { anchor, text };
  }

  let pendingPositionBark = null;

  function flushPositionBark() {
    // A re-render destroys any live toast (and its cell) but leaves the grid
    // raised above its frame art, so drop that back down when nothing is talking.
    root.querySelectorAll('.battle-grid--bark').forEach(g => {
      if (!g.querySelector('.battle-cell--bark-active')) g.classList.remove('battle-grid--bark');
    });
    if (!pendingPositionBark) return;
    const { anchor, text } = pendingPositionBark;
    pendingPositionBark = null;
    const cell = root.querySelector(`#player-grid [data-i="${anchor}"]`);
    if (!cell) return;

    root.querySelectorAll('.prep-bark-toast').forEach(t => t.remove());
    // Same escape hatch the battle screen uses: the cell clips by default and
    // the grid sits under its own frame art, so both classes are load-bearing
    // for the toast to be visible at all (see .battle-cell--bark-active).
    const grid = cell.closest('.battle-grid');
    cell.classList.add('battle-cell--bark-active');
    grid?.classList.add('battle-grid--bark');

    const toast = document.createElement('div');
    toast.className = 'bark-toast prep-bark-toast';
    toast.textContent = text;
    cell.appendChild(toast);

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      toast.remove();
      cell.classList.remove('battle-cell--bark-active');
      if (grid && !grid.querySelector('.battle-cell--bark-active')) {
        grid.classList.remove('battle-grid--bark');
      }
      clearTimeout(timer);
      document.removeEventListener('pointerdown', dismiss, true);
    };
    const timer = setTimeout(dismiss, 4000);
    // Deferred so the pointerup that placed the unit does not instantly close it.
    setTimeout(() => document.addEventListener('pointerdown', dismiss, true), 0);
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
        // HP derived from base + worn item (see applyItemModifiers).
        const gridBaseMax = unit.unit_data?.max_hp != null ? unit.unit_data.max_hp : (resolveUnitDef(unit)?.hp ?? null);
        const gridDerived = withEquippedItem(
          { max_hp: gridBaseMax ?? 0, current_hp: unit.unit_data?.current_hp ?? gridBaseMax ?? 0 },
          equippedItemFor(unit.id));
        const currentHp   = gridBaseMax == null ? '—' : gridDerived.current_hp;
        const maxHp       = gridBaseMax == null ? '—' : gridDerived.max_hp;
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

    const playerPowerEl = root.querySelector('#player-army-power');
    if (playerPowerEl) {
      const placed = Object.values(occupied).filter(o => o && o.anchor !== undefined);
      const total  = placed.reduce((sum, occ) => {
        const u = roster.find(r => r.id === occ.unitId);
        if (!u) return sum;
        const def = resolveUnitDef(u) || {};
        // Army power must count the worn item's stats too.
        const withItem = withEquippedItem(
          { ...def, hp: u.unit_data?.max_hp ?? def.hp }, equippedItemFor(u.id));
        return sum + calcUnitPower(withItem);
      }, 0);
      playerPowerEl.textContent = total > 0 ? `⚔ ${total}` : '';
    }
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

    const enemyPowerEl = root.querySelector('#enemy-army-power');
    if (enemyPowerEl) {
      const total = enemies.reduce((sum, e) => sum + calcUnitPower(e), 0);
      enemyPowerEl.textContent = total > 0 ? `⚔ ${total}` : '';
    }

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

  // Front/back columns, then loyalty — both shown once, then `done()` hands off
  // to whatever step comes next. Each is skipped individually if already seen,
  // so a player who quit halfway through resumes where they stopped.
  function showFormationLessons(done) {
    const showLoyalty = () => {
      if (isTutorialDone(player, 'battle_prep_loyalty')) { done(); return; }
      const counter = root.querySelector('#loyalty-counter');
      if (!counter) { done(); return; }
      showTutorialSpotlight(player, 'battle_prep_loyalty', counter, {
        showContinue: true,
        onAdvance: () => { markTutorialDone(player, 'battle_prep_loyalty'); done(); },
      });
    };

    if (isTutorialDone(player, 'battle_prep_lines')) { showLoyalty(); return; }
    const grid = root.querySelector('#player-grid');
    if (!grid) { showLoyalty(); return; }
    showTutorialSpotlight(player, 'battle_prep_lines', grid, {
      showContinue: true,
      onAdvance: () => { markTutorialDone(player, 'battle_prep_lines'); showLoyalty(); },
    });
  }

  function checkReady() {
    const heroPlaced   = heroId !== null && placedUnitIds().has(heroId);
    const btn = root.querySelector('#ready-btn');
    if (btn) {
      btn.disabled = !heroPlaced;
      btn.classList.toggle('battle-prep-enter-btn--ready', heroPlaced);
    }

    if (heroPlaced) {
      markTutorialDone(player, 'battle_prep_start');
      hideTutorial();
      // Next onboarding beat: point at the spellbook so the player casts their
      // buff before the fight. Shown once; completed here or in openSpellSheet.
      if (!isTutorialDone(player, 'spell_buff') && !spellBuffPrompted) {
        spellBuffPrompted = true;
        const navBtn = document.querySelector('.nav-btn[data-screen="spells"]');
        if (navBtn) {
          showTutorialSpotlight(player, 'spell_buff', navBtn, {
            showContinue: true,
            onAdvance: () => markTutorialDone(player, 'spell_buff'),
          });
        }
      }
    } else if (!isTutorialDone(player, 'battle_prep_start')) {
      // First visit runs a short chain before the "place your hero" step: the
      // two rules a new player cannot infer from the grid alone.
      showFormationLessons(() => {
        const heroCard = root.querySelector('.portrait-card--hero');
        if (heroCard) showTutorialSpotlight(player, 'battle_prep_start', heroCard);
      });
    }
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
    flushPositionBark();
  }

  let activeGhost    = null;
  let pointerDragging = false;
  // Id of the pointer that owns the current drag. A touch screen happily
  // delivers a second pointerdown (second finger, or a palm brushing another
  // card) while the first is still down; without this, that second press
  // started a fresh drag and orphaned the first ghost in the DOM forever —
  // a fixed-position, pointer-events:none card stuck on screen. Every drag
  // handler below ignores pointers that are not the owner.
  let activePointerId = null;

  function makeDragGhost(unit) {
    const size     = getUnitSize(unit);
    const name     = getUnitName(unit);
    const portrait = getPortraitUrl(unit);

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
      // No hero-specific colour: the hero is marked by holding the first slot,
      // not by a gold tint (see .portrait-card / .battle-cell in style.css).
      'outline:2px solid var(--accent)',
      'background:#1a2a1a',
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

  function startPointerDrag(unit, fromCell, clientX, clientY, pointerId = null) {
    // Never leak a previous ghost, whatever state we were left in.
    removeGhost();
    clearHover();
    dragUnit        = unit;
    dragFromCell    = fromCell;
    pointerDragging = true;
    activePointerId = pointerId;
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
    activePointerId = null;

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
    activePointerId = null;
    dragUnit        = null;
    dragFromCell    = null;
    root.querySelectorAll('.battle-cell--dragging').forEach(c => c.classList.remove('battle-cell--dragging'));
    const track = root.querySelector('#portrait-track');
    if (track) track.classList.remove('portrait-track--drop-target');
  }

  function isDragPointer(e) {
    return pointerDragging && (activePointerId === null || e.pointerId === activePointerId);
  }

  document.addEventListener('pointermove', e => {
    if (!isDragPointer(e)) return;
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
    if (!isDragPointer(e)) return;
    finishPointerDrag(e.clientX, e.clientY);
  });

  document.addEventListener('pointercancel', e => {
    if (isDragPointer(e)) cancelPointerDrag();
  });

  // Safety net: if the element holding pointer capture is removed from the DOM
  // mid-drag, some mobile browsers stop delivering pointermove/pointerup to it
  // and no pointercancel arrives either — the drag would hang with its ghost on
  // screen. lostpointercapture still fires, so tear the drag down there.
  document.addEventListener('lostpointercapture', e => {
    if (isDragPointer(e)) cancelPointerDrag();
  });

  const playerGrid = root.querySelector('#player-grid');

  function attachGridDragEvents() {
    playerGrid.querySelectorAll('.battle-cell--placed').forEach(cell => {
      cell.addEventListener('pointerdown', e => {
        if (e.target.closest('[data-remove]')) return;
        if (!e.isPrimary || pointerDragging) return;
        e.preventDefault();
        const anchor = Number(cell.dataset.i);
        const occ    = occupied[anchor];
        if (!occ) return;
        const unit = roster.find(u => u.id === occ.unitId);
        if (!unit) return;
        cell.setPointerCapture(e.pointerId);
        startPointerDrag(unit, anchor, e.clientX, e.clientY, e.pointerId);
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

    const itemBtn = abilityBtn.closest('[data-item-inspect]');
    if (itemBtn) {
      // Either an owned row (player unit) or a blueprint key (enemy unit).
      const item = itemBtn.dataset.itemKey
        ? itemFromDefKey(itemBtn.dataset.itemKey)
        : equippedItemFor(itemBtn.dataset.rosterId);
      if (!item) return;
      const parts = buildItemModalParts(item, player);
      openModal(parts.title, parts.body, parts.badges);
      return;
    }

    const key  = abilityBtn.dataset.abilityKey;
    const type = abilityBtn.dataset.abilityType;
    const def  = resolveAbility(key);
    if (!def) return;
    const parts = buildAbilityModalParts(def, type);
    openModal(parts.title, parts.body, parts.badges);
  });

  function attachPortraitEvents() {
    root.querySelectorAll('.portrait-card').forEach(card => {
      const u = roster.find(r => String(r.id) === String(card.dataset.id));
      if (!u) return;

      if (card.classList.contains('portrait-card--locked')) return;

      card.addEventListener('pointerdown', e => {
        if (!e.isPrimary || pointerDragging) return;
        e.preventDefault();
        card.setPointerCapture(e.pointerId);
        startPointerDrag(u, null, e.clientX, e.clientY, e.pointerId);
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
      const inventory = await resourceCache.get(player.chat_id);
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
            <div class="confirm-modal-text">${BP_TEXT.moreFollowers[L]}</div>
            <div class="confirm-modal-actions">
              <button class="confirm-modal-btn confirm-modal-btn--cancel">${BP_TEXT.goBack[L]}</button>
              <button class="confirm-modal-btn confirm-modal-btn--confirm">${BP_TEXT.continueOn[L]}</button>
            </div>
          </div>`;
        overlay.querySelector('.confirm-modal-btn--cancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
        overlay.querySelector('.confirm-modal-btn--confirm').addEventListener('click', () => { overlay.remove(); resolve(true); });
        document.body.appendChild(overlay);
      });
      if (!confirmed) return;
    }

    // The button is art (see .battle-prep-enter-btn) - never write textContent
    // to it, that would replace the image with a string. Disable it instead.
    const btn = root.querySelector('#ready-btn');
    btn.disabled = true;
    btn.classList.remove('battle-prep-enter-btn--ready');

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
      navigate('battle', { player, battle_id, region_id, level, snapshot: result.state, selectedSpells, logs: result.logs || [] });
    } catch (err) {
      console.error('Failed to create battle:', err);
      // The server refuses a second battle while one is still open. Reaching
      // here means the embark guard was bypassed (hand-dismissed modal, direct
      // navigation), so send the player back to embark, which puts the
      // reconnect-or-abandon choice in front of them.
      if (/already in progress/i.test(err.message || '')) {
        navigate('embark', { player });
        return;
      }
      btn.disabled = false;
      btn.classList.add('battle-prep-enter-btn--ready');
    }
  });

  (async () => {
    try {
      // /bootstrap carries roster AND items; the resource bar refresh that runs
      // on navigation shares the same in-flight request, so this screen adds no
      // extra round-trips of its own.
      const boot = await bootstrapCache.get(player.chat_id);
      const rosterData = boot.roster || [];

      items = boot.items || [];

      roster = rosterData
        .map((u, i) => ({ ...u, id: u.id != null ? u.id : String(i) }))
        .sort((a, b) => (b.is_hero === true) - (a.is_hero === true));

      const heroUnit = roster.find(u => u.is_hero === true);
      heroId     = heroUnit?.id ?? null;
      maxNonHero = getLoyalty(heroUnit);

      enemies = getEncounter(region_id, level);

      const enemySpellIndicator = root.querySelector('#enemy-spell-indicator');
      if (enemySpellIndicator) {
        const hasEnemySpell = !!getEncounterSpellId(region_id, level);
        enemySpellIndicator.style.display = hasEnemySpell ? '' : 'none';
      }

      await Promise.all([loadResources(), loadLearnedSpells()]);

      // Open on a tab the player actually has something in, so the sheet never
      // greets them with an empty list.
      const factionSpellsAll = SPELLS[player.faction] || [];
      const firstCategory = COMBAT_CATEGORIES
        .map(c => c.id)
        .find(id => factionSpellsAll.some(s => s.category === id && learnedSpells.includes(s.id)));
      if (firstCategory) {
        activeSpellCategory = firstCategory;
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