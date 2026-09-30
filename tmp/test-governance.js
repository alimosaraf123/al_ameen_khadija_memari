require('dotenv').config();
const jwt=require('jsonwebtoken'),pool=require('./src/db');
(async()=>{
 const q=await pool.query("select id,login_id,role from users where role in ('super_admin','admin') order by case when role='super_admin' then 0 else 1 end,id");
 const su=q.rows.find(x=>x.role==='super_admin'),ad=q.rows.find(x=>x.login_id==='nasmin')||q.rows.find(x=>x.role==='admin');
 if(!su||!ad) throw Error('Required test roles not found');
 const token=x=>jwt.sign({userId:x.id,loginId:x.login_id,role:x.role},process.env.JWT_SECRET,{expiresIn:'5m'});
 async function t(label,path,user,method='GET'){
  const z=await fetch('http://127.0.0.1:3000'+path,{method,headers:{Authorization:'Bearer '+token(user)}});
  const body=await z.text(); console.log(label+': '+z.status+' '+body.slice(0,120).replace(/\s+/g,' '));
 }
 await t('super admins','/api/system-admin/admins',su);
 await t('super settings','/api/system-admin/settings',su);
 await t('super audit','/api/system-admin/audit',su);
 await t('admin admins denied','/api/system-admin/admins',ad);
 await t('admin settings denied','/api/system-admin/settings',ad);
 await t('admin backup denied','/api/system-admin/backup',ad);
 await t('admin own audit','/api/system-admin/audit',ad);
 await t('admin delete denied','/api/system-admin/nothing',ad,'DELETE');
 await pool.end();
})().catch(async e=>{console.error(e);await pool.end();process.exit(1)});