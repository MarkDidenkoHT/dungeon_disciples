// public/screens/battle.js
import { api, navigate } from '../main.js';
import { BattleSystem, cellIndex } from '../battle-system.js';

const ROWS = 3;
const COLS = 2;

export function renderBattle(root, { player, region_id, level, playerUnits, enemies, placement }) {
  const battle = new BattleSystem(playerUnits, enemies, placement);

  let selectingTargetFor = null;
  let selectedActionType = null; // 'attack' or 'ability'

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

  function getActionLabel(unit) {
    const data = unit?.unit_data || unit;
    const targetType = data.action?.target_type || data.target_type || data.action;
    return (targetType === 'ally' || targetType === 'heal') ? 'Heal' : 'Attack';
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
              ${occ.alive 
                ? `<span class="battle-cell-sub">${occ.battle_hp}/${occ.max_hp}</span>` 
                : `<span class="battle-cell-sub">💀</span>`}
              <div class="bc-hp-bar">
                <div class="bc-hp-fill" style="width:${Math.max(0, hpPct*100)}%;background:${hpColor(hpPct)}"></div>
              </div>
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
            </div>
          `).join('')}
        </div>

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

        <div class="battle-log" id="battle-log">
          ${state.log.slice(-7).map(entry => {
            if (entry.type === 'round') return `<div class="log-entry log-entry--round">── Round ${entry.round} ──</div>`;
            if (entry.type === 'defend' || entry.type === 'ability' || entry.type === 'status') {
              return `<div class="log-entry"><span class="log-actor">${entry.actorName}</span> ${entry.message}</div>`;
            }
            if (entry.type === 'action') {
              const verb = entry.heal ? 'healed' : 'attacked';
              return `<div class="log-entry"><span class="log-actor">${entry.actorName}</span> ${verb} <span class="log-target">${entry.targetName}</span> for <span class="log-val">${entry.value}</span>${entry.killed ? ' 💀' : ''}</div>`;
            }
            if (entry.type === 'skip') return `<div class="log-entry log-entry--skip">${entry.actorName} skipped</div>`;
            return '';
          }).join('')}
        </div>

        ${renderActionPanel(actor)}
      </div>
    `;

    attachEvents();
  }

  function renderActionPanel(actor) {
    if (!actor || actor.side === 'enemy') {
      return `<div class="action-panel action-panel--enemy"><span class="action-panel-label">Enemy is acting...</span></div>`;
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
    // Grid target selection
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

    // Action buttons
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
    const won = battle.winner === 'player';
    const rewards = won ? {
      gold: 50 + level * 20,
      xp: 20 + level * 10,
      crystal: 10 + level * 5
    } : { xp: 5 };

    root.innerHTML = `
      <div class="screen screen-battle-result">
        <div class="result-banner ${won ? 'result-banner--win' : 'result-banner--loss'}">
          ${won ? '🏆 VICTORY!' : '💀 DEFEAT'}
        </div>
        <div class="result-body">
          ${won ? `
            <div class="result-rewards">
              <div>🪙 +${rewards.gold} Gold</div>
              <div>⭐ +${rewards.xp} XP</div>
              <div>💎 +${rewards.crystal} Crystals</div>
            </div>
          ` : `
            <div class="result-rewards">
              <div>⭐ +${rewards.xp} XP</div>
            </div>
          `}
        </div>
        <button class="ready-btn" id="back-to-castle">Return to Castle</button>
      </div>
    `;

    root.querySelector('#back-to-castle').addEventListener('click', () => {
      navigate('castle', { player });
    });
  }

  // Start battle
  render();

  // If enemy acts first
  if (battle.currentActor()?.side === 'enemy') {
    setTimeout(() => {
      battle.aiTurn();
      render();
      nextTurn();
    }, 800);
  }
}