// Moon Hands — Google Calendar Integration Service
// Uses Service Account authentication to read/write clinic calendars
//
// SETUP (one-time):
// 1. Create Google Cloud project: https://console.cloud.google.com
// 2. Enable Google Calendar API
// 3. Create Service Account (IAM & Admin → Service Accounts)
// 4. Generate JSON key, download it
// 5. Store key content as GOOGLE_CALENDAR_KEY env var on Render
// 6. Share clinic calendar with: calendar@<project>.iam.gserviceaccount.com

/**
 * SECURITY NOTE: The service account uses the 'calendar' scope which grants
 * read+write access. This is REQUIRED for creating booking events.
 * 
 * Risk Mitigation:
 * - Each clinic must EXPLICITLY share their calendar with our service account
 * - Clinic can revoke access at any time via Google Calendar settings
 * - Service account is isolated to Moon Hands only (not shared with other apps)
 * - All calendar operations are audited (see monitoring/calendar-audit.js)
 * - Date validation prevents past-date bookings
 */
const { google } = require('googleapis');
const { logCalendarEvent } = require('../monitoring/calendar-audit');

let auth = null;
let calendar = null;

function getAuth() {
    if (auth) return auth;

    const keyJson = process.env.GOOGLE_CALENDAR_KEY;
    if (!keyJson) {
        console.warn('[Calendar] GOOGLE_CALENDAR_KEY not set — calendar integration disabled');
        return null;
    }

    try {
        const credentials = JSON.parse(keyJson);
        auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        calendar = google.calendar({ version: 'v3', auth });
        console.log('[Calendar] Service account authenticated:', credentials.client_email);
        return auth;
    } catch (err) {
        console.error('[Calendar] Failed to parse GOOGLE_CALENDAR_KEY:', err.message);
        return null;
    }
}

/**
 * Check if a clinic has calendar integration enabled
 * @param {string} calendarId — Google Calendar ID from client_configs
 * @returns {boolean}
 */
function isCalendarEnabled(calendarId) {
    return !!(getAuth() && calendarId && calendarId.trim());
}

/**
 * Validate appointment date — must be today or in the future
 * @param {string} date — ISO date string (YYYY-MM-DD) or Date object
 * @param {number} maxAdvanceDays — maximum days in advance (default 90)
 * @returns {{valid:boolean, error?:string}}
 */
function validateAppointmentDate(date, maxAdvanceDays = 90) {
    const inputDate = typeof date === 'string' ? new Date(date + 'T00:00:00+08:00') : date;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + maxAdvanceDays);

    // Check if date is in the past
    if (inputDate < today) {
        return { valid: false, error: 'Appointment date cannot be in the past. Please select today or a future date.' };
    }

    // Check if date is too far in the future
    if (inputDate > maxDate) {
        return { valid: false, error: `Appointments can only be booked up to ${maxAdvanceDays} days in advance. Please select a closer date.` };
    }

    return { valid: true };
}

/**
 * Test the calendar connection for a clinic
 * @param {string} calendarId — Google Calendar ID to test
 * @returns {Promise<{success:boolean, message:string}>}
 */
async function testConnection(calendarId) {
    if (!getAuth()) {
        return { success: false, message: 'GOOGLE_CALENDAR_KEY not configured on server' };
    }
    if (!calendarId || !calendarId.trim()) {
        return { success: false, message: 'No calendar ID provided' };
    }

    try {
        const { data } = await calendar.calendars.get({ calendarId });
        await logCalendarEvent({ action: 'verify', calendarId, treatment: data.summary });
        return {
            success: true,
            message: `Connected to "${data.summary}" (${data.timeZone})`,
            calendarName: data.summary,
            timeZone: data.timeZone,
        };
    } catch (err) {
        const errMsg = err.code === 404
            ? 'Calendar not found. Please check the Calendar ID.'
            : err.code === 403
                ? 'Access denied. Please share your calendar with moon-hands-calendar@moon-hands.iam.gserviceaccount.com'
                : `Connection error: ${err.message}`;
        await logCalendarEvent({ action: 'verify', calendarId, error: errMsg });
        return { success: false, message: errMsg };
    }
}

