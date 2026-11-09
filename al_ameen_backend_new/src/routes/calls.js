const express = require('express');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { initiateCall, fetchCallDetails, normalizePhoneNumber } = require('../utils/exotel');

const router = express.Router();

// Auto-initialize call schemas
const schemaSql = fs.readFileSync(path.join(__dirname, '../../sql/calls.sql'), 'utf8');
const callingSystemSql = fs.readFileSync(path.join(__dirname, '../../sql/calling-system.sql'), 'utf8');

const schemaReady = Promise.all([
  pool.query(schemaSql),
  pool.query(callingSystemSql)
]).catch(err => {
  console.error('Failed to initialize calling tables:', err.message);
});

// Roles allowed to trigger or manage calls from admin panel
const callRoles = allow('super_admin', 'admin', 'teacher', 'office');

/**
 * Check if a student is scheduled for calling right now
 */
async function checkStudentCallingSchedule(studentId) {
  // 1. Get student info
  const stuQuery = `
    SELECT 
      s.id, s.registration_no, s.student_name, s.class_name, s.gender,
      COALESCE(a.is_emergency_call, FALSE) AS is_emergency_call,
      a.emergency_until
    FROM students s
    LEFT JOIN student_calling_access a ON a.student_id = s.id
    WHERE s.id = $1 AND s.is_active = TRUE
  `;
  const stuRes = await pool.query(stuQuery, [studentId]);
  if (!stuRes.rowCount) {
    return { allowed: false, reason: 'student_not_found', message: 'Student record not found or inactive' };
  }
  const student = stuRes.rows[0];

  // 2. Emergency Override Check
  if (student.is_emergency_call) {
    if (!student.emergency_until || new Date(student.emergency_until) > new Date()) {
      return {
        allowed: true,
        is_emergency: true,
        allowed_talk_time: 15,
        student
      };
    }
  }

  // 3. Regular Schedule Check (Kolkata timezone)
  const schedQuery = `
    SELECT id, allowed_talk_time, days, start_time, end_time
    FROM calling_schedules
    WHERE class_name = $1
      AND is_active = TRUE
      AND days ? trim(to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'Dy'))
      AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time BETWEEN start_time AND end_time
    ORDER BY allowed_talk_time DESC
    LIMIT 1
  `;
  const schedRes = await pool.query(schedQuery, [student.class_name]);

  if (!schedRes.rowCount) {
    return {
      allowed: false,
      reason: 'not_scheduled',
      message: 'Calling is not scheduled for your class at this time.',
      student
    };
  }

  const schedule = schedRes.rows[0];
  return {
    allowed: true,
    is_emergency: false,
    allowed_talk_time: schedule.allowed_talk_time || 8,
    scheduleId: schedule.id,
    student
  };
}

/**
 * Get available guardian contacts for a student
 */
async function getStudentGuardianOptions(studentId) {
  const contactRes = await pool.query(
    `SELECT * FROM student_guardian_contacts WHERE student_id = $1`,
    [studentId]
  );
  const stuRes = await pool.query(
    `SELECT father_mobile, mother_mobile, guardian_mobile, alternate_mobile FROM students WHERE id = $1`,
    [studentId]
  );

  const contacts = contactRes.rowCount ? contactRes.rows[0] : {};
  const stu = stuRes.rows[0] || {};

  const fatherMobile = contacts.father_mobile || stu.father_mobile || stu.guardian_mobile || null;
  const motherMobile = contacts.mother_mobile || stu.mother_mobile || stu.alternate_mobile || null;

  const options = [];

  if (fatherMobile) {
    options.push({ key: 1, relation: 'Father', mobile: fatherMobile, label: 'Father' });
  }
  if (motherMobile) {
    options.push({ key: 2, relation: 'Mother', mobile: motherMobile, label: 'Mother' });
  }
  if (contacts.guardian_1_mobile) {
    options.push({
      key: 3,
      relation: contacts.guardian_1_relation || 'Guardian 1',
      mobile: contacts.guardian_1_mobile,
      label: contacts.guardian_1_relation || 'Guardian 1'
    });
  }
  if (contacts.guardian_2_mobile) {
    options.push({
      key: 4,
      relation: contacts.guardian_2_relation || 'Guardian 2',
      mobile: contacts.guardian_2_mobile,
      label: contacts.guardian_2_relation || 'Guardian 2'
    });
  }
  if (contacts.guardian_3_mobile) {
    options.push({
      key: 5,
      relation: contacts.guardian_3_relation || 'Guardian 3',
      mobile: contacts.guardian_3_mobile,
      label: contacts.guardian_3_relation || 'Guardian 3'
    });
  }

  return options;
}

