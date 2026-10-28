const express=require('express'),bcrypt=require('bcryptjs'),pool=require('../db'),multer=require('multer'),sharp=require('sharp');
const{auth,allow}=require('../middleware/auth');const asyncHandler=require('../utils/asyncHandler');
const{uploadBuffer,deleteCloudinaryUrl}=require('../utils/cloudStorage');
const router=express.Router();
const photoUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024}}).single('photo');
const schemaReady=pool.query(`
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN('super_admin','admin','teacher','guardian','gateman','office','library'));
CREATE TABLE IF NOT EXISTS service_staff_profiles(id BIGSERIAL PRIMARY KEY,user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,staff_id VARCHAR(100) UNIQUE NOT NULL,name VARCHAR(150) NOT NULL,staff_role VARCHAR(30) NOT NULL CHECK(staff_role IN('gateman','office','library')),mobile VARCHAR(30),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE service_staff_profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
CREATE TABLE IF NOT EXISTS gate_duty_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  staff_id VARCHAR(100),
  staff_name VARCHAR(150),
  duty_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'on_duty',
  device_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gate_duty_logs_date ON gate_duty_logs(duty_date, user_id);
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS punch_in TIMESTAMPTZ;
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS punch_out TIMESTAMPTZ;
ALTER TABLE staff_attendance ADD COLUMN IF NOT EXISTS remark TEXT;

CREATE TABLE IF NOT EXISTS gate_entry_logs(id BIGSERIAL PRIMARY KEY,student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,permission_type VARCHAR(20) NOT NULL CHECK(permission_type IN('visit','gate_pass')),permission_id BIGINT NOT NULL,entered_by BIGINT REFERENCES users(id) ON DELETE SET NULL,entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),remarks TEXT);
CREATE TABLE IF NOT EXISTS gate_guardian_visit_entries(id BIGSERIAL PRIMARY KEY,student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,visitor_name VARCHAR(180) NOT NULL,visitor_relation VARCHAR(100) NOT NULL,visitor_source VARCHAR(30) NOT NULL CHECK(visitor_source IN('father','mother','visitor1','visitor2')),entered_by BIGINT REFERENCES users(id) ON DELETE SET NULL,entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),remarks TEXT);
ALTER TABLE gate_guardian_visit_entries DROP CONSTRAINT IF EXISTS gate_guardian_visit_entries_visitor_source_check;
ALTER TABLE gate_guardian_visit_entries ADD CONSTRAINT gate_guardian_visit_entries_visitor_source_check CHECK(visitor_source IN('father','mother','visitor1','visitor2','permission'));
ALTER TABLE gate_guardian_visit_entries ADD COLUMN IF NOT EXISTS permission_id BIGINT;
ALTER TABLE gate_guardian_visit_entries ADD COLUMN IF NOT EXISTS entry_mode VARCHAR(30) NOT NULL DEFAULT 'without_permission';
ALTER TABLE gate_guardian_visit_entries ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE gate_guardian_visit_entries ADD COLUMN IF NOT EXISTS exited_at TIMESTAMPTZ;
ALTER TABLE gate_guardian_visit_entries ADD COLUMN IF NOT EXISTS exited_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_gate_guardian_visits_student_time ON gate_guardian_visit_entries(student_id,entered_at DESC);
CREATE TABLE IF NOT EXISTS dining_stock(id BIGSERIAL PRIMARY KEY,item_name VARCHAR(150) UNIQUE NOT NULL,unit VARCHAR(30) NOT NULL,current_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,reorder_level NUMERIC(12,2) NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS dining_stock_transactions(id BIGSERIAL PRIMARY KEY,stock_id BIGINT NOT NULL REFERENCES dining_stock(id) ON DELETE CASCADE,transaction_type VARCHAR(10) NOT NULL CHECK(transaction_type IN('in','out')),quantity NUMERIC(12,2) NOT NULL CHECK(quantity>0),note TEXT,entered_by BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE dining_stock_transactions ADD COLUMN IF NOT EXISTS transaction_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE dining_stock_transactions ADD COLUMN IF NOT EXISTS invoice_no VARCHAR(100);
ALTER TABLE dining_stock_transactions ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(180);
ALTER TABLE dining_stock_transactions ADD COLUMN IF NOT EXISTS rate NUMERIC(12,2);
ALTER TABLE dining_stock_transactions ADD COLUMN IF NOT EXISTS opening_quantity NUMERIC(12,2);
ALTER TABLE dining_stock_transactions ADD COLUMN IF NOT EXISTS closing_quantity NUMERIC(12,2);
CREATE TABLE IF NOT EXISTS library_books(id BIGSERIAL PRIMARY KEY,accession_no VARCHAR(100) UNIQUE NOT NULL,title VARCHAR(250) NOT NULL,author VARCHAR(180),total_copies INTEGER NOT NULL DEFAULT 1 CHECK(total_copies>=0),available_copies INTEGER NOT NULL DEFAULT 1 CHECK(available_copies>=0),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE library_books ADD COLUMN IF NOT EXISTS book_number VARCHAR(50);
ALTER TABLE library_books ADD COLUMN IF NOT EXISTS book_class VARCHAR(100);
ALTER TABLE library_books ADD COLUMN IF NOT EXISTS part VARCHAR(50);
ALTER TABLE library_books ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE library_books ADD COLUMN IF NOT EXISTS publisher VARCHAR(180);
ALTER TABLE library_books ADD COLUMN IF NOT EXISTS publish_year INTEGER;
ALTER TABLE library_books ADD COLUMN IF NOT EXISTS price NUMERIC(12,2);
ALTER TABLE library_books ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE library_books ADD COLUMN IF NOT EXISTS rack_no VARCHAR(50);
ALTER TABLE library_books ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE library_books ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE TABLE IF NOT EXISTS library_loans(id BIGSERIAL PRIMARY KEY,book_id BIGINT NOT NULL REFERENCES library_books(id),student_id BIGINT NOT NULL REFERENCES students(id),issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),due_date DATE NOT NULL,returned_at TIMESTAMPTZ,issued_by BIGINT REFERENCES users(id) ON DELETE SET NULL,returned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
DO $$ BEGIN IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='library_loans' AND column_name='issued_at' AND data_type='date') THEN ALTER TABLE library_loans ALTER COLUMN issued_at DROP DEFAULT; ALTER TABLE library_loans ALTER COLUMN issued_at TYPE TIMESTAMPTZ USING issued_at::timestamp AT TIME ZONE 'Asia/Kolkata'; ALTER TABLE library_loans ALTER COLUMN issued_at SET DEFAULT NOW(); END IF; END $$;
`);
const admin=allow('super_admin','admin');
router.get('/staff/me',auth,allow('gateman','office','library','super_admin','admin'),asyncHandler(async(req,res)=>{
  await schemaReady;
  const staff=(await pool.query(`SELECT p.*,u.login_id,u.role,COALESCE(p.name,u.full_name) full_name,COALESCE(p.photo_url,u.photo_url) photo_url FROM users u LEFT JOIN service_staff_profiles p ON p.user_id=u.id WHERE u.id=$1 LIMIT 1`,[req.user.userId])).rows[0];
  if(!staff)return res.status(404).json({success:false,message:'Staff profile not found'});
  res.json({success:true,staff});
}));
router.get('/staff',auth,admin,asyncHandler(async(req,res)=>{await schemaReady;const q=await pool.query(`SELECT p.*,u.login_id,u.role,u.is_active,COALESCE(p.photo_url,u.photo_url) photo_url FROM service_staff_profiles p JOIN users u ON u.id=p.user_id ORDER BY p.staff_role,p.name`);res.json({success:true,staff:q.rows})}));
router.post('/staff',auth,admin,asyncHandler(async(req,res)=>{await schemaReady;const b=req.body||{},role=String(b.role||'');if(!['gateman','office','library'].includes(role)||!b.staff_id||!b.name||!b.login_id||!b.password||b.password!==b.confirm_password)return res.status(400).json({success:false,message:'Role, staff ID, name, user ID, password and matching confirmation are required'});const c=await pool.connect();try{await c.query('BEGIN');const u=(await c.query(`INSERT INTO users(login_id,password_hash,full_name,role) VALUES($1,$2,$3,$4) RETURNING id`,[String(b.login_id).trim().toLowerCase(),await bcrypt.hash(String(b.password),12),String(b.name).trim(),role])).rows[0];const p=(await c.query(`INSERT INTO service_staff_profiles(user_id,staff_id,name,staff_role,mobile) VALUES($1,$2,$3,$4,$5) RETURNING *`,[u.id,String(b.staff_id).trim(),String(b.name).trim(),role,b.mobile||null])).rows[0];await c.query('COMMIT');res.status(201).json({success:true,staff:p})}catch(e){await c.query('ROLLBACK');if(e.code==='23505')return res.status(409).json({success:false,message:'User ID or Staff ID already exists'});throw e}finally{c.release()}}));
router.patch('/staff/:id',auth,admin,asyncHandler(async(req,res)=>{await schemaReady;const b=req.body||{};if(b.password&&b.password!==b.confirm_password)return res.status(400).json({success:false,message:'Password confirmation does not match'});const p=(await pool.query('SELECT * FROM service_staff_profiles WHERE id=$1',[req.params.id])).rows[0];if(!p)return res.status(404).json({success:false,message:'Staff not found'});const newName=b.name?String(b.name).trim():null;const newMobile=b.mobile!==undefined?(b.mobile?String(b.mobile).trim():null):null;const newStaffId=b.staff_id?String(b.staff_id).trim():null;if(newName||b.mobile!==undefined||newStaffId){await pool.query(`UPDATE service_staff_profiles SET name=COALESCE($1, name), mobile=CASE WHEN $2::boolean THEN $3 ELSE mobile END, staff_id=COALESCE($4, staff_id) WHERE id=$5`,[newName,b.mobile!==undefined,newMobile,newStaffId,req.params.id]);if(newName){await pool.query('UPDATE users SET full_name=$1 WHERE id=$2',[newName,p.user_id])}}if(b.photo_url!==undefined){await pool.query('UPDATE service_staff_profiles SET photo_url=$1 WHERE id=$2',[b.photo_url||null,p.id]);await pool.query('UPDATE users SET photo_url=$1 WHERE id=$2',[b.photo_url||null,p.user_id]);}await pool.query('UPDATE users SET is_active=COALESCE($1,is_active),password_hash=CASE WHEN $2::text IS NULL THEN password_hash ELSE $2 END,password_change_required=CASE WHEN $2::text IS NULL THEN password_change_required ELSE TRUE END WHERE id=$3',[b.is_active, b.password?await bcrypt.hash(String(b.password),12):null,p.user_id]);res.json({success:true})}));

