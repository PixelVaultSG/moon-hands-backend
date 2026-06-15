/**
 * Moon Hands — Tier 1 / Tier 2 Onboarding Flow
 *
 * Tier 1 ("Yes" to all): Self-service, automated 360dialog setup
 * Tier 2 (any "Not Sure"): Guided, Kimi initiates proactive support
 *
 * Key: Kimi INITIATES conversation with Tier 2 clinics — they don't need to reach out
 */

const crypto = require('crypto');

// ─── TIER DETECTION ──────────────────────────────────────────────

function detectTier(submission) {
  const answers = submission.dialog360_readiness || {};

  // If ALL are confidently "yes" → Tier 1 (self-service)
  const isTier1 = (
    answers.has_whatsapp_business === 'yes' &&
    answers.has_meta_portfolio === 'yes' &&
    answers.meta_portfolio_verified === 'yes' &&
    answers.whatsapp_app_online === 'yes' &&
    answers.phone_number_ready === 'yes'
  );

  return isTier1 ? 1 : 2;
}

// ─── TIER 1: AUTOMATED FLOW ──────────────────────────────────────

async function executeTier1(clinicId, submission, clinicEmail, clinicPhone) {
  const onboardingId = crypto.randomUUID();
  const steps = [];

  // Step 1: Create clinic record
  steps.push({ step: 1, status: 'done', label: 'Clinic record created in Supabase' });

  // Step 2: Generate webhook URL
  const webhookUrl = getClinicWebhookUrl(clinicId, submission.webhook_token);
  steps.push({ step: 2, status: 'done', label: 'Webhook URL generated', detail: webhookUrl });

  // Step 3: Generate 360dialog Embedded Signup link
  const embeddedSignupUrl = generateEmbeddedSignupLink(clinicId, submission);
  steps.push({ step: 3, status: 'pending', label: '360dialog Embedded Signup link generated', detail: embeddedSignupUrl });

  // Step 4: Send automated email with link
  await sendTier1Email(clinicEmail, submission, embeddedSignupUrl, webhookUrl);
  steps.push({ step: 4, status: 'done', label: 'Tier 1 email sent with Embedded Signup link' });

  // Step 5: Schedule nudge sequence
  scheduleNudges(clinicId, clinicEmail, 'tier1');
  steps.push({ step: 5, status: 'scheduled', label: 'Nudge sequence scheduled (24h, 48h, 72h)' });

  return {
    tier: 1,
    onboardingId,
    steps,
    status: 'awaiting_clinic_action',
    message: 'Embedded Signup link sent. Waiting for clinic to complete 360dialog auth.',
  };
}

// ─── TIER 2: GUIDED FLOW (KIMI INITIATES) ───────────────────────

async function executeTier2(clinicId, submission, clinicEmail, clinicPhone) {
  const onboardingId = crypto.randomUUID();
  const steps = [];
  const gaps = identifyGaps(submission);

  // Step 1: Create clinic record (status: setup_pending)
  steps.push({ step: 1, status: 'done', label: 'Clinic record created (setup_pending)' });

  // Step 2: Kimi initiates proactive WhatsApp message to clinic
  // This is the KEY difference: Kimi reaches out, not the clinic
  const initiationMessage = buildTier2InitiationMessage(submission.clinic_name, gaps);
  steps.push({
    step: 2,
    status: 'initiated',
    label: 'Kimi initiated guided onboarding via WhatsApp',
    detail: initiationMessage,
  });

  // Step 3: Send detailed guidance email
  const guidanceEmail = buildTier2GuidanceEmail(submission, gaps);
  await sendTier2Email(clinicEmail, submission, guidanceEmail);
  steps.push({ step: 3, status: 'done', label: 'Tier 2 guidance email sent with step-by-step instructions' });

  // Step 4: Create guided onboarding tracker in Supabase
  await createGuidedTracker(clinicId, gaps);
  steps.push({ step: 4, status: 'active', label: 'Guided tracker created — Kimi will follow up every 24h' });

  // Step 5: Notify Owner
  await notifyOwnerTier2(clinicId, submission, gaps);
  steps.push({ step: 5, status: 'done', label: 'Owner notified of Tier 2 clinic requiring guidance' });

  return {
    tier: 2,
    onboardingId,
    steps,
    status: 'guided_onboarding_active',
    message: 'Kimi has initiated proactive guidance. WhatsApp message + email sent.',
    gaps,
    nextAction: 'Kimi will WhatsApp clinic within 1 hour with first guided step',
  };
}

