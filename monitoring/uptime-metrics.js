/**
 * Moon Hands — Uptime Metrics Tracker
 * 
 * Tracks message processing success/failure rates
 * for the /debug endpoint and Telegram reporting.
 * Lightweight — in-memory with simple ring buffers.
 */

const MAX_EVENTS = 100;

const metrics = {
  totalMessages: 0,
  successfulReplies: 0,
  failedReplies: 0,
  rateLimited: 0,
  loopDetected: 0,
  errors: 0,
  lastMessageAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  recentErrors: [], // Ring buffer of last 10 errors
  hourlyCounts: [], // Messages per hour for trend
};

function recordMessage(success, detail = '') {
  metrics.totalMessages++;
  metrics.lastMessageAt = new Date().toISOString();
  
  if (success) {
    metrics.successfulReplies++;
    metrics.lastSuccessAt = metrics.lastMessageAt;
  } else {
    metrics.failedReplies++;
    metrics.lastFailureAt = metrics.lastMessageAt;
    if (detail) {
      metrics.recentErrors.push({ time: metrics.lastMessageAt, detail: detail.slice(0, 200) });
      if (metrics.recentErrors.length > 10) metrics.recentErrors.shift();
    }
  }
  
  // Track hourly rate
  const hour = new Date().getHours();
  const existing = metrics.hourlyCounts.find(h => h.hour === hour);
  if (existing) existing.count++;
  else metrics.hourlyCounts.push({ hour, count: 1 });
  if (metrics.hourlyCounts.length > 24) metrics.hourlyCounts.shift();
}

function recordRateLimit() { metrics.rateLimited++; }
function recordLoop() { metrics.loopDetected++; }
function recordError(detail) { metrics.errors++; recordMessage(false, detail); }

function getMetrics() {
  const successRate = metrics.totalMessages > 0 
    ? Math.round((metrics.successfulReplies / metrics.totalMessages) * 100) 
    : 100;
  
  return {
    ...metrics,
    successRate: `${successRate}%`,
    uptime_minutes: process.uptime ? Math.floor(process.uptime() / 60) : 0,
  };
}

module.exports = { recordMessage, recordRateLimit, recordLoop, recordError, getMetrics };