/**
 * v2.3.9: is this calendar event one that should BLOCK bookings?
 * - Cancelled events never block.
 * - transparency:'transparent' ("Show me as: Free") never blocks — Google
 *   marks birthdays/reminders and many personal entries transparent, and
 *   real clinics WILL have them on shared calendars. Only "Busy" blocks.
 * Pure + exported so the harness can pin the policy.
 */
function isBlockableEvent(e) {
    if (!e || e.status === 'cancelled') return false;
    if (e.transparency === 'transparent') return false;
    return !!(e.start && (e.start.dateTime || e.start.date));
}

/**
 * Convert a busy entry ({start, end} strings, as returned by getBusyTimes)
 * to SG-minute period. All-day (date-only) entries block the WHOLE day —
 * v2.3.9 fixes isSlotAvailable previously computing getHours() on midnight
 * (=0) so all-day events never blocked, and doing the math in SERVER time
 * (UTC on Render) instead of SG.
 */
function busyWindowMinutes(entry) {
    const start = entry?.start, end = entry?.end;
    if (!start || !end) return { start: 0, end: 1440 };
    if (String(start).length <= 10) return { start: 0, end: 1440 }; // all-day
    const toSgMin = (iso) => {
        const parts = new Date(iso).toLocaleString('en-US', {
            timeZone: 'Asia/Singapore', hour12: false, hour: '2-digit', minute: '2-digit'
        });
        const [h, m] = parts.split(':').map(Number);
        return (h === 24 ? 0 : h) * 60 + m;
    };
    return { start: toSgMin(start), end: toSgMin(end) };
}

/**
 * Get busy times for a specific date from a clinic's calendar
 * @param {string} calendarId — Google Calendar ID
 * @param {string} date — ISO date string (YYYY-MM-DD)
 * @returns {Promise<Array<{start:string, end:string}>>}
 */
async function getBusyTimes(calendarId, date) {
    if (!isCalendarEnabled(calendarId)) return [];

    try {
        const tz = 'Asia/Singapore';
        const timeMin = `${date}T00:00:00+08:00`;
        const timeMax = `${date}T23:59:59+08:00`;

        const { data } = await calendar.events.list({
            calendarId,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 100,
        });

        // v2.3.9: only blockable events (Busy, not cancelled) make the list
        return (data.items || []).filter(isBlockableEvent).map(e => ({
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            summary: e.summary || 'Busy',
        }));
    } catch (err) {
        console.error('[Calendar] getBusyTimes error:', err.message);
        // v2.4.0: fail-open must never be SILENT — a dead calendar read means
        // the booking gate is running blind for this clinic.
        try {
            const { notifyAdmin } = require('../monitoring/audit-system');
            await notifyAdmin(`⚠️ Booking gate degraded — clinic calendar read FAILED (calendar ${String(calendarId).slice(0, 6)}…) for ${date}: ${err.message}\nCalendar blocks are OFF until this recovers. Check the calendar is shared with the service account ("Make changes to events").`);
        } catch (_) { /* alerting must never break booking */ }
        return [];
    }
}

// ─── SG PUBLIC HOLIDAYS (v2.3.9) ─────────────────────────────────
// Clinics see gazetted holidays in their Google Calendar app via the
// subscribed "Holidays in Singapore" calendar — but the service account
// only has access to the clinic's PRIMARY calendar, so those holidays are
// INVISIBLE to us unless we read the public holiday calendar ourselves.
// Without this, a patient can book straight onto Deepavali. Fail-open:
// a holiday-fetch error must not break availability entirely.
const SG_HOLIDAY_CALENDAR_ID = 'en.singapore#holiday@group.v.calendar.google.com';
const holidayCache = new Map(); // date -> busy[] (SUCCESSFUL fetches only, per process)

