/**
 * CLINIC INVITE SYSTEM — Secure One-Time Codes
 * 
 * How it works:
 * 1. Admin sends: /clinicinvite GLOW001
 * 2. Bot generates a random one-time code (e.g., "7X9K2P")
 * 3. Code is stored in memory with 24h expiry
 * 4. Bot sends admin the code + shareable link
 * 5. Admin shares link with clinic staff
 * 6. Staff opens bot, sends /start 7X9K2P
 * 7. Bot verifies code → links chat_id to clinic → invalidates code
 * 
 * Security:
 * - Random 6-character alphanumeric codes (not guessable)
 * - 24-hour expiry
 * - One-time use (invalidated after first successful link)
 * - Admin-only command
 * - Optional: /clinicunlink GLOW001 <chat_id> to revoke access
 */

const crypto = require('crypto');
const { supabase } = require('../supabase/client');
const { logInviteCreated, logInviteRedeemed, logInviteRevoked } = require('../monitoring/security-events');

// In-memory invite code store
// Format: { code: { clinicId, clinicSlug, createdAt, usedBy, usedAt } }
const inviteCodes = new Map();
const CODE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CODES = 500; // Prevent memory exhaustion
const CODE_LENGTH = 6; // 6-character alphanumeric

/**
 * Generate a cryptographically random invite code
 */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars (0, O, 1, I)
  let code = '';
  const bytes = crypto.randomBytes(CODE_LENGTH);
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/**
 * Create a new invite code for a clinic
 * @param {string} clinicSlug — Clinic slug (e.g., 'GLOW001')
 * @returns {Promise<{code: string, link: string, expiry: Date}|{error: string}>}
 */
async function createInviteCode(clinicSlug) {
  try {
    // Verify clinic exists
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, name, slug, telegram_chat_ids')
      .eq('slug', clinicSlug)
      .single();

    if (error || !client) {
      return { error: `Clinic "${clinicSlug}" not found. Use /clients to see all slugs.` };
    }

    // Clean up expired codes
    cleanupExpiredCodes();

    // Enforce max size
    if (inviteCodes.size >= MAX_CODES) {
      // Remove oldest unused code
      const oldest = inviteCodes.entries().next().value;
      if (oldest) inviteCodes.delete(oldest[0]);
    }

    // Generate unique code
    let code;
    let attempts = 0;
    do {
      code = generateCode();
      attempts++;
    } while (inviteCodes.has(code) && attempts < 10);

    if (attempts >= 10) {
      return { error: 'Failed to generate unique code. Please try again.' };
    }

    // Store code
    inviteCodes.set(code, {
      clinicId: client.id,
      clinicSlug: client.slug,
      clinicName: client.name,
      createdAt: Date.now(),
      usedBy: null,
      usedAt: null
    });

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'MoonHandsBot';
    const link = `https://t.me/${botUsername}?start=${code}`;
    const expiry = new Date(Date.now() + CODE_EXPIRY_MS);

    // Log security event
    logInviteCreated('admin', `clinic:${client.slug}`, `Invite code ${code} created for ${client.name}`);
    
    return {
      code,
      link,
      expiry,
      clinicName: client.name,
      clinicSlug: client.slug,
      existingStaff: client.telegram_chat_ids?.length || 0
    };

  } catch (err) {
    console.error('[CLINIC_INVITE] Error creating code:', err.message);
    return { error: 'Failed to create invite code. Please try again.' };
  }
}

/**
 * Validate and redeem an invite code
 * @param {string} code — The invite code
 * @param {string} chatId — Staff's Telegram chat ID
 * @returns {Promise<{success: boolean, clinicName?: string, clinicSlug?: string, error?: string}>}
 */
