/**
 * Doctor Callback Commands — MADS support workflow (Handoff Section 19.2)
 *
 * /callbacks        — list pending doctor-callback requests
 * /callbackdone <id> — mark a callback as completed
 * Inline buttons on the request notification call the same core functions:
 *   cbdone:<id8>    — mark complete (one tap, no typing)
 *   cbcancel:<id8>  — cancel the request
 *
 * Scoping:
 *   - Clinic staff (their chat ID is in clients.telegram_chat_ids) see ONLY
 *     their own clinic's callbacks.
 *   - Moon Hands admin (TELEGRAM_ADMIN_CHAT_ID) sees ALL clinics.
 * Data isolation rule: every query carries clinic_id unless the caller is admin.
 */

const { supabase } = require('../../supabase/client');

const ADMIN_CHAT_ID = () => String(process.env.TELEGRAM_ADMIN_CHAT_ID || '');

/**
 * Resolve which clinic a Telegram chat belongs to.
 * Returns { clinicId, clinicName, isAdmin } — clinicId null for admin.
 */
async function resolveCallerClinic(chatId) {
  const chatIdStr = String(chatId);
  if (chatIdStr === ADMIN_CHAT_ID()) {
    return { clinicId: null, clinicName: 'Moon Hands Admin', isAdmin: true };
  }
  // telegram_chat_ids is stored as an array; chat IDs may be number or string
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, telegram_chat_ids');
  if (error) throw new Error(error.message);
  const match = (clients || []).find(c =>
    (c.telegram_chat_ids || []).some(id => String(id) === chatIdStr)
  );
  if (match) return { clinicId: match.id, clinicName: match.name, isAdmin: false };
  return { clinicId: undefined, clinicName: null, isAdmin: false }; // unknown chat
}

function formatCallbackRow(r, showClinic) {
  const shortId = r.id.slice(0, 8);
  const when = new Date(r.created_at).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' });
  const phone = r.patient_phone || 'unknown';
  const topic = (r.topic || '').slice(0, 80);
  return (
    `• \`${shortId}\` — ${phone}${r.patient_name ? ` (${r.patient_name})` : ''}\n` +
    `  ${topic}\n` +
    `  ${when}${showClinic && r._clinicName ? ` — ${r._clinicName}` : ''}`
  );
}

// ─── CORE LOOKUP ───────────────────────────────────────────────────────────
// Shared by commands and inline buttons. Enforces clinic scoping for staff.

async function findPendingByPrefix(idPrefix, caller) {
  let query = supabase
    .from('callback_requests')
    .select('id, client_id, patient_phone, topic')
    .eq('status', 'pending');
  if (!caller.isAdmin) {
    query = query.eq('client_id', caller.clinicId); // DATA ISOLATION
  }
  const { data: pending, error } = await query;
  if (error) return { error: `❌ Could not load callbacks: ${error.message}` };

  const match = (pending || []).filter(r => r.id.startsWith(idPrefix));
  if (match.length === 0) {
    return { error: `❌ No pending callback starting with \`${idPrefix}\`. Check /callbacks.` };
  }
  if (match.length > 1) {
    return { error: `⚠️ \`${idPrefix}\` matches ${match.length} callbacks — use more characters.` };
  }
  return { callback: match[0] };
}

/**
 * Mark a callback complete. Returns { ok, message, callback } — safe for
 * both command handlers and inline-button actions.
 */
async function completeCallbackByRef(idPrefix, chatId) {
  const caller = await resolveCallerClinic(chatId);
  if (caller.clinicId === undefined) {
    return { ok: false, message: '⚠️ This chat is not linked to any clinic. Ask Moon Hands to link it first.' };
  }
  const { callback, error } = await findPendingByPrefix(idPrefix, caller);
  if (error) return { ok: false, message: error };

  const { error: updErr } = await supabase
    .from('callback_requests')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', callback.id)
    .eq('status', 'pending'); // guard against double-completion races

  if (updErr) return { ok: false, message: `❌ Failed to update: ${updErr.message}` };
  return {
    ok: true,
    message: `✅ Callback \`${callback.id.slice(0, 8)}\` marked complete (${callback.patient_phone}).`,
    callback
  };
}

/**
 * Cancel a callback (doctor unavailable, patient unreachable, etc.).
 */
async function cancelCallbackByRef(idPrefix, chatId) {
  const caller = await resolveCallerClinic(chatId);
  if (caller.clinicId === undefined) {
    return { ok: false, message: '⚠️ This chat is not linked to any clinic. Ask Moon Hands to link it first.' };
  }
  const { callback, error } = await findPendingByPrefix(idPrefix, caller);
  if (error) return { ok: false, message: error };

  const { error: updErr } = await supabase
    .from('callback_requests')
    .update({ status: 'cancelled' })
    .eq('id', callback.id)
    .eq('status', 'pending');

  if (updErr) return { ok: false, message: `❌ Failed to update: ${updErr.message}` };
  return {
    ok: true,
    message: `🚫 Callback \`${callback.id.slice(0, 8)}\` cancelled (${callback.patient_phone}).`,
    callback
  };
}

// ─── /callbacks ────────────────────────────────────────────────────────────

async function handleCallbacks(ctx) {
  const caller = await resolveCallerClinic(ctx.chat.id);

  if (caller.clinicId === undefined) {
    return ctx.reply('⚠️ This chat is not linked to any clinic. Ask Moon Hands to link it first.');
  }

  let query = supabase
    .from('callback_requests')
    .select('id, client_id, patient_phone, patient_name, topic, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(20);

  if (!caller.isAdmin) {
    query = query.eq('client_id', caller.clinicId); // DATA ISOLATION
  }

  const { data: rows, error } = await query;
  if (error) return ctx.reply(`❌ Could not load callbacks: ${error.message}`);

  if (!rows || rows.length === 0) {
    return ctx.reply('✅ No pending callbacks. All clear.');
  }

  // Admin view: attach clinic names
  if (caller.isAdmin) {
    const ids = [...new Set(rows.map(r => r.client_id))];
    const { data: clinics } = await supabase.from('clients').select('id, name').in('id', ids);
    const nameById = Object.fromEntries((clinics || []).map(c => [c.id, c.name]));
    rows.forEach(r => { r._clinicName = nameById[r.client_id] || 'Unknown clinic'; });
  }

  const header = caller.isAdmin
    ? `📞 *Pending callbacks — all clinics (${rows.length})*`
    : `📞 *Pending callbacks — ${caller.clinicName} (${rows.length})*`;

  const body = rows.map(r => formatCallbackRow(r, caller.isAdmin)).join('\n\n');
  return ctx.reply(
    `${header}\n\n${body}\n\nTap ✅ on the request notification, or reply \`/callbackdone <id>\`.`,
    { parse_mode: 'Markdown' }
  );
}

// ─── /callbackdone <id> ────────────────────────────────────────────────────

async function handleCallbackDone(ctx) {
  const args = (ctx.message.text || '').split(/\s+/).slice(1);
  if (args.length < 1 || !args[0]) {
    return ctx.reply('⚠️ Usage: `/callbackdone <id>` — get the id from /callbacks', { parse_mode: 'Markdown' });
  }
  const result = await completeCallbackByRef(args[0].trim(), ctx.chat.id);
  return ctx.reply(result.message, { parse_mode: 'Markdown' });
}

module.exports = {
  handleCallbacks,
  handleCallbackDone,
  completeCallbackByRef,
  cancelCallbackByRef,
  resolveCallerClinic,
};
