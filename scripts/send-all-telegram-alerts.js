/**
 * Moon Hands — Send All Telegram Alert Samples
 *
 * Run this script to trigger every alert type to your admin Telegram.
 * Usage: node scripts/send-all-telegram-alerts.js
 *
 * Requires: TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID env vars
 *
 * Message catalogue lives in telegram/sample-alerts.js (synced 2026-09-05).
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.error('❌ Missing env vars. Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID.');
  process.exit(1);
}

const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const { SAMPLES } = require('../telegram/sample-alerts');

async function send(text) {
  try {
    const res = await fetch(`${BASE_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text, parse_mode: 'Markdown' }),
    });
    const data = await res.json();
    if (data.ok) { console.log('✅ Sent'); return true; }
    // Retry as plain text if Markdown parsing fails
    const res2 = await fetch(`${BASE_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: text.replace(/[*_`]/g, '') }),
    });
    const data2 = await res2.json();
    console.log(data2.ok ? '✅ Sent (plain fallback)' : '❌ Failed: ' + data2.description);
    return data2.ok;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  }
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log(`Sending ${SAMPLES.length} Telegram alerts to ${ADMIN_CHAT_ID}...\n`);
  await send(`🧪 *SAMPLE ALERT RUN — ${SAMPLES.length} message types*\nSynced 2026-09-05: basic/premium plans, WhatsApp-only, admin-only free/payable split.`);
  await wait(600);
  for (let i = 0; i < SAMPLES.length; i++) {
    const s = SAMPLES[i];
    process.stdout.write(`${String(i + 1).padStart(2, '0')}. ${s.name}... `);
    await send(`[${i + 1}/${SAMPLES.length}] ${s.name}\n\n${s.text}`);
    await wait(600);
  }
  await send('🧪 *END OF SAMPLE RUN*');
  console.log(`\n✅ All ${SAMPLES.length} alerts sent!`);
}

main().catch(console.error);
