/**
 * Moon Hands — Availability Engine v1
 * 
 * Calculates available time slots considering:
 *   1. Clinic operating hours
 *   2. Treatment duration (sums for multi-treatment bookings)
 *   3. Buffer time between appointments
 *   4. Existing bookings from Supabase + Google Calendar
 * 
 * Returns pre-validated slots that can be rendered as WhatsApp buttons.
 */

const { supabase } = require('../supabase/client');
const { getTodaySG, getDayNameSafe, addDaysToDateStr, formatDateStrDisplay } = require('../utils/date-helpers');

const SLOT_INTERVAL_MIN = 30; // Offer slots every 30 minutes

/**
 * Get available time slots for a specific date and treatment(s).
 * 
 * @param {string} clientId - Clinic/client ID
 * @param {string} dateStr - YYYY-MM-DD
 * @param {Array<string>} treatmentNames - Names of selected treatments
 * @param {Object} clientConfig - Full client config with services & operating_hours
 * @returns {Promise<{available: boolean, slots: string[], reason: string|null, operatingHours: string, totalDuration: number}>}
 */
async function getAvailableSlots(clientId, dateStr, treatmentNames, clientConfig) {
  // 1. Get operating hours for the day.
  // TZ-deterministic: never new Date(str + 'T00:00:00+08:00').getDay() —
  // on UTC servers (Render) that returns the PREVIOUS day's name.
  const dayName = getDayNameSafe(dateStr);
  
  const hours = (clientConfig.config?.operating_hours || clientConfig.operating_hours || [])
    .find(h => h.day === dayName);
  
  if (!hours || !hours.isOpen) {
    return { available: false, slots: [], reason: `${dayName}s we're closed`, operatingHours: null, totalDuration: 0 };
  }
  
  if (!hours.open_time || !hours.close_time) {
    return { available: false, slots: [], reason: `No hours set for ${dayName}`, operatingHours: null, totalDuration: 0 };
  }
  
  // 2. Calculate total treatment duration (multi-treatment support)
  const services = clientConfig.config?.services || [];
  let totalDuration = 0;
  for (const tName of treatmentNames) {
    const svc = services.find(s => 
      s.name.toLowerCase().includes(tName.toLowerCase()) ||
      tName.toLowerCase().includes(s.name.toLowerCase())
    );
    totalDuration += parseInt(svc?.duration) || 60;
  }
  // If no treatments matched, default to 60 min
  if (totalDuration === 0) totalDuration = 60;
  
  const bufferMin = clientConfig.config?.buffer_time ?? clientConfig.buffer_time ?? 15;
  const slotDuration = totalDuration + bufferMin;
  
  // 3. Get existing bookings for this date from Supabase
  const { data: existingBookings, error } = await supabase
    .from('appointments')
    .select('appointment_time, duration')
    .eq('client_id', clientId)
    .eq('appointment_date', dateStr)
    // 'pending_alternative' = clinic suggested a different time via Telegram;
    // the slot stays blocked until the patient accepts or declines.
    // 'pending_approval' = patient booked, clinic hasn't confirmed yet — the
    // slot MUST stay blocked so two patients can't take the same slot.
    .in('status', ['confirmed', 'pending', 'booked', 'pending_alternative', 'pending_approval'])
    .order('appointment_time');
  
  if (error) {
    console.error(`[AVAILABILITY] Supabase error: ${error.message}`);
  }
  
  // 4. Convert to busy periods (duration + turnover buffer per booking)
  const busyPeriods = (existingBookings || []).map(b => ({
    start: minutesFromTime(b.appointment_time),
    end: minutesFromTime(b.appointment_time) + (b.duration || 60) + bufferMin
  }));

  // 4b. Merge Google Calendar busy blocks — appointments the clinic typed
  // straight into their calendar (offline/walk-ins) must also block slots.
  // Fail-open: a GCal outage must never take booking down.
  const calendarId = clientConfig.config?.google_calendar_id || clientConfig.google_calendar_id;
  if (calendarId) {
    try {
      const { getBusyTimes } = require('../server/calendar-service');
      const gcalBusy = await getBusyTimes(calendarId, dateStr);
      for (const ev of (gcalBusy || [])) busyPeriods.push(gcalEventToPeriod(ev));
    } catch (gcalErr) {
      console.warn('[AVAILABILITY] GCal busy-merge failed (fail-open):', gcalErr.message);
    }
  }
  
  // 5. Calculate free slots
  const openMin = minutesFromTime(hours.open_time);
  const closeMin = minutesFromTime(hours.close_time);
  
  // Merge overlapping busy periods
  const mergedBusy = mergeBusyPeriods(busyPeriods);
  
  // ─── FILTER PAST SLOTS FOR SAME-DAY BOOKINGS ────────────────────
  // If the requested date is today, skip slots that have already passed
  // and enforce a minimum notice period (default 2 hours).
  let minStartMin = openMin;
  const isToday = dateStr === getTodaySG();
  if (isToday) {
    const now = new Date();
    // Get current Singapore time reliably regardless of server timezone
    const sgTimeStr = now.toLocaleString('en-US', {
      timeZone: 'Asia/Singapore',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const [sgHour, sgMinute] = sgTimeStr.split(':').map(Number);
    const currentMin = sgHour * 60 + sgMinute;
    const noticeMin = (clientConfig.config?.booking_min_notice_hours || 2) * 60;
    minStartMin = Math.max(openMin, currentMin + noticeMin);
  }
  
  // Generate candidate slots every SLOT_INTERVAL_MIN starting from open time
  const slots = [];
  for (let candidate = openMin; candidate + slotDuration <= closeMin; candidate += SLOT_INTERVAL_MIN) {
    // Skip slots that are in the past or within the notice period for today
    if (candidate < minStartMin) continue;
    
    const candidateEnd = candidate + slotDuration;
    // Check if candidate overlaps with any busy period
    const isOverlapping = mergedBusy.some(busy => 
      candidate < busy.end && candidateEnd > busy.start
    );
    if (!isOverlapping) {
      slots.push(formatTime(candidate));
    }
  }
  
  return {
    available: slots.length > 0,
    slots: slots.slice(0, 8), // Max 8 slots for button display
    reason: slots.length > 0 ? null : `Fully booked on ${dateStr}`,
    operatingHours: `${hours.open_time} – ${hours.close_time}`,
    totalDuration
  };
}

/**
 * Get next N available dates (starting from tomorrow) with available slots.
 * Uses Singapore timezone to ensure correct dates regardless of server location.
 * Useful for "Quick Date" buttons.
 */
async function getNextAvailableDates(clientId, treatmentNames, clientConfig, count = 4) {
  const results = [];
  // Compute today in Singapore timezone (UTC+8) regardless of server timezone
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }); // YYYY-MM-DD

  for (let i = 1; i <= 21 && results.length < count; i++) {
    const dateStr = addDaysToDateStr(todayStr, i); // TZ-deterministic

    const avail = await getAvailableSlots(clientId, dateStr, treatmentNames, clientConfig);
    if (avail.available) {
      results.push({ date: dateStr, label: formatDateStrDisplay(dateStr), slots: avail.slots, operatingHours: avail.operatingHours });
    }
  }

  return results;
}

