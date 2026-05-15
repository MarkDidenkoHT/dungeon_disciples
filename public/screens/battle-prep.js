import { api }        from '../main.js';
import { navigate }   from '../main.js';
import { SPELLS }     from '../../data/spells.js';

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

function getUnitSize(unit) {
  return unit?.unit_data?.size;
}

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
        <button class="battle-prep-tab-btn active" data-tab="formation">👥 Formation</button>
        <button class="battle-prep-tab-btn" data-tab="spells">📖 Spells</button>
        <button class="battle-prep-tab-btn disabled" data-tab="potions">🧪 Potions</button>
      </div>

      <div class="battle-prep-tab-content active" id="tab-formation">
        <div class="portrait-slider-wrap">
          <div class="portrait-track" id="portrait-track"></div>
        </div>
      </div>

      <div class="battle-prep-tab-content" id="tab-spells">
        <div class="embark-spells-header">
          <div class="resource-display" id="resource-display">
            <span class="resource-item">
              <span class="resource-icon">🔮</span>
              <span class="resource-amount" id="mana-amount">…</span>
            </span>
          </div>
        </div>
        <div class="embark-spells-grid" id="prep-spells">
          <p class="placeholder">Loading spells…</p>
        </div>
      </div>

      <div class="battle-prep-tab-content" id="tab-potions">
        <div class="potions-placeholder">
          <p>🧪 Potions feature coming soon…</p>
        </div>
      </div>

      <button class="ready-btn" id="ready-btn" disabled>Place your hero to ready up</button>
    </div>
    <div id="modal-overlay" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header">
          <span id="modal-title"></span>
          <button id="modal-close">✕</button>
        </div>
        <div id="modal-body" class="modal-body"></div>
      </div>
    </div>
  `;

  let roster        = [];
  let enemies       = [];
  let heroId        = null;
  let dragUnit      = null;
  let hoverCell     = null;
  const occupied    = {};
  const selectedSpells = [];

  let playerMana     = 0;
  let playerCrystals = {};
  let learnedSpells  = [];

  function openModal(title, body) {
    root.querySelector('#modal-title').textContent = title;
    root.querySelector('#modal-body').innerHTML    = body;
    root.querySelector('#modal-overlay').classList.remove('hidden');
  }
  function closeModal() {
    root.querySelector('#modal-overlay').classList.add('hidden');
    root.querySelector('#modal-body').innerHTML = '';
  }
  root.querySelector('#modal-close').addEventListener('click', closeModal);
  root.querySelector('#modal-overlay').addEventListener('click', e => {
    if (e.target === root.querySelector('#modal-overlay')) closeModal();
  });

  root.querySelectorAll('.battle-prep-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('disabled')) return;
      const tabName = btn.dataset.tab;
      root.querySelectorAll('.battle-prep-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      root.querySelectorAll('.battle-prep-tab-content').forEach(c => c.classList.remove('active'));
      root.querySelector(`#tab-${tabName}`).classList.add('active');
    });
  });

  async function loadResources() {
    try {
      const playerData = await api(`/player?chat_id=${player.chat_id}`);
      playerMana = playerData.mana || 0;

      const inventory = await api(`/inventory?chat_id=${player.chat_id}&type=resource`);
      if (Array.isArray(inventory)) {
        for (const row of inventory) {
          if (row.item in CRYSTAL_ICONS) {
            playerCrystals[row.item] = row.amount;
          }
        }
      }

      const displayEl = root.querySelector('#resource-display');
      let html = `
        <span class="resource-item">
          <span class="resource-icon">🔮</span>
          <span class="resource-amount" id="mana-amount">${playerMana}</span>
        </span>
      `;
      for (const [type, icon] of Object.entries(CRYSTAL_ICONS)) {
        const amt = playerCrystals[type] || 0;
        html += `
          <span class="resource-item">
            <span class="resource-icon">${icon}</span>
            <span class="resource-amount">${amt}</span>
          </span>
        `;
      }
      displayEl.innerHTML = html;
    } catch (err) {
      console.error('Failed to load resources:', err);
      playerMana     = 0;
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
    if (playerMana < spell.cost.mana) return false;
    const crystalMap = spell.cost.crystals || {};
    for (const [type, needed] of Object.entries(crystalMap)) {
      if ((playerCrystals[type] || 0) < needed) return false;
    }
    return true;
  }

  function renderCrystalCosts(crystalMap) {
    return Object.entries(crystalMap || {})
      .filter(([, amt]) => amt > 0)
      .map(([type, amt]) => `<span class="cost-item">${CRYSTAL_ICONS[type] || '💎'} ${amt}</span>`)
      .join('');
  }

  async function renderPrepSpells() {
    const factionSpells = SPELLS[player.faction] || [];
    const learned = factionSpells.filter(s => learnedSpells.includes(s.id));

    if (learned.length === 0) {
      root.querySelector('#prep-spells').innerHTML =
        '<p class="placeholder">No learned spells. Visit the Spell Tome to research spells.</p>';
      return;
    }

    let html = '<div class="embark-spells-list">';

    for (const spell of learned) {
      const affordable = canAffordSpell(spell);
      const used       = selectedSpells.some(s => s.id === spell.id);

      html += `
        <div class="embark-spell-card ${affordable ? '' : 'embark-spell-card--disabled'} ${used ? 'embark-spell-card--used' : ''}"
             data-spell-id="${spell.id}">
          <div class="embark-spell-icon">${spell.icon}</div>
          <div class="embark-spell-info">
            <div class="embark-spell-name">${spell.name}</div>
            <div class="embark-spell-desc">${spell.description}</div>
            <div class="embark-spell-cost">
              <span class="cost-item">🔮 ${spell.cost.mana}</span>
              ${renderCrystalCosts(spell.cost.crystals)}
            </div>
          </div>
          <button class="embark-spell-btn ${!affordable || used ? 'disabled' : ''}"
                  ${!affordable || used ? 'disabled' : ''}>
            ${used ? 'Used' : 'Use'}
          </button>
        </div>
      `;
    }

    html += '</div>';
    root.querySelector('#prep-spells').innerHTML = html;

    root.querySelectorAll('#prep-spells .embark-spell-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const spellId = btn.closest('.embark-spell-card').dataset.spellId;
        const spell   = factionSpells.find(s => s.id === spellId);
        if (spell && canAffordSpell(spell)) {
          await useSpell(spell, factionSpells);
        }
      });
    });

    root.querySelectorAll('#prep-spells .embark-spell-card').forEach(card => {
      card.addEventListener('contextmenu', e => {
        e.preventDefault();
        const spellId = card.dataset.spellId;
        const spell   = factionSpells.find(s => s.id === spellId);
        if (spell) {
          openModal(spell.name, `
            <div class="spell-detail">
              <div class="spell-detail-icon">${spell.icon}</div>
              <div class="spell-detail-desc">${spell.description}</div>
              <div class="spell-detail-cost">Cost: 🔮 ${spell.cost.mana} Mana</div>
              <div class="spell-detail-type">Type: ${spell.effect_type}</div>
              <button class="close-modal-btn">Close</button>
            </div>
          `);
          root.querySelector('.close-modal-btn')?.addEventListener('click', closeModal);
        }
      });
    });
  }

  async function useSpell(spell, factionSpells) {
    try {
      const result = await api('/spells/consume', {
        chat_id:       player.chat_id,
        spell_id:      spell.id,
        mana_cost:     spell.cost.mana,
        crystals_cost: spell.cost.crystals || {},
      });

      if (result.success) {
        playerMana -= spell.cost.mana;
        for (const [type, amt] of Object.entries(spell.cost.crystals || {})) {
          playerCrystals[type] = (playerCrystals[type] || 0) - amt;
        }

        const idx = selectedSpells.findIndex(s => s.id === spell.id);
        if (idx < 0) selectedSpells.push(spell);

        await loadResources();
        await renderPrepSpells();
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

  function renderEnemyGrid() {
    const grid = root.querySelector('#enemy-grid');
    grid.innerHTML = Array.from({ length: ROWS * COLS }, (_, i) => {
      const e = enemies[i];
      if (e) return `<div class="battle-cell battle-cell--enemy" data-i="${i}">
        <span class="battle-cell-name">${e.name}</span>
        <span class="battle-cell-sub">❤ ${e.hp}</span>
      </div>`;
      return `<div class="battle-cell battle-cell--fog">???</div>`;
    }).join('');

    grid.querySelectorAll('.battle-cell--enemy').forEach(cell => {
      cell.addEventListener('click', () => {
        const e = enemies[Number(cell.dataset.i)];
        openModal(e.name, `
          <div class="unit-core-stats">
            <span class="unit-stat"><em>HP</em> ${e.hp}</span>
            <span class="unit-stat"><em>Armor</em> ${e.armor}</span>
            <span class="unit-stat"><em>Initiative</em> ${e.initiative}</span>
          </div>
          <div class="unit-action">
            <span class="unit-action-label">Basic Action</span>
            <div class="unit-action-stats">
              <span class="unit-stat"><em>DMG</em> ${e.action?.value ?? '—'}</span>
              <span class="unit-stat"><em>Range</em> ${e.action?.range ?? '—'}</span>
              <span class="unit-stat"><em>Target</em> ${e.action?.target_type ?? '—'}</span>
            </div>
          </div>
        `);
      });
    });
  }

  function renderPortraitTrack() {
    const track     = root.querySelector('#portrait-track');
    const placed    = placedUnitIds();
    const available = roster.filter(u => !placed.has(u.id));

    if (!available.length) {
      track.innerHTML = `<span class="placeholder" style="padding:0 16px">All units placed</span>`;
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

  function unitStatHtml(u) {
    const d = u.unit_data || {};
    return `
      <div class="unit-core-stats">
        <span class="unit-stat"><em>HP</em> ${d.hp ?? '—'}</span>
        <span class="unit-stat"><em>Armor</em> ${d.armor ?? '—'}</span>
        <span class="unit-stat"><em>Initiative</em> ${d.initiative ?? '—'}</span>
      </div>`;
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
      return;
    }

    const cell = e.target.closest('[data-i]');
    if (!cell) return;
    const i   = Number(cell.dataset.i);
    const occ = occupied[i];

    if (occ) {
      const unit = roster.find(u => u.id === occ.unitId);
      if (unit) openModal(unit.unit_name, unitStatHtml(unit));
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
        dragUnit = dragUnit?.id === u.id ? null : u;
        renderPortraitTrack();
        attachPortraitEvents();
      });
    });
  }

  root.querySelector('#ready-btn').addEventListener('click', () => {
    if (!placedUnitIds().has(heroId)) return;

    const playerUnits = roster
      .filter(u => placedUnitIds().has(u.id))
      .map(u => {
        return {
          id:        String(u.id),
          _rosterId: String(u.id),
          unit_name: u.unit_name || (u.unit_data?.name || 'Unit'),
          unit_data: u.unit_data || u
        };
      });

    const placement = {};
    for (const [cellIdx, occ] of Object.entries(occupied)) {
      if (occ.anchor === Number(cellIdx)) {
        placement[occ.unitId] = Number(cellIdx);
      }
    }

    navigate('battle', { player, region_id, level, playerUnits, enemies, placement, selectedSpells });
  });

  async function load() {
    const [rosterData, regionsData] = await Promise.all([
      api(`/roster?chat_id=${player.chat_id}`),
      api('/regions'),
    ]);

    roster = rosterData.map((u, i) => ({ ...u, id: u.id != null ? u.id : String(i) }));

    const heroName = player.hero ?? '';
    const heroUnit = roster.find(u => u.unit_name.toLowerCase() === heroName.toLowerCase());
    heroId = heroUnit?.id ?? null;

    const regionDef = regionsData.find(r => r.id === region_id);
    const levelDef  = regionDef?.difficulties?.[`level_${level}`];
    enemies = levelDef?.enemies || [];

    await Promise.all([loadResources(), loadLearnedSpells()]);

    renderEnemyGrid();
    renderPlayerGrid();
    renderPortraitTrack();
    attachPortraitEvents();
    checkReady();
    await renderPrepSpells();
  }

  load();
}