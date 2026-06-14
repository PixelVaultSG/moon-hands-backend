/**
 * Moon Hands - Telegram Bot Command Handlers
 * All admin commands for managing client configurations
 */

const db = require('../../supabase/client');

// ─── FORMAT HELPERS ──────────────────────────────────────────────

function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function formatConfig(config, client) {
  if (!config || !client) return '\\u274c Client not found.';

  const services = (config.services || [])
    .map(s => `  \u2022 ${s.name} \u2013 ${s.price} \(${s.duration}min\)`)
    .join('\n') || '  None';

  const hours = (config.operating_hours || [])
    .map(h => `  \u2022 ${h.day}: ${h.open_time}\u2013${h.close_time}`)
    .join('\n') || '  Not set';

  const faqs = (config.faqs || [])
    .map((f, i) => `  ${i + 1}. ${f.question}`)
    .join('\n') || '  None';

  return [
    `\ud83d\udccb *Client: ${escapeMarkdown(client.name)}*`,
    `Status: ${client.status || 'active'}`,
    `Plan: ${escapeMarkdown(client.plan || 'N/A')}`,
    ``,
    `\ud83e\udd16 AI Agent: *${escapeMarkdown(config.agent_name || 'Default')}*`,
    `Voice: ${escapeMarkdown(config.tone || 'friendly')} / ${config.enthusiasm || 'medium'} enthusiasm`,
    `Greeting: _${escapeMarkdown(config.greeting || 'Default greeting')}_`,
    ``,
    `\u2702\ufe0f *Services:*`,
    services,
    ``,
    `\ud83d\udd50 *Operating Hours:*`,
    hours,
    ``,
    `\u2753 *FAQs (${config.faqs?.length || 0}):*`,
    faqs,
    config.special_notes ? `\n\ud83d\udcdd Notes: _${escapeMarkdown(config.special_notes)}_` : ''
  ].join('\n');
}

// ─── COMMAND HANDLERS ────────────────────────────────────────────

async function handleHelp(ctx) {
  const helpText = [
    '\ud83e\udd16 Moon Hands Admin Bot',
    '',
    '\ud83d\udccb CLIENT MANAGEMENT',
    '/clients \u2014 List all clinics',
    '/viewconfig <clinic-id> \u2014 View full config',
    '',
    '\u2702\ufe0f SERVICES',
    '/addservice <clinic> "Name" $price durationMin',
    '  \u2192 /addservice glow "Bridal Package" $500 180',
    '/updateprice <clinic> "Service" $newPrice',
    '  \u2192 /updateprice glow "Hair Cut" $75',
    '/removeservice <clinic> "Service Name"',
    '',
    '\ud83d\udd50 HOURS & FAQ',
    '/updatehours <clinic> <day> HH:MM HH:MM',
    '  \u2192 /updatehours glow Saturday 09:00 17:00',
    '/addfaq <clinic> "Question?" | "Answer"',
    '  \u2192 /addfaq glow "Parking?" | "Free at rear"',
    '/removefaq <clinic> <number>',
    '',
    '\ud83c\udfad BRAND VOICE',
    '/updatevoice <clinic> <field> <value>',
    '  Fields: name, greeting, tone, enthusiasm, notes',
    '  \u2192 /updatevoice glow greeting "Hey there!"',
    '',
    '\u23f8\ufe0f STATUS',
    '/pause <clinic> \u2014 Stop AI responses',
    '/resume <clinic> \u2014 Resume AI',
    '',
    '\ud83d\udcca REPORTS',
    '/usage <clinic> \u2014 Today\'s usage',
    '',
    '\ud83d\udee1\ufe0f SECURITY',
    '/security \u2014 Security dashboard',
    '/threats \u2014 Active threats',
    '/authlog \u2014 Failed logins (1h)',
    '',
    '\ud83d\udd27 SYSTEM',
    '/debug \u2014 Server diagnostics',
    '/health \u2014 System status',
    '',
    '\u26a0\ufe0f Only you can use these commands.',
  ].join('\n');

  await ctx.reply(helpText);
}

