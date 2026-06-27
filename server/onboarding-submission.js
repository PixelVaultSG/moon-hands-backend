/**
 * Moon Hands — Secure Onboarding Submission Handler
 * 
 * Receives clinic onboarding data from the website form, validates it,
 * stores in Supabase, and sends Telegram notification to admin.
 * 
 * Security measures:
 * - Rate limiting (1 submission per 60s per IP)
 * - Input validation and sanitization
 * - No sensitive data in logs
 * - Supabase RLS enabled (service-role only access)
 * - Telegram notifications (no email to avoid spam filters)
 */

const { supabase } = require('../supabase/client');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const ONBOARDING_API_KEY = process.env.ONBOARDING_API_KEY || process.env.WEBHOOK_SECRET;

// Security: API key MUST be configured for onboarding endpoint
if (!ONBOARDING_API_KEY) {
  console.error('[ONBOARDING] CRITICAL: ONBOARDING_API_KEY or WEBHOOK_SECRET must be set in environment');
  console.error('[ONBOARDING] The onboarding endpoint will reject all requests until configured');
}

// Rate limiter: simple in-memory map (resets on server restart)
const rateLimiter = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 seconds
const MAX_REQUESTS_PER_WINDOW = 1;

// ─── VALIDATION ──────────────────────────────────────────────────

const REQUIRED_FIELDS = [
  'clinicName', 'clinicEmail', 'whatsapp', 'address', 'contactName'
];

const FIELD_VALIDATORS = {
  clinicName: (v) => v.length >= 2 && v.length <= 100,
  clinicEmail: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  whatsapp: (v) => /^\+?[\d\s-]{8,20}$/.test(v),
  contactName: (v) => v.length >= 2 && v.length <= 100,
  selectedPlan: (v) => ['basic', 'premium'].includes(v),
};

function sanitize(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/[<>]/g, '') // Remove HTML tags
    .trim()
    .substring(0, 2000); // Max length
}

function sanitizeEmail(str) {
  if (!str) return '';
  return str.toLowerCase().trim().replace(/[<>]/g, '');
}

// ─── RATE LIMITING ───────────────────────────────────────────────

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimiter.get(ip);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimiter.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  record.count++;
  return false;
}

// ─── TELEGRAM NOTIFICATION ───────────────────────────────────────

async function sendTelegramNotification(data) {
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.error('[ONBOARDING] Telegram not configured');
    return;
  }

  const planLabel = data.selectedPlan === 'premium' ? 'Premium (S$547/mo)' : 'Basic (S$347/mo)';
  const treatmentCount = data.treatments?.length || 0;

  const message = [
    '🏥 *NEW CLINIC ONBOARDING*',
    '',
    `*${escapeMarkdown(data.clinicName || 'Unknown')}*`,
    `📧 ${escapeMarkdown(data.clinicEmail || '—')}`,
    `📱 ${escapeMarkdown(data.whatsapp || '—')}`,
    `👤 ${escapeMarkdown(data.contactName || '—')} (${escapeMarkdown(data.contactRole || '—')})`,
    `💎 ${planLabel}`,
    `💉 ${treatmentCount} treatments`,
    '',
    `Review: https://supabase.com/dashboard/project/_/editor` // Deep link to Supabase
  ].join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
    console.log('[ONBOARDING] Telegram notification sent');
  } catch (err) {
    console.error('[ONBOARDING] Telegram failed:', err.message);
  }
}

function escapeMarkdown(text) {
  return text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
}

// ─── SUPABASE STORAGE ────────────────────────────────────────────

