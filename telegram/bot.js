/**
 * Moon Hands - Telegram Admin Bot (SECURED)
 * 
 * SECURITY BUILT-IN:
 * - Admin-only access (rejects all non-admin users)
 * - Rate limiting (per-user cooldown + flood protection)
 * - Input sanitization (HTML/script stripping)
 * - Command injection detection
 * - Audit logging of all commands
 * 
 * NEVER compromise on security. $80K lesson.
 */

// Global unhandled rejection protection — prevents server crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[TELEGRAM] Unhandled Rejection at:', promise, 'reason:', reason);
  // Log but don't crash — the bot keeps running
});
process.on('uncaughtException', (err) => {
  console.error('[TELEGRAM] Uncaught Exception:', err.message);
  // Don't exit — webhook server must stay alive
});

require('dotenv').config();
const { Telegraf } = require('telegraf');
const commands = require('./commands');
const { RateLimiter, sanitizeInput, processIncomingMessage } = require('../middleware/security');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

// ─── SECURITY LAYER ──────────────────────────────────────────────

const rateLimiter = new RateLimiter();

// Track command attempts for audit
const commandLog = [];

function auditCommand(userId, command, success, reason = null) {
  const entry = {
    userId,
    command,
    success,
    reason,
    timestamp: new Date().toISOString()
  };
  commandLog.push(entry);
  // Keep last 1000 entries
  if (commandLog.length > 1000) commandLog.shift();
  
  if (!success) {
    console.warn(`[AUDIT] BLOCKED command "${command}" from user ${userId}: ${reason}`);
  }
}

// ─── AUTH + SECURITY MIDDLEWARE ──────────────────────────────────

// ─── ACCESS CONTROL ──────────────────────────────────────────────
// Two user classes:
//   ADMIN (ADMIN_CHAT_ID)     → full access, changes apply instantly
//   CLINIC STAFF (linked via telegram_chat_ids) → clinic menu, booking
//     approvals, patient pause/resume, and change REQUESTS (need admin approval)
//   EVERYONE ELSE             → rejected

const linkedChatCache = new Map(); // chatId → { linked: boolean, at: timestamp }
const LINKED_CACHE_TTL = 5 * 60 * 1000;

async function isLinkedClinicChat(chatId) {
  const cached = linkedChatCache.get(chatId);
  if (cached && Date.now() - cached.at < LINKED_CACHE_TTL) return cached.linked;
  let linked = false;
  try {
    const { supabase } = require('../supabase/client');
    const { data } = await supabase
      .from('clients')
      .select('id')
      .contains('telegram_chat_ids', [chatId])
      .limit(1);
    linked = !!(data && data.length > 0);
  } catch (err) {
    console.error('[SECURITY] linked-chat check failed:', err.message);
  }
  linkedChatCache.set(chatId, { linked, at: Date.now() });
  return linked;
}

function isAdmin(ctx) {
  return ctx.from && ctx.from.id.toString() === ADMIN_CHAT_ID;
}

// Guard for admin-only commands/callbacks (clinic staff get a polite refusal)
function adminOnly(ctx) {
  if (isAdmin(ctx)) return true;
  ctx.reply('🔒 This area is for Moon Hands admin only.').catch(() => {});
  return false;
}

bot.use(async (ctx, next) => {
  // Layer 1: Allow admin + linked clinic staff; reject everyone else
  if (ctx.from && !isAdmin(ctx)) {
    const linked = await isLinkedClinicChat(ctx.chat?.id ?? ctx.from.id);
    const isStartLinking = ctx.message?.text?.startsWith('/start'); // allow linking flow
    if (!linked && !isStartLinking) {
      console.warn(`[SECURITY] Unauthorized access attempt from ${ctx.from.id} (${ctx.from.username || 'unknown'})`);
      return ctx.reply('\ud83d\udeab Unauthorized. This bot is private. Access logged.');
    }
  }
  
  // Layer 2: Rate limiting (flood protection)
  const rateCheck = rateLimiter.checkTelegram(ctx.from.id);
  if (!rateCheck.allowed) {
    const msg = rateCheck.level === 'flood' 
      ? '\ud83d\udea8 Flood detected. You are temporarily blocked for 5 minutes.'
      : `\u23f1\ufe0f Too fast. Wait ${rateCheck.retryAfter} seconds.`;
    auditCommand(ctx.from.id, ctx.message?.text || 'unknown', false, 'RATE_LIMITED');
    return ctx.reply(msg);
  }
  
  // Layer 3: Input sanitization on all text
  if (ctx.message && ctx.message.text) {
    const original = ctx.message.text;
    const sanitized = sanitizeInput(original);
    
    // Check for injection in commands
    if (original !== sanitized) {
      console.warn(`[SECURITY] Input sanitized for user ${ctx.from.id}: "${original}" → "${sanitized}"`);
    }
    
    // Check for prompt injection patterns
    const injectionCheck = processIncomingMessage(original);
    if (injectionCheck.blocked) {
      auditCommand(ctx.from.id, original, false, `INJECTION:${injectionCheck.reason}`);
      console.error(`[SECURITY] INJECTION ATTEMPT from admin ${ctx.from.id}: ${injectionCheck.reason}`);
      return ctx.reply('\ud83d\udea8 Security alert: Injection pattern detected. Command blocked and logged.');
    }
    
    // Replace with sanitized version
    ctx.message.text = sanitized;
  }
  
  return next();
});

// ─── INLINE KEYBOARD MENU ────────────────────────────────────────

const { Markup } = require('telegraf');

// Main menu layout — global actions only. Clinic-specific actions
// (Add Service, Update Price, Hours, FAQ, Voice, Config, Usage,
// Pause/Resume) live BEHIND a clinic pick: admin chooses the clinic
// first, then gets that clinic's action menu (see clinicdash: handler).
// NOTE: the admin dashboard keyboard is built dynamically by
// adminMainMenu() below — global actions + one button per clinic.
// (Clinic edit actions were removed from the top-level menu: admin
//  picks the clinic FIRST, then sees that clinic's action menu.)

// Admin entry screen: "Which clinic do you want to check/edit?"
// Dynamic keyboard = global actions + one button per clinic.
async function adminMainMenu(ctx, edit = false) {
  const { supabase } = require('../supabase/client');
  const { data: clients } = await supabase
    .from('clients')
    .select('slug, name, status')
    .order('created_at', { ascending: true });

  const buttons = [
    [
      Markup.button.callback('📊 Status', 'menu_health'),
      Markup.button.callback('🏥 Clinics', 'menu_clients'),
      Markup.button.callback('🛡 Security', 'menu_security'),
    ],
    [Markup.button.callback('❓ Full Command List', 'menu_help')],
  ];

  if (clients && clients.length > 0) {
    for (const c of clients) {
      const statusEmoji = c.status === 'active' ? '✅' : c.status === 'paused' ? '⏸' : '⚡';
      buttons.push([Markup.button.callback(`${statusEmoji} ${c.name}`, `clinicdash:${c.slug}`)]);
    }
  }

  const text = `📱 Moon Hands Admin\n\nWhich clinic do you want to check/edit? Tap a clinic below to manage it.`;
  const keyboard = Markup.inlineKeyboard(buttons);
  if (edit) {
    try {
      return await ctx.editMessageText(text, keyboard);
    } catch {
      return await ctx.reply(text, keyboard);
    }
  }
  return await ctx.reply(text, keyboard);
}

