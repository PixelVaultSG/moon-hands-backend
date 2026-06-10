/**
 * Moon Hands — Premium Welcome Email Sender (Redesigned v3)
 * 
 * Uses Gmail SMTP with base64-embedded logo.
 * 
 * Multilingual Note: GPT-4o-mini supports English, Mandarin Chinese,
 * and Malay at conversational level. Medical terminology in Malay may
 * be less polished — we communicate this as "best-effort multilingual"
 * rather than guaranteeing native-level fluency in every language.
 * 
 * Env vars required:
 *   GMAIL_APP_PASSWORD (from Google App Passwords)
 *   GMAIL_FROM=pixelvaultsg@gmail.com
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// ─── LOAD LOGO BASE64 ────────────────────────────────────────────

let LOGO_BASE64 = '';
try {
  const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
  LOGO_BASE64 = fs.readFileSync(logoPath).toString('base64');
} catch (e) {
  console.warn('[WELCOME_EMAIL] Could not load logo, using fallback URL');
}

// ─── TRANSPORT SETUP ─────────────────────────────────────────────

function getTransporter() {
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  const fromEmail = process.env.GMAIL_FROM || 'pixelvaultsg@gmail.com';
  if (!appPassword) throw new Error('GMAIL_APP_PASSWORD not set');
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: fromEmail, pass: appPassword }
  });
}

// ─── WELCOME EMAIL ───────────────────────────────────────────────

async function sendWelcomeEmail({
  to,
  clinicName,
  contactName,
  plan,
  monthlyPrice,
  iCalUrl,
  agentName,
}) {
  const fromEmail = process.env.GMAIL_FROM || 'pixelvaultsg@gmail.com';
  const transporter = getTransporter();

  const aiName = agentName || 'your AI receptionist';
  const planLabel = plan === 'Premium' ? 'Premium' : 'Basic';

  const subject = `Your new AI hire is here! Welcome to Moon Hands, ${clinicName}`;

  const logoSrc = LOGO_BASE64
    ? `data:image/png;base64,${LOGO_BASE64}`
    : 'https://i.imgur.com/placeholder-logo.png';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to Moon Hands</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500;600&display=swap');
  body { margin:0; padding:0; background:#f5f3ee; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:600px; margin:0 auto; background:#ffffff; }

  /* HEADER */
  .header { background:#151515; padding:52px 40px 40px; text-align:center; }
  .header img { width:68px; height:68px; margin-bottom:18px; display:block; margin-left:auto; margin-right:auto; }
  .header h1 { font-family:'Playfair Display',Georgia,serif; color:#c9a84c; font-size:28px; font-weight:500; margin:0; letter-spacing:2px; line-height:1.2; }
  .header .brand-sub { color:#7a7568; font-size:10px; letter-spacing:4px; text-transform:uppercase; font-family:'Inter',sans-serif; font-weight:400; margin-top:8px; }

  /* BODY */
  .body { padding:48px 44px 40px; }
  .greeting { font-family:'Playfair Display',Georgia,serif; font-size:22px; color:#1a1a1a; font-weight:500; margin:0 0 6px; }
  .sub-greeting { font-family:'Inter',sans-serif; color:#8a8478; font-size:14px; margin:0 0 32px; line-height:1.7; font-weight:400; }
  .divider { height:1px; background:#e5e1d8; margin:32px 0; }
  .divider-light { height:1px; background:#f0ede6; margin:28px 0; }

  /* PLAN BOX */
  .plan-box { background:#faf8f4; border-left:3px solid #c9a84c; padding:16px 22px; margin:24px 0; }
  .plan-box p { margin:0; font-family:'Inter',sans-serif; font-size:13px; color:#6a6558; line-height:1.6; }
  .plan-box strong { color:#1a1a1a; font-weight:500; }

  /* SECTION HEADING */
  h3 { font-family:'Playfair Display',Georgia,serif; font-size:18px; color:#1a1a1a; font-weight:500; margin:36px 0 16px; letter-spacing:0.3px; }

  /* STEPS */
  .step { display:flex; margin-bottom:28px; align-items:flex-start; }
  .step-num { font-family:'Playfair Display',Georgia,serif; font-size:32px; color:#c9a84c; font-weight:400; width:44px; flex-shrink:0; line-height:1; opacity:0.7; }
  .step-body { flex:1; }
  .step-body h4 { font-family:'Inter',sans-serif; font-size:14px; font-weight:600; color:#1a1a1a; margin:0 0 5px; }
  .step-body p { font-family:'Inter',sans-serif; font-size:13px; color:#6a6558; line-height:1.75; margin:0; }
  .step-body code { font-family:'SF Mono',Monaco,monospace; font-size:11px; background:#f2efe8; padding:3px 8px; border-radius:3px; color:#5a5548; }

  /* CAPABILITIES */
  .capabilities { list-style:none; padding:0; margin:16px 0 0; }
  .capabilities li { position:relative; padding-left:24px; margin-bottom:14px; font-family:'Inter',sans-serif; font-size:13px; color:#4a4538; line-height:1.7; }
  .capabilities li::before { content:'✦'; position:absolute; left:0; color:#c9a84c; font-size:11px; }
  .capabilities li strong { color:#1a1a1a; font-weight:600; }
  .capabilities .sub { display:block; font-size:12px; color:#8a8478; margin-top:2px; font-weight:400; }

  /* CLOSING */
  .closing { background:#faf8f4; border-top:1px solid #e5e1d8; padding:32px 36px; text-align:center; margin-top:36px; }
  .closing p { font-family:'Inter',sans-serif; font-size:13px; color:#7a7568; line-height:1.8; margin:0; }
  .closing .sign-off { margin-top:16px; color:#1a1a1a; font-weight:500; font-family:'Playfair Display',Georgia,serif; font-size:15px; }

  /* FOOTER */
  .footer { background:#151515; padding:36px 40px; text-align:center; }
  .footer-links { margin-bottom:10px; }
  .footer-links a { color:#c9a84c; text-decoration:none; font-family:'Inter',sans-serif; font-size:12px; letter-spacing:0.5px; }
  .footer-links .sep { color:#4a4538; margin:0 10px; font-size:11px; }
  .footer-company { font-family:'Inter',sans-serif; font-size:11px; color:#5a5548; margin:0 0 4px; letter-spacing:0.5px; }
  .footer-fineprint { font-family:'Inter',sans-serif; font-size:10px; color:#4a4538; margin-top:14px; letter-spacing:0.3px; }

  @media (max-width:480px) {
    .header { padding:36px 24px 28px; }
    .header h1 { font-size:24px; }
    .body { padding:32px 24px; }
    .greeting { font-size:20px; }
  }
</style>
</head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#f5f3ee">
<table class="wrap" width="600" cellpadding="0" cellspacing="0" border="0">

<!-- HEADER -->
<tr><td class="header" align="center">
  <img src="${logoSrc}" alt="Moon Hands" width="68" height="68">
  <h1>Moon Hands</h1>
  <p class="brand-sub">by Pixel Vault Pte Ltd</p>
</td></tr>

<!-- BODY -->
<tr><td class="body">

  <p class="greeting">Welcome, ${contactName || 'there'}</p>
  <p class="sub-greeting">${aiName} has officially joined ${clinicName}. From this moment forward, every patient enquiry, every booking request, and every after-hours message is handled with care &mdash; around the clock, while you focus on what you do best.</p>

  <div class="plan-box">
    <p><strong>Your Plan:</strong> ${planLabel} &nbsp;&middot;&nbsp; <strong>Investment:</strong> S$${monthlyPrice} per month</p>
  </div>

  <div class="divider"></div>

  <h3>Getting Started</h3>

  <div class="step">
    <div class="step-num">1</div>
    <div class="step-body">
      <h4>Enable Booking Alerts</h4>
      <p>Download Telegram and search for <strong>@MoonHandsBot</strong>. Send <code>/start</code> to receive instant, discreet alerts for every new appointment. You remain in full control &mdash; ${aiName} handles the conversation, you approve the bookings that matter.</p>
    </div>
  </div>

  <div class="step">
    <div class="step-num">2</div>
    <div class="step-body">
      <h4>Send a Test Message</h4>
      <p>Message your clinic's WhatsApp Business number with &ldquo;Hi&rdquo; and watch ${aiName} respond with your personalised greeting and treatment menu. This is exactly how your patients will experience it &mdash; seamless, warm, and professional.</p>
    </div>
  </div>

  <div class="divider-light"></div>

  <h3>How ${aiName} Grows Your Business</h3>

  <ul class="capabilities">
    <li>
      <strong>Captures every lead, even at 2 AM</strong>
      <span class="sub">Patients message after hours? ${aiName} responds instantly. No more enquiries lost to voicemail or silence.</span>
    </li>
    <li>
      <strong>Books appointments while you treat patients</strong>
      <span class="sub">No more interrupted treatments. ${aiName} handles scheduling, rescheduling, and cancellations without you lifting a finger.</span>
    </li>
    <li>
      <strong>Answers treatment questions that convert</strong>
      <span class="sub">Price enquiries, downtime questions, suitability concerns &mdash; answered accurately, warmly, and in a way that moves patients toward booking.</span>
    </li>
    <li>
      <strong>Speaks your patients' language</strong>
      <span class="sub">English, Mandarin, and Malay &mdash; ${aiName} matches your patient's language automatically. <em>(Multilingual support is best-effort; complex medical terminology may default to English for accuracy.)</em></span>
    </li>
    <li>
      <strong>Reduces no-shows with instant confirmations</strong>
      <span class="sub">Every patient receives an immediate booking confirmation. Reminders and follow-ups happen automatically &mdash; your calendar stays full.</span>
    </li>
  </ul>

  <div class="closing">
    <p>Should you need anything at all &mdash; a refinement to ${aiName}&rsquo;s tone, an adjustment to your services, or simply a question &mdash; reply to this email or message us directly. We are here for you.</p>
    <p class="sign-off">&mdash; The Pixel Vault Team</p>
  </div>

</td></tr>

<!-- FOOTER -->
<tr><td class="footer">
  <p class="footer-company">Pixel Vault Pte Ltd &nbsp;&middot;&nbsp; Moon Hands by Pixel Vault</p>
  <p class="footer-links">
    <a href="https://www.moonhands.space">www.moonhands.space</a>
    <span class="sep">&middot;</span>
    <a href="mailto:pixelvaultsg@gmail.com">pixelvaultsg@gmail.com</a>
  </p>
  <p class="footer-fineprint">You received this email because you signed up for Moon Hands. We respect your privacy.</p>
</td></tr>

</table>
</td></tr></table>
</body>
</html>`;

  const text = `Welcome to Moon Hands, ${contactName || 'there'}!

${aiName} has officially joined ${clinicName}. Every patient enquiry, booking request, and after-hours message is now handled with care — around the clock, while you focus on what you do best.

YOUR PLAN: ${planLabel} (S$${monthlyPrice}/mo)

GETTING STARTED:

1. Enable Booking Alerts
   Download Telegram, search @MoonHandsBot, send /start for instant booking alerts.
   You remain in full control — ${aiName} handles the conversation, you approve the bookings.

2. Send a Test Message
   Message your clinic's WhatsApp Business number with "Hi" and watch ${aiName} respond.

HOW ${aiName.toUpperCase()} GROWS YOUR BUSINESS:

✦ Captures every lead, even at 2 AM
  Patients message after hours? ${aiName} responds instantly. No more enquiries lost to silence.

✦ Books appointments while you treat patients  
  No more interrupted treatments. ${aiName} handles scheduling without you lifting a finger.

✦ Answers treatment questions that convert
  Price enquiries, downtime questions — answered in a way that moves patients toward booking.

✦ Speaks your patients' language
  English, Mandarin, and Malay — ${aiName} matches your patient's language automatically.
  (Multilingual support is best-effort; complex medical terminology may default to English.)

✦ Reduces no-shows with instant confirmations
  Every patient receives immediate confirmation. Your calendar stays full.

Need anything? Reply to this email or message us directly.

— The Pixel Vault Team

www.moonhands.space · pixelvaultsg@gmail.com`;

  await transporter.sendMail({
    from: `"Moon Hands" <${fromEmail}>`,
    to,
    subject,
    text,
    html,
  });

  console.log(`[WELCOME_EMAIL] Sent to ${to} for ${clinicName}`);
  return { success: true, to, clinicName };
}

async function testWelcomeEmail(testEmail, agentName) {
  return sendWelcomeEmail({
    to: testEmail,
    clinicName: 'Glow Aesthetics Clinic',
    contactName: 'Dr. Sarah Tan',
    plan: 'Premium',
    monthlyPrice: 547,
    iCalUrl: 'https://moon-hands-backend.onrender.com/ical/demo-token.ics',
    agentName: agentName || 'Alex',
  });
}

module.exports = { sendWelcomeEmail, testWelcomeEmail };
