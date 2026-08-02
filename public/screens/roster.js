import { api }              from '../api.js';
import { navigate }         from '../api.js';
import { refreshResourceBar } from '../api.js';
import { resourceCache, structuresCache, bootstrapCache } from '../api.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';
import { SPELLS }           from '../../data/spells.js';
import { UNIT_ABILITIES }   from '../../data/unit_abilities.js';
import { getEquipBlock }    from '../../data/item_rules.js';
import { ITEM_DEFS }        from '../../data/items.js';
import {
  RESIST_ICONS, RESIST_ORDER,
  cap, dmgReduction,
  resolveUnitDef, resolveAbility, buildStatDescription,
  renderModalContent, openSheet, closeSheet, openSubSheet, getSheetBody, applyBackground,
  renderUnitPortrait, renderUnitCoreStatsColumn, renderUnitResistColumn, renderUnitAbilitiesRow,
  renderItemSlotIcon, withEquippedItem, buildAbilityModalParts,
  getActionLabel, itemName, itemRarity,
} from '../utils.js';

export function renderRoster(root, { player }) {
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
    const healButtonHtml = isDamaged && healSpell ? `
      <div class="unit-heal-row">
        <button class="heal-btn" data-roster-id="${u.id}" data-spell-id="${healSpell.id}">
          Heal (${healCost})
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

    const itemSlotHtml  = renderItemSlotIcon(equippedItem, u.id, { player });
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
            ${healButtonHtml}
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
      try {
        await api('/roster/levelup', { chat_id: player.chat_id, roster_id: rosterId });
        const [freshUnits, freshStruct] = await Promise.all([
          api(`/roster?chat_id=${player.chat_id}`),
          (structuresCache.invalidate(), structuresCache.get(player.chat_id).catch(() => null)),
        ]);
        // Sorted hero-first like every other refresh — the raw rows come back
        // in insert order, which reshuffles the slider under the player.
        units         = freshUnits.slice().sort((a, b) => (b.is_hero === true) - (a.is_hero === true));
        buildingsData = freshStruct?.buildings_data || {};
        refreshResourceBar(player).catch(() => {});
        rerenderKeeping(rosterId);
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
        rerenderKeeping(rosterId);
        // Onboarding: revive done → move on to the heal step.
        if (spellTutorialActive && !isTutorialDone(player, 'spell_revive')) {
          markTutorialDone(player, 'spell_revive');
          hideTutorial();
          showHealStep();
        }
      } catch (err) {
        alert(err.message || 'Resurrection failed');
      }
      return;
    }

    const healBtn = e.target.closest('.heal-btn');
    if (healBtn) {
      const rosterId = healBtn.dataset.rosterId;
      const spellId  = healBtn.dataset.spellId;
      healBtn.disabled    = true;
      healBtn.textContent = 'Healing…';
      try {
        await api('/roster/heal', { chat_id: player.chat_id, roster_id: rosterId, spell_id: spellId });
        const freshUnits = await api(`/roster?chat_id=${player.chat_id}`);
        units = freshUnits.slice().sort((a, b) => (b.is_hero === true) - (a.is_hero === true));
        await refreshResourceBar(player).catch(() => {});
        rerenderKeeping(rosterId);
        // Onboarding: heal done → the spell tutorial is complete, on to embark.
        if (spellTutorialActive && !isTutorialDone(player, 'spell_heal')) {
          markTutorialDone(player, 'spell_heal');
          spellTutorialActive = false;
          hideTutorial();
          navigate('embark', { player });
        }
      } catch (err) {
        alert(err.message || 'Heal failed');
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
    // Incoherent pairings (a bleed-on-hit relic on a unit that only heals) are
    // refused with the reason spelled out — see data/item_rules.js.
    const block          = getEquipBlock(stats, resolveUnitDef(unit), UNIT_ABILITIES);
    const canEquip       = factionOk && tagOk && !block && !equippedHere;

    const ru = player?.settings?.language === 'ru';
    let reason = '';
    if (!factionOk) reason = ru ? 'Не та фракция' : 'Wrong faction';
    else if (!tagOk) reason = ru ? `Требуется метка ${stats.tag_required}` : `Requires ${stats.tag_required} tag`;
    else if (block) reason = ru ? block.reason_ru : block.reason;
    else if (equippedElsewhere) reason = ru ? 'Надет на другом бойце' : 'Equipped on another unit';

    return `
      <div class="item-card item-card--rarity-${itemRarity(item)} ${equippedHere ? 'item-card--equipped' : ''}">
        <div class="item-card-icon">
          <img src="/assets/icons/items/${iconId}.png" alt="${itemName(item, player)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <span class="item-card-icon-fallback" style="display:none;">⚙</span>
        </div>
        <div class="item-card-name">${itemName(item, player)}</div>
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

  function buildCatalogItemCard(itemDef, ownedCount, unit, unitTags) {
    const iconId      = itemDef.icon || itemDef.key || 'item';
    const cost         = itemDef.cost      || {};
    const itemCost     = itemDef.item_cost || {};
    const factionOk    = !itemDef.faction || itemDef.faction === player.faction;
    const canAfford    = Object.entries(cost).every(([resName, amount]) => (resources.find(r => r.item === resName)?.amount ?? 0) >= amount) &&
                         Object.entries(itemCost).every(([key, count]) => items.filter(it => (it.item_stats?.key || it.item_stats?.icon) === key && !it.equipped_by).length >= count);
    // Unique items you already own can never be re-crafted, no matter the cost.
    const uniqueOwned  = !!itemDef.unique && ownedCount > 0;
    const canCraft     = factionOk && canAfford && !uniqueOwned;

    // A short availability line: why you can (or can't) make this right now.
    let blocked = '';
    if (uniqueOwned)       blocked = 'Unique — already owned';
    else if (!factionOk)   blocked = 'Wrong faction';
    else if (!canAfford)   blocked = 'Not enough resources';

    const ownedBadge = ownedCount > 0
      ? `<div class="item-card-owned">${itemDef.unique ? 'Owned' : `Owned ×${ownedCount}`}</div>`
      : '';

    return `
      <div class="item-card item-card--catalog item-card--rarity-${itemRarity(itemDef)} ${canCraft ? 'item-card--available' : ''}">
        ${itemDef.unique ? '<div class="item-card-unique">Unique</div>' : ''}
        <div class="item-card-icon">
          <img src="/assets/icons/items/${iconId}.png" alt="${itemName(itemDef, player)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <span class="item-card-icon-fallback" style="display:none;">⚙</span>
        </div>
        <div class="item-card-name">${itemName(itemDef, player)}</div>
        ${ownedBadge}
        ${itemDef.tag_required ? `<div class="item-card-tag">Requires: ${itemDef.tag_required}</div>` : ''}
        ${itemDef.adds_tag     ? `<div class="item-card-tag item-card-tag--adds">Grants tag: ${itemDef.adds_tag}</div>` : ''}
        <div class="item-card-stats">${formatStatMods(itemDef.stat_mods)}</div>
        <div class="item-cost">${formatCost(cost, itemCost)}</div>
        <button class="item-action-btn item-action-btn--craft" data-craft-key="${itemDef.key}" ${canCraft ? '' : 'disabled'}>Craft</button>
        ${blocked ? `<div class="item-card-blocked">${blocked}</div>` : ''}
      </div>`;
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

    const resourceBar = document.getElementById('resource-bar');
    if (resourceBar) {
      resourceBar.insertAdjacentElement('afterend', bar);
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

    let filter = 'equippable'; // 'equippable' | 'owned' | 'craft'
    let search = '';

    const matchesSearch = name => !search || (name || '').toLowerCase().includes(search.toLowerCase());
    const itemKeyOf     = it => it.item_stats?.key || it.item_stats?.icon;

    // Just the cards — recomputed on every filter change AND every keystroke.
    // Kept separate from the chrome so live search can refresh the list without
    // rebuilding (and stealing focus from) the search input.
    function sliderCards() {
      if (filter === 'craft') {
        const cards = Object.values(ITEM_DEFS)
          // Other factions' items are never obtainable, so don't tease them.
          .filter(def => !def.faction || def.faction === player.faction)
          .filter(def => matchesSearch(itemName(def, player)))
          .map(def => {
            const ownedCount = items.filter(it => itemKeyOf(it) === def.key).length;
            return buildCatalogItemCard(def, ownedCount, unit, unitTags);
          });
        return cards.length ? cards.join('') : `<p class="placeholder">No items match.</p>`;
      }

      const filtered = items.filter(it => {
        if (!matchesSearch(itemName(it, player))) return false;
        if (filter === 'owned') return true;
        const stats    = it.item_stats || {};
        const factionOk = !stats.faction || stats.faction === player.faction;
        const tagOk     = !stats.tag_required || unitTags.includes(stats.tag_required);
        const equippedHere = String(it.equipped_by) === String(rosterId);
        return equippedHere || (factionOk && tagOk && (it.equipped_by == null));
      });

      return filtered.length
        ? filtered.map(it => buildItemCard(it, unit, unitTags)).join('')
        : `<p class="placeholder">No items to show.</p>`;
    }

    function render() {
      const chip = (id, label) =>
        `<button class="items-filter-btn ${filter === id ? 'items-filter-btn--active' : ''}" data-filter="${id}">${label}</button>`;
      return `
        <div class="items-modal">
          <input class="items-search" id="items-search" type="search" placeholder="Search items…"
                 value="${search.replace(/"/g, '&quot;')}" autocomplete="off">
          <div class="items-filter-bar">
            ${chip('equippable', 'Equippable')}
            ${chip('owned', 'Owned')}
            ${chip('craft', 'Craft')}
          </div>
          <div class="items-slider" id="items-slider">${sliderCards()}</div>
        </div>`;
    }

    openSheet('Items', render());

    const closeBtn = document.querySelector('.modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', hideTrophyBar, { once: true });
    }

    // Remove the trophy bar when the sheet is dismissed
    const _sheetCloseObserver = new MutationObserver(() => {
      const overlay = document.querySelector('.modal-overlay:not(.hidden):not(.modal-overlay--sub)');
      if (!overlay) {
        hideTrophyBar();
        _sheetCloseObserver.disconnect();
      }
    });
    _sheetCloseObserver.observe(document.body, { childList: true, subtree: true });

    // Bind to the MAIN sheet's body specifically. document.querySelector('.modal-body')
    // returns whichever sheet is first in the DOM — if a sub-sheet (ability/stat
    // detail) was opened earlier it can win, leaving this handler on a hidden body
    // so equip/craft taps never fire. getSheetBody() always targets the main sheet.
    const body = getSheetBody();

    async function refreshAndRerender() {
      items = await api(`/items?chat_id=${player.chat_id}`).catch(() => items);
      body.innerHTML = render();
    }

    // Repaint only the card list, leaving the search input (and its focus/caret)
    // untouched.
    function refreshSlider() {
      const slider = body.querySelector('#items-slider');
      if (slider) slider.innerHTML = sliderCards();
    }

    body.addEventListener('input', (e) => {
      if (e.target.id === 'items-search') {
        search = e.target.value;
        refreshSlider();
      }
    });

    body.addEventListener('click', async (e) => {
      const filterBtn = e.target.closest('[data-filter]');
      if (filterBtn) {
        filter = filterBtn.dataset.filter;
        // Update chip highlight + list in place so the search box survives.
        body.querySelectorAll('.items-filter-btn').forEach(b =>
          b.classList.toggle('items-filter-btn--active', b.dataset.filter === filter));
        refreshSlider();
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
          rerenderKeeping(equipBtn.dataset.rosterId);
          // Onboarding's last roster beat. Marked here, on the equip actually
          // succeeding, rather than on the tap that requested it.
          if (!isTutorialDone(player, 'roster_equip')) {
            markTutorialDone(player, 'roster_equip');
            closeSheet(); // navigate() clears the spotlight, but not the sheet
            showEquippedStep(equipBtn.dataset.rosterId);
          }
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
        const focusedId = units[current]?.id;
        try {
          await api('/items/unequip', { chat_id: player.chat_id, item_id: unequipBtn.dataset.itemId });
          const freshUnits = await api(`/roster?chat_id=${player.chat_id}`);
          units = freshUnits.slice().sort((a, b) => (b.is_hero === true) - (a.is_hero === true));
          await refreshAndRerender();
          rerenderKeeping(focusedId);
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
          showTrophyBar();
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
    runRosterTutorial();
  }

  load();
}