import { api, bootstrapCache, errandsCache, refreshResourceBar } from './api.js';
import { openSheet, getSheetBody, setSheetTitle, resolveUnitDef, CRYSTAL_ICONS, GOLD_ICON, playAdPlaceholder } from './utils.js';
import { ERRANDS_BY_ID } from '../data/errands.js';
import { showTutorialSpotlight, isTutorialDone, markTutorialDone } from './tutorial.js';
import { assetUrl } from './asset_base.js';

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
  reward:      { en: 'Reward',                 ru: 'Награда' },
  send:        { en: 'Send',                   ru: 'Отправить' },
  sending:     { en: 'Sending…',               ru: 'Отправляем…' },
  away:        { en: 'Away',                   ru: 'В пути' },
  returns:     { en: 'Returns in',             ru: 'Вернётся через' },
  backHome:    { en: 'Home again',             ru: 'Вернулся домой' },
  gained:      { en: 'Brought home',           ru: 'Принесено' },
  gotIt:       { en: 'Good',                   ru: 'Отлично' },
  xpSelf:      { en: 'XP',                     ru: 'Опыт' },
  xpRoster:    { en: 'XP shared at home',      ru: 'Опыт на всех оставшихся' },
  hours:       { en: 'h',                      ru: 'ч' },
  failed:      { en: 'Something went wrong.',  ru: 'Что-то пошло не так.' },
  // Reroll (rewarded ad). The count is on the button because the allowance is
  // the whole decision — three a day is worth spending carefully.
  reroll:      { en: 'Different errand',       ru: 'Другое поручение' },
  rerollNone:  { en: 'No swaps left today',    ru: 'На сегодня замен нет' },
  adBadge:     { en: 'Ad',                     ru: 'Реклама' },
  adPlaceholder: { en: 'Advertisement placeholder', ru: 'Место для рекламы' },
  adWatching:  { en: 'Finding other work…',    ru: 'Ищем другую работу…' },
  adCancel:    { en: 'Cancel',                 ru: 'Отмена' },
  rerollNoAlt: { en: 'No other errand fits your roster right now.',
                 ru: 'Сейчас вашему отряду не подходит другое поручение.' },
};

