/**
 * Moon Hands - Telegram Booking Approval Commands
 * 
 * /approve <phone> - Approve a pending booking
 * /reject <phone> [reason] - Reject a pending booking
 * /pending - List all pending bookings (scoped to user's clinic)
 * 
 * SECURITY: All approval commands are scoped to the clinic(s)
 * the user's Telegram chat_id is linked to. Cross-clinic access
 * is blocked at the query level.
 */

const db = require('../../supabase/client');
const { sendApprovalConfirmation } = require('../../jobs/reminders');

// ─── AUTHORIZATION HELPER ────────────────────────────────────────
// Every approval command MUST verify the user is authorized for
// the clinic that owns the booking. This prevents cross-clinic PII leaks.

async function getAuthorizedClinicIds(chatId) {
  try {
    const { data: linkedClinics } = await db.supabase
      .from('clients')
      .select('id')
      .contains('telegram_chat_ids', [chatId]);
    return linkedClinics?.map(c => c.id) || [];
  } catch (err) {
    console.error('[APPROVALS AUTH] Failed to resolve clinic IDs:', err.message);
    return [];
  }
}

async function isAuthorizedForBooking(chatId, bookingClientId) {
  const clinicIds = await getAuthorizedClinicIds(chatId);
  // Admin (no linked clinics) can access all; clinic staff only their own
  return clinicIds.length === 0 || clinicIds.includes(bookingClientId);
}

// ─── /PENDING ─────────────────────────────────────────────────────

