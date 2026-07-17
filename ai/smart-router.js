/**
 * Moon Hands — Smart Router v2
 * 
 * Multi-intent aware, stateful conversation routing.
 * 
 * Flow:
 *   1. Check conversation state (are we in a booking flow? awaiting confirmation?)
 *   2. Extract intents from message (supports multi-intent)
 *   3. If multi-intent detected → ask for confirmation
 *   4. If in booking flow → extract fields, progress state machine
 *   5. If single simple intent → hardcoded handler
 *   6. If complex → OpenAI function calling
 */

const { matchIntents } = require('./intent-matcher');
const { executeHandler } = require('./intent-handlers');
const {
  BOOKING_STATES,
  getState,
  setState,
  resetIdle,
  extractBookingFields,
  isConfirmation,
  isDenial,
} = require('./conversation-state');

// Intents that ALWAYS go to OpenAI
const AI_ONLY_INTENTS = ['complaint', 'vague_question', 'emotional_support'];

// Booking-related intents
// NOTE: 'booking_request' from intent-matcher.js MUST be included here
// or the booking state machine is never entered for "Can I make a booking?"
const BOOKING_INTENTS = ['book_appointment', 'booking_request', 'check_availability', 'reschedule'];

/**
 * Main entry point
 */
async function routeMessage(message, clinicConfig, patientPhone = null, conversationHistory = []) {
  const startTime = Date.now();
  const phone = patientPhone || 'unknown';
  
  // ── STEP 1: Check conversation state ────────────────────────────
  const currentState = getState(phone);
  
  // ── CRITICAL ORDER: Booking state BEFORE multi-intent confirm ──
  // The multi-intent confirm handler calls resetIdle() in its else branch,
  // which would destroy all collected booking data (date, time, treatment).
  // Booking states must be checked first to preserve the state machine.
  
  // Handle booking flow states
  if (isBookingState(currentState.state)) {
    return await handleBookingFlow(message, clinicConfig, patientPhone, currentState, conversationHistory, startTime);
  }
  
  // Handle multi-intent confirmation state
  if (currentState.state === BOOKING_STATES.MULTI_INTENT_CONFIRM) {
    if (isConfirmation(message)) {
      // User confirmed — execute each pending intent
      const pendingIntents = currentState.data.pendingIntents || [];
      resetIdle(phone);
      return await executeMultiIntents(pendingIntents, message, clinicConfig, patientPhone, conversationHistory, startTime);
    } else if (isDenial(message)) {
      resetIdle(phone);
      return { text: "No worries! What can I help you with?", source: 'hardcoded', cost_saved: 1 };
    } else {
      // User said something else — treat as new message
      resetIdle(phone);
      // Fall through to normal processing
    }
  }
  
  // ── STEP 1b: Check conversation freshness (1-hour inactivity rule) ──
  // Greeting only fires if: (a) first ever message, OR (b) last message >1hr ago
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const now = Date.now();
  let lastMessageTime = 0;
  if (conversationHistory.length > 0) {
    // conversationHistory items may have a 'timestamp' or we use current time
    lastMessageTime = conversationHistory[conversationHistory.length - 1].timestamp || now;
  }
  const timeSinceLastMessage = now - lastMessageTime;
  const isFirstContact = conversationHistory.length === 0;
  const isRecentConversation = !isFirstContact && timeSinceLastMessage < ONE_HOUR_MS;
  const shouldGreet = isFirstContact || (!isRecentConversation && timeSinceLastMessage >= ONE_HOUR_MS);
  
  if (!isFirstContact) {
    console.log(`[SMART_ROUTER] Conversation gap: ${Math.round(timeSinceLastMessage / 1000)}s (${isRecentConversation ? 'recent' : 'stale'}). Greeting: ${shouldGreet ? 'YES' : 'NO'}`);
  }
  
  // ── STEP 2: Detect intents ──────────────────────────────────────
  const matchedIntents = matchIntents(message, conversationHistory, shouldGreet);
  
  // ── STEP 3: Multi-intent handling ───────────────────────────────
  // Only trigger multi-intent confirmation when 2+ HIGH-confidence
  // (>=0.85) intents match. Prevents "What services do you offer?"
  // from being treated as multi-intent (service_list + service_inquiry).
  const confidentIntents = matchedIntents.filter(m => m.confidence >= 0.85);
  
  // Require at least 2 high-confidence AND they must be different
  // substantive intents (not e.g. greeting + booking)
  const SUBSTANTIVE_INTENTS = ['booking_request', 'pricing_specific', 'pricing_general',
    'service_inquiry', 'service_list', 'treatment_enquiry', 'treatment_info',
    'operating_hours', 'location', 'check_appointment'];
  const substantiveMatches = confidentIntents.filter(m => SUBSTANTIVE_INTENTS.includes(m.intent));
  
  if (substantiveMatches.length >= 2) {
    return await handleMultiIntentConfirmation(substantiveMatches, message, clinicConfig, patientPhone);
  }
  
  // ── STEP 4: Single intent routing ───────────────────────────────
  const primaryIntent = confidentIntents[0];
  
  // If no intent matched, send to OpenAI
  if (!primaryIntent) {
    return await routeToOpenAI(message, clinicConfig, conversationHistory, [], startTime);
  }
  
  // Check if this should go to OpenAI
  if (AI_ONLY_INTENTS.includes(primaryIntent.intent) || primaryIntent.confidence < 0.7) {
    // BEFORE sending to OpenAI: check if message contains booking fields
    // (date + time or date + treatment) even without explicit booking words
    // e.g., "Next Tue at 9pm for both treatments" → should start booking flow
    const fields = extractBookingFields(message);
    if (fields.date && (fields.time || fields.treatment)) {
      console.log(`[SMART_ROUTER] Message has booking fields (date+${fields.time ? 'time' : 'treatment'}) but intent was '${primaryIntent.intent}' — routing to booking flow`);
      return await startBookingFlow(message, clinicConfig, patientPhone, conversationHistory, startTime);
    }
    return await routeToOpenAI(message, clinicConfig, conversationHistory, matchedIntents, startTime);
  }
  
  // Booking intents → start booking flow
  if (BOOKING_INTENTS.includes(primaryIntent.intent)) {
    return await startBookingFlow(message, clinicConfig, patientPhone, conversationHistory, startTime);
  }
  
  // ── STEP 4b: Handle context-dependent intents ───────────────────
  // These require looking at conversation history to determine meaning
  
  if (primaryIntent.intent === 'confirmation_yes') {
    const contextResponse = handleConfirmationYes(message, clinicConfig, patientPhone, conversationHistory, startTime);
    if (contextResponse) return contextResponse;
  }
  
  if (primaryIntent.intent === 'confirmation_no') {
    const contextResponse = handleConfirmationNo(message, clinicConfig, patientPhone, conversationHistory, startTime);
    if (contextResponse) return contextResponse;
  }
  
  if (primaryIntent.intent === 'clarification') {
    const contextResponse = handleClarification(message, clinicConfig, patientPhone, conversationHistory, startTime);
    if (contextResponse) return contextResponse;
  }

  // ── STEP 4c: Handle context-dependent replies (both, address, directions) ──
  const contextReplyResponse = handleContextReply(message, clinicConfig, patientPhone, conversationHistory, startTime);
  if (contextReplyResponse) return contextReplyResponse;

  // ── STEP 5: Hardcoded handler ───────────────────────────────────
  try {
    const response = await executeHandler(primaryIntent.intent, {
      message,
      clinicConfig,
      patientPhone,
      params: primaryIntent.params,
      conversationHistory
    });
    
    if (response) {
      // Check if the response offers booking assistance — if so, set BOOKING_OFFERED state
      // so a subsequent "Yes" from the patient enters the booking flow instead of resetting
      const bookingOfferPhrases = [
        'would you like me to assist you with booking',
        'would you like to book',
        'would you like me to help you book',
        'shall i help you book',
        'would you like to schedule',
        'would you like me to check availability',
        'would you like to make a booking'
      ];
      const lowerResponse = response.toLowerCase();
      if (bookingOfferPhrases.some(phrase => lowerResponse.includes(phrase))) {
        // Extract any booking data from the conversation that we might need
        const existingData = getState(patientPhone).data || {};
        setState(patientPhone, BOOKING_STATES.BOOKING_OFFERED, existingData);
        console.log(`[SMART_ROUTER] Set BOOKING_OFFERED state for ${patientPhone.slice(-4)} (response contained booking offer)`);
      }
      
      return {
        text: response,
        source: 'hardcoded',
        intents: [primaryIntent.intent],
        cost_saved: 1,
        latency_ms: Date.now() - startTime
      };
    }
  } catch (err) {
    console.error(`[SMART_ROUTER] Handler error for ${primaryIntent.intent}:`, err.message);
  }
  
  // Fallback to OpenAI if hardcoded handler fails
  return await routeToOpenAI(message, clinicConfig, conversationHistory, matchedIntents, startTime);
}

