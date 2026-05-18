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

bot.help((ctx) => { auditCommand(ctx.from.id, '/help', true); commands.handleHelp(ctx); });
bot.command('clients', (ctx) => { auditCommand(ctx.from.id, '/clients', true); commands.handleClients(ctx); });
bot.command('viewconfig', (ctx) => { auditCommand(ctx.from.id, '/viewconfig', true); commands.handleViewConfig(ctx); });
bot.command('addservice', (ctx) => { auditCommand(ctx.from.id, '/addservice', true); commands.handleAddService(ctx); });
bot.command('updateprice', (ctx) => { auditCommand(ctx.from.id, '/updateprice', true); commands.handleUpdatePrice(ctx); });
bot.command('removeservice', (ctx) => { auditCommand(ctx.from.id, '/removeservice', true); commands.handleRemoveService(ctx); });
bot.command('updatehours', (ctx) => { auditCommand(ctx.from.id, '/updatehours', true); commands.handleUpdateHours(ctx); });
bot.command('addfaq', (ctx) => { auditCommand(ctx.from.id, '/addfaq', true); commands.handleAddFaq(ctx); });
bot.command('removefaq', (ctx) => { auditCommand(ctx.from.id, '/removefaq', true); commands.handleRemoveFaq(ctx); });
bot.command('updatevoice', (ctx) => { auditCommand(ctx.from.id, '/updatevoice', true); commands.handleUpdateVoice(ctx); });
bot.command('pause', (ctx) => { auditCommand(ctx.from.id, '/pause', true); commands.handlePause(ctx); });
bot.command('resume', (ctx) => { auditCommand(ctx.from.id, '/resume', true); commands.handleResume(ctx); });
bot.command('usage', (ctx) => { auditCommand(ctx.from.id, '/usage', true); commands.handleUsage(ctx); });
bot.command('health', (ctx) => { auditCommand(ctx.from.id, '/health', true); commands.handleHealth(ctx); });
bot.command('security', (ctx) => { auditCommand(ctx.from.id, '/security', true); commands.handleSecurity(ctx); });
bot.command('threats', (ctx) => { auditCommand(ctx.from.id, '/threats', true); commands.handleThreats(ctx); });
bot.command('authlog', (ctx) => { auditCommand(ctx.from.id, '/authlog', true); commands.handleAuthLog(ctx); });

// ─── BOOKING APPROVAL COMMANDS ───────────────────────────────────

const approvals = require('./commands/approvals');

bot.command('pending', (ctx) => { auditCommand(ctx.from.id, '/pending', true); approvals.handlePending(bot, ctx.message); });
bot.command('approve', (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  auditCommand(ctx.from.id, '/approve', true);
  approvals.handleApprove(bot, ctx.message, args);
});
bot.command('reject', (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  auditCommand(ctx.from.id, '/reject', true);
  approvals.handleReject(bot, ctx.message, args);
});

// ─── TEXT MESSAGE HANDLER ────────────────────────────────────────

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  
  // Quick shortcuts for common actions
  if (text.toLowerCase() === 'status') {
    auditCommand(ctx.from.id, 'status-shortcut', true);
    return commands.handleHealth(ctx);
  }
  if (text.toLowerCase() === 'clients') {
    auditCommand(ctx.from.id, 'clients-shortcut', true);
    return commands.handleClients(ctx);
  }
  
  // Unknown command
  auditCommand(ctx.from.id, text, false, 'UNKNOWN_COMMAND');
  await ctx.reply(
    `Hmm, I don't recognize that command.\n\n` +
    `Use /help to see all available commands.`
  );
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
