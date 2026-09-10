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
// The server owns the job (players.transmutation); this page only draws it.

const CRYSTALS = ['Crystals_Life', 'Crystals_Fire', 'Crystals_Death', 'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air'];
const MAX_AMOUNT = 999;

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
};

const nameOf = key => key.replace('Crystals_', '');

// 1 hour + 1 minute per crystal produced — 20 crystals take 1h 20m.
export function transmuteMinutes(amount) {
  return 60 + Math.max(0, Number(amount) || 0);
}

function fmtDuration(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}

export function mountTransmutation(host, { player, getResources, onResourcesChanged }) {
  const L = player?.settings?.language === 'ru' ? 'ru' : 'en';
  const t = k => TX[k][L];

  // slot 0 = the crystal wanted, 1 and 2 = the two paid.
  const picks = [null, null, null];
  let amount  = 1;
  let job     = null;      // { target, a, b, amount, started_at, ends_at } from the server
  let busy    = false;
  let tick    = null;

  const have = key => {
    const row = (getResources() || []).find(r => r.item === key);
    return row ? Number(row.amount) || 0 : 0;
  };
  const maxAmount = () => (picks[1] && picks[2])
    ? Math.min(MAX_AMOUNT, have(picks[1]), have(picks[2]))
    : MAX_AMOUNT;

  function slotHtml(i) {
    const key = job ? [job.target, job.a, job.b][i] : picks[i];
    const cls = `tx-slot tx-slot--${i}${key ? '' : ' tx-slot--empty'}`;
    const count = i === 0 ? '' : (key && !job ? `<span class="tx-slot-have">${have(key)}</span>` : '');
    return `
      <button class="${cls}" data-slot="${i}" type="button" ${job ? 'disabled' : ''}>
        ${key ? CRYSTAL_ICONS[key] : '<span class="tx-slot-q">?</span>'}
        ${count}
        <span class="tx-slot-label">${i === 0 ? t('want') : t('pay')}${key ? ` · ${nameOf(key)}` : ''}</span>
      </button>`;
  }

  function render() {
    clearInterval(tick);
    const n = job ? job.amount : amount;
    let footer;
    if (job) {
      const left = new Date(job.ends_at).getTime() - Date.now();
      footer = left > 0
        ? `<div class="tx-status">${t('running')} <span class="tx-timer" id="tx-timer">${fmtDuration(left)}</span></div>`
        : `<div class="tx-status tx-status--ready">${t('ready')}</div>
           <button class="tx-go" id="tx-claim" type="button" ${busy ? 'disabled' : ''}>${t('claim')} ${n} ${nameOf(job.target)}</button>`;
    } else {
      const full = picks.every(Boolean);
      const ok   = full && amount >= 1 && amount <= maxAmount();
      footer = `
        <div class="tx-status">${t('takes')} ${fmtDuration(transmuteMinutes(amount) * 60000)}</div>
        <button class="tx-go" id="tx-start" type="button" ${ok && !busy ? '' : 'disabled'}>
          ${busy ? t('starting') : (!full ? t('needAll') : (amount > maxAmount() ? t('short') : t('start')))}
        </button>`;
    }

    host.innerHTML = `
      <div class="tx-panel">
        <div class="tx-title">${t('title')}</div>
        <div class="tx-hint">${t('hint')}</div>
        <div class="tx-triangle">
          <div class="tx-top">
            <button class="tx-step" id="tx-minus" type="button" ${job || amount <= 1 ? 'disabled' : ''}>−</button>
            ${slotHtml(0)}
            <button class="tx-step" id="tx-plus" type="button" ${job || amount >= maxAmount() ? 'disabled' : ''}>+</button>
          </div>
          <div class="tx-amount">×<span id="tx-amount">${n}</span></div>
          <svg class="tx-lines" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
            <polygon points="50,2 4,58 96,58" />
          </svg>
          <div class="tx-bottom">
            ${slotHtml(1)}
            ${slotHtml(2)}
          </div>
        </div>
        ${footer}
      </div>`;

    if (job) {
      const timer = host.querySelector('#tx-timer');
      if (timer) {
        tick = setInterval(() => {
          const left = new Date(job.ends_at).getTime() - Date.now();
          if (left <= 0) render();
          else timer.textContent = fmtDuration(left);
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
            <button class="tx-picker-opt" data-key="${k}" type="button" ${others.includes(k) ? 'disabled' : ''}>
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
    busy = true; render();
    try {
      const res = await api('/transmute/start', {
        chat_id: player.chat_id, target: picks[0], a: picks[1], b: picks[2], amount,
      });
      job = res.job;
      await afterResourceChange();
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

  host.addEventListener('click', e => {
    if (busy) return;
    const slot = e.target.closest('.tx-slot:not([disabled])');
    if (slot) { openPicker(Number(slot.dataset.slot)); return; }
    if (e.target.closest('#tx-minus')) { amount = Math.max(1, amount - 1); render(); return; }
    if (e.target.closest('#tx-plus'))  { amount = Math.min(maxAmount(), amount + 1); render(); return; }
    if (e.target.closest('#tx-start')) { start(); return; }
    if (e.target.closest('#tx-claim')) { claim(); }
  });

  // Holding +/− repeats, so 200 crystals is not 200 taps.
  let hold = null;
  const stopHold = () => { clearTimeout(hold); clearInterval(hold); hold = null; };
  host.addEventListener('pointerdown', e => {
    const btn = e.target.closest('#tx-plus, #tx-minus');
    if (!btn || btn.disabled) return;
    const dir = btn.id === 'tx-plus' ? 1 : -1;
    hold = setTimeout(() => {
      hold = setInterval(() => {
        const next = Math.max(1, Math.min(maxAmount(), amount + dir * 5));
        if (next === amount) return stopHold();
        amount = next;
        const out = host.querySelector('#tx-amount');
        if (out) out.textContent = amount;
      }, 90);
    }, 400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
    host.addEventListener(ev, () => { if (hold) { stopHold(); render(); } }));

  render();
  api(`/transmute?chat_id=${player.chat_id}`)
    .then(res => { job = res?.job || null; render(); })
    .catch(() => {});

  return { refresh: render };
}
