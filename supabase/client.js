/**
 * Moon Hands - Supabase Database Client
 * Handles all database operations for clients, usage, and health monitoring
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
}

// Detect key format: old JWT (eyJ...) vs new Secret API key (sb_secret_...)
const isNewKeyFormat = SUPABASE_KEY.startsWith('sb_');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // New sb_secret_ keys don't use auto-refresh; old JWT keys do
    autoRefreshToken: !isNewKeyFormat,
    persistSession: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: isNewKeyFormat
      ? { 'Authorization': `Bearer ${SUPABASE_KEY}` }
      : undefined,
  },
  db: {
    schema: 'public',
  },
});

console.log(`[SUPABASE] Initialized with ${isNewKeyFormat ? 'new Secret API key' : 'legacy JWT key'} format`);

// ─── CLIENT OPERATIONS ────────────────────────────────────────────

async function getAllClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getClientBySlug(slug) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error) return null;
  return data;
}

async function getClientConfig(clientId) {
  const { data, error } = await supabase
    .from('client_configs')
    .select('*')
    .eq('client_id', clientId)
    .single();
  if (error) return null;
  return data;
}

// ─── CONFIG SYNC (v2.5.19, F8) ───────────────────────────────────
// The bot reads the config JSONB first (getConfig: nested wins); the
// top-level columns are the /config DISPLAY mirror. Before v2.5.19 every
// mutation helper below wrote ONLY the column — the bot kept answering with
// stale data while /config showed the clinic their change "worked". Now
// every write updates column + jsonb in ONE atomic .update(). Both clinic
// self-service commands (telegram/commands/index.js) and Moon Hands admin
// change-requests (telegram/change-requests.js) flow through these helpers,
// so both paths stay in sync. Every write stays scoped
// .eq('client_id', clientId) — cross-clinic containment is non-negotiable.

function buildServiceCategories(services) {
  const cats = new Map();
  for (const s of services || []) {
    const cat = s.category || 'Other';
    if (!cats.has(cat)) cats.set(cat, { id: cat, name: cat, count: 0 });
    cats.get(cat).count++;
  }
  return Array.from(cats.values());
}

// Merge `patch` (field → value) into the row's config jsonb; returns the
// new jsonb. services patches also refresh derived service_categories.
function syncConfigJsonb(row, patch) {
  const cfg = { ...(row.config || {}) };
  for (const [k, v] of Object.entries(patch)) cfg[k] = v;
  if (patch.services) cfg.service_categories = buildServiceCategories(patch.services);
  return cfg;
}

// ─── SERVICE OPERATIONS ───────────────────────────────────────────

async function addService(clientId, service) {
  const config = await getClientConfig(clientId);
  if (!config) return { success: false, error: 'Client not found' };

  // Dedupe: a service with the same name (case-insensitive) is UPDATED
  // in place — appending a duplicate breaks WhatsApp list messages
  // (duplicate row IDs get the whole menu rejected) and double-counts.
  const existing = config.services || [];
  const dupeIdx = existing.findIndex(s => s.name.trim().toLowerCase() === service.name.trim().toLowerCase());
  const services = dupeIdx >= 0
    ? existing.map((s, i) => (i === dupeIdx ? { ...s, ...service } : s))
    : [...existing, service];
  const { error } = await supabase
    .from('client_configs')
    .update({ services, config: syncConfigJsonb(config, { services }), updated_at: new Date().toISOString() })
    .eq('client_id', clientId);

  return { success: !error, error: error?.message };
}

async function updateServicePrice(clientId, serviceName, newPrice) {
  const config = await getClientConfig(clientId);
  if (!config) return { success: false, error: 'Client not found' };

  const services = (config.services || []).map(s =>
    s.name.toLowerCase() === serviceName.toLowerCase()
      ? { ...s, price: newPrice }
      : s
  );

  const { error } = await supabase
    .from('client_configs')
    .update({ services, config: syncConfigJsonb(config, { services }), updated_at: new Date().toISOString() })
    .eq('client_id', clientId);

  return { success: !error, error: error?.message };
}

async function removeService(clientId, serviceName) {
  const config = await getClientConfig(clientId);
  if (!config) return { success: false, error: 'Client not found' };

  const services = (config.services || []).filter(
    s => s.name.toLowerCase() !== serviceName.toLowerCase()
  );

  const { error } = await supabase
    .from('client_configs')
    .update({ services, config: syncConfigJsonb(config, { services }), updated_at: new Date().toISOString() })
    .eq('client_id', clientId);

  return { success: !error, error: error?.message };
}

// ─── OPERATING HOURS OPERATIONS ──────────────────────────────────

async function updateOperatingHours(clientId, day, openTime, closeTime) {
  const config = await getClientConfig(clientId);
  if (!config) return { success: false, error: 'Client not found' };

  const hours = (config.operating_hours || []).map(h =>
    h.day.toLowerCase() === day.toLowerCase()
      ? { ...h, open_time: openTime, close_time: closeTime }
      : h
  );

  const { error } = await supabase
    .from('client_configs')
    .update({ operating_hours: hours, config: syncConfigJsonb(config, { operating_hours: hours }), updated_at: new Date().toISOString() })
    .eq('client_id', clientId);

  return { success: !error, error: error?.message };
}

// ─── FAQ OPERATIONS ──────────────────────────────────────────────

async function addFaq(clientId, question, answer) {
  const config = await getClientConfig(clientId);
  if (!config) return { success: false, error: 'Client not found' };

  const faqs = [...(config.faqs || []), { question, answer }];
  const { error } = await supabase
    .from('client_configs')
    .update({ faqs, config: syncConfigJsonb(config, { faqs }), updated_at: new Date().toISOString() })
    .eq('client_id', clientId);

  return { success: !error, error: error?.message };
}

async function removeFaq(clientId, index) {
  const config = await getClientConfig(clientId);
  if (!config) return { success: false, error: 'Client not found' };

  const faqs = (config.faqs || []).filter((_, i) => i !== index);
  const { error } = await supabase
    .from('client_configs')
    .update({ faqs, config: syncConfigJsonb(config, { faqs }), updated_at: new Date().toISOString() })
    .eq('client_id', clientId);

  return { success: !error, error: error?.message };
}

// ─── BRAND VOICE OPERATIONS ──────────────────────────────────────

async function updateBrandVoice(clientId, field, value) {
  const validFields = ['agent_name', 'greeting', 'tone', 'enthusiasm', 'special_notes'];
  if (!validFields.includes(field)) {
    return { success: false, error: `Invalid field. Valid: ${validFields.join(', ')}` };
  }

  const config = await getClientConfig(clientId);
  if (!config) return { success: false, error: 'Client not found' };

  const { error } = await supabase
    .from('client_configs')
    .update({ [field]: value, config: syncConfigJsonb(config, { [field]: value }), updated_at: new Date().toISOString() })
    .eq('client_id', clientId);

  return { success: !error, error: error?.message };
}

// ─── BOOKING SETTINGS (v2.5.25, A-1) ─────────────────────────────
// The clinic's own booking preferences: same-day allowed, min notice,
// max advance. Both write paths land here — the clinic's /req_booking
// (after Moon Hands approval) and admin /setbooking — so column and config
// jsonb can never drift (Invariant 19: one atomic update, jsonb canonical).
const BOOKING_SETTING_FIELDS = {
  booking_allow_same_day:     { type: 'boolean' },
  booking_min_notice_hours:   { type: 'int', min: 0, max: 48 },
  booking_max_advance_days:   { type: 'int', min: 1, max: 90 },
};

function validateBookingSetting(field, value) {
  const spec = BOOKING_SETTING_FIELDS[field];
  if (!spec) return { ok: false, error: `Unknown setting "${field}". Valid: ${Object.keys(BOOKING_SETTING_FIELDS).join(', ')}` };
  if (spec.type === 'boolean') {
    if (value === true || value === false) return { ok: true, value };
    const s = String(value).trim().toLowerCase();
    if (['true', 'on', 'yes', '1'].includes(s)) return { ok: true, value: true };
    if (['false', 'off', 'no', '0'].includes(s)) return { ok: true, value: false };
    return { ok: false, error: `"${value}" isn't a yes/no value. Use on/off.` };
  }
  const n = parseInt(value, 10);
  if (isNaN(n) || n < spec.min || n > spec.max) {
    return { ok: false, error: `"${value}" isn't a valid number for ${field} (${spec.min}–${spec.max}).` };
  }
  return { ok: true, value: n };
}

async function updateBookingSettings(clientId, field, value) {
  const check = validateBookingSetting(field, value);
  if (!check.ok) return { success: false, error: check.error };

  const config = await getClientConfig(clientId);
  if (!config) return { success: false, error: 'Client not found' };

  const { error } = await supabase
    .from('client_configs')
    .update({ [field]: check.value, config: syncConfigJsonb(config, { [field]: check.value }), updated_at: new Date().toISOString() })
    .eq('client_id', clientId);

  return { success: !error, error: error?.message, field, value: check.value };
}

// ─── CLIENT STATUS OPERATIONS ────────────────────────────────────

async function pauseClient(clientId) {
  const { error } = await supabase
    .from('clients')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('id', clientId);
  return { success: !error, error: error?.message };
}

async function resumeClient(clientId) {
  const { error } = await supabase
    .from('clients')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', clientId);
  return { success: !error, error: error?.message };
}

// ─── USAGE OPERATIONS ────────────────────────────────────────────

async function getDailyUsage(date) {
  const { data, error } = await supabase
    .from('daily_usage')
    .select('*, clients(name, plan, slug)')
    .eq('date', date);
  if (error) throw error;
  return data || [];
}

/**
 * Increment today's usage counter for a clinic (fire-and-forget from webhook).
 * whatsapp_messages = TOTAL (hardcoded + AI) — this is what clinics see.
 * hardcoded_messages / ai_messages = internal split for Moon Hands admin only.
 * @param {string} clientId — clinic UUID
 * @param {object} opts — { isAI: boolean, cost: number (USD, AI replies only) }
 */
