import { api, navigate } from '../main.js';
import { UNITS } from '../../data/units.js';

const ROWS = 3;
const COLS = 2;

const RESIST_ICONS = {
  air:    { icon: '🌬️', label: 'Air'    },
  fire:   { icon: '🔥', label: 'Fire'   },
  nature: { icon: '🌿', label: 'Nature' },
  cold:   { icon: '❄️', label: 'Cold'   },
  life:   { icon: '✨', label: 'Life'   },
  death:  { icon: '🌑', label: 'Death'  },
};
const RESIST_ORDER = ['air', 'fire', 'nature', 'cold', 'life', 'death'];

function cellIndex(row, col) { return row * COLS + col; }

function resolveUnitDef(unit) {
  const uid = unit.unit_data?.unit_id ?? unit.unit_data?.id;
  if (!uid) return null;

  for (const factionPool of Object.values(UNITS)) {
    if (typeof factionPool !== 'object' || Array.isArray(factionPool)) continue;
    for (const entry of Object.values(factionPool)) {
      if (entry?.id === uid) return entry;
      if (typeof entry === 'object' && !entry.id) {
        const nested = Object.values(entry).find(u => u?.id === uid);
        if (nested) return nested;
      }
    }
  }
  return null;
}

function getPortraitUrl(unit) {
  const unitDef = resolveUnitDef(unit);
  const unitId = unitDef?.id;
  if (!unitId) return null;
  return `/assets/character_portraits/p_${unitId}.png`;
}

