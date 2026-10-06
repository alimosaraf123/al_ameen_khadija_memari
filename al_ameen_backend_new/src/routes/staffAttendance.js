const express = require('express');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const router = express.Router();
let ready;
function schema() {
  if (!ready) ready = pool.query(`CREATE TABLE IF NOT EXISTS staff_attendance (
    teacher_id INTEGER REFERENCES teachers(id), attendance_date DATE NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Present','Absent','Late','Leave')),
    marked_by INTEGER REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(teacher_id,attendance_date))`).catch(error => { ready = null; throw error; });
  return ready;
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
router.use(auth, allow('super_admin','admin'));
router.get('/', asyncHandler(async(req,res) => {
  if (!validDate(req.query.date)) return res.status(400).json({message:'Enter a valid date (YYYY-MM-DD).'});
  await schema();
  const result = await pool.query(`SELECT t.id,t.staff_id,t.name,a.status FROM teachers t
    LEFT JOIN staff_attendance a ON a.teacher_id=t.id AND a.attendance_date=$1 ORDER BY t.name,t.id`, [req.query.date]);
  res.json({success:true,staff:result.rows});
}));
router.post('/', asyncHandler(async(req,res) => {
  const {date,entries} = req.body || {};
  if (!validDate(date) || !Array.isArray(entries) || !entries.length || entries.some(e => !e || !Number.isInteger(e.id) || !['Present','Absent','Late','Leave'].includes(e.status)) || new Set(entries.map(e=>e.id)).size !== entries.length)
    return res.status(400).json({message:'Choose a valid date and a status for each staff member.'});
  await schema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const staff = await client.query('SELECT id FROM teachers WHERE id=ANY($1::int[])', [entries.map(e=>e.id)]);
    if (staff.rowCount !== entries.length) { await client.query('ROLLBACK'); return res.status(400).json({message:'Staff list changed. Reload attendance.'}); }
    for (const entry of entries) await client.query(`INSERT INTO staff_attendance(teacher_id,attendance_date,status,marked_by)
      VALUES($1,$2,$3,$4) ON CONFLICT(teacher_id,attendance_date) DO UPDATE SET status=EXCLUDED.status,marked_by=EXCLUDED.marked_by,updated_at=NOW()`, [entry.id,date,entry.status,req.user.userId]);
    await client.query('COMMIT');
    res.json({success:true,message:'Attendance saved.'});
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}));
router.get('/monthly', asyncHandler(async(req,res) => {
  const month = req.query.month;
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !validDate(month+'-01')) return res.status(400).json({message:'Enter a valid month (YYYY-MM).'});
  await schema();
  const result = await pool.query(`SELECT t.id,t.staff_id,t.name,
    COUNT(*) FILTER(WHERE a.status='Present')::int AS present,
    COUNT(*) FILTER(WHERE a.status='Absent')::int AS absent,
    COUNT(*) FILTER(WHERE a.status='Late')::int AS late,
    COUNT(*) FILTER(WHERE a.status='Leave')::int AS leave,
    COUNT(a.teacher_id)::int AS recorded
    FROM teachers t LEFT JOIN staff_attendance a ON a.teacher_id=t.id
    AND a.attendance_date >= $1::date AND a.attendance_date < $1::date + INTERVAL '1 month'
    GROUP BY t.id,t.staff_id,t.name ORDER BY t.name,t.id`, [month+'-01']);
  res.json({success:true,staff:result.rows});
}));
module.exports = router;
