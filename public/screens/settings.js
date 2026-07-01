import { api } from '../api.js';

export function renderSettings(root, { player }) {
  const sfxEnabled          = localStorage.getItem('sfx_enabled')   !== 'false';
  const musicEnabled        = localStorage.getItem('music_enabled') !== 'false';
  const notificationsEnabled = player?.settings?.notifications !== false;
  const language            = player?.settings?.language || 'en';
  const languageLabel       = { en: 'English', ru: 'Russian' }[language] || language;

  root.innerHTML = `
    <div class="screen screen-settings">
      <main class="settings-main">
        <div class="settings-header">Settings</div>

        <div class="settings-section">
          <div class="settings-row">
            <span class="settings-label">Sound Effects</span>
            <button class="settings-toggle ${sfxEnabled ? 'settings-toggle--on' : ''}" id="toggle-sfx" data-key="sfx_enabled">
              ${sfxEnabled ? 'On' : 'Off'}
            </button>
          </div>
          <div class="settings-row">
            <span class="settings-label">Music</span>
            <button class="settings-toggle ${musicEnabled ? 'settings-toggle--on' : ''}" id="toggle-music" data-key="music_enabled">
              ${musicEnabled ? 'On' : 'Off'}
            </button>
          </div>
          <div class="settings-row">
            <span class="settings-label">Notifications</span>
            <button class="settings-toggle ${notificationsEnabled ? 'settings-toggle--on' : ''}" id="toggle-notifications">
              ${notificationsEnabled ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-row settings-row--info">
            <span class="settings-label">Player</span>
            <span class="settings-value">${player?.name ?? '—'}</span>
          </div>
          <div class="settings-row settings-row--info">
            <span class="settings-label">Faction</span>
            <span class="settings-value">${player?.faction?.replace(/_/g, ' ') ?? '—'}</span>
          </div>
          <div class="settings-row settings-row--info">
            <span class="settings-label">Language</span>
            <span class="settings-value">${languageLabel}</span>
          </div>
        </div>
      </main>
    </div>
  `;

  root.querySelectorAll('.settings-toggle[data-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key     = btn.dataset.key;
      const current = localStorage.getItem(key) !== 'false';
      const next    = !current;
      localStorage.setItem(key, String(next));
      btn.textContent = next ? 'On' : 'Off';
      btn.classList.toggle('settings-toggle--on', next);
    });
  });

  const notifBtn = root.querySelector('#toggle-notifications');
  notifBtn.addEventListener('click', async () => {
    const next = player.settings?.notifications === false;
    notifBtn.textContent = next ? 'On' : 'Off';
    notifBtn.classList.toggle('settings-toggle--on', next);
    try {
      const updated = await api('/player/settings', {
        player_id: player.id,
        chat_id:   player.chat_id,
        settings:  { notifications: next },
      });
      player.settings = updated.settings;
    } catch (err) {
      notifBtn.textContent = !next ? 'On' : 'Off';
      notifBtn.classList.toggle('settings-toggle--on', !next);
      alert(err.message || 'Failed to save setting');
    }
  });
}