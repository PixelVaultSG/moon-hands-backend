/**
 * Moon Hands — Admin calendar backfill (v2.4.5)
 *
 * Creates the missing Google Calendar event for a CONFIRMED booking that
 * has none (google_event_id IS NULL). Built for bookings confirmed via
 * paths that never synced — e.g. the pre-v2.4.5 alternative-time
 * acceptance (UVT 2026-11-12, booking 994c5d90 confirmed at the wrong
 * time with no calendar event).
 *
 * Auth: header x-admin-key must equal SUPABASE_SERVICE_ROLE_KEY (already
 * in env — no new config to add). Fail-closed: 503 when the env var is
 * unset, 401 on mismatch, 404 unknown booking, 409 not confirmed,
 * 422 clinic has no calendar connected.
 */

const { supabase } = require('../supabase/client');

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 16 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function handleCalendarBackfill(req, res) {
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expected) return send(res, 503, { success: false, error: 'Backfill disabled (no admin key configured)' });
  if (req.headers['x-admin-key'] !== expected) return send(res, 401, { success: false, error: 'Unauthorized' });

  let bookingId;
  try {
    const body = await readJsonBody(req);
    bookingId = body.booking_id;
  } catch (e) {
    return send(res, 400, { success: false, error: e.message });
  }
  if (!bookingId || typeof bookingId !== 'string') {
    return send(res, 400, { success: false, error: 'booking_id required' });
  }

  const { data: booking, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', bookingId)
    .single();
  if (error || !booking) return send(res, 404, { success: false, error: 'Booking not found' });
  if (booking.status !== 'confirmed') {
    return send(res, 409, { success: false, error: `Booking status is "${booking.status}" — only confirmed bookings get calendar events` });
  }
  if (booking.google_event_id) {
    return send(res, 200, { success: true, already_synced: true, event_id: booking.google_event_id });
  }

  const { data: clientRow } = await supabase
    .from('clients')
    .select('id, name, google_calendar_id')
    .eq('id', booking.client_id)
    .single();
  const calendarId = clientRow?.google_calendar_id;
  if (!calendarId) {
    return send(res, 422, { success: false, error: 'Clinic has no google_calendar_id connected' });
  }

  const { createBookingEvent } = require('./calendar-service');
  const timePart = String(booking.appointment_time).slice(0, 5);
  const startISO = `${booking.appointment_date}T${timePart}:00+08:00`;
  const [sh, sm] = timePart.split(':').map(Number);
  const endTotal = sh * 60 + sm + (parseInt(booking.duration) || 60);
  const endISO = `${booking.appointment_date}T${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}:00+08:00`;

  const ev = await createBookingEvent(calendarId, {
    summary: `${booking.service} - ${booking.customer_name}`,
    description: `Patient: ${booking.customer_name}\nPhone: ${booking.customer_phone}\nTreatment: ${booking.service}\nStatus: Confirmed\nSource: Moon Hands AI (calendar backfill)`,
    startISO,
    endISO,
    patientPhone: booking.customer_phone,
    patientName: booking.customer_name,
    clinicName: clientRow.name || 'Clinic'
  });
  if (!ev || !ev.id) {
    return send(res, 502, { success: false, error: 'Google Calendar event creation failed' });
  }

  await supabase.from('appointments').update({ google_event_id: ev.id }).eq('id', bookingId);
  console.log(`[CALENDAR_BACKFILL] ${bookingId} → event ${ev.id}`);
  return send(res, 200, { success: true, event_id: ev.id, booking_id: bookingId });
}

module.exports = { handleCalendarBackfill };