// Server error codes that deserve their own line rather than the generic
// failure. `reroll_no_alternative` is the one a player can act on: it means the
// roster, not the dice, is the limit — and no daily use was spent.
const REROLL_ERRORS = {
  reroll_no_alternative: 'rerollNoAlt',
  reroll_cap:            'rerollNone',
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

// Art, name and description are ONE block: the name rides the top of the image
// and the text the bottom, so the three of them cost the vertical space of the
// image alone. Art lives in /assets/icons/errands and is authored separately, so
// a missing file drops back to plain text rather than leaving a broken image.
// The name is set on the SHEET HEADER (setSheetTitle) rather than drawn over the
// art, so it is not printed twice; the description keeps the foot of the image.
function errandHeaderHtml(def, desc) {
  const art = def?.art
    ? `<img class="errand-art-img" src="${assetUrl(`/assets/icons/errands/${def.art}`)}" alt=""
            onerror="this.closest('.errand-header').classList.add('errand-header--noart')">`
    : '';
  return `
    <div class="errand-header ${art ? '' : 'errand-header--noart'}">
      ${art}
      ${desc ? `<p class="errand-desc">${desc}</p>` : ''}
    </div>`;
}

// Gold and crystals use the SAME icons as the resource strip, so a reward reads
// as "that thing at the top of my screen" without translating a word. XP has no
// resource icon — it is not a resource — so it keeps its short label.
function resourceIcon(key) {
  return key === 'Gold' ? GOLD_ICON : (CRYSTAL_ICONS[key] ?? '');
}

function rewardHtml(reward = {}) {
  const bits = [];
  if (reward.xp_self)   bits.push(`<span class="errand-reward-chip">+${reward.xp_self} ${T('xpSelf')}</span>`);
  if (reward.xp_roster) bits.push(`<span class="errand-reward-chip">+${reward.xp_roster} ${T('xpRoster')}</span>`);
  for (const [item, amount] of Object.entries(reward.resources || {})) {
    const icon = resourceIcon(item);
    bits.push(`<span class="errand-reward-chip" title="${item.replace('Crystals_', '')}">+${amount}${
      icon || ` ${item.replace('Crystals_', '')}`}</span>`);
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
      <img class="portrait-art-img" src="${assetUrl(`/assets/character_portraits/p_${portraitId}.png`)}"
           alt="${name}" onerror="this.style.display='none'">
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
    // refresh(), not get(): opening the sheet is a deliberate act and the player
    // is looking straight at this state, so it is worth one round-trip. The
    // per-navigation badge is the thing that reads the cache — see
    // refreshErrandButton — and it now shares whatever this stores.
    state  = await errandsCache.refresh(player.chat_id);
    chosen = state.offer?.candidates?.[0] ?? null;   // Send is one tap
    chosenHours = state.offer?.durations?.[0]?.hours ?? state.offer?.hours ?? null;
    render();
  }

  // The reroll button, or nothing at all when the day's swaps are gone. Hidden
  // rather than shown-disabled: the offer sheet is already dense, and a control
  // that cannot do anything until tomorrow is not worth the row.
  function rerollBtnHtml() {
    const left = bootstrapCache.data?.errand_reroll?.remaining ?? 0;
    if (left <= 0) return '';
    return `
      <button class="errand-btn errand-btn--reroll" id="errand-reroll">
        <span class="errand-reroll-ad">${T('adBadge')}</span>
        <span>${T('reroll')}</span>
        <span class="errand-reroll-left">${left}</span>
      </button>`;
  }

  // Watch an ad, get a different errand. The server is the authority on every
  // part of this: it times the view, enforces the daily cap, and guarantees the
  // replacement is not the errand being replaced.
  async function runReroll(btn) {
    btn.disabled = true;
    let started;
    try {
      started = await api('/errands/reroll/start', { chat_id: player.chat_id });
    } catch (err) {
      alert(rerollError(err));
      btn.disabled = false;
      return;
    }

    const seconds  = started.seconds ?? bootstrapCache.data?.errand_reroll?.seconds ?? 15;
    const finished = await playAdPlaceholder(seconds, {
      badge:       T('adBadge'),
      placeholder: T('adPlaceholder'),
      title:       T('adWatching'),
      cancel:      T('adCancel'),
    });
    // Backed out: the token is simply left unclaimed and no use is spent.
    if (!finished) { btn.disabled = false; return; }

    try {
      await api('/errands/reroll/claim', { chat_id: player.chat_id, token: started.token });
      // Both caches move: the offer changed, and so did the day's allowance.
      await Promise.all([
        bootstrapCache.refresh(player.chat_id),
        errandsCache.refresh(player.chat_id),
      ]);
      await load();
    } catch (err) {
      alert(rerollError(err));
      btn.disabled = false;
    }
  }

  function rerollError(err) {
    const key = REROLL_ERRORS[err?.code];
    return key ? T(key) : (err?.message || T('failed'));
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
      // The errand is over, so the header says so and the errand's own name goes
      // in the line under the art with whoever ran it.
      setSheetTitle(T('backHome'));
      body.innerHTML = `
        <div class="errand-sheet">
          ${errandHeaderHtml(def,
            `${done.unit_name ? `<strong>${done.unit_name}</strong> — ` : ''}${def?.title?.[lang] ?? done.errand_id}`)}
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
      setSheetTitle(def?.title?.[lang] ?? active.errand_id);
      body.innerHTML = `
        <div class="errand-sheet">
          ${errandHeaderHtml(def, def?.desc?.[lang] ?? '')}
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

      // Priced by the server, one entry per allowed trip length. Each entry
      // carries the two tag halves rather than one merged total, because what a
      // given unit earns depends on which of the two tags it has.
      const durations = state.offer.durations ?? [];
      const picked    = durations.find(d => d.hours === chosenHours) ?? durations[0] ?? { hours: state.offer.hours, parts: [] };
      const parts     = picked.parts ?? [];
      // Which tags the selected unit has: the halves it earns are the lit ones,
      // which is the whole explanation the sheet needs to give.
      const chosenTags = state.offer.candidate_tags?.[String(chosen)] ?? [];

      setSheetTitle(def?.title?.[lang] ?? state.offer.errand_id);
      body.innerHTML = `
        <div class="errand-sheet">
          ${errandHeaderHtml(def, def?.desc?.[lang] ?? '')}

          <div class="errand-parts">
            ${parts.map(p => `
              <div class="errand-part ${chosenTags.includes(p.tag) ? 'errand-part--earned' : ''}">
                <span class="unit-tag">${p.tag}</span>
                <span class="errand-chips">${rewardHtml(p.reward)}</span>
              </div>`).join('')}
          </div>

          <div class="errand-durations" id="errand-durations">
            ${durations.map(d => `
              <button class="errand-duration ${d.hours === picked.hours ? 'errand-duration--selected' : ''}"
                      data-hours="${d.hours}">
                <span class="errand-duration-time">${d.hours}${T('hours')}</span>
                <span class="errand-duration-mult">x${d.mult}</span>
              </button>`).join('')}
          </div>

          <button class="errand-btn" id="errand-send" ${chosen ? '' : 'disabled'}>${T('send')}</button>

          ${rerollBtnHtml()}

          <div class="prep-track-wrap errand-track-wrap">
            <div class="portrait-track" id="errand-track">
              ${rows.map(r => unitCardHtml(r, String(r.id) === String(chosen))).join('')}
            </div>
          </div>
        </div>`;

      // Re-renders rather than patching in place: the reward chips below have to
      // change with the pick, and they are the whole point of offering a choice.
      body.querySelector('#errand-durations')?.addEventListener('click', e => {
        const btn = e.target.closest('.errand-duration');
        if (!btn) return;
        chosenHours = Number(btn.dataset.hours);
        render();
      });

      body.querySelector('#errand-reroll')?.addEventListener('click', e => {
        runReroll(e.currentTarget);
      });

      body.querySelector('#errand-track')?.addEventListener('click', e => {
        const card = e.target.closest('.portrait-card');
        if (!card) return;
        chosen = card.dataset.rosterId;
        // Full re-render: which reward halves are lit follows the selected
        // unit's tags.
        render();
        return;
      });

      body.querySelector('#errand-send')?.addEventListener('click', async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = T('sending');
        try {
          await api('/errands/start', { chat_id: player.chat_id, roster_id: chosen, hours: chosenHours });
          await load();                      // refreshes the cache; that unit is out now
          refreshErrandButton(player).catch(() => {});
        } catch (err) {
          btn.disabled = false;
          btn.textContent = T('send');
          alert(err.message || T('failed'));
        }
      });
      return;
    }

    // 4. Nothing to do. No errand to name, so the header keeps the generic one.
    setSheetTitle(T('title'));
    body.innerHTML = `
      <div class="errand-sheet errand-sheet--padded">
        <div class="errand-title">${T('none')}</div>
        <p class="errand-desc">${T('noneDesc')}</p>
      </div>`;
  }

  await load();
}