/**
 * v2.4.0: holiday entries are CLOSURE signals, not personal events. Google's
 * holiday calendars mark every entry transparency:'transparent' ("Show as:
 * Free") — applying the clinic-calendar isBlockableEvent policy here silently
 * filtered out EVERY holiday (v2.3.9 prod bug: Mon 9 Nov 2026, Deepavali
 * in-lieu, stayed bookable). Only cancelled entries are skipped.
 */
function isHolidayEntry(e) {
    if (!e || e.status === 'cancelled') return false;
    return !!(e.start && (e.start.dateTime || e.start.date));
}

async function getPublicHolidayBusyTimes(date, { bypassCache = false } = {}) {
    if (!bypassCache && holidayCache.has(date)) return holidayCache.get(date);
    let busy = [];
    let fetchOk = false;
    if (getAuth()) {
        try {
            const { data } = await calendar.events.list({
                calendarId: SG_HOLIDAY_CALENDAR_ID,
                timeMin: `${date}T00:00:00+08:00`,
                timeMax: `${date}T23:59:59+08:00`,
                singleEvents: true,
                maxResults: 10,
            });
            busy = (data.items || []).filter(isHolidayEntry).map(e => ({
                start: e.start?.dateTime || e.start?.date,
                end: e.end?.dateTime || e.end?.date,
                summary: e.summary || 'Public Holiday',
            }));
            fetchOk = true;
            console.log(`[Calendar] SG holiday fetch OK: ${busy.length} event(s) for ${date}`);
        } catch (err) {
            console.error('[Calendar] SG holiday fetch failed (fail-open):', err.message);
            try {
                const { notifyAdmin } = require('../monitoring/audit-system');
                await notifyAdmin(`⚠️ Booking gate degraded — SG holiday fetch FAILED for ${date}: ${err.message}\nPublic-holiday blocking is OFF until this recovers.`);
            } catch (_) { /* alerting must never break booking */ }
        }
    } else {
        console.error('[Calendar] SG holiday check skipped — no calendar auth (fail-open)');
        try {
            const { notifyAdmin } = require('../monitoring/audit-system');
            await notifyAdmin(`⚠️ Booking gate degraded — calendar auth unavailable; public-holiday blocking is OFF. Check GOOGLE_CALENDAR_KEY.`);
        } catch (_) { /* alerting must never break booking */ }
    }
    // v2.4.0: cache SUCCESSFUL fetches only. v2.3.9 cached failures too — one
    // transient error disabled holiday blocking for the process lifetime.
    if (fetchOk) {
        holidayCache.set(date, busy);
        if (holidayCache.size > 400) holidayCache.delete(holidayCache.keys().next().value);
    }
    return busy;
}

/**
 * Calculate available time slots for a given date
 * @param {string} calendarId — Google Calendar ID
 * @param {string} date — ISO date string (YYYY-MM-DD)
 * @param {Object} hours — { open: '10:00', close: '20:00', isOpen: true }
 * @param {number} slotDuration — minutes per slot (default 30)
 * @param {number} bufferMinutes — minutes between appointments (default 15)
 * @returns {Promise<Array<{start:string, end:string}>>}
 */
async function getAvailableSlots(calendarId, date, hours, slotDuration = 30, bufferMinutes = 15) {
    if (!hours.isOpen) return [];

    const busyTimes = await getBusyTimes(calendarId, date);

    const [openH, openM] = hours.open.split(':').map(Number);
    const [closeH, closeM] = hours.close.split(':').map(Number);
    const dayStart = openH * 60 + openM;
    const dayEnd = closeH * 60 + closeM;

    const busyMinutes = busyTimes.map(b => {
        const s = new Date(b.start);
        const e = new Date(b.end);
        return { start: s.getHours() * 60 + s.getMinutes(), end: e.getHours() * 60 + e.getMinutes() };
    });

    const slots = [];
    let cursor = dayStart;
    while (cursor + slotDuration <= dayEnd) {
        const slotStart = cursor;
        const slotEnd = cursor + slotDuration;
        const isBusy = busyMinutes.some(b =>
            (slotStart < b.end + bufferMinutes) && (slotEnd + bufferMinutes > b.start)
        );
        if (!isBusy) {
            slots.push({
                start: `${Math.floor(slotStart / 60).toString().padStart(2, '0')}:${(slotStart % 60).toString().padStart(2, '0')}`,
                end: `${Math.floor(slotEnd / 60).toString().padStart(2, '0')}:${(slotEnd % 60).toString().padStart(2, '0')}`,
            });
        }
        cursor += slotDuration;
    }

    return slots;
}

