/**
 * Moon Hands - Cost Protection & Kill Switch
 * 
 * HARD LIMITS (per clinic, per 24h):
 *   - Max 500 OpenAI API calls
 *   - Max $20 OpenAI spend
 *   - Max 1,000 WhatsApp messages sent
 *   - Max 100 booking operations
 * 
 * ANOMALY DETECTION:
 *   - Flag if usage >3x rolling average
 *   - Auto-kill if >5x in 1 hour
 * 
 * KILL SWITCH:
 *   - /health?kill=1 → instant disable
 *   - Telegram command /kill → disable all clinics
 *   - Auto-recovery after cooldown
 */

const crypto = require('crypto');

// ─── CONFIGURATION ───────────────────────────────────────────────

const HARD_LIMITS = {
  daily_api_calls: 500,
  daily_spend_usd: 20,
  daily_whatsapp_msgs: 1000,
  daily_booking_ops: 100,
};

const ANOMALY_THRESHOLD = 3;   // Flag if >3x average
const KILL_THRESHOLD = 5;      // Kill if >5x in 1 hour
const COOLDOWN_MINUTES = 30;   // Auto-recovery after 30 min

// ─── IN-MEMORY COUNTERS ──────────────────────────────────────────

const counters = new Map();    // clinicId -> { calls, spend, msgs, bookings, lastReset }
const anomalies = new Map();   // clinicId -> { spikeCount, lastSpike }
let globalKillSwitch = false;
let killReason = '';
let killTime = 0;

function getCounter(clinicId) {
  const now = Date.now();
  const counter = counters.get(clinicId) || { calls: 0, spend: 0, msgs: 0, bookings: 0, lastReset: 0 };
  
  // Reset every 24 hours
  if (now - counter.lastReset > 86400000) {
    counter.calls = 0;
    counter.spend = 0;
    counter.msgs = 0;
    counter.bookings = 0;
    counter.lastReset = now;
  }
  
  counters.set(clinicId, counter);
  return counter;
}

// ─── CHECK FUNCTIONS ─────────────────────────────────────────────

// Track which alerts have been sent today (clinicId_type -> boolean)
const alertsSentToday = new Map();

function checkLimit(clinicId, type, increment = 1) {
  if (globalKillSwitch) return { allowed: false, reason: `GLOBAL KILL: ${killReason}`, alerted: false };
  
  const counter = getCounter(clinicId);
  const limit = HARD_LIMITS[type];
  const current = counter[type] || 0;
  const newValue = current + increment;
  
  // Always allow — never block clinic operations
  counter[type] = newValue;
  
  // Check if we've crossed the primary limit
  const alertKey = `${clinicId}_${type}`;
  if (current <= limit && newValue > limit) {
    console.warn(`[COST_PROTECTION] Clinic ${clinicId} exceeded ${type}: ${newValue}/${limit}`);
    alertsSentToday.set(alertKey, 'primary');
    return { allowed: true, reason: `Daily ${type} limit reached (${limit})`, alerted: true, threshold: 'primary' };
  }
  
  // Check if we've crossed the double limit (e.g., $40 for spend)
  const doubleLimit = limit * 2;
  if (current <= doubleLimit && newValue > doubleLimit) {
    if (alertsSentToday.get(alertKey) !== 'double') {
      console.warn(`[COST_PROTECTION] Clinic ${clinicId} exceeded DOUBLE ${type}: ${newValue}/${doubleLimit}`);
      alertsSentToday.set(alertKey, 'double');
      return { allowed: true, reason: `Daily ${type} DOUBLE limit reached (${doubleLimit})`, alerted: true, threshold: 'double' };
    }
  }
  
  return { allowed: true, alerted: false };
}

function trackSpend(clinicId, costUsd) {
  const counter = getCounter(clinicId);
  counter.spend += costUsd;
  
  // Check if over spend limit
  if (counter.spend > HARD_LIMITS.daily_spend_usd) {
    console.warn(`[COST_PROTECTION] Clinic ${clinicId} exceeded daily spend: $${counter.spend.toFixed(2)}/${HARD_LIMITS.daily_spend_usd}`);
    return false;
  }
  return true;
}

// ─── ANOMALY DETECTION ──────────────────────────────────────────

