/**
 * Moon Hands — Smart Router
 * Hybrid system: hardcoded responses for common queries, OpenAI for complex ones.
 * 
 * Architecture:
 *   Patient message → Intent Matcher → Simple match? → Hardcoded handler ($0)
 *                                      Complex/no match? → OpenAI GPT-4o mini
 * 
 * Multi-intent: "What are your hours and how much is Botox?"
 *   → detects [operating_hours, pricing_specific] 
 *   → executes both handlers → composes one natural response
 * 
 * Savings: ~60-70% of messages answered without OpenAI API call.
 */

const { matchIntents } = require('./intent-matcher');
const { executeHandler } = require('./intent-handlers');
const { composeResponse } = require('./response-composer');
// NOTE: Lazy require of bot-engine below to avoid circular dependency
// bot-engine.js requires smart-router.js, so we can't require it at the top level

// Intents that ALWAYS go to OpenAI (too complex/emotional for hardcoding)
const AI_ONLY_INTENTS = [
  'complaint',
  'vague_question',
  'emotional_support',
];

// If message has 3+ intents, it's probably complex — send to OpenAI
const MAX_INTENTS_FOR_HARDCODED = 2;

/**
 * Main entry point. Routes message to hardcoded handler or OpenAI.
 * 
 * @param {string} message - Patient's message
 * @param {object} clinicConfig - Full clinic config from Supabase
 * @param {string} patientPhone - For booking lookups
 * @param {string} conversationHistory - Recent context
 * @returns {object} { text, source, intents, cost_saved }
 */
async function routeMessage(message, clinicConfig, patientPhone = null, conversationHistory = []) {
  const startTime = Date.now();
  
  // Step 1: Detect all intents (supports multi-intent)
  const matchedIntents = matchIntents(message, conversationHistory);
  
  // Step 2: Decide routing
  const shouldUseOpenAI = checkShouldUseOpenAI(matchedIntents, message);
  
  if (shouldUseOpenAI) {
    // Complex case — send to OpenAI (lazy require to break circular dependency)
    const { processMessage: openAIProcess } = require('./bot-engine');
    const result = await openAIProcess(message, clinicConfig.id, conversationHistory);
    return {
      text: result.text,
      source: 'openai',
      intents: matchedIntents.map(i => i.intent),
      function_called: result.function_called || null,
      cost_saved: 0,
      latency_ms: Date.now() - startTime
    };
  }
  
  // Step 3: Execute hardcoded handlers for each matched intent
  const responses = [];
  for (const match of matchedIntents) {
    try {
      const response = await executeHandler(match.intent, {
        message,
        clinicConfig,
        patientPhone,
        params: match.params,
        conversationHistory
      });
      if (response) responses.push(response);
    } catch (err) {
      console.error(`[SMART_ROUTER] Handler error for ${match.intent}:`, err.message);
    }
  }
  
  // Step 4: Compose into one natural response
  const composedText = composeResponse(responses, matchedIntents, clinicConfig);
  
  // Step 5: Track cost savings
  const costSaved = estimateCostSaved(matchedIntents);
  
  return {
    text: composedText,
    source: 'hardcoded',
    intents: matchedIntents.map(i => i.intent),
    function_called: null,
    cost_saved: costSaved,
    latency_ms: Date.now() - startTime
  };
}

/**
 * Decide if message should go to OpenAI despite intent matches.
 */
function checkShouldUseOpenAI(intents, message) {
  // No intents detected — OpenAI handles
  if (intents.length === 0) return true;
  
  // Too many intents — probably complex/nuanced
  if (intents.length > MAX_INTENTS_FOR_HARDCODED) return true;
  
  // Contains AI-only intent
  if (intents.some(i => AI_ONLY_INTENTS.includes(i.intent))) return true;
  
  // Long message (>200 chars) — might have hidden complexity
  if (message.length > 200 && intents.length > 1) return true;
  
  // Emotional language detected
  const emotionalWords = ['worried', 'scared', 'nervous', 'anxious', 'upset', 'angry', 'frustrated', 'disappointed'];
  if (emotionalWords.some(w => message.toLowerCase().includes(w))) return true;
  
  return false;
}

/**
 * Estimate how much we saved by not calling OpenAI.
 * GPT-4o mini: ~$0.0002 per call (input+output averaged)
 */
function estimateCostSaved(intents) {
  return intents.length * 0.0002;
}

module.exports = { routeMessage };
