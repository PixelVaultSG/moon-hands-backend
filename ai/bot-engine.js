/**
 * Moon Hands - Production AI Bot Engine
 * 
 * Architecture:
 *   OpenAI GPT-4o mini with Function Calling
 *   ├─ check_availability() → Google Calendar freebusy
 *   ├─ create_booking() → Supabase + Google Calendar
 *   ├─ cancel_booking() → Supabase + Google Calendar
 *   ├─ get_treatment_info() → client_configs.services JSON
 *   ├─ get_pricing() → client_configs.services JSON
 *   ├─ add_to_waitlist() → Supabase waitlist table
 *   └─ check_existing_booking() → Supabase appointments
 * 
 * Clinic-configurable:
 *   ├─ booking_auto_confirm: true/false
 *   ├─ booking_after_hours_action: auto_confirm/hold_for_approval/next_business_day
 *   ├─ booking_waitlist_enabled: true/false
 *   ├─ booking_max_advance_days: default 30
 *   ├─ booking_min_notice_hours: default 2
 *   ├─ booking_allow_same_day: true/false
 *   ├─ booking_require_phone: true/false
 *   ├─ booking_reminder_24h/1h: true/false
 *   └─ booking_followup_48h: true/false
 */

const { OpenAI } = require('openai');
const { google } = require('googleapis');
const db = require('../supabase/client');
const { costProtectionMiddleware } = require('../middleware/cost-protection');
const { routeMessage } = require('./smart-router');
const memory = require('../memory'); // Episodic memory — loads relevant project knowledge
const { classifyMessage, executeExperts } = require('./expert-system/patient-experts');
const { matchIntents } = require('./intent-matcher');
const { getFunctionDefinitions, executeFunction } = require('./expert-system/functions');
const { detectRedFlag, PATH_A_RESPONSE } = require('./red-flag-detector');
const { classifyMedicalSafety } = require('./medical-classifier');
const convState = require('./conversation-state');
const { getNowSG } = require('../utils/date-helpers');
const { notifyBookingStall } = require('../telegram/booking-notifications');

// ─── Booking-stall alarm (v2.2.5) ────────────────────────────────
// The LLM paths can promise an action ("I'll get back to you shortly!")
// without executing anything — the single-function-call architecture
// cannot chain, and the expert path drops its functionCall entirely.
// When the patient asked for a booking change/cancel and nothing ran
// (or it failed), alert the clinic on Telegram so a human follows up.
const STALL_RE = /\breschedule\b|can\s*(?:not|'t)\s+make\s+it|won'?t\s+be\s+able\s+to\s+make\s+it|unable\s+to\s+make\s+(?:it|my)|(?:cancel|delete)\s+(?:my\s+)?(?:appointment|booking)|i\s+(?:want|need|would\s+like)\s+to\s+cancel|(?:change|move|shift)\s+(?:my\s+)?(?:appointment|booking|appt|slot)/i;
const STALL_ACTION_FUNCS = new Set(['reschedule_booking', 'cancel_booking', 'create_booking']);
function maybeAlertStall(clientConfig, patientPhone, messageText, reason, force = false) {
  try {
    if (!force && !STALL_RE.test(messageText || '')) return;
    notifyBookingStall(clientConfig, patientPhone, messageText, reason)
      .catch(err => console.error('[BOT_ENGINE] Stall alarm send failed:', err.message));
  } catch (e) { console.error('[BOT_ENGINE] Stall alarm error:', e.message); }
}

// ─── Action footer (v2.2.0) ───────────────────────────────────────
// Informational AI answers used to arrive as plain-text walls while the
// booking flow gets cards and buttons. For treatment-related answers,
// attach quick-reply actions so every answer ends in a tappable next step.
// Returns a whatsappInteractive payload or null.
const FOOTER_INTENTS = new Set([
  'service_inquiry', 'service_list', 'treatment_enquiry',
  'pricing_inquiry', 'pricing', 'faq', 'faq_prep', 'faq_aftercare'
]);
function withActionFooter(text, clientConfig, matchedIntents = [], resumePrompt = null) {
  try {
    if (!text || resumePrompt) return null; // resume line is already the CTA
    if (text.length > 900) return null;     // button-message body cap is 1024
    const services = clientConfig?.config?.services || clientConfig?.services || [];
    const textLower = text.toLowerCase();
    const mentionsService = services.some(s => s.name && textLower.includes(s.name.toLowerCase()));
    const intentHit = (matchedIntents || []).some(m => FOOTER_INTENTS.has(typeof m === 'string' ? m : m.intent));
    if (!intentHit && !mentionsService) return null;
    const { buildQuickReplyButtons } = require('./whatsapp-interactive');
    const { findConsultService } = require('./smart-router');
    const consult = findConsultService(clientConfig?.config || clientConfig || {});
    const buttons = consult
      ? [{ id: 'quick_consult', title: '📋 Book Consult' }, { id: 'browse_categories', title: 'Browse Treatments' }]
      : [{ id: 'browse_categories', title: 'Browse Treatments' }];
    return buildQuickReplyButtons({ body: text, buttons });
  } catch (e) {
    console.error('[BOT_ENGINE] action footer failed:', e.message);
    return null;
  }
}
const { sendClinicNotification } = require('../telegram/multi-clinic-sender');
const { createCallbackRequest } = require('../server/callback-requests');
const { buildQuickReplyButtons } = require('./whatsapp-interactive');

// ─── INITIALIZATION ────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── FUNCTION DEFINITIONS (sent to OpenAI) ────────────────────────

// ─── BOT FUNCTION DEFINITIONS ─────────────────────────────────────
// Centralized in functions.js — single source of truth for all 8 functions.
const BOT_FUNCTIONS = getFunctionDefinitions();

// ─── OPENAI CLIENT ────────────────────────────────────────────────

// ─── GOOGLE CALENDAR SETUP ────────────────────────────────────────

function getCalendarClient(refreshToken) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

// ─── LOAD CLIENT CONFIG ───────────────────────────────────────────

function getDemoConfig() {
  return {
    id: 'demo',
    name: 'Glow Aesthetic Clinic',
    slug: 'glow-aesthetic-clinic',
    googleCalendarId: null,
    config: {
      agent_name: 'Sophia',
      tone: 'warm and professional',
      greeting: 'Hello! Welcome to Glow Aesthetic Clinic.',
      phone: '+65 6123 4567',
      whatsapp_number: '+65 6123 4567',
      address: '123 Orchard Road, #05-01, Singapore 238863',
      nearest_mrt: 'Orchard MRT (NS22) — 3 min walk',
      landmarks: 'ION Orchard, Wisma Atria',
      parking_info: 'Complimentary parking at I Orchard (validate at reception)',
      services: [
        { name: 'Botox', price: '$380', price_unit: 'area', duration: '30min', description: 'Reduces fine lines and wrinkles. Results last 3-4 months.', category: 'Injectables' },
        { name: 'Dermal Filler', price: '$680', price_unit: 'syringe', duration: '45min', description: 'Restores volume and contours. Results last 6-12 months.', category: 'Injectables' },
        { name: 'HydraFacial', price: '$280', price_unit: 'session', duration: '60min', description: 'Deep cleansing, exfoliation and hydration. Instant glow.', category: 'Facials' },
        { name: 'HIFU Face Lift', price: '$1,280', price_unit: 'session', duration: '90min', description: 'Non-surgical facelift using ultrasound. Results develop over 2-3 months.', category: 'Lifting' },
        { name: 'Laser Skin Rejuvenation', price: '$450', price_unit: 'session', duration: '45min', description: 'Improves skin texture, pores and pigmentation.', category: 'Laser' },
        { name: 'Chemical Peel', price: '$180', price_unit: 'session', duration: '30min', description: 'Exfoliates dead skin cells for brighter, smoother skin.', category: 'Facials' },
        { name: 'Rejuran Healer', price: '$880', price_unit: 'session', duration: '45min', description: 'Skin healing and regeneration with salmon DNA. 3 sessions recommended.', category: 'Injectables' },
        { name: 'Thread Lift', price: '$2,500', price_unit: 'full face', duration: '60min', description: 'Dissolvable threads lift and tighten sagging skin.', category: 'Lifting' },
      ],
      service_categories: [
        { id: 'Injectables', name: 'Injectables' },
        { id: 'Facials', name: 'Facials & Peels' },
        { id: 'Lifting', name: 'Lifting & Tightening' },
        { id: 'Laser', name: 'Laser Treatments' },
      ],
      operating_hours: [
        { day: 'Monday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Tuesday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Wednesday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Thursday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Friday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Saturday', open_time: '10:00', close_time: '18:00', isOpen: true },
        { day: 'Sunday', open_time: null, close_time: null, isOpen: false },
      ],
      faqs: [
        { question: 'Do I need a consultation before treatment?', answer: 'Yes, a complimentary consultation is required for all injectable treatments. Facials and peels can be booked directly.' },
        { question: 'Is there downtime?', answer: 'Most facials have zero downtime. Injectables may have mild redness or swelling for 24-48 hours. Your doctor will advise during consultation.' },
        { question: 'How do I prepare for my appointment?', answer: 'Avoid alcohol 24 hours before injectables. Come with clean skin (no makeup). Arrive 10 minutes early to complete registration.' },
      ],
      special_notes: 'All injectable treatments are performed by MOH-certified doctors. We use only FDA/HSA-approved products.',
      booking_auto_confirm: false,
      booking_after_hours_action: 'hold_for_approval',
      booking_waitlist_enabled: true,
      booking_max_advance_days: 30,
      booking_min_notice_hours: 4,
      booking_allow_same_day: true,
      booking_require_phone: true,
    }
  };
}

async function loadClientConfig(clientId) {
  try {
    const { data, error } = await db.supabase
      .from('clients')
      .select('*, client_configs(*)')
      .eq('id', clientId)
      .single();
    
    if (error || !data) {
      console.log(`[BOT_ENGINE] Client ${clientId} not found in Supabase — using demo config`);
      return getDemoConfig();
    }

    // client_configs is returned as the joined row (or array with 1 element)
    const clientConfigRow = Array.isArray(data.client_configs)
      ? (data.client_configs[0] || {})
      : (data.client_configs || {});

    // The nested config JSONB is inside clientConfigRow.config
    const nestedConfig = clientConfigRow.config || {};

    // Build a flattened config that getConfig can read properly
    // Priority: nested config JSONB (has categories from migration) → direct columns → defaults
    // We check nested config first because the migration puts categorized data in config.services.
    // The direct columns (services, operating_hours) are fallbacks for custom overrides.
    const services = (nestedConfig.services && nestedConfig.services.length > 0)
      ? nestedConfig.services
      : (clientConfigRow.services || []);
    const operating_hours = (nestedConfig.operating_hours && nestedConfig.operating_hours.length > 0)
      ? nestedConfig.operating_hours
      : (clientConfigRow.operating_hours || []);
    const faqs = (nestedConfig.faqs && nestedConfig.faqs.length > 0)
      ? nestedConfig.faqs
      : (clientConfigRow.faqs || []);

    // Destructure nestedConfig to avoid overwriting our computed arrays
    const { services: _ns, operating_hours: _noh, faqs: _nf, ...restNestedConfig } = nestedConfig;

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      industry: data.industry || 'aesthetic',
      googleCalendarId: data.google_calendar_id,
      // Flattened properties for direct access
      services,
      operating_hours,
      faqs,
      // Copy any other properties from nested config (excluding the arrays we already merged)
      ...restNestedConfig,
      // Keep merged config object for backward compatibility
      config: {
        ...nestedConfig,
        services,
        operating_hours,
        faqs
      }
    };
  } catch (err) {
    console.log(`[BOT_ENGINE] Supabase error loading client ${clientId} — using demo config: ${err.message}`);
    return getDemoConfig();
  }
}

