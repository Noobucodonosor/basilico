/**
 * Lightweight zero-dependency sliding-window rate limiter per client IP.
 * ADR-0017 / TASK-SEC-03 & TASK-SEC-04
 */

const MAX_TRACKED_IPS = 5000;

function extractClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function createRateLimiter({
  windowMs = 60_000,
  maxRequests = 20,
  message = 'Troppe richieste. Riprova tra poco.',
  skipInTest = true,
  maxTrackedIps = MAX_TRACKED_IPS
} = {}) {
  const hits = new Map();

  return function rateLimitMiddleware(req, res, next) {
    if (skipInTest && (process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT))) {
      return next();
    }

    const now = Date.now();
    const key = extractClientIp(req);
    const cutoff = now - windowMs;
    const timestamps = (hits.get(key) || []).filter((ts) => ts > cutoff);

    if (timestamps.length >= maxRequests) {
      const oldestInWindow = timestamps[0] || now;
      const retryAfterSec = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'Too Many Requests',
        message,
        retryAfterSeconds: retryAfterSec
      });
    }

    timestamps.push(now);
    // Refresh insertion order so active keys are not evicted ahead of stale ones
    hits.delete(key);
    hits.set(key, timestamps);

    // Opportunistic cleanup + bounded FIFO cap to protect instance memory
    if (hits.size > maxTrackedIps) {
      for (const [k, arr] of hits.entries()) {
        if (arr.every((ts) => ts <= cutoff)) {
          hits.delete(k);
        }
      }
      while (hits.size > maxTrackedIps) {
        const oldestKey = hits.keys().next().value;
        if (oldestKey === undefined) break;
        hits.delete(oldestKey);
      }
    }

    return next();
  };
}
