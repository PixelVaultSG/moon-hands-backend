/**
 * STAFF TAKEOVER SYSTEM — Prevents bot↔staff conflict
 * 
 * Problem: When clinic staff manually replies to a patient via their WhatsApp Business app
 * or WhatsApp Business, the bot also auto-replies, causing conflicting messages.
 * 
 * Solution: 3-layer detection + control
 *   Layer 1: TELEGRAM COMMAND — Staff explicitly pauses/resumes bot per patient
 *   Layer 2: AUTO-DETECTION — Bot pauses itself on complaints/human_handoff
 *   Layer 3: AUTO-RESUME — Bot resumes after 30min of staff inactivity
 * 
 * Architecture:
 *   - In-memory state map (fast, no DB latency): { patientPhone → { status, pausedAt, staffChatId, reason } }
 *   - Checked BEFORE every AI response (webhook.js Layer 9.5)
 *   - Telegram commands: /pause, /resume, /status, /takeover
 *   - Cleanup timer runs every 5 minutes to auto-resume expired pauses
 */

// ─── STATE MANAGEMENT ────────────────────────────────────────────

// Format: { patientPhone: { status: 'bot_active'|'staff_active'|'auto_paused', pausedAt: timestamp, staffChatId: string, reason: string, clinicId: string } }
const takeoverState = new Map();

// ─── RESUME TIMESTAMP TRACKING ───────────────────────────────────
// When a bot is resumed, any patient message timestamped BEFORE the
// resume moment is STALE (it was already seen — and deliberately not
// answered — while the staff had the conversation paused).
// 360dialog/WhatsApp may redeliver such messages; answering them after
// resume floods the patient with out-of-context replies. webhook.js
// checks getResumeTimestamp() and silently drops stale messages.
const resumeTimestamps = new Map(); // patientPhone → resume time (ms)
const RESUME_GUARD_TTL_MS = 24 * 60 * 60 * 1000; // keep guard for 24h

function markResumed(patientPhone) {
  resumeTimestamps.set(patientPhone, Date.now());
}

function getResumeTimestamp(patientPhone) {
  const ts = resumeTimestamps.get(patientPhone);
  if (!ts) return null;
  if (Date.now() - ts > RESUME_GUARD_TTL_MS) {
    resumeTimestamps.delete(patientPhone);
    return null;
  }
  return ts;
}

const AUTO_RESUME_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Run cleanup every 5 minutes

/**
 * Check if bot should be silent for this patient.
 * Called from webhook.js BEFORE routing to AI.
 */
function isStaffActive(patientPhone) {
  const state = takeoverState.get(patientPhone);
  if (!state) return { active: false };
  
  // Auto-resume check: if paused too long, silently resume
  if (state.status !== 'bot_active') {
    const elapsed = Date.now() - state.pausedAt;
    if (elapsed > AUTO_RESUME_MS) {
      console.log(`[STAFF_TAKEOVER] Auto-resumed ${patientPhone.slice(-4)} after ${Math.round(elapsed/60000)}min`);
      markResumed(patientPhone);
      state.status = 'bot_active';
      takeoverState.delete(patientPhone);
      return { active: false, wasResumed: true };
    }
  }
  
  return { 
    active: state.status !== 'bot_active',
    status: state.status,
    reason: state.reason,
    pausedAt: state.pausedAt,
    staffChatId: state.staffChatId
  };
}

/**
 * Pause bot for a patient. Called from:
 * - Telegram /pause command (explicit staff action)
 * - Auto-detection after complaint/human_handoff intent
 */
function pauseBot(patientPhone, staffChatId, reason = 'staff_takeover', clinicId = null) {
  const existing = takeoverState.get(patientPhone);
  
  takeoverState.set(patientPhone, {
    status: 'staff_active',
    pausedAt: Date.now(),
    staffChatId: staffChatId || existing?.staffChatId || null,
    reason,
    clinicId: clinicId || existing?.clinicId || null
  });
  
  console.log(`[STAFF_TAKEOVER] PAUSED ${patientPhone.slice(-4)} | reason: ${reason} | by: ${staffChatId?.slice(-4) || 'auto'}`);
  return { success: true, patientPhone: patientPhone.slice(-4), reason };
}

/**
 * Resume bot for a patient. Called from:
 * - Telegram /resume command (explicit staff action)
 * - Auto-resume after timeout
 */
function resumeBot(patientPhone) {
  const existing = takeoverState.get(patientPhone);
  if (!existing) {
    return { success: false, error: 'Patient was not paused' };
  }

  markResumed(patientPhone);
  takeoverState.delete(patientPhone);
  console.log(`[STAFF_TAKEOVER] RESUMED ${patientPhone.slice(-4)}`);
  return { success: true, patientPhone: patientPhone.slice(-4), wasPausedFor: Date.now() - existing.pausedAt };
}

