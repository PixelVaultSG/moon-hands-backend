/**
 * Moon Hands - Security Operations Center (SOC)
 * Monitors for malicious activity, abuse, and anomalies
 * 
 * Detection Categories:
 * - auth: Failed login attempts, credential stuffing
 * - api_abuse: Unusual API patterns, rate limit violations
 * - credential_exposure: Keys in logs, unexpected usage
 * - cost_anomaly: Spend spikes indicating abuse
 * - injection: Prompt injection, SQL injection attempts
 * - data_exfil: Unusual data access patterns
 * - rate_limit: Repeated rate limit hits
 */

const db = require('../supabase/client');
const alerts = require('../telegram/alerts/templates');

// ─── CONFIGURATION ──────────────────────────────────────────────

const THRESHOLDS = {
  // Auth
  FAILED_AUTH_HOUR: 5,        // Alert after 5 failed auths per identifier/hour
  FAILED_AUTH_IP_HOUR: 10,    // Alert after 10 failed auths per IP/hour
  
  // Cost
  COST_SPIKE_CRITICAL: 3.0,   // 3x average = critical
  COST_SPIKE_HIGH: 2.0,       // 2x average = high
  
  // API
  RATE_LIMIT_BURST: 10,       // Alert after 10 rate limits in 10 min
  UNUSUAL_HOUR_PATTERN: true, // Flag API usage at odd hours
  
  // Injection
  INJECTION_KEYWORDS: [
    'ignore previous', 'ignore all', 'system prompt',
    'you are now', 'DAN mode', 'jailbreak',
    'sudo', 'admin access', 'bypass',
    '<?php', '<script', 'SELECT * FROM', 'DROP TABLE',
    'DELETE FROM', 'INSERT INTO', '1=1', 'OR 1=1'
  ],
  
  // Data exfil
  BULK_READ_THRESHOLD: 1000,  // Alert on 1000+ rows read suddenly
};

// ─── AUTH MONITORING ────────────────────────────────────────────

async function checkFailedAuth() {
  const events = [];
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  // Check per identifier (credential stuffing)
  const { data: byIdentifier } = await db.supabase
    .from('failed_auth_attempts')
    .select('identifier, source_ip, count(*)')
    .gte('timestamp', cutoff)
    .group('identifier, source_ip')
    .gte('count', THRESHOLDS.FAILED_AUTH_HOUR);
    
  if (byIdentifier) {
    for (const row of byIdentifier) {
      events.push({
        severity: 'high',
        category: 'auth',
        description: `Credential stuffing detected: ${row.count} failed attempts`,
        details: { identifier: row.identifier, ip: row.source_ip, count: row.count },
        source_ip: row.source_ip
      });
    }
  }
  
  // Check per IP (brute force)
  const { data: byIP } = await db.supabase
    .from('failed_auth_attempts')
    .select('source_ip, count(*)')
    .gte('timestamp', cutoff)
    .group('source_ip')
    .gte('count', THRESHOLDS.FAILED_AUTH_IP_HOUR);
    
  if (byIP) {
    for (const row of byIP) {
      events.push({
        severity: 'critical',
        category: 'auth',
        description: `Brute force attack from IP: ${row.source_ip}`,
        details: { source_ip: row.source_ip, count: row.count, action: 'Recommend IP block' },
        source_ip: row.source_ip
      });
    }
  }
  
  return events;
}

// ─── COST ANOMALY DETECTION ─────────────────────────────────────

async function checkCostAnomalies() {
  const events = [];
  const today = new Date().toISOString().split('T')[0];
  
  const { data: anomalies } = await db.supabase
    .from('cost_anomalies')
    .select('*')
    .eq('date', today)
    .in('anomaly_level', ['critical', 'high']);
    
  if (anomalies) {
    for (const a of anomalies) {
      const multiplier = a.avg_daily_cost > 0 
        ? (a.actual_cost / a.avg_daily_cost).toFixed(1) 
        : 'N/A';
        
      events.push({
        severity: a.anomaly_level,
        category: 'cost_anomaly',
        client_id: a.client_id,
        service: a.service || 'total',
        description: `Cost anomaly: ${a.client_name} spent $${a.actual_cost} (avg: $${a.avg_daily_cost})`,
        details: {
          actual: a.actual_cost,
          average: a.avg_daily_cost,
          max_normal: a.max_daily_cost,
          anomaly_multiplier: multiplier
        }
      });
    }
  }
  
  return events;
}

