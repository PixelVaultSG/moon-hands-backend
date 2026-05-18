/**
 * Moon Hands Usage Tracker & Rolling Limit System
 * 
 * Core Principle: Unused messages roll forward. No client is ever cut off.
 * We track, alert, and optimize — but never block.
 * 
 * How Rolling Limits Work:
 *   Day 1: Limit 16, Used 4 → 12 unused → rolls to Day 2
 *   Day 2: Limit 16 + 12 = 28, Used 15 → 13 unused → rolls to Day 3
 *   Day 3: Limit 16 + 13 = 29, Used 20 → 9 unused → rolls to Day 4
 *   Day 4: Limit 16 + 9 = 25, Used 30 → 0 unused (can't go negative)
 *   Day 5: Limit 16 + 0 = 16
 * 
 * This means a clinic with a quiet Monday can handle a busy Saturday
 * without ever hitting a wall.
 * 
 * What We Track Per Client:
 *   - Daily usage (AI calls + hardcoded replies)
 *   - Rolling available balance
 *   - Rollover pool (unused from previous days)
 *   - 90% usage alerts (sent to admin via Telegram)
 *   - Cost per message (OpenAI cost tracking)
 * 
 * What We Track for Business:
 *   - Total OpenAI cost across all clients per day
 *   - Revenue vs cost per client (profitability)
 *   - End-of-day consolidated expense report
 */

// ─── PLAN CONFIGURATION ───────────────────────────────────────────

const PLAN_CONFIGS = {
  starter: {
    name: 'Starter',
    monthlyMessages: 500,
    dailyBaseLimit: Math.ceil(500 / 30), // ~17/day
    aiCallBudgetPerDay: 50, // ~$0.15/day in OpenAI costs
    pricePerMonth: 347,
  },
  professional: {
    name: 'Professional',
    monthlyMessages: Infinity, // Unlimited
    dailyBaseLimit: Infinity,
    aiCallBudgetPerDay: 200, // ~$0.60/day in OpenAI costs
    pricePerMonth: 547,
  },
};

// ─── IN-MEMORY STORE (per-client tracking) ────────────────────────
// Production: This should be in Supabase. In-memory for now with disk backup.

const clientStore = new Map(); // clientId -> usage record
const dailyBusinessReport = new Map(); // YYYY-MM-DD -> consolidated data

function getClientRecord(clientId) {
  return clientStore.get(clientId) || createClientRecord();
}

function setClientRecord(clientId, record) {
  clientStore.set(clientId, record);
}

function createClientRecord() {
  const today = getTodayString();
  return {
    dailyUsage: {}, // YYYY-MM-DD -> { totalMessages, aiCalls, hardcodedReplies, cost }
    rolloverBalance: 0, // Unused messages rolling forward
    lastAlertSent: null, // '90' | '100' | null — prevent spam alerts
    lastActivity: Date.now(),
    createdAt: today,
  };
}

// ─── CORE: ROLLING LIMIT CALCULATOR ───────────────────────────────

/**
 * Calculate today's available message limit for a client.
 * Formula: available = dailyBaseLimit + rolloverBalance
 * 
 * @param {string} clientId — client identifier
 * @param {string} plan — 'starter' | 'professional'
 * @returns {object} { available, baseLimit, rollover, usedToday, remaining }
 */
function calculateTodaysLimit(clientId, plan = 'starter') {
  const config = PLAN_CONFIGS[plan] || PLAN_CONFIGS.starter;
  
  // Professional = unlimited
  if (config.monthlyMessages === Infinity) {
    return {
      available: Infinity,
      baseLimit: Infinity,
      rollover: Infinity,
      usedToday: getTodaysUsage(clientId).totalMessages || 0,
      remaining: Infinity,
      percentUsed: 0,
    };
  }
  
  const record = getClientRecord(clientId);
  const today = getTodayString();
  
  // Clean up: if last tracked day was before yesterday, rollover expired
  const yesterday = getYesterdayString();
  const lastTrackedDay = Object.keys(record.dailyUsage).sort().pop();
  
  if (lastTrackedDay && lastTrackedDay < yesterday) {
    // Gap of 2+ days — reset rollover (prevent stale accumulation)
    // Rationale: If clinic was closed for a week, old rollover shouldn't
    // create a massive spike day. Keep max 3 days of rollover.
    const gapDays = daysBetween(lastTrackedDay, yesterday);
    if (gapDays > 3) {
      record.rolloverBalance = Math.min(record.rolloverBalance, config.dailyBaseLimit * 3);
    }
  }
  
  const baseLimit = config.dailyBaseLimit;
  const rollover = record.rolloverBalance;
  const available = baseLimit + rollover;
  const usedToday = record.dailyUsage[today]?.totalMessages || 0;
  const remaining = Math.max(0, available - usedToday);
  const percentUsed = available > 0 ? Math.min(100, (usedToday / available) * 100) : 0;
  
  return { available, baseLimit, rollover, usedToday, remaining, percentUsed };
}

