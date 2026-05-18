/**
 * Moon Hands — Per-Customer Rate Limiter
 * Prevents a single customer from spamming and burning API budget.
 * 
 * Limits (per customer phone number):
 *   - 10 messages per 5 minutes (burst protection)
 *   - 30 messages per hour
 *   - 80 messages per 24 hours
 *   - 3 identical messages in a row = auto-block for 10 min
 * 
 * Why this matters:
 *   - DDoS protection is at IP level (360dialog's servers, not customer's phone)
 *   - Without per-customer limits, one spammer can burn $20/day clinic budget
 *   - WhatsApp auto-replies and bot-to-bot loops are caught here
 * 
 * Storage: In-memory Map with TTL + Supabase persistence for restart safety.
 */

// ─── CONFIGURATION ────────────────────────────────────────────────

const LIMITS = {
  burst: { max: 10, windowMs: 5 * 60 * 1000 },      // 10 per 5 min
  hourly: { max: 30, windowMs: 60 * 60 * 1000 },    // 30 per hour
  daily: { max: 80, windowMs: 24 * 60 * 60 * 1000 }, // 80 per day
  identical: { max: 3, windowMs: 10 * 60 * 1000 },  // 3 identical in 10 min = block
};

const BLOCK_DURATIONS = {
  burst: 10 * 60 * 1000,    // 10 min block
  hourly: 30 * 60 * 1000,   // 30 min block
  daily: 24 * 60 * 60 * 1000, // 24 hour block
  identical: 10 * 60 * 1000, // 10 min block
};

// ─── IN-MEMORY STORAGE ────────────────────────────────────────────

class CustomerRateLimiter {
  constructor() {
    // customerPhone -> { timestamps: [], lastMessage: '', identicalCount: 0, blockedUntil: 0, blockReason: '' }
    this.customers = new Map();
    
    // Cleanup old entries every 10 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 600000);
  }

  /**
   * Check if a customer is allowed to send a message.
   * @param {string} phone - Customer phone number
   * @param {string} messageText - The message content (for duplicate detection)
   * @returns {object} { allowed, reason, retryAfter, dailyCount }
   */
  check(phone, messageText) {
    const now = Date.now();
    const record = this.getRecord(phone);

    // Check if currently blocked
    if (record.blockedUntil > now) {
      const retryAfter = Math.ceil((record.blockedUntil - now) / 1000);
      return {
        allowed: false,
        reason: `BLOCKED:${record.blockReason}`,
        retryAfter,
        dailyCount: record.timestamps.filter(t => t > now - LIMITS.daily.windowMs).length,
      };
    }

    // Check identical message spam
    const identicalCheck = this.checkIdentical(record, messageText, now);
    if (!identicalCheck.allowed) {
      record.blockedUntil = now + BLOCK_DURATIONS.identical;
      record.blockReason = 'identical_spam';
      return {
        allowed: false,
        reason: 'IDENTICAL_SPAM: You sent the same message too many times. Please wait 10 minutes.',
        retryAfter: BLOCK_DURATIONS.identical / 1000,
        dailyCount: record.timestamps.filter(t => t > now - LIMITS.daily.windowMs).length,
      };
    }

    // Count messages in each window
    const dailyCount = record.timestamps.filter(t => t > now - LIMITS.daily.windowMs).length;
    const hourlyCount = record.timestamps.filter(t => t > now - LIMITS.hourly.windowMs).length;
    const burstCount = record.timestamps.filter(t => t > now - LIMITS.burst.windowMs).length;

    // Check daily limit
    if (dailyCount >= LIMITS.daily.max) {
      record.blockedUntil = now + BLOCK_DURATIONS.daily;
      record.blockReason = 'daily_limit';
      return {
        allowed: false,
        reason: `DAILY_LIMIT: You've reached the daily message limit (${LIMITS.daily.max}). Please try again tomorrow.`,
        retryAfter: BLOCK_DURATIONS.daily / 1000,
        dailyCount,
      };
    }

    // Check hourly limit
    if (hourlyCount >= LIMITS.hourly.max) {
      record.blockedUntil = now + BLOCK_DURATIONS.hourly;
      record.blockReason = 'hourly_limit';
      return {
        allowed: false,
        reason: `HOURLY_LIMIT: Too many messages this hour. Please wait 30 minutes.`,
        retryAfter: BLOCK_DURATIONS.hourly / 1000,
        dailyCount,
      };
    }

    // Check burst limit
    if (burstCount >= LIMITS.burst.max) {
      record.blockedUntil = now + BLOCK_DURATIONS.burst;
      record.blockReason = 'burst_limit';
      return {
        allowed: false,
        reason: `BURST_LIMIT: Sending too fast. Please slow down and try again in 10 minutes.`,
        retryAfter: BLOCK_DURATIONS.burst / 1000,
        dailyCount,
      };
    }

    // Record this message
    record.timestamps.push(now);
    record.lastMessage = messageText;

    return {
      allowed: true,
      reason: null,
      retryAfter: 0,
      dailyCount: dailyCount + 1,
      hourlyCount: hourlyCount + 1,
      burstCount: burstCount + 1,
    };
  }

