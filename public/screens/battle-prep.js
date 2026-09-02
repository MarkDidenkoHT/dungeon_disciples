import { assetUrl } from '../asset_base.js';
import { api, navigate, resourceCache, refreshResourceBar, bootstrapCache }  from '../api.js';
import { errandRosterIds } from '../errands.js';
import { SPELLS, SPELL_CATEGORIES } from '../../data/spells.js';

// The Spell Tome's tabs minus non-combat, which is roster-only and has nothing
// castable in a battle.
const COMBAT_CATEGORIES = SPELL_CATEGORIES.filter(c => c.id !== 'non_combat');
import { getEncounter } from '../../data/embark.js';
import { UNIT_ABILITIES }  from '../../data/unit_abilities.js';
import { derivePrefPosition, isPositionSatisfied, pickPositionBark } from '../../data/position_barks.js';
import { initBattleFx, reattachBattleFx } from '../battle-fx.js';
import { createQueueController } from '../pvp-queue.js';
import { syncFormationSynergies } from '../formation-synergy-view.js';
import { resolveSynergies } from '../../data/formation_synergies.js';

// The ability/item inspect handler has to be on `document`, because these icons
// also appear inside the body-level modal sheet, which is outside the screen
// root. That makes it outlive this screen twice over: it kept firing on OTHER
// screens' ability icons (in the castle it re-opened the MAIN sheet, wiping the
// building slider's content), and a new copy was added on every render. Holding
// it in a module ref lets each render replace the previous one, and the screen
// check below stops it acting once battle prep is gone.
let abilityInspectHandler = null;
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';
import { lang } from './settings.js';
import {
  RESIST_ICONS, RESIST_ORDER,
  cap, dmgReduction, CRYSTAL_ICONS,
  resolveUnitDef, resolveAbility, buildStatDescription,
  renderModalContent, openSheet, closeSheet, getSheetBody, openSubSheet, closeSubSheet,
  playPageTurnSound, buildUnitCard,
  renderItemSlotIcon, buildItemModalParts, buildAbilityModalParts, calcUnitPower,
  itemFromDefKey, combatantItem,
  spellName, spellDesc, withEquippedItem, unitName, cellFootprint,
} from '../utils.js';

const BP_TEXT = {
  undo:        { en: 'Undo',   ru: 'Отменить' },
  use:         { en: 'Use',    ru: 'Применить' },
  cancel:      { en: 'Cancel', ru: 'Отмена' },
  // No longer "hidden" — an enemy caster banks power in the open, on its own
  // strip, and its spells are named in the log when they land.
  hiddenSpell: { en: 'This group has an enemy that casts spells',
                 ru: 'В этой группе есть враг, применяющий заклинания' },
  goBack:      { en: 'Go Back', ru: 'Назад' },
  continueOn:  { en: 'Continue', ru: 'Продолжить' },
  undoFirst:   { en: 'Undo active spell first', ru: 'Сначала отмените активное заклинание' },
  moreFollowers: {
    en: 'You can take more followers into battle. Continue without them?',
    ru: 'Вы можете взять в бой больше спутников. Продолжить без них?',
  },
  // Shown when the placed army is meaningfully weaker than what it is walking
  // into. The numbers are the same ⚔ totals already on screen, repeated here so
  // the warning is checkable rather than just ominous.
  weakerArmy: {
    en: (mine, theirs) => `Your army is weaker than theirs — ⚔ ${mine} against ⚔ ${theirs}. You may want to look for a different battle.`,
    ru: (mine, theirs) => `Ваше войско слабее — ⚔ ${mine} против ⚔ ${theirs}. Возможно, стоит поискать другой бой.`,
  },
  yourPower:    { en: 'Your Power',   ru: 'Ваша сила' },
  enemyPower:   { en: 'Enemy Power',  ru: 'Сила врага' },
  spellsTitle:  { en: 'Spells',       ru: 'Заклинания' },
  chooseTarget: { en: 'Choose Target', ru: 'Выберите цель' },
  dead:         { en: 'Dead / unavailable', ru: 'Мёртв / недоступен' },
  hero:         { en: '★ Hero',       ru: '★ Герой' },
  enemy:        { en: 'Enemy',        ru: 'Враг' },
  toBattle:     { en: 'To Battle',    ru: 'В бой' },
  enterQueue:   { en: 'Enter Queue',  ru: 'В очередь' },
  searching:    { en: 'Searching for an opponent', ru: 'Ищем соперника' },
  searchingHint:{ en: 'Leave this screen open — you will be matched with the next player who queues.',
                  ru: 'Не закрывайте экран — вас соединят со следующим игроком в очереди.' },
  leaveQueue:   { en: 'Leave Queue',  ru: 'Выйти из очереди' },
  matchFound:   { en: 'Match found',  ru: 'Соперник найден' },
  // Placeholder for as long as a pairing produces no battle. The queue itself
  // is real from here on — this is the only part still missing.
  matchSoon:    {
    en: 'You have been paired with an opponent. The duel itself is the next piece of work.',
    ru: 'Вам подобран соперник. Сам бой — следующий этап работы.',
  },
  queueEnded:   { en: 'The queue ended before a match was found. Try again.',
                  ru: 'Очередь завершилась без подбора соперника. Попробуйте снова.' },
  queueFailed:  { en: 'Could not join the queue.', ru: 'Не удалось встать в очередь.' },
  opponentPower:{ en: 'Opponent',     ru: 'Противник' },
  close:        { en: 'Close',        ru: 'Закрыть' },
  scrollLeft:   { en: 'Scroll left',  ru: 'Прокрутить влево' },
  scrollRight:  { en: 'Scroll right', ru: 'Прокрутить вправо' },
  // Target scopes. The two tag_* forms interpolate a tag name that comes from
  // the data files in English, so the Russian keeps it as-is rather than
  // pretending to decline a word it does not have a translation for.
  scopes: {
    all_allies:   { en: 'All allies',   ru: 'Все союзники' },
    all_enemies:  { en: 'All enemies',  ru: 'Все враги' },
    single_ally:  { en: 'Single ally',  ru: 'Один союзник' },
    single_enemy: { en: 'Single enemy', ru: 'Один враг' },
  },
  tagAllies:  { en: tag => `All allied ${tag}s`, ru: tag => `Все союзные: ${tag}` },
  tagEnemies: { en: tag => `All enemy ${tag}s`,  ru: tag => `Все враги: ${tag}` },
};

