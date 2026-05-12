// public/screens/battle.js
import { api, navigate } from '../main.js';
import { BattleSystem, cellIndex } from '../battle-system.js';

const ROWS = 3;
const COLS = 2;

export function renderBattle(root, { player, region_id, level, playerUnits, enemies, placement }) {
  const battle = new BattleSystem(playerUnits, enemies, placement);

  let selectingTargetFor = null;
  let animating = false;

  const regionMeta = {
    life_grove:   { label: 'Life Grove',   icon: '🟢' },
    fire_wastes:  { label: 'Fire Wastes',  icon: '🔴' },
    death_crypts: { label: 'Death Crypts', icon: '🟣' },
    frost_peaks:  { label: 'Frost Peaks',  icon: '🔵' },
    nature_wilds: { label: 'Nature Wilds', icon: '🟡' },
  };
  const meta = regionMeta[region_id] || { label: region_id, icon: '⚔' };

  function hpColor(pct) {
    if (pct > 0.6) return '#4a9a4a';
    if (pct > 0.3) return '#c8973a';
    return '#c84a3a';
  }

  function unitTypeIcon(u) {
    const t = u?.unit_data?.type ?? 'melee';
    const icons = { melee: '⚔', ranged: '🏹', caster: '✦', healer: '✚' };
    return icons[t] ?? '·';
  }

  function render() {
    const actor = battle.currentActor();
    const state = battle.getState();
    const validTargetIds = selectingTargetFor
      ? new Set(battle.getValidTargets(selectingTargetFor).map(t => t.id))
      : new Set();

    function renderSide(side) {
      const html = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const idx = cellIndex(r, c);
          const occupant = state.combatants.find(co => co.side === side && co.cellIndex === idx);

          if (!occupant) {
            html.push(`<div class="battle-cell battle-cell--empty"><span class="battle-cell-row-hint">R${r + 1}</span></div>`);
            continue;
          }

          const isActor = actor?.id === occupant.id;
          const isTarget = validTargetIds.has(occupant.id);
          const hpPct = occupant.battle_hp / occupant.max_hp;

          let cls = `battle-cell ${!occupant.alive ? 'battle-cell--dead' : ''}`;
          if (isActor) cls += ' battle-cell--acting';
          else if (isTarget) cls += ' battle-cell--targetable';
          else if (side === 'player') cls += ' battle-cell--placed';
          else cls += ' battle-cell--enemy';

          const hpBar = occupant.alive
            ? `<div class="bc-hp-bar"><div class="bc-hp-fill" style="width:${Math.max(0, hpPct * 100)}%;background:${hpColor(hpPct)}"></div></div>`
            : '';

          html.push(`
            <div class="${cls}" data-id="${occupant.id}">
              <span class="battle-cell-name">${unitTypeIcon(occupant)} ${occupant.unit_name}</span>
              ${occupant.alive 
                ? `<span class="battle-cell-sub">${occupant.battle_hp}/${occupant.max_hp}</span>` 
                : `<span class="battle-cell-sub">💀</span>`}
              ${hpBar}
            </div>
          `);
        }
      }
      return html.join('');
    }

    root.innerHTML = `
      <div class="screen screen-battle">
        <div class="battle-header">
          <span class="battle-title">${meta.icon} ${meta.label} — Lv ${level}</span>
          <span class="battle-round">Round ${state.round}</span>
        </div>

        <div class="init-queue" id="init-queue">
          ${battle.getActingOrder().slice(0, 4).map((c, i) => `
            <div class="init-card ${i === 0 ? 'init-card--active' : ''}">
              <span class="init-icon">${c.side === 'player' ? unitTypeIcon(c) : '💀'}</span>
              <span class="init-name">${c.unit_name.split(' ')[0]}</span>
              <span class="init-val">${c.initiative}</span>
            </div>
          `).join('')}
        </div>

        <div class="battle-arena" id="battle-arena">
          <div class="battle-half battle-half--player">
            <div class="battle-half-label">Your Side</div>
            <div class="battle-grid" id="player-grid">${renderSide('player')}</div>
          </div>
          <div class="battle-vs">⚔</div>
          <div class="battle-half battle-half--enemy">
            <div class="battle-half-label">Enemies</div>
            <div class="battle-grid" id="enemy-grid">${renderSide('enemy')}</div>
          </div>
        </div>

        <div class="battle-log" id="battle-log">
          ${state.log.slice(-6).map(entry => {
            if (entry.type === 'round') return `<div class="log-entry log-entry--round">── Round ${entry.round} ──</div>`;
            if (entry.type === 'action') {
              const verb = entry.heal ? 'healed' : 'attacked';
              return `<div class="log-entry"><span class="log-actor">${entry.actorName}</span> ${verb} <span class="log-target">${entry.targetName}</span> for <span class="log-val">${entry.value}</span>${entry.killed ? ' 💀' : ''}</div>`;
            }
            if (entry.type === 'skip') return `<div class="log-entry log-entry--skip">${entry.actorName} skipped</div>`;
            return '';
          }).join('')}
        </div>

        ${renderActionPanel()}
      </div>
    `;

    attachEvents();
  }

  function renderActionPanel() {
    const actor = battle.currentActor();
    if (!actor) return '';

    if (actor.side === 'enemy') {
      return `<div class="action-panel action-panel--enemy"><span class="action-panel-label">Enemy is thinking...</span></div>`;
    }

    if (selectingTargetFor) {
      return `
        <div class="action-panel">
          <div class="action-panel-label">Select target</div>
          <button class="action-btn action-btn--cancel" id="cancel-target">Cancel</button>
        </div>`;
    }

    const isHealer = actor.unit_data?.action?.target_type === 'ally';
    return `
      <div class="action-panel">
        <div class="action-panel-label">Acting: <strong>${actor.unit_name}</strong></div>
        <div class="action-btns">
          <button class="action-btn" id="btn-action">${isHealer ? 'Heal' : 'Attack'}</button>
          <button class="action-btn action-btn--skip" id="btn-skip">Skip</button>
        </div>
      </div>`;
  }

  function attachEvents() {
    root.querySelectorAll('.battle-cell[data-id]').forEach(cell => {
      cell.addEventListener('click', () => {
        if (!selectingTargetFor) return;
        const target = battle.combatants.find(c => c.id === cell.dataset.id);
        if (target && battle.getValidTargets(selectingTargetFor).some(t => t.id === target.id)) {
          battle.executeAction(selectingTargetFor, target);
          selectingTargetFor = null;
          render();
          nextTurn();
        }
      });
    });

    const actionBtn = root.querySelector('#btn-action');
    if (actionBtn) {
      actionBtn.addEventListener('click', () => {
        selectingTargetFor = battle.currentActor();
        render();
      });
    }

    const skipBtn = root.querySelector('#btn-skip');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        const actor = battle.currentActor();
        if (actor) {
          battle.skipTurn(actor);
          render();
          nextTurn();
        }
      });
    }

    const cancelBtn = root.querySelector('#cancel-target');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { selectingTargetFor = null; render(); });
  }

  function nextTurn() {
    if (battle.done) {
      renderResult();
      return;
    }

    const next = battle.currentActor();
    if (next?.side === 'enemy') {
      setTimeout(() => {
        battle.aiTurn();
        render();
        nextTurn();
      }, 600);
    }
  }

  function renderResult() {
    const won = battle.winner === 'player';
    const rewards = won
      ? { gold: 50 + level * 20, xp: 20 + level * 10, crystal: 10 + level * 5 }
      : { xp: 5 };

    // ... (same result screen as before)
    root.innerHTML = `...`; // keep your existing result UI, just call battle.winner etc.
    // Add reward API call if won
  }

  render();
  nextTurn(); // start battle
}