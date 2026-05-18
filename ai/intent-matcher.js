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
    keywords: ['where', 'address', 'location', 'how to get', 'find you', 'parking'],
    weight: 0.9,
  },
  
  pricing_specific: {
    regex: /(?:how\s+much\s+(?:is|for|does)|what\s+(?:is\s+the\s+price|does\s+it\s+cost)|price\s+(?:of|for))\s+(.+?)(?:\?|$|\s+(?:cost|price))/i,
    keywords: ['how much is', 'price of', 'cost of', 'what is the price'],
    weight: 0.95,
    extract: (match) => ({ treatment: match[1]?.trim() })
  },
  
  pricing_general: {
    regex: /(?:how\s+much|what\s+(?:are\s+the\s+prices|is\s+the\s+pricing)|price\s+list|pricing|cost\s+list|do\s+you\s+have\s+a\s+price|are\s+the\s+(?:prices|rates))/i,
    exclude: /(?:how\s+much\s+(?:is|for|does)\s+\w+)/i, // Exclude specific treatment pricing
    keywords: ['how much', 'pricing', 'price list', 'cost'],
    weight: 0.85,
  },
  
  service_inquiry: {
    regex: /(?:do\s+you\s+(?:do|have|offer)|is\s+(?:.+?)\s+available|can\s+i\s+get\s+(?:a|an)?\s*(.+?)|do\s+you\s+do\s+(.+?)|(?:have|offer)\s+(?:.+?))(?:\?|$)/i,
    keywords: ['do you have', 'do you offer', 'is available', 'can i get'],
    weight: 0.85,
    extract: (match, msg) => {
      const treatment = match[1] || match[2];
      return treatment ? { treatment: treatment.trim() } : {};
    }
  },
  
  service_list: {
    regex: /(?:what\s+(?:services|treatments|procedures)\s+(?:do\s+you\s+offer|do\s+you\s+have|are\s+available)|what\s+do\s+you\s+(?:do|offer)|list\s+(?:of\s+)?(?:services|treatments)|(?:show|give)\s+me\s+(?:the\s+)?(?:services|treatments|menu))/i,
    keywords: ['what services', 'what treatments', 'what do you offer', 'list of services'],
    weight: 0.9,
  },
  
  booking_request: {
    regex: /(?:i\s+(?:want|would\s+like|wanna)\s+(?:to\s+)?(?:book|make|schedule)|can\s+i\s+(?:book|make|schedule)|(?:book|schedule|make)\s+(?:an?\s+)?(?:appointment|booking|slot)|(?:i\s+want|looking\s+for)\s+(?:an?\s+)?(?:slot|appointment)|available\s+(?:slot|appointment)|when\s+(?:can|is)\s+i\s+(?:book|come)|next\s+available|earliest\s+(?:slot|appointment))/i,
    keywords: ['book', 'appointment', 'schedule', 'slot', 'available'],
    weight: 0.9,
    extract: (match, msg) => {
      // Try to extract date preference
      const dateMatch = msg.match(/(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|this\s+week|next\s+week)/i);
      return dateMatch ? { preferred_day: dateMatch[1] } : {};
    }
  },
  
  cancel_request: {
    regex: /(?:cancel|delete|remove)\s+(?:my\s+)?(?:appointment|booking)|i\s+(?:want|need|would\s+like)\s+to\s+cancel|(?:can\s+i|how\s+do\s+i)\s+cancel/i,
    keywords: ['cancel', 'delete booking'],
    weight: 0.95,
  },
  
  reschedule_request: {
    regex: /(?:reschedule|change|move|shift)\s+(?:my\s+)?(?:appointment|booking)|(?:can\s+i|i\s+want\s+to)\s+(?:change|move)\s+(?:my\s+)?(?:appointment|date|time)|different\s+(?:date|time|day)/i,
    keywords: ['reschedule', 'change appointment', 'move booking'],
    weight: 0.95,
  },
  
  check_appointment: {
    regex: /(?:when\s+is|what\s+(?:time|day)\s+is|do\s+i\s+have)\s+(?:my\s+)?(?:appointment|booking|next\s+session)|check\s+(?:my\s+)?(?:appointment|booking)|my\s+(?:appointment|booking)\s+(?:details|time|date|when)|i\s+have\s+a\s+booking/i,
    keywords: ['when is my', 'my appointment', 'my booking', 'do i have an appointment'],
    weight: 0.95,
  },
  
  faq_prep: {
    regex: /(?:what\s+(?:should|do)\s+i\s+(?:do|need)\s+(?:to\s+)?(?:prepare|do)\s+(?:before|prior\s+to)|preparation\s+(?:before|for)|before\s+(?:the\s+)?(?:treatment|procedure)|prep\s+(?:needed|required)|any\s+(?:preparation|prep|things\s+to\s+do)\s+before)/i,
    keywords: ['prepare', 'before treatment', 'preparation', 'prep needed'],
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
    regex: /(?:speak|talk)\s+(?:to\s+a\s+)?(?:human|person|staff|doctor|nurse|receptionist|someone|real\s+person)|i\s+want\s+(?:a\s+)?human|transfer\s+(?:me\s+)?to\s+(?:a\s+)?(?:human|staff|person)|can\s+i\s+speak\s+to|call\s+me/i,
    keywords: ['human', 'staff', 'doctor', 'speak to someone', 'transfer'],
    weight: 0.9,
  },
  
  complaint: {
    regex: /(?:complaint|unhappy|disappointed|terrible|awful|horrible|worst|bad\s+experience|not\s+happy|very\s+(?:angry|upset)|problem\s+with|issue\s+with|poor\s+service)/i,
    keywords: ['complaint', 'unhappy', 'terrible', 'problem'],
    weight: 0.95,
  },
  
  waitlist_request: {
    regex: /(?:waitlist|waiting\s+list|add\s+me\s+(?:to\s+)?(?:the\s+)?wait|no\s+(?:slot|appointment|space|availability)\s+(?:available)?|fully\s+booked|all\s+(?:slot|appointment)s?\s+(?:are\s+)?taken|put\s+me\s+on\s+(?:the\s+)?wait)/i,
    keywords: ['waitlist', 'no slot', 'fully booked', 'waiting list'],
    weight: 0.9,
  },
};