/**
 * Auto-detect situations where bot should pause itself.
 * Called after intent matching but before sending response.
 * Returns true if bot should auto-pause.
 */
function shouldAutoPause(intent, patientPhone, clinicId) {
  // Auto-pause on: complaint, human_handoff, or emotional distress signals
  const autoPauseIntents = ['complaint', 'human_handoff'];
  if (autoPauseIntents.includes(intent)) {
    pauseBot(patientPhone, null, `auto_${intent}`, clinicId);
    return true;
  }
  return false;
}

/**
 * Get all currently paused conversations for a clinic.
 * Used by /status Telegram command.
 */
function getPausedConversations(clinicId = null) {
  const results = [];
  for (const [phone, state] of takeoverState) {
    if (clinicId && state.clinicId !== clinicId) continue;
    if (state.status !== 'bot_active') {
      const elapsedMin = Math.round((Date.now() - state.pausedAt) / 60000);
      const remainingMin = Math.max(0, Math.round((AUTO_RESUME_MS - (Date.now() - state.pausedAt)) / 60000));
      results.push({
        patientPhone: phone,
        patientPhoneShort: phone.slice(-4),
        status: state.status,
        reason: state.reason,
        pausedAt: new Date(state.pausedAt).toISOString(),
        elapsedMinutes: elapsedMin,
        autoResumeInMinutes: remainingMin,
        staffChatId: state.staffChatId
      });
    }
  }
  return results.sort((a, b) => b.elapsedMinutes - a.elapsedMinutes); // Most recent first
}

/**
 * Cleanup: Auto-resume conversations that have been paused too long.
 * Runs every CLEANUP_INTERVAL_MS.
 */
function cleanupExpiredPauses() {
  let resumed = 0;
  for (const [phone, state] of takeoverState) {
    if (state.status !== 'bot_active') {
      const elapsed = Date.now() - state.pausedAt;
      if (elapsed > AUTO_RESUME_MS) {
        markResumed(phone);
        takeoverState.delete(phone);
        resumed++;
        console.log(`[STAFF_TAKEOVER] Cleanup auto-resumed ${phone.slice(-4)} (${Math.round(elapsed/60000)}min)`);
      }
    }
  }
  if (resumed > 0) {
    console.log(`[STAFF_TAKEOVER] Cleanup: auto-resumed ${resumed} conversation(s)`);
  }
  return resumed;
}

// Start the cleanup timer
setInterval(cleanupExpiredPauses, CLEANUP_INTERVAL_MS);
console.log(`[STAFF_TAKEOVER] System active. Auto-resume: ${AUTO_RESUME_MS/60000}min. Cleanup every ${CLEANUP_INTERVAL_MS/60000}min.`);

// ─── TELEGRAM COMMAND HANDLERS ───────────────────────────────────

/**
 * Handle /pause <phone> command from Telegram
 */
async function handlePauseCommand(bot, chatId, text, clinicId) {
  const match = text.match(/\/pause\s+(\+?\d+)/);
  if (!match) {
    return bot.sendMessage(chatId, '❌ Usage: /pause <phone_number>\nExample: /pause +6581234567', { parse_mode: 'Markdown' });
  }
  
  const phone = match[1].startsWith('+') ? match[1] : '+' + match[1];
  const result = pauseBot(phone, chatId.toString(), 'staff_command', clinicId);
  
  if (result.success) {
    await bot.sendMessage(chatId, 
      `🔇 *Bot paused for ${phone.slice(-4)}*\n\n` +
      `The bot will NOT auto-reply to this patient.\n` +
      `You can now reply manually from your WhatsApp Business app (same WABA number your patients message).\n\n` +
      `Auto-resumes in 30 minutes, or tap below:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '▶️ Resume Bot', callback_data: `resume:${phone}` }
          ]]
        }
      }
    );
  }
}

/**
 * Handle /resume <phone> command from Telegram
 */
async function handleResumeCommand(bot, chatId, text) {
  const match = text.match(/\/resume\s+(\+?\d+)/);
  if (!match) {
    return bot.sendMessage(chatId, '❌ Usage: /resume <phone_number>\nExample: /resume +6581234567', { parse_mode: 'Markdown' });
  }
  
  const phone = match[1].startsWith('+') ? match[1] : '+' + match[1];
  const result = resumeBot(phone);
  
  if (result.success) {
    await bot.sendMessage(chatId,
      `🔊 *Bot resumed for ${result.patientPhone}*\n\n` +
      `The bot will now auto-reply to this patient again.`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await bot.sendMessage(chatId, `⚠️ ${result.error}`);
  }
}

/**
 * Handle /status command from Telegram
 */
async function handleStatusCommand(bot, chatId, clinicId) {
  const paused = getPausedConversations(clinicId);
  
  if (paused.length === 0) {
    return bot.sendMessage(chatId, 
      '✅ *No paused conversations*\n\n' +
      'The bot is actively handling all patient messages.',
      { parse_mode: 'Markdown' }
    );
  }
  
  let msg = `🔇 *${paused.length} paused conversation(s)*\n\n`;
  const inlineKeyboard = [];
  
  paused.forEach((p, i) => {
    const reasonEmoji = p.reason.includes('complaint') ? '😠' : p.reason.includes('human') ? '👤' : '🔇';
    msg += `${i+1}. *${p.patientPhoneShort}* ${reasonEmoji} — ${p.elapsedMinutes}min ago\n`;
    // One resume button per patient — staff just taps, no typing needed
    inlineKeyboard.push([
      { text: `▶️ Resume ${p.patientPhoneShort}`, callback_data: `resume:${p.patientPhone}` }
    ]);
  });
  
  msg += `\nTap a button below to resume, or they'll auto-resume in 30min.`;
  await bot.sendMessage(chatId, msg, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: inlineKeyboard }
  });
}

