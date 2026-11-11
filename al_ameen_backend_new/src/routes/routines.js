const express=require('express');
const ExcelJS=require('exceljs');
const fs=require('fs');
const path=require('path');
const sharp=require('sharp');
const pool=require('../db');
const {auth,allow}=require('../middleware/auth');
const asyncHandler=require('../utils/asyncHandler');
const { sendPushForRoutine } = require('../utils/pushNotifications');
const router=express.Router();
const GROUPS=['v_x','xi_xii','coaching'];
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
const xml=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const short=(v,n=24)=>{const s=String(v||'-');return s.length>n?s.slice(0,n-1)+'…':s};
async function teacherOnlyGridData(data){
 const rows=await pool.query(`SELECT t.id FROM teachers t LEFT JOIN users u ON u.id=t.user_id
  WHERE t.is_active=TRUE AND COALESCE(u.is_active,TRUE)=TRUE AND (
    LOWER(COALESCE(t.profile_details->>'staff_category','')) LIKE '%teach%'
    OR LOWER(COALESCE(t.designation,'')) LIKE '%teach%'
    OR LOWER(COALESCE(t.profile_details->>'staff_type','')) LIKE '%teach%'
    OR LOWER(COALESCE(t.profile_details->>'type_of_staff','')) LIKE '%teach%'
    OR LOWER(COALESCE(u.role,'')) = 'teacher'
  ) AND LOWER(COALESCE(t.designation,'')) NOT LIKE '%nonteach%'
  AND LOWER(COALESCE(t.profile_details->>'staff_category','')) NOT LIKE '%nonteach%'`);
 const ids=new Set(rows.rows.map(row=>String(row.id)));
 const source=data&&typeof data==='object'?data:{};
 const cells=Object.fromEntries(Object.entries(source.cells||{}).filter(([,cell])=>ids.has(String(cell?.teacher_id||''))));
 return {...source,cells};
}
async function renderRoutineJpg({group,date,data}){
 data=await teacherOnlyGridData(data);
 const academic=group!=='coaching';let columns=academic?(data.periods||[]):(data.rooms||[]);const rows=academic?(data.classes||[]):(data.times||[]);if(!academic){const used=new Set(Object.entries(data.cells||{}).filter(([,cell])=>cell&&cell.teacher_id).map(([key])=>String(key).split('|').slice(1).join('|')));const filtered=columns.filter((room)=>used.has(String(room)));if(filtered.length)columns=filtered;}
 const offRows=new Set((academic?(data.off_classes||[]):(data.off_times||[])).map(String));
 const firstWidth=155,cellWidth=Math.max(150,Math.min(230,Math.floor((1500-firstWidth)/Math.max(columns.length,1)))),rowHeight=88,headerHeight=100,width=firstWidth+cellWidth*Math.max(columns.length,1)+40,height=Math.max(430,190+headerHeight+rowHeight*Math.max(rows.length,1));
 const groupTitle={v_x:'Class V-X',xi_xii:'Class XI-XII',coaching:'Coaching'}[group]||group;
 let body=`<rect width="100%" height="100%" fill="#fff"/><text x="${width/2}" y="45" text-anchor="middle" font-size="29" font-weight="700" fill="#173f77">Al-Ameen Mission Academy Memari</text><text x="${width/2}" y="80" text-anchor="middle" font-size="22" font-weight="700">${xml(groupTitle)} Routine - ${xml(date)}</text>`;
 if(data.no_class)body+=`<text x="${width/2}" y="210" text-anchor="middle" font-size="34" font-weight="700" fill="#9a1e25">No class / coaching</text>`;
 else{const top=120,left=20;body+=`<rect x="${left}" y="${top}" width="${firstWidth}" height="${headerHeight}" fill="#cfe1f4" stroke="#789"/><text x="${left+firstWidth/2}" y="${top+55}" text-anchor="middle" font-size="17" font-weight="700">${academic?'Class / Period':'Time / Room'}</text>`;columns.forEach((column,index)=>{const x=left+firstWidth+index*cellWidth,label=academic?`${column[0]||''} ${column[1]||''}`:column;body+=`<rect x="${x}" y="${top}" width="${cellWidth}" height="${headerHeight}" fill="#cfe1f4" stroke="#789"/><text x="${x+cellWidth/2}" y="${top+43}" text-anchor="middle" font-size="16" font-weight="700">${xml(short(label,22))}</text>`});rows.forEach((row,rowIndex)=>{const y=top+headerHeight+rowIndex*rowHeight,rowOff=offRows.has(String(row));body+=`<rect x="${left}" y="${y}" width="${firstWidth}" height="${rowHeight}" fill="#dce9f6" stroke="#789"/><text x="${left+firstWidth/2}" y="${y+50}" text-anchor="middle" font-size="17" font-weight="700">${xml(short(row,20))}</text>`;columns.forEach((column,columnIndex)=>{const x=left+firstWidth+columnIndex*cellWidth,key=academic?`${row}|${columnIndex}`:`${row}|${column}`,cell=(data.cells||{})[key]||{},tiffin=academic&&String(column?.[0]||'').toLowerCase()==='tiffin';body+=`<rect x="${x}" y="${y}" width="${cellWidth}" height="${rowHeight}" fill="${rowOff?'#fce7e7':tiffin?'#fff0be':rowIndex%2?'#f1f7fd':'#fff'}" stroke="#789"/>`;if(rowOff){if(columnIndex===0)body+=`<text x="${x+cellWidth/2}" y="${y+50}" text-anchor="middle" font-size="17" font-weight="700" fill="#9a1e25">${academic?'NO CLASS':'NO COACHING'}</text>`}else if(tiffin)body+=`<text x="${x+cellWidth/2}" y="${y+50}" text-anchor="middle" font-size="17" font-weight="700">TIFFIN</text>`;else{if(academic&&cell.subject)body+=`<text x="${x+cellWidth/2}" y="${y+34}" text-anchor="middle" font-size="16" font-weight="700">${xml(short(cell.subject,20))}</text>`;if(cell.teacher_name)body+=`<text x="${x+cellWidth/2}" y="${y+(academic?61:50)}" text-anchor="middle" font-size="${academic?17:18}"${String(cell.teacher_name).length>16?` textLength="${cellWidth-16}" lengthAdjust="spacingAndGlyphs"`:""}>${xml(short(cell.teacher_name,22))}</text>`}})})}
 const footerDate=validDate(date)?String(date).split('-').reverse().join('-'):String(date),footerTime=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'}).toUpperCase();
 body+=`<text x="${width-25}" y="${height-25}" text-anchor="end" font-size="14" font-style="italic">${xml(`By N. Khatun, Date: ${footerDate}, Time: ${footerTime}`)}</text>`;
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
 const r=await pool.query(`SELECT * FROM (
  SELECT r.*,ROW_NUMBER() OVER(PARTITION BY r.title ORDER BY r.published_at DESC NULLS LAST,r.id DESC) routine_rank
  FROM routines r
  WHERE r.is_active=TRUE ${teacher?'AND r.file_url IS NOT NULL':''}
    AND EXISTS (
      SELECT 1 FROM routine_manager_grids g
      WHERE g.routine_kind='daily' AND g.is_published=TRUE
        AND g.routine_date=r.routine_date
        AND r.title=CASE g.group_name WHEN 'v_x' THEN 'Class V-X Routine' WHEN 'xi_xii' THEN 'Class XI-XII Routine' WHEN 'coaching' THEN 'Coaching Routine' ELSE r.title END
    )
 ) recent WHERE ${teacher?'routine_rank<=7':'TRUE'} ORDER BY published_at DESC NULLS LAST,id DESC`);
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
  CASE WHEN g.routine_date=$2::date AND g.routine_kind='draft' THEN 'draft'
       WHEN g.routine_date=$2::date AND g.routine_kind='daily' THEN 'final' ELSE 'master' END source
  FROM routine_manager_grids g LEFT JOIN users u ON u.id=g.created_by
  WHERE g.group_name=$1 AND ((g.routine_date=$2::date AND g.routine_kind IN ('draft','daily')) OR
  (g.is_master=TRUE AND EXTRACT(DOW FROM g.routine_date)=EXTRACT(DOW FROM $2::date)))
  ORDER BY CASE WHEN g.routine_date=$2::date AND g.routine_kind='draft' THEN 3
                WHEN g.routine_date=$2::date AND g.routine_kind='daily' THEN 2 ELSE 1 END DESC,
           g.updated_at DESC LIMIT 1`,[group,date]);
 const routine=r.rows[0]||null;
 if(routine)routine.grid_data=await teacherOnlyGridData(routine.grid_data);
 res.json({success:true,routine});
}));

router.get('/manager/master',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const group=String(req.query.group||'v_x'),day=Number(req.query.day);
 if(!GROUPS.includes(group)||!Number.isInteger(day)||day<0||day>6)return res.status(400).json({success:false,message:'Valid group and weekday are required'});
 const r=await pool.query(`SELECT g.*,u.full_name updated_by_name,'master' source FROM routine_manager_grids g LEFT JOIN users u ON u.id=g.created_by WHERE g.group_name=$1 AND g.routine_kind='master' AND g.is_master=TRUE AND EXTRACT(DOW FROM g.routine_date)=$2 ORDER BY g.updated_at DESC LIMIT 1`,[group,day]);
 const routine=r.rows[0]||null;
 if(routine)routine.grid_data=await teacherOnlyGridData(routine.grid_data);
 res.json({success:true,routine});
}));

router.get('/manager/backup',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const group=String(req.query.group||'all');
 if(group!=='all'&&!GROUPS.includes(group))return res.status(400).json({success:false,message:'Valid group is required'});
 const sql=`SELECT g.*,u.full_name updated_by_name FROM routine_manager_grids g LEFT JOIN users u ON u.id=g.created_by`+(group==='all'?'':` WHERE g.group_name=$1`)+` ORDER BY g.group_name,g.routine_date,g.routine_kind`;
 const q=await pool.query(sql,group==='all'?[]:[group]);
 res.json({version:1,created_at:new Date().toISOString(),group,routines:q.rows});
}));

// Restore is intentionally non-destructive: entries that already exist for the
// same group/date/kind are skipped and are never overwritten.
router.post('/manager/backup/restore',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const payload=req.body||{},items=Array.isArray(payload.routines)?payload.routines:[];
 if(payload.version!==undefined&&Number(payload.version)!==1)return res.status(400).json({success:false,message:'Unsupported routine backup version.'});
 if(!items.length||items.length>2000)return res.status(400).json({success:false,message:'Backup must contain between 1 and 2000 routines.'});
 const client=await pool.connect(),added=[];let skipped=0;
 try{
  await client.query('BEGIN');
  for(const item of items){
   const group=String(item.group_name||''),kind=String(item.routine_kind||'');
   if(!GROUPS.includes(group)||!['daily','draft','master'].includes(kind)||!validDate(item.routine_date)||!item.grid_data||typeof item.grid_data!=='object')throw new Error('Backup contains an invalid routine entry.');
   const isMaster=kind==='master'&&item.is_master===true,isPublished=kind==='daily'&&item.is_published===true;
   const result=await client.query(`INSERT INTO routine_manager_grids(group_name,routine_date,routine_kind,grid_data,is_master,is_published,created_by)
    VALUES($1,$2,$3,$4::jsonb,$5,$6,$7) ON CONFLICT(group_name,routine_date,routine_kind) DO NOTHING RETURNING id,group_name,routine_date,routine_kind,is_published`,[group,item.routine_date,kind,JSON.stringify(item.grid_data),isMaster,isPublished,req.user.userId]);
   if(result.rowCount)added.push({...result.rows[0],grid_data:item.grid_data});else skipped++;
  }
  await client.query('COMMIT');
  for(const item of added){if(item.routine_kind==='daily'&&item.is_published)await publishRoutineJpg({group:item.group_name,date:String(item.routine_date).slice(0,10),data:item.grid_data,userId:req.user.userId});}
  res.json({success:true,added:added.length,skipped,message:`${added.length} routine entr${added.length===1?'y':'ies'} added; ${skipped} existing entr${skipped===1?'y':'ies'} skipped.`});
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));

router.get('/manager/history',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const r=await pool.query(`SELECT g.id,g.group_name,g.routine_date,g.routine_kind,g.is_master,g.is_published,g.updated_at,
  g.grid_data->>'no_class' no_class,u.full_name updated_by_name FROM routine_manager_grids g
  LEFT JOIN users u ON u.id=g.created_by WHERE g.group_name=$1 AND g.is_master=FALSE AND g.routine_kind!='master'
  ORDER BY g.routine_date DESC,g.updated_at DESC LIMIT 120`,[String(req.query.group||'v_x')]);
 res.json({success:true,routines:r.rows});
}));

function getSlotDuration(slotStr){
 if(!slotStr)return{start:'-',end:'-',duration:'-',minutes:0};
 const parts=String(slotStr).replace(/–/g,'-').split('-');
 const start=(parts[0]||'').trim();
 const end=(parts[1]||'').trim();
 if(!start||!end)return{start:start||'-',end:end||'-',duration:'-',minutes:0};
 const[sh,sm]=start.split(':').map(Number);
 const[eh,em]=end.split(':').map(Number);
 let sMin=sh*60+(sm||0);
 let eMin=eh*60+(em||0);
 if(eMin<sMin)eMin+=12*60;
 let diff=eMin-sMin;
 if(diff<=0||diff>240)diff=60;
 const hrs=Math.floor(diff/60);
 const mins=diff%60;
 let durStr='';
 if(hrs>0&&mins>0)durStr=`${hrs} hr ${mins} mins`;
 else if(hrs>0)durStr=`${hrs} hr`;
 else durStr=`${mins} mins`;
 return{start,end,duration:durStr,minutes:diff};
}

const DEFAULT_V_X_PERIODS=[
 ['1st','10:00-10:40'],['2nd','10:40-11:20'],['3rd','11:20-12:00'],['4th','12:00-12:40'],
 ['Tiffin','12:40-1:40'],['5th','1:40-2:20'],['6th','2:20-3:00'],['7th','3:00-3:40']
];
const DEFAULT_XI_XII_PERIODS=[
 ['1st','6:30-7:30'],['2nd','7:30-8:30'],['3rd','8:30-9:30'],['4th','10:00-11:00'],
 ['5th','11:00-12:00'],['6th','12:00-1:00']
];

async function generateMonthlyReportData(month){
 const parts=String(month||'').split('-'),y=parts[0],m=parseInt(parts[1],10);
 const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const monthLabel=`${monthNames[m-1]||month} - ${y}`;
 const sessionName=`${y}-${Number(String(y).slice(2))+1}`;
 const teachersRes=await pool.query(`SELECT t.id, t.name, COALESCE(NULLIF(t.subject,''),'General') as subject
  FROM teachers t LEFT JOIN users u ON u.id=t.user_id
  WHERE t.is_active=TRUE AND COALESCE(u.is_active,TRUE)=TRUE AND (
    LOWER(COALESCE(t.profile_details->>'staff_category','')) LIKE '%teach%'
    OR LOWER(COALESCE(t.designation,'')) LIKE '%teach%'
    OR LOWER(COALESCE(t.profile_details->>'staff_type','')) LIKE '%teach%'
    OR LOWER(COALESCE(t.profile_details->>'type_of_staff','')) LIKE '%teach%'
    OR LOWER(COALESCE(u.role,'')) = 'teacher'
  ) AND LOWER(COALESCE(t.designation,'')) NOT LIKE '%nonteach%'
  AND LOWER(COALESCE(t.profile_details->>'staff_category','')) NOT LIKE '%nonteach%' ORDER BY t.subject, t.name`);
 const teacherMap=new Map();
 teachersRes.rows.forEach(t=>{
  teacherMap.set(String(t.id),{
   id:String(t.id),
   name:t.name,
   subject:t.subject,
   xi_xii:0,
   ix_x:0,
   coaching:0,
   total:0,
   coaching_classes:[],
   xi_xii_classes:[],
   v_x_classes:[]
  });
 });
 const q=await pool.query(`SELECT group_name, to_char(routine_date,'YYYY-MM-DD') as routine_date, grid_data
  FROM routine_manager_grids WHERE routine_kind='daily' AND is_published=TRUE AND to_char(routine_date,'YYYY-MM')=$1
  ORDER BY routine_date`,[month]);
 for(const row of q.rows){
  const group=row.group_name,data=await teacherOnlyGridData(row.grid_data||{});
  if(data.no_class)continue;
  const dateStr=row.routine_date;
  const dObj=new Date(dateStr+'T00:00:00Z');
  const dayName=dObj.toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'});
  const cells=data.cells||{},seenTeacherSlots=new Set();
  for(const[pos,cell]of Object.entries(cells)){
   if(!cell||!cell.teacher_id)continue;
   const tId=String(cell.teacher_id);
   if(!teacherMap.has(tId))continue;
   const p=pos.split('|'),slot=group==='coaching'?p[0]:p[1];
   const countKey=data.combined_class_counting?`${tId}|${slot}`:`${tId}|${pos}`;
   if(seenTeacherSlots.has(countKey))continue;
   seenTeacherSlots.add(countKey);
   const rec=teacherMap.get(tId);
   if(group==='coaching'){
    rec.coaching++;
    const dur=getSlotDuration(p[0]);
    rec.coaching_classes.push({
     date:dateStr,
     day:dayName,
     class_name:p[1]||'Coaching',
     time_slot:p[0],
     start_time:dur.start,
     end_time:dur.end,
     duration:dur.duration,
     duration_minutes:dur.minutes,
     subject:cell.subject||rec.subject||'Coaching'
    });
   }else if(group==='xi_xii'){
    rec.xi_xii++;
    const periods=Array.isArray(data.periods)&&data.periods.length?data.periods:DEFAULT_XI_XII_PERIODS;
    const periodIdx=parseInt(p[1],10);
    const periodInfo=periods[periodIdx]||['Period '+(periodIdx+1),''];
    const dur=getSlotDuration(periodInfo[1]);
    rec.xi_xii_classes.push({
     date:dateStr,
     day:dayName,
     class_name:p[0]||'XI-XII',
     period:periodInfo[0],
     time_slot:periodInfo[1],
     start_time:dur.start,
     end_time:dur.end,
     duration:dur.duration,
     duration_minutes:dur.minutes,
     subject:cell.subject||rec.subject||'General'
    });
   }else if(group==='v_x'){
    rec.ix_x++;
    const periods=Array.isArray(data.periods)&&data.periods.length?data.periods:DEFAULT_V_X_PERIODS;
    const periodIdx=parseInt(p[1],10);
    const periodInfo=periods[periodIdx]||['Period '+(periodIdx+1),''];
    const dur=getSlotDuration(periodInfo[1]);
    rec.v_x_classes.push({
     date:dateStr,
     day:dayName,
     class_name:p[0]||'V-X',
     period:periodInfo[0],
     time_slot:periodInfo[1],
     start_time:dur.start,
     end_time:dur.end,
     duration:dur.duration,
     duration_minutes:dur.minutes,
     subject:cell.subject||rec.subject||'General'
    });
   }
   rec.total++;
  }
 }
 const teachers=[...teacherMap.values()].map((t,idx)=>({sl:idx+1,...t}));
 const totals={xi_xii:teachers.reduce((s,t)=>s+t.xi_xii,0),ix_x:teachers.reduce((s,t)=>s+t.ix_x,0),coaching:teachers.reduce((s,t)=>s+t.coaching,0),grand_total:teachers.reduce((s,t)=>s+t.total,0)};
 return {month,monthLabel,sessionName,schoolName:'Al - Ameen Mission Academy Memari',teachers,totals};
}

async function buildMonthlyReportWorkbook({month,monthLabel,schoolName,teachers,totals}){
 const wb=new ExcelJS.Workbook();
 wb.creator='Al-Ameen Mission Academy Memari';
 const ws=wb.addWorksheet('Monthly Report');
 ws.mergeCells('A1:G1');
 const t1=ws.getCell('A1');
 t1.value=schoolName;
 t1.font={name:'Calibri',size:16,bold:true,color:{argb:'FF1F4E78'}};
 t1.alignment={horizontal:'center',vertical:'middle'};
 ws.getRow(1).height=28;

 ws.mergeCells('A2:G2');
 const t2=ws.getCell('A2');
 t2.value=monthLabel;
 t2.font={name:'Calibri',size:14,bold:true,color:{argb:'FF1F4E78'}};
 t2.alignment={horizontal:'center',vertical:'middle'};
 ws.getRow(2).height=24;
 ws.getRow(3).height=10;

 const headerRow=ws.getRow(4);
 headerRow.height=26;
 headerRow.values=['SL','Subject',"Teacher's Name",'XI-XII','IX-X','Coaching','Total'];
 const thinBorder={top:{style:'thin',color:{argb:'FF000000'}},left:{style:'thin',color:{argb:'FF000000'}},bottom:{style:'thin',color:{argb:'FF000000'}},right:{style:'thin',color:{argb:'FF000000'}}};
 headerRow.eachCell((cell,colNumber)=>{
  cell.font={name:'Calibri',size:12,bold:true,underline:true,color:{argb:'FFCC0000'}};
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFFFF'}};
  cell.alignment={horizontal:colNumber===1||colNumber>=4?'center':'left',vertical:'middle'};
  cell.border=thinBorder;
 });

 teachers.forEach((t,i)=>{
  const rIdx=5+i,r=ws.getRow(rIdx);
  r.height=22;
  const isEven=i%2===1;
  const rowFill={type:'pattern',pattern:'solid',fgColor:{argb:isEven?'FFEAF2FA':'FFFFFFFF'}};
  r.values=[t.sl,t.subject,t.name,t.xi_xii||'',t.ix_x||'',t.coaching||'',t.total||''];
  r.eachCell({includeEmpty:true},(cell,colNumber)=>{
   cell.font={name:'Calibri',size:11,bold:colNumber===7};
   cell.fill=rowFill;
   cell.border=thinBorder;
   cell.alignment={horizontal:colNumber===1||colNumber>=4?'center':'left',vertical:'middle'};
  });
 });

 const totalRowIdx=5+teachers.length,totalRow=ws.getRow(totalRowIdx);
 totalRow.height=25;
 totalRow.values=['','','Total Classes',totals.xi_xii,totals.ix_x,totals.coaching,totals.grand_total];
 totalRow.eachCell({includeEmpty:true},(cell,colNumber)=>{
  cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FF1F4E78'}};
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD9E1F2'}};
  cell.border={top:{style:'medium',color:{argb:'FF000000'}},bottom:{style:'double',color:{argb:'FF000000'}},left:{style:'thin',color:{argb:'FF000000'}},right:{style:'thin',color:{argb:'FF000000'}}};
  cell.alignment={horizontal:colNumber>=4?'center':'right',vertical:'middle'};
 });

 ws.columns=[{width:8},{width:18},{width:30},{width:14},{width:14},{width:16},{width:14}];
 return wb;
}

router.get('/manager/report',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const month=String(req.query.month||new Date().toISOString().slice(0,7));
 if(!/^\d{4}-\d{2}$/.test(month))return res.status(400).json({success:false,message:'Valid month (YYYY-MM) is required'});
 const reportData=await generateMonthlyReportData(month);
 res.json({success:true,...reportData});
}));

router.get('/manager/report/excel',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const month=String(req.query.month||new Date().toISOString().slice(0,7));
 if(!/^\d{4}-\d{2}$/.test(month))return res.status(400).json({success:false,message:'Valid month (YYYY-MM) is required'});
 const reportData=await generateMonthlyReportData(month);
 const wb=await buildMonthlyReportWorkbook(reportData);
 res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 res.setHeader('Content-Disposition',`attachment; filename="Monthly-Report-${month}.xlsx"`);
 await wb.xlsx.write(res);
 res.end();
}));

async function generateDailyReportData(dateStr){
 if(!validDate(dateStr))throw new Error('Valid date (YYYY-MM-DD) is required');
 const dObj=new Date(dateStr+'T00:00:00Z');
 const dayName=dObj.toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'});
 const dayFormatted=dObj.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
 const dateLabel=`${dayName}, ${dayFormatted}`;
 const y=dateStr.slice(0,4);
 const sessionName=`${y}-${Number(String(y).slice(2))+1}`;
 const teachersRes=await pool.query(`SELECT t.id, t.name, COALESCE(NULLIF(t.subject,''),'General') as subject
  FROM teachers t LEFT JOIN users u ON u.id=t.user_id
  WHERE t.is_active=TRUE AND COALESCE(u.is_active,TRUE)=TRUE AND (
    LOWER(COALESCE(t.profile_details->>'staff_category','')) LIKE '%teach%'
    OR LOWER(COALESCE(t.designation,'')) LIKE '%teach%'
    OR LOWER(COALESCE(t.profile_details->>'staff_type','')) LIKE '%teach%'
    OR LOWER(COALESCE(t.profile_details->>'type_of_staff','')) LIKE '%teach%'
    OR LOWER(COALESCE(u.role,'')) = 'teacher'
  ) AND LOWER(COALESCE(t.designation,'')) NOT LIKE '%nonteach%'
  AND LOWER(COALESCE(t.profile_details->>'staff_category','')) NOT LIKE '%nonteach%' ORDER BY t.subject, t.name`);
 const teacherMap=new Map();
 teachersRes.rows.forEach(t=>{
  teacherMap.set(String(t.id),{
   id:String(t.id),
   name:t.name,
   subject:t.subject,
   xi_xii:0,
   ix_x:0,
   coaching:0,
   total:0,
   coaching_classes:[],
   xi_xii_classes:[],
   v_x_classes:[]
  });
 });

 let publishedCount=0;
 for(const group of ['v_x','xi_xii','coaching']){
  const q=await pool.query(`SELECT g.*
    FROM routine_manager_grids g
    WHERE g.group_name=$1 AND g.routine_date=$2::date AND g.routine_kind='daily' AND g.is_published=TRUE
    ORDER BY g.updated_at DESC LIMIT 1`,[group,dateStr]);
  if(!q.rows.length)continue;
  publishedCount++;
  const row=q.rows[0];
  const data=await teacherOnlyGridData(row.grid_data||{});
  if(data.no_class)continue;

  const cells=data.cells||{},seenTeacherSlots=new Set();
  for(const[pos,cell]of Object.entries(cells)){
   if(!cell||!cell.teacher_id)continue;
   const tId=String(cell.teacher_id);
   if(!teacherMap.has(tId))continue;
   const p=pos.split('|'),slot=group==='coaching'?p[0]:p[1];
   const countKey=data.combined_class_counting?`${tId}|${slot}`:`${tId}|${pos}`;
   if(seenTeacherSlots.has(countKey))continue;
   seenTeacherSlots.add(countKey);
   const rec=teacherMap.get(tId);
   if(group==='coaching'){
    rec.coaching++;
    const dur=getSlotDuration(p[0]);
    rec.coaching_classes.push({
     date:dateStr,
     day:dayName,
     class_name:p[1]||'Coaching',
     time_slot:p[0],
     start_time:dur.start,
     end_time:dur.end,
     duration:dur.duration,
     duration_minutes:dur.minutes,
     subject:cell.subject||rec.subject||'Coaching'
    });
   }else if(group==='xi_xii'){
    rec.xi_xii++;
    const periods=Array.isArray(data.periods)&&data.periods.length?data.periods:DEFAULT_XI_XII_PERIODS;
    const periodIdx=parseInt(p[1],10);
    const periodInfo=periods[periodIdx]||['Period '+(periodIdx+1),''];
    const dur=getSlotDuration(periodInfo[1]);
    rec.xi_xii_classes.push({
     date:dateStr,
     day:dayName,
     class_name:p[0]||'XI-XII',
     period:periodInfo[0],
     time_slot:periodInfo[1],
     start_time:dur.start,
     end_time:dur.end,
     duration:dur.duration,
     duration_minutes:dur.minutes,
     subject:cell.subject||rec.subject||'General'
    });
   }else if(group==='v_x'){
    rec.ix_x++;
    const periods=Array.isArray(data.periods)&&data.periods.length?data.periods:DEFAULT_V_X_PERIODS;
    const periodIdx=parseInt(p[1],10);
    const periodInfo=periods[periodIdx]||['Period '+(periodIdx+1),''];
    const dur=getSlotDuration(periodInfo[1]);
    rec.v_x_classes.push({
     date:dateStr,
     day:dayName,
     class_name:p[0]||'V-X',
     period:periodInfo[0],
     time_slot:periodInfo[1],
     start_time:dur.start,
     end_time:dur.end,
     duration:dur.duration,
     duration_minutes:dur.minutes,
     subject:cell.subject||rec.subject||'General'
    });
   }
   rec.total++;
  }
 }

 const teachers=[...teacherMap.values()].map((t,idx)=>({sl:idx+1,...t}));
 const totals={xi_xii:teachers.reduce((s,t)=>s+t.xi_xii,0),ix_x:teachers.reduce((s,t)=>s+t.ix_x,0),coaching:teachers.reduce((s,t)=>s+t.coaching,0),grand_total:teachers.reduce((s,t)=>s+t.total,0)};
 return {date:dateStr,dayName,dateLabel,monthLabel:dateLabel,sessionName,schoolName:'Al - Ameen Mission Academy Memari',teachers,totals,is_published:publishedCount>0};
}

async function buildDailyReportWorkbook({date,dayName,dateLabel,schoolName,teachers,totals}){
 const wb=new ExcelJS.Workbook();
 wb.creator='Al-Ameen Mission Academy Memari';
 const ws=wb.addWorksheet('Daily Report');
 ws.mergeCells('A1:G1');
 const t1=ws.getCell('A1');
 t1.value=schoolName;
 t1.font={name:'Calibri',size:16,bold:true,color:{argb:'FF1F4E78'}};
 t1.alignment={horizontal:'center',vertical:'middle'};
 ws.getRow(1).height=28;

 ws.mergeCells('A2:G2');
 const t2=ws.getCell('A2');
 t2.value=`Daily Class Report - ${dateLabel}`;
 t2.font={name:'Calibri',size:14,bold:true,color:{argb:'FF1F4E78'}};
 t2.alignment={horizontal:'center',vertical:'middle'};
 ws.getRow(2).height=24;
 ws.getRow(3).height=10;

 const headerRow=ws.getRow(4);
 headerRow.height=26;
 headerRow.values=['SL','Subject',"Teacher's Name",'XI-XII','IX-X','Coaching','Total'];
 const thinBorder={top:{style:'thin',color:{argb:'FF000000'}},left:{style:'thin',color:{argb:'FF000000'}},bottom:{style:'thin',color:{argb:'FF000000'}},right:{style:'thin',color:{argb:'FF000000'}}};
 headerRow.eachCell((cell,colNumber)=>{
  cell.font={name:'Calibri',size:12,bold:true,underline:true,color:{argb:'FFCC0000'}};
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFFFF'}};
  cell.alignment={horizontal:colNumber===1||colNumber>=4?'center':'left',vertical:'middle'};
  cell.border=thinBorder;
 });

 teachers.forEach((t,i)=>{
  const rIdx=5+i,r=ws.getRow(rIdx);
  r.height=22;
  const isEven=i%2===1;
  const rowFill={type:'pattern',pattern:'solid',fgColor:{argb:isEven?'FFEAF2FA':'FFFFFFFF'}};
  r.values=[t.sl,t.subject,t.name,t.xi_xii||'',t.ix_x||'',t.coaching||'',t.total||''];
  r.eachCell({includeEmpty:true},(cell,colNumber)=>{
   cell.font={name:'Calibri',size:11,bold:colNumber===7};
   cell.fill=rowFill;
   cell.border=thinBorder;
   cell.alignment={horizontal:colNumber===1||colNumber>=4?'center':'left',vertical:'middle'};
  });
 });

 const totalRowIdx=5+teachers.length,totalRow=ws.getRow(totalRowIdx);
 totalRow.height=25;
 totalRow.values=['','','Total Classes',totals.xi_xii,totals.ix_x,totals.coaching,totals.grand_total];
 totalRow.eachCell({includeEmpty:true},(cell,colNumber)=>{
  cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FF1F4E78'}};
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD9E1F2'}};
  cell.border={top:{style:'medium',color:{argb:'FF000000'}},bottom:{style:'double',color:{argb:'FF000000'}},left:{style:'thin',color:{argb:'FF000000'}},right:{style:'thin',color:{argb:'FF000000'}}};
  cell.alignment={horizontal:colNumber>=4?'center':'right',vertical:'middle'};
 });

 ws.columns=[{width:8},{width:18},{width:30},{width:14},{width:14},{width:16},{width:14}];
 return wb;
}

router.get('/manager/daily-report',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const date=String(req.query.date||new Date().toISOString().slice(0,10));
 if(!validDate(date))return res.status(400).json({success:false,message:'Valid date (YYYY-MM-DD) is required'});
 const reportData=await generateDailyReportData(date);
 res.json({success:true,...reportData});
}));

router.get('/manager/daily-report/excel',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const date=String(req.query.date||new Date().toISOString().slice(0,10));
 if(!validDate(date))return res.status(400).json({success:false,message:'Valid date (YYYY-MM-DD) is required'});
 const reportData=await generateDailyReportData(date);
 const wb=await buildDailyReportWorkbook(reportData);
 res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 res.setHeader('Content-Disposition',`attachment; filename="Daily-Report-${date}.xlsx"`);
 await wb.xlsx.write(res);
 res.end();
}));

async function buildTeacherCoachingWorkbook({teacher,month,monthLabel,schoolName,classes,sessionName,sheetKind}){
 const wb=new ExcelJS.Workbook();
 wb.creator='Al-Ameen Mission Academy Memari';
 const kindTitle=sheetKind==='xi_xii'?'Class XI-XII':sheetKind==='v_x'?'Class V-X':sheetKind==='all'?'All':'Coaching';
 const ws=wb.addWorksheet(`${teacher.name.slice(0,15)} ${kindTitle}`);

 ws.mergeCells('A1:G1');
 const t1=ws.getCell('A1');
 t1.value='Al-Ameen Mission Academy, Memari';
 t1.font={name:'Calibri',size:16,bold:true,color:{argb:'FF1F4E78'}};
 t1.alignment={horizontal:'center',vertical:'middle'};
 ws.getRow(1).height=24;

 ws.mergeCells('A2:G2');
 const t2=ws.getCell('A2');
 t2.value='Memari :: Purba Bardhaman';
 t2.font={name:'Calibri',size:12,bold:true,color:{argb:'FF000000'}};
 t2.alignment={horizontal:'center',vertical:'middle'};
 ws.getRow(2).height=18;

 ws.mergeCells('A3:G3');
 const t3=ws.getCell('A3');
 t3.value='Girls Unit';
 t3.font={name:'Calibri',size:12,bold:true,color:{argb:'FF000000'}};
 t3.alignment={horizontal:'center',vertical:'middle'};
 ws.getRow(3).height=18;

 ws.mergeCells('A4:G4');
 const t4=ws.getCell('A4');
 t4.value=`Record Sheet for Teachers ${kindTitle} Classes for the Session-${sessionName||'2026-27'}`;
 t4.font={name:'Calibri',size:13,bold:true,color:{argb:'FF1F4E78'}};
 t4.alignment={horizontal:'center',vertical:'middle'};
 ws.getRow(4).height=22;

 ws.getRow(5).height=8;

 ws.mergeCells('A6:D6');
 const tInfo1=ws.getCell('A6');
 tInfo1.value=`Name of the Teacher: ${teacher.name}`;
 tInfo1.font={name:'Calibri',size:11,bold:true};
 tInfo1.alignment={horizontal:'left',vertical:'middle'};

 ws.mergeCells('E6:G6');
 const tInfo2=ws.getCell('E6');
 tInfo2.value=`Sub : ${teacher.subject||'General'}    (${monthLabel})`;
 tInfo2.font={name:'Calibri',size:11,bold:true};
 tInfo2.alignment={horizontal:'left',vertical:'middle'};
 ws.getRow(6).height=22;

 ws.getRow(7).height=8;

 const headers=['Sl. No.','Date','Day','Class','Class Start','Class End','Duration of Class'];
 const hRow=ws.getRow(8);
 hRow.height=24;
 headers.forEach((h,idx)=>{
  const cell=hRow.getCell(idx+1);
  cell.value=h;
  cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FF000000'}};
  cell.alignment={horizontal:'center',vertical:'middle'};
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F2F2'}};
  cell.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
 });

 const totalRows=Math.max(classes.length,18);
 let totalMinutes=0;

 for(let i=0;i<totalRows;i++){
  const item=classes[i];
  const rIdx=9+i;
  const row=ws.getRow(rIdx);
  row.height=20;

  const c1=row.getCell(1);
  c1.value=i+1;
  c1.alignment={horizontal:'center',vertical:'middle'};

  const c2=row.getCell(2);
  c2.value=item?item.date.split('-').reverse().join('-'):'';
  c2.alignment={horizontal:'center',vertical:'middle'};

  const c3=row.getCell(3);
  c3.value=item?item.day:'';
  c3.alignment={horizontal:'center',vertical:'middle'};

  const c4=row.getCell(4);
  c4.value=item?item.class_name:'';
  c4.alignment={horizontal:'center',vertical:'middle'};

  const c5=row.getCell(5);
  c5.value=item?item.start_time:'';
  c5.alignment={horizontal:'center',vertical:'middle'};

  const c6=row.getCell(6);
  c6.value=item?item.end_time:'';
  c6.alignment={horizontal:'center',vertical:'middle'};

  const c7=row.getCell(7);
  c7.value=item?item.duration:'';
  c7.alignment={horizontal:'center',vertical:'middle'};

  if(item&&item.duration_minutes){
   totalMinutes+=item.duration_minutes;
  }

  for(let c=1;c<=7;c++){
   row.getCell(c).font={name:'Calibri',size:11};
   row.getCell(c).border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
  }
 }

 const sumIdx=9+totalRows;
 const sumRow=ws.getRow(sumIdx);
 sumRow.height=24;
 ws.mergeCells(`A${sumIdx}:D${sumIdx}`);
 const s1=ws.getCell(`A${sumIdx}`);
 s1.value=`Total Classes: ${classes.length}`;
 s1.font={name:'Calibri',size:11,bold:true,color:{argb:'FF1F4E78'}};
 s1.alignment={horizontal:'left',vertical:'middle',indent:1};

 const totHrs=Math.floor(totalMinutes/60);
 const totMins=totalMinutes%60;
 let totDurStr='';
 if(totHrs>0&&totMins>0)totDurStr=`${totHrs} Hours ${totMins} Mins`;
 else if(totHrs>0)totDurStr=`${totHrs} Hours`;
 else if(totMins>0)totDurStr=`${totMins} Mins`;
 else totDurStr='-';

 ws.mergeCells(`E${sumIdx}:G${sumIdx}`);
 const s2=ws.getCell(`E${sumIdx}`);
 s2.value=`Total Duration: ${totDurStr}`;
 s2.font={name:'Calibri',size:11,bold:true,color:{argb:'FF1F4E78'}};
 s2.alignment={horizontal:'right',vertical:'middle'};

 for(let c=1;c<=7;c++){
  sumRow.getCell(c).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE9EEF4'}};
  sumRow.getCell(c).border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
 }

 const sigRowIdx=sumIdx+3;
 ws.mergeCells(`A${sigRowIdx}:C${sigRowIdx}`);
 const sig1=ws.getCell(`A${sigRowIdx}`);
 sig1.value="Teacher's Signature";
 sig1.font={name:'Calibri',size:11,bold:true};
 sig1.border={top:{style:'dashed'}};
 sig1.alignment={horizontal:'center',vertical:'middle'};

 ws.mergeCells(`E${sigRowIdx}:G${sigRowIdx}`);
 const sig2=ws.getCell(`E${sigRowIdx}`);
 sig2.value="In-Charge / Principal Signature";
 sig2.font={name:'Calibri',size:11,bold:true};
 sig2.border={top:{style:'dashed'}};
 sig2.alignment={horizontal:'center',vertical:'middle'};

 ws.columns=[
  {width:10},
  {width:15},
  {width:15},
  {width:18},
  {width:14},
  {width:14},
  {width:22}
 ];

 return wb;
}

router.get('/manager/report/teacher-excel',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const date=String(req.query.date||'');
 const month=String(req.query.month||new Date().toISOString().slice(0,7));
 const teacherId=String(req.query.teacher_id||'');
 const kind=String(req.query.kind||'coaching');
 if(!teacherId||(!date&&!/^\d{4}-\d{2}$/.test(month))){
  return res.status(400).json({success:false,message:'Valid month or date and teacher_id are required'});
 }
 const reportData=date ? await generateDailyReportData(date) : await generateMonthlyReportData(month);
 const teacher=(reportData.teachers||[]).find(t=>String(t.id)===teacherId);
 if(!teacher)return res.status(404).json({success:false,message:'Teacher not found in report'});

 let classes=[];
 if(kind==='xi_xii')classes=teacher.xi_xii_classes||[];
 else if(kind==='v_x')classes=teacher.v_x_classes||[];
 else if(kind==='all')classes=[...(teacher.coaching_classes||[]),...(teacher.xi_xii_classes||[]),...(teacher.v_x_classes||[])].sort((a,b)=>a.date.localeCompare(b.date));
 else classes=teacher.coaching_classes||[];

 const wb=await buildTeacherCoachingWorkbook({
  teacher,
  month:date||month,
  monthLabel:reportData.monthLabel,
  schoolName:reportData.schoolName,
  classes,
  sessionName:reportData.sessionName,
  sheetKind:kind
 });

 const safeName=(teacher.name||'Teacher').replace(/[^a-zA-Z0-9_-]/g,'_');
 const periodTag=date||month;
 res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 res.setHeader('Content-Disposition',`attachment; filename="${safeName}_${kind.toUpperCase()}_Record_${periodTag}.xlsx"`);
 await wb.xlsx.write(res);
 res.end();
}));

router.post('/manager',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const b=req.body||{},saveMode=['master','draft','final','record'].includes(b.save_mode)?b.save_mode:'final';
 if(!GROUPS.includes(b.group_name)||!validDate(b.routine_date))return res.status(400).json({success:false,message:'Valid group and date are required'});
 let rawGrid=b.grid_data||{};
 if(b.group_name==='xi_xii'&&Array.isArray(rawGrid.classes)&&rawGrid.classes.some(c=>['V','VI','VII','VIII','IX','X'].includes(c))){
  rawGrid.classes=['XI-A','XI-B','XII-A','XII-B'];
 }else if(b.group_name==='v_x'&&Array.isArray(rawGrid.classes)&&rawGrid.classes.some(c=>['XI-A','XI-B','XII-A','XII-B'].includes(c))){
  rawGrid.classes=['V','VI','VII','VIII','IX','X'];
 }
 const kind=saveMode==='master'?'master':saveMode==='draft'?'draft':'daily',isMaster=saveMode==='master',published=saveMode==='final'||saveMode==='record',gridData=await teacherOnlyGridData(rawGrid);
 const r=await pool.query(`INSERT INTO routine_manager_grids(group_name,routine_date,routine_kind,grid_data,is_master,is_published,created_by)
  VALUES($1,$2,$3,$4::jsonb,$5,$6,$7) ON CONFLICT(group_name,routine_date,routine_kind) DO UPDATE SET
  grid_data=EXCLUDED.grid_data,is_master=EXCLUDED.is_master,is_published=EXCLUDED.is_published,
  created_by=EXCLUDED.created_by,updated_at=NOW() RETURNING *`,[b.group_name,b.routine_date,kind,JSON.stringify(gridData),isMaster,published,req.user.userId]);
 if(isMaster)await pool.query(`UPDATE routine_manager_grids SET is_master=FALSE WHERE group_name=$1
  AND routine_kind='master' AND id<>$2 AND EXTRACT(DOW FROM routine_date)=EXTRACT(DOW FROM $3::date)`,[b.group_name,r.rows[0].id,b.routine_date]);
 if(published)await pool.query(`DELETE FROM routine_manager_grids WHERE group_name=$1 AND routine_date=$2 AND routine_kind='draft'`,[b.group_name,b.routine_date]);
 const publishedImageUrl=saveMode==='final'?await publishRoutineJpg({group:b.group_name,date:b.routine_date,data:gridData,userId:req.user.userId}):null;
 // Routines remain available in the teacher dashboard, but routine publication
 // deliberately creates no notice or push notification.
 if(saveMode==='final'){
  sendPushForRoutine({group:b.group_name,date:b.routine_date}).catch(err=>console.error('Routine push notification failed:',err.message));
 }
 res.json({success:true,routine:r.rows[0],published_image_url:publishedImageUrl,message:isMaster?'Weekday Master routine saved':saveMode==='draft'?'Routine draft saved':saveMode==='record'?'Class record saved successfully':'Final routine published as JPG'});
}));

// Update only the coaching time labels across coaching routines (masters, drafts, daily).
// Existing room/teacher assignments are remapped by their time-slot index.
router.post('/manager/coaching-times',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const times=Array.isArray(req.body?.times)?req.body.times.map((x)=>String(x||'').replace(/[–—]/g,'-').trim()).filter(Boolean):[];
 if(!times.length)return res.status(400).json({success:false,message:'At least one coaching time is required'});
 const rows=(await pool.query(`SELECT id,grid_data FROM routine_manager_grids WHERE group_name='coaching'`)).rows;
 for(const row of rows){
  const data=row.grid_data||{},oldTimes=(Array.isArray(data.times)?data.times:[]).map((x)=>String(x).replace(/[–—]/g,'-').trim());
  const cells={};
  for(const [key,value] of Object.entries(data.cells||{})){
   const parts=String(key).split('|');
   const oldNorm=parts[0].replace(/[–—]/g,'-').trim();
   const index=oldTimes.indexOf(oldNorm);
   cells[(index>=0?(times[index]||parts[0]):parts[0])+'|'+parts.slice(1).join('|')]=value;
  }
  await pool.query('UPDATE routine_manager_grids SET grid_data=$1::jsonb,updated_at=NOW() WHERE id=$2',[JSON.stringify({...data,times,cells}),row.id]);
 }
 res.json({success:true,updated:rows.length,message:`Coaching times updated in ${rows.length} coaching routines`});
}));

router.post('/manager/coaching-rooms',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const rooms=Array.isArray(req.body?.rooms)?req.body.rooms.map((x)=>String(x||'').trim()).filter(Boolean):[];
 if(!rooms.length)return res.status(400).json({success:false,message:'At least one coaching room is required'});
 const rows=(await pool.query(`SELECT id,grid_data FROM routine_manager_grids WHERE group_name='coaching'`)).rows;
 for(const row of rows){
  const data=row.grid_data||{};
  await pool.query('UPDATE routine_manager_grids SET grid_data=$1::jsonb,updated_at=NOW() WHERE id=$2',[JSON.stringify({...data,rooms}),row.id]);
 }
 res.json({success:true,updated:rows.length,message:`Coaching rooms updated in ${rows.length} coaching routines`});
}));

router.post('/manager/academic-periods',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const group=String(req.body?.group_name||''),periods=Array.isArray(req.body?.periods)?req.body.periods.filter((x)=>Array.isArray(x)&&x.length>=2).map((x)=>[String(x[0]).trim(),String(x[1]).trim()]):[];
 if(!['v_x','xi_xii'].includes(group)||!periods.length)return res.status(400).json({success:false,message:'Valid academic group and periods are required'});
 const masters=(await pool.query('SELECT id,grid_data FROM routine_manager_grids WHERE group_name=$1 AND routine_kind=\'master\'',[group])).rows;
 for(const row of masters){
  const data=row.grid_data||{},oldPeriods=Array.isArray(data.periods)?data.periods:[],cells={};
  for(const [key,value] of Object.entries(data.cells||{})){
   const parts=String(key).split('|'),index=Number(parts[1]);
   cells[parts[0]+'|'+(Number.isInteger(index)&&periods[index]?index:parts[1])]=value;
  }
  await pool.query('UPDATE routine_manager_grids SET grid_data=$1::jsonb,updated_at=NOW() WHERE id=$2',[JSON.stringify({...data,periods,cells}),row.id]);
 }
 res.json({success:true,updated:masters.length,message:`Academic periods updated in ${masters.length} weekly masters`});
}));

router.delete('/manager/:id',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const existing=await pool.query('SELECT id,group_name,routine_date,routine_kind FROM routine_manager_grids WHERE id=$1',[req.params.id]);
 if(!existing.rowCount)return res.status(404).json({success:false,message:'Routine not found'});
 const item=existing.rows[0];
 const r=await pool.query('DELETE FROM routine_manager_grids WHERE id=$1 RETURNING id',[req.params.id]);
 if(item.routine_kind==='daily'){
  const groupTitle={v_x:'Class V-X',xi_xii:'Class XI-XII',coaching:'Coaching'}[item.group_name]||item.group_name;
  await pool.query('UPDATE routines SET is_active=FALSE WHERE routine_date=$1 AND title=$2',[item.routine_date,`${groupTitle} Routine`]);
 }
 res.json({success:true,message:item.routine_kind==='daily'?'Published routine deleted':item.routine_kind==='draft'?'Draft routine deleted':'Master routine deleted'});
}));

const reviewNotesSchemaReady = pool.query(`
  CREATE TABLE IF NOT EXISTS routine_review_notes (
    id BIGSERIAL PRIMARY KEY,
    group_name VARCHAR(50) NOT NULL,
    routine_date DATE NOT NULL,
    note_text TEXT NOT NULL,
    target_class VARCHAR(50),
    target_period VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    resolved_by_name VARCHAR(120),
    resolved_at TIMESTAMPTZ
  )
`);

router.get('/review-notes', auth, allow('super_admin','admin','teacher'), asyncHandler(async(req, res) => {
  await reviewNotesSchemaReady;
  const { date, group } = req.query;
  const where = [];
  const args = [];
  if (date) {
    args.push(date);
    where.push(`routine_date = $${args.length}`);
  }
  if (group) {
    args.push(group);
    where.push(`group_name = $${args.length}`);
  }
  const sql = `SELECT * FROM routine_review_notes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
  const q = await pool.query(sql, args);
  res.json({ success: true, notes: q.rows });
}));

