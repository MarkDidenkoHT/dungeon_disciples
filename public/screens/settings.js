import { api, navigate, refreshResourceBar, bootstrapCache } from '../api.js';
import { setMusicEnabled } from '../music.js';
import { setSfxEnabled } from '../sfx.js';
import { CONSENT_VERSION, applyAnalyticsConsent } from '../analytics.js';
import { saveLanguageCache } from './loading.js';
import { CRYSTAL_ICONS, GOLD_ICON, openSheet, closeSheet, getSheetBody } from '../utils.js';

// A name goes straight into a value="" attribute, and it is player-supplied.
function escapeAttr(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                          .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
  rememberFormation: { en: 'Remember Formation', ru: 'Запоминать построение' },
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
  nameTitle:       { en: 'Display Name',   ru: 'Отображаемое имя' },
  namePlaceholder: { en: 'Your name',      ru: 'Ваше имя' },
  nameSave:        { en: 'Save',           ru: 'Сохранить' },
  nameSaving:      { en: 'Saving…',        ru: 'Сохраняем…' },
  nameSaved:       { en: 'Name saved',     ru: 'Имя сохранено' },
  nameEmpty:       { en: 'Name cannot be empty', ru: 'Имя не может быть пустым' },
  nameFailed:      { en: 'Failed to save name',  ru: 'Не удалось сохранить имя' },
  promoTitle:       { en: 'Promo Code',      ru: 'Промокод' },
  promoPlaceholder: { en: 'Enter a code',    ru: 'Введите код' },
  promoRedeem:      { en: 'Redeem',          ru: 'Активировать' },
  promoRedeeming:   { en: 'Checking…',       ru: 'Проверяем…' },
  promoOk:          { en: 'Rewards claimed', ru: 'Награды получены' },
  promoXp:          { en: 'XP to every unit', ru: 'опыта каждому бойцу' },
  promoGotIt:       { en: 'Good',            ru: 'Отлично' },
  promoLeveled:     { en: n => `${n} unit${n > 1 ? 's' : ''} advanced a tier`,
                      ru: n => `Бойцов повысило ранг: ${n}` },
};

