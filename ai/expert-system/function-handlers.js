/**
 * Moon Hands — Function Implementations
 * All 8 bot functions wired to actual Supabase operations.
 * Each function validates inputs, queries/updates the database, and returns structured results.
 */

const db = require('../../supabase/client');
const { notifyBookingCreated, notifyBookingCancelled, sendWeeklyRoundup } = require('../../telegram/booking-notifications');

// ─── HELPER: Get Supabase client ──────────────────────────────────
function getSupabase() {
  return db.supabase;
}

// ─── 1. CHECK_AVAILABILITY ────────────────────────────────────────
/**
 * Check available slots for a specific date and service.
 * Accepts both old param names (treatment, day_preference) and new (service, preferred_time).
 */
async function checkAvailability({ client_id, date, service, preferred_time, treatment, day_preference }) {
  const supabase = getSupabase();
  
  // Normalize parameter names (backward compatible)
  const serviceName = service || treatment;
  const timePreference = preferred_time || day_preference;
  
  try {
    // Get clinic config
    const { data: clinic, error: clinicErr } = await supabase
      .from('client_configs')
      .select('*')
      .eq('client_id', client_id)
      .single();
    
    if (clinicErr || !clinic) {
      return { success: false, error: 'Clinic not found', slots: [] };
    }
    
    // Validate date is within allowed range
    const today = new Date();
    const requestedDate = new Date(date);
    const daysDiff = Math.ceil((requestedDate - today) / (1000 * 60 * 60 * 24));
    
    const maxAdvance = clinic.booking_max_advance_days || 30;
    const minNotice = clinic.booking_min_notice_hours || 2;
    
    if (daysDiff < 0) {
      return { success: false, error: 'Cannot book in the past', slots: [] };
    }
    if (daysDiff > maxAdvance) {
      return { success: false, error: `Cannot book more than ${maxAdvance} days in advance`, slots: [] };
    }
    if (daysDiff === 0) {
      const hoursUntil = (requestedDate - today) / (1000 * 60 * 60);
      if (hoursUntil < minNotice) {
        return { success: false, error: `Need at least ${minNotice} hours notice`, slots: [] };
      }
    }
    
    // Check if clinic is open on this day
    const dayName = requestedDate.toLocaleDateString('en-US', { weekday: 'long' });
    const hours = clinic.operating_hours;
    let openTime, closeTime;
    
    if (typeof hours === 'object') {
      const dayHours = hours[dayName] || hours[dayName.substring(0, 3)];
      if (!dayHours || dayHours.toLowerCase().includes('closed')) {
        return { success: false, error: `Clinic closed on ${dayName}`, slots: [] };
      }
      [openTime, closeTime] = dayHours.split('-').map(t => t.trim());
    } else if (typeof hours === 'string') {
      // Simple string format: "Mon-Fri 9am-6pm, Sat 9am-2pm"
      if (hours.toLowerCase().includes(dayName.toLowerCase()) || 
          (dayName === 'Saturday' && hours.toLowerCase().includes('sat')) ||
          (dayName === 'Sunday' && hours.toLowerCase().includes('sun'))) {
        const match = hours.match(/(\d{1,2}[ap]m?)-(\d{1,2}[ap]m?)/i);
        if (match) {
          openTime = match[1];
          closeTime = match[2];
        }
      } else {
        return { success: false, error: `Clinic closed on ${dayName}`, slots: [] };
      }
    }
    
    // Get existing appointments for this date
    const { data: existing, error: existingErr } = await supabase
      .from('appointments')
      .select('appointment_time')
      .eq('client_id', client_id)
      .eq('appointment_date', date)
      .in('status', ['confirmed', 'pending']);
    
    if (existingErr) {
      console.error('[FUNCTION] checkAvailability query error:', existingErr.message);
    }
    
    const bookedTimes = (existing || []).map(a => a.appointment_time);
    
    // Generate available slots (30-min intervals)
    const slots = generateTimeSlots(openTime, closeTime, bookedTimes, service, clinic.services);
    
    return {
      success: true,
      date,
      dayName,
      openTime,
      closeTime,
      slots,
      bookedCount: bookedTimes.length,
      message: slots.length > 0 
        ? `We have ${slots.length} slots available on ${date}.` 
        : `Fully booked on ${date}. Would you like to join the waitlist?`
    };
    
  } catch (err) {
    console.error('[FUNCTION] checkAvailability error:', err.message);
    return { success: false, error: 'Unable to check availability', slots: [] };
  }
}