router.post('/review-notes', auth, allow('super_admin','admin','teacher'), asyncHandler(async(req, res) => {
  await reviewNotesSchemaReady;
  const b = req.body || {};
  if (!b.routine_date || !b.note_text || !b.group_name) {
    return res.status(400).json({ success: false, message: 'Date, group and note text are required' });
  }
  const user = (await pool.query('SELECT full_name, login_id FROM users WHERE id=$1', [req.user.userId])).rows[0];
  const userName = user?.full_name || user?.login_id || 'Checker';
  const q = await pool.query(`
    INSERT INTO routine_review_notes(group_name, routine_date, note_text, target_class, target_period, created_by, created_by_name)
    VALUES($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [b.group_name, b.routine_date, String(b.note_text).trim(), b.target_class || null, b.target_period || null, req.user.userId, userName]);
  res.status(201).json({ success: true, note: q.rows[0] });
}));

router.patch('/review-notes/:id/resolve', auth, allow('super_admin','admin'), asyncHandler(async(req, res) => {
  await reviewNotesSchemaReady;
  const user = (await pool.query('SELECT full_name, login_id FROM users WHERE id=$1', [req.user.userId])).rows[0];
  const userName = user?.full_name || user?.login_id || 'Admin';
  const q = await pool.query(`
    UPDATE routine_review_notes 
    SET status = 'resolved', resolved_by = $1, resolved_by_name = $2, resolved_at = NOW()
    WHERE id = $3
    RETURNING *
  `, [req.user.userId, userName, req.params.id]);
  if (!q.rowCount) return res.status(404).json({ success: false, message: 'Note not found' });
  res.json({ success: true, note: q.rows[0] });
}));

router.delete('/review-notes/:id', auth, allow('super_admin','admin'), asyncHandler(async(req, res) => {
  await reviewNotesSchemaReady;
  await pool.query('DELETE FROM routine_review_notes WHERE id = $1', [req.params.id]);
  res.json({ success: true, message: 'Note deleted' });
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
