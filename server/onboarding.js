/**
 * Moon Hands - Onboarding API Handler
 * Receives clinic onboarding form submissions
 * Saves to Supabase + sends Telegram alert
 * 
 * SECURITY:
 * - Rate limiting per IP (3 submissions per hour)
 * - Input sanitization on all fields
 * - Email validation
 * - Phone validation (Singapore + international)
 * - Injection detection on text fields
 */

const { sanitizeInput, validateEmail, validatePhone, processIncomingMessage } = require('../middleware/security');
const db = require('../supabase/client');

// ─── RATE LIMITING FOR ONBOARDING ────────────────────────────────

const onboardingAttempts = new Map(); // ip -> [timestamps]

function checkOnboardingRateLimit(ip) {
  const now = Date.now();
  const hourAgo = now - 3600000;
  const attempts = (onboardingAttempts.get(ip) || []).filter(t => t > hourAgo);
  
  if (attempts.length >= 3) {
    return { allowed: false, retryAfter: Math.ceil((attempts[0] + 3600000 - now) / 1000) };
  }
  
  attempts.push(now);
  onboardingAttempts.set(ip, attempts);
  return { allowed: true };
}

// ─── FIELD VALIDATION ────────────────────────────────────────────

const REQUIRED_FIELDS = [
  'clinic_name',
  'contact_name',
  'clinic_email',
  'clinic_phone',
  'whatsapp_number',
  'selected_plan'
];

const VALID_PLANS = ['starter', 'professional'];
const VALID_TONES = ['friendly', 'professional', 'casual', 'luxury'];
const VALID_LANGUAGES = ['en', 'zh', 'ms', 'ta', 'ja', 'ko'];

