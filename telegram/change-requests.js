/**
 * Moon Hands — Two-Sided Change Request Flow
 *
 * THE GATE:
 *   Clinic staff request changes (service/price/hours/FAQ/voice)
 *     → row in pending_changes (status 'pending')
 *     → Moon Hands admin gets Telegram message with Approve/Reject buttons
 *     → Approve: change applied to client_configs (live instantly), clinic notified
 *     → Reject: nothing applied, clinic notified with reason
 *
 * Admin's own /addservice etc. remain INSTANT (admin is the approver).
 */

require('dotenv').config();
const db = require('../supabase/client');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

const ACTION_LABELS = {
  add_service: '➕ Add Service',
  update_price: '💰 Update Price',
  update_hours: '🕐 Update Hours',
  add_faq: '❓ Add FAQ',
  update_voice: '🎤 Update Brand Voice',
};

function esc(text) {
  return String(text ?? '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function describePayload(action, p = {}) {
  switch (action) {
    case 'add_service':
      return `Service: ${esc(p.name)}\nPrice: ${esc(p.price)}\nDuration: ${p.duration}min`;
    case 'update_price':
      return `Service: ${esc(p.service_name)}\nNew Price: ${esc(p.new_price)}`;
    case 'update_hours':
      return `Day: ${esc(p.day)}\nHours: ${esc(p.open_time)} – ${esc(p.close_time)}`;
    case 'add_faq':
      return `Q: ${esc(p.question)}\nA: ${esc(p.answer)}`;
    case 'update_voice':
      return `Field: ${esc(p.field)}\nValue: ${esc(p.value)}`;
    default:
      return esc(JSON.stringify(p));
  }
}

async function sendAdminMessage(text, replyMarkup) {
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) return;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text,
        parse_mode: 'MarkdownV2',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    if (!resp.ok) {
      // MarkdownV2 parse failure — retry as plain text (buttons still attached)
      console.warn('[CHANGE_REQ] MarkdownV2 send failed, retrying plain:', (await resp.text()).slice(0, 120));
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ADMIN_CHAT_ID,
          text: text.replace(/\\(.)/g, '$1').replace(/[*_`]/g, ''),
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      });
    }
  } catch (err) {
    console.error('[CHANGE_REQ] Admin notify failed:', err.message);
  }
}

/**
 * Step 1: Clinic staff submits a change request.
 * Creates pending_changes row + pings admin with Approve/Reject buttons.
 */
async function createChangeRequest({ clinicId, clinicName, action, payload, requestedBy }) {
  const { data, error } = await db.supabase
    .from('pending_changes')
    .insert({
      client_id: clinicId,
      action,
      payload,
      requested_by: requestedBy,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('[CHANGE_REQ] Insert failed:', error.message);
    return { success: false, error: error.message };
  }

  const label = ACTION_LABELS[action] || action;
  await sendAdminMessage(
    `🔔 *CHANGE REQUEST*\n\n` +
    `🏥 Clinic: *${esc(clinicName)}*\n` +
    `Action: ${esc(label)}\n` +
    `${describePayload(action, payload)}\n\n` +
    `Requested by: ${esc(String(requestedBy))}\n` +
    `ID: \`${data.id.slice(0, 8)}\``,
    {
      inline_keyboard: [[
        { text: '✅ Approve & Apply', callback_data: `chg_ok:${data.id}` },
        { text: '❌ Reject', callback_data: `chg_no:${data.id}` },
      ]],
    }
  );

  console.log(`[CHANGE_REQ] ${action} requested for ${clinicName} (${data.id.slice(0, 8)})`);
  return { success: true, id: data.id };
}

/**
 * Step 2a: Admin approves — apply the change live, mark approved, notify clinic.
 */
async function applyChangeRequest(id, approverId) {
  const { data: req, error } = await db.supabase
    .from('pending_changes')
    .select('*, clients(name)')
    .eq('id', id)
    .single();

  if (error || !req) return { success: false, error: 'Request not found' };
  if (req.status !== 'pending') return { success: false, error: `Already ${req.status}` };

  // Apply the change to the live config
  const p = req.payload || {};
  let result;
  switch (req.action) {
    case 'add_service':
      result = await db.addService(req.client_id, { name: p.name, price: p.price, duration: parseInt(p.duration), description: p.description || '' });
      break;
    case 'update_price':
      result = await db.updateServicePrice(req.client_id, p.service_name, p.new_price);
      break;
    case 'update_hours':
      result = await db.updateOperatingHours(req.client_id, p.day, p.open_time, p.close_time);
      break;
    case 'add_faq':
      result = await db.addFaq(req.client_id, p.question, p.answer);
      break;
    case 'update_voice':
      result = await db.updateBrandVoice(req.client_id, p.field, p.value);
      break;
    default:
      result = { success: false, error: `Unknown action: ${req.action}` };
  }

  const status = result.success ? 'approved' : 'failed';
  await db.supabase
    .from('pending_changes')
    .update({
      status,
      result: result.success ? `Applied by ${approverId}` : result.error,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id);

  // Notify clinic staff
  const clinicName = req.clients?.name || 'Your clinic';
  try {
    const { sendClinicNotification } = require('./multi-clinic-sender');
    const label = ACTION_LABELS[req.action] || req.action;
    if (result.success) {
      await sendClinicNotification(req.client_id,
        `✅ *Change Request Approved*\n\n` +
        `🏥 ${clinicName}\n` +
        `Action: ${label}\n` +
        `${describePayload(req.action, p).replace(/\\(.)/g, '$1')}\n\n` +
        `The change is now *live* — your bot uses it from the next patient message.`
      );
    } else {
      await sendClinicNotification(req.client_id,
        `⚠️ *Change Request Failed*\n\n` +
        `Your ${label} request was approved but could not be applied: ${result.error}\n` +
        `Please contact Pixel Vault support.`
      );
    }
  } catch (notifyErr) {
    console.error('[CHANGE_REQ] Clinic notify failed:', notifyErr.message);
  }

  console.log(`[CHANGE_REQ] ${id.slice(0, 8)} ${status} by ${approverId}`);
  return {
    success: result.success,
    error: result.error,
    clinicName,
    action: req.action,
    summary: describePayload(req.action, p).replace(/\\(.)/g, '$1'),
  };
}

/**
 * Step 2b: Admin rejects — nothing applied, clinic notified.
 */
async function rejectChangeRequest(id, approverId) {
  const { data: req, error } = await db.supabase
    .from('pending_changes')
    .select('*, clients(name)')
    .eq('id', id)
    .single();

  if (error || !req) return { success: false, error: 'Request not found' };
  if (req.status !== 'pending') return { success: false, error: `Already ${req.status}` };

  await db.supabase
    .from('pending_changes')
    .update({
      status: 'rejected',
      result: `Rejected by ${approverId}`,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id);

  try {
    const { sendClinicNotification } = require('./multi-clinic-sender');
    const label = ACTION_LABELS[req.action] || req.action;
    await sendClinicNotification(req.client_id,
      `❌ *Change Request Rejected*\n\n` +
      `🏥 ${req.clients?.name || 'Your clinic'}\n` +
      `Action: ${label}\n\n` +
      `The change was not applied. Reply here or contact Pixel Vault support if you'd like to discuss.`
    );
  } catch (notifyErr) {
    console.error('[CHANGE_REQ] Clinic reject notify failed:', notifyErr.message);
  }

  console.log(`[CHANGE_REQ] ${id.slice(0, 8)} rejected by ${approverId}`);
  return { success: true, clinicName: req.clients?.name, action: req.action };
}

/**
 * List pending requests (admin /requests command).
 */
async function listPendingRequests() {
  const { data, error } = await db.supabase
    .from('pending_changes')
    .select('*, clients(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10);
  return error ? [] : (data || []);
}

module.exports = {
  createChangeRequest,
  applyChangeRequest,
  rejectChangeRequest,
  listPendingRequests,
  ACTION_LABELS,
};
