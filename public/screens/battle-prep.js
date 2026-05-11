import { api }      from '../main.js';
import { navigate } from '../main.js';

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

function getUnitSize(unit) {
  const t = unit?.unit_data?.type ?? 'melee';
  if (t === 'ranged') return 'row';
  if (t === 'caster') return 'column';
  return 'tile';
}

function getCells(anchor, size) {
  const r = cellRow(anchor), c = cellCol(anchor);
  if (size === 'tile')   return [anchor];
  if (size === 'column') return r <= ROWS - 2 ? [anchor, cellIndex(r + 1, c)] : null;
  if (size === 'row')    return c === 0        ? [anchor, cellIndex(r, 1)]     : null;
  return null;
}

function getValidAnchors(size) {
  const anchors = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = cellIndex(r, c);
      if (getCells(idx, size)) anchors.push(idx);
    }
  }
  return anchors;
}

function sizeLabel(size) {
  return { tile: '1×1', column: '1×2', row: '2×1' }[size] ?? '';
}

export function renderBattlePrep(root, { player, region_id, level }) {
  const meta = REGION_META[region_id] || { label: region_id, icon: '⚔' };

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

  let roster       = [];
  let enemies      = [];
  let heroId       = null;
  let dragUnit     = null;
  let hoverAnchor  = null;

  const occupied   = {};

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

  function placeUnit(unit, anchor) {
    const size  = getUnitSize(unit);
    const cells = getCells(anchor, size);
    if (!cells) return false;
    for (const c of cells) {
      if (occupied[c]) return false;
    }
    for (const c of cells) {
      occupied[c] = { unitId: unit.id, anchor: anchor, size };
    }
    return true;
  }

  function getAnchorForCell(cellIdx) {
    return occupied[cellIdx]?.anchor ?? null;
  }

  function highlightDropTargets() {
    const grid = root.querySelector('#player-grid');
    if (!grid || !dragUnit) return;
    const size    = getUnitSize(dragUnit);
    const anchors = new Set(getValidAnchors(size));
    grid.querySelectorAll('.battle-cell--empty').forEach(cell => {
      const i = Number(cell.dataset.i);
      if (anchors.has(i) && !occupied[i]) {
        cell.classList.add('battle-cell--drop-target');
      }
    });
  }

  function renderPlayerGrid() {
    const grid = root.querySelector('#player-grid');

    const cellHtml = Array.from({ length: ROWS * COLS }, (_, i) => {
      const occ = occupied[i];
      if (occ && occ.anchor === i) {
        const unit   = roster.find(u => u.id === occ.unitId);
        const isHero = occ.unitId === heroId;
        const size   = occ.size;
        const rowSpan = size === 'column' ? 2 : 1;
        const colSpan = size === 'row'    ? 2 : 1;
        return `<div class="battle-cell battle-cell--placed ${isHero ? 'battle-cell--hero' : ''}"
                     data-i="${i}"
                     style="grid-row: span ${rowSpan}; grid-column: span ${colSpan};">
          <span class="battle-cell-name">${unit?.unit_name ?? '?'}</span>
          <span class="battle-cell-sub">${isHero ? '★ hero' : sizeLabel(size)}</span>
          <span class="battle-cell-remove" data-i="${i}">✕</span>
        </div>`;
      }
      if (occ && occ.anchor !== i) return '';

      return `<div class="battle-cell battle-cell--empty" data-i="${i}">
        <span class="battle-cell-row-hint">R${cellRow(i) + 1}</span>
      </div>`;
    });

    grid.innerHTML = cellHtml.join('');

    grid.querySelectorAll('.battle-cell--empty').forEach(cell => {
      const i = Number(cell.dataset.i);

      cell.addEventListener('dragover', e => {
        if (!dragUnit) return;
        const size = getUnitSize(dragUnit);
        if (!getValidAnchors(size).includes(i) || occupied[i]) return;
        e.preventDefault();
        if (hoverAnchor !== i) {
          root.querySelector('#player-grid')?.querySelectorAll('.battle-cell--hover')
            .forEach(c => c.classList.remove('battle-cell--hover'));
          cell.classList.add('battle-cell--hover');
          hoverAnchor = i;
        }
      });

      cell.addEventListener('dragleave', () => {
        if (hoverAnchor === i) {
          cell.classList.remove('battle-cell--hover');
          hoverAnchor = null;
        }
      });

      cell.addEventListener('drop', e => {
        e.preventDefault();
        hoverAnchor = null;
        if (!dragUnit) return;
        placeUnit(dragUnit, i);
        dragUnit = null;
        renderPlayerGrid();
        renderPortraitTrack();
        checkReady();
      });

      cell.addEventListener('click', () => {
        if (!dragUnit) return;
        const size = getUnitSize(dragUnit);
        if (!getValidAnchors(size).includes(i) || occupied[i]) return;
        placeUnit(dragUnit, i);
        dragUnit = null;
        renderPlayerGrid();
        renderPortraitTrack();
        checkReady();
      });
    });

    grid.querySelectorAll('.battle-cell--placed').forEach(cell => {
      const i = Number(cell.dataset.i);

      cell.querySelector('.battle-cell-remove')?.addEventListener('click', e => {
        e.stopPropagation();
        const anchor = getAnchorForCell(i);
        if (anchor !== null) removeUnit(occupied[anchor].unitId);
        renderPlayerGrid();
        renderPortraitTrack();
        checkReady();
      });

      cell.addEventListener('click', () => {
        const occ  = occupied[i];
        if (!occ) return;
        const unit = roster.find(u => u.id === occ.unitId);
        if (!unit) return;
        openModal(unit.unit_name, unitStatHtml(unit));
      });
    });
  }

  function renderEnemyGrid() {
    const grid = root.querySelector('#enemy-grid');
    grid.innerHTML = Array.from({ length: ROWS * COLS }, (_, i) => {
      const enemy = enemies[i];
      if (enemy) {
        return `<div class="battle-cell battle-cell--enemy" data-i="${i}">
          <span class="battle-cell-name">${enemy.name}</span>
          <span class="battle-cell-sub">❤ ${enemy.hp}</span>
        </div>`;
      }
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
    const track   = root.querySelector('#portrait-track');
    const placed  = placedUnitIds();
    const available = roster.filter(u => !placed.has(u.id));

    if (!available.length) {
      track.innerHTML = `<span class="placeholder" style="padding:0 16px">All units placed</span>`;
      return;
    }

    track.innerHTML = available.map(u => {
      const isHero     = u.id === heroId;
      const size       = getUnitSize(u);
      const isSelected = dragUnit?.id === u.id;
      return `<div class="portrait-card ${isHero ? 'portrait-card--hero' : ''} ${isSelected ? 'portrait-card--selected' : ''}"
                   draggable="true" data-id="${u.id}">
        <div class="portrait-art">${isHero ? '★' : unitTypeIcon(u)}</div>
        <div class="portrait-name">${u.unit_name}</div>
        <div class="portrait-size">${sizeLabel(size)}</div>
      </div>`;
    }).join('');

    track.querySelectorAll('.portrait-card').forEach(card => {
      const u = roster.find(r => r.id === card.dataset.id);
      if (!u) return;

      card.addEventListener('dragstart', e => {
        dragUnit = u;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', u.id);
        setTimeout(() => highlightDropTargets(), 0);
      });

      card.addEventListener('dragend', () => {
        dragUnit    = null;
        hoverAnchor = null;
        renderPlayerGrid();
        renderPortraitTrack();
      });

      card.addEventListener('click', () => {
        dragUnit = dragUnit?.id === u.id ? null : u;
        renderPlayerGrid();
        renderPortraitTrack();
      });

      card.addEventListener('touchstart', () => {
        if (!u) return;
        dragUnit = u;
        highlightDropTargets();
      }, { passive: true });
    });
  }

  function unitTypeIcon(u) {
    const t = u?.unit_data?.type ?? '';
    return { melee: '⚔', ranged: '🏹', caster: '✦', healer: '✚' }[t] ?? '·';
  }

  function unitStatHtml(u) {
    const d = u.unit_data || {};
    return `
      <div class="unit-core-stats">
        <span class="unit-stat"><em>HP</em> ${d.hp ?? '—'}</span>
        <span class="unit-stat"><em>Armor</em> ${d.armor ?? '—'}</span>
        <span class="unit-stat"><em>Initiative</em> ${d.initiative ?? '—'}</span>
      </div>
      <div class="unit-action">
        <span class="unit-action-label">Basic Action</span>
        <div class="unit-action-stats">
          <span class="unit-stat"><em>DMG</em> ${d.action?.value ?? '—'}</span>
          <span class="unit-stat"><em>Range</em> ${d.action?.range ?? '—'}</span>
          <span class="unit-stat"><em>Target</em> ${d.action?.target_type ?? '—'}</span>
        </div>
      </div>
    `;
  }

  function checkReady() {
    const btn        = root.querySelector('#ready-btn');
    const heroPlaced = placedUnitIds().has(heroId);
    btn.disabled     = !heroPlaced;
    btn.textContent  = heroPlaced ? 'Ready' : 'Place your hero to ready up';
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
    const [rosterData, regionsData] = await Promise.all([
      api(`/roster?chat_id=${player.chat_id}`),
      api('/regions'),
    ]);

    roster = rosterData.map((u, i) => ({ ...u, id: u.id || String(i) }));
    const heroUnit = roster.find(u => u.unit_name.toLowerCase() === player.hero?.toLowerCase());
    heroId = heroUnit?.id ?? null;

    const regionDef = regionsData.find(r => r.id === region_id);
    const levelDef  = regionDef?.difficulties?.[`level_${level}`];
    enemies = levelDef?.enemies || [];

    renderEnemyGrid();
    renderPlayerGrid();
    renderPortraitTrack();
    checkReady();
  }

  load();
}