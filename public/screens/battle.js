import { api, navigate } from '../main.js';

const ROWS = 3;
const COLS = 2;

function cellIndex(row, col) { return row * COLS + col; }
function cellRow(i) { return Math.floor(i / COLS); }
function cellCol(i) { return i % COLS; }

function calcDamage(attacker, target) {
  const raw = Math.max(1, (attacker.action?.value ?? 10) - (target.armor ?? 0));
  return raw;
}

function getValidTargets(actor, all) {
  const type = actor.unit_data?.type ?? 'melee';
  const range = actor.unit_data?.action?.range ?? 1;
  const targetType = actor.unit_data?.action?.target_type ?? 'enemy';

  return all.filter(t => {
    if (!t.alive) return false;
    if (targetType === 'ally') return t.side === actor.side && t.id !== actor.id;
    if (targetType === 'enemy') {
      if (t.side === actor.side) return false;
      if (range === 1) {
        const actorRow = cellRow(actor.cellIndex);
        const targetRow = cellRow(t.cellIndex);
        const dist = Math.abs(actorRow - targetRow);
        return dist <= 1;
      }
      return true;
    }
    return false;
  });
}

function aiChooseTarget(actor, all) {
  const targets = getValidTargets(actor, all);
  if (!targets.length) return null;
  return targets.reduce((a, b) => a.battle_hp < b.battle_hp ? a : b);
}

function buildBattleState(playerUnits, enemyUnits, placement) {
  const combatants = [];

  playerUnits.forEach((u, i) => {
    const cellIdx = placement[u.id] ?? i;
    combatants.push({
      id: u.id,
      unit_name: u.unit_name,
      unit_data: u.unit_data,
      side: 'player',
      cellIndex: cellIdx,
      battle_hp: u.unit_data?.hp ?? 50,
      max_hp: u.unit_data?.hp ?? 50,
      armor: u.unit_data?.armor ?? 0,
      initiative: u.unit_data?.initiative ?? 10,
      alive: true,
      acted_this_round: false,
      used_active: false,
    });
  });

  enemyUnits.forEach((e, i) => {
    const col = i % COLS;
    const row = Math.min(Math.floor(i / COLS), ROWS - 1);
    combatants.push({
      id: `enemy_${i}`,
      unit_name: e.name,
      unit_data: { ...e, type: e.type ?? 'melee', action: e.action },
      side: 'enemy',
      cellIndex: cellIndex(row, col),
      battle_hp: e.hp ?? 50,
      max_hp: e.hp ?? 50,
      armor: e.armor ?? 0,
      initiative: e.initiative ?? 10,
      alive: true,
      acted_this_round: false,
      used_active: false,
    });
  });

  return {
    combatants,
    round: 1,
    phase: 'player_turn',
    log: [],
    done: false,
    winner: null,
  };
}

function getActingOrder(combatants) {
  return combatants
    .filter(c => c.alive && !c.acted_this_round)
    .sort((a, b) => b.initiative - a.initiative);
}

function checkWin(combatants) {
  const playerAlive = combatants.some(c => c.side === 'player' && c.alive);
  const enemyAlive = combatants.some(c => c.side === 'enemy' && c.alive);
  if (!playerAlive) return 'enemy';
  if (!enemyAlive) return 'player';
  return null;
}

function advanceRound(state) {
  state.combatants.forEach(c => { c.acted_this_round = false; });
  state.round += 1;
  state.log.push({ type: 'round', round: state.round });
}

