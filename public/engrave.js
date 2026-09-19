import { api, refreshResourceBar, bootstrapCache } from './api.js';
import { assetUrl } from './asset_base.js';
import { resolveUnitDef, withEquippedItem, unitName, escapeHtml, enableTrackSwipe } from './utils.js';
import {
  ENGRAVING_COMBOS, ENGRAVING_STATS, ENGRAVING_TIERS, ENGRAVING_CURRENCY,
  getEngravingCombo, getEngravingTier, engravingCost, checkEngravingForUnit, engravingValues,
} from '../data/engravings.js';

// Engraving: the items screen's left page. One unit, one combo of three stats,
// one tier, and a + / − under each stat — exactly one of them goes down.
//
//     52        20        35      what the stat BECOMES
//     HP      Armor  Initiative
//   [−][+]   [−][+]   [−][+]      − moves the cost here; the rest go up
//
// Replacing overwrites the whole triangle and costs the full price again. The
// server re-checks everything in POST /roster/engrave.

const EG = {
  title:     { en: 'Engraving',        ru: 'Гравировка' },
  hint:      { en: 'Two stats rise, one falls. Permanent — an engraving can be replaced, never removed.',
               ru: 'Два стата растут, один падает. Навсегда — гравировку можно заменить, но не убрать.' },
  pickUnit:  { en: 'Choose a unit',    ru: 'Выберите юнита' },
  current:   { en: 'Current',          ru: 'Сейчас' },
  none:      { en: 'Not engraved',     ru: 'Без гравировки' },
  combo:     { en: 'Tap to change',    ru: 'Нажмите, чтобы сменить' },
  minusHint: { en: 'Mark one stat with −', ru: 'Отметьте один стат знаком −' },
  engrave:   { en: 'Engrave',          ru: 'Выгравировать' },
  replace:   { en: 'Replace',          ru: 'Заменить' },
  working:   { en: 'Engraving…',       ru: 'Гравировка…' },
  cost:      { en: 'Cost',             ru: 'Цена' },
  short:     { en: 'Not enough Valor', ru: 'Недостаточно Доблести' },
  same:      { en: 'Already engraved this way', ru: 'Эта гравировка уже стоит' },
  failed:    { en: 'Engraving failed', ru: 'Не удалось выгравировать' },
  empty:     { en: 'No units yet.',    ru: 'Пока нет юнитов.' },
};

