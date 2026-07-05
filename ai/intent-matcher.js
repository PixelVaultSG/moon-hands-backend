/**
 * Moon Hands — Intent Matcher
 * Detects up to 18 intents from patient messages.
 * Supports multi-intent: splits by conjunctions, checks each segment.
 * 
 * Returns: [{ intent, confidence, params }]
 *   intent: string identifier
 *   confidence: 0.0-1.0
 *   params: extracted entities (treatment name, date, etc.)
 */

// ─── CONJUNCTIONS FOR MULTI-INTENT SPLITTING ──────────────────────

const CONJUNCTIONS = /\s+(?:and|also|plus|as well as|\&|\/)\s+|\s*[,;]\s+/i;

// ─── INTENT PATTERN DEFINITIONS ────────────────────────────────────

const INTENT_PATTERNS = {
  greeting: {
    // CRITICAL: Must be a PURE greeting with nothing else.
    // "Hi" ✓  "Hi there" ✗  "Hello! How are you" ✗  "hi, i want to book" ✗
    // Uses negative lookahead to reject multi-word non-greetings.
    regex: /^(hi+|hello+|hey+|good\s+(morning|afternoon|evening)|gm|howdy)[\s!]*$/i,
    keywords: ['hi', 'hello', 'hey', 'good morning', 'good afternoon'],
    weight: 1.0,
  },
  
  goodbye: {
    regex: /^(bye+|thanks?|thank\s+you|see\s+you|ok\s+(?:bye|thanks)|got\s+it)[\s!]*$/i,
    keywords: ['bye', 'thank you', 'thanks', 'see you'],
    weight: 1.0,
  },
  
  operating_hours: {
    regex: /(?:what\s+(?:time|hours)|when\s+(?:do\s+you\s+open|are\s+you\s+open|do\s+you\s+close|is\s+the\s+last)|opening\s+(?:hours|time)|closing\s+(?:hours|time)|are\s+you\s+open\s+(?:today|tomorrow|on\s+\w+)|business\s+hours)/i,
    keywords: ['hours', 'open', 'close', 'what time', 'opening', 'closing', 'business hours'],
    weight: 0.9,
  },
  
  location: {
    regex: /(?:where\s+(?:are\s+you|is\s+(?:the\s+)?clinic|are\s+you\s+located|do\s+i\s+find)|address|location|how\s+to\s+get\s+(?:there|to)|(?:clinic|shop)\s+near|nearest\s+(?:mrt|bus|mrt\s+station)|parking)/i,
    keywords: ['where', 'address', 'location', 'how to get', 'find you', 'parking', 'nearby', 'near'],
    weight: 0.9,
  },
  
  pricing_specific: {
    // Handles: "how much is botox", "price of hifu", "botox how much", "hifu price?"
    // The reversed form (.+?)\s+(?:how\s+much|price|cost) catches "botox how much"
    regex: /(?:how\s+much(?:\s+(?:is|for|does))?|what\s+(?:is\s+the\s+price|does\s+it\s+cost)|price\s+(?:of|for))\s+(.+?)(?:\?|$|\s+(?:cost|price))|(.+?)\s+(?:how\s+much|price|cost)[?\s]*$/i,
    keywords: ['how much is', 'price of', 'cost of', 'what is the price'],
    weight: 0.95,
    extract: (match) => {
      const treatment = (match[1] || match[2])?.trim().toLowerCase();
      if (!treatment) return {};
      // Reject garbage captures that aren't treatment names
      const garbageWords = ['are your', 'roughly', 'about', 'around', 'please', 'pls', 'thank', 'thanks'];
      if (garbageWords.some(g => treatment.includes(g))) return {};
      // Reject captures that are too short or too generic
      if (treatment.length < 3) return {};
      const genericWords = ['service', 'treatment', 'procedure', 'consultation', 'booking', 'appointment', 'slot', 'here', 'there'];
      if (genericWords.some(g => treatment.includes(g))) return {};
      return { treatment };
    }
  },
  
  pricing_general: {
    regex: /(?:how\s+much|what\s+(?:are\s+the\s+prices|is\s+the\s+pricing)|price\s+list|pricing|cost\s+list|do\s+you\s+have\s+a\s+price|are\s+the\s+(?:prices|rates))/i,
    exclude: /(?:how\s+much\s+(?:is|for|does)\s+\w+)/i, // Exclude specific treatment pricing
    keywords: ['how much', 'pricing', 'price list', 'cost'],
    weight: 0.85,
  },
  
  service_inquiry: {
    // Specific treatment inquiry: "do you do Botox?", "can i get HIFU?", "botox?"
    // CRITICAL: The "can i get" pattern excludes booking words (slot, appointment, booking)
    // so "can i get a slot" goes to booking_request instead.
    regex: /(?:do\s+(?:you|u)\s+(?:do|have|offer)\s+(.+?)(?:\?|$)|can\s+i\s+get\s+(?:a|an)?\s*(?!slot|appointment|booking)(.+?)(?:\?|$)|is\s+(.+?)\s+available|^(botox|filler|hifu|rejuran|thread|laser|facial|peel|microneedling|picosure)s?\??$)/i,
    keywords: ['do you do', 'can i get', 'is available', 'botox', 'filler', 'hifu', 'rejuran', 'thread', 'laser', 'facial', 'peel'],
    weight: 0.85,
    extract: (match, msg) => {
      // match[1] = do you have CAPTURE, match[2] = can i get CAPTURE, 
      // match[3] = is CAPTURE available, match[4] = standalone treatment
      let treatment = match[1] || match[2] || match[3] || match[4];
      if (treatment) {
        treatment = treatment.trim().toLowerCase().replace(/\?$/, ''); // Remove trailing ?
        // Verify it's a treatment name, not generic words
        const genericWords = ['service', 'treatment', 'procedure', 'consultation', 'booking', 'appointment', 'slot', 'here', 'there'];
        if (!genericWords.some(g => treatment.includes(g))) {
          return { treatment };
        }
      }
      return {};
    }
  },

  service_list: {
    // Handles: "what services do you offer", "what treatment do you offer",
    // "show me your treatments", "what can you do?", "list of services"
    // CRITICAL: "treatment" and "service" are INTERCHANGEABLE — patients use both.
    // Both singular and plural forms must match. "treatment info" also included.
    regex: /(?:what|wat|which)\s+(?:services?|treatments?)\s+(?:do\s+(?:you|u)\s+(?:offer|have)|are\s+(?:available|there|offered)|info)|what\s+(?:do\s+(?:you|u)\s+(?:do|offer|have)|can\s+(?:you|u)\s+do)|list\s+(?:of\s+)?(?:services?|treatments?|procedures)|(?:show|give|tell)\s+me\s+(?:the\s+)?(?:services?|treatments?|menu|list|options)|(?:what|wat)\s+(?:do\s+(?:you|u)\s+)?have[?\s]*$|(?:treatment|service)\s+(?:list|menu|info)/i,
    keywords: ['what services', 'what treatments', 'what treatment', 'treatment info', 'what do you offer', 'what do you have', 'list of services', 'list of treatments', 'wat services', 'show me', 'what can you do', 'treatment list', 'service list'],
    weight: 0.9,
  },
  
  clarification: {
    // Follow-up to vague answers: "Such as?", "Like what?", "What kind?", "Examples?"
    // Must be short (1-3 words) and contain a question
    regex: /^(?:such\s+as|like\s+what|what\s+kind|examples?[?]?|what\s+types?|what\s+else|and[?]?|what[?]|tell\s+me\s+more)[?\s]*$/i,
    keywords: ['such as', 'like what', 'what kind', 'examples'],
    weight: 0.95, // High confidence — these are unambiguous
  },
  
  confirmation_yes: {
    // Short affirmative in conversation context: "Yes", "Yeah", "Sure", "Okay", "Ok"
    // Must be short (1-2 words) to avoid matching sentences containing "yes"
    regex: /^(?:yes|yeah|yup|sure|okay|ok|ok[ay]|yep|yah|alright|definitely|absolutely)[!\.\s]*$/i,
    keywords: ['yes', 'yeah', 'sure', 'okay', 'ok'],
    weight: 0.8, // Needs conversation context to be meaningful
  },
  
  confirmation_no: {
    // Short negative in conversation context
    regex: /^(?:no|nah|nope|not\s+(?:now|really)|maybe\s+(?:later|another\s+time))[!\.\s]*$/i,
    keywords: ['no', 'nah', 'nope'],
    weight: 0.8,
  },
  
  booking_request: {
    // Handles: "can I book?", "I want to make a booking", "can I come tomorrow"
    // Note: "no slots available" conflicts with waitlist_request — waitlist wins (0.95 > 0.9)
    // "i want hifu" — treatment name after "i want" implies booking intent
    // The last alt matches: "i want botox", "i wanna hifu", etc.
    regex: /(?:i\s+(?:want|would\s+like|wanna)\s+(?:to\s+)?(?:book|make|schedule)|can\s+i\s+(?:book|make|schedule|come)|(?:book|schedule|make)\s+(?:an?\s+)?(?:appointment|booking|slot)|(?:i\s+want|looking\s+for)\s+(?:an?\s+)?(?:slot|appointment)|when\s+(?:can|is)\s+i\s+(?:book|come)|next\s+available|earliest\s+(?:slot|appointment)|i\s+(?:want|wanna)\s+(?:to\s+)?(?:botox|filler|hifu|laser|facial|rejuran|thread|peel|microneedling))/i,
    keywords: ['book', 'appointment', 'schedule', 'slot', 'booking', 'i want to come', 'available slots'],
    weight: 0.9,
    extract: (match, msg) => {
      // Try to extract date preference
      const dateMatch = msg.match(/(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|this\s+week|next\s+week)/i);
      // Try to extract treatments mentioned
      const knownTreatments = ['botox', 'filler', 'hifu', 'rejuran', 'thread', 'laser', 'facial', 'peel', 'microneedling', 'picosure'];
      const foundTreatments = knownTreatments.filter(t => msg.toLowerCase().includes(t));
      const result = {};
      if (dateMatch) result.preferred_day = dateMatch[1];
      if (foundTreatments.length > 0) result.treatments = foundTreatments;
      return result;
    }
  },
  
  cancel_request: {
    regex: /(?:cancel|delete|remove)\s+(?:my\s+)?(?:appointment|booking)|i\s+(?:want|need|would\s+like)\s+to\s+cancel|(?:can\s+i|how\s+do\s+i)\s+cancel/i,
    keywords: ['cancel', 'delete booking'],
    weight: 0.95,
  },
  
  reschedule_request: {
    // Handles: "reschedule my appointment", "change my booking", "shift my appt"
    // "appt" is common abbreviation for appointment. "change my slot" also included.
    regex: /(?:reschedule|change|move|shift)\s+(?:my\s+)?(?:appointment|booking|appt|slot)|(?:can\s+i|i\s+want\s+to)\s+(?:change|move)\s+(?:my\s+)?(?:appointment|booking|date|time|slot)|different\s+(?:date|time|day)/i,
    keywords: ['reschedule', 'change appointment', 'change my slot', 'move booking', 'shift my'],
    weight: 0.95,
  },
  
  check_appointment: {
    regex: /(?:when\s+is|what\s+(?:time|day)\s+is|do\s+i\s+have)\s+(?:my\s+)?(?:appointment|booking|next\s+session)|check\s+(?:my\s+)?(?:appointment|booking)|my\s+(?:appointment|booking)\s+(?:details|time|date|when)|i\s+have\s+a\s+booking/i,
    keywords: ['when is my', 'my appointment', 'my booking', 'do i have an appointment'],
    weight: 0.95,
  },
  
  faq_prep: {
    // "what should i do before treatment", "anything to do before botox", "prep needed"
    regex: /(?:what\s+(?:should|do|to)\s+i\s+(?:do|need|have)\s+(?:to\s+)?(?:prepare|do)\s+(?:before|prior\s+to)|preparation\s+(?:before|for)|before\s+(?:the\s+)?(?:treatment|procedure)|prep\s+(?:needed|required)|any\s+(?:preparation|prep|things\s+to\s+do)\s+before|anything\s+to\s+do\s+before)/i,
    keywords: ['prepare', 'before treatment', 'preparation', 'prep needed', 'anything to do before'],
    weight: 0.85,
    extract: (match, msg) => {
      const treatmentMatch = msg.match(/before\s+(?:the\s+)?(\w+(?:\s+\w+){0,3})/i);
      return treatmentMatch ? { treatment: treatmentMatch[1].trim() } : {};
    }
  },
  
  faq_aftercare: {
    regex: /(?:aftercare|after\s+(?:the\s+)?(?:treatment|procedure)|what\s+(?:should|do)\s+i\s+(?:do|avoid)\s+after|care\s+after|post[\s-]?(?:treatment|care|procedure)|recovery|downtime|how\s+long\s+(?:before|until)|when\s+can\s+i\s+(?:wash|exercise|makeup|go\s+out|swim))/i,
    keywords: ['aftercare', 'after treatment', 'post treatment', 'recovery', 'downtime'],
    weight: 0.85,
    extract: (match, msg) => {
      const treatmentMatch = msg.match(/after\s+(?:the\s+)?(\w+(?:\s+\w+){0,3})/i);
      return treatmentMatch ? { treatment: treatmentMatch[1].trim() } : {};
    }
  },
  
  language_switch: {
    regex: /(?:can\s+you\s+(?:speak|talk|reply|respond)\s+(?:in\s+)?(?:chinese|mandarin|中文|华文)|你会说中文吗|请说中文|中文|说中文|can\s+you\s+(?:speak|talk)\s+chinese|do\s+you\s+speak\s+(?:chinese|mandarin|malay|tamil)| Malay|bahasa|tamil)/i,
    keywords: ['chinese', 'mandarin', 'malay', 'tamil', '中文'],
    weight: 0.9,
    extract: (match, msg) => {
      const langMatch = msg.match(/(chinese|mandarin| Malay|bahasa|tamil|中文)/i);
      return langMatch ? { language: langMatch[1] } : {};
    }
  },
  
  human_handoff: {
    // "speak to someone", "talk to a person", "real person please", "i want a human"
    regex: /(?:speak|talk)\s+(?:to\s+(?:a\s+)?)?(?:human|person|staff|doctor|nurse|receptionist|someone)|real\s+(?:person|human)|i\s+want\s+(?:a\s+)?(?:human|person|real\s+person|staff)|transfer\s+(?:me\s+)?to\s+(?:a\s+)?(?:human|staff|person)|can\s+i\s+speak\s+to|call\s+me/i,
    keywords: ['human', 'staff', 'doctor', 'speak to someone', 'talk to someone', 'real person', 'transfer'],
    weight: 0.9,
  },
  
  complaint: {
    regex: /(?:complaint|unhappy|disappointed|terrible|awful|horrible|worst|bad\s+experience|not\s+happy|very\s+(?:angry|upset)|problem\s+with|issue\s+with|poor\s+service)/i,
    keywords: ['complaint', 'unhappy', 'terrible', 'problem'],
    weight: 0.95,
  },
  
  waitlist_request: {
    // "no slots available", "fully booked", "all appointments taken"
    // Higher weight (0.95) than booking_request (0.9) to win when both match
    regex: /(?:waitlist|waiting\s+list|add\s+me\s+(?:to\s+)?(?:the\s+)?wait|no\s+(?:slot|appointment|space|availability)\s+(?:available)?|fully\s+booked|all\s+(?:slot|appointment|appt)s?\s+(?:are\s+)?taken|put\s+me\s+on\s+(?:the\s+)?wait)/i,
    keywords: ['waitlist', 'no slot', 'no slots', 'fully booked', 'waiting list', 'all taken'],
    weight: 0.95,
  },
};

