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

// Multi-clinic notification sender (enforces clinic isolation)
const { sendClinicNotification, sendAdminOnly } = require('./multi-clinic-sender');

// ─── PENDING ALTERNATIVES TRACKING ───────────────────────────────
// Maps: clinic staff chat_id → { bookingId, clinicId, timestamp }
// Used when clinic staff suggests an alternative timeslot
const pendingAlternatives = new Map();
const ALT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minute timeout
const MAX_PENDING_ALTS = 1000; // Security: prevent memory exhaustion

function setPendingAlternative(chatId, bookingId) {
  // Security: enforce max size with LRU eviction
  if (pendingAlternatives.size >= MAX_PENDING_ALTS) {
    const oldestKey = pendingAlternatives.keys().next().value;
    pendingAlternatives.delete(oldestKey);
    console.warn('[BOOKING_NOTIFY] pendingAlternatives at max size, evicted oldest entry');
  }
  pendingAlternatives.set(chatId, { bookingId, timestamp: Date.now() });
}

function cleanupExpiredAlternatives() {
  const now = Date.now();
  let cleaned = 0;
  for (const [chatId, data] of pendingAlternatives) {
    if (now - data.timestamp > ALT_TIMEOUT_MS) {
      pendingAlternatives.delete(chatId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[BOOKING_NOTIFY] Cleaned up ${cleaned} expired alternative suggestion(s)`);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredAlternatives, 5 * 60 * 1000);

// ─── TELEGRAM SEND HELPER ────────────────────────────────────────

async function sendTelegramMessage(text, chatId = ADMIN_CHAT_ID, replyMarkup = undefined) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  try {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
  const apptId = appointment.id || '';
  
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
      ? `⏳ *Status: Pending your approval*`
      : `✅ *Status: Confirmed*`,
    ``,
    `_Received: ${formatTimeSG(new Date())}_`,
  ].filter(Boolean).join('\n');
  
  // Add inline buttons for pending bookings
  const clinicId = clinicConfig.id || clinicConfig.clinic_id || null;
  const replyMarkup = appointment.status === 'pending' ? {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `approve_${apptId}` },
        { text: '❌ Reject', callback_data: `reject_${apptId}` }
      ],
      [
        { text: '🔄 Suggest Alternative Time', callback_data: `suggest_alt_${apptId}` }
      ]
    ]
  } : undefined;
  
  // Send via multi-clinic sender (scopes to clinic's telegram_chat_ids + admin copy)
  if (clinicId) {
    await sendClinicNotification(clinicId, message, { replyMarkup });
  } else {
    // Fallback for legacy calls without clinicId
    await sendTelegramMessage(message, chatId, replyMarkup);
  }
}

/**
 * Send notification when a booking is cancelled.
 */
async function notifyBookingCancelled(appointment, clinicConfig, reason = '') {
  const dateStr = formatDateSG(appointment.date);
  const timeStr = formatTimeSG(appointment.time);
  const clinicId = clinicConfig.id || clinicConfig.clinic_id || null;
  
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
  
  // SECURITY: Always use multi-clinic sender (never legacy direct send)
  if (clinicId) {
    await sendClinicNotification(clinicId, message);
  } else {
    console.warn('[BOOKING_NOTIFY] notifyBookingCancelled called without clinicId — sending admin-only');
    await sendAdminOnly(message);
  }
}

/**
 * Send notification when a booking is rescheduled.
 */
async function notifyBookingRescheduled(oldAppt, newAppt, clinicConfig) {
  const oldDate = formatDateSG(oldAppt.date);
  const oldTime = formatTimeSG(oldAppt.time);
  const newDate = formatDateSG(newAppt.date);
  const newTime = formatTimeSG(newAppt.time);
  const clinicId = clinicConfig.id || clinicConfig.clinic_id || null;
  
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
  
  // SECURITY: Always use multi-clinic sender
  if (clinicId) {
    await sendClinicNotification(clinicId, message);
  } else {
    console.warn('[BOOKING_NOTIFY] notifyBookingRescheduled called without clinicId — sending admin-only');
    await sendAdminOnly(message);
  }
}

// ─── WEEKLY ROUNDUP ──────────────────────────────────────────────

/**
 * Send a weekly summary of all upcoming bookings.
 * Sent at clinic closing time (e.g., 8pm on the last open day of the week).
 * 
 * Shows: Monday → next open day, all confirmed + pending bookings.
 */
async function sendWeeklyRoundup(clinicConfig, supabase) {
  const clinicId = clinicConfig.id;
  
  // SECURITY: Must have clinicId to scope notification correctly
  if (!clinicId) {
    console.error('[BOOKING_NOTIFY] sendWeeklyRoundup called without clinicId — aborting');
    return;
  }
  
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
    await sendClinicNotification(
      clinicId,
      `📅 *WEEKLY ROUNDUP*\n\n` +
      `No bookings scheduled for the next 7 days.\n\n` +
      `_Clinic: ${escapeMarkdown(clinicConfig.clinic_name || 'Unknown')}_`
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
  
  // SECURITY: Use multi-clinic sender (scoped to clinic's telegram_chat_ids[])
  await sendClinicNotification(clinicId, lines.join('\n'));
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
  const clinicId = clinicConfig.id;
  
  // SECURITY: Must have clinicId to scope notification correctly
  if (!clinicId) {
    console.error('[BOOKING_NOTIFY] sendDailyClosingSummary called without clinicId — aborting');
    return;
  }
  
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
  
  // SECURITY: Use multi-clinic sender (scoped to clinic's telegram_chat_ids[])
  await sendClinicNotification(clinicId, message);
}

// ─── ALTERNATIVE TIMESLOT FLOW ───────────────────────────────────

/**
 * Step 1: Clinic staff suggests an alternative time
 * Called when clinic replies to the "Suggest Alternative Time" prompt
 */
async function handleClinicSuggestAlternative(staffChatId, alternativeTimeText) {
  const pending = pendingAlternatives.get(staffChatId);
  if (!pending) {
    return { success: false, error: 'No pending alternative suggestion. Please tap 🔄 Suggest Alternative on the booking notification first.' };
  }
  
  // Check timeout
  if (Date.now() - pending.timestamp > ALT_TIMEOUT_MS) {
    pendingAlternatives.delete(staffChatId);
    return { success: false, error: 'Alternative suggestion timed out. Please try again.' };
  }
  
  try {
    // Get booking details
    const { data: booking } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', pending.bookingId)
      .single();
    
    if (!booking) {
      pendingAlternatives.delete(staffChatId);
      return { success: false, error: 'Booking not found.' };
    }
    
    // Store the alternative in the booking record
    await supabase
      .from('appointments')
      .update({ 
        alternative_time_suggested: alternativeTimeText,
        status: 'pending_alternative' 
      })
      .eq('id', pending.bookingId);
    
    // Clear pending
    pendingAlternatives.delete(staffChatId);
    
    // Send alternative to patient via WhatsApp
    const { sendWhatsAppMessage } = require('../jobs/reminders');
    await sendWhatsAppMessage(
      booking.patient_phone,
      `📅 *Alternative Time Suggested*\n\n` +
      `Your clinic suggests: *${alternativeTimeText}*\n\n` +
      `Would this work for you? Reply YES to confirm, or suggest another time.`,
      booking.clinic_id
    );
    
    return { success: true, booking, alternativeTime: alternativeTimeText };
  } catch (err) {
    console.error('[BOOKING_NOTIFY] Alternative suggestion error:', err.message);
    return { success: false, error: 'Failed to process alternative suggestion.' };
  }
}

/**
 * Step 2: Patient confirms the alternative time
 * Called when patient replies "YES" to the alternative time suggestion
 */
async function handlePatientConfirmAlternative(bookingId) {
  try {
    const { data: booking } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', bookingId)
      .single();
    
    if (!booking || !booking.alternative_time_suggested) {
      return { success: false, error: 'No alternative time found for this booking.' };
    }
    
    // Update booking: confirmed with alternative time
    await supabase
      .from('appointments')
      .update({ 
        status: 'confirmed',
        notes: (booking.notes || '') + ` | Alternative time: ${booking.alternative_time_suggested}`
      })
      .eq('id', bookingId);
    
    // Notify clinic staff
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', booking.clinic_id)
      .single();
    
    if (client) {
      await sendClinicNotification(
        client.id,
        `✅ *Patient Accepted Alternative Time*\n\n` +
        `👤 ${escapeMarkdown(booking.patient_name || 'Patient')}\n` +
        `📅 New time: *${booking.alternative_time_suggested}*\n` +
        `🩺 ${escapeMarkdown(booking.treatment || 'General consultation')}\n\n` +
        `Booking confirmed.`,
        { includeAdmin: true }
      );
    }
    
    return { success: true, booking };
  } catch (err) {
    console.error('[BOOKING_NOTIFY] Patient confirm alternative error:', err.message);
    return { success: false, error: 'Failed to confirm alternative.' };
  }
}

// ─── EXPORTS ─────────────────────────────────────────────────────

module.exports = {
  notifyBookingCreated,
  notifyBookingCancelled,
  notifyBookingRescheduled,
  sendWeeklyRoundup,
  sendDailyClosingSummary,
  isSlotAvailable,
  pendingAlternatives,
  setPendingAlternative,
  handleClinicSuggestAlternative,
  handlePatientConfirmAlternative,
  escapeMarkdown,
};
