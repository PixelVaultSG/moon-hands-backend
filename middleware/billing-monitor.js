/**
 * Moon Hands — Billing & Subscription Monitor
 *
 * Tracks payment status per clinic, calculates due dates, and generates
 * admin alerts for upcoming / overdue payments.
 *
 * Philosophy: Start simple (manual tracking) because Singapore B2B clinics
 * typically pay via bank transfer / PayNow. Stripe integration can be added
 * later without changing this schema.
 *
 * Payment lifecycle:
 *   active        → paying normally
 *   grace_period  → 1-3 days after due date; service continues; daily admin alerts
 *   overdue       → 4-7 days after due; admin escalated; manual decision to suspend
 *   suspended     → bot stops auto-replying; clinic sees "technical difficulties"
 */

const { supabase } = require('../supabase/client');

// Grace period before a clinic is considered truly overdue
const GRACE_PERIOD_DAYS = 3;
const SUSPENSION_THRESHOLD_DAYS = 7;

/**
 * Parse a YYYY-MM-DD string as a local Date (no UTC shift).
 */
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Format a Date as YYYY-MM-DD in local time (no UTC shift).
 */
function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Add one month to a date, keeping the billing day consistent.
 * If the target month doesn't have enough days, clamps to the last day.
 */
function addOneMonth(date, billingDay) {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, billingDay);
  // If the target month has fewer days than billingDay, JS rolls over.
  // Clamp back to the last day of the target month.
  if (next.getDate() !== billingDay) {
    next.setDate(0);
  }
  return next;
}

/**
 * Get a client's billing status.
 * @returns {Promise<{client:object, daysUntilDue:number, daysOverdue:number, status:string, nextDueDate:string}>}
 */
async function getBillingStatus(clientId) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, slug, name, plan, billing_day, last_paid_date, payment_status, monthly_amount, telegram_chat_id')
    .eq('id', clientId)
    .single();
  if (error || !data) return null;

  const now = new Date();
  const billingDay = data.billing_day || 1;
  const lastPaid = data.last_paid_date ? parseLocalDate(data.last_paid_date) : null;

  let nextDue = null;
  let daysUntilDue = Infinity;
  let daysOverdue = 0;
  let effectiveStatus = data.payment_status || 'active';

  if (lastPaid) {
    // Subscription model: nextDue = lastPaid + 1 month
    nextDue = addOneMonth(lastPaid, billingDay);
    daysUntilDue = Math.ceil((nextDue - now) / (1000 * 60 * 60 * 24));

    if (daysUntilDue < 0) {
      daysOverdue = -daysUntilDue;
      if (daysOverdue > 0 && daysOverdue <= GRACE_PERIOD_DAYS) {
        effectiveStatus = 'grace_period';
      } else if (daysOverdue > GRACE_PERIOD_DAYS) {
        effectiveStatus = 'overdue';
      }
    }
  }

  return {
    client: data,
    daysUntilDue,
    daysOverdue,
    status: effectiveStatus,
    nextDueDate: nextDue ? formatLocalDate(nextDue) : null,
  };
}

/**
 * Check ALL active clinics and return those needing attention.
 * @returns {Promise<Array<{client:object, daysUntilDue:number, daysOverdue:number, status:string, alertLevel:string}>>}
 */
async function checkAllClinics() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, slug, name, plan, billing_day, last_paid_date, payment_status, monthly_amount, telegram_chat_id')
    .in('status', ['active', 'paused']);
  if (error) { console.error('[BILLING] checkAllClinics error:', error.message); return []; }

  const now = new Date();
  const results = [];

  for (const c of (data || [])) {
    const billingDay = c.billing_day || 1;
    const lastPaid = c.last_paid_date ? parseLocalDate(c.last_paid_date) : null;

    let nextDue = null;
    let daysUntilDue = Infinity;
    let daysOverdue = 0;
    let effectiveStatus = c.payment_status || 'active';
    let alertLevel = null;

    if (lastPaid) {
      // Subscription model: nextDue = lastPaid + 1 month
      nextDue = addOneMonth(lastPaid, billingDay);
      daysUntilDue = Math.ceil((nextDue - now) / (1000 * 60 * 60 * 24));

      if (daysUntilDue < 0) {
        daysOverdue = -daysUntilDue;
        if (daysOverdue > 0 && daysOverdue <= GRACE_PERIOD_DAYS) {
          effectiveStatus = 'grace_period';
          alertLevel = 'grace';
        } else if (daysOverdue > GRACE_PERIOD_DAYS && daysOverdue < SUSPENSION_THRESHOLD_DAYS) {
          effectiveStatus = 'overdue';
          alertLevel = 'overdue';
        } else if (daysOverdue >= SUSPENSION_THRESHOLD_DAYS) {
          effectiveStatus = 'overdue';
          alertLevel = 'critical';
        }
      }
    } else {
      // Never paid — treat as new clinic on trial
      effectiveStatus = 'active';
      alertLevel = null;
    }

    // Trigger alerts for upcoming due dates
    if (!alertLevel && daysUntilDue <= 7 && daysUntilDue >= 0) alertLevel = 'upcoming';
    if (!alertLevel && daysUntilDue === 0) alertLevel = 'due_today';

    results.push({
      client: c,
      daysUntilDue,
      daysOverdue,
      status: effectiveStatus,
      alertLevel,
      nextDueDate: nextDue ? formatLocalDate(nextDue) : null,
    });
  }
  return results;
}

