/**
 * Response Sanitizer — Post-processor for ALL AI-generated WhatsApp replies
 * 
 * PROBLEM: OpenAI ignores system prompt constraints ("NEVER say Hello").
 * This module strips forbidden phrases AFTER generation, guaranteeing clean output.
 * 
 * Called from server/webhook.js before sending to 360dialog.
 * This is the LAST line of defense — no forbidden phrase reaches the patient.
 */

// ─── FORBIDDEN PATTERNS (regex → replacement) ────────────────────

const FORBIDDEN_PATTERNS = [
  // Greetings — remove entirely (these should NEVER appear in follow-up)
  { regex: /^Hello![\s]*Welcome to (?:our|Pixel Vault|the) clinic[!\.\s]*/im, replace: '' },
  { regex: /^Hey there![\s]*Welcome to (?:our|Pixel Vault|the) clinic[!\.\s]*/im, replace: '' },
  { regex: /^Hi![\s]*Welcome to (?:our|Pixel Vault|the) clinic[!\.\s]*/im, replace: '' },
  { regex: /^Hello there![\s]*Welcome to (?:our|Pixel Vault|the) clinic[!\.\s]*/im, replace: '' },
  
  // Standalone greetings at start of message
  { regex: /^(?:Hello|Hi|Hey there|Hello there)[!\.\s]+/im, replace: '' },
  
  // "I'd be happy to..." — always verbose and robotic (matches ANY verb after)
  { regex: /I'd be happy to[\s\w]*[!\.]/gi, replace: '' },
  { regex: /I would be happy to[\s\w]*[!\.]/gi, replace: '' },
  { regex: /I'm here to help[!\.\s]*/gi, replace: '' },
  { regex: /I'm here to help you[\s\w]*[!\.]/gi, replace: '' },
  
  // Pushy consultation / booking offers
  { regex: /Would you like me to arrange a consultation[\s\w]*[\?！]/gi, replace: '' },
  { regex: /arrange a consultation to discuss your needs[\s\w]*[\?！]/gi, replace: '' },
  { regex: /Would you like me to help you book an appointment[\?！\s]*/gi, replace: '' },
  { regex: /Would you like me to assist with booking[\?！\s]*/gi, replace: '' },
  { regex: /Would you like to book an appointment[\?！\s]*/gi, replace: '' },
  { regex: /I can help you book[\s\w]*[\?！]/gi, replace: '' },
  
  // Vague "let me know" endings that don't add value
  { regex: /Let me know if you need anything else[!\.\s]*$/gi, replace: '' },
  { regex: /Let me know if you have any questions[!\.\s]*$/gi, replace: '' },
  { regex: /Feel free to ask if you need more information[!\.\s]*$/gi, replace: '' },
  
  // "How can I assist you today?" and variants
  { regex: /How can I assist you today[\?！]/gi, replace: '' },
  { regex: /How may I help you today[\?！]/gi, replace: '' },
  { regex: /How can I help you today[\?！]/gi, replace: '' },
  
  // "Let me connect you with our team" — the worst one
  { regex: /Let me connect you with (?:our|the) team[\s\w]*[!\.]/gi, replace: '' },
  { regex: /I'll connect you with (?:our|the) team[\s\w]*[!\.]/gi, replace: '' },
  
  // "I can help you book an appointment at our clinic"
  { regex: /I can help you book an appointment at (?:our|the) clinic[!\.\s]*/gi, replace: '' },
  
  // Redundant "at our clinic" — just say "here" or remove
  { regex: / at (?:our|the) clinic/gi, replace: '' },
  
  // "Welcome to [anything]" in the middle of a message
  { regex: /Welcome to (?:our|Pixel Vault|the) clinic[!\.\s]*/gi, replace: '' },
  
  // Double spaces and extra newlines from removals
  { regex: /  +/g, replace: ' ' },
  { regex: /^\s*[\n\r]+/gm, replace: '' },
  { regex: /\n{3,}/g, replace: '\n\n' },
];

// ── MEDICAL ADVICE CATCH-ALL (MADS Layer 3 — this is the live path) ──────
// If ANY of these appear in an AI response, the whole response is clinical
// advice — do not salvage it, replace it entirely. Industry-neutral.
const MEDICAL_ADVICE_TEST = [
  /(?:safe|not safe|recommended|suitable|not suitable) for (?:you|your skin|your condition|pregnant)/i,
  /you (?:should|can|could|may|might|will) (?:try|consider|get|do|avoid) (?:botox|filler|laser|hifu|rejuran|an? (?:spinal )?adjustment|adjustments|manipulation|decompression|dry needling|shockwave|chiropractic)/i,
  /(?:side effects|risks?|downtime|recovery|results?) (?:include|are|may be|typically|usually|generally|expected)/i,
  /i (?:recommend|suggest|advise) (?:that you|getting|trying|doing|using)/i,
  /for your (?:acne|scars|pigmentation|wrinkles|skin type|condition|back pain|neck pain|sciatica|slipped disc|herniated|scoliosis|posture|whiplash|migraine),? (?:i recommend|the best|you should)/i,
  /(?:this|that|it|adjustment|treatment) (?:will|would|should|can) (?:help|cure|fix|heal|relieve|resolve) your/i,
];

const MEDICAL_SAFE_REDIRECT =
  "I'm not a medical professional, so I can't give clinical advice. The best next step is to book a consultation with our doctor, who can assess your needs properly. Would you like me to arrange that?";

// ─── SMART RESPONSES (when sanitization empties the message) ─────

const FALLBACK_RESPONSES = {
  service_list: "We offer Botox, Dermal Fillers, HydraFacial, HIFU, Laser treatments, Chemical Peels, Rejuran, Thread Lift, Microneedling, and PicoSure. Which one interests you?",
  booking: "Sure! What date and time works for you?",
  pricing: "I'd need to know which treatment you're interested in to give you the exact price. What are you looking at?",
  operating_hours: "We're open Mon–Fri 10am–8pm, Sat 10am–6pm. Closed Sundays.",
  treatment_info: "Which treatment would you like to know more about?",
  default: "What can I help you with today?",
};

// ─── MAIN SANITIZE FUNCTION ──────────────────────────────────────

function sanitizeResponse(text, context = {}) {
  if (!text || typeof text !== 'string') return text;

  // MADS Layer 3: clinical advice in the response = replace entire message.
  // Last line of defense — Layers 1 (prompt) and 2 (classifier) come first.
  if (MEDICAL_ADVICE_TEST.some(p => p.test(text))) {
    console.warn('[SANITIZER] MADS Layer 3 caught clinical advice — replaced with safe redirect');
    return MEDICAL_SAFE_REDIRECT;
  }

  let cleaned = text.trim();
  
  // Apply all forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    cleaned = cleaned.replace(pattern.regex, pattern.replace);
  }
  
  // Clean up: remove leading/trailing whitespace and punctuation artifacts
  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/^[,.\s]+/, ''); // Leading punctuation
  cleaned = cleaned.replace(/[,.\s]+$/, ''); // Trailing punctuation
  
  // If message became empty or too short, use a smart fallback
  if (cleaned.length < 10) {
    const intent = context?.intent || '';
    if (intent.includes('service')) return FALLBACK_RESPONSES.service_list;
    if (intent.includes('book')) return FALLBACK_RESPONSES.booking;
    if (intent.includes('price')) return FALLBACK_RESPONSES.pricing;
    if (intent.includes('hour')) return FALLBACK_RESPONSES.operating_hours;
    if (intent.includes('treatment')) return FALLBACK_RESPONSES.treatment_info;
    return FALLBACK_RESPONSES.default;
  }
  
  // Ensure first letter is capitalized
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  
  return cleaned;
}

// ─── EXPORTS ─────────────────────────────────────────────────────

module.exports = { sanitizeResponse, FORBIDDEN_PATTERNS, FALLBACK_RESPONSES, MEDICAL_ADVICE_TEST, MEDICAL_SAFE_REDIRECT };