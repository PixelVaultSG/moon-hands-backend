/**
 * Moon Hands — Patient-Facing Expert System v2
 * 
 * 5 specialized experts, each receiving ONLY relevant context.
 * Per-clinic customization injected into every expert (tone, personality, agent name).
 * Multi-expert queries run in parallel and compose into one natural response.
 * 
 * Experts:
 *   1. INFO_EXPERT    — Hours, location, parking, prep/aftercare
 *   2. PRICING_EXPERT — Treatment pricing, services, packages
 *   3. BOOKING_EXPERT — Schedule, cancel, reschedule, availability
 *   4. EMPATHY_EXPERT — Complaints, concerns, emotional support
 *   5. UPSELL_EXPERT  — Complementary treatment suggestions
 */

const { getFunctionsForExpert } = require('./functions');

// Lazy-load OpenAI client to allow mocking in tests
let openai;
function getOpenAI() {
  if (!openai) {
    const { OpenAI } = require('openai');
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
    });
  }
  return openai;
}

// ─── EXPERT DEFINITIONS ───────────────────────────────────────────

const EXPERTS = {
  INFO: {
    id: 'INFO_EXPERT',
    name: 'Info & FAQ Expert',
    handles: ['operating_hours', 'location', 'parking', 'faq_prep', 'faq_aftercare', 'general_info'],
    temperature: 0.1,
    maxTokens: 300,
    model: 'gpt-4o-mini',
    requiresFunctions: false,
  },
  
  PRICING: {
    id: 'PRICING_EXPERT',
    name: 'Pricing & Services Expert',
    handles: ['pricing_specific', 'pricing_general', 'service_inquiry', 'service_list', 'treatment_comparison'],
    temperature: 0.2,
    maxTokens: 350,
    model: 'gpt-4o-mini',
    requiresFunctions: true,
    allowedFunctions: ['get_treatment_info', 'get_pricing'],
  },
  
  BOOKING: {
    id: 'BOOKING_EXPERT',
    name: 'Booking Expert',
    handles: ['booking_request', 'cancel_request', 'reschedule_request', 'check_appointment', 'waitlist_request'],
    temperature: 0.1,
    maxTokens: 400,
    model: 'gpt-4o-mini',
    requiresFunctions: true,
    allowedFunctions: ['check_availability', 'create_booking', 'cancel_booking', 'reschedule_booking', 'check_existing_booking', 'add_to_waitlist'],
  },
  
  EMPATHY: {
    id: 'EMPATHY_EXPERT',
    name: 'Complaint & Empathy Expert',
    handles: ['complaint', 'dissatisfaction', 'concern', 'anxiety', 'emotional_support', 'human_handoff'],
    temperature: 0.7,
    maxTokens: 350,
    model: 'gpt-4o-mini',
    requiresFunctions: false,
  },
  
  UPSELL: {
    id: 'UPSELL_EXPERT',
    name: 'Upsell & Recommendation Expert',
    handles: ['upsell', 'complementary_treatment', 'package_suggestion', 'loyalty'],
    temperature: 0.4,
    maxTokens: 300,
    model: 'gpt-4o-mini',
    requiresFunctions: true,
    allowedFunctions: ['get_treatment_info'],
  },
};

// ─── PER-CLINIC PERSONALITY INJECTION ─────────────────────────────
// Every expert prompt includes the clinic's unique tone, greeting, and agent name.

function getClinicPersonality(clinicConfig) {
  return {
    clinicName: clinicConfig.clinic_name || 'our clinic',
    agentName: clinicConfig.agent_name || 'Sophia',
    tone: clinicConfig.tone || 'friendly',
    greeting: clinicConfig.greeting || `Hello! Welcome to {businessName}.`,
    specialNotes: clinicConfig.special_notes || '',
  };
}

function injectPersonality(basePrompt, clinicConfig, expertRole) {
  const p = getClinicPersonality(clinicConfig);
  
  return `You are ${p.agentName}, the ${expertRole} for ${p.clinicName}.

CLINIC PERSONALITY:
- Name: ${p.clinicName}
- Your name: ${p.agentName}
- Tone: ${p.tone}
- Greeting style: ${p.greeting.replace('{businessName}', p.clinicName)}
${p.specialNotes ? `- Special instructions: ${p.specialNotes}` : ''}

RULES FOR ALL RESPONSES:
- Speak in the ${p.tone} tone consistently
- Use the clinic's greeting style when appropriate
- Never break character — you are ${p.agentName}, not a generic AI
- Today is ${getTodaySG()}

---

${basePrompt}`;
}

