import { api, bootstrapCache, refreshResourceBar, navigate } from './api.js';
import { CRYSTAL_ICONS, GOLD_ICON } from './utils.js';
import { assetUrl } from './asset_base.js';
import { DAILY_TASKS, DAILY_REWARDS } from '../data/daily_tasks.js';
import { QUESTS_BY_ID } from '../data/quests.js';
import { TOKEN_DEFS } from '../data/embark.js';
import { isTutorialDone } from './tutorial.js';
import { openErrandsSheet, errandsUnlocked } from './errands.js';

let lang = 'en';
const T = (en, ru) => (lang === 'ru' ? ru : en);

const ERRORS = {
  daily_claimed:    ['Already claimed today.',   'Награда за сегодня уже получена.'],
  daily_incomplete: ['Finish every task first.', 'Сначала выполните все задания.'],
  daily_bad_reward: ['Pick one of the rewards.', 'Выберите одну из наград.'],
  quest_claimed:    ['Already claimed.',         'Уже получено.'],
  quest_incomplete: ['Milestone not reached yet.', 'Этап ещё не пройден.'],
  quest_locked:     ['Your hero is not strong enough for this quest yet.', 'Ваш герой ещё недостаточно силён для этого задания.'],
};

let activeOverlay = null;

// The tab the window was last left on, so reopening it lands where the player was.
let activeTab = 'daily';

// One-shot close callbacks, the same contract onSheetClose uses: each fires
// once and is dropped. Onboarding needs it because this modal is not part of
// the sheet system, so closing it fires no sheet handler and the driver would
// never learn the player was done reading.
const _closeHandlers = new Set();
export function onDailyClose(fn) {
  _closeHandlers.add(fn);
  return () => _closeHandlers.delete(fn);
}

function taskHtml(task) {
  const def = DAILY_TASKS.find(t => t.id === task.id);
  if (!def) return '';
  return `
    <div class="daily-task${task.done ? ' daily-task--done' : ''}">
      <span class="daily-check">${task.done ? '✓' : ''}</span>
      <div class="daily-task-body">
        <div class="daily-task-title">${def.title[lang]}</div>
        <div class="daily-task-desc">${def.desc[lang]}</div>
      </div>
      <span class="daily-progress">${task.progress}/${task.target}</span>
    </div>`;
}

// A supply's name and art are per faction and live in data/buildings.js, which
// is CommonJS and cannot be imported here — so both ride the bootstrap payload
// the embark gate already reads. The emoji is only what shows before a faction
// is picked or if the art 404s.
const SUPPLY_FALLBACK_ICON = '\u{1F9FA}';

function supplyNameText() {
  const supply = bootstrapCache.data?.supplies;
  return (lang === 'ru' ? supply?.label_ru : supply?.label_en) || supply?.item || T('Supplies', 'Припасы');
}

function supplyIconHtml() {
  const art = bootstrapCache.data?.supplies?.art;
  if (!art) return SUPPLY_FALLBACK_ICON;
  return `<img class="res-icon-img" src="${assetUrl('/' + art.replace(/^\//, ''))}" alt=""
               onerror="this.replaceWith(document.createTextNode('${SUPPLY_FALLBACK_ICON}'))">`;
}

// The reward's art. Gold and crystals have real icons and use them; the crystal
// one is drawn in the player's OWN element, which the server names (see /daily)
// because the faction map is CommonJS and cannot be imported here. The tome has
// no art anywhere in the game yet, so it keeps its glyph.
function rewardIconHtml(reward, factionCrystal) {
  if (reward.resources?.Gold) return GOLD_ICON;
  if (reward.id === 'crystals') return CRYSTAL_ICONS[factionCrystal] || CRYSTAL_ICONS.Crystals_Life;
  if (reward.supplies) return supplyIconHtml();
  // A reward with art draws it; the emoji stays as the fallback if it 404s.
  if (reward.art) {
    return `<img class="daily-reward-img" src="${assetUrl('/' + reward.art.replace(/^\//, ''))}" alt=""
                 onerror="this.replaceWith(document.createTextNode('${reward.icon}'))">`;
  }
  return reward.icon;
}

// The supplies reward names the player's own faction supply rather than the
// generic label in data/daily_tasks.js, which is only the fallback for a player
// who has not picked a faction yet.
function rewardLabel(reward) {
  if (reward.supplies) return `${reward.supplies} ${supplyNameText()}`;
  return reward.label[lang];
}

