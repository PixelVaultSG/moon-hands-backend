/**
 * Moon Hands — Intent Handlers
 * Hardcoded response generators for common patient queries.
 * All responses use clinic-specific config — never generic.
 * 
 * Each handler receives: { message, clinicConfig, patientPhone, params, conversationHistory }
 * Returns: string response or null (if handler can't answer)
 * 
 * CRITICAL: clinicConfig from DB has structure { id, name, slug, config: { services, faqs, ... } }
 * Use getConfig(clinicConfig, 'services') to access — NEVER getConfig(clinicConfig, 'services') directly.
 */

const { supabase } = require('../supabase/client');

// ─── CONFIG ACCESS HELPER ────────────────────────────────────────
// clinicConfig from DB = { id, name, slug, config: { services, faqs, ... } }
// This helper handles both nested (config.services) and flat (services) formats.
function getConfig(clinicConfig, key) {
  if (!clinicConfig) return null;
  // Try nested config first (correct DB structure)
  if (clinicConfig.config && clinicConfig.config[key] !== undefined) {
    return clinicConfig.config[key];
  }
  // Fallback to flat access (legacy / direct property)
  return clinicConfig[key] !== undefined ? clinicConfig[key] : null;
}

// ─── OPENING HOURS VALIDATION ────────────────────────────────────
// Checks if a given time falls within the clinic's operating hours for a day.
// Returns { isOpen: boolean, openTime: string, closeTime: string } 
function isTimeWithinHours(timeStr, dayName, operatingHours) {
  if (!operatingHours || !Array.isArray(operatingHours)) {
    return { isOpen: true }; // Default to open if no hours configured
  }
  
  // Normalize day name
  const day = (dayName || '').toLowerCase().trim();
  const dayEntry = operatingHours.find(h => 
    h.day && h.day.toLowerCase() === day
  );
  
  if (!dayEntry || !dayEntry.isOpen) {
    return { isOpen: false, openTime: null, closeTime: null, reason: 'Closed' };
  }
  
  if (!timeStr || !dayEntry.open_time || !dayEntry.close_time) {
    return { isOpen: true, openTime: dayEntry.open_time, closeTime: dayEntry.close_time };
  }
  
  // Parse times for comparison
  const parseMin = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  
  try {
    const requestMin = parseMin(timeStr);
    const openMin = parseMin(dayEntry.open_time);
    const closeMin = parseMin(dayEntry.close_time);
    
    const isOpen = requestMin >= openMin && requestMin < closeMin;
    return { 
      isOpen, 
      openTime: dayEntry.open_time, 
      closeTime: dayEntry.close_time,
      reason: isOpen ? null : (requestMin < openMin ? 'Before opening' : 'After closing')
    };
  } catch {
    return { isOpen: true, openTime: dayEntry.open_time, closeTime: dayEntry.close_time };
  }
}

// ─── HANDLER REGISTRY ─────────────────────────────────────────────

const HANDLERS = {
  greeting: handleGreeting,
  goodbye: handleGoodbye,
  operating_hours: handleOperatingHours,
  location: handleLocation,
  pricing_specific: handlePricingSpecific,
  pricing_general: handlePricingGeneral,
  service_inquiry: handleServiceInquiry,
  service_list: handleServiceList,
  treatment_enquiry: handleServiceList,        // "What treatments do you offer?"
  treatment_info: handleServiceInquiry,         // "Tell me about Botox"
  booking_request: handleBookingRequest,
  cancel_request: handleCancelRequest,
  reschedule_request: handleRescheduleRequest,
  check_appointment: handleCheckAppointment,
  faq_prep: handleFaqPrep,
  faq_aftercare: handleFaqAftercare,
  language_switch: handleLanguageSwitch,
  human_handoff: handleHumanHandoff,
  waitlist_request: handleWaitlistRequest,
};

/**
 * Execute a handler by intent name.
 */
