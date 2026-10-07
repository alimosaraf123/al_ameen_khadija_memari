const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function loginRateLimit(req, res, next) {
  const now = Date.now();
  const key = `${clientKey(req)}:${req.path}`;
  const current = attempts.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    attempts.set(key, { startedAt: now, count: 1 });
    return next();
  }
  if (current.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - current.startedAt)) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ success: false, message: 'Too many login attempts. Try again later.' });
  }
  current.count += 1;
  next();
}

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, value] of attempts) if (value.startedAt < cutoff) attempts.delete(key);
}, WINDOW_MS).unref();

module.exports = { loginRateLimit };
