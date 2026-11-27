const express = require('express');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const staffRoles = allow('super_admin');

const boothSettingsReady = pool.query(`
  CREATE TABLE IF NOT EXISTS calling_booth_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    incoming_calls_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    call_recording_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE calling_booth_settings ADD COLUMN IF NOT EXISTS call_recording_enabled BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE calling_booth_settings ALTER COLUMN call_recording_enabled SET DEFAULT TRUE;
  ALTER TABLE hostel_call_logs ADD COLUMN IF NOT EXISTS recording_url TEXT;
  INSERT INTO calling_booth_settings (id, incoming_calls_enabled, call_recording_enabled)
  VALUES (1, FALSE, TRUE)
  ON CONFLICT (id) DO NOTHING;
`);

let cachedIncomingCallsEnabled = false;
let cachedCallRecordingEnabled = true;

async function getBoothSettings() {
  await boothSettingsReady;
  const q = await pool.query(
    `SELECT incoming_calls_enabled, COALESCE(call_recording_enabled, TRUE) AS call_recording_enabled, updated_at FROM calling_booth_settings WHERE id = 1`
  );
  const row = q.rows[0] || { incoming_calls_enabled: false, call_recording_enabled: true, updated_at: null };
  cachedIncomingCallsEnabled = Boolean(row.incoming_calls_enabled);
  cachedCallRecordingEnabled = Boolean(row.call_recording_enabled);
  return row;
}

// Initial fetch on boot
getBoothSettings().catch(err => console.error('[BoothSettings] Init error:', err.message));

function isIncomingCallsEnabled() {
  return cachedIncomingCallsEnabled;
}

function isCallRecordingEnabled() {
  return cachedCallRecordingEnabled;
}

/**
 * GET /api/calling-schedules/settings
 * Returns global calling booth settings (incoming_calls_enabled & call_recording_enabled)
 */
router.get('/settings', auth, staffRoles, asyncHandler(async (req, res) => {
  const settings = await getBoothSettings();
  res.json({ success: true, settings });
}));

/**
 * PATCH /api/calling-schedules/settings
 * Toggle incoming calls and/or call recording OFF or ON
 */
router.patch('/settings', auth, staffRoles, asyncHandler(async (req, res) => {
  await boothSettingsReady;
  const current = await getBoothSettings();
  const hasIncoming = req.body && typeof req.body.incoming_calls_enabled === 'boolean';
  const hasRecording = req.body && typeof req.body.call_recording_enabled === 'boolean';

  const incomingEnabled = hasIncoming ? Boolean(req.body.incoming_calls_enabled) : Boolean(current.incoming_calls_enabled);
  const recordingEnabled = hasRecording ? Boolean(req.body.call_recording_enabled) : Boolean(current.call_recording_enabled);

  cachedIncomingCallsEnabled = incomingEnabled;
  cachedCallRecordingEnabled = recordingEnabled;

  const q = await pool.query(
    `INSERT INTO calling_booth_settings (id, incoming_calls_enabled, call_recording_enabled, updated_at)
     VALUES (1, $1, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET
       incoming_calls_enabled = $1,
       call_recording_enabled = $2,
       updated_at = NOW()
     RETURNING incoming_calls_enabled, call_recording_enabled, updated_at`,
    [incomingEnabled, recordingEnabled]
  );
  if (hasIncoming) {
    console.log(`[Yealink SIP] Incoming Calls setting updated via Web UI: ${incomingEnabled ? 'ENABLED (ON)' : 'BLOCKED (OFF)'}`);
  }
  if (hasRecording) {
    console.log(`[Yealink SIP] Call Recording setting updated via Web UI: ${recordingEnabled ? 'ENABLED (ON)' : 'DISABLED (OFF)'}`);
  }
  res.json({ success: true, settings: q.rows[0] });
}));

/**
 * GET /api/calling-schedules
 * List all calling schedules
 */