async function handleClients(ctx) {
  const clients = await db.getAllClients();
  if (!clients.length) {
    return ctx.reply('\ud83d\udced No clients found.');
  }

  const active = clients.filter(c => c.status === 'active');
  const paused = clients.filter(c => c.status === 'paused');
  const setup = clients.filter(c => c.status === 'setup');

  const lines = [
    `\ud83d\udcc4 *All Clients (${clients.length} total)*\n`,
    active.length ? `*Active (${active.length}):*` : '',
    ...active.map(c => `  \ud83d\udd12 ${escapeMarkdown(c.slug)} \u2013 ${escapeMarkdown(c.name)}`),
    '',
    setup.length ? `*In Setup (${setup.length}):*` : '',
    ...setup.map(c => `  \u26a1 ${escapeMarkdown(c.slug)} \u2013 ${escapeMarkdown(c.name)}`),
    '',
    paused.length ? `*Paused (${paused.length}):*` : '',
    ...paused.map(c => `  \u23f8\ufe0f ${escapeMarkdown(c.slug)} \u2013 ${escapeMarkdown(c.name)}`),
  ];

  await ctx.replyWithMarkdownV2(lines.filter(Boolean).join('\n'));
}

async function handleViewConfig(ctx) {
  const slug = ctx.match?.[1]?.trim();
  if (!slug) {
    return ctx.reply('\u26a0\ufe0f Usage: `/viewconfig <client-id>`\n\nExample: `/viewconfig glow-beauty`');
  }

  const client = await db.getClientBySlug(slug);
  if (!client) {
    return ctx.reply(`\\u274c Client "${escapeMarkdown(slug)}" not found. Use /clients to see all.`, { parse_mode: 'MarkdownV2' });
  }

  const config = await db.getClientConfig(client.id);
  const text = formatConfig(config, client);

  // Split if too long for Telegram
  if (text.length > 4000) {
    await ctx.replyWithMarkdownV2(text.substring(0, 4000) + '\n\n... (truncated)');
  } else {
    await ctx.replyWithMarkdownV2(text);
  }
}

async function handleAddService(ctx) {
  // Parse: /addservice <slug> "Service Name" $price duration
  const args = ctx.message.text.split(/\s+/);
  if (args.length < 5) {
    return ctx.reply(
      '\u26a0\ufe0f Usage: `/addservice <client-id> "Service Name" <price> <duration-min>`\n\n' +
      'Example: `/addservice glow-beauty "Bridal Package" $500 180`'
    );
  }

  const slug = args[1];
  const client = await db.getClientBySlug(slug);
  if (!client) return ctx.reply(`\\u274c Client "${escapeMarkdown(slug)}" not found.`, { parse_mode: 'MarkdownV2' });

  // Parse quoted service name + price + duration
  const raw = ctx.message.text.replace(`/addservice ${slug} `, '');
  const match = raw.match(/"([^"]+)"\s+(\S+)\s+(\d+)/);
  if (!match) {
    return ctx.reply('\u26a0\ufe0f Format: `/addservice clinic "Service Name" $100 60`');
  }

  const [, name, price, duration] = match;

  const result = await db.addService(client.id, {
    name: name.trim(),
    price: price.trim(),
    duration: parseInt(duration),
    description: ''
  });

  if (result.success) {
    await ctx.replyWithMarkdownV2(
      `\u2705 *Change Request Received*\n\n` +
      `Client: ${escapeMarkdown(client.name)}\n` +
      `Action: Add Service\n` +
      `Service: ${escapeMarkdown(name)}\n` +
      `Price: ${escapeMarkdown(price)}\n` +
      `Duration: ${duration}min\n\n` +
      `\u23f3 Forwarding to Moon Hands AI...`
    );
    // Store pending change for AI to process
    await db.supabase.from('pending_changes').insert({
      client_id: client.id,
      action: 'add_service',
      payload: { name, price, duration },
      requested_by: ctx.from.id,
      status: 'pending'
    });
  } else {
    await ctx.reply(`\u274c Error: ${result.error}`);
  }
}

