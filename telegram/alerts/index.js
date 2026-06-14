/**
 * Telegram Alerts — Simple admin notification sender
 * Used by keepalive and monitoring systems
 */

async function sendAdminAlert(message, level = 'info') {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return;

  const emoji = level === 'critical' ? '\ud83d\udea8' : level === 'warning' ? '\u26a0\ufe0f' : '\u2139\ufe0f';

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${emoji} ${message}`,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    console.error('[ALERTS] Failed to send:', err.message);
  }
}

module.exports = { sendAdminAlert };