// Per-clinic action dashboard — shown AFTER the admin picks a clinic.
// All edit actions (Add Service, Update Price, etc.) hang off this menu,
// pre-scoped to the chosen clinic via act:<action>:<slug> callbacks.
async function showClinicDashboard(ctx, slug, edit = true) {
  const { supabase } = require('../supabase/client');
  const { data: clinic } = await supabase
    .from('clients')
    .select('name, status')
    .eq('slug', slug)
    .single();

  const name = clinic?.name || slug;
  const cb = Markup.button.callback;
  const buttons = [
    [cb('⚙️ View Config', `act:viewconfig:${slug}`), cb('📈 Usage', `act:usage:${slug}`)],
    [cb('➕ Add Service', `act:addservice:${slug}`), cb('💰 Update Price', `act:updateprice:${slug}`)],
    [cb('🕐 Update Hours', `act:updatehours:${slug}`), cb('❓ Add FAQ', `act:addfaq:${slug}`)],
    [cb('🎤 Voice', `act:voice:${slug}`)],
    [cb('⏸ Pause AI', `act:pause:${slug}`), cb('▶️ Resume AI', `act:resume:${slug}`)],
    [cb('🔙 Back to Clinics', 'menu_main')],
  ];

  const text = `🏥 *${name}*\nStatus: ${clinic?.status || 'unknown'}\n\nWhat do you want to do with this clinic?`;
  const keyboard = Markup.inlineKeyboard(buttons);
  if (edit) {
    try {
      return await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    } catch {
      return await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
    }
  }
  return await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
}

// Back button for sub-menus
const BACK_TO_MENU = Markup.inlineKeyboard([
  [Markup.button.callback('🔙 Back to Menu', 'menu_main')],
]);

// ─── COMBINED /START — ADMIN vs CLINIC STAFF ────────────────────
//
// DUAL-MODE: This bot serves both Moon Hands admin (Ash) and
// clinic staff. The same /start command shows the right view
// based on who's using it.
//
// Admin (ADMIN_CHAT_ID)        → Inline admin menu (business owner view)
// Clinic staff (/start GLOW001) → Reply quick menu (clinic admin view)

bot.start(safeHandler('/start', async (ctx) => {
  const chatId = ctx.chat.id;
  const name = ctx.from.first_name || 'there';

  // ── MODE 1: ADMIN ──
  if (chatId.toString() === ADMIN_CHAT_ID) {
    auditCommand(ctx.from.id, '/start', true);
    await ctx.reply(`Moon Hands Admin Bot\n\nWelcome back, boss.`);
    await adminMainMenu(ctx);
    return;
  }

  // ── MODE 2: CLINIC STAFF ──
  // Clinic staff linking via /start GLOW001
  const startParam = ctx.payload; // e.g., "GLOW001" from /start GLOW001
  const { linkChatToClinic } = require('./multi-clinic-sender');
  const { supabase } = require('../supabase/client');

  // Check if this chat is already linked to any clinic
  const { data: linkedClinics } = await supabase
    .from('clients')
    .select('id, name, telegram_chat_ids')
    .contains('telegram_chat_ids', [chatId]);

  // If linked to exactly 1 clinic → show quick menu
  if (linkedClinics && linkedClinics.length === 1 && !startParam) {
    await ctx.reply(
      `👋 Welcome back, ${name}!\n\n` +
      `You're linked to *${linkedClinics[0].name}*.`,
      { parse_mode: 'Markdown', reply_markup: QUICK_MENU_KEYBOARD }
    );
    return;
  }

  // If linked to multiple clinics → ask which one
  if (linkedClinics && linkedClinics.length > 1 && !startParam) {
    const keyboard = linkedClinics.map(c => [{ text: c.name, callback_data: `select_clinic:${c.id}` }]);
    await ctx.reply(
      `👋 Welcome back, ${name}!\n\n` +
      `You're linked to multiple clinics. Which one?`,
      { reply_markup: { inline_keyboard: keyboard } }
    );
    return;
  }

  // New user with start parameter (from onboarding link)
  if (startParam) {
    const result = await linkChatToClinic(chatId, startParam);
    if (result.success) {
      await ctx.reply(
        `👋 Welcome, ${name}!\n\n` +
        `You're now linked to *${result.clinicName}*.\n\n` +
        `You'll receive booking notifications and alerts for this clinic.`,
        { parse_mode: 'Markdown', reply_markup: QUICK_MENU_KEYBOARD }
      );
    } else {
      await ctx.reply(
        `❌ Could not link to clinic: ${result.error}\n\n` +
        `Please contact Pixel Vault support.`,
        { parse_mode: 'Markdown' }
      );
    }
    return;
  }

  // New user without start parameter — show available clinics
  const { data: allClinics } = await supabase
    .from('clients')
    .select('id, name')
    .order('name');

  if (!allClinics || allClinics.length === 0) {
    await ctx.reply('❌ No clinics found. Contact Pixel Vault support.');
    return;
  }

  const keyboard = allClinics.map(c => [{ text: c.name, callback_data: `link_clinic:${c.id}` }]);
  await ctx.reply(
    `👋 Welcome to Moon Hands, ${name}!\n\n` +
    `Which clinic are you from?`,
    { reply_markup: { inline_keyboard: keyboard } }
  );
}));

// ─── COMBINED /MENU — ADMIN vs CLINIC STAFF ─────────────────────

bot.command('menu', safeHandler('/menu', async (ctx) => {
  const chatId = ctx.chat.id;

  // ── MODE 1: ADMIN ──
  if (chatId.toString() === ADMIN_CHAT_ID) {
    await adminMainMenu(ctx);
    return;
  }

  // ── MODE 2: CLINIC STAFF ──
  await ctx.reply(
    '📱 *Moon Hands Quick Menu*\n\n' +
    'Tap any button to manage your clinics.',
    {
      parse_mode: 'Markdown',
      reply_markup: QUICK_MENU_KEYBOARD
    }
  );
}));

// ─── CALLBACK HANDLERS ───────────────────────────────────────────

// Helper: extract slug from the last message or prompt user
async function getSlug(ctx) {
  // Try to get slug from user's last /clients view or prompt
  // For now, show a message asking them to type the clinic slug
  return null;
}

// Dashboard callbacks
bot.action('menu_main', safeHandler('menu_main', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await adminMainMenu(ctx, true);
}));

// Admin picked a clinic → show that clinic's action dashboard
bot.action(/^clinicdash:(.+)$/, safeHandler('clinicdash', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await showClinicDashboard(ctx, ctx.match[1], true);
}));

bot.action('menu_health', safeHandler('menu_health', async (ctx) => {
  await ctx.answerCbQuery('Checking status...');
  await commands.handleHealth(ctx);
}));

bot.action('menu_clients', safeHandler('menu_clients', async (ctx) => {
  await ctx.answerCbQuery('Loading clinics...');
  await commands.handleClients(ctx);
}));