/**
 * Get the next available slots starting from a specific date.
 * When a user picks a date that has no slots, this finds the earliest
 * alternatives and presents them as buttons — no guessing required.
 * 
 * @param {string} clientId - Clinic/client ID
 * @param {Array<string>} treatmentNames - Names of selected treatments
 * @param {Object} clientConfig - Full client config
 * @param {string} fromDateStr - The date the user already tried (YYYY-MM-DD)
 * @param {number} daysToSearch - How many days ahead to search (default 14)
 * @returns {Promise<{found: boolean, nextDate: string|null, nextSlots: string[], label: string, allDates: Array}>}
 */
async function findNextAvailableAfter(clientId, treatmentNames, clientConfig, fromDateStr, daysToSearch = 21) {
  const allDates = [];

  for (let i = 1; i <= daysToSearch && allDates.length < 3; i++) {
    const dateStr = addDaysToDateStr(fromDateStr, i); // TZ-deterministic

    const avail = await getAvailableSlots(clientId, dateStr, treatmentNames, clientConfig);
    if (avail.available && avail.slots.length > 0) {
      allDates.push({
        date: dateStr,
        label: formatDateStrDisplay(dateStr),
        slots: avail.slots,
        operatingHours: avail.operatingHours
      });
    }
  }
  
  if (allDates.length === 0) {
    return { found: false, nextDate: null, nextSlots: [], label: null, allDates: [] };
  }
  
  return {
    found: true,
    nextDate: allDates[0].date,
    nextSlots: allDates[0].slots,
    label: allDates[0].label,
    allDates
  };
}

