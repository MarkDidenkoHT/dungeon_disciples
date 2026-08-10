import { api, bootstrapCache, refreshResourceBar } from './api.js';
import { openSheet, getSheetBody, resolveUnitDef, cap, resolveAbility, abilityName } from './utils.js';
import { ERRANDS_BY_ID } from '../data/errands.js';

// ── Errands ─────────────────────────────────────────────────────────────────
// The daily draw. One non-hero unit goes out and is unavailable until it comes
// back; errands cannot fail, so this sheet never has to explain odds or risk.
//
// COMPLETION IS NOT OURS. The Supabase edge functions finish the errand, apply
// what it granted and notify the player through the bot. Everything here is
// offer -> send -> show what came back.
const ET = {
  title:       { en: 'Errands',                ru: 'Поручения' },
  none:        { en: 'Nothing today',          ru: 'Сегодня ничего' },
  noneDesc:    { en: 'No errand is waiting. Come back tomorrow — or free up a unit, if the one you sent is still away.',
                 ru: 'Поручений нет. Возвращайтесь завтра — или дождитесь того, кого уже отправили.' },
  requires:    { en: 'Requires',               ru: 'Требуется' },
  reward:      { en: 'Reward',                 ru: 'Награда' },
  sendWho:     { en: 'Who goes?',              ru: 'Кого отправить?' },
  send:        { en: 'Send',                   ru: 'Отправить' },
  sending:     { en: 'Sending…',               ru: 'Отправляем…' },
  away:        { en: 'Away',                   ru: 'В пути' },
  returns:     { en: 'Returns in',             ru: 'Вернётся через' },
  backHome:    { en: 'Home again',             ru: 'Вернулся домой' },
  gained:      { en: 'Brought home',           ru: 'Принесено' },
  gotIt:       { en: 'Good',                   ru: 'Отлично' },
  xpSelf:      { en: 'XP',                     ru: 'Опыт' },
  xpRoster:    { en: 'XP shared at home',      ru: 'Опыт на всех оставшихся' },
  healed:      { en: 'HP restored',            ru: 'Восстановлено HP' },
  hours:       { en: 'h',                      ru: 'ч' },
  howLong:     { en: 'How long?',               ru: 'Насколько?' },
  orAny:       { en: 'or',                     ru: 'или' },
  failed:      { en: 'Something went wrong.',  ru: 'Что-то пошло не так.' },
};

let lang = 'en';
const T = k => ET[k][lang];

function untilText(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const mins  = Math.ceil(ms / 60000);
  const hours = Math.floor(mins / 60);
  return hours > 0 ? `${hours}${T('hours')} ${mins % 60}m` : `${mins}m`;
}

// A requirement is a list of ~15 acceptable passives, which as text was a wall
// of words nobody read. As icons it is the same row the player already scans on
// a unit card, so "do I have one of these?" is answered by matching pictures.
// The name stays on the tooltip; the rank rides the corner the way it does in
// the unit sheet.
function passiveIcon(p) {
  const base = String(p.passive);
  const def  = resolveAbility(p.rank > 1 ? `${base} ${p.rank}` : base) || resolveAbility(base);
  const name = abilityName(def) || cap(base.replace(/_/g, ' '));
  const label = p.rank > 1 ? `${name} ${p.rank}` : name;
  return `
    <span class="errand-req-icon" title="${label}">
      <img src="/assets/icons/abilities/${base}.jpg" alt="${label}"
           onerror="this.replaceWith(document.createTextNode('${label.replace(/'/g, '')}'))">
      ${p.rank > 1 ? `<span class="errand-req-rank">${p.rank}</span>` : ''}
    </span>`;
}

function requirementHtml(req = {}) {
  const bits = [];
  if (req.passive_any?.length) {
    // No "or" between them — a row of icons already reads as a set of options,
    // and fifteen separators put the wall of text straight back.
    bits.push(`<div class="errand-req-icons">${req.passive_any.map(passiveIcon).join('')}</div>`);
  }
  if (req.action_any?.length) {
    bits.push(`<span class="errand-req-chip">${req.action_any.map(a => cap(a.replace(/_/g, ' '))).join(` ${T('orAny')} `)}</span>`);
  }
  for (const [stat, val] of Object.entries(req.stat || {})) {
    bits.push(`<span class="errand-req-chip">${cap(stat.replace(/_/g, ' '))} ${val}+</span>`);
  }
  return bits.join('');
}

