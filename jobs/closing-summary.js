/**
 * Moon Hands — Daily Closing Summary Cron
 * 
 * Runs every 15 minutes. Checks each clinic's closing time from onboarding.
 * When a clinic's closing time is reached AND all pending bookings are cleared,
 * sends tomorrow's booking summary.
 * 
 * Two conditions MUST be met:
 *   1. Clinic has closed for the day (within 15-min window after closing)
 *   2. All pending approval/rejection bookings are cleared (status != 'pending_approval')
 * 
 * Timezone: All times converted from UTC (server) to SGT (Singapore) before comparing.
 * SGT = UTC + 8 hours.
 */

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 minutes
const ALREADY_SENT_TODAY = new Set(); // Track which clinics got summary today (resets at midnight)

/**
 * Check each clinic's closing time and send daily summary when they close.
 */
/**
 * Convert UTC time to SGT (Singapore Time = UTC+8)
 * Render servers run on UTC, but clinic hours are in SGT.
 */
function toSGT(utcDate) {
  const sgt = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
  return {
    hour: sgt.getUTCHours(),
    minute: sgt.getUTCMinutes(),
    day: sgt.getUTCDay(), // 0=Sunday, 6=Saturday
  };
}

async function checkAndSendClosingSummaries() {
  const now = new Date();
  const sgt = toSGT(now);
  const currentHour = sgt.hour;
  const currentMin = sgt.minute;
  const currentTimeStr = `${String(currentHour).padStart(2,'0')}:${String(currentMin).padStart(2,'0')}`;
  
  console.log(`[CLOSING_SUMMARY] Checking at ${currentTimeStr} SGT (day=${sgt.day})`);
  
  // Reset the sent-tracker at midnight SGT (4pm UTC)
  if (currentHour === 0 && currentMin < 15) {
    ALREADY_SENT_TODAY.clear();
    console.log('[CLOSING_SUMMARY] New day — cleared sent tracker');
  }
  
  try {
    // DIAGNOSTIC: First check if client_configs join works
    const { data: testClinics, error: testError } = await supabase
      .from('clients')
      .select('id, name, status, client_configs!inner(operating_hours)')
      .eq('status', 'active')
      .limit(1);
    
    if (testError) {
      console.error('[CLOSING_SUMMARY] DIAGNOSTIC: client_configs join failed:', testError.message);
    } else if (testClinics && testClinics.length > 0) {
      const hasConfig = testClinics[0].client_configs && 
                        (Array.isArray(testClinics[0].client_configs) ? testClinics[0].client_configs.length > 0 : true);
      console.log(`[CLOSING_SUMMARY] DIAGNOSTIC: client_configs join OK. Has config=${hasConfig}`);
    }
    
    // Get all active clinics with their configs
    const { data: clinics, error } = await supabase
      .from('clients')
      .select('id, name, status, client_configs(operating_hours)')
      .eq('status', 'active');
    
    if (error) {
      console.error('[CLOSING_SUMMARY] Failed to fetch clinics:', error.message);
      return;
    }
    
    if (!clinics || clinics.length === 0) {
      console.log('[CLOSING_SUMMARY] No active clinics found');
      return;
    }
    
    console.log(`[CLOSING_SUMMARY] Found ${clinics.length} active clinic(s)`);
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[sgt.day];
    
    for (const clinic of clinics) {
      try {
        console.log(`[CLOSING_SUMMARY] Checking ${clinic.name} (id=${clinic.id?.slice(0,6)})...`);
        
        // Skip if already sent today
        if (ALREADY_SENT_TODAY.has(clinic.id)) {
          console.log(`[CLOSING_SUMMARY]   → Already sent today, skipping`);
          continue;
        }
        
        // Parse operating hours from clinic config
        const rawHours = clinic.client_configs;
        // client_configs may come back as array or object depending on Supabase join
        const configData = Array.isArray(rawHours) ? rawHours[0] : rawHours;
        const hours = parseOperatingHours(configData?.operating_hours);
        
        if (!hours) {
          console.log(`[CLOSING_SUMMARY]   → No operating_hours parsed (raw=${JSON.stringify(rawHours)?.slice(0,80)})`);
          continue;
        }
        if (!hours[todayName]) {
          console.log(`[CLOSING_SUMMARY]   → No hours for ${todayName} (days=${Object.keys(hours).join(',')})`);
          continue;
        }
        
        const todayHours = hours[todayName];
        console.log(`[CLOSING_SUMMARY]   → ${todayName}: isOpen=${todayHours.isOpen}, close=${todayHours.close}`);
        
        if (!todayHours.isOpen) {
          console.log(`[CLOSING_SUMMARY]   → Closed today, marking as done`);
          ALREADY_SENT_TODAY.add(clinic.id);
          continue;
        }
        
        // ── CONDITION 1: Check if clinic has closed for the day ──
        const closingTime = todayHours.close;
        if (!closingTime) {
          console.log(`[CLOSING_SUMMARY]   → No closing time defined`);
          continue;
        }
        
        const [closeH, closeM] = closingTime.split(':').map(Number);
        const closeMinutes = closeH * 60 + closeM;
        const currentMinutes = currentHour * 60 + currentMin;
        
        console.log(`[CLOSING_SUMMARY]   → Current: ${currentMinutes}min, Close: ${closeMinutes}min, Window: ${closeMinutes}-${closeMinutes+15}`);
        
        const isAfterClosing = currentMinutes >= closeMinutes && currentMinutes < closeMinutes + 15;
        if (!isAfterClosing) {
          console.log(`[CLOSING_SUMMARY]   → Not in closing window yet`);
          continue;
        }
        
        // ── CONDITION 2: All pending bookings must be cleared ──
        const { data: pendingBookings, error: pendingErr } = await supabase
          .from('appointments')
          .select('id, customer_name, service, appointment_date, appointment_time')
          .eq('client_id', clinic.id)
          .eq('status', 'pending_approval')
          .gte('appointment_date', new Date().toISOString().split('T')[0]);
        
        if (pendingErr) {
          console.error(`[CLOSING_SUMMARY] Pending check failed for ${clinic.name}:`, pendingErr.message);
          continue;
        }
        
        if (pendingBookings && pendingBookings.length > 0) {
          // Clinic has pending bookings — don't send summary yet
          console.log(`[CLOSING_SUMMARY]   → ${pendingBookings.length} pending booking(s) — skipping summary`);
          // Only send reminder once (first time we see pending bookings)
          const reminderKey = `pending_reminder_${clinic.id}`;
          if (!ALREADY_SENT_TODAY.has(reminderKey)) {
            try {
              const { sendClinicNotification } = require('../telegram/multi-clinic-sender');
              const pendingList = pendingBookings.map(b => 
                `• ${b.customer_name} — ${b.service} on ${b.appointment_date} at ${b.appointment_time}`
              ).join('\n');
              await sendClinicNotification(clinic.id, 
                `⏳ *Pending Bookings Need Your Action*\n\n` +
                `You have *${pendingBookings.length} booking(s)* waiting for approval/rejection:\n\n` +
                `${pendingList}\n\n` +
                `Please review and action these before the end of day.\n` +
                `Your daily closing summary will be sent once all pending bookings are cleared.`
              );
              ALREADY_SENT_TODAY.add(reminderKey);
            } catch (notifyErr) {
              console.error(`[CLOSING_SUMMARY] Pending reminder failed for ${clinic.name}:`, notifyErr.message);
            }
          }
          continue; // Don't mark as sent — will retry next cycle
        }
        
        // ── BOTH CONDITIONS MET: Send closing summary ──
        console.log(`[CLOSING_SUMMARY]   → ✓ Sending closing summary for ${clinic.name}!`);
        await sendDailyClosingSummary(clinic, supabase);
        ALREADY_SENT_TODAY.add(clinic.id);
        console.log(`[CLOSING_SUMMARY]   → ✓ Summary sent for ${clinic.name}`);
        
      } catch (err) {
        console.error(`[CLOSING_SUMMARY] Error for clinic ${clinic.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[CLOSING_SUMMARY] Top-level error:', err.message);
  }
}

/**
 * Parse operating_hours from various formats:
 * - JSON array: [{"day":"Monday","isOpen":true,"open_time":"10:00","close_time":"20:00"},...]
 * - Already an object
 */
function parseOperatingHours(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      // Convert array to object keyed by day name
      const byDay = {};
      for (const entry of parsed) {
        byDay[entry.day] = {
          isOpen: entry.isOpen,
          open: entry.open_time || entry.open,
          close: entry.close_time || entry.close,
        };
      }
      return byDay;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ─── STANDALONE MODE ─────────────────────────────────────────────

if (require.main === module) {
  console.log('[CLOSING_SUMMARY] Starting clinic closing summary scheduler...');
  console.log('[CLOSING_SUMMARY] Checking every 15 minutes');
  
  // Run immediately on startup
  checkAndSendClosingSummaries();
  
  // Then every 15 minutes
  setInterval(checkAndSendClosingSummaries, CHECK_INTERVAL_MS);
}

module.exports = { checkAndSendClosingSummaries };
