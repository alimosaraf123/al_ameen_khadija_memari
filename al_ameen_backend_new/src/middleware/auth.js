const jwt=require('jsonwebtoken');
const pool=require('../db');
async function auth(req,res,next){
 const header=req.headers.authorization||'',token=header.startsWith('Bearer ')?header.slice(7):null;
 if(!token)return res.status(401).json({success:false,message:'Unauthorized'});
 try{
  const user=jwt.verify(token,process.env.JWT_SECRET);
  if(user.role==='guardian'){
   if(!user.jti)return res.status(401).json({success:false,message:'Please login again on this device'});
   const q=await pool.query(`SELECT 1 FROM guardian_login_sessions WHERE user_id=$1 AND token_jti=$2 AND is_active=TRUE AND expires_at>NOW()`,[user.userId,user.jti]);
   if(!q.rowCount)return res.status(401).json({success:false,message:'This device session is no longer active. Please login again.'});
  }
  req.user=user;next();
 }catch(e){return res.status(401).json({success:false,message:'Invalid or expired token'});}
}
function allow(...roles){return(req,res,next)=>{if(!req.user||!roles.includes(req.user.role))return res.status(403).json({success:false,message:'Forbidden'});next();};}
module.exports={auth,allow};
