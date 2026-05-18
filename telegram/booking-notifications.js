/**
 * Moon Hands — Booking Notifications via Telegram
 * 
 * Real-time: Every booking (new/changed/cancelled) → instant Telegram message to clinic
 * Weekly roundup: At clinic closing time → summary of all upcoming bookings
 * 
 * Why Telegram? Clinic staff already use it. No new app to learn.
 */

require('dotenv').config();
const { formatDateSG, formatTimeSG, getDayName } = require('../utils/date-helpers');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

// ─── TELEGRAM SEND HELPER ────────────────────────────────────────

async function sendTelegramMessage(text, chatId = ADMIN_CHAT_ID) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('[BOOKING_NOTIFY] Telegram send failed:', err.message);
  }
}

// ─── REAL-TIME BOOKING NOTIFICATIONS ─────────────────────────────

/**
 * Send instant notification when a booking is created.
 * Clinic sees this immediately on their phone.
 */
async function notifyBookingCreated(appointment, clinicConfig) {
  const chatId = clinicConfig.telegram_chat_id || ADMIN_CHAT_ID;
  const dateStr = formatDateSG(appointment.date);
  const timeStr = formatTimeSG(appointment.time);
  const dayName = getDayName(appointment.date);
  
  const message = [
    `✅ *NEW BOOKING*`,
    ``,
    `📅 *${dayName}, ${dateStr} at ${timeStr}*`,
    `👤 *${escapeMarkdown(appointment.patient_name || 'Unknown')}*`,
    `📱 ${escapeMarkdown(appointment.patient_phone || 'N/A')}`,
    `🩺 ${escapeMarkdown(appointment.treatment || 'General consultation')}`,
    appointment.notes ? `📝 ${escapeMarkdown(appointment.notes)}` : '',
    ``,
    appointment.status === 'pending' 
      ? `⏳ *Status: Pending your approval*\nReply /approve ${appointment.id?.slice(0, 6) || ''} to confirm`
      : `✅ *Status: Confirmed*`,
    ``,
    `_Received: ${formatTimeSG(new Date())}_`,
  ].filter(Boolean).join('\n');
  
  await sendTelegramMessage(message, chatId);
}

/**
 * Send notification when a booking is cancelled.
 */
async function notifyBookingCancelled(appointment, clinicConfig, reason = '') {
  const chatId = clinicConfig.telegram_chat_id || ADMIN_CHAT_ID;
  const dateStr = formatDateSG(appointment.date);
  const timeStr = formatTimeSG(appointment.time);
  
  const message = [
    `❌ *BOOKING CANCELLED*`,
    ``,
    `📅 *${dateStr} at ${timeStr}*`,
    `👤 *${escapeMarkdown(appointment.patient_name || 'Unknown')}*`,
    `🩺 ${escapeMarkdown(appointment.treatment || 'General consultation')}`,
    reason ? `📝 Reason: ${escapeMarkdown(reason)}` : '',
    ``,
    `_Cancelled at: ${formatTimeSG(new Date())}_`,
  ].filter(Boolean).join('\n');
  
  await sendTelegramMessage(message, chatId);
}

/**
 * Send notification when a booking is rescheduled.
 */
async function notifyBookingRescheduled(oldAppt, newAppt, clinicConfig) {
  const chatId = clinicConfig.telegram_chat_id || ADMIN_CHAT_ID;
  const oldDate = formatDateSG(oldAppt.date);
  const oldTime = formatTimeSG(oldAppt.time);
  const newDate = formatDateSG(newAppt.date);
  const newTime = formatTimeSG(newAppt.time);
  
  const message = [
    `🔄 *BOOKING RESCHEDULED*`,
    ``,
    `👤 *${escapeMarkdown(newAppt.patient_name || 'Unknown')}*`,
    `🩺 ${escapeMarkdown(newAppt.treatment || 'General consultation')}`,
    ``,
    `*FROM:* ${oldDate} at ${oldTime}`,
    `*TO:* ${newDate} at ${newTime}`,
    ``,
    newAppt.status === 'pending'
      ? `⏳ *Status: Pending your approval*\nReply /approve ${newAppt.id?.slice(0, 6) || ''} to confirm`
      : `✅ *Status: Confirmed*`,
    ``,
    `_Updated: ${formatTimeSG(new Date())}_`,
  ].filter(Boolean).join('\n');
  
  await sendTelegramMessage(message, chatId);
}