async function redeemInviteCode(code, chatId) {
  try {
    const invite = inviteCodes.get(code);

    if (!invite) {
      return { success: false, error: 'Invalid or expired invite code. Ask your admin for a new link.' };
    }

    if (invite.usedBy) {
      return { success: false, error: 'This invite code has already been used. Ask your admin for a new link.' };
    }

    if (Date.now() - invite.createdAt > CODE_EXPIRY_MS) {
      inviteCodes.delete(code);
      return { success: false, error: 'Invite code has expired (valid for 24 hours). Ask your admin for a new link.' };
    }

    // Link chat to clinic
    const { linkChatToClinic } = require('./multi-clinic-sender');
    const result = await linkChatToClinic(chatId, invite.clinicId);

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to link to clinic.' };
    }

    // Mark code as used
    invite.usedBy = chatId;
    invite.usedAt = Date.now();

    // Delete code after successful use (one-time)
    inviteCodes.delete(code);
    
    // Log security event
    logInviteRedeemed(`staff:${chatId}`, `clinic:${invite.clinicSlug}`, `Chat ${chatId} linked to ${invite.clinicName} via invite code`);

    return {
      success: true,
      clinicName: invite.clinicName,
      clinicSlug: invite.clinicSlug
    };

  } catch (err) {
    console.error('[CLINIC_INVITE] Error redeeming code:', err.message);
    return { success: false, error: 'Failed to process invite code. Please try again.' };
  }
}

/**
 * Unlink a chat ID from a clinic (admin only)
 * @param {string} clinicSlug — Clinic slug
 * @param {string} chatId — Chat ID to remove
 * @returns {Promise<{success: boolean, clinicName?: string, error?: string}>}
 */
async function unlinkChatFromClinic(clinicSlug, chatId) {
  try {
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, name, telegram_chat_ids')
      .eq('slug', clinicSlug)
      .single();

    if (error || !client) {
      return { error: `Clinic "${clinicSlug}" not found.` };
    }

    const currentIds = client.telegram_chat_ids || [];
    const chatIdNum = Number(chatId);
    
    if (!currentIds.includes(chatIdNum) && !currentIds.includes(chatId)) {
      return { error: `Chat ID ${chatId} is not linked to this clinic.` };
    }

    const newIds = currentIds.filter(id => id !== chatIdNum && id !== chatId);

    const { error: updateError } = await supabase
      .from('clients')
      .update({ telegram_chat_ids: newIds })
      .eq('id', client.id);

    if (updateError) {
      return { error: updateError.message };
    }

    // Clear cache
    const { getClinicTelegramChats } = require('./multi-clinic-sender');
    // The cache is private, but the next lookup will refresh

    // Log security event
    logInviteRevoked('admin', `clinic:${clinicSlug}`, `Chat ${chatId} unlinked from ${client.name}`);

    return {
      success: true,
      clinicName: client.name,
      removedChatId: chatId
    };

  } catch (err) {
    console.error('[CLINIC_INVITE] Error unlinking:', err.message);
    return { error: 'Failed to unlink chat. Please try again.' };
  }
}

/**
 * List active invite codes for a clinic
 */
function listActiveCodes(clinicSlug) {
  const now = Date.now();
  const active = [];
  for (const [code, data] of inviteCodes) {
    if (data.clinicSlug === clinicSlug && !data.usedBy && (now - data.createdAt < CODE_EXPIRY_MS)) {
      active.push({
        code,
        createdAt: new Date(data.createdAt),
        expiresAt: new Date(data.createdAt + CODE_EXPIRY_MS)
      });
    }
  }
  return active;
}

/**
 * Clean up expired codes
 */
function cleanupExpiredCodes() {
  const now = Date.now();
  let cleaned = 0;
  for (const [code, data] of inviteCodes) {
    if (now - data.createdAt > CODE_EXPIRY_MS) {
      inviteCodes.delete(code);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[CLINIC_INVITE] Cleaned up ${cleaned} expired code(s)`);
  }
}

// Auto-cleanup every hour
setInterval(cleanupExpiredCodes, 60 * 60 * 1000);

module.exports = {
  createInviteCode,
  redeemInviteCode,
  unlinkChatFromClinic,
  listActiveCodes,
  cleanupExpiredCodes
};