function validateSubmission(data) {
  const errors = [];
  
  // Required fields
  for (const field of REQUIRED_FIELDS) {
    if (!data[field] || String(data[field]).trim().length === 0) {
      errors.push(`${field} is required`);
    }
  }
  
  // Email validation
  if (data.clinic_email && !validateEmail(data.clinic_email)) {
    errors.push('Invalid email address');
  }
  
  // Phone validation (clinic phone — more lenient)
  if (data.clinic_phone && !validatePhone(data.clinic_phone)) {
    errors.push('Clinic phone must be in format +65XXXXXXXX or +[country][number]');
  }
  
  // WhatsApp number validation (must be valid)
  if (data.whatsapp_number && !validatePhone(data.whatsapp_number)) {
    errors.push('WhatsApp number must be in format +65XXXXXXXX or +[country][number]');
  }
  
  // Plan validation
  if (data.selected_plan && !VALID_PLANS.includes(data.selected_plan)) {
    errors.push('Invalid plan selected');
  }
  
  // Tone validation
  if (data.preferred_tone && !VALID_TONES.includes(data.preferred_tone)) {
    errors.push('Invalid tone selected');
  }
  
  // Treatment menu validation (if provided)
  if (data.treatment_menu) {
    try {
      const treatments = typeof data.treatment_menu === 'string' 
        ? JSON.parse(data.treatment_menu) 
        : data.treatment_menu;
      if (!Array.isArray(treatments)) {
        errors.push('Treatment menu must be an array');
      }
      for (const t of treatments) {
        if (!t.name || !t.price) {
          errors.push('Each treatment must have a name and price');
          break;
        }
      }
    } catch {
      errors.push('Invalid treatment menu format');
    }
  }
  
  // Operating hours validation (if provided)
  if (data.operating_hours) {
    try {
      const hours = typeof data.operating_hours === 'string' 
        ? JSON.parse(data.operating_hours) 
        : data.operating_hours;
      if (!Array.isArray(hours) || hours.length !== 7) {
        errors.push('Operating hours must be an array of 7 days');
      }
    } catch {
      errors.push('Invalid operating hours format');
    }
  }
  
  // Injection check on text fields
  const textFieldsCheck = ['clinic_name', 'contact_name', 'special_notes', 'preferred_greeting', 'cancellation_policy', 'address', 'nearest_mrt', 'parking_info', 'preferred_agent_name'];
  for (const field of textFieldsCheck) {
    if (data[field]) {
      const check = processIncomingMessage(String(data[field]));
      if (check.blocked) {
        errors.push(`Security: Suspicious content detected in ${field}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// ─── DATA SANITIZATION ───────────────────────────────────────────

function sanitizeSubmission(data) {
  const sanitized = {};
  
  // Text fields — sanitize
  const textFields = [
    'clinic_name', 'contact_name', 'contact_role', 'clinic_email',
    'clinic_address', 'address', 'clinic_postal_code', 'business_registration_number',
    'nearest_mrt', 'parking_info',
    'preferred_agent_name', 'preferred_greeting', 'special_notes',
    'cancellation_policy', 'google_calendar_email', 'admin_notes'
  ];
  
  for (const field of textFields) {
    if (data[field] !== undefined) {
      sanitized[field] = sanitizeInput(String(data[field]));
    }
  }
  
  // Phone fields — strip whitespace, keep +
  const phoneFields = ['clinic_phone', 'whatsapp_number'];
  for (const field of phoneFields) {
    if (data[field]) {
      sanitized[field] = String(data[field]).replace(/\s/g, '');
    }
  }
  
  // Enum fields — pass through if valid
  if (data.selected_plan && VALID_PLANS.includes(data.selected_plan)) {
    sanitized.selected_plan = data.selected_plan;
  }
  if (data.preferred_tone && VALID_TONES.includes(data.preferred_tone)) {
    sanitized.preferred_tone = data.preferred_tone;
  }
  
  // Languages — validate each
  if (data.languages) {
    const langs = Array.isArray(data.languages) ? data.languages : [data.languages];
    sanitized.languages = langs.filter(l => VALID_LANGUAGES.includes(l));
    if (sanitized.languages.length === 0) sanitized.languages = ['en'];
  }
  
  // Numeric fields
  if (data.appointment_duration_minutes !== undefined) {
    sanitized.appointment_duration_minutes = Math.min(Math.max(parseInt(data.appointment_duration_minutes) || 60, 15), 480);
  }
  if (data.buffer_between_appointments_minutes !== undefined) {
    sanitized.buffer_between_appointments_minutes = Math.min(Math.max(parseInt(data.buffer_between_appointments_minutes) || 15, 0), 120);
  }
  if (data.max_appointments_per_day !== undefined) {
    sanitized.max_appointments_per_day = Math.min(Math.max(parseInt(data.max_appointments_per_day) || 12, 1), 50);
  }
  
  // Boolean fields
  sanitized.has_google_calendar = !!data.has_google_calendar;
  sanitized.booking_auto_confirm = !!data.booking_auto_confirm;
  sanitized.booking_waitlist_enabled = data.booking_waitlist_enabled !== false; // default true
  sanitized.booking_require_phone = data.booking_require_phone !== false; // default true
  sanitized.booking_allow_same_day = data.booking_allow_same_day !== false; // default true
  sanitized.booking_reminder_24h = data.booking_reminder_24h !== false; // default true
  sanitized.booking_reminder_1h = data.booking_reminder_1h !== false; // default true
  sanitized.booking_followup_48h = data.booking_followup_48h !== false; // default true
  
  // Enum fields
  const validAfterHours = ['auto_confirm', 'hold_for_approval', 'next_business_day'];
  if (data.booking_after_hours_action && validAfterHours.includes(data.booking_after_hours_action)) {
    sanitized.booking_after_hours_action = data.booking_after_hours_action;
  } else {
    sanitized.booking_after_hours_action = 'hold_for_approval';
  }
  
  // Numeric fields
  sanitized.booking_max_advance_days = Math.min(Math.max(parseInt(data.booking_max_advance_days) || 30, 1), 90);
  sanitized.booking_min_notice_hours = Math.min(Math.max(parseInt(data.booking_min_notice_hours) || 2, 0), 48);
  
  // JSON fields — parse and validate
  const jsonFields = ['treatment_menu', 'operating_hours', 'faqs', 'aftercare_instructions'];
  for (const field of jsonFields) {
    if (data[field]) {
      try {
        const parsed = typeof data[field] === 'string' ? JSON.parse(data[field]) : data[field];
        sanitized[field] = JSON.stringify(parsed);
      } catch {
        // Invalid JSON — skip this field
      }
    }
  }
  
  return sanitized;
}

// ─── SAVE TO SUPABASE ────────────────────────────────────────────

async function saveSubmission(data) {
  const { data: result, error } = await db.supabase
    .from('onboarding_submissions')
    .insert(data)
    .select()
    .single();
  
  if (error) {
    console.error('[ONBOARDING] Supabase insert error:', error);
    throw new Error(`Database error: ${error.message}`);
  }
  
  return result;
}

// ─── TELEGRAM ALERT ──────────────────────────────────────────────

async function sendTelegramAlert(submission) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    
    if (!botToken || !adminChatId) {
      console.warn('[ONBOARDING] Telegram alert skipped: missing env vars');
      return;
    }
    
    const planEmoji = submission.selected_plan === 'professional' ? '⭐' : '🌟';
    const planName = submission.selected_plan === 'professional' ? 'Professional (S$547)' : 'Starter (S$347)';
    
    const treatments = submission.treatment_menu 
      ? (typeof submission.treatment_menu === 'string' ? JSON.parse(submission.treatment_menu) : submission.treatment_menu)
      : [];
    const treatmentCount = Array.isArray(treatments) ? treatments.length : 0;
    const customCount = Array.isArray(treatments) ? treatments.filter(t => t.category && !['Injectables','Facials','Lifting','Laser'].includes(t.category)).length : 0;
    
    const faqs = submission.faqs
      ? (typeof submission.faqs === 'string' ? JSON.parse(submission.faqs) : submission.faqs)
      : [];
    const faqCount = Array.isArray(faqs) ? faqs.length : 0;
    
    const hours = submission.operating_hours
      ? (typeof submission.operating_hours === 'string' ? JSON.parse(submission.operating_hours) : submission.operating_hours)
      : [];
    const openDays = Array.isArray(hours) ? hours.filter(h => h.isOpen).length : 0;
    
    const message = [
      '🆕 *NEW ONBOARDING SUBMISSION*',
      '',
      `*${escapeMarkdown(submission.clinic_name)}*`,
      `👤 ${escapeMarkdown(submission.contact_name || 'N/A')} (${escapeMarkdown(submission.contact_role || 'N/A')})`,
      `📧 ${escapeMarkdown(submission.clinic_email)}`,
      `📱 WhatsApp: ${escapeMarkdown(submission.whatsapp_number)}`,
      `📍 ${escapeMarkdown(submission.address || 'N/A')}`,
      submission.nearest_mrt ? `🚇 ${escapeMarkdown(submission.nearest_mrt)}` : '',
      '',
      `${planEmoji} *Plan:* ${planName}`,
      `🩺 *Treatments:* ${treatmentCount} total${customCount > 0 ? ` (${customCount} custom)` : ''}`,
      `🕐 *Open:* ${openDays}/7 days · Slots: ${submission.appointment_duration_minutes || 30}min`,
      `🤖 *AI:* ${escapeMarkdown(submission.preferred_agent_name || 'Sophia')} · ${escapeMarkdown(submission.preferred_tone || 'friendly')} tone`,
      `🌍 *Languages:* ${(submission.languages || ['en']).join(', ')}`,
      faqCount > 0 ? `❓ *FAQs:* ${faqCount} configured` : '',
      submission.special_notes ? `📝 Has special notes` : '',
      '',
      `*Booking:* ${submission.booking_auto_confirm ? 'Auto-confirm' : 'Hold for approval'} · ${submission.booking_allow_same_day ? 'Same-day OK' : 'No same-day'} · ${submission.booking_min_notice_hours || 2}h notice`,
      '',
      `*Payment Required:*`,
      `💰 Amount: ${planName.includes('547') ? 'S\\$547' : 'S\\$347'}`,
      `📊 Status: PENDING\\_PAYMENT`,
      `🏦 Bank: DBS Bank · Pixel Vault Pte Ltd`,
      ``,
      `*Actions:*`,
      `1\. Wait for payment screenshot via email`,
      `2\. Confirm payment → activate clinic`,
      `3\. Guide clinic to set up 360dialog`,
      `4\. Test bot → mark active when ready`,
      '',
      `_Received: ${new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}_`,
    ].filter(Boolean).join('\n');
    
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChatId,
        text: message,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true
      })
    });
    
    if (!response.ok) {
      console.error('[ONBOARDING] Telegram alert failed:', await response.text());
    } else {
      console.log('[ONBOARDING] Telegram alert sent successfully');
    }
  } catch (err) {
    console.error('[ONBOARDING] Telegram alert error:', err.message);
    // Don't fail the submission if alert fails
  }
}

function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// ─── MAIN HANDLER ────────────────────────────────────────────────

async function handleOnboarding(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || req.connection.remoteAddress 
    || 'unknown';
  
  try {
    // Step 1: Rate limit check
    const rateCheck = checkOnboardingRateLimit(ip);
    if (!rateCheck.allowed) {
      return res.writeHead(429, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        status: 'error',
        message: 'Too many submissions. Please wait before trying again.',
        retry_after: rateCheck.retryAfter
      }));
    }
    
    // Step 2: Parse body (works with raw http module)
    let body;
    try {
      if (req.body && typeof req.body === 'object') {
        body = req.body;
      } else {
        const raw = await parseBody(req);
        body = JSON.parse(raw);
      }
    } catch {
      return res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        status: 'error',
        message: 'Invalid JSON body'
      }));
    }
    
    // Helper: parse body from raw http request stream
    async function parseBody(req) {
      return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; if (data.length > 1e6) reject(new Error('Body too large')); });
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
    }
    
    // Step 3: Validate
    const validation = validateSubmission(body);
    if (!validation.valid) {
      return res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        status: 'error',
        message: 'Validation failed',
        errors: validation.errors
      }));
    }
    
    // Step 4: Sanitize
    const sanitized = sanitizeSubmission(body);
    
    // Step 5: Save to database (status: pending_payment)
    const submission = await saveSubmission(sanitized);
    
    // Step 6: Send Telegram alert to Pixel Vault admin with payment details
    await sendTelegramAlert(submission);
    
    // Step 7: Return success with payment instructions
    const planPrice = sanitized.plan === 'professional' ? 547 : 347;
    return res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      status: 'success',
      message: 'Onboarding submitted! Please complete payment to activate your AI receptionist.',
      submission_id: submission.id,
      status: 'pending_payment',
      payment: {
        bank: 'DBS Bank',
        account_name: 'Pixel Vault Pte Ltd',
        account_number: '[UPDATE_THIS]',
        amount: `S$${planPrice}`,
        reference: sanitized.clinicName || 'Clinic',
        instructions: 'Email payment screenshot to hello@pixelvault.sg'
      },
      next_steps: [
        '1. Make bank transfer (details above)',
        '2. Email payment screenshot to hello@pixelvault.sg',
        '3. We activate your AI receptionist within 24 hours',
        '4. Set up your 360dialog WhatsApp Business API account (we will guide you)',
        '5. Your AI receptionist goes LIVE!'
      ]
    }));
    
  } catch (err) {
    console.error('[ONBOARDING] Handler error:', err);
    return res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      status: 'error',
      message: 'Internal server error. Please try again or contact us directly.'
    }));
  }
}

// ─── EXPORTS ─────────────────────────────────────────────────────

// ─── ACTIVATE CLINIC (Admin-only, after payment confirmed) ───────

async function activateClinic(req, res) {
  const masterSecret = req.headers['x-moonhands-master'];
  if (masterSecret !== process.env.MASTER_SECRET) {
    return res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      status: 'error', message: 'Unauthorized'
    }));
  }
  
  try {
    let body;
    try {
      const raw = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; if (data.length > 1e6) reject(new Error('Body too large')); });
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      body = JSON.parse(raw);
    } catch {
      return res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        status: 'error', message: 'Invalid JSON body'
      }));
    }
    
    const { submission_id } = body;
    if (!submission_id) {
      return res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        status: 'error', message: 'submission_id required'
      }));
    }
    
    // Fetch the submission
    const { data: submission, error: fetchErr } = await db.supabase
      .from('onboarding_submissions')
      .select('*')
      .eq('id', submission_id)
      .single();
    
    if (fetchErr || !submission) {
      return res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        status: 'error', message: 'Submission not found'
      }));
    }
    
    // Generate client ID
    const clientId = require('crypto').randomUUID();
    
    // Parse treatments
    let treatments = [];
    try {
      treatments = typeof submission.treatment_menu === 'string' 
        ? JSON.parse(submission.treatment_menu) 
        : (submission.treatment_menu || []);
    } catch { treatments = []; }
    
    // Parse operating hours
    let hours = [];
    try {
      hours = typeof submission.operating_hours === 'string'
        ? JSON.parse(submission.operating_hours)
        : (submission.operating_hours || []);
    } catch { hours = []; }
    
    // Parse FAQs
    let faqs = [];
    try {
      faqs = typeof submission.faqs === 'string'
        ? JSON.parse(submission.faqs)
        : (submission.faqs || []);
    } catch { faqs = []; }
    
    // 1. Create client record
    const { error: clientErr } = await db.supabase.from('clients').insert({
      id: clientId,
      name: submission.clinic_name,
      slug: submission.clinic_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      whatsapp_number: submission.whatsapp_number,
      email: submission.clinic_email,
      phone: submission.clinic_phone,
      status: 'active',
      plan: submission.selected_plan || 'starter',
      ical_token: require('crypto').randomUUID(),
    });
    
    if (clientErr) throw clientErr;
    
    // 2. Create client config
    const { error: configErr } = await db.supabase.from('client_configs').insert({
      client_id: clientId,
      operating_hours: hours,
      services: treatments,
      faqs: faqs,
      special_notes: submission.special_notes || '',
      booking_auto_confirm: submission.booking_auto_confirm || false,
      booking_after_hours_action: 'hold_for_approval',
      booking_waitlist_enabled: true,
      booking_max_advance_days: 30,
      booking_min_notice_hours: submission.booking_min_notice_hours || 2,
      booking_allow_same_day: submission.booking_allow_same_day || false,
      booking_require_phone: true,
      buffer_time: 15,
    });
    
    if (configErr) throw configErr;
    
    // 3. Update submission status
    await db.supabase.from('onboarding_submissions')
      .update({ status: 'active', activated_at: new Date().toISOString() })
      .eq('id', submission_id);
    
    // 4. Send welcome email
    let emailResult = null;
    try {
      const { sendWelcomeEmail } = require('../utils/welcome-email');
      const planPrice = submission.selected_plan === 'professional' ? 547 : 347;
      const { data: clientRecord } = await db.supabase
        .from('clients')
        .select('ical_token')
        .eq('id', clientId)
        .single();
      
      emailResult = await sendWelcomeEmail({
        to: submission.clinic_email,
        clinicName: submission.clinic_name,
        contactName: submission.contact_name,
        plan: submission.selected_plan === 'professional' ? 'Premium' : 'Basic',
        monthlyPrice: planPrice,
        iCalUrl: `https://moon-hands-backend.onrender.com/ical/${clientRecord?.ical_token}.ics`,
      });
    } catch (emailErr) {
      console.error('[ACTIVATE] Welcome email failed:', emailErr.message);
    }
    
    // 5. Send Telegram confirmation
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (botToken && adminChatId) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: adminChatId,
          text: `✅ CLINIC ACTIVATED\n\n${submission.clinic_name}\nStatus: ACTIVE\nClient ID: ${clientId.slice(0,8)}\nEmail sent: ${emailResult ? 'Yes' : 'No'}`,
        })
      });
    }
    
    return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      status: 'success',
      message: 'Clinic activated successfully',
      client_id: clientId,
      email_sent: !!emailResult,
      next_steps: [
        'Clinic created in database',
        'Welcome email sent',
        'Guide clinic to set up 360dialog WhatsApp Business API',
        'Clinic tests bot → goes LIVE'
      ]
    }));
    
  } catch (err) {
    console.error('[ACTIVATE] Error:', err);
    return res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      status: 'error', message: err.message
    }));
  }
}

module.exports = { handleOnboarding, activateClinic };
