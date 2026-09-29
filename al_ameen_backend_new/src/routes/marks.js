const express = require('express');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const router = express.Router();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value) {
  const text = String(value || '');
  if (!DATE_PATTERN.test(text)) return false;
  const [year,month,day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year,month-1,day));
  return parsed.getUTCFullYear()===year && parsed.getUTCMonth()===month-1 && parsed.getUTCDate()===day;
}
function validMark(value, fullMarks) {
  return value === null || value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= fullMarks);
}

router.get('/weekly-tests', auth, allow('super_admin','admin','teacher'), asyncHandler(async(req,res)=>{
  const params = [];
  let where = '';
  if (req.user.role === 'teacher') {
    params.push(req.user.userId);
    where = 'WHERE b.entered_by=$1';
  }
  const result = await pool.query(`
    SELECT b.id,b.exam_id,b.subject_id,b.class_name,b.full_marks,b.locked,b.submitted_at,b.updated_at,
           e.exam_name,e.exam_date,e.is_published,su.subject_name,u.full_name AS entered_by_name,
           COUNT(sm.id)::int AS student_count
    FROM mark_entry_batches b
    JOIN exams e ON e.id=b.exam_id
    JOIN subjects su ON su.id=b.subject_id
    LEFT JOIN users u ON u.id=b.entered_by
    LEFT JOIN student_marks sm ON sm.exam_id=b.exam_id AND sm.subject_id=b.subject_id
    ${where}
    GROUP BY b.id,e.id,su.id,u.full_name
    ORDER BY e.exam_date DESC,b.submitted_at DESC
    LIMIT 100
  `, params);
  res.json({success:true,tests:result.rows});
}));

router.get('/weekly-tests/:id', auth, allow('super_admin','admin','teacher'), asyncHandler(async(req,res)=>{
  const batch = await pool.query(`
    SELECT b.*,e.exam_name,e.exam_date,e.is_published,su.subject_name,u.full_name AS entered_by_name
    FROM mark_entry_batches b
    JOIN exams e ON e.id=b.exam_id
    JOIN subjects su ON su.id=b.subject_id
    LEFT JOIN users u ON u.id=b.entered_by
    WHERE b.id=$1
  `,[req.params.id]);
  if(!batch.rowCount) return res.status(404).json({success:false,message:'Weekly test not found'});
  if(req.user.role==='teacher' && Number(batch.rows[0].entered_by)!==Number(req.user.userId)) return res.status(403).json({success:false,message:'You can only view your own marks entry'});
  const rows = await pool.query(`
    SELECT sm.id AS mark_id,sm.student_id,s.registration_no,s.student_name,s.class_name,
           sm.obtained_marks,sm.remarks,sm.verification_status
    FROM student_marks sm JOIN students s ON s.id=sm.student_id
    WHERE sm.exam_id=$1 AND sm.subject_id=$2 ORDER BY s.student_name
  `,[batch.rows[0].exam_id,batch.rows[0].subject_id]);
  res.json({success:true,test:batch.rows[0],students:rows.rows});
}));

