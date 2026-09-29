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
    SELECT b.*,u.full_name AS reported_by_name
    FROM student_behavior b LEFT JOIN users u ON u.id=b.reported_by
    WHERE b.student_id=$1 ORDER BY b.record_date DESC,b.created_at DESC
  `, [student.rows[0].id]);
  res.json({success:true,student:student.rows[0],records:records.rows});
}));

router.get('/student/:id', auth, allow('super_admin','admin','teacher'), asyncHandler(async (req,res)=>{
  const result = await pool.query(`SELECT b.*,u.full_name AS reported_by_name FROM student_behavior b LEFT JOIN users u ON u.id=b.reported_by WHERE student_id=$1 ORDER BY record_date DESC,created_at DESC`,[req.params.id]);
  res.json({success:true,records:result.rows});
}));

router.post('/', auth, allow('super_admin','admin','teacher'), asyncHandler(async (req,res)=>{
  const body = req.body || {};
  if (!Number.isInteger(Number(body.student_id)) || !String(body.details || '').trim()) {
    return res.status(400).json({success:false,message:'Student and behaviour details are required'});
  }
  const result = await pool.query(`
    INSERT INTO student_behavior(student_id,record_date,behavior_type,details,action_taken,reported_by,guardian_visible)
    VALUES($1,COALESCE($2,CURRENT_DATE),$3,$4,$5,$6,$7) RETURNING *
  `,[body.student_id,body.record_date||null,body.behavior_type||null,String(body.details).trim(),body.action_taken||null,req.user.userId,!!body.guardian_visible]);
  res.status(201).json({success:true,record:result.rows[0]});
}));

module.exports = router;
