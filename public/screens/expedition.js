// ── Expedition map ──────────────────────────────────────────────────────────
// The run across an expedition region's map (docs/embark-expedition-design.md).
// Everything here is drawn from GET /expedition/active; the server owns the map,
// the fog and every rule, and this screen only ever asks it to move, fight or
// leave. Art is deliberately absent for now: cells are plain tiles with glyphs.
//
// Arrives two ways: from embark / battle-prep / a won room (shows the open run),
// or with `summary` — a run that just ended — to show what it paid.

import { api, navigate, bootstrapCache } from '../api.js';
import { assetUrl } from '../asset_base.js';
import { lang } from './settings.js';
import { REGIONS as REGION_CARDS } from './embark.js';
import { UNITS } from '../../data/units.js';
import { CRYSTAL_ICONS, GOLD_ICON, resolveUnitDef, unitName, gameConfirm, gameAlert } from '../utils.js';
import { showTutorialSpotlight, hideTutorial, isTutorialDone, markTutorialDone } from '../tutorial.js';

const T = {
  title:        { en: 'Expedition',              ru: 'Поход' },
  level:        { en: 'Level',                   ru: 'Уровень' },
  haul:         { en: 'Haul',                    ru: 'Добыча' },
  haulEmpty:    { en: 'Nothing yet',             ru: 'Пока пусто' },
  squad:        { en: 'Squad',                   ru: 'Отряд' },
  fallen:       { en: 'Fallen',                  ru: 'Пал' },
  steps:        { en: 'Steps',                   ru: 'Шаги' },
  tapToMove:    { en: 'Tap a lit cell — up, down, left or right — to move.', ru: 'Коснитесь подсвеченной клетки — вверх, вниз, влево или вправо, — чтобы идти.' },
  fightTitle:   { en: 'Enemies ahead',           ru: 'Впереди враги' },
  goalTitle:    { en: 'The goal of this expedition', ru: 'Цель похода' },
  fight:        { en: 'Fight',                   ru: 'В бой' },
  exitHere:     { en: 'Leave through the exit',  ru: 'Выйти через выход' },
  exitNote:     { en: 'Keeps the whole haul. No goal reward.', ru: 'Вся добыча сохраняется. Без награды за цель.' },
  abandon:      { en: 'Abandon expedition',      ru: 'Бросить поход' },
  abandonAsk:   { en: 'Leave here, without an exit? You keep half the haul and every unit drops to 1 HP.', ru: 'Уйти отсюда без выхода? Вы сохраните половину добычи, а все бойцы останутся с 1 HP.' },
  abandonYes:   { en: 'Abandon',                 ru: 'Бросить' },
  abandonNo:    { en: 'Stay',                    ru: 'Остаться' },
  none:         { en: 'No expedition in progress.', ru: 'Нет активного похода.' },
  toEmbark:     { en: 'Back to Embark',          ru: 'К походам' },
  outcome: {
    goal:      { en: 'Expedition complete',      ru: 'Поход завершён' },
    exit:      { en: 'You left through the exit', ru: 'Вы вышли через выход' },
    abandoned: { en: 'Expedition abandoned',     ru: 'Поход брошен' },
    wiped:     { en: 'The expedition is lost',   ru: 'Поход провален' },
  },
  outcomeNote: {
    goal:      { en: 'The haul and the level reward are yours.', ru: 'Добыча и награда уровня — ваши.' },
    exit:      { en: 'The whole haul came home.', ru: 'Вся добыча доставлена домой.' },
    abandoned: { en: 'Half the haul came home, and the squad is at 1 HP.', ru: 'Домой вернулась половина добычи, а отряд — с 1 HP.' },
    wiped:     { en: 'Nothing was brought back.', ru: 'Ничего не удалось вынести.' },
  },
  unlocked:     { en: n => `Level ${n} unlocked`, ru: n => `Открыт уровень ${n}` },
  xpEach:       { en: 'XP each',                 ru: 'опыта каждому' },
  conflict:     { en: 'The expedition changed elsewhere — refreshed.', ru: 'Поход изменился на другом устройстве — обновлено.' },
  failed:       { en: 'Something went wrong. Try again.', ru: 'Что-то пошло не так. Попробуйте ещё раз.' },
};

