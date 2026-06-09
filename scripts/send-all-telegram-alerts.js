/**
 * Moon Hands — Send All Telegram Alert Samples
 * 
 * Run this script to trigger every alert type to your admin Telegram.
 * Usage: node scripts/send-all-telegram-alerts.js
 * 
 * Requires: TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID env vars
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.error('❌ Missing env vars. Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID.');
  process.exit(1);
}

const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ─── SAMPLE DATA ─────────────────────────────────────────────────

const clinic = { name: 'Glow Aesthetics Clinic', id: 'demo-clinic-001' };
const patient = { name: 'Sarah Lim', phone: '+65 ****4567', treatment: 'Botox Consultation' };
const date = '27 May 2026';
const time = '2:00 PM';
const apptId = 'abc123';

// ─── SEND HELPER ─────────────────────────────────────────────────

async function send(text, parseMode = 'Markdown') {
  try {
    const res = await fetch(`${BASE_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text,
        parse_mode: parseMode,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      console.log('✅ Sent');
      return true;
    } else {
      console.error('❌ Failed:', data.description);
      return false;
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  }
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── ALL ALERTS ──────────────────────────────────────────────────

const alerts = [
  // ═══════════════════════════════════════════════════════════════
  // 1. NEW BOOKING — PENDING
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'NEW BOOKING (Pending)',
    text: `✅ *NEW BOOKING*

📅 *Tuesday, ${date} at ${time}*
👤 *${patient.name}*
📱 ${patient.phone}
🩺 ${patient.treatment}
📝 First-time patient

⏳ *Status: Pending your approval*
Reply \`/approve ${apptId}\` to confirm

_Received: ${time}_`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 2. NEW BOOKING — CONFIRMED
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'NEW BOOKING (Auto-Confirmed)',
    text: `✅ *NEW BOOKING*

📅 *Wednesday, 28 May 2026 at 10:00 AM*
👤 *Lisa Tan*
📱 +65 ****7890
🩺 Anti-Aging Treatment

✅ *Status: Confirmed*

_Received: 9:45 AM_`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 3. BOOKING CANCELLED
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'BOOKING CANCELLED',
    text: `❌ *BOOKING CANCELLED*

📅 *Tuesday, ${date} at ${time}*
👤 *${patient.name}*
🩺 ${patient.treatment}
📝 Reason: Patient requested cancellation

_Cancelled at: 2:30 PM_`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 4. BOOKING RESCHEDULED
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'BOOKING RESCHEDULED',
    text: `🔄 *BOOKING RESCHEDULED*

👤 *${patient.name}*
🩺 ${patient.treatment}

*FROM:* Tuesday, 27 May at 2:00 PM
*TO:* Wednesday, 28 May at 10:00 AM

⏳ *Status: Pending your approval*
Reply \`/approve ${apptId}\` to confirm

_Updated: 2:45 PM_`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 5. DAILY CLOSING SUMMARY — With Bookings
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'DAILY CLOSING SUMMARY (With Bookings)',
    text: `📅 *Tomorrow's Schedule — Wednesday, 28 May 2026*
🏥 ${clinic.name}

3 appointments (2 confirmed) (1 pending)

✅ 09:00-09:30 — Sarah — Botox Consultation
✅ 10:00-11:30 — Lisa — Anti-Aging Treatment
⏳ 14:00-14:45 — Alex — Laser Skin Rejuvenation

⏳ Pending bookings need your approval. Reply \`/approve [ID]\` to confirm.

_Have a good evening! 🌙_`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 6. DAILY CLOSING SUMMARY — Empty
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'DAILY CLOSING SUMMARY (Empty)',
    text: `📅 *Tomorrow's Schedule — Thursday, 29 May 2026*
🏥 ${clinic.name}

No bookings scheduled for tomorrow.

_Clinic closing summary — have a good evening!_`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 7. WEEKLY ROUNDUP
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'WEEKLY ROUNDUP',
    text: `📅 *WEEKLY BOOKING ROUNDUP*
🏥 ${clinic.name}
📆 24 May — 31 May 2026

*Total: 8 appointments*
✅ Confirmed: 6
⏳ Pending: 2

*Monday, 26 May*
  ✅ 09:00 — Sarah (Botox Consultation)
  ✅ 10:00 — Lisa (Anti-Aging Treatment)

*Tuesday, 27 May*
  ✅ 14:00 — Alex (Laser Skin Rejuvenation)
  ⏳ 16:00 — Michelle (Hydrating Facial)

*Wednesday, 28 May*
  ✅ 09:00 — James (Dermal Filler)

Reply \`/approveall\` to confirm all pending bookings, or \`/reject [ID]\` to cancel.`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 8. COST ALERT — Primary Limit
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'COST ALERT — Primary Limit',
    text: `⚠️ *COST ALERT*

Clinic ${clinic.id.slice(0, 8)} hit WhatsApp daily limit
Daily daily_whatsapp_msgs limit reached (1000)
Patient ****4567 still received reply (service never blocked).

_Service continues uninterrupted. Clinic notified._`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 9. COST ALERT — Double Limit
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'COST ALERT — Double Limit',
    text: `🚨 *COST ALERT*

Clinic ${clinic.id.slice(0, 8)} hit DOUBLE WhatsApp limit
Daily daily_whatsapp_msgs DOUBLE limit reached (2000)
Patient ****4567 still received reply (service never blocked).

🔴 SECOND ALERT — Pixel Vault staff should contact clinic for overusage discussion and tier upgrade options.`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 10. RATE LIMIT TRIGGERED
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'RATE LIMIT TRIGGERED',
    text: `🚨 *ALERT: Rate Limit Triggered*

Patient ****4567 hit the hourly message limit.
Reason: 30 messages in 1 hour
Action: Graceful response sent to patient.
Time: 3:45 PM

Patient was told: "We've received quite a few messages this hour and our team is catching up. We'll respond to you very soon."`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 11. LOOP DETECTED
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'LOOP DETECTED',
    text: `🚨 *ALERT: Loop Detected*

Source: ****4567
Reason: 10 identical messages in 60 seconds
Action: Loop broken, 30-min silence enforced.

Patient was notified that responses are paused to prevent runaway messages.`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 12. UNAUTHORIZED ACCESS ATTEMPT
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'UNAUTHORIZED ACCESS ATTEMPT',
    text: `🚨 *SECURITY: Unauthorized Access Attempt*

IP: 203.117.x.x
Endpoint: /api/admin
Method: POST
Payload: { "action": "delete_all" }

Blocked. Event logged to audit_log table.
Actor: unknown
Time: 3:52 PM`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 13. DEPLOY ERROR
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'DEPLOY ERROR (Syntax Check Failed)',
    text: `⚠️ *DEPLOY BLOCKED*

Module: ai/conversation-state.js
Error: SyntaxError: Unexpected token '}'
Action: Webhook module NOT loaded to prevent crash.

Fix the error and redeploy.
Render → Manual Deploy → Deploy Latest Commit`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 14. SYSTEM HEALTH — OK
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'SYSTEM HEALTH — OK',
    text: `✅ *System Health OK*

Uptime: 48h 12m
Messages processed: 247
Success rate: 98%
Webhook: Online
AI API: Responsive
Database: Connected

All systems nominal.`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 15. WEBHOOK DOWN
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'WEBHOOK DOWN',
    text: `🚨 *Webhook Module DOWN*

Error: Module failed to load
Uptime before crash: 3h 45m
Last successful message: 4:12 PM

*ACTION REQUIRED:*
1. Check /debug for error details
2. Fix code error
3. Render → Manual Deploy → Deploy Latest Commit`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 16. DEVICE REGISTERED
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'DEVICE REGISTERED',
    text: `✅ *Device Registered*

Device: Master Laptop
ID: a44a931019f2d420
Actor: Master
Status: Trusted

This device will be recognized as "Master" in all audit logs.`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 17. CLINIC ONBOARDED
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'CLINIC ONBOARDED',
    text: `✅ *New Clinic Onboarded*

Clinic: Radiance Medical Aesthetics
Phone: +65 6123 4567
Plan: Premium ($547/mo)
Calendar: Google Calendar connected

Welcome package sent.
AI receptionist is now LIVE.`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 18. CLINIC COST ALERT (what clinic sees)
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'CLINIC COST ALERT (Primary)',
    text: `⚠️ *Cost daily limit reached*

Your clinic has exceeded the daily limit for WhatsApp messages.

*Details:* Daily daily_whatsapp_msgs limit reached (1000)

🟡 This is a friendly heads-up. You're at your plan's daily usage limit. Service continues uninterrupted — no disruption to your patients.

*Questions?* Contact Pixel Vault support.

_This alert is also sent to our operations team._`,
  },

  // ═══════════════════════════════════════════════════════════════
  // 19. CLINIC COST ALERT (Double)
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'CLINIC COST ALERT (Double)',
    text: `🚨 *Cost DOUBLE limit reached*

Your clinic has exceeded the DOUBLE limit for WhatsApp messages.

*Details:* Daily daily_whatsapp_msgs DOUBLE limit reached (2000)

🔴 This is your SECOND alert. Your usage is significantly above your plan. Our team will contact you shortly to discuss your account and options.

*Questions?* Contact Pixel Vault support.

_This alert is also sent to our operations team._`,
  },
];

// ─── MAIN ────────────────────────────────────────────────────────

async function main() {
  console.log(`Sending ${alerts.length} Telegram alerts to ${ADMIN_CHAT_ID}...\n`);

  for (let i = 0; i < alerts.length; i++) {
    const alert = alerts[i];
    const num = String(i + 1).padStart(2, '0');
    process.stdout.write(`${num}. ${alert.name}... `);
    await send(alert.text);
    await wait(500); // 500ms delay between messages
  }

  console.log(`\n✅ All ${alerts.length} alerts sent!`);
}

main().catch(console.error);
