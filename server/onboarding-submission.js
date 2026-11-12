/**
 * Moon Hands — Secure Onboarding Submission Handler
 * 
 * Receives clinic onboarding data from the website form, validates it,
 * stores in Supabase, and sends Telegram notification to admin.
 * 
 * Security measures (v2.4.2 — public form model):
 * - Rate limiting (5 submissions per 60s per IP)
 * - Honeypot field (invisible "website" input — bots fill it, humans don't; filled = silent drop)
 * - Freshness timestamp (_t) — rejects stale (>24h) or clock-skewed replays
 * - Input validation and sanitization
 * - No sensitive data in logs
 * - Supabase RLS enabled (service-role only access)
 * - Telegram notifications (no email to avoid spam filters)
 *
 * NOTE: the old mandatory x-api-key check was removed in v2.4.2 — the public
 * static form cannot hold a secret, and the key (living only in Render env)
 * 401'd EVERY real submission. Honeypot + rate limit + freshness replace it.
 */

const { supabase } = require('../supabase/client');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

// Freshness window for _t timestamp (client Date.now() at submit time)
const MAX_SUBMISSION_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000; // 5 min clock-skew allowance

// Rate limiter: simple in-memory map (resets on server restart)
const rateLimiter = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 seconds
const MAX_REQUESTS_PER_WINDOW = 5; // 5 submissions per minute per IP (production-friendly)

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
    // Remove null bytes and control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove event handler attributes (onclick, onerror, etc.)
    .replace(/\bon\w+\s*=\s*["']?[^"'>]*["']?/gi, '')
    // Remove javascript: protocol
    .replace(/javascript\s*:/gi, '')
    // Remove data: URI scheme
    .replace(/data\s*:[^;]*;base64/gi, '')
    // Escape HTML entities that could be used for XSS
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    // Restore safe ampersands for legitimate use
    .replace(/&amp;amp;/g, '&amp;')
    .trim()
    .substring(0, 2000); // Max length
}

function sanitizeEmail(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[<>]/g, '')
    .replace(/\bon\w+\s*=/gi, '')
    .replace(/javascript\s*:/gi, '')
    .substring(0, 320); // RFC 5321 max email length
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

async function sendTelegramNotification(data, submissionId = null) {
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.error('[ONBOARDING] Telegram not configured');
    return;
  }

  const planLabel = data.selectedPlan === 'premium' ? 'Premium (S$547/mo)' : 'Basic (S$347/mo)';
  const industryLabel = data.industry === 'chiropractic' ? '🦴 Chiropractic'
                      : data.industry === 'other' ? '🏥 Other'
                      : '✨ Aesthetic';
  const treatmentCount = data.treatments?.length || 0;
  // Calendar status from the onboarding form's Calendar step (alert-only, not stored in DB)
  const calendarLabel = data.calendarUse === 'yes'
    ? (data.calendarShared ? 'Yes — SA access shared ✅' : 'Yes — sharing NOT confirmed ⚠️')
    : data.calendarUse === 'no' ? 'No calendar (manual)'
    : data.calendarUse === 'not_sure' ? 'Not sure — needs help'
    : '—';

  const message = [
    '🏥 *NEW CLINIC ONBOARDING*',
    '',
    `*${escapeMarkdown(data.clinicName || 'Unknown')}*`,
    industryLabel,
    `📧 ${escapeMarkdown(data.clinicEmail || '—')}`,
    `📱 ${escapeMarkdown(data.whatsapp || '—')}`,
    `👤 ${escapeMarkdown(data.contactName || '—')} (${escapeMarkdown(data.contactRole || '—')})`,
    data.contactEmail ? `✉️ ${escapeMarkdown(data.contactEmail)}` : '',
    data.contactPhone ? `📞 ${escapeMarkdown(data.contactPhone)}` : '',
    `💎 ${planLabel}`,
    `💉 ${treatmentCount} treatments`,
    `📅 Calendar: ${calendarLabel}`,
    submissionId ? `\n🆔 Submission #\`${submissionId}\`` : '',
  // keep the one intentional blank separator (index 1); drop conditional empties
  ].filter((l, i) => l !== '' || i === 1).join('\n');

  const inlineKeyboard = submissionId ? {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `onboarding_approve:${submissionId}` },
        { text: '❌ Reject', callback_data: `onboarding_reject:${submissionId}` }
      ],
      [
        { text: '📋 View All Pending', callback_data: 'pendingonboarding' }
      ]
    ]
  } : undefined;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
        reply_markup: inlineKeyboard,
      }),
    });
    console.log('[ONBOARDING] Telegram notification sent');
  } catch (err) {
    console.error('[ONBOARDING] Telegram failed:', err.message);
  }
}

