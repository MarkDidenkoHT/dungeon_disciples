import { api, refreshResourceBar, bootstrapCache, navigate } from './api.js';
import { assetUrl } from './asset_base.js';
import { resolveUnitDef, withEquippedItem, unitName, escapeHtml, enableTrackSwipe } from './utils.js';
import {
  ENGRAVING_COMBOS, ENGRAVING_STATS, ENGRAVING_TIERS, ENGRAVING_CURRENCY,
  getEngravingCombo, getEngravingTier, engravingCost, engravingStep, engravingPoints,
  checkEngravingForUnit, engravingValues,
} from '../data/engravings.js';

// Engraving: the items screen's left page. One unit, one combo of three stats,
// one tier, and a + / − under each stat.
//
//     52        20        35      what the stat BECOMES
//     HP      Armor  Initiative
//   [−][+]   [−][+]   [−][+]      each + must be paid by a − elsewhere
//
// A tier hands out points. Every + spends one, every − pays one back, and the
// two have to match before anything can be engraved. Tapping a sign past the
// last point wraps that stat back to zero, which is how a choice is undone.
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
  pointsHint:{ en: 'Spend the points: every + needs a − elsewhere',
               ru: 'Потратьте очки: каждый + требует − на другом стате' },
  points:    { en: 'Points',           ru: 'Очки' },
  reset:     { en: 'Reset',            ru: 'Сброс' },
  engrave:   { en: 'Engrave',          ru: 'Выгравировать' },
  replace:   { en: 'Replace',          ru: 'Заменить' },
  working:   { en: 'Engraving…',       ru: 'Гравировка…' },
  cost:      { en: 'Cost',             ru: 'Цена' },
  short:     { en: 'Not enough Valor', ru: 'Недостаточно Доблести' },
  same:      { en: 'Already engraved this way', ru: 'Эта гравировка уже стоит' },
  failed:    { en: 'Engraving failed', ru: 'Не удалось выгравировать' },
  empty:     { en: 'No units yet.',    ru: 'Пока нет юнитов.' },
  locked:    { en: 'Raise the Blacksmith to level 2 to open Engraving.',
               ru: 'Поднимите Кузницу до 2 уровня, чтобы открыть Гравировку.' },
  build:     { en: 'Upgrade the Blacksmith', ru: 'Улучшить Кузницу' },
};