// ─── AVAILABILITY CALCULATION ─────────────────────────────────────

async function calculateAvailability(clientConfig, requestedDate, treatmentName) {
  const { data: client } = await db.supabase
    .from('clients')
    .select('google_calendar_id')
    .eq('id', clientConfig.id)
    .single();

  // 1. Get operating hours for the day
  const dayOfWeek = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(requestedDate).getDay()];
  const hours = (clientConfig.config.operating_hours || []).find(h => h.day === dayOfWeek);
  
  if (!hours || !hours.isOpen) {
    return { available: false, reason: `We are closed on ${dayOfWeek}s.`, slots: [] };
  }

  // 2. Get treatment duration
  let duration = 60;
  const treatment = (clientConfig.config.services || []).find(s => 
    s.name.toLowerCase().includes((treatmentName || '').toLowerCase())
  );
  if (treatment) duration = parseInt(treatment.duration) || 60;

  const buffer = clientConfig.config.buffer_time || 15;
  const slotDuration = duration + buffer;

  // 3. Get existing bookings from Supabase
  const { data: existingBookings } = await db.supabase
    .from('appointments')
    .select('appointment_time, duration')
    .eq('client_id', clientConfig.id)
    .eq('appointment_date', requestedDate)
    .in('status', ['confirmed', 'pending'])
    .order('appointment_time');

  // 4. If Google Calendar connected, also check there
  let busyPeriods = [];
  
  if (client?.google_calendar_id && clientConfig.googleRefreshToken) {
    try {
      const calendar = getCalendarClient(clientConfig.googleRefreshToken);
      const dayStart = `${requestedDate}T${hours.open_time}:00+08:00`;
      const dayEnd = `${requestedDate}T${hours.close_time}:00+08:00`;
      
      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: dayStart,
          timeMax: dayEnd,
          timeZone: 'Asia/Singapore',
          items: [{ id: client.google_calendar_id }]
        }
      });
      
      busyPeriods = response.data.calendars[client.google_calendar_id]?.busy || [];
    } catch (err) {
      console.error('[CALENDAR] freebusy error:', err.message);
      // Fall back to Supabase bookings only
    }
  }

  // 5. Calculate free slots
  const openTime = minutesFromTime(hours.open_time);
  const closeTime = minutesFromTime(hours.close_time);
  
  // Convert existing bookings to busy periods
  const allBusy = [
    ...busyPeriods.map(b => ({
      start: minutesFromTime(new Date(b.start).toTimeString().slice(0,5)),
      end: minutesFromTime(new Date(b.end).toTimeString().slice(0,5))
    })),
    ...(existingBookings || []).map(b => ({
      start: minutesFromTime(b.appointment_time),
      end: minutesFromTime(b.appointment_time) + (b.duration || 60)
    }))
  ].sort((a, b) => a.start - b.start);

  // Merge overlapping busy periods
  const mergedBusy = mergeBusyPeriods(allBusy);

  // Find free slots
  const slots = [];
  let current = openTime;
  
  for (const busy of mergedBusy) {
    while (current + slotDuration <= busy.start && current + slotDuration <= closeTime) {
      slots.push(timeFromMinutes(current));
      current += slotDuration;
    }
    if (current < busy.end) current = busy.end;
  }
  
  while (current + slotDuration <= closeTime) {
    slots.push(timeFromMinutes(current));
    current += slotDuration;
  }

  return {
    available: slots.length > 0,
    slots: slots.slice(0, 6), // Return max 6 slots
    operatingHours: `${hours.open_time} - ${hours.close_time}`,
    treatmentDuration: duration
  };
}

function minutesFromTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function timeFromMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h;
  return `${displayH}:${String(m).padStart(2,'0')} ${ampm}`;
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

// ─── FUNCTION HANDLERS ────────────────────────────────────────────