// ─── EXPERT PROMPT BUILDERS ───────────────────────────────────────

function buildInfoExpertBase(clinicConfig) {
  const hours = formatHours(clinicConfig.operating_hours);
  const address = clinicConfig.address || 'Contact us for address';
  const parking = clinicConfig.parking_info || '';
  const mrt = clinicConfig.nearest_mrt || '';
  const phone = clinicConfig.phone || '';
  const prep = clinicConfig.faqs?.prep_general || 'Arrive with clean skin. Avoid alcohol 24hrs before.';
  const aftercare = clinicConfig.faqs?.aftercare_general || 'Avoid sun for 48hrs. No strenuous exercise for 24hrs.';
  
  return `YOUR ROLE: Info & FAQ Expert
You provide factual clinic information. Strict, concise, never guesses.

CLINIC INFO:
- Hours: ${hours}
- Address: ${address}${mrt ? `\n- Nearest MRT: ${mrt}` : ''}${parking ? `\n- Parking: ${parking}` : ''}${phone ? `\n- Phone: ${phone}` : ''}

GENERAL PREP: ${prep}
GENERAL AFTERCARE: ${aftercare}

RESPONSE RULES:
- Be concise (2-3 sentences max for simple questions)
- Never guess — if info isn't above, say "Let me connect you with our team"
- Always offer to book if they seem interested
- Use the clinic's ${clinicConfig.tone || 'friendly'} tone`;
}

function buildPricingExpertBase(clinicConfig) {
  const services = (clinicConfig.services || [])
    .map(s => `- ${s.name}: $${s.price}${s.price_unit ? '/' + s.price_unit : ''}, ${s.duration}min. ${s.description || ''}`)
    .join('\n');
  
  return `YOUR ROLE: Pricing & Services Expert
You discuss treatments and pricing. Factual but explain value.

SERVICES:\n${services || 'Contact us for our full treatment menu.'}

RESPONSE RULES:
- Be transparent about pricing — never hide costs
- Explain value, not just price (e.g., "lasts 3-4 months" not just "$X")
- If asking about a treatment not listed, say "Let me check with our doctor"
- Suggest consultation for personalized recommendations
- NEVER give medical advice or diagnose
- Use the clinic's ${clinicConfig.tone || 'friendly'} tone`;
}

function buildBookingExpertBase(clinicConfig) {
  const hours = formatHours(clinicConfig.operating_hours);
  const services = (clinicConfig.services || [])
    .map(s => `- ${s.name}: ${s.duration}min`)
    .join('\n');
  
  return `YOUR ROLE: Booking Expert
You handle ALL appointment operations. Strictest rules — must confirm details, never assumes.

OPERATING HOURS: ${hours}
AVAILABLE SERVICES:\n${services || 'Contact us for services'}

BOOKING RULES (STRICT — never break):
1. ALWAYS confirm patient's NAME and PHONE before creating a booking
2. ALWAYS confirm the EXACT treatment, date, and time before booking
3. Check availability using the check_availability function — never assume
4. For cancellations: verify identity with phone number first
5. For reschedules: cancel old appointment first, then create new one
6. If no slots available: offer waitlist (if enabled) or suggest alternative dates
7. Auto-confirm is ${clinicConfig.booking_auto_confirm ? 'ON' : 'OFF'}
8. Same-day booking is ${clinicConfig.booking_allow_same_day !== false ? 'allowed' : 'not allowed'}
9. Max advance booking: ${clinicConfig.booking_max_advance_days || 30} days
10. Min notice: ${clinicConfig.booking_min_notice_hours || 2} hours
11. Phone required: ${clinicConfig.booking_require_phone !== false ? 'YES' : 'optional'}

TONE: Professional, organized, efficient. Double-check everything.`;
}

