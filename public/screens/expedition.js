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
  fightBody:    { en: 'Fight now, or step back the way you came. Damage carries over to the next room.', ru: 'Сражайтесь или отступите туда, откуда пришли. Урон сохраняется до следующей комнаты.' },
  fight:        { en: 'Fight',                   ru: 'В бой' },
  stepBack:     { en: 'Step back',               ru: 'Отступить' },
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
    dev_ended: { en: 'Expedition ended (dev)',   ru: 'Поход завершён (dev)' },
  },
  outcomeNote: {
    goal:      { en: 'The haul and the level reward are yours.', ru: 'Добыча и награда уровня — ваши.' },
    exit:      { en: 'The whole haul came home.', ru: 'Вся добыча доставлена домой.' },
    abandoned: { en: 'Half the haul came home, and the squad is at 1 HP.', ru: 'Домой вернулась половина добычи, а отряд — с 1 HP.' },
    wiped:     { en: 'Nothing was brought back.', ru: 'Ничего не удалось вынести.' },
    dev_ended: { en: 'Nothing was paid.',          ru: 'Ничего не выплачено.' },
  },
  unlocked:     { en: n => `Level ${n} unlocked`, ru: n => `Открыт уровень ${n}` },
  xpEach:       { en: 'XP each',                 ru: 'опыта каждому' },
  conflict:     { en: 'The expedition changed elsewhere — refreshed.', ru: 'Поход изменился на другом устройстве — обновлено.' },
  failed:       { en: 'Something went wrong. Try again.', ru: 'Что-то пошло не так. Попробуйте ещё раз.' },
  dev:          { en: 'Dev', ru: 'Dev' },
  devReveal:    { en: 'Reveal map', ru: 'Открыть карту' },
  devTeleport:  { en: 'Teleport', ru: 'Телепорт' },
  devEnd:       { en: 'End run', ru: 'Завершить' },
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
  let teleportMode = false;
  let destroyed = false;

  root.innerHTML = `<div class="screen screen-expedition"><div class="expd" id="expd"></div></div>`;
  const host = () => root.querySelector('#expd');

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

  // ── Squad strip ── HP from /bootstrap, which is invalidated after every fight.
  async function squadHtml() {
    const boot = await bootstrapCache.get(player.chat_id).catch(() => null);
    const roster = boot?.roster || [];
    const fallen = new Set(run.squad?.fallen || []);
    return (run.squad?.roster_ids || []).map(id => {
      const row = roster.find(r => String(r.id) === String(id));
      if (!row) return '';
      const def = resolveUnitDef(row);
      const max = Number(row.unit_data?.max_hp ?? def?.hp ?? 1) || 1;
      const cur = fallen.has(String(id)) ? 0 : Math.max(0, Number(row.unit_data?.current_hp ?? max));
      const pct = Math.round((cur / max) * 100);
      const img = portraitUrl(def);
      return `
        <div class="expd-unit${fallen.has(String(id)) ? ' expd-unit--fallen' : ''}" title="${unitName(row, player)}">
          ${img ? `<img class="expd-unit-img" src="${img}" alt="" onerror="this.style.visibility='hidden'">` : '<span class="expd-unit-img"></span>'}
          <div class="expd-unit-hp"><span style="width:${pct}%"></span></div>
          <div class="expd-unit-num">${fallen.has(String(id)) ? t(T.fallen) : `${cur}/${max}`}</div>
        </div>`;
    }).join('');
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
        if (teleportMode) cls.push('expd-cell--teleport');
        if (x < size - 1 && wallOn(c, { x: x + 1, y })) cls.push('expd-wall-r');
        if (y < size - 1 && wallOn(c, { x, y: y + 1 })) cls.push('expd-wall-b');
        if (x > 0 && wallOn(c, { x: x - 1, y })) cls.push('expd-wall-l');
        if (y > 0 && wallOn(c, { x, y: y - 1 })) cls.push('expd-wall-t');
        const glyph = c.known ? (c.cleared && c.type === 'fight' ? '✓' : GLYPH[c.type] ?? '') : '?';
        const label = c.known ? t(TYPE_LABEL[c.type] || {}) : '';
        cells.push(`
          <button class="${cls.join(' ')}" type="button" data-x="${x}" data-y="${y}"
                  ${canMove || teleportMode ? '' : 'tabindex="-1"'} aria-label="${label || '?'}">
            <span class="expd-cell-glyph">${glyph}</span>
            ${here ? '<span class="expd-cell-you" aria-hidden="true"></span>' : ''}
          </button>`);
      }
    }
    return `<div class="expd-grid expd-grid--${size}" style="--expd-size:${size}">${cells.join('')}</div>`;
  }

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
      <div class="expd-pending" id="expd-pending">
        <div class="expd-pending-title">${p.goal ? t(T.goalTitle) : t(T.fightTitle)}</div>
        <div class="expd-enemies">${enemies}</div>
        <div class="expd-pending-body">${t(T.fightBody)}</div>
        <div class="expd-actions">
          <button class="action-btn action-btn--cancel" id="expd-step-back" type="button" ${run.prev ? '' : 'disabled'}>${t(T.stepBack)}</button>
          <button class="action-btn" id="expd-fight" type="button">${t(T.fight)}</button>
        </div>
      </div>`;
  }

  function devHtml() {
    if (!run.dev) return '';
    return `
      <div class="expd-dev">
        <span class="expd-dev-tag">${t(T.dev)} · seed ${run.seed ?? '?'}</span>
        <button type="button" data-dev="reveal">${t(T.devReveal)}</button>
        <button type="button" data-dev="teleport" class="${teleportMode ? 'is-on' : ''}">${t(T.devTeleport)}</button>
        <button type="button" data-dev="end">${t(T.devEnd)}</button>
      </div>`;
  }

  async function draw() {
    if (destroyed) return;
    if (!run) {
      host().innerHTML = `
        <div class="expd-empty">
          <p>${t(T.none)}</p>
          <button class="action-btn" id="expd-back" type="button">${t(T.toEmbark)}</button>
        </div>`;
      host().querySelector('#expd-back').addEventListener('click', () => navigate('embark', { player }));
      return;
    }
    host().innerHTML = `
      <header class="expd-head">
        <div class="expd-title">${regionLabel(run.region_id)} · ${t(T.level)} ${run.level}</div>
        <div class="expd-haul"><span class="expd-label">${t(T.haul)}</span>${chips(run.bank)}</div>
      </header>
      <div class="expd-squad" id="expd-squad"></div>
      <div class="expd-board" id="expd-board">${gridHtml()}</div>
      <p class="expd-hint">${run.pending ? '' : t(T.tapToMove)}</p>
      ${pendingHtml()}
      <div class="expd-footer" id="expd-footer">
        ${run.at_exit ? `
          <button class="action-btn expd-exit-btn" id="expd-exit" type="button">${t(T.exitHere)}</button>
          <div class="expd-muted">${t(T.exitNote)}</div>` : ''}
        <button class="expd-abandon" id="expd-abandon" type="button">${t(T.abandon)}</button>
      </div>
      ${devHtml()}`;

    squadHtml().then(html => {
      const el = root.querySelector('#expd-squad');
      if (el) el.innerHTML = html;
    });

    host().querySelectorAll('.expd-cell').forEach(btn => {
      btn.addEventListener('click', () => onCell(Number(btn.dataset.x), Number(btn.dataset.y)));
    });
    host().querySelector('#expd-fight')?.addEventListener('click', onFight);
    host().querySelector('#expd-step-back')?.addEventListener('click', () => run.prev && onCell(run.prev.x, run.prev.y));
    host().querySelector('#expd-exit')?.addEventListener('click', () => onLeave(true));
    host().querySelector('#expd-abandon')?.addEventListener('click', () => onLeave(false));
    host().querySelectorAll('[data-dev]').forEach(b => b.addEventListener('click', () => onDev(b.dataset.dev)));

    runTutorial();
  }

  function drawSummary(s) {
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

  function onCell(x, y) {
    if (teleportMode) {
      teleportMode = false;
      return guarded(async () => {
        const r = await api('/expedition/dev', { chat_id: player.chat_id, run_id: run.id, action: 'teleport', x, y });
        run = r.run;
        draw();
      });
    }
    if (!(run.moves || []).some(m => m.x === x && m.y === y)) return;
    return guarded(async () => {
      const r = await api('/expedition/move', { chat_id: player.chat_id, run_id: run.id, x, y });
      run = r.run;
      draw();
      if (run.pending) root.querySelector('#expd-pending')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  function onFight() {
    return guarded(async () => {
      const battle_id = `${player.chat_id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const r = await api('/expedition/fight', { chat_id: player.chat_id, run_id: run.id, battle_id });
      hideTutorial();
      navigate('battle', {
        player, battle_id, region_id: run.region_id, level: run.level,
        snapshot: r.state, selectedSpells: [], logs: r.logs || [],
      });
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

  function onDev(action) {
    if (action === 'teleport') {
      teleportMode = !teleportMode;
      draw();
      return;
    }
    return guarded(async () => {
      const r = await api('/expedition/dev', { chat_id: player.chat_id, run_id: run.id, action });
      if (r.ended) {
        bootstrapCache.invalidate();
        run = null;
        drawSummary(r);
        return;
      }
      run = r.run;
      draw();
    });
  }

  // ── First-run teaching (3x3 maps only) ──
  // A short chain over the board the first time, and the fight panel the first
  // time a fight is pending. Each step is explain-and-continue.
  function runTutorial() {
    if (!run || run.size !== 3) return;
    const board = root.querySelector('#expd-board');
    if (!isTutorialDone(player, 'expedition_map')) {
      showTutorialSpotlight(player, 'expedition_map', board, {
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
      return;
    }
    if (run.pending && !isTutorialDone(player, 'expedition_fight')) {
      const panel = root.querySelector('#expd-pending');
      if (panel) {
        showTutorialSpotlight(player, 'expedition_fight', panel, {
          showContinue: true,
          onAdvance: () => markTutorialDone(player, 'expedition_fight'),
        });
      }
    }
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
  }

  function show(params = {}) {
    teleportMode = false;
    if (params.summary) {
      run = null;
      drawSummary(params.summary);
      return;
    }
    // HP changed in the fight the player is coming back from.
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
