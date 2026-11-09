const express = require('express');
const ExcelJS = require('exceljs');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  const text = String(value || '');
  if (!DATE_PATTERN.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function normalizeRoom(value) {
  return String(value || '').trim().toLowerCase().replace(/^room\s+/, '');
}

async function findRoom(roomNumber, client = pool) {
  const rooms = (await client.query('SELECT id,room_name FROM rooms WHERE is_active=TRUE')).rows;
  const wanted = normalizeRoom(roomNumber);
  return rooms.find((room) => normalizeRoom(room.room_name) === wanted) || null;
}

async function canAccessRoom(user, roomId, client = pool) {
  if (user.role === 'super_admin' || user.role === 'admin') return true;
  const result = await client.query(`
    SELECT 1
    FROM teacher_room_assignments tra
    JOIN teachers t ON t.id=tra.teacher_id
    WHERE tra.room_id=$1 AND tra.is_active=TRUE AND t.user_id=$2
  `, [roomId, user.userId]);
  return result.rowCount > 0;
}

router.get('/history', auth, allow('super_admin','admin','teacher'), asyncHandler(async (req, res) => {
  const params = [];
  const filters = [];

  if (req.user.role === 'teacher') {
    params.push(req.user.userId);
    filters.push(`EXISTS (
      SELECT 1 FROM teacher_room_assignments tra
      JOIN teachers t ON t.id=tra.teacher_id
      WHERE tra.room_id=sub.room_id AND tra.is_active=TRUE AND t.user_id=$${params.length}
    )`);
  }

  if (req.query.room_number) {
    const room = await findRoom(req.query.room_number);
    if (!room) return res.status(404).json({ success: false, message: 'Room number not found' });
    params.push(room.id);
    filters.push(`sub.room_id=$${params.length}`);
  }

  if (req.query.date_from) {
    if (!isValidDate(req.query.date_from)) return res.status(400).json({ success: false, message: 'Invalid start date' });
    params.push(req.query.date_from);
    filters.push(`sub.attendance_date >= $${params.length}`);
  }

  if (req.query.date_to) {
    if (!isValidDate(req.query.date_to)) return res.status(400).json({ success: false, message: 'Invalid end date' });
    params.push(req.query.date_to);
    filters.push(`sub.attendance_date <= $${params.length}`);
  }

  const result = await pool.query(`
    SELECT sub.id, to_char(sub.attendance_date, 'YYYY-MM-DD') AS attendance_date, sub.submitted_at, sub.updated_at,
           r.room_name,
           COALESCE((SELECT string_agg(t.name, ', ' ORDER BY t.name)
                     FROM teacher_room_assignments tra
                     JOIN teachers t ON t.id=tra.teacher_id
                     WHERE tra.room_id=sub.room_id AND tra.is_active=TRUE), 'Not assigned') AS teacher_name,
           submitted.full_name AS submitted_by_name,
           updated.full_name AS last_updated_by_name,
           COUNT(a.id)::int AS total,
           COUNT(a.id) FILTER (WHERE a.status='present')::int AS present,
           COUNT(a.id) FILTER (WHERE a.status='absent')::int AS absent,
           (
             SELECT COUNT(DISTINCT gp.student_id)::int
             FROM student_gate_passes gp
             JOIN students gps ON gps.id=gp.student_id
             WHERE gps.room_id=sub.room_id
               AND gp.status='pending'
           ) AS gate_pass_students
    FROM attendance_submissions sub
    JOIN rooms r ON r.id=sub.room_id
    LEFT JOIN users submitted ON submitted.id=sub.submitted_by
    LEFT JOIN users updated ON updated.id=sub.last_updated_by
    LEFT JOIN attendance a ON a.room_id=sub.room_id AND a.attendance_date=sub.attendance_date
    ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
    GROUP BY sub.id,r.room_name,submitted.full_name,updated.full_name
    ORDER BY sub.attendance_date DESC,sub.updated_at DESC
    LIMIT 60
  `, params);

  res.json({ success: true, history: result.rows });
}));

router.get('/my-room-status', auth, allow('super_admin','admin','teacher'), asyncHandler(async (req, res) => {
  const defaultDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const date = String(req.query.date || defaultDate);
  if (!isValidDate(date)) return res.status(400).json({ success: false, message: 'Invalid attendance date' });

  let assignedRooms = [];
  if (req.user.role === 'teacher') {
    const r = await pool.query(`
      SELECT r.id, r.room_name
      FROM teacher_room_assignments tra
      JOIN teachers t ON t.id=tra.teacher_id
      JOIN rooms r ON r.id=tra.room_id
      WHERE tra.is_active=TRUE AND t.user_id=$1
      ORDER BY r.room_name
    `, [req.user.userId]);
    assignedRooms = r.rows;
  } else {
    const r = await pool.query(`SELECT id, room_name FROM rooms WHERE is_active=TRUE ORDER BY room_name LIMIT 1`);
    assignedRooms = r.rows;
  }

  if (assignedRooms.length === 0) {
    return res.json({
      success: true,
      has_room: false,
      message: 'No room assigned to this account'
    });
  }

  const room = assignedRooms[0];
  const submission = await pool.query(`
    SELECT sub.id, sub.room_id, to_char(sub.attendance_date, 'YYYY-MM-DD') AS attendance_date,
           to_char(sub.submitted_at AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY HH12:MI AM') AS submitted_at_ist,
           to_char(sub.updated_at AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY HH12:MI AM') AS updated_at_ist,
           sub.submitted_at, sub.updated_at,
           r.room_name,
           submitted.full_name AS submitted_by_name,
           updated.full_name AS last_updated_by_name,
           (SELECT COUNT(*)::int FROM attendance a WHERE a.room_id=sub.room_id AND a.attendance_date=sub.attendance_date AND a.status='present') AS present_count,
           (SELECT COUNT(*)::int FROM attendance a WHERE a.room_id=sub.room_id AND a.attendance_date=sub.attendance_date AND a.status='absent') AS absent_count,
           (SELECT COUNT(*)::int FROM students s WHERE s.room_id=sub.room_id AND s.is_active=TRUE) AS total_students
    FROM attendance_submissions sub
    JOIN rooms r ON r.id=sub.room_id
    LEFT JOIN users submitted ON submitted.id=sub.submitted_by
    LEFT JOIN users updated ON updated.id=sub.last_updated_by
    WHERE sub.room_id=$1 AND sub.attendance_date=$2
  `, [room.id, date]);

  const sub = submission.rows[0] || null;

  res.json({
    success: true,
    has_room: true,
    room_name: room.room_name,
    all_rooms: assignedRooms.map(x => x.room_name),
    submitted: !!sub,
    submission: sub,
    date,
  });
}));

router.get('/room/:roomNumber', auth, allow('super_admin','admin','teacher'), asyncHandler(async (req, res) => {
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  if (!isValidDate(date)) return res.status(400).json({ success: false, message: 'Invalid attendance date' });

  const room = await findRoom(req.params.roomNumber);
  if (!room) return res.status(404).json({ success: false, message: 'Room number not found' });
  if (!(await canAccessRoom(req.user, room.id))) return res.status(403).json({ success: false, message: 'This room is not assigned to you' });

  const students = await pool.query(`
    SELECT s.id,s.registration_no,s.student_name,s.class_name,s.photo_url,
           COALESCE(a.status,'present') AS status,a.remarks
    FROM students s
    LEFT JOIN attendance a ON a.student_id=s.id AND a.attendance_date=$2 AND a.room_id=$1
    WHERE s.room_id=$1 AND s.is_active=TRUE
    ORDER BY s.class_name,s.student_name
  `, [room.id, date]);

  const submission = await pool.query(`
    SELECT sub.*,
           to_char(sub.submitted_at AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY HH12:MI AM') AS submitted_at_ist,
           to_char(sub.updated_at AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY HH12:MI AM') AS updated_at_ist,
           submitted.full_name AS submitted_by_name,
           updated.full_name AS last_updated_by_name
    FROM attendance_submissions sub
    LEFT JOIN users submitted ON submitted.id=sub.submitted_by
    LEFT JOIN users updated ON updated.id=sub.last_updated_by
    WHERE sub.room_id=$1 AND sub.attendance_date=$2
  `, [room.id, date]);

  res.json({
    success: true,
    date,
    room,
    students: students.rows,
    submission: submission.rows[0] || null,
  });
}));

router.get('/student-summary', auth, allow('super_admin','admin'), asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT COALESCE(NULLIF(TRIM(s.class_name), ''), 'Unassigned') AS class_name,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM student_gate_passes gp
             WHERE gp.student_id=s.id AND gp.status='pending' AND gp.printed_at IS NOT NULL
           ))::int AS absent
    FROM students s
    WHERE s.is_active=TRUE
    GROUP BY 1
    ORDER BY class_name
  `);
  res.json({ success: true, summary: result.rows.map(row => ({ ...row, present: Number(row.total) - Number(row.absent) })) });
}));

router.get('/staff-summary', auth, allow('super_admin','admin'), asyncHandler(async (req, res) => {
  const date = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'Enter a valid date (YYYY-MM-DD).' });
  const result = await pool.query(`SELECT CASE WHEN LOWER(TRIM(COALESCE(t.profile_details->>'residential_type','')))='guest'
      AND LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) IN ('teacher','teachers') THEN 'Guest Teacher'
      ELSE CASE WHEN LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) IN ('other','others') THEN 'Others'
        ELSE COALESCE(NULLIF(TRIM(t.profile_details->>'staff_type'),''),'Other') END END AS staff,
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE COALESCE(a.status,'Present')='Present')::int AS present,
    COUNT(*) FILTER (WHERE a.status='Absent')::int AS absent,
    COUNT(*) FILTER (WHERE a.status='Leave')::int AS leave
    FROM teachers t LEFT JOIN staff_attendance a ON a.teacher_id=t.id AND a.attendance_date=$1
    WHERE (LOWER(TRIM(COALESCE(t.profile_details->>'residential_type',''))) <> 'guest'
      OR LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) IN ('teacher','teachers'))
      AND LOWER(TRIM(COALESCE(t.profile_details->>'salary',''))) <> 'guest'
      AND LOWER(TRIM(COALESCE(t.profile_details->>'type_of_staff',''))) <> 'guest'
      AND LOWER(TRIM(COALESCE(t.profile_details->>'staff_type',''))) <> 'guest'
    GROUP BY 1 ORDER BY 1`, [date]);
  res.json({ success: true, summary: result.rows });
}));

router.post('/batch', auth, allow('super_admin','admin','teacher'), asyncHandler(async (req, res) => {
  const { room_number: roomNumber, attendance_date: attendanceDate, entries } = req.body || {};
  if (!roomNumber || !isValidDate(attendanceDate) || !Array.isArray(entries)) {
    return res.status(400).json({ success: false, message: 'Room, valid attendance date and entries are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const room = await findRoom(roomNumber, client);
    if (!room) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Room number not found' });
    }
    if (!(await canAccessRoom(req.user, room.id, client))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'This room is not assigned to you' });
    }

    const roomStudents = (await client.query(
      'SELECT id FROM students WHERE room_id=$1 AND is_active=TRUE ORDER BY id FOR UPDATE',
      [room.id]
    )).rows.map((row) => Number(row.id));
    const entryIds = entries.map((entry) => Number(entry.student_id));
    const uniqueIds = new Set(entryIds);
    const completeRoom = roomStudents.length === entryIds.length && roomStudents.every((id) => uniqueIds.has(id));
    if (!completeRoom) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Student list changed. Reload the room before submitting attendance.' });
    }
    if (entries.some((entry) => !['present', 'absent'].includes(entry.status))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Attendance status must be present or absent' });
    }

    const existing = await client.query(
      'SELECT id FROM attendance_submissions WHERE room_id=$1 AND attendance_date=$2 FOR UPDATE',
      [room.id, attendanceDate]
    );

    for (const entry of entries) {
      await client.query(`
        INSERT INTO attendance(student_id,room_id,attendance_date,status,room_status,remarks,marked_by)
        VALUES($1,$2,$3,$4,$4,$5,$6)
        ON CONFLICT(student_id,attendance_date)
        DO UPDATE SET room_id=EXCLUDED.room_id,
                      room_status=EXCLUDED.room_status,
                      status=CASE 
                        WHEN (SELECT 1 FROM daily_attendance_submissions WHERE attendance_date=$3) IS NULL 
                        THEN EXCLUDED.status 
                        ELSE attendance.status 
                      END,
                      remarks=EXCLUDED.remarks,marked_by=EXCLUDED.marked_by,updated_at=NOW()
      `, [entry.student_id, room.id, attendanceDate, entry.status, entry.remarks || null, req.user.userId]);
    }

    const submission = await client.query(`
      INSERT INTO attendance_submissions(room_id,attendance_date,submitted_by,last_updated_by)
      VALUES($1,$2,$3,$3)
      ON CONFLICT(room_id,attendance_date)
      DO UPDATE SET last_updated_by=EXCLUDED.last_updated_by,updated_at=NOW()
      RETURNING *
    `, [room.id, attendanceDate, req.user.userId]);

    const snapshot = entries.map((entry) => ({
      student_id: Number(entry.student_id),
      status: entry.status,
      remarks: entry.remarks || null,
    }));
    await client.query(`
      INSERT INTO attendance_change_logs(submission_id,changed_by,action,snapshot)
      VALUES($1,$2,$3,$4::jsonb)
    `, [submission.rows[0].id, req.user.userId, existing.rowCount ? 'updated' : 'submitted', JSON.stringify(snapshot)]);

    await client.query('COMMIT');
    res.json({ success: true, submission: submission.rows[0], action: existing.rowCount ? 'updated' : 'submitted' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/daily', auth, allow('super_admin','admin','office','teacher'), asyncHandler(async (req, res) => {
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  if (!isValidDate(date)) {
    return res.status(400).json({ success: false, message: 'Invalid attendance date' });
  }

  const dailySubResult = await pool.query(`
    SELECT das.*, u.full_name AS submitted_by_name, u.full_name AS updated_by_name
    FROM daily_attendance_submissions das
    LEFT JOIN users u ON u.id = das.submitted_by
    WHERE das.attendance_date = $1::date
  `, [date]);
  const isDailySubmitted = dailySubResult.rows.length > 0;

  const result = await pool.query(`
    SELECT 
      s.id,
      s.registration_no,
      s.student_name,
      COALESCE(NULLIF(TRIM(s.class_name), ''), 'Unassigned') AS class_name,
      s.room_id,
      COALESCE(r.room_name, 'Unassigned') AS room_name,
      EXISTS (
        SELECT 1 FROM student_gate_passes gp
        WHERE gp.student_id = s.id
          AND gp.status = 'pending'
          AND gp.departure_at::date <= $1::date
          AND (gp.returned_at IS NULL OR gp.returned_at::date > $1::date)
      ) AS has_active_gatepass,
      (
        SELECT gp.token_no FROM student_gate_passes gp
        WHERE gp.student_id = s.id
          AND gp.status = 'pending'
          AND gp.departure_at::date <= $1::date
          AND (gp.returned_at IS NULL OR gp.returned_at::date > $1::date)
        ORDER BY gp.departure_at DESC LIMIT 1
      ) AS active_gatepass_token,
      (
        SELECT gp.reason FROM student_gate_passes gp
        WHERE gp.student_id = s.id
          AND gp.status = 'pending'
          AND gp.departure_at::date <= $1::date
          AND (gp.returned_at IS NULL OR gp.returned_at::date > $1::date)
        ORDER BY gp.departure_at DESC LIMIT 1
      ) AS active_gatepass_reason,
      EXISTS (
        SELECT 1 FROM attendance_submissions sub
        WHERE sub.room_id = s.room_id AND sub.attendance_date = $1::date
      ) AS room_submitted,
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM attendance_submissions sub
          WHERE sub.room_id = s.room_id AND sub.attendance_date = $1::date
        ) THEN COALESCE(a.room_status, a.status)
        ELSE NULL
      END AS room_attendance_status,
      a.status AS saved_status,
      a.remarks AS attendance_remarks,
      a.updated_at AS attendance_updated_at,
      u.full_name AS marked_by_name
    FROM students s
    LEFT JOIN rooms r ON r.id = s.room_id
    LEFT JOIN attendance a ON a.student_id = s.id AND a.attendance_date = $1::date
    LEFT JOIN users u ON u.id = a.marked_by
    WHERE s.is_active = TRUE
    ORDER BY 
      CASE 
        WHEN s.class_name ILIKE 'Class V%' THEN 1
        WHEN s.class_name ILIKE 'Class VI%' THEN 2
        WHEN s.class_name ILIKE 'Class VII%' THEN 3
        WHEN s.class_name ILIKE 'Class VIII%' THEN 4
        WHEN s.class_name ILIKE 'Class IX%' THEN 5
        WHEN s.class_name ILIKE 'Class X%' THEN 6
        WHEN s.class_name ILIKE 'Class XI%' THEN 7
        WHEN s.class_name ILIKE 'Class XII%' THEN 8
        ELSE 9
      END,
      r.room_name ASC NULLS LAST,
      s.registration_no ASC
  `, [date]);

  const students = result.rows.map(row => {
    let computedStatus = 'present';
    if (isDailySubmitted && row.saved_status) {
      computedStatus = row.saved_status;
    } else if (row.has_active_gatepass) {
      computedStatus = 'absent';
    } else if (row.room_attendance_status) {
      computedStatus = row.room_attendance_status;
    } else {
      computedStatus = 'present';
    }

    return {
      id: Number(row.id),
      registration_no: row.registration_no,
      student_name: row.student_name,
      class_name: row.class_name,
      room_id: row.room_id ? Number(row.room_id) : null,
      room_name: row.room_name,
      has_active_gatepass: Boolean(row.has_active_gatepass),
      active_gatepass_token: row.active_gatepass_token || null,
      active_gatepass_reason: row.active_gatepass_reason || null,
      room_submitted: Boolean(row.room_submitted),
      room_attendance_status: row.room_attendance_status || null,
      saved_status: row.saved_status || null,
      status: computedStatus,
      remarks: row.attendance_remarks || (row.has_active_gatepass ? `Active Gate Pass (${row.active_gatepass_token || ''})` : null),
      marked_by_name: row.marked_by_name || null,
      updated_at: row.attendance_updated_at || null,
    };
  });

  const total = students.length;
  const present = students.filter(s => s.status === 'present').length;
  const absent = students.filter(s => s.status === 'absent').length;
  const unmarked = 0;
  const activeGatepasses = students.filter(s => s.has_active_gatepass).length;

  const classOrder = ['Class V', 'Class VI', 'Class VII', 'Class VIII', 'Class IX', 'Class X', 'Class XI Science', 'Class XII Science'];
  const distinctClasses = Array.from(new Set(students.map(s => s.class_name))).sort((a, b) => {
    const ai = classOrder.findIndex(c => a.toLowerCase().startsWith(c.toLowerCase()));
    const bi = classOrder.findIndex(c => b.toLowerCase().startsWith(c.toLowerCase()));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  const distinctRooms = Array.from(new Set(students.map(s => s.room_name).filter(r => r && r !== 'Unassigned'))).sort((a, b) => {
    const an = Number(String(a || '').match(/\d+/)?.[0] || 0);
    const bn = Number(String(b || '').match(/\d+/)?.[0] || 0);
    return an - bn || String(a).localeCompare(String(b));
  });

  res.json({
    success: true,
    date,
    stats: {
      total_eligible: total,
      present,
      absent,
      unmarked,
      active_gatepasses: activeGatepasses,
    },
    classes: distinctClasses,
    rooms: distinctRooms,
    is_daily_submitted: isDailySubmitted,
    submission: dailySubResult.rows[0] || null,
    students,
  });
}));

router.get('/daily/excel', auth, allow('super_admin','admin','office','teacher'), asyncHandler(async (req, res) => {
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  if (!isValidDate(date)) {
    return res.status(400).json({ success: false, message: 'Invalid attendance date' });
  }

  const { class_name, room_name, status: filterStatus } = req.query;

  // Check if daily attendance was submitted
  const dailySubResult = await pool.query(`
    SELECT * FROM daily_attendance_submissions WHERE attendance_date = $1::date
  `, [date]);
  const isDailySubmitted = dailySubResult.rows.length > 0;

  const result = await pool.query(`
    SELECT 
      s.id,
      s.registration_no,
      s.student_name,
      COALESCE(NULLIF(TRIM(s.class_name), ''), 'Unassigned') AS class_name,
      s.room_id,
      COALESCE(r.room_name, 'Unassigned') AS room_name,
      EXISTS (
        SELECT 1 FROM student_gate_passes gp
        WHERE gp.student_id = s.id
          AND gp.status = 'pending'
          AND gp.departure_at::date <= $1::date
          AND (gp.returned_at IS NULL OR gp.returned_at::date > $1::date)
      ) AS has_active_gatepass,
      (
        SELECT gp.token_no FROM student_gate_passes gp
        WHERE gp.student_id = s.id
          AND gp.status = 'pending'
          AND gp.departure_at::date <= $1::date
          AND (gp.returned_at IS NULL OR gp.returned_at::date > $1::date)
        ORDER BY gp.departure_at DESC LIMIT 1
      ) AS active_gatepass_token,
      (
        SELECT gp.reason FROM student_gate_passes gp
        WHERE gp.student_id = s.id
          AND gp.status = 'pending'
          AND gp.departure_at::date <= $1::date
          AND (gp.returned_at IS NULL OR gp.returned_at::date > $1::date)
        ORDER BY gp.departure_at DESC LIMIT 1
      ) AS active_gatepass_reason,
      EXISTS (
        SELECT 1 FROM attendance_submissions sub
        WHERE sub.room_id = s.room_id AND sub.attendance_date = $1::date
      ) AS room_submitted,
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM attendance_submissions sub
          WHERE sub.room_id = s.room_id AND sub.attendance_date = $1::date
        ) THEN COALESCE(a.room_status, a.status)
        ELSE NULL
      END AS room_attendance_status,
      a.status AS saved_status,
      a.remarks AS attendance_remarks,
      a.updated_at AS attendance_updated_at,
      u.full_name AS marked_by_name
    FROM students s
    LEFT JOIN rooms r ON r.id = s.room_id
    LEFT JOIN attendance a ON a.student_id = s.id AND a.attendance_date = $1::date
    LEFT JOIN users u ON u.id = a.marked_by
    WHERE s.is_active = TRUE
    ORDER BY 
      CASE 
        WHEN s.class_name ILIKE 'Class V%' THEN 1
        WHEN s.class_name ILIKE 'Class VI%' THEN 2
        WHEN s.class_name ILIKE 'Class VII%' THEN 3
        WHEN s.class_name ILIKE 'Class VIII%' THEN 4
        WHEN s.class_name ILIKE 'Class IX%' THEN 5
        WHEN s.class_name ILIKE 'Class X%' THEN 6
        WHEN s.class_name ILIKE 'Class XI%' THEN 7
        WHEN s.class_name ILIKE 'Class XII%' THEN 8
        ELSE 9
      END,
      r.room_name ASC NULLS LAST,
      s.registration_no ASC
  `, [date]);

  let students = result.rows.map(row => {
    let computedStatus = 'present';
    if (isDailySubmitted && row.saved_status) {
      computedStatus = row.saved_status;
    } else if (row.has_active_gatepass) {
      computedStatus = 'absent';
    } else if (row.room_attendance_status) {
      computedStatus = row.room_attendance_status;
    } else {
      computedStatus = 'present';
    }

    return {
      id: Number(row.id),
      registration_no: row.registration_no,
      student_name: row.student_name,
      class_name: row.class_name,
      room_id: row.room_id ? Number(row.room_id) : null,
      room_name: row.room_name,
      has_active_gatepass: Boolean(row.has_active_gatepass),
      active_gatepass_token: row.active_gatepass_token || null,
      active_gatepass_reason: row.active_gatepass_reason || null,
      room_submitted: Boolean(row.room_submitted),
      room_attendance_status: row.room_attendance_status || null,
      saved_status: row.saved_status || null,
      status: computedStatus,
      remarks: row.attendance_remarks || (row.has_active_gatepass ? `Active Gate Pass (${row.active_gatepass_token || ''})` : null),
      marked_by_name: row.marked_by_name || null,
      updated_at: row.attendance_updated_at || null,
    };
  });

  // Apply filters if provided
  if (class_name && class_name !== 'all') {
    students = students.filter(s => s.class_name.toLowerCase() === class_name.toLowerCase());
  }
  if (room_name && room_name !== 'all') {
    students = students.filter(s => s.room_name.toLowerCase() === room_name.toLowerCase());
  }
  if (filterStatus && filterStatus !== 'all') {
    students = students.filter(s => s.status.toLowerCase() === filterStatus.toLowerCase());
  }

  const total = students.length;
  const present = students.filter(s => s.status === 'present').length;
  const absent = students.filter(s => s.status === 'absent').length;
  const gpCount = students.filter(s => s.has_active_gatepass).length;
  const presentRate = total > 0 ? ((present / total) * 100).toFixed(1) : '0';

  const [year, month, day] = date.split('-').map(Number);
  const dateObj = new Date(Date.UTC(year, month - 1, day));
  const dateFormatted = dateObj.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Al-Ameen Mission Academy Memari';
  wb.created = new Date();
  const ws = wb.addWorksheet('Daily Attendance', {
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  // Title
  ws.mergeCells('A1:I1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Al - Ameen Mission Academy Memari';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Subtitle
  ws.mergeCells('A2:I2');
  const subCell = ws.getCell('A2');
  subCell.value = `Daily Attendance Report — ${dateFormatted}`;
  subCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF334155' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 22;

  // Filter info & Meta
  ws.mergeCells('A3:I3');
  const metaCell = ws.getCell('A3');
  const filterDesc = [
    class_name && class_name !== 'all' ? `Class: ${class_name}` : null,
    room_name && room_name !== 'all' ? `Room: ${room_name}` : null,
    filterStatus && filterStatus !== 'all' ? `Status: ${filterStatus.toUpperCase()}` : null
  ].filter(Boolean).join(' | ') || 'All Students';
  metaCell.value = `Filters: ${filterDesc}   |   Status: ${isDailySubmitted ? 'Master Attendance Submitted' : 'Live Preview / Draft'}`;
  metaCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).height = 18;

  // Summary Row
  ws.mergeCells('A4:I4');
  const sumCell = ws.getCell('A4');
  sumCell.value = `Total Students: ${total}   |   Present: ${present}   |   Absent: ${absent}   |   Gate Pass: ${gpCount}   |   Attendance Rate: ${presentRate}%`;
  sumCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E293B' } };
  sumCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sumCell.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };
  ws.getRow(4).height = 24;

  // Table Headers (Row 6)
  ws.getRow(5).height = 10;
  const headers = ['#', 'Reg No', 'Student Name', 'Class', 'Room', 'Room Attendance', 'Gate Pass', 'Status', 'Remarks'];
  const headerRow = ws.addRow(headers);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } }
    };
  });

  // Data Rows
  students.forEach((s, idx) => {
    const isPresent = s.status === 'present';
    const row = ws.addRow([
      idx + 1,
      s.registration_no,
      s.student_name,
      s.class_name,
      s.room_name,
      s.room_attendance_status ? (s.room_attendance_status.charAt(0).toUpperCase() + s.room_attendance_status.slice(1)) : '-',
      s.active_gatepass_token ? `Token: ${s.active_gatepass_token}` : '-',
      isPresent ? 'Present' : 'Absent',
      s.remarks || ''
    ]);
    row.height = 20;

    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if ([1, 2, 4, 5, 6, 7, 8].includes(colNumber)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }

      if (colNumber === 8) {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: isPresent ? 'FF166534' : 'FF991B1B' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isPresent ? 'FFDCFCE7' : 'FFFEE2E2' }
        };
      }
    });
  });

  ws.columns = [
    { width: 6 },
    { width: 14 },
    { width: 28 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 25 },
  ];

  const out = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Daily-Attendance-${date}.xlsx"`);
  res.send(Buffer.from(out));
}));

