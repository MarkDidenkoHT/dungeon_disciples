import { api }              from '../api.js';
import { navigate }         from '../api.js';
import { refreshResourceBar } from '../api.js';
import { bootstrapCache } from '../api.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';
import { SPELLS }           from '../../data/spells.js';
import { UNIT_ABILITIES }   from '../../data/unit_abilities.js';
import { getEquipBlock }    from '../../data/item_rules.js';
import { ITEM_DEFS, meetsCraftRequirements, craftRequirementText } from '../../data/items.js';
import { REGIONS, getRegionsForMaterial } from '../../data/embark.js';
import {
  RESIST_ICONS, RESIST_ORDER,
  cap, dmgReduction,
  resolveUnitDef, resolveAbility, buildStatDescription,
  renderModalContent, openSheet, closeSheet, onSheetClose, openSubSheet, closeSubSheet, getSubSheetBody, getSheetBody, applyBackground,
  renderUnitPortrait, renderUnitCoreStatsColumn, renderUnitResistColumn, renderUnitAbilitiesRow,
  renderItemSlotIcon, withEquippedItem, buildAbilityModalParts,
  getActionLabel, itemName, itemRarity, handleUnitInspect, CRYSTAL_ICONS, GOLD_ICON,
} from '../utils.js';

// Every button, tab and chip on this screen, in both languages. The roster had
// no localisation at all — it was the largest screen still hardcoded to English
// while the sheet chrome around it was translated.
const RT = {
  items:        { en: 'Items',            ru: 'Предметы' },
  equip:        { en: 'Equip',            ru: 'Надеть' },
  equipping:    { en: 'Equipping…',       ru: 'Надеваем…' },
  unequip:      { en: 'Unequip',          ru: 'Снять' },
  unequipping:  { en: 'Unequipping…',     ru: 'Снимаем…' },
  craft:        { en: 'Craft',            ru: 'Создать' },
  crafting:     { en: 'Crafting…',        ru: 'Создаём…' },
  levelUp:      { en: 'Level Up',         ru: 'Повысить' },
  choosePath:   { en: 'Choose an upgrade path', ru: 'Выберите путь развития' },
  choosePathHint: {
    en: 'Your building supports more than one path. Pick the one to advance along.',
    ru: 'Ваше здание поддерживает несколько путей. Выберите, по какому развиваться.',
  },
  resurrect:    { en: 'Resurrect',        ru: 'Воскресить' },
  resurrecting: { en: 'Resurrecting…',    ru: 'Воскрешаем…' },
  heal:         { en: 'Heal',             ru: 'Лечить' },
  healing:      { en: 'Healing…',         ru: 'Лечим…' },
  // Divine favor (rewarded ad). The button carries the faction's own name for
  // it (see FAVOR_LABELS), but always alongside an "Ad" marker — disguising an
  // ad as a plain game action is the pattern that gets stores upset.
  adBadge:      { en: 'Ad',               ru: 'Реклама' },
  favorLeft:    { en: n => `${n} left today`,        ru: n => `Осталось сегодня: ${n}` },
  favorNoneUI:  { en: 'No favors left today',        ru: 'Сегодня милостей больше нет' },
  favorWatching:{ en: 'Your prayer is heard…',       ru: 'Молитва услышана…' },
  favorCancel:  { en: 'Cancel',           ru: 'Отмена' },
  favorFailed:  { en: 'The favor was not granted.',  ru: 'Милость не была дарована.' },
  // Keyed by the `code` the favor endpoints send, so the player never sees the
  // server's English developer strings. Anything unmapped falls back to
  // favorFailed rather than leaking the raw message.
  favorErrors: {
    favor_cap:        { en: 'No favors left today. Come back tomorrow.', ru: 'На сегодня милостей больше нет. Возвращайтесь завтра.' },
    favor_not_needed: { en: 'This unit needs no favor.',                 ru: 'Этому бойцу милость не нужна.' },
    favor_none:       { en: 'No favor in progress.',                     ru: 'Нет активной молитвы.' },
    favor_expired:    { en: 'The moment passed — try again.',            ru: 'Момент упущен — попробуйте снова.' },
    favor_early:      { en: 'The ad has not finished.',                  ru: 'Реклама ещё не досмотрена.' },
    favor_no_unit:    { en: 'Unit not found.',                           ru: 'Боец не найден.' },
  },
  favorPlaceholder: { en: 'Advertisement placeholder', ru: 'Место для рекламы' },
  embark:       { en: 'Embark',           ru: 'В поход' },
  // tabs + filters
  tabEquippable:{ en: 'Equippable',       ru: 'Подходящие' },
  tabOwned:     { en: 'Owned',            ru: 'В наличии' },
  tabCraft:     { en: 'Craft',            ru: 'Создание' },
  any:          { en: 'Any',              ru: 'Любая' },
  common:       { en: 'Common',           ru: 'Обычные' },
  rare:         { en: 'Rare',             ru: 'Редкие' },
  epic:         { en: 'Epic',             ru: 'Эпические' },
  mythic:       { en: 'Mythic',           ru: 'Мифические' },
  all:          { en: 'All',              ru: 'Все' },
  hp:           { en: 'HP',               ru: 'HP' },
  armor:        { en: 'Armor',            ru: 'Броня' },
  init:         { en: 'Init',             ru: 'Иниц.' },
  power:        { en: 'Power',            ru: 'Сила' },
  resist:       { en: 'Resist',           ru: 'Сопр.' },
  passive:      { en: 'Passive',          ru: 'Пассивка' },
  grantsTag:    { en: 'Grants Tag',       ru: 'Даёт метку' },
  needsTag:     { en: 'Needs Tag',        ru: 'Нужна метка' },
  craftableNow: { en: 'Craftable now',    ru: 'Можно создать' },
  // Dropdown labels. The rarity and stat filters are <select>s now, so their
  // options have room for full words — no abbreviations needed in either
  // language, and the three chip rows collapse to one.
  filterRarity: { en: 'Rarity',           ru: 'Редкость' },
  filterStat:   { en: 'Stat',             ru: 'Фильтр' },
  groupStats:   { en: 'Stats',            ru: 'Характеристики' },
  groupTraits:  { en: 'Traits',           ru: 'Свойства' },
  // Singular forms, for the rarity label on one card (the chips above are the
  // plural "the common ones" / "the rare ones").
  rarity_common: { en: 'Common', ru: 'Обычный' },
  rarity_rare:   { en: 'Rare',   ru: 'Редкий' },
  rarity_epic:   { en: 'Epic',   ru: 'Эпический' },
  rarity_mythic: { en: 'Mythic', ru: 'Мифический' },
  // states / messages
  noMaterials:  { en: 'No materials',     ru: 'Без материалов' },
  nothingMatches:{ en: 'Nothing matches these filters.', ru: 'Ничего не найдено по фильтрам.' },
  unique:       { en: 'Unique',           ru: 'Уникальный' },
  owned:        { en: 'Owned',            ru: 'В наличии' },
  wrongFaction: { en: 'Wrong faction',    ru: 'Не та фракция' },
  notEnough:    { en: 'Not enough resources', ru: 'Недостаточно ресурсов' },
  uniqueOwned:  { en: 'Unique — already owned', ru: 'Уникальный — уже есть' },
  equippedElse: { en: 'Equipped on another unit', ru: 'Надет на другом бойце' },
  maxLevel:     { en: 'Maximum Level Reached', ru: 'Максимальный уровень' },
  cannotUpgrade:{ en: 'Cannot Upgrade',   ru: 'Улучшение недоступно' },
  failEquip:    { en: 'Equip failed',     ru: 'Не удалось надеть' },
  failUnequip:  { en: 'Unequip failed',   ru: 'Не удалось снять' },
  failCraft:    { en: 'Craft failed',     ru: 'Не удалось создать' },
  failLevel:    { en: 'Level up failed',  ru: 'Не удалось повысить' },
  failRes:      { en: 'Resurrection failed', ru: 'Не удалось воскресить' },
  failHeal:     { en: 'Heal failed',      ru: 'Не удалось вылечить' },
};

// Each faction petitions its own god. The mechanic is identical — only the name
// changes — so this is presentation, not behaviour.
const FAVOR_LABELS = {
  // Dative case in RU — the prayer is addressed TO the god. Hard stem, so the
  // ending is -у: Митраил → Митраилу, Агграил → Агграилу. Асталот is FEMININE
  // and does not decline at all — «Плач Асталот», never «Асталоту».
  empire:              { en: 'Devotion to Mithrail', ru: 'Молитва Митраилу' },
  choir_of_the_cursed: { en: 'Song to Aggrail',      ru: 'Песнь Агграилу' },
  grail_of_sorrow:     { en: 'Dirge to Astaloth',    ru: 'Плач Асталот' },
};
const FAVOR_FALLBACK = { en: 'Ask for a favor', ru: 'Просить о милости' };