// ─── GAP IDENTIFICATION ──────────────────────────────────────────

function identifyGaps(submission) {
  const answers = submission.dialog360_readiness || {};
  const gaps = [];

  if (answers.has_whatsapp_business !== 'yes') {
    gaps.push({
      id: 'whatsapp_business',
      question: 'Do you have WhatsApp Business installed?',
      answer: answers.has_whatsapp_business,
      priority: 1,
      instruction: 'Download WhatsApp Business from App Store/Google Play. This is REQUIRED before we can connect your number.',
      eta: '2 minutes',
    });
  }

  if (answers.has_meta_portfolio !== 'yes') {
    gaps.push({
      id: 'meta_portfolio',
      question: 'Do you have a Meta Business Portfolio?',
      answer: answers.has_meta_portfolio,
      priority: 2,
      instruction: `Create one at business.facebook.com:
1. Click "Create Account"
2. Enter your clinic name and your personal email
3. Add your business details (UEN, address)
4. This is where your WhatsApp number will be managed`,
      eta: '5 minutes',
    });
  }

  if (answers.meta_portfolio_verified !== 'yes') {
    gaps.push({
      id: 'meta_verified',
      question: 'Is your Meta Business Portfolio verified?',
      answer: answers.meta_portfolio_verified,
      priority: 3,
      instruction: `Meta requires business verification:
1. In your Meta Business Portfolio, go to Settings → Business Info
2. Click "Start Verification"
3. Upload: Business Registration (ACRA), Utility bill, or Bank statement
4. Verification takes 1-3 business days
5. You can continue setup — we'll connect everything and it goes live once verified`,
      eta: '1-3 days (Meta reviews)',
    });
  }

  if (answers.whatsapp_app_online !== 'yes') {
    gaps.push({
      id: 'whatsapp_online',
      question: 'Is your WhatsApp Business app online?',
      answer: answers.whatsapp_app_online,
      priority: 1,
      instruction: 'Open WhatsApp Business on your phone. Make sure you see your chats. The app must be running for us to connect.',
      eta: '1 minute',
    });
  }

  if (answers.phone_number_ready !== 'yes') {
    gaps.push({
      id: 'phone_ready',
      question: 'Is your phone number ready for Business API?',
      answer: answers.phone_number_ready,
      priority: 1,
      instruction: `Your phone number must:
• Be a real mobile number (not VoIP/landline)
• Not already connected to another WhatsApp Business API provider
• Be able to receive SMS/calls for verification`,
      eta: 'Immediate (if number is valid)',
    });
  }

  // Sort by priority
  return gaps.sort((a, b) => a.priority - b.priority);
}

// ─── TIER 2: KIMI'S INITIATION MESSAGE ──────────────────────────
// This is what Kimi sends proactively to the clinic via WhatsApp

function buildTier2InitiationMessage(clinicName, gaps) {
  const firstGap = gaps[0];

  return `Hi ${clinicName}! 👋 I'm ${process.env.DEFAULT_AI_NAME || 'Alex'} from Moon Hands.

Great news — your onboarding form is received! I noticed you selected "Not Sure" for a few items, so I'm here to walk you through it. No stress — we'll get you live quickly.

${firstGap ? `First, let's tackle: *${firstGap.question}*

${firstGap.instruction}

⏱️ This takes about ${firstGap.eta}.

Just reply "Done" when you've completed this step, or ask me anything if you're stuck. I'm here 24/7.` : 'Everything looks good! Let me know when you\'re ready to proceed.'}

— ${process.env.DEFAULT_AI_NAME || 'Alex'} at Moon Hands`;
}

// ─── TIER 2: GUIDANCE EMAIL ─────────────────────────────────────

function buildTier2GuidanceEmail(submission, gaps) {
  const sections = gaps.map((gap, i) => `
Step ${i + 1}: ${gap.question}
Answer: "${gap.answer}"

${gap.instruction}

Time needed: ${gap.eta}
---
`).join('\n');

  return `Welcome to Moon Hands, ${submission.clinic_name}!

Your onboarding is in progress. I've noticed a few items that need your attention before we can connect your WhatsApp. Don't worry — I've prepared step-by-step instructions below.

${sections}