async function executeHandler(intentName, context) {
  const handler = HANDLERS[intentName];
  if (!handler) {
    console.log(`[HANDLER] No handler for intent: ${intentName}`);
    return null;
  }
  
  try {
    const response = await handler(context);
    if (response) {
      console.log(`[HANDLER] ${intentName} → responded`);
    }
    return response;
  } catch (err) {
    console.error(`[HANDLER] Error in ${intentName}:`, err.message);
    return null;
  }
}

// ─── GREETING ─────────────────────────────────────────────────────

function handleGreeting({ clinicConfig }) {
  const name = clinicConfig.clinic_name || clinicConfig.name || 'our clinic';
  const agentName = getConfig(clinicConfig, 'agent_name') || 'Sophia';
  
  // Build interactive list menu (always included — even with custom greeting)
  const { getWelcomeList } = require('./whatsapp-interactive');
  const welcomeList = getWelcomeList(name, agentName);
  console.log(`[HANDLER:greeting] Built welcomeList, type=${welcomeList?.type}, interactive=${welcomeList?.interactive?.type}`);
  
  // If clinic has a custom greeting, use it but still attach interactive menu
  const customGreeting = getConfig(clinicConfig, 'greeting');
  if (customGreeting) {
    const result = {
      text: customGreeting.replace(/{businessName}/g, name),
      whatsappInteractive: welcomeList
    };
    console.log(`[HANDLER:greeting] Returning object with text_len=${result.text.length}, hasInteractive=${!!result.whatsappInteractive}`);
    return result;
  }
  
  // Fallback: generate a simple greeting with interactive menu
  const treatments = getTopTreatments(clinicConfig, 3);
  const text = treatments 
    ? `Hey there! Welcome to ${name} ✨ I'm ${agentName}, your virtual receptionist. I can help you book appointments, check prices, or answer questions about our treatments like ${treatments}. What brings you in today?`
    : `Hey there! Welcome to ${name} ✨ I'm ${agentName}, your virtual receptionist. I can help you with bookings, treatment info, or pricing. What can I do for you?`;
  
  const result = { text, whatsappInteractive: welcomeList };
  console.log(`[HANDLER:greeting] Returning fallback object with hasInteractive=${!!result.whatsappInteractive}`);
  return result;
}

// ─── GOODBYE ──────────────────────────────────────────────────────

function handleGoodbye({ clinicConfig }) {
  return `You're welcome! If you need anything else, just message us here. Have a great day! 😊`;
}

// ─── OPERATING HOURS ──────────────────────────────────────────────

function handleOperatingHours({ clinicConfig }) {
  const hours = getConfig(clinicConfig, 'operating_hours');
  if (!hours) {
    return `We're open during regular business hours. Would you like me to check availability for a specific date?`;
  }
  
  // Format: "Mon-Fri 9am-6pm, Sat 9am-2pm, Sun Closed"
  return `Our operating hours are:
${formatOperatingHours(hours)}

Would you like to check available slots?`;
}

function formatOperatingHours(hours) {
  if (typeof hours === 'string') return hours;
  if (typeof hours === 'object') {
    return Object.entries(hours)
      .map(([day, time]) => `• ${day}: ${time}`)
      .join('\n');
  }
  return 'Please contact us for our hours.';
}

// ─── LOCATION ─────────────────────────────────────────────────────

function handleLocation({ clinicConfig, message }) {
  const address = clinicConfig.address;
  const landmarks = clinicConfig.landmarks;
  const parking = clinicConfig.parking_info;
  const mrt = clinicConfig.nearest_mrt;
  
  let response = '';
  
  if (address) {
    response += `We're located at:\n📍 ${address}`;
  } else {
    return `I can help you find us. Would you like our address or directions from a specific location?`;
  }
  
  if (mrt) {
    response += `\n\n🚇 Nearest MRT: ${mrt}`;
  }
  
  if (landmarks) {
    response += `\n🏢 Nearby: ${landmarks}`;
  }
  
  if (parking) {
    response += `\n🅿️ Parking: ${parking}`;
  }
  
  response += `\n\nWould you like directions from a specific location?`;
  return response;
}

// ─── PRICICING SPECIFIC ──────────────────────────────────────────

