const jwt = require('jsonwebtoken');
const http = require('http');
const https = require('https');
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

function reverseGeocodeCoords(lat, lon) {
  return new Promise((resolve) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=14`;
    const req = https.get(url, { headers: { 'User-Agent': 'AlAmeenMissionMemari/1.0' }, timeout: 3500 }, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          const addr = json.address || {};
          const place = addr.town || addr.city || addr.suburb || addr.village || addr.county || '';
          const dist = addr.state_district || addr.county || '';
          const state = addr.state || 'West Bengal';
          const parts = [place, dist !== place ? dist : '', state].filter(Boolean);
          if (parts.length) {
            return resolve(`${parts.join(', ')} (GPS)`);
          }
        } catch {}
        resolve(`GPS: ${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`);
      });
    });
    req.on('error', () => resolve(`GPS: ${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`));
    req.on('timeout', () => { req.abort(); resolve(`GPS: ${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`); });
  });
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
    const cached = ipLocationCache.get(cleanIp);
    return Promise.resolve(typeof cached === 'string' ? cached : cached.location);
  }
  return new Promise((resolve) => {
    http.get(`http://ip-api.com/json/${cleanIp}?fields=status,city,district,regionName,country,zip,lat,lon,isp`, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'success') {
            const place = json.district || json.city || '';
            const region = json.regionName || json.country || 'West Bengal';
            const zip = json.zip ? `PIN: ${json.zip}` : '';
            const loc = [place, region, zip].filter(Boolean).join(', ') || 'India';
            const result = {
              location: loc,
              latitude: json.lat || null,
              longitude: json.lon || null,
              isp: json.isp || null,
              source: 'ip'
            };
            ipLocationCache.set(cleanIp, result);
            return resolve(loc);
          }
        } catch {}
        const fallback = 'West Bengal, India';
        ipLocationCache.set(cleanIp, { location: fallback, source: 'ip' });
        resolve(fallback);
      });
    }).on('error', () => {
      resolve('West Bengal, India');
    });
  });
}

async function resolveLocation(req, fallbackIp = null) {
  const clientIp = req ? getClientIp(req) : normalizeIp(fallbackIp);

  // 1. Check if client sent precise GPS location header or body
  const clientLoc = (req?.headers ? req.headers['x-client-location'] : null) || req?.body?.precise_location;
  const clientLat = (req?.headers ? req.headers['x-client-lat'] : null) || req?.body?.latitude;
  const clientLon = (req?.headers ? req.headers['x-client-lon'] : null) || req?.body?.longitude;
  const clientAcc = (req?.headers ? req.headers['x-client-accuracy'] : null) || req?.body?.accuracy;

  if (clientLoc && String(clientLoc).trim()) {
    const lat = clientLat ? parseFloat(clientLat) : null;
    const lon = clientLon ? parseFloat(clientLon) : null;
    return {
      location: String(clientLoc).trim(),
      latitude: lat,
      longitude: lon,
      accuracy: clientAcc ? parseFloat(clientAcc) : null,
      maps_url: lat && lon ? `https://www.google.com/maps?q=${lat},${lon}` : null,
      source: 'gps'
    };
  }

  if (clientLat && clientLon && !isNaN(parseFloat(clientLat)) && !isNaN(parseFloat(clientLon))) {
    const lat = parseFloat(clientLat);
    const lon = parseFloat(clientLon);
    const resolvedName = await reverseGeocodeCoords(lat, lon);
    return {
      location: resolvedName,
      latitude: lat,
      longitude: lon,
      accuracy: clientAcc ? parseFloat(clientAcc) : null,
      maps_url: `https://www.google.com/maps?q=${lat},${lon}`,
      source: 'gps'
    };
  }

  // 2. Known local or campus IP
  const known = formatKnownLocation(clientIp, null);
  if (known) {
    return {
      location: known,
      latitude: 23.1843,
      longitude: 88.1122,
      accuracy: 25,
      maps_url: 'https://www.google.com/maps?q=23.1843,88.1122',
      source: 'campus'
    };
  }

  // 3. Fallback to IP geolocation
  await resolveIpLocation(clientIp);
  const cached = ipLocationCache.get(clientIp);
  const locStr = cached?.location || 'West Bengal, India';
  const lat = cached?.latitude || null;
  const lon = cached?.longitude || null;

  return {
    location: locStr,
    latitude: lat,
    longitude: lon,
    accuracy: null,
    maps_url: lat && lon ? `https://www.google.com/maps?q=${lat},${lon}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locStr)}`,
    source: 'ip'
  };
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
      resolveLocation(req, clientIp).then((locObj) => {
        const details = { fields, query: req.query || {} };
        if (locObj.latitude && locObj.longitude) {
          details.latitude = locObj.latitude;
          details.longitude = locObj.longitude;
          details.accuracy = locObj.accuracy;
          details.maps_url = locObj.maps_url;
          details.location_source = locObj.source;
        }
        return ready.then(() => pool.query(
          'INSERT INTO office_activity_logs(user_id, method, path, status_code, details, ip_address, location) VALUES($1, $2, $3, $4, $5, $6, $7)',
          [user.userId, req.method, req.originalUrl, res.statusCode, JSON.stringify(details), clientIp, locObj.location]
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
      resolveLocation(req, clientIp).then((locObj) => {
        if (locObj.latitude && locObj.longitude) {
          body.latitude = locObj.latitude;
          body.longitude = locObj.longitude;
          body.accuracy = locObj.accuracy;
          body.maps_url = locObj.maps_url;
          body.location_source = locObj.source;
        }
        return ready.then(() => pool.query(
          'INSERT INTO admin_audit_logs(user_id, method, path, status_code, details, ip_address, location) VALUES($1, $2, $3, $4, $5, $6, $7)',
          [user.userId, req.method, req.originalUrl, res.statusCode, body, clientIp, locObj.location]
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
  resolveLocation,
  isLocalIp,
  isCampusPublicIp,
  formatKnownLocation,
};
