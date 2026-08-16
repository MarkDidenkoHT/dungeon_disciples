// The first screen anyone sees, before registration.
//
// It does two jobs that both have to happen before the game starts:
//
//   1. LANGUAGE. Telegram hands us `language_code`, which reports `ru` for a
//      great many people who would rather read English — game vocabulary is
//      more consistent there. Until now that guess was final and unreviewable
//      until the settings screen, several screens deep.
//   2. CONSENT. We put a persistent analytics identifier on the device, which
//      the player has to actually agree to. Declining is a real option and does
//      not restrict the game in any way — see the button pair at the bottom.
//
// Deliberately NOT a wall. Both buttons continue; the only difference is whether
// analytics starts. A consent gate that blocks play would corrupt the very
// funnel it exists to measure, because the drop-off would be the gate itself.
import { api, navigate } from '../api.js';
import { assetUrl } from '../asset_base.js';
import { saveLanguageCache } from './loading.js';
import { CONSENT_VERSION, applyAnalyticsConsent } from '../analytics.js';

const T = {
  title:      { en: 'Shattered Crown', ru: 'Shattered Crown' },
  langLabel:  { en: 'Language', ru: 'Язык' },
  privacyTitle: { en: 'Before you begin', ru: 'Прежде чем начать' },
  // Plain language on purpose. A notice nobody reads protects nobody, and the
  // list is short enough to actually be read.
  stored: {
    en: 'To run your kingdom we store your Telegram ID and name, your game progress, and your time zone. Nothing else — no payment details, no contacts, no messages.',
    ru: 'Чтобы вести ваше королевство, мы храним ваш Telegram ID и имя, игровой прогресс и часовой пояс. Больше ничего — ни платёжных данных, ни контактов, ни переписки.',
  },
  analytics: {
    en: 'We would also like to record how the game is used — which screens you visit, where you tap, and where players get stuck — so we can fix what is confusing. This uses Microsoft Clarity and stores an identifier on your device.',
    ru: 'Мы также хотели бы собирать данные об использовании игры — какие экраны вы посещаете, куда нажимаете и где игроки застревают, — чтобы исправлять неудобное. Для этого используется Microsoft Clarity, который сохраняет идентификатор на вашем устройстве.',
  },
  optional: {
    en: 'This is entirely optional. The game plays exactly the same either way, and you can change your mind at any time in Settings.',
    ru: 'Это полностью необязательно. Игра работает одинаково в любом случае, и вы можете передумать в любой момент в настройках.',
  },
  accept:  { en: 'Accept and play',   ru: 'Принять и играть' },
  decline: { en: 'Play without this', ru: 'Играть без этого' },
  saving:  { en: 'Saving…',           ru: 'Сохранение…' },
};

export function renderWelcome(root, { player, onDone }) {
  // The picker starts on whatever we currently believe, which is Telegram's
  // guess for a brand new player.
  let language = player?.settings?.language === 'ru' ? 'ru' : 'en';

  function draw() {
    const L = language;
    root.innerHTML = `
      <div class="screen screen-welcome" style="background-image: linear-gradient(180deg, rgba(10,10,14,0.55) 0%, rgba(10,10,14,0.85) 55%, rgba(10,10,14,0.97) 100%), url('${assetUrl('/assets/screens/embark.jpg')}')">
        <div class="welcome-body">
          <h1 class="welcome-title">${T.title[L]}</h1>

          <div class="welcome-lang">
            <span class="welcome-lang-label">${T.langLabel[L]}</span>
            <div class="welcome-lang-opts">
              <button class="welcome-lang-btn ${L === 'en' ? 'welcome-lang-btn--on' : ''}" data-lang="en">English</button>
              <button class="welcome-lang-btn ${L === 'ru' ? 'welcome-lang-btn--on' : ''}" data-lang="ru">Русский</button>
            </div>
          </div>

          <div class="welcome-privacy">
            <div class="welcome-privacy-title">${T.privacyTitle[L]}</div>
            <p class="welcome-privacy-text">${T.stored[L]}</p>
            <p class="welcome-privacy-text">${T.analytics[L]}</p>
            <p class="welcome-privacy-text welcome-privacy-text--muted">${T.optional[L]}</p>
          </div>

          <div class="welcome-actions">
            <button class="welcome-btn welcome-btn--accept" id="consent-accept">${T.accept[L]}</button>
            <button class="welcome-btn welcome-btn--decline" id="consent-decline">${T.decline[L]}</button>
          </div>
        </div>
      </div>`;

    // Switching language redraws in place rather than navigating, so the player
    // can flip back and forth and read the notice in whichever they prefer
    // BEFORE agreeing to it. Agreeing to text you could not read is not consent.
    root.querySelectorAll('.welcome-lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.lang === language) return;
        language = btn.dataset.lang;
        draw();
      });
    });

    root.querySelector('#consent-accept') ?.addEventListener('click', () => submit(true));
    root.querySelector('#consent-decline')?.addEventListener('click', () => submit(false));
  }

  async function submit(accepted) {
    const btns = root.querySelectorAll('.welcome-btn');
    btns.forEach(b => { b.disabled = true; });
    const chosen = root.querySelector(accepted ? '#consent-accept' : '#consent-decline');
    if (chosen) chosen.textContent = T.saving[language];

    // The answer and the language go together in one write: they were both made
    // on this screen, and a half-applied result (language saved, consent not)
    // would re-ask on the next launch in the new language.
    let updated = player;
    try {
      const res = await api('/player/consent', {
        chat_id: player.chat_id,
        analytics_consent: accepted,
        consent_version: CONSENT_VERSION,
        language,
      });
      updated = res?.player || player;
    } catch (err) {
      // Never strand the player on this screen. If the write fails they proceed
      // untracked, and the notice is shown again next launch because the stored
      // version still will not match.
      console.warn('[consent] save failed, continuing without analytics', err?.message || err);
      updated = { ...player, settings: { ...(player.settings || {}), language } };
    }

    saveLanguageCache(language);
    applyAnalyticsConsent(updated);
    onDone?.(updated);
  }

  draw();
}