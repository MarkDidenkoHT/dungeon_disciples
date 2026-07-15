import { api, navigate } from '../api.js';
import { setMusicEnabled } from '../music.js';

export function lang(player) {
  return player?.settings?.language === 'ru' ? 'ru' : 'en';
}

const UI_TEXT = {
  header:        { en: 'Settings', ru: 'Настройки' },
  sfx:           { en: 'Sound Effects', ru: 'Звуковые эффекты' },
  music:         { en: 'Music', ru: 'Музыка' },
  notifications: { en: 'Notifications', ru: 'Уведомления' },
  barks:         { en: 'Combat Barks', ru: 'Реплики в бою' },
  on:            { en: 'On', ru: 'Вкл' },
  off:           { en: 'Off', ru: 'Выкл' },
  player:        { en: 'Player', ru: 'Игрок' },
  faction:       { en: 'Faction', ru: 'Фракция' },
  language:      { en: 'Language', ru: 'Язык' },
  dangerZone:    { en: 'Danger Zone', ru: 'Опасная зона' },
  resetBtn:       { en: 'Reset Progress', ru: 'Сбросить прогресс' },
  resetConfirmText: {
    en: 'This will permanently delete your faction, hero, units, buildings, and resources. This cannot be undone. Are you sure?',
    ru: 'Это безвозвратно удалит вашу фракцию, героя, юнитов, здания и ресурсы. Это действие невозможно отменить. Вы уверены?',
  },
  resetCancel: { en: 'Cancel', ru: 'Отмена' },
  resetConfirm: { en: 'Reset Everything', ru: 'Сбросить всё' },
  resetting:   { en: 'Resetting…', ru: 'Сброс…' },
  resetFailed: { en: 'Failed to reset progress', ru: 'Не удалось сбросить прогресс' },
};