// v2.5.0: legacy parse_mode 'Markdown' only treats _ * ` [ as special —
// escaping the MarkdownV2 set (. - etc.) leaks literal backslashes (Ash's 'gmail\.com').
function escapeMarkdown(text) {
  return text.replace(/[_*`\[]/g, '\\$&');
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
    // v2.4.9: preserve a real 0 — "No minimum" (minNotice '0') must not
    // collapse to 2 hours (parseInt('0') || 2 === 2). Default only when
    // the field is absent/blank/unparseable.
    booking_max_advance_days: (data.maxAdvance === undefined || data.maxAdvance === null || data.maxAdvance === '' || isNaN(parseInt(data.maxAdvance))) ? 30 : parseInt(data.maxAdvance),
    booking_min_notice_hours: (data.minNotice === undefined || data.minNotice === null || data.minNotice === '' || isNaN(parseInt(data.minNotice))) ? 2 : parseInt(data.minNotice),
    booking_allow_same_day: data.sameDay,
    booking_reminder_24h: data.rem24h,
    booking_reminder_1h: data.rem1h,
    booking_followup_48h: data.follow48h,
    faqs: JSON.stringify(data.faqs || []),
    // v2.5.0: the calendar choice used to be alert-only and lost on approval
    // (Ash's test: card said "Yes — SA access shared" but DB stored false).
    has_google_calendar: data.calendarUse === 'yes',
    google_calendar_email: data.calendarEmail || undefined,
    // v2.5.0: owner direct contacts (optional). NB: the contact_email /
    // contact_phone columns are added by a manual migration — until it runs,
    // the insert below retries without these keys on a column error.
    contact_email: data.contactEmail || undefined,
    contact_phone: data.contactPhone || undefined,
    // Chiro expansion: whitelisted industry field (defaults to aesthetic)
    industry: data.industry === 'chiropractic' ? 'chiropractic' : 'aesthetic',
    status: 'pending',
  };

  // Remove undefined/null values
  Object.keys(record).forEach(key => {
    if (record[key] === undefined || record[key] === null) {
      delete record[key];
    }
  });

  let { data: inserted, error } = await supabase
    .from('onboarding_submissions')
    .insert(record)
    .select()
    .single();

  // v2.5.0 self-heal: if the contact_email/contact_phone migration hasn't run
  // yet, PostgREST rejects the unknown column — strip those keys and retry once
  // rather than losing the whole submission.
  if (error && /contact_email|contact_phone/.test(error.message || '')) {
    console.warn('[ONBOARDING] contact_email/contact_phone columns missing — retrying insert without them (run the v2.5.0 migration)');
    delete record.contact_email;
    delete record.contact_phone;
    ({ data: inserted, error } = await supabase
      .from('onboarding_submissions')
      .insert(record)
      .select()
      .single());
  }

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

  // Get client IP early for logging and rate limiting
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                   req.connection?.remoteAddress || 'unknown';

  try {
    // 1. Rate limiting by IP (5 per 60 seconds — production friendly)
    if (isRateLimited(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Too many submissions. Please wait 60 seconds.' }));
      return true;
    }

    // 2. Read request body
    const body = await readBody(req);
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
      return true;
    }

    // 3. Honeypot drop — invisible "website" field; only bots fill it.
    //    Respond 200 success so bots move on, but store NOTHING and send NO alert.
    if (data.website && String(data.website).trim()) {
      console.warn(`[ONBOARDING] Honeypot triggered from ${clientIp} — silently dropped`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Onboarding submission received' }));
      return true;
    }

    // 4. Freshness check — _t must be present, not stale (>24h), not future-skewed (>5min).
    //    The served form always sets _t at submit time; missing/stale = replay or bot.
    const submittedAt = Number(data._t);
    if (!Number.isFinite(submittedAt) ||
        (Date.now() - submittedAt) > MAX_SUBMISSION_AGE_MS ||
        (submittedAt - Date.now()) > MAX_FUTURE_SKEW_MS) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Form session expired — please refresh the page and submit again.' }));
      console.warn(`[ONBOARDING] Rejected stale/missing _t from ${clientIp}`);
      return true;
    }

    // 5. Validate required fields
    const missing = REQUIRED_FIELDS.filter(f => !data[f] || !String(data[f]).trim());
    if (missing.length > 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: `Missing required fields: ${missing.join(', ')}` }));
      return true;
    }

    // 6. Validate field formats
    for (const [field, validator] of Object.entries(FIELD_VALIDATORS)) {
      if (data[field] && !validator(data[field])) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: `Invalid format for: ${field}` }));
        return true;
      }
    }

    // 7. Sanitize all text inputs
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

    // 8. Store in Supabase
    const stored = await storeInSupabase(data);

    // 9. Send Telegram notification (with inline approve/reject buttons)
    await sendTelegramNotification(data, stored.id);

    // 10. Return success
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
