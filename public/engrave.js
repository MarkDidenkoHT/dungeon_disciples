import { api, refreshResourceBar, bootstrapCache } from './api.js';
import { assetUrl } from './asset_base.js';
import { resolveUnitDef, withEquippedItem, unitName, escapeHtml, enableTrackSwipe } from './utils.js';
import {
  ENGRAVING_COMBOS, ENGRAVING_STATS, ENGRAVING_COST, ENGRAVING_CURRENCY,
  getEngravingCombo, checkEngravingForUnit, engravingValues,
} from '../data/engravings.js';

// Engraving: the items screen's left page. One unit, one combo of three stats,
// and the player marks which one goes DOWN — the other two go up.
//
//              [combo]          tap the middle to change the three stats
//        [+]           [+]      tap a corner to make it the negative
//              [-]
//
// Replacing overwrites the whole triangle and costs the full price again. The
// server re-checks everything in POST /roster/engrave.

const POS = [{ x: 50, y: 20 }, { x: 16, y: 66 }, { x: 84, y: 66 }];

const EG = {
  title:     { en: 'Engraving',        ru: 'Гравировка' },
  hint:      { en: 'Two stats rise, one falls. Permanent — an engraving can be replaced, never removed.',
               ru: 'Два стата растут, один падает. Навсегда — гравировку можно заменить, но не убрать.' },
  pickUnit:  { en: 'Choose a unit',    ru: 'Выберите юнита' },
  current:   { en: 'Current',          ru: 'Сейчас' },
  none:      { en: 'Not engraved',     ru: 'Без гравировки' },
  combo:     { en: 'Tap to change',    ru: 'Нажмите, чтобы сменить' },
  minusHint: { en: 'Tap a stat to make it the cost', ru: 'Нажмите на стат, чтобы он стал ценой' },
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

  let rosterId = null;
  let comboIdx = 0;
  let minus    = null;
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

  function selection() {
    const c = combo();
    return c && minus ? { combo: c.id, minus } : null;
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
    if (now && now.combo === sel.combo && now.minus === sel.minus) return t('same');
    if (valor() < ENGRAVING_COST) return t('short');
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
    if (!row) return '';
    const def = resolveUnitDef(row);
    const vals = row.engraving ? engravingValues(row.engraving) : [];
    const chips = vals.map(v =>
      `<span class="eg-chip ${v.value < 0 ? 'eg-chip--neg' : 'eg-chip--pos'}">${statName(v.stat)} ${v.value > 0 ? '+' : ''}${v.value}</span>`
    ).join('');
    return `
      <div class="eg-current">
        <span class="eg-current-name">${escapeHtml(unitName(def || {}, player))}</span>
        <span class="eg-current-label">${t('current')}:</span>
        ${chips || `<span class="eg-chip eg-chip--none">${t('none')}</span>`}
      </div>`;
  }

  function cornerHtml(statKey, i) {
    const def = ENGRAVING_STATS[statKey];
    if (!def) return '';
    const negative = minus === statKey;
    const value = negative ? -def.minus : def.plus;
    return `
      <button class="eg-slot ${negative ? 'eg-slot--neg' : 'eg-slot--pos'}" data-stat="${statKey}" type="button"
              style="left:${POS[i].x}%;top:${POS[i].y}%;">
        <span class="eg-slot-stat">${statName(statKey)}</span>
        <span class="eg-slot-value">${value > 0 ? '+' : ''}${value}</span>
      </button>`;
  }

  function render() {
    const row = unitRow();
    const c = combo();
    const why = problem();
    const label = busy ? t('working') : (row?.engraving ? t('replace') : t('engrave'));

    host.innerHTML = `
      <div class="eg-page">
        <div class="eg-panel">
        <div class="eg-title">${t('title')}</div>
        <div class="eg-hint">${t('hint')}</div>
        ${currentHtml(row)}
        <div class="eg-triangle">
          <button class="eg-combo" id="eg-combo" type="button">
            <span class="eg-combo-name">${escapeHtml(comboName(c))}</span>
            <span class="eg-combo-hint">${t('combo')}</span>
          </button>
          ${c.stats.map((s, i) => cornerHtml(s, i)).join('')}
        </div>
        <div class="eg-status">
          <span class="eg-cost">${t('cost')} ${ENGRAVING_COST} · ${valor()}</span>
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
      await api('/roster/engrave', { chat_id: player.chat_id, roster_id: row.id, combo: sel.combo, minus: sel.minus });
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
    const unitBtn = e.target.closest('.portrait-card[data-roster]');
    if (unitBtn) {
      rosterId = unitBtn.dataset.roster;
      const row = unitRow();
      // Open on what the unit already carries, so replacing starts from it.
      const carried = row?.engraving && getEngravingCombo(row.engraving.combo);
      comboIdx = carried ? ENGRAVING_COMBOS.findIndex(c => c.id === carried.id) : comboIdx;
      minus = carried ? row.engraving.minus : null;
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
    const slot = e.target.closest('.eg-slot');
    if (slot) { minus = slot.dataset.stat; render(); return; }
    if (e.target.closest('#eg-go')) engrave();
  });

  render();
  return { refresh: render };
}
