// public/screens/battle.js
import { api, navigate } from '../main.js';
import { BattleSystem, cellIndex } from '../battle-system.js';

const ROWS = 3;
const COLS = 2;

export function renderBattle(root, { player, region_id, level, playerUnits, enemies, placement }) {
  const battle = new BattleSystem(playerUnits, enemies, placement);

  let selectingTargetFor = null;
  let selectedActionType = null; // 'attack' or 'ability'

  const regionMeta = { /* ... same as before */ };
  const meta = regionMeta[region_id] || { label: region_id, icon: '⚔' };

  function hpColor(pct) { /* ... same */ }
  function unitTypeIcon(u) { /* ... same */ }

  function getActionLabel(unit) {
    const data = unit?.unit_data || unit;
    if (data.action === 'heal' || data.target_type === 'ally' || data.action?.target_type === 'ally') {
      return 'Heal';
    }
    return 'Attack';
  }

  function getPassiveName(unit) {
    const p = unit?.unit_data?.passive;
    if (!p) return 'None';
    const name = typeof p === 'string' ? p : (p.name || p.id || '');
    return name.split(' ')[0].replace(/_/g, ' ');
  }

  function getAbilityName(unit) {
    const a = unit?.unit_data?.ability;
    if (!a) return 'None';
    const name = typeof a === 'string' ? a : (a.name || a.id || '');
    return name.split(' ')[0].replace(/_/g, ' ');
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
          const occ = state.combatants.find(co => co.side === side && co.cellIndex === idx);
          if (!occ) {
            html.push(`<div class="battle-cell battle-cell--empty"><span class="battle-cell-row-hint">R${r+1}</span></div>`);
            continue;
          }

          const isActor = actor?.id === occ.id;
          const isTarget = validTargetIds.has(occ.id);
          const hpPct = occ.battle_hp / occ.max_hp;

          let cls = `battle-cell ${!occ.alive ? 'battle-cell--dead' : ''}`;
          if (isActor) cls += ' battle-cell--acting';
          else if (isTarget) cls += ' battle-cell--targetable';
          else if (side === 'player') cls += ' battle-cell--placed';
          else cls += ' battle-cell--enemy';

          html.push(`
            <div class="${cls}" data-id="${occ.id}">
              <span class="battle-cell-name">${unitTypeIcon(occ)} ${occ.unit_name}</span>
              ${occ.alive ? `<span class="battle-cell-sub">${occ.battle_hp}/${occ.max_hp}</span>` : `<span class="battle-cell-sub">💀</span>`}
              <div class="bc-hp-bar"><div class="bc-hp-fill" style="width:${Math.max(0, hpPct*100)}%;background:${hpColor(hpPct)}"></div></div>
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

        <div class="init-queue" id="init-queue">${/* ... same */}</div>

        <div class="battle-arena">
          <div class="battle-half battle-half--player">
            <div class="battle-half-label">Your Side</div>
            <div class="battle-grid">${renderSide('player')}</div>
          </div>
          <div class="battle-vs">⚔</div>
          <div class="battle-half battle-half--enemy">
            <div class="battle-half-label">Enemies</div>
            <div class="battle-grid">${renderSide('enemy')}</div>
          </div>
        </div>

        <div class="battle-log" id="battle-log">${/* ... same */}</div>

        ${renderActionPanel(actor)}
      </div>
    `;

    attachEvents();
  }

  function renderActionPanel(actor) {
    if (!actor || actor.side === 'enemy') {
      return `<div class="action-panel action-panel--enemy">Enemy is acting...</div>`;
    }

    const actionLabel = getActionLabel(actor);
    const passiveName = getPassiveName(actor);
    const hasAbility = !!actor.unit_data?.ability;

    return `
      <div class="action-panel">
        <div class="action-panel-label">
          <strong>${actor.unit_name}</strong><br>
          <small>Passive: ${passiveName}</small>
        </div>
        <div class="action-btns">
          <button class="action-btn" id="btn-main">${actionLabel}</button>
          ${hasAbility ? `<button class="action-btn" id="btn-ability">Use Ability</button>` : ''}
          <button class="action-btn" id="btn-defend">Defend</button>
          <button class="action-btn action-btn--skip" id="btn-skip">Skip</button>
        </div>
      </div>`;
  }

  function attachEvents() {
    // Grid targeting
    root.querySelectorAll('.battle-cell[data-id]').forEach(cell => {
      cell.addEventListener('click', () => {
        if (!selectingTargetFor) return;

        const target = battle.combatants.find(c => c.id === cell.dataset.id);
        if (!target) return;

        const validTargets = battle.getValidTargets(selectingTargetFor);
        if (validTargets.some(t => t.id === target.id)) {
          battle.executeAction(selectingTargetFor, target, selectedActionType || 'attack');
          selectingTargetFor = null;
          selectedActionType = null;
          render();
          nextTurn();
        }
      });
    });

    // Buttons
    root.querySelector('#btn-main')?.addEventListener('click', () => startTargeting('attack'));
    root.querySelector('#btn-ability')?.addEventListener('click', () => startTargeting('ability'));
    root.querySelector('#btn-defend')?.addEventListener('click', () => {
      const actor = battle.currentActor();
      if (actor) {
        battle.executeAction(actor, null, 'defend');
        render();
        nextTurn();
      }
    });
    root.querySelector('#btn-skip')?.addEventListener('click', () => {
      const actor = battle.currentActor();
      if (actor) {
        battle.skipTurn(actor);
        render();
        nextTurn();
      }
    });
  }

  function startTargeting(type) {
    const actor = battle.currentActor();
    if (!actor) return;
    selectingTargetFor = actor;
    selectedActionType = type;
    render();
  }

  function nextTurn() {
    if (battle.done) return renderResult();
    const next = battle.currentActor();
    if (next?.side === 'enemy') {
      setTimeout(() => {
        battle.aiTurn();
        render();
        nextTurn();
      }, 700);
    }
  }

  function renderResult() {
    // ... your existing result screen
    const won = battle.winner === 'player';
    root.innerHTML = `...`; // keep as is
    // navigate back on button click
  }

  render();
  if (battle.currentActor()?.side === 'enemy') {
    setTimeout(() => { battle.aiTurn(); render(); nextTurn(); }, 800);
  }
}