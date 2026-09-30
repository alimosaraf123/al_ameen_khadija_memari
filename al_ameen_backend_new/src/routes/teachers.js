const express = require('express');
const multer=require('multer');const sharp=require('sharp');const path=require('path');const {uploadBuffer,deleteCloudinaryUrl}=require('../utils/cloudStorage');
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


router.put('/:id', auth, allow('super_admin','admin'), asyncHandler(async (req,res) => {
  const body=req.body||{};
  const current=await pool.query('SELECT t.*,u.login_id,u.id AS login_user_id,u.is_active AS user_active FROM teachers t LEFT JOIN users u ON u.id=t.user_id WHERE t.id=$1',[req.params.id]);
  if(!current.rowCount)return res.status(404).json({success:false,message:'Teacher not found'});
  const old=current.rows[0];
  const staffId=String(body.staff_id??old.staff_id).trim();
  const name=String(body.name??old.name).trim();
  if(!staffId||!name)return res.status(400).json({success:false,message:'Staff ID and name are required'});
  const active=body.is_active===undefined ? old.user_active!==false : body.is_active!==false;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const teacher=await client.query(
      'UPDATE teachers SET staff_id=$1,name=$2,mobile=$3,whatsapp=$4,gender=$5,joining_date=$6,subject=$7,is_active=$8 WHERE id=$9 RETURNING *',
      [staffId,name,body.mobile||null,body.whatsapp||null,body.gender||null,body.joining_date||null,body.subject||null,active,req.params.id]
    );
    if(old.login_user_id){
      const loginId=String(body.login_id??old.login_id).trim().toLowerCase();
      await client.query('UPDATE users SET full_name=$1,login_id=$2,is_active=$3 WHERE id=$4',[name,loginId,active,old.login_user_id]);
      if(body.password)await client.query('UPDATE users SET password_hash=$1 WHERE id=$2',[await bcrypt.hash(String(body.password),12),old.login_user_id]);
    }
    await client.query('COMMIT');
    res.json({success:true,teacher:teacher.rows[0]});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));

router.patch('/:id/status', auth, allow('super_admin','admin'), asyncHandler(async(req,res)=>{
 const active=req.body?.is_active!==false,client=await pool.connect();
 try{await client.query('BEGIN');const result=await client.query('UPDATE teachers SET is_active=$1 WHERE id=$2 RETURNING *',[active,req.params.id]);if(!result.rowCount){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Teacher not found'});}if(result.rows[0].user_id)await client.query('UPDATE users SET is_active=$1 WHERE id=$2',[active,result.rows[0].user_id]);if(!active)await client.query('UPDATE teacher_room_assignments SET is_active=FALSE WHERE teacher_id=$1',[req.params.id]);await client.query('COMMIT');res.json({success:true,teacher:result.rows[0]});}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));


const photoUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024}}).single('photo');
router.post('/:id/photo',auth,allow('super_admin','admin'),(req,res,next)=>photoUpload(req,res,error=>error?res.status(400).json({success:false,message:'Photo must be under 8 MB'}):next()),asyncHandler(async(req,res)=>{
 if(!req.file||!req.file.mimetype.startsWith('image/'))return res.status(400).json({success:false,message:'Choose an image file'});
 const current=await pool.query('SELECT photo_url FROM teachers WHERE id=$1',[req.params.id]);
 if(!current.rowCount)return res.status(404).json({success:false,message:'Teacher not found'});
 const compressed=await sharp(req.file.buffer).rotate().resize(480,480,{fit:'cover',position:'attention'}).webp({quality:78,effort:4}).toBuffer();
 const uploaded=await uploadBuffer(compressed,{folder:'al-ameen/teacher-photos',publicId:'teacher-'+req.params.id+'-'+Date.now(),resourceType:'image',format:'webp'});
 try{
  const result=await pool.query('UPDATE teachers SET photo_url=$1 WHERE id=$2 RETURNING *',[uploaded.url,req.params.id]);
  await deleteCloudinaryUrl(current.rows[0].photo_url).catch(()=>{});
  res.json({success:true,teacher:result.rows[0]});
 }catch(error){await deleteCloudinaryUrl(uploaded.url).catch(()=>{});throw error;}
}));

const documentUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024},fileFilter:(req,file,cb)=>{const allowed=file.mimetype.startsWith('image/')||file.mimetype==='application/pdf';cb(allowed?null:new Error('Only image and PDF files are allowed'),allowed);}}).single('file');
const acceptDocument=(req,res,next)=>documentUpload(req,res,error=>error?res.status(400).json({success:false,message:error.message||'Document must be under 10 MB'}):next());