// ─── API ABUSE DETECTION ────────────────────────────────────────

async function checkAPIAbuse() {
  const events = [];
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  // Rate limit bursts
  const { data: rateLimits } = await db.supabase
    .from('api_access_log')
    .select('service, source_ip, count(*)')
    .gte('timestamp', tenMinAgo)
    .eq('response_status', 429)
    .group('service, source_ip')
    .gte('count', THRESHOLDS.RATE_LIMIT_BURST);
    
  if (rateLimits) {
    for (const row of rateLimits) {
      events.push({
        severity: 'high',
        category: 'rate_limit',
        service: row.service,
        description: `Rate limit burst: ${row.count} 429s from ${row.source_ip}`,
        details: { service: row.service, ip: row.source_ip, count: row.count },
        source_ip: row.source_ip
      });
    }
  }
  
  // Unusual volume per IP
  const { data: volumeSpikes } = await db.supabase
    .from('api_access_log')
    .select('service, source_ip, count(*)')
    .gte('timestamp', hourAgo)
    .group('service, source_ip')
    .gte('count', 500); // 500 requests/hour is suspicious
    
  if (volumeSpikes) {
    for (const row of volumeSpikes) {
      events.push({
        severity: 'medium',
        category: 'api_abuse',
        service: row.service,
        description: `Unusual API volume: ${row.count} requests/hour from ${row.source_ip}`,
        details: { service: row.service, ip: row.source_ip, count: row.count },
        source_ip: row.source_ip
      });
    }
  }
  
  return events;
}

// ─── INJECTION DETECTION ────────────────────────────────────────

