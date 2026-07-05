/**
 * Moon Hands - Conversation State Manager
 * Tracks multi-turn booking flows with TTL-based in-memory storage.
 * Production upgrade path: swap Map for Redis.
 */

const stateStore = new Map();
const TTL_MS = 60 * 60 * 1000;

const BOOKING_STATES = {
  IDLE: 'idle',
  MULTI_INTENT_CONFIRM: 'multi_intent_confirm',
  BOOKING_OFFERED: 'booking_offered',  // Bot offered to help with booking, awaiting Yes/No
  AWAITING_DATE: 'awaiting_date',
  AWAITING_TIME: 'awaiting_time',
  AWAITING_TREATMENT: 'awaiting_treatment',
  AWAITING_NAME: 'awaiting_name',
  AWAITING_PHONE: 'awaiting_phone',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  READY_TO_BOOK: 'ready_to_book',
};

function normalizePhone(phone) { return (phone || '').replace(/\D/g, ''); }

function getState(phone) {
  const record = stateStore.get(normalizePhone(phone));
  if (!record) return { state: BOOKING_STATES.IDLE, data: {} };
  if (Date.now() - record.lastActivity > TTL_MS) {
    stateStore.delete(normalizePhone(phone));
    return { state: BOOKING_STATES.IDLE, data: {} };
  }
  return { state: record.state, data: record.data };
}

function setState(phone, state, data = {}) {
  stateStore.set(normalizePhone(phone), {
    state, data: { ...getState(phone).data, ...data },
    lastActivity: Date.now()
  });
}

function resetIdle(phone) { setState(phone, BOOKING_STATES.IDLE, {}); }

