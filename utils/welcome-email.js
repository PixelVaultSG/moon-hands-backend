/**
 * Moon Hands — Premium Welcome Email Sender
 * Uses Gmail SMTP. Embed the logo as base64 for maximum email client compatibility.
 */

const nodemailer = require('nodemailer');

// ─── TRANSPORT SETUP ─────────────────────────────────────────────

function getTransporter() {
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  const fromEmail = process.env.GMAIL_FROM || 'pixelvaultsg@gmail.com';
  if (!appPassword) throw new Error('GMAIL_APP_PASSWORD not set');
  return nodemailer.createTransport({ service: 'gmail', auth: { user: fromEmail, pass: appPassword } });
}

// ─── WELCOME EMAIL ───────────────────────────────────────────────

async function sendWelcomeEmail({ to, clinicName, contactName, plan, monthlyPrice, iCalUrl, agentName }) {
  const fromEmail = process.env.GMAIL_FROM || 'pixelvaultsg@gmail.com';
  const transporter = getTransporter();

  const aiName = agentName || 'your AI receptionist';
  const planLabel = plan === 'Premium' ? 'Premium' : 'Basic';

  const subject = `Your new AI hire is here! Welcome to Moon Hands, ${clinicName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to Moon Hands</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap');
  body { margin:0; padding:0; background:#f7f5f0; font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; }
  .wrap { max-width:600px; margin:0 auto; background:#ffffff; }
  .header { background:#1a1a1a; padding:48px 40px 36px; text-align:center; }
  .header img { width:72px; height:72px; margin-bottom:20px; }
  .header h1 { font-family:'Playfair Display',Georgia,serif; color:#d4af37; font-size:26px; font-weight:500; margin:0 0 6px; letter-spacing:1px; }
  .header .tagline { color:#9a9085; font-size:12px; letter-spacing:3px; text-transform:uppercase; font-weight:400; }
  .body { padding:44px 40px; }
  .greeting { font-family:'Playfair Display',Georgia,serif; font-size:22px; color:#1a1a1a; font-weight:500; margin-bottom:8px; }
  .subgreeting { color:#7a7568; font-size:14px; margin-bottom:28px; line-height:1.6; }
  .divider { height:1px; background:#e8e4dc; margin:28px 0; }
  .plan-box { background:#faf8f4; border-left:3px solid #d4af37; padding:18px 22px; margin:24px 0; }
  .plan-box p { margin:0; font-size:13px; color:#5a5548; }
  .plan-box strong { color:#1a1a1a; }
  h3 { font-family:'Playfair Display',Georgia,serif; font-size:17px; color:#1a1a1a; font-weight:500; margin:32px 0 14px; }
  .step { display:flex; margin-bottom:24px; }
  .step-num { font-family:'Playfair Display',Georgia,serif; font-size:28px; color:#d4af37; font-weight:400; width:40px; flex-shrink:0; line-height:1; }
  .step-body h4 { font-size:14px; font-weight:600; color:#1a1a1a; margin:0 0 4px; }
  .step-body p { font-size:13px; color:#6a6558; line-height:1.7; margin:0; }
  .step-body a { color:#b8952e; text-decoration:none; }
  .step-body code { font-family:'SF Mono',Monaco,monospace; font-size:11px; background:#f2efe8; padding:3px 6px; border-radius:3px; color:#5a5548; word-break:break-all; }
  .capabilities { padding-left:0; list-style:none; margin:16px 0; }
  .capabilities li { position:relative; padding-left:20px; margin-bottom:10px; font-size:13px; color:#5a5548; line-height:1.7; }
  .capabilities li::before { content:'—'; position:absolute; left:0; color:#d4af37; }
  .closing { background:#faf8f4; padding:28px 32px; text-align:center; margin-top:32px; }
  .closing p { font-size:13px; color:#7a7568; line-height:1.7; margin:0; }
  .footer { background:#1a1a1a; padding:32px 40px; text-align:center; }
  .footer p { font-size:11px; color:#7a7568; margin:0 0 4px; }
  .footer a { color:#d4af37; text-decoration:none; font-size:11px; }
  .fineprint { color:#555; font-size:10px; margin-top:12px; }
  @media (max-width:480px) {
    .header, .body { padding:32px 24px; }
    .greeting { font-size:20px; }
  }
</style>
</head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#f7f5f0">
<table class="wrap" width="600" cellpadding="0" cellspacing="0" border="0">

<!-- HEADER -->
<tr><td class="header" align="center">
  <img src="https://i.imgur.com/placeholder-logo.png" alt="Moon Hands" width="72" height="72" style="display:block;margin:0 auto 20px;">
  <h1>Moon Hands</h1>
  <p class="tagline">by Pixel Vault Pte Ltd</p>
</td></tr>

<!-- BODY -->
<tr><td class="body">

  <p class="greeting">Welcome, ${contactName || 'there'}</p>
  <p class="subgreeting">${aiName} has officially joined ${clinicName}. From this moment, every patient enquiry, every booking request, and every after-hours message is handled with care — around the clock.</p>

  <div class="plan-box">
    <p><strong>Your Plan:</strong> ${planLabel} &nbsp;|&nbsp; <strong>Investment:</strong> S$${monthlyPrice} monthly</p>
  </div>

  <div class="divider"></div>

  <h3>Getting Started</h3>

  <div class="step">
    <div class="step-num">1</div>
    <div class="step-body">
      <h4>Share Your WhatsApp Number</h4>
      <p>Add your WhatsApp Business number to your website, Instagram bio, and Google Business Profile. Patients can now reach ${aiName} at any hour — including while you rest.</p>
    </div>
  </div>

  <div class="step">
    <div class="step-num">2</div>
    <div class="step-body">
      <h4>Enable Booking Alerts</h4>
      <p>Download Telegram and search for <strong>@MoonHandsBot</strong>. Send <code>/start</code> to receive instant, discreet alerts for every new appointment. You remain in control — ${aiName} handles the conversation, you approve the bookings.</p>
    </div>
  </div>

  <div class="step">
    <div class="step-num">3</div>
    <div class="step-body">
      <h4>Sync Your Calendar</h4>
      <p>All confirmed bookings flow directly into your calendar through a private iCal feed. Simply add this link to your preferred calendar app:</p>
      <p style="margin-top:6px;"><code>${iCalUrl}</code></p>
    </div>
  </div>

  <div class="step">
    <div class="step-num">4</div>
    <div class="step-body">
      <h4>Send a Test Message</h4>
      <p>Message your clinic's WhatsApp number with "Hi" and watch ${aiName} respond with your personalised greeting and treatment menu. This is how your patients will experience it.</p>
    </div>
  </div>

  <div class="divider"></div>

  <h3>What ${aiName} Handles For You</h3>
  <ul class="capabilities">
    <li>Responds to treatment enquiries with warmth and accuracy, 24 hours a day</li>
    <li>Books, reschedules, and cancels appointments without lifting a finger</li>
    <li>Sends immediate confirmations to patients — no follow-up calls needed</li>
    <li>Captures leads after hours while your clinic sleeps</li>
    <li>Communicates in English, Mandarin, and Malay — matching your patient's language</li>
  </ul>

  <div class="closing">
    <p>Should you need anything at all — a tweak to ${aiName}'s tone, a change to your services, or simply a question — reply to this email or message us directly. We are here for you.</p>
    <p style="margin-top:12px; color:#1a1a1a; font-weight:500;">— The Pixel Vault Team</p>
  </div>

</td></tr>

<!-- FOOTER -->
<tr><td class="footer">
  <p>Pixel Vault Pte Ltd &nbsp;·&nbsp; Moon Hands by Pixel Vault</p>
  <p><a href="https://moonhands.io">moonhands.io</a> &nbsp;·&nbsp; <a href="mailto:hello@pixelvault.sg">hello@pixelvault.sg</a></p>
  <p class="fineprint">You received this email because you signed up for Moon Hands. We respect your privacy.</p>
</td></tr>

</table>
</td></tr></table>
</body>
</html>`;

  const text = `Welcome to Moon Hands, ${contactName || 'there'}!

${aiName} has officially joined ${clinicName}. Every patient enquiry, booking request, and after-hours message is now handled with care — around the clock.

YOUR PLAN: ${planLabel} (S$${monthlyPrice}/mo)

GETTING STARTED:

1. Share Your WhatsApp Number
   Add your WhatsApp Business number to your website, Instagram bio, and Google Business Profile. Patients can reach ${aiName} at any hour.

2. Enable Booking Alerts
   Download Telegram, search @MoonHandsBot, send /start for instant booking alerts.

3. Sync Your Calendar
   iCal feed: ${iCalUrl}

4. Send a Test Message
   Message your clinic's WhatsApp number with "Hi" and watch ${aiName} respond.

WHAT ${aiName.toUpperCase()} HANDLES:
• Responds to treatment enquiries 24/7
• Books, reschedules, cancels appointments
• Sends instant confirmations to patients
• Captures leads after hours
• Communicates in English, Mandarin, Malay

Need anything? Reply to this email or message us directly.

— The Pixel Vault Team
Pixel Vault Pte Ltd · Moon Hands by Pixel Vault
hello@pixelvault.sg · moonhands.io`;

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
