/**
 * Moon Hands - Appointment Reminder System
 * 
 * Cron jobs that run every 15 minutes:
 *   1. Send 24-hour reminder (if booking_reminder_24h enabled)
 *   2. Send 1-hour reminder (if booking_reminder_1h enabled)
 *   3. Send 48-hour follow-up (if booking_followup_48h enabled)
 * 
 * Uses 360dialog to send WhatsApp messages
 */

const db = require('../supabase/client');

const REMINDER_MESSAGES = {
  '24h': (name, treatment, date, time) => 
    `Hi ${name}! This is a friendly reminder about your upcoming appointment:\n\n` +
    `Treatment: ${treatment}\n` +
    `Date: ${date}\n` +
    `Time: ${time}\n\n` +
    `Please arrive 10 minutes early. If you need to reschedule, reply to this message or call us. See you soon!`,

  '1h': (name, treatment, time) =>
    `Hi ${name}! Your ${treatment} appointment is in 1 hour at ${time}. ` +
    `Please make your way to the clinic. See you soon!`,

  'followup': (name, treatment) =>
    `Hi ${name}! Thank you for visiting us for your ${treatment} treatment. ` +
    `We hope you had a great experience. If you have any questions about aftercare, feel free to reply here. ` +
    `We'd love to see you again soon!`,

  'approval': (name, treatment, date, time) =>
    `Hi ${name}! Your ${treatment} appointment for ${date} at ${time} has been confirmed. ` +
    `Please arrive 10 minutes early. If you need to reschedule, reply here. See you soon!`
};

// ─── SEND WHATSAPP MESSAGE VIA 360DIALOG ─────────────────────────

// ─── SEND WHATSAPP MESSAGE VIA 360DIALOG ─────────────────────────
// Tries endpoints in order: v2 → waba → sandbox (same as webhook.js)
// Uses /messages path (not /v1/messages) per 360dialog docs.

const D360_ENDPOINTS = [
  'https://waba-v2.360dialog.io/messages',
  'https://waba.360dialog.io/messages',
  'https://waba-sandbox.360dialog.io/messages'
];

async function sendWhatsAppMessage(phoneNumber, message, apiKey) {
  const key = apiKey || process.env.D360_API_KEY;
  if (!key) {
    console.error('[REMINDER] No D360_API_KEY available');
    return false;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phoneNumber,
    type: 'text',
    text: { body: message }
  };

  for (const endpoint of D360_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'D360-Api-Key': key
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log(`[REMINDER] Sent via ${endpoint.split('/')[2]}`);
        return true;
      }

      const errorText = await response.text();
      console.warn(`[REMINDER] ${endpoint} failed: ${response.status} ${errorText.substring(0, 100)}`);
    } catch (err) {
      console.warn(`[REMINDER] ${endpoint} error: ${err.message}`);
    }
  }

  console.error('[REMINDER] All endpoints failed');
  return false;
}

// ─── SG TIME HELPERS (v2.2.6) ────────────────────────────────────
// The Render server runs in UTC; appointments live in Asia/Singapore.
// All reminder math MUST be SG — UTC math fired the 1h reminder 7 hours
// LATE in prod (2026-10-29: "in 1 hour at 13:00" arrived 19:51 SG) and
// the 24h reminder at 00:06 SG on the appointment day itself.
// Canonical SG clock lives in utils/date-helpers (v2.2.7) — re-exported
// below so existing callers/tests keep working.
const { sgNowParts } = require('../utils/date-helpers');

// 45–75 minute lookahead that survives midnight (00:15 appointment at
// 23:15 is +60 min, not −1380).
function inOneHourWindow(aptTime, nowMinutes) {
  const aptMinutes = minutesFromTime(aptTime);
  if (aptMinutes === null || isNaN(aptMinutes)) return false;
  const diff = (((aptMinutes - nowMinutes) % 1440) + 1440) % 1440;
  return diff >= 45 && diff <= 75;
}

// Never WhatsApp patients in the middle of the night.
const SEND_WINDOW = { startHour: 8, endHour: 21 }; // SG
function inSendWindow(nowHour) {
  return nowHour >= SEND_WINDOW.startHour && nowHour < SEND_WINDOW.endHour;
}

// ─── 24-HOUR REMINDERS ────────────────────────────────────────────

