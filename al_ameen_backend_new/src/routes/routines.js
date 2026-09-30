const express=require('express');
const pool=require('../db');
const {auth,allow}=require('../middleware/auth');
const asyncHandler=require('../utils/asyncHandler');
const router=express.Router();
const GROUPS=['v_x','xi_xii','coaching'];
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));

router.get('/',auth,asyncHandler(async(req,res)=>{
 const r=await pool.query('SELECT * FROM routines WHERE is_active=TRUE ORDER BY published_at DESC');
 res.json({success:true,routines:r.rows});
}));
router.post('/',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const b=req.body||{},r=await pool.query('INSERT INTO routines(title,routine_date,routine_text,file_url,published_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[b.title||null,b.routine_date||null,b.routine_text||null,b.file_url||null,req.user.userId]);
 res.status(201).json({success:true,routine:r.rows[0]});
}));

router.get('/manager',auth,asyncHandler(async(req,res)=>{
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

router.get('/manager/history',auth,asyncHandler(async(req,res)=>{
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
   rows.push(item);const old=totals.get(item.teacher_id)||{teacher_id:item.teacher_id,teacher_name:item.teacher_name,class_count:0};old.class_count++;totals.set(item.teacher_id,old);
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
 res.json({success:true,routine:r.rows[0],message:isMaster?'Weekday Master routine saved':'Final routine published'});
}));

router.delete('/manager/:id',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const r=await pool.query('DELETE FROM routine_manager_grids WHERE id=$1 RETURNING id',[req.params.id]);
 if(!r.rowCount)return res.status(404).json({success:false,message:'Routine not found'});
 res.json({success:true,message:'Routine deleted'});
}));
module.exports=router;