router.post('/staff/:id/photo',auth,admin,(req,res,next)=>photoUpload(req,res,err=>err?res.status(400).json({success:false,message:'Photo must be under 8 MB'}):next()),asyncHandler(async(req,res)=>{
  await schemaReady;
  if(!req.file||!req.file.mimetype.startsWith('image/'))return res.status(400).json({success:false,message:'Please choose an image file (JPEG, PNG, WEBP)'});
  const staff=(await pool.query('SELECT p.*,u.id as user_table_id FROM service_staff_profiles p JOIN users u ON u.id=p.user_id WHERE p.id=$1',[req.params.id])).rows[0];
  if(!staff)return res.status(404).json({success:false,message:'Staff profile not found'});
  const compressed=await sharp(req.file.buffer).rotate().resize(480,480,{fit:'cover',position:'attention'}).webp({quality:80,effort:4}).toBuffer();
  const uploaded=await uploadBuffer(compressed,{folder:'al-ameen/staff-photos',publicId:'staff-'+staff.id+'-'+Date.now(),resourceType:'image',format:'webp'});
  try{
    const updated=await pool.query('UPDATE service_staff_profiles SET photo_url=$1 WHERE id=$2 RETURNING *',[uploaded.url,staff.id]);
    await pool.query('UPDATE users SET photo_url=$1 WHERE id=$2',[uploaded.url,staff.user_id]);
    if(staff.photo_url&&staff.photo_url.includes('cloudinary')){await deleteCloudinaryUrl(staff.photo_url).catch(()=>{});}
    res.json({success:true,message:'Photo uploaded successfully',photo_url:uploaded.url,staff:updated.rows[0]});
  }catch(err){
    await deleteCloudinaryUrl(uploaded.url).catch(()=>{});
    throw err;
  }
}));
router.delete('/staff/:id/photo',auth,admin,asyncHandler(async(req,res)=>{
  await schemaReady;
  const staff=(await pool.query('SELECT p.* FROM service_staff_profiles p WHERE p.id=$1',[req.params.id])).rows[0];
  if(!staff)return res.status(404).json({success:false,message:'Staff profile not found'});
  if(staff.photo_url&&staff.photo_url.includes('cloudinary')){await deleteCloudinaryUrl(staff.photo_url).catch(()=>{});}
  await pool.query('UPDATE service_staff_profiles SET photo_url=NULL WHERE id=$1',[staff.id]);
  await pool.query('UPDATE users SET photo_url=NULL WHERE id=$1',[staff.user_id]);
  res.json({success:true,message:'Photo removed successfully'});
}));


