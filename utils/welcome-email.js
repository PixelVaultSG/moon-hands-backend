/**
 * Moon Hands — Welcome Email Sender
 * 
 * Sends a warm welcome email to newly onboarded clinics using Gmail SMTP.
 * Triggered after clinic profile is reviewed and payment is confirmed.
 * 
 * Setup:
 *   1. Go to https://myaccount.google.com/apppasswords
 *   2. Sign in with Pixel Vault's Gmail (pixelvaultsg@gmail.com)
 *   3. Click in "App name" field → type "Moon Hands Welcome Email"
 *   4. Click "Create"
 *   5. Copy the 16-character app password (remove spaces when pasting)
 *   6. Set as env var: GMAIL_APP_PASSWORD=rllblohsohvpwgrc (no spaces)
 *   7. Set as env var: GMAIL_FROM=pixelvaultsg@gmail.com
 * 
 * Usage:
 *   const { sendWelcomeEmail } = require('./utils/welcome-email');
 *   await sendWelcomeEmail({
 *     to: 'clinic@example.com',
 *     clinicName: 'Glow Aesthetics',
 *     contactName: 'Dr. Tan',
 *     plan: 'Premium',
 *     monthlyPrice: 547,
 *     iCalUrl: 'https://moon-hands-backend.onrender.com/ical/xxxxx.ics',
 *   });
 */

const nodemailer = require('nodemailer');

// ─── TRANSPORT SETUP ─────────────────────────────────────────────

