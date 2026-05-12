import { api }        from '../main.js';
import { navigate }   from '../main.js';

const REGION_META = {
  life_grove:   { label: 'Life Grove',   icon: '🟢' },
  fire_wastes:  { label: 'Fire Wastes',  icon: '🔴' },
  death_crypts: { label: 'Death Crypts', icon: '🟣' },
  frost_peaks:  { label: 'Frost Peaks',  icon: '🔵' },
  nature_wilds: { label: 'Nature Wilds', icon: '🟡' },
};

const ROWS = 3;
const COLS = 2;

function cellIndex(row, col) { return row * COLS + col; }
function cellRow(i)  { return Math.floor(i / COLS); }
function cellCol(i)  { return i % COLS; }

export function renderBattlePrep(root, { player, region_id, level }) {
  const meta = REGION_META[region_id] || { label: region_id, icon: '⚔' };

  let UNIT_TYPES = {};
  let UNIT_SIZES = {};

  function getUnitSize(unit) {
    return unit?.unit_data?.size ?? (UNIT_TYPES[unit?.unit_data?.type] ?? UNIT_TYPES.melee ?? {}).size;
  }

  function sizeLabel(size) {
    return (UNIT_SIZES[size] ?? UNIT_SIZES.tile ?? {}).label ?? size;
  }

  function sizeRowSpan(size) {
    return (UNIT_SIZES[size] ?? UNIT_SIZES.tile ?? {}).rowSpan ?? 1;
  }

  function sizeColSpan(size) {
    return (UNIT_SIZES[size] ?? UNIT_SIZES.tile ?? {}).colSpan ?? 1;
  }

  function unitTypeIcon(u) {
    const t = u?.unit_data?.type ?? '';
    return (UNIT_TYPES[t] ?? { icon: '·' }).icon;
  }

  root.innerHTML = `
    <div class="screen screen-battle-prep">
      <div class="embark-header">
        <button class="back-btn" id="back-btn">←</button>
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
      <div class="portrait-slider-wrap">
        <div class="portrait-track" id="portrait-track"></div>
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

  let roster      = [];
  let enemies     = [];
  let heroId      = null;
  let dragUnit    = null;
  let hoverCell   = null;
  const occupied  = {};

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
  root.querySelector('#back-btn').addEventListener('click', () => navigate('embark', { player }));

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
    openModal('Battle', `
      <div style="text-align:center;padding:24px 0;">
        <div style="font-size:2rem;margin-bottom:12px;">⚔️</div>
        <p>Battle coming next</p>
      </div>
    `);
  });

  async function load() {
    const [rosterData, regionsData, unitMeta] = await Promise.all([
      api(`/roster?chat_id=${player.chat_id}`),
      api('/regions'),
      api('/unit-meta'),
    ]);

    UNIT_TYPES = unitMeta.UNIT_TYPES;
    UNIT_SIZES = unitMeta.UNIT_SIZES;



    roster = rosterData.map((u, i) => ({ ...u, id: u.id != null ? u.id : String(i) }));

    const heroName = player.hero ?? '';
    const heroUnit = roster.find(u => u.unit_name.toLowerCase() === heroName.toLowerCase());
    heroId = heroUnit?.id ?? null;

    const regionDef = regionsData.find(r => r.id === region_id);
    const levelDef  = regionDef?.difficulties?.[`level_${level}`];
    enemies = levelDef?.enemies || [];

    renderEnemyGrid();
    renderPlayerGrid();
    renderPortraitTrack();
    attachPortraitEvents();
    checkReady();
  }

  load();
}