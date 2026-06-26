/**
 * Moon Hands — Weekly AI Optimization Loop
 * 
 * Premium Tier Feature: S$547/month
 * 
 * Runs every Sunday at 2 AM SGT. Analyzes all patient conversations
 * from the past 7 days and generates actionable optimization recommendations.
 * 
 * Cost-controlled design:
 * - ONE batch analysis per clinic per week (not per-message)
 * - Uses GPT-4o mini (~S$0.03/clinic/week vs S$150+/week for per-message loops)
 * - Max 8K tokens input, 2K output per clinic
 * - Skips clinics with <5 conversations (insufficient data)
 * 
 * What it analyzes:
 * 1. FAQ GAPS: Questions asked frequently but not in clinic's FAQ
 * 2. NO-SHOW PATTERNS: Which appointment types/times have highest no-show rates
 * 3. CONVERSION LEAKS: Conversations that didn't result in bookings (why?)
 * 4. SENTIMENT TRENDS: Patient satisfaction trends over the week
 * 5. RESPONSE QUALITY: AI responses that patients followed up on (indicated confusion)
 * 
 * Output: Weekly Optimization Report sent to admin Telegram + stored in Supabase
 */

require('dotenv').config();
const { supabase } = require('../supabase/client');
const { getTodaySG } = require('../utils/date-helpers');

// ─── CONFIGURATION ───────────────────────────────────────────────

const CONFIG = {
  // Minimum conversations needed for meaningful analysis
  MIN_CONVERSATIONS: 5,
  
  // Minimum times a question must be asked to be flagged as "frequent"
  FAQ_GAP_THRESHOLD: 3,
  
  // No-show rate threshold to trigger concern (%)
  NOSHOW_ALERT_THRESHOLD: 20,
  
  // GPT model for analysis (cost-controlled)
  GPT_MODEL: 'gpt-4o-mini',
  
  // Max tokens per clinic analysis
  MAX_INPUT_TOKENS: 8000,
  MAX_OUTPUT_TOKENS: 2000,
  
  // Enable/disable the loop
  ENABLED: process.env.WEEKLY_LOOP_ENABLED !== 'false',
};

// ─── MAIN ENTRY POINT ────────────────────────────────────────────

/**
 * Run the weekly optimization loop for all active clinics.
 * Called by scheduler every Sunday at 2 AM SGT.
 */
