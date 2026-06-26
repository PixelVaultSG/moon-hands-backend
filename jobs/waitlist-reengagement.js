/**
 * Moon Hands — Waitlist Re-engagement Engine
 * 
 * Runs every 15 minutes. Monitors for:
 * 1. Cancelled appointments → freed slots
 * 2. Matches freed slots to active waitlist entries
 * 3. Sends proactive WhatsApp to waiting patients
 * 4. Patient replies "Yes" → AI auto-books
 * 
 * Also: When checking availability, suggests 2 alternative slots
 * before offering waitlist.
 */

require('dotenv').config();
const { supabase } = require('../supabase/client');

const CONFIG = {
  CHECK_INTERVAL_MS: 15 * 60 * 1000, // 15 minutes
  ENABLED: process.env.WAITLIST_REENGAGEMENT_ENABLED !== 'false',
  // How far back to look for newly-cancelled appointments
  CANCELATION_LOOKBACK_MINUTES: 20,
  // Max waitlist entries to process per run
  MAX_ENTRIES_PER_RUN: 10,
  // Cooldown: don't re-notify same patient for same slot within X hours
  NOTIFICATION_COOLDOWN_HOURS: 4,
};

// ─── MAIN ENTRY POINT ────────────────────────────────────────────

async function runWaitlistCheck() {
  if (!CONFIG.ENABLED) {
    console.log('[WAITLIST] Re-engagement disabled');
    return;
  }

  const startTime = Date.now();
  console.log('[WAITLIST] ═══════════════════════════════════════════');
  console.log('[WAITLIST] Checking for freed slots...');

  try {
    // Step 1: Find recently cancelled appointments
    const freedSlots = await findRecentlyCancelledAppointments();
    if (freedSlots.length === 0) {
      console.log('[WAITLIST] No recently cancelled appointments');
      return;
    }
    console.log(`[WAITLIST] Found ${freedSlots.length} freed slot(s)`);

    // Step 2: For each freed slot, find matching waitlist entries
    let notificationsSent = 0;
    for (const slot of freedSlots) {
      const matches = await findMatchingWaitlistEntries(slot);
      for (const entry of matches.slice(0, 3)) { // Max 3 per slot
        const sent = await sendWaitlistNotification(slot, entry);
        if (sent) notificationsSent++;
      }
    }

    console.log(`[WAITLIST] Sent ${notificationsSent} notification(s) (${Date.now() - startTime}ms)`);
    console.log('[WAITLIST] ═══════════════════════════════════════════');

  } catch (err) {
    console.error('[WAITLIST] Error:', err.message);
  }
}

// ─── FIND FREED SLOTS ────────────────────────────────────────────

