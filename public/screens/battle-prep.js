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
const TOTAL = ROWS * COLS;

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
          <div class="battle-row-labels">
            <span>Row 1</span><span>Row 2</span><span>Row 3</span>
          </div>
          <div class="battle-grid battle-grid--player" id="player-grid"></div>
        </div>

        <div class="battle-vs">⚔</div>

        <div class="battle-half battle-half--enemy">
          <div class="battle-half-label">Enemies</div>
          <div class="battle-grid battle-grid--enemy" id="enemy-grid"></div>
        </div>
      </div>

      <div class="battle-roster-strip" id="roster-strip"></div>

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

  const playerSlots = Array(TOTAL).fill(null);
  let roster  = [];
  let enemies = [];
  let heroId  = null;
  let selectedUnit = null;

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

  function slotRow(i) { return Math.floor(i / COLS); }

  function renderEnemyGrid() {
    const grid = root.querySelector('#enemy-grid');
    grid.innerHTML = Array(TOTAL).fill(null).map((_, i) => {
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

  function renderPlayerGrid() {
    const grid = root.querySelector('#player-grid');
    grid.innerHTML = playerSlots.map((unit, i) => {
      const rowLabel = `R${slotRow(i) + 1}`;
      if (unit) {
        const isHero = unit.id === heroId;
        return `<div class="battle-cell battle-cell--placed ${isHero ? 'battle-cell--hero' : ''}" data-i="${i}">
          <span class="battle-cell-name">${unit.unit_name}</span>
          ${isHero ? '<span class="battle-cell-sub">hero</span>' : ''}
          <span class="battle-cell-remove">✕</span>
        </div>`;
      }
      const dropClass = selectedUnit ? 'battle-cell--drop-target' : '';
      return `<div class="battle-cell battle-cell--empty ${dropClass}" data-i="${i}">
        <span class="battle-cell-row-hint">${rowLabel}</span>
      </div>`;
    }).join('');

    grid.querySelectorAll('.battle-cell--empty').forEach(cell => {
      cell.addEventListener('click', () => {
        if (!selectedUnit) return;
        playerSlots[Number(cell.dataset.i)] = selectedUnit;
        selectedUnit = null;
        renderPlayerGrid();
        renderRosterStrip();
        checkReady();
      });
    });

    grid.querySelectorAll('.battle-cell--placed').forEach(cell => {
      cell.querySelector('.battle-cell-remove').addEventListener('click', e => {
        e.stopPropagation();
        playerSlots[Number(cell.dataset.i)] = null;
        renderPlayerGrid();
        renderRosterStrip();
        checkReady();
      });
      cell.addEventListener('click', () => {
        const u = playerSlots[Number(cell.dataset.i)];
        openModal(u.unit_name, `
          <div class="unit-core-stats">
            <span class="unit-stat"><em>HP</em> ${u.unit_data?.hp ?? '—'}</span>
            <span class="unit-stat"><em>Armor</em> ${u.unit_data?.armor ?? '—'}</span>
            <span class="unit-stat"><em>Initiative</em> ${u.unit_data?.initiative ?? '—'}</span>
          </div>
        `);
      });
    });
  }

  function renderRosterStrip() {
    const strip = root.querySelector('#roster-strip');
    const placedIds = new Set(playerSlots.filter(Boolean).map(u => u.id));
    const available = roster.filter(u => !placedIds.has(u.id));

    strip.innerHTML = available.length
      ? available.map(u => {
          const isHero    = u.id === heroId;
          const isSelected = selectedUnit?.id === u.id;
          return `<div class="roster-chip ${isHero ? 'roster-chip--hero' : ''} ${isSelected ? 'roster-chip--selected' : ''}" data-id="${u.id}">
            ${u.unit_name}${isHero ? ' ★' : ''}
          </div>`;
        }).join('')
      : `<span class="placeholder">All units placed</span>`;

    strip.querySelectorAll('.roster-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const u = roster.find(r => r.id === chip.dataset.id);
        selectedUnit = selectedUnit?.id === u.id ? null : u;
        renderPlayerGrid();
        renderRosterStrip();
      });
    });
  }

  function checkReady() {
    const btn         = root.querySelector('#ready-btn');
    const heroPlaced  = playerSlots.some(u => u?.id === heroId);
    if (heroPlaced) {
      btn.disabled    = false;
      btn.textContent = 'Ready';
    } else {
      btn.disabled    = true;
      btn.textContent = 'Place your hero to ready up';
    }
  }

  root.querySelector('#ready-btn').addEventListener('click', () => {
    if (!playerSlots.some(u => u?.id === heroId)) return;
    openModal('Battle', `
      <div style="text-align:center; padding:24px 0;">
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
    renderRosterStrip();
    checkReady();
  }

  load();
}