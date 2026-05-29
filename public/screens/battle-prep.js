import { api }        from '../main.js';
import { navigate }   from '../main.js';
import { SPELLS }     from '../../data/spells.js';
import { getEncounter } from '../../data/embark.js';
import { UNITS } from '../../data/units.js';

import { UNIT_ABILITIES } from '../../data/unit_abilities.js';

const REGION_META = {
  life_grove:   { label: 'Life Grove',   icon: '🟢' },
  fire_wastes:  { label: 'Fire Wastes',  icon: '🔴' },
  death_crypts: { label: 'Death Crypts', icon: '🟣' },
  frost_peaks:  { label: 'Frost Peaks',  icon: '🔵' },
  nature_wilds: { label: 'Nature Wilds', icon: '🟡' },
};

const CRYSTAL_ICONS = {
  Crystals_Life:   '🟢',
  Crystals_Fire:   '🔴',
  Crystals_Death:  '🟣',
  Crystals_Frost:  '🔵',
  Crystals_Nature: '🟡',
};

const RESIST_ICONS = {
  air:    { icon: '🌬️', label: 'Air'    },
  fire:   { icon: '🔥', label: 'Fire'   },
  nature: { icon: '🌿', label: 'Nature' },
  cold:   { icon: '❄️', label: 'Cold'   },
  life:   { icon: '✨', label: 'Life'   },
  death:  { icon: '🌑', label: 'Death'  },
};

const RESIST_ORDER = ['air', 'fire', 'nature', 'cold', 'life', 'death'];

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
  const size = unitDef?.size ?? 'tile';
  const prefix = (variant === 'grid' && (size === 'row' || size === 'column')) ? 'p2' : 'p';
  return `/assets/character_portraits/${prefix}_${unitId}.png`;
}

function unitTypeIcon(unit) {
  const t = unit?.unit_data?.type ?? '';
  const icons = { melee: '⚔', ranged: '🏹', caster: '✦', healer: '✚' };
  return icons[t] ?? '·';
}

