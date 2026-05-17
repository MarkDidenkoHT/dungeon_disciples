import { api }        from '../main.js';
import { navigate }   from '../main.js';
import { SPELLS }     from '../../data/spells.js';
import { getEncounter } from '../../data/embark.js';

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

function getUnitSize(unit) { return unit?.unit_data?.size; }

function getCells(anchor, size) {
  const r = cellRow(anchor), c = cellCol(anchor);
  if (size === 'tile')   return [anchor];
  if (size === 'column') return r <= ROWS - 2 ? [anchor, cellIndex(r + 1, c)] : null;
  if (size === 'row')    return c === 0        ? [anchor, cellIndex(r, 1)]     : null;
  return null;
}

function sizeLabel(size)   { return SIZE_META[size].label; }
function sizeRowSpan(size) { return SIZE_META[size].rowSpan; }
function sizeColSpan(size) { return SIZE_META[size].colSpan; }

function unitTypeIcon(u) {
  const t = u?.unit_data?.type ?? '';
  return UNIT_TYPE_ICONS[t] ?? '·';
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
  let dragUnit         = null;
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

  function unitDetailHtml(name, d, badge) {
    return `
      <div class="detail-header">
        <span class="detail-name">${name}</span>
        ${badge ? `<span class="detail-badge">${badge}</span>` : ''}
      </div>
      <div class="detail-stats-row">
        <div class="detail-stat"><span class="detail-stat-label">HP</span><span class="detail-stat-val">${d.hp ?? '—'}</span></div>
        <div class="detail-stat"><span class="detail-stat-label">Armor</span><span class="detail-stat-val">${d.armor ?? '—'}</span></div>
        <div class="detail-stat"><span class="detail-stat-label">Init</span><span class="detail-stat-val">${d.initiative ?? '—'}</span></div>
      </div>
    `;
  }

  function enemyDetailHtml(e) {
    return `
      <div class="detail-header">
        <span class="detail-name">${e.name}</span>
        <span class="detail-badge detail-badge--enemy">Enemy</span>
      </div>
      <div class="detail-stats-row">
        <div class="detail-stat"><span class="detail-stat-label">HP</span><span class="detail-stat-val">${e.hp}</span></div>
        <div class="detail-stat"><span class="detail-stat-label">Armor</span><span class="detail-stat-val">${e.armor ?? '—'}</span></div>
        <div class="detail-stat"><span class="detail-stat-label">Init</span><span class="detail-stat-val">${e.initiative ?? '—'}</span></div>
      </div>
      ${e.action ? `
      <div class="detail-action">
        <span class="detail-action-label">Basic Action</span>
        <div class="detail-stats-row">
          <div class="detail-stat"><span class="detail-stat-label">DMG</span><span class="detail-stat-val">${e.action.value ?? '—'}</span></div>
          <div class="detail-stat"><span class="detail-stat-label">Range</span><span class="detail-stat-val">${e.action.range ?? '—'}</span></div>
          <div class="detail-stat"><span class="detail-stat-label">Target</span><span class="detail-stat-val">${e.action.target_type ?? '—'}</span></div>
        </div>
      </div>` : ''}
    `;
  }

  function spellDetailHtml(spell, canUse, used) {
    return `
      <div class="detail-header">
        <span class="detail-spell-icon">${spell.icon}</span>
        <span class="detail-name">${spell.name}</span>
        ${used ? '<span class="detail-badge detail-badge--used">Used</span>' : ''}
        ${!used && !canUse ? '<span class="detail-badge detail-badge--locked">Can\'t afford</span>' : ''}
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

  function removeUnit(unitId) {
    for (const key of Object.keys(occupied)) {
      if (occupied[key].unitId === unitId) delete occupied[key];
    }
  }

  function canPlace(unit, anchor) {
    const size  = getUnitSize(unit);
    const cells = getCells(anchor, size);
    if (!cells) return false;
    return cells.every(c => !occupied[c]);
  }

  function placeUnit(unit, anchor) {
    const size  = getUnitSize(unit);
    const cells = getCells(anchor, size);
    if (!cells) return false;
    if (!cells.every(c => !occupied[c])) return false;
    cells.forEach(c => { occupied[c] = { unitId: unit.id, anchor, size }; });
    return true;
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
        return `<div class="battle-cell battle-cell--placed ${isHero ? 'battle-cell--hero' : ''}"
                     data-i="${i}" style="grid-row:span ${rowSpan};grid-column:span ${colSpan};">
          <span class="battle-cell-name">${unit?.unit_name ?? '?'}</span>
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

function renderEnemyGrid(root, enemies) {
  const COLS = 2;
  const ROWS = 3;
 
  function cellRow(i) { return Math.floor(i / COLS); }
 
  const grid = root.querySelector('#enemy-grid');
 
  const placed = new Set(enemies.map(e => e.cell));
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
    if (!e) {
      return `<div class="battle-cell battle-cell--fog">???</div>`;
    }
    if (e._shadow) return '';
    const colSpan = e.size === 'row' ? 2 : 1;
    const rowSpan = e.size === 'column' ? 2 : 1;
    return `<div class="battle-cell battle-cell--enemy" data-i="${i}" style="grid-column:span ${colSpan};grid-row:span ${rowSpan};">
      <span class="battle-cell-name">${e.name}</span>
      <span class="battle-cell-sub">❤ ${e.hp}</span>
    </div>`;
  }).join('');
 
  const detailPanel = root.querySelector('#detail-panel');
  grid.querySelectorAll('.battle-cell--enemy').forEach(cell => {
    cell.addEventListener('click', () => {
      const e = unitAtCell[Number(cell.dataset.i)];
      if (e && !e._shadow) {
        detailPanel.innerHTML = enemyDetailHtml(e);
      }
    });
  });
}

  function renderPortraitTrack() {
    const track     = root.querySelector('#portrait-track');
    const placed    = placedUnitIds();
    const available = roster.filter(u => !placed.has(u.id));

    if (!available.length) {
      track.innerHTML = `<span class="track-empty-hint">All units placed</span>`;
      return;
    }

    track.innerHTML = available.map(u => {
      const isHero     = u.id === heroId;
      const isSelected = dragUnit?.id === u.id;
      return `<div class="portrait-card ${isHero ? 'portrait-card--hero' : ''} ${isSelected ? 'portrait-card--selected' : ''}"
                   draggable="true" data-id="${u.id}">
        <div class="portrait-art">${isHero ? '★' : unitTypeIcon(u)}</div>
        <div class="portrait-name">${u.unit_name}</div>
        <div class="portrait-size">${sizeLabel(getUnitSize(u))}</div>
      </div>`;
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

  const playerGrid = root.querySelector('#player-grid');

  playerGrid.addEventListener('dragover', e => {
    e.preventDefault();
    const cell = e.target.closest('[data-i]');
    if (!cell || !dragUnit) return;
    const i = Number(cell.dataset.i);
    if (!occupied[i] && canPlace(dragUnit, i)) {
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
    const i = Number(cell.dataset.i);
    if (canPlace(dragUnit, i)) {
      placeUnit(dragUnit, i);
      dragUnit = null;
      renderPlayerGrid();
      renderPortraitTrack();
      attachPortraitEvents();
      checkReady();
    }
  });

  playerGrid.addEventListener('click', e => {
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) {
      const anchor = Number(removeBtn.dataset.remove);
      const occ    = occupied[anchor];
      if (occ) removeUnit(occ.unitId);
      renderPlayerGrid();
      renderPortraitTrack();
      attachPortraitEvents();
      checkReady();
      clearDetail();
      return;
    }

    const cell = e.target.closest('[data-i]');
    if (!cell) return;
    const i   = Number(cell.dataset.i);
    const occ = occupied[i];

    if (occ) {
      const unit = roster.find(u => u.id === occ.unitId);
      if (unit) {
        const d     = unit.unit_data || {};
        const badge = occ.unitId === heroId ? '★ Hero' : sizeLabel(occ.size);
        showDetail(unitDetailHtml(unit.unit_name, d, badge));
      }
      return;
    }

    if (dragUnit && canPlace(dragUnit, i)) {
      placeUnit(dragUnit, i);
      dragUnit = null;
      renderPlayerGrid();
      renderPortraitTrack();
      attachPortraitEvents();
      checkReady();
    }
  });

  function attachPortraitEvents() {
    root.querySelectorAll('.portrait-card').forEach(card => {
      const u = roster.find(r => String(r.id) === String(card.dataset.id));
      if (!u) return;

      card.addEventListener('dragstart', e => {
        dragUnit = u;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(u.id));
      });

      card.addEventListener('dragend', () => {
        if (dragUnit) {
          dragUnit = null;
          clearHover();
          renderPortraitTrack();
          attachPortraitEvents();
        }
      });

      card.addEventListener('click', () => {
        const wasSelected = dragUnit?.id === u.id;
        dragUnit = wasSelected ? null : u;
        renderPortraitTrack();
        attachPortraitEvents();

        const d     = u.unit_data || {};
        const badge = u.id === heroId ? '★ Hero' : sizeLabel(getUnitSize(u));
        showDetail(unitDetailHtml(u.unit_name, d, badge));
      });
    });
  }

  root.querySelector('#ready-btn').addEventListener('click', () => {
    if (!placedUnitIds().has(heroId)) return;

    const playerUnits = roster
      .filter(u => placedUnitIds().has(u.id))
      .map(u => ({
        id:        String(u.id),
        _rosterId: String(u.id),
        unit_name: u.unit_name || (u.unit_data?.name || 'Unit'),
        unit_data: u.unit_data || u
      }));

    const placement = {};
    for (const [cellIdx, occ] of Object.entries(occupied)) {
      if (occ.anchor === Number(cellIdx)) {
        placement[occ.unitId] = Number(cellIdx);
      }
    }

    navigate('battle', { player, region_id, level, playerUnits, enemies, placement, selectedSpells });
  });

async function load(root, player, region_id, level, api, renderPlayerGrid, renderPortraitTrack, attachPortraitEvents, checkReady, renderPrepSpells, roster, heroId, occupied, placedUnitIds) {
  const [rosterData] = await Promise.all([
    api(`/roster?chat_id=${player.chat_id}`),
  ]);
 
  const loadedRoster = rosterData.map((u, i) => ({ ...u, id: u.id != null ? u.id : String(i) }));
 
  const heroName = player.hero ?? '';
  const heroUnit = loadedRoster.find(u => u.unit_name.toLowerCase() === heroName.toLowerCase());
  const resolvedHeroId = heroUnit?.id ?? null;
 
  const enemies = getEncounter(region_id, level);
 
  return { roster: loadedRoster, heroId: resolvedHeroId, enemies };
}

  load();
}