router.get('/gate-today',auth,allow('gateman','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const [q,v]=await Promise.all([pool.query(`
SELECT 'visit' permission_type,v.id permission_id,v.token_no,s.id student_id,s.registration_no,s.student_name,s.class_name,s.photo_url,r.room_name,v.visitor_name detail_name,v.visitor_relation detail_relation,v.visit_at permission_at,v.duration_minutes,COALESCE(v.person_count, 1)::int person_count,NULL::text reason,EXISTS(SELECT 1 FROM gate_entry_logs gl WHERE gl.permission_type='visit' AND gl.permission_id=v.id AND gl.entered_at::date=CURRENT_DATE) entered
FROM student_visits v JOIN students s ON s.id=v.student_id LEFT JOIN rooms r ON r.id=s.room_id
WHERE v.visit_at::date=CURRENT_DATE AND v.status='approved' AND s.is_active=TRUE
  AND NOT EXISTS (
    SELECT 1 FROM gate_entry_logs gl
    WHERE gl.permission_type='visit' AND gl.permission_id=v.id AND gl.entered_at::date=CURRENT_DATE
  )
  AND NOT EXISTS (
    SELECT 1 FROM gate_guardian_visit_entries ge
    WHERE (ge.permission_id=v.id OR (ge.student_id=v.student_id AND ge.entered_at::date=CURRENT_DATE))
  )
UNION ALL
SELECT 'gate_pass',g.id,g.token_no,s.id,s.registration_no,s.student_name,s.class_name,s.photo_url,r.room_name,NULL,NULL,g.departure_at,NULL,1::int person_count,g.reason,EXISTS(SELECT 1 FROM gate_entry_logs gl WHERE gl.permission_type='gate_pass' AND gl.permission_id=g.id AND gl.entered_at::date=CURRENT_DATE)
FROM student_gate_passes g JOIN students s ON s.id=g.student_id LEFT JOIN rooms r ON r.id=s.room_id
WHERE g.departure_at::date=CURRENT_DATE AND g.status IN('draft','pending') AND s.is_active=TRUE
  AND NOT EXISTS (
    SELECT 1 FROM gate_entry_logs gl
    WHERE gl.permission_type='gate_pass' AND gl.permission_id=g.id AND gl.entered_at::date=CURRENT_DATE
  )
ORDER BY permission_at,student_name`),pool.query(`
SELECT e.id, e.student_id, e.visitor_name, e.visitor_relation, e.visitor_source, e.entered_at, e.exited_at, e.entry_mode, COALESCE(e.person_count, 1)::int person_count,
       s.registration_no, s.student_name, s.class_name, s.photo_url, r.room_name,
       u.full_name entered_by_name, u.login_id entered_by_login,
       u2.full_name exited_by_name, u2.login_id exited_by_login,
       ROUND(EXTRACT(EPOCH FROM (COALESCE(e.exited_at, NOW()) - e.entered_at)) / 60)::int as duration_minutes,
       CASE WHEN e.exited_at IS NOT NULL THEN 'exited' ELSE 'inside' END as status
FROM gate_guardian_visit_entries e
JOIN students s ON s.id = e.student_id
LEFT JOIN rooms r ON r.id = s.room_id
LEFT JOIN users u ON u.id = e.entered_by
LEFT JOIN users u2 ON u2.id = e.exited_by
WHERE e.entered_at::date = CURRENT_DATE 
  AND e.is_active = TRUE
ORDER BY (e.exited_at IS NULL) DESC, e.entered_at DESC
`)]);res.json({success:true,date:new Date().toISOString().slice(0,10),permissions:q.rows,today_visitors:v.rows,inside_count:v.rows.filter(x=>x.status==='inside').length})}));
router.get('/gate-check/:registration',auth,allow('gateman','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const st=(await pool.query(`SELECT s.id,s.registration_no,s.student_name,s.class_name,s.photo_url,s.father_name,s.mother_name,s.guardian_name,s.address,r.room_name FROM students s LEFT JOIN rooms r ON r.id=s.room_id WHERE s.registration_no=$1 AND s.is_active=TRUE`,[req.params.registration])).rows[0];if(!st)return res.status(404).json({success:false,message:'Active student not found'});const [visits,passes,visitors,docs,entries,guardians,meetingHistory,meetingCounts]=await Promise.all([pool.query(`SELECT v.id,v.token_no,v.visitor_name,v.visitor_relation,v.visit_at,v.duration_minutes,v.purpose,v.status,COALESCE(v.person_count, 1)::int person_count,(EXISTS(SELECT 1 FROM gate_entry_logs gl WHERE gl.permission_type='visit' AND gl.permission_id=v.id AND gl.entered_at::date=CURRENT_DATE) OR EXISTS(SELECT 1 FROM gate_guardian_visit_entries ge WHERE (ge.permission_id=v.id OR ge.student_id=v.student_id) AND ge.entered_at::date=CURRENT_DATE)) entered FROM student_visits v WHERE student_id=$1 AND visit_at::date=CURRENT_DATE AND status IN ('approved','completed') ORDER BY visit_at`,[st.id]),pool.query(`SELECT g.id,g.token_no,g.reason,g.departure_at,g.expected_return_at,g.status,EXISTS(SELECT 1 FROM gate_entry_logs gl WHERE gl.permission_type='gate_pass' AND gl.permission_id=g.id AND gl.entered_at::date=CURRENT_DATE) entered FROM student_gate_passes g WHERE student_id=$1 AND departure_at::date=CURRENT_DATE AND status IN('draft','pending') ORDER BY departure_at`,[st.id]),pool.query(`SELECT visitor_number,visitor_name,relation FROM student_visitors WHERE student_id=$1 ORDER BY visitor_number`,[st.id]),pool.query(`SELECT DISTINCT ON (document_type) document_type,file_url FROM student_documents WHERE student_id=$1 AND document_type IN('father_photo','mother_photo','visitor1_photo','visitor2_photo') ORDER BY document_type, uploaded_at DESC`,[st.id]),pool.query(`SELECT gl.id,gl.permission_type,gl.permission_id,gl.entered_at,gl.remarks,u.full_name entered_by_name,u.login_id entered_by_login FROM gate_entry_logs gl LEFT JOIN users u ON u.id=gl.entered_by WHERE gl.student_id=$1 AND gl.entered_at::date=CURRENT_DATE ORDER BY gl.entered_at DESC`,[st.id]),pool.query(`SELECT gp.guardian_name,gp.address,gp.photo_url,sg.relation_type,sg.is_primary FROM student_guardians sg JOIN guardian_profiles gp ON gp.id=sg.guardian_id WHERE sg.student_id=$1 AND gp.is_active=TRUE ORDER BY sg.is_primary DESC,gp.guardian_name`,[st.id]),pool.query(`SELECT e.id,e.visitor_name,e.visitor_relation,e.visitor_source,e.entered_at,e.exited_at,e.entry_mode,e.remarks,COALESCE(e.person_count, 1)::int person_count,u.full_name entered_by_name,u.login_id entered_by_login,u2.full_name exited_by_name,u2.login_id exited_by_login FROM gate_guardian_visit_entries e LEFT JOIN users u ON u.id=e.entered_by LEFT JOIN users u2 ON u2.id=e.exited_by WHERE e.student_id=$1 ORDER BY e.entered_at DESC LIMIT 100`,[st.id]),pool.query(`SELECT visitor_source,visitor_name,visitor_relation,COUNT(*)::int visit_count,COUNT(*) FILTER (WHERE entered_at::date=CURRENT_DATE)::int today_visit_count,COUNT(*) FILTER (WHERE entered_at::date=CURRENT_DATE AND exited_at IS NULL)::int inside_count,MAX(CASE WHEN entered_at::date=CURRENT_DATE AND exited_at IS NULL THEN id ELSE NULL END) inside_entry_id,MAX(CASE WHEN entered_at::date=CURRENT_DATE AND exited_at IS NULL THEN entered_at ELSE NULL END) inside_entered_at,MAX(entered_at) last_visit_at FROM gate_guardian_visit_entries WHERE student_id=$1 GROUP BY visitor_source,visitor_name,visitor_relation ORDER BY visitor_source`,[st.id])]);const visitorRows=[...visitors.rows];if(!visitorRows.some(v=>Number(v.visitor_number)===1))visitorRows.push({visitor_number:1,visitor_name:null,relation:null});if(!visitorRows.some(v=>Number(v.visitor_number)===2))visitorRows.push({visitor_number:2,visitor_name:null,relation:null});visitorRows.sort((a,b)=>Number(a.visitor_number)-Number(b.visitor_number));res.json({success:true,student:st,guardians:guardians.rows,visitors:visitorRows,photos:Object.fromEntries(docs.rows.map(x=>[x.document_type,x.file_url])),visits:visits.rows,gate_passes:passes.rows,entries:entries.rows,meeting_history:meetingHistory.rows,meeting_counts:meetingCounts.rows,meeting_total:meetingCounts.rows.reduce((sum,row)=>sum+Number(row.visit_count),0)})}));
router.post('/guardian-entry',auth,allow('gateman','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const studentId=Number(req.body?.student_id),source=String(req.body?.visitor_source||'').trim().toLowerCase();if(!studentId||!['father','mother','visitor1','visitor2'].includes(source))return res.status(400).json({success:false,message:'Student and visitor card are required'});const student=(await pool.query('SELECT id,father_name,mother_name FROM students WHERE id=$1 AND is_active=TRUE',[studentId])).rows[0];if(!student)return res.status(404).json({success:false,message:'Active student not found'});let name='',relation='';if(source==='father'){name=student.father_name||'Father';relation='Father'}else if(source==='mother'){name=student.mother_name||'Mother';relation='Mother'}else{const number=Number(source.replace('visitor',''));const visitor=(await pool.query('SELECT visitor_name,relation FROM student_visitors WHERE student_id=$1 AND visitor_number=$2',[studentId,number])).rows[0];name=(visitor?.visitor_name&&String(visitor.visitor_name).trim())?String(visitor.visitor_name).trim():('Visitor '+number);relation=(visitor?.relation&&String(visitor.relation).trim())?String(visitor.relation).trim():('Visitor '+number)}if(!String(name||'').trim())name=source==='father'?'Father':source==='mother'?'Mother':'Visitor';if(!String(relation||'').trim())relation=source==='father'?'Father':source==='mother'?'Mother':'Visitor';const debounce=await pool.query(`SELECT 1 FROM gate_guardian_visit_entries WHERE student_id=$1 AND visitor_source=$2 AND entered_at >= NOW() - INTERVAL '5 seconds'`,[studentId,source]);if(debounce.rowCount)return res.status(409).json({success:false,message:'This visitor entry was just recorded. Please wait a moment.'});const personCount=Math.min(9,Math.max(1,Number(req.body?.person_count)||1));const todayVisit=(await pool.query(`SELECT id FROM student_visits WHERE student_id=$1 AND visit_at::date=CURRENT_DATE AND status='approved' LIMIT 1`,[studentId])).rows[0];const permissionId=todayVisit?todayVisit.id:null;const entryMode=permissionId?'with_permission':'without_permission';const entry=(await pool.query(`INSERT INTO gate_guardian_visit_entries(student_id,visitor_name,visitor_relation,visitor_source,entered_by,entry_mode,is_active,remarks,person_count,permission_id) VALUES($1,$2,$3,$4,$5,$6,TRUE,$7,$8,$9) RETURNING *`,[studentId,String(name).trim(),String(relation).trim(),source,req.user.userId,entryMode,req.body?.remarks||null,personCount,permissionId])).rows[0];if(permissionId){await pool.query(`INSERT INTO gate_entry_logs(student_id,permission_type,permission_id,entered_by,remarks) VALUES($1,'visit',$2,$3,$4) ON CONFLICT DO NOTHING`,[studentId,permissionId,req.user.userId,'Guardian entry recorded ('+source+')']);}const total=(await pool.query('SELECT COUNT(*)::int count FROM gate_guardian_visit_entries WHERE student_id=$1',[studentId])).rows[0].count;res.status(201).json({success:true,message:'Guardian meeting entry recorded',entry,total})}));
router.post('/student-visitor',auth,allow('gateman','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const studentId=Number(req.body?.student_id),visitorNumber=Number(req.body?.visitor_number);const visitorName=String(req.body?.visitor_name||'').trim(),relation=String(req.body?.relation||'').trim(),mobile=String(req.body?.mobile_number||'').trim()||null;if(!studentId||![1,2].includes(visitorNumber))return res.status(400).json({success:false,message:'Valid student and visitor number (1 or 2) required'});const existing=await pool.query('SELECT id FROM student_visitors WHERE student_id=$1 AND visitor_number=$2',[studentId,visitorNumber]);let result;if(existing.rowCount){result=await pool.query('UPDATE student_visitors SET visitor_name=$1,relation=$2,mobile_number=COALESCE($3,mobile_number),updated_at=NOW() WHERE student_id=$4 AND visitor_number=$5 RETURNING *',[visitorName||null,relation||null,mobile,studentId,visitorNumber]);}else{result=await pool.query('INSERT INTO student_visitors(student_id,visitor_number,visitor_name,relation,mobile_number,created_at,updated_at) VALUES($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING *',[studentId,visitorNumber,visitorName||null,relation||null,mobile]);}res.json({success:true,visitor:result.rows[0]});}));
router.post('/guardian-exit',auth,allow('gateman','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const entryId=Number(req.body?.entry_id);const studentId=Number(req.body?.student_id);const source=String(req.body?.visitor_source||'').trim().toLowerCase();let entry;if(entryId){entry=(await pool.query(`UPDATE gate_guardian_visit_entries SET exited_at=NOW(),exited_by=$1 WHERE id=$2 AND exited_at IS NULL RETURNING *`,[req.user.userId,entryId])).rows[0];}else if(studentId&&source){const latest=(await pool.query(`SELECT id FROM gate_guardian_visit_entries WHERE student_id=$1 AND visitor_source=$2 AND entered_at::date=CURRENT_DATE AND exited_at IS NULL ORDER BY entered_at DESC LIMIT 1`,[studentId,source])).rows[0];if(latest){entry=(await pool.query(`UPDATE gate_guardian_visit_entries SET exited_at=NOW(),exited_by=$1 WHERE id=$2 RETURNING *`,[req.user.userId,latest.id])).rows[0];}}if(!entry){return res.status(404).json({success:false,message:'No active inside visitor entry found to exit'});}if(entry.permission_id){await pool.query(`UPDATE student_visits SET status='completed',completed_at=NOW(),completed_by=$1,updated_at=NOW() WHERE id=$2 AND status='approved'`,[req.user.userId,entry.permission_id]);}else if(entry.student_id){await pool.query(`UPDATE student_visits SET status='completed',completed_at=NOW(),completed_by=$1,updated_at=NOW() WHERE student_id=$2 AND visit_at::date=CURRENT_DATE AND status='approved'`,[req.user.userId,entry.student_id]);}res.json({success:true,message:`${entry.visitor_name} (${entry.visitor_relation}) exit recorded successfully`,entry});}));
router.post('/gate-entry',auth,allow('gateman','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const b=req.body||{},type=b.permission_type;if(!['visit','gate_pass'].includes(type)||!b.permission_id)return res.status(400).json({success:false,message:'Choose a valid permission'});const table=type==='visit'?'student_visits':'student_gate_passes',dateCol=type==='visit'?'visit_at':'departure_at';const statusCondition=type==='visit'?"status='approved'":"status IN('draft','pending')";const q=await pool.query(`SELECT student_id FROM ${table} WHERE id=$1 AND ${dateCol}::date=CURRENT_DATE AND ${statusCondition}`,[b.permission_id]);if(!q.rowCount)return res.status(409).json({success:false,message:'Today’s valid permission was not found'});if((await pool.query('SELECT 1 FROM gate_entry_logs WHERE permission_type=$1 AND permission_id=$2 AND entered_at::date=CURRENT_DATE',[type,b.permission_id])).rowCount)return res.status(409).json({success:false,message:'This permission has already been entered today'});const log=(await pool.query(`INSERT INTO gate_entry_logs(student_id,permission_type,permission_id,entered_by,remarks) VALUES($1,$2,$3,$4,$5) RETURNING *`,[q.rows[0].student_id,type,b.permission_id,req.user.userId,b.remarks||null])).rows[0];res.status(201).json({success:true,entry:log})}));
router.post('/gate-visitor-entry',auth,allow('gateman','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const permissionId=Number(req.body?.permission_id);if(!permissionId)return res.status(400).json({success:false,message:'Visit permission is required'});const visit=(await pool.query(`SELECT id,student_id,visitor_name,visitor_relation,COALESCE(person_count, 1)::int person_count FROM student_visits WHERE id=$1 AND visit_at::date=CURRENT_DATE AND status='approved'`,[permissionId])).rows[0];if(!visit)return res.status(404).json({success:false,message:'Today’s visit permission was not found'});const existing=await pool.query(`SELECT id FROM gate_guardian_visit_entries WHERE permission_id=$1 AND entry_mode='with_permission'`,[permissionId]);if(existing.rowCount)return res.status(409).json({success:false,message:'This visitor entry is already recorded'});const personCount=Math.min(9,Math.max(1,Number(req.body?.person_count)||Number(visit.person_count)||1));const entry=(await pool.query(`INSERT INTO gate_guardian_visit_entries(student_id,visitor_name,visitor_relation,visitor_source,permission_id,entry_mode,entered_by,remarks,person_count) VALUES($1,$2,$3,'permission',$4,'with_permission',$5,$6,$7) RETURNING *`,[visit.student_id,visit.visitor_name,visit.visitor_relation,permissionId,req.user.userId,req.body?.remarks||null,personCount])).rows[0];await pool.query(`INSERT INTO gate_entry_logs(student_id,permission_type,permission_id,entered_by,remarks) VALUES($1,'visit',$2,$3,$4) ON CONFLICT DO NOTHING`,[visit.student_id,permissionId,req.user.userId,req.body?.remarks||null]);res.status(201).json({success:true,entry})}));
router.get('/dining',auth,allow('office','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const q=await pool.query('SELECT * FROM dining_stock ORDER BY item_name');res.json({success:true,stock:q.rows})}));
router.get('/dining/transactions',auth,allow('office','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const q=await pool.query(`SELECT t.*,s.item_name,s.unit,u.full_name entered_by_name FROM dining_stock_transactions t JOIN dining_stock s ON s.id=t.stock_id LEFT JOIN users u ON u.id=t.entered_by ORDER BY t.created_at DESC,t.id DESC LIMIT 500`);res.json({success:true,transactions:q.rows})}));
router.post('/dining/items',auth,allow('office','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const b=req.body||{};if(!b.item_name||!b.unit)return res.status(400).json({success:false,message:'Item and unit are required'});const q=await pool.query(`INSERT INTO dining_stock(item_name,unit,current_quantity,reorder_level) VALUES($1,$2,$3,$4) RETURNING *`,[b.item_name,b.unit,Number(b.current_quantity)||0,Number(b.reorder_level)||0]);res.status(201).json({success:true,item:q.rows[0]})}));
router.post('/dining/transaction',auth,allow('office','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const b=req.body||{},qty=Number(b.quantity);if(!b.stock_id||!['in','out'].includes(b.transaction_type)||!(qty>0))return res.status(400).json({success:false,message:'Stock item, type and positive quantity are required'});const c=await pool.connect();try{await c.query('BEGIN');const st=(await c.query('SELECT * FROM dining_stock WHERE id=$1 FOR UPDATE',[b.stock_id])).rows[0];if(!st)throw new Error('Stock item not found');const transactionDate=b.transaction_date||null;const duplicate=await c.query(`SELECT id FROM dining_stock_transactions WHERE stock_id=$1 AND transaction_type=$2 AND transaction_date=COALESCE($3::date,CURRENT_DATE) LIMIT 1`,[st.id,b.transaction_type,transactionDate]);if(duplicate.rowCount)throw new Error(st.item_name+' already has a Stock '+(b.transaction_type==='in'?'In':'Out')+' entry for this date');const next=Number(st.current_quantity)+(b.transaction_type==='in'?qty:-qty);if(next<0)throw new Error('Quantity Out cannot exceed available balance of '+Number(st.current_quantity)+' '+st.unit);await c.query('UPDATE dining_stock SET current_quantity=$1,updated_at=NOW() WHERE id=$2',[next,st.id]);await c.query(`INSERT INTO dining_stock_transactions(stock_id,transaction_type,quantity,note,entered_by,transaction_date,invoice_no,supplier_name,rate,opening_quantity,closing_quantity) VALUES($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE),$7,$8,$9,$10,$11)`,[st.id,b.transaction_type,qty,b.note||null,req.user.userId,b.transaction_date||null,b.invoice_no||null,b.supplier_name||null,b.rate===''||b.rate==null?null:Number(b.rate),Number(st.current_quantity),next]);await c.query('COMMIT');res.json({success:true,current_quantity:next})}catch(e){await c.query('ROLLBACK');res.status(409).json({success:false,message:e.message})}finally{c.release()}}));
router.get('/library/status',auth,allow('library','super_admin','admin'),asyncHandler(async(req,res)=>{
  await schemaReady;
  const status=String(req.query.status||'issued'),search='%'+String(req.query.q||'').trim()+'%';
  if(status==='never_issued'){
    const q=await pool.query(`
      SELECT b.id book_id, b.accession_no, b.book_number, b.title, b.author,
             b.book_class, b.category, b.rack_no, b.total_copies,
             GREATEST(b.available_copies,0)::int available_count,
             0::int total_times_issued,
             'Never Issued' status_note
      FROM library_books b
      WHERE b.is_active=TRUE
        AND NOT EXISTS(SELECT 1 FROM library_loans l WHERE l.book_id=b.id)
        AND ($1='%%' OR b.title ILIKE $1 OR b.accession_no ILIKE $1 OR COALESCE(b.book_number,'') ILIKE $1 OR COALESCE(b.author,'') ILIKE $1)
      ORDER BY b.title, b.accession_no
    `,[search]);
    return res.json({success:true,status,records:q.rows});
  }
  if(status==='returned'){
    const q=await pool.query(`
      SELECT l.id loan_id, l.issued_at, l.due_date, l.returned_at,
             b.id book_id, b.accession_no, b.book_number, b.title, b.author,
             s.id student_id, s.registration_no, s.student_name, s.class_name,
             'Returned' status_note
      FROM library_loans l
      JOIN library_books b ON b.id=l.book_id
      JOIN students s ON s.id=l.student_id
      WHERE l.returned_at IS NOT NULL
        AND ($1='%%' OR b.title ILIKE $1 OR b.accession_no ILIKE $1 OR COALESCE(b.book_number,'') ILIKE $1 OR s.student_name ILIKE $1 OR s.registration_no ILIKE $1)
      ORDER BY l.returned_at DESC
    `,[search]);
    return res.json({success:true,status,records:q.rows});
  }
  if(status==='all_loans'){
    const q=await pool.query(`
      SELECT l.id loan_id, l.issued_at, l.due_date, l.returned_at,
             b.id book_id, b.accession_no, b.book_number, b.title, b.author,
             s.id student_id, s.registration_no, s.student_name, s.class_name,
             CASE WHEN l.returned_at IS NULL THEN 'Issued' ELSE 'Returned' END status_note
      FROM library_loans l
      JOIN library_books b ON b.id=l.book_id
      JOIN students s ON s.id=l.student_id
      WHERE ($1='%%' OR b.title ILIKE $1 OR b.accession_no ILIKE $1 OR COALESCE(b.book_number,'') ILIKE $1 OR s.student_name ILIKE $1 OR s.registration_no ILIKE $1)
      ORDER BY l.issued_at DESC
    `,[search]);
    return res.json({success:true,status,records:q.rows});
  }
  if(status==='issued'){
    const q=await pool.query(`
      SELECT l.id loan_id, l.issued_at, l.due_date, l.returned_at,
             b.id book_id, b.accession_no, b.book_number, b.title, b.author,
             s.id student_id, s.registration_no, s.student_name, s.class_name,
             'Issued' status_note
      FROM library_loans l
      JOIN library_books b ON b.id=l.book_id
      JOIN students s ON s.id=l.student_id
      WHERE l.returned_at IS NULL
        AND ($1='%%' OR b.title ILIKE $1 OR b.accession_no ILIKE $1 OR COALESCE(b.book_number,'') ILIKE $1 OR s.student_name ILIKE $1 OR s.registration_no ILIKE $1)
      ORDER BY l.issued_at DESC
    `,[search]);
    return res.json({success:true,status,records:q.rows});
  }
  const q=await pool.query(`
    SELECT b.*,GREATEST(b.available_copies,0)::int available_count,
           (SELECT COUNT(*)::int FROM library_loans l WHERE l.book_id=b.id) total_times_issued,
           'Available' status_note
    FROM library_books b
    WHERE b.is_active=TRUE AND b.available_copies>0
      AND ($1='%%' OR b.title ILIKE $1 OR b.accession_no ILIKE $1 OR COALESCE(b.author,'') ILIKE $1)
    ORDER BY b.title,b.accession_no
  `,[search]);
  res.json({success:true,status:'available',records:q.rows});
}));
router.get('/library/books',auth,allow('library','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const q=await pool.query(`SELECT b.*,(SELECT COUNT(*) FROM library_loans l WHERE l.book_id=b.id AND l.returned_at IS NULL) issued_count FROM library_books b WHERE b.is_active=TRUE AND ($1='' OR b.title ILIKE $2 OR b.accession_no ILIKE $2) AND ($3='' OR b.category=$3) AND ($4='' OR b.book_class=$4) ORDER BY b.title`,[String(req.query.q||''),'%'+String(req.query.q||'')+'%',String(req.query.category||''),String(req.query.book_class||'')]);res.json({success:true,books:q.rows})}));
router.post('/library/books',auth,allow('library','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const b=req.body||{},copies=Math.max(1,Number(b.total_copies)||1);if(!b.accession_no||!b.title)return res.status(400).json({success:false,message:'Accession number and title are required'});const q=await pool.query(`INSERT INTO library_books(accession_no,title,author,total_copies,available_copies,book_class,part,category,publisher,publish_year,price,purchase_date,rack_no,book_number) VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[b.accession_no,b.title,b.author||null,copies,b.book_class||null,b.part||null,b.category||null,b.publisher||null,b.publish_year?Number(b.publish_year):null,b.price?Number(b.price):null,b.purchase_date||null,b.rack_no||null,b.book_number||null]);res.status(201).json({success:true,book:q.rows[0]})}));
router.patch('/library/books/:id',auth,allow('library','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const b=req.body||{},copies=Math.max(1,Number(b.total_copies)||1),current=(await pool.query('SELECT * FROM library_books WHERE id=$1 AND is_active=TRUE',[req.params.id])).rows[0];if(!current)return res.status(404).json({success:false,message:'Book not found'});const issued=Number(current.total_copies)-Number(current.available_copies);if(copies<issued)return res.status(409).json({success:false,message:`Total copies cannot be less than ${issued} currently issued copies`});const q=await pool.query(`UPDATE library_books SET accession_no=$1,title=$2,author=$3,total_copies=$4,available_copies=$4-$5,book_class=$6,part=$7,category=$8,publisher=$9,publish_year=$10,price=$11,purchase_date=$12,rack_no=$13,book_number=$14,updated_at=NOW() WHERE id=$15 RETURNING *`,[b.accession_no,b.title,b.author||null,copies,issued,b.book_class||null,b.part||null,b.category||null,b.publisher||null,b.publish_year?Number(b.publish_year):null,b.price?Number(b.price):null,b.purchase_date||null,b.rack_no||null,b.book_number||null,req.params.id]);res.json({success:true,book:q.rows[0]})}));
router.patch('/library/books/:id/archive',auth,allow('library','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;if((await pool.query('SELECT 1 FROM library_loans WHERE book_id=$1 AND returned_at IS NULL',[req.params.id])).rowCount)return res.status(409).json({success:false,message:'Return all issued copies before archiving this book'});const q=await pool.query('UPDATE library_books SET is_active=FALSE,updated_at=NOW() WHERE id=$1 AND is_active=TRUE RETURNING id',[req.params.id]);if(!q.rowCount)return res.status(404).json({success:false,message:'Active book not found'});res.json({success:true})}));router.get('/library/book/:barcode',auth,allow('library','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const code=String(req.params.barcode||'').trim();const book=(await pool.query(`SELECT b.*,(SELECT COUNT(*) FROM library_loans l WHERE l.book_id=b.id AND l.returned_at IS NULL) issued_count FROM library_books b WHERE b.is_active=TRUE AND (lower(b.accession_no)=lower($1) OR lower(COALESCE(b.book_number,''))=lower($1)) LIMIT 1`,[code])).rows[0];if(!book)return res.status(404).json({success:false,message:'Book Number / Barcode not found'});if(Number(book.available_copies)<1)return res.status(409).json({success:false,message:'This book already issued.',book});res.json({success:true,book})}));router.get('/library/students/search/:query',auth,allow('library','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const q=String(req.params.query||'').trim();const rows=(await pool.query('SELECT id,registration_no,student_name,class_name,photo_url FROM students WHERE is_active=TRUE AND (registration_no=$1 OR student_name ILIKE $2) ORDER BY student_name,registration_no LIMIT 50',[q,'%'+q+'%'])).rows;res.json({success:true,students:rows})}));router.get('/library/return-book/:barcode',auth,allow('library','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const q=await pool.query(`SELECT l.*,s.id AS student_id,s.registration_no,s.student_name,s.class_name,s.photo_url,b.accession_no,b.title,b.author FROM library_loans l JOIN students s ON s.id=l.student_id JOIN library_books b ON b.id=l.book_id WHERE l.returned_at IS NULL AND (lower(b.accession_no)=lower($1) OR lower(COALESCE(b.book_number,''))=lower($1)) LIMIT 1`,[String(req.params.barcode||'').trim()]);const x=q.rows[0];if(!x)return res.status(404).json({success:false,message:'Issued book not found'});res.json({success:true,student:{id:x.student_id,registration_no:x.registration_no,student_name:x.student_name,class_name:x.class_name,photo_url:x.photo_url},loans:[x]})}));router.get('/library/student/:registration',auth,allow('library','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const st=(await pool.query('SELECT id,registration_no,student_name,class_name,photo_url FROM students WHERE registration_no=$1 AND is_active=TRUE',[req.params.registration])).rows[0];if(!st)return res.status(404).json({success:false,message:'Active student not found'});const loans=(await pool.query(`SELECT l.*,b.accession_no,b.title,b.author,b.rack_no,b.book_number,u.full_name issued_by_name FROM library_loans l JOIN library_books b ON b.id=l.book_id LEFT JOIN users u ON u.id=l.issued_by WHERE l.student_id=$1 ORDER BY l.returned_at NULLS FIRST,l.issued_at DESC`,[st.id])).rows;res.json({success:true,student:st,loans})}));
router.post('/library/issue',auth,allow('library','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const b=req.body||{};if(!b.book_id||!b.student_id||!b.due_date)return res.status(400).json({success:false,message:'Book, student and due date are required'});const c=await pool.connect();try{await c.query('BEGIN');
const student=(await c.query('SELECT id,registration_no,student_name,class_name,photo_url FROM students WHERE id=$1 FOR UPDATE',[b.student_id])).rows[0];
if(!student)throw new Error('Student not found');
const activeLoans=Number((await c.query('SELECT COUNT(*) AS count FROM library_loans WHERE student_id=$1 AND returned_at IS NULL',[b.student_id])).rows[0].count);
if(activeLoans>=2)throw new Error('This student already has 2 issued books. Return a book before issuing another.');
const book=(await c.query('SELECT * FROM library_books WHERE id=$1 FOR UPDATE',[b.book_id])).rows[0];if(!book)throw new Error('Book not found');if(book.available_copies<1)throw new Error('This book already issued.');
const issuer=(await c.query('SELECT full_name FROM users WHERE id=$1',[req.user.userId])).rows[0];
const issuedByName=issuer?.full_name||req.user.loginId||'';
const loanRes=await c.query(`INSERT INTO library_loans(book_id,student_id,due_date,issued_by) VALUES($1,$2,$3,$4) RETURNING id,issued_at,due_date`,[book.id,b.student_id,b.due_date,req.user.userId]);
await c.query('UPDATE library_books SET available_copies=available_copies-1 WHERE id=$1',[book.id]);
await c.query('COMMIT');
res.status(201).json({
  success:true,
  loan_id:loanRes.rows[0].id,
  issued_at:loanRes.rows[0].issued_at,
  due_date:loanRes.rows[0].due_date,
  issued_by_name:issuedByName,
  student,
  book
})}catch(e){await c.query('ROLLBACK');res.status(409).json({success:false,message:e.message})}finally{c.release()}}));
router.patch('/library/loans/:id/return',auth,allow('library','super_admin','admin'),asyncHandler(async(req,res)=>{await schemaReady;const c=await pool.connect();try{await c.query('BEGIN');const loan=(await c.query('UPDATE library_loans SET returned_at=NOW(),returned_by=$1 WHERE id=$2 AND returned_at IS NULL RETURNING *',[req.user.userId,req.params.id])).rows[0];if(!loan)throw new Error('Active loan not found');await c.query('UPDATE library_books SET available_copies=available_copies+1 WHERE id=$1',[loan.book_id]);await c.query('COMMIT');res.json({success:true})}catch(e){await c.query('ROLLBACK');res.status(409).json({success:false,message:e.message})}finally{c.release()}}));
router.delete('/library/loans/:id',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
  await schemaReady;
  const loanId=req.params.id;
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const loan=(await c.query('SELECT * FROM library_loans WHERE id=$1 FOR UPDATE',[loanId])).rows[0];
    if(!loan){
      await c.query('ROLLBACK');
      return res.status(404).json({success:false,message:'Loan record not found'});
    }
    if(!loan.returned_at){
      await c.query('UPDATE library_books SET available_copies=LEAST(total_copies,available_copies+1) WHERE id=$1',[loan.book_id]);
    }
    await c.query('DELETE FROM library_loans WHERE id=$1',[loanId]);
    await c.query('COMMIT');
    res.json({success:true,message:'Loan history record deleted successfully'});
  }catch(e){
    await c.query('ROLLBACK');
    res.status(500).json({success:false,message:e.message});
  }finally{
    c.release();
  }
}));
module.exports=router;