router.post('/weekly-tests', auth, allow('super_admin','admin','teacher'), asyncHandler(async(req,res)=>{
  const body = req.body || {};
  const className = String(body.class_name || '').trim();
  const subjectName = String(body.subject_name || '').trim();
  const fullMarks = Number(body.full_marks);
  const examDate = String(body.exam_date || '');
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if(!className || !subjectName || !Number.isFinite(fullMarks) || fullMarks<=0 || !validDate(examDate)) return res.status(400).json({success:false,message:'Class, subject, positive full marks and valid exam date are required'});
  if(entries.some(entry=>!validMark(entry.obtained_marks,fullMarks))) return res.status(400).json({success:false,message:`Marks must be between 0 and ${fullMarks}; leave blank for absent`});

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const classStudents = (await client.query('SELECT id FROM students WHERE class_name=$1 AND is_active=TRUE ORDER BY id FOR UPDATE',[className])).rows.map(row=>Number(row.id));
    const entryIds = entries.map(entry=>Number(entry.student_id));
    if(!classStudents.length){await client.query('ROLLBACK');return res.status(400).json({success:false,message:'No active student found in this class'});}
    const uniqueIds = new Set(entryIds);
    if(classStudents.length!==entryIds.length || !classStudents.every(id=>uniqueIds.has(id))){
      await client.query('ROLLBACK');
      return res.status(409).json({success:false,message:'Student list changed. Reload the class before saving marks.'});
    }
    const subject = await client.query(`INSERT INTO subjects(subject_name) VALUES($1) ON CONFLICT(subject_name) DO UPDATE SET subject_name=EXCLUDED.subject_name RETURNING id,subject_name`,[subjectName]);
    const duplicate = await client.query(`
      SELECT b.id FROM mark_entry_batches b JOIN exams e ON e.id=b.exam_id
      WHERE b.class_name=$1 AND b.subject_id=$2 AND e.exam_date=$3
    `,[className,subject.rows[0].id,examDate]);
    if(duplicate.rowCount){
      await client.query('ROLLBACK');
      return res.status(409).json({success:false,message:'This weekly test has already been submitted. Admin can edit it if required.',batch_id:duplicate.rows[0].id});
    }
    const examName = String(body.exam_name || `Weekly Test - ${subjectName}`).trim();
    const exam = await client.query(`INSERT INTO exams(exam_name,class_name,session_name,exam_date,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[examName,className,body.session_name||null,examDate,req.user.userId]);
    await client.query('INSERT INTO exam_subjects(exam_id,subject_id,full_marks,pass_marks) VALUES($1,$2,$3,$4)',[exam.rows[0].id,subject.rows[0].id,fullMarks,body.pass_marks||0]);
    for(const entry of entries){
      const mark = entry.obtained_marks === '' || entry.obtained_marks === null ? null : Number(entry.obtained_marks);
      await client.query(`INSERT INTO student_marks(exam_id,student_id,subject_id,obtained_marks,remarks,entered_by,verification_status) VALUES($1,$2,$3,$4,$5,$6,'pending')`,[exam.rows[0].id,entry.student_id,subject.rows[0].id,mark,mark===null?(entry.remarks||'Absent'):(entry.remarks||null),req.user.userId]);
    }
    const batch = await client.query(`INSERT INTO mark_entry_batches(exam_id,subject_id,class_name,full_marks,entered_by,locked) VALUES($1,$2,$3,$4,$5,TRUE) RETURNING *`,[exam.rows[0].id,subject.rows[0].id,className,fullMarks,req.user.userId]);
    await client.query('COMMIT');
    res.status(201).json({success:true,test:{...batch.rows[0],exam_name:examName,exam_date:examDate,subject_name:subjectName}});
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/weekly-tests/:id', auth, allow('super_admin','admin'), asyncHandler(async(req,res)=>{
  const body = req.body || {};
  const fullMarks = Number(body.full_marks);
  const examDate = String(body.exam_date || '');
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if(!Number.isFinite(fullMarks) || fullMarks<=0 || !validDate(examDate)) return res.status(400).json({success:false,message:'Positive full marks and valid exam date are required'});
  if(entries.some(entry=>!validMark(entry.obtained_marks,fullMarks))) return res.status(400).json({success:false,message:`Marks must be between 0 and ${fullMarks}`});
  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    const batch = await client.query('SELECT * FROM mark_entry_batches WHERE id=$1 FOR UPDATE',[req.params.id]);
    if(!batch.rowCount){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Weekly test not found'});}
    const existingIds = (await client.query('SELECT student_id FROM student_marks WHERE exam_id=$1 AND subject_id=$2',[batch.rows[0].exam_id,batch.rows[0].subject_id])).rows.map(row=>Number(row.student_id));
    const entryIds = entries.map(entry=>Number(entry.student_id));
    if(existingIds.length!==entryIds.length || !existingIds.every(id=>new Set(entryIds).has(id))){await client.query('ROLLBACK');return res.status(409).json({success:false,message:'Marks list does not match this test'});}
    await client.query('UPDATE exams SET exam_name=$1,exam_date=$2 WHERE id=$3',[String(body.exam_name||'Weekly Test').trim(),examDate,batch.rows[0].exam_id]);
    await client.query('UPDATE exam_subjects SET full_marks=$1,pass_marks=$2 WHERE exam_id=$3 AND subject_id=$4',[fullMarks,body.pass_marks||0,batch.rows[0].exam_id,batch.rows[0].subject_id]);
    for(const entry of entries){
      const mark = entry.obtained_marks === '' || entry.obtained_marks === null ? null : Number(entry.obtained_marks);
      await client.query(`UPDATE student_marks SET obtained_marks=$1,remarks=$2,entered_by=$3,updated_at=NOW() WHERE exam_id=$4 AND subject_id=$5 AND student_id=$6`,[mark,mark===null?(entry.remarks||'Absent'):(entry.remarks||null),req.user.userId,batch.rows[0].exam_id,batch.rows[0].subject_id,entry.student_id]);
    }
    const updated = await client.query('UPDATE mark_entry_batches SET full_marks=$1,updated_by=$2,updated_at=NOW() WHERE id=$3 RETURNING *',[fullMarks,req.user.userId,req.params.id]);
    await client.query('COMMIT');
    res.json({success:true,test:updated.rows[0]});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));

router.get('/exams',auth,asyncHandler(async(req,res)=>{const r=await pool.query(`SELECT * FROM exams ORDER BY created_at DESC`);res.json({success:true,exams:r.rows});}));
router.post('/exams',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{const b=req.body;const r=await pool.query(`INSERT INTO exams(exam_name,class_name,session_name,exam_date,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[b.exam_name,b.class_name,b.session_name||null,b.exam_date||null,req.user.userId]);res.status(201).json({success:true,exam:r.rows[0]});}));
router.post('/subjects',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{const r=await pool.query(`INSERT INTO subjects(subject_name) VALUES($1) ON CONFLICT(subject_name) DO UPDATE SET subject_name=EXCLUDED.subject_name RETURNING *`,[req.body.subject_name]);res.json({success:true,subject:r.rows[0]});}));
router.get('/subjects',auth,asyncHandler(async(req,res)=>{const r=await pool.query(`SELECT * FROM subjects WHERE is_active=TRUE ORDER BY subject_name`);res.json({success:true,subjects:r.rows});}));