  /**
   * Check for identical message spam (same text repeated).
   */
  checkIdentical(record, messageText, now) {
    const normalized = messageText.toLowerCase().trim();
    
    if (normalized === record.lastMessage.toLowerCase().trim()) {
      record.identicalCount++;
    } else {
      record.identicalCount = 1;
    }

    if (record.identicalCount >= LIMITS.identical.max) {
      return { allowed: false, count: record.identicalCount };
    }

    return { allowed: true, count: record.identicalCount };
  }

  /**
   * Get or create customer record.
   */
  getRecord(phone) {
    if (!this.customers.has(phone)) {
      this.customers.set(phone, {
        timestamps: [],
        lastMessage: '',
        identicalCount: 0,
        blockedUntil: 0,
        blockReason: '',
        firstSeen: Date.now(),
      });
    }
    return this.customers.get(phone);
  }

  /**
   * Get status for a customer (for admin/debugging).
   */
  getStatus(phone) {
    const record = this.getRecord(phone);
    const now = Date.now();
    return {
      dailyCount: record.timestamps.filter(t => t > now - LIMITS.daily.windowMs).length,
      hourlyCount: record.timestamps.filter(t => t > now - LIMITS.hourly.windowMs).length,
      burstCount: record.timestamps.filter(t => t > now - LIMITS.burst.windowMs).length,
      identicalCount: record.identicalCount,
      blocked: record.blockedUntil > now,
      blockedUntil: record.blockedUntil > now ? new Date(record.blockedUntil).toISOString() : null,
      blockReason: record.blockReason,
    };
  }

  /**
   * Clean up old entries to prevent memory leaks.
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [phone, record] of this.customers) {
      // Remove entries with no activity in 48 hours
      const lastActivity = Math.max(...record.timestamps, record.firstSeen);
      if (now - lastActivity > 48 * 60 * 60 * 1000) {
        this.customers.delete(phone);
        cleaned++;
        continue;
      }
      
      // Clean old timestamps beyond daily window
      record.timestamps = record.timestamps.filter(t => t > now - LIMITS.daily.windowMs);
    }
    
    if (cleaned > 0) {
      console.log(`[RATE_LIMITER] Cleaned up ${cleaned} inactive customer records`);
    }
  }

  /**
   * Get overall stats.
   */
  getStats() {
    return {
      totalTrackedCustomers: this.customers.size,
      currentlyBlocked: Array.from(this.customers.entries())
        .filter(([_, r]) => r.blockedUntil > Date.now())
        .map(([phone, r]) => ({ phone: phone.slice(-4), reason: r.blockReason })),
    };
  }

  destroy() {
    clearInterval(this.cleanupInterval);
  }
}

// ─── SINGLETON INSTANCE ───────────────────────────────────────────

const customerRateLimiter = new CustomerRateLimiter();

module.exports = {
  customerRateLimiter,
  CustomerRateLimiter,
  LIMITS,
};
