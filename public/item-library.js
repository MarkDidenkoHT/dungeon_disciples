import { assetUrl } from './asset_base.js';

// The grid + detail view shared by the items screen (craft / owned) and the
// castle's equip picker. It owns the tabs, the filter bar, the tile grid and
// the view that opens over them; each screen keeps its own list building and
// its own action button, which lives inside the detail HTML it supplies.

export function matchesStatFilter(stats, statFilter) {
  if (statFilter === 'all') return true;
  if (statFilter === 'passive')    return !!stats?.passive;
  if (statFilter === 'grants_tag') return !!stats?.adds_tag;
  if (statFilter === 'strips_tag') return !!stats?.removes_tag;
  if (statFilter === 'needs_tag')  return !!stats?.tag_required;
  const mods = stats?.stat_mods || {};
  if (statFilter === 'resist') return Object.keys(mods).some(k => k.endsWith('_resist'));
  return Object.prototype.hasOwnProperty.call(mods, statFilter);
}

export function mountItemLibrary(host, opts = {}) {
  const {
    tabs = [],
    rarities = [],
    rarityLabel = r => r,
    anyLabel = 'Any',
    allLabel = 'All',
    statFilters = [],
    traitFilters = [],
    statsGroupLabel = 'Stats',
    traitsGroupLabel = 'Traits',
    rarityAria = 'Rarity',
    statAria = 'Stat',
    chip = null,
    emptyText = '',
    present = 'modal',
    getList,
    tileOf,
    renderDetail,
    onTabChange = () => {},
    onFilterChange = () => {},
    onChipToggle = () => {},
    onOpenChange = () => {},
  } = opts;

  let tab     = opts.tab ?? tabs[0]?.id ?? null;
  let rarity  = 'all';
  let stat    = 'all';
  let chipOn  = false;
  let openIdx = null;

  const state = () => ({ tab, rarity, stat, chipOn });
  const chipVisible = () => !!chip && (!chip.showFor || chip.showFor.includes(tab));

  function tabsHtml() {
    if (tabs.length < 2) return '';
    return `<div class="items-tabs">${tabs.map(t =>
      `<button class="items-tab ${t.id === tab ? 'items-tab--active' : ''}" data-lib-tab="${t.id}">${t.label}</button>`
    ).join('')}</div>`;
  }

  function filtersHtml() {
    const opt = (id, label, cur) => `<option value="${id}"${cur === id ? ' selected' : ''}>${label}</option>`;
    return `
      <div class="items-filters">
        <div class="items-filter-row items-filter-row--selects">
          <select class="items-select items-select--rarity-${rarity}" id="lib-rarity-select" aria-label="${rarityAria}">
            ${opt('all', anyLabel, rarity)}
            ${rarities.map(r => opt(r, rarityLabel(r), rarity)).join('')}
          </select>
          <select class="items-select" id="lib-stat-select" aria-label="${statAria}">
            ${opt('all', allLabel, stat)}
            <optgroup label="${statsGroupLabel}">
              ${statFilters.map(([id, label]) => opt(id, label, stat)).join('')}
            </optgroup>
            <optgroup label="${traitsGroupLabel}">
              ${traitFilters.map(([id, label]) => opt(id, label, stat)).join('')}
            </optgroup>
          </select>
          ${chipVisible() ? `<button class="items-chip items-chip--toggle ${chipOn ? 'items-chip--active' : ''}" id="lib-chip-toggle">${chip.label}</button>` : ''}
        </div>
      </div>`;
  }

  function tileHtml(entry, i) {
    const t = tileOf(entry) || {};
    const iconId = t.iconId || 'item';
    const cls = [
      'item-tile',
      `item-tile--rarity-${t.rarity || 'common'}`,
      t.dim   ? 'item-tile--dim'   : '',
      t.ready ? 'item-tile--ready' : '',
      t.worn  ? 'item-tile--worn'  : '',
    ].filter(Boolean).join(' ');
    return `
      <button class="${cls}" data-lib-i="${i}" title="${t.name || ''}" type="button">
        <span class="item-tile-art">
          <img src="${assetUrl(`/assets/icons/items/${iconId}.png`)}" alt="${t.name || ''}"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <span class="item-tile-art-fallback" style="display:none;">&#9881;</span>
        </span>
        <span class="item-tile-name">${t.name || ''}</span>
        ${t.badge ? `<span class="item-tile-badge">${t.badge}</span>` : ''}
        ${t.flag  ? `<span class="item-tile-flag">${t.flag}</span>` : ''}
      </button>`;
  }

  function gridHtml(list) {
    if (!list.length) return `<div class="item-grid-empty">${emptyText}</div>`;
    return list.map(tileHtml).join('');
  }

  function viewHtml() {
    return `
      <div class="item-view item-view--${present}" id="lib-view" hidden>
        <div class="item-view-backdrop" data-lib-dismiss></div>
        <div class="item-view-panel">
          <div class="item-view-nav">
            <button class="item-view-close" type="button" data-lib-dismiss aria-label="Close">${present === 'push' ? '&lsaquo;' : '&times;'}</button>
            <button class="item-view-arrow" type="button" data-lib-step="-1" aria-label="Previous">&lsaquo;</button>
            <span class="item-view-pos"></span>
            <button class="item-view-arrow" type="button" data-lib-step="1" aria-label="Next">&rsaquo;</button>
          </div>
          <div class="item-view-body" id="lib-view-body"></div>
        </div>
      </div>`;
  }

  function paint() {
    const list = getList();
    if (openIdx != null && openIdx >= list.length) openIdx = null;
    host.innerHTML = `
      <div class="item-library">
        ${tabsHtml()}
        ${filtersHtml()}
        <div class="item-grid" id="lib-grid">${gridHtml(list)}</div>
        ${viewHtml()}
      </div>`;
    if (openIdx != null) paintView(list);
  }

  // Only what the list drives, so a repaint behind an open view does not
  // rebuild the selects the player is interacting with.
  function refresh() {
    const list = getList();
    if (openIdx != null && openIdx >= list.length) closeView();
    const grid = host.querySelector('#lib-grid');
    if (grid) grid.innerHTML = gridHtml(list);
    if (openIdx != null) paintView(list);
  }

  function paintView(list = getList()) {
    const view = host.querySelector('#lib-view');
    const body = host.querySelector('#lib-view-body');
    if (!view || !body) return;
    if (openIdx == null) { view.hidden = true; return; }
    view.hidden = false;
    body.innerHTML = renderDetail(list[openIdx]);
    body.scrollTop = 0;
    const pos = view.querySelector('.item-view-pos');
    if (pos) pos.textContent = `${openIdx + 1} / ${list.length}`;
    view.querySelectorAll('[data-lib-step]').forEach(b => { b.disabled = list.length < 2; });
  }

  function openAt(i) {
    const list = getList();
    if (!list.length) return;
    openIdx = Math.max(0, Math.min(list.length - 1, i));
    paintView(list);
    onOpenChange(list[openIdx], openIdx);
  }

  function closeView() {
    if (openIdx == null) return;
    openIdx = null;
    const view = host.querySelector('#lib-view');
    if (view) view.hidden = true;
    onOpenChange(null, null);
  }

  function step(delta) {
    const list = getList();
    if (openIdx == null || list.length < 2) return;
    openAt((openIdx + delta + list.length) % list.length);
  }

  host.addEventListener('change', e => {
    const sel = e.target.closest('select');
    if (!sel) return;
    if (sel.id === 'lib-rarity-select') {
      rarity = sel.value;
      sel.className = `items-select items-select--rarity-${rarity}`;
      closeView();
      refresh();
      onFilterChange(state());
      return;
    }
    if (sel.id === 'lib-stat-select') {
      stat = sel.value;
      closeView();
      refresh();
      onFilterChange(state());
    }
  });

  host.addEventListener('click', e => {
    if (e.target.closest('[data-lib-dismiss]')) { closeView(); return; }

    const stepBtn = e.target.closest('[data-lib-step]');
    if (stepBtn) { step(Number(stepBtn.dataset.libStep)); return; }

    const tabBtn = e.target.closest('[data-lib-tab]');
    if (tabBtn) {
      tab = tabBtn.dataset.libTab;
      openIdx = null;
      paint();
      onTabChange(tab);
      return;
    }

    if (e.target.closest('#lib-chip-toggle')) {
      chipOn = !chipOn;
      openIdx = null;
      paint();
      onChipToggle(chipOn);
      return;
    }

    const tile = e.target.closest('[data-lib-i]');
    if (tile) openAt(Number(tile.dataset.libI));
  });

  // Swipe through the filtered list without closing — the arrows the old
  // carousel had, moved inside the view they now page.
  let touchX = null;
  let touchY = null;
  host.addEventListener('touchstart', e => {
    if (openIdx == null || !e.target.closest('.item-view-panel')) return;
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  host.addEventListener('touchend', e => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    touchX = touchY = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  paint();

  return {
    paint,
    refresh,
    openAt,
    close: closeView,
    isOpen: () => openIdx !== null,
    openIndex: () => openIdx,
    filters: state,
    setTab(id) { tab = id; openIdx = null; paint(); },
  };
}