// =========================================================================
// IVR ENDPOINTS
// =========================================================================

/**
 * Step 1: Student inputs Registration Number
 * POST /api/calls/ivr/step1-verify-reg
 */
router.post('/ivr/step1-verify-reg', asyncHandler(async (req, res) => {
  await schemaReady;
  const regNo = String(req.body.reg_no || req.query.reg_no || req.body.Digits || '').trim();

  if (!regNo) {
    return res.status(400).json({ success: false, message: 'Registration number is required' });
  }

  const stuRes = await pool.query(
    `SELECT id, registration_no, student_name, class_name FROM students WHERE registration_no = $1 AND is_active = TRUE`,
    [regNo]
  );

  if (!stuRes.rowCount) {
    return res.status(404).json({
      success: false,
      status: 'invalid_reg',
      message: 'Registration number not found. Please check and try again.'
    });
  }

  const student = stuRes.rows[0];
  const digitsSpaced = student.registration_no.split('').join(' ');

  res.json({
    success: true,
    status: 'confirm_reg',
    student_id: student.id,
    reg_no: student.registration_no,
    student_name: student.student_name,
    class_name: student.class_name,
    prompt: `Your ID is ${digitsSpaced}. Press 1 to continue.`,
    confirm_key: 1,
    reenter_key: 2
  });
}));

/**
 * Step 2: Student confirms Registration Number (Presses 1)
 * -> System checks Schedule & returns relation options (Father-1, Mother-2...)
 * POST /api/calls/ivr/step2-confirm
 */
router.post('/ivr/step2-confirm', asyncHandler(async (req, res) => {
  await schemaReady;
  const { reg_no, student_id, confirm_digit } = req.body || {};

  if (confirm_digit && String(confirm_digit).trim() !== '1') {
    return res.json({
      success: false,
      status: 'reenter',
      message: 'Registration cancelled. Please re-enter your registration number.'
    });
  }

  let sId = student_id;
  if (!sId && reg_no) {
    const r = await pool.query(`SELECT id FROM students WHERE registration_no = $1 LIMIT 1`, [String(reg_no).trim()]);
    if (r.rowCount) sId = r.rows[0].id;
  }

  if (!sId) {
    return res.status(400).json({ success: false, message: 'Valid student identifier is required' });
  }

  // Check Schedule
  const scheduleCheck = await checkStudentCallingSchedule(sId);
  if (!scheduleCheck.allowed) {
    return res.json({
      success: false,
      status: 'not_scheduled',
      allowed: false,
      student_name: scheduleCheck.student?.student_name,
      message: scheduleCheck.message || 'Currently calling is not scheduled for your class.'
    });
  }

  // Get Contact Options
  const options = await getStudentGuardianOptions(sId);
  if (!options.length) {
    return res.json({
      success: false,
      status: 'no_contacts',
      allowed: true,
      student_name: scheduleCheck.student.student_name,
      message: 'No guardian phone numbers are registered for your profile. Please contact the office.'
    });
  }

  const promptParts = options.map(opt => `${opt.key} for ${opt.label}`);

  res.json({
    success: true,
    status: 'select_relation',
    allowed: true,
    student_id: sId,
    reg_no: scheduleCheck.student.registration_no,
    student_name: scheduleCheck.student.student_name,
    allowed_talk_time: scheduleCheck.allowed_talk_time,
    is_emergency: scheduleCheck.is_emergency,
    options,
    prompt: `Press ${promptParts.join(', ')}...`
  });
}));

/**
 * Step 3: Student selects relation (e.g. 1 for Father, 2 for Mother)
 * -> Initiates the call with Exotel with strict talk-time limit!
 * POST /api/calls/ivr/step3-connect
 */