bot.action('menu_usage', safeHandler('menu_usage', async (ctx) => {
  await ctx.answerCbQuery();
  await showClinicPicker(ctx, 'usage');
}));

bot.action('menu_viewconfig', safeHandler('menu_viewconfig', async (ctx) => {
  await ctx.answerCbQuery();
  await showClinicPicker(ctx, 'viewconfig');
}));

bot.action('menu_security', safeHandler('menu_security', async (ctx) => {
  await ctx.answerCbQuery('Checking security...');
  await commands.handleSecurity(ctx);
}));

bot.action('menu_help', safeHandler('menu_help', async (ctx) => {
  await ctx.answerCbQuery('Loading help...');
  await commands.handleHelp(ctx);
}));

// Service management callbacks — these need slug + params, so show instruction
// ─── CLINIC-FIRST ACTION FLOW ────────────────────────────────────
// Every admin action (Add Service, Update Price, Hours, FAQ, Voice,
// View Config, Usage, Pause, Resume) requires choosing a clinic FIRST.
// Flow: tap action → clinic picker → action executes for that clinic
// with the slug already pre-filled. No more hardcoded 'pixelvault'.

const ACTION_LABELS = {
  addservice: '➕ Add Service',
  updateprice: '💰 Update Price',
  updatehours: '🕐 Update Hours',
  addfaq: '❓ Add FAQ',
  voice: '🎤 Update Brand Voice',
  viewconfig: '⚙️ View Config',
  usage: '📈 Usage',
  pause: '⏸ Pause AI',
  resume: '▶️ Resume AI',
};

async function showClinicPicker(ctx, action) {
  const { supabase } = require('../supabase/client');
  const { data: clients, error } = await supabase
    .from('clients')
    .select('slug, name, status')
    .order('created_at', { ascending: true });

  if (error || !clients || clients.length === 0) {
    return ctx.reply('❌ No clinics found.', BACK_TO_MENU);
  }

  const label = ACTION_LABELS[action] || action;
  const buttons = clients.map(c => {
    const statusEmoji = c.status === 'active' ? '✅' : c.status === 'paused' ? '⏸' : '⚡';
    return [Markup.button.callback(`${statusEmoji} ${c.name}`, `act:${action}:${c.slug}`)];
  });
  buttons.push([Markup.button.callback('🔙 Back to Menu', 'menu_main')]);

  await ctx.reply(
    `${label}\n\nWhich clinic?`,
    Markup.inlineKeyboard(buttons)
  );
}

// Executes the chosen action for the chosen clinic
bot.action(/^act:(\w+):(.+)$/, safeHandler('act', async (ctx) => {
  const action = ctx.match[1];
  const slug = ctx.match[2];
  await ctx.answerCbQuery(`${ACTION_LABELS[action] || action} → ${slug}`);

  switch (action) {
    case 'viewconfig': return commands.handleViewConfig(ctx, slug);
    case 'usage': return commands.handleUsage(ctx, slug);
    case 'pause': return commands.handlePause(ctx, slug);
    case 'resume': return commands.handleResume(ctx, slug);
    case 'addservice':
      return ctx.reply(
        `➕ Add Service to *${slug}*\n\nType:\n/addservice ${slug} "Service Name" $price durationMin\n\nExamples:\n/addservice ${slug} "HIFU Treatment" $350 60\n/addservice ${slug} "Consultation" "$50-$100" 60\n\n💡 Price can be a fixed amount ($350) or a range ("$50-$100") — quote the range.`,
        Markup.inlineKeyboard([[Markup.button.callback(`🔙 Back to ${slug}`, `clinicdash:${slug}`)]])
      );
    case 'updateprice':
      return ctx.reply(
        `💰 Update Price for *${slug}*\n\nType:\n/updateprice ${slug} "Service Name" $newPrice\n\nExamples:\n/updateprice ${slug} "HIFU Treatment" $299\n/updateprice ${slug} "Consultation" "$50-$100"\n\n💡 Ranges are supported — quote them: "$50-$100".`,
        Markup.inlineKeyboard([[Markup.button.callback(`🔙 Back to ${slug}`, `clinicdash:${slug}`)]])
      );
    case 'updatehours':
      return ctx.reply(
        `🕐 Update Hours for *${slug}*\n\nType:\n/updatehours ${slug} <day> HH:MM HH:MM\n\nExample:\n/updatehours ${slug} Saturday 09:00 17:00`,
        BACK_TO_MENU
      );
    case 'addfaq':
      return ctx.reply(
        `❓ Add FAQ for *${slug}*\n\nType:\n/addfaq ${slug} "Question?" | "Answer"\n\nExample:\n/addfaq ${slug} "Parking available?" | "Free parking at rear"`,
        BACK_TO_MENU
      );
    case 'voice':
      return ctx.reply(
        `🎤 Update Brand Voice for *${slug}*\n\nType:\n/updatevoice ${slug} <field> <value>\n\nFields: name, greeting, tone, enthusiasm, notes\n\nExample:\n/updatevoice ${slug} greeting "Welcome to Glow!"`,
        BACK_TO_MENU
      );
    default:
      return ctx.reply('⚠️ Unknown action.', BACK_TO_MENU);
  }
}));

bot.action('menu_addservice', safeHandler('menu_addservice', async (ctx) => {
  await ctx.answerCbQuery();
  await showClinicPicker(ctx, 'addservice');
}));

bot.action('menu_updateprice', safeHandler('menu_updateprice', async (ctx) => {
  await ctx.answerCbQuery();
  await showClinicPicker(ctx, 'updateprice');
}));

bot.action('menu_updatehours', safeHandler('menu_updatehours', async (ctx) => {
  await ctx.answerCbQuery();
  await showClinicPicker(ctx, 'updatehours');
}));

bot.action('menu_addfaq', safeHandler('menu_addfaq', async (ctx) => {
  await ctx.answerCbQuery();
  await showClinicPicker(ctx, 'addfaq');
}));

bot.action('menu_voice', safeHandler('menu_voice', async (ctx) => {
  await ctx.answerCbQuery();
  await showClinicPicker(ctx, 'voice');
}));

bot.action('menu_pause', safeHandler('menu_pause', async (ctx) => {
  await ctx.answerCbQuery();
  await showClinicPicker(ctx, 'pause');
}));

bot.action('menu_resume', safeHandler('menu_resume', async (ctx) => {
  await ctx.answerCbQuery();
  await showClinicPicker(ctx, 'resume');
}));

// ─── BOOKING APPROVAL INLINE BUTTONS ─────────────────────────────
// Approve/Reject buttons from booking notification messages

bot.action(/^approve_(.+)$/, safeHandler('approve_btn', async (ctx) => {
  const apptId = ctx.match[1];
  await ctx.answerCbQuery('Approving booking...');
  
  const { handleApproveById } = require('./commands/approvals');
  const result = await handleApproveById(apptId, ctx.from.id);
  
  if (result.success) {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply(`✅ Booking approved for ${result.patientName}\n📅 ${result.date} at ${result.time}\n🩺 ${result.treatment}\n✓ Patient notified\n${result.calendarSynced ? '✓ Google Calendar synced' : ''}`);
  } else {
    await ctx.answerCbQuery(`❌ ${result.error}`, { show_alert: true });
  }
}));