// ==========================================
// GATE DUTY & STAFF ATTENDANCE INTEGRATION
// ==========================================

router.get('/gate-duty/status', auth, allow('gateman','super_admin','admin'), asyncHandler(async(req,res)=>{
  await schemaReady;
  const userId = req.user.userId;
  const todayDuty = (await pool.query(
    "SELECT * FROM gate_duty_logs WHERE user_id = $1 AND duty_date = CURRENT_DATE ORDER BY start_time DESC LIMIT 1",
    [userId]
  )).rows[0] || null;

  const staff = (await pool.query(
    "SELECT p.* FROM service_staff_profiles p WHERE p.user_id = $1 LIMIT 1",
    [userId]
  )).rows[0];

  let attendanceStatus = null;
  if (staff) {
    const t = (await pool.query(
      "SELECT id FROM teachers WHERE staff_id = $1 OR user_id = $2 LIMIT 1",
      [staff.staff_id, userId]
    )).rows[0];
    if (t) {
      const att = (await pool.query(
        "SELECT status, punch_in, punch_out FROM staff_attendance WHERE teacher_id = $1 AND attendance_date = CURRENT_DATE",
        [t.id]
      )).rows[0];
      if (att) attendanceStatus = att.status;
    }
  }

  res.json({
    success: true,
    on_duty: !!(todayDuty && todayDuty.status === 'on_duty' && !todayDuty.end_time),
    duty: todayDuty,
    attendance: attendanceStatus,
    start_time: todayDuty?.start_time || null
  });
}));

