/**
 * Patient History REST API (Handoff Sections 10.1 / 10.3)
 *
 * Mounted in server.js:
 *   GET  /api/patient-history?clinic_id=…&phone=…   — lookup one patient
 *   POST /api/patient-history                        — upsert / record a visit
 *
 * Auth: x-api-key header (process.env.API_KEY) for external callers.
 * The bot pipeline uses getPatientHistory()/recordVisit() directly.
 *
 * DATA ISOLATION: every query requires client_id AND phone together.
 * PDPA note (Risk Register): lookup is by exact phone only — no browsing,
 * no listing endpoint. Data minimisation by design.
 */

const { supabase } = require('../supabase/client');

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

// ─── INTERNAL HELPERS (used by ai/bot-engine.js — first-time vs returning) ─

/**
 * Look up one patient's history for a clinic.
 * Returns null if the patient has no record (= first-time patient).
 */
async function getPatientHistory(clinicId, patientPhone) {
  if (!clinicId || !patientPhone) return null;
  const { data, error } = await supabase
    .from('patient_history')
    .select('*')
    .eq('client_id', clinicId)
    .eq('patient_phone', normalizePhone(patientPhone))
    .order('last_visit_date', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) {
    console.error('[PATIENT_HISTORY] lookup error:', error.message);
    return null; // fail open to "first-time" = safer (consult-first flow)
  }
  return (data && data[0]) || null;
}

/**
 * Record a completed visit (upsert by clinic + phone).
 * Increments total_visits, refreshes last_visit_date / last_treatment.
 */
async function recordVisit({ clinicId, patientPhone, patientName, treatment, visitDate }) {
  if (!clinicId || !patientPhone) throw new Error('recordVisit requires clinicId and patientPhone');
  const phone = normalizePhone(patientPhone);
  const existing = await getPatientHistory(clinicId, phone);
  const today = visitDate || new Date().toISOString().split('T')[0];

  if (!existing) {
    const { data, error } = await supabase
      .from('patient_history')
      .insert({
        client_id: clinicId,
        patient_phone: phone,
        patient_name: patientName || null,
        first_visit_date: today,
        last_visit_date: today,
        total_visits: 1,
        last_treatment: treatment || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from('patient_history')
    .update({
      patient_name: patientName || existing.patient_name,
      last_visit_date: today,
      total_visits: (existing.total_visits || 0) + 1,
      last_treatment: treatment || existing.last_treatment,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Is this patient "returning"? (Handoff Section 9.2)
 * Returning = has a record AND last visit within the last 6 months.
 */
function isReturningPatient(historyRow) {
  if (!historyRow || !historyRow.last_visit_date) return false;
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return new Date(historyRow.last_visit_date) >= sixMonthsAgo;
}

// ─── HTTP HANDLER ──────────────────────────────────────────────────────────

async function handlePatientHistoryAPI(req, res, url) {
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
      const phone = url.searchParams.get('phone');
      if (!clinicId || !phone) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'clinic_id and phone are required' }));
        return;
      }
      const row = await getPatientHistory(clinicId, phone);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        found: !!row,
        returning: isReturningPatient(row),
        patient: row,
      }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      if (body.length > 10 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        return;
      }
      const data = JSON.parse(body || '{}');
      const row = await recordVisit({
        clinicId: data.clinic_id,
        patientPhone: data.patient_phone,
        patientName: data.patient_name,
        treatment: data.treatment,
        visitDate: data.visit_date,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, patient: row }));
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (err) {
    console.error('[PATIENT_HISTORY] API error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
}

module.exports = { handlePatientHistoryAPI, getPatientHistory, recordVisit, isReturningPatient, normalizePhone };
