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
    
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      googleCalendarId: data.google_calendar_id,
      config: data.client_configs || {}
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
    if (clientConfig.config.booking_waitlist_enabled) {
      return {
        available: false,
        message: `${result.reason || "No slots available for that date."}\n\nWould you like me to add you to our waitlist? I'll notify you as soon as a slot opens up.`,
        suggest_waitlist: true
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
        clinicId: clientConfig.id,
        message: 'Patient cancelled via WhatsApp'
      });
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

async function logConversation(clientId, channel, customerPhone, customerName, message, aiResponse, intent) {
  try {
    await db.supabase.from('conversations').insert({
      client_id: clientId,
      channel,
      customer_phone: customerPhone,
      customer_name: customerName,
      message,
      ai_response: aiResponse,
      intent
    });
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

async function processMessage(messageText, clientId, conversationHistory = [], patientPhone = null) {
  const startTime = Date.now();
  try {
    const clientConfig = await loadClientConfig(clientId);
    
    // ─── SMART ROUTER: Try hardcoded responses first ($0) ───────────
    // ~60-70% of common queries (hours, pricing, services, greetings)
    // are answered without calling OpenAI, saving ~$2-4 per clinic per month.
    const routerResult = await routeMessage(messageText, clientConfig, patientPhone, conversationHistory);
    
    if (routerResult.source === 'hardcoded' && routerResult.text) {
      // Log the hardcoded response for analytics
      await logConversation(clientConfig.id, 'whatsapp', patientPhone, null,
        messageText, routerResult.text, `hardcoded:${routerResult.intents.join(',')}`);
      
      console.log(`[BOT_ENGINE] Smart router: ${routerResult.intents.join(',')} — cost saved: $${routerResult.cost_saved.toFixed(4)}`);
      
      return {
        text: routerResult.text,
        function_called: null,
        model: 'hardcoded',
        cost_saved: routerResult.cost_saved,
        intents: routerResult.intents,
        latency_ms: routerResult.latency_ms
      };
    }
    
    console.log(`[BOT_ENGINE] Smart router → Expert System (intents: ${routerResult.intents.join(',') || 'none'})`);
    
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
        await logConversation(clientConfig.id, 'whatsapp', patientPhone, null,
          messageText, expertResult.text, `experts:${expertResult.expertsUsed.join(',')}`);
        
        console.log(`[BOT_ENGINE] Experts: [${expertResult.expertsUsed.join(', ')}] — cost: $${expertResult.totalCost.toFixed(4)}`);
        
        return {
          text: expertResult.text,
          function_called: expertResult.functionCall,
          model: 'gpt-4o-mini-experts',
          experts_used: expertResult.expertsUsed,
          total_cost: expertResult.totalCost,
          latency_ms: Date.now() - startTime
        };
      }
    } catch (expertErr) {
      console.error(`[BOT_ENGINE] Expert system failed, falling back to generalist:`, expertErr.message);
    }
    
    // ─── FALLBACK: Generalist OpenAI (if experts fail) ─────────────
    console.log(`[BOT_ENGINE] Expert system → Generalist fallback`);
    
    // Build system prompt
    const services = (clientConfig.config.services || []).map(s => `${s.name} (${s.price}, ${s.duration}min): ${s.description}`).join('\n');
    const hours = (clientConfig.config.operating_hours || []).filter(h => h.isOpen).map(h => `${h.day}: ${h.open_time} - ${h.close_time}`).join(', ');
    const faqs = (clientConfig.config.faqs || []).map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');

    // Load relevant project knowledge from episodic memory
    const memoryContext = memory.getContext(messageText, 2);

    const systemPrompt = `You are ${clientConfig.config.agent_name || 'Sophia'}, the AI receptionist for ${clientConfig.name}.\n\n` +
      `${memoryContext}\n\n` +
      `TONE: ${clientConfig.config.tone || 'friendly'}\n` +
      `GREETING: ${(clientConfig.config.greeting || 'Hello! Welcome to {businessName}.').replace('{businessName}', clientConfig.name)}\n\n` +
      `SERVICES:\n${services || 'Contact clinic for services'}\n\n` +
      `OPERATING HOURS: ${hours || 'Please contact us for hours'}\n\n` +
      `${faqs ? `FAQs:\n${faqs}\n\n` : ''}` +
      `${clientConfig.config.special_notes ? `SPECIAL INSTRUCTIONS: ${sanitizeSpecialNotes(clientConfig.config.special_notes)}\n\n` : ''}` +
      `HONESTY & ACCURACY RULES (follow strictly):\n` +
      `1. UNCERTAINTY - If you are not fully certain about a fact, say so clearly. Use phrases like "I'm not certain, but..." or "I'd recommend confirming this with us directly." Never state uncertain things as facts.\n` +
      `2. FACTS - Only use pricing, treatment descriptions, and policies from the clinic config above. Never invent prices, services, or details not listed. If asked about something not in our services, say "We don't currently offer that treatment, but I'd be happy to tell you about what we do have."\n` +
      `3. STATISTICS & NUMBERS - If asked about success rates, clinical data, or how many patients we've treated, only use numbers from the clinic config. If no data is provided, say "I don't have those specific statistics on hand" — never guess or make up numbers.\n` +
      `4. MEDICAL CLAIMS - Never present general knowledge as specific clinic policy. If asked "Is Botox safe?", say "All our injectable treatments are performed by certified doctors using approved products. A consultation will determine if it's suitable for you." — never make absolute medical claims.\n` +
      `5. DOCTOR QUOTES - Never attribute advice to a specific doctor by name unless explicitly listed in the clinic config. If asked "What did Dr. Chen say about X?", say "I don't have specific doctor notes on that. I'd recommend speaking with them during your consultation."\n\n` +
      `BOOKING RULES:\n` +
      `- ALL bookings start as PENDING — the clinic MUST approve every booking. Never tell the patient a booking is "confirmed" until the clinic has approved it. Always say "request received, clinic will confirm."\n` +
      `- Always confirm patient name and phone before creating a booking.\n` +
      `- Before cancelling ANY booking, you MUST get explicit confirmation from the patient. Do NOT call cancel_booking() on the first mention. Instead, say: "I can help you cancel your booking. To confirm, please reply with the exact words: CANCEL MY BOOKING" — only then call the function. If the patient says anything else ("yes", "ok", "do it"), ask again for the exact phrase.\n` +
      `- If patient mentions cancelling but is vague ("I might cancel", "thinking of cancelling"), ask for clarification before proceeding.\n` +
      `- If patient has multiple upcoming bookings, list them and ask which one to cancel.\n` +
      `- Never give medical advice. Always recommend consultation for treatment-specific questions.\n` +
      `- Keep responses warm, professional, and concise.\n` +
      `- Speak in the language the patient uses.\n` +
      `- Today is ${new Date().toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore' })} (Singapore time).`;

    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-6).flatMap(turn => [
        { role: 'user', content: turn.user },
        { role: 'assistant', content: turn.ai || '' }
      ]),
      { role: 'user', content: messageText }
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
      
      return {
        text: finalResponse,
        function_called: funcName,
        function_result: functionResult,
        model: 'gpt-4o-mini'
      };
    }

    // Direct response (no function call needed)
    return {
      text: response.message?.content || "I'm sorry, I didn't understand that. How can I help you today?",
      function_called: null,
      model: 'gpt-4o-mini'
    };

  } catch (err) {
    console.error('[BOT_ENGINE] Error:', err.message);
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

// ─── EXPORTS ──────────────────────────────────────────────────────

module.exports = {
  processMessage,
  logConversation,
};