async function findRecentlyCancelledAppointments() {
  const lookback = new Date(Date.now() - CONFIG.CANCELATION_LOOKBACK_MINUTES * 60000);

  // Find appointments cancelled in the last 20 minutes
  // that are for FUTURE dates (don't bother with past appointments)
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('appointments')
    .select('id, client_id, customer_phone, customer_name, service, appointment_date, appointment_time, updated_at')
    .eq('status', 'cancelled')
    .gte('updated_at', lookback.toISOString())
    .gte('appointment_date', today)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[WAITLIST] Error finding cancelled appts:', error.message);
    return [];
  }

  // Deduplicate: same client + date + time = one freed slot
  const seen = new Set();
  return (data || []).filter(a => {
    const key = `${a.client_id}:${a.appointment_date}:${a.appointment_time}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── FIND MATCHING WAITLIST ENTRIES ──────────────────────────────

async function findMatchingWaitlistEntries(freedSlot) {
  // Look for waitlist entries on the same date, same clinic, same or similar service
  const { data, error } = await supabase
    .from('waitlist')
    .select('*')
    .eq('client_id', freedSlot.client_id)
    .eq('status', 'active')
    .or(`preferred_date.eq.${freedSlot.appointment_date},preferred_date.is.null`)
    .order('created_at', { ascending: true }) // FIFO — oldest first
    .limit(CONFIG.MAX_ENTRIES_PER_RUN);

  if (error) {
    console.error('[WAITLIST] Error finding waitlist entries:', error.message);
    return [];
  }

  // Filter: check cooldown (don't re-notify recently notified)
  const now = Date.now();
  return (data || []).filter(entry => {
    // Skip if no phone number
    if (!entry.customer_phone) return false;

    // Check cooldown
    if (entry.last_notified_at) {
      const hoursSince = (now - new Date(entry.last_notified_at).getTime()) / 3600000;
      if (hoursSince < CONFIG.NOTIFICATION_COOLDOWN_HOURS) return false;
    }

    return true;
  });
}

// ─── SEND NOTIFICATION ───────────────────────────────────────────

async function sendWaitlistNotification(freedSlot, waitlistEntry) {
  try {
    // Get clinic details
    const { data: clinic } = await supabase
      .from('clients')
      .select('name, slug')
      .eq('id', freedSlot.client_id)
      .single();

    const clinicName = clinic?.name || 'our clinic';
    const patientName = waitlistEntry.customer_name || 'there';

    // Build message
    const message = `Hi ${patientName}! 🎉\n\n` +
      `A slot has just opened up at ${clinicName}:\n` +
      `• Service: ${freedSlot.service}\n` +
      `• Date: ${formatDate(freedSlot.appointment_date)}\n` +
      `• Time: ${formatTime(freedSlot.appointment_time)}\n\n` +
      `Would you like to book this slot?\n\n` +
      `Reply *YES* to confirm, or *NO* to stay on the waitlist for other openings.`;

    // Send via WhatsApp
    const sent = await sendWhatsAppMessage(waitlistEntry.customer_phone, message);

    if (sent) {
      // Mark as notified
      await supabase
        .from('waitlist')
        .update({
          last_notified_at: new Date().toISOString(),
          notified_slot_date: freedSlot.appointment_date,
          notified_slot_time: freedSlot.appointment_time,
          notified_service: freedSlot.service,
        })
        .eq('id', waitlistEntry.id);

      console.log(`[WAITLIST] ✅ Notified ${maskPhone(waitlistEntry.customer_phone)} about ${freedSlot.appointment_date} ${freedSlot.appointment_time}`);
      return true;
    }

    return false;
  } catch (err) {
    console.error('[WAITLIST] Failed to send notification:', err.message);
    return false;
  }
}

// ─── ALTERNATIVE SLOT SUGGESTIONS ────────────────────────────────
// Used by bot-engine when a slot is not available

/**
 * Find 2 alternative time slots near the requested date/time.
 * Called from bot-engine when the primary slot is unavailable.
 */
async function findAlternativeSlots(clientId, requestedDate, requestedTime, serviceName, clientConfig) {
  try {
    // Get operating hours
    const dayOfWeek = new Date(requestedDate).getDay();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[dayOfWeek];

    const hours = (clientConfig.operating_hours || []).find(h => h.day === dayName);
    if (!hours || !hours.isOpen) {
      // Clinic closed that day — check next 3 days
      return await findSlotsOnNearbyDays(clientId, requestedDate, serviceName, clientConfig, 3);
    }

    // Check same day for other times
    const { data: existing } = await supabase
      .from('appointments')
      .select('appointment_time')
      .eq('client_id', clientId)
      .eq('appointment_date', requestedDate)
      .in('status', ['confirmed', 'pending']);

    const bookedTimes = (existing || []).map(a => a.appointment_time);
    const service = (clientConfig.services || []).find(s =>
      s.name.toLowerCase() === (serviceName || '').toLowerCase()
    );
    const duration = parseInt(service?.duration) || 60;

    // Generate all possible slots
    const slots = generateSlotsForDay(hours.open_time, hours.close_time, duration, bookedTimes);

    // Filter out the requested time, return closest 2
    const requestedMinutes = timeToMinutes(requestedTime);
    const alternatives = slots
      .filter(s => s !== requestedTime)
      .sort((a, b) => Math.abs(timeToMinutes(a) - requestedMinutes) - Math.abs(timeToMinutes(b) - requestedMinutes))
      .slice(0, 2);

    if (alternatives.length >= 2) {
      return { date: requestedDate, slots: alternatives };
    }

    // Not enough slots same day — check next day
    const nextDayResult = await findSlotsOnNearbyDays(clientId, requestedDate, serviceName, clientConfig, 1);
    if (nextDayResult.slots.length > 0) {
      return {
        date: requestedDate,
        slots: [...alternatives, ...nextDayResult.slots].slice(0, 2)
      };
    }

    return { date: requestedDate, slots: alternatives };

  } catch (err) {
    console.error('[WAITLIST] Error finding alternatives:', err.message);
    return { date: requestedDate, slots: [] };
  }
}

async function findSlotsOnNearbyDays(clientId, fromDate, serviceName, clientConfig, maxDays) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const service = (clientConfig.services || []).find(s =>
    s.name.toLowerCase() === (serviceName || '').toLowerCase()
  );
  const duration = parseInt(service?.duration) || 60;

  for (let offset = 1; offset <= maxDays; offset++) {
    const checkDate = new Date(fromDate);
    checkDate.setDate(checkDate.getDate() + offset);
    const dateStr = checkDate.toISOString().split('T')[0];
    const dayName = days[checkDate.getDay()];

    const hours = (clientConfig.operating_hours || []).find(h => h.day === dayName);
    if (!hours || !hours.isOpen) continue;

    const { data: existing } = await supabase
      .from('appointments')
      .select('appointment_time')
      .eq('client_id', clientId)
      .eq('appointment_date', dateStr)
      .in('status', ['confirmed', 'pending']);

    const bookedTimes = (existing || []).map(a => a.appointment_time);
    const slots = generateSlotsForDay(hours.open_time, hours.close_time, duration, bookedTimes);

    if (slots.length >= 2) {
      return { date: dateStr, slots: slots.slice(0, 2) };
    } else if (slots.length === 1) {
      return { date: dateStr, slots };
    }
  }

  return { date: null, slots: [] };
}

function generateSlotsForDay(openTime, closeTime, duration, bookedTimes) {
  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);
  const interval = 30; // 30-min slots

  const slots = [];
  for (let t = openMinutes; t + duration <= closeMinutes; t += interval) {
    const slotStr = minutesToTime(t);
    // Check if this slot overlaps with any booked time
    const overlaps = bookedTimes.some(bt => {
      const btMin = timeToMinutes(bt);
      return (t < btMin + duration) && (t + duration > btMin);
    });
    if (!overlaps) {
      slots.push(slotStr);
    }
  }
  return slots;
}

// ─── UTILITY FUNCTIONS ───────────────────────────────────────────

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  return d.toLocaleDateString('en-SG', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function maskPhone(phone) {
  return phone?.slice(-4).padStart(phone.length, '*') || '****';
}

// ─── SEND WHATSAPP MESSAGE ───────────────────────────────────────

async function sendWhatsAppMessage(to, text) {
  const d360Key = process.env.D360_API_KEY;
  if (!d360Key) {
    console.warn('[WAITLIST] D360_API_KEY not set');
    return false;
  }

  const D360_API_URL = process.env.D360_API_URL || 'https://waba.360dialog.io/v1/messages';

  try {
    const result = await fetch(D360_API_URL, {
      method: 'POST',
      headers: {
        'D360-API-KEY': d360Key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text.substring(0, 4096) }
      })
    });

    if (result.ok) {
      console.log(`[WAITLIST] WhatsApp sent to ${maskPhone(to)}`);
      return true;
    }
    console.error(`[WAITLIST] WhatsApp failed: HTTP ${result.status}`);
    return false;
  } catch (err) {
    console.error(`[WAITLIST] WhatsApp error: ${err.message}`);
    return false;
  }
}

// ─── SCHEDULER ───────────────────────────────────────────────────

function startWaitlistScheduler() {
  if (!CONFIG.ENABLED) {
    console.log('[WAITLIST] Scheduler disabled');
    return;
  }

  console.log(`[WAITLIST] Scheduler started — checking every ${CONFIG.CHECK_INTERVAL_MS / 60000} minutes`);

  // Run immediately on startup, then every 15 minutes
  setTimeout(() => {
    runWaitlistCheck();
    setInterval(runWaitlistCheck, CONFIG.CHECK_INTERVAL_MS);
  }, 10000); // 10 second delay on startup
}

// ─── EXPORTS ─────────────────────────────────────────────────────

module.exports = {
  runWaitlistCheck,
  startWaitlistScheduler,
  findAlternativeSlots, // Used by bot-engine
  CONFIG,
};
