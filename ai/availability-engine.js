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
  // 1. Get operating hours for the day
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dateObj = new Date(dateStr + 'T00:00:00+08:00');
  const dayName = dayNames[dateObj.getDay()];
  
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
  
  const bufferMin = clientConfig.config?.buffer_time || 15;
  const slotDuration = totalDuration + bufferMin;
  
  // 3. Get existing bookings for this date from Supabase
  const { data: existingBookings, error } = await supabase
    .from('appointments')
    .select('appointment_time, duration')
    .eq('client_id', clientId)
    .eq('appointment_date', dateStr)
    .in('status', ['confirmed', 'pending', 'booked'])
    .order('appointment_time');
  
  if (error) {
    console.error(`[AVAILABILITY] Supabase error: ${error.message}`);
  }
  
  // 4. Convert to busy periods
  const busyPeriods = (existingBookings || []).map(b => ({
    start: minutesFromTime(b.appointment_time),
    end: minutesFromTime(b.appointment_time) + (b.duration || 60)
  }));
  
  // 5. Calculate free slots
  const openMin = minutesFromTime(hours.open_time);
  const closeMin = minutesFromTime(hours.close_time);
  
  // Merge overlapping busy periods
  const mergedBusy = mergeBusyPeriods(busyPeriods);
  
  // Generate candidate slots every SLOT_INTERVAL_MIN starting from open time
  const slots = [];
  for (let candidate = openMin; candidate + slotDuration <= closeMin; candidate += SLOT_INTERVAL_MIN) {
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
 * Get next N available dates (starting from today) with available slots.
 * Useful for "Quick Date" buttons.
 */
async function getNextAvailableDates(clientId, treatmentNames, clientConfig, count = 4) {
  const results = [];
  const today = new Date();
  
  for (let i = 0; i < 21 && results.length < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = formatDate(d);
    
    const avail = await getAvailableSlots(clientId, dateStr, treatmentNames, clientConfig);
    if (avail.available) {
      results.push({ date: dateStr, label: getDateLabel(d, i), slots: avail.slots, operatingHours: avail.operatingHours });
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
  const fromDate = new Date(fromDateStr + 'T00:00:00+08:00');
  const allDates = [];
  
  for (let i = 1; i <= daysToSearch && allDates.length < 3; i++) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + i);
    const dateStr = formatDate(d);
    
    const avail = await getAvailableSlots(clientId, dateStr, treatmentNames, clientConfig);
    if (avail.available && avail.slots.length > 0) {
      const offset = Math.floor((d - new Date()) / (1000 * 60 * 60 * 24));
      allDates.push({
        date: dateStr,
        label: getDateLabel(d, offset),
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

function getDateLabel(d, offset) {
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (offset === 0) return `Today (${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]})`;
  if (offset === 1) return `Tomorrow (${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]})`;
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

module.exports = {
  getAvailableSlots,
  getNextAvailableDates,
  findNextAvailableAfter,
  findNextSlotsOnDate,
  formatTime,
  formatDate
};
