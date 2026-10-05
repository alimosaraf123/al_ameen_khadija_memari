const { randomInt } = require('crypto');
const bcrypt = require('bcryptjs');
const {saveTemporaryPassword}=require('./guardianTemporaryCredentials');
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function generateGuardianPassword() {
  return Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]).join('');
}
async function revokeGuardianAccess(client, userId) {
  await client.query('UPDATE guardian_login_sessions SET is_active=FALSE,logged_out_at=NOW() WHERE user_id=$1', [userId]);
  await client.query('UPDATE guardian_device_tokens SET is_active=FALSE WHERE user_id=$1', [userId]);
}
async function resetAllGuardianPasswords(pool,{createMissing=false,onProgress=()=>{}}={}) {
 const client=await pool.connect();let created=0;
 try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('guardian-bulk-passwords'))");
  if(createMissing){
   const missing=await client.query("SELECT s.* FROM students s WHERE NOT EXISTS(SELECT 1 FROM student_guardians sg WHERE sg.student_id=s.id) ORDER BY s.id");
   for(const student of missing.rows){
    const login=String(student.registration_no||'').trim();if(!login)throw new Error('Every student needs a registration number');
    let guardian=(await client.query("SELECT u.role,g.id FROM users u LEFT JOIN guardian_profiles g ON g.user_id=u.id WHERE u.login_id=$1 FOR UPDATE OF u",[login])).rows[0];
    if(guardian&&(guardian.role!=='guardian'||!guardian.id))throw new Error('A student registration number is already used by another account');
    if(!guardian){
     const name=student.guardian_name||student.father_name||student.mother_name||'Guardian of '+student.student_name;
     const user=(await client.query("INSERT INTO users(login_id,password_hash,full_name,role,password_change_required) VALUES($1,'pending-bulk-setup',$2,'guardian',TRUE) RETURNING id",[login,name])).rows[0];
     guardian=(await client.query("INSERT INTO guardian_profiles(user_id,guardian_name,mobile,alternate_mobile,email) VALUES($1,$2,$3,$4,$5) RETURNING id",[user.id,name,student.whatsapp_number||student.guardian_mobile||student.father_mobile||student.mobile_number||null,student.alternate_mobile||null,student.email||null])).rows[0];created++;
    }
    await client.query("INSERT INTO student_guardians(student_id,guardian_id,relation_type,is_primary) VALUES($1,$2,'Guardian',TRUE) ON CONFLICT(student_id,guardian_id) DO NOTHING",[student.id,guardian.id]);
   }
  }
  const result=await client.query("SELECT u.id,u.login_id FROM users u JOIN guardian_profiles g ON g.user_id=u.id WHERE u.role='guardian' ORDER BY u.id FOR UPDATE OF u");
  const credentials=[],updates=[];
  for(const user of result.rows){
   const password=generateGuardianPassword(),hash=await bcrypt.hash(password,12);
   updates.push({id:user.id,hash});credentials.push({user_id:user.id,login_id:user.login_id,password});
   onProgress(credentials.length,result.rows.length);
  }
  await client.query("UPDATE users u SET password_hash=x.hash,password_change_required=TRUE,mpin_hash=NULL FROM jsonb_to_recordset($1::jsonb) AS x(id bigint,hash text) WHERE u.id=x.id",[JSON.stringify(updates)]);
  const ids=result.rows.map(x=>x.id);
  await client.query('UPDATE guardian_login_sessions SET is_active=FALSE,logged_out_at=NOW() WHERE user_id=ANY($1::bigint[])',[ids]);
  await client.query('UPDATE guardian_device_tokens SET is_active=FALSE WHERE user_id=ANY($1::bigint[])',[ids]);
  const {encryptTemporaryPassword}=require('./guardianTemporaryCredentials');
  const encrypted=credentials.map(x=>({id:x.user_id,value:encryptTemporaryPassword(x.password,x.user_id)}));
  await client.query("INSERT INTO guardian_temporary_credentials(user_id,encrypted_password,expires_at) SELECT x.id,x.value,'infinity'::timestamptz FROM jsonb_to_recordset($1::jsonb) AS x(id bigint,value text) ON CONFLICT(user_id) DO UPDATE SET encrypted_password=EXCLUDED.encrypted_password,expires_at=EXCLUDED.expires_at,created_at=NOW()",[JSON.stringify(encrypted)]);
  await client.query('COMMIT');
  return {created,count:credentials.length,credentials:credentials.map(({login_id,password})=>({login_id,password}))};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
module.exports={generateGuardianPassword,revokeGuardianAccess,resetAllGuardianPasswords};