function generateTimeSlots(openTime, closeTime, bookedTimes, serviceName, services) {
  const slots = [];
  
  // Get service duration
  const service = (services || []).find(s => s.name.toLowerCase() === (serviceName || '').toLowerCase());
  const duration = parseInt(service?.duration) || 30; // default 30 min
  
  // Parse times
  const parseTime = (t) => {
    const match = t.match(/(\d{1,2}):?(\d{2})?\s*([ap]m)?/i);
    if (!match) return null;
    let hour = parseInt(match[1]);
    const min = parseInt(match[2]) || 0;
    const ampm = match[3]?.toLowerCase();
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return hour * 60 + min;
  };
  
  const openMinutes = parseTime(openTime);
  const closeMinutes = parseTime(closeTime);
  
  if (!openMinutes || !closeMinutes) return [];
  
  for (let mins = openMinutes; mins + duration <= closeMinutes; mins += 30) {
    const hour = Math.floor(mins / 60);
    const minute = mins % 60;
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    // Check if this slot conflicts with existing bookings
    const conflicts = bookedTimes.some(bt => {
      const [bh, bm] = bt.split(':').map(Number);
      const btMins = bh * 60 + bm;
      // Simple conflict: overlapping 30-min windows
      return Math.abs(btMins - mins) < duration;
    });
    
    if (!conflicts) {
      slots.push(timeStr);
    }
  }
  
  return slots;
}

// ─── 2. CREATE_BOOKING ──────────────────────────────────────────────
/**
 * Create a new appointment. Validates all required fields, checks conflicts.
 * Accepts both old param names (patient_name, patient_phone, treatment, date, time) 
 * and new (customer_name, customer_phone, service_name, appointment_date, appointment_time).
 */
async function createBooking({ client_id, customer_name, customer_phone, service_name, appointment_date, appointment_time, notes, patient_name, patient_phone, treatment, date, time }) {
  const supabase = getSupabase();
  
  // Normalize parameter names (backward compatible)
  const name = customer_name || patient_name;
  const phone = customer_phone || patient_phone;
  const service = service_name || treatment;
  const apptDate = appointment_date || date;
  const apptTime = appointment_time || time;
  
  try {
    // Validation
    if (!name || !phone || !service || !apptDate || !apptTime) {
      return { success: false, error: 'Missing required fields: name, phone, service, date, time' };
    }
    
    // Get clinic config
    const { data: clinic, error: clinicErr } = await supabase
      .from('client_configs')
      .select('*')
      .eq('client_id', client_id)
      .single();
    
    if (clinicErr || !clinic) {
      return { success: false, error: 'Clinic configuration not found' };
    }
    
    // Check if same-day is allowed
    const today = new Date().toISOString().split('T')[0];
    if (apptDate === today && clinic.booking_allow_same_day === false) {
      return { success: false, error: 'Same-day booking not available. Please book at least 1 day in advance.' };
    }
    
    // Check for conflicts (proper overlap detection, not just exact time match)
    const { data: existingBookings, error: conflictErr } = await supabase
      .from('appointments')
      .select('*')
      .eq('client_id', client_id)
      .eq('appointment_date', apptDate)
      .in('status', ['confirmed', 'pending']);
    
    if (conflictErr) {
      console.error('[FUNCTION] createBooking conflict check error:', conflictErr.message);
    }
    
    if (existingBookings && existingBookings.length > 0) {
      // Parse requested time
      const [reqH, reqM] = apptTime.split(':').map(Number);
      const reqStart = reqH * 60 + reqM;
      const treatmentDuration = clinic.appointment_duration_minutes || 30;
      const reqEnd = reqStart + parseInt(treatmentDuration);
      
      // Check for overlap with each existing booking
      for (const existing of existingBookings) {
        const [exH, exM] = existing.appointment_time.split(':').map(Number);
        const exStart = exH * 60 + exM;
        const exDuration = existing.duration_minutes || clinic.appointment_duration_minutes || 30;
        const exEnd = exStart + parseInt(exDuration);
        
        // Overlap: (StartA < EndB) AND (EndA > StartB)
        if (reqStart < exEnd && reqEnd > exStart) {
          return { success: false, error: 'This slot is no longer available. Would you like to check other times?' };
        }
      }
    }
    
    // ─── SECURITY: ALL bookings start as PENDING — never auto-confirm ─
    // Clinic MUST approve every booking. Prevents reputation damage if
    // doctor is unavailable. Patient gets told "clinic will confirm."
    const status = 'pending';
    
    // Create appointment
    const { data: appointment, error: insertErr } = await supabase
      .from('appointments')
      .insert([{
        client_id,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        service_name: service.trim(),
        appointment_date: apptDate,
        appointment_time: apptTime,
        notes: notes || '',
        status,
        source: 'whatsapp',
        reminder_24h_sent: false,
        reminder_1h_sent: false,
        followup_48h_sent: false,
        approval_notified: false,
        clinic_reminders_sent: 0, // Track how many 30-min reminders sent (max 2)
        clinic_first_notified_at: new Date().toISOString(),
      }])
      .select()
      .single();
    
    if (insertErr) {
      console.error('[FUNCTION] createBooking insert error:', insertErr.message);
      return { success: false, error: 'Unable to create booking. Please try again.' };
    }
    
    // Notify admin about pending booking
    await notifyAdmin(supabase, client_id, 'new_pending_booking', appointment);
    
    // Send instant Telegram notification to clinic (real-time booking alert)
    try {
      await notifyBookingCreated({
        id: appointment.id,
        date: appointment.appointment_date,
        time: appointment.appointment_time,
        patient_name: appointment.customer_name,
        patient_phone: appointment.customer_phone,
        treatment: appointment.service_name,
        notes: appointment.notes,
        status: appointment.status,
      }, clinic);
    } catch (notifyErr) {
      console.error('[FUNCTION] Telegram booking notification failed:', notifyErr.message);
    }
    
    return {
      success: true,
      appointment,
      status,
      message: `⏳ Booking *request* received for ${service} on ${apptDate} at ${apptTime}.\n\nThe clinic team will review and confirm your appointment. You will receive a confirmation message once approved.\n\nIf you don't hear back within 1 hour, the clinic will call you to confirm.`
    };
    
  } catch (err) {
    console.error('[FUNCTION] createBooking error:', err.message);
    return { success: false, error: 'Booking system error. Please try again or call the clinic.' };
  }
}

