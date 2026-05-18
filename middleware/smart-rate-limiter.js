/**
 * Moon Hands Smart Rate Limiter
 * Multi-layer protection against spam, bots, and abuse
 * 
 * Philosophy: Block abusers, not patients.
 * A real patient sends 1-3 messages then waits for a reply.
 * An abuser/bot sends 5+ identical messages or 10+ rapid messages.
 * 
 * Three independent layers:
 * 1. REPEAT DETECTOR — Same question asked 5+ times in 10 min → throttle
 * 2. FLOOD DETECTOR — 10+ messages in 5 seconds → block temporarily  
 * 3. SESSION BUDGET — Max 30 messages per hour per phone number
 * 
 * When triggered: Send a graceful "busy" response instead of no response.
 * Never crash or return HTTP errors to 360dialog (they retry).
 */

// ─── IN-MEMORY STORE (per-phone tracking) ─────────────────────────
// In production, this would be Redis. For now, in-memory with TTL cleanup.

const phoneStore = new Map(); // phone -> { messages: [], repeatCount, blockedUntil, sessionBudget }
const STORE_TTL_MS = 60 * 60 * 1000; // Keep records for 1 hour

function getRecord(phone) {
  const key = normalizePhone(phone);
  return phoneStore.get(key);
}

function setRecord(phone, record) {
  const key = normalizePhone(phone);
  phoneStore.set(key, record);
}

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, ''); // Full normalized phone — no truncation (prevents collision attacks)
}

// Cleanup old records every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of phoneStore.entries()) {
    if (record.lastActivity && now - record.lastActivity > STORE_TTL_MS) {
      phoneStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

// ─── LAYER 1: REPEAT DETECTOR ─────────────────────────────────────

/**
 * Detects when someone asks the EXACT SAME question repeatedly.
 * Pattern: "What are your opening hours?" x5 within 10 minutes
 * 
 * Why 5 repeats? A confused patient might ask 2-3 times if reply was slow.
 * 5+ is clearly intentional spam or a stuck bot.
 * 
 * Strategy: First 4 identical messages get normal replies.
 * 5th identical: Throttled (slow reply with "I've already shared this" message).
 * After 10 min cooldown, resets.
 */
function checkRepeat(phone, messageText) {
  const record = getRecord(phone) || createRecord();
  const normalized = normalizeMessage(messageText);
  const now = Date.now();
  
  // Update record
  record.messages.push({ text: normalized, time: now, type: 'user' });
  record.lastActivity = now;
  
  // Count identical messages in last 10 minutes
  const TEN_MIN = 10 * 60 * 1000;
  const identicalCount = record.messages.filter(
    m => m.type === 'user' && m.text === normalized && now - m.time < TEN_MIN
  ).length;
  
  setRecord(phone, record);
  
  if (identicalCount >= 5) {
    return {
      allowed: false,
      reason: 'repeat_spam',
      identicalCount,
      gracefulResponse: getRepeatResponse(normalized, identicalCount),
    };
  }
  
  return { allowed: true };
}

function normalizeMessage(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '') // Keep alphanum + CJK
    .trim()
    .slice(0, 50); // Only compare first 50 chars
}

function getRepeatResponse(normalizedText, count) {
  // Send a helpful but firm response
  const responses = [
    "I've already shared this information above. If you have a different question, I'm happy to help!",
    "It seems like you're asking the same thing again. I've answered this in our chat above. Is there something else I can help with?",
    "I'm here to help, but I notice we've covered this already. Feel free to ask about our treatments, pricing, or book a consultation!",
  ];
  return responses[Math.min(count - 5, responses.length - 1)];
}

// ─── LAYER 2: FLOOD DETECTOR ──────────────────────────────────────

/**
 * Detects when someone sends a FLOOD of different messages rapidly.
 * Pattern: 10+ messages within 5 seconds
 * 
 * A real patient types one message, waits for a reply, then sends another.
 * Even a fast texter can't send 10 meaningful messages in 5 seconds.
 * This catches scripts, bots, and angry spam-tappers.
 * 
 * Strategy: Block for 60 seconds. Send one "slow down" message.
 * After 60s, they're welcome back (budget resets).
 */
function checkFlood(phone) {
  const record = getRecord(phone) || createRecord();
  const now = Date.now();
  record.lastActivity = now;
  
  // Check if currently blocked
  if (record.blockedUntil && now < record.blockedUntil) {
    const secondsLeft = Math.ceil((record.blockedUntil - now) / 1000);
    return {
      allowed: false,
      reason: 'flood_block',
      secondsLeft,
      gracefulResponse: `I'm receiving a lot of messages from you. Please wait ${secondsLeft} seconds and I'll be happy to help.`,
    };
  }
  
  // Count messages in last 5 seconds
  const FIVE_SEC = 5000;
  const recentCount = record.messages.filter(
    m => m.type === 'user' && now - m.time < FIVE_SEC
  ).length;
  
  if (recentCount >= 10) {
    // Block for 60 seconds
    record.blockedUntil = now + 60 * 1000;
    setRecord(phone, record);
    
    return {
      allowed: false,
      reason: 'flood_detected',
      recentCount,
      gracefulResponse: "I'm receiving messages very quickly. Please take a moment, and I'll be with you shortly.",
    };
  }
  
  setRecord(phone, record);
  return { allowed: true };
}

// ─── LAYER 3: SESSION BUDGET ──────────────────────────────────────

