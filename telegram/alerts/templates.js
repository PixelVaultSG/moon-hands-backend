/**
 * Moon Hands - Telegram Alert Templates
 * All alert messages sent to the admin
 */

function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// ─── HIGH-VALUE LEAD ALERT ───────────────────────────────────────

function highValueLead({ clientName, time, customerPhone, summary, recommendedAction, budget }) {
  const lines = [
    '\ud83d\udea8 *HIGH-VALUE LEAD ALERT*',
    '',
    `Client: ${escapeMarkdown(clientName)}`,
    `Time: ${time}`,
    `Customer: ${escapeMarkdown(customerPhone)}`,
    ''
  ];

  if (summary) {
    lines.push(`*Conversation Summary:*`);
    summary.forEach(s => lines.push(`  \u2022 ${escapeMarkdown(s)}`));
    lines.push('');
  }

  if (budget) {
    lines.push(`\ud83d\udcb0 *Budget mentioned: ${escapeMarkdown(budget)}*\n`);
  }

  if (recommendedAction) {
    lines.push(`\ud83d\udca1 *Recommended Action:*`);
    lines.push(`${escapeMarkdown(recommendedAction)}`);
  }

  return lines.join('\n');
}

// ─── USAGE LIMIT ALERT ──────────────────────────────────────────

function usageAlert({ clientName, plan, voiceUsed, voiceLimit, waUsed, waLimit, severity }) {
  const voicePct = Math.round((voiceUsed / voiceLimit) * 100);
  const waPct = Math.round((waUsed / waLimit) * 100);
  const highestPct = Math.max(voicePct, waPct);

  const emoji = severity === 'critical' ? '\ud83d\udd34' : severity === 'warning' ? '\ud83d\udfe1' : '\ud83d\udfe0';
  const title = severity === 'critical' ? 'LIMIT EXCEEDED' : severity === 'warning' ? 'APPROACHING LIMIT' : 'USAGE NOTICE';

  return [
    `${emoji} *${title}*`,
    '',
    `Client: ${escapeMarkdown(clientName)}`,
    `Plan: ${escapeMarkdown(plan)}`,
    '',
    `\ud83d\udcde Voice: ${voiceUsed} / ${voiceLimit} min \(${voicePct}%\)`,
    `\ud83d\udcac WhatsApp: ${waUsed} / ${waLimit} msgs \(${waPct}%\)`,
    ``,
    highestPct > 100
      ? `\u26a0\ufe0f Client has exceeded plan limits. Consider upgrade.`
      : highestPct > 80
        ? `\u26a0\ufe0f Client approaching limit. Monitor closely.`
        : `\ud83d\udcc8 On track. No action needed.`
  ].join('\n');
}

// ─── FAILED BOOKING ALERT ───────────────────────────────────────

function failedBooking({ clientName, time, error, customerPhone, retryCount }) {
  return [
    '\ud83d\udd25 *FAILED BOOKING ALERT*',
    '',
    `Client: ${escapeMarkdown(clientName)}`,
    `Time: ${time}`,
    `Customer: ${escapeMarkdown(customerPhone || 'N/A')}`,
    `Error: _${escapeMarkdown(error)}_`,
    retryCount ? `Retries: ${retryCount}` : '',
    '',
    `\ud83d\udca1 *Recommended:* Follow up with customer if booking didn't complete.`
  ].filter(Boolean).join('\n');
}

// ─── NEW CLIENT ONBOARDED ──────────────────────────────────────

function newClientOnboarded({ clientName, contactName, plan, agentName, servicesCount, languages, automations }) {
  return [
    '\u2705 *NEW CLIENT ONBOARDED*',
    '',
    `Client: ${escapeMarkdown(clientName)}`,
    `Contact: ${escapeMarkdown(contactName)}`,
    `Plan: ${escapeMarkdown(plan)}`,
    '',
    `Configuration:`,
    `  \u2022 Agent: ${escapeMarkdown(agentName)}`,
    `  \u2022 Services: ${servicesCount} configured`,
    `  \u2022 Languages: ${languages.join(', ')}`,
    `  \u2022 Automations: ${automations}`,
    '',
    `Next Steps:`
  ].join('\n');
}

// ─── DAILY USAGE REPORT (8pm) ──────────────────────────────────