async function storeInSupabase(data) {
  const record = {
    clinic_name: data.clinicName,
    clinic_email: data.clinicEmail,
    clinic_phone: data.clinicPhone || data.whatsapp,
    clinic_address: data.address,
    clinic_postal_code: data.postalCode,
    business_registration_number: data.businessRegNo,
    contact_name: data.contactName,
    contact_role: data.contactRole,
    selected_plan: data.selectedPlan === 'premium' ? 'premium' : 'basic',
    whatsapp_number: data.whatsapp,
    languages: data.languages || ['en'],
    treatment_menu: JSON.stringify(data.treatments || []),
    operating_hours: JSON.stringify(data.hours || []),
    appointment_duration_minutes: parseInt(data.slotDuration) || 30,
    buffer_between_appointments_minutes: parseInt(data.bufferMinutes) || 15,
    max_appointments_per_day: parseInt(data.maxAppts) || 12,
    cancellation_policy: data.cancelPolicy,
    preferred_agent_name: data.agentName,
    preferred_tone: data.tone,
    preferred_greeting: data.greeting,
    special_notes: data.specialNotes,
    booking_auto_confirm: data.autoConfirm,
    booking_after_hours_action: data.afterHours,
    booking_waitlist_enabled: data.waitlist,
    booking_max_advance_days: parseInt(data.maxAdvance) || 30,
    booking_min_notice_hours: parseInt(data.minNotice) || 2,
    booking_require_phone: data.requirePhone,
    booking_allow_same_day: data.sameDay,
    booking_reminder_24h: data.rem24h,
    booking_reminder_1h: data.rem1h,
    booking_followup_48h: data.follow48h,
    faqs: JSON.stringify(data.faqs || []),
    status: 'pending',
  };

  // Remove undefined/null values
  Object.keys(record).forEach(key => {
    if (record[key] === undefined || record[key] === null) {
      delete record[key];
    }
  });

  const { data: inserted, error } = await supabase
    .from('onboarding_submissions')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('[ONBOARDING] Supabase insert failed:', error.message);
    throw new Error('Database storage failed');
  }

  return inserted;
}

// ─── REQUEST HANDLER ─────────────────────────────────────────────

async function handleOnboardingSubmission(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Only handle POST to /api/onboarding
  if (url.pathname !== '/api/onboarding' || req.method !== 'POST') {
    return false; // Not our route, let other handlers process
  }

  console.log(`[ONBOARDING] ${req.method} ${url.pathname} from ${req.headers['x-forwarded-for'] || 'unknown'}`);

  try {
    // 1. API Key validation (MANDATORY — no key = reject all)
    const apiKey = req.headers['x-api-key'];
    if (!ONBOARDING_API_KEY || apiKey !== ONBOARDING_API_KEY) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Unauthorized — valid x-api-key required' }));
      console.warn(`[ONBOARDING] Rejected request from ${clientIp} — missing/invalid API key`);
      return true;
    }

    // 2. Rate limiting by IP
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.connection?.remoteAddress || 'unknown';
    if (isRateLimited(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Too many submissions. Please wait 60 seconds.' }));
      return true;
    }

    // 3. Read request body
    const body = await readBody(req);
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
      return true;
    }

    // 4. Validate required fields
    const missing = REQUIRED_FIELDS.filter(f => !data[f] || !String(data[f]).trim());
    if (missing.length > 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: `Missing required fields: ${missing.join(', ')}` }));
      return true;
    }

    // 5. Validate field formats
    for (const [field, validator] of Object.entries(FIELD_VALIDATORS)) {
      if (data[field] && !validator(data[field])) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Invalid format for: ${field}` }));
        return true;
      }
    }

    // 6. Sanitize all text inputs
    data.clinicName = sanitize(data.clinicName);
    data.clinicEmail = sanitizeEmail(data.clinicEmail);
    data.whatsapp = sanitize(data.whatsapp);
    data.clinicPhone = sanitize(data.clinicPhone || '');
    data.address = sanitize(data.address);
    data.postalCode = sanitize(data.postalCode || '');
    data.businessRegNo = sanitize(data.businessRegNo || '');
    data.contactName = sanitize(data.contactName);
    data.contactRole = sanitize(data.contactRole || '');
    data.agentName = sanitize(data.agentName || 'Sophia');
    data.greeting = sanitize(data.greeting || '');
    data.specialNotes = sanitize(data.specialNotes || '');
    data.cancelPolicy = sanitize(data.cancelPolicy || '');
    data.selectedPlan = data.selectedPlan === 'premium' ? 'premium' : 'basic';

    // 7. Store in Supabase
    const stored = await storeInSupabase(data);

    // 8. Send Telegram notification
    await sendTelegramNotification(data);

    // 9. Return success
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Onboarding submission received',
      submissionId: stored.id,
    }));

    console.log(`[ONBOARDING] Stored submission ${stored.id} for ${data.clinicName}`);
    return true;

  } catch (err) {
    console.error('[ONBOARDING] Handler error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
    return true;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    const MAX_BODY_SIZE = 100 * 1024; // 100KB max — prevents DoS via huge payloads
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

module.exports = { handleOnboardingSubmission };