function handlePricingSpecific({ clinicConfig, params }) {
  const requestedTreatment = params?.treatment;
  const services = getConfig(clinicConfig, 'services') || [];
  
  if (!requestedTreatment) {
    return `I'd be happy to share our pricing. Which treatment are you interested in?`;
  }
  
  // Find matching service (fuzzy match)
  const match = findServiceMatch(requestedTreatment, services);
  
  if (match) {
    const price = formatPrice(match.price, match.price_unit);
    const duration = match.duration ? ` (Duration: ${match.duration})` : '';
    
    return `${match.name} is priced at ${price}${duration}.

${match.description || 'Would you like to book this treatment?'}`;
  }
  
  // No exact match — list similar treatments
  const similar = findSimilarTreatments(requestedTreatment, services, 3);
  if (similar.length > 0) {
    const list = similar.map(s => `• ${s.name}: ${formatPrice(s.price, s.price_unit)}`).join('\n');
    return `I don't have exact pricing for "${requestedTreatment}". Here are our similar treatments:\n\n${list}\n\nWould you like details on any of these?`;
  }
  
  return `I'd be happy to help with pricing for ${requestedTreatment}. Let me connect you with our team for the most accurate quote. Would you like to book a consultation?`;
}

// ─── PRICING GENERAL ─────────────────────────────────────────────

function handlePricingGeneral({ clinicConfig }) {
  const services = getConfig(clinicConfig, 'services') || [];
  const name = clinicConfig.clinic_name || clinicConfig.name || 'our clinic';
  
  if (services.length === 0) {
    return `We offer a range of treatments at ${name}. Let me know what you're interested in and I'll give you the details!`;
  }
  
  // Conversational list — no bullet points
  const treatments = services.map(s => `${s.name} (${formatPrice(s.price, s.price_unit)})`).join(', ');
  
  return `Sure thing! Here's what we offer: ${treatments}. Prices are tailored to your needs so they may vary a bit. Want me to go into detail on any of these?`;
}

// ─── SERVICE INQUIRY ─────────────────────────────────────────────

function handleServiceInquiry({ clinicConfig, params }) {
  const requestedService = params?.treatment;
  const services = getConfig(clinicConfig, 'services') || [];
  
  if (!requestedService) {
    return handleServiceList({ clinicConfig });
  }
  
  const match = findServiceMatch(requestedService, services);
  
  if (match) {
    const price = formatPrice(match.price, match.price_unit);
    const duration = match.duration ? `\n⏱ Duration: ${match.duration}` : '';
    const downtime = match.downtime ? `\n🩹 Downtime: ${match.downtime}` : '';
    
    return `Yes, we offer ${match.name}!${duration}${downtime}\n💰 Price: ${price}\n\n${match.description || ''}\n\nWould you like to book a consultation or appointment?`;
  }
  
  return `I don't see ${requestedService} in our current treatment menu. Would you like me to share what treatments we do offer?`;
}

// ─── SERVICE LIST ─────────────────────────────────────────────────

function handleServiceList({ clinicConfig }) {
  const services = getConfig(clinicConfig, 'services') || [];
  
  if (services.length === 0) {
    return `We offer a range of aesthetic treatments. Let me know what you're interested in!`;
  }
  
  // Full detailed list with price, duration, and description
  const list = services.map(s => {
    const price = s.price ? ` (${s.price}${s.price_unit ? '/' + s.price_unit : ''})` : '';
    const duration = s.duration ? ` — ${s.duration}min${s.duration > 1 ? 's' : ''}` : '';
    const desc = s.description ? `: ${s.description}` : '';
    return `• ${s.name}${price}${duration}${desc}`;
  }).join('\n');
  
  return `Here are our treatments:\n\n${list}\n\nWhich one interests you? I can share more details or help you book.`;
}

// ─── BOOKING REQUEST ──────────────────────────────────────────────