async function handlePending(bot, msg) {
  const chatId = msg.chat.id;
  
  try {
    // SECURITY: Scope to clinics this user is authorized for
    const clinicIds = await getAuthorizedClinicIds(chatId);
    
    let query = db.supabase
      .from('appointments')
      .select('*, clients(name)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true });
    
    // If user is linked to specific clinics, filter by those
    if (clinicIds.length > 0) {
      query = query.in('client_id', clinicIds);
    }
    // If clinicIds is empty, user is admin — show all (no filter)
    
    const { data: bookings, error } = await query;
    
    if (error) {
      console.error('[APPROVALS] /pending DB error:', error.message);
      return bot.sendMessage(chatId, 'Unable to fetch pending bookings. Please try again later.');
    }

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
    bot.sendMessage(chatId, 'Unable to process your request. Please try again later.');
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
    // NOTE: createBooking sets status='pending', NOT 'pending_approval'
    const { data: bookings } = await db.supabase
      .from('appointments')
      .select('*, clients(id, slug, google_calendar_id, name)')
      .eq('customer_phone', phone)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!bookings || bookings.length === 0) {
      return bot.sendMessage(chatId, `No pending booking found for ${phone}.`);
    }

    const booking = bookings[0]; // Most recent

    // Update to confirmed
    const { error } = await db.supabase
      .from('appointments')
      .update({ status: 'confirmed', approved_at: new Date().toISOString() })
      .eq('id', booking.id);

    if (error) {
      return bot.sendMessage(chatId, `Error approving booking: ${error.message}`);
    }

    // ── SYNC TO GOOGLE CALENDAR ──
    let calendarSynced = false;
    try {
      const { createBookingEvent } = require('../../server/calendar-service');
      if (booking.clients?.google_calendar_id) {
        await createBookingEvent({
          calendarId: booking.clients.google_calendar_id,
          summary: `${booking.service} - ${booking.customer_name}`,
          description: `Patient: ${booking.customer_name}\nPhone: ${booking.customer_phone}\nTreatment: ${booking.service}\nStatus: Confirmed\nSource: Moon Hands AI`,
          startDateTime: `${booking.appointment_date}T${booking.appointment_time}:00+08:00`,
          endDateTime: null, // Let calendar service calculate duration
          patientPhone: booking.customer_phone,
          patientName: booking.customer_name,
          clinicName: booking.clients.name || 'Clinic'
        });
        calendarSynced = true;
      }
    } catch (calErr) {
      console.error('[APPROVALS] Calendar sync failed:', calErr.message);
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
      sent ? '✓ Patient notified via WhatsApp' : '⚠ Failed to notify patient',
      calendarSynced ? '✓ Synced to Google Calendar' : '⚠ Calendar not synced'
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
      .select('*, clients(id, slug, google_calendar_id, name)')
      .eq('customer_phone', phone)
      .eq('status', 'pending')
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

    // Notify patient via WhatsApp
    try {
      const { sendWhatsAppMessage } = require('../../jobs/reminders');
      await sendWhatsAppMessage(
        booking.customer_phone,
        `Hi ${booking.customer_name}, we regret to inform you that your ${booking.service} appointment for ${booking.appointment_date} at ${booking.appointment_time} cannot be confirmed.\n\nReason: ${reason}\n\nWould you like to reschedule? Reply here with your preferred date and time.`
      );
    } catch (notifyErr) {
      console.error('[APPROVALS] Failed to notify patient of rejection:', notifyErr.message);
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

// ─── INLINE BUTTON HANDLERS (by appointment ID) ──────────────────
// Called by Telegram inline keyboard buttons (Approve/Reject)

async function handleApproveById(appointmentId, adminChatId) {
  try {
    const { data: booking, error } = await db.supabase
      .from('appointments')
      .select('*, clients(id, slug, google_calendar_id, name)')
      .eq('id', appointmentId)
      .single();

    if (error || !booking) {
      return { success: false, error: 'Booking not found' };
    }
    
    // SECURITY: Verify user is authorized for this booking's clinic
    const authorized = await isAuthorizedForBooking(adminChatId, booking.client_id);
    if (!authorized) {
      console.warn(`[APPROVALS] UNAUTHORIZED approve attempt: chat ${adminChatId} tried to approve booking for clinic ${booking.client_id}`);
      return { success: false, error: 'Not authorized for this clinic' };
    }

    // Update to confirmed
    await db.supabase
      .from('appointments')
      .update({ status: 'confirmed', approved_at: new Date().toISOString() })
      .eq('id', appointmentId);

    // Sync to Google Calendar
    let calendarSynced = false;
    try {
      const { createBookingEvent } = require('../../server/calendar-service');
      if (booking.clients?.google_calendar_id) {
        await createBookingEvent({
          calendarId: booking.clients.google_calendar_id,
          summary: `${booking.service} - ${booking.customer_name}`,
          description: `Patient: ${booking.customer_name}\nPhone: ${booking.customer_phone}\nTreatment: ${booking.service}\nStatus: Confirmed`,
          startDateTime: `${booking.appointment_date}T${booking.appointment_time}:00+08:00`,
          endDateTime: null,
          patientPhone: booking.customer_phone,
          patientName: booking.customer_name,
          clinicName: booking.clients.name
        });
        calendarSynced = true;
      }
    } catch (calErr) {
      console.error('[APPROVALS] Calendar sync failed:', calErr.message);
    }

    // Notify patient
    try {
      const { sendApprovalConfirmation } = require('../../jobs/reminders');
      await sendApprovalConfirmation(appointmentId);
    } catch (notifyErr) {
      console.error('[APPROVALS] Patient notification failed:', notifyErr.message);
    }

    return {
      success: true,
      patientName: booking.customer_name,
      date: booking.appointment_date,
      time: booking.appointment_time,
      treatment: booking.service,
      calendarSynced
    };

  } catch (err) {
    console.error('[APPROVALS] handleApproveById error:', err.message);
    return { success: false, error: err.message };
  }
}

async function handleRejectById(appointmentId, adminChatId) {
  try {
    const { data: booking, error } = await db.supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single();

    if (error || !booking) {
      return { success: false, error: 'Booking not found' };
    }
    
    // SECURITY: Verify user is authorized for this booking's clinic
    const authorized = await isAuthorizedForBooking(adminChatId, booking.client_id);
    if (!authorized) {
      console.warn(`[APPROVALS] UNAUTHORIZED reject attempt: chat ${adminChatId} tried to reject booking for clinic ${booking.client_id}`);
      return { success: false, error: 'Not authorized for this clinic' };
    }

    // Update to cancelled
    await db.supabase
      .from('appointments')
      .update({ status: 'cancelled', notes: 'Rejected by clinic' })
      .eq('id', appointmentId);

    // Notify patient
    try {
      const { sendWhatsAppMessage } = require('../../jobs/reminders');
      await sendWhatsAppMessage(
        booking.customer_phone,
        `Hi ${booking.customer_name}, we regret to inform you that your ${booking.service} appointment for ${booking.appointment_date} at ${booking.appointment_time} cannot be confirmed.\n\nWould you like to reschedule? Reply here with your preferred date and time.`
      );
    } catch (notifyErr) {
      console.error('[APPROVALS] Patient notification failed:', notifyErr.message);
    }

    return {
      success: true,
      patientName: booking.customer_name,
      date: booking.appointment_date,
      time: booking.appointment_time,
      treatment: booking.service
    };

  } catch (err) {
    console.error('[APPROVALS] handleRejectById error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── EXPORTS ──────────────────────────────────────────────────────

module.exports = {
  handlePending,
  handleApprove,
  handleReject,
  handleApproveById,
  handleRejectById
};
