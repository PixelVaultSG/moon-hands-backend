/**
 * Moon Hands - Scheduled Jobs
 * Daily usage report at 8pm, health report at 8:30pm
 */

require('dotenv').config();
const cron = require('node-cron');
const { Telegraf } = require('telegraf');
const db = require('../supabase/client');
const alerts = require('./alerts/templates');
const security = require('../security/monitor');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

// ─── DAILY USAGE REPORT (8:00 PM SGT = 12:00 PM UTC) ────────────

async function sendDailyUsageReport() {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const month = today.substring(0, 7); // YYYY-MM

    const usageData = await db.getDailyUsage(today);
    const monthlyData = await db.getMonthlyUsage(month);

    // Calculate month-to-date
    const monthSpent = monthlyData.reduce((sum, m) => sum + (m.cost || 0), 0);
    const monthBudget = monthlyData.reduce((sum, m) => {
      const limit = m.plan === 'professional' ? 497 : 297;
      return sum + limit;
    }, 0);

    const clients = usageData.map(u => ({
      name: u.clients?.name || 'Unknown',
      slug: u.clients?.slug || 'unknown',
      plan: u.clients?.plan || 'starter',
      voice_minutes: u.voice_minutes || 0,
      whatsapp_messages: u.whatsapp_messages || 0,
      cost: u.cost || 0,
      bookings: u.bookings || 0
    }));

    const report = alerts.dailyUsageReport({
      date: today,
      totalCost: clients.reduce((s, c) => s + c.cost, 0),
      clients,
      monthToDate: {
        spent: monthSpent,
        budget: monthBudget,
        remaining: Math.max(0, monthBudget - monthSpent)
      }
    });

    await bot.telegram.sendMessage(ADMIN_CHAT_ID, report, { parse_mode: 'MarkdownV2' });
    console.log(`[${new Date().toISOString()}] Daily usage report sent`);
  } catch (err) {
    console.error('Daily report error:', err.message);
    await bot.telegram.sendMessage(ADMIN_CHAT_ID, `\u26a0\ufe0f Daily report failed: ${err.message}`);
  }
}

// ─── DAILY HEALTH REPORT (8:30 PM SGT = 12:30 PM UTC) ──────────

async function sendDailyHealthReport() {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const healthChecks = await db.getRecentHealthChecks(24);
    const clients = await db.getAllClients();

    // Aggregate API statuses
    const apiStatuses = {};
    healthChecks.forEach(c => {
      if (!apiStatuses[c.service] || c.checked_at > apiStatuses[c.service].lastCheck) {
        apiStatuses[c.service] = {
          status: c.status,
          latency: c.latency_ms,
          lastCheck: c.checked_at
        };
      }
    });

    const clientHealth = {
      active: clients.filter(c => c.status === 'active').length,
      paused: clients.filter(c => c.status === 'paused').length,
      errors: 0 // Would be populated from error logs
    };

    // Get auto-actions from health log
    const autoActions = healthChecks
      .filter(c => c.status === 'healthy' && c.latency_ms > 500)
      .map(c => `${c.service} retry (${c.latency_ms}ms)`)
      .slice(0, 5);

    const report = alerts.dailyHealthReport({
      date: today,
      apiStatuses,
      clientHealth,
      autoActions
    });

    await bot.telegram.sendMessage(ADMIN_CHAT_ID, report, { parse_mode: 'MarkdownV2' });
    console.log(`[${new Date().toISOString()}] Daily health report sent`);
  } catch (err) {
    console.error('Health report error:', err.message);
    await bot.telegram.sendMessage(ADMIN_CHAT_ID, `\u26a0\ufe0f Health report failed: ${err.message}`);
  }
}

// ─── SECURITY SCAN (Every 10 minutes) ────────────────────────────

async function runSecurityCheck() {
  try {
    const events = await security.runSecurityScan();
    
    // Send immediate alerts for critical/high events
    for (const event of events) {
      if (event.severity === 'critical' || event.severity === 'high') {
        const msg = security.formatSecurityAlert(event);
        await bot.telegram.sendMessage(ADMIN_CHAT_ID, msg, { parse_mode: 'Markdown' });
      }
    }
    
    if (events.length > 0) {
      console.log(`[${new Date().toISOString()}] Security: ${events.length} events (${events.filter(e => e.severity === 'critical').length} critical)`);
    }
  } catch (err) {
    console.error('Security scan error:', err.message);
  }
}

// ─── DAILY SECURITY REPORT (8:15 PM SGT = 12:15 PM UTC) ────────

