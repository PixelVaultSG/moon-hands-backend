/**
 * MULTI-CLINIC TELEGRAM SENDER
 * 
 * CRITICAL: All clinic-bound notifications MUST go through this module.
 * This is the single point where clinic isolation is enforced.
 * 
 * Rule: Every notification requires a clinicId. Messages are sent to:
 *   1. That clinic's telegram_chat_ids[] (PRIMARY — clinic staff)
 *   2. Moon Hands admin (SECONDARY — Ash gets copy with clinic name)
 * 
 * NEVER send notifications without a clinicId.
 * NEVER send Clinic A's data to Clinic B's chats.
 */

const { supabase } = require('../supabase/client');

// Cache clinic data to avoid repeated DB queries
const clinicCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getClinicTelegramChats(clinicId) {
  if (!clinicId) {
    console.error('[MULTI_CLINIC] ❌ NO clinicId provided — notification BLOCKED');
    return { clinicChats: [], adminChatId: null, clinicName: 'Unknown' };
  }
  
  // Check cache
  const cached = clinicCache.get(clinicId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('telegram_chat_ids, name, slug')
      .eq('id', clinicId)
      .single();
    
    if (!client) {
      // NEVER null the admin fallback: a DB hiccup must not silence
      // notifications entirely — the admin copy is the last line of defense.
      console.error(`[MULTI_CLINIC] ❌ Clinic ${clinicId} not found in DB — falling back to admin-only`);
      return { clinicChats: [], adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || null, clinicName: 'Unknown Clinic' };
    }
    
    const result = {
      clinicChats: client.telegram_chat_ids || [],
      adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || null,
      clinicName: client.name || 'Unknown Clinic'
    };
    
    // Cache result
    clinicCache.set(clinicId, { data: result, timestamp: Date.now() });
    return result;
    
  } catch (err) {
    // NEVER null the admin fallback (see above)
    console.error(`[MULTI_CLINIC] ❌ DB error for clinic ${clinicId}:`, err.message, '— falling back to admin-only');
    return { clinicChats: [], adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || null, clinicName: 'Unknown Clinic' };
  }
}

/**
 * Send notification to clinic staff + admin copy
 * This is the ONLY function that should send clinic-bound Telegram messages.
 * 
 * @param {string} clinicId — REQUIRED. Which clinic this notification belongs to.
 * @param {string} message — The message text (Markdown)
 * @param {object} options — { parseMode, replyMarkup, includeAdmin, adminPrefix }
 * @returns {Promise<{sentTo: number[], adminSent: boolean}>}
 */
