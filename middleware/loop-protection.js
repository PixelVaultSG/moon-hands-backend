/**
 * Moon Hands — Infinite Loop & Bot-to-Bot Protection
 * Prevents runaway costs from:
 *   1. Two auto-responders talking to each other (bot↔bot loop)
 *   2. Our bot's own reply triggering another auto-reply
 *   3. Webhook retries processing the same message twice
 *   4. Customer copy-paste spam
 * 
 * How it works:
 *   - Tracks conversation velocity (messages per minute between same pair)
 *   - Detects bot signatures (auto-reply patterns, identical response structures)
 *   - Deduplicates by message ID
 *   - Breaks loops by refusing to respond after threshold
 * 
 * Real-world scenario this prevents:
 *   Customer has "Thank you for your message" auto-reply.
 *   Our bot sends response → their auto-reply fires → our bot responds again → loop.
 *   Without protection: $500+ in 10 minutes. With protection: stopped after 4 exchanges.
 */

// ─── CONFIGURATION ────────────────────────────────────────────────

const LOOP_CONFIG = {
  // Velocity: if >4 exchanges in 60 seconds, likely a bot loop
  velocityThreshold: 4,      // exchanges per minute
  velocityWindowMs: 60000,   // 1 minute
  
  // After detecting loop, how many responses before we stop replying
  maxLoopResponses: 3,       // respond 3 times then go silent
  loopSilenceDurationMs: 30 * 60 * 1000, // 30 min silence after loop detected
  
  // Bot signature detection
  botPatterns: [
    /^thank you for (your message|contacting|reaching out)/i,
    /^auto[- ]?reply/i,
    /^this is an automated response/i,
    /^we have received your (message|email|inquiry)/i,
    /^we will get back to you/i,
    /^(hi|hello).{0,30}i'?m (an? )?virtual assistant/i,
    /^\[auto[- ]?generated\]/i,
    /^\[out of office\]/i,
  ],
  
  // Messages that suggest an echo loop (our response triggered a mirror response)
  echoPatterns: [
    /^\s*our system is temporarily/i,        // Our own kill switch message echoed
    /^\s*i'm having (a moment|trouble)/i,   // Our own error message echoed
  ],
  
  // Deduplication: processed message IDs
  processedMessageIds: new Set(),
  messageIdMaxSize: 10000,   // Prevent memory leak
};

// ─── LOOP DETECTOR ────────────────────────────────────────────────

class LoopDetector {
  constructor() {
    // conversationKey -> { exchanges: [{time, from, text}], loopDetected: false, responsesSinceLoop: 0, silentUntil: 0 }
    // conversationKey = "fromPhone:toPhone"
    this.conversations = new Map();
    
    // Cleanup old conversations every 10 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 600000);
  }

  /**
   * Check if we should process this incoming message.
   * Returns: { proceed, reason, isDuplicate, isLoop }
   */
  checkIncoming(messageId, fromPhone, toPhone, messageText) {
    const now = Date.now();
    const key = `${fromPhone}:${toPhone}`;
    const record = this.getRecord(key);

    // 1. DEDUPLICATION: Check if we've already processed this message ID
    if (messageId && LOOP_CONFIG.processedMessageIds.has(messageId)) {
      return { proceed: false, reason: 'DUPLICATE_MESSAGE_ID', isDuplicate: true, isLoop: false };
    }
    
    // Track this message ID
    if (messageId) {
      LOOP_CONFIG.processedMessageIds.add(messageId);
      // Prevent set from growing indefinitely
      if (LOOP_CONFIG.processedMessageIds.size > LOOP_CONFIG.messageIdMaxSize) {
        const iterator = LOOP_CONFIG.processedMessageIds.values();
        LOOP_CONFIG.processedMessageIds.delete(iterator.next().value);
      }
    }

    // 2. SILENCE PERIOD: If we detected a loop recently, don't respond
    if (record.silentUntil > now) {
      return { 
        proceed: false, 
        reason: 'LOOP_SILENCE_PERIOD', 
        isDuplicate: false, 
        isLoop: true,
        silentUntil: record.silentUntil,
      };
    }

    // 3. BOT SIGNATURE: Check if incoming message looks like an auto-reply
    const botScore = this.detectBotSignature(messageText);
    if (botScore.isBot) {
      console.log(`[LOOP_PROTECTION] Bot signature detected from ${fromPhone}: ${botScore.matchedPattern}`);
      
      // If we've already responded to this conversation and now getting a bot reply,
      // we might be entering a loop
      if (record.exchanges.length > 0) {
        record.loopDetected = true;
      }
    }

    // 4. VELOCITY CHECK: Too many exchanges too fast = loop
    record.exchanges.push({ time: now, from: 'them', text: messageText.substring(0, 100) });
    
    const recentExchanges = record.exchanges.filter(e => e.time > now - LOOP_CONFIG.velocityWindowMs);
    record.exchanges = recentExchanges; // Trim old
    
    if (recentExchanges.length >= LOOP_CONFIG.velocityThreshold) {
      console.warn(`[LOOP_PROTECTION] High velocity detected: ${recentExchanges.length} exchanges/min from ${fromPhone}`);
      record.loopDetected = true;
    }

    // 5. IF LOOP DETECTED: Allow a few more responses then go silent
    if (record.loopDetected) {
      if (record.responsesSinceLoop >= LOOP_CONFIG.maxLoopResponses) {
        // Stop responding — go silent
        record.silentUntil = now + LOOP_CONFIG.loopSilenceDurationMs;
        console.warn(`[LOOP_PROTECTION] LOOP BROKEN: Stopped responding to ${fromPhone} for 30 minutes`);
        return { proceed: false, reason: 'LOOP_BROKEN', isDuplicate: false, isLoop: true };
      }
      
      // Still allow a few responses but warn
      record.responsesSinceLoop++;
      console.log(`[LOOP_PROTECTION] Loop response ${record.responsesSinceLoop}/${LOOP_CONFIG.maxLoopResponses} to ${fromPhone}`);
    }

    return { proceed: true, reason: null, isDuplicate: false, isLoop: false };
  }

