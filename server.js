/**
 * Moon Hands - Combined Server
 * Starts both Telegram Bot and Webhook Server
 * 
 * Usage: node server.js
 */

require('dotenv').config();

const http = require('http');
const { logDeployment } = require('./monitoring/audit-system');
const PORT = process.env.PORT || 10000;

console.log(`[${new Date().toISOString()}] Starting Moon Hands servers...`);
console.log(`PORT=${PORT}, NODE_ENV=${process.env.NODE_ENV || 'development'}`);

// Log this deployment event
logDeployment().catch(() => {}); // fire-and-forget

// ─── CREATE SERVER FIRST (always bind to port) ───────────────────
// This ensures Render always sees an open port, even if modules fail

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Moonhands-Master, X-Moonhands-Agent');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Secure onboarding submission — before webhook
  if (url.pathname === '/api/onboarding' && req.method === 'POST') {
    try {
      const { handleOnboardingSubmission } = require('./server/onboarding-submission');
      const handled = await handleOnboardingSubmission(req, res);
      if (handled) return;
    } catch (err) {
      console.error('[SERVER] Onboarding handler error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Onboarding handler error' }));
      return;
    }
  }

  // Google Calendar connection verification
  if (url.pathname === '/api/calendar/verify' && req.method === 'GET') {
    try {
      const { testConnection } = require('./server/calendar-service');
      const calendarId = url.searchParams.get('calendarId');
      const result = await testConnection(calendarId);
      res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    } catch (err) {
      console.error('[SERVER] Calendar verify error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Server error: ' + err.message }));
      return;
    }
  }

  // Health check — always available
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'moon-hands',
      version: '2.0.0',
      webhook: !!webhookHandler,
      telegram: telegramOk,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Debug endpoint — requires API key authentication
  // Prevents information leakage about system configuration
  if (url.pathname === '/debug' && req.method === 'GET') {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.API_KEY || process.env.WEBHOOK_SECRET;
    if (!expectedKey || apiKey !== expectedKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized — valid x-api-key required' }));
      console.warn(`[SECURITY] Unauthorized /debug access from ${req.headers['x-forwarded-for'] || 'unknown'}`);
      return;
    }
    const metrics = (() => { try { return require('./monitoring/uptime-metrics').getMetrics(); } catch(e) { return { error: e.message }; } })();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      checks: {
        webhook: !!webhookHandler,
        webhook_error: webhookLoadError,
        telegram: telegramOk,
        supabase: !!process.env.SUPABASE_URL,
        supabase_module: (() => { try { require('./supabase/client'); return 'ok'; } catch(e) { return e.message; } })(),
        openai: !!process.env.OPENAI_API_KEY,
        telegram_bot: !!process.env.TELEGRAM_BOT_TOKEN,
        d360: !!process.env.D360_API_KEY,
      },
      metrics,
      env: {
        PORT: process.env.PORT,
        NODE_ENV: process.env.NODE_ENV,
        has_supabase: !!process.env.SUPABASE_URL,
        has_openai: !!process.env.OPENAI_API_KEY,
        has_telegram: !!process.env.TELEGRAM_BOT_TOKEN,
        has_d360: !!process.env.D360_API_KEY,
      },
      uptime: process.uptime(),
      node_version: process.version,
      timestamp: new Date().toISOString()
    }, null, 2));
    return;
  }

  // If webhook handler loaded, delegate to it
  if (webhookHandler) {
    try {
      await webhookHandler(req, res);
      return;
    } catch (err) {
      console.error('[SERVER] Webhook handler error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
      return;
    }
  }

  // Fallback: webhook not loaded yet
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    error: 'Service initializing',
    message: 'Webhook handler not loaded yet. Please retry in 10 seconds.'
  }));
});

server.listen(PORT, () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log('  MOON HANDS SERVER');
  console.log(`  Port: ${PORT}`);
  console.log(`  Health: GET /health`);
  console.log(`  Debug:  GET /debug`);
  console.log(`${'='.repeat(50)}\n`);
});

// ─── ENVIRONMENT CHECK (non-blocking) ────────────────────────────

