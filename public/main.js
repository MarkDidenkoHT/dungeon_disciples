import { renderRegister }   from './screens/register.js';
import { renderCastle }     from './screens/castle.js';
import { renderRoster }     from './screens/roster.js';
import { renderEmbark }     from './screens/embark.js';
import { renderBattlePrep } from './screens/battle-prep.js';
import { renderBattle }     from './screens/battle.js';
import { renderSpellTome }  from './screens/spell_tome.js';

const app = document.getElementById('app');

export async function api(path, body = null) {
  const options = {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Resource bar cache — screens call refreshResourceBar() after spending resources.
// All other navigation reuses the cached data unless dirty.
export const resourceCache = {
  data: null,
  dirty: true,
  async get(chat_id) {
    if (!this.dirty && this.data) return this.data;
    this.data = await api(`/inventory?chat_id=${chat_id}&type=resource`);
    this.dirty = false;
    return this.data;
  },
  invalidate() {
    this.dirty = true;
  },
};

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

export function setActiveNav(screen) {
  document.querySelectorAll('#bottom-nav .nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === screen);
  });
}

export async function refreshResourceBar(player) {
  const bar = document.getElementById('resource-bar');
  if (!bar) return;
  resourceCache.invalidate();
  const inventory = await resourceCache.get(player.chat_id);
  const find = name => inventory.find(r => r.item === name) || { amount: 0 };
  bar.innerHTML = `
    <div class="res-bar-item"><span class="res-bar-icon">🪙</span><span class="res-bar-val">${find('Gold').amount}</span></div>
    <div class="res-bar-item"><span class="res-bar-icon">🟢</span><span class="res-bar-val">${find('Crystals_Life').amount}</span></div>
    <div class="res-bar-item"><span class="res-bar-icon">🔴</span><span class="res-bar-val">${find('Crystals_Fire').amount}</span></div>
    <div class="res-bar-item"><span class="res-bar-icon">🟣</span><span class="res-bar-val">${find('Crystals_Death').amount}</span></div>
    <div class="res-bar-item"><span class="res-bar-icon">🟡</span><span class="res-bar-val">${find('Crystals_Nature').amount}</span></div>
    <div class="res-bar-item"><span class="res-bar-icon">🔵</span><span class="res-bar-val">${find('Crystals_Frost').amount}</span></div>
  `;
}

export function navigate(screen, params = {}) {
  const { player } = params;

  // Pre-login screens bypass the shell entirely
  if (screen === 'register') {
    shellMounted = false;
    app.innerHTML = '';
    renderRegister(app, params);
    return;
  }

  mountShell(player);
  setActiveNav(screen);

  // Refresh resource bar in the background — non-blocking so navigation feels instant
  if (player) refreshResourceBar(player).catch(() => {});

  const root = document.getElementById('content-root');
  root.innerHTML = '';

  switch (screen) {
    case 'castle':      renderCastle(root, params);     break;
    case 'roster':      renderRoster(root, params);     break;
    case 'embark':      renderEmbark(root, params);     break;
    case 'battle-prep': renderBattlePrep(root, params); break;
    case 'battle':      renderBattle(root, params);     break;
    case 'spells':      renderSpellTome(root, params);  break;
    default:
      root.innerHTML = `<p style="color:red">Unknown screen: ${screen}</p>`;
  }
}

async function boot() {
  const tg = window.Telegram?.WebApp;

  if (!tg || !tg.initData) {
    app.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#888;font-family:sans-serif;text-align:center;padding:2rem">Open this app inside Telegram.</div>`;
    return;
  }

  tg.ready();

  try {
    const { player, isNew } = await api('/login', { initData: tg.initData });
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