import { renderRegister }   from './screens/register.js';
import { renderCastle }     from './screens/castle.js';
import { renderRoster }     from './screens/roster.js';
import { renderEmbark }     from './screens/embark.js';
import { renderBattlePrep } from './screens/battle-prep.js';

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

export function navigate(screen, params = {}) {
  app.innerHTML = '';
  switch (screen) {
    case 'register':    renderRegister(app, params);   break;
    case 'castle':      renderCastle(app, params);     break;
    case 'roster':      renderRoster(app, params);     break;
    case 'embark':      renderEmbark(app, params);     break;
    case 'battle-prep': renderBattlePrep(app, params); break;
    default:
      app.innerHTML = `<p style="color:red">Unknown screen: ${screen}</p>`;
  }
}

async function boot() {
  const tg = window.Telegram?.WebApp;

  if (!tg || !tg.initData) {
    navigate('register');
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
    navigate('register');
  }
}

boot();