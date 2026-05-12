// public/screens/battle.js
import { api, navigate } from '../main.js';
import { BattleSystem, cellIndex } from '../battle-system.js';

const ROWS = 3;
const COLS = 2;

export function renderBattle(root, { player, region_id, level, playerUnits, enemies, placement }) {
  const battle = new BattleSystem(playerUnits, enemies, placement);

  let selectingTargetFor = null;
  let selectedActionType = null;   // 'attack' | 'ability' | 'defend'
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

  function getPassiveName(unit) {
    const passive = unit.unit_data?.passive;
    if (!passive) return 'None';
    return passive.split(' ')[0]; // e.g. "mithrails_light 1" → "Mithrail's Light"
  }

  function getAbilityName(unit) {
    const ability = unit.unit_data?.ability;
    if (!ability) return 'None';
    return ability.split(' ')[0];
  }

  function render() {
    const actor = battle.currentActor();
    const state = battle.getState();
    const validTargets = selectingTargetFor 
      ? battle.getValidTargets(selectingTargetFor) 
      : [];

    const validTargetIds = new Set(validTargets.map(t => t.id));

    function renderSide(side) {
      const html = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const idx = cellIndex(r, c);
          const occupant = state.combatants.find(co => co.side === side && co.cellIndex === idx);

          if (!occupant) {
            html.push(`<div class="battle-cell battle-cell--empty"><span class="battle-cell-row-hint">R${r+1}</span></div>`);
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

          html.push(`
            <div class="${cls}" data-id="${occupant.id}">
              <span class="battle-cell-name">${unitTypeIcon(occupant)} ${occupant.unit_name}</span>
              ${occupant.alive 
                ? `<span class="battle-cell-sub">${occupant.battle_hp}/${occupant.max_hp}</span>` 
                : `<span class="battle-cell-sub">💀</span>`}
              <div class="bc-hp-bar"><div class="bc-hp-fill" style="width:${Math.max(0, hpPct*100)}%; background:${hpColor(hpPct)}"></div></div>
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

        <div class="battle-arena">
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
          ${state.log.slice(-7).map(entry => {
            if (entry.type === 'round') return `<div class="log-entry log-entry--round">── Round ${entry.round} ──</div>`;
            if (entry.type === 'defend') return `<div class="log-entry"><span class="log-actor">${entry.actorName}</span> ${entry.message}</div>`;
            if (entry.type === 'ability') return `<div class="log-entry"><span class="log-actor">${entry.actorName}</span> ${entry.message}</div>`;
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
      return `<div class="action-panel action-panel--enemy"><span class="action-panel-label">Enemy is acting...</span></div>`;
    }

    if (selectingTargetFor) {
      return `
        <div class="action-panel">
          <div class="action-panel-label">Choose target for <strong>${selectedActionType}</strong></div>
          <button class="action-btn action-btn--cancel" id="cancel-target">Cancel</button>
        </div>`;
    }

    const hasAbility = actor.unit_data?.ability;
    const passiveName = getPassiveName(actor);

    return `
      <div class="action-panel">
        <div class="action-panel-label">
          Acting: <strong>${actor.unit_name}</strong><br>
          <small>Passive: ${passiveName}</small>
        </div>
        <div class="action-btns">
          <button class="action-btn" id="btn-attack">Attack</button>
          ${hasAbility ? `<button class="action-btn" id="btn-ability">Ability</button>` : ''}
          <button class="action-btn" id="btn-defend">Defend</button>
          <button class="action-btn action-btn--skip" id="btn-skip">Skip</button>
        </div>
      </div>`;
  }

  function attachEvents() {
    // Grid clicks for targeting
    root.querySelectorAll('.battle-cell[data-id]').forEach(cell => {
      cell.addEventListener('click', () => {
        if (!selectingTargetFor) return;
        const target = battle.combatants.find(c => c.id === cell.dataset.id);
        if (!target) return;

        const valid = battle.getValidTargets(selectingTargetFor);
        if (valid.some(t => t.id === target.id)) {
          battle.executeAction(selectingTargetFor, target, selectedActionType);
          selectingTargetFor = null;
          selectedActionType = null;
          render();
          nextTurn();
        }
      });
    });

    // Action Buttons
    const attackBtn = root.querySelector('#btn-attack');
    if (attackBtn) attackBtn.addEventListener('click', () => startTargeting('attack'));

    const abilityBtn = root.querySelector('#btn-ability');
    if (abilityBtn) abilityBtn.addEventListener('click', () => startTargeting('ability'));

    const defendBtn = root.querySelector('#btn-defend');
    if (defendBtn) defendBtn.addEventListener('click', () => {
      const actor = battle.currentActor();
      if (actor) {
        battle.executeAction(actor, null, 'defend');
        render();
        nextTurn();
      }
    });

    const skipBtn = root.querySelector('#btn-skip');
    if (skipBtn) skipBtn.addEventListener('click', () => {
      const actor = battle.currentActor();
      if (actor) {
        battle.skipTurn(actor);
        render();
        nextTurn();
      }
    });

    const cancelBtn = root.querySelector('#cancel-target');
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
      selectingTargetFor = null;
      selectedActionType = null;
      render();
    });
  }

  function startTargeting(actionType) {
    const actor = battle.currentActor();
    if (!actor) return;
    selectingTargetFor = actor;
    selectedActionType = actionType;
    render();
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

  // Start the battle
  render();
  const first = battle.currentActor();
  if (first?.side === 'enemy') {
    setTimeout(() => {
      battle.aiTurn();
      render();
      nextTurn();
    }, 800);
  }
}