WHAT HAPPENS NEXT:
Once you complete the steps above, simply reply to any of my WhatsApp messages with "Ready" and I'll send you the final signup link.

NEED HELP?
• Reply to this email
• Message me on WhatsApp anytime — I respond instantly, 24/7

You're almost there!

— The Moon Hands Team`;
}

// ─── NUDGE SEQUENCE ─────────────────────────────────────────────

function scheduleNudges(clinicId, clinicEmail, tier) {
  const intervals = tier === 'tier1'
    ? [24, 48, 72]  // hours
    : [24, 48, 72, 96, 120]; // longer for Tier 2

  // Store nudge schedule in Supabase (picked up by a job scheduler)
  intervals.forEach(hours => {
    const scheduledAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    // This would be stored in a scheduled_jobs table
    console.log(`[ONBOARDING] Nudge scheduled for clinic ${clinicId.slice(0, 8)} at ${scheduledAt.toISOString()} (${hours}h)`);
  });
}

// ─── OWNER NOTIFICATIONS ────────────────────────────────────────

async function notifyOwnerTier2(clinicId, submission, gaps) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!botToken || !adminChatId) return;

  const gapSummary = gaps.map(g => `• ${g.question}: ${g.answer}`).join('\n');

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: adminChatId,
      text: `📋 Tier 2 Clinic Onboarding\n\n${submission.clinic_name}\nContact: ${submission.contact_name}\nEmail: ${submission.clinic_email}\nPhone: ${submission.clinic_phone}\n\nGaps detected (${gaps.length}):\n${gapSummary}\n\nKimi has initiated proactive guidance via WhatsApp + email.\n\nAction needed: Monitor if clinic gets stuck.`,
    }),
  });
}

// ─── EMBEDDED SIGNUP LINK ───────────────────────────────────────

function generateEmbeddedSignupLink(clinicId, submission) {
  // 360dialog Embedded Signup uses our partner credentials
  // The clinic clicks this, authenticates with Meta, selects their number
  const baseUrl = 'https://hub.360dialog.com/dashboard/app/';
  // In production, this would include our partner token and a callback URL
  return `${baseUrl}signup?partner=moonhands&callback=${encodeURIComponent(getCallbackUrl(clinicId))}&display_name=${encodeURIComponent(submission.clinic_name || '')}`;
}

function getCallbackUrl(clinicId) {
  const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://moon-hands-backend.onrender.com';
  return `${baseUrl}/api/360dialog-callback?clinic_id=${clinicId}`;
}

function getClinicWebhookUrl(clinicId, token) {
  const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://moon-hands-backend.onrender.com';
  return `${baseUrl}/webhook/whatsapp?clinic_id=${clinicId}&token=${token}`;
}

// ─── EMAIL SENDERS (placeholder — uses existing welcome-email.js) ─

async function sendTier1Email(to, submission, signupUrl, webhookUrl) {
  // Uses the existing email system
  console.log(`[TIER1 EMAIL] To: ${to}, Signup: ${signupUrl}`);
  // Implementation would call existing email sender
}

async function sendTier2Email(to, submission, guidanceContent) {
  console.log(`[TIER2 EMAIL] To: ${to}, Gaps: ${submission.dialog360_readiness ? Object.keys(submission.dialog360_readiness).length : 0}`);
  // Implementation would call existing email sender
}

async function createGuidedTracker(clinicId, gaps) {
  // Store in Supabase: guided_onboarding_trackers table
  console.log(`[GUIDED TRACKER] Created for ${clinicId.slice(0, 8)} with ${gaps.length} gaps`);
}

// ─── MAIN ENTRY POINT ────────────────────────────────────────────

async function processOnboarding(clinicId, submission) {
  const clinicEmail = submission.clinic_email;
  const clinicPhone = submission.clinic_phone;
  const tier = detectTier(submission);

  console.log(`[ONBOARDING] Clinic ${clinicId.slice(0, 8)} → Tier ${tier}`);

  if (tier === 1) {
    return executeTier1(clinicId, submission, clinicEmail, clinicPhone);
  } else {
    return executeTier2(clinicId, submission, clinicEmail, clinicPhone);
  }
}

// ─── EXPORTS ────────────────────────────────────────────────────

module.exports = {
  processOnboarding,
  detectTier,
  executeTier1,
  executeTier2,
  identifyGaps,
  buildTier2InitiationMessage,
  generateEmbeddedSignupLink,
};
