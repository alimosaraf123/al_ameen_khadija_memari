const express = require('express');
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
    SELECT sub.*, submitted.full_name AS submitted_by_name,
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
        INSERT INTO attendance(student_id,room_id,attendance_date,status,remarks,marked_by)
        VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(student_id,attendance_date)
        DO UPDATE SET room_id=EXCLUDED.room_id,status=EXCLUDED.status,
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
    if (row.saved_status) {
      computedStatus = row.saved_status;
    } else if (row.has_active_gatepass) {
      computedStatus = 'absent';
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

  const subs = await pool.query(`
    SELECT sub.*, u.full_name AS submitted_by_name, up.full_name AS updated_by_name
    FROM attendance_submissions sub
    LEFT JOIN users u ON u.id = sub.submitted_by
    LEFT JOIN users up ON up.id = sub.last_updated_by
    WHERE sub.attendance_date = $1::date
    ORDER BY sub.updated_at DESC LIMIT 1
  `, [date]);

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
    submission: subs.rows[0] || null,
    students,
  });
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
        DO UPDATE SET room_id=EXCLUDED.room_id, status=EXCLUDED.status,
                      remarks=EXCLUDED.remarks, marked_by=EXCLUDED.marked_by, updated_at=NOW()
      `, [studentId, roomId, attendanceDate, status, remarks, req.user.userId]);
    }

    for (const roomId of affectedRooms) {
      await client.query(`
        INSERT INTO attendance_submissions(room_id, attendance_date, submitted_by, last_updated_by)
        VALUES($1, $2, $3, $3)
        ON CONFLICT(room_id, attendance_date)
        DO UPDATE SET last_updated_by=EXCLUDED.last_updated_by, updated_at=NOW()
      `, [roomId, attendanceDate, req.user.userId]);
    }

    const firstSub = await client.query('SELECT id FROM attendance_submissions WHERE attendance_date=$1::date LIMIT 1', [attendanceDate]);
    if (firstSub.rowCount) {
      await client.query(`
        INSERT INTO attendance_change_logs(submission_id, changed_by, action, snapshot)
        VALUES($1, $2, 'updated', $3::jsonb)
      `, [firstSub.rows[0].id, req.user.userId, JSON.stringify({ count: entries.length, date: attendanceDate, mode: 'daily_attendance' })]);
    }

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