function rewardHtml(reward, locked, factionCrystal) {
  return `
    <button class="daily-reward" data-reward="${reward.id}" ${locked ? 'disabled' : ''}>
      <span class="daily-reward-icon">${rewardIconHtml(reward, factionCrystal)}</span>
      <span class="daily-reward-label">${rewardLabel(reward)}</span>
    </button>`;
}

function dailyBodyHtml(state) {
  const tasks = state.tasks.map(taskHtml).join('');

  // Three states for the reward strip: locked while the day is unfinished,
  // pickable once it is, and a single card naming what was taken after that.
  if (state.claimed) {
    const taken = DAILY_REWARDS.find(r => r.id === state.reward);
    return `
      <div class="daily-tasks">${tasks}</div>
      <div class="daily-claimed">
        <span class="daily-reward-icon">${taken ? rewardIconHtml(taken, state.faction_crystal) : '✓'}</span>
        <span>${T('Claimed', 'Получено')}${taken ? ` — ${rewardLabel(taken)}` : ''}</span>
        <span class="daily-claimed-note">${T('Come back tomorrow.', 'Возвращайтесь завтра.')}</span>
      </div>`;
  }
  return `
    <div class="daily-tasks">${tasks}</div>
    <div class="daily-section-label">
      ${state.complete
        ? T('Choose your reward', 'Выберите награду')
        : T('Finish every task to choose a reward', 'Выполните все задания, чтобы выбрать награду')}
    </div>
    <div class="daily-rewards">
      ${DAILY_REWARDS.map(r => rewardHtml(r, !state.complete, state.faction_crystal)).join('')}
    </div>`;
}

// ── Quests ──────────────────────────────────────────────────────────────────

const TOKEN_NAMES = {
  health_potion:     ['Health Potion',     'Зелье здоровья'],
  tome_of_knowledge: ['Tome of Knowledge', 'Том знаний'],
  crossroad_sigil:   ['Crossroad Sigil',   'Перекрёстная Печать'],
  engraving_token:   ['Engraving Token',   'Жетон Гравировки'],
};

const questIcon = html => `<span class="quest-reward-icon">${html}</span>`;

// One chip per thing a milestone pays: currencies, the faction crystal, tokens.
function questRewardHtml(reward, factionCrystal) {
  const chips = [];
  if (reward?.resources?.Gold) chips.push([questIcon(GOLD_ICON), reward.resources.Gold, T('Gold', 'Золото')]);
  if (reward?.resources?.Valor) {
    const icon = `<img src="${assetUrl('/assets/icons/recources/valor.png')}" class="res-icon-img" alt="">`;
    chips.push([questIcon(icon), reward.resources.Valor, T('Valor', 'Доблесть')]);
  }
  if (reward?.crystals) {
    chips.push([questIcon(CRYSTAL_ICONS[factionCrystal] || CRYSTAL_ICONS.Crystals_Life), reward.crystals, T('Crystals', 'Кристаллы')]);
  }
  for (const [id, amount] of Object.entries(reward?.tokens || {})) {
    const def = TOKEN_DEFS[id];
    const tokenArt = def?.art || (id === 'engraving_token' ? 'assets/icons/recources/engraving_token.png' : null);
    const fallback = def?.icon || '✦';
    const art = tokenArt
      ? `<img src="${assetUrl(`/${tokenArt}`)}" class="res-icon-img" alt=""
                 onerror="this.replaceWith(document.createTextNode('${fallback}'))">`
      : fallback;
    const name = TOKEN_NAMES[id] ? T(...TOKEN_NAMES[id]) : (def?.name || id);
    chips.push([questIcon(art), amount, name]);
  }
  if (reward?.supplies) chips.push([questIcon(supplyIconHtml()), reward.supplies, supplyNameText()]);
  return chips.map(([icon, amount, name]) =>
    `<span class="quest-reward" title="${name}">${icon}<span>×${amount}</span></span>`).join('');
}

// Where a quest's button leads, and whether that place is open to the player
// yet. A locked nav tab means the tutorial has not reached it.
const GO_TARGETS = {
  embark:   { screen: 'embark' },
  colossus: { screen: 'embark', params: { layer: 'colossus' } },
  arena:    { screen: 'embark', params: { layer: 'arena' } },
  spells:   { screen: 'spells' },
};

