const express = require('express');
const multer=require('multer');const sharp=require('sharp');const fs=require('fs/promises');const path=require('path');const {randomUUID}=require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const router = express.Router();

function firstNameLogin(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

router.get('/me', auth, allow('teacher'), asyncHandler(async(req,res)=>{const result=await pool.query(`SELECT t.*,u.full_name,u.login_id FROM teachers t JOIN users u ON u.id=t.user_id WHERE t.user_id=$1 LIMIT 1`,[req.user.userId]);if(!result.rowCount)return res.status(404).json({success:false,message:'Teacher profile not found'});res.json({success:true,teacher:result.rows[0]});}));

router.get('/', auth, allow('super_admin','admin'), asyncHandler(async (req,res)=>{
  const result = await pool.query(`
    SELECT t.*, u.login_id, u.full_name, u.is_active AS user_active,
      COALESCE((
        SELECT json_agg(DISTINCT subject_name)
        FROM (
          SELECT trim(s.subject_name) AS subject_name
          FROM terminal_exam_subjects tes
          JOIN subjects s ON s.id=tes.subject_id
          WHERE tes.teacher_id=t.id
          UNION
          SELECT trim(value) AS subject_name
          FROM regexp_split_to_table(COALESCE(t.subject,''), '[,;/]+') value
          WHERE trim(value)<>''
        ) assigned
      ), '[]'::json) AS assigned_subjects
    FROM teachers t
    LEFT JOIN users u ON u.id=t.user_id
    ORDER BY t.name
  `);
  res.json({success:true, teachers:result.rows});
}));

router.post('/', auth, allow('super_admin','admin'), asyncHandler(async (req,res)=>{
  const body = req.body || {};
  const staffId = String(body.staff_id || '').trim();
  const name = String(body.name || '').trim();
  if (!staffId || !name) return res.status(400).json({success:false,message:'Staff ID and name are required'});

  const requestedLogin = String(body.login_id || '').trim().toLowerCase();
  const baseLogin = requestedLogin || firstNameLogin(name);
  if (!baseLogin) return res.status(400).json({success:false,message:'A valid User ID could not be created from the name'});

  let loginId = baseLogin;
  const existingLogin = await pool.query('SELECT id FROM users WHERE login_id=$1', [loginId]);
  if (existingLogin.rowCount) {
    if (requestedLogin) return res.status(409).json({success:false,message:'This User ID is already in use'});
    loginId = `${baseLogin}${staffId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
    const suffixedLogin = await pool.query('SELECT id FROM users WHERE login_id=$1', [loginId]);
    if (suffixedLogin.rowCount) return res.status(409).json({success:false,message:'A unique User ID could not be created. Enter one manually.'});
  }

  const initialPassword = String(body.password || staffId);
  const hash = await bcrypt.hash(initialPassword, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query(`
      INSERT INTO users(login_id,password_hash,full_name,role)
      VALUES($1,$2,$3,'teacher') RETURNING id
    `, [loginId, hash, name]);
    const teacher = await client.query(`
      INSERT INTO teachers(
        user_id,staff_id,name,designation,subject,mobile,whatsapp,gender,email,address,
        date_of_birth,joining_date,qualification,photo_url
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      user.rows[0].id, staffId, name, body.designation || null, body.subject || null,
      body.mobile || null, body.whatsapp || null, body.gender || null, body.email || null,
      body.address || null, body.date_of_birth || null, body.joining_date || null,
      body.qualification || null, body.photo_url || null,
    ]);
    await client.query('COMMIT');
    res.status(201).json({
      success:true,
      teacher:{...teacher.rows[0], login_id:loginId},
      credentials:{login_id:loginId, initial_password:initialPassword},
    });
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));


const photoUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024}}).single('photo');
router.post('/:id/photo',auth,allow('super_admin','admin'),(req,res,next)=>photoUpload(req,res,error=>error?res.status(400).json({success:false,message:'Photo must be under 8 MB'}):next()),asyncHandler(async(req,res)=>{
 if(!req.file||!req.file.mimetype.startsWith('image/'))return res.status(400).json({success:false,message:'Choose an image file'});
 const directory=path.join(__dirname,'../../uploads/teachers');await fs.mkdir(directory,{recursive:true});
 const filename=randomUUID()+'.webp';await sharp(req.file.buffer).rotate().resize(480,480,{fit:'cover',position:'attention'}).webp({quality:78}).toFile(path.join(directory,filename));
 const photoUrl='/uploads/teachers/'+filename,result=await pool.query('UPDATE teachers SET photo_url=$1 WHERE id=$2 RETURNING *',[photoUrl,req.params.id]);
 if(!result.rowCount){await fs.unlink(path.join(directory,filename)).catch(()=>{});return res.status(404).json({success:false,message:'Teacher not found'});}
 res.json({success:true,teacher:result.rows[0]});
}));
module.exports = router;