/**
 * Create a booking event on the clinic's calendar
 * @param {string} calendarId — Google Calendar ID
 * @param {Object} booking — { summary, startISO, endISO, description, patientPhone }
 * @returns {Promise<Object|null>} — created event or null
 */
async function createBookingEvent(calendarId, booking) {
    if (!isCalendarEnabled(calendarId)) return null;

    // Validate date is not in the past
    const datePart = booking.startISO ? booking.startISO.split('T')[0] : null;
    const timePart = booking.startISO ? booking.startISO.split('T')[1]?.slice(0, 5) : null;
    if (datePart) {
        const validation = validateAppointmentDate(datePart);
        if (!validation.valid) {
            console.error('[Calendar] Date validation failed:', validation.error);
            await logCalendarEvent({ action: 'create', calendarId, treatment: booking.summary, date: datePart, error: validation.error });
            return { error: validation.error };
        }
    }

    try {
        const { data } = await calendar.events.insert({
            calendarId,
            requestBody: {
                summary: `📋 ${booking.summary}`,
                description: booking.description || `Patient: ${booking.patientPhone || 'N/A'}\nBooked via Moon Hands AI`,
                start: {
                    dateTime: booking.startISO,
                    timeZone: 'Asia/Singapore',
                },
                end: {
                    dateTime: booking.endISO,
                    timeZone: 'Asia/Singapore',
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', minutes: 60 },
                    ],
                },
                colorId: '2', // Green in Google Calendar
            },
        });

        console.log('[Calendar] Event created:', data.htmlLink);
        await logCalendarEvent({ action: 'create', calendarId, eventId: data.id, patientPhone: booking.patientPhone, treatment: booking.summary, date: datePart, time: timePart });
        return data;
    } catch (err) {
        console.error('[Calendar] createBookingEvent error:', err.message);
        await logCalendarEvent({ action: 'create', calendarId, patientPhone: booking.patientPhone, treatment: booking.summary, date: datePart, error: err.message });
        return null;
    }
}

/**
 * Delete a booking event from the clinic's calendar
 * @param {string} calendarId — Google Calendar ID
 * @param {string} eventId — Google Calendar event ID
 * @returns {Promise<boolean>}
 */
async function deleteBookingEvent(calendarId, eventId) {
    if (!isCalendarEnabled(calendarId)) return false;

    try {
        await calendar.events.delete({ calendarId, eventId });
        console.log('[Calendar] Event deleted:', eventId);
        await logCalendarEvent({ action: 'delete', calendarId, eventId });
        return true;
    } catch (err) {
        console.error('[Calendar] deleteBookingEvent error:', err.message);
        await logCalendarEvent({ action: 'delete', calendarId, eventId, error: err.message });
        return false;
    }
}

/**
 * Get the next 5 available dates with open slots
 * @param {string} calendarId — Google Calendar ID
 * @param {Array} operatingHours — array of day configs from client_configs
 * @param {number} maxDays — how many days ahead to check (default 14)
 * @returns {Promise<Array<{date:string, slots:Array}>>}
 */
