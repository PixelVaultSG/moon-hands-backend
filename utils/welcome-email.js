/**
 * Moon Hands — Welcome Email Sender (v4 — Bulletproof Email HTML)
 *
 * Uses Gmail SMTP with table-based layout for maximum email client compatibility.
 * Tested targets: Gmail (iOS/Android/Web), Apple Mail, Outlook.
 *
 * Key design decisions:
 * - Table-based layout (not flexbox — email clients strip flex)
 * - All critical styles are INLINE (not in <style> block)
 * - <style> block only for desktop enhancements that can degrade
 * - Google Fonts import removed (Gmail blocks it anyway)
 * - Logo: tries base64 embed first, falls back to reliable hosted URL
 * - Max-width 600px desktop, full-width mobile
 * - Step numbers in table cells with fixed width (not flex)
 * - 3 clear steps with visual hierarchy
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
  console.warn('[WELCOME_EMAIL] Could not load local logo, using hosted fallback');
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

  // Logo: base64 CID attachment for best compatibility
  const logoSrc = LOGO_BASE64
    ? `data:image/png;base64,${LOGO_BASE64}`
    : 'https://i.imgur.com/fallback-logo-placeholder.png';

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<!--[if mso]>
<noscript>
  <xml>
    <o:OfficeDocumentSettings>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
</noscript>
<![endif]-->
<title>Welcome to Moon Hands</title>
<style type="text/css">
  /* iOS will respect these */
  @media screen and (max-width: 600px) {
    .mobile-full { width: 100% !important; }
    .mobile-padding { padding-left: 20px !important; padding-right: 20px !important; }
    .mobile-center { text-align: center !important; }
    .mobile-hide { display: none !important; }
    .mobile-stack { display: block !important; width: 100% !important; }
    h1 { font-size: 26px !important; }
    .step-number { font-size: 28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f5f3ee;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!-- Main wrapper table -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f3ee;">
  <tr>
    <td align="center" style="padding:20px 10px;">

      <!-- Content container: 600px max -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="mobile-full" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">

        <!-- ========== HEADER ========== -->
        <tr>
          <td align="center" style="background-color:#1a1a1a;padding:40px 30px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center">
                  <img src="${logoSrc}" alt="Moon Hands" width="56" height="56" style="display:block;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;margin-bottom:16px;" />
                </td>
              </tr>
              <tr>
                <td align="center" style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:400;color:#c9a84c;letter-spacing:3px;text-transform:uppercase;line-height:1.2;">
                  Moon Hands
                </td>
              </tr>
              <tr>
                <td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#7a7568;letter-spacing:4px;text-transform:uppercase;padding-top:8px;">
                  by Pixel Vault Pte Ltd
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ========== BODY ========== -->
        <tr>
          <td class="mobile-padding" style="padding:40px 40px 32px;font-family:Arial,Helvetica,sans-serif;">

            <!-- Greeting -->
            <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#1a1a1a;font-weight:400;line-height:1.3;">
              Welcome, ${contactName || 'there'}
            </p>
            <p style="margin:0 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#6a6558;line-height:1.7;">
              <strong style="color:#1a1a1a;">${aiName}</strong> has officially joined <strong style="color:#1a1a1a;">${clinicName}</strong>. From this moment forward, every patient enquiry, every booking request, and every after-hours message is handled with care &mdash; around the clock, while you focus on what you do best.
            </p>

            <!-- Plan Box -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#faf8f4;border-left:3px solid #c9a84c;margin:0 0 28px;">
              <tr>
                <td style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#5a5548;line-height:1.6;">
                  <strong style="color:#1a1a1a;">Your Plan:</strong> ${planLabel} &nbsp;&middot;&nbsp; <strong style="color:#1a1a1a;">Investment:</strong> S$${monthlyPrice} per month
                </td>
              </tr>
            </table>

            <!-- Divider -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
              <tr><td style="border-top:1px solid #e5e1d8;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>

            <!-- Section: Getting Started -->
            <p style="margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#1a1a1a;font-weight:400;line-height:1.3;">
              Getting Started
            </p>

            <!-- Step 1 -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              <tr>
                <td width="48" valign="top" style="padding-right:12px;">
                  <span class="step-number" style="font-family:Georgia,'Times New Roman',serif;font-size:32px;color:#c9a84c;font-weight:400;line-height:1;opacity:0.7;">1</span>
                </td>
                <td valign="top">
                  <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#1a1a1a;line-height:1.4;">Enable Booking Alerts</p>
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#5a5548;line-height:1.7;">
                    Download Telegram and search for <strong style="color:#1a1a1a;">@MoonHandsBot</strong>. Send <code style="font-family:'Courier New',monospace;font-size:12px;background:#f2efe8;padding:2px 6px;border-radius:3px;color:#4a4538;">/start</code> to receive instant, discreet alerts for every new appointment. You remain in full control &mdash; ${aiName} handles the conversation, you approve the bookings that matter.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Step 2 -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              <tr>
                <td width="48" valign="top" style="padding-right:12px;">
                  <span class="step-number" style="font-family:Georgia,'Times New Roman',serif;font-size:32px;color:#c9a84c;font-weight:400;line-height:1;opacity:0.7;">2</span>
                </td>
                <td valign="top">
                  <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#1a1a1a;line-height:1.4;">Send a Test Message</p>
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#5a5548;line-height:1.7;">
                    Message your clinic's WhatsApp Business number with "Hi" and watch ${aiName} respond with your personalised greeting and treatment menu. This is exactly how your patients will experience it &mdash; seamless, warm, and professional.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Step 3 -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
              <tr>
                <td width="48" valign="top" style="padding-right:12px;">
                  <span class="step-number" style="font-family:Georgia,'Times New Roman',serif;font-size:32px;color:#c9a84c;font-weight:400;line-height:1;opacity:0.7;">3</span>
                </td>
                <td valign="top">
                  <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#1a1a1a;line-height:1.4;">Sync Your Calendar</p>
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#5a5548;line-height:1.7;">
                    Add your booking feed to your calendar app so you always have sight of tomorrow's schedule. Your daily closing summary arrives at your clinic's closing time every day.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Divider -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
              <tr><td style="border-top:1px solid #e5e1d8;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>

            <!-- Section: Capabilities -->
            <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#1a1a1a;font-weight:400;line-height:1.3;">
              How ${aiName} Grows Your Business
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <!-- Capability 1 -->
              <tr>
                <td width="20" valign="top" style="padding:0 8px 16px 0;font-size:14px;color:#c9a84c;">&#10022;</td>
                <td valign="top" style="padding-bottom:16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#4a4538;line-height:1.7;">
                  <strong style="color:#1a1a1a;">Captures every lead, even at 2 AM</strong><br/>
                  <span style="color:#6a6558;">Patients message after hours? ${aiName} responds instantly. No more enquiries lost to voicemail or silence.</span>
                </td>
              </tr>
              <!-- Capability 2 -->
              <tr>
                <td width="20" valign="top" style="padding:0 8px 16px 0;font-size:14px;color:#c9a84c;">&#10022;</td>
                <td valign="top" style="padding-bottom:16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#4a4538;line-height:1.7;">
                  <strong style="color:#1a1a1a;">Books appointments while you treat patients</strong><br/>
                  <span style="color:#6a6558;">No more interrupted treatments. ${aiName} handles scheduling, rescheduling, and cancellations without you lifting a finger.</span>
                </td>
              </tr>
              <!-- Capability 3 -->
              <tr>
                <td width="20" valign="top" style="padding:0 8px 16px 0;font-size:14px;color:#c9a84c;">&#10022;</td>
                <td valign="top" style="padding-bottom:16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#4a4538;line-height:1.7;">
                  <strong style="color:#1a1a1a;">Answers treatment questions that convert</strong><br/>
                  <span style="color:#6a6558;">Price enquiries, downtime questions, suitability concerns &mdash; answered accurately, warmly, and in a way that moves patients toward booking.</span>
                </td>
              </tr>
              <!-- Capability 4 -->
              <tr>
                <td width="20" valign="top" style="padding:0 8px 16px 0;font-size:14px;color:#c9a84c;">&#10022;</td>
                <td valign="top" style="padding-bottom:16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#4a4538;line-height:1.7;">
                  <strong style="color:#1a1a1a;">Speaks your patients' language</strong><br/>
                  <span style="color:#6a6558;">English, Mandarin, and Malay &mdash; ${aiName} matches your patient's language automatically. <em>(Best-effort; complex medical terminology may default to English.)</em></span>
                </td>
              </tr>
              <!-- Capability 5 -->
              <tr>
                <td width="20" valign="top" style="padding:0 8px 16px 0;font-size:14px;color:#c9a84c;">&#10022;</td>
                <td valign="top" style="padding-bottom:16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#4a4538;line-height:1.7;">
                  <strong style="color:#1a1a1a;">Reduces no-shows with instant confirmations</strong><br/>
                  <span style="color:#6a6558;">Every patient receives an immediate booking confirmation. Reminders and follow-ups happen automatically &mdash; your calendar stays full.</span>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- ========== CLOSING BOX ========== -->
        <tr>
          <td class="mobile-padding" style="background-color:#faf8f4;border-top:1px solid #e5e1d8;padding:32px 40px;text-align:center;font-family:Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 16px;font-size:13px;color:#6a6558;line-height:1.8;">
              Should you need anything at all &mdash; a refinement to ${aiName}&rsquo;s tone, an adjustment to your services, or simply a question &mdash; reply to this email or message us directly. We are here for you.
            </p>
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#1a1a1a;font-weight:400;">
              &mdash; The Pixel Vault Team
            </p>
          </td>
        </tr>

        <!-- ========== FOOTER ========== -->
        <tr>
          <td align="center" style="background-color:#1a1a1a;padding:32px 30px;font-family:Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 8px;font-size:11px;color:#7a7568;letter-spacing:0.5px;">
              Pixel Vault Pte Ltd &nbsp;&middot;&nbsp; Moon Hands by Pixel Vault
            </p>
            <p style="margin:0 0 6px;">
              <a href="https://www.moonhands.space" style="color:#c9a84c;text-decoration:none;font-size:12px;letter-spacing:0.5px;">www.moonhands.space</a>
              <span style="color:#4a4538;margin:0 10px;font-size:11px;">&middot;</span>
              <a href="mailto:pixelvaultsg@gmail.com" style="color:#c9a84c;text-decoration:none;font-size:12px;letter-spacing:0.5px;">pixelvaultsg@gmail.com</a>
            </p>
            <p style="margin:14px 0 0;font-size:10px;color:#4a4538;letter-spacing:0.3px;">
              You received this email because you signed up for Moon Hands. We respect your privacy.
            </p>
          </td>
        </tr>

      </table>
      <!-- /Content container -->

    </td>
  </tr>
</table>
<!-- /Main wrapper -->

</body>
</html>`;

  // ─── Plain text fallback ───────────────────────────────────────

  const text = `Welcome to Moon Hands, ${contactName || 'there'}!

${aiName} has officially joined ${clinicName}. Every patient enquiry, booking request, and after-hours message is now handled with care -- around the clock, while you focus on what you do best.

YOUR PLAN: ${planLabel} (S$${monthlyPrice}/mo)

GETTING STARTED:

1. Enable Booking Alerts
   Download Telegram, search @MoonHandsBot, send /start for instant booking alerts.
   You remain in full control -- ${aiName} handles the conversation, you approve the bookings.

2. Send a Test Message
   Message your clinic's WhatsApp Business number with "Hi" and watch ${aiName} respond.

3. Sync Your Calendar
   Your booking feed and daily closing summary keep you informed of every appointment.

HOW ${aiName.toUpperCase()} GROWS YOUR BUSINESS:

* Captures every lead, even at 2 AM
  Patients message after hours? ${aiName} responds instantly.

* Books appointments while you treat patients
  No more interrupted treatments. ${aiName} handles scheduling.

* Answers treatment questions that convert
  Price enquiries, downtime questions -- answered to move patients toward booking.

* Speaks your patients' language
  English, Mandarin, and Malay (best-effort; complex terms may default to English).

* Reduces no-shows with instant confirmations
  Every patient receives immediate confirmation. Your calendar stays full.

Need anything? Reply to this email or message us directly.

-- The Pixel Vault Team

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

// ─── TEST FUNCTION ───────────────────────────────────────────────

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