async function runWeeklyOptimizationLoop() {
  if (!CONFIG.ENABLED) {
    console.log('[WEEKLY_LOOP] Disabled via WEEKLY_LOOP_ENABLED=false');
    return;
  }
  
  const startTime = Date.now();
  console.log('[WEEKLY_LOOP] ═══════════════════════════════════════════');
  console.log('[WEEKLY_LOOP] Starting weekly optimization analysis...');
  
  try {
    // Get all active clinics on Premium plan
    const { data: clinics, error } = await supabase
      .from('clients')
      .select('id, slug, name, plan, telegram_chat_id, operating_hours, status')
      .eq('status', 'active')
      .in('plan', ['premium', 'professional']);
    
    if (error) {
      console.error('[WEEKLY_LOOP] Failed to fetch clinics:', error.message);
      return;
    }
    
    if (!clinics || clinics.length === 0) {
      console.log('[WEEKLY_LOOP] No Premium clinics found — skipping');
      return;
    }
    
    console.log(`[WEEKLY_LOOP] Analyzing ${clinics.length} Premium clinic(s)`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const clinic of clinics) {
      try {
        const result = await analyzeClinic(clinic);
        if (result) {
          await storeWeeklyReport(clinic.id, result);
          await sendTelegramReport(clinic, result);
          successCount++;
          console.log(`[WEEKLY_LOOP] ✅ ${clinic.slug}: ${result.insights.length} insights, ${result.suggestions.length} suggestions`);
        }
      } catch (err) {
        failCount++;
        console.error(`[WEEKLY_LOOP] ❌ ${clinic.slug}: ${err.message}`);
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[WEEKLY_LOOP] Complete: ${successCount} success, ${failCount} failed (${duration}s)`);
    console.log('[WEEKLY_LOOP] ═══════════════════════════════════════════');
    
  } catch (err) {
    console.error('[WEEKLY_LOOP] Fatal error:', err.message);
  }
}

// ─── PER-CLINIC ANALYSIS ─────────────────────────────────────────

/**
 * Analyze a single clinic's week of conversations.
 * Fetches data, runs GPT analysis, returns structured report.
 */
async function analyzeClinic(clinic) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString();
  
  // Fetch conversations from past 7 days
  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select('id, patient_phone, message, response, created_at, intent, booked_appointment')
    .eq('client_id', clinic.id)
    .gte('created_at', weekAgoStr)
    .order('created_at', { ascending: true })
    .limit(200); // Cap to control token usage
  
  if (convError) throw new Error(`DB fetch failed: ${convError.message}`);
  if (!conversations || conversations.length < CONFIG.MIN_CONVERSATIONS) {
    console.log(`[WEEKLY_LOOP] ${clinic.slug}: Only ${conversations?.length || 0} conversations — skipping (min: ${CONFIG.MIN_CONVERSATIONS})`);
    return null;
  }
  
  // Fetch current FAQ for comparison
  const { data: configData } = await supabase
    .from('client_configs')
    .select('faqs, services, agent_name, greeting')
    .eq('client_id', clinic.id)
    .single();
  
  const currentFaqs = configData?.faqs?.map(f => f.question) || [];
  const currentServices = configData?.services?.map(s => s.name) || [];
  
  // Fetch appointments for no-show analysis
  const { data: appointments } = await supabase
    .from('appointments')
    .select('service, appointment_date, appointment_time, status, created_at')
    .eq('client_id', clinic.id)
    .gte('created_at', weekAgoStr);
  
  // Build the analysis prompt (cost-controlled: concise but comprehensive)
  const prompt = buildAnalysisPrompt(clinic, conversations, currentFaqs, currentServices, appointments);
  
  // Call GPT-4o mini for analysis
  const analysis = await callGPTAnalysis(prompt);
  
  // Parse and structure the response
  return structureReport(clinic, conversations, appointments, analysis);
}

// ─── PROMPT BUILDER ──────────────────────────────────────────────

function buildAnalysisPrompt(clinic, conversations, currentFaqs, currentServices, appointments) {
  // Summarize conversations into a compact format to control token usage
  const convSummary = conversations.map(c => ({
    msg: c.message.substring(0, 150), // Truncate long messages
    intent: c.intent || 'unknown',
    booked: !!c.booked_appointment,
    resp: c.response ? c.response.substring(0, 100) : null,
  }));
  
  const totalConvs = conversations.length;
  const bookingCount = conversations.filter(c => c.booked_appointment).length;
  const conversionRate = ((bookingCount / totalConvs) * 100).toFixed(1);
  
  const apptSummary = appointments ? {
    total: appointments.length,
    confirmed: appointments.filter(a => a.status === 'confirmed').length,
    noShow: appointments.filter(a => a.status === 'no_show').length,
    cancelled: appointments.filter(a => a.status === 'cancelled').length,
    byService: appointments.reduce((acc, a) => {
      acc[a.service] = (acc[a.service] || 0) + 1;
      return acc;
    }, {}),
  } : { total: 0 };
  
  return {
    model: CONFIG.GPT_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are an AI business analyst for aesthetic clinics. Analyze the week's patient conversations and generate actionable optimization recommendations. 

Output a JSON object with this exact structure:
{
  "insights": [
    {"type": "faq_gap|no_show|conversion|sentiment", "severity": "high|medium|low", "title": "Short title", "detail": "Detailed explanation with numbers"}
  ],
  "suggestions": [
    {"action": "add_faq|adjust_hours|clarify_pricing|improve_response", "priority": 1-10, "description": "What to do", "expected_impact": "Estimated improvement"}
  ],
  "weekly_stats": {
    "total_conversations": number,
    "booking_conversion_rate": "X%",
    "no_show_rate": "X%",
    "top_service_inquired": "service name",
    "avg_response_quality": "good|fair|needs_improvement"
  }
}

Rules:
- Only flag FAQ gaps if asked >=3 times and NOT in current FAQ list
- Only flag no-show concerns if rate >=20%
- Prioritize suggestions by expected revenue impact
- Be specific with numbers and clinic-relevant examples`
      },
      {
        role: 'user',
        content: `Analyze this clinic's week:

CLINIC: ${clinic.name} (${clinic.slug})
PLAN: ${clinic.plan}

WEEK STATS:
- Conversations: ${totalConvs}
- Bookings: ${bookingCount} (${conversionRate}% conversion)
- Appointments: ${apptSummary.total} (${apptSummary.noShow} no-shows)

CURRENT FAQ: ${JSON.stringify(currentFaqs)}
CURRENT SERVICES: ${JSON.stringify(currentServices)}

CONVERSATIONS (sample):
${JSON.stringify(convSummary.slice(0, 50), null, 2)}

APPOINTMENTS:
${JSON.stringify(apptSummary)}`
      }
    ],
    max_tokens: CONFIG.MAX_OUTPUT_TOKENS,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  };
}

// ─── GPT CALL ────────────────────────────────────────────────────

