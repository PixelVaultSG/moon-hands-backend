/**
 * Red Flag Detector — MADS Pre-Layer (regex, $0, <1ms)
 *
 * Handoff doc Section 18. Runs BEFORE everything else in the bot pipeline —
 * before the smart router, before the LLM classifier, before any booking logic.
 * A red-flag message must NEVER reach a booking flow (Path A: no booking,
 * A&E/GP referral, conversation paused, admin alerted).
 *
 * Patterns are HARDENED vs the handoff doc originals:
 * the doc's patterns only matched "can't move" / "can't breathe" —
 * these also catch "cannot move", "cant move", "couldn't move" etc.
 */

const RED_FLAG_PATTERNS = [
  // Trauma + neurological deficit
  /(?:accident|crash|fall|fell|hit my head|whiplash)[\s\S]{0,80}(?:numb|tingl|weak|(?:can'?t|cannot|couldn'?t|can\s*not)\s*move|paralys)/i,
  /(?:numbness|numb|tingling)[\s\S]{0,80}(?:arm|leg|face|one side|hand|foot|fingers|toes)/i,
  /(?:arm|leg|face|hand|foot)[\s\S]{0,40}(?:numb|tingling|gone weak)/i,

  // Chest / cardiac / breathing
  /(?:chest pain|chest tightness|heart palpitations|shortness of breath|(?:can'?t|cannot|can\s*not)\s*breathe|difficulty breathing)/i,

  // Stroke
  /(?:sudden|severe)[\s\S]{0,40}(?:headache|dizziness|confusion|slurred|vision loss)/i,
  /(?:face[\s\S]{0,15}droop|arm[\s\S]{0,10}weakness|speech[\s\S]{0,10}difficulty|slurred speech)/i,

  // Fracture / dislocation
  /(?:bone sticking out|deformed|(?:can'?t|cannot|can\s*not)\s*bear weight)/i,

  // Pregnancy complications
  /(?:pregnant|pregnancy)[\s\S]{0,60}(?:pain|bleeding|contractions|fall|fell)/i,

  // Post-surgical infection
  /(?:fever|redness|swelling|pus)[\s\S]{0,60}(?:spinal|spine|surgery|injection)/i,

  // Oncological red flags
  /(?:unexplained weight loss|night sweats|constant pain)[\s\S]{0,60}(?:back|neck|spine)/i,
];

/**
 * Path A — strict red flag response (Handoff Section 5.2, verbatim).
 * NO booking offered. NO treatment mentioned. Conversation paused.
 */
const PATH_A_RESPONSE =
  "I'm really sorry to hear you're going through this. That sounds serious, and I want to make sure you get the right care.\n\n" +
  "Because of the symptoms you've described, I'd strongly recommend visiting A&E or your GP immediately to rule out anything serious. Your safety comes first.\n\n" +
  "Once you've been checked and cleared by a medical doctor, we'd be happy to help with follow-up care. Please reply here when you're ready, and we'll get you booked in.";

/**
 * Detect red-flag emergency content in a patient message.
 * @param {string} message
 * @returns {{ isRedFlag: boolean, matchedPattern: string|null }}
 */
function detectRedFlag(message) {
  if (!message || typeof message !== 'string') {
    return { isRedFlag: false, matchedPattern: null };
  }
  for (const pattern of RED_FLAG_PATTERNS) {
    if (pattern.test(message)) {
      return { isRedFlag: true, matchedPattern: pattern.source.slice(0, 60) };
    }
  }
  return { isRedFlag: false, matchedPattern: null };
}

module.exports = { detectRedFlag, RED_FLAG_PATTERNS, PATH_A_RESPONSE };
