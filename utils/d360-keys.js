/**
 * Moon Hands — Per-Clinic 360dialog API Key Resolution (v2.5.6, audit finding F1)
 *
 * BEFORE v2.5.6 every outbound WhatsApp message (patient replies, reminders,
 * booking notifications, waitlist) sent through the single shared env var
 * D360_API_KEY. A multi-clinic platform cannot do that: each clinic's
 * 360dialog account has its own key, and messages must leave from the
 * clinic's own WABA number.
 *
 * Resolution rule (see DEPENDENCY-MAP.md, Invariant 12):
 *   clients.d360_api_key  ??  process.env.D360_API_KEY
 * The env key remains the shared/demo fallback, so demo clinics (null column)
 * are unaffected until a real per-clinic key is stored.
 *
 * Migration safety: clients.d360_api_key is added by a manual SQL migration
 * that may run before OR after this deploy. On the first PostgREST 42703
 * (column does not exist) we latch `columnMissing` and serve the env key —
 * deploy order can never cause an outage. The latch resets on process restart.
 *
 * Callers MUST pass the clinic UUID (clients.id), never the URL slug.
 * Results are cached for 5 minutes; key rotation takes effect within that
 * window or immediately on restart.
 */

const { supabase } = require('../supabase/client');

const CACHE_TTL_MS = 5 * 60 * 1000;
const keyCache = new Map(); // clinicId -> { key, at }
let columnMissing = false;  // latch: clients.d360_api_key absent (migration pending)

async function resolveD360ApiKey(clinicId) {
  const envKey = process.env.D360_API_KEY || null;
  if (!clinicId || columnMissing) return envKey;

  const hit = keyCache.get(clinicId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.key;

  try {
    const { data, error } = await supabase
      .from('clients')
      .select('d360_api_key')
      .eq('id', clinicId)
      .single();

    if (error) {
      // 42703 = column does not exist (migration not run yet) — latch + env.
      if (error.code === '42703' || /d360_api_key/i.test(error.message || '')) {
        columnMissing = true;
        console.warn('[D360-KEYS] clients.d360_api_key missing (migration pending) — using shared env key for all clinics');
        return envKey;
      }
      // Any other lookup failure: fail safe to the shared key, never block sends.
      console.error(`[D360-KEYS] lookup failed for clinic ${clinicId}: ${error.message} — falling back to env key`);
      return envKey;
    }

    const key = (data && data.d360_api_key) || envKey;
    keyCache.set(clinicId, { key, at: Date.now() });
    if (data && data.d360_api_key) {
      console.log(`[D360-KEYS] clinic ${clinicId} using PER-CLINIC key (len=${data.d360_api_key.length})`);
    }
    return key;
  } catch (e) {
    console.error(`[D360-KEYS] resolve error for clinic ${clinicId}: ${e.message} — falling back to env key`);
    return envKey;
  }
}

function invalidateD360KeyCache(clinicId) {
  if (clinicId) keyCache.delete(clinicId); else keyCache.clear();
}

// Harness/test hook — resets cache and the migration latch.
function _resetForTests() {
  keyCache.clear();
  columnMissing = false;
}

module.exports = { resolveD360ApiKey, invalidateD360KeyCache, _resetForTests };