async function sendDailySecurityReport() {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Get today's security events
    const { data: todaysEvents } = await db.supabase
      .from('security_events')
      .select('*')
      .gte('triggered_at', today)
      .order('triggered_at', { ascending: false });
      
    const unresolved = todaysEvents?.filter(e => !e.resolved_at) || [];
    const critical = todaysEvents?.filter(e => e.severity === 'critical') || [];
    const byCategory = {};
    (todaysEvents || []).forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    });
    
    const lines = [
      '\ud83d\udee1\ufe0f *MOON HANDS SECURITY REPORT*',
      `\ud83d\udcc5 ${today}`,
      '',
      '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
      '*Today\'s Summary*',
      `Total events: ${todaysEvents?.length || 0}`,
      `Critical: ${critical.length} ${critical.length > 0 ? '\ud83d\udea8' : ''}`,
      `Unresolved: ${unresolved.length} ${unresolved.length > 0 ? '\u26a0\ufe0f' : ''}`,
      ''
    ];
    
    if (Object.keys(byCategory).length > 0) {
      lines.push('*By Category:*');
      for (const [cat, count] of Object.entries(byCategory)) {
        lines.push(`  \u2022 ${cat}: ${count}`);
      }
      lines.push('');
    }
    
    if (unresolved.length > 0) {
      lines.push('\ud83d\udd34 *Unresolved Issues:*');
      unresolved.slice(0, 5).forEach(e => {
        lines.push(`  \u2022 [${e.severity}] ${e.description.substring(0, 60)}`);
      });
      lines.push('');
    }
    
    lines.push('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
    lines.push(critical.length === 0 && unresolved.length === 0 
      ? '\u2705 All clear. No action required.' 
      : '\u26a0\ufe0f Action required on unresolved items.');
    
    await bot.telegram.sendMessage(ADMIN_CHAT_ID, lines.join('\n'), { parse_mode: 'Markdown' });
    console.log(`[${new Date().toISOString()}] Daily security report sent`);
  } catch (err) {
    console.error('Security report error:', err.message);
  }
}

// ─── CRON SCHEDULES ──────────────────────────────────────────────

// Security scan every 10 minutes
cron.schedule('*/10 * * * *', runSecurityCheck, { timezone: 'UTC' });

// 8:00 PM SGT = 12:00 PM UTC
cron.schedule('0 12 * * *', sendDailyUsageReport, {
  timezone: 'UTC'
});

// 8:15 PM SGT = 12:15 PM UTC
cron.schedule('15 12 * * *', sendDailySecurityReport, {
  timezone: 'UTC'
});

// 8:30 PM SGT = 12:30 PM UTC
cron.schedule('30 12 * * *', sendDailyHealthReport, {
  timezone: 'UTC'
});

// ─── MANUAL TRIGGERS (for testing) ─────────────────────────────

if (process.argv.includes('--usage')) {
  console.log('Sending usage report manually...');
  sendDailyUsageReport().then(() => process.exit(0));
}

if (process.argv.includes('--health')) {
  console.log('Sending health report manually...');
  sendDailyHealthReport().then(() => process.exit(0));
}

if (process.argv.includes('--security')) {
  console.log('Running security scan manually...');
  runSecurityCheck().then(() => process.exit(0));
}

// ─── HIGH-VALUE LEAD CHECKER (every 15 minutes) ─────────────────

cron.schedule('*/15 * * * *', async () => {
  try {
    const clients = await db.getAllClients();
    for (const client of clients) {
      const leads = await db.getHighValueLeads(client.id, 0.25); // 15 min window
      for (const lead of leads) {
        const msg = alerts.highValueLead({
          clientName: client.name,
          time: new Date(lead.created_at).toLocaleString('en-SG'),
          customerPhone: lead.customer_phone,
          summary: lead.summary ? lead.summary.split('\n') : undefined,
          budget: lead.budget_mentioned,
          recommendedAction: lead.recommended_action || 'Follow up within 15 minutes'
        });
        await bot.telegram.sendMessage(ADMIN_CHAT_ID, msg, { parse_mode: 'MarkdownV2' });
        await db.markLeadNotified(lead.id);
      }
    }
  } catch (err) {
    console.error('Lead checker error:', err.message);
  }
}, { timezone: 'UTC' });

console.log(`[${new Date().toISOString()}] Moon Hands Scheduler started`);
console.log('  - Security scan: every 10 minutes');
console.log('  - High-value lead check: every 15 minutes');
console.log('  - Daily usage report: 8:00 PM SGT');
console.log('  - Daily security report: 8:15 PM SGT');
console.log('  - Daily health report: 8:30 PM SGT');