async function incrementDailyUsage(clientId, { isAI = false, cost = 0 } = {}) {
  if (!clientId) return;
  // v2.5.25 (A-3): bucket usage by SG calendar day, not UTC — the daily
  // report, /usage and this writer must all agree on what "today" means.
  const { todayStr: today } = require('../utils/date-helpers').sgNowParts();
  try {
    const { data: existing } = await supabase
      .from('daily_usage')
      .select('*')
      .eq('date', today)
      .eq('client_id', clientId)
      .maybeSingle();

    const payload = existing ? {
      whatsapp_messages: (existing.whatsapp_messages || 0) + 1,
      hardcoded_messages: (existing.hardcoded_messages || 0) + (isAI ? 0 : 1),
      ai_messages: (existing.ai_messages || 0) + (isAI ? 1 : 0),
      cost: parseFloat(((Number(existing.cost) || 0) + (isAI ? cost : 0)).toFixed(4)),
    } : {
      date: today,
      client_id: clientId,
      whatsapp_messages: 1,
      hardcoded_messages: isAI ? 0 : 1,
      ai_messages: isAI ? 1 : 0,
      cost: isAI ? cost : 0,
    };

    const { error } = await supabase
      .from('daily_usage')
      .upsert(payload, { onConflict: 'date,client_id' });
    if (error) console.error('[USAGE] increment failed:', error.message);
  } catch (err) {
    console.error('[USAGE] increment exception:', err.message);
  }
}

