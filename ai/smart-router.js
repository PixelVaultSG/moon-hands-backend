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
const BOOKING_INTENTS = ['book_appointment', 'check_availability', 'reschedule'];

/**
 * Main entry point
 */
async function routeMessage(message, clinicConfig, patientPhone = null, conversationHistory = []) {
  const startTime = Date.now();
  const phone = patientPhone || 'unknown';
  
  // ── STEP 1: Check conversation state ────────────────────────────
  const currentState = getState(phone);
  
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
  
  // Handle booking flow states
  if (isBookingState(currentState.state)) {
    return await handleBookingFlow(message, clinicConfig, patientPhone, currentState, conversationHistory, startTime);
  }
  
  // ── STEP 2: Detect intents ──────────────────────────────────────
  const matchedIntents = matchIntents(message, conversationHistory);
  
  // ── STEP 3: Multi-intent handling ───────────────────────────────
  // Filter out low-confidence matches
  const confidentIntents = matchedIntents.filter(m => m.confidence >= 0.5);
  
  if (confidentIntents.length >= 2) {
    // Multiple intents detected — ask for confirmation
    return await handleMultiIntentConfirmation(confidentIntents, message, clinicConfig, patientPhone);
  }
  
  // ── STEP 4: Single intent routing ───────────────────────────────
  const primaryIntent = confidentIntents[0];
  
  // If no intent matched, send to OpenAI
  if (!primaryIntent) {
    return await routeToOpenAI(message, clinicConfig, conversationHistory, [], startTime);
  }
  
  // Check if this should go to OpenAI
  if (AI_ONLY_INTENTS.includes(primaryIntent.intent) || primaryIntent.confidence < 0.7) {
    return await routeToOpenAI(message, clinicConfig, conversationHistory, matchedIntents, startTime);
  }
  
  // Booking intents → start booking flow
  if (BOOKING_INTENTS.includes(primaryIntent.intent)) {
    return await startBookingFlow(message, clinicConfig, patientPhone, conversationHistory, startTime);
  }
  
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
  
  const confirmText = `I see that you have ${intentDescriptions.join(' and ')}. Is that accurate? Anything else you'd like to ask before I provide information on those? Just reply "yes" to confirm, or let me know what else you need!`;
  
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
  const joined = responses.join('. ');
  return `${joined}. And ${last.toLowerCase()}`;
}

// ─── BOOKING STATE MACHINE ───────────────────────────────────────

