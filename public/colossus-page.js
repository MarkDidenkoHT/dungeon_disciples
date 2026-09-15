import { api, bootstrapCache } from './api.js';
import { assetUrl } from './asset_base.js';
import { CRYSTAL_ICONS, GOLD_ICON } from './utils.js';
import { COLOSSUS_PHASES, COLOSSUS_CURRENCY, colossusBaseDef } from '../data/colossus.js';

// The Faction Colossus page: the left page of embark. All three factions' boss
// bars (each opens into that faction's stats and top hitters), the player's week,
// and who is resting today. Everything comes from one GET /colossus, which also
// pays out any kill reward the player is owed.

const CT = {
  you:         { en: 'You',               ru: 'Вы' },
  phase:       { en: n => `Phase ${n}`,   ru: n => `Фаза ${n}` },
  hp:          { en: (hp, max) => `${hp} / ${max} HP`, ru: (hp, max) => `${hp} / ${max} HP` },
  attack:      { en: 'Attack',            ru: 'В бой' },
  slain:       { en: (place, when) => `Slain ${place} · ${when}`, ru: (place, when) => `Повержен ${place} · ${when}` },
  place:       { en: ['first', 'second', 'third'], ru: ['первым', 'вторым', 'третьим'] },
  yourDamage:  { en: 'Your damage',       ru: 'Ваш урон' },
  attempts:    { en: 'Attempts this week', ru: 'Попыток за неделю' },
  rank:        { en: 'Your rank',         ru: 'Ваше место' },
  nextMilestone: { en: n => `Next milestone: ${n}`, ru: n => `Следующий рубеж: ${n}` },
  allMilestones: { en: 'All milestones reached this week', ru: 'Все рубежи этой недели пройдены' },
  resting:     { en: n => `Resting until tomorrow (${n})`, ru: n => `Отдыхают до завтра (${n})` },
  restingNone: { en: 'No units resting. The hero leads every attempt and never rests.',
                 ru: 'Никто не отдыхает. Герой ведёт каждую попытку и не устаёт.' },
  statHp:           { en: 'Boss HP',        ru: 'HP босса' },
  statPhase:        { en: 'Phase',          ru: 'Фаза' },
  statContributors: { en: 'Fighters',       ru: 'Бойцов' },
  statAttempts:     { en: 'Attempts',       ru: 'Попыток' },
  top:         { en: 'Top contributors', ru: 'Лучшие бойцы' },
  noHits:      { en: 'Nobody has struck this Colossus yet this week.', ru: 'На этой неделе по этому Колоссу ещё никто не бил.' },
  unknownName: { en: 'Unnamed',           ru: 'Без имени' },
  killReward:  { en: 'Your faction’s Colossus fell. Kill reward added:', ru: 'Колосс вашей фракции пал. Награда за победу:' },
  loadFailed:  { en: 'Could not load the Colossus.', ru: 'Не удалось загрузить Колосса.' },
  retry:       { en: 'Retry',             ru: 'Повторить' },
  resets:      { en: 'Resets in',         ru: 'Сброс через' },
  cardAlive:   { en: (pct, phase) => `${pct}% HP · Phase ${phase}`, ru: (pct, phase) => `${pct}% HP · Фаза ${phase}` },
  cardSlain:   { en: 'Slain this week',   ru: 'Повержен на этой неделе' },
};

const FACTIONS = {
  empire:              { en: 'Empire',              ru: 'Империя',       crest: 'empire' },
  choir_of_the_cursed: { en: 'Choir of the Cursed', ru: 'Хор Проклятых', crest: 'choir' },
  grail_of_sorrow:     { en: 'Grail of Sorrow',     ru: 'Грааль Скорби', crest: 'grail' },
};

const FACTION_CRYSTAL = {
  empire: 'Crystals_Life', choir_of_the_cursed: 'Crystals_Fire', grail_of_sorrow: 'Crystals_Death',
};

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function loadColossus(player) {
  return api(`/colossus?chat_id=${encodeURIComponent(player.chat_id)}`);
}

// One line for the Colossus card on the regions page.
export function colossusCardStatus(state, L) {
  const mine = state?.bosses?.[0];
  if (!mine) return '';
  if (mine.killed_at) return CT.cardSlain[L];
  return CT.cardAlive[L](Math.ceil((mine.hp / mine.max_hp) * 100), mine.phase);
}

