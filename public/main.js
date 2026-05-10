import { getSession } from './utils/session.js';
import { renderLogin }   from './screens/login.js';
import { renderFaction } from './screens/faction.js';
import { renderCastle }  from './screens/castle.js';
import { renderRoster }  from './screens/roster.js';

const app = document.getElementById('app');

export function navigate(screen, params = {}) {
  app.innerHTML = '';
  switch (screen) {
    case 'login':   renderLogin(app, params);   break;
    case 'faction': renderFaction(app, params); break;
    case 'castle':  renderCastle(app, params);  break;
    case 'roster':  renderRoster(app, params);  break;
    default:
      app.innerHTML = `<p style="color:red">Unknown screen: ${screen}</p>`;
  }
}

async function boot() {
  const player = getSession();
  if (!player) { navigate('login'); return; }
  if (!player.faction || !player.hero) { navigate('faction', { player }); return; }
  navigate('castle', { player });
}

boot();