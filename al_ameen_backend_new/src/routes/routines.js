const express=require('express');const pool=require('../db');const {auth,allow}=require('../middleware/auth');const asyncHandler=require('../utils/asyncHandler');const router=express.Router();
router.get('/',auth,asyncHandler(async(req,res)=>{const r=await pool.query(`SELECT * FROM routines WHERE is_active=TRUE ORDER BY published_at DESC`);res.json({success:true,routines:r.rows});}));
router.post('/',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{const b=req.body;const r=await pool.query(`INSERT INTO routines(title,routine_date,routine_text,file_url,published_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[b.title||null,b.routine_date||null,b.routine_text||null,b.file_url||null,req.user.userId]);res.status(201).json({success:true,routine:r.rows[0]});}));
module.exports=router;
