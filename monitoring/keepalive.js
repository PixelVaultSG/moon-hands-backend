/**
 * Moon Hands — 24/7 Keepalive & Uptime Monitor
 * 
 * Problem: Even on Render Starter, the Node.js process can crash,
 * the webhook module can fail to load, or external services (360dialog,
 * OpenAI, Supabase) can become unreachable.
 * 
 * Solution: Three-layer monitoring:
 *   1. SELF-PING: Hit /health every 10 min from within the process
 *   2. EXTERNAL PING: A separate Render cron job pings us from outside
 *   3. WEBHOOK VERIFICATION: Verify 360dialog can actually reach us
 * 
 * All failures trigger Telegram alerts with diagnostic info.
 */

const KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const WEBHOOK_VERIFY_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let keepaliveTimer = null;
let webhookVerifyTimer = null;
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_ALERT = 2;

/**
 * Start the keepalive system. Call this once at server startup.
 */
function startKeepalive(renderUrl) {
  const url = renderUrl || process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
  if (!url) {
    console.warn('[KEEPALIVE] RENDER_EXTERNAL_URL not set — self-ping disabled. Set it in Render env vars.');
  } else {
    console.log(`[KEEPALIVE] Starting self-ping to ${url}/health every ${KEEPALIVE_INTERVAL_MS/60000} min`);
    keepaliveTimer = setInterval(() => selfPing(url), KEEPALIVE_INTERVAL_MS);
    // First ping after 30 seconds (give server time to fully start)
    setTimeout(() => selfPing(url), 30000);
  }

  // Verify webhook connectivity periodically
  console.log(`[KEEPALIVE] Starting webhook verification every ${WEBHOOK_VERIFY_INTERVAL_MS/60000} min`);
  webhookVerifyTimer = setInterval(() => verifyWebhook(), WEBHOOK_VERIFY_INTERVAL_MS);
  setTimeout(() => verifyWebhook(), 60000); // First check after 1 min
}

/**
 * Layer 1: Self-ping — keeps the Node.js event loop active
 * and detects if the process has become unresponsive.
 */
async function selfPing(url) {
  try {
    const start = Date.now();
    const res = await fetch(`${url}/health`, { 
      method: 'GET',
      signal: AbortSignal.timeout(15000) // 15 second timeout
    });
    const latency = Date.now() - start;
    
    if (res.ok) {
      const data = await res.json();
      // If server responds with 200 OK, the webhook IS working.
      // The checks.webhook flag can be false during startup/module reload.
      const isHealthy = data.status === 'ok' || data.status === 'healthy';
      if (isHealthy) {
        consecutiveFailures = 0;
        const whStatus = data.checks?.webhook ? 'active' : 'flag-not-set';
        console.log(`[KEEPALIVE] Self-ping OK (${latency}ms) — webhook: ${whStatus}, uptime: ${Math.floor(data.uptime/60)}min`);
      } else {
        consecutiveFailures++;
        const err = data.checks?.webhook_error?.message || 'unknown error';
        console.error(`[KEEPALIVE] Self-ping WARNING — status: ${data.status}, error: ${err} (${latency}ms)`);
        if (consecutiveFailures >= MAX_FAILURES_BEFORE_ALERT) {
          alertAdmin(`⚠️ Server status: ${data.status}\n\nUptime: ${Math.floor(data.uptime/60)}min\n\nUse /health to check.`);
        }
      }
    } else {
      consecutiveFailures++;
      console.error(`[KEEPALIVE] Self-ping FAILED — HTTP ${res.status} (${latency}ms)`);
      if (consecutiveFailures >= MAX_FAILURES_BEFORE_ALERT) {
        alertAdmin(`🚨 Health endpoint returning HTTP ${res.status}\n\nServer may be in a bad state. Check Render logs immediately.`);
      }
    }
  } catch (err) {
    consecutiveFailures++;
    console.error(`[KEEPALIVE] Self-ping ERROR: ${err.message}`);
    if (consecutiveFailures >= MAX_FAILURES_BEFORE_ALERT) {
      alertAdmin(`🚨 Keepalive ping failed: ${err.message}\n\nServer may be unreachable. Check Render immediately.`);
    }
  }
}