router.post('/ivr/step3-connect', asyncHandler(async (req, res) => {
  await schemaReady;
  const { student_id, reg_no, selected_digit, from_phone } = req.body || {};

  let sId = student_id;
  if (!sId && reg_no) {
    const r = await pool.query(`SELECT id FROM students WHERE registration_no = $1 LIMIT 1`, [String(reg_no).trim()]);
    if (r.rowCount) sId = r.rows[0].id;
  }

  if (!sId) {
    return res.status(400).json({ success: false, message: 'Student ID or Reg No is required' });
  }

  // Double check schedule
  const scheduleCheck = await checkStudentCallingSchedule(sId);
  if (!scheduleCheck.allowed) {
    return res.status(403).json({
      success: false,
      message: scheduleCheck.message || 'Calling is not scheduled for your class at this time.'
    });
  }

  // Resolve target number based on selected digit
  const options = await getStudentGuardianOptions(sId);
  const digit = parseInt(selected_digit, 10);
  const chosen = options.find(o => o.key === digit);

  if (!chosen || !chosen.mobile) {
    return res.status(400).json({
      success: false,
      message: `Invalid option selected. Please choose from available options (${options.map(o => o.key).join(', ')}).`
    });
  }

  const callerFrom = from_phone || process.env.EXOTEL_CALLER_ID;
  const targetTo = chosen.mobile;
  const talkTimeMinutes = scheduleCheck.allowed_talk_time || 8;
  const timeLimitSeconds = talkTimeMinutes * 60;

  // Construct callback URL
  const baseUrl = process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL;
  const callbackUrl = baseUrl ? `${baseUrl.replace(/\/+$/, '')}/api/calls/callback` : undefined;

  let exotelResult;
  try {
    exotelResult = await initiateCall({
      from: callerFrom,
      to: targetTo,
      callbackUrl,
      record: true,
      timeLimit: timeLimitSeconds
    });
  } catch (err) {
    console.error('Failed to initiate IVR student call:', err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Exotel failed to connect the call',
      details: err.details
    });
  }

  const { callSid, status, callerId, raw } = exotelResult;

  // Log into call_logs
  const insertQuery = `
    INSERT INTO call_logs (
      call_sid, from_number, to_number, caller_id, status,
      student_id, reg_no, called_relation, allowed_talk_time,
      context, raw_response
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;

  const dbRes = await pool.query(insertQuery, [
    callSid,
    normalizePhoneNumber(callerFrom),
    normalizePhoneNumber(targetTo),
    callerId,
    status || 'initiated',
    sId,
    scheduleCheck.student.registration_no,
    chosen.relation,
    talkTimeMinutes,
    scheduleCheck.is_emergency ? 'emergency_call' : 'hostel_schedule_call',
    JSON.stringify(raw)
  ]);

  res.status(201).json({
    success: true,
    message: 'Guardian selected.',
    prompt: 'Guardian selected.',
    call: dbRes.rows[0],
    target_relation: chosen.relation,
    target_mobile: chosen.mobile,
    allowed_talk_time: talkTimeMinutes
  });
}));

/**
 * Exotel Passthru Applet Webhook
 * Handles real-time Passthru requests directly from Exotel call flows
 * ALL /api/calls/ivr/passthru
 */
router.all('/ivr/passthru', asyncHandler(async (req, res) => {
  await schemaReady;
  const params = { ...req.query, ...req.body };
  const digits = String(params.Digits || params.digits || '').trim();
  const step = params.step || '1';

  // Return standard Exotel Passthru response
  res.set('Content-Type', 'text/plain');
  res.status(200).send('OK');
}));

// =========================================================================
// GENERAL CALLING & STATUS CALLBACKS
// =========================================================================

/**
 * POST /api/calls/connect
 * Manual staff-initiated click to call
 */
router.post('/connect', auth, callRoles, asyncHandler(async (req, res) => {
  await schemaReady;
  const { to_number, from_number, student_id, notes, context } = req.body || {};

  if (!to_number) {
    return res.status(400).json({ success: false, message: 'Destination phone number (to_number) is required' });
  }

  let callerFrom = from_number;
  if (!callerFrom) {
    const teacherRes = await pool.query('SELECT mobile FROM teachers WHERE user_id = $1 LIMIT 1', [req.user.userId]);
    if (teacherRes.rowCount && teacherRes.rows[0].mobile) {
      callerFrom = teacherRes.rows[0].mobile;
    } else {
      const staffRes = await pool.query('SELECT mobile FROM service_staff_profiles WHERE user_id = $1 LIMIT 1', [req.user.userId]);
      if (staffRes.rowCount && staffRes.rows[0].mobile) {
        callerFrom = staffRes.rows[0].mobile;
      }
    }
  }

  if (!callerFrom) {
    return res.status(400).json({
      success: false,
      message: 'Calling staff phone number (from_number) is required.'
    });
  }

  const baseUrl = process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL;
  const callbackUrl = baseUrl ? `${baseUrl.replace(/\/+$/, '')}/api/calls/callback` : undefined;

  let exotelResult;
  try {
    exotelResult = await initiateCall({
      from: callerFrom,
      to: to_number,
      callbackUrl,
      record: true
    });
  } catch (err) {
    console.error('Exotel initiate call error:', err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Exotel failed to initiate call',
      details: err.details
    });
  }

  const { callSid, status, callerId, raw } = exotelResult;

  const insertQuery = `
    INSERT INTO call_logs (
      call_sid, from_number, to_number, caller_id, status, 
      initiated_by, student_id, notes, context, raw_response
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;

  const dbRes = await pool.query(insertQuery, [
    callSid,
    normalizePhoneNumber(callerFrom),
    normalizePhoneNumber(to_number),
    callerId,
    status || 'initiated',
    req.user.userId,
    student_id ? Number(student_id) : null,
    notes || null,
    context || 'guardian_call',
    JSON.stringify(raw)
  ]);

  res.status(201).json({
    success: true,
    message: 'Call initiated successfully.',
    call: dbRes.rows[0]
  });
}));