/**
 * Record a manual payment.
 * Each payment extends the subscription by 1 month from the current period end.
 * @param {string} clientId
 * @param {number} amount — SGD
 * @param {string} method — bank_transfer | paynow | stripe | cash | other
 * @param {string} reference — transaction reference
 * @param {string} billingPeriod — YYYY-MM (for record keeping)
 * @param {string} notes — optional
 * @returns {Promise<{success:boolean, error?:string}>}
 */
async function recordPayment(clientId, amount, method, reference, billingPeriod, notes = '') {
  try {
    const { error: payErr } = await supabase
      .from('payments')
      .insert({
        client_id: clientId,
        amount,
        currency: 'SGD',
        method,
        reference,
        status: 'completed',
        billing_period: billingPeriod,
        notes,
      });
    if (payErr) throw payErr;

    // Fetch current client to compute new subscription period
    const { data: client, error: fetchErr } = await supabase
      .from('clients')
      .select('last_paid_date, billing_day')
      .eq('id', clientId)
      .single();
    if (fetchErr) throw fetchErr;

    const billingDay = client?.billing_day || 1;
    let newLastPaidDate;

    if (client?.last_paid_date) {
      // Extend subscription by 1 month from current period end
      const currentPeriodStart = parseLocalDate(client.last_paid_date);
      newLastPaidDate = addOneMonth(currentPeriodStart, billingDay);
    } else {
      // First payment — set period start based on billingPeriod
      const periodStart = billingPeriod
        ? `${billingPeriod}-${String(billingDay).padStart(2, '0')}`
        : formatLocalDate(new Date());
      newLastPaidDate = new Date(periodStart);
    }

    const { error: updErr } = await supabase
      .from('clients')
      .update({
        last_paid_date: formatLocalDate(newLastPaidDate),
        payment_status: 'active',
      })
      .eq('id', clientId);
    if (updErr) throw updErr;

    return { success: true };
  } catch (err) {
    console.error('[BILLING] recordPayment error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Set a clinic's billing cycle.
 * @param {string} clientId
 * @param {number} billingDay — 1-31
 * @param {number} monthlyAmount — SGD
 * @returns {Promise<{success:boolean, error?:string}>}
 */
async function setBillingCycle(clientId, billingDay, monthlyAmount) {
  try {
    const { error } = await supabase
      .from('clients')
      .update({
        billing_day: Math.max(1, Math.min(31, billingDay)),
        monthly_amount: monthlyAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clientId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[BILLING] setBillingCycle error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get payment history for a clinic.
 * @param {string} clientId
 * @param {number} limit
 * @returns {Promise<Array<object>>}
 */
async function getPaymentHistory(clientId, limit = 12) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('[BILLING] getPaymentHistory error:', error.message); return []; }
  return data || [];
}

/**
 * Update monthly_usage revenue column from clients.monthly_amount.
 * Call this at month-end or after plan changes.
 * @param {string} yearMonth — e.g. '2026-09'
 */
async function syncMonthlyRevenue(yearMonth) {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, monthly_amount, plan');
  if (error) { console.error('[BILLING] syncMonthlyRevenue error:', error.message); return; }

  for (const c of (clients || [])) {
    const revenue = c.monthly_amount || (c.plan === 'premium' ? 547 : 347);
    await supabase
      .from('monthly_usage')
      .upsert({
        month: yearMonth,
        client_id: c.id,
        revenue,
      }, { onConflict: 'month,client_id' });
  }
}

/**
 * Suspend a clinic (stop bot replies, mark billing as suspended).
 * @param {string} clientId
 * @returns {Promise<{success:boolean, error?:string}>}
 */
async function suspendClient(clientId) {
  try {
    const { error } = await supabase
      .from('clients')
      .update({
        status: 'paused',
        payment_status: 'suspended',
        updated_at: new Date().toISOString(),
      })
      .eq('id', clientId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[BILLING] suspendClient error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Unsuspend a clinic (resume bot replies, mark billing as active).
 * @param {string} clientId
 * @returns {Promise<{success:boolean, error?:string}>}
 */
async function unsuspendClient(clientId) {
  try {
    const { error } = await supabase
      .from('clients')
      .update({
        status: 'active',
        payment_status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', clientId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[BILLING] unsuspendClient error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  GRACE_PERIOD_DAYS,
  SUSPENSION_THRESHOLD_DAYS,
  getBillingStatus,
  checkAllClinics,
  recordPayment,
  setBillingCycle,
  getPaymentHistory,
  syncMonthlyRevenue,
  suspendClient,
  unsuspendClient,
};
