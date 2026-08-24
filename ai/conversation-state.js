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
  BOOKING_OFFERED: 'booking_offered',
  AWAITING_DATE: 'awaiting_date',
  AWAITING_TIME: 'awaiting_time',
  AWAITING_TREATMENT: 'awaiting_treatment',
  SELECTING_CATEGORY: 'selecting_category',
  TREATMENT_INFO: 'treatment_info',  // User viewing treatment details, can book or add more
  EDITING_BOOKING: 'editing_booking', // User tapped Edit on confirmation
  AWAITING_NAME: 'awaiting_name',
  AWAITING_PHONE: 'awaiting_phone',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  READY_TO_BOOK: 'ready_to_book',
};

// Follow-up stages for stalled customers in booking flow
const FOLLOW_UP_STAGES = {
  NONE: 0,
  FIRST_REMINDER: 1,    // 5 min — gentle nudge
  SECOND_REMINDER: 2,   // 15 min — urgency
  FINAL_REMINDER: 3,    // 30 min — final attempt
  RESET: 4              // 60 min — state reset (existing TTL)
};

const FOLLOW_UP_DELAYS_MS = {
  [FOLLOW_UP_STAGES.FIRST_REMINDER]: 5 * 60 * 1000,   // 5 min
  [FOLLOW_UP_STAGES.SECOND_REMINDER]: 15 * 60 * 1000,  // 15 min
  [FOLLOW_UP_STAGES.FINAL_REMINDER]: 30 * 60 * 1000,   // 30 min
};

const FOLLOW_UP_MESSAGES = {
  [FOLLOW_UP_STAGES.FIRST_REMINDER]: "Just checking in — are you still interested in booking? Let me know if you need help choosing a treatment or date 😊",
  [FOLLOW_UP_STAGES.SECOND_REMINDER]: "I don't want you to miss out on your preferred slot! Reply whenever you're ready, or I can help you find the best availability 📅",
  [FOLLOW_UP_STAGES.FINAL_REMINDER]: "No worries if you're busy! I'll be here when you're ready. Just send a message and I'll pick up where we left off 👋",
};

function normalizePhone(phone) { return (phone || '').replace(/\D/g, ''); }

function getState(phone) {
  const record = stateStore.get(normalizePhone(phone));
  if (!record) return { state: BOOKING_STATES.IDLE, data: {} };
  if (Date.now() - record.lastActivity > TTL_MS) {
    stateStore.delete(normalizePhone(phone));
    return { state: BOOKING_STATES.IDLE, data: {} };
  }
  return { state: record.state, data: record.data, followUpStage: record.followUpStage || 0 };
}

function setState(phone, state, data = {}) {
  const prev = stateStore.get(normalizePhone(phone));
  stateStore.set(normalizePhone(phone), {
    state, data: { ...(prev?.data || {}), ...data },
    lastActivity: Date.now(),
    followUpStage: prev?.followUpStage || 0,
    lastFollowUpAt: prev?.lastFollowUpAt || null
  });
}

function resetIdle(phone) {
  stateStore.set(normalizePhone(phone), {
    state: BOOKING_STATES.IDLE,
    data: {},
    lastActivity: Date.now(),
    followUpStage: 0,
    lastFollowUpAt: null
  });
}

/**
 * Add a selected treatment to the patient's selection (multi-treatment support)
 */
function addSelectedTreatment(phone, treatmentName) {
  const record = stateStore.get(normalizePhone(phone));
  const current = record?.data?.selectedTreatments || [];
  if (!current.includes(treatmentName)) {
    current.push(treatmentName);
  }
  setState(phone, record?.state || BOOKING_STATES.AWAITING_TREATMENT, {
    selectedTreatments: current
  });
  return current;
}

function clearSelectedTreatments(phone) {
  const record = stateStore.get(normalizePhone(phone));
  if (record) {
    record.data.selectedTreatments = [];
  }
}

/**
 * Check for stalled conversations that need follow-up.
 * Returns array of { phone, stage, message } for each stalled conversation.
 */
function getStalledConversations() {
  const now = Date.now();
  const stalled = [];
  const bookingStates = [
    BOOKING_STATES.BOOKING_OFFERED,
    BOOKING_STATES.AWAITING_DATE,
    BOOKING_STATES.AWAITING_TIME,
    BOOKING_STATES.AWAITING_TREATMENT,
    BOOKING_STATES.SELECTING_CATEGORY,
    BOOKING_STATES.TREATMENT_INFO,
    BOOKING_STATES.EDITING_BOOKING,
    BOOKING_STATES.AWAITING_NAME,
    BOOKING_STATES.AWAITING_PHONE,
    BOOKING_STATES.AWAITING_CONFIRMATION,
    BOOKING_STATES.READY_TO_BOOK,
  ];

  for (const [phone, record] of stateStore.entries()) {
    if (!bookingStates.includes(record.state)) continue;

    const idleTime = now - record.lastActivity;
    const currentStage = record.followUpStage || 0;

    // Check if enough time has passed for next follow-up stage
    const nextStage = currentStage + 1;
    const delayNeeded = FOLLOW_UP_DELAYS_MS[nextStage];

    if (delayNeeded && idleTime >= delayNeeded) {
      // Only send if we haven't already sent at this stage
      const lastFollowUp = record.lastFollowUpAt || 0;
      if (now - lastFollowUp >= delayNeeded) {
        stalled.push({
          phone,
          stage: nextStage,
          message: FOLLOW_UP_MESSAGES[nextStage],
          state: record.state
        });
      }
    }
  }
  return stalled;
}

