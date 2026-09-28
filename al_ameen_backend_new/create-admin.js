require('dotenv').config();
const bcrypt=require('bcryptjs');
const pool=require('./src/db');

(async()=>{
  try{
    const loginId=process.env.ADMIN_LOGIN_ID||'superadmin';
    const password=process.env.ADMIN_PASSWORD;
    const fullName=process.env.ADMIN_NAME||'Super Admin';
    if(!password) throw new Error('ADMIN_PASSWORD missing in .env');
    const hash=await bcrypt.hash(password,12);
    await pool.query(`INSERT INTO users(login_id,password_hash,full_name,role,is_active) VALUES($1,$2,$3,'super_admin',TRUE)
      ON CONFLICT(login_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,full_name=EXCLUDED.full_name,role='super_admin',is_active=TRUE,updated_at=NOW()`,[loginId,hash,fullName]);
    console.log('SUPER ADMIN CREATED SUCCESSFULLY');
    console.log('Login ID:',loginId);
  }catch(e){console.error('FULL ERROR:',e);}finally{await pool.end();}
})();