function rewardHtml(reward = {}) {
  const bits = [];
  if (reward.xp_self)   bits.push(`<span class="errand-reward-chip">+${reward.xp_self} ${T('xpSelf')}</span>`);
  if (reward.xp_roster) bits.push(`<span class="errand-reward-chip">+${reward.xp_roster} ${T('xpRoster')}</span>`);
  if (reward.heal_pct)  bits.push(`<span class="errand-reward-chip">${reward.heal_pct}% ${T('healed')}</span>`);
  if (reward.healed)    bits.push(`<span class="errand-reward-chip">+${reward.healed} HP</span>`);
  for (const [item, amount] of Object.entries(reward.resources || {})) {
    bits.push(`<span class="errand-reward-chip">+${amount} ${item.replace('Crystals_', '')}</span>`);
  }
  return bits.join('');
}

function unitCardHtml(row, selected) {
  const def  = resolveUnitDef(row);
  const name = def?.name ?? row.unit_data?.unit_id ?? '';
  const id   = def?.id ?? '';
  const portraitId = String(id).match(/^(h_[a-z]_\d)/)?.[1] ?? id;
  return `
    <div class="portrait-card portrait-card--errand ${selected ? 'portrait-card--selected' : ''}"
         data-roster-id="${row.id}" title="${name}">
      <img class="portrait-art-img" src="/assets/character_portraits/p_${portraitId}.png"
           alt="${name}" onerror="this.style.display='none'">
      <div class="portrait-name">${name}</div>
    </div>`;
}

export async function openErrandsSheet(player) {
  lang = player?.settings?.language === 'ru' ? 'ru' : 'en';
  openSheet(T('title'), `<p class="modal-empty">…</p>`);

  let state  = null;
  let chosen = null;
  // The trip length the player picked. Defaults to the shortest — the cheapest
  // commitment is the safe default when the unit may be wanted for an embark.
  let chosenHours = null;

  async function load() {
    state  = await api(`/errands?chat_id=${player.chat_id}`);
    chosen = state.offer?.candidates?.[0] ?? null;   // Send is one tap
    chosenHours = state.offer?.durations?.[0]?.hours ?? state.offer?.hours ?? null;
    render();
  }

  function render() {
    const body = getSheetBody();
    if (!body) return;

    // 1. Something finished. The bot already said so; this is the payoff screen.
    const done = state?.finished?.[0];
    if (done) {
      const def = ERRANDS_BY_ID[done.errand_id];
      // `granted` is whatever the edge function actually awarded; fall back to
      // the reward that was promised at start if it wrote nothing.
      const shown = done.granted || done.reward || {};
      body.innerHTML = `
        <div class="errand-sheet">
          <div class="errand-title">${T('backHome')}</div>
          <p class="errand-desc">${done.unit_name ? `<strong>${done.unit_name}</strong> — ` : ''}${def?.title?.[lang] ?? done.errand_id}</p>
          <div class="errand-section-label">${T('gained')}</div>
          <div class="errand-chips">${rewardHtml(shown)}</div>
          <button class="errand-btn" id="errand-ack">${T('gotIt')}</button>
        </div>`;
      body.querySelector('#errand-ack')?.addEventListener('click', async e => {
        e.currentTarget.disabled = true;
        try {
          await api('/errands/seen', { chat_id: player.chat_id, errand_row_id: done.id });
          await bootstrapCache.refresh(player.chat_id);
          refreshResourceBar(player).catch(() => {});
        } catch { /* acknowledging is cosmetic; never block on it */ }
        await load();
        refreshErrandButton(player).catch(() => {});
      });
      return;
    }

    // 2. A unit is out.
    const active = state?.active?.[0];
    if (active) {
      const def  = ERRANDS_BY_ID[active.errand_id];
      const left = active.ends_at ? untilText(active.ends_at) : null;
      body.innerHTML = `
        <div class="errand-sheet">
          <div class="errand-title">${def?.title?.[lang] ?? active.errand_id}</div>
          <p class="errand-desc">${def?.desc?.[lang] ?? ''}</p>
          <div class="errand-away">
            <span class="errand-away-who">${active.unit_name ?? ''}</span>
            <span class="errand-away-state">${left ? `${T('returns')} ${left}` : T('away')}</span>
          </div>
          <div class="errand-section-label">${T('reward')}</div>
          <div class="errand-chips">${rewardHtml(active.reward)}</div>
        </div>`;
      return;
    }

    // 3. An offer is waiting.
    if (state?.offer) {
      const def  = ERRANDS_BY_ID[state.offer.errand_id];
      const rows = (bootstrapCache.data?.roster || [])
        .filter(r => state.offer.candidates.includes(String(r.id)));

      // Priced by the server, one entry per allowed trip length.
      const durations = state.offer.durations
        ?? [{ hours: state.offer.hours, mult: 1, reward: state.offer.reward }];
      const picked = durations.find(d => d.hours === chosenHours) ?? durations[0];

      body.innerHTML = `
        <div class="errand-sheet">
          <div class="errand-title">${def?.title?.[lang] ?? state.offer.errand_id}</div>
          <p class="errand-desc">${def?.desc?.[lang] ?? ''}</p>

          <div class="errand-section-label">${T('requires')}</div>
          <div class="errand-chips">${requirementHtml(state.offer.requirement)}</div>

          <div class="errand-section-label">${T('howLong')}</div>
          <div class="errand-durations" id="errand-durations">
            ${durations.map(d => `
              <button class="errand-duration ${d.hours === picked.hours ? 'errand-duration--selected' : ''}"
                      data-hours="${d.hours}">
                <span class="errand-duration-time">${d.hours}${T('hours')}</span>
                <span class="errand-duration-mult">x${d.mult}</span>
              </button>`).join('')}
          </div>

          <div class="errand-section-label">${T('reward')}</div>
          <div class="errand-chips">${rewardHtml(picked.reward)}</div>

          <div class="errand-section-label">${T('sendWho')}</div>
          <div class="prep-track-wrap errand-track-wrap">
            <div class="portrait-track" id="errand-track">
              ${rows.map(r => unitCardHtml(r, String(r.id) === String(chosen))).join('')}
            </div>
          </div>

          <button class="errand-btn" id="errand-send" ${chosen ? '' : 'disabled'}>${T('send')}</button>
        </div>`;

      // Re-renders rather than patching in place: the reward chips below have to
      // change with the pick, and they are the whole point of offering a choice.
      body.querySelector('#errand-durations')?.addEventListener('click', e => {
        const btn = e.target.closest('.errand-duration');
        if (!btn) return;
        chosenHours = Number(btn.dataset.hours);
        render();
      });

      body.querySelector('#errand-track')?.addEventListener('click', e => {
        const card = e.target.closest('.portrait-card');
        if (!card) return;
        chosen = card.dataset.rosterId;
        body.querySelectorAll('#errand-track .portrait-card').forEach(c =>
          c.classList.toggle('portrait-card--selected', c.dataset.rosterId === chosen));
        body.querySelector('#errand-send').disabled = false;
      });

      body.querySelector('#errand-send')?.addEventListener('click', async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = T('sending');
        try {
          await api('/errands/start', { chat_id: player.chat_id, roster_id: chosen, hours: chosenHours });
          _awayCache = null;                 // that unit is out now
          await load();
          refreshErrandButton(player).catch(() => {});
        } catch (err) {
          btn.disabled = false;
          btn.textContent = T('send');
          alert(err.message || T('failed'));
        }
      });
      return;
    }

    // 4. Nothing to do.
    body.innerHTML = `
      <div class="errand-sheet">
        <div class="errand-title">${T('none')}</div>
        <p class="errand-desc">${T('noneDesc')}</p>
      </div>`;
  }

  await load();
}

