import { assetUrl } from '../asset_base.js';
import { api }                 from '../api.js';
import { navigate }            from '../api.js';
import { refreshResourceBar }  from '../api.js';
import { bootstrapCache }      from '../api.js';
import { showCostBar as sharedShowCostBar, hideCostBar } from '../cost-bar.js';
import { ITEM_DEFS, meetsCraftRequirements, craftRequirementText } from '../../data/items.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';
import { REGIONS, getRegionsForMaterial, eventRegionsForMaterial } from '../../data/embark.js';
import {
  RESIST_ICONS, cap,
  resolveUnitDef, resolveAbility,
  openSheet, closeSheet, getSheetBody,
  applyBackground, buildAbilityModalParts,
  itemName, itemRarity, CRYSTAL_ICONS, GOLD_ICON, unitName,
  itemName, itemRarity, CRYSTAL_ICONS, GOLD_ICON, unitName, buildStatDescription, escapeHtml,
  renderItemPassive, renderItemTags, playPageTurnSound, RESOURCE_BAR_SLOTS,
} from '../utils.js';
import { mountItemLibrary, matchesStatFilter } from '../item-library.js';
import { mountTransmutation } from '../transmute.js';
import { mountEngraving } from '../engrave.js';
import { ENGRAVING_CURRENCY, ENGRAVING_TOKEN } from '../../data/engravings.js';

// The stash + forge, as a screen of its own. This is the craft section that used
// to be the third tab of the roster's item sheet — the roster tab is now the
// items tab, and equipping has moved to the castle slot that owns the unit.
const IT = {
  title:        { en: 'Items',            ru: 'Предметы' },
  craft:        { en: 'Craft',            ru: 'Создать' },
  crafting:     { en: 'Crafting…',        ru: 'Создаём…' },
  tabOwned:     { en: 'Owned',            ru: 'В наличии' },
  tabCraft:     { en: 'Craft',            ru: 'Создание' },
  any:          { en: 'Any',              ru: 'Любая' },
  common:       { en: 'Common',           ru: 'Обычные' },
  rare:         { en: 'Rare',             ru: 'Редкие' },
  epic:         { en: 'Epic',             ru: 'Эпические' },
  mythic:       { en: 'Mythic',           ru: 'Мифические' },
  shattered:    { en: 'Shattered',        ru: 'Расколотые' },
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
  filterRarity: { en: 'Rarity',           ru: 'Редкость' },
  filterStat:   { en: 'Stat',             ru: 'Фильтр' },
  groupStats:   { en: 'Stats',            ru: 'Характеристики' },
  groupTraits:  { en: 'Traits',           ru: 'Свойства' },
  rarity_common:{ en: 'Common',           ru: 'Обычный' },
  rarity_rare:  { en: 'Rare',             ru: 'Редкий' },
  rarity_epic:  { en: 'Epic',             ru: 'Эпический' },
  rarity_mythic:{ en: 'Mythic',           ru: 'Мифический' },
  rarity_shattered:{ en: 'Shattered',     ru: 'Расколотый' },
  noMaterials:  { en: 'No materials',     ru: 'Без материалов' },
  noForge:      { en: '🔒 Build a Blacksmith', ru: '🔒 Постройте кузницу' },
  nothingMatches:{ en: 'Nothing matches these filters.', ru: 'Ничего не найдено по фильтрам.' },
  unique:       { en: 'Unique',           ru: 'Уникальный' },
  owned:        { en: 'Owned',            ru: 'В наличии' },
  wrongFaction: { en: 'Wrong faction',    ru: 'Не та фракция' },
  uniqueOwned:  { en: 'Unique — already owned', ru: 'Уникальный — уже есть' },
  failCraft:    { en: 'Craft failed',     ru: 'Не удалось создать' },
  equippedOn:   { en: 'on',               ru: 'у' },
  free:         { en: 'Free',             ru: 'В хранилище' },
};