// How far below the enemy's power the player's army may be before the warning
// fires. Below 10% the two sides read as an even match and a prompt every time
// would be noise.
const WEAK_ARMY_RATIO = 0.9;

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
  return `${assetUrl(`/assets/character_portraits/${prefix}_${portraitId}.png`)}`;
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
  const def = resolveUnitDef(unit);
  return (def ? unitName(def) : '') || unit.unit_data?.unit_id || '?';
}

function getLoyalty(heroUnit) {
  if (!heroUnit) return 2;
  const def = resolveUnitDef(heroUnit);
  const tier = def?.t ?? 1;
  return tier >= 4 ? 5 : tier + 1;
}

export function renderBattlePrep(root, { player, region_id, level, mode = null }) {
  const L = lang(player);

  // Quick match arrives here from the arena page of embark with no region and no
  // level: the same screen, the same formation rules, but the other grid stays
  // fogged because the opponent is not chosen yet — matchmaking picks it once
  // the player queues. Every region-only step below is gated on this.
  const isPvp = String(mode || '').startsWith('pvp');

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
          <span class="prep-side-label">${BP_TEXT.yourPower[L]}</span>
          <span class="prep-side-stats">
            <span id="loyalty-counter" class="loyalty-counter"></span>
            <span id="player-army-power" class="army-power"></span>
          </span>
        </div>

        <button id="ready-btn" class="battle-prep-enter-btn${isPvp ? ' battle-prep-enter-btn--queue' : ''}"
                disabled aria-label="${isPvp ? BP_TEXT.enterQueue[L] : BP_TEXT.toBattle[L]}">
          ${isPvp
            ? `<span class="battle-prep-queue-label">${BP_TEXT.enterQueue[L]}</span>`
            : `<img src="${assetUrl(`/assets/icons/ui/to_battle.png`)}" alt="${BP_TEXT.toBattle[L]}"
                    onerror="this.replaceWith(document.createTextNode('⚔'))">`}
        </button>

        <div class="prep-side prep-side--enemy">
          <span class="prep-side-label">${isPvp ? BP_TEXT.opponentPower[L] : BP_TEXT.enemyPower[L]}</span>
          <span class="prep-side-stats">
            <span class="enemy-spell-indicator" id="enemy-spell-indicator" title="${BP_TEXT.hiddenSpell[L]}" style="display:none;">📖</span>
            <span id="enemy-army-power" class="army-power"></span>
          </span>
        </div>
      </div>

      <div class="battle-prep-tab-content active" id="tab-formation">
        <div class="prep-track-row">
          <button class="prep-track-arrow" id="track-prev" data-track-scroll="-1" aria-label="${BP_TEXT.scrollLeft[L]}" hidden>‹</button>
          <div class="prep-track-wrap" id="prep-track-wrap">
            <div class="portrait-track" id="portrait-track"></div>
          </div>
          <button class="prep-track-arrow" id="track-next" data-track-scroll="1" aria-label="${BP_TEXT.scrollRight[L]}" hidden>›</button>
        </div>
      </div>

    </div>

    <div id="pvp-queue-overlay" class="pvp-queue-overlay hidden">
      <div class="pvp-queue-panel">
        <div class="pvp-queue-spinner" aria-hidden="true"></div>
        <div class="pvp-queue-title" id="pvp-queue-title">${BP_TEXT.searching[L]}</div>
        <div class="pvp-queue-timer" id="pvp-queue-timer">0:00</div>
        <div class="pvp-queue-hint" id="pvp-queue-hint">${BP_TEXT.searchingHint[L]}</div>
        <button class="pvp-queue-cancel" id="pvp-queue-cancel">${BP_TEXT.leaveQueue[L]}</button>
      </div>
    </div>

    <div id="spell-sheet-overlay" class="spell-sheet-overlay hidden">
      <div class="spell-sheet" id="spell-sheet">
        <div class="spell-sheet-handle"></div>
        <div class="spell-sheet-header">
          <span class="spell-sheet-title">${BP_TEXT.spellsTitle[L]}</span>
          <button class="spell-sheet-close" id="spell-sheet-close" aria-label="${BP_TEXT.close[L]}">✕</button>
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
          <span class="spell-sheet-title" id="spell-target-title">${BP_TEXT.chooseTarget[L]}</span>
          <button class="spell-sheet-close" id="spell-target-close" aria-label="${BP_TEXT.close[L]}">✕</button>
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

  // Inspecting an ability or an item opens a SUB-sheet, not the main one.
  // Both used to go through openSheet, and there is only one main sheet — so
  // tapping an ability on a unit card replaced the card with the ability, and
  // closing the ability left nothing behind. The unit you were reading about
  // was gone. This is the arrangement the castle already uses for the same
  // pair of screens (see openAbilityModal in screens/castle.js).
  function openInspectModal(title, bodyHtml, badgesHtml = '') {
    openSubSheet(title, bodyHtml, badgesHtml);
  }

  const spellSheetOverlay  = root.querySelector('#spell-sheet-overlay');
  const spellSheetBody     = root.querySelector('#spell-sheet-body');
  const spellSheetTierTabs = root.querySelector('#spell-sheet-tier-tabs');

  const targetOverlay   = root.querySelector('#spell-target-overlay');
  const targetBody      = root.querySelector('#spell-target-body');
  const targetTitle     = root.querySelector('#spell-target-title');

  // Guards the one-time research prompt so checkReady (which runs often) can't
  // re-trigger it.
  let spellResearchPrompted = false;

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

  // No spell picking before the battle any more. Spells are cast IN the fight,
  // by the hero, out of power earned during it — so there is nothing to choose
  // here, and the nav button keeps its normal meaning (open the Spell Tome)
  // instead of being hijacked into a one-shot pre-battle picker.
  //
  // The sheet markup and openSpellSheet() below are left in place: the tome
  // still uses the same styling, and removing them is a separate cleanup.


  function restoreNavLabels() {
    const s = document.querySelector('.nav-btn[data-screen="spells"]');
    if (s) {
      const sLabel = s.querySelector('.nav-btn-label');
      if (sLabel) sLabel.textContent = BP_NAV_LABELS.spells[L];
      s.title = BP_NAV_LABELS.spells[L];
      s.setAttribute('aria-label', BP_NAV_LABELS.spells[L]);
      if (s._battlePrepHandler) { s.removeEventListener('click', s._battlePrepHandler, true); delete s._battlePrepHandler; }
    }
  }



  function updateSpellsBadge() {
    const text = selectedSpells.length > 0
      ? `${BP_NAV_LABELS.castSpell[L]} (${selectedSpells.length})`
      : BP_NAV_LABELS.castSpell[L];
    const btn = document.querySelector('.nav-btn[data-screen="spells"]');
    if (!btn) return;
    // With the labels off, the count lives on the button's title instead of
    // vanishing entirely.
    const label = btn.querySelector('.nav-btn-label');
    if (label) label.textContent = text;
    btn.title = text;
    btn.setAttribute('aria-label', text);
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

    // Armor, initiative, power, resistances, granted tags and the item's own
    // passive all live on the item, not the blueprint — folding it in here is
    // what makes this card agree with the one the castle and battle show.
    const withItem = withEquippedItem(def, equippedItem);
    const liveUnit = { ...withItem, hp: `${currentHp}/${maxHp}`, xp: stored.current_xp ?? 0 };
    const badge    = isHero ? BP_TEXT.hero[L] : sizeLabel(getUnitSize(unit));
    const deadHtml = alive ? '' : `<div class="battle-prep-dead-label">${BP_TEXT.dead[L]}</div>`;
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
    return buildUnitCard(withEquippedItem(e, enemyItem), { badge: BP_TEXT.enemy[L], itemSlotHtml });
  }

  function spellTargetLabel(spell) {
    const scope = spell.target_scope || 'unknown';
    if (BP_TEXT.scopes[scope]) return BP_TEXT.scopes[scope][L];
    if (scope === 'tag_allies' && spell.params?.tag) return BP_TEXT.tagAllies[L](spell.params.tag);
    if (scope === 'tag_enemies' && spell.params?.tag) return BP_TEXT.tagEnemies[L](spell.params.tag);
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
          <div class="spell-list-icon"><img src="${assetUrl(`/assets/icons/spells/${spell.id}.png`)}" class="spell-icon-img" alt="${spellName(spell, player)}" onerror="this.style.display='none'"></div>
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

  // ── Remembered formation ──────────────────────────────────────────────────
  // Stored per DEVICE in localStorage rather than on the player row: it is a
  // convenience, not game state, and it must not cost a write on every battle.
  // Keyed by chat_id so two accounts on one phone do not inherit each other's.
  const FORMATION_KEY = `formation:${player.chat_id}`;

  function rememberFormationEnabled() {
    return player?.settings?.remember_formation === true;
  }

  // { roster_id: anchor_cell }, anchors only — the footprint is re-derived from
  // the unit's own size on restore, so a unit that changed size still lands
  // legally instead of occupying cells it no longer covers.
  function saveFormation() {
    if (!rememberFormationEnabled()) return;
    const anchors = {};
    for (const [cellIdx, occ] of Object.entries(occupied)) {
      if (occ.anchor === Number(cellIdx)) anchors[occ.unitId] = Number(cellIdx);
    }
    try { localStorage.setItem(FORMATION_KEY, JSON.stringify(anchors)); } catch {}
  }

  // Best effort, and deliberately silent about what it could not do. Every
  // placement goes through placeUnit, so loyalty, footprint overlap and grid
  // bounds are all still enforced — a saved formation can never produce an
  // illegal board, it just produces a smaller one.
  //
  // Reasons a unit may not come back: it died, it is out on an errand (already
  // filtered from `roster`), it was dismissed, it grew to a size that no longer
  // fits, or the hero's loyalty dropped. The hero is placed FIRST so it always
  // gets its cell even if loyalty has since shrunk.
  function restoreFormation() {
    if (!rememberFormationEnabled()) return;
    let anchors;
    try { anchors = JSON.parse(localStorage.getItem(FORMATION_KEY) || 'null'); } catch { return; }
    if (!anchors || typeof anchors !== 'object') return;

    const byId = new Map(roster.map(u => [String(u.id), u]));
    const entries = Object.entries(anchors)
      .filter(([id]) => byId.has(String(id)))
      .sort((a, b) => (String(b[0]) === String(heroId)) - (String(a[0]) === String(heroId)));

    for (const [id, anchor] of entries) {
      const unit = byId.get(String(id));
      if (!unit || unit.unit_data?.alive === false) continue;
      if (!Number.isInteger(anchor)) continue;
      placeUnit(unit, anchor);
    }
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

  // Each unit gets to object ONCE per prep session. Without this it speaks on
  // every offending placement, including the intermediate drops of a shuffle,
  // which turns a helpful nudge into nagging. Cleared only when the screen is
  // rebuilt, so the hint still returns on the next battle.
  const positionBarkSpoken = new Set();

  // unitId -> the acknowledgement owed to that unit, i.e. the `ok` line paired
  // with the exact complaint it made (position_barks.js keeps them index-matched).
  // Only a unit that actually objected is owed one: a unit dropped straight into
  // the right cell says nothing rather than congratulating the player for it.
  const positionOkOwed = new Map();

  // A unit whose footprint does not include its preferred column objects. Large
  // 2-wide units span both columns and so never object — see position_barks.js.
  function queuePositionBark(unit, cells, anchor) {
    if (player?.settings?.barks_enabled === false) return;
    const def     = resolveUnitDef(unit);
    const prefers = derivePrefPosition(def);
    if (!prefers) return;
    const cols = cells.map(cellCol);
    const id   = String(unit.id);

    // Correctly placed: pay off the acknowledgement if one is owed. Deleted as
    // it is spoken, so shuffling a unit in and out of the right column cannot
    // farm the same line twice.
    if (isPositionSatisfied(prefers, cols)) {
      const owed = positionOkOwed.get(id);
      if (!owed) return;
      positionOkOwed.delete(id);
      pendingPositionBark = { anchor, text: owed, ok: true };
      return;
    }

    if (positionBarkSpoken.has(id)) return;
    const bark = pickPositionBark(def, prefers);
    if (!bark) return;
    const text = L === 'en' ? bark.text : bark.text_ru;
    if (!text) return;
    positionBarkSpoken.add(id);
    const okText = L === 'en' ? bark.ok : bark.ok_ru;
    if (okText) positionOkOwed.set(id, okText);
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
    const { anchor, text, ok } = pendingPositionBark;
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
    // The acknowledgement is tinted differently: the player needs to read at a
    // glance that the unit is now content, not complaining again.
    toast.className = `bark-toast prep-bark-toast${ok ? ' prep-bark-toast--ok' : ''}`;
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

  // What the formation-synergy resolver needs to see, built from the placement
  // map. Kept as an adapter rather than handing `occupied` over directly, so the
  // resolver never learns this screen's data model — the battle engine feeds the
  // same function from combatants, and they must agree.
  //
  // One entry per PLACED unit, not per occupied cell: a 1x2 unit is one unit
  // standing on two cells, and adjacency has to be judged on the whole
  // footprint.
  function synergyUnits() {
    const byUnit = new Map();
    for (const [cell, occ] of Object.entries(occupied)) {
      if (!occ) continue;
      if (!byUnit.has(occ.unitId)) byUnit.set(occ.unitId, { anchor: occ.anchor, cells: [] });
      byUnit.get(occ.unitId).cells.push(Number(cell));
    }
    const out = [];
    for (const [unitId, { anchor, cells }] of byUnit) {
      const unit = roster.find(u => u.id === unitId);
      const base = unit ? resolveUnitDef(unit) : null;
      if (!base) continue;
      // Through the worn item, because a tag or a passive an item grants counts
      // for bonds exactly like a native one. The engine builds this same profile
      // from `unit_data`, which is already base + item, so reading the raw
      // definition here made the preview disagree with the fight it previews.
      const def = withEquippedItem(base, equippedItemFor(unitId));
      // `passive` (not `native_passive`) for the same reason: it is the merged
      // list, and the merged list is what the engine matches on.
      const passives = def.passive;
      const abilityKeys = [
        def.ability,
        ...(Array.isArray(passives) ? passives : [passives]),
      ].filter(Boolean);
      out.push({
        id: unitId, side: 'player', anchor, cells,
        tags: def.tags ?? [], abilityKeys,
        type: def.type ?? unit.unit_data?.type, unitId: def.id,
      });
    }
    return out;
  }

  // The enemy formation, in the same shape. Enemies are already shown openly on
  // their grid — only the EMPTY cells are fogged — so previewing their bonds
  // reveals nothing that is not on screen anyway.
  //
  // Indexed rather than keyed by `e.id`, which is a unit DEFINITION id: two of
  // the same creature in one encounter would otherwise collapse into one unit
  // and bond with themselves.
  function enemySynergyUnits() {
    return (enemies || []).map((e, i) => {
      const passives = Array.isArray(e.passive) ? e.passive : (e.passive ? [e.passive] : []);
      return {
        id: `enemy_${i}`, side: 'enemy',
        anchor: e.cell, cells: cellFootprint(e.cell, e.size, ROWS, COLS),
        tags: e.tags ?? [],
        abilityKeys: [e.ability, ...passives].filter(Boolean),
        type: e.type, unitId: e.id,
      };
    });
  }

  // How much initiative each unit is being handed right now, so the badge can
  // show a live number while the player is still arranging.
  //
  // The value scales with Casters ON THE FIELD, so it moves as more are placed —
  // which is the point of showing it here rather than a bare icon. Summed,
  // because a unit sandwiched between two Inspiration allies gets both.
  function inspirationBuffs(units) {
    const out = new Map();
    // Cached per tag, since several bonds in one pass can scale off the same one.
    const tagCounts = new Map();
    const countTag = tag => {
      if (!tagCounts.has(tag)) tagCounts.set(tag, units.filter(u => (u.tags ?? []).includes(tag)).length);
      return tagCounts.get(tag);
    };

    for (const bond of resolveSynergies(units)) {
      const buff = bond.def.buff;
      if (!buff) continue;                    // a bond that leaves no icon behind
      const source = units.find(u => u.id === bond.sourceId);
      // The rank the unit actually carries, so 'inspiration_damage 2' is read as
      // rank 2 rather than being matched loosely to the rank-1 params.
      const key    = (source?.abilityKeys ?? []).find(k => String(k).replace(/\s+\d+$/, '') === bond.defId);
      const params = UNIT_ABILITIES[key]?.params ?? {};
      // `valueParam` names the per-tag parameter to read, so a bond does not have
      // to use Inspiration's parameter names to get a live badge.
      const perTag = params[buff.valueParam ?? 'inspiration_value_per_tag'];
      const value  = perTag != null
        ? perTag * countTag(params.tag_required)
        : (params.inspiration_value ?? 0);
      if (value <= 0) continue;

      // A bond that pays its SOURCE badges the source. The partner is a
      // condition, not a recipient — Chorus of War's Caster gives nothing away.
      const holderId = bond.def.buffs === 'source' ? bond.sourceId : bond.partnerId;
      const forUnit = out.get(holderId) ?? new Map();
      // Keyed by ICON, not by bond: two ranks of the same Inspiration reaching
      // one unit are one badge with the total, matching how battle sums them on
      // the combatant.
      forUnit.set(buff.icon, {
        icon: buff.icon,
        suffix: buff.suffix ?? '',
        value: (forUnit.get(buff.icon)?.value ?? 0) + value,
      });
      out.set(holderId, forUnit);
    }
    return out;
  }

  // The same markup battle uses for its buff column (see stateIconsHtml in
  // screens/battle.js), so a buffed unit looks identical on both screens without
  // prep growing a status system of its own. One entry per stat: a unit reached
  // by a captain who inspires both damage and max HP shows two, stacked, the way
  // the battle column stacks them.
  function inspirationBadgeHtml(buffs) {
    if (!buffs || !buffs.size) return '';
    const icons = [...buffs.values()].map(b => `
      <span class="bc-state">
        <img class="bc-state-img" src="${assetUrl(`/assets/icons/abilities/${b.icon}`)}" alt="" onerror="this.style.display='none'">
        <span class="bc-state-num">${b.value}${b.suffix}</span>
      </span>`).join('');
    return `<div class="bc-buff-icons">${icons}</div>`;
  }

  function renderPlayerGrid() {
    const grid = root.querySelector('#player-grid');
    const inspBuffs = inspirationBuffs(synergyUnits());
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
        const inspBadge = inspirationBadgeHtml(inspBuffs.get(occ.unitId));
        return `<div class="battle-cell battle-cell--placed ${isHero ? 'battle-cell--hero' : ''} ${isAlive ? '' : 'battle-cell--dead'}"
                     data-i="${i}" style="grid-row:span ${rowSpan};grid-column:span ${colSpan};">
          ${portraitUrl ? `<img class="battle-cell-portrait" src="${portraitUrl}" alt="${name}" onerror="this.style.display='none'">` : ''}
          <div class="battle-cell-info">
            <span class="battle-cell-name">${name}</span>
            <span class="battle-cell-sub">${isAlive ? `${currentHp}/${maxHp}` : 'Dead'}</span>
          </div>
          ${spellDot}
          ${inspBadge}
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
      const total = playerArmyPower();
      playerPowerEl.textContent = total > 0 ? `⚔ ${total}` : '';
    }
  }

  // The ⚔ totals. Pulled out of the two render functions because the pre-battle
  // strength warning has to compare exactly the numbers the player is looking
  // at — computing it a second way would eventually disagree with the display.
  function playerArmyPower() {
    const placed = Object.values(occupied).filter(o => o && o.anchor !== undefined);
    return placed.reduce((sum, occ) => {
      const u = roster.find(r => r.id === occ.unitId);
      if (!u) return sum;
      const def = resolveUnitDef(u) || {};
      // Army power must count the worn item's stats too.
      const withItem = withEquippedItem(
        { ...def, hp: u.unit_data?.max_hp ?? def.hp }, equippedItemFor(u.id));
      return sum + calcUnitPower(withItem);
    }, 0);
  }

  function enemyArmyPower() {
    return enemies.reduce((sum, e) => sum + calcUnitPower(e), 0);
  }

  function renderEnemyGrid() {
    const grid = root.querySelector('#enemy-grid');

    // Every cell a unit covers maps back to that unit, and `_anchor` marks the
    // one cell that actually draws the tile. The old version reserved only the
    // second cell of a `row` and nothing at all for a `column`, so on a level
    // holding both (Glittering Abyss 3) the column's lower cell was emitted as
    // a fog tile — seven tiles in a six-cell grid — and a row anchored in
    // column 1 reserved the cell BELOW it, erasing whoever stood there.
    const unitAtCell = {};
    for (const e of enemies) {
      const cells = cellFootprint(e.cell, e.size, ROWS, COLS);
      cells.forEach((cell, n) => { unitAtCell[cell] = { unit: e, _anchor: n === 0 }; });
    }

    const enemyUnits = enemySynergyUnits();
    const enemyInsp  = inspirationBuffs(enemyUnits);
    grid.innerHTML = Array.from({ length: ROWS * COLS }, (_, i) => {
      const slot = unitAtCell[i];
      if (!slot) return `<div class="battle-cell battle-cell--fog">???</div>`;
      if (!slot._anchor) return '';
      const e = slot.unit;
      const eInsp = inspirationBadgeHtml(enemyInsp.get(`enemy_${enemies.indexOf(e)}`));
      const colSpan = e.size === 'row' ? 2 : 1;
      const rowSpan = e.size === 'column' ? 2 : 1;
      return `<div class="battle-cell battle-cell--enemy" data-i="${i}" style="grid-column:span ${colSpan};grid-row:span ${rowSpan};">
        <img class="battle-cell-portrait" src="${assetUrl(`/assets/character_portraits/p_${e.id}.png`)}" alt="${e.name}" onerror="this.style.display='none'">
        <div class="battle-cell-info">
          <span class="battle-cell-name">${e.name}</span>
          <span class="battle-cell-sub">❤ ${e.hp}</span>
        </div>
        ${eInsp}
      </div>`;
    }).join('');

    const enemyPowerEl = root.querySelector('#enemy-army-power');
    if (enemyPowerEl) {
      const total = enemyArmyPower();
      enemyPowerEl.textContent = total > 0 ? `⚔ ${total}` : '';
    }

    grid.querySelectorAll('.battle-cell--enemy').forEach(cell => {
      cell.addEventListener('click', () => {
        const slot = unitAtCell[Number(cell.dataset.i)];
        if (slot) showDetail(slot.unit.name, enemyDetailHtml(slot.unit));
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
      // `name` survives as the portrait's alt text and tooltip; the card itself
      // no longer prints it, nor the size — both were repeating what the
      // portrait and the frame already say.
      const name       = getUnitName(u);
      const portraitUrl = getPortraitUrl(u);
      return `
        <div class="portrait-card
                    ${isHero     ? 'portrait-card--hero'     : ''}
                    ${isSelected ? 'portrait-card--selected' : ''}
                    ${locked     ? 'portrait-card--locked'   : ''}"
             data-id="${u.id}" title="${name}">
          ${portraitUrl ? `<img class="portrait-art-img" src="${portraitUrl}" alt="${name}" onerror="this.style.display='none'">` : `<div class="portrait-art">${isHero ? '★' : unitTypeIcon(u)}</div>`}
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
      // Next onboarding beat: point at the spellbook. It used to say "cast your
      // buff before the fight", which no longer exists — spells are researched
      // there and cast in battle — so the step now explains that split.
      if (!isTutorialDone(player, 'spell_research') && !spellResearchPrompted) {
        spellResearchPrompted = true;
        const navBtn = document.querySelector('.nav-btn[data-screen="spells"]');
        if (navBtn) {
          showTutorialSpotlight(player, 'spell_research', navBtn, {
            showContinue: true,
            onAdvance: () => markTutorialDone(player, 'spell_research'),
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

  // Swiping the track is handled in resolveSliderGesture; these arrows remain
  // for players who never try the gesture. They hide themselves when everything
  // fits or when the track is already at that end.
  function updateTrackArrows() {
    const wrap = root.querySelector('#prep-track-wrap');
    const prev = root.querySelector('#track-prev');
    const next = root.querySelector('#track-next');
    if (!wrap || !prev || !next) return;
    const overflow = wrap.scrollWidth - wrap.clientWidth;
    if (overflow <= 1) { prev.hidden = true; next.hidden = true; return; }
    prev.hidden = wrap.scrollLeft <= 1;
    next.hidden = wrap.scrollLeft >= overflow - 1;
  }

  function attachTrackArrows() {
    const wrap = root.querySelector('#prep-track-wrap');
    if (!wrap || wrap.dataset.arrowsBound) return;
    wrap.dataset.arrowsBound = '1';
    root.querySelectorAll('[data-track-scroll]').forEach(btn => {
      btn.addEventListener('click', () => {
        // One card plus its gap, so a tap advances by a whole portrait.
        const card = wrap.querySelector('.portrait-card');
        const step = (card ? card.offsetWidth + 7 : 69) * Number(btn.dataset.trackScroll);
        wrap.scrollBy({ left: step, behavior: 'smooth' });
      });
    });
    wrap.addEventListener('scroll', updateTrackArrows, { passive: true });
  }

  function fullRefresh() {
    renderPlayerGrid();
    // After the grid, because the bonds anchor on cell elements that the render
    // above has just replaced. Reattached first for the same reason the battle
    // screen does it on every render: the canvas sizes itself to the arena, and
    // the arena's height changes as the grid and the portrait track fill in — a
    // canvas measured before that is a canvas nothing can be drawn on.
    reattachBattleFx(root);
    syncFormationSynergies(synergyUnits());
    // The enemy grid is its own scope: its cells repeat the same `data-i` values
    // as the player's, so the two must never share selectors.
    syncFormationSynergies(enemySynergyUnits(), 'enemy-grid');
    renderPortraitTrack();
    attachPortraitEvents();
    attachGridDragEvents();
    updateLoyaltyHint();
    checkReady();
    flushPositionBark();
    attachTrackArrows();
    updateTrackArrows();
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

  // Swipe-to-scroll on the portrait track. The cards must keep touch-action:
  // none (see attachPortraitEvents), so the browser can never pan the strip on
  // its own — we own the pointer, and resolve the gesture ourselves: a mostly
  // horizontal move that started on a card and stays in the tray scrolls the
  // track instead of dragging the unit onto the grid.
  const SLIDER_THRESHOLD = 8;
  let dragStartX      = 0;
  let dragStartY      = 0;
  let sliderScrolling = false;   // gesture resolved as a track swipe
  let sliderResolved  = false;   // gesture resolved either way — stop testing
  let sliderStartLeft = 0;
  let suppressCardClick = false; // a swipe must not also select a portrait
  // A swipe leaves the selection exactly as the player left it, so the drag
  // that turned out to be a scroll is rolled back to these.
  let prevDragUnit     = null;
  let prevDragFromCell = null;

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
    // Any stale suppression is spent by now: the click it guarded against would
    // have fired before this next press.
    suppressCardClick = false;
    prevDragUnit     = dragUnit;
    prevDragFromCell = dragFromCell;
    dragUnit        = unit;
    dragFromCell    = fromCell;
    pointerDragging = true;
    activePointerId = pointerId;
    dragStartX      = clientX;
    dragStartY      = clientY;
    sliderScrolling = false;
    // Only a drag that begins in the tray can turn into a swipe; dragging a
    // placed unit off the grid keeps its old meaning.
    sliderResolved  = fromCell !== null;
    sliderStartLeft = root.querySelector('#prep-track-wrap')?.scrollLeft ?? 0;
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
    sliderScrolling = false;
    sliderResolved  = true;

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
    sliderScrolling = false;
    sliderResolved  = true;
    dragUnit        = null;
    dragFromCell    = null;
    root.querySelectorAll('.battle-cell--dragging').forEach(c => c.classList.remove('battle-cell--dragging'));
    const track = root.querySelector('#portrait-track');
    if (track) track.classList.remove('portrait-track--drop-target');
  }

  function isDragPointer(e) {
    return pointerDragging && (activePointerId === null || e.pointerId === activePointerId);
  }

  function scrollTrackBy(clientX) {
    const wrap = root.querySelector('#prep-track-wrap');
    if (wrap) wrap.scrollLeft = sliderStartLeft - (clientX - dragStartX);
  }

  // Returns true once the gesture has been claimed as a track swipe.
  function resolveSliderGesture(e) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    // Pulling the card upward (toward the grid) is a placement drag — decide
    // that way as soon as the vertical move wins, and stop testing.
    if (Math.abs(dy) >= SLIDER_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
      sliderResolved = true;
      return false;
    }
    if (Math.abs(dx) < SLIDER_THRESHOLD) return false;

    const wrap = root.querySelector('#prep-track-wrap');
    if (!wrap || wrap.scrollWidth - wrap.clientWidth <= 1) { sliderResolved = true; return false; }

    sliderResolved  = true;
    sliderScrolling = true;
    sliderStartLeft = wrap.scrollLeft;
    dragStartX      = e.clientX;
    removeGhost();
    clearHover();
    root.querySelector('#portrait-track')?.classList.remove('portrait-track--drop-target');
    return true;
  }


  document.addEventListener('pointermove', e => {
    if (!isDragPointer(e)) return;
    e.preventDefault();

    if (sliderScrolling) { scrollTrackBy(e.clientX); return; }
    if (!sliderResolved && resolveSliderGesture(e)) return;

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
    if (sliderScrolling) {
      suppressCardClick = true;
      cancelPointerDrag();
      dragUnit     = prevDragUnit;
      dragFromCell = prevDragFromCell;
      updateTrackArrows();
      return;
    }
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
        const name = unitName(def) || unit.unit_data?.unit_id || 'Unit';
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

  if (abilityInspectHandler) document.removeEventListener('click', abilityInspectHandler);
  abilityInspectHandler = e => {
    // Battle prep may no longer be the screen on show — see the module ref above.
    if (!document.querySelector('.screen-battle-prep')) return;
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
      openInspectModal(parts.title, parts.body, parts.badges);
      return;
    }

    const key  = abilityBtn.dataset.abilityKey;
    const type = abilityBtn.dataset.abilityType;
    const def  = resolveAbility(key);
    if (!def) return;
    const parts = buildAbilityModalParts(def, type);
    openInspectModal(parts.title, parts.body, parts.badges);
  };
  document.addEventListener('click', abilityInspectHandler);

  function attachPortraitEvents() {
    root.querySelectorAll('.portrait-card').forEach(card => {
      const u = roster.find(r => String(r.id) === String(card.dataset.id));
      if (!u) return;

      if (card.classList.contains('portrait-card--locked')) return;

      // Grabs the pointer immediately, and the card keeps touch-action: none.
      // Letting the browser resolve the direction instead is broken on iOS:
      // Safari fires pointercancel as soon as touch-action permits a pan in
      // that axis, which lands before the threshold resolves and kills the drag
      // outright. So we own the pointer and split the gesture ourselves in
      // resolveSliderGesture — sideways scrolls the track, upward drags the
      // unit to the grid. The arrows stay as a non-gestural fallback.
      card.addEventListener('pointerdown', e => {
        if (!e.isPrimary || pointerDragging) return;
        e.preventDefault();
        card.setPointerCapture(e.pointerId);
        startPointerDrag(u, null, e.clientX, e.clientY, e.pointerId);
      });

      card.addEventListener('click', e => {
        if (pointerDragging) return;
        // The click that closes a swipe lands on whichever card ended up under
        // the finger — it is scrolling, not a pick.
        if (suppressCardClick) { suppressCardClick = false; return; }
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

  // Off the player row, which /login already carries and the tome keeps current
  // — this used to be a GET on every entry to the prep screen for a list the
  // client was holding the whole time. Async only because its caller awaits it.
  async function loadLearnedSpells() {
    learnedSpells = Array.isArray(player.learned_spells) ? player.learned_spells : [];
  }

  // Go-or-go-back prompt on the way into a battle. Resolves true to continue.
  function askBeforeBattle(text, { confirmOnly = false } = {}) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.innerHTML = `
        <div class="confirm-modal">
          <div class="confirm-modal-text">${text}</div>
          <div class="confirm-modal-actions">
            ${confirmOnly ? '' : `<button class="confirm-modal-btn confirm-modal-btn--cancel">${BP_TEXT.goBack[L]}</button>`}
            <button class="confirm-modal-btn confirm-modal-btn--confirm">${confirmOnly ? BP_TEXT.close[L] : BP_TEXT.continueOn[L]}</button>
          </div>
        </div>`;
      overlay.querySelector('.confirm-modal-btn--cancel')?.addEventListener('click', () => { overlay.remove(); resolve(false); });
      overlay.querySelector('.confirm-modal-btn--confirm').addEventListener('click', () => { overlay.remove(); resolve(true); });
      document.body.appendChild(overlay);
    });
  }

  // ── Quick match queue ────────────────────────────────────────────────────
  // The formation is committed the moment the player queues, exactly as it would
  // be committed to a region fight: what they arranged is what they will fight
  // with, and they are not asked for it again once an opponent is found.
  let queueController = null;
  let queueTimer      = null;

  function queueEl(id) { return root.querySelector(id); }

  function showQueueOverlay(startedAt) {
    const overlay = queueEl('#pvp-queue-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.classList.remove('pvp-queue-overlay--matched');
    queueEl('#pvp-queue-title').textContent = BP_TEXT.searching[L];
    queueEl('#pvp-queue-hint').textContent  = BP_TEXT.searchingHint[L];
    queueEl('#pvp-queue-cancel').textContent = BP_TEXT.leaveQueue[L];

    clearInterval(queueTimer);
    const tick = () => {
      const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      const el = queueEl('#pvp-queue-timer');
      if (el) el.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    };
    tick();
    queueTimer = setInterval(tick, 1000);
  }

  function hideQueueOverlay() {
    clearInterval(queueTimer);
    queueTimer = null;
    queueEl('#pvp-queue-overlay')?.classList.add('hidden');
    const btn = root.querySelector('#ready-btn');
    if (btn) { btn.disabled = false; btn.classList.add('battle-prep-enter-btn--ready'); }
  }

  // Matched, with no duel to enter yet. The overlay stops counting and says so
  // rather than closing — a player who queued deserves to see that it worked.
  function showQueueMatched() {
    clearInterval(queueTimer);
    queueTimer = null;
    const overlay = queueEl('#pvp-queue-overlay');
    if (!overlay) return;
    overlay.classList.add('pvp-queue-overlay--matched');
    queueEl('#pvp-queue-title').textContent = BP_TEXT.matchFound[L];
    queueEl('#pvp-queue-hint').textContent  = BP_TEXT.matchSoon[L];
    queueEl('#pvp-queue-cancel').textContent = BP_TEXT.close[L];
  }

  function stopQueue({ cancel = false } = {}) {
    const c = queueController;
    queueController = null;
    if (!c) return;
    if (cancel) c.cancel(); else c.stop();
  }

  root.querySelector('#pvp-queue-cancel')?.addEventListener('click', () => {
    stopQueue({ cancel: true });
    hideQueueOverlay();
  });

  // Navigating away, closing the app, or a reload: the entry must not outlive
  // the screen that made it, or this player is matched into a duel nobody is
  // watching for.
  window.addEventListener('pagehide', () => stopQueue({ cancel: true }), { once: true });

  async function enterQueue() {
    const playerUnitIds = roster
      .filter(u => placedUnitIds().has(u.id))
      .map(u => ({ id: String(u.id), _rosterId: String(u.id) }));

    const placement = {};
    for (const [cellIdx, occ] of Object.entries(occupied)) {
      if (occ.anchor === Number(cellIdx)) placement[occ.unitId] = Number(cellIdx);
    }

    saveFormation();

    const btn = root.querySelector('#ready-btn');
    if (btn) { btn.disabled = true; btn.classList.remove('battle-prep-enter-btn--ready'); }
    showQueueOverlay(Date.now());

    queueController = createQueueController({
      playerId: player.chat_id,
      mode:     mode || 'pvp_quick',
      onMatched: () => { queueController = null; showQueueMatched(); },
      onEnded:   () => {
        queueController = null;
        hideQueueOverlay();
        askBeforeBattle(BP_TEXT.queueEnded[L], { confirmOnly: true });
      },
      onError: err => console.error('Queue error:', err),
    });

    try {
      await queueController.start({ playerUnitIds, placement }, playerArmyPower());
    } catch (err) {
      console.error('Failed to join queue:', err);
      stopQueue();
      hideQueueOverlay();
      // A battle already open is the one refusal worth explaining — it is the
      // same guard region battles hit, and it sends the player to the same place.
      if (err.code === 'battle_in_progress' || /already in progress/i.test(err.message || '')) {
        let activeCheck = null;
        try { activeCheck = await api(`/battle/active?chat_id=${player.chat_id}`); }
        catch (e) { console.error('Failed to check active battle:', e); }
        navigate('embark', { player, activeCheck });
        return;
      }
      await askBeforeBattle(BP_TEXT.queueFailed[L], { confirmOnly: true });
    }
  }

  root.querySelector('#ready-btn').addEventListener('click', async () => {
    if (!placedUnitIds().has(heroId)) return;

    if (isPvp) { await enterQueue(); return; }

    const loyaltyUsed = placedLoyaltyUsed();
    const loyaltyLeft = maxNonHero - loyaltyUsed;
    const hasUnplacedFollowers = roster.some(u => {
      if (u.id === heroId) return false;
      if (placedUnitIds().has(u.id)) return false;
      const cost = u.unit_data?.loyalty_cost ?? 1;
      return cost <= loyaltyLeft;
    });

    if (hasUnplacedFollowers && !await askBeforeBattle(BP_TEXT.moreFollowers[L])) return;

    // Strength check, after the followers prompt: a player who just chose to
    // leave units at home should be told what that costs them, and one who is
    // outmatched even with everyone placed still needs to hear it. Both are
    // warnings, not blocks — a deliberate underdog run is allowed.
    const myPower    = playerArmyPower();
    const theirPower = enemyArmyPower();
    if (theirPower > 0 && myPower < theirPower * WEAK_ARMY_RATIO) {
      if (!await askBeforeBattle(BP_TEXT.weakerArmy[L](myPower, theirPower))) return;
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

    // Saved at COMMIT, not on every drag: "last formation" means the one the
    // player actually fought with, not whatever half-arrangement they abandoned.
    saveFormation();

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
      // Code, not prose — see the same change in screens/battle.js. The regex
      // stays as a deploy-window fallback only.
      if (err.code === 'battle_in_progress' || /already in progress/i.test(err.message || '')) {
        // Fetch the battle we are being refused for and hand it to embark, which
        // puts reconnect-or-abandon in front of the player. Embark no longer
        // looks it up itself — this is the one path that needs it, so this is
        // the one place that pays for the request.
        let activeCheck = null;
        try { activeCheck = await api(`/battle/active?chat_id=${player.chat_id}`); }
        catch (e) { console.error('Failed to check active battle:', e); }
        navigate('embark', { player, activeCheck });
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

      // A unit away on an errand is not in the castle to be fielded. That IS
      // the cost of an errand — it cannot fail, so the absence is the whole
      // trade. Filtered rather than shown-and-disabled: a formation slot it can
      // never fill today is just a puzzle piece that does not exist.
      const awayIds = await errandRosterIds(player.chat_id);
      roster = rosterData
        .filter(u => !awayIds.has(String(u.id)))
        .map((u, i) => ({ ...u, id: u.id != null ? u.id : String(i) }))
        .sort((a, b) => (b.is_hero === true) - (a.is_hero === true));

      const heroUnit = roster.find(u => u.is_hero === true);
      heroId     = heroUnit?.id ?? null;
      maxNonHero = getLoyalty(heroUnit);

      // After heroId and maxNonHero, because placeUnit needs both to enforce
      // loyalty and to know which unit is exempt from it.
      restoreFormation();

      // No encounter to load in quick match — the opposing formation belongs to
      // another player and does not exist until the queue pairs them.
      enemies = isPvp ? [] : getEncounter(region_id, level);

      // Was driven by the encounter's own hidden spell, which no longer exists.
      // The warning is still worth giving, so it now reads the enemies THEMSELVES
      // — a boss carrying `spells` is a caster, and that is what the player needs
      // to know before committing a formation.
      const enemySpellIndicator = root.querySelector('#enemy-spell-indicator');
      if (enemySpellIndicator) {
        const hasCaster = (enemies || []).some(e => Array.isArray(e?.spells) && e.spells.length > 0);
        enemySpellIndicator.style.display = hasCaster ? '' : 'none';
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
      // The FX canvas goes up once the arena exists and has a size. Bonds
      // restored from a saved formation flare on arrival, which is the correct
      // read: as far as the player is concerned they have just been formed.
      initBattleFx(root);
      // A frame later, so the arena has been laid out and the canvas can size
      // itself to something real.
      requestAnimationFrame(() => {
        reattachBattleFx(root);
        syncFormationSynergies(synergyUnits());
        syncFormationSynergies(enemySynergyUnits(), 'enemy-grid');
      });
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