router.get('/:id/documents',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const teacher=await pool.query('SELECT id FROM teachers WHERE id=$1',[req.params.id]);
 if(!teacher.rowCount)return res.status(404).json({success:false,message:'Teacher not found'});
 const result=await pool.query('SELECT * FROM teacher_documents WHERE teacher_id=$1 ORDER BY uploaded_at DESC',[req.params.id]);
 res.json({success:true,documents:result.rows});
}));

router.post('/:id/documents',auth,allow('super_admin','admin'),acceptDocument,asyncHandler(async(req,res)=>{
 if(!req.file)return res.status(400).json({success:false,message:'Choose an image or PDF file'});
 const teacher=await pool.query('SELECT id FROM teachers WHERE id=$1',[req.params.id]);
 if(!teacher.rowCount)return res.status(404).json({success:false,message:'Teacher not found'});
 let uploaded;
 if(req.file.mimetype.startsWith('image/')){
  const compressed=await sharp(req.file.buffer,{failOn:'error'}).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:82,effort:4}).toBuffer();
  uploaded=await uploadBuffer(compressed,{folder:'al-ameen/teacher-documents',resourceType:'image',format:'webp'});
 }else uploaded=await uploadBuffer(req.file.buffer,{folder:'al-ameen/teacher-documents',resourceType:'raw',extension:path.extname(req.file.originalname)||'.pdf'});
 try{
  const documentType=String(req.body.document_type||'other').trim()||'other';
  const existing=await pool.query('SELECT id,file_url FROM teacher_documents WHERE teacher_id=$1 AND document_type=$2 ORDER BY uploaded_at DESC LIMIT 1',[req.params.id,documentType]);
  const result=existing.rowCount
   ? await pool.query('UPDATE teacher_documents SET document_title=$1,file_url=$2,uploaded_by=$3,uploaded_at=NOW() WHERE id=$4 RETURNING *',[req.body.document_title||req.file.originalname,uploaded.url,req.user.userId,existing.rows[0].id])
   : await pool.query('INSERT INTO teacher_documents(teacher_id,document_type,document_title,file_url,uploaded_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.params.id,documentType,req.body.document_title||req.file.originalname,uploaded.url,req.user.userId]);
  if(existing.rowCount)await deleteCloudinaryUrl(existing.rows[0].file_url).catch(()=>{});
  res.status(201).json({success:true,document:result.rows[0]});
 }catch(error){await deleteCloudinaryUrl(uploaded.url).catch(()=>{});throw error;}
}));

router.delete('/documents/:documentId',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const result=await pool.query('DELETE FROM teacher_documents WHERE id=$1 RETURNING *',[req.params.documentId]);
 if(!result.rowCount)return res.status(404).json({success:false,message:'Document not found'});
 await deleteCloudinaryUrl(result.rows[0].file_url).catch(()=>{});
 res.json({success:true,message:'Document deleted'});
}));
router.patch('/:id/subjects', auth, allow('super_admin','admin'), asyncHandler(async(req,res)=>{
 const subjects=Array.isArray(req.body?.subjects)?req.body.subjects.map(v=>String(v).trim()).filter(Boolean):[];
 const result=await pool.query('UPDATE teachers SET subject=$1 WHERE id=$2 RETURNING id,name,subject',[subjects.join(', '),req.params.id]);
 if(!result.rowCount)return res.status(404).json({success:false,message:'Teacher not found'});
 res.json({success:true,teacher:result.rows[0],assigned_subjects:subjects});
}));
module.exports = router;
