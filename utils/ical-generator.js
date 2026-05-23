/**
 * Moon Hands — iCal Feed Generator
 * 
 * Generates a live .ics feed of all bookings for a clinic.
 * Works with EVERY calendar app (Apple Calendar, Outlook, Google Calendar, etc.)
 * Zero auth required — URL contains a UUID token.
 * 
 * Usage: Clinic subscribes to https://your-backend.com/ical/{token}.ics
 */

const { supabase } = require('../supabase/client');

/**
 * Generate an iCalendar (.ics) file for a clinic's bookings
 * @param {string} icalToken — the clinic's unique iCal token
 * @returns {Promise<{ical: string, clinicName: string}>}
 */
async function generateICalFeed(icalToken) {
  // Look up clinic by iCal token
  const { data: client, error } = await supabase
    .from('clients')
    .select('id, name, ical_token')
    .eq('ical_token', icalToken)
    .single();

  if (error || !client) {
    throw new Error('Invalid iCal token');
  }

  // Get all confirmed + pending bookings for next 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 7); // include past week
  const ninetyDaysFuture = new Date();
  ninetyDaysFuture.setDate(ninetyDaysFuture.getDate() + 90);

  const { data: bookings } = await supabase
    .from('appointments')
    .select('*')
    .eq('client_id', client.id)
    .in('status', ['confirmed', 'pending'])
    .gte('appointment_date', ninetyDaysAgo.toISOString().split('T')[0])
    .lte('appointment_date', ninetyDaysFuture.toISOString().split('T')[0])
    .order('appointment_date', { ascending: true });

  // Build iCalendar format
  const now = formatICalDate(new Date());
  const uid = `${client.id}@moonhands.sg`;

  let events = '';
  if (bookings) {
    for (const b of bookings) {
      const startDate = b.appointment_date.replace(/-/g, '');
      const startTime = (b.appointment_time || '09:00').replace(/:/g, '');
      const duration = b.duration_minutes || 60;
      
      // Calculate end time
      const [h, m] = (b.appointment_time || '09:00').split(':').map(Number);
      const endDate = new Date(`${b.appointment_date}T${b.appointment_time}:00+08:00`);
      endDate.setMinutes(endDate.getMinutes() + duration);
      const endDateStr = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const startDateStr = `${startDate}T${startTime}00`;

      const status = b.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE';
      const summary = `${b.service || 'Appointment'} - ${b.customer_name || 'Patient'}`;
      const description = `Booking via Moon Hands\nPatient: ${b.customer_name || 'N/A'}\nPhone: ${b.customer_phone || 'N/A'}\nStatus: ${b.status}${b.notes ? `\nNotes: ${b.notes}` : ''}`;

      events += `BEGIN:VEVENT\r\n`;
      events += `UID:${b.id}@moonhands.sg\r\n`;
      events += `DTSTAMP:${now}\r\n`;
      events += `DTSTART;TZID=Asia/Singapore:${startDateStr}\r\n`;
      events += `DTEND;TZID=Asia/Singapore:${endDateStr.replace('Z', '')}\r\n`;
      events += `SUMMARY:${escapeICalText(summary)}\r\n`;
      events += `DESCRIPTION:${escapeICalText(description)}\r\n`;
      events += `STATUS:${status}\r\n`;
      events += `SEQUENCE:${b.ical_sequence || 0}\r\n`;
      events += `END:VEVENT\r\n`;
    }
  }

  const ical = `BEGIN:VCALENDAR\r\n` +
    `VERSION:2.0\r\n` +
    `PRODID:-//Moon Hands//Moon Hands Booking//EN\r\n` +
    `CALSCALE:GREGORIAN\r\n` +
    `METHOD:PUBLISH\r\n` +
    `X-WR-CALNAME:${escapeICalText(client.name)} Bookings\r\n` +
    `X-WR-TIMEZONE:Asia/Singapore\r\n` +
    `BEGIN:VTIMEZONE\r\n` +
    `TZID:Asia/Singapore\r\n` +
    `BEGIN:STANDARD\r\n` +
    `DTSTART:19700101T000000\r\n` +
    `TZOFFSETFROM:+0800\r\n` +
    `TZOFFSETTO:+0800\r\n` +
    `END:STANDARD\r\n` +
    `END:VTIMEZONE\r\n` +
    events +
    `END:VCALENDAR\r\n`;

  return { ical, clinicName: client.name };
}

/**
 * Format a date for iCalendar (UTC, YYYYMMDDTHHMMSSZ)
 */
function formatICalDate(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Escape special characters for iCalendar text fields
 */
function escapeICalText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

module.exports = { generateICalFeed };
