import { api }              from '../api.js';
import { navigate }          from '../api.js';
import { refreshResourceBar } from '../api.js';
import { refreshNavLock }    from '../api.js';
import { bootstrapCache } from '../api.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone, firstRecruitHint } from '../tutorial.js';
import { UNIT_ABILITIES }    from '../../data/unit_abilities.js';
import { UNITS }             from '../../data/units.js';
import { SPELLS }            from '../../data/spells.js';
// Which regions drop a material — the castle's cost bar uses it to answer
// "where do I get this?" for a cost the player cannot meet.
import { REGIONS, getRegionsForMaterial, eventRegionsForMaterial } from '../../data/embark.js';
import { renderSpellTome }   from './spell_tome.js';
import {
  RESIST_ICONS, RESIST_ORDER,
  resolveAbility, abilityName, renderModalContent, openSheet, closeSheet, getSheetBody, GOLD_ICON,
  openSubSheet, closeSubSheet, getSubSheetBody, cap, onSheetClose, RESOURCE_BAR_SLOTS,
  buildUnitCard, getActionLabel, buildAbilityModalParts,
  renderItemSlotIcon, withEquippedItem, resolveUnitDef, itemName, itemRarity,
  handleUnitInspect, unitName, buildingLabel, enableTrackSwipe,
  playAdPlaceholder as playAd,
} from '../utils.js';
import { getEquipBlock } from '../../data/item_rules.js';
import { errandRosterIds, maybeShowErrandsIntro } from '../errands.js';
import { buildUnitTree, lineageTo, renderUnitTreeHtml, drawUnitTreeLinks } from '../unit_tree.js';
import { assetUrl } from '../asset_base.js';

// Mirror of SLOT_CATEGORIES in data/buildings.js — that file is CommonJS and
// cannot be imported here, and the server validates every build against its own
// copy anyway, so a drift between the two costs a rejected build rather than a
// wrong one. Keep them in step when adding a slot.
//
// The ORDER of these ids is storage order, not grid order. Where each slot sits
// is set by the [data-slot] rules in style.css; see the note in buildings.js for
// why slots 9-11 are appended rather than renumbered into place.
const SLOT_CATEGORIES = {
  slot_0:  'throne',
  slot_1:  'barracks',
  slot_2:  'barracks',
  slot_3:  'barracks',
  slot_4:  'barracks',
  slot_5:  'barracks',
  slot_6:  'special',
  slot_7:  'special',
  slot_8:  'special',
  slot_9:  'barracks',
  slot_10: 'barracks',
  slot_11: 'barracks',

  slot_12: 'hall_up',    slot_16: 'merc_up',    slot_20: 'barracks_up',
  slot_13: 'hall_up',    slot_17: 'merc_up',    slot_21: 'barracks_up',
  slot_14: 'hall_up',    slot_18: 'merc_up',    slot_22: 'barracks_up',
  slot_15: 'hall_up',    slot_19: 'merc_up',    slot_23: 'barracks_up',
};
const SLOT_IDS = Object.keys(SLOT_CATEGORIES);

const LAYER_COUNT = 2;
const layerOf = slot => (Number(String(slot).slice(5)) >= 12 ? 2 : 1);

// Mirrors SLOT_FIXED_BUILDING in data/buildings.js: layer 2 is a fixed ladder,
// one named building per slot, not a category pool.
const SLOT_FIXED_BUILDING = {
  slot_12: 'infirmary',
  slot_13: 'crystal_mine',
  slot_14: 'mage_guild',
  slot_16: 'messenger_post',
  slot_17: 'mercenary_hall',
  slot_20: 'garrison_annex',
  slot_21: 'proving_grounds',
  slot_22: 'training_grounds',
};

const BUILDING_MAX_LEVELS = {
  infirmary: 3, crystal_mine: 2, mage_guild: 2, messenger_post: 3,
  mercenary_hall: 3, garrison_annex: 3, proving_grounds: 2, training_grounds: 2,
};
const buildingMaxLevel = id => BUILDING_MAX_LEVELS[id] ?? 1;

// Mirrors buildingCostForLevel in data/buildings.js: `cost` is the first level's
// price, `upgrade_costs` overrides it per level after that.
const buildingCostForLevel = (def, level) =>
  def?.upgrade_costs?.[level] ?? def?.upgrade_costs?.[String(level)] ?? def?.cost ?? {};

function buildingLevelIn(data, buildingId) {
  if (!data || !buildingId) return 0;
  let best = 0;
  for (const [k, st] of Object.entries(data)) {
    if (!/^slot_\d+$/.test(k)) continue;
    if (st?.building_id === buildingId) best = Math.max(best, st.level ?? 0);
  }
  return best;
}

const SLOT_UNLOCKS = {
  slot_6:  { building: 'mercenary_hall',   level: 1 },
  slot_7:  { building: 'mercenary_hall',   level: 2 },
  slot_8:  { building: 'mercenary_hall',   level: 3 },
  slot_9:  { building: 'garrison_annex', level: 1 },
  slot_10: { building: 'garrison_annex', level: 2 },
  slot_11: { building: 'garrison_annex', level: 3 },
};

function slotLockedBy(data, slot) {
  const required = SLOT_UNLOCKS[slot];
  if (!required) return null;
  if (data?.[slot]?.building_id) return null;
  return buildingLevelIn(data, required.building) >= required.level ? null : required;
}

// Castle copy that was still hardcoded English while the rest of the sheet
// followed the player's language (the perk chooser and Deconstruct modal were
// already localized, so the upgrade button read "Upgrade -> X" next to
// "Разобрать...").
const CASTLE_TEXT = {
  upgradeTo:   { en: n => `Upgrade → ${n}`,             ru: n => `Улучшить → ${n}` },
  upgradeCost: { en: (n, c) => `Upgrade → ${n} (${c})`, ru: (n, c) => `Улучшить → ${n} (${c})` },
  maxed:       { en: 'Maxed — No Upgrades',             ru: 'Максимальный уровень' },
  // Nothing to BUILD, but the unit itself still has a tier ahead — it is only
  // short of XP. Saying "maxed" here is simply false.
  awaitingXp:  { en: 'Next tier at %s XP',              ru: 'Следующий ранг при %s опыта' },
  notEnough:   { en: 'Not enough trophies for this upgrade.', ru: 'Недостаточно трофеев для улучшения.' },
  deconstruct: { en: 'Deconstruct',                           ru: 'Разобрать' },
  upgradeOpen: { en: 'Upgrade',                                ru: 'Улучшить' },
  demolish:    { en: 'Demolish',                               ru: 'Снести' },
  changeBranch:{ en: 'Change branch',                          ru: 'Сменить ветку' },
  sigilName:   { en: 'Crossroad Sigil',                        ru: 'Печать перепутья' },
  sigilMark:   { en: 'Crossroad Sigil required',               ru: 'Нужна печать перепутья' },
  needSigil:   { en: 'You need a Crossroad Sigil to change to a different branch.',
                 ru: 'Чтобы перейти на другую ветку, нужна печать перепутья.' },
  tomeName:    { en: 'Tome of Knowledge',                      ru: 'Том знаний' },
  tomeUse:     { en: 'Use Tome',                               ru: 'Том знаний' },
  tomeConfirm: { en: 'Use a Tome of Knowledge on %s? It grants 100 XP.',
                 ru: 'Использовать том знаний на %s? Он даёт 100 опыта.' },
  tomeDone:    { en: '+100 XP',                                ru: '+100 опыта' },
  backToUnit:  { en: 'Back',                                   ru: 'Назад' },
  noOptions:   { en: 'Nothing to change',                      ru: 'Менять нечего' },
  close:       { en: 'Close',                                 ru: 'Закрыть' },
  confirm:     { en: 'Confirm',                               ru: 'Подтвердить' },
  build:       { en: 'Build',                                 ru: 'Построить' },
  upgrade:     { en: 'Upgrade',                               ru: 'Улучшить' },
  treeTitle:   { en: 'Evolution',                             ru: 'Развитие' },
  treeEmpty:   { en: 'This unit has no upgrade line.',        ru: 'У этого юнита нет ветки развития.' },
  // The build picker names the UNIT, not the building: the player is choosing
  // who will live there, and that is what the card in front of them shows.
  chooseUnit:  { en: 'Choose Unit',                           ru: 'Выберите бойца' },
  beginReign:  { en: 'Begin Your Reign',                      ru: 'Начните правление' },
  noBuildings: { en: 'No buildings available for this slot.', ru: 'Для этого слота нет доступных зданий.' },
  mercHall:    { en: 'Mercenary Hall',                        ru: 'Зал наёмников' },
  mercRecruit: { en: 'Recruit',                               ru: 'Нанять' },
  // Shown instead of "Recruit" on a mercenary the player cannot pay for yet:
  // the cost rides along in the same label, so the trophies needed are on
  // screen rather than behind a failed attempt.
  mercNeeds:   { en: 'Needs',                                 ru: 'Нужно' },
  mercNone:    { en: 'No mercenaries are offered here.',      ru: 'Здесь не предлагают наёмников.' },
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
  onErrand:    { en: 'Away on an errand',                     ru: 'В пути по поручению' },
  level:       { en: 'Level',                                 ru: 'Уровень' },
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
  freeCost:    { en: 'Free',                                  ru: 'Бесплатно' },
  levelWord:   { en: 'Level',                                 ru: 'Уровень' },
  layerCastle: { en: 'Castle',                                ru: 'Замок' },
  layerUpgrades:{ en: 'Upgrades',                             ru: 'Улучшения' },
  slotLocked:  { en: (n, l) => l > 1 ? `Locked — ${n} level ${l}` : `Locked — build ${n} first`,
                 ru: (n, l) => l > 1 ? `Заперто — ${n}, уровень ${l}` : `Заперто — сначала постройте: ${n}` },
  maxLevel:    { en: 'Max level',                             ru: 'Макс. уровень' },
  slotReserved:{ en: 'Reserved',                               ru: 'Зарезервировано' },
  slotReservedBody:{ en: 'Nothing can be built here yet. More is coming to this wing.',
                     ru: 'Здесь пока нечего строить. Это крыло ещё достраивается.' },
  lockedBuild: { en: n => `Build the ${n}`,                    ru: n => `Постройте: ${n}` },
  lockedUpgrade:{ en: (n, l) => `Upgrade the ${n} to level ${l}`,
                  ru: (n, l) => `Улучшите ${n} до уровня ${l}` },
  lockedLevel: { en: (h, n) => `Currently level ${h} — needs level ${n}`,
                 ru: (h, n) => `Сейчас уровень ${h} — нужен уровень ${n}` },
  lockedGoto:  { en: 'Open',                                   ru: 'Открыть' },
};

const CASTLE_BACKGROUNDS = {
  empire:              assetUrl('/assets/screens/empire.jpg'),
  choir_of_the_cursed: assetUrl('/assets/screens/choir.jpg'),
  grail_of_sorrow:     assetUrl('/assets/screens/grail.jpg'),
};

