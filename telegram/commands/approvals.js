/**
 * Moon Hands - Telegram Booking Approval Commands
 * 
 * /approve <phone> - Approve a pending booking
 * /reject <phone> [reason] - Reject a pending booking
 * /pending - List all pending bookings
 * 
 * These commands are used by clinic staff to approve/reject
 * bookings that require manual approval.
 */

const db = require('../../supabase/client');
const { sendApprovalConfirmation } = require('../../jobs/reminders');

// ─── /PENDING ─────────────────────────────────────────────────────

async function handlePending(bot, msg) {
  const chatId = msg.chat.id;
  
  try {
    const { data: bookings } = await db.supabase
      .from('appointments')
      .select('*, clients(name)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true });

    if (!bookings || bookings.length === 0) {
      return bot.sendMessage(chatId, 'No pending bookings requiring approval.');
    }

    const message = [
      `📋 *PENDING BOOKINGS (${bookings.length})*`,
      '',
      ...bookings.map((b, i) => [
        `${i + 1}. *${b.clients?.name || 'Unknown Clinic'}*`,
        `   Patient: ${b.customer_name}`,
        `   Phone: ${b.customer_phone}`,
        `   Treatment: ${b.service}`,
        `   Date: ${b.appointment_date} at ${b.appointment_time}`,
        `   Actions: /approve ${b.customer_phone}  |  /reject ${b.customer_phone} [reason]`,
        ''
      ].join('\n'))
    ].join('\n');

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  } catch (err) {
    console.error('[APPROVALS] /pending error:', err.message);
    bot.sendMessage(chatId, 'Error fetching pending bookings.');
  }
}

// ─── /APPROVE ─────────────────────────────────────────────────────

async function handleApprove(bot, msg, args) {
  const chatId = msg.chat.id;
  
  if (!args[0]) {
    return bot.sendMessage(chatId, 'Usage: /approve <patient_phone>\nExample: /approve +6581234567');
  }

  const phone = args[0];

  try {
    // Find the pending booking
    const { data: bookings } = await db.supabase
      .from('appointments')
      .select('*')
      .eq('customer_phone', phone)
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });

    if (!bookings || bookings.length === 0) {
      return bot.sendMessage(chatId, `No pending booking found for ${phone}.`);
    }

    const booking = bookings[0]; // Most recent

    // Update to confirmed
    const { error } = await db.supabase
      .from('appointments')
      .update({ status: 'confirmed' })
      .eq('id', booking.id);

    if (error) {
      return bot.sendMessage(chatId, `Error approving booking: ${error.message}`);
    }

    // Send confirmation to patient
    const sent = await sendApprovalConfirmation(booking.id);

    const message = [
      '✅ *BOOKING APPROVED*',
      '',
      `Patient: ${booking.customer_name}`,
      `Phone: ${booking.customer_phone}`,
      `Treatment: ${booking.service}`,
      `Date: ${booking.appointment_date} at ${booking.appointment_time}`,
      '',
      sent ? '✓ Patient notified via WhatsApp' : '⚠ Failed to notify patient'
    ].join('\n');

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  } catch (err) {
    console.error('[APPROVALS] /approve error:', err.message);
    bot.sendMessage(chatId, 'Error processing approval.');
  }
}

// ─── /REJECT ──────────────────────────────────────────────────────

async function handleReject(bot, msg, args) {
  const chatId = msg.chat.id;
  
  if (!args[0]) {
    return bot.sendMessage(chatId, 'Usage: /reject <patient_phone> [reason]\nExample: /reject +6581234567 Doctor unavailable');
  }

  const phone = args[0];
  const reason = args.slice(1).join(' ') || 'Not specified';

  try {
    const { data: bookings } = await db.supabase
      .from('appointments')
      .select('*, clients(whatsapp_api_key)')
      .eq('customer_phone', phone)
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });

    if (!bookings || bookings.length === 0) {
      return bot.sendMessage(chatId, `No pending booking found for ${phone}.`);
    }

    const booking = bookings[0];

    // Update to rejected
    await db.supabase
      .from('appointments')
      .update({ status: 'cancelled', notes: `Rejected: ${reason}` })
      .eq('id', booking.id);

    // Notify patient
    if (booking.clients?.whatsapp_api_key) {
      const { sendWhatsAppMessage } = require('../../jobs/reminders');
      await sendWhatsAppMessage(
        phone,
        `Hi ${booking.customer_name}, we regret to inform you that your ${booking.service} appointment for ${booking.appointment_date} at ${booking.appointment_time} cannot be confirmed.\n\nReason: ${reason}\n\nWould you like to reschedule? Reply here with your preferred date and time.`,
        booking.clients.whatsapp_api_key
      );
    }

    const message = [
      '❌ *BOOKING REJECTED*',
      '',
      `Patient: ${booking.customer_name}`,
      `Phone: ${booking.customer_phone}`,
      `Treatment: ${booking.service}`,
      `Date: ${booking.appointment_date} at ${booking.appointment_time}`,
      `Reason: ${reason}`,
      '',
      '✓ Patient notified via WhatsApp'
    ].join('\n');

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  } catch (err) {
    console.error('[APPROVALS] /reject error:', err.message);
    bot.sendMessage(chatId, 'Error processing rejection.');
  }
}

// ─── EXPORTS ──────────────────────────────────────────────────────

module.exports = {
  handlePending,
  handleApprove,
  handleReject
};
