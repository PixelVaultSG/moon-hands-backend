/**
 * Callback Requests REST API (Handoff Sections 10.1 / 10.3)
 *
 * Mounted in server.js:
 *   POST /api/callback-requests          — create (internal: bot pipeline)
 *   GET  /api/callback-requests?clinic_id=…&status=pending — list
 *   POST /api/callback-requests/complete — { id } mark completed
 *
 * Auth: x-api-key header (process.env.API_KEY) for external callers.
 * The bot pipeline uses createCallbackRequest() directly (no HTTP).
 *
 * DATA ISOLATION: every query requires client_id. Listings are always
 * scoped — there is no cross-clinic read path here.
 */

const { supabase } = require('../supabase/client');

// ─── INTERNAL HELPERS (used by ai/bot-engine.js) ──────────────────────────

/**
 * Create a callback request. Returns the inserted row.
 */
async function createCallbackRequest({ clinicId, patientPhone, patientName, topic }) {
  if (!clinicId || !patientPhone || !topic) {
    throw new Error('createCallbackRequest requires clinicId, patientPhone, topic');
  }
  const { data, error } = await supabase
    .from('callback_requests')
    .insert({
      client_id: clinicId,
      patient_phone: String(patientPhone).replace(/\D/g, ''),
      patient_name: patientName || null,
      topic: String(topic).slice(0, 500),
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * List callbacks for one clinic. status defaults to 'pending'.
 */
async function listCallbackRequests(clinicId, status = 'pending', limit = 50) {
  if (!clinicId) throw new Error('listCallbackRequests requires clinicId');
  const { data, error } = await supabase
    .from('callback_requests')
    .select('*')
    .eq('client_id', clinicId)
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

// ─── HTTP HANDLER ──────────────────────────────────────────────────────────

async function handleCallbackRequestsAPI(req, res, url) {
  // Auth — same pattern as /debug
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.API_KEY || process.env.WEBHOOK_SECRET;
  if (!expectedKey || apiKey !== expectedKey) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized — valid x-api-key required' }));
    return;
  }

  try {
    if (req.method === 'GET') {
      const clinicId = url.searchParams.get('clinic_id');
      const status = url.searchParams.get('status') || 'pending';
      if (!clinicId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'clinic_id is required' }));
        return;
      }
      const rows = await listCallbackRequests(clinicId, status);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: rows.length, callbacks: rows }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/callback-requests') {
      let body = '';
      for await (const chunk of req) body += chunk;
      if (body.length > 10 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        return;
      }
      const data = JSON.parse(body || '{}');
      const row = await createCallbackRequest({
        clinicId: data.clinic_id,
        patientPhone: data.patient_phone,
        patientName: data.patient_name,
        topic: data.topic,
      });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, callback: row }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/callback-requests/complete') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body || '{}');
      if (!data.id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'id is required' }));
        return;
      }
      const { data: row, error } = await supabase
        .from('callback_requests')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', data.id)
        .eq('status', 'pending')
        .select()
        .single();
      if (error) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Pending callback not found', detail: error.message }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, callback: row }));
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (err) {
    console.error('[CALLBACK_API] Error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
}

module.exports = { handleCallbackRequestsAPI, createCallbackRequest, listCallbackRequests };
