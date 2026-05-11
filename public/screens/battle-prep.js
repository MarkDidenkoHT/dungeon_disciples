import { api }      from '../main.js';
import { navigate } from '../main.js';

const REGION_META = {
  life_grove:   { label: 'Life Grove',   icon: '🟢' },
  fire_wastes:  { label: 'Fire Wastes',  icon: '🔴' },
  death_crypts: { label: 'Death Crypts', icon: '🟣' },
  frost_peaks:  { label: 'Frost Peaks',  icon: '🔵' },
  nature_wilds: { label: 'Nature Wilds', icon: '🟡' },
};

export function renderBattlePrep(root, { player, region_id, level }) {
  const meta = REGION_META[region_id] || { label: region_id, icon: '⚔' };

  root.innerHTML = `
    <div class="screen screen-battle-prep">
      <div class="embark-header">
        <button class="back-btn" id="back-btn">←</button>
        <span class="embark-title">${meta.icon} ${meta.label}</span>
      </div>

      <div class="battle-prep-body">
        <div class="battle-side battle-side--enemies">
          <div class="battle-side-label">Enemies</div>
          <div class="battle-grid" id="enemy-grid"></div>
        </div>

        <div class="battle-divider">⚔</div>

        <div class="battle-side battle-side--player">
          <div class="battle-side-label">Your Formation</div>
          <div class="battle-grid" id="player-grid"></div>
          <div class="battle-roster-strip" id="roster-strip"></div>
        </div>
      </div>

      <button class="ready-btn" id="ready-btn" disabled>Place your units</button>
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

  const GRID_SIZE = 9;
  const playerSlots = Array(GRID_SIZE).fill(null);
  let roster = [];
  let enemies = [];
  let selectedUnit = null;

  function openModal(title, body) {
    root.querySelector('#modal-title').textContent = title;
    root.querySelector('#modal-body').innerHTML = body;
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

  function renderEnemyGrid() {
    const grid = root.querySelector('#enemy-grid');
    grid.innerHTML = Array(GRID_SIZE).fill(null).map((_, i) => {
      const enemy = enemies[i];
      if (enemy) {
        return `
          <div class="battle-cell battle-cell--enemy" data-i="${i}">
            <span class="battle-cell-name">${enemy.name}</span>
            <span class="battle-cell-hp">❤ ${enemy.hp}</span>
          </div>`;
      }
      return `<div class="battle-cell battle-cell--empty"></div>`;
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
      if (unit) {
        return `
          <div class="battle-cell battle-cell--placed" data-i="${i}">
            <span class="battle-cell-name">${unit.unit_name}</span>
            <span class="battle-cell-remove">✕</span>
          </div>`;
      }
      const active = selectedUnit ? 'battle-cell--drop-target' : '';
      return `<div class="battle-cell battle-cell--empty ${active}" data-i="${i}"></div>`;
    }).join('');

    grid.querySelectorAll('.battle-cell--empty').forEach(cell => {
      cell.addEventListener('click', () => {
        if (!selectedUnit) return;
        const i = Number(cell.dataset.i);
        playerSlots[i] = selectedUnit;
        selectedUnit = null;
        renderPlayerGrid();
        renderRosterStrip();
        checkReady();
      });
    });

    grid.querySelectorAll('.battle-cell--placed').forEach(cell => {
      cell.querySelector('.battle-cell-remove').addEventListener('click', e => {
        e.stopPropagation();
        const i = Number(cell.dataset.i);
        playerSlots[i] = null;
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
    const placed = new Set(playerSlots.filter(Boolean).map(u => u.id));
    const available = roster.filter(u => !placed.has(u.id));

    strip.innerHTML = available.length
      ? available.map(u => `
          <div class="roster-chip ${selectedUnit?.id === u.id ? 'roster-chip--selected' : ''}" data-id="${u.id}">
            ${u.unit_name}
          </div>
        `).join('')
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
    const btn = root.querySelector('#ready-btn');
    const placed = playerSlots.filter(Boolean).length;
    if (placed > 0) {
      btn.disabled = false;
      btn.textContent = 'Ready';
    } else {
      btn.disabled = true;
      btn.textContent = 'Place your units';
    }
  }

  root.querySelector('#ready-btn').addEventListener('click', () => {
    const placed = playerSlots.filter(Boolean);
    if (!placed.length) return;
    openModal('Battle', `
      <div style="text-align:center; padding: 24px 0;">
        <div style="font-size: 2rem; margin-bottom: 12px;">⚔️</div>
        <p>Battle coming next</p>
      </div>
    `);
  });

  async function load() {
    const [progressRows, rosterData, regionsData] = await Promise.all([
      api(`/progress?chat_id=${player.chat_id}`),
      api(`/roster?chat_id=${player.chat_id}`),
      api(`/regions`),
    ]);

    roster = rosterData.map((u, i) => ({ ...u, id: u.id || String(i) }));

    const regionDef = regionsData.find(r => r.id === region_id);
    const levelKey  = `level_${level}`;
    const levelDef  = regionDef?.difficulties?.[levelKey];
    enemies = levelDef?.enemies || [];

    renderEnemyGrid();
    renderPlayerGrid();
    renderRosterStrip();
    checkReady();
  }

  load();
}