function handleBookingRequest({ clinicConfig, patientPhone, params, message }) {
  const name = clinicConfig.clinic_name || 'our clinic';
  
  // Check if they specified a treatment
  const services = getConfig(clinicConfig, 'services') || [];
  const treatmentMatch = extractTreatmentFromMessage(message);
  const matchedService = treatmentMatch ? findServiceMatch(treatmentMatch, services) : null;
  
  let response = `I'd be happy to help you book an appointment at ${name}!`;
  
  if (matchedService) {
    response += ` I see you're interested in ${matchedService.name}.`;
  }
  
  response += "\n\nTo check availability, I'll need a couple of details:\n• Preferred date (e.g., 'next Tuesday' or 'May 15')\n• Preferred time (e.g., '2pm' or 'morning')";
  if (!matchedService) {
    response += "\n• Treatment you're interested in";
  }
  
  if (clinicConfig.booking_require_phone && !patientPhone) {
    response += "\n• Your contact number";
  }
  
  response += `\n\nWhat date works for you?`;
  
  return response;
}

// ─── CANCEL REQUEST ──────────────────────────────────────────────

async function handleCancelRequest({ clinicConfig, patientPhone }) {
  if (!patientPhone) {
    return `I can help you cancel your appointment. Could you please share the phone number you used to book?`;
  }
  
  // Look up their booking
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('client_id', clinicConfig.client_id)
    .eq('customer_phone', patientPhone)
    .in('status', ['confirmed', 'pending'])
    .order('appointment_date', { ascending: true })
    .limit(5);
  
  if (error || !appointments || appointments.length === 0) {
    return `I don't see any upcoming appointments for ${patientPhone}. Could you double-check the number, or would you like me to help you book a new appointment?`;
  }
  
  if (appointments.length === 1) {
    const appt = appointments[0];
    return `I found your appointment:\n📅 ${formatDate(appt.appointment_date)} at ${formatTime(appt.appointment_time)}\n💆 ${appt.service_name || 'Treatment'}\n\nWould you like me to cancel this appointment? (Reply YES to confirm)`;
  }
  
  // Multiple appointments
  const list = appointments.map((a, i) => `${i + 1}. ${formatDate(a.appointment_date)} at ${formatTime(a.appointment_time)} — ${a.service_name || 'Treatment'}`).join('\n');
  return `I found multiple upcoming appointments:\n\n${list}\n\nWhich one would you like to cancel? (Reply with the number)`;
}

// ─── RESCHEDULE REQUEST ──────────────────────────────────────────

async function handleRescheduleRequest({ clinicConfig, patientPhone }) {
  if (!patientPhone) {
    return `I can help you reschedule. Could you please share the phone number you used to book?`;
  }
  
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('client_id', clinicConfig.client_id)
    .eq('customer_phone', patientPhone)
    .in('status', ['confirmed', 'pending'])
    .order('appointment_date', { ascending: true })
    .limit(5);
  
  if (error || !appointments || appointments.length === 0) {
    return `I don't see any upcoming appointments for ${patientPhone}. Would you like to book a new appointment?`;
  }
  
  if (appointments.length === 1) {
    const appt = appointments[0];
    return `I found your appointment:\n📅 ${formatDate(appt.appointment_date)} at ${formatTime(appt.appointment_time)}\n💆 ${appt.service_name || 'Treatment'}\n\nWhat date and time would you prefer instead?`;
  }
  
  const list = appointments.map((a, i) => `${i + 1}. ${formatDate(a.appointment_date)} at ${formatTime(a.appointment_time)} — ${a.service_name || 'Treatment'}`).join('\n');
  return `I found multiple appointments:\n\n${list}\n\nWhich one would you like to reschedule? (Reply with the number)`;
}

// ─── CHECK APPOINTMENT ───────────────────────────────────────────

async function handleCheckAppointment({ clinicConfig, patientPhone }) {
  if (!patientPhone) {
    return `I can check your appointment details. Could you please share the phone number you used to book?`;
  }
  
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('client_id', clinicConfig.client_id)
    .eq('customer_phone', patientPhone)
    .in('status', ['confirmed', 'pending'])
    .order('appointment_date', { ascending: true })
    .limit(5);
  
  if (error || !appointments || appointments.length === 0) {
    return `I don't see any upcoming appointments for ${patientPhone}. Would you like to book one?`;
  }
  
  const list = appointments.map(a => 
    `📅 ${formatDate(a.appointment_date)} at ${formatTime(a.appointment_time)}\n💆 ${a.service_name || 'Treatment'}\n📍 Status: ${a.status}${a.notes ? `\n📝 Notes: ${a.notes}` : ''}`
  ).join('\n\n');
  
  return `Here are your upcoming appointments:\n\n${list}`;
}