bot.action(/^reject_(.+)$/, safeHandler('reject_btn', async (ctx) => {
  const apptId = ctx.match[1];
  await ctx.answerCbQuery('Rejecting booking...');
  
  const { handleRejectById } = require('./commands/approvals');
  const result = await handleRejectById(apptId, ctx.from.id);
  
  if (result.success) {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply(`❌ Booking rejected for ${result.patientName}\n📅 ${result.date} at ${result.time}\n🩺 ${result.treatment}\n✓ Patient notified`);
  } else {
    await ctx.answerCbQuery(`❌ ${result.error}`, { show_alert: true });
  }
}));

// ─── COMMAND HANDLER WRAPPER ─────────────────────────────────────
// ALL async command handlers wrapped with try/catch to prevent
// unhandled promise rejections from crashing the server.

function safeHandler(commandName, handlerFn) {
  return async (ctx) => {
    try {
      auditCommand(ctx.from.id, commandName, true);
      await handlerFn(ctx);
    } catch (err) {
      console.error(`[TELEGRAM] ${commandName} error:`, err.message);
      auditCommand(ctx.from.id, commandName, false, err.message);
      ctx.reply('\u26a0\ufe0f Command failed. Try again in a moment.').catch(() => {});
    }
  };
}

// Admin-only command guard — clinic staff may NOT use these
const adminCmd = (name, fn) => safeHandler(name, async (ctx) => {
  if (!adminOnly(ctx)) return;
  return fn(ctx);
});

bot.help(safeHandler('/help', async (ctx) => {
  if (isAdmin(ctx)) return commands.handleHelp(ctx);
  // Clinic staff help — their own command set
  await ctx.reply(
    '📖 *Clinic Staff Commands*\n\n' +
    '*Daily ops:*\n' +
    '`/patientpause <phone>` — Pause bot for a patient\n' +
    '`/patientresume <phone>` — Resume bot\n' +
    '`/patientstatus` — List paused conversations\n\n' +
    '*Request changes (Moon Hands approves before going live):*\n' +
    '`/req_addservice "Name" $price durationMin`\n' +
    '`/req_updateprice "Name" $newPrice`\n' +
    '`/req_hours Monday 09:00 18:00`\n' +
    '`/req_faq Question? | Answer`\n' +
    '`/req_voice greeting "Your new greeting"`',
    { parse_mode: 'Markdown' }
  );
}));
bot.command('clients', adminCmd('/clients', commands.handleClients));
bot.command('testalerts', adminCmd('/testalerts', commands.handleTestAlerts));
bot.command('viewconfig', adminCmd('/viewconfig', commands.handleViewConfig));
bot.command('addservice', adminCmd('/addservice', commands.handleAddService));
bot.command('updateprice', adminCmd('/updateprice', commands.handleUpdatePrice));
bot.command('removeservice', adminCmd('/removeservice', commands.handleRemoveService));
bot.command('updatehours', adminCmd('/updatehours', commands.handleUpdateHours));
bot.command('addfaq', adminCmd('/addfaq', commands.handleAddFaq));
bot.command('removefaq', adminCmd('/removefaq', commands.handleRemoveFaq));
bot.command('updatevoice', adminCmd('/updatevoice', commands.handleUpdateVoice));
bot.command('pause', adminCmd('/pause', commands.handlePause));
bot.command('resume', adminCmd('/resume', commands.handleResume));
bot.command('usage', adminCmd('/usage', commands.handleUsage));
bot.command('health', adminCmd('/health', commands.handleHealth));
bot.command('security', adminCmd('/security', commands.handleSecurity));
bot.command('threats', adminCmd('/threats', commands.handleThreats));
bot.command('authlog', adminCmd('/authlog', commands.handleAuthLog));
bot.command('debug', adminCmd('/debug', commands.handleDebug));

// ─── ADMIN: /requests — list pending change requests ─────────────
bot.command('requests', adminCmd('/requests', async (ctx) => {
  const { listPendingRequests, ACTION_LABELS } = require('./change-requests');
  const pending = await listPendingRequests();
  if (pending.length === 0) {
    return ctx.reply('✅ No pending change requests.');
  }
  const lines = [`🔔 *PENDING CHANGE REQUESTS (${pending.length})*`, ''];
  pending.forEach((r, i) => {
    lines.push(`${i + 1}. *${r.clients?.name || 'Unknown'}* — ${ACTION_LABELS[r.action] || r.action}`);
    lines.push(`   ID: \`${r.id.slice(0, 8)}\` · ${new Date(r.created_at).toLocaleString('en-SG')}`);
  });
  lines.push('', 'Approve/reject from the original request message buttons.');
  await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
}));

// ─── CLINIC STAFF: CHANGE REQUEST COMMANDS ───────────────────────
// These NEVER apply directly — they create a pending_changes row and
// notify Moon Hands admin with Approve/Reject buttons. Slug is resolved
// automatically from the staff chat's linked clinic.

async function resolveStaffClinic(ctx) {
  const chatId = ctx.chat.id;
  const { supabase } = require('../supabase/client');
  const { data: linked } = await supabase
    .from('clients')
    .select('id, name, slug')
    .contains('telegram_chat_ids', [chatId]);
  if (!linked || linked.length === 0) {
    await ctx.reply('❌ Your Telegram is not linked to a clinic yet. Use the onboarding link (e.g. /start GLOW001) first.');
    return null;
  }
  return linked[0]; // primary linked clinic
}

async function submitChangeRequest(ctx, action, payload) {
  const clinic = await resolveStaffClinic(ctx);
  if (!clinic) return;
  const { createChangeRequest, ACTION_LABELS } = require('./change-requests');
  const result = await createChangeRequest({
    clinicId: clinic.id,
    clinicName: clinic.name,
    action,
    payload,
    requestedBy: ctx.from.id,
  });
  if (result.success) {
    await ctx.reply(
      `📨 *Request Submitted*\n\n` +
      `🏥 ${clinic.name}\n` +
      `Action: ${ACTION_LABELS[action] || action}\n\n` +
      `Moon Hands will review and approve it. You'll be notified here once it's live (usually within 24h).`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply(`❌ Could not submit request: ${result.error}`);
  }
}

bot.command('req_addservice', safeHandler('/req_addservice', async (ctx) => {
  const { normalizePrice } = require('../utils/price');
  const raw = ctx.message.text.replace('/req_addservice', '').trim();
  // Price may be fixed ($350) or a quoted range ("$50-$100")
  const match = raw.match(/[“"]([^”"]+)[”"]\s+[“"']?\$?(\d+(?:\s*[-–—]\s*\$?\d+)?)[”"']?\s+(\d+)/);
  if (!match) {
    return ctx.reply('⚠️ Format: `/req_addservice "Service Name" $price durationMin`\nExamples:\n`/req_addservice "HIFU Treatment" $350 60`\n`/req_addservice "Consultation" "$50-$100" 60`', { parse_mode: 'Markdown' });
  }
  const [, name, rawPrice, duration] = match;
  const price = normalizePrice(rawPrice);
  if (!price) {
    return ctx.reply(`❌ Could not understand the price "${rawPrice}". Use a fixed amount ($350) or a quoted range ("$50-$100").`);
  }
  await submitChangeRequest(ctx, 'add_service', { name: name.trim(), price, duration: parseInt(duration) });
}));

