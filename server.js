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
  // SECURITY HEADERS (applied to all responses)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://api.telegram.org https://api.openai.com https://waba.360dialog.io https://waba-sandbox.360dialog.io; img-src 'self' data: https:;");

  // CORS — restricted to known Moon Hands origins only
  const ALLOWED_ORIGINS = [
    'https://wzejxaudglkym.kimi.page',
    'https://moonhands.sg',
    'https://www.moonhands.sg',
    'http://localhost:3000',
    'http://localhost:5173',
  ];
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Moonhands-Master, X-Moonhands-Agent');
  res.setHeader('Vary', 'Origin');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  // ─── IP-BASED RATE LIMITING (per-endpoint) ──────────────────────
  // Simple in-memory rate limiter for non-webhook endpoints.
  // Webhook endpoints have their own per-clinic rate limiting.
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.connection?.remoteAddress || 'unknown';
  const rateLimitStore = (global._rateLimitStore = global._rateLimitStore || new Map());
  function isRateLimited(endpointKey, maxRequests = 10, windowMs = 60 * 1000) {
    const key = `${clientIp}:${endpointKey}`;
    const now = Date.now();
    const record = rateLimitStore.get(key) || { count: 0, resetAt: 0 };
    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }
    record.count++;
    rateLimitStore.set(key, record);
    return record.count > maxRequests;
  }
  // Cleanup old entries every 10 minutes
  if (!global._rateLimitCleanup) {
    global._rateLimitCleanup = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of rateLimitStore.entries()) {
        if (now > record.resetAt) rateLimitStore.delete(key);
      }
    }, 10 * 60 * 1000);
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

  // Google Calendar connection verification (rate-limited: 5 req/min per IP)
  if (url.pathname === '/api/calendar/verify' && req.method === 'GET') {
    if (isRateLimited('calendar_verify', 5, 60 * 1000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Too many requests. Please wait a minute and try again.' }));
      return;
    }
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

  // ─── CALENDAR EVENT (.ics) ENDPOINT ──────────────────────────────
  // Generates a downloadable .ics file for any booking.
  // Compatible with Apple Calendar, Google Calendar, Outlook.
  // URL format: /calendar-event/{bookingRef}?date=YYYY-MM-DD&time=HH:MM&treatment=...&clinic=...&duration=60
  //
  if (url.pathname.startsWith('/calendar-event/') && req.method === 'GET') {
    try {
      const parts = url.pathname.split('/');
      const bookingRef = parts[2] || 'unknown';
      const date = url.searchParams.get('date');
      const time = url.searchParams.get('time');
      const treatment = url.searchParams.get('treatment') || 'Appointment';
      const clinic = url.searchParams.get('clinic') || 'Pixel Vault';
      const duration = parseInt(url.searchParams.get('duration')) || 60;
      const address = url.searchParams.get('address') || '';
      
      if (!date || !time) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing date or time parameter');
        return;
      }
      
      // Parse date & time to create start/end datetime
      const [year, month, day] = date.split('-').map(Number);
      const [hour, minute] = time.split(':').map(Number);
      const startDate = new Date(Date.UTC(year, month - 1, day, hour - 8, minute)); // SGT to UTC
      const endDate = new Date(startDate.getTime() + duration * 60000);
      
      const formatICSDate = (d) => {
        return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      };
      
      const uid = `${bookingRef}@moonhands.sg`;
      const dtStamp = formatICSDate(new Date());
      const dtStart = formatICSDate(startDate);
      const dtEnd = formatICSDate(endDate);
      
      const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Moon Hands//Pixel Vault//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${treatment} at ${clinic}`,
        `DESCRIPTION:Booking Reference: ${bookingRef}\\nTreatment: ${treatment}\\nClinic: ${clinic}`,
        address ? `LOCATION:${address}` : '',
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Reminder',
        'TRIGGER:-PT15M',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR'
      ].filter(Boolean).join('\r\n');
      
      res.writeHead(200, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${bookingRef}.ics"`,
        'Content-Length': Buffer.byteLength(icsContent)
      });
      res.end(icsContent);
      return;
    } catch (err) {
      console.error(`[CALENDAR] Error generating .ics: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error generating calendar event');
      return;
    }
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

    // Start proactive follow-up scheduler for stalled booking conversations
    if (webhookModule.startFollowUpScheduler) {
      webhookModule.startFollowUpScheduler(5 * 60 * 1000); // Check every 5 minutes
      console.log('  ✅ Follow-up scheduler started (5min interval)');
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

// ─── TRIAL EXPIRY CHECKER ────────────────────────────────────────
// Runs daily at 9 AM SGT. Alerts admin when trials are expiring.

setTimeout(() => {
  try {
    const { checkTrialExpiries } = require('./jobs/trial-expiry-checker');
    // Run at 9 AM SGT = 1 AM UTC
    const now = new Date();
    const sgNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
    const nineAM = new Date(sgNow);
    nineAM.setHours(9, 0, 0, 0);
    if (nineAM <= sgNow) nineAM.setDate(nineAM.getDate() + 1);
    const msUntil9AM = nineAM - sgNow;
    
    setTimeout(() => {
      checkTrialExpiries();
      setInterval(checkTrialExpiries, 24 * 60 * 60 * 1000);
    }, msUntil9AM);
    console.log('  ✅ Trial expiry checker started (9 AM SGT daily)');
  } catch (err) {
    console.error('  ❌ Trial expiry checker failed:', err.message);
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
