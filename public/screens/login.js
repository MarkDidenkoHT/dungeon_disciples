import { api }        from '../utils/api.js';
import { setSession } from '../utils/session.js';
import { navigate }   from '../main.js';

export function renderLogin(root) {
  root.innerHTML = `
    <div class="screen screen-login">
      <h1>Dungeon Disciples</h1>
      <p class="subtitle">Authenticating with Telegram…</p>
      <p id="login-error" class="error hidden"></p>
    </div>
  `;

  const error = root.querySelector('#login-error');

  async function doTelegramLogin() {
    const tg = window.Telegram?.WebApp;

    if (!tg || !tg.initData) {
      error.textContent = 'Open this app inside Telegram.';
      error.classList.remove('hidden');
      return;
    }

    tg.ready();

    try {
      const { player, isNew } = await api('/login', { initData: tg.initData });
      setSession(player);

      if (isNew || !player.faction || !player.hero) {
        navigate('faction', { player });
      } else {
        navigate('castle', { player });
      }
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    }
  }

  doTelegramLogin();
}