bot.command('req_updateprice', safeHandler('/req_updateprice', async (ctx) => {
  const { normalizePrice } = require('../utils/price');
  const raw = ctx.message.text.replace('/req_updateprice', '').trim();
  const match = raw.match(/[“"]([^”"]+)[”"]\s+[“"']?\$?(\d+(?:\s*[-–—]\s*\$?\d+)?)[”"']?/);
  if (!match) {
    return ctx.reply('⚠️ Format: `/req_updateprice "Service Name" $newPrice`\nExamples:\n`/req_updateprice "HIFU Treatment" $299`\n`/req_updateprice "Consultation" "$50-$100"`', { parse_mode: 'Markdown' });
  }
  const [, serviceName, rawPrice] = match;
  const newPrice = normalizePrice(rawPrice);
  if (!newPrice) {
    return ctx.reply(`❌ Could not understand the price "${rawPrice}". Use a fixed amount ($299) or a quoted range ("$50-$100").`);
  }
  await submitChangeRequest(ctx, 'update_price', { service_name: serviceName.trim(), new_price: newPrice });
}));

bot.command('req_hours', safeHandler('/req_hours', async (ctx) => {
  const args = ctx.message.text.split(/\s+/).slice(1);
  if (args.length < 3) {
    return ctx.reply('⚠️ Format: `/req_hours <day> HH:MM HH:MM`\nExample: `/req_hours Saturday 09:00 17:00`', { parse_mode: 'Markdown' });
  }
  const [day, openTime, closeTime] = args;
  await submitChangeRequest(ctx, 'update_hours', { day, open_time: openTime, close_time: closeTime });
}));

bot.command('req_faq', safeHandler('/req_faq', async (ctx) => {
  const raw = ctx.message.text.replace('/req_faq', '').trim();
  const parts = raw.split(/\s*\|\s*/, 2);
  if (parts.length !== 2) {
    return ctx.reply('⚠️ Format: `/req_faq Question? | Answer`\nExample: `/req_faq Parking available? | Free parking at rear`', { parse_mode: 'Markdown' });
  }
  const question = parts[0].replace(/^[“"]/, '').replace(/[”"]$/g, '').trim();
  await submitChangeRequest(ctx, 'add_faq', { question, answer: parts[1].trim() });
}));

bot.command('req_voice', safeHandler('/req_voice', async (ctx) => {
  const args = ctx.message.text.split(/\s+/).slice(1);
  if (args.length < 2) {
    return ctx.reply('⚠️ Format: `/req_voice <field> <value>`\nFields: name, greeting, tone, enthusiasm, notes\nExample: `/req_voice greeting "Welcome to Glow!"`', { parse_mode: 'Markdown' });
  }
  const field = args[0].toLowerCase();
  const value = args.slice(1).join(' ').replace(/^[“"]/, '').replace(/[”"]$/g, '');
  await submitChangeRequest(ctx, 'update_voice', { field, value });
}));

// ─── TEST CLOSING SUMMARY ────────────────────────────────────────

bot.command('testsummary', safeHandler('/testsummary', async (ctx) => {
  const chatId = ctx.chat.id;
  if (chatId.toString() !== ADMIN_CHAT_ID) {
    return ctx.reply('⚠️ Admin only.');
  }
  
  await ctx.reply('🧪 Triggering closing summary check...');
  
  try {
    const { checkAndSendClosingSummaries } = require('../jobs/closing-summary');
    await checkAndSendClosingSummaries();
    await ctx.reply('✅ Closing summary check completed. Check Render logs for details.');
  } catch (err) {
    console.error('[TELEGRAM /testsummary] Error:', err.message);
    await ctx.reply(`❌ Error: ${err.message}`);
  }
}));

// ─── STAFF TAKEOVER COMMANDS ─────────────────────────────────────
// Allow clinic staff to pause/resume bot per-patient to prevent
// bot↔staff double-reply conflicts when staff manually replies.

const {
  handlePauseCommand,
  handleResumeCommand,
  handleStatusCommand,
  handleTakeoverCommand
} = require('../middleware/staff-takeover');

bot.command('patientpause', safeHandler('/patientpause', async (ctx) => {
  const text = ctx.message.text;
  const chatId = ctx.chat.id;
  // For multi-clinic: resolve clinic from chat context
  // For now, pass null (staff-takeover handles null clinicId)
  await handlePauseCommand(bot.telegram, chatId, text, null);
}));

bot.command('patientresume', safeHandler('/patientresume', async (ctx) => {
  const text = ctx.message.text;
  const chatId = ctx.chat.id;
  await handleResumeCommand(bot.telegram, chatId, text);
}));

bot.command('patientstatus', safeHandler('/patientstatus', async (ctx) => {
  const chatId = ctx.chat.id;
  await handleStatusCommand(bot.telegram, chatId, null);
}));

bot.command('takeover', safeHandler('/takeover', async (ctx) => {
  const text = ctx.message.text;
  const chatId = ctx.chat.id;
  await handleTakeoverCommand(bot.telegram, chatId, text, null);
}));

// ─── QUICK MENU KEYBOARD ─────────────────────────────────────────
// ReplyKeyboardMarkup with emoji buttons for common actions
// Matches the screenshot style: green grid buttons with icons

// ─── QUICK MENU KEYBOARD ─────────────────────────────────────────
// ReplyKeyboardMarkup with emoji buttons for clinic staff.
// DESIGN DECISION: Only show buttons clinic staff NEED for daily ops.
// DELIBERATELY EXCLUDED (business optics):
//   - 📈 Usage (could make clinics question subscription value)
//   - 🛡️ Security (internal Moon Hands concern, not clinic's)
//   - ➕ Add Service / 💰 Update Price / 🕐 Update Hours 
//     (clinic submits REQUEST, Moon Hands approves and applies)
//
// This prevents:
//   1. Clinics seeing low usage → unsubscribing
//   2. Clinics breaking bot with invalid data entry
//   3. No audit trail of who changed what

