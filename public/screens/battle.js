import { api, navigate } from '../main.js';
import { BattleSystem, cellIndex } from '../battle-system.js';

const ROWS = 3;
const COLS = 2;
const UNIT_TYPE_ICONS = { melee: '⚔', ranged: '🏹', caster: '✦', healer: '✚' };

export function renderBattle(root, { player, region_id, level, playerUnits, enemies, placement }) {
  const battle = new BattleSystem(playerUnits, enemies, placement);

  let selectingTargetFor = null;
  let selectedActionType = null;

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
    const t = u?.unit_data?.type ?? '';
    return UNIT_TYPE_ICONS[t] ?? '·';
  }

  function getActionLabel(unit) {
    return battle.isHealer(unit) ? 'Heal' : 'Attack';
  }

  function getPassiveName(unit) {
    const p = unit?.unit_data?.passive || unit?.unit_data?.passive_ability;
    if (!p) return 'None';
    const name = typeof p === 'string' ? p : (p.name || p.id || '');
    return name.split(' ')[0].replace(/_/g, ' ');
  }

  function cellLabel(cellIdx) {
    const r = Math.floor(cellIdx / COLS);
    const c = cellIdx % COLS;
    return `R${r + 1}C${c + 1}`;
  }

  function formatLogEntry(entry) {
    if (entry.type === 'round') {
      return `<div class="log-entry log-entry--round">── Round ${entry.round} ──</div>`;
    }

    if (entry.type === 'defend' || entry.type === 'ability') {
      const actorLoc = entry.actorCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>` : '';
      const targetLoc = entry.targetCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.targetCell)})</span>` : '';
      const target = entry.targetName ? ` → <span class="log-target">${entry.targetName}</span>${targetLoc}` : '';
      return `<div class="log-entry"><span class="log-actor">${entry.actorName}</span>${actorLoc}${target} ${entry.message}</div>`;
    }

    if (entry.type === 'shield') {
      const actorLoc = entry.actorCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>` : '';
      return `<div class="log-entry log-entry--shield"><span class="log-actor">${entry.targetName}</span>${actorLoc} 🛡 shield absorbed <span class="log-val-shield">${entry.value}</span>${entry.remaining > 0 ? `, ${entry.remaining} passes through` : ', all blocked'}</div>`;
    }

    if (entry.type === 'status') {
      const actorLoc = entry.actorCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>` : '';
      const targetLoc = entry.targetCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.targetCell)})</span>` : '';
      return `<div class="log-entry"><span class="log-actor">${entry.actorName}</span>${actorLoc} applied <span class="log-passive">${entry.passive}</span> to <span class="log-target">${entry.targetName}</span>${targetLoc} <span class="log-dot">(${entry.value}/turn)</span></div>`;
    }

    if (entry.type === 'passive') {
      const actorLoc = entry.actorCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>` : '';
      const targetLoc = entry.targetCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.targetCell)})</span>` : '';
      const isHeal = entry.heal !== false;
      return `<div class="log-entry log-entry--passive">
        <span class="log-actor">${entry.actorName}</span>${actorLoc}
        <span class="log-passive"> ${entry.passive}</span>
        ${isHeal ? 'healed' : 'hit'}
        <span class="log-target"> ${entry.targetName}</span>${targetLoc} for
        <span class="${isHeal ? 'log-val-heal' : 'log-val'}">${entry.value}</span>
      </div>`;
    }

    if (entry.type === 'action') {
      const actorLoc = entry.actorCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>` : '';
      const targetLoc = entry.targetCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.targetCell)})</span>` : '';
      const verb = entry.heal ? 'healed' : 'hit';
      const valClass = entry.heal ? 'log-val-heal' : 'log-val';
      return `<div class="log-entry">
        <span class="log-actor">${entry.actorName}</span>${actorLoc} ${verb}
        <span class="log-target"> ${entry.targetName}</span>${targetLoc} for
        <span class="${valClass}">${entry.value}</span>
        ${entry.killed ? ' 💀' : ''}
      </div>`;
    }

    if (entry.type === 'skip') {
      return `<div class="log-entry log-entry--skip">${entry.actorName} skipped</div>`;
    }

    return '';
  }

  function render() {
    const actor = battle.currentActor();
    const state = battle.getState();

    // Build valid target set keyed by side+cellIndex — immune to duplicate ids
    const validTargetKeys = new Set();
    if (selectingTargetFor) {
      for (const t of battle.getValidTargets(selectingTargetFor)) {
        validTargetKeys.add(`${t.side}:${t.cellIndex}`);
      }
    }

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

          const isActor = actor?.side === occ.side && actor?.cellIndex === occ.cellIndex;
          const targetKey = `${occ.side}:${occ.cellIndex}`;
          const isTarget = validTargetKeys.has(targetKey);
          const hpPct = occ.battle_hp / occ.max_hp;

          let cls = `battle-cell ${!occ.alive ? 'battle-cell--dead' : ''}`;
          if (isActor) cls += ' battle-cell--acting';
          else if (isTarget) cls += ' battle-cell--targetable';
          else if (side === 'player') cls += ' battle-cell--placed';
          else cls += ' battle-cell--enemy';

          // Encode side and cellIndex into the DOM — the unambiguous locator
          html.push(`
            <div class="${cls}" data-side="${occ.side}" data-cell="${occ.cellIndex}">
              <span class="battle-cell-name">${unitTypeIcon(occ)} ${occ.unit_name}</span>
              ${occ.alive
                ? `<span class="battle-cell-sub">${occ.battle_hp}/${occ.max_hp}${occ.shield > 0 ? ` 🛡${occ.shield}` : ''}</span>`
                : `<span class="battle-cell-sub">💀</span>`}
              <div class="bc-hp-bar"><div class="bc-hp-fill" style="width:${Math.max(0, hpPct*100)}%;background:${hpColor(hpPct)}"></div></div>
            </div>
          `);
        }
      }
      return html.join('');
    }

    const isEnemyTurn = !actor || actor.side === 'enemy';
    const hasAbility = actor && (!!actor.unit_data?.ability || !!actor.unit_data?.active_ability);
    const abilityName = actor ? (actor.unit_data?.ability || actor.unit_data?.active_ability || 'No Ability') : '';
    const actionLabel = actor ? getActionLabel(actor) : 'Attack';
    const passiveName = actor ? getPassiveName(actor) : '';

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

        <div class="action-panel">
          <div class="action-panel-label">
            ${isEnemyTurn
              ? `<span style="color:var(--muted)">Enemy is acting…</span>`
              : `<strong>${actor.unit_name}</strong> <small style="color:var(--muted)">· Passive: ${passiveName}</small>`
            }
          </div>
          <div class="action-btns">
            <button class="action-btn ${isEnemyTurn || selectingTargetFor ? 'action-btn--disabled' : ''}"
                    id="btn-main" ${isEnemyTurn ? 'disabled' : ''}>${selectingTargetFor && selectedActionType === 'attack' ? '🎯 ' : ''}${actionLabel}</button>
            <button class="action-btn ${(!hasAbility || (actor && actor.used_active) || isEnemyTurn) ? 'action-btn--disabled' : ''}"
                    id="btn-ability" ${(!hasAbility || (actor && actor.used_active) || isEnemyTurn) ? 'disabled' : ''}>
              ${actor && actor.used_active ? '(used) ' : ''}${abilityName || 'Ability'}
            </button>
            <button class="action-btn ${isEnemyTurn ? 'action-btn--disabled' : ''}"
                    id="btn-defend" ${isEnemyTurn ? 'disabled' : ''}>Defend</button>
            ${selectingTargetFor ? `<button class="action-btn action-btn--cancel" id="btn-cancel">✕</button>` : ''}
          </div>
        </div>

        <div class="battle-log" id="battle-log">
          ${state.log.slice().reverse().map(formatLogEntry).join('')}
        </div>
      </div>
    `;

    attachEvents();
  }

  function attachEvents() {
    root.querySelectorAll('.battle-cell[data-side][data-cell]').forEach(cell => {
      cell.addEventListener('click', () => {
        if (!selectingTargetFor) return;

        const side      = cell.dataset.side;
        const cellIdx   = parseInt(cell.dataset.cell, 10);

        // Look up by side + cellIndex — guaranteed unique, no id collision possible
        const target = battle.combatants.find(
          c => c.side === side && c.cellIndex === cellIdx
        );
        if (!target) return;

        const valid = battle.getValidTargets(selectingTargetFor);
        if (valid.some(t => t.side === target.side && t.cellIndex === target.cellIndex)) {
          battle.executeAction(selectingTargetFor, target, selectedActionType || 'attack');
          selectingTargetFor = null;
          selectedActionType = null;
          render();
          nextTurn();
        }
      });
    });

    root.querySelector('#btn-main')?.addEventListener('click', () => {
      if (!battle.currentActor() || battle.currentActor().side === 'enemy') return;
      startTargeting('attack');
    });

    root.querySelector('#btn-ability')?.addEventListener('click', () => {
      const actor = battle.currentActor();
      if (!actor || actor.side === 'enemy') return;
      const abilityTargets = battle.getValidTargets(actor, true);
      if (abilityTargets.length === 0) {
        battle.doAbility(actor, null);
        render();
        nextTurn();
      } else {
        startTargeting('ability');
      }
    });

    root.querySelector('#btn-defend')?.addEventListener('click', () => {
      const actor = battle.currentActor();
      if (!actor || actor.side === 'enemy') return;
      battle.executeAction(actor, null, 'defend');
      render();
      nextTurn();
    });

    root.querySelector('#btn-cancel')?.addEventListener('click', () => {
      selectingTargetFor = null;
      selectedActionType = null;
      render();
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

  async function renderResult() {
    const won = battle.winner === 'player';

    const survivors = won
      ? battle.combatants.filter(c => c.side === 'player' && c.alive && c._rosterId)
      : [];
    const survivorIds = survivors.map(c => c._rosterId).filter(Boolean);

    root.innerHTML = `
      <div class="screen screen-battle-result">
        <div class="result-banner ${won ? 'result-banner--win' : 'result-banner--loss'}">
          ${won ? '🏆 VICTORY!' : '💀 DEFEAT'}
        </div>
        <div class="result-rewards" id="result-rewards">
          <p style="color:var(--muted)">Calculating rewards…</p>
        </div>
        <button class="ready-btn" id="back-to-castle" disabled>Return to Castle</button>
      </div>
    `;

    try {
      const result = await api('/battle/reward', {
        chat_id:      player.chat_id,
        region_id,
        level,
        won,
        survivor_ids: survivorIds,
      });

      const rewardsEl = root.querySelector('#result-rewards');
      if (won) {
        rewardsEl.innerHTML = `
          <div class="reward-row"><span>🪙 Gold</span><span>+${result.gold}</span></div>
          <div class="reward-row"><span>💎 Crystals</span><span>+${result.crystal}</span></div>
          <div class="reward-row"><span>⭐ XP</span><span>+${result.xp_granted} each (${survivorIds.length} survivors)</span></div>
          ${result.progress_unlocked ? `<div class="reward-row reward-row--unlock"><span>🔓 Level ${result.next_level} unlocked!</span></div>` : ''}
        `;
      } else {
        rewardsEl.innerHTML = `<p style="color:var(--muted)">No rewards on defeat.</p>`;
      }
    } catch (err) {
      root.querySelector('#result-rewards').innerHTML =
        `<p style="color:var(--danger)">Failed to save rewards: ${err.message}</p>`;
    }

    const btn = root.querySelector('#back-to-castle');
    btn.disabled = false;
    btn.addEventListener('click', () => navigate('castle', { player }));
  }

  render();

  if (battle.currentActor()?.side === 'enemy') {
    setTimeout(() => { battle.aiTurn(); render(); nextTurn(); }, 800);
  }
}