export function renderBattle(root, { player, battle_id, region_id, level, snapshot, reconnect, selectedSpells }) {
  let state            = snapshot;
  let selectingTarget  = null;
  let pendingAction    = null;
  let selectedCombatant = null;
  let processing       = false;
  let statsModal       = null;

  // ── modal helpers ──────────────────────────────────────────────
  function openStatsModal(c) {
    selectedCombatant = c;
    if (statsModal) statsModal.remove();
    statsModal = document.createElement('div');
    statsModal.className = 'battle-stats-modal-overlay';
    statsModal.innerHTML = `
      <div class="battle-stats-modal">
        <button class="battle-stats-modal-close" aria-label="Close">✕</button>
        ${unitStatsHtml(c)}
      </div>
    `;
    statsModal.querySelector('.battle-stats-modal-close').addEventListener('click', closeStatsModal);
    statsModal.addEventListener('click', e => { if (e.target === statsModal) closeStatsModal(); });
    root.appendChild(statsModal);
  }

  function closeStatsModal() {
    if (statsModal) { statsModal.remove(); statsModal = null; }
  }

  const regionMeta = {
    forests_of_ashenveil: { label: 'Forests of Ashenveil', icon: '🌲' },
    mountains_of_valdrek: { label: 'Mountains of Valdrek', icon: '⛰️' },
    dungeons_of_malgrath: { label: 'Dungeons of Malgrath', icon: '💀' },
  };
  const meta = regionMeta[region_id] || { label: region_id, icon: '⚔' };

  function hpColor(pct) {
    if (pct > 0.6) return '#4a9a4a';
    if (pct > 0.3) return '#c8973a';
    return '#c84a3a';
  }

  function getActionLabel(unit) {
    const tt = unit?.unit_data?.target_type || unit?.unit_data?.action?.target_type;
    return tt === 'ally' ? 'Heal' : 'Attack';
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

  function currentActor() {
    if (!state || state.done) return null;
    return state.combatants
      .filter(c => c.alive && !c.acted_this_round)
      .sort((a, b) => b.initiative - a.initiative)[0] ?? null;
  }

  function getValidTargetIds(actor, forAbility) {
    if (!actor || !state) return new Set();
    const targets = new Set();
    const isHeal  = actor.unit_data?.target_type === 'ally' || actor.unit_data?.action?.target_type === 'ally';
    const key     = String(actor.unit_data?.ability || actor.unit_data?.active_ability || '').toLowerCase();

    if (forAbility) {
      let cands = [];
      if (key.startsWith('purge')) cands = state.combatants.filter(c => c.side !== actor.side && c.alive);
      else if (key.startsWith('raise_dead')) cands = state.combatants.filter(c => c.side === actor.side && !c.alive && (c.unit_data?.tags ?? []).includes('Undead'));
      else if (key.startsWith('devour')) cands = state.combatants.filter(c => c.side === actor.side && c.alive && c.id !== actor.id);
      else if (key.startsWith('lions_roar')) cands = [actor];
      else cands = state.combatants.filter(c => c.side !== actor.side && c.alive);
      cands.forEach(c => targets.add(c.id));
      return targets;
    }

    if (isHeal) {
      state.combatants.filter(c => c.side === actor.side && c.alive).forEach(c => targets.add(c.id));
      return targets;
    }

    const range = actor.unit_data?.range ?? 1;
    state.combatants.filter(c => c.side !== actor.side && c.alive).forEach(t => {
      if (range > 1) { targets.add(t.id); return; }
      const frontCol   = t.side === 'enemy' ? 0 : 1;
      const backCol    = t.side === 'enemy' ? 1 : 0;
      const frontAlive = state.combatants.filter(c => c.side === t.side && c.alive && c.cellIndex % COLS === frontCol);
      const reachable  = frontAlive.length > 0 ? frontCol : backCol;
      if (t.cellIndex % COLS === reachable) targets.add(t.id);
    });
    return targets;
  }

  function unitStatsHtml(c) {
    if (!c) return `<div class="battle-unit-detail-empty">Tap a unit to see stats</div>`;
    const res = c.unit_data?.resistances ?? {};
    const resistCells = RESIST_ORDER.map(r => {
      const info = RESIST_ICONS[r];
      const val  = res[r] ?? 0;
      const cls  = val > 0 ? 'resist-val--pos' : val < 0 ? 'resist-val--neg' : '';
      return `<div class="resist-cell" title="${info.label}">
        <span class="resist-icon">${info.icon}</span>
        <span class="resist-val ${cls}">${val}</span>
      </div>`;
    }).join('');
    const passive  = c.unit_data?.passive || c.unit_data?.passive_ability || '—';
    const ability  = c.unit_data?.ability || c.unit_data?.active_ability  || '—';
    const sideBadge = c.side === 'player'
      ? `<span class="detail-unit-badge">Ally</span>`
      : `<span class="detail-unit-badge detail-unit-badge--enemy">Enemy</span>`;
    const portraitUrl = getPortraitUrl(c);
    return `
      <div class="battle-unit-detail">
        <div class="detail-unit-header">
          ${portraitUrl ? `<img class="detail-unit-portrait" src="${portraitUrl}" alt="${c.unit_name}" onerror="this.style.display='none'">` : ''}
          <div class="detail-unit-info">
            <span class="detail-unit-name">${c.unit_name}</span>
            ${sideBadge}
            ${!c.alive ? '<span class="detail-unit-badge detail-unit-badge--used">💀 Dead</span>' : ''}
          </div>
        </div>
        <div class="unit-core-stats">
          <div class="core-stat"><span class="core-stat-label">HP</span><span class="core-stat-val">${c.battle_hp}/${c.max_hp}</span></div>
          <div class="core-stat"><span class="core-stat-label">Armor</span><span class="core-stat-val">${c.armor ?? '—'}</span></div>
          <div class="core-stat"><span class="core-stat-label">Init</span><span class="core-stat-val">${c.initiative ?? '—'}</span></div>
          ${(c.buffs||[]).find(b=>b.type==='shield') ? `<div class="core-stat"><span class="core-stat-label">Shield</span><span class="core-stat-val">${(c.buffs||[]).find(b=>b.type==='shield').value}</span></div>` : ''}
          ${(c.debuffs||[]).find(b=>b.type==='burn')   ? `<div class="core-stat"><span class="core-stat-label">🔥 Burn</span><span class="core-stat-val">${(c.debuffs||[]).find(b=>b.type==='burn').value}</span></div>`   : ''}
          ${(c.debuffs||[]).find(b=>b.type==='poison') ? `<div class="core-stat"><span class="core-stat-label">☠️ Poison</span><span class="core-stat-val">${(c.debuffs||[]).find(b=>b.type==='poison').value}</span></div>` : ''}
        </div>
        <div class="unit-resists-grid">${resistCells}</div>
        <div class="unit-core-stats">
          <div class="core-stat"><span class="core-stat-label">Passive</span><span class="core-stat-val">${passive}</span></div>
          <div class="core-stat"><span class="core-stat-label">Ability</span><span class="core-stat-val">${ability}</span></div>
        </div>
      </div>
    `;
  }

  function formatLogEntry(entry) {
    if (entry.type === 'round') return `<div class="log-entry log-entry--round">── Round ${entry.round} ──</div>`;
    if (entry.type === 'defend' || entry.type === 'ability') {
      const actorLoc  = entry.actorCell  !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>`  : '';
      const targetLoc = entry.targetCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.targetCell)})</span>` : '';
      const target    = entry.targetName ? ` → <span class="log-target">${entry.targetName}</span>${targetLoc}` : '';
      return `<div class="log-entry"><span class="log-actor">${entry.actorName}</span>${actorLoc}${target} ${entry.message}</div>`;
    }
    if (entry.type === 'shield') {
      const actorLoc = entry.actorCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>` : '';
      return `<div class="log-entry log-entry--shield"><span class="log-actor">${entry.targetName}</span>${actorLoc} 🛡 shield absorbed <span class="log-val-shield">${entry.value}</span>${entry.remaining > 0 ? `, ${entry.remaining} passes through` : ', all blocked'}</div>`;
    }
    if (entry.type === 'status') {
      const actorLoc  = entry.actorCell  !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>`  : '';
      const targetLoc = entry.targetCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.targetCell)})</span>` : '';
      return `<div class="log-entry"><span class="log-actor">${entry.actorName}</span>${actorLoc} applied <span class="log-passive">${entry.passive}</span> to <span class="log-target">${entry.targetName}</span>${targetLoc} <span class="log-dot">(${entry.value}/turn)</span></div>`;
    }
    if (entry.type === 'passive') {
      const actorLoc  = entry.actorCell  !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>`  : '';
      const targetLoc = entry.targetCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.targetCell)})</span>` : '';
      const isHeal    = entry.heal !== false;
      return `<div class="log-entry log-entry--passive">
        <span class="log-actor">${entry.actorName}</span>${actorLoc}
        <span class="log-passive"> ${entry.passive}</span>
        ${isHeal ? 'healed' : 'hit'}
        <span class="log-target"> ${entry.targetName}</span>${targetLoc} for
        <span class="${isHeal ? 'log-val-heal' : 'log-val'}">${entry.value}</span>
      </div>`;
    }
    if (entry.type === 'action') {
      const actorLoc  = entry.actorCell  !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>`  : '';
      const targetLoc = entry.targetCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.targetCell)})</span>` : '';
      const verb      = entry.heal ? 'healed' : 'hit';
      const valClass  = entry.heal ? 'log-val-heal' : 'log-val';
      return `<div class="log-entry">
        <span class="log-actor">${entry.actorName}</span>${actorLoc} ${verb}
        <span class="log-target"> ${entry.targetName}</span>${targetLoc} for
        <span class="${valClass}">${entry.value}</span>
        ${entry.killed ? ' 💀' : ''}
      </div>`;
    }
    if (entry.type === 'skip') return `<div class="log-entry log-entry--skip">${entry.actorName} skipped</div>`;
    return '';
  }

  function render() {
    const actor = currentActor();
    if (!state) return;

    const isEnemyTurn  = !actor || actor.side === 'enemy';
    const hasAbility   = actor && !!(actor.unit_data?.ability || actor.unit_data?.active_ability);
    const abilityName  = actor ? (actor.unit_data?.ability || actor.unit_data?.active_ability || 'No Ability') : 'Ability';
    const actionLabel  = actor ? getActionLabel(actor) : 'Attack';
    const passiveName  = actor ? getPassiveName(actor) : '';

    const validTargetKeys = new Set();
    if (selectingTarget && pendingAction) {
      getValidTargetIds(selectingTarget, pendingAction === 'ability').forEach(id => validTargetKeys.add(id));
    }

    function renderSide(side) {
      const html = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const idx = r * COLS + c;
          const occ = state.combatants.find(co => co.side === side && co.cellIndex === idx);
          if (!occ) {
            html.push(`<div class="battle-cell battle-cell--empty"><span class="battle-cell-row-hint">R${r+1}</span></div>`);
            continue;
          }
          const isActor    = actor?.id === occ.id;
          const isTarget   = validTargetKeys.has(occ.id);
          const isSelected = selectedCombatant?.id === occ.id;
          const hpPct      = occ.battle_hp / occ.max_hp;
          const portraitUrl = getPortraitUrl(occ);
          let cls = `battle-cell ${!occ.alive ? 'battle-cell--dead' : ''}`;
          if (isActor)         cls += ' battle-cell--acting';
          else if (isTarget)   cls += ' battle-cell--targetable';
          else if (isSelected) cls += ' battle-cell--selected';
          else if (side === 'player') cls += ' battle-cell--placed';
          else                 cls += ' battle-cell--enemy';
          html.push(`
            <div class="${cls}" data-id="${occ.id}">
              ${portraitUrl ? `<img class="battle-cell-portrait" src="${portraitUrl}" alt="${occ.unit_name}" onerror="this.style.display='none'">` : ''}
              <div class="battle-cell-info">
                <span class="battle-cell-name">${occ.unit_name}</span>
                ${occ.alive
                  ? `<span class="battle-cell-sub">${occ.battle_hp}/${occ.max_hp}${(occ.buffs||[]).find(b=>b.type==='shield') ? ` 🛡${(occ.buffs||[]).find(b=>b.type==='shield').value}` : ''}</span>`
                  : `<span class="battle-cell-sub">💀</span>`}
                <div class="bc-hp-bar"><div class="bc-hp-fill" style="width:${Math.max(0, hpPct*100)}%;background:${hpColor(hpPct)}"></div></div>
              </div>
            </div>
          `);
        }
      }
      return html.join('');
    }

    const actingOrder = state.combatants
      .filter(c => c.alive && !c.acted_this_round)
      .sort((a, b) => b.initiative - a.initiative);

    root.innerHTML = `
      <div class="screen screen-battle">
        <div class="init-queue" id="init-queue">
          ${actingOrder.slice(0, 4).map((c, i) => `
            <div class="init-card ${i === 0 ? 'init-card--active' : ''}">
              <span class="init-icon">${c.side === 'player' ? '⚔' : '💀'}</span>
              <span class="init-name">${c.unit_name.split(' ')[0]}</span>
            </div>
          `).join('')}
        </div>

        <div class="battle-arena">
          <div class="battle-half battle-half--player">
            <div class="battle-grid">${renderSide('player')}</div>
          </div>
          <div class="battle-vs">⚔</div>
          <div class="battle-half battle-half--enemy">
            <div class="battle-grid">${renderSide('enemy')}</div>
          </div>
        </div>

        <div class="action-panel">
          <div class="action-panel-label">
            ${processing
              ? `<span style="color:var(--muted)">Processing…</span>`
              : isEnemyTurn
                ? `<span style="color:var(--muted)">Enemy is acting…</span>`
                : `<strong>${actor.unit_name}</strong> <small style="color:var(--muted)">· Passive: ${passiveName}</small>`
            }
          </div>
          <div class="action-btns">
            <button class="action-btn ${isEnemyTurn || processing || selectingTarget ? 'action-btn--disabled' : ''}"
                    id="btn-main" ${isEnemyTurn || processing ? 'disabled' : ''}>${actionLabel}</button>
            <button class="action-btn ${(!hasAbility || (actor && actor.used_active) || isEnemyTurn || processing) ? 'action-btn--disabled' : ''}"
                    id="btn-ability" ${(!hasAbility || (actor && actor.used_active) || isEnemyTurn || processing) ? 'disabled' : ''}>
              ${actor && actor.used_active ? '(used) ' : ''}${abilityName}
            </button>
            <button class="action-btn ${isEnemyTurn || processing ? 'action-btn--disabled' : ''}"
                    id="btn-defend" ${isEnemyTurn || processing ? 'disabled' : ''}>Defend</button>
            <button class="action-btn action-btn--cancel ${!selectingTarget ? 'action-btn--disabled' : ''}"
                    id="btn-cancel" ${!selectingTarget ? 'disabled' : ''}>✕ Cancel</button>
          </div>
        </div>

        <div class="battle-log" id="battle-log">
          ${(state.log || []).slice().reverse().map(formatLogEntry).join('')}
        </div>
      </div>
    `;

    attachEvents();
  }

  async function advanceEnemyTurns() {
    const actor = currentActor();
    if (!actor || actor.side !== 'enemy' || processing) return;
    processing = true;
    render();
    try {
      const result = await api('/battle/advance', { battle_id });
      state = result.state;
      if (result.done) return renderResult(result.winner);
    } catch (err) {
      console.error('Advance failed:', err);
    } finally {
      processing = false;
    }
    render();
  }

  async function sendAction(action, actor_id, target_id = null) {
    processing = true;
    render();
    try {
      const result = await api('/battle/action', { battle_id, action, actor_id, target_id });
      state = result.state;
      selectingTarget = null;
      pendingAction   = null;
      if (result.done) {
        return renderResult(result.winner);
      }
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      processing = false;
    }
    render();
    advanceEnemyTurns();
  }

  function attachEvents() {
    root.querySelectorAll('.battle-cell[data-id]').forEach(cell => {
      cell.addEventListener('click', () => {
        const id = cell.dataset.id;
        const combatant = state.combatants.find(c => c.id === id);
        if (!combatant) return;

        if (selectingTarget && pendingAction) {
          const validIds = getValidTargetIds(selectingTarget, pendingAction === 'ability');
          if (validIds.has(combatant.id)) {
            sendAction(pendingAction, selectingTarget.id, combatant.id);
            return;
          }
        }

        openStatsModal(combatant);
        root.querySelectorAll('.battle-cell--selected').forEach(c => c.classList.remove('battle-cell--selected'));
        cell.classList.add('battle-cell--selected');
      });
    });

    root.querySelector('#btn-main')?.addEventListener('click', () => {
      const actor = currentActor();
      if (!actor || actor.side === 'enemy' || processing) return;
      closeStatsModal();
      selectingTarget = actor;
      pendingAction   = 'attack';
      render();
    });

    root.querySelector('#btn-ability')?.addEventListener('click', () => {
      const actor = currentActor();
      if (!actor || actor.side === 'enemy' || processing || actor.used_active) return;
      closeStatsModal();
      const key = String(actor.unit_data?.ability || actor.unit_data?.active_ability || '').toLowerCase();
      if (key.startsWith('lions_roar') || key.startsWith('devour')) {
        sendAction('ability', actor.id, actor.id);
        return;
      }
      selectingTarget = actor;
      pendingAction   = 'ability';
      render();
    });

    root.querySelector('#btn-defend')?.addEventListener('click', () => {
      const actor = currentActor();
      if (!actor || actor.side === 'enemy' || processing) return;
      closeStatsModal();
      sendAction('defend', actor.id);
    });

    root.querySelector('#btn-cancel')?.addEventListener('click', () => {
      selectingTarget = null;
      pendingAction   = null;
      render();
    });
  }

  async function renderResult(winner) {
    const won         = winner === 'player';
    const survivors   = won ? state.combatants.filter(c => c.side === 'player' && c.alive && c._rosterId) : [];
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
        battle_id,
        survivor_ids: survivorIds,
      });
      const rewardsEl = root.querySelector('#result-rewards');
      if (won) {
        rewardsEl.innerHTML = `
          <div class="reward-row"><span>🪙 Gold</span><span>+${result.gold}</span></div>
          <div class="reward-row"><span>💎 Crystals</span><span>+${result.crystal}</span></div>
          ${result.crystal_bonus > 0 ? `<div class="reward-row"><span>✨ ${result.crystal_bonus_type?.replace('Crystals_', '')} Crystal (bonus)</span><span>+${result.crystal_bonus}</span></div>` : ''}
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

  if (state && state.done) {
    renderResult(state.winner);
  } else {
    render();
    advanceEnemyTurns();
  }
}