// Which roster ids are away right now. Cached for a few seconds because both
// battle prep and the castle ask on mount and they must not disagree — and
// neither should pay a round-trip the other already made.
let _awayCache = null;
let _awayAt    = 0;
const AWAY_TTL_MS = 5000;

export async function errandRosterIds(chat_id) {
  if (_awayCache && Date.now() - _awayAt < AWAY_TTL_MS) return _awayCache;
  try {
    const state = await api(`/errands?chat_id=${chat_id}`);
    _awayCache = new Set((state.active || []).map(a => String(a.roster_id)));
    _awayAt    = Date.now();
  } catch {
    // Never let this hide the whole roster — on failure, nobody is away.
    _awayCache = new Set();
    _awayAt    = Date.now();
  }
  return _awayCache;
}

// The button in the resource row. It glows when there is something to DO — an
// offer waiting, or a unit home with its result. A daily system that always
// glows teaches players to ignore it.
export async function refreshErrandButton(player) {
  const btn = document.querySelector('.res-bar-errands');
  if (!btn || !player?.chat_id) return;
  try {
    const state = await api(`/errands?chat_id=${player.chat_id}`);
    _awayCache = new Set((state.active || []).map(a => String(a.roster_id)));
    _awayAt    = Date.now();
    btn.classList.toggle('res-bar-errands--ready', !!state.offer || !!(state.finished || []).length);
  } catch {
    // Never let this take the shell down; the button just stays quiet.
  }
}