// ─── CONTEXT-DEPENDENT INTENT HANDLERS ───────────────────────────

function handleConfirmationYes(message, clinicConfig, patientPhone, conversationHistory, startTime) {
  // Look at the LAST AI message to understand what the user is confirming
  if (!conversationHistory || conversationHistory.length === 0) return null;
  
  const lastAiMessage = conversationHistory[conversationHistory.length - 1]?.ai?.toLowerCase() || '';
  
  // Check what the bot last asked/offered
  const isBookingOffer = lastAiMessage.includes('book') || lastAiMessage.includes('appointment') || lastAiMessage.includes('schedule');
  const isServiceOffer = lastAiMessage.includes('treatment') || lastAiMessage.includes('service') || lastAiMessage.includes('offer');
  const isPricingOffer = lastAiMessage.includes('price') || lastAiMessage.includes('cost');
  const isDateAsked = lastAiMessage.includes('what date') || lastAiMessage.includes('when') || lastAiMessage.includes('what day');
  
  if (isDateAsked || isBookingOffer) {
    // Start the booking flow
    return startBookingFlow(clinicConfig, patientPhone, message, startTime);
  }
  
  if (isServiceOffer) {
    // Show full detailed service list
    const services = clinicConfig.config?.services || [];
    const serviceList = services.map(s => {
      const price = s.price ? ` (${s.price}${s.price_unit ? '/' + s.price_unit : ''})` : '';
      const duration = s.duration ? ` — ${s.duration}min${s.duration > 1 ? 's' : ''}` : '';
      const desc = s.description ? `: ${s.description}` : '';
      return `• ${s.name}${price}${duration}${desc}`;
    }).join('\n');
    return {
      text: `Here are our treatments:\n${serviceList}\n\nWhich one interests you?`,
      source: 'hardcoded',
      intents: ['confirmation_yes'],
      cost_saved: 1,
      latency_ms: Date.now() - startTime
    };
  }
  
  if (isPricingOffer) {
    const services = clinicConfig.config?.services || [];
    const serviceList = services.map(s => {
      const price = s.price ? ` (${s.price}${s.price_unit ? '/' + s.price_unit : ''})` : '';
      const duration = s.duration ? ` — ${s.duration}min${s.duration > 1 ? 's' : ''}` : '';
      const desc = s.description ? `: ${s.description}` : '';
      return `• ${s.name}${price}${duration}${desc}`;
    }).join('\n');
    return {
      text: `Sure! Here's our pricing:\n${serviceList}`,
      source: 'hardcoded',
      intents: ['confirmation_yes'],
      cost_saved: 1,
      latency_ms: Date.now() - startTime
    };
  }
  
  // Default: generic positive acknowledgment
  return {
    text: "Great! What can I help you with?",
    source: 'hardcoded',
    intents: ['confirmation_yes'],
    cost_saved: 1,
    latency_ms: Date.now() - startTime
  };
}

function handleConfirmationNo(message, clinicConfig, patientPhone, conversationHistory, startTime) {
  return {
    text: "No problem! Let me know if you need anything else.",
    source: 'hardcoded',
    intents: ['confirmation_no'],
    cost_saved: 1,
    latency_ms: Date.now() - startTime
  };
}

function handleClarification(message, clinicConfig, patientPhone, conversationHistory, startTime) {
  // "Such as?", "Like what?" — show the full detailed service list
  const services = clinicConfig.config?.services || [];
  if (services.length === 0) return null;
  
  const serviceList = services.map(s => {
    const price = s.price ? ` (${s.price}${s.price_unit ? '/' + s.price_unit : ''})` : '';
    const duration = s.duration ? ` — ${s.duration}min${s.duration > 1 ? 's' : ''}` : '';
    const desc = s.description ? `: ${s.description}` : '';
    return `• ${s.name}${price}${duration}${desc}`;
  }).join('\n');
  
  return {
    text: `Here are all our treatments:\n${serviceList}\n\nWhich one would you like to know more about?`,
    source: 'hardcoded',
    intents: ['clarification'],
    cost_saved: 1,
    latency_ms: Date.now() - startTime
  };
}

/**
 * Handle context-dependent replies that aren't clear intents:
 * "both" → when bot asked "address or directions?"
 * "address" / "directions" → when bot asked "address or directions?"
 * These short replies only make sense in the context of the previous AI message.
 */
