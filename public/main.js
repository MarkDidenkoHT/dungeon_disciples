import { renderRegister }   from './screens/register.js';
import { renderCastle }     from './screens/castle.js';
import { renderRoster }     from './screens/roster.js';
import { renderEmbark }     from './screens/embark.js';
import { renderSettings, lang } from './screens/settings.js';
import { renderBattlePrep } from './screens/battle-prep.js';
import { renderBattle }     from './screens/battle.js';
import { renderSpellTome }  from './screens/spell_tome.js';
import { runPreload, saveLanguageCache } from './screens/loading.js';
import { hideTutorial }     from './tutorial.js';
import { openTimeline }     from './timeline.js';
import { initMusic, playFactionTheme, setMusicEnabled } from './music.js';
import { setUiLanguage } from './utils.js';

import {
  api,
  setSessionToken,
  setNavigate,
  setActiveNav,
  refreshResourceBar,
  refreshNavLock,
} from './api.js';

export { api, setSessionToken, setActiveNav, refreshResourceBar, refreshNavLock };

const app = document.getElementById('app');

// Tooltips for the two resource-bar controls.
const SHELL_TEXT = {
  timeline: { en: "What's Next", ru: 'Что дальше' },
  errands:  { en: 'Errands',     ru: 'Поручения' },
};

// The boot-time reconnect modal duplicated embark's, but in English only.
const BOOT_TEXT = {
  title:     { en: 'Unfinished Battle', ru: 'Незавершённый бой' },
  body:      {
    en: 'You have an unfinished battle in progress. Reconnect to continue, or abandon it.',
    ru: 'У вас есть незавершённый бой. Вернитесь, чтобы продолжить, или бросьте его.',
  },
  warning:   {
    en: 'Abandoning costs you the field: the fallen stay dead, and every survivor walks away at 1 HP.',
    ru: 'Бросить бой — значит уступить поле: павшие остаются мёртвыми, а выжившие уходят с 1 HP.',
  },
  abandon:   { en: 'Abandon',   ru: 'Бросить' },
  reconnect: { en: 'Reconnect', ru: 'Вернуться' },
};

const NAV_LABELS = {
  castle:   { en: 'Castle',   ru: 'Замок' },
  roster:   { en: 'Roster',   ru: 'Отряд' },
  embark:   { en: 'Embark',   ru: 'Поход' },
  spells:   { en: 'Spells',   ru: 'Заклинания' },
  settings: { en: 'Settings', ru: 'Настройки' },
};

let shellMounted = false;

function mountShell(player) {
  if (shellMounted) return;
  shellMounted = true;

  const L = lang(player);

  app.innerHTML = `
    <div id="shell">
      <!-- Timeline and errands are CONTROLS, so they sit beside the framed
           resource strip rather than inside it — the frame art is sized for
           resource slots and squeezed them flat. -->
      <div class="resource-bar-row" id="resource-bar-row">
        <button class="res-bar-btn res-bar-timeline" title="${SHELL_TEXT.timeline[L]}" aria-label="${SHELL_TEXT.timeline[L]}">
          <img src="/assets/icons/ui/timeline.png" class="res-icon-img" alt="Timeline"
               onerror="this.replaceWith(document.createTextNode('\u{1F552}'))">
        </button>
        <div class="resource-bar" id="resource-bar"></div>
        <button class="res-bar-btn res-bar-errands" disabled title="${SHELL_TEXT.errands[L]}" aria-label="${SHELL_TEXT.errands[L]}"></button>
      </div>
      <div id="content-root"></div>
      <nav class="bottom-nav" id="bottom-nav">
        <button class="nav-btn" data-screen="castle">
          <img class="nav-btn-icon" src="/assets/icons/ui/castle.png" alt="">
          <span class="nav-btn-label">${NAV_LABELS.castle[L]}</span>
        </button>
        <button class="nav-btn" data-screen="roster">
          <img class="nav-btn-icon" src="/assets/icons/ui/roster.png" alt="">
          <span class="nav-btn-label">${NAV_LABELS.roster[L]}</span>
        </button>
        <button class="nav-btn" data-screen="embark">
          <img class="nav-btn-icon" src="/assets/icons/ui/embark.png" alt="">
          <span class="nav-btn-label">${NAV_LABELS.embark[L]}</span>
        </button>
        <button class="nav-btn" data-screen="spells">
          <img class="nav-btn-icon" src="/assets/icons/ui/spellbook.png" alt="">
          <span class="nav-btn-label">${NAV_LABELS.spells[L]}</span>
        </button>
        <button class="nav-btn" data-screen="settings">
          <img class="nav-btn-icon" src="/assets/icons/ui/settings.png" alt="" onerror="this.style.display='none';">
          <span class="nav-btn-label">${NAV_LABELS.settings[L]}</span>
        </button>
      </nav>
    </div>
  `;

  document.getElementById('bottom-nav').addEventListener('click', e => {
    const btn = e.target.closest('.nav-btn');
    if (btn && !btn.classList.contains('disabled')) {
      navigate(btn.dataset.screen, { player });
    }
  });

  // The row is mounted once and never re-rendered (only the strip inside it is),
  // so the timeline click is delegated from here.
  // openTimeline reads the language off the player it is given — called bare it
  // fell back to English forever. Settings mutates player.settings in place, so
  // this closed-over reference stays current across language switches.
  document.getElementById('resource-bar-row').addEventListener('click', e => {
    if (e.target.closest('.res-bar-timeline')) openTimeline(player);
  });
}