export function renderItems(root, params = {}) {
  const { player } = params;
  // False for a PREBUILD: a screen built ahead of time on idle draws itself and
  // sits still. The craft tutorial and the trophy strip both assume the player
  // is looking at this screen — one teaches, the other mounts itself next to
  // the resource bar, where it would appear over whatever screen IS on show.
  let hostVisible = !params.prebuild;
  const L = player?.settings?.language === 'ru' ? 'ru' : 'en';
  const T = key => IT[key][L];
  applyBackground(root, player.faction, 'roster');

  // Three pages on one sliding track, the same arrangement as the castle, embark
  // and the spell tome: Engraving, the forge, then Transmutation. The forge opens
  // in the middle — it is what this screen is for.
  root.innerHTML = `
    <div class="screen screen-items">
      <main class="items-main">
        <div class="tome-layers">
          <button class="tome-layer-arrow tome-layer-arrow--prev" id="items-layer-prev" type="button" aria-label="${T('title')}"><span>&lsaquo;</span></button>
          <div class="tome-layer-viewport">
            <div class="tome-layer-track" id="items-layer-track">
              <div class="tome-layer" data-layer="1" id="items-engrave"></div>
              <div class="tome-layer" data-layer="2">
                <div class="items-modal" id="items-screen"></div>
              </div>
              <div class="tome-layer" data-layer="3" id="items-transmute"></div>
            </div>
          </div>
          <button class="tome-layer-arrow tome-layer-arrow--next" id="items-layer-next" type="button" aria-label="Transmutation"><span>&rsaquo;</span></button>
        </div>
      </main>
    </div>`;

  const host = root.querySelector('#items-screen');

  // Whether a Transmutation Lab stands — no lab, no transmutation page — and
  // whether the castle has been read yet. Declared up here, before the
  // transmutation page is mounted, because mounting draws it at once and reads both.
  let labOpen = false;
  let loaded  = false;

  // Same logic as the tome's applyLayer/setLayer: applyItemsLayer draws the
  // current page and the arrows' state, setItemsLayer moves and then applies.
  let itemsLayer = 2;
  function setItemsLayer(n) {
    const next = Math.max(1, Math.min(3, n));
    if (next === itemsLayer) return;
    itemsLayer = next;
    playPageTurnSound();
    closeSheet();
    applyItemsLayer();
    if (itemsLayer === 1) engrave.refresh();
    if (itemsLayer === 3) transmute.refresh();
    // The strip under the resource bar belongs to whichever page is showing.
    showTrophyBar();
  }
  function applyItemsLayer() {
    const track = root.querySelector('#items-layer-track');
    if (track) track.style.transform = `translateX(-${(itemsLayer - 1) * 100}%)`;
    root.querySelectorAll('.tome-layer').forEach(el => {
      const isCurrent = Number(el.dataset.layer) === itemsLayer;
      el.classList.toggle('tome-layer--active', isCurrent);
      el.setAttribute('aria-hidden', String(!isCurrent));
    });
    const prev = root.querySelector('#items-layer-prev');
    const nextBtn = root.querySelector('#items-layer-next');
    prev.disabled = itemsLayer === 1;
    nextBtn.disabled = itemsLayer === 3;
    prev.classList.toggle('tome-layer-arrow--live', itemsLayer > 1);
    nextBtn.classList.toggle('tome-layer-arrow--live', itemsLayer < 3);
  }
  root.querySelector('#items-layer-prev').addEventListener('click', () => setItemsLayer(itemsLayer - 1));
  root.querySelector('#items-layer-next').addEventListener('click', () => setItemsLayer(itemsLayer + 1));

  // `resources` is filled by this screen's own load below; read lazily.
  const transmute = mountTransmutation(root.querySelector('#items-transmute'), {
    player,
    getResources: () => resources,
    // Null until the first load has read the castle: the page shows nothing
    // rather than flashing "locked" at a player who has the lab.
    isUnlocked: () => (loaded ? labOpen : null),
    // Crystals were just paid or granted: re-read them so both pages agree.
    onResourcesChanged: async () => {
      bootstrapCache.invalidate();
      const boot = await bootstrapCache.get(player.chat_id).catch(() => null);
      if (boot) resources = [...(boot.resources || []), ...(boot.trophies || []), ...(boot.tokens || [])];
    },
  });
  // Drawn once on mount, as the tome does — without it the arrows sat in their
  // plain unstyled state until the first tap.
  applyItemsLayer();

  let units     = [];
  let items     = [];
  let resources = [];
  let progress  = {};
  // Whether a Blacksmith stands. No forge, no crafting.
  let forgeOpen = false;
  // Whether it has reached level 2, which opens Engraving.
  let engraveOpen = false;

  // Mounted AFTER the state above: it draws itself at once and reads the roster,
  // the items and the resources while doing so.
  const engrave = mountEngraving(root.querySelector('#items-engrave'), {
    player,
    getUnits:     () => units,
    getItems:     () => items,
    getResources: () => resources,
    // Null until the first load has read the castle: the page shows nothing
    // rather than flashing "locked" at a player who has the levels.
    isUnlocked: () => (loaded ? engraveOpen : null),
    // A unit was just engraved: re-read the roster so the strip and the triangle
    // agree with what was paid for.
    onChanged: async () => {
      const boot = await bootstrapCache.get(player.chat_id).catch(() => null);
      if (boot) applyBootstrap(boot);
      render();
    },
  });

  // Screen state, same axes the roster sheet filtered on.
  let filter     = 'craft';   // 'owned' | 'craft'
  let rarity     = 'all';
  let statFilter = 'all';
  let readyOnly  = false;
  let selected   = null;

  const itemKeyOf = it => it.item_stats?.key || it.item_stats?.icon;

  // What onboarding has the player forge first: the cheapest thing in the
  // catalog (50 gold, no materials, no progress gate), so the step can never
  // wall a new player who spent their embark rewards elsewhere.
  const TUTORIAL_CRAFT_KEY = 'padded_armor';

  // Appended rather than slotted between epic and mythic: the first four ARE a
  // power ladder and inserting shattered into it would claim a rank it does not
  // have. It sits at the end as its own class.
  const RARITIES = ['common', 'rare', 'epic', 'mythic', 'shattered'];
  const STAT_FILTERS = [
    ['all',          T('all')],
    ['hp',           T('hp')],
    ['armor',        T('armor')],
    ['initiative',   T('init')],
    ['action_power', T('power')],
    ['resist',       T('resist')],
  ];
  const TRAIT_FILTERS = [
    ['passive',    T('passive')],
    ['grants_tag', T('grantsTag')],
    ['needs_tag',  T('needsTag')],
  ];

  // ── Card pieces, unchanged from the roster's item sheet ────────────────────
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

    const meta  = STAT_ICONS[key];
    const icon  = meta?.icon ?? '◆';
    const label = meta ? meta[L] : cap(key);
    return `<span class="stat-chip ${cls}" title="${label} ${sign}${val}">
              <span class="stat-chip-icon">${icon}</span>${sign}${val}
            </span>`;
  }

  function formatStatMods(statMods) {
    return Object.entries(statMods || {}).map(([key, val]) => statChip(key, val)).join('');
  }

  function itemAsideHtml({ iconId, name, rarity: r, unique, countLine }) {
    return `
      <div class="item-card-aside">
        <div class="item-card-icon">
          <img src="${assetUrl(`/assets/icons/items/${iconId}.png`)}" alt="${name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <span class="item-card-icon-fallback" style="display:none;">⚙</span>
        </div>
        <div class="item-card-rarity item-card-rarity--${r}">${T('rarity_' + r)}</div>
        ${unique ? `<div class="item-card-unique">${T('unique')}</div>` : ''}
        ${countLine ? `<div class="item-card-count-line">${countLine}</div>` : ''}
      </div>`;
  }

  // An owned row. There is no unit in scope on this screen, so instead of an
  // Equip button the card says who is carrying it — equipping happens in the
  // castle, on the slot that owns the unit.
  function buildOwnedItemCard(item, count = 1) {
    const stats  = item.item_stats || {};
    const iconId = stats.icon || stats.key || 'item';
    const holder = item.equipped_by != null
      ? units.find(u => String(u.id) === String(item.equipped_by))
      : null;
    const holderName = holder ? unitName(holder, player) : '';
    const countLine  = count > 1
      ? `×${count}`
      : (holderName ? `${T('equippedOn')} ${holderName}` : T('free'));

    return `
      <div class="item-card item-card--rarity-${itemRarity(item)} ${holderName ? 'item-card--equipped' : ''}">
        <div class="item-card-body">
          ${itemAsideHtml({
            iconId, name: itemName(item, player), rarity: itemRarity(item),
            unique: !!stats.unique, countLine,
          })}
          <div class="item-card-main">
            <div class="item-card-name">${itemName(item, player)}</div>
            <div class="item-card-stats">${formatStatMods(stats.stat_mods)}</div>
            ${renderItemPassive(stats)}
            <div class="item-card-tags">${renderItemTags(stats)}</div>
          </div>
        </div>
      </div>`;
  }

  function materialIcon(key) {
    if (key === 'Gold') return GOLD_ICON;
    if (CRYSTAL_ICONS[key]) return CRYSTAL_ICONS[key];
    if (ITEM_DEFS[key]) {
      const iconId = ITEM_DEFS[key].icon || ITEM_DEFS[key].key;
      return `<img class="mat-chip-img" src="${assetUrl(`/assets/icons/items/${iconId}.png`)}" alt="${key}" onerror="this.style.display='none'">`;
    }
    return `<img class="mat-chip-img" src="${assetUrl(`/assets/icons/recources/${key}.png`)}" alt="${key}" onerror="this.style.display='none'">`;
  }

  function ownedAmount(key) {
    if (ITEM_DEFS[key]) {
      return items.filter(it => itemKeyOf(it) === key && !it.equipped_by).length;
    }
    return resources.find(r => r.item === key)?.amount ?? 0;
  }

  function materialName(key) {
    if (ITEM_DEFS[key]) return itemName(ITEM_DEFS[key], player);
    if (key === 'Gold') return 'Gold';
    if (key.startsWith('Crystals_')) return `${key.replace('Crystals_', '')} Crystals`;
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // One chip per material, grouped currency / trophies / crafted parts.
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

    return [
      entries.filter(([k]) => isCurrency(k)),
      entries.filter(([k]) => !isCurrency(k) && !isItem(k)),
      entries.filter(([k]) => !isCurrency(k) && isItem(k)),
    ].filter(g => g.length)
     .map(g => `<div class="mat-row">${g.map(chip).join('')}</div>`)
     .join('');
  }

  function hasCraftMaterials(itemDef) {
    const resourceOk = Object.entries(itemDef.cost || {}).every(([resName, amount]) =>
      (resources.find(r => r.item === resName)?.amount ?? 0) >= amount);
    const ingredientOk = Object.entries(itemDef.item_cost || {}).every(([key, count]) =>
      items.filter(it => itemKeyOf(it) === key && !it.equipped_by).length >= count);
    return resourceOk && ingredientOk;
  }

  function canCraftNow(itemDef) {
    // No forge, nothing is craftable now — this is the predicate behind both
    // the material sheet button and the Craftable now filter.
    if (!forgeOpen) return false;
    if (itemDef.faction && itemDef.faction !== player.faction) return false;
    if (!meetsCraftRequirements(itemDef, progress)) return false;
    const ownedCount = items.filter(it => itemKeyOf(it) === itemDef.key).length;
    if (itemDef.unique && ownedCount > 0) return false;
    return hasCraftMaterials(itemDef);
  }

  function buildCatalogItemCard(itemDef, ownedCount) {
    const iconId      = itemDef.icon || itemDef.key || 'item';
    const passiveDef  = itemDef.passive ? resolveAbility(itemDef.passive) : null;
    const passiveDesc = passiveDef ? buildStatDescription(passiveDef, 'passive') : '';

    const countLine = ownedCount > 0 ? `${T('owned')} ×${ownedCount}` : '';

    return `
      <div class="item-card item-card--catalog item-card--rarity-${itemRarity(itemDef)}">
        <div class="item-card-body">
          ${itemAsideHtml({
            iconId, name: itemName(itemDef, player), rarity: itemRarity(itemDef),
            unique: !!itemDef.unique, countLine,
          })}
          <div class="item-card-main">
            <div class="item-card-name">${itemName(itemDef, player)}</div>
            <div class="item-card-stats">${formatStatMods(itemDef.stat_mods)}</div>
            ${renderItemPassive(itemDef)}
            ${renderItemPassive(itemDef, { interactive: false })}
            ${passiveDesc ? `<div class="item-modal-passive-desc">${escapeHtml(passiveDesc)}</div>` : ''}
            <div class="item-card-tags">${renderItemTags(itemDef)}</div>
          </div>
        </div>
      </div>`;
  }

  // ── The list ──────────────────────────────────────────────────────────────
  const matchesStat = stats => matchesStatFilter(stats, statFilter);

  const matchesRarity = stats => rarity === 'all' || itemRarity(stats) === rarity;

  function currentList() {
    if (filter === 'craft') {
      return Object.values(ITEM_DEFS)
        .filter(def => !def.faction || def.faction === player.faction)
        .filter(def => matchesRarity(def) && matchesStat(def))
        .filter(def => !readyOnly || canCraftNow(def))
        .map(def => ({ kind: 'blueprint', def, owned: items.filter(it => itemKeyOf(it) === def.key).length }));
    }

    // Owned: identical copies stack, except ones that are worn — a card that
    // names its carrier cannot be merged with another unit's copy.
    const stacks = new Map();
    const out = [];
    for (const it of items) {
      if (!matchesRarity(it) || !matchesStat(it.item_stats)) continue;
      const key = itemKeyOf(it);
      if (it.equipped_by != null || !key) { out.push({ kind: 'item', item: it, count: 1 }); continue; }
      const stack = stacks.get(key);
      if (stack) { stack.count += 1; continue; }
      const entry = { kind: 'item', item: it, count: 1 };
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

  function entryTile(entry) {
    const blueprint = entry.kind === 'blueprint';
    const count = blueprint ? entry.owned : (entry.count ?? 1);
    return {
      iconId: entryIcon(entry),
      name:   entryName(entry),
      rarity: itemRarity(entryStats(entry)),
      badge:  blueprint ? `×${count}` : (count > 1 ? `×${count}` : ''),
      badge:  blueprint && filter === 'craft' && count === 0
        ? '×0'
        : (count > (blueprint ? 0 : 1) ? `×${count}` : ''),
      ready:  blueprint && canCraftNow(entry.def),
      worn:   !blueprint && entry.item?.equipped_by != null,
    };
  }

  function detailCard(entry) {
    if (!entry) return `<p class="placeholder">${T('nothingMatches')}</p>`;
    return entry.kind === 'blueprint'
      ? buildCatalogItemCard(entry.def, entry.owned)
      : buildOwnedItemCard(entry.item, entry.count ?? 1);
  }

  // The grid, the filter bar and the detail view are the shared library; this
  // screen supplies the list, the tile and the card with its Craft button.
  let lib = null;

  function mountLibrary() {
    lib = mountItemLibrary(host, {
      present: 'modal',
      tab: filter,
      tabs: [
        { id: 'craft', label: T('tabCraft') },
        { id: 'owned', label: T('tabOwned') },
      ],
      rarities: RARITIES,
      rarityLabel: r => T(r),
      anyLabel: T('any'),
      allLabel: T('all'),
      statFilters:  STAT_FILTERS.slice(1),
      traitFilters: TRAIT_FILTERS,
      statsGroupLabel:  T('groupStats'),
      traitsGroupLabel: T('groupTraits'),
      rarityAria: T('filterRarity'),
      statAria:   T('filterStat'),
      chip: { label: T('craftableNow'), showFor: ['craft'] },
      emptyText: T('nothingMatches'),
      getList: currentList,
      tileOf: entryTile,
      renderDetail: detailCard,
      onTabChange: id => { filter = id; selected = null; showTrophyBar(); },
      onFilterChange: ({ rarity: r, stat }) => {
        rarity = r;
        statFilter = stat;
        selected = null;
        showTrophyBar();
      },
      onChipToggle: on => { readyOnly = on; selected = null; showTrophyBar(); },
      // The cost strip follows whatever card is open, and falls back to the
      // whole trophy stash once the view is closed again.
      onOpenChange: (_entry, i) => { selected = i; showTrophyBar(); },
    });
  }

  function render() {
    if (!lib) mountLibrary();
    else lib.paint();
    showTrophyBar();
  }

  // Onboarding's forge step. castle.js walks the player to the Blacksmith and
  // then points at this tab (`go_craft`), but the lesson has to live here —
  // only this screen knows where the Craft button is, and that button sits in
  // the detail card, so a spotlight means nothing until the right blueprint is
  // the one on show. Hence the select-then-point: the step drives the track to
  // Padded Armor rather than asking the player to find it.
  //
  // Deliberately gives up rather than fighting the player: if they have changed
  // a filter, whatever they are looking for outranks the tutorial, and the step
  // waits for a clean render instead of yanking the list back.
  function maybeShowCraftTutorial() {
    if (!forgeOpen || isTutorialDone(player, 'craft_item')) return;
    // Armed by some other route (an older save, a reset that kept the stash) —
    // there is nothing left to teach, so retire the step rather than block on it.
    if (items.length) { markTutorialDone(player, 'craft_item'); return; }
    if (filter !== 'craft' || rarity !== 'all' || statFilter !== 'all' || readyOnly) return;

    const list = currentList();
    const idx  = list.findIndex(e => e.kind === 'blueprint' && e.def.key === TUTORIAL_CRAFT_KEY);
    if (idx < 0) return;
    // The Craft button lives in the item's own card now, so the lesson opens
    // that card itself rather than asking the player to find it in the grid.
    if (idx !== selected) lib?.openAt(idx);
    const btn = host.querySelector('.item-action-btn--craft:not([disabled])');
    if (!btn) return;   // cannot afford it yet; the step waits
    showTutorialSpotlight(player, 'craft_item', btn, {
      resolveTarget: () => host.querySelector('.item-action-btn--craft:not([disabled])'),
    });
  }

  // The grid and the open card are two views of currentList(), so the library
  // repaints both from it.
  function refreshList() {
    lib?.refresh();
  }

  host.addEventListener('click', async e => {
    const passiveBtn = e.target.closest('.item-passive');
    if (passiveBtn) {
      const def = resolveAbility(passiveBtn.dataset.abilityKey);
      if (def) {
        const parts = buildAbilityModalParts(def, 'passive');
        openSheet(parts.title, parts.body, parts.badges);
      }
      return;
    }

    const matChip = e.target.closest('[data-material]');
    if (matChip) { openMaterialSheet(matChip.dataset.material); return; }

    const craftBtn = e.target.closest('.item-action-btn--craft');
    if (craftBtn && !craftBtn.disabled) {
      craftBtn.disabled    = true;
      craftBtn.textContent = T('crafting');
      try {
        const crafted = await api('/items/craft', { chat_id: player.chat_id, item_key: craftBtn.dataset.craftKey });
        await applyCraftResponse(crafted);
        refreshResourceBar(player).catch(() => {});
        showTrophyBar();
        // Onboarding's forge step is finished by the forge, not by the tap: the
        // lesson is that an item comes OUT, so it is only done once one has.
        if (!isTutorialDone(player, 'craft_item')) {
          markTutorialDone(player, 'craft_item');
          hideTutorial();
        }
        render();
      } catch (err) {
        alert(err.message || T('failCraft'));
        render();
      }
    }
  });

  // Apply what /items/craft already read back instead of firing a second
  // /bootstrap — that extra read can answer from a replica that has not caught
  // up with the write, which is what made a fresh craft need a reload to appear.
  async function applyCraftResponse(crafted) {
    const rows   = crafted.resources || [];
    const merged = crafted.items ? bootstrapCache.patch(cur => ({
      items:     crafted.items,
      resources: rows.length ? rows.filter(r => r.item_type === 'resource') : cur.resources,
      trophies:  rows.length ? rows.filter(r => r.item_type === 'trophy')   : cur.trophies,
    })) : null;
    applyBootstrap(merged || await bootstrapCache.refresh(player.chat_id));
  }

  // ── Trophy bar ────────────────────────────────────────────────────────────
  // Craft costs are largely trophies, so the strip that shows them belongs to
  // this screen for as long as it is mounted. It shows the trophies the item on
  // show is crafted from — owned / required — rather than everything the player
  // owns: a wall of unrelated trophies answered no question, and the one thing
  // a player wants from this strip is how far off THIS craft they are.
  function costTrophyKeys(entry) {
    const def = entry?.kind === 'blueprint'
      ? entry.def
      : ITEM_DEFS[entry?.item ? itemKeyOf(entry.item) : null];
    // Currencies have the resource strip above; crafted parts are shown as cost
    // chips on the card itself. What is left is the trophies.
    return Object.keys(def?.cost || {})
      .filter(k => k !== 'Gold' && !k.startsWith('Crystals_') && !ITEM_DEFS[k]);
  }

  function requiredAmount(entry, key) {
    const def = entry?.kind === 'blueprint'
      ? entry.def
      : ITEM_DEFS[entry?.item ? itemKeyOf(entry.item) : null];
    return Number(def?.cost?.[key]) || 0;
  }

  function craftCostFor(entry) {
    const def = entry?.kind === 'blueprint' ? entry.def : null;
    const cost = { ...(def?.cost || {}) };
    for (const [key, amount] of Object.entries(def?.item_cost || {})) {
      cost[key] = (Number(cost[key]) || 0) + Number(amount || 0);
    }
    return cost;
  }

  function craftCostSlots(cost, itemCostKeys) {
    const keys = Object.keys(cost);
    const resourceKeys = RESOURCE_BAR_SLOTS
      .map(slot => slot.key)
      .filter(key => keys.includes(key));
    const orderedKeys = [...resourceKeys, ...keys.filter(key => !resourceKeys.includes(key))];
    return orderedKeys.map(key => ({
      key,
      label: materialName(key),
      icon: materialIcon(key),
      item_type: itemCostKeys.has(key)
        ? 'item'
        : (resources.find(row => row.item === key)?.item_type === 'token' ? 'token' : 'inventory'),
    }));
  }

  // The strip under the resource bar. On the forge it is the trophies a craft
  // needs; during crafting both strips narrow to the selected recipe, with the
  // owned amounts above and the amounts required below.
  //
  // Mounted OUTSIDE this screen's host, next to the resource strip, so it is not
  // hidden by the host being hidden — which makes it the one thing on this
  // screen that a prebuild must not draw. main.js builds the un-opened tabs at
  // startup and renders them hidden (see buildScreen), and render() below calls
  // this on the way through, so without this guard a player who has never opened
  // the Items tab still got its trophy strip stapled under the castle's resource
  // bar on the very first load. load() checks hostVisible too, but only AFTER
  // render() has already run.
  function showTrophyBar() {
    if (!hostVisible) return;
    if (itemsLayer === 1) {
      hideCostBar();
      refreshResourceBar(player).catch(() => {});
      showValorBar();
      return;
    }
    const entry = currentList()[selected];
    if (itemsLayer === 2 && filter === 'craft' && entry?.kind === 'blueprint') {
      const cost = craftCostFor(entry);
      const itemCostKeys = new Set(Object.keys(entry.def.item_cost || {}));
      const slots = craftCostSlots(cost, itemCostKeys);
      const amountOf = key => itemCostKeys.has(key)
        ? items.filter(item => itemKeyOf(item) === key && !item.equipped_by).length
        : resources.find(row => row.item === key)?.amount ?? 0;
      document.getElementById('roster-trophy-bar')?.remove();
      refreshResourceBar(player, { slots }).catch(() => {});
      sharedShowCostBar(cost, {
        amountOf,
        lang: L,
        onMaterialClick: openMaterialSheet,
        slots,
      });
      return;
    }
    hideCostBar();
    refreshResourceBar(player).catch(() => {});
    // Most recipes (47 of 77 items) ask for no trophy at all — they are paid for
    // in gold, crystals and crafted parts. Narrowing the strip to "what THIS
    // craft needs" would leave it blank on all of those, so it falls back to
    // everything the player owns, which is what it always showed.
    const needed = costTrophyKeys(entry);
    const keys   = needed.length
      ? needed
      : resources.filter(r => r.item_type === 'trophy' && r.amount > 0).map(r => r.item);
    const showNeed = needed.length > 0;
    document.getElementById('roster-trophy-bar')?.remove();

    // Mounted even with nothing in it. The strip sits above the whole screen,
    // so adding and removing it as the selection changes shoved the card and
    // the track up and down — the height is reserved instead.
    const bar = document.createElement('div');
    bar.id = 'roster-trophy-bar';
    bar.className = 'roster-trophy-bar';
    // Tappable, like the cost chips. A trophy the player is short of is the one
    // thing on this screen they want to act on, and the answer — which region
    // drops it — was already a tap away from a cost chip but not from the bar
    // that shows what they own.
    bar.innerHTML = keys.map(key => {
      const need = showNeed ? requiredAmount(entry, key) : 0;
      const have = ownedAmount(key);
      const label = showNeed ? `${have}/${need}` : String(have);
      return `
      <button class="trophy-bar-item ${have >= need ? '' : 'trophy-bar-item--short'}" data-material="${key}"
              title="${materialName(key)} — ${label}">
        <div class="trophy-bar-icon-wrap">
          <img src="${assetUrl(`/assets/icons/recources/${key}.png`)}"
              class="trophy-bar-icon"
              alt="${key}"
              onerror="this.style.display='none';this.nextSibling.style.display='flex';">
          <span class="trophy-bar-icon-fallback">🏆</span>
        </div>
        <span class="trophy-bar-val">${label}</span>
      </button>`;
    }).join('');

    // The bar is mounted OUTSIDE this screen's host (it sits under the resource
    // strip), so the host's delegated click never reaches it — it needs its own.
    bar.addEventListener('click', e => {
      const chip = e.target.closest('[data-material]');
      if (chip) openMaterialSheet(chip.dataset.material);
    });

    const resourceRow = document.getElementById('resource-bar-row') || document.getElementById('resource-bar');
    resourceRow?.insertAdjacentElement('afterend', bar);
  }

  function showValorBar() {
    document.getElementById('roster-trophy-bar')?.remove();
    const amountOf = item => resources.find(r => r.item === item)?.amount ?? 0;
    // What the page spends: Valor, and the tokens won in the Crown Tourney.
    const chips = [
      { item: ENGRAVING_CURRENCY, icon: 'valor',           fallback: '⚔' },
      { item: ENGRAVING_TOKEN,    icon: ENGRAVING_TOKEN,   fallback: '✦' },
    ];

    const bar = document.createElement('div');
    bar.id = 'roster-trophy-bar';
    bar.className = 'roster-trophy-bar';
    bar.innerHTML = chips.map(c => `
      <div class="trophy-bar-item" title="${c.item} — ${amountOf(c.item)}">
        <div class="trophy-bar-icon-wrap">
          <img src="${assetUrl(`/assets/icons/recources/${c.icon}.png`)}"
               class="trophy-bar-icon" alt="${c.item}"
               onerror="this.style.display='none';this.nextSibling.style.display='flex';">
          <span class="trophy-bar-icon-fallback">${c.fallback}</span>
        </div>
        <span class="trophy-bar-val">${amountOf(c.item)}</span>
      </div>`).join('');

    const resourceRow = document.getElementById('resource-bar-row') || document.getElementById('resource-bar');
    resourceRow?.insertAdjacentElement('afterend', bar);
  }

  // ── Material detail ───────────────────────────────────────────────────────
  // Tapping a cost chip answers the only question a player has about it: where
  // do I get more? Lists the regions that drop it and offers to go there.
  function openMaterialSheet(key) {
    // Static drops plus whatever the running event adds — an event trophy has no
    // entry in the static tables, so without this it would report as dropping
    // nowhere while it is actively dropping.
    const staticIds     = getRegionsForMaterial(key) || [];
    const eventIds      = eventRegionsForMaterial(key, bootstrapCache.data?.event);
    const regionIds     = [...new Set([...staticIds, ...eventIds])];
    const eventOnly     = !staticIds.length && eventIds.length > 0;
    const label         = materialName(key);
    const have          = ownedAmount(key);
    const ingredientDef = ITEM_DEFS[key] || null;
    const canMake       = ingredientDef ? canCraftNow(ingredientDef) : false;

    const regionNames = regionIds.map(id => {
      const region = REGIONS.find(r => r.id === id);
      return (region ? (L === 'ru' ? (region.label_ru || region.label) : region.label) : id) || id;
    }).join(', ');

    openSheet(label, `
      <div class="mat-sheet">
        <div class="mat-sheet-head">
          <span class="mat-sheet-icon">${materialIcon(key)}</span>
          <span class="mat-sheet-have">${L === 'ru' ? 'В наличии' : 'Owned'}: <strong>${have}</strong></span>
        </div>
        ${regionIds.length
          ? `<p class="mat-sheet-label">${eventOnly
                ? (L === 'ru' ? 'Только во время события:' : 'During the event only:')
                : (L === 'ru' ? 'Выпадает:' : 'Drops in:')} <span class="mat-regions">${regionNames}</span></p>
             <!-- One row per region, each its own jump. Listing three names and
                  offering a single Embark button meant the player still had to
                  find the right card once they arrived. -->
             <div class="mat-region-list">
               ${regionIds.map(id => {
                 const region = REGIONS.find(r => r.id === id);
                 const name   = (region ? (L === 'ru' ? (region.label_ru || region.label) : region.label) : id) || id;
                 return `<button class="mat-region-btn" data-region="${id}">
                           <span class="mat-region-name">${name}</span>
                           <span class="mat-region-go">→</span>
                         </button>`;
               }).join('')}
             </div>`
          : ingredientDef
            // Genuinely crafted — the existing, correct answer.
            ? `<p class="modal-empty">${L === 'ru' ? 'Не выпадает в походах — только изготовление.' : 'Not found on any expedition — crafted only.'}</p>`
            // Not crafted and dropping nowhere: an event trophy between events.
            : `<p class="modal-empty">${L === 'ru' ? 'Сейчас не выпадает — вернитесь во время события.' : 'Not dropping right now — check back during an event.'}</p>`}
        ${ingredientDef ? `
          <div class="mat-sheet-cost">${costChips(ingredientDef.cost || {}, ingredientDef.item_cost || {})}</div>
          <button class="mat-embark-btn" id="mat-craft-btn" ${canMake ? '' : 'disabled'}>${T('craft')}</button>` : ''}
        <button class="mat-embark-btn" id="mat-embark-btn" ${regionIds.length ? '' : 'disabled'}>
          ${L === 'ru' ? 'В поход' : 'Embark'}
        </button>
      </div>`);

    const sheetBody = getSheetBody();

    // The cost chips inside this sheet are themselves materials, and any of them
    // may be another crafted item with its own requirements. Without this the
    // chain stopped one level down: you could open a component, see what it
    // needed, and not be able to open THAT.
    sheetBody?.addEventListener('click', e => {
      const chip = e.target.closest('[data-material]');
      if (!chip) return;
      const next = chip.dataset.material;
      if (next && next !== key) openMaterialSheet(next);
    });

    sheetBody?.querySelector('#mat-craft-btn')?.addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = T('crafting');
      try {
        await applyCraftResponse(await api('/items/craft', { chat_id: player.chat_id, item_key: key }));
        refreshResourceBar(player).catch(() => {});
        closeSheet();
        showTrophyBar();
        render();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = T('craft');
        alert(err.message || T('failCraft'));
      }
    });

    sheetBody?.querySelector('#mat-embark-btn')?.addEventListener('click', () => {
      if (!regionIds.length) return;
      closeSheet();
      // embark.js flashes these region cards for a few seconds on arrival.
      navigate('embark', { player, highlightRegions: regionIds, highlightMaterial: key });
    });

    // Straight to ONE region. Same highlight machinery, narrowed to the card the
    // player picked, so arriving on the embark screen scrolls to that region
    // rather than flashing all of them.
    sheetBody?.querySelectorAll('.mat-region-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        closeSheet();
        navigate('embark', { player, highlightRegions: [btn.dataset.region], highlightMaterial: key });
      });
    });
  }

  // Mirrors craftingUnlocked() in data/buildings.js. Mirrored rather than
  // imported because that module is CommonJS only and this one is loaded as an
  // ES module in the browser — the same reason castle.js keeps its own copy of
  // SLOT_FIXED_BUILDING. The server re-checks it in POST /items/craft, which is
  // the authority; this copy only decides what the buttons say.
  function hasBlacksmith(buildingsData, level = 1) {
    return Object.entries(buildingsData || {}).some(([slot, state]) =>
      /^slot_\d+$/.test(slot) && state?.building_id === 'blacksmith' && (state.level ?? 0) >= level);
  }

  // Every slice this screen needs comes from the single /bootstrap payload.
  function applyBootstrap(boot) {
    if (!boot) return null;
    loaded    = true;
    units     = boot.roster || [];
    items     = boot.items || [];
    // Tokens ride along with the rest: engraving tokens are spent on this
    // screen, and leaving them out made the engraving page read every player as
    // holding none.
    resources = [...(boot.resources || []), ...(boot.trophies || []), ...(boot.tokens || [])];
    progress  = boot.progress || {};
    forgeOpen = hasBlacksmith(boot.structures?.buildings_data);
    // Engraving is the Blacksmith's second level. The server re-checks it in
    // POST /roster/engrave.
    engraveOpen = hasBlacksmith(boot.structures?.buildings_data, 2);
    // Transmutation is opened by the Transmutation Lab, the same way the forge
    // is opened by the Blacksmith. The server re-checks it in /transmute/start.
    labOpen = Object.entries(boot.structures?.buildings_data || {})
      .some(([k, st]) => /^slot_\d+$/.test(k) && st?.building_id === 'transmute_lab' && (st.level ?? 0) >= 1);
    // Both sub-pages are redrawn here, not just transmutation. The engraving
    // page is drawn once at mount, when the castle has not been read yet, and
    // its own refresh otherwise only fires on a layer change (setItemsLayer) —
    // so a player standing on layer 1, going to the castle to raise the
    // Blacksmith to level 2 and coming back kept the locked panel until a full
    // reload, because onShow -> load() -> applyBootstrap flipped engraveOpen
    // without telling the page.
    engrave?.refresh();
    transmute?.refresh();
    return boot;
  }

  async function load() {
    applyBootstrap(await bootstrapCache.get(player.chat_id));
    render();
    if (!hostVisible) return;
    maybeShowCraftTutorial();
    showTrophyBar();
  }

  load();

  // Kept alive between visits. Two things follow from that:
  //
  // Freshness — this screen spends and receives what every other screen also
  // touches (trophies from battle, gold from the castle), so load() re-reads
  // the bootstrap and repaints on the way in. Inside the cache TTL that is a
  // repaint with no request behind it.
  //
  // Reach — the trophy strip is mounted next to the resource bar, OUTSIDE this
  // host, so hiding the host does not hide it. It would otherwise follow the
  // player onto the castle. load() puts it back up on the way in.
  return {
    onShow: () => { hostVisible = true; load(); },
    onHide: () => {
      hostVisible = false;
      hideCostBar();
      document.getElementById('roster-trophy-bar')?.remove();
      transmute?.stop();
    },
    destroy: () => {
      hostVisible = false;
      hideCostBar();
      document.getElementById('roster-trophy-bar')?.remove();
      transmute?.stop();
    },
  };
}