export function renderSettings(root, { player }) {
  const L = lang(player);

  const sfxEnabled           = localStorage.getItem('sfx_enabled')   !== 'false';
  const musicEnabled = player?.settings?.music_enabled !== false;
  const notificationsEnabled = player?.settings?.notifications !== false;
  const barksEnabled         = player?.settings?.barks_enabled !== false;
  const languageLabel        = { en: 'English', ru: 'Русский' }[L] || L;
  

  root.innerHTML = `
    <div class="screen screen-settings">
      <main class="settings-main">
        <div class="settings-header">${UI_TEXT.header[L]}</div>

        <div class="settings-section">
          <div class="settings-row">
            <span class="settings-label">${UI_TEXT.sfx[L]}</span>
            <button class="settings-toggle ${sfxEnabled ? 'settings-toggle--on' : ''}" id="toggle-sfx" data-key="sfx_enabled">
              ${sfxEnabled ? UI_TEXT.on[L] : UI_TEXT.off[L]}
            </button>
          </div>
          <div class="settings-row">
            <span class="settings-label">${UI_TEXT.music[L]}</span>
            <button class="settings-toggle ${musicEnabled ? 'settings-toggle--on' : ''}" id="toggle-music">
              ${musicEnabled ? UI_TEXT.on[L] : UI_TEXT.off[L]}
            </button>
          </div>
          <div class="settings-row">
            <span class="settings-label">${UI_TEXT.notifications[L]}</span>
            <button class="settings-toggle ${notificationsEnabled ? 'settings-toggle--on' : ''}" id="toggle-notifications">
              ${notificationsEnabled ? UI_TEXT.on[L] : UI_TEXT.off[L]}
            </button>
          </div>
          <div class="settings-row">
            <span class="settings-label">${UI_TEXT.barks[L]}</span>
            <button class="settings-toggle ${barksEnabled ? 'settings-toggle--on' : ''}" id="toggle-barks">
              ${barksEnabled ? UI_TEXT.on[L] : UI_TEXT.off[L]}
            </button>
          </div>
          <div class="settings-row">
            <span class="settings-label">${UI_TEXT.language[L]}</span>
            <button class="settings-toggle settings-toggle--on" id="toggle-language">
              ${languageLabel}
            </button>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-row settings-row--info">
            <span class="settings-label">${UI_TEXT.player[L]}</span>
            <span class="settings-value">${player?.name ?? '—'}</span>
          </div>
          <div class="settings-row settings-row--info">
            <span class="settings-label">${UI_TEXT.faction[L]}</span>
            <span class="settings-value">${player?.faction?.replace(/_/g, ' ') ?? '—'}</span>
          </div>
        </div>

        <div class="settings-section settings-section--danger">
          <div class="settings-danger-title">${UI_TEXT.dangerZone[L]}</div>
          <button class="settings-reset-btn" id="reset-progress-btn">${UI_TEXT.resetBtn[L]}</button>
        </div>
      </main>
    </div>
  `;

  // root.querySelectorAll('.settings-toggle[data-key]').forEach(btn => {
  //   btn.addEventListener('click', () => {
  //     const key     = btn.dataset.key;
  //     const current = localStorage.getItem(key) !== 'false';
  //     const next    = !current;
  //     localStorage.setItem(key, String(next));
  //     btn.textContent = next ? UI_TEXT.on[L] : UI_TEXT.off[L];
  //     btn.classList.toggle('settings-toggle--on', next);
  //   });
  // });

  const musicBtn = root.querySelector('#toggle-music');
  musicBtn.addEventListener('click', async () => {
    const next = player.settings?.music_enabled === false;
    musicBtn.textContent = next ? UI_TEXT.on[L] : UI_TEXT.off[L];
    musicBtn.classList.toggle('settings-toggle--on', next);
    setMusicEnabled(next);
    try {
      const updated = await api('/player/settings', {
        player_id: player.id,
        chat_id:   player.chat_id,
        settings:  { music_enabled: next },
      });
      player.settings = updated.settings;
    } catch (err) {
      musicBtn.textContent = !next ? UI_TEXT.on[L] : UI_TEXT.off[L];
      musicBtn.classList.toggle('settings-toggle--on', !next);
      setMusicEnabled(!next);
      alert(err.message || 'Failed to save setting');
    }
  });

  const notifBtn = root.querySelector('#toggle-notifications');
  notifBtn.addEventListener('click', async () => {
    const next = player.settings?.notifications === false;
    notifBtn.textContent = next ? UI_TEXT.on[L] : UI_TEXT.off[L];
    notifBtn.classList.toggle('settings-toggle--on', next);
    try {
      const updated = await api('/player/settings', {
        player_id: player.id,
        chat_id:   player.chat_id,
        settings:  { notifications: next },
      });
      player.settings = updated.settings;
    } catch (err) {
      notifBtn.textContent = !next ? UI_TEXT.on[L] : UI_TEXT.off[L];
      notifBtn.classList.toggle('settings-toggle--on', !next);
      alert(err.message || 'Failed to save setting');
    }
  });

  const barksBtn = root.querySelector('#toggle-barks');
  barksBtn.addEventListener('click', async () => {
    const next = player.settings?.barks_enabled === false;
    barksBtn.textContent = next ? UI_TEXT.on[L] : UI_TEXT.off[L];
    barksBtn.classList.toggle('settings-toggle--on', next);
    try {
      const updated = await api('/player/settings', {
        player_id: player.id,
        chat_id:   player.chat_id,
        settings:  { barks_enabled: next },
      });
      player.settings = updated.settings;
    } catch (err) {
      barksBtn.textContent = !next ? UI_TEXT.on[L] : UI_TEXT.off[L];
      barksBtn.classList.toggle('settings-toggle--on', !next);
      alert(err.message || 'Failed to save setting');
    }
  });

  const langBtn = root.querySelector('#toggle-language');
  langBtn.addEventListener('click', async () => {
    const next = L === 'ru' ? 'en' : 'ru';
    langBtn.disabled = true;
    try {
      const updated = await api('/player/settings', {
        player_id: player.id,
        chat_id:   player.chat_id,
        settings:  { language: next },
      });
      player.settings = updated.settings;
      navigate('settings', { player });
    } catch (err) {
      langBtn.disabled = false;
      alert(err.message || 'Failed to save setting');
    }
  });

  root.querySelector('#reset-progress-btn').addEventListener('click', () => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal">
        <div class="confirm-modal-text">${UI_TEXT.resetConfirmText[L]}</div>
        <div class="confirm-modal-actions">
          <button class="confirm-modal-btn confirm-modal-btn--cancel">${UI_TEXT.resetCancel[L]}</button>
          <button class="confirm-modal-btn confirm-modal-btn--confirm confirm-modal-btn--danger">${UI_TEXT.resetConfirm[L]}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('.confirm-modal-btn--cancel').addEventListener('click', () => overlay.remove());

    overlay.querySelector('.confirm-modal-btn--confirm').addEventListener('click', async () => {
      const confirmBtn = overlay.querySelector('.confirm-modal-btn--confirm');
      confirmBtn.disabled = true;
      confirmBtn.textContent = UI_TEXT.resetting[L];
      try {
        const result = await api('/player/reset', {
          player_id: player.id,
          chat_id:   player.chat_id,
        });
        overlay.remove();
        navigate('register', { player: result.player });
      } catch (err) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = UI_TEXT.resetConfirm[L];
        alert(err.message || UI_TEXT.resetFailed[L]);
      }
    });
  });
}