/**
 * Security Middleware: Rate Limiting & Brute-Force Lockout Protection
 * Blocks an IP or Account for 15 minutes after 5 consecutive failed login attempts.
 */

const failedAttempts = new Map();
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5; // 5 failed attempts allowed

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const list = String(forwarded).split(',');
    if (list[0]) return list[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Middleware executed BEFORE /login or /mpin-login
 * Blocks requests immediately if this IP or account is currently in a 15-minute lockout.
 */
function checkLoginLockout(req, res, next) {
  const now = Date.now();
  const ip = getClientIp(req);
  const loginId = String(req.body?.login_id || '').trim().toLowerCase();

  // 1. For superadmin, allow password verification through so valid superadmin credentials
  // can log in and immediately clear the IP lockout.
  if (loginId === 'superadmin') {
    return next();
  }

  // 2. Check IP-level lockout
  const ipRec = failedAttempts.get(`ip:${ip}`);
  if (ipRec && ipRec.lockedUntil && ipRec.lockedUntil > now) {
    const remainingMin = Math.max(1, Math.ceil((ipRec.lockedUntil - now) / 60000));
    const remainingSec = Math.max(1, Math.ceil((ipRec.lockedUntil - now) / 1000));
    res.set('Retry-After', String(remainingSec));
    return res.status(429).json({
      success: false,
      blocked: true,
      remaining_minutes: remainingMin,
      message: `একই IP থেকে ৫ বার ভুল পাসওয়ার্ড দেওয়ার কারণে এই IPটি ১৫ মিনিটের জন্য ব্লক করা হয়েছে। অনুগ্রহ করে ${remainingMin} মিনিট পর আবার চেষ্টা করুন। (Blocked for 15 minutes due to 5 failed attempts)`
    });
  }

  // 3. Check Account-level lockout
  if (loginId) {
    const accRec = failedAttempts.get(`acc:${loginId}`);
    if (accRec && accRec.lockedUntil && accRec.lockedUntil > now) {
      const remainingMin = Math.max(1, Math.ceil((accRec.lockedUntil - now) / 60000));
      const remainingSec = Math.max(1, Math.ceil((accRec.lockedUntil - now) / 1000));
      res.set('Retry-After', String(remainingSec));
      return res.status(429).json({
        success: false,
        blocked: true,
        remaining_minutes: remainingMin,
        message: `এই অ্যাকাউন্টে ৫ বার ভুল পাসওয়ার্ড দেওয়ার কারণে এটি ১৫ মিনিটের জন্য সাময়িকভাবে লক করা হয়েছে। অনুগ্রহ করে ${remainingMin} মিনিট পর চেষ্টা করুন।`
      });
    }
  }

  next();
}

/**
 * Called when a login or mPIN verification fails
 */
function recordFailedLogin(req, loginId) {
  const now = Date.now();
  const ip = getClientIp(req);
  const cleanId = String(loginId || '').trim().toLowerCase();

  // 1. Update IP tracking
  const ipKey = `ip:${ip}`;
  let ipRec = failedAttempts.get(ipKey);
  if (!ipRec || (ipRec.lockedUntil && ipRec.lockedUntil <= now) || (now - ipRec.firstAttemptAt > WINDOW_MS)) {
    ipRec = { count: 1, firstAttemptAt: now, lockedUntil: null };
  } else {
    ipRec.count += 1;
  }
  if (ipRec.count >= MAX_ATTEMPTS) {
    ipRec.lockedUntil = now + WINDOW_MS;
  }
  failedAttempts.set(ipKey, ipRec);

  // 2. Update Account tracking
  let accRec = null;
  if (cleanId) {
    const accKey = `acc:${cleanId}`;
    accRec = failedAttempts.get(accKey);
    if (!accRec || (accRec.lockedUntil && accRec.lockedUntil <= now) || (now - accRec.firstAttemptAt > WINDOW_MS)) {
      accRec = { count: 1, firstAttemptAt: now, lockedUntil: null };
    } else {
      accRec.count += 1;
    }
    if (accRec.count >= MAX_ATTEMPTS) {
      accRec.lockedUntil = now + WINDOW_MS;
    }
    failedAttempts.set(accKey, accRec);
  }

  const effectiveCount = Math.max(ipRec.count, accRec ? accRec.count : 0);
  const isBlocked = ipRec.lockedUntil !== null || (accRec && accRec.lockedUntil !== null);
  const remaining = Math.max(0, MAX_ATTEMPTS - effectiveCount);

  return {
    isBlocked,
    attempts: effectiveCount,
    remainingAttempts: remaining,
    remainingMinutes: 15
  };
}

/**
 * Called when a login or mPIN verification succeeds
 * Clears failed attempts for this IP and account
 */
function clearFailedLogin(req, loginId) {
  const ip = getClientIp(req);
  failedAttempts.delete(`ip:${ip}`);
  if (loginId) {
    failedAttempts.delete(`acc:${String(loginId).trim().toLowerCase()}`);
  }
}

// Clean up expired lockout entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of failedAttempts) {
    if (value.lockedUntil && value.lockedUntil > now) continue;
    if (now - value.firstAttemptAt > WINDOW_MS) {
      failedAttempts.delete(key);
    }
  }
}, WINDOW_MS).unref();

function resetAllLockouts() {
  failedAttempts.clear();
}

module.exports = {
  loginRateLimit: checkLoginLockout,
  checkLoginLockout,
  recordFailedLogin,
  clearFailedLogin,
  resetAllLockouts,
  getClientIp
};