// Server codes get their own line; anything else falls back to the message the
// server sent, so a new failure mode is never swallowed into a blank box.
const PROMO_ERRORS = {
  promo_unknown: { en: 'No such code',        ru: 'Такого кода нет' },
  promo_used:    { en: 'Already used',        ru: 'Код уже использован' },
  promo_empty:   { en: 'Enter a code first',  ru: 'Сначала введите код' },
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
  // Default OFF: it silently pre-fills the grid, and a player who has not asked
  // for that should see the board they left it in.
  const rememberFormation    = player?.settings?.remember_formation === true;
  const languageLabel        = { en: 'English', ru: 'Русский' }[L] || L;

  // Seeded from Telegram at first login and editable from here. Shown as a
  // plain text field rather than a settings-row toggle because it is the only
  // setting whose value is typed.
  const currentName = player?.username ?? '';

  root.innerHTML = `
    <div class="screen screen-settings">
      <main class="settings-main">
        <!-- Borrows the promo box's layout: an input, a button beside it and a
             fixed-height message line. Same shape, so no styles of its own. -->
        <div class="promo-box">
          <div class="settings-danger-title">${UI_TEXT.nameTitle[L]}</div>
          <div class="promo-box-row">
            <input class="promo-box-input" id="username-input" type="text"
                   maxlength="24" autocomplete="off" spellcheck="false"
                   placeholder="${UI_TEXT.namePlaceholder[L]}"
                   value="${escapeAttr(currentName)}">
            <button class="promo-box-btn" id="username-btn">${UI_TEXT.nameSave[L]}</button>
          </div>
          <div class="promo-box-msg" id="username-msg"></div>
        </div>

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
            <span class="settings-label">${UI_TEXT.rememberFormation[L]}</span>
            <button class="settings-toggle ${rememberFormation ? 'settings-toggle--on' : ''}" id="toggle-formation">
              ${rememberFormation ? UI_TEXT.on[L] : UI_TEXT.off[L]}
            </button>
          </div>
          <div class="settings-row">
            <span class="settings-label">${UI_TEXT.language[L]}</span>
            <button class="settings-toggle settings-toggle--on" id="toggle-language">
              ${languageLabel}
            </button>
          </div>
        </div>

        <!-- Its own element, not a settings-section: no bordered card, no label
             line, and the placeholder names the field. The message line below
             has a FIXED height so redeeming cannot grow the block and push the
             rows above it off screen. -->
        <div class="promo-box">
          <div class="promo-box-row">
            <input class="promo-box-input" id="promo-input" type="text"
                   autocomplete="off" autocapitalize="none" spellcheck="false"
                   placeholder="${UI_TEXT.promoPlaceholder[L]}">
            <button class="promo-box-btn" id="promo-btn">${UI_TEXT.promoRedeem[L]}</button>
          </div>
          <div class="promo-box-msg" id="promo-msg"></div>
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

  // ── Promo code ────────────────────────────────────────────────────────────
  // The server is the authority on everything: whether the code exists, whether
  // it has been used, and what it pays. This only reports the answer.
  const nameInput = root.querySelector('#username-input');
  const nameBtn   = root.querySelector('#username-btn');
  const nameMsg   = root.querySelector('#username-msg');

  async function saveUsername() {
    const value = nameInput.value.replace(/\s+/g, ' ').trim();
    const showMsg = (text, ok) => {
      nameMsg.textContent = text;
      nameMsg.className = `promo-box-msg ${ok ? 'promo-box-msg--ok' : 'promo-box-msg--err'}`;
    };
    if (!value) { showMsg(UI_TEXT.nameEmpty[L], false); return; }
    // Nothing to save, and no point telling the server so.
    if (value === (player.username ?? '')) { showMsg('', true); return; }

    nameBtn.disabled = true;
    nameBtn.textContent = UI_TEXT.nameSaving[L];
    try {
      const updated = await api('/player/username', {
        player_id: player.id,
        chat_id:   player.chat_id,
        username:  value,
      });
      // The server trims and caps, so take ITS answer rather than assuming the
      // field holds what was typed.
      player.username = updated.username;
      nameInput.value = updated.username;
      showMsg(UI_TEXT.nameSaved[L], true);
    } catch (err) {
      showMsg(err.message || UI_TEXT.nameFailed[L], false);
    } finally {
      nameBtn.disabled = false;
      nameBtn.textContent = UI_TEXT.nameSave[L];
    }
  }

  nameBtn.addEventListener('click', saveUsername);
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveUsername(); });

  const promoBtn   = root.querySelector('#promo-btn');
  const promoInput = root.querySelector('#promo-input');
  const promoMsg   = root.querySelector('#promo-msg');

  const showPromoMsg = (text, ok) => {
    promoMsg.textContent = text;
    promoMsg.className = `promo-box-msg ${ok ? 'promo-box-msg--ok' : 'promo-box-msg--err'}`;
  };

  // What the code actually paid, with the same resource icons the rest of the
  // game uses. One chip per reward, wrapping in a grid — six crystal types read
  // at a glance here where they could not as a comma list.
  function openRewardModal(res) {
    const g = res.granted || {};
    const chips = [];

    if (g.gold) {
      chips.push(`<span class="promo-reward-chip">${GOLD_ICON}<span>+${g.gold}</span></span>`);
    }
    // Fixed order, not object order, so the same promo always reads the same way.
    for (const type of ['Crystals_Life', 'Crystals_Fire', 'Crystals_Death',
                        'Crystals_Frost', 'Crystals_Nature', 'Crystals_Air']) {
      const amt = g.crystals?.[type];
      if (amt) chips.push(`<span class="promo-reward-chip" title="${type.replace('Crystals_', '')}">${
        CRYSTAL_ICONS[type] || ''}<span>+${amt}</span></span>`);
    }
    for (const [id, amt] of Object.entries(g.trophies || {})) {
      chips.push(`<span class="promo-reward-chip promo-reward-chip--wide" title="${id.replace(/_/g, ' ')}">${
        id.replace(/_/g, ' ')} <span>+${amt}</span></span>`);
    }

    const xpRow = g.roster_xp
      ? `<div class="promo-reward-xp">+${g.roster_xp} ${UI_TEXT.promoXp[L]}</div>` : '';
    // Only when the promo's XP actually pushed someone over their threshold.
    const levels = (res.auto_level_ups || []).length;
    const lvlRow = levels
      ? `<div class="promo-reward-levels">${UI_TEXT.promoLeveled[L](levels)}</div>` : '';

    openSheet(res.name || UI_TEXT.promoTitle[L], `
      <div class="promo-reward">
        <div class="promo-reward-title">${UI_TEXT.promoOk[L]}</div>
        <div class="promo-reward-chips">${chips.join('')}</div>
        ${xpRow}${lvlRow}
        <button class="promo-reward-btn" id="promo-reward-ok">${UI_TEXT.promoGotIt[L]}</button>
      </div>`);
    getSheetBody()?.querySelector('#promo-reward-ok')?.addEventListener('click', closeSheet);
  }

  async function redeemPromo() {
    const code = promoInput.value.trim();
    if (!code) { showPromoMsg(PROMO_ERRORS.promo_empty[L], false); return; }

    promoBtn.disabled = true;
    promoBtn.textContent = UI_TEXT.promoRedeeming[L];
    try {
      const res = await api('/player/promo', { chat_id: player.chat_id, code });
      // A summary line could not carry six crystal types legibly, so the reward
      // goes in a modal with the real icons — the same chips the errand payout
      // screen uses. The inline line stays for ERRORS only, where one short
      // sentence is the right amount of noise.
      promoInput.value = '';
      showPromoMsg('', true);
      openRewardModal(res);
      // BOTH halves of the reward. The bar carries crystals and gold; the roster
      // XP lives in the bootstrap payload, so without refreshing that the castle
      // and unit sheets would keep showing pre-promo XP until the next reload.
      await Promise.all([
        refreshResourceBar(player).catch(() => {}),
        bootstrapCache.refresh(player.chat_id).catch(() => {}),
      ]);
    } catch (err) {
      showPromoMsg(PROMO_ERRORS[err?.code]?.[L] || err.message || UI_TEXT.saveFailed[L], false);
    } finally {
      promoBtn.disabled = false;
      promoBtn.textContent = UI_TEXT.promoRedeem[L];
    }
  }

  promoBtn.addEventListener('click', redeemPromo);
  promoInput.addEventListener('keydown', e => { if (e.key === 'Enter') redeemPromo(); });

  // Server-persisted like the other toggles, so the preference follows the
  // account. The formation ITSELF stays in localStorage — see battle-prep.js.
  const formationBtn = root.querySelector('#toggle-formation');
  formationBtn.addEventListener('click', async () => {
    const next = player.settings?.remember_formation !== true;
    formationBtn.textContent = next ? UI_TEXT.on[L] : UI_TEXT.off[L];
    formationBtn.classList.toggle('settings-toggle--on', next);
    try {
      const updated = await api('/player/settings', {
        player_id: player.id,
        chat_id:   player.chat_id,
        settings:  { remember_formation: next },
      });
      player.settings = updated.settings;
    } catch (err) {
      formationBtn.textContent = !next ? UI_TEXT.on[L] : UI_TEXT.off[L];
      formationBtn.classList.toggle('settings-toggle--on', !next);
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