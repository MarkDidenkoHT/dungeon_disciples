import { api, bootstrapCache, refreshResourceBar } from './api.js';
import { CRYSTAL_ICONS, GOLD_ICON } from './utils.js';
import { DAILY_TASKS, DAILY_REWARDS } from '../data/daily_tasks.js';

let lang = 'en';
const T = (en, ru) => (lang === 'ru' ? ru : en);

const ERRORS = {
  daily_claimed:    ['Already claimed today.',   'Награда за сегодня уже получена.'],
  daily_incomplete: ['Finish all three first.',  'Сначала выполните все три задания.'],
  daily_bad_reward: ['Pick one of the rewards.', 'Выберите одну из наград.'],
};

let activeOverlay = null;

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

// The reward's art. Gold and crystals have real icons and use them; the crystal
// one is drawn in the player's OWN element, which the server names (see /daily)
// because the faction map is CommonJS and cannot be imported here. The tome has
// no art anywhere in the game yet, so it keeps its glyph.
function rewardIconHtml(reward, factionCrystal) {
  if (reward.resources?.Gold) return GOLD_ICON;
  if (reward.id === 'crystals') return CRYSTAL_ICONS[factionCrystal] || CRYSTAL_ICONS.Crystals_Life;
  return reward.icon;
}

function rewardHtml(reward, locked, factionCrystal) {
  return `
    <button class="daily-reward" data-reward="${reward.id}" ${locked ? 'disabled' : ''}>
      <span class="daily-reward-icon">${rewardIconHtml(reward, factionCrystal)}</span>
      <span class="daily-reward-label">${reward.label[lang]}</span>
    </button>`;
}

function bodyHtml(state) {
  const tasks = state.tasks.map(taskHtml).join('');

  // Three states for the reward strip: locked while the day is unfinished,
  // pickable once it is, and a single card naming what was taken after that.
  if (state.claimed) {
    const taken = DAILY_REWARDS.find(r => r.id === state.reward);
    return `
      <div class="daily-tasks">${tasks}</div>
      <div class="daily-claimed">
        <span class="daily-reward-icon">${taken ? rewardIconHtml(taken, state.faction_crystal) : '✓'}</span>
        <span>${T('Claimed', 'Получено')}${taken ? ` — ${taken.label[lang]}` : ''}</span>
        <span class="daily-claimed-note">${T('Come back tomorrow.', 'Возвращайтесь завтра.')}</span>
      </div>`;
  }
  return `
    <div class="daily-tasks">${tasks}</div>
    <div class="daily-section-label">
      ${state.complete
        ? T('Choose your reward', 'Выберите награду')
        : T('Finish all three to choose a reward', 'Выполните все три, чтобы выбрать награду')}
    </div>
    <div class="daily-rewards">
      ${DAILY_REWARDS.map(r => rewardHtml(r, !state.complete, state.faction_crystal)).join('')}
    </div>`;
}

export function openDailyTasks(player) {
  closeDailyTasks();
  lang = player?.settings?.language === 'ru' ? 'ru' : 'en';

  const overlay = document.createElement('div');
  overlay.className = 'daily-overlay';
  overlay.innerHTML = `
    <div class="daily-modal" role="dialog" aria-label="Daily tasks">
      <div class="daily-header">
        <span class="daily-header-title">${T('Daily Tasks', 'Ежедневные задания')}</span>
        <button class="daily-close" aria-label="Close">✕</button>
      </div>
      <div class="daily-list"><p class="modal-empty">…</p></div>
    </div>`;
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  overlay.querySelector('.daily-close').addEventListener('click', closeDailyTasks);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDailyTasks(); });

  const list = overlay.querySelector('.daily-list');

  // Delegated, so a redraw after a claim never has to rebind anything.
  list.addEventListener('click', e => {
    const btn = e.target.closest('.daily-reward');
    if (btn && !btn.disabled) claim(btn.dataset.reward, btn);
  });

  async function load() {
    // A deliberate open is worth a round-trip: the player is looking straight at
    // these numbers, and the badge on the button is the thing that reads cache.
    const state = await api(`/daily?chat_id=${player.chat_id}`);
    if (activeOverlay !== overlay) return;
    list.innerHTML = bodyHtml(state);
  }

  async function claim(rewardId, btn) {
    btn.disabled = true;
    try {
      await api('/daily/claim', { chat_id: player.chat_id, reward: rewardId });
      // Gold, crystals and the tome all live in the resource table the strip and
      // the token badges read, so both have to move before the modal redraws.
      await bootstrapCache.refresh(player.chat_id);
      refreshResourceBar(player).catch(() => {});
      await load();
      refreshDailyButton(player).catch(() => {});
    } catch (err) {
      const pair = ERRORS[err?.code];
      alert(pair ? T(pair[0], pair[1]) : (err?.message || T('Failed', 'Не удалось')));
      btn.disabled = false;
    }
  }

  load().catch(err => {
    if (activeOverlay !== overlay) return;
    list.innerHTML = `<p class="modal-empty">${err?.message || T('Failed', 'Не удалось')}</p>`;
  });
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

// The badge: lit while a finished day is still unclaimed. Reads the bootstrap
// cache rather than asking, so it costs nothing on every navigation.
export async function refreshDailyButton(player) {
  const btn = document.querySelector('.res-bar-daily');
  if (!btn || !player?.chat_id) return;
  try {
    const boot = await bootstrapCache.get(player.chat_id);
    btn.classList.toggle('res-bar-daily--ready', !!boot?.daily?.claimable);
  } catch {
    // Never let this take the shell down; the button just stays quiet.
  }
}
