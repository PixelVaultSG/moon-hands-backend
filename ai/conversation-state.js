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
  // ── BARE DAY NAMES (e.g., "Tuesday", "friday") ──
  // Treat as "next occurrence" — if day already passed this week, go to next week
  const bareDayMatch = expanded.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (bareDayMatch) {
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const targetDay = dayNames.indexOf(bareDayMatch[1]);
    if (targetDay === -1) return null;
    const d = new Date(now);
    let daysAhead = targetDay - d.getDay();
    // Always go to the NEXT occurrence (same behavior as "next X")
    if (daysAhead <= 0) daysAhead += 7;
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
  if (lower === 'noon' || lower === 'midday') return '12:00';
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

  if (services.length > 0) {
    // Sort by length (longest first) so "Laser Skin Rejuvenation" matches before "Laser"
    const svcNames = services.map(s => s.name.toLowerCase()).sort((a, b) => b.length - a.length);

    // Track matches with their position in the original message to preserve input order
    const matches = []; // { name, position }
    let remaining = lower;

    // PASS 1: Exact matches ("hydrating facial" → "Hydrating Facial")
    for (const svcName of svcNames) {
      const pos = remaining.indexOf(svcName);
      if (pos !== -1 && !matches.some(m => m.name === svcName)) {
        matches.push({ name: svcName, position: lower.indexOf(svcName) });
        remaining = remaining.replace(svcName, ' '.repeat(svcName.length));
      }
    }

    // PASS 2: Partial matches ("botox" → "Botox Consultation")
    const queryWords = remaining.split(' ').filter(w => w.length >= 3);
    const relevanceScore = (svcName) => {
      const svcWords = svcName.split(' ');
      let score = 0;
      for (const qw of queryWords) {
        if (svcWords.some(sw => sw.includes(qw) || qw.includes(sw))) score++;
      }
      return score;
    };
    // Position score: prefer services where the matched word appears EARLIER
    // e.g., "laser" in "laser skin rejuvenation" (position 0) beats "picosure laser" (position 1)
    const positionScore = (svcName) => {
      const words = svcName.split(' ').filter(w => w.length >= 4);
      for (const word of words) {
        if (remaining.includes(word)) return svcName.indexOf(word);
      }
      return Infinity;
    };
    const sorted = [...svcNames]
      .filter(s => !matches.some(m => m.name === s))
      .sort((a, b) => relevanceScore(b) - relevanceScore(a) || positionScore(a) - positionScore(b) || b.length - a.length);

    // Generic words that appear in many services — require a SPECIFIC word to also match
    // "facial" is NOT generic — it's a specific treatment category patients ask for directly
    const GENERIC_WORDS = new Set(['treatment', 'consultation', 'service', 'therapy', 'care', 'procedure']);

    for (const svcName of sorted) {
      if (matches.some(m => m.name === svcName) || remaining.trim().length < 3) continue;

      const words = svcName.split(' ').filter(w => w.length >= 4);
      const matchedWords = words.filter(word => remaining.includes(word));
      if (matchedWords.length === 0) continue;

      const onlyGeneric = matchedWords.every(w => GENERIC_WORDS.has(w));
      if (onlyGeneric) continue;

      // Find the earliest position of any matched word in the original message
      let earliestPos = Infinity;
      for (const word of matchedWords) {
        const pos = lower.indexOf(word);
        if (pos !== -1 && pos < earliestPos) earliestPos = pos;
      }
      matches.push({ name: svcName, position: earliestPos === Infinity ? lower.length : earliestPos });

      for (const word of words) {
        remaining = remaining.replace(word, ' '.repeat(word.length));
      }
    }

    // Sort by position in original message to preserve input order
    matches.sort((a, b) => a.position - b.position);
    return matches.map(m => m.name);
  } else {
    // Fallback keyword list when no services provided
    const keywords = [
      'hydrating facial','anti-aging treatment','acne clear facial',
      'laser skin rejuvenation','botox consultation','dermal filler',
      'hifu','thread lift','chemical peel','microneedling','facial','botox','filler','laser','peel'
    ];
    const found = [];
    let remaining = lower;
    const sorted = [...keywords].sort((a, b) => b.length - a.length);
    for (const s of sorted) {
      if (remaining.includes(s)) {
        found.push(s);
        remaining = remaining.replace(s, ' ');
      }
    }
    return found;
  }
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
    // Bare day names — handles "Maybe Friday", "How about Tuesday", "Friday at 11am"
    // Checked LAST to avoid matching day names in unrelated contexts (e.g. "Sunday best")
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
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
  // Name — multiple patterns to handle common formats
  // "my name is John", "i am Jane", "i'm Dr. Tan", "name is Catherine", "call me David"
  // Supports hyphens (Mary-Jane) and titles (Dr., Mr., Ms.)
  const namePatterns = [
    /(?:my name is|i am|i'm|name is|call me)\s+((?:Dr\.|Mr\.|Ms\.|Mrs\.|Mdm\.)?\s*[A-Za-z]+(?:[-\s][A-Za-z]+)*)/i,
  ];
  for (const np of namePatterns) {
    const nm = message.match(np);
    if (nm) { fields.name = nm[1].trim(); break; }
  }
  // Phone — multiple patterns to handle common Singapore expressions
  // "my Handphone number is 87111048", "HP: 91234567", "contact me at +65 9123 4567"
  const phonePatterns = [
    /(?:my\s+(?:new\s+)?(?:phone|contact|mobile|handphone|hp)\s+(?:number\s+)?(?:is\s+)?[:)]?\s*)(\+?\d[\d\s]{5,})/i,
    /(?:call|reach|text|whatsapp)\s+(?:me\s+)?(?:at\s+)?(\+?\d[\d\s]{5,})/i,
    /(?:hp|handphone|contact|whatsapp)\s*[:)]\s*(\+?\d[\d\s]{5,})/i,
  ];
  let foundPhone = null;
  for (const pp of phonePatterns) {
    const pm = message.match(pp);
    if (pm) { foundPhone = pm[1].replace(/\s/g, ''); break; }
  }
  // Fallback 1: number with spaces (e.g., "+65 9123 4567") — strip spaces
  if (!foundPhone) {
    const phSpaced = message.match(/(\+\d{1,3}\s+\d{4}\s*\d{4})/);
    if (phSpaced) foundPhone = phSpaced[1].replace(/\s/g, '');
  }
  // Fallback 2: any 8+ digit number with optional + prefix (no spaces)
  if (!foundPhone) {
    const ph = message.match(/\+?\d{8,}/);
    if (ph) foundPhone = ph[0];
  }
  if (foundPhone) fields.phone = foundPhone;
  return fields;
}

