const express = require('express');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const staffRoles = allow('super_admin', 'admin', 'teacher', 'office');

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

module.exports = router;

