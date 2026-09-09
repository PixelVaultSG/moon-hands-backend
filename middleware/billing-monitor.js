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
  let nextDue = new Date(now.getFullYear(), now.getMonth(), billingDay);
  if (nextDue < now) nextDue = new Date(now.getFullYear(), now.getMonth() + 1, billingDay);

  const lastPaid = data.last_paid_date ? new Date(data.last_paid_date) : null;
  const daysUntilDue = Math.ceil((nextDue - now) / (1000 * 60 * 60 * 24));

  let daysOverdue = 0;
  let effectiveStatus = data.payment_status || 'active';
  if (lastPaid) {
    const lastDue = new Date(lastPaid.getFullYear(), lastPaid.getMonth(), billingDay);
    if (lastPaid < lastDue) {
      daysOverdue = Math.ceil((now - lastDue) / (1000 * 60 * 60 * 24));
      if (daysOverdue > 0 && daysOverdue <= GRACE_PERIOD_DAYS) effectiveStatus = 'grace_period';
      else if (daysOverdue > GRACE_PERIOD_DAYS) effectiveStatus = 'overdue';
    }
  }

  return {
    client: data,
    daysUntilDue,
    daysOverdue,
    status: effectiveStatus,
    nextDueDate: nextDue.toISOString().split('T')[0],
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
    let nextDue = new Date(now.getFullYear(), now.getMonth(), billingDay);
    if (nextDue < now) nextDue = new Date(now.getFullYear(), now.getMonth() + 1, billingDay);

    const lastPaid = c.last_paid_date ? new Date(c.last_paid_date) : null;
    let daysUntilDue = Math.ceil((nextDue - now) / (1000 * 60 * 60 * 24));
    let daysOverdue = 0;
    let effectiveStatus = c.payment_status || 'active';
    let alertLevel = null;

    if (lastPaid) {
      const lastDue = new Date(lastPaid.getFullYear(), lastPaid.getMonth(), billingDay);
      if (lastPaid < lastDue) {
        daysOverdue = Math.ceil((now - lastDue) / (1000 * 60 * 60 * 24));
        daysUntilDue = -daysOverdue;
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
      nextDueDate: nextDue.toISOString().split('T')[0],
    });
  }
  return results;
}

/**
 * Record a manual payment.
 * @param {string} clientId
 * @param {number} amount — SGD
 * @param {string} method — bank_transfer | paynow | stripe | cash | other
 * @param {string} reference — transaction reference
 * @param {string} billingPeriod — YYYY-MM
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

    const { error: updErr } = await supabase
      .from('clients')
      .update({
        last_paid_date: new Date().toISOString().split('T')[0],
        payment_status: 'active',
        updated_at: new Date().toISOString(),
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

module.exports = {
  GRACE_PERIOD_DAYS,
  SUSPENSION_THRESHOLD_DAYS,
  getBillingStatus,
  checkAllClinics,
  recordPayment,
  setBillingCycle,
  getPaymentHistory,
  syncMonthlyRevenue,
};