async function handleUpdatePrice(ctx) {
  const args = ctx.message.text.split(/\s+/);
  if (args.length < 4) {
    return ctx.reply('\u26a0\ufe0f Usage: `/updateprice <client-id> "Service" <new-price>`\nExample: `/updateprice clinic "Hair Cut" $75`');
  }

  const slug = args[1];
  const client = await db.getClientBySlug(slug);
  if (!client) return ctx.reply(`\\u274c Client "${escapeMarkdown(slug)}" not found.`, { parse_mode: 'MarkdownV2' });

  const raw = ctx.message.text.replace(`/updateprice ${slug} `, '');
  const match = raw.match(/"([^"]+)"\s+(\S+)/);
  if (!match) {
    return ctx.reply('\u26a0\ufe0f Format: `/updateprice clinic "Service" $100`');
  }

  const [, serviceName, newPrice] = match;

  const result = await db.updateServicePrice(client.id, serviceName, newPrice);

  if (result.success) {
    await ctx.replyWithMarkdownV2(
      `\u2705 *Change Request Received*\n\n` +
      `Client: ${escapeMarkdown(client.name)}\n` +
      `Action: Update Price\n` +
      `Service: ${escapeMarkdown(serviceName)}\n` +
      `New Price: ${escapeMarkdown(newPrice)}\n\n` +
      `\u23f3 Forwarding to Moon Hands AI...`
    );
    await db.supabase.from('pending_changes').insert({
      client_id: client.id,
      action: 'update_price',
      payload: { service_name: serviceName, new_price: newPrice },
      requested_by: ctx.from.id,
      status: 'pending'
    });
  } else {
    await ctx.reply(`\u274c Error: ${result.error}`);
  }
}

async function handleRemoveService(ctx) {
  const args = ctx.message.text.split(/\s+/);
  if (args.length < 3) {
    return ctx.reply('\u26a0\ufe0f Usage: `/removeservice <client-id> "Service Name"`');
  }

  const slug = args[1];
  const client = await db.getClientBySlug(slug);
  if (!client) return ctx.reply(`\\u274c Client "${escapeMarkdown(slug)}" not found.`, { parse_mode: 'MarkdownV2' });

  const raw = ctx.message.text.replace(`/removeservice ${slug} `, '');
  const match = raw.match(/"([^"]+)"/);
  if (!match) {
    return ctx.reply('\u26a0\ufe0f Format: `/removeservice clinic "Service Name"`');
  }

  const serviceName = match[1];
  const result = await db.removeService(client.id, serviceName);

  if (result.success) {
    await ctx.replyWithMarkdownV2(
      `\u2705 *Service Removed*\n\n` +
      `Client: ${escapeMarkdown(client.name)}\n` +
      `Removed: ${escapeMarkdown(serviceName)}`
    );
  } else {
    await ctx.reply(`\u274c Error: ${result.error}`);
  }
}

async function handleUpdateHours(ctx) {
  const args = ctx.message.text.split(/\s+/);
  if (args.length < 5) {
    return ctx.reply('\u26a0\ufe0f Usage: `/updatehours <client-id> <day> <HH:MM> <HH:MM>`\nExample: `/updatehours clinic Saturday 08:00 14:00`');
  }

  const [_, slug, day, openTime, closeTime] = args;
  const client = await db.getClientBySlug(slug);
  if (!client) return ctx.reply(`\\u274c Client "${escapeMarkdown(slug)}" not found.`, { parse_mode: 'MarkdownV2' });

  const result = await db.updateOperatingHours(client.id, day, openTime, closeTime);

  if (result.success) {
    await ctx.replyWithMarkdownV2(
      `\u2705 *Hours Updated*\n\n` +
      `Client: ${escapeMarkdown(client.name)}\n` +
      `Day: ${escapeMarkdown(day)}\n` +
      `Hours: ${escapeMarkdown(openTime)} \u2013 ${escapeMarkdown(closeTime)}`
    );
  } else {
    await ctx.reply(`\u274c Error: ${result.error}`);
  }
}

