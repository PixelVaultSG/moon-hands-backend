/**
 * Moon Hands — Plan Gate (v2.2.9)
 *
 * Single source of truth for tier access. Core principle: gate at
 * EXECUTION time, never fork features into premium copies.
 *
 *   Downgrade ($547 → $347): flip clients.plan = 'standard' → every
 *     lazy check starts failing on the next tick. No migrations, no
 *     data deletion, nothing to unwind. Re-upgrade resumes cleanly.
 *   Upgrade ($347 → $547): flip clients.plan = 'premium' → everything
 *     opens on the next request/tick. No provisioning step.
 *
 * payment_status guard: a clinic keeps service unless billing has
 * explicitly flagged a problem. NULL/legacy values are treated as
 * good standing (restriction lever is the plan flip; billing flags
 * only cut service when they say something bad).
 *
 * PLAN_FEATURES labels double as sales-collateral language — keep
 * them pitch-deck-ready (they are the one-pager feature list).
 */

const PLANS = {
  standard: { price: 347, label: 'Core' },
  premium:  { price: 547, label: 'Premium' },
};

const PLAN_FEATURES = {
  // ── Standard (S$347/mo) — every plan includes these ──
  ai_receptionist_24_7: { plan: 'standard', label: '24/7 AI Receptionist on WhatsApp' },
  smart_booking_mgmt:   { plan: 'standard', label: 'Smart Booking, Rescheduling & Cancellations' },
  booking_reminders:    { plan: 'standard', label: 'Automated Appointment Reminders (24h / 1h)' },
  mads_safety_gate:     { plan: 'standard', label: 'Medical Red-Flag Safety Screening' },
  telegram_command:     { plan: 'standard', label: 'Telegram Command Center (approvals, My Bookings)' },
  daily_capacity_guard: { plan: 'standard', label: 'Daily Capacity Guard (max bookings/day)' },
  hot_lead_alerts:      { plan: 'standard', label: 'Hot-Lead Price-Sensitivity Alerts' },
  weekly_roundup:       { plan: 'standard', label: 'Weekly Bookings Roundup' },

  // ── Premium (S$547/mo) — revenue-generating automation ──
  weekly_optimization:  { plan: 'premium', label: 'Weekly AI Optimization Report' },
  waitlist_autofill:    { plan: 'premium', label: 'Waitlist Auto-Fill — cancelled slots refilled automatically' },
  gcal_sync:            { plan: 'premium', label: 'Google Calendar Two-Way Sync' },        // gated for OAuth rollout
  noshow_analytics:     { plan: 'premium', label: 'No-Show & Attendance Analytics' },      // upcoming
  rebooking_nudges:     { plan: 'premium', label: 'Smart Rebooking Nudges' },              // upcoming
};

// Payment states that actively cut service. Anything else (incl. NULL)
// is treated as good standing.
const BAD_PAYMENT_STATES = ['past_due', 'cancelled', 'suspended', 'inactive'];

function isPaying(client) {
  return !BAD_PAYMENT_STATES.includes(String(client?.payment_status || '').toLowerCase());
}

function isPremium(client) {
  return !!client && client.plan === 'premium' && isPaying(client);
}

/**
 * Does this clinic have a given feature right now?
 * Unknown feature keys fail closed (false).
 */
function hasFeature(client, featureKey) {
  const f = PLAN_FEATURES[featureKey];
  if (!f) return false;
  if (f.plan === 'standard') return isPaying(client);
  return isPremium(client);
}

/**
 * Feature list for a plan — powers sales collateral and any future
 * admin "what's in my plan" surface. Returns [{key, label, included}].
 */
function listFeaturesForPlan(plan) {
  const isPrem = plan === 'premium';
  return Object.entries(PLAN_FEATURES).map(([key, f]) => ({
    key,
    label: f.label,
    tier: f.plan,
    included: f.plan === 'standard' || isPrem,
  }));
}

/**
 * IDs of clinics currently entitled to Premium features.
 * One query per scheduled tick; the set is the gate for per-clinic
 * filtering inside jobs.
 */
async function getPremiumClientIds(supabase) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, plan, payment_status')
    .eq('status', 'active');
  if (error || !data) {
    if (error) console.error('[PLAN_GATE] Failed to fetch clinics:', error.message);
    return new Set();
  }
  return new Set(data.filter(isPremium).map(c => c.id));
}

module.exports = {
  PLANS,
  PLAN_FEATURES,
  BAD_PAYMENT_STATES,
  isPaying,
  isPremium,
  hasFeature,
  listFeaturesForPlan,
  getPremiumClientIds,
};
