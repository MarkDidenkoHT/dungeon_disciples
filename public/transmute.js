import { api, refreshResourceBar, bootstrapCache } from './api.js';
import { CRYSTAL_ICONS } from './utils.js';

// Transmutation: the items screen's second page. Two DIFFERENT crystals go in,
// one of each per crystal out, into a third crystal of the player's choice:
//
//         −  [1]  +          1 — the crystal you want, and how many
//
//     [2]          [3]       2, 3 — the two crystals paid, one each per unit
//
// It takes time, like an errand: 1 hour, plus 1 minute per crystal produced.
// The server owns the job (the `transmutations` table); this page only draws it.

const CRYSTALS = ['Crystals_Life', 'Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'];
const MAX_AMOUNT = 999;

// Each crystal's colour — the beams, the rune and the slot glow are all drawn
// in the colours of the crystals actually chosen.
const COLORS = {
  Crystals_Life:   '#ffd86b',
  Crystals_Fire:   '#ff5a1f',
  Crystals_Death:  '#a45bff',
  Crystals_Frost:  '#6fd3ff',
  Crystals_Nature: '#5fdc62',
  Crystals_Air:    '#c8f4f0',
};
const NEUTRAL = '#8a93a8';

// One geometry for the SVG and the slots: a 100×80 viewBox, the same 5:4 as the
// triangle box, so a point in the drawing and a slot's % position coincide.
const POS = [{ x: 50, y: 17 }, { x: 15, y: 63 }, { x: 85, y: 63 }];
const PATH_A  = 'M15,63 Q34,46 50,17';
const PATH_B  = 'M85,63 Q66,46 50,17';
const PATH_AB = 'M15,63 Q50,76 85,63';

const TX = {
  title:     { en: 'Transmutation',            ru: 'Трансмутация' },
  hint:      { en: 'Two different crystals become one of your choice. One of each per crystal made.',
               ru: 'Два разных кристалла превращаются в третий. По одному каждого за кристалл.' },
  pick:      { en: 'Choose a crystal',         ru: 'Выберите кристалл' },
  want:      { en: 'Get',                      ru: 'Получить' },
  pay:       { en: 'Pay',                      ru: 'Отдать' },
  start:     { en: 'Transmute',                ru: 'Трансмутировать' },
  starting:  { en: 'Starting…',                ru: 'Запуск…' },
  takes:     { en: 'Takes',                    ru: 'Займёт' },
  running:   { en: 'Transmuting…',             ru: 'Идёт трансмутация…' },
  ready:     { en: 'Ready!',                   ru: 'Готово!' },
  claim:     { en: 'Collect',                  ru: 'Забрать' },
  needAll:   { en: 'Choose all three crystals', ru: 'Выберите все три кристалла' },
  short:     { en: 'Not enough crystals',      ru: 'Недостаточно кристаллов' },
  failed:    { en: 'Transmutation failed',     ru: 'Трансмутация не удалась' },
  locked:    { en: 'Build the Transmutation Lab in your castle to open this.',
               ru: 'Постройте Лабораторию трансмутации в замке, чтобы открыть это.' },
};

const nameOf = key => key.replace('Crystals_', '');

// 1 hour + 1 minute per crystal produced — 20 crystals take 1h 20m.
export function transmuteMinutes(amount) {
  return 60 + Math.max(0, Number(amount) || 0);
}

function fmtDuration(ms, L) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (L === 'ru') return h ? `${h} ч ${mm} мин` : `${m} мин ${ss} с`;
  return h ? `${h}h ${mm}m` : `${m}m ${ss}s`;
}

