/**
 * Moon Hands — Intent Handlers
 * Hardcoded response generators for common patient queries.
 * All responses use clinic-specific config — never generic.
 * 
 * Each handler receives: { message, clinicConfig, patientPhone, params, conversationHistory }
 * Returns: string response or null (if handler can't answer)
 */

const { supabase } = require('../supabase/client');

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
  const name = clinicConfig.clinic_name || 'our clinic';
  const greeting = clinicConfig.greeting || `Hello! Welcome to ${name}.`;
  const treatments = getTopTreatments(clinicConfig, 3);
  
  return `${greeting} I can help you with:
• Booking appointments${treatments ? ` for ${treatments}` : ''}
• Treatment enquiries and pricing
• Operating hours and location

What can I help you with today?`;
}

// ─── GOODBYE ──────────────────────────────────────────────────────

function handleGoodbye({ clinicConfig }) {
  return `You're welcome! If you need anything else, just message us here. Have a great day! 😊`;
}

// ─── OPERATING HOURS ──────────────────────────────────────────────

function handleOperatingHours({ clinicConfig }) {
  const hours = clinicConfig.operating_hours;
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
  const services = clinicConfig.services || [];
  
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
  const services = clinicConfig.services || [];
  
  if (services.length === 0) {
    return `We offer competitive pricing for all our treatments. Would you like me to check pricing for a specific treatment?`;
  }
  
  // Show top 5 treatments with prices
  const topServices = services.slice(0, 5);
  const list = topServices.map(s => `• ${s.name}: ${formatPrice(s.price, s.price_unit)}`).join('\n');
  
  const more = services.length > 5 ? `\n...and ${services.length - 5} more treatments.` : '';
  
  return `Here are some of our popular treatments and prices:\n\n${list}${more}\n\nPrices may vary based on individual assessment. Would you like details on any specific treatment?`;
}

// ─── SERVICE INQUIRY ─────────────────────────────────────────────

function handleServiceInquiry({ clinicConfig, params }) {
  const requestedService = params?.treatment;
  const services = clinicConfig.services || [];
  
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
  const services = clinicConfig.services || [];
  const categories = clinicConfig.service_categories || [];
  
  if (services.length === 0) {
    return `We offer a range of aesthetic treatments. Would you like me to arrange a consultation to discuss your needs?`;
  }
  
  // Group by category if available
  if (categories.length > 0) {
    const grouped = groupServicesByCategory(services, categories);
    const lines = [];
    
    for (const [cat, svcs] of Object.entries(grouped)) {
      lines.push(`\n${cat}:`);
      svcs.slice(0, 4).forEach(s => lines.push(`  • ${s.name}`));
      if (svcs.length > 4) lines.push(`  ...and ${svcs.length - 4} more`);
    }
    
    return `Here are the treatments we offer:${lines.join('\n')}\n\nWhich treatment are you interested in? I can share pricing and help you book.`;
  }
  
  // Simple list
  const list = services.slice(0, 8).map(s => `• ${s.name}`).join('\n');
  const more = services.length > 8 ? `\n...and ${services.length - 8} more treatments.` : '';
  
  return `Here are our treatments:\n\n${list}${more}\n\nWhich one would you like to know more about?`;
}

// ─── BOOKING REQUEST ──────────────────────────────────────────────

function handleBookingRequest({ clinicConfig, patientPhone, params, message }) {
  const name = clinicConfig.clinic_name || 'our clinic';
  
  // Check if they specified a treatment
  const services = clinicConfig.services || [];
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
  const faqs = clinicConfig.faqs || {};
  
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
  const faqs = clinicConfig.faqs || {};
  
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
  
  // Exact match
  let match = services.find(s => s.name.toLowerCase() === normalizedQuery);
  if (match) return match;
  
  // Contains match
  match = services.find(s => s.name.toLowerCase().includes(normalizedQuery));
  if (match) return match;
  
  // Reverse contains
  match = services.find(s => normalizedQuery.includes(s.name.toLowerCase()));
  if (match) return match;
  
  // Word-level partial match
  const queryWords = normalizedQuery.split(/\s+/);
  match = services.find(s => {
    const serviceWords = s.name.toLowerCase().split(/\s+/);
    return queryWords.some(qw => serviceWords.some(sw => sw.includes(qw) && qw.length > 2));
  });
  
  return match || null;
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
  const services = clinicConfig.services || [];
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
