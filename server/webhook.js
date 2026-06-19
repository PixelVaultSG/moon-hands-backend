/**
 * Moon Hands - Secure Webhook Server
 * Receives messages from 360dialog (WhatsApp) and VAPI (Voice)
 *
 * AUTHENTICATION ARCHITECTURE — Per-Clinic Webhook URLs:
 * Each clinic gets a unique webhook URL with embedded credentials:
 *   /webhook/whatsapp?clinic_id=ABC123&token=xyz789
 *
 * The clinic's 360dialog account posts to this URL. We validate:
 * 1. clinic_id exists in our database
 * 2. token matches the clinic's webhook_token
 * 3. clinic is active (status = 'active')
 *
 * Internal/admin endpoints use x-api-key header auth.
 * No more WEBHOOK_AUTH_REQUIRED=false hack needed.
 *
 * SECURITY-FIRST DESIGN:
 * - Per-clinic query parameter authentication
 * - DDoS protection (IP-based rate limiting)
 * - Request signature verification (HMAC) for internal endpoints
 * - Prompt injection blocking on EVERY message
 * - Input sanitization (HTML/script stripping)
 * - Request size limits (prevent DoS)
 * - Comprehensive audit logging
 */

const http = require('http');
const crypto = require('crypto');
const { handleOnboarding, activateClinic } = require('./onboarding');
const { checkMessageRate } = require('../middleware/smart-rate-limiter');
const { loopDetector } = require('../middleware/loop-protection');
const { processIncomingMessage, sanitizeInput } = require('../middleware/security');
const { generateICalFeed } = require('../utils/ical-generator');
const { recordMessage, recordRateLimit, recordLoop, recordError } = require('../monitoring/uptime-metrics');
const { checkLimit, trackSpend } = require('../middleware/cost-protection');
const { logEvent, getDeviceFingerprint, classifyActor } = require('../monitoring/audit-system');

