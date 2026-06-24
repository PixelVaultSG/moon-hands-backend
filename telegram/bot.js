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

bot.start((ctx) => {
  auditCommand(ctx.from.id, '/start', true);
  ctx.reply(
    `Moon Hands Admin Bot\n\n` +
    `Welcome back, boss.\n\n` +
    `Use /menu for the quick-action dashboard, or /help for full commands.`,
    MENU_KEYBOARD
  );
});

bot.command('menu', safeHandler('/menu', async (ctx) => {
  await ctx.reply(
    `📱 Moon Hands Quick Menu\n\n` +
    `Tap any button to manage your clinics.`,
    MENU_KEYBOARD
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
  // Get the first clinic's slug or use 'pixellvault' as default
  await commands.handleUsage(ctx, 'pixellvault');
}));

bot.action('menu_viewconfig', safeHandler('menu_viewconfig', async (ctx) => {
  await ctx.answerCbQuery('Loading config...');
  await commands.handleViewConfig(ctx, 'pixellvault');
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
    `➕ Add Service\n\nType:\n/addservice <slug> "Service Name" $price durationMin\n\nExample:\n/addservice pixellvault "HIFU Treatment" $350 60`,
    BACK_TO_MENU
  );
}));

bot.action('menu_updateprice', safeHandler('menu_updateprice', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `💰 Update Price\n\nType:\n/updateprice <slug> "Service Name" $newPrice\n\nExample:\n/updateprice pixellvault "HIFU Treatment" $299`,
    BACK_TO_MENU
  );
}));

bot.action('menu_updatehours', safeHandler('menu_updatehours', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `🕐 Update Hours\n\nType:\n/updatehours <slug> <day> HH:MM HH:MM\n\nExample:\n/updatehours pixellvault Saturday 09:00 17:00`,
    BACK_TO_MENU
  );
}));

bot.action('menu_addfaq', safeHandler('menu_addfaq', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `❓ Add FAQ\n\nType:\n/addfaq <slug> "Question?" | "Answer"\n\nExample:\n/addfaq pixellvault "Parking available?" | "Free parking at rear"`,
    BACK_TO_MENU
  );
}));

bot.action('menu_voice', safeHandler('menu_voice', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `🎤 Update Brand Voice\n\nType:\n/updatevoice <slug> <field> <value>\n\nFields: name, greeting, tone, enthusiasm, notes\n\nExample:\n/updatevoice pixellvault greeting "Welcome to Glow!"`,
    BACK_TO_MENU
  );
}));

bot.action('menu_pause', safeHandler('menu_pause', async (ctx) => {
  await ctx.answerCbQuery('Pausing AI...');
  await commands.handlePause(ctx, 'pixellvault');
}));

bot.action('menu_resume', safeHandler('menu_resume', async (ctx) => {
  await ctx.answerCbQuery('Resuming AI...');
  await commands.handleResume(ctx, 'pixellvault');
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
