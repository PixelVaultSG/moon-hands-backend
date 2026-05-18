/**
 * Midnight Cron Job: Daily Business Report
 * 
 * Runs every day at 00:05 Singapore time.
 * 1. Calculates end-of-day rollover for each client
 * 2. Aggregates yesterday's actual usage from Supabase
 * 3. Sends consolidated expense report to Telegram admin
 * 4. Clears stale rate limit records
 * 
 * How to run:
 *   node jobs/daily-report.js           (manual, for yesterday)
 *   node jobs/daily-report.js 2026-05-14 (manual, for specific date)
 * 
 * How to schedule (on Render):
 *   Add a Cron Job in Render Dashboard:
 *   Command: node jobs/daily-report.js
 *   Schedule: 0 5 * * *  (5 AM UTC = 1 PM SGT... wait)
 *   
 *   Singapore midnight = 4 PM UTC (16:00 UTC)
 *   Schedule: 0 16 * * *  (4 PM UTC = midnight SGT)
 */

require('dotenv').config();

const { generateDailyReport, formatTelegramReport } = require('../supabase/usage-logger');
const { sendTelegramMessage } = require('../telegram/alerts/templates');

const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

async function runDailyReport(dateStr) {
  console.log(`[DAILY_REPORT] Starting report for ${dateStr || 'yesterday'}...`);
  
  try {
    // Generate report from ACTUAL Supabase data
    const report = await generateDailyReport(dateStr);
    
    if (!report) {
      console.error('[DAILY_REPORT] Failed to generate report');
      return;
    }
    
    // Format for Telegram
    const telegramMsg = formatTelegramReport(report);
    
    // Send to admin
    if (ADMIN_CHAT_ID) {
      await sendTelegramMessage(ADMIN_CHAT_ID, telegramMsg);
      console.log('[DAILY_REPORT] Sent to Telegram admin');
    } else {
      console.log('[DAILY_REPORT] TELEGRAM_ADMIN_CHAT_ID not set, printing to console:');
      console.log(telegramMsg);
    }
    
    // Also log to console for Render logs
    console.log(`[DAILY_REPORT] ${report.date}: ${report.summary.totalMessages} messages, $${report.summary.totalOpenAICost} cost, $${report.summary.totalDailyProfit} profit`);
    
    // NOTE: Booking summaries are now sent at clinic CLOSING TIME via closing-summary.js
    // NOT at midnight — doctor needs the summary when clinic closes, not when sleeping.
    // closing-summary.js runs every 15 minutes and checks each clinic's closing hours.
    
  } catch (err) {
    console.error('[DAILY_REPORT] Error:', err.message);
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────

const dateArg = process.argv[2]; // Optional: specific date

// Only auto-run when executed directly (not when required by server.js)
if (require.main === module) {
  (async () => {
    await runDailyReport(dateArg);
    process.exit(0);
  })();
}

module.exports = { runDailyReport };