// ─── MULTI-INTENT DETECTION ───────────────────────────────────────

/**
 * Main entry point. Analyzes message and returns all matched intents.
 * Handles multi-intent by splitting on conjunctions.
 */
function matchIntents(message, conversationHistory = [], isFirstContact = true) {
  const normalized = message.toLowerCase().trim();
  
  // Strategy: Check full message first, then split by conjunctions
  let allMatches = [];
  
  // Try full message match (catches intents that span across conjunctions)
  const fullMatches = findIntentsInSegment(normalized, isFirstContact);
  allMatches.push(...fullMatches);
  
  // Split by conjunctions and check each segment
  const segments = normalized.split(CONJUNCTIONS).filter(s => s.length > 3);
  
  if (segments.length > 1) {
    for (const segment of segments) {
      const segmentMatches = findIntentsInSegment(segment.trim());
      // Only add intents not already found
      for (const match of segmentMatches) {
        if (!allMatches.some(m => m.intent === match.intent)) {
          allMatches.push(match);
        }
      }
    }
  }
  
  // Deduplicate and sort by confidence
  allMatches = deduplicateIntents(allMatches);
  allMatches.sort((a, b) => b.confidence - a.confidence);
  
  // Apply conversation context (e.g., if last message was about Botox, "How much is it?" → pricing)
  allMatches = applyContext(allMatches, conversationHistory);
  
  return allMatches;
}