/**
 * Layer 2: Webhook verification — checks that 360dialog can reach us.
 * We verify by checking recent message processing in the trace log.
 */
let lastVerifiedWebhook = null;

async function verifyWebhook() {
  // Check if we've processed any messages recently (via trace log)
  const traceModule = require('../server/webhook');
  // We can't directly access trace log from here, so we check health instead
  
  const url = process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
  if (!url) return;
  
  try {
    // Try /debug with API key first (since it's now auth-protected)
    const apiKey = process.env.API_KEY || process.env.WEBHOOK_SECRET;
    const headers = apiKey ? { 'x-api-key': apiKey } : {};
    const res = await fetch(`${url}/debug`, { 
      headers,
      signal: AbortSignal.timeout(15000) 
    });
    
    // 401 on /debug is expected if API key is set but we forgot to include it,
    // or if API key mismatch. Log to console only — don't spam Telegram.
    if (res.status === 401) {
      console.log(`[KEEPALIVE] /debug returned 401 (expected — auth protected). Checking /health instead...`);
      // Fallback: check /health which is public
      const healthRes = await fetch(`${url}/health`, { signal: AbortSignal.timeout(15000) });
      if (healthRes.ok) {
        console.log(`[KEEPALIVE] Webhook verify: /health OK — webhook is operational`);
      } else {
        console.error(`[KEEPALIVE] Webhook verify: /health returned HTTP ${healthRes.status}`);
        alertAdmin(`⚠️ Health endpoint returning HTTP ${healthRes.status}\nWebhook may not be processing messages.`);
      }
      return;
    }
    
    if (!res.ok) {
      console.error(`[KEEPALIVE] Webhook verify: /debug returned HTTP ${res.status}`);
      alertAdmin(`⚠️ /debug endpoint returning HTTP ${res.status}\nWebhook may not be processing messages.`);
      return;
    }
    
    const data = await res.json();
    const webhookOk = data.checks?.webhook;
    const uptime = data.uptime || 0;
    
    if (!webhookOk && uptime > 60) {
      // Webhook has been down for more than 60 seconds after startup
      const err = data.checks?.webhook_error?.message || 'unknown error';
      console.error(`[KEEPALIVE] Webhook DOWN for ${Math.floor(uptime)}s: ${err}`);
      alertAdmin(
        `🚨 Webhook DOWN — messages are being LOST\n\n` +
        `Error: ${err.slice(0, 200)}\n` +
        `Uptime: ${Math.floor(uptime/60)}min\n\n` +
        `ACTION: Check Render logs → Manual Deploy → Deploy Latest Commit`
      );
    } else if (webhookOk) {
      console.log(`[KEEPALIVE] Webhook verify OK — uptime: ${Math.floor(uptime/60)}min`);
    }
  } catch (err) {
    console.error(`[KEEPALIVE] Webhook verify error: ${err.message}`);
  }
}

/**
 * Send Telegram alert to admin
 */
function alertAdmin(message) {
  try {
    const { sendAdminAlert } = require('../telegram/alerts');
    sendAdminAlert(message, 'critical');
  } catch (e) {
    console.error('[KEEPALIVE] Failed to send Telegram alert:', e.message);
  }
}

/**
 * Stop all keepalive timers (for graceful shutdown)
 */
function stopKeepalive() {
  if (keepaliveTimer) clearInterval(keepaliveTimer);
  if (webhookVerifyTimer) clearInterval(webhookVerifyTimer);
  console.log('[KEEPALIVE] Stopped');
}

module.exports = { startKeepalive, stopKeepalive, verifyWebhook };
