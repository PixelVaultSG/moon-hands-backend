/**
 * Trial Expiry Checker
 * 
 * Runs daily at 9 AM Singapore time.
 * Checks for trials expiring soon and sends alerts.
 * 
 * Alert schedule:
 * - 3 days before expiry: Warning to admin ("Collect payment soon")
 * - 1 day before expiry: Urgent alert to admin ("Collect payment NOW")
 * - On expiry day: Alert to admin + clinic set to paused
 * 
 * How to schedule (on Render):
 *   Add a Cron Job:
 *   Command: node jobs/trial-expiry-checker.js
 *   Schedule: 0 1 * * *  (1 AM UTC = 9 AM SGT)
 */

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkTrialExpiries() {
  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const in1Day = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
  
  console.log(`[TRIAL_CHECK] Running at ${now.toISOString()}`);
  
  // ── Check 1: Trials expiring in 3 days ──
  const { data: warning3d, error: err3d } = await supabase
    .from('clients')
    .select('id, name, slug, contact_name, contact_email, trial_expires_at, telegram_chat_id')
    .eq('is_trial', true)
    .lte('trial_expires_at', in3Days.toISOString())
    .gt('trial_expires_at', in1Day.toISOString());
  
  if (warning3d && warning3d.length > 0) {
    for (const clinic of warning3d) {
      const daysLeft = Math.ceil((new Date(clinic.trial_expires_at) - now) / (24 * 60 * 60 * 1000));
      await alertAdmin(`⚠️ *TRIAL EXPIRING IN ${daysLeft} DAYS*\n\n*${clinic.name}* (${clinic.slug})\nContact: ${clinic.contact_name || 'N/A'}\nEmail: ${clinic.contact_email || 'N/A'}\nTrial ends: ${new Date(clinic.trial_expires_at).toLocaleDateString('en-GB')}\n\n_Action: Contact clinic to collect payment before trial ends._`);
    }
  }
  
  // ── Check 2: Trials expiring in 1 day ──
  const { data: warning1d, error: err1d } = await supabase
    .from('clients')
    .select('id, name, slug, contact_name, contact_email, trial_expires_at, telegram_chat_id')
    .eq('is_trial', true)
    .lte('trial_expires_at', in1Day.toISOString())
    .gt('trial_expires_at', now.toISOString());
  
  if (warning1d && warning1d.length > 0) {
    for (const clinic of warning1d) {
      await alertAdmin(`🚨 *TRIAL EXPIRES TOMORROW*\n\n*${clinic.name}* (${clinic.slug})\nContact: ${clinic.contact_name || 'N/A'}\nEmail: ${clinic.contact_email || 'N/A'}\n\n_URGENT: Collect payment TODAY or clinic will be paused._`);
    }
  }
  
  // ── Check 3: Trials that expired today ──
  const { data: expired, error: errExpired } = await supabase
    .from('clients')
    .select('id, name, slug, contact_name, contact_email, trial_expires_at')
    .eq('is_trial', true)
    .lte('trial_expires_at', now.toISOString());
  
  if (expired && expired.length > 0) {
    for (const clinic of expired) {
      // Pause the clinic
      await supabase.from('clients').update({ 
        status: 'paused', 
        is_trial: false,
        paused_at: now.toISOString(),
        pause_reason: 'trial_expired'
      }).eq('id', clinic.id);
      
      await alertAdmin(`🔴 *TRIAL EXPIRED — CLINIC PAUSED*\n\n*${clinic.name}* (${clinic.slug})\nContact: ${clinic.contact_name || 'N/A'}\n\n_Clinic has been automatically paused. Reactivate after payment is collected._`);
    }
  }
  
  console.log(`[TRIAL_CHECK] Done. 3d warnings: ${warning3d?.length || 0}, 1d warnings: ${warning1d?.length || 0}, expired: ${expired?.length || 0}`);
}

async function alertAdmin(message) {
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.warn('[TRIAL_CHECK] Missing Telegram config, skipping alert');
    return;
  }
  
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });
  } catch (err) {
    console.error('[TRIAL_CHECK] Failed to send Telegram alert:', err.message);
  }
}

// Run immediately if called directly
if (require.main === module) {
  checkTrialExpiries().then(() => process.exit(0)).catch(err => {
    console.error('[TRIAL_CHECK] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { checkTrialExpiries };