import { renderRegister }   from './screens/register.js';
import { renderCastle }     from './screens/castle.js';
import { renderRoster }     from './screens/roster.js';
import { renderEmbark }     from './screens/embark.js';
import { renderBattlePrep } from './screens/battle-prep.js';
import { renderBattle }     from './screens/battle.js';
import { renderSpellTome }  from './screens/spell_tome.js';
import { renderPvp }        from './screens/pvp.js';

import {
  api,
  setSessionToken,
  setNavigate,
  setActiveNav,
  refreshResourceBar,
} from './api.js';

export { api, setSessionToken, setActiveNav, refreshResourceBar };

const app = document.getElementById('app');

let shellMounted = false;

function mountShell(player) {
  if (shellMounted) return;
  shellMounted = true;

  app.innerHTML = `
    <div id="shell">
      <div class="resource-bar" id="resource-bar"></div>
      <div id="content-root"></div>
      <nav class="bottom-nav" id="bottom-nav">
        <button class="nav-btn" data-screen="castle">
          <img class="nav-btn-icon" src="/assets/icons/ui/castle.png" alt="">
          <span class="nav-btn-label">Castle</span>
        </button>
        <button class="nav-btn" data-screen="roster">
          <img class="nav-btn-icon" src="/assets/icons/ui/roster.png" alt="">
          <span class="nav-btn-label">Roster</span>
        </button>
        <button class="nav-btn" data-screen="embark">
          <img class="nav-btn-icon" src="/assets/icons/ui/embark.png" alt="">
          <span class="nav-btn-label">Embark</span>
        </button>
        <button class="nav-btn" data-screen="spells">
          <img class="nav-btn-icon" src="/assets/icons/ui/spellbook.png" alt="">
          <span class="nav-btn-label">Spells</span>
        </button>
        <button class="nav-btn" data-screen="pvp">
          <img class="nav-btn-icon nav-btn-icon--pvp" src="/assets/icons/ui/pvp.png" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <span class="nav-btn-icon nav-btn-icon--pvp-fallback" style="display:none;">⚔</span>
          <span class="nav-btn-label">PvP</span>
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
}

function navigate(screen, params = {}) {
  const { player } = params;

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
  const resBarEl = document.getElementById('resource-bar');
  if (navEl) navEl.style.display = isBattle ? 'none' : '';
  if (resBarEl) resBarEl.style.display = isBattle ? 'none' : '';

  if (player && !isBattle) refreshResourceBar(player).catch(() => {});

  const root = document.getElementById('content-root');
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
    case 'pvp':         renderPvp(root, params);        break;
    default:
      root.innerHTML = `<p style="color:red">Unknown screen: ${screen}</p>`;
  }
}

// Wire navigate into api.js so screens can call it without importing main.js
setNavigate(navigate);

function showReconnectModal(player, battle_id, battle_data) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header"><span class="modal-title">Unfinished Battle</span></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:1rem;">
        <div style="color:var(--muted);font-size:.95rem;line-height:1.4;">
          You have an unfinished battle in progress. Reconnect to continue, or abandon it.
        </div>
        <div style="display:flex;justify-content:flex-end;gap:.75rem;flex-wrap:wrap;">
          <button id="boot-abandon-btn" class="action-btn action-btn--cancel">Abandon</button>
          <button id="boot-reconnect-btn" class="action-btn">Reconnect</button>
        </div>
      </div>
    </div>
  `;
  app.appendChild(overlay);

  overlay.querySelector('#boot-reconnect-btn').addEventListener('click', async () => {
    try {
      const region_id = battle_data.region_id;
      const level     = battle_data.level;
      const { state } = await api(`/battle/state?battle_id=${encodeURIComponent(battle_id)}&chat_id=${encodeURIComponent(player.chat_id)}`);
      overlay.remove();
      navigate('battle', { player, battle_id, reconnect: true, snapshot: state, region_id, level });
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
    const { player, session_token, isNew, active, battle_id, battle_data } = await api('/login', { initData: tg.initData });
    setSessionToken(session_token);
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