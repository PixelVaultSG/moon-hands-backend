/**
 * Moon Hands — Welcome Email Sender (v5 — Gmail-Optimized)
 *
 * Key fixes from v4:
 * - NO base64 images (bloated past Gmail 102KB limit, caused clipping)
 * - Text-only header with emoji moon symbol
 * - Larger font sizes (14px min body, 22px headings)
 * - Clean single-column table layout
 * - Estimated size: ~12KB (well under 102KB Gmail limit)
 * - Tested targets: Gmail web, Gmail iOS app, Apple Mail
 */

const nodemailer = require('nodemailer');

function getTransporter() {
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  const fromEmail = process.env.GMAIL_FROM || 'pixelvaultsg@gmail.com';
  if (!appPassword) throw new Error('GMAIL_APP_PASSWORD not set');
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: fromEmail, pass: appPassword }
  });
}

async function sendWelcomeEmail({ to, clinicName, contactName, plan, monthlyPrice, agentName }) {
  const fromEmail = process.env.GMAIL_FROM || 'pixelvaultsg@gmail.com';
  const transporter = getTransporter();

  const aiName = agentName || 'your AI receptionist';
  const planLabel = plan === 'Premium' ? 'Premium' : 'Basic';
  const subject = `Your new AI hire is here! Welcome to Moon Hands, ${clinicName}`;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Welcome to Moon Hands</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f3ee;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f3ee;">
<tr><td align="center" style="padding:20px 10px;">

<!-- Main container -->
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">

  <!-- HEADER: Dark bar with text-only branding -->
  <tr><td align="center" style="background-color:#1a1a1a;padding:36px 20px 28px;">
    <table cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="font-size:36px;padding-bottom:10px;">&#127769;</td>
      </tr>
      <tr>
        <td align="center" style="font-family:Georgia,serif;font-size:28px;color:#c9a84c;letter-spacing:4px;text-transform:uppercase;font-weight:400;">Moon Hands</td>
      </tr>
      <tr>
        <td align="center" style="font-size:11px;color:#7a7568;letter-spacing:4px;text-transform:uppercase;padding-top:6px;">by Pixel Vault Pte Ltd</td>
      </tr>
    </table>
  </td></tr>

  <!-- BODY -->
  <tr><td style="padding:36px 32px 28px;">

    <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:22px;color:#1a1a1a;">Welcome, ${contactName || 'there'}</p>
    <p style="margin:0 0 24px;font-size:15px;color:#4a4538;line-height:1.7;">${aiName} has officially joined <strong>${clinicName}</strong>. From this moment forward, every patient enquiry, booking request, and after-hours message is handled with care &mdash; around the clock.</p>

    <!-- Plan box -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f4;border-left:3px solid #c9a84c;margin:0 0 24px;">
      <tr><td style="padding:14px 18px;font-size:14px;color:#4a4538;">
        <strong>Your Plan:</strong> ${planLabel} &nbsp;&middot;&nbsp; <strong>Investment:</strong> S$${monthlyPrice} per month
      </td></tr>
    </table>

    <!-- Divider -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="border-top:1px solid #e5e1d8;font-size:0;">&nbsp;</td></tr></table>

    <p style="margin:0 0 20px;font-family:Georgia,serif;font-size:20px;color:#1a1a1a;">Getting Started</p>

    <!-- Step 1 -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
      <tr>
        <td width="44" valign="top" style="padding-right:10px;font-family:Georgia,serif;font-size:30px;color:#c9a84c;opacity:0.7;">1</td>
        <td valign="top">
          <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1a1a1a;">Enable Booking Alerts</p>
          <p style="margin:0;font-size:14px;color:#4a4538;line-height:1.7;">Download Telegram and search for <strong>@MoonHandsBot</strong>. Send <code style="background:#f2efe8;padding:2px 6px;border-radius:3px;font-size:13px;">/start</code> for instant alerts. You remain in full control &mdash; ${aiName} handles the conversation, you approve the bookings.</p>
        </td>
      </tr>
    </table>

    <!-- Step 2 -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
      <tr>
        <td width="44" valign="top" style="padding-right:10px;font-family:Georgia,serif;font-size:30px;color:#c9a84c;opacity:0.7;">2</td>
        <td valign="top">
          <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1a1a1a;">Send a Test Message</p>
          <p style="margin:0;font-size:14px;color:#4a4538;line-height:1.7;">Message your clinic's WhatsApp Business number with &ldquo;Hi&rdquo; and watch ${aiName} respond with your personalised greeting and treatment menu.</p>
        </td>
      </tr>
    </table>

    <!-- Step 3 -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td width="44" valign="top" style="padding-right:10px;font-family:Georgia,serif;font-size:30px;color:#c9a84c;opacity:0.7;">3</td>
        <td valign="top">
          <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1a1a1a;">Sync Your Calendar</p>
          <p style="margin:0;font-size:14px;color:#4a4538;line-height:1.7;">Add your booking feed to your calendar app. Your daily closing summary arrives at your clinic's closing time every day.</p>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="border-top:1px solid #e5e1d8;font-size:0;">&nbsp;</td></tr></table>

    <p style="margin:0 0 18px;font-family:Georgia,serif;font-size:20px;color:#1a1a1a;">How ${aiName} Grows Your Business</p>

    <!-- Capabilities -->
    <p style="margin:0 0 12px;font-size:14px;color:#1a1a1a;line-height:1.6;"><span style="color:#c9a84c;">&#10022;</span> <strong>Captures every lead, even at 2 AM</strong> &mdash; no enquiries lost to voicemail</p>
    <p style="margin:0 0 12px;font-size:14px;color:#1a1a1a;line-height:1.6;"><span style="color:#c9a84c;">&#10022;</span> <strong>Books appointments while you treat patients</strong> &mdash; scheduling, rescheduling, cancellations</p>
    <p style="margin:0 0 12px;font-size:14px;color:#1a1a1a;line-height:1.6;"><span style="color:#c9a84c;">&#10022;</span> <strong>Answers treatment questions that convert</strong> &mdash; pricing, downtime, suitability</p>
    <p style="margin:0 0 12px;font-size:14px;color:#1a1a1a;line-height:1.6;"><span style="color:#c9a84c;">&#10022;</span> <strong>Speaks your patients' language</strong> &mdash; English, Mandarin, Malay (best-effort)</p>
    <p style="margin:0 0 12px;font-size:14px;color:#1a1a1a;line-height:1.6;"><span style="color:#c9a84c;">&#10022;</span> <strong>Reduces no-shows with instant confirmations</strong> &mdash; reminders happen automatically</p>

  </td></tr>

  <!-- CLOSING -->
  <tr><td style="background:#faf8f4;border-top:1px solid #e5e1d8;padding:28px 32px;text-align:center;">
    <p style="margin:0 0 14px;font-size:14px;color:#4a4538;line-height:1.7;">Should you need anything at all &mdash; a refinement to ${aiName}&rsquo;s tone, an adjustment to your services, or simply a question &mdash; reply to this email. We are here for you.</p>
    <p style="margin:0;font-family:Georgia,serif;font-size:16px;color:#1a1a1a;">&mdash; The Pixel Vault Team</p>
  </td></tr>

  <!-- FOOTER -->
  <tr><td align="center" style="background:#1a1a1a;padding:28px 20px;">
    <p style="margin:0 0 6px;font-size:11px;color:#7a7568;letter-spacing:0.5px;">Pixel Vault Pte Ltd &middot; Moon Hands by Pixel Vault</p>
    <p style="margin:0;"><a href="https://www.moonhands.space" style="color:#c9a84c;text-decoration:none;font-size:12px;">www.moonhands.space</a> <span style="color:#4a4538;">&middot;</span> <a href="mailto:pixelvaultsg@gmail.com" style="color:#c9a84c;text-decoration:none;font-size:12px;">pixelvaultsg@gmail.com</a></p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `Welcome to Moon Hands, ${contactName || 'there'}!

${aiName} has officially joined ${clinicName}. Every patient enquiry, booking request, and after-hours message is now handled with care -- around the clock.

YOUR PLAN: ${planLabel} (S$${monthlyPrice}/mo)

GETTING STARTED:

1. Enable Booking Alerts
   Download Telegram, search @MoonHandsBot, send /start for instant booking alerts.

2. Send a Test Message
   Message your clinic's WhatsApp Business number with "Hi" and watch ${aiName} respond.

3. Sync Your Calendar
   Your daily closing summary arrives at your clinic's closing time every day.

HOW ${aiName.toUpperCase()} GROWS YOUR BUSINESS:

* Captures every lead, even at 2 AM
* Books appointments while you treat patients
* Answers treatment questions that convert
* Speaks your patients' language
* Reduces no-shows with instant confirmations

Need anything? Reply to this email.

-- The Pixel Vault Team
www.moonhands.space`;

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
