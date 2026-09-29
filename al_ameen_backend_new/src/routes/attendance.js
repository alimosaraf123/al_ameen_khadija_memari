const express=require('express');
const pool=require('../db');
const {auth,allow}=require('../middleware/auth');
const asyncHandler=require('../utils/asyncHandler');
const router=express.Router();
async function findRoomId(roomNumber){
 const rooms=(await pool.query('SELECT id,room_name FROM rooms')).rows;
 const value=String(roomNumber||'').trim().toLowerCase();
 const room=rooms.find(item=>String(item.room_name).trim().toLowerCase()===value||String(item.room_name).trim().toLowerCase()==='room '+value);
 return room?.id||null;
}
router.get('/room/:roomNumber',auth,allow('super_admin','admin','teacher'),asyncHandler(async(req,res)=>{
 const roomId=await findRoomId(req.params.roomNumber);
 if(!roomId)return res.status(404).json({success:false,message:'Room number not found'});
 const date=req.query.date||new Date().toISOString().slice(0,10);
 const r=await pool.query("SELECT s.id,s.registration_no,s.student_name,s.class_name,s.roll_no,COALESCE(a.status,'present') status,a.remarks FROM students s LEFT JOIN attendance a ON a.student_id=s.id AND a.attendance_date=$2 WHERE s.room_id=$1 AND s.is_active=TRUE ORDER BY s.class_name,s.roll_no,s.student_name",[roomId,date]);
 res.json({success:true,date,students:r.rows});
}));
router.post('/batch',auth,allow('super_admin','admin','teacher'),asyncHandler(async(req,res)=>{
 const {room_number,attendance_date,entries}=req.body;
 if(!room_number||!attendance_date||!Array.isArray(entries))return res.status(400).json({success:false,message:'room_number, attendance_date and entries required'});
 const roomId=await findRoomId(room_number);
 if(!roomId)return res.status(400).json({success:false,message:'Room number not found'});
 const client=await pool.connect();
 try{await client.query('BEGIN');for(const e of entries){await client.query("INSERT INTO attendance(student_id,room_id,attendance_date,status,remarks,marked_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(student_id,attendance_date) DO UPDATE SET room_id=EXCLUDED.room_id,status=EXCLUDED.status,remarks=EXCLUDED.remarks,marked_by=EXCLUDED.marked_by,updated_at=NOW()",[e.student_id,roomId,attendance_date,e.status||'present',e.remarks||null,req.user.userId]);}await client.query('COMMIT');res.json({success:true});}
 catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
module.exports=router;