export function renderCastle(root, { player }) {
  // Needed inside the initial markup, which is written before the main
  // `castleLang` further down exists.
  const lang0 = player?.settings?.language === 'ru' ? 'ru' : 'en';
  root.innerHTML = `
    <div class="screen screen-castle">
      <main class="castle-main">
        <div class="castle-grounds">
          <button class="castle-layer-arrow castle-layer-arrow--prev" id="layer-prev"
                  type="button" aria-label="Previous"><span>‹</span></button>

          <div class="castle-layer-viewport" id="castle-layer-viewport">
            <div class="castle-layer-track" id="castle-layer-track">

              <div class="castle-layer" data-layer="1">
                <div class="castle-grid-wrap">
                  <div class="outer-ring" id="outer-ring"></div>
                  <div class="center-slot" id="center-slot"></div>
                </div>
              </div>

              <div class="castle-layer" data-layer="2">
                <div class="castle-grid-wrap castle-grid-wrap--upgrades">
                  <div class="upgrade-col" id="hall-col"></div>
                  <div class="upgrade-col" id="merc-col"></div>
                  <div class="upgrade-col" id="barracks-col"></div>
                </div>
              </div>

            </div>
          </div>

          <button class="castle-layer-arrow castle-layer-arrow--next" id="layer-next"
                  type="button" aria-label="Next"><span>›</span></button>
        </div>
      </main>
    </div>
  `;

  let structuresRecord   = null;
  let buildingPools      = null;
  let upgradePaths       = null;
  let throneUpgradeCosts = {};
  let heroMaxLevel       = 4;
  // The throne has one level MORE than the hero line: its last level grants no
  // new hero tier. Read separately or the throne reports itself maxed at 4 and
  // the fifth upgrade is unreachable.
  let throneMaxLevel     = 5;
  let mercenaryBuildings = {};
  let trophyInventory    = [];
  let tokenInventory     = [];
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
  // Roster ids that are away on an errand — the castle node marks them, since
  // they vanish from battle prep and would otherwise just be missing.
  let errandAwayIds = new Set();

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
    heroMaxLevel       = buildingsResp.hero_max_level || 4;
    throneMaxLevel     = buildingsResp.throne_max_level || 5;
    mercenaryBuildings  = buildingsResp.mercenary_buildings || {};
    respecCostPct       = buildingsResp.respec_cost_pct ?? 25;
    trophyInventory     = trophies || [];
    tokenInventory      = boot.tokens || [];
    resourceInventory   = inventory || [];
    structuresRecord   = structures;
    rosterCount        = Array.isArray(roster) ? roster.length : 0;
    rosterCache        = Array.isArray(roster) ? roster : [];
    itemsCache         = boot.items || [];
    favorRemaining     = boot.favor?.remaining ?? 0;
    favorSeconds       = boot.favor?.seconds ?? favorSeconds;

    renderBuildings();
    // After the first render, so the arrows have nodes to reveal. Idempotent —
    // renderBuildings re-runs on every refresh, this does not.
    attachLayerControls();

    // Not awaited: who is out on an errand only decides a marker, and blocking
    // the whole castle on it would be paying for a badge.
    errandRosterIds(player.chat_id)
      .then(ids => { errandAwayIds = ids; renderBuildings(); })
      .catch(() => {});
  }

  // Single refresh path: /bootstrap holds resources, trophies, structures, roster
  // and items, so every post-mutation update is ONE request rather than one per
  // slice. refreshResourceBar shares the same in-flight fetch.
  // `knownStructures` is the structures row a write just returned. /bootstrap can
  // answer from a replica that has not caught up with that write, so where the
  // caller already holds the post-write row it wins — it cannot be behind — and
  // the cache is corrected to match, so the next screen to read it agrees.
  function patchFromWrite(res) {
    if (!res || (!res.roster && !res.resources)) return null;
    return bootstrapCache.patch(cur => ({
      ...(res.roster    ? { roster:    res.roster }    : {}),
      ...(res.resources ? { resources: res.resources } : {}),
    }));
  }

  async function reloadFromBootstrap(knownStructures = null, knownBoot = null) {
    const boot = knownBoot || await bootstrapCache.refresh(player.chat_id);
    if (knownStructures) bootstrapCache.patch(() => ({ structures: knownStructures }));
    structuresRecord = knownStructures || boot.structures;
    trophyInventory  = boot.trophies || [];
    tokenInventory   = boot.tokens || [];
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
    return `${assetUrl(`/assets/character_portraits/p_${portraitId}.png`)}`;
  }

  // Layer-2 buildings recruit nobody, so they have no portrait to borrow — they
  // carry their own art instead, one image per faction. The suffix is the
  // faction's initial: infirmary_e.jpg / _c / _g.
  const FACTION_ART_SUFFIX = { empire: 'e', choir_of_the_cursed: 'c', grail_of_sorrow: 'g' };

  function buildingArtUrl(def) {
    if (!def?.art) return '';
    const suffix = FACTION_ART_SUFFIX[player.faction];
    if (!suffix) return '';
    return assetUrl(`/assets/buildings/${def.art}_${suffix}.jpg`);
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
  // Must agree with getRespecOptions in data/buildings.js, which is what the
  // server validates against — this had drifted into a second copy of the old
  // category+tier rule, so the sheet offered swaps /structures/respec refuses.
  //
  // A respec re-chooses a FORK: the other branches the same parent leads to.
  // Matching on category + tier alone let a Paladin cathedral list the
  // Inquisitor and Artificer towers, which would change the player's hero.
  function respecOptionsFor(buildingId) {
    const pools = buildingPools?.[player.faction];
    if (!pools) return [];
    const current = getBuildingDef(player.faction, buildingId);
    if (!current) return [];
    const pool = pools[current.category] || [];

    const parent = pool.find(b => (b.upgrades || []).includes(current.id));
    if (parent) {
      return (parent.upgrades || [])
        .filter(id => id !== current.id)
        .map(id => pool.find(b => b.id === id))
        .filter(b => b && b.unit_id);
    }
    // Tier 1 has no parent: re-picking a starting building is fine for barracks,
    // but the throne is the hero and is chosen once.
    if (current.category === 'throne') return [];
    return pool.filter(b => b.id !== current.id && b.tier != null && b.tier === current.tier && b.unit_id);
  }

  // The Crossroad Sigil options: same-tier buildings reachable down the OTHER
  // roads out of the nearest fork above this one. Most of the tree has no sibling
  // at all — a branch that forks at tier 2 and then runs straight leaves its tier
  // 3 and 4 buildings with nothing to respec into — so without this a wrong turn
  // could only be undone by demolishing everything below it.
  //
  // Mirrors getCrossBranchRespecOptions in data/buildings.js, which is what
  // /structures/respec validates against; this copy only decides what is OFFERED,
  // and the server is what charges the Sigil.
  function crossBranchOptionsFor(buildingId) {
    const pools = buildingPools?.[player.faction];
    if (!pools) return [];
    const current = getBuildingDef(player.faction, buildingId);
    if (!current || current.category === 'throne') return [];
    const pool = pools[current.category] || [];
    const parentOf = id => pool.find(b => (b.upgrades || []).includes(id)) || null;

    let child = current;
    let fork  = parentOf(current.id);
    const seen = new Set([current.id]);
    while (fork && (fork.upgrades || []).length < 2) {
      if (seen.has(fork.id)) return [];
      seen.add(fork.id);
      child = fork;
      fork  = parentOf(fork.id);
    }
    if (!fork) return [];

    const out = [];
    const walk = id => {
      const b = pool.find(x => x.id === id);
      if (!b || seen.has(b.id)) return;
      seen.add(b.id);
      if (b.tier === current.tier && b.unit_id) out.push(b);
      for (const up of b.upgrades || []) walk(up);
    };
    for (const road of fork.upgrades || []) if (road !== child.id) walk(road);
    return out;
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
  // /bootstrap splits the resources table in two by item_type — `resources` for
  // gold and crystals, `trophies` for everything embarks drop — and this looked
  // only at the first. Anything priced in trophies (every mercenary, and the
  // cost bar's trophy columns) therefore read as "have 0" no matter how many
  // were in the inventory: the hall said nothing was affordable, and a merc
  // cost showed a full bar of shortfalls. Both lists are the same table, so
  // both are searched.
  function amountOf(item) {
    const key = item === 'gold' ? 'Gold' : item;
    const row = resourceInventory.find(r => r.item === key)
             || trophyInventory.find(r => r.item === key);
    return row ? Number(row.amount) : 0;
  }

  // Tokens are their own item_type and are NOT searched by amountOf — nothing is
  // ever PRICED in them, so they must not turn up as a payable cost. They are a
  // separate gate, asked about by name.
  function tokenCount(id) {
    const row = tokenInventory.find(r => r.item === id);
    return row ? Number(row.amount) : 0;
  }

  function canAffordCost(cost) {
    return Object.entries(cost || {}).every(([item, amt]) => amountOf(item) >= Number(amt));
  }

  function costLabelFor(cost) {
    const parts = Object.entries(cost || {})
      .map(([item, amt]) => `${amt} ${item === 'gold' ? 'Gold' : item.replace('Crystals_', '')}`);
    return parts.length ? parts.join(' + ') : CASTLE_TEXT.freeCost[castleLang];
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
      // A cost you cannot meet is a question — "where do I get this?" — so the
      // column answers it. Short ones become buttons carrying the material; the
      // ones you can already pay stay inert, since there is nothing to go and
      // find. Covers building costs and mercenary trophy costs alike: both are
      // priced through this same bar.
      const title = `${label}: ${castleLang === 'ru' ? `нужно ${need}, есть ${have}` : `need ${need}, have ${have}`}`;
      if (!short) {
        return `<div class="res-bar-item cost-bar-item cost-bar-item--ok" title="${title}">
                  <span class="res-bar-icon">${iconHtml}</span>
                  <span class="res-bar-val">${need}</span>
                </div>`;
      }
      return `<button class="res-bar-item cost-bar-item cost-bar-item--short" data-material="${key}" title="${title}">
                <span class="res-bar-icon">${iconHtml}</span>
                <span class="res-bar-val">${need}</span>
              </button>`;
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
        const icon = `<img src="${assetUrl(`/assets/icons/recources/${key}.png`)}" class="res-icon-img" alt="${name}" onerror="this.style.visibility='hidden'">`;
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
    // The bar lives outside #content-root, next to the resource strip, so no
    // screen-level delegation reaches it — it carries its own listener.
    bar.addEventListener('click', e => {
      const chip = e.target.closest('[data-material]');
      if (chip) openMaterialSourceSheet(chip.dataset.material);
    });
    resourceRow.insertAdjacentElement('afterend', bar);
  }

  // ── Where does this come from? ────────────────────────────────────────────
  // Opened from a cost the player cannot meet. Crystals and trophies both drop
  // on expeditions, so both get the same answer and the same jump; gold and
  // crafted intermediates do not, and say so rather than offering a dead button.
  //
  // A sub-sheet, because the cost bar is shown while a slot or upgrade sheet is
  // already open and closing that to answer a side question would lose the
  // player's place.
  function openMaterialSourceSheet(key) {
    const staticIds = getRegionsForMaterial(key) || [];
    // A running event can be the ONLY place something drops — an event trophy has
    // no entry in the static tables at all. Merged rather than shown separately:
    // the player asked where to go, and the answer is a list of regions either way.
    const eventIds  = eventRegionsForMaterial(key, bootstrapCache.data?.event);
    const regionIds = [...new Set([...staticIds, ...eventIds])];
    const eventOnly = !staticIds.length && eventIds.length > 0;
    // Nothing drops it and no event is running. That is either a crafted
    // ingredient or an event trophy between events; "not right now" is true of
    // both, where "drops nowhere" is misleading for the second.
    const dormant   = !regionIds.length;
    const label     = key === 'Gold' ? 'Gold' : key.replace(/Crystals_/, '').replace(/_/g, ' ');
    const have      = amountOf(key);

    const rows = regionIds.map(id => {
      const region = REGIONS.find(r => r.id === id);
      const name   = (region ? (castleLang === 'ru' ? (region.label_ru || region.label) : region.label) : id) || id;
      return `<button class="mat-region-btn" data-region="${id}">
                <span class="mat-region-name">${name}</span>
                <span class="mat-region-go">→</span>
              </button>`;
    }).join('');

    openSubSheet(label, `
      <div class="mat-sheet">
        <div class="mat-sheet-head">
          <span class="mat-sheet-have">${castleLang === 'ru' ? 'В наличии' : 'Owned'}: <strong>${have}</strong></span>
        </div>
        ${!dormant
          ? `<p class="mat-sheet-label">${eventOnly
                ? (castleLang === 'ru' ? 'Выпадает только во время события:' : 'Drops during the event only:')
                : (castleLang === 'ru' ? 'Выпадает:' : 'Drops in:')}</p>
             <div class="mat-region-list">${rows}</div>`
          : `<p class="modal-empty">${castleLang === 'ru'
                ? 'Сейчас не выпадает — вернитесь во время события.'
                : 'Not dropping right now — check back during an event.'}</p>`}
      </div>`);

    getSubSheetBody()?.querySelectorAll('.mat-region-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Leaves the castle entirely, so both sheets go with it.
        closeSubSheet();
        closeModal();
        navigate('embark', { player, highlightRegions: [btn.dataset.region], highlightMaterial: key });
      });
    });
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
      .map(d => ({ unit_id: d.unit_id, building_id: d.id, label: buildingLabel(d) }));
  }

  // Where a slot's unit can go next. Keyed on the UNIT, because the unit is the
  // thing being levelled and it can lag the building it stands in. Mercenaries
  // keep their own table; a slot with no occupant yet falls back to the
  // building's blueprint so an empty slot still shows a chain.
  function upgradePathsForSlotUnit(rosterUnit, mercDef, buildingDef, slot = null) {
    const unitDef = rosterUnit ? resolveUnitDef(rosterUnit) : null;
    let paths;
    if (unitDef) {
      // The OCCUPANT is the authority, and an empty answer is a real answer.
      //
      // This used to fall back to the BUILDING's own upgrade list whenever the
      // unit had no path — which is precisely the maxed case. A hero at its top
      // tier has no entry in UNIT_UPGRADE_PATHS, so the sheet fell through and
      // offered both of the cathedral's tier 4 branches to a unit that cannot
      // take either. No fallback: if the unit is done, the slot is done.
      paths = mercDef
        ? getMercUpgradePaths(getBuildingDefForUnit(unitDef.id) || {})
        : ((upgradePaths[player.faction] || {})[unitDef.id] || []);
    } else {
      // No occupant yet — the building was raised but its unit has not spawned.
      // Only here is the blueprint the best available answer.
      paths = mercDef ? getMercUpgradePaths(mercDef) : getUpgradePathsForBuilding(player.faction, buildingDef);
    }

    // The unit and the building can sit a tier apart in either direction, so the
    // unit's path list alone is not the answer — the SLOT decides what is still
    // buildable.
    //
    // Faction paths carry `building_id`; mercenary paths are building defs and
    // carry `id`. Both mean the same thing here.
    const targetOf = p => p.building_id ?? p.id;
    const state = slot ? structuresRecord.buildings_data?.[slot] : null;
    if (!state) return paths;

    const level = state.level ?? 0;

    // A LAYER-2 building levels in place: the Infirmary at level 1 upgrades to
    // the Infirmary at level 2, with no second building to move to. There is no
    // upgrade path to look up, so one is synthesised against what already
    // stands — same id, one more level, which is exactly what the server does
    // with it. Stops at the building's own ceiling.
    if (layerOf(slot) === 2 && state.building_id) {
      return level < buildingMaxLevel(state.building_id)
        ? [{ building_id: state.building_id, unit_id: null, level_only: true }]
        : [];
    }

    // The throne's last level grants no new hero tier, so at level 4 the
    // cathedral has no upgrade target left and the fifth level would be
    // unreachable. Synthesised the same way.
    if (slot === 'slot_0' && level >= heroMaxLevel && level < throneMaxLevel && state.building_id) {
      return [{ building_id: state.building_id, unit_id: unitDef?.id ?? null, throne_level_only: true }];
    }

    // Nothing can be built on a maxed slot, whatever the unit's path says.
    if (level >= heroMaxLevel) return [];

    // THE BRANCH IS ALREADY CHOSEN. If the building standing here is one of the
    // unit's own upgrade targets, the player committed to that branch when they
    // raised it — the unit now only needs XP, and its SIBLING branches are no
    // longer reachable.
    //
    // This was the e2 case: slot holds sun_temple (which grants e21) while the
    // unit is still e2, and e2's paths name both e21 and e22. Filtering only the
    // building already present left e22 on offer, inviting the player to build a
    // branch they had already passed on.
    if ((paths || []).some(p => targetOf(p) === state.building_id)) return [];

    return (paths || []).filter(p => targetOf(p) !== state.building_id);
  }

  function openSliderModal(title, slides, onConfirm, opts = {}) {
    // Opens on the branch the caller asked for. The slot sheet now shows every
    // upgrade up front, so the one the player tapped there has to be the one
    // this lands on — otherwise it always reopened on the first path and the
    // choice they just made was thrown away.
    let current = Math.min(Math.max(0, opts.startIndex ?? 0), Math.max(0, slides.length - 1));

    function renderSliderHtml(idx) {
      const s = slides[idx];
      // Branch picker. An upgrade offers at most three paths, so they all fit as
      // portrait cards — the same frame art the roster, formation track and
      // initiative queue use — instead of arrows and dots that hide the choice.
      // Build sits to the LEFT of the portraits, deconstruct to the RIGHT, so
      // the whole bottom strip is one thumb-height row: act, choose, remove.
      const confirmLabel = s.confirmLabel || CASTLE_TEXT.confirm[castleLang];
      const cards = slides.map((slide, i) => {
        // Layer 2 holds halls, not soldiers, so a branch card there had nothing
        // to show and came out as an empty frame. Building art is drawn to the
        // same ratio as a portrait, so it drops straight into the same card.
        // Layer 1 is left alone on purpose: a barracks card is about the unit it
        // recruits, not the shed it recruits them from.
        const label = unitName(slide.unit) || slide.buildingLabel || '';
        const art   = slide.unit
          ? branchPortraitUrl(slide.unit)
          : (layerOf(slide.slot) === 2 ? (slide.artUrl || '') : '');
        return `
        <div class="portrait-card portrait-card--branch ${i === idx ? 'portrait-card--selected' : ''}"
             data-i="${i}" title="${label}">
          ${art ? `<img class="portrait-art-img" src="${art}" alt="${label}" onerror="this.style.display='none'">` : ''}
        </div>`;
      }).join('');

      return `
        <div class="castle-unit-slider">
          <div class="castle-slider-track" id="slider-track">
            ${buildUnitCard(s.unit, {
              buildingLabel: s.buildingLabel,
              compareUnit:   s.compareUnit,
              // A building that recruits nobody shows its own art and blurb.
              artUrl:        s.artUrl || '',
              desc:          s.desc   || '',
              // The whole point of showing the line here: the player is picking
              // what to build and wants to know where each option leads before
              // committing the gold, not after.
              extraSlotHtml: treeButtonHtml(s.unit?.id),
              // The slot's own HP/XP when the caller has them (an upgrade opened
              // from an occupied slot), so the card keeps the two rows it had on
              // the sheet before this opened. Where there is no unit yet — the
              // build picker on an empty slot — the space is held instead, so
              // the card is the same height either way.
              progress:        s.progress || null,
              reserveProgress: !s.progress,
            })}
          </div>
        </div>
        <div class="track-action-row track-action-row--framed">
          <div class="frame-action-hint-wrap">
            ${opts.hintConfirm ? '<span class="frame-action-hint" aria-hidden="true">▼</span>' : ''}
            <button class="frame-action frame-action--confirm" id="slider-confirm"
                    title="${confirmLabel}" aria-label="${confirmLabel}">⚒</button>
          </div>
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
      // The tree button shares the .ability-icon shape but has no ability key,
      // so it is bound first and excluded below — otherwise the inspector eats
      // the click and nothing happens.
      getSheetBody().querySelector('#unit-tree-btn')?.addEventListener('click', e => {
        openUnitTreeSheet(e.currentTarget.dataset.treeUnit);
      });
      getSheetBody().querySelectorAll('.ability-icon:not([disabled]):not(#unit-tree-btn)').forEach(btn => {
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
      enableTrackSwipe(sheetBody.querySelector('.branch-track-wrap'));

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
  //
  // The canonical list wins over the record's own keys: a player who last
  // played before a slot existed has no entry for it, and rendering only what
  // the record mentions would hide the new squares from exactly the accounts
  // that need them drawn. A slot with no entry reads as empty, which is what it
  // is. Any slot_N in the record but not in the list is still shown, so a record
  // from a NEWER build than this client is never silently truncated.
  function buildingSlotKeys(data) {
    const fromRecord = Object.keys(data || {}).filter(k => /^slot_\d+$/.test(k));
    return [...new Set([...SLOT_IDS, ...fromRecord])]
      .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
  }

  // HP bar for the unit standing in a slot. Same markup, classes and thresholds
  // as the roster portrait strip (portrait-hp-bar / portrait-hp-fill--<state>,
  // critical at <=33%), so the two read identically — a slot with no occupant
  // shows nothing rather than an empty bar.
  // XP toward the unit's next tier, in the same strip as the HP bar so "who is
  // nearly ready to upgrade" is answerable without opening a single node. `xp`
  // on a unit def is what the NEXT tier COSTS, and a top-tier unit still carries
  // one — so a unit with no upgrade path is shown as maxed (a full, quiet bar)
  // rather than as progress toward nothing. Same derivation as the node sheet.
  function nodeXpBar(u) {
    const stored = u.unit_data || {};
    const def    = resolveUnitDef(u);
    if (!def) return '';

    // Same question the slot sheet's XP row asks, so the strip and the sheet can
    // never disagree about whether a unit is finished.
    const req = unitHasNextTier(u) ? (def.xp ?? 0) : 0;
    const cur     = stored.current_xp ?? 0;
    if (!req) return `<div class="portrait-xp-bar portrait-xp-bar--maxed" title="MAX"></div>`;

    const pct = Math.max(0, Math.min(100, Math.round((cur / req) * 100)));
    return `
      <div class="portrait-xp-bar" title="XP ${cur}/${req}">
        <div class="portrait-xp-fill" style="width:${pct}%"></div>
      </div>`;
  }

  // The building whose unit this is, so the XP bar can ask whether that unit has
  // anywhere left to upgrade to.
  function getBuildingDefForUnit(unitId) {
    if (!unitId || !buildingPools) return null;
    for (const list of Object.values(buildingPools[player.faction] || {})) {
      if (!Array.isArray(list)) continue;
      const hit = list.find(d => d.unit_id === unitId);
      if (hit) return hit;
    }
    // Mercenaries live in their own table, same as everywhere else that resolves
    // a slot's building. It is keyed by REGION and each value is an array, so
    // this has to flatten before matching — without it every `d` was an array,
    // `d.unit_id` was undefined, and no mercenary ever resolved.
    return Object.values(mercenaryBuildings || {}).flat().find(d => d?.unit_id === unitId) || null;
  }

  // A building's upgrade options, whichever table it belongs to. Mercenaries are
  // absent from the faction path map and carry their chain as building ids on
  // the def itself, so asking the faction table about one always answers "no
  // upgrades" — which is why a mercenary's XP bar rendered as maxed.
  function upgradePathsForBuildingDef(def) {
    if (!def) return [];
    return def.region ? getMercUpgradePaths(def) : getUpgradePathsForBuilding(player.faction, def);
  }

  // HP and XP for the card in a slot's sheet, both read off the ROSTER ROW —
  // the blueprint would report full HP whatever state the unit is really in,
  // and its `xp` is the cost of the next tier, not what the unit has earned.
  //
  // `forUnit` retargets the ceilings without touching the current values: while
  // previewing an upgrade, the HP the unit HAS is shown against the max it
  // WOULD have, and the XP it has earned against what that upgrade requires.
  // That is the comparison the player is making, and it keeps both bars on the
  // card through the swap instead of dropping two rows and shifting everything
  // under them.
  // Does this unit have a next tier AT ALL, ignoring whether its building is
  // ready? Drives the XP bar and the "maxed" wording, which describe the unit's
  // own progression rather than what the ⚒ button can do right now.
  function unitHasNextTier(rosterUnit) {
    const def = rosterUnit ? resolveUnitDef(rosterUnit) : null;
    if (!def) return false;
    const own = getBuildingDefForUnit(def.id);
    // Mercenaries progress through their own table; faction units through
    // UNIT_UPGRADE_PATHS.
    if (own?.region) return getMercUpgradePaths(own).length > 0;
    return ((upgradePaths[player.faction] || {})[def.id] || []).length > 0;
  }

  function progressForSlot(slot, paths, forUnit = null) {
    const u = rosterUnitForSlot(slot);
    if (!u) return null;
    const stored = u.unit_data || {};
    const ownDef = resolveUnitDef(u);
    const item   = equippedItemFor(u.id);
    // The item's HP bonus counts toward the ceiling, the same way the card's
    // own stat column counts it.
    const defFor = forUnit || ownDef;
    const withItem = item ? withEquippedItem(defFor, item) : defFor;

    const max = withItem?.hp ?? stored.max_hp ?? ownDef?.hp ?? null;
    const cur = Math.min(stored.current_hp ?? max ?? 0, max ?? 0);

    // Whether the XP bar has a target is about the UNIT's next tier, not about
    // whether a BUILD is available. Those are different questions and the answer
    // differs exactly when the building has run ahead of its unit: the tier 4
    // keep is already standing, so there is nothing to build, but the unit is
    // still tier 3 and 91 XP short of using it. Reading the build paths here
    // stamped "Max tier" on a unit with its next tier plainly in front of it.
    const req = unitHasNextTier(u) ? (defFor?.xp ?? null) : null;

    return {
      hp: max != null && max > 0 ? { cur, max } : null,
      xp: { cur: stored.current_xp ?? 0, req: req ?? 0, maxed: !req },
    };
  }

  function nodeHpBar(slot) {
    const u = rosterUnitForSlot(slot);
    if (!u) return '';
    // Out on an errand: the slot is occupied but the unit is not home, and it
    // will not appear in battle prep. Say so here or it just goes missing.
    if (errandAwayIds.has(String(u.id))) {
      return `<div class="castle-node-errand" title="${CASTLE_TEXT.onErrand[castleLang]}">✉</div>`;
    }
    const stored = u.unit_data || {};
    // max_hp is not always written onto the roster row — for a unit that has
    // never been damaged it can be absent, and requiring it here meant the whole
    // strip silently rendered nothing. The definition's hp is the fallback, the
    // same one the node sheet uses; current_hp defaults to full for the same
    // reason.
    const max = stored.max_hp ?? resolveUnitDef(u)?.hp ?? null;
    const cur = stored.current_hp ?? max;
    if (max == null || max <= 0 || cur == null) return '';

    const alive = stored.alive !== false;
    if (!alive) return `<div class="portrait-status portrait-status--dead">💀</div>`;

    const pct     = Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
    const damaged = cur < max;
    const state   = pct <= 33 ? 'critical' : (damaged ? 'damaged' : 'ok');
    // The unit's tier is its level — the same number the unit card shows as Lv.
    const level = resolveUnitDef(u)?.t ?? '';
    // Both bars share one absolutely-positioned strip; stacking them separately
    // would have each fight the same bottom inset. The level sits beside that
    // stack rather than above it, so the whole readout is one short row.
    return `
      <div class="castle-node-bars">
        ${level !== '' ? `<span class="castle-node-level" title="${CASTLE_TEXT.level[castleLang]} ${level}">${level}</span>` : ''}
        <div class="castle-node-bar-stack">
          <div class="portrait-hp-bar" title="${cur}/${max}">
            <div class="portrait-hp-fill portrait-hp-fill--${state}" style="width:${pct}%"></div>
          </div>
          ${nodeXpBar(u)}
        </div>
      </div>`;
  }

  // ── Layer switching ───────────────────────────────────────────────────────
  // The two grids sit side by side on a track; switching slides the track
  // rather than re-rendering, so nothing is rebuilt and the arrows can never
  // race a render. Kept as an index rather than a boolean because a third layer
  // is a data change, not a rewrite.
  let currentLayer = 1;

  function setLayer(next) {
    const clamped = Math.min(LAYER_COUNT, Math.max(1, next));
    if (clamped === currentLayer) return;
    currentLayer = clamped;
    applyLayer();
    // The arrow step is finished by the switch itself; pick the chain back up on
    // the page they just landed on.
    if (structuresRecord) runOnboarding();
  }

  function applyLayer() {
    const track = root.querySelector('#castle-layer-track');
    if (track) track.style.transform = `translateX(-${(currentLayer - 1) * 100}%)`;
    // The layer being left is hidden from assistive tech and from tab order —
    // it is still in the DOM, one screen to the side.
    root.querySelectorAll('.castle-layer').forEach(el => {
      const isCurrent = Number(el.dataset.layer) === currentLayer;
      el.classList.toggle('castle-layer--active', isCurrent);
      el.setAttribute('aria-hidden', String(!isCurrent));
    });
    refreshLayerControls();
  }

  // An arrow that leads nowhere is disabled, not hidden: a control that vanishes
  // moves everything beside it. The glow marks the direction that HAS something.
  function refreshLayerControls() {
    const prev = root.querySelector('#layer-prev');
    const next = root.querySelector('#layer-next');
    if (prev) {
      const can = currentLayer > 1;
      prev.disabled = !can;
      prev.classList.toggle('castle-layer-arrow--live', can);
    }
    if (next) {
      const can = currentLayer < LAYER_COUNT;
      next.disabled = !can;
      next.classList.toggle('castle-layer-arrow--live', can);
    }
  }

  function attachLayerControls() {
    root.querySelector('#layer-prev')?.addEventListener('click', () => setLayer(currentLayer - 1));
    root.querySelector('#layer-next')?.addEventListener('click', () => setLayer(currentLayer + 1));
    applyLayer();
  }

  function renderBuildings() {
    const data        = structuresRecord.buildings_data;
    const throneState = data['slot_0'];
    const throneLevel = throneState?.level ?? 0;
    const throneMaxed = throneLevel >= throneMaxLevel;

    // The unit a slot houses IS what the slot is for, so its portrait carries
    // the node instead of a generic glyph. Falls back to the glyph when there is
    // no unit (empty slot) or no art for it — see .castle-node--portrait, which
    // lays a gradient over the image to keep the label legible.
    //
    // The portrait comes from the unit STANDING IN the slot, not from the
    // building definition. A building's `unit_id` is the unit it recruits at
    // tier 1 and never changes, so a node kept showing the recruit long after
    // the unit inside it had levelled or branched into something else — most
    // visibly on the throne, where the hero's whole upgrade tree shares one
    // slot. The building's own unit_id is only the fallback, for a slot that
    // is built but empty.
    const nodeBackground = (slot, fallbackUnitId, buildingDef = null) => {
      const occupantId = rosterUnitForSlot(slot)?.unit_data?.unit_id ?? null;
      const unit = resolveUnitDef({ unit_data: { unit_id: occupantId } })
                || (fallbackUnitId ? getUnitByUnitId(fallbackUnitId) : null);
      // A unit's portrait first; failing that the building's own art, which is
      // the only thing a layer-2 building has.
      const url  = (unit ? branchPortraitUrl(unit) : '') || buildingArtUrl(buildingDef);
      return url ? ` style="background-image:url('${url}')"` : '';
    };
    const throneDef  = throneState?.building_id ? getBuildingDef(player.faction, throneState.building_id) : null;
    const throneBg   = nodeBackground('slot_0', throneDef?.unit_id);

    root.querySelector('#center-slot').innerHTML = `
      <div class="castle-node castle-node--throne castle-node--clickable ${throneBg ? 'castle-node--portrait' : ''}" data-slot="slot_0"${throneBg}>
        ${throneBg ? '' : '<div class="castle-node-icon">♛</div>'}
        ${nodeHpBar('slot_0')}
      </div>`;

    // buildings_data also carries non-slot keys (throne_perks); only slot_N
    // entries are castle nodes.
    // One node, on either layer. A locked slot still draws — it is a promise,
    // not an absence — but says what opens it instead of inviting a build.
    const nodeHtml = slot => {
      const state      = data[slot] || { level: 0, building_id: null };
      const def        = state.building_id ? getBuildingDef(player.faction, state.building_id) : null;
      const isEmpty    = !state.building_id;
      // A mercenary slot's unit lives in MERCENARY_BUILDINGS, not the faction
      // pool, so both are consulted before giving up on a portrait.
      const mercDef    = !def && state.building_id ? getMercBuildingDef(state.building_id) : null;
      // An empty slot that can only ever hold one building shows THAT building's
      // art, greyed — the player can see what goes here before paying for it.
      const fixedId    = SLOT_FIXED_BUILDING[slot];
      const previewDef = !state.building_id && fixedId
        ? getBuildingDef(player.faction, fixedId) : null;
      const bg         = nodeBackground(slot, (def || mercDef)?.unit_id, def || previewDef);
      const lockedBy   = slotLockedBy(data, slot);
      // A layer-2 slot with no building named for it holds content that does not
      // exist yet. It reads as locked rather than as an empty plot, because "＋"
      // invites a build that cannot happen.
      const reserved   = layerOf(slot) === 2 && !SLOT_FIXED_BUILDING[slot] && !state.building_id;
      const classes    = ['castle-node',
                          isEmpty ? 'castle-node--empty' : '',
                          bg ? 'castle-node--portrait' : '',
                          (lockedBy || reserved) ? 'castle-node--locked' : '',
                          previewDef && !lockedBy ? 'castle-node--preview' : '']
        .filter(Boolean).join(' ');
      const lockTitle  = lockedBy
        ? ` title="${CASTLE_TEXT.slotLocked[castleLang](buildingLabel(getBuildingDef(player.faction, lockedBy.building)) || lockedBy.building, lockedBy.level)}"`
        : '';
      const glyph = (lockedBy || reserved) ? '🔒' : (isEmpty ? '＋' : '⚔');
      const title = lockTitle || (reserved ? ` title="${CASTLE_TEXT.slotReserved[castleLang]}"` : '');
      return `
        <div class="${classes}" data-slot="${slot}"${bg}${title}>
          ${bg && !lockedBy && !reserved && !previewDef ? '' : `<div class="castle-node-icon">${glyph}</div>`}
          ${nodeHpBar(slot)}
        </div>`;
    };

    root.querySelector('#outer-ring').innerHTML = buildingSlotKeys(data)
      .filter(s => s !== 'slot_0' && layerOf(s) === 1)
      .map(nodeHtml).join('');

    // Layer 2, columns 2 and 3: the same node, the same click handler and the
    // same build flow as layer 1 — only the column they sit in differs.
    const fillCol = (id, category) => {
      const el = root.querySelector(id);
      if (!el) return;
      el.innerHTML = buildingSlotKeys(data)
        .filter(sl => layerOf(sl) === 2 && SLOT_CATEGORIES[sl] === category)
        .map(nodeHtml).join('');
    };
    fillCol('#merc-col', 'merc_up');
    fillCol('#barracks-col', 'barracks_up');

    fillCol('#hall-col', 'hall_up');

    root.querySelectorAll('.castle-node').forEach(node => {
      node.addEventListener('click', () => {
        const slot     = node.dataset.slot;
        const state    = data[slot] || {};
        if (layerOf(slot) === 2 && !SLOT_FIXED_BUILDING[slot] && !state.building_id) {
          openReservedPanel();
          return;
        }
        const lockedBy = slotLockedBy(data, slot);
        if (lockedBy) { openLockedPanel(lockedBy); return; }
        handleSlotClick(slot);
      });
    });

    refreshLayerControls();

    runOnboarding();
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


  // Raised while an action handler is driving the chain itself. Every mutation
  // ends in reloadFromBootstrap → renderBuildings → runOnboarding, so
  // without this the gate restarts the chain from its own idea of where the
  // player is, at the same moment the handler is advancing it — two steps race,
  // and the loser anchors its spotlight to an element the winner has already
  // re-rendered away (a detached node measures as a zero-size hole, which reads
  // as the tutorial covering the screen and going nowhere).
  let onboardingBusy = false;

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

  // ── Onboarding ────────────────────────────────────────────────────────────
  // ONE ordered script. The driver walks it top to bottom, shows the FIRST step
  // that is not done and can run right now, and stops. Nothing chains to
  // anything: every step re-enters the driver when it finishes, so there is a
  // single place that decides what comes next.
  //
  //   id        tutorial flag, and the copy key in tutorial.js
  //   ready()   is this step applicable right now? false = skip it and try the
  //             next one. Never fatal, never marks anything.
  //   open()    optional. Put the screen in the state where the target exists
  //             (open a sheet, switch layer). May be async-ish via afterSheetSettles.
  //   target()  the element to point at. null = skip, same as !ready().
  //   hint()    optional second paragraph.
  //   wait      true = the step is finished by a Continue button.
  //             false = the player must use the real control; that control's own
  //             handler marks the flag and calls runOnboarding() again.
  const MESSENGER_SLOT = Object.keys(SLOT_FIXED_BUILDING)
    .find(sl => SLOT_FIXED_BUILDING[sl] === 'messenger_post');

  const heroSlot        = () => slotOfUnit(heroRosterUnit());
  const heroNeedsArmour = () => {
    const hero = heroRosterUnit();
    return !!hero && !equippedItemFor(hero.id)
        && itemsCache.some(it => !it.equipped_by && isEquippableBy(it, hero));
  };
  const postBuilt = () =>
    structuresRecord?.buildings_data?.[MESSENGER_SLOT]?.building_id === 'messenger_post';

  const INFIRMARY_SLOT = Object.keys(SLOT_FIXED_BUILDING)
    .find(sl => SLOT_FIXED_BUILDING[sl] === 'infirmary');
  const infirmaryBuilt = () =>
    structuresRecord?.buildings_data?.[INFIRMARY_SLOT]?.building_id === 'infirmary';

  const ONBOARDING = [
    {
      id: 'throne_upgrade',
      awaits: true,
      ready:  () => (structuresRecord?.buildings_data?.slot_0?.level ?? 0) < 1,
      target: () => nodeForSlot('slot_0'),
    },
    {
      id: 'second_building',
      awaits: true,
      ready:  () => (structuresRecord?.buildings_data?.slot_0?.level ?? 0) >= 1
                 && rosterCount < 3 && !!firstFreeBarracksSlot(),
      target: () => nodeForSlot(firstFreeBarracksSlot()),
      hint:   () => firstRecruitHint(player),
    },
    {
      id: 'roster_intro',
      ready:  heroNeedsArmour,
      target: () => nodeForSlot(heroSlot()),
      // The tap opens the sheet through the node's own handler; the driver then
      // finds the next step already on screen.
      onTap:  () => afterSheetSettles(runOnboarding),
    },
    {
      id: 'roster_equip_slot',
      ready:  heroNeedsArmour,
      open:   () => openSlotUnitSheet(heroSlot()),
      target: () => getSheetBody()?.querySelector(`[data-item-slot][data-roster-id="${heroRosterUnit()?.id}"]`),
      // The same tap opens the item picker through the sheet's delegated
      // handler, which runs after this one — wait for the sub-sheet.
      onTap:  () => afterSheetSettles(runOnboarding, true),
    },
    {
      id: 'roster_equip',
      awaits: true,
      // Only once the picker is actually open, which the step above did.
      ready:  () => heroNeedsArmour() && !!equipButtonInPicker(),
      target: equipButtonInPicker,
    },
    {
      id: 'roster_equipped',
      ready:  () => { const h = heroRosterUnit(); return !!h && !!equippedItemFor(h.id); },
      open:   () => openSlotUnitSheet(heroSlot()),
      target: () => getSheetBody()?.querySelector(`[data-item-slot][data-roster-id="${heroRosterUnit()?.id}"]`),
      wait:   true,
    },
    {
      id: 'roster_passive_stack',
      ready:  () => !!heroRosterUnit(),
      open:   () => openSlotUnitSheet(heroSlot()),
      target: () => getSheetBody()?.querySelector('.unit-abilities-row'),
      wait:   true,
    },
    {
      id: 'spell_revive',
      awaits: true,
      ready:  () => !!slotWithBuilding(slotOfUnit(deadTutorialUnit())),
      open:   () => openSlotUnitSheet(slotOfUnit(deadTutorialUnit())),
      target: () => getSheetBody()?.querySelector('.resurrect-btn'),
    },
    {
      id: 'spell_heal',
      awaits: true,
      ready:  () => !!slotWithBuilding(slotOfUnit(woundedTutorialUnit())),
      open:   () => openSlotUnitSheet(slotOfUnit(woundedTutorialUnit())),
      target: () => getSheetBody()?.querySelector('.heal-btn'),
    },
    {
      id: 'upgrades_page',
      ready:  () => isTutorialDone(player, 'battle_done') && !postBuilt() && currentLayer !== 2,
      target: () => root.querySelector('#layer-next'),
      onTap:  () => { if (currentLayer !== 2) setLayer(2); afterSheetSettles(runOnboarding); },
    },
    {
      id: 'build_messenger_post',
      awaits: true,
      ready:  () => isTutorialDone(player, 'battle_done') && !postBuilt(),
      open:   () => setLayer(2),
      target: () => nodeForSlot(MESSENGER_SLOT),
    },
    // The second hall in the same page: the point is that this layer is a whole
    // shelf of buildings, not one tutorial button. The Infirmary is the one
    // worth raising immediately — without it wounds do not heal between
    // battles — and level 1 costs nothing, so this step can never wall.
    {
      id: 'build_infirmary',
      awaits: true,
      ready:  () => isTutorialDone(player, 'build_messenger_post') && !infirmaryBuilt(),
      open:   () => setLayer(2),
      target: () => nodeForSlot(INFIRMARY_SLOT),
    },
  ];

  // What a locked slot is waiting for. The verb is the whole message: a
  // building that does not exist yet must be BUILT, one that exists but is too
  // low must be UPGRADED, and telling a player to "build" something already
  // standing in their castle sends them looking for a slot to put it in.
  function openLockedPanel(req) {
    const def   = getBuildingDef(player.faction, req.building);
    const name  = buildingLabel(def) || req.building;
    const have  = buildingLevelIn(structuresRecord?.buildings_data, req.building);
    const build = have === 0;
    const title = build
      ? CASTLE_TEXT.lockedBuild[castleLang](name)
      : CASTLE_TEXT.lockedUpgrade[castleLang](name, req.level);
    const art   = buildingArtUrl(def);
    const desc  = castleLang === 'ru' ? (def?.desc_ru || def?.desc || '') : (def?.desc || '');
    const cost  = buildingCostForLevel(def, Math.max(1, have + 1));

    openModal(build ? CASTLE_TEXT.build[castleLang] : CASTLE_TEXT.upgrade[castleLang], `
      <div class="locked-panel">
        ${art ? `<img class="locked-panel-art" src="${art}" alt="${name}" onerror="this.style.display='none'">` : '<div class="locked-panel-icon">🔒</div>'}
        <div class="locked-panel-title">${title}</div>
        ${desc ? `<p class="locked-panel-desc">${desc}</p>` : ''}
        <div class="locked-panel-level">${CASTLE_TEXT.lockedLevel[castleLang](have, req.level)}</div>
        ${Object.keys(cost || {}).length
          ? `<div class="locked-panel-cost">${costLabelFor(cost)}</div>`
          : ''}
        ${slotForBuilding(req.building)
          ? `<button type="button" class="locked-panel-goto" data-goto-building="${req.building}">${CASTLE_TEXT.lockedGoto[castleLang]}</button>`
          : ''}
      </div>`);

    getSheetBody()?.querySelector('[data-goto-building]')
      ?.addEventListener('click', e => goToBuilding(e.currentTarget.dataset.gotoBuilding));
  }

  // Where a building lives, so the panel can take the player to it instead of
  // describing where to look. Layer 2 is a fixed ladder (SLOT_FIXED_BUILDING);
  // layer 1 is whatever the player has actually built, which is in the
  // structures record. Returns null when the building has no slot yet, and the
  // button is simply not offered.
  function slotForBuilding(buildingId) {
    if (!buildingId) return null;
    const fixed = Object.keys(SLOT_FIXED_BUILDING).find(k => SLOT_FIXED_BUILDING[k] === buildingId);
    if (fixed) return fixed;
    const data = structuresRecord?.buildings_data || {};
    return Object.keys(data).find(k => /^slot_\d+$/.test(k) && data[k]?.building_id === buildingId) || null;
  }

  // Close the panel, turn to the page the slot is on, and open the building —
  // the player asked for it by name, so make them tap once, not go hunting.
  //
  // The node is CLICKED rather than routed by hand: its handler already decides
  // between the reserved panel, a further locked requirement and the build
  // sheet, and a second copy of that branching here would drift from it. If the
  // building we jumped to is itself locked behind something, the player simply
  // gets the next panel in the chain, with its own button.
  //
  // `layerOf` reads the page from the slot number instead of assuming page 2,
  // which is what the sentence this replaced always claimed.
  function goToBuilding(buildingId) {
    const slot = slotForBuilding(buildingId);
    if (!slot) return;
    closeModal();
    setLayer(layerOf(slot));
    // After the page transition. Clicking mid-slide opens the right sheet but
    // scrolls to a node that is still moving, and the highlight lands on empty
    // ground.
    setTimeout(() => {
      const node = nodeForSlot(slot);
      if (!node) return;
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // Marked before the sheet opens so it is already pulsing underneath when
      // the player closes it, which is what shows them where it lives.
      node.classList.add('castle-node--found');
      setTimeout(() => node.classList.remove('castle-node--found'), 3000);
      node.click();
    }, 420);
  }

  function openReservedPanel() {
    openModal(CASTLE_TEXT.build[castleLang], `
      <div class="locked-panel">
        <div class="locked-panel-icon">🔒</div>
        <div class="locked-panel-title">${CASTLE_TEXT.slotReserved[castleLang]}</div>
        <p class="locked-panel-desc">${CASTLE_TEXT.slotReservedBody[castleLang]}</p>
      </div>`);
  }

  function firstFreeBarracksSlot() {
    const data = structuresRecord?.buildings_data || {};
    return buildingSlotKeys(data)
      .filter(sl => sl !== 'slot_0'
                 && layerOf(sl) === 1
                 && SLOT_CATEGORIES[sl] === 'barracks'
                 && !data[sl]?.building_id
                 && !slotLockedBy(data, sl))
      .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))[0] || null;
  }

  // A slot only counts if something is standing in it — openSlotUnitSheet
  // refuses an empty slot, and a step whose sheet never opens must be skipped
  // rather than left pointing at nothing.
  function slotWithBuilding(slot) {
    return slot && structuresRecord?.buildings_data?.[slot]?.building_id ? slot : null;
  }

  function equipButtonInPicker() {
    const buttons = [...(getSubSheetBody()?.querySelectorAll('.item-action-btn--equip:not([disabled])') || [])];
    return buttons.find(b => {
      const item = itemsCache.find(it => String(it.id) === String(b.dataset.itemId));
      return (item?.item_stats?.key || item?.item_stats?.icon) === STARTING_ITEM_KEY;
    }) || buttons[0] || null;
  }

  // The step the player has already acted on, waiting for that action to land.
  // Without it, ANY re-render between the tap and the result re-shows the step
  // the player just answered — and renderBuildings runs again the moment the
  // errand lookup resolves, a few hundred ms after the castle opens.
  let pendingStep = null;
  let shownStep   = null;
  onSheetClose(() => {
    // Backed out without finishing: the step is live again.
    if (pendingStep) { pendingStep = null; runOnboarding(); }
  });

  function runOnboarding() {
    // The castle's async work (the errand-id lookup, a bootstrap refresh) can
    // resolve after the player has left the screen. Without this the driver ran
    // on a dead screen, found nothing to teach, and hideTutorial()'d whatever
    // the NEXT screen had just put up — which is why the embark step vanished
    // the moment it appeared.
    if (!root.isConnected) return;
    if (onboardingBusy) return;
    for (const step of ONBOARDING) {
      if (isTutorialDone(player, step.id)) { if (pendingStep === step.id) pendingStep = null; continue; }
      if (pendingStep === step.id) return;
      if (!step.ready()) continue;
      const opened = !!step.open;
      step.open?.();
      const el = step.target();
      // Returning rather than continuing: a step that opened a sheet and then
      // found no target would otherwise fall through to the next step, which
      // opens ANOTHER sheet on top of it.
      if (!el) { if (opened) return; continue; }
      shownStep = step.id;
      showTutorialSpotlight(player, step.id, el, {
        resolveTarget: step.target,
        showContinue: !!step.wait,
        extraText:    step.hint?.(),
        onAdvance: () => {
          // Finished by its own Continue button.
          if (step.wait) { markTutorialDone(player, step.id); runOnboarding(); return; }
          // Finished by a server action (build, equip, spell): that handler
          // marks the flag. Held as pending meanwhile so a re-render cannot put
          // the step back up while the player is answering it.
          if (step.awaits) pendingStep = step.id;
          // Purely navigational (open a sheet, switch a page): the tap IS the
          // completion, so mark it here or it repeats forever.
          else markTutorialDone(player, step.id);
          step.onTap?.();
        },
      });
      return;
    }
    // Only tear down a spotlight that is actually finished. ready() goes
    // transiently false while a reload swaps rosterCache out, and hiding
    // unconditionally here killed the live step a fraction of a second after it
    // appeared.
    if (!shownStep || isTutorialDone(player, shownStep)) {
      shownStep = null;
      hideTutorial();
      maybeShowErrandsIntro(player);
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
    // Same declension rule as the roster copy: dative -у for the two masculine
    // names, and Асталот (feminine) stays as it is.
    empire:              { en: 'Devotion to Mithrail', ru: 'Молитва Митраилу' },
    choir_of_the_cursed: { en: 'Song to Aggrail',      ru: 'Песнь Агграилу' },
    grail_of_sorrow:     { en: 'Dirge to Astaloth',    ru: 'Плач Асталот' },
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

  // The overlay itself now lives in utils.js — the errands sheet runs the same
  // one for its reroll ad, and two copies of a countdown that has to agree with
  // the server's timer is one copy too many.
  const playAdPlaceholder = seconds => playAd(seconds, {
    badge:       CASTLE_TEXT.adBadge[castleLang],
    placeholder: CASTLE_TEXT.favorPlaceholder[castleLang],
    title:       CASTLE_TEXT.favorWatching[castleLang],
    cancel:      CASTLE_TEXT.favorCancel[castleLang],
  });

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

    // The Tome sits in the same overlay as Heal and Resurrect because it answers
    // the same question — "this unit is behind, fix it" — and because that is the
    // only place a player is already looking at ONE unit and deciding to spend on
    // it. Unlike those two it is shown ONLY when tomes are held: a button that is
    // permanently unaffordable teaches nothing, and unlike a spell there is no
    // shop to send anyone to.
    //
    // A dead unit is refused by the server, so it is not offered here either.
    const tomesHeld = tokenCount('tome_of_knowledge');
    const tomeHtml  = alive && tomesHeld > 0 ? `
        <button class="tome-btn" data-roster-id="${rosterUnit.id}">
          ${CASTLE_TEXT.tomeUse[castleLang]} (${tomesHeld})
        </button>` : '';

    if (!favorHtml && !resurrectHtml && !healHtml && !tomeHtml) return '';
    // ONE overlay holding favor + spell, stacked, so favor sits directly above
    // the spell button instead of the two being positioned independently.
    // A dead unit's button owns the middle of the card; a wounded one is still
    // playable, so --heal drops its buttons low and out of the way.
    return `
      <div class="unit-card-overlay unit-card-overlay--actions ${alive ? 'unit-card-overlay--heal' : ''}">
        ${favorHtml}
        ${resurrectHtml}
        ${healHtml}
        ${tomeHtml}
      </div>`;
  }

  // ── Evolution tree ────────────────────────────────────────────────────────
  // Read-only for now: the whole line the unit belongs to, on a 5x5 grid, with
  // the unit's own branch highlighted. `upgradePaths` is the server's
  // UNIT_UPGRADE_PATHS, delivered on the buildings bootstrap (see line ~178).
  // Only units that actually sit on the faction's upgrade map get a button.
  // Mercenaries advance through their own table (getMercUpgradePaths) and are
  // absent from this one, so without the check they would open a one-cell tree.
  // Mercenaries are not in UNIT_UPGRADE_PATHS — they live in MERCENARY_BUILDINGS,
  // keyed by region, and carry their chain as building ids in `upgrades`. This
  // reshapes a region's pool into the same { unitId: [{ unit_id, building_id,
  // label }] } map the tree renderer already understands, so a merc gets the
  // same upgrade tree as anyone else. Without it hasTreeLine never matched a
  // merc, the ⑂ button was never drawn, and a recruited mercenary was the one
  // unit in the game whose line you could not look at.
  function mercTreePaths() {
    const out = {};
    for (const pool of Object.values(mercenaryBuildings || {})) {
      for (const b of pool) {
        if (!b.upgrades?.length) continue;
        const steps = b.upgrades
          .map(uid => pool.find(x => x.id === uid))
          .filter(Boolean)
          .map(next => ({ unit_id: next.unit_id, building_id: next.id, label: next.label, label_ru: next.label_ru }));
        if (steps.length) out[b.unit_id] = steps;
      }
    }
    return out;
  }

  // The faction's own paths, plus the mercenary ones. A unit id belongs to
  // exactly one of the two, so a plain merge cannot collide.
  function treePathsFor(unitId) {
    const factionPaths = (upgradePaths || {})[player.faction] || {};
    const inFaction = factionPaths[unitId]
      || Object.values(factionPaths).some(list => (list || []).some(p => p.unit_id === unitId));
    return inFaction ? factionPaths : mercTreePaths();
  }

  function hasTreeLine(unitId) {
    if (!unitId) return false;
    const paths = treePathsFor(unitId);
    if (paths[unitId]) return true;
    return Object.values(paths).some(list => (list || []).some(p => p.unit_id === unitId));
  }

  function treeButtonHtml(unitId) {
    if (!hasTreeLine(unitId)) return '';
    const label = CASTLE_TEXT.treeTitle[castleLang];
    return `<button class="ability-icon ability-icon--tree" id="unit-tree-btn" data-tree-unit="${unitId}"
                    title="${label}" aria-label="${label}">⑂</button>`;
  }

  function openUnitTreeSheet(unitId) {
    const paths = treePathsFor(unitId);
    const tree  = buildUnitTree(paths, unitId, getUnitByUnitId);
    const html  = renderUnitTreeHtml(tree, {
      currentId:   unitId,
      pathIds:     lineageTo(paths, unitId),
      portraitUrl: (id, unitDef) => branchPortraitUrl(unitDef || { id }),
      nameOf:      unitDef => unitName(unitDef) || unitDef?.id || '',
      emptyLabel:  CASTLE_TEXT.treeEmpty[castleLang],
    });
    openSubSheet(CASTLE_TEXT.treeTitle[castleLang], html);

    // Everything happens inside this one sheet — it is the last modal level, so
    // there is nowhere to open a card or an ability into. Instead the sheet has
    // two states and the grid never leaves the screen:
    //
    //   grid state    the 5x5 at full size, no card
    //   detail state  the grid shrinks to a strip of portraits, the unit card
    //                 opens under it
    //
    // Tapping a portrait enters the detail state. Tapping the SAME portrait
    // again leaves it. Tapping a different one swaps the card without expanding,
    // so stepping along a line stays one tap per unit.
    const treeRoot = getSubSheetBody()?.querySelector('.utree-root');
    if (!treeRoot) return;

    // The connectors are measured from the laid-out grid, so they are drawn
    // after it exists and again whenever it changes size — the detail state
    // squashes the cells to a strip, and the sheet itself can be resized. A
    // ResizeObserver covers both without the toggle handlers having to remember
    // to redraw. It is torn down with the grid it observes.
    const treeGrid = treeRoot.querySelector('.utree');
    if (treeGrid) {
      // Self-cleaning: the sub-sheet has no close hook of its own, and this
      // sheet can be opened many times within one parent sheet, so the observer
      // retires itself the moment its grid leaves the document rather than
      // piling up one per open.
      const ro = new ResizeObserver(() => {
        if (!treeGrid.isConnected) { ro.disconnect(); return; }
        drawUnitTreeLinks(treeRoot);
      });
      drawUnitTreeLinks(treeRoot);
      // Portraits load after first paint and can change the row heights.
      treeRoot.querySelectorAll('.utree-portrait').forEach(img => {
        if (!img.complete) {
          img.addEventListener('load', () => drawUnitTreeLinks(treeRoot), { once: true });
        }
      });
      ro.observe(treeGrid);
    }
    const byId = new Map(tree.nodes.map(n => [n.id, n]));
    let openId = null;

    const closeAbility = () => {
      const box = treeRoot.querySelector('#utree-ability');
      if (box) { box.innerHTML = ''; box.classList.remove('utree-ability--open'); }
    };

    const collapseDetail = () => {
      openId = null;
      treeRoot.classList.remove('utree-root--detail');
      treeRoot.querySelectorAll('.utree-cell--selected')
        .forEach(el => el.classList.remove('utree-cell--selected'));
      const detail = treeRoot.querySelector('#utree-detail');
      if (detail) detail.innerHTML = '';
      closeAbility();
    };

    const showNode = id => {
      const node = byId.get(id);
      if (!node?.def) return;
      openId = id;
      closeAbility();
      // Deltas are against the PARENT, so each card answers "what does this one
      // step buy me" — the question a tree is read with. Comparing against the
      // player's current unit instead would paint their own past path red.
      const parent = node.parentId ? byId.get(node.parentId)?.def : null;

      treeRoot.classList.add('utree-root--detail');
      treeRoot.querySelectorAll('.utree-cell--selected')
        .forEach(el => el.classList.remove('utree-cell--selected'));
      treeRoot.querySelector(`.utree-cell[data-unit-id="${id}"]`)?.classList.add('utree-cell--selected');

      const detail = treeRoot.querySelector('#utree-detail');
      if (detail) detail.innerHTML = buildUnitCard(node.def, { compareUnit: parent });
    };

    // Ability and passive icons on the card open INLINE, under it. The sheet
    // stack is full, so the alternative was leaving them inert — which is what
    // they were, and it read as broken art rather than as a deliberate limit.
    const toggleAbility = (key, type) => {
      const box = treeRoot.querySelector('#utree-ability');
      if (!box) return;
      if (box.dataset.key === key && box.classList.contains('utree-ability--open')) {
        closeAbility();
        box.dataset.key = '';
        return;
      }
      const def = resolveAbility(key);
      if (!def) return;
      const parts = buildAbilityModalParts(def, type || 'passive');
      box.dataset.key = key;
      box.innerHTML = `
        <div class="utree-ability-head">
          <span class="utree-ability-title">${parts.title}</span>
          <span class="modal-header-badges">${parts.badges}</span>
        </div>
        ${parts.body}`;
      box.classList.add('utree-ability--open');
      box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    treeRoot.addEventListener('click', e => {
      const abilityBtn = e.target.closest('.utree-detail .ability-icon[data-ability-key]');
      if (abilityBtn) {
        const key = abilityBtn.dataset.abilityKey;
        if (key) toggleAbility(key, abilityBtn.dataset.abilityType);
        return;
      }
      const cell = e.target.closest('.utree-cell[data-unit-id]');
      if (!cell) return;
      const id = cell.dataset.unitId;
      if (id === openId) collapseDetail();
      else showNode(id);
    });

    // Opens showing the TREE, not a card: the sheet was asked for to see the
    // line. The unit you came from already carries its own ring (currentId), so
    // tapping it is the obvious first move and opens its card like any other.
  }

  // ── Slot unit sheet ───────────────────────────────────────────────────────
  // Tapping a built slot used to drop straight into the upgrade branch picker.
  // It now opens the UNIT standing in that slot — its real roster row, with the
  // item it carries — and upgrading is a deliberate second step behind its own
  // button. The slot is the unit's home, so this is where you manage it.
  // `initialMode` is 'inspect' unless a caller has a reason to land straight in
  // the upgrade sequence. Inspect is the default because tapping a slot is how
  // a player looks at their unit, and this sheet used to open mid-upgrade with
  // the first branch already selected — showing them somebody else's portrait.
  function openSlotUnitSheet(slot, initialMode = 'inspect') {
    const state = structuresRecord.buildings_data[slot];
    if (!state?.building_id) return;

    const mercDef = getMercBuildingDef(state.building_id);
    const def     = mercDef || getBuildingDef(player.faction, state.building_id);
    if (!def) { openModal('Error', '<p class="modal-empty">Building definition not found.</p>'); return; }

    const rosterUnit = rosterUnitForSlot(slot);
    const item       = rosterUnit ? equippedItemFor(rosterUnit.id) : null;

    // Ask the OCCUPANT what it can become, not the building. The two can sit a
    // tier apart — a slot holding the tier 4 keep with a tier 3 unit still in it
    // asked the keep, which is terminal, and the unit was told it was max tier
    // with its real upgrade sitting right there. The building is only the
    // fallback, for a slot whose unit has not spawned yet.
    const paths = upgradePathsForSlotUnit(rosterUnit, mercDef, def, slot);

    // Prefer the roster row: it carries current HP/XP and can hold an item. A
    // slot with no occupant yet (building raised, unit not spawned) still shows
    // the blueprint so the sheet is never empty.
    const baseUnit = rosterUnit ? resolveUnitDef(rosterUnit) : getUnitByUnitId(def.unit_id);
    const liveUnit = rosterUnit && item ? withEquippedItem(baseUnit, item) : baseUnit;

    // The card was showing the BLUEPRINT's numbers: full HP whatever state the
    // unit was really in, and `XP 720` — which is the XP this tier COSTS, not
    // what the unit has earned. Both live on the roster row, so they are derived
    // here the way the roster screen derived them, item bonus included.
    const progress = progressForSlot(slot, paths);

    const itemSlotHtml = rosterUnit
      ? renderItemSlotIcon(item, rosterUnit.id, { player })
      : '';

    // Evolution tree. Opened as a SUB-sheet so the unit sheet underneath stays
    // where it was — closing the tree returns to the unit, not to the castle.
    const treeUnitId  = baseUnit?.id || null;
    const treeBtnHtml = treeButtonHtml(treeUnitId);

    const canUpgrade = paths && paths.length > 0;

    // Same-tier siblings. Respec used to live behind the Deconstruct pickaxe,
    // beside "the unit is destroyed for good" — but it is not destructive: same
    // tier, keeps the unit's XP, costs a fraction of the new building. It is the
    // same question upgrading asks (what does this slot become?), so it belongs
    // in the same place, and Deconstruct is left holding only Demolish.
    const respecOptions = respecOptionsFor(state.building_id) || [];
    // Offered in the SAME list as free siblings, marked, and priced with the
    // Sigil on top. A separate tab would hide that these are the same decision —
    // "what does this slot become?" — asked one fork higher up.
    const sigilOptions  = crossBranchOptionsFor(state.building_id) || [];
    const sigilsHeld    = tokenCount('crossroad_sigil');
    const canRespec     = respecOptions.length > 0 || sigilOptions.length > 0;

    // Paths are keyed by the unit they lead to — except a layer-2 building
    // levels IN PLACE and leads to no unit at all, so `unit_id` is null and
    // every one of them keyed as "null": same key, blank card, no price. The
    // building id is the fallback key.
    const pathKey = pth => pth.unit_id ?? pth.building_id;

    // "Infirmary" on a sheet that is offering Infirmary level 2 tells the player
    // nothing about what the button does. Levelled buildings carry the level
    // they are being raised TO.
    const slotLevel = structuresRecord.buildings_data[slot]?.level ?? 0;
    const levelLabelFor = (bDef, level) => {
      const base = buildingLabel(bDef) || '';
      if (!bDef || buildingMaxLevel(bDef.id) <= 1) return base;
      return `${base} · ${CASTLE_TEXT.levelWord[castleLang]} ${level}`;
    };

    const isThrone  = def.category === 'throne';
    const nextLevel = slotLevel + 1;

    // The two segments of the upgrade mode, flattened into one shape so the
    // track, the preview and the price all read from the same list and the
    // segment is only a filter. `kind` is the one thing the confirm needs.
    function choicesFor(segment) {
      if (segment === 'respec') {
        return [
          ...respecOptions.map(o => ({
            kind: 'respec',
            key: o.id,
            buildingId: o.id,
            unit: getUnitByUnitId(o.unit_id),
            def: o,
            cost: respecCostFor(o.id, slotLevel),
          })),
          // A Sigil option costs the same resources PLUS one token, so it can
          // still be refused for the ordinary reason (no gold) as well as the
          // new one (no Sigil). Both are checked at confirm.
          ...sigilOptions.map(o => ({
            kind: 'respec',
            key: o.id,
            buildingId: o.id,
            unit: getUnitByUnitId(o.unit_id),
            def: o,
            cost: respecCostFor(o.id, slotLevel),
            needsSigil: true,
          })),
        ];
      }
      return (paths || []).map(pth => ({
        kind: 'advance',
        key: pathKey(pth),
        buildingId: pth.building_id,
        unit: getUnitByUnitId(pth.unit_id),
        def: getBuildingDef(player.faction, pth.building_id),
        path: pth,
        // Mercenaries are priced in trophies; a throne by the LEVEL it moves to
        // rather than by the building, which is why they come from different
        // tables (mirrors openUpgradeModal and POST /structures/build).
        cost: mercDef  ? (getMercBuildingDef(pth.building_id)?.cost ?? pth.cost ?? null)
            : isThrone ? (throneUpgradeCosts[nextLevel] || null)
            : buildingCostForLevel(getBuildingDef(player.faction, pth.building_id), nextLevel),
      }));
    }

    // A Sigil option is marked in the label itself. It sits in the same list as
    // the free sibling swaps, and without the mark the two are indistinguishable
    // until the confirm refuses one of them.
    const labelForChoice = c => {
      const base = unitName(c.unit) || levelLabelFor(c.def, c.kind === 'respec' ? slotLevel : nextLevel);
      return c.needsSigil ? `✦ ${base}` : base;
    };

    // Why the arrow is dim, in the player's terms. A unit with no build to do
    // but a tier still ahead is waiting on XP, not finished — two different
    // situations that must not read the same.
    const idleHint = canUpgrade
      ? CASTLE_TEXT.upgradeOpen[castleLang]
      : (progress?.xp && !progress.xp.maxed && progress.xp.req > 0
          ? CASTLE_TEXT.awaitingXp[castleLang].replace('%s', progress.xp.req)
          : CASTLE_TEXT.maxed[castleLang]);

    const actionOverlayHtml = rosterUnit ? unitActionOverlay(rosterUnit) : '';

    // The action row, per mode. INSPECT is what the sheet opens in: the unit,
    // and one arrow that starts the upgrade sequence. The branch shelf and the
    // confirm used to be on screen the moment a slot was tapped, with the first
    // branch ALREADY SELECTED — so going to look at a unit showed you the next
    // one instead, which is what made inspecting feel like upgrading.
    // INSPECT is three plain actions — Upgrade, Respec, Demolish — each opening
    // its own sequence. They were briefly a pair of pill tabs above the track,
    // which buried two of the three choices behind a mode the player had to
    // enter before they could see it.
    //
    // Each is dim when it has nothing to offer rather than absent: a control
    // that appears and disappears moves the ones beside it, and the player never
    // learns where anything lives.
    function actionRowHtml(mode, segment) {
      if (mode === 'inspect') {
        // The reason an upgrade is unavailable rides on the button's own tooltip.
        // It briefly had a line of its own above the row, which added height to
        // every sheet to explain a case most of them are not in.
        const upgradeLabel = canUpgrade ? CASTLE_TEXT.upgradeOpen[castleLang] : idleHint;
        return `
          <div class="track-action-row track-action-row--framed">
            <button class="frame-action frame-action--confirm ${canUpgrade ? '' : 'frame-action--inert'}"
                    id="slot-to-upgrade" ${canUpgrade ? '' : 'disabled'}
                    title="${upgradeLabel}"
                    aria-label="${upgradeLabel}">⚒</button>
            <button class="frame-action ${canRespec ? '' : 'frame-action--inert'}"
                    id="slot-to-respec" ${canRespec ? '' : 'disabled'}
                    title="${CASTLE_TEXT.changeBranch[castleLang]}"
                    aria-label="${CASTLE_TEXT.changeBranch[castleLang]}">⇄${
              // How the player learns Sigils exist at all: a count on the very
              // button they are spent from, shown only when they hold some AND
              // this slot could actually use one. There is no room in the
              // resource bar and they do not deserve a screen of their own.
              sigilsHeld > 0 && sigilOptions.length
                ? `<span class="frame-action-badge" title="${CASTLE_TEXT.sigilName[castleLang]}">${sigilsHeld}</span>`
                : ''
            }</button>
            <button class="frame-action frame-action--deconstruct" id="slot-deconstruct"
                    title="${CASTLE_TEXT.demolish[castleLang]}"
                    aria-label="${CASTLE_TEXT.demolish[castleLang]}">⛏</button>
          </div>`;
      }

      const cards = choicesFor(segment).map(c => {
        const label = labelForChoice(c);
        const url   = c.unit ? branchPortraitUrl(c.unit) : buildingArtUrl(c.def);
        return `
          <div class="portrait-card portrait-card--branch" data-path-key="${c.key}" title="${label}">
            ${url ? `<img class="portrait-art-img" src="${url}" alt="${label}" onerror="this.style.display='none'">` : ''}
          </div>`;
      }).join('');

      // Which sequence you are in is already answered by the portraits on the
      // track — same-tier siblings or the tier above — so it does not need a
      // chooser restating it. The confirm keeps the castle's build icon; this is
      // still the button that spends resources on a slot.
      const confirmLabel = segment === 'respec'
        ? CASTLE_TEXT.changeBranch[castleLang]
        : CASTLE_TEXT.upgradeOpen[castleLang];

      return `
        <div class="track-action-row track-action-row--framed">
          <button class="frame-action frame-action--confirm" id="slot-confirm" disabled
                  title="${confirmLabel}" aria-label="${confirmLabel}">⚒</button>
          ${cards
            ? `<div class="prep-track-wrap branch-track-wrap">
                 <div class="portrait-track" id="slot-upgrade-track">${cards}</div>
               </div>`
            : `<span class="castle-slot-maxed">${CASTLE_TEXT.noOptions[castleLang]}</span>`}
          <button class="frame-action" id="slot-back"
                  title="${CASTLE_TEXT.backToUnit[castleLang]}"
                  aria-label="${CASTLE_TEXT.backToUnit[castleLang]}">←</button>
        </div>`;
    }

    // Wrapper is not cosmetic: openSheet only replaces the body's innerHTML, so
    // the body element itself survives across opens and a listener bound to it
    // would accumulate — re-opening the sheet twice would fire equip twice.
    // Binding to this div instead ties the listener's life to the content.
    const cardHtml = `
      <div class="castle-unit-card-wrap">
        ${buildUnitCard(liveUnit, {
          buildingLabel: levelLabelFor(def, slotLevel),
          itemSlotHtml, extraSlotHtml: treeBtnHtml, progress,
          artUrl: liveUnit ? '' : buildingArtUrl(def),
          desc:   liveUnit ? '' : (castleLang === 'ru' ? (def.desc_ru || def.desc || '') : (def.desc || '')),
        })}
        ${actionOverlayHtml}
      </div>`;

    let mode    = (canUpgrade || canRespec) ? initialMode : 'inspect';
    let segment = canUpgrade ? 'advance' : 'respec';

    openModal(levelLabelFor(def, slotLevel), `
      <div id="slot-sheet-root">
        ${cardHtml}
        <div id="slot-action-row">${actionRowHtml(mode, segment)}</div>
      </div>`);

    const body     = getSheetBody()?.querySelector('#slot-sheet-root');
    const cardWrap = body?.querySelector('.castle-unit-card-wrap');
    const ownCardHtml = cardWrap?.innerHTML ?? '';
    let selectedKey = null;

    // Re-render the ROW only, leaving the card alone: switching segment or going
    // back must never disturb the unit on show above it.
    function renderRow() {
      const host = body?.querySelector('#slot-action-row');
      if (!host) return;
      host.innerHTML = actionRowHtml(mode, segment);
      bindRow();
    }

    function showOwnUnit() {
      selectedKey = null;
      if (cardWrap) cardWrap.innerHTML = ownCardHtml;
      const confirmBtn = body?.querySelector('#slot-confirm');
      if (confirmBtn) confirmBtn.disabled = true;
      hideCostBar();
      body?.querySelectorAll('#slot-upgrade-track .portrait-card')
          .forEach(c => c.classList.remove('portrait-card--selected'));
    }

    function showChoice(card) {
      const key = card.dataset.pathKey;
      const c   = choicesFor(segment).find(x => String(x.key) === key);
      if (!c) return;
      selectedKey = key;
      body.querySelectorAll('#slot-upgrade-track .portrait-card')
          .forEach(el => el.classList.toggle('portrait-card--selected', el === card));
      const confirmBtn = body?.querySelector('#slot-confirm');
      if (confirmBtn) confirmBtn.disabled = false;

      if (cardWrap && !c.unit) {
        // A building with no unit still previews: its own art, its blurb, and
        // the level it is being raised to.
        cardWrap.innerHTML = buildUnitCard(null, {
          buildingLabel: levelLabelFor(c.def, nextLevel),
          artUrl: buildingArtUrl(c.def),
          desc:   castleLang === 'ru' ? (c.def?.desc_ru || c.def?.desc || '') : (c.def?.desc || ''),
          itemSlotHtml,
        }) + actionOverlayHtml;
      } else if (cardWrap) {
        // compareUnit is the unit as it stands NOW (item included), so every
        // stat delta and the +N on a ranked-up ability read against what the
        // player actually owns rather than against the blueprint.
        cardWrap.innerHTML = buildUnitCard(c.unit, {
          buildingLabel: labelForChoice(c),
          compareUnit:   liveUnit,
          itemSlotHtml,
          extraSlotHtml: treeButtonHtml(c.unit.id),
          // The REAL bars, not a placeholder. The unit standing in this slot
          // still has the HP and XP it had a moment ago — browsing a branch
          // does not change them — so the rows carry true numbers and, being
          // the same rows, cannot change height between the two cards.
          progress,
        }) + actionOverlayHtml;
      }
      showCostBar(c.cost);
    }

    function confirmChoice() {
      if (!selectedKey) return;
      const c = choicesFor(segment).find(x => String(x.key) === selectedKey);
      if (!c) return;

      if (c.kind === 'respec') {
        if (c.needsSigil && tokenCount('crossroad_sigil') < 1) {
          alert(CASTLE_TEXT.needSigil[castleLang]);
          return;
        }
        if (!canAffordCost(c.cost)) {
          alert(`${CASTLE_TEXT.cannotAfford[castleLang]} ${costLabelFor(c.cost)}`);
          return;
        }
        performRespec(slot, c.buildingId);
        return;
      }

      if (mercDef) {
        // Mercenaries are priced in trophies, and their roster row is found by
        // region + unit rather than by slot.
        const short = Object.entries(c.cost || {}).some(([item, amt]) => amountOf(item) < amt);
        if (short) { alert(CASTLE_TEXT.notEnough[castleLang]); return; }
        const currentUnit = getUnitByUnitId(mercDef.unit_id);
        const rosterEntry = rosterCache.find(r =>
          r.unit_data?.mercenary &&
          r.unit_data?.mercenary_region === mercDef.region &&
          r.unit_data?.id === currentUnit?.id);
        performMercenaryUpgrade(c.buildingId, slot, rosterEntry?.id);
        return;
      }

      if (!canAffordCost(c.cost)) {
        alert(`${CASTLE_TEXT.cannotAfford[castleLang]} ${costLabelFor(c.cost)}`);
        return;
      }
      performBuildingUpgrade(slot, c.buildingId);
    }

    function bindRow() {
      body?.querySelector('#slot-to-upgrade')?.addEventListener('click', () => {
        mode = 'upgrade';
        segment = 'advance';
        renderRow();
      });
      body?.querySelector('#slot-back')?.addEventListener('click', () => {
        mode = 'inspect';
        showOwnUnit();
        renderRow();
      });
      body?.querySelector('#slot-to-respec')?.addEventListener('click', () => {
        mode = 'upgrade';
        segment = 'respec';
        renderRow();
      });
      body?.querySelectorAll('#slot-upgrade-track .portrait-card').forEach(card => {
        card.addEventListener('click', () => {
          if (selectedKey === card.dataset.pathKey) showOwnUnit();
          else                                      showChoice(card);
        });
      });
      // ONE button. Picking a branch already swaps the card to what it leads to
      // and puts its price on the cost bar, so everything a confirmation dialog
      // would re-show is on screen before this is pressed.
      body?.querySelector('#slot-confirm')?.addEventListener('click', confirmChoice);
      body?.querySelector('#slot-deconstruct')?.addEventListener('click', () => openDeconstructModal(slot));

      // Inside the sequence, open with the first option already chosen — there
      // the player has said they are upgrading, so an inert row is a wasted tap.
      // In INSPECT it must never happen: that is the thing that made looking at
      // a unit show somebody else's portrait.
      if (mode === 'upgrade' && !selectedKey && !onboardingBusy) {
        const firstCard = body?.querySelector('#slot-upgrade-track .portrait-card');
        if (firstCard) showChoice(firstCard);
      }
    }

    body?.addEventListener('click', e => {
      // Before handleUnitInspect: the tree button is an .ability-icon by shape,
      // so the generic inspector would swallow it looking for an ability key.
      // Reads the id off the BUTTON, not the closed-over one: the card is
      // swapped for an upgrade preview while browsing branches, and the tree
      // has to follow whichever unit is currently on show.
      const treeBtn = e.target.closest('#unit-tree-btn');
      if (treeBtn) { openUnitTreeSheet(treeBtn.dataset.treeUnit || treeUnitId); return; }

      // Stat / ability / resist inspection, same as every other unit card.
      if (handleUnitInspect(e, openAbilityModal)) return;

      const itemSlot = e.target.closest('[data-item-slot]');
      if (itemSlot) { openSlotItemPicker(slot, itemSlot.dataset.rosterId); return; }

      const favorBtn = e.target.closest('.favor-btn:not([disabled])');
      if (favorBtn) { runFavor(slot, favorBtn.dataset.rosterId); return; }

      const tomeBtn = e.target.closest('.tome-btn');
      if (tomeBtn) { useTome(tomeBtn.dataset.rosterId, rosterUnit); return; }

      const resurrectBtn = e.target.closest('.resurrect-btn');
      const healBtn      = e.target.closest('.heal-btn');
      if (resurrectBtn || healBtn) {
        const btn  = resurrectBtn || healBtn;
        const path = resurrectBtn ? '/roster/resurrect' : '/roster/heal';
        btn.disabled    = true;
        btn.textContent = resurrectBtn
          ? CASTLE_TEXT.resurrecting[castleLang]
          : CASTLE_TEXT.healing[castleLang];
        // Read BEFORE the await: reloadFromBootstrap re-renders the castle, and
        // this button — with its dataset — is gone by the time the call returns.
        const rosterId = btn.dataset.rosterId;
        const spellId  = btn.dataset.spellId;
        // The revive and heal onboarding steps are `awaits` steps: runOnboarding
        // holds them pending and the handler that does the work marks the flag,
        // or the spotlight sits on a button the player has already pressed.
        const stepId = resurrectBtn ? 'spell_revive' : 'spell_heal';
        (async () => {
          try {
            const res = await api(path, { chat_id: player.chat_id, roster_id: rosterId, spell_id: spellId });
            if (!isTutorialDone(player, stepId)) {
              markTutorialDone(player, stepId);
              hideTutorial();
            }
            const patched = res?.roster
              ? bootstrapCache.patch(cur => ({
                  roster: (cur.roster || []).map(r => String(r.id) === String(res.roster.id) ? res.roster : r),
                  ...(res.resources ? { resources: res.resources } : {}),
                }))
              : null;
            await reloadFromBootstrap(null, patched);
            openSlotUnitSheet(slot);
          } catch (err) {
            alert(err?.message || String(err));
            btn.disabled = false;
          }
        })();
      }
    });

    bindRow();

    // The cost bar lives outside the sheet, so it has to be torn down with it —
    // however the sheet closes.
    onSheetClose(hideCostBar);
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
    // abilityName, not def.name — the Russian name lives on the definition as
    // name_ru, so reading .name left item passives in English.
    const label = abilityName(def) || String(key).split(' ')[0].replace(/_/g, ' ');
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
                <img src="${assetUrl(`/assets/icons/items/${iconId}.png`)}" alt="${itemName(it, player)}"
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
            <img class="portrait-art-img" src="${assetUrl(`/assets/icons/items/${icon}.png`)}" alt="${name}"
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
      if (teachingEquip) onboardingBusy = true;
      try {
        const res = equipBtn
          ? await api('/items/equip', {
              chat_id: player.chat_id,
              roster_id: equipBtn.dataset.rosterId,
              item_id: equipBtn.dataset.itemId,
            })
          : await api('/items/unequip', { chat_id: player.chat_id, item_id: unequipBtn.dataset.itemId });
        // Both endpoints hand back the full item list and the updated roster
        // row, so there is nothing left to go and read.
        const patched = res?.items
          ? bootstrapCache.patch(cur => ({
              items:  res.items,
              roster: res.roster
                ? (cur.roster || []).map(r => String(r.id) === String(res.roster.id) ? res.roster : r)
                : cur.roster,
            }))
          : null;
        await reloadFromBootstrap(null, patched);
        closeSubSheet();
        openSlotUnitSheet(slot);   // re-open so the card shows the new loadout
        if (teachingEquip) {
          markTutorialDone(player, 'roster_equip');
          const rosterId = equipBtn.dataset.rosterId;
          afterSheetSettles(() => { onboardingBusy = false; runOnboarding(); });
        }
      } catch (err) {
        btn.disabled   = false;
        onboardingBusy = false;
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
  // Demolish only. Respec used to sit here too, one button above "the unit is
  // destroyed for good" — but it is the least destructive thing in the castle:
  // same tier, the unit keeps its XP, and it costs a fraction of the new
  // building. It now lives in the upgrade sequence on the unit sheet, beside
  // Advance, because both answer the same question about what a slot becomes.
  function openDeconstructModal(slot) {
    const state = structuresRecord.buildings_data[slot];
    if (!state?.building_id) return;
    const def      = getBuildingDef(player.faction, state.building_id);
    const isThrone = slot === 'slot_0';
    const ru = castleLang === 'ru';

    openModal(ru ? 'Разбор' : 'Deconstruct', `
      <div class="deconstruct-body">
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

    getSheetBody()?.querySelector('#deconstruct-clear')?.addEventListener('click', () => {
      confirmAndClear(slot, def);
    });
  }


  // Six of these exist in the whole game. Confirmed before spending, by name, so
  // it cannot go on the wrong unit with one stray tap on a crowded card.
  async function useTome(roster_id, rosterUnit) {
    const name = unitName(getUnitByUnitId(rosterUnit?.unit_data?.unit_id)) || '';
    if (!confirm(CASTLE_TEXT.tomeConfirm[castleLang].replace('%s', name))) return;
    try {
      await api('/roster/tome', { chat_id: player.chat_id, roster_id });
      closeModal();
      // The XP may have levelled the unit, which changes the building track and
      // what the slot can now build — the same reason a build reloads.
      await reloadFromBootstrap();
    } catch (err) {
      alert(err.message || 'Could not use the Tome');
    }
  }

  async function performRespec(slot, building_id) {
    try {
      const result = await api('/structures/respec', { chat_id: player.chat_id, slot, building_id });
      closeModal();
      // Respec replaces the UNIT standing in the slot, so the roster is stale
      // here for the same reason it is after a build — the node would keep the
      // old portrait until the screen was re-mounted.
      await reloadFromBootstrap(result.structures);
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
            ? `Снести «${buildingLabel(def)}»? Боец из этого здания будет удалён навсегда.`
            : `Demolish ${buildingLabel(def) || 'this building'}? Its unit is deleted permanently.`}
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
        closeModal();
        // Demolishing deletes the slot's unit and returns its gear to the stash,
        // so roster and items are both stale — not just the structures.
        await reloadFromBootstrap(result.structures);
        refreshNavLock(player).catch(() => {});
      } catch (err) {
        alert(err.message || 'Demolish failed');
      }
    });
    document.body.appendChild(overlay);
  }

  function openBuildModal(slot) {
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

    // Layer 2 is a fixed ladder: each slot accepts exactly the one building
    // named for it, and a slot with none named accepts NOTHING — it is reserved
    // for content that does not exist yet. Falling back to the category pool
    // there offered the Mercenary Hall in all four mercenary slots.
    const fixedBuilding = SLOT_FIXED_BUILDING[slot];
    if (layerOf(slot) === 2) {
      available = fixedBuilding ? available.filter(b => b.id === fixedBuilding) : [];
    }

    if (!available.length) {
      openModal(CASTLE_TEXT.build[castleLang],
        `<p class="modal-empty">${CASTLE_TEXT.noBuildings[castleLang]}</p>`);
      return;
    }

    // "Choose Unit" is the barracks question. A building that recruits nobody —
    // the Mercenary Hall, Barracks II — is not a unit choice, and titling its
    // sheet that way asked the player to pick a soldier from a list of halls.
    const recruits = available.some(b => b.unit_id);
    openSliderModal(slot === 'slot_0'
      ? CASTLE_TEXT.beginReign[castleLang]
      : recruits
        ? CASTLE_TEXT.chooseUnit[castleLang]
        : CASTLE_TEXT.build[castleLang],
      available.map(b => {
        const costText = slot === 'slot_0' ? '' : costLabelFor(b.cost);
        return {
          unit:          getUnitByUnitId(b.unit_id),
          buildingLabel: buildingLabel(b),
          confirmLabel:  costText
            ? `${CASTLE_TEXT.build[castleLang]} · ${buildingLabel(b)} (${costText})`
            : `${CASTLE_TEXT.build[castleLang]} ${buildingLabel(b)}`,
          artUrl:        buildingArtUrl(b),
          desc:          castleLang === 'ru' ? (b.desc_ru || b.desc || '') : (b.desc || ''),
          buildingId:    b.id,
          placeholder:   !!b.placeholder,
          cost:          b.cost,
          affordable:    slot === 'slot_0' || b.placeholder || canAffordCost(b.cost),
          slot,
        };
      }),
      s => {
        if (s.placeholder) { openPlaceholderModal(s.buildingId); return; }
        if (s.affordable === false) { alert(`${CASTLE_TEXT.cannotAfford[castleLang]} ${costLabelFor(s.cost)}`); return; }
        performBuildingUpgrade(s.slot, s.buildingId);
      },
      // The throne sheet is the first sheet anyone sees, and the ⚒ that raises
      // it reads as decoration until you have used it once. The arrow points at
      // it for that one build and never again.
      { hintConfirm: slot === 'slot_0' && (structuresRecord?.buildings_data?.slot_0?.level ?? 0) < 1 }
    );
  }

  async function openMercUpgradeModal(slot, def, paths, startIndex = 0) {
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

    openSliderModal(buildingLabel(def),
      paths.map(path => {
        const nextUnit = getUnitByUnitId(path.unit_id);
        return {
          unit:           nextUnit,
          buildingLabel:  unitName(nextUnit) || buildingLabel(path),
          confirmLabel:   CASTLE_TEXT.upgradeCost[castleLang](unitName(nextUnit) || buildingLabel(path), costLabel(path.cost)),
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
      { deconstructSlot: slot, startIndex }
    );
  }

  function openUpgradeModal(slot, def, paths, startIndex = 0) {
    const currentUnit = getUnitByUnitId(def.unit_id);

    // The throne — i.e. every hero upgrade — is priced by the LEVEL it moves to,
    // not by the building it becomes: applyBuildingCosts in data/buildings.js
    // skips throne entries, so nextDef.cost is undefined for all of them. That is
    // why a hero upgrade showed no cost anywhere and read as free. This mirrors
    // POST /structures/build, which charges THRONE_UPGRADE_COSTS[nextLevel].
    const isThrone   = def.category === 'throne';
    const nextLevel  = (structuresRecord.buildings_data[slot]?.level ?? 0) + 1;
    const throneCost = isThrone ? (throneUpgradeCosts[nextLevel] || null) : null;

    openSliderModal(buildingLabel(def),
      paths.map(path => {
        const nextUnit = getUnitByUnitId(path.unit_id);
        const nextDef  = getBuildingDef(player.faction, path.building_id);
        const cost     = isThrone ? throneCost : nextDef?.cost;
        const costText = costLabelFor(cost);
        return {
          unit:          nextUnit,
          buildingLabel: unitName(nextUnit) || buildingLabel(path),
          confirmLabel:  costText
            ? CASTLE_TEXT.upgradeCost[castleLang](unitName(nextUnit) || buildingLabel(path), costText)
            : CASTLE_TEXT.upgradeTo[castleLang](unitName(nextUnit) || buildingLabel(path)),
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
      { deconstructSlot: slot, startIndex }
    );
  }

  async function performBuildingUpgrade(slot, building_id) {
    closeModal();
    try {
      const updated = await api('/structures/build', {
        chat_id: player.chat_id,
        slot,
        building_id,
      });
      // The throne step was the ONE step that never recorded itself, so it
      // replayed on every visit with a level 0 throne while every other step
      // stayed flagged. Chain-wise it is the first beat, and it is finished the
      // moment the throne exists.
      if (slot === 'slot_0') markTutorialDone(player, 'throne_upgrade');
      // The post-battle chain ends the moment the Post is raised; errands take
      // over from there (onboardingIdle -> maybeShowErrandsIntro), now that the
      // building they need exists.
      if (building_id === 'messenger_post') {
        markTutorialDone(player, 'upgrades_page');
        markTutorialDone(player, 'build_messenger_post');
      }
      if (building_id === 'infirmary') markTutorialDone(player, 'build_infirmary');
      if (slot !== 'slot_0' && !isTutorialDone(player, 'second_building')) {
        markTutorialDone(player, 'second_building');
        // The player now has a second unit and an unequipped starting item, so
        // the equip lesson runs next. It used to hand off to the roster screen;
        // units live in these slots now, so it stays here — reloading first so
        // the new unit and its gear are actually in rosterCache/itemsCache when
        // renderBuildings starts the chain.
        await reloadFromBootstrap(updated, patchFromWrite(updated));
        return;
      }
      // A build changes the ROSTER, not just the structures: raising a dwelling
      // spawns its unit, and the server auto-levels any unit that was only
      // waiting on this building (applyAutoLevelUps in routes/index.js). This
      // used to re-render off the stale rosterCache, so the unit kept its old
      // level until the player switched tabs — at which point the screen
      // re-mounted against a cache that refreshResourceBar had since refreshed,
      // and the level-up appeared to arrive late. Read the new roster here.
      await reloadFromBootstrap(updated, patchFromWrite(updated));
      refreshNavLock(player).catch(() => {});
    } catch (err) {
      console.error(err);
      alert(err.message || 'Upgrade failed');
    }
  }

  function openPlaceholderModal(buildingId) {
    const def   = getBuildingDef(player.faction, buildingId);
    const label = buildingLabel(def) || 'Building';
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

    // EVERY tier-1 mercenary is listed, affordable or not. Filtering to what the
    // player could pay for meant an empty hall said "no mercenaries you can
    // afford" without naming a single one or the trophies it wanted — so there
    // was no way to learn who exists, what they cost, or which region to embark
    // to for them. An unaffordable merc is now shown with its price and refuses
    // the recruit, the same way an unaffordable building does in the build
    // slider.
    if (!tier1Defs.length) {
      openModal(CASTLE_TEXT.mercHall[castleLang],
        `<p class="modal-empty">${CASTLE_TEXT.mercNone[castleLang]}</p>`);
      return;
    }

    openSliderModal(CASTLE_TEXT.mercHall[castleLang],
      tier1Defs.map(b => {
        const affordable = canAfford(b.cost);
        return {
          unit:          getUnitByUnitId(b.unit_id),
          buildingLabel: buildingLabel(b),
          confirmLabel:  `${affordable ? CASTLE_TEXT.mercRecruit[castleLang] : CASTLE_TEXT.mercNeeds[castleLang]} · ${buildingLabel(b)} (${costLabel(b.cost)})`,
          mercBuildingId: b.id,
          mercCost:       b.cost,
          affordable,
          slot,
        };
      }),
      s => {
        if (!s.affordable) { alert(`${CASTLE_TEXT.cannotAfford[castleLang]} ${costLabel(s.mercCost)}`); return; }
        performMercenaryRecruit(s.mercBuildingId, slot);
      }
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
      // One refresh feeds trophies, roster AND the resource bar — /bootstrap
      // carries all three, so there is nothing to fetch separately. The
      // structures row from the write is handed over so the reload cannot
      // replace it with a pre-write read.
      await reloadFromBootstrap(result.structures || null);
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
      // One refresh feeds trophies, roster AND the resource bar — /bootstrap
      // carries all three, so there is nothing to fetch separately. The
      // structures row from the write is handed over so the reload cannot
      // replace it with a pre-write read.
      await reloadFromBootstrap(result.structures || null);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Upgrade failed');
    }
  }

  load();
}