/**
 * POST /api/calls/callback
 * Exotel Status Webhook Callback
 */
router.post('/callback', asyncHandler(async (req, res) => {
  await schemaReady;
  const payload = req.body || {};

  const callSid = payload.CallSid || payload.call_sid || payload.Sid;
  const status = payload.Status || payload.status;
  const duration = parseInt(payload.Duration || payload.duration || 0, 10);
  const recordingUrl = payload.RecordingUrl || payload.recording_url || null;

  if (callSid) {
    const updateQuery = `
      UPDATE call_logs
      SET 
        status = COALESCE($1, status),
        duration = CASE WHEN $2 > 0 THEN $2 ELSE duration END,
        recording_url = COALESCE($3, recording_url),
        updated_at = NOW()
      WHERE call_sid = $4
      RETURNING id, call_sid, status, duration, recording_url
    `;
    await pool.query(updateQuery, [status, duration, recordingUrl, callSid]);
  }

  res.status(200).send('OK');
}));

/**
 * GET /api/calls/logs
 * Retrieve call logs
 */
router.get('/logs', auth, callRoles, asyncHandler(async (req, res) => {
  await schemaReady;
  const { student_id, reg_no, limit = 50, page = 1 } = req.query;
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

  const conditions = [];
  const args = [];

  if (student_id) {
    args.push(Number(student_id));
    conditions.push(`c.student_id = $${args.length}`);
  }
  if (reg_no) {
    args.push(String(reg_no).trim());
    conditions.push(`c.reg_no = $${args.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  args.push(parseInt(limit, 10));
  const limitClause = `LIMIT $${args.length}`;
  args.push(offset);
  const offsetClause = `OFFSET $${args.length}`;

  const query = `
    SELECT 
      c.*,
      u.full_name AS initiated_by_name,
      s.student_name,
      s.class_name,
      s.guardian_name
    FROM call_logs c
    LEFT JOIN users u ON u.id = c.initiated_by
    LEFT JOIN students s ON s.id = c.student_id
    ${whereClause}
    ORDER BY c.created_at DESC
    ${limitClause} ${offsetClause}
  `;

  const result = await pool.query(query, args);
  res.json({
    success: true,
    calls: result.rows
  });
}));

/**
 * POST /api/calls/sync/:callSid
 */
router.post('/sync/:callSid', auth, callRoles, asyncHandler(async (req, res) => {
  await schemaReady;
  const { callSid } = req.params;
  const details = await fetchCallDetails(callSid);

  const updateQuery = `
    UPDATE call_logs
    SET 
      status = COALESCE($1, status),
      duration = CASE WHEN $2 > 0 THEN $2 ELSE duration END,
      recording_url = COALESCE($3, recording_url),
      updated_at = NOW()
    WHERE call_sid = $4
    RETURNING *
  `;

  const updated = await pool.query(updateQuery, [
    details.status,
    details.duration,
    details.recordingUrl,
    callSid
  ]);

  if (!updated.rowCount) {
    return res.status(404).json({ success: false, message: 'Call log not found in database' });
  }

  res.json({
    success: true,
    call: updated.rows[0]
  });
}));

module.exports = router;