async function handleCheckAvailability(args, clientConfig) {
  const { date, treatment, day_preference } = args;
  
  // Validate date is within booking window
  const requested = new Date(date);
  const today = new Date();
  today.setHours(0,0,0,0);
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + (clientConfig.config.booking_max_advance_days || 30));
  
  if (requested < today) return { error: "That date has already passed. Please choose a future date." };
  if (requested > maxDate) return { error: `You can only book up to ${clientConfig.config.booking_max_advance_days || 30} days in advance.` };

  // Check same-day booking allowed
  const isToday = date === today.toISOString().split('T')[0];
  if (isToday && !(clientConfig.config.booking_allow_same_day ?? true)) {
    return { error: "Same-day bookings are not available. Please choose tomorrow or later." };
  }

  // Check minimum notice
  if (isToday) {
    const minNotice = clientConfig.config.booking_min_notice_hours || 2;
    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    const openHour = 10; // Simplified, should check actual open time
    if (currentHour > openHour + minNotice) {
      return { error: `Bookings must be made at least ${minNotice} hours in advance. Please choose a later time or tomorrow.` };
    }
  }

  const result = await calculateAvailability(clientConfig, date, treatment);
  
  if (!result.available) {
    // Before offering waitlist, suggest 2 alternative slots
    const { findAlternativeSlots } = require('../jobs/waitlist-reengagement');
    const alternatives = await findAlternativeSlots(
      clientConfig.id, date, time, treatment, clientConfig.config
    );

    let altMessage = '';
    if (alternatives.slots.length >= 2) {
      const isSameDay = alternatives.date === date;
      const dateLabel = isSameDay ? 'that day' : formatDateNice(alternatives.date);
      altMessage = `However, I found availability on ${dateLabel}:\n` +
        alternatives.slots.map((s, i) => `${i + 1}. ${formatTime12h(s)}`).join('\n') +
        `\n\nWould any of these work? Just reply with the number (1 or 2), or I can add you to the waitlist for your preferred time.`;
    } else if (alternatives.slots.length === 1) {
      altMessage = `I found one alternative slot on ${formatDateNice(alternatives.date)} at ${formatTime12h(alternatives.slots[0])}.\n\nDoes that work? Reply YES to book it, or I can add you to the waitlist.`;
    }

    if (clientConfig.config.booking_waitlist_enabled) {
      const waitlistMsg = 'Would you like me to add you to our waitlist? I will notify you as soon as a slot opens up.';
      const fullMsg = result.reason || 'No slots available for that date.';
      const messageBody = altMessage ? (fullMsg + '\n\n' + altMessage) : (fullMsg + '\n\n' + waitlistMsg);
      return {
        available: false,
        message: messageBody,
        suggest_waitlist: !altMessage,
        alternative_slots: alternatives.slots,
        alternative_date: alternatives.date,
      };
    }
    return { available: false, message: result.reason || "No slots available." };
  }

  const treatmentDisplay = treatment || 'an appointment';
  return {
    available: true,
    date,
    treatment: treatmentDisplay,
    slots: result.slots,
    operatingHours: result.operatingHours,
    message: `Here are the available slots for ${date}:\n\n${result.slots.join(', ')}\n\nWhich time works best for you?`
  };
}

async function handleCreateBooking(args, clientConfig) {
  const { patient_name, patient_phone, treatment, date, time, notes } = args;

  // Validate phone required
  if ((clientConfig.config.booking_require_phone ?? true) && !patient_phone) {
    return { error: "I'll need your phone number to confirm the booking. Could you please share it?" };
  }

  // UNIFIED GATE: opening hours + duration fits before close + conflicts
  // with confirmed AND awaiting-confirmation bookings
  const { validateBookingSlot } = require('./availability-engine');
  const svcForDuration = (clientConfig.config?.services || []).find(s =>
    String(s.name || '').toLowerCase() === String(treatment || '').toLowerCase());
  const durMin = parseInt(svcForDuration?.duration) || clientConfig.config?.appointment_duration_minutes || 60;
  const gate = await validateBookingSlot(clientConfig.id, date, time, durMin, clientConfig);
  if (!gate.ok) {
    return { error: `I'm sorry, that slot won't work — ${gate.reason}. Would you like me to suggest another time?` };
  }

  // Check for double-booking
  const { data: existing } = await db.supabase
    .from('appointments')
    .select('id')
    .eq('client_id', clientConfig.id)
    .eq('appointment_date', date)
    .eq('appointment_time', time)
    .in('status', ['confirmed', 'pending'])
    .single();

  if (existing) {
    return { error: "That slot was just booked by someone else. Let me find you another time." };
  }

  // Determine status based on clinic config
  const isAfterHours = isClinicClosed(clientConfig, date, time);
  let status = 'confirmed';
  let message = '';

  if (!clientConfig.config.booking_auto_confirm) {
    // Clinic approval required
    status = 'pending_approval';
    message = `Thank you ${patient_name}! Your ${treatment} appointment for ${date} at ${time} has been submitted for approval. The clinic will confirm within 30 minutes. You'll receive a confirmation message once approved.`;
    
    // Send Telegram alert to clinic
    await sendApprovalAlert(clientConfig, { patient_name, patient_phone, treatment, date, time, notes });
  } else if (isAfterHours && clientConfig.config.booking_after_hours_action === 'hold_for_approval') {
    // After hours + hold for approval
    status = 'pending_approval';
    message = `Thank you ${patient_name}! Your booking request has been received. Since it's outside our business hours, the clinic will confirm it first thing in the morning. You'll receive a confirmation by 9 AM.`;
    
    await sendApprovalAlert(clientConfig, { patient_name, patient_phone, treatment, date, time, notes });
  } else if (isAfterHours && clientConfig.config.booking_after_hours_action === 'next_business_day') {
    status = 'pending';
    const nextDay = getNextBusinessDay(date);
    message = `Thank you ${patient_name}! I'll process your booking first thing on our next business day (${nextDay}). You'll receive confirmation by 9 AM.`;
  } else {
    // Auto-confirm
    status = 'confirmed';
    message = `Perfect! Your ${treatment} appointment is confirmed:\n\nDate: ${date}\nTime: ${time}\n\nPlease arrive 10 minutes early. If you need to reschedule, just reply "reschedule" or call us.`;
  }

  // Create in Supabase
  const { data: appointment, error } = await db.supabase
    .from('appointments')
    .insert({
      client_id: clientConfig.id,
      customer_name: patient_name,
      customer_phone: patient_phone,
      service: treatment,
      appointment_date: date,
      appointment_time: time,
      status,
      notes
    })
    .select()
    .single();

  if (error) {
    console.error('[BOOKING] Insert error:', error);
    return { error: "I'm having trouble saving your booking. Please try again or call us directly." };
  }

  // Create in Google Calendar if connected
  let googleEventId = null;
  if (clientConfig.googleCalendarId && clientConfig.googleRefreshToken) {
    try {
      const calendar = getCalendarClient(clientConfig.googleRefreshToken);
      const treatmentDuration = clientConfig.config.services?.find(
        s => s.name.toLowerCase() === (treatment || '').toLowerCase()
      )?.duration || 60;
      const endDateTime = new Date(`${date}T${time}:00+08:00`);
      endDateTime.setMinutes(endDateTime.getMinutes() + treatmentDuration);
      
      const eventResult = await calendar.events.insert({
        calendarId: clientConfig.googleCalendarId,
        requestBody: {
          summary: `${treatment} - ${patient_name}`,
          description: `Booking via Moon Hands AI\nPhone: ${patient_phone}\nNotes: ${notes || 'N/A'}`,
          start: { dateTime: `${date}T${time}:00+08:00`, timeZone: 'Asia/Singapore' },
          end: { dateTime: endDateTime.toISOString(), timeZone: 'Asia/Singapore' }
        }
      });
      googleEventId = eventResult.data.id;
      console.log(`[CALENDAR] Event created: ${googleEventId}`);
      
      // Store the event ID in the appointment
      await db.supabase.from('appointments').update({ google_event_id: googleEventId }).eq('id', appointment.id);
    } catch (err) {
      console.error('[CALENDAR] Event creation error:', err.message);
      // Don't fail the booking if calendar fails
    }
  }

  // Log conversation
  await logConversation(clientConfig.id, 'whatsapp', patient_phone, patient_name,
    `Booked ${treatment} for ${date} at ${time}`, message, 'booking');

  return { success: true, appointment_id: appointment.id, status, message };
}

