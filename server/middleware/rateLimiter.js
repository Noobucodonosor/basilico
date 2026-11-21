/**
 * Lightweight zero-dependency sliding-window rate limiter per client IP.
 * ADR-0017 / TASK-SEC-03
 */

function extractClientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function createRateLimiter({
  windowMs = 60_000,
  maxRequests = 20,
  message = 'Troppe richieste. Riprova tra poco.',
  skipInTest = true
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
    hits.set(key, timestamps);

    // Opportunistic cleanup to keep memory bounded
    if (hits.size > 1000) {
      for (const [k, arr] of hits.entries()) {
        if (arr.every((ts) => ts <= cutoff)) {
          hits.delete(k);
        }
      }
    }

    return next();
  };
}
