const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'routes', 'servicePanels.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add imports if not present
if (!code.includes("multer=require('multer')")) {
  code = code.replace(
    "const express=require('express'),bcrypt=require('bcryptjs'),pool=require('../db');\r\nconst{auth,allow}=require('../middleware/auth');const asyncHandler=require('../utils/asyncHandler');const router=express.Router();",
    "const express=require('express'),bcrypt=require('bcryptjs'),pool=require('../db'),multer=require('multer'),sharp=require('sharp');\r\nconst{auth,allow}=require('../middleware/auth');const asyncHandler=require('../utils/asyncHandler');\r\nconst{uploadBuffer,deleteCloudinaryUrl}=require('../utils/cloudStorage');\r\nconst router=express.Router();\r\nconst photoUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024}}).single('photo');"
  );
  // Also try LF if CRLF wasn't matched
  code = code.replace(
    "const express=require('express'),bcrypt=require('bcryptjs'),pool=require('../db');\nconst{auth,allow}=require('../middleware/auth');const asyncHandler=require('../utils/asyncHandler');const router=express.Router();",
    "const express=require('express'),bcrypt=require('bcryptjs'),pool=require('../db'),multer=require('multer'),sharp=require('sharp');\nconst{auth,allow}=require('../middleware/auth');const asyncHandler=require('../utils/asyncHandler');\nconst{uploadBuffer,deleteCloudinaryUrl}=require('../utils/cloudStorage');\nconst router=express.Router();\nconst photoUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024}}).single('photo');"
  );
}

// 2. Ensure photo_url column in schema
if (!code.includes("ALTER TABLE service_staff_profiles ADD COLUMN IF NOT EXISTS photo_url TEXT")) {
  code = code.replace(
    "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());",
    "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());\nALTER TABLE service_staff_profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;\nALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;"
  );
}

// 3. Include photo_url in router.get('/staff', ...)
code = code.replace(
  "SELECT p.*,u.login_id,u.role,u.is_active FROM service_staff_profiles p JOIN users u ON u.id=p.user_id ORDER BY p.staff_role,p.name",
  "SELECT p.*,u.login_id,u.role,u.is_active,COALESCE(p.photo_url,u.photo_url) photo_url FROM service_staff_profiles p JOIN users u ON u.id=p.user_id ORDER BY p.staff_role,p.name"
);

// 4. In router.patch('/staff/:id'), support photo_url update
if (!code.includes("if(b.photo_url!==undefined)")) {
  code = code.replace(
    "if(newName){await pool.query('UPDATE users SET full_name=$1 WHERE id=$2',[newName,p.user_id])}}",
    "if(newName){await pool.query('UPDATE users SET full_name=$1 WHERE id=$2',[newName,p.user_id])}}if(b.photo_url!==undefined){await pool.query('UPDATE service_staff_profiles SET photo_url=$1 WHERE id=$2',[b.photo_url||null,p.id]);await pool.query('UPDATE users SET photo_url=$1 WHERE id=$2',[b.photo_url||null,p.user_id]);}"
  );
}

// 5. Add photo upload and photo remove endpoints after router.patch('/staff/:id', ...)
const photoEndpoints = `
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
`;

if (!code.includes("router.post('/staff/:id/photo'")) {
  const target = "res.json({success:true})}));";
  const pos = code.indexOf(target);
  if (pos !== -1) {
    code = code.slice(0, pos + target.length) + "\n" + photoEndpoints + "\n" + code.slice(pos + target.length);
  } else {
    console.error('Target position for photoEndpoints not found');
  }
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully patched servicePanels.js');
