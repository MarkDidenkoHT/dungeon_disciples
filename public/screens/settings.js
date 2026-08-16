import { api, navigate } from '../api.js';
import { setMusicEnabled } from '../music.js';
import { setSfxEnabled } from '../sfx.js';
import { CONSENT_VERSION, applyAnalyticsConsent } from '../analytics.js';
import { saveLanguageCache } from './loading.js';

export function lang(player) {
  return player?.settings?.language === 'ru' ? 'ru' : 'en';
}

const UI_TEXT = {
  header:        { en: 'Settings', ru: 'Настройки' },
  sfx:           { en: 'Sound Effects', ru: 'Звуковые эффекты' },
  music:         { en: 'Music', ru: 'Музыка' },
  notifications: { en: 'Notifications', ru: 'Уведомления' },
  barks:         { en: 'Combat Barks', ru: 'Реплики в бою' },
  // The welcome screen promises this can be changed later, so it has to be here.
  analytics:     { en: 'Usage Analytics', ru: 'Аналитика использования' },
  on:            { en: 'On', ru: 'Вкл' },
  off:           { en: 'Off', ru: 'Выкл' },
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
  saveFailed:  { en: 'Failed to save setting', ru: 'Не удалось сохранить настройку' },
};

export function renderSettings(root, { player }) {
  const L = lang(player);

  // Read from the same place sfx.js reads it (initSfx). It used to come from
  // localStorage while playback checked player.settings, so the two could not
  // agree no matter which way the button went.
  const sfxEnabled           = player?.settings?.sfx_enabled !== false;
  const musicEnabled = player?.settings?.music_enabled !== false;
  const notificationsEnabled = player?.settings?.notifications !== false;
  const barksEnabled         = player?.settings?.barks_enabled !== false;
  // Reads the column, not a setting — consent is stored separately so it can
  // carry its own timestamp and the version of the notice that was agreed to.
  const analyticsOn          = player?.analytics_consent === true;
  const languageLabel        = { en: 'English', ru: 'Русский' }[L] || L;

  root.innerHTML = `
    <div class="screen screen-settings">
      <main class="settings-main">
        <div class="settings-header">${UI_TEXT.header[L]}</div>

        <div class="settings-section">
          <div class="settings-row">
            <span class="settings-label">${UI_TEXT.sfx[L]}</span>
            <button class="settings-toggle ${sfxEnabled ? 'settings-toggle--on' : ''}" id="toggle-sfx">
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
            <span class="settings-label">${UI_TEXT.analytics[L]}</span>
            <button class="settings-toggle ${analyticsOn ? 'settings-toggle--on' : ''}" id="toggle-analytics">
              ${analyticsOn ? UI_TEXT.on[L] : UI_TEXT.off[L]}
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

        <div class="settings-section settings-section--danger">
          <div class="settings-danger-title">${UI_TEXT.dangerZone[L]}</div>
          <button class="settings-reset-btn" id="reset-progress-btn">${UI_TEXT.resetBtn[L]}</button>
        </div>
      </main>
    </div>
  `;

  const sfxBtn = root.querySelector('#toggle-sfx');
  sfxBtn.addEventListener('click', async () => {
    const next = player.settings?.sfx_enabled === false;
    sfxBtn.textContent = next ? UI_TEXT.on[L] : UI_TEXT.off[L];
    sfxBtn.classList.toggle('settings-toggle--on', next);
    setSfxEnabled(next);
    try {
      const updated = await api('/player/settings', {
        player_id: player.id,
        chat_id:   player.chat_id,
        settings:  { sfx_enabled: next },
      });
      player.settings = updated.settings;
    } catch (err) {
      sfxBtn.textContent = !next ? UI_TEXT.on[L] : UI_TEXT.off[L];
      sfxBtn.classList.toggle('settings-toggle--on', !next);
      setSfxEnabled(!next);
      alert(err.message || UI_TEXT.saveFailed[L]);
    }
  });

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
      alert(err.message || UI_TEXT.saveFailed[L]);
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
      alert(err.message || UI_TEXT.saveFailed[L]);
    }
  });

  // Turning this off stops Clarity for the rest of the session AND clears what a
  // previously-accepted session left on the device, so "off" means off now, not
  // off next launch.
  const analyticsBtn = root.querySelector('#toggle-analytics');
  analyticsBtn.addEventListener('click', async () => {
    const next = player.analytics_consent !== true;
    analyticsBtn.textContent = next ? UI_TEXT.on[L] : UI_TEXT.off[L];
    analyticsBtn.classList.toggle('settings-toggle--on', next);
    try {
      const res = await api('/player/consent', {
        chat_id: player.chat_id,
        analytics_consent: next,
        consent_version: CONSENT_VERSION,
      });
      if (res?.player) {
        player.analytics_consent = res.player.analytics_consent;
        player.consent_version   = res.player.consent_version;
      }
      applyAnalyticsConsent(player);
    } catch (err) {
      analyticsBtn.textContent = !next ? UI_TEXT.on[L] : UI_TEXT.off[L];
      analyticsBtn.classList.toggle('settings-toggle--on', !next);
      alert(err.message || UI_TEXT.saveFailed[L]);
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
      alert(err.message || UI_TEXT.saveFailed[L]);
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
      saveLanguageCache(next);
      navigate('settings', { player });
    } catch (err) {
      langBtn.disabled = false;
      alert(err.message || UI_TEXT.saveFailed[L]);
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