function getTransporter() {
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  const fromEmail = process.env.GMAIL_FROM || 'hello@pixelvault.sg';
  
  if (!appPassword) {
    throw new Error('GMAIL_APP_PASSWORD not set. See setup instructions in welcome-email.js');
  }
  
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: fromEmail,
      pass: appPassword,
    },
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
}) {
  const fromEmail = process.env.GMAIL_FROM || 'hello@pixelvault.sg';
  const transporter = getTransporter();
  
  const subject = `🎉 Your AI Receptionist is Ready — Welcome to Moon Hands, ${clinicName}!`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Moon Hands</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f8f8; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #0F0F0F; padding: 40px 30px; text-align: center; }
    .header h1 { color: #D4AF37; font-size: 24px; margin: 0 0 8px; font-weight: 300; letter-spacing: 2px; }
    .header p { color: #8A7E72; font-size: 13px; margin: 0; }
    .content { padding: 40px 30px; }
    .content h2 { color: #0F0F0F; font-size: 18px; margin: 0 0 16px; font-weight: 500; }
    .content p { color: #555; font-size: 15px; line-height: 1.7; margin: 0 0 16px; }
    .content strong { color: #0F0F0F; }
    .highlight { background: #D4AF37/10; border-left: 3px solid #D4AF37; padding: 16px 20px; margin: 20px 0; background-color: rgba(212,175,55,0.05); }
    .highlight p { margin: 0; font-size: 14px; }
    .steps { margin: 24px 0; }
    .step { display: flex; gap: 16px; margin-bottom: 20px; }
    .step-number { width: 32px; height: 32px; background: #D4AF37; color: #0F0F0F; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; flex-shrink: 0; }
    .step-content h3 { margin: 0 0 4px; font-size: 15px; color: #0F0F0F; }
    .step-content p { margin: 0; font-size: 14px; color: #666; }
    .button { display: inline-block; background: #D4AF37; color: #0F0F0F; padding: 14px 32px; text-decoration: none; border-radius: 4px; font-weight: 500; font-size: 14px; margin: 8px 0; }
    .footer { background: #0F0F0F; padding: 30px; text-align: center; }
    .footer p { color: #8A7E72; font-size: 12px; margin: 0 0 8px; }
    .footer a { color: #D4AF37; text-decoration: none; }
    .divider { height: 1px; background: #eee; margin: 24px 0; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>MOON HANDS</h1>
      <p>by Pixel Vault Pte Ltd</p>
    </div>
    
    <!-- Content -->
    <div class="content">
      <h2>Hi ${contactName || 'there'},</h2>
      <p>Welcome to Moon Hands! Your AI receptionist for <strong>${clinicName}</strong> is now live and ready to handle patient bookings 24/7.</p>
      
      <div class="highlight">
        <p><strong>Your Plan:</strong> ${plan} (S$${monthlyPrice}/mo)<br>
        <strong>Status:</strong> Active ✅</p>
      </div>
      
      <div class="steps">
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-content">
            <h3>Share Your WhatsApp Number</h3>
            <p>Add your WhatsApp Business number to your website, Instagram bio, and Google Business Profile. Patients can now message you anytime.</p>
          </div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-content">
            <h3>Get Booking Notifications</h3>
            <p>Download Telegram and search for <strong>@MoonHandsBot</strong>. Send /start to receive instant alerts for every new booking.</p>
          </div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-content">
            <h3>Sync Your Calendar</h3>
            <p>All bookings sync automatically. Add this iCal feed to your calendar app:</p>
            <p style="word-break: break-all; font-family: monospace; font-size: 12px; background: #f5f5f5; padding: 8px; border-radius: 4px; margin-top: 8px;">${iCalUrl}</p>
          </div>
        </div>
        <div class="step">
          <div class="step-number">4</div>
          <div class="step-content">
            <h3>Test It Out</h3>
            <p>Send "Hi" to your clinic's WhatsApp number. Your AI will respond with your configured greeting and services.</p>
          </div>
        </div>
      </div>
      
      <div class="divider"></div>
      
      <h2>What Your AI Can Do</h2>
      <p>• Answer treatment questions instantly<br>
      • Book, reschedule, and cancel appointments<br>
      • Send confirmations to patients automatically<br>
      • Handle after-hours enquiries 24/7<br>
      • Speak multiple languages (English, Chinese, Malay)</p>
      
      <div class="divider"></div>
      
      <h2>Need Help?</h2>
      <p>Reply to this email or WhatsApp us. We're here to support you.</p>
      <p style="margin-top: 24px;">— The Pixel Vault Team</p>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <p>Pixel Vault Pte Ltd • Moon Hands by Pixel Vault</p>
      <p><a href="https://moonhands.io">moonhands.io</a> • <a href="mailto:hello@pixelvault.sg">hello@pixelvault.sg</a></p>
      <p style="margin-top: 12px; font-size: 11px; color: #555;">You received this email because you signed up for Moon Hands.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `Welcome to Moon Hands, ${contactName || 'there'}!

Your AI receptionist for ${clinicName} is now live and ready to handle patient bookings 24/7.

YOUR PLAN: ${plan} (S$${monthlyPrice}/mo)
STATUS: Active

QUICK START:
1. Share your WhatsApp Business number on your website, Instagram, and Google Business
2. Download Telegram, search @MoonHandsBot, send /start for booking alerts
3. Sync your calendar: ${iCalUrl}
4. Test: Send "Hi" to your WhatsApp number

WHAT YOUR AI CAN DO:
- Answer treatment questions instantly
- Book, reschedule, cancel appointments
- Send automatic confirmations
- Handle after-hours enquiries 24/7
- Speak English, Chinese, Malay

Need help? Reply to this email or WhatsApp us.

— The Pixel Vault Team
Pixel Vault Pte Ltd • Moon Hands by Pixel Vault
hello@pixelvault.sg • moonhands.io`;

  await transporter.sendMail({
    from: `"Moon Hands by Pixel Vault" <${fromEmail}>`,
    to,
    subject,
    text,
    html,
  });
  
  console.log(`[WELCOME_EMAIL] Sent to ${to} for ${clinicName}`);
  return { success: true, to, clinicName };
}

// ─── TEST WELCOME EMAIL ──────────────────────────────────────────

async function testWelcomeEmail(testEmail) {
  return sendWelcomeEmail({
    to: testEmail,
    clinicName: 'Glow Aesthetics Clinic',
    contactName: 'Dr. Sarah Tan',
    plan: 'Premium',
    monthlyPrice: 547,
    iCalUrl: 'https://moon-hands-backend.onrender.com/ical/demo-token.ics',
  });
}

module.exports = { sendWelcomeEmail, testWelcomeEmail };
