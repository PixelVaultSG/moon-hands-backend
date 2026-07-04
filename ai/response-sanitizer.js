/**
 * Response Sanitizer — Post-processor for ALL AI responses
 * 
 * Problem: OpenAI (gpt-4o-mini) consistently ignores negative constraints
 * in the system prompt ("NEVER say Hello", "DON'T say Welcome"). 
 * 
 * Solution: Scan every response AFTER generation. Replace forbidden phrases
 * with context-appropriate alternatives. This is the ONLY reliable method.
 * 
 * This runs on:
 *   - OpenAI expert system responses
 *   - Bot engine responses  
 *   - Smart router fallback responses
 * 
 * Does NOT run on:
 *   - Hardcoded handlers (already clean)
 */

// ─── FORBIDDEN PHRASES MAP ───────────────────────────────────────
// Each entry: [regex to detect, replacement function (context) => string]
// Processed in order — longer phrases first to avoid partial matches

const FORBIDDEN_PATTERNS = [
  // Greeting phrases (most common problem)
  {
    patterns: [
      /hello!\s+welcome\s+(?:back\s+)?to\s+(?:our\s+)?(?:clinic|pixel vault|the clinic)/gi,
      /hello!\s+welcome\s+(?:back\s+)?!*/gi,
      /hey there!\s+welcome\s+(?:back\s+)?/gi,
      /welcome\s+(?:back\s+)?to\s+(?:our\s+)?(?:clinic|pixel vault|the clinic)/gi,
      /hi!\s+welcome\s+(?:back\s+)?/gi,
    ],
    replacement: () => '',  // Remove entirely — greeting already done
  },
  // Standalone greetings
  {
    patterns: [
      /^hello!\s*/gi,
      /^hi!\s*/gi,
      /^hey there!\s*/gi,
      /^hello there!\s*/gi,
    ],
    replacement: () => '',
  },
  // "I'd be happy to help" variations
  {
    patterns: [
      /i['']?d\s+be\s+happy\s+to\s+help\s*(?:you)?!?\.?\s*/gi,
      /i['']?d\s+be\s+happy\s+to\s+assist\s*(?:you)?!?\.?\s*/gi,
      /i['']?d\s+be\s+happy\s+to\s+help\s+you\s+book\s+an\s+appointment\s*(?:at\s+our\s+clinic)?!?\.?\s*/gi,
      /i\s+can\s+help\s+you\s+with\s+booking\s+an\s+appointment\s*(?:at\s+our\s+clinic)?!?\.?\s*/gi,
    ],
    replacement: (ctx) => {
      if (ctx.intent === 'booking') return '';
      if (ctx.intent === 'service_list') return '';
      return '';
    },
  },
  // "How can I assist you today"
  {
    patterns: [
      /how\s+can\s+i\s+assist\s+(?:you\s+)?today\??/gi,
      /how\s+may\s+i\s+help\s+(?:you\s+)?today\??/gi,
      /how\s+can\s+i\s+help\s+(?:you\s+)?today\??/gi,
    ],
    replacement: () => '',
  },
  // "Let me connect you with our team"
  {
    patterns: [
      /let\s+me\s+connect\s+you\s+with\s+(?:our\s+)?(?:team|staff)/gi,
      /i['']?ll\s+connect\s+you\s+with\s+(?:our\s+)?(?:team|staff)/gi,
      /let\s+me\s+get\s+(?:our\s+)?(?:team|someone)\s+to\s+help\s+(?:you)/gi,
    ],
    replacement: (ctx) => {
      if (ctx.intent === 'booking') return 'Let me help you with that.';
      if (ctx.intent === 'service_list') return 'Here are the details:';
      return '';
    },
  },
  // Bullet-pointed lists (FAQ style)
  {
    patterns: [
      /(?:^|\n)\s*•\s+preferred\s+date/gi,
      /(?:^|\n)\s*•\s+preferred\s+time/gi,
      /(?:^|\n)\s*•\s+treatment\s+you['']?re/gi,
      /(?:^|\n)\s*•\s+date/gi,
      /(?:^|\n)\s*•\s+time/gi,
    ],
    replacement: () => '',
  },
  // "Would you like me to arrange a consultation" — evasive
  {
    patterns: [
      /would\s+you\s+like\s+me\s+to\s+arrange\s+a\s+consultation[^\n]*/gi,
      /would\s+you\s+like\s+to\s+schedule\s+a\s+consultation[^\n]*/gi,
    ],
    replacement: (ctx) => {
      if (ctx.intent === 'service_list' && ctx.services) {
        const list = ctx.services.map(s => `${s.name} (${s.price})`).join(', ');
        return `We offer: ${list}.`;
      }
      return '';
    },
  },
  // "We offer a range of aesthetic treatments" — vague
  {
    patterns: [
      /we\s+offer\s+a\s+range\s+of\s+(?:aesthetic\s+)?treatments[^.]*\.\s*/gi,
    ],
    replacement: (ctx) => {
      if (ctx.intent === 'service_list' && ctx.services) {
        const list = ctx.services.map(s => `${s.name} (${s.price})`).join(', ');
        return `We offer: ${list}. `;
      }
      return '';
    },
  },
  // Multiple newlines (excessive spacing)
  {
    patterns: [
      /\n{3,}/g,
    ],
    replacement: () => '\n\n',
  },
];

