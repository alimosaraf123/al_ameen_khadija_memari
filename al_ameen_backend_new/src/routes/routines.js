const express=require('express');
const fs=require('fs');
const path=require('path');
const {sendPushForNotice}=require('../utils/pushNotifications');
const sharp=require('sharp');
const pool=require('../db');
const {auth,allow}=require('../middleware/auth');
const asyncHandler=require('../utils/asyncHandler');
const router=express.Router();
const GROUPS=['v_x','xi_xii','coaching'];
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
const xml=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const short=(v,n=24)=>{const s=String(v||'-');return s.length>n?s.slice(0,n-1)+'…':s};
async function renderRoutineJpg({group,date,data}){
 const academic=group!=='coaching',columns=academic?(data.periods||[]):(data.rooms||[]),rows=academic?(data.classes||[]):(data.times||[]);
 const firstWidth=155,cellWidth=Math.max(150,Math.min(230,Math.floor((1500-firstWidth)/Math.max(columns.length,1)))),rowHeight=88,headerHeight=100,width=firstWidth+cellWidth*Math.max(columns.length,1)+40,height=Math.max(430,190+headerHeight+rowHeight*Math.max(rows.length,1));
 const groupTitle={v_x:'Class V-X',xi_xii:'Class XI-XII',coaching:'Coaching'}[group]||group;
 let body=`<rect width="100%" height="100%" fill="#fff"/><text x="${width/2}" y="45" text-anchor="middle" font-size="29" font-weight="700" fill="#173f77">Al-Ameen Mission Academy Memari</text><text x="${width/2}" y="80" text-anchor="middle" font-size="22" font-weight="700">${xml(groupTitle)} Routine - ${xml(date)}</text>`;
 if(data.no_class)body+=`<text x="${width/2}" y="210" text-anchor="middle" font-size="34" font-weight="700" fill="#9a1e25">No class / coaching</text>`;
 else{const top=120,left=20;body+=`<rect x="${left}" y="${top}" width="${firstWidth}" height="${headerHeight}" fill="#cfe1f4" stroke="#789"/><text x="${left+firstWidth/2}" y="${top+55}" text-anchor="middle" font-size="17" font-weight="700">${academic?'Class / Period':'Time / Room'}</text>`;columns.forEach((column,index)=>{const x=left+firstWidth+index*cellWidth,label=academic?`${column[0]||''} ${column[1]||''}`:column;body+=`<rect x="${x}" y="${top}" width="${cellWidth}" height="${headerHeight}" fill="#cfe1f4" stroke="#789"/><text x="${x+cellWidth/2}" y="${top+43}" text-anchor="middle" font-size="16" font-weight="700">${xml(short(label,22))}</text>`});rows.forEach((row,rowIndex)=>{const y=top+headerHeight+rowIndex*rowHeight;body+=`<rect x="${left}" y="${y}" width="${firstWidth}" height="${rowHeight}" fill="#dce9f6" stroke="#789"/><text x="${left+firstWidth/2}" y="${y+50}" text-anchor="middle" font-size="17" font-weight="700">${xml(short(row,20))}</text>`;columns.forEach((column,columnIndex)=>{const x=left+firstWidth+columnIndex*cellWidth,key=academic?`${row}|${columnIndex}`:`${row}|${column}`,cell=(data.cells||{})[key]||{},tiffin=academic&&String(column?.[0]||'').toLowerCase()==='tiffin';body+=`<rect x="${x}" y="${y}" width="${cellWidth}" height="${rowHeight}" fill="${tiffin?'#fff0be':rowIndex%2?'#f1f7fd':'#fff'}" stroke="#789"/>`;if(tiffin)body+=`<text x="${x+cellWidth/2}" y="${y+50}" text-anchor="middle" font-size="17" font-weight="700">TIFFIN</text>`;else{if(academic&&cell.subject)body+=`<text x="${x+cellWidth/2}" y="${y+34}" text-anchor="middle" font-size="16" font-weight="700">${xml(short(cell.subject,20))}</text>`;if(cell.teacher_name)body+=`<text x="${x+cellWidth/2}" y="${y+(academic?61:50)}" text-anchor="middle" font-size="${academic?17:18}"${String(cell.teacher_name).length>16?` textLength="${cellWidth-16}" lengthAdjust="spacingAndGlyphs"`:""}>${xml(short(cell.teacher_name,22))}</text>`}})})}
 body+=`<text x="${width-25}" y="${height-25}" text-anchor="end" font-size="14" font-style="italic">Published routine</text>`;
 return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`)).jpeg({quality:90}).toBuffer();
}
async function publishRoutineJpg({group,date,data,userId}){
 const groupTitle={v_x:'Class V-X',xi_xii:'Class XI-XII',coaching:'Coaching'}[group]||group;
 const image=await renderRoutineJpg({group,date,data}),dir=path.resolve(__dirname,'../../uploads/routines'),name=`routine-${group}-${date}.jpg`,target=path.join(dir,name),temporary=target+'.'+Date.now()+'.tmp';
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(temporary,image);fs.rmSync(target,{force:true});fs.renameSync(temporary,target);const url='/uploads/routines/'+name;
 const old=(await pool.query('SELECT id FROM routines WHERE routine_date=$1 AND title=$2 ORDER BY published_at DESC LIMIT 1',[date,`${groupTitle} Routine`])).rows[0];
 if(old)await pool.query('UPDATE routines SET title=$1,routine_text=$2,file_url=$3,published_by=$4,is_active=TRUE,published_at=NOW() WHERE id=$5',[`${groupTitle} Routine`,`${groupTitle} published routine`,url,userId,old.id]);
 else await pool.query('INSERT INTO routines(title,routine_date,routine_text,file_url,published_by,is_active) VALUES($1,$2,$3,$4,$5,TRUE)',[`${groupTitle} Routine`,date,`${groupTitle} published routine`,url,userId]);
 return url;
}

router.get('/',auth,allow('super_admin','admin','teacher'),asyncHandler(async(req,res)=>{
 const teacher=req.user.role==='teacher';
 const r=await pool.query(`SELECT * FROM routines WHERE is_active=TRUE ${teacher?'AND file_url IS NOT NULL':''} ORDER BY published_at DESC`);
 res.json({success:true,routines:r.rows});
}));
router.post('/',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const b=req.body||{},r=await pool.query('INSERT INTO routines(title,routine_date,routine_text,file_url,published_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[b.title||null,b.routine_date||null,b.routine_text||null,b.file_url||null,req.user.userId]);
 res.status(201).json({success:true,routine:r.rows[0]});
}));

router.get('/exams',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const month=String(req.query.month||new Date().toISOString().slice(0,7));
 if(!/^\d{4}-\d{2}$/.test(month))return res.status(400).json({success:false,message:'Valid month is required'});
 const r=await pool.query(`SELECT e.*,to_char(e.exam_date,'YYYY-MM-DD') exam_date,to_char(e.end_date,'YYYY-MM-DD') end_date,u.full_name created_by_name FROM routine_exam_entries e LEFT JOIN users u ON u.id=e.created_by WHERE to_char(e.exam_date,'YYYY-MM')=$1 ORDER BY e.exam_date,e.start_time,e.id`,[month]);
 const counts=new Map();for(const e of r.rows){if(!e.duty_final)continue;(e.teacher_names||[]).forEach((name,i)=>{const id=String((e.teacher_ids||[])[i]||name),old=counts.get(id)||{teacher_id:id,teacher_name:name,duty_count:0};old.duty_count++;counts.set(id,old)})}
 res.json({success:true,exams:r.rows,duty_counts:[...counts.values()].sort((a,b)=>a.teacher_name.localeCompare(b.teacher_name))});
}));
router.post('/exams',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const b=req.body||{},classes=Array.isArray(b.class_names)?b.class_names.filter(Boolean):[],teacherIds=Array.isArray(b.teacher_ids)?b.teacher_ids.filter(Boolean):[],teacherNames=Array.isArray(b.teacher_names)?b.teacher_names.filter(Boolean):[];
 if(!['v_x','xi_xii'].includes(b.group_name)||!validDate(b.exam_date)||!classes.length||!b.subject||!/^\d{2}:\d{2}$/.test(String(b.start_time||''))||!/^\d{2}:\d{2}$/.test(String(b.end_time||''))||!teacherIds.length)return res.status(400).json({success:false,message:'Group, date, class, subject, time and duty teacher are required'});
 const r=await pool.query(`INSERT INTO routine_exam_entries(group_name,exam_date,end_date,class_names,subject,start_time,end_time,room,teacher_ids,teacher_names,suppress_regular,duty_final,created_by) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13) RETURNING *`,[b.group_name,b.exam_date,b.end_date||null,JSON.stringify(classes),b.subject,b.start_time,b.end_time,b.room||null,JSON.stringify(teacherIds),JSON.stringify(teacherNames),b.suppress_regular!==false,!!b.duty_final,req.user.userId]);res.status(201).json({success:true,exam:r.rows[0]});
}));
router.put('/exams/:id',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const b=req.body||{},classes=Array.isArray(b.class_names)?b.class_names.filter(Boolean):[],teacherIds=Array.isArray(b.teacher_ids)?b.teacher_ids.filter(Boolean):[],teacherNames=Array.isArray(b.teacher_names)?b.teacher_names.filter(Boolean):[];
 if(!['v_x','xi_xii'].includes(b.group_name)||!validDate(b.exam_date)||!classes.length||!b.subject||!teacherIds.length)return res.status(400).json({success:false,message:'Complete all required exam fields'});
 const r=await pool.query(`UPDATE routine_exam_entries SET group_name=$1,exam_date=$2,end_date=$3,class_names=$4::jsonb,subject=$5,start_time=$6,end_time=$7,room=$8,teacher_ids=$9::jsonb,teacher_names=$10::jsonb,suppress_regular=$11,duty_final=$12,updated_at=NOW() WHERE id=$13 RETURNING *`,[b.group_name,b.exam_date,b.end_date||null,JSON.stringify(classes),b.subject,b.start_time,b.end_time,b.room||null,JSON.stringify(teacherIds),JSON.stringify(teacherNames),b.suppress_regular!==false,!!b.duty_final,req.params.id]);if(!r.rowCount)return res.status(404).json({success:false,message:'Exam routine not found'});res.json({success:true,exam:r.rows[0]});
}));
router.patch('/exams/:id/final',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{const r=await pool.query('UPDATE routine_exam_entries SET duty_final=$1,updated_at=NOW() WHERE id=$2 RETURNING *',[req.body?.duty_final!==false,req.params.id]);if(!r.rowCount)return res.status(404).json({success:false,message:'Exam routine not found'});res.json({success:true,exam:r.rows[0]});}));
router.delete('/exams/:id',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{const r=await pool.query('DELETE FROM routine_exam_entries WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rowCount)return res.status(404).json({success:false,message:'Exam routine not found'});res.json({success:true});}));
router.get('/manager',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const group=String(req.query.group||'v_x'),date=String(req.query.date||new Date().toISOString().slice(0,10));
 if(!GROUPS.includes(group)||!validDate(date))return res.status(400).json({success:false,message:'Valid group and date are required'});
 const r=await pool.query(`SELECT g.*,u.full_name updated_by_name,
  CASE WHEN g.routine_date=$2::date AND g.routine_kind='daily' THEN 'final' ELSE 'master' END source
  FROM routine_manager_grids g LEFT JOIN users u ON u.id=g.created_by
  WHERE g.group_name=$1 AND ((g.routine_date=$2::date AND g.routine_kind='daily') OR
  (g.is_master=TRUE AND EXTRACT(DOW FROM g.routine_date)=EXTRACT(DOW FROM $2::date)))
  ORDER BY (g.routine_date=$2::date AND g.routine_kind='daily') DESC,g.updated_at DESC LIMIT 1`,[group,date]);
 res.json({success:true,routine:r.rows[0]||null});
}));

router.get('/manager/master',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const group=String(req.query.group||'v_x'),day=Number(req.query.day);
 if(!GROUPS.includes(group)||!Number.isInteger(day)||day<0||day>6)return res.status(400).json({success:false,message:'Valid group and weekday are required'});
 const r=await pool.query(`SELECT g.*,u.full_name updated_by_name,'master' source FROM routine_manager_grids g LEFT JOIN users u ON u.id=g.created_by WHERE g.group_name=$1 AND g.routine_kind='master' AND g.is_master=TRUE AND EXTRACT(DOW FROM g.routine_date)=$2 ORDER BY g.updated_at DESC LIMIT 1`,[group,day]);
 res.json({success:true,routine:r.rows[0]||null});
}));

router.get('/manager/backup',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const group=String(req.query.group||'all');
 if(group!=='all'&&!GROUPS.includes(group))return res.status(400).json({success:false,message:'Valid group is required'});
 const sql=`SELECT g.*,u.full_name updated_by_name FROM routine_manager_grids g LEFT JOIN users u ON u.id=g.created_by`+(group==='all'?'':` WHERE g.group_name=$1`)+` ORDER BY g.group_name,g.routine_date,g.routine_kind`;
 const q=await pool.query(sql,group==='all'?[]:[group]);
 res.json({version:1,created_at:new Date().toISOString(),group,routines:q.rows});
}));

router.get('/manager/history',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const r=await pool.query(`SELECT g.id,g.group_name,g.routine_date,g.routine_kind,g.is_master,g.is_published,g.updated_at,
  g.grid_data->>'no_class' no_class,u.full_name updated_by_name FROM routine_manager_grids g
  LEFT JOIN users u ON u.id=g.created_by WHERE g.group_name=$1
  ORDER BY g.routine_date DESC,g.updated_at DESC LIMIT 120`,[String(req.query.group||'v_x')]);
 res.json({success:true,routines:r.rows});
}));

router.get('/manager/report',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const group=String(req.query.group||'v_x'),month=String(req.query.month||new Date().toISOString().slice(0,7));
 if(!GROUPS.includes(group)||!/^\d{4}-\d{2}$/.test(month))return res.status(400).json({success:false,message:'Valid group and month are required'});
 const q=await pool.query(`SELECT to_char(routine_date,'YYYY-MM-DD') routine_date,grid_data FROM routine_manager_grids WHERE group_name=$1
  AND routine_kind='daily' AND is_published=TRUE AND to_char(routine_date,'YYYY-MM')=$2 ORDER BY routine_date`,[group,month]);
 const rows=[],totals=new Map();
 for(const routine of q.rows){const data=routine.grid_data||{};if(data.no_class)continue;
  for(const[position,cell]of Object.entries(data.cells||{})){if(!cell||!cell.teacher_id)continue;
   const p=position.split('|'),item={date:String(routine.routine_date).slice(0,10),class_or_room:group==='coaching'?p[1]:p[0],period_or_time:group==='coaching'?p[0]:p[1],subject:cell.subject||'',teacher_id:String(cell.teacher_id),teacher_name:cell.teacher_name||'Teacher'};
   rows.push(item);const countKey=data.combined_class_counting&&group!=='coaching'?item.teacher_id+'|'+item.period_or_time:item.teacher_id+'|'+item.class_or_room+'|'+item.period_or_time;if(!data.__counted)data.__counted={};if(!data.__counted[countKey]){data.__counted[countKey]=true;const old=totals.get(item.teacher_id)||{teacher_id:item.teacher_id,teacher_name:item.teacher_name,class_count:0};old.class_count++;totals.set(item.teacher_id,old);}
  }
 }
 res.json({success:true,rows,totals:[...totals.values()].sort((a,b)=>a.teacher_name.localeCompare(b.teacher_name))});
}));

router.post('/manager',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const b=req.body||{},saveMode=b.save_mode==='master'?'master':'final';
 if(!GROUPS.includes(b.group_name)||!validDate(b.routine_date))return res.status(400).json({success:false,message:'Valid group and date are required'});
 const kind=saveMode==='master'?'master':'daily',isMaster=saveMode==='master',published=saveMode==='final';
 const r=await pool.query(`INSERT INTO routine_manager_grids(group_name,routine_date,routine_kind,grid_data,is_master,is_published,created_by)
  VALUES($1,$2,$3,$4::jsonb,$5,$6,$7) ON CONFLICT(group_name,routine_date,routine_kind) DO UPDATE SET
  grid_data=EXCLUDED.grid_data,is_master=EXCLUDED.is_master,is_published=EXCLUDED.is_published,
  created_by=EXCLUDED.created_by,updated_at=NOW() RETURNING *`,[b.group_name,b.routine_date,kind,JSON.stringify(b.grid_data||{}),isMaster,published,req.user.userId]);
 if(isMaster)await pool.query(`UPDATE routine_manager_grids SET is_master=FALSE WHERE group_name=$1
  AND routine_kind='master' AND id<>$2 AND EXTRACT(DOW FROM routine_date)=EXTRACT(DOW FROM $3::date)`,[b.group_name,r.rows[0].id,b.routine_date]);
 const publishedImageUrl=isMaster?null:await publishRoutineJpg({group:b.group_name,date:b.routine_date,data:b.grid_data||{},userId:req.user.userId});
 if(!isMaster){const notice=(await pool.query(`INSERT INTO notices(title,notice_text,notice_type,published_by) VALUES($1,$2,'routine',$3) RETURNING id`,[`New ${b.group_name} routine published`,`Routine for ${b.group_name} on ${b.routine_date} is now available.`,req.user.userId])).rows[0];await pool.query(`INSERT INTO notice_targets(notice_id,target_type,target_value) VALUES($1,'role','teacher'),($1,'role','guardian')`,[notice.id]);sendPushForNotice(notice.id).catch(error=>console.error('Routine push notification failed:',error.message));}
 res.json({success:true,routine:r.rows[0],published_image_url:publishedImageUrl,message:isMaster?'Weekday Master routine saved':'Final routine published as JPG'});
}));

router.delete('/manager/:id',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const r=await pool.query('DELETE FROM routine_manager_grids WHERE id=$1 RETURNING id',[req.params.id]);
 if(!r.rowCount)return res.status(404).json({success:false,message:'Routine not found'});
 res.json({success:true,message:'Routine deleted'});
}));
// Upload disks may be empty after deployment. Rebuild only published routine images.
router.servePublishedImage=asyncHandler(async(req,res,next)=>{
 const match=/^routine-(v_x|xi_xii|coaching)-(\d{4}-\d{2}-\d{2})\.jpg$/.exec(req.params.filename||'');
 if(!match)return next();
 const [,group,date]=match;
 const routine=await pool.query(`SELECT g.grid_data FROM routine_manager_grids g
  JOIN routines r ON r.routine_date=g.routine_date AND r.file_url=$3 AND r.is_active=TRUE
  WHERE g.group_name=$1 AND to_char(g.routine_date,'YYYY-MM-DD')=$2
  AND g.routine_kind='daily' AND g.is_published=TRUE LIMIT 1`,[group,date,'/uploads/routines/'+req.params.filename]);
 if(!routine.rows.length)return next();
 const image=await renderRoutineJpg({group,date,data:routine.rows[0].grid_data||{}});
 res.type('jpeg').set('Cache-Control','public, max-age=300').send(image);
});
module.exports=router;