router.get('/', auth, staffRoles, asyncHandler(async (req, res) => {
  const { session_name, class_name, is_active } = req.query;
  const where = [];
  const args = [];

  if (session_name) {
    args.push(session_name);
    where.push(`session_name = $${args.length}`);
  }
  if (class_name) {
    args.push(class_name);
    where.push(`class_name = $${args.length}`);
  }
  if (is_active !== undefined) {
    args.push(is_active === 'true' || is_active === true);
    where.push(`is_active = $${args.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const query = `
    SELECT 
      id, branch_name, session_name, class_name, section, gender,
      allowed_talk_time, days,
      to_char(start_time, 'HH24:MI') AS start_time,
      to_char(end_time, 'HH24:MI') AS end_time,
      is_active, created_at, updated_at
    FROM calling_schedules
    ${whereClause}
    ORDER BY class_name ASC, session_name DESC, id ASC
  `;

  const result = await pool.query(query, args);
  res.json({ success: true, schedules: result.rows });
}));

/**
 * POST /api/calling-schedules
 * Create a new calling schedule
 */
router.post('/', auth, staffRoles, asyncHandler(async (req, res) => {
  const {
    branch_name = 'Al-Ameen Mission Academy Memari (Khadija Campus)',
    session_name,
    class_name,
    section = '0',
    gender = 'Female',
    allowed_talk_time = 8,
    days = ['Sun', 'Sat'],
    start_time = '04:00',
    end_time = '23:55',
    is_active = true
  } = req.body || {};

  if (!session_name || !class_name) {
    return res.status(400).json({ success: false, message: 'Session and Class are required' });
  }

  const dup = await pool.query(
    `SELECT id FROM calling_schedules
     WHERE LOWER(TRIM(class_name)) = LOWER(TRIM($1))
       AND LOWER(TRIM(session_name)) = LOWER(TRIM($2))
       AND LOWER(TRIM(gender)) = LOWER(TRIM($3))
     LIMIT 1`,
    [String(class_name), String(session_name), String(gender)]
  );
  if (dup.rowCount) {
    return res.status(409).json({
      success: false,
      message: 'একটি ক্লাসে কেবল ১টি শিডিউলই রাখা যাবে। একই ক্লাসের জন্য ২য় শিডিউল তৈরি করা যাবে না—আগের শিডিউলটি Edit করুন। (Only 1 schedule per class is allowed; please edit the existing schedule.)'
    });
  }

  const query = `
    INSERT INTO calling_schedules (
      branch_name, session_name, class_name, section, gender,
      allowed_talk_time, days, start_time, end_time, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::time, $9::time, $10)
    RETURNING 
      id, branch_name, session_name, class_name, section, gender,
      allowed_talk_time, days,
      to_char(start_time, 'HH24:MI') AS start_time,
      to_char(end_time, 'HH24:MI') AS end_time,
      is_active, created_at
  `;

  const daysJson = JSON.stringify(Array.isArray(days) ? days : [days]);
  const result = await pool.query(query, [
    branch_name,
    String(session_name).trim(),
    String(class_name).trim(),
    String(section).trim(),
    gender,
    parseInt(allowed_talk_time, 10) || 8,
    daysJson,
    start_time,
    end_time,
    is_active
  ]);

  res.status(201).json({ success: true, schedule: result.rows[0] });
}));

/**
 * PUT /api/calling-schedules/:id
 * Update an existing calling schedule
 */
router.put('/:id', auth, staffRoles, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    branch_name,
    session_name,
    class_name,
    section,
    gender,
    allowed_talk_time,
    days,
    start_time,
    end_time,
    is_active
  } = req.body || {};

  const daysJson = days ? JSON.stringify(Array.isArray(days) ? days : [days]) : undefined;

  const currentRes = await pool.query(`SELECT class_name, session_name, gender FROM calling_schedules WHERE id = $1`, [id]);
  if (!currentRes.rowCount) {
    return res.status(404).json({ success: false, message: 'Schedule not found' });
  }
  const cur = currentRes.rows[0];
  const nextClass = class_name ? String(class_name).trim() : cur.class_name;
  const nextSession = session_name ? String(session_name).trim() : cur.session_name;
  const nextGender = gender || cur.gender;
  const dup = await pool.query(
    `SELECT id FROM calling_schedules
     WHERE id <> $1
       AND LOWER(TRIM(class_name)) = LOWER(TRIM($2))
       AND LOWER(TRIM(session_name)) = LOWER(TRIM($3))
       AND LOWER(TRIM(gender)) = LOWER(TRIM($4))
     LIMIT 1`,
    [id, nextClass, nextSession, nextGender]
  );
  if (dup.rowCount) {
    return res.status(409).json({
      success: false,
      message: 'একটি ক্লাসে কেবল ১টি শিডিউলই রাখা যাবে। একই ক্লাসের জন্য ২য় শিডিউল রাখা যাবে না। (Only 1 schedule per class is allowed.)'
    });
  }

  const query = `
    UPDATE calling_schedules
    SET
      branch_name = COALESCE($1, branch_name),
      session_name = COALESCE($2, session_name),
      class_name = COALESCE($3, class_name),
      section = COALESCE($4, section),
      gender = COALESCE($5, gender),
      allowed_talk_time = COALESCE($6, allowed_talk_time),
      days = COALESCE($7::jsonb, days),
      start_time = COALESCE($8::time, start_time),
      end_time = COALESCE($9::time, end_time),
      is_active = COALESCE($10, is_active),
      updated_at = NOW()
    WHERE id = $11
    RETURNING 
      id, branch_name, session_name, class_name, section, gender,
      allowed_talk_time, days,
      to_char(start_time, 'HH24:MI') AS start_time,
      to_char(end_time, 'HH24:MI') AS end_time,
      is_active, updated_at
  `;

  const result = await pool.query(query, [
    branch_name,
    session_name ? String(session_name).trim() : null,
    class_name ? String(class_name).trim() : null,
    section !== undefined ? String(section).trim() : null,
    gender,
    allowed_talk_time ? parseInt(allowed_talk_time, 10) : null,
    daysJson,
    start_time,
    end_time,
    is_active,
    id
  ]);

  if (!result.rowCount) {
    return res.status(404).json({ success: false, message: 'Schedule not found' });
  }

  res.json({ success: true, schedule: result.rows[0] });
}));

/**
 * PATCH /api/calling-schedules/:id/toggle-status
 * Toggle schedule active/inactive
 */
router.patch('/:id/toggle-status', auth, staffRoles, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    `UPDATE calling_schedules SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING id, is_active`,
    [id]
  );
  if (!result.rowCount) {
    return res.status(404).json({ success: false, message: 'Schedule not found' });
  }
  res.json({ success: true, id: result.rows[0].id, is_active: result.rows[0].is_active });
}));

/**
 * DELETE /api/calling-schedules/:id
 * Delete schedule
 */
router.delete('/:id', auth, staffRoles, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(`DELETE FROM calling_schedules WHERE id = $1 RETURNING id`, [id]);
  if (!result.rowCount) {
    return res.status(404).json({ success: false, message: 'Schedule not found' });
  }
  res.json({ success: true, message: 'Schedule deleted' });
}));

/**
 * GET /api/calling-schedules/:id/students
 * Get students under this schedule with their contact numbers & emergency status
 */
router.get('/:id/students', auth, staffRoles, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const schedRes = await pool.query(`SELECT * FROM calling_schedules WHERE id = $1`, [id]);
  if (!schedRes.rowCount) {
    return res.status(404).json({ success: false, message: 'Schedule not found' });
  }
  const schedule = schedRes.rows[0];

  const query = `
    SELECT 
      s.id AS student_id,
      s.registration_no,
      s.student_name,
      s.class_name,
      s.gender,
      COALESCE(c.father_mobile, s.father_mobile, s.guardian_mobile) AS father_mobile,
      COALESCE(c.mother_mobile, s.mother_mobile, s.alternate_mobile) AS mother_mobile,
      c.guardian_1_mobile,
      c.guardian_1_relation,
      c.guardian_2_mobile,
      c.guardian_2_relation,
      c.guardian_3_mobile,
      c.guardian_3_relation,
      COALESCE(a.is_emergency_call, FALSE) AS is_emergency_call,
      a.emergency_until,
      COALESCE(a.is_scheduled, TRUE) AS is_scheduled,
      a.ipbx_id,
      a.dial_no
    FROM students s
    LEFT JOIN student_guardian_contacts c ON c.student_id = s.id
    LEFT JOIN student_calling_access a ON a.student_id = s.id
    WHERE s.class_name = $1 AND s.is_active = TRUE
    ORDER BY s.roll_no::integer NULLS LAST, s.registration_no ASC
  `;

  const students = await pool.query(query, [schedule.class_name]);

  res.json({
    success: true,
    schedule: {
      id: schedule.id,
      branch_name: schedule.branch_name,
      session_name: schedule.session_name,
      class_name: schedule.class_name,
      gender: schedule.gender,
      days: schedule.days,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      allowed_talk_time: schedule.allowed_talk_time
    },
    students: students.rows
  });
}));

/**
 * GET /api/calling-schedules/student-contacts/:studentId
 * Get contact numbers & relations for a single student
 */
router.get('/student-contacts/:studentId', auth, staffRoles, asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const stuRes = await pool.query(
    `SELECT id, registration_no, student_name, guardian_mobile, alternate_mobile, father_name, mother_name, guardian_name FROM students WHERE id = $1`,
    [studentId]
  );
  if (!stuRes.rowCount) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  const student = stuRes.rows[0];
  const contactRes = await pool.query(`SELECT * FROM student_guardian_contacts WHERE student_id = $1`, [studentId]);
  const contacts = contactRes.rowCount ? contactRes.rows[0] : {};

  res.json({
    success: true,
    student: {
      id: student.id,
      registration_no: student.registration_no,
      student_name: student.student_name,
      father_name: student.father_name,
      mother_name: student.mother_name,
      guardian_name: student.guardian_name
    },
    contacts: {
      father_mobile: contacts.father_mobile || student.guardian_mobile || '',
      mother_mobile: contacts.mother_mobile || student.alternate_mobile || '',
      guardian_1_mobile: contacts.guardian_1_mobile || '',
      guardian_1_relation: contacts.guardian_1_relation || '',
      guardian_2_mobile: contacts.guardian_2_mobile || '',
      guardian_2_relation: contacts.guardian_2_relation || '',
      guardian_3_mobile: contacts.guardian_3_mobile || '',
      guardian_3_relation: contacts.guardian_3_relation || ''
    }
  });
}));

/**
 * PUT /api/calling-schedules/student-contacts/:studentId
 * Upsert contact numbers & relations for a student
 */
router.put('/student-contacts/:studentId', auth, staffRoles, asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const {
    father_mobile,
    mother_mobile,
    guardian_1_mobile,
    guardian_1_relation,
    guardian_2_mobile,
    guardian_2_relation,
    guardian_3_mobile,
    guardian_3_relation
  } = req.body || {};

  const query = `
    INSERT INTO student_guardian_contacts (
      student_id, father_mobile, mother_mobile,
      guardian_1_mobile, guardian_1_relation,
      guardian_2_mobile, guardian_2_relation,
      guardian_3_mobile, guardian_3_relation,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (student_id) DO UPDATE SET
      father_mobile = EXCLUDED.father_mobile,
      mother_mobile = EXCLUDED.mother_mobile,
      guardian_1_mobile = EXCLUDED.guardian_1_mobile,
      guardian_1_relation = EXCLUDED.guardian_1_relation,
      guardian_2_mobile = EXCLUDED.guardian_2_mobile,
      guardian_2_relation = EXCLUDED.guardian_2_relation,
      guardian_3_mobile = EXCLUDED.guardian_3_mobile,
      guardian_3_relation = EXCLUDED.guardian_3_relation,
      updated_at = NOW()
    RETURNING *
  `;

  const result = await pool.query(query, [
    studentId,
    father_mobile || null,
    mother_mobile || null,
    guardian_1_mobile || null,
    guardian_1_relation || null,
    guardian_2_mobile || null,
    guardian_2_relation || null,
    guardian_3_mobile || null,
    guardian_3_relation || null
  ]);

  res.json({
    success: true,
    message: 'Guardian contact details updated successfully',
    contacts: result.rows[0]
  });
}));

/**
 * PATCH /api/calling-schedules/emergency-call/:studentId
 * Toggle Emergency Call permission for student
 */
router.patch('/emergency-call/:studentId', auth, staffRoles, asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { is_emergency_call, emergency_until } = req.body || {};

  const query = `
    INSERT INTO student_calling_access (student_id, is_emergency_call, emergency_until, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (student_id) DO UPDATE SET
      is_emergency_call = EXCLUDED.is_emergency_call,
      emergency_until = EXCLUDED.emergency_until,
      updated_at = NOW()
    RETURNING *
  `;

  const result = await pool.query(query, [
    studentId,
    Boolean(is_emergency_call),
    emergency_until || null
  ]);

  res.json({
    success: true,
    access: result.rows[0]
  });
}));


/**
 * GET /api/calling-schedules/logs
 * Call logs
 */
router.get('/logs', auth, staffRoles, asyncHandler(async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const q = await pool.query(`
    SELECT 
      h.id,
      'booth_' || h.id AS call_sid,
      h.registration_no AS reg_no,
      COALESCE(h.student_name, s.student_name, 'Student') AS student_name,
      'Booth' AS from_number,
      h.phone_number AS to_number,
      COALESCE(h.contact_person, 'Guardian') AS called_relation,
      h.call_status AS status,
      COALESCE(h.call_duration_seconds, 0) AS duration,
      COALESCE(ROUND(h.max_allowed_seconds / 60), 8) AS allowed_talk_time,
      NULL AS recording_url,
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

    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);

  res.json({ success: true, calls: q.rows });
}));

router.getBoothSettings = getBoothSettings;
router.isIncomingCallsEnabled = isIncomingCallsEnabled;
router.isCallRecordingEnabled = isCallRecordingEnabled;
module.exports = router;

