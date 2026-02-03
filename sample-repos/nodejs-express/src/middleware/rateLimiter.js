/**
 * Rate limiting middleware
 */

const rateLimit = new Map();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 100;

const rateLimiter = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, { count: 1, startTime: now });
    return next();
  }

  const record = rateLimit.get(ip);

  // Reset window if expired
  if (now - record.startTime > WINDOW_MS) {
    rateLimit.set(ip, { count: 1, startTime: now });
    return next();
  }

  record.count++;

  if (record.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((record.startTime + WINDOW_MS - now) / 1000);

    res.set("Retry-After", retryAfter);
    return res.status(429).json({
      error: "Too many requests",
      retryAfter,
    });
  }

  next();
};

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimit.entries()) {
    if (now - record.startTime > WINDOW_MS) {
      rateLimit.delete(ip);
    }
  }
}, 60000); // Every minute

module.exports = { rateLimiter };
