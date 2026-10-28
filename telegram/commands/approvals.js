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

// ─── AUTHORIZATION HELPERS ───────────────────────────────────────
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
    
    // NOTE: createBooking (WhatsApp build) sets status='pending'.
    // 'pending_approval' is a legacy value — match both so old rows still show.
    let query = db.supabase
      .from('appointments')
      .select('*, clients(name)')
      .in('status', ['pending', 'pending_approval'])
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
        const startISO = `${booking.appointment_date}T${String(booking.appointment_time).slice(0, 5)}:00+08:00`;
        const [sh, sm] = String(booking.appointment_time).split(':').map(Number);
        const endTotal = sh * 60 + sm + (parseInt(booking.duration) || 60);
        const endISO = `${booking.appointment_date}T${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}:00+08:00`;
        const ev = await createBookingEvent(booking.clients.google_calendar_id, {
          summary: `${booking.service} - ${booking.customer_name}`,
          description: `Patient: ${booking.customer_name}\nPhone: ${booking.customer_phone}\nTreatment: ${booking.service}\nStatus: Confirmed\nSource: Moon Hands AI`,
          startISO,
          endISO,
          patientPhone: booking.customer_phone,
          patientName: booking.customer_name,
          clinicName: booking.clients.name || 'Clinic'
        });
        calendarSynced = !!(ev && ev.id);
        if (ev && ev.id) {
          await db.supabase.from('appointments').update({ google_event_id: ev.id }).eq('id', booking.id);
        }
      }
    } catch (calErr) {
      console.error('[APPROVALS] Calendar sync failed:', calErr.message);
    }

    // Send confirmation to patient
    const sent = await sendApprovalConfirmation(booking.id);
    if (sent) {
      await db.supabase.from('appointments').update({ approval_notified: true }).eq('id', booking.id);
    }

    // Overlap warning — staff can still act, but with eyes open
    const overlaps = await findBookingOverlaps(db.supabase, booking);

    const message = [
      '✅ *BOOKING APPROVED*',
      '',
      `Patient: ${booking.customer_name}`,
      `Phone: ${booking.customer_phone}`,
      `Treatment: ${booking.service}`,
      `Date: ${booking.appointment_date} at ${booking.appointment_time}`,
      '',
      sent ? '✓ Patient notified via WhatsApp' : '⚠ Failed to notify patient',
      calendarSynced ? '✓ Synced to Google Calendar' : '⚠ Calendar not synced',
      ...(overlaps.length > 0 ? ['', '⚠️ *OVERLAP WARNING* — this slot now overlaps:', ...overlaps.map(o => `• ${o.time} — ${o.name} (${o.status})`), 'Suggest an alternative time for this booking.'] : [])
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

// ─── OVERLAP DETECTION (approve-time warning) ────────────────────
// Compares a booking against same-day slot-holding appointments using
// stored durations + clinic buffer. Powers the ⚠️ overlap warning so
// staff can suggest an alternative time instead of double-booking.
async function findBookingOverlaps(supabase, booking) {
  try {
    const { data: cfgRow } = await supabase
      .from('client_configs')
      .select('config, buffer_time')
      .eq('client_id', booking.client_id)
      .single();
    const bufferMin = cfgRow?.config?.buffer_time ?? cfgRow?.buffer_time ?? 15;

    const { data: sameDay } = await supabase
      .from('appointments')
      .select('id, customer_name, service, appointment_time, duration, status')
      .eq('client_id', booking.client_id)
      .eq('appointment_date', booking.appointment_date)
      .in('status', ['confirmed', 'pending', 'booked', 'pending_alternative', 'pending_approval']);

    const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
    const start = toMin(booking.appointment_time);
    const end = start + (parseInt(booking.duration) || 60) + bufferMin;

    const overlaps = [];
    for (const b of (sameDay || [])) {
      if (b.id === booking.id) continue;
      const bStart = toMin(b.appointment_time);
      const bEnd = bStart + (parseInt(b.duration) || 60) + bufferMin;
      if (start < bEnd && end > bStart) {
        overlaps.push({ time: String(b.appointment_time).slice(0, 5), name: b.customer_name, service: b.service, status: b.status });
      }
    }
    return overlaps;
  } catch (err) {
    console.error('[APPROVALS] Overlap check failed (fail-open):', err.message);
    return [];
  }
}

// ─── INLINE BUTTON HANDLERS (by appointment ID) ──────────────────
// Called by Telegram inline keyboard buttons (Approve/Reject)

async function handleApproveById(appointmentId, adminChatId) {
  console.log(`[APPROVALS] handleApproveById called for appt=${appointmentId} chat=${adminChatId}`);
  try {
    const { data: booking, error } = await db.supabase
      .from('appointments')
      .select('*, clients(id, slug, google_calendar_id, name)')
      .eq('id', appointmentId)
      .single();

    if (error || !booking) {
      console.error(`[APPROVALS] Booking not found: ${error?.message}`);
      return { success: false, error: 'Booking not found' };
    }
    console.log(`[APPROVALS] Booking found: ${booking.customer_name} @ ${booking.appointment_date} ${booking.appointment_time} status=${booking.status}`);
    
    // SECURITY: Verify user is authorized for this booking's clinic
    const authorized = await isAuthorizedForBooking(adminChatId, booking.client_id);
    console.log(`[APPROVALS] Authorization result: ${authorized} for clinic ${booking.client_id}`);
    if (!authorized) {
      console.warn(`[APPROVALS] UNAUTHORIZED approve attempt: chat ${adminChatId} tried to approve booking for clinic ${booking.client_id}`);
      return { success: false, error: 'Not authorized for this clinic' };
    }

    // Update to confirmed
    console.log(`[APPROVALS] Updating booking ${appointmentId} to confirmed...`);
    const { error: updateErr } = await db.supabase
      .from('appointments')
      .update({ status: 'confirmed' })
      .eq('id', appointmentId);

    if (updateErr) {
      console.error('[APPROVALS] Update failed:', updateErr.message, updateErr.details, updateErr.hint);
      return { success: false, error: `Update failed: ${updateErr.message}` };
    }
    console.log(`[APPROVALS] Booking ${appointmentId} updated to confirmed`);

    // Sync to Google Calendar
    let calendarSynced = false;
    try {
      const { createBookingEvent } = require('../../server/calendar-service');
      if (booking.clients?.google_calendar_id) {
        const startISO = `${booking.appointment_date}T${String(booking.appointment_time).slice(0, 5)}:00+08:00`;
        const [sh, sm] = String(booking.appointment_time).split(':').map(Number);
        const endTotal = sh * 60 + sm + (parseInt(booking.duration) || 60);
        const endISO = `${booking.appointment_date}T${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}:00+08:00`;
        const ev = await createBookingEvent(booking.clients.google_calendar_id, {
          summary: `${booking.service} - ${booking.customer_name}`,
          description: `Patient: ${booking.customer_name}\nPhone: ${booking.customer_phone}\nTreatment: ${booking.service}\nStatus: Confirmed`,
          startISO,
          endISO,
          patientPhone: booking.customer_phone,
          patientName: booking.customer_name,
          clinicName: booking.clients.name
        });
        calendarSynced = !!(ev && ev.id);
        if (ev && ev.id) {
          await db.supabase.from('appointments').update({ google_event_id: ev.id }).eq('id', appointmentId);
        }
        console.log(`[APPROVALS] Calendar synced for ${appointmentId}: ${calendarSynced}`);
      }
    } catch (calErr) {
      console.error('[APPROVALS] Calendar sync failed:', calErr.message);
    }

    // Notify patient — the result is REAL (no more unconditional ✓)
    let patientNotified = false;
    try {
      console.log(`[APPROVALS] Sending patient notification for ${appointmentId}...`);
      const { sendApprovalConfirmation } = require('../../jobs/reminders');
      patientNotified = (await sendApprovalConfirmation(appointmentId)) === true;
      console.log(`[APPROVALS] Patient notification for ${appointmentId}: ${patientNotified ? 'sent' : 'FAILED'}`);
    } catch (notifyErr) {
      console.error('[APPROVALS] Patient notification failed:', notifyErr.message);
    }
    if (patientNotified) {
      await db.supabase.from('appointments').update({ approval_notified: true }).eq('id', appointmentId);
    }

    // Overlap warning — staff can suggest an alternative for THIS booking
    // (the already-confirmed one keeps its slot; it was confirmed first)
    const overlaps = await findBookingOverlaps(db.supabase, booking);

    return {
      success: true,
      patientName: booking.customer_name,
      date: booking.appointment_date,
      time: booking.appointment_time,
      treatment: booking.service,
      calendarSynced,
      patientNotified,
      overlaps
    };

  } catch (err) {
    console.error('[APPROVALS] handleApproveById error:', err.message, err.stack);
    return { success: false, error: err.message };
  }
}

async function handleRejectById(appointmentId, adminChatId) {
  console.log(`[APPROVALS] handleRejectById called for appt=${appointmentId} chat=${adminChatId}`);
  try {
    const { data: booking, error } = await db.supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single();

    if (error || !booking) {
      console.error(`[APPROVALS] Booking not found for reject: ${error?.message}`);
      return { success: false, error: 'Booking not found' };
    }
    console.log(`[APPROVALS] Reject booking found: ${booking.customer_name} status=${booking.status}`);
    
    // SECURITY: Verify user is authorized for this booking's clinic
    const authorized = await isAuthorizedForBooking(adminChatId, booking.client_id);
    console.log(`[APPROVALS] Reject authorization: ${authorized}`);
    if (!authorized) {
      console.warn(`[APPROVALS] UNAUTHORIZED reject attempt: chat ${adminChatId} tried to reject booking for clinic ${booking.client_id}`);
      return { success: false, error: 'Not authorized for this clinic' };
    }

    // Update to cancelled
    console.log(`[APPROVALS] Updating booking ${appointmentId} to cancelled...`);
    const { error: updateErr } = await db.supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointmentId);

    if (updateErr) {
      console.error('[APPROVALS] Reject update failed:', updateErr.message, updateErr.details, updateErr.hint);
      return { success: false, error: `Update failed: ${updateErr.message}` };
    }
    console.log(`[APPROVALS] Booking ${appointmentId} updated to cancelled`);

    // Notify patient and enable reschedule flow
    let patientNotified = false;
    try {
      const { sendWhatsAppMessage } = require('../../jobs/reminders');
      patientNotified = (await sendWhatsAppMessage(
        booking.customer_phone,
        `Hi ${booking.customer_name}, we regret to inform you that your ${booking.service} appointment for ${booking.appointment_date} at ${booking.appointment_time} cannot be confirmed.\n\nWould you like to reschedule? Reply here with your preferred date and time.`
      )) === true;

      // Set patient state to AWAITING_DATE with treatment preserved for reschedule
      const { setState, BOOKING_STATES } = require('../../ai/conversation-state');
      setState(booking.customer_phone, BOOKING_STATES.AWAITING_DATE, {
        treatment: booking.service,
        treatments: [booking.service],
        name: booking.customer_name,
        phone: booking.customer_phone
      });
      console.log(`[APPROVALS] Set reschedule state for patient ${booking.customer_phone}, treatment: ${booking.service}`);
    } catch (notifyErr) {
      console.error('[APPROVALS] Patient notification failed:', notifyErr.message);
    }

    return {
      success: true,
      patientName: booking.customer_name,
      date: booking.appointment_date,
      time: booking.appointment_time,
      treatment: booking.service,
      patientNotified
    };

  } catch (err) {
    console.error('[APPROVALS] handleRejectById error:', err.message, err.stack);
    return { success: false, error: err.message };
  }
}

