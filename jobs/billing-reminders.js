/**
 * Moon Hands — Daily Billing Reminders (Cron Job)
 *
 * Run daily at 9:00 AM Singapore time.
 * Checks all clinics for upcoming / overdue payments and fires admin alerts.
 *
 * Recommended schedule: Render cron or external cron calling:
 *   curl -X POST https://your-render-url/jobs/billing-reminders \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * Or run manually: node jobs/billing-reminders.js
 */

require('dotenv').config();
const { checkAllClinics, GRACE_PERIOD_DAYS, SUSPENSION_THRESHOLD_DAYS } = require('../middleware/billing-monitor');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const CRON_SECRET = process.env.CRON_SECRET || '';

function escapeMarkdown(text) {
  return String(text || '').replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

async function sendAdminAlert(text) {
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.error('[BILLING_REMINDERS] Missing TELEGRAM_BOT_TOKEN or ADMIN_CHAT_ID');
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('[BILLING_REMINDERS] sendAdminAlert error:', err.message);
  }
}

async function run() {
  console.log(`[BILLING_REMINDERS] Starting daily check at ${new Date().toISOString()}`);

  const all = await checkAllClinics();
  const today = new Date().toISOString().split('T')[0];

  const upcoming = all.filter(r => r.alertLevel === 'upcoming');
  const dueToday = all.filter(r => r.alertLevel === 'due_today');
  const grace = all.filter(r => r.alertLevel === 'grace');
  const overdue = all.filter(r => r.alertLevel === 'overdue');
  const critical = all.filter(r => r.alertLevel === 'critical');

  // ─── SUMMARY HEADER ──────────────────────────────────────────────
  const summaryLines = [
    `💰 *BILLING DAILY CHECK — ${today}*`,
    '',
    `Total clinics: ${all.length}`,
    `Upcoming (≤7d): ${upcoming.length}`,
    `Due today: ${dueToday.length}`,
    `Grace period: ${grace.length}`,
    `Overdue: ${overdue.length}`,
    `Critical (≥${SUSPENSION_THRESHOLD_DAYS}d): ${critical.length}`,
  ];
  await sendAdminAlert(summaryLines.join('\n'));

  // ─── UPCOMING ────────────────────────────────────────────────────
  for (const r of upcoming) {
    const c = r.client;
    const lines = [
      `📅 *Billing Due Soon*`,
      ``,
      `Clinic: ${escapeMarkdown(c.name)} (${c.slug})`,
      `Plan: ${c.plan === 'premium' ? 'Premium' : 'Basic'}`,
      `Amount: S$${c.monthly_amount || (c.plan === 'premium' ? 547 : 347)}`,
      `Due: ${r.nextDueDate} (${r.daysUntilDue} day${r.daysUntilDue === 1 ? '' : 's'} left)`,
      ``,
      `Action: Prepare invoice or send payment reminder.`,
    ];
    await sendAdminAlert(lines.join('\n'));
  }

  // ─── DUE TODAY ───────────────────────────────────────────────────
  for (const r of dueToday) {
    const c = r.client;
    const lines = [
      `🔔 *Billing DUE TODAY*`,
      ``,
      `Clinic: ${escapeMarkdown(c.name)} (${c.slug})`,
      `Amount: S$${c.monthly_amount || (c.plan === 'premium' ? 547 : 347)}`,
      ``,
      `Action: Payment expected today. Watch for incoming transfer.`,
    ];
    await sendAdminAlert(lines.join('\n'));
  }

  // ─── GRACE PERIOD ────────────────────────────────────────────────
  for (const r of grace) {
    const c = r.client;
    const lines = [
      `⏳ *GRACE PERIOD — ${escapeMarkdown(c.name)}*`,
      ``,
      `Status: ${r.daysOverdue} day${r.daysOverdue === 1 ? '' : 's'} overdue`,
      `Amount: S$${c.monthly_amount || (c.plan === 'premium' ? 547 : 347)}`,
      ``,
      `Service continues uninterrupted.`,
      `Grace ends in ${GRACE_PERIOD_DAYS - r.daysOverdue} day${GRACE_PERIOD_DAYS - r.daysOverdue === 1 ? '' : 's'}.`,
      ``,
      `Action: Follow up gently. Service stays on.`,
    ];
    await sendAdminAlert(lines.join('\n'));
  }

  // ─── OVERDUE ─────────────────────────────────────────────────────
  for (const r of overdue) {
    const c = r.client;
    const lines = [
      `🚨 *OVERDUE — ${escapeMarkdown(c.name)}*`,
      ``,
      `Status: ${r.daysOverdue} days overdue`,
      `Amount: S$${c.monthly_amount || (c.plan === 'premium' ? 547 : 347)}`,
      ``,
      `Service still active (manual suspension only).`,
      ``,
      `Action: Contact clinic directly. Consider suspending if no response.`,
      `To suspend: /clients → pause the clinic, or use /pause ${c.slug}`,
    ];
    await sendAdminAlert(lines.join('\n'));
  }

  // ─── CRITICAL ────────────────────────────────────────────────────
  for (const r of critical) {
    const c = r.client;
    const lines = [
      `🔴 *CRITICAL — ${escapeMarkdown(c.name)}*`,
      ``,
      `Status: ${r.daysOverdue} days overdue (≥${SUSPENSION_THRESHOLD_DAYS})`,
      `Amount: S$${c.monthly_amount || (c.plan === 'premium' ? 547 : 347)}`,
      ``,
      `⚠️ STRONGLY RECOMMEND SUSPENSION.`,
      `Bot is still auto-replying — costs accrue daily.`,
      ``,
      `Action: Contact clinic URGENTLY. If no response within 24h, suspend.`,
      `Commands: /pause ${c.slug}  → stop bot replies`,
      `          /markpaid ${c.slug} <amount>  → if payment received`,
    ];
    await sendAdminAlert(lines.join('\n'));
  }

  console.log(`[BILLING_REMINDERS] Done. Sent: ${upcoming.length} upcoming, ${dueToday.length} due, ${grace.length} grace, ${overdue.length} overdue, ${critical.length} critical.`);
}

// CLI usage: node jobs/billing-reminders.js
if (require.main === module) {
  run().catch(console.error);
}

module.exports = { run };