async function sendClinicNotification(clinicId, message, options = {}) {
  const {
    parseMode = 'Markdown',
    replyMarkup = null,
    includeAdmin = true,
    adminPrefix = true
  } = options;
  
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[MULTI_CLINIC] ❌ TELEGRAM_BOT_TOKEN not set');
    return { sentTo: [], adminSent: false };
  }
  
  const { clinicChats, adminChatId, clinicName } = await getClinicTelegramChats(clinicId);

  const sentTo = [];

  // Hardened sender: fetch does NOT throw on HTTP errors, so check
  // response.ok explicitly — Telegram rejections (bad chat, parse error,
  // blocked bot) must never be counted as delivered. One retry on failure.
  const sendToChat = async (chatId, text, markup) => {
    const body = {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true
    };
    if (markup) body.reply_markup = markup;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (resp.ok) return { ok: true };
        const errBody = await resp.text().catch(() => '');
        console.error(`[MULTI_CLINIC] ✗ Telegram rejected send to ${chatId} (HTTP ${resp.status}, attempt ${attempt}):`, errBody.substring(0, 300));
      } catch (err) {
        console.error(`[MULTI_CLINIC] ✗ Send to ${chatId} failed (attempt ${attempt}):`, err.message);
      }
      if (attempt === 1) await new Promise(r => setTimeout(r, 1000));
    }
    return { ok: false };
  };

  // 1. Send to clinic's staff (PRIMARY)
  for (const chatId of clinicChats) {
    const r = await sendToChat(chatId, message, replyMarkup);
    if (r.ok) sentTo.push(chatId);
  }
  
  // 2. Send COPY to Moon Hands admin (SECONDARY)
  // If no clinic chats are linked, admin gets buttons as fallback
  const adminNeedsButtons = sentTo.length === 0 && replyMarkup;
  let adminSent = false;
  if (includeAdmin && adminChatId) {
    const adminMessage = adminPrefix
      ? `📋 *[${clinicName}]*\n${message}`
      : message;
    const r = await sendToChat(adminChatId, adminMessage, adminNeedsButtons ? replyMarkup : null);
    adminSent = r.ok;
  }

  // LOUD FAILURE: a notification that reached NOBODY must be queryable,
  // not just a console line on Render. Write a high-severity event.
  if (sentTo.length === 0 && !adminSent) {
    console.error(`[MULTI_CLINIC] 🚨 TOTAL DELIVERY FAILURE | Clinic: ${clinicName} (${clinicId}) | msg: ${message.substring(0, 80)}`);
    try {
      await supabase.from('security_events').insert([{
        severity: 'high',
        category: 'notification_failure',
        service: 'telegram',
        description: `Notification for clinic ${clinicName} (${clinicId}) reached zero recipients`,
        details: { clinic_id: clinicId, clinicChats, adminChatId: adminChatId ? 'set' : 'UNSET', messagePreview: message.substring(0, 200) },
      }]);
    } catch (e) {
      console.error('[MULTI_CLINIC] 🚨 Failed to record notification failure:', e.message);
    }
  }

  console.log(`[MULTI_CLINIC] ✓ Sent to ${sentTo.length} clinic chat(s) + admin: ${adminSent} | Clinic: ${clinicName}`);
  return { sentTo, adminSent };
}

/**
 * Send notification to admin ONLY (internal/system alerts)
 * Use for: errors, security alerts, kill switch — never clinic-specific data
 */
async function sendAdminOnly(message, options = {}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  
  if (!botToken || !adminChatId) {
    console.error('[MULTI_CLINIC] ❌ Cannot send admin-only: missing token or chat ID');
    return false;
  }
  
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChatId,
        text: message,
        parse_mode: options.parseMode || 'Markdown',
        disable_web_page_preview: true
      })
    });
    return true;
  } catch (err) {
    console.error('[MULTI_CLINIC] ✗ Failed to send admin-only:', err.message);
    return false;
  }
}

/**
 * Link a Telegram chat_id to a clinic
 * Called when clinic staff sends /start
 */
async function linkChatToClinic(chatId, clinicId) {
  try {
    // Get current chat_ids
    const { data: client } = await supabase
      .from('clients')
      .select('telegram_chat_ids, name')
      .eq('id', clinicId)
      .single();
    
    if (!client) return { success: false, error: 'Clinic not found' };
    
    const currentIds = client.telegram_chat_ids || [];
    if (currentIds.includes(chatId)) {
      return { success: true, alreadyLinked: true, clinicName: client.name };
    }
    
    // Add new chat_id
    const { error } = await supabase
      .from('clients')
      .update({ telegram_chat_ids: [...currentIds, chatId] })
      .eq('id', clinicId);
    
    if (error) return { success: false, error: error.message };
    
    // Clear cache
    clinicCache.delete(clinicId);
    
    return { success: true, alreadyLinked: false, clinicName: client.name };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Check if a chat_id belongs to a clinic (for authorization)
 */
async function isChatAuthorizedForClinic(chatId, clinicId) {
  const { clinicChats } = await getClinicTelegramChats(clinicId);
  return clinicChats.includes(chatId);
}

module.exports = {
  sendClinicNotification,
  sendAdminOnly,
  linkChatToClinic,
  isChatAuthorizedForClinic,
  getClinicTelegramChats
};
