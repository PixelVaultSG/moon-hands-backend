/**
 * Moon Hands — Per-Plan Usage Limits (LIVE)
 *
 * Replaces the uniform 1,000-msg/day cap with plan-aware monthly limits:
 *   Basic:    500 msgs/month  (~17/day average)
 *   Premium:  unlimited
 *
 * Alert tiers (percentage of monthly limit):
 *   50%  → friendly admin heads-up only
 *   80%  → clinic gets nudged toward Premium upgrade
 *   95%  → clinic + admin both alerted
 *   100% → limit exceeded; service continues uninterrupted; admin notes overage
 *
 * Daily safety cap (internal, admin-only):
 *   Basic:    200/day  (prevents one viral day eating the whole month)
 *   Premium:  1,000/day
 *
 * Clinics NEVER see the hardcoded/AI split, the actual cost, or the raw
 * admin alert. They see friendly percentage-based messages with a clear
 * upgrade path to Premium.
 */

const PLAN_CONFIGS = {
  basic: {
    monthlyMessages: 500,
    dailySafetyCap: 200,
    monthlyAmount: 347, // SGD
  },
  premium: {
    monthlyMessages: Infinity,
    dailySafetyCap: 1000,
    monthlyAmount: 547, // SGD
  },
};

/**
 * Sum all daily_usage.whatsapp_messages for a given client + month.
 * @param {string} clientId
 * @param {string} yearMonth — e.g. '2026-09'
 * @returns {Promise<number>} total WhatsApp messages sent this month
 */
async function getMonthlyMessageTotal(clientId, yearMonth) {
  if (!clientId || !yearMonth) return 0;
  try {
    const { supabase } = require('../supabase/client');
    const { data, error } = await supabase
      .from('daily_usage')
      .select('whatsapp_messages')
      .eq('client_id', clientId)
      .gte('date', `${yearMonth}-01`)
      .lte('date', `${yearMonth}-31`);
    if (error) {
      console.error('[PLAN_LIMITS] monthly aggregation error:', error.message);
      return 0;
    }
    return (data || []).reduce((sum, row) => sum + (row.whatsapp_messages || 0), 0);
  } catch (err) {
    console.error('[PLAN_LIMITS] monthly aggregation exception:', err.message);
    return 0;
  }
}

/**
 * Fetch today's daily_usage row for a client.
 * @returns {Promise<{whatsapp_messages:number, hardcoded_messages:number, ai_messages:number, cost:number}>}
 */
async function getTodayUsage(clientId) {
  if (!clientId) return { whatsapp_messages: 0, hardcoded_messages: 0, ai_messages: 0, cost: 0 };
  try {
    const { supabase } = require('../supabase/client');
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('daily_usage')
      .select('whatsapp_messages, hardcoded_messages, ai_messages, cost')
      .eq('client_id', clientId)
      .eq('date', today)
      .maybeSingle();
    if (error) {
      console.error('[PLAN_LIMITS] daily read error:', error.message);
      return { whatsapp_messages: 0, hardcoded_messages: 0, ai_messages: 0, cost: 0 };
    }
    return data || { whatsapp_messages: 0, hardcoded_messages: 0, ai_messages: 0, cost: 0 };
  } catch (err) {
    console.error('[PLAN_LIMITS] daily read exception:', err.message);
    return { whatsapp_messages: 0, hardcoded_messages: 0, ai_messages: 0, cost: 0 };
  }
}

/**
 * Check monthly usage against the clinic's plan. Returns alert recommendations.
 *
 * ALERT LEVELS (percentage of monthly limit):
 *   null    → under 50%   no alert
 *   '50'    → 50-79%      friendly heads-up
 *   '80'    → 80-94%      approaching limit → clinic gets nudged toward Premium
 *   '95'    → 95-99%      critical approach   → clinic + admin both alerted
 *   '100'   → 100%+       limit exceeded      → clinic: service continues; admin: overage noted
 *
 * CLINIC NEVER SEES: the hardcoded/AI split, the actual cost, or the raw admin alert.
 * CLINIC SEES: friendly percentage-based message + Premium upgrade suggestion at 80%+.
 *
 * @param {string} clientId
 * @param {'basic'|'premium'} plan
 * @returns {Promise<{alertLevel:string|null, monthlyUsed:number, monthlyLimit:number, percentUsed:number, shouldAlertClinic:boolean, shouldAlertAdmin:boolean}>}
 */
async function checkMonthlyLimit(clientId, plan) {
  const cfg = PLAN_CONFIGS[plan] || PLAN_CONFIGS.basic;
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyUsed = await getMonthlyMessageTotal(clientId, yearMonth);
  const monthlyLimit = cfg.monthlyMessages;
  const percentUsed = monthlyLimit === Infinity ? 0 : Math.round((monthlyUsed / monthlyLimit) * 100);

  let alertLevel = null;
  let shouldAlertClinic = false;
  let shouldAlertAdmin = false;

  if (monthlyLimit === Infinity) {
    // Premium: no usage alerts, only cost alerts (handled by cost-protection.js)
    return { alertLevel: null, monthlyUsed, monthlyLimit, percentUsed, shouldAlertClinic, shouldAlertAdmin };
  }

  if (percentUsed >= 100) {
    alertLevel = '100';
    shouldAlertClinic = true;
    shouldAlertAdmin = true;
  } else if (percentUsed >= 95) {
    alertLevel = '95';
    shouldAlertClinic = true;
    shouldAlertAdmin = true;
  } else if (percentUsed >= 80) {
    alertLevel = '80';
    shouldAlertClinic = true;
    shouldAlertAdmin = false;
  } else if (percentUsed >= 50) {
    alertLevel = '50';
    shouldAlertClinic = false;
    shouldAlertAdmin = true;
  }

  return { alertLevel, monthlyUsed, monthlyLimit, percentUsed, shouldAlertClinic, shouldAlertAdmin };
}

/**
 * Daily safety cap: internal backstop to prevent one viral day from eating the whole month.
 *
 * Basic: 200/day  → alerts at 100% (admin only) and 200% (admin + escalation)
 * Premium: 1000/day → same as current cost-protection
 *
 * Clinics NEVER see daily-cap alerts. This is Moon Hands internal cost protection only.
 *
 * @param {string} clientId
 * @param {'basic'|'premium'} plan
 * @returns {Promise<{dailyUsed:number, dailyLimit:number, percentUsed:number, alertLevel:string|null, shouldAlertAdmin:boolean}>}
 */
async function checkDailySafetyCap(clientId, plan) {
  const cfg = PLAN_CONFIGS[plan] || PLAN_CONFIGS.basic;
  const todayUsage = await getTodayUsage(clientId);
  const dailyUsed = todayUsage.whatsapp_messages;
  const dailyLimit = cfg.dailySafetyCap;
  const percentUsed = Math.round((dailyUsed / dailyLimit) * 100);

  let alertLevel = null;
  let shouldAlertAdmin = false;

  if (percentUsed >= 200) {
    alertLevel = '200';
    shouldAlertAdmin = true;
  } else if (percentUsed >= 100) {
    alertLevel = '100';
    shouldAlertAdmin = true;
  }

  return { dailyUsed, dailyLimit, percentUsed, alertLevel, shouldAlertAdmin, todayUsage };
}

module.exports = {
  PLAN_CONFIGS,
  getMonthlyMessageTotal,
  getTodayUsage,
  checkMonthlyLimit,
  checkDailySafetyCap,
};
