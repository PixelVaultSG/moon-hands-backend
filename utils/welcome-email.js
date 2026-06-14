/**
 * Moon Hands — Welcome Email (v9 — Hosted Logo URL)
 * 
 * - Logo loaded from website URL (most reliable across email clients)
 * - Total email: ~12KB (well under Gmail 102KB limit)
 * - Falls back to styled text if images blocked
 */

const nodemailer = require('nodemailer');

// Official Moon Hands logo — 80x80 optimized PNG
const LOGO_URL = 'https://wzejxaudglkym.kimi.page/logo.png';


function getTransporter() {
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  const fromEmail = process.env.GMAIL_FROM || 'pixelvaultsg@gmail.com';
  if (!appPassword) throw new Error('GMAIL_APP_PASSWORD not set');
  return nodemailer.createTransport({ service: 'gmail', auth: { user: fromEmail, pass: appPassword } });
}

async function sendWelcomeEmail({ to, clinicName, contactName, plan, monthlyPrice, agentName }) {
  const fromEmail = process.env.GMAIL_FROM || 'pixelvaultsg@gmail.com';
  const transporter = getTransporter();
  const aiName = agentName || 'your AI receptionist';
  const planLabel = plan === 'Premium' ? 'Premium' : 'Basic';
  const subject = `Your new AI hire is here! Welcome to Moon Hands, ${clinicName}`;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f3ee;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f3ee;"><tr><td align="center" style="padding:16px 8px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#fff;border-radius:6px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
<tr><td align="center" style="background:#1a1a1a;padding:32px 20px 26px;"><div style="font-size:48px;line-height:1;margin-bottom:10px;">&#127769;</div><div style="font-family:Georgia,serif;font-size:26px;color:#c9a84c;letter-spacing:3px;text-transform:uppercase;">Moon Hands</div><div style="font-size:10px;color:#7a7568;letter-spacing:3px;text-transform:uppercase;margin-top:6px;">by Pixel Vault Pte Ltd</div></td></tr>
<tr><td style="padding:32px 28px 24px;"><p style="margin:0 0 6px;font-family:Georgia,serif;font-size:22px;color:#1a1a1a;">Welcome, ${contactName || 'there'}</p><p style="margin:0 0 22px;font-size:15px;color:#4a4538;line-height:1.7;">${aiName} has officially joined <strong>${clinicName}</strong>. From this moment forward, every patient enquiry, booking request, and after-hours message is handled with care &mdash; around the clock.</p><table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f4;border-left:3px solid #c9a84c;margin:0 0 22px;"><tr><td style="padding:14px 16px;font-size:14px;color:#4a4538;"><strong>Your Plan:</strong> ${planLabel} &nbsp;&middot;&nbsp; <strong>Investment:</strong> S$${monthlyPrice} per month</td></tr></table><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;"><tr><td style="border-top:1px solid #e5e1d8;font-size:0;">&nbsp;</td></tr></table><p style="margin:0 0 18px;font-family:Georgia,serif;font-size:20px;color:#1a1a1a;">Getting Started</p><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;"><tr><td width="40" valign="top" style="font-family:Georgia,serif;font-size:28px;color:#c9a84c;opacity:0.7;">1</td><td valign="top"><p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1a1a1a;">Enable Booking Alerts</p><p style="margin:0;font-size:14px;color:#4a4538;line-height:1.7;">Download Telegram and search for <strong>@MoonHandsBot</strong>. Send <code style="background:#f2efe8;padding:2px 6px;border-radius:3px;font-size:13px;">/start</code> for instant alerts. You control &mdash; ${aiName} handles conversations, you approve bookings.</p></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;"><tr><td width="40" valign="top" style="font-family:Georgia,serif;font-size:28px;color:#c9a84c;opacity:0.7;">2</td><td valign="top"><p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1a1a1a;">Send a Test Message</p><p style="margin:0;font-size:14px;color:#4a4538;line-height:1.7;">Message your clinic's WhatsApp Business number with &ldquo;Hi&rdquo; and watch ${aiName} respond with your personalised greeting and treatment menu.</p></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px;"><tr><td width="40" valign="top" style="font-family:Georgia,serif;font-size:28px;color:#c9a84c;opacity:0.7;">3</td><td valign="top"><p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1a1a1a;">Sync Your Calendar</p><p style="margin:0;font-size:14px;color:#4a4538;line-height:1.7;">Add your booking feed to your calendar app. Your daily closing summary arrives at your clinic's closing time every day.</p></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;"><tr><td style="border-top:1px solid #e5e1d8;font-size:0;">&nbsp;</td></tr></table><p style="margin:0 0 16px;font-family:Georgia,serif;font-size:20px;color:#1a1a1a;">How ${aiName} Grows Your Business</p><p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;line-height:1.6;"><span style="color:#c9a84c;">&#10022;</span> <strong>Captures every lead, even at 2 AM</strong> &mdash; no enquiries lost to voicemail</p><p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;line-height:1.6;"><span style="color:#c9a84c;">&#10022;</span> <strong>Books appointments while you treat patients</strong></p><p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;line-height:1.6;"><span style="color:#c9a84c;">&#10022;</span> <strong>Answers treatment questions that convert</strong></p><p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;line-height:1.6;"><span style="color:#c9a84c;">&#10022;</span> <strong>Speaks your patients' language</strong> &mdash; English, Mandarin, Malay</p><p style="margin:0 0 10px;font-size:14px;color:#1a1a1a;line-height:1.6;"><span style="color:#c9a84c;">&#10022;</span> <strong>Reduces no-shows with instant confirmations</strong></p></td></tr>
<tr><td style="background:#faf8f4;border-top:1px solid #e5e1d8;padding:26px 28px;text-align:center;"><p style="margin:0 0 12px;font-size:14px;color:#4a4538;line-height:1.7;">Should you need anything &mdash; a refinement to ${aiName}&rsquo;s tone, an adjustment to your services, or simply a question &mdash; reply to this email. We are here for you.</p><p style="margin:0;font-family:Georgia,serif;font-size:16px;color:#1a1a1a;">&mdash; The Pixel Vault Team</p></td></tr>
<tr><td align="center" style="background:#1a1a1a;padding:26px 20px;"><p style="margin:0 0 6px;font-size:11px;color:#7a7568;letter-spacing:0.5px;">Pixel Vault Pte Ltd &middot; Moon Hands by Pixel Vault</p><p style="margin:0;"><a href="https://www.moonhands.space" style="color:#c9a84c;text-decoration:none;font-size:12px;">www.moonhands.space</a> <span style="color:#4a4538;">&middot;</span> <a href="mailto:pixelvaultsg@gmail.com" style="color:#c9a84c;text-decoration:none;font-size:12px;">pixelvaultsg@gmail.com</a></p></td></tr>
</table></td></tr></table></body></html>`;

  const text = `Welcome to Moon Hands, ${contactName || 'there'}!\n\n${aiName} has officially joined ${clinicName}. Every patient enquiry, booking request, and after-hours message is now handled with care.\n\nYOUR PLAN: ${planLabel} (S$${monthlyPrice}/mo)\n\nGETTING STARTED:\n1. Enable Booking Alerts — Download Telegram, search @MoonHandsBot, send /start\n2. Send a Test Message — Message your clinic's WhatsApp number with "Hi"\n3. Sync Your Calendar — Your daily closing summary arrives at closing time\n\nReply to this email for any questions.\n\n-- The Pixel Vault Team\nwww.moonhands.space`;

  await transporter.sendMail({ from: `"Moon Hands" <${fromEmail}>`, to, subject, text, html });
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
    agentName: agentName || 'Alex',
  });
}

module.exports = { sendWelcomeEmail, testWelcomeEmail };