async function getUpcomingAvailability(calendarId, operatingHours, maxDays = 14) {
    if (!isCalendarEnabled(calendarId)) return [];

    const results = [];

    // v2.5.25 (A-3): walk SG calendar days — the old new-Date + toISOString
    // loop started the window on UTC "today" (SG yesterday before 8am).
    const { sgNowParts, addDaysToDateStr, getDayNameSafe } = require('../utils/date-helpers');
    const sgToday = sgNowParts().todayStr;

    for (let i = 0; i < maxDays; i++) {
        const dateStr = addDaysToDateStr(sgToday, i);
        const dayName = getDayNameSafe(dateStr);

        const dayConfig = operatingHours.find(h => h.day === dayName);
        if (!dayConfig || !dayConfig.isOpen) continue;

        const hours = {
            open: dayConfig.open_time,
            close: dayConfig.close_time,
            isOpen: dayConfig.isOpen,
        };

        const slots = await getAvailableSlots(calendarId, dateStr, hours);
        if (slots.length > 0) {
            results.push({ date: dateStr, day: dayName, slots: slots.slice(0, 6) });
            if (results.length >= 5) break;
        }
    }

    return results;
}

/**
 * Check if a specific time slot is available
 * @param {string} calendarId — Google Calendar ID
 * @param {string} date — YYYY-MM-DD
 * @param {string} time — HH:MM
 * @param {number} durationMinutes — how long the appointment is
 * @returns {Promise<boolean>}
 */
async function isSlotAvailable(calendarId, date, time, durationMinutes = 60) {
    const busyTimes = await getBusyTimes(calendarId, date);

    const [reqH, reqM] = time.split(':').map(Number);
    const reqStart = reqH * 60 + reqM;
    const reqEnd = reqStart + durationMinutes;

    // v2.3.9: SG-minute conversion incl. whole-day all-day events (was:
    // server-local getHours() — UTC on Render — so timed events compared
    // 8h off and all-day events computed bEnd=0 and NEVER blocked).
    const isBusy = busyTimes.some(b => {
        const period = busyWindowMinutes(b);
        return reqStart < period.end && reqEnd > period.start;
    });

    return !isBusy;
}

/**
 * Update (reschedule) an existing booking event
 * @param {string} calendarId — Google Calendar ID
 * @param {string} eventId — Google Calendar event ID
 * @param {Object} updates — { summary?, startISO?, endISO?, description? }
 * @returns {Promise<Object|null>} — updated event or null
 */
async function updateBookingEvent(calendarId, eventId, updates) {
    if (!isCalendarEnabled(calendarId)) return null;

    try {
        const patch = {};
        if (updates.summary) patch.summary = `📋 ${updates.summary}`;
        if (updates.description) patch.description = updates.description;
        if (updates.startISO) {
            patch.start = { dateTime: updates.startISO, timeZone: 'Asia/Singapore' };
        }
        if (updates.endISO) {
            patch.end = { dateTime: updates.endISO, timeZone: 'Asia/Singapore' };
        }

        const { data } = await calendar.events.patch({
            calendarId,
            eventId,
            requestBody: patch,
        });

        console.log('[Calendar] Event updated:', eventId);
        await logCalendarEvent({ action: 'update', calendarId, eventId, treatment: updates.summary });
        return data;
    } catch (err) {
        console.error('[Calendar] updateBookingEvent error:', err.message);
        await logCalendarEvent({ action: 'update', calendarId, eventId, error: err.message });
        return null;
    }
}

/**
 * Find an event by patient phone number (for rescheduling/cancellation)
 * @param {string} calendarId — Google Calendar ID
 * @param {string} patientPhone — phone number to search for
 * @param {string} date — YYYY-MM-DD optional filter
 * @returns {Promise<Array>} — matching events
 */
