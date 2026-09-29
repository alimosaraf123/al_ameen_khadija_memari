const express = require('express');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const router = express.Router();

router.get('/registration/:registrationNo', auth, allow('super_admin','admin','teacher'), asyncHandler(async (req,res)=>{
  const student = await pool.query(`
    SELECT s.id,s.registration_no,s.student_name,s.class_name,r.room_name
    FROM students s LEFT JOIN rooms r ON r.id=s.room_id
    WHERE LOWER(s.registration_no)=LOWER($1) AND s.is_active=TRUE
  `, [String(req.params.registrationNo).trim()]);
  if (!student.rowCount) return res.status(404).json({success:false,message:'Student not found'});
  const records = await pool.query(`
    SELECT i.*,u.full_name AS reported_by_name
    FROM illness_records i LEFT JOIN users u ON u.id=i.reported_by
    WHERE i.student_id=$1 ORDER BY i.record_date DESC,i.created_at DESC
  `, [student.rows[0].id]);
  res.json({success:true,student:student.rows[0],records:records.rows});
}));

router.get('/', auth, allow('super_admin','admin','teacher'), asyncHandler(async (req,res)=>{
  const result = await pool.query(`
    SELECT i.*,s.registration_no,s.student_name,s.class_name,r.room_name,u.full_name AS reported_by_name
    FROM illness_records i
    JOIN students s ON s.id=i.student_id
    LEFT JOIN rooms r ON r.id=s.room_id
    LEFT JOIN users u ON u.id=i.reported_by
    ORDER BY i.created_at DESC LIMIT 100
  `);
  res.json({success:true,records:result.rows});
}));

router.post('/', auth, allow('super_admin','admin','teacher'), asyncHandler(async (req,res)=>{
  const registrationNo = String(req.body?.registration_no || '').trim();
  const details = String(req.body?.illness_details || '').trim();
  if (!registrationNo || !details) return res.status(400).json({success:false,message:'Registration number and illness details are required'});
  const student = await pool.query('SELECT id FROM students WHERE LOWER(registration_no)=LOWER($1) AND is_active=TRUE',[registrationNo]);
  if (!student.rowCount) return res.status(404).json({success:false,message:'Student not found'});
  const result = await pool.query(`
    INSERT INTO illness_records(student_id,record_date,illness_details,action_taken,reported_by)
    VALUES($1,COALESCE($2,CURRENT_DATE),$3,$4,$5) RETURNING *
  `,[student.rows[0].id,req.body.record_date||null,details,req.body.action_taken||null,req.user.userId]);
  const notice=await pool.query(`INSERT INTO notices(title,notice_text,notice_type,published_by) VALUES('Student illness / problem',$1,'urgent',$2) RETURNING id`,[`Reg. ${registrationNo}: ${details}`,req.user.userId]);
  await pool.query(`INSERT INTO notice_targets(notice_id,target_type,target_value) VALUES($1,'role','admin')`,[notice.rows[0].id]);
  res.status(201).json({success:true,record:result.rows[0],notification_sent:true});
}));

module.exports = router;