// Date parsing
function parseDatePhrase(phrase) {
  const now = new Date();
  const lower = phrase.toLowerCase().trim();
  // Handle common short forms and typos: tmr, tmrw, nxt, sat, sun
  const SHORT_FORMS = {
    'tmr': 'tomorrow', 'tmrw': 'tomorrow',
    'nxt': 'next', 'nx': 'next',
    'mon': 'monday', 'tue': 'tuesday', 'tues': 'tuesday', 'wed': 'wednesday',
    'thu': 'thursday', 'thur': 'thursday', 'thurs': 'thursday',
    'fri': 'friday', 'sat': 'saturday', 'sun': 'sunday',
  };
  // Expand short forms in phrase
  let expanded = lower;
  for (const [short, full] of Object.entries(SHORT_FORMS)) {
    expanded = expanded.replace(new RegExp(`\\b${short}\\b`, 'g'), full);
  }
  
  if (expanded === 'tomorrow') {
    const d = new Date(now); d.setDate(d.getDate() + 1);
    return formatDate(d);
  }
  // Handle "next week" → 7 days from now
  if (expanded === 'next week') {
    const d = new Date(now); d.setDate(d.getDate() + 7);
    return formatDate(d);
  }
  const dayMatch = expanded.match(/(next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (dayMatch) {
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const targetDay = dayNames.indexOf(dayMatch[2]);
    if (targetDay === -1) return null;
    const d = new Date(now);
    let daysAhead = targetDay - d.getDay();
    if (dayMatch[1] === 'next') daysAhead = daysAhead <= 0 ? daysAhead + 7 : daysAhead;
    else if (daysAhead < 0) daysAhead += 7;
    d.setDate(d.getDate() + daysAhead);
    return formatDate(d);
  }
  try {
    const parsed = new Date(phrase + ' ' + now.getFullYear());
    if (!isNaN(parsed.getTime())) return formatDate(parsed);
  } catch { /* ignore */ }
  if (/^\d{4}-\d{2}-\d{2}$/.test(phrase)) return phrase;
  return null;
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseTimePhrase(phrase) {
  const lower = phrase.toLowerCase();
  if (lower === 'morning') return '10:00';
  if (lower === 'afternoon') return '14:00';
  if (lower === 'evening') return '17:00';
  const match = phrase.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (!match) return null;
  let hour = parseInt(match[1]);
  const minute = match[2] ? parseInt(match[2]) : 0;
  const ampm = match[3]?.toLowerCase();
  if (ampm === 'pm' && hour !== 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}

// ─── TREATMENT EXTRACTION ────────────────────────────────────────
// Extracts ALL treatments mentioned in a message (for multi-treatment bookings)

function extractTreatmentName(message, services = []) {
  const all = extractAllTreatments(message, services);
  return all.length > 0 ? all[0] : null; // backward compat
}

function extractAllTreatments(message, services = []) {
  const lower = message.toLowerCase();
  const found = [];
  let remaining = lower;
  
  if (services.length > 0) {
    const svcNames = services.map(s => s.name.toLowerCase());
    
    // PASS 1: Exact matches ("hydrating facial" → "Hydrating Facial")
    // These take priority over partial matches
    for (const svcName of svcNames) {
      if (remaining.includes(svcName) && !found.includes(svcName)) {
        found.push(svcName);
        remaining = remaining.replace(svcName, ' ');
      }
    }
    
    // PASS 2: Partial matches ("botox" → "Botox Consultation")
    // Sort by relevance: services with more query words come first
    const queryWords = remaining.split(' ').filter(w => w.length >= 3);
    const relevanceScore = (svcName) => {
      const svcWords = svcName.split(' ');
      let score = 0;
      for (const qw of queryWords) {
        if (svcWords.some(sw => sw.includes(qw) || qw.includes(sw))) score++;
      }
      return score;
    };
    const sorted = [...svcNames]
      .filter(s => !found.includes(s))
      // Sort: higher relevance first, then fewer words (more specific), then longer name
      .sort((a, b) => relevanceScore(b) - relevanceScore(a) || a.split(' ').length - b.split(' ').length || b.length - a.length);
    
    for (const svcName of sorted) {
      // Skip if already found or if remaining is too short
      if (found.includes(svcName) || remaining.trim().length < 3) continue;
      
      // Check if any significant word from service name is in remaining
      // "botox" (≥4 chars) matches "Botox Consultation"
      // "facial" should NOT match if already exact-matched "Hydrating Facial"
      const words = svcName.split(' ').filter(w => w.length >= 4);
      const hasMatch = words.some(word => remaining.includes(word));
      
      if (hasMatch) {
        found.push(svcName);
        // Remove matched words from remaining
        for (const word of words) {
          remaining = remaining.replace(word, ' ');
        }
      }
    }
  } else {
    // Fallback keyword list when no services provided
    const keywords = [
      'hydrating facial','anti-aging treatment','acne clear facial',
      'laser skin rejuvenation','botox consultation','dermal filler',
      'hifu','thread lift','chemical peel','microneedling','facial','botox','filler','laser','peel'
    ];
    const sorted = [...keywords].sort((a, b) => b.length - a.length);
    for (const s of sorted) {
      if (remaining.includes(s)) {
        found.push(s);
        remaining = remaining.replace(s, ' ');
      }
    }
  }
  
  return found;
}

function extractBookingFields(message, services = []) {
  const lower = message.toLowerCase();
  const fields = {};
  // Date patterns — must include short forms (tmr, nxt, sat) because
  // parseDatePhrase only receives the matched text, not the full message
  const datePatterns = [
    /next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /nxt\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /next\s+(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i,
    /next week/i,
    /\btmr\b|\btmrw\b/i,
    /tomorrow/i,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i,
    /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i,
    /\d{4}-\d{2}-\d{2}/,
  ];
  for (const p of datePatterns) { const m = message.match(p); if (m) { const d = parseDatePhrase(m[0]); if (d) { fields.date = d; break; } } }
  // Time
  const timePatterns = [
    /(\d{1,2}):(\d{2})\s*(am|pm)/i, /(\d{1,2})\s*(am|pm)/i,
    /(\d{1,2}):(\d{2})/, /\b(morning|afternoon|evening)\b/i,
  ];
  for (const p of timePatterns) { const m = message.match(p); if (m) { const t = parseTimePhrase(m[0]); if (t) { fields.time = t; break; } } }
  // Treatment(s) — extract ALL treatments for multi-treatment bookings
  const allTreatments = extractAllTreatments(message, services);
  if (allTreatments.length > 0) {
    fields.treatment = allTreatments[0];   // primary (backward compat)
    fields.treatments = allTreatments;     // all treatments found
  }
  // Name
  const nm = message.match(/(?:my name is|i am|i'm)\s+([A-Za-z\s]+?)(?:\.|,|$|\s+(?:and|for|on|at))/i);
  if (nm) fields.name = nm[1].trim();
  // Phone
  const ph = message.match(/[+]?(\d{8,})/);
  if (ph) fields.phone = ph[0];
  return fields;
}

function isConfirmation(message) {
  return ['yes','yeah','yup','correct',"that's right",'right','sure','ok','okay','yep','true','accurate']
    .some(w => message.toLowerCase().trim().includes(w));
}

function isDenial(message) {
  return ['no','nope','nah','not','wrong','incorrect','cancel','stop']
    .some(w => { const l = message.toLowerCase().trim(); return l === w || l.startsWith(w + ' '); });
}

setInterval(() => {
  const now = Date.now();
  for (const [k, r] of stateStore.entries()) { if (now - r.lastActivity > TTL_MS) stateStore.delete(k); }
}, 10 * 60 * 1000);

module.exports = {
  BOOKING_STATES, getState, setState, resetIdle,
  extractBookingFields, extractTreatmentName, extractAllTreatments,
  isConfirmation, isDenial, parseDatePhrase, parseTimePhrase
};