async function findEventsByPatient(calendarId, patientPhone, date) {
    if (!isCalendarEnabled(calendarId)) return [];

    try {
        const timeMin = date ? `${date}T00:00:00+08:00` : new Date().toISOString();
        const timeMax = date
            ? `${date}T23:59:59+08:00`
            : new Date(Date.now() + 30 * 86400000).toISOString();

        const { data } = await calendar.events.list({
            calendarId,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
            q: patientPhone,
            maxResults: 20,
        });

        return (data.items || []).map(e => ({
            id: e.id,
            summary: e.summary,
            start: e.start?.dateTime,
            end: e.end?.dateTime,
            description: e.description,
            status: e.status,
        }));
    } catch (err) {
        console.error('[Calendar] findEventsByPatient error:', err.message);
        return [];
    }
}

/**
 * v2.4.0: LIVE calendar self-check — the post-deploy canary and /calcheck
 * share this. Never throws; every probe returns its own ok/error so one dead
 * calendar can't hide another's result. Probes the holiday calendar DIRECTLY
 * (not getPublicHolidayBusyTimes) — that wrapper fails open, so a dead fetch
 * would report "OK, 0 events" instead of the real error.
 * @param {Array<{id:string, name:string, google_calendar_id?:string}>} clinics
 * @returns {Promise<{clinics: Array<{name:string, ok:boolean, detail:string}>, holiday: {ok:boolean, detail:string}}>}
 */
async function calendarSelfCheck(clinics) {
    const { getTodaySG } = require('../utils/date-helpers');
    const today = getTodaySG();
    const result = { clinics: [], holiday: { ok: false, detail: 'not run' } };

    if (!getAuth()) {
        const msg = 'no calendar auth — GOOGLE_CALENDAR_KEY missing or unparsable';
        for (const c of (clinics || [])) result.clinics.push({ name: c.name || c.id, ok: false, detail: msg });
        result.holiday = { ok: false, detail: msg };
        return result;
    }

    for (const clinic of (clinics || [])) {
        const calId = clinic.google_calendar_id;
        const label = clinic.name || clinic.id;
        if (!calId) {
            result.clinics.push({ name: label, ok: false, detail: 'no google_calendar_id configured' });
            continue;
        }
        try {
            // Direct events.list (not getBusyTimes) so the probe's error is
            // REAL — getBusyTimes fails open and would mask a 403/404.
            const { data } = await calendar.events.list({
                calendarId: calId,
                timeMin: `${today}T00:00:00+08:00`,
                timeMax: `${today}T23:59:59+08:00`,
                singleEvents: true,
                maxResults: 10,
            });
            result.clinics.push({ name: label, ok: true, detail: `read OK — ${(data.items || []).length} event(s) today` });
        } catch (err) {
            result.clinics.push({ name: label, ok: false, detail: `read FAILED: ${err.message} — share the calendar with the service account ("Make changes to events")` });
        }
    }

    try {
        // Direct events.list for the same reason as the clinic probes: the
        // fail-open wrapper would turn a 403/404 into a false "OK, 0 events".
        const { data } = await calendar.events.list({
            calendarId: SG_HOLIDAY_CALENDAR_ID,
            timeMin: `${today}T00:00:00+08:00`,
            timeMax: `${today}T23:59:59+08:00`,
            singleEvents: true,
            maxResults: 10,
        });
        const hol = (data.items || []).filter(isHolidayEntry);
        result.holiday = { ok: true, detail: `read OK — ${hol.length} holiday event(s) today${hol.length ? ` (${hol.map(h => h.summary || 'Public Holiday').join(', ')})` : ''}` };
    } catch (err) {
        result.holiday = { ok: false, detail: `read FAILED: ${err.message}` };
    }
    return result;
}

module.exports = {
    getAuth,
    isCalendarEnabled,
    validateAppointmentDate,
    testConnection,
    getBusyTimes,
    getAvailableSlots,
    createBookingEvent,
    deleteBookingEvent,
    updateBookingEvent,
    findEventsByPatient,
    getUpcomingAvailability,
    isSlotAvailable,
    // v2.3.9
    isBlockableEvent,
    busyWindowMinutes,
    getPublicHolidayBusyTimes,
    SG_HOLIDAY_CALENDAR_ID,
    // v2.4.0
    isHolidayEntry,
    calendarSelfCheck,
};