function buildEmpathyExpertBase(clinicConfig) {
  return `YOUR ROLE: Patient Care Specialist
You handle concerns and complaints. Warm, empathetic, always offers human handoff.

YOUR ROLE:
- Listen with empathy and patience
- Acknowledge feelings before offering solutions
- Never be defensive or dismissive
- Take responsibility: "I'm sorry to hear that"
- ALWAYS offer to connect them with a human staff member
- NEVER argue with an upset patient

CLINIC CONTACT:
- Phone: ${clinicConfig.phone || 'Please contact us'}
- WhatsApp: ${clinicConfig.whatsapp_number || clinicConfig.phone || ''}

ESCALATION RULES:
- If patient mentions pain, injury, medical emergency → URGE them to call clinic immediately
- If patient is very upset (3+ complaints) → Offer manager callback within 24 hours
- If patient asks "who do I speak to about this" → Provide direct phone number

TONE: Warm, caring, sincere. Use emojis sparingly (✨ 💫 🌟).`;
}

function buildUpsellExpertBase(clinicConfig) {
  const services = (clinicConfig.services || [])
    .map(s => `- ${s.name}: $${s.price}${s.price_unit ? '/' + s.price_unit : ''}, ${s.duration}min. ${s.description || ''}`)
    .join('\n');
  
  return `YOUR ROLE: Treatment Advisor
You suggest treatments that complement what the patient is already interested in.

SERVICES:\n${services || 'Contact us for our menu'}

RESPONSE RULES:
- ONLY suggest treatments that genuinely complement their expressed interest
- Never push — suggest and let them decide
- Frame as "Many patients also enjoy..."
- Explain WHY it complements
- If they show price sensitivity, focus on value and long-term results
- NEVER give medical advice or diagnose
- If unsure about suitability, recommend a consultation
- Offer to bundle with their current booking if possible

TONE: Helpful, consultative, never salesy.`;
}

// ─── PROMPT BUILDER WITH PERSONALITY ──────────────────────────────

function buildExpertPrompt(expertKey, clinicConfig) {
  const roles = {
    INFO: 'Info & FAQ Expert',
    PRICING: 'Pricing & Services Expert',
    BOOKING: 'Booking Expert',
    EMPATHY: 'Patient Care Specialist',
    UPSELL: 'Treatment Advisor',
  };
  
  const builders = {
    INFO: buildInfoExpertBase,
    PRICING: buildPricingExpertBase,
    BOOKING: buildBookingExpertBase,
    EMPATHY: buildEmpathyExpertBase,
    UPSELL: buildUpsellExpertBase,
  };
  
  const base = builders[expertKey](clinicConfig);
  return injectPersonality(base, clinicConfig, roles[expertKey]);
}

// ─── PRIMARY CLASSIFIER ───────────────────────────────────────────

function classifyMessage(message, intents, conversationHistory) {
  const normalized = message.toLowerCase();
  const matchedIntents = intents.map(i => i.intent);
  
  const activeExperts = new Set();
  
  for (const intent of matchedIntents) {
    for (const [key, expert] of Object.entries(EXPERTS)) {
      if (expert.handles.includes(intent)) {
        activeExperts.add(key);
      }
    }
  }
  
  // Fallback: keyword-based
  if (activeExperts.size === 0) {
    if (normalized.match(/(how much|price|cost|pricing)/)) activeExperts.add('PRICING');
    if (normalized.match(/(book|appointment|schedule|slot|cancel|reschedule)/)) activeExperts.add('BOOKING');
    if (normalized.match(/(hour|open|close|time|address|location|parking|prep|after|before)/)) activeExperts.add('INFO');
    if (normalized.match(/(unhappy|disappoint|terrible|bad|complain|upset|angry|worried|scared)/)) activeExperts.add('EMPATHY');
    if (normalized.match(/(recommend|suggest|also get|what else|combine|package|bundle)/)) activeExperts.add('UPSELL');
  }
  
  if (activeExperts.size === 0) {
    activeExperts.add('INFO');
  }
  
  // Priority: Empathy > Booking > others
  const ordered = Array.from(activeExperts);
  if (ordered.includes('EMPATHY')) {
    return ['EMPATHY', ...ordered.filter(e => e !== 'EMPATHY')];
  }
  if (ordered.includes('BOOKING')) {
    return ['BOOKING', ...ordered.filter(e => e !== 'BOOKING')];
  }
  return ordered;
}

// ─── EXPERT EXECUTION ─────────────────────────────────────────────

