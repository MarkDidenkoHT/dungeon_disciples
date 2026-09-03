import { CRYSTAL_ICONS, GOLD_ICON } from './utils.js';

// Bulk Resurrect / Heal, floated over the foot of the castle grid.
//
// Fixing a party after a bad fight was fifteen taps: open a slot sheet, tap
// Heal, watch the sheet re-render and reopen, back out, next slot. These do the
// whole roster in one press.
//
// PLACEMENT, and why it is an overlay: the viewport is finite. The castle grid
// is a fixed 3x4 of slots and the bottom nav is pinned below it, so there is no
// spare band between them to put a row in — a new row in the flow would push
// the grid up and steal height the screen does not have. So this is
// position: absolute inside .castle-grounds (already position: relative),
// sitting over the bottom edge of the grid and just above the nav. It takes NO
// layout height: nothing reflows, the grid keeps every pixel it had, and the
// buttons cover the lower strip of the bottom slot row only while they exist.
//
// And they are not permanent residents: they mount only when there are at least
// two casualties, so the grid is unobscured the moment the party is whole.
const RESTORE_ID = 'restore-controls';

const TEXT = {
  resurrectAll: { en: 'Resurrect all',    ru: 'Воскресить всех' },
  restoreAll:   { en: 'Resurrect + heal', ru: 'Воскресить и лечить' },
  healAll:      { en: 'Heal all',         ru: 'Вылечить всех' },
  working:      { en: 'Working…',         ru: 'Выполняется…' },
  costOf:       {
    en: (n, cost) => `${n} units — ${cost}`,
    ru: (n, cost) => `${n} юнитов — ${cost}`,
  },
};

export function hideRestoreControls() {
  document.getElementById(RESTORE_ID)?.remove();
}

// What the party needs and what it would cost, or null when there is nothing to
// offer. Exported so the caller can decide without the bar being built.
//
// AFFORDABILITY IS A VISIBILITY RULE, not an error to report. A button the
// player cannot pay for teaches nothing here — the per-unit buttons in the slot
// sheets are still there to show the price of a single fix, and the shop is one
// tap away. So a mode whose full bill exceeds the purse is simply not shown, and
// /roster/restore stays all-or-nothing behind it.
export function restorePlan({ roster, resSpell, healSpell, amountOf }) {
  const dead = [], wounded = [];
  for (const r of roster || []) {
    const d = r.unit_data || {};
    if (d.alive === false) { dead.push(r); continue; }
    const maxHp = Number(d.max_hp ?? 0);
    const curHp = Number(d.current_hp ?? maxHp);
    if (maxHp > 0 && curHp < maxHp) wounded.push(r);
  }

  // One casualty is not a bulk problem: the slot sheet's own button is one tap
  // away and already says what it costs.
  if (dead.length + wounded.length < 2) return null;

  const bill = (spell, times) => {
    const out = {};
    for (const [type, amt] of Object.entries(spell?.cost?.crystals || {})) {
      if (amt > 0 && times > 0) out[type] = amt * times;
    }
    return out;
  };
  const merge = (a, b) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v;
    return out;
  };
  const affordable = cost => Object.entries(cost).every(([k, v]) => amountOf(k) >= v);

  const modes = [];
  if (dead.length && resSpell) {
    const cost = bill(resSpell, dead.length);
    if (affordable(cost)) modes.push({ mode: 'resurrect', label: 'resurrectAll', count: dead.length, cost });

    if (healSpell) {
      // The fallen pay both spells — raised by one, brought to full by the
      // other — which is exactly what pressing the two per-unit buttons costs.
      const full = merge(cost, bill(healSpell, dead.length + wounded.length));
      if (affordable(full)) modes.push({ mode: 'resurrect_heal', label: 'restoreAll', count: dead.length + wounded.length, cost: full });
    }
  }
  // Only when nobody is down. With dead units present this would be the third
  // button in a row that has space for two, and it is the least useful of them.
  if (!dead.length && wounded.length && healSpell) {
    const cost = bill(healSpell, wounded.length);
    if (affordable(cost)) modes.push({ mode: 'heal', label: 'healAll', count: wounded.length, cost });
  }

  return modes.length ? modes : null;
}

// The same crystal art the resource strip uses, so the price on the button and
// the pile it is spending from are recognisably the same thing. A crystal is
// already an icon everywhere else in the game; spelling it "Death 24" here made
// the player translate between two vocabularies mid-decision.
function costHtml(cost) {
  return Object.entries(cost).map(([type, amt]) => {
    const icon = type === 'Gold' ? GOLD_ICON : CRYSTAL_ICONS[type];
    // Named as well as drawn: the icon carries no text, so the accessible name
    // below is where a screen reader gets the price.
    return `<span class="restore-btn-cost-item">${icon || ''}<span>${amt}</span></span>`;
  }).join('');
}

// Text, for the tooltip and the accessible name only.
function costLabel(cost) {
  return Object.entries(cost)
    .map(([type, amt]) => `${type.replace('Crystals_', '')} ${amt}`)
    .join(', ');
}

// `onRestore(mode)` does the request and the reload; this only draws.
// `host` is the castle's .castle-grounds — the overlay is positioned against it.
export function showRestoreControls(modes, { host, lang = 'en', onRestore } = {}) {
  hideRestoreControls();
  if (!host || !modes?.length) return;

  const wrap = document.createElement('div');
  wrap.id = RESTORE_ID;
  wrap.className = 'restore-controls';
  wrap.innerHTML = modes.map(m => {
    const label = TEXT[m.label][lang];
    const sub   = costLabel(m.cost);
    // The count and the price are in the accessible name, not only in the two
    // lines of text: what this button is about to spend is the whole decision.
    const aria  = `${label} — ${TEXT.costOf[lang](m.count, sub)}`;
    return `
      <button class="restore-btn" data-mode="${m.mode}"
              title="${aria}" aria-label="${aria}">
        <span class="restore-btn-label">${label}</span>
        <span class="restore-btn-cost">${costHtml(m.cost)}</span>
      </button>`;
  }).join('');

  // Its own listener: the castle's delegation is bound to the slot nodes it
  // floats over, and a press here must not read as a press on the slot beneath.
  wrap.addEventListener('click', e => {
    e.stopPropagation();
    const btn = e.target.closest('.restore-btn:not([disabled])');
    if (!btn) return;
    // Every button in the group goes down together: the modes overlap (both
    // raise the same corpses), so leaving the others live would let a second
    // press bill for work the first one is already doing.
    for (const b of wrap.querySelectorAll('.restore-btn')) b.disabled = true;
    btn.querySelector('.restore-btn-label').textContent = TEXT.working[lang];
    onRestore?.(btn.dataset.mode);
  });

  host.appendChild(wrap);
}