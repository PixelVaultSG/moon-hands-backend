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
const { sgNowParts, getTodaySG } = require('../utils/date-helpers');

function minutesFromTimeStr(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : null;
}

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

  const today = getTodaySG(); // v2.2.7: SG date, not server UTC
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

  // v2.3.7: route to the CLINIC's Telegram chats via the hardened sender
  // (retry + plain-text fallback + delivery log), with a prefixed observational
  // copy to Moon Hands master admin. Was: direct sendMessage to
  // TELEGRAM_ADMIN_CHAT_ID only — a real clinic's front desk never saw this.
  const { sendClinicNotification } = require('../telegram/multi-clinic-sender');

  // Build the message
  const lines = [
    `📅 *Today's Appointments — ${clinic.name}*`,
    `${today} (${new Date().toLocaleDateString('en-SG', { weekday: 'long' })})
\n`,
    `You have *${appointments.length}* appointment(s) today:\n`,
  ];

  // Build inline keyboard with YES/NO buttons per appointment
  // v2.3.6: callback_data is just the appointment UUID. Telegram hard-limits
  // callback_data to 64 bytes — `appt_yes:{slug|uuid}:{uuid}` was 72-82 bytes,
  // so Telegram rejected EVERY attendance message with BUTTON_DATA_INVALID and
  // the feature never worked in prod. `appt_yes:{uuid}` = 45 bytes.
  const buttons = [];

  appointments.forEach((appt, i) => {
    const time = formatTime(appt.appointment_time);
    lines.push(
      `${i + 1}. *${appt.customer_name}*\n` +
      `   ${appt.service} at ${time}\n` +
      `   📱 ${appt.customer_phone}\n`
    );

    buttons.push([
      { text: `✅ ${appt.customer_name} showed up`, callback_data: `appt_yes:${appt.id}` },
    ]);
    buttons.push([
      { text: `❌ ${appt.customer_name} no-show`, callback_data: `appt_no:${appt.id}` },
    ]);
  });

  lines.push(`\n_Tap a button after each appointment to track attendance._`);
  lines.push(`_This data feeds into your weekly AI optimization report._`);

  // Markdown (v1): the summary is full of MarkdownV2-hostile characters —
  // parentheses in "(DEMO)" / "appointment(s)", periods, hyphens — so V2
  // rejected every send and clinics always saw the plain fallback.
  const result = await sendClinicNotification(clinic.id, lines.join('\n'), {
    parseMode: 'Markdown',
    replyMarkup: { inline_keyboard: buttons },
  });
  if (result.sentTo.length > 0 || result.adminSent) {
    console.log(`[DAILY_SUMMARY] ✅ Sent ${appointments.length} appt(s) for ${clinic.slug} (staff: ${result.sentTo.length}, admin: ${result.adminSent})`);
    // v2.3.8: remember which messages carry the summary keyboard so a tap on
    // ANY attendance button can rebuild every copy (cross-message sync).
    const refs = (result.deliveries || [])
      .filter(d => d.hasButtons && d.messageId)
      .map(d => ({ chatId: d.chatId, messageId: d.messageId }));
    if (refs.length > 0) await kvSet(`attsum:${clinic.id}:${today}`, { refs });
  } else {
    console.error(`[DAILY_SUMMARY] ❌ Summary for ${clinic.slug} reached NOBODY — check telegram_chat_ids`);
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
    // v2.2.7: this query compared SG appointment times against the server's
    // UTC clock — no daytime appointment ever matched, so attendance checks
    // NEVER fired in prod (and with them, 'completed' + the 48h follow-up).
    const now = new Date();
    const sg = sgNowParts();
    const cutoffMinutes = sg.nowMinutes - CONFIG.POST_APPT_CHECK_DELAY_MIN;

    // Find appointments that:
    // - Are today (SG)
    // - Started at least POST_APPT_CHECK_DELAY_MIN minutes ago (SG clock)
    // - Still have status 'confirmed' (not yet marked)
    // - Haven't been sent a follow-up yet
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select('id, client_id, customer_name, service, appointment_time, customer_phone')
      .eq('appointment_date', sg.todayStr)
      .eq('status', 'confirmed')
      .is('attendance_checked_at', null)
      .limit(50);

    const dueAppointments = (appointments || []).filter(a => {
      const m = minutesFromTimeStr(a.appointment_time);
      return m !== null && m <= cutoffMinutes;
    });

    if (error || dueAppointments.length === 0) return;
    // keep the destructured binding — mutate in place for the loop below
    appointments.length = 0;
    appointments.push(...dueAppointments);

    const { sendClinicNotification } = require('../telegram/multi-clinic-sender');

    for (const appt of appointments) {
      try {
        const time = formatTime(appt.appointment_time);
        // v2.3.6: callback_data is just the appointment UUID (45 bytes) — the
        // old `appt_yes:{client_uuid}:{uuid}` format was 82 bytes, over
        // Telegram's 64-byte limit, so every send 400'd silently (caught below,
        // console-only) and attendance checks NEVER reached the clinic.
        // v2.3.7: routed to the CLINIC's Telegram chats (was: admin chat only).
        const result = await sendClinicNotification(appt.client_id,
          `⏰ *Attendance Check*\n\n` +
          `Did *${appt.customer_name}* show up for their *${appt.service}* appointment at *${time}*?\n\n` +
          `Please tap a button:`,
          {
            parseMode: 'Markdown',
            replyMarkup: { inline_keyboard: [
              [{ text: `✅ Yes, showed up`, callback_data: `appt_yes:${appt.id}` }],
              [{ text: `❌ No, no-show`, callback_data: `appt_no:${appt.id}` }],
            ] },
          }
        );

        // Mark as checked ONLY if delivered to at least one chat — a total
        // delivery failure must retry on the next tick (still today-only),
        // and the sender's own security_events entry makes it visible.
        if (result.sentTo.length > 0 || result.adminSent) {
          await supabase
            .from('appointments')
            .update({ attendance_checked_at: now.toISOString() })
            .eq('id', appt.id);

          // v2.3.8: remember which messages carry this check's keyboard so a
          // tap on ANY copy can settle all of them (cross-message sync).
          const refs = (result.deliveries || [])
            .filter(d => d.hasButtons && d.messageId)
            .map(d => ({ chatId: d.chatId, messageId: d.messageId }));
          if (refs.length > 0) await kvSet(`attref:${appt.id}`, { refs });

          console.log(`[DAILY_SUMMARY] ✅ Sent attendance check for ${appt.customer_name}`);
        } else {
          console.error(`[DAILY_SUMMARY] ❌ Attendance check for ${appt.customer_name} reached NOBODY — will retry next tick`);
        }
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
async function markAppointmentAttendance(appointmentId, showedUp, markedBy, opts = {}) {
  try {
    // v2.3.8: FIRST TAP WINS. Two live prompts exist per appointment (morning
    // summary + timed check); before this guard, a second/conflicting tap
    // silently overwrote the first. A marked appointment stays marked unless
    // the caller explicitly allows a same-day correction (flipAttendance).
    const { data: current, error: findErr } = await supabase
      .from('appointments')
      .select('id, client_id, appointment_date, customer_name, status, attendance_marked_at')
      .eq('id', appointmentId)
      .single();
    if (findErr || !current) throw findErr || new Error('Appointment not found');
    if (current.status === 'cancelled') {
      // Marking a cancelled booking would resurrect it as completed/no_show.
      return { success: false, error: 'cancelled', appointment: current };
    }
    if (current.attendance_marked_at && !opts.allowChange) {
      return { success: false, alreadyMarked: true, status: current.status, markedAt: current.attendance_marked_at, appointment: current };
    }

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
    return { success: true, appointment: data, status: newStatus, changed: !!current.attendance_marked_at };

  } catch (err) {
    console.error(`[DAILY_SUMMARY] Failed to mark attendance:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── ATTENDANCE MESSAGE SYNC (v2.3.8) ────────────────────────────
// The same appointment can have TWO live prompts: the morning summary (one
// message, multi-appointment keyboard) and the timed post-appointment check.
// First tap wins; every other prompt must settle so no second tap can flip
// the record. Message IDs are captured at send time and stored in kv_store
// (no schema change needed).

async function kvGet(key) {
  try {
    const { data } = await supabase.from('kv_store').select('data').eq('key', key).single();
    return data?.data ?? null;
  } catch (e) { return null; }
}
async function kvSet(key, data) {
  try { await supabase.from('kv_store').upsert({ key, data }); }
  catch (e) { console.warn('[ATTENDANCE] kvSet failed:', e.message); }
}
async function kvDel(key) {
  try { await supabase.from('kv_store').delete().eq('key', key); }
  catch (e) { /* best-effort */ }
}

// Correction path (b): the settled state IS a button — tapping it within the
// same SG day re-opens a confirm. `appt_flip:{uuid}` = 46 bytes (limit 64).
function settledKeyboard(apptId) {
  return [[{ text: '↩️ Change attendance', callback_data: `appt_flip:${apptId}` }]];
}

// Rebuild the shared morning-summary keyboard WITHOUT marked appointments,
// so other patients' buttons stay live after one is settled.
async function buildSummaryKeyboard(clinicId, date) {
  const { data: appts } = await supabase
    .from('appointments')
    .select('id, customer_name, attendance_marked_at')
    .eq('client_id', clinicId)
    .eq('appointment_date', date)
    .in('status', ['confirmed', 'pending'])
    .order('appointment_time');
  const remaining = (appts || []).filter(a => !a.attendance_marked_at);
  if (remaining.length === 0) return null;
  const kb = [];
  for (const a of remaining) {
    kb.push([{ text: `✅ ${a.customer_name} showed up`, callback_data: `appt_yes:${a.id}` }]);
    kb.push([{ text: `❌ ${a.customer_name} no-show`, callback_data: `appt_no:${a.id}` }]);
  }
  return kb;
}

/**
 * Settle every live prompt for an appointment: per-appointment check messages
 * get the settled (↩️ change) keyboard; the shared morning-summary keyboard is
 * rebuilt minus this appointment. Returns a Set of "chatId:messageId" edited,
 * so handlers can settle the tapped message itself if refs missed it.
 */
async function syncAttendanceMessages(appt) {
  const bot = require('../telegram/bot').bot;
  const edited = new Set();
  const settled = { inline_keyboard: settledKeyboard(appt.id) };

  const checkRefs = (await kvGet(`attref:${appt.id}`))?.refs || [];
  for (const r of checkRefs) {
    try {
      await bot.telegram.editMessageReplyMarkup(r.chatId, r.messageId, undefined, settled);
      edited.add(`${r.chatId}:${r.messageId}`);
    } catch (e) { console.warn('[ATTENDANCE] settle check msg failed:', e.message); }
  }
  if (checkRefs.length > 0) await kvDel(`attref:${appt.id}`);

  const sumKey = `attsum:${appt.client_id}:${appt.appointment_date}`;
  const sumRefs = (await kvGet(sumKey))?.refs || [];
  if (sumRefs.length > 0) {
    const remainingKb = await buildSummaryKeyboard(appt.client_id, appt.appointment_date);
    for (const r of sumRefs) {
      try {
        await bot.telegram.editMessageReplyMarkup(r.chatId, r.messageId, undefined, { inline_keyboard: remainingKb || [] });
        edited.add(`${r.chatId}:${r.messageId}`);
      } catch (e) { console.warn('[ATTENDANCE] rebuild summary msg failed:', e.message); }
    }
    if (!remainingKb) await kvDel(sumKey);
  }
  return edited;
}

async function getAttendanceState(apptId) {
  const { data } = await supabase
    .from('appointments')
    .select('id, client_id, appointment_date, customer_name, status, attendance_marked_at, attendance_marked_by')
    .eq('id', apptId)
    .single();
  return data || null;
}

/**
 * Correction path (b): flip an already-marked attendance to its opposite.
 * Same SG day only — older records feed weekly math and are locked here.
 */
async function flipAttendance(apptId, markedBy) {
  const current = await getAttendanceState(apptId);
  if (!current) return { success: false, error: 'not_found' };
  if (!current.attendance_marked_at) return { success: false, error: 'not_marked', appointment: current };
  if (current.appointment_date !== getTodaySG()) return { success: false, error: 'past_day', appointment: current };
  const showedUp = current.status !== 'completed'; // completed → no_show, no_show → completed
  const result = await markAppointmentAttendance(apptId, showedUp, markedBy, { allowChange: true });
  return { ...result, flippedTo: result.success ? result.status : null };
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
  // v2.3.8: attendance integrity (cross-message sync + same-day correction)
  syncAttendanceMessages,
  settledKeyboard,
  buildSummaryKeyboard,
  getAttendanceState,
  flipAttendance,
  CONFIG,
};