// ─── 3. CANCEL_BOOKING ────────────────────────────────────────────
async function cancelBooking({ client_id, customer_phone, appointment_id, patient_phone }) {
  const supabase = getSupabase();
  const phone = customer_phone || patient_phone;
  
  try {
    if (!phone) {
      return { success: false, error: 'Phone number required to verify identity' };
    }
    
    // Find the appointment
    let query = supabase
      .from('appointments')
      .select('*')
      .eq('client_id', client_id)
      .eq('customer_phone', phone.trim())
      .in('status', ['confirmed', 'pending']);
    
    if (appointment_id) {
      query = query.eq('id', appointment_id);
    }
    
    const { data: appointments, error: findErr } = await query;
    
    if (findErr || !appointments || appointments.length === 0) {
      return { success: false, error: 'No upcoming appointment found for this phone number' };
    }
    
    // If multiple, cancel the soonest one
    const target = appointments.sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date))[0];
    
    // Cancel it
    const { data: updated, error: cancelErr } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', target.id)
      .select()
      .single();
    
    if (cancelErr) {
      return { success: false, error: 'Unable to cancel. Please try again.' };
    }
    
    // Send instant Telegram notification to clinic about cancellation
    try {
      const clinic = await getClientConfig(supabase, client_id);
      await notifyBookingCancelled({
        id: updated.id,
        date: updated.appointment_date,
        time: updated.appointment_time,
        patient_name: updated.customer_name,
        patient_phone: updated.customer_phone,
        treatment: updated.service_name,
        status: 'cancelled',
      }, clinic, 'Patient cancelled via WhatsApp');
    } catch (notifyErr) {
      console.error('[FUNCTION] Telegram cancellation notification failed:', notifyErr.message);
    }
    
    return {
      success: true,
      appointment: updated,
      message: `✅ Your appointment for ${target.service_name} on ${target.appointment_date} at ${target.appointment_time} has been cancelled.`
    };
    
  } catch (err) {
    console.error('[FUNCTION] cancelBooking error:', err.message);
    return { success: false, error: 'Cancellation error. Please call the clinic.' };
  }
}