/**
 * Hourly message budget per phone number.
 * Starter plan: 500 messages/month ≈ 16/day ≈ generous per-hour budget.
 * We set a soft hourly cap of 30 messages per phone.
 * 
 * A real patient consult: 3-8 messages total.
 * Even a thorough patient won't hit 30/hour.
 * This catches sustained abuse that bypasses the other two layers.
 * 
 * Strategy: After 30 messages in one hour, send "check back later" and
 * still count toward the monthly 500 limit (for billing accuracy).
 */
function checkBudget(phone, planLimits = { hourlyMax: 30 }) {
  const record = getRecord(phone) || createRecord();
  const now = Date.now();
  record.lastActivity = now;
  
  // Count messages in last hour
  const ONE_HOUR = 60 * 60 * 1000;
  const hourCount = record.messages.filter(
    m => m.type === 'user' && now - m.time < ONE_HOUR
  ).length;
  
  if (hourCount >= planLimits.hourlyMax) {
    return {
      allowed: false,
      reason: 'hourly_budget',
      hourCount,
      gracefulResponse: "I've answered many questions for you this hour. If you need more assistance, feel free to reach out again shortly. You can also call us at +65 6123 4567.",
    };
  }
  
  setRecord(phone, record);
  return { allowed: true, hourCount };
}

// ─── MASTER CHECK (runs all 3 layers) ─────────────────────────────

/**
 * Main entry point. Call this before processing any incoming message.
 * Returns: { allowed, reason?, gracefulResponse?, meta? }
 * 
 * Usage in webhook handler:
 *   const check = checkMessageRate(phone, messageText);
 *   if (!check.allowed) {
 *     return sendWhatsAppReply(phone, check.gracefulResponse);
 *   }
 *   // Proceed to AI processing
 */
function checkMessageRate(phone, messageText, planLimits) {
  // Layer 2 first: flood is most urgent
  const floodCheck = checkFlood(phone);
  if (!floodCheck.allowed) return floodCheck;
  
  // Layer 1: repeat detection
  const repeatCheck = checkRepeat(phone, messageText);
  if (!repeatCheck.allowed) return repeatCheck;
  
  // Layer 3: session budget
  const budgetCheck = checkBudget(phone, planLimits);
  if (!budgetCheck.allowed) return budgetCheck;
  
  // All clear
  return {
    allowed: true,
    meta: {
      hourCount: budgetCheck.hourCount,
      messageCount: (getRecord(phone)?.messages || []).filter(m => m.type === 'user').length,
    }
  };
}

// ─── AI COST TRACKER ──────────────────────────────────────────────

/**
 * Track OpenAI API calls to stay within daily budget.
 * Separated from rate limiting — this is about COST, not abuse.
 * 
 * If daily budget exceeded: Switch ALL responses to hardcoded only.
 * No patient gets blocked. They just get simpler (but still accurate) replies.
 */
let dailyAICalls = 0;
const MAX_AI_DAILY = 200; // ~$0.60/day at GPT-4o-mini pricing

function trackAICall() {
  dailyAICalls++;
  return {
    withinBudget: dailyAICalls <= MAX_AI_DAILY,
    usedToday: dailyAICalls,
    remainingToday: Math.max(0, MAX_AI_DAILY - dailyAICalls),
  };
}

// Reset daily counter at midnight
function scheduleDailyReset() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const msUntilMidnight = midnight.getTime() - now.getTime();
  
  setTimeout(() => {
    dailyAICalls = 0;
    scheduleDailyReset(); // Schedule next reset
  }, msUntilMidnight);
}
scheduleDailyReset();

// ─── TELEGRAM ALERTS ──────────────────────────────────────────────

/**
 * Send admin alert when rate limits trigger repeatedly from same number.
 * Helps identify sustained abuse attempts.
 */
function shouldAlertAdmin(phone, reason) {
  const record = getRecord(phone);
  if (!record) return false;
  
  const now = Date.now();
  const FIFTEEN_MIN = 15 * 60 * 1000;
  
  // Alert if same phone triggers same limit 3+ times in 15 minutes
  const recentTriggers = (record.limitTriggers || []).filter(
    t => t.reason === reason && now - t.time < FIFTEEN_MIN
  ).length;
  
  if (!record.limitTriggers) record.limitTriggers = [];
  record.limitTriggers.push({ reason, time: now });
  
  return recentTriggers >= 2; // Alert on 3rd trigger (0-indexed: 2 means 3 total)
}

// ─── HELPERS ──────────────────────────────────────────────────────

function createRecord() {
  return {
    messages: [],
    limitTriggers: [],
    blockedUntil: null,
    lastActivity: Date.now(),
  };
}

// ─── EXPORTS ──────────────────────────────────────────────────────

module.exports = {
  checkMessageRate,
  checkRepeat,      // Layer 1
  checkFlood,       // Layer 2
  checkBudget,      // Layer 3
  trackAICall,
  shouldAlertAdmin,
  // For testing
  _resetStore: () => phoneStore.clear(),
  _getStoreSize: () => phoneStore.size,
};

// ─── SELF-TEST (runs on module load in dev) ──────────────────────

if (process.env.NODE_ENV === 'development') {
  console.log('[RATE_LIMITER] Smart rate limiter loaded');
  console.log('  Layer 1: Repeat detector (5 identical in 10 min)');
  console.log('  Layer 2: Flood detector (10 messages in 5 sec, 60s block)');
  console.log('  Layer 3: Session budget (30 messages per hour)');
  console.log('  Cost cap: 200 AI calls per day (~$0.60)');
}