router.get('/monthly/excel', auth, allow('super_admin','admin','office','teacher'), asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ success: false, message: 'Invalid month format (YYYY-MM required)' });
  }

  const { class_name } = req.query;
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthNum = Number(monthStr);

  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const startDate = `${month}-01`;
  const endDate = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  const studentParams = [];
  let studentClassFilter = '';
  if (class_name && class_name !== 'all') {
    studentParams.push(class_name);
    studentClassFilter = `AND LOWER(TRIM(s.class_name)) = LOWER(TRIM($${studentParams.length}))`;
  }

  const studentsRes = await pool.query(`
    SELECT s.id,
           s.registration_no,
           s.student_name,
           COALESCE(NULLIF(TRIM(s.class_name), ''), 'Unassigned') AS class_name,
           COALESCE(r.room_name, 'Unassigned') AS room_name
    FROM students s
    LEFT JOIN rooms r ON r.id = s.room_id
    WHERE s.is_active = TRUE
      ${studentClassFilter}
    ORDER BY 
      CASE 
        WHEN s.class_name ILIKE 'Class V%' THEN 1
        WHEN s.class_name ILIKE 'Class VI%' THEN 2
        WHEN s.class_name ILIKE 'Class VII%' THEN 3
        WHEN s.class_name ILIKE 'Class VIII%' THEN 4
        WHEN s.class_name ILIKE 'Class IX%' THEN 5
        WHEN s.class_name ILIKE 'Class X%' THEN 6
        WHEN s.class_name ILIKE 'Class XI%' THEN 7
        WHEN s.class_name ILIKE 'Class XII%' THEN 8
        ELSE 9
      END,
      r.room_name ASC NULLS LAST,
      s.registration_no ASC
  `, studentParams);
  const students = studentsRes.rows;

  const attParams = [startDate, endDate];
  let attClassFilter = '';
  if (class_name && class_name !== 'all') {
    attParams.push(class_name);
    attClassFilter = `AND LOWER(TRIM(s.class_name)) = LOWER(TRIM($${attParams.length}))`;
  }

  const attRes = await pool.query(`
    SELECT a.student_id,
           to_char(a.attendance_date, 'YYYY-MM-DD') AS att_date,
           EXTRACT(DAY FROM a.attendance_date)::int AS day_num,
           LOWER(TRIM(a.status)) AS status
    FROM attendance a
    JOIN students s ON s.id = a.student_id
    WHERE a.attendance_date >= $1::date AND a.attendance_date <= $2::date
      AND s.is_active = TRUE
      ${attClassFilter}
  `, attParams);

  const statusMap = new Map();
  attRes.rows.forEach(r => {
    statusMap.set(`${r.student_id}_${r.day_num}`, r.status);
  });

  const dailySubsRes = await pool.query(`
    SELECT to_char(attendance_date, 'YYYY-MM-DD') AS att_date,
           EXTRACT(DAY FROM attendance_date)::int AS day_num
    FROM daily_attendance_submissions
    WHERE attendance_date >= $1::date AND attendance_date <= $2::date
  `, [startDate, endDate]);

  const roomSubsRes = await pool.query(`
    SELECT DISTINCT to_char(attendance_date, 'YYYY-MM-DD') AS att_date,
           EXTRACT(DAY FROM attendance_date)::int AS day_num
    FROM attendance_submissions
    WHERE attendance_date >= $1::date AND attendance_date <= $2::date
  `, [startDate, endDate]);

  const activeDaysSet = new Set();
  dailySubsRes.rows.forEach(r => activeDaysSet.add(r.day_num));
  roomSubsRes.rows.forEach(r => activeDaysSet.add(r.day_num));
  attRes.rows.forEach(r => activeDaysSet.add(r.day_num));

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayInfo = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dayDate = new Date(Date.UTC(year, monthNum - 1, d));
    const dayOfWeek = dayDate.getUTCDay();
    dayInfo.push({
      day: d,
      name: dayNames[dayOfWeek],
      isSunday: dayOfWeek === 0,
      hasRecords: activeDaysSet.has(d)
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Al-Ameen Mission Academy Memari';
  wb.created = new Date();

  const monthLabel = new Date(Date.UTC(year, monthNum - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });

  const ws = wb.addWorksheet('Monthly Register', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9
    }
  });

  const totalCols = 5 + daysInMonth + 3;

  // Title
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = 'Al - Ameen Mission Academy Memari';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Subtitle
  ws.mergeCells(2, 1, 2, totalCols);
  const subCell = ws.getCell(2, 1);
  subCell.value = `Monthly Attendance Register — ${monthLabel}`;
  subCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF334155' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 22;

  // Meta
  ws.mergeCells(3, 1, 3, totalCols);
  const metaCell = ws.getCell(3, 1);
  metaCell.value = `Class: ${class_name && class_name !== 'all' ? class_name : 'All Classes'}   |   Total Students: ${students.length}   |   Recorded Days: ${activeDaysSet.size} of ${daysInMonth}`;
  metaCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).height = 18;

  // Header Row 4
  const headerVals = [
    'Sl',
    'Reg No',
    'Student Name',
    'Class',
    'Room',
    ...dayInfo.map(di => `${String(di.day).padStart(2, '0')}\n${di.name}`),
    'Total\nP',
    'Total\nA',
    'Att\n%'
  ];

  const headerRow = ws.addRow(headerVals);
  headerRow.height = 30;
  headerRow.eachCell((cell, colNum) => {
    const isDayCol = colNum > 5 && colNum <= 5 + daysInMonth;
    const dayIdx = colNum - 6;
    const di = isDayCol ? dayInfo[dayIdx] : null;

    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } }
    };

    if (di && di.isSunday) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    }
  });

  const dailyPresentCount = new Array(daysInMonth).fill(0);
  const dailyAbsentCount = new Array(daysInMonth).fill(0);

  students.forEach((s, idx) => {
    let studentP = 0;
    let studentA = 0;

    const rowDays = dayInfo.map((di, dIdx) => {
      const key = `${s.id}_${di.day}`;
      const rec = statusMap.get(key);

      if (rec === 'present') {
        studentP++;
        dailyPresentCount[dIdx]++;
        return 'P';
      } else if (rec === 'absent') {
        studentA++;
        dailyAbsentCount[dIdx]++;
        return 'A';
      } else if (di.hasRecords) {
        studentP++;
        dailyPresentCount[dIdx]++;
        return 'P';
      } else {
        return '-';
      }
    });

    const totalDaysRecorded = studentP + studentA;
    const attPct = totalDaysRecorded > 0 ? `${((studentP / totalDaysRecorded) * 100).toFixed(0)}%` : '-';

    const rowData = [
      idx + 1,
      s.registration_no,
      s.student_name,
      s.class_name,
      s.room_name,
      ...rowDays,
      studentP,
      studentA,
      attPct
    ];

    const studentRow = ws.addRow(rowData);
    studentRow.height = 19;

    studentRow.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 9 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (colNum === 3) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }

      if (colNum > 5 && colNum <= 5 + daysInMonth) {
        const dIdx = colNum - 6;
        const di = dayInfo[dIdx];
        const val = cell.value;

        if (val === 'P') {
          cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF166534' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
        } else if (val === 'A') {
          cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF991B1B' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        } else if (di.isSunday) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF94A3B8' } };
        } else {
          cell.font = { name: 'Calibri', size: 9, color: { argb: 'FFCBD5E1' } };
        }
      }

      if (colNum === 5 + daysInMonth + 1) {
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF166534' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
      }
      if (colNum === 5 + daysInMonth + 2) {
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF991B1B' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
      }
      if (colNum === 5 + daysInMonth + 3) {
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF1E293B' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
  });

  // Footer: Total Present
  const totalPresentRowVals = [
    '',
    '',
    'Total Present',
    '',
    '',
    ...dailyPresentCount.map((p, dIdx) => (dayInfo[dIdx].hasRecords ? p : '-')),
    dailyPresentCount.reduce((a, b) => a + b, 0),
    '',
    ''
  ];
  const footPresentRow = ws.addRow(totalPresentRowVals);
  footPresentRow.height = 20;
  ws.mergeCells(footPresentRow.number, 1, footPresentRow.number, 5);
  footPresentRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
  footPresentRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF166534' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF1E293B' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  // Footer: Total Absent
  const totalAbsentRowVals = [
    '',
    '',
    'Total Absent',
    '',
    '',
    ...dailyAbsentCount.map((a, dIdx) => (dayInfo[dIdx].hasRecords ? a : '-')),
    '',
    dailyAbsentCount.reduce((a, b) => a + b, 0),
    ''
  ];
  const footAbsentRow = ws.addRow(totalAbsentRowVals);
  footAbsentRow.height = 20;
  ws.mergeCells(footAbsentRow.number, 1, footAbsentRow.number, 5);
  footAbsentRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
  footAbsentRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF991B1B' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  const colWidths = [
    { width: 5 },
    { width: 12 },
    { width: 22 },
    { width: 12 },
    { width: 10 },
    ...dayInfo.map(() => ({ width: 4.5 })),
    { width: 7 },
    { width: 7 },
    { width: 8 },
  ];
  ws.columns = colWidths;

  const out = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Monthly-Attendance-${month}.xlsx"`);
  res.send(Buffer.from(out));
}));

