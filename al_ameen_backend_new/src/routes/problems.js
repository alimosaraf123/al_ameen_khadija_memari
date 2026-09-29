const express = require('express');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
const PROBLEM_TYPES = ['Light problem', 'Fan problem', 'Water problem', 'Electrical problem', 'Other'];

function normalizeRoom(value) {
  return String(value || '').trim().toLowerCase().replace(/^room\s+/, '');
}

async function findRoom(roomNumber) {
  const rooms = (await pool.query('SELECT id,room_name FROM rooms WHERE is_active=TRUE')).rows;
  const wanted = normalizeRoom(roomNumber);
  return rooms.find((room) => normalizeRoom(room.room_name) === wanted) || null;
}

async function teacherCanAccess(userId, roomId) {
  const result = await pool.query(`
    SELECT 1 FROM teacher_room_assignments tra
    JOIN teachers t ON t.id=tra.teacher_id
    WHERE tra.room_id=$1 AND tra.is_active=TRUE AND t.user_id=$2
  `, [roomId, userId]);
  return result.rowCount > 0;
}

router.get('/', auth, allow('super_admin','admin','teacher'), asyncHandler(async (req, res) => {
  const params = [];
  let where = '';
  if (req.user.role === 'teacher') {
    params.push(req.user.userId);
    where = `WHERE EXISTS (
      SELECT 1 FROM teacher_room_assignments tra
      JOIN teachers t ON t.id=tra.teacher_id
      WHERE tra.room_id=p.room_id AND tra.is_active=TRUE AND t.user_id=$1
    )`;
  }
  const result = await pool.query(`
    SELECT p.*,r.room_name,u.full_name AS reported_by_name
    FROM room_problem_reports p
    LEFT JOIN rooms r ON r.id=p.room_id
    LEFT JOIN users u ON u.id=p.reported_by
    ${where}
    ORDER BY CASE p.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
             p.reported_at DESC
  `, params);
  res.json({ success: true, problems: result.rows });
}));

router.post('/', auth, allow('super_admin','admin','teacher'), asyncHandler(async (req, res) => {
  const room = await findRoom(req.body?.room_number);
  const problemType = String(req.body?.problem_type || '').trim();
  const details = String(req.body?.details || '').trim();

  if (!room) return res.status(400).json({ success: false, message: 'Please select a valid room' });
  if (!PROBLEM_TYPES.includes(problemType)) return res.status(400).json({ success: false, message: 'Please select a valid problem type' });
  if (req.user.role === 'teacher' && !(await teacherCanAccess(req.user.userId, room.id))) {
    return res.status(403).json({ success: false, message: 'This room is not assigned to you' });
  }

  const result = await pool.query(`
    INSERT INTO room_problem_reports(room_id,problem_type,details,reported_by)
    VALUES($1,$2,$3,$4) RETURNING *
  `, [room.id, problemType, details || null, req.user.userId]);
  res.status(201).json({ success: true, problem: result.rows[0] });
}));

router.patch('/:id/status', auth, allow('super_admin','admin'), asyncHandler(async (req, res) => {
  const incoming = String(req.body?.status || '');
  const status = incoming === 'pending' ? 'open' : incoming;
  if (!['open', 'in_progress', 'resolved'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid problem status' });
  }
  const result = await pool.query(`
    UPDATE room_problem_reports
    SET status=$1::varchar,resolved_at=CASE WHEN $1::varchar='resolved' THEN NOW() ELSE NULL END
    WHERE id=$2 RETURNING *
  `, [status, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ success: false, message: 'Problem report not found' });
  res.json({ success: true, problem: result.rows[0] });
}));

module.exports = router;