router.post('/gate-duty/start', auth, allow('gateman','super_admin','admin'), asyncHandler(async(req,res)=>{
  await schemaReady;
  const userId = req.user.userId;

  // 1. Get staff info
  let staff = (await pool.query(
    "SELECT p.*, u.full_name, u.login_id FROM service_staff_profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1",
    [userId]
  )).rows[0];

  if (!staff) {
    const u = (await pool.query("SELECT * FROM users WHERE id = $1", [userId])).rows[0];
    staff = { user_id: userId, staff_id: u?.login_id, name: u?.full_name || 'Gateman' };
  }

  // 2. Find or create in teachers table so it connects to staff_attendance
  let teacher = (await pool.query(
    "SELECT id FROM teachers WHERE staff_id = $1 OR user_id = $2 LIMIT 1",
    [staff.staff_id, userId]
  )).rows[0];

  if (!teacher) {
    teacher = (await pool.query(
      "INSERT INTO teachers(staff_id, name, designation, is_active, user_id, profile_details) VALUES($1, $2, 'Security Guard', TRUE, $3, $4::jsonb) RETURNING id",
      [staff.staff_id, staff.name, userId, JSON.stringify({ staff_type: 'Security Guard', staff_category: 'Nonteaching' })]
    )).rows[0];
  }

  // 3. Mark in staff_attendance as 'Present'
  if (teacher?.id) {
    await pool.query(`
      INSERT INTO staff_attendance(teacher_id, attendance_date, status, marked_by, punch_in, remark, updated_at)
      VALUES($1, CURRENT_DATE, 'Present', $2, NOW(), 'Gate Duty Start', NOW())
      ON CONFLICT(teacher_id, attendance_date)
      DO UPDATE SET status = 'Present', punch_in = COALESCE(staff_attendance.punch_in, NOW()), remark = 'Gate Duty Start', updated_at = NOW()
    `, [teacher.id, userId]);
  }

  // 4. Record in gate_duty_logs
  let duty = (await pool.query(
    "SELECT * FROM gate_duty_logs WHERE user_id = $1 AND duty_date = CURRENT_DATE AND status = 'on_duty' ORDER BY start_time DESC LIMIT 1",
    [userId]
  )).rows[0];

  if (!duty) {
    duty = (await pool.query(
      "INSERT INTO gate_duty_logs(user_id, staff_id, staff_name, duty_date, start_time, status) VALUES($1, $2, $3, CURRENT_DATE, NOW(), 'on_duty') RETURNING *",
      [userId, staff.staff_id, staff.name]
    )).rows[0];
  }

  res.json({
    success: true,
    message: 'Gate duty started! Attendance marked as Present.',
    duty,
    attendance: 'Present',
    start_time: duty.start_time
  });
}));

router.post('/gate-duty/end', auth, allow('gateman','super_admin','admin'), asyncHandler(async(req,res)=>{
  await schemaReady;
  const userId = req.user.userId;

  const duty = (await pool.query(
    "UPDATE gate_duty_logs SET end_time = NOW(), status = 'completed' WHERE user_id = $1 AND duty_date = CURRENT_DATE AND status = 'on_duty' RETURNING *",
    [userId]
  )).rows[0];

  const staff = (await pool.query(
    "SELECT p.* FROM service_staff_profiles p WHERE p.user_id = $1 LIMIT 1",
    [userId]
  )).rows[0];

  if (staff) {
    const t = (await pool.query(
      "SELECT id FROM teachers WHERE staff_id = $1 OR user_id = $2 LIMIT 1",
      [staff.staff_id, userId]
    )).rows[0];
    if (t) {
      await pool.query(
        "UPDATE staff_attendance SET punch_out = NOW(), updated_at = NOW() WHERE teacher_id = $1 AND attendance_date = CURRENT_DATE",
        [t.id]
      );
    }
  }

  res.json({
    success: true,
    message: 'Gate duty ended successfully.',
    duty
  });
}));
