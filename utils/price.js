/**
 * Moon Hands — Price parsing utilities
 *
 * Services may carry a FIXED price ("$350", "350") or a RANGE
 * ("$50-$100", "50 – 100", "$50 to $100"). Booking totals must stay
 * correct for both: fixed prices sum to a single number, ranges sum
 * to a min–max range.
 */

/**
 * Parse a price string into { min, max, isRange } or null if unparseable.
 * "$50-$100" → { min: 50, max: 100, isRange: true }
 * "$350"     → { min: 350, max: 350, isRange: false }
 */
function parsePrice(str) {
  if (str === null || str === undefined) return null;
  const s = String(str).replace(/[, ]/g, '');
  const range = s.match(/\$?(\d+(?:\.\d+)?)\s*[-–—]\s*\$?(\d+(?:\.\d+)?)/i) ||
                s.match(/\$?(\d+(?:\.\d+)?)to\$?(\d+(?:\.\d+)?)/i);
  if (range) {
    const min = parseFloat(range[1]);
    const max = parseFloat(range[2]);
    if (min > 0 && max >= min) return { min, max, isRange: max > min };
  }
  const single = s.match(/\$?(\d+(?:\.\d+)?)/);
  if (single) {
    const v = parseFloat(single[1]);
    if (v >= 0) return { min: v, max: v, isRange: false };
  }
  return null;
}

/**
 * Canonical storage format: "350" or "50-100" (no currency symbol —
 * display layers add the '$' themselves; storing it would render "$$350").
 * Returns null when the input has no usable number.
 */
function normalizePrice(str) {
  const p = parsePrice(str);
  if (!p) return null;
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return p.isRange ? `${fmt(p.min)}-${fmt(p.max)}` : fmt(p.min);
}

/**
 * Sum the prices of matched services.
 * → { min, max, isRange, hasPrice } where hasPrice=false means
 *   none of the services had a parseable price.
 */
function sumServicePrices(services) {
  let min = 0;
  let max = 0;
  let hasPrice = false;
  for (const s of services || []) {
    const p = parsePrice(s?.price);
    if (p) {
      min += p.min;
      max += p.max;
      hasPrice = true;
    }
  }
  return { min, max, isRange: max > min, hasPrice };
}

/**
 * Display string for a total: "$880" or "$130-$380".
 */
function formatPriceTotal(min, max, symbol = '$') {
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return max > min ? `${symbol}${fmt(min)}-${symbol}${fmt(max)}` : `${symbol}${fmt(min)}`;
}

module.exports = { parsePrice, normalizePrice, sumServicePrices, formatPriceTotal };