function timeLeft(ms, L) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  const u = L === 'ru' ? { d: 'д', h: 'ч', m: 'м' } : { d: 'd', h: 'h', m: 'm' };
  return d > 0 ? `${d}${u.d} ${h}${u.h}` : `${h}${u.h} ${m}${u.m}`;
}

function grantIcon(item) {
  if (item === 'Gold') return GOLD_ICON;
  return CRYSTAL_ICONS[item] || (item === COLOSSUS_CURRENCY ? '⚜' : '💎');
}

function grantChips(grants) {
  return (grants || []).map(g =>
    `<span class="colossus-chip" title="${esc(g.item)}">${grantIcon(g.item)} +${g.amount}</span>`).join('');
}

function phaseName(id, L) {
  const p = COLOSSUS_PHASES.find(x => x.id === id);
  return p ? (L === 'ru' ? p.name_ru : p.name) : '';
}

function topListHtml(boss, L) {
  if (!boss.top?.length) return `<div class="colossus-muted">${CT.noHits[L]}</div>`;
  return boss.top.map(t => `
    <div class="colossus-top${t.me ? ' colossus-top--me' : ''}">
      <span>${t.rank}. ${t.me ? CT.you[L] : esc(t.name || CT.unknownName[L])}</span>
      <span>${t.damage}</span>
    </div>`).join('');
}