function goAvailable(go, player) {
  if (go === 'errands') return errandsUnlocked(player);
  const target = GO_TARGETS[go];
  if (!target) return false;
  const nav = document.querySelector(`.nav-btn[data-screen="${target.screen}"]`);
  return !nav?.classList.contains('nav-btn--locked');
}

function goTo(go, player) {
  if (go === 'errands') {
    closeDailyTasks();
    openErrandsSheet(player);
    return;
  }
  const target = GO_TARGETS[go];
  if (target) navigate(target.screen, { player, ...(target.params || {}) });
}

const formatNumber = n => Number(n).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US');

function questHtml(q, factionCrystal, player) {
  const def = QUESTS_BY_ID[q.id];
  if (!def) return '';
  const pct  = q.finished ? 100 : Math.min(100, Math.round((q.progress / q.target) * 100));
  const pips = q.tiers.map((_, i) =>
    `<span class="quest-pip${i < q.tier ? ' quest-pip--done' : ''}${i === q.tier && q.claimable ? ' quest-pip--ready' : ''}"></span>`).join('');

  let action;
  if (q.finished) {
    action = `<span class="quest-done">${T('Complete', 'Выполнено')}</span>`;
  } else if (q.claimable) {
    action = `<button class="quest-btn quest-btn--claim" data-claim="${q.id}">${T('Claim', 'Забрать')}</button>`;
  } else {
    const open = goAvailable(def.go, player);
    action = `<button class="quest-btn" data-go="${def.go}" ${open ? '' : 'disabled'}>${T('Go', 'Вперёд')}</button>`;
  }

  return `
    <div class="quest${q.claimable ? ' quest--ready' : ''}${q.finished ? ' quest--finished' : ''}">
      <div class="quest-head">
        <div class="quest-title">${def.title[lang]}</div>
        <div class="quest-pips" aria-label="${q.tier}/${q.tiers.length}">${pips}</div>
      </div>
      <div class="quest-desc">${def.desc[lang].replace('{n}', formatNumber(q.target))}</div>
      <div class="quest-bar"><span style="width:${pct}%"></span></div>
      <div class="quest-foot">
        <span class="quest-count">${formatNumber(q.progress)} / ${formatNumber(q.target)}</span>
        ${q.finished ? '' : `<span class="quest-rewards">${questRewardHtml(def.rewards[q.tier], factionCrystal)}</span>`}
        ${action}
      </div>
    </div>`;
}

// Ready to claim first, then the closest to done, finished chains last.
function sortQuests(quests) {
  const rank = q => q.finished ? 2 : q.claimable ? 0 : 1;
  return [...quests].sort((a, b) =>
    (rank(a) - rank(b)) || ((b.progress / b.target) - (a.progress / a.target)));
}

function questsBodyHtml(state, player) {
  return `
    <div class="quest-list">${sortQuests(state.quests).map(q => questHtml(q, state.faction_crystal, player)).join('')}</div>`;
}

// What a claim paid, lifted off the button it was claimed from. Positioned on
// <body> rather than inside the list, so the redraw that follows the claim
// cannot take it down mid-flight.
function celebrateClaim(btn, chipsHtml) {
  const rect = btn?.getBoundingClientRect?.();
  if (!rect || !chipsHtml) return;
  const burst = document.createElement('div');
  burst.className = 'claim-burst';
  burst.style.left = `${rect.left + rect.width / 2}px`;
  burst.style.top  = `${rect.top}px`;
  burst.innerHTML = chipsHtml;
  document.body.appendChild(burst);
  btn.closest('.quest, .daily-rewards')?.classList.add('claim-flash');
  setTimeout(() => burst.remove(), 1500);
}

// ── Window ──────────────────────────────────────────────────────────────────