// ─── FAQ PREP ─────────────────────────────────────────────────────

function handleFaqPrep({ clinicConfig, params }) {
  const treatment = params?.treatment;
  const faqs = getConfig(clinicConfig, 'faqs') || {};
  
  // Check for treatment-specific prep
  if (treatment && faqs[`prep_${treatment.toLowerCase().replace(/\s+/g, '_')}`]) {
    return faqs[`prep_${treatment.toLowerCase().replace(/\s+/g, '_')}`];
  }
  
  // General prep FAQ
  if (faqs.prep_general) {
    return `${faqs.prep_general}\n\nWould you like treatment-specific preparation advice?`;
  }
  
  return `Preparation varies by treatment. Generally:\n• Avoid alcohol 24 hours before\n• Come with clean skin (no makeup)\n• Inform us of any medications or allergies\n• Arrive 10-15 minutes early\n\n${treatment ? `Would you like specific preparation for ${treatment}?` : 'Would you like to know more about a specific treatment?'}`;
}

// ─── FAQ AFTERCARE ────────────────────────────────────────────────

function handleFaqAftercare({ clinicConfig, params }) {
  const treatment = params?.treatment;
  const faqs = getConfig(clinicConfig, 'faqs') || {};
  
  if (treatment && faqs[`aftercare_${treatment.toLowerCase().replace(/\s+/g, '_')}`]) {
    return faqs[`aftercare_${treatment.toLowerCase().replace(/\s+/g, '_')}`];
  }
  
  if (faqs.aftercare_general) {
    return `${faqs.aftercare_general}\n\nIs there anything specific about your recovery you'd like to know?`;
  }
  
  return `General aftercare guidelines:\n• Avoid direct sun exposure for 48 hours\n• No strenuous exercise for 24 hours\n• Keep the area clean and moisturized\n• Follow any specific instructions from your doctor\n• Contact us if you notice any unusual reactions\n\n${treatment ? `Would you like specific aftercare for ${treatment}?` : 'Do you have a specific treatment in mind?'}`;
}

// ─── LANGUAGE SWITCH ──────────────────────────────────────────────

function handleLanguageSwitch({ clinicConfig, params }) {
  const language = params?.language || 'Chinese';
  
  const responses = {
    chinese: `我可以尝试用中文和您沟通，但我最擅长的是英文。请问您需要什么帮助？\n\n(I can try to communicate in Chinese, but I work best in English. How can I help you?)`,
    mandarin: `我可以尝试用中文和您沟通，但我最擅长的是英文。请问您需要什么帮助？`,
    malay: `Saya boleh cuba berkomunikasi dalam Bahasa Melayu, tetapi saya lebih mahir dalam Bahasa Inggeris. Bagaimana saya boleh membantu?`,
    tamil: `நான் தமிழில் தொடர்புகொள்ள முயற்சிக்கிறேன், ஆனால் எனக்கு ஆங்கிலத்தில் சிறந்தது. நான் எவ்வாறு உதவ முடியும்?`,
  };
  
  return responses[language.toLowerCase()] || `I understand you'd prefer ${language}. I'll do my best to assist you. How can I help?`;
}

// ─── HUMAN HANDOFF ────────────────────────────────────────────────

function handleHumanHandoff({ clinicConfig }) {
  const phone = clinicConfig.phone || clinicConfig.whatsapp_number;
  
  let response = `I understand you'd like to speak with our team directly.`;
  
  if (phone) {
    response += `\n\nYou can reach us at:\n📞 ${phone}`;
  }
  
  if (clinicConfig.whatsapp_number) {
    response += `\n💬 WhatsApp: ${clinicConfig.whatsapp_number}`;
  }
  
  response += `\n\nOur staff will be happy to assist you during operating hours. Is there anything else I can help with in the meantime?`;
  
  return response;
}

