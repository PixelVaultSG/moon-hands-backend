/**
 * Moon Hands — Daily Closing Summary Cron
 * 
 * Runs every 15 minutes. Checks each clinic's closing time from onboarding.
 * When a clinic's closing time is reached, sends tomorrow's booking summary.
 * 
 * Why not midnight? Doctor is sleeping. We send when clinic ACTUALLY closes
 * so they can review tomorrow's schedule before leaving.
 */

require('dotenv').config();
const { supabase } = require('../supabase/client');
const { sendDailyClosingSummary } = require('../telegram/booking-notifications');
const { getTodaySG, isClinicOpenNow } = require('../utils/date-helpers');

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 minutes
const ALREADY_SENT_TODAY = new Set(); // Track which clinics got summary today (resets at midnight)

/**
 * Check each clinic's closing time and send daily summary when they close.
 */
async function checkAndSendClosingSummaries() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;
  
  // Reset the sent-tracker at midnight (new day)
  if (currentHour === 0 && currentMin < 15) {
    ALREADY_SENT_TODAY.clear();
    console.log('[CLOSING_SUMMARY] New day — cleared sent tracker');
  }
  
  try {
    // Get all active clinics — only select columns that exist in the table
    const { data: clinics, error } = await supabase
      .from('clients')
      .select('id, name, status, operating_hours')
      .eq('status', 'active');
    
    if (error) {
      console.error('[CLOSING_SUMMARY] Failed to fetch clinics:', error.message);
      return;
    }
    
    if (!clinics || clinics.length === 0) return;
    
    const now = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[now.getDay()];
    
    for (const clinic of clinics) {
      try {
        // Skip if already sent today
        if (ALREADY_SENT_TODAY.has(clinic.id)) continue;
        
        // Parse operating hours from clinic config
        const hours = parseOperatingHours(clinic.operating_hours);
        if (!hours || !hours[todayName]) continue; // No hours for today (closed)
        
        const todayHours = hours[todayName];
        if (!todayHours.isOpen) {
          // Clinic is closed today — skip
          ALREADY_SENT_TODAY.add(clinic.id); // Mark as "sent" (nothing to send)
          continue;
        }
        
        // Check if it's closing time (within 15-minute window)
        const closingTime = todayHours.close;
        if (!closingTime) continue;
        
        const [closeH, closeM] = closingTime.split(':').map(Number);
        const closeMinutes = closeH * 60 + closeM;
        const currentMinutes = currentHour * 60 + currentMin;
        
        // Send summary within 15 minutes after closing
        // (cron runs every 15 min, so we catch closing time + up to 15 min after)
        if (currentMinutes >= closeMinutes && currentMinutes < closeMinutes + 15) {
          console.log(`[CLOSING_SUMMARY] ${clinic.name} closed at ${closingTime}. Sending summary...`);
          await sendDailyClosingSummary(clinic, supabase);
          ALREADY_SENT_TODAY.add(clinic.id);
        }
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