// ─── WEEKLY ROUNDUP ──────────────────────────────────────────────

/**
 * Send a weekly summary of all upcoming bookings.
 * Sent at clinic closing time (e.g., 8pm on the last open day of the week).
 * 
 * Shows: Monday → next open day, all confirmed + pending bookings.
 */
async function sendWeeklyRoundup(clinicConfig, supabase) {
  const chatId = clinicConfig.telegram_chat_id || ADMIN_CHAT_ID;
  const clinicId = clinicConfig.id;
  
  // Get today's date and the end of the week (next 7 days)
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('client_id', clinicId)
    .gte('date', today.toISOString().split('T')[0])
    .lte('date', nextWeek.toISOString().split('T')[0])
    .order('date', { ascending: true })
    .order('time', { ascending: true });
  
  if (error) {
    console.error('[BOOKING_NOTIFY] Weekly roundup query failed:', error.message);
    return;
  }
  
  if (!appointments || appointments.length === 0) {
    await sendTelegramMessage(
      `📅 *WEEKLY ROUNDUP*\n\n` +
      `No bookings scheduled for the next 7 days.\n\n` +
      `_Clinic: ${escapeMarkdown(clinicConfig.clinic_name || 'Unknown')}_`,
      chatId
    );
    return;
  }
  
  // Group by date
  const byDate = {};
  for (const appt of appointments) {
    if (!byDate[appt.date]) byDate[appt.date] = [];
    byDate[appt.date].push(appt);
  }
  
  // Build message
  const lines = [
    `📅 *WEEKLY BOOKING ROUNDUP*`,
    `🏥 ${escapeMarkdown(clinicConfig.clinic_name || 'Your Clinic')}`,
    `📆 ${formatDateSG(today.toISOString())} — ${formatDateSG(nextWeek.toISOString())}`,
    ``,
    `*Total: ${appointments.length} appointment${appointments.length !== 1 ? 's' : ''}*`,
    `✅ Confirmed: ${appointments.filter(a => a.status === 'confirmed').length}`,
    `⏳ Pending: ${appointments.filter(a => a.status === 'pending').length}`,
    ``,
  ];
  
  for (const [date, appts] of Object.entries(byDate)) {
    const dayName = getDayName(date);
    lines.push(`*${dayName}, ${formatDateSG(date)}*`);
    for (const appt of appts) {
      const statusEmoji = appt.status === 'confirmed' ? '✅' : '⏳';
      lines.push(`  ${statusEmoji} ${formatTimeSG(appt.time)} — ${escapeMarkdown(appt.patient_name || '?')} (${escapeMarkdown(appt.treatment || 'General')})`);
    }
    lines.push('');
  }
  
  lines.push(`Reply /approveall to confirm all pending bookings, or /reject [ID] to cancel.`);
  
  await sendTelegramMessage(lines.join('\n'), chatId);
}

// ─── SLOT AVAILABILITY CHECK ─────────────────────────────────────

/**
 * Check if a time slot is already booked.
 * Prevents double-booking.
 * 
 * @returns {boolean} true if slot is available
 */
async function isSlotAvailable(supabase, clinicId, date, time, durationMinutes = 30) {
  const { data: existing, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('client_id', clinicId)
    .eq('date', date)
    .eq('status', 'confirmed')
    .not('id', 'is', null);
  
  if (error) {
    console.error('[BOOKING_NOTIFY] Slot availability check failed:', error.message);
    return false; // conservative: assume booked if we can't check
  }
  
  if (!existing || existing.length === 0) return true;
  
  // Parse requested time
  const [reqHour, reqMin] = time.split(':').map(Number);
  const reqStart = reqHour * 60 + reqMin;
  const reqEnd = reqStart + durationMinutes;
  
  // Check overlap with existing bookings
  for (const appt of existing) {
    const [exHour, exMin] = appt.time.split(':').map(Number);
    const exStart = exHour * 60 + exMin;
    const exEnd = exStart + (appt.duration_minutes || 30);
    
    // Overlap check: (StartA < EndB) and (EndA > StartB)
    if (reqStart < exEnd && reqEnd > exStart) {
      return false; // Slot overlaps with existing booking
    }
  }
  
  return true;
}

// ─── ESCAPE MARKDOWN ─────────────────────────────────────────────

function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
}

