const express = require('express');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const router = express.Router();

router.get('/accessible', auth, allow('super_admin','admin','teacher'), asyncHandler(async (req, res) => {
  const params = [];
  let where = 'WHERE r.is_active=TRUE';

  if (req.user.role === 'teacher') {
    params.push(req.user.userId);
    where += ` AND EXISTS (
      SELECT 1
      FROM teacher_room_assignments tra
      JOIN teachers t ON t.id=tra.teacher_id
      WHERE tra.room_id=r.id AND tra.is_active=TRUE AND t.user_id=$1
    )`;
  }

  const result = await pool.query(
    `SELECT r.* FROM rooms r ${where} ORDER BY r.room_name`,
    params
  );
  res.json({ success: true, rooms: result.rows });
}));

router.get('/assignments', auth, allow('super_admin','admin'), asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT tra.id, tra.teacher_id, tra.room_id, tra.assigned_date,
           t.name AS teacher_name, t.staff_id, t.user_id,
           r.room_name
    FROM teacher_room_assignments tra
    JOIN teachers t ON t.id=tra.teacher_id
    JOIN rooms r ON r.id=tra.room_id
    WHERE tra.is_active=TRUE
    ORDER BY r.room_name, t.name
  `);
  res.json({ success: true, assignments: result.rows });
}));

router.post('/assignments', auth, allow('super_admin','admin'), asyncHandler(async (req, res) => {
  const teacherId = Number(req.body?.teacher_id);
  const roomId = Number(req.body?.room_id);

  if (!Number.isInteger(teacherId) || !Number.isInteger(roomId)) {
    return res.status(400).json({ success: false, message: 'Teacher and room are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teacher = await client.query(`
      SELECT t.id, t.user_id, u.is_active, u.role
      FROM teachers t
      LEFT JOIN users u ON u.id=t.user_id
      WHERE t.id=$1
    `, [teacherId]);
    if (!teacher.rowCount || !teacher.rows[0].user_id || !teacher.rows[0].is_active || teacher.rows[0].role !== 'teacher') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'The teacher needs an active login account before room assignment' });
    }

    const room = await client.query('SELECT id FROM rooms WHERE id=$1 AND is_active=TRUE', [roomId]);
    if (!room.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Active room not found' });
    }

    await client.query(
      'UPDATE teacher_room_assignments SET is_active=FALSE WHERE is_active=TRUE AND (teacher_id=$1 OR room_id=$2)',
      [teacherId, roomId]
    );
    const result = await client.query(`
      INSERT INTO teacher_room_assignments(teacher_id,room_id,assigned_date,is_active)
      VALUES($1,$2,CURRENT_DATE,TRUE)
      ON CONFLICT(teacher_id,room_id)
      DO UPDATE SET assigned_date=CURRENT_DATE,is_active=TRUE
      RETURNING *
    `, [teacherId, roomId]);

    await client.query('COMMIT');
    res.status(201).json({ success: true, assignment: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.delete('/assignments/:id', auth, allow('super_admin','admin'), asyncHandler(async (req, res) => {
  const result = await pool.query(
    'UPDATE teacher_room_assignments SET is_active=FALSE WHERE id=$1 RETURNING id',
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ success: false, message: 'Assignment not found' });
  res.json({ success: true });
}));

router.get('/', auth, asyncHandler(async (req, res) => {
  const r = await pool.query('SELECT * FROM rooms ORDER BY room_name');
  res.json({ success: true, rooms: r.rows });
}));

router.post('/', auth, allow('super_admin','admin'), asyncHandler(async (req, res) => {
  const { room_name, description = null } = req.body;
  const r = await pool.query(
    'INSERT INTO rooms(room_name, description) VALUES($1,$2) RETURNING *',
    [room_name, description]
  );
  res.status(201).json({ success: true, room: r.rows[0] });
}));

router.put('/:id', auth, allow('super_admin','admin'), asyncHandler(async (req, res) => {
  const { room_name, description = null, is_active = true } = req.body;
  const r = await pool.query(
    `UPDATE rooms SET room_name=$1, description=$2, is_active=$3 WHERE id=$4 RETURNING *`,
    [room_name, description, is_active, req.params.id]
  );
  res.json({ success: true, room: r.rows[0] });
}));

router.delete('/:id', auth, allow('super_admin'), asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM rooms WHERE id=$1', [req.params.id]);
  res.json({ success: true });
}));

module.exports = router;