// ─── MESSAGE TRACKING ─────────────────────────────────────────────

/**
 * Record a message exchange for a client.
 * Call this AFTER the AI has responded to the patient.
 * 
 * @param {string} clientId 
 * @param {string} plan 
 * @param {boolean} usedAI — true if OpenAI was called, false if hardcoded
 * @param {number} aiCost — OpenAI API cost in USD (0 if hardcoded)
 */
function recordMessage(clientId, plan = 'starter', usedAI = false, aiCost = 0) {
  const record = getClientRecord(clientId);
  const today = getTodayString();
  
  // Initialize today's record if needed
  if (!record.dailyUsage[today]) {
    record.dailyUsage[today] = {
      totalMessages: 0,
      aiCalls: 0,
      hardcodedReplies: 0,
      aiCost: 0,
    };
  }
  
  record.dailyUsage[today].totalMessages++;
  
  if (usedAI) {
    record.dailyUsage[today].aiCalls++;
    record.dailyUsage[today].aiCost += aiCost;
  } else {
    record.dailyUsage[today].hardcodedReplies++;
  }
  
  record.lastActivity = Date.now();
  setClientRecord(clientId, record);
  
  // Calculate current status
  const status = calculateTodaysLimit(clientId, plan);
  
  return status;
}

// ─── END-OF-DAY: CALCULATE ROLLOVER ──────────────────────────────

/**
 * Run at midnight (or first message of new day).
 * Calculates yesterday's unused messages and adds to rollover.
 * 
 * @param {string} clientId 
 * @param {string} plan 
 * @returns {object} { yesterdayUsed, yesterdayLimit, rolloverAdded, newRolloverTotal }
 */
function calculateEndOfDayRollover(clientId, plan = 'starter') {
  const config = PLAN_CONFIGS[plan] || PLAN_CONFIGS.starter;
  
  if (config.monthlyMessages === Infinity) {
    return { unlimited: true };
  }
  
  const record = getClientRecord(clientId);
  const yesterday = getYesterdayString();
  const yesterdayData = record.dailyUsage[yesterday] || { totalMessages: 0 };
  const yesterdayUsed = yesterdayData.totalMessages;
  
  // Yesterday's limit = base + previous rollover
  const prevRollover = record.rolloverBalance;
  const yesterdayLimit = config.dailyBaseLimit + prevRollover;
  
  // Unused = what was left yesterday
  const unused = Math.max(0, yesterdayLimit - yesterdayUsed);
  
  // Add to rollover (cap at 5x daily base to prevent runaway accumulation)
  const maxRollover = config.dailyBaseLimit * 5;
  record.rolloverBalance = Math.min(prevRollover + unused, maxRollover);
  
  // Reset alert state for new day
  record.lastAlertSent = null;
  
  setClientRecord(clientId, record);
  
  return {
    yesterdayUsed,
    yesterdayLimit,
    unusedYesterday: unused,
    rolloverAdded: unused,
    newRolloverTotal: record.rolloverBalance,
    maxRollover,
  };
}

// ─── 90% ALERT CHECK ──────────────────────────────────────────────

/**
 * Check if client is at 90% or 100% of today's limit.
 * Returns alert info if threshold crossed (prevents duplicate alerts).
 * 
 * @param {string} clientId 
 * @param {string} plan 
 * @returns {object | null} alert info or null
 */