// ─── CLINIC CANCEL (confirmed bookings) ──────────────────────────
// Cancels a confirmed/pending booking by ID: status update, Google
// Calendar event removal, patient WhatsApp notification, staff notice.
async function handleCancelById(appointmentId, adminChatId, reason = '') {
  console.log(`[APPROVALS] handleCancelById called for appt=${appointmentId} chat=${adminChatId}`);
  try {
    const { data: booking, error } = await db.supabase
      .from('appointments')
      .select('*, clients(id, slug, google_calendar_id, name)')
      .eq('id', appointmentId)
      .single();

    if (error || !booking) {
      return { success: false, error: 'Booking not found' };
    }

    // SECURITY: same authorization model as approve/reject
    const authorized = await isAuthorizedForBooking(adminChatId, booking.client_id);
    if (!authorized) {
      console.warn(`[APPROVALS] UNAUTHORIZED cancel attempt: chat ${adminChatId} clinic ${booking.client_id}`);
      return { success: false, error: 'Not authorized for this clinic' };
    }

    if (!['confirmed', 'pending', 'booked', 'pending_approval'].includes(booking.status)) {
      return { success: false, error: `Cannot cancel a booking with status "${booking.status}"` };
    }

    const cancelNote = `Cancelled by clinic via Telegram.${reason ? ' Reason: ' + reason : ''}`;
    const { error: updateErr } = await db.supabase
      .from('appointments')
      .update({ status: 'cancelled', notes: (booking.notes ? booking.notes + ' | ' : '') + cancelNote })
      .eq('id', appointmentId);
    if (updateErr) {
      return { success: false, error: `Update failed: ${updateErr.message}` };
    }

    // Remove the Google Calendar event if we created one at approve time
    let calendarDeleted = false;
    try {
      if (booking.google_event_id && booking.clients?.google_calendar_id) {
        const { deleteBookingEvent } = require('../../server/calendar-service');
        calendarDeleted = (await deleteBookingEvent(booking.clients.google_calendar_id, booking.google_event_id)) === true;
      }
    } catch (calErr) {
      console.error('[APPROVALS] Calendar delete failed:', calErr.message);
    }

    // Notify patient on WhatsApp — result is REAL
    let patientNotified = false;
    try {
      const { sendWhatsAppMessage } = require('../../jobs/reminders');
      patientNotified = (await sendWhatsAppMessage(
        booking.customer_phone,
        `Hi ${booking.customer_name}, we're very sorry — your ${booking.service} appointment on ${booking.appointment_date} at ${String(booking.appointment_time).slice(0, 5)} has been cancelled by the clinic.${reason ? ' Reason: ' + reason + '.' : ''}\n\nReply here and we'll help you find a new time.`
      )) === true;
    } catch (notifyErr) {
      console.error('[APPROVALS] Cancel patient notification failed:', notifyErr.message);
    }

    // Notify all staff channels (Telegram) so everyone sees the cancellation
    try {
      const { notifyBookingCancelled } = require('../booking-notifications');
      await notifyBookingCancelled(booking, { id: booking.client_id, client_id: booking.client_id }, reason || 'Cancelled by clinic');
    } catch (staffErr) {
      console.error('[APPROVALS] Staff cancel notification failed:', staffErr.message);
    }

    return {
      success: true,
      patientName: booking.customer_name,
      date: booking.appointment_date,
      time: booking.appointment_time,
      treatment: booking.service,
      patientNotified,
      calendarDeleted
    };
  } catch (err) {
    console.error('[APPROVALS] handleCancelById error:', err.message, err.stack);
    return { success: false, error: err.message };
  }
}

// ─── EXPORTS ──────────────────────────────────────────────────────

module.exports = {
  handlePending,
  handleApprove,
  handleReject,
  handleApproveById,
  handleRejectById,
  handleCancelById,
  findBookingOverlaps
};