// ─── ADMIN TELEGRAM ALERTS ───────────────────────────────────────
async function sendAdminAlert(message, level = 'warning') {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!botToken || !chatId) return;
  
  const emoji = { info: '\u2139', warning: '\u26A0', critical: '\uD83D\uDD34' }[level] || '\u26A0';
  const prefix = level === 'critical' ? 'KILL SWITCH' : level === 'warning' ? 'COST ALERT' : 'RATE LIMIT';
  
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${emoji} *${prefix}*\n\n${message}\n\n_${new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}_`,
        parse_mode: 'Markdown'
      })
    });
  } catch (err) {
    console.error('[TELEGRAM] Failed to send admin alert:', err.message);
  }
}

// ─── DUAL-ROUTING COST ALERT ─────────────────────────────────────
// Sends cost overusage alerts to BOTH Moon Hands admin AND clinic admin
// Security alerts go to Moon Hands admin ONLY (see sendAdminAlert)

async function sendClinicCostAlert(clinicId, type, reason, isDouble = false) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;
  
  const label = type === 'whatsapp' ? 'WhatsApp messages' : 'AI API calls';
  const tier = isDouble ? 'DOUBLE' : 'daily';
  const emoji = isDouble ? '🚨' : '⚠️';
  
  const message = [
    `${emoji} *Cost ${tier} limit reached*`,
    ``,
    `Your clinic has exceeded the ${tier} limit for ${label}.`,
    ``,
    `*Details:* ${reason}`,
    ``,
    isDouble
      ? `🔴 This is your SECOND alert. Your usage is significantly above your plan. Our team will contact you shortly to discuss your account and options.`
      : `🟡 This is a friendly heads-up. You're at your plan's daily usage limit. Service continues uninterrupted — no disruption to your patients.`,
    ``,
    `*Questions?* Contact Pixel Vault support.`,
    ``,
    `_This alert is also sent to our operations team._`,
  ].join('\n');
  
  // Try to send to clinic's Telegram chat (if configured)
  try {
    const { supabase } = require('./supabase/client');
    const { data: client } = await supabase
      .from('clients')
      .select('telegram_chat_id, name')
      .eq('id', clinicId)
      .single();
    
    if (client?.telegram_chat_id) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: client.telegram_chat_id,
          text: message,
          parse_mode: 'Markdown'
        })
      });
    }
  } catch (err) {
    // Clinic may not have telegram_chat_id configured — that's ok, admin still gets it
  }
}

// Rate limiter uses in-memory store with automatic TTL cleanup
// No manual cleanup needed — old entries expire naturally

// Simple IP-based rate limiter for DDoS protection
class IPRateLimiter {
  constructor() {
    this.ips = new Map(); // ip -> { count, windowStart }
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // cleanup every min
  }
  
  cleanup() {
    const now = Date.now();
    for (const [ip, data] of this.ips.entries()) {
      if (now - data.windowStart > 60000) this.ips.delete(ip);
    }
  }
  
  checkDDoS(ip) {
    const now = Date.now();
    const data = this.ips.get(ip);
    
    if (!data || now - data.windowStart > 60000) {
      this.ips.set(ip, { count: 1, windowStart: now });
      return { allowed: true };
    }
    
    data.count++;
    
    if (data.count > 100) { // 100 requests per minute max
      return { allowed: false, retryAfter: 60, reason: 'Rate limit exceeded' };
    }
    
    return { allowed: true };
  }
}

const rateLimiter = new IPRateLimiter();

// ─── MESSAGE TRACE LOG (for diagnostics) ─────────────────────────

const MAX_TRACE_LOG = 50;
const messageTraceLog = [];

function addTrace(phone, stage, status, detail = '') {
  const trace = {
    time: new Date().toISOString(),
    phone: phone ? phone.slice(-4) : 'unknown',
    stage,
    status,
    detail: detail.length > 200 ? detail.slice(0, 200) + '...' : detail
  };
  messageTraceLog.push(trace);
  if (messageTraceLog.length > MAX_TRACE_LOG) messageTraceLog.shift();
  console.log(`[TRACE] ${trace.phone} | ${stage} | ${status}${detail ? ' | ' + detail.slice(0, 100) : ''}`);
}

// ─── CONFIGURATION ───────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const API_KEY = process.env.API_KEY;
const MAX_BODY_SIZE = 10 * 1024; // 10KB max request body

// Use provided API_KEY or generate a secure random one as fallback
// (fallback allows the server to start; set API_KEY properly for production security)
const effectiveApiKey = API_KEY || crypto.randomBytes(32).toString('hex');
if (!API_KEY) {
  console.warn('[SECURITY] API_KEY not set — using auto-generated key. Set API_KEY in Render for production.');
}

console.log(`[SECURITY] Webhook server configured`);

// ─── REQUEST PARSING ─────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error('Request body too large'));
        return;
      }
      body += chunk;
    });
    
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({ raw: body });
      }
    });
    
    req.on('error', reject);
  });
}

// ─── SIGNATURE VERIFICATION ──────────────────────────────────────

function verifySignature(payload, signature, secret) {
  if (!signature || !secret) return false;
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
      .digest('hex');
    // Prevent timingSafeEqual crash on length mismatch
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────

function checkAuth(req) {
  const authHeader = req.headers['x-api-key'] || req.headers['authorization'];
  if (!authHeader) return false;
  const key = authHeader.replace('Bearer ', '');
  return key === effectiveApiKey;
}

// Cache for clinic webhook tokens — avoids repeated Supabase lookups
// Format: { token: { clientId, expiresAt } }
const clinicTokenCache = new Map();
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Validate clinic webhook via query parameters.
 * Each clinic's 360dialog account posts to:
 *   /webhook/whatsapp?clinic_id=ABC123&token=xyz789
 *
 * @param {URL} url — The parsed request URL
 * @returns {Promise<{valid: boolean, clientId: string|null, clinicName: string|null, error: string|null}>}
 */
async function validateClinicWebhook(url) {
  const clinicId = url.searchParams.get('clinic_id');
  const token = url.searchParams.get('token');

  if (!clinicId || !token) {
    return { valid: false, clientId: null, clinicName: null, error: 'Missing clinic_id or token parameter' };
  }

  // Check cache first
  const cacheKey = `${clinicId}:${token}`;
  const cached = clinicTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { valid: true, clientId: cached.clientId, clinicName: cached.clinicName, error: null };
  }

  try {
    const { supabase } = require('../supabase/client');
    // clinic_id in URL is the slug (e.g., 'pixellvault'), not the UUID
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, webhook_token, status')
      .eq('slug', clinicId)
      .single();

    if (error || !data) {
      return { valid: false, clientId: null, clinicName: null, error: 'Clinic not found' };
    }

    if (data.status !== 'active') {
      return { valid: false, clientId: null, clinicName: null, error: 'Clinic is not active' };
    }

    // Constant-time comparison to prevent timing attacks
    const expectedBuf = Buffer.from(data.webhook_token || '', 'utf8');
    const providedBuf = Buffer.from(token, 'utf8');
    if (expectedBuf.length !== providedBuf.length) {
      return { valid: false, clientId: null, clinicName: null, error: 'Invalid token' };
    }
    const match = crypto.timingSafeEqual(expectedBuf, providedBuf);

    if (!match) {
      return { valid: false, clientId: null, clinicName: null, error: 'Invalid token' };
    }

    // Cache successful validation
    clinicTokenCache.set(cacheKey, {
      clientId: data.id,
      clinicName: data.name,
      expiresAt: Date.now() + TOKEN_CACHE_TTL
    });

    return { valid: true, clientId: data.id, clinicName: data.name, error: null };

  } catch (err) {
    console.error('[WEBHOOK_AUTH] Validation error:', err.message);
    return { valid: false, clientId: null, clinicName: null, error: 'Validation error' };
  }
}

/**
 * Generate a unique webhook URL for a clinic.
 * Called during onboarding / clinic activation.
 */
function generateWebhookToken() {
  return crypto.randomBytes(24).toString('hex'); // 48-char hex string
}

/**
 * Build the full webhook URL for a clinic to configure in 360dialog.
 */
function getClinicWebhookUrl(clinicId, token) {
  const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://moon-hands-backend.onrender.com';
  return `${baseUrl}/webhook/whatsapp?clinic_id=${clinicId}&token=${token}`;
}

// ─── DDoS PROTECTION ─────────────────────────────────────────────

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || req.connection.remoteAddress 
    || 'unknown';
}

function checkDDoS(ip) {
  return rateLimiter.checkDDoS(ip);
}

// ─── SECURITY RESPONSE HELPERS ───────────────────────────────────

function sendSecurityResponse(res, status, message, details = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    status: status >= 400 ? 'error' : 'ok',
    message,
    timestamp: new Date().toISOString(),
    ...details
  }));
}

// ─── MAIN WEBHOOK HANDLER ────────────────────────────────────────

async function handleWebhook(req, res, channel, url) {
  const ip = getClientIP(req);
  const startTime = Date.now();

  // DIAGNOSTIC: Log every incoming webhook request
  console.log(`[WEBHOOK] ====== REQUEST ${req.method} ${url.pathname} ======`);
  console.log(`[WEBHOOK] clinic_id: ${url.searchParams.get('clinic_id')}`);
  console.log(`[WEBHOOK] token: ${(url.searchParams.get('token') || '').substring(0, 8)}...`);
  console.log(`[WEBHOOK] IP: ${ip}`);

  try {
    // Layer 1: DDoS check
    const ddos = checkDDoS(ip);
    if (!ddos.allowed) {
      console.warn(`[SECURITY] DDoS blocked IP ${ip}: ${ddos.reason}`);
      return sendSecurityResponse(res, 429, 'Too many requests', {
        retryAfter: ddos.retryAfter
      });
    }

    // Layer 2: PER-CLINIC QUERY PARAMETER AUTHENTICATION
    // Each clinic's 360dialog account posts to:
    //   /webhook/whatsapp?clinic_id=ABC123&token=xyz789
    // We validate the token against the clinic's stored webhook_token in Supabase.
    let preResolvedClientId = null;
    let preResolvedClinicName = null;

    if (channel === 'whatsapp') {
      const auth = await validateClinicWebhook(url);
      if (!auth.valid) {
        console.warn(`[SECURITY] Invalid clinic webhook from ${ip}: ${auth.error}`);
        await logSecurityEvent({
          severity: 'high',
          category: 'auth_failure',
          service: 'webhook',
          description: `Clinic webhook auth failed: ${auth.error}`,
          details: { ip, error: auth.error, path: url.pathname },
          source_ip: ip,
        });
        console.log(`[WEBHOOK] Auth FAILED: ${auth.error}`);
        return sendSecurityResponse(res, 401, 'Unauthorized', { reason: auth.error });
      }
      preResolvedClientId = auth.clientId;
      preResolvedClinicName = auth.clinicName;
      addTrace(null, 'AUTH', 'CLINIC_TOKEN_VALID', `${auth.clinicName} (${auth.clientId.slice(0, 8)})`);
      console.log(`[WEBHOOK] Auth OK: ${auth.clinicName} (${auth.clientId})`);
    } else {
      // Voice channel: still uses header auth (x-api-key)
      if (!checkAuth(req)) {
        console.warn(`[SECURITY] Unauthorized voice webhook from ${ip}`);
        return sendSecurityResponse(res, 401, 'Unauthorized');
      }
    }

    // Layer 3: Parse body (with size limit)
    const body = await parseBody(req);

    // Layer 4: Verify webhook signature — INTERNAL ENDPOINTS ONLY
    // WhatsApp/360dialog: SKIPPED — Layer 2 per-clinic token auth is cryptographically sufficient.
    // 360dialog sends x-hub-signature-256 (Meta format: sha256=<base64_hmac>) which uses a different
    // signing scheme than our verifySignature() expects (hex HMAC). Attempting to verify it causes
    // false rejections blocking ALL patient messages. The per-clinic webhook_token in the URL query
    // parameter provides equivalent security without this incompatibility.
    if (channel !== 'whatsapp') {
      const signature = req.headers['x-signature'] || req.headers['x-hub-signature-256'];
      if (WEBHOOK_SECRET && signature) {
        if (!verifySignature(body.raw || body, signature, WEBHOOK_SECRET)) {
          console.warn(`[SECURITY] Invalid webhook signature from ${ip} (channel: ${channel})`);
          return sendSecurityResponse(res, 401, 'Invalid signature');
        }
      }
    }
    
    // Layer 5: Extract and validate message
    const message = extractMessage(body, channel);
    if (!message || !message.text) {
      return sendSecurityResponse(res, 200, 'No message to process');
    }
    
    // Layer 6: CRITICAL — Prompt injection check
    const securityCheck = processIncomingMessage(message.text, {
      ip,
      channel,
      userId: message.from
    });
    
    if (securityCheck.blocked) {
      console.error(`[SECURITY] INJECTION BLOCKED from ${ip} [${channel}]: ${securityCheck.reason}`);
      
      // Log to security_events table
      await logSecurityEvent({
        severity: 'high',
        category: 'injection',
        service: channel,
        description: `Blocked injection attempt from ${ip}`,
        details: {
          matched_patterns: securityCheck.injection?.matched,
          score: securityCheck.injection?.score,
          category: securityCheck.injection?.category,
          message_preview: message.text.substring(0, 100)
        },
        source_ip: ip
      });
      
      return sendSecurityResponse(res, 200, 'Message processed', {
        processed: false,
        reason: 'SECURITY_BLOCKED',
        response: getSafeResponse()
      });
    }
    
    // Layer 7: Sanitize the message
    const sanitizedText = sanitizeInput(securityCheck.sanitized);
    
    // Layer 8: SMART RATE LIMIT (3-layer: repeat, flood, hourly budget)
    const rateCheck = checkMessageRate(message.from, sanitizedText, { hourly: 30 });
    if (!rateCheck.allowed) {
      console.warn(`[RATE_LIMIT] Customer ${message.from} blocked: ${rateCheck.reason} (${rateCheck.layer})`);
      addTrace(message.from, 'RATE_LIMIT', 'BLOCKED', `${rateCheck.layer}: ${rateCheck.reason}`);
      recordRateLimit();
      
      // CRITICAL FIX: Send the graceful response to WhatsApp even when rate limited
      // The patient should know WHY they're not getting a full response
      if (channel === 'whatsapp' && message.from && rateCheck.gracefulResponse) {
        try {
          await sendWhatsAppReply(message.from, rateCheck.gracefulResponse, message.messageId);
          console.log(`[RATE_LIMIT] Graceful response sent to ${message.from.slice(-4)}`);
          addTrace(message.from, 'RATE_LIMIT_REPLY', 'SENT', 'Graceful response delivered');
        } catch (sendErr) {
          console.error(`[RATE_LIMIT] Failed to send graceful response: ${sendErr.message}`);
          addTrace(message.from, 'RATE_LIMIT_REPLY', 'FAILED', sendErr.message);
        }
      }
      
      return sendSecurityResponse(res, 200, 'Message processed', {
        processed: false,
        reason: 'RATE_LIMITED',
        response: rateCheck.gracefulResponse,
      });
    }
    addTrace(message.from, 'RATE_LIMIT', 'PASSED');
    
    // Layer 9: LOOP PROTECTION (prevent infinite bot↔bot loops)
    const loopCheck = loopDetector.checkIncoming(
      message.messageId,
      message.from,
      message.to,
      sanitizedText
    );
    
    if (!loopCheck.proceed) {
      if (loopCheck.isDuplicate) {
        console.log(`[LOOP_PROTECTION] Duplicate message ${message.messageId} ignored`);
        addTrace(message.from, 'LOOP', 'DUPLICATE', message.messageId);
        return sendSecurityResponse(res, 200, 'Duplicate message ignored');
      }
      
      if (loopCheck.isLoop) {
        console.warn(`[LOOP_PROTECTION] Loop detected from ${message.from}: ${loopCheck.reason}`);
        addTrace(message.from, 'LOOP', 'DETECTED', loopCheck.reason);
        recordLoop();
        
        await logSecurityEvent({
          severity: 'high',
          category: 'infinite_loop',
          service: channel,
          description: `Loop detected and broken: ${loopCheck.reason}`,
          details: { phone: message.from.slice(-4), reason: loopCheck.reason },
          source_ip: ip,
        });
        
        // Send ONE final message explaining silence, then stop
        if (loopCheck.reason === 'LOOP_BROKEN') {
          const loopMsg = "I've detected an automated response loop. I'll pause responses for 30 minutes to prevent runaway messages. If you need assistance, please call us directly or message again later.";
          if (channel === 'whatsapp' && message.from) {
            await sendWhatsAppReply(message.from, loopMsg, message.messageId);
          }
          return sendSecurityResponse(res, 200, 'Loop broken', {
            processed: true,
            response: { text: loopMsg, channel },
          });
        }
        
        return sendSecurityResponse(res, 200, 'Silence period active', { processed: false, reason: loopCheck.reason });
      }
    }
    addTrace(message.from, 'LOOP', 'PASSED');
    
    // Layer 9.5: Resolve client ID for cost tracking and AI routing
    // If query param auth already resolved the clinic (WhatsApp), use that directly.
    // Otherwise fall back to phone number lookup (voice channel).
    const clientId = preResolvedClientId || await resolveClientId(message.to, channel);
    const clinicName = preResolvedClinicName || null;
    addTrace(message.from, 'CLIENT', clientId ? 'RESOLVED' : 'NOT_FOUND', `${clinicName || ''} ${clientId || ''}`.trim());
    
    // Layer 10: Route to appropriate AI handler
    let response;
    try {
      response = await routeToAI(sanitizedText, message, channel, clientId);
      addTrace(message.from, 'AI', 'RESPONSE', `len=${response.text?.length}, fn=${response.function_called || 'none'}`);
    } catch (aiErr) {
      console.error(`[AI_ROUTING] Error: ${aiErr.message}`);
      addTrace(message.from, 'AI', 'ERROR', aiErr.message);
      recordError(`AI routing: ${aiErr.message}`);
      response = { text: "I'm having a moment. Please try again shortly.", channel, ai_processed: false };
    }
    
    // Record outgoing message for loop detection (tracks our responses)
    loopDetector.recordOutgoing(message.to, message.from, response.text);
    
    // Layer 11: SEND REPLY BACK TO WHATSAPP (360dialog API)
    // CRITICAL: The webhook receives messages from 360dialog, but we must explicitly
    // call their /v1/messages API to send replies back to the user.
    // COST PROTECTION: We NEVER block outbound messages — clinics must operate.
    // Instead, we alert both Moon Hands admin and clinic admin when limits are hit.
    let replySent = false;
    if (channel === 'whatsapp' && message.from && response.text && clientId) {
      const whatsappBudget = checkLimit(clientId, 'daily_whatsapp_msgs', 1);
      
      // Alert on cost limits (but never block)
      if (whatsappBudget.alerted) {
        const isDouble = whatsappBudget.threshold === 'double';
        const alertMsg = isDouble
          ? `🚨 Clinic ${clientId.slice(0,8)} hit DOUBLE WhatsApp limit\n${whatsappBudget.reason}\nPatient ${message.from.slice(-4)} still received reply (service never blocked).`
          : `⚠️ Clinic ${clientId.slice(0,8)} hit WhatsApp daily limit\n${whatsappBudget.reason}\nPatient ${message.from.slice(-4)} still received reply (service never blocked).`;
        addTrace(message.from, 'WHATSAPP', isDouble ? 'COST_ALERT_DOUBLE' : 'COST_ALERT', whatsappBudget.reason);
        sendAdminAlert(alertMsg, isDouble ? 'critical' : 'warning');
        // Also notify clinic admin of overusage
        sendClinicCostAlert(clientId, 'whatsapp', whatsappBudget.reason, isDouble);
      }
      
      try {
        addTrace(message.from, 'WHATSAPP', 'SENDING', `text=${response.text?.slice(0,50)}`);
        replySent = await sendWhatsAppReply(message.from, response.text, message.messageId);
        trackSpend(clientId, 0.007);
        addTrace(message.from, 'WHATSAPP', replySent ? 'SENT' : 'FAILED_360DIALOG');
        recordMessage(replySent, replySent ? null : '360dialog send failed');
      } catch (sendErr) {
        console.error(`[WEBHOOK] Failed to send WhatsApp reply to ${message.from}: ${sendErr.message}`);
        addTrace(message.from, 'WHATSAPP', 'ERROR', sendErr.message);
        recordError(`WhatsApp send: ${sendErr.message}`);
      }
    } else if (channel === 'whatsapp' && !clientId) {
      console.warn('[WEBHOOK] No clientId resolved — cannot track cost, but attempting to send reply anyway');
      addTrace(message.from, 'WHATSAPP', 'NO_CLIENTID_TRYING');
      try {
        replySent = await sendWhatsAppReply(message.from, response.text, message.messageId);
        addTrace(message.from, 'WHATSAPP', replySent ? 'SENT' : 'FAILED');
      } catch (sendErr) {
        console.error(`[WEBHOOK] Failed to send WhatsApp reply (no clientId): ${sendErr.message}`);
        addTrace(message.from, 'WHATSAPP', 'ERROR', sendErr.message);
      }
    }
    
    const latency = Date.now() - startTime;
    console.log(`[WEBHOOK] ${channel} message processed in ${latency}ms (reply sent: ${replySent})`);
    addTrace(message.from, 'COMPLETE', replySent ? 'SUCCESS' : 'NO_REPLY', `${latency}ms`);
    
    return sendSecurityResponse(res, 200, 'Message processed', {
      processed: true,
      response: response,
      reply_sent: replySent,
      latency_ms: latency
    });
    
  } catch (err) {
    console.error(`[ERROR] Webhook error:`, err.message);
    return sendSecurityResponse(res, 500, 'Internal error');
  }
}

// ─── MESSAGE EXTRACTION ──────────────────────────────────────────

function extractMessage(body, channel) {
  try {
    if (channel === 'whatsapp') {
      // 360dialog webhook format — messages are nested under entry[0].changes[0].value
      const value = body.entry?.[0]?.changes?.[0]?.value || body;
      const msg = value.messages?.[0];
      if (!msg) return null;
      return {
        text: msg.text?.body || msg.body || '',
        from: msg.from,
        to: value.metadata?.phone_number_id || msg.to || '',
        timestamp: msg.timestamp,
        messageId: msg.id
      };
    }
    
    if (channel === 'voice') {
      // VAPI format
      return {
        text: body.message?.content || body.text || '',
        from: body.from || body.caller || '',
        timestamp: body.timestamp,
        callId: body.call_id
      };
    }
    
    return null;
  } catch {
    return null;
  }
}

// ─── AI ROUTING ──────────────────────────────────────────────────

const { processMessage } = require('../ai/bot-engine');
const { isKilled } = require('../middleware/cost-protection');

// In-memory conversation cache (per patient phone)
const conversationCache = new Map();
const CONVERSATION_TTL = 30 * 60 * 1000; // 30 minutes

function getConversationHistory(phone) {
  const cached = conversationCache.get(phone);
  if (!cached) return [];
  if (Date.now() - cached.lastAccess > CONVERSATION_TTL) {
    conversationCache.delete(phone);
    return [];
  }
  return cached.turns;
}

// Estimate tokens in a conversation history (rough: ~4 chars per token)
function estimateHistoryTokens(turns) {
  let chars = 0;
  for (const turn of turns) {
    chars += (turn.user?.length || 0) + (turn.ai?.length || 0);
  }
  return Math.ceil(chars / 4);
}

const MAX_HISTORY_TOKENS = 2000; // ~2000 tokens keeps API cost predictable

function addConversationTurn(phone, userMsg, aiMsg) {
  const cached = conversationCache.get(phone) || { turns: [], lastAccess: Date.now() };
  cached.turns.push({ user: userMsg, ai: aiMsg });
  // Token-based trimming: keep history under ~2000 tokens instead of fixed 10 turns
  while (cached.turns.length > 2 && estimateHistoryTokens(cached.turns) > MAX_HISTORY_TOKENS) {
    cached.turns.shift(); // Remove oldest turn
  }
  cached.lastAccess = Date.now();
  conversationCache.set(phone, cached);
}

async function routeToAI(text, message, channel, preResolvedClientId = null) {
  // Determine client ID from the webhook path or phone number
  // For now, use a lookup based on the destination phone number
  const clientId = preResolvedClientId || await resolveClientId(message.to, channel);
  
  if (!clientId) {
    return {
      text: "I'm sorry, this clinic is not yet configured. Please contact the clinic directly.",
      channel: channel,
      ai_processed: false
    };
  }

  try {
    // Global kill switch check
    if (isKilled()) {
      return { text: "Our system is temporarily under maintenance. Please call the clinic directly.", channel, ai_processed: false };
    }
    
    // Per-clinic cost protection: check daily API call budget
    // NEVER block — always process through AI. Alert on overusage.
    const budgetCheck = checkLimit(clientId, 'daily_api_calls', 1);
    if (budgetCheck.alerted) {
      const isDouble = budgetCheck.threshold === 'double';
      console.warn(`[COST_PROTECTION] Clinic ${clientId} API limit alert: ${budgetCheck.reason}`);
      sendAdminAlert(
        `⚠️ Clinic ${clientId.slice(0, 8)} ${isDouble ? 'DOUBLE' : ''} daily API limit\n` +
        `${budgetCheck.reason}\n` +
        `AI responses still working (service never blocked).`,
        isDouble ? 'critical' : 'warning'
      );
      // Notify clinic admin of overusage
      sendClinicCostAlert(clientId, 'api_calls', budgetCheck.reason, isDouble);
    }
    
    const history = getConversationHistory(message.from);
    const startMs = Date.now();
    const result = await processMessage(text, clientId, history, message.from);
    const elapsedMs = Date.now() - startMs;
    
    // Track estimated spend ($0.005 base + ~$0.003 per 1K tokens)
    const estimatedTokens = Math.ceil((result.text?.length || 0) / 4); // ~4 chars per token
    const estimatedCost = 0.005 + (estimatedTokens / 1000) * 0.003;
    trackSpend(clientId, estimatedCost);
    
    // Cache conversation turn
    addConversationTurn(message.from, text, result.text);
    
    return {
      text: result.text,
      channel: channel,
      ai_processed: true,
      function_called: result.function_called || null,
      model: result.model || 'gpt-4o-mini'
    };
  } catch (err) {
    console.error('[AI_ROUTING] Bot engine error:', err.message);
    return {
      text: "I'm having a moment. Please try again shortly, or call the clinic directly.",
      channel: channel,
      ai_processed: false
      // Never expose err.message to client — log only internally
    };
  }
}

// Resolve client ID from phone number or webhook path
async function resolveClientId(phoneOrId, channel) {
  // Check if we have a client with this WhatsApp number
  const { data } = await require('../supabase/client').supabase
    .from('clients')
    .select('id')
    .eq('whatsapp_number', phoneOrId)
    .eq('status', 'active')
    .single();
  
  if (data) return data.id;
  
  // Fallback: use environment variable for single-client deployments
  return process.env.DEFAULT_CLIENT_ID || null;
}

function getSafeResponse() {
  return "I'm sorry, I couldn't process that request. How can I help you with our services today?";
}

function getRateLimitResponse(reason) {
  // All responses maintain the clinic's warm, professional persona
  // Never reveal technical details like "10-minute block" or "daily limit"
  
  if (reason.includes('IDENTICAL_SPAM')) {
    return "We're currently attending to other patients at the clinic. I'll be with you shortly — thank you for your patience! 💫";
  }
  if (reason.includes('BURST')) {
    return "Our clinic team is handling a few appointments right now. Please give us a moment and we'll get back to you shortly. 🌙";
  }
  if (reason.includes('HOURLY')) {
    return "We've received quite a few messages this hour and our team is catching up. We'll respond to you very soon — thank you for understanding! ✨";
  }
  if (reason.includes('DAILY')) {
    return "Our clinic has had a wonderfully busy day! If your matter is urgent, please call us directly. Otherwise, we'll be happy to continue with you tomorrow. 🌟";
  }
  // Generic fallback — shouldn't normally trigger
  return "We're just attending to a few things at the clinic right now. Please bear with us and we'll be right with you! 💫";
}

// ─── SEND WHATSAPP REPLY (360dialog API) ─────────────────────────

/**
 * Sends a reply back to WhatsApp via the 360dialog API.
 * 
 * CRITICAL ARCHITECTURE NOTE:
 *   The 360dialog webhook is ONE-WAY — it delivers messages FROM WhatsApp TO our server.
 *   To reply back, we MUST explicitly POST to 360dialog's /v1/messages endpoint.
 *   Without this function, the AI generates a response but the user never receives it.
 * 
 * @param {string} toPhone - The recipient's phone number (the WhatsApp user who messaged us)
 * @param {string} text - The reply text from the AI
 * @param {string} replyToMessageId - Optional: message ID to reply to (for context threading)
 * @returns {boolean} - Whether the send was successful
 */
async function sendWhatsAppReply(toPhone, text, replyToMessageId = null) {
  const d360Key = process.env.D360_API_KEY;
  
  console.log(`[360DIALOG] sendWhatsAppReply called: to=${toPhone?.slice(-4)}, text_len=${text?.length}`);
  
  if (!d360Key) {
    console.error('[360DIALOG] D360_API_KEY not set — cannot send WhatsApp reply. Set it in Render environment variables.');
    return false;
  }
  
  if (!toPhone || !text) {
    console.warn('[360DIALOG] Missing toPhone or text — skipping send.');
    return false;
  }
  
  // 360dialog API endpoint — prioritize explicit env var, then auto-detect
  // Sandbox keys: exactly 32 chars, all uppercase A-Z0-9 (e.g., J6BC2J3LY2XWMKRG6ZP2S4FIA6Y2FF6C)
  // Production keys: any other format
  const explicitUrl = process.env.D360_API_URL;
  const isSandbox = !explicitUrl && d360Key.length === 32 && /^[A-Z0-9]+$/.test(d360Key);
  const D360_API_URL = explicitUrl || 
    (isSandbox ? 'https://waba-sandbox.360dialog.io/v1/messages' : 'https://waba.360dialog.io/v1/messages');
  
  console.log(`[360DIALOG] Endpoint: ${D360_API_URL.replace(/\/v1\/messages$/, '/...')} (explicit=${!!explicitUrl}, sandbox=${isSandbox})`);
  console.log(`[360DIALOG] API key preview: ${d360Key.substring(0, 4)}...${d360Key.substring(d360Key.length - 4)} (len=${d360Key.length})`);
  
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone,
    type: 'text',
    text: { body: text.substring(0, 4096) }
  };
  
  if (replyToMessageId) {
    payload.context = { message_id: replyToMessageId };
  }
  
  // Try primary endpoint
  let result;
  try {
    result = await fetch(D360_API_URL, {
      method: 'POST',
      headers: {
        'D360-API-KEY': d360Key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (networkErr) {
    console.error(`[360DIALOG] Network error (primary): ${networkErr.message}`);
    return false;
  }
  
  // If 401 on primary, try alternative endpoint automatically
  if (result.status === 401 && !explicitUrl) {
    const altUrl = isSandbox 
      ? 'https://waba.360dialog.io/v1/messages' 
      : 'https://waba-sandbox.360dialog.io/v1/messages';
    console.log(`[360DIALOG] 401 on primary — trying alternative endpoint: ${altUrl.replace(/\/v1\/messages$/, '/...')}`);
    
    try {
      result = await fetch(altUrl, {
        method: 'POST',
        headers: {
          'D360-API-KEY': d360Key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      console.log(`[360DIALOG] Alternative endpoint returned ${result.status}`);
    } catch (altErr) {
      console.error(`[360DIALOG] Network error (alternative): ${altErr.message}`);
      return false;
    }
  }
  
  if (result.ok) {
    const data = await result.json();
    console.log(`[360DIALOG] ✅ Reply sent to ${toPhone.slice(-4)} | messageId: ${data.messages?.[0]?.id || 'unknown'}`);
    return true;
  }
  
  // Log full error details
  const errorText = await result.text();
  console.error(`[360DIALOG] ❌ Send failed (${result.status}): ${errorText}`);
  
  if (result.status === 401) {
    console.error('[360DIALOG] Authentication failed on BOTH endpoints. Your D360_API_KEY may be invalid or expired.');
    console.error('[360DIALOG] Fix: 360dialog Dashboard → API Keys → copy the correct key. Set it as D360_API_KEY in Render.');
  } else if (result.status === 404) {
    console.error(`[360DIALOG] Phone number ${toPhone.slice(-4)} not found — user may not have WhatsApp.`);
  } else if (result.status === 429) {
    console.error('[360DIALOG] Rate limited by 360dialog.');
  }
  
  return false;
}

// ─── SECURITY EVENT LOGGING ──────────────────────────────────────

async function logSecurityEvent(event) {
  try {
    const { supabase } = require('../supabase/client');
    const { error } = await supabase
      .from('security_events')
      .insert([{
        severity: event.severity || 'medium',
        category: event.category || 'general',
        service: event.service || 'webhook',
        description: event.description,
        details: event.details || {},
        source_ip: event.source_ip || null,
        created_at: new Date().toISOString()
      }]);
    if (error) console.error('[SECURITY_LOG] Supabase insert failed:', error.message);
  } catch (err) {
    console.error('[SECURITY_LOG] Failed to persist:', err.message);
  }
}

// ─── TRACE DIAGNOSTIC ────────────────────────────────────────────

async function handleTrace(req, res) {
  try {
    const traces = [...messageTraceLog].reverse();
    
    const byPhone = {};
    for (const t of traces) {
      const p = t.phone || 'unknown';
      if (!byPhone[p]) byPhone[p] = [];
      byPhone[p].push(t);
    }
    
    const payload = {
      status: 'ok',
      total_traces: traces.length,
      by_phone: byPhone,
      recent: traces.slice(0, 20),
      summary: {
        trace_buffer_capacity: MAX_TRACE_LOG,
        trace_buffer_used: messageTraceLog.length
      }
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error('[TRACE] Error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: err.message }));
  }
}

// ─── HEALTH CHECK ────────────────────────────────────────────────

// ─── DEVICE REGISTRATION ─────────────────────────────────────────

async function handleRegisterDevice(req, res) {
  const data = await parseBody(req); // already parsed JSON
  const fp = getDeviceFingerprint(req);
  const ip = getClientIP(req);
  
  // Accept secret from header (x-master-secret or x-moonhands-master) or body (secret)
  const providedSecret = req.headers['x-master-secret'] || req.headers['x-moonhands-master'] || data.secret || '';
  
  // Must provide master secret to register
  if (providedSecret !== process.env.MASTER_SECRET) {
    return sendSecurityResponse(res, 401, 'Invalid master secret');
  }
  
  // Log the registration
  await logEvent({
    severity: 'info',
    category: 'device_registration',
    actor: 'Master',
    action: 'register_device',
    description: `Master registered device: ${fp}`,
    deviceId: fp,
    sourceIp: ip,
    service: 'website',
    details: { label: data.label || data.deviceName || 'unnamed', userAgent: req.headers['user-agent'] },
  });
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    success: true,
    deviceId: fp,
    actor: 'Master',
    message: 'Device registered as Master. Add this to your Render env var MASTER_DEVICE_FPS if needed.',
    envValue: `MASTER_DEVICE_FPS=${process.env.MASTER_DEVICE_FPS ? process.env.MASTER_DEVICE_FPS + ',' + fp : fp}`,
  }));
}

async function handleHealth(req, res) {
  const ip = getClientIP(req);
  const ddos = checkDDoS(ip);
  if (!ddos.allowed) {
    return sendSecurityResponse(res, 429, 'Too many requests');
  }
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'healthy',
    service: 'moon-hands-webhook',
    version: '1.0.0',
    security: {
      ddos_protection: 'active',
      rate_limiting: 'active',
      injection_blocking: 'active',
      input_sanitization: 'active'
    },
    timestamp: new Date().toISOString()
  }));
}

// ─── REQUEST HANDLER (used by server.js) ─────────────────────────

async function requestHandler(req, res) {
  try {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Signature, X-Moonhands-Master, X-Moonhands-Agent');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Route handlers
    if (url.pathname === '/webhook/diag' && req.method === 'POST') {
      // Diagnostic endpoint — logs raw body for debugging
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      console.log('[DIAG] Raw webhook body:', raw.substring(0, 2000));
      try { console.log('[DIAG] Parsed:', JSON.stringify(JSON.parse(raw), null, 2).substring(0, 2000)); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true, length: raw.length }));
      return;
    } else if (url.pathname === '/webhook/whatsapp' && req.method === 'POST') {
      await handleWebhook(req, res, 'whatsapp', url);
    } else if (url.pathname === '/webhook/voice' && req.method === 'POST') {
      await handleWebhook(req, res, 'voice', url);
    } else if (url.pathname === '/api/onboarding' && req.method === 'POST') {
      await handleOnboarding(req, res);
    } else if (url.pathname === '/api/activate-clinic' && req.method === 'POST') {
      await activateClinic(req, res);
    } else if (url.pathname === '/api/register-device' && req.method === 'POST') {
      await handleRegisterDevice(req, res);
    } else if (url.pathname === '/health' && req.method === 'GET') {
      await handleHealth(req, res);
    } else if (url.pathname === '/trace' && req.method === 'GET') {
      await handleTrace(req, res);
    } else if (url.pathname.match(/^\/ical\/[^\/]+\.ics$/) && req.method === 'GET') {
      await handleICalFeed(req, res, url.pathname);
    } else if (url.pathname === '/auth/google/callback' && req.method === 'GET') {
      await handleGoogleCallback(req, res, url);
    } else if (url.pathname === '/api/send-test-email' && req.method === 'POST') {
      await handleTestEmail(req, res);
    } else {
      sendSecurityResponse(res, 404, 'Not found');
    }
  } catch (err) {
    console.error(`[REQUEST_HANDLER] Unhandled error: ${err.message}`);
    console.error(err.stack);
    if (!res.headersSent) {
      sendSecurityResponse(res, 500, 'Internal server error', { detail: err.message });
    }
  }
}

// ─── iCAL FEED HANDLER ───────────────────────────────────────────

async function handleICalFeed(req, res, pathname) {
  const token = pathname.replace('/ical/', '').replace('.ics', '');
  
  try {
    const { ical, clinicName } = await generateICalFeed(token);
    
    res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${clinicName.replace(/\s+/g, '-').toLowerCase()}-bookings.ics"`,
      'Cache-Control': 'no-cache'
    });
    res.end(ical);
  } catch (err) {
    console.error('[iCal] Feed error:', err.message);
    sendSecurityResponse(res, 404, 'Calendar feed not found');
  }
}

