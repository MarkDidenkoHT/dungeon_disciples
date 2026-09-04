import { assetUrl } from '../asset_base.js';
import { api }                 from '../api.js';
import { navigate }            from '../api.js';
import { refreshResourceBar }  from '../api.js';
import { bootstrapCache }      from '../api.js';
import { ITEM_DEFS, meetsCraftRequirements, craftRequirementText } from '../../data/items.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';
import { REGIONS, getRegionsForMaterial, eventRegionsForMaterial } from '../../data/embark.js';
import {
  RESIST_ICONS, cap,
  resolveUnitDef, resolveAbility,
  openSheet, closeSheet, getSheetBody,
  applyBackground, buildAbilityModalParts,
  itemName, itemRarity, CRYSTAL_ICONS, GOLD_ICON, unitName, abilityName,
} from '../utils.js';

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

export function renderItems(root, { player }) {
  const L = player?.settings?.language === 'ru' ? 'ru' : 'en';
  const T = key => IT[key][L];
  applyBackground(root, player.faction, 'roster');

  root.innerHTML = `
    <div class="screen screen-items">
      <main class="items-main">
        <div class="items-modal" id="items-screen"></div>
      </main>
    </div>`;

  const host = root.querySelector('#items-screen');

  let units     = [];
  let items     = [];
  let resources = [];
  let progress  = {};
  // Whether a Blacksmith stands. No forge, no crafting.
  let forgeOpen = false;

  // Screen state, same axes the roster sheet filtered on.
  let filter     = 'craft';   // 'owned' | 'craft'
  let rarity     = 'all';
  let statFilter = 'all';
  let readyOnly  = false;
  let selected   = 0;

  const itemKeyOf = it => it.item_stats?.key || it.item_stats?.icon;

  // What onboarding has the player forge first: the cheapest thing in the
  // catalog (50 gold, no materials, no progress gate), so the step can never
  // wall a new player who spent their embark rewards elsewhere.
  const TUTORIAL_CRAFT_KEY = 'padded_armor';

  const RARITIES = ['common', 'rare', 'epic', 'mythic'];
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

  function itemPassiveHtml(stats) {
    const key = stats?.passive;
    if (!key) return '';
    const def = resolveAbility(key);
    // abilityName, not def.name: the Russian name lives on the definition as
    // name_ru, so reading .name directly left every item-granted passive in
    // English while the rest of the card translated.
    const label = abilityName(def) || String(key).split(' ')[0].replace(/_/g, ' ');
    return `<button class="item-passive" data-ability-key="${key}" data-ability-type="passive">
              <span class="item-passive-icon">✦</span>${label}
            </button>`;
  }

  function itemTagsHtml(stats) {
    const ru = L === 'ru';
    return [
      stats.tag_required ? `<span class="item-card-tag">${ru ? 'Требует' : 'Requires'}: ${stats.tag_required}</span>` : '',
      stats.adds_tag     ? `<span class="item-card-tag item-card-tag--adds">${ru ? 'Даёт метку' : 'Grants tag'}: ${stats.adds_tag}</span>` : '',
    ].join('');
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
    const holderName = holder ? unitName(resolveUnitDef(holder)) : '';
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
            ${itemPassiveHtml(stats)}
            <div class="item-card-tags">${itemTagsHtml(stats)}</div>
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
    const factionOk   = !itemDef.faction || itemDef.faction === player.faction;
    const unlocked    = meetsCraftRequirements(itemDef, progress);
    const uniqueOwned = !!itemDef.unique && ownedCount > 0;
    const canCraft    = forgeOpen && factionOk && unlocked && hasCraftMaterials(itemDef) && !uniqueOwned;

    let blocked = '';
    // The forge gate outranks every other reason: with no Blacksmith nothing on
    // this page is craftable, so saying so once is clearer than listing each
    // item's own unmet requirement behind a wall that hides them all anyway.
    if (!forgeOpen)      blocked = T('noForge');
    else if (uniqueOwned)     blocked = T('uniqueOwned');
    else if (!factionOk) blocked = T('wrongFaction');
    else if (!unlocked)  blocked = `🔒 ${craftRequirementText(itemDef, L)}`;

    const countLine = ownedCount > 0 ? `${T('owned')} ×${ownedCount}` : '';

    return `
      <div class="item-card item-card--catalog item-card--rarity-${itemRarity(itemDef)} ${canCraft ? 'item-card--available' : ''}">
        <div class="item-card-body">
          ${itemAsideHtml({
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
        <div class="item-cost">${costChips(itemDef.cost || {}, itemDef.item_cost || {})}</div>
        <!-- The reason goes IN the button rather than on a line under it: the
             button is dead anyway while a reason exists, so its label is free
             space, and one element cannot disagree with itself about whether the
             item is craftable. Missing materials stay unlabelled — the cost
             chips above already say which, and repeating it in the button would
             be the one case where the reason is longer than the card. -->
        <button class="item-action-btn item-action-btn--craft${blocked ? ' item-action-btn--blocked' : ''}"
                data-craft-key="${itemDef.key}" ${canCraft ? '' : 'disabled'}
                ${blocked ? `title="${blocked}"` : ''}>${blocked || T('craft')}</button>
      </div>`;
  }

  // ── The list ──────────────────────────────────────────────────────────────
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

  function trackCards(list) {
    if (!list.length) return `<span class="track-empty-hint">${T('nothingMatches')}</span>`;
    return list.map((entry, i) => `
      <div class="portrait-card portrait-card--item ${i === selected ? 'portrait-card--selected' : ''}"
           data-i="${i}" title="${entryName(entry)}">
        <img class="portrait-art-img" src="${assetUrl(`/assets/icons/items/${entryIcon(entry)}.png`)}"
             alt="${entryName(entry)}" onerror="this.style.display='none'">
        ${entry.kind === 'blueprint'
          ? (entry.owned > 0 ? `<span class="item-track-owned">${entry.owned}</span>` : '')
          : ((entry.count ?? 1) > 1 ? `<span class="item-track-owned">${entry.count}</span>` : '')}
      </div>`).join('');
  }

  function detailCard(entry) {
    if (!entry) return `<p class="placeholder">${T('nothingMatches')}</p>`;
    return entry.kind === 'blueprint'
      ? buildCatalogItemCard(entry.def, entry.owned)
      : buildOwnedItemCard(entry.item, entry.count ?? 1);
  }

  function render() {
    const tab = (id, label) =>
      `<button class="items-tab ${filter === id ? 'items-tab--active' : ''}" data-filter="${id}">${label}</button>`;
    const opt = (id, label, current) =>
      `<option value="${id}"${current === id ? ' selected' : ''}>${label}</option>`;

    const list = currentList();
    if (selected >= list.length) selected = 0;

    host.innerHTML = `
      <div class="items-tabs">
        ${tab('craft', T('tabCraft'))}
        ${tab('owned', T('tabOwned'))}
      </div>

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

      <div class="item-detail" id="item-detail">${detailCard(list[selected])}</div>

      <div class="prep-track-wrap items-track-wrap">
        <div class="portrait-track" id="items-track">${trackCards(list)}</div>
      </div>`;
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
    if (idx !== selected) {
      selected = idx;
      refreshList({ keepSelection: true });
    }
    const btn = host.querySelector('.item-action-btn--craft:not([disabled])');
    if (!btn) return;   // cannot afford it yet; the step waits
    showTutorialSpotlight(player, 'craft_item', btn, {
      resolveTarget: () => host.querySelector('.item-action-btn--craft:not([disabled])'),
    });
  }

  function centreSelectedItem(behavior = 'smooth') {
    host.querySelector('#items-track .portrait-card--selected')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior });
  }

  // The detail card and the selector track are two views of currentList(), so
  // they are always repainted together.
  function refreshList({ keepSelection = false } = {}) {
    const list = currentList();
    if (!keepSelection || selected >= list.length) selected = 0;
    const detail = host.querySelector('#item-detail');
    const track  = host.querySelector('#items-track');
    if (detail) detail.innerHTML = detailCard(list[selected]);
    if (track)  track.innerHTML  = trackCards(list);
    centreSelectedItem('auto');
  }

  host.addEventListener('change', e => {
    const sel = e.target.closest('select');
    if (!sel) return;
    if (sel.id === 'items-rarity-select') {
      rarity = sel.value;
      sel.className = `items-select items-select--rarity-${rarity}`;
      refreshList();
      return;
    }
    if (sel.id === 'items-stat-select') {
      statFilter = sel.value;
      refreshList();
    }
  });

  host.addEventListener('click', async e => {
    const tabBtn = e.target.closest('[data-filter]');
    if (tabBtn) { filter = tabBtn.dataset.filter; selected = 0; render(); return; }

    if (e.target.closest('#items-ready-toggle')) { readyOnly = !readyOnly; render(); return; }

    const trackCard = e.target.closest('#items-track .portrait-card');
    if (trackCard) {
      selected = Number(trackCard.dataset.i);
      const list = currentList();
      host.querySelector('#item-detail').innerHTML = detailCard(list[selected]);
      host.querySelectorAll('#items-track .portrait-card').forEach((c, ci) =>
        c.classList.toggle('portrait-card--selected', ci === selected));
      centreSelectedItem();
      return;
    }

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
  // this screen for as long as it is mounted.
  function showTrophyBar() {
    const trophyItems = resources.filter(r => r.item_type === 'trophy' && r.amount > 0);
    document.getElementById('roster-trophy-bar')?.remove();
    if (!trophyItems.length) return;

    const bar = document.createElement('div');
    bar.id = 'roster-trophy-bar';
    bar.className = 'roster-trophy-bar';
    // Tappable, like the cost chips. A trophy the player is short of is the one
    // thing on this screen they want to act on, and the answer — which region
    // drops it — was already a tap away from a cost chip but not from the bar
    // that shows what they own.
    bar.innerHTML = trophyItems.map(t => `
      <button class="trophy-bar-item" data-material="${t.item}"
              title="${materialName(t.item)} — ${t.amount}">
        <div class="trophy-bar-icon-wrap">
          <img src="${assetUrl(`/assets/icons/recources/${t.item}.png`)}"
              class="trophy-bar-icon"
              alt="${t.item}"
              onerror="this.style.display='none';this.nextSibling.style.display='flex';">
          <span class="trophy-bar-icon-fallback">🏆</span>
        </div>
        <span class="trophy-bar-val">${t.amount}</span>
      </button>`).join('');

    // The bar is mounted OUTSIDE this screen's host (it sits under the resource
    // strip), so the host's delegated click never reaches it — it needs its own.
    bar.addEventListener('click', e => {
      const chip = e.target.closest('[data-material]');
      if (chip) openMaterialSheet(chip.dataset.material);
    });

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
  function hasBlacksmith(buildingsData) {
    return Object.entries(buildingsData || {}).some(([slot, state]) =>
      /^slot_\d+$/.test(slot) && state?.building_id === 'blacksmith' && (state.level ?? 0) >= 1);
  }

  // Every slice this screen needs comes from the single /bootstrap payload.
  function applyBootstrap(boot) {
    if (!boot) return null;
    units     = boot.roster || [];
    items     = boot.items || [];
    resources = [...(boot.resources || []), ...(boot.trophies || [])];
    progress  = boot.progress || {};
    forgeOpen = hasBlacksmith(boot.structures?.buildings_data);
    return boot;
  }

  async function load() {
    applyBootstrap(await bootstrapCache.get(player.chat_id));
    render();
    maybeShowCraftTutorial();
    showTrophyBar();
  }

  load();
}