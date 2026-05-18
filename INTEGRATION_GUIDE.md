# Usage Tracking Integration Guide

## What This Does

Every message and every AI call is written to Supabase as it happens.
The daily report pulls ACTUAL data from the database — no estimates, no fake numbers.

## Step 1: Run the SQL in Supabase

1. Go to Supabase Dashboard → SQL Editor
2. Open `supabase/usage_tracking_schema.sql`
3. Click Run
4. Verify tables appear in Table Editor:
   - `message_logs`
   - `ai_usage_logs`
   - `daily_usage_summary`
   - `rate_limit_events`

## Step 2: Add Logging to Webhook Handler

In `server/webhook.js`, add these lines:

### At the top (import):
```javascript
const { logInboundMessage, logOutboundReply } = require('../supabase/usage-logger');
```

### When a message arrives (after extractMessage):
```javascript
// Log incoming message to Supabase
logInboundMessage(clientConfig.id, message.from, message.text);
```

### When sending a reply (before or after sendWhatsAppReply):
```javascript
// Log the outbound reply
const source = response.isHardcoded ? 'hardcoded' : 'ai';
logOutboundReply(clientConfig.id, message.from, response.text, source);
```

## Step 3: Add Logging to AI Engine

In `ai/bot-engine.js`, add these lines:

### At the top (import):
```javascript
const { logAIUsage } = require('../supabase/usage-logger');
```

### After the OpenAI API call (where you get the response):
```javascript
// Log ACTUAL AI usage with real token counts
const startTime = Date.now();
const completion = await openai.chat.completions.create({...});
const responseTimeMs = Date.now() - startTime;

// Extract ACTUAL token usage from OpenAI response
logAIUsage(
  clientConfig.id,
  patientPhone,
  'gpt-4o-mini',           // model name
  completion.usage,         // { prompt_tokens, completion_tokens, total_tokens }
  responseTimeMs
);
```

The key: `completion.usage` contains the ACTUAL token counts from OpenAI.
This is how we calculate real cost — not estimates.

## Step 4: Add Rate Limit Logging

In `middleware/smart-rate-limiter.js`, when a limit fires:

```javascript
const { logRateLimitEvent } = require('../supabase/usage-logger');

// When sending a graceful "slow down" response:
logRateLimitEvent(clientId, patientPhone, 'flood', 10, 'throttled', gracefulResponse);
```

## Step 5: Schedule the Daily Report

### On Render:
1. Dashboard → Cron Jobs
2. Add new cron job:
   - Command: `node jobs/daily-report.js`
   - Schedule: `0 16 * * *` (4 PM UTC = midnight Singapore time)
3. This runs automatically every day

### Or trigger manually from Telegram:
Add a `/report` command to your admin bot that calls:
```javascript
const { generateDailyReport, formatTelegramReport } = require('../supabase/usage-logger');

bot.command('report', async (ctx) => {
  const report = await generateDailyReport();
  const msg = formatTelegramReport(report);
  ctx.reply(msg, { parse_mode: 'Markdown' });
});
```

## What the Report Shows (REAL Numbers)

Every number in the daily report comes from ACTUAL database records:

| Field | Source |
|-------|--------|
| Total messages | `COUNT(*) FROM message_logs WHERE date = yesterday` |
| AI responses | `COUNT(*) FROM message_logs WHERE response_source = 'ai'` |
| OpenAI cost | `SUM(cost_usd) FROM ai_usage_logs WHERE date = yesterday` |
| Token counts | `SUM(prompt_tokens), SUM(completion_tokens) FROM ai_usage_logs` |
| Response time | `AVG(response_time_ms) FROM ai_usage_logs` |
| Rate limits | `COUNT(*) FROM rate_limit_events WHERE date = yesterday` |
| Per-client breakdown | `GROUP BY client_id` on both tables |

## Verification

After integration, test with one message:
1. Send "What is Botox?" to your WhatsApp demo number
2. Check Supabase Table Editor → `message_logs`
3. You should see 2 rows (1 inbound, 1 outbound)
4. Check `ai_usage_logs` — you should see 1 row with actual tokens and cost
5. Run `node jobs/daily-report.js` manually
6. Check your Telegram — report should show 1 message with real cost

## File Summary

| File | Purpose |
|------|---------|
| `supabase/usage_tracking_schema.sql` | Creates 4 database tables |
| `supabase/usage-logger.js` | Logging functions + report generator |
| `jobs/daily-report.js` | Midnight cron job |
| `middleware/smart-rate-limiter.js` | Multi-layer rate limiting |
| `INTEGRATION_GUIDE.md` | This file |