/**
 * Mark a follow-up as sent for a patient
 */
function markFollowUpSent(phone, stage) {
  const record = stateStore.get(normalizePhone(phone));
  if (record) {
    record.followUpStage = stage;
    record.lastFollowUpAt = Date.now();
  }
}

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
  // Normalize spaced variants first (e.g., "micro needling" → "microneedling")
  const normalized = normalizeTreatmentNames(message);
  const lower = normalized.toLowerCase();
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
      // Also check abbreviations: "pico" matches "picosure", "rf" matches "rf skin tightening"
      const words = svcName.split(' ').filter(w => w.length >= 3);
      const hasMatch = words.some(word => {
        if (remaining.includes(word)) return true;
        // Fuzzy: "pico" matches "picosure" (prefix match for ≥4 char queries)
        if (word.length >= 5) {
          const prefix = word.substring(0, 4);
          if (remaining.includes(prefix) && !['this','that','with','from'].includes(prefix)) return true;
        }
        return false;
      });
      
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
      'hifu','thread lift','chemical peel','microneedling','facial','botox','filler','laser','peel',
      'rejuran healer','picosure laser','picosure','pico laser','rejuran','dermal fillers',
      'ultherapy','rf skin tightening','rf tightening','prp treatment','coolsculpting',
      'led light therapy','oxygen facial','skin rejuvenation','threadlift'
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
  // Strip softener prefixes that don't change intent: "maybe", "perhaps", "possibly"
  // e.g., "Maybe tomorrow at 9pm?" → "tomorrow at 9pm?"
  message = message.replace(/^(maybe|perhaps|possibly)[,\s]+/i, '');
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
  return ['yes','yeah','yup','correct',"that's right",'right','sure','ok','okay','yep','true','accurate','both','go ahead','fine','proceed','confirm','confirmed','mhm','alright','definitely','of course','absolutely','certainly','gladly','happily','by all means','very well']
    .some(w => message.toLowerCase().trim().includes(w));
}

function isDenial(message) {
  return ['no','nope','nah','not','wrong','incorrect','cancel','stop']
    .some(w => { const l = message.toLowerCase().trim(); return l === w || l.startsWith(w + ' '); });
}

// ─── TREATMENT NAME NORMALIZATION ─────────────────────────────────
// Converts spaced variants: "micro needling" → "microneedling"

function normalizeTreatmentNames(message) {
  const SPACED_VARIANTS = {
    'micro needling': 'microneedling',
    'pico sure laser': 'picosure laser',
    'pico sure': 'picosure',
    'laser skin rejuvenation': 'laser skin rejuvenation',
    'bot ox': 'botox',
    'thread lift': 'thread lift',
    'chemical peel': 'chemical peel',
    'rejuran healer': 'rejuran healer',
    'dermal fillers': 'dermal fillers',
    'skin rejuvenation': 'skin rejuvenation',
    'anti aging': 'anti-aging',
    'acne clear': 'acne clear'
  };

  let normalized = message.toLowerCase();
  for (const [spaced, compact] of Object.entries(SPACED_VARIANTS)) {
    normalized = normalized.replace(new RegExp(spaced, 'gi'), compact);
  }
  return normalized;
}

// ─── SMART CONFIRMATION PARSER ────────────────────────────────────
// Parses user replies during CONFIRMING_TREATMENT and CONFIRMING_NAME states
// Returns { action, treatment, treatments, name, additions, ... }
//
// Actions: confirm, confirm_add, add, correct, reject, ambiguous