/**
 * Handle /takeover <phone> command — alias for /pause that also sends a notification
 */
async function handleTakeoverCommand(bot, chatId, text, clinicId) {
  const match = text.match(/\/takeover\s+(\+?\d+)/);
  if (!match) {
    return bot.sendMessage(chatId, '❌ Usage: /takeover <phone_number>\nExample: /takeover +6581234567', { parse_mode: 'Markdown' });
  }
  
  const phone = match[1].startsWith('+') ? match[1] : '+' + match[1];
  pauseBot(phone, chatId.toString(), 'staff_takeover', clinicId);
  
  await bot.sendMessage(chatId,
    `👋 *You have taken over the conversation with ${phone.slice(-4)}*\n\n` +
    `The bot will stay completely silent.\n` +
    `Reply to the patient from your WhatsApp Business app (same WABA number).\n\n` +
    `When you're done, tap below or send /resume ${phone}:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '▶️ Resume Bot', callback_data: `resume:${phone}` }
        ]]
      }
    }
  );
}

// ─── WABA STAFF NOTIFICATION ─────────────────────────────────────
// When the bot auto-pauses (escalation, complaint, human_request),
// send a WhatsApp notification to clinic staff so they can take over.
//
// Staff must configure their WhatsApp number in client config:
//   notification_settings.staff_whatsapp = "+658XXXXXXX"
//
// The notification is sent FROM the bot's WABA number TO the staff.

async function notifyStaffViaWhatsApp(staffPhone, patientPhone, reason, clinicName) {
  if (!staffPhone) return { success: false, error: 'No staff WhatsApp configured' };
  
  const D360_KEY = process.env.D360_API_KEY;
  if (!D360_KEY) return { success: false, error: 'No D360 API key' };
  
  const ENDPOINT = process.env.D360_API_URL || 'https://waba-v2.360dialog.io/messages';
  
  const reasonText = reason === 'complaint' 
    ? 'A patient has raised a complaint and may need personal attention.'
    : reason === 'human_request'
    ? 'A patient has explicitly requested to speak with a staff member.'
    : 'The conversation has been escalated for manual handling.';
  
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: staffPhone,
    type: 'text',
    text: {
      body: `🚨 *Patient Needs Attention*\n\n` +
            `Patient: +${patientPhone.replace(/\D/g, '')}\n` +
            `Clinic: ${clinicName || 'Your Clinic'}\n\n` +
            `${reasonText}\n\n` +
            `The bot has been *auto-paused* for this patient.\n` +
            `Reply to the patient directly from your WhatsApp Business app to take over the conversation.`
    }
  };
  
  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': D360_KEY
      },
      body: JSON.stringify(body)
    });
    
    if (resp.ok) {
      const data = await resp.json();
      console.log(`[WABA_NOTIFY] Sent to staff ${staffPhone}: ${data.messages?.[0]?.id || 'ok'}`);
      return { success: true, messageId: data.messages?.[0]?.id };
    } else {
      const errText = await resp.text();
      console.error(`[WABA_NOTIFY] Failed: ${resp.status} ${errText.slice(0, 200)}`);
      return { success: false, error: errText };
    }
  } catch (err) {
    console.error(`[WABA_NOTIFY] Network error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ─── EXPORTS ─────────────────────────────────────────────────────

module.exports = {
  isStaffActive,
  pauseBot,
  resumeBot,
  shouldAutoPause,
  getPausedConversations,
  cleanupExpiredPauses,
  getResumeTimestamp,
  markResumed,
  AUTO_RESUME_MS,
  notifyStaffViaWhatsApp,
  // Telegram command handlers
  handlePauseCommand,
  handleResumeCommand,
  handleStatusCommand,
  handleTakeoverCommand
};