async function handleAddFaq(ctx) {
  const args = ctx.message.text.split(/\s+/);
  if (args.length < 3) {
    return ctx.reply('\u26a0\ufe0f Usage: `/addfaq <client-id> Question? | Answer`\nExample: `/addfaq clinic "Parking?" | Yes, free!`');
  }

  const slug = args[1];
  const client = await db.getClientBySlug(slug);
  if (!client) return ctx.reply(`\\u274c Client "${escapeMarkdown(slug)}" not found.`, { parse_mode: 'MarkdownV2' });

  const raw = ctx.message.text.replace(`/addfaq ${slug} `, '');
  const parts = raw.split(/\s*\|\s*/, 2);
  if (parts.length !== 2) {
    return ctx.reply('\u26a0\ufe0f Use `|` to separate question and answer.\nExample: `/addfaq clinic "Hours?" | Mon-Fri 9-6`');
  }

  const question = parts[0].replace(/^"|"$/g, '').trim();
  const answer = parts[1].trim();

  const result = await db.addFaq(client.id, question, answer);

  if (result.success) {
    await ctx.replyWithMarkdownV2(
      `\u2705 *FAQ Added*\n\n` +
      `Client: ${escapeMarkdown(client.name)}\n` +
      `Q: ${escapeMarkdown(question)}\n` +
      `A: ${escapeMarkdown(answer)}`
    );
  } else {
    await ctx.reply(`\u274c Error: ${result.error}`);
  }
}

async function handleRemoveFaq(ctx) {
  const args = ctx.message.text.split(/\s+/);
  if (args.length < 3) {
    return ctx.reply('\u26a0\ufe0f Usage: `/removefaq <client-id> <number>`\nExample: `/removefaq clinic 2`');
  }

  const [_, slug, numStr] = args;
  const index = parseInt(numStr) - 1;
  const client = await db.getClientBySlug(slug);
  if (!client) return ctx.reply(`\\u274c Client "${escapeMarkdown(slug)}" not found.`, { parse_mode: 'MarkdownV2' });

  const result = await db.removeFaq(client.id, index);

  if (result.success) {
    await ctx.reply(`\u2705 FAQ #${index + 1} removed for ${client.name}`);
  } else {
    await ctx.reply(`\u274c Error: ${result.error}`);
  }
}

async function handleUpdateVoice(ctx) {
  const args = ctx.message.text.split(/\s+/);
  if (args.length < 4) {
    return ctx.reply(
      '\u26a0\ufe0f Usage: `/updatevoice <client-id> <field> <value>`\n' +
      'Fields: `name`, `greeting`, `tone`, `enthusiasm`, `notes`\n' +
      'Example: `/updatevoice clinic greeting "Hey! Welcome!"`'
    );
  }

  const slug = args[1];
  const field = args[2].toLowerCase();
  const value = args.slice(3).join(' ').replace(/^"|"$/g, '');

  const client = await db.getClientBySlug(slug);
  if (!client) return ctx.reply(`\\u274c Client "${escapeMarkdown(slug)}" not found.`, { parse_mode: 'MarkdownV2' });

  const result = await db.updateBrandVoice(client.id, field, value);

  if (result.success) {
    await ctx.replyWithMarkdownV2(
      `\u2705 *Voice Updated*\n\n` +
      `Client: ${escapeMarkdown(client.name)}\n` +
      `Field: ${escapeMarkdown(field)}\n` +
      `Value: ${escapeMarkdown(value)}`
    );
  } else {
    await ctx.reply(`\u274c Error: ${result.error}`);
  }
}

async function handlePause(ctx) {
  const slug = ctx.match?.[1]?.trim();
  if (!slug) return ctx.reply('\u26a0\ufe0f Usage: `/pause <client-id>`');

  const client = await db.getClientBySlug(slug);
  if (!client) return ctx.reply(`\\u274c Client "${escapeMarkdown(slug)}" not found.`, { parse_mode: 'MarkdownV2' });

  const result = await db.pauseClient(client.id);
  if (result.success) {
    await ctx.replyWithMarkdownV2(
      `\u23f8\ufe0f *AI Agent Paused*\n\nClient: ${escapeMarkdown(client.name)}\n` +
      `Status: \u23f8\ufe0f PAUSED\n` +
      `The AI will no longer respond to calls or messages.`
    );
  } else {
    await ctx.reply(`\u274c Error: ${result.error}`);
  }
}