export function mountEngraving(host, { player, getUnits, getItems, getResources, onChanged }) {
  const L = player?.settings?.language === 'ru' ? 'ru' : 'en';
  const t = k => EG[k][L];
  const statName = key => (L === 'ru' ? ENGRAVING_STATS[key]?.name_ru : ENGRAVING_STATS[key]?.name) || key;
  const comboName = c => (L === 'ru' ? c.name_ru : c.name) || c.id;
  const tierName = tr => (L === 'ru' ? tr.name_ru : tr.name) || tr.id;

  let rosterId = null;
  let comboIdx = 0;
  let minus    = null;
  let tierId   = ENGRAVING_TIERS[0].id;
  let busy     = false;

  const units = () => getUnits() || [];
  const unitRow = () => units().find(u => String(u.id) === String(rosterId)) || null;
  const combo = () => ENGRAVING_COMBOS[comboIdx];

  const valor = () => {
    const row = (getResources() || []).find(r => r.item === ENGRAVING_CURRENCY);
    return row ? Number(row.amount) || 0 : 0;
  };

  // The unit as it is worn: definition, its own max HP, then the equipped item.
  // The engraving already on it is left off — a new one replaces it, so it is
  // paid for by the unit without it, exactly as the server checks.
  function wornUnit(row) {
    const def = resolveUnitDef(row);
    if (!def) return null;
    const item = (getItems() || []).find(it => String(it.equipped_by) === String(row.id)) || null;
    return withEquippedItem({ ...def, hp: row.unit_data?.max_hp ?? def.hp }, item);
  }

  function statOf(unit, statKey) {
    if (!unit) return null;
    const resist = statKey.match(/^(air|fire|nature|cold|life|death)_resist$/);
    if (resist) return Number(unit.resistances?.[resist[1]] ?? 0);
    if (statKey === 'hp') return Number(unit.max_hp ?? unit.hp ?? 0);
    return Number(unit[statKey] ?? 0);
  }

  function selection() {
    const c = combo();
    return c && minus ? { combo: c.id, minus, tier: tierId } : null;
  }

  // What each stat is worth at the chosen tier, before anything is picked.
  function stepFor(statKey, negative) {
    const def = ENGRAVING_STATS[statKey];
    const steps = getEngravingTier(tierId)?.steps ?? 1;
    if (!def) return 0;
    return (negative ? -def.minus : def.plus) * steps;
  }

  function problem() {
    const row = unitRow();
    if (!row) return t('pickUnit');
    const sel = selection();
    if (!sel) return t('minusHint');
    const worn = wornUnit(row);
    const invalid = worn ? checkEngravingForUnit(worn, sel) : null;
    if (invalid) return invalid;
    const now = row.engraving;
    if (now && now.combo === sel.combo && now.minus === sel.minus && now.tier === sel.tier) return t('same');
    if (valor() < engravingCost(tierId)) return t('short');
    return null;
  }

  // The same bottom slider every other screen uses: portrait cards on a track,
  // the chosen one centred when tapped.
  function trackCardsHtml() {
    const rows = units();
    if (!rows.length) return `<span class="track-empty-hint">${t('empty')}</span>`;
    return rows.map(row => {
      const def = resolveUnitDef(row);
      const id  = def?.id || '';
      const portraitId = id.match(/^(h_[a-z]_\d)/)?.[1] ?? id;
      const name = escapeHtml(unitName(def || {}, player));
      const on = String(row.id) === String(rosterId);
      return `
        <div class="portrait-card ${on ? 'portrait-card--selected' : ''} ${row.is_hero ? 'portrait-card--hero' : ''}"
             data-roster="${escapeHtml(String(row.id))}" title="${name}">
          <img class="portrait-art-img" src="${assetUrl(`/assets/character_portraits/p_${portraitId}.png`)}"
               alt="${name}" onerror="this.style.display='none'">
          ${row.engraving ? '<span class="eg-card-mark">✦</span>' : ''}
        </div>`;
    }).join('');
  }

  // Scrolls the TRACK only, never an ancestor: the items screen's three pages sit
  // in an overflow:hidden viewport that scripted scrolling can still slide.
  function centreSelected(behavior = 'smooth') {
    const track = host.querySelector('#eg-track');
    const card  = track?.querySelector('.portrait-card--selected');
    if (!card) return;
    const scroller = track.scrollWidth > track.clientWidth ? track : track.parentElement;
    if (!scroller) return;
    const c = card.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    const delta = (c.left + c.width / 2) - (s.left + s.width / 2);
    if (delta) scroller.scrollBy({ left: delta, behavior });
  }

  function currentHtml(row) {
    if (!row) return `<div class="eg-current"><span class="eg-current-label">${t('pickUnit')}</span></div>`;
    const def = resolveUnitDef(row);
    const vals = row.engraving ? engravingValues(row.engraving) : [];
    const tier = row.engraving ? getEngravingTier(row.engraving.tier) : null;
    const chips = vals.map(v =>
      `<span class="eg-chip ${v.value < 0 ? 'eg-chip--neg' : 'eg-chip--pos'}">${statName(v.stat)} ${v.value > 0 ? '+' : ''}${v.value}</span>`
    ).join('');
    return `
      <div class="eg-current">
        <span class="eg-current-name">${escapeHtml(unitName(def || {}, player))}</span>
        <span class="eg-current-label">${t('current')}:</span>
        ${tier ? `<span class="eg-chip eg-chip--tier eg-chip--${tier.id}">${tierName(tier)}</span>` : ''}
        ${chips || `<span class="eg-chip eg-chip--none">${t('none')}</span>`}
      </div>`;
  }

  // One column: what the stat becomes, its name, and the − / + that decide which
  // way it moves. Pressing − moves the cost here; pressing + on the current cost
  // clears it, so there is always at most one negative.
  function columnHtml(statKey, worn) {
    const negative = minus === statKey;
    const delta = minus ? stepFor(statKey, negative) : null;
    const base = statOf(worn, statKey);
    const total = base == null ? null : (delta == null ? base : Math.max(statKey === 'hp' ? 1 : 0, base + delta));
    const deltaLabel = delta == null ? '' :
      `<span class="eg-col-delta ${delta < 0 ? 'eg-col-delta--neg' : 'eg-col-delta--pos'}">${delta > 0 ? '+' : ''}${delta}</span>`;
    return `
      <div class="eg-col ${negative ? 'eg-col--neg' : (minus ? 'eg-col--pos' : '')}">
        <div class="eg-col-total">${total == null ? '—' : total}</div>
        ${deltaLabel}
        <div class="eg-col-stat">${statName(statKey)}</div>
        <div class="eg-col-signs">
          <button class="eg-sign ${negative ? 'eg-sign--on' : ''}" data-minus="${statKey}" type="button"
                  title="${escapeHtml(statName(statKey))} ${stepFor(statKey, true)}">−</button>
          <button class="eg-sign ${minus && !negative ? 'eg-sign--on' : ''}" data-plus="${statKey}" type="button"
                  title="${escapeHtml(statName(statKey))} +${stepFor(statKey, false)}">+</button>
        </div>
      </div>`;
  }

  function tiersHtml() {
    return ENGRAVING_TIERS.map(tr => `
      <button class="eg-tier ${tr.id === tierId ? 'eg-tier--on' : ''} eg-tier--${tr.id}" data-tier="${tr.id}" type="button">
        <span class="eg-tier-name">${tierName(tr)}</span>
        <span class="eg-tier-cost">${tr.cost}</span>
      </button>`).join('');
  }

  function render() {
    const row = unitRow();
    const worn = row ? wornUnit(row) : null;
    const c = combo();
    const why = problem();
    const label = busy ? t('working') : (row?.engraving ? t('replace') : t('engrave'));

    host.innerHTML = `
      <div class="eg-page">
        <div class="eg-panel">
          <div class="eg-title">${t('title')}</div>
          <div class="eg-hint">${t('hint')}</div>
          ${currentHtml(row)}
          <button class="eg-combo" id="eg-combo" type="button">
            <img class="eg-combo-icon" src="${assetUrl(`/assets/icons/engravings/${c.id}.png`)}" alt=""
                 onerror="this.style.display='none'">
            <span class="eg-combo-text">
              <span class="eg-combo-name">${escapeHtml(comboName(c))}</span>
              <span class="eg-combo-hint">${t('combo')}</span>
            </span>
          </button>
          <div class="eg-tiers">${tiersHtml()}</div>
          <div class="eg-cols">${c.stats.map(s => columnHtml(s, worn)).join('')}</div>
          <div class="eg-status">
            <span class="eg-cost">${t('cost')} ${engravingCost(tierId)} · ${valor()}</span>
            ${why ? `<span class="eg-why">${escapeHtml(why)}</span>` : ''}
          </div>
          <button class="eg-go" id="eg-go" type="button" ${why || busy ? 'disabled' : ''}>${label}</button>
        </div>
        <div class="prep-track-wrap eg-track-wrap">
          <div class="portrait-track" id="eg-track">${trackCardsHtml()}</div>
        </div>
      </div>`;

    enableTrackSwipe(host.querySelector('.eg-track-wrap'));
    centreSelected('auto');
  }

  async function engrave() {
    const row = unitRow();
    const sel = selection();
    if (!row || !sel || problem()) return;
    busy = true; render();
    try {
      await api('/roster/engrave', {
        chat_id: player.chat_id, roster_id: row.id, combo: sel.combo, minus: sel.minus, tier: sel.tier,
      });
      bootstrapCache.invalidate();
      if (onChanged) await onChanged();
      await refreshResourceBar(player).catch(() => {});
    } catch (err) {
      alert(err.message || t('failed'));
    }
    busy = false;
    render();
  }

  host.addEventListener('click', e => {
    if (busy) return;

    const card = e.target.closest('.portrait-card[data-roster]');
    if (card) {
      rosterId = card.dataset.roster;
      const row = unitRow();
      // Open on what the unit already carries, so replacing starts from it.
      const carried = row?.engraving && getEngravingCombo(row.engraving.combo);
      comboIdx = carried ? ENGRAVING_COMBOS.findIndex(c => c.id === carried.id) : comboIdx;
      minus = carried ? row.engraving.minus : null;
      if (carried && getEngravingTier(row.engraving.tier)) tierId = row.engraving.tier;
      render();
      centreSelected();
      return;
    }

    if (e.target.closest('#eg-combo')) {
      comboIdx = (comboIdx + 1) % ENGRAVING_COMBOS.length;
      minus = null;
      render();
      return;
    }

    const tierBtn = e.target.closest('[data-tier]');
    if (tierBtn) { tierId = tierBtn.dataset.tier; render(); return; }

    const down = e.target.closest('[data-minus]');
    if (down) { minus = down.dataset.minus; render(); return; }

    const up = e.target.closest('[data-plus]');
    if (up) {
      // + on the stat currently carrying the cost: nothing is paying for the
      // triangle any more, so the choice is cleared rather than silently moved.
      if (minus === up.dataset.plus) minus = null;
      render();
      return;
    }

    if (e.target.closest('#eg-go')) engrave();
  });

  render();
  return { refresh: render };
}