/**
 * Check a single text segment against all intent patterns.
 */
function findIntentsInSegment(segment, isFirstContact = true) {
  const matches = [];
  
  for (const [intentName, pattern] of Object.entries(INTENT_PATTERNS)) {
    // Skip greeting detection on follow-up messages (not first contact)
    if (intentName === 'greeting' && !isFirstContact) continue;
    
    let matched = false;
    let params = {};
    let confidence = 0;
    
    // Check regex match
    if (pattern.regex) {
      const regexMatch = segment.match(pattern.regex);
      if (regexMatch) {
        matched = true;
        confidence = pattern.weight || 0.8;
        
        // Extract parameters if extractor defined
        if (pattern.extract) {
          try {
            params = pattern.extract(regexMatch, segment) || {};
          } catch (e) {
            params = {};
          }
          // If extractor returns empty params for inquiry-type intents,
          // the match was too generic — reject it
          if (Object.keys(params).length === 0 && 
              (intentName === 'service_inquiry' || intentName === 'pricing_specific')) {
            matched = false;
            confidence = 0;
          }
        }
      }
    }
    
    // Fallback: keyword matching (lower confidence)
    // Uses word boundary matching to prevent substring false positives:
    // "hifu" must NOT match greeting keyword "hi" (but "hi" or "hifu " should)
    // Greeting is SKIPPED — regex-only to prevent "Hi there" from matching
    if (!matched && pattern.keywords && intentName !== 'greeting') {
      const keywordMatches = pattern.keywords.filter(kw => {
        const kwLower = kw.toLowerCase();
        // For single-word keywords, require word boundary
        if (!kwLower.includes(' ')) {
          const regex = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          return regex.test(segment);
        }
        // For multi-word keywords, use substring (phrase match)
        return segment.includes(kwLower);
      });
      if (keywordMatches.length > 0) {
        matched = true;
        confidence = (pattern.weight || 0.8) * 0.7; // Lower confidence for keyword-only
      }
    }
    
    // Apply exclusion patterns
    if (matched && pattern.exclude) {
      if (pattern.exclude.test(segment)) {
        matched = false;
      }
    }
    
    if (matched && confidence > 0.5) {
      matches.push({ intent: intentName, confidence, params });
    }
  }
  
  return matches;
}

