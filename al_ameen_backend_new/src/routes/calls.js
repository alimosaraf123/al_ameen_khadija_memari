const express = require('express');
const pool = require('../db');
const { auth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { getAgoraConfig, generateRtcToken, RtcRole } = require('../utils/agora');
const { sendExpoPushMessages } = require('../utils/pushNotifications');

const router = express.Router();

const schemaReady = pool.query(`
  CREATE TABLE IF NOT EXISTS calls (
    id BIGSERIAL PRIMARY KEY,
    caller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_name VARCHAR(120) NOT NULL,
    call_type VARCHAR(20) NOT NULL DEFAULT 'audio',
    status VARCHAR(30) NOT NULL DEFAULT 'ringing',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INT NOT NULL DEFAULT 0,
    end_reason VARCHAR(60),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(caller_id, status);
  CREATE INDEX IF NOT EXISTS idx_calls_recipient ON calls(recipient_id, status);
  CREATE INDEX IF NOT EXISTS idx_calls_channel ON calls(channel_name);
`);

/**
 * Helper to get user's active push tokens
 */
async function getUserPushTokens(userId) {
  const q = await pool.query(`
    SELECT DISTINCT expo_push_token FROM push_tokens 
    WHERE user_id = $1 AND is_active = TRUE
  `, [userId]);
  return q.rows.map(r => r.expo_push_token);
}

/**
 * GET /api/calls/contacts
 * Search active users, teachers, staff, and guardians (linked with student registration no)
 */
router.get('/contacts', auth, asyncHandler(async (req, res) => {
  await schemaReady;
  const query = String(req.query.q || '').trim();
  const role = String(req.query.role || '').trim();

  let sql = `
    SELECT 
      u.id, 
      COALESCE(u.full_name, gp.guardian_name, 'User') as full_name, 
      u.role, 
      u.login_id,
      s.student_name,
      s.registration_no,
      s.class_name,
      s.roll_no,
      COALESCE(gp.mobile, s.guardian_mobile, s.mobile_number) as phone,
      EXISTS(SELECT 1 FROM push_tokens pt WHERE pt.user_id = u.id AND pt.is_active = TRUE) AS has_push_token,
      EXISTS(SELECT 1 FROM guardian_login_sessions gls WHERE gls.user_id = u.id AND gls.is_active = TRUE AND gls.expires_at > NOW()) AS is_logged_in
    FROM users u
    LEFT JOIN guardian_profiles gp ON gp.user_id = u.id
    LEFT JOIN student_guardians sg ON sg.guardian_id = gp.id
    LEFT JOIN students s ON s.id = sg.student_id
    WHERE u.is_active = TRUE AND u.id != $1
  `;
  const params = [Number(req.user.userId)];
  if (role && role !== 'all') {
    params.push(role);
    sql += ` AND u.role = $${params.length}`;
  }
  if (query) {
    params.push(`%${query}%`);
    const p = `$${params.length}`;
    sql += ` AND (
      u.full_name ILIKE ${p} 
      OR u.login_id ILIKE ${p}
      OR s.student_name ILIKE ${p}
      OR s.registration_no ILIKE ${p}
      OR s.class_name ILIKE ${p}
      OR gp.mobile ILIKE ${p}
      OR s.guardian_mobile ILIKE ${p}
    )`;
  }
  sql += ` ORDER BY u.role, COALESCE(s.class_name, ''), COALESCE(s.roll_no, ''), u.full_name LIMIT 60`;

  const q = await pool.query(sql, params);
  res.json({ success: true, contacts: q.rows });
}));

/**
 * POST /api/calls/initiate
 * Body: { recipient_id, call_type: 'audio'|'video' }
 */
router.post('/initiate', auth, asyncHandler(async (req, res) => {
  await schemaReady;
  const callerId = Number(req.user.userId);
  const recipientId = Number(req.body?.recipient_id);
  const callType = req.body?.call_type === 'video' ? 'video' : 'audio';

  if (!recipientId || recipientId === callerId) {
    return res.status(400).json({ success: false, message: 'Valid recipient ID is required.' });
  }

  // Check recipient existence and active status
  const recipientCheck = await pool.query(
    `SELECT id, full_name, role, is_active FROM users WHERE id = $1`,
    [recipientId]
  );
  if (!recipientCheck.rowCount || !recipientCheck.rows[0].is_active) {
    return res.status(404).json({ success: false, message: 'Recipient not found or account inactive.' });
  }
  const recipient = recipientCheck.rows[0];

  // Get caller profile
  const callerCheck = await pool.query(
    `SELECT id, full_name, role FROM users WHERE id = $1`,
    [callerId]
  );
  const caller = callerCheck.rows[0] || { full_name: 'Caller', role: 'user' };

  // Generate channel name: alameen_<timestamp>_<callerId>_<recipientId>
  const channelName = `alameen_${Date.now()}_${callerId}_${recipientId}`;

  // Get Agora configuration
  const agoraConfig = await getAgoraConfig();
  if (!agoraConfig.appId) {
    return res.status(503).json({
      success: false,
      message: 'Agora App ID is not configured on the server. Please configure it in System Settings.',
    });
  }

  // Generate tokens for caller and recipient (valid for 1 hour)
  let callerToken = '';
  let recipientToken = '';
  try {
    callerToken = generateRtcToken({
      appId: agoraConfig.appId,
      appCertificate: agoraConfig.appCertificate,
      channelName,
      uid: callerId,
      role: RtcRole.PUBLISHER,
      expireSeconds: 3600,
    });
    recipientToken = generateRtcToken({
      appId: agoraConfig.appId,
      appCertificate: agoraConfig.appCertificate,
      channelName,
      uid: recipientId,
      role: RtcRole.PUBLISHER,
      expireSeconds: 3600,
    });
  } catch (err) {
    console.error('Failed to generate Agora token:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate calling security token.' });
  }

  // Insert call record
  const callInsert = await pool.query(`
    INSERT INTO calls (caller_id, recipient_id, channel_name, call_type, status)
    VALUES ($1, $2, $3, $4, 'ringing')
    RETURNING id, caller_id, recipient_id, channel_name, call_type, status, started_at
  `, [callerId, recipientId, channelName, callType]);
  const callRecord = callInsert.rows[0];

  // Dispatch high-priority push notification to recipient devices
  const recipientPushTokens = await getUserPushTokens(recipientId);
  if (recipientPushTokens.length > 0) {
    const pushMessages = recipientPushTokens.map(token => ({
      to: token,
      title: `Incoming ${callType === 'video' ? 'Video' : 'Audio'} Call`,
      body: `${caller.full_name} is calling you...`,
      sound: 'default',
      priority: 'high',
      channelId: 'call',
      data: {
        type: 'call_invite',
        call_id: String(callRecord.id),
        channel_name: channelName,
        call_type: callType,
        caller_id: String(callerId),
        caller_name: caller.full_name,
        caller_role: caller.role,
        agora_app_id: agoraConfig.appId,
        token: recipientToken,
        uid: recipientId,
      },
    }));

    try {
      await sendExpoPushMessages(pushMessages);
    } catch (pushErr) {
      console.warn('Failed to dispatch call push notification:', pushErr.message);
    }
  }

  res.status(201).json({
    success: true,
    call: {
      id: callRecord.id,
      channel_name: channelName,
      call_type: callType,
      status: 'ringing',
      agora_app_id: agoraConfig.appId,
      token: callerToken,
      uid: callerId,
      recipient: {
        id: recipient.id,
        full_name: recipient.full_name,
        role: recipient.role,
      },
    },
  });
}));

