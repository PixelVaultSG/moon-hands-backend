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

bot.use(async (ctx, next) => {
  // Layer 1: Reject non-admin users immediately
  if (ctx.from && ctx.from.id.toString() !== ADMIN_CHAT_ID) {
    console.warn(`[SECURITY] Unauthorized access attempt from ${ctx.from.id} (${ctx.from.username || 'unknown'})`);
    return ctx.reply('\ud83d\udeab Unauthorized. This bot is private. Access logged.');
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

// Main menu layout — organized by function
const MENU_KEYBOARD = Markup.inlineKeyboard([
  // Row 1: Dashboard
  [
    Markup.button.callback('📊 Status', 'menu_health'),
    Markup.button.callback('🏥 Clinics', 'menu_clients'),
    Markup.button.callback('📈 Usage', 'menu_usage'),
  ],
  // Row 2: Clinic Management
  [
    Markup.button.callback('⚙️ View Config', 'menu_viewconfig'),
    Markup.button.callback('➕ Add Service', 'menu_addservice'),
    Markup.button.callback('💰 Update Price', 'menu_updateprice'),
  ],
  // Row 3: Operations
  [
    Markup.button.callback('⏸ Pause AI', 'menu_pause'),
    Markup.button.callback('▶️ Resume AI', 'menu_resume'),
    Markup.button.callback('🛡 Security', 'menu_security'),
  ],
  // Row 4: Settings
  [
    Markup.button.callback('🕐 Update Hours', 'menu_updatehours'),
    Markup.button.callback('❓ Add FAQ', 'menu_addfaq'),
    Markup.button.callback('🎤 Voice', 'menu_voice'),
  ],
  // Row 5: Help
  [
    Markup.button.callback('❓ Full Command List', 'menu_help'),
  ],
]);

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
    await ctx.reply(
      `Moon Hands Admin Bot\n\n` +
      `Welcome back, boss.\n\n` +
      `Use /menu for the quick-action dashboard, or /help for full commands.`,
      MENU_KEYBOARD
    );
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
    await ctx.reply(
      `📱 Moon Hands Quick Menu\n\n` +
      `Tap any button to manage your clinics.`,
      MENU_KEYBOARD
    );
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
  await ctx.editMessageText(
    `📱 Moon Hands Quick Menu\n\nTap any button to manage your clinics.`,
    MENU_KEYBOARD
  );
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
  await ctx.answerCbQuery('Loading usage...');
  // Get the first clinic's slug or use 'pixelvault' as default
  await commands.handleUsage(ctx, 'pixelvault');
}));

bot.action('menu_viewconfig', safeHandler('menu_viewconfig', async (ctx) => {
  await ctx.answerCbQuery('Loading config...');
  await commands.handleViewConfig(ctx, 'pixelvault');
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
bot.action('menu_addservice', safeHandler('menu_addservice', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `➕ Add Service\n\nType:\n/addservice <slug> "Service Name" $price durationMin\n\nExample:\n/addservice pixelvault "HIFU Treatment" $350 60`,
    BACK_TO_MENU
  );
}));

bot.action('menu_updateprice', safeHandler('menu_updateprice', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `💰 Update Price\n\nType:\n/updateprice <slug> "Service Name" $newPrice\n\nExample:\n/updateprice pixelvault "HIFU Treatment" $299`,
    BACK_TO_MENU
  );
}));

bot.action('menu_updatehours', safeHandler('menu_updatehours', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `🕐 Update Hours\n\nType:\n/updatehours <slug> <day> HH:MM HH:MM\n\nExample:\n/updatehours pixelvault Saturday 09:00 17:00`,
    BACK_TO_MENU
  );
}));

bot.action('menu_addfaq', safeHandler('menu_addfaq', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `❓ Add FAQ\n\nType:\n/addfaq <slug> "Question?" | "Answer"\n\nExample:\n/addfaq pixelvault "Parking available?" | "Free parking at rear"`,
    BACK_TO_MENU
  );
}));