export function mountEngraving(host, { player, getUnits, getItems, getResources, onChanged, isUnlocked = () => true }) {
  const L = player?.settings?.language === 'ru' ? 'ru' : 'en';
  const t = k => EG[k][L];
  const statName = key => (L === 'ru' ? ENGRAVING_STATS[key]?.name_ru : ENGRAVING_STATS[key]?.name) || key;
  const comboName = c => (L === 'ru' ? c.name_ru : c.name) || c.id;
  const tierName = tr => (L === 'ru' ? tr.name_ru : tr.name) || tr.id;

  let rosterId = null;
  let comboIdx = 0;
  let plus     = {};
  let minus    = {};
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

  const tier = () => getEngravingTier(tierId);
  const spent = () => engravingPoints(plus);
  const paid  = () => engravingPoints(minus);

  function selection() {
    const c = combo();
    if (!c) return null;
    return { combo: c.id, tier: tierId, plus: { ...plus }, minus: { ...minus } };
  }

  // A sign is taken when points remain and the stat is not already moving the
  // other way; otherwise the tap wraps that stat back to nothing.
  function tapSign(statKey, negative) {
    const mine  = negative ? minus : plus;
    const other = negative ? plus  : minus;
    const room  = (tier()?.steps ?? 1) - engravingPoints(mine);
    if (other[statKey] || room <= 0) { delete mine[statKey]; return; }
    mine[statKey] = (mine[statKey] || 0) + 1;
  }

  function clearPicks() { plus = {}; minus = {}; }

  function problem() {
    const row = unitRow();
    if (!row) return t('pickUnit');
    const sel = selection();
    if (!sel) return t('pickUnit');
    if (!spent() && !paid()) return t('pointsHint');
    const worn = wornUnit(row);
    const invalid = worn ? checkEngravingForUnit(worn, sel) : null;
    if (invalid) return invalid;
    const now = row.engraving;
    if (now && JSON.stringify(now) === JSON.stringify(sel)) return t('same');
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
    const tierDef = row.engraving ? getEngravingTier(row.engraving.tier) : null;
    const chips = vals.map(v =>
      `<span class="eg-chip ${v.value < 0 ? 'eg-chip--neg' : 'eg-chip--pos'}">${statName(v.stat)} ${v.value > 0 ? '+' : ''}${v.value}</span>`
    ).join('');
    return `
      <div class="eg-current">
        <span class="eg-current-name">${escapeHtml(unitName(def || {}, player))}</span>
        <span class="eg-current-label">${t('current')}:</span>
        ${tierDef ? `<span class="eg-chip eg-chip--tier eg-chip--${tierDef.id}">${tierName(tierDef)}</span>` : ''}
        ${chips || `<span class="eg-chip eg-chip--none">${t('none')}</span>`}
      </div>`;
  }

  // One column: what the stat becomes, its name, and the − / + that move it.
  // Each sign shows how many points this stat is carrying.
  function columnHtml(statKey, worn) {
    const up = plus[statKey] || 0;
    const down = minus[statKey] || 0;
    const delta = up ? engravingStep(statKey, false) * up
                : down ? engravingStep(statKey, true) * down
                : 0;
    const base = statOf(worn, statKey);
    const total = base == null ? null : Math.max(statKey === 'hp' ? 1 : 0, base + delta);
    return `
      <div class="eg-col ${down ? 'eg-col--neg' : (up ? 'eg-col--pos' : '')}">
        <div class="eg-col-total">${total == null ? '—' : total}</div>
        <div class="eg-col-delta ${delta < 0 ? 'eg-col-delta--neg' : 'eg-col-delta--pos'}">
          ${delta ? `${delta > 0 ? '+' : ''}${delta}` : '&nbsp;'}
        </div>
        <div class="eg-col-stat">${statName(statKey)}</div>
        <div class="eg-col-signs">
          <button class="eg-sign ${down ? 'eg-sign--on' : ''}" data-minus="${statKey}" type="button"
                  title="${escapeHtml(statName(statKey))} ${engravingStep(statKey, true)} / point">
            <span class="eg-sign-mark">−</span>${down ? `<span class="eg-sign-pts">${down}</span>` : ''}
          </button>
          <button class="eg-sign ${up ? 'eg-sign--on' : ''}" data-plus="${statKey}" type="button"
                  title="${escapeHtml(statName(statKey))} +${engravingStep(statKey, false)} / point">
            <span class="eg-sign-mark">+</span>${up ? `<span class="eg-sign-pts">${up}</span>` : ''}
          </button>
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
    // `null` = the castle has not been read yet, so draw nothing rather than a
    // lock the player may not have.
    const unlocked = isUnlocked();
    if (unlocked === null) { host.innerHTML = ''; return; }
    if (!unlocked) {
      host.innerHTML = `
        <div class="eg-page">
          <div class="eg-panel eg-panel--locked">
            <div class="eg-title">${t('title')}</div>
            <div class="eg-hint">${t('locked')}</div>
            <button class="eg-go" id="eg-build" type="button">${t('build')}</button>
          </div>
        </div>`;
      host.querySelector('#eg-build').addEventListener('click', () =>
        navigate('castle', { player, focusBuilding: 'blacksmith' }));
      return;
    }

    const row = unitRow();
    const worn = row ? wornUnit(row) : null;
    const c = combo();
    const steps = tier()?.steps ?? 1;
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
          <div class="eg-points">
            <span class="eg-points-count ${spent() === steps && paid() === steps ? 'eg-points-count--done' : ''}">
              ${t('points')} +${spent()}/${steps} · −${paid()}/${steps}
            </span>
            ${spent() || paid() ? `<button class="eg-reset" id="eg-reset" type="button">${t('reset')}</button>` : ''}
          </div>
          <div class="eg-status">
            <span class="eg-cost">${t('cost')} ${engravingCost(tierId)} ⚔</span>
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
        chat_id: player.chat_id, roster_id: row.id,
        combo: sel.combo, tier: sel.tier, plus: sel.plus, minus: sel.minus,
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
      clearPicks();
      if (carried) {
        plus  = { ...(row.engraving.plus  || {}) };
        minus = { ...(row.engraving.minus || {}) };
        if (getEngravingTier(row.engraving.tier)) tierId = row.engraving.tier;
      }
      render();
      centreSelected();
      return;
    }

    if (e.target.closest('#eg-combo')) {
      comboIdx = (comboIdx + 1) % ENGRAVING_COMBOS.length;
      clearPicks();
      render();
      return;
    }

    // A tier is a different number of points, so whatever was spent under the
    // old one no longer balances.
    const tierBtn = e.target.closest('[data-tier]');
    if (tierBtn) { tierId = tierBtn.dataset.tier; clearPicks(); render(); return; }

    if (e.target.closest('#eg-reset')) { clearPicks(); render(); return; }

    const down = e.target.closest('[data-minus]');
    if (down) { tapSign(down.dataset.minus, true); render(); return; }

    const up = e.target.closest('[data-plus]');
    if (up) { tapSign(up.dataset.plus, false); render(); return; }

    if (e.target.closest('#eg-go')) engrave();
  });

  render();
  return { refresh: render };
}