// CRITICAL: Must be precise to avoid false positives like "not sure", "maybe yes"
function isConfirmation(message) {
  const lower = message.toLowerCase().trim();
  // Reject common non-confirmation phrases first
  const nonConfirmPatterns = ['not sure','maybe','perhaps','i think','possibly','probably','not really','i don\'t know','idk'];
  if (nonConfirmPatterns.some(p => lower.includes(p))) return false;
  // Exact matches or clear affirmatives
  const confirmWords = ['yes','yeah','yup','correct',"that's right",'right','sure','ok','okay','yep','yah','true','accurate','definitely','absolutely','alright'];
  return confirmWords.some(w => {
    if (lower === w) return true;
    // Word boundary check: " yes " or " yes!" should match, but "not sure" should NOT match "sure"
    const regex = new RegExp(`\\b${w}\\b`);
    return regex.test(lower);
  });
}

function isDenial(message) {
  const l = message.toLowerCase().trim();
  // Exact matches
  if (['no','nope','nah','wrong','incorrect','cancel','stop','not now','maybe later','nah i\'m good','nope sorry'].includes(l)) return true;
  // Starts with denial word followed by space
  return ['no ','nope ','nah ','not ','wrong ','incorrect ','cancel ','stop ']
    .some(w => l.startsWith(w));
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