export function openDailyTasks(player, { tab } = {}) {
  closeDailyTasks();
  lang = player?.settings?.language === 'ru' ? 'ru' : 'en';
  if (tab) activeTab = tab;

  const overlay = document.createElement('div');
  overlay.className = 'daily-overlay';
  overlay.innerHTML = `
    <div class="daily-modal" role="dialog" aria-label="Daily tasks">
      <div class="daily-header">
        <div class="daily-tabs" role="tablist">
          <button class="daily-tab" role="tab" data-tab="daily">
            ${T('Daily', 'Сегодня')}<span class="daily-tab-dot"></span>
          </button>
          <button class="daily-tab" role="tab" data-tab="quests">
            ${T('Quests', 'Задания')}<span class="daily-tab-dot"></span>
          </button>
        </div>
        <div class="daily-header-actions">
          <button class="quest-btn quest-btn--claim daily-claim-all" data-claim-all hidden>${T('Claim', 'Забрать')}</button>
          <button class="daily-close" aria-label="Close">✕</button>
        </div>
      </div>
      <div class="daily-list"><p class="modal-empty">…</p></div>
    </div>`;
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  overlay.querySelector('.daily-close').addEventListener('click', closeDailyTasks);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDailyTasks(); });
  overlay.addEventListener('click', e => {
    const btn = e.target.closest('[data-claim-all]');
    if (btn && !btn.disabled) claimAllQuests(btn);
  });

  const list = overlay.querySelector('.daily-list');

  function paintTabs() {
    overlay.querySelectorAll('.daily-tab').forEach(btn => {
      const on = btn.dataset.tab === activeTab;
      btn.classList.toggle('daily-tab--active', on);
      btn.setAttribute('aria-selected', String(on));
    });
    const boot = bootstrapCache.data;
    overlay.querySelector('[data-tab="daily"] .daily-tab-dot')
      .classList.toggle('daily-tab-dot--on', !!boot?.daily?.claimable);
    overlay.querySelector('[data-tab="quests"] .daily-tab-dot')
      .classList.toggle('daily-tab-dot--on', (boot?.quests_claimable || 0) > 0);
    const claimAllBtn = overlay.querySelector('[data-claim-all]');
    claimAllBtn.hidden = activeTab !== 'quests' || !(boot?.quests_claimable > 0);
  }

  overlay.querySelectorAll('.daily-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === activeTab) return;
      activeTab = btn.dataset.tab;
      list.scrollTop = 0;
      paint();
    });
  });

  // Delegated, so a redraw after a claim never has to rebind anything.
  list.addEventListener('click', e => {
    const reward = e.target.closest('.daily-reward');
    if (reward && !reward.disabled) return claimDaily(reward.dataset.reward, reward);
    const claimBtn = e.target.closest('[data-claim]');
    if (claimBtn && !claimBtn.disabled) return claimQuest(claimBtn.dataset.claim, claimBtn);
    const goBtn = e.target.closest('[data-go]');
    if (goBtn && !goBtn.disabled) goTo(goBtn.dataset.go, player);
  });

  // Both tabs draw from the bootstrap payload, which is loaded behind the
  // loading screen — so opening the window and switching tabs never wait on
  // the network. The markup is only swapped when it actually changed, so a
  // background refresh that finds nothing new leaves the list untouched.
  function paint() {
    if (activeOverlay !== overlay) return;
    paintTabs();
    const boot = bootstrapCache.data;
    let html;
    if (activeTab === 'quests') {
      if (!boot?.quests) return;
      html = questsBodyHtml({ quests: boot.quests, faction_crystal: boot.faction_crystal }, player);
    } else {
      if (!boot?.daily) return;
      html = dailyBodyHtml({ ...boot.daily, faction_crystal: boot.faction_crystal });
    }
    if (list.dataset.tab === activeTab && list._html === html) return;
    const scroll = list.scrollTop;
    list.innerHTML = html;
    list._html = html;
    list.dataset.tab = activeTab;
    list.scrollTop = scroll;
  }

  function showError(err) {
    if (activeOverlay !== overlay || list._html) return;
    list.innerHTML = `<p class="modal-empty">${err?.message || T('Failed', 'Не удалось')}</p>`;
  }

  // Gold, crystals and tokens all live in the resource table the strip and the
  // token badges read, so both have to move before the window redraws.
  async function afterClaim() {
    await bootstrapCache.refresh(player.chat_id);
    refreshResourceBar(player).catch(() => {});
    paint();
    refreshDailyButton(player).catch(() => {});
  }

  function claimFailed(err, btn) {
    const pair = ERRORS[err?.code];
    alert(pair ? T(pair[0], pair[1]) : (err?.message || T('Failed', 'Не удалось')));
    btn.disabled = false;
  }

  async function claimDaily(rewardId, btn) {
    btn.disabled = true;
    try {
      await api('/daily/claim', { chat_id: player.chat_id, reward: rewardId });
      const def = DAILY_REWARDS.find(r => r.id === rewardId);
      if (def) {
        celebrateClaim(btn, `<span class="quest-reward">${questIcon(rewardIconHtml(def, bootstrapCache.data?.faction_crystal))}<span>${rewardLabel(def)}</span></span>`);
      }
      await afterClaim();
    } catch (err) {
      claimFailed(err, btn);
    }
  }

  async function claimQuest(questId, btn) {
    btn.disabled = true;
    try {
      const tier = bootstrapCache.data?.quests?.find(q => q.id === questId)?.tier ?? 0;
      await api('/quests/claim', { chat_id: player.chat_id, quest: questId });
      celebrateClaim(btn, questRewardHtml(QUESTS_BY_ID[questId]?.rewards[tier], bootstrapCache.data?.faction_crystal));
      await afterClaim();
    } catch (err) {
      claimFailed(err, btn);
    }
  }

  async function claimAllQuests(btn) {
    btn.disabled = true;
    let claimable;
    try {
      const fresh = await bootstrapCache.refresh(player.chat_id);
      claimable = (fresh?.quests || []).filter(q => q.claimable);
    } catch (err) {
      alert(err?.message || T('Failed to refresh quests.', 'Не удалось обновить задания.'));
      btn.disabled = false;
      return;
    }
    if (!claimable.length) {
      paint();
      return;
    }

    let claimed = 0;
    let failure = null;
    for (const quest of claimable) {
      try {
        await api('/quests/claim', { chat_id: player.chat_id, quest: quest.id });
        claimed++;
      } catch (err) {
        failure = err;
        break;
      }
    }
    if (claimed) {
      celebrateClaim(btn, `<span class="quest-reward">${T(
        `${claimed} quest rewards claimed`,
        `Получено наград за задания: ${claimed}`,
      )}</span>`);
    }
    try {
      await afterClaim();
    } catch (err) {
      failure ||= err;
    }
    if (failure) {
      const pair = ERRORS[failure?.code];
      const reason = pair ? T(pair[0], pair[1]) : (failure?.message || T('Failed', 'Не удалось'));
      alert(T(
        `Claimed ${claimed} of ${claimable.length} quests. ${reason}`,
        `Получено наград за задания: ${claimed} из ${claimable.length}. ${reason}`,
      ));
    }
  }

  // Whatever is cached goes up at once. Then one quiet refresh, because a
  // battle or errand may have moved the counters since the cache was filled;
  // if nothing moved, paint() changes nothing on screen.
  paint();
  const ready = bootstrapCache.data ? Promise.resolve() : bootstrapCache.get(player.chat_id).then(paint);
  ready
    .then(() => bootstrapCache.refresh(player.chat_id))
    .then(() => { paint(); refreshDailyButton(player).catch(() => {}); })
    .catch(showError);
}

