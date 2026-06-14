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

// ─── COMMANDS ────────────────────────────────────────────────────

bot.start((ctx) => {
  auditCommand(ctx.from.id, '/start', true);
  ctx.reply(
    `Moon Hands Admin Bot\n\n` +
    `Welcome back, boss.\n\n` +
    `Use /help to see all commands.\n\n` +
    `Remember: only you can use this bot.`
  );
});

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