// ─── MULTI-INTENT DETECTION ───────────────────────────────────────

/**
 * Main entry point. Analyzes message and returns all matched intents.
 * Handles multi-intent by splitting on conjunctions.
 */
function matchIntents(message, conversationHistory = []) {
  const normalized = message.toLowerCase().trim();
  
  // Strategy: Check full message first, then split by conjunctions
  let allMatches = [];
  
  // Try full message match (catches intents that span across conjunctions)
  const fullMatches = findIntentsInSegment(normalized);
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
function findIntentsInSegment(segment) {
  const matches = [];
  
  for (const [intentName, pattern] of Object.entries(INTENT_PATTERNS)) {
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
        }
      }
    }
    
    // Fallback: keyword matching (lower confidence)
    if (!matched && pattern.keywords) {
      const keywordMatches = pattern.keywords.filter(kw => segment.includes(kw.toLowerCase()));
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
  greeting: /^(你好|您好|嗨|哈啰|在吗|有人在吗|你好呀)[!！]?$/,
  goodbye: /^(谢谢|感谢|拜拜|再见|好的谢谢|知道了)[!！]?$/,
  operating_hours: /(?:营业时间|几点开门|几点关门|什么时候营业|营业时间|开到几点|几点到几点|周末开吗)/,
  location: /(?:地址|在哪里|怎么去|位置| clinic 在哪里|靠近哪里|附近有什么)/,
  pricing_specific: /(?:.*多少钱|.*怎么收费|.*价格是多少|.*的价钱)/,
  pricing_general: /(?:价格表|价目表|怎么收费|多少钱|贵不贵)/,
  booking_request: /(?:预约|我要预约|想预约|可以预约吗|有位置吗|有空位吗)/,
  cancel_request: /(?:取消预约|取消|我要取消|删掉预约)/,
  check_appointment: /(?:我的预约|我的booking|我预约了|我的时间)/,
  human_handoff: /(?:人工|真人|客服|工作人员|找医生)/,
  language_switch: /(?:可以说中文吗|中文|华文|会说中文吗)/,
};

/**
 * Check if message is Chinese and match Chinese intents.
 */
function matchChineseIntents(message) {
  const matches = [];
  
  for (const [intent, regex] of Object.entries(CHINESE_INTENTS)) {
    if (regex.test(message)) {
      matches.push({ intent, confidence: 0.9, params: {} });
    }
  }
  
  return matches;
}

// Override main function to include Chinese
const originalMatchIntents = matchIntents;
module.exports.matchIntents = function(message, history) {
  // Detect if message has Chinese characters
  const hasChinese = /[\u4e00-\u9fff]/.test(message);
  
  if (hasChinese) {
    const chineseMatches = matchChineseIntents(message);
    if (chineseMatches.length > 0) return chineseMatches;
  }
  
  return originalMatchIntents(message, history);
};

module.exports.extractTreatmentFromMessage = extractTreatmentFromMessage;
module.exports.INTENT_PATTERNS = INTENT_PATTERNS;