router.post('/entry',auth,allow('super_admin','admin','teacher'),asyncHandler(async(req,res)=>{
  const b=req.body;
  if(req.user.role==='teacher'){
    const locked=await pool.query('SELECT id FROM mark_entry_batches WHERE exam_id=$1 AND locked=TRUE',[b.exam_id]);
    if(locked.rowCount) return res.status(403).json({success:false,message:'Teacher marks are locked after submission'});
    const existing=await pool.query('SELECT id FROM student_marks WHERE exam_id=$1 AND student_id=$2 AND subject_id=$3',[b.exam_id,b.student_id,b.subject_id]);
    if(existing.rowCount) return res.status(403).json({success:false,message:'Teacher cannot update marks after saving'});
  }
  const status=req.user.role==='teacher'?'pending':(b.verification_status||'pending');
  const result=await pool.query(`INSERT INTO student_marks(exam_id,student_id,subject_id,obtained_marks,grade,remarks,entered_by,verification_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(exam_id,student_id,subject_id) DO UPDATE SET obtained_marks=EXCLUDED.obtained_marks,grade=EXCLUDED.grade,remarks=EXCLUDED.remarks,entered_by=EXCLUDED.entered_by,verification_status=EXCLUDED.verification_status,verified_by=NULL,verified_at=NULL,updated_at=NOW() RETURNING *`,
    [b.exam_id,b.student_id,b.subject_id,b.obtained_marks,b.grade||null,b.remarks||null,req.user.userId,status]);
  res.json({success:true,mark:result.rows[0]});
}));
router.get('/pending',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{const r=await pool.query(`SELECT sm.*,e.exam_name,s.student_name,s.class_name,su.subject_name,u.full_name entered_by_name FROM student_marks sm JOIN exams e ON e.id=sm.exam_id JOIN students s ON s.id=sm.student_id JOIN subjects su ON su.id=sm.subject_id LEFT JOIN users u ON u.id=sm.entered_by WHERE sm.verification_status='pending' ORDER BY e.exam_name,s.class_name,s.student_name,su.subject_name`);res.json({success:true,marks:r.rows});}));
router.patch('/:id/verify',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{const status=req.body.status==='rejected'?'rejected':'verified';const r=await pool.query(`UPDATE student_marks SET verification_status=$1,verified_by=$2,verified_at=CASE WHEN $1::varchar='verified' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$3 RETURNING *`,[status,req.user.userId,req.params.id]);res.json({success:true,mark:r.rows[0]});}));
router.patch('/exams/:id/publish',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{const r=await pool.query(`UPDATE exams SET is_published=$1 WHERE id=$2 RETURNING *`,[!!req.body.is_published,req.params.id]);res.json({success:true,exam:r.rows[0]});}));
router.get('/exam/:examId/class/:className',auth,asyncHandler(async(req,res)=>{const r=await pool.query(`SELECT s.id student_id,s.registration_no,s.student_name,s.roll_no,s.class_name,su.subject_name,sm.obtained_marks,sm.grade,sm.verification_status FROM students s LEFT JOIN student_marks sm ON sm.student_id=s.id AND sm.exam_id=$1 LEFT JOIN subjects su ON su.id=sm.subject_id WHERE s.class_name=$2 ORDER BY s.roll_no,s.student_name,su.subject_name`,[req.params.examId,req.params.className]);res.json({success:true,rows:r.rows});}));

module.exports = router;
