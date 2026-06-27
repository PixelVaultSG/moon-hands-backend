/**
 * Moon Hands — Calendar Operation Audit Logger
 * Tracks ALL calendar CRUD operations for compliance and debugging.
 * Integrates with the existing audit-system for security alerting.
 */

// Lazy-load audit system to avoid circular dependencies
let auditSystem = null;
function getAudit() {
  if (!auditSystem) {
    try {
      auditSystem = require('./audit-system');
    } catch (e) {
      // audit-system not available — log to console only
    }
  }
  return auditSystem;
}

/**
 * Log a calendar event operation.
 * @param {Object} event — { action, calendarId, eventId?, patientPhone?, treatment?, date?, time?, error? }
 */
async function logCalendarEvent(event) {
  const timestamp = new Date().toISOString();
  const audit = getAudit();

  const payload = {
    severity: event.error ? 'high' : 'info',
    category: 'calendar_operation',
    actor: event.patientPhone ? `patient:${event.patientPhone}` : 'system',
    action: event.action, // create | update | delete | verify | query
    description: event.error
      ? `Calendar ${event.action} FAILED: ${event.error}`
      : `Calendar ${event.action}: ${event.treatment || 'verify'} on ${event.date || 'n/a'}`,
    sourceIp: null,
    service: 'google_calendar',
    details: {
      calendarId: maskCalendarId(event.calendarId),
      eventId: event.eventId || null,
      patientPhone: event.patientPhone ? maskPhone(event.patientPhone) : null,
      treatment: event.treatment || null,
      date: event.date || null,
      time: event.time || null,
      error: event.error || null,
    },
  };

  // Write to audit system (Supabase + Telegram alerts on failures)
  if (audit?.logEvent) {
    await audit.logEvent(payload);
  } else {
    // Fallback: console log
    console.log(`[CALENDAR_AUDIT] ${payload.severity.toUpperCase()}: ${payload.description}`);
  }
}

/**
 * Mask calendar ID for logging (show only last 10 chars).
 */
function maskCalendarId(calendarId) {
  if (!calendarId) return 'none';
  if (calendarId.length <= 15) return calendarId;
  return `...${calendarId.slice(-10)}`;
}

/**
 * Mask phone number for logging (show only last 4 digits).
 */
function maskPhone(phone) {
  if (!phone) return 'unknown';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `****${digits.slice(-4)}`;
}

module.exports = {
  logCalendarEvent,
  maskCalendarId,
  maskPhone,
};