export function renderRoster(root, { player }) {
  const L = player?.settings?.language === 'ru' ? 'ru' : 'en';
  const T = key => RT[key][L];
  applyBackground(root, player.faction, 'roster');

  root.innerHTML = `
    <div class="screen screen-roster">
      <main class="roster-main">
        <div class="roster-slider-wrap">
          <div class="roster-track" id="roster-track"></div>
        </div>

        <!-- At-a-glance strip: every unit's portrait + HP, so damaged and dead
             units are visible without paging. Clicking a portrait jumps the
             slider to that unit's card. -->
        <div class="prep-track-wrap roster-portrait-wrap">
          <div class="portrait-track" id="roster-portrait-track"></div>
        </div>
      </main>
    </div>
  `;

  let current = 0;
  let units   = [];

  // Paging is the portrait strip + swipe; there is no arrow/dot nav.
  const track = root.querySelector('#roster-track');

  let buildingsData = {};
  let upgradePaths  = {};
  let buildingPools = {};   // faction -> category -> [building defs]; maps a built building back to the unit it makes
  let mercBuildings = {};   // region -> [mercenary hall defs]; same job, separate table
  let items         = [];
  let resources     = [];
  let progress      = {};   // { region_id: next_playable_level } — gates the craft catalog
  // Divine favors left today. The server is the authority — this is only what
  // the button prints, and every claim is re-checked against the daily cap.
  let favorRemaining = 0;
  let favorSeconds   = 15;

  function equippedItemFor(rosterId) {
    return items.find(it => String(it.equipped_by) === String(rosterId)) || null;
  }

  function openModal(title, bodyHtml, badgesHtml = '') { openSheet(title, bodyHtml, badgesHtml); }

  // Mirrors resolveUpgradeBranch / upgradeReaches in data/buildings.js, which is
  // the server-side authority. Duplicated rather than imported because
  // data/buildings.js is CommonJS-only; the client sees the same tables through
  // /bootstrap (buildings.pools / buildings.upgrade_paths).
  function unitIdForBuilding(buildingId) {
    if (!buildingId) return null;
    for (const pools of Object.values(buildingPools)) {
      for (const list of Object.values(pools || {})) {
        const found = (list || []).find(b => b.id === buildingId);
        if (found) return found.unit_id || null;
      }
    }
    // Mirrors getBuildingDef's mercenary fallback on the server.
    for (const list of Object.values(mercBuildings)) {
      const found = (list || []).find(b => b.id === buildingId);
      if (found) return found.unit_id || null;
    }
    return null;
  }

  function upgradeReaches(fromUnitId, targetUnitId) {
    if (!fromUnitId || !targetUnitId) return false;
    const seen = new Set();
    const stack = [fromUnitId];
    while (stack.length) {
      const id = stack.pop();
      if (id === targetUnitId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const factionPaths of Object.values(upgradePaths)) {
        for (const p of factionPaths[id] || []) stack.push(p.unit_id);
      }
    }
    return false;
  }

  // A player can build the tier-3 barracks while the unit in it is still tier 1.
  // Matching only the immediate next building then reports "build X first" for a
  // building they have already paid for, so a branch that LEADS to what is built
  // counts too. The unit still advances one tier per level-up.
  // Every branch consistent with what is built. Two or more means the player
  // has a real choice (the hero trees merge), which is ASKED rather than
  // guessed — see openBranchChoice. Returning null for that case is what left
  // an overbuilt hero permanently unable to level.
  function branchCandidates(paths, buildingId) {
    if (!paths || !paths.length) return [];
    if (paths.length === 1) return [paths[0]];
    if (!buildingId) return [];
    const exact = paths.find(p => p.building_id === buildingId);
    if (exact) return [exact];
    const builtUnit = unitIdForBuilding(buildingId);
    if (!builtUnit) return [];
    return paths.filter(p => upgradeReaches(p.unit_id, builtUnit));
  }

  function resolveBranch(paths, buildingId) {
    const candidates = branchCandidates(paths, buildingId);
    return candidates.length === 1 ? candidates[0] : null;
  }

  // Asked when several branches fit the building that is standing there — the
  // kits differ (Protector vs Beacon of Hope), so this must not be guessed.
  function openBranchChoice(choices, onPick, onCancel) {
    const cards = choices.map(c => {
      const def  = unitDefById(c.unit_id);
      const name = def?.name ?? c.unit_id;
      return `
        <button class="branch-choice" data-unit-id="${c.unit_id}">
          <span class="branch-choice-name">${name}</span>
          <span class="branch-choice-sub">${c.label}</span>
        </button>`;
    }).join('');

    openSheet(T('choosePath'), `
      <p class="modal-empty" style="margin-bottom:10px">${T('choosePathHint')}</p>
      <div class="branch-choice-list">${cards}</div>`);

    let picked = false;
    getSheetBody().querySelectorAll('.branch-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        picked = true;
        const choice = choices.find(c => c.unit_id === btn.dataset.unitId);
        closeSheet();
        if (choice) onPick(choice);
      });
    });
    // Dismissed without choosing: put the level-up button back.
    onSheetClose(() => { if (!picked) onCancel?.(); });
  }

  function unitDefById(unitId) {
    return resolveUnitDef({ unit_data: { unit_id: unitId } });
  }

  function buildCard(u) {
    const stored   = u.unit_data || {};
    const def      = resolveUnitDef(u);
    const isHero   = u.is_hero === true;
    const unitId   = stored.unit_id || '';
    const unitName = def?.name ?? unitId;

    const tier      = def?.t ?? 1;
    const tierLabel = isHero ? `Hero Lv ${tier}` : `Lv ${tier}`;

    const currentXp  = stored.current_xp ?? 0;
    // HP is derived like every other item stat: the roster row holds the unit's
    // BASE max, the equipped item's bonus is applied on top for display.
    const baseMaxHp  = stored.max_hp != null ? stored.max_hp : (def?.hp ?? null);
    const derived    = withEquippedItem(
      { max_hp: baseMaxHp ?? 0, current_hp: stored.current_hp ?? baseMaxHp ?? 0 },
      equippedItemFor(u.id));
    const maxHp      = baseMaxHp == null ? '—' : derived.max_hp;
    const currentHp  = baseMaxHp == null ? '—' : derived.current_hp;
    const alive      = stored.alive !== false;
    const throneLevel = buildingsData['slot_0']?.level ?? 0;

    let heroPathsForUnit = [];
    if (isHero) {
      for (const factionPaths of Object.values(upgradePaths)) {
        if (factionPaths[unitId]) { heroPathsForUnit = factionPaths[unitId]; break; }
      }
    }

    const heroMaxed    = isHero && heroPathsForUnit.length === 0;
    const xpRequired   = def?.xp ?? null;
    const heroXpMet    = xpRequired == null || currentXp >= xpRequired;
    const heroCanLevel = isHero && !heroMaxed && throneLevel > tier && heroXpMet;

    // Max tier is "nothing to upgrade INTO", not "no xp value". Top-tier units
    // still carry an `xp` number, so keying off that offered a Level Up button
    // the server could only reject. Mercenaries make this visible: their tier-3
    // units have xp too.
    const unitPathExists = Object.values(upgradePaths).some(fp => fp[unitId]);
    const isMaxTier = !isHero && !unitPathExists;
    const hasPath   = !isHero && unitPathExists && xpRequired !== null;

    let upgradeReady        = true;
    let upgradeBuildingHint = '';
    if (hasPath) {
      let unitPaths = [];
      for (const factionPaths of Object.values(upgradePaths)) {
        if (factionPaths[unitId]) { unitPaths = factionPaths[unitId]; break; }
      }
      if (unitPaths.length > 1) {
        const slot           = stored.building_slot;
        const slotBuildingId = slot ? buildingsData[slot]?.building_id : null;
        // Ready when at least one branch fits. Several fitting is a question to
        // ask at press time, not a reason to withhold the button — that is what
        // stranded units whose slot was built past their tier.
        const candidates     = branchCandidates(unitPaths, slotBuildingId);
        upgradeReady         = candidates.length > 0;
        if (!upgradeReady) upgradeBuildingHint = `Requires: ${unitPaths.map(p => p.label).join(' or ')}`;
      }
    }

    // A hero levels through the throne, not a barracks, so hasPath (which is
    // !isHero by construction) never covers it — heroCanLevel does. This has to
    // be folded in HERE, because coreHtml is built a few lines below and it is
    // the Lv cell that becomes the level-up button. The hero branch further down
    // used to set canLevelUp AFTER coreHtml had already been rendered, so a hero
    // that was fully eligible never got a button.
    let canLevelUp = (hasPath && currentXp >= xpRequired && upgradeReady) || heroCanLevel;

    const equippedItem = equippedItemFor(u.id);

    const liveUnit = withEquippedItem({
      ...(def || {}),
      id:   unitId || def?.id,
      name: unitName,
      hp:   `${currentHp}/${maxHp}`,
      xp:   currentXp,
    }, equippedItem);

    const portraitHtml = renderUnitPortrait(liveUnit, { badge: alive ? '' : '💀 Dead' });
    const coreHtml      = renderUnitCoreStatsColumn(liveUnit, { canLevelUp: !!canLevelUp, rosterId: u.id });
    const resistsHtml   = renderUnitResistColumn(liveUnit);

    const resurrectionSpell = SPELLS[player.faction]?.find(s => s.usage === 'roster' && s.target_scope === 'single_ally');
    const resurrectionCost = resurrectionSpell
      ? Object.entries(resurrectionSpell.cost?.crystals || {})
          .filter(([, amt]) => amt > 0)
          .map(([type, amt]) => `${type.replace('Crystals_', '')} ${amt}`)
          .join(', ')
      : '';
    // Overlaid on the portrait rather than inserted into the card's flow: a row
    // that appears and disappears with the unit's state shifts everything below
    // it every time someone dies, is revived, or is healed.
    // Just the BUTTON here - all of these share one overlay (see actionOverlayHtml
    // below), which is what keeps the favor button stacked directly above the
    // spell button instead of the two being positioned independently.
    const resurrectButtonHtml = !alive && resurrectionSpell ? `
        <button class="resurrect-btn" data-roster-id="${u.id}" data-spell-id="${resurrectionSpell.id}">
          ${T('resurrect')} (${resurrectionCost})
        </button>
    ` : '';

    // Heal is an out-of-combat spell (roster only), usable on a living but
    // damaged unit — the counterpart to Resurrect for a fallen one.
    const healSpell = SPELLS[player.faction]?.find(s => s.effect_type === 'heal' && s.target_scope === 'single_ally');
    const healCost = healSpell
      ? Object.entries(healSpell.cost?.crystals || {})
          .filter(([, amt]) => amt > 0)
          .map(([type, amt]) => `${type.replace('Crystals_', '')} ${amt}`)
          .join(', ')
      : '';
    const isDamaged = alive && stored.current_hp != null && stored.max_hp != null && stored.current_hp < stored.max_hp;

    // Divine favor: the ad-funded alternative to the two spells above. Offered
    // whenever a unit is dead or hurt, INCLUDING when the player cannot afford
    // (or has not learned) the spell — that gap is the whole point of it.
    // Two compact lines so it stays inside the portrait: a long faction label
    // like 'Devotion to Mithrail' on one row overran onto the stat columns.
    const favorLabel = (FAVOR_LABELS[player.faction] || FAVOR_FALLBACK)[L];
    // Hidden for the whole of onboarding. The spell tutorial exists to teach
    // Resurrect and Heal on exactly the unit this button would fix in one tap —
    // offering the shortcut there teaches players to skip the mechanic being
    // taught, and puts an ad in front of someone who has not seen the game yet.
    // Gated on the persisted flag as well as the live one, so it stays hidden
    // between the screen mounting and the tutorial actually starting.
    const onboarding  = spellTutorialActive || !isTutorialDone(player, 'spell_heal');
    const favorNeeded = (!alive || isDamaged) && !onboarding;
    const favorButtonHtml = favorNeeded ? `
        <button class="favor-btn${favorRemaining <= 0 ? ' favor-btn--spent' : ''}"
                data-roster-id="${u.id}"
                ${favorRemaining <= 0 ? 'disabled' : ''}>
          <span class="favor-btn-top">
            <span class="favor-btn-ad">${T('adBadge')}</span>
            <span class="favor-btn-label">${favorLabel}</span>
          </span>
          <span class="favor-btn-left">${favorRemaining > 0 ? T('favorLeft')(favorRemaining) : T('favorNoneUI')}</span>
        </button>
    ` : '';

    const healButtonHtml = isDamaged && healSpell ? `
        <button class="heal-btn" data-roster-id="${u.id}" data-spell-id="${healSpell.id}">
          ${T('heal')} (${healCost})
        </button>
    ` : '';

    // ONE overlay holding favor + spell, stacked. Separately positioned overlays
    // could not express "favor sits directly above the heal button" without
    // hardcoding an offset that breaks the moment either button changes height.
    // A dead unit's button owns the middle of the card; a wounded one is still
    // playable, so its buttons sit low and out of the way.
    const actionOverlayHtml = (favorButtonHtml || resurrectButtonHtml || healButtonHtml) ? `
      <div class="unit-card-overlay unit-card-overlay--actions ${alive ? 'unit-card-overlay--heal' : ''}">
        ${favorButtonHtml}
        ${resurrectButtonHtml}
        ${healButtonHtml}
      </div>
    ` : '';

    let levelUpHtml = '';
    if (isHero) {
      if (heroMaxed) {
        levelUpHtml = `
          <div class="levelup-row">
            <span class="hero-level-label">Hero Level ${tier} — Max</span>
          </div>`;
      } else {
        const throneBlocked = throneLevel <= tier;
        const xpBlocked     = xpRequired != null && currentXp < xpRequired;
        const blocked       = throneBlocked || xpBlocked;

        let blockedMsg = '';
        if (throneBlocked)     blockedMsg = ` — Level Up Requires Throne Lv ${tier + 1}`;
        else if (xpBlocked)    blockedMsg = ` — Need ${xpRequired} XP`;

        const pct = xpRequired != null ? Math.min(100, Math.floor((currentXp / xpRequired) * 100)) : 100;


        levelUpHtml = `
          <div class="levelup-row">
            ${xpRequired != null ? `
              <div class="levelup-xp-bar">
                <div class="levelup-xp-fill" style="width:${pct}%"></div>
              </div>
              <span class="levelup-xp-label">${currentXp}/${xpRequired} XP</span>
            ` : ''}

          </div>`;
      }
    } else if (hasPath) {
      const pct = Math.min(100, Math.floor((currentXp / xpRequired) * 100));
      levelUpHtml = `
        <div class="levelup-row">
          <div class="levelup-xp-bar">
            <div class="levelup-xp-fill" style="width:${pct}%"></div>
          </div>
          <span class="levelup-xp-label">${currentXp}/${xpRequired} XP</span>

        </div>`;
    } else {
      levelUpHtml = `
        <div class="levelup-row">
          <span class="hero-level-label">${isMaxTier ? T('maxLevel') : T('cannotUpgrade')}</span>
        </div>`;
    }

    const itemSlotHtml  = renderItemSlotIcon(equippedItem, u.id, { player });
    const abilitiesHtml = renderUnitAbilitiesRow(liveUnit, { itemSlotHtml });

    return `
      <div class="roster-slide">
        <div class="unit-card ${alive ? '' : 'unit-card--dead'}">
          <div class="unit-main-row">
            ${coreHtml}
            <div class="unit-portrait-wrap">
              ${portraitHtml}
              ${actionOverlayHtml}
            </div>
            ${resistsHtml}
          </div>
          <div class="unit-info">
            ${levelUpHtml}
            ${abilitiesHtml}
          </div>
        </div>
      </div>`;
  }

  // Portrait path mirrors battle-prep's getPortraitUrl so the strip uses the
  // same art as the formation track.
  function portraitUrlFor(u) {
    const def    = resolveUnitDef(u);
    const unitId = def?.id;
    if (!unitId) return null;
    const portraitId = unitId.match(/^(h_[a-z]_\d)/)?.[1] ?? unitId;
    return `/assets/character_portraits/p_${portraitId}.png`;
  }

  // Current/max HP with the equipped item's bonus applied — same derivation as
  // the full card, so the strip never disagrees with it.
  function hpFor(u) {
    const stored    = u.unit_data || {};
    const def       = resolveUnitDef(u);
    const baseMaxHp = stored.max_hp != null ? stored.max_hp : (def?.hp ?? null);
    if (baseMaxHp == null) return null;
    const derived = withEquippedItem(
      { max_hp: baseMaxHp, current_hp: stored.current_hp ?? baseMaxHp },
      equippedItemFor(u.id));
    return { cur: derived.current_hp, max: derived.max_hp };
  }

  function renderPortraitStrip() {
    const strip = root.querySelector('#roster-portrait-track');
    if (!strip) return;

    strip.innerHTML = units.map((u, i) => {
      const def     = resolveUnitDef(u);
      const name    = def?.name ?? u.unit_data?.unit_id ?? '';
      const isHero  = u.is_hero === true;
      const alive   = u.unit_data?.alive !== false;
      const hp      = hpFor(u);
      const pct     = hp && hp.max > 0 ? Math.max(0, Math.min(100, Math.round((hp.cur / hp.max) * 100))) : 0;
      const damaged = alive && hp && hp.cur < hp.max;
      const url     = portraitUrlFor(u);

      const state = !alive ? 'dead' : (pct <= 33 ? 'critical' : (damaged ? 'damaged' : 'ok'));

      return `
        <div class="portrait-card portrait-card--roster
                    ${isHero  ? 'portrait-card--hero' : ''}
                    ${!alive  ? 'portrait-card--dead' : ''}
                    ${i === current ? 'portrait-card--selected' : ''}"
             data-i="${i}" data-roster-id="${u.id}" title="${name}">
          ${url
            ? `<img class="portrait-art-img" src="${url}" alt="${name}" onerror="this.style.display='none'">`
            : `<div class="portrait-art">${isHero ? '★' : '⚔'}</div>`}
          ${alive ? `
            <div class="portrait-hp-bar" title="${hp ? `${hp.cur}/${hp.max}` : ''}">
              <div class="portrait-hp-fill portrait-hp-fill--${state}" style="width:${pct}%"></div>
            </div>
          ` : `
            <div class="portrait-status portrait-status--dead">💀</div>
          `}
        </div>
      `;
    }).join('');
  }

  function updateStripSelection() {
    root.querySelectorAll('#roster-portrait-track .portrait-card').forEach(card => {
      card.classList.toggle('portrait-card--selected', Number(card.dataset.i) === current);
    });
  }

  function goTo(idx) {
    current = Math.max(0, Math.min(idx, units.length - 1));
    track.style.transform = `translateX(-${current * 100}%)`;
    updateStripSelection();

    const active = root.querySelector(`#roster-portrait-track .portrait-card[data-i="${current}"]`);
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }

  root.querySelector('#roster-portrait-track')?.addEventListener('click', e => {
    const card = e.target.closest('.portrait-card');
    if (!card) return;
    goTo(Number(card.dataset.i));
  });

  // Re-renders the cards + strip and keeps the player on the same UNIT, not the
  // same index — a refresh can reorder the roster (level-up returns unsorted
  // rows, resurrect changes nothing but a future sort might), so restoring by
  // index silently jumps to a different character.
  function rerenderKeeping(rosterId) {
    const idx = rosterId != null
      ? units.findIndex(u => String(u.id) === String(rosterId))
      : -1;
    initSlider();
    goTo(idx >= 0 ? idx : current);
  }

  function initSlider() {
    // Any spotlight still up is anchored to DOM we are about to destroy; the
    // caller re-shows the step it wants to keep (see the equip flow).
    hideTutorial();

    track.innerHTML = units.map(u => buildCard(u)).join('');
    renderPortraitStrip();

    let touchStartX = 0;
    let touchStartY = 0;
    let didSwipe    = false;

    track.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      didSwipe    = false;
    }, { passive: true });

    track.addEventListener('touchmove', e => {
      const dx = Math.abs(e.touches[0].clientX - touchStartX);
      const dy = Math.abs(e.touches[0].clientY - touchStartY);
      if (dx > dy && dx > 8) didSwipe = true;
    }, { passive: true });

    track.addEventListener('touchend', e => {
      if (!didSwipe) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) < 40) return;
      goTo(dx < 0 ? current + 1 : current - 1);
    }, { passive: true });

    goTo(0);
  }

  function openDetailModal(title, bodyHtml, badgesHtml = '') {
    openSubSheet(title, bodyHtml, badgesHtml);
  }

  track.addEventListener('click', async (e) => {
    const lockedLvlBtn = e.target.closest('.levelup-btn--locked');
    if (lockedLvlBtn) {
      const hint = lockedLvlBtn.dataset.hint;
      if (hint) {
        const existing = lockedLvlBtn.parentElement.querySelector('.levelup-popup');
        if (existing) { existing.remove(); return; }
        const popup = document.createElement('div');
        popup.className = 'levelup-popup';
        popup.textContent = hint;
        lockedLvlBtn.parentElement.appendChild(popup);
        const dismiss = () => { popup.remove(); document.removeEventListener('click', dismiss, true); };
        setTimeout(() => document.addEventListener('click', dismiss, true), 0);
        setTimeout(dismiss, 4000);
      }
      return;
    }

    const lvlBtn = e.target.closest('.levelup-btn--ready');
    if (lvlBtn) {
      const rosterId = lvlBtn.dataset.rosterId;
      lvlBtn.disabled    = true;
      lvlBtn.textContent = '…';
      const restoreBtn = () => {
        lvlBtn.disabled    = false;
        lvlBtn.textContent = T('levelUp');
      };
      const doLevelUp = async targetUnitId => {
        const body = { chat_id: player.chat_id, roster_id: rosterId };
        if (targetUnitId) body.target_unit_id = targetUnitId;
        await api('/roster/levelup', body);
        // One /bootstrap covers roster, structures, items and resources; this
        // used to be a /roster fetch plus a structures fetch plus a resource-bar
        // refresh. applyBootstrap also sorts hero-first, so the slider order
        // cannot drift.
        await reloadAndRerender(rosterId);
      };
      try {
        await doLevelUp(null);
      } catch (err) {
        // Several branches fit what is built (the hero trees merge), so the
        // server handed back the options instead of refusing. Ask, then retry
        // with the pick.
        const choices = err?.data?.choices;
        if (err?.code === 'upgrade_branch_choice' && Array.isArray(choices) && choices.length) {
          openBranchChoice(choices, async pick => {
            try {
              await doLevelUp(pick.unit_id);
            } catch (err2) {
              restoreBtn();
              alert(err2.message || T('failLevel'));
            }
          }, restoreBtn);
          return;
        }
        restoreBtn();
        alert(err.message || T('failLevel'));
      }
      return;
    }

    const resurrectBtn = e.target.closest('.resurrect-btn');
    if (resurrectBtn) {
      const rosterId = resurrectBtn.dataset.rosterId;
      const spellId  = resurrectBtn.dataset.spellId;
      resurrectBtn.disabled    = true;
      resurrectBtn.textContent = T('resurrecting');
      try {
        await api('/roster/resurrect', { chat_id: player.chat_id, roster_id: rosterId, spell_id: spellId });
        await reloadAndRerender(rosterId);
        // Onboarding: revive done → move on to the heal step.
        if (spellTutorialActive && !isTutorialDone(player, 'spell_revive')) {
          markTutorialDone(player, 'spell_revive');
          hideTutorial();
          showHealStep();
        }
      } catch (err) {
        alert(err.message || T('failRes'));
      }
      return;
    }

    const healBtn = e.target.closest('.heal-btn');
    if (healBtn) {
      const rosterId = healBtn.dataset.rosterId;
      const spellId  = healBtn.dataset.spellId;
      healBtn.disabled    = true;
      healBtn.textContent = T('healing');
      try {
        await api('/roster/heal', { chat_id: player.chat_id, roster_id: rosterId, spell_id: spellId });
        await reloadAndRerender(rosterId);
        // Onboarding: heal done → the spell tutorial is complete, on to embark.
        if (spellTutorialActive && !isTutorialDone(player, 'spell_heal')) {
          markTutorialDone(player, 'spell_heal');
          spellTutorialActive = false;
          hideTutorial();
          navigate('embark', { player });
        }
      } catch (err) {
        alert(err.message || T('failHeal'));
      }
      return;
    }

    const favorBtn = e.target.closest('.favor-btn');
    if (favorBtn && !favorBtn.disabled) {
      await runFavor(favorBtn.dataset.rosterId);
      return;
    }

    // Ability / armor / stat / resist inspection — shared with every other
    // screen that renders a unit card (see handleUnitInspect in utils.js).
    if (handleUnitInspect(e, openDetailModal)) return;

    const itemSlot = e.target.closest('[data-item-slot]');
    if (itemSlot) {
      const rosterId = itemSlot.dataset.rosterId;
      openItemModal(rosterId);
      return;
    }
  });

  // Icons rather than words, reusing the character card's own glyphs: 🛡 for
  // armor and the six RESIST_ICONS for resistances. HP / Power / Initiative have
  // no icon on the character card (they are text labels in the stat column), so
  // they get one here. The full wording stays on `title` for long-press.
  const STAT_ICONS = {
    hp:           { icon: '❤',  en: 'HP',         ru: 'HP' },
    armor:        { icon: '🛡',  en: 'Armor',      ru: 'Броня' },
    action_power: { icon: '⚔',  en: 'Power',      ru: 'Сила' },
    initiative:   { icon: '⚡', en: 'Initiative', ru: 'Инициатива' },
  };

  function statChip(key, val) {
    const sign = val >= 0 ? '+' : '';
    const cls  = val >= 0 ? 'stat-chip--pos' : 'stat-chip--neg';

    const resistMatch = key.match(/^(air|fire|nature|cold|life|death)_resist$/);
    if (resistMatch) {
      const r     = resistMatch[1];
      const icon  = RESIST_ICONS[r]?.icon ?? '◆';
      const label = `${cap(r)} ${L === 'ru' ? 'сопротивление' : 'Resist'}`;
      return `<span class="stat-chip ${cls}" title="${label} ${sign}${val}">
                <span class="stat-chip-icon">${icon}</span>${sign}${val}
              </span>`;
    }

    const meta = STAT_ICONS[key];
    const icon = meta?.icon ?? '◆';
    const label = meta ? meta[L] : cap(key);
    return `<span class="stat-chip ${cls}" title="${label} ${sign}${val}">
              <span class="stat-chip-icon">${icon}</span>${sign}${val}
            </span>`;
  }

  function formatStatMods(statMods) {
    const entries = Object.entries(statMods || {});
    if (!entries.length) return '';
    return entries.map(([key, val]) => statChip(key, val)).join('');
  }

  // The item's own passive, shown on the ITEM (it is no longer mixed into the
  // unit's passive icons) and tappable for the full description.
  function itemPassiveHtml(stats) {
    const key = stats?.passive;
    if (!key) return '';
    const def = resolveAbility(key);
    const label = def?.name || String(key).split(' ')[0].replace(/_/g, ' ');
    return `<button class="item-passive" data-ability-key="${key}" data-ability-type="passive">
              <span class="item-passive-icon">✦</span>${label}
            </button>`;
  }

  // `unitTags` is passed when the card is shown against a specific unit, so an
  // unmet requirement can be flagged on the chip itself rather than repeated as
  // a sentence under the button.
  function itemTagsHtml(stats, unitTags = null) {
    const ru = L === 'ru';
    const unmet = stats.tag_required && Array.isArray(unitTags) && !unitTags.includes(stats.tag_required);
    return [
      stats.tag_required ? `<span class="item-card-tag ${unmet ? 'item-card-tag--unmet' : ''}">${ru ? 'Требует' : 'Requires'}: ${stats.tag_required}</span>` : '',
      stats.adds_tag     ? `<span class="item-card-tag item-card-tag--adds">${ru ? 'Даёт метку' : 'Grants tag'}: ${stats.adds_tag}</span>` : '',
    ].join('');
  }

  // Left rail shared by both card modes: art, rarity, unique, then the count or
  // (for a single equipped copy) who is carrying it.
  function itemAsideHtml(stats, { iconId, name, rarity, unique, countLine }) {
    return `
      <div class="item-card-aside">
        <div class="item-card-icon">
          <img src="/assets/icons/items/${iconId}.png" alt="${name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <span class="item-card-icon-fallback" style="display:none;">⚙</span>
        </div>
        <div class="item-card-rarity item-card-rarity--${rarity}">${T('rarity_' + rarity)}</div>
        ${unique ? `<div class="item-card-unique">${T('unique')}</div>` : ''}
        ${countLine ? `<div class="item-card-count-line">${countLine}</div>` : ''}
      </div>`;
  }

  function buildItemCard(item, unit, unitTags, count = 1) {
    const stats        = item.item_stats || {};
    const iconId        = stats.icon || stats.key || 'item';
    const equippedHere  = String(item.equipped_by) === String(unit.id);
    const equippedElsewhere = item.equipped_by != null && !equippedHere;
    const factionOk     = !stats.faction || stats.faction === player.faction;
    const tagOk          = !stats.tag_required || unitTags.includes(stats.tag_required);
    // Incoherent pairings (a bleed-on-hit relic on a unit that only heals) are
    // refused with the reason spelled out — see data/item_rules.js.
    const block          = getEquipBlock(stats, resolveUnitDef(unit), UNIT_ABILITIES);
    const canEquip       = factionOk && tagOk && !block && !equippedHere;

    const ru = player?.settings?.language === 'ru';
    // Only reasons the card cannot state any other way. A missing tag is already
    // written on the "Requires: X" chip — which turns red when the unit lacks it
    // — so repeating it underneath the button said the same thing twice.
    let reason = '';
    if (!factionOk) reason = T('wrongFaction');
    else if (block) reason = ru ? block.reason_ru : block.reason;
    else if (equippedElsewhere) reason = T('equippedElse');

    // A stack says how many; a lone copy says who is carrying it, which is the
    // question you actually have when an item is missing from a unit.
    const holder = item.equipped_by != null
      ? units.find(u => String(u.id) === String(item.equipped_by))
      : null;
    const holderName = holder ? (resolveUnitDef(holder)?.name ?? '') : '';
    const countLine = count > 1
      ? `×${count}`
      : (holderName ? `${L === 'ru' ? 'у' : 'on'} ${holderName}` : '');

    return `
      <div class="item-card item-card--rarity-${itemRarity(item)} ${equippedHere ? 'item-card--equipped' : ''}">
        <div class="item-card-body">
          ${itemAsideHtml(stats, {
            iconId, name: itemName(item, player), rarity: itemRarity(item),
            unique: !!stats.unique, countLine,
          })}
          <div class="item-card-main">
            <div class="item-card-name">${itemName(item, player)}</div>
            <div class="item-card-stats">${formatStatMods(stats.stat_mods)}</div>
            ${itemPassiveHtml(stats)}
            <div class="item-card-tags">${itemTagsHtml(stats, unitTags)}</div>
          </div>
        </div>
        ${equippedHere
          ? `<button class="item-action-btn item-action-btn--unequip" data-item-id="${item.id}">${T('unequip')}</button>`
          : `<button class="item-action-btn item-action-btn--equip" data-item-id="${item.id}" data-roster-id="${unit.id}" ${canEquip ? '' : 'disabled'}>${T('equip')}</button>`}
        ${reason && !equippedHere ? `<div class="item-card-blocked">${reason}</div>` : ''}
      </div>`;
  }

  // Materials as tappable icons rather than a wall of text. Each chip carries
  // the material key so the sheet can open a "where does this drop" detail.
  function materialIcon(key) {
    if (key === 'Gold') return GOLD_ICON;
    if (CRYSTAL_ICONS[key]) return CRYSTAL_ICONS[key];
    // Trophies share the resource icon folder; items use the item folder.
    if (ITEM_DEFS[key]) {
      const iconId = ITEM_DEFS[key].icon || ITEM_DEFS[key].key;
      return `<img class="mat-chip-img" src="/assets/icons/items/${iconId}.png" alt="${key}" onerror="this.style.display='none'">`;
    }
    return `<img class="mat-chip-img" src="/assets/icons/recources/${key}.png" alt="${key}" onerror="this.style.display='none'">`;
  }

  function ownedAmount(key) {
    if (ITEM_DEFS[key]) {
      return items.filter(it => (it.item_stats?.key || it.item_stats?.icon) === key && !it.equipped_by).length;
    }
    return resources.find(r => r.item === key)?.amount ?? 0;
  }

  function materialName(key) {
    if (ITEM_DEFS[key]) return itemName(ITEM_DEFS[key], player);
    if (key === 'Gold') return 'Gold';
    if (key.startsWith('Crystals_')) return `${key.replace('Crystals_', '')} Crystals`;
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // One chip per material: icon + the amount REQUIRED, green when the player can
  // cover it and red when they cannot. The have/need pair was redundant — the
  // resource bar and trophy bar already show what is in the purse.
  // Grouped into three rows — currency, trophies, crafted ingredients — so a
  // long cost reads as three short lines of like things instead of one wrapping
  // jumble. Empty groups are omitted rather than left as blank rows.
  function costChips(cost = {}, itemCost = {}) {
    const entries = [...Object.entries(cost), ...Object.entries(itemCost)];
    if (!entries.length) return `<span class="mat-chip mat-chip--free">${T('noMaterials')}</span>`;

    const isCurrency = key => key === 'Gold' || key.startsWith('Crystals_');
    const isItem     = key => !!ITEM_DEFS[key];

    const chip = ([key, amount]) => {
      const enough = ownedAmount(key) >= amount;
      return `
        <button class="mat-chip ${enough ? 'mat-chip--ok' : 'mat-chip--short'}" data-material="${key}"
                title="${materialName(key)} — ${ownedAmount(key)}/${amount}">
          <span class="mat-chip-icon">${materialIcon(key)}</span>
          <span class="mat-chip-amt">${amount}</span>
        </button>`;
    };

    const groups = [
      entries.filter(([k]) => isCurrency(k)),                            // gold + crystals
      entries.filter(([k]) => !isCurrency(k) && !isItem(k)),             // trophies
      entries.filter(([k]) => !isCurrency(k) && isItem(k)),              // crafted parts
    ];

    return groups
      .filter(g => g.length)
      .map(g => `<div class="mat-row">${g.map(chip).join('')}</div>`)
      .join('');
  }

  function formatCost(cost = {}, itemCost = {}) {
    const resParts = Object.entries(cost).map(([resName, amount]) => {
      const have    = resources.find(r => r.item === resName)?.amount ?? 0;
      const shortage = have < amount;
      const label = resName.startsWith('Crystals_') ? resName.replace('Crystals_', '') + ' Crystals' : resName;
      return `<span class="item-cost-part ${shortage ? 'item-cost-part--short' : ''}">${label} ${have}/${amount}</span>`;
    });
    const itemParts = Object.entries(itemCost).map(([ingredientKey, count]) => {
      const ownedCount = items.filter(it =>
        (it.item_stats?.key || it.item_stats?.icon) === ingredientKey && !it.equipped_by
      ).length;
      const shortage = ownedCount < count;
      const def = ITEM_DEFS[ingredientKey];
      const label = def ? def.name : ingredientKey;
      return `<span class="item-cost-part ${shortage ? 'item-cost-part--short' : ''}">🔧 ${label} ${ownedCount}/${count}</span>`;
    });
    return [...resParts, ...itemParts].join(' · ');
  }

  function buildCatalogItemCard(itemDef, ownedCount, unit, unitTags) {
    const iconId      = itemDef.icon || itemDef.key || 'item';
    const cost         = itemDef.cost      || {};
    const itemCost     = itemDef.item_cost || {};
    const factionOk    = !itemDef.faction || itemDef.faction === player.faction;
    const canAfford    = hasCraftMaterials(itemDef);
    // Embark progress gate (data/items.js `requires`). Locked blueprints stay in
    // the catalog on purpose — they read as goals, not as items you don't have.
    const unlocked     = meetsCraftRequirements(itemDef, progress);
    // Unique items you already own can never be re-crafted, no matter the cost.
    const uniqueOwned  = !!itemDef.unique && ownedCount > 0;
    const canCraft     = factionOk && unlocked && canAfford && !uniqueOwned;

    // A short availability line: why you can (or can't) make this right now.
    // Only reasons the card cannot show any other way. "Not enough resources" is
    // omitted: the disabled Craft button and the red cost chips already say it.
    let blocked = '';
    if (uniqueOwned)     blocked = T('uniqueOwned');
    else if (!factionOk) blocked = T('wrongFaction');
    else if (!unlocked)  blocked = `🔒 ${craftRequirementText(itemDef, L)}`;

    const countLine = ownedCount > 0 ? `${T('owned')} ×${ownedCount}` : '';

    return `
      <div class="item-card item-card--catalog item-card--rarity-${itemRarity(itemDef)} ${canCraft ? 'item-card--available' : ''}">
        <div class="item-card-body">
          ${itemAsideHtml(itemDef, {
            iconId, name: itemName(itemDef, player), rarity: itemRarity(itemDef),
            unique: !!itemDef.unique, countLine,
          })}
          <div class="item-card-main">
            <div class="item-card-name">${itemName(itemDef, player)}</div>
            <div class="item-card-stats">${formatStatMods(itemDef.stat_mods)}</div>
            ${itemPassiveHtml(itemDef)}
            <div class="item-card-tags">${itemTagsHtml(itemDef)}</div>
          </div>
        </div>
        <div class="item-cost">${costChips(cost, itemCost)}</div>
        <button class="item-action-btn item-action-btn--craft" data-craft-key="${itemDef.key}" ${canCraft ? '' : 'disabled'}>${T('craft')}</button>
        ${blocked ? `<div class="item-card-blocked">${blocked}</div>` : ''}
      </div>`;
  }


  // Craftability, in one place: the catalog card's Craft button and the
  // "Craftable now" filter must never disagree about what is makeable.
  function hasCraftMaterials(itemDef) {
    const cost     = itemDef.cost || {};
    const itemCost = itemDef.item_cost || {};
    const resourceOk = Object.entries(cost).every(([resName, amount]) =>
      (resources.find(r => r.item === resName)?.amount ?? 0) >= amount);
    const ingredientOk = Object.entries(itemCost).every(([key, count]) =>
      items.filter(it => (it.item_stats?.key || it.item_stats?.icon) === key && !it.equipped_by).length >= count);
    return resourceOk && ingredientOk;
  }

  function canCraftNow(itemDef) {
    if (itemDef.faction && itemDef.faction !== player.faction) return false;
    if (!meetsCraftRequirements(itemDef, progress)) return false;
    const ownedCount = items.filter(it => (it.item_stats?.key || it.item_stats?.icon) === itemDef.key).length;
    if (itemDef.unique && ownedCount > 0) return false;
    return hasCraftMaterials(itemDef);
  }

  function showTrophyBar() {
    if (!resources.length) return;
    const trophyItems = resources.filter(r => r.item_type === 'trophy' && r.amount > 0);
    if (!trophyItems.length) return;

    const existing = document.getElementById('roster-trophy-bar');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.id = 'roster-trophy-bar';
    bar.className = 'roster-trophy-bar';
    bar.innerHTML = trophyItems.map(t => `
      <div class="trophy-bar-item" title="${t.item}">
        <div class="trophy-bar-icon-wrap">
          <img src="/assets/icons/recources/${t.item}.png"
              class="trophy-bar-icon"
              alt="${t.item}"
              onerror="this.style.display='none';this.nextSibling.style.display='flex';">
          <span class="trophy-bar-icon-fallback">🏆</span>
        </div>
        <span class="trophy-bar-val">${t.amount}</span>
      </div>
    `).join('');

    // After the whole row (timeline + strip + errands), not after the strip —
    // otherwise the trophy bar would be laid out as a third column inside it.
    const resourceRow = document.getElementById('resource-bar-row') || document.getElementById('resource-bar');
    if (resourceRow) {
      resourceRow.insertAdjacentElement('afterend', bar);
    }
  }

  function hideTrophyBar() {
    document.getElementById('roster-trophy-bar')?.remove();
  }

  function openItemModal(rosterId) {
    const unit = units.find(u => String(u.id) === String(rosterId));
    if (!unit) return;

    showTrophyBar();
    const def      = resolveUnitDef(unit);
    const unitTags = (def?.tags || []).filter(Boolean);

    // Filters replace the old free-text search: on a phone, picking from a short
    // list of chips beats typing, and these are the axes a player actually sorts
    // by — what it does, how good it is, and whether it can be made right now.
    let filter     = 'equippable';   // 'equippable' | 'owned' | 'craft'
    let rarity     = 'all';          // 'all' | common | rare | epic | mythic
    let statFilter = 'all';          // see STAT_FILTERS / TRAIT_FILTERS
    let readyOnly  = false;          // craft tab: only what is affordable now
    let selected   = 0;              // index into the current list

    const itemKeyOf = it => it.item_stats?.key || it.item_stats?.icon;

    const RARITIES = ['common', 'rare', 'epic', 'mythic'];
    // Both lists feed the ONE stat dropdown: STAT_FILTERS under "Stats",
    // TRAIT_FILTERS under "Traits". Entry 0 must stay the 'all' option — the
    // dropdown lifts it out as the ungrouped default (STAT_FILTERS.slice(1)).
    const STAT_FILTERS = [
      ['all',           T('all')],
      ['hp',            T('hp')],
      ['armor',         T('armor')],
      ['initiative',    T('init')],
      ['action_power',  T('power')],
      ['resist',        T('resist')],
    ];
    const TRAIT_FILTERS = [
      ['passive',    T('passive')],
      ['grants_tag', T('grantsTag')],
      ['needs_tag',  T('needsTag')],
    ];

    // stat_mods keys are hp / armor / initiative / action_power / <element>_resist.
    function matchesStat(stats) {
      if (statFilter === 'all') return true;
      if (statFilter === 'passive')    return !!stats?.passive;
      if (statFilter === 'grants_tag') return !!stats?.adds_tag;
      if (statFilter === 'needs_tag')  return !!stats?.tag_required;
      const mods = stats?.stat_mods || {};
      if (statFilter === 'resist') return Object.keys(mods).some(k => k.endsWith('_resist'));
      return Object.prototype.hasOwnProperty.call(mods, statFilter);
    }

    const matchesRarity = stats => rarity === 'all' || itemRarity(stats) === rarity;

    // The filtered list, as DATA. The big card and the selector track are two
    // views of it, so they can never disagree about what is on screen.
    //   craft tab -> ITEM_DEFS blueprints  { def, owned }
    //   otherwise -> owned rows            { item }
    function currentList() {
      if (filter === 'craft') {
        return Object.values(ITEM_DEFS)
          // Other factions' items are never obtainable, so don't tease them.
          .filter(def => !def.faction || def.faction === player.faction)
          .filter(def => matchesRarity(def) && matchesStat(def))
          .filter(def => !readyOnly || canCraftNow(def))
          .map(def => ({ kind: 'blueprint', def, owned: items.filter(it => itemKeyOf(it) === def.key).length }));
      }
      const visible = items.filter(it => {
        if (!matchesRarity(it) || !matchesStat(it.item_stats)) return false;
        if (filter === 'owned') return true;
        const stats    = it.item_stats || {};
        const factionOk = !stats.faction || stats.faction === player.faction;
        const tagOk     = !stats.tag_required || unitTags.includes(stats.tag_required);
        const equippedHere = String(it.equipped_by) === String(rosterId);
        return equippedHere || (factionOk && tagOk && (it.equipped_by == null));
      });

      // Five Padded Armors are one line reading "x5", not five identical cards
      // to scroll past. Copies are grouped by blueprint key; equipping acts on
      // the first free copy in the stack. An item equipped on THIS unit stays
      // its own entry, because its card shows Unequip rather than Equip.
      const stacks = new Map();
      const out = [];
      for (const it of visible) {
        const equippedHere = String(it.equipped_by) === String(rosterId);
        const key = itemKeyOf(it);
        if (equippedHere || !key) { out.push({ kind: 'item', item: it, count: 1 }); continue; }
        const stack = stacks.get(key);
        if (stack) { stack.count += 1; stack.copies.push(it); continue; }
        const entry = { kind: 'item', item: it, count: 1, copies: [it] };
        stacks.set(key, entry);
        out.push(entry);
      }
      return out;
    }

    function entryStats(entry) {
      return entry?.kind === 'blueprint' ? entry.def : (entry?.item?.item_stats || {});
    }

    function entryName(entry) {
      return entry?.kind === 'blueprint' ? itemName(entry.def, player) : itemName(entry.item, player);
    }

    function entryIcon(entry) {
      const stats = entryStats(entry);
      return stats.icon || stats.key || 'item';
    }

    // The selector track — same portrait-card frame as the roster strip.
    function trackCards(list) {
      if (!list.length) return `<span class="track-empty-hint">${T('nothingMatches')}</span>`;
      return list.map((entry, i) => `
        <div class="portrait-card portrait-card--item ${i === selected ? 'portrait-card--selected' : ''}"
             data-i="${i}" title="${entryName(entry)}">
          <img class="portrait-art-img" src="/assets/icons/items/${entryIcon(entry)}.png"
               alt="${entryName(entry)}" onerror="this.style.display='none'">
          ${entry.kind === 'blueprint'
            ? (entry.owned > 0 ? `<span class="item-track-owned">${entry.owned}</span>` : '')
            : ((entry.count ?? 1) > 1 ? `<span class="item-track-owned">${entry.count}</span>` : '')}
        </div>`).join('');
    }

    // The one item on show, with room to lay it out properly.
    function detailCard(entry) {
      if (!entry) return `<p class="placeholder">${T('nothingMatches')}</p>`;
      return entry.kind === 'blueprint'
        ? buildCatalogItemCard(entry.def, entry.owned, unit, unitTags)
        : buildItemCard(entry.item, unit, unitTags, entry.count ?? 1);
    }

    function render() {
      const tab = (id, label) =>
        `<button class="items-tab ${filter === id ? 'items-tab--active' : ''}" data-filter="${id}">${label}</button>`;
      const opt = (id, label, current) =>
        `<option value="${id}"${current === id ? ' selected' : ''}>${label}</option>`;

      const list = currentList();
      if (selected >= list.length) selected = 0;

      return `
        <div class="items-modal">
          <div class="items-tabs">
            ${tab('equippable', T('tabEquippable'))}
            ${tab('owned', T('tabOwned'))}
            ${tab('craft', T('tabCraft'))}
          </div>

          <!-- Three rows of chips became two dropdowns on one row. Chips forced
               every option to be on screen at once, which is what pushed the
               Russian labels off the right edge; a <select> shows one. The stat
               and trait filters are ONE setting (statFilter), which is why they
               share a dropdown rather than sitting in two — picking a trait has
               always cleared the stat, and grouped options say so. -->
          <div class="items-filters">
            <div class="items-filter-row items-filter-row--selects">
              <select class="items-select items-select--rarity-${rarity}"
                      id="items-rarity-select" aria-label="${T('filterRarity')}">
                ${opt('all', T('any'), rarity)}
                ${RARITIES.map(r => opt(r, T(r), rarity)).join('')}
              </select>

              <select class="items-select" id="items-stat-select" aria-label="${T('filterStat')}">
                ${opt('all', T('all'), statFilter)}
                <optgroup label="${T('groupStats')}">
                  ${STAT_FILTERS.slice(1).map(([id, label]) => opt(id, label, statFilter)).join('')}
                </optgroup>
                <optgroup label="${T('groupTraits')}">
                  ${TRAIT_FILTERS.map(([id, label]) => opt(id, label, statFilter)).join('')}
                </optgroup>
              </select>

              ${filter === 'craft' ? `
                <button class="items-chip items-chip--toggle ${readyOnly ? 'items-chip--active' : ''}" id="items-ready-toggle">${T('craftableNow')}</button>` : ''}
            </div>
          </div>

          <!-- One item, shown properly, instead of a rail of clamped cards. The
               track below is the selector, exactly like the roster strip. -->
          <div class="item-detail" id="item-detail">${detailCard(list[selected])}</div>

          <div class="prep-track-wrap items-track-wrap">
            <div class="portrait-track" id="items-track">${trackCards(list)}</div>
          </div>
        </div>`;
    }

    openSheet(T('items'), render());

    // The trophy bar belongs to this sheet, so it goes when the sheet does —
    // however it is dismissed (✕, backdrop tap, or code calling closeSheet).
    // The old MutationObserver watched for the overlay being REMOVED, but sheets
    // are only ever hidden by class, so it never fired and the bar was left
    // stranded over the roster.
    onSheetClose(hideTrophyBar);

    // Bind to the MAIN sheet's body specifically. document.querySelector('.modal-body')
    // returns whichever sheet is first in the DOM — if a sub-sheet (ability/stat
    // detail) was opened earlier it can win, leaving this handler on a hidden body
    // so equip/craft taps never fire. getSheetBody() always targets the main sheet.
    const body = getSheetBody();

    // Items come from the shared bootstrap refresh now; this only repaints.
    async function refreshAndRerender() {
      applyBootstrap(await bootstrapCache.refresh(player.chat_id));
      body.innerHTML = render();
    }

    // Repaint the detail card and the selector track together — they are two
    // views of currentList() and must not drift apart.
    function refreshList({ keepSelection = false } = {}) {
      const list = currentList();
      if (!keepSelection || selected >= list.length) selected = 0;
      const detail = body.querySelector('#item-detail');
      const track  = body.querySelector('#items-track');
      if (detail) detail.innerHTML = detailCard(list[selected]);
      if (track)  track.innerHTML  = trackCards(list);
      centreSelectedItem('auto');
    }

    function centreSelectedItem(behavior = 'smooth') {
      body.querySelector('#items-track .portrait-card--selected')
        ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior });
    }

    // Rarity and stat/trait are dropdowns, so they report through `change`, not
    // `click`. Only the list is repainted — re-rendering the whole sheet would
    // rebuild the <select> the player just used and, on mobile, fight the
    // native picker closing.
    body.addEventListener('change', (e) => {
      const sel = e.target.closest('select');
      if (!sel) return;
      if (sel.id === 'items-rarity-select') {
        rarity = sel.value;
        // Keeps the closed select tinted with the rarity it is showing.
        sel.className = `items-select items-select--rarity-${rarity}`;
        refreshList();
        return;
      }
      if (sel.id === 'items-stat-select') {
        statFilter = sel.value;
        refreshList();
      }
    });

    body.addEventListener('click', async (e) => {
      // Switching tabs changes which filter rows apply (Craftable-now only
      // exists on the craft tab), so this one repaints the whole sheet.
      const tabBtn = e.target.closest('[data-filter]');
      if (tabBtn) {
        filter = tabBtn.dataset.filter;
        body.innerHTML = render();
        return;
      }

      if (e.target.closest('#items-ready-toggle')) {
        readyOnly = !readyOnly;
        body.innerHTML = render();
        return;
      }

      // Selector track: tap an item to show it, exactly like the roster strip.
      const trackCard = e.target.closest('#items-track .portrait-card');
      if (trackCard) {
        selected = Number(trackCard.dataset.i);
        const list = currentList();
        body.querySelector('#item-detail').innerHTML = detailCard(list[selected]);
        body.querySelectorAll('#items-track .portrait-card').forEach((c, ci) =>
          c.classList.toggle('portrait-card--selected', ci === selected));
        centreSelectedItem();
        return;
      }

      // The item's passive — same description modal the unit card uses.
      const passiveBtn = e.target.closest('.item-passive');
      if (passiveBtn) {
        const def = resolveAbility(passiveBtn.dataset.abilityKey);
        if (def) {
          const parts = buildAbilityModalParts(def, 'passive');
          openSubSheet(parts.title, parts.body, parts.badges);
        }
        return;
      }

      // A material chip in the cost row — open its "where does this drop" sheet.
      // The catalog's repaint is handed over so a craft started from that sheet
      // can refresh the card behind it.
      const matChip = e.target.closest('[data-material]');
      if (matChip) {
        openMaterialSheet(matChip.dataset.material, () => { body.innerHTML = render(); });
        return;
      }

      const equipBtn = e.target.closest('.item-action-btn--equip');
      if (equipBtn && !equipBtn.disabled) {
        equipBtn.disabled    = true;
        equipBtn.textContent = T('equipping');
        try {
          const equipped = await api('/items/equip', { chat_id: player.chat_id, roster_id: equipBtn.dataset.rosterId, item_id: equipBtn.dataset.itemId });
          await reloadAndRerender(equipBtn.dataset.rosterId, equipped);
          body.innerHTML = render();   // repaint the open items sheet
          // Onboarding's last roster beat. Marked here, on the equip actually
          // succeeding, rather than on the tap that requested it.
          if (!isTutorialDone(player, 'roster_equip')) {
            markTutorialDone(player, 'roster_equip');
            closeSheet(); // navigate() clears the spotlight, but not the sheet
            showEquippedStep(equipBtn.dataset.rosterId);
          }
        } catch (err) {
          alert(err.message || T('failEquip'));
          body.innerHTML = render();
        }
        return;
      }

      const unequipBtn = e.target.closest('.item-action-btn--unequip');
      if (unequipBtn) {
        unequipBtn.disabled    = true;
        unequipBtn.textContent = T('unequipping');
        const focusedId = units[current]?.id;
        try {
          const unequipped = await api('/items/unequip', { chat_id: player.chat_id, item_id: unequipBtn.dataset.itemId });
          await reloadAndRerender(focusedId, unequipped);
          body.innerHTML = render();   // repaint the open items sheet
        } catch (err) {
          alert(err.message || T('failUnequip'));
          body.innerHTML = render();
        }
        return;
      }

      const craftBtn = e.target.closest('.item-action-btn--craft');
      if (craftBtn && !craftBtn.disabled) {
        craftBtn.disabled    = true;
        craftBtn.textContent = T('crafting');
        try {
          const crafted = await api('/items/craft', { chat_id: player.chat_id, item_key: craftBtn.dataset.craftKey });
          // Apply what the craft endpoint ALREADY read back, rather than firing
          // a second /bootstrap and hoping it sees the insert. That extra read
          // is what made a freshly crafted item need a reload to appear: it can
          // answer from a replica that has not caught up with the write, and the
          // pre-craft list it returns is then cached as if it were current.
          // /bootstrap splits resources by item_type; the craft response returns
          // both kinds in one list, so it is split the same way here.
          const rows  = crafted.resources || [];
          const merged = crafted.items ? bootstrapCache.patch(cur => ({
            items:     crafted.items,
            resources: rows.length ? rows.filter(r => r.item_type === 'resource') : cur.resources,
            trophies:  rows.length ? rows.filter(r => r.item_type === 'trophy')   : cur.trophies,
          })) : null;
          applyBootstrap(merged || await bootstrapCache.refresh(player.chat_id));
          showTrophyBar();
          refreshResourceBar(player).catch(() => {});
          rerenderKeeping(rosterId);
          body.innerHTML = render();
        } catch (err) {
          alert(err.message || T('failCraft'));
          body.innerHTML = render();
        }
        return;
      }
    });
  }

  // Tapping a crafting material answers the only question a player has about it:
  // where do I get more? Lists the regions that drop it and offers to take them
  // there, with the regions flagged on arrival. Disabled when nothing drops it
  // (crafted-only ingredients, for instance).
  function openMaterialSheet(key, onCrafted = null) {
    const regionIds = getRegionsForMaterial(key);
    const L         = player?.settings?.language === 'ru' ? 'ru' : 'en';
    const label     = materialName(key);
    const have      = ownedAmount(key);
    // An ingredient that is itself a craftable item can be made right here,
    // instead of making the player back out and hunt for it in the catalog.
    const ingredientDef = ITEM_DEFS[key] || null;
    const canMake       = ingredientDef ? canCraftNow(ingredientDef) : false;

    const regionNames = regionIds.map(id => {
      const region = REGIONS.find(r => r.id === id);
      return (region ? (L === 'ru' ? (region.label_ru || region.label) : region.label) : id) || id;
    }).join(', ');

    openSubSheet(label, `
      <div class="mat-sheet">
        <div class="mat-sheet-head">
          <span class="mat-sheet-icon">${materialIcon(key)}</span>
          <span class="mat-sheet-have">${L === 'ru' ? 'В наличии' : 'Owned'}: <strong>${have}</strong></span>
        </div>
        ${regionIds.length
          ? `<p class="mat-sheet-label">${L === 'ru' ? 'Выпадает:' : 'Drops in:'} <span class="mat-regions">${regionNames}</span></p>`
          : `<p class="modal-empty">${L === 'ru' ? 'Не выпадает в походах — только изготовление.' : 'Not found on any expedition — crafted only.'}</p>`}
        ${ingredientDef ? `
          <div class="mat-sheet-cost">${costChips(ingredientDef.cost || {}, ingredientDef.item_cost || {})}</div>
          <button class="mat-embark-btn" id="mat-craft-btn" ${canMake ? '' : 'disabled'}>
            ${T('craft')}
          </button>` : ''}
        <button class="mat-embark-btn" id="mat-embark-btn" data-material="${key}" ${regionIds.length ? '' : 'disabled'}>
          ${L === 'ru' ? 'В поход' : 'Embark'}
        </button>
      </div>`);

    getSubSheetBody()?.querySelector('#mat-craft-btn')?.addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = T('crafting');
      try {
        const crafted = await api('/items/craft', { chat_id: player.chat_id, item_key: key });
        // Same read-after-write reasoning as the catalog's Craft button: use what
        // the endpoint already read back rather than firing another /bootstrap.
        const rows   = crafted.resources || [];
        const merged = crafted.items ? bootstrapCache.patch(cur => ({
          items:     crafted.items,
          resources: rows.length ? rows.filter(r => r.item_type === 'resource') : cur.resources,
          trophies:  rows.length ? rows.filter(r => r.item_type === 'trophy')   : cur.trophies,
        })) : null;
        applyBootstrap(merged || await bootstrapCache.refresh(player.chat_id));
        refreshResourceBar(player).catch(() => {});
        closeSubSheet();
        onCrafted?.();       // repaint the catalog card that sent us here
      } catch (err) {
        btn.disabled = false;
        btn.textContent = T('craft');
        alert(err.message || T('failCraft'));
      }
    });

    getSubSheetBody()?.querySelector('#mat-embark-btn')?.addEventListener('click', () => {
      if (!regionIds.length) return;
      closeSubSheet();
      closeSheet();
      // embark.js flashes these region cards for a few seconds on arrival.
      navigate('embark', { player, highlightRegions: regionIds, highlightMaterial: key });
    });
  }

  // Onboarding chain, entered right after the player's second building (castle.js
  // navigates here). Runs: intro -> tap the hero's item slot -> tap Equip ->
  // confirm, then hands off to embark. The equip step is completed by the equip
  // handler in openItemModal() rather than by the tap that requested it, so the
  // chain only advances once the item is really on.
  const STARTING_ITEM_KEY = 'padded_armor';

  // True while the opening spell tutorial (revive → heal) is running, so the
  // resurrect/heal click handlers only advance the chain during onboarding and
  // never spotlight for a veteran reviving a unit in normal play.
  let spellTutorialActive = false;

  function heroUnit() {
    return units.find(u => u.is_hero === true) || units[0] || null;
  }

  // The dead bonus recruit the spell tutorial revives.
  function deadTutorialUnit() {
    return units.find(u => u.is_hero !== true && u.unit_data?.alive === false) || null;
  }
  // A living but wounded non-hero — the heal step's target (the just-revived unit).
  function woundedTutorialUnit() {
    return units.find(u => u.is_hero !== true && u.unit_data?.alive !== false &&
      u.unit_data?.current_hp != null && u.unit_data?.max_hp != null &&
      u.unit_data.current_hp < u.unit_data.max_hp) || null;
  }

  // After the equip step, run the spell tutorial (if a dead recruit is waiting
  // and it hasn't been completed), otherwise head straight to embark.
  function startSpellTutorialOrEmbark() {
    if (!isTutorialDone(player, 'spell_heal') && (deadTutorialUnit() || woundedTutorialUnit())) {
      spellTutorialActive = true;
      showReviveStep();
    } else {
      navigate('embark', { player });
    }
  }

  function showReviveStep() {
    if (isTutorialDone(player, 'spell_revive')) { showHealStep(); return; }
    const dead = deadTutorialUnit();
    if (!dead) { showHealStep(); return; }
    const idx = units.indexOf(dead);
    goTo(idx);
    // Let the slider settle on the dead unit before measuring its button.
    requestAnimationFrame(() => {
      const btn = track.children[idx]?.querySelector('.resurrect-btn');
      if (!btn) { showHealStep(); return; }
      // Action step: advances (and clears) on the tap; the resurrect handler
      // then marks it done and chains to the heal step after the re-render.
      showTutorialSpotlight(player, 'spell_revive', btn);
    });
  }

  function showHealStep() {
    if (isTutorialDone(player, 'spell_heal')) { spellTutorialActive = false; navigate('embark', { player }); return; }
    const target = woundedTutorialUnit();
    if (!target) { markTutorialDone(player, 'spell_heal'); spellTutorialActive = false; navigate('embark', { player }); return; }
    const idx = units.indexOf(target);
    goTo(idx);
    requestAnimationFrame(() => {
      const btn = track.children[idx]?.querySelector('.heal-btn');
      if (!btn) { markTutorialDone(player, 'spell_heal'); spellTutorialActive = false; navigate('embark', { player }); return; }
      showTutorialSpotlight(player, 'spell_heal', btn);
    });
  }

  function isEquippableBy(item, unit) {
    const stats    = item.item_stats || {};
    const def      = resolveUnitDef(unit);
    const unitTags = (def?.tags || []).filter(Boolean);
    return (!stats.faction || stats.faction === player.faction)
        && (!stats.tag_required || unitTags.includes(stats.tag_required))
        && !getEquipBlock(stats, def, UNIT_ABILITIES);
  }

  function runRosterTutorial() {
    const hero = heroUnit();
    // TEMPORARY onboarding diagnostic — remove once the roster steps are confirmed.
    console.log('[roster] tutorial gate', {
      second_building: isTutorialDone(player, 'second_building'),
      roster_intro:    isTutorialDone(player, 'roster_intro'),
      roster_equip:    isTutorialDone(player, 'roster_equip'),
      units:           units.length,
      items:           items.length,
      itemKeys:        items.map(it => it.item_stats?.key || it.item_stats?.icon),
      hero:            hero?.unit_data?.unit_id,
      heroEquipped:    hero ? !!equippedItemFor(hero.id) : null,
    });

    if (!isTutorialDone(player, 'second_building')) return;

    // Self-heal: roster_equip is only marked when the player equips THROUGH the
    // tutorial's sheet. A player who armed their hero any other way keeps the
    // flag false forever, so the equip chain re-arms on every roster visit —
    // long after onboarding, and it yanks the slider to the hero when it does.
    // If the lesson is already moot (hero is armed) or onboarding has moved on,
    // retire the step instead of teaching it again.
    if (!isTutorialDone(player, 'roster_equip') &&
        (isTutorialDone(player, 'spell_heal') || (hero && equippedItemFor(hero.id)))) {
      markTutorialDone(player, 'roster_equip');
    }

    // Equip step still pending → run the intro/equip chain as before.
    if (!isTutorialDone(player, 'roster_equip')) {
      if (!hero) return;
      const heroIdx = units.indexOf(hero);
      goTo(heroIdx);

      if (!isTutorialDone(player, 'roster_intro')) {
        const card = track.children[heroIdx]?.querySelector('.unit-card');
        if (!card) return;
        showTutorialSpotlight(player, 'roster_intro', card, {
          showContinue: true,
          onAdvance: () => {
            markTutorialDone(player, 'roster_intro');
            showEquipSlotStep(hero);
          },
        });
        return;
      }
      showEquipSlotStep(hero);
      return;
    }

    // Equip done but the spell tutorial hasn't finished (e.g. a reload mid-way):
    // resume it as long as there's still a fallen/wounded recruit to act on.
    if (!isTutorialDone(player, 'spell_heal') && (deadTutorialUnit() || woundedTutorialUnit())) {
      spellTutorialActive = true;
      showReviveStep();
    }
  }

  function showEquipSlotStep(hero) {
    // Nothing to teach if the hero is already armed, or has nothing to put on
    // (an account that registered before starting gear was granted). Just stop —
    // never mark the step done here, or a later item could never teach it.
    if (equippedItemFor(hero.id)) return;
    if (!items.some(it => !it.equipped_by && isEquippableBy(it, hero))) return;

    const slot = track.querySelector(`[data-item-slot][data-roster-id="${hero.id}"]`);
    if (!slot) return;
    showTutorialSpotlight(player, 'roster_equip_slot', slot, {
      // The same tap opens the items sheet via the delegated track handler, which
      // runs after this one — wait for that sheet to finish sliding up before
      // spotlighting anything inside it.
      onAdvance: () => afterSheetSettles(() => showEquipButtonStep()),
    });
  }

  // The items sheet slides up (.modal, `sheet-up`, 0.22s). Measuring a button
  // inside it before that settles reads a rect that is still off the bottom of
  // the screen, which puts the spotlight hole off-screen and leaves the blockers
  // covering the whole view. Wait for the animation, with a timeout in case it
  // was skipped (reduced motion, or an already-open sheet).
  function afterSheetSettles(fn) {
    const modal = document.querySelector('.modal-overlay:not(.hidden):not(.modal-overlay--sub) .modal');
    if (!modal) { requestAnimationFrame(fn); return; }
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      modal.removeEventListener('animationend', run);
      fn();
    };
    modal.addEventListener('animationend', run);
    setTimeout(run, 400);
  }

  // Payoff for the equip chain: the sheet is closed and the slot now shows the
  // item, so point at it before handing off to embark.
  function showEquippedStep(rosterId) {
    const slot = track.querySelector(`[data-item-slot][data-roster-id="${rosterId}"]`);
    if (!slot) { startSpellTutorialOrEmbark(); return; }
    showTutorialSpotlight(player, 'roster_equipped', slot, {
      showContinue: true,
      onAdvance: () => showPassiveStackStep(rosterId),
    });
  }

  // Taught right after the first equip, while the player is looking at the row
  // where a unit's and its item's passives sit side by side. Ranks add and cap
  // at 3 (see stackPassiveKeys in utils/passive-processor.js).
  function showPassiveStackStep(rosterId) {
    if (isTutorialDone(player, 'roster_passive_stack')) { startSpellTutorialOrEmbark(); return; }
    const slide = track.children[current];
    const row   = slide?.querySelector('.unit-abilities-row');
    if (!row) { startSpellTutorialOrEmbark(); return; }
    showTutorialSpotlight(player, 'roster_passive_stack', row, {
      showContinue: true,
      onAdvance: () => {
        markTutorialDone(player, 'roster_passive_stack');
        startSpellTutorialOrEmbark();
      },
    });
  }

  function showEquipButtonStep() {
    const body = getSheetBody(); // main sheet body — see note in openItemModal
    if (!body) return;
    const buttons = [...body.querySelectorAll('.item-action-btn--equip:not([disabled])')];
    const target = buttons.find(b => {
      const item = items.find(it => String(it.id) === String(b.dataset.itemId));
      return (item?.item_stats?.key || item?.item_stats?.icon) === STARTING_ITEM_KEY;
    }) || buttons[0];
    if (target) showTutorialSpotlight(player, 'roster_equip', target);
  }

  // Every slice this screen needs — roster, items, structures, resources,
  // trophies — comes from the single /bootstrap payload. Nothing here fetches
  // a second endpoint.
  function applyBootstrap(boot) {
    units         = (boot.roster || []).slice().sort((a, b) => (b.is_hero === true) - (a.is_hero === true));
    buildingsData = boot.structures?.buildings_data || {};
    upgradePaths  = boot.buildings?.upgrade_paths || {};
    buildingPools = boot.buildings?.pools || {};
    // Mercenary halls are a separate table but resolve through the same branch
    // logic, so unitIdForBuilding has to be able to see them too — otherwise a
    // mercenary's slot building maps to no unit and its upgrade never resolves.
    mercBuildings = boot.buildings?.mercenary_buildings || {};
    items         = boot.items || [];
    resources     = [...(boot.resources || []), ...(boot.trophies || [])];
    progress      = boot.progress || {};
    favorRemaining = boot.favor?.remaining ?? 0;
    favorSeconds   = boot.favor?.seconds ?? favorSeconds;
    return boot;
  }

  // ── Divine favor ──────────────────────────────────────────────────────────
  // /favor/start reserves the view and returns a single-use token; the ad plays;
  // /favor/claim redeems it. The countdown below is a PLACEHOLDER standing in
  // for a real network's completion callback — when the SDK lands, only the
  // "wait for the ad to finish" step is replaced. It is not a security control:
  // the server independently checks the elapsed time before granting anything.
  // Translated message for a favor failure. Never surfaces err.message — that
  // string is English-only and written for a developer, not a player.
  function favorError(err) {
    return RT.favorErrors[err?.code]?.[L] || T('favorFailed');
  }

  async function runFavor(rosterId) {
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
      await reloadAndRerender(rosterId);
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
            <span class="favor-modal-adbadge">${T('adBadge')}</span>
            <span class="favor-modal-adtext">${T('favorPlaceholder')}</span>
          </div>
          <div class="favor-modal-title">${T('favorWatching')}</div>
          <div class="favor-modal-bar"><div class="favor-modal-fill"></div></div>
          <div class="favor-modal-count">${seconds}</div>
          <button class="favor-modal-cancel">${T('favorCancel')}</button>
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

  // Post-mutation refresh: ONE request, then re-render keeping the same unit in
  // view. Replaces the old "/roster + /items + refreshResourceBar" trio, which
  // cost three round-trips for one equip.
  // `known` is a write response that already contains the updated rows (items /
  // roster). Applying it beats re-reading: no extra round-trip, and no chance of
  // the read answering with pre-write state. Falls back to a real refresh when
  // nothing usable was passed or the cache has no base to merge into.
  async function reloadAndRerender(focusRosterId, known = null) {
    let merged = null;
    if (known?.items) {
      merged = bootstrapCache.patch(cur => ({
        items: known.items,
        // equip/unequip return the single roster row they touched; splice it
        // into the cached roster rather than refetching the whole list.
        roster: known.roster
          ? (cur.roster || []).map(r => (String(r.id) === String(known.roster.id) ? known.roster : r))
          : cur.roster,
      }));
    }
    applyBootstrap(merged || await bootstrapCache.refresh(player.chat_id));
    rerenderKeeping(focusRosterId);
    refreshResourceBar(player).catch(() => {});
  }

  async function load() {
    applyBootstrap(await bootstrapCache.get(player.chat_id));

    if (!units.length) {
      track.innerHTML = `<div class="roster-slide"><p class="placeholder">No units yet.</p></div>`;
      return;
    }

    initSlider();
    runRosterTutorial();
  }

  load();
}