async function handleResume(ctx) {
  const slug = ctx.match?.[1]?.trim();
  if (!slug) return ctx.reply('\u26a0\ufe0f Usage: `/resume <client-id>`');

  const client = await db.getClientBySlug(slug);
  if (!client) return ctx.reply(`\\u274c Client "${escapeMarkdown(slug)}" not found.`, { parse_mode: 'MarkdownV2' });

  const result = await db.resumeClient(client.id);
  if (result.success) {
    await ctx.replyWithMarkdownV2(
      `\u25b6\ufe0f *AI Agent Resumed*\n\nClient: ${escapeMarkdown(client.name)}\n` +
      `Status: \ud83d\udd12 ACTIVE\n` +
      `The AI is now live and responding.`
    );
  } else {
    await ctx.reply(`\u274c Error: ${result.error}`);
  }
}

async function handleUsage(ctx) {
  const slug = ctx.match?.[1]?.trim();
  if (!slug) return ctx.reply('\u26a0\ufe0f Usage: `/usage <client-id>`');

  const client = await db.getClientBySlug(slug);
  if (!client) return ctx.reply(`\\u274c Client "${escapeMarkdown(slug)}" not found.`, { parse_mode: 'MarkdownV2' });

  const today = new Date().toISOString().split('T')[0];
  const usage = await db.getDailyUsage(today);
  const clientUsage = usage.find(u => u.client_id === client.id);

  if (!clientUsage) {
    return ctx.reply(`\ud83d\udcca No usage recorded for ${client.name} today.`);
  }

  const voiceLimit = client.plan === 'professional' ? 2000 : 500;
  const waLimit = client.plan === 'professional' ? 5000 : 1000;
  const voicePct = Math.round((clientUsage.voice_minutes / voiceLimit) * 100);
  const waPct = Math.round((clientUsage.whatsapp_messages / waLimit) * 100);

  const status = (pct) => pct > 100 ? '\ud83d\udd34' : pct > 80 ? '\ud83d\udfe1' : '\ud83d\udfe2';

  await ctx.replyWithMarkdownV2(
    `\ud83d\udcca *Usage: ${escapeMarkdown(client.name)}*\n` +
    `Date: ${today}\n\n` +
    `\ud83d\udcde Voice: ${clientUsage.voice_minutes} / ${voiceLimit} min \(${voicePct}%\) ${status(voicePct)}\n` +
    `\ud83d\udcac WhatsApp: ${clientUsage.whatsapp_messages} / ${waLimit} msgs \(${waPct}%\) ${status(waPct)}\n` +
    `\ud83d\udcb0 Cost: $${clientUsage.cost?.toFixed(2) || '0.00'}\n` +
    `\ud83d\udcc8 Bookings: ${clientUsage.bookings || 0}`
  );
}

async function handleHealth(ctx) {
  const checks = await db.getRecentHealthChecks(24);
  if (!checks.length) {
    return ctx.reply('\ud83c\udfe5 No health data available yet.');
  }

  const latest = {};
  checks.forEach(c => {
    if (!latest[c.service] || c.checked_at > latest[c.service].checked_at) {
      latest[c.service] = c;
    }
  });

  const lines = ['\ud83c\udfe5 *System Health \(last 24h\)*\n'];
  Object.values(latest).forEach(c => {
    const emoji = c.status === 'healthy' ? '\u2705' : c.status === 'degraded' ? '\u26a0\ufe0f' : '\ud83d\udd34';
    lines.push(`${emoji} ${escapeMarkdown(c.service)} \u2013 ${escapeMarkdown(c.status)} \(${c.latency_ms}ms\)`);
  });

  const issues = checks.filter(c => c.status !== 'healthy').length;
  lines.push(`\nTotal issues: ${issues}`);

  await ctx.replyWithMarkdownV2(lines.join('\n'));
}

// ─── SECURITY COMMANDS ───────────────────────────────────────────

