import { api, bootstrapCache, refreshResourceBar } from './api.js';
import { openSheet, getSheetBody } from './utils.js';
import { DAILY_TASKS, DAILY_REWARDS } from '../data/daily_tasks.js';

let lang = 'en';
const T = (en, ru) => (lang === 'ru' ? ru : en);

const ERRORS = {
  daily_claimed:    ['Already claimed today.',       'Награда за сегодня уже получена.'],
  daily_incomplete: ['Finish all three first.',      'Сначала выполните все три задания.'],
  daily_bad_reward: ['Pick one of the rewards.',     'Выберите одну из наград.'],
};

function taskRowHtml(task) {
  const def  = DAILY_TASKS.find(t => t.id === task.id);
  if (!def) return '';
  const done = task.done;
  return `
    <div class="daily-task${done ? ' daily-task--done' : ''}">
      <span class="daily-check">${done ? '✓' : ''}</span>
      <div class="daily-task-body">
        <div class="daily-task-title">${def.title[lang]}</div>
        <div class="daily-task-desc">${def.desc[lang]}</div>
      </div>
      <span class="daily-progress">${task.progress}/${task.target}</span>
    </div>`;
}

function rewardCardHtml(reward, locked) {
  return `
    <button class="daily-reward" data-reward="${reward.id}" ${locked ? 'disabled' : ''}>
      <span class="daily-reward-icon">${reward.icon}</span>
      <span class="daily-reward-label">${reward.label[lang]}</span>
    </button>`;
}

export async function openDailySheet(player) {
  lang = player?.settings?.language === 'ru' ? 'ru' : 'en';
  openSheet(T('Daily Tasks', 'Ежедневные задания'), `<p class="modal-empty">…</p>`);

  let state = null;

  async function load() {
    // A deliberate open is worth a round-trip: the player is looking straight at
    // these numbers, and the badge on the button is the thing that reads cache.
    state = await api(`/daily?chat_id=${player.chat_id}`);
    render();
  }

  async function claim(rewardId, btn) {
    btn.disabled = true;
    try {
      await api('/daily/claim', { chat_id: player.chat_id, reward: rewardId });
      // Gold, crystals and the tome all live in the resource table the strip and
      // the token badges read, so both have to move before the sheet redraws.
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

  function render() {
    const body = getSheetBody();
    if (!body || !state) return;

    const tasksHtml = state.tasks.map(taskRowHtml).join('');

    // Three states for the reward strip: locked while the day is unfinished,
    // pickable once it is, and a single claimed card once one has been taken.
    let rewardHtml;
    if (state.claimed) {
      const taken = DAILY_REWARDS.find(r => r.id === state.reward);
      rewardHtml = `
        <div class="daily-claimed">
          <span class="daily-reward-icon">${taken?.icon ?? '✓'}</span>
          <span>${T('Claimed', 'Получено')}${taken ? ` — ${taken.label[lang]}` : ''}</span>
          <span class="daily-claimed-note">${T('Come back tomorrow.', 'Возвращайтесь завтра.')}</span>
        </div>`;
    } else {
      rewardHtml = `
        <div class="daily-section-label">
          ${state.complete
            ? T('Choose your reward', 'Выберите награду')
            : T('Finish all three to choose a reward', 'Выполните все три, чтобы выбрать награду')}
        </div>
        <div class="daily-rewards">
          ${DAILY_REWARDS.map(r => rewardCardHtml(r, !state.complete)).join('')}
        </div>`;
    }

    body.innerHTML = `
      <div class="daily-sheet">
        <div class="daily-tasks">${tasksHtml}</div>
        ${rewardHtml}
      </div>`;

    body.querySelectorAll('.daily-reward').forEach(btn => {
      btn.addEventListener('click', () => claim(btn.dataset.reward, btn));
    });
  }

  try {
    await load();
  } catch (err) {
    const body = getSheetBody();
    if (body) body.innerHTML = `<p class="modal-empty">${err?.message || T('Failed', 'Не удалось')}</p>`;
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