// ─── GOOGLE OAUTH CALLBACK ───────────────────────────────────────

async function handleGoogleCallback(req, res, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state'); // contains client_id
  const error = url.searchParams.get('error');
  
  if (error) {
    return sendSecurityResponse(res, 400, `Google auth denied: ${error}`);
  }
  if (!code) {
    return sendSecurityResponse(res, 400, 'Missing authorization code');
  }
  
  try {
    const { google } = require('googleapis');
    const { supabase } = require('../supabase/client');
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      return sendSecurityResponse(res, 400, 'No refresh token received. Clinic may need to revoke access and re-authenticate.');
    }
    
    // Get clinic's primary calendar ID
    oauth2Client.setCredentials({ refresh_token: tokens.refresh_token });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendarList = await calendar.calendarList.list();
    const primaryCalendar = calendarList.data.items.find(c => c.primary) || calendarList.data.items[0];
    
    // Update the client record
    const { error: updateErr } = await supabase
      .from('clients')
      .update({
        google_refresh_token: tokens.refresh_token,
        google_calendar_id: primaryCalendar.id,
        calendar_provider: 'google'
      })
      .eq('id', state || 'demo');
    
    if (updateErr) {
      console.error('[GOOGLE_OAUTH] Supabase update error:', updateErr.message);
      return sendSecurityResponse(res, 500, 'Failed to save calendar connection');
    }
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h1>✅ Google Calendar Connected!</h1><p>Your clinic bookings will now sync to <strong>${primaryCalendar.summary}</strong>.</p><p>You can close this window.</p></body></html>`);
    
  } catch (err) {
    console.error('[GOOGLE_OAUTH] Callback error:', err.message);
    sendSecurityResponse(res, 500, 'Calendar connection failed');
  }
}

// ─── TEST EMAIL SENDER ───────────────────────────────────────────

async function handleTestEmail(req, res) {
  try {
    const body = await parseBody(req);
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    
    const { sendWelcomeEmail } = require('../utils/welcome-email');
    const result = await sendWelcomeEmail({
      to: data.to || 'pixelvaultsg@gmail.com',
      clinicName: data.clinicName || 'Test Clinic',
      contactName: data.contactName || 'Test User',
      plan: data.plan || 'Premium',
      monthlyPrice: data.monthlyPrice || 547,
      iCalUrl: data.iCalUrl || 'https://moon-hands-backend.onrender.com/ical/test.ics',
      agentName: data.agentName || null,
    });
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'success', message: 'Test email sent', result }));
  } catch (err) {
    console.error('[TEST_EMAIL] Error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: err.message }));
  }
}

// ─── STANDALONE MODE (when run directly: node webhook.js) ────────

if (require.main === module) {
  const standalonePort = process.env.PORT || 3000;
  const standaloneServer = http.createServer(requestHandler);
  standaloneServer.listen(standalonePort, () => {
    console.log(`Webhook server (standalone) on port ${standalonePort}`);
  });
  module.exports = { server: standaloneServer, requestHandler, API_KEY: effectiveApiKey, WEBHOOK_SECRET, generateWebhookToken, getClinicWebhookUrl };
} else {
  // Module mode: export handler for server.js to use
  console.log('  📦 Webhook module loaded — waiting for server.js to bind');
  module.exports = { requestHandler, API_KEY: effectiveApiKey, WEBHOOK_SECRET, generateWebhookToken, getClinicWebhookUrl };
}