async function handleCancelBooking(args, clientConfig) {
  const { patient_phone, date } = args;

  const query = db.supabase
    .from('appointments')
    .select('*')
    .eq('client_id', clientConfig.id)
    .eq('customer_phone', patient_phone)
    .in('status', ['confirmed', 'pending', 'pending_approval']);

  if (date) query.eq('appointment_date', date);

  const { data: bookings } = await query.order('appointment_date', { ascending: true });

  if (!bookings || bookings.length === 0) {
    return { error: "I couldn't find any upcoming bookings for that phone number. Could you double-check it?" };
  }

  if (bookings.length === 1) {
    const booking = bookings[0];
    await db.supabase.from('appointments').update({ status: 'cancelled' }).eq('id', booking.id);
    
    // Remove from Google Calendar if connected
    if (booking.google_event_id && clientConfig.googleCalendarId && clientConfig.googleRefreshToken) {
      try {
        const calendar = getCalendarClient(clientConfig.googleRefreshToken);
        await calendar.events.delete({
          calendarId: clientConfig.googleCalendarId,
          eventId: booking.google_event_id
        });
        console.log(`[CALENDAR] Event deleted: ${booking.google_event_id}`);
      } catch (err) {
        console.error('[CALENDAR] Event deletion error:', err.message);
        // Don't fail cancellation if calendar delete fails
      }
    }
    
    // Send Telegram notification about cancellation
    try {
      const { notifyBookingCancelled } = require('../telegram/booking-notifications');
      await notifyBookingCancelled({
        clinicName: clientConfig.name || 'Your Clinic',
        patientName: booking.customer_name || 'Unknown',
        patientPhone: booking.customer_phone || '',
        service: booking.service || 'Appointment',
        date: booking.appointment_date,
        time: booking.appointment_time,
        client_id: clientConfig.id,
      }, clientConfig, 'Patient cancelled via WhatsApp');
    } catch (e) { /* notification is best-effort */ }

    return { success: true, message: `Your ${booking.service} appointment on ${booking.appointment_date} at ${booking.appointment_time} has been cancelled. We hope to see you again soon!` };
  }

  // Multiple bookings — ask which one
  return {
    multiple: true,
    bookings: bookings.map(b => ({
      id: b.id,
      service: b.service,
      date: b.appointment_date,
      time: b.appointment_time
    })),
    message: `I found ${bookings.length} upcoming bookings:\n\n${bookings.map((b, i) => `${i + 1}. ${b.service} - ${b.appointment_date} at ${b.appointment_time}`).join('\n')}\n\nWhich one would you like to cancel? Reply with the number.`
  };
}

async function handleGetTreatmentInfo(args, clientConfig) {
  const { treatment_name } = args;
  const services = clientConfig.config.services || [];
  const treatment = services.find(s => 
    s.name.toLowerCase().includes(treatment_name.toLowerCase()) ||
    treatment_name.toLowerCase().includes(s.name.toLowerCase())
  );

  if (!treatment) {
    return {
      found: false,
      treatments: services.map(s => s.name),
      message: `I don't have information on "${treatment_name}". Here are the treatments we offer:\n\n${services.map(s => `• ${s.name} (${s.price})`).join('\n')}\n\nWhich would you like to know more about?`
    };
  }

  return {
    found: true,
    name: treatment.name,
    price: treatment.price,
    duration: treatment.duration,
    description: treatment.description,
    message: `${treatment.name} - ${treatment.price}\nDuration: ${treatment.duration} minutes\n\n${treatment.description}\n\nWould you like to book a session?`
  };
}

async function handleGetPricing(args, clientConfig) {
  const { treatment_name } = args;
  const services = clientConfig.config.services || [];

  if (treatment_name) {
    const treatment = services.find(s => s.name.toLowerCase().includes(treatment_name.toLowerCase()));
    if (treatment) {
      return { price: treatment.price, name: treatment.name, message: `${treatment.name}: ${treatment.price}` };
    }
  }

  return {
    all_pricing: services.map(s => ({ name: s.name, price: s.price })),
    message: `Here's our pricing:\n\n${services.map(s => `• ${s.name} — ${s.price}`).join('\n')}\n\nWhich treatment interests you?`
  };
}

async function handleAddToWaitlist(args, clientConfig) {
  const { patient_name, patient_phone, preferred_service, preferred_date, preferred_time_range } = args;

  if (!clientConfig.config.booking_waitlist_enabled) {
    return { error: "Sorry, our waitlist is currently closed. Please try booking a different date." };
  }

  const { data, error } = await db.supabase.from('waitlist').insert({
    client_id: clientConfig.id,
    customer_name: patient_name,
    customer_phone: patient_phone,
    preferred_service,
    preferred_date: preferred_date || null,
    preferred_time_range: preferred_time_range || 'any',
    status: 'active'
  }).select().single();

  if (error) {
    return { error: "I'm having trouble adding you to the waitlist. Please try again later." };
  }

  return {
    success: true,
    message: `Thank you ${patient_name}! I've added you to our waitlist for ${preferred_service}. We'll contact you at ${patient_phone} as soon as a slot becomes available.`
  };
}

async function handleCheckExistingBooking(args, clientConfig) {
  const { patient_phone } = args;

  const { data: bookings } = await db.supabase
    .from('appointments')
    .select('*')
    .eq('client_id', clientConfig.id)
    .eq('customer_phone', patient_phone)
    .in('status', ['confirmed', 'pending', 'pending_approval'])
    .order('appointment_date', { ascending: true });

  if (!bookings || bookings.length === 0) {
    return { found: false, message: "I don't see any upcoming bookings for that phone number." };
  }

  return {
    found: true,
    bookings: bookings.map(b => ({
      service: b.service,
      date: b.appointment_date,
      time: b.appointment_time,
      status: b.status
    })),
    message: `Here are your upcoming appointments:\n\n${bookings.map(b => `• ${b.service} — ${b.appointment_date} at ${b.appointment_time}${b.status === 'pending_approval' ? ' (pending approval)' : ''}`).join('\n')}`
  };
}

// ─── TELEGRAM APPROVAL ALERT ──────────────────────────────────────

async function sendApprovalAlert(clientConfig, booking) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!botToken || !adminChatId) return;

    const message = [
      '📋 *BOOKING APPROVAL REQUIRED*',
      '',
      `*Clinic:* ${clientConfig.name}`,
      `*Patient:* ${booking.patient_name}`,
      `*Phone:* ${booking.patient_phone}`,
      `*Treatment:* ${booking.treatment}`,
      `*Date:* ${booking.date}`,
      `*Time:* ${booking.time}`,
      booking.notes ? `*Notes:* ${booking.notes}` : '',
      '',
      'Reply with:',
      '✅ /approve ' + booking.patient_phone,
      '❌ /reject ' + booking.patient_phone + ' [reason]',
    ].filter(Boolean).join('\n');

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChatId,
        text: message,
        parse_mode: 'MarkdownV2'
      })
    });
  } catch (err) {
    console.error('[APPROVAL_ALERT] Failed:', err.message);
  }
}

// ─── CONVERSATION LOGGING ─────────────────────────────────────────

// ─── LEAD SIGNALS (v2.2.8) ───────────────────────────────────────
// Every patient message funnels through logConversation — the single choke
// point. Price-talk flags the conversation row for analytics; negotiation
// signals (a patient asking for a discount TODAY is a lead to close TODAY)
// additionally ping the clinic on Telegram. The conversations columns
// budget_mentioned / is_high_value / recommended_action / notified existed
// since day one but nothing ever wrote them.
const PRICE_TALK_RE = /\b(how much|price|pricing|cost|costs|fee|fees|charge|charges|rates?)\b/i;
const NEGOTIATION_RE = /\b(expensive|too pricey|cheaper|cheap|discount|promo(?:tion)?s?|promo code|deals?|budget|afford|instal+ments?|payment plan|any offers?|best price|lower price)\b/i;
const hotLeadAlerts = new Map(); // clientId:phone → last alert ts
const HOT_LEAD_DEDUP_MS = 24 * 60 * 60 * 1000;
function resetHotLeadAlertsForTest() { hotLeadAlerts.clear(); }