/**
 * POST /api/calls/:id/answer
 */
router.post('/:id/answer', auth, asyncHandler(async (req, res) => {
  await schemaReady;
  const callId = req.params.id;
  const userId = Number(req.user.userId);

  const callQuery = await pool.query(`
    SELECT * FROM calls WHERE id = $1 AND (recipient_id = $2 OR caller_id = $2)
  `, [callId, userId]);

  if (!callQuery.rowCount) {
    return res.status(404).json({ success: false, message: 'Call not found or unauthorized.' });
  }

  const call = callQuery.rows[0];
  if (call.status === 'ended' || call.status === 'rejected') {
    return res.status(400).json({ success: false, message: `Call already ${call.status}.` });
  }

  const upd = await pool.query(`
    UPDATE calls 
    SET status = 'in_call', answered_at = COALESCE(answered_at, NOW()), updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [callId]);

  // Notify caller that call was answered
  const callerPushTokens = await getUserPushTokens(call.caller_id);
  if (callerPushTokens.length > 0) {
    sendExpoPushMessages(callerPushTokens.map(token => ({
      to: token,
      title: 'Call Answered',
      body: 'Call connected',
      sound: null,
      priority: 'high',
      channelId: 'call',
      data: { type: 'call_answered', call_id: String(callId) },
    }))).catch(() => {});
  }

  res.json({ success: true, call: upd.rows[0] });
}));

/**
 * POST /api/calls/:id/end
 * Body: { reason: 'rejected'|'busy'|'completed'|'missed' }
 */
router.post('/:id/end', auth, asyncHandler(async (req, res) => {
  await schemaReady;
  const callId = req.params.id;
  const userId = Number(req.user.userId);
  const reason = String(req.body?.reason || 'completed').slice(0, 50);

  const callQuery = await pool.query(`
    SELECT * FROM calls WHERE id = $1 AND (caller_id = $2 OR recipient_id = $2)
  `, [callId, userId]);

  if (!callQuery.rowCount) {
    return res.status(404).json({ success: false, message: 'Call not found.' });
  }

  const call = callQuery.rows[0];
  let newStatus = 'ended';
  if (reason === 'rejected') newStatus = 'rejected';
  else if (reason === 'missed') newStatus = 'missed';

  const upd = await pool.query(`
    UPDATE calls 
    SET status = $1, 
        ended_at = NOW(), 
        duration_seconds = CASE 
          WHEN answered_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - answered_at))::int)
          ELSE 0 
        END,
        end_reason = $2,
        updated_at = NOW()
    WHERE id = $3
    RETURNING *
  `, [newStatus, reason, callId]);

  // Inform the other party
  const otherUserId = userId === call.caller_id ? call.recipient_id : call.caller_id;
  const otherTokens = await getUserPushTokens(otherUserId);
  if (otherTokens.length > 0) {
    sendExpoPushMessages(otherTokens.map(token => ({
      to: token,
      title: 'Call Ended',
      body: `Call ${newStatus}`,
      sound: null,
      priority: 'high',
      channelId: 'call',
      data: { type: 'call_ended', call_id: String(callId), reason },
    }))).catch(() => {});
  }

  res.json({ success: true, call: upd.rows[0] });
}));

/**
 * GET /api/calls/:id/status
 */
router.get('/:id/status', auth, asyncHandler(async (req, res) => {
  await schemaReady;
  const callId = req.params.id;
  const userId = Number(req.user.userId);

  const q = await pool.query(`
    SELECT c.*, 
      cr.full_name AS caller_name, cr.role AS caller_role,
      rc.full_name AS recipient_name, rc.role AS recipient_role
    FROM calls c
    JOIN users cr ON cr.id = c.caller_id
    JOIN users rc ON rc.id = c.recipient_id
    WHERE c.id = $1 AND (c.caller_id = $2 OR c.recipient_id = $2)
  `, [callId, userId]);

  if (!q.rowCount) {
    return res.status(404).json({ success: false, message: 'Call not found.' });
  }

  res.json({ success: true, call: q.rows[0] });
}));

/**
 * GET /api/calls/history
 */
router.get('/history', auth, asyncHandler(async (req, res) => {
  await schemaReady;
  const userId = Number(req.user.userId);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const q = await pool.query(`
    SELECT c.*,
      cr.full_name AS caller_name, cr.role AS caller_role,
      rc.full_name AS recipient_name, rc.role AS recipient_role,
      CASE WHEN c.caller_id = $1 THEN 'outgoing' ELSE 'incoming' END AS direction
    FROM calls c
    JOIN users cr ON cr.id = c.caller_id
    JOIN users rc ON rc.id = c.recipient_id
    WHERE c.caller_id = $1 OR c.recipient_id = $1
    ORDER BY c.started_at DESC
    LIMIT $2
  `, [userId, limit]);

  res.json({ success: true, calls: q.rows });
}));

/**
 * POST /api/calls/:id/token
 * Refresh / fetch RTC token for existing call session
 */
router.post('/:id/token', auth, asyncHandler(async (req, res) => {
  await schemaReady;
  const callId = req.params.id;
  const userId = Number(req.user.userId);

  const q = await pool.query(`
    SELECT * FROM calls WHERE id = $1 AND (caller_id = $2 OR recipient_id = $2)
  `, [callId, userId]);

  if (!q.rowCount) {
    return res.status(404).json({ success: false, message: 'Call not found.' });
  }

  const call = q.rows[0];
  const agoraConfig = await getAgoraConfig();
  if (!agoraConfig.appId) {
    return res.status(503).json({ success: false, message: 'Agora App ID not configured.' });
  }

  const token = generateRtcToken({
    appId: agoraConfig.appId,
    appCertificate: agoraConfig.appCertificate,
    channelName: call.channel_name,
    uid: userId,
    role: RtcRole.PUBLISHER,
    expireSeconds: 3600,
  });

  res.json({
    success: true,
    agora_app_id: agoraConfig.appId,
    token,
    uid: userId,
    channel_name: call.channel_name,
  });
}));

/**
 * GET /api/calls/logs
 * Booth and system call logs for admin panel & calling-schedule.tsx
 */
router.get('/logs', auth, asyncHandler(async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const q = await pool.query(`
    SELECT 
      COALESCE(h.id, cl.id) AS id,
      COALESCE(cl.call_sid, 'booth_' || h.id) AS call_sid,
      COALESCE(h.registration_no, cl.reg_no) AS reg_no,
      COALESCE(h.student_name, s.student_name, 'Student') AS student_name,
      COALESCE(cl.from_number, 'Booth') AS from_number,
      COALESCE(h.phone_number, cl.to_number) AS to_number,
      COALESCE(h.contact_person, cl.called_relation, 'Guardian') AS called_relation,
      COALESCE(h.call_status, cl.status) AS status,
      COALESCE(h.call_duration_seconds, cl.duration, 0) AS duration,
      COALESCE(ROUND(h.max_allowed_seconds / 60), cl.allowed_talk_time, 8) AS allowed_talk_time,
      cl.recording_url,
      COALESCE(h.created_at, cl.created_at) AS created_at
    FROM hostel_call_logs h
    FULL OUTER JOIN call_logs cl ON cl.reg_no = h.registration_no AND cl.created_at = h.created_at
    LEFT JOIN students s ON s.registration_no = COALESCE(h.registration_no, cl.reg_no)
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);

  res.json({ success: true, calls: q.rows });
}));

// Wire IVR routes from callingBooth
const { router: boothRouter } = require('./callingBooth');
router.use('/ivr', boothRouter);

module.exports = router;