/**
 * Get the next available time slots on the SAME date, starting after a given time.
 * Used when a user requests a time that's already booked or outside hours.
 */
async function findNextSlotsOnDate(clientId, dateStr, treatmentNames, clientConfig, afterTimeStr = null) {
  const avail = await getAvailableSlots(clientId, dateStr, treatmentNames, clientConfig);
  if (!avail.available) {
    return { found: false, slots: [] };
  }
  
  if (!afterTimeStr) {
    return { found: true, slots: avail.slots.slice(0, 6) };
  }
  
  const afterMin = minutesFromTime(afterTimeStr);
  const laterSlots = avail.slots.filter(t => minutesFromTime(t) > afterMin);
  
  if (laterSlots.length === 0) {
    return { found: false, slots: [] };
  }
  
  return { found: true, slots: laterSlots.slice(0, 6) };
}

// ─── HELPERS ──────────────────────────────────────────────────────

/**
 * Convert a Google Calendar busy block ({start,end} ISO datetime, or
 * date-only for all-day events) into a busy period in Singapore
 * minutes-since-midnight. All-day events block the whole day.
 */
function gcalEventToPeriod(ev) {
  if (!ev || !ev.start || !ev.end) return { start: 0, end: 1440 };
  if (String(ev.start).length <= 10) return { start: 0, end: 1440 }; // all-day
  const toSgMin = (iso) => {
    const parts = new Date(iso).toLocaleString('en-US', {
      timeZone: 'Asia/Singapore', hour12: false, hour: '2-digit', minute: '2-digit'
    });
    const [h, m] = parts.split(':').map(Number);
    return h * 60 + m;
  };
  return { start: toSgMin(ev.start), end: toSgMin(ev.end) };
}

function minutesFromTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/**
 * Format a date as YYYY-MM-DD using Singapore timezone.
 * Accepts a Date object (assumed to be in Singapore local time context).
 */