async function handleSecurity(ctx) {
  try {
    const { data: dashboard } = await db.supabase
      .from('security_dashboard')
      .select('*')
      .single();

    if (!dashboard) {
      return ctx.reply('\ud83d\udee1\ufe0f Security monitoring active. No data yet \u2013 baselines building...');
    }

    const lines = [
      '\ud83d\udee1\ufe0f *Security Dashboard*',
      '',
      `Active threats: ${dashboard.active_threats_count || 0} ${(dashboard.active_threats_count || 0) > 0 ? '\ud83d\udea8' : '\u2705'}`,
      `Unresolved critical: ${dashboard.unresolved_critical || 0}`,
      `Unresolved high: ${dashboard.unresolved_high || 0}`,
      `Events 24h: ${dashboard.events_24h || 0}`,
      `Failed auth 1h: ${dashboard.failed_auth_1h || 0}`,
      `Brute force IPs: ${dashboard.brute_force_ips || 0}`,
      '',
      (dashboard.active_threats_count || 0) > 0
        ? '\u26a0\ufe0f Use /threats to see active threats'
        : '\u2705 All clear'
    ];

    await ctx.replyWithMarkdownV2(lines.join('\n'));
  } catch (err) {
    ctx.reply('\ud83d\udee1\ufe0f Security monitoring active. Baselines building...');
  }
}

async function handleThreats(ctx) {
  try {
    const { data: threats } = await db.supabase
      .from('active_threats')
      .select('*')
      .limit(10);

    if (!threats || threats.length === 0) {
      return ctx.reply('\u2705 No active threats. All clear!');
    }

    const lines = [`\ud83d\udea8 *Active Threats (${threats.length})*\n`];
    
    threats.forEach((t, i) => {
      const emoji = t.severity === 'critical' ? '\ud83d\udea8' : '\ud83d\udd34';
      lines.push(`${emoji} *${i + 1}. ${escapeMarkdown(t.category)}* \(${t.severity}\)`);
      lines.push(`   ${escapeMarkdown(t.description.substring(0, 80))}`);
      lines.push(`   ${new Date(t.triggered_at).toLocaleString('en-SG')}`);
      if (t.source_ip) lines.push(`   IP: ${escapeMarkdown(t.source_ip)}`);
      lines.push('');
    });

    await ctx.replyWithMarkdownV2(lines.join('\n'));
  } catch (err) {
    ctx.reply('\u26a0\ufe0f Could not fetch threats: ' + err.message);
  }
}

async function handleAuthLog(ctx) {
  try {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: attempts } = await db.supabase
      .from('failed_auth_attempts')
      .select('*')
      .gte('timestamp', hourAgo)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (!attempts || attempts.length === 0) {
      return ctx.reply('\u2705 No failed auth attempts in the last hour.');
    }

    const lines = [`\ud83d\udd10 *Failed Auth Attempts \(${attempts.length} in 1h\)*\n`];
    
    attempts.forEach(a => {
      lines.push(`\u2022 ${escapeMarkdown(a.identifier || 'unknown')} \(${a.attempt_type}\)`);
      lines.push(`  IP: ${escapeMarkdown(a.source_ip || 'N/A')} \u2013 ${a.failure_reason}`);
    });

    await ctx.replyWithMarkdownV2(lines.join('\n'));
  } catch (err) {
    ctx.reply('\u26a0\ufe0f Could not fetch auth log: ' + err.message);
  }
}

async function handleDebug(ctx) {
  try {
    const mem = process.memoryUsage();
    const uptime = Math.floor(process.uptime() / 60);
    const lines = [
      '\ud83d\udd27 Debug Info',
      '',
      `Uptime: ${uptime}min`,
      `Memory: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
      `Node: ${process.version}`,
      `Platform: ${process.platform}`,
    ];
    await ctx.reply(lines.join('\n'));
  } catch (err) {
    ctx.reply('\u26a0\ufe0f Debug error: ' + err.message);
  }
}

// ─── EXPORT COMMAND MAP ──────────────────────────────────────────

module.exports = {
  handleHelp,
  handleClients,
  handleViewConfig,
  handleAddService,
  handleUpdatePrice,
  handleRemoveService,
  handleUpdateHours,
  handleAddFaq,
  handleRemoveFaq,
  handleUpdateVoice,
  handlePause,
  handleResume,
  handleUsage,
  handleHealth,
  handleSecurity,
  handleThreats,
  handleAuthLog,
  handleDebug
};
