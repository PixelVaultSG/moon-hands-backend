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

const { google } = require('googleapis');

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
        return {
            success: true,
            message: `Connected to "${data.summary}" (${data.timeZone})`,
            calendarName: data.summary,
            timeZone: data.timeZone,
        };
    } catch (err) {
        if (err.code === 404) {
            return { success: false, message: 'Calendar not found. Please check the Calendar ID.' };
        }
        if (err.code === 403) {
            return { success: false, message: 'Access denied. Please share your calendar with moon-hands-calendar@moon-hands.iam.gserviceaccount.com' };
        }
        return { success: false, message: `Connection error: ${err.message}` };
    }
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

        return (data.items || []).map(e => ({
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            summary: e.summary || 'Busy',
        }));
    } catch (err) {
        console.error('[Calendar] getBusyTimes error:', err.message);
        return [];
    }
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
    if (datePart) {
        const validation = validateAppointmentDate(datePart);
        if (!validation.valid) {
            console.error('[Calendar] Date validation failed:', validation.error);
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
        return data;
    } catch (err) {
        console.error('[Calendar] createBookingEvent error:', err.message);
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
        return true;
    } catch (err) {
        console.error('[Calendar] deleteBookingEvent error:', err.message);
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
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (let i = 0; i < maxDays; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayName = days[d.getDay()];

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

    const isBusy = busyTimes.some(b => {
        const s = new Date(b.start);
        const e = new Date(b.end);
        const bStart = s.getHours() * 60 + s.getMinutes();
        const bEnd = e.getHours() * 60 + e.getMinutes();
        return reqStart < bEnd && reqEnd > bStart;
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
        return data;
    } catch (err) {
        console.error('[Calendar] updateBookingEvent error:', err.message);
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
};