function checkUsageAlert(clientId, plan = 'starter') {
  const config = PLAN_CONFIGS[plan] || PLAN_CONFIGS.starter;
  
  if (config.monthlyMessages === Infinity) return null; // No alerts for unlimited
  
  const record = getClientRecord(clientId);
  const status = calculateTodaysLimit(clientId, plan);
  
  // Already alerted at this level today
  if (record.lastAlertSent === '100' && status.percentUsed >= 100) return null;
  if (record.lastAlertSent === '90' && status.percentUsed >= 90 && status.percentUsed < 100) return null;
  
  if (status.percentUsed >= 100 && record.lastAlertSent !== '100') {
    record.lastAlertSent = '100';
    setClientRecord(clientId, record);
    return {
      level: '100',
      severity: 'warning',
      message: `${config.name} client ${clientId} has reached 100% of today's rolling limit (${status.usedToday}/${Math.floor(status.available)} messages). Rollover pool: ${status.rollover} messages.`,
      status,
    };
  }
  
  if (status.percentUsed >= 90 && record.lastAlertSent !== '90') {
    record.lastAlertSent = '90';
    setClientRecord(clientId, record);
    return {
      level: '90',
      severity: 'info',
      message: `${config.name} client ${clientId} is at 90% of today's rolling limit (${status.usedToday}/${Math.floor(status.available)} messages). ${Math.floor(status.remaining)} messages remaining today.`,
      status,
    };
  }
  
  return null;
}

// ─── CONSOLIDATED DAILY EXPENSE REPORT ───────────────────────────

/**
 * Generate end-of-day consolidated business report.
 * Run once per day at midnight.
 * 
 * @returns {object} Full daily business report
 */
function generateDailyBusinessReport() {
  const today = getTodayString();
  const yesterday = getYesterdayString();
  
  let totalOpenAICost = 0;
  let totalMessagesAllClients = 0;
  let totalAICalls = 0;
  let totalHardcoded = 0;
  let clientSummaries = [];
  
  for (const [clientId, record] of clientStore.entries()) {
    const yesterdayData = record.dailyUsage[yesterday] || {
      totalMessages: 0, aiCalls: 0, hardcodedReplies: 0, aiCost: 0
    };
    
    totalOpenAICost += yesterdayData.aiCost;
    totalMessagesAllClients += yesterdayData.totalMessages;
    totalAICalls += yesterdayData.aiCalls;
    totalHardcoded += yesterdayData.hardcodedReplies;
    
    // Find plan (default to starter)
    const plan = 'starter'; // In production, lookup from clients table
    const config = PLAN_CONFIGS[plan];
    
    clientSummaries.push({
      clientId,
      plan: config.name,
      messagesYesterday: yesterdayData.totalMessages,
      aiCalls: yesterdayData.aiCalls,
      hardcoded: yesterdayData.hardcodedReplies,
      openAICost: yesterdayData.aiCost.toFixed(4),
      revenue: config.pricePerMonth / 30, // Daily revenue
      profit: ((config.pricePerMonth / 30) - yesterdayData.aiCost).toFixed(2),
      rolloverPool: record.rolloverBalance,
    });
  }
  
  const report = {
    date: yesterday,
    generatedAt: new Date().toISOString(),
    summary: {
      totalClients: clientStore.size,
      totalMessagesYesterday: totalMessagesAllClients,
      totalAICallsYesterday: totalAICalls,
      totalHardcodedYesterday: totalHardcoded,
      totalOpenAICost: totalOpenAICost.toFixed(4),
      totalDailyRevenue: clientSummaries.reduce((s, c) => s + parseFloat(c.revenue), 0).toFixed(2),
      totalDailyProfit: clientSummaries.reduce((s, c) => s + parseFloat(c.profit), 0).toFixed(2),
      averageCostPerMessage: totalMessagesAllClients > 0 
        ? (totalOpenAICost / totalMessagesAllClients).toFixed(4) 
        : '0.0000',
    },
    clientBreakdown: clientSummaries.sort((a, b) => parseFloat(b.openAICost) - parseFloat(a.openAICost)),
  };
  
  dailyBusinessReport.set(yesterday, report);
  
  return report;
}

// ─── FORMATTED REPORT FOR TELEGRAM ────────────────────────────────

/**
 * Format the daily report for Telegram admin notification.
 */
