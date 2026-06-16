/**
 * Moon Hands — Basic Tier Availability System
 *
 * For Basic tier clinics: AI tracks only the bookings IT creates.
 * AI does NOT see the clinic's actual calendar (Google Calendar, paper calendar, etc.)
 *
 * How it works:
 * 1. Patient asks for a slot
 * 2. AI queries Supabase bookings table: "What's booked on this date?"
 * 3. AI suggests 2-3 times that are ACTUALLY free (based on AI-made bookings + operating hours)
 * 4. Patient picks one → booking created in Supabase → status: pending
 * 5. Clinic approves via Telegram → status: confirmed
 * 6. iCal feed picks up confirmed bookings
 *
 * LIMITATION: Clinic's manual bookings (phone calls, walk-ins, non-AI channels)
 * are NOT visible to the AI. Clinic must manage conflicts via Telegram approvals.
 *
 * Premium tier gets Google Calendar sync — AI sees the REAL calendar.
 */

const { supabase } = require('../../supabase/client');

// ─── CHECK AVAILABILITY ──────────────────────────────────────────

/**
 * Get available time slots for a clinic on a given date.
 * Checks operating hours + existing AI-made bookings.
 *
 * @param {string} clinicId - Clinic ID
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {number} durationMinutes - Treatment duration
 * @param {number} bufferMinutes - Buffer between appointments
 * @returns {Promise<string[]>} - Array of available time strings ("HH:MM")
 */
async function getAvailableSlots(clinicId, date, durationMinutes = 60, bufferMinutes = 15) {
  try {
    // 1. Get clinic operating hours
    const { data: clinic, error: clinicError } = await supabase
      .from('clients')
      .select('operating_hours')
      .eq('id', clinicId)
      .single();

    if (clinicError || !clinic) {
      console.error('[AVAILABILITY] Clinic not found:', clinicId);
      return [];
    }

    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'lowercase' });
    const hours = clinic.operating_hours?.[dayOfWeek];

    if (!hours || !hours.open || !hours.close) {
      console.log(`[AVAILABILITY] No hours for ${dayOfWeek}`);
      return []; // Clinic closed this day
    }

    // 2. Get existing bookings for this date
    const { data: bookings, error: bookingError } = await supabase
      .from('bookings')
      .select('booking_time, duration_minutes, status')
      .eq('clinic_id', clinicId)
      .eq('booking_date', date)
      .in('status', ['pending', 'confirmed']);

    if (bookingError) {
      console.error('[AVAILABILITY] Booking query error:', bookingError.message);
    }

    const existingSlots = bookings || [];

    // 3. Generate all possible slots
    const openTime = parseTime(hours.open);
    const closeTime = parseTime(hours.close);
    const slotInterval = 30; // 30-minute slots
    const allSlots = [];

    for (let t = openTime; t + durationMinutes + bufferMinutes <= closeTime; t += slotInterval) {
      const timeStr = formatMinutes(t);
      if (isSlotAvailable(t, durationMinutes, bufferMinutes, existingSlots)) {
        allSlots.push(timeStr);
      }
    }

    // 4. Return first 3 available slots (or fewer if less available)
    return allSlots.slice(0, 3);

  } catch (err) {
    console.error('[AVAILABILITY] Error:', err.message);
    return [];
  }
}

// ─── SLOT CONFLICT CHECK ────────────────────────────────────────

function isSlotAvailable(startMinutes, durationMinutes, bufferMinutes, existingSlots) {
  const slotStart = startMinutes;
  const slotEnd = startMinutes + durationMinutes + bufferMinutes;

  for (const booking of existingSlots) {
    const bookedStart = parseTime(booking.booking_time);
    const bookedEnd = bookedStart + (booking.duration_minutes || 60) + bufferMinutes;

    // Check overlap
    if (slotStart < bookedEnd && slotEnd > bookedStart) {
      return false; // Conflict
    }
  }

  return true;
}

// ─── TIME UTILITIES ─────────────────────────────────────────────

function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── CREATE BOOKING ─────────────────────────────────────────────

/**
 * Create a new booking in Supabase.
 * Status starts as 'pending' — clinic must approve via Telegram.
 */
async function createBooking(clinicId, patientPhone, patientName, treatment, date, time, durationMinutes = 60) {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        clinic_id: clinicId,
        patient_phone: patientPhone,
        patient_name: patientName,
        treatment,
        booking_date: date,
        booking_time: time,
        duration_minutes: durationMinutes,
        status: 'pending',
        source: 'ai',
      })
      .select()
      .single();

    if (error) {
      console.error('[BOOKING] Create error:', error.message);
      return { success: false, error: error.message };
    }

    console.log(`[BOOKING] Created: ${patientName} | ${treatment} | ${date} ${time} | ID: ${data.id}`);
    return { success: true, booking: data };

  } catch (err) {
    console.error('[BOOKING] Error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── UPDATE BOOKING STATUS ─────────────────────────────────────

async function updateBookingStatus(bookingId, status, notes = '') {
  try {
    const update = { status, updated_at: new Date().toISOString() };
    if (notes) update.notes = notes;

    const { data, error } = await supabase
      .from('bookings')
      .update(update)
      .eq('id', bookingId)
      .select()
      .single();

    if (error) {
      console.error('[BOOKING] Update error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, booking: data };

  } catch (err) {
    console.error('[BOOKING] Update error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── GET BOOKINGS FOR DATE ─────────────────────────────────────

async function getBookingsForDate(clinicId, date) {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('booking_date', date)
      .in('status', ['pending', 'confirmed'])
      .order('booking_time', { ascending: true });

    if (error) {
      console.error('[BOOKING] Query error:', error.message);
      return [];
    }

    return data || [];

  } catch (err) {
    console.error('[BOOKING] Query error:', err.message);
    return [];
  }
}

// ─── CANCEL BOOKING ─────────────────────────────────────────────

async function cancelBooking(clinicId, patientPhone, explicitConfirm = false) {
  if (!explicitConfirm) {
    return {
      success: false,
      requiresConfirmation: true,
      message: 'To confirm cancellation, please reply with the exact words: CANCEL MY BOOKING',
    };
  }

  try {
    // Find the most recent pending/confirmed booking for this patient
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('patient_phone', patientPhone)
      .in('status', ['pending', 'confirmed'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !bookings || bookings.length === 0) {
      return { success: false, message: 'No active booking found to cancel.' };
    }

    const booking = bookings[0];
    const result = await updateBookingStatus(booking.id, 'cancelled', 'Cancelled by patient');

    if (result.success) {
      return {
        success: true,
        message: `Your appointment for ${booking.treatment} on ${booking.booking_date} at ${booking.booking_time} has been cancelled.`,
        booking: result.booking,
      };
    }

    return { success: false, message: 'Failed to cancel booking. Please try again.' };

  } catch (err) {
    console.error('[BOOKING] Cancel error:', err.message);
    return { success: false, message: 'Error cancelling booking.' };
  }
}

// ─── EXPORTS ────────────────────────────────────────────────────

module.exports = {
  getAvailableSlots,
  createBooking,
  updateBookingStatus,
  getBookingsForDate,
  cancelBooking,
  isSlotAvailable,
  parseTime,
  formatMinutes,
};