async function send24hReminders() {
  const sg = sgNowParts();
  if (!inSendWindow(sg.nowHour)) return; // business hours only (SG)
  const dateStr = sg.tomorrowStr;

  // Get all clients with reminder_24h enabled
  const { data: configs } = await db.supabase
    .from('client_configs')
    .select('client_id, booking_reminder_24h')
    .eq('booking_reminder_24h', true);

  if (!configs || configs.length === 0) return;

  const clientIds = configs.map(c => c.client_id);

  // Get appointments for tomorrow
  const { data: appointments } = await db.supabase
    .from('appointments')
    .select('*')
    .in('client_id', clientIds)
    .eq('appointment_date', dateStr)
    .eq('status', 'confirmed')
    .eq('reminder_24h_sent', false)

  if (!appointments || appointments.length === 0) return;

  for (const apt of appointments) {
    const message = REMINDER_MESSAGES['24h'](
      apt.customer_name,
      apt.service,
      apt.appointment_date,
      apt.appointment_time
    );

    const sent = await sendWhatsAppMessage(
      apt.customer_phone,
      message
    );

    if (sent) {
      await db.supabase
        .from('appointments')
        .update({ reminder_24h_sent: true })
        .eq('id', apt.id);
    }
  }

  console.log(`[REMINDERS] Sent ${appointments.length} 24h reminders`);
}

// ─── 1-HOUR REMINDERS ─────────────────────────────────────────────

async function send1hReminders() {
  const sg = sgNowParts();
  const dateStr = sg.oneHourDateStr;

  const { data: configs } = await db.supabase
    .from('client_configs')
    .select('client_id, booking_reminder_1h')
    .eq('booking_reminder_1h', true);

  if (!configs || configs.length === 0) return;

  const clientIds = configs.map(c => c.client_id);

  // Get appointments ~1 hour from now (within 15 min window)
  const { data: appointments } = await db.supabase
    .from('appointments')
    .select('*')
    .in('client_id', clientIds)
    .eq('appointment_date', dateStr)
    .eq('status', 'confirmed')
    .eq('reminder_1h_sent', false)

  if (!appointments) return;

  // Filter to appointments within 45-75 minutes from now (SG clock)
  const targetApts = appointments.filter(apt => inOneHourWindow(apt.appointment_time, sg.nowMinutes));

  for (const apt of targetApts) {
    const message = REMINDER_MESSAGES['1h'](
      apt.customer_name,
      apt.service,
      apt.appointment_time
    );

    const sent = await sendWhatsAppMessage(
      apt.customer_phone,
      message
    );

    if (sent) {
      await db.supabase
        .from('appointments')
        .update({ reminder_1h_sent: true })
        .eq('id', apt.id);
    }
  }

  console.log(`[REMINDERS] Sent ${targetApts.length} 1h reminders`);
}

// ─── 48-HOUR FOLLOW-UP ────────────────────────────────────────────

async function send48hFollowups() {
  const sg = sgNowParts();
  if (!inSendWindow(sg.nowHour)) return; // business hours only (SG)
  const dateStr = sg.twoDaysAgoStr;

  const { data: configs } = await db.supabase
    .from('client_configs')
    .select('client_id, booking_followup_48h')
    .eq('booking_followup_48h', true);

  if (!configs || configs.length === 0) return;

  const clientIds = configs.map(c => c.client_id);

  const { data: appointments } = await db.supabase
    .from('appointments')
    .select('*')
    .in('client_id', clientIds)
    .eq('appointment_date', dateStr)
    .eq('status', 'completed')
    .eq('followup_48h_sent', false)

  if (!appointments || appointments.length === 0) return;

  for (const apt of appointments) {
    const message = REMINDER_MESSAGES['followup'](
      apt.customer_name,
      apt.service
    );

    const sent = await sendWhatsAppMessage(
      apt.customer_phone,
      message
    );

    if (sent) {
      await db.supabase
        .from('appointments')
        .update({ followup_48h_sent: true })
        .eq('id', apt.id);
    }
  }

  console.log(`[REMINDERS] Sent ${appointments.length} 48h follow-ups`);
}

// ─── APPROVAL CONFIRMATION ────────────────────────────────────────

async function sendApprovalConfirmation(appointmentId) {
  const { data: apt } = await db.supabase
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .single();

  if (!apt) return false;

  const message = REMINDER_MESSAGES['approval'](
    apt.customer_name,
    apt.service,
    apt.appointment_date,
    apt.appointment_time
  );

  return await sendWhatsAppMessage(
    apt.customer_phone,
    message
  );
}

// ─── HELPERS ──────────────────────────────────────────────────────

function minutesFromTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// ─── CRON RUNNER ──────────────────────────────────────────────────

async function runAllReminders() {
  console.log('[REMINDERS] Running reminder jobs...');
  await send24hReminders();
  await send1hReminders();
  await send48hFollowups();
  console.log('[REMINDERS] Complete');
}

// ─── EXPORTS ──────────────────────────────────────────────────────

module.exports = {
  runAllReminders,
  send24hReminders,
  send1hReminders,
  send48hFollowups,
  sendApprovalConfirmation,
  sendWhatsAppMessage,
  sgNowParts,
  inOneHourWindow,
  inSendWindow,
  SEND_WINDOW
};
