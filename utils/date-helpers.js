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

const MONTH_LOOKUP = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/**
 * v2.5.12 (P-1 hardening): prompt tables alone did NOT stop the hallucination
 * — with the correct table in context, gpt-4o-mini still insisted "Wednesday,
 * 18 November falls on a Friday" (parametric memory: 18 Nov 2022 was a Friday).
 * So the SYSTEM now verifies weekday+date combos deterministically and stamps
 * the verdict ONTO the patient message before any LLM sees it. The model has
 * no verification duty left — only a verified fact to reuse.
 * Handles: "Wednesday 18 November", "Wednesday, 18 Nov 2026",
 * "wed the 18th of november". Returns { text, found, consistent }.
 */
function annotateDateConsistency(message) {
  if (!message) return { text: message, found: false, consistent: null };
  const re = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b\s*(\d{4})?/i;
  const m = String(message).match(re);
  if (!m) return { text: message, found: false, consistent: null };
  const claimedWeekday = m[1].toLowerCase();
  const day = parseInt(m[2], 10);
  const month = MONTH_LOOKUP[m[3].toLowerCase()];
  const nowYear = parseInt(getTodaySG().slice(0, 4), 10);
  const year = m[4] ? parseInt(m[4], 10) : nowYear;
  if (!month || day < 1 || day > 31) return { text: message, found: false, consistent: null };
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const actual = getDayNameSafe(iso);
  if (!actual) return { text: message, found: false, consistent: null };
  const consistent = actual.toLowerCase() === claimedWeekday;
  const note = consistent
    ? `[SYSTEM DATE CHECK — authoritative, do NOT re-verify: "${m[0]}" is consistent. ${iso} is a ${actual}. Just answer the patient.]`
    : `[SYSTEM DATE CHECK — authoritative, do NOT re-verify: the patient wrote "${m[0]}" but ${iso} is actually a ${actual}. The DATE is what matters — answer for ${iso} (${actual}) or ask which they meant. NEVER state a different weekday than this check.]`;
  return { text: `${message}\n\n${note}`, found: true, consistent };
}

/**
 * v2.5.11 (P-1): LLM prompts must never do their own weekday math — with
 * only "Today is Friday, 13 Nov 2026" in the prompt, gpt-4o-mini confidently
 * told a patient "Wednesday is actually the 17th, not the 18th" (false; the
 * 18th IS Wednesday). Give the model the truth instead: today plus a lookup
 * table for the next two weeks, built on getDayOfWeekUTC (no timezone traps).
 * Each row carries the ISO date so function-call date args stay correct too.
 */
function getSGDateContext(daysAhead = 14) {
  const today = getTodaySG(); // YYYY-MM-DD, SG wall-clock
  const lines = [
    `Today (Singapore): ${formatDateStrDisplay(today)} (${today}).`,
    `Upcoming dates — use THIS table for ALL day-of-week reasoning; never compute or "correct" a weekday yourself:`,
  ];
  for (let i = 1; i <= daysAhead; i++) {
    const ds = addDaysToDateStr(today, i);
    lines.push(`- ${formatDateStrDisplay(ds)} (${ds})`);
  }
  return lines.join('\n');
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

// ─── SG CLOCK PARTS (v2.2.7) ─────────────────────────────────────
// The Render server runs in UTC; every clinic-facing trigger must think in
// Asia/Singapore. This is THE canonical SG clock for all jobs — v2.2.6
// proved the cost of UTC math (1h reminder fired 7h late in prod).
function sgNowParts() {
  const now = Date.now();
  const SG = 8 * 60 * 60 * 1000;
  const fmt = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  };
  const sgNow = now + SG;
  return {
    todayStr: fmt(sgNow),
    tomorrowStr: fmt(sgNow + 24 * 60 * 60 * 1000),
    oneHourDateStr: fmt(sgNow + 60 * 60 * 1000),
    twoDaysAgoStr: fmt(sgNow - 2 * 24 * 60 * 60 * 1000),
    nowMinutes: new Date(sgNow).getUTCHours() * 60 + new Date(sgNow).getUTCMinutes(),
    nowHour: new Date(sgNow).getUTCHours(),
    dayIndex: new Date(sgNow).getUTCDay(), // JS convention: Sunday=0
  };
}

module.exports = {
  sgNowParts,
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
  getSGDateContext,
  annotateDateConsistency,
  normalizeTimeStr,
  formatBookingDateTime,
};