function formatDateSG(d) {
  // d is already constructed in SG context, just format it consistently
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getDateLabel(d, offset) {
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // Use consistent short format for ALL dates (max ~13 chars, well under 20-char WhatsApp limit)
  return `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]}`;
}

function getDateLabelSG(d, offset) {
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]}`;
}

function mergeBusyPeriods(periods) {
  if (periods.length === 0) return [];
  const sorted = [...periods].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, sorted[i].end);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

/**
 * Check if a specific time is available (not overlapping with existing bookings).
 * Unlike getAvailableSlots which returns pre-generated interval slots,
 * this checks the exact requested time against actual booked periods.
 */
async function isTimeAvailable(clientId, dateStr, timeStr, treatmentNames, clientConfig) {
  // 1. Get existing bookings for this date
  const { data: existingBookings, error } = await supabase
    .from('appointments')
    .select('appointment_time, duration')
    .eq('client_id', clientId)
    .eq('appointment_date', dateStr)
    .in('status', ['confirmed', 'pending', 'booked', 'pending_alternative']);

  if (error) {
    console.error(`[AVAILABILITY] isTimeAvailable error: ${error.message}`);
    return false;
  }

  // 2. Calculate total treatment duration
  const services = clientConfig.config?.services || [];
  let totalDuration = 0;
  for (const tName of treatmentNames) {
    const svc = services.find(s =>
      s.name.toLowerCase().includes(tName.toLowerCase()) ||
      tName.toLowerCase().includes(s.name.toLowerCase())
    );
    totalDuration += parseInt(svc?.duration) || 60;
  }
  if (totalDuration === 0) totalDuration = 60;

  const bufferMin = clientConfig.config?.buffer_time ?? clientConfig.buffer_time ?? 15;
  const slotDuration = totalDuration + bufferMin;

  // 3. Check overlap with existing bookings
  const requestedStart = minutesFromTime(timeStr);
  const requestedEnd = requestedStart + slotDuration;

  const busyPeriods = (existingBookings || []).map(b => ({
    start: minutesFromTime(b.appointment_time),
    end: minutesFromTime(b.appointment_time) + (b.duration || 60) + bufferMin
  }));

  const mergedBusy = mergeBusyPeriods(busyPeriods);

  return !mergedBusy.some(busy =>
    requestedStart < busy.end && requestedEnd > busy.start
  );
}

/**
 * UNIFIED BOOKING GATE — single source of truth for "can this slot be booked?"
 * Every booking creation path (bot-engine, expert function-handlers, patient
 * counter-proposals) MUST pass through this before writing an appointment.
 *
 * Checks, in order:
 *   1. Clinic is open that day (closed days rejected)
 *   2. Start time within opening hours
 *   3. start + duration fits before closing time
 *   4. No overlap with existing bookings that still hold their slot:
 *      confirmed / pending / booked / pending_alternative / pending_approval
 *
 * @param {string} clientId
 * @param {string} dateStr  - YYYY-MM-DD
 * @param {string} timeStr  - HH:MM (24h)
 * @param {number} durationMin
 * @param {Object} clientConfig - full client config (uses config.operating_hours)
 * @param {string|null} excludeBookingId - booking to ignore (e.g. the one being rescheduled)
 * @returns {Promise<{ok: boolean, reason: string|null, openTime: string|null, closeTime: string|null}>}
 */
async function validateBookingSlot(clientId, dateStr, timeStr, durationMin, clientConfig, excludeBookingId = null) {
  const hours = clientConfig?.config?.operating_hours || clientConfig?.operating_hours || [];
  const dur = parseInt(durationMin) || 60;
  const bufferMin = clientConfig?.config?.buffer_time ?? clientConfig?.buffer_time ?? 15;

  // 1–3. Opening-hours checks (only when hours are configured)
  if (Array.isArray(hours) && hours.length > 0 && dateStr) {
    const dayName = getDayNameSafe(dateStr); // TZ-deterministic
    const dayEntry = hours.find(h => h.day === dayName);
    if (dayEntry) {
      if (!dayEntry.isOpen) {
        return { ok: false, reason: `${dayName}s we're closed`, openTime: null, closeTime: null };
      }
      if (timeStr && dayEntry.open_time && dayEntry.close_time) {
        const start = minutesFromTime(timeStr);
        const open = minutesFromTime(dayEntry.open_time);
        const close = minutesFromTime(dayEntry.close_time);
        if (start < open) {
          return { ok: false, reason: `We open at ${dayEntry.open_time} on ${dayName}s`, openTime: dayEntry.open_time, closeTime: dayEntry.close_time };
        }
        if (start + dur > close) {
          return { ok: false, reason: `We close at ${dayEntry.close_time} on ${dayName}s — a ${dur}-min session wouldn't fit at that time`, openTime: dayEntry.open_time, closeTime: dayEntry.close_time };
        }
      }
    }
  }

  // 4. Conflict check against slot-holding bookings
  if (dateStr && timeStr) {
    const { data: existing, error } = await supabase
      .from('appointments')
      .select('id, appointment_time, duration')
      .eq('client_id', clientId)
      .eq('appointment_date', dateStr)
      .in('status', ['confirmed', 'pending', 'booked', 'pending_alternative', 'pending_approval']);
    if (error) {
      console.error('[AVAILABILITY] validateBookingSlot conflict check error:', error.message);
      // fail-closed on conflicts would block all bookings on a DB hiccup;
      // fail-open here matches existing behavior, hours checks above still ran
    }
    const start = minutesFromTime(timeStr);
    const end = start + dur + bufferMin;
    const busyPeriods = (existing || [])
      .filter(b => !(excludeBookingId && b.id === excludeBookingId))
      .map(b => ({
        start: minutesFromTime(b.appointment_time),
        end: minutesFromTime(b.appointment_time) + (b.duration || 60) + bufferMin
      }));

    // Google Calendar busy-merge (offline/walk-in appointments) — fail-open
    const calendarId = clientConfig?.config?.google_calendar_id || clientConfig?.google_calendar_id;
    if (calendarId) {
      try {
        const { getBusyTimes } = require('../server/calendar-service');
        const gcalBusy = await getBusyTimes(calendarId, dateStr);
        for (const ev of (gcalBusy || [])) busyPeriods.push(gcalEventToPeriod(ev));
      } catch (gcalErr) {
        console.warn('[AVAILABILITY] GCal busy-merge failed (fail-open):', gcalErr.message);
      }
    }

    for (const b of busyPeriods) {
      if (start < b.end && end > b.start) {
        return { ok: false, reason: 'That time overlaps an existing booking', openTime: null, closeTime: null };
      }
    }
  }

  return { ok: true, reason: null, openTime: null, closeTime: null };
}

module.exports = {
  getAvailableSlots,
  getNextAvailableDates,
  findNextAvailableAfter,
  findNextSlotsOnDate,
  isTimeAvailable,
  validateBookingSlot,
  formatTime,
  formatDate
};
