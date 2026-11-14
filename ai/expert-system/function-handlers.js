/**
 * Moon Hands — Function Implementations
 * All 8 bot functions wired to actual Supabase operations.
 * Each function validates inputs, queries/updates the database, and returns structured results.
 */

const db = require('../../supabase/client');
const { notifyBookingCreated, notifyBookingCancelled, notifyBookingRescheduled, sendWeeklyRoundup } = require('../../telegram/booking-notifications');
const { getTodaySG, sgNowParts } = require('../../utils/date-helpers');

// ─── HELPER: Get Supabase client ──────────────────────────────────
function getSupabase() {
  return db.supabase;
}

// ─── v2.5.25 (A-1): SGT booking-window helpers ───────────────────
// Invariant 19 read order: config jsonb is canonical (nested wins); the
// flat column is the fallback for rows whose jsonb predates the sync
// (v2.5.19). ?? not || — 0 and false are real settings (v2.4.9 lesson).
function resolveBookingPref(clinic, key, fallback) {
  const nested = clinic?.config?.[key];
  if (nested !== undefined && nested !== null) return nested;
  const flat = clinic?.[key];
  if (flat !== undefined && flat !== null) return flat;
  return fallback;
}

// Calendar-day difference in whole Singapore days: 0 = same SG day,
// 1 = tomorrow, -1 = yesterday. Both inputs are YYYY-MM-DD strings compared
// as UTC midnights — immune to server-TZ drift. (The pre-v2.5.25 bug:
// new Date(date) is UTC midnight, so "today" measured NEGATIVE hours from
// 8am SGT onwards and every same-day request failed the min-notice check.)
function daysDiffSG(dateStr, todayStr) {
  const DAY = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(dateStr + 'T00:00:00Z') - Date.parse(todayStr + 'T00:00:00Z')) / DAY);
}

// Drop same-day slots starting before now + minNotice (SG wall clock).
// Mirrors availability-engine's per-slot min-notice gate so CHECK and BOOK
// give the same answer.
function filterSlotsByMinNotice(slots, nowMinutes, minNoticeHours) {
  const earliest = nowMinutes + minNoticeHours * 60;
  return (slots || []).filter(s => {
    const [h, m] = String(s).split(':').map(Number);
    return h * 60 + m >= earliest;
  });
}

