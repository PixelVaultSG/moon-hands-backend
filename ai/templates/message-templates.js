/**
 * Moon Hands — 5 Essential Message Templates
 *
 * Pre-built, Meta-compliant templates for:
 * 1. Booking Confirmation
 * 2. Appointment Reminder (24h before)
 * 3. Follow-Up After Treatment
 * 4. Welcome (First-Time Patient)
 * 5. Cancellation Confirmation
 *
 * Templates use {{variable}} syntax for dynamic replacement.
 * All templates are stored in Supabase and editable by admin.
 *
 * Meta template approval required for:
 * - Utility templates (categories: UTILITY, AUTHENTICATION)
 * - Marketing templates (category: MARKETING) — requires additional review
 *
 * Our templates are all UTILITY category (transactional, not promotional).
 */

// ─── TEMPLATE DEFINITIONS ───────────────────────────────────────

const TEMPLATES = {
  // Template 1: Booking Confirmation
  booking_confirmation: {
    name: 'Booking Confirmation',
    category: 'UTILITY',
    language: 'en',
    variables: ['patient_name', 'treatment_name', 'date', 'time', 'clinic_name', 'ai_agent_name'],
    body: `Hi {{patient_name}}! ✨

Your appointment is confirmed:
📅 {{date}} at {{time}}
💉 {{treatment_name}}
📍 {{clinic_name}}

Need to reschedule? Just reply "reschedule" and we'll find a new slot for you.

See you soon!
— {{ai_agent_name}}`,
    footer: 'Reply STOP to opt out of notifications.',
  },

  // Template 2: Appointment Reminder (24h before)
  appointment_reminder: {
    name: 'Appointment Reminder',
    category: 'UTILITY',
    language: 'en',
    variables: ['patient_name', 'treatment_name', 'date', 'time', 'clinic_name'],
    body: `Hi {{patient_name}}! Reminder:

Your {{treatment_name}} appointment is {{date}} at {{time}}.

Reply CONFIRM to confirm, or CANCEL if you need to reschedule.

— {{clinic_name}}`,
    footer: 'Reply STOP to opt out of notifications.',
  },

  // Template 3: Follow-Up After Treatment
  follow_up: {
    name: 'Follow-Up After Treatment',
    category: 'UTILITY',
    language: 'en',
    variables: ['patient_name', 'treatment_name', 'clinic_name', 'ai_agent_name'],
    body: `Hi {{patient_name}}! 👋

How was your {{treatment_name}} experience? We'd love your feedback.

Ready for your next session? Reply "book" and we'll find you a slot.

— {{ai_agent_name}} at {{clinic_name}}`,
    footer: 'Reply STOP to opt out of notifications.',
  },

  // Template 4: Welcome (First-Time Patient)
  welcome_new_patient: {
    name: 'Welcome New Patient',
    category: 'UTILITY',
    language: 'en',
    variables: ['patient_name', 'clinic_name', 'ai_agent_name'],
    body: `Welcome to {{clinic_name}}! 🌟

I'm {{ai_agent_name}}, your virtual assistant. I can help you with:
• Booking appointments
• Treatment information and pricing
• Answering your questions

What can I help you with today?`,
    footer: 'Reply STOP to opt out of notifications.',
  },

  // Template 5: Cancellation Confirmation
  cancellation_confirmation: {
    name: 'Cancellation Confirmation',
    category: 'UTILITY',
    language: 'en',
    variables: ['patient_name', 'treatment_name', 'date', 'time', 'ai_agent_name'],
    body: `Hi {{patient_name}}!

Your appointment for {{treatment_name}} on {{date}} at {{time}} has been cancelled.

No worries — when you're ready to rebook, just send us a message anytime.

— {{ai_agent_name}}`,
    footer: 'Reply STOP to opt out of notifications.',
  },
};

// ─── VARIABLE REPLACEMENT ENGINE ────────────────────────────────

