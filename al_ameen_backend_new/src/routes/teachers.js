const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const router = express.Router();

router.get('/', auth, allow('super_admin','admin'), asyncHandler(async (req,res)=>{
  const r=await pool.query(`SELECT t.*, u.login_id, u.full_name, u.is_active AS user_active FROM teachers t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.name`);
  res.json({success:true, teachers:r.rows});
}));

router.post('/', auth, allow('super_admin','admin'), asyncHandler(async (req,res)=>{
  const b=req.body;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    let userId=null;
    if (b.login_id && b.password) {
      const hash=await bcrypt.hash(b.password,12);
      const u=await client.query(`INSERT INTO users(login_id,password_hash,full_name,role) VALUES($1,$2,$3,'teacher') RETURNING id`,[b.login_id,hash,b.name]);
      userId=u.rows[0].id;
    }
    const t=await client.query(`INSERT INTO teachers(user_id,staff_id,name,designation,subject,mobile,email,address,date_of_birth,joining_date,qualification,photo_url)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [userId,b.staff_id,b.name,b.designation||null,b.subject||null,b.mobile||null,b.email||null,b.address||null,b.date_of_birth||null,b.joining_date||null,b.qualification||null,b.photo_url||null]);
    await client.query('COMMIT');
    res.status(201).json({success:true, teacher:t.rows[0]});
  } catch(e){await client.query('ROLLBACK'); throw e;} finally {client.release();}
}));

module.exports=router;
