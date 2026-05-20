import { api }        from '../main.js';
import { navigate }   from '../main.js';
import { SPELLS }     from '../../data/spells.js';
import { getEncounter } from '../../data/embark.js';
import { UNITS } from '../../data/units.js';
import { PASSIVES }  from '../../data/passives.js';
import { ABILITIES } from '../../data/abilities.js';

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
const UNIT_TYPE_ICONS = { melee: '⚔', ranged: '🏹', caster: '✦', healer: '✚' };
const SIZE_META = {
  tile:   { label: '1×1', rowSpan: 1, colSpan: 1 },
  column: { label: '1×2', rowSpan: 2, colSpan: 1 },
  row:    { label: '2×1', rowSpan: 1, colSpan: 2 },
};

function cellIndex(row, col) { return row * COLS + col; }
function cellRow(i)  { return Math.floor(i / COLS); }
function cellCol(i)  { return i % COLS; }

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
  if (size === 'tile')   return [anchor];
  if (size === 'column') return r <= ROWS - 2 ? [anchor, cellIndex(r + 1, c)] : null;
  if (size === 'row')    return c === 0        ? [anchor, cellIndex(r, 1)]     : null;
  return null;
}

function sizeLabel(size)   { return SIZE_META[size]?.label ?? '1×1'; }
function sizeRowSpan(size) { return SIZE_META[size]?.rowSpan ?? 1; }
function sizeColSpan(size) { return SIZE_META[size]?.colSpan ?? 1; }

