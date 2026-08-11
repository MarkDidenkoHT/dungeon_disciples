const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://dungeon-disciples.onrender.com';

```js
const BOT_WELCOME = {
  en: {
    text:
      '⚔️ <b>Welcome to Shattered Crown!</b>\n\n' +
      'Thank you for joining the pre-alpha test! I am very happy to see you here and ' +
      'to have you as part of the journey to shape the future of the game.\n\n' +
      'Build your faction, develop your castle, gather your champions, and lead them into battle. ' +
      'Your feedback will help me make Shattered Crown better.\n\n' +
      '💬 <b>Your feedback is always welcome!</b> Suggestions, ideas, comments, and bug reports are all greatly appreciated and will help me improve the game.\n\n' +
      '⚠️ <b>Keep in mind:</b> The game is still in pre-alpha, so you may encounter bugs, unfinished content, and frequent changes. Thank you for your patience and for taking part in the testing!\n\n' +
      'Tap below to enter the realm. Welcome aboard!',
    play: '⚔️ Enter the Realm',
  },

  ru: {
    text:
      '⚔️ <b>Добро пожаловать в Shattered Crown!</b>\n\n' +
      'Спасибо, что присоединились к тестированию пре-альфы! Я очень рад видеть вас здесь ' +
      'и благодарен за то, что вы помогаете мне развивать игру.\n\n' +
      'Создавайте свою фракцию, развивайте замок, собирайте героев и ведите их в бой. ' +
      'Ваше участие и ваши отзывы помогут сделать Shattered Crown лучше.\n\n' +
      '💬 <b>Любая обратная связь приветствуется!</b> Предложения, идеи, замечания и сообщения об ошибках — всё это очень ценно и поможет мне улучшать игру.\n\n' +
      '⚠️ <b>Небольшая просьба:</b> игра всё ещё находится на стадии пре-альфы, поэтому могут встречаться ошибки, незавершённый контент и частые изменения. Спасибо за ваше терпение и участие в тестировании!\n\n' +
      'Нажмите ниже, чтобы войти в мир. Добро пожаловать!',
    play: '⚔️ Войти в мир',
  },
};
```


function pickLang(languageCode) {
  return (languageCode || '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

async function sendTelegramMessage(chatId, text, extra = {}) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, parse_mode: 'HTML', text, ...extra }),
    });
  } catch (err) {
    console.error('Telegram sendMessage failed:', err.message);
  }
}

// ── Admin notification ───────────────────────────────────────────────────────
// Fired once per genuinely new account (the isNew branch of /login). Silent and
// non-fatal by design: no ADMIN_CHAT_ID set means the feature is simply off, and
// a Telegram outage must never take a player's registration down with it — the
// caller does not await this.
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// The username and first name come from Telegram and go into an HTML-parsed
// message, so they are escaped. A player called "<b>" would otherwise break the
// markup, and Telegram rejects the whole send when the HTML does not parse.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

async function notifyAdminNewPlayer(player) {
  if (!ADMIN_CHAT_ID) return;
  const name   = escapeHtml(player?.first_name || 'Unknown');
  const handle = player?.username ? `@${escapeHtml(player.username)}` : '—';
  const lang   = escapeHtml(player?.settings?.language || '?');
  await sendTelegramMessage(
    ADMIN_CHAT_ID,
    `🆕 <b>New player</b>\n` +
    `Name: ${name}\n` +
    `Username: ${handle}\n` +
    `chat_id: <code>${escapeHtml(player?.chat_id)}</code>\n` +
    `Language: ${lang}`,
  );
}

async function handleTelegramUpdate(update) {
  const msg = update?.message;
  if (!msg || typeof msg.text !== 'string' || !msg.text.startsWith('/start')) return;
  const w = BOT_WELCOME[pickLang(msg.from?.language_code)];
  await sendTelegramMessage(msg.chat.id, w.text, {
    reply_markup: { inline_keyboard: [[{ text: w.play, web_app: { url: WEBAPP_URL } }]] },
  });
}

function telegramWebhookHandler(req, res) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.get('X-Telegram-Bot-Api-Secret-Token') !== secret) {
    return res.sendStatus(403);
  }
  res.sendStatus(200);
  handleTelegramUpdate(req.body).catch(err => console.error('Telegram webhook error:', err.message));
}

module.exports = { telegramWebhookHandler, sendTelegramMessage, handleTelegramUpdate, pickLang, notifyAdminNewPlayer };