export function mountTransmutation(host, { player, getResources, onResourcesChanged, isUnlocked = () => true }) {
  const L = player?.settings?.language === 'ru' ? 'ru' : 'en';
  const t = k => TX[k][L];

  // slot 0 = the crystal wanted, 1 and 2 = the two paid.
  const picks = [null, null, null];
  let amount  = 1;
  let job     = null;      // { target, a, b, amount, started_at, ends_at } from the server
  let busy    = false;
  let tick    = null;
  // What each beam was last drawn between. A beam only plays its "forming"
  // animation when its ends change — not on every redraw.
  const drawn = { a: '', b: '', ab: '' };

  const have = key => {
    const row = (getResources() || []).find(r => r.item === key);
    return row ? Number(row.amount) || 0 : 0;
  };
  const maxAmount = () => (picks[1] && picks[2])
    ? Math.min(MAX_AMOUNT, have(picks[1]), have(picks[2]))
    : MAX_AMOUNT;
  const keys = () => job ? [job.target, job.a, job.b] : picks;
  const colorOf = key => (key && COLORS[key]) || NEUTRAL;

  function slotHtml(i) {
    const key = keys()[i];
    const cls = `tx-slot tx-slot--${i}${key ? ' tx-slot--filled' : ' tx-slot--empty'}`;
    const count = i === 0 || !key || job ? '' : `<span class="tx-slot-have">${have(key)}</span>`;
    return `
      <button class="${cls}" data-slot="${i}" type="button" ${job ? 'disabled' : ''}
              style="left:${POS[i].x}%;top:${POS[i].y / 0.8}%;--c:${colorOf(key)}">
        ${key ? CRYSTAL_ICONS[key] : '<span class="tx-slot-q">?</span>'}
        ${count}
        <span class="tx-slot-label">${i === 0 ? t('want') : t('pay')}</span>
      </button>`;
  }

  // A beam: a gradient core that draws itself in, a glowing dashed current
  // flowing along it, and motes of the source crystal's colour riding it.
  function beamHtml(id, d, from, to, sig, fromXY, toXY) {
    const form = drawn[id] !== sig;
    drawn[id] = sig;
    const c1 = colorOf(from), c2 = to ? colorOf(to) : '#ffffff';
    const motes = [0, 0.6, 1.2].map(delay => `
      <circle class="tx-mote" r="1.1" fill="${c1}">
        <animateMotion dur="1.8s" begin="${delay}s" repeatCount="indefinite" path="${d}" />
      </circle>`).join('');
    return `
      <linearGradient id="tx-g-${id}" gradientUnits="userSpaceOnUse"
                      x1="${fromXY.x}" y1="${fromXY.y}" x2="${toXY.x}" y2="${toXY.y}">
        <stop offset="0" stop-color="${c1}" /><stop offset="1" stop-color="${c2}" />
      </linearGradient>
      <g class="tx-beam${form ? ' tx-beam--form' : ''}">
        <path class="tx-beam-core" d="${d}" pathLength="100" stroke="url(#tx-g-${id})" />
        <path class="tx-beam-flow" d="${d}" pathLength="100" stroke="url(#tx-g-${id})" filter="url(#tx-glow)" />
        ${motes}
      </g>`;
  }

  function magicHtml() {
    const [target, a, b] = keys();
    const beams = [
      a ? beamHtml('a', PATH_A, a, target, `${a}>${target}`, POS[1], POS[0]) : (drawn.a = '', ''),
      b ? beamHtml('b', PATH_B, b, target, `${b}>${target}`, POS[2], POS[0]) : (drawn.b = '', ''),
      a && b ? beamHtml('ab', PATH_AB, a, b, `${a}+${b}`, POS[1], POS[2]) : (drawn.ab = '', ''),
    ].join('');
    const rune = target ? `
      <g class="tx-rune" transform="translate(${POS[0].x} ${POS[0].y})" style="--c:${colorOf(target)}">
        <circle class="tx-rune-outer" r="13.5" />
        <circle class="tx-rune-inner" r="11" />
        <g class="tx-rune-marks">
          ${[0, 60, 120, 180, 240, 300].map(deg =>
            `<path d="M0,-15.5 L1.2,-13.5 L0,-12.3 L-1.2,-13.5 Z" transform="rotate(${deg})" />`).join('')}
        </g>
      </g>` : '';
    return `
      <svg class="tx-magic" viewBox="0 0 100 80" aria-hidden="true">
        <defs>
          <filter id="tx-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path class="tx-guide" d="${PATH_A} M${PATH_B.slice(1)} M${PATH_AB.slice(1)}" />
        ${beams}
        ${rune}
      </svg>`;
  }

  // Everything that depends on `amount` — updated in place by +/−, so the
  // triangle and its animations are never torn down mid-flow by a tap.
  function stateBits() {
    const full = picks.every(Boolean);
    const max  = maxAmount();
    return {
      ok:    full && amount >= 1 && amount <= max && !busy,
      label: busy ? t('starting') : (!full ? t('needAll') : (amount > max ? t('short') : t('start'))),
      max,
    };
  }

  function syncAmount() {
    const s = stateBits();
    const set = (sel, fn) => { const el = host.querySelector(sel); if (el) fn(el); };
    set('#tx-amount', el => { el.textContent = amount; });
    set('#tx-takes',  el => { el.textContent = fmtDuration(transmuteMinutes(amount) * 60000, L); });
    set('#tx-minus',  el => { el.disabled = amount <= 1; });
    set('#tx-plus',   el => { el.disabled = amount >= s.max; });
    set('#tx-start',  el => { el.disabled = !s.ok; el.textContent = s.label; });
  }

  function render() {
    clearInterval(tick);
    // Gated on the Transmutation Lab. `null` = the castle has not been read
    // yet, so draw nothing rather than a lock the player may not have.
    // A job already running is still shown: it was started with a lab.
    const unlocked = isUnlocked();
    if (!job && unlocked === null) { host.innerHTML = ''; return; }
    if (!job && !unlocked) {
      host.innerHTML = `
        <div class="tx-panel tx-panel--locked">
          <div class="tx-title">${t('title')}</div>
          <div class="tx-lock">🔒</div>
          <div class="tx-hint">${t('locked')}</div>
        </div>`;
      return;
    }
    const n = job ? job.amount : amount;
    let footer;
    if (job) {
      const left = new Date(job.ends_at).getTime() - Date.now();
      footer = left > 0
        ? `<div class="tx-status">${t('running')} <span class="tx-timer" id="tx-timer">${fmtDuration(left, L)}</span></div>`
        : `<div class="tx-status tx-status--ready">${t('ready')}</div>
           <button class="tx-go" id="tx-claim" type="button" ${busy ? 'disabled' : ''}>${t('claim')} ${n} ${nameOf(job.target)}</button>`;
    } else {
      const s = stateBits();
      footer = `
        <div class="tx-status">${t('takes')} <span class="tx-timer" id="tx-takes">${fmtDuration(transmuteMinutes(amount) * 60000, L)}</span></div>
        <button class="tx-go" id="tx-start" type="button" ${s.ok ? '' : 'disabled'}>${s.label}</button>`;
    }

    const running = job && new Date(job.ends_at).getTime() > Date.now();
    host.innerHTML = `
      <div class="tx-panel">
        <div class="tx-title">${t('title')}</div>
        <div class="tx-hint">${t('hint')}</div>
        <div class="tx-triangle${running ? ' tx-triangle--running' : ''}">
          ${magicHtml()}
          <button class="tx-step tx-step--minus" id="tx-minus" type="button" ${job || amount <= 1 ? 'disabled' : ''}>−</button>
          <button class="tx-step tx-step--plus"  id="tx-plus"  type="button" ${job || amount >= maxAmount() ? 'disabled' : ''}>+</button>
          ${slotHtml(0)}
          ${slotHtml(1)}
          ${slotHtml(2)}
          <div class="tx-amount">×<span id="tx-amount">${n}</span></div>
        </div>
        ${footer}
      </div>`;

    if (job) {
      const timer = host.querySelector('#tx-timer');
      if (timer && running) {
        tick = setInterval(() => {
          const left = new Date(job.ends_at).getTime() - Date.now();
          if (left <= 0) render();
          else timer.textContent = fmtDuration(left, L);
        }, 1000);
      }
    }
  }

  // The crystal picker. A crystal already chosen in another slot is offered
  // disabled — the same crystal twice is not a transmutation.
  function openPicker(slot) {
    const others = picks.filter((k, i) => i !== slot && k);
    const menu = document.createElement('div');
    menu.className = 'tx-picker-overlay';
    menu.innerHTML = `
      <div class="tx-picker">
        <div class="tx-picker-title">${t('pick')}</div>
        <div class="tx-picker-grid">
          ${CRYSTALS.map(k => `
            <button class="tx-picker-opt" data-key="${k}" type="button" style="--c:${COLORS[k]}"
                    ${others.includes(k) ? 'disabled' : ''}>
              ${CRYSTAL_ICONS[k]}
              <span>${nameOf(k)}</span>
              ${slot === 0 ? '' : `<span class="tx-picker-have">${have(k)}</span>`}
            </button>`).join('')}
        </div>
      </div>`;
    menu.addEventListener('click', e => {
      const opt = e.target.closest('.tx-picker-opt:not([disabled])');
      if (opt) {
        picks[slot] = opt.dataset.key;
        amount = Math.max(1, Math.min(amount, maxAmount() || 1));
        render();
      }
      if (opt || e.target === menu) menu.remove();
    });
    document.body.appendChild(menu);
  }

  async function afterResourceChange() {
    if (onResourcesChanged) await onResourcesChanged();
    else bootstrapCache.invalidate();
    await refreshResourceBar(player).catch(() => {});
  }

  async function start() {
    busy = true; syncAmount();
    try {
      const res = await api('/transmute/start', {
        chat_id: player.chat_id, target: picks[0], a: picks[1], b: picks[2], amount,
      });
      job = res.job;
      await afterResourceChange();
      busy = false;
      render();
      // The moment it takes: a flare from the target along both beams.
      const tri = host.querySelector('.tx-triangle');
      tri?.classList.add('tx-triangle--burst');
      setTimeout(() => tri?.classList.remove('tx-triangle--burst'), 1400);
      return;
    } catch (err) {
      alert(err.message || t('failed'));
    }
    busy = false; render();
  }

  async function claim() {
    busy = true; render();
    try {
      await api('/transmute/claim', { chat_id: player.chat_id });
      job = null;
      await afterResourceChange();
    } catch (err) {
      alert(err.message || t('failed'));
    }
    busy = false; render();
  }

  // +/−: a tap steps by one; holding repeats by five. `held` records whether
  // the hold ever fired, so the click that ends a hold does not add one more.
  let hold = null, held = false;
  const stopHold = () => { clearTimeout(hold); clearInterval(hold); hold = null; };
  const step = dir => {
    const next = Math.max(1, Math.min(maxAmount(), amount + dir));
    if (next === amount) return false;
    amount = next;
    syncAmount();
    return true;
  };

  host.addEventListener('pointerdown', e => {
    const btn = e.target.closest('#tx-plus, #tx-minus');
    if (!btn || btn.disabled) return;
    const dir = btn.id === 'tx-plus' ? 1 : -1;
    held = false;
    stopHold();
    hold = setTimeout(() => {
      hold = setInterval(() => { held = true; if (!step(dir * 5)) stopHold(); }, 90);
    }, 400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => host.addEventListener(ev, stopHold));

  host.addEventListener('click', e => {
    if (busy) return;
    const stepBtn = e.target.closest('#tx-plus, #tx-minus');
    if (stepBtn) {
      if (!held) step(stepBtn.id === 'tx-plus' ? 1 : -1);
      held = false;
      return;
    }
    const slot = e.target.closest('.tx-slot:not([disabled])');
    if (slot) { openPicker(Number(slot.dataset.slot)); return; }
    if (e.target.closest('#tx-start')) { start(); return; }
    if (e.target.closest('#tx-claim')) { claim(); }
  });

  render();
  api(`/transmute?chat_id=${player.chat_id}`)
    .then(res => { job = res?.job || null; render(); })
    .catch(() => {});

  return { refresh: render };
}