bot.action('menu_voice', safeHandler('menu_voice', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `🎤 Update Brand Voice\n\nType:\n/updatevoice <slug> <field> <value>\n\nFields: name, greeting, tone, enthusiasm, notes\n\nExample:\n/updatevoice pixelvault greeting "Welcome to Glow!"`,
    BACK_TO_MENU
  );
}));

bot.action('menu_pause', safeHandler('menu_pause', async (ctx) => {
  await ctx.answerCbQuery('Pausing AI...');
  await commands.handlePause(ctx, 'pixelvault');
}));

bot.action('menu_resume', safeHandler('menu_resume', async (ctx) => {
  await ctx.answerCbQuery('Resuming AI...');
  await commands.handleResume(ctx, 'pixelvault');
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

bot.help(safeHandler('/help', commands.handleHelp));
bot.command('clients', safeHandler('/clients', commands.handleClients));
bot.command('viewconfig', safeHandler('/viewconfig', commands.handleViewConfig));
bot.command('addservice', safeHandler('/addservice', commands.handleAddService));
bot.command('updateprice', safeHandler('/updateprice', commands.handleUpdatePrice));
bot.command('removeservice', safeHandler('/removeservice', commands.handleRemoveService));
bot.command('updatehours', safeHandler('/updatehours', commands.handleUpdateHours));
bot.command('addfaq', safeHandler('/addfaq', commands.handleAddFaq));
bot.command('removefaq', safeHandler('/removefaq', commands.handleRemoveFaq));
bot.command('updatevoice', safeHandler('/updatevoice', commands.handleUpdateVoice));
bot.command('pause', safeHandler('/pause', commands.handlePause));
bot.command('resume', safeHandler('/resume', commands.handleResume));
bot.command('usage', safeHandler('/usage', commands.handleUsage));
bot.command('health', safeHandler('/health', commands.handleHealth));
bot.command('security', safeHandler('/security', commands.handleSecurity));
bot.command('threats', safeHandler('/threats', commands.handleThreats));
bot.command('authlog', safeHandler('/authlog', commands.handleAuthLog));
bot.command('debug', safeHandler('/debug', commands.handleDebug));

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

bot.on('callback_query', safeHandler('callback_query', async (ctx) => {
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
    await handlePatientConfirmAlternative(ctx, bookingId);
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
  
  // Unmatched callback — let other handlers process it
  return;
}));

// ─── BUTTON TEXT HANDLERS ────────────────────────────────────────
// These handle taps on the ReplyKeyboard buttons (not /commands)

bot.hears('📊 Status', safeHandler('📊 Status', async (ctx) => {
  await handleStatusCommand(bot.telegram, ctx.chat.id, null);
}));

bot.hears('⚙️ View Config', safeHandler('⚙️ View Config', async (ctx) => {
  await commands.handleViewConfig(ctx);
}));

bot.hears('📝 Request Changes', safeHandler('📝 Request Changes', async (ctx) => {
  await ctx.reply(
    '📝 *Request Changes to Your Clinic Setup*\n\n' +
    'Moon Hands manages all changes to ensure your bot works perfectly.\n\n' +
    '*Reply with your request in this format:*\n' +
    '```\n' +
    'ADD TREATMENT:\n' +
    'Name: [treatment name]\n' +
    'Price: [price]\n' +
    'Duration: [minutes]\n' +
    'Description: [brief description]\n\n' +
    'OR\n\n' +
    'UPDATE HOURS:\n' +
    'Monday: 10:00-20:00\n' +
    'Tuesday: 10:00-20:00\n' +
    '(etc)\n\n' +
    'OR\n\n' +
    'UPDATE PRICE:\n' +
    'Treatment: [name]\n' +
    'New Price: [price]\n' +
    '```\n\n' +
    'Your request will be reviewed and applied within 24 hours.',
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
  await commands.handleClients(ctx);
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
