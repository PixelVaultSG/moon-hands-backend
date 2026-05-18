/**
 * Moon Hands — Response Composer
 * Combines multiple hardcoded handler responses into one natural message.
 * 
 * Example:
 *   Patient: "What are your hours and how much is Botox?"
 *   Handler 1: "We're open Mon-Fri 9am-6pm..."
 *   Handler 2: "Botox is $15 per unit..."
 *   Composed:  "We're open Monday to Friday from 9am to 6pm. 
 *               Botox is priced at $15 per unit. 
 *               Would you like to book an appointment?"
 * 
 * Rules:
 *   - Never repeat the same information
 *   - Use natural transitions between topics
 *   - Always end with a call-to-action (book, ask more, etc.)
 *   - Keep clinic personality consistent
 */

// ─── TRANSITION PHRASES ───────────────────────────────────────────

const TRANSITIONS = {
  pricing_service: "As for pricing, ",
  service_pricing: "Regarding our treatments, ",
  hours_service: "In terms of our services, ",
  location_hours: "As for getting here, ",
  general: "Also, ",
  booking: "If you'd like to proceed, ",
};

// ─── CALL-TO-ACTION TEMPLATES ─────────────────────────────────────

const CTAS = {
  booking: [
    "Would you like to book an appointment?",
    "Shall I check availability for you?",
    "Ready to book? Just let me know your preferred date and time!",
  ],
  pricing: [
    "Would you like to proceed with this treatment?",
    "Interested? I can book you in!",
  ],
  info: [
    "Is there anything else I can help with?",
    "Any other questions?",
  ],
  service: [
    "Would you like to know more about any of these treatments?",
    "I can share pricing details for any treatment that interests you.",
  ],
};

/**
 * Main entry: compose multiple responses into one natural message.
 * 
 * @param {string[]} responses — Array of handler response strings
 * @param {object[]} intents — Matched intent objects
 * @param {object} clinicConfig — Clinic configuration
 * @returns {string} Composed natural response
 */
function composeResponse(responses, intents, clinicConfig) {
  if (!responses || responses.length === 0) {
    return fallbackResponse(clinicConfig);
  }
  
  if (responses.length === 1) {
    return responses[0];
  }
  
  // Step 1: Clean and deduplicate responses
  const cleaned = responses.map(r => cleanResponse(r)).filter(r => r.length > 10);
  
  // Step 2: Merge responses intelligently
  let merged = mergeResponses(cleaned, intents);
  
  // Step 3: Remove duplicate sentences
  merged = removeDuplicates(merged);
  
  // Step 4: Add natural transitions
  merged = addTransitions(merged, intents);
  
  // Step 5: Add appropriate CTA
  merged = appendCTA(merged, intents, clinicConfig);
  
  // Step 6: Final polish
  return polish(merged);
}

/**
 * Clean a single handler response — remove trailing questions, extra whitespace.
 */
function cleanResponse(response) {
  return response
    .replace(/\n{3,}/g, '\n\n')     // Max 2 consecutive newlines
    .replace(/^\s+|\s+$/g, '')      // Trim
    .replace(/[?\s]*$/, '');         // Remove trailing question marks for merging
}

/**
 * Merge multiple responses into one text block.
 */
function mergeResponses(responses, intents) {
  // Sort responses by priority (booking/urgent first, then info)
  const priority = getIntentPriority(intents);
  
  const sorted = responses.map((r, i) => ({
    text: r,
    priority: priority[i] || 5,
    intent: intents[i]?.intent || 'general'
  })).sort((a, b) => a.priority - b.priority);
  
  return sorted.map(s => s.text).join('\n\n');
}

/**
 * Assign priority to each intent for ordering.
 */
function getIntentPriority(intents) {
  const priorityMap = {
    greeting: 1,
    goodbye: 1,
    complaint: 1,
    booking_request: 2,
    cancel_request: 2,
    reschedule_request: 2,
    check_appointment: 2,
    operating_hours: 3,
    location: 3,
    pricing_specific: 4,
    pricing_general: 4,
    service_inquiry: 4,
    service_list: 4,
    faq_prep: 5,
    faq_aftercare: 5,
    waitlist_request: 2,
    human_handoff: 1,
    language_switch: 1,
  };
  
  return intents.map(i => priorityMap[i.intent] || 5);
}

/**
 * Remove duplicate sentences across responses.
 */
function removeDuplicates(text) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const seen = new Set();
  const unique = [];
  
  for (const sentence of sentences) {
    const normalized = sentence.toLowerCase().trim();
    // Skip very short sentences
    if (normalized.length < 5) {
      unique.push(sentence);
      continue;
    }
    // Check for near-duplicates (first 30 chars)
    const key = normalized.substring(0, 30);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(sentence);
    }
  }
  
  return unique.join(' ');
}

/**
 * Add natural transitions between topics.
 */
function addTransitions(text, intents) {
  const intentNames = intents.map(i => i.intent);
  
  // Detect topic pairs and add transitions
  let result = text;
  
  // Hours → Pricing transition
  if (intentNames.includes('operating_hours') && (intentNames.includes('pricing_specific') || intentNames.includes('pricing_general'))) {
    result = result.replace(/(hours.*?)(\n\n)(.*?price)/i, '$1\n\nAs for pricing, $3');
  }
  
  // Pricing → Booking transition
  if ((intentNames.includes('pricing_specific') || intentNames.includes('pricing_general')) && intentNames.includes('booking_request')) {
    result = result.replace(/(price.*?)(\n\n)(.*?book)/i, '$1\n\nIf you\'d like to proceed, $3');
  }
  
  return result;
}

/**
 * Append appropriate call-to-action based on intents.
 */
function appendCTA(text, intents, clinicConfig) {
  const intentNames = intents.map(i => i.intent);
  
  // Don't add CTA for goodbye or complaint
  if (intentNames.includes('goodbye') || intentNames.includes('complaint')) {
    return text;
  }
  
  // Already has a question at the end?
  if (text.trim().endsWith('?')) {
    return text;
  }
  
  // Select CTA category
  let ctaCategory = 'info';
  
  if (intentNames.some(i => ['booking_request', 'cancel_request', 'reschedule_request'].includes(i))) {
    ctaCategory = 'booking';
  } else if (intentNames.some(i => ['pricing_specific', 'pricing_general'].includes(i))) {
    ctaCategory = 'pricing';
  } else if (intentNames.some(i => ['service_inquiry', 'service_list'].includes(i))) {
    ctaCategory = 'service';
  }
  
  // Pick random CTA from category
  const ctas = CTAS[ctaCategory] || CTAS.info;
  const cta = ctas[Math.floor(Math.random() * ctas.length)];
  
  return `${text}\n\n${cta}`;
}

/**
 * Final polish: fix spacing, capitalize, ensure proper ending.
 */
function polish(text) {
  return text
    .replace(/\s+/g, ' ')                    // Normalize spaces
    .replace(/\n\s*\n\s*\n/g, '\n\n')      // Max 2 newlines
    .replace(/([.!?])\s*([a-z])/g, '$1 $2') // Space after punctuation
    .replace(/^\w/, c => c.toUpperCase())   // Capitalize first letter
    .trim();
}

/**
 * Fallback when no handler produced a response.
 */
function fallbackResponse(clinicConfig) {
  const name = clinicConfig.clinic_name || 'our clinic';
  return `I'd be happy to help! I can assist you with:\n• Booking appointments\n• Treatment and pricing information\n• Operating hours and location\n\nWhat would you like to know?`;
}

module.exports = { composeResponse };
