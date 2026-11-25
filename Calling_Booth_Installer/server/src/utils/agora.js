const { RtcTokenBuilder, RtcRole } = require('agora-token');
const pool = require('../db');

let cachedConfig = null;
let lastCacheTime = 0;

async function getAgoraConfig() {
  const now = Date.now();
  if (cachedConfig && now - lastCacheTime < 60000) {
    return cachedConfig;
  }

  let appId = process.env.AGORA_APP_ID || '';
  let appCertificate = process.env.AGORA_APP_CERTIFICATE || '';

  try {
    const r = await pool.query(`
      SELECT setting_key, setting_value FROM app_settings 
      WHERE setting_key IN ('agora_app_id', 'agora_app_certificate', 'agora_calling_enabled')
    `);
    r.rows.forEach(row => {
      if (row.setting_key === 'agora_app_id' && row.setting_value) appId = row.setting_value.trim();
      if (row.setting_key === 'agora_app_certificate' && row.setting_value) appCertificate = row.setting_value.trim();
    });
  } catch (err) {
    console.error('Failed to query agora settings from db:', err.message);
  }

  cachedConfig = {
    appId,
    appCertificate,
    enabled: Boolean(appId),
  };
  lastCacheTime = now;
  return cachedConfig;
}

function generateRtcToken({ appId, appCertificate, channelName, uid, role = RtcRole.PUBLISHER, expireSeconds = 3600 }) {
  if (!appId) {
    throw new Error('Agora App ID is not configured');
  }
  if (!appCertificate) {
    // If no certificate configured (Testing Mode on Agora Console), token is not strictly required or can be null
    return '';
  }
  const numericUid = Number(uid) || 0;
  const privilegeExpireTime = Math.floor(Date.now() / 1000) + expireSeconds;
  return RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    numericUid,
    role,
    expireSeconds,
    privilegeExpireTime
  );
}

module.exports = {
  getAgoraConfig,
  generateRtcToken,
  RtcRole,
};