async function getMonthlyUsage(month) {
  const { data, error } = await supabase
    .from('monthly_usage')
    .select('*, clients(name, plan, slug)')
    .eq('month', month);
  if (error) throw error;
  return data || [];
}

// ─── CONVERSATION LOG OPERATIONS ─────────────────────────────────

// ─── APPOINTMENT OPERATIONS ──────────────────────────────────────

async function getFutureAppointments(customerPhone, clientId) {
  // v2.5.25 (A-3): SG calendar day — UTC "today" leaked same-day
  // appointments into the "future" list between midnight and 8am SGT
  const today = require('../utils/date-helpers').getTodaySG();
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('client_id', clientId)
    .eq('customer_phone', customerPhone)
    .gt('appointment_date', today)
    .order('appointment_date', { ascending: true })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function getRecentConversations(clientId, limit = 10) {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function getHighValueLeads(clientId, minHours = 24) {
  const cutoff = new Date(Date.now() - minHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('client_id', clientId)
    .gte('created_at', cutoff)
    .eq('is_high_value', true)
    .eq('notified', false);
  if (error) throw error;
  return data || [];
}

async function markLeadNotified(conversationId) {
  const { error } = await supabase
    .from('conversations')
    .update({ notified: true })
    .eq('id', conversationId);
  return { success: !error };
}

// ─── HEALTH LOG OPERATIONS ──────────────────────────────────────

async function logHealthCheck(service, status, latency, error) {
  const { data, error: dbError } = await supabase
    .from('health_checks')
    .insert({
      service,
      status,
      latency_ms: latency,
      error_message: error || null,
      checked_at: new Date().toISOString()
    })
    .select()
    .single();
  if (dbError) console.error('Health log error:', dbError);
  return data;
}

async function getRecentHealthChecks(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('health_checks')
    .select('*')
    .gte('checked_at', cutoff)
    .order('checked_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ─── EXPORTS ─────────────────────────────────────────────────────

module.exports = {
  supabase,
  getAllClients,
  getClientBySlug,
  getClientConfig,
  addService,
  updateServicePrice,
  removeService,
  updateOperatingHours,
  addFaq,
  removeFaq,
  updateBrandVoice,
  updateBookingSettings,
  validateBookingSetting,
  BOOKING_SETTING_FIELDS,
  pauseClient,
  resumeClient,
  getDailyUsage,
  incrementDailyUsage,
  getMonthlyUsage,
  getFutureAppointments,
  getRecentConversations,
  getHighValueLeads,
  markLeadNotified,
  logHealthCheck,
  getRecentHealthChecks
};