function handleContextReply(message, clinicConfig, patientPhone, conversationHistory, startTime) {
  if (!conversationHistory || conversationHistory.length === 0) return null;
  
  const lower = message.toLowerCase().trim();
  const lastAiMessage = conversationHistory[conversationHistory.length - 1]?.ai?.toLowerCase() || '';
  
  // Check if last AI message was about location (address/directions)
  const isLocationContext = lastAiMessage.includes('address') && lastAiMessage.includes('direction');
  if (!isLocationContext) return null;
  
  const address = clinicConfig.config?.address || clinicConfig.address;
  const location = clinicConfig.config?.location || clinicConfig.location;
  const actualAddress = address || location;
  const nearestMrt = clinicConfig.config?.nearest_mrt || clinicConfig.nearest_mrt;
  const landmarks = clinicConfig.config?.landmarks || clinicConfig.landmarks;
  const parking = clinicConfig.config?.parking_info || clinicConfig.parking_info;
  
  let response = '';
  
  // "Both" → provide both address and directions info
  if (lower === 'both' || lower.includes('both your') || lower.includes('both the')) {
    if (actualAddress) {
      response = `📍 Address: ${actualAddress}`;
      if (nearestMrt) response += `\n\n🚇 Nearest MRT: ${nearestMrt}`;
      if (landmarks) response += `\n🏢 Nearby: ${landmarks}`;
      if (parking) response += `\n🅿️ Parking: ${parking}`;
      response += `\n\n🗺️ For directions, you can search "${clinicConfig.name || 'our clinic'}" on Google Maps. We're happy to provide more specific directions if you let us know where you're coming from!`;
    } else {
      response = `I'd be happy to help you find us! Could you let me know what area you're coming from so I can give you the best directions?`;
    }
  }
  // "Address" → provide just the address
  else if (lower === 'address' || lower === 'the address') {
    if (actualAddress) {
      response = `📍 Our address: ${actualAddress}`;
      if (nearestMrt) response += `\n🚇 Nearest MRT: ${nearestMrt}`;
      if (landmarks) response += `\n🏢 Nearby: ${landmarks}`;
      response += `\n\nNeed directions to get here?`;
    } else {
      response = `I'd be happy to help! Could you let me know what area you're coming from so I can give you the best directions?`;
    }
  }
  // "Directions" → provide directions guidance
  else if (lower === 'directions' || lower === 'the directions') {
    if (actualAddress) {
      response = `🗺️ You can search "${clinicConfig.name || 'our clinic'}" on Google Maps for turn-by-turn directions.\n\n📍 Address: ${actualAddress}`;
      if (nearestMrt) response += `\n🚇 Nearest MRT: ${nearestMrt}`;
      if (parking) response += `\n🅿️ Parking: ${parking}`;
      response += `\n\nIf you tell me where you're coming from, I can give you more specific directions!`;
    } else {
      response = `I'd be happy to help with directions! Could you let me know where you're coming from?`;
    }
  }
  
  if (response) {
    return {
      text: response,
      source: 'hardcoded',
      intents: ['context_reply'],
      cost_saved: 1,
      latency_ms: Date.now() - startTime
    };
  }
  
  return null;
}

// ─── MULTI-INTENT CONFIRMATION ───────────────────────────────────

async function handleMultiIntentConfirmation(intents, message, clinicConfig, patientPhone) {
  // Store pending intents
  setState(patientPhone || 'unknown', BOOKING_STATES.MULTI_INTENT_CONFIRM, {
    pendingIntents: intents.map(i => i.intent),
    originalMessage: message
  });
  
  // Build natural confirmation message
  const intentDescriptions = intents.map((m, i) => {
    const num = i + 1;
    switch (m.intent) {
      case 'book_appointment': return `${num}) a booking request`;
      case 'check_availability': return `${num}) a slot availability check`;
      case 'pricing_general': return `${num}) pricing information`;
      case 'pricing_specific': return `${num}) pricing for ${m.params?.treatment || 'a specific treatment'}`;
      case 'treatment_enquiry': return `${num}) information about ${m.params?.treatment || 'a treatment'}`;
      case 'operating_hours': return `${num}) our operating hours`;
      case 'location': return `${num}) our location`;
      case 'cancel_booking': return `${num}) a booking cancellation`;
      case 'greeting': return `${num}) a greeting (hi there!)`;
      default: return `${num}) ${m.intent.replace(/_/g, ' ')}`;
    }
  });
  
  const confirmText = `I see that you have ${(intentDescriptions || []).join(' and ')}. Is that accurate? Anything else you'd like to ask before I provide information on those? Just reply "yes" to confirm, or let me know what else you need!`;
  
  return {
    text: confirmText,
    source: 'hardcoded',
    intents: intents.map(i => i.intent),
    cost_saved: 1,
    latency_ms: 0
  };
}

async function executeMultiIntents(intents, message, clinicConfig, patientPhone, conversationHistory, startTime) {
  // Execute each intent and combine responses
  const responses = [];
  
  for (const intentName of intents) {
    try {
      // Skip greeting in multi-intent (just handle the substantive requests)
      if (intentName === 'greeting') continue;
      
      const response = await executeHandler(intentName, {
        message,
        clinicConfig,
        patientPhone,
        params: {},
        conversationHistory
      });
      if (response) responses.push(response);
    } catch (err) {
      console.error(`[MULTI_INTENT] Handler error for ${intentName}:`, err.message);
    }
  }
  
  if (responses.length === 0) {
    return await routeToOpenAI(message, clinicConfig, conversationHistory, intents.map(i => ({ intent: i })), startTime);
  }
  
  if (responses.length === 1) {
    return {
      text: responses[0],
      source: 'hardcoded',
      intents,
      cost_saved: 1,
      latency_ms: Date.now() - startTime
    };
  }
  
  // Combine multiple responses naturally
  const combined = combineResponses(responses);
  return {
    text: combined,
    source: 'hardcoded',
    intents,
    cost_saved: 1,
    latency_ms: Date.now() - startTime
  };
}

function combineResponses(responses) {
  if (responses.length === 2) {
    return `${responses[0]}\n\nAlso, ${responses[1].toLowerCase()}`;
  }
  const last = responses.pop();
  const joined = (responses || []).join('. ');
  return `${joined}. And ${last.toLowerCase()}`;
}

// ─── BOOKING STATE MACHINE ───────────────────────────────────────