function navigate(screen, params = {}) {
  const { player } = params;

  // Shared chrome (utils.js) has no player, so hand it the language here.
  setUiLanguage(lang(player));
  hideTutorial();
  document.body.style.overflow = '';

  if (screen === 'register') {
    shellMounted = false;
    app.innerHTML = '';
    renderRegister(app, params);
    return;
  }

  mountShell(player);
  setActiveNav(screen);

  const isBattle = screen === 'battle';
  const navEl    = document.getElementById('bottom-nav');
  const resBarEl = document.getElementById('resource-bar-row');
  if (navEl) navEl.style.display = isBattle ? 'none' : '';
  if (resBarEl) {
    resBarEl.style.display = isBattle ? 'none' : '';
    // Battle prep hides the bar by default; it slides down only while the spell
    // sheet is open (see battle-prep openSpellSheet/closeSpellSheet). Every other
    // screen shows it normally.
    resBarEl.classList.toggle('resource-bar--collapsed', screen === 'battle-prep');
  }

  if (player && !isBattle) {
    refreshResourceBar(player).catch(() => {});
    refreshNavLock(player).catch(() => {});
  }

  const root = document.getElementById('content-root');

  const L = lang(player);

  ['castle', 'roster', 'settings'].forEach(screen => {
    const btn = document.querySelector(`.nav-btn[data-screen="${screen}"]`);
    const label = btn?.querySelector('.nav-btn-label');
    if (label) label.textContent = NAV_LABELS[screen][L];
  });

  const spellsNav = document.querySelector('.nav-btn[data-screen="spells"]');
  const embarkNav = document.querySelector('.nav-btn[data-screen="embark"]');

  if (spellsNav) {
    const label = spellsNav.querySelector('.nav-btn-label');
    if (label) label.textContent = NAV_LABELS.spells[L];
    if (spellsNav._battlePrepHandler) { spellsNav.removeEventListener('click', spellsNav._battlePrepHandler, true); delete spellsNav._battlePrepHandler; }
  }
  if (embarkNav) {
    const label = embarkNav.querySelector('.nav-btn-label');
    if (label) label.textContent = NAV_LABELS.embark[L];
    embarkNav.classList.remove('nav-btn--battle-ready');
    if (embarkNav._battlePrepHandler) { embarkNav.removeEventListener('click', embarkNav._battlePrepHandler, true); delete embarkNav._battlePrepHandler; }
  }

  root.innerHTML = '';
  root.style.backgroundImage    = '';
  root.style.backgroundSize     = '';
  root.style.backgroundPosition = '';
  root.style.backgroundRepeat   = '';
  root.style.backgroundColor    = '';

  switch (screen) {
    case 'castle':      renderCastle(root, params);     break;
    case 'roster':      renderRoster(root, params);     break;
    case 'embark':      renderEmbark(root, params);     break;
    case 'battle-prep': renderBattlePrep(root, params); break;
    case 'battle':      renderBattle(root, params);     break;
    case 'spells':      renderSpellTome(root, params);  break;
    case 'settings':    renderSettings(root, params);   break;
    default:
      root.innerHTML = `<p style="color:red">Unknown screen: ${screen}</p>`;
  }
}

setNavigate(navigate);

function showReconnectModal(player, battle_id, battle_data) {
  const BL = lang(player);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header"><span class="modal-title">${BOOT_TEXT.title[BL]}</span></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:1rem;">
        <div style="color:var(--muted);font-size:.95rem;line-height:1.4;">
          ${BOOT_TEXT.body[BL]}
        </div>
        <div style="color:var(--danger);font-size:.85rem;line-height:1.4;">
          ${BOOT_TEXT.warning[BL]}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:.75rem;flex-wrap:wrap;">
          <button id="boot-abandon-btn" class="action-btn action-btn--cancel">${BOOT_TEXT.abandon[BL]}</button>
          <button id="boot-reconnect-btn" class="action-btn">${BOOT_TEXT.reconnect[BL]}</button>
        </div>
      </div>
    </div>
  `;
  app.appendChild(overlay);

  overlay.querySelector('#boot-reconnect-btn').addEventListener('click', async () => {
    try {
      const region_id = battle_data.region_id;
      const level     = battle_data.level;
      const { state, logs } = await api(`/battle/state?battle_id=${encodeURIComponent(battle_id)}&chat_id=${encodeURIComponent(player.chat_id)}`);
      overlay.remove();
      navigate('battle', { player, battle_id, reconnect: true, snapshot: state, logs, region_id, level });
    } catch (err) {
      console.error('Failed to reconnect:', err);
    }
  });

  overlay.querySelector('#boot-abandon-btn').addEventListener('click', async () => {
    try { await api('/battle/end', { battle_id, chat_id: player.chat_id }); } catch (_) {}
    overlay.remove();
    navigate('castle', { player });
  });
}

async function boot() {
  const tg = window.Telegram?.WebApp;

  if (!tg || !tg.initData) {
    app.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#888;font-family:sans-serif;text-align:center;padding:2rem">Open this app inside Telegram.</div>`;
    return;
  }

  tg.ready();

  try {
    const [loginResult] = await Promise.all([
      api('/login', { initData: tg.initData, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      runPreload(app),
    ]);
    const { player, session_token, isNew, active, battle_id, battle_data } = loginResult;
    setSessionToken(session_token);

    if (player.settings?.language) {
      saveLanguageCache(player.settings.language);
    }

    initMusic(player);
    if (player.faction) playFactionTheme(player.faction);

    if (active) {
      mountShell(player);
      showReconnectModal(player, battle_id, battle_data);
      return;
    }
    if (isNew || !player.faction || !player.hero) {
      navigate('register', { player });
    } else {
      navigate('castle', { player });
    }
  } catch (err) {
    app.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#e74c3c;font-family:sans-serif;text-align:center;padding:2rem">Login failed: ${err.message}</div>`;
  }
}

boot();