const QUICK_MENU_KEYBOARD = {
  keyboard: [
    [{ text: '📊 Status' }, { text: '⚙️ View Config' }, { text: '📝 Request Changes' }],
    [{ text: '⏸️ Pause AI' }, { text: '▶️ Resume AI' }, { text: '📋 My Bookings' }],
    [{ text: '❓ Help' }],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
};

// NOTE: /menu and /start handlers are defined above (combined admin + clinic staff).
// Clinic staff linking via /start GLOW001 and quick menu are handled there.
// The QUICK_MENU_KEYBOARD definition above is used by those combined handlers.

// ─── INLINE KEYBOARD CALLBACK HANDLER ────────────────────────────
// Handles taps on inline buttons (e.g., "▶️ Resume Bot", "🔄 Suggest Alternative")

bot.on('callback_query', async (ctx, next) => {
  // Wrap manually so we can call next() for unmatched callbacks
  // (safeHandler doesn't pass next through, which would swallow
  //  callbacks handled by bot.action() registrations below)
  try {
    auditCommand(ctx.from?.id, 'callback_query', true);
    await callbackQueryRouter(ctx, next);
  } catch (err) {
    console.error(`[TELEGRAM] callback_query error:`, err.message);
    auditCommand(ctx.from?.id, 'callback_query', false, err.message);
    ctx.reply('⚠️ Command failed. Try again in a moment.').catch(() => {});
  }
});

async function callbackQueryRouter(ctx, next) {
  // SECURITY: Validate callback query structure before processing
  if (!ctx.callbackQuery || !ctx.callbackQuery.data) {
    console.warn('[SECURITY] Invalid callback_query: missing data');
    return;
  }
  if (!ctx.callbackQuery.message || !ctx.callbackQuery.message.chat) {
    console.warn('[SECURITY] Invalid callback_query: missing message/chat');
    return ctx.answerCbQuery('Invalid request').catch(() => {});
  }
  
  const data = ctx.callbackQuery.data;
  const chatId = ctx.callbackQuery.message.chat.id;

  // ── Admin-only callback areas: main menu, clinic management, change approvals ──
  const ADMIN_CALLBACK_PREFIXES = ['menu_', 'act:', 'clinic_', 'chg_', 'clinicdash:'];
  if (ADMIN_CALLBACK_PREFIXES.some(p => data.startsWith(p))) {
    if (!isAdmin(ctx)) {
      await ctx.answerCbQuery('🔒 Moon Hands admin only').catch(() => {});
      return;
    }
  }

  // ── Change request approval: Approve & Apply ──
  if (data.startsWith('chg_ok:')) {
    const reqId = data.replace('chg_ok:', '');
    await ctx.answerCbQuery('Applying change...');
    const { applyChangeRequest } = require('./change-requests');
    const result = await applyChangeRequest(reqId, ctx.from.id);
    if (result.success) {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
      await ctx.reply(`✅ *APPROVED & APPLIED*\n\n🏥 ${result.clinicName}\n${result.summary}\n\n✓ Clinic notified · change is live`);
    } else {
      await ctx.reply(`⚠️ ${result.error || 'Failed to apply change'}`);
    }
    return;
  }

  // ── Change request approval: Reject ──
  if (data.startsWith('chg_no:')) {
    const reqId = data.replace('chg_no:', '');
    await ctx.answerCbQuery('Rejecting...');
    const { rejectChangeRequest } = require('./change-requests');
    const result = await rejectChangeRequest(reqId, ctx.from.id);
    if (result.success) {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
      await ctx.reply(`❌ *REQUEST REJECTED*\n\n🏥 ${result.clinicName}\n\n✓ Clinic notified · nothing was changed`);
    } else {
      await ctx.reply(`⚠️ ${result.error || 'Failed to reject'}`);
    }
    return;
  }

  // ── Resume bot for patient ──
  if (data.startsWith('resume:')) {
    const phone = data.replace('resume:', '');
    const result = require('../middleware/staff-takeover').resumeBot(phone);
    
    if (result.success) {
      await ctx.answerCbQuery(`Bot resumed for ${result.patientPhone}`);
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply(`🔊 Bot resumed for ${result.patientPhone}. The bot will now auto-reply to this patient again.`);
    } else {
      await ctx.answerCbQuery(result.error);
    }
    return;
  }
  
  // ── Clinic linking ──
  if (data.startsWith('link_clinic:') || data.startsWith('select_clinic:')) {
    const clinicId = data.split(':')[1];
    const { linkChatToClinic } = require('./multi-clinic-sender');
    const result = await linkChatToClinic(chatId, clinicId);
    
    if (result.success) {
      await ctx.answerCbQuery(`Linked to ${result.clinicName}`);
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply(
        `✅ You're now linked to *${result.clinicName}*!`,
        { parse_mode: 'Markdown', reply_markup: QUICK_MENU_KEYBOARD }
      );
    } else {
      await ctx.answerCbQuery('Failed to link');
      await ctx.reply(`❌ ${result.error}`);
    }
    return;
  }
  
  // ── Suggest alternative timeslot ──
  // Step 1: Clinic taps "🔄 Suggest Alternative" on booking notification
  if (data.startsWith('suggest_alt_')) {
    const bookingId = data.replace('suggest_alt_', '');
    // Validate bookingId is a UUID-like string (prevent injection)
    if (!bookingId || bookingId.length < 8) {
      return ctx.answerCbQuery('Invalid booking ID');
    }
    // Store with size-limited, TTL-aware setter
    const { setPendingAlternative } = require('./booking-notifications');
    setPendingAlternative(chatId, bookingId);
    
    await ctx.answerCbQuery('Suggesting alternative time');
    await ctx.reply(
      `🔄 *Suggest Alternative Time*\n\n` +
      `Please reply with the alternative time you'd like to offer:\n\n` +
      `Examples:\n` +
      `• "Wednesday 3pm"\n` +
      `• "Tomorrow at 2:30pm"\n` +
      `• "Next Monday 10am"`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // ── Patient confirms alternative timeslot ──
  if (data.startsWith('confirm_alt_')) {
    const bookingId = data.replace('confirm_alt_', '');
    // Forward to booking confirmation handler
    const { handlePatientConfirmAlternative } = require('./booking-notifications');
    const result = await handlePatientConfirmAlternative(bookingId);
    if (result.success) {
      await ctx.answerCbQuery('Alternative confirmed');
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } else {
      await ctx.answerCbQuery(`❌ ${result.error}`, { show_alert: true });
    }
    return;
  }
  
  // ── Clinic menu selection ──
  // These are handled here because this catch-all runs before bot.action()
  // handlers registered later. Without this, clinic_menu: callbacks get lost.
  if (data.startsWith('clinic_menu:')) {
    const slug = data.replace('clinic_menu:', '');
    await ctx.answerCbQuery(`Loading ${slug}...`);
    await commands.showClinicMenu(ctx, slug);
    return;
  }
  
  // ── Clinic action buttons ──
  if (data.startsWith('clinic_viewconfig:')) {
    const slug = data.replace('clinic_viewconfig:', '');
    await ctx.answerCbQuery('Loading config...');
    await commands.handleViewConfig(ctx, slug);
    return;
  }
  if (data.startsWith('clinic_usage:')) {
    const slug = data.replace('clinic_usage:', '');
    await ctx.answerCbQuery('Loading usage...');
    await commands.handleUsage(ctx, slug);
    return;
  }
  if (data.startsWith('clinic_pause:')) {
    const slug = data.replace('clinic_pause:', '');
    await ctx.answerCbQuery(`Pausing ${slug}...`);
    await commands.handlePause(ctx, slug);
    return;
  }
  if (data.startsWith('clinic_resume:')) {
    const slug = data.replace('clinic_resume:', '');
    await ctx.answerCbQuery(`Resuming ${slug}...`);
    await commands.handleResume(ctx, slug);
    return;
  }
  
  // Unmatched callback — pass to bot.action() handlers registered below
  // (clinic_addservice:, clinic_updateprice:, clinic_hours:, clinic_faq:,
  //  clinic_voice:, appt_yes:, appt_no:, etc.)
  return next();
}

// ─── BUTTON TEXT HANDLERS ────────────────────────────────────────
// These handle taps on the ReplyKeyboard buttons (not /commands)

bot.hears('📊 Status', safeHandler('📊 Status', async (ctx) => {
  await handleStatusCommand(bot.telegram, ctx.chat.id, null);
}));

bot.hears('⚙️ View Config', safeHandler('⚙️ View Config', async (ctx) => {
  // Clinic staff see THEIR OWN clinic's config (read-only view)
  const clinic = await resolveStaffClinic(ctx);
  if (!clinic) return;
  await commands.handleViewConfig(ctx, clinic.slug);
}));

bot.hears('📝 Request Changes', safeHandler('📝 Request Changes', async (ctx) => {
  await ctx.reply(
    '📝 *Request Changes to Your Clinic Setup*\n\n' +
    'Changes are reviewed and approved by Moon Hands before going live. ' +
    'Send your request with one of these commands:\n\n' +
    '*Add a treatment:*\n' +
    '`/req_addservice "HIFU Treatment" $350 60`\n' +
    '(price can be a range: `/req_addservice "Consultation" "$50-$100" 60`)\n\n' +
    '*Update a price:*\n' +
    '`/req_updateprice "HIFU Treatment" $299`\n' +
    '(or a range: `/req_updateprice "Consultation" "$50-$100"`)\n\n' +
    '*Update operating hours:*\n' +
    '`/req_hours Saturday 09:00 17:00`\n\n' +
    '*Add an FAQ:*\n' +
    '`/req_faq Parking available? | Free parking at rear`\n\n' +
    '*Update bot voice/greeting:*\n' +
    '`/req_voice greeting "Welcome to Glow!"`\n\n' +
    'You\'ll get a Telegram notification here once approved (usually within 24h).',
    { parse_mode: 'Markdown' }
  );
}));

bot.hears('⏸️ Pause AI', safeHandler('⏸️ Pause AI', async (ctx) => {
  await ctx.reply(
    '⏸️ *Pause Bot for a Patient*\n\n' +
    'Send the patient\'s phone number:\n' +
    '`/patientpause +6581234567`',
    { parse_mode: 'Markdown' }
  );
}));

bot.hears('▶️ Resume AI', safeHandler('▶️ Resume AI', async (ctx) => {
  await ctx.reply(
    '▶️ *Resume Bot for a Patient*\n\n' +
    'Send the patient\'s phone number:\n' +
    '`/patientresume +6581234567`',
    { parse_mode: 'Markdown' }
  );
}));

bot.hears('📋 My Bookings', safeHandler('📋 My Bookings', async (ctx) => {
  // Show UPCOMING APPOINTMENTS — scoped to the clinic(s) this chat is linked to.
  // (Previously this showed the admin's client list, which is meaningless
  //  for clinic staff.) Admin (no linked clinics) sees all clinics' bookings.
  const chatId = ctx.chat.id;
  const { supabase } = require('../supabase/client');
  // Markdown v1 escaper — only _ * ` [ are special there. (The v2 escaper
  // also escapes '-' and '+', which then show up as literal backslashes.)
  const esc1 = (t) => String(t ?? '').replace(/([_*`\[])/g, '\\$1');

  const { data: linked } = await supabase
    .from('clients')
    .select('id, name')
    .contains('telegram_chat_ids', [chatId]);
  const clinicIds = (linked || []).map(c => c.id);

  const today = new Date().toISOString().split('T')[0];
  let query = supabase
    .from('appointments')
    .select('*, clients(name)')
    .gte('appointment_date', today)
    .in('status', ['confirmed', 'pending', 'booked', 'pending_alternative'])
    .order('appointment_date', { ascending: true })
    .order('appointment_time', { ascending: true })
    .limit(15);
  if (clinicIds.length > 0) {
    query = query.in('client_id', clinicIds);
  }

  const { data: bookings, error } = await query;
  if (error) {
    console.error('[TELEGRAM] My Bookings query error:', error.message);
    return ctx.reply('⚠️ Could not load bookings. Try again in a moment.');
  }
  if (!bookings || bookings.length === 0) {
    return ctx.reply('📋 No upcoming bookings.');
  }

  const statusEmoji = { confirmed: '✅', booked: '✅', pending: '⏳', pending_alternative: '🔄' };
  const lines = [`📋 *UPCOMING BOOKINGS (${bookings.length})*`, ''];
  for (const b of bookings) {
    const clinicTag = clinicIds.length === 0 ? ` · ${esc1(b.clients?.name || '?')}` : '';
    lines.push(
      `${statusEmoji[b.status] || '❓'} *${b.appointment_date}* ${String(b.appointment_time).slice(0, 5)} — ${esc1(b.customer_name || '?')} — ${esc1(b.service || 'General')}${clinicTag}`
    );
  }
  lines.push('');
  lines.push('_⏳ = pending approval · 🔄 = alternative time suggested_');
  await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
}));

bot.hears('❓ Help', safeHandler('❓ Help', async (ctx) => {
  await ctx.reply(
    '📖 *Moon Hands Help*\n\n' +
    '*Staff Controls:*\n' +
    '`/patientpause <phone>` — Pause bot for patient\n' +
    '`/patientresume <phone>` — Resume bot for patient\n' +
    '`/patientstatus` — List paused conversations\n' +
    '`/takeover <phone>` — Take over conversation\n\n' +
    '*What these do:*\n' +
    'When you need to reply to a patient manually (e.g., complaint, complex question), pause the bot first so the patient doesn\'t get two conflicting replies.\n\n' +
    '*Requesting Changes:*\n' +
    'Tap 📝 Request Changes to submit changes to your treatments, pricing, or hours. Moon Hands reviews and applies them to ensure everything works correctly.\n\n' +
    'Need help? Contact Pixel Vault support.',
    { parse_mode: 'Markdown' }
  );
}));

// ─── APPOINTMENT ATTENDANCE CALLBACKS ────────────────────────────
// YES/NO buttons from daily booking summary

bot.action(/^appt_yes:(.+):(.+)$/, safeHandler('appt_yes', async (ctx) => {
  const slug = ctx.match[1];
  const apptId = ctx.match[2];
  const { markAppointmentAttendance } = require('../jobs/daily-booking-summary');

  await ctx.answerCbQuery('Marking as showed up...');
  const result = await markAppointmentAttendance(apptId, true, ctx.from.id);

  if (result.success) {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); // Remove buttons
    await ctx.reply(`✅ ${result.appointment?.customer_name || 'Patient'} marked as *showed up*.\\n\\n_Updated in weekly optimization data._`, { parse_mode: 'Markdown' });
  } else {
    await ctx.answerCbQuery('Error marking attendance');
  }
}));

bot.action(/^appt_no:(.+):(.+)$/, safeHandler('appt_no', async (ctx) => {
  const slug = ctx.match[1];
  const apptId = ctx.match[2];
  const { markAppointmentAttendance } = require('../jobs/daily-booking-summary');

  await ctx.answerCbQuery('Marking as no-show...');
  const result = await markAppointmentAttendance(apptId, false, ctx.from.id);

  if (result.success) {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); // Remove buttons
    await ctx.reply(`❌ ${result.appointment?.customer_name || 'Patient'} marked as *no-show*.\\n\\n_This will be analyzed in the weekly optimization loop._`, { parse_mode: 'Markdown' });
  } else {
    await ctx.answerCbQuery('Error marking attendance');
  }
}));

// ─── CLINIC SELECTION CALLBACKS ──────────────────────────────────
// When user taps a clinic name from /clients, show the clinic action menu

bot.action(/^clinic_menu:(.+)$/, safeHandler('clinic_menu', async (ctx) => {
  const slug = ctx.match[1];
  await ctx.answerCbQuery(`Loading ${slug}...`);
  await commands.showClinicMenu(ctx, slug);
}));

// Clinic action callbacks — execute directly (one-tap)
bot.action(/^clinic_viewconfig:(.+)$/, safeHandler('clinic_viewconfig', async (ctx) => {
  const slug = ctx.match[1];
  await ctx.answerCbQuery(`Loading config...`);
  await commands.handleViewConfig(ctx, slug);
}));

bot.action(/^clinic_usage:(.+)$/, safeHandler('clinic_usage', async (ctx) => {
  const slug = ctx.match[1];
  await ctx.answerCbQuery(`Loading usage...`);
  await commands.handleUsage(ctx, slug);
}));

bot.action(/^clinic_pause:(.+)$/, safeHandler('clinic_pause', async (ctx) => {
  const slug = ctx.match[1];
  await ctx.answerCbQuery(`Pausing ${slug}...`);
  await commands.handlePause(ctx, slug);
}));

bot.action(/^clinic_resume:(.+)$/, safeHandler('clinic_resume', async (ctx) => {
  const slug = ctx.match[1];
  await ctx.answerCbQuery(`Resuming ${slug}...`);
  await commands.handleResume(ctx, slug);
}));

// Clinic action callbacks — show typed command with pre-filled slug
bot.action(/^clinic_addservice:(.+)$/, safeHandler('clinic_addservice', async (ctx) => {
  const slug = ctx.match[1];
  await ctx.answerCbQuery();
  await ctx.reply(
    `➕ Add Service to *${slug}*\n\nType:\n/addservice ${slug} "Service Name" $price durationMin\n\nExample:\n/addservice ${slug} "HIFU Treatment" $350 60`,
    BACK_TO_MENU
  );
}));

bot.action(/^clinic_updateprice:(.+)$/, safeHandler('clinic_updateprice', async (ctx) => {
  const slug = ctx.match[1];
  await ctx.answerCbQuery();
  await ctx.reply(
    `💰 Update Price for *${slug}*\n\nType:\n/updateprice ${slug} "Service Name" $newPrice\n\nExample:\n/updateprice ${slug} "HIFU Treatment" $299`,
    BACK_TO_MENU
  );
}));

bot.action(/^clinic_hours:(.+)$/, safeHandler('clinic_hours', async (ctx) => {
  const slug = ctx.match[1];
  await ctx.answerCbQuery();
  await ctx.reply(
    `🕐 Update Hours for *${slug}*\n\nType:\n/updatehours ${slug} <day> HH:MM HH:MM\n\nExample:\n/updatehours ${slug} Saturday 09:00 17:00`,
    BACK_TO_MENU
  );
}));

bot.action(/^clinic_faq:(.+)$/, safeHandler('clinic_faq', async (ctx) => {
  const slug = ctx.match[1];
  await ctx.answerCbQuery();
  await ctx.reply(
    `❓ Add FAQ for *${slug}*\n\nType:\n/addfaq ${slug} "Question?" | "Answer"\n\nExample:\n/addfaq ${slug} "Parking available?" | "Free parking at rear"`,
    BACK_TO_MENU
  );
}));

bot.action(/^clinic_voice:(.+)$/, safeHandler('clinic_voice', async (ctx) => {
  const slug = ctx.match[1];
  await ctx.answerCbQuery();
  await ctx.reply(
    `🎤 Update Brand Voice for *${slug}*\n\nType:\n/updatevoice ${slug} <field> <value>\n\nFields: name, greeting, tone, enthusiasm, notes\n\nExample:\n/updatevoice ${slug} greeting "Welcome to Glow!"`,
    BACK_TO_MENU
  );
}));

// ─── BOOKING APPROVAL COMMANDS ───────────────────────────────────

const approvals = require('./commands/approvals');

bot.command('pending', safeHandler('/pending', (ctx) => approvals.handlePending(bot, ctx.message)));
bot.command('approve', safeHandler('/approve', (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  return approvals.handleApprove(bot, ctx.message, args);
}));
bot.command('reject', safeHandler('/reject', (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  return approvals.handleReject(bot, ctx.message, args);
}));

// ─── TEXT MESSAGE HANDLER ────────────────────────────────────────

bot.on('text', async (ctx) => {
  try {
    const text = ctx.message.text.trim();
    
    // Quick shortcuts for common actions
    if (text.toLowerCase() === 'status') {
      auditCommand(ctx.from.id, 'status-shortcut', true);
      return await commands.handleHealth(ctx);
    }
    if (text.toLowerCase() === 'clients') {
      auditCommand(ctx.from.id, 'clients-shortcut', true);
      return await commands.handleClients(ctx);
    }
    
    // Unknown command
    auditCommand(ctx.from.id, text, false, 'UNKNOWN_COMMAND');
    await ctx.reply(
      `Hmm, I don't recognize that command.\n\n` +
      `Use /help to see all available commands.`
    );
  } catch (err) {
    console.error('[TELEGRAM] Text handler error:', err.message);
  }
});

// ─── ERROR HANDLING ──────────────────────────────────────────────

bot.catch((err, ctx) => {
  console.error(`[ERROR] Bot error for ${ctx.updateType}:`, err.message);
  auditCommand(ctx.from?.id, 'error', false, err.message);
  ctx.reply('\u26a0\ufe0f Something went wrong. Check logs or try again.').catch(() => {});
});

// ─── START ───────────────────────────────────────────────────────

// Prevent 409 Conflict on Render redeploys: clear pending updates and handle errors gracefully
const LAUNCH_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

async function startBot(attempt = 1) {
  try {
    await bot.launch({ dropPendingUpdates: true });
    console.log(`[${new Date().toISOString()}] Moon Hands Telegram Bot started (attempt ${attempt})`);
    console.log(`  Admin: ${ADMIN_CHAT_ID}`);
    console.log(`  Mode: Polling (dropPendingUpdates: true)`);
    console.log(`  Security: Rate limiting + Input sanitization + Injection detection ACTIVE`);
  } catch (err) {
    const is409 = err.response?.error_code === 409 || err.message?.includes('409');
    if (is409 && attempt < LAUNCH_RETRIES) {
      console.warn(`[TELEGRAM] 409 Conflict on attempt ${attempt}. Waiting ${RETRY_DELAY_MS}ms for old polling session to expire...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return startBot(attempt + 1);
    }
    console.error(`[TELEGRAM] Bot failed to start after ${attempt} attempts:`, err.message);
    // Don't crash the whole server — webhook still works without Telegram
    console.log('[TELEGRAM] Webhook server continues running without Telegram bot');
  }
}

startBot();

// Graceful shutdown
process.once('SIGINT', () => { rateLimiter.destroy(); bot.stop('SIGINT'); });
process.once('SIGTERM', () => { rateLimiter.destroy(); bot.stop('SIGTERM'); });
