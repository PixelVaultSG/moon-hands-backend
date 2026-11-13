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

// v2.5.0: legacy parse_mode 'Markdown' only treats _ * ` [ as special —
// escaping the MarkdownV2 set (. - etc.) leaks literal backslashes (Ash's 'gmail\.com').
function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/[_*`\[]/g, '\\$&');
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

// ─── SUBMISSION RESOLVER ─────────────────────────────────────────
// Submissions use UUIDs, but Telegram admins can't type 36-char IDs.
// Resolve by short code (first 8+ chars of UUID, case-insensitive, optional #)
// or full UUID. Prefix match against PENDING submissions only.

async function resolveSubmission(ref) {
  const clean = String(ref || '').replace(/^#/, '').trim().toLowerCase();
  if (clean.length < 4) return { error: 'too_short' };
  const { data: pending, error } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .eq('status', 'pending');
  if (error) return { error: error.message };
  const matches = (pending || []).filter(s => String(s.id).toLowerCase().startsWith(clean));
  if (matches.length === 0) return { error: 'not_found' };
  if (matches.length > 1) return { error: 'ambiguous', matches };
  return { submission: matches[0] };
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
      const shortCode = String(s.id).substring(0, 8);
      lines.push(`*\`${shortCode}\`* — ${escapeMarkdown(s.clinic_name)}`);
      lines.push(`  📧 ${escapeMarkdown(s.clinic_email)}`);
      lines.push(`  📱 ${escapeMarkdown(s.whatsapp_number || s.clinic_phone || '—')}`);
      lines.push(`  👤 ${escapeMarkdown(s.contact_name)} (${escapeMarkdown(s.contact_role || '—')})`);
      lines.push(`  💎 ${plan}`);
      lines.push(`  💉 ${treatments} treatments`);
      lines.push(`  🕐 Submitted: ${new Date(s.created_at).toLocaleString('en-SG')}`);
      lines.push(`  Actions: /approveclinic \`${shortCode}\`  |  /rejectclinic \`${shortCode}\``);
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

