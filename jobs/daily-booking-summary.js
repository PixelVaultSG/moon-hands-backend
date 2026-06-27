/**
 * Moon Hands — Daily Booking Summary + Attendance Check
 * 
 * Sends every morning at 8:30 AM SGT to the admin Telegram.
 * Shows today's confirmed appointments with inline YES/NO buttons
 * for easy no-show tracking.
 * 
 * Also sends a "Did the patient show up?" prompt after each
 * appointment's scheduled end time.
 */

require('dotenv').config();
const { supabase } = require('../supabase/client');

const CONFIG = {
  // Morning summary time (SGT)
  SUMMARY_HOUR_SGT: 8,
  SUMMARY_MINUTE_SGT: 30,
  // Post-appointment check delay (minutes after appointment end)
  POST_APPT_CHECK_DELAY_MIN: 30,
  ENABLED: process.env.DAILY_SUMMARY_ENABLED !== 'false',
};

// ─── MAIN: MORNING SUMMARY ───────────────────────────────────────

/**
 * Send today's booking summary to Telegram with YES/NO buttons.
 * Called by scheduler every morning at 8:30 AM SGT.
 */
async function sendDailySummary() {
  if (!CONFIG.ENABLED) return;

  const today = new Date().toISOString().split('T')[0];
  console.log(`[DAILY_SUMMARY] Generating summary for ${today}...`);

  try {
    // Get all active clinics
    const { data: clinics, error: clinicErr } = await supabase
      .from('clients')
      .select('id, slug, name, telegram_chat_id')
      .eq('status', 'active');

    if (clinicErr) throw clinicErr;

    for (const clinic of clinics || []) {
      try {
        await sendClinicSummary(clinic, today);
      } catch (err) {
        console.error(`[DAILY_SUMMARY] ${clinic.slug}:`, err.message);
      }
    }

  } catch (err) {
    console.error('[DAILY_SUMMARY] Fatal error:', err.message);
  }
}

async function sendClinicSummary(clinic, today) {
  // Get today's confirmed appointments
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, customer_name, customer_phone, service, appointment_time, status, notes')
    .eq('client_id', clinic.id)
    .eq('appointment_date', today)
    .in('status', ['confirmed', 'pending'])
    .order('appointment_time');

  if (error) {
    console.error(`[DAILY_SUMMARY] DB error for ${clinic.slug}:`, error.message);
    return;
  }

  if (!appointments || appointments.length === 0) {
    console.log(`[DAILY_SUMMARY] ${clinic.slug}: No appointments today`);
    return;
  }

  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) return;

  const bot = require('../telegram/bot').bot;

  // Build the message
  const lines = [
    `📅 *Today's Appointments — ${clinic.name}*`,
    `${today} (${new Date().toLocaleDateString('en-SG', { weekday: 'long' })})
\n`,
    `You have *${appointments.length}* appointment(s) today:\n`,
  ];

  // Build inline keyboard with YES/NO buttons per appointment
  const { Markup } = require('telegraf');
  const buttons = [];

  appointments.forEach((appt, i) => {
    const time = formatTime(appt.appointment_time);
    lines.push(
      `${i + 1}. *${appt.customer_name}*\n` +
      `   ${appt.service} at ${time}\n` +
      `   📱 ${appt.customer_phone}\n`
    );

    // Add YES/NO buttons for this appointment
    buttons.push([
      Markup.button.callback(`✅ ${appt.customer_name} showed up`, `appt_yes:${clinic.slug}:${appt.id}`),
    ]);
    buttons.push([
      Markup.button.callback(`❌ ${appt.customer_name} no-show`, `appt_no:${clinic.slug}:${appt.id}`),
    ]);
  });

  lines.push(`\n_Tap a button after each appointment to track attendance._`);
  lines.push(`_This data feeds into your weekly AI optimization report._`);

  try {
    await bot.telegram.sendMessage(chatId, lines.join('\n'), {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard(buttons),
    });
    console.log(`[DAILY_SUMMARY] ✅ Sent ${appointments.length} appt(s) for ${clinic.slug}`);
  } catch (mdErr) {
    // Fallback without markdown
    const plainText = lines.join('\n').replace(/[*_]/g, '');
    await bot.telegram.sendMessage(chatId, plainText, Markup.inlineKeyboard(buttons));
  }
}

// ─── POST-APPOINTMENT FOLLOW-UP ──────────────────────────────────

/**
 * Checks for appointments that ended recently and sends
 * a "Did they show up?" prompt if not yet marked.
 */
