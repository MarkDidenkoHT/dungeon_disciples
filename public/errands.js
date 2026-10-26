import { api, bootstrapCache, errandsCache, refreshResourceBar } from './api.js';
import { openSheet, getSheetBody, setSheetTitle, resolveUnitDef, CRYSTAL_ICONS, GOLD_ICON, playAdPlaceholder } from './utils.js';
import { ERRANDS_BY_ID } from '../data/errands.js';
import { TOKEN_DEFS } from '../data/embark.js';
import { showTutorialSpotlight, isTutorialDone, markTutorialDone } from './tutorial.js';
import { assetUrl } from './asset_base.js';

// ── Errands ─────────────────────────────────────────────────────────────────
// Each errand sends one non-hero unit away until it comes back; at higher post
// levels more than one errand can run at once. Errands cannot fail, so this
// sheet never has to explain odds or risk.
//
// COMPLETION IS NOT OURS. The Supabase edge functions finish the errand, apply
// what it granted and notify the player through the bot. Everything here is
// offer -> send -> show what came back.
const ET = {
  title:       { en: 'Errands',                ru: 'Поручения' },
  none:        { en: 'Nothing today',          ru: 'Сегодня ничего' },
  noneDesc:    { en: 'No errand is waiting. Come back tomorrow — or free up your units, if anyone you sent is still away.',
                 ru: 'Поручений нет. Возвращайтесь завтра — или дождитесь бойцов, которых уже отправили.' },
  reward:      { en: 'Reward',                 ru: 'Награда' },
  send:        { en: 'Send',                   ru: 'Отправить' },
  sending:     { en: 'Sending…',               ru: 'Отправляем…' },
  away:        { en: 'Away',                   ru: 'В пути' },
  inProgress:  { en: 'Errands in progress',    ru: 'Поручения выполняются' },
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
  // The two offers. `needsEither` / `needsBoth` are the whole difference between
  // them stated in one word, next to the tags they apply to.
  pick:        { en: 'Choose an errand',       ru: 'Выберите поручение' },
  grandBadge:  { en: 'Grand',                  ru: 'Большое' },
  needsEither: { en: 'either',                 ru: 'любой' },
  needsBoth:   { en: 'both',                   ru: 'оба' },
  requires:    { en: 'Requires',               ru: 'Требуется' },
  trip:        { en: 'Trip',                   ru: 'В пути' },
  noUnit:      { en: 'No unit on your roster can take this one.',
                 ru: 'Никто в отряде не может взять это поручение.' },
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

// An errand borrows the art of a building, in its own faction — same convention
// and same suffix as the castle screen (infirmary_e.jpg / _c / _g). Reading the
// suffix off the DEF's faction rather than the player's keeps the image right
// for any errand we can hold, offered or not.
const FACTION_ART_SUFFIX = { empire: 'e', choir_of_the_cursed: 'c', grail_of_sorrow: 'g' };

function errandArtUrl(def) {
  const suffix = FACTION_ART_SUFFIX[def?.faction];
  if (!def?.art || !suffix) return '';
  return assetUrl(`/assets/buildings/${def.art}_${suffix}.jpg`);
}

function errandHeaderHtml(def, desc) {
  const src = errandArtUrl(def);
  const art = src
    ? `<img class="errand-art-img" src="${src}" alt=""
            onerror="this.closest('.errand-header').classList.add('errand-header--noart')">`
    : '';
  return `
    <div class="errand-header ${art ? '' : 'errand-header--noart'}">
      ${art}
      ${desc ? `<p class="errand-desc">${desc}</p>` : ''}
    </div>`;
}

// ── The two offers, side by side ─────────────────────────────────────────────
// The offer cards only identify the errands. Their tags and rewards are shown
// in the styled detail boxes below.
//
function offerCardHtml(offer, { selected, hours }) {
  const def = ERRANDS_BY_ID[offer.errand_id];
  const src = errandArtUrl(def);
  const grand = offer.kind === 'grand';
  // No candidate means the offer stands but this roster cannot answer it — shown
  // anyway, dimmed, because "you need a Caster who is also Holy" is information
  // worth having, and hiding the card would make the post look empty.
  const dead = !(offer.candidates || []).length;
  return `
    <button class="errand-offer ${selected ? 'errand-offer--selected' : ''} ${grand ? 'errand-offer--grand' : ''} ${dead ? 'errand-offer--dead' : ''}"
            data-row-id="${offer.row_id ?? ''}" type="button">
      <span class="errand-offer-art">
        ${src ? `<img src="${src}" alt="" onerror="this.style.display='none'">` : ''}
        ${grand ? `<span class="errand-offer-badge">${T('grandBadge')}</span>` : ''}
        <span class="errand-offer-hours">${hours}${T('hours')}</span>
      </span>
      <span class="errand-offer-name">${def?.title?.[lang] ?? offer.errand_id}</span>
    </button>`;
}

function activeErrandsHtml(active) {
  if (!active.length) return '';
  return `
    <div class="errand-active-list">
      <div class="errand-section-label">${T('inProgress')}</div>
      ${active.map(errand => {
        const def = ERRANDS_BY_ID[errand.errand_id];
        const left = errand.ends_at ? untilText(errand.ends_at) : null;
        return `
          <div class="errand-away">
            <span class="errand-away-who">${errand.unit_name ?? ''} — ${def?.title?.[lang] ?? errand.errand_id}</span>
            <span class="errand-away-state">${left ? `${T('returns')} ${left}` : T('away')}</span>
          </div>
          <div class="errand-section-label">${T('reward')}</div>
          <div class="errand-chips">${rewardHtml(errand.reward)}</div>`;
      }).join('')}
    </div>`;
}

// Gold and crystals use the SAME icons as the resource strip, so a reward reads
// as "that thing at the top of my screen" without translating a word. XP has no
// resource icon — it is not a resource — so it keeps its short label.
function resourceIcon(key) {
  return key === 'Gold' ? GOLD_ICON : (CRYSTAL_ICONS[key] ?? '');
}

// A token (Tome, Sigil, potion) is what a GRAND errand pays, and it has real art
// — the same file the daily-task and quest sheets use — so it reads as the thing
// the player already knows from the supply pool rather than as a word.
function tokenIconHtml(id) {
  const def = TOKEN_DEFS[id];
  const fallback = def?.icon || '✦';
  if (!def?.art) return fallback;
  return `<img src="${assetUrl(`/${def.art}`)}" class="res-icon-img" alt=""
               onerror="this.replaceWith(document.createTextNode('${fallback}'))">`;
}

// `names` spells a token out ("+1 Tome of Knowledge") instead of leaving it as
// an icon. On by default everywhere there is a full row to write in; off on the
// offer cards, which are half a screen wide and already carry the name in the
// chip's title.
function rewardHtml(reward = {}, { names = true } = {}) {
  const bits = [];
  if (reward.xp_self)   bits.push(`<span class="errand-reward-chip">+${reward.xp_self} ${T('xpSelf')}</span>`);
  if (reward.xp_roster) bits.push(`<span class="errand-reward-chip">+${reward.xp_roster} ${T('xpRoster')}</span>`);
  for (const [item, amount] of Object.entries(reward.resources || {})) {
    const icon = resourceIcon(item);
    bits.push(`<span class="errand-reward-chip" title="${item.replace('Crystals_', '')}">+${amount}${
      icon || ` ${item.replace('Crystals_', '')}`}</span>`);
  }
  for (const [item, amount] of Object.entries(reward.tokens || {})) {
    const name = TOKEN_DEFS[item]?.name || item;
    bits.push(`<span class="errand-reward-chip errand-reward-chip--token" title="${name}">+${amount}${
      tokenIconHtml(item)}${names ? `<span class="errand-token-name">${name}</span>` : ''}</span>`);
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
  // Which of the two offers is in front. Held as the offer ROW id, which is what
  // /errands/start takes — so the sheet never has to describe the errand it is
  // sending a unit on, only name the row the server already minted.
  let chosenOffer = null;
  // The trip length the player picked, PER OFFER. Per offer rather than one
  // shared value because the two offers do not allow the same lengths: a grand
  // errand has exactly one, and switching cards must not carry a 6h pick onto a
  // 12h errand or silently reset the other card's choice.
  const hoursByOffer = {};

  function offerList() {
    return state?.offers ?? (state?.offer ? [state.offer] : []);
  }
  function currentOffer() {
    const all = offerList();
    return all.find(o => String(o.row_id) === String(chosenOffer)) ?? all[0] ?? null;
  }
  function hoursFor(offer) {
    const allowed = offer?.durations ?? [];
    const want = hoursByOffer[String(offer?.row_id)];
    return allowed.find(d => d.hours === want)?.hours ?? allowed[0]?.hours ?? offer?.hours ?? null;
  }
  // Selecting a card re-picks the unit too: the two offers have different
  // requirements, so the unit chosen for one is often not a candidate for the
  // other.
  function selectOffer(rowId) {
    chosenOffer = rowId;
    chosen = currentOffer()?.candidates?.[0] ?? null;
  }

  async function load(forceRefresh = false) {
    // Navigation refreshes this cache for the button badge. Reuse that result
    // (or its in-flight request) rather than forcing another full errand read
    // when the sheet opens. Writes refresh the cache, and its TTL bounds
    // cross-device staleness.
    state  = await (forceRefresh
      ? errandsCache.refresh(player.chat_id)
      : errandsCache.get(player.chat_id));
    // Keep the card the player was looking at across a reload when it is still
    // on offer; otherwise fall to the first, which is the simple errand.
    const all = offerList();
    const keep = all.find(o => String(o.row_id) === String(chosenOffer));
    selectOffer((keep ?? all[0])?.row_id ?? null);
    render();
  }

  // The reroll button, or nothing at all when the day's swaps are gone. Hidden
  // rather than shown-disabled: the offer sheet is already dense, and a control
  // that cannot do anything until tomorrow is not worth the row.
  //
  // One shared control stays available whichever offer is selected.
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
    body.closest('.modal')?.classList.toggle('modal--errands-expanded', messengerPostLevel() >= 4);

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
        await load(true);
        refreshErrandButton(player).catch(() => {});
      });
      return;
    }

    // 2. Units are out. At level 4 an open offer can be shown alongside them.
    const active = state?.active ?? [];
    const offers = offerList();
    if (active.length && !offers.length) {
      const first = active[0];
      const def = ERRANDS_BY_ID[first.errand_id];
      setSheetTitle(def?.title?.[lang] ?? first.errand_id);
      body.innerHTML = `
        <div class="errand-sheet">
          ${activeErrandsHtml(active)}
        </div>`;
      return;
    }

    // 3. Offers are waiting — one card per kind, in one row.
    if (offers.length) {
      const offer = currentOffer();
      const def   = ERRANDS_BY_ID[offer.errand_id];
      const hours = hoursFor(offer);
      const rows  = (bootstrapCache.data?.roster || [])
        .filter(r => offer.candidates.includes(String(r.id)));

      // Priced by the server, one entry per allowed trip length. A grand errand
      // reports exactly one, so the picker below collapses to nothing rather
      // than offering a choice that does not exist.
      const durations = offer.durations ?? [];
      const picked    = durations.find(d => d.hours === hours) ?? durations[0] ?? { hours: offer.hours, parts: [] };
      const parts     = picked.parts ?? [];
      // Which tags the selected unit has: for a simple errand the halves it
      // earns are the lit ones. A grand errand has no halves — a unit either
      // carries both tags and takes the whole reward, or cannot go at all.
      const chosenTags = offer.candidate_tags?.[String(chosen)] ?? [];
      const filterTags = offer.requirement?.tags_all || offer.requirement?.tags_any || [];
      const dead = !rows.length;

      // The sheet is a choice between two errands now, so its header names the
      // choice and each card names its own errand.
      setSheetTitle(offers.length > 1 ? T('pick') : (def?.title?.[lang] ?? offer.errand_id));
      body.innerHTML = `
        <div class="errand-sheet">
          ${activeErrandsHtml(active)}

          <div class="errand-offers" id="errand-offers">
            ${offers.map(o => offerCardHtml(o, {
              selected: String(o.row_id) === String(offer.row_id),
              hours:    hoursFor(o),
            })).join('')}
          </div>

          ${def?.desc?.[lang] ? `<p class="errand-desc errand-desc--detail">${def.desc[lang]}</p>` : ''}

          ${offer.reward ? `
            <div class="errand-parts">
              <div class="errand-part ${filterTags.every(tag => chosenTags.includes(tag)) ? 'errand-part--earned' : ''}">
                ${filterTags.map((tag, i) => `${i ? '<span class="errand-offer-join">+</span>' : ''}<span class="unit-tag">${tag}</span>`).join('')}
                <span class="errand-chips">${rewardHtml(offer.reward)}</span>
              </div>
            </div>
          ` : `
            <div class="errand-parts">
              ${parts.map(p => `
                <div class="errand-part ${chosenTags.includes(p.tag) ? 'errand-part--earned' : ''}">
                  <span class="unit-tag">${p.tag}</span>
                  <span class="errand-chips">${rewardHtml(p.reward)}</span>
                </div>`).join('')}
            </div>
          `}

          ${durations.length > 1 ? `
            <div class="errand-durations" id="errand-durations">
              ${durations.map(d => `
                <button class="errand-duration ${d.hours === picked.hours ? 'errand-duration--selected' : ''}"
                        data-hours="${d.hours}">
                  <span class="errand-duration-time">${d.hours}${T('hours')}</span>
                  <span class="errand-duration-mult">x${d.mult}</span>
                </button>`).join('')}
            </div>` : ''}

          ${dead ? `<p class="errand-desc errand-desc--detail">${T('noUnit')}</p>` : ''}

          <button class="errand-btn" id="errand-send" ${chosen ? '' : 'disabled'}>${T('send')}</button>

          ${rerollBtnHtml()}

          <div class="prep-track-wrap errand-track-wrap">
            <div class="portrait-track" id="errand-track">
              ${rows.map(r => unitCardHtml(r, String(r.id) === String(chosen))).join('')}
            </div>
          </div>
        </div>`;

      // Switching cards swaps the requirement, the reward and the candidate
      // list, so it is a full re-render like every other pick in this sheet.
      body.querySelector('#errand-offers')?.addEventListener('click', e => {
        const card = e.target.closest('.errand-offer');
        if (!card || String(card.dataset.rowId) === String(offer.row_id)) return;
        selectOffer(card.dataset.rowId);
        render();
      });

      // Re-renders rather than patching in place: the reward chips below have to
      // change with the pick, and they are the whole point of offering a choice.
      body.querySelector('#errand-durations')?.addEventListener('click', e => {
        const btn = e.target.closest('.errand-duration');
        if (!btn) return;
        hoursByOffer[String(offer.row_id)] = Number(btn.dataset.hours);
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
          // The offer row is named explicitly — with two on the table the
          // server cannot infer which one the player was looking at.
          await api('/errands/start', {
            chat_id: player.chat_id,
            roster_id: chosen,
            hours,
            offer_row_id: offer.row_id,
          });
          await load(true);                  // that unit is out now
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

const awaySet = state => new Set((state?.active || []).map(a => String(a.roster_id)));

export async function errandRosterIds(chat_id) {
  try {
    return awaySet(await errandsCache.get(chat_id));
  } catch {
    // Never let this hide the whole roster — on failure, nobody is away.
    return new Set();
  }
}

export function errandsUnlocked(player) {
  if (!isTutorialDone(player, 'battle_done')) return false;
  return messengerPostLevel() > 0;
}

export function messengerPostLevel() {
  const data = bootstrapCache.data?.structures?.buildings_data;
  if (!data) return 0;
  let best = 0;
  for (const [key, state] of Object.entries(data)) {
    if (!/^slot_\d+$/.test(key)) continue;
    if (state?.building_id === 'messenger_post') best = Math.max(best, state.level ?? 0);
  }
  return best;
}

let introRunning = false;

export function maybeShowErrandsIntro(player) {
  if (introRunning && !document.querySelector('.tutorial-overlay')) introRunning = false;
  if (introRunning) return;
  if (!errandsUnlocked(player)) return;
  if (isTutorialDone(player, 'errands_intro')) return;
  const btn = document.querySelector('.res-bar-errands');
  if (!btn) return;

  introRunning = true;
  // Locked until the first refresh lands; the spotlight can't wait for it.
  btn.disabled = false;
  // One bubble, not two. `errands_away` was a second "Got it" on this same
  // button carrying the "they will be gone for hours" warning; it is the last
  // sentence of errands_intro now. Its flag is still marked so a player who saw
  // the old pair is not shown anything again.
  showTutorialSpotlight(player, 'errands_intro', btn, {
    showContinue: true,
    onAdvance: () => {
      introRunning = false;
      markTutorialDone(player, 'errands_intro');
      markTutorialDone(player, 'errands_away');
      openErrandsSheet(player);
    },
  });
}

export async function refreshErrandButton(player) {
  const btn = document.querySelector('.res-bar-errands');
  if (!btn || !player?.chat_id) return;
  // The gate reads structures, so the cache has to be loaded first.
  try { await bootstrapCache.get(player.chat_id); } catch {}
  btn.disabled = !errandsUnlocked(player);
  if (btn.disabled) return;
  try {
    const state = await errandsCache.get(player.chat_id);
    const waiting = (state.offers ?? (state.offer ? [state.offer] : [])).length;
    btn.classList.toggle('res-bar-errands--ready', !!waiting || !!(state.finished || []).length);
  } catch {
    // Never let this take the shell down; the button just stays quiet.
  }
}
