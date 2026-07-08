import { api, navigate } from '../api.js';
import { UNIT_ABILITIES } from '../../data/unit_abilities.js';
import { resolveUnitDef, CRYSTAL_ICONS, GOLD_ICON, openSheet, closeSheet, buildUnitCard, renderItemSlotIcon, buildItemModalParts } from '../utils.js';
import { initBattleFx, reattachBattleFx, destroyBattleFx, playHealEffect } from '../battle-fx.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';

const ROWS = 3;
const COLS = 2;

function cellIndex(row, col) { return row * COLS + col; }

function getPortraitUrl(unit, variant = 'default') {
  const unitDef = resolveUnitDef(unit);
  const unitId = unitDef?.id;
  if (!unitId) return null;
  const portraitId = unitId.match(/^(h_[a-z]_\d)/)?.[1] ?? unitId;
  const size = unitDef?.size ?? 'tile';
  const prefix = (variant === 'grid' && (size === 'row' || size === 'column')) ? 'p2' : 'p';
  return `/assets/character_portraits/${prefix}_${portraitId}.png`;
}

export function renderBattle(root, { player, battle_id, region_id, level, snapshot, reconnect, selectedSpells }) {
  let state            = snapshot;
  let selectingTarget  = null;
  let pendingAction    = null;
  let selectedCombatant = null;
  let processing       = false;
  let prevState        = null;   // snapshot before each render, used for diff-based animations

  let prevLogLen = 0;

  initBattleFx(root);

  let items = [];
  api(`/items?chat_id=${player.chat_id}`).then(data => { items = data || []; }).catch(() => {});

  function equippedItemFor(rosterId) {
    if (rosterId == null) return null;
    return items.find(it => String(it.equipped_by) === String(rosterId)) || null;
  }

  document.addEventListener('click', e => {
    const itemBtn = e.target.closest('[data-item-inspect]');
    if (!itemBtn) return;
    const rosterId = itemBtn.dataset.rosterId;
    const item = equippedItemFor(rosterId);
    if (!item) return;
    const parts = buildItemModalParts(item);
    openSheet(parts.title, parts.body, parts.badges);
  });

  function snapshotState() {
    if (!state) return null;
    const map = {};
    for (const c of state.combatants) map[c.id] = { hp: c.battle_hp, alive: c.alive };
    return map;
  }

  function showBarkToast(actorId, text) {
    if (player?.settings?.barks_enabled === false) return;
    const cell = root.querySelector(`.battle-cell[data-id="${actorId}"]`);
    if (!cell) return;
    cell.classList.add('battle-cell--bark-active');
    const toast = document.createElement('div');
    toast.className = 'bark-toast';
    toast.textContent = text;
    cell.appendChild(toast);

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      toast.remove();
      cell.classList.remove('battle-cell--bark-active');
      document.removeEventListener('click', dismiss, true);
      document.removeEventListener('touchstart', dismiss, true);
    };
    // Any interaction anywhere closes it - deferred so the click that triggered
    // this render (e.g. the action button press) doesn't instantly dismiss it.
    setTimeout(() => {
      document.addEventListener('click', dismiss, true);
      document.addEventListener('touchstart', dismiss, true);
    }, 0);
    setTimeout(dismiss, 6000);
  }

  function animateAfterRender(prev, prevLen) {
    if (!prev) return;
    // Hit flash, heal pulse, death shake
    root.querySelectorAll('.battle-cell[data-id]').forEach(cell => {
      const id   = cell.dataset.id;
      const was  = prev[id];
      const now  = state.combatants.find(c => c.id === id);
      if (!was || !now) return;

      if (!now.alive && was.alive) {
        triggerAnim(cell, 'anim-death');
      } else if (now.battle_hp < was.hp) {
        triggerAnim(cell, 'anim-hit');
      } else if (now.battle_hp > was.hp) {
        triggerAnim(cell, 'anim-heal');
      }
    });

    // Log entry slide-in: animate only newly added entries
    const newCount = (state.log?.length ?? 0) - prevLen;
    if (newCount > 0) {
      const logEl = root.querySelector('#battle-log');
      if (logEl) {
        Array.from(logEl.querySelectorAll('.log-entry')).slice(0, newCount).forEach(el => {
          triggerAnim(el, 'anim-log-in');
        });
      }
      (state.log || []).slice(prevLen).forEach(entry => {
        if (entry.type === 'bark') showBarkToast(entry.actorId, entry.text);
        if (entry.targetId && entry.type === 'action' && entry.heal === true) {
          const cell = root.querySelector(`.battle-cell[data-id="${entry.targetId}"]`);
          if (cell) playHealEffect(cell);
        }
        if (entry.targetId && entry.type === 'passive' && entry.heal !== false && entry.passive === "Mithrail's Light") {
          const cell = root.querySelector(`.battle-cell[data-id="${entry.targetId}"]`);
          if (cell) playHealEffect(cell, 'holy');
        }
      });
    }
  }

  function triggerAnim(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }

  function openStatsModal(c) {
    selectedCombatant = c;
    const name = c.name ?? c.unit_data?.unit_id ?? 'Unit';
    openSheet(name, unitStatsHtml(c));
  }

  function closeStatsModal() {
    closeSheet();
  }

  const regionMeta = {
    crimson_basilica: { label: 'Crimson Basilica', icon: '🌲' },
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
    const actionKey = unit?.unit_data?.action;
    const key = typeof actionKey === 'string' ? actionKey : actionKey?.id;
    if (key === 'sacrifice') return 'Sacrifice';
    const actionType = typeof actionKey === 'object' ? actionKey?.action_type : null;
    if (actionType === 'none') return 'Passive';
    if (unit?.buffs?._mothers_kiss || unit?._mothers_kiss) return "Mother's Kiss";
    const tt = unit?.unit_data?.target_type || unit?.unit_data?.action?.target_type;
    return tt === 'ally' ? 'Heal' : 'Attack';
  }

  function getPassiveName(unit) {
    const p = unit?.unit_data?.passive || unit?.unit_data?.passive_ability;
    if (!p) return 'None';
    if (Array.isArray(p)) {
      return p.filter(Boolean).map(k => k.split(' ')[0].replace(/_/g, ' ')).join(', ') || 'None';
    }
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
    const actionRaw = actor.unit_data?.action;
    const actionKey = typeof actionRaw === 'string' ? actionRaw : actionRaw?.id;

    if (actionKey === 'sacrifice') {
      state.combatants.filter(c => c.alive && c.side === actor.side && c.id !== actor.id).forEach(c => targets.add(c.id));
      return targets;
    }

    if (forAbility) {
      const key    = actor.unit_data?.ability || actor.unit_data?.active_ability;
      const def    = key ? UNIT_ABILITIES[key] : null;
      const ttype  = def?.target ?? 'enemy';
      const tagReq = def?.params?.tag_required ?? null;
      let cands = [];
      if      (ttype === 'self')       cands = [actor];
      else if (ttype === 'enemy')      cands = state.combatants.filter(c => c.side !== actor.side && c.alive);
      else if (ttype === 'ally')       cands = state.combatants.filter(c => c.side === actor.side && c.alive && c.id !== actor.id);
      else if (ttype === 'ally_any')   cands = state.combatants.filter(c => c.side === actor.side && c.alive);
      else if (ttype === 'all_allies') cands = state.combatants.filter(c => c.side === actor.side && c.alive);
      else if (ttype === 'ally_dead')  cands = state.combatants.filter(c => c.side === actor.side && !c.alive && (!tagReq || (c.unit_data?.tags ?? []).includes(tagReq)));
      else if (ttype === 'ally_tagged') cands = state.combatants.filter(c => c.side === actor.side && c.alive && c.id !== actor.id && (!tagReq || (c.unit_data?.tags ?? []).includes(tagReq)));
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
    const def = resolveUnitDef(c);
    if (!def) return `<div class="battle-unit-detail-empty">Unit data unavailable</div>`;

    const liveUnit = {
      ...def,
      hp:         `${c.battle_hp}/${c.max_hp}`,
      armor:      c.armor ?? def.armor ?? 0,
      initiative: c.initiative ?? def.initiative ?? '—',
      resistances: c.unit_data?.resistances ?? def.resistances ?? {},
    };

    const badge = c.side === 'player' ? 'Ally' : 'Enemy';
    const shield = (c.buffs || []).find(b => b.type === 'shield');
    const burn   = (c.debuffs || []).find(b => b.type === 'burn');
    const poison = (c.debuffs || []).find(b => b.type === 'poison');

    const statusChips = [
      !c.alive ? `<span class="stat-diff-chip stat-diff--down">💀 Dead</span>` : '',
      shield ? `<span class="stat-diff-chip stat-diff--up">🛡 Shield ${shield.value}</span>` : '',
      burn   ? `<span class="stat-diff-chip stat-diff--down">🔥 Burn ${burn.value}</span>`   : '',
      poison ? `<span class="stat-diff-chip stat-diff--down">☠️ Poison ${poison.value}</span>` : '',
    ].filter(Boolean).join('');

    const statusHtml = statusChips ? `<div class="unit-stat-diffs">${statusChips}</div>` : '';

    const equippedItem = c.side === 'player' ? equippedItemFor(c._rosterId) : null;
    const itemSlotHtml  = c.side === 'player' ? renderItemSlotIcon(equippedItem, c._rosterId, { interactive: false }) : '';

    return `<div class="battle-unit-detail" data-roster-id="${c._rosterId ?? ''}">${buildUnitCard(liveUnit, { badge, itemSlotHtml })}${statusHtml}</div>`;
  }

  function formatLogEntry(entry) {
    if (entry.type === 'round') return `<div class="log-entry log-entry--round">── Round ${entry.round} ──</div>`;
    if (entry.type === 'intercept') {
      const actorLoc  = entry.actorCell  !== undefined ? ` <span class="log-loc">(${cellLabel(entry.actorCell)})</span>`  : '';
      const targetLoc = entry.targetCell !== undefined ? ` <span class="log-loc">(${cellLabel(entry.targetCell)})</span>` : '';
      return `<div class="log-entry log-entry--passive"><span class="log-actor">${entry.actorName}</span>${actorLoc} <span class="log-passive">intercepted</span> attack on <span class="log-target">${entry.targetName}</span>${targetLoc}</div>`;
    }
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
    if (entry.type === 'bark') {
      if (player?.settings?.barks_enabled === false) return '';
      return `<div class="log-entry log-entry--bark">${entry.actorName}: "${entry.text}"</div>`;
    }
    if (entry.type === 'notice') return `<div class="log-entry log-entry--notice">${entry.message}</div>`;
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
    const isNoneAction = actor && (typeof actor.unit_data?.action === 'object' ? actor.unit_data.action?.action_type === 'none' : false);

    const validTargetKeys = new Set();
    if (selectingTarget && pendingAction) {
      getValidTargetIds(selectingTarget, pendingAction === 'ability').forEach(id => validTargetKeys.add(id));
    }

    function renderSide(side) {

      const cellMap = {};
      const shadow  = new Set();

      for (const co of state.combatants) {
        if (co.side !== side) continue;
        const anchor = co.cellIndex;
        const size   = co.size ?? 'tile';
        const r      = Math.floor(anchor / COLS);
        const c      = anchor % COLS;
        cellMap[anchor] = co;
        if (size === 'row'    && c === 0)        shadow.add(anchor + 1);
        if (size === 'column' && r <= ROWS - 2)  shadow.add(anchor + COLS);
      }

      const html = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const idx = r * COLS + c;
          if (shadow.has(idx)) continue;

          const occ = cellMap[idx];
          if (!occ) {
            html.push(`<div class="battle-cell battle-cell--empty"><span class="battle-cell-row-hint">R${r+1}</span></div>`);
            continue;
          }

          const size      = occ.size ?? 'tile';
          const colSpan   = size === 'row'    ? 2 : 1;
          const rowSpan   = size === 'column' ? 2 : 1;
          const spanStyle = (colSpan > 1 || rowSpan > 1)
            ? `grid-column:span ${colSpan};grid-row:span ${rowSpan};`
            : '';

          const isActor    = actor?.id === occ.id;
          const isTarget   = validTargetKeys.has(occ.id);
          const isSelected = selectedCombatant?.id === occ.id;
          const hpPct      = occ.battle_hp / occ.max_hp;
          const portraitUrl = getPortraitUrl(occ, 'grid');

          let cls = `battle-cell ${!occ.alive ? 'battle-cell--dead' : ''}`;
          if (isActor)              cls += ' battle-cell--acting anim-actor-pulse';
          else if (isTarget)        cls += ' battle-cell--targetable';
          else if (isSelected)      cls += ' battle-cell--selected';
          else if (side === 'player') cls += ' battle-cell--placed';
          else                      cls += ' battle-cell--enemy';

          html.push(`
            <div class="${cls}" data-id="${occ.id}" style="${spanStyle}">
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
          ${actingOrder.map((c, i) => {
            const portrait = getPortraitUrl(c);
            const isActive = i === 0;
            const side     = c.side;
            return `
              <div class="init-card ${isActive ? 'init-card--active' : ''} init-card--${side}">
                <div class="init-portrait">
                  ${portrait
                    ? `<img class="init-portrait-img" src="${portrait}" alt="${c.unit_name}" onerror="this.style.display='none'">`
                    : `<span class="init-portrait-fallback">${side === 'player' ? '⚔' : '💀'}</span>`
                  }
                </div>
                <span class="init-name">${c.unit_name.split(' ')[0]}</span>
                <div class="init-side-strip"></div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="battle-arena">
          <div class="battle-half battle-half--player">
            <div class="battle-grid-wrap">
              <div class="battle-grid">${renderSide('player')}</div>
            </div>
          </div>
          <div class="battle-half battle-half--enemy">
            <div class="battle-grid-wrap">
              <div class="battle-grid">${renderSide('enemy')}</div>
            </div>
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
            <button class="action-btn ${isEnemyTurn || processing || selectingTarget || isNoneAction ? 'action-btn--disabled' : ''}"
                    id="btn-main" ${isEnemyTurn || processing || isNoneAction ? 'disabled' : ''}>${actionLabel}</button>
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

    reattachBattleFx(root);
    attachEvents();
  }

  async function advanceEnemyTurns() {
    const actor = currentActor();
    if (!actor || actor.side !== 'enemy' || processing) return;
    processing = true;
    render();
    try {
      const prev    = snapshotState();
      const prevLen = state.log?.length ?? 0;
      const result  = await api('/battle/advance', { chat_id: player.chat_id, battle_id });
      state = result.state;
      if (result.done) return renderResult(result.winner);
      render();
      animateAfterRender(prev, prevLen);
    } catch (err) {
      console.error('Advance failed:', err);
      render();
    } finally {
      processing = false;
    }
  }

  async function sendAction(action, actor_id, target_id = null) {
    markTutorialDone(player, 'battle_first_action');
    hideTutorial();
    processing = true;
    const prev    = snapshotState();
    const prevLen = state.log?.length ?? 0;
    render();
    try {
      const result = await api('/battle/action', { chat_id: player.chat_id, battle_id, action, actor_id, target_id });
      state = result.state;
      selectingTarget = null;
      pendingAction   = null;
      if (result.done) {
        return renderResult(result.winner);
      }
    } catch (err) {
      console.error('Action failed:', err);
      const log = root.querySelector('#battle-log');
      if (log) {
        const el = document.createElement('div');
        el.className = 'log-entry log-entry--error';
        el.textContent = `⚠ ${err.message}`;
        log.prepend(el);
      }
    } finally {
      processing = false;
    }
    render();
    animateAfterRender(prev, prevLen);
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
      const actionType = typeof actor.unit_data?.action === 'object' ? actor.unit_data.action?.action_type : null;
      if (actionType === 'none') return;
      if (actor.buffs?._mothers_kiss) {
        sendAction('attack', actor.id, actor.id);
        return;
      }
      selectingTarget = actor;
      pendingAction   = 'attack';
      render();
    });

    root.querySelector('#btn-ability')?.addEventListener('click', () => {
      const actor = currentActor();
      if (!actor || actor.side === 'enemy' || processing || actor.used_active) return;
      closeStatsModal();
      const abilityKey = actor.unit_data?.ability || actor.unit_data?.active_ability;
      const def        = abilityKey ? UNIT_ABILITIES[abilityKey] : null;
      const ttype      = def?.target ?? 'enemy';
      if (ttype === 'self' || ttype === 'all_allies' || ttype === 'ally_any' || def?.params?.mothers_kiss) {
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

    const tutorialActor = currentActor();
    const tutorialIsEnemyTurn = !tutorialActor || tutorialActor.side === 'enemy';
    if (!tutorialIsEnemyTurn && !processing && !selectingTarget && !isTutorialDone(player, 'battle_first_action')) {
      const mainBtn = root.querySelector('#btn-main');
      if (mainBtn) showTutorialSpotlight(player, 'battle_first_action', mainBtn);
    } else {
      hideTutorial();
    }
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
          <div class="reward-row"><span>${GOLD_ICON} Gold</span><span>+${result.gold}</span></div>
          <div class="reward-row"><span>💎 Crystals</span><span>+${result.crystal}</span></div>
          ${result.crystal_bonus > 0 ? `<div class="reward-row"><span>${CRYSTAL_ICONS[result.crystal_bonus_type] || '💎'} ${result.crystal_bonus_type?.replace('Crystals_', '')} Crystal (bonus)</span><span>+${result.crystal_bonus}</span></div>` : ''}
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
    btn.addEventListener('click', () => { destroyBattleFx(); navigate('castle', { player }); });
  }

  if (state && state.done) {
    renderResult(state.winner);
  } else {
    render();
    advanceEnemyTurns();
  }
}