function bossCardHtml(boss, { mine, open, L }) {
  const pct     = boss.max_hp ? Math.max(0, Math.min(100, (boss.hp / boss.max_hp) * 100)) : 0;
  const faction = FACTIONS[boss.faction];
  const label   = faction?.[L] || boss.faction;
  const slain   = !!boss.killed_at;
  const when    = slain
    ? new Date(boss.killed_at).toLocaleString(L === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : '';
  const status = slain
    ? `<span class="colossus-boss-slain">♛ ${CT.slain[L](CT.place[L][(boss.kill_rank || 1) - 1] || '', when)}</span>`
    : `<span class="colossus-boss-phase">${CT.phase[L](boss.phase)}</span>`;
  const crest = faction
    ? `<img class="colossus-crest" src="${assetUrl(`/assets/crests/${faction.crest}.jpg`)}" alt="" onerror="this.style.visibility='hidden'">`
    : '';

  return `
    <div class="colossus-boss${mine ? ' colossus-boss--mine' : ''}${slain ? ' colossus-boss--slain' : ''}${open ? ' colossus-boss--open' : ''}"
         data-faction="${esc(boss.faction)}">
      <button class="colossus-boss-head" type="button" aria-expanded="${open}">
        ${crest}
        <div class="colossus-boss-main">
          <div class="colossus-boss-top">
            <span class="colossus-boss-name">${esc(label)}${mine ? ` <span class="colossus-you">${CT.you[L]}</span>` : ''}</span>
            ${status}
          </div>
          <div class="colossus-bar">
            <div class="colossus-bar-fill" style="width:${pct}%"></div>
            <i style="left:25%"></i><i style="left:50%"></i><i style="left:75%"></i>
          </div>
        </div>
        <span class="colossus-chev" aria-hidden="true">›</span>
      </button>
      ${mine && !slain ? `
        <div class="colossus-boss-bottom">
          <span class="colossus-muted">${CT.hp[L](boss.hp, boss.max_hp)}</span>
          <button class="colossus-attack" type="button">${CT.attack[L]}</button>
        </div>` : ''}
      <div class="colossus-boss-detail">
        <div class="colossus-detail-stats">
          <span>${CT.statHp[L]}: <b>${boss.hp} / ${boss.max_hp}</b></span>
          <span>${CT.statPhase[L]}: <b>${slain ? '—' : esc(phaseName(boss.phase, L))}</b></span>
          <span>${CT.statContributors[L]}: <b>${boss.contributors ?? 0}</b></span>
          <span>${CT.statAttempts[L]}: <b>${boss.attempts ?? 0}</b></span>
        </div>
        <div class="colossus-muted">${CT.top[L]}</div>
        ${topListHtml(boss, L)}
      </div>
    </div>`;
}

function portraitUrl(unitId) {
  const id = String(unitId || '').match(/^(h_[a-z]_\d)/)?.[1] ?? unitId;
  return assetUrl(`/assets/character_portraits/p_${id}.png`);
}

export async function renderColossusPage(host, state, { player, L, onAttack }) {
  if (!host) return;
  const mine  = state.bosses?.[0];
  const phase = COLOSSUS_PHASES.find(p => p.id === mine?.phase);
  const def   = colossusBaseDef();
  const me    = state.me || {};

  let restingRows = [];
  try {
    const boot = await bootstrapCache.get(player.chat_id);
    const byId = new Map((boot?.roster || []).map(u => [String(u.id), u]));
    restingRows = (state.resting_roster_ids || []).map(id => byId.get(String(id))).filter(Boolean);
  } catch { /* the page still renders without portraits */ }

  const milestone = me.next_milestone;
  const milestonePct = milestone ? Math.min(100, Math.floor((me.damage / milestone.damage) * 100)) : 100;
  const milestoneGrants = milestone
    ? Object.entries(milestone.rewards).map(([item, amount]) => ({
        item: item === 'faction_crystal' ? FACTION_CRYSTAL[state.faction] : item,
        amount,
      }))
    : [];

  host.innerHTML = `
    <div class="colossus-page-inner">
      ${state.kill_rewards?.length ? `
        <div class="colossus-notice">
          ${CT.killReward[L]}
          <div class="colossus-chips">${state.kill_rewards.map(k => grantChips(k.grants)).join('')}</div>
        </div>` : ''}

      <div class="colossus-hero" style="background-image:url('${assetUrl('/assets/embark/colossus.jpg')}')">
        <span class="colossus-timer" title="${CT.resets[L]}">⏱ ${timeLeft(state.week.resets_at - Date.now(), L)}</span>
        <div class="colossus-hero-text">
          <span class="colossus-hero-name">${esc((L === 'ru' ? def?.name_ru : def?.name) || def?.name || '')}</span>
          ${phase && !mine?.killed_at ? `<span class="colossus-hero-phase">${esc(L === 'ru' ? phase.name_ru : phase.name)} — ${esc(L === 'ru' ? phase.description_ru : phase.description)}</span>` : ''}
        </div>
      </div>

      ${(state.bosses || []).map((b, i) => bossCardHtml(b, { mine: i === 0, open: i === 0, L })).join('')}

      <div class="colossus-stats">
        <div class="colossus-stat"><span>${CT.yourDamage[L]}</span><b>${me.damage ?? 0}</b></div>
        <div class="colossus-stat"><span>${CT.attempts[L]}</span><b>${me.attempts ?? 0}</b></div>
        <div class="colossus-stat"><span>${CT.rank[L]}</span><b>${me.rank ? `#${me.rank}` : '—'}</b></div>
      </div>

      <div class="colossus-section">
        <div class="colossus-row">
          <span class="colossus-muted">${milestone ? CT.nextMilestone[L](milestone.damage) : CT.allMilestones[L]}</span>
          <span class="colossus-chips">${grantChips(milestoneGrants)}</span>
        </div>
        <div class="colossus-bar colossus-bar--thin"><div class="colossus-bar-fill colossus-bar-fill--mine" style="width:${milestonePct}%"></div></div>
      </div>

      <div class="colossus-section">
        <div class="colossus-muted">${restingRows.length ? CT.resting[L](restingRows.length) : CT.restingNone[L]}</div>
        ${restingRows.length ? `<div class="colossus-resting">${restingRows.map(u =>
          `<img src="${portraitUrl(u.unit_data?.unit_id)}" alt="" onerror="this.style.visibility='hidden'">`).join('')}</div>` : ''}
      </div>
    </div>`;

  // One faction open at a time. Tapping the open one closes it.
  const cards = [...host.querySelectorAll('.colossus-boss')];
  for (const card of cards) {
    card.querySelector('.colossus-boss-head')?.addEventListener('click', () => {
      const opening = !card.classList.contains('colossus-boss--open');
      for (const other of cards) {
        const open = other === card && opening;
        other.classList.toggle('colossus-boss--open', open);
        other.querySelector('.colossus-boss-head')?.setAttribute('aria-expanded', String(open));
      }
    });
  }

  host.querySelector('.colossus-attack')?.addEventListener('click', () => onAttack?.());
}

export function renderColossusError(host, { L, onRetry }) {
  if (!host) return;
  host.innerHTML = `
    <div class="colossus-page-inner colossus-page-error">
      <div class="colossus-muted">${CT.loadFailed[L]}</div>
      <button class="colossus-attack" type="button">${CT.retry[L]}</button>
    </div>`;
  host.querySelector('.colossus-attack')?.addEventListener('click', () => onRetry?.());
}