function resolveUnitDef(unit) {
  const uid = unit.unit_data?.unit_id;
  if (!uid) return null;

  for (const factionPool of Object.values(UNITS)) {
    if (typeof factionPool !== 'object' || Array.isArray(factionPool)) continue;
    for (const entry of Object.values(factionPool)) {
      if (entry?.id === uid) return entry;
      if (typeof entry === 'object' && !entry.id) {
        const nested = Object.values(entry).find(u => u?.id === uid);
        if (nested) return nested;
      }
    }
  }

  return null;
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

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function dmgReduction(val) {
  return Math.abs(val);
}

function resolveAbility(key, type) {
  if (!key || key === 'None') return null;
  const k = key.replace(/\s+/g, '_');
  return UNIT_ABILITIES[k] || UNIT_ABILITIES[key] || null;
}

function buildStatDescription(def, type) {
  const parts = [];
  if (def.description) parts.push(def.description);
  if (type === 'passive' && def.stats) {
    const statLines = Object.entries(def.stats).map(([stat, val]) => {
      const sign = val >= 0 ? '+' : '';
      if (stat === 'hp') return `${sign}${val} HP`;
      if (stat === 'hp_regen') return `${sign}${val} HP regen/turn`;
      if (stat === 'initiative') return `${sign}${val} Initiative`;
      if (stat === 'armor') {
        const pct = dmgReduction(val);
        return `${sign}${val} Armor (${pct}% dmg reduction)`;
      }
      if (stat === 'armor_reduction') return `${val} Armor reduction`;
      if (stat.includes('resist')) {
        const resistType = stat.replace('_resist', '');
        const pct = dmgReduction(val);
        return `${sign}${val} ${cap(resistType)} resist (${pct}% dmg reduction)`;
      }
      return `${sign}${val} ${cap(stat)}`;
    });
    if (statLines.length) parts.push(statLines.join(', '));
  }
  return parts.join('\n\n');
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
          <div class="battle-half-label">Your Formation</div>
          <div class="battle-grid" id="player-grid"></div>
          <div class="battle-loyalty-hint" id="loyalty-hint"></div>
        </div>
        <div class="battle-vs">⚔</div>
        <div class="battle-half battle-half--enemy">
          <div class="battle-half-label">Enemies</div>
          <div class="battle-grid" id="enemy-grid"></div>
        </div>
      </div>

      <div class="battle-prep-tabs">
        <button class="battle-prep-tab-btn active" data-tab="formation">Formation</button>
        <button class="battle-prep-tab-btn" data-tab="spells">Spells</button>
        <button class="battle-prep-tab-btn disabled" data-tab="potions">Potions</button>
      </div>

      <div class="battle-prep-tab-content active" id="tab-formation">
        <div class="prep-track-wrap">
          <div class="portrait-track" id="portrait-track"></div>
        </div>
      </div>

      <div class="battle-prep-tab-content" id="tab-spells">
        <div class="prep-track-wrap">
          <div class="spell-track" id="prep-spells"></div>
        </div>
      </div>

      <div class="battle-prep-tab-content" id="tab-potions">
        <div class="potions-placeholder">
          <p>🧪 Potions coming soon</p>
        </div>
      </div>

      <div class="detail-panel" id="detail-panel">
        <div class="detail-panel-empty">Tap a unit, spell, or enemy to see details</div>
      </div>

      <button class="ready-btn" id="ready-btn" disabled>Place your hero to ready up</button>
    </div>

    <div id="modal-overlay" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header">
          <span id="modal-title"></span>
          <button id="modal-close" aria-label="Close">✕</button>
        </div>
        <div id="modal-body" class="modal-body"></div>
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

  const detailPanel = root.querySelector('#detail-panel');

  const overlay    = root.querySelector('#modal-overlay');
  const modalBody  = root.querySelector('#modal-body');
  const modalTitle = root.querySelector('#modal-title');

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderModalContent(text) {
    return `<div style="white-space: pre-wrap; line-height: 1.5;">${escapeHtml(text)}</div>`;
  }

  function openModal(title, bodyHtml) {
    if (!modalTitle || !modalBody || !overlay) return;
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  if (root.querySelector('#modal-close')) {
    root.querySelector('#modal-close').addEventListener('click', closeModal);
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  }

  function showDetail(html) {
    detailPanel.innerHTML = html;
  }

  function clearDetail() {
    detailPanel.innerHTML = '<div class="detail-panel-empty">Tap a unit, spell, or enemy to see details</div>';
  }

  function unitDetailHtml(unit) {
    const def    = resolveUnitDef(unit);
    const stored = unit.unit_data || {};
    const isHero = unit.id === heroId;
    const portraitUrl = getPortraitUrl(unit);

    const currentHp = def?.hp ?? '—';
    const res        = def?.resistances || {};

    const coreHtml = `
      <div class="unit-core-stats">
        <div class="core-stat"><span class="core-stat-label">HP</span><span class="core-stat-val">${currentHp}</span></div>
        <div class="core-stat"><span class="core-stat-label">Armor</span><span class="core-stat-val">${def?.armor ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">Init</span><span class="core-stat-val">${def?.initiative ?? '—'}</span></div>
        <div class="core-stat"><span class="core-stat-label">XP</span><span class="core-stat-val">${stored.current_xp ?? 0}</span></div>
      </div>
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
      const aDef    = resolveAbility(key, type);
      const isEmpty = !aDef;
      const fileKey = key ? key.replace(/\s+/g, '_') : null;
      const imgSrc  = aDef ? `/assets/icons/abilities/${fileKey}.png` : null;
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

  function spellDetailHtml(spell, canUse, used) {
    return `
      <div class="detail-unit-header">
        <span class="detail-spell-icon">${spell.icon}</span>
        <span class="detail-unit-name">${spell.name}</span>
        ${used ? '<span class="detail-unit-badge detail-unit-badge--used">Used</span>' : ''}
        ${!used && !canUse ? '<span class="detail-unit-badge detail-unit-badge--locked">Can\'t afford</span>' : ''}
      </div>
      <div class="detail-spell-desc">${spell.description}</div>
      <div class="detail-spell-meta">
        <span class="detail-spell-cost">${spellCostLabel(spell)}</span>
        <span class="detail-spell-type">${spell.effect_type}</span>
      </div>      <div class="detail-spell-target">Target: ${spellTargetLabel(spell)}</div>      ${!used && canUse ? `<button class="detail-use-btn" id="detail-use-btn">Use Spell</button>` : ''}
    `;
  }

  root.querySelectorAll('.battle-prep-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      const tabName = btn.dataset.tab;
      root.querySelectorAll('.battle-prep-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      root.querySelectorAll('.battle-prep-tab-content').forEach(c => c.classList.remove('active'));
      root.querySelector(`#tab-${tabName}`).classList.add('active');
      clearDetail();
    });
  });

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
      const displayEl = root.querySelector('#resource-display');
      if (displayEl) {
        let html = '';
        for (const [type, icon] of Object.entries(CRYSTAL_ICONS)) {
          const amt = playerCrystals[type] || 0;
          html += `<span class="resource-item"><span class="resource-icon">${icon}</span><span class="resource-amount">${amt}</span></span>`;
        }
        displayEl.innerHTML = html;
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

  function canAffordSpell(spell) {
    const crystalMap = spell.cost.crystals || {};
    for (const [type, needed] of Object.entries(crystalMap)) {
      if ((playerCrystals[type] || 0) < needed) return false;
    }
    return true;
  }

  function spellCostLabel(spell) {
    const parts = [];
    for (const [type, amt] of Object.entries(spell.cost.crystals || {})) {
      if (amt > 0) parts.push(`${CRYSTAL_ICONS[type] || '💎'}${amt}`);
    }
    return parts.join(' ');
  }

  async function renderPrepSpells() {
    const factionSpells = SPELLS[player.faction] || [];
    const learned       = factionSpells.filter(s => learnedSpells.includes(s.id));
    const track         = root.querySelector('#prep-spells');

    if (learned.length === 0) {
      track.innerHTML = `<span class="track-empty-hint">No spells learned</span>`;
      return;
    }

    track.innerHTML = learned.map(spell => {
      const affordable = canAffordSpell(spell);
      const used       = selectedSpells.some(s => s.id === spell.id);
      return `
        <div class="spell-icon-card ${!affordable ? 'spell-icon-card--disabled' : ''} ${used ? 'spell-icon-card--used' : ''}"
             data-spell-id="${spell.id}">
          ${used ? '<span class="spell-icon-used-badge">✓</span>' : ''}
          <div class="spell-icon-art">${spell.icon}</div>
          <div class="spell-icon-name">${spell.name}</div>
          <div class="spell-icon-cost">${spellCostLabel(spell)}</div>
        </div>
      `;
    }).join('');

    track.querySelectorAll('.spell-icon-card').forEach(card => {
      const spellId = card.dataset.spellId;
      const spell   = factionSpells.find(s => s.id === spellId);
      if (!spell) return;

      let pressTimer   = null;
      let didLongPress = false;

      card.addEventListener('pointerdown', () => {
        didLongPress = false;
        pressTimer = setTimeout(() => { didLongPress = true; }, 500);
      });
      card.addEventListener('pointerup',     () => clearTimeout(pressTimer));
      card.addEventListener('pointermove',   () => clearTimeout(pressTimer));
      card.addEventListener('pointercancel', () => clearTimeout(pressTimer));

      card.addEventListener('click', async () => {
        if (didLongPress) return;
        const used   = selectedSpells.some(s => s.id === spell.id);
        const canUse = canAffordSpell(spell);
        showDetail(spellDetailHtml(spell, canUse, used));

        const useBtn = root.querySelector('#detail-use-btn');
        if (useBtn) {
          useBtn.addEventListener('click', async () => {
            await useSpell(spell, factionSpells);
          });
        }
      });
    });
  }

  async function useSpell(spell, factionSpells) {
    try {
      const result = await api('/spells/consume', {
        chat_id:       player.chat_id,
        spell_id:      spell.id,
        crystals_cost: spell.cost.crystals || {},
      });

      if (result.success) {
        for (const [type, amt] of Object.entries(spell.cost.crystals || {})) {
          playerCrystals[type] = (playerCrystals[type] || 0) - amt;
        }
        const idx = selectedSpells.findIndex(s => s.id === spell.id);
        if (idx < 0) selectedSpells.push(spell);

        await loadResources();
        await renderPrepSpells();
        clearDetail();
      } else {
        alert(result.message || 'Failed to use spell');
      }
    } catch (err) {
      console.error('Failed to use spell:', err);
      alert(err.message || 'Failed to use spell');
    }
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
    const hint = root.querySelector('#loyalty-hint');
    if (!hint) return;
    const heroPlaced = heroId !== null && placedUnitIds().has(heroId);
    const parts = [];
    if (!heroPlaced) parts.push('Place your hero');
    parts.push(`${placedLoyaltyUsed()}/${maxNonHero} loyalty used`);
    hint.textContent = parts.join(' · ');
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
        return `<div class="battle-cell battle-cell--placed ${isHero ? 'battle-cell--hero' : ''}"
                     data-i="${i}" style="grid-row:span ${rowSpan};grid-column:span ${colSpan};">
          ${portraitUrl ? `<img class="battle-cell-portrait" src="${portraitUrl}" alt="${name}" onerror="this.style.display='none'">` : ''}
          <div class="battle-cell-info">
            <span class="battle-cell-name">${name}</span>
            <span class="battle-cell-sub">${isHero ? '★ hero' : sizeLabel(occ.size)}</span>
          </div>
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
        <span class="battle-cell-name">${e.name}</span>
        <span class="battle-cell-sub">❤ ${e.hp}</span>
      </div>`;
    }).join('');

    grid.querySelectorAll('.battle-cell--enemy').forEach(cell => {
      cell.addEventListener('click', () => {
        const e = unitAtCell[Number(cell.dataset.i)];
        if (e && !e._shadow) showDetail(enemyDetailHtml(e));
      });
    });
  }

  function renderPortraitTrack() {
    const track     = root.querySelector('#portrait-track');
    const placed    = placedUnitIds();
    const available = roster.filter(u => !placed.has(u.id));
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
    const btn        = root.querySelector('#ready-btn');
    const heroPlaced = heroId !== null && placedUnitIds().has(heroId);
    btn.disabled     = !heroPlaced;
    btn.textContent  = heroPlaced ? 'Ready' : 'Place your hero to ready up';
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
  }

  document.addEventListener('pointermove', e => {
    if (!pointerDragging) return;
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);

    const cell     = cellFromPoint(e.clientX, e.clientY);
    const ignoreId = dragFromCell !== null ? (occupied[dragFromCell]?.unitId ?? null) : null;
    if (cell) {
      const i         = Number(cell.dataset.i);
      const targetOcc = occupied[i];
      const isSelf    = targetOcc && targetOcc.unitId === ignoreId;
      if ((!targetOcc || isSelf) && canPlace(dragUnit, i, ignoreId)) {
        setHover(i);
        return;
      }
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
      if (unit) showDetail(unitDetailHtml(unit));
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

  detailPanel.addEventListener('click', e => {
    const abilityBtn = e.target.closest('.ability-icon');
    if (abilityBtn) {
      const key  = abilityBtn.dataset.abilityKey;
      const type = abilityBtn.dataset.abilityType;
      const def  = resolveAbility(key, type);
      if (!def) return;
      const typeLabel   = type === 'passive' ? 'Passive' : 'Active';
      const description = buildStatDescription(def, type) || 'No details available.';
      const text = `[${typeLabel}] ${def.name}${def.rank ? ` (Rank ${def.rank})` : ''}\n\n${description}`;
      openModal(`${typeLabel} Ability`, renderModalContent(text));
    }
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
        showDetail(unitDetailHtml(u));
      });
    });
  }

  root.querySelector('#ready-btn').addEventListener('click', async () => {
    if (!placedUnitIds().has(heroId)) return;

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
        selected_spells: selectedSpells.map(s => s.id),
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

      renderPlayerGrid();
      renderEnemyGrid();
      renderPortraitTrack();
      attachPortraitEvents();
      attachGridDragEvents();
      updateLoyaltyHint();
      await renderPrepSpells();
      checkReady();
    } catch (err) {
      console.error('Failed to initialise battle prep:', err);
    }
  })();
}