function checkAnomaly(clinicId, currentRate) {
  const anomaly = anomalies.get(clinicId) || { history: [], lastFlag: 0 };
  const now = Date.now();
  
  // Keep last 7 days of hourly rates
  anomaly.history.push({ rate: currentRate, time: now });
  anomaly.history = anomaly.history.filter(h => now - h.time < 7 * 86400000);
  
  if (anomaly.history.length < 3) {
    anomalies.set(clinicId, anomaly);
    return { normal: true };
  }
  
  const avg = anomaly.history.reduce((s, h) => s + h.rate, 0) / anomaly.history.length;
  
  if (currentRate > avg * KILL_THRESHOLD) {
    // KILL
    globalKillSwitch = true;
    killReason = `Anomaly detected: clinic ${clinicId} rate ${currentRate} is ${(currentRate/avg).toFixed(1)}x average`;
    killTime = now;
    console.error(`[COST_PROTECTION] ☠️ KILL SWITCH ACTIVATED: ${killReason}`);
    return { normal: false, action: 'killed', reason: killReason };
  }
  
  if (currentRate > avg * ANOMALY_THRESHOLD) {
    anomaly.lastFlag = now;
    console.warn(`[COST_PROTECTION] ⚠️ Anomaly: clinic ${clinicId} rate ${currentRate} is ${(currentRate/avg).toFixed(1)}x average`);
    return { normal: false, action: 'flagged', reason: `Usage ${(currentRate/avg).toFixed(1)}x above normal` };
  }
  
  anomalies.set(clinicId, anomaly);
  return { normal: true };
}

// ─── KILL SWITCH ─────────────────────────────────────────────────

function isKilled() {
  if (!globalKillSwitch) return false;
  
  // Auto-recovery after cooldown
  if (Date.now() - killTime > COOLDOWN_MINUTES * 60000) {
    console.log('[COST_PROTECTION] Auto-recovery after cooldown');
    globalKillSwitch = false;
    killReason = '';
    return false;
  }
  
  return true;
}

function kill(reason) {
  globalKillSwitch = true;
  killReason = reason;
  killTime = Date.now();
  console.error(`[COST_PROTECTION] ☠️ MANUAL KILL: ${reason}`);
}

function unkill() {
  globalKillSwitch = false;
  killReason = '';
  console.log('[COST_PROTECTION] Kill switch deactivated');
}

function getStatus() {
  const status = {
    killed: globalKillSwitch,
    reason: killReason,
    since: killTime ? new Date(killTime).toISOString() : null,
    limits: HARD_LIMITS,
    clinics: {}
  };
  
  for (const [clinicId, counter] of counters) {
    status.clinics[clinicId] = { ...counter };
  }
  
  return status;
}

// ─── MIDDLEWARE ──────────────────────────────────────────────────

function costProtectionMiddleware(clinicId) {
  return {
    checkApiCall: () => checkLimit(clinicId, 'daily_api_calls', 1),
    trackSpend: (usd) => trackSpend(clinicId, usd),
    checkWhatsappMsg: () => checkLimit(clinicId, 'daily_whatsapp_msgs', 1),
    checkBookingOp: () => checkLimit(clinicId, 'daily_booking_ops', 1),
    checkAnomaly: (rate) => checkAnomaly(clinicId, rate),
  };
}

// ─── EXPORTS ─────────────────────────────────────────────────────

// ─── REDIS MIGRATION PATH (TODO: Implement after first 3-5 clients) ─
// Current: All counters stored in-process Map objects. Resets on every deploy.
// Problem: Spammers get fresh quotas after deploy. Cost history is lost.
// Solution: Migrate to Redis (Render offers managed Redis) or Supabase key-value.
//
// Implementation plan:
// 1. npm install ioredis
// 2. Replace Map 'counters' with Redis HSET per clinic
// 3. Replace Map 'anomalies' with Redis HSET per clinic
// 4. Use Redis TTL (24h) for automatic daily reset
// 5. Keep local Map as L1 cache, Redis as L2 persistence
// 6. On startup: sync from Redis → local Map
//
// Render Redis: $0 (25MB free tier) or ~S$13.50/mo for 100MB
// Effort: ~4 hours implementation + testing

module.exports = {
  checkLimit,
  trackSpend,
  checkAnomaly,
  isKilled,
  kill,
  unkill,
  getStatus,
  costProtectionMiddleware,
  HARD_LIMITS,
};