async function checkInjectionAttempts() {
  const events = [];
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  // Check conversations for injection keywords
  const keywords = THRESHOLDS.INJECTION_KEYWORDS;
  const pattern = keywords.map(k => k.replace(/'/g, "''")).join('|');
  
  const { data: suspicious } = await db.supabase
    .from('conversations')
    .select('*, clients(name)')
    .gte('created_at', hourAgo)
    .or(`message.ilike.*${keywords[0]}*,` + 
        keywords.slice(1).map(k => `message.ilike.*${k}*`).join(','));
    
  if (suspicious) {
    for (const conv of suspicious) {
      const matchedKeywords = keywords.filter(k => 
        conv.message.toLowerCase().includes(k.toLowerCase())
      );
      
      events.push({
        severity: 'high',
        category: 'injection',
        client_id: conv.client_id,
        description: `Potential injection attempt on ${conv.clients?.name || 'unknown client'}`,
        details: {
          channel: conv.channel,
          matched_keywords: matchedKeywords,
          message_preview: conv.message.substring(0, 100),
          customer_phone: conv.customer_phone
        }
      });
    }
  }
  
  return events;
}

// ─── CREDENTIAL EXPOSURE DETECTION ──────────────────────────────

async function checkCredentialExposure() {
  const events = [];
  
  // Check if API keys appear in conversation logs (accidental paste)
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const keyPatterns = [
    'sk_live_',      // OpenAI/VAPI live keys
    'sk_test_',      // Test keys
    'AC',            // Twilio Account SID prefix
    'eyJhbGci',      // JWT token prefix
    'supabase.co',   // Supabase URL in messages
    'api_key',       // Generic API key mention
    'password',      // Password in conversation
    'HappyFlow',     // Your password pattern
  ];
  
  const { data: exposures } = await db.supabase
    .from('conversations')
    .select('*, clients(name)')
    .gte('created_at', hourAgo)
    .or(keyPatterns.map(p => `message.ilike.*${p}*`).join(','));
    
  if (exposures) {
    for (const conv of exposures) {
      // Don't log the actual secret in the security event
      const matchedPattern = keyPatterns.find(p => 
        conv.message.toLowerCase().includes(p.toLowerCase())
      );
      
      events.push({
        severity: 'critical',
        category: 'credential_exposure',
        client_id: conv.client_id,
        description: `CRITICAL: Potential credential exposure in conversation`,
        details: {
          channel: conv.channel,
          pattern_matched: matchedPattern,
          customer_phone: conv.customer_phone,
          action_required: 'Rotate exposed credentials immediately'
        }
      });
    }
  }
  
  return events;
}

// ─── MAIN SECURITY SCAN ─────────────────────────────────────────

async function runSecurityScan() {
  console.log(`[${new Date().toISOString()}] Starting security scan...`);
  
  const allEvents = [];
  
  // Run all checks
  try { allEvents.push(...await checkFailedAuth()); } catch (e) { console.error('Auth check error:', e.message); }
  try { allEvents.push(...await checkCostAnomalies()); } catch (e) { console.error('Cost check error:', e.message); }
  try { allEvents.push(...await checkAPIAbuse()); } catch (e) { console.error('API abuse error:', e.message); }
  try { allEvents.push(...await checkInjectionAttempts()); } catch (e) { console.error('Injection check error:', e.message); }
  try { allEvents.push(...await checkCredentialExposure()); } catch (e) { console.error('Credential exposure error:', e.message); }
  
  // Log events to database
  for (const event of allEvents) {
    try {
      await db.supabase.from('security_events').insert({
        severity: event.severity,
        category: event.category,
        service: event.service || null,
        client_id: event.client_id || null,
        description: event.description,
        details: event.details || {},
        source_ip: event.source_ip || null,
        triggered_at: new Date().toISOString()
      });
    } catch (e) {
      console.error('Failed to log security event:', e.message);
    }
  }
  
  console.log(`[${new Date().toISOString()}] Security scan complete: ${allEvents.length} events detected`);
  return allEvents;
}

// ─── TELEGRAM ALERT FORMATTER ───────────────────────────────────

function formatSecurityAlert(event) {
  const emoji = {
    critical: '\ud83d\udea8',
    high: '\ud83d\udd34',
    medium: '\ud83d\udfe1',
    low: '\ud83d\udfe0',
    info: '\ud83d\udfe2'
  };
  
  const categoryLabels = {
    auth: '\ud83d\udd10 Authentication',
    api_abuse: '\ud83d\udee1\ufe0f API Abuse',
    credential_exposure: '\ud83d\udd11 Credential Exposure',
    cost_anomaly: '\ud83d\udcb0 Cost Anomaly',
    injection: '\ud83d\udcdd Injection Attempt',
    data_exfil: '\ud83d\udce4\ufe0f Data Exfiltration',
    rate_limit: '\u23f1\ufe0f Rate Limit'
  };
  
  const lines = [
    `${emoji[event.severity] || '\u26a0\ufe0f'} *SECURITY ALERT: ${event.severity.toUpperCase()}*`,
    '',
    `*Category:* ${categoryLabels[event.category] || event.category}`,
    `*Time:* ${new Date().toLocaleString('en-SG')}`
  ];
  
  if (event.service) lines.push(`*Service:* ${event.service}`);
  if (event.client_id) lines.push(`*Client:* ${event.client_id}`);
  if (event.source_ip) lines.push(`*Source IP:* ${event.source_ip}`);
  
  lines.push('');
  lines.push(`*${event.description}*`);
  
  if (event.details) {
    lines.push('');
    lines.push('*Details:*');
    for (const [key, value] of Object.entries(event.details)) {
      if (key === 'message_preview') continue; // Don't show potentially sensitive data
      lines.push(`  \u2022 ${key}: ${value}`);
    }
  }
  
  return lines.join('\n');
}

// ─── EXPORTS ─────────────────────────────────────────────────────

module.exports = {
  runSecurityScan,
  formatSecurityAlert,
  checkFailedAuth,
  checkCostAnomalies,
  checkAPIAbuse,
  checkInjectionAttempts,
  checkCredentialExposure,
  THRESHOLDS
};