function fillTemplate(templateId, variables) {
  const template = TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  // Validate all required variables are provided
  const missing = template.variables.filter(v => variables[v] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing template variables: ${missing.join(', ')}`);
  }

  // Replace all {{variable}} placeholders
  let body = template.body;
  for (const [key, value] of Object.entries(variables)) {
    body = body.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  }

  return {
    name: template.name,
    category: template.category,
    language: template.language,
    body,
    footer: template.footer,
    templateId,
  };
}

// ─── DELIVERY STATUS TRACKING ──────────────────────────────────

const deliveryTracking = new Map(); // messageId → { status, timestamp, error }

function trackMessage(messageId, phoneNumber, templateId) {
  deliveryTracking.set(messageId, {
    status: 'sent',
    phoneNumber,
    templateId,
    sentAt: new Date().toISOString(),
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    error: null,
  });
}

function updateDeliveryStatus(messageId, status, error = null) {
  const record = deliveryTracking.get(messageId);
  if (!record) return;

  record.status = status;

  if (status === 'delivered') {
    record.deliveredAt = new Date().toISOString();
  } else if (status === 'read') {
    record.readAt = new Date().toISOString();
  } else if (status === 'failed') {
    record.failedAt = new Date().toISOString();
    record.error = error;

    // Alert owner about failed delivery
    alertOwnerFailedDelivery(record);
  }
}

async function alertOwnerFailedDelivery(record) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!botToken || !adminChatId) return;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: adminChatId,
      text: `🚨 Message Delivery Failed\n\nTemplate: ${record.templateId}\nTo: ${record.phoneNumber}\nError: ${record.error || 'Unknown'}\nTime: ${record.failedAt}\n\nAction: Patient may not have received their confirmation. Follow up manually if needed.`,
    }),
  });
}

function getDeliveryStatus(messageId) {
  return deliveryTracking.get(messageId) || null;
}

function getDeliveryReport(clinicId, date = new Date().toISOString().split('T')[0]) {
  const entries = Array.from(deliveryTracking.values())
    .filter(r => r.sentAt.startsWith(date));

  const total = entries.length;
  const delivered = entries.filter(r => r.status === 'delivered' || r.status === 'read').length;
  const read = entries.filter(r => r.status === 'read').length;
  const failed = entries.filter(r => r.status === 'failed').length;
  const pending = entries.filter(r => r.status === 'sent').length;

  return {
    date,
    clinicId,
    total,
    delivered,
    read,
    failed,
    pending,
    deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
    readRate: total > 0 ? Math.round((read / total) * 100) : 0,
    failures: entries.filter(r => r.status === 'failed').map(r => ({
      phone: r.phoneNumber,
      template: r.templateId,
      error: r.error,
      time: r.failedAt,
    })),
  };
}

// ─── META TEMPLATE APPROVAL STATUS ──────────────────────────────

const approvalStatus = new Map(); // templateId → { status, metaTemplateId, submittedAt }

function setApprovalStatus(templateId, status, metaTemplateId = null) {
  approvalStatus.set(templateId, {
    status, // 'pending' | 'approved' | 'rejected'
    metaTemplateId,
    updatedAt: new Date().toISOString(),
  });
}

function getApprovalStatus(templateId) {
  return approvalStatus.get(templateId) || { status: 'unknown' };
}

// ─── CLINIC-SPECIFIC CUSTOMIZATION ─────────────────────────────

function customizeForClinic(templateId, clinicConfig, patientData) {
  const variables = {
    patient_name: patientData.name || 'there',
    treatment_name: patientData.treatment || 'your appointment',
    date: patientData.date || '',
    time: patientData.time || '',
    clinic_name: clinicConfig.name || 'our clinic',
    ai_agent_name: clinicConfig.ai_name || 'Alex',
  };

  return fillTemplate(templateId, variables);
}

// ─── EXPORTS ────────────────────────────────────────────────────

module.exports = {
  // Templates
  TEMPLATES,
  fillTemplate,
  customizeForClinic,

  // Delivery tracking
  trackMessage,
  updateDeliveryStatus,
  getDeliveryStatus,
  getDeliveryReport,

  // Template approval
  setApprovalStatus,
  getApprovalStatus,
};