function isBookingState(state) {
  return [
    BOOKING_STATES.BOOKING_OFFERED,
    BOOKING_STATES.AWAITING_DATE,
    BOOKING_STATES.AWAITING_TIME,
    BOOKING_STATES.AWAITING_TREATMENT,
    BOOKING_STATES.AWAITING_NAME,
    BOOKING_STATES.AWAITING_PHONE,
    BOOKING_STATES.AWAITING_CONFIRMATION,
    BOOKING_STATES.READY_TO_BOOK,
  ].includes(state);
}

async function startBookingFlow(message, clinicConfig, patientPhone, conversationHistory, startTime) {
  // Try to extract all booking fields from the initial message
  const fields = extractBookingFields(message);
  
  if (fields.date && fields.time && fields.treatment) {
    // All fields provided in first message!
    return await attemptBooking(clinicConfig, patientPhone, fields, conversationHistory, startTime);
  }
  
  // Start state machine
  if (fields.date) {
    if (fields.time) {
      setState(patientPhone, BOOKING_STATES.AWAITING_TREATMENT, { date: fields.date, time: fields.time });
      return { text: `Great, ${fields.date} at ${fields.time} works. Which treatment are you looking for?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
    }
    setState(patientPhone, BOOKING_STATES.AWAITING_TIME, { date: fields.date });
    return { text: `${fields.date} noted ✓ What time would you prefer?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
  }
  
  if (fields.time) {
    setState(patientPhone, BOOKING_STATES.AWAITING_DATE, { time: fields.time });
    return { text: `${fields.time} works. Which date would you like?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
  }
  
  if (fields.treatment) {
    const treatmentsArr = fields.treatments || [fields.treatment];
    setState(patientPhone, BOOKING_STATES.AWAITING_DATE, { treatment: fields.treatment, treatments: treatmentsArr });
    return { text: `${fields.treatment} — lovely choice! Which date works for you?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
  }
  
  // No fields extracted — ask for date
  setState(patientPhone, BOOKING_STATES.AWAITING_DATE, {});
  return { text: "Sure! What date works for you? (e.g., 'next Tuesday' or 'July 15')", source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
}

// ─── OPENING HOURS VALIDATION ────────────────────────────────────
// Returns { isOpen, openTime, closeTime, reason } for a given date+time
function validateBookingTime(dateStr, timeStr, operatingHours) {
  if (!operatingHours || !Array.isArray(operatingHours) || !dateStr) {
    return { isOpen: true }; // No hours configured = allow all
  }
  
  // Get day of week from date string (YYYY-MM-DD)
  // CRITICAL FIX: Parse in local timezone to avoid UTC day-shift bug.
  // new Date('2026-07-20T00:00:00+08:00').getDay() returns Sunday (UTC)
  // when the actual day is Monday. Using Date(y, m-1, d) avoids this.
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Public Holidays'];
  const dayName = dayNames[date.getDay()];
  
  // Find operating hours for this day
  let dayEntry = operatingHours.find(h => h.day === dayName);
  
  // Fallback to generic "Public Holidays" if no specific entry
  if (!dayEntry && date.getDay() === 0) { // Sunday
    dayEntry = operatingHours.find(h => h.day === 'Sunday');
  }
  if (!dayEntry) {
    return { isOpen: true };
  }
  
  if (!dayEntry.isOpen) {
    return { isOpen: false, openTime: null, closeTime: null, reason: `${dayName}s we're closed` };
  }
  
  if (!timeStr || !dayEntry.open_time || !dayEntry.close_time) {
    return { isOpen: true, openTime: dayEntry.open_time, closeTime: dayEntry.close_time };
  }
  
  // Parse times
  const toMin = (t) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
  try {
    const reqMin = toMin(timeStr);
    const openMin = toMin(dayEntry.open_time);
    const closeMin = toMin(dayEntry.close_time);
    const isOpen = reqMin >= openMin && reqMin < closeMin;
    return {
      isOpen,
      openTime: dayEntry.open_time,
      closeTime: dayEntry.close_time,
      reason: isOpen ? null : (reqMin < openMin ? `We open at ${dayEntry.open_time}` : `We close at ${dayEntry.close_time}`)
    };
  } catch {
    return { isOpen: true, openTime: dayEntry.open_time, closeTime: dayEntry.close_time };
  }
}

async function handleBookingFlow(message, clinicConfig, patientPhone, currentState, conversationHistory, startTime) {
  const fields = extractBookingFields(message);
  const data = { ...currentState.data, ...fields };
  const hours = clinicConfig.config?.operating_hours || clinicConfig.operating_hours || [];
  
  // Check if user wants to cancel the booking flow
  const cancelWords = ['cancel', 'never mind', 'nevermind', 'stop', 'forget it', 'go back'];
  if (cancelWords.some(w => message.toLowerCase().includes(w))) {
    resetIdle(patientPhone);
    return { text: "No problem! Let me know if you need anything else.", source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
  }
  
  switch (currentState.state) {
    case BOOKING_STATES.BOOKING_OFFERED:
      // Bot offered to help with booking ("Would you like me to assist with booking?")
      // Patient replied — check if Yes or No
      if (isConfirmation(message)) {
        // Patient confirmed — start booking flow, preserve any data from offer
        const offerData = currentState.data || {};
        if (offerData.date && offerData.time && offerData.treatment) {
          // All fields already collected! Show confirmation summary
          return await attemptBooking(clinicConfig, patientPhone, offerData, conversationHistory, startTime);
        }
        if (offerData.date) {
          setState(patientPhone, BOOKING_STATES.AWAITING_TIME, { date: offerData.date, treatment: offerData.treatment });
          return { text: `Great! ${offerData.date} noted. What time works for you?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
        }
        if (offerData.treatment) {
          setState(patientPhone, BOOKING_STATES.AWAITING_DATE, { treatment: offerData.treatment });
          return { text: `Perfect! What date works for your ${offerData.treatment} appointment?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
        }
        setState(patientPhone, BOOKING_STATES.AWAITING_DATE, {});
        return { text: `Excellent! What date works for you? (e.g., 'next Tuesday' or 'July 15')`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      } else if (isDenial(message)) {
        resetIdle(patientPhone);
        return { text: `No problem! Feel free to ask about our treatments, pricing, or anything else.`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      } else {
        // Patient said something else (not Yes/No) — e.g. "How about Tuesday at 3pm?"
        // CRITICAL: Preserve existing offer data (date, time, treatment) and merge with new input
        const offerData = currentState.data || {};
        const newFields = extractBookingFields(message);
        const merged = {
          date: newFields.date || offerData.date,
          time: newFields.time || offerData.time,
          treatment: newFields.treatment || offerData.treatment,
          treatments: newFields.treatments || offerData.treatments || (offerData.treatment ? [offerData.treatment] : []),
          name: newFields.name || offerData.name,
          phone: newFields.phone || offerData.phone,
        };
        // If we now have all required fields, go straight to booking
        if (merged.date && merged.time && merged.treatment) {
          return await attemptBooking(clinicConfig, patientPhone, merged, conversationHistory, startTime);
        }
        // If we have partial fields, advance to the appropriate state
        if (merged.date && merged.time) {
          setState(patientPhone, BOOKING_STATES.AWAITING_TREATMENT, { date: merged.date, time: merged.time });
          return { text: `${merged.date} at ${merged.time} works! Which treatment would you like?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
        }
        if (merged.date) {
          setState(patientPhone, BOOKING_STATES.AWAITING_TIME, { date: merged.date, treatment: merged.treatment });
          const treatmentNote = merged.treatment ? ` for ${merged.treatment}` : '';
          return { text: `${merged.date} noted${treatmentNote}. What time works for you?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
        }
        if (merged.time) {
          setState(patientPhone, BOOKING_STATES.AWAITING_DATE, { time: merged.time, treatment: merged.treatment });
          return { text: `${merged.time} works. Which date would you like?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
        }
        // Nothing useful extracted — ask for date but preserve treatment if we have it
        setState(patientPhone, BOOKING_STATES.AWAITING_DATE, { treatment: merged.treatment });
        const treatmentNote = merged.treatment ? ` for ${merged.treatment}` : '';
        return { text: `What date works for you${treatmentNote}? (e.g., 'next Tuesday' or 'July 15')`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      }
    
    case BOOKING_STATES.AWAITING_DATE:
      if (!data.date) {
        return { text: "Sorry, I didn't catch the date. Could you say it again? (e.g., 'next Tuesday' or 'May 27')", source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      }
      if (data.time) {
        // Validate time against opening hours
        const v = validateBookingTime(data.date, data.time, hours);
        if (!v.isOpen) {
          // Check if clinic is closed ALL DAY (no open/close times)
          const isDayClosed = !v.openTime || !v.closeTime;
          if (isDayClosed) {
            return { text: `Sorry, we're closed on ${data.date}. ${v.reason}. Please choose a different date — what day works for you?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
          }
          return { text: `Sorry, we're not open at ${data.time} on that day. ${v.reason}. What time between ${v.openTime}–${v.closeTime} works for you?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
        }
        const existingTreatment = data.treatment || currentState.data.treatment;
        const existingTreatments = data.treatments || currentState.data.treatments || (existingTreatment ? [existingTreatment] : undefined);
        // If user also provided treatment, go straight to booking!
        if (existingTreatment) {
          return await attemptBooking(clinicConfig, patientPhone, { date: data.date, time: data.time, treatment: existingTreatment, treatments: existingTreatments }, conversationHistory, startTime);
        }
        setState(patientPhone, BOOKING_STATES.AWAITING_TREATMENT, { date: data.date, time: data.time });
        return { text: `${data.date} at ${data.time} works! Which treatment would you like?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      }
      setState(patientPhone, BOOKING_STATES.AWAITING_TIME, { date: data.date, treatment: data.treatment || currentState.data.treatment, treatments: data.treatments || currentState.data.treatments || (currentState.data.treatment ? [currentState.data.treatment] : undefined) });
      return { text: `${data.date} works. What time would you prefer?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
    
    case BOOKING_STATES.AWAITING_TIME:
      if (!data.time) {
        return { text: "Sorry, I didn't catch the time. Could you say it again? (e.g., '2pm' or 'morning')", source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      }
      // Validate time against opening hours
      const date = data.date || currentState.data.date;
      const v = validateBookingTime(date, data.time, hours);
      if (!v.isOpen) {
        const isDayClosed = !v.openTime || !v.closeTime;
        if (isDayClosed) {
          return { text: `Sorry, we're closed on ${date}. ${v.reason}. Please choose a different date — what day works for you?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
        }
        return { text: `Sorry, we're not open at ${data.time} on that day. ${v.reason}. What time between ${v.openTime}–${v.closeTime} works for you?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      }
      if (data.treatment) {
        const treatmentsArr = data.treatments || currentState.data.treatments || [data.treatment];
        return await attemptBooking(clinicConfig, patientPhone, { date, time: data.time, treatment: data.treatment, treatments: treatmentsArr }, conversationHistory, startTime);
      }
      setState(patientPhone, BOOKING_STATES.AWAITING_TREATMENT, { date, time: data.time, treatment: data.treatment || currentState.data.treatment, treatments: data.treatments || currentState.data.treatments || (currentState.data.treatment ? [currentState.data.treatment] : undefined) });
      return { text: `${date} at ${data.time} — noted ✓ Which treatment are you looking for?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
    
    case BOOKING_STATES.AWAITING_TREATMENT: {
      const services = clinicConfig.config?.services || clinicConfig.services || [];
      // ── VALIDATE: Check if requested treatment(s) match known services ──
      const requestedTreatments = data.treatments || (data.treatment ? [data.treatment] : []);
      const matchedServices = [];
      const notFound = [];
      for (const req of requestedTreatments) {
        const matched = services.find(s =>
          s.name.toLowerCase().includes(req.toLowerCase()) ||
          req.toLowerCase().includes(s.name.toLowerCase())
        );
        if (matched && !matchedServices.some(ms => ms.name === matched.name)) {
          matchedServices.push(matched);
        } else if (!matched) {
          notFound.push(req);
        }
      }
      // If no treatment provided OR none matched known services → show service list
      if (!data.treatment || matchedServices.length === 0) {
        if (services.length > 0) {
          const serviceList = services.map(s => {
            const price = s.price ? ` (${s.price}${s.price_unit ? '/' + s.price_unit : ''})` : '';
            const duration = s.duration ? ` — ${s.duration}min${s.duration > 1 ? 's' : ''}` : '';
            const desc = s.description ? `: ${s.description}` : '';
            return `• ${s.name}${price}${duration}${desc}`;
          }).join('\n');
          const notFoundNote = notFound.length > 0 ? `Sorry, we don't offer "${notFound.join(', ')}". ` : '';
          return { text: `${notFoundNote}Here are our treatments:\n${serviceList}\n\nWhich one would you like?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
        }
        return { text: `Which treatment are you looking for?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      }
      // Some matched, some didn't — warn about invalid ones but proceed with valid ones
      const date2 = data.date || currentState.data.date;
      const time2 = data.time || currentState.data.time;
      const validTreatmentNames = matchedServices.map(s => s.name);
      const validTreatmentsJoined = validTreatmentNames.join(' + ');
      const notFoundNote = notFound.length > 0 ? ` (Note: we don't offer ${notFound.join(', ')})` : '';
      // ── ASK FOR NAME ──
      setState(patientPhone, BOOKING_STATES.AWAITING_NAME, { date: date2, time: time2, treatment: validTreatmentNames[0], treatments: validTreatmentNames });
      return { text: `${validTreatmentsJoined} — great choice! ✓${notFoundNote}\n\nMay I have your name for the booking?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
    }
    
    case BOOKING_STATES.AWAITING_NAME:
      // Patient may provide name only, or name+phone together
      let providedName = data.name;
      // If extractBookingFields didn't find a name, try using the raw message
      if (!providedName && message) {
        const cleanMsg = message.trim();
        if (cleanMsg.length > 0 && cleanMsg.length < 50) {
          // Check "Name 90123456" or "Name +6590123456" format — extract name part
          const namePhoneMatch = cleanMsg.match(/^([A-Za-z\s]+)\s+\+?\d{6,}$/);
          if (namePhoneMatch) {
            providedName = namePhoneMatch[1].trim();
          } else if (!/^\d/.test(cleanMsg)) {
            // Message doesn't start with a digit — use as name (but strip any trailing phone number)
            const trailingPhone = cleanMsg.match(/^(.*?)\s+\+?\d{6,}$/);
            providedName = trailingPhone ? trailingPhone[1].trim() : cleanMsg;
          }
        }
      }
      if (!providedName) {
        return { text: `I'd be happy to help with that! Could you share your name for the booking?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      }
      // Name collected — check if phone was also provided
      const nameData = currentState.data;
      let providedPhone = patientPhone;
      const phoneMatch = message.match(/\b\+?\d{6,}\b/);
      if (phoneMatch) {
        providedPhone = phoneMatch[0];
      }
      setState(patientPhone, BOOKING_STATES.AWAITING_PHONE, { ...nameData, name: providedName, phone: providedPhone });
      return { text: `Thanks, ${providedName}! Just to confirm — your contact number is ${providedPhone}? (reply YES to confirm or provide a different number)`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
    
    case BOOKING_STATES.AWAITING_PHONE:
      // Use the patient's WhatsApp number as default, or accept a different one
      let confirmedPhone = currentState.data.phone || patientPhone;
      if (data.phone && data.phone !== patientPhone) {
        confirmedPhone = data.phone;
      }
      if (isConfirmation(message)) {
        const phoneData = currentState.data;
        const finalPhone = confirmedPhone;
        setState(patientPhone, BOOKING_STATES.AWAITING_CONFIRMATION, { ...phoneData, phone: finalPhone });
        const allServices = clinicConfig.config?.services || [];
        const treatments2b = phoneData.treatments || [phoneData.treatment];
        const summary = await buildBookingSummary(clinicConfig, phoneData.date, phoneData.time, treatments2b, allServices, phoneData.name, finalPhone);
        return { text: summary, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      } else if (isDenial(message)) {
        return { text: `No problem! What number should I use for the booking?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      } else if (data.phone) {
        const phoneData = currentState.data;
        setState(patientPhone, BOOKING_STATES.AWAITING_CONFIRMATION, { ...phoneData, phone: data.phone });
        const allServices = clinicConfig.config?.services || [];
        const treatments2b = phoneData.treatments || [phoneData.treatment];
        const summary = await buildBookingSummary(clinicConfig, phoneData.date, phoneData.time, treatments2b, allServices, phoneData.name, data.phone);
        return { text: summary, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      }
      return { text: `Could you confirm your contact number? Reply YES to use ${confirmedPhone}, or send a different number.`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
    
    case BOOKING_STATES.AWAITING_CONFIRMATION:
      return await handleBookingConfirmation(message, clinicConfig, patientPhone, currentState, conversationHistory, startTime);
    
    case BOOKING_STATES.READY_TO_BOOK:
      return await attemptBooking(clinicConfig, patientPhone, currentState.data, conversationHistory, startTime);
  }
  
  // Fallback
  return await routeToOpenAI(message, clinicConfig, conversationHistory, [], startTime);
}

async function attemptBooking(clinicConfig, patientPhone, fields, conversationHistory, startTime) {
  // Validate fields
  if (!fields.date || !fields.time || !fields.treatment) {
    const missing = [];
    if (!fields.date) missing.push('date');
    if (!fields.time) missing.push('time');
    if (!fields.treatment) missing.push('treatment');
    return { text: `I'm missing your ${(missing || []).join(' and ')}. Could you provide those?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
  }
  
  // ── MATCH ALL TREATMENTS (multi-treatment support) ──
  const services = clinicConfig.config?.services || clinicConfig.services || [];
  // DEDUPLICATE: prevent same treatment appearing twice (e.g. "Botox and botox")
  const requestedTreatments = [...new Set(fields.treatments || [fields.treatment])];
  
  const matchedServices = [];
  const notFound = [];
  const seenServiceIds = new Set();
  
  for (const req of requestedTreatments) {
    const matched = services.find(s => 
      s.name.toLowerCase().includes(req.toLowerCase()) ||
      req.toLowerCase().includes(s.name.toLowerCase())
    );
    if (matched && !seenServiceIds.has(matched.name)) {
      matchedServices.push(matched);
      seenServiceIds.add(matched.name);
    } else if (!matched) {
      notFound.push(req);
    }
  }
  
  if (matchedServices.length === 0) {
    const serviceList = services.map(s => s.name).join(', ');
    setState(patientPhone, BOOKING_STATES.AWAITING_TREATMENT, { date: fields.date, time: fields.time });
    return { text: `I couldn't find "${(requestedTreatments || []).join(', ')}" in our services. We offer: ${serviceList}. Which one would you like?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
  }
  
  // ── DIRECT BOOKING CREATION ──
  // Sum durations for multiple treatments
  const totalDuration = matchedServices.reduce((sum, s) => sum + (parseInt(s.duration) || 60), 0);
  const serviceNames = (matchedServices || []).map(s => s.name).join(' + ');
  
  // Extract patient name from conversation history
  let patientName = fields.name || null;
  if (!patientName && conversationHistory.length > 0) {
    for (const turn of conversationHistory.slice(-4).reverse()) {
      if (turn.ai && turn.ai.includes('name')) {
        const userReply = turn.user || '';
        if (userReply.length > 1 && userReply.length < 40 && !userReply.match(/^\d/)) {
          patientName = userReply.trim();
          break;
        }
      }
    }
  }
  patientName = patientName || 'Guest';
  
  try {
    const { createBooking } = require('./expert-system/function-handlers');
    const result = await createBooking({
      client_id: clinicConfig.id,
      customer_name: patientName,
      customer_phone: fields.phone || patientPhone,
      service_name: serviceNames,
      appointment_date: fields.date,
      appointment_time: fields.time,
      notes: `Total duration: ${totalDuration}mins. ${notFound.length > 0 ? 'Not found: ' + (notFound || []).join(', ') : ''}`
    });
    
    resetIdle(patientPhone);
    
    if (result.success) {
      const multiNote = matchedServices.length > 1 ? ` (${totalDuration}mins total)` : '';
      const calendarId = clinicConfig.config?.google_calendar_id || clinicConfig.google_calendar_id;
      const clinicId = clinicConfig.id || 'unknown';
      const hasCalendar = !!(calendarId && isCalendarHealthy(clinicId));
      const confirmationMsg = hasCalendar 
        ? `The clinic will confirm within 30 minutes.` 
        : `This is subject to clinic confirmation and they'll get back to you shortly.`;
      return {
        text: `✅ Booking request received! ${serviceNames}${multiNote} on ${fields.date} at ${fields.time}. ${confirmationMsg}`,
        source: 'hardcoded',
        cost_saved: 0.5,
        latency_ms: Date.now() - startTime
      };
    } else {
      return {
        text: `I couldn't complete the booking: ${result.error}. Could you try again?`,
        source: 'hardcoded',
        cost_saved: 1,
        latency_ms: Date.now() - startTime
      };
    }
  } catch (err) {
    console.error('[attemptBooking] Direct booking failed:', err.message);
    resetIdle(patientPhone);
    return {
      text: `I had trouble completing your booking. Let me connect you with the clinic team directly.`,
      source: 'hardcoded',
      cost_saved: 1,
      latency_ms: Date.now() - startTime
    };
  }
}

// ─── CALENDAR HEALTH TRACKER ─────────────────────────────────────
// Tracks per-clinic calendar API failures. After 30 minutes of consecutive
// failures, we fall back to "subject to clinic confirmation" mode.
const calendarHealthTracker = new Map();
const CALENDAR_FAILURE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const CALENDAR_API_TIMEOUT_MS = 15 * 1000; // 15 seconds — patient can wait

function recordCalendarFailure(clinicId, error) {
  const now = Date.now();
  const record = calendarHealthTracker.get(clinicId) || { firstFailure: now, count: 0, lastError: '' };
  record.count++;
  record.lastError = error;
  calendarHealthTracker.set(clinicId, record);
  console.log(`[CALENDAR_HEALTH] Clinic ${clinicId}: failure #${record.count}, first at ${new Date(record.firstFailure).toISOString()}`);
}

function recordCalendarSuccess(clinicId) {
  calendarHealthTracker.delete(clinicId);
}

function isCalendarHealthy(clinicId) {
  const record = calendarHealthTracker.get(clinicId);
  if (!record) return true; // No failures recorded
  const elapsed = Date.now() - record.firstFailure;
  if (elapsed > CALENDAR_FAILURE_WINDOW_MS) {
    // 30 minutes of failures — mark unhealthy
    console.log(`[CALENDAR_HEALTH] Clinic ${clinicId}: UNHEALTHY after ${Math.round(elapsed / 60000)}min of failures`);
    return false;
  }
  // Within 30-min window — still try, but log warning
  console.log(`[CALENDAR_HEALTH] Clinic ${clinicId}: trying despite ${record.count} recent failures`);
  return true;
}

// ─── BOOKING CONFIRMATION SUMMARY ────────────────────────────────
// Builds a detailed booking summary for patient confirmation.
// Includes: treatments, prices, total duration, date/time.
// For clinics without Google Calendar: always shows "subject to clinic confirmation"

async function buildBookingSummary(clinicConfig, date, time, treatments, services, name = null, phone = null) {
  const matchedServices = [];
  const seenNames = new Set();
  let totalPrice = 0;
  let totalDuration = 0;
  
  // DEDUPLICATE: prevent same treatment appearing twice
  const uniqueTreatments = [...new Set(treatments)];
  
  for (const t of uniqueTreatments) {
    const svc = services.find(s => s.name.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(s.name.toLowerCase()));
    if (svc && !seenNames.has(svc.name)) {
      matchedServices.push(svc);
      seenNames.add(svc.name);
      totalDuration += parseInt(svc.duration) || 60;
      const priceNum = parseInt(svc.price?.replace(/[^0-9]/g, '')) || 0;
      totalPrice += priceNum;
    }
  }
  
  const serviceLines = (matchedServices || []).map(s => {
    const price = s.price ? ` (${s.price}${s.price_unit ? '/' + s.price_unit : ''})` : '';
    const dur = s.duration ? ` — ${s.duration}mins` : '';
    return `• ${s.name}${price}${dur}`;
  }).join('\n');
  
  const priceLine = totalPrice > 0 ? `\n💰 Total: ~S$${totalPrice}` : '';
  const durLine = totalDuration > 0 ? `\n⏱ Total duration: ${totalDuration}mins` : '';
  const nameLine = name ? `\n👤 Name: ${name}` : '';
  const phoneLine = phone ? `\n📱 Contact: ${phone}` : '';
  
  // ── Calendar availability check ──
  let availabilityNote = '';
  let confirmationNote = '';
  const calendarId = clinicConfig.config?.google_calendar_id || clinicConfig.google_calendar_id;
  const clinicId = clinicConfig.id || 'unknown';
  
  if (!calendarId) {
    // Clinic has NO Google Calendar — always show "subject to clinic confirmation"
    confirmationNote = '\n\n⏳ This booking is subject to clinic confirmation.';
  } else if (!isCalendarHealthy(clinicId)) {
    // Calendar has been failing for 30+ minutes — fall back
    confirmationNote = '\n\n⏳ Our calendar sync is temporarily unavailable. This booking is subject to clinic confirmation.';
  } else {
    // Clinic HAS calendar and it's healthy — check availability (patient can wait 15s)
    try {
      const calendarService = require('../server/calendar-service');
      const isAvailable = await Promise.race([
        calendarService.isSlotAvailable(calendarId, date, time, totalDuration),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), CALENDAR_API_TIMEOUT_MS))
      ]);
      
      if (isAvailable) {
        recordCalendarSuccess(clinicId);
      } else {
        // Slot is taken — find 2 alternatives (patient can wait another 15s)
        const hours = clinicConfig.config?.operating_hours || [];
        const dayEntry = hours.find(h => {
          // CRITICAL FIX: Same timezone-safe parsing as validateBookingTime
          const [y, m, d] = date.split('-').map(Number);
          const dt = new Date(y, m - 1, d);
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          return h.day === dayNames[dt.getDay()];
        });
        
        if (dayEntry?.isOpen) {
          const altSlots = await Promise.race([
            calendarService.getAvailableSlots(calendarId, date, { open: dayEntry.open_time, close: dayEntry.close_time }, totalDuration, 15),
            new Promise(resolve => setTimeout(() => resolve([]), CALENDAR_API_TIMEOUT_MS))
          ]);
          
          const alternatives = altSlots.slice(0, 2);
          if (alternatives.length > 0) {
            const altText = alternatives.map((s, i) => `${i + 1}. ${s.start}`).join('\n');
            availabilityNote = `\n\n⚠️ That slot is taken. Available alternatives:\n${altText}\n\nReply with the number (1 or 2) or suggest another time.`;
          } else {
            availabilityNote = `\n\n⚠️ That slot is taken. Please suggest another time.`;
          }
        }
      }
    } catch (err) {
      // Calendar API failed or timed out — record failure but still proceed
      recordCalendarFailure(clinicId, err.message);
      console.log(`[BOOKING_SUMMARY] Calendar check failed: ${err.message}. Proceeding with subject-to-confirmation.`);
      confirmationNote = '\n\n⏳ Checking our calendar... This booking is subject to clinic confirmation.';
    }
  }
  
  // Multi-treatment warning
  let multiNote = '';
  if (totalDuration > 120) {
    multiNote = `\n\n⚠️ This will take ${totalDuration} minutes. Would you prefer to split into 2 separate appointments? Reply SPLIT if yes.`;
  }
  
  return `Please confirm your booking:\n\n${serviceLines}${priceLine}${durLine}${nameLine}${phoneLine}\n📅 ${date} at ${time}${availabilityNote}${confirmationNote}${multiNote}\n\nReply YES to confirm, or NO to make changes.`;
}

// ─── BOOKING CONFIRMATION HANDLER ────────────────────────────────
// Handles patient response to booking summary (Yes/No/change request)

async function handleBookingConfirmation(message, clinicConfig, patientPhone, currentState, conversationHistory, startTime) {
  const lower = message.toLowerCase().trim();
  const data = currentState.data;
  
  // Check for "split" request (multi-treatment too long)
  if (lower.includes('split')) {
    resetIdle(patientPhone);
    return {
      text: `No problem! Let me know which treatment you'd like to book first, and we can schedule the second one separately.`,
      source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime
    };
  }
  
  // Check for alternative slot selection ("1", "2", "first one", etc.)
  const altMatch = lower.match(/^\s*(1|2|first|second)\s*$/i);
  if (altMatch) {
    // Patient selected an alternative slot — need to update the time
    // For now, ask them to specify the time
    return {
      text: `Got it! What time would you prefer?`,
      source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime
    };
  }
  
  // YES — create the booking
  if (isConfirmation(message)) {
    return await attemptBooking(clinicConfig, patientPhone, data, conversationHistory, startTime);
  }
  
  // NO — ask what to change
  if (isDenial(message)) {
    return {
      text: `No problem! What would you like to change? Reply with:\n• DATE — to change the date\n• TIME — to change the time\n• TREATMENT — to change the treatment\n• Or tell me what you'd prefer`,
      source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime
    };
  }
  
  // Check if patient specified a change (e.g. "Can I change to 3pm?", "Make it Tuesday instead")
  const changeFields = extractBookingFields(message, clinicConfig.config?.services || []);
  
  if (changeFields.date && !changeFields.time) {
    // Only date changed
    setState(patientPhone, BOOKING_STATES.AWAITING_TIME, { 
      ...data, 
      date: changeFields.date 
    });
    return {
      text: `Sure, ${changeFields.date} works. What time would you prefer?`,
      source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime
    };
  }
  
  if (changeFields.time && !changeFields.date) {
    // Only time changed
    setState(patientPhone, BOOKING_STATES.AWAITING_CONFIRMATION, {
      ...data,
      time: changeFields.time
    });
    const services = clinicConfig.config?.services || [];
    const summary = await buildBookingSummary(clinicConfig, data.date, changeFields.time, data.treatments || [data.treatment], services);
    return { text: summary, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
  }
  
  if (changeFields.treatment) {
    // Treatment changed
    setState(patientPhone, BOOKING_STATES.AWAITING_CONFIRMATION, {
      ...data,
      treatment: changeFields.treatment,
      treatments: changeFields.treatments || [changeFields.treatment]
    });
    const services = clinicConfig.config?.services || [];
    const newTreatments = changeFields.treatments || [changeFields.treatment];
    const summary = await buildBookingSummary(clinicConfig, data.date, data.time, newTreatments, services);
    return { text: summary, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
  }
  
  if (changeFields.date && changeFields.time) {
    // Both changed
    setState(patientPhone, BOOKING_STATES.AWAITING_CONFIRMATION, {
      ...data,
      date: changeFields.date,
      time: changeFields.time
    });
    const services = clinicConfig.config?.services || [];
    const summary = await buildBookingSummary(clinicConfig, changeFields.date, changeFields.time, data.treatments || [data.treatment], services);
    return { text: summary, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
  }
  
  // Ambiguous response — repeat the summary
  const services = clinicConfig.config?.services || [];
  const summary = await buildBookingSummary(clinicConfig, data.date, data.time, data.treatments || [data.treatment], services);
  return { text: `Sorry, I didn't catch that. ${summary}`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
}

// ─── OPENAI ROUTING ──────────────────────────────────────────────
// CRITICAL: This function does NOT call OpenAI itself.
// Instead it signals bot-engine to handle the message via its
// expert system (which has full function calling for booking,
// pricing, availability, etc.). This prevents:
//   1. Duplicate OpenAI calls (smart router + bot-engine)
//   2. Missing function calling (booking can't execute without it)
//   3. Inappropriate greetings (expert system has better context)

async function routeToOpenAI(message, clinicConfig, conversationHistory, matchedIntents, startTime) {
  // Return signal to bot-engine: "not handled by smart router, use expert system"
  // Bot-engine in processMessage() checks:
  //   if (routerResult.source === 'hardcoded' && routerResult.text) → use hardcoded
  //   else → fall through to expert system with function calling
  // By returning source: 'openai' and text: null, we force the fallthrough.
  return {
    text: null,
    source: 'openai',
    intents: matchedIntents.map(i => i.intent || i),
    cost_saved: 0,
    latency_ms: Date.now() - startTime
  };
}

// ─── LEGACY EXPORTS ──────────────────────────────────────────────

// For backward compatibility with any code still using composeResponse
async function composeResponse(responses, message, clinicConfig) {
  if (responses.length === 1) return responses[0];
  if (responses.length === 2) return `${responses[0]}\n\nAlso, ${responses[1]}`;
  return (responses || []).join('. ');
}

module.exports = { routeMessage, composeResponse };
