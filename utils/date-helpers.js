/**
 * Moon Hands — Date/Time Helpers (Singapore timezone)
 */

function formatDateSG(dateInput) {
  // Handle date strings by appending Singapore timezone to avoid UTC shift
  let d;
  if (typeof dateInput === 'string' && dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
    d = new Date(dateInput + 'T00:00:00+08:00');
  } else {
    d = new Date(dateInput);
  }
  if (isNaN(d.getTime())) return 'TBD';
  return d.toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTimeSG(dateInput) {
  // Handle time-only strings like "11:30" or "11:30:00"
  if (typeof dateInput === 'string' && !dateInput.match(/^\d{4}-\d{2}-\d{2}/)) {
    const timeMatch = dateInput.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?$/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2];
      const ampm = timeMatch[3]?.toUpperCase();
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayH = hours % 12 || 12;
      return `${displayH}:${minutes} ${period}`;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'TBD';
  return d.toLocaleTimeString('en-SG', {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Check if a YYYY-MM-DD date string is in the past (relative to Singapore timezone).
 */
function isDateInPast(dateStr) {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  return dateStr < todayStr;
}

function getDayName(dateInput) {
  let d;
  if (typeof dateInput === 'string' && dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
    d = new Date(dateInput + 'T00:00:00+08:00');
  } else {
    d = new Date(dateInput);
  }
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'long',
  });
}

/**
 * Current moment as a Date whose LOCAL getters (getDay, getDate, getMonth...)
 * reflect Singapore wall-clock time. The server runs UTC; patients speak in
 * Singapore time — all relative date parsing must anchor to this.
 */
function getNowSG() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
}

function getTodaySG() {
  return new Date().toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).split('/').reverse().join('-'); // YYYY-MM-DD
}

/**
 * Deterministic day-of-week for a YYYY-MM-DD string.
 * NEVER uses timezone-shifted Date parsing (new Date(str + 'T00:00:00+08:00')
 * breaks on UTC servers like Render — getDay() returns the PREVIOUS day).
 */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getDayOfWeekUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sunday
}

function getDayNameSafe(dateStr) {
  return DAY_NAMES[getDayOfWeekUTC(dateStr)] || '';
}

function getDayNameShortSafe(dateStr) {
  return DAY_NAMES_SHORT[getDayOfWeekUTC(dateStr)] || '';
}

/** Add n days to a YYYY-MM-DD string, returning YYYY-MM-DD. TZ-deterministic. */
function addDaysToDateStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Format a date string as "Sat, 31 Oct 2026". TZ-deterministic. */
function formatDateStrDisplay(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '';
  const [, m, d] = dateStr.split('-').map(Number);
  return `${getDayNameShortSafe(dateStr)}, ${d} ${MONTH_NAMES_SHORT[m - 1]} ${dateStr.slice(0, 4)}`;
}

/** Normalize "21:00:00" -> "21:00". */
function normalizeTimeStr(timeStr) {
  if (!timeStr) return '';
  const m = String(timeStr).match(/^(\d{1,2}:\d{2})/);
  return m ? m[1] : String(timeStr);
}

/**
 * Format booking date+time for humans: "Sat, 31 Oct 2026 at 21:00hrs".
 * Falls back gracefully when one side is missing.
 */
function formatBookingDateTime(dateStr, timeStr) {
  const datePart = formatDateStrDisplay(dateStr);
  const timePart = normalizeTimeStr(timeStr);
  if (datePart && timePart) return `${datePart} at ${timePart}hrs`;
  if (timePart) return `${timePart}hrs`;
  return datePart || '';
}

function isClinicOpenNow(operatingHours) {
  // Use Singapore time regardless of server timezone (Render runs UTC)
  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { timeZone: 'Asia/Singapore', weekday: 'long' });
  const timeStr = now.toLocaleString('en-US', {
    timeZone: 'Asia/Singapore', hour12: false, hour: '2-digit', minute: '2-digit',
  });
  const [curH, curM] = timeStr.split(':').map(Number);
  const currentMinutes = curH * 60 + curM;

  const hours = operatingHours?.find(h => h.day === dayName);
  if (!hours || !hours.isOpen) return false;

  const [openH, openM] = hours.open_time.split(':').map(Number);
  const [closeH, closeM] = hours.close_time.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

module.exports = {
  formatDateSG,
  formatTimeSG,
  getDayName,
  getTodaySG,
  getNowSG,
  isClinicOpenNow,
  isDateInPast,
  getDayOfWeekUTC,
  getDayNameSafe,
  getDayNameShortSafe,
  addDaysToDateStr,
  formatDateStrDisplay,
  normalizeTimeStr,
  formatBookingDateTime,
};
