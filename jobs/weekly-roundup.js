/**
 * Moon Hands — Weekly Booking Roundup scheduler (v2.2.7)
 *
 * Ash's spec: send the roundup 30 minutes before closing time on the
 * clinic's LAST open day of the week (ISO week, Monday=1 … Sunday=7):
 *   - closed Sunday          → Saturday, close−30m
 *   - closed Sat + Sun       → Friday, close−30m
 *   - open 7 days            → Sunday, close−30m
 *
 * All math in Asia/Singapore. Runs on the shared 15-minute tick; a kv_store
 * marker guarantees at-most-once per clinic per week.
 */

const { supabase } = require('../supabase/client');
const { sendWeeklyRoundup } = require('../telegram/booking-notifications');
const { sgNowParts } = require('../utils/date-helpers');

const SEND_BEFORE_CLOSE_MIN = 30;
const TICK_WINDOW_MIN = 15; // matches the scheduler interval
const ISO_DAY = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };

function toMinutes(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : null;
}

// operating_hours is an array of {day, isOpen, open_time, close_time}
// (flat column, with config jsonb as fallback for legacy rows).
function normalizeOpenDays(hours) {
  if (!Array.isArray(hours)) return [];
  return hours
    .map(h => ({
      isoDay: ISO_DAY[h && h.day],
      day: h && h.day,
      closeMinutes: h ? toMinutes(h.close_time) : null,
      isOpen: h ? h.isOpen !== false : false,
    }))
    .filter(h => h.isOpen && h.isoDay !== undefined && h.closeMinutes !== null);
}

// The weekly roundup moment: the open day with the highest ISO index,
// 30 minutes before its close. Returns null when nothing is open.
function getWeeklyRoundupInfo(operatingHours) {
  const openDays = normalizeOpenDays(operatingHours);
  if (openDays.length === 0) return null;
  const last = openDays.reduce((a, b) => (b.isoDay > a.isoDay ? b : a));
  return {
    isoDay: last.isoDay,
    day: last.day,
    closeMinutes: last.closeMinutes,
    sendMinutes: last.closeMinutes - SEND_BEFORE_CLOSE_MIN,
  };
}

// Due when SG now is the target day, inside [sendMinutes, sendMinutes + tick).
function isRoundupDue(operatingHours, sgNowMinutes, sgDayIndexJS) {
  const info = getWeeklyRoundupInfo(operatingHours);
  if (!info) return false;
  const sgIsoDay = sgDayIndexJS === 0 ? 7 : sgDayIndexJS; // JS Sunday=0 → ISO 7
  return sgIsoDay === info.isoDay &&
    sgNowMinutes >= info.sendMinutes &&
    sgNowMinutes < info.sendMinutes + TICK_WINDOW_MIN;
}

async function runWeeklyRoundups() {
  const sg = sgNowParts();
  const { data: clinics, error } = await supabase
    .from('clients')
    .select('id, name, status')
    .eq('status', 'active');
  if (error || !clinics) return;

  for (const client of clinics) {
    try {
      const { data: cfg } = await supabase
        .from('client_configs')
        .select('*')
        .eq('client_id', client.id)
        .single();
      const hours = cfg?.operating_hours || cfg?.config?.operating_hours;
      if (!isRoundupDue(hours, sg.nowMinutes, sg.dayIndex)) continue;

      // At-most-once per clinic per week (server restarts must not double-send)
      const dedupeKey = `weekly_roundup:${client.id}:${sg.todayStr}`;
      const { data: seen } = await supabase
        .from('kv_store')
        .select('data')
        .eq('key', dedupeKey)
        .single();
      if (seen && seen.data) continue;
      await supabase.from('kv_store').upsert({ key: dedupeKey, data: { sent_at: new Date().toISOString() } });

      await sendWeeklyRoundup({ id: client.id, clinic_name: client.name }, supabase);
      console.log(`[WEEKLY_ROUNDUP] Sent for ${client.name}`);
    } catch (err) {
      console.error(`[WEEKLY_ROUNDUP] ${client.name}:`, err.message);
    }
  }
}

function startWeeklyRoundupScheduler() {
  runWeeklyRoundups().catch(err => console.error('[WEEKLY_ROUNDUP] Run error:', err.message));
  setInterval(() => runWeeklyRoundups().catch(err => console.error('[WEEKLY_ROUNDUP] Run error:', err.message)), TICK_WINDOW_MIN * 60 * 1000);
  console.log('[WEEKLY_ROUNDUP] Scheduler started (last open day, close−30m SGT)');
}

module.exports = {
  startWeeklyRoundupScheduler,
  runWeeklyRoundups,
  getWeeklyRoundupInfo,
  isRoundupDue,
  SEND_BEFORE_CLOSE_MIN,
};