async function executeExpert(expertKey, message, clinicConfig, conversationHistory, patientPhone) {
  const expert = EXPERTS[expertKey];
  if (!expert) throw new Error(`Unknown expert: ${expertKey}`);
  
  const systemPrompt = buildExpertPrompt(expertKey, clinicConfig);
  
  // Add conversation context (last 3 turns)
  const recentContext = conversationHistory.slice(-3).map(h => 
    `${h.role === 'user' ? 'Patient' : 'Assistant'}: ${h.content}`
  ).join('\n');
  
  const messages = [
    { role: 'system', content: systemPrompt },
    ...(recentContext ? [{ role: 'system', content: `Recent conversation:\n${recentContext}` }] : []),
    { role: 'user', content: message }
  ];
  
  const startTime = Date.now();
  
  const completion = await getOpenAI().chat.completions.create({
    model: expert.model,
    messages,
    temperature: expert.temperature,
    max_tokens: expert.maxTokens,
    ...(expert.requiresFunctions ? {
      functions: getFunctionsForExpert(expert.allowedFunctions),
      function_call: 'auto'
    } : {})
  });
  
  const response = completion.choices[0];
  const cost = estimateCost(completion.usage);
  
  return {
    expert: expert.id,
    expertName: expert.name,
    text: response.message?.content || '',
    functionCall: response.message?.function_call || null,
    cost,
    latencyMs: Date.now() - startTime,
  };
}

// ─── MULTI-EXPERT COMPOSITION ─────────────────────────────────────

async function executeExperts(expertKeys, message, clinicConfig, conversationHistory, patientPhone) {
  // Run in parallel for speed
  const results = await Promise.all(
    expertKeys.map(key => 
      executeExpert(key, message, clinicConfig, conversationHistory, patientPhone)
        .catch(err => {
          console.error(`[EXPERT] ${key} failed:`, err.message);
          return null;
        })
    )
  );
  
  const validResults = results.filter(r => r !== null);
  
  if (validResults.length === 1) {
    return {
      text: validResults[0].text,
      expertsUsed: validResults.map(r => r.expert),
      totalCost: validResults.reduce((sum, r) => sum + r.cost, 0),
      functionCall: validResults[0].functionCall,
    };
  }
  
  // Multi-expert: compose naturally via a composition prompt
  const individualResponses = validResults.map(r => `[${r.expertName}]: ${r.text}`).join('\n\n');
  
  // Use the clinic's tone to merge responses naturally
  const p = getClinicPersonality(clinicConfig);
  const mergePrompt = `You are ${p.agentName} from ${p.clinicName}. Merge these expert responses into ONE natural, flowing message. Remove any repetition. Ensure transitions are smooth. Keep the ${p.tone} tone throughout.

EXPERT RESPONSES TO MERGE:
${individualResponses}

RULES:
- Combine into ONE response (not a list of expert answers)
- Remove any "[Expert Name]" labels
- Use natural transitions like "Also, ", "In addition, ", "Regarding that, "
- End with a warm call-to-action if appropriate
- Never mention that multiple experts were involved`;

  const mergeCompletion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: mergePrompt },
      { role: 'user', content: 'Merge these into one natural response.' }
    ],
    temperature: 0.3,
    max_tokens: 500,
  });
  
  const mergedText = mergeCompletion.choices[0].message.content;
  const mergeCost = estimateCost(mergeCompletion.usage);
  
  return {
    text: mergedText,
    expertsUsed: validResults.map(r => r.expert),
    totalCost: validResults.reduce((sum, r) => sum + r.cost, 0) + mergeCost,
    functionCall: validResults.find(r => r.functionCall)?.functionCall || null,
  };
}

// ─── UTILITY FUNCTIONS ────────────────────────────────────────────

function formatHours(hours) {
  if (!hours) return 'Contact us for hours';
  if (typeof hours === 'string') return hours;
  if (typeof hours === 'object') {
    return Object.entries(hours).map(([d, t]) => `${d}: ${t}`).join(', ');
  }
  return 'Contact us for hours';
}

function getTodaySG() {
  return new Date().toLocaleDateString('en-SG', { 
    timeZone: 'Asia/Singapore',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function estimateCost(usage) {
  if (!usage) return 0;
  const inputCost = (usage.prompt_tokens || 0) * 0.15 / 1000000;
  const outputCost = (usage.completion_tokens || 0) * 0.60 / 1000000;
  return inputCost + outputCost;
}

module.exports = {
  EXPERTS,
  classifyMessage,
  executeExpert,
  executeExperts,
  buildExpertPrompt,
  getClinicPersonality,
};