  /**
   * Record that we sent an outgoing message (for velocity tracking).
   */
  recordOutgoing(fromPhone, toPhone, responseText) {
    const key = `${toPhone}:${fromPhone}`; // Reverse direction
    const record = this.getRecord(key);
    record.exchanges.push({ 
      time: Date.now(), 
      from: 'us', 
      text: responseText.substring(0, 100) 
    });
  }

  /**
   * Detect if a message looks like an auto-reply/bot message.
   */
  detectBotSignature(text) {
    const normalized = text.toLowerCase().trim();
    
    for (const pattern of LOOP_CONFIG.botPatterns) {
      if (pattern.test(text)) {
        return { isBot: true, confidence: 0.9, matchedPattern: pattern.toString() };
      }
    }
    
    // Heuristic: Very short response + generic language
    if (normalized.length < 30) {
      const genericWords = ['thank', 'received', 'contact', 'soon', 'reply', 'message'];
      const matchCount = genericWords.filter(w => normalized.includes(w)).length;
      if (matchCount >= 2) {
        return { isBot: true, confidence: 0.6, matchedPattern: 'generic_short_response' };
      }
    }
    
    return { isBot: false, confidence: 0 };
  }

  /**
   * Check if a message is an echo of our own response (another bot mirroring us).
   */
  isEchoMessage(text) {
    for (const pattern of LOOP_CONFIG.echoPatterns) {
      if (pattern.test(text)) return true;
    }
    return false;
  }

  getRecord(key) {
    if (!this.conversations.has(key)) {
      this.conversations.set(key, {
        exchanges: [],
        loopDetected: false,
        responsesSinceLoop: 0,
        silentUntil: 0,
      });
    }
    return this.conversations.get(key);
  }

  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, record] of this.conversations) {
      // Clean conversations with no activity in 2 hours
      const lastActivity = record.exchanges.length > 0 
        ? Math.max(...record.exchanges.map(e => e.time))
        : 0;
      
      if (lastActivity > 0 && now - lastActivity > 2 * 60 * 60 * 1000) {
        this.conversations.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[LOOP_PROTECTION] Cleaned up ${cleaned} old conversation records`);
    }
  }

  getStats() {
    return {
      activeConversations: this.conversations.size,
      loopsCurrentlyDetected: Array.from(this.conversations.entries())
        .filter(([_, r]) => r.loopDetected && r.silentUntil > Date.now())
        .map(([key, _]) => key),
      processedMessageIds: LOOP_CONFIG.processedMessageIds.size,
    };
  }

  destroy() {
    clearInterval(this.cleanupInterval);
  }
}

// ─── SINGLETON ────────────────────────────────────────────────────

const loopDetector = new LoopDetector();

module.exports = {
  loopDetector,
  LoopDetector,
  LOOP_CONFIG,
};