const ENV_CHECKS = [
  { key: 'SUPABASE_URL',              critical: true,  pattern: /^https:\/\/.+\.supabase\.co$/ },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', critical: true,  pattern: /^(eyJ|sb_secret_)/ },
  { key: 'TELEGRAM_BOT_TOKEN',        critical: true,  pattern: /^\d+:[A-Za-z0-9_-]+$/ },
  { key: 'TELEGRAM_ADMIN_CHAT_ID',    critical: true,  pattern: /^-?\d+$/ },
  { key: 'OPENAI_API_KEY',            critical: true,  pattern: /^sk-(proj-)?[A-Za-z0-9_-]+$/ },
  { key: 'D360_API_KEY',              critical: true,  pattern: null },
  { key: 'API_KEY',                   critical: false, pattern: /^.{8,}$/ },
  { key: 'WEBHOOK_SECRET',            critical: false, pattern: /^.{8,}$/ },
  { key: 'NODE_ENV',                  critical: false, pattern: null, defaultValue: 'production' },
];

const missingCritical = [];

for (const check of ENV_CHECKS) {
  const val = process.env[check.key];
  if (!val) {
    if (check.defaultValue) {
      process.env[check.key] = check.defaultValue;
    } else if (check.critical) {
      missingCritical.push(check.key);
    }
    continue;
  }
  if (check.pattern && !check.pattern.test(val)) {
    if (check.critical) missingCritical.push(`${check.key} (invalid format)`);
  }
}

if (missingCritical.length) {
  console.error(`\n❌ CRITICAL env vars missing:`);
  missingCritical.forEach(k => console.error(`   - ${k}`));
  console.error('   Go to Render Dashboard → Environment → Add them');
  console.error('   Webhook routes will return 503 until fixed.\n');
  // DON'T exit — server is already listening
} else {
  console.log('\n✅ All critical env vars OK. Loading modules...\n');
}

// ─── PRE-DEPLOY SAFETY CHECKS ────────────────────────────────────
// Validate ALL JS files have valid syntax BEFORE loading them.
// This prevents deploying broken code that crashes the webhook.

function validateAllModules() {
  const filesToCheck = [
    './server/webhook.js',
    './server/onboarding-submission.js',
    './ai/bot-engine.js',
    './ai/smart-router.js',
    './ai/conversation-state.js',
    './ai/intent-matcher.js',
    './ai/intent-handlers.js',
    './ai/expert-system/functions.js',
    './ai/expert-system/function-handlers.js',
    './middleware/smart-rate-limiter.js',
    './middleware/cost-protection.js',
    './telegram/booking-notifications.js',
    './utils/ical-generator.js',
    './supabase/client.js',
    './jobs/weekly-optimization-loop.js',
    './jobs/waitlist-reengagement.js',
    './jobs/daily-booking-summary.js',
  ];
  
  let allOk = true;
  for (const file of filesToCheck) {
    try {
      require('child_process').execSync(`node -c ${require('path').join(__dirname, file)}`, { stdio: 'pipe' });
    } catch (err) {
      console.error(`  ❌ SYNTAX ERROR in ${file}: ${err.stderr?.toString().slice(0, 200)}`);
      allOk = false;
    }
  }
  
  if (allOk) {
    console.log('  ✅ All module syntax checks passed');
  } else {
    console.error('\n🚨 DEPLOY BLOCKED: Syntax errors found in modules.');
    console.error('   Fix the errors and redeploy. Webhook will NOT load until fixed.\n');
  }
  return allOk;
}

// Run validation immediately (before attempting to load webhook)
const modulesValid = validateAllModules();

// ─── LOAD WEBHOOK HANDLER ────────────────────────────────────────

let webhookHandler = null;
let webhookLoadError = null;
let telegramOk = false;

// Load webhook module and extract the handler
setTimeout(async () => {
  // If syntax checks failed, don't even try loading
  if (!modulesValid) {
    console.error('  ⛔ Webhook loading skipped due to syntax errors');
    return;
  }
  
  try {
    const webhookModule = require('./server/webhook');
    if (webhookModule.requestHandler) {
      webhookHandler = webhookModule.requestHandler;
      console.log('  ✅ Webhook handler loaded');
    } else if (webhookModule.server) {
      // Legacy: extract handler from server
      const listeners = webhookModule.server.listeners('request');
      if (listeners.length > 0) {
        webhookHandler = listeners[0];
        console.log('  ✅ Webhook handler extracted from server');
      }
    } else {
      console.error('  ⚠️  Webhook module loaded but no handler found');
    }
  } catch (err) {
    webhookLoadError = {
      message: err.message,
      stack: err.stack?.split('\n')?.slice(0, 4).join('\n'),
      time: new Date().toISOString()
    };
    console.error('  ❌ Webhook module failed:', err.message);
    console.error('     Stack:', err.stack?.split('\n')?.[1]?.trim());
  }
}, 100);

// ─── 24/7 KEEPALIVE MONITORING ───────────────────────────────────
// Self-ping + webhook verification + auto-recovery alerts
// Starts only after webhook is loaded (to avoid false alerts during startup)

