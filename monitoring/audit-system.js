/**
 * Moon Hands — Intrusion Detection & Activity Monitoring System
 * Tracks ALL access to: GitHub, Render, Supabase, Telegram, WhatsApp, Website
 * 
 * Identity model:
 *   "Master"  → You (via known devices: laptop, phone)
 *   "Kimi"    → Me (via known agent signature)
 *   "unknown" → Potential intruder (flagged for review)
 * 
 * Triggers:
 *   - Every webhook request (WhatsApp patient messages)
 *   - Every Telegram admin command
 *   - Every Render deployment
 *   - Every Supabase schema/query change
 *   - Every failed auth attempt
 *   - Every suspicious pattern (new device, new IP, odd hours, etc.)
 */

require('dotenv').config();
const crypto = require('crypto');

// ─── DEVICE FINGERPRINTING ────────────────────────────────────────

/**
 * Generate a device fingerprint from request headers.
 * NOT foolproof (headers can be spoofed) but catches casual attackers
 * and provides a tracking baseline.
 */
function getDeviceFingerprint(req) {
  const components = [
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || '',
    req.headers['accept-encoding'] || '',
    req.headers['dnt'] || '',
    req.headers['sec-ch-ua'] || '',
    req.headers['sec-ch-ua-platform'] || '',
    req.ip || req.connection?.remoteAddress || '',
  ];
  const raw = components.join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

/**
 * Classify a device as known (Master/Kimi) or unknown.
 * Master devices are registered via env vars.
 * Kimi devices are detected via a secret agent header.
 */
function classifyActor(req) {
  // Kimi: we inject a secret header in all our requests
  const agentHeader = req.headers['x-moonhands-agent'];
  if (agentHeader === process.env.MOONHANDS_AGENT_SECRET) {
    return { actor: 'Kimi', trustLevel: 'trusted', deviceId: getDeviceFingerprint(req) };
  }
  
  // Master: check against registered device fingerprints
  const fp = getDeviceFingerprint(req);
  const masterDevices = (process.env.MASTER_DEVICE_FPS || '').split(',').filter(Boolean);
  if (masterDevices.includes(fp)) {
    return { actor: 'Master', trustLevel: 'trusted', deviceId: fp };
  }
  
  // Unknown — potential intruder
  return { actor: 'unknown', trustLevel: 'unverified', deviceId: fp };
}

// ─── KNOWN MASTER DEVICE REGISTRATION ────────────────────────────

/**
 * Call this ONCE from each of your devices to register them.
 * POST /api/register-device with your name "Master"
 * 
 * After registration, add the returned deviceId to your Render env vars:
 *   MASTER_DEVICE_FPS=deviceId1,deviceId2
 */
async function registerMasterDevice(req, res) {
  const { actor, deviceId } = classifyActor(req);
  
  // Only allow registration if request has the master secret
  const masterSecret = req.headers['x-master-secret'];
  if (masterSecret !== process.env.MASTER_SECRET) {
    await logEvent({
      severity: 'high',
      category: 'unauthorized_access',
      actor: 'unknown',
      action: 'register_device_attempt',
      description: 'Attempted device registration without master secret',
      deviceId,
      sourceIp: req.ip || req.connection?.remoteAddress,
      details: { userAgent: req.headers['user-agent'] },
    });
    return res.writeHead(401).end(JSON.stringify({ error: 'Unauthorized' }));
  }
  
  // Log successful registration
  await logEvent({
    severity: 'info',
    category: 'device_registration',
    actor: 'Master',
    action: 'register_device',
    description: `Master device registered: ${deviceId}`,
    deviceId,
    sourceIp: req.ip || req.connection?.remoteAddress,
    details: { userAgent: req.headers['user-agent'] },
  });
  
  // Send Telegram alert with the deviceId to add to env vars
  await sendSecurityAlert(
    `🔐 Master Device Registered\n\n` +
    `Device ID: \`${deviceId}\`\n` +
    `IP: ${req.ip || req.connection?.remoteAddress}\n` +
    `User-Agent: ${req.headers['user-agent']?.substring(0, 50)}\n\n` +
    `Add this to your Render env vars:\n` +
    `MASTER_DEVICE_FPS=${deviceId}\n\n` +
    `(If you have multiple devices, comma-separate them)`,
    'info'
  );
  
  return res.writeHead(200).end(JSON.stringify({
    deviceId,
    message: 'Device registered. Add deviceId to MASTER_DEVICE_FPS env var.',
  }));
}

// ─── SUSPICIOUS ACTIVITY DETECTION ──────────────────────────────

const recentEvents = new Map(); // in-memory sliding window for fast checks
const SUSPICIOUS_PATTERNS = [
  {
    id: 'unknown_device_access',
    check: (event) => event.actor === 'unknown' && event.severity !== 'info',
    severity: 'high',
    description: 'Untrusted device performing sensitive actions',
  },
  {
    id: 'failed_auth_burst',
    check: (event, history) => {
      if (event.category !== 'auth_failure') return false;
      const recent = history.filter(e => 
        e.category === 'auth_failure' && 
        Date.now() - new Date(e.created_at).getTime() < 60000
      );
      return recent.length >= 5; // 5+ auth failures in 1 minute
    },
    severity: 'critical',
    description: 'Brute force attack: 5+ auth failures in 60 seconds',
  },
  {
    id: 'off_hours_access',
    check: (event) => {
      const hour = new Date().getHours();
      return event.actor === 'unknown' && (hour < 6 || hour > 23);
    },
    severity: 'medium',
    description: 'Unknown device accessing system during off-hours (12am-6am)',
  },
  {
    id: 'new_ip_location',
    check: (event, history) => {
      if (event.actor === 'trusted') return false;
      const knownIps = new Set(history.filter(e => e.actor === 'Master').map(e => e.source_ip));
      return knownIps.size > 0 && !knownIps.has(event.source_ip);
    },
    severity: 'medium',
    description: 'Access from new IP address not previously used by Master',
  },
  {
    id: 'rate_limit_triggered',
    check: (event) => event.category === 'rate_limit',
    severity: 'high',
    description: 'Rate limit triggered — possible abuse or attack',
  },
  {
    id: 'cost_anomaly',
    check: (event) => event.category === 'cost_anomaly',
    severity: 'high',
    description: 'Unusual cost spike detected',
  },
  {
    id: 'github_token_exposed',
    check: (event) => event.action === 'github_token_usage' && event.actor === 'unknown',
    severity: 'critical',
    description: 'GitHub token used by unknown actor — REVOKE IMMEDIATELY',
  },
  {
    id: 'mass_data_access',
    check: (event, history) => {
      const recent = history.filter(e => 
        e.actor === event.actor && 
        e.category === 'data_access' &&
        Date.now() - new Date(e.created_at).getTime() < 300000
      );
      return recent.length >= 20; // 20+ data access in 5 min
    },
    severity: 'critical',
    description: 'Mass data access pattern — possible data exfiltration',
  },
];

// ─── CORE AUDIT LOGGING ──────────────────────────────────────────

/**
 * Log every significant event to Supabase audit_log table.
 * This is the backbone of the monitoring system.
 */
async function logEvent(event) {
  const timestamp = new Date().toISOString();
  
  const payload = {
    severity: event.severity || 'info',         // critical | high | medium | low | info
    category: event.category || 'general',      // auth_failure | rate_limit | data_access | deployment | webhook | telegram | unauthorized_access | device_registration | cost_anomaly | general
    actor: event.actor || 'unknown',            // Master | Kimi | unknown
    action: event.action || 'unknown',          // describe what happened
    description: event.description || '',       // human-readable
    device_id: event.deviceId || null,
    source_ip: event.sourceIp || null,
    service: event.service || 'webhook',        // github | render | supabase | telegram | whatsapp | website | webhook
    details: event.details || {},               // flexible JSON
    created_at: timestamp,
  };
  
  // Always log to console (backup if Supabase fails)
  const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', info: 'ℹ️' }[payload.severity];
  console.log(`[AUDIT] ${emoji} ${payload.actor} triggered: ${payload.action} | ${payload.severity} | ${payload.service}`);
  
  // Write to Supabase (fire-and-forget but catch errors)
  try {
    const { supabase } = require('../supabase/client');
    const { error } = await supabase.from('audit_log').insert([payload]);
    if (error) console.error('[AUDIT] Supabase insert failed:', error.message);
  } catch (err) {
    console.error('[AUDIT] Failed to persist to Supabase:', err.message);
  }
  
  // Check for suspicious patterns
  await checkSuspiciousPatterns(payload);
  
  // Update in-memory sliding window
  const key = `${payload.actor}:${payload.source_ip}`;
  if (!recentEvents.has(key)) recentEvents.set(key, []);
  const events = recentEvents.get(key);
  events.push(payload);
  // Keep only last 100 events per actor:ip pair, older than 1 hour removed
  const cutoff = Date.now() - 3600000;
  while (events.length > 100 || (events[0] && new Date(events[0].created_at).getTime() < cutoff)) {
    events.shift();
  }
}

/**
 * Check all suspicious patterns against the new event.
 */
async function checkSuspiciousPatterns(event) {
  const history = recentEvents.get(`${event.actor}:${event.source_ip}`) || [];
  
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.check(event, history)) {
      await sendSecurityAlert(
        `${pattern.severity === 'critical' ? '🔴 CRITICAL' : pattern.severity === 'high' ? '🟠 HIGH' : '🟡 MEDIUM'}\n\n` +
        `Pattern: ${pattern.id}\n` +
        `Description: ${pattern.description}\n` +
        `Actor: ${event.actor}\n` +
        `Action: ${event.action}\n` +
        `IP: ${event.source_ip}\n` +
        `Device: ${event.device_id || 'unknown'}\n` +
        `Time: ${new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}`,
        pattern.severity
      );
    }
  }
}