// ─── 4. RESCHEDULE_BOOKING ────────────────────────────────────────
async function rescheduleBooking({ client_id, customer_phone, new_date, new_time }) {
  const supabase = getSupabase();
  
  try {
    if (!customer_phone || !new_date || !new_time) {
      return { success: false, error: 'Phone number, new date, and new time are required' };
    }
    
    // Find existing appointment
    const { data: appointments, error: findErr } = await supabase
      .from('appointments')
      .select('*')
      .eq('client_id', client_id)
      .eq('customer_phone', customer_phone.trim())
      .in('status', ['confirmed', 'pending'])
      .order('appointment_date', { ascending: true })
      .limit(1);
    
    if (findErr || !appointments || appointments.length === 0) {
      return { success: false, error: 'No upcoming appointment found to reschedule' };
    }
    
    const old = appointments[0];
    
    // Check new slot availability
    const availability = await checkAvailability({ client_id, date: new_date, service: old.service_name });
    if (!availability.success || !availability.slots.includes(new_time)) {
      return { success: false, error: `The new slot ${new_date} at ${new_time} is not available.` };
    }
    
    // Cancel old
    await supabase
      .from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', old.id);
    
    // Create new
    const result = await createBooking({
      client_id,
      customer_name: old.customer_name,
      customer_phone: old.customer_phone,
      service_name: old.service_name,
      appointment_date: new_date,
      appointment_time: new_time,
      notes: old.notes || '',
    });
    
    if (!result.success) {
      // Rollback: restore old booking
      await supabase
        .from('appointments')
        .update({ status: old.status, updated_at: new Date().toISOString() })
        .eq('id', old.id);
      return { success: false, error: 'Unable to reschedule. Your original booking is still active.' };
    }
    
    return {
      success: true,
      oldAppointment: old,
      newAppointment: result.appointment,
      message: `✅ Rescheduled! From ${old.appointment_date} ${old.appointment_time} → ${new_date} ${new_time}.`
    };
    
  } catch (err) {
    console.error('[FUNCTION] rescheduleBooking error:', err.message);
    return { success: false, error: 'Rescheduling error. Please call the clinic.' };
  }
}

// ─── 5. CHECK_EXISTING_BOOKING ────────────────────────────────────
async function checkExistingBooking({ client_id, customer_phone, patient_phone }) {
  const supabase = getSupabase();
  const phone = customer_phone || patient_phone;
  
  try {
    if (!phone) {
      return { success: false, error: 'Phone number required', appointments: [] };
    }
    
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('client_id', client_id)
      .eq('customer_phone', phone.trim())
      .in('status', ['confirmed', 'pending'])
      .order('appointment_date', { ascending: true })
      .limit(5);
    
    if (error) {
      console.error('[FUNCTION] checkExistingBooking error:', error.message);
      return { success: false, error: 'Unable to fetch appointments', appointments: [] };
    }
    
    return {
      success: true,
      count: appointments?.length || 0,
      appointments: appointments || [],
      message: appointments?.length > 0
        ? `You have ${appointments.length} upcoming appointment(s).`
        : 'No upcoming appointments found.'
    };
    
  } catch (err) {
    console.error('[FUNCTION] checkExistingBooking error:', err.message);
    return { success: false, error: 'System error', appointments: [] };
  }
}

// ─── 6. ADD_TO_WAITLIST ───────────────────────────────────────────
async function addToWaitlist({ client_id, customer_name, customer_phone, preferred_service, preferred_date, patient_name, patient_phone }) {
  const supabase = getSupabase();
  const name = customer_name || patient_name;
  const phone = customer_phone || patient_phone;
  const service = preferred_service;
  
  try {
    if (!name || !phone || !service) {
      return { success: false, error: 'Name, phone, and preferred service are required' };
    }
    
    // Check if waitlist is enabled
    const { data: clinic } = await supabase
      .from('client_configs')
      .select('booking_waitlist_enabled')
      .eq('client_id', client_id)
      .single();
    
    if (clinic?.booking_waitlist_enabled === false) {
      return { success: false, error: 'Waitlist is not available at this clinic.' };
    }
    
    const { data: entry, error } = await supabase
      .from('waitlist')
      .insert([{
        client_id,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        preferred_service: service.trim(),
        preferred_date: preferred_date || null,
        status: 'active',
        created_at: new Date().toISOString(),
      }])
      .select()
      .single();
    
    if (error) {
      console.error('[FUNCTION] addToWaitlist error:', error.message);
      return { success: false, error: 'Unable to add to waitlist. Please try again.' };
    }
    
    return {
      success: true,
      waitlistEntry: entry,
      message: `✅ You're on the waitlist for ${service}! We'll notify you when a slot opens.`
    };
    
  } catch (err) {
    console.error('[FUNCTION] addToWaitlist error:', err.message);
    return { success: false, error: 'Waitlist system error.' };
  }
}