function isBookingState(state) {
  return [
    BOOKING_STATES.AWAITING_DATE,
    BOOKING_STATES.AWAITING_TIME,
    BOOKING_STATES.AWAITING_TREATMENT,
    BOOKING_STATES.AWAITING_NAME,
    BOOKING_STATES.AWAITING_PHONE,
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
    setState(patientPhone, BOOKING_STATES.AWAITING_DATE, { treatment: fields.treatment });
    return { text: `${fields.treatment} — lovely choice! Which date works for you?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
  }
  
  // No fields extracted — ask for date
  setState(patientPhone, BOOKING_STATES.AWAITING_DATE, {});
  return { text: "I'd be happy to help you book an appointment! What date works for you? (e.g., 'next Tuesday' or 'May 27')", source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
}

async function handleBookingFlow(message, clinicConfig, patientPhone, currentState, conversationHistory, startTime) {
  const fields = extractBookingFields(message);
  const data = { ...currentState.data, ...fields };
  
  // Check if user wants to cancel the booking flow
  const cancelWords = ['cancel', 'never mind', 'nevermind', 'stop', 'forget it', 'go back'];
  if (cancelWords.some(w => message.toLowerCase().includes(w))) {
    resetIdle(patientPhone);
    return { text: "No problem! Let me know if you need anything else.", source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
  }
  
  switch (currentState.state) {
    case BOOKING_STATES.AWAITING_DATE:
      if (!data.date) {
        return { text: "Sorry, I didn't catch the date. Could you say it again? (e.g., 'next Tuesday' or 'May 27')", source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      }
      if (data.time) {
        setState(patientPhone, BOOKING_STATES.AWAITING_TREATMENT, { date: data.date, time: data.time });
        return { text: `${data.date} at ${data.time} — got it! Which treatment would you like?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      }
      setState(patientPhone, BOOKING_STATES.AWAITING_TIME, { date: data.date });
      return { text: `${data.date} works. What time would you prefer?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
    
    case BOOKING_STATES.AWAITING_TIME:
      if (!data.time) {
        return { text: "Sorry, I didn't catch the time. Could you say it again? (e.g., '2pm' or 'morning')", source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      }
      const date = data.date || currentState.data.date;
      if (data.treatment) {
        return await attemptBooking(clinicConfig, patientPhone, { date, time: data.time, treatment: data.treatment }, conversationHistory, startTime);
      }
      setState(patientPhone, BOOKING_STATES.AWAITING_TREATMENT, { date, time: data.time });
      return { text: `${date} at ${data.time} — noted ✓ Which treatment are you looking for?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
    
    case BOOKING_STATES.AWAITING_TREATMENT:
      if (!data.treatment) {
        // Check if it's a known treatment
        return { text: "Which treatment would you like? We have Hydrating Facial, Anti-Aging Treatment, Acne Clear Facial, Laser Skin Rejuvenation, Botox Consultation, and Dermal Filler.", source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
      }
      const date2 = data.date || currentState.data.date;
      const time2 = data.time || currentState.data.time;
      return await attemptBooking(clinicConfig, patientPhone, { date: date2, time: time2, treatment: data.treatment }, conversationHistory, startTime);
    
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
    return { text: `I'm missing your ${missing.join(' and ')}. Could you provide those?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
  }
  
  // Check if treatment exists
  const services = clinicConfig.services || [];
  const matchedService = services.find(s => 
    s.name.toLowerCase().includes(fields.treatment.toLowerCase()) ||
    fields.treatment.toLowerCase().includes(s.name.toLowerCase())
  );
  
  if (!matchedService) {
    // Treatment not found — suggest alternatives
    const serviceList = services.map(s => s.name).join(', ');
    setState(patientPhone, BOOKING_STATES.AWAITING_TREATMENT, { date: fields.date, time: fields.time });
    return { text: `I couldn't find "${fields.treatment}" in our services. We offer: ${serviceList}. Which one would you like?`, source: 'hardcoded', cost_saved: 1, latency_ms: Date.now() - startTime };
  }
  
  // All good — hand off to OpenAI for the actual booking (it has the create_booking function)
  resetIdle(patientPhone);
  
  const bookingMessage = `I'd like to book ${matchedService.name} on ${fields.date} at ${fields.time}`;
  return await routeToOpenAI(bookingMessage, clinicConfig, conversationHistory, [{ intent: 'book_appointment' }], startTime);
}

// ─── OPENAI ROUTING ──────────────────────────────────────────────

async function routeToOpenAI(message, clinicConfig, conversationHistory, matchedIntents, startTime) {
  const { processMessage: openAIProcess } = require('./bot-engine');
  const result = await openAIProcess(message, clinicConfig.id, conversationHistory);
  return {
    text: result.text,
    source: 'openai',
    intents: matchedIntents.map(i => i.intent || i),
    function_called: result.function_called || null,
    cost_saved: 0,
    latency_ms: Date.now() - startTime
  };
}

// ─── LEGACY EXPORTS ──────────────────────────────────────────────

// For backward compatibility with any code still using composeResponse
async function composeResponse(responses, message, clinicConfig) {
  if (responses.length === 1) return responses[0];
  if (responses.length === 2) return `${responses[0]}\n\nAlso, ${responses[1]}`;
  return responses.join('. ');
}

module.exports = { routeMessage, composeResponse };