async function callGPTAnalysis(promptBody) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(promptBody)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} — ${error.substring(0, 200)}`);
  }
  
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }
  
  try {
    return JSON.parse(content);
  } catch {
    // If JSON parsing fails, wrap the text response
    return { raw_analysis: content, insights: [], suggestions: [] };
  }
}

// ─── REPORT STRUCTURING ──────────────────────────────────────────

function structureReport(clinic, conversations, appointments, analysis) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekEnd = new Date();
  
  return {
    clinic_id: clinic.id,
    clinic_slug: clinic.slug,
    clinic_name: clinic.name,
    period: {
      from: weekAgo.toISOString().split('T')[0],
      to: weekEnd.toISOString().split('T')[0],
    },
    insights: analysis.insights || [],
    suggestions: (analysis.suggestions || []).sort((a, b) => (b.priority || 0) - (a.priority || 0)),
    weekly_stats: analysis.weekly_stats || {
      total_conversations: conversations.length,
      booking_conversion_rate: 'N/A',
      no_show_rate: 'N/A',
    },
    generated_at: new Date().toISOString(),
  };
}

// ─── SUPABASE STORAGE ────────────────────────────────────────────

async function storeWeeklyReport(clientId, report) {
  const { error } = await supabase
    .from('weekly_reports')
    .insert({
      client_id: clientId,
      period_from: report.period.from,
      period_to: report.period.to,
      insights: report.insights,
      suggestions: report.suggestions,
      weekly_stats: report.weekly_stats,
      generated_at: report.generated_at,
    });
  
  if (error) {
    console.error(`[WEEKLY_LOOP] Failed to store report for ${report.clinic_slug}:`, error.message);
  }
}

// ─── TELEGRAM DELIVERY ───────────────────────────────────────────

async function sendTelegramReport(clinic, report) {
  const bot = require('../telegram/bot').bot;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID || clinic.telegram_chat_id;
  
  if (!chatId) {
    console.log(`[WEEKLY_LOOP] No chat ID for ${clinic.slug} — skipping Telegram`);
    return;
  }
  
  // Build the report message
  const lines = [
    `📊 *Weekly AI Optimization Report*`,
    `Clinic: ${clinic.name}`,
    `Period: ${report.period.from} → ${report.period.to}`,
    ``,
    `*Week at a Glance:*`,
    `💬 ${report.weekly_stats.total_conversations} patient conversations`,
    `📅 ${report.weekly_stats.booking_conversion_rate} booking conversion`,
    `❌ ${report.weekly_stats.no_show_rate} no-show rate`,
    ``,
  ];
  
  // Add high-priority insights
  const highPriority = report.insights.filter(i => i.severity === 'high');
  if (highPriority.length > 0) {
    lines.push(`*🚨 High Priority Insights:*`);
    highPriority.forEach((insight, i) => {
      lines.push(`${i + 1}. *${insight.title}*\\n${insight.detail}`);
    });
    lines.push('');
  }
  
  // Add top suggestions
  const topSuggestions = report.suggestions.slice(0, 5);
  if (topSuggestions.length > 0) {
    lines.push(`*💡 Top Recommendations:*`);
    topSuggestions.forEach((s, i) => {
      const emoji = s.priority >= 8 ? '🔴' : s.priority >= 5 ? '🟡' : '🟢';
      lines.push(`${emoji} *${s.action}* (Priority: ${s.priority}/10)\\n${s.description}\\n_Impact: ${s.expected_impact}_`);
    });
    lines.push('');
  }
  
  lines.push(`_This is a Premium tier feature. Run every Sunday._`);
  
  try {
    await bot.telegram.sendMessage(chatId, lines.join('\\n'), { parse_mode: 'MarkdownV2' });
  } catch (mdErr) {
    // Fallback: strip markdown and retry
    const plainText = lines.join('\\n').replace(/[*_]/g, '');
    await bot.telegram.sendMessage(chatId, plainText);
  }
}

// ─── SCHEDULER ───────────────────────────────────────────────────

/**
 * Start the weekly loop scheduler.
 * Runs every Sunday at 2 AM SGT (UTC+8).
 */
function startWeeklyLoopScheduler() {
  if (!CONFIG.ENABLED) {
    console.log('[WEEKLY_LOOP] Scheduler disabled');
    return;
  }
  
  // Calculate time until next Sunday 2 AM SGT
  const now = new Date();
  const sgtOffset = 8 * 60; // SGT is UTC+8 in minutes
  const utcNow = now.getTime() + now.getTimezoneOffset() * 60000;
  const sgtNow = new Date(utcNow + sgtOffset * 60000);
  
  const daysUntilSunday = (7 - sgtNow.getDay()) % 7 || 7; // 0 = today is Sunday, so next Sunday
  const nextSunday = new Date(sgtNow);
  nextSunday.setDate(sgtNow.getDate() + daysUntilSunday);
  nextSunday.setHours(2, 0, 0, 0);
  
  const msUntilNext = nextSunday - sgtNow;
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  
  console.log(`[WEEKLY_LOOP] Scheduler started — next run: ${nextSunday.toISOString()} (in ${(msUntilNext / 3600000).toFixed(1)}h)`);
  
  // Initial delay then weekly interval
  setTimeout(() => {
    runWeeklyOptimizationLoop();
    setInterval(runWeeklyOptimizationLoop, msPerWeek);
  }, msUntilNext);
}

// ─── EXPORTS ─────────────────────────────────────────────────────

module.exports = {
  runWeeklyOptimizationLoop,
  startWeeklyLoopScheduler,
  CONFIG,
};