export function renderBattle(root, { player, region_id, level, playerUnits, enemies, placement }) {
  let state = buildBattleState(playerUnits, enemies, placement);
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

  function currentActor() {
    const order = getActingOrder(state.combatants);
    return order[0] ?? null;
  }

  function hpColor(pct) {
    if (pct > 0.6) return '#4a9a4a';
    if (pct > 0.3) return '#c8973a';
    return '#c84a3a';
  }

  function unitTypeIcon(u) {
    const t = u?.unit_data?.type ?? '';
    const icons = { melee: '⚔', ranged: '🏹', caster: '✦', healer: '✚' };
    return icons[t] ?? '·';
  }

  function renderGrid() {
    const actor = currentActor();
    const validTargetIds = selectingTargetFor
      ? new Set(getValidTargets(selectingTargetFor, state.combatants).map(t => t.id))
      : new Set();

    function cellsOf(side) {
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
          const isPlayer = side === 'player';

          let cls = 'battle-cell';
          if (!occupant.alive) cls += ' battle-cell--dead';
          else if (isActor) cls += ' battle-cell--acting';
          else if (isTarget) cls += ' battle-cell--targetable';
          else if (isPlayer) cls += ' battle-cell--placed';
          else cls += ' battle-cell--enemy';
          if (!occupant.alive) cls = 'battle-cell battle-cell--dead';

          const hpBar = occupant.alive
            ? `<div class="bc-hp-bar"><div class="bc-hp-fill" style="width:${Math.max(0, hpPct * 100).toFixed(1)}%;background:${hpColor(hpPct)}"></div></div>`
            : '';

          const acted = occupant.acted_this_round ? ' ✓' : '';
          html.push(`<div class="${cls}" data-id="${occupant.id}">
            <span class="battle-cell-name">${unitTypeIcon(occupant)} ${occupant.unit_name}${acted}</span>
            ${occupant.alive ? `<span class="battle-cell-sub">${occupant.battle_hp}/${occupant.max_hp}</span>` : `<span class="battle-cell-sub">💀</span>`}
            ${hpBar}
          </div>`);
        }
      }
      return html.join('');
    }

    return `
      <div class="battle-half battle-half--player">
        <div class="battle-half-label">Your Side</div>
        <div class="battle-grid" id="player-grid">${cellsOf('player')}</div>
      </div>
      <div class="battle-vs">⚔</div>
      <div class="battle-half battle-half--enemy">
        <div class="battle-half-label">Enemies</div>
        <div class="battle-grid" id="enemy-grid">${cellsOf('enemy')}</div>
      </div>
    `;
  }

  function renderInitQueue() {
    const order = getActingOrder(state.combatants);
    const next3 = order.slice(0, 4);
    return next3.map((c, i) => {
      const icon = c.side === 'player' ? unitTypeIcon(c) : '💀';
      return `<div class="init-card ${i === 0 ? 'init-card--active' : ''}">
        <span class="init-icon">${icon}</span>
        <span class="init-name">${c.unit_name.split(' ')[0]}</span>
        <span class="init-val">${c.initiative}</span>
      </div>`;
    }).join('');
  }

  function renderActionPanel() {
    const actor = currentActor();
    if (!actor) return '';

    if (actor.side === 'enemy') {
      return `<div class="action-panel action-panel--enemy"><span class="action-panel-label">Enemy is acting…</span></div>`;
    }

    if (selectingTargetFor) {
      return `<div class="action-panel">
        <div class="action-panel-label">Select a target on the grid</div>
        <button class="action-btn action-btn--cancel" id="cancel-target">Cancel</button>
      </div>`;
    }

    const targetType = actor.unit_data?.action?.target_type ?? 'enemy';
    const attackLabel = targetType === 'ally' ? 'Heal' : 'Attack';

    return `<div class="action-panel">
      <div class="action-panel-label">Acting: <strong>${actor.unit_name}</strong> (Init ${actor.initiative})</div>
      <div class="action-btns">
        <button class="action-btn" id="btn-attack">${attackLabel}</button>
        <button class="action-btn action-btn--skip" id="btn-skip">Skip</button>
      </div>
    </div>`;
  }

  function renderLog() {
    const last5 = state.log.slice(-6);
    return last5.map(entry => {
      if (entry.type === 'round') return `<div class="log-entry log-entry--round">── Round ${entry.round} ──</div>`;
      if (entry.type === 'action') {
        const verb = entry.heal ? 'healed' : 'attacked';
        const val = entry.value;
        const killed = entry.killed ? ' 💀' : '';
        return `<div class="log-entry"><span class="log-actor">${entry.actorName}</span> ${verb} <span class="log-target">${entry.targetName}</span> for <span class="log-val">${val}</span>${killed}</div>`;
      }
      if (entry.type === 'skip') return `<div class="log-entry log-entry--skip">${entry.actorName} skipped</div>`;
      return '';
    }).join('');
  }

  function render() {
    const actor = currentActor();
    const isPlayerTurn = actor?.side === 'player';

    root.innerHTML = `
      <div class="screen screen-battle">
        <div class="battle-header">
          <span class="battle-title">${meta.icon} ${meta.label} — Lv ${level}</span>
          <span class="battle-round">Round ${state.round}</span>
        </div>

        <div class="init-queue" id="init-queue">${renderInitQueue()}</div>

        <div class="battle-arena" id="battle-arena">
          ${renderGrid()}
        </div>

        <div class="battle-log" id="battle-log">${renderLog()}</div>

        ${renderActionPanel()}
      </div>
    `;

    attachEvents();
  }

  function attachEvents() {
    const cancelBtn = root.querySelector('#cancel-target');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        selectingTargetFor = null;
        render();
      });
    }

    const attackBtn = root.querySelector('#btn-attack');
    if (attackBtn) {
      attackBtn.addEventListener('click', () => {
        const actor = currentActor();
        if (!actor) return;
        selectingTargetFor = actor;
        render();
      });
    }

    const skipBtn = root.querySelector('#btn-skip');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        const actor = currentActor();
        if (!actor) return;
        applySkip(actor);
      });
    }

    root.querySelectorAll('#player-grid [data-id], #enemy-grid [data-id]').forEach(cell => {
      cell.addEventListener('click', () => {
        if (!selectingTargetFor) return;
        const targetId = cell.dataset.id;
        const target = state.combatants.find(c => c.id === targetId);
        if (!target) return;

        const valid = getValidTargets(selectingTargetFor, state.combatants);
        if (!valid.find(v => v.id === targetId)) return;

        const actor = selectingTargetFor;
        selectingTargetFor = null;
        applyAction(actor, target);
      });
    });
  }

  function applyAction(actor, target) {
    if (animating) return;
    const targetType = actor.unit_data?.action?.target_type ?? 'enemy';
    const isHeal = targetType === 'ally';
    const value = calcDamage(actor, target);

    if (isHeal) {
      target.battle_hp = Math.min(target.max_hp, target.battle_hp + value);
      state.log.push({ type: 'action', actorName: actor.unit_name, targetName: target.unit_name, value, heal: true });
    } else {
      target.battle_hp = Math.max(0, target.battle_hp - value);
      const killed = target.battle_hp <= 0;
      if (killed) target.alive = false;
      state.log.push({ type: 'action', actorName: actor.unit_name, targetName: target.unit_name, value, killed });
    }

    actor.acted_this_round = true;

    const win = checkWin(state.combatants);
    if (win) {
      state.done = true;
      state.winner = win;
      renderResult();
      return;
    }

    const remaining = getActingOrder(state.combatants);
    if (!remaining.length) advanceRound(state);

    render();

    const next = currentActor();
    if (next?.side === 'enemy') {
      animating = true;
      setTimeout(() => {
        runEnemyTurn(next);
        animating = false;
      }, 800);
    }
  }

  function applySkip(actor) {
    state.log.push({ type: 'skip', actorName: actor.unit_name });
    actor.acted_this_round = true;

    const win = checkWin(state.combatants);
    if (win) {
      state.done = true;
      state.winner = win;
      renderResult();
      return;
    }

    const remaining = getActingOrder(state.combatants);
    if (!remaining.length) advanceRound(state);

    render();

    const next = currentActor();
    if (next?.side === 'enemy') {
      animating = true;
      setTimeout(() => {
        runEnemyTurn(next);
        animating = false;
      }, 800);
    }
  }

  function runEnemyTurn(actor) {
    const target = aiChooseTarget(actor, state.combatants);
    if (!target) {
      applySkip(actor);
      return;
    }
    applyAction(actor, target);
  }

  function renderResult() {
    const won = state.winner === 'player';
    const rewards = won
      ? { gold: Math.floor(50 + level * 20), xp: Math.floor(20 + level * 10), crystal: Math.floor(10 + level * 5) }
      : { xp: 5 };

    root.innerHTML = `
      <div class="screen screen-battle-result">
        <div class="result-banner ${won ? 'result-banner--win' : 'result-banner--loss'}">
          ${won ? '🏆 Victory!' : '💀 Defeated'}
        </div>
        <div class="result-body">
          ${won ? `
            <div class="result-rewards">
              <div class="result-reward-row">🪙 <span>+${rewards.gold} Gold</span></div>
              <div class="result-reward-row">⭐ <span>+${rewards.xp} XP</span></div>
              <div class="result-reward-row">💎 <span>+${rewards.crystal} Crystals</span></div>
            </div>
          ` : `
            <div class="result-rewards">
              <div class="result-reward-row">⭐ <span>+${rewards.xp} XP (consolation)</span></div>
            </div>
          `}
          <div class="result-log">
            ${state.log.filter(e => e.type === 'round').length} rounds fought
          </div>
        </div>
        <button class="ready-btn" id="back-to-dungeon">Return to Castle</button>
      </div>
    `;

    const backBtn = root.querySelector('#back-to-dungeon');
    if (backBtn) {
      backBtn.addEventListener('click', async () => {
        if (won) {
          try {
            await api('/battle/reward', {
              chat_id: player.chat_id,
              gold: rewards.gold,
              xp: rewards.xp,
              crystal_type: `Crystals_${region_id.split('_')[0].charAt(0).toUpperCase() + region_id.split('_')[0].slice(1)}`,
              crystal_amount: rewards.crystal,
            });
          } catch {}
        }
        navigate('castle', { player });
      });
    }
  }

  render();

  const first = currentActor();
  if (first?.side === 'enemy') {
    animating = true;
    setTimeout(() => {
      runEnemyTurn(first);
      animating = false;
    }, 1000);
  }
}