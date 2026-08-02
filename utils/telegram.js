const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://dungeon-disciples.onrender.com';

const BOT_WELCOME = {
  en: {
    text:
      '⚔️ <b>Shattered Crown</b> (Pre-Alpha)\n\n' +
      'The old realm lies in ruins and its crown is shattered. Raise a faction, ' +
      'build your castle, and lead your champions into battle for what remains.\n\n' +
      '⚠️ <b>Important:</b> This game is in pre-alpha development. You will encounter bugs, ' +
      'unfinished content, and frequent changes.\n\n' +
      'Tap below to claim your throne.',
    play: '⚔️ Enter the Realm (Pre-Alpha)',
  },
  ru: {
    text:
      '⚔️ <b>Shattered Crown</b> (Пре-альфа)\n\n' +
      'Старое королевство лежит в руинах, а его корона расколота. Возглавьте фракцию, ' +
      'отстройте замок и поведите героев в бой за то, что осталось.\n\n' +
      '⚠️ <b>Важно:</b> Игра находится в пре-альфа разработке. Вы встретите ошибки, ' +
      'незавершенный контент и частые изменения.\n\n' +
      'Нажмите ниже, чтобы занять трон.',
    play: '⚔️ Войти в мир (Пре-альфа)',
  },
};

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

module.exports = { telegramWebhookHandler, sendTelegramMessage, handleTelegramUpdate, pickLang };