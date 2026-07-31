// Telegram bot integration — currently the /start welcome flow.
//
// Register the webhook once (points Telegram at POST /api/telegram/webhook):
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<HOST>/api/telegram/webhook&secret_token=<SECRET>"
// where SECRET matches TELEGRAM_WEBHOOK_SECRET. Verify with getWebhookInfo.
//
// Env:
//   TELEGRAM_BOT_TOKEN        the bot token (also used for Mini App login validation)
//   TELEGRAM_WEBHOOK_SECRET   shared secret; requests without it are rejected (optional but recommended)
//   WEBAPP_URL                Mini App URL the "play" button launches

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://dungeon-disciples.onrender.com';

// Localized welcome copy. Add languages here; anything unmatched falls back to en.
const BOT_WELCOME = {
  en: {
    text:
      '⚔️ <b>Shattered Crown</b>\n\n' +
      'The old realm lies in ruins and its crown is shattered. Raise a faction, ' +
      'build your castle, and lead your champions into battle for what remains.\n\n' +
      'Tap below to claim your throne.',
    play: '⚔️ Enter the Realm',
  },
  ru: {
    text:
      '⚔️ <b>Shattered Crown</b>\n\n' +
      'Старое королевство лежит в руинах, а его корона расколота. Возглавьте фракцию, ' +
      'отстройте замок и поведите героев в бой за то, что осталось.\n\n' +
      'Нажмите ниже, чтобы занять трон.',
    play: '⚔️ Войти в мир',
  },
};

function pickLang(languageCode) {
  return (languageCode || '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

// Fire-and-forget send; never throws into the request path.
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

async function handleTelegramUpdate(update) {
  const msg = update?.message;
  if (!msg || typeof msg.text !== 'string' || !msg.text.startsWith('/start')) return;
  const w = BOT_WELCOME[pickLang(msg.from?.language_code)];
  await sendTelegramMessage(msg.chat.id, w.text, {
    reply_markup: { inline_keyboard: [[{ text: w.play, web_app: { url: WEBAPP_URL } }]] },
  });
}

// Express handler for the webhook route. Verifies the secret, acks fast, then
// processes the update out of band so Telegram never waits on our work.
function telegramWebhookHandler(req, res) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.get('X-Telegram-Bot-Api-Secret-Token') !== secret) {
    return res.sendStatus(403);
  }
  res.sendStatus(200);
  handleTelegramUpdate(req.body).catch(err => console.error('Telegram webhook error:', err.message));
}

module.exports = { telegramWebhookHandler, sendTelegramMessage, handleTelegramUpdate, pickLang };