// ─── WAITLIST REQUEST ─────────────────────────────────────────────

function handleWaitlistRequest({ clinicConfig, patientPhone }) {
  const name = clinicConfig.clinic_name || 'our clinic';
  
  return `I'll add you to our waitlist! When a slot becomes available, we'll notify you immediately.\n\nTo proceed, I just need:\n• Your preferred date(s)\n• Treatment you're interested in\n• Best time range\n\nWhat dates work for you?`;
}

// ─── UTILITY FUNCTIONS ────────────────────────────────────────────

function findServiceMatch(query, services) {
  if (!services || services.length === 0) return null;
  
  const normalizedQuery = query.toLowerCase().trim();
  
  // Reject single-character or very short queries (prevents "b" matching)
  if (normalizedQuery.length < 3) return null;
  
  // Exact match
  let match = services.find(s => s.name.toLowerCase() === normalizedQuery);
  if (match) return match;
  
  // Contains match (query inside service name)
  match = services.find(s => s.name.toLowerCase().includes(normalizedQuery));
  if (match) return match;
  
  // Reverse contains (service name inside query)
  match = services.find(s => normalizedQuery.includes(s.name.toLowerCase()));
  if (match) return match;
  
  // Word-level partial match (each word of query vs each word of service name)
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length >= 3);
  match = services.find(s => {
    const serviceWords = s.name.toLowerCase().split(/\s+/);
    return queryWords.some(qw => serviceWords.some(sw => sw === qw || (sw.includes(qw) && qw.length >= 4)));
  });
  if (match) return match;
  
  // Typo tolerance: 4-char prefix match (e.g. "botoz" → "botox" both start with "boto")
  if (normalizedQuery.length >= 4) {
    const prefix = normalizedQuery.substring(0, 4);
    match = services.find(s => s.name.toLowerCase().startsWith(prefix));
    if (match) return match;
  }
  
  return null;
}

function findSimilarTreatments(query, services, limit = 3) {
  if (!services || services.length === 0) return [];
  
  const normalizedQuery = query.toLowerCase();
  
  return services
    .map(s => ({
      ...s,
      score: similarityScore(normalizedQuery, s.name.toLowerCase())
    }))
    .filter(s => s.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function similarityScore(a, b) {
  // Simple word overlap score
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = b.split(/\s+/);
  const overlap = wordsB.filter(w => wordsA.has(w)).length;
  return overlap / Math.max(wordsA.size, wordsB.size);
}

function formatPrice(price, unit) {
  if (!price) return 'Price on request';
  const unitStr = unit ? `/${unit}` : '';
  return `$${price}${unitStr}`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'TBD';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(timeStr) {
  if (!timeStr) return 'TBD';
  return timeStr;
}

function getTopTreatments(clinicConfig, count) {
  const services = getConfig(clinicConfig, 'services') || [];
  if (services.length === 0) return '';
  
  return services.slice(0, count).map(s => s.name).join(', ');
}

function groupServicesByCategory(services, categories) {
  const grouped = {};
  
  for (const cat of categories) {
    grouped[cat.name] = services.filter(s => s.category === cat.id || s.category === cat.name);
  }
  
  // Add "Others" for uncategorized
  const uncategorized = services.filter(s => !s.category);
  if (uncategorized.length > 0) {
    grouped['Others'] = uncategorized;
  }
  
  return grouped;
}

function extractTreatmentFromMessage(message) {
  const commonTreatments = [
    'botox', 'filler', 'facial', 'laser', 'hifu', 'thermage',
    'ultherapy', 'thread lift', 'microneedling', 'peel', 'hydrafacial',
    'pdo thread', 'rejuran', 'profhilo', 'bbl', 'ipl',
    'coolsculpting', 'emsculpt', 'thermage flx', 'ultraformer',
    'skin booster', 'dermal filler', 'lip filler', 'nose filler',
    ' jaw reduction', 'face slimming', 'double chin',
  ];
  
  const normalized = message.toLowerCase();
  for (const treatment of commonTreatments) {
    if (normalized.includes(treatment)) return treatment;
  }
  return null;
}

module.exports = { executeHandler };
