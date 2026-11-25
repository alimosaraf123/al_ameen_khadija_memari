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


router.put('/assignments/:id', auth, allow('super_admin','admin'), asyncHandler(async (req,res) => {
  const assignmentId=Number(req.params.id),teacherId=Number(req.body?.teacher_id),roomId=Number(req.body?.room_id);
  if(!Number.isInteger(teacherId)||!Number.isInteger(roomId))return res.status(400).json({success:false,message:'Teacher and room are required'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const current=await client.query('SELECT id FROM teacher_room_assignments WHERE id=$1 AND is_active=TRUE FOR UPDATE',[assignmentId]);
    if(!current.rowCount){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Assignment not found'});}
    const teacher=await client.query("SELECT t.id FROM teachers t JOIN users u ON u.id=t.user_id WHERE t.id=$1 AND t.is_active=TRUE AND u.is_active=TRUE AND u.role='teacher'",[teacherId]);
    const room=await client.query('SELECT id FROM rooms WHERE id=$1 AND is_active=TRUE',[roomId]);
    if(!teacher.rowCount||!room.rowCount){await client.query('ROLLBACK');return res.status(400).json({success:false,message:'Choose an active teacher and room'});}
    await client.query('UPDATE teacher_room_assignments SET is_active=FALSE WHERE is_active=TRUE AND (id=$1 OR teacher_id=$2 OR room_id=$3)',[assignmentId,teacherId,roomId]);
    const result=await client.query(
      'INSERT INTO teacher_room_assignments(teacher_id,room_id,assigned_date,is_active) VALUES($1,$2,CURRENT_DATE,TRUE) ON CONFLICT(teacher_id,room_id) DO UPDATE SET is_active=TRUE RETURNING *',
      [teacherId,roomId]
    );
    await client.query('COMMIT');res.json({success:true,assignment:result.rows[0]});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
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
  const r = await pool.query(`
    SELECT r.*, COUNT(s.id)::int AS student_count
    FROM rooms r
    LEFT JOIN students s ON s.room_id = r.id AND s.is_active = TRUE
    GROUP BY r.id
    ORDER BY r.room_name
  `);
  res.json({ success: true, rooms: r.rows });
}));

router.get('/students', auth, allow('super_admin','admin','office'), asyncHandler(async (req, res) => {
  const { class_name, room_id, q } = req.query;
  const conditions = ['s.is_active = TRUE'];
  const values = [];

  if (class_name && class_name !== 'all') {
    values.push(class_name);
    conditions.push(`s.class_name = $${values.length}`);
  }

  if (room_id) {
    if (room_id === 'unassigned') {
      conditions.push('s.room_id IS NULL');
    } else if (room_id !== 'all') {
      values.push(Number(room_id));
      conditions.push(`s.room_id = $${values.length}`);
    }
  }

  if (q) {
    values.push(`%${String(q).trim()}%`);
    conditions.push(`(s.student_name ILIKE $${values.length} OR s.registration_no ILIKE $${values.length} OR CAST(s.roll_no AS TEXT) ILIKE $${values.length})`);
  }

  const query = `
    SELECT s.id, s.registration_no, s.student_name, s.class_name, s.roll_no, s.gender, s.student_type,
           s.room_id, r.room_name
    FROM students s
    LEFT JOIN rooms r ON r.id = s.room_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY s.class_name, s.roll_no, s.student_name
  `;

  const result = await pool.query(query, values);
  res.json({ success: true, students: result.rows });
}));

router.post('/update-student-room', auth, allow('super_admin','admin','office'), asyncHandler(async (req, res) => {
  const studentId = Number(req.body?.student_id);
  const roomId = req.body?.room_id ? Number(req.body.room_id) : null;

  if (!studentId) {
    return res.status(400).json({ success: false, message: 'Student ID is required' });
  }

  if (roomId) {
    const roomCheck = await pool.query('SELECT id, room_name FROM rooms WHERE id = $1', [roomId]);
    if (!roomCheck.rowCount) {
      return res.status(400).json({ success: false, message: 'Selected room not found' });
    }
  }

  const result = await pool.query(`
    UPDATE students
    SET room_id = $1, updated_at = NOW()
    WHERE id = $2 AND is_active = TRUE
    RETURNING id, registration_no, student_name, class_name, roll_no, room_id
  `, [roomId, studentId]);

  if (!result.rowCount) {
    return res.status(404).json({ success: false, message: 'Active student not found' });
  }

  res.json({ success: true, student: result.rows[0], message: 'Room updated successfully' });
}));

router.post('/bulk-update-student-rooms', auth, allow('super_admin','admin','office'), asyncHandler(async (req, res) => {
  const studentIds = Array.isArray(req.body?.student_ids) ? req.body.student_ids.map(Number).filter(Boolean) : [];
  const roomId = req.body?.room_id ? Number(req.body.room_id) : null;

  if (!studentIds.length) {
    return res.status(400).json({ success: false, message: 'At least one student must be selected' });
  }

  let roomName = 'Unassigned';
  if (roomId) {
    const roomCheck = await pool.query('SELECT id, room_name FROM rooms WHERE id = $1', [roomId]);
    if (!roomCheck.rowCount) {
      return res.status(400).json({ success: false, message: 'Selected room not found' });
    }
    roomName = roomCheck.rows[0].room_name;
  }

  const result = await pool.query(`
    UPDATE students
    SET room_id = $1, updated_at = NOW()
    WHERE id = ANY($2::bigint[]) AND is_active = TRUE
    RETURNING id
  `, [roomId, studentIds]);

  res.json({
    success: true,
    updated_count: result.rowCount,
    message: `${result.rowCount} student(s) successfully assigned to Room ${roomName}`,
  });
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

router.delete('/:id', auth, allow('super_admin','admin'), (req,res) => res.status(405).json({success:false,message:'Room deletion is disabled. Edit or deactivate the room instead.'}));

module.exports = router;