export function closeDailyTasks() {
  if (!activeOverlay) return;
  activeOverlay.remove();
  activeOverlay = null;
  for (const fn of [..._closeHandlers]) {
    _closeHandlers.delete(fn);
    try { fn(); } catch {}
  }
}

// The badge: lit while a finished day is still unclaimed or a quest milestone
// is waiting. Reads the bootstrap cache rather than asking, so it costs nothing
// on every navigation.
export async function refreshDailyButton(player) {
  const btn = document.querySelector('.res-bar-daily');
  if (!btn || !player?.chat_id) return;
  try {
    const boot = await bootstrapCache.get(player.chat_id);
    btn.classList.toggle('res-bar-daily--ready', !!boot?.daily?.claimable || (boot?.quests_claimable || 0) > 0);
  } catch {
    // Never let this take the shell down; the button just stays quiet.
  }
}

// Once per session, the window greets a returning player whose day is not
// done — tasks unfinished or the reward still unclaimed. Held back until the
// castle onboarding and the errands intro are behind them, and never opened on
// top of anything else.
let autoOpened = false;
export async function maybeAutoOpenDaily(player) {
  if (autoOpened || activeOverlay || !player?.chat_id) return;
  if (!errandsUnlocked(player) || !isTutorialDone(player, 'errands_intro')) return;
  try {
    const boot = await bootstrapCache.get(player.chat_id);
    if (autoOpened || activeOverlay) return;
    if (!boot?.daily || boot.daily.claimed) { autoOpened = true; return; }
    if (!document.querySelector('#outer-ring')) return;
    if (document.querySelector('.tutorial-overlay, .modal-overlay:not(.hidden)')) return;
    autoOpened = true;
    openDailyTasks(player, { tab: 'daily' });
  } catch {
    // A failed read just means no greeting this time.
  }
}