async function maybeAlertHotLead(clientId, phone, msg) {
  try {
    const key = `${clientId}:${String(phone || 'unknown')}`;
    const now = Date.now();
    if (hotLeadAlerts.has(key) && now - hotLeadAlerts.get(key) < HOT_LEAD_DEDUP_MS) return false;
    hotLeadAlerts.set(key, now);
    if (hotLeadAlerts.size > 1000) hotLeadAlerts.delete(hotLeadAlerts.keys().next().value);
    const digits = String(phone || 'unknown').replace(/\D/g, '');
    const masked = digits.length > 4 ? `•••${digits.slice(-4)}` : digits;
    const snippet = String(msg).replace(/[*_\[\]`]/g, '').slice(0, 140);
    await sendClinicNotification(clientId,
      `🔥 *HOT LEAD — price-sensitive patient*

` +
      `Patient: +${masked}
` +
      `Message: "${snippet}"

` +
      `They're negotiating on price. A personal follow-up now could close this booking.`);
    return true;
  } catch (e) {
    console.error('[LEAD] hot-lead alert failed:', e.message);
    return false;
  }
}

async function logConversation(clientId, channel, customerPhone, customerName, message, aiResponse, intent) {
  try {
    const msg = String(message || '');
    const isPatientMsg = channel === 'whatsapp';
    const budget = isPatientMsg && (PRICE_TALK_RE.test(msg) || NEGOTIATION_RE.test(msg));
    const hot = isPatientMsg && NEGOTIATION_RE.test(msg);
    let notified = false;
    if (hot) notified = await maybeAlertHotLead(clientId, customerPhone, msg);
    const row = {
      client_id: clientId,
      channel,
      customer_phone: customerPhone,
      customer_name: customerName,
      message,
      ai_response: aiResponse,
      intent
    };
    if (budget) row.budget_mentioned = true;
    if (hot) {
      row.is_high_value = true;
      row.recommended_action = 'Price-sensitive lead — personal follow-up recommended';
      if (notified) row.notified = true;
    }
    await db.supabase.from('conversations').insert(row);
  } catch (err) {
    console.error('[CONVERSATION_LOG] Failed:', err.message);
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────

function isClinicClosed(clientConfig, date, time) {
  const dayOfWeek = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(date).getDay()];
  const hours = (clientConfig.config.operating_hours || []).find(h => h.day === dayOfWeek);
  if (!hours || !hours.isOpen) return true;
  
  const now = new Date();
  const openTime = new Date(`${date}T${hours.open_time}`);
  const closeTime = new Date(`${date}T${hours.close_time}`);
  return now < openTime || now > closeTime;
}

function getNextBusinessDay(dateStr) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString().split('T')[0];
}

// ─── MAIN BOT INTERFACE ───────────────────────────────────────────

// ─── MADS: DOCTOR CALLBACK CHOICE HANDLER (Handoff §19) ─────────────────
// Patient was offered a doctor callback (MADS Layer 2 fired) and tapped a button.
async function handleCallbackChoice(interactiveId, clientConfig, patientPhone, messageText, startTime) {
  const pending = convState.getState(patientPhone);
  const topic = pending.data?.callbackTopic || messageText || 'Medical question';

  if (interactiveId === 'callback_no') {
    convState.resetIdle(patientPhone);
    const text = "No problem at all. Would you like me to book a consultation instead? Our doctor can assess you in person.";
    const interactive = buildQuickReplyButtons({
      body: text,
      buttons: [
        { id: 'book', title: 'Book Consultation' },
        { id: 'back_menu', title: 'Back to menu' },
      ]
    });
    await logConversation(clientConfig.id, 'whatsapp', patientPhone, null, messageText, text, 'mads:callback_declined');
    return { text, function_called: null, model: 'mads-offer', whatsappInteractive: interactive, latency_ms: Date.now() - startTime };
  }

  // callback_yes — create the request + alert the clinic (Handoff §6.1 IF YES)
  try {
    const row = await createCallbackRequest({
      clinicId: clientConfig.id,
      patientPhone,
      patientName: convState.getKnownName(patientPhone),
      topic
    });
    convState.resetIdle(patientPhone);
    const cbShort = row.id.slice(0, 8);
    await sendClinicNotification(clientConfig.id,
      `📞 *Callback request*\n\nPatient: +${String(patientPhone).replace(/\D/g, '')}\nTopic: ${String(topic).slice(0, 200)}\n\nTap ✅ when the doctor has called (or \`/callbackdone ${cbShort}\`).`,
      { replyMarkup: { inline_keyboard: [[
        { text: '✅ Mark Complete', callback_data: `cbdone:${cbShort}` },
        { text: '🚫 Cancel', callback_data: `cbcancel:${cbShort}` }
      ]] } }
    ).catch(e => console.error('[MADS] callback alert failed:', e.message));
    const text = "Thank you! Our doctor will call you shortly. Is there anything else I can help with in the meantime?";
    await logConversation(clientConfig.id, 'whatsapp', patientPhone, null, messageText, text, 'mads:callback_accepted');
    return { text, function_called: 'create_callback_request', model: 'mads-callback', latency_ms: Date.now() - startTime };
  } catch (err) {
    console.error('[MADS] callback creation failed:', err.message);
    return {
      text: "I've noted your request for a doctor's call. If our team doesn't reach out shortly, please call the clinic directly.",
      function_called: null, model: 'mads-callback', error: err.message, latency_ms: Date.now() - startTime
    };
  }
}

// ─── MADS GATE (Handoff §17–18) ───────────────────────────────────────────
// Returns a response object if MADS intercepted the message, else null.
async function madsGate(messageText, clientConfig, patientPhone, startTime) {
  const startLabel = Date.now();
  // v2.2.8: escalation_phone (collected at onboarding, never used) rides on
  // the CLINIC alert. Deliberately NOT in the patient-facing red-flag reply —
  // an emergency must go to A&E/GP, not to the clinic's phone line.
  const escLine = clientConfig?.escalation_phone ? `\n📞 Escalation contact on file: ${clientConfig.escalation_phone}` : '';

  // Pre-layer: regex red-flag detector — free, instant, always first
  const redFlag = detectRedFlag(messageText);
  if (redFlag.isRedFlag) {
    console.log(`[MADS] RED FLAG (regex) for phone=...${String(patientPhone || '').slice(-4)}: ${redFlag.matchedPattern}`);
    await sendClinicNotification(clientConfig.id,
      `🚨 *Red flag detected*\n\nPatient: +${String(patientPhone).replace(/\D/g, '')}\nMessage: "${String(messageText).slice(0, 200)}"\n\nNo booking offered. Patient advised to visit A&E/GP.${escLine}`
    ).catch(e => console.error('[MADS] red-flag alert failed:', e.message));
    await logConversation(clientConfig.id, 'whatsapp', patientPhone, null, messageText, PATH_A_RESPONSE, 'mads:red_flag');
    return { text: PATH_A_RESPONSE, function_called: null, model: 'mads-red-flag', latency_ms: Date.now() - startLabel };
  }

  // Layer 2: LLM classifier
  const classification = await classifyMedicalSafety(messageText);
  console.log(`[MADS] Classification: ${classification.category} (source=${classification.source})`);

  if (classification.isRedFlag) {
    await sendClinicNotification(clientConfig.id,
      `🚨 *Red flag detected (classifier)*\n\nPatient: +${String(patientPhone).replace(/\D/g, '')}\nMessage: "${String(messageText).slice(0, 200)}"\n\nNo booking offered. Patient advised to visit A&E/GP.${escLine}`
    ).catch(e => console.error('[MADS] red-flag alert failed:', e.message));
    await logConversation(clientConfig.id, 'whatsapp', patientPhone, null, messageText, PATH_A_RESPONSE, 'mads:red_flag_llm');
    return { text: PATH_A_RESPONSE, function_called: null, model: 'mads-red-flag', latency_ms: Date.now() - startLabel };
  }

  if (classification.isMedicalAdvice) {
    convState.setState(patientPhone, 'callback_pending', { callbackTopic: String(messageText).slice(0, 500) });
    const offerText = "I'm not a medical professional, so I can't give clinical advice. Would you like our doctor to give you a call to discuss this?";
    const interactive = buildQuickReplyButtons({
      body: offerText,
      buttons: [
        { id: 'callback_yes', title: 'Yes, please call me' },
        { id: 'callback_no', title: 'No, thanks' },
      ]
    });
    await logConversation(clientConfig.id, 'whatsapp', patientPhone, null, messageText, offerText, 'mads:medical_advice_offer');
    return { text: offerText, function_called: null, model: 'mads-offer', whatsappInteractive: interactive, latency_ms: Date.now() - startLabel };
  }

  return null; // cleared — proceed with normal flow
}

async function processMessage(messageText, clientId, conversationHistory = [], patientPhone = null, interactiveId = null) {
  const startTime = Date.now();
  try {
    console.log(`[BOT_ENGINE] === START === clientId=${clientId}, phone=${patientPhone}, interactiveId=${interactiveId}, msg="${messageText?.substring(0,60)}"`);
    
    const clientConfig = await loadClientConfig(clientId);
    console.log(`[BOT_ENGINE] Config loaded: name=${clientConfig?.name}, industry=${clientConfig?.industry}, services=${clientConfig?.services?.length}, config.services=${clientConfig?.config?.services?.length}`);

    // ─── MADS GATE — before ALL routing (Handoff §17–18) ────────────────
    // A red flag or medical-advice request must never reach booking logic,
    // the smart router, or the LLM response path.
    // Enabled for chiropractic clinics, or any clinic with the safeguard on.
    // Aesthetic clinics with no flags set: zero behaviour change.
    const madsCfg = clientConfig.config?.medical_safeguard || {};
    const madsEnabled = clientConfig.industry === 'chiropractic'
      || madsCfg.strict_mode === true
      || clientConfig.config?.features?.red_flag_triage === true;

    // Callback-offer button taps are part of the MADS flow — handle first.
    if (interactiveId === 'callback_yes' || interactiveId === 'callback_no') {
      return await handleCallbackChoice(interactiveId, clientConfig, patientPhone, messageText, startTime);
    }

    if (madsEnabled && !interactiveId && messageText) {
      const madsResult = await madsGate(messageText, clientConfig, patientPhone, startTime);
      if (madsResult) return madsResult;
    }
    
    // ─── INTERACTIVE ID ROUTING ─────────────────────────────────────
    // If user tapped a button/list item, map the ID directly to an intent
    // This bypasses NLP entirely for structured interactions — 100% accuracy.
    const INTERACTIVE_INTENT_MAP = {
      // Welcome menu
      'services': { intent: 'service_list', text: 'What services do you offer?' },
      'location': { intent: 'location_inquiry', text: 'Where are you located?' },
      'book': { intent: 'booking_request', text: 'I want to book an appointment' },
      'faq': { intent: 'faq', text: 'I have a question' },
      // Confirmation buttons
      'confirm_yes': { intent: 'confirmation_yes', text: 'Yes' },
      'yes': { intent: 'confirmation_yes', text: 'Yes' },
      'confirm_no': { intent: 'confirmation_no', text: 'No' },
      'no': { intent: 'confirmation_no', text: 'No' },
      'confirm_change': { intent: 'correction', text: 'I want to change something' },
      'confirm_cancel': { intent: 'cancellation', text: 'Cancel booking' },
      // Service list selections
      'service_0': { intent: 'booking_request', text: 'I want this treatment' },
      'service_1': { intent: 'booking_request', text: 'I want this treatment' },
      'service_2': { intent: 'booking_request', text: 'I want this treatment' },
      'service_3': { intent: 'booking_request', text: 'I want this treatment' },
      'service_4': { intent: 'booking_request', text: 'I want this treatment' },
      // Treatment info buttons
      'book_this': { intent: 'booking_request', text: 'I want to book this treatment' },
      'ask_more': { intent: 'question', text: 'Tell me more' },
      'back_menu': { intent: 'greeting', text: 'Hi' },
      'add_another': { intent: 'add_treatment', text: 'Add another treatment' },
      'back_list': { intent: 'category_selected', text: 'Back to list' },
      // Multi-treatment selection buttons
      'book_selected': { intent: 'book_selected', text: 'Book these treatments' },
      'add_treatment': { intent: 'add_treatment', text: 'Add another treatment' },
      'cancel': { intent: 'cancellation', text: 'Cancel' },
      'edit': { intent: 'correction', text: 'I want to change something' },
      'edit_date': { intent: 'date_change', text: 'Change date' },
      'edit_time': { intent: 'time_change', text: 'Change time' },
      'edit_treatment': { intent: 'treatment_change', text: 'Change treatment' },
      // v2.1.9: consultation quick-book + category-list navigation
      'quick_consult': { intent: 'quick_book_consultation', text: 'I want to book a consultation' },
      'nav_categories': { intent: 'back_to_categories', text: 'Back to categories' },
      'browse_categories': { intent: 'add_treatment', text: 'Browse categories' },
    };
    
    let effectiveText = messageText;
    let forcedIntents = null;
    
    if (interactiveId) {
      // ── STATIC MAP: Pre-defined button IDs ─────────────────────────
      if (INTERACTIVE_INTENT_MAP[interactiveId]) {
        const mapped = INTERACTIVE_INTENT_MAP[interactiveId];
        effectiveText = mapped.text;
        forcedIntents = [mapped.intent];
        console.log(`[BOT_ENGINE] Interactive ID "${interactiveId}" → intent: ${mapped.intent}`);
      }
      // ── DYNAMIC MAP: Date selection buttons ────────────────────────
      // Format: date_YYYY-MM-DD  (e.g., date_2026-08-22)
      else if (interactiveId.startsWith('date_')) {
        const dateVal = interactiveId.replace('date_', '');
        if (dateVal === 'other') {
          effectiveText = 'other date';
          forcedIntents = ['date_selected'];
        } else {
          effectiveText = dateVal; // Pass raw date to smart-router
          forcedIntents = ['date_selected'];
        }
        console.log(`[BOT_ENGINE] Interactive date ID "${interactiveId}" → date: ${dateVal}`);
      }
      // ── DYNAMIC MAP: Time selection buttons ────────────────────────
      // Format: time_HH-MM  (e.g., time_10-00)
      else if (interactiveId.startsWith('time_')) {
        const timeVal = interactiveId.replace('time_', '').replace(/-/g, ':');
        if (timeVal === 'other') {
          effectiveText = 'other time';
          forcedIntents = ['time_selected'];
        } else {
          effectiveText = timeVal; // Pass raw time to smart-router
          forcedIntents = ['time_selected'];
        }
        console.log(`[BOT_ENGINE] Interactive time ID "${interactiveId}" → time: ${timeVal}`);
      }
      // ── DYNAMIC MAP: Category selection ────────────────────────────
      // Format: cat_CategoryName  (e.g., cat_Injectables)
      else if (interactiveId.startsWith('cat_')) {
        const catId = interactiveId.replace('cat_', '');
        effectiveText = catId;
        forcedIntents = ['category_selected'];
        console.log(`[BOT_ENGINE] Interactive category ID "${interactiveId}" → cat: ${catId}`);
      }
      // ── DYNAMIC MAP: Service selection ─────────────────────────────
      // Format: svc_service_name  (e.g., svc_botox)
      else if (interactiveId.startsWith('svc_')) {
        const svcName = interactiveId.replace('svc_', '').replace(/_/g, ' ');
        effectiveText = svcName;
        forcedIntents = ['service_selected'];
        console.log(`[BOT_ENGINE] Interactive service ID "${interactiveId}" → service: ${svcName}`);
      }
    }
    
    // ─── STATE HYDRATION: restore persisted conversation state (survives
    // deploys/restarts) before any routing decision reads it ───────────
    try { await convState.hydrateState(patientPhone); } catch (e) { console.error('[BOT_ENGINE] hydrateState failed:', e.message); }

    // ─── SMART ROUTER: Try hardcoded responses first ($0) ───────────
    console.log(`[BOT_ENGINE] Routing: effectiveText="${effectiveText?.substring(0,60)}", forcedIntents=${JSON.stringify(forcedIntents)}`);
    const routerResult = await routeMessage(effectiveText, clientConfig, patientPhone, conversationHistory, forcedIntents);
    console.log(`[BOT_ENGINE] Router result: source=${routerResult?.source}, hasText=${!!routerResult?.text}, intents=${routerResult?.intents?.join(',')}`);
    // A mid-booking question escaped the flow: the answer comes from the AI
    // layers below, but the resume offer rides along on whatever they return.
    const resumePrompt = routerResult?.resumePrompt || null;
    
    if (routerResult.source === 'hardcoded' && routerResult.text) {
      const intents = routerResult.intents || [];
      // Log the hardcoded response for analytics
      await logConversation(clientConfig.id, 'whatsapp', patientPhone, null,
        messageText, routerResult.text, `hardcoded:${intents.join(',')}`);
      
      console.log(`[BOT_ENGINE] Smart router: ${intents.join(',') || 'none'} — cost saved: $${routerResult.cost_saved.toFixed(4)}, hasInteractive=${!!routerResult.whatsappInteractive}`);
      
      return {
        text: routerResult.text,
        function_called: null,
        model: 'hardcoded',
        cost_saved: routerResult.cost_saved,
        intents: intents,
        latency_ms: routerResult.latency_ms,
        whatsappInteractive: routerResult.whatsappInteractive
      };
    }
    
    console.log(`[BOT_ENGINE] Smart router → Expert System (intents: ${(routerResult.intents || []).join(',') || 'none'})`);
    
    // ─── EXPERT SYSTEM: Route to specialized experts ────────────────
    // Each expert receives ONLY the context it needs — smaller prompts,
    // faster responses, fewer hallucinations, lower costs.
    try {
      const matchedIntents = matchIntents(messageText, conversationHistory);
      const expertKeys = classifyMessage(messageText, matchedIntents, conversationHistory);
      
      console.log(`[BOT_ENGINE] Experts assigned: [${expertKeys.join(', ')}]`);
      
      const expertResult = await executeExperts(
        expertKeys, messageText, clientConfig, conversationHistory, patientPhone
      );
      
      if (expertResult.text) {
        // Log the expert response
        const expertsUsed = expertResult.expertsUsed || [];
        await logConversation(clientConfig.id, 'whatsapp', patientPhone, null,
          messageText, expertResult.text, `experts:${expertsUsed.join(',')}`);
        
        console.log(`[BOT_ENGINE] Experts: [${expertsUsed.join(', ')}] — cost: $${expertResult.totalCost.toFixed(4)}`);

        // STALL ALARM (v2.2.5): this path returns text without ever executing
        // the expert's functionCall — a booking action requested here either
        // silently died (functionCall dropped) or was only talked about.
        if (expertResult.functionCall) {
          maybeAlertStall(clientConfig, patientPhone, messageText,
            `expert requested function "${expertResult.functionCall.name}" but it was not executed`, true);
        } else {
          maybeAlertStall(clientConfig, patientPhone, messageText, 'expert replied without taking any action');
        }
        
        // If the reply ends by offering to arrange/book ("Would you like me to
        // arrange that?"), park the conversation in BOOKING_OFFERED so a bare
        // "yes please" next turn starts the booking flow deterministically
        // instead of falling through to the LLM and getting a greeting back.
        if (!resumePrompt && patientPhone && /would you like me to (arrange|book|help you book)|shall i (book|arrange|help you book)|want me to (book|arrange)/i.test(expertResult.text)) {
          convState.setState(patientPhone, 'booking_offered', {});
          console.log('[BOT_ENGINE] Expert offered booking — state set to booking_offered');
        }
        
        const expertFooter = withActionFooter(expertResult.text, clientConfig, matchedIntents, resumePrompt);
        return {
          text: expertResult.text + (resumePrompt || ''),
          whatsappInteractive: expertFooter || undefined,
          function_called: expertResult.functionCall,
          model: 'gpt-4o-mini-experts',
          experts_used: expertsUsed,
          total_cost: expertResult.totalCost,
          latency_ms: Date.now() - startTime
        };
      }
    } catch (expertErr) {
      console.error(`[BOT_ENGINE] Expert system failed, falling back to generalist:`, expertErr.message);
    }
    
    // ─── FALLBACK: Generalist OpenAI (if experts fail) ─────────────
    console.log(`[BOT_ENGINE] Expert system → Generalist fallback`);
    
    // ── Check conversation freshness for greeting control ──
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const now = Date.now();
    let lastMsgTime = 0;
    if (conversationHistory.length > 0) {
      lastMsgTime = conversationHistory[conversationHistory.length - 1].timestamp || 0;
    }
    const timeSinceLastMsg = now - lastMsgTime;
    const isRecent = conversationHistory.length > 0 && timeSinceLastMsg < ONE_HOUR_MS;
    console.log(`[BOT_ENGINE] Conversation freshness: lastMsg=${Math.round(timeSinceLastMsg/1000)}s ago, recent=${isRecent}`);
    
    // Build system prompt
    const services = (clientConfig.config.services || []).map(s => `${s.name} (${s.price}, ${s.duration}min): ${s.description}`).join('\n');
    const hours = (clientConfig.config.operating_hours || []).filter(h => h.isOpen).map(h => `${h.day}: ${h.open_time} - ${h.close_time}`).join(', ');
    const faqs = (clientConfig.config.faqs || []).map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');

    // Load relevant project knowledge from episodic memory
    const memoryContext = memory.getContext(messageText, 2);

    // ANTI-GREETING BLOCK — must be LINE 1 of the system prompt
    // When conversation is recent (<1hr), we FORBID all greeting phrases
    const antiGreetingBlock = isRecent ?
      `!!! FORBIDDEN: DO NOT GREET !!!\n` +
      `You have ALREADY greeted this patient. Using any greeting phrase will confuse them.\n` +
      `FORBIDDEN phrases you must NEVER use:\n` +
      `- "Hello!" / "Hello there!" / "Hi!" / "Hey there!"\n` +
      `- "Welcome to our clinic!" / "Welcome to Pixel Vault!"\n` +
      `- "I'd be happy to help!" / "I'd be happy to assist!" / "I can help you with booking an appointment..."\n` +
      `- "How can I assist you today?" / "How may I help you?"\n` +
      `- "Let me connect you with our team..."\n` +
      `INSTEAD: Just answer directly in 1-2 sentences, as if continuing a chat. No introductions.\n\n` :
      '';

    const systemPrompt = `${antiGreetingBlock}` +
      `You are ${clientConfig.config.agent_name || 'Sophia'} — a warm, friendly receptionist at ${clientConfig.name}. You chat like a real person, not a robot.\n\n` +
      `${memoryContext}\n\n` +
      `HOW TO SPEAK:\n` +
      `- Warm and friendly, like texting a helpful friend who works at the clinic\n` +
      `- Use natural, conversational language. Avoid robotic phrases like "I can assist you with" or "Please be advised"\n` +
      `- Keep it brief — 2-3 sentences max per reply. WhatsApp is casual, not email.\n` +
      `- Use emojis sparingly (1-2 max) — a smile or sparkle is fine, don't overdo it\n` +
      `- Match the patient's energy — if they're casual, be casual. If they're formal, be polite.\n` +
      `- NEVER sound like a menu or FAQ list. Don't bullet-point everything. Just chat naturally.\n` +
      `- When listing services, present them conversationally, not as a catalogue\n` +
      `- Use contractions ("we'd", "you'll", "I'm") — they make you sound human\n` +
      `${isRecent ? `- CRITICAL: This is a CONTINUING conversation. NEVER greet again.\n` : ''}` +
      `\n` +
      `GREETING STYLE (FIRST MESSAGE ONLY — NOT NOW): ${(clientConfig.config.greeting || 'Hello! Welcome to {businessName}.').replace('{businessName}', clientConfig.name)}\n\n` +
      `AVAILABLE TREATMENTS (call get_pricing() when asked about services/prices):\n${services || 'Contact clinic for services'}\n\n` +
      `HOURS: ${hours || 'Please contact us for hours'}\n\n` +
      `${faqs ? `FAQs:\n${faqs}\n\n` : ''}` +
      `${clientConfig.config.special_notes ? `SPECIAL NOTES: ${sanitizeSpecialNotes(clientConfig.config.special_notes)}\n\n` : ''}` +
      `IMPORTANT FUNCTION RULES:\n` +
      `1. WHEN ASKED "What services do you offer?" or "What treatments do you have?" → call get_pricing() with NO treatment_name to get the full list\n` +
      `2. WHEN ASKED about a specific treatment (e.g. "Do you do Botox?") → call get_treatment_info() with that treatment name\n` +
      `3. WHEN ASKED about pricing → call get_pricing()\n` +
      `4. WHEN ASKED about availability → call check_availability()\n\n` +
      `HONESTY RULES:\n` +
      `- Only use facts from the clinic info above. Never invent prices or services.\n` +
      `- If unsure, say "Let me check that for you" and call the right function.\n` +
      `- If a treatment isn't listed, say "We don't offer that right now, but here's what we do have..." then call get_pricing()\n` +
      `MEDICAL ADVICE — ABSOLUTE RED LINE (NEVER CROSS):\n` +
      `- You are a RECEPTIONIST, not a doctor, nurse, or medical professional.\n` +
      `- You CANNOT and WILL NOT give any medical advice, diagnosis, treatment recommendations, or clinical opinions.\n` +
      `- You CANNOT tell patients which treatment is "best" for them, what results to expect, whether a treatment is safe for their condition, or how to prepare for a procedure.\n` +
      `- If a patient asks ANY medical question (e.g., "Is Botox safe for me?", "Will this work for my skin?", "What treatment do you recommend for acne?", "Can I do laser if I'm pregnant?", "What are the side effects?"), you MUST refuse and redirect in this exact order:\n` +
      `  1. FIRST: "I'd love to help, but I'm not a medical professional — so I can't give clinical advice."\n` +
      `  2. THEN offer ONE of these two options (pick the most natural):\n` +
      `     a) "The best next step is to book a consultation with our doctor, who can assess your needs properly. Would you like me to arrange that?"\n` +
      `     b) "Would you like the clinic to give you a call? Our doctor can discuss this with you directly."\n` +
      `- WHAT YOU MAY SHARE — factual, public info from the clinic's OWN menu/FAQs only: what each treatment is and involves per its description, and factual comparisons between treatments (price, duration, what's included, how they differ per the menu text). If the menu doesn't cover it, say so and offer a consultation — never improvise clinical detail from general knowledge.\n` +
      `- STILL ABSOLUTELY FORBIDDEN — the red line stands: whether a treatment is safe, suitable, or "best" for THIS patient (their condition, pregnancy, medications); predicting results, risks, side effects, or downtime beyond what the menu states; interpreting symptoms, diagnosis, or triage — even if the patient insists.\n\n` +
      `FORMAT (WhatsApp): *bold* for treatment names and prices, • for bullet lists, short paragraphs, plain text only — no markdown headers, no [links].\n\n` +
      `BOOKING RULES:\n` +
      `- ALL bookings start as PENDING — clinic must approve. Say "request received, clinic will confirm soon"\n` +
      `- Confirm name and phone before creating any booking\n` +
      `- For cancellations: get explicit "CANCEL MY BOOKING" confirmation before proceeding\n` +
      `- Today is ${getNowSG().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} (Singapore time, GMT+8). Current day: ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][getNowSG().getDay()]}.`;

    // Build messages array
    // When conversation is recent, add a system signal to the user message
    // to reinforce "no greeting" — this works even when system prompt is long
    const userMessagePrefix = isRecent ? '[CONTINUING — NO GREETING] ' : '';
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-6).flatMap(turn => [
        { role: 'user', content: turn.user },
        { role: 'assistant', content: turn.ai || '' }
      ]),
      { role: 'user', content: userMessagePrefix + messageText }
    ];

    // Call OpenAI with function calling
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      functions: BOT_FUNCTIONS,
      function_call: 'auto',
      temperature: 0.7,
      max_tokens: 500
    });

    const response = completion.choices[0];

    // Handle function call
    if (response.message?.function_call) {
      const funcName = response.message.function_call.name;
      const funcArgs = JSON.parse(response.message.function_call.arguments);
      
      // Inject client_id so the function knows which clinic this is for
      funcArgs.client_id = clientConfig.id;
      
      // SECURITY: Override any phone-related fields with the verified sender's phone.
      // GPT MUST NOT be trusted to provide patient/customer phone numbers.
      // The only trusted source is message.from verified by the webhook handler.
      if (patientPhone) {
        const verifiedPhone = patientPhone.replace(/\D/g, ''); // normalize: +65 9123 4567 → 6591234567
        funcArgs.customer_phone = verifiedPhone;
        funcArgs.patient_phone = verifiedPhone;
        funcArgs.phone = verifiedPhone;
      }
      
      let functionResult;
      try {
        // Use the new centralized function executor (all 8 functions wired)
        functionResult = await executeFunction(funcName, funcArgs);
      } catch (err) {
        console.error(`[BOT_ENGINE] Function execution error for ${funcName}:`, err.message);
        functionResult = { success: false, error: "I had trouble with that request. Let me try a different approach." };
      }

      // STALL ALARM (v2.2.5): the booking action the patient asked for
      // FAILED — the bot will apologize vaguely; the clinic needs to know.
      if (functionResult && functionResult.success === false && STALL_ACTION_FUNCS.has(funcName)) {
        maybeAlertStall(clientConfig, patientPhone, messageText,
          `function "${funcName}" failed: ${functionResult.error || 'unknown error'}`, true);
      }

      // Send function result back to OpenAI for natural language response
      const secondCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          ...messages,
          response.message,
          {
            role: 'function',
            name: funcName,
            content: JSON.stringify(functionResult)
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const finalResponse = secondCompletion.choices[0].message.content;

      await logConversation(clientConfig.id, 'whatsapp', patientPhone, null,
        messageText, finalResponse, `generalist:${funcName}`);

      return {
        text: finalResponse + (resumePrompt || ''),
        function_called: funcName,
        function_result: functionResult,
        model: 'gpt-4o-mini'
      };
    }

    // Direct response (no function call needed)
    // STALL ALARM (v2.2.5): booking action requested, none executed.
    maybeAlertStall(clientConfig, patientPhone, messageText, 'generalist replied without taking any action');
    const directText = response.message?.content || "I'm sorry, I didn't understand that. How can I help you today?";
    await logConversation(clientConfig.id, 'whatsapp', patientPhone, null,
      messageText, directText, 'generalist:direct');
    const directFooter = withActionFooter(directText, clientConfig, [], resumePrompt);
    return {
      text: directText + (resumePrompt || ''),
      whatsappInteractive: directFooter || undefined,
      function_called: null,
      model: 'gpt-4o-mini'
    };

  } catch (err) {
    console.error('[BOT_ENGINE] === CRASH ===');
    console.error('[BOT_ENGINE] Error:', err.message);
    console.error('[BOT_ENGINE] Stack:', err.stack);
    return {
      text: "I'm having trouble right now. Please try again in a moment, or call us directly.",
      error: err.message
    };
  }
}