function parseSmartConfirmation(message, services = []) {
  const lower = message.toLowerCase().trim();
  const result = { action: null };

  // Normalize message for treatment matching
  const normalizedMsg = normalizeTreatmentNames(message);

  // 1. Detect NO / REJECTION first (strongest signal)
  if (isDenial(message) || lower.match(/\bno\b/) || lower.startsWith('no ')) {
    result.action = 'reject';
    const fields = extractBookingFields(message, services);
    if (fields.treatment) result.treatment = fields.treatment;
    if (fields.treatments) result.treatments = fields.treatments;
    if (fields.date) result.date = fields.date;
    if (fields.time) result.time = fields.time;
    if (fields.name) result.name = fields.name;
    return result;
  }

  // 2. "my name is..." / "call me..." → NAME CORRECTION
  const nameMatch = message.match(/(?:my name is|it's|call me|name is|i am|i'm)\s+((?:Dr\.|Mr\.|Ms\.|Mrs\.|Mdm\.)?\s*[A-Za-z]+(?:[-\s][A-Za-z]+)*)/i);
  if (nameMatch) {
    result.action = 'correct';
    result.name = nameMatch[1].trim();
    return result;
  }

  // 3. "actually..." / "change to..." / "instead..." / "switch to..." → CORRECTION
  if (lower.match(/\b(actually|instead|change to|make it|switch to|i meant|i want)\b/)) {
    const fields = extractBookingFields(normalizedMsg, services);
    if (fields.treatment || fields.treatments) {
      result.action = 'correct';
      if (fields.treatments) result.treatments = fields.treatments;
      if (fields.treatment) result.treatment = fields.treatment;
      return result;
    }
  }

  // 4. "add..." / "also want..." / "plus..." / "and..." (without yes) → ADDITION
  const addPatterns = [
    /\b(?:add|also|plus|include)\s+(.+)/i,
    /\band\s+([a-z\s]+(?:laser|lift|peel|botox|hifu|facial|therapy|treatment|needling|healer|rejuvenation|filler|clear))/i,
    /\b([a-z\s]+(?:laser|lift|peel|botox|hifu|facial|therapy|treatment|needling|healer|rejuvenation|filler|clear))\s+(?:too|as well|also)/i,
    /\bi\s+(?:also|too|as well)\s+(?:want|need|like)\s+(.+)/i,
    /\bdon'?t\s+forget\s+(.+)/i,
    /\bforget\s+to\s+include\s+(.+)/i,
    /\b(?:and\s+)?([a-z\s]+(?:laser|lift|peel|botox|hifu|facial|therapy|treatment|needling|healer|rejuvenation|filler|clear))(?:\s+(?:too|as well|also|please))?/i
  ];
  for (const pattern of addPatterns) {
    const addMatch = message.match(pattern);
    if (addMatch) {
      const potential = normalizeTreatmentNames(addMatch[1].replace(/[!.?]+$/, '').trim());
      const extracted = extractAllTreatments(potential, services);
      if (extracted.length > 0) {
        result.action = 'add';
        result.additions = extracted;
        return result;
      }
    }
  }

  // 5. "yes" + standalone treatments → CONFIRM + ADD
  const yesPatterns = [
    /\b(?:yes|yeah|sure|ok|okay|yup)\b.*\b(botox|hifu|thread lift|microneedling|chemical peel|picosure|rejuran|laser|facial|filler|peel)\b/i,
    /\b(botox|hifu|thread lift|microneedling|chemical peel|picosure|rejuran|laser|facial|filler|peel)\b.*\b(?:yes|yeah|sure|ok|okay|yup)\b/i
  ];
  for (const pattern of yesPatterns) {
    const yesAddMatch = normalizedMsg.match(pattern);
    if (yesAddMatch) {
      const extracted = extractAllTreatments(normalizedMsg, services);
      if (extracted.length > 0) {
        result.action = 'confirm_add';
        result.additions = extracted;
        return result;
      }
    }
  }

  // 6. Simple YES → CONFIRM
  if (isConfirmation(message) && !lower.match(/\b(add|also|plus|and\s+[a-z]+)\b/)) {
    result.action = 'confirm';
    return result;
  }

  // 7. Extract whatever they said → CORRECTION (fallback)
  const fields = extractBookingFields(normalizedMsg, services);
  if (fields.treatment || fields.treatments || fields.name || fields.date || fields.time) {
    result.action = 'correct';
    if (fields.treatment) result.treatment = fields.treatment;
    if (fields.treatments) result.treatments = fields.treatments;
    if (fields.name) result.name = fields.name;
    if (fields.date) result.date = fields.date;
    if (fields.time) result.time = fields.time;
    return result;
  }

  // 8. Fallback → AMBIGUOUS
  result.action = 'ambiguous';
  return result;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, r] of stateStore.entries()) { if (now - r.lastActivity > TTL_MS) stateStore.delete(k); }
}, 10 * 60 * 1000);

module.exports = {
  BOOKING_STATES, getState, setState, resetIdle,
  FOLLOW_UP_STAGES, FOLLOW_UP_MESSAGES, FOLLOW_UP_DELAYS_MS,
  addSelectedTreatment, clearSelectedTreatments,
  getStalledConversations, markFollowUpSent,
  extractBookingFields, extractTreatmentName, extractAllTreatments,
  isConfirmation, isDenial, parseDatePhrase, parseTimePhrase,
  parseSmartConfirmation, normalizeTreatmentNames
};