async function sendPostAppointmentChecks() {
  if (!CONFIG.ENABLED) return;

  try {
    const now = new Date();
    const checkBefore = new Date(now.getTime() - CONFIG.POST_APPT_CHECK_DELAY_MIN * 60000);
    const today = now.toISOString().split('T')[0];

    // Find appointments that:
    // - Are today
    // - Have a time that's in the past (by at least 30 min)
    // - Still have status 'confirmed' (not yet marked)
    // - Haven't been sent a follow-up yet
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select('id, client_id, customer_name, service, appointment_time, customer_phone')
      .eq('appointment_date', today)
      .eq('status', 'confirmed')
      .lte('appointment_time', `${String(checkBefore.getHours()).padStart(2, '0')}:${String(checkBefore.getMinutes()).padStart(2, '0')}`)
      .is('attendance_checked_at', null)
      .limit(20);

    if (error || !appointments || appointments.length === 0) return;

    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const bot = require('../telegram/bot').bot;
    const { Markup } = require('telegraf');

    for (const appt of appointments) {
      try {
        const time = formatTime(appt.appointment_time);
        await bot.telegram.sendMessage(chatId,
          `⏰ *Attendance Check*\n\n` +
          `Did *${appt.customer_name}* show up for their *${appt.service}* appointment at *${time}*?\n\n` +
          `Please tap a button:`,
          {
            parse_mode: 'MarkdownV2',
            ...Markup.inlineKeyboard([
              [Markup.button.callback(`✅ Yes, showed up`, `appt_yes:${appt.client_id}:${appt.id}`)],
              [Markup.button.callback(`❌ No, no-show`, `appt_no:${appt.client_id}:${appt.id}`)],
            ])
          }
        );

        // Mark as checked (so we don't ask again)
        await supabase
          .from('appointments')
          .update({ attendance_checked_at: now.toISOString() })
          .eq('id', appt.id);

        console.log(`[DAILY_SUMMARY] ✅ Sent attendance check for ${appt.customer_name}`);
      } catch (err) {
        console.error(`[DAILY_SUMMARY] Failed to send check:`, err.message);
      }
    }

  } catch (err) {
    console.error('[DAILY_SUMMARY] Post-appointment check error:', err.message);
  }
}

// ─── MARK APPOINTMENT ATTENDANCE ─────────────────────────────────

/**
 * Called from Telegram callback handler when admin taps YES/NO.
 * Updates the appointment status and logs it.
 */
async function markAppointmentAttendance(appointmentId, showedUp, markedBy) {
  try {
    const newStatus = showedUp ? 'completed' : 'no_show';

    const { data, error } = await supabase
      .from('appointments')
      .update({
        status: newStatus,
        attendance_marked_at: new Date().toISOString(),
        attendance_marked_by: markedBy,
      })
      .eq('id', appointmentId)
      .select()
      .single();

    if (error) throw error;

    console.log(`[DAILY_SUMMARY] Appointment ${appointmentId} marked as ${newStatus}`);
    return { success: true, appointment: data, status: newStatus };

  } catch (err) {
    console.error(`[DAILY_SUMMARY] Failed to mark attendance:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── UTILITY FUNCTIONS ───────────────────────────────────────────

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ─── SCHEDULER ───────────────────────────────────────────────────

function startDailySummaryScheduler() {
  if (!CONFIG.ENABLED) {
    console.log('[DAILY_SUMMARY] Scheduler disabled');
    return;
  }

  // Calculate time until next 8:30 AM SGT
  const now = new Date();
  const utcNow = now.getTime() + now.getTimezoneOffset() * 60000;
  const sgtNow = new Date(utcNow + 8 * 60 * 60000);

  const nextRun = new Date(sgtNow);
  nextRun.setHours(CONFIG.SUMMARY_HOUR_SGT, CONFIG.SUMMARY_MINUTE_SGT, 0, 0);

  if (sgtNow >= nextRun) {
    // Already past 8:30 AM, schedule for tomorrow
    nextRun.setDate(nextRun.getDate() + 1);
  }

  const msUntilNext = nextRun - sgtNow;
  const msPerDay = 24 * 60 * 60 * 1000;

  console.log(`[DAILY_SUMMARY] Scheduler started — next summary: ${nextRun.toISOString()} (in ${(msUntilNext / 3600000).toFixed(1)}h)`);

  setTimeout(() => {
    sendDailySummary();
    setInterval(sendDailySummary, msPerDay);
  }, msUntilNext);

  // Also start the post-appointment checker (runs every 15 minutes)
  setInterval(sendPostAppointmentChecks, 15 * 60 * 1000);
  console.log(`[DAILY_SUMMARY] Post-appointment checker started (every 15 min)`);
}

// ─── EXPORTS ─────────────────────────────────────────────────────

module.exports = {
  sendDailySummary,
  sendPostAppointmentChecks,
  markAppointmentAttendance,
  startDailySummaryScheduler,
  CONFIG,
};