function formatTelegramReport(report) {
  const s = report.summary;
  
  let msg = `📊 *DAILY BUSINESS REPORT — ${report.date}*\n\n`;
  msg += `*Summary:*\n`;
  msg += `• Total clients: ${s.totalClients}\n`;
  msg += `• Messages handled: ${s.totalMessagesYesterday}\n`;
  msg += `  — AI responses: ${s.totalAICallsYesterday}\n`;
  msg += `  — Hardcoded: ${s.totalHardcodedYesterday}\n`;
  msg += `• OpenAI cost: $${s.totalOpenAICost}\n`;
  msg += `• Daily revenue: $${s.totalDailyRevenue}\n`;
  msg += `• Daily profit: $${s.totalDailyProfit}\n`;
  msg += `• Avg cost/msg: $${s.averageCostPerMessage}\n\n`;
  
  msg += `*Top Clients (by AI cost):*\n`;
  report.clientBreakdown.slice(0, 5).forEach((c, i) => {
    msg += `${i + 1}. ${c.clientId}: ${c.messagesYesterday} msgs, $${c.openAICost} cost, $${c.profit} profit\n`;
  });
  
  return msg;
}

// ─── WEBHOOK INTEGRATION ──────────────────────────────────────────

/**
 * Main entry point — call this for EVERY incoming message.
 * Returns: { shouldProcess, status, alert, costTracking }
 * 
 * The webhook should ALWAYS reply to the patient (never block).
 * This function decides whether to use AI or hardcoded, and tracks costs.
 */
function processIncomingWithTracking(clientId, plan = 'starter', messageText) {
  const config = PLAN_CONFIGS[plan] || PLAN_CONFIGS.starter;
  
  // Always check for new day (calculate rollover if needed)
  const today = getTodayString();
  const record = getClientRecord(clientId);
  const lastTrackedDay = Object.keys(record.dailyUsage).sort().pop();
  
  if (lastTrackedDay && lastTrackedDay < today) {
    // New day — calculate yesterday's rollover
    calculateEndOfDayRollover(clientId, plan);
  }
  
  // Get current status
  const status = calculateTodaysLimit(clientId, plan);
  
  // Decide: AI or hardcoded?
  let useAI = true;
  let reason = 'ai_available';
  
  if (config.monthlyMessages !== Infinity) {
    // For starter plan, check if we've exceeded daily budget
    const todayData = record.dailyUsage[today] || { aiCalls: 0 };
    
    if (todayData.aiCalls >= config.aiCallBudgetPerDay) {
      // AI budget exhausted for today — switch to hardcoded
      useAI = false;
      reason = 'ai_budget_exhausted';
    } else if (status.percentUsed >= 95) {
      // Near limit — use hardcoded to save AI budget for complex queries
      const isComplexQuery = checkIfComplexQuery(messageText);
      useAI = isComplexQuery; // Only use AI for complex queries near limit
      reason = isComplexQuery ? 'ai_for_complex_only' : 'near_limit_hardcoded';
    }
  }
  
  // Check for alerts
  const alert = checkUsageAlert(clientId, plan);
  
  return {
    shouldProcess: true, // NEVER block — always reply
    useAI,
    reason,
    status,
    alert,
    estimatedCost: useAI ? 0.003 : 0, // ~$0.003 per GPT-4o-mini call
  };
}

function checkIfComplexQuery(text) {
  const complexIndicators = [
    'recommend', 'advise', 'suggest', 'compare', 'vs', 'versus',
    'nervous', 'worried', 'scared', 'anxious', 'afraid',
    'side effect', 'risk', 'dangerous', 'safe',
    'first time', 'never done', 'new patient',
  ];
  const lower = (text || '').toLowerCase();
  return complexIndicators.some(indicator => lower.includes(indicator));
}

// ─── HELPERS ──────────────────────────────────────────────────────

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getYesterdayString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA);
  const b = new Date(dateStrB);
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function getTodaysUsage(clientId) {
  const record = getClientRecord(clientId);
  const today = getTodayString();
  return record.dailyUsage[today] || { totalMessages: 0, aiCalls: 0 };
}

// ─── EXPORTS ──────────────────────────────────────────────────────

module.exports = {
  // Core functions
  calculateTodaysLimit,
  recordMessage,
  calculateEndOfDayRollover,
  checkUsageAlert,
  processIncomingWithTracking,
  generateDailyBusinessReport,
  formatTelegramReport,
  
  // Config
  PLAN_CONFIGS,
  
  // Testing
  _getStore: () => Object.fromEntries(clientStore),
  _resetStore: () => clientStore.clear(),
};

// ─── SELF-TEST ────────────────────────────────────────────────────

