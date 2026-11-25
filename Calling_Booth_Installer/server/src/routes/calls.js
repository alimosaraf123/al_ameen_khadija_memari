const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
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
 * Shared query helper for call logs with optional date-range & column filters
 */
async function queryFilteredCallLogs({
  fromDate,
  toDate,
  regNo,
  student,
  relation,
  toNumber,
  status,
  limit = 200,
}) {
  const params = [];
  const conditions = [];

  if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    params.push(fromDate);
    conditions.push(`COALESCE(started_at, created_at) >= ($${params.length}::date)::timestamp AT TIME ZONE 'Asia/Kolkata'`);
  }
  if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    params.push(toDate);
    conditions.push(`COALESCE(started_at, created_at) < (($${params.length}::date + INTERVAL '1 day'))::timestamp AT TIME ZONE 'Asia/Kolkata'`);
  }
  if (regNo && String(regNo).trim()) {
    params.push(`%${String(regNo).trim()}%`);
    conditions.push(`COALESCE(reg_no, '') ILIKE $${params.length}`);
  }
  if (student && String(student).trim()) {
    params.push(`%${String(student).trim()}%`);
    conditions.push(`COALESCE(student_name, '') ILIKE $${params.length}`);
  }
  if (relation && String(relation).trim() && String(relation).trim().toLowerCase() !== 'all') {
    params.push(`%${String(relation).trim()}%`);
    conditions.push(`COALESCE(called_relation, '') ILIKE $${params.length}`);
  }
  if (toNumber && String(toNumber).trim()) {
    params.push(`%${String(toNumber).trim()}%`);
    conditions.push(`COALESCE(to_number, '') ILIKE $${params.length}`);
  }
  if (status && String(status).trim() && String(status).trim().toLowerCase() !== 'all') {
    params.push(String(status).trim().toLowerCase());
    conditions.push(`LOWER(COALESCE(status, '')) = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const q = await pool.query(`
    SELECT * FROM (
      SELECT 
        h.id,
        'booth_' || h.id AS call_sid,
        h.registration_no AS reg_no,
        COALESCE(h.student_name, s.student_name, 'Student') AS student_name,
        COALESCE(s.class_name, h.class_name, '') AS class_name,
        'Booth' AS from_number,
        h.phone_number AS to_number,
        COALESCE(h.contact_person, 'Guardian') AS called_relation,
        h.call_status AS status,
        COALESCE(h.call_duration_seconds, 0) AS duration,
        COALESCE(ROUND(h.max_allowed_seconds / 60), 8) AS allowed_talk_time,
        h.recording_url,
        h.started_at,
        h.ended_at,
        h.created_at
      FROM hostel_call_logs h
      LEFT JOIN students s ON s.registration_no = h.registration_no

      UNION ALL

      SELECT
        cl.id,
        cl.call_sid,
        cl.reg_no,
        COALESCE(s.student_name, 'Student') AS student_name,
        COALESCE(s.class_name, '') AS class_name,
        COALESCE(cl.from_number, 'External') AS from_number,
        cl.to_number,
        COALESCE(cl.called_relation, 'Guardian') AS called_relation,
        cl.status,
        COALESCE(cl.duration, 0) AS duration,
        COALESCE(cl.allowed_talk_time, 8) AS allowed_talk_time,
        cl.recording_url,
        cl.created_at AS started_at,
        (CASE WHEN cl.duration > 0 THEN cl.created_at + (cl.duration || ' seconds')::interval ELSE cl.updated_at END) AS ended_at,
        cl.created_at
      FROM call_logs cl
      LEFT JOIN students s ON s.registration_no = cl.reg_no
      WHERE cl.context != 'booth_call' AND cl.call_sid NOT LIKE 'booth_%'
    ) combined
    ${whereClause}
    ORDER BY COALESCE(started_at, created_at) DESC
    LIMIT $${params.length}
  `, params);

  return q.rows;
}

/**
 * GET /api/calls/logs
 * Booth and system call logs for admin panel & calling-schedule.tsx
 */
router.get('/logs', auth, allow('super_admin'), asyncHandler(async (req, res) => {
  const fromDate = req.query.from_date ? String(req.query.from_date).trim() : '';
  const toDate = req.query.to_date ? String(req.query.to_date).trim() : '';
  const defaultLimit = (fromDate || toDate) ? 1000 : 100;
  const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || defaultLimit));

  const rows = await queryFilteredCallLogs({
    fromDate,
    toDate,
    regNo: req.query.reg_no,
    student: req.query.student,
    relation: req.query.relation,
    toNumber: req.query.to_number,
    status: req.query.status,
    limit,
  });

  res.json({ success: true, calls: rows });
}));

async function sendLogsExcel(res, rows, fromDate = '', toDate = '') {
  const fmtIstDateTime = (dt) => {
    if (!dt) return '-';
    try {
      return new Date(dt).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return String(dt);
    }
  };

  const fmtIstTime = (dt) => {
    if (!dt) return '-';
    try {
      return new Date(dt).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return '-';
    }
  };

  const fmtDuration = (secs) => {
    const s = Number(secs) || 0;
    if (s <= 0) return '0s';
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m === 0) return `${rem}s`;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Call Logs');

  sheet.mergeCells('A1:K1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'Al-Ameen Mission Academy Memari - Hostel Call Logs & History';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF173F77' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 26;

  sheet.mergeCells('A2:K2');
  const subCell = sheet.getCell('A2');
  const rangeLabel = (fromDate || toDate) ? `${fromDate || 'Start'} to ${toDate || 'Today'}` : 'All Dates';
  subCell.value = `Date Range: ${rangeLabel} | Total Calls: ${rows.length}`;
  subCell.font = { italic: true, size: 10, color: { argb: 'FF475569' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 20;

  const headers = [
    '#', 'Reg No', 'Student Name', 'Class', 'Relation',
    'Dialed To', 'Status', 'Start Time', 'Stop Time', 'Duration', 'Time Limit'
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  rows.forEach((r, i) => {
    const startVal = r.started_at || r.created_at;
    let endVal = r.ended_at;
    if (!endVal && startVal && r.duration) {
      endVal = new Date(new Date(startVal).getTime() + Number(r.duration) * 1000);
    }
    const row = sheet.addRow([
      i + 1,
      r.reg_no || '-',
      r.student_name || '-',
      r.class_name || '-',
      r.called_relation || 'Guardian',
      r.to_number || '-',
      r.status === 'completed' ? 'Completed' : (r.status || '-'),
      fmtIstDateTime(startVal),
      fmtIstTime(endVal),
      fmtDuration(r.duration),
      `${r.allowed_talk_time || 8} min`,
    ]);
    row.eachCell((cell, colNumber) => {
      cell.alignment = {
        horizontal: [1, 2, 4, 7, 10, 11].includes(colNumber) ? 'center' : 'left',
        vertical: 'middle',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
      if (colNumber === 7) {
        cell.font = { bold: true, color: { argb: r.status === 'completed' ? 'FF16A34A' : 'FFDC2626' } };
      }
    });
  });

  const colWidths = [6, 12, 24, 10, 14, 16, 14, 24, 15, 12, 12];
  colWidths.forEach((w, idx) => {
    sheet.getColumn(idx + 1).width = w;
  });

  const fileTag = (fromDate || toDate) ? `${fromDate || 'start'}_to_${toDate || 'today'}` : 'all';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Hostel_Call_Logs_${fileTag}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
}

/**
 * GET /api/calls/logs/export
 * Download filtered Call Logs as Excel (.xlsx)
 */
router.get('/logs/export', auth, allow('super_admin'), asyncHandler(async (req, res) => {
  const fromDate = req.query.from_date ? String(req.query.from_date).trim() : '';
  const toDate = req.query.to_date ? String(req.query.to_date).trim() : '';

  const rows = await queryFilteredCallLogs({
    fromDate,
    toDate,
    regNo: req.query.reg_no,
    student: req.query.student,
    relation: req.query.relation,
    toNumber: req.query.to_number,
    status: req.query.status,
    limit: 5000,
  });

  await sendLogsExcel(res, rows, fromDate, toDate);
}));

/**
 * POST /api/calls/logs/export
 * Download exact client-filtered & sorted Call Logs as Excel (.xlsx)
 */
router.post('/logs/export', auth, allow('super_admin'), asyncHandler(async (req, res) => {
  const fromDate = req.body?.from_date ? String(req.body.from_date).trim() : '';
  const toDate = req.body?.to_date ? String(req.body.to_date).trim() : '';
  const records = Array.isArray(req.body?.records) ? req.body.records : null;

  const rows = records || await queryFilteredCallLogs({
    fromDate,
    toDate,
    limit: 5000,
  });

  await sendLogsExcel(res, rows, fromDate, toDate);
}));

/**
 * GET /api/calls/recordings/:date/:filename
 * Stream or download a locally saved call recording (.wav)
 */
router.get('/recordings/:date/:filename', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const token = bearerToken || (req.query.token ? String(req.query.token).trim() : '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded?.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can access call recordings' });
    }
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  const dateFolder = String(req.params.date || '');
  const fileName = String(req.params.filename || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFolder) || !/^[a-zA-Z0-9_.-]+\.(wav|mp3)$/i.test(fileName)) {
    return res.status(400).json({ success: false, message: 'Invalid recording path' });
  }

  const recordingsRoot = path.resolve(__dirname, '..', '..', 'recordings');
  const fullPath = path.resolve(recordingsRoot, dateFolder, fileName);
  if (!fullPath.startsWith(recordingsRoot) || !fs.existsSync(fullPath)) {
    return res.status(404).json({ success: false, message: 'Recording not found on this server' });
  }

  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  }
  res.setHeader('Content-Type', fileName.toLowerCase().endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav');
  return res.sendFile(fullPath);
}));

// Wire IVR routes from callingBooth
const { router: boothRouter } = require('./callingBooth');
router.use('/ivr', boothRouter);

module.exports = router;