function unitTypeIcon(unit) {
  const t = resolveUnitDef(unit)?.type ?? '';
  return UNIT_TYPE_ICONS[t] ?? '·';
}

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
  if (type === 'passive') return PASSIVES[k]  || PASSIVES[key]  || null;
  if (type === 'active')  return ABILITIES[k] || ABILITIES[key] || null;
  return null;
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
        <div class="spell-resources-bar" id="resource-display"></div>
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

    const passiveKey = def?.passive || null;
    const activeKey  = def?.ability || null;

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

    const abilitiesHtml = `
      <div class="unit-abilities-row">
        <div class="unit-abilities-icons">
          ${abilityIconHtml(passiveKey, 'passive')}
          ${abilityIconHtml(activeKey, 'active')}
        </div>
        <div class="ability-detail-panel" id="ability-detail-panel">
          <div class="ability-detail-desc"></div>
        </div>
      </div>
    `;

    const name  = def?.name ?? stored.unit_id ?? '?';
    const tier  = def?.t ?? 1;
    const badge = isHero ? '★ Hero' : sizeLabel(getUnitSize(unit));

    return `
      <div class="detail-unit-header">
        <span class="detail-unit-name">${name}</span>
        <span class="detail-unit-badge">${badge}</span>
        ${isHero ? `<span class="detail-unit-tier">Lv ${tier}</span>` : `<span class="detail-unit-tier">Tier ${tier}</span>`}
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
      </div>
      ${!used && canUse ? `<button class="detail-use-btn" id="detail-use-btn">Use Spell</button>` : ''}
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
      let html = '';
      for (const [type, icon] of Object.entries(CRYSTAL_ICONS)) {
        const amt = playerCrystals[type] || 0;
        html += `<span class="resource-item"><span class="resource-icon">${icon}</span><span class="resource-amount">${amt}</span></span>`;
      }
      displayEl.innerHTML = html;
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

  function placedNonHeroCount() {
    return [...placedUnitIds()].filter(id => id !== heroId).length;
  }

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
      const currentNonHero = placedNonHeroCount();
      const alreadyPlaced  = ignoredUnitId && ignoredUnitId !== heroId && placedUnitIds().has(ignoredUnitId);
      const effectiveCount = alreadyPlaced ? currentNonHero : currentNonHero;
      if (effectiveCount >= maxNonHero && !alreadyPlaced) return false;
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
      const alreadyPlaced = ignoredUnitId && ignoredUnitId !== heroId && placedUnitIds().has(ignoredUnitId);
      if (placedNonHeroCount() >= maxNonHero && !alreadyPlaced) return false;
    }

    cells.forEach(c => { occupied[c] = { unitId: unit.id, anchor, size }; });
    return true;
  }

  function updateLoyaltyHint() {
    const hint = root.querySelector('#loyalty-hint');
    if (!hint) return;
    const nonHeroPlaced = placedNonHeroCount();
    const heroPlaced    = heroId !== null && placedUnitIds().has(heroId);
    const parts = [];
    if (!heroPlaced) parts.push('Place your hero');
    parts.push(`${nonHeroPlaced}/${maxNonHero} allies assigned`);
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
        return `<div class="battle-cell battle-cell--placed ${isHero ? 'battle-cell--hero' : ''}"
                     data-i="${i}" draggable="true" style="grid-row:span ${rowSpan};grid-column:span ${colSpan};">
          <span class="battle-cell-name">${name}</span>
          <span class="battle-cell-sub">${isHero ? '★ hero' : sizeLabel(occ.size)}</span>
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
    const nonHeroPlaced = placedNonHeroCount();
    const slotsLeft     = maxNonHero - nonHeroPlaced;

    if (!available.length) {
      track.innerHTML = `<span class="track-empty-hint">All units placed</span>`;
      return;
    }

    track.innerHTML = available.map(u => {
      const isHero     = u.id === heroId;
      const isSelected = dragUnit?.id === u.id;
      const locked     = !isHero && slotsLeft <= 0;
      const name       = getUnitName(u);
      const size       = getUnitSize(u);
      return `
        <div class="portrait-card
                    ${isHero     ? 'portrait-card--hero'     : ''}
                    ${isSelected ? 'portrait-card--selected' : ''}
                    ${locked     ? 'portrait-card--locked'   : ''}"
             draggable="${locked ? 'false' : 'true'}"
             data-id="${u.id}">
          <div class="portrait-art">${isHero ? '★' : unitTypeIcon(u)}</div>
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

  const playerGrid = root.querySelector('#player-grid');

  function attachGridDragEvents() {
    playerGrid.querySelectorAll('.battle-cell--placed').forEach(cell => {
      cell.addEventListener('dragstart', e => {
        const anchor  = Number(cell.dataset.i);
        const occ     = occupied[anchor];
        if (!occ) return;
        const unit = roster.find(u => u.id === occ.unitId);
        if (!unit) return;
        dragUnit     = unit;
        dragFromCell = anchor;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(unit.id));
        cell.classList.add('battle-cell--dragging');
      });

      cell.addEventListener('dragend', () => {
        dragUnit     = null;
        dragFromCell = null;
        clearHover();
        root.querySelectorAll('.battle-cell--dragging').forEach(c => c.classList.remove('battle-cell--dragging'));
      });
    });
  }

  playerGrid.addEventListener('dragover', e => {
    e.preventDefault();
    const cell = e.target.closest('[data-i]');
    if (!cell || !dragUnit) return;
    const i          = Number(cell.dataset.i);
    const ignoreId   = dragFromCell !== null ? (occupied[dragFromCell]?.unitId ?? null) : null;
    const targetOcc  = occupied[i];
    const targetIsSelf = targetOcc && targetOcc.unitId === ignoreId;
    if ((!targetOcc || targetIsSelf) && canPlace(dragUnit, i, ignoreId)) {
      setHover(i);
      e.dataTransfer.dropEffect = 'move';
    } else {
      clearHover();
      e.dataTransfer.dropEffect = 'none';
    }
  });

  playerGrid.addEventListener('dragleave', e => {
    if (!playerGrid.contains(e.relatedTarget)) clearHover();
  });

  playerGrid.addEventListener('drop', e => {
    e.preventDefault();
    clearHover();
    if (!dragUnit) return;
    const cell = e.target.closest('[data-i]');
    if (!cell) return;
    const i       = Number(cell.dataset.i);
    const ignoreId = dragFromCell !== null ? (occupied[dragFromCell]?.unitId ?? null) : null;

    if (canPlace(dragUnit, i, ignoreId)) {
      if (ignoreId) removeUnit(ignoreId);
      placeUnit(dragUnit, i);
      dragUnit     = null;
      dragFromCell = null;
      fullRefresh();
    }
  });

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

    const cell = e.target.closest('[data-i]');
    if (!cell) return;
    const i   = Number(cell.dataset.i);
    const occ = occupied[i];

    if (occ) {
      const unit = roster.find(u => u.id === occ.unitId);
      if (unit) showDetail(unitDetailHtml(unit));
      return;
    }

    if (dragUnit && canPlace(dragUnit, i)) {
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
      const panel = detailPanel.querySelector('#ability-detail-panel');
      const desc  = detailPanel.querySelector('.ability-detail-desc');
      if (!panel || !desc) return;
      if (panel.dataset.activeKey === key) {
        panel.dataset.activeKey = '';
        desc.textContent = '';
        abilityBtn.classList.remove('ability-icon--selected');
        return;
      }
      panel.dataset.activeKey = key;
      const typeLabel   = type === 'passive' ? 'Passive' : 'Active';
      const description = buildStatDescription(def, type);
      desc.textContent  = `[${typeLabel}] ${def.name}${def.rank ? ` (Rank ${def.rank})` : ''}\n${description}`;
      detailPanel.querySelectorAll('.ability-icon').forEach(b => b.classList.remove('ability-icon--selected'));
      abilityBtn.classList.add('ability-icon--selected');
    }
  });

  function attachPortraitEvents() {
    root.querySelectorAll('.portrait-card').forEach(card => {
      const u = roster.find(r => String(r.id) === String(card.dataset.id));
      if (!u) return;

      if (card.classList.contains('portrait-card--locked')) return;

      card.addEventListener('dragstart', e => {
        dragUnit     = u;
        dragFromCell = null;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(u.id));
      });

      card.addEventListener('dragend', () => {
        if (dragUnit) {
          dragUnit     = null;
          dragFromCell = null;
          clearHover();
          renderPortraitTrack();
          attachPortraitEvents();
        }
      });

      card.addEventListener('click', () => {
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

    const playerUnits = roster
      .filter(u => placedUnitIds().has(u.id))
      .map(u => {
        const def = resolveUnitDef(u);
        return {
          id:        String(u.id),
          _rosterId: String(u.id),
          unit_name: def?.name ?? u.unit_data?.unit_id ?? 'Unit',
          unit_data: { ...def},
        };
      });

    const placement = {};
    for (const [cellIdx, occ] of Object.entries(occupied)) {
      if (occ.anchor === Number(cellIdx)) {
        placement[occ.unitId] = Number(cellIdx);
      }
    }

    try {
      const battle = await api('/battle/create', {
        chat_id: player.chat_id,
        region_id,
        level,
        playerUnits,
        enemies,
        placement,
        selectedSpells,
      });
      navigate('battle', { player, region_id, level, playerUnits, enemies, placement, selectedSpells, resumeBattleId: battle.battle_id });
    } catch (err) {
      console.error('Failed to create battle:', err);
      navigate('battle', { player, region_id, level, playerUnits, enemies, placement, selectedSpells });
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