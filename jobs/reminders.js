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

// ─── 24-HOUR REMINDERS ────────────────────────────────────────────

async function send24hReminders() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];

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
    .select('*, clients(whatsapp_api_key)')
    .in('client_id', clientIds)
    .eq('appointment_date', dateStr)
    .eq('status', 'confirmed')
    .eq('reminder_24h_sent', false)
    .not('clients.whatsapp_api_key', 'is', null);

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
      message,
      apt.clients?.whatsapp_api_key
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
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  const dateStr = oneHourFromNow.toISOString().split('T')[0];
  const timeStr = oneHourFromNow.toTimeString().slice(0, 5);

  const { data: configs } = await db.supabase
    .from('client_configs')
    .select('client_id, booking_reminder_1h')
    .eq('booking_reminder_1h', true);

  if (!configs || configs.length === 0) return;

  const clientIds = configs.map(c => c.client_id);

  // Get appointments ~1 hour from now (within 15 min window)
  const { data: appointments } = await db.supabase
    .from('appointments')
    .select('*, clients(whatsapp_api_key)')
    .in('client_id', clientIds)
    .eq('appointment_date', dateStr)
    .eq('status', 'confirmed')
    .eq('reminder_1h_sent', false)
    .not('clients.whatsapp_api_key', 'is', null);

  if (!appointments) return;

  // Filter to appointments within 45-75 minutes from now
  const targetApts = appointments.filter(apt => {
    const aptMinutes = minutesFromTime(apt.appointment_time);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const diff = aptMinutes - nowMinutes;
    return diff >= 45 && diff <= 75;
  });

  for (const apt of targetApts) {
    const message = REMINDER_MESSAGES['1h'](
      apt.customer_name,
      apt.service,
      apt.appointment_time
    );

    const sent = await sendWhatsAppMessage(
      apt.customer_phone,
      message,
      apt.clients?.whatsapp_api_key
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
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const dateStr = twoDaysAgo.toISOString().split('T')[0];

  const { data: configs } = await db.supabase
    .from('client_configs')
    .select('client_id, booking_followup_48h')
    .eq('booking_followup_48h', true);

  if (!configs || configs.length === 0) return;

  const clientIds = configs.map(c => c.client_id);

  const { data: appointments } = await db.supabase
    .from('appointments')
    .select('*, clients(whatsapp_api_key)')
    .in('client_id', clientIds)
    .eq('appointment_date', dateStr)
    .eq('status', 'completed')
    .eq('followup_48h_sent', false)
    .not('clients.whatsapp_api_key', 'is', null);

  if (!appointments || appointments.length === 0) return;

  for (const apt of appointments) {
    const message = REMINDER_MESSAGES['followup'](
      apt.customer_name,
      apt.service
    );

    const sent = await sendWhatsAppMessage(
      apt.customer_phone,
      message,
      apt.clients?.whatsapp_api_key
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
    .select('*, clients(whatsapp_api_key)')
    .eq('id', appointmentId)
    .single();

  if (!apt || !apt.clients?.whatsapp_api_key) return false;

  const message = REMINDER_MESSAGES['approval'](
    apt.customer_name,
    apt.service,
    apt.appointment_date,
    apt.appointment_time
  );

  return await sendWhatsAppMessage(
    apt.customer_phone,
    message,
    apt.clients.whatsapp_api_key
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
  sendWhatsAppMessage
};