// ─── SECURITY: Sanitize special_notes before prompt injection ────
// Prevents prompt injection from malicious or compromised clinic signups
function sanitizeSpecialNotes(notes) {
  if (!notes) return '';
  const injectionPatterns = [
    /ignore previous instructions/gi, /ignore all (prior|previous) (instructions|rules)/gi,
    /you are now/gi, /you are no longer/gi, /new instructions?[:\s]/gi,
    /override (system|all) (prompt|instructions)/gi, /forget (everything|all|your)/gi,
    /disregard (the|all|your)/gi, /system prompt/gi, /===SYSTEM===/gi,
    /<system>/gi, /\[system\]/gi, /your new role/gi, /from now on,? you/gi,
    /do not follow/gi, /instead,? (say|respond|reply)/gi,
  ];
  let sanitized = notes;
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '[REMOVED]');
  }
  if (sanitized.length > 2000) sanitized = sanitized.substring(0, 2000) + '... [truncated]';
  return sanitized;
}

// ─── FORMATTING HELPERS ──────────────────────────────────────────

function formatTime12h(timeStr) {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDateNice(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return 'today';
  if (d.toDateString() === tomorrow.toDateString()) return 'tomorrow';
  return d.toLocaleDateString('en-SG', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ─── EXPORTS ──────────────────────────────────────────────────────

module.exports = {
  withActionFooter,
  processMessage,
  logConversation,
  resetHotLeadAlertsForTest,
  // Exported for testing (MADS gate + callback flow are exercised in
  // scripts/mads-test.js without touching the live OpenAI budget)
  madsGate,
  handleCallbackChoice,
};