// ─── 7. GET_TREATMENT_INFO ────────────────────────────────────────
async function getTreatmentInfo({ client_id, treatment_name, treatment }) {
  const supabase = getSupabase();
  const searchTerm = treatment_name || treatment;
  
  try {
    if (!searchTerm) {
      return { success: false, error: 'Treatment name required', treatment: null };
    }
    
    // Get clinic services
    const { data: clinic } = await supabase
      .from('client_configs')
      .select('services')
      .eq('client_id', client_id)
      .single();
    
    const services = clinic?.services || [];
    const normalized = searchTerm.toLowerCase().trim();
    
    // Exact match
    let match = services.find(s => s.name.toLowerCase() === normalized);
    // Partial match
    if (!match) {
      match = services.find(s => s.name.toLowerCase().includes(normalized));
    }
    // Reverse partial
    if (!match) {
      match = services.find(s => normalized.includes(s.name.toLowerCase()));
    }
    
    if (!match) {
      return { 
        success: false, 
        error: `We don't have "${searchTerm}" in our menu. Would you like to see our available treatments?`,
        availableTreatments: services.map(s => s.name)
      };
    }
    
    return {
      success: true,
      treatment: match,
      message: `${match.name}: ${match.description || ''} ${match.duration}min. $${match.price}${match.price_unit ? '/' + match.price_unit : ''}.`
    };
    
  } catch (err) {
    console.error('[FUNCTION] getTreatmentInfo error:', err.message);
    return { success: false, error: 'Unable to fetch treatment information.' };
  }
}

// ─── 8. GET_PRICING ──────────────────────────────────────────────
async function getPricing({ client_id, treatment_name, treatment, include_packages }) {
  const supabase = getSupabase();
  const searchTerm = treatment_name || treatment;
  
  try {
    const { data: clinic } = await supabase
      .from('client_configs')
      .select('services')
      .eq('client_id', client_id)
      .single();
    
    const services = clinic?.services || [];
    
    if (searchTerm) {
      // Specific treatment pricing
      const info = await getTreatmentInfo({ client_id, treatment_name: searchTerm });
      return info;
    }
    
    // Full price list
    const priceList = services.map(s => ({
      name: s.name,
      price: `$${s.price}${s.price_unit ? '/' + s.price_unit : ''}`,
      duration: `${s.duration}min`,
    }));
    
    return {
      success: true,
      priceList,
      message: `Here are our treatment prices:\n${priceList.map(p => `• ${p.name}: ${p.price} (${p.duration})`).join('\n')}`
    };
    
  } catch (err) {
    console.error('[FUNCTION] getPricing error:', err.message);
    return { success: false, error: 'Unable to fetch pricing.' };
  }
}

// ─── HELPER: Notify admin via Telegram ────────────────────────────
async function notifyAdmin(supabase, client_id, eventType, data) {
  // This will be wired to the Telegram bot module
  // For now, log to security_events table
  try {
    await supabase.from('security_events').insert([{
      severity: 'medium',
      category: 'admin_notification',
      service: 'telegram',
      description: `${eventType}: ${JSON.stringify(data).substring(0, 200)}`,
      details: { client_id, eventType, data },
    }]);
  } catch (e) {
    console.error('[FUNCTION] notifyAdmin error:', e.message);
  }
}

// ─── EXPORT ──────────────────────────────────────────────────────

module.exports = {
  checkAvailability,
  createBooking,
  cancelBooking,
  rescheduleBooking,
  checkExistingBooking,
  addToWaitlist,
  getTreatmentInfo,
  getPricing,
};
