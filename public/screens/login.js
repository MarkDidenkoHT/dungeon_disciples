import { api }        from '../utils/api.js';
import { setSession } from '../utils/session.js';
import { navigate }   from '../main.js';

export function renderLogin(root) {
  root.innerHTML = `
    <div class="screen screen-login">
      <h1>Dungeon Disciples</h1>
      <p class="subtitle">Enter your Telegram chat ID to begin</p>

      <div class="form-group">
        <input
          id="chat-id-input"
          type="text"
          placeholder="Telegram chat ID"
          autocomplete="off"
        />
        <button id="login-btn">Enter</button>
      </div>

      <p id="login-error" class="error hidden"></p>
    </div>
  `;

  const input = root.querySelector('#chat-id-input');
  const btn   = root.querySelector('#login-btn');
  const error = root.querySelector('#login-error');

  async function doLogin() {
    const chat_id = input.value.trim();
    if (!chat_id) return;

    btn.disabled = true;
    btn.textContent = '...';
    error.classList.add('hidden');

    try {
      const { player, isNew } = await api('/login', { chat_id });
      setSession(player);

      if (isNew || !player.faction || !player.hero) {
        navigate('faction', { player });
      } else {
        navigate('castle', { player });
      }
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Enter';
    }
  }

  btn.addEventListener('click', doLogin);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  input.focus();
}