// ─── TELEGRAM SECURITY ALERTS ───────────────────────────────────

async function sendSecurityAlert(message, severity = 'warning') {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!botToken || !chatId) return;
  
  const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', info: 'ℹ️' }[severity] || '⚠️';
  
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${emoji} *SECURITY ALERT*\n\n${message}`,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('[AUDIT] Failed to send Telegram alert:', err.message);
  }
}

// ─── WRAPPER: MONITOR WEBHOOK REQUESTS ──────────────────────────

/**
 * Middleware that wraps the webhook handler.
 * Logs every incoming request with device fingerprinting.
 */
function monitorWebhook(handler) {
  return async (req, res) => {
    const { actor, trustLevel, deviceId } = classifyActor(req);
    const startMs = Date.now();
    
    // Log the incoming request
    await logEvent({
      severity: 'info',
      category: 'webhook',
      actor,
      action: 'whatsapp_message_received',
      description: `${actor} triggered: Incoming WhatsApp message`,
      deviceId,
      sourceIp: req.ip || req.connection?.remoteAddress,
      service: 'whatsapp',
      details: {
        trustLevel,
        method: req.method,
        path: req.url,
        userAgent: req.headers['user-agent']?.substring(0, 100),
      },
    });
    
    // Flag if unknown device is hitting the webhook (very suspicious)
    if (actor === 'unknown') {
      await logEvent({
        severity: 'high',
        category: 'unauthorized_access',
        actor: 'unknown',
        action: 'unknown_device_webhook',
        description: 'UNTRUSTED device triggered webhook — possible intrusion',
        deviceId,
        sourceIp: req.ip || req.connection?.remoteAddress,
        service: 'whatsapp',
        details: { userAgent: req.headers['user-agent'] },
      });
    }
    
    // Call the actual handler
    try {
      await handler(req, res);
    } catch (err) {
      await logEvent({
        severity: 'high',
        category: 'general',
        actor,
        action: 'webhook_error',
        description: `Webhook handler threw: ${err.message}`,
        deviceId,
        sourceIp: req.ip || req.connection?.remoteAddress,
        service: 'whatsapp',
        details: { error: err.message, stack: err.stack?.substring(0, 200) },
      });
      throw err;
    }
    
    // Log completion
    const elapsedMs = Date.now() - startMs;
    await logEvent({
      severity: 'info',
      category: 'webhook',
      actor,
      action: 'webhook_processed',
      description: `${actor} triggered: Webhook processed in ${elapsedMs}ms`,
      deviceId,
      sourceIp: req.ip || req.connection?.remoteAddress,
      service: 'whatsapp',
      details: { responseTimeMs: elapsedMs },
    });
  };
}

// ─── WRAPPER: MONITOR TELEGRAM COMMANDS ─────────────────────────

/**
 * Log every Telegram admin command.
 */
async function monitorTelegramCommand(ctx, handler) {
  const actor = 'Master'; // Telegram admin commands are always from you
  const startMs = Date.now();
  
  await logEvent({
    severity: 'info',
    category: 'telegram',
    actor,
    action: 'telegram_command',
    description: `${actor} triggered: /${ctx.message?.text?.split(' ')[0]?.replace('/', '')}`,
    sourceIp: null, // Telegram doesn't expose IP
    service: 'telegram',
    details: {
      command: ctx.message?.text,
      userId: ctx.from?.id,
      username: ctx.from?.username,
    },
  });
  
  try {
    return await handler(ctx);
  } catch (err) {
    await logEvent({
      severity: 'high',
      category: 'telegram',
      actor,
      action: 'telegram_error',
      description: `Telegram command failed: ${err.message}`,
      service: 'telegram',
      details: { error: err.message, command: ctx.message?.text },
    });
    throw err;
  }
}

// ─── WRAPPER: MONITOR RENDER DEPLOYMENTS ────────────────────────

/**
 * Call this from server.js on startup to log the deploy event.
 */
async function logDeployment() {
  await logEvent({
    severity: 'info',
    category: 'deployment',
    actor: 'system',
    action: 'server_startup',
    description: 'Render deployment started — server initializing',
    sourceIp: null,
    service: 'render',
    details: {
      nodeVersion: process.version,
      env: process.env.NODE_ENV,
      port: process.env.PORT,
    },
  });
}

// ─── EXPORTS ─────────────────────────────────────────────────────

module.exports = {
  logEvent,
  logDeployment,
  monitorWebhook,
  monitorTelegramCommand,
  registerMasterDevice,
  getDeviceFingerprint,
  classifyActor,
  sendSecurityAlert,
};
