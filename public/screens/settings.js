export function renderSettings(root, { player }) {
  const sfxEnabled   = localStorage.getItem('sfx_enabled')   !== 'false';
  const musicEnabled = localStorage.getItem('music_enabled') !== 'false';

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
        </div>
      </main>
    </div>
  `;

  root.querySelectorAll('.settings-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const key     = btn.dataset.key;
      const current = localStorage.getItem(key) !== 'false';
      const next    = !current;
      localStorage.setItem(key, String(next));
      btn.textContent = next ? 'On' : 'Off';
      btn.classList.toggle('settings-toggle--on', next);
    });
  });
}