// ─── INTENT DETECTION FOR CONTEXT ────────────────────────────────

function detectIntent(text) {
  const lower = text.toLowerCase();
  if (lower.includes('book') || lower.includes('appointment') || lower.includes('schedule')) return 'booking';
  if (lower.includes('botox') || lower.includes('filler') || lower.includes('hifu') || lower.includes('treatment') || lower.includes('service') || lower.includes('offer')) return 'service_list';
  if (lower.includes('price') || lower.includes('cost') || lower.includes('how much')) return 'pricing';
  if (lower.includes('hour') || lower.includes('open') || lower.includes('close')) return 'hours';
  return 'general';
}

// ─── MAIN SANITIZE FUNCTION ──────────────────────────────────────

function sanitizeResponse(text, context = {}) {
  if (!text || typeof text !== 'string') return text;
  
  const intent = context.intent || detectIntent(text);
  const ctx = { ...context, intent };
  
  let cleaned = text;
  let changes = [];
  
  for (const rule of FORBIDDEN_PATTERNS) {
    for (const pattern of rule.patterns) {
      const matches = cleaned.match(pattern);
      if (matches) {
        for (const match of matches) {
          const replacement = rule.replacement(ctx);
          changes.push({ found: match.trim(), replaced: replacement });
        }
        cleaned = cleaned.replace(pattern, rule.replacement(ctx));
      }
    }
  }
  
  // Clean up: remove leading/trailing whitespace and empty lines
  cleaned = cleaned.replace(/^\s*[,.!\-–—]+\s*/g, '');  // Leading punctuation
  cleaned = cleaned.replace(/\s+/g, ' ').trim();           // Collapse multiple spaces
  cleaned = cleaned.replace(/^\s*[,.!\-–—]+\s*/g, '');  // Re-check after collapse
  
  // If the entire response was sanitized away, provide a safe fallback
  if (!cleaned || cleaned.length < 10) {
    cleaned = getSafeFallback(ctx);
  }
  
  if (changes.length > 0 && process.env.DEBUG_SANITIZER) {
    console.log(`[SANITIZER] ${changes.length} changes:`);
    changes.forEach(c => console.log(`  "${c.found}" → "${c.replaced}"`));
  }
  
  return cleaned;
}

// ─── SAFE FALLBACKS ──────────────────────────────────────────────

function getSafeFallback(ctx) {
  const { intent, services } = ctx;
  
  switch (intent) {
    case 'booking':
      return 'Sure! What date works for you?';
    case 'service_list':
      if (services && services.length > 0) {
        const list = services.slice(0, 5).map(s => s.name).join(', ');
        return `We offer: ${list}${services.length > 5 ? ' and more' : ''}. Which one interests you?`;
      }
      return 'We offer a variety of treatments. Which type are you looking for?';
    case 'pricing':
      return 'Let me check our pricing for you.';
    case 'hours':
      return 'Let me check our hours for you.';
    default:
      return 'Got it! How can I help you today?';
  }
}

// ─── MIDDLEWARE WRAPPER ──────────────────────────────────────────
// Use this to wrap any function that returns AI text

function withSanitizer(handler, contextProvider) {
  return async (...args) => {
    const result = await handler(...args);
    if (result && result.text) {
      const ctx = contextProvider ? contextProvider(...args) : {};
      result.text = sanitizeResponse(result.text, ctx);
      result._sanitized = true;
    }
    return result;
  };
}

module.exports = {
  sanitizeResponse,
  withSanitizer,
  detectIntent,
  FORBIDDEN_PATTERNS,
};