// Which roster ids are away right now. Battle prep and the castle both ask on
// mount and must not disagree; both now read the shared errands cache, so they
// see the same answer and neither pays a round-trip the other already made.
// (This used to keep its own 5-second copy alongside the button's, which meant
// the two could hold different states and each had its own fetch.)
const awaySet = state => new Set((state?.active || []).map(a => String(a.roster_id)));

export async function errandRosterIds(chat_id) {
  try {
    return awaySet(await errandsCache.get(chat_id));
  } catch {
    // Never let this hide the whole roster — on failure, nobody is away.
    return new Set();
  }
}

// ── The errand system is LOCKED until the first battle is over ──────────────
// A new player has one or two units and a tutorial telling them to go and
// fight. Offering to send one of those units away for six hours in the middle
// of that is a trap, so nothing about errands exists — no button, no sheet —
// until they have finished a battle and know what a unit is FOR.
// `battle_done` is written by the battle result screen (see screens/battle.js).
export function errandsUnlocked(player) {
  return isTutorialDone(player, 'battle_done');
}

// Runs on every navigation, does something exactly once: the first time the
// player is back in the castle after a battle, the errand button they have
// never seen before is spotlighted and explained, then the sheet is opened for
// them. Two steps — what errands are, and the cost of sending someone.
let introRunning = false;

export function maybeShowErrandsIntro(player) {
  // A navigation tears the overlay down without going through onAdvance; drop
  // the flag rather than blocking the intro forever.
  if (introRunning && !document.querySelector('.tutorial-overlay')) introRunning = false;
  if (introRunning) return;
  if (!errandsUnlocked(player)) return;
  if (isTutorialDone(player, 'errands_intro')) return;
  const btn = document.querySelector('.res-bar-errands');
  if (!btn) return;

  introRunning = true;
  // Locked until the first refresh lands; the spotlight can't wait for it.
  btn.disabled = false;
  showTutorialSpotlight(player, 'errands_intro', btn, {
    showContinue: true,
    onAdvance: () => {
      showTutorialSpotlight(player, 'errands_away', btn, {
        showContinue: true,
        onAdvance: () => {
          introRunning = false;
          markTutorialDone(player, 'errands_intro');
          openErrandsSheet(player);
        },
      });
    },
  });
}

// The button in the resource row. It glows when there is something to DO — an
// offer waiting, or a unit home with its result. A daily system that always
// glows teaches players to ignore it.
export async function refreshErrandButton(player) {
  const btn = document.querySelector('.res-bar-errands');
  if (!btn || !player?.chat_id) return;
  // Locked before the first battle: the button stays in the strip and is simply
  // disabled, so the player can see there is something there to come back to.
  // Re-checked on every refresh rather than at mount, because the unlock lands
  // mid-session — the player returns from their first battle and the shell is
  // already up.
  btn.disabled = !errandsUnlocked(player);
  if (btn.disabled) return;
  try {
    // get(), not a bare fetch: this runs on EVERY navigation and only decides
    // whether the button glows. The cache's TTL covers the one thing that
    // changes without us — an errand finishing on a server timer — and both
    // errand writes refresh it, so the badge cannot lag behind the player's own
    // actions.
    const state = await errandsCache.get(player.chat_id);
    btn.classList.toggle('res-bar-errands--ready', !!state.offer || !!(state.finished || []).length);
  } catch {
    // Never let this take the shell down; the button just stays quiet.
  }
}