// v2.5.3: refArg lets inline buttons pass the submission id EXPLICITLY.
// The old button path mocked ctx.message — a silent no-op, because telegraf's
// Context.message is a getter-only prototype accessor (verified in 4.16.3
// lib/context.js). The assignment never took, ctx.message stayed undefined,
// and .text threw → safeHandler replied "Command failed". Buttons had NEVER
// worked (Ash UVT 2026-11-13). Command path (no refArg) parses text as before.
async function handleApproveClinic(ctx, refArg) {
  const args = refArg ? [refArg] : ctx.message.text.split(/\s+/).slice(1);
  if (args.length < 1) {
    return ctx.reply('⚠️ Usage: /approveclinic <short_code>\n\nExample: /approveclinic 8ab2e5b4\n\nGet the short code from /pendingonboarding');
  }

  try {
    // 1. Resolve submission by short code or full UUID
    const { submission, error: resolveErr, matches } = await resolveSubmission(args[0]);
    if (resolveErr === 'not_found') {
      ctx.reply(`❌ Pending submission "${args[0]}" not found. Use /pendingonboarding to see pending submissions.`);
      return false;
    }
    if (resolveErr === 'ambiguous') {
      ctx.reply(`⚠️ "${args[0]}" matches ${matches.length} pending submissions — use a longer code.`);
      return false;
    }
    if (resolveErr || !submission) {
      ctx.reply('⚠️ Unable to fetch submissions. Please try again.');
      return false;
    }
    const submissionId = submission.id;

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
        industry: submission.industry === 'chiropractic' ? 'chiropractic' : 'aesthetic',
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
      ctx.reply(`❌ Failed to create clinic: ${clientErr.message}`);
      return false;
    }

    // 4. Parse treatment menu
    let services = [];
    try {
      services = JSON.parse(submission.treatment_menu || '[]');
    } catch {
      services = [];
    }

    // Normalize services to have category field
    // v2.5.0: accept BOTH key schemas — presets use dur/desc/cat, custom
    // treatments submitted before v2.5.0 use duration/description/category.
    // The old long-key-only read silently turned preset durations into 60min,
    // dropped descriptions, re-guessed categories, and lost pricing units.
    services = services.map(s => ({
      name: s.name || s,
      price: s.price || '',
      unit: s.unit || 'per session',
      duration: parseInt(s.duration ?? s.dur) || 60,
      description: s.description ?? s.desc ?? '',
      category: s.category ?? s.cat ?? categorizeService(s.name || s)
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

    // v2.5.3: onboarding.html stores hours POSITIONALLY (Mon-first,
    // {open, close, isOpen}) but the booking engine reads the NAMED schema
    // ({day, open_time, close_time, isOpen}) — calculateAvailability finds by
    // h.day and reads open_time/close_time. Untransformed, an approved clinic
    // answers "we're closed" every day (Ash UVT 2026-11-13: CRACKIN4U-v2).
    const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    operatingHours = operatingHours.map((h, i) => {
      if (h && h.day) return h; // already named (legacy submissions)
      return {
        day: DAY_NAMES[i] || `Day${i}`,
        isOpen: !!(h && h.isOpen),
        open_time: (h && (h.open ?? h.open_time)) || null,
        close_time: (h && (h.close ?? h.close_time)) || null
      };
    });

    // 6. Parse FAQs
    let faqs = [];
    try {
      faqs = JSON.parse(submission.faqs || '[]');
    } catch {
      faqs = [];
    }
    // v2.5.0: never carry blank/half-filled FAQ rows into the live config —
    // the bot would serve an empty answer.
    faqs = faqs.filter(f => f && (f.q || '').trim() && (f.a || '').trim());

    // 7. Build config JSONB
    const isChiro = submission.industry === 'chiropractic';
    const config = {
      agent_name: submission.preferred_agent_name || 'Sophia',
      tone: submission.preferred_tone || 'warm and professional',
      greeting: submission.preferred_greeting || `Hello! Welcome to ${submission.clinic_name}.`,
      // Chiro expansion: industry + feature flags (Handoff §3.2.4 / §20)
      industry: isChiro ? 'chiropractic' : 'aesthetic',
      features: isChiro ? {
        treatment_plan_tracking: true,
        insurance_faq: true,
        doctor_callback: true,
        patient_history_lookup: true,
        red_flag_triage: true,
      } : {
        treatment_plan_tracking: false,
        insurance_faq: false,
        doctor_callback: false,
        patient_history_lookup: false,
        red_flag_triage: false,
      },
      // Chiro booking rules (Handoff §9.4): first visit = consultation,
      // same-day for existing patients only, 1h notice for existing.
      booking_require_consult_first: isChiro,
      medical_safeguard: isChiro
        ? { strict_mode: true, callback_enabled: true, er_redirect_for_red_flags: true }
        : { strict_mode: false, callback_enabled: false, er_redirect_for_red_flags: false },
      phone: submission.clinic_phone || submission.whatsapp_number || '',
      whatsapp_number: submission.whatsapp_number || '',
      address: submission.clinic_address || '',
      // v2.5.4: actually carry location aids into the live config — the
      // engine reads these for "where are you / parking?" answers, and
      // approvals had hardcoded them blank since day one (Ash 2026-11-13).
      nearest_mrt: submission.nearest_mrt || '',
      landmarks: submission.landmarks || '',
      parking_info: submission.parking_info || '',
      services: services,
      service_categories: buildCategories(services),
      operating_hours: operatingHours,
      faqs: faqs,
      special_notes: submission.special_notes || '',
      // v2.4.9: ?? not || — || collapses a clinic's explicit OFF (false) or
      // "No minimum" (0) back to the default, making those toggles dead in
      // the real config (Ash UVT 2026-11-12). ?? only defaults when the
      // submission genuinely lacks the field (old submissions, partial data).
      booking_auto_confirm: submission.booking_auto_confirm ?? false,
      booking_after_hours_action: submission.booking_after_hours_action || 'hold_for_approval',
      booking_waitlist_enabled: submission.booking_waitlist_enabled ?? true,
      booking_max_advance_days: submission.booking_max_advance_days ?? 30,
      booking_min_notice_hours: submission.booking_min_notice_hours ?? 2,
      booking_allow_same_day: submission.booking_allow_same_day ?? true,
      booking_require_phone: submission.booking_require_phone ?? true,
      booking_reminder_24h: submission.booking_reminder_24h ?? true,
      booking_reminder_1h: submission.booking_reminder_1h ?? true,
      booking_followup_48h: submission.booking_followup_48h ?? true,
      languages: submission.languages || ['en'],
      cancellation_policy: submission.cancellation_policy || '',
      // v2.5.3: these three were mapped to NOTHING at approval — the engine
      // silently ran on defaults (Ash UVT 2026-11-13: 15min slots became 60,
      // 5/day became 12, buffer defaulted). ?? — 0 is a real value.
      appointment_duration_minutes: submission.appointment_duration_minutes ?? 60,
      max_appointments_per_day: submission.max_appointments_per_day ?? 12,
      buffer_time: submission.buffer_between_appointments_minutes ?? 15,
      // Owner contact collected since v2.5.0 — keep it in the runtime config
      contact_name: submission.contact_name || '',
      contact_email: submission.contact_email || '',
      contact_phone: submission.contact_phone || '',
    };

    // 8. Create client_configs record
    // v2.5.3: also SET the top-level columns — the engine reads the jsonb,
    // but /config displays columns, and approvals left them at defaults
    // (CRACKIN4U-v2 displayed auto_confirm=false when the jsonb said true).
    const { error: configErr } = await supabase
      .from('client_configs')
      .insert({
        client_id: newClient.id,
        config: config,
        services: services,
        operating_hours: operatingHours,
        faqs: faqs,
        agent_name: config.agent_name,
        greeting: config.greeting,
        tone: submission.preferred_tone || 'friendly',
        languages: submission.languages || ['en'],
        special_notes: submission.special_notes || null,
        appointment_duration: submission.appointment_duration_minutes ?? 60,
        buffer_time: submission.buffer_between_appointments_minutes ?? 15,
        max_per_day: submission.max_appointments_per_day ?? 12,
        booking_auto_confirm: submission.booking_auto_confirm ?? false,
        booking_after_hours_action: submission.booking_after_hours_action || 'hold_for_approval',
        booking_waitlist_enabled: submission.booking_waitlist_enabled ?? true,
        booking_max_advance_days: submission.booking_max_advance_days ?? 30,
        booking_min_notice_hours: submission.booking_min_notice_hours ?? 2,
        booking_allow_same_day: submission.booking_allow_same_day ?? true,
        booking_require_phone: submission.booking_require_phone ?? true,
        booking_reminder_24h: submission.booking_reminder_24h ?? true,
        booking_reminder_1h: submission.booking_reminder_1h ?? true,
        booking_followup_48h: submission.booking_followup_48h ?? true,
        cancellation_policy: submission.cancellation_policy || '',
        automations: {
          reminder1h: submission.booking_reminder_1h ?? true,
          reminder24h: submission.booking_reminder_24h ?? true,
          followup48h: submission.booking_followup_48h ?? true,
          bookingConfirmation: true
        },
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
      `Contact: ${escapeMarkdown(submission.contact_name)}${submission.contact_email ? ` — ${escapeMarkdown(submission.contact_email)}` : ''}${submission.contact_phone ? ` / ${escapeMarkdown(submission.contact_phone)}` : ''}`,
      // v2.5.0: calendar intent now persists — surface it so wiring isn't forgotten.
      // clients.google_calendar_id stays null until manually verified: an unshared
      // calendar ID would break availability checks (the v2.3.9 lesson).
      `📅 Calendar: ${submission.has_google_calendar ? `Yes${submission.google_calendar_email ? ` (${escapeMarkdown(submission.google_calendar_email)})` : ''} — verify SA access, THEN set google_calendar_id` : 'No / later'}`,
      ``,
      `🤖 AI Agent: ${escapeMarkdown(config.agent_name)}`,
      `💉 Treatments: ${services.length}`,
      `🕐 Hours: ${operatingHours.filter(h => h.isOpen).length} days configured`,
      ``,
      `✅ Clinic is now LIVE.`,
      `Next steps:`,
      `  1. Tap the button below to link YOUR Telegram (receive this clinic's alerts)`,
      `  2. Forward the staff link to the clinic's team so they can link theirs`,
      `  3. Set up Google Calendar integration`,
      ``,
      `Staff linking link (share with clinic staff):`,
      `\`https://t.me/${process.env.TELEGRAM_BOT_USERNAME || 'moonhands_admin_bot'}?start=${newClient.id}\``,
    ].join('\n');

    await ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[
        { text: '🔗 Link my Telegram to this clinic', callback_data: `linkme:${newClient.id}` }
      ]] }
    }).catch(() => {
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
    return true; // v2.5.1: buttons need the real outcome

  } catch (err) {
    console.error('[ONBOARDING_APPROVALS] /approveclinic error:', err.message, err.stack);
    ctx.reply('❌ Error approving clinic. Check logs.');
    return false;
  }
}

// ─── /REJECTCLINIC ───────────────────────────────────────────────

// v2.5.3: refArg — see handleApproveClinic. Button path passes the id
// directly instead of mocking ctx.message (getter-only, assignment no-op).
async function handleRejectClinic(ctx, refArg) {
  const args = refArg ? [refArg] : ctx.message.text.split(/\s+/).slice(1);
  if (args.length < 1) {
    return ctx.reply('⚠️ Usage: /rejectclinic <short_code> [reason]\n\nExample: /rejectclinic 8ab2e5b4 Duplicate submission');
  }

  const reason = args.slice(1).join(' ') || 'Not specified';

  try {
    const { submission, error: resolveErr, matches } = await resolveSubmission(args[0]);
    if (resolveErr === 'not_found') {
      ctx.reply(`❌ Pending submission "${args[0]}" not found.`);
      return false;
    }
    if (resolveErr === 'ambiguous') {
      ctx.reply(`⚠️ "${args[0]}" matches ${matches.length} pending submissions — use a longer code.`);
      return false;
    }
    if (resolveErr || !submission) {
      ctx.reply('⚠️ Unable to fetch submissions. Please try again.');
      return false;
    }
    const submissionId = submission.id;

    const { error: rejectErr } = await supabase
      .from('onboarding_submissions')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: String(ctx.from.id),
        admin_notes: `Rejected by Telegram admin ${ctx.from.id}: ${reason}`
      })
      .eq('id', submissionId);

    if (rejectErr) {
      console.error('[ONBOARDING_APPROVALS] Reject status update failed:', rejectErr.message);
      ctx.reply(`❌ Failed to update submission status: ${rejectErr.message}`);
      return false;
    }

    // v2.5.5: NO WhatsApp to the rejected submitter (Ash 2026-11-13).
    // Rejection is the UNVETTED branch — the number/email may be fake or
    // stolen: a public form + auto-reply made our sender a spam relay
    // (Meta restricts/bans on recipient reports), the admin's free-text
    // reason went out verbatim, and the "notified" claim fired even when
    // the send silently failed. Rejection = silence to the submitter;
    // the ADMIN follows up manually if warranted. (The approve-path
    // welcome stays: approval is the human-vetted branch.)
    const contactBits = [
      submission.contact_name ? escapeMarkdown(submission.contact_name) : null,
      submission.contact_role ? `(${escapeMarkdown(submission.contact_role)})` : null,
      submission.contact_email ? escapeMarkdown(submission.contact_email) : null,
      submission.contact_phone ? escapeMarkdown(submission.contact_phone) : null,
      submission.whatsapp_number ? `WA ${escapeMarkdown(submission.whatsapp_number)}` : null,
    ].filter(Boolean).join(' · ');

    ctx.reply(
      `❌ *Submission Rejected*\n\n` +
      `Clinic: ${escapeMarkdown(submission.clinic_name)}\n` +
      `Reason: ${escapeMarkdown(reason)}\n\n` +
      `No notification sent to the clinic — contact details are unverified.\n` +
      (contactBits ? `Manual follow-up if warranted: ${contactBits}` : 'No contact details on file.'),
      { parse_mode: 'Markdown' }
    ).catch(() => {
      ctx.reply(`❌ Submission #${submissionId} rejected. Reason: ${reason}`);
    });

    console.log(`[ONBOARDING_APPROVALS] Rejected submission ${submissionId}: ${reason}`);
    return true; // v2.5.1: buttons need the real outcome

  } catch (err) {
    console.error('[ONBOARDING_APPROVALS] /rejectclinic error:', err.message);
    ctx.reply('❌ Error rejecting submission. Check logs.');
    return false;
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
  resolveSubmission,
};