setTimeout(() => {
  try {
    const { startKeepalive } = require('./monitoring/keepalive');
    startKeepalive();
    console.log('  ✅ 24/7 keepalive monitor started');
  } catch (err) {
    console.error('  ❌ Keepalive monitor failed:', err.message);
  }
}, 5000); // Start 5 seconds after webhook attempt

// ─── START TELEGRAM BOT ──────────────────────────────────────────

setTimeout(async () => {
  try {
    require('./telegram/bot');
    telegramOk = true;
    console.log('  ✅ Telegram bot started');
  } catch (err) {
    console.error('  ❌ Telegram bot failed:', err.message);
  }
}, 200);

// ─── CLINIC CLOSING SUMMARY SCHEDULER ────────────────────────────
// Sends tomorrow's booking summary at each clinic's closing time
// (NOT midnight — doctor needs it when clinic closes, not when sleeping)

setTimeout(() => {
  try {
    const { checkAndSendClosingSummaries } = require('./jobs/closing-summary');
    // Run immediately on startup
    checkAndSendClosingSummaries();
    // Then every 15 minutes
    setInterval(checkAndSendClosingSummaries, 15 * 60 * 1000);
    console.log('  ✅ Closing summary scheduler started (every 15 min)');
  } catch (err) {
    console.error('  ❌ Closing summary scheduler failed:', err.message);
  }
}, 300);

// ─── DAILY REPORT SCHEDULER ──────────────────────────────────────
// Midnight cost report (for admin only)

setTimeout(() => {
  try {
    const { runDailyReport } = require('./jobs/daily-report');
    // Run at midnight Singapore time
    const now = new Date();
    const sgNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
    const midnight = new Date(sgNow);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight - sgNow;
    
    setTimeout(() => {
      runDailyReport();
      setInterval(runDailyReport, 24 * 60 * 60 * 1000); // Every 24 hours
    }, msUntilMidnight);
    console.log('  ✅ Daily report scheduler started (midnight SGT)');
  } catch (err) {
    console.error('  ❌ Daily report scheduler failed:', err.message);
  }
}, 400);

// ─── WEEKLY OPTIMIZATION LOOP (Premium Tier) ─────────────────────
// AI-powered weekly analysis: FAQ gaps, no-show patterns, conversion leaks
// Runs every Sunday at 2 AM SGT. Cost-controlled: ~S$0.03/clinic/week.

setTimeout(() => {
  try {
    const { startWeeklyLoopScheduler } = require('./jobs/weekly-optimization-loop');
    startWeeklyLoopScheduler();
    console.log('  ✅ Weekly optimization loop scheduler started (Sundays 2 AM SGT)');
  } catch (err) {
    console.error('  ❌ Weekly loop scheduler failed:', err.message);
  }
}, 500);

// ─── WAITLIST RE-ENGAGEMENT ENGINE ───────────────────────────────
// Monitors cancelled appointments every 15 min, proactively notifies
// waitlisted patients via WhatsApp when slots open up.

setTimeout(() => {
  try {
    const { startWaitlistScheduler } = require('./jobs/waitlist-reengagement');
    startWaitlistScheduler();
    console.log('  ✅ Waitlist re-engagement scheduler started (every 15 min)');
  } catch (err) {
    console.error('  ❌ Waitlist scheduler failed:', err.message);
  }
}, 600);

// ─── DAILY BOOKING SUMMARY ───────────────────────────────────────
// Morning summary at 8:30 AM SGT with YES/NO attendance buttons.
// Post-appointment follow-ups every 15 minutes.

setTimeout(() => {
  try {
    const { startDailySummaryScheduler } = require('./jobs/daily-booking-summary');
    startDailySummaryScheduler();
    console.log('  ✅ Daily booking summary scheduler started (8:30 AM SGT)');
  } catch (err) {
    console.error('  ❌ Daily summary scheduler failed:', err.message);
  }
}, 700);

// ─── FINAL STATUS ────────────────────────────────────────────────

setTimeout(() => {
  const allOk = webhookHandler && telegramOk;
  console.log(`\n${'='.repeat(50)}`);
  console.log(allOk
    ? `  🌙 Moon Hands is LIVE`
    : `  ⚠️  Partially started (see errors above)`);
  console.log(`  Server:         http://0.0.0.0:${PORT}`);
  console.log(`  Webhook:        ${webhookHandler ? '✅' : '❌'}`);
  console.log(`  Telegram:       ${telegramOk ? '✅' : '❌'}`);
  console.log(`  Node:           ${process.version}`);
  console.log(`${'='.repeat(50)}\n`);
}, 3000);