function dailyUsageReport({ date, totalCost, clients, monthToDate }) {
  const lines = [
    '\ud83d\udcca *MOON HANDS DAILY USAGE REPORT*',
    `\ud83d\udcc5 ${date} \u2013 8:00 PM`,
    '',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    '\ud83d\udcb0 *TODAY\'S COSTS*',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    ''
  ];

  let totalVoice = 0, totalWA = 0, totalClientCost = 0;
  const alerts = [];

  clients.forEach(c => {
    totalVoice += c.voice_minutes;
    totalWA += c.whatsapp_messages;
    totalClientCost += c.cost || 0;

    const voiceLimit = c.plan === 'professional' ? 2000 : 500;
    const waLimit = c.plan === 'professional' ? 5000 : 1000;
    const vPct = Math.round((c.voice_minutes / voiceLimit) * 100);
    const wPct = Math.round((c.whatsapp_messages / waLimit) * 100);

    const status = vPct > 100 || wPct > 100 ? '\ud83d\udd34' : vPct > 80 || wPct > 80 ? '\ud83d\udfe1' : '\ud83d\udfe2';
    const warning = vPct > 100 || wPct > 100 ? ' \u26a0\ufe0f' : '';

    lines.push(`${status} ${escapeMarkdown(c.name)} \(${escapeMarkdown(c.plan)}\)${warning}`);
    lines.push(`   Voice: ${c.voice_minutes}min | WA: ${c.whatsapp_messages}msgs`);
    lines.push(`   Cost: $${(c.cost || 0).toFixed(2)}`);
    lines.push('');

    if (vPct > 100 || wPct > 100) {
      alerts.push(`\u2022 ${escapeMarkdown(c.name)} exceeded limits \u2192 recommend upgrade`);
    } else if (vPct > 80 || wPct > 80) {
      alerts.push(`\u2022 ${escapeMarkdown(c.name)} at ${Math.max(vPct, wPct)}% \u2192 monitor`);
    }
  });

  lines.push(`TOTAL TODAY: $${totalClientCost.toFixed(2)}`);
  lines.push(`\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
  lines.push('\ud83d\udcc8 *MONTH-TO-DATE*');
  lines.push('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
  lines.push(`Spent: $${monthToDate.spent.toFixed(2)}`);
  lines.push(`Budget: $${monthToDate.budget.toFixed(2)}`);
  lines.push(`Remaining: $${monthToDate.remaining.toFixed(2)} \(${Math.round(monthToDate.remaining/monthToDate.budget*100)}%\)`);

  if (alerts.length) {
    lines.push(`\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
    lines.push('\u26a0\ufe0f *ALERTS*');
    lines.push('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
    alerts.forEach(a => lines.push(a));
  }

  lines.push('\nReply `/details <client-id>` for detailed report.');

  return lines.join('\n');
}

// ─── DAILY HEALTH REPORT (8:30pm) ──────────────────────────────

function dailyHealthReport({ date, apiStatuses, clientHealth, autoActions }) {
  const lines = [
    '\ud83c\udfe5 *MOON HANDS HEALTH REPORT*',
    `\ud83d\udcc5 ${date}`,
    ''
  ];

  const allHealthy = Object.values(apiStatuses).every(s => s.status === 'healthy');

  if (allHealthy) {
    lines.push('\u2705 *ALL SYSTEMS OPERATIONAL*');
  } else {
    lines.push('\u26a0\ufe0f *SOME SERVICES DEGRADED*');
  }

  lines.push('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
  lines.push('');
  lines.push('*API Status:*');
  Object.entries(apiStatuses).forEach(([name, s]) => {
    const emoji = s.status === 'healthy' ? '\u2705' : s.status === 'degraded' ? '\u26a0\ufe0f' : '\ud83d\udd34';
    lines.push(`${emoji} ${escapeMarkdown(name)} \u2013 ${escapeMarkdown(s.status)} \(${s.latency}ms\)`);
  });

  lines.push('');
  lines.push('*Client Health:*');
  lines.push(`\u2705 ${clientHealth.active} active`);
  if (clientHealth.paused) lines.push(`\u23f8\ufe0f ${clientHealth.paused} paused`);
  if (clientHealth.errors) lines.push(`\ud83d\udd34 ${clientHealth.errors} with errors`);

  if (autoActions.length) {
    lines.push('');
    lines.push('*Auto-Actions Today:*');
    autoActions.forEach(a => lines.push(`  \u2022 ${escapeMarkdown(a)}`));
  }

  const healthScore = allHealthy ? 'EXCELLENT' : clientHealth.errors ? 'NEEDS ATTENTION' : 'GOOD';
  const scoreEmoji = allHealthy ? '\ud83d\udc9a' : clientHealth.errors ? '\ud83d\udfe0' : '\ud83d\udfe1';

  lines.push(`\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
  lines.push(`${scoreEmoji} *SYSTEM HEALTH: ${healthScore}*`);
  lines.push('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');

  return lines.join('\n');
}

// ─── CRITICAL ALERT ─────────────────────────────────────────────

function criticalAlert({ service, issue, impact, autoAction, adminAction, affectedClients }) {
  const lines = [
    '\ud83d\udea8\ud83d\udea8 *CRITICAL ALERT* \ud83d\udea8\ud83d\udea8',
    '',
    `Service: *${escapeMarkdown(service)}*`,
    `Issue: ${escapeMarkdown(issue)}`,
    `Impact: ${escapeMarkdown(impact)}`,
    `Affected: ${affectedClients} client${affectedClients !== 1 ? 's' : ''}`,
    ''
  ];

  if (autoAction) {
    lines.push(`\u2699\ufe0f *Auto-Action:* ${escapeMarkdown(autoAction)}`);
  }

  lines.push('');
  lines.push(`\ud83d\udca1 *Your Action: ${adminAction ? escapeMarkdown(adminAction) : 'None needed \u2013 monitoring'}*`);
  lines.push('Reply /status for details.');

  return lines.join('\n');
}

// ─── CHANGE CONFIRMATION ────────────────────────────────────────

function changeConfirmed({ clientName, action, details, deployedBy, timestamp }) {
  return [
    '\u2705 *CHANGE DEPLOYED*',
    '',
    `Client: ${escapeMarkdown(clientName)}`,
    `Action: ${escapeMarkdown(action)}`,
    details ? `Details: ${escapeMarkdown(details)}` : '',
    deployedBy ? `By: ${escapeMarkdown(deployedBy)}` : '',
    timestamp ? `At: ${timestamp}` : '',
    '',
    `The AI agent has been updated and is now live.`
  ].filter(Boolean).join('\n');
}

// ─── EXPORTS ─────────────────────────────────────────────────────

module.exports = {
  highValueLead,
  usageAlert,
  failedBooking,
  newClientOnboarded,
  dailyUsageReport,
  dailyHealthReport,
  criticalAlert,
  changeConfirmed
};
