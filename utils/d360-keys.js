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

// v2.5.7: resolution observability ring — surfaced via /trace (auth-gated) so
// F1 per-clinic sends are verifiable remotely. Never logs key material.
const RESOLUTION_LOG_MAX = 50;
const resolutionLog = [];
function logResolution(clinicId, source, keyLen, cached) {
  resolutionLog.push({ at: new Date().toISOString(), clinic: clinicId || null, source, keyLen: keyLen || 0, cached: !!cached });
  if (resolutionLog.length > RESOLUTION_LOG_MAX) resolutionLog.shift();
}
function getD360KeyResolutionLog() { return [...resolutionLog].reverse(); }

async function resolveD360ApiKey(clinicId) {
  const envKey = process.env.D360_API_KEY || null;
  if (!clinicId || columnMissing) {
    logResolution(clinicId, columnMissing ? 'env-latched' : 'env-no-clinic', envKey ? envKey.length : 0, false);
    return envKey;
  }

  const hit = keyCache.get(clinicId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    logResolution(clinicId, hit.source, hit.key ? hit.key.length : 0, true);
    return hit.key;
  }

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
        logResolution(clinicId, 'env-latched', envKey ? envKey.length : 0, false);
        return envKey;
      }
      // Any other lookup failure: fail safe to the shared key, never block sends.
      console.error(`[D360-KEYS] lookup failed for clinic ${clinicId}: ${error.message} — falling back to env key`);
      logResolution(clinicId, 'env-lookup-error', envKey ? envKey.length : 0, false);
      return envKey;
    }

    const key = (data && data.d360_api_key) || envKey;
    const source = (data && data.d360_api_key) ? 'per-clinic' : 'env';
    keyCache.set(clinicId, { key, at: Date.now(), source });
    logResolution(clinicId, source, key ? key.length : 0, false);
    if (data && data.d360_api_key) {
      console.log(`[D360-KEYS] clinic ${clinicId} using PER-CLINIC key (len=${data.d360_api_key.length})`);
    }
    return key;
  } catch (e) {
    console.error(`[D360-KEYS] resolve error for clinic ${clinicId}: ${e.message} — falling back to env key`);
    logResolution(clinicId, 'env-exception', envKey ? envKey.length : 0, false);
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

module.exports = { resolveD360ApiKey, invalidateD360KeyCache, getD360KeyResolutionLog, _resetForTests };
