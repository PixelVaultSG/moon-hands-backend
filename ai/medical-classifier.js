/**
 * Medical Advice Classifier — MADS Layer 2 (Detection)
 *
 * Handoff doc Section 17, Layer 2. Classifies the patient's message with
 * gpt-4o-mini BEFORE any response is generated.
 *
 * Failure policy (deviation from the doc, deliberately conservative):
 * if the LLM call itself fails, we do NOT let the message through blind —
 * we fall back to a keyword heuristic. If the heuristic also suspects
 * medical advice, we treat it as MEDICAL_ADVICE_REQUEST. Only a clean
 * heuristic pass lets the message through, and the failure is logged so
 * it can be alerted on upstream.
 */

// Lazy + guarded: if the openai package or key is unavailable, the module
// still loads and classifyMedicalSafety falls back to the heuristic.
let openai = null;
function getOpenAI() {
  if (!openai) {
    const { OpenAI } = require('openai');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

// ─── HEURISTIC FALLBACK (used only when the LLM classifier errors) ────────
// Deliberately over-broad: better to over-escalate than under-escalate.
const MEDICAL_HEURISTIC_PATTERNS = [
  /\bis (?:it|this|the \w+|botox|filler|laser|hifu|adjustment|chiropractic|dry needling|shockwave)\b[\s\S]{0,40}\b(?:safe|dangerous|risky|ok|okay|fine)\b/i,
  /\b(?:will|can|could|would|does)\b[\s\S]{0,30}\b(?:help|cure|fix|heal|treat)\b[\s\S]{0,40}\b(?:my|me)\b/i,
  /\b(?:should|can|could) i (?:do|get|try|take|use|have|go for)\b/i,
  /\bwhat (?:treatment|procedure|therapy) (?:do you )?(?:recommend|suggest|is best|should i)\b/i,
  /\b(?:side effects?|risks?|downtime|recovery time|contraindications?)\b[\s\S]{0,40}\b(?:of|for|with|from)\b/i,
  /\b(?:pregnant|pregnancy|breastfeeding|blood thinner|cancer|diabetes|osteoporosis|slipped disc|herniated|sciatica|scoliosis)\b[\s\S]{0,60}\b(?:safe|ok|okay|can i|should i|still)\b/i,
  /\bhow (?:long|many sessions) (?:until|before|to) (?:i )?(?:see|feel|get)\b/i,
  /\b(?:doctor|dr\.?)['']?s? (?:opinion|advice)\b/i,
];

function heuristicSuspectsMedical(message) {
  return MEDICAL_HEURISTIC_PATTERNS.some(p => p.test(message));
}

/**
 * Classify a patient message for medical safety.
 * @param {string} message - raw patient message
 * @returns {Promise<{isMedicalAdvice: boolean, isRedFlag: boolean, category: string, source: string}>}
 */
async function classifyMedicalSafety(message) {
  const classificationPrompt = `
You are a medical safety classifier. Analyze the following patient message and classify it into EXACTLY ONE category:

CATEGORIES:
1. GENERAL_INQUIRY - "What time do you open?", "How much is Botox?", "Where are you located?"
2. BOOKING_REQUEST - "I want to book an appointment", "What slots do you have tomorrow?"
3. MEDICAL_ADVICE_REQUEST - "Is Botox safe for me?", "Will this help my sciatica?",
   "What treatment do you recommend for my back pain?", "Can I do laser while pregnant?"
4. RED_FLAG_EMERGENCY - "I was in a car accident and my neck hurts with arm numbness",
   "I have chest pain and shortness of breath", "I fell and can't move my leg"

RULES:
- If the message asks for a recommendation, suitability assessment, safety opinion,
  expected outcome, or personalized clinical guidance → MEDICAL_ADVICE_REQUEST
- FACTUAL service questions are GENERAL_INQUIRY, NOT medical advice: "What is dry
  needling?", "What's the difference between decompression and dry needling?",
  "What happens during a consultation?", "How long does an adjustment take?"
  (facts about what treatments ARE, per the clinic menu)
- The moment it becomes about THE PATIENT ("…for me?", "…for my back?", "should I…",
  "which is better for my condition?", "…while pregnant?") → MEDICAL_ADVICE_REQUEST
- If the message describes serious symptoms after trauma, chest pain, neurological deficits,
  or stroke signs → RED_FLAG_EMERGENCY
- Be CONSERVATIVE. If unsure, classify as MEDICAL_ADVICE_REQUEST.

Patient message: "${String(message).replace(/"/g, "'").slice(0, 500)}"

Respond with ONLY the category number and name. Example: "3. MEDICAL_ADVICE_REQUEST"
`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: classificationPrompt }],
      temperature: 0,
      max_tokens: 10
    });

    const category = (response.choices[0].message.content || '').trim();

    return {
      isMedicalAdvice: category.includes('MEDICAL_ADVICE_REQUEST'),
      isRedFlag: category.includes('RED_FLAG_EMERGENCY'),
      category,
      source: 'llm'
    };
  } catch (err) {
    // Classifier failed — fail conservative via heuristic, never blind-pass.
    console.error(`[MADS] LLM classifier failed (${err.message}) — using heuristic fallback`);
    const suspected = heuristicSuspectsMedical(message);
    return {
      isMedicalAdvice: suspected,
      isRedFlag: false, // regex red-flag detector already ran before this
      category: suspected ? '3. MEDICAL_ADVICE_REQUEST (heuristic)' : 'CLASSIFIER_ERROR_PASS',
      source: 'heuristic_fallback',
      classifierError: err.message
    };
  }
}

module.exports = { classifyMedicalSafety, heuristicSuspectsMedical, MEDICAL_HEURISTIC_PATTERNS };
