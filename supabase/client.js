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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

// ─── SERVICE OPERATIONS ───────────────────────────────────────────

async function addService(clientId, service) {
  const config = await getClientConfig(clientId);
  if (!config) return { success: false, error: 'Client not found' };

  const services = [...(config.services || []), service];
  const { error } = await supabase
    .from('client_configs')
    .update({ services, updated_at: new Date().toISOString() })
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
    .update({ services, updated_at: new Date().toISOString() })
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
    .update({ services, updated_at: new Date().toISOString() })
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
    .update({ operating_hours: hours, updated_at: new Date().toISOString() })
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
    .update({ faqs, updated_at: new Date().toISOString() })
    .eq('client_id', clientId);

  return { success: !error, error: error?.message };
}

async function removeFaq(clientId, index) {
  const config = await getClientConfig(clientId);
  if (!config) return { success: false, error: 'Client not found' };

  const faqs = (config.faqs || []).filter((_, i) => i !== index);
  const { error } = await supabase
    .from('client_configs')
    .update({ faqs, updated_at: new Date().toISOString() })
    .eq('client_id', clientId);

  return { success: !error, error: error?.message };
}

// ─── BRAND VOICE OPERATIONS ──────────────────────────────────────

async function updateBrandVoice(clientId, field, value) {
  const validFields = ['agent_name', 'greeting', 'tone', 'enthusiasm', 'special_notes'];
  if (!validFields.includes(field)) {
    return { success: false, error: `Invalid field. Valid: ${validFields.join(', ')}` };
  }

  const { error } = await supabase
    .from('client_configs')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('client_id', clientId);

  return { success: !error, error: error?.message };
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
  const today = new Date().toISOString().split('T')[0];
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
  pauseClient,
  resumeClient,
  getDailyUsage,
  getMonthlyUsage,
  getFutureAppointments,
  getRecentConversations,
  getHighValueLeads,
  markLeadNotified,
  logHealthCheck,
  getRecentHealthChecks
};
