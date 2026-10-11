/**
 * Moon Hands — Telegram Onboarding Approval Commands
 *
 * Commands:
 *   /pendingonboarding — List all pending onboarding submissions
 *   /approveclinic <id> — Approve submission, create clinic + config
 *   /rejectclinic <id> [reason] — Reject submission, notify clinic
 *
 * Flow:
 *   1. Clinic submits form → onboarding_submissions (status='pending')
 *   2. Telegram notification sent to admin
 *   3. Admin reviews with /pendingonboarding
 *   4. Admin approves with /approveclinic <id>
 *   5. Clinic created in `clients` + `client_configs` tables
 *   6. Clinic receives WhatsApp welcome message
 */

const { supabase } = require('../../supabase/client');

// ─── HELPERS ─────────────────────────────────────────────────────

function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
}

function generateSlug(clinicName) {
  return clinicName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

function makeUniqueSlug(baseSlug, existingSlugs) {
  if (!existingSlugs.includes(baseSlug)) return baseSlug;
  let i = 2;
  while (existingSlugs.includes(`${baseSlug}-${i}`)) i++;
  return `${baseSlug}-${i}`;
}

// ─── /PENDINGONBOARDING ──────────────────────────────────────────

async function handlePendingOnboarding(ctx) {
  try {
    const { data: submissions, error } = await supabase
      .from('onboarding_submissions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ONBOARDING_APPROVALS] DB error:', error.message);
      return ctx.reply('⚠️ Unable to fetch onboarding submissions. Please try again.');
    }

    if (!submissions || submissions.length === 0) {
      return ctx.reply('✅ No pending onboarding submissions. All caught up!');
    }

    const lines = [`📋 *PENDING ONBOARDING (${submissions.length})*\n`];

    for (const s of submissions) {
      const plan = s.selected_plan === 'premium' ? 'Premium (S$547/mo)' : 'Basic (S$347/mo)';
      const treatments = s.treatment_menu ? JSON.parse(s.treatment_menu).length : 0;
      lines.push(`*#${s.id}* — ${escapeMarkdown(s.clinic_name)}`);
      lines.push(`  📧 ${escapeMarkdown(s.clinic_email)}`);
      lines.push(`  📱 ${escapeMarkdown(s.whatsapp_number || s.clinic_phone || '—')}`);
      lines.push(`  👤 ${escapeMarkdown(s.contact_name)} (${escapeMarkdown(s.contact_role || '—')})`);
      lines.push(`  💎 ${plan}`);
      lines.push(`  💉 ${treatments} treatments`);
      lines.push(`  🕐 Submitted: ${new Date(s.created_at).toLocaleString('en-SG')}`);
      lines.push(`  Actions: /approveclinic ${s.id}  |  /rejectclinic ${s.id}`);
      lines.push('');
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' }).catch(() => {
      ctx.reply(lines.join('\n').replace(/[*_`]/g, ''));
    });

  } catch (err) {
    console.error('[ONBOARDING_APPROVALS] /pendingonboarding error:', err.message);
    ctx.reply('❌ Error processing request. Please try again.');
  }
}

// ─── /APPROVECLINIC ──────────────────────────────────────────────

async function handleApproveClinic(ctx) {
  const args = ctx.message.text.split(/\s+/).slice(1);
  if (args.length < 1) {
    return ctx.reply('⚠️ Usage: /approveclinic <submission_id>\n\nExample: /approveclinic 42');
  }

  const submissionId = parseInt(args[0]);
  if (isNaN(submissionId)) {
    return ctx.reply('❌ Submission ID must be a number.');
  }

  try {
    // 1. Fetch the submission
    const { data: submission, error: fetchErr } = await supabase
      .from('onboarding_submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('status', 'pending')
      .single();

    if (fetchErr || !submission) {
      return ctx.reply(`❌ Pending submission #${submissionId} not found. Use /pendingonboarding to see pending submissions.`);
    }

    // 2. Check for slug collision
    const { data: existingClients } = await supabase
      .from('clients')
      .select('slug');
    const existingSlugs = (existingClients || []).map(c => c.slug);
    const baseSlug = generateSlug(submission.clinic_name);
    const slug = makeUniqueSlug(baseSlug, existingSlugs);

    // 3. Create client record
    const plan = submission.selected_plan === 'premium' ? 'premium' : 'basic';
    const monthlyAmount = plan === 'premium' ? 547 : 347;

    const { data: newClient, error: clientErr } = await supabase
      .from('clients')
      .insert({
        name: submission.clinic_name,
        slug: slug,
        status: 'active',
        plan: plan,
        monthly_amount: monthlyAmount,
        whatsapp_number: submission.whatsapp_number || submission.clinic_phone,
        google_calendar_id: null,
        telegram_chat_ids: [],
        last_paid_date: new Date().toISOString().split('T')[0],
        billing_day: 1,
      })
      .select()
      .single();

    if (clientErr) {
      console.error('[ONBOARDING_APPROVALS] Client insert error:', clientErr.message);
      return ctx.reply(`❌ Failed to create clinic: ${clientErr.message}`);
    }

    // 4. Parse treatment menu
    let services = [];
    try {
      services = JSON.parse(submission.treatment_menu || '[]');
    } catch {
      services = [];
    }

    // Normalize services to have category field
    services = services.map(s => ({
      name: s.name || s,
      price: s.price || '',
      duration: s.duration || 60,
      description: s.description || '',
      category: s.category || categorizeService(s.name || s)
    }));

    // 5. Parse operating hours
    let operatingHours = [];
    try {
      operatingHours = JSON.parse(submission.operating_hours || '[]');
    } catch {
      operatingHours = [
        { day: 'Monday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Tuesday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Wednesday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Thursday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Friday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Saturday', open_time: '10:00', close_time: '18:00', isOpen: true },
        { day: 'Sunday', open_time: null, close_time: null, isOpen: false },
      ];
    }

    // 6. Parse FAQs
    let faqs = [];
    try {
      faqs = JSON.parse(submission.faqs || '[]');
    } catch {
      faqs = [];
    }

    // 7. Build config JSONB
    const config = {
      agent_name: submission.preferred_agent_name || 'Sophia',
      tone: submission.preferred_tone || 'warm and professional',
      greeting: submission.preferred_greeting || `Hello! Welcome to ${submission.clinic_name}.`,
      phone: submission.clinic_phone || submission.whatsapp_number || '',
      whatsapp_number: submission.whatsapp_number || '',
      address: submission.clinic_address || '',
      nearest_mrt: '',
      landmarks: '',
      parking_info: '',
      services: services,
      service_categories: buildCategories(services),
      operating_hours: operatingHours,
      faqs: faqs,
      special_notes: submission.special_notes || '',
      booking_auto_confirm: submission.booking_auto_confirm || false,
      booking_after_hours_action: submission.booking_after_hours_action || 'hold_for_approval',
      booking_waitlist_enabled: submission.booking_waitlist_enabled || true,
      booking_max_advance_days: submission.booking_max_advance_days || 30,
      booking_min_notice_hours: submission.booking_min_notice_hours || 2,
      booking_allow_same_day: submission.booking_allow_same_day || true,
      booking_require_phone: submission.booking_require_phone || true,
      booking_reminder_24h: submission.booking_reminder_24h || true,
      booking_reminder_1h: submission.booking_reminder_1h || true,
      booking_followup_48h: submission.booking_followup_48h || true,
      languages: submission.languages || ['en'],
      cancellation_policy: submission.cancellation_policy || '',
    };

    // 8. Create client_configs record
    const { error: configErr } = await supabase
      .from('client_configs')
      .insert({
        client_id: newClient.id,
        config: config,
        services: services,
        operating_hours: operatingHours,
        faqs: faqs,
      });

    if (configErr) {
      console.error('[ONBOARDING_APPROVALS] Config insert error:', configErr.message);
      // Don't fail — client is created, config can be fixed manually
    }

    // 9. Update submission status
    await supabase
      .from('onboarding_submissions')
      .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: ctx.from.id })
      .eq('id', submissionId);

    // 10. Send success message to admin
    const msg = [
      `✅ *CLINIC APPROVED*`,
      ``,
      `*${escapeMarkdown(submission.clinic_name)}*`,
      `Slug: \`${slug}\``,
      `Plan: ${plan === 'premium' ? 'Premium' : 'Basic'} (S$${monthlyAmount}/mo)`,
      `WhatsApp: ${escapeMarkdown(submission.whatsapp_number || '—')}`,
      `Contact: ${escapeMarkdown(submission.contact_name)}`,
      ``,
      `🤖 AI Agent: ${escapeMarkdown(config.agent_name)}`,
      `💉 Treatments: ${services.length}`,
      `🕐 Hours: ${operatingHours.filter(h => h.isOpen).length} days configured`,
      ``,
      `✅ Clinic is now LIVE.`,
      `Next steps:`,
      `  1. Set up Google Calendar integration`,
      `  2. Test the bot with the clinic`,
      `  3. Set up Telegram staff alerts if needed`,
    ].join('\n');

    await ctx.reply(msg, { parse_mode: 'Markdown' }).catch(() => {
      ctx.reply(msg.replace(/[*_`]/g, ''));
    });

    // 11. Send welcome WhatsApp to clinic contact
    try {
      const { sendWhatsAppMessage } = require('../../jobs/reminders');
      const welcomeMsg = `Welcome to Moon Hands! 🌙\n\nYour clinic "${submission.clinic_name}" has been approved and is now live.\n\nYour AI assistant ${config.agent_name} is ready to handle patient inquiries 24/7.\n\nNeed help? Contact us at pixelvaultsg@gmail.com`;
      await sendWhatsAppMessage(submission.whatsapp_number || submission.clinic_phone, welcomeMsg);
    } catch (waErr) {
      console.error('[ONBOARDING_APPROVALS] WhatsApp welcome failed:', waErr.message);
    }

    console.log(`[ONBOARDING_APPROVALS] Approved submission ${submissionId} → clinic ${newClient.id} (${slug})`);

  } catch (err) {
    console.error('[ONBOARDING_APPROVALS] /approveclinic error:', err.message, err.stack);
    ctx.reply('❌ Error approving clinic. Check logs.');
  }
}

// ─── /REJECTCLINIC ───────────────────────────────────────────────

async function handleRejectClinic(ctx) {
  const args = ctx.message.text.split(/\s+/).slice(1);
  if (args.length < 1) {
    return ctx.reply('⚠️ Usage: /rejectclinic <submission_id> [reason]\n\nExample: /rejectclinic 42 Duplicate submission');
  }

  const submissionId = parseInt(args[0]);
  const reason = args.slice(1).join(' ') || 'Not specified';

  if (isNaN(submissionId)) {
    return ctx.reply('❌ Submission ID must be a number.');
  }

  try {
    const { data: submission, error: fetchErr } = await supabase
      .from('onboarding_submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('status', 'pending')
      .single();

    if (fetchErr || !submission) {
      return ctx.reply(`❌ Pending submission #${submissionId} not found.`);
    }

    await supabase
      .from('onboarding_submissions')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejected_by: ctx.from.id,
        rejection_reason: reason
      })
      .eq('id', submissionId);

    // Notify clinic contact
    try {
      const { sendWhatsAppMessage } = require('../../jobs/reminders');
      const rejectMsg = `Hi ${submission.contact_name}, thank you for your interest in Moon Hands.\n\nUnfortunately, we are unable to onboard "${submission.clinic_name}" at this time.\n\nReason: ${reason}\n\nIf you have questions, please contact us at pixelvaultsg@gmail.com`;
      await sendWhatsAppMessage(submission.whatsapp_number || submission.clinic_phone, rejectMsg);
    } catch (waErr) {
      console.error('[ONBOARDING_APPROVALS] WhatsApp reject notification failed:', waErr.message);
    }

    ctx.reply(
      `❌ *Submission Rejected*\n\n` +
      `Clinic: ${escapeMarkdown(submission.clinic_name)}\n` +
      `Reason: ${escapeMarkdown(reason)}\n\n` +
      `The clinic has been notified via WhatsApp.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {
      ctx.reply(`❌ Submission #${submissionId} rejected. Reason: ${reason}`);
    });

    console.log(`[ONBOARDING_APPROVALS] Rejected submission ${submissionId}: ${reason}`);

  } catch (err) {
    console.error('[ONBOARDING_APPROVALS] /rejectclinic error:', err.message);
    ctx.reply('❌ Error rejecting submission. Check logs.');
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────

function categorizeService(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('botox') || n.includes('filler') || n.includes('rejuran') || n.includes('profhilo')) return 'Injectables';
  if (n.includes('facial') || n.includes('peel') || n.includes('hydra') || n.includes('cleanse')) return 'Facials';
  if (n.includes('laser') || n.includes('ipl') || n.includes('bbl')) return 'Laser';
  if (n.includes('hifu') || n.includes('thread') || n.includes('lift') || n.includes('tighten')) return 'Lifting';
  if (n.includes('body') || n.includes('slim') || n.includes('sculpt')) return 'Body';
  return 'Other';
}

function buildCategories(services) {
  const cats = new Map();
  for (const s of services) {
    const cat = s.category || categorizeService(s.name);
    if (!cats.has(cat)) cats.set(cat, { id: cat, name: cat, count: 0 });
    cats.get(cat).count++;
  }
  return Array.from(cats.values());
}

module.exports = {
  handlePendingOnboarding,
  handleApproveClinic,
  handleRejectClinic,
};