router.post('/daily/fetch-gatepasses', auth, allow('super_admin','admin','office','teacher'), asyncHandler(async (req, res) => {
  const date = String(req.body?.date || req.query?.date || new Date().toISOString().slice(0, 10));
  if (!isValidDate(date)) {
    return res.status(400).json({ success: false, message: 'Invalid attendance date' });
  }

  const result = await pool.query(`
    SELECT gp.id AS gate_pass_id, gp.token_no, gp.departure_at, gp.expected_return_at,
           s.id AS student_id, s.registration_no, s.student_name, s.class_name,
           r.room_name, s.room_id
    FROM student_gate_passes gp
    JOIN students s ON s.id = gp.student_id
    LEFT JOIN rooms r ON r.id = s.room_id
    WHERE gp.status = 'pending'
      AND gp.departure_at::date <= $1::date
      AND (gp.returned_at IS NULL OR gp.returned_at::date > $1::date)
    ORDER BY s.registration_no ASC
  `, [date]);

  res.json({
    success: true,
    date,
    count: result.rows.length,
    gate_passes: result.rows,
  });
}));

router.post('/daily/submit', auth, allow('super_admin','admin','office','teacher'), asyncHandler(async (req, res) => {
  const { attendance_date: attendanceDate, entries } = req.body || {};
  if (!isValidDate(attendanceDate) || !Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ success: false, message: 'Valid attendance date and non-empty entries are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const studentMapResult = await client.query('SELECT id, room_id FROM students WHERE is_active=TRUE');
    const studentRoomMap = new Map();
    studentMapResult.rows.forEach(r => studentRoomMap.set(Number(r.id), r.room_id ? Number(r.room_id) : null));

    const affectedRooms = new Set();

    for (const entry of entries) {
      const studentId = Number(entry.student_id);
      const status = entry.status === 'absent' ? 'absent' : 'present';
      const remarks = entry.remarks || null;
      const roomId = entry.room_id ? Number(entry.room_id) : (studentRoomMap.get(studentId) || null);

      if (roomId) affectedRooms.add(roomId);

      await client.query(`
        INSERT INTO attendance(student_id, room_id, attendance_date, status, remarks, marked_by)
        VALUES($1, $2, $3, $4, $5, $6)
        ON CONFLICT(student_id, attendance_date)
        DO UPDATE SET room_id=COALESCE(EXCLUDED.room_id, attendance.room_id),
                      status=EXCLUDED.status,
                      remarks=COALESCE(EXCLUDED.remarks, attendance.remarks),
                      marked_by=EXCLUDED.marked_by,
                      updated_at=NOW()
      `, [studentId, roomId, attendanceDate, status, remarks, req.user.userId]);
    }

    const presentCount = entries.filter((e) => e.status === 'present').length;
    const absentCount = entries.filter((e) => e.status === 'absent').length;

    const dailySubRes = await client.query(`
      INSERT INTO daily_attendance_submissions(attendance_date, submitted_by, total_students, present_count, absent_count, updated_at)
      VALUES($1, $2, $3, $4, $5, NOW())
      ON CONFLICT(attendance_date)
      DO UPDATE SET submitted_by=EXCLUDED.submitted_by,
                    total_students=EXCLUDED.total_students,
                    present_count=EXCLUDED.present_count,
                    absent_count=EXCLUDED.absent_count,
                    updated_at=NOW()
      RETURNING *
    `, [attendanceDate, req.user.userId, entries.length, presentCount, absentCount]);

    const firstSub = await client.query('SELECT id FROM attendance_submissions WHERE attendance_date=$1::date LIMIT 1', [attendanceDate]);
    const subId = firstSub.rowCount ? firstSub.rows[0].id : (dailySubRes.rows[0]?.id || 1);
    await client.query(`
      INSERT INTO attendance_change_logs(submission_id, changed_by, action, snapshot)
      VALUES($1, $2, 'updated', $3::jsonb)
    `, [subId, req.user.userId, JSON.stringify({ count: entries.length, date: attendanceDate, mode: 'daily_attendance' })]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Daily attendance submitted successfully',
      date: attendanceDate,
      count: entries.length,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.delete('/submissions/:id', auth, allow('super_admin','admin'), asyncHandler(async(req,res)=>{const client=await pool.connect();try{await client.query('BEGIN');const sub=(await client.query('SELECT * FROM attendance_submissions WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!sub){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Attendance submission not found'});}await client.query('DELETE FROM attendance WHERE room_id=$1 AND attendance_date=$2',[sub.room_id,sub.attendance_date]);await client.query('DELETE FROM attendance_change_logs WHERE submission_id=$1',[sub.id]);await client.query('DELETE FROM attendance_submissions WHERE id=$1',[sub.id]);await client.query('COMMIT');res.json({success:true,message:'Attendance deleted'});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}));

module.exports = router;