if (require.main === module) {
  console.log('🧪 Running usage tracker self-test...\n');
  
  const clientId = 'test-clinic-001';
  const plan = 'starter';
  
  // Simulate Day 1 (2026-05-10): 4 messages
  console.log('=== DAY 1 (May 10) ===');
  const record = getClientRecord(clientId);
  record.dailyUsage['2026-05-10'] = { totalMessages: 4, aiCalls: 2, hardcodedReplies: 2, aiCost: 0.006 };
  record.rolloverBalance = 0;
  setClientRecord(clientId, record);
  
  let status = calculateTodaysLimit(clientId, plan);
  console.log(`Messages: ${status.usedToday}/${Math.floor(status.available)} (${Math.round(status.percentUsed)}%)`);
  console.log(`Rollover pool: ${status.rollover}`);
  
  // Day 1 EOD: 17 - 4 = 13 unused → rollover
  console.log('\n=== DAY 1 EOD ROLLOVER ===');
  const yesterdayStr = getYesterdayString();
  // Manually set yesterday to 2026-05-10 for test
  record.dailyUsage['2026-05-09'] = record.dailyUsage['2026-05-10'];
  delete record.dailyUsage['2026-05-10'];
  record.dailyUsage['2026-05-10'] = { totalMessages: 4, aiCalls: 2, hardcodedReplies: 2, aiCost: 0.006 };
  
  // Now test the rollover calculation
  const rollover = calculateEndOfDayRollover(clientId, plan);
  console.log(`Yesterday used: ${rollover.yesterdayUsed}/${Math.floor(rollover.yesterdayLimit)}`);
  console.log(`Unused: ${rollover.unusedYesterday} → Rollover pool: ${rollover.newRolloverTotal}`);
  
  // Simulate Day 2: 15 messages with new rollover
  console.log('\n=== DAY 2 (May 11) ===');
  record.dailyUsage['2026-05-11'] = { totalMessages: 15, aiCalls: 8, hardcodedReplies: 7, aiCost: 0.024 };
  setClientRecord(clientId, record);
  
  status = calculateTodaysLimit(clientId, plan);
  console.log(`Messages: 15/${Math.floor(status.available)} (${Math.round((15/status.available)*100)}%)`);
  console.log(`Rollover pool: ${status.rollover}`);
  console.log(`Remaining today: ${Math.floor(status.available - 15)}`);
  
  // Day 2 EOD: used 15/30 = 15 unused → rollover becomes 13 + 15 = 28 (capped at 85)
  console.log('\n=== DAY 2 EOD ROLLOVER ===');
  record.dailyUsage['2026-05-10'] = record.dailyUsage['2026-05-11'];
  delete record.dailyUsage['2026-05-11'];
  record.dailyUsage['2026-05-11'] = { totalMessages: 15, aiCalls: 8, hardcodedReplies: 7, aiCost: 0.024 };
  
  const rollover2 = calculateEndOfDayRollover(clientId, plan);
  console.log(`Yesterday used: ${rollover2.yesterdayUsed}/${Math.floor(rollover2.yesterdayLimit)}`);
  console.log(`Unused: ${rollover2.unusedYesterday} → Rollover pool: ${rollover2.newRolloverTotal}`);
  
  // Simulate Day 3: 20 messages
  console.log('\n=== DAY 3 (May 12) ===');
  record.dailyUsage['2026-05-12'] = { totalMessages: 20, aiCalls: 10, hardcodedReplies: 10, aiCost: 0.030 };
  setClientRecord(clientId, record);
  
  status = calculateTodaysLimit(clientId, plan);
  console.log(`Messages: 20/${Math.floor(status.available)} (${Math.round((20/status.available)*100)}%)`);
  
  // Check alerts
  const alert = checkUsageAlert(clientId, plan);
  if (alert) {
    console.log(`\n⚠️ ALERT: ${alert.message}`);
  } else {
    console.log(`\n✅ No alert needed`);
  }
  
  // Generate report
  console.log('\n=== DAILY BUSINESS REPORT ===');
  const report = generateDailyBusinessReport();
  console.log(`Total clients: ${report.summary.totalClients}`);
  console.log(`Total OpenAI cost: $${report.summary.totalOpenAICost}`);
  console.log(`Total messages: ${report.summary.totalMessagesYesterday}`);
  console.log(`Avg cost/message: $${report.summary.averageCostPerMessage}`);
  console.log(`Daily profit: $${report.summary.totalDailyProfit}`);
  
  // Reset
  module.exports._resetStore();
  console.log('\n✅ Self-test complete');
}
