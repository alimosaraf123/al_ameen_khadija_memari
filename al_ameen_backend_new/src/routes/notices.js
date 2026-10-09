const express=require('express');const {sendPushForNotice}=require('../utils/pushNotifications');const multer=require('multer');const sharp=require('sharp');const {uploadBuffer}=require('../utils/cloudStorage');const pool=require('../db');const {auth,allow}=require('../middleware/auth');const asyncHandler=require('../utils/asyncHandler');const router=express.Router();
router.get('/',auth,asyncHandler(async(req,res)=>{const admin=['admin','super_admin'].includes(req.user.role);const r=await pool.query(`SELECT n.* FROM notices n WHERE n.is_active=TRUE AND ($1::boolean=TRUE OR EXISTS(SELECT 1 FROM notice_targets nt WHERE nt.notice_id=n.id AND (nt.target_type='all' OR (nt.target_type='role' AND nt.target_value=$2)))) ORDER BY n.published_at DESC`,[admin,req.user.role]);res.json({success:true,notices:r.rows});}));
router.post('/',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{const b=req.body;const client=await pool.connect();try{await client.query('BEGIN');const n=await client.query(`INSERT INTO notices(title,notice_text,notice_type,attachment_url,published_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[b.title,b.notice_text||null,b.notice_type||null,b.attachment_url||null,req.user.userId]);const targets=Array.isArray(b.targets)&&b.targets.length?b.targets:[{target_type:'all',target_value:null}];for(const t of targets){await client.query(`INSERT INTO notice_targets(notice_id,target_type,target_value) VALUES($1,$2,$3)`,[n.rows[0].id,t.target_type,t.target_value||null]);}await client.query('COMMIT');sendPushForNotice(n.rows[0].id).catch(error=>console.error('Push notification failed:',error.message));res.status(201).json({success:true,notice:n.rows[0]});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}));

const imageUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024}}).single('image');
router.post('/image',auth,allow('super_admin','admin'),(req,res,next)=>imageUpload(req,res,error=>error?res.status(400).json({success:false,message:'JPG must be under 5 MB'}):next()),asyncHandler(async(req,res)=>{if(!req.file||!['image/jpeg','image/jpg'].includes(req.file.mimetype))return res.status(400).json({success:false,message:'Choose a JPG image'});const compressed=await sharp(req.file.buffer).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82,effort:4}).toBuffer();const uploaded=await uploadBuffer(compressed,{folder:'al-ameen/notices',resourceType:'image',format:'webp'});res.json({success:true,url:uploaded.url});}));

router.get('/counter',auth,asyncHandler(async(req,res)=>{
 const admin=['admin','super_admin'].includes(req.user.role);
 const r=await pool.query(`SELECT COUNT(*)::int unread FROM notices n WHERE n.is_active=TRUE AND ($1::boolean=TRUE OR EXISTS(SELECT 1 FROM notice_targets nt WHERE nt.notice_id=n.id AND (nt.target_type='all' OR (nt.target_type='role' AND nt.target_value=$2)))) AND NOT EXISTS(SELECT 1 FROM notification_reads nr WHERE nr.notice_id=n.id AND nr.user_id=$3)`,[admin,req.user.role,req.user.userId]);
 res.json({success:true,unread:r.rows[0].unread});
}));
router.post('/read-all',auth,asyncHandler(async(req,res)=>{
 const admin=['admin','super_admin'].includes(req.user.role);
 await pool.query(`INSERT INTO notification_reads(user_id,notice_id) SELECT $1,n.id FROM notices n WHERE n.is_active=TRUE AND ($2::boolean=TRUE OR EXISTS(SELECT 1 FROM notice_targets nt WHERE nt.notice_id=n.id AND (nt.target_type='all' OR (nt.target_type='role' AND nt.target_value=$3)))) ON CONFLICT DO NOTHING`,[req.user.userId,admin,req.user.role]);
 res.json({success:true});
}));

router.get('/admin-counter',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const r=await pool.query("SELECT COUNT(*)::int unread FROM notices n WHERE n.is_active=TRUE AND (n.notice_type='urgent' OR EXISTS(SELECT 1 FROM notice_targets nt WHERE nt.notice_id=n.id AND nt.target_type='role' AND nt.target_value='admin')) AND NOT EXISTS(SELECT 1 FROM notification_reads nr WHERE nr.notice_id=n.id AND nr.user_id=$1)",[req.user.userId]);
 res.json({success:true,unread:r.rows[0].unread});
}));
router.post('/read-all',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 await pool.query("INSERT INTO notification_reads(user_id,notice_id) SELECT $1,n.id FROM notices n WHERE n.is_active=TRUE AND (n.notice_type='urgent' OR EXISTS(SELECT 1 FROM notice_targets nt WHERE nt.notice_id=n.id AND nt.target_type='role' AND nt.target_value='admin')) ON CONFLICT DO NOTHING",[req.user.userId]);
 res.json({success:true});
}));
module.exports=router;