// ─── v2.5.13 (P-3): preferred_time parsing/answering ─────────────
// The handler always ACCEPTED preferred_time but never used it — a patient
// asking "is 10am free?" got a bare slot count back.
function parseTimeToMinutes(t) {
  const match = String(t || '').match(/(\d{1,2}):?(\d{2})?\s*([ap]\.?m\.?)?/i);
  if (!match) return null;
  let hour = parseInt(match[1]);
  const min = parseInt(match[2]) || 0;
  const ampm = (match[3] || '').replace(/\./g, '').toLowerCase();
  if (ampm === 'pm' && hour !== 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (hour > 23 || min > 59) return null;
  return hour * 60 + min;
}

function minutesToDisplay(mins) {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

// ─── v2.5.16 (F5): strict format gate at the LLM function-call boundary ──
// Model-generated args used to reach the DB raw — "next Friday" as a date or
// "25:99" as a time would land in appointments and poison reminders, calendar
// sync, and slot math. Smart-router values are already well-formed; this gate
// only bites malformed (i.e. model-hallucinated) input.
function isValidDateStr(d) {
  const s = String(d || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, dd] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === dd;
}

function isValidTimeStr(t) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
}

function normalizeTo24h(t) {
  const s = String(t || '').trim().toLowerCase();
  const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/);
  if (ampm) {
    let h = parseInt(ampm[1]);
    const min = ampm[2] || '00';
    if (ampm[3] === 'p' && h !== 12) h += 12;
    if (ampm[3] === 'a' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  const hms = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/); // strips seconds
  if (hms) return `${hms[1].padStart(2, '0')}:${hms[2]}`;
  return String(t || '').trim(); // unrecognized — the validator will reject it
}

function buildPreferredTimeAnswer(preferredTime, slots, dayName, date) {
  const pt = String(preferredTime || '').trim().toLowerCase();
  if (!pt) return null;
  const displayDate = `${dayName}, ${date}`;
  const WINDOWS = { morning: [0, 720], afternoon: [720, 1020], evening: [1020, 1440] };
  const slotMins = (slots || []).map(parseTimeToMinutes).filter(m => m !== null);
  if (Object.prototype.hasOwnProperty.call(WINDOWS, pt)) {
    const [lo, hi] = WINDOWS[pt];
    const inWindow = slotMins.filter(m => m >= lo && m < hi);
    if (inWindow.length > 0) {
      const shown = inWindow.slice(0, 4).map(minutesToDisplay);
      return `Yes — ${pt} openings on ${displayDate}: ${shown.join(', ')}${inWindow.length > 4 ? ` (+${inWindow.length - 4} more)` : ''}. Would you like one of those?`;
    }
    if (slotMins.length > 0) {
      const shown = slotMins.slice(0, 4).map(minutesToDisplay);
      return `No ${pt} openings left on ${displayDate}, but we have: ${shown.join(', ')}. Would any of those work?`;
    }
    return null; // fall through to the fully-booked message
  }
  const asked = parseTimeToMinutes(pt);
  if (asked === null) return null; // unparseable preference — generic message
  if (slotMins.includes(asked)) {
    return `Yes — ${displayDate} at ${minutesToDisplay(asked)} is available. Would you like me to book it?`;
  }
  const nearby = slotMins
    .map(m => ({ m, d: Math.abs(m - asked) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(x => minutesToDisplay(x.m));
  if (nearby.length > 0) {
    return `${minutesToDisplay(asked)} on ${displayDate} isn't available. Nearest openings: ${nearby.join(', ')}. Would one of those work?`;
  }
  return null; // fully-booked message
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
    
    // v2.5.25 (A-1): all day math in Singapore time. The old code compared
    // UTC-midnight of the requested date against the live clock, so a
    // same-day request had NEGATIVE "hours until" for most of the SG day and
    // was rejected with a bogus min-notice message from 8am SGT onwards.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
      return { success: true, date, slots: [], bookedCount: 0,
        message: `I couldn't read that date ("${date}"). Could you give a day and month, e.g. 21 November?` };
    }
    const todayStr = getTodaySG();
    const daysDiff = daysDiffSG(date, todayStr);
    const requestedDate = new Date(date + 'T00:00:00Z');

    // v2.5.25: the clinic's own booking preferences — jsonb canonical
    // (Invariant 19), flat column fallback. Editable by the clinic via
    // /req_booking or by Moon Hands admin via /setbooking.
    const maxAdvance = resolveBookingPref(clinic, 'booking_max_advance_days', 30);
    const minNotice = resolveBookingPref(clinic, 'booking_min_notice_hours', 2);
    const allowSameDay = resolveBookingPref(clinic, 'booking_allow_same_day', true);
    
    // v2.5.13 (P-3): these are honest ANSWERS, not system failures — return
    // success:true with an empty slot list + a patient-facing message.
    // Downstream, success:false keeps the model's prose (empty after a forced
    // call) and fires a false stall alert; rescheduleBooking's refusal logic
    // (!success || slot missing) behaves identically either way.
    if (daysDiff < 0) {
      return { success: true, date, slots: [], bookedCount: 0,
        message: `That date (${date}) has already passed — could you pick a future date?` };
    }
    if (daysDiff > maxAdvance) {
      return { success: true, date, slots: [], bookedCount: 0,
        message: `We can only take bookings up to ${maxAdvance} days ahead, and ${date} is further out. Could you pick an earlier date?` };
    }
    if (daysDiff === 0 && !allowSameDay) {
      // Clinic's own preference (control panel / Moon Hands admin): no same-day.
      return { success: true, date, slots: [], bookedCount: 0,
        message: `We don't take same-day bookings — could you pick tomorrow or a later date?` };
    }
    
    // Check if clinic is open on this day
    const dayName = requestedDate.toLocaleDateString('en-US', { weekday: 'long' });
    // v2.2.5: operating_hours lives in the config jsonb as an ARRAY of
    // {day, isOpen, open_time, close_time} — the flat column never existed,
    // so this crashed (swallowed by the catch below) on every single call.
    const hours = clinic.operating_hours || clinic.config?.operating_hours;
    let openTime, closeTime;
    
    if (Array.isArray(hours)) {
      const dayRow = hours.find(h => (h.day || '').toLowerCase() === dayName.toLowerCase());
      if (!dayRow || dayRow.isOpen === false || !dayRow.open_time || !dayRow.close_time) {
        return { success: true, date, dayName, slots: [], bookedCount: 0,
          message: `We're closed on ${dayName}s, so ${date} isn't possible. Would you like a different day?` };
      }
      openTime = String(dayRow.open_time);
      closeTime = String(dayRow.close_time);
    } else if (typeof hours === 'object' && hours) {
      const dayHours = hours[dayName] || hours[dayName.substring(0, 3)];
      if (!dayHours || dayHours.toLowerCase().includes('closed')) {
        return { success: true, date, dayName, slots: [], bookedCount: 0,
          message: `We're closed on ${dayName}s, so ${date} isn't possible. Would you like a different day?` };
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
        return { success: true, date, dayName, slots: [], bookedCount: 0,
          message: `We're closed on ${dayName}s, so ${date} isn't possible. Would you like a different day?` };
      }
    }

    // Get existing appointments for this date
    const { data: existing, error: existingErr } = await supabase
      .from('appointments')
      .select('appointment_time, duration')
      .eq('client_id', client_id)
      .eq('appointment_date', date)
      .in('status', ['confirmed', 'pending']);
    
    if (existingErr) {
      console.error('[FUNCTION] checkAvailability query error:', existingErr.message);
    }
    
    // Daily cap (v2.2.8) — max_per_day collected at onboarding, never enforced
    const maxPerDay = clinic.max_per_day ?? clinic.config?.max_per_day ?? null;
    if (maxPerDay && (existing || []).length >= parseInt(maxPerDay)) {
      return { success: true, date, dayName, openTime, closeTime, slots: [], bookedCount: (existing || []).length,
        message: `Fully booked on ${date} — the clinic's daily cap is reached. Would you like a different day?` };
    }
    
    const bufferMin = clinic.config?.buffer_time ?? clinic.buffer_time ?? 15;
    const bookedPeriods = (existing || []).map(a => ({
      start: a.appointment_time,
      duration: a.duration || 30
    }));
    
    // Generate available slots (30-min intervals, duration+buffer aware)
    // v2.2.5: services live in config jsonb — the flat column never existed.
    const services = clinic.services || clinic.config?.services || [];
    let slots = generateTimeSlots(openTime, closeTime, bookedPeriods, service, services, bufferMin);

    // v2.5.25 (A-1): for same-day requests, drop slots starting before
    // now + minNotice (SG wall clock). generateTimeSlots itself has no clock
    // awareness — without this it offered 9am slots at 3pm.
    let sameDayWindowClosed = false;
    if (daysDiff === 0) {
      const { nowMinutes } = sgNowParts();
      const before = slots.length;
      slots = filterSlotsByMinNotice(slots, nowMinutes, minNotice);
      sameDayWindowClosed = before > 0 && slots.length === 0;
    }

    // v2.5.13 (P-3): if the patient asked about a specific time/window,
    // answer THAT question instead of returning a bare slot count.
    const preferredAnswer = buildPreferredTimeAnswer(timePreference, slots, dayName, date);
    return {
      success: true,
      date,
      dayName,
      openTime,
      closeTime,
      slots,
      bookedCount: bookedPeriods.length, // v2.2.5: was `bookedTimes` (undefined) — that ReferenceError alone made every call fail
      message: preferredAnswer || (sameDayWindowClosed
        ? `Today's remaining slots all start within our ${minNotice}-hour notice window, so the earliest I can offer is tomorrow. Shall I check tomorrow for you?`
        : slots.length > 0
          ? `We have ${slots.length} slots available on ${date}.`
          : `Fully booked on ${date}. Would you like to join the waitlist?`)
    };
    
  } catch (err) {
    console.error('[FUNCTION] checkAvailability error:', err.message);
    return { success: false, error: 'Unable to check availability', slots: [] };
  }
}

function generateTimeSlots(openTime, closeTime, bookedPeriods, serviceName, services, bufferMin = 15) {
  const slots = [];
  
  // Get service duration
  const service = (services || []).find(s => s.name.toLowerCase() === (serviceName || '').toLowerCase());
  const duration = (parseInt(service?.duration) || 30) + bufferMin; // appointment + turnover buffer
  
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
    
    // Check if this slot conflicts with existing bookings (interval overlap, buffer-aware)
    const conflicts = (bookedPeriods || []).some(bp => {
      const [bh, bm] = String(bp.start).split(':').map(Number);
      const bStart = bh * 60 + bm;
      const bEnd = bStart + (parseInt(bp.duration) || 30) + bufferMin;
      return mins < bEnd && (mins + duration) > bStart;
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
async function createBooking({ client_id, customer_name, customer_phone, service_name, appointment_date, appointment_time, notes, patient_name, patient_phone, treatment, date, time, duration: callerDuration, suppressNotification }) {
  const supabase = getSupabase();
  
  // Normalize parameter names (backward compatible)
  const name = customer_name || patient_name;
  const phone = customer_phone || patient_phone;
  const service = service_name || treatment;
  const apptDate = appointment_date || date;
  let apptTime = appointment_time || time;

  try {
    // Validation
    if (!name || !phone || !service || !apptDate || !apptTime) {
      return { success: false, error: 'Missing required fields: name, phone, service, date, time' };
    }

    // v2.5.16 (F5): strict format gate — never write an unparseable date/time
    apptTime = normalizeTo24h(apptTime);
    if (!isValidDateStr(apptDate) || !isValidTimeStr(apptTime)) {
      return { success: false, error: `I couldn't read that date/time clearly ("${apptDate} ${apptTime}"). Could you give a real date and time, e.g. 21 November 2026 at 2pm?` };
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
    
    // Check if same-day is allowed — SGT calendar day (v2.5.25: the old
    // UTC-date compare let same-day bookings slip through from midnight to
    // 8am SGT) + clinic preference, jsonb canonical.
    const today = getTodaySG();
    if (apptDate === today && resolveBookingPref(clinic, 'booking_allow_same_day', true) === false) {
      return { success: false, error: 'Same-day booking not available. Please book at least 1 day in advance.' };
    }
    
    // Check for conflicts (proper overlap detection, not just exact time match)
    const treatmentDuration = clinic.appointment_duration_minutes || 30;

    // UNIFIED GATE: opening hours + duration fits before close
    // (overlap conflicts are double-checked below)
    const { validateBookingSlot } = require('../availability-engine');
    const gate = await validateBookingSlot(client_id, apptDate, apptTime, callerDuration || treatmentDuration, clinic, null);
    if (!gate.ok) {
      return { success: false, error: `${gate.reason}. Would you like a different day or time?` };
    }
    const { data: existingBookings, error: conflictErr } = await supabase
      .from('appointments')
      .select('*')
      .eq('client_id', client_id)
      .eq('appointment_date', apptDate)
      .in('status', ['confirmed', 'pending', 'booked', 'pending_alternative']);
    
    if (conflictErr) {
      console.error('[FUNCTION] createBooking conflict check error:', conflictErr.message);
    }
    
    if (existingBookings && existingBookings.length > 0) {
      // Parse requested time
      const [reqH, reqM] = apptTime.split(':').map(Number);
      const reqStart = reqH * 60 + reqM;
      const reqEnd = reqStart + parseInt(treatmentDuration);
      
      // Check for overlap with each existing booking
      for (const existing of existingBookings) {
        const [exH, exM] = existing.appointment_time.split(':').map(Number);
        const exStart = exH * 60 + exM;
        const exDuration = existing.duration || existing.duration_minutes || clinic.appointment_duration_minutes || 30;
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
    // NOTE: Column names must match schema exactly. Valid columns:
    // id, client_id, conversation_id, customer_name, customer_phone,
    // service, appointment_date, appointment_time, duration, status,
    // notes, reminder_24h_sent, reminder_1h_sent, followup_48h_sent,
    // approval_notified, created_at, updated_at
    const bookingDuration = callerDuration || treatmentDuration || 60;
    
    const { data: appointment, error: insertErr } = await supabase
      .from('appointments')
      .insert([{
        client_id,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        service: service.trim(),
        appointment_date: apptDate,
        appointment_time: apptTime,
        duration: bookingDuration,
        notes: notes || '',
        status,
        reminder_24h_sent: false,
        reminder_1h_sent: false,
        followup_48h_sent: false,
        approval_notified: false,
      }])
      .select()
      .single();
    
    if (insertErr) {
      console.error('[FUNCTION] createBooking insert error:', insertErr.message);
      // v2.5.26 (A-4): the DB exclusion constraint no_overlapping_active_bookings
      // is the hard wall against the check-then-insert race — 23P01 means
      // another booking won this slot between our conflict check and this
      // write. Honest answer, never "try again" (retrying changes nothing).
      if (insertErr.code === '23P01') {
        return { success: false, error: 'That slot was just taken by another booking at the same moment. Please pick a different time.', slotTaken: true };
      }
      return { success: false, error: 'Unable to create booking. Please try again.' };
    }
    
    // Notify admin about pending booking
    await notifyAdmin(supabase, client_id, 'new_pending_booking', appointment);
    
    // Send instant Telegram notification to clinic (real-time booking alert)
    // suppressNotification: rescheduleBooking sends its own richer FROM→TO
    // alert — a generic "new booking" on top would double-notify staff.
    if (!suppressNotification) {
    try {
      await notifyBookingCreated({
        id: appointment.id,
        date: appointment.appointment_date,
        time: appointment.appointment_time,
        patient_name: appointment.customer_name,
        patient_phone: appointment.customer_phone,
        treatment: appointment.service,
        notes: appointment.notes,
        status: appointment.status,
      }, clinic);
    } catch (notifyErr) {
      console.error('[FUNCTION] Telegram booking notification failed:', notifyErr.message);
    }
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

// ─── 2b. UPDATE_BOOKING (edit-in-place) ────────────────────────────
// Used by the patient-facing Edit flow: instead of cancel+recreate (which
// loses the booking ID and spams notifications), update the existing row.
// Any change to date/time/service sends the booking back to PENDING —
// the clinic must re-approve. Name/phone-only edits keep the status.
async function updateBooking({ client_id, appointment_id, date, time, service, duration, name, phone }) {
  const supabase = getSupabase();

  try {
    if (!client_id || !appointment_id) {
      return { success: false, error: 'Missing booking reference' };
    }

    // Fetch the existing booking — must belong to this clinic and be live
    const { data: existing, error: findErr } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointment_id)
      .eq('client_id', client_id)
      .in('status', ['confirmed', 'pending', 'booked', 'pending_alternative', 'pending_approval'])
      .single();

    if (findErr || !existing) {
      return { success: false, error: 'I could not find that booking — it may have been cancelled already.' };
    }

    // Get clinic config (for hours validation + notification)
    const { data: clinic, error: clinicErr } = await supabase
      .from('client_configs')
      .select('*')
      .eq('client_id', client_id)
      .single();
    if (clinicErr || !clinic) {
      return { success: false, error: 'Clinic configuration not found' };
    }

    const newDate = date || existing.appointment_date;
    // v2.5.16 (F5): normalize + strict format gate on schedule edits too
    const newTime = normalizeTo24h(time || existing.appointment_time);
    if (!isValidDateStr(newDate) || !isValidTimeStr(newTime)) {
      return { success: false, error: `I couldn't read that new date/time clearly ("${newDate} ${newTime}"). Could you give a real date and time?` };
    }
    const newService = service || existing.service;
    const newDuration = parseInt(duration) || existing.duration || clinic.appointment_duration_minutes || 60;

    // v2.3.6: compare times normalized to HH:MM on BOTH sides. Postgres returns
    // appointment_time as 'HH:MM:SS' while callers pass 'HH:MM', so a raw !==
    // made EVERY details-only edit look like a schedule change — wrongly
    // re-pending the booking, firing BOOKING RESCHEDULED with identical times,
    // and skipping the BOOKING DETAILS UPDATED alert.
    const { normalizeTimeStr: normT } = require('../../utils/date-helpers');
    const scheduleChanged = newDate !== existing.appointment_date || normT(newTime) !== normT(existing.appointment_time);
    const serviceChanged = newService !== existing.service;

    // Validate the new slot — EXCLUDING this booking from the conflict check
    if (scheduleChanged || serviceChanged) {
      const { validateBookingSlot } = require('../availability-engine');
      const gate = await validateBookingSlot(client_id, newDate, newTime, newDuration, clinic, appointment_id);
      if (!gate.ok) {
        return { success: false, error: `${gate.reason}. Would you like a different day or time?` };
      }
    }

    const updatePayload = {
      appointment_date: newDate,
      appointment_time: newTime,
      service: newService,
      duration: newDuration,
      updated_at: new Date().toISOString(),
    };
    if (name) updatePayload.customer_name = name;
    if (phone) updatePayload.customer_phone = phone;
    // Schedule/service changes need fresh clinic approval
    if (scheduleChanged || serviceChanged) {
      updatePayload.status = 'pending';
      updatePayload.approval_notified = false;
    }

    const { data: updated, error: updErr } = await supabase
      .from('appointments')
      .update(updatePayload)
      .eq('id', appointment_id)
      .select()
      .single();

    if (updErr) {
      console.error('[FUNCTION] updateBooking update error:', updErr.message);
      // v2.5.26 (A-4): 23P01 = the new slot was taken between check and write.
      if (updErr.code === '23P01') {
        return { success: false, error: 'That new slot was just taken by another booking. Please pick a different time.', slotTaken: true };
      }
      return { success: false, error: 'Unable to update the booking. Please try again.' };
    }

    // v2.5.10 (R-3a): a schedule change must not orphan the old calendar
    // event — the approve path creates a fresh event and overwrites
    // google_event_id, leaving the old event blocking its slot forever
    // (B2-2 ghost class on the reschedule path). Delete via the service
    // account (same pattern as cancel, v2.5.9) and null the reference so
    // re-approval creates exactly one fresh event on the new slot. The old
    // slot stays protected by the pending DB row's new slot, and freeing the
    // old slot immediately is what the patient expects ("I moved off that day").
    if (scheduleChanged && existing.google_event_id) {
      try {
        const { data: clinicRow } = await supabase.from('clients').select('google_calendar_id').eq('id', client_id).single();
        if (clinicRow?.google_calendar_id) {
          const { deleteBookingEvent } = require('../../server/calendar-service');
          const deleted = await deleteBookingEvent(clinicRow.google_calendar_id, existing.google_event_id);
          if (deleted === true) {
            await supabase.from('appointments').update({ google_event_id: null }).eq('id', appointment_id);
            console.log(`[FUNCTION] updateBooking: old event ${existing.google_event_id} deleted after schedule change on ${appointment_id}`);
          } else {
            throw new Error('deleteBookingEvent did not confirm deletion');
          }
        }
      } catch (calDelErr) {
        // Fail-loud, never block the reschedule: the row keeps the old
        // google_event_id so the approve path's patch fallback (R-3b) can
        // still move the event onto the new slot.
        console.error('[FUNCTION] updateBooking old-event delete failed (proceeding):', calDelErr.message);
        try {
          const { notifyAdmin } = require('../../monitoring/audit-system');
          await notifyAdmin(`⚠️ Reschedule calendar ghost risk — old event ${existing.google_event_id} for booking ${appointment_id} could not be deleted: ${calDelErr.message}. Re-approval will attempt a patch; manual cleanup may be needed.`);
        } catch { /* alerting must never break booking */ }
      }
    }

    // Notify clinic about the change (real-time Telegram alert)
    if (scheduleChanged || serviceChanged) {
      try {
        await notifyBookingRescheduled(existing, updated, clinic);
      } catch (notifyErr) {
        console.error('[FUNCTION] Reschedule notification failed:', notifyErr.message);
      }
    } else {
      // v2.3.5: details-only change (name/phone) — schedule untouched, status
      // stays as-is, but the clinic must SEE it (was a silent write before).
      const detailsChanged = (name && name !== existing.customer_name)
        || (phone && phone !== existing.customer_phone);
      if (detailsChanged) {
        try {
          const { notifyBookingDetailsUpdated } = require('../../telegram/booking-notifications');
          await notifyBookingDetailsUpdated(existing, updated, clinic);
        } catch (notifyErr) {
          console.error('[FUNCTION] Details-updated notification failed:', notifyErr.message);
        }
      }
    }

    return {
      success: true,
      appointment: updated,
      changed: scheduleChanged || serviceChanged,
      message: `Booking updated: ${newService} on ${newDate} at ${newTime}.`
    };

  } catch (err) {
    console.error('[FUNCTION] updateBooking error:', err.message);
    return { success: false, error: 'Update system error. Please try again or call the clinic.' };
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
    
    // v2.5.9 (B2-2): delete the calendar event via the service-account path —
    // this expert cancel previously left ghost events blocking the slot.
    try {
      const { deleteBookingEvent } = require('../../server/calendar-service');
      const { data: clinicRow } = await supabase
        .from('clients')
        .select('google_calendar_id')
        .eq('id', client_id)
        .single();
      if (target.google_event_id && clinicRow?.google_calendar_id) {
        await deleteBookingEvent(clinicRow.google_calendar_id, target.google_event_id);
      }
    } catch (calErr) {
      console.error('[FUNCTION] Calendar delete failed:', calErr.message);
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
        treatment: updated.service,
        status: 'cancelled',
      }, clinic, 'Patient cancelled via WhatsApp');
    } catch (notifyErr) {
      console.error('[FUNCTION] Telegram cancellation notification failed:', notifyErr.message);
    }
    
    return {
      success: true,
      appointment: updated,
      message: `✅ Your appointment for ${target.service} on ${target.appointment_date} at ${target.appointment_time} has been cancelled.`
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
    
    // Normalize LLM time formats ("13:00:00" → "13:00") before slot matching —
    // strict string equality against HH:MM slots was a silent-failure trap.
    const { normalizeTimeStr } = require('../../utils/date-helpers');
    // v2.5.16 (F5): normalize (incl. am/pm + seconds) + strict format gate
    const normalizedTime = normalizeTo24h(normalizeTimeStr(new_time));
    if (!isValidDateStr(new_date) || !isValidTimeStr(normalizedTime)) {
      return { success: false, error: `I couldn't read that new date/time clearly ("${new_date} ${new_time}"). Could you give a real date and time?` };
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
    
    // Check new slot availability (normalize slot list too — belt and braces)
    const availability = await checkAvailability({ client_id, date: new_date, service: old.service });
    const availSlots = (availability.slots || []).map(normalizeTimeStr);
    if (!availability.success || !availSlots.includes(normalizedTime)) {
      return { success: false, error: `The new slot ${new_date} at ${normalizedTime} is not available.` };
    }
    
    // Clinic config for the reschedule notification
    const { data: clinicCfg } = await supabase
      .from('client_configs')
      .select('*')
      .eq('client_id', client_id)
      .single();
    
    // Cancel old
    await supabase
      .from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', old.id);
    
    // Create new — keep the original duration (v2.2.4 made duration real;
    // rescheduling must not regress it to the 30-min default), and suppress
    // the generic new-booking alert (replaced by the FROM→TO notice below).
    const result = await createBooking({
      client_id,
      customer_name: old.customer_name,
      customer_phone: old.customer_phone,
      service_name: old.service,
      appointment_date: new_date,
      appointment_time: normalizedTime,
      duration: old.duration || undefined,
      notes: old.notes || '',
      suppressNotification: true,
    });
    
    if (!result.success) {
      // Rollback: restore old booking
      await supabase
        .from('appointments')
        .update({ status: old.status, updated_at: new Date().toISOString() })
        .eq('id', old.id);
      return { success: false, error: 'Unable to reschedule. Your original booking is still active.' };
    }
    
    // Notify clinic: FROM → TO (v2.2.5 — this path used to be completely
    // silent; the clinic only found out when the patient didn't show up).
    try {
      await notifyBookingRescheduled(old, result.appointment, clinicCfg || { id: client_id, client_id });
    } catch (notifyErr) {
      console.error('[FUNCTION] reschedule notify failed:', notifyErr.message);
    }
    
    return {
      success: true,
      oldAppointment: old,
      newAppointment: result.appointment,
      message: `✅ Rescheduled! From ${old.appointment_date} ${old.appointment_time} → ${new_date} ${normalizedTime}. The clinic has been notified.`
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
    // Partial match (e.g. "botox" → "Botox Consultation")
    if (!match) {
      match = services.find(s => s.name.toLowerCase().includes(normalized));
    }
    // Reverse partial (e.g. "Botox Consultation" → "botox")
    if (!match) {
      match = services.find(s => normalized.includes(s.name.toLowerCase()));
    }
    // Word-level match: check each word in the search term against each service name
    // (e.g. "do you do botox" → "botox" matches "Botox Consultation")
    if (!match) {
      const searchWords = normalized.split(/\s+/).filter(w => w.length > 2);
      match = services.find(s => {
        const serviceWords = s.name.toLowerCase().split(/\s+/);
        return searchWords.some(sw => serviceWords.includes(sw) || sw.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(sw));
      });
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
      message: `${match.name}: ${match.description || ''} ${match.duration}min. $${String(match.price).replace(/^\$+/, '')}${match.price_unit ? '/' + match.price_unit : ''}.`
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
      price: `$${String(s.price).replace(/^\$+/, '')}${s.price_unit ? '/' + s.price_unit : ''}`,
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
    // v2.2.3: real security_events schema — event_type/actor/target/details.
    // The old category/service/description columns do not exist; every
    // insert here was being rejected silently.
    await supabase.from('security_events').insert([{
      event_type: 'admin_notification',
      actor: 'whatsapp-bot',
      target: String(client_id || 'unknown'),
      severity: 'medium',
      details: { description: `${eventType}: ${JSON.stringify(data).substring(0, 200)}`, eventType },
    }]);
  } catch (e) {
    console.error('[FUNCTION] notifyAdmin error:', e.message);
  }
}

// ─── EXPORT ──────────────────────────────────────────────────────

module.exports = {
  checkAvailability,
  createBooking,
  resolveBookingPref,
  daysDiffSG,
  filterSlotsByMinNotice,
  updateBooking,
  cancelBooking,
  rescheduleBooking,
  checkExistingBooking,
  addToWaitlist,
  getTreatmentInfo,
  getPricing,
};