// ─── EXPORTS ─────────────────────────────────────────────────────

// ─── DAILY CLOSING SUMMARY ───────────────────────────────────────

/**
 * Send a daily summary of tomorrow's bookings when clinic closes.
 * NOT at midnight — at the clinic's actual closing time from onboarding.
 * 
 * Format (clean, simple):
 *   Monday 18/5 — 9-10am — Sara — Botox
 *   Tuesday 19/5 — 9-10am — Lisa — Botox
 *                      — 11-2pm — Alex — Botox + HIFU
 */
async function sendDailyClosingSummary(clinicConfig, supabase) {
  const chatId = clinicConfig.telegram_chat_id || ADMIN_CHAT_ID;
  const clinicId = clinicConfig.id;
  
  // Get tomorrow's date (Singapore time)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  // Fetch tomorrow's bookings
  const { data: bookings, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('client_id', clinicId)
    .eq('appointment_date', tomorrowStr)
    .in('status', ['confirmed', 'pending'])
    .order('appointment_time', { ascending: true });
  
  if (error) {
    console.error('[BOOKING_NOTIFY] Daily closing summary query failed:', error.message);
    return;
  }
  
  const clinicName = clinicConfig.clinic_name || 'Your Clinic';
  const dayName = getDayName(tomorrowStr);
  const dateStr = formatDateSG(tomorrowStr);
  
  let message;
  
  if (!bookings || bookings.length === 0) {
    message = [
      `📅 *Tomorrow's Schedule — ${dayName}, ${dateStr}*`,
      `🏥 ${escapeMarkdown(clinicName)}`,
      ``,
      `No bookings scheduled for tomorrow.`,
      ``,
      `_Clinic closing summary — have a good evening!_`,
    ].join('\n');
  } else {
    const confirmedCount = bookings.filter(b => b.status === 'confirmed').length;
    const pendingCount = bookings.filter(b => b.status === 'pending').length;
    
    const lines = [
      `📅 *Tomorrow's Schedule — ${dayName}, ${dateStr}*`,
      `🏥 ${escapeMarkdown(clinicName)}`,
      ``,
      `*${bookings.length} appointment${bookings.length !== 1 ? 's' : ''}*${confirmedCount > 0 ? ` (${confirmedCount} confirmed)` : ''}${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}`,
      ``,
    ];
    
    for (const b of bookings) {
      // Calculate end time
      const [h, m] = b.appointment_time.split(':').map(Number);
      const duration = b.duration_minutes || clinicConfig.appointment_duration_minutes || 30;
      const startMinutes = h * 60 + m;
      const endMinutes = startMinutes + parseInt(duration);
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}-${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`;
      
      const statusEmoji = b.status === 'confirmed' ? '✅' : '⏳';
      lines.push(`${statusEmoji} ${timeStr} — ${escapeMarkdown(b.customer_name || '?')} — ${escapeMarkdown(b.service_name || 'General')}`);
    }
    
    if (pendingCount > 0) {
      lines.push('');
      lines.push('⏳ *Pending bookings need your approval.* Reply /approve [ID] to confirm.');
    }
    
    lines.push('');
    lines.push('_Have a good evening! 🌙_');
    
    message = lines.join('\n');
  }
  
  await sendTelegramMessage(message, chatId);
}

// ─── EXPORTS ─────────────────────────────────────────────────────

module.exports = {
  notifyBookingCreated,
  notifyBookingCancelled,
  notifyBookingRescheduled,
  sendWeeklyRoundup,
  sendDailyClosingSummary,
  isSlotAvailable,
};