/**
 * Remove duplicate intents, keeping the highest confidence one.
 */
function deduplicateIntents(matches) {
  const seen = new Map();
  
  for (const match of matches) {
    const existing = seen.get(match.intent);
    if (!existing || match.confidence > existing.confidence) {
      seen.set(match.intent, match);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Apply conversation context to improve intent matching.
 * E.g., if patient asked about Botox 2 messages ago and now says "How much?",
 * infer pricing_specific for Botox.
 */
function applyContext(matches, history) {
  if (matches.length > 0 || history.length === 0) return matches;
  
  // Check last few messages for context
  const lastUserMessages = history
    .filter(h => h.role === 'user')
    .slice(-3);
  
  if (lastUserMessages.length === 0) return matches;
  
  const lastMsg = lastUserMessages[lastUserMessages.length - 1].content || '';
  const lastNormalized = lastMsg.toLowerCase();
  
  // Context: previous message mentioned a treatment, current is vague pricing
  const treatmentInContext = extractTreatmentFromMessage(lastNormalized);
  
  if (treatmentInContext && matches.length === 0) {
    // Patient previously mentioned a treatment, now asks vague question
    const vaguePricing = /^(how\s+much|what.*price|price)/i;
    // This would need the current message, handled in smart-router
  }
  
  return matches;
}

/**
 * Try to extract a treatment name from a message.
 */
function extractTreatmentFromMessage(message) {
  const commonTreatments = [
    'botox', 'filler', 'facial', 'laser', 'hifu', 'thermage',
    'ultherapy', 'thread lift', 'microneedling', 'peel', 'hydrafacial',
    'pdo thread', 'rejuran', 'profhilo', 'bbl', 'ipl',
    'coolsculpting', 'emsculpt', 'thermage flx', 'ultraformer',
    'skin booster', 'dermal filler', 'lip filler', 'nose filler',
    ' jaw reduction', 'face slimming', 'double chin',
  ];
  
  for (const treatment of commonTreatments) {
    if (message.includes(treatment)) return treatment;
  }
  return null;
}

// ─── CHINESE SUPPORT ──────────────────────────────────────────────

const CHINESE_INTENTS = {
  // Order matters: specific intents BEFORE general ones
  // e.g., cancel_request before booking_request, check_appointment before booking_request
  greeting: /^(你好|您好|嗨|哈啰|在吗|有人在吗|你好呀)[!！]?$/,
  goodbye: /^(谢谢|感谢|拜拜|再见|好的谢谢|知道了)[!！]?$/,
  operating_hours: /(?:营业时间|几点开门|几点关门|什么时候营业|开到几点|几点到几点|周末开吗)/,
  location: /(?:地址|在哪里|怎么去|位置|靠近哪里|附近有什么)/,
  // pricing_specific: treatment name + price question (mixed Chinese-English OK)
  pricing_specific: /(?:botox|filler|hifu|laser|facial|thread|rejuran|皮秒|水光针|玻尿酸|肉毒素|热玛吉|[a-z]+).*?(?:多少钱|怎么收费|价格)/i,
  // pricing_general: just asking about price
  pricing_general: /^(?:价格表|价目表|怎么收费|多少钱|贵不贵)$/,
  // cancel_request BEFORE booking_request to avoid "取消预约" matching booking
  cancel_request: /(?:取消预约|我要取消|取消我的|删掉预约|想取消)/,
  // check_appointment BEFORE booking_request
  check_appointment: /(?:我的预约|查询预约|查我的|我的booking|我预约了什么时候|我book了)/,
  // booking_request comes after more specific intents
  booking_request: /(?:我要预约|想预约|可以预约吗|有位置吗|有空位吗)/,
  human_handoff: /(?:人工|真人|客服|工作人员|找医生)/,
  language_switch: /(?:可以说中文吗|中文|华文|会说中文吗)/,
};

/**
 * Check if message is Chinese and match Chinese intents.
 */
function matchChineseIntents(message, isFirstContact = true) {
  const matches = [];
  
  for (const [intent, regex] of Object.entries(CHINESE_INTENTS)) {
    // Skip greeting detection on follow-up messages
    if (intent === 'greeting' && !isFirstContact) continue;
    
    if (regex.test(message)) {
      matches.push({ intent, confidence: 0.9, params: {} });
    }
  }
  
  return matches;
}

// Override main function to include Chinese
const originalMatchIntents = matchIntents;
module.exports.matchIntents = function(message, history, isFirstContact = true) {
  // Detect if message has Chinese characters
  const hasChinese = /[\u4e00-\u9fff]/.test(message);
  
  if (hasChinese) {
    const chineseMatches = matchChineseIntents(message, isFirstContact);
    if (chineseMatches.length > 0) return chineseMatches;
  }
  
  return originalMatchIntents(message, history, isFirstContact);
};

module.exports.extractTreatmentFromMessage = extractTreatmentFromMessage;
module.exports.INTENT_PATTERNS = INTENT_PATTERNS;
