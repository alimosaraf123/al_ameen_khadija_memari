const jwt = require('jsonwebtoken');
const http = require('http');
const pool = require('../db');

const ready = pool.query(`
  CREATE TABLE IF NOT EXISTS admin_audit_logs(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    method VARCHAR(10) NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100);
  ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS location VARCHAR(150);

  CREATE TABLE IF NOT EXISTS office_activity_logs(
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    method VARCHAR(10) NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE office_activity_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100);
  ALTER TABLE office_activity_logs ADD COLUMN IF NOT EXISTS location VARCHAR(150);
  CREATE INDEX IF NOT EXISTS idx_office_activity_logs_created ON office_activity_logs(created_at DESC);
`);

const ipLocationCache = new Map();

const CAMPUS_PUBLIC_IPS = new Set([
  '103.70.209.155',
  ...String(process.env.CAMPUS_PUBLIC_IPS || '')
    .split(',')
    .map((s) => s.trim().replace(/^::ffff:/, ''))
    .filter(Boolean),
]);

function normalizeIp(ip) {
  return String(ip || '').split(',')[0].trim().replace(/^::ffff:/, '');
}

function isLocalIp(ip) {
  const cleanIp = normalizeIp(ip);
  if (!cleanIp) return false;
  return (
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp.includes('localhost') ||
    cleanIp.startsWith('192.168.') ||
    cleanIp.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(cleanIp)
  );
}

function isCampusPublicIp(ip) {
  const cleanIp = normalizeIp(ip);
  return Boolean(cleanIp && CAMPUS_PUBLIC_IPS.has(cleanIp));
}

function formatKnownLocation(ip, existingLocation) {
  const cleanIp = normalizeIp(ip);
  if (!cleanIp) return existingLocation || null;
  if (isLocalIp(cleanIp)) return 'Memari Campus (Local)';
  if (isCampusPublicIp(cleanIp)) return 'Memari Campus, West Bengal';
  return existingLocation || null;
}

function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'] || req.headers['true-client-ip'];
  if (cfIp) return normalizeIp(cfIp);
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const clean = normalizeIp(forwarded);
    if (clean) return clean;
  }
  const raw = req.headers['x-real-ip'] || req.ip || req.socket?.remoteAddress || '127.0.0.1';
  return normalizeIp(raw) || '127.0.0.1';
}

function resolveIpLocation(ip) {
  const cleanIp = normalizeIp(ip);
  if (!cleanIp) {
    return Promise.resolve('Memari Campus (Local)');
  }
  const known = formatKnownLocation(cleanIp, null);
  if (known) {
    return Promise.resolve(known);
  }
  if (ipLocationCache.has(cleanIp)) {
    return Promise.resolve(ipLocationCache.get(cleanIp));
  }
  return new Promise((resolve) => {
    http.get(`http://ip-api.com/json/${cleanIp}?fields=status,city,regionName,country`, { timeout: 2500 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'success') {
            const loc = [json.city, json.regionName || json.country].filter(Boolean).join(', ');
            const resLoc = loc || 'India';
            ipLocationCache.set(cleanIp, resLoc);
            return resolve(resLoc);
          }
        } catch {}
        const fallback = 'West Bengal, India';
        ipLocationCache.set(cleanIp, fallback);
        resolve(fallback);
      });
    }).on('error', () => {
      resolve('West Bengal, India');
    });
  });
}

function governance(req, res, next) {
  let user = null;
  try {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) user = jwt.verify(h.slice(7), process.env.JWT_SECRET);
  } catch {}

  if (user?.role === 'admin' && req.method === 'DELETE') {
    return res.status(403).json({ success: false, message: 'Permanent delete is only available to Super Admin' });
  }

  const clientIp = getClientIp(req);

  if (user?.role === 'office') {
    res.on('finish', () => {
      const fields = [...new Set([...Object.keys(req.query || {}), ...Object.keys(req.body || {})])];
      resolveIpLocation(clientIp).then((loc) => {
        return ready.then(() => pool.query(
          'INSERT INTO office_activity_logs(user_id, method, path, status_code, details, ip_address, location) VALUES($1, $2, $3, $4, $5, $6, $7)',
          [user.userId, req.method, req.originalUrl, res.statusCode, JSON.stringify({ fields, query: req.query || {} }), clientIp, loc]
        ));
      }).catch(() => {});
    });
  }

  if (user && ['admin', 'super_admin'].includes(user.role) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    res.on('finish', () => {
      const body = { ...(req.body || {}) };
      for (const k of ['password', 'current_password', 'new_password', 'mpin']) {
        if (k in body) body[k] = '[REDACTED]';
      }
      resolveIpLocation(clientIp).then((loc) => {
        return ready.then(() => pool.query(
          'INSERT INTO admin_audit_logs(user_id, method, path, status_code, details, ip_address, location) VALUES($1, $2, $3, $4, $5, $6, $7)',
          [user.userId, req.method, req.originalUrl, res.statusCode, body, clientIp, loc]
        ));
      }).catch(() => {});
    });
  }

  next();
}

module.exports = {
  governance,
  auditReady: ready,
  getClientIp,
  resolveIpLocation,
  isLocalIp,
  isCampusPublicIp,
  formatKnownLocation,
};