// Placeholder glyphs until cells have art.
const GLYPH = { entrance: '⌂', goal: '♛', exit: '⇲', fight: '⚔', empty: '' };
const TYPE_LABEL = {
  entrance: { en: 'Entrance', ru: 'Вход' },
  goal:     { en: 'Goal',     ru: 'Цель' },
  exit:     { en: 'Exit',     ru: 'Выход' },
  fight:    { en: 'Fight',    ru: 'Бой' },
  empty:    { en: 'Empty',    ru: 'Пусто' },
};

const keyOf = c => `${c.x},${c.y}`;

function portraitUrl(def) {
  const id = def?.id;
  if (!id) return null;
  const portraitId = id.match(/^(h_[a-z]_\d)/)?.[1] ?? id;
  return assetUrl(`/assets/character_portraits/p_${portraitId}.png`);
}

function enemyDef(key) {
  const [region, slug] = String(key || '').split('.');
  return UNITS.enemies?.[region]?.[slug] || null;
}

export function renderExpedition(root, { player, summary = null } = {}) {
  const L = lang(player);
  const t = entry => (typeof entry === 'function' ? entry : entry?.[L] ?? entry?.en ?? '');

  let run = null;         // the client view from the server
  let busy = false;
  let destroyed = false;

  root.innerHTML = `<div class="screen screen-expedition"><div class="expd" id="expd"></div></div>`;
  const host = () => root.querySelector('#expd');
  // Footer and fallback-fight buttons, delegated once for the screen's life.
  host().addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'fight') onFight();
    else if (act === 'exit') onLeave(true);
    else if (act === 'abandon') onLeave(false);
  });

  function regionLabel(id) {
    const r = REGION_CARDS.find(x => x.id === id);
    return r ? ((L === 'ru' && r.label_ru) || r.label) : id;
  }

  function chips({ gold = 0, xp = 0, crystals = {}, trophies = {} } = {}, { xpLabel = '' } = {}) {
    const chip = (icon, amt, title = '') =>
      `<span class="expd-chip"${title ? ` title="${title}"` : ''}><span class="expd-chip-icon">${icon}</span>${amt}</span>`;
    const out = [
      gold > 0 ? chip(GOLD_ICON, gold) : '',
      ...Object.entries(crystals).filter(([, a]) => a > 0).map(([k, a]) => chip(CRYSTAL_ICONS[k] || '💎', a, k.replace(/^Crystals_/, ''))),
      ...Object.entries(trophies).filter(([, a]) => a > 0).map(([id, a]) =>
        chip(`<img class="expd-chip-img" src="${assetUrl(`/assets/icons/recources/${id}.png`)}" alt="">`, a, id.replace(/_/g, ' '))),
      xp > 0 ? chip('⭐', `${xp}${xpLabel ? ` ${xpLabel}` : ''}`) : '',
    ].join('');
    return out || `<span class="expd-muted">${t(T.haulEmpty)}</span>`;
  }

  // ── The grid ──
  function gridHtml() {
    const walls = new Set(run.walls || []);
    const moves = new Set((run.moves || []).map(keyOf));
    const size = run.size;
    const wallOn = (a, b) => {
      const ka = keyOf(a), kb = keyOf(b);
      return walls.has(ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`);
    };
    const cells = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = run.cells.find(cc => cc.x === x && cc.y === y) || { x, y, known: false };
        const here = run.pos.x === x && run.pos.y === y;
        const canMove = moves.has(keyOf(c));
        const cls = ['expd-cell'];
        cls.push(c.known ? `expd-cell--${c.type}` : 'expd-cell--unknown');
        if (c.visited) cls.push('expd-cell--visited');
        if (c.cleared) cls.push('expd-cell--cleared');
        if (here) cls.push('expd-cell--here');
        if (canMove) cls.push('expd-cell--move');
        if (x < size - 1 && wallOn(c, { x: x + 1, y })) cls.push('expd-wall-r');
        if (y < size - 1 && wallOn(c, { x, y: y + 1 })) cls.push('expd-wall-b');
        if (x > 0 && wallOn(c, { x: x - 1, y })) cls.push('expd-wall-l');
        if (y > 0 && wallOn(c, { x, y: y - 1 })) cls.push('expd-wall-t');
        const glyph = c.known ? (c.cleared && c.type === 'fight' ? '✓' : GLYPH[c.type] ?? '') : '?';
        const label = c.known ? t(TYPE_LABEL[c.type] || {}) : '';
        cells.push(`
          <button class="${cls.join(' ')}" type="button" data-x="${x}" data-y="${y}"
                  ${canMove ? '' : 'tabindex="-1"'} aria-label="${label || '?'}">
            <span class="expd-cell-glyph">${glyph}</span>
            ${here ? '<span class="expd-cell-you" aria-hidden="true"></span>' : ''}
          </button>`);
      }
    }
    return `<div class="expd-grid expd-grid--${size}" style="--expd-size:${size}">${cells.join('')}</div>`;
  }

  // Only shown when a step into a fight room could not open the battle (a
  // dropped connection, the app closed between the two). Normally a fight
  // starts the moment the player walks in.
  function pendingHtml() {
    const p = run.pending;
    if (!p) return '';
    const enemies = (p.enemies || []).map(e => {
      const def = enemyDef(e.key);
      const name = def ? ((L === 'ru' && def.name_ru) || def.name || e.key) : e.key;
      return `
        <div class="expd-enemy">
          <span class="expd-enemy-name">${name}</span>
          <span class="expd-enemy-meta">${def?.t ? `T${def.t}` : ''}${def?.hp ? ` · ${def.hp} HP` : ''}</span>
        </div>`;
    }).join('');
    return `
      <div class="expd-pending">
        <div class="expd-pending-title">${p.goal ? t(T.goalTitle) : t(T.fightTitle)}</div>
        <div class="expd-enemies">${enemies}</div>
        <div class="expd-actions">
          <button class="action-btn" type="button" data-act="fight">${t(T.fight)}</button>
        </div>
      </div>`;
  }

  function footerHtml() {
    return `
      ${run.at_exit ? `
        <button class="action-btn expd-exit-btn" type="button" data-act="exit">${t(T.exitHere)}</button>
        <div class="expd-muted">${t(T.exitNote)}</div>` : ''}
      <button class="expd-abandon" type="button" data-act="abandon">${t(T.abandon)}</button>`;
  }

  // ── Drawing ──
  // The frame (header, squad, board, footer) is built once per run and then
  // only the parts that changed are rewritten, so a step does not reload the
  // squad's portraits or flash the header.
  let mountedRunId = null;
  const last = {};

  function setHtml(sel, html, key = html) {
    if (last[sel] === key) return;
    last[sel] = key;
    const el = root.querySelector(sel);
    if (el) el.innerHTML = html;
  }

  function mountFrame() {
    host().innerHTML = `
      <header class="expd-head">
        <div class="expd-title" id="expd-title"></div>
        <div class="expd-haul"><span class="expd-label">${t(T.haul)}</span><span id="expd-haul-chips"></span></div>
      </header>
      <div class="expd-squad" id="expd-squad"></div>
      <div class="expd-board" id="expd-board"></div>
      <p class="expd-hint" id="expd-hint"></p>
      <div id="expd-pending"></div>
      <div class="expd-footer" id="expd-footer"></div>`;
    for (const k of Object.keys(last)) delete last[k];
    squadEls = null;
    mountedRunId = run.id;

    // One listener per area, for the life of the frame.
    root.querySelector('#expd-board').addEventListener('click', e => {
      const cell = e.target.closest('.expd-cell');
      if (cell) onCell(Number(cell.dataset.x), Number(cell.dataset.y));
    });
  }

  function draw() {
    if (destroyed) return;
    if (!run) {
      mountedRunId = null;
      host().innerHTML = `
        <div class="expd-empty">
          <p>${t(T.none)}</p>
          <button class="action-btn" id="expd-back" type="button">${t(T.toEmbark)}</button>
        </div>`;
      host().querySelector('#expd-back').addEventListener('click', () => navigate('embark', { player }));
      return;
    }
    if (mountedRunId !== run.id || !root.querySelector('#expd-board')) mountFrame();

    setHtml('#expd-title', `${regionLabel(run.region_id)} · ${t(T.level)} ${run.level}`);
    setHtml('#expd-haul-chips', chips(run.bank), JSON.stringify(run.bank));
    setHtml('#expd-board', gridHtml());
    setHtml('#expd-hint', run.pending ? '' : t(T.tapToMove));
    setHtml('#expd-pending', pendingHtml());
    setHtml('#expd-footer', footerHtml());

    runTutorial();
  }

  // ── Squad strip ── portraits are created once; later updates only touch the
  // HP bar, the number and the fallen state. HP comes from /bootstrap, which is
  // invalidated after every fight.
  let squadEls = null;
  async function refreshSquad() {
    if (!run) return;
    const boot = await bootstrapCache.get(player.chat_id).catch(() => null);
    const strip = root.querySelector('#expd-squad');
    if (!strip || !run) return;
    const roster = boot?.roster || [];
    const fallen = new Set(run.squad?.fallen || []);
    const ids = (run.squad?.roster_ids || []).map(String);
    if (!squadEls || squadEls.ids.join(',') !== ids.join(',')) {
      strip.innerHTML = ids.map(id => {
        const row = roster.find(r => String(r.id) === id);
        if (!row) return '';
        const img = portraitUrl(resolveUnitDef(row));
        return `
          <div class="expd-unit" data-unit="${id}" title="${unitName(row, player)}">
            ${img ? `<img class="expd-unit-img" src="${img}" alt="" onerror="this.style.visibility='hidden'">` : '<span class="expd-unit-img"></span>'}
            <div class="expd-unit-hp"><span></span></div>
            <div class="expd-unit-num"></div>
          </div>`;
      }).join('');
      squadEls = { ids };
    }
    for (const id of ids) {
      const el = strip.querySelector(`[data-unit="${id}"]`);
      const row = roster.find(r => String(r.id) === id);
      if (!el || !row) continue;
      const def = resolveUnitDef(row);
      const max = Number(row.unit_data?.max_hp ?? def?.hp ?? 1) || 1;
      const dead = fallen.has(id);
      const cur = dead ? 0 : Math.max(0, Number(row.unit_data?.current_hp ?? max));
      el.classList.toggle('expd-unit--fallen', dead);
      el.querySelector('.expd-unit-hp > span').style.width = `${Math.round((cur / max) * 100)}%`;
      el.querySelector('.expd-unit-num').textContent = dead ? t(T.fallen) : `${cur}/${max}`;
    }
  }

  function drawSummary(s) {
    mountedRunId = null;
    const outcome = s?.outcome || 'abandoned';
    const p = s?.payout || null;
    const crystals = p?.crystals_gained || {};
    host().innerHTML = `
      <div class="expd-summary expd-summary--${outcome}">
        <div class="expd-summary-title">${t(T.outcome[outcome] || T.outcome.abandoned)}</div>
        <p class="expd-summary-note">${t(T.outcomeNote[outcome] || T.outcomeNote.abandoned)}</p>
        ${p ? `<div class="expd-summary-chips">${chips({ gold: p.gold, crystals, trophies: p.trophies_gained || {}, xp: p.xp_granted }, { xpLabel: t(T.xpEach) })}</div>` : ''}
        ${p?.progress_unlocked ? `<div class="reward-unlock">${t(T.unlocked)(p.next_level)}</div>` : ''}
        <button class="action-btn" id="expd-back" type="button">${t(T.toEmbark)}</button>
      </div>`;
    host().querySelector('#expd-back').addEventListener('click', () => navigate('embark', { player }));
  }

  // ── Actions ──
  async function guarded(fn) {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (err) {
      if (err?.code === 'expedition_conflict' || err?.code === 'expedition_none') {
        await load();
        if (err.code === 'expedition_conflict') gameAlert(t(T.conflict));
      } else if (err?.code === 'battle_in_progress') {
        // A fight of this run is already open: reconnecting is the embark
        // screen's job, which has the reconnect modal.
        navigate('embark', { player });
      } else {
        console.error('[expedition]', err);
        gameAlert(t(T.failed));
      }
    } finally {
      busy = false;
    }
  }

  const newBattleId = () => `${player.chat_id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  function enterBattle(battle) {
    hideTutorial();
    navigate('battle', {
      player, battle_id: battle.battle_id, region_id: run.region_id, level: run.level,
      snapshot: battle.state, selectedSpells: [], logs: battle.logs || [],
    });
  }

  // A step. Walking into a fight room starts its battle in the same request.
  function onCell(x, y) {
    if (!run || !(run.moves || []).some(m => m.x === x && m.y === y)) return;
    return guarded(async () => {
      const r = await api('/expedition/move', { chat_id: player.chat_id, run_id: run.id, x, y, battle_id: newBattleId() });
      run = r.run;
      if (r.battle) { enterBattle(r.battle); return; }
      draw();
    });
  }

  function onFight() {
    return guarded(async () => {
      const battle_id = newBattleId();
      const r = await api('/expedition/fight', { chat_id: player.chat_id, run_id: run.id, battle_id });
      run = r.run || run;
      enterBattle({ battle_id, state: r.state, logs: r.logs });
    });
  }

  async function onLeave(throughExit) {
    if (!throughExit && !await gameConfirm(t(T.abandonAsk), { ok: t(T.abandonYes), cancel: t(T.abandonNo) })) return;
    return guarded(async () => {
      const r = await api('/expedition/leave', { chat_id: player.chat_id, run_id: run.id });
      bootstrapCache.invalidate();
      run = null;
      drawSummary(r);
    });
  }

  // ── First-run teaching (3x3 maps only) ──
  // A short explain-and-continue chain over the board the first time.
  function runTutorial() {
    if (!run || run.size !== 3 || isTutorialDone(player, 'expedition_map')) return;
    showTutorialSpotlight(player, 'expedition_map', root.querySelector('#expd-board'), {
      showContinue: true,
      onAdvance: () => {
        markTutorialDone(player, 'expedition_map');
        showTutorialSpotlight(player, 'expedition_move', root.querySelector('#expd-board'), {
          showContinue: true,
          onAdvance: () => {
            markTutorialDone(player, 'expedition_move');
            showTutorialSpotlight(player, 'expedition_haul', root.querySelector('#expd-footer'), {
              showContinue: true,
              onAdvance: () => markTutorialDone(player, 'expedition_haul'),
            });
          },
        });
      },
    });
  }

  async function load() {
    try {
      const r = await api(`/expedition/active?chat_id=${encodeURIComponent(player.chat_id)}`);
      run = r.run || null;
    } catch (err) {
      console.error('[expedition] load failed', err);
      run = null;
    }
    draw();
    refreshSquad();
  }

  function show(params = {}) {
    if (params.summary) {
      run = null;
      drawSummary(params.summary);
      return;
    }
    // HP changed in the fight the player is coming back from; load() redraws
    // only what changed and refreshes the squad strip.
    bootstrapCache.invalidate();
    load();
  }

  if (!summary) host().innerHTML = '<div class="expd-loading"></div>';
  show({ summary });

  return {
    acceptsParams: true,
    onShow: (next = {}) => show(next),
    onHide: () => hideTutorial(),
    destroy: () => { destroyed = true; hideTutorial(); },
  };
}
