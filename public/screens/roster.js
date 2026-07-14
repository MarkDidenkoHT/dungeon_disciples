import { api }              from '../api.js';
import { refreshResourceBar } from '../api.js';
import { resourceCache, structuresCache, bootstrapCache } from '../api.js';
import { SPELLS }           from '../../data/spells.js';
import { ITEM_DEFS }        from '../../data/items.js';
import {
  RESIST_ICONS, RESIST_ORDER,
  cap, dmgReduction,
  resolveUnitDef, resolveAbility, buildStatDescription,
  renderModalContent, openSheet, closeSheet, openSubSheet, applyBackground,
  renderUnitPortrait, renderUnitCoreStatsColumn, renderUnitResistColumn, renderUnitAbilitiesRow,
  renderItemSlotIcon, withEquippedItem, buildAbilityModalParts,
  getActionLabel,
} from '../utils.js';

export function renderRoster(root, { player }) {
  applyBackground(root, player.faction, 'roster');

  root.innerHTML = `
    <div class="screen screen-roster">
      <main class="roster-main">
        <div class="roster-slider-wrap">
          <div class="roster-track" id="roster-track"></div>
        </div>
      </main>

      <div class="roster-nav" id="roster-nav">
        <button class="roster-nav-arrow" id="nav-prev">‹</button>
        <div class="roster-nav-dots" id="roster-dots"></div>
        <button class="roster-nav-arrow" id="nav-next">›</button>
      </div>
    </div>
  `;

  let current = 0;
  let units   = [];

  const track    = root.querySelector('#roster-track');
  const dotsWrap = root.querySelector('#roster-dots');
  const prevBtn  = root.querySelector('#nav-prev');
  const nextBtn  = root.querySelector('#nav-next');

  let buildingsData = {};
  let upgradePaths  = {};
  let items         = [];
  let resources     = [];

  function equippedItemFor(rosterId) {
    return items.find(it => String(it.equipped_by) === String(rosterId)) || null;
  }

  function openModal(title, bodyHtml, badgesHtml = '') { openSheet(title, bodyHtml, badgesHtml); }

  function buildCard(u) {
    const stored   = u.unit_data || {};
    const def      = resolveUnitDef(u);
    const isHero   = u.is_hero === true;
    const unitId   = stored.unit_id || '';
    const unitName = def?.name ?? unitId;

    const tier      = def?.t ?? 1;
    const tierLabel = isHero ? `Hero Lv ${tier}` : `Lv ${tier}`;

    const currentXp  = stored.current_xp ?? 0;
    const currentHp  = stored.current_hp != null ? stored.current_hp : (def?.hp ?? '—');
    const maxHp      = stored.max_hp != null ? stored.max_hp : (def?.hp ?? '—');
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

    const isMaxTier = !isHero && xpRequired === null && !Object.values(upgradePaths).some(fp => fp[unitId]);
    const hasPath   = !isHero && !isMaxTier && xpRequired !== null;

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
        const matched        = unitPaths.find(p => p.building_id === slotBuildingId);
        upgradeReady         = !!matched;
        if (!upgradeReady) upgradeBuildingHint = `Requires: ${unitPaths.map(p => p.label).join(' or ')}`;
      }
    }

    let canLevelUp = hasPath && currentXp >= xpRequired && upgradeReady;

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
    const resurrectButtonHtml = !alive && resurrectionSpell ? `
      <div class="unit-resurrect-row">
        <button class="resurrect-btn" data-roster-id="${u.id}" data-spell-id="${resurrectionSpell.id}">
          Resurrect (${resurrectionCost})
        </button>
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

        if (!blocked) canLevelUp = true;

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
          <span class="hero-level-label">${isMaxTier ? 'Maximum Level Reached' : 'Cannot Upgrade'}</span>
        </div>`;
    }

    const itemSlotHtml  = renderItemSlotIcon(equippedItem, u.id);
    const abilitiesHtml = renderUnitAbilitiesRow(liveUnit, { itemSlotHtml });

    return `
      <div class="roster-slide">
        <div class="unit-card ${alive ? '' : 'unit-card--dead'}">
          <div class="unit-main-row">
            ${coreHtml}
            ${portraitHtml}
            ${resistsHtml}
          </div>
          <div class="unit-info">
            ${resurrectButtonHtml}
            ${levelUpHtml}
            ${abilitiesHtml}
          </div>
        </div>
      </div>`;
  }

  function updateNav() {
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === units.length - 1;
    dotsWrap.querySelectorAll('.roster-dot').forEach((d, i) => {
      d.classList.toggle('roster-dot--active', i === current);
    });
  }

  function goTo(idx) {
    current = Math.max(0, Math.min(idx, units.length - 1));
    track.style.transform = `translateX(-${current * 100}%)`;
    updateNav();
  }

  prevBtn.addEventListener('click', () => goTo(current - 1));
  nextBtn.addEventListener('click', () => goTo(current + 1));

  function initSlider() {
    track.innerHTML = units.map(u => buildCard(u)).join('');

    dotsWrap.innerHTML = units.map((_, i) =>
      `<span class="roster-dot" data-i="${i}"></span>`
    ).join('');

    dotsWrap.querySelectorAll('.roster-dot').forEach(dot => {
      dot.addEventListener('click', () => goTo(Number(dot.dataset.i)));
    });

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
      try {
        await api('/roster/levelup', { chat_id: player.chat_id, roster_id: rosterId });
        const [freshUnits, freshStruct] = await Promise.all([
          api(`/roster?chat_id=${player.chat_id}`),
          (structuresCache.invalidate(), structuresCache.get(player.chat_id).catch(() => null)),
        ]);
        units         = freshUnits;
        buildingsData = freshStruct?.buildings_data || {};
        refreshResourceBar(player).catch(() => {});
        const savedIdx = current;
        initSlider();
        goTo(savedIdx);
      } catch (err) {
        lvlBtn.disabled    = false;
        lvlBtn.textContent = 'Level Up';
        alert(err.message || 'Level up failed');
      }
      return;
    }

    const resurrectBtn = e.target.closest('.resurrect-btn');
    if (resurrectBtn) {
      const rosterId = resurrectBtn.dataset.rosterId;
      const spellId  = resurrectBtn.dataset.spellId;
      resurrectBtn.disabled    = true;
      resurrectBtn.textContent = 'Resurrecting…';
      try {
        await api('/roster/resurrect', { chat_id: player.chat_id, roster_id: rosterId, spell_id: spellId });
        const freshUnits = await api(`/roster?chat_id=${player.chat_id}`);
        units = freshUnits.slice().sort((a, b) => (b.is_hero === true) - (a.is_hero === true));
        await refreshResourceBar(player).catch(() => {});
        const savedIdx = current;
        initSlider();
        goTo(savedIdx);
      } catch (err) {
        alert(err.message || 'Resurrection failed');
      }
      return;
    }

    const abilityBtn = e.target.closest('.ability-icon:not([data-item-slot]):not([data-item-inspect])');
    if (abilityBtn) {
      const key  = abilityBtn.dataset.abilityKey;
      const type = abilityBtn.dataset.abilityType;
      const def  = resolveAbility(key);
      if (!def) return;
      const parts = buildAbilityModalParts(def, type);
      openDetailModal(parts.title, parts.body, parts.badges);
      return;
    }

    const armorCell = e.target.closest('[data-armor]');
    if (armorCell) {
      const val = parseInt(armorCell.dataset.armor ?? '0', 10);
      const bodyHtml = renderModalContent(`Armor: ${val}\nReduces physical damage taken. Each point of armor reduces damage by 1%.`);
      openDetailModal('Armor', bodyHtml);
      return;
    }

    const coreStat = e.target.closest('.core-stat');
    if (coreStat) {
      const label  = coreStat.querySelector('.core-stat-label')?.textContent?.trim() || '';
      const val    = coreStat.querySelector('.core-stat-val')?.textContent?.trim() || '—';
      let text = '';
      if (label === 'HP') {
        text = `HP: ${val}\nCurrent hit points. Unit is defeated when HP reaches 0.`;
      } else if (label === 'Init') {
        text = `Initiative: ${val}\nDetermines turn order in combat. Higher acts first.`;
      } else if (label === 'Power') {
        text = `Power: ${val}\nBase damage or healing output of the unit's action.`;
      } else if (label === 'Action') {
        text = `Action: ${val}\nThe type of action this unit performs each turn.`;
      } else if (label === 'XP') {
        text = `Experience: ${val}\nAccumulated XP toward next level.`;
      } else {
        text = `${label}: ${val}`;
      }
      openDetailModal(label, renderModalContent(text));
      return;
    }

    const resistCell = e.target.closest('.resist-cell');
    if (resistCell) {
      if (resistCell.dataset.armor !== undefined) return;
      const label  = resistCell.getAttribute('title') || '';
      const valEl  = resistCell.querySelector('.resist-val');
      const numVal = parseInt(valEl?.textContent ?? '0', 10);
      let text = '';
      if (numVal === 0) {
        text = `${label} Resistance: 0\nNo modifier to ${label.toLowerCase()} damage taken.`;
      } else if (numVal > 0) {
        text = `${label} Resistance: +${numVal}\nReduces ${label.toLowerCase()} damage taken.`;
      } else {
        text = `${label} Resistance: ${numVal}\nIncreases ${label.toLowerCase()} damage taken.`;
      }
      openDetailModal(label, renderModalContent(text));
      return;
    }

    const itemSlot = e.target.closest('[data-item-slot]');
    if (itemSlot) {
      const rosterId = itemSlot.dataset.rosterId;
      openItemModal(rosterId);
      return;
    }
  });

  function formatStatMods(statMods) {
    statMods = statMods || {};
    return Object.entries(statMods).map(([key, val]) => {
      const sign = val >= 0 ? '+' : '';
      if (key === 'hp')    return `${sign}${val} HP`;
      if (key === 'armor') return `${sign}${val} Armor`;
      const resistMatch = key.match(/^(air|fire|nature|cold|life|death)_resist$/);
      if (resistMatch) return `${sign}${val} ${cap(resistMatch[1])} Resist`;
      return `${sign}${val} ${cap(key)}`;
    }).join(', ');
  }

  function buildItemCard(item, unit, unitTags) {
    const stats        = item.item_stats || {};
    const iconId        = stats.icon || stats.key || 'item';
    const equippedHere  = String(item.equipped_by) === String(unit.id);
    const equippedElsewhere = item.equipped_by != null && !equippedHere;
    const factionOk     = !stats.faction || stats.faction === player.faction;
    const tagOk          = !stats.tag_required || unitTags.includes(stats.tag_required);
    const canEquip       = factionOk && tagOk && !equippedHere;

    let reason = '';
    if (!factionOk) reason = 'Wrong faction';
    else if (!tagOk) reason = `Requires ${stats.tag_required} tag`;
    else if (equippedElsewhere) reason = 'Equipped on another unit';

    return `
      <div class="item-card ${equippedHere ? 'item-card--equipped' : ''}">
        <div class="item-card-icon">
          <img src="/assets/icons/items/${iconId}.png" alt="${item.item_name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <span class="item-card-icon-fallback" style="display:none;">⚙</span>
        </div>
        <div class="item-card-name">${item.item_name}</div>
        ${stats.tag_required ? `<div class="item-card-tag">Requires: ${stats.tag_required}</div>` : ''}
        ${stats.adds_tag     ? `<div class="item-card-tag item-card-tag--adds">Grants tag: ${stats.adds_tag}</div>` : ''}
        <div class="item-card-stats">${formatStatMods(stats.stat_mods)}</div>
        ${equippedHere
          ? `<button class="item-action-btn item-action-btn--unequip" data-item-id="${item.id}">Unequip</button>`
          : `<button class="item-action-btn item-action-btn--equip" data-item-id="${item.id}" data-roster-id="${unit.id}" ${canEquip ? '' : 'disabled'}>Equip</button>`}
        ${!canEquip && !equippedHere ? `<div class="item-card-blocked">${reason}</div>` : ''}
      </div>`;
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

  function buildCatalogItemCard(itemDef, ownedInstance, unit, unitTags) {
    if (ownedInstance) return buildItemCard(ownedInstance, unit, unitTags);

    const iconId      = itemDef.icon || itemDef.key || 'item';
    const cost         = itemDef.cost      || {};
    const itemCost     = itemDef.item_cost || {};
    const factionOk    = !itemDef.faction || itemDef.faction === player.faction;
    const canAfford    = Object.entries(cost).every(([resName, amount]) => (resources.find(r => r.item === resName)?.amount ?? 0) >= amount) &&
                         Object.entries(itemCost).every(([key, count]) => items.filter(it => (it.item_stats?.key || it.item_stats?.icon) === key && !it.equipped_by).length >= count);
    const canCraft     = factionOk && canAfford;

    return `
      <div class="item-card item-card--catalog">
        <div class="item-card-icon">
          <img src="/assets/icons/items/${iconId}.png" alt="${itemDef.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <span class="item-card-icon-fallback" style="display:none;">⚙</span>
        </div>
        <div class="item-card-name">${itemDef.name}</div>
        ${itemDef.faction      ? `<div class="item-card-tag">Faction: ${cap(itemDef.faction.replace(/_/g, ' '))}</div>` : ''}
        ${itemDef.tag_required ? `<div class="item-card-tag">Requires: ${itemDef.tag_required}</div>` : ''}
        ${itemDef.adds_tag     ? `<div class="item-card-tag item-card-tag--adds">Grants tag: ${itemDef.adds_tag}</div>` : ''}
        <div class="item-card-stats">${formatStatMods(itemDef.stat_mods)}</div>
        <div class="item-cost">${formatCost(cost, itemCost)}</div>
        <button class="item-action-btn item-action-btn--craft" data-craft-key="${itemDef.key}" ${canCraft ? '' : 'disabled'}>Craft</button>
        ${!factionOk ? `<div class="item-card-blocked">Wrong faction</div>` : (!canAfford ? `<div class="item-card-blocked">Not enough resources</div>` : '')}
      </div>`;
  }

  function openItemModal(rosterId) {
    const unit = units.find(u => String(u.id) === String(rosterId));
    if (!unit) return;
    const def      = resolveUnitDef(unit);
    const unitTags = (def?.tags || []).filter(Boolean);

    let filter = 'equippable';

    function render() {
      if (filter === 'catalog') {
        const cardsHtml = Object.values(ITEM_DEFS).map(itemDef => {
          const ownedInstance = items.find(it => (it.item_stats?.key || it.item_stats?.icon) === itemDef.key);
          return buildCatalogItemCard(itemDef, ownedInstance, unit, unitTags);
        }).join('');

        return `
          <div class="items-modal">
            <div class="items-filter-bar">
              <button class="items-filter-btn ${filter === 'equippable' ? 'items-filter-btn--active' : ''}" data-filter="equippable">Equippable</button>
              <button class="items-filter-btn ${filter === 'all' ? 'items-filter-btn--active' : ''}" data-filter="all">All Items</button>
              <button class="items-filter-btn ${filter === 'catalog' ? 'items-filter-btn--active' : ''}" data-filter="catalog">Catalog</button>
            </div>
            <div class="items-slider">${cardsHtml}</div>
          </div>`;
      }

      const filtered = items.filter(it => {
        if (filter === 'all') return true;
        const stats    = it.item_stats || {};
        const factionOk = !stats.faction || stats.faction === player.faction;
        const tagOk     = !stats.tag_required || unitTags.includes(stats.tag_required);
        const equippedHere = String(it.equipped_by) === String(rosterId);
        return equippedHere || (factionOk && tagOk && (it.equipped_by == null));
      });

      const cardsHtml = filtered.length
        ? filtered.map(it => buildItemCard(it, unit, unitTags)).join('')
        : `<p class="placeholder">No items to show.</p>`;

      return `
        <div class="items-modal">
          <div class="items-filter-bar">
            <button class="items-filter-btn ${filter === 'equippable' ? 'items-filter-btn--active' : ''}" data-filter="equippable">Equippable</button>
            <button class="items-filter-btn ${filter === 'all' ? 'items-filter-btn--active' : ''}" data-filter="all">All Items</button>
            <button class="items-filter-btn ${filter === 'catalog' ? 'items-filter-btn--active' : ''}" data-filter="catalog">Catalog</button>
          </div>
          <div class="items-slider">${cardsHtml}</div>
        </div>`;
    }

    openSheet('Items', render());

    const body = document.querySelector('.modal-body');

    async function refreshAndRerender() {
      items = await api(`/items?chat_id=${player.chat_id}`).catch(() => items);
      body.innerHTML = render();
    }

    body.addEventListener('click', async (e) => {
      const filterBtn = e.target.closest('[data-filter]');
      if (filterBtn) {
        filter = filterBtn.dataset.filter;
        body.innerHTML = render();
        return;
      }

      const equipBtn = e.target.closest('.item-action-btn--equip');
      if (equipBtn && !equipBtn.disabled) {
        equipBtn.disabled    = true;
        equipBtn.textContent = 'Equipping…';
        try {
          await api('/items/equip', { chat_id: player.chat_id, roster_id: equipBtn.dataset.rosterId, item_id: equipBtn.dataset.itemId });
          const freshUnits = await api(`/roster?chat_id=${player.chat_id}`);
          units = freshUnits.slice().sort((a, b) => (b.is_hero === true) - (a.is_hero === true));
          await refreshAndRerender();
          const savedIdx = current;
          initSlider();
          goTo(savedIdx);
        } catch (err) {
          alert(err.message || 'Equip failed');
          body.innerHTML = render();
        }
        return;
      }

      const unequipBtn = e.target.closest('.item-action-btn--unequip');
      if (unequipBtn) {
        unequipBtn.disabled    = true;
        unequipBtn.textContent = 'Unequipping…';
        try {
          await api('/items/unequip', { chat_id: player.chat_id, item_id: unequipBtn.dataset.itemId });
          const freshUnits = await api(`/roster?chat_id=${player.chat_id}`);
          units = freshUnits.slice().sort((a, b) => (b.is_hero === true) - (a.is_hero === true));
          await refreshAndRerender();
          const savedIdx = current;
          initSlider();
          goTo(savedIdx);
        } catch (err) {
          alert(err.message || 'Unequip failed');
          body.innerHTML = render();
        }
        return;
      }

      const craftBtn = e.target.closest('.item-action-btn--craft');
      if (craftBtn && !craftBtn.disabled) {
        craftBtn.disabled    = true;
        craftBtn.textContent = 'Crafting…';
        try {
          const result = await api('/items/craft', { chat_id: player.chat_id, item_key: craftBtn.dataset.craftKey });
          items     = result.items     || items;
          resources = result.resources || resources;
          refreshResourceBar(player).catch(() => {});
          body.innerHTML = render();
        } catch (err) {
          alert(err.message || 'Craft failed');
          body.innerHTML = render();
        }
        return;
      }
    });
  }

  async function load() {
    const [boot, fetchedItems] = await Promise.all([
      bootstrapCache.get(player.chat_id),
      api(`/items?chat_id=${player.chat_id}`).catch(() => []),
    ]);

    units         = (boot.roster || []).slice().sort((a, b) => (b.is_hero === true) - (a.is_hero === true));
    buildingsData = boot.structures?.buildings_data || {};
    upgradePaths  = boot.buildings?.upgrade_paths || {};
    items         = fetchedItems || [];
    resources     = [...(boot.resources || []), ...(boot.trophies || [])];

    if (!units.length) {
      track.innerHTML = `<div class="roster-slide"><p class="placeholder">No units yet.</p></div>`;
      